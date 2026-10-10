export type FaultCaseId =
  | "crash"
  | "cancellation"
  | "concurrency"
  | "duplicate-effect"
  | "false-acceptance";

export const FAULT_CASE_IDS: readonly FaultCaseId[] = Object.freeze([
  "crash",
  "cancellation",
  "concurrency",
  "duplicate-effect",
  "false-acceptance",
]);

export interface FaultCaseMetadata {
  readonly id: FaultCaseId;
  readonly title: string;
  readonly description: string;
  readonly expectedAssertion: string;
}

export const FAULT_CASE_DEFINITIONS: Readonly<Record<FaultCaseId, FaultCaseMetadata>> = Object.freeze({
  crash: {
    id: "crash",
    title: "Crash & Resume Effect Reconciliation",
    description: "Recovers state after unexpected process exit and reconciles recorded effects before resumption",
    expectedAssertion: "assertReconciledEffects",
  },
  cancellation: {
    id: "cancellation",
    title: "Cross-Process Cancellation & Termination",
    description: "Refuses stopped confirmation until child worker process termination is verified",
    expectedAssertion: "assertChildWorkerTerminated",
  },
  concurrency: {
    id: "concurrency",
    title: "Single Controller Writer Lease",
    description: "Rejects concurrent controller acquisition and enforces mutual exclusivity on active lease",
    expectedAssertion: "assertSingleActiveControllerLease",
  },
  "duplicate-effect": {
    id: "duplicate-effect",
    title: "Effect Key Deduplication",
    description: "Prevents duplicate effect key application and journals idempotency conflict",
    expectedAssertion: "assertEffectKeyDeduplicated",
  },
  "false-acceptance": {
    id: "false-acceptance",
    title: "Mandatory Criterion & Review Verification",
    description: "Refuses accepted task verdict when mandatory criteria or review receipts are missing or unverified",
    expectedAssertion: "assertMandatoryCriteriaVerified",
  },
});

export interface FaultExecutionLeg {
  readonly exitCode: number;
  readonly passed: boolean;
  readonly failedAssertion: string | null;
  readonly observation: string;
  readonly logReference: string;
}

export interface FaultCaseResult {
  readonly id: FaultCaseId;
  readonly expectedAssertion: string;
  readonly green: FaultExecutionLeg;
  readonly red: FaultExecutionLeg;
  readonly detected: boolean;
  readonly reason: string | null;
}

export function evaluateFaultCase(input: {
  readonly id: FaultCaseId;
  readonly green: FaultExecutionLeg;
  readonly red: FaultExecutionLeg;
}): FaultCaseResult {
  const meta = FAULT_CASE_DEFINITIONS[input.id];
  const expectedAssertion = meta.expectedAssertion;

  // Green leg must pass with exitCode 0, passed === true, failedAssertion === null
  if (!input.green.passed || input.green.exitCode !== 0) {
    return {
      id: input.id,
      expectedAssertion,
      green: input.green,
      red: input.red,
      detected: false,
      reason: `Normal execution leg failed for ${input.id}: exitCode=${input.green.exitCode}`,
    };
  }

  // Red leg must fail with non-zero exitCode or passed === false
  if (input.red.passed || input.red.exitCode === 0) {
    return {
      id: input.id,
      expectedAssertion,
      green: input.green,
      red: input.red,
      detected: false,
      reason: `Fault injection leg did not fail for ${input.id}: exitCode=${input.red.exitCode}`,
    };
  }

  // Red leg MUST fail on the exact named expectedAssertion
  if (input.red.failedAssertion !== expectedAssertion) {
    return {
      id: input.id,
      expectedAssertion,
      green: input.green,
      red: input.red,
      detected: false,
      reason: `Fault assertion mismatch for ${input.id}: expected '${expectedAssertion}', got '${input.red.failedAssertion ?? "null"}'`,
    };
  }

  // Red leg must have an inspectable logReference
  if (!input.red.logReference || input.red.logReference.trim().length === 0) {
    return {
      id: input.id,
      expectedAssertion,
      green: input.green,
      red: input.red,
      detected: false,
      reason: `Fault execution missing inspectable log reference for ${input.id}`,
    };
  }

  return {
    id: input.id,
    expectedAssertion,
    green: input.green,
    red: input.red,
    detected: true,
    reason: null,
  };
}

export type CiLegStatus =
  | "passed"
  | "product_failed"
  | "environment_failed"
  | "not_run"
  | "indeterminate";

export type CiOs = "windows" | "macos" | "linux";

export interface CiLegResult {
  readonly os: CiOs;
  readonly runId: string;
  readonly jobId: string;
  readonly headSha: string;
  readonly tarballSha256: string;
  readonly status: CiLegStatus;
  readonly faults: readonly FaultCaseResult[];
  readonly logUrl: string;
  readonly diagnostics: string | null;
}

export interface ThreeOsRunEvaluation {
  readonly releaseSha: string;
  readonly tarballSha256: string;
  readonly evaluatedAt: string;
  readonly overallStatus: CiLegStatus;
  readonly legs: readonly CiLegResult[];
  readonly reason: string | null;
  readonly nextAction: string | null;
  readonly summary: {
    readonly requiredLegsCount: number;
    readonly presentLegsCount: number;
    readonly passedLegsCount: number;
    readonly allFaultsDetected: boolean;
  };
}

const REQUIRED_OS_LEGS: readonly CiOs[] = Object.freeze(["windows", "macos", "linux"]);

export function evaluateThreeOsRun(options: {
  readonly candidateSha: string;
  readonly candidateTarballSha256: string;
  readonly legs: readonly CiLegResult[];
  readonly evaluatedAt?: string;
}): ThreeOsRunEvaluation {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();

  // Enforce no duplicate OS legs
  const seenOs = new Set<CiOs>();
  for (const leg of options.legs) {
    if (seenOs.has(leg.os)) {
      return {
        releaseSha: options.candidateSha,
        tarballSha256: options.candidateTarballSha256,
        evaluatedAt,
        overallStatus: "indeterminate",
        legs: options.legs,
        reason: `Duplicate CI OS leg detected: ${leg.os}`,
        nextAction: "Ensure legs array contains exactly one result per OS",
        summary: {
          requiredLegsCount: REQUIRED_OS_LEGS.length,
          presentLegsCount: options.legs.length,
          passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
          allFaultsDetected: false,
        },
      };
    }
    seenOs.add(leg.os);
  }

  const legsByOs = new Map<CiOs, CiLegResult>();
  for (const leg of options.legs) {
    legsByOs.set(leg.os, leg);
  }

  const missingLegs = REQUIRED_OS_LEGS.filter((os) => !legsByOs.has(os));
  if (missingLegs.length > 0 || options.legs.length !== REQUIRED_OS_LEGS.length) {
    const presentCount = REQUIRED_OS_LEGS.length - missingLegs.length;
    return {
      releaseSha: options.candidateSha,
      tarballSha256: options.candidateTarballSha256,
      evaluatedAt,
      overallStatus: presentCount === 0 ? "not_run" : "indeterminate",
      legs: options.legs,
      reason: missingLegs.length > 0
        ? `Missing required CI OS leg(s): ${missingLegs.join(", ")}`
        : `Expected exactly 3 CI legs, got ${options.legs.length}`,
      nextAction: "Execute and record all three OS CI jobs (windows, macos, linux) on current candidate commit",
      summary: {
        requiredLegsCount: REQUIRED_OS_LEGS.length,
        presentLegsCount: presentCount,
        passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
        allFaultsDetected: false,
      },
    };
  }

  // All three legs must belong to the exact same CI runId
  const firstRunId = options.legs[0]?.runId;
  if (!firstRunId || firstRunId.trim() === "" || options.legs.some((l) => l.runId !== firstRunId)) {
    return {
      releaseSha: options.candidateSha,
      tarballSha256: options.candidateTarballSha256,
      evaluatedAt,
      overallStatus: "indeterminate",
      legs: options.legs,
      reason: "Mixed or missing CI workflow runId across OS legs: all legs must belong to the exact same unified CI run",
      nextAction: "Record all three OS legs from a single, unified CI workflow run",
      summary: {
        requiredLegsCount: REQUIRED_OS_LEGS.length,
        presentLegsCount: REQUIRED_OS_LEGS.length,
        passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
        allFaultsDetected: false,
      },
    };
  }

  // All legs must have non-empty jobId and logUrl
  for (const leg of options.legs) {
    if (!leg.jobId || leg.jobId.trim() === "" || !leg.logUrl || leg.logUrl.trim() === "") {
      return {
        releaseSha: options.candidateSha,
        tarballSha256: options.candidateTarballSha256,
        evaluatedAt,
        overallStatus: "indeterminate",
        legs: options.legs,
        reason: `Leg '${leg.os}' missing required non-empty jobId or logUrl`,
        nextAction: `Ensure ${leg.os} leg includes valid CI jobId and logUrl`,
        summary: {
          requiredLegsCount: REQUIRED_OS_LEGS.length,
          presentLegsCount: REQUIRED_OS_LEGS.length,
          passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
          allFaultsDetected: false,
        },
      };
    }
  }

  // Check each leg for SHA, tarball hash, status, and faults
  for (const os of REQUIRED_OS_LEGS) {
    const leg = legsByOs.get(os)!;

    if (leg.headSha !== options.candidateSha) {
      return {
        releaseSha: options.candidateSha,
        tarballSha256: options.candidateTarballSha256,
        evaluatedAt,
        overallStatus: "indeterminate",
        legs: options.legs,
        reason: `Leg '${os}' commit SHA mismatch: candidate '${options.candidateSha}' vs '${leg.headSha}'`,
        nextAction: `Re-run ${os} CI job on candidate commit`,
        summary: {
          requiredLegsCount: REQUIRED_OS_LEGS.length,
          presentLegsCount: REQUIRED_OS_LEGS.length,
          passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
          allFaultsDetected: false,
        },
      };
    }

    if (leg.tarballSha256 !== options.candidateTarballSha256) {
      return {
        releaseSha: options.candidateSha,
        tarballSha256: options.candidateTarballSha256,
        evaluatedAt,
        overallStatus: "indeterminate",
        legs: options.legs,
        reason: `Leg '${os}' package tarball SHA-256 mismatch: candidate '${options.candidateTarballSha256}' vs '${leg.tarballSha256}'`,
        nextAction: `Ensure CI uses authoritative tarball from candidate package job on ${os}`,
        summary: {
          requiredLegsCount: REQUIRED_OS_LEGS.length,
          presentLegsCount: REQUIRED_OS_LEGS.length,
          passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
          allFaultsDetected: false,
        },
      };
    }

    if (leg.status !== "passed") {
      return {
        releaseSha: options.candidateSha,
        tarballSha256: options.candidateTarballSha256,
        evaluatedAt,
        overallStatus: leg.status,
        legs: options.legs,
        reason: `Leg '${os}' did not pass: status '${leg.status}'`,
        nextAction: leg.diagnostics ?? `Investigate CI failure on ${os} (see ${leg.logUrl})`,
        summary: {
          requiredLegsCount: REQUIRED_OS_LEGS.length,
          presentLegsCount: REQUIRED_OS_LEGS.length,
          passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
          allFaultsDetected: false,
        },
      };
    }

    // Verify all 5 fault controls
    for (const faultId of FAULT_CASE_IDS) {
      const fault = leg.faults.find((f) => f.id === faultId);
      if (!fault || !fault.detected) {
        return {
          releaseSha: options.candidateSha,
          tarballSha256: options.candidateTarballSha256,
          evaluatedAt,
          overallStatus: "product_failed",
          legs: options.legs,
          reason: `Leg '${os}' missing or undetected fault control: '${faultId}' (${fault?.reason ?? "not found"})`,
          nextAction: `Fix fault detection control '${faultId}' on ${os}`,
          summary: {
            requiredLegsCount: REQUIRED_OS_LEGS.length,
            presentLegsCount: REQUIRED_OS_LEGS.length,
            passedLegsCount: options.legs.filter((l) => l.status === "passed").length,
            allFaultsDetected: false,
          },
        };
      }
    }
  }

  return {
    releaseSha: options.candidateSha,
    tarballSha256: options.candidateTarballSha256,
    evaluatedAt,
    overallStatus: "passed",
    legs: options.legs,
    reason: null,
    nextAction: null,
    summary: {
      requiredLegsCount: REQUIRED_OS_LEGS.length,
      presentLegsCount: REQUIRED_OS_LEGS.length,
      passedLegsCount: REQUIRED_OS_LEGS.length,
      allFaultsDetected: true,
    },
  };
}
