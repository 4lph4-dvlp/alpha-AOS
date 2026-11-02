# Requirements: alpha-AOS v0.6.0

**Milestone:** Predictable Task Entry and Shared Project Policy
**Defined:** 2026-11-02
**Status:** APPROVED — all 27 requirements and Phase 27–31 assignments approved by the user on 2026-11-02
**Core value:** Consistent, intentional agent workflows and capability boundaries across supported projects, operating systems and harnesses.

## Locked Scope Decisions

- Persist only project strict/flexible; missing policy defaults to strict.
- Every independent substantial strict task receives a fresh choice. A style is NEVER a project default. This supersedes the earlier interpretation explicitly corrected by the user.
- Continue a selected style within the same active task; later independent bug fixes receive a fresh chooser even if the release used another style.
- Exempt simple requests using common criteria, not only a closed list of task names.
- Preserve explicit style requests and direct GSD commands.
- Require real GSD initialization before substantial six-style execution, reusing the initial request.
- Retain exact autopilot consent, separate start, isolated runner, model policy and GSD single-writer ownership.

## v0.6.0 Requirements

### Shared Project Mode

- [ ] **MODE-01**: A user entering a project without a behavior policy receives strict intake by default, without an implicit configuration write.
- [ ] **MODE-02**: A user can change the project's strict/flexible mode through a natural-language request in any supported harness or the CLI, including before GSD initialization, and all harnesses consume that one project setting.
- [ ] **MODE-03**: A user can inspect the resolved project root, effective mode and configuration source/revision; the next task intake re-reads current policy rather than relying on a stale session value.
- [ ] **MODE-04**: A user can preview, apply and roll back mode changes through bounded, snapshotted transactions that preserve unrelated project settings.
- [ ] **MODE-05**: A user receives an actionable diagnostic for invalid or unreadable policy instead of silently falling back to flexible or another project.

### Predictable Task Intake

- [x] **ENTRY-01**: A user making a new substantial strict-mode request without an explicit style sees all six stable labels with concise descriptions and selects one before execution.
- [x] **ENTRY-02**: A user explicitly naming a task style proceeds with that style without the chooser; normal readiness and authority requirements still apply.
- [x] **ENTRY-03**: A user's choice applies only to that task: follow-up edits and verification continue without repeated selection, while later independent requests receive a fresh chooser.
- [x] **ENTRY-04**: A user requesting an operation with a clear target/result and no separate design, investigation or multi-stage implementation avoids chooser and forced initialization prompts; bounded push, simple rename and README translation/linking are acceptance examples.
- [x] **ENTRY-05**: A user can inspect a bounded reason for the intake decision; uncertain task scope receives a narrow clarification and a complex operation is not exempted by its task name alone.
- [x] **ENTRY-06**: A user choosing flexible mode receives existing adaptive conversational/autopilot intake behavior while explicit style and authority boundaries remain effective.
- [x] **ENTRY-07**: A user directly invoking a GSD command retains the selected workflow and timing without an unrelated six-style chooser; that command's native prerequisites and checkpoints remain intact.

### GSD Initialization and Request Continuity

- [x] **BOOT-01**: A user can distinguish missing GSD runtime, absent project, partial initialization and ready project from native prerequisite evidence before substantial workflow execution.
- [x] **BOOT-02**: A user requesting substantial work in an undefined project is guided into GSD new-project using facts already present in the request, with questions limited to missing information and required GSD decisions.
- [x] **BOOT-03**: A user with partial initialization receives the missing prerequisites and a GSD recovery path that preserves existing context instead of overwriting it or synthesizing placeholder artifacts.
- [x] **BOOT-04**: After initialization/recovery, a user's original request resumes once with its already selected style and known facts, without re-entering the request, repeating selection or bypassing remaining GSD checkpoints.

### Six Execution Styles

- [x] **STYLE-01**: A user selecting 대화형-quick receives native GSD quick in the current conversation with its documented optional-stage omissions and required state/commit gates.
- [x] **STYLE-02**: A user selecting 대화형-quick-full receives native GSD quick --full in the current conversation, including discussion, research, planning, plan checking, implementation and verification.
- [x] **STYLE-03**: A user selecting 대화형-phase receives GSD roadmap/phase progression in the current conversation with necessary user questions and native lifecycle gates.
- [x] **STYLE-04**: A user selecting 오토파일럿-quick receives ordinary quick through an approved exact contract and the existing isolated runner, with the selected style visible in the preview.
- [x] **STYLE-05**: A user selecting 오토파일럿-quick-full receives a contract-bound full quality pipeline: its preview/digest, dispatch and verification distinguish it from ordinary quick, and ordinary quick evidence alone cannot satisfy acceptance.
- [x] **STYLE-06**: A user selecting 오토파일럿-phase receives only approved roadmap/phase scope through the existing runner and GSD lifecycle bridge.
- [x] **STYLE-07**: A user's mode/style selection never substitutes for exact per-task autopilot contract approval and separate start, rewrites an approved running contract, or permits inline autopilot implementation/model substitution.

### Cross-Harness Evidence and Distribution

- [x] **PROVE-01**: A user can inspect scenario evidence for policy transitions and fresh independent-task selection across Claude, Codex, Antigravity, Pi and Hermes; native proof, fixture proof and unsupported/unverified behavior are reported distinctly.
- [x] **PROVE-02**: A user installing the packed artifact receives integrity-locked guidance for the shared policy and six routes, with discoverability and meaningful invocation evidence rather than file presence alone.
- [x] **PROVE-03**: A user can follow English and Korean documentation explaining both modes, all six styles, simple-operation criteria, initialization, task boundaries and direct-command behavior.
- [x] **PROVE-04**: A user can inspect targeted positive/negative behavioral checks and the final full regression outcome, with failed/not-run existing regressions preserved honestly rather than reported as passing.

## Stable Labels and Descriptions

| Label | Short explanation |
|---|---|
| 대화형-quick | 현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리 |
| 대화형-quick-full | 작은 작업에 토론·조사·계획 검사·구현·검증 적용 |
| 대화형-phase | 로드맵과 Phase를 따라 필요한 사항을 질문하며 진행 |
| 오토파일럿-quick | 승인된 계약과 별도 실행기로 작은 작업 처리 |
| 오토파일럿-quick-full | 승인된 범위에서 작은 작업의 전체 품질 절차 수행 |
| 오토파일럿-phase | 승인된 로드맵 범위의 Phase들을 자율 진행 |

## Future Requirements

- Configurable custom style catalogs or project style defaults are not requested; any future proposal requires explicit new scope.
- Additional host-specific UI conveniences can follow only after the common intake behavior and native capability evidence are established.

## Out of Scope

| Item | Reason |
|---|---|
| Persisting the selected style as project default | Explicitly rejected by user correction |
| Blanket future autopilot consent | Each task retains exact approval and separate start |
| A new lifecycle/state engine | GSD remains sole lifecycle owner |
| Dependency/GSD upgrades | Existing stack supports this change; unrelated promotion policy remains |
| Automatic installation/authentication of harnesses | Existing project boundary |
| Perfect semantic classification from arbitrary prose | Use common evidence, reasons and narrow clarification |
| New GUI/dashboard | Existing question UI and numbered text fallback suffice |
| Publishing, pushing, CI repair or global reconciliation | Prior holds remain; milestone planning does not authorize them |
| Silently clearing prior regression debt | Quick 261101-ww3 remains incomplete |

## Traceability

All 27 approved requirements map to exactly one owning phase in the user-approved roadmap. Phase assignments were approved on 2026-11-02; implementation remains pending.

| Requirement | Phase | Status |
|---|---|---|
| MODE-01 | Phase 27 | Pending |
| MODE-02 | Phase 27 | Pending |
| MODE-03 | Phase 27 | Pending |
| MODE-04 | Phase 27 | Pending |
| MODE-05 | Phase 27 | Pending |
| ENTRY-01 | Phase 28 | Complete |
| ENTRY-02 | Phase 28 | Complete |
| ENTRY-03 | Phase 28 | Complete |
| ENTRY-04 | Phase 28 | Complete |
| ENTRY-05 | Phase 28 | Complete |
| ENTRY-06 | Phase 28 | Complete |
| ENTRY-07 | Phase 28 | Complete |
| BOOT-01 | Phase 29 | Complete |
| BOOT-02 | Phase 29 | Complete |
| BOOT-03 | Phase 29 | Complete |
| BOOT-04 | Phase 29 | Complete |
| STYLE-01 | Phase 30 | Complete |
| STYLE-02 | Phase 30 | Complete |
| STYLE-03 | Phase 30 | Complete |
| STYLE-04 | Phase 30 | Complete |
| STYLE-05 | Phase 30 | Complete |
| STYLE-06 | Phase 30 | Complete |
| STYLE-07 | Phase 30 | Complete |
| PROVE-01 | Phase 31 | Complete |
| PROVE-02 | Phase 31 | Complete |
| PROVE-03 | Phase 31 | Complete |
| PROVE-04 | Phase 31 | Complete |

**Coverage:** 27 defined; 27 mapped exactly once; 0 unmapped. Requirements and roadmap approved. No implementation claimed.

*Last updated: 2026-11-02 after user approval of all 27 requirements and the five-phase roadmap.*
