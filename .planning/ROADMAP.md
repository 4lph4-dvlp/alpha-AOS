# Roadmap: alpha-AOS

## Milestones

- **v0.1.0 Vertical MVP** — historical closeout; [archived roadmap](milestones/v0.1.0-ROADMAP.md).
- **v0.1.1 CI Green & Dependency Promotion** — historical closeout; [archived roadmap](milestones/v0.1.1-ROADMAP.md).
- **v0.2.0 Universal Autonomous Work** — preserved historical work and outstanding evidence; [archived roadmap](milestones/v0.2.0-ROADMAP.md).
- **v0.6.0 Predictable Task Entry and Shared Project Policy** — Phase 27-34 work preserved with its unfinished status; [rollover](milestones/v0.6.0-ROLLOVER.md), [roadmap](milestones/v0.6.0-ROADMAP.md).
- **v0.7.0 Autopilot Reliability & Recovery** — all 16 requirements approved on 2026-11-05; the completed four-section roadmap is retained for native Codex development.

## v0.7.0 Autopilot Reliability & Recovery

**Goal:** Codex autopilot carries an authorized task from executable contract creation through automatic origin-session outcome detection, effective repair, rerun and final evidence-based reporting.

**Roadmap status:** Fully drafted reference design — all 16 requirements are approved. The owner selected native Codex development instead of GSD execution on 2026-11-05. The separate GSD roadmap-approval checkpoint is not being pursued; this is not a claim of formal GSD roadmap approval. Sections 35–38 are implemented. See [validation report](../docs/reports/autopilot-reliability-v070.md) for evidence and host limits.

Research: [summary](research/SUMMARY.md), [evidence](research/EVIDENCE.md). Requirements: [REQUIREMENTS.md](REQUIREMENTS.md).

## Phases

- [x] **Phase 35: Executable Contracts and Capability Diagnostics** — prevent known-unexecutable starts and expose actionable capability evidence.
- [x] **Phase 36: Origin-Session Completion Delivery** — connect runner outcomes to automatic continuation in the actual originating session.
- [x] **Phase 37: Authorized Repair and Rerun** — perform verified corrective changes and resume within approved authority and cumulative limits.
- [x] **Phase 38: Persistent Guidance and Lifecycle Evidence** — align installed behavior and demonstrate the complete user journey without premature handoff.

## Phase Map

| Phase | Goal | Requirements | Success criteria |
|---|---|---|---|
| 35 | Runnable contracts and useful capability diagnostics | ACON-01, ACON-02, ACON-03, ACON-04 | 4 |
| 36 | Durable outcomes delivered to the originating Codex session | ADEL-01, ADEL-02, ADEL-03, ADEL-04 | 4 |
| 37 | Real correction, revision authority and safe rerun | AREC-01, AREC-02, AREC-03, AREC-04, AREC-05 | 5 |
| 38 | Consistent continuation guidance and honest scenario evidence | ACONT-01, ACONT-02, ACONT-03 | 3 |

## Phase Details

### Phase 35: Executable Contracts and Capability Diagnostics

**Goal:** Users receive task-relevant, executable capability contracts and actionable failure evidence before wasting execution approval or repeating an unusable path.
**Depends on:** None (first phase of this milestone).
**Requirements:** ACON-01, ACON-02, ACON-03, ACON-04
**Success Criteria:**
1. A user asking to update Exa as a managed product receives only the capability obligations justified by that task and stage, while a task genuinely requiring web research retains its required invocation.
2. Before a contract is advertised as runnable or started, the user can inspect readiness of the actual adapter, transport, required tool/schema and service prerequisites. A refused start leaves approval unconsumed.
3. A failed capability exposes bounded, secret-safe detail useful for distinguishing argument, discovery/runtime, authentication, quota and service/transport problems; insufficient evidence is explicitly unknown rather than guessed.
4. Successful capability evidence is traceable to actual relevant calls and useful sources. Empty, irrelevant, failed or synthetic results cannot produce a satisfied production obligation.
**Delivery:** Implemented: task-specific obligations, discovered-schema checks, actual native preflight, scrubbed typed diagnostics and evidence validation.

Evidence: [implementation report](../docs/reports/autopilot-reliability-v070.md). No GSD plan execution is claimed.

**Research focus:** Preserve the underlying Exa error before choosing its remedy. The four historical failed calls establish a tool error, not a proven bad contract argument. Trace mock-success reachability and task-specific source policy without weakening required evidence.

### Phase 36: Origin-Session Completion Delivery

**Goal:** The user who requested autopilot receives automatic, durable outcome handling in that same Codex session instead of needing to ask for status.
**Depends on:** Phase 35.
**Requirements:** ADEL-01, ADEL-02, ADEL-03, ADEL-04
**Success Criteria:**
1. Starting a task persists its origin and exact contract/digest/revision/chain/attempt identity before execution, including when no progress panel is opened.
2. The actual originating Codex session automatically receives acceptance, final failure, interruption or genuine needs-input and continues outcome handling without a manual status request; an intermediate rejected attempt is not reported as a finished recovery chain.
3. A disconnect/reconnect or redelivered terminal event replays and acknowledges the correct result without duplicate continuation or duplicate work.
4. Before launch the user can see verified continuation support for the selected host/surface and its real delivery path. An unsupported surface is reported before start, and panel/status-file availability is never presented as proven session continuation.
**Delivery:** Implemented: durable panel-independent origin, foreground final-chain delivery, exact-identity follow and atomic acknowledgement. Active native Codex handle only; idle/closed-session injection is unsupported.

Evidence: [implementation report](../docs/reports/autopilot-reliability-v070.md). No GSD plan execution is claimed.

**Early feasibility checkpoint:** Prove a supported path into the current originating Codex host before committing to a bridge. Child exec terminal events and a separately launched app-server are not proof of access to the already open app session. Unsupported reporting alone does not complete this phase: the targeted originating-session continuation behavior must work or remain explicitly incomplete.

### Phase 37: Authorized Repair and Rerun

**Goal:** Recoverable failures produce a verified corrective action and a safe rerun within the user's approved repair grant, without another request for routine recovery.
**Depends on:** Phase 36 (and Phase 35 diagnostics).
**Requirements:** AREC-01, AREC-02, AREC-03, AREC-04, AREC-05
**Success Criteria:**
1. A recoverable contract, capability environment, implementation or transport failure selects and performs a correction at the appropriate layer; merely strengthening the same failed prompt is not classified as repair.
2. Before retrying the same failure, the user can inspect the relevant corrective change and its verification. Unchanged retries cannot exhaust the run while being reported as progress.
3. The user can approve an explicit bounded repair grant covering permitted contract revisions and reruns, inspect old/new digest ancestry, and receive a new approval request only for changes outside that grant.
4. Retry attempts share cumulative resource limits, approved models and scope/root/secret boundaries. User stop, real quota/resource exhaustion and required authority expansion stop automatic retry with a specific reason.
5. Recovery resumes from verified checkpoints and reconciled effects, preserving completed phases and preventing duplicate execution of an already accepted task.
**Delivery:** Implemented: bounded repair grant, read-only question correction and measured workspace correction, transactional revision ancestry, cumulative usage and verified checkpoint reuse.

Evidence: [implementation report](../docs/reports/autopilot-reliability-v070.md). No GSD plan execution is claimed.

**Authority checkpoint:** Design permitted revision handling explicitly before enabling it. Similar goals, changed digests or a waiting session do not silently grant new authority. Reuse GSD state ownership and the existing supervisor/effect ledger rather than creating a second lifecycle.

### Phase 38: Persistent Guidance and Lifecycle Evidence

**Goal:** Distributed agent instructions and observable product behavior sustain authorized recovery through the final user-visible outcome, with handoff reserved for real intervention boundaries.
**Depends on:** Phase 37.
**Requirements:** ACONT-01, ACONT-02, ACONT-03
**Success Criteria:**
1. Repository-owned skills, generated harness instructions and packaged documentation consistently continue available authorized recovery after transport yield or recoverable rejection, without a blanket single-wait stopping rule.
2. A recoverable failure keeps progressing while useful notes are preserved. A terminal handoff identifies a demonstrated external, user, authority or resource boundary and the specific missing action.
3. The user can review scenario evidence covering success, recoverable tool failure, contract revision, final failure, reconnect and explicit stop, with process closure, GSD acceptance, origin-session delivery and corrective progress reported separately; unrun checks stay unverified.
**Delivery:** Implemented: source/packaged continuation guidance, reviewable recovery instructions and scenario evidence with explicit unrun boundaries.

Evidence: [implementation report](../docs/reports/autopilot-reliability-v070.md). No GSD plan execution is claimed.

**Evidence checkpoint:** Prioritize the actual Codex origin-session journey and compare Antigravity behavior from observable evidence. Do not claim untested cross-host or cross-platform parity. Follow the workstation delivery policy; neither CI nor a full suite is made a push prerequisite by this roadmap.

## Progress

**Execution Order:** 35 → 36 → 37 → 38. These numbers identify work sections delivered through native Codex development.

| Section | GSD plans | Native implementation | Date |
|---|---|---|---|
| 35. Executable Contracts and Capability Diagnostics | Not used | Implemented; validation scoped below | 2026-11-06 |
| 36. Origin-Session Completion Delivery | Not used | Implemented; validation scoped below | 2026-11-06 |
| 37. Authorized Repair and Rerun | Not used | Implemented; validation scoped below | 2026-11-06 |
| 38. Persistent Guidance and Lifecycle Evidence | Not used | Implemented; validation scoped below | 2026-11-06 |

## Coverage

All 16 approved requirements map to exactly one work section. No additional requirements or previously unfinished work have been silently added. Native Codex development uses this mapping as reference design; a GSD roadmap checkpoint is not required.

## Planning and Delivery Boundaries

- Native Codex owns this repository's implementation workflow. Use Phases 35-38 as ordered work sections with their existing goals and success criteria; GSD commands, PLAN/SUMMARY artifacts and GSD approval checkpoints are not prerequisites.
- Implementation and validation evidence is recorded in the delivery report; keep the idle-session boundary and historical Exa root-cause uncertainty visible. Existing GSD records remain historical/reference context, not an active controller.
- Personal workstation delivery follows the owner's 2026-11-05 policy: no mandatory push/release CI, tests or local pre-push gate. Do not describe unrun checks as passed.
- Runtime approvals, root bounds, secret handling, rollback safeguards and model/resource policy remain in force.
- Preserve earlier Phase 27-34 work and historical failed contracts. This milestone does not restart the old latest-tools clone or external task.
- Roadmap approval alone does not start a product-level autopilot contract, change global harness settings, publish or deploy.

*Drafted: 2026-11-05 after approval of the 16 requirements. Execution workflow changed to native Codex at the owner's request; formal GSD roadmap approval was not performed.*
