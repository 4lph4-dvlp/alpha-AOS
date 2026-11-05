# Phase 29 — Pattern Map

**Mapped:** 2026-11-02 at `9376d37` · controller-inline, explicitly authorized.
Existing analog paths were checked against tracked source; installed GSD paths are read-only evidence and never edit targets.

## File Classification

| New / modified file | Role / flow | Closest tracked analog |
|---|---|---|
| `src/core/task-gsd-readiness.ts` (new) | Native diagnostic / bounded process | `src/core/task-gsd.ts:123`, `src/adapters/harnesses.ts` |
| `src/core/task-gsd.ts` | Backward-compatible quick diagnostic | Existing `probeGsdQuickReadiness` |
| `schemas/task-bootstrap.schema.json` (new) | Closed bounded interchange | `schemas/task-intake.schema.json` |
| `src/core/task-bootstrap.ts` (new) | User route / request-response | `src/core/task-intake.ts:389`, `src/core/task-gsd-prompt.ts` |
| `src/core/task-bootstrap-store.ts` (new) | Transfer evidence / file I/O | `src/core/transaction.ts:218`, `src/core/writer-lock.ts:355`, `src/core/command-jobs.ts:621` |
| `src/core/task-bootstrap-recovery.ts` (new) | Native next-step projection | `src/core/task-gsd-discovery.ts`, `src/core/task-gsd-lifecycle.ts` |
| `src/cli.ts`, `src/format.ts` | CLI dispatch / public formatting | Existing `task intake` branch, `formatTaskIntakeDecision` |
| `skills/alpha-aos-task/SKILL.md`, `catalog/stack.lock.json` | Common instruction / rendered distribution | `src/core/owned-skills.ts:60`, `test/owned-skills.test.ts` |
| New `test/task-gsd-readiness.test.ts`, `test/task-bootstrap-cli.test.ts` | Native query and public CLI behavior | `test/task-doctor-gsd.test.ts`, `test/task-intake-cli.test.ts` |
| New `test/task-bootstrap-handoff.test.ts`, `test/task-bootstrap-recovery.test.ts`, `test/task-bootstrap-resume.test.ts` | Persistence / byte-preservation / races | `test/task-intake-continuity.test.ts`, `test/task-receipts.test.ts`, `test/transaction.test.ts` |
| New `test/task-bootstrap-routing.test.ts`, `test/task-bootstrap-acceptance.test.ts` | Rendered five-host and composed journey | `test/task-intake-routing.test.ts`, `test/task-intake-acceptance.test.ts` |
| New `scripts/verify-task-bootstrap-native.mjs`, `docs/task-bootstrap-proof.md` | Evidence verifier / proof ledger | `scripts/build-artifact.mjs`, `docs/task-runtime-controls.md` |

## Concrete Patterns to Preserve

`src/core/task-gsd.ts:134` passes native queries as argv arrays, with bounded output and a deadline:

```typescript
args: [gsdToolsPath, "query", "init.quick", "alpha-aos readiness probe"],
cwd: options.projectRoot,
environment: nodeRuntimeEnvironment({ source: process.env }),
timeoutMs: 30_000,
maxOutputBytes: ONE_MIB,
excerptBytes: ONE_MIB,
```

`src/core/transaction.ts:203` already accepts an owned writer session. Acquire/recheck/read/compare/write while that same session is held; a second independently acquired transaction cannot protect an earlier read:

```typescript
export interface FileTransactionOptions {
  stateRoot: string;
  allowedRoots: string[];
  operations: FileWriteOperation[];
  session?: MutationSession | undefined;
}
```

`src/core/task-intake.ts:169` keeps originalRequest, knownFacts, commandRoute/style and taskReference in a private handoff. `toPublicTaskIntakeDecision` intentionally removes it. New bootstrap public output must maintain this distinction; inspection must not return persisted request text just because a caller knows pendingId.

`test/task-intake-cli.test.ts:20` uses `createIsolatedSandbox`, snapshots home/state/project with `fingerprintManifest`, invokes the compiled CLI with cwd/env, and asserts observable decisions. Reuse this for missing runtime, absent/partial/ready and preview zero-write tests. Label a fake native runner as fixture, never a native host receipt.

`src/core/owned-skills.ts:60` renders source independently per harness; compute all five target hashes using that renderer and compare the lock. Do not copy a source hash into every target or apply to global installed skill directories during implementation tests.

## Shared Integration Rules

- Explicit controller harness selects its native config root. No hidden Codex fallback; Hermes remains unsupported as GSD controller.
- Canonical root and tree policy are resolved before runtime queries, private record lookup and mutations; recheck on resume.
- GSD init.resume/new-project reports are interpreted, not rewritten. Return error/unsupported when native evidence cannot be safely read.
- CLI inspection is read-only. Apply records transfer intent/receipt only; the owned skill invokes the native workflow under the existing GSD authority.
- New exports and CLI flags are listed in each PLAN's artifacts section. New paths are not assumed to exist before their owning task.
- Every runnable verify has a stated observable failure direction; build precedes compiled suites. Task-created suite paths are pending_creation, not missing prerequisites.
