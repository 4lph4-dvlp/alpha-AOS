# Phase 26: Autopilot Session Progress and Steering - Pattern Map

**Mapped:** 2026-10-31. **Files classified:** 21 proposed new/modified files. **Analog coverage:** 20/21 (HTTP/SSE itself has no existing analog).
**Scope:** Approved common passive progress panel for all five hosts; initiating conversation retains Q&A/control. Ordinary conversational GSD repair; no installs, paid canaries or original-project restart. Proposed module names below are planner choices, not existing files.

## File Classification

| New/Modified File | Role | Data Flow | Closest tracked analog | Match |
|---|---|---|---|---|
| `src/core/task-session.ts` (new) | model/service | file-I/O | `src/core/task-wait.ts:28`, `src/core/task-job-binding.ts:14` | role-match |
| `src/core/task-progress.ts` (new) | service | event-driven/transform | `src/core/task-runtime.ts:167` | role-match |
| `src/core/task-progress-panel.ts` (new) | controller/component | streaming/request-response | None for HTTP/SSE; observer mechanics from `src/core/completion-wait.ts:95` | none |
| `src/core/task-steering.ts` (new) | service | file-I/O/event-driven | `src/core/task-control.ts:83` | role-match |
| `src/core/task-runtime.ts` | service | event-driven | Existing `meteredTaskDispatch` | exact |
| `src/core/task-run.ts` | service | request-response | Existing native-port wrappers at 1451–1461 | exact |
| `src/core/task-gsd-lifecycle.ts` | service | event-driven | Existing `runPhaseLifecycle` at 730 | exact |
| `src/core/task-native-job.ts` | service | event-driven | Existing `runApprovedTaskJobProcess` at 63 | exact |
| `src/core/task-supervisor.ts` | service | event-driven | Existing boundary stop check at 466–476 | exact |
| `src/core/task-read.ts` | service | transform | Existing exact selection at 93–105, projection at 404–442 | exact |
| `src/cli.ts` | controller | request-response | Existing task dispatch at 2158–2174 and task wait at 2293 onward | exact |
| `skills/alpha-aos-task/SKILL.md` | config | request-response | Existing session/model routing at 80–90 | exact |
| `catalog/stack.lock.json` | config | transform | Existing owned-skills alpha-aos-task source/target hashes at 130 onward | exact |
| `test/task-session.test.ts` (new) | test | file-I/O | `test/task-runtime-controls.test.ts` | role-match |
| `test/task-progress.test.ts` (new) | test | event-driven | `test/completion-wait.test.ts` | role-match |
| `test/task-progress-panel.test.ts` (new) | test | streaming/request-response | `test/completion-wait.test.ts` (observer half only) | role-match |
| `test/task-steering.test.ts` (new) | test | event-driven | `test/task-gsd-lifecycle.test.ts` | role-match |
| `test/task-runtime-controls.test.ts` | test | event-driven | Existing credential-free runtime controls | exact |
| `test/task-gsd-lifecycle.test.ts` | test | event-driven | Existing lifecycle runner fixtures | exact |
| `test/task-cli.test.ts` | test | request-response | Existing task CLI fixture | exact |
| `test/owned-skills.test.ts` | test | transform/file-I/O | Existing rendered skill integrity fixture | exact |

## Pattern Assignments

### Runtime observations and progress: `task-progress.ts`, runtime/run/lifecycle/native-job changes
**Primary analog:** `src/core/task-runtime.ts`. Keep `.js` local imports and Node built-ins, including type imports (1–10):
```typescript
import { assertNoSymlinksInPathAndAncestors, readBoundedFile, writeAtomicPrivateFile } from "./command-jobs.js";
import type { HarnessId } from "../types.js";
```
**Bounded persistence** (194–196; inside existing lock ownership):
```typescript
const persist = async () => {
  if (record === null) return;
  await writeAtomicPrivateFile(join(root, `${record.dispatchId}.json`), `${JSON.stringify(record)}\n`, 64 * 1024, options.stateRoot);
};
```
Use real `dispatchId`, `contractDigest`, `runId`, `role`, model and effort (22–43, 209–220); project actual process status/reason (241–266), including interrupted/failed exceptions (273–284). Existing dispatch records are mutable snapshots: do not mistake each fswatch notification for a new ordered event. Add a bounded durable projection record/sequence and source-event identity under a fenced writer; replay/dedupe requires identity beyond a timestamp. Preserve dispatch lock crash semantics (184–191, 285–296); do not add a second controller lock owner.
**Coverage entry points:** generic quick uses `task-run.ts:1451–1461`; full GSD uses `task-gsd-lifecycle.ts:577–596`; dedicated typed jobs use `task-native-job.ts:76–93`; final review already uses the same metering wrapper (`src/core/task-final-review.ts:449`—search anchor, not an additional analog). Observe all paths through that shared wrapper; lifecycle events additionally belong at actual GSD step boundaries (`runPhaseLifecycle:757–790`) and existing quick evidence/result boundaries. A dispatch completion is not GSD acceptance.

### Session identity and bounded Q&A: `task-session.ts`, `task-read.ts`, CLI
**Analog:** required identity from `src/core/task-wait.ts:32–39`:
```typescript
readonly contractId: string;
readonly runId: string;
readonly contractDigest: string;
readonly revision: number;
readonly scope?: TaskWaitScope | undefined;
readonly timeoutMs?: number | undefined;
readonly signal?: AbortSignal | undefined;
```
Extend with explicit originating host/session plus subscription identity; child native session IDs are different identities. Copy closed-key validation, exact digest/run syntax and byte bounds from `task-job-binding.ts:14–24`. `task-read.ts:93–105` is the exact-run branch; **do not inherit** omitted-run latest selection (150 onward), checkpoint run substitution (123–137), or all-runs usage at 409 for a run-scoped panel packet. Validate digest/revision/session after selecting a run. Q&A reads a bounded redacted projection with evidence references; no native transcript scans or model-generated status polling.

### Finite observation and panel: `task-progress-panel.ts`, progress tests
**Analog:** `src/core/completion-wait.ts:87–95` documents authoritative reread, parent-directory watch, register/recheck, serialized coalescing and disposal. Copy the settlement guard (158–163):
```typescript
const settle = (settlement: ObserverSettlement<T>): void => {
  if (settled) return;
  settled = true;
  dispose();
  resolvePromise(settlement);
};
```
The observer is a finite one-shot completion primitive, not an SSE broadcaster: reuse its mechanics without repeatedly settling/restarting it for every frame. Existing abort/deadline cleanup is at 129–155 and 235–254. `test/completion-wait.test.ts:56–66` injects a clock/check and asserts settlement; existing fixtures cover bursts, lost hints, timeout and abort. Extend those techniques with local HTTP requests and explicit teardown, never model sleeps. Panel disconnect cancels observation only; task stop stays an explicit conversation control.

### Steering: `task-steering.ts`, lifecycle/run/supervisor safe-boundary consumers
**Analog:** `src/core/task-control.ts` distinguishes durable request acceptance from observed effect: pending return (169–179), confirmed return (422–431). Preserve that distinction for receipt/assessment/deferred/rejected/applied and evidence. Reuse bounded private-file helpers, not its legacy permissive digest/run fallback (276–314) or direct plain-file writes. Repeated submit/consume must be idempotent, with fenced consumption and ordered acknowledgements.
Consume only under the existing GSD controller at safe boundaries before the next dispatch/step (`task-gsd-lifecycle.ts:757–767`, `task-supervisor.ts:466–476`, quick dispatch boundary `task-run.ts:1612`). Existing prompt evaluation returns needs-input (`task-gsd-lifecycle.ts:599–615`); report that outcome without auto-answering. Never rewrite an active plan or call a second controller. Authority/model/budget/scope changes produce a revision-required result and retain original exact approval.

### CLI, five-host capabilities and skill distribution
Copy `src/cli.ts:2158–2174`: closed flags → bounded structured JSON → validation → preview/apply split → explicit exact identifiers. Keep panel serving read-only; steering submission and task stopping remain separate explicit operations. Preserve detached defaults; opt-in attachment never chooses latest run.
Keep one passive panel transport for `claude`, `codex`, `antigravity`/agy, `pi`, `hermes`; capability metadata must distinguish native UI evidence, context injection, model wakeup and plugin requirements using the existing phase research. Existing native adapters are dispatch adapters, not proven originating-session notification APIs; do not patch all five merely to claim delivery.
Update tracked `skills/alpha-aos-task/SKILL.md` session instructions and tracked `catalog/stack.lock.json` owned-skill hashes together. `src/core/owned-skills.ts:53–68` already resolves all five targets and renders frontmatter; preserve its renderer and hash checks (99–104). No new installation mechanism or global sync is required for source completion.

## Shared Patterns

- **Validation/persistence:** `command-jobs.ts` exports `readBoundedFile` (618) and `writeAtomicPrivateFile` (1128); publication uses same-directory rename, descriptor/path rechecks and directory sync. Use these helpers rather than copying their internals. Reject unknown fields, oversized bytes, symlink/path substitution and identity drift before delivery/consumption.
- **Truth and errors:** GSD owns workflow/acceptance; runtime observes. Preserve unknown/unresolved and needs-input; recorded short reasons only. Do not manufacture percentages, milestone trees, test counts or next decisions.
- **Testing:** use paid-call-free temporary state and injected runner/clock/watcher patterns; assert isolation across two runs, replay/restart, duplicate event and steering suppression, approval drift, payload redaction, HTTP origin/auth rejection, slow-client bounds and cancellation. Source protocol fixtures do not establish live five-host native UI verification.

## No Analog Found

`src/core/task-progress-panel.ts`: no existing application HTTP server/SSE renderer found in `src`/`test`. Implement a small loopback-only transport without framework scaffolding: authenticated exact subscription, validated Host/Origin, bounded replay/cursors and client queues, finite lifetime, abort/disconnect disposal, no control/write HTTP endpoints. Token handling must avoid logs and evidence packets. The approved shared panel does not establish universal native transcript delivery.

## Planning Ownership and Metadata

Prefer **three sequential slices**: (1) exact session contract, durable projection and runtime entry-point coverage; (2) steering inbox/acknowledgements and existing GSD safe-boundary consumers; (3) finite read-only panel, CLI/skill/hash distribution and paid-call-free integration. Shared `task-run.ts`, lifecycle, CLI and skill files should have one active writer per slice. Keep final independent review and final regression gates; no lifecycle-machine replacement.
Primary analogs: runtime, finite completion observer, exact task reader, GSD lifecycle, durable command-job store. Integration anchors were inspected only as needed. Search scope: tracked `src/core`, `src/adapters`, `src/cli.ts`, `test`, `skills`, `catalog`; all existing paths named as analogs were verified with `git ls-files`. No install/runtime mirror paths are assignments. Read-only source analysis; no builds/tests or source edits performed.
