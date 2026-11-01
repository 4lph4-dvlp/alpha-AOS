# Phase 20: General Tool Connectors - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 16 proposed new or modified files
**Analogs found:** 15 / 16 (one protocol interface has no exact existing equivalent)

## File Classification

The paths below are planning touchpoints from `20-CONTEXT.md` and `20-RESEARCH.md`, plus the receipt and review schemas implied by their proposed record changes. A planner may narrow an edit after checking the final record shape. No CoursePilot source, installed skill, or credential file is in scope.

| New/Modified File | Role | Data Flow | Closest tracked analog | Match quality |
|---|---|---|---|---|
| `src/core/task-connector.ts` (new) | service, model | request-response, event-driven, file-I/O | `src/core/task-effects.ts:457-527`; `src/core/task-contract.ts:440-510` | partial; no generic connector port exists |
| `schemas/task-connector.schema.json` (new) | config/schema | transform | `schemas/task-contract.schema.json:1-32,60-95` | role-match |
| `src/adapters/coursepilot-task.ts` (new) | adapter/service | request-response, file-I/O | `src/adapters/task-agent-launch.ts:70-107,138-175`; `src/core/process.ts:48-80,440-505` | role and flow match for process boundary |
| `src/core/task-contract.ts` | model/service | transform, request-response | same file `:19-111,460-542,750-856` | exact extension seam |
| `schemas/task-contract.schema.json` | config/schema | transform | same file `:1-32,60-95` | exact extension seam |
| `src/core/task-effects.ts` | service/model | event-driven, file-I/O | same file `:457-625` | exact extension seam |
| `src/core/task-supervisor.ts` | service | event-driven, batch | same file `:297-356,478-550` | exact recovery seam |
| `src/core/task-run.ts` | service | request-response, batch | same file `:806-845,974-988,1155-1177,1518-1534` | exact orchestration seam; Git branch is development-only |
| `src/core/task-verdict.ts` | service | transform | same file `:101-141,215-310` | exact verdict seam |
| `src/core/task-review-evidence.ts` | service/model | transform, file-I/O | same file `:197-244` | exact evidence seam; current locators are code-oriented |
| `schemas/task-receipt.schema.json` (conditional) | config/schema | transform | `schemas/task-contract.schema.json:1-32`; `src/core/task-run.ts:288-315` | role-match; update if run receipt gains connector fields |
| `schemas/task-review.schema.json` (conditional) | config/schema | transform | same file `:1-28` | exact extension seam if evidence locator shape changes |
| `src/format.ts` | utility | transform | same file `:1097-1124,1144-1198` | exact output seam |
| `src/cli.ts` | controller | request-response | same file `:1800-1827,1873-1879` | exact dispatch seam; Phase 21 owns persistent operator CLI |
| `test/task-connector.test.ts` (new) | test | request-response, event-driven | `test/task-effects-ledger.test.ts:18-45,224-266`; `test/task-run.test.ts:61-115` | role and flow match |
| `test/task-coursepilot.test.ts` (new) | test | request-response, file-I/O | `test/process.test.ts:145-173`; `test/task-effects-ledger.test.ts:224-266` | role and flow match |

## Pattern Assignments

### Contract, schema, and approval

**Apply to:** `src/core/task-contract.ts`, `schemas/task-contract.schema.json`, `src/core/task-connector.ts`, `schemas/task-connector.schema.json`.
**Analog:** `src/core/task-contract.ts` and `schemas/task-contract.schema.json`.

Imports and explicit types (`src/core/task-contract.ts:1-10,19-45,64-76`):

```typescript
import { open, readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { reviewedDigest } from "./component-session.js";
import { rejectRawCredentials, validateManagedDocument, type ValidationIssue } from "./validation.js";

export type TaskEffect = "workspace-write" | "local-commit" | "dependency-change";
export interface TaskContract {
  schemaVersion: 1;
  id: string;
  revision: number;
  mode: "autopilot";
  category: "development";
  goal: string;
  scope: TaskScope;
  allowedRoots: string[];
  allowedEffects: TaskEffect[];
  criterion: TaskCriterion[];
  agentPolicy: TaskAgentPolicy;
  resourcePolicy: TaskResourcePolicy;
}
```

Canonical approval identity (`src/core/task-contract.ts:440-450,460-476,509-510,519-532`):

```typescript
export function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalJsonValue(record[key])]),
    );
  }
  return value;
}

export function taskContractDigest(contract: TaskContract): string {
  return reviewedDigest(TASK_CONTRACT_DIGEST_KIND, digestableTaskContract(contract));
}
```

Copy the fixed-key canonical view in `digestableTaskContract` (`:460-507`) and add every connector authority field to that view **and** `changedContractFields` (`:519-542`). `approveTaskContract` compares the recomputed digest and rejects reused revisions (`:750-773`); `assertTaskStartable` rechecks exact approval (`:816-829`). A filename, attachment set, destination, or manifest identity change must therefore require a new preview and approval. The current `category`, `workflow`, effect and measurement literals are development-only (`:19-45,64-76`); use a discriminated general-task branch, not a widened unchecked string.

Closed schema style (`schemas/task-contract.schema.json:1-21,62-95`):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://alpha-aos.local/schemas/task-contract.schema.json",
  "type": "object",
  "required": ["schemaVersion", "id", "revision", "mode", "category", "goal", "scope", "allowedRoots", "allowedEffects", "criterion", "agentPolicy", "resourcePolicy"],
  "additionalProperties": false
}
```

The existing schema caps roots at 64 and criteria at 32 (`:78-95`); give the connector manifest explicit item, file, text and byte bounds rather than relying on those unrelated caps. Version routing must reject future versions before assigning authority.

### Connector protocol and CoursePilot adapter

**Apply to:** `src/core/task-connector.ts`, `schemas/task-connector.schema.json`, `src/adapters/coursepilot-task.ts`.
**Analogs:** `src/core/validation.ts`, `src/core/process.ts`, `src/adapters/task-agent-launch.ts`. There is no same-role generic `preview/perform/reconcile/verify` interface to copy; the interface in `20-RESEARCH.md:172-185` is proposed design, not existing API.

Version and schema gate (`src/core/validation.ts:673-689,745-786`):

```typescript
export function validateManagedDocument<T = unknown>(options: {
  text: string;
  format: ManagedFormat;
  kind: ManagedDocumentKind;
  schema?: Record<string, unknown>;
  domain?: (value: unknown) => ValidationIssue[];
}): ValidationResult<T> {
  // ...
  const rawVersion = split.core.schemaVersion;
  const routes = schemaRoutesFor(options.kind);
  const route = routes.find((candidate) => candidate.version === rawVersion);
  if (route === undefined) {
    // unknown-newer or unsupported-old; no current-schema fallback
  }
  const validate = validatorFor(options.kind, options.schema);
  const schemaOk = validate(core);
}
```

The abridged control flow above names the exact existing calls; read the full non-overlapping source ranges before editing. `validateAgainstSchema` (`src/core/validation.ts:866-877`) is the reusable focused Ajv helper when the connector owns version dispatch. Keep the alpha-AOS connector version distinct from the installed CoursePilot output shape and fingerprint the runtime `JSON_CONTRACT.md` at execution time.

Argument-array, no-shell process boundary (`src/core/process.ts:48-69,440-470`):

```typescript
export interface ProcessSpec {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  environment?: EnvironmentPolicy;
  excerptBytes?: number;
  signal?: AbortSignal;
}

const child = spawn(spec.executable, [...spec.args], {
  cwd: spec.cwd,
  env: environment,
  shell: false,
  windowsHide: true,
  detached: process.platform !== "win32",
  stdio: [spec.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
});
```

`runProcess` rejects a nonabsolute executable (`:451-455`), returns bounded redacted excerpts and `outputCapped` (`:497-505`), and never returns raw stdout. The adapter must refuse a truncated/redaction-altered parse or changed item identity; a tool success claim cannot override source/file checks. Do not interpolate LMS labels into a shell, persisted command, or agent instruction.

Runtime resolution and allowlisted environment (`src/adapters/task-agent-launch.ts:70-71,91-107,138-163`):

```typescript
export function nameOnlyEnvironment(names: readonly string[], source: NodeJS.ProcessEnv): EnvironmentPolicy {
  return { optional: [...names], source };
}

export function resolveTaskAgentLaunch(command: string, options: { resolve?: TaskAgentResolver } = {}): TaskAgentLaunch {
  // ...
  resolved = (options.resolve ?? resolveCommand)(command);
  // ...
  const direct = resolveDirectLaunch(resolved);
  if (direct === null) return { status: "unsupported", reason: "..." };
  return { status: "ok", executable: direct.executable, argsPrefix: [...direct.argsPrefix], resolved };
}
```

Use the same injected resolver/runner shape for fixture tests. Resolve installed skill and CLI at runtime; do not persist a user's local path or credential value in a repository artifact. CoursePilot exposes course/week selection but no material/attachment selector (`20-RESEARCH.md:131-133`). A live group is safe only when its freshly observed actionable set is wholly approved and unresolved; otherwise report a blocked or reapproval action for that group and continue independent safe groups. Unknown attachment cardinality cannot be promoted to complete item success.

### Effect ledger and recovery

**Apply to:** `src/core/task-effects.ts`, `src/core/task-supervisor.ts`, connector `reconcile`.
**Analog:** the same tracked files' existing effect state machine and recovery branch.

Stable key and state transitions (`src/core/task-effects.ts:478-520`):

```typescript
export function generateEffectKey(
  contractDigest: string,
  attemptIndex: number,
  effectType: TaskEffect,
  targetPayload: unknown,
): string {
  const canonicalPayload = canonical(targetPayload);
  const raw = `${contractDigest}:${attemptIndex}:${effectType}:${canonicalPayload}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

const valid =
  current === next ||
  (current === "planned" && next === "performing") ||
  (current === "performing" && (next === "applied" || next === "failed" || next === "uncertain")) ||
  (current === "uncertain" && (next === "applied" || next === "unknown" || next === "planned"));
```

`reconcileEffectEvidence` (`:523-592`) dispatches on effect type and returns `applied | not-applied | unknown`; `reconcileLedgerOnRecovery` (`:594-625`) turns ambiguous evidence into `unknown`. Extend dispatch with connector source and file evidence, not a Git SHA guess. The current key includes `attemptIndex`; for an approved file effect that must remain stable across retries, the planner must decide how the same item/file identity maps to a stable key rather than letting a new attempt silently authorize a duplicate download.

Recovery stop gate (`src/core/task-supervisor.ts:321-355`):

```typescript
const reconciliation = await reconcileLedgerOnRecovery(projectRoot, baseCommit, ledger);
ledger = reconciliation.ledger;
await saveEffectLedger(options.stateRoot, digest, ledger);

if (reconciliation.hasUnknown) {
  checkpoint.status = "blocked";
  checkpoint.stopReason = `ambiguous_effect_recovery: ${reconciliation.unknownEffects.map((e) => e.effectKey).join(", ")}`;
  await writeCheckpoint(options.stateRoot, checkpoint);
  // ... return status: "blocked"
}
```

The excerpt abbreviates event payload and return fields; exact lines are `:330-355`. Preserve verified per-file receipts before moving to the next course/week group. Recheck current files on resume and before reporting; retain old receipts as audit history but remove missing files from current success counts. A valid partial outcome is item-specific; unknown schema or a global fatal result stops the active connector operation.

### Run, independent evidence, verdict

**Apply to:** `src/core/task-run.ts`, `src/core/task-review-evidence.ts`, `src/core/task-verdict.ts`, conditionally `schemas/task-receipt.schema.json` and `schemas/task-review.schema.json`.

Development-specific branch to isolate (`src/core/task-run.ts:806-845,974-988,1155-1175`):

```typescript
const { loaded, approval } = await assertTaskStartable(options);
const { contract, digest } = loaded;
// ...
const baseline = await readTaskBaseline({ projectRoot });
// ...
const changes = await readTaskChanges({ projectRoot, baseCommit: baseline.baseCommit });
const audit = await auditTaskEffects({ contract, runId, changes, projectRoot, baseCommit: baseline.baseCommit });
// ...
const collected = await collectTaskArtifact({ projectRoot, allowedRoots: contract.allowedRoots });
```

The approval gate is common. The clean Git baseline, `gsd-quick` readiness, repository changes, snapshot and CLI JSON measurement are development assumptions. Route a general connector artifact through a separate measured path that digests the approved manifest and *current* verified evidence, then passes that digest into the existing independent review and `reduceTaskVerdict` call (`src/core/task-run.ts:1518-1534`). Do not reuse a repository file count as saved-file proof.

Review binding (`src/core/task-review-evidence.ts:213-244`; `src/core/task-verdict.ts:124-141`):

```typescript
if (report.requestId !== request.requestId) {
  issues.push({ code: "request-id-mismatch", message: "the report answers a different review request" });
}
if (report.contractDigest !== request.contractDigest) {
  issues.push({ code: "contract-digest-mismatch", message: "the report is bound to a different contract digest" });
}
if (report.artifactDigest !== request.artifactDigest) {
  issues.push({ code: "artifact-digest-mismatch", message: "the report is bound to a different artifact digest" });
}
```

`validateTaskReviewEvidence` also checks the exact criterion set and duplicate IDs (`:233-244`). Add source/item/file receipt locators with independently resolvable evidence. Current `snapshot-file | check-receipt` locators (`:7-14`) and mandatory `targetRevisionSha` in `schemas/task-review.schema.json:7-24` are code-oriented; a general task needs an exact non-Git target identity rather than a fabricated SHA. Keep schema and TypeScript report types synchronized.

Criterion and next-action pattern (`src/core/task-verdict.ts:245-303`):

```typescript
const ids = input.contract.criterion.map((criterion) => criterion.id).sort(byCodeUnit);
const rows = ids.map((criterionId): TaskVerdictRow => {
  const measured = input.measurements.find((entry) => entry.criterionId === criterionId);
  if (criterion === undefined || measured === undefined) {
    throw new Error(`Verdict refused: criterion ${criterionId} has no measurement.`);
  }
  // ...
  if (measured.outcome === "unavailable") {
    return row("unknown", `Measurement unavailable (${measured.cause}): ${measured.detail}`, taskNextAction(cause, context));
  }
});
```

The `criterion` lookup and `cause` assignment are at `:262-265,294-296`; the excerpt abbreviates intervening row construction. Map each unresolved material/file reason to a specific action. The overall outcome cannot be accepted from a reviewer claim alone: verified files and item-to-source links are the measured basis. One verified file may satisfy multiple independently proven item links, but physical file count is deduplicated.

### Human and JSON reporting

**Apply to:** `src/format.ts`, `src/cli.ts`.
**Analog:** existing preview/report formatter and read-only report dispatch.

`formatTaskContractPreview` displays scope, allowed effects, criteria and exact digest before the separate approval command (`src/format.ts:1097-1124`). `formatTaskRunReport` builds status and criterion rows before detail (`:1144-1163`). For Phase 20, put current aggregate counts first (newly downloaded, previously verified, unsaved, errors; physical files separate from satisfied items), then course/week/item file details, then pending approval and per-item next actions. Use bounded plain text for LMS strings.

CLI read-only report pattern (`src/cli.ts:1810-1814,1873-1879`):

```typescript
if (subcommand === "report" && hasFlag(args, "--apply")) {
  throw new Error("`task report` has no --apply: it reads and persists nothing. Approve a reviewed contract with `alpha-aos task approve <contract.json> --contract-digest <digest> --apply`.");
}

if (subcommand === "report") {
  if (operand === undefined) throw new Error("task report requires a contract id: alpha-aos task report <contract-id> [--run <run-id>]");
  const runId = optionValue(args, "--run");
  const run = await readTaskReport({ stateRoot, contractId: operand, ...(runId === null ? {} : { runId }) });
  if (run === null) throw new Error(`no run recorded for task ${operand}${runId === null ? "" : ` with run id ${runId}`}`);
  print(run, json, formatTaskRunReport(run), context);
  return;
}
```

Keep structured JSON and human output derived from the same verified run data. The approved item list is the progress denominator; newly discovered unapproved items appear separately.

### Tests

**Apply to:** `test/task-connector.test.ts`, `test/task-coursepilot.test.ts`.
**Analogs:** `test/task-effects-ledger.test.ts`, `test/task-run.test.ts`, `test/process.test.ts`.

Use Node's `node:test` and strict assertions with temporary fixtures and cleanup (`test/task-effects-ledger.test.ts:1-16,224-226`). The stable-key test compares canonicalized payload order (`:18-45`); recovery test starts entries in `performing` and `uncertain`, then expects an `unknown` blocker (`:224-266`). `test/task-run.test.ts:94-115` proves an executor success claim with wrong observed output is rejected. `test/process.test.ts:145-173` sends shell metacharacters as a single argv value and asserts no side effect. Copy these falsification patterns for a generic fixture and fake CoursePilot executable, including changed/removed manifest items, unsafe course/week batch, duplicate physical path, missing file on report, valid exit 1 partial result, exit 2 with empty stdout, malformed or unknown-version JSON, output cap, wrong source ID, and hostile LMS title.

## Shared Patterns

| Concern | Tracked source | Apply to |
|---|---|---|
| Exact approved identity and new revision on drift | `src/core/task-contract.ts:460-542,750-829` | contract, connector manifest, CoursePilot preview |
| Closed validation with unknown-version refusal | `src/core/validation.ts:673-689,745-786`; `schemas/task-contract.schema.json:1-21` | connector protocol, CoursePilot normalization, receipts |
| Explicit argv and environment, time/output budget | `src/core/process.ts:34-69,440-505`; `src/adapters/task-agent-launch.ts:70-107` | CoursePilot adapter |
| Stable effect checkpoint and uncertain-effect stop | `src/core/task-effects.ts:478-625`; `src/core/task-supervisor.ts:321-355` | perform/reconcile and resume |
| Independent review bound to exact artifact | `src/core/task-review-evidence.ts:213-244`; `src/core/task-verdict.ts:245-310` | item/file evidence and final verdict |
| Core returns data, CLI formats/prints | `src/format.ts:1097-1124,1144-1163`; `src/cli.ts:1873-1879` | aggregate and per-item report |

No authentication middleware exists for this path. Authentication stays inside the installed CoursePilot runtime; alpha-AOS passes only reviewed environment names, never records credential values. Expected per-course errors remain data and preserve other verified groups. Structural/contract errors and unresolvable uncertain effects fail closed.

## No Exact Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/core/task-connector.ts` | service/model | request-response, event-driven, file-I/O | No current non-code connector port with preview/perform/reconcile/verify or itemized external-file evidence. Use the proposed shape in `20-RESEARCH.md:172-185`, bounded by the tracked contract, ledger and validation examples above. |

## Metadata

**Analog search scope:** tracked `src/core/`, `src/adapters/`, `schemas/`, `test/` only; `git ls-files` confirmed all analog paths.
**Files scanned for roles:** 10 core/CLI/format files, one adapter, two schemas, seven focused tests; targeted ranges read once.
**Limits:** The installed CoursePilot CLI lacks item/attachment targeting and its observed result has one `saved_path` per material (`20-RESEARCH.md:131-141`). This map makes no live LMS or credential claim. The planner should preserve blocked/unknown outcomes where safe targeted execution or attachment completeness cannot be proven.
