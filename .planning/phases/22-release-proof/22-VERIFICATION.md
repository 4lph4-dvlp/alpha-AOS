---
phase: 22-release-proof
verified: 2026-10-10T10:30:00Z
status: passed
score: 4/4 requirements verified across 6 plans
candidate_sha: 2c9d10526262ad3e50ee4096dde73f02ecd0874c
tarball_sha256: 30bbfc57d4268427549529bf9872ed75c1279e7d7da25d953272dc30c57d1ed5
release_version: 0.2.0
---

# Phase 22: Release Proof Verification Report

## Phase Goal
Phase 22 produces the v0.2.0 release proof across Windows, macOS, and Linux. It connects CI fault-injection controls, exact-version real-host role and capability receipts across five harnesses, packed sandbox lifecycle and host boundary zero-mutation verification, development and CoursePilot end-to-end workload examples, ordinary-GSD nonactivation, release documentation, and milestone closeout handoff.

---

## Requirements Coverage

| Requirement | Status | Verification Reference |
|---|---|---|
| **VER-01**: Three-OS CI run with five deliberate red/green fault controls (`crash`, `cancellation`, `concurrency`, `duplicate-effect`, `false-acceptance`), named assertion checks, and leg failure classification | PASS | `src/core/release-fault-proof.ts`, `scripts/release-evidence.mjs`, `test/release-fault-controls.test.ts` |
| **VER-02**: Exact-version 5-harness support matrix (35 cells), real-host receipts promotion, distinct real vs synthetic handoffs, Hermes worker boundary enforcement | PASS | `src/core/support-matrix.ts`, `src/adapters/task-receipts.ts`, `docs/SUPPORT_MATRIX_v0.2.0.md`, `22-LIVE-RECEIPTS.md`, `test/support-matrix.test.ts` |
| **VER-03**: Single-tarball packed sandbox install·doctor·uninstall lifecycle, stable channel gate and candidate refusal, host category zero-mutation proof with private path protection | PASS | `src/core/release-package-proof.ts`, `test/helpers/packed-sandbox.ts`, `test/tarball-fixture.test.ts`, `test/release-package-proof.test.ts`, `22-PACKAGE-RECEIPTS.md` |
| **VER-04**: End-to-end development (CLI game oracle) and CoursePilot workloads, reviewer witness digest parity, multi-level file identity preservation (`VER-04 edge adjacency`), and LMS fixture vs live boundary | PASS | `src/core/release-examples.ts`, `test/fixtures/release-development-game.mjs`, `test/release-examples.test.ts`, `22-EXAMPLES.md` |

---

## Success Criteria Verification

### 1. Release Evidence Engine & Ordinary GSD Non-Activation (Plan 22-01)
- **Status:** PASS
- **Evidence:** `src/core/release-evidence.ts` implements candidate identity binding and `evaluateOrdinaryGsdBoundary`. `test/release-evidence.test.ts` verifies that ordinary conversational GSD requests execute directly with zero supervisor runs and zero contract previews, while explicit autopilot requests route to read-only preview. `doctor --matrix` integration verified via `src/cli.ts` and `src/format.ts`.

### 2. Failure Verification & Fault Injection Controls (VER-01, Plan 22-02)
- **Status:** PASS
- **Evidence:** `src/core/release-fault-proof.ts` defines 5 named fault cases and evaluates three-OS leg results. `test/release-fault-controls.test.ts` verifies:
  1. `crash`: `assertReconciledEffects`
  2. `cancellation`: `assertChildWorkerTerminated`
  3. `concurrency`: `assertSingleActiveControllerLease`
  4. `duplicate-effect`: `assertEffectKeyDeduplicated`
  5. `false-acceptance`: `assertMandatoryCriteriaVerified`
  Non-zero exit codes alone are rejected; failures must occur at the exact expected named assertion. `scripts/release-evidence.mjs` validates CI metadata and classifies failure reasons. Version bumped to `0.2.0` across all metadata files.

### 3. Expanded 5-Harness Support Matrix & Handoffs (VER-02, Plan 22-03)
- **Status:** PASS
- **Evidence:** `src/core/support-matrix.ts` defines the complete 35-cell matrix (5 harnesses × 7 cells: controller, hook, executor, mcp, pack, skill, reviewer). Cells are promoted to `PROVEN` strictly via matching native invocation receipts with binary SHA-256 intact. Drifted binaries or missing receipts fall back to `UNVERIFIED` with actionable next steps. Hermes `controller` and `hook` cells are structurally fixed as `UNSUPPORTED`. 3 real-host proven handoffs are documented and separated from synthetic permutations. `docs/SUPPORT_MATRIX_v0.2.0.md` matches structured evaluator output byte-for-byte.

### 4. Packed Sandbox Lifecycle & Host Zero-Mutation Proof (VER-03, Plan 22-04)
- **Status:** PASS
- **Evidence:** `src/core/release-package-proof.ts` and `test/tarball-fixture.test.ts` prove that installing `alpha-aos-0.2.0.tgz` (`30bbfc57d4268427549529bf9872ed75c1279e7d7da25d953272dc30c57d1ed5`) into an isolated sandbox prefix, executing `install --apply`, `doctor --json`, and `uninstall --all --yes --apply --purge --json` leaves all 5 real-host managed directory categories (`managed_state`, `harness_config`, `harness_policy`, `skills`, `gsd_workflow`) 100% clean (0 additions, 0 deletions, 0 changes, 0 vanishings). Unexplained drift returns `indeterminate` (D-11), requiring identical tarball hash re-verification. Candidate lock injection is refused without modifying journals. Private paths are strictly scrubbed from public markdown (`22-PACKAGE-RECEIPTS.md`).

### 5. Development & CoursePilot End-to-End Workload Proofs (VER-04, Plan 22-05)
- **Status:** PASS
- **Evidence:** `src/core/release-examples.ts` and `test/release-examples.test.ts` evaluate both workloads:
  - Development workload: pure ES module CLI first-person game oracle (`test/fixtures/release-development-game.mjs`) verified with deterministic state transitions, reviewer witness digest parity, and required capability calls across harnesses.
  - CoursePilot academic workload: verifies multi-level course-week-module file identity preservation (`${courseId}:${weekId}:${moduleId}:${fileId}`), preventing filename collision (`VER-04 edge adjacency`); fixture downloads verified with SHA-256 integrity; live university LMS access preserved as `UNVERIFIED` (D-15).

### 6. Candidate Evidence Binding & Milestone Closeout Handoff (Plan 22-06)
- **Status:** PASS
- **Evidence:** Candidate source commit SHA `2c9d10526262ad3e50ee4096dde73f02ecd0874c` fixed. `docs/RELEASE_NOTES_v0.2.0.md`, `README.md`, and `README.ko.md` updated and synchronized. `.planning/phases/22-release-proof/22-RELEASE-EVIDENCE.md` binds the 6 gates into a single conjunction verdict. `.planning/phases/22-release-proof/22-CLOSEOUT-HANDOFF.md` establishes the post-phase sequence: Phase 22 verification, conversational UAT (`/gsd-verify-work 22`), phase code review (`/gsd-code-review`), resolution of historical Phase 19/20 verification artifacts, and milestone final audit (`/gsd-audit-milestone`).

---

## Automated Test Results

- **Release Proof Suites (5 files):** 50 tests passed, 0 failures.
  - `dist/test/release-evidence.test.js`: 11 passed
  - `dist/test/release-examples.test.js`: 10 passed
  - `dist/test/release-fault-controls.test.js`: 10 passed
  - `dist/test/release-package-proof.test.js`: 9 passed
  - `dist/test/support-matrix.test.js`: 10 passed
- **Packed Tarball Fixture:** 10 passed (full lifecycle + host category deltas)
- **Full Project Test Suite:** 1541 passed across all 35 suites.
- **Build Checks:** `npm run check`, `npm run build`, and `npm run build:check` (240 inputs, 476 outputs) passed cleanly.
