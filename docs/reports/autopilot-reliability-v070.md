# Autopilot reliability implementation evidence

Date: 2026-11-06. Scope: the 16 approved requirements in reference sections 35–38, implemented with native Codex development. GSD and alpha-AOS did not orchestrate this repository's development. Product-level GSD acceptance remains authoritative.

This records implementation and bounded validation. It does not declare a GSD milestone complete, publish a new package version, update installed global prompts or restart the historical latest-tools contract.

## Result

Capability selection follows task intent. Actual native MCP discovery, discovered input-schema validation and useful read-only invocation precede execution. Failures retain redacted actionable diagnostics; failed, empty and irrelevant results cannot produce successful production receipts. A discovered tool with no invoker cannot manufacture success.

The original session is registered independently of a progress panel. The foreground command returns the final recovery-chain result, with an exact-identity replay and atomic acknowledgement path after reconnect. Attempt rejection, final chain status, process closure and accepted work are separate fields.

An optional digest-bound `recoveryPolicy` authorizes bounded corrections. Question-only repairs use a read-only Codex controller and must restore actual capability preflight. Workspace repairs must change approved bytes and pass approved CLI measurements on a fresh snapshot before task re-execution. Model/effort, scope, criteria and resource limits cannot inherit changed authority. Delegated question revisions retain explicit root and parent approvals. Unknown process closure, quota, missing authority and unsupported native agents remain explicit boundaries.

Source skill and installable Codex guidance now retain the native completion handle through transport yields and continue authorized recovery. Notes retain evidence; a recoverable rejection alone does not justify ending in a handoff.

Usage and examples: [completion and bounded recovery](../how-to/autopilot-recovery.md).

## Requirement mapping

| Requirement | Implementation | Validation evidence |
|---|---|---|
| ACON-01 | `task-capability-obligations.ts`: explicit research/documentation intent and questions | `task-autopilot-capability`, capability-selection and D-07 CLI checks |
| ACON-02 | `task-capability-health.ts`, native capability adapter and start/readiness gates | Native-schema, preflight deduplication and no-run approval-preservation scenarios |
| ACON-03 | Bounded credential redaction and arguments/authentication/quota/transport/service/unknown diagnostics | Failure taxonomy, MCP isError and environment-secret tests |
| ACON-04 | Real invocation adapter, retained source evidence, useful/relevant output checks; synthetic fallback removed | Empty/error/irrelevant/no-invoker refusal; existing capability-receipt tests |
| ADEL-01 | `task-delivery.ts` origin registration before execution; per-attempt sessions | Panel-free exact origin binding tests and public follow probe |
| ADEL-02 | Awaited foreground return and final-chain status in public CLI | Actual Codex terminal probe; actual-origin public follow with controlled accepted/blocked events |
| ADEL-03 | Immutable hashed outcome, exact tuple replay, exclusive acknowledgement | Reconnect, mismatched identity, conflicting outcome and concurrent acknowledgement tests |
| ADEL-04 | Readiness exposes foreground mode and `automaticIdleWakeup: false`; unsupported host delivery refused | Host identity/support tests; boundary disclosed in guidance and public start |
| AREC-01 | `task-autorepair.ts` typed corrective path under approved native agents | Measured implementation correction and preflight question correction fixtures |
| AREC-02 | Relevant change plus independent verification before another execution | First correction fails measurement, second succeeds; no-change correction exhausts grant without task rerun |
| AREC-03 | Digest-bound grant and transactional `task-recovery-grant.ts` revisions | Parent/root ancestry and forbidden goal/root/model/criterion/resource expansion tests |
| AREC-04 | Chain-wide native usage aggregation, resource/stop gates and unchanged agent policy | Cross-digest cycle budget, durable token/unknown-meter checks; existing stop/quota controls |
| AREC-05 | Existing checkpoint/effects reconciliation retained across revisions; accepted chain refuses another execution | Existing supervisor recovery and new accepted-chain duplication refusal |
| ACONT-01 | Owned task skill, installed Codex policy source, README and packaged how-to | Owned-skill provenance and deterministic policy installation tests |
| ACONT-02 | Corrective loop continues after rejected attempts; genuine boundary reasons are durable | Measured repair and no-change bounded-failure scenarios; guidance inspection |
| ACONT-03 | Separate evidence for closure, acceptance, delivery, repair, replay and stop | Scenario inventory below; unrun cases explicitly listed |

All source paths above are under `src/core/` unless an adapter or CLI is named. Test names abbreviate matching `test/*.test.ts` files. Checkmarks in the reference requirements denote this implementation scope, including the explicit foreground host boundary.

## Scenario inventory

| Scenario | Observation | Evidence scope |
|---|---|---|
| Native Codex completion | Actual CLI exited 0, native terminal completed, session and reply observed, closure confirmed | Real read-only native process in allocated temporary Git repository; [retained record](evidence/v070-native-foreground.json) |
| Original Codex session receives outcome | Actual parent session identity matched; public `task follow` returned accepted and blocked events; first public acknowledgement succeeded | Actual CLI and native origin, controlled terminal events in isolated temporary state; [retained record](evidence/v070-origin-follow.json) |
| Correctable capability contract | Invalid query preflight failed; read-only correction proposed revision 2; no execution run existed during correction; fixture task then accepted | Controlled ports and GSD fixtures, real contract/approval/state persistence |
| Correctable implementation | Initial task failed, first code correction failed independent measurement, second passed, next task attempt accepted | Controlled controller/reviewer with real filesystem changes, fresh snapshots and actual CLI measurements |
| No effective correction | Two no-change claims exhausted the approved repair grant; task ran only once | Controlled ports, durable repair evidence and actual supervisor path |
| Missing native proof | Repair dispatch refused, task run count stayed zero, execution approval remained startable | Controlled unsupported-agent assessment |
| Reconnect/deduplication | Final outcome survives replay, wrong identity cannot acknowledge, one concurrent consumer receives first acknowledgement | Actual private-state operations and public follow/ack probe |
| Stop/interruption/needs-input | Distinct delivered status; observer timeout is not task completion; uncertain process closure blocks relaunch | Delivery tests plus existing runtime/supervisor controls |

The native probe does not establish product task acceptance. Controlled delivery events do not establish a live worker's acceptance. Fixture acceptance does not establish successful execution by a live external model. These are separate observations.

## Validation runs

Validation used the local Windows workstation and compiled TypeScript. Verbose console logs were kept outside this report in local `.tmp-v070-*.log` files.

- Broad selected regression: 208 tests, 200 passed, 7 failed, 1 skipped. This exposed a real digest-selection bug in durable token aggregation and compatibility regressions; it was not reported as passing.
- After corrections: 41 capability/origin/grant/repair/runtime/policy tests passed, zero failed.
- Focused CLI compatibility recheck: documentation supersession, legacy preview wording and runner entry-point checks passed. The public attach test passed in an isolated run.
- Public attach also reproduced a 5-second worker-start handshake timeout under other runs. A retained temporary reproduction observed a pending record with no worker acknowledgement; an isolated run passed. No timeout increase or unsupported root-cause claim was used to hide this host-sensitive limitation.
- Additional native adapter regression: 75 tests passed, zero failed across repair-chain, agent, cross-harness model, GSD stage observation, harness adapter and registered native-job files.
- Protected-state and owned-skill verification: 14 tests passed, zero failed. Failed corrective actions are audited before their claims can route another retry; changing lifecycle state or creating a commit stops repair.
- Final delivery/repair/grant recheck after retaining the current failure digest and deriving process closure from every observed dispatch: 14 tests passed, zero failed. This includes confirmed-versus-unknown process settlement, origin replay and actual measured correction fixtures.
- Final `npm run build` and `npm run build:check` passed; the artifact verifier matched 372 inputs and 732 outputs. CLI help exposes start/follow/acknowledge. `git diff --check` passed. The installable Codex policy is 1,804 characters, within its enforced 2,000-character limit.

These are separate runs with overlapping tests; their counts are not added into a fabricated unique-test total. The original 208-test run and the worker handshake failures remain disclosed above.

The source task skill pin is `941ea11baea335842cfc50cd64535ebdfba5bb8940a003a63423aa0d3fd24006`; all five automatic target pins match. Installation tests exercise the repository's generated policy/owned-skill paths. Global installed copies were not modified.

## Limits and unrun cases

- Supported origin delivery requires an active caller retaining or reconnecting its native tool/process handle. Idle or closed Codex app-session injection is unsupported. A panel is optional and does not establish this capability.
- A full live product task with live Exa/Firecrawl/Context7, native corrective model execution, independent native reviewers and final GSD acceptance was not run. The old failed contract was not restarted. Its discarded original Exa error still prevents an exact historical root-cause claim.
- Other harnesses retain existing product adapters and explicit origin registration. Automatic continuation parity beyond the verified Codex foreground path is not claimed. Question-only corrective dispatch for unverified harnesses fails closed.
- No full repository test suite, macOS/Linux runtime matrix, CI, publication, push, global skill synchronization or `npm link` deployment was performed. Existing prior-milestone gaps remain preserved.
