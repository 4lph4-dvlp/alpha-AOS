import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseOwnershipResolution,
  planMigrationOperation,
  applyMigrationOperation,
  updateMarkerBoundary,
  createSafeUserBackup,
  type MigrationCandidate,
} from "../src/core/migrate.js";
import { readToolRecordStore } from "../src/core/tool-records.js";
import { resolveAcceptedToolRecord } from "../src/core/tool-bindings.js";

test("Task 2: parseOwnershipResolution parses valid comma-separated tool=owner pairs", () => {
  assert.deepEqual(parseOwnershipResolution(undefined), {});
  assert.deepEqual(parseOwnershipResolution(""), {});
  assert.deepEqual(parseOwnershipResolution("   "), {});

  const parsed = parseOwnershipResolution("cua=external,gsd=alpha-aos");
  assert.deepEqual(parsed, {
    "cua-driver": "external",
    gsd: "alpha-aos",
  });

  const parsedDirect = parseOwnershipResolution("cua-driver=alpha-aos,mcp:context7=external");
  assert.deepEqual(parsedDirect, {
    "cua-driver": "alpha-aos",
    "mcp:context7": "external",
  });

  assert.throws(() => parseOwnershipResolution("invalid-format"), /Invalid --resolve-ownership format/);
  assert.throws(() => parseOwnershipResolution("gsd=invalidOwner"), /Invalid owner 'invalidOwner'/);
});

test("Task 2: Ambiguous candidate without --resolve-ownership fails closed and directs user to provide resolution", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-ambiguous-test-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });

    const ambiguousCandidate: MigrationCandidate = {
      toolId: "cua-driver",
      version: "0.38.0",
      sourceId: "driver-release",
      sourceUrl: "https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.38.0/cua.zip",
      artifact: "cua.zip",
      platform: "windows",
      architecture: "x64",
      artifactDigest: "5edaa74d0afa1b55a9668dbc4f32736507bd2bd4d75b18ca1dc8881bb12402b5",
      path: join(stateRoot, "ambiguous-path"),
      pathAlias: "cua-driver",
      status: "ambiguous",
      reason: "multiple-unverified-candidates",
      ownership: "unknown",
    };

    // 1. Without resolveOwnership -> throws with guidance
    await assert.rejects(
      async () => {
        await planMigrationOperation({
          stateRoot,
          packageRoot,
          simulatedCandidates: [ambiguousCandidate],
        });
      },
      (err: Error) => {
        assert.match(err.message, /Ambiguous candidate ownership detected for cua-driver/);
        assert.match(err.message, /--resolve-ownership cua-driver=<alpha-aos\|external>/);
        return true;
      },
    );

    // 2. With resolveOwnership -> succeeds and resolves ownership
    const resolvedPlan = await planMigrationOperation({
      stateRoot,
      packageRoot,
      simulatedCandidates: [ambiguousCandidate],
      resolveOwnership: { "cua-driver": "external" },
    });

    assert.equal(resolvedPlan.candidates.length, 1);
    const candidate = resolvedPlan.candidates[0]!;
    assert.equal(candidate.ownership, "external");
    assert.equal(candidate.status, "ready");
    assert.equal(candidate.reason, "ownership-resolved-to-external");

    // 3. Apply migration with resolved ownership
    const applyResult = await applyMigrationOperation({
      stateRoot,
      packageRoot,
      planDigest: resolvedPlan.planDigest,
      reviewedPlanToken: resolvedPlan.reviewedPlanToken,
    });

    assert.equal(applyResult.applied, true);

    // Verify record in tool-record-store reflects prior external ownership
    const store = await readToolRecordStore({ stateRoot, packageRoot });
    const cuaResult = store.events.find((e) => e.result?.toolId === "cua-driver")?.result;
    assert.ok(cuaResult);
    assert.equal(cuaResult.legacy?.priorInstallationOwner, "external");

    // Verify SSOT lookup
    const accepted = await resolveAcceptedToolRecord("cua-driver", { stateRoot, packageRoot });
    assert.equal(accepted.toolId, "cua-driver");
    assert.equal(accepted.version, "0.38.0");
    assert.equal(accepted.legacy?.priorInstallationOwner, "external");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 2: Harness config marker boundary selective preservation preserves custom user MCP entries and creates .user-backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-marker-preservation-"));
  try {
    const configPath = join(root, "config.toml");
    const initialConfig = `# User's own custom settings
[profile]
name = "personal-dev"

[mcp_servers.my_custom_server]
command = "npx"
args = ["-y", "@custom/server"]

# alpha-aos:start mcp
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
# alpha-aos:end mcp

[mcp_servers.another_user_tool]
command = "python"
args = ["-m", "custom_tool"]
`;

    await writeFile(configPath, initialConfig, "utf8");

    const newManagedContent = `[mcp_servers.context7]
command = "node"
args = ["/new/path/to/context7/index.js"]
[mcp_servers.exa]
command = "node"
args = ["/new/path/to/exa/index.js"]`;

    // 1. Update marker boundary
    const { updatedContent, modifiedOutsideMarkers } = updateMarkerBoundary(initialConfig, newManagedContent);

    assert.equal(modifiedOutsideMarkers, true);
    // Custom user content before markers is preserved bit-for-bit
    assert.ok(updatedContent.includes('[profile]\nname = "personal-dev"'));
    assert.ok(updatedContent.includes('[mcp_servers.my_custom_server]\ncommand = "npx"'));
    // Custom user content after markers is preserved bit-for-bit
    assert.ok(updatedContent.includes('[mcp_servers.another_user_tool]\ncommand = "python"'));
    // Managed content between markers is updated
    assert.ok(updatedContent.includes("/new/path/to/context7/index.js"));
    assert.ok(updatedContent.includes("/new/path/to/exa/index.js"));
    // Old managed content is removed
    assert.ok(!updatedContent.includes('@upstash/context7-mcp"'));

    // 2. Modified content triggers safe backup
    if (modifiedOutsideMarkers) {
      const backupPath = await createSafeUserBackup(configPath);
      assert.match(backupPath, /\.user-backup$/);
      const backupContent = await readFile(backupPath, "utf8");
      assert.equal(backupContent, initialConfig);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
