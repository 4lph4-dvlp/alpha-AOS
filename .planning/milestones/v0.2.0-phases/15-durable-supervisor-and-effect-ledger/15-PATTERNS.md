# Phase 15: Durable Supervisor and Effect Ledger - Pattern Map

**Mapped:** 2026-10-01
**Phase:** 15 - Durable Supervisor and Effect Ledger
**Files analyzed:** 15 (new/modified, from 15-CONTEXT.md and 15-RESEARCH.md)
**Analogs found:** 15 / 15

---

## File Classification

| Target File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `schemas/task-contract.schema.json` (modify) | config (schema) | validation | `schemas/task-contract.schema.json` | exact |
| `src/core/task-contract.ts` (modify) | model / service | request-response (validation / serialization) | `src/core/task-contract.ts` (`TaskResourcePolicy`, `digestableTaskContract`, `changedContractFields`) | exact |
| `src/core/task-journal.ts` (new) | service / utility | file I/O (append-only JSONL fsync + atomic checkpoint JSON) | `src/core/transaction.ts` (`writeDurable`/`writeJsonDurable`/`syncDirectory`) + `src/core/redaction.ts` (`createRedactedExcerpt`) | exact |
| `src/core/process.ts` (modify) | utility / service | event-driven / process I/O (tree cleanup, cancellation, limits) | `src/core/process.ts` (`killTree`, `runProcess`, `BoundedStream`) | exact |
| `src/core/task-effects.ts` (modify) | service / model | file I/O / verification (ledger state machine, reconciliation) | `src/core/task-effects.ts` (`readTaskBaseline`, `readTaskChanges`, `dependencyFieldsChanged`) + `src/core/capability-ledger.ts` | exact |
| `src/core/task-strategy.ts` (new) | service / model | request-response / state transition (failure fingerprinting, 3-stage repair) | `src/core/task-verdict.ts` (verdict reduction, next actions, bounded strings) | role-match |
| `src/core/task-supervisor.ts` (new) | controller / service | event-driven / state machine (supervisor loop, resume after interruption) | `src/core/task-run.ts` (`startTask`, `assertTaskStartable`) + `src/core/transaction.ts` (durable state recovery) | exact |
| `src/cli.ts` (modify) | controller | request-response (CLI dispatch) | `src/cli.ts` (`command === "task"`, lines 1692-1782) | exact |
| `src/format.ts` (modify) | component (view) | transform / formatting | `src/format.ts` (`formatTaskRunReport`, lines 1150-1260) | exact |
| `test/task-journal.test.ts` (new) | test | file I/O / unit | `test/task-run.test.ts` + `test/transaction.test.ts` | exact |
| `test/process-tree.test.ts` (new) | test | event-driven / process lifecycle | `test/process.test.ts` + `test/helpers/termination-oracle.ts` | exact |
| `test/task-effects-ledger.test.ts` (new) | test | file I/O / verification | `test/task-effects.test.ts` + `test/helpers/task-fixture.ts` | exact |
| `test/task-limits.test.ts` (new) | test | request-response / unit | `test/task-contract.test.ts` + `test/task-run.test.ts` | exact |
| `test/task-strategy.test.ts` (new) | test | request-response / unit | `test/task-verdict.test.ts` | exact |
| `test/task-supervisor-recovery.test.ts` (new) | test | event-driven / crash fault-injection | `test/transaction-crash.test.ts` + `test/task-tracer.integration.ts` | exact |

---

## Pattern Assignments

### 1. `schemas/task-contract.schema.json` & `src/core/task-contract.ts` (Schema & Contract Extension)

**Context & Decisions:** D-13, D-14, D-15 (RUN-04). Support `maxCycles`, `maxCostUsd`, and `maxTokens` in `resourcePolicy`.

#### A. Schema Pattern (`schemas/task-contract.schema.json`)
Lines 108-114 of [schemas/task-contract.schema.json](file:///D:/dev/alpha-AOS/schemas/task-contract.schema.json#L108-L114):
```json
    "resourcePolicy": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "maxCycles": { "type": "integer", "minimum": 1 },
        "maxCostUsd": { "type": "number", "minimum": 0.01 },
        "maxTokens": { "type": "integer", "minimum": 1 },
        "maxWallTimeMinutes": { "type": "integer", "minimum": 1, "maximum": 1440 }
      }
    }
```
*Rule:* Keep `additionalProperties: false` closed. All keys optional, integers strictly positive.

#### B. Contract Model & Digest Serialization (`src/core/task-contract.ts`)
Lines 54-56 and 479 of [src/core/task-contract.ts](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L54-L56):
```typescript
export interface TaskResourcePolicy {
  maxCycles?: number;
  maxCostUsd?: number;
  maxTokens?: number;
  maxWallTimeMinutes?: number;
}
```
In `digestableTaskContract`:
```typescript
    resourcePolicy: {
      maxCostUsd: contract.resourcePolicy.maxCostUsd ?? null,
      maxCycles: contract.resourcePolicy.maxCycles ?? null,
      maxTokens: contract.resourcePolicy.maxTokens ?? null,
      maxWallTimeMinutes: contract.resourcePolicy.maxWallTimeMinutes ?? null,
    },
```
*Rule:* Canonical key order in `DigestableTaskContract` MUST be strictly alphabetical (`maxCostUsd`, `maxCycles`, `maxTokens`, `maxWallTimeMinutes`) with `null` fallback so digest calculation remains deterministic.

In `changedContractFields` (lines 512+):
```typescript
  compare("resourcePolicy.maxCostUsd", before.resourcePolicy.maxCostUsd, after.resourcePolicy.maxCostUsd);
  compare("resourcePolicy.maxCycles", before.resourcePolicy.maxCycles, after.resourcePolicy.maxCycles);
  compare("resourcePolicy.maxTokens", before.resourcePolicy.maxTokens, after.resourcePolicy.maxTokens);
  compare("resourcePolicy.maxWallTimeMinutes", before.resourcePolicy.maxWallTimeMinutes, after.resourcePolicy.maxWallTimeMinutes);
```

---

### 2. `src/core/task-journal.ts` (Journal & Atomic Checkpoint Storage)

**Context & Decisions:** D-01, D-02, D-03, D-04 (RUN-02).
- Storage layout: `join(userStateRoot(), "runs", contractDigest, "journal.jsonl")` (append-only) and `checkpoint.json` (atomic rename).
- Redaction: Secrets masked with `[REDACTED]`, outputs capped at 64KB with sha256 hash.

#### A. Durable Write & fsync Pattern
Analog from [src/core/transaction.ts](file:///D:/dev/alpha-AOS/src/core/transaction.ts#L151-L168):
```typescript
/** Writes and flushes a file, then flushes the directory entry that names it. */
async function writeDurable(path: string, content: Uint8Array, mode: number): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "w", mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  return syncDirectory(dirname(path));
}

export async function writeJsonDurable(path: string, value: unknown): Promise<boolean> {
  return writeDurable(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), 0o600);
}
```

#### B. Append-Only JSONL Stream Pattern
```typescript
export async function appendJournalEvent(stateRoot: string, contractDigest: string, event: TaskJournalEvent): Promise<void> {
  const dir = join(stateRoot, "runs", contractDigest);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const journalPath = join(dir, "journal.jsonl");
  const line = `${JSON.stringify(event)}\n`;
  const handle = await open(journalPath, "a", 0o600);
  try {
    await handle.writeFile(line, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
```

#### C. Redaction & 64KB Excerpt Cap Pattern
Analog from [src/core/redaction.ts](file:///D:/dev/alpha-AOS/src/core/redaction.ts#L355-L371):
```typescript
export function createRedactedExcerpt(
  raw: string,
  context: RedactionContext,
  budgetBytes: number = LIMITS.excerptBytes,
): RedactedExcerpt {
  const totalBytes = Buffer.byteLength(raw, "utf8");
  const sha256 = createHash("sha256").update(raw, "utf8").digest("hex");
  const redacted = redactCore(raw, context);
  const cut = truncateToUtf8Bytes(redacted, budgetBytes);
  return { excerpt: cut.text, capped: cut.truncated, totalBytes, sha256 };
}
```
*Rule:* Process streams `stdout`/`stderr` recorded in journal entries must pass through `createRedactedExcerpt(raw, context, 65536)` (64KB cap).

---

### 3. `src/core/process.ts` (Process Tree Cleanup & Cancellation)

**Context & Decisions:** D-13, D-16 (RUN-03, RUN-04).
- Safe cancellation via `AbortSignal` with output retention.
- Cross-platform process tree cleanup: Windows `taskkill.exe /pid <pid> /T /F` vs POSIX `process.kill(-pid, "SIGTERM")` with grace period fallback to `SIGKILL`.
- Default 15-minute attempt timeout and 10MB stream buffer cap even in unlimited mode.

#### A. Tree Cleanup Pattern
Analog from [src/core/process.ts](file:///D:/dev/alpha-AOS/src/core/process.ts#L393-L414):
```typescript
export type KillDelivery = "group" | "direct" | "windows-tree" | "already-gone" | "not-required";

export function terminateProcessTree(pid: number, signal: NodeJS.Signals = "SIGKILL"): KillDelivery {
  if (process.platform === "win32") {
    const result = spawnSync("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      timeout: 10_000,
    });
    return result.status === 0 ? "windows-tree" : "already-gone";
  }
  try {
    process.kill(-pid, signal);
    return "group";
  } catch {
    try {
      process.kill(pid, signal);
      return "direct";
    } catch {
      return "already-gone";
    }
  }
}
```
*Enhancement for POSIX Grace Period:*
```typescript
export async function terminateProcessTreeGraceful(pid: number, graceMs = 500): Promise<KillDelivery> {
  if (process.platform === "win32") {
    return terminateProcessTree(pid, "SIGKILL");
  }
  const initial = terminateProcessTree(pid, "SIGTERM");
  if (initial === "already-gone") return initial;
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  return terminateProcessTree(pid, "SIGKILL");
}
```

#### B. Cancellation with Output Retention
In `runProcess` ([src/core/process.ts](file:///D:/dev/alpha-AOS/src/core/process.ts#L460-L482)):
```typescript
    if (spec.signal) {
      if (spec.signal.aborted) {
        if (child.pid !== undefined) treeDelivery = terminateProcessTree(child.pid, "SIGKILL");
        return finish("cancelled", null, null);
      }
      spec.signal.addEventListener("abort", () => {
        if (child.pid !== undefined) treeDelivery = terminateProcessTree(child.pid, "SIGKILL");
        finish("cancelled", null, null);
      }, { once: true });
    }
```
*Rule:* When cancelled or timed out, `finish()` is invoked with `stdout.finish(...)` and `stderr.finish(...)` intact; never discard bytes buffered prior to cancellation.

---

### 4. `src/core/task-effects.ts` (Effect Ledger & Source Evidence Reconciliation)

**Context & Decisions:** D-05, D-06, D-07, D-08 (TOOL-03, RUN-03).
- Deterministic operation key: `sha256("${contractDigest}:${attemptIndex}:${effectType}:${canonical(targetPayload)}")`.
- State machine: `planned` -> `performing` -> `applied` | `failed` | `uncertain` -> `unknown` (blocked).
- Source evidence inspection for `performing`/`uncertain` effects.

#### A. Deterministic Operation Key
Analog from [src/core/task-effects.ts](file:///D:/dev/alpha-AOS/src/core/task-effects.ts#L139-L149):
```typescript
export function generateEffectKey(
  contractDigest: string,
  attemptIndex: number,
  effectType: TaskEffect,
  targetPayload: unknown,
): string {
  const payloadString = canonical(targetPayload);
  return createHash("sha256")
    .update(`${contractDigest}:${attemptIndex}:${effectType}:${payloadString}`, "utf8")
    .digest("hex");
}
```

#### B. Effect Ledger State Machine
```typescript
export type EffectStatus = "planned" | "performing" | "applied" | "failed" | "uncertain" | "unknown";

export interface EffectLedgerEntry {
  effectKey: string;
  effectType: TaskEffect;
  targetPayload: unknown;
  status: EffectStatus;
  attemptIndex: number;
  startedAt: string;
  completedAt: string | null;
  error?: string | null;
}
```

#### C. Source Evidence Reconciliation Pattern
Analog from [src/core/task-effects.ts](file:///D:/dev/alpha-AOS/src/core/task-effects.ts#L123-L189):
```typescript
export async function reconcileEffectEvidence(
  projectRoot: string,
  baseCommit: string,
  entry: EffectLedgerEntry,
): Promise<{ status: "applied" | "not-applied" | "unknown"; reason?: string }> {
  if (entry.effectType === "workspace-write") {
    const { relPath, beforeSha256, afterSha256 } = entry.targetPayload as { relPath: string; beforeSha256: string | null; afterSha256: string };
    const fullPath = join(projectRoot, relPath);
    if (!existsSync(fullPath)) {
      return beforeSha256 === null ? { status: "not-applied" } : { status: "unknown", reason: `File missing but expected beforeSha256: ${beforeSha256}` };
    }
    const currentSha256 = createHash("sha256").update(await readFile(fullPath)).digest("hex");
    if (currentSha256 === afterSha256) return { status: "applied" };
    if (currentSha256 === beforeSha256) return { status: "not-applied" };
    return { status: "unknown", reason: `File hash ${currentSha256} matches neither before nor after hash.` };
  }

  if (entry.effectType === "local-commit") {
    const { expectedSubject } = entry.targetPayload as { expectedSubject: string };
    const changes = await readTaskChanges({ projectRoot, baseCommit });
    const found = changes.commits.some((c) => c.subject === expectedSubject);
    return found ? { status: "applied" } : { status: "not-applied" };
  }

  if (entry.effectType === "dependency-change") {
    const { manifestPath } = entry.targetPayload as { manifestPath: string };
    const changed = await dependencyFieldsChanged(projectRoot, baseCommit, manifestPath);
    return changed ? { status: "applied" } : { status: "not-applied" };
  }

  return { status: "unknown", reason: `Unrecognized effect type: ${entry.effectType}` };
}
```
*Rule:* Fail-closed: If `status === "unknown"`, the supervisor transitions immediately to `blocked` and stops without retrying.

---

### 5. `src/core/task-strategy.ts` (Failure Fingerprint & Adaptive Repair Strategy)

**Context & Decisions:** D-09, D-10, D-11, D-12 (RUN-05).
- Fingerprint: `${criterionId}:${cause}:${normalizedErrorHash}`.
- Trigger: 2 consecutive identical failure fingerprints.
- 3 Stages: Stage 1 (reproduction code & diagnostic injection) -> Stage 2 (single failing criterion focus) -> Stage 3 (`blocked` with structured report).

#### A. Error Normalization & Fingerprinting Pattern
Analog from [src/core/task-verdict.ts](file:///D:/dev/alpha-AOS/src/core/task-verdict.ts#L73-L80) & regex masking:
```typescript
export function normalizeErrorMessage(raw: string): string {
  return raw
    .replace(/\u001b\[[0-9;]*m/gu, "") // strip ANSI
    .replace(/[A-Za-z]:\\[^:\s]+/g, "[PATH]") // Windows absolute paths
    .replace(/\/[^:\s]+/g, "[PATH]") // Unix absolute paths
    .replace(/:\d+:\d+/g, ":[LINE]:[COL]") // Line/column numbers
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "[TIME]") // Timestamps
    .replace(/0x[0-9a-fA-F]+/g, "[ADDR]") // Memory addresses
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function computeFailureFingerprint(criterionId: string, cause: string, rawError: string): string {
  const normalized = normalizeErrorMessage(rawError);
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `${criterionId}:${cause}:${hash}`;
}
```

#### B. Strategy Escalation Controller
```typescript
export type RepairStage = "stage-0-default" | "stage-1-reproduction-injection" | "stage-2-single-criterion-focus" | "stage-3-blocked";

export interface BlockedReport {
  status: "blocked";
  failureFingerprint: string;
  consecutiveFailures: number;
  attemptedStrategies: string[];
  reproductionEvidence: {
    criterionId: string;
    inputText?: string;
    observedStdout?: string;
    observedExitCode?: number;
    summary: string;
  };
  nextAction: string;
}
```

---

### 6. `src/core/task-supervisor.ts` (Durable Supervisor Loop & Resume)

**Context & Decisions:** D-01..D-16 (RUN-02, RUN-03, RUN-04, RUN-05).
- State machine loop coordinating journal, checkpoint, limits, attempt execution, and recovery.
- Verification against actual GSD state (`.planning/STATE.md`, Git HEAD) before resuming.
- Standard stop codes: `cycle_limit_exceeded`, `wall_time_exceeded`, `cost_limit_exceeded`, `no_progress_exhausted`, `quota_exhausted`.

#### A. GSD State Observation & Checkpoint Comparison
Analog from [src/core/task-gsd.ts](file:///D:/dev/alpha-AOS/src/core/task-gsd.ts) and [src/core/task-run.ts](file:///D:/dev/alpha-AOS/src/core/task-run.ts#L758-L770):
```typescript
export async function verifyGsdStateConsistency(
  projectRoot: string,
  checkpoint: TaskCheckpoint,
): Promise<{ consistent: boolean; reason?: string }> {
  const currentHead = (await runGitRead(projectRoot, ["rev-parse", "HEAD"])).trim();
  if (checkpoint.lastVerifiedHead && currentHead !== checkpoint.lastVerifiedHead) {
    // Check if HEAD moved unexpectedly outside recorded effects
    return { consistent: false, reason: `Git HEAD moved from ${checkpoint.lastVerifiedHead} to ${currentHead} outside supervisor control.` };
  }
  const planningState = await snapshotPlanningState(projectRoot);
  // Verify GSD quick outline / status has not diverged
  return { consistent: true };
}
```

#### B. Supervisor Loop Skeleton
```typescript
export async function superviseTask(options: SuperviseTaskOptions): Promise<SupervisorResult> {
  const { contract, stateRoot } = options;
  let checkpoint = await initializeOrLoadCheckpoint(stateRoot, contract);
  
  // Fail-closed check: cost limits require reliable telemetry
  if (contract.resourcePolicy.maxCostUsd !== undefined) {
    const meterReadiness = await checkCostMeterReadiness(contract.agentPolicy, options.ports);
    if (!meterReadiness.supported) {
      throw new TaskRunError("cost-meter-unavailable", "Cost limit specified but harness telemetry unavailable.");
    }
  }

  while (checkpoint.status === "running") {
    // 1. Check Resource Limits
    const limitCheck = evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage);
    if (limitCheck.exceeded) {
      await recordStopAndCheckpoint(stateRoot, checkpoint, limitCheck.stopCode);
      break;
    }

    // 2. Select Strategy (Stage 0, 1, or 2)
    const strategy = selectRepairStrategy(checkpoint.failureHistory);
    if (strategy.stage === "stage-3-blocked") {
      await recordBlockedAndCheckpoint(stateRoot, checkpoint, strategy.blockedReport);
      break;
    }

    // 3. Execute Attempt with 15m/10MB bounds
    const attemptResult = await executeAttemptWithBounds(options, checkpoint, strategy);
    await updateCheckpointAndJournal(stateRoot, checkpoint, attemptResult);

    if (attemptResult.verdict === "accepted") {
      checkpoint.status = "accepted";
      break;
    }
  }

  return { checkpoint, journalPath: runJournalPath(stateRoot, checkpoint.contractDigest) };
}
```

---

### 7. `src/cli.ts` & `src/format.ts` (CLI Dispatch & Formatting)

**Context & Decisions:** CLI interface for `task resume <contract.json> [--contract-digest <digest>] [--apply] [--json]`.

#### A. CLI Dispatch Pattern
Analog from [src/cli.ts](file:///D:/dev/alpha-AOS/src/cli.ts#L1692-L1782):
```typescript
    if (subcommand === "resume") {
      const supplied = optionValue(args, "--contract-digest");
      if (operand === undefined) throw new Error("task resume requires a contract file: alpha-aos task resume <contract.json>");
      if (hasFlag(args, "--apply")) {
        const result = await resumeTask({
          contractPath: operand,
          expectedDigest: supplied,
          stateRoot,
          packageRoot: packageRoot(),
          ports: nativeTaskPorts(),
        });
        print(result, json, formatSupervisorReport(result), context);
        process.exitCode = result.status === "accepted" ? 0 : 1;
        return;
      }
      const readiness = await inspectTaskResumeReadiness(operand, supplied, stateRoot);
      print({ applied: false, readiness }, json, formatTaskResumeReadiness(readiness), context);
      if (!readiness.ready) process.exitCode = 2;
      return;
    }
```

#### B. Formatting Pattern
Analog from [src/format.ts](file:///D:/dev/alpha-AOS/src/format.ts#L1150-L1260):
- Formats standard stop code, usage breakdown (cycles, wallTimeMs, tokens, costUsd, unmeteredFields), effect ledger status table, and adaptive repair stage history.

---

### 8. Test Suites Pattern

#### A. Process Tree Termination Test
Analog from [test/process.test.ts](file:///D:/dev/alpha-AOS/test/process.test.ts#L1-L60) & [test/helpers/termination-oracle.ts](file:///D:/dev/alpha-AOS/test/helpers/termination-oracle.ts):
```typescript
import { describeTermination, mintHeartbeat, waitForTermination } from "./helpers/termination-oracle.js";

test("terminateProcessTree clears deep descendant processes across platforms", async (t) => {
  const heartbeat = mintHeartbeat();
  // Spawn child that spawns grandchild running heartbeat loop
  const spec = normalizeProcessSpec({ executable: process.execPath, args: [spawnerScript, ...heartbeat.args], cwd: scratch });
  const result = await runProcess(spec);
  // Verify tree termination
  const termination = await waitForTermination(heartbeat.path, heartbeat.nonce);
  assert.equal(termination.status, "stopped", describeTermination(termination));
});
```

#### B. Fault-Injection Crash Recovery Test
Analog from [test/transaction-crash.test.ts](file:///D:/dev/alpha-AOS/test/transaction-crash.test.ts#L36-L51):
```typescript
const FAILPOINTS = [
  "before-effect-planned",
  "after-effect-performing",
  "after-effect-applied-before-checkpoint",
  "during-measurements",
] as const;

test("crash before checkpoint safely reconciles source evidence on resume", async (t) => {
  // Inject crash at failpoint
  // Resume task and assert completed effect is not re-executed
});
```

---

## Shared Patterns & Invariants

1. **Deterministic Hashing:** Always use `createHash("sha256")` on canonical representations (`canonical(payload)`) with domain prefixes.
2. **Atomic Disk Operations:** Always use `writeJsonDurable` (temp file + fsync + atomic rename + syncDirectory) for checkpoint files.
3. **Fail-Closed Principle:**
   - Unrecognized or ambiguous effect states -> transition to `unknown` -> `blocked`.
   - Missing cost telemetry when `maxCostUsd` is requested -> refuse start immediately (`cost-meter-unavailable`).
4. **Clean Process Lifecycle:** Always pass explicit `EnvironmentPolicy`, sanitize paths, enforce 15m/10MB bounds, and terminate whole process trees.
5. **Node.js Test Conventions:**
   - Use built-in `node:test` and `node:assert/strict`.
   - Create isolated temporary scratch directories via `mkdtemp(join(tmpdir(), "alpha-aos-..."))` and register cleanup via `t.after(() => rm(scratch, { recursive: true, force: true }))`.

---

## Metadata

**Analog search scope:** `src/core/`, `src/adapters/`, `src/cli.ts`, `src/format.ts`, `schemas/`, `test/`, `test/helpers/`  
**Files scanned:** ~18  
**Pattern extraction date:** 2026-10-01  
**Phase Target:** Phase 15 - Durable Supervisor and Effect Ledger  
