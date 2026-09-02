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
  readProjectManifest,
  selectIsolationLaunch,
  syncIsolationRuntime,
} from "../src/core/isolation.js";

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
