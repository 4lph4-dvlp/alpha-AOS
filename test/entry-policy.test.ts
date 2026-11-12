import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import { applyEntryPolicy, entryPolicyPath, entryPolicyRoot, planEntryPolicy, renderEntryPolicy, renderHermesEntryPolicy } from "../src/core/entry-policy.js";
import { packageRoot } from "../src/core/paths.js";
import { rollbackManagedTransaction } from "../src/core/transaction.js";
import { applyUninstall, planUninstall } from "../src/core/uninstall.js";
import type { HarnessId } from "../src/types.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { runDoctor } from "../src/core/doctor.js";
import { createManagedInstallPlan } from "../src/core/install.js";
import type { Inventory } from "../src/types.js";

const harnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

async function fixture(context: test.TestContext, harness: HarnessId) {
  const base = await mkdtemp(join(tmpdir(), "alpha-aos-entry-policy-"));
  context.after(async () => rm(base, { recursive: true, force: true }));
  const root = join(base, "package");
  const configRoot = join(base, "native profile");
  const stateRoot = join(base, "state");
  await mkdir(join(root, "docs"), { recursive: true });
  const source = join(root, "docs", "task-entry-policy.md");
  const policy = await readFile(join(packageRoot(), "docs", "task-entry-policy.md"), "utf8");
  await writeFile(source, policy);
  return { harness, root, configRoot, stateRoot, source, policy, target: entryPolicyPath(harness, configRoot) };
}

for (const harness of harnesses) {
  test(`${harness} native entry policy: read-only preview, preserved user content, idempotent sync and rollback`, async (context) => {
    const options = await fixture(context, harness);
    const clean = await planEntryPolicy(options);
    assert.equal(clean.action, "create");
    assert.equal(existsSync(options.configRoot), false);
    assert.equal(existsSync(options.stateRoot), false);
    await mkdir(options.configRoot);
    const user = harness === "hermes"
      ? "# User comment\nmodel: private-user-value\nskills:\n  auto_load: [user-skill]\n"
      : "\uFEFF# User rules\r\nprivate-user-value\r\n";
    await writeFile(options.target, user);
    const plan = await planEntryPolicy(options);
    assert.equal(JSON.stringify(plan).includes("private-user-value"), false);
    const first = await applyEntryPolicy({ ...options, plan });
    assert.ok(first.operationId);
    const written = await readFile(options.target, "utf8");
    if (harness === "hermes") {
      const doc = parseYaml(written);
      assert.deepEqual(doc.skills.auto_load, ["user-skill", "alpha-aos-task"]);
      assert.equal(doc.model, "private-user-value");
      assert.ok(written.startsWith("# User comment\n"));
      assert.equal(existsSync(join(options.configRoot, "SOUL.md")), false, "entry policy must not replace Hermes identity");
    } else {
      assert.ok(written.startsWith(user));
      assert.match(written, /alpha-aos-task/u);
      assert.match(written, /대화형-quick-full/u);
      assert.match(written, /opts out/u);
    }
    assert.equal(first.plan.action, "current");
    assert.equal((await applyEntryPolicy(options)).operationId, null);
    await rollbackManagedTransaction(options.stateRoot, first.operationId);
    assert.equal(await readFile(options.target, "utf8"), user);
  });
}

test("native paths respect each host's actual root and environment overrides", () => {
  const home = join(tmpdir(), "entry-path-home");
  const defaults = [".claude/CLAUDE.md", ".codex/AGENTS.md", ".gemini/GEMINI.md", ".pi/agent/AGENTS.md", ".hermes/config.yaml"];
  const env = { HERMES_HOME: join(home, ".hermes") };
  for (const [index, harness] of harnesses.entries()) {
    assert.equal(entryPolicyPath(harness, entryPolicyRoot(harness, env, home)), join(home, defaults[index]!));
  }
  const custom = join(home, "custom");
  for (const [harness, variable] of [["claude", "CLAUDE_CONFIG_DIR"], ["codex", "CODEX_HOME"], ["antigravity", "ANTIGRAVITY_CONFIG_DIR"], ["pi", "PI_CODING_AGENT_DIR"], ["hermes", "HERMES_HOME"]] as const) {
    assert.equal(entryPolicyRoot(harness, { [variable]: custom }, home), custom);
  }
});

test("policy update preserves surrounding bytes and malformed ownership is refused", async (context) => {
  const options = await fixture(context, "claude");
  const before = "User prefix\r\n";
  const after = "\r\nUser suffix\r\n";
  const existing = `${renderEntryPolicy(before, "Old instructions")}${after}`;
  await mkdir(options.configRoot);
  await writeFile(options.target, existing);
  await applyEntryPolicy(options);
  const updated = await readFile(options.target, "utf8");
  assert.ok(updated.startsWith(before));
  assert.ok(updated.endsWith(after));
  assert.equal(updated.includes("Old instructions"), false);
  for (const malformed of ["<!-- alpha-AOS:task-entry:start -->\nuser", "x<!-- alpha-AOS:task-entry:start -->\n<!-- alpha-AOS:task-entry:end -->", `${updated}\n<!-- alpha-AOS:task-entry:end -->`]) {
    await writeFile(options.target, malformed);
    await assert.rejects(planEntryPolicy(options), /Malformed/u);
    assert.equal(await readFile(options.target, "utf8"), malformed);
  }
});

test("stale source, target and native override refuse mutation", async (context) => {
  const options = await fixture(context, "pi");
  const clean = await planEntryPolicy(options);
  await writeFile(options.source, `${options.policy}\nChanged policy\n`);
  await assert.rejects(applyEntryPolicy({ ...options, plan: clean }), /drift|changed/iu);
  await writeFile(options.source, options.policy);
  await mkdir(options.configRoot);
  await writeFile(options.target, "User content\n");
  const plan = await planEntryPolicy(options);
  await writeFile(options.target, "New user content\n");
  await assert.rejects(applyEntryPolicy({ ...options, plan }), /drift|changed/iu);
  assert.equal(await readFile(options.target, "utf8"), "New user content\n");
  const overridePlan = await planEntryPolicy(options);
  await writeFile(join(options.configRoot, "AGENTS.override.md"), "Native override\n");
  await assert.rejects(applyEntryPolicy({ ...options, plan: overridePlan }), /drift|changed|precedence|suppress/iu);
  await assert.rejects(planEntryPolicy(options), /suppresses/u);
});

test("entry-policy refuses symlink redirection", async (context) => {
  const options = await fixture(context, "claude");
  const outside = join(options.root, "outside.md");
  await writeFile(outside, "Do not change\n");
  await mkdir(options.configRoot);
  try { await symlink(outside, options.target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") { context.skip("Symlink privilege unavailable"); return; }
    throw error;
  }
  await assert.rejects(planEntryPolicy(options), /boundary|symlink/iu);
  assert.equal(await readFile(outside, "utf8"), "Do not change\n");
});

test("Hermes auto-load is independent of MCP and malformed config errors omit user bytes", () => {
  assert.deepEqual(parseYaml(renderHermesEntryPolicy("")).skills.auto_load, ["alpha-aos-task"]);
  assert.deepEqual(parseYaml(renderHermesEntryPolicy("skills:\n  auto_load: user-skill\n")).skills.auto_load, ["user-skill", "alpha-aos-task"]);
  assert.deepEqual(parseYaml(renderHermesEntryPolicy("skills:\n  auto_load: alpha-aos-task\n")).skills.auto_load, ["alpha-aos-task"]);
  assert.throws(() => renderHermesEntryPolicy("skills:\n  disabled: [alpha-aos-task]\n"), /disabled/u);
  const existing = "# keep formatting\nskills:\n  auto_load: [alpha-aos-task, user-skill]\n";
  assert.equal(renderHermesEntryPolicy(existing), existing);
  for (const invalid of ["secret-user-value: [", "skills: secret-user-value", "skills:\n  auto_load: {secret-user-value: 1}", "skills:\n  auto_load: [123]"]) {
    assert.throws(() => renderHermesEntryPolicy(invalid), (error: unknown) => error instanceof Error && !error.message.includes("secret-user-value"));
  }
});

test("uninstall removes only managed entry blocks from every Markdown host", async (context) => {
  for (const harness of harnesses.filter((id) => id !== "hermes")) {
    const options = await fixture(context, harness);
    await mkdir(options.configRoot);
    const user = "# Native user guidance\n";
    await writeFile(options.target, user);
    await applyEntryPolicy(options);
    const variable = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME", antigravity: "ANTIGRAVITY_CONFIG_DIR", pi: "PI_CODING_AGENT_DIR", hermes: "HERMES_HOME" }[harness];
    const plan = await planUninstall({ scope: "target", targetHarness: harness, home: options.root, env: { [variable]: options.configRoot }, stateRoot: options.stateRoot });
    const markdown = plan.prunePlans.find((entry) => entry.path === options.target);
    assert.ok(markdown);
    await applyUninstall({ plan, stateRoot: options.stateRoot });
    assert.equal((await readFile(options.target, "utf8")).trim(), user.trim());
  }
});

test("CLI previews all five hosts and enforces the exact digest before applying", async (context) => {
  const options = await fixture(context, "claude");
  const base = options.configRoot;
  const env = { ...process.env, CLAUDE_CONFIG_DIR: join(base, "claude"), CODEX_HOME: join(base, "codex"), ANTIGRAVITY_CONFIG_DIR: join(base, "agy"), PI_CODING_AGENT_DIR: join(base, "pi"), HERMES_HOME: join(base, "hermes"), ALPHA_AOS_STATE_DIR: options.stateRoot };
  const cli = join(packageRoot(), "dist", "src", "cli.js");
  const args = [cli, "entry-policy", "sync", "--target", "all", "--json"];
  const preview = JSON.parse(execFileSync(process.execPath, args, { env, encoding: "utf8" }));
  assert.equal(preview.plans.length, 5);
  assert.equal(preview.nativeSessionVerified, false);
  assert.equal(existsSync(base), false);
  assert.throws(() => execFileSync(process.execPath, [...args, "--apply", "--plan-digest", "0".repeat(64)], { env, stdio: "pipe" }));
  assert.equal(existsSync(base), false);
  const result = JSON.parse(execFileSync(process.execPath, [...args, "--apply", "--plan-digest", preview.digest], { env, encoding: "utf8" }));
  assert.equal(result.results.length, 5);
  for (const entry of result.results) assert.equal(entry.plan.action, "current");
});

test("installation plans all five native entry surfaces and doctor detects absent/restored guidance", async (context) => {
  const options = await fixture(context, "claude");
  const variables = ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "ANTIGRAVITY_CONFIG_DIR", "PI_CODING_AGENT_DIR", "HERMES_HOME", "ALPHA_AOS_STATE_DIR"];
  const saved = variables.map((key) => [key, process.env[key]] as const);
  context.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const [index, harness] of harnesses.entries()) process.env[variables[index]!] = join(options.configRoot, harness);
  process.env.ALPHA_AOS_STATE_DIR = options.stateRoot;
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);
  const shipWorkflow = join(process.env.CLAUDE_CONFIG_DIR!, "gsd-core", "workflows", "ship.md");
  await mkdir(join(shipWorkflow, ".."), { recursive: true });
  await writeFile(shipWorkflow, "# Installed native ship workflow\n");
  const inventory: Inventory = {
    schemaVersion: 1, generatedAt: new Date(0).toISOString(), platform: process.platform, architecture: process.arch,
    tools: { node: { command: process.execPath, version: "24.0.0" }, npm: { command: "npm", version: "10.0.0" }, git: { command: "git", version: "2.0.0" } },
    harnesses: harnesses.map((id) => ({ id, displayName: id, command: id, version: null, configRoots: [], detected: true, notes: [] })),
  };
  const install = await createManagedInstallPlan({ root, catalog, lock, inventory, selectedTools: ["gsd"], stateRoot: options.stateRoot });
  assert.equal(install.steps.filter((step) => step.component === "task-entry-policy").length, 5);
  for (const harness of harnesses) assert.equal(existsSync(entryPolicyPath(harness)), false);
  assert.equal(existsSync(options.stateRoot), false);
  const missing = await runDoctor(catalog, lock, inventory, root);
  for (const harness of harnesses) assert.equal(missing.find((finding) => finding.code === `policy.task-entry.${harness}`)?.level, "warning");
  assert.equal(missing.find((finding) => finding.code === "policy.owned-skill.alpha-aos-task.claude")?.level, "warning");
  for (const harness of harnesses) await applyEntryPolicy({ harness, root, stateRoot: options.stateRoot });
  const restored = await runDoctor(catalog, lock, inventory, root);
  for (const harness of harnesses) {
    const finding = restored.find((entry) => entry.code === `policy.task-entry.${harness}`);
    assert.ok(finding);
    assert.equal(finding?.level, "ok");
    assert.match(finding.message, /not verified/u);
  }
});
