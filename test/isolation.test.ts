import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createIsolationLaunchSpec } from "../src/adapters/isolation.js";
import { createGsdFixtureSpec } from "../src/core/gsd-fixture.js";
import { eccSkillRoot, renderEccSkill } from "../src/core/ecc-fixture.js";
import {
  applyIsolationManifest,
  cleanIsolationRuntime,
  createIsolationPlan,
  defaultIsolationPolicy,
  doctorIsolation,
  inspectRuntimeMarker,
  isolationProjectId,
  readProjectManifest,
  planIsolationClean,
  planIsolationManifestOperation,
  planIsolationRuntimeOperation,
  selectIsolationLaunch,
  syncIsolationRuntime,
} from "../src/core/isolation.js";
import { ComponentPlanError } from "../src/core/component-session.js";
import { listManagedTransactions } from "../src/core/transaction.js";
import { acquireMutationSession, inspectWriterState, WriterConflictError, writerLockPath } from "../src/core/writer-lock.js";

async function fixture(context: test.TestContext): Promise<{ root: string; project: string; state: string }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-isolation-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const project = join(root, "project");
  const state = join(root, "state");
  await mkdir(project);
  return { root, project, state };
}

test("isolation init preserves existing project policy and writes through a transaction", async (context) => {
  const { project, state } = await fixture(context);
  await mkdir(join(project, ".alpha-aos"));
  await writeFile(join(project, ".alpha-aos", "stack.yaml"), "schemaVersion: 1\ntrusted: true\npacks:\n  - WEB_BASE\n", "utf8");

  const operationId = await applyIsolationManifest({
    projectRoot: project,
    stateRoot: state,
    mode: "project-only",
    allowedHarnesses: ["claude"],
    trust: true,
  });
  const manifest = await readProjectManifest(project);
  assert.match(operationId, /-/u);
  assert.equal(manifest.trusted, true);
  assert.deepEqual(manifest.packs, ["WEB_BASE"]);
  assert.equal(manifest.isolation?.mode, "project-only");
  assert.equal(manifest.isolation?.inherit.globalSkills, false);
});

test("runtime sync is idempotent and writes only below the external isolated root", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["pi"] });
  const first = await syncIsolationRuntime(project, state);
  const second = await syncIsolationRuntime(project, state);
  const plan = await createIsolationPlan(project, state);

  assert.ok(first);
  assert.equal(second, null);
  assert.equal(existsSync(join(plan.runtimeRoot, "runtime.json")), true);
  assert.equal(existsSync(join(project, ".pi", "settings.json")), false);
  const marker = JSON.parse(await readFile(join(plan.runtimeRoot, "runtime.json"), "utf8")) as Record<string, unknown>;
  assert.equal(marker.managedBy, "alpha-aos");
});

test("doctor rejects project skills outside the explicit allowlist", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["pi"] });
  await syncIsolationRuntime(project, state);
  await mkdir(join(project, ".agents", "skills", "surprise"), { recursive: true });
  await writeFile(join(project, ".agents", "skills", "surprise", "SKILL.md"), "---\nname: surprise\n---\n", "utf8");

  const findings = await doctorIsolation(project, state);
  assert.equal(findings.some((finding) => finding.code === "PROJECT_SKILL_NOT_ALLOWED" && finding.level === "error"), true);
});

test("doctor rejects project MCP servers outside the explicit allowlist", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["claude"] });
  await syncIsolationRuntime(project, state);
  await writeFile(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { surprise: { command: "example" } } }), "utf8");

  const findings = await doctorIsolation(project, state);
  assert.equal(findings.some((finding) => finding.code === "PROJECT_MCP_NOT_ALLOWED" && finding.level === "error"), true);
});

test("sealed mode is fail-closed until a container adapter is available", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "sealed", allowedHarnesses: ["claude"], trust: true });
  await syncIsolationRuntime(project, state);
  const plan = await createIsolationPlan(project, state);
  assert.throws(() => selectIsolationLaunch(plan, "claude"), /container\/OS sandbox adapter/u);
});

test("Codex project-only adapter isolates both CODEX_HOME and generic skill home", () => {
  const policy = defaultIsolationPolicy("project-only", ["codex"]);
  const launch = createIsolationLaunchSpec({
    projectId: "0123456789abcdef",
    projectRoot: "C:\\work\\repo",
    harness: "codex",
    policy,
    runtimeRoot: "C:\\state\\isolated\\0123456789abcdef",
    allowedSkillPaths: [],
  });
  assert.ok(launch.env.CODEX_HOME);
  assert.ok(launch.env.HOME);
  assert.equal(launch.env.HOME, launch.env.USERPROFILE);
  assert.notEqual(launch.env.CODEX_HOME, launch.env.HOME);
});

test("project-only launch adapters hide user resources without claiming a sealed sandbox", () => {
  const cases = (["claude", "antigravity", "pi", "hermes"] as const).map((harness) => createIsolationLaunchSpec({
    projectId: "0123456789abcdef",
    projectRoot: "C:\\work\\repo",
    harness,
    policy: defaultIsolationPolicy("project-only", [harness]),
    runtimeRoot: "C:\\state\\isolated\\0123456789abcdef",
    allowedSkillPaths: [],
  }));
  const [claude, antigravity, pi, hermes] = cases;
  assert.ok(claude?.env.CLAUDE_CONFIG_DIR);
  assert.equal(claude?.args.includes("--strict-mcp-config"), true);
  assert.equal(antigravity?.env.HOME, antigravity?.env.USERPROFILE);
  assert.equal(pi?.args.includes("--no-skills"), true);
  assert.deepEqual(hermes?.args.slice(0, 3), ["chat", "--ignore-user-config", "--ignore-rules"]);
  assert.equal(cases.some((entry) => entry.blockedReasons.some((reason) => reason.includes("sealed"))), false);
});

test("an untrusted isolation manifest cannot be launched", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["pi"] });
  await syncIsolationRuntime(project, state);
  const plan = await createIsolationPlan(project, state);
  assert.throws(() => selectIsolationLaunch(plan, "pi"), /not trusted/u);
});

test("clean removes only a marked generated runtime", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["pi"] });
  await syncIsolationRuntime(project, state);
  const plan = await createIsolationPlan(project, state);
  await cleanIsolationRuntime(project, state);
  assert.equal(existsSync(plan.runtimeRoot), false);
});

test("GSD fixture spec isolates shared Agent Skills and GSD defaults roots", async (context) => {
  const { root } = await fixture(context);
  const spec = createGsdFixtureSpec({
    harness: "codex",
    fixtureRoot: join(root, "fixture"),
    gsd: { package: "@opengsd/gsd-core", version: "1.12.0", integrity: "fixture", profile: "standard" },
    baseEnv: { PATH: process.env.PATH },
  });
  assert.equal(spec.env.HOME, spec.syntheticHome);
  assert.equal(spec.env.USERPROFILE, spec.syntheticHome);
  assert.equal(spec.env.CODEX_HOME, spec.configRoot);
  assert.equal(spec.args.includes("--profile=standard"), true);
  assert.equal(spec.args.includes("--config-dir"), true);
});

test("ECC exact-file renderer removes Claude-only Task orchestration without changing other selected skills", () => {
  const source = [
    "# Deep Research",
    "",
    "## MCP Requirements",
    "",
    "Use upstream tools.",
    "",
    "## Workflow",
    "",
    "### Step 3: Execute Multi-Source Search",
    "",
    "Call firecrawl_search and web_search_advanced_exa.",
    "",
    "### Step 4: Deep-Read Key Sources",
    "",
    "Call crawling_exa.",
    "",
    "### Step 5: Synthesize and Write Report",
    "",
    "Write it.",
    "",
    "## Parallel Research with Subagents",
    "",
    "Use Claude Task tool.",
    "",
    "## Quality Rules",
    "",
    "Cite sources.",
    "",
  ].join("\n");
  const rendered = renderEccSkill("deep-research", source);
  assert.doesNotMatch(rendered, /Claude Task/u);
  assert.doesNotMatch(rendered, /firecrawl_search|web_search_advanced_exa|crawling_exa/u);
  assert.match(rendered, /current harness's native subagent/u);
  assert.match(rendered, /web_search_exa/u);
  assert.match(rendered, /firecrawl_scrape/u);
  assert.match(rendered, /## Quality Rules/u);
  assert.equal(renderEccSkill("unified-memory", "unchanged\n"), "unchanged\n");
});

test("ECC skill roots are explicit for every supported harness", () => {
  const home = "C:\\fixture-home";
  assert.match(eccSkillRoot("claude", home), /\.claude[\\/]skills$/u);
  assert.match(eccSkillRoot("codex", home), /\.agents[\\/]skills$/u);
  assert.match(eccSkillRoot("antigravity", home), /\.gemini[\\/]config[\\/]skills$/u);
  assert.match(eccSkillRoot("pi", home), /\.agents[\\/]skills$/u);
  assert.match(eccSkillRoot("hermes", home), /\.hermes[\\/]skills$/u);
});

test("Antigravity documentation lookup names GUI tools and the IDE MCP gateway without web fallback", () => {
  const source = "---\nname: documentation-lookup\ndescription: Use Context7.\n---\n\n# Documentation Lookup (Context7)\n\nUse current docs.\n";
  const rendered = renderEccSkill("documentation-lookup", source, "antigravity");
  assert.match(rendered, /context7\/resolve-library-id/u);
  assert.match(rendered, /context7\/query-docs/u);
  assert.match(rendered, /call_mcp_tool/u);
  assert.match(rendered, /ServerName: "context7"/u);
  assert.match(rendered, /ToolName: "resolve-library-id"/u);
  assert.match(rendered, /ToolName: "query-docs"/u);
  assert.match(rendered, /Reading a JSON tool descriptor does not execute/u);
  assert.match(rendered, /Do not replace a required Context7 call with native web search/u);
  assert.match(rendered, /stop instead of searching the web/u);
  assert.equal(renderEccSkill("documentation-lookup", source, "codex"), source);
});

// ---------------------------------------------------------------------------
// Plan 01-10: strict runtime marker
// ---------------------------------------------------------------------------

test("a runtime marker is read strictly before a directory is removed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-marker-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const stateRoot = join(root, "state");
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  const projectId = isolationProjectId(projectRoot);
  const target = join(stateRoot, "isolated", projectId);
  const marker = join(target, "runtime.json");

  const valid = {
    schemaVersion: 1,
    managedBy: "alpha-aos",
    projectId,
    mode: "project-only",
    policyHash: "e".repeat(64),
  };

  const cases: ReadonlyArray<{ name: string; marker: string }> = [
    { name: "an unknown core field", marker: JSON.stringify({ ...valid, unknownCoreField: true }) },
    { name: "an unknown newer version", marker: JSON.stringify({ ...valid, schemaVersion: 9 }) },
    { name: "a missing ownership marker", marker: JSON.stringify({ ...valid, managedBy: "someone-else" }) },
    { name: "a duplicate key", marker: `{"schemaVersion":1,"schemaVersion":1,"managedBy":"alpha-aos","projectId":"${projectId}","mode":"project-only","policyHash":"${"e".repeat(64)}"}` },
    { name: "a malformed policy hash", marker: JSON.stringify({ ...valid, policyHash: "too-short" }) },
  ];

  for (const entry of cases) {
    await mkdir(target, { recursive: true });
    await writeFile(marker, entry.marker, "utf8");
    await assert.rejects(
      () => cleanIsolationRuntime(projectRoot, stateRoot),
      /Refusing to clean/u,
      `${entry.name} should have blocked the removal`,
    );
    assert.equal(existsSync(marker), true, `${entry.name}: a refused clean must leave the runtime in place`);
    await rm(target, { recursive: true, force: true });
  }

  // A current, valid, matching marker is removable.
  await mkdir(target, { recursive: true });
  await writeFile(marker, JSON.stringify(valid), "utf8");
  await cleanIsolationRuntime(projectRoot, stateRoot);
  assert.equal(existsSync(target), false, "a proven runtime is removed");
});

test("a supported older runtime marker is readable but is not acted on", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-marker-old-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const stateRoot = join(root, "state");
  const projectRoot = join(root, "project");
  await mkdir(projectRoot, { recursive: true });
  const projectId = isolationProjectId(projectRoot);
  const target = join(stateRoot, "isolated", projectId);
  const marker = join(target, "runtime.json");
  await mkdir(target, { recursive: true });
  await writeFile(
    marker,
    JSON.stringify({ schemaVersion: 0, managedBy: "alpha-aos", projectId, mode: "project-only", policyHash: "f".repeat(64) }),
    "utf8",
  );

  const inspection = await inspectRuntimeMarker(marker);
  assert.equal(inspection.status, "migratable");
  assert.equal(inspection.value, null, "a migratable marker is not consumed as current");
  assert.equal(inspection.migration?.fromVersion, 0);

  await assert.rejects(() => cleanIsolationRuntime(projectRoot, stateRoot), /Refusing to clean/u);
  assert.equal(existsSync(marker), true);
});

test("the reviewed isolation plans name their path roles and write nothing", async (context) => {
  const { project, state } = await fixture(context);

  const manifestPlan = await planIsolationManifestOperation({
    projectRoot: project,
    stateRoot: state,
    mode: "project-only",
    allowedHarnesses: ["pi"],
  });
  assert.equal(manifestPlan.proofs.proven, true);
  for (const role of ["target", "state", "journal", "snapshot"] as const) {
    assert.ok(manifestPlan.proofs.get(role), `manifest plan must declare the ${role} role`);
  }
  assert.equal(manifestPlan.action, "create");
  assert.equal(manifestPlan.renderedHash.length, 64);
  assert.equal(existsSync(manifestPlan.manifestPath), false, "planning writes nothing");

  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["pi"] });

  const runtimePlan = await planIsolationRuntimeOperation(project, state);
  for (const role of ["target", "state", "journal", "snapshot", "source"] as const) {
    assert.ok(runtimePlan.proofs.get(role), `runtime plan must declare the ${role} role`);
  }
  assert.equal(runtimePlan.files.length > 0, true);
  assert.equal(runtimePlan.files.every((file) => file.action === "create"), true);
  assert.equal(existsSync(runtimePlan.runtimeRoot), false);

  await syncIsolationRuntime(project, state);

  const cleanPlan = await planIsolationClean(project, state);
  assert.equal(cleanPlan.status, "removable");
  assert.deepEqual(
    cleanPlan.files.map((file) => file.target).includes(join(cleanPlan.runtimeRoot, "runtime.json")),
    true,
    "the marker is one of the files the clean removes",
  );
  assert.equal(cleanPlan.directories.at(-1), cleanPlan.runtimeRoot, "the runtime root is removed last");
  assert.equal(existsSync(cleanPlan.markerPath), true, "planning a clean removes nothing");
});

test("nested isolation applies consume the caller session and take no second writer lock", async (context) => {
  const { project, state } = await fixture(context);

  const manifestPlan = await planIsolationManifestOperation({
    projectRoot: project,
    stateRoot: state,
    mode: "project-only",
    allowedHarnesses: ["pi"],
  });
  const session = await acquireMutationSession({
    stateRoot: state,
    proofs: manifestPlan.proofs,
    planDigest: manifestPlan.digest,
  });
  let closed = false;
  context.after(async () => {
    if (!closed) await session.close();
  });

  // The writer lock is exclusive-create, so a second acquisition would fail here.
  const manifestOperation = await applyIsolationManifest({
    plan: manifestPlan,
    session,
    projectRoot: project,
    stateRoot: state,
    mode: "project-only",
    allowedHarnesses: ["pi"],
  });
  assert.equal(manifestOperation, session.operationId);
  assert.equal((await readProjectManifest(project)).isolation?.mode, "project-only");
  assert.equal((await inspectWriterState(state)).status, "active", "the callee must not release the caller's writer");

  await session.close();
  closed = true;
  assert.equal(existsSync(writerLockPath(state)), false);
});

test("an active writer blocks isolation mutations while plans and doctor stay readable", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["pi"] });
  await syncIsolationRuntime(project, state);

  const runtimePlan = await planIsolationRuntimeOperation(project, state);
  const holder = await acquireMutationSession({
    stateRoot: state,
    proofs: runtimePlan.proofs,
    planDigest: "another-operation",
  });
  context.after(async () => holder.close());

  // Reading stays available while another writer owns the root.
  assert.equal((await planIsolationClean(project, state)).status, "removable");
  assert.equal((await doctorIsolation(project, state)).some((finding) => finding.code === "ISOLATION_RUNTIME"), true);

  await assert.rejects(
    () => cleanIsolationRuntime(project, state),
    (error: unknown) => {
      assert.ok(error instanceof WriterConflictError);
      assert.equal(error.code, "ACTIVE_WRITER");
      return true;
    },
  );
  assert.equal(existsSync(join(runtimePlan.runtimeRoot, "runtime.json")), true, "a blocked clean removes nothing");
});

test("a clean journals every removal instead of deleting the tree outright", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["claude"] });
  await syncIsolationRuntime(project, state);
  const plan = await planIsolationClean(project, state);
  assert.equal(plan.files.length >= 2, true, "a claude runtime has a marker and a settings file");

  await cleanIsolationRuntime(project, state);
  assert.equal(existsSync(plan.runtimeRoot), false);

  const journals = await listManagedTransactions(state);
  const removal = journals.find((journal) => journal.files.some((file) => file.target === plan.files[0]?.target));
  assert.ok(removal, "the removal is recorded in a journal");
  assert.equal(removal.files.length, plan.files.length);
  assert.equal(removal.files.every((file) => file.afterHash === null), true, "every recorded intent is a removal");
  assert.equal(removal.files.every((file) => file.snapshot !== null), true, "every removed file was snapshotted first");
});

test("an isolation plan reviewed before the runtime changed refuses and writes nothing", async (context) => {
  const { project, state } = await fixture(context);
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["pi"] });
  const plan = await planIsolationRuntimeOperation(project, state);

  // The policy changes after review, so the reviewed file set is stale.
  await applyIsolationManifest({ projectRoot: project, stateRoot: state, mode: "project-only", allowedHarnesses: ["claude"] });

  await assert.rejects(
    () => syncIsolationRuntime(project, state, { plan }),
    (error: unknown) => {
      assert.ok(error instanceof ComponentPlanError);
      assert.equal(error.code, "plan-drift");
      return true;
    },
  );
  assert.equal(existsSync(plan.runtimeRoot), false, "a refused sync creates nothing");
  assert.equal(existsSync(writerLockPath(state)), false);
});
