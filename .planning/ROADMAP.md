# Roadmap: alpha-AOS

## Milestones

- ✅ **v0.1.0 Vertical MVP** — historical closeout; [archived roadmap](milestones/v0.1.0-ROADMAP.md).
- ✅ **v0.1.1 CI Green & Dependency Promotion** — historical closeout; [archived roadmap](milestones/v0.1.1-ROADMAP.md).
- **v0.2.0 Universal Autonomous Work** — outgoing Phases 14–26 archived under [roadmap](milestones/v0.2.0-ROADMAP.md) and `milestones/v0.2.0-phases/`; archival is not a new release/verification claim. Prior release holds and quick-task regression debt remain.
- 📋 **v0.6.0 Predictable Task Entry and Shared Project Policy** — Phases 27–31; requirements and roadmap approved on 2026-11-02; implementation not started.

## v0.6.0 Predictable Task Entry and Shared Project Policy

### Overview

Users receive predictable task intake across Claude Code, Codex, Antigravity, Pi and Hermes. One project setting persists strict/flexible, defaulting to strict. Each independent substantial strict task asks for one of six styles; a prior choice never becomes a project default. Simple operations and explicit user choices avoid unnecessary questions. Substantial work enters real GSD initialization/recovery when needed and then resumes the original request. Six conversational/autopilot routes reuse GSD and the existing runtime, including actual quick-full quality binding.

**Status:** APPROVED — all 27 requirements and this five-phase roadmap approved by the user on 2026-11-02. No phase implementation or detailed execution plans have started. Milestone numbering follows the approved v0.6.0 scope; this does not bump package.json or authorize publication.

## Phases

- [x] **Phase 27: Shared Project Behavior Policy** — One safe, current project authority for strict/flexible, including natural-language changes before GSD initialization. (completed 2026-11-02)
- [x] **Phase 28: Predictable Strict and Flexible Intake** — Common decision reasons, task-scoped chooser, simple-operation exemptions and explicit-command precedence. (completed 2026-11-02)
- [ ] **Phase 29: GSD Initialization and Request Continuity** — Native readiness diagnostics, non-destructive bootstrap/recovery and single resumption of the original request.
- [x] **Phase 30: Six Execution Styles and Quality Binding** — Real conversational/runner routing and contract-bound quick-full execution/evidence. (completed 2026-11-03)
- [ ] **Phase 31: Cross-Harness Proof and Distribution** — Cross-harness scenarios, packed guidance integrity, bilingual docs and actual final regression results.

## Phase Map

| Phase | Requirements | Count | Depends on |
|---|---|---:|---|
| 27 | MODE-01, MODE-02, MODE-03, MODE-04, MODE-05 | 5 | Existing transaction, project-root and owned-skill services |
| 28 | ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04, ENTRY-05, ENTRY-06, ENTRY-07 | 7 | 27 |
| 29 | BOOT-01, BOOT-02, BOOT-03, BOOT-04 | 4 | 27, 28 |
| 30 | STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05, STYLE-06, STYLE-07 | 7 | 28, 29 |
| 31 | PROVE-01, PROVE-02, PROVE-03, PROVE-04 | 4 | 27, 28, 29, 30 |

Every requirement has exactly one owning phase. Later integration verification reuses earlier behavior without changing requirement ownership.

## Phase Details

### Phase 27: Shared Project Behavior Policy

**Goal:** A user can inspect and change one project-scoped strict/flexible setting from any supported harness, including before project initialization, and the next intake sees the current value.
**Depends on:** Nothing in this milestone; reuse existing transaction, path-boundary, validation and owned-skill services.
**Requirements:** MODE-01, MODE-02, MODE-03, MODE-04, MODE-05
**Success Criteria** (what must be TRUE):
  1. A project with no policy resolves to strict without creating configuration or GSD files; only the mode, never a selected style, is a project preference.
  2. A user can request a mode change in natural language or CLI before GSD initialization, and a second harness resolves the same project setting without repeating the instruction.
  3. A user can inspect effective mode, canonical root and source/revision; an existing session re-reads a later change at its next task intake.
  4. Mode mutations are previewable, root-bounded, snapshotted and rollback-aware, preserve unrelated settings, and reject stale reviewed input where applicable.
  5. Invalid/unreadable policy and wrong-root conditions produce actionable errors instead of silent flexible or cross-project fallback.

**Plans:** TBD — created by plan-phase after discussion.

**Planning focus:** Decide policy filename/schema and actual project-root resolution without coupling behavior configuration to GSD initialization or pack trust. Include minimal native mode-change routing and owned-skill integrity updates in this phase; do not defer MODE-02 to final proof.
**Validation emphasis:** Missing-policy read with zero writes; policy-only request in an uninitialized project; two-host mode handoff; stale-session re-read; malformed/wrong-root inputs; rollback preserving unrelated bytes.

### Phase 28: Predictable Strict and Flexible Intake

**Goal:** A user can predict why alpha-AOS asks for a task style, reuses a current selection, honors an explicit instruction or skips the chooser for a simple operation.
**Depends on:** Phase 27
**Requirements:** ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04, ENTRY-05, ENTRY-06, ENTRY-07
**Success Criteria** (what must be TRUE):
  1. A new substantial strict task presents all six exact labels with concise descriptions; a user's selection applies to that task, and a later independent task asks again.
  2. Follow-up edits and verification within the active task retain its style without repeated questions; completion/cancellation does not leave a default for future work.
  3. A named style skips selection while a directly invoked GSD command preserves its selected workflow/timing and native prerequisites; an explicit full-style request is not downgraded by a simple-operation exemption.
  4. Bounded push, simple rename and README translation/linking skip chooser and forced bootstrap; a cross-subsystem rename needing investigation does not pass on its name alone. A user can see the decision reason and receives only necessary clarification for uncertain scope.
  5. Flexible mode preserves adaptive intake, while neither mode nor classification weakens normal effect authority, tree-off boundaries or exact autopilot consent.

**Plans:** 6/6 plans complete in 6 sequential waves; checks complete, planning commit blocked by Git index write permission; execution pending.
**Wave 1**
- [x] 28-01-PLAN.md — Strict intake CLI tracer, bounded versioned interchange and exact six-style chooser.

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 28-02-PLAN.md — Explicit GSD command/style precedence and narrow partial/conflicting intent.

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 28-03-PLAN.md — Exact current-task continuity and task-scoped pending-selection lifetime.

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 28-04-PLAN.md — Evidence-backed simple operations, narrow clarification and WIP-preserving escalation.

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 28-05-PLAN.md — Common owned-skill routing across five targets, integrity and user contract.

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 28-06-PLAN.md — End-to-end acceptance, honest native evidence and final regression gate.

**Cross-cutting constraints:**
- Every intake rereads the current canonical policy and grants no execution authority.

**Planning focus:** Define the shared typed decision and evidence criteria, including explicit command, explicit style, continuation, simple operation, substantial work and clarification-needed. Define current-task identity without persisting style as a project preference or relying on unbounded transcripts.
**Validation emphasis:** Release uses autopilot-phase, later independent bug fix asks again and chooses autopilot-quick-full; active-task test repair does not ask; meaningful simple/complex twins; native question UI and numbered text fallback.

### Phase 29: GSD Initialization and Request Continuity

**Goal:** A user requesting substantial work in an absent or incomplete GSD project is guided through the appropriate native initialization/recovery and resumes the original request without duplication or context loss.
**Depends on:** Phase 27, Phase 28
**Requirements:** BOOT-01, BOOT-02, BOOT-03, BOOT-04
**Success Criteria** (what must be TRUE):
  1. A user can distinguish missing runtime, absent project, partial initialization and ready project using the installed GSD's prerequisites rather than directory or PROJECT.md presence alone.
  2. For an absent project, GSD new-project receives facts already supplied in the original request and asks only for missing information and native mandatory decisions.
  3. Partial initialization names missing prerequisites and invokes a GSD recovery path that preserves existing context; no empty placeholders or silent overwrites manufacture readiness.
  4. After bootstrap/recovery, the original request and its selected style resume once without retyping, a second chooser or duplicate implementation. Required GSD checkpoints and autopilot review remain intact.
  5. A simple exempt operation or policy-only change avoids forced initialization, while cancellation/interruption of substantive initialization leaves an honest resumable checkpoint and does not start the pending task.

**Planning focus:** Keep GSD the sole lifecycle/state authority. Select a minimal bounded pending-request handoff that does not become a second phase/task lifecycle. Inspect version-specific readiness capabilities before implementation.
**Validation emphasis:** One real conversational-quick bootstrap/resume tracer, incomplete-project negative fixtures, interruption/re-entry without duplication, and preserved style identity for all later dispatch routes.

**Plans:** 6/6 plans executed and verified in 6 sequential waves (executed 2026-11-02; verification passed).

**Wave 1**

- [x] 29-01-PLAN.md — Native readiness diagnosis through the public CLI, with workflow/version and compatibility checks.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 29-02-PLAN.md — Bounded original-request handoff, known-fact native input and preview-bound persistence.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 29-03-PLAN.md — Non-destructive partial/archive/history recovery and WIP preservation.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 29-04-PLAN.md — Exact claim/link/acceptance reconciliation, crash/cancel races and retained consent.

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 29-05-PLAN.md — Shared five-target routing, source/target integrity and minimal user guidance.

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 29-06-PLAN.md — Composed acceptance, blocking real native quick tracer and actual full regression.

**Cross-cutting constraints:**

- GSD alone owns lifecycle/state; readiness and a restored style grant no execution or autopilot approval.

**Execution checkpoint:** 29-06 retains required native invocation proof. Missing capability/authority/receipt blocks Phase 29 completion; fixture success does not defer that proof to Phase 31. This planning run stops before execute-phase.

### Phase 30: Six Execution Styles and Quality Binding

**Goal:** Each selected style controls actual GSD workflow, execution surface and required evidence; full-quality autopilot work cannot silently execute or pass as ordinary quick.
**Depends on:** Phase 28, Phase 29
**Requirements:** STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05, STYLE-06, STYLE-07
**Success Criteria** (what must be TRUE):
  1. 대화형-quick, 대화형-quick-full and 대화형-phase invoke their actual native workflows in the current conversation, including required questions, state/commit gates and full-mode quality stages.
  2. 오토파일럿-quick, 오토파일럿-quick-full and 오토파일럿-phase expose the selected route/scope in a concrete contract preview and execute only through the existing approved isolated runner.
  3. Autopilot quick-full binds quality selection into contract/digest, drift/reapproval comparison and --full dispatch; acceptance refuses ordinary-quick-only or incomplete full-stage evidence, without breaking existing approved contract semantics.
  4. A style selection never grants exact-contract approval or separate start, weakens approved harness/model assignments, authorizes inline autopilot implementation, or rewrites an already running contract when the project's mode changes.
  5. Autopilot-phase stays within the approved roadmap/phase scope and GSD lifecycle bridge; all six routes preserve GSD ownership and existing capability/review/verification gates, with unsupported routes reported explicitly rather than silently substituted.

**Plans:** 8/8 plans complete in 8 sequential waves; 0 executed. Inline research/planning/checking was explicitly requested. Required native checkpoint remains in 30-08; this planning invocation stops before execute-phase.
**Wave 1**
- [x] 30-01-PLAN.md — Public conversational route projection, exact direct commands and bootstrap continuity.

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 30-02-PLAN.md — Compatible quick quality contract/digest/preview and full native dispatch/preflight.

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 30-03-PLAN.md — Observed native stage receipts, bounded provenance and exact evaluated revisions.

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 30-04-PLAN.md — Mandatory full acceptance and exact partial-run/WIP recovery.

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 30-05-PLAN.md — Approved ordered phase scope and remaining-slice lifecycle progression.

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 30-06-PLAN.md — Owned six-route guidance, five-target integrity and operational boundaries.

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 30-07-PLAN.md — Composed six-route fixtures, native proof verifier and final regression gate.

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 30-08-PLAN.md — Blocking actual native six-route/full-stage verification checkpoint.

**Cross-cutting constraints:**
- GSD alone owns lifecycle/state; route projections and evidence receipts grant no execution authority.

**Execution checkpoint:** 30-08 requires actual native invocation/result proof and applicable exact scratch authority; unsupported capability, missing approval/start or unverified full stages block completion. Fixture success does not defer this proof to Phase 31. Fresh independent implementation review remains mandatory. Planning authorization does not start any plan.

**Planning focus:** Decide backward-compatible quality metadata and sufficient full-stage evidence; reuse task-contract, quick runner and phase lifecycle bridge. Update source/five-target owned-skill hashes whenever guidance changes.
**Validation emphasis:** Six-route invocation matrix; tampered quality/digest; unsupported capability; missing full evidence; approval without start; mode change during an approved run; existing contract compatibility.

### Phase 31: Cross-Harness Proof and Distribution

**Goal:** A user can install and understand the new behavior and inspect honest evidence that project mode, per-task selection, initialization and execution compose across supported harnesses.
**Depends on:** Phase 27, Phase 28, Phase 29, Phase 30
**Requirements:** PROVE-01, PROVE-02, PROVE-03, PROVE-04
**Success Criteria** (what must be TRUE):
  1. An inspectable matrix covers Claude, Codex, Antigravity, Pi and Hermes, including Codex sets flexible → Antigravity consumes it → Pi sets strict → an existing Codex session sees strict; native, fixture and unsupported/unverified results are clearly distinguished.
  2. A release task followed by an independent bug fix proves a fresh choice; the composed absent/partial-project scenarios preserve request/style identity and exact autopilot authority.
  3. The packed artifact contains integrity-locked shared guidance and all six routes, with meaningful discovery/invocation checks rather than file-presence-only claims.
  4. English and Korean documentation explains both modes, six styles, exception criteria, task boundaries, initialization and direct commands, including real support limitations.
  5. Targeted positive/negative checks and the final full regression have recorded actual outcomes. Failed/not-run prior regressions are not counted as passed or waived; required failures block affected acceptance and remediation must stay explicitly scoped.

**Plans:** TBD — created by plan-phase after discussion.

**Planning focus:** Define representative native receipts and paid-call-free fixtures before advertising parity. Previous release holds remain; this milestone does not implicitly authorize paid canaries, global reconciliation, push, CI repair or publication.
**Validation emphasis:** Public CLI/skill/runner flows, native handoff receipts where authorized, packed install behavior, existing quick/phase compatibility, full regression and independent review.

## Progress

**Execution Order:** 27 → 28 → 29 → 30 → 31. Phase 30 has eight checked plans in eight sequential waves. This planning update stops before execute-phase and does not plan later phases; historical phase completion and outstanding regression evidence remain in STATE and each phase's verification artifacts. The older Phase 27/29 progress rows below have not been reconciled in this Phase 30 planning slice; their recorded verification artifacts remain authoritative evidence.

| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 27. Shared Project Behavior Policy | 0/TBD | Not started | - |
| 28. Predictable Strict and Flexible Intake | 6/6 | Complete    | 2026-11-02 |
| 29. GSD Initialization and Request Continuity | 0/6 | Planned | - |
| 30. Six Execution Styles and Quality Binding | 8/8 | Complete    | 2026-11-03 |
| 31. Cross-Harness Proof and Distribution | 0/TBD | Not started | - |

## Planning and Execution Gates

- Only the corrected 27 approved v0.6.0 requirements define this roadmap. Every requirement maps to one phase; no scope expansion is implied by research suggestions.
- Each phase follows GSD discussion → research as applicable → plan → plan check → execute → verify/review and required project gates. This roadmap does not waive checkpoints or authorize autopilot execution.
- Use existing code, versioned schemas, native adapters and transaction services. No dependency/manifest changes are planned; if setup changes become necessary, invoke alpha-aos-control under its own scope.
- GSD alone owns lifecycle/state. ECC memory carries inspectable handoff context, never authoritative policy or approval. Project policy stores only strict/flexible, never selected style.
- Check actual host capabilities. Unsupported parity remains explicit. Missing authority, native proof or quality evidence cannot be simulated.
- Preserve the prior quick 261101-ww3 worker-startup failure and four not-run suites until actually resolved/validated under scoped work. Keep release/macOS CI/push/global-apply/publication holds.
- Run targeted checks during implementation and the full suite at final acceptance, repeating only when justified. Do not mark incomplete evidence complete.

*Approved: 2026-11-02. Requirements and roadmap user approval complete; phase implementation pending.*
