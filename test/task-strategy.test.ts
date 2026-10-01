import assert from "node:assert/strict";
import test from "node:test";
import {
  computeFailureFingerprint,
  formatBlockedReport,
  NoProgressDetector,
  normalizeErrorMessage,
  selectRepairStrategy,
  type BlockedReport,
  type FailureHistoryEntry,
} from "../src/core/task-strategy.js";

test("normalizeErrorMessage strips ANSI sequences, paths, line numbers, and timestamps", () => {
  const raw =
    "\u001b[31mError at 2026-10-01T18:49:13.123Z in C:\\Users\\alpha\\project\\src\\index.ts:42:15 (pointer 0x7ffd5e2b4c10): Failed!\u001b[0m";
  const normalized = normalizeErrorMessage(raw);

  assert.ok(!normalized.includes("2026-10-01"));
  assert.ok(!normalized.includes("users"));
  assert.ok(!normalized.includes("42:15"));
  assert.ok(!normalized.includes("0x7ffd5e2b4c10"));
  assert.ok(!normalized.includes("\u001b"));

  assert.equal(normalized, "error at [time] in [path]:[line]:[col] (pointer [addr]): failed!");
});

test("normalizeErrorMessage normalizes POSIX paths", () => {
  const raw = "Error: open /var/log/app/error.log:100 failed";
  const normalized = normalizeErrorMessage(raw);
  assert.equal(normalized, "error: open [path]:[line] failed");
});

test("computeFailureFingerprint produces identical hashes for transient variations", () => {
  const err1 = "AssertionError in C:\\builds\\run-1\\test.ts:10:5 at 2026-09-01T12:00:00Z: Expected 1 to be 2";
  const err2 = "AssertionError in D:\\workspace\\run-2\\test.ts:99:1 at 2026-10-01T15:30:00Z: Expected 1 to be 2";

  const fp1 = computeFailureFingerprint("crit-1", "mismatch", err1);
  const fp2 = computeFailureFingerprint("crit-1", "mismatch", err2);

  assert.equal(fp1, fp2);
  assert.ok(fp1.startsWith("crit-1:mismatch:"));
});

test("computeFailureFingerprint differentiates different causes or criteria", () => {
  const err = "Failed to parse json";
  const fp1 = computeFailureFingerprint("crit-1", "syntax", err);
  const fp2 = computeFailureFingerprint("crit-2", "syntax", err);
  const fp3 = computeFailureFingerprint("crit-1", "runtime", err);

  assert.notEqual(fp1, fp2);
  assert.notEqual(fp1, fp3);
});

test("NoProgressDetector detects 2 consecutive identical failures and resets on new error or success", () => {
  const detector = new NoProgressDetector();
  const fpA = computeFailureFingerprint("c1", "cause1", "error A");
  const fpB = computeFailureFingerprint("c1", "cause1", "error B");

  const entry1: FailureHistoryEntry = {
    attemptIndex: 1,
    criterionId: "c1",
    cause: "cause1",
    fingerprint: fpA,
    rawError: "error A",
  };

  const res1 = detector.recordAttempt(entry1);
  assert.equal(res1.repeated, false);
  assert.equal(res1.consecutiveCount, 1);

  // Second identical failure triggers repeated: true
  const entry2: FailureHistoryEntry = {
    attemptIndex: 2,
    criterionId: "c1",
    cause: "cause1",
    fingerprint: fpA,
    rawError: "error A",
  };

  const res2 = detector.recordAttempt(entry2);
  assert.equal(res2.repeated, true);
  assert.equal(res2.consecutiveCount, 2);

  // Different error resets consecutive count to 1
  const entry3: FailureHistoryEntry = {
    attemptIndex: 3,
    criterionId: "c1",
    cause: "cause1",
    fingerprint: fpB,
    rawError: "error B",
  };

  const res3 = detector.recordAttempt(entry3);
  assert.equal(res3.repeated, false);
  assert.equal(res3.consecutiveCount, 1);

  // Record success clears state
  detector.recordSuccess();
  const res4 = detector.recordAttempt(entry3);
  assert.equal(res4.repeated, false);
  assert.equal(res4.consecutiveCount, 1);
});

test("selectRepairStrategy returns stage-0-default for empty or single failure", () => {
  assert.equal(selectRepairStrategy([]).stage, "stage-0-default");

  const fp = computeFailureFingerprint("c1", "cause", "err");
  const single: FailureHistoryEntry = {
    attemptIndex: 1,
    criterionId: "c1",
    cause: "cause",
    fingerprint: fp,
    rawError: "err",
  };

  const res = selectRepairStrategy([single]);
  assert.equal(res.stage, "stage-0-default");
  assert.equal(res.promptInjection, null);
  assert.equal(res.blockedReport, null);
});

test("selectRepairStrategy transitions through Stage 1, Stage 2, and Stage 3 based on consecutive failures", () => {
  const fp = computeFailureFingerprint("c1", "cause", "err");
  const baseEntry = (idx: number): FailureHistoryEntry => ({
    attemptIndex: idx,
    criterionId: "c1",
    cause: "cause",
    fingerprint: fp,
    rawError: "err",
    reproduction: {
      inputText: "npm test -- --filter=c1",
      observedExitCode: 1,
      observedStdout: "assertion failed",
      summary: "c1 unit test assertion failure",
    },
  });

  const history: FailureHistoryEntry[] = [baseEntry(1), baseEntry(2)];

  // 2 consecutive failures -> Stage 1 (reproduction injection)
  const res1 = selectRepairStrategy(history);
  assert.equal(res1.stage, "stage-1-reproduction-injection");
  assert.equal(res1.activeCriterionId, "c1");
  assert.ok(res1.promptInjection?.includes("CRITICAL REPAIR INSTRUCTION"));
  assert.ok(res1.promptInjection?.includes("npm test -- --filter=c1"));
  assert.equal(res1.blockedReport, null);

  // 3 consecutive failures -> Stage 2 (single criterion focus)
  history.push(baseEntry(3));
  const res2 = selectRepairStrategy(history);
  assert.equal(res2.stage, "stage-2-single-criterion-focus");
  assert.equal(res2.activeCriterionId, "c1");
  assert.ok(res2.promptInjection?.includes("CRITICAL SCOPE RESTRICTION"));
  assert.ok(res2.promptInjection?.includes("c1"));
  assert.equal(res2.blockedReport, null);

  // 4 consecutive failures -> Stage 3 (blocked)
  history.push(baseEntry(4));
  const res3 = selectRepairStrategy(history);
  assert.equal(res3.stage, "stage-3-blocked");
  assert.equal(res3.promptInjection, null);
  assert.ok(res3.blockedReport !== null);
  assert.equal(res3.blockedReport.status, "blocked");
  assert.equal(res3.blockedReport.consecutiveFailures, 4);
  assert.deepEqual(res3.blockedReport.attemptedStrategies, [
    "stage-1-reproduction-injection",
    "stage-2-single-criterion-focus",
  ]);
  assert.equal(res3.blockedReport.reproductionEvidence.criterionId, "c1");
  assert.equal(res3.blockedReport.reproductionEvidence.inputText, "npm test -- --filter=c1");
  assert.equal(res3.blockedReport.reproductionEvidence.observedExitCode, 1);
});

test("formatBlockedReport renders complete structured output with next action", () => {
  const report: BlockedReport = {
    status: "blocked",
    failureFingerprint: "crit-1:err:abc12345",
    consecutiveFailures: 4,
    attemptedStrategies: ["stage-1-reproduction-injection", "stage-2-single-criterion-focus"],
    reproductionEvidence: {
      criterionId: "crit-1",
      inputText: "input test data",
      observedExitCode: 1,
      observedStdout: "fatal mismatch",
      summary: "crit-1 failed with fatal mismatch",
    },
    nextAction: "Inspect test inputs or implementation manually for criterion crit-1.",
  };

  const output = formatBlockedReport(report);
  assert.ok(output.includes("TASK EXECUTION BLOCKED"));
  assert.ok(output.includes("crit-1:err:abc12345"));
  assert.ok(output.includes("Consecutive Failures: 4"));
  assert.ok(output.includes("stage-1-reproduction-injection -> stage-2-single-criterion-focus"));
  assert.ok(output.includes("input test data"));
  assert.ok(output.includes("Exit Code:    1"));
  assert.ok(output.includes("fatal mismatch"));
  assert.ok(output.includes("Inspect test inputs or implementation manually"));
});

test("selectRepairStrategy resets progression when a different failure occurs in between", () => {
  const fpA = computeFailureFingerprint("c1", "cause", "err A");
  const fpB = computeFailureFingerprint("c1", "cause", "err B");

  const entryA: FailureHistoryEntry = {
    attemptIndex: 1,
    criterionId: "c1",
    cause: "cause",
    fingerprint: fpA,
    rawError: "err A",
  };
  const entryB: FailureHistoryEntry = {
    attemptIndex: 2,
    criterionId: "c1",
    cause: "cause",
    fingerprint: fpB,
    rawError: "err B",
  };

  // Two of error A -> stage-1
  assert.equal(selectRepairStrategy([entryA, entryA]).stage, "stage-1-reproduction-injection");

  // Intervening error B -> trailing count of error B is only 1 -> stage-0-default
  assert.equal(selectRepairStrategy([entryA, entryA, entryB]).stage, "stage-0-default");

  // Two of error B -> stage-1
  assert.equal(selectRepairStrategy([entryA, entryA, entryB, entryB]).stage, "stage-1-reproduction-injection");
});

test("normalizeErrorMessage strips diverse ANSI color and style formatting", () => {
  const colored = "\u001b[1m\u001b[38;5;196mBold Red Error\u001b[0m: \u001b[4mUnderlined\u001b[24m failure";
  const normalized = normalizeErrorMessage(colored);
  assert.equal(normalized, "bold red error: underlined failure");
});

