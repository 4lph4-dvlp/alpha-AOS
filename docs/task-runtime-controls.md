# Runtime usage and recovery controls

This repair follows the Oh-My-Circuit audit of 2026-10-30. That incident used
approved dedicated jobs and a project PowerShell controller, not generic
`task start`. The generic supervisor's missing token accumulation is a separately
reproduced defect. It is not asserted to have caused that execution.

## Reused boundaries

`task-telemetry` supplies normalization and capability declarations;
`evaluateResourceLimits` supplies the limit evaluator; existing checkpoints retain
the observed aggregate. Command jobs still own detached process lifetime,
deadline, cancellation, finite wait and terminal records. The registered native
bridge adds approved task identity to their existing private launch spec and
spec digest. The worker checks it again immediately before native dispatch.

Runtime dispatch receipts live under `runs/<contract-digest>/dispatches`. They
record process identity, native session handle, role/model/effort, timestamps and
numeric usage. They do not own GSD phase completion or acceptance. Missing phase
evidence, incomplete summaries, Nyquist gaps and absent final review continue to
block acceptance. A successful command is not a phase acceptance receipt.

## Units and guarantees

- `cycles` counts logical supervisor attempts. Registered standalone native jobs
  each count one logical dispatch cycle. It is not a provider call counter.
- Runtime receipts and native handles identify launches separately from observed
  model calls. Codex cumulative `token_count` increases are observed usage-bearing
  calls; turn-only summaries do not establish that count and leave it null.
- Codex input includes cached input; output includes reasoning. Neither cached
  nor reasoning tokens is added again. Native cumulative session watermarks and
  response samples are separate meter types; overlapping sources are refused.
- Local native session families are correlated by exact thread and parent IDs,
  with matching project roots. Unrelated sessions are not charged to a run based
  on cwd alone. Replay/resume uses stable observation identity and monotonic
  watermarks. Descendants already included in an aggregate meter are excluded.
- Codex `costUsd` remains null. Standard credit conversions in the incident audit
  are comparison estimates, not measured billing, purchased credits or USD cost.
  No rate table or project digest from that incident is copied into the runtime.
- Requested but unavailable meters block dispatch. Known values from failed
  runs remain visible. Missing usage is not converted to zero. A missing native
  family or an unresolvable process requires inspection rather than a new launch.

Limits are checked before each runtime-controlled native dispatch, including
review. Streaming numeric events are persisted independently of retained narrative
output. Local cumulative logs recover usage when the final CLI usage event is
absent. Some providers expose usage only after completion; native internal calls
can therefore overshoot a budget before the runtime observes them. This is not a
provider-side hard cap, reservation guarantee, or promise of zero overshoot.
No additional paid runtime dispatch is permitted once the observed approved
limit is reached. USD limits are unsupported for Codex and are refused before
launch rather than treated as zero dollars.

## Registered dedicated route

Ordinary `job start` remains a command utility. It does not imply task approval,
model, accounting or GSD acceptance enforcement for arbitrary shell wrappers.
Legacy project runners must migrate their leaf model launches to the registered
route; wrapping an arbitrary PowerShell controller does not confer these controls.

The `codex-json-v1` route uses typed argv and the approved role model and effort.
A structured spec avoids reliance on PowerShell preserving a `--` delimiter:

```json
{
  "route": "codex-json-v1",
  "contractPath": "/absolute/path/task.contract.json",
  "contractDigest": "<exact approved 64-character digest>",
  "runId": "<reserved run from approval>",
  "role": "executor",
  "prompt": "Current SHA, bounded diff, required invariants, failed regression, remaining slice and deadline."
}
```

`alpha-aos task dispatch <spec.json>` previews without launch. Only a separately
authorized `--apply` starts it, after the task contract has been explicitly
approved. `controllerModel`/`executorModel`/`reviewerModel` and corresponding
`...Effort` fields belong to that approved digest. Adding effort to an old contract
changes its digest and requires a new reviewed revision. No model is substituted.

Returned `job-<16 hex>` IDs use existing `job status`, `job wait` and `job cancel`.
There is no LLM in their timers, PID observation, arithmetic or record saving.
`task status --run <exact run>` exposes runtime observations and aggregate usage.
Its human output distinguishes selected-run launches from contract-wide observed
model calls and sessions. A failed native process is reported as failed/stopped;
an unconfirmed process closure remains interrupted and fenced against relaunch.
The available notification mechanism is durable CLI status, not an invented chat
callback. Retain the exact handle across host transport yields.

Cancellation observation can time out before Windows tree termination finishes.
That timeout is not cancellation confirmation: retain the same job ID and use a
separate finite `job wait` to observe its actual terminal record. A confirmed
`cancelled` job remains a non-successful command (`job wait` exits 1); it is not
successful task acceptance. Child closure must come from the owned native handle,
not an assumption that a numeric PID cannot have been recycled.

A resume spec may name `resumeSessionId` only for a settled session already bound
to the same approved role/run. Independent reviewers always use fresh sessions.
Live/unconfirmed descendants prevent duplicate dispatch. Process existence is
reported conservatively; a PID alone is never authority to kill another process.
Reconciliation never upgrades missing or explicitly unconfirmed closure merely
because a PID is absent. An interrupted launch without a positive owned-process
close observation stays fenced and needs inspection; retrying resume cannot
manufacture that evidence. A recorded close callback can permit recovery even
after the owner exits, without treating a recycled numeric PID as the old child.

## Review and recovery

Review reuse is bound to contract digest, exact SHA, artifact bytes, requirements,
project constraints/config and dependency files. Changed evidence invalidates
reuse. Reused receipts refer to the original independent invocation; they do not
claim another reviewer was called. Final independent review remains mandatory.

Multi-phase recovery preserves existing GSD decisions, complete summaries,
partial commits and in-scope dirty WIP. It does not manufacture a passing summary,
commit failure away or reset user work. Only an already recorded, consistent
checkpoint can enable generic dirty-baseline recovery. The runtime re-observes
phase verification and required Nyquist evidence before advancing and supplies
the actual final SHA/artifact digest to the final review gate.

Native lifecycle launches carry the approved role/model/effort and a bounded
current-state packet instead of a saved conversation. Approved local commits
reuse the existing exact Git-directory authority and temporary trust environment.
Final review uses an isolated source snapshot and temporary output/schema files;
acceptance requires exactly one verified report row per mandatory requirement.

## Delivery boundary

Credential-free fixture results are recorded in Phase 25. No paid native canary,
global installation change, release, or Oh-My-Circuit restart is part of this
repair. Source validation and installation remain separate actions. The legacy R6
runner and stale project-specific control JSON are read-only incident evidence;
they are not silently promoted into a supported runtime route.

## Optional shared progress panel

The tracked alpha-aos-task source provides the same opt-in panel instructions for Claude, Codex, Antigravity, Pi and Hermes. Source and rendered hashes prove repository packaging, not installation or native delivery. All five native UI and chat delivery routes remain unverified and disabled; a logical origin is not a verified vendor session ID.

After the approved separate start, the initiating conversation may invoke:

```text
alpha-aos task start <contract.json> --contract-digest <digest> --apply --progress panel --origin-host <host> --origin-session <logical-id> --json
alpha-aos task attach <contract-id> --run <run-id> --contract-digest <digest> --revision <n> --origin-host <host> --origin-session <logical-id> --json
alpha-aos task context <contract-id> --run <run-id> --contract-digest <digest> --revision <n> --origin-host <host> --origin-session <logical-id> --limit 50 --json
alpha-aos task steer <proposal.json> --json
alpha-aos task steer <proposal.json> --apply --json
alpha-aos task steering <contract-id> --run <run-id> --contract-digest <digest> --revision <n> --origin-host <host> --origin-session <logical-id> --json
```

The panel URL is a short-lived secret and should be handed to the initiating user before awaiting work. Its bearer is kept in sessionStorage for the exact origin, binding and finite observation deadline; a fresh exact attach renews observation without launching the task again. Viewer closure does not stop the task. The panel permits local observation and copying, not browser-side steering. A proposal receipt does not prove application; safe-boundary assessment and any new authority approval remain required. Transport disconnection is not a task outcome. Preserve the exact process/job handle and use one finite wait or a bounded handoff; no repeated model polling is needed.

## Project behavior policy and concurrent exclusion controls

### Architecture and single authority

The project behavior policy (`mode`: `strict` | `flexible`) is maintained in a single declarative file:
`<canonical-project-root>/.alpha-aos/behavior.json`
Schema definition: `{"schemaVersion": 1, "mode": "strict"|"flexible"}`.

Key invariants:
- **No Cascade**: Subdirectories or nested projects do not inherit parent policy. Worktrees maintain independent project policy files.
- **Marker-Free Directories**: Uninitialized directories or standalone paths default to `strict` with missing revision; queries perform zero filesystem writes.
- **Preference Only**: `flexible` mode is an intake preference and never constitutes task execution consent, autopilot start authorization, a style default, or GSD spine replacement.
- **Freshness at Next Intake**: Agents reread live canonical root and policy bytes on each task intake rather than relying on session memory. Changes made by another harness are visible on the next intake without restarting an active task.

### Target coordinator lock and concurrency

To prevent lost updates across independent processes, separate state roots (`ALPHA_AOS_STATE_DIR`), and path aliases:
- Physical lock location: `<canonical-project-root>/.alpha-aos-behavior.lock`.
- Created exclusively with `wx` flag before state session acquisition.
- Records `rootIdentity` (`deviceExact`, `inodeExact`), random owner token, PID, host, and operation metadata.
- Two-phase lock order: Target coordinator lock is acquired first, followed by the state mutation session.
- Inside-lock verification: Inputs, root identity, path boundaries, and exact file bytes are freshly re-verified and compared against the reviewed plan digest inside the held lock. Stale preview digests are refused (`stale-plan`).
- Reverse release: State session is released first, followed by target coordinator lock release with token matching.

### Conservative rollback and operator recovery

- **First-Create Rollback**: Unlinks only `.alpha-aos/behavior.json` and preserves `.alpha-aos` and all sibling configuration files.
- **Replacement Rollback**: Durably restores exact prior bytes, including CRLF and Unicode characters.
- **Drift Guard**: If the file was modified after the transaction, rollback refuses to overwrite drift and outputs content-safe diagnostics (`unifiedDiff: null`) without disclosing secret tokens or file contents.
- **Retained Coordinator Locks**: In the event of a crash, state-only repair (`alpha-aos repair`) does not remove target coordinator locks. A retained target lock must be inspected or cleared explicitly; locks are never automatically cleared based on elapsed time or a missing PID.

## Task intake and execution style controls (ENTRY-01–ENTRY-07, D-01–D-20)

### Shared CLI intake contract

Task intake inspection operates through the single, read-only CLI command:
```bash
alpha-aos task intake --input <request.json> [--json]
```
- **Read-Only Invariant**: The intake command classifies requests, verifies canonical root and behavior policy, evaluates mechanical evidence, and returns decision outcomes. It performs zero file writes, modifies no git histories, launches no worker processes, and creates no task run or journal records (`executionAuthorized: false`).
- **Input Budget**: Maximum 16 KiB UTF-8 input document before parsing. Validated against `schemas/task-intake.schema.json` with duplicate-key rejection and strict schema enforcement.
- **Decision Precedence**:
  1. Root validation & behavior policy freshness read.
  2. Scope change inspection (`scopeChange`): stops before expanded work and preserves dirty WIP (`wipBytesPreserved: true`). Active task repairs retain verified task style.
  3. Explicit direct GSD commands (`explicit-command`): preserves command, workflow, phase, arguments, and native checkpoints without an unrelated chooser.
  4. Explicit style requests (`explicit-style`): normalizes full requested canonical style. Partial autopilot retains autopilot mode and asks only depth options (`오토파일럿-quick`, `오토파일럿-quick-full`, `오토파일럿-phase`). Conflicting intents request narrow clarification.
  5. Active task continuity (`continuation`): verified active contract/GSD task follow-ups, test repairs, and status queries retain style and exact contract binding.
  6. Proven simple operations (`simple-operation`): bounded push to explicit remote/branch, local rename with unchanged API meaning, and faithful README translation/link skip chooser and forced GSD bootstrap. Exemption does NOT grant push or mutation authority.
  7. Clarification needed (`clarification-needed`): missing target/result/impact yields one discriminating question.
  8. Substantial work (`substantial-work`): strict mode presents all six canonical options; flexible mode returns adaptive intake.

### Six canonical execution styles

In strict mode, new substantial tasks display all six approved labels and short descriptions in canonical order:

| Number | Canonical Identifier | Korean Label | Short Description |
|---|---|---|---|
| 1 | `conversational-quick` | 대화형-quick | 현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리 |
| 2 | `conversational-quick-full` | 대화형-quick-full | 작은 작업에 토론·조사·계획 검사·구현·검증 적용 |
| 3 | `conversational-phase` | 대화형-phase | 로드맵과 Phase를 따라 필요한 사항을 질문하며 진행 |
| 4 | `autopilot-quick` | 오토파일럿-quick | 승인된 계약과 별도 실행기로 작은 작업 처리 |
| 5 | `autopilot-quick-full` | 오토파일럿-quick-full | 승인된 범위에서 작은 작업의 전체 품질 절차 수행 |
| 6 | `autopilot-phase` | 오토파일럿-phase | 승인된 로드맵 범위의 Phase들을 자율 진행 |

### Capability rendering and answer resolution

- **Native UI Capability**: Used only when the host environment is verified to support all six options.
- **Numbered Text Fallback**: When host capability has a 2–3 option limit or is unknown/unverified, intake falls back to presenting all six options together as a numbered 1–6 list. No choices are hidden or dropped into submenus.
- **Answer Correlation**: In-memory `pendingTaskId` correlates user responses to the pending choice. Mismatched correlation IDs reject the answer (`pending-mismatch`), preventing cross-task answer consumption.
- **Status & Cancellation**: Status inquiries ("status", "진행 상황") preserve the pending choice without advancing state. Cancellation ("cancel", "취소") discards the choice without selecting an inferred default.

### Scope lifetime and authority boundaries

- **Task-Scoped Transport**: Project behavior mode (`strict` / `flexible`) is a persistent project preference; selected execution style is purely a task-scoped transport value forwarded to downstream workflows. Style is never stored in `behavior.json`.
- **Zero Inline Autopilot**: Selecting an autopilot style does NOT grant execution consent, approve a contract, or launch a runner. Conversational agents are strictly forbidden from inline code generation for autopilot tasks. Autopilot execution requires exact preview, exact-digest approval, and a separate start command via isolated background runners.
- **Independent Task Isolation**: An independent new task following a completed release task (even one that ran under `autopilot-phase`) receives a fresh chooser, where it may select any style (e.g. `autopilot-quick-full`). Stale styles do not leak across completed task boundaries.
- **Evidence-Based Exemptions**: Bounded operations (push, rename, README translation/link) skip chooser and forced GSD bootstrap only when observed mechanical evidence is complete (<=16 files, <=64 KiB text inspected). Same-name complex twins (force push, public API changes, README redesign) are never exempt.
- **Phase 29/30 Deferred Boundaries**: Phase 28 delivers intake inspection, style cataloging, decision dispatch, and bounded handoffs. Execution pipeline bootstrap (Phase 29) and execution pipeline synthesis (Phase 30) are handled downstream.


