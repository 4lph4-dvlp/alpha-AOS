import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateFaultCase,
  evaluateThreeOsRun,
  FAULT_CASE_DEFINITIONS,
  FAULT_CASE_IDS,
  type CiLegResult,
  type FaultCaseId,
  type FaultCaseResult,
} from "../src/core/release-fault-proof.js";
const scriptUrl = new URL("../../scripts/release-evidence.mjs", import.meta.url).href;

const candidateSha = "c0ffee1234567890abcdef1234567890abcdef12";
const candidateTarballSha = "e".repeat(64);
const observedAt = "2026-10-10T10:00:00.000Z";

function makeFaultCase(
  id: FaultCaseId,
  overrides?: {
    greenPassed?: boolean;
    greenExit?: number;
    redFailed?: boolean;
    redExit?: number;
    failedAssertion?: string | null;
    logReference?: string;
  },
): FaultCaseResult {
  const meta = FAULT_CASE_DEFINITIONS[id];
  return evaluateFaultCase({
    id,
    green: {
      exitCode: overrides?.greenExit ?? 0,
      passed: overrides?.greenPassed ?? true,
      failedAssertion: null,
      observation: `Normal ${id} verification held`,
      logReference: `logs/${id}-green.log`,
    },
    red: {
      exitCode: overrides?.redExit ?? 1,
      passed: !(overrides?.redFailed ?? true),
      failedAssertion: overrides?.failedAssertion !== undefined ? overrides.failedAssertion : meta.expectedAssertion,
      observation: `Injected ${id} defect triggered intended assertion`,
      logReference: overrides?.logReference ?? `logs/${id}-red.log`,
    },
  });
}

function makePassingLeg(os: "windows" | "macos" | "linux"): CiLegResult {
  return {
    os,
    runId: "123456789",
    jobId: `job-${os}-101`,
    headSha: candidateSha,
    tarballSha256: candidateTarballSha,
    status: "passed",
    faults: FAULT_CASE_IDS.map((id) => makeFaultCase(id)),
    logUrl: `https://github.com/example/ci/runs/123456789/job-${os}`,
    diagnostics: null,
  };
}

// ---------------------------------------------------------------------------
// Task 1: Five Fault Cases and Named Assertion Controls (D-05, D-07)
// ---------------------------------------------------------------------------

test("five fault cases have expected named assertions and detect deliberate defects", () => {
  assert.equal(FAULT_CASE_IDS.length, 5);

  for (const id of FAULT_CASE_IDS) {
    const meta = FAULT_CASE_DEFINITIONS[id];
    assert.ok(meta.expectedAssertion.length > 0);

    const evaluated = makeFaultCase(id);
    assert.equal(evaluated.id, id);
    assert.equal(evaluated.detected, true);
    assert.equal(evaluated.reason, null);
    assert.equal(evaluated.expectedAssertion, meta.expectedAssertion);
    assert.equal(evaluated.red.failedAssertion, meta.expectedAssertion);
    assert.equal(evaluated.green.passed, true);
    assert.equal(evaluated.red.passed, false);
  }
});

test("evaluateFaultCase rejects red exit if assertion name does not match expected", () => {
  const mismatched = makeFaultCase("crash", {
    failedAssertion: "assertUnexpectedOtherAssertion",
  });
  assert.equal(mismatched.detected, false);
  assert.match(mismatched.reason ?? "", /Fault assertion mismatch/i);
  assert.match(mismatched.reason ?? "", /assertReconciledEffects/i);
});

test("evaluateFaultCase rejects if green leg fails", () => {
  const greenFailed = makeFaultCase("concurrency", {
    greenPassed: false,
    greenExit: 2,
  });
  assert.equal(greenFailed.detected, false);
  assert.match(greenFailed.reason ?? "", /Normal execution leg failed/i);
});

test("evaluateFaultCase rejects if red leg does not fail (exit 0)", () => {
  const redPassed = makeFaultCase("cancellation", {
    redFailed: false,
    redExit: 0,
  });
  assert.equal(redPassed.detected, false);
  assert.match(redPassed.reason ?? "", /Fault injection leg did not fail/i);
});

test("evaluateFaultCase rejects if red leg missing log reference", () => {
  const missingLog = makeFaultCase("false-acceptance", {
    logReference: "   ",
  });
  assert.equal(missingLog.detected, false);
  assert.match(missingLog.reason ?? "", /missing inspectable log reference/i);
});

// ---------------------------------------------------------------------------
// Task 2: Single Candidate SHA and Three OS Run Evaluation (D-06, D-08)
// ---------------------------------------------------------------------------

test("evaluateThreeOsRun passes when all three OS legs match SHA, tarball, and detect all faults", () => {
  const legs: CiLegResult[] = [
    makePassingLeg("windows"),
    makePassingLeg("macos"),
    makePassingLeg("linux"),
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs,
  });

  assert.equal(evaluation.overallStatus, "passed");
  assert.equal(evaluation.reason, null);
  assert.equal(evaluation.summary.requiredLegsCount, 3);
  assert.equal(evaluation.summary.presentLegsCount, 3);
  assert.equal(evaluation.summary.passedLegsCount, 3);
  assert.equal(evaluation.summary.allFaultsDetected, true);
});

test("evaluateThreeOsRun fails closed when any required OS leg is missing", () => {
  const incompleteLegs: CiLegResult[] = [
    makePassingLeg("windows"),
    makePassingLeg("linux"), // Missing macos
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs: incompleteLegs,
  });

  assert.equal(evaluation.overallStatus, "indeterminate");
  assert.match(evaluation.reason ?? "", /Missing required CI OS leg\(s\): macos/i);
  assert.ok(evaluation.nextAction);
});

test("evaluateThreeOsRun rejects if any leg has commit SHA mismatch", () => {
  const legs: CiLegResult[] = [
    makePassingLeg("windows"),
    { ...makePassingLeg("macos"), headSha: "deadbeef00000000000000000000000000000000" },
    makePassingLeg("linux"),
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs,
  });

  assert.equal(evaluation.overallStatus, "indeterminate");
  assert.match(evaluation.reason ?? "", /commit SHA mismatch/i);
  assert.ok(evaluation.nextAction);
});

test("evaluateThreeOsRun rejects if any leg has tarball SHA mismatch", () => {
  const legs: CiLegResult[] = [
    makePassingLeg("windows"),
    makePassingLeg("macos"),
    { ...makePassingLeg("linux"), tarballSha256: "0".repeat(64) },
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs,
  });

  assert.equal(evaluation.overallStatus, "indeterminate");
  assert.match(evaluation.reason ?? "", /package tarball SHA-256 mismatch/i);
  assert.ok(evaluation.nextAction);
});

test("evaluateThreeOsRun classifies leg failure reasons (product_failed vs environment_failed)", () => {
  const productFailedLegs: CiLegResult[] = [
    makePassingLeg("windows"),
    { ...makePassingLeg("macos"), status: "product_failed", diagnostics: "Core test suite timed out on macOS" },
    makePassingLeg("linux"),
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs: productFailedLegs,
  });

  assert.equal(evaluation.overallStatus, "product_failed");
  assert.match(evaluation.reason ?? "", /macos.*product_failed/i);

  const envFailedLegs: CiLegResult[] = [
    { ...makePassingLeg("windows"), status: "environment_failed", diagnostics: "Runner disk full" },
    makePassingLeg("macos"),
    makePassingLeg("linux"),
  ];

  const envEvaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs: envFailedLegs,
  });

  assert.equal(envEvaluation.overallStatus, "environment_failed");
  assert.match(envEvaluation.reason ?? "", /windows.*environment_failed/i);
});

test("evaluateThreeOsRun rejects if any leg misses a fault control", () => {
  const undetectedFaultLeg = makePassingLeg("windows");
  // Replace concurrency fault with an undetected result
  const brokenFaults = undetectedFaultLeg.faults.map((f) =>
    f.id === "concurrency" ? { ...f, detected: false, reason: "Defect did not trigger lock conflict" } : f,
  );

  const legs: CiLegResult[] = [
    { ...undetectedFaultLeg, faults: brokenFaults },
    makePassingLeg("macos"),
    makePassingLeg("linux"),
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs,
  });

  assert.equal(evaluation.overallStatus, "product_failed");
  assert.match(evaluation.reason ?? "", /undetected fault control: 'concurrency'/i);
});

test("evaluateThreeOsRun rejects mixed runId across OS legs (CR-04)", () => {
  const legs: CiLegResult[] = [
    { ...makePassingLeg("windows"), runId: "run-0" },
    { ...makePassingLeg("macos"), runId: "run-1" },
    { ...makePassingLeg("linux"), runId: "run-2" },
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs,
  });

  assert.equal(evaluation.overallStatus, "indeterminate");
  assert.match(evaluation.reason ?? "", /Mixed or missing CI workflow runId/i);
});

test("evaluateThreeOsRun rejects duplicate OS legs (CR-04)", () => {
  const legs: CiLegResult[] = [
    makePassingLeg("windows"),
    makePassingLeg("windows"),
    makePassingLeg("linux"),
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs,
  });

  assert.equal(evaluation.overallStatus, "indeterminate");
  assert.match(evaluation.reason ?? "", /Duplicate CI OS leg/i);
});

test("evaluateThreeOsRun rejects legs missing non-empty jobId or logUrl (CR-04)", () => {
  const legs: CiLegResult[] = [
    { ...makePassingLeg("windows"), jobId: "" },
    makePassingLeg("macos"),
    makePassingLeg("linux"),
  ];

  const evaluation = evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs,
  });

  assert.equal(evaluation.overallStatus, "indeterminate");
  assert.match(evaluation.reason ?? "", /missing required non-empty jobId or logUrl/i);
});

test("scripts/release-evidence.mjs parseCiMetadata parses and evaluates valid metadata payload", async () => {
  const { parseCiMetadata } = await import(scriptUrl);
  const metadata = {
    candidateSha,
    candidateTarballSha256: candidateTarballSha,
    legs: [
      makePassingLeg("windows"),
      makePassingLeg("macos"),
      makePassingLeg("linux"),
    ],
  };

  const result = parseCiMetadata(metadata);
  assert.equal(result.overallStatus, "passed");
  assert.equal(result.summary.passedLegsCount, 3);
});
