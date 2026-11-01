# Phase 14: Contract and Vertical Tracer - Pattern Map

**Mapped:** 2026-09-30
**Files analyzed:** 17 (new/modified, from 14-RESEARCH.md "Proposed file ownership")
**Analogs found:** 15 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `schemas/task-contract.schema.json` | config (schema) | validation | `schemas/gate-receipt.schema.json`, `schemas/approved-plan.schema.json` | exact |
| `schemas/task-receipt.schema.json` (implied) | config (schema) | validation | `schemas/gate-receipt.schema.json` | exact |
| `src/core/task-contract.ts` | service | transform + digest/approve | `src/core/project-plan.ts` (`digestablePlan`/`sealPlan`/`approveProjectPlan`) + `src/core/component-session.ts` (`reviewedDigest`) | exact |
| `src/core/task-receipt.ts` | service | file-I/O (managed state) | `src/core/gate-receipt.ts` (`writeGateReceipt`/`readGateReceiptStrict`) | exact |
| `src/adapters/task-codex.ts` | adapter | request-response (child process) | `src/core/process.ts` `runProcess` + `src/adapters/harnesses.ts` | role-match |
| `src/adapters/task-claude.ts` | adapter | request-response (child process) | same as above | role-match |
| `src/core/task-check.ts` | service | batch (oracle run) | `src/core/gate-receipt.ts` `computeRiskSurfaceDigest` + `runProcess` | partial |
| `src/core/task-verdict.ts` | service | transform (reducer) | `src/core/doctor.ts` typed findings pattern | partial |
| `src/core/task-gsd.ts` | service | request-response (bounded read/dispatch) | `src/core/gsd-context.ts` | role-match |
| `src/cli.ts` (modify) | controller | request-response | `src/cli.ts` `project approve` branch (lines 1184-1255) | exact |
| `src/format.ts` (modify) | utility | transform | `formatProjectApprovalPreview` / `formatProjectApproval` in `src/format.ts` | exact |
| `src/types.ts` (modify) | model | - | `GateReceipt` type in `src/types.ts` | exact |
| `test/task-contract.test.ts`, `test/task-receipt.test.ts`, `test/task-verdict.test.ts`, `test/task-gsd.test.ts`, `test/task-agents.test.ts` | test | unit | `test/gate-lifecycle.test.ts`, `test/project-plan.test.ts`, `test/process.test.ts` | exact |
| `test/task-cli.test.ts` | test | CLI integration | `test/gate-lifecycle.test.ts` (spawns `dist/src/cli.js` with scratch `ALPHA_AOS_STATE_DIR`) | exact |
| `test/task-tracer.integration.ts` | test | live integration | `test/ecc-upstream.integration.ts` | role-match |
| `test/fixtures/task-json-cli/` | fixture | file-I/O | none (test/helpers/*-fixture.ts build fixtures programmatically) | no analog |

## Pattern Assignments

### `src/core/task-contract.ts` (service, digest + approval)

**Analog A:** `src/core/component-session.ts` lines 61-67 — digest primitive (domain-separated SHA-256):
```typescript
export function reviewedDigest(kind: string, content: unknown): string {
  return createHash("sha256").update(`${kind}\n${JSON.stringify(content)}`, "utf8").digest("hex");
}
```
`JSON.stringify` is key-order sensitive: build a digestable view with explicitly sorted keys/collections first (CON-01).

**Analog B:** `src/core/project-plan.ts` lines 1095 (`digestablePlan`), 1176-1181 — named digest kind constant + seal:
```typescript
/** The digest name every reviewed project plan is bound under. */
export const PLAN_DIGEST_KIND = "project-capability-plan";

function sealPlan(plan: Omit<ProjectCapabilityPlan, "planDigest">): ProjectCapabilityPlan {
  return { ...plan, planDigest: reviewedDigest(PLAN_DIGEST_KIND, digestablePlan(plan)) };
}
```
`digestablePlan` (line 1095) projects only review-relevant fields into arrays of tuples — copy this for `digestableContract` (exclude `approval` metadata; include goal, scope, criterion[], allowedRoots, allowedEffects, agentPolicy, resourcePolicy, mode, revision).

**Analog C:** `src/core/project-plan.ts` lines 1847-1877 — exact-digest approval with revalidation, drift explanation, idempotency:
```typescript
export async function approveProjectPlan(options: ApproveProjectPlanOptions): Promise<ProjectApprovalResult> {
  const revalidated = await revalidateProjectPlan(options);
  const reviewed: ReviewedPlanBoundary = { kind: PLAN_DIGEST_KIND, proofs: revalidated.boundary.proofs, digest: options.expectedDigest };
  try {
    assertPlanUnchanged(reviewed, revalidated.boundary);
  } catch (error) {
    if (!(error instanceof ComponentPlanError)) throw error;
    throw await explainPlanDrift(options, revalidated);
  }
  const existing = await readApprovedProjectPlan(revalidated.artifactPath, options.packageRoot);
  if (existing.state === "present" && existing.artifact.approvedDigest === revalidated.plan.planDigest) {
    return { status: "already-current", operationId: null, ... };
  }
```
Map to D-04: `explainPlanDrift` analog must list changed contract fields + new digest. Start (D-02) repeats the recompute-and-compare before any effect.

---

### `src/core/task-receipt.ts` (service, managed file-I/O)

**Analog:** `src/core/gate-receipt.ts` (whole file, 155 lines).

Imports (lines 1-12):
```typescript
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ... } from "../types.js";
import { packageRoot, userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { validateManagedDocument } from "./validation.js";
```
Write pattern (lines 78-112): serialize `JSON.stringify(x, null, 2) + "\n"` -> load `schemas/<kind>.schema.json` from `packageRoot()` -> `validateManagedDocument({ text, format: "json", kind, schema })` -> throw on `!validation.ok` -> `applyFileTransaction({ stateRoot: userStateRoot(), allowedRoots: [...], operations: [{ target, content: Buffer.from(text, "utf8") }] })` -> return `{ receiptPath, transactionId: journal.id }`.

Strict read (lines 118-155): `existsSync` -> null; else schema-validate and throw `"... is invalid or tampered: ..."`.

Deviation: D-16 says receipts live in **local managed state** (under `userStateRoot()`, e.g. `tasks/<contractId>/...`), not in the project's `.alpha-aos/` as gate receipts do; set `allowedRoots` to that state subdir. Do NOT reuse gate-receipt's `status = exitCode === 0 ? "passed" : "failed"` (lines 52) — verdict comes from task-verdict reducer.

---

### `schemas/task-contract.schema.json`, `schemas/task-receipt.schema.json`

**Analog:** `schemas/gate-receipt.schema.json` lines 1-30:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://alpha-aos.local/schemas/gate-receipt.schema.json",
  "title": "alpha-AOS structured gate receipt",
  "description": "Closed contract for ... (GATE-02, D-06).",
  "type": "object",
  "required": [ ... ],
  "additionalProperties": false,
  "$defs": { "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" } },
  "properties": { "schemaVersion": { "const": 1 }, "status": { "enum": ["passed", "failed"] } }
}
```
Closed (`additionalProperties: false`) at every nesting level; verdict enum `accepted|rejected|unknown`, per-criterion `pass|fail|unknown`. Also see `schemas/approved-plan.schema.json` for an approval-artifact shape.

---

### `src/adapters/task-codex.ts`, `src/adapters/task-claude.ts` (adapter, bounded process)

**Analog:** `src/core/process.ts` lines 32-82 (`EnvironmentPolicy`, `ProcessSpec`, `ProcessResult`) and 421-440 (`runProcess`).
```typescript
export async function runProcess(spec: ProcessSpec): Promise<ProcessResult> {
  const environment = materializeEnvironment(spec.environment);
  ...
  if (!isAbsolute(spec.executable)) {
    throw new ProcessPolicyError("unsupported-executable", `Executable must be an absolute path ...`);
  }
```
Key contract fields: `environment.required/optional/literal/source` (ambient env never inherited), `excerptBytes` for parseable output, result `timedOut`, `outputCapped`, `stdout: RedactedExcerpt`. Adapters must reject `outputCapped`/`timedOut`, resolve native `codex.exe` (not `codex.cmd`, see `normalizeProcessSpec` process.ts ~884-909), and pass explicit env policy. For JSONL streaming consider `openProtocolProcess` (process.ts 512-553; tests in `test/protocol-session.test.ts`).

Detection/probe: `src/adapters/harnesses.ts` (existing harness detection + permission probe) for resolving the installed CLI and version.

Test env helper (from `test/gate-lifecycle.test.ts` lines 7, 20-30):
```typescript
const probeEnv = commandProbeEnvironment({ source: process.env });
function gateEnvironment(stateRoot: string): EnvironmentPolicy {
  return { ...probeEnv, literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: stateRoot } };
}
```

---

### `src/core/task-check.ts` (deterministic oracle + artifact digest)

**Analog:** `src/core/gate-receipt.ts` lines 18-37 `computeRiskSurfaceDigest` — sorted, deduped path:hash manifest:
```typescript
const sortedFiles = Array.from(new Set(riskFiles)).sort();
const hasher = createHash("sha256");
for (const relPath of sortedFiles) {
  ...hasher.update(`${relPath}:${fileHash}\n`, "utf8");
  // catch -> hasher.update(`${relPath}:MISSING\n`, "utf8");
}
```
Use same shape for the artifact digest (add a domain prefix). Run the fixture CLI via `runProcess` with absolute `process.execPath`; parse output JSON and compare to contract-fixed expectation; exit code alone never passes a criterion.

---

### `src/core/task-verdict.ts` (reducer)

**Analog (partial):** typed diagnostics as values — `DoctorFinding` in `src/types.ts` consumed by `src/core/doctor.ts`. Pure function: inputs (contract digest/revision, artifact digest, check results, review report) -> per-criterion rows `{criterionId, verdict, measured, review, artifactDigest, reason, nextAction?}`. Throw/refuse on digest mismatch (stale review, D-11); `unknown` carries missing evidence + next action (D-15). No filesystem.

---

### `src/core/task-gsd.ts`

**Analog:** `src/core/gsd-context.ts` lines 1-40 — allowlisted workflow names, `realpath` root containment check, 1 MiB bound, fatal UTF-8 decode, step parsing:
```typescript
const workflows = ["execute-phase", "execute-plan", "quick"];
if (!workflows.includes(workflow)) throw new Error("GSD context supports execute-phase, execute-plan, or quick.");
const rel = relative(root, source);
if (isAbsolute(rel) || rel === ".." || rel.startsWith("..\\") || rel.startsWith("../")) {
  throw new Error("GSD workflow resolves outside its workflow root.");
}
```
Reuse `readGsdContext` rather than re-reading workflows; module must never write `.planning/`.

---

### `src/cli.ts` (modify: `task preview|approve|start|report`)

**Analog:** `src/cli.ts` lines 1117-1128 (subcommand allowlist + refusing meaningless `--apply`) and 1184-1255 (`project approve`):
```typescript
if (subcommand === "approve") {
  const stateRoot = userStateRoot();
  const apply = hasFlag(args, "--apply");
  const reviewed = optionValue(args, "--plan-digest");
  if (!apply || reviewed === null) {
    const revalidated = await revalidateProjectPlan({ ...planOptions, stateRoot });
    const command = approvalCommand({ path: target, subProject, planDigest: revalidated.plan.planDigest });
    if (!apply) {
      print({ applied: false, planDigest: ..., command, plan: ... }, json, formatProjectApprovalPreview(...), context);
      return;
    }
    throw new Error(`project approve --apply requires the digest that was reviewed. The current plan digest is ${...}. Run: ${command}`);
  }
  ...
  const result = await approveProjectPlan({ ...planOptions, stateRoot, expectedDigest: reviewed });
  print(result, json, formatProjectApproval(result), context);
```
Also add HELP lines (analog line 145). `start` is a separate verb requiring `--contract-digest` (D-02). `approvalCommand`/`shellQuote` at `src/core/project-plan.ts` 1664-1688 for printing the exact next command.

### `src/format.ts` (modify)
**Analog:** `formatProjectApprovalPreview`, `formatProjectApproval` (used at cli.ts 1197, 1253) — return a string; JSON stays in CLI `print`. Add a per-criterion verdict table formatter (D-13).

## Shared Patterns

- **Digest binding:** `reviewedDigest(kind, view)` + `*_DIGEST_KIND` constant (component-session.ts 61-67; project-plan.ts 1176-1181). Apply to contract, artifact, review report.
- **Managed writes:** `applyFileTransaction` with explicit `allowedRoots` + schema validate before write + strict schema read (gate-receipt.ts 78-155). Apply to all receipts/approvals.
- **Child processes:** `runProcess` absolute executable, explicit `EnvironmentPolicy`, caps (process.ts 32-82, 421+). Apply to adapters and oracle.
- **Errors:** `throw new Error(...)` with identifier + value + next command (cli.ts 1202).
- **Imports:** relative `.js` suffix, `node:` built-ins, `import type` for types.
- **Tests:** `node:test` + `node:assert/strict`, `mkdtemp` scratch root with `context.after(rm ...)` (gate-lifecycle.test.ts 1-38); CLI tests spawn `dist/src/cli.js` with scratch `ALPHA_AOS_STATE_DIR` literal.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `test/fixtures/task-json-cli/` | fixture project | file-I/O | No static fixture project dirs exist; `test/helpers/*-fixture.ts` generate fixtures in temp dirs — consider generating it the same way |
| `test/task-tracer.integration.ts` (live-agent part) | live integration | request-response | `test/ecc-upstream.integration.ts` is only a structural analog (explicit invocation, scratch dir, env save/restore); no existing live agent run. Must report "not proven" when CLIs/auth absent |

## Metadata

**Analog search scope:** `src/core/`, `src/adapters/`, `src/cli.ts`, `schemas/`, `test/`
**Files scanned:** ~12
**Pattern extraction date:** 2026-09-30
