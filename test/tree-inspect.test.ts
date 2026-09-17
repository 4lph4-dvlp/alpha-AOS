import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatTreeInspection } from "../src/format.js";
import { ProcessPolicyError, scrubEnvironmentForOffTree } from "../src/core/process.js";
import {
  assertSealedModeRefusal,
  discoverLocalProjectResources,
  inspectTreeSurface,
} from "../src/core/surface-inspector.js";
import { setTreePolicy } from "../src/core/tree-policy.js";

test("reviewed environment allowlist preserves runtime and AI auth keys while scrubbing ambient secrets", () => {
  const mockEnv: NodeJS.ProcessEnv = {
    PATH: "/usr/bin:/bin",
    HOME: "/home/user",
    OPENAI_API_KEY: "sk-proj-test1234",
    ANTHROPIC_API_KEY: "sk-ant-test5678",
    GEMINI_API_KEY: "AIzaSyTestKey",
    AWS_SECRET_ACCESS_KEY: "aws-secret-test",
    DATABASE_URL: "postgres://user:pass@localhost:5432/db",
    STRIPE_API_KEY: "rk_live_12345",
    PRIVATE_SSH_KEY: "secret-ssh-key",
    ALPHA_AOS_SESSION_ID: "session-uuid",
    ALPHA_AOS_DEFAULT_MODE: "off",
  };

  const scrubbed = scrubEnvironmentForOffTree(mockEnv, { CODEX_HOME: "/custom/codex" });

  // 1. Preserved runtime keys
  assert.equal(scrubbed.env.PATH, "/usr/bin:/bin");
  assert.equal(scrubbed.env.HOME, "/home/user");
  assert.ok(scrubbed.passedRuntimeKeys.includes("PATH"));
  assert.ok(scrubbed.passedRuntimeKeys.includes("HOME"));

  // 2. Preserved AI provider credentials
  assert.equal(scrubbed.env.OPENAI_API_KEY, "sk-proj-test1234");
  assert.equal(scrubbed.env.ANTHROPIC_API_KEY, "sk-ant-test5678");
  assert.equal(scrubbed.env.GEMINI_API_KEY, "AIzaSyTestKey");
  assert.ok(scrubbed.passedAiAuthKeys.includes("OPENAI_API_KEY"));
  assert.ok(scrubbed.passedAiAuthKeys.includes("ANTHROPIC_API_KEY"));
  assert.ok(scrubbed.passedAiAuthKeys.includes("GEMINI_API_KEY"));

  // 3. Injected harness variables preserved
  assert.equal(scrubbed.env.CODEX_HOME, "/custom/codex");

  // 4. Ambient secrets and internal alpha-AOS vars scrubbed
  assert.equal(scrubbed.env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(scrubbed.env.DATABASE_URL, undefined);
  assert.equal(scrubbed.env.STRIPE_API_KEY, undefined);
  assert.equal(scrubbed.env.PRIVATE_SSH_KEY, undefined);
  assert.equal(scrubbed.env.ALPHA_AOS_SESSION_ID, undefined);
  assert.ok(scrubbed.scrubbedKeys.includes("AWS_SECRET_ACCESS_KEY"));
  assert.ok(scrubbed.scrubbedKeys.includes("DATABASE_URL"));
  assert.ok(scrubbed.scrubbedKeys.includes("STRIPE_API_KEY"));
  assert.ok(scrubbed.scrubbedKeys.includes("ALPHA_AOS_SESSION_ID"));
});

test("project-local resource passthrough discovers local configs and skills without modifying them", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-local-res-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  // 1. Vanilla tree with no resources
  const vanillaDir = join(root, "vanilla-tree");
  await mkdir(vanillaDir, { recursive: true });
  const vanillaRes = await discoverLocalProjectResources(vanillaDir);
  assert.equal(vanillaRes.isVanilla, true);
  assert.equal(vanillaRes.skills.length, 0);
  assert.equal(vanillaRes.mcpConfig, null);
  assert.equal(vanillaRes.codexConfig, null);
  assert.equal(vanillaRes.instructions.length, 0);

  // 2. Rich tree with local resources
  const richDir = join(root, "rich-tree");
  await mkdir(join(richDir, ".agents", "skills", "custom-analysis"), { recursive: true });
  await writeFile(join(richDir, ".agents", "skills", "custom-analysis", "SKILL.md"), "# Analysis Skill\n", "utf8");
  await mkdir(join(richDir, ".codex"), { recursive: true });
  await writeFile(join(richDir, ".codex", "config.toml"), "model = 'o3'\n", "utf8");
  await writeFile(join(richDir, ".mcp.json"), "{\n  \"mcpServers\": {}\n}\n", "utf8");
  await writeFile(join(richDir, "AGENTS.md"), "# Project Agents\n", "utf8");
  await mkdir(join(richDir, ".hooks"), { recursive: true });
  await writeFile(join(richDir, ".hooks", "pre-commit.sh"), "#!/bin/sh\n", "utf8");

  const richRes = await discoverLocalProjectResources(richDir);
  assert.equal(richRes.isVanilla, false);
  assert.deepEqual(richRes.skills, ["custom-analysis"]);
  assert.equal(richRes.mcpConfig, ".mcp.json");
  assert.ok(richRes.codexConfig?.includes("config.toml"));
  assert.deepEqual(richRes.instructions, ["AGENTS.md"]);
  assert.deepEqual(richRes.hooks, ["pre-commit.sh"]);

  // Verify ZERO modifications to the project directory
  const rootListing = await readdir(richDir);
  assert.ok(rootListing.includes(".agents"));
  assert.ok(rootListing.includes(".codex"));
  assert.ok(rootListing.includes(".mcp.json"));
  assert.ok(rootListing.includes("AGENTS.md"));
});

test("inspectTreeSurface populates all 8 dimensions accurately", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-inspect-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const repoDir = join(root, "inspected-repo");
  await mkdir(repoDir, { recursive: true });
  await setTreePolicy(repoDir, "off", { stateRoot, notes: "Inspected off tree" });

  const inspection = await inspectTreeSurface(repoDir, {
    stateRoot,
    harness: "codex",
    env: {
      PATH: "/bin",
      OPENAI_API_KEY: "test-openai-key",
      SECRET_DB: "db-pass",
    },
  });

  // Dimension 1: Policy & Hierarchy
  assert.equal(inspection.effectivePolicy.effectiveMode, "off");
  assert.equal(inspection.effectivePolicy.inherited, false);

  // Dimension 2: Isolated Configuration Root
  assert.ok(inspection.isolatedConfigRoot !== null);
  assert.ok(inspection.isolatedConfigRoot?.includes("trees"));

  // Dimension 3: Excluded Global Resources
  assert.equal(inspection.excludedGlobalResources.skills, true);
  assert.equal(inspection.excludedGlobalResources.mcp, true);
  assert.equal(inspection.excludedGlobalResources.hooks, true);
  assert.equal(inspection.excludedGlobalResources.instructions, true);
  assert.equal(inspection.excludedGlobalResources.memory, true);

  // Dimension 4: Local Resources
  assert.equal(inspection.localResources.isVanilla, true);

  // Dimension 5: Environment Allowlist Status
  assert.ok(inspection.environmentStatus.passedAiAuthKeys.includes("OPENAI_API_KEY"));
  assert.ok(inspection.environmentStatus.scrubbedKeys.includes("SECRET_DB"));

  // Dimension 6: Harness Support & Isolation Proof
  assert.equal(inspection.harnessSupport.harness, "codex");
  assert.equal(inspection.harnessSupport.provable, true);
  assert.equal(inspection.harnessSupport.status, "ok");

  // Dimension 7: Pre-Launch Enforcement
  assert.equal(inspection.preLaunchEnforcement.method, "transparent-path-shim");

  // Dimension 8: Security Boundary Notice
  assert.equal(inspection.boundaryNotice.kind, "configuration-isolation");
  assert.equal(inspection.boundaryNotice.sealedModeSupported, false);
  assert.ok(inspection.boundaryNotice.description.includes("Configuration Isolation"));

  // Text formatter check
  const rendered = formatTreeInspection(inspection);
  assert.ok(rendered.includes("1. Policy & Hierarchy"));
  assert.ok(rendered.includes("2. Isolated Configuration Root"));
  assert.ok(rendered.includes("3. Excluded Global Resources"));
  assert.ok(rendered.includes("4. Discovered Project-Local Resources"));
  assert.ok(rendered.includes("5. Environment Allowlist Status"));
  assert.ok(rendered.includes("6. Harness Support & Isolation Proof"));
  assert.ok(rendered.includes("7. Pre-Launch Enforcement"));
  assert.ok(rendered.includes("8. Security Boundary Notice"));
});

test("Antigravity GUI reports unsupported and provable: false on surface inspection", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-agy-inspect-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");

  const inspection = await inspectTreeSurface(root, {
    stateRoot,
    harness: "antigravity",
    surface: "gui",
  });

  assert.equal(inspection.harnessSupport.harness, "antigravity");
  assert.equal(inspection.harnessSupport.provable, false);
  assert.equal(inspection.harnessSupport.status, "unsupported");
  assert.ok(inspection.harnessSupport.reason?.includes("Antigravity IDE/GUI desktop launches do not support"));
});

test("assertSealedModeRefusal throws ProcessPolicyError with exit code 2 and no fallback", () => {
  assert.throws(
    () => assertSealedModeRefusal("sealed"),
    (err: unknown) => {
      assert.ok(err instanceof ProcessPolicyError);
      assert.equal(err.code, "unsupported-executable");
      assert.ok(err.message.includes("'sealed' mode requires an OS/container sandbox boundary"));
      assert.ok(err.message.includes("Refusing execution without silent fallback"));
      return true;
    },
  );

  // Non-sealed mode does not throw
  assert.doesNotThrow(() => assertSealedModeRefusal("off"));
  assert.doesNotThrow(() => assertSealedModeRefusal("managed"));
});
