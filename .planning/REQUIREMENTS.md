# Requirements: alpha-AOS v0.7.0

**Milestone:** Autopilot Reliability & Recovery
**Defined:** 2026-11-05
**Status:** APPROVED — all 16 requirements confirmed by the owner on 2026-11-05; roadmap assignments await separate approval.
**Core value:** Consistent, intentional agent workflows and capability boundaries across supported projects, operating systems and harnesses.

## Scope Decisions

- Address the three reported failures: unusable capability contracts, missing Codex completion/repair continuity, and premature handoff.
- Develop this repository with native agent tools and standalone GSD, without alpha-AOS governing its own development.
- Preserve previous Phase 27-34 status and evidence; new phases start at 35. Archival is not completion.
- Prioritize the actual originating Codex session, not only completion of a headless child. Compare Antigravity behavior without claiming unverified host parity.
- Existing exact-digest, scope, root, secret, model and resource boundaries remain until an explicitly reviewed repair-authorization design changes their handling.
- Follow the 2026-11-05 workstation delivery policy. This document does not start live tasks, tests, fixtures, CI, publication or global configuration changes.

## v0.7.0 Requirements

### Executable Contracts and Capability Evidence

- [ ] **ACON-01**: The user receives capability obligations justified by the actual task and workflow step; mentioning Exa or another tool as an object being updated does not by itself require invoking that tool.
- [ ] **ACON-02**: Before a contract is presented as runnable or started, the user receives readiness for the actual native adapter, transport, required tool/schema and service prerequisites; a refused start does not consume execution approval.
- [ ] **ACON-03**: When a capability fails, the user and recovery controller receive bounded, secret-safe diagnostics distinguishing invalid arguments, unavailable tools/runtime, authentication, quota and service/transport failures, retaining an unknown classification when evidence is insufficient.
- [ ] **ACON-04**: The user can inspect capability evidence tied to actual task-relevant successful calls and sources; empty, irrelevant, failed or synthetic results cannot satisfy a production obligation.

### Origin-Session Completion Delivery

- [ ] **ADEL-01**: The originating session is durably bound to the exact contract, digest, revision, recovery chain and attempt before execution, whether or not a progress panel is opened.
- [ ] **ADEL-02**: The originating Codex session automatically receives and continues from task acceptance, final failure, interruption or a genuine needs-input state without the user requesting a status check; intermediate attempt rejection remains distinguishable from the final recovery outcome.
- [ ] **ADEL-03**: After a connection loss or event redelivery, the originating session receives the retained outcome through replay and acknowledgement without duplicate continuation or duplicate work.
- [ ] **ADEL-04**: Before autopilot starts, the user receives the verified continuation capability of the selected host/surface and the path that will deliver the outcome; an unsupported path cannot silently become status-file or panel-only operation advertised as full autopilot.

### Effective Authorized Recovery

- [ ] **AREC-01**: Recoverable failures automatically route to a corrective action appropriate to the contract, capability environment, implementation or transport layer rather than only stronger prompts to the same failed step.
- [ ] **AREC-02**: Before retrying the same failure, the recovery controller records a relevant corrective change and its verification; repeated unchanged attempts cannot stand in for repair.
- [ ] **AREC-03**: The user can approve a bounded recovery grant that explicitly defines permitted contract revisions and reruns, records old/new digest ancestry, and requests new approval only when a change exceeds that grant; arbitrary changed digests never inherit approval implicitly.
- [ ] **AREC-04**: All attempts share the approved cumulative resource limits, model assignments and authority boundaries; a genuine quota/resource limit, user stop or required authority expansion ends automatic retry with a specific explanation.
- [ ] **AREC-05**: Recovery resumes from verified checkpoints and reconciled effects without rerunning completed phases or executing an already accepted task again.

### Persistent Execution and Honest Reporting

- [ ] **ACONT-01**: Repository-owned skills, generated harness guidance and packaged documentation direct agents to continue available authorized recovery after a yielded transport or recoverable rejection, rather than ending after a single wait by default.
- [ ] **ACONT-02**: Handoff notes preserve useful evidence while recovery continues; they become the stopping result only for a demonstrated external/user/authority/resource boundary, with the missing action clearly identified.
- [ ] **ACONT-03**: The user can review scenario evidence for success, recoverable tool failure, contract revision, final failure, reconnect and explicit stop, separating process closure, GSD acceptance, origin-session delivery and repair progress; unrun checks remain explicitly unverified.

## Future and Preserved Work

- Unfinished v0.6.0 and earlier work remains in [rollover records](milestones/v0.6.0-ROLLOVER.md), not silently absorbed or marked complete by this milestone.
- Additional host surfaces beyond the verified supported path can be added later with explicit capability and delivery evidence.
- The historical latest-tools task/clone is an investigation source. Restarting or integrating it is not an effect of this milestone initialization.

## Out of Scope

| Feature | Reason |
|---|---|
| Replacing GSD or creating a second project lifecycle owner | Existing single-writer/state ownership remains authoritative. |
| Unlimited retry or quota bypass | Autonomous recovery must stay within the approved budget and actual service availability. |
| Automatic broad credential/configuration changes or scope/model expansion | These are not routine same-grant corrective actions. |
| Mock success receipts or dropping genuine capability requirements | These conceal failure rather than deliver working autopilot. |
| Automatic tests/CI/push/publication/global deployment | The workstation policy and separately authorized action scope govern delivery. |

## Traceability

Assignments will be filled by the roadmap step after requirements confirmation. Proposed research sequence is Phase 35-38; no phase assignments are approved yet.

| Requirement | Phase | Status |
|---|---|---|
| ACON-01 | Unassigned | Draft |
| ACON-02 | Unassigned | Draft |
| ACON-03 | Unassigned | Draft |
| ACON-04 | Unassigned | Draft |
| ADEL-01 | Unassigned | Draft |
| ADEL-02 | Unassigned | Draft |
| ADEL-03 | Unassigned | Draft |
| ADEL-04 | Unassigned | Draft |
| AREC-01 | Unassigned | Draft |
| AREC-02 | Unassigned | Draft |
| AREC-03 | Unassigned | Draft |
| AREC-04 | Unassigned | Draft |
| AREC-05 | Unassigned | Draft |
| ACONT-01 | Unassigned | Draft |
| ACONT-02 | Unassigned | Draft |
| ACONT-03 | Unassigned | Draft |

**Coverage:** 16 requirements; 0 mapped; 16 awaiting roadmap creation after approval.

## Evidence and Uncertainty

See [research summary](research/SUMMARY.md) and [evidence inventory](research/EVIDENCE.md). Four historical later attempts demonstrate an Exa tool error and ineffective retries; the discarded original error content prevents a precise Exa root-cause claim. A supported bridge into the actual originating Codex session requires proof, not inference from child execution APIs.

*Last updated: 2026-11-05 after owner approval of all 16 requirements; roadmap creation next.*
