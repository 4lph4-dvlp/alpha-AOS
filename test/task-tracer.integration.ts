// The Phase 14 vertical tracer on REAL agents.
//
// Explicitly invoked, never part of `npm test`: `scripts/run-tests.mjs`
// enumerates only `*.test.js`, and this file ends in `.integration.ts`. Every
// test here spends model turns under the user's own Codex and Claude accounts
// (one GSD quick session and one review per run). Run it by name:
//
//   npm run build && node scripts/run-tests.mjs --test-name-pattern="accept a correct" --files dist/test/task-tracer.integration.js
//
// It never skips. A host without the proven bootstrap pair or without GSD Core
// installed for Codex FAILS with a message starting `NOT PROVEN:`, because a
// skipped live proof would read as a passed one (T-14-42).
//
// Every live step goes through the compiled CLI with a scratch
// ALPHA_AOS_STATE_DIR, and the real agents only ever work inside a generated
// project under the OS temp directory with its own git repository (D-09,
// T-14-41) — never in this repository and never in the host state root.

import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { probeTaskAgentPair, TASK_BOOTSTRAP_PAIR } from "../src/adapters/task-agents.js";
import { runProcess, type ProcessResult } from "../src/core/process.js";
import { resolveInstalledGsdTools } from "../src/core/task-gsd.js";
import { readTaskReport, type TaskRunRecord } from "../src/core/task-run.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  liveTaskEnvironment,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const OUTPUT_BYTES = 4 * 1024 * 1024;
const START_TIMEOUT_MS = 75 * 60 * 1000;
const STEP_TIMEOUT_MS = 60 * 1000;

/** Fails with `NOT PROVEN:` unless this host has the proven pair and GSD Core for Codex. */
async function requireLiveHarnesses(): Promise<void> {
  const reasons: string[] = [];
  const pair = await probeTaskAgentPair({ ...TASK_BOOTSTRAP_PAIR, reviewerSession: "fresh-read-only" });
  if (!pair.supported) reasons.push(...pair.missingProof);
  if (resolveInstalledGsdTools() === null) reasons.push("GSD Core is not installed for the Codex controller");
  if (reasons.length > 0) throw new Error(`NOT PROVEN: ${reasons.join("; ")}`);
}

async function aos(fixture: TaskFixture, args: readonly string[], timeoutMs = STEP_TIMEOUT_MS): Promise<{ result: ProcessResult; ms: number }> {
  const started = Date.now();
  const result = await runProcess({
    executable: process.execPath,
    args: [cliEntry, ...args],
    cwd: fixture.scratch,
    environment: liveTaskEnvironment(fixture.stateRoot),
    timeoutMs,
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
  return { result, ms: Date.now() - started };
}

function expectOk(step: string, result: ProcessResult): void {
  assert.equal(result.exitCode, 0, `${step} failed (${result.code}): ${result.stderr.excerpt}`);
}

/**
 * Preview, approve and start one contract through the CLI only. Returns the
 * run as printed on stdout (the redacted JSON envelope) and as persisted in
 * the scratch state root, which keeps the observed session ids the envelope
 * withholds.
 */
async function previewApproveStart(
  context: TestContext,
  fixture: TaskFixture,
  contractId: string,
): Promise<{ start: ProcessResult; printed: TaskRunRecord; run: TaskRunRecord; ms: number }> {
  const preview = await aos(fixture, ["task", "preview", fixture.contractPath, "--json"]);
  expectOk("task preview", preview.result);
  const digest = (JSON.parse(preview.result.stdout.excerpt) as { digest: string }).digest;
  const approve = await aos(fixture, ["task", "approve", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  expectOk("task approve", approve.result);

  const start = await aos(fixture, ["task", "start", fixture.contractPath, "--contract-digest", digest, "--apply", "--json"], START_TIMEOUT_MS);
  let printed: TaskRunRecord;
  try {
    printed = JSON.parse(start.result.stdout.excerpt) as TaskRunRecord;
  } catch {
    throw new Error(
      `task start printed no run record (${start.result.code}, exit ${String(start.result.exitCode)}): ${start.result.stderr.excerpt.slice(0, 4000)}`,
    );
  }
  const run = await readTaskReport({ stateRoot: fixture.stateRoot, contractId, runId: printed.runId });
  assert.ok(run !== null, `run ${printed.runId} is not persisted in the scratch state root`);
  // The whole persisted record, on every outcome, so a failed live run can be
  // diagnosed without spending another one. It passed the credential check
  // before it was written.
  context.diagnostic(`run record ${JSON.stringify(run)}`);
  if (start.result.stderr.excerpt.trim() !== "") context.diagnostic(`task start stderr ${start.result.stderr.excerpt.slice(0, 4000)}`);
  return { start: start.result, printed, run, ms: start.ms };
}

test("a real Codex GSD quick run and a fresh Claude review accept a correct inventory-summary CLI", async (context) => {
  await requireLiveHarnesses();
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));

  const { start, printed, run, ms } = await previewApproveStart(context, fixture, "inventory-summary");
  assert.equal(printed.status, run.status);
  assert.equal(printed.runId, run.runId);

  assert.equal(start.exitCode, 0, `task start exited ${String(start.exitCode)} with status ${run.status}`);
  assert.equal(run.status, "accepted");
  assert.ok(run.artifact !== null && run.verdict !== null && run.executor !== null && run.reviewer !== null);
  assert.ok(run.reviewer.report !== null, "the reviewer returned no bound report");
  assert.ok(run.gsd !== null && run.effects !== null);

  assert.equal(run.verdict.rows.length, 2);
  for (const row of run.verdict.rows) {
    assert.equal(row.verdict, "pass", `${row.criterionId}: ${row.reason}`);
    assert.equal(row.measured.outcome, "pass", `${row.criterionId}: ${row.measured.detail}`);
    assert.equal(row.review?.verdict, "pass", `${row.criterionId}: ${row.review?.evidence ?? "no review"}`);
    assert.equal(row.artifactDigest, run.artifact.digest);
  }
  assert.equal(run.reviewer.report.artifactDigest, run.artifact.digest);

  assert.equal(run.reviewer.sessionId, run.reviewer.requestedSessionId);
  assert.notEqual(run.reviewer.sessionId, run.executor.sessionId);
  assert.equal(run.executor.harness, "codex");
  assert.equal(run.reviewer.harness, "claude");
  assert.ok(run.executor.version !== null, "the executor version was not recorded");
  assert.ok(run.reviewer.version !== null, "the reviewer version was not recorded");

  assert.equal(run.gsd.status, "verified", `GSD evidence missing: ${run.gsd.missing.join("; ")}`);
  assert.ok(run.gsd.quickId !== null);
  assert.deepEqual(run.effects.violations, []);
  assert.ok(run.decisions.length >= 1, `no decision was recorded (log ${run.decisionLog?.status ?? "not read"}: ${run.decisionLog?.reason ?? ""})`);

  const report = await aos(fixture, ["task", "report", "inventory-summary"]);
  expectOk("task report", report.result);
  assert.match(report.result.stdout.excerpt, /ACCEPTED/u);

  context.diagnostic(
    [
      `run ${run.runId}`,
      `executor codex-cli ${run.executor.version}`,
      `reviewer ${run.reviewer.version} (Claude Code)`,
      `executor session ${run.executor.sessionId ?? "none"}`,
      `reviewer session ${run.reviewer.sessionId ?? "none"} (requested ${run.reviewer.requestedSessionId})`,
      `artifact ${run.artifact.digest}`,
      `contract ${run.contractDigest}`,
      `gsd quick ${run.gsd.quickId}`,
      `cli duration ${ms} ms`,
    ].join(" | "),
  );
});
