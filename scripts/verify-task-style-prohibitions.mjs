#!/usr/bin/env node

// Rebuild first with `npm run build`. This local verifier never installs or
// modifies GSD. Its only writes are reproducible controls and retained receipts
// in the ignored, test-owned .planning/tmp/t30-prohibition-controls directory.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--gsd-tools"),
  "Usage: node scripts/verify-task-style-prohibitions.mjs [--gsd-tools <installed gsd-tools.cjs>]");
const gsdTools = resolve(args[1] ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "gsd-core", "bin", "gsd-tools.cjs"));
const controls = ".planning/tmp/t30-prohibition-controls";
const controlsRoot = join(root, controls);
const runRoot = join(controlsRoot, "runs", new Date().toISOString().replace(/[:.]/gu, "-"));
mkdirSync(runRoot, { recursive: true });
if (!existsSync(gsdTools) || !existsSync(join(dirname(gsdTools), "lib", "prohibition-enforcement.cjs"))) {
  const message = "Installed GSD prohibition-enforcement producer is unavailable; specify --gsd-tools <installed gsd-tools.cjs>. No installation was attempted.";
  writeFileSync(join(runRoot, "failure.json"), JSON.stringify({ status: "blocked", message, gsdTools }, null, 2));
  console.error(`Blocked: ${message}\nReceipts: ${runRoot}`);
  process.exit(1);
}
const maxBuffer = 16 * 1024 * 1024;
const sourcePaths = [
  "src/core/task-run.ts", "src/core/task-gsd-stages.ts", "src/core/task-gsd-lifecycle.ts", "src/core/task-phase-scope.ts",
  "dist/src/core/task-run.js", "dist/src/core/task-gsd-stages.js", "dist/src/core/task-gsd-lifecycle.js", "dist/src/core/task-phase-scope.js",
  "test/helpers/task-fixture.ts", "dist/test/helpers/task-fixture.js",
  "test/prohibitions/t30-full.consumer.test.ts", "test/prohibitions/t30-phase.consumer.test.ts",
  "dist/test/prohibitions/t30-full.consumer.test.js", "dist/test/prohibitions/t30-phase.consumer.test.js",
  "scripts/verify-task-style-prohibitions.mjs",
  ".planning/phases/30-six-execution-styles-and-quality-binding/30-04-PLAN.md",
  ".planning/phases/30-six-execution-styles-and-quality-binding/30-05-PLAN.md",
  gsdTools, join(dirname(gsdTools), "lib", "prohibition-enforcement.cjs"),
];
const hash = (path) => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const hashes = () => Object.fromEntries(sourcePaths.map((path) => [path, hash(path)]));
const sourceHashes = hashes();
const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 5_000, windowsHide: true });
assert.equal(head.status, 0, head.stderr);
const receipts = [];
writeFileSync(join(runRoot, "source-hashes.before.json"), JSON.stringify({ head: head.stdout.trim(), sourceHashes }, null, 2));

function run(label, argv, subject, timeout = 30_000) {
  const env = { ...process.env };
  delete env.GSD_PROHIB_SUBJECT;
  if (subject) env.GSD_PROHIB_SUBJECT = resolve(root, subject);
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, argv, { cwd: root, env, encoding: "utf8", timeout,
    maxBuffer, windowsHide: true });
  writeFileSync(join(runRoot, `${label}.stdout.log`), result.stdout ?? "");
  writeFileSync(join(runRoot, `${label}.stderr.log`), result.stderr ?? "");
  const receipt = { label, command: process.execPath, argv, subject: subject ?? null, startedAt,
    endedAt: new Date().toISOString(), status: result.status, signal: result.signal,
    error: result.error?.message ?? null };
  receipts.push(receipt);
  writeFileSync(join(runRoot, "commands.json"), JSON.stringify(receipts, null, 2));
  assert.equal(receipt.error, null, `${label}: ${receipt.error}`);
  assert.equal(receipt.signal, null, `${label}: terminated`);
  return result;
}

function assertTap(result, target, red) {
  const out = result.stdout;
  const count = (name) => Number(out.match(new RegExp(`^# ${name} (\\d+)`, "mu"))?.[1] ?? 0);
  assert.ok(count("tests") >= 2, `${target}: expected two actual behavioral tests`);
  assert.equal(count("cancelled"), 0);
  assert.equal(count("skipped"), 0);
  assert.equal(count("todo"), 0);
  if (red) {
    assert.notEqual(result.status, 0, "violation subject must fail");
    assert.ok(count("fail") >= 1);
    assert.match(out, /^not ok \d+ - T30-/mu, "RED must be a named behavioral assertion, not a module crash");
    assert.match(out, /ERR_ASSERTION/u, "violation must reach an actual assertion");
  } else {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(count("fail"), 0);
    assert.ok(count("pass") >= 2);
  }
}

const specs = [
  { id: "t30-full", plan: "04", module: "task-run", statement: "A full task must not be accepted as ordinary quick when full-stage evidence is missing.",
    bad: `export async function startTask(options) {
  const result = await production.startTask(options);
  if (result.run.gsd?.fullEvidence?.status === "missing") {
    return { ...result, run: { ...result.run, status: "accepted" } };
  }
  return result;
}` },
  { id: "t30-phase", plan: "05", module: "task-gsd-lifecycle", statement: "A phase run must not add unapproved phases or bypass a blocked phase.",
    bad: `export async function orchestrateMultiPhaseProgression(options) {
  const approved = options.contract.scope.phaseSelection.phaseIds;
  const extra = (options.phases ?? []).filter((id) => !approved.includes(id));
  if (extra.length) {
    const contract = { ...options.contract, scope: { ...options.contract.scope,
      phaseSelection: { ...options.contract.scope.phaseSelection, phaseIds: [...approved, ...extra] } } };
    return production.orchestrateMultiPhaseProgression({ ...options, contract });
  }
  const result = await production.orchestrateMultiPhaseProgression(options);
  if (result.finalStatus !== "completed" && approved.length > 1) {
    // Deliberately dispatch a real successor despite the failed predecessor.
    await production.orchestrateMultiPhaseProgression({ ...options, phases: [approved[1]] });
  }
  return result;
}` },
];

const results = [];
try {
  for (const spec of specs) {
    const productionUrl = pathToFileURL(join(root, "dist", "src", "core", `${spec.module}.js`)).href;
    const cleanFixture = `${controls}/${spec.id}.clean.mjs`;
    const violationFixture = `${controls}/${spec.id}.violation.mjs`;
    writeFileSync(join(root, cleanFixture), `export * from ${JSON.stringify(productionUrl)};\n`);
    writeFileSync(join(root, violationFixture), `import * as production from ${JSON.stringify(productionUrl)};\nexport * from ${JSON.stringify(productionUrl)};\n${spec.bad}\n`);
    const target = `dist/test/prohibitions/${spec.id}.consumer.test.js`;
    const planPath = `.planning/phases/30-six-execution-styles-and-quality-binding/30-${spec.plan}-PLAN.md`;
    const planText = readFileSync(join(root, planPath), "utf8");
    const frontmatter = planText.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
    assert.ok(frontmatter, "plan frontmatter required");
    const prohibition = parseYaml(frontmatter).must_haves.prohibitions.find((item) => item.statement === spec.statement);
    assert.ok(prohibition, "exact existing prohibition required");
    const check = { kind: prohibition.check_kind, target: prohibition.check_target,
      violationFixture: prohibition.check_violation_fixture, cleanFixture: prohibition.check_clean_fixture };
    assert.deepEqual(check, { kind: "node-test", target, violationFixture, cleanFixture }, "plan descriptor must wire these controls");
    const argv = ["--test", "--test-reporter=tap", "--", target];
    assertTap(run(`${spec.id}.violation`, argv, violationFixture), target, true);
    assertTap(run(`${spec.id}.clean`, argv, cleanFixture), target, false);
    assertTap(run(`${spec.id}.production`, argv), target, false);
    // The installed producer independently re-runs RED, clean GREEN, and default
    // GREEN. A zero exit without its complete evidence payload is insufficient.
    const request = { prohibition, check, mode: "interactive" };
    const requestPath = join(runRoot, `${spec.id}.request.json`);
    writeFileSync(requestPath, JSON.stringify(request, null, 2));
    const produced = run(`${spec.id}.producer`, [gsdTools, "check", "prohibition-enforcement", requestPath, "--raw"], null, 95_000);
    assert.equal(produced.status, 0, produced.stderr);
    const payload = JSON.parse(produced.stdout);
    assert.equal(payload.status, "green", JSON.stringify(payload));
    assert.equal(payload.flagged, false);
    assert.equal(payload.located, true);
    assert.ok(payload.evidence.some((item) => item.kind === "node-test" && item.target === target
      && item.failFirst === true && item.passed === true && item.failFirstProof === "violation-fixture"),
    "producer must independently prove fail-first and genuine pass");
    results.push({ id: spec.id, payload, controls: { [cleanFixture]: hash(cleanFixture), [violationFixture]: hash(violationFixture) } });
    console.log(`${spec.id}: RED violation, GREEN clean/production, installed producer GREEN`);
  }
  const after = hashes();
  writeFileSync(join(runRoot, "source-hashes.after.json"), JSON.stringify(after, null, 2));
  assert.deepEqual(after, sourceHashes, "verified source changed during this run; rerun after build");
  const summary = { status: "green", head: head.stdout.trim(), runRoot, sourceHashes, results,
    limitation: "Deterministic local fixture evidence through installed GSD; does not certify paid native six-route execution, human judgment, macOS/Linux, or release approval." };
  writeFileSync(join(runRoot, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`Receipts: ${runRoot}`);
} catch (error) {
  writeFileSync(join(runRoot, "failure.json"), JSON.stringify({ status: "blocked", message: error.message, sourceHashes, results }, null, 2));
  console.error(`Blocked: ${error.message}\nReceipts: ${runRoot}`);
  process.exitCode = 1;
}
