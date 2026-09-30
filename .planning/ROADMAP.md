# Roadmap: alpha-AOS v0.2.0 Universal Autonomous Work

**Milestone goal:** With explicit per-task opt-in, one approved contract drives GSD-governed work through the full applicable alpha-AOS capability inventory, including global/project ECC skills, MCPs, project packs and native tools. It survives interruption, obtains independent evidence, repairs confirmed gaps and ends with an honest accepted or blocked outcome. Ordinary conversational GSD remains the default. Scope refined 2026-09-29. The [requirements](REQUIREMENTS.md) define release behavior; the [design](../docs/design/autonomous-work/README.md) defines module boundaries.

## Milestones

- ✅ **v0.1.0 Vertical MVP** — archived in `milestones/v0.1.0-ROADMAP.md`.
- ✅ **v0.1.1 CI Green & Dependency Promotion** — archived in `milestones/v0.1.1-ROADMAP.md`.
- ◇ **v0.2.0 Universal Autonomous Work** — Phases 14–22; roadmap approved, implementation pending.

## Phases

- [ ] **Phase 14: Contract and Vertical Tracer** - Explicit opt-in, approved contract and real implementation-to-review path
- [ ] **Phase 15: Durable Supervisor and Effect Ledger** - Recovery, limits, no-progress strategy and effect reconciliation
- [ ] **Phase 16: Composable Harness Roles** - Proven native adapters and exclusive GSD controller
- [ ] **Phase 17: GSD Lifecycle Bridge** - Full discuss/plan/execute/verify/gap routing through GSD
- [ ] **Phase 18: Capability Fabric and Automatic Invocation** - Global/project skills, MCPs, packs and hooks selected and used inside GSD
- [ ] **Phase 19: Structured Independent Review** - Exact-revision review, repair and final architecture audit
- [ ] **Phase 20: General Tool Connectors** - Non-code task protocol and CoursePilot exemplar
- [ ] **Phase 21: Natural Entry and Operator CLI** - Opt-in mode, skill distribution and persistent command UX
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

**Plans:** 5/6 plans executed

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

- [ ] 14-06-PLAN.md — `task start` and the live tracer: real accepted run, real success-claiming defect rejected, real stale review refused

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

**Verification:** Adapter contract suite, adversarial lease fixtures, exact-version canaries, support-matrix checks and representative live handoffs. Unsupported native surfaces remain visible rather than simulated.

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

### Phase 18: Capability Fabric and Automatic Invocation

**Goal:** Every alpha-AOS capability that applies to a task is discoverable, safely activated and actually used at its natural GSD step, with missing required invocations preventing false completion.

**Requirements**: CAP-01..05.

**Depends on:** Phases 16–17.

**Implementation slices:** Versioned capability graph across GSD, owned/global/project ECC skills, MCP tools, project packs, alpha-AOS control commands, native harness tools and hooks; setup-completion event to `alpha-aos project plan/status`; digest-bound pack approval/sync; fresh-session activation; policy-driven task/phase matcher; actual invocation receipts and drift-triggered replanning. Reuse `alpha-aos-control`, project-pack sync, canary and capability-ledger surfaces.

**Success Criteria** (what must be TRUE):

1. After a fixture scaffolds a project and installs dependencies, autopilot runs the pack checkpoint before application work, presents exact matched packs/evidence, and cannot sync an unapproved or stale digest.
2. Once an approved project pack is CURRENT, a fresh agent session discovers its project-only ECC skill plus configured MCP tools, calls those applicable to the matching GSD plan/execute/verify step, and records actual result receipts; a newly irrelevant capability stays unused with a reason.
3. A task requiring framework documentation invokes Context7 through `documentation-lookup`; a research task invokes the selected Exa/Firecrawl route; a cross-harness handoff invokes unified memory when its selection predicate applies. A missing required call fails the gate despite installed configuration or a successful agent exit.
4. Changing the phase, manifest, pack, skill source, harness version or tool availability recomputes selection and proof. A missing applicable capability is repaired, replaced by a proven equivalent or reported blocked; it is never silently omitted.
5. Every declared alpha-AOS capability has a matching and nonmatching task fixture; all five harnesses have a support matrix that separates installed, discovered, invoked, unsupported and unverified for global/project skills, MCPs, control commands and mandatory hooks, with exact-version evidence for advertised native paths.

**Verification:** Scenario-driven positive/negative selection tests, pack approval and fresh-session fixtures, skill/MCP invocation canaries and a real GSD multi-step trace with observation receipts.

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

### Phase 20: General Tool Connectors

**Goal:** The same contract/run/review engine can execute non-code work and prove per-item outcomes with CoursePilot as the first real connector.

**Requirements**: TOOL-01, TOOL-02, TOOL-04.

**Depends on:** Phases 15 and 19.

**Implementation slices:** Connector manifest/preview/perform/reconcile/verify API; versioned schema and bounded source data; CoursePilot skill/runtime resolver and materials CLI parser; per-file verifier; partial/fatal result handling. Do not change CoursePilot's own implementation or credentials.

**Success Criteria** (what must be TRUE):

1. A generic fixture connector proves the engine can run an itemized task without assuming Git diffs or code tests.
2. A CoursePilot fixture with downloaded, planned, viewed-only, already-present and errored materials reports exact saved/unsaved counts, and verifies actual file existence for successes.
3. A partial exit keeps successful item evidence and queues only failed items; fatal/config/schema errors stop with a named next action.
4. A repeated run reconciles existing verified files and uncertain effects without duplicate downloads; malicious LMS text is treated as data.

**Verification:** Versioned JSON contract fixtures and bounded local CoursePilot dry-run/live test only where the user's account and approved task scope permit it.

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

## Planning and Execution Gates

For each phase, use `$gsd-discuss-phase N` (or approved `--auto` defaults), `$gsd-plan-phase N` with research and plan-check verification, `$gsd-review N` when the plan has cross-harness or safety impact, `$gsd-execute-phase N`, `$gsd-code-review`, and `$gsd-verify-work N`. Resolve `human_needed` with observed evidence or a real user test, never an invented pass. Use `$gsd-progress` to route incomplete work and `$gsd-audit-milestone` at closeout if surfaced; missing GSD skills are read through the installed GSD workflow and run inline only where the runtime contract permits it. The installed GSD Core remains the state authority.

**Release rule:** Phase summaries, automated tests, support receipts and reviewed completion criteria must agree. A green gate with no actual reviewer invocation is a failure. Candidate dependency changes remain in the candidate channel until their existing promotion gates pass.
