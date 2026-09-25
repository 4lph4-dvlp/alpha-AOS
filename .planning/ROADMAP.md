# Roadmap: alpha-AOS

## Milestones

- ✅ **v0.1.0 Vertical MVP** — Phases 1-9 (closed 2026-09-23, override closeout — see `.planning/MILESTONES.md`)
- ✅ **v0.1.1 CI Green & Dependency Promotion** — Phases 10-13 (completed 2026-09-25)

## Phases

<details>
<summary>✅ v0.1.0 Vertical MVP (Phases 1-9) — CLOSED 2026-09-23</summary>

- [x] Phase 1: Safe Operation Boundary (27/27 plans) — completed 2026-09-07
- [x] Phase 2: Evidence-Bound Project Planning (16/16 plans) — completed 2026-09-09
- [x] Phase 3: Transactional Project Packs and Native Optional Use (18/18 plans) — completed 2026-09-12
- [x] Phase 4: Mandatory GSD Gates (4/4 plans) — completed 2026-09-17
- [x] Phase 5: Persistent Tree-Off Preload Isolation (4/4 plans) — completed 2026-09-18
- [x] Phase 6: Managed Lifecycle, Uninstall, and Recovery (3/3 plans) — completed 2026-09-18, not formally verified
- [x] Phase 7: Cross-Platform Release Proof (7/7 plans) — completed 2026-09-20, gap G-07-2 open
- [x] Phase 8: Autonomous Project Pack Advisor and Cross-Harness Materializer (2/2 plans) — completed 2026-09-21
- [x] Phase 9: Unified Natural Language Controller and Capability Checkpoint Automation (2/2 plans) — completed 2026-09-21

Full detail: `.planning/milestones/v0.1.0-ROADMAP.md`

</details>

### ✅ v0.1.1 CI Green & Dependency Promotion

**Milestone Goal:** Restore a green three-OS CI on `main`, close the v0.1.0 lifecycle verification gap, and promote the validated dependency candidate into the stable lock on that green baseline.

**Phase Numbering:**

- Integer phases (10, 11, 12, 13): Planned milestone work, continuing from v0.1.0 Phase 9
- Decimal phases (10.1, 10.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 10: Three-OS CI Baseline** - Fix both red legs at their root cause and prove all three OS legs green in one `main` run (completed 2026-09-23)
- [x] **Phase 11: Managed Lifecycle Verification** - Give LIFE-01..08 an evidence-backed verification report, with unmet items recorded as named gaps (completed 2026-09-24)
- [x] **Phase 12: Red-Main Guard** - Surface a red `main` as a self-closing tracking issue and block candidate promotion while it is red (completed 2026-09-24)
- [x] **Phase 13: Dependency Candidate Promotion** - Refresh candidate PR #1 on green `main` and promote only the components with green, integrity-verified evidence (completed 2026-09-25)

## Phase Details

### Phase 10: Three-OS CI Baseline

**Goal**: Users can trust `main` CI again: each red leg is fixed at its diagnosed root cause, and one run proves ubuntu, macOS, and Windows green together.
**Depends on**: Nothing in this milestone (continues from v0.1.0 Phase 9)
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):

  1. On ubuntu-latest and macos-latest, `destinationFor resolves destinations across all five harnesses` passes with its fixture root built from the host platform's path APIs, and the suite fails if any test under `test/` asserts against a platform-specific absolute path literal.
  2. Running the packed release lifecycle (install, reconcile, diagnose, uninstall) on Windows leaves every real host managed path, including `~/.alpha-aos`, byte-identical before and after, and the host-path immutability assertion is unchanged unless the investigation proves the oracle itself wrong.
  3. The Windows `~/.alpha-aos` change has a recorded root cause, classified as a product isolation leak, a test-oracle defect, or a test-isolation leak, together with the evidence that decided it (which bytes changed and which lifecycle step wrote them).
  4. A regression test pins the diagnosed cause: it was observed failing against the unfixed code and passes against the fix.
  5. A single `main` CI run id shows ubuntu-latest, macos-latest, and windows-latest all green, with no leg individually re-run or taken from another run.

**Plans**: 4/4 plans executed (3 waves)

Plans:
**Wave 1**

- [x] 10-01-PLAN.md — CI-01: host-native `destinationFor`/ECC-root fixtures and a TS-AST path-literal guard over `test/*.ts` (wave 1)
- [x] 10-02-PLAN.md — CI-02 investigation: per-entry host drift diagnostics, local windows reproduction, classified root-cause record, three-class wording (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-03-PLAN.md — CI-02 fix: test-owned state roots for mcp-proxy, gate-engine and gate-lifecycle, each regression observed RED then GREEN (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10-04-PLAN.md — CI-03: push-triggered `main` proof run green on all three legs in one attempt, recorded in CI_RUN.md (wave 3)

**Planning note**: CI-02 is an investigation before it is a fix. Verified facts from run 35762417138 (`main` @ c6415a2): only the hash of the real `C:\Users\runneradmin\.alpha-aos` differs across the lifecycle, while every other host path stays `absent`; the POSIX legs fail only at `test/owned-skills.test.ts:52-53`. The red-matrix window is 638d3cc (last green, 2026-09-20) to f1ca570 (first red, 2026-09-21); whether the Windows failure began in that same window is not yet established. Loosening the assertion without a root cause is out of scope. The developer host is Windows, so CI-02 can be reproduced locally; CI-01 needs a POSIX leg to observe.

### Phase 11: Managed Lifecycle Verification

**Goal**: Users can consult a verification record that states, with inspectable evidence, whether each v0.1.0 Phase 6 managed-lifecycle promise actually holds.
**Depends on**: Phase 10
**Requirements**: LIFE-09
**Success Criteria** (what must be TRUE):

  1. User can open a Phase 6 verification report in which each of LIFE-01 through LIFE-08 carries a verdict backed by inspectable evidence (a command and its output, a named test and its result, or a CI run id) rather than a restated SUMMARY claim.
  2. The verdicts for the removal and host-safety requirements (LIFE-03, LIFE-04) reflect the Phase 10 root-cause classification: if the Windows change was a product isolation leak, the report names the requirement it violated and the fix and regression test that now cover it.
  3. Every LIFE requirement that is not met appears as a named gap stating what is missing and what would close it, instead of being marked verified.
  4. The v0.1.0 "LIFE-01..08 unverified" known gap in the project's milestone record is closed, or narrowed to exactly the report's named gaps.

**Plans**: 7/7 plans executed (3 waves)

Plans:
**Wave 1**

- [x] 11-01-PLAN.md — Tracer: packed-probe harness (sandbox helper, probe library, host guard) proven on LIFE-01 Codex reconcile; tarball-fixture oracle strengthened; Phase 6 suites and CI run 35818198049 corroboration; report skeleton (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-02-PLAN.md — LIFE-02: offline/fast status with a CLI-level I/O trap, coded doctor findings, doctor --discovery and --canary --no-spend per harness (wave 2)
- [x] 11-03-PLAN.md — Phase 13 gate evidence: LIFE-01 five-harness reconcile and LIFE-08 update preview/apply (wave 2)
- [x] 11-04-PLAN.md — LIFE-03: uninstall previews, one-target and full-stack uninstall, both project-pack routes, isolated runtime clean, pseudo-terminal confirmation (wave 2)
- [x] 11-05-PLAN.md — LIFE-04 receipts and applied-state refusal; LIFE-07 external changes and recovery instructions (wave 2)
- [x] 11-06-PLAN.md — LIFE-05 rollback exact bytes and drift refusal; LIFE-06 failpoint interruption, repair and restart (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 11-07-PLAN.md — Compile 06-VERIFICATION.md, register G-11 gaps, update MILESTONES and archived v0.1.0 records (wave 3)

**Planning note**: Editing the archived v0.1.0 records for this phase is approved (2026-09-23). Expected report location is beside the archived Phase 6 artifacts, `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md`. LIFE-02 canary evidence must not depend on a Claude Code real-host receipt; G-07-2 / REL-02 remains a future requirement, not this milestone's.

### Phase 12: Red-Main Guard

**Goal**: A red `main` cannot go unnoticed, and while it is red no dependency candidate can be presented as promotable.
**Depends on**: Phase 10
**Requirements**: CI-04, DEP-03
**Success Criteria** (what must be TRUE):

  1. When a `main` CI run finishes with any OS leg red, the user sees one tracking issue opened, or the existing one refreshed and never duplicated, naming the failing run id and the failing legs.
  2. When the next `main` CI run is green on all three legs, the tracking issue closes on its own and references the green run.
  3. When the dependency candidate workflow runs while the latest `main` baseline run is red, the candidate is marked promotion-blocked and the block names the failing `main` run; when the baseline is green, the candidate is not blocked.
  4. The guard decides from the conclusion of an actual completed `main` CI run: with no completed baseline run to read, it reports promotion as blocked rather than promotable.

**Plans**: 2/2 plans executed

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — Tracer: red-main-guard & check-main-baseline modules and unit test suites (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02-PLAN.md — Workflow integration (red-main-guard.yml, dependency-candidate.yml) & full suite verification (wave 2)

**Planning note**: The guard is mutable external automation, so its decision must be deterministic (no LLM judgment) and it should widen workflow permissions only as far as the issue and candidate-status writes require. `.github/workflows/dependency-candidate.yml` currently holds `contents: write` and `pull-requests: write`.

### Phase 13: Dependency Candidate Promotion

**Goal**: Users receive the validated dependency candidate in the stable lock, promoted only through the red-main guard on green three-OS evidence with verified integrity.
**Depends on**: Phase 11, Phase 12
**Requirements**: DEP-01, DEP-02
**Success Criteria** (what must be TRUE):

  1. Dependency candidate PR #1 is refreshed onto green `main`, passes the red-main guard unblocked, and its three-OS CI and fixture run is recorded by run id.
  2. Each of the five candidate components (GSD Core 1.14.0, ecc-universal 2.2.1, context7-mcp 4.1.1, firecrawl-mcp 3.25.2, pi-mcp-adapter 2.36.0) has a recorded per-component result covering its integrity check, fixture outcome, and three-OS outcome, with any failure named.
  3. `catalog/stack.lock.json` carries a candidate version only for components whose evidence is green, each with an integrity hash re-verified against the registry artifact; a failing component stays at its current stable version with the reason recorded.
  4. After the promotion lands, a single `main` CI run is green on all three OS legs with the packed release lifecycle exercising the promoted lock, and `alpha-aos update --apply` still reconciles only the stable lock, never the unverified `catalog/candidate.lock.json`.

**Plans**: 3/3 plans executed (3 waves)

Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Tracer: fixture hardening in `src/core/mcp-fixture.ts`, `scripts/promote-candidate.mjs` maintainer tool, and candidate pre-flight fixtures (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 13-02-PLAN.md — Remote baseline green, PR #1 rebase, Red-Main Guard unblocking, and 3-OS CI matrix run (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 13-03-PLAN.md — Partial candidate promotion, ECC 2.2.1 pack skill hash pinning, code/test sync, release hygiene, and PROMOTION-EVIDENCE.md (wave 3)

**Planning note**: The ecc-universal bump reaches past the lock. `ecc-universal@2.2.0` is named in `src/core/ecc-fixture.ts`, `src/core/mcp-proxy.ts`, `src/core/project-plan.ts`, `test/mcp-proxy.test.ts`, and `catalog/canaries.yaml`; the 19 pack skills are pinned from the 2.2.0 tarball via `pin-pack-skills.mjs`; and the CAPA-02 `narrow` finding is pinned to 2.2.0. Each must be re-derived for 2.2.1 or explicitly held back. GSD Core 1.14.0 may move GSD compatibility renderer hashes.

## Progress

**Execution Order:**
Phases execute in numeric order: 10 → 11 → 12 → 13. Phases 11 and 12 each depend only on Phase 10; Phase 13 needs both, so promotion runs through the guard and through a verified update/reconcile lifecycle.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 10. Three-OS CI Baseline | v0.1.1 | 4/4 | Complete    | 2026-09-23 |
| 11. Managed Lifecycle Verification | v0.1.1 | 7/7 | Complete    | 2026-09-24 |
| 12. Red-Main Guard | v0.1.1 | 2/2 | Complete    | 2026-09-24 |
| 13. Dependency Candidate Promotion | v0.1.1 | 3/3 | Complete    | 2026-09-25 |
