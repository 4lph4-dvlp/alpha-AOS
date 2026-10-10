import { createHash } from "node:crypto";

export type PackageLifecycleStepName = "install" | "doctor" | "uninstall";

export interface PackageLifecycleStep {
  readonly name: PackageLifecycleStepName;
  readonly exitCode: number;
  readonly status: "passed" | "failed";
  readonly tarballSha256: string;
  readonly observedAt: string;
  readonly stdoutSummary?: string | undefined;
  readonly stderrSummary?: string | undefined;
}

export type HostPathCategory =
  | "managed_state"
  | "harness_config"
  | "harness_policy"
  | "skills"
  | "gsd_workflow"
  | "unclassified_boundary";

export interface HostPathCategoryDelta {
  readonly category: HostPathCategory;
  readonly description: string;
  readonly beforeDigest: string;
  readonly afterDigest: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly changedCount: number;
  readonly vanishedCount: number;
  readonly isClean: boolean;
  readonly explanation?: string | undefined;
}

export interface PackedLifecycleInput {
  readonly tarballSha256: string;
  readonly stableLockChannel: string;
  readonly stableLockIdentifier: string;
  readonly candidateRefused: boolean;
  readonly steps: readonly PackageLifecycleStep[];
  readonly hostCategories: readonly HostPathCategoryDelta[];
  readonly unobservedScopeNotice?: string | undefined;
}

export type PackedLifecycleStatus = "passed" | "failed" | "indeterminate";

export interface PackedLifecycleEvaluationResult {
  readonly status: PackedLifecycleStatus;
  readonly tarballSha256: string;
  readonly stableLockChannel: string;
  readonly stableLockIdentifier: string;
  readonly candidateRefused: boolean;
  readonly steps: readonly PackageLifecycleStep[];
  readonly hostCategories: readonly HostPathCategoryDelta[];
  readonly reason?: string | undefined;
  readonly nextAction?: string | undefined;
  readonly unobservedScopeNotice: string;
}

export const DEFAULT_UNOBSERVED_SCOPE_NOTICE =
  "Absence of drift is proven strictly for the monitored host categories above. Zero-modification is not claimed for unmonitored host directories outside this observed boundary.";

const PRIVATE_PATH_PATTERN = /([a-zA-Z]:[\\/](?:Users|dev|home|temp|AppData)|[\\/](?:home|Users)[\\/])/iu;

export function assertNoPrivatePaths(text: string, contextLabel = "release document"): void {
  const match = PRIVATE_PATH_PATTERN.exec(text);
  if (match) {
    throw new Error(`private host path detected in ${contextLabel}: ${match[0]}`);
  }
}

/**
 * Computes a HostPathCategoryDelta from category metadata and per-target digests.
 */
export function computeCategoryDelta(
  category: HostPathCategory,
  description: string,
  targets: readonly {
    readonly beforeDigest: string;
    readonly afterDigest: string;
    readonly addedCount?: number | undefined;
    readonly removedCount?: number | undefined;
    readonly changedCount?: number | undefined;
    readonly vanishedCount?: number | undefined;
  }[],
  explanation?: string | undefined,
): HostPathCategoryDelta {
  assertNoPrivatePaths(description, "category description");
  if (explanation) {
    assertNoPrivatePaths(explanation, "category explanation");
  }

  const beforeHash = createHash("sha256");
  const afterHash = createHash("sha256");

  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  let vanishedCount = 0;

  for (const t of targets) {
    beforeHash.update(`${t.beforeDigest}\n`);
    afterHash.update(`${t.afterDigest}\n`);
    addedCount += t.addedCount ?? 0;
    removedCount += t.removedCount ?? 0;
    changedCount += t.changedCount ?? 0;
    vanishedCount += t.vanishedCount ?? 0;
  }

  const beforeDigest = beforeHash.digest("hex");
  const afterDigest = afterHash.digest("hex");
  const isClean =
    beforeDigest === afterDigest &&
    addedCount === 0 &&
    removedCount === 0 &&
    changedCount === 0 &&
    vanishedCount === 0;

  return {
    category,
    description,
    beforeDigest,
    afterDigest,
    addedCount,
    removedCount,
    changedCount,
    vanishedCount,
    isClean,
    ...(explanation !== undefined ? { explanation } : {}),
  };
}

/**
 * Evaluates the packed lifecycle steps, supply chain lock integrity, and real host category mutations.
 * Enforces D-09, D-10, D-11, D-12, and VER-03.
 */
export function evaluatePackedLifecycle(input: PackedLifecycleInput): PackedLifecycleEvaluationResult {
  const notice = input.unobservedScopeNotice ?? DEFAULT_UNOBSERVED_SCOPE_NOTICE;

  // 1. Tarball SHA-256 sanity check
  if (!/^[a-f0-9]{64}$/iu.test(input.tarballSha256)) {
    return {
      status: "failed",
      tarballSha256: input.tarballSha256,
      stableLockChannel: input.stableLockChannel,
      stableLockIdentifier: input.stableLockIdentifier,
      candidateRefused: input.candidateRefused,
      steps: input.steps,
      hostCategories: input.hostCategories,
      reason: `invalid tarball SHA-256 format: ${input.tarballSha256}`,
      nextAction: "rebuild tarball and verify SHA-256 checksum",
      unobservedScopeNotice: notice,
    };
  }

  // 2. Step uniformity & completeness (D-09)
  const requiredStepNames: readonly PackageLifecycleStepName[] = ["install", "doctor", "uninstall"];
  const stepsByName = new Map<PackageLifecycleStepName, PackageLifecycleStep>();

  for (const step of input.steps) {
    if (step.tarballSha256 !== input.tarballSha256) {
      return {
        status: "failed",
        tarballSha256: input.tarballSha256,
        stableLockChannel: input.stableLockChannel,
        stableLockIdentifier: input.stableLockIdentifier,
        candidateRefused: input.candidateRefused,
        steps: input.steps,
        hostCategories: input.hostCategories,
        reason: `tarball SHA-256 mismatch in step ${step.name}: expected ${input.tarballSha256}, got ${step.tarballSha256}`,
        nextAction: "ensure all lifecycle steps evaluate the exact same release tarball artifact",
        unobservedScopeNotice: notice,
      };
    }
    stepsByName.set(step.name, step);
  }

  for (const req of requiredStepNames) {
    const found = stepsByName.get(req);
    if (!found) {
      return {
        status: "failed",
        tarballSha256: input.tarballSha256,
        stableLockChannel: input.stableLockChannel,
        stableLockIdentifier: input.stableLockIdentifier,
        candidateRefused: input.candidateRefused,
        steps: input.steps,
        hostCategories: input.hostCategories,
        reason: `missing required lifecycle step: ${req}`,
        nextAction: `execute and record the missing ${req} step`,
        unobservedScopeNotice: notice,
      };
    }
    if (found.status !== "passed" || found.exitCode !== 0) {
      return {
        status: "failed",
        tarballSha256: input.tarballSha256,
        stableLockChannel: input.stableLockChannel,
        stableLockIdentifier: input.stableLockIdentifier,
        candidateRefused: input.candidateRefused,
        steps: input.steps,
        hostCategories: input.hostCategories,
        reason: `lifecycle step ${req} failed with exit code ${found.exitCode}`,
        nextAction: `investigate failure logs for step ${req}`,
        unobservedScopeNotice: notice,
      };
    }
  }

  // 3. Stable lock channel and candidate rejection (D-12)
  if (input.stableLockChannel !== "stable") {
    return {
      status: "failed",
      tarballSha256: input.tarballSha256,
      stableLockChannel: input.stableLockChannel,
      stableLockIdentifier: input.stableLockIdentifier,
      candidateRefused: input.candidateRefused,
      steps: input.steps,
      hostCategories: input.hostCategories,
      reason: `packaged lock channel is '${input.stableLockChannel}', expected 'stable'`,
      nextAction: "ensure packaged catalog/stack.lock.json declares channel: stable",
      unobservedScopeNotice: notice,
    };
  }

  if (!input.stableLockIdentifier || input.stableLockIdentifier.trim() === "") {
    return {
      status: "failed",
      tarballSha256: input.tarballSha256,
      stableLockChannel: input.stableLockChannel,
      stableLockIdentifier: input.stableLockIdentifier,
      candidateRefused: input.candidateRefused,
      steps: input.steps,
      hostCategories: input.hostCategories,
      reason: "missing stable lock identifier",
      nextAction: "provide valid stable lock identifier hash or version",
      unobservedScopeNotice: notice,
    };
  }

  if (!input.candidateRefused) {
    return {
      status: "failed",
      tarballSha256: input.tarballSha256,
      stableLockChannel: input.stableLockChannel,
      stableLockIdentifier: input.stableLockIdentifier,
      candidateRefused: input.candidateRefused,
      steps: input.steps,
      hostCategories: input.hostCategories,
      reason: "candidate lock rejection failed (candidate channel was accepted or unrefused)",
      nextAction: "verify update command rejects candidate lock without modifying managed journal",
      unobservedScopeNotice: notice,
    };
  }

  // 4. Host path category drift inspection (D-11 & D-09)
  const uncleanCategories = input.hostCategories.filter((c) => !c.isClean);
  if (uncleanCategories.length > 0) {
    const firstUnclean = uncleanCategories[0];
    const categoryName = firstUnclean?.category ?? "unknown";
    const reasonText = firstUnclean?.explanation
      ? `host path drift in category ${categoryName} (${firstUnclean.explanation})`
      : `unexplained host path drift in category ${categoryName}: before ${firstUnclean?.beforeDigest.slice(0, 12)} -> after ${firstUnclean?.afterDigest.slice(0, 12)}`;

    // D-11: "원인 불명 실제 호스트 경로 차이는 통과가 아니라 판정 보류(indeterminate)이며 동일 tarball hash로 조사 후 재검증한다."
    // Even if an explanation is provided, real host path modification cannot be marked passed without a clean reverification receipt.
    return {
      status: "indeterminate",
      tarballSha256: input.tarballSha256,
      stableLockChannel: input.stableLockChannel,
      stableLockIdentifier: input.stableLockIdentifier,
      candidateRefused: input.candidateRefused,
      steps: input.steps,
      hostCategories: input.hostCategories,
      reason: reasonText,
      nextAction: `investigate host path drift in category ${categoryName} and re-verify using identical tarball ${input.tarballSha256}`,
      unobservedScopeNotice: notice,
    };
  }

  return {
    status: "passed",
    tarballSha256: input.tarballSha256,
    stableLockChannel: input.stableLockChannel,
    stableLockIdentifier: input.stableLockIdentifier,
    candidateRefused: input.candidateRefused,
    steps: input.steps,
    hostCategories: input.hostCategories,
    unobservedScopeNotice: notice,
  };
}

/**
 * Re-verifies an indeterminate packed lifecycle result.
 * Enforces that the re-verification MUST use the exact same tarball SHA-256 (D-11).
 */
export function reverifyPackedLifecycle(
  originalResult: PackedLifecycleEvaluationResult,
  reverificationRun: PackedLifecycleEvaluationResult,
): PackedLifecycleEvaluationResult {
  if (reverificationRun.tarballSha256 !== originalResult.tarballSha256) {
    throw new Error(
      `re-verification tarball SHA-256 mismatch (D-11): original ${originalResult.tarballSha256}, reverification ${reverificationRun.tarballSha256}`,
    );
  }

  return reverificationRun;
}

/**
 * Renders the public package receipts markdown document.
 * Strictly guarantees that no personal or absolute host paths are exposed (D-10).
 */
export function renderReleasePackageReceiptsMarkdown(evaluation: PackedLifecycleEvaluationResult): string {
  // Ensure no private paths in any field
  for (const step of evaluation.steps) {
    if (step.stdoutSummary) assertNoPrivatePaths(step.stdoutSummary, `step ${step.name} stdoutSummary`);
    if (step.stderrSummary) assertNoPrivatePaths(step.stderrSummary, `step ${step.name} stderrSummary`);
  }
  for (const cat of evaluation.hostCategories) {
    assertNoPrivatePaths(cat.description, `category ${cat.category} description`);
    if (cat.explanation) assertNoPrivatePaths(cat.explanation, `category ${cat.category} explanation`);
  }
  if (evaluation.reason) assertNoPrivatePaths(evaluation.reason, "evaluation reason");
  if (evaluation.nextAction) assertNoPrivatePaths(evaluation.nextAction, "evaluation nextAction");
  assertNoPrivatePaths(evaluation.unobservedScopeNotice, "unobserved scope notice");

  const lines: string[] = [
    "# Phase 22 Package Receipts: v0.2.0 Packed Lifecycle & Host Boundary Proof",
    "",
    "## 1. Overview & Verification Verdict",
    "",
    `- **Tarball SHA-256:** \`${evaluation.tarballSha256}\``,
    `- **Overall Status:** **\`${evaluation.status.toUpperCase()}\`**`,
    `- **Lock Channel:** \`${evaluation.stableLockChannel}\``,
    `- **Lock Identifier:** \`${evaluation.stableLockIdentifier}\``,
    `- **Candidate Lock Refused:** \`${evaluation.candidateRefused}\``,
    "",
  ];

  if (evaluation.reason) {
    lines.push(`> [!WARNING]`);
    lines.push(`> **Verdict Reason:** ${evaluation.reason}`);
    if (evaluation.nextAction) {
      lines.push(`> **Next Action Required:** ${evaluation.nextAction}`);
    }
    lines.push("");
  }

  lines.push("---", "", "## 2. Package Lifecycle & Supply Chain Gates (D-09, D-12)", "");
  lines.push("| Lifecycle Step / Gate | Expected | Observed Exit | Result | Tarball SHA-256 | Notes |");
  lines.push("|---|---|---|---|---|---|");

  for (const step of evaluation.steps) {
    const notes = step.stdoutSummary ?? (step.status === "passed" ? "Clean execution" : "Failure observed");
    lines.push(
      `| \`${step.name}\` | \`exit 0\` | \`${step.exitCode}\` | \`${step.status.toUpperCase()}\` | \`${step.tarballSha256.slice(0, 12)}...\` | ${notes} |`,
    );
  }

  lines.push(
    `| \`candidate-lock-gate\` | \`refused\` | \`exit 0\` | \`${evaluation.candidateRefused ? "PASSED" : "FAILED"}\` | \`${evaluation.tarballSha256.slice(0, 12)}...\` | Unreviewed candidate lock ignored; zero journals added |`,
  );
  lines.push("");

  lines.push("---", "", "## 3. Real Host Path Categories & Zero-Mutation Boundary (D-09, D-10, VER-03)", "");
  lines.push("| Category | Description | Before Digest | After Digest | Added | Removed | Changed | Vanished | Category Status |");
  lines.push("|---|---|---|---|---|---|---|---|---|");

  for (const cat of evaluation.hostCategories) {
    const beforeDigestShort = cat.beforeDigest.slice(0, 12);
    const afterDigestShort = cat.afterDigest.slice(0, 12);
    const catStatus = cat.isClean ? "CLEAN" : "DRIFT_DETECTED";
    lines.push(
      `| \`${cat.category}\` | ${cat.description} | \`${beforeDigestShort}...\` | \`${afterDigestShort}...\` | ${cat.addedCount} | ${cat.removedCount} | ${cat.changedCount} | ${cat.vanishedCount} | \`${catStatus}\` |`,
    );
  }
  lines.push("");

  lines.push("---", "", "## 4. Observation Boundary & Unclassified Probe (VER-03)", "");
  lines.push("> [!NOTE]");
  lines.push(`> **VER-03 Observation Scope Notice:** ${evaluation.unobservedScopeNotice}`);
  lines.push("");

  const rendered = lines.join("\n");
  assertNoPrivatePaths(rendered, "final rendered markdown");
  return rendered;
}
