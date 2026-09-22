---
phase: 07-cross-platform-release-proof
plan: 02
subsystem: release-engineering
tags: [support-matrix, capability-ledger, canary-receipts, release-controls, doctor]

# Dependency graph
requires:
  - phase: 03-intent-driven-capability-packs-and-mcp
    provides: "Host capability ledger, invocation canaries, project-pack evidence, and MCP observation records"
  - phase: 05-directory-tree-policy-and-full-opt-out
    provides: "Managed/off tree policy and inspectable global-surface exclusion"
  - phase: 07-cross-platform-release-proof
    provides: "Plan 01 authoritative packed artifact and isolated lifecycle fixture"
provides:
  - "Receipt-backed four-tier v0.1.0 support matrix exposed through doctor table and JSON diagnostics"
  - "Byte-identical generated support documentation with Claude fixed to compatibility residue"
  - "Four paired positive/negative release controls with deterministic SHA-256 evidence receipts"
affects: [release, doctor, verification, support-documentation, phase-07]

tech-stack:
  added: []
  patterns:
    - "Eligible support claims downgrade to UNVERIFIED until a matching inspectable invocation receipt exists"
    - "Generated public evidence is updated only through an explicit environment gate and drift-tested during normal runs"

key-files:
  created:
    - src/core/support-matrix.ts
    - docs/SUPPORT_MATRIX.md
    - docs/RELEASE_CONTROLS.md
    - test/support-matrix.test.ts
    - test/release-controls.test.ts
  modified:
    - src/cli.ts
    - src/format.ts

key-decisions:
  - "Treat baseline PROVEN as claim eligibility, never live evidence; evaluation must downgrade it until a validated host invocation proof is present"
  - "Require positive polarity, invoked native use, successful oracle exit, retained observations, and a held invocation verdict before promotion to PROVEN"
  - "Keep Antigravity UNVERIFIED because the current closed capability-ledger schema cannot represent Antigravity invocation proofs"
  - "Generate release-control receipts from canonical credential-free evidence and a fixed release timestamp"

patterns-established:
  - "Support diagnostics read inventory and the host ledger without running canaries or mutating state"
  - "Paired acceptance evidence always records both polarities and hashes their canonical evidence objects"

requirements-completed: [REL-02, REL-03]

coverage:
  - id: D1
    description: "Four-tier support evaluation promotes active harness cells only from inspectable real-host invocation receipts and fixes Claude Code to RESIDUE"
    requirement: "REL-02"
    verification:
      - kind: unit
        ref: "test/support-matrix.test.ts#support taxonomy refuses false PROVEN states"
        status: pass
      - kind: unit
        ref: "test/support-matrix.test.ts#only an inspectable matching invocation receipt promotes an active cell to PROVEN"
        status: pass
    human_judgment: false
  - id: D2
    description: "doctor --matrix provides terminal and JSON reports while SUPPORT_MATRIX.md remains byte-identical to structured source"
    requirement: "REL-02"
    verification:
      - kind: integration
        ref: "test/support-matrix.test.ts#compiled doctor exposes table and structured matrix diagnostics"
        status: pass
      - kind: unit
        ref: "test/support-matrix.test.ts#support matrix markdown stays byte-identical to the structured source"
        status: pass
    human_judgment: false
  - id: D3
    description: "Optional invocation, project scope, mandatory gates, and tree-off each carry passing positive and negative controls with deterministic evidence hashes"
    requirement: "REL-03"
    verification:
      - kind: integration
        ref: "test/release-controls.test.ts#four release-control domains carry paired positive and negative evidence"
        status: pass
      - kind: other
        ref: "npm test (879 tests, 870 pass, 0 fail, 9 skipped)"
        status: pass
    human_judgment: false

# Metrics
duration: 24min
completed: 2026-09-20
status: complete
---

# Phase 07 Plan 02: Receipt-Backed Support Matrix and Release Controls Summary

**Fail-closed host receipt evaluation now drives support diagnostics, while eight paired acceptance receipts make release controls inspectable without dirtying generated documentation.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-09-19T17:28:31Z
- **Completed:** 2026-09-19T17:52:32Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added the official v0.1.0 structured support ledger and four-tier evaluator, with `PROVEN` reachable only through matching positive invocation evidence retained in the host capability ledger.
- Exposed read-only `alpha-aos doctor --matrix` terminal and JSON diagnostics, including explicit unreadable-ledger demotion rather than false success.
- Published deterministic support and release-control documents, backed by byte-drift assertions and an update path gated by `UPDATE_RELEASE_CONTROLS=1`.
- Proved paired positive and negative behavior for Context7 invocation, canonical project scope, mandatory security gates, and complete tree-off exclusion.

## Task Commits

1. **Task 1: Versioned support matrix, receipt overlay, and CLI diagnostics**
   - `f7d406e` — failing support matrix contract tests (RED)
   - `211b543` — receipt-backed matrix engine, CLI/table output, and generated documentation (GREEN)
2. **Task 2: Paired release controls and evidence ledger**
   - `36e3a49` — failing paired-control and documentation-drift suite (RED)
   - `004ca5d` — deterministic public release-control evidence ledger (GREEN)

**Plan metadata:** committed separately with this summary and sequential GSD tracking updates.

## Files Created/Modified

- `src/core/support-matrix.ts` — immutable release ledger, receipt validation, four-tier evaluator, and Markdown renderer.
- `src/cli.ts` — read-only `doctor --matrix [--json]` dispatch and mutually exclusive doctor modes.
- `src/format.ts` — terminal matrix table with TTY-aware tier coloring and `NO_COLOR` support.
- `docs/SUPPORT_MATRIX.md` — canonical fail-closed v0.1.0 matrix generated from structured source.
- `test/support-matrix.test.ts` — taxonomy, receipt promotion, CLI, and byte-drift verification.
- `test/release-controls.test.ts` — four positive/negative control pairs, canonical receipt hashing, guarded generation, and no-write assertion.
- `docs/RELEASE_CONTROLS.md` — eight deterministic acceptance receipts and verification methodology.

## Decisions Made

- `baselineTier: PROVEN` states release eligibility, not observed host truth. Missing detection or missing receipt always evaluates to `UNVERIFIED`.
- A ledger row alone is insufficient for promotion: it must be positive, invoked, unblocked, successful, retain at least one redacted observation, and carry a held invocation verdict.
- Antigravity is not promoted through inference. Its current ledger schema explicitly cannot represent an Antigravity proof, so relevant cells remain `UNVERIFIED` until that evidence model changes.
- Public acceptance timestamps are fixed release metadata; ordinary test wall-clock time never enters committed documentation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Replaced the plan's nonexistent `outcome === "verified"` predicate with the repository's complete proof contract**
- **Found during:** Task 1
- **Issue:** `CapabilityProof` has no `outcome` field; trusting a loose row match would promote incomplete, blocked, discovery-only, or observation-free evidence.
- **Fix:** Required positive polarity, `nativeUse: "invoked"`, no block, exit code zero, a held invocation verdict, retained observations, and a valid observation timestamp.
- **Files modified:** `src/core/support-matrix.ts`, `test/support-matrix.test.ts`
- **Verification:** False-PROVEN and receipt-overlay tests pass; full suite passes.
- **Committed in:** `211b543`

---

**Total deviations:** 1 auto-fixed (1 missing critical integrity check).
**Impact on plan:** The adjustment maps the requested evidence rule onto the actual closed ledger schema and makes promotion stricter, without widening scope.

## Issues Encountered

- The first full-suite run wrote its live log inside the repository while preview tests hashed the checkout, producing four artificial checkout-digest failures. The plan-owned suites stayed green. Rerunning the identical full suite with its log under the system temporary directory passed all 879 tests (870 passed, 9 platform/live skips, 0 failed).

## Verification

- `npm run check` — passed.
- `npm run build` — passed (112 inputs, 218 outputs).
- `node scripts/run-tests.mjs --files dist/test/support-matrix.test.js dist/test/release-controls.test.js` — 5 passed, 0 failed.
- Generated-document hash comparison before and after normal tests — both documents unchanged.
- `npm test` — 879 tests: 870 passed, 0 failed, 9 skipped, 0 todo.
- `git diff --check` — passed.

## Authentication Gates

None.

## Known Stubs

None. Empty arrays and nulls in test fixtures and report types are intentional explicit absence states, not unwired user-facing data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-03 can consume the support and release-control artifacts as the release-proof contract for its brownfield GSD cycle.
- Hosted real-host canary execution remains the only legitimate way to move active host cells from `UNVERIFIED` to `PROVEN`; this plan deliberately does not fabricate those receipts.
- Antigravity stays visibly `UNVERIFIED` until an inspectable invocation-proof shape exists for that harness.

## Self-Check: PASSED

- All seven declared implementation artifacts and this summary exist.
- All four RED/GREEN task commits resolve in Git.
- Summary frontmatter records `status: complete`, and `git diff --check` reports no whitespace errors.

---
*Phase: 07-cross-platform-release-proof*
*Completed: 2026-09-20*
