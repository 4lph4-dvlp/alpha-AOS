import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveAcceptedToolRecord,
  assertAcceptedToolRecord,
} from "../src/core/tool-bindings.js";
import {
  planToolRecordOperation,
  withToolRecordSession,
  beginToolOperation,
  appendToolResult,
  finishToolOperation,
} from "../src/core/tool-record-store.js";
import { planMcpSync } from "../src/core/mcp.js";
import type { StackLock } from "../src/types.js";

test("Task 1 SSOT: resolveAcceptedToolRecord returns active accepted record with verified metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-ssot-success-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });

    // Seed an accepted tool record in tool-record-store
    const operationId = "op-ssot-test";
    const occurredAt = new Date().toISOString();
    const requests = [
      { toolId: "gsd", selector: "1.20.0", exact: true },
      { toolId: "cua-driver", selector: "0.40.0", exact: true },
    ];

    const plan = await planToolRecordOperation({
      stateRoot,
      packageRoot,
      operationId,
      occurredAt,
      requests,
    });

    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);

      // GSD result
      await appendToolResult(plan, session, {
        toolId: "gsd",
        requested: { toolId: "gsd", selector: "1.20.0", exact: true },
        resolved: {
          release: "1.20.0",
          artifact: "gsd.tgz",
          platform: "windows",
          architecture: "x64",
          digest: "a".repeat(64),
          sourceId: "npm-registry",
          sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core",
        },
        installed: {
          installationId: "gsd-1.20.0",
          version: "1.20.0",
          pathAlias: "gsd",
        },
        verified: "proof-gsd",
        evidence: [
          {
            proofId: "proof-gsd",
            subject: "gsd-1.20.0",
            target: "integration",
            method: "invocation",
            result: "pass",
            platform: "windows",
            architecture: "x64",
            harness: "codex",
            fingerprint: "a".repeat(64),
          },
        ],
        outcome: "succeeded",
      });

      // Cua-driver result
      await appendToolResult(plan, session, {
        toolId: "cua-driver",
        requested: { toolId: "cua-driver", selector: "0.40.0", exact: true },
        resolved: {
          release: "0.40.0",
          artifact: "cua-binary.zip",
          platform: "windows",
          architecture: "x64",
          digest: "b".repeat(64),
          sourceId: "driver-release",
          sourceUrl: "https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.40.0/cua-binary.zip",
        },
        installed: {
          installationId: "cua-driver-0.40.0",
          version: "0.40.0",
          pathAlias: "cua-driver",
        },
        verified: "proof-cua",
        evidence: [
          {
            proofId: "proof-cua",
            subject: "cua-driver-0.40.0",
            target: "integration",
            method: "invocation",
            result: "pass",
            platform: "windows",
            architecture: "x64",
            harness: "codex",
            fingerprint: "b".repeat(64),
          },
        ],
        outcome: "succeeded",
      });

      await finishToolOperation(plan, session, [
        { toolId: "gsd", installationId: "gsd-1.20.0", proofId: "proof-gsd", priorDigest: null },
        { toolId: "cua-driver", installationId: "cua-driver-0.40.0", proofId: "proof-cua", priorDigest: null },
      ]);
    });

    // Verify resolveAcceptedToolRecord
    const gsd = await resolveAcceptedToolRecord("gsd", { stateRoot, packageRoot });
    assert.equal(gsd.toolId, "gsd");
    assert.equal(gsd.version, "1.20.0");
    assert.equal(gsd.installationId, "gsd-1.20.0");
    assert.equal(gsd.sourceUrl, "https://registry.npmjs.org/@opengsd/gsd-core");

    const cua = await assertAcceptedToolRecord("cua-driver", { stateRoot, packageRoot });
    assert.equal(cua.toolId, "cua-driver");
    assert.equal(cua.version, "0.40.0");
    assert.equal(cua.installationId, "cua-driver-0.40.0");
    assert.equal(cua.digest, "b".repeat(64));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 1 SSOT: Missing tool record throws fail-closed error with migration/installation guidance", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-ssot-fail-guidance-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });

    // Store is absent
    await assert.rejects(
      async () => {
        await resolveAcceptedToolRecord("mcp:context7", { stateRoot, packageRoot });
      },
      (err: Error) => {
        assert.match(err.message, /No accepted tool records found for 'mcp:context7'/);
        assert.match(err.message, /alpha-aos migrate/);
        assert.match(err.message, /alpha-aos install/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 1 SSOT: planMcpSync in src/core/mcp.ts successfully builds McpSyncPlan using accepted record version without reading computer-use-runtime.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-mcp-ssot-test-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });

    // Seed accepted tool record for cua-driver
    const operationId = "op-cua-sync-test";
    const occurredAt = new Date().toISOString();
    const requests = [{ toolId: "cua-driver", selector: "0.42.0", exact: true }];

    const opPlan = await planToolRecordOperation({
      stateRoot,
      packageRoot,
      operationId,
      occurredAt,
      requests,
    });

    await withToolRecordSession(opPlan, async (session) => {
      await beginToolOperation(opPlan, session);
      await appendToolResult(opPlan, session, {
        toolId: "cua-driver",
        requested: { toolId: "cua-driver", selector: "0.42.0", exact: true },
        resolved: {
          release: "0.42.0",
          artifact: "cua-driver-0.42.0.zip",
          platform: "windows",
          architecture: "x64",
          digest: "c".repeat(64),
          sourceId: "driver-release",
          sourceUrl: "https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.42.0/cua-driver-0.42.0.zip",
        },
        installed: {
          installationId: "cua-driver-0.42.0",
          version: "0.42.0",
          pathAlias: "cua-driver",
        },
        verified: "proof-cua-42",
        evidence: [
          {
            proofId: "proof-cua-42",
            subject: "cua-driver-0.42.0",
            target: "integration",
            method: "invocation",
            result: "pass",
            platform: "windows",
            architecture: "x64",
            harness: "codex",
            fingerprint: "c".repeat(64),
          },
        ],
        outcome: "succeeded",
      });
      await finishToolOperation(opPlan, session, [
        { toolId: "cua-driver", installationId: "cua-driver-0.42.0", proofId: "proof-cua-42", priorDigest: null },
      ]);
    });

    const mockLock: StackLock = {
      schemaVersion: 1,
      channel: "stable",
      generatedAt: occurredAt,
      components: {
        gsd: { package: "@opengsd/gsd-core", version: "1.18.0", integrity: "sha512-test", profile: "full" },
        ecc: { package: "ecc-universal", version: "2.2.3", integrity: "sha512-test", skills: [], sourceSha256: {}, targetSha256: {} },
        mcp: {
          context7: { package: "@upstash/context7-mcp", version: "4.4.4", integrity: "sha512-test" },
          exa: { package: "exa-mcp-server", version: "3.4.2", integrity: "sha512-test" },
          firecrawl: { package: "firecrawl-mcp", version: "3.34.1", integrity: "sha512-test" },
        },
      },
    };

    const configPath = join(root, "config.toml");
    await writeFile(configPath, "", "utf8");

    // Build MCP sync plan with stateRoot
    const plan = await planMcpSync("codex", mockLock, {
      configPath,
      stateRoot,
      packageRoot,
      selected: ["context7"],
    });

    // Verify nativeCua version matches accepted record (0.42.0), NOT static seed
    assert.equal(plan.nativeCua.version, "0.42.0");

    // Verify that packageRoot/catalog/computer-use-runtime.json was NOT created or required
    const runtimeJsonPath = join(packageRoot, "catalog", "computer-use-runtime.json");
    let runtimeFileExists = false;
    try {
      await readFile(runtimeJsonPath);
      runtimeFileExists = true;
    } catch {
      runtimeFileExists = false;
    }
    assert.equal(runtimeFileExists, false, "computer-use-runtime.json should not exist or be accessed in clean packageRoot");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
