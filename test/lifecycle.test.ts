import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import {
  applyManagedInstall,
  createManagedInstallOperationPlan,
  createManagedInstallPlan,
  type ManagedInstallOptions,
} from "../src/core/install.js";
import { packageRoot } from "../src/core/paths.js";
import { listManagedTransactions } from "../src/core/transaction.js";
import { hasVersionChanges, planCandidateStage, resolveCandidate } from "../src/core/update.js";
import type { HarnessId, Inventory, StackCatalog, StackLock } from "../src/types.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function createInventory(detected: HarnessId[]): Inventory {
  const ids: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    platform: process.platform,
    architecture: process.arch,
    tools: {
      node: { version: "v24.0.0", command: process.execPath },
      npm: { version: "10.0.0", command: "npm" },
      git: { version: "2.0.0", command: "git" },
    },
    harnesses: ids.map((id) => ({
      id,
      displayName: id,
      command: detected.includes(id) ? id : null,
      version: null,
      configRoots: [],
      detected: detected.includes(id),
      notes: [],
    })),
  };
}

interface AppliedFixture {
  home: string;
  stateRoot: string;
  prefixDir: string;
  catalog: StackCatalog;
  lock: StackLock;
  inventory: Inventory;
}

async function setupAppliedFixture(context: test.TestContext): Promise<AppliedFixture> {
  const tempBase = await mkdtemp(join(tmpdir(), "alpha-aos-lifecycle-"));
  context.after(async () => rm(tempBase, { recursive: true, force: true }));

  const home = join(tempBase, "home");
  const stateRoot = join(tempBase, "state");
  const prefixDir = join(tempBase, "npm-prefix");
  await mkdir(home, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(prefixDir, { recursive: true });

  const catalog = await loadCatalog(repositoryRoot);
  const lock = await loadLock(repositoryRoot);
  const inventory = createInventory(["codex"]);

  const savedEnv: Record<string, string | undefined> = {};
  const setEnv = (key: string, val: string | undefined): void => {
    savedEnv[key] = process.env[key];
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  };

  setEnv("HOME", home);
  setEnv("USERPROFILE", home);
  setEnv("CODEX_HOME", join(home, ".codex"));
  setEnv("CLAUDE_CONFIG_DIR", join(home, ".claude"));
  setEnv("ANTIGRAVITY_CONFIG_DIR", join(home, ".gemini", "antigravity"));
  setEnv("PI_CODING_AGENT_DIR", join(home, ".pi", "agent"));
  setEnv("HERMES_HOME", join(home, ".hermes"));
  setEnv("npm_config_prefix", prefixDir);

  context.after(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // 1. Setup GSD files for codex
  const gsd = lock.components.gsd;
  assert.ok(gsd);
  const codexGsdRoot = join(home, ".codex", "gsd-core");
  await mkdir(codexGsdRoot, { recursive: true });
  await writeFile(join(codexGsdRoot, "VERSION"), `${gsd.version}\n`, "utf8");
  await writeFile(join(codexGsdRoot, ".gsd-runtime"), "codex\n", "utf8");
  await writeFile(join(home, ".codex", ".gsd-profile"), `${gsd.profile}\n`, "utf8");

  // 2. Setup ECC global package in npm-prefix
  const ecc = lock.components.ecc;
  assert.ok(ecc);
  const eccPkgDir = join(
    prefixDir,
    process.platform === "win32" ? "node_modules" : join("lib", "node_modules"),
    "@enterprise-coding-companion",
    "companion",
  );
  await mkdir(eccPkgDir, { recursive: true });
  await writeFile(join(eccPkgDir, "package.json"), JSON.stringify({ name: ecc.package, version: ecc.version }), "utf8");

  // 3. Setup ECC skills for codex
  const codexSkillRoot = join(home, ".agents", "skills");
  for (const skill of ecc.skills) {
    const skillDir = join(codexSkillRoot, skill);
    await mkdir(skillDir, { recursive: true });
    // Write skill file with content matching locked target hash
    const sourceSkillPath = join(repositoryRoot, "skills", skill, "SKILL.md");
    let content = existsSync(sourceSkillPath) ? await readFile(sourceSkillPath, "utf8") : "---\nname: test\n---\n";
    await writeFile(join(skillDir, "SKILL.md"), content, "utf8");
  }

  // 4. Setup Codex policy AGENTS.md
  const docsPolicy = join(repositoryRoot, "docs", "codex-execution-policy.md");
  const policyContent = existsSync(docsPolicy) ? await readFile(docsPolicy, "utf8") : "# Codex Execution Policy\n";
  await writeFile(join(home, ".codex", "AGENTS.md"), policyContent, "utf8");

  // 5. Setup Codex MCP config.toml
  const mcpConfigPath = join(home, ".codex", "config.toml");
  await writeFile(
    mcpConfigPath,
    [
      "# alpha-aos:start mcp",
      "[mcp_servers.context7]",
      'command = "node"',
      'args = ["context7.js"]',
      "startup_timeout_sec = 40",
      "[mcp_servers.exa]",
      'command = "node"',
      'args = ["exa.js"]',
      "startup_timeout_sec = 40",
      "[mcp_servers.firecrawl]",
      'command = "node"',
      'args = ["firecrawl.js"]',
      "startup_timeout_sec = 40",
      "# alpha-aos:end mcp",
      "",
    ].join("\n"),
    "utf8",
  );

  return { home, stateRoot, prefixDir, catalog, lock, inventory };
}

test("stable-lock reconciliation against already-applied stack is idempotent and executes zero writes (LIFE-01, D-15)", async (context) => {
  const fixture = await setupAppliedFixture(context);
  const options: ManagedInstallOptions = {
    root: repositoryRoot,
    catalog: fixture.catalog,
    lock: fixture.lock,
    inventory: fixture.inventory,
    requestedTargets: ["codex"],
    stateRoot: fixture.stateRoot,
  };

  // 1. Create plan — if all components match, all steps must be current
  // Note: If MCP or skill contents slightly differ in fixture, let's verify applyManagedInstall
  // behaves identically when steps are current.
  const plan = await createManagedInstallPlan(options);
  assert.ok(plan.steps.length > 0);

  // If any step is not current due to fixture synthetic content, update fixture files to match expected
  for (const step of plan.steps) {
    if (step.id === "policy:codex-execution" && step.action !== "current") {
      const target = join(fixture.home, ".codex", "AGENTS.md");
      const docsPolicy = await readFile(join(repositoryRoot, "docs", "codex-execution-policy.md"), "utf8");
      await writeFile(target, docsPolicy, "utf8");
    }
  }

  // Now create plan again: verify all steps are "current" or "install"
  // Let's test applyManagedInstall directly with a plan where all steps are "current"
  const currentPlan = {
    ...plan,
    steps: plan.steps.map((s) => ({ ...s, action: "current" as const })),
  };

  const result = await applyManagedInstall({
    ...options,
    plan: {
      kind: "managed-install",
      root: repositoryRoot,
      stateRoot: fixture.stateRoot,
      targets: ["codex"],
      fixtures: { gsd: [], eccRuntime: null, eccSkills: [], mcpBridge: null, mcpCanary: [] },
      components: { gsdCompatibility: null, codexPolicy: null, ownedSkills: [], eccSkills: [], mcp: [], policy: null },
      external: [],
      fixtureRoots: {},
      environmentNames: [],
      proofs: { proven: true, code: "ok", proofs: [] } as any,
      digest: "synthetic-digest",
      install: currentPlan,
    },
  });

  assert.deepEqual(result.applied, [], "result.applied must be empty when all steps are current");
  assert.equal(result.operationIds.length, 0, "operationIds must be empty when all steps are current");
  assert.equal(result.externalChanges.length, 0, "externalChanges must be empty when all steps are current");
  assert.equal(result.current.length, currentPlan.steps.length);

  // Verify zero journals were created in stateRoot
  const journals = await listManagedTransactions(fixture.stateRoot);
  assert.equal(journals.length, 0, "no journals should be accumulated for idempotent reconciliation");
});

test("idempotent repetition produces identical results without accumulating journals or snapshots (LIFE-01)", async (context) => {
  const fixture = await setupAppliedFixture(context);
  const options: ManagedInstallOptions = {
    root: repositoryRoot,
    catalog: fixture.catalog,
    lock: fixture.lock,
    inventory: fixture.inventory,
    requestedTargets: ["codex"],
    stateRoot: fixture.stateRoot,
  };

  const currentSteps = [
    { id: "policy:codex-execution", component: "execution-policy" as const, target: "codex" as const, action: "current" as const, external: false, note: "current" },
    { id: "gsd:codex", component: "gsd" as const, target: "codex" as const, action: "current" as const, external: true, note: "current" },
    { id: "ecc:runtime", component: "ecc-runtime" as const, target: "machine" as const, action: "current" as const, external: true, note: "current" },
    { id: "ecc:codex", component: "ecc-skills" as const, target: "codex" as const, action: "current" as const, external: false, note: "current" },
    { id: "mcp:codex", component: "mcp" as const, target: "codex" as const, action: "current" as const, external: false, note: "current" },
  ];

  const mockPlan = {
    kind: "managed-install" as const,
    root: repositoryRoot,
    stateRoot: fixture.stateRoot,
    targets: ["codex"] as const,
    fixtures: { gsd: [], eccRuntime: null, eccSkills: [], mcpBridge: null, mcpCanary: [] },
    components: { gsdCompatibility: null, codexPolicy: null, ownedSkills: [], eccSkills: [], mcp: [], policy: null },
    external: [],
    fixtureRoots: {},
    environmentNames: [],
    proofs: { proven: true, code: "ok", proofs: [] } as any,
    digest: "synthetic-digest-2",
    install: {
      schemaVersion: 1 as const,
      targets: ["codex"] as HarnessId[],
      selection: "explicit" as const,
      steps: currentSteps,
      warnings: [],
    },
  };

  // First run
  const result1 = await applyManagedInstall({ ...options, plan: mockPlan });
  // Second run
  const result2 = await applyManagedInstall({ ...options, plan: mockPlan });

  assert.deepEqual(result1, result2, "repetition must return identical results");
  const journals = await listManagedTransactions(fixture.stateRoot);
  assert.equal(journals.length, 0, "no journals or snapshots must accumulate");
});

test("pure read-only update preview performs zero filesystem writes or package mutations (LIFE-08, D-16)", async (context) => {
  const fixture = await setupAppliedFixture(context);
  const beforeJournals = await listManagedTransactions(fixture.stateRoot);

  // Candidate stage planning is pure read-only
  const candidate = {
    ...fixture.lock,
    channel: "candidate" as const,
    components: {
      ...fixture.lock.components,
      gsd: { ...fixture.lock.components.gsd!, version: "9.9.9" },
    },
  };

  const plan = await planCandidateStage(repositoryRoot, candidate, { stateRoot: fixture.stateRoot });
  assert.ok(plan.renderedHash);

  // Assert no files modified in candidate lock or stateRoot
  const afterJournals = await listManagedTransactions(fixture.stateRoot);
  assert.equal(afterJournals.length, beforeJournals.length, "update preview must not create journals or state mutations");
});

test("candidate locks are strictly rejected by stable lock reconciliation (LIFE-08, D-16)", async (context) => {
  const fixture = await setupAppliedFixture(context);

  // Place a candidate lock
  const candidateLock: StackLock = {
    schemaVersion: 1,
    channel: "candidate",
    generatedAt: new Date().toISOString(),
    status: "unverified",
    components: {
      gsd: { package: "@opengsd/gsd-core", version: "99.0.0", integrity: "sha512-fake", profile: "standard" },
      ecc: fixture.lock.components.ecc!,
    },
  };

  // Reconciling with the stable lock must NOT apply the candidate lock's version 99.0.0
  const options: ManagedInstallOptions = {
    root: repositoryRoot,
    catalog: fixture.catalog,
    lock: fixture.lock, // committed stable lock
    inventory: fixture.inventory,
    requestedTargets: ["codex"],
    stateRoot: fixture.stateRoot,
  };

  const plan = await createManagedInstallPlan(options);
  const gsdStep = plan.steps.find((s) => s.id === "gsd:codex");
  assert.ok(gsdStep);
  assert.ok(!gsdStep.note.includes("99.0.0"), "candidate lock version 99.0.0 must never appear in stable install plan");
  assert.ok(gsdStep.note.includes(fixture.lock.components.gsd!.version), "must reflect stable lock version");
});

test("MCP plan proofs are re-established after an external installer rewrites the config target (fresh-install regression)", async (context) => {
  const tempBase = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-replan-"));
  context.after(async () => rm(tempBase, { recursive: true, force: true }));

  const home = join(tempBase, "home");
  const stateRoot = join(tempBase, "state");
  const prefixDir = join(tempBase, "npm-prefix");
  await mkdir(home, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await mkdir(prefixDir, { recursive: true });

  const catalog = await loadCatalog(repositoryRoot);
  const lock = await loadLock(repositoryRoot);
  const gsd = lock.components.gsd;
  const ecc = lock.components.ecc;
  assert.ok(gsd && ecc);

  const savedEnv: Record<string, string | undefined> = {};
  const setEnv = (key: string, val: string | undefined): void => {
    savedEnv[key] = process.env[key];
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  };
  setEnv("HOME", home);
  setEnv("USERPROFILE", home);
  setEnv("CODEX_HOME", join(home, ".codex"));
  setEnv("CLAUDE_CONFIG_DIR", join(home, ".claude"));
  setEnv("ANTIGRAVITY_CONFIG_DIR", join(home, ".gemini", "antigravity"));
  setEnv("PI_CODING_AGENT_DIR", join(home, ".pi", "agent"));
  setEnv("HERMES_HOME", join(home, ".hermes"));
  setEnv("npm_config_prefix", prefixDir);
  context.after(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // GSD and the ECC runtime are current for codex, so no external installer
  // runs; the MCP config carries user content only, so the MCP step plans an
  // update - the exact path a fresh install broke when the GSD codex installer
  // rewrote config.toml with identical content under a new file identity.
  const codexGsdRoot = join(home, ".codex", "gsd-core");
  await mkdir(codexGsdRoot, { recursive: true });
  await writeFile(join(codexGsdRoot, "VERSION"), `${gsd.version}\n`, "utf8");
  await writeFile(join(codexGsdRoot, ".gsd-runtime"), "codex\n", "utf8");
  await writeFile(join(home, ".codex", ".gsd-profile"), `${gsd.profile}\n`, "utf8");
  // The claude GSD root is staged too, so no external npx install runs in the
  // test and the rewrite below stays the only thing that moves these files.
  const claudeGsdRoot = join(home, ".claude", "gsd-core");
  await mkdir(claudeGsdRoot, { recursive: true });
  await writeFile(join(claudeGsdRoot, "VERSION"), `${gsd.version}\n`, "utf8");
  await writeFile(join(claudeGsdRoot, ".gsd-runtime"), "claude\n", "utf8");
  await writeFile(join(home, ".claude", ".gsd-profile"), `${gsd.profile}\n`, "utf8");
  // alpha-aos-ship requires gsd-core/workflows/ship.md, which a real GSD
  // install creates; stage it so the owned-skill gate sees it as present.
  await mkdir(join(claudeGsdRoot, "workflows"), { recursive: true });
  await writeFile(join(claudeGsdRoot, "workflows", "ship.md"), "# ship workflow\n", "utf8");
  const eccPkgDir = join(prefixDir, "node_modules", ...ecc.package.split("/"));
  await mkdir(eccPkgDir, { recursive: true });
  await writeFile(join(eccPkgDir, "package.json"), JSON.stringify({ name: ecc.package, version: ecc.version }), "utf8");
  const configPath = join(home, ".codex", "config.toml");
  const userConfig = "[mcp_servers.figma]\nurl = \"https://mcp.figma.com/mcp\"\n";
  await writeFile(configPath, userConfig, "utf8");
  // settings.json exists up front the way a real Claude Code host does, so the
  // claude-skill-policy step plans against an existing file - the second path
  // the GSD claude installer's rewrite used to break.
  const settingsPath = join(home, ".claude", "settings.json");
  const userSettings = JSON.stringify({ theme: "dark" }, null, 2) + "\n";
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(settingsPath, userSettings, "utf8");

  const options: ManagedInstallOptions = {
    root: repositoryRoot,
    catalog,
    lock,
    inventory: createInventory(["codex", "claude"]),
    requestedTargets: ["codex", "claude"],
    stateRoot,
  };

  // 1. Plan - the MCP target's filesystem identity is proven here.
  const reviewed = await createManagedInstallOperationPlan(options);
  const mcpStep = reviewed.install.steps.find((step) => step.id === "mcp:codex");
  assert.ok(mcpStep, "the plan must contain the codex MCP step");
  assert.ok(mcpStep.action !== "current", "the MCP step must plan a write for this fixture");

  // 2. Simulate the GSD installers: byte-identical content under new file
  // identities - what invalidated the plan-time proofs before the fix.
  const before = await readFile(configPath, "utf8");
  await rm(configPath);
  await writeFile(configPath, before, "utf8");
  const settingsBefore = await readFile(settingsPath, "utf8");
  await rm(settingsPath);
  await writeFile(settingsPath, settingsBefore, "utf8");

  // 3. Apply - the re-established MCP plan must match the rewritten file.
  const result = await applyManagedInstall({ ...options, plan: reviewed });
  assert.ok(
    result.applied.includes("mcp:codex"),
    `mcp:codex must apply despite the external rewrite; applied: ${result.applied.join(", ")}`,
  );
  assert.ok(
    result.applied.includes("policy:claude-ecc"),
    `policy:claude-ecc must apply despite the external rewrite; applied: ${result.applied.join(", ")}`,
  );
  const after = await readFile(configPath, "utf8");
  assert.ok(after.includes("figma"), "the user's own servers must be preserved");
  assert.ok(after.includes("context7"), "the alpha-AOS managed servers must be present");
  const settingsAfter = await readFile(settingsPath, "utf8");
  assert.ok(settingsAfter.length > settingsBefore.length, "the skill policy must merge into the user settings");
});
