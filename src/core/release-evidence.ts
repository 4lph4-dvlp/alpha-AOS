import type { HarnessId } from "../types.js";

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
