# Roadmap: alpha-AOS v0.2.0 Universal Autonomous Work

**Milestone goal:** With explicit per-task opt-in, one approved contract drives GSD-governed work through the full applicable alpha-AOS capability inventory, including global/project ECC skills, MCPs, project packs and native tools. It survives interruption, obtains independent evidence, repairs confirmed gaps and ends with an honest accepted or blocked outcome. Ordinary conversational GSD remains the default. Scope refined 2026-09-29. The [requirements](REQUIREMENTS.md) define release behavior; the [design](../docs/design/autonomous-work/README.md) defines module boundaries.

## Milestones

- ✅ **v0.1.0 Vertical MVP** — archived in `milestones/v0.1.0-ROADMAP.md`.
- ✅ **v0.1.1 CI Green & Dependency Promotion** — archived in `milestones/v0.1.1-ROADMAP.md`.
- ◇ **v0.2.0 Universal Autonomous Work** — Phases 14–22; roadmap approved, implementation pending.

## Phases

- [x] **Phase 14: Contract and Vertical Tracer** - Explicit opt-in, approved contract and real implementation-to-review path (completed 2026-10-01)
- [x] **Phase 15: Durable Supervisor and Effect Ledger** - Recovery, limits, no-progress strategy and effect reconciliation (completed 2026-10-01)
- [x] **Phase 16: Composable Harness Roles** - Proven native adapters and exclusive GSD controller (completed 2026-10-02)
- [x] **Phase 17: GSD Lifecycle Bridge** - Full discuss/plan/execute/verify/gap routing through GSD (completed 2026-10-03)
- [x] **Phase 18: Capability Fabric and Automatic Invocation** - Global/project skills, MCPs, packs and hooks selected and used inside GSD (completed 2026-10-08)
- [ ] **Phase 19: Structured Independent Review** - Exact-revision review, repair and final architecture audit
- [ ] **Phase 20: General Tool Connectors** - Non-code task protocol and CoursePilot exemplar
- [x] **Phase 21: Natural Entry and Operator CLI** - Opt-in mode, skill distribution and persistent command UX (verified 2026-10-10)
- [ ] **Phase 22: Release Proof** - Three-OS, packed and live-harness evidence

## Phase Map

| Phase | Goal | Requirements | Depends on |
|---:|---|---|---|
| 14 | Explicit opt-in, approved contract and real vertical tracer | CON-01..03, AUTO-01..03, RUN-01, REV-01 | None |
| 15 | Durable supervisor, limits and effect reconciliation | RUN-02..05, TOOL-03 | 14 |
| 16 | Proven five-harness role adapters and one GSD writer | ROL-01..05 | 15 |
| 17 | Full GSD lifecycle and mandatory gate bridge | GSD-01..04 | 14–16 |
| 18 | Complete alpha-AOS capability inventory and automatic GSD-step invocation | CAP-01..05 | 16–17 |
| 19 | Independent structured review and repair loop | REV-02..05 | 17–18 |
| 20 | General connectors and CoursePilot materials proof | TOOL-01..02, TOOL-04 | 15, 19 |
| 21 | Natural-language skill, opt-in mode and persistent CLI | UX-01..03 | 16–20 |
| 22 | Cross-platform, packed-release and live support proof | VER-01..04 | 14–21 |

Every requirement maps to exactly one phase. Subsequent phases can reuse a previous capability but must not claim its requirement complete without the owning phase's verification. Each phase starts with the existing GSD discuss → plan → plan check workflow; execute and verify when its plan passes. One production-quality end-to-end tracer leads each plan unless the phase planner documents a specific reason to vary it.

## Phase Details

### Phase 14: Contract and Vertical Tracer

**Goal:** An explicitly opted-in, approved task can travel through GSD-governed implementation, one measured criterion and an independent fresh reviewer session to a trustworthy accepted/rejected verdict; ordinary GSD interaction stays unchanged.

**Requirements**: CON-01, CON-02, CON-03, AUTO-01, AUTO-02, AUTO-03, RUN-01, REV-01.

**Depends on:** Nothing in this milestone.

**Implementation slices:** Default-off autopilot mode and per-task consent; contract schema and canonical digest; read-only preview and explicit approval binding; one production agent adapter pair using existing bounded process APIs; criterion runner and exact-revision acceptance receipt; minimal GSD quick/phase bridge; deliberately failing tracer case. The fixed pair is an implementation bootstrap, not a product restriction.

**Success Criteria** (what must be TRUE):

1. An ordinary GSD conversation never starts the supervisor; explicit request or a clearly approved in-agent offer binds autopilot to one contract, and ending it does not enable the next task.
2. Changing goal, effect permission or role after approval makes `start` refuse the old digest; delegated routine decisions remain auditable and new authority pauses for approval.
3. A real end-to-end task reaches accepted only after its check and fresh reviewer both evaluate the same artifact digest.
4. A failing or unknown required check produces rejected/unknown, even if the executor claims success or exits 0.
5. A test substitutes stale review output and observes refusal before GSD completion.

**Verification:** Targeted TypeScript tests for contract canonicalization and a fixture/real CLI tracer, followed by `npm run check` and the phase's GSD verification. Phase plan names the exact installed bootstrap pair after a native probe.

**Plans:** 9/9 plans complete

Plans:
**Wave 1**

- [x] 14-01-PLAN.md — Tracer: approved contract through startTask to a measured, reviewed verdict receipt; `task preview|approve|report` CLI

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-02-PLAN.md — Contract authority boundaries: canonical digest, changed-field drift, revision reuse, authority and secret guards, root binding
- [x] 14-03-PLAN.md — Verdict evidence depth: exact snapshot measurement, confirmed reproductions, stale refusals, named unknowns, recorded decisions
- [x] 14-04-PLAN.md — Native bootstrap pair: Codex controller/executor (codex-cli 0.158.0) and fresh read-only Claude reviewer (Claude Code 2.1.285)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-05-PLAN.md — GSD quick bridge and authority audit: read-only GSD evidence, blocked new authority, D-07 pack checkpoint, wall-time stop

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 14-06-PLAN.md — `task start` and the live tracer: real accepted run, real success-claiming defect rejected, real stale review refused — HALTED: `task start` shipped; live tracer 14-06-02/03 NOT PROVEN on this host (Codex sandbox keeps .git read-only), deferred by user decision D

**Wave 5 — gap closure** *(blocked on Wave 4 completion)*

- [x] 14-07-PLAN.md — Reviewed controller git authority: one-way decision checkpoint (host evidence P1-P11), tracer granting exactly the project's git directory through an alpha-AOS Codex permission profile (config/hooks/info read-only, `--ignore-rules`, run-scoped safe.directory) proven by a no-spend host sandbox canary, approval-bound and named in the preview

**Wave 6 — gap closure** *(blocked on Wave 5 completion)*

- [x] 14-08-PLAN.md — Git control-file and history guards with recorded grant, then the live tracer: real accepted run (PASSED), defect and stale review live tests hit NOT PROVEN checkpoint due to Codex CLI exit 1

**Wave 7 — gap closure** *(blocked on Wave 6 completion)*

- [x] 14-09-PLAN.md — Deep Codex controller diagnostics capture, live execution proof of defect rejection and stale review, or formalize legitimate roadmap deferral to Phase 16/17

### Phase 15: Durable Supervisor and Effect Ledger

**Goal:** A run can continue after interruption, honor user-selected limits and reconcile external effects without duplicate action.

**Requirements**: RUN-02, RUN-03, RUN-04, RUN-05, TOOL-03.

**Depends on:** Phase 14.

**Implementation slices:** Append-only run journal and atomic checkpoints; process cancellation/descendant cleanup; stable effect keys and unknown/reconcile state; optional resource counters and quota classifier; no-progress fingerprint and alternate strategy policy. Keep mandatory per-attempt safety bounds even when overall limits are unset.

**Success Criteria** (what must be TRUE):

1. Kill the supervisor before and after an effect's result is written; resume reconstructs an accurate state and does not replay a completed or uncertain effect without source reconciliation.
2. Unlimited, cycle-limited, time-limited and measured-usage-limited runs stop for their correct reasons; an unavailable required cost meter fails closed.
3. A repeated identical failure triggers an observable strategy change and eventually an actionable blocked result if alternatives are exhausted.
4. A cancelled agent leaves no descendant process under Windows, macOS or Linux fixture runs and retains bounded, redacted evidence.

**Verification:** Fault injection at each journal/effect boundary, idempotent resume tests, and platform process-tree tests.

**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 15-01-PLAN.md — Run Journal and Atomic Checkpoint Storage: append-only fsync journal.jsonl, atomic checkpoint.json, secret redaction, and 64KB process output caps (RUN-02)
- [x] 15-02-PLAN.md — Process Cancellation and Cross-Platform Tree Cleanup: whole-tree termination across Windows and POSIX, AbortSignal cancellation, and mandatory attempt safety bounds (RUN-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 15-03-PLAN.md — Effect Ledger and Source Evidence Reconciliation: deterministic operation keys, state machine, and source evidence reconciliation (TOOL-03)
- [x] 15-04-PLAN.md — Resource Policy and Quota Classifier: resource limits schema, cent-safe precision, fail-closed cost metering, and standard stop codes (RUN-04)
- [x] 15-05-PLAN.md — Failure Fingerprint and Adaptive Strategy Policy: normalized failure fingerprints, 2-consecutive loop detector, 3-stage repair strategy, and blocked reporting (RUN-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 15-06-PLAN.md — Durable Supervisor Loop, GSD Observation, and CLI Resume: durable supervisor loop, GSD/Git state observation consistency, fault-injection crash recovery, and CLI commands (RUN-02, RUN-03, TOOL-03)

### Phase 16: Composable Harness Roles

**Goal:** Claude Code, Codex, Antigravity, Pi and Hermes can perform every advertised operational role through native, version-proven adapters while exactly one controller writes GSD state.

**Requirements**: ROL-01..05.

**Depends on:** Phase 15.

**Implementation slices:** Common launch/result/session protocol; per-harness headless/RPC adapters; capability and provider/usage receipts; support-matrix projection; exclusive fenced controller lease; migrate D-10 name-based Hermes restriction after role proof. Integrate with existing process and capability ledgers, not direct child-process forks.

**Success Criteria** (what must be TRUE):

1. The registry composes all 5×5×5 role triples in a deterministic fixture, accepting only triples whose component role/version capabilities are proven and naming missing proof for the rest.
2. Each advertised harness/role has a successful real native invocation, completion interpretation and cancellation receipt; a CLI version drift demotes support until reprobed.
3. Two simultaneous candidate controllers cannot both mutate one project's GSD state; a losing controller sees a coded lock result without restoring the winner's work.
4. A same-harness reviewer runs in a fresh, separately identified read-only session; different-model/harness policy is applied when specified.
5. Usage and cost output identifies measured fields, provider/model and unknown values without asserting that an agent is free by brand.
6. The Codex controller reliably executes GSD quick defect implementation under its native/isolated environment without premature non-zero exits, and the Phase 14 live defect tracer (14-06-03/14-08-03 seeded defect rejection and stale review substitution) reaches verified accepted/rejected verdicts.

**Verification:** Adapter contract suite, adversarial lease fixtures, exact-version canaries, support-matrix checks and representative live handoffs. Unsupported native surfaces remain visible rather than simulated.

**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 16-02-PLAN.md — Atomic Role Capability Receipts and Schema Validation (ROL-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 16-01-PLAN.md — Deterministic 5x5x5 Capability Matrix and Support Checker (ROL-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 16-03-PLAN.md — Project-Local Controller Lease and Worker Authority (ROL-03)
- [x] 16-04-PLAN.md — Ephemeral Session Reviewer Isolation and Tree Mutation Guard (ROL-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 16-05-PLAN.md — Telemetry Normalization, Missing Meter Gate, and 3D Task Doctor (ROL-05)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 16-06-PLAN.md — Native Adapters for Antigravity, Pi, Hermes, and Codex Hardening (ROL-01, ROL-02, SC6)

### Phase 17: GSD Lifecycle Bridge

**Goal:** A development run moves through the installed GSD discuss, plan, execute, verify and gap paths without a second project state machine or skipped mandatory gates.

**Requirements**: GSD-01..04.

**Depends on:** Phases 14–16.

**Implementation slices:** GSD command adapter using installed workflow context and stable lock; authorized default-answer policy; phase/plan discovery and recovery; gap-plan/new-phase routing; hook receipt upgrade to actual invocation. The bridge must use native GSD state transitions and preserve GSD checkpoints that genuinely require user or external input.

**Success Criteria** (what must be TRUE):

1. A development task advances across two phases without typing commands; current GSD STATE and ROADMAP match the observed completed work and contain no supervisor-owned substitute transition.
2. An injected gap becomes a GSD gap plan or new phase, is executed, and is re-verified before the run resumes.
3. A skill-only gate or process exit 0 without the required review witness cannot count as acceptance.
4. An interrupted phase restarts at GSD's recorded boundary without duplicating completed plans or silently defaulting a new scope decision.

**Verification:** Synthetic GSD fixture with failed hook, missing artifact, interrupted phase and real installed-GSD smoke test. Run `alpha-aos gsd-context execute-phase` and its step slices while executing this phase.

**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 17-01-PLAN.md — Mandatory Hook Execution Receipts and Same-Revision Review Witness Verification (GSD-04)
- [x] 17-02-PLAN.md — GSD State Discovery, Triple-Correlation Idempotency, and Scope Immutability (GSD-03)
- [x] 17-03-PLAN.md — Interactive Prompt Auto-Answer Policy, Safe Input Pause, and CLI Resume (GSD-01, GSD-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 17-04-PLAN.md — Verification Gap Routing, Native Gap Plans, and Anti-Loop Recovery (GSD-02, GSD-03)
- [x] 17-05-PLAN.md — GSD Lifecycle Orchestrator and Multi-Phase Progression Adapter (GSD-01, GSD-03, GSD-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 17-06-PLAN.md — Supervisor Integration, 4-Adversarial Fixture Suite, and Doctor Diagnostics (GSD-01, GSD-02, GSD-03, GSD-04)

### Phase 18: Capability Fabric and Automatic Invocation

**Goal:** Every alpha-AOS capability that applies to a task is discoverable, safely activated and actually used at its natural GSD step, with missing required invocations preventing false completion.

**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, CAP-05.

**Depends on:** Phases 16–17.

**Implementation slices:** Versioned capability graph across GSD, owned/global/project ECC skills, MCP tools, project packs, alpha-AOS control commands, native harness tools and hooks; setup-completion event to `alpha-aos project plan/status`; digest-bound pack approval/sync; fresh-session activation; policy-driven task/phase matcher; actual invocation receipts and drift-triggered replanning. Reuse `alpha-aos-control`, project-pack sync, canary and capability-ledger surfaces.

**Success Criteria** (what must be TRUE):

1. After a fixture scaffolds a project and installs dependencies, autopilot runs the pack checkpoint before application work, presents exact matched packs/evidence, and cannot sync an unapproved or stale digest.
2. Once an approved project pack is CURRENT, a fresh agent session discovers its project-only ECC skill plus configured MCP tools, calls those applicable to the matching GSD plan/execute/verify step, and records actual result receipts; a newly irrelevant capability stays unused with a reason.
3. A task requiring framework documentation invokes Context7 through `documentation-lookup`; a research task invokes the selected Exa/Firecrawl route; a cross-harness handoff invokes unified memory when its selection predicate applies. A missing required call fails the gate despite installed configuration or a successful agent exit.
4. Changing the phase, manifest, pack, skill source, harness version or tool availability recomputes selection and proof. A missing applicable capability is repaired, replaced by a proven equivalent or reported blocked; it is never silently omitted.
5. Every declared alpha-AOS capability has a matching and nonmatching task fixture; all five harnesses have a support matrix that separates installed, discovered, invoked, unsupported and unverified for global/project skills, MCPs, control commands and mandatory hooks, with exact-version evidence for advertised native paths.

**Verification:** Scenario-driven positive/negative selection tests, pack approval and fresh-session fixtures, skill/MCP invocation canaries and a real GSD multi-step trace with observation receipts.

**Plans:** 8/8 plans complete

Plans:
**Wave 1**

- [x] 18-01-PLAN.md — End-to-End Capability Invocation Tracer (CAP-03, CAP-05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-02-PLAN.md — Versioned Inventory and Deterministic Selection (CAP-01, CAP-03, CAP-04)
- [x] 18-03-PLAN.md — Setup Barrier, Pack Approval, and Fresh Session (CAP-02)
- [x] 18-04-PLAN.md — MCP Outcome and Linked Skill Receipts (CAP-03, CAP-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 18-05-PLAN.md — Drift Invalidation, Repair, and Proven Alternatives (CAP-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 18-06-PLAN.md — Task Capability Summary, Detail, and JSON (CAP-01, CAP-04)
- [x] 18-08-PLAN.md — Operational GSD and Review Boundary Invocation (CAP-03)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 18-07-PLAN.md — Complete Fixtures and Five-Harness Support Matrix (CAP-05)

### Phase 19: Structured Independent Review

**Goal:** Review findings on the exact result drive focused repairs, and final acceptance covers both features and codebase quality.

**Requirements**: REV-02..05.

**Depends on:** Phases 17–18.

**Implementation slices:** Schema-validated reviewer report; evidence locator/reproducer; severity/scope classification; finding deduplication; review invalidation on new artifact digest; final integration/architecture/code review; bounded correction cycle and no-progress escalation.

**Success Criteria** (what must be TRUE):

1. A malformed, stale or ambiguous report is rejected or marked unknown; it cannot mark mandatory criteria passed.
2. A reproducible defect yields one GSD repair item; after repair, a new reviewer session checks the new revision and old resolved finding is not reopened without a new failure.
3. A final review finds a seeded missing required feature and an architectural defect, maps both to actionable work, and reports unrelated enhancement ideas as suggestions outside current scope.
4. The terminal report names each criterion, automated check, reviewer identity, evidence ref and any remaining unknown.

**Verification:** Adversarial report fixtures, deliberately broken implementation trial, reviewer independence receipt and code-review/UAT gate.

**Plans:** 6/6 plans complete

Plans:
**Wave 1**

- [x] 19-01-PLAN.md — Exact-Revision Report and Evidence Tracer (REV-02, REV-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-02-PLAN.md — Objective Classification and Deferred Suggestions (REV-02, REV-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-03-PLAN.md — Deduplicated GSD Repair and Fresh Re-review (REV-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 19-04-PLAN.md — Milestone Final Review Contract and Acceptance Gate (REV-03, REV-04, REV-05)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 19-05-PLAN.md — Five-Harness Final Reviewer Adapters (REV-03, REV-04)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 19-06-PLAN.md — Terminal Review Report and Adversarial Integration (REV-02..05)

### Phase 20: General Tool Connectors

**Goal:** The same contract/run/review engine can execute non-code work and prove per-item outcomes with CoursePilot as the first real connector.

**Requirements**: TOOL-01, TOOL-02, TOOL-04.

**Depends on:** Phases 15 and 19.

**Implementation slices:** First extend CoursePilot's supported materials CLI/JSON contract in its own repository to expose versioned complete-or-unknown attachment manifests and exact module/file selection with stale-source rejection. Then build the connector manifest/preview/perform/reconcile/verify API, bounded runtime resolver and parser, per-file verifier, and partial/fatal handling in alpha-AOS. Preserve CoursePilot credentials, unrelated LMS behavior, VOD, and Notion behavior. The upstream contract must be tested and available before dependent connector execution.

**Success Criteria** (what must be TRUE):

1. A generic fixture connector proves the engine can run an itemized task without assuming Git diffs or code tests.
2. A CoursePilot fixture with downloaded, planned, viewed-only, already-present and errored materials reports exact saved/unsaved counts, and verifies actual file existence for successes.
3. A partial exit keeps successful item evidence and queues only failed items; fatal/config/schema errors stop with a named next action.
4. A repeated run reconciles existing verified files and uncertain effects without duplicate downloads; malicious LMS text is treated as data.

**Verification:** CoursePilot's published selector/attachment contract and offline fixtures, alpha-AOS versioned JSON contract fixtures, and bounded local CoursePilot dry-run/live test only where the user's account and approved task scope permit it.

**Plans:** 6/6 plans complete

Plans:

- [x] 20-01-PLAN.md
- [x] 20-02-PLAN.md
- [x] 20-03-PLAN.md
- [x] 20-04-PLAN.md
- [x] 20-05-PLAN.md
- [x] 20-06-PLAN.md

**Wave 1**

- [x] 20-01 — General connector contract and first non-code tracer

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 20-02 — Effect ledger and reconciliation
- [x] 20-03 — CoursePilot installed-contract adapter and fresh preview; requires CoursePilot Phase 18
- [x] 20-04 — Independent file verification

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 20-05 — Exact selected-file performance and per-file recovery

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 20-06 — Current evidence verdict, full reapproval preview, and report

### Phase 21: Natural Entry and Operator CLI

**Goal:** A user can start and control the same durable run from any supported harness or CLI after the initial chat closes.

**Requirements**: UX-01..03.

**Depends on:** Phases 16–20.

**Implementation slices:** Repository-owned alpha-AOS task skill distributed through native target surfaces; ordinary GSD versus explicit per-task autopilot choice; `alpha-aos task plan|start|status|stop|resume|doctor|report`; JSON/human output; digest-bound preview; selected-tool and cost/limit explanations.

**Success Criteria** (what must be TRUE):

1. Each supported harness discovers the skill through a meaningful native invocation, offers a clear optional autopilot choice and reaches the same approved contract preview without switching modes by default.
2. The CLI resumes/stops a run in a new process and presents the same journal/GSD state as the skill.
3. A user can distinguish accepted, blocked, stopped, failed and unknown states, and see exact agent/model, tool choices, consumed measured resources and next action.
4. An unapproved or stale contract cannot be started by hand-editing an old preview or replaying its command.

**Verification:** Packed CLI scenarios, skill discovery canaries and malformed/stale contract tests.

**Plans:** 7/7 plans complete

Plans:

**Wave 1**

- [x] 21-01-PLAN.md — Native task skill and end-to-end entry tracer

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 21-02-PLAN.md — Full contract preview, changes, limits and blocked readiness

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 21-03-PLAN.md — Reserved run identity and durable control commands

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 21-04-PLAN.md — Cross-process stop, confirmed termination and safe resume

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 21-05-PLAN.md — Run-scoped status and shared evidence view

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 21-06-PLAN.md — Complete criterion and item-level reports

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 21-07-PLAN.md — Scoped doctor, structured failure JSON and integrated proof

### Phase 22: Release Proof

**Goal:** The capability is safe to advertise across Windows, macOS and Linux with its actual harness coverage and limitations visible.

**Requirements**: VER-01..04.

**Depends on:** Phases 14–21.

**Implementation slices:** Three-OS fault matrix; exact-version live role and skill/MCP/pack receipts and representative cross-harness handoffs; packed release lifecycle; development and CoursePilot end-to-end examples; ordinary-GSD non-autopilot control; support matrix and user documentation; final independent milestone review.

**Success Criteria** (what must be TRUE):

1. One CI run reports green on all three OS legs with fault cases for crash, cancellation, duplicate effects, concurrency and false acceptance; tests show they fail against injected broken behavior.
2. Support diagnostics distinguish advertised, unverified and unsupported per harness/version/role, with real receipts for every advertised cell.
3. The packed install/doctor/uninstall exercise changes no unrelated real-host managed path and preserves the stable-lock supply-chain gate.
4. Both development and CoursePilot exemplar tasks produce criterion-by-criterion evidence and actual applicable ECC/MCP/pack calls; partial or unverifiable outcomes are reported without a false completed status.
5. A normal GSD task remains interactive and does not enter autopilot without a per-task request or approval.
6. GSD milestone audit, cross-phase integration check and independent code review find no unresolved blocking requirement gap before closeout.

**Verification:** Final full `npm run check`, `npm test`, `npm run build`, three-OS CI run and GSD audit/verify-work; record role, skill, MCP, pack and hook invocation receipts and limits in the release matrix. Do not claim a missing paid or authenticated canary passed.

**Plans:** 6/6 plans complete

Plans:

**Wave 1**

- [x] 22-01-PLAN.md — Candidate evidence identity and one receipt-to-doctor tracer

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 22-02-PLAN.md — Five fault controls and one-candidate three-OS CI evidence
- [x] 22-03-PLAN.md — Exact-version support cells and real cross-harness handoffs
- [x] 22-05-PLAN.md — Development and CoursePilot criteria and capability receipts

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 22-04-PLAN.md — Packed lifecycle, stable lock and real-host drift proof

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 22-06-PLAN.md — Current-candidate release evidence, documentation and independent milestone gate

## Planning and Execution Gates

For each phase, use `$gsd-discuss-phase N` (or approved `--auto` defaults), `$gsd-plan-phase N` with research and plan-check verification, `$gsd-review N` when the plan has cross-harness or safety impact, `$gsd-execute-phase N`, `$gsd-code-review`, and `$gsd-verify-work N`. Resolve `human_needed` with observed evidence or a real user test, never an invented pass. Use `$gsd-progress` to route incomplete work and `$gsd-audit-milestone` at closeout if surfaced; missing GSD skills are read through the installed GSD workflow and run inline only where the runtime contract permits it. The installed GSD Core remains the state authority.

**Release rule:** Phase summaries, automated tests, support receipts and reviewed completion criteria must agree. A green gate with no actual reviewer invocation is a failure. Candidate dependency changes remain in the candidate channel until their existing promotion gates pass.
