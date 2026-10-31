---
phase: "26"
slug: "autopilot-session-progress-and-steering"
status: planned
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-31"
---

# Phase 26 — Validation Strategy

## Test infrastructure and sampling

Reuse Node's test runner and existing TypeScript build. No new test framework or
paid native inference is needed. Each executor runs its affected targeted fixtures
after building; root owns actual independent Sol high review, Terra high accepted
fixes, then `npm run check` and ONE final `npm test` after fixes settle. Executors
must not repeat that full-suite/review lane. Preserve exit codes and external logs.

Target command after build: `node scripts/run-tests.mjs --files <affected compiled test paths>`.
Final command: `npm test`. The previous full suite took roughly 23 minutes; this
is an estimate, not a completion timeout or a reason to poll through a model.

## Requirement verification map

Every named test below must execute behavior, not only match source text. All
statuses are pending; planning has not run implementation tests or proven UI.

| Requirement | Tasks | Test file / concrete test names | Status |
|---|---|---|---|
| SESSION-01 | 26-01-01/02; 26-03-01 | `test/task-progress-panel.test.ts`: `phase26 panel follows a real metered dispatch`; `test/task-progress.test.ts`: `phase26 progress covers quick full and dedicated`, `phase26 progress preserves model outcome and recorded reasons`; `test/task-gsd-lifecycle.test.ts` actual needs-input/failure result fixtures | pending |
| SESSION-02 | 26-01-01/03; 26-03-01 | `test/task-session.test.ts`: `phase26 session rejects cross binding and conflicting replay`; `test/task-cli.test.ts`: `phase26 attach refreshes only the exact observer`; `test/task-progress-integration.test.ts`: `phase26 reload reconnect and stale owner` | pending |
| SESSION-03 | 26-01-03; 26-03-01/02 | `test/task-progress-integration.test.ts`: `phase26 five host integration`; `test/owned-skills.test.ts` and `test/task-skill.test.ts`: `phase26 owned skill parity`; all five IDs use actual public opt-in start, early panel URL and exact conversation entry | pending |
| SESSION-04 | 26-02-01/02/03; 26-03-01 | `test/task-steering.test.ts`: `phase26 steering tracer uses the existing controller`, `phase26 receipt is not application`, `phase26 safe boundaries preserve active plan and single writer`, `phase26 authority changes require revision approval`, `phase26 steering survives crash and no boundary`; `test/task-cli.test.ts`: `phase26 context and steer require exact origin`, `phase26 Q and A does not wake a worker` | pending |
| SESSION-05 | 26-01-01/03; 26-02-01/03; 26-03-01 | `test/task-progress-panel.test.ts`: `phase26 panel rejects hostile HTTP and bounds clients`; `test/task-cli.test.ts`: `phase26 start publishes panel before dispatch completion`, `phase26 panel launch uses argv and finite jobs`; `test/task-steering.test.ts`: `phase26 question packet is bounded and isolated`; `test/task-progress-integration.test.ts`: `phase26 UI states remain truthful and inert` | pending |
| SESSION-06 | every task; root final gates | `test/task-progress-integration.test.ts`: zero provider request assertions and real CLI/HTTP fixtures; targeted related regressions below; root actual independent review, settled fixes, one `npm test`, visual evidence and actual GSD goal verification | pending |

## Commands and gate ownership

Run from the owned root `D:/dev/alpha-AOS`; `package.json` and
`scripts/run-tests.mjs --files` were verified during planning. Existing commands
are retained: `npm run build`, `npm run check`, `node scripts/run-tests.mjs --files
<compiled paths>`, final `npm test`. Build before targeted commands. New fixture
tests use `phase26` names so `--test-name-pattern="phase26"` before `--files`
keeps each task's checks focused. No negative text/count gates are used.

| Wave | Owner | Targeted compiled fixtures after build | Status |
|---|---|---|---|
| 1 | 26-01 executor | `task-session`, `task-progress`, `task-progress-panel`, phase26 cases in `task-gsd-lifecycle`/`task-cli`; related `task-runtime-controls`, `task-native-job`, `completion-wait`, `task-wait` | pending |
| 2 | 26-02 executor | `task-steering`, phase26 packet/CLI/session/lifecycle cases; related `task-gsd-lifecycle`, `task-supervisor-recovery`, `task-controller-lease`, `task-cli` | focused checks passed; independent review pending; TDD deviation below |
| 3 | 26-03 executor | `task-progress-integration`, `task-progress-panel`, `owned-skills`, `task-skill`, `catalog` | pending |
| Final | root | Actual independent Sol high review -> Terra high fixes plus affected targeted checks -> `npm run check` -> ONE `npm test` -> actual local browser evidence or unverified gap -> GSD goal verifier | pending |

**26-02 TDD process deviation:** The applied-action tracer's assertion failure was
captured from the real test and classified `RED_EVIDENCE_OK`, but was not committed
separately before implementation because it shared existing WIP. Tasks 02 and 03
received focused behavior fixtures after implementation, without preceding valid
RED evidence. Functional fixture results do not establish TDD process compliance;
the final independent review must assess these slices. No historical RED is inferred.

Related fixture basenames above resolve to `dist/test/<basename>.test.js`. Keep
original verification semantics. Log the native durable handle, full log location,
exit code and actual outcome; a yielded transport is not completion. Root performs
one finite runtime observation instead of model sleep/status loops. Repeat a final
full suite only after a new change/failure makes prior evidence stale, and record why.

## Threat and UI mapping

| Threat ref | Canonical threat | Required fixture evidence | Status |
|---|---|---|---|
| T-26-01, T-26-04 | TM-05/TM-07 | Session binding, swapped run/revision/origin/cursor, duplicate/conflicting replay, initial snapshot race and explicit evicted-cursor reset | pending |
| T-26-02, T-26-13 | TM-01/TM-02/TM-13 | Exact Host/Origin/auth, bootstrap one-use/TTL, sessionStorage reload under same origin+port/binding/TTL, cross-origin refusal, secret/log/clipboard redaction | pending |
| T-26-03, T-26-14 | TM-03/TM-04/TM-06 | No browser control/exec/files, fixed assets, traversal/symlink refusal, inert HTML/script/ANSI/bidi/control text, CSP | pending |
| T-26-05, T-26-17 | TM-08/TM-12 | Slow reader/client flood, bounded queues/drain/retries, finite stream/session/observer, abort/expiry/error cleanup <=2 seconds without killing task | pending |
| T-26-06, T-26-15 | TM-09/TM-10 | Heartbeats never advance work; dead parent/unconfirmed child remain unresolved; actual/configured model separated; five native capability/ack states truthful | pending |
| T-26-07..12, T-26-16 | TM-11 plus steering trust boundary | Idempotent proposals, owned normal boundary, no duplicate controller, action evidence for applied, authority drift/revision-required, bounded Q&A and no safe boundary | pending |
| T-26-18 | Completion evidence | Actual independent review/fix receipts and final suite; browser evidence distinguished from protocol/source; GSD verifier closes only proven requirements | pending |
| T-26-SC | Supply chain | No package install/new dependency; source skill generated hashes checked for all five render targets | pending |

UI-SPEC coverage belongs to 26-01-01 and 26-03-01: Korean semantic layout/copy,
all observation states, unknowns, configured/observed values, focus-safe <=200 rows,
nonsecret copy fallback, 320px/200% reflow, credential reload/expiry, finite retry,
transport/activity/process separation and exact native capability facts. Browser
acceptance below supplies actual visual evidence; DOM/source fixtures alone do not.

## Wave 0

26-01-01 starts red and creates `test/task-session.test.ts` and
`test/task-progress-panel.test.ts` using existing Node fixtures. 26-01-02 creates
`test/task-progress.test.ts`; 26-02-01 creates `test/task-steering.test.ts`;
26-03-01 creates `test/task-progress-integration.test.ts`. Each is delivered with
its slice's production behavior, not a disconnected scaffold. No new framework,
dependencies, paid provider invocation or native UI acceptance is required/claimed.

## UI acceptance

Root verifies the actual local panel with credential-free fixture data against
26-UI-SPEC.md: running, failed verification/reason, needs-input, disconnection/replay,
terminal/unresolved close, hostile long text, copy/keyboard/focus and normal F5
restoration before TTL. Capture 1280x800, 390x844, 320px and 200% zoom evidence.
Use an authorized verified GUI runtime or leave pending for the final human check;
do not claim protocol/source checks as visual acceptance. Native host transcript
delivery remains unverified/disabled unless independently proven and authorized.
Do not message an existing host session or run the original project for UI testing.

## Validation sign-off

- [x] Planner assigns every task a grounded automated verification command.
- [ ] All six requirements have concrete evidence and no unresolved blocking threats.
- [ ] Panel UI reviewed against UI-SPEC and relevant security fixtures.
- [ ] Final full regression and actual independent review passed.
- [ ] GSD verifier records final evidence before phase closure.
