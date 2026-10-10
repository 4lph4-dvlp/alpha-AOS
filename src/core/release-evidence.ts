import type { HarnessId } from "../types.js";
import type { CiOs, ThreeOsRunEvaluation } from "./release-fault-proof.js";
import type { ReleaseSupportMatrixReport } from "./support-matrix.js";
import type { PackedLifecycleEvaluationResult } from "./release-package-proof.js";
import type { ExampleEvaluationResult } from "./release-examples.js";

export type ReleaseEvidenceStatus = "PROVEN" | "UNVERIFIED" | "REJECTED" | "UNSUPPORTED";

export interface ReleaseCandidateIdentity {
  readonly releaseVersion: "0.2.0";
  readonly releaseSha: string;
  readonly tarballSha256: string;
}

export type ReleaseEvidenceCategory =
  | "ci"
  | "matrix"
  | "package"
  | "example"
  | "role_receipt"
  | "gsd_lifecycle";

export interface ReleaseEvidenceSource {
  readonly id: string;
  readonly category: ReleaseEvidenceCategory;
  readonly reference: string;
  readonly releaseSha: string | null;
  readonly tarballSha256: string | null;
  readonly description?: string;
  readonly status?: ReleaseEvidenceStatus;
  readonly reason?: string | null;
  readonly nextAction?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvaluatedEvidenceItem {
  readonly id: string;
  readonly category: ReleaseEvidenceCategory;
  readonly reference: string;
  readonly status: ReleaseEvidenceStatus;
  readonly reason: string | null;
  readonly nextAction: string | null;
  readonly source: ReleaseEvidenceSource;
}

export interface ReleaseEvidenceSummary {
  readonly total: number;
  readonly proven: number;
  readonly unverified: number;
  readonly rejected: number;
  readonly unsupported: number;
}

export interface ReleaseEvidenceReport {
  readonly schemaVersion: 1;
  readonly candidate: ReleaseCandidateIdentity;
  readonly evaluatedAt: string;
  readonly overallStatus: ReleaseEvidenceStatus;
  readonly summary: ReleaseEvidenceSummary;
  readonly items: readonly EvaluatedEvidenceItem[];
}

export function evaluateReleaseEvidence(
  candidate: ReleaseCandidateIdentity,
  sources: readonly ReleaseEvidenceSource[],
  options: { readonly evaluatedAt?: string } = {},
): ReleaseEvidenceReport {
  if (candidate.releaseVersion !== "0.2.0") {
    throw new Error(`Invalid candidate version: expected '0.2.0', got '${candidate.releaseVersion}'`);
  }
  if (!candidate.releaseSha || candidate.releaseSha.trim().length === 0) {
    throw new Error("Release candidate releaseSha must be a non-empty string");
  }
  if (!candidate.tarballSha256 || candidate.tarballSha256.trim().length === 0) {
    throw new Error("Release candidate tarballSha256 must be a non-empty string");
  }

  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();

  if (sources.length === 0) {
    return {
      schemaVersion: 1,
      candidate,
      evaluatedAt,
      overallStatus: "UNVERIFIED",
      summary: {
        total: 0,
        proven: 0,
        unverified: 0,
        rejected: 0,
        unsupported: 0,
      },
      items: [],
    };
  }

  const items: EvaluatedEvidenceItem[] = sources.map((source) => {
    // 1. Empty or missing reference check
    if (!source.reference || source.reference.trim().length === 0) {
      return {
        id: source.id,
        category: source.category,
        reference: source.reference,
        status: "UNVERIFIED",
        reason: "Evidence source reference is empty or missing",
        nextAction: "Provide an inspectable reference link or file path",
        source,
      };
    }

    // 2. Commit SHA mismatch
    if (source.releaseSha !== null && source.releaseSha !== candidate.releaseSha) {
      return {
        id: source.id,
        category: source.category,
        reference: source.reference,
        status: "REJECTED",
        reason: `Commit SHA mismatch: candidate '${candidate.releaseSha}' vs source '${source.releaseSha}'`,
        nextAction: `Re-run evidence collection on release candidate commit ${candidate.releaseSha}`,
        source,
      };
    }

    // 3. Tarball SHA mismatch
    if (source.tarballSha256 !== null && source.tarballSha256 !== candidate.tarballSha256) {
      return {
        id: source.id,
        category: source.category,
        reference: source.reference,
        status: "REJECTED",
        reason: `Tarball SHA-256 mismatch: candidate '${candidate.tarballSha256}' vs source '${source.tarballSha256}'`,
        nextAction: "Rebuild tarball package or re-verify against candidate tarball",
        source,
      };
    }

    // 4. Explicit status from source
    if (source.status !== undefined) {
      return {
        id: source.id,
        category: source.category,
        reference: source.reference,
        status: source.status,
        reason: source.reason ?? null,
        nextAction: source.nextAction ?? null,
        source,
      };
    }

    // 5. Default valid source
    return {
      id: source.id,
      category: source.category,
      reference: source.reference,
      status: "PROVEN",
      reason: null,
      nextAction: null,
      source,
    };
  });

  const total = items.length;
  const proven = items.filter((i) => i.status === "PROVEN").length;
  const unverified = items.filter((i) => i.status === "UNVERIFIED").length;
  const rejected = items.filter((i) => i.status === "REJECTED").length;
  const unsupported = items.filter((i) => i.status === "UNSUPPORTED").length;

  let overallStatus: ReleaseEvidenceStatus;
  if (rejected > 0) {
    overallStatus = "REJECTED";
  } else if (unverified > 0) {
    overallStatus = "UNVERIFIED";
  } else if (proven > 0 && proven + unsupported === total) {
    overallStatus = "PROVEN";
  } else {
    overallStatus = "UNVERIFIED";
  }

  return {
    schemaVersion: 1,
    candidate,
    evaluatedAt,
    overallStatus,
    summary: {
      total,
      proven,
      unverified,
      rejected,
      unsupported,
    },
    items,
  };
}

export interface OrdinaryGsdEvaluationResult {
  readonly requestText: string;
  readonly pathChosen: "ordinary-gsd" | "autopilot-preview" | "clarification-needed";
  readonly supervisorRunsCount: number;
  readonly contractGenerated: boolean;
  readonly status: ReleaseEvidenceStatus;
  readonly reason: string | null;
  readonly nextAction: string | null;
}

export function evaluateOrdinaryGsdBoundary(
  requestText: string,
  observedSupervisorRuns: number,
  options: { readonly isExplicitAutopilot?: boolean; readonly hasAmbiguousScope?: boolean } = {},
): OrdinaryGsdEvaluationResult {
  const trimmed = requestText.trim();
  if (!trimmed) {
    return {
      requestText,
      pathChosen: "clarification-needed",
      supervisorRunsCount: observedSupervisorRuns,
      contractGenerated: false,
      status: "UNVERIFIED",
      reason: "Request text is empty",
      nextAction: "Provide specific task description",
    };
  }

  if (options.isExplicitAutopilot) {
    if (options.hasAmbiguousScope) {
      return {
        requestText,
        pathChosen: "clarification-needed",
        supervisorRunsCount: observedSupervisorRuns,
        contractGenerated: false,
        status: "UNVERIFIED",
        reason: "Scope or acceptance criteria are ambiguous",
        nextAction: "Clarify scope before contract preview",
      };
    }
    return {
      requestText,
      pathChosen: "autopilot-preview",
      supervisorRunsCount: observedSupervisorRuns,
      contractGenerated: true,
      status: "PROVEN",
      reason: null,
      nextAction: null,
    };
  }

  // Ordinary GSD: must NOT start supervisor or generate contract
  const contractGenerated = false;
  const pathChosen = "ordinary-gsd" as const;

  if (observedSupervisorRuns > 0) {
    return {
      requestText,
      pathChosen,
      supervisorRunsCount: observedSupervisorRuns,
      contractGenerated,
      status: "REJECTED",
      reason: `Ordinary GSD request produced ${observedSupervisorRuns} supervisor run record(s) without task-specific approval`,
      nextAction: "Ensure ordinary conversational GSD executes directly without supervisor records",
    };
  }

  return {
    requestText,
    pathChosen,
    supervisorRunsCount: 0,
    contractGenerated,
    status: "PROVEN",
    reason: null,
    nextAction: null,
  };
}

export interface GateVerdict {
  readonly status: ReleaseEvidenceStatus;
  readonly details: string;
  readonly reason?: string | undefined;
  readonly nextAction?: string | undefined;
}

export interface FullReleaseEvidenceInput {
  readonly candidate: ReleaseCandidateIdentity;
  readonly threeOsRun?: ThreeOsRunEvaluation | undefined;
  readonly supportMatrix?: ReleaseSupportMatrixReport | undefined;
  readonly packedLifecycle?: PackedLifecycleEvaluationResult | undefined;
  readonly developmentExample?: ExampleEvaluationResult | undefined;
  readonly coursepilotExample?: ExampleEvaluationResult | undefined;
  readonly ordinaryGsd?: OrdinaryGsdEvaluationResult | undefined;
}

export interface FullReleaseEvidenceVerdict {
  readonly candidate: ReleaseCandidateIdentity;
  readonly evaluatedAt: string;
  readonly overallStatus: ReleaseEvidenceStatus;
  readonly isReleaseReady: boolean;
  readonly gates: {
    readonly ci: GateVerdict;
    readonly matrix: GateVerdict;
    readonly package: GateVerdict;
    readonly development: GateVerdict;
    readonly coursepilot: GateVerdict;
    readonly ordinaryGsd: GateVerdict;
  };
  readonly blockingGaps: readonly string[];
}

export function evaluateFullReleaseEvidence(
  input: FullReleaseEvidenceInput,
  options: { readonly evaluatedAt?: string } = {},
): FullReleaseEvidenceVerdict {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const blockingGaps: string[] = [];

  // 1. CI Gate (VER-01, D-05..D-08)
  let ciGate: GateVerdict;
  if (!input.threeOsRun) {
    ciGate = {
      status: "UNVERIFIED",
      details: "Three-OS CI run is not yet recorded for this candidate SHA",
      nextAction: "Execute CI run on GitHub Actions for candidate commit and record job IDs and logs",
    };
    blockingGaps.push("CI Gate: Three-OS GitHub Actions workflow run not yet executed/recorded");
  } else if (input.threeOsRun.releaseSha !== input.candidate.releaseSha) {
    ciGate = {
      status: "REJECTED",
      details: `CI commit SHA mismatch: candidate '${input.candidate.releaseSha}' vs CI '${input.threeOsRun.releaseSha}'`,
      reason: "CI was run against a different commit SHA",
      nextAction: "Re-run three-OS CI against current release candidate commit",
    };
    blockingGaps.push(`CI Gate: Commit SHA mismatch (${input.threeOsRun.releaseSha} != ${input.candidate.releaseSha})`);
  } else if (input.threeOsRun.tarballSha256 !== input.candidate.tarballSha256) {
    ciGate = {
      status: "REJECTED",
      details: `CI tarball SHA mismatch: candidate '${input.candidate.tarballSha256}' vs CI '${input.threeOsRun.tarballSha256}'`,
      reason: "CI artifact tarball SHA-256 does not match candidate tarball",
      nextAction: "Re-run CI using authoritative candidate tarball",
    };
    blockingGaps.push("CI Gate: Tarball SHA-256 mismatch");
  } else if (input.threeOsRun.overallStatus !== "passed") {
    const isIndeterminate = input.threeOsRun.overallStatus === "indeterminate";
    ciGate = {
      status: isIndeterminate ? "UNVERIFIED" : "REJECTED",
      details: `CI run status: ${input.threeOsRun.overallStatus.toUpperCase()}`,
      reason: input.threeOsRun.reason ?? undefined,
      nextAction: input.threeOsRun.nextAction ?? undefined,
    };
    blockingGaps.push(`CI Gate: Status is ${input.threeOsRun.overallStatus.toUpperCase()} (${input.threeOsRun.reason ?? "failures detected"})`);
  } else {
    // CR-02: Verify that all 3 required OS legs are present and each detected all 5 fault controls
    const requiredOses: CiOs[] = ["windows", "macos", "linux"];
    const legsByOs = new Map(input.threeOsRun.legs.map((l) => [l.os, l]));
    const missingOses = requiredOses.filter((os) => !legsByOs.has(os));
    const allLegsHave5Faults = input.threeOsRun.legs.length === 3 && input.threeOsRun.legs.every(
      (l) => l.faults && l.faults.length === 5 && l.faults.every((f) => f.detected),
    );

    if (missingOses.length > 0 || input.threeOsRun.legs.length !== 3 || !allLegsHave5Faults) {
      ciGate = {
        status: "UNVERIFIED",
        details: missingOses.length > 0
          ? `CI Gate incomplete: missing OS legs (${missingOses.join(", ")})`
          : "CI Gate incomplete: all 3 OS legs must contain all 5 verified fault controls",
        reason: "Incomplete CI legs or missing fault controls",
        nextAction: "Execute complete three-OS CI suite with 5 fault injection controls",
      };
      blockingGaps.push("CI Gate: Incomplete OS legs or fault controls");
    } else {
      ciGate = {
        status: "PROVEN",
        details: "Windows, macOS, and Linux all passed cleanly with 5/5 fault controls detected at expected assertions",
      };
    }
  }

  // 2. Matrix Gate (VER-02, D-01..D-04, CR-02)
  let matrixGate: GateVerdict;
  if (!input.supportMatrix) {
    matrixGate = {
      status: "UNVERIFIED",
      details: "Support matrix report not provided",
      nextAction: "Evaluate 35-cell matrix against discovered harnesses and recorded receipts",
    };
    blockingGaps.push("Matrix Gate: Support matrix report not evaluated");
  } else if (!input.supportMatrix.cells || input.supportMatrix.cells.length < 35) {
    matrixGate = {
      status: "UNVERIFIED",
      details: `Support matrix incomplete: found ${input.supportMatrix.cells?.length ?? 0} cells, required 35`,
      reason: "Incomplete support matrix cells",
      nextAction: "Evaluate full 35-cell support matrix across 5 harnesses and all roles",
    };
    blockingGaps.push("Matrix Gate: Incomplete support matrix (fewer than 35 cells)");
  } else {
    const summary = input.supportMatrix.summary;
    matrixGate = {
      status: "PROVEN",
      details: `35 cells across 5 harnesses: ${summary.provenCount} PROVEN, ${summary.unverifiedCount} UNVERIFIED with reasons/actions, ${summary.unsupportedCount} UNSUPPORTED worker boundaries maintained`,
    };
  }

  // 3. Package Gate (VER-03, D-09..D-12, CR-02, CR-05)
  let packageGate: GateVerdict;
  if (!input.packedLifecycle) {
    packageGate = {
      status: "UNVERIFIED",
      details: "Packed lifecycle evaluation not provided",
      nextAction: "Run packed sandbox install/doctor/uninstall and record host category deltas",
    };
    blockingGaps.push("Package Gate: Packed lifecycle proof not provided");
  } else if (input.packedLifecycle.tarballSha256 !== input.candidate.tarballSha256) {
    packageGate = {
      status: "REJECTED",
      details: `Tarball SHA mismatch: candidate '${input.candidate.tarballSha256}' vs packed proof '${input.packedLifecycle.tarballSha256}'`,
      reason: "Lifecycle proof used different tarball package",
      nextAction: "Re-run packed lifecycle test with candidate tarball",
    };
    blockingGaps.push("Package Gate: Tarball SHA-256 mismatch");
  } else if (input.packedLifecycle.status !== "passed") {
    const isIndeterminate = input.packedLifecycle.status === "indeterminate";
    packageGate = {
      status: isIndeterminate ? "UNVERIFIED" : "REJECTED",
      details: `Packed lifecycle status: ${input.packedLifecycle.status.toUpperCase()}`,
      reason: input.packedLifecycle.reason,
      nextAction: input.packedLifecycle.nextAction,
    };
    blockingGaps.push(`Package Gate: Status is ${input.packedLifecycle.status.toUpperCase()} (${input.packedLifecycle.reason ?? "drift/failure detected"})`);
  } else {
    // CR-02 / CR-05: verify that steps has 3 passed steps, all 5 host categories are present and clean, and candidateRefused is true
    const has3Steps = Boolean(input.packedLifecycle.steps && input.packedLifecycle.steps.length === 3 &&
      input.packedLifecycle.steps.every((s) => s.status === "passed"));
    const has5Categories = Boolean(input.packedLifecycle.hostCategories && input.packedLifecycle.hostCategories.length === 5 &&
      input.packedLifecycle.hostCategories.every((c) => c.isClean));
    const candidateRefused = input.packedLifecycle.candidateRefused === true;

    if (!has3Steps || !has5Categories || !candidateRefused) {
      packageGate = {
        status: "UNVERIFIED",
        details: "Package lifecycle incomplete: requires 3 passed steps, 5 clean host categories, and verified candidate refusal",
        reason: "Incomplete packed lifecycle observations",
        nextAction: "Run full packed lifecycle sandbox with all 5 host categories observed",
      };
      blockingGaps.push("Package Gate: Incomplete lifecycle steps or unobserved host categories");
    } else {
      packageGate = {
        status: "PROVEN",
        details: "Packed install/doctor/uninstall passed cleanly; stable lock and candidate refusal verified; all 5 host categories 100% clean",
      };
    }
  }

  // 4. Development Workload Gate (VER-04, D-13..D-16)
  let devGate: GateVerdict;
  if (!input.developmentExample) {
    devGate = {
      status: "UNVERIFIED",
      details: "Development game workload proof not provided",
      nextAction: "Execute development game oracle and record reviewer witness",
    };
    blockingGaps.push("Development Gate: Development workload proof missing");
  } else if (input.developmentExample.overallStatus !== "completed") {
    devGate = {
      status: "REJECTED",
      details: input.developmentExample.reasons.join("; ") || "Development workload criteria or reviewer witness parity failed",
      reason: "Development workload criteria or reviewer witness parity failed",
      nextAction: "Fix development workload criteria failures",
    };
    blockingGaps.push("Development Gate: Criteria or reviewer witness parity failed");
  } else {
    devGate = {
      status: "PROVEN",
      details: "Game oracle state transitions passed; reviewer witness digest parity verified; required capability calls executed",
    };
  }

  // 5. CoursePilot Workload Gate (VER-04, D-13..D-16)
  let cpGate: GateVerdict;
  if (!input.coursepilotExample) {
    cpGate = {
      status: "UNVERIFIED",
      details: "CoursePilot workload proof not provided",
      nextAction: "Execute CoursePilot workload and record file identity preservation",
    };
    blockingGaps.push("CoursePilot Gate: CoursePilot workload proof missing");
  } else if (input.coursepilotExample.overallStatus !== "completed") {
    cpGate = {
      status: "REJECTED",
      details: input.coursepilotExample.reasons.join("; ") || "CoursePilot file identity or reviewer witness parity failed",
      reason: "CoursePilot file identity or reviewer witness parity failed",
      nextAction: "Ensure multi-level course-week-module file identity is strictly preserved",
    };
    blockingGaps.push("CoursePilot Gate: CoursePilot workload failed");
  } else {
    cpGate = {
      status: "PROVEN",
      details: "Multi-level course-week-module file identity strictly preserved; fixture downloads verified; live LMS unverified boundary maintained",
    };
  }

  // 6. Ordinary GSD Gate
  let ordinaryGate: GateVerdict;
  if (!input.ordinaryGsd) {
    ordinaryGate = {
      status: "UNVERIFIED",
      details: "Ordinary GSD non-activation proof not provided",
      nextAction: "Verify ordinary requests produce zero supervisor runs",
    };
    blockingGaps.push("Ordinary GSD Gate: Non-activation proof missing");
  } else if (input.ordinaryGsd.status !== "PROVEN") {
    ordinaryGate = {
      status: input.ordinaryGsd.status,
      details: input.ordinaryGsd.reason ?? "Ordinary GSD non-activation failed",
      reason: input.ordinaryGsd.reason ?? undefined,
      nextAction: input.ordinaryGsd.nextAction ?? undefined,
    };
    blockingGaps.push(`Ordinary GSD Gate: Status is ${input.ordinaryGsd.status}`);
  } else {
    ordinaryGate = {
      status: "PROVEN",
      details: "Ordinary GSD conversational requests execute directly with zero supervisor runs and zero contract previews",
    };
  }

  // Overall Conjunction
  const allGateStatuses = [ciGate.status, matrixGate.status, packageGate.status, devGate.status, cpGate.status, ordinaryGate.status];
  let overallStatus: ReleaseEvidenceStatus;
  if (allGateStatuses.includes("REJECTED")) {
    overallStatus = "REJECTED";
  } else if (allGateStatuses.includes("UNVERIFIED")) {
    overallStatus = "UNVERIFIED";
  } else {
    overallStatus = "PROVEN";
  }

  const isReleaseReady = overallStatus === "PROVEN" && blockingGaps.length === 0;

  return {
    candidate: input.candidate,
    evaluatedAt,
    overallStatus,
    isReleaseReady,
    gates: {
      ci: ciGate,
      matrix: matrixGate,
      package: packageGate,
      development: devGate,
      coursepilot: cpGate,
      ordinaryGsd: ordinaryGate,
    },
    blockingGaps,
  };
}

export function renderReleaseEvidenceMarkdown(verdict: FullReleaseEvidenceVerdict): string {
  const lines: string[] = [
    "# alpha-AOS v0.2.0 Release Proof: Full Release Evidence & Audit Verdict",
    "",
    "## 1. Executive Summary & Release Verdict",
    "",
    `- **Release Version:** \`${verdict.candidate.releaseVersion}\``,
    `- **Candidate Commit SHA:** \`${verdict.candidate.releaseSha}\``,
    `- **Authoritative Tarball SHA-256:** \`${verdict.candidate.tarballSha256}\``,
    `- **Evaluated At:** \`${verdict.evaluatedAt}\``,
    `- **Overall Status:** **\`${verdict.overallStatus}\`**`,
    `- **Release Ready:** **\`${verdict.isReleaseReady ? "YES (PROVEN)" : "NO (Awaiting Gate Resolution)"}\`**`,
    "",
    "## 2. Release Gates Conjunction Summary",
    "",
    "| Gate ID | Domain Area | Status | Verification Summary | Next Action / Resolution |",
    "|---|---|---|---|---|",
    `| \`VER-01\` | Three-OS CI & Fault Injection Controls | **\`${verdict.gates.ci.status}\`** | ${verdict.gates.ci.details} | ${verdict.gates.ci.nextAction ?? "Gate satisfied"} |`,
    `| \`VER-02\` | Exact-Version 5-Harness Support Matrix | **\`${verdict.gates.matrix.status}\`** | ${verdict.gates.matrix.details} | ${verdict.gates.matrix.nextAction ?? "Gate satisfied"} |`,
    `| \`VER-03\` | Packed Tarball Lifecycle & Host Boundary | **\`${verdict.gates.package.status}\`** | ${verdict.gates.package.details} | ${verdict.gates.package.nextAction ?? "Gate satisfied"} |`,
    `| \`VER-04-DEV\` | Development Workload (CLI Game Oracle) | **\`${verdict.gates.development.status}\`** | ${verdict.gates.development.details} | ${verdict.gates.development.nextAction ?? "Gate satisfied"} |`,
    `| \`VER-04-CP\` | CoursePilot LMS Workload & File Identity | **\`${verdict.gates.coursepilot.status}\`** | ${verdict.gates.coursepilot.details} | ${verdict.gates.coursepilot.nextAction ?? "Gate satisfied"} |`,
    `| \`GSD-CORE\` | Ordinary GSD Non-Activation Boundary | **\`${verdict.gates.ordinaryGsd.status}\`** | ${verdict.gates.ordinaryGsd.details} | ${verdict.gates.ordinaryGsd.nextAction ?? "Gate satisfied"} |`,
    "",
    "## 3. Blocking Gaps & Pending Actions",
    "",
  ];

  if (verdict.blockingGaps.length === 0) {
    lines.push("None. All six release gates are fully proven against this candidate commit and tarball SHA.");
  } else {
    lines.push("> [!IMPORTANT]");
    lines.push("> **The following blocking gaps prevent release declaration at this stage:**");
    lines.push(">");
    for (const gap of verdict.blockingGaps) {
      lines.push(`> - ${gap}`);
    }
  }
  lines.push("");

  lines.push("## 4. Honest Boundary & Explicit Unverified Disclaimers (D-02, D-08, D-15)");
  lines.push("");
  lines.push("In accordance with alpha-AOS core principles, unrun, unauthenticated, or simulated surfaces are strictly reported as **UNVERIFIED** or **UNSUPPORTED** rather than falsely green:");
  lines.push("");
  lines.push("1. **Live LMS Credentials (D-15):** Local fixture downloads and file integrity hashes are proven. Live university LMS integration requires user credentials and remains `UNVERIFIED`.");
  lines.push("2. **Codex Windows Sandbox:** Codex on Windows currently encounters headless elevation sandbox limitations; reported honestly as `UNVERIFIED`.");
  lines.push("3. **Hermes Worker Boundaries:** Hermes Agent is architecturally restricted to worker execution; `controller` and `hook` capabilities are structurally `UNSUPPORTED` to prevent state corruption.");
  lines.push("4. **Paid/External Canaries:** External paid API canaries (e.g. live Exa / Context7 / Firecrawl runs with billable keys) that were not executed remain `UNVERIFIED`.");
  lines.push("");

  return lines.join("\n");
}

