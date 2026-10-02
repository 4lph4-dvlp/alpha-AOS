# Phase 17: GSD Lifecycle Bridge - Pattern Mapping

**Mapped:** 2026-10-02  
**Phase Directory:** `D:/dev/alpha-AOS/.planning/phases/17-gsd-lifecycle-bridge`  
**Target Document:** [`17-PATTERNS.md`](file:///D:/dev/alpha-AOS/.planning/phases/17-gsd-lifecycle-bridge/17-PATTERNS.md)  
**Status:** Ready for Planning

---

## 1. Executive Summary & Architectural Invariants

Phase 17 establishes the **GSD Lifecycle Bridge**, which integrates installed GSD Core workflows (`discuss-phase`, `plan-phase`, `execute-phase`, `verify-work`, `plan-phase --gaps`) into the alpha-AOS autonomous execution loop.

To preserve system integrity, all new modules and enhancements must adhere to four immutable architectural invariants:
1. **GSD as Sole Lifecycle Authority (GSD-03, D-09, D-12):** `.planning/` (`STATE.md`, `ROADMAP.md`, `phases/`, `quick/`) and project Git commits are created and maintained solely by GSD Core and its controller. alpha-AOS performs strictly read-only observation (`runGitRead`, `snapshotPlanningState`, `readBounded`). alpha-AOS execution state, attempts, leases, and receipts are isolated in `userStateRoot()` (`~/.alpha-aos/`).
2. **Authorized Default Auto-Answers & Safe Input Pause (GSD-01, D-01, D-02, D-03):** Interactive prompts during GSD runs are automatically answered with recommended defaults only when strictly within contract boundaries (`goal`, `allowedRoots`, `allowedEffects`, resource policy). Any question requiring elevated scope or ambiguous choice triggers an immediate transition to `needs-input` for user intervention.
3. **Triple Correlation & Scope Immutability on Resume (GSD-03, D-10, D-11):** Resumption of an interrupted task verifies completed plans against three independent sources: `*-SUMMARY.md`, `STATE.md` row, and git commit `docs(<phase>-<plan>):`. Completed plans are skipped without re-execution. Scope decisions in existing `*-CONTEXT.md` and `*-PLAN.md` are locked as immutable baselines.
4. **Mandatory Execution Receipts & Same-Revision Witness (GSD-04, D-13, D-14):** Configured skills or exit code 0 alone never satisfy acceptance. Every mandatory lifecycle hook must be executed via bounded process invocation with an atomic `HookExecutionReceipt`. Acceptance requires a `ReviewWitnessReceipt` where `targetRevisionSha` and `artifactDigest` match the final working tree and commit 100%, rejecting any post-review drift (`STALE_REVIEW_REFUSED`).

---

## 2. File Inventory & Analog Mapping

| Target File | Category | Role & Data Flow | Closest Codebase Analog |
|---|---|---|---|
| `src/core/task-gsd-lifecycle.ts` | Source (New) | **GSD Lifecycle Adapter:** Orchestrates child processes for GSD phases (`discuss`, `plan`, `execute`, `verify`, `gap`). Injects `--auto` flag, monitors inter-step checkpoints, and reads produced artifacts. | [`src/core/task-gsd.ts`](file:///D:/dev/alpha-AOS/src/core/task-gsd.ts#L123-L173) & [`src/core/process.ts`](file:///D:/dev/alpha-AOS/src/core/process.ts#L11-L60) |
| `src/core/task-gsd-prompt.ts` | Source (New) | **Prompt & Pause Policy:** Intercepts interactive GSD CLI questions; checks contract boundary; answers with default and logs `gsd-default` to journal, or pauses in `needs-input` state. | [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L200-L245) & [`src/core/task-strategy.ts`](file:///D:/dev/alpha-AOS/src/core/task-strategy.ts#L136-L219) |
| `src/core/task-gsd-discovery.ts` | Source (New) | **Phase & Plan Discovery:** Strictly read-only observation of `STATE.md`/`ROADMAP.md`; evaluates triple correlation (Summary + State + Git commit); preserves existing plan decisions immutably. | [`src/core/task-gsd.ts`](file:///D:/dev/alpha-AOS/src/core/task-gsd.ts#L275-L408) (`verifyGsdEvidence`) |
| `src/core/task-gap-router.ts` | Source (New) | **Verification Gap Router:** Evaluates verification/review defects. Routes in-phase defects to GSD gap plans (`plan-phase --gaps`); routes structural additions to `ROADMAP.md` as new phases. Implements 3-stage anti-loop recovery and `blocked` stop. | [`src/core/task-strategy.ts`](file:///D:/dev/alpha-AOS/src/core/task-strategy.ts#L80-L219) & [`src/core/task-verdict.ts`](file:///D:/dev/alpha-AOS/src/core/task-verdict.ts#L174-L197) |
| `src/core/task-hook-receipt.ts` | Source (New) | **Lifecycle Hook Invoker & Receipts:** Executes mandatory GSD hooks (`discuss:pre/post`, `plan:pre/post`, `execute:pre/post`, `verify:pre/post`), hashes output, validates against schema, writes atomic JSON receipt. | [`src/core/gate-receipt.ts`](file:///D:/dev/alpha-AOS/src/core/gate-receipt.ts#L43-L157) & [`src/adapters/task-receipts.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-receipts.ts#L156-L230) |
| `src/core/task-review-witness.ts` | Source (New) | **Review Witness Verifier:** Validates `ReviewWitnessReceipt`, asserts 100% match against current git `HEAD` and artifact digest, throws `STALE_REVIEW_REFUSED` or `MISSING_REVIEW_WITNESS` on mismatch. | [`src/core/task-verdict.ts`](file:///D:/dev/alpha-AOS/src/core/task-verdict.ts#L91-L171) & [`src/core/gate-receipt.ts`](file:///D:/dev/alpha-AOS/src/core/gate-receipt.ts#L78-L121) |
| `schemas/hook-execution-receipt.schema.json` | Schema (New) | **JSON Schema:** Draft 2020-12 closed-world contract for mandatory hook execution receipts under `~/.alpha-aos/receipts/hooks/`. | [`schemas/gate-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/gate-receipt.schema.json) |
| `schemas/review-witness-receipt.schema.json` | Schema (New) | **JSON Schema:** Draft 2020-12 closed-world contract for review witness receipts under `~/.alpha-aos/receipts/reviews/`. | [`schemas/harness-role-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/harness-role-receipt.schema.json) |
| `src/core/task-gsd.ts` | Source (Mod) | **GSD Facade Integration:** Re-exports new bridge modules while preserving base `probeGsdQuickReadiness`, `runGitRead`, and snapshot utilities. | [`src/core/task-gsd.ts`](file:///D:/dev/alpha-AOS/src/core/task-gsd.ts) |
| `src/core/task-run.ts` | Source (Mod) | **Execution Pipeline Integration:** Incorporates hook receipt enforcement, review witness verification, and `needs-input` handling into task verdict logic. | [`src/core/task-run.ts`](file:///D:/dev/alpha-AOS/src/core/task-run.ts#L950-L1120) |
| `src/core/task-supervisor.ts` | Source (Mod) | **Supervisor Loop Integration:** Manages asynchronous pause/resume on `needs-input`, records `gsd-default` journal events, and orchestrates multi-phase retry cycles via `task-gap-router`. | [`src/core/task-supervisor.ts`](file:///D:/dev/alpha-AOS/src/core/task-supervisor.ts#L380-L609) |
| `src/core/task-doctor.ts` | Source (Mod) | **CLI Diagnostic Diagnostics:** Formats GSD lifecycle status, mandatory hook receipts, and review witness revision match. | [`src/core/task-doctor.ts`](file:///D:/dev/alpha-AOS/src/core/task-doctor.ts#L1-L86) |
| `src/cli.ts` | Source (Mod) | **CLI Command Dispatcher:** Implements `alpha-aos task answer <answer>` and `task resume`, updates `task status` and `task doctor` table renderers. | [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L1777-L1930) |
| `test/task-gsd-lifecycle.test.ts` | Test (New) | **Lifecycle Orchestration Suite:** Tests sequential discuss $\rightarrow$ plan $\rightarrow$ execute $\rightarrow$ verify with isolated processes and `--auto`. | [`test/task-gsd.test.ts`](file:///D:/dev/alpha-AOS/test/task-gsd.test.ts) |
| `test/task-gsd-prompt.test.ts` | Test (New) | **Prompt & Pause Suite:** Tests routine default auto-answers, `gsd-default` journal logs, and safe pause on boundary breaches. | [`test/task-contract.test.ts`](file:///D:/dev/alpha-AOS/test/task-contract.test.ts) |
| `test/task-gsd-discovery.test.ts` | Test (New) | **Triple Correlation & Scope Lock Suite:** Tests Summary + State + Git verification and plan resumption without re-execution. | [`test/task-gsd.test.ts`](file:///D:/dev/alpha-AOS/test/task-gsd.test.ts#L228-L288) |
| `test/task-gap-router.test.ts` | Test (New) | **Gap Routing & Anti-Loop Suite:** Tests gap-plan vs new-phase branching and 2x failure progression to `blocked`. | [`test/task-strategy.test.ts`](file:///D:/dev/alpha-AOS/test/task-strategy.test.ts#L54-L150) |
| `test/task-hook-receipt.test.ts` | Test (New) | **Hook Execution Receipt Suite:** Tests hook process execution, receipt hashing, schema check, and Fail-Closed blocking. | [`test/task-receipts.test.ts`](file:///D:/dev/alpha-AOS/test/task-receipts.test.ts#L49-L98) |
| `test/task-review-witness.test.ts` | Test (New) | **Review Witness Verifier Suite:** Tests identical commit SHA match, 1-byte mutation rejection (`STALE_REVIEW_REFUSED`). | [`test/task-verdict.test.ts`](file:///D:/dev/alpha-AOS/test/task-verdict.test.ts) |

---

## 3. Deep-Dive Pattern Specifications

### 3.1 Hook Execution Receipt & Invocation (`task-hook-receipt.ts`)

#### Codebase Analog
- **Primary Analog:** [`src/core/gate-receipt.ts:43-157`](file:///D:/dev/alpha-AOS/src/core/gate-receipt.ts#L43-L157)
- **Secondary Analog (Atomic fsync & directory sync):** [`src/adapters/task-receipts.ts:156-177`](file:///D:/dev/alpha-AOS/src/adapters/task-receipts.ts#L156-L177)

#### Standard Imports
```typescript
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import { runProcess, type ProcessResult } from "./process.js";
import { syncDirectory } from "./writer-lock.js";
import { validateManagedDocument } from "./validation.js";
```

#### Core Pattern & Excerpt
```typescript
// Copied and adapted from src/core/gate-receipt.ts:43-72 and src/adapters/task-receipts.ts:156-177
export type GsdHookPoint =
  | "discuss:pre"
  | "discuss:post"
  | "plan:pre"
  | "plan:post"
  | "execute:pre"
  | "execute:post"
  | "verify:pre"
  | "verify:post";

export interface HookExecutionReceipt {
  readonly schemaVersion: 1;
  readonly kind: "hook-execution-receipt";
  readonly receiptId: string;
  readonly hookPoint: GsdHookPoint;
  readonly phaseId: string;
  readonly planId: string | null;
  readonly targetRevisionSha: string;
  readonly workingTreeDigest: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly durationMs: number;
  readonly executedAt: string;
  readonly status: "passed" | "failed";
  readonly receiptDigest: string;
}

export function computeReceiptPayloadDigest(payload: Omit<HookExecutionReceipt, "receiptDigest">): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function writeHookReceipt(
  receipt: HookExecutionReceipt,
  receiptsRoot?: string
): Promise<string> {
  const targetDir = receiptsRoot ?? join(userStateRoot(), "receipts", "hooks");
  const fileName = `${receipt.phaseId}-${receipt.planId ?? "phase"}-${receipt.hookPoint.replace(":", "-")}.json`;
  const targetPath = join(targetDir, fileName);

  const text = JSON.stringify(receipt, null, 2) + "\n";

  // Validate strictly against schemas/hook-execution-receipt.schema.json
  const schemaPath = join(packageRoot(), "schemas", "hook-execution-receipt.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;
  const validation = validateManagedDocument<HookExecutionReceipt>({
    text,
    format: "json",
    kind: "hook-execution-receipt",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    throw new Error(`Hook receipt validation failed: ${JSON.stringify(validation.issues)}`);
  }

  // Atomic write with mode 0o600, fsync, and syncDirectory (src/adapters/task-receipts.ts:162-177)
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  const tempPath = join(targetDir, `.${fileName}.${randomUUID()}.tmp`);
  const handle = await open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, targetPath);
  await syncDirectory(targetDir);
  return targetPath;
}
```

#### Error Handling & Validation
- If the hook process returns `exitCode !== 0` or times out, `status: "failed"` is recorded and the runner must throw `HOOK_EXECUTION_FAILED` (Fail-Closed).
- Any attempt to read a receipt with missing file or schema deviation returns `null` or raises strict tamper error (modeled on [`src/core/gate-receipt.ts:150-154`](file:///D:/dev/alpha-AOS/src/core/gate-receipt.ts#L150-L154)).

---

### 3.2 Review Witness Verifier (`task-review-witness.ts`)

#### Codebase Analog
- **Primary Analog:** [`src/core/task-verdict.ts:91-171`](file:///D:/dev/alpha-AOS/src/core/task-verdict.ts#L91-L171) (`assessTaskReview`)
- **Secondary Analog:** [`src/core/task-run.ts:1098-1113`](file:///D:/dev/alpha-AOS/src/core/task-run.ts#L1098-L1113) (stale-artifact check before verdict reduction)

#### Standard Imports
```typescript
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import { validateManagedDocument } from "./validation.js";
```

#### Core Pattern & Excerpt
```typescript
// Modeled on src/core/task-verdict.ts:110-117 and CONTEXT.md D-14
export interface ReviewWitnessReceipt {
  readonly schemaVersion: 1;
  readonly kind: "review-witness-receipt";
  readonly requestId: string;
  readonly sessionId: string;
  readonly reviewerHarness: string;
  readonly reviewerVersion: string;
  readonly targetRevisionSha: string; // Must match git HEAD 100%
  readonly artifactDigest: string;    // Must match snapshot sha256 100%
  readonly witnessVerdict: "accepted" | "rejected" | "unknown";
  readonly examinedAt: string;
  readonly criteriaWitnessed: readonly {
    readonly criterionId: string;
    readonly verdict: "pass" | "fail" | "unknown";
    readonly findingSummary?: string;
  }[];
  readonly reportDigest: string;
  readonly receiptDigest: string;
}

export type ReviewWitnessRefusalCode = "MISSING_REVIEW_WITNESS" | "STALE_REVIEW_REFUSED";

export function verifyReviewWitness(options: {
  receipt: ReviewWitnessReceipt | null;
  currentHeadSha: string;
  currentArtifactDigest: string;
}): { valid: boolean; refusalCode: ReviewWitnessRefusalCode | null; reason: string | null } {
  const { receipt, currentHeadSha, currentArtifactDigest } = options;

  if (!receipt) {
    return {
      valid: false,
      refusalCode: "MISSING_REVIEW_WITNESS",
      reason: "No independent review witness receipt recorded for this run.",
    };
  }

  // Exact 40-char git revision matching
  if (receipt.targetRevisionSha !== currentHeadSha) {
    return {
      valid: false,
      refusalCode: "STALE_REVIEW_REFUSED",
      reason: `Review witness evaluated git revision ${receipt.targetRevisionSha.slice(0, 12)}, but current HEAD is ${currentHeadSha.slice(0, 12)}.`,
    };
  }

  // Exact 64-char artifact sha256 matching
  if (receipt.artifactDigest !== currentArtifactDigest) {
    return {
      valid: false,
      refusalCode: "STALE_REVIEW_REFUSED",
      reason: `Review witness evaluated artifact ${receipt.artifactDigest.slice(0, 12)}, but current artifact digest is ${currentArtifactDigest.slice(0, 12)}.`,
    };
  }

  return { valid: true, refusalCode: null, reason: null };
}
```

---

### 3.3 State & Plan Triple Correlation Discovery (`task-gsd-discovery.ts`)

#### Codebase Analog
- **Primary Analog:** [`src/core/task-gsd.ts:324-408`](file:///D:/dev/alpha-AOS/src/core/task-gsd.ts#L324-L408) (`verifyGsdEvidence`)
- **Secondary Analog (Read-only git log & bounds):** [`src/core/task-gsd.ts:84-116`](file:///D:/dev/alpha-AOS/src/core/task-gsd.ts#L84-L116) (`runGitRead`, `readBounded`)

#### Standard Imports
```typescript
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runGitRead } from "./task-gsd.js";
```

#### Core Pattern & Excerpt
```typescript
// Modeled on src/core/task-gsd.ts:370-398
export interface PlanCompletionProof {
  readonly planId: string;
  readonly completed: boolean;
  readonly hasSummary: boolean;
  readonly hasStateRow: boolean;
  readonly hasGitCommit: boolean;
  readonly summaryPath?: string;
  readonly commitSha?: string;
}

export interface PhaseProgressionState {
  readonly phaseId: string;
  readonly completedPlans: readonly PlanCompletionProof[];
  readonly pendingPlans: readonly string[];
  readonly isPhaseComplete: boolean;
  readonly immutableContext: string | null;
}

export async function verifyPlanTripleCorrelation(options: {
  projectRoot: string;
  phaseId: string;
  planId: string;
  baseCommit: string;
}): Promise<PlanCompletionProof> {
  const { projectRoot, phaseId, planId, baseCommit } = options;

  // 1. Proof: SUMMARY.md exists and is regular file
  const summaryRel = `.planning/phases/${phaseId}/${phaseId}-${planId}-SUMMARY.md`;
  const summaryFull = join(projectRoot, summaryRel);
  const hasSummary = existsSync(summaryFull);

  // 2. Proof: STATE.md contains table row
  let hasStateRow = false;
  try {
    const stateText = await readFile(join(projectRoot, ".planning", "STATE.md"), "utf8");
    hasStateRow = stateText.includes(`| ${planId} |`) || stateText.includes(`${phaseId}-${planId}`);
  } catch {}

  // 3. Proof: Git commit docs(<phase>-<plan>): exists after baseCommit
  let hasGitCommit = false;
  let commitSha: string | undefined;
  try {
    const log = await runGitRead(projectRoot, [
      "log",
      `${baseCommit}..HEAD`,
      "--format=%H%x09%s",
    ]);
    const lines = log.split(/\r?\n/u).filter((l) => l.trim().length > 0);
    const targetPrefix = `docs(${phaseId}-${planId}):`;
    for (const line of lines) {
      const [sha, subject] = line.split("\t");
      if (subject?.trim().startsWith(targetPrefix)) {
        hasGitCommit = true;
        commitSha = sha;
        break;
      }
    }
  } catch {}

  const completed = hasSummary && hasStateRow && hasGitCommit;
  return {
    planId,
    completed,
    hasSummary,
    hasStateRow,
    hasGitCommit,
    summaryPath: hasSummary ? summaryRel : undefined,
    commitSha,
  };
}
```

---

### 3.4 Prompt & Pause Policy (`task-gsd-prompt.ts`)

#### Codebase Analog
- **Primary Analog:** [`src/core/task-strategy.ts:136-219`](file:///D:/dev/alpha-AOS/src/core/task-strategy.ts#L136-L219) (`selectRepairStrategy`)
- **Secondary Analog (Scope Check):** [`src/core/task-contract.ts:210-245`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L210-L245)

#### Standard Imports
```typescript
import type { TaskContract } from "./task-contract.js";
import type { TaskDecision } from "./task-check.js";
```

#### Core Pattern & Excerpt
```typescript
// Implements CONTEXT.md D-01, D-02, D-03
export interface GsdPromptEvaluation {
  readonly action: "auto-answer" | "needs-input";
  readonly answer?: string;
  readonly reason: string;
  readonly decision?: Omit<TaskDecision, "id" | "at">;
}

export function evaluateGsdPromptQuestion(
  questionText: string,
  recommendedDefault: string | null,
  contract: TaskContract
): GsdPromptEvaluation {
  // Check for out-of-bounds requests (dependencies, permissions, paths)
  const normalized = questionText.toLowerCase();

  const requestsDependency =
    normalized.includes("install package") ||
    normalized.includes("add dependency") ||
    normalized.includes("npm install");
  if (requestsDependency && !contract.allowedEffects.includes("dependency-change")) {
    return {
      action: "needs-input",
      reason: "Question requests dependency addition outside contract authority.",
    };
  }

  // If no recommended default is available, pause immediately (Fail-Safe)
  if (!recommendedDefault || recommendedDefault.trim() === "") {
    return {
      action: "needs-input",
      reason: "No recommended default provided for ambiguous interactive question.",
    };
  }

  // In-scope routine decision: auto-answer and record decision log category gsd-default
  return {
    action: "auto-answer",
    answer: recommendedDefault,
    reason: `Routine question answered with recommended default '${recommendedDefault}'.`,
    decision: {
      category: "gsd-default",
      choice: recommendedDefault,
      rationale: `GSD prompt auto-answered under approved contract: ${questionText.slice(0, 100)}`,
      criterionIds: contract.criterion.map((c) => c.id),
      substitute: null,
    },
  };
}
```

---

### 3.5 Gap Router & Anti-Loop Recovery (`task-gap-router.ts`)

#### Codebase Analog
- **Primary Analog:** [`src/core/task-strategy.ts:80-219`](file:///D:/dev/alpha-AOS/src/core/task-strategy.ts#L80-L219) (`computeFailureFingerprint`, `NoProgressDetector`, `selectRepairStrategy`)
- **Secondary Analog:** [`src/core/task-verdict.ts:174-197`](file:///D:/dev/alpha-AOS/src/core/task-verdict.ts#L174-L197) (`taskNextAction`)

#### Standard Imports
```typescript
import {
  computeFailureFingerprint,
  NoProgressDetector,
  selectRepairStrategy,
  type FailureHistoryEntry,
  type StrategySelectionResult,
} from "./task-strategy.js";
import type { TaskContract } from "./task-contract.js";
```

#### Core Pattern & Excerpt
```typescript
// Implements CONTEXT.md D-05, D-06, D-08
export type GapRoutingDestination = "gap-plan" | "new-phase" | "blocked";

export interface GapRoutingDecision {
  readonly destination: GapRoutingDestination;
  readonly reason: string;
  readonly targetPhaseId?: string;
  readonly gapIds: readonly string[];
  readonly strategy?: StrategySelectionResult;
}

export function routeVerificationGap(options: {
  contract: TaskContract;
  currentPhaseId: string;
  defectSummary: string;
  isScopeExpansion: boolean;
  history: FailureHistoryEntry[];
}): GapRoutingDecision {
  const { contract, currentPhaseId, defectSummary, isScopeExpansion, history } = options;

  // Check 2x identical failure non-progress policy first (D-08)
  const strategy = selectRepairStrategy(history);
  if (strategy.stage === "stage-3-blocked") {
    return {
      destination: "blocked",
      reason: `Anti-loop triggered: 2+ identical failure iterations exhausted alternatives.`,
      gapIds: [],
      strategy,
    };
  }

  // Structural or scope expansion -> New Phase in ROADMAP.md (D-05)
  if (isScopeExpansion) {
    return {
      destination: "new-phase",
      reason: "Defect represents new functionality or architectural changes exceeding current Phase boundary.",
      gapIds: [defectSummary],
      strategy,
    };
  }

  // In-scope criteria defect -> Native GSD Gap Plan (D-05, D-06)
  return {
    destination: "gap-plan",
    targetPhaseId: currentPhaseId,
    reason: "Defect is within current Phase boundary; routing to native GSD gap plan (*-GAP-*.md).",
    gapIds: [defectSummary],
    strategy,
  };
}
```

---

## 4. Shared Patterns & Cross-Cutting Invariants

### 4.1 Strict JSON Schema Validation
All receipts written to `~/.alpha-aos/receipts/` must undergo schema validation using `validateManagedDocument` from [`src/core/validation.ts:52-95`](file:///D:/dev/alpha-AOS/src/core/validation.ts#L52-L95).
- Schema files are written under `schemas/` in JSON Schema Draft 2020-12.
- `additionalProperties: false` is required on all objects.
- Hexadecimal SHA-256 strings use `^[0-9a-f]{64}$`.
- Git commit hashes use `^[0-9a-f]{40}$`.

### 4.2 Durable Atomic Writes & Permission Isolation
Following [`src/adapters/task-receipts.ts:162-177`](file:///D:/dev/alpha-AOS/src/adapters/task-receipts.ts#L162-L177):
- Receipts must be written to a temporary sibling file (`.<filename>.<uuid>.tmp`) with `mode: 0o600`.
- The file descriptor must be explicitly flushed with `handle.sync()`.
- Renamed atomically with `rename(tempPath, targetPath)`.
- Parent directory fsynced via `syncDirectory(targetDir)` from [`src/core/writer-lock.ts:10-15`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L10-L15).

### 4.3 Fail-Closed Gate Enforcement & Error Normalization
- Any discrepancy between the git revision examined by the reviewer and git `HEAD` triggers `STALE_REVIEW_REFUSED`.
- Error messages from test runs or hook failures must pass through `normalizeErrorMessage` from [`src/core/task-strategy.ts:51-78`](file:///D:/dev/alpha-AOS/src/core/task-strategy.ts#L51-L78) to eliminate transient noise (timestamps, line numbers, ANSI escapes) prior to fingerprinting.

---

## 5. Schema Definitions

### 5.1 Hook Execution Receipt Schema (`schemas/hook-execution-receipt.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://alpha-aos.local/schemas/hook-execution-receipt.schema.json",
  "title": "alpha-AOS GSD Hook Execution Receipt",
  "description": "Deterministic receipt for executed mandatory GSD lifecycle hooks (GSD-04, D-13).",
  "type": "object",
  "required": [
    "schemaVersion",
    "kind",
    "receiptId",
    "hookPoint",
    "phaseId",
    "planId",
    "targetRevisionSha",
    "workingTreeDigest",
    "command",
    "args",
    "exitCode",
    "stdoutSha256",
    "stderrSha256",
    "durationMs",
    "executedAt",
    "status",
    "receiptDigest"
  ],
  "additionalProperties": false,
  "$defs": {
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "gitSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" }
  },
  "properties": {
    "schemaVersion": { "const": 1 },
    "kind": { "const": "hook-execution-receipt" },
    "receiptId": { "type": "string", "minLength": 1 },
    "hookPoint": {
      "enum": [
        "discuss:pre", "discuss:post",
        "plan:pre", "plan:post",
        "execute:pre", "execute:post",
        "verify:pre", "verify:post"
      ]
    },
    "phaseId": { "type": "string", "minLength": 1 },
    "planId": { "type": ["string", "null"] },
    "targetRevisionSha": { "$ref": "#/$defs/gitSha" },
    "workingTreeDigest": { "$ref": "#/$defs/sha256" },
    "command": { "type": "string", "minLength": 1 },
    "args": {
      "type": "array",
      "items": { "type": "string" }
    },
    "exitCode": { "type": "integer" },
    "stdoutSha256": { "$ref": "#/$defs/sha256" },
    "stderrSha256": { "$ref": "#/$defs/sha256" },
    "durationMs": { "type": "integer", "minimum": 0 },
    "executedAt": { "type": "string", "minLength": 1 },
    "status": { "enum": ["passed", "failed"] },
    "receiptDigest": { "$ref": "#/$defs/sha256" }
  }
}
```

### 5.2 Review Witness Receipt Schema (`schemas/review-witness-receipt.schema.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://alpha-aos.local/schemas/review-witness-receipt.schema.json",
  "title": "alpha-AOS Review Witness Receipt",
  "description": "Witness receipt certifying independent review evaluation on identical revision (GSD-04, D-14).",
  "type": "object",
  "required": [
    "schemaVersion",
    "kind",
    "requestId",
    "sessionId",
    "reviewerHarness",
    "reviewerVersion",
    "targetRevisionSha",
    "artifactDigest",
    "witnessVerdict",
    "examinedAt",
    "criteriaWitnessed",
    "reportDigest",
    "receiptDigest"
  ],
  "additionalProperties": false,
  "$defs": {
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "gitSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" }
  },
  "properties": {
    "schemaVersion": { "const": 1 },
    "kind": { "const": "review-witness-receipt" },
    "requestId": { "type": "string", "minLength": 1 },
    "sessionId": { "type": "string", "minLength": 1 },
    "reviewerHarness": { "type": "string", "minLength": 1 },
    "reviewerVersion": { "type": "string", "minLength": 1 },
    "targetRevisionSha": { "$ref": "#/$defs/gitSha" },
    "artifactDigest": { "$ref": "#/$defs/sha256" },
    "witnessVerdict": { "enum": ["accepted", "rejected", "unknown"] },
    "examinedAt": { "type": "string", "minLength": 1 },
    "criteriaWitnessed": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["criterionId", "verdict"],
        "additionalProperties": false,
        "properties": {
          "criterionId": { "type": "string", "minLength": 1 },
          "verdict": { "enum": ["pass", "fail", "unknown"] },
          "findingSummary": { "type": "string" }
        }
      }
    },
    "reportDigest": { "$ref": "#/$defs/sha256" },
    "receiptDigest": { "$ref": "#/$defs/sha256" }
  }
}
```

---

## 6. Test Patterns & Adversarial Fixture Architecture

### 6.1 Test Suite Setup & Teardown Pattern
Every test suite in `test/task-gsd-*.test.ts` must follow the established scratch directory lifecycle from [`test/task-receipts.test.ts:29-33`](file:///D:/dev/alpha-AOS/test/task-receipts.test.ts#L29-L33):
```typescript
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

async function createTestScratch(context: TestContext, label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `alpha-aos-gsd-${label}-`));
  context.after(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return dir;
}
```

### 6.2 4-Adversarial Fixture Suite Mapping (D-15)

| Fixture ID | Adversarial Fault Injection Scenario | Verification Logic | Target Test File |
|---|---|---|---|
| **FIX-01** | Mandatory hook fails (`exitCode: 1`) or times out | Runner catches non-zero exit; receipt written with `status: "failed"`; execution halted before plan execution with `HOOK_EXECUTION_FAILED`. | [`test/task-hook-receipt.test.ts`](file:///D:/dev/alpha-AOS/test/task-hook-receipt.test.ts) |
| **FIX-02** | Execution finishes with exit code 0 but missing `*-SUMMARY.md` or git commit | Discovery triple-correlation fails; run verdict reduced to `rejected` / `missing-evidence`. | [`test/task-gsd-discovery.test.ts`](file:///D:/dev/alpha-AOS/test/task-gsd-discovery.test.ts) |
| **FIX-03** | Abort after Plan 1 completion; resume called with prior context | Triple correlation identifies Plan 1 as completed; Plan 1 skipped without re-running; Plan 2 executed; original CONTEXT.md scope preserved. | [`test/task-gsd-discovery.test.ts`](file:///D:/dev/alpha-AOS/test/task-gsd-discovery.test.ts) |
| **FIX-04** | 1-byte mutation introduced to working tree after reviewer generates witness receipt | Git `HEAD` or artifact digest diverges; `verifyReviewWitness` rejects with `STALE_REVIEW_REFUSED`. | [`test/task-review-witness.test.ts`](file:///D:/dev/alpha-AOS/test/task-review-witness.test.ts) |

---

## 7. Migration & Plan Execution Recommendations

1. **Phase 17 Wave 0 (Foundations & Schemas):**
   - Create `schemas/hook-execution-receipt.schema.json` and `schemas/review-witness-receipt.schema.json`.
   - Implement `src/core/task-hook-receipt.ts` and `src/core/task-review-witness.ts` with comprehensive unit tests.
2. **Phase 17 Wave 1 (Discovery & Policy):**
   - Implement `src/core/task-gsd-discovery.ts` (triple correlation) and `src/core/task-gsd-prompt.ts` (default answers / `needs-input`).
   - Add unit test suites verifying scope immutability and interactive prompt boundary assertions.
3. **Phase 17 Wave 2 (Gap Routing & Lifecycle Orchestrator):**
   - Implement `src/core/task-gap-router.ts` with 3-stage anti-loop recovery.
   - Implement `src/core/task-gsd-lifecycle.ts` multi-phase execution orchestrator.
4. **Phase 17 Wave 3 (Supervisor Integration & CLI Diagnostics):**
   - Update `src/core/task-run.ts`, `src/core/task-supervisor.ts`, `src/core/task-doctor.ts`, and `src/cli.ts`.
   - Verify full end-to-end integration and the 4 adversarial injection fixtures.
