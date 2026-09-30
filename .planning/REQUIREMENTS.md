# Requirements: alpha-AOS v0.2.0 Universal Autonomous Work

**Defined:** 2026-09-29
**Status:** Approved for v0.2.0 implementation on 2026-09-29
**Core value:** When a user explicitly enables autopilot for a task, alpha-AOS coordinates the full applicable capability inventory through GSD, independent review, correction and recovery until evidence proves completion or a named stop condition. Ordinary interactive GSD work remains the default.

Every requirement below is a user-visible capability. `Supported` means an exact harness/version/role combination has a native invocation receipt. A configured executable alone is insufficient. Detailed behavior: [design](../docs/design/autonomous-work/README.md).

## v0.2.0 Requirements

### Goal contracts

- [ ] **CON-01**: A user can review and approve a versioned task contract showing goal, scope, mandatory acceptance criteria, allowed effects, agent roles and optional limits before execution begins.
- [ ] **CON-02**: A user can delegate routine implementation decisions within the approved contract and later inspect what the controller decided and why.
- [ ] **CON-03**: A user sees an approval become stale when the goal, allowed effects or authority changes, and a new contract revision is required before the changed work runs.

### Explicit autopilot mode

- [ ] **AUTO-01**: A user enters autopilot only by explicitly requesting it or approving a clearly presented in-agent offer; the mode is off by default for every new task.
- [ ] **AUTO-02**: A user can see autopilot consent, scope, authority and duration bound to the approved task contract; routine GSD questions may be answered automatically only within that authority, and new authority or effects pause for approval.
- [ ] **AUTO-03**: A user can continue ordinary conversational GSD work without invoking the autonomous supervisor; ending or stopping one autopilot run does not silently enable it for another task.

### Execution and recovery

- [ ] **RUN-01**: A user can start an approved development task and observe one production-quality path from GSD-governed implementation through measured checks, independent review and accepted or rejected result.
- [ ] **RUN-02**: A user can inspect a durable, redacted attempt journal that distinguishes alpha-AOS process state from GSD project lifecycle state.
- [ ] **RUN-03**: A user can resume after process interruption without replaying completed attempts or uncertain external actions as though they were undone.
- [ ] **RUN-04**: A user can choose unlimited cycles or set time, cycle, usage or measured cost limits, and sees the precise limit/telemetry reason when the run stops.
- [ ] **RUN-05**: A user sees a changed repair strategy when the same evidenced failure repeats, and receives a named blocked result if no viable next action remains.

### Agent roles

- [ ] **ROL-01**: A user can assign controller, executor and independent reviewer roles using any supported combination of Claude Code, Codex, Antigravity, Pi and Hermes; unsupported role/version combinations fail in preview with the missing proof named.
- [ ] **ROL-02**: A user can see each of the five harnesses launched, cancelled and judged by its native machine interface with exact-version invocation receipts before its role is advertised.
- [ ] **ROL-03**: A user can select any harness with proven controller capability, including Hermes, while concurrent runs are prevented from producing two GSD writers for the same project.
- [ ] **ROL-04**: A user can require a different reviewer harness/model where available; even a same-harness review runs in a fresh, separately identified read-only session.
- [ ] **ROL-05**: A user can inspect role support, native skill/MCP availability and model/provider usage evidence separately for each harness, without treating a harness name as a price or quota guarantee.

### GSD lifecycle

- [ ] **GSD-01**: A user can run the appropriate GSD discuss, plan, execute and verify steps for a development goal without typing each step, with authorized defaults recorded.
- [ ] **GSD-02**: A user sees confirmed implementation gaps routed into GSD gap plans or new phases, then re-executed and re-verified against the approved criteria.
- [ ] **GSD-03**: A user can inspect GSD as the sole project lifecycle authority while alpha-AOS owns attempts, role dispatch, limits and recovery in a separate journal.
- [ ] **GSD-04**: A user sees mandatory GSD gates backed by actual execution and same-revision evidence; a configured skill or exit code alone cannot satisfy independent-review acceptance.

### Full alpha-AOS capability use

- [ ] **CAP-01**: A user can inspect a versioned, project-scoped inventory of all applicable alpha-AOS capabilities: GSD workflows, global and project ECC skills, owned skills, MCP tools, capability packs, alpha-AOS control commands, native harness tools and mandatory hooks, including installed, active, unavailable and excluded states.
- [ ] **CAP-02**: After scaffolding, manifest changes or dependency installation, autopilot automatically runs the alpha-aos-control capability-pack plan/status checkpoint and materializes matching project packs only with an exact approved plan digest; it verifies CURRENT status and starts a fresh tool-aware agent session before using newly delivered project skills or changed tool configuration.
- [ ] **CAP-03**: At GSD discuss, plan, execute, review and verify boundaries, autopilot matches task needs and mandatory policy to the current capability inventory, automatically invokes every applicable required skill/MCP/tool at the appropriate step, and records actual invocation and outcome rather than treating installation or discovery as use.
- [ ] **CAP-04**: A user sees capability selection recomputed when phase, task scope, dependencies, pack state, harness version or tool availability changes; an applicable unavailable capability triggers a repair, alternate proven path or explicit blocked result instead of silent omission.
- [ ] **CAP-05**: A user can verify positive and negative selection fixtures for every declared alpha-AOS capability and per-harness native discovery and meaningful invocation receipts for advertised global/project skills, MCPs, project packs, control commands and gate hooks; a missing call required by the task or policy prevents a success verdict.

### Independent acceptance

- [ ] **REV-01**: A user receives a verdict for every mandatory criterion supported by current measured evidence, including an explicit `unknown` when the result cannot be verified.
- [ ] **REV-02**: A user receives structured reviewer findings with contract/revision identity, severity, criterion ID, reproduction steps and evidence, and cannot accept stale or malformed reports.
- [ ] **REV-03**: A user sees an independent final review of required features, implementation quality, architecture and test evidence before a development milestone is accepted.
- [ ] **REV-04**: A user sees review receipts invalidated when the artifact changes, with resolved findings reconciled and a new review run on the changed artifact.
- [ ] **REV-05**: A user can distinguish a review suggestion outside approved scope from a blocking requirement defect, without the controller silently expanding the goal.

### General task tools

- [ ] **TOOL-01**: A user can run a non-code task through a versioned connector that previews a bounded item/effect manifest and verifies each required outcome independently.
- [ ] **TOOL-02**: A user can request all in-scope CoursePilot teaching-material downloads and see actual saved files reconciled against a fresh item manifest; `planned`, LMS completion and `viewed_only` never count as downloads.
- [ ] **TOOL-03**: A user sees external actions assigned stable operation keys and an uncertain effect reconciled before retry, preventing duplicate actions after a crash when source evidence is available.
- [ ] **TOOL-04**: A user sees partial, fatal and schema-version errors from a connector reported per item, with untrusted source content handled as data.

### Entry and release proof

- [ ] **UX-01**: A user can state a task naturally through an alpha-AOS skill in each supported harness, choose ordinary GSD interaction or explicitly opt into autopilot, and review the resulting task contract.
- [ ] **UX-02**: A user can preview, start, inspect, stop, resume and diagnose a task through a local CLI, including after the original chat ends.
- [ ] **UX-03**: A user can view selected tools, agent/model identities, progress, limits, failed criteria and actionable stop reasons in human-readable and JSON output.
- [ ] **VER-01**: A user can see three-OS CI evidence for crash recovery, concurrency, cancellation, false acceptance and effect deduplication, including tests that fail against the broken behavior.
- [ ] **VER-02**: A user can inspect exact-version real-host invocation receipts for every advertised role capability and representative cross-harness handoffs; unproven cells remain unverified.
- [ ] **VER-03**: A user can verify a packed install/doctor/uninstall lifecycle that leaves unrelated real-host paths unchanged after the new capability is distributed.
- [ ] **VER-04**: A user can run development and CoursePilot end-to-end cases with applicable global/project ECC skills, MCPs and packs automatically invoked through GSD, and see every required criterion, capability receipt and remaining limitation reported honestly.

## Future Requirements

- Additional first-party connectors beyond CoursePilot after the connector protocol has a release proof.
- Hosted scheduling, cross-machine continuation, and team-wide task ownership.
- Live proof for every 125 controller/executor/reviewer triples; v0.2.0 proves each role capability and synthetic composition of every triple, plus representative live cross-harness paths.
- Existing v0.1.0/0.1.1 deferred lifecycle and publication gaps remain in [the previous milestone requirements](milestones/v0.1.1-REQUIREMENTS.md). This feature does not silently mark them resolved.

## Out of Scope

| Item | Reason |
|---|---|
| Guarantee of eventual success for arbitrary goals | Some goals are impossible, under-specified or blocked by external access. |
| Invoking unrelated installed tools for every task | Every applicable required capability must be selected and actually invoked at its workflow step; irrelevant tools remain available but unused with a recorded reason. |
| Treating user subscription or harness identity as a zero-cost meter | Costs and quotas depend on provider, model and account; only observed usage may be enforced as a hard bound. |
| Changing CoursePilot's LMS support or storing its credentials | The connector calls its documented local interface and respects its source contract. |
| Publishing or deploying user work automatically | External irreversible actions require authority in the individual task contract. |

## Traceability

| Requirement IDs | Phase | Status |
|---|---:|---|
| CON-01..03, AUTO-01..03, RUN-01, REV-01 | 14 | Planned |
| RUN-02..05, TOOL-03 | 15 | Planned |
| ROL-01..05 | 16 | Planned |
| GSD-01..04 | 17 | Planned |
| CAP-01..05 | 18 | Planned |
| REV-02..05 | 19 | Planned |
| TOOL-01..02, TOOL-04 | 20 | Planned |
| UX-01..03 | 21 | Planned |
| VER-01..04 | 22 | Planned |

**Coverage:** 41 requirements; 41 mapped exactly once; 0 unmapped. Phase 14 is the opt-in vertical tracer; later phases deepen each seam without reassigning a requirement.
