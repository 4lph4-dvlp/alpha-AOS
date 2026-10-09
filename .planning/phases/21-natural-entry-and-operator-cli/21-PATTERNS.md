# Phase 21: Natural Entry and Operator CLI - Pattern Map

**Mapped:** 2026-10-10  
**Files analyzed:** 17  
**Analogs found:** 17 / 17

## File Classification

| New/modified file | Role | Data flow | Closest tracked analog | Match |
|---|---|---|---|---|
| `skills/alpha-aos-task/SKILL.md` | config | request-response | `skills/alpha-aos-control/SKILL.md` | exact |
| `catalog/stack.yaml` | config | transform | `catalog/stack.yaml:49-61` | exact |
| `catalog/stack.lock.json` | config | transform | `catalog/stack.lock.json:112-129` | exact |
| `src/core/task-read.ts` (recommended new module) | service | file-I/O | `src/core/task-run.ts:533-564` | flow-match |
| `src/core/task-control.ts` (recommended new module) | service | event-driven | `src/core/task-supervisor.ts:424-445` | flow-match |
| `src/core/task-journal.ts` | model | file-I/O | `src/core/task-journal.ts:41-80,193-225` | exact |
| `src/core/task-run.ts` | service | file-I/O | `src/core/task-run.ts:533-564,1292-1310` | exact |
| `src/core/task-supervisor.ts` | service | event-driven | `src/core/task-supervisor.ts:424-445` | exact |
| `src/adapters/task-agents.ts` | provider | streaming | `src/adapters/task-agents.ts:249-270,336-410` | exact |
| `src/core/task-doctor.ts` | service | request-response | `src/core/task-doctor.ts:23-83,125-166` | exact |
| `src/cli.ts` | controller | request-response | `src/cli.ts:1825-1850,1873-1977,2195-2233` | exact |
| `src/format.ts` | utility | transform | `src/format.ts:1099-1246,1356-1410` | exact |
| `test/task-cli.test.ts` | test | request-response | `test/task-cli.test.ts:66-152,551-608` | exact |
| `test/task-cli-capabilities.test.ts` | test | request-response | `test/task-cli-capabilities.test.ts:121-253` | exact |
| `test/task-cli-review.test.ts` | test | request-response | `test/task-cli-review.test.ts` | exact |
| `test/task-supervisor-recovery.test.ts` | test | event-driven | `test/task-supervisor-recovery.test.ts` | exact |
| `test/owned-skills.test.ts` | test | file-I/O | `test/owned-skills.test.ts:243-347,423-449` | exact |

All named analogs were checked with `git ls-files`; no runtime mirror is cited. Proposed module names are planner choices, not locked scope.

## Pattern Assignments

### Natural entry skill and catalog lock

**Analog:** `skills/alpha-aos-control/SKILL.md`; `catalog/stack.yaml:49-61`; `src/core/owned-skills.ts:52-67,77-107`.

Copy the repository-owned skill frontmatter and five-harness catalog entry shape. Its natural invocation must keep ordinary GSD as default, use the existing CLI for contract preview, and explain that exact digest approval and start are separate commands. The delivery code is already:

```ts
const skill = catalog.components.ownedSkills.find((candidate) => candidate.id === id);
if (!skill) throw new Error(`Unknown owned skill: ${id}`);
if (!skill.targets.includes(target)) throw new Error(`Owned skill ${id} does not support target: ${target}`);
const sourceHash = sha256(Buffer.from(sourceContent, "utf8"));
const rendered = renderOwnedSkill(sourceContent, target, skill.invocation, skill.argumentHint);
```

Source and per-target rendered hashes must be placed in `catalog/stack.lock.json`; use the same hash generation procedure as the existing control skill. `test/owned-skills.test.ts:423-449` checks target steps, installed paths, and idempotent current state. Add a native invocation fixture; installed file presence alone does not meet UX-01.

### Durable read model: `src/core/task-read.ts`, `src/core/task-run.ts`, `src/core/task-journal.ts`

**Analog:** `src/core/task-run.ts:533-564`, `src/core/task-journal.ts:41-80,193-225`.

```ts
export async function readTaskReport(options: {
  stateRoot: string; contractId: string; runId?: string;
}): Promise<TaskRunRecord | null> {
  const runs = await listTaskRuns({ stateRoot: options.stateRoot, contractId: options.contractId });
  if (options.runId !== undefined) return runs.find((run) => run.runId === options.runId) ?? null;
  return runs.at(-1) ?? null;
}
```

`listTaskRuns` sorts by `startedAt`, then `runId` (`task-run.ts:548-552`), which supplies deterministic latest-run selection. Preserve the selected ID and start time in the read model. Join the run record with the digest-keyed checkpoint and journal carefully: `runDirectory` uses `stateRoot/runs/<contractDigest>` (`task-journal.ts:71-80`), while run records are per attempt. Nullable usage (`tokens`, `costUsd`) means unmeasured, never zero. `writeCheckpoint` uses a 0600 temporary file, sync, then rename (`task-journal.ts:193-210`); preserve this persistence pattern for any new control record.

### Cross-process stop: `src/core/task-control.ts`, `src/core/task-supervisor.ts`, `src/adapters/task-agents.ts`

**Analog:** `src/core/task-supervisor.ts:424-445` and `src/core/controller-lease.ts:41-137`.

```ts
if (options.signal?.aborted) {
  checkpoint.status = "stopped";
  checkpoint.stopReason = "cancelled";
  await writeCheckpoint(options.stateRoot, checkpoint);
  await logEvent(options.stateRoot, digest, {
    kind: "process_cancelled", attemptIndex: checkpoint.attemptIndex,
    payload: { reason: "AbortSignal triggered" },
  });
}
```

The present CLI stop branch (`src/cli.ts:1943-1977`) writes `stopped` immediately and records `limit_exceeded`; it is the gap to replace, not the template to copy. Reuse controller lease fencing and the adapter's bounded process cancellation. Persist request and acknowledgment separately, and emit terminal `stopped` only after actual child exit is observed. Test a separate CLI process against an active child in `test/task-supervisor-recovery.test.ts` and `test/task-cli.test.ts`; ensure no false terminal status.

### Doctor, status, report, contract preview: `src/core/task-doctor.ts`, `src/cli.ts`, `src/format.ts`

**Analog:** `src/cli.ts:1825-1850,1873-1900,2195-2233`; `src/format.ts:1099-1246,1356-1410`.

```ts
const runId = optionValue(args, "--run");
const run = await readTaskReport({ stateRoot, contractId: operand,
  ...(runId === null ? {} : { runId }) });
print(run, json, formatTaskRunReport(run), context);
```

Keep CLI dispatch thin and pass one evidence-backed read model to both output forms. No-ID doctor currently uses `buildTaskDoctorReport(join(stateRoot, "receipts"))` and optional `diagnoseGsdLifecycleStatus` (`cli.ts:1830-1849`); retain this environment sweep and add an explicit ID branch for task diagnosis. `showPreview` emits contract, digest, authority and reapproval diff (`cli.ts:2195-2209`); keep full contract visible even when readiness is blocked. Exact digest approval remains `approveTaskContract` (`cli.ts:2231-2233`). `print` serializes JSON with `serializeObservable` and human text with `redactDocument` (`cli.ts:347-363`). The top-level catch currently emits only text (`cli.ts:2353-2359`); add structured JSON refusal there through the same redaction seam. Use `test/task-cli.test.ts`, `test/task-cli-capabilities.test.ts`, and `test/task-cli-review.test.ts` to compare human and JSON evidence, including failed criteria and nullable measurements.

### Tests and fixtures

**Analogs:** `test/task-cli.test.ts:66-152,551-608`; `test/owned-skills.test.ts:243-347,423-449`.

Use `node:test` and `node:assert/strict`, temporary state roots, compiled CLI subprocesses, and exact assertions on read-only preview, digest approval, run selection and idempotent installation. Extend fixtures with two runs under one contract, malformed or blocked JSON, active child stop, resume after verified termination, and native skill invocation across the five supported adapters. Fixture success is separate from Phase 22's live three-OS proof.

## Shared Patterns

- **Consent:** `src/core/task-contract.ts:718-742,835-912` computes preview and enforces current exact digest. Never derive approval from skill language.
- **Validation:** `src/core/task-contract.ts:252-257,476-483` validates IDs and contract loads before file access; `src/core/task-run.ts:533-564` uses that ID guard in read paths.
- **State ownership:** GSD diagnostics come from `src/core/task-doctor.ts:125-166`; alpha-AOS run attempts and effects stay in its journal, not GSD state.
- **Output secrecy:** `src/cli.ts:347-363,2353-2359` is the redacted output boundary. Preserve it for structured errors.
- **Transactions and lock:** `src/core/owned-skills.ts:77-126,228-280` validates source and target hashes and applies owned writes transactionally.

## No Analog Found

No file lacks a usable tracked analog. Cross-process cancellation transport and native natural-entry invocation are new behaviors: their neighboring code provides boundaries, but not a ready-made implementation. Planner must design and test these explicitly.

## Metadata

**Analog search scope:** `src/cli.ts`, `src/format.ts`, `src/core/task-*.ts`, `src/core/owned-skills.ts`, `src/core/controller-lease.ts`, `src/adapters/task-agents.ts`, `catalog/`, `skills/`, `test/`  
**Pattern extraction date:** 2026-10-10
