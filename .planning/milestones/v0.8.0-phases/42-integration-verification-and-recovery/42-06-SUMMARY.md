---
phase: 42-integration-verification-and-recovery
plan: "06"
subsystem: release-lifecycle-cli
tags: [cli, flags, resume, cancel, recover, cleanup, preview-apply-binding, exit-codes, formatters]

requires:
  - phase: 42-05
    provides: resumeReleaseOperation, cancelReleaseOperation, recoverReleaseOperation, createReleaseCleanupPlan, applyReleaseCleanupPlan
provides:
  - Closed CLI update flags: --resume, --cancel, --recover, --cleanup with mutual exclusion and operand rejection (D-02, D-08)
  - Preview/apply digest and base64url token bindings preventing unreviewed mutation (D-03, D-14)
  - Accurate exit code routing: 0 (accepted/control-completed), 2 (invalid/stale/drift), 3 (verification-pending), 4 (update-failed-or-recovered), 5 (recovery-required) (D-08, D-12)
  - Formatted text output parity with typed JSON for lifecycle preview and result (D-02, D-12, D-14, D-15)
  - Bounded cleanup preview/apply distinguishing protected vs removable artifacts (D-14)
  - Retention-safe cancel command retaining active identity, evidence, and history (D-15)
affects: []

actuals:
  tokens: 28000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - Closed CLI flag parsing with mutual exclusion across lifecycle control modes (resume, cancel, recover, cleanup)
    - Review-bound token & plan digest enforcement on all lifecycle mutations
    - Exact candidate resume retaining persistent targets and skipping remote latest discovery (D-03)
    - Structured exit code mapping according to D-08 (0, 2, 3, 4, 5)
    - Honest text and JSON rendering for recovery diagnostics, residual effects, and next commands (D-12)
    - Safe artifact partitioning into protected vs removable sets with zero automatic deletion (D-14)
    - Cancellation marking terminal status while explicitly retaining binaries, evidence, and event history (D-15)

key-files:
  modified:
    - src/cli.ts
    - src/format.ts
    - src/core/release-recovery.ts
  created:
    - test/release-lifecycle-cli.test.ts

key-decisions:
  - "D-02: text/JSON preview는 verification checks, cost/permissions, affected actual harnesses, mutation/recovery scope를 같은 typed result에서 일관되게 표시한다"
  - "D-03: update --resume <operation-id> preview와 bound --apply command가 exact candidate validation을 재개하며 latest를 다시 선택하지 않는다"
  - "D-08: exit code 매핑: 0=accepted/control-completed, 2=invalid-or-stale, 3=verification-pending, 4=update-failed-or-recovered, 5=recovery-required"
  - "D-12: recovery-required text/JSON은 observed current identity/path/config, unknown fields, residual effects와 exact next recover command를 함께 표시한다"
  - "D-14: --cleanup <operation-id>는 read-only preview가 먼저이며 apply command는 exact removal/protected-set digest에 바인딩된다"
  - "D-15: --cancel <operation-id>는 cancelled result와 retained active/evidence/artifacts를 표시하고 deletion success처럼 렌더링하지 않는다"

patterns-established:
  - "Closed flag isolation: --resume, --cancel, --recover, --cleanup cannot be combined together or with --tool/--target, failing closed with exit 2"
  - "Strict exit code routing: Automated tooling receives honest status via process.exitCode (0, 2, 3, 4, 5) matching the domain outcome"
  - "Exact candidate resume: Resuming verification never touches remote registries and reuses persisted candidate metadata and validation results"

requirements-completed:
  - PROOF-01
  - PROOF-02
  - PROOF-03
  - PROOF-04

coverage:
  - id: CLI-RESUME-PREVIEW-01
    description: "update --resume <opId> is read-only preview and emits exact apply command"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/release-lifecycle-cli.test.js#Task 42-06-01 Test 1: update --resume <opId> is read-only preview and emits exact apply command"
        status: pass
  - id: CLI-RESUME-APPLY-02
    description: "bound apply resumes persisted exact candidate; exit code routing and stale token rejection (D-03, D-08)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/release-lifecycle-cli.test.js#Task 42-06-01 Test 2 & 3: bound apply resumes persisted exact candidate; exit code routing and stale token rejection (D-03, D-08)"
        status: pass
  - id: CLI-PARITY-03
    description: "default text and --json parity without secret exposure (D-02, T-42-19)"
    requirement: PROOF-01
    verification:
      - kind: integration
        ref: "dist/test/release-lifecycle-cli.test.js#Task 42-06-01 Test 4: default text and --json parity without secret exposure (D-02, T-42-19)"
        status: pass
  - id: CLI-EXCLUSION-04
    description: "--cancel, --recover, --cleanup mutual exclusion and operand rejection"
    requirement: PROOF-04
    verification:
      - kind: integration
        ref: "dist/test/release-lifecycle-cli.test.js#Task 42-06-02 Test 1: --cancel, --recover, --cleanup mutual exclusion and operand rejection"
        status: pass
  - id: CLI-CANCEL-05
    description: "cancel preview/apply retains active/evidence/artifacts and exits 0 (D-08, D-15)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/release-lifecycle-cli.test.js#Task 42-06-02 Test 2 & 4: cancel preview/apply retains active/evidence/artifacts and exits 0 (D-08, D-15)"
        status: pass
  - id: CLI-RECOVER-06
    description: "recover preview/apply reports recovered-failed exit 4 or recovery-required exit 5 (D-08, D-12)"
    requirement: PROOF-04
    verification:
      - kind: integration
        ref: "dist/test/release-lifecycle-cli.test.js#Task 42-06-02 Test 3: recover preview/apply reports recovered-failed exit 4 or recovery-required exit 5 (D-08, D-12)"
        status: pass
  - id: CLI-CLEANUP-07
    description: "cleanup preview/apply shows removable vs protected artifacts and exits 0 (D-14)"
    requirement: PROOF-04
    verification:
      - kind: integration
        ref: "dist/test/release-lifecycle-cli.test.js#Task 42-06-02 Test 4 & 5: cleanup preview/apply shows removable vs protected artifacts and exits 0 (D-14)"
        status: pass
---

# Plan 42-06 Summary: Lifecycle CLI Flags, Preview/Apply Bindings, and Exit Code Routing

Phase 42 Plan 06 exposes all verification, recovery, cancellation, and cleanup services through closed CLI flags on `alpha-aos update`, review-bound `--apply` commands, text/JSON parity formatting, and structured exit code routing.

## 1. Key Accomplishments

### Closed CLI Flag Routing & Mutual Exclusion
- Added `--resume`, `--cancel`, `--recover`, and `--cleanup` value flags taking an `<operation-id>`.
- Enforced mutual exclusion: multiple lifecycle flags, or combining lifecycle flags with `--tool`/`--target` operands or flags, fails closed with exit code 2 and explicit usage guidance.

### Review-Bound Mutation Enforcement
- Each lifecycle control without `--apply` produces a read-only preview with an exact `applyCommand` binding `--plan-digest <sha256>` and `--reviewed-plan <base64url-token>`.
- Supplying mismatched, corrupt, or stale tokens halts before mutation with exit code 2.

### Structured Exit Code Mapping (D-08)
- `0`: accepted / control operation completed successfully (`accepted`, `cancelled`, `cleanup-applied`).
- `2`: invalid arguments, plan digest mismatch, stale reviewed token, or state drift.
- `3`: candidate verification remains pending (`verification-pending`).
- `4`: attempted update failed or was restored to prior release (`failed-pre-apply`, `failed-post-apply`, `recovered-failed`).
- `5`: native recovery could not confirm prior active identity or requires user intervention (`recovery-required`).

### Honest Formatters (D-02, D-12, D-14, D-15)
- `formatReleaseLifecyclePreview`: Displays candidate release, status, affected harnesses, verification checks, cost/permissions, recovery scope, and exact apply command.
- `formatReleaseLifecycleResult`: Displays operation outcome, active identity (version, installation ID, path alias), residual effects, needed scope, batch tool recovery breakdown, and next recommended action.
- `--cleanup` preview explicitly separates protected artifacts (active, last-good, pending candidate, recovery) from removable candidates.
- `--cancel` reports active identity, evidence, and candidate artifacts as retained rather than deleted.

## 2. Verification Results
- 7 new CLI sub-process integration tests in `test/release-lifecycle-cli.test.ts` (all 7 passed in ~34s).
- Full Phase 42 test suite (91 tests across 7 test files) passed with 0 failures:
  - `release-verification.test.ts`
  - `release-lifecycle-store.test.js`
  - `release-recovery.test.js`
  - `release-lifecycle-cli.test.js`
  - `local-release-update.test.js`
  - `compatibility-adapters.test.js`
  - `tool-record-store.test.js`
- Full TypeScript strict typecheck (`npm run check`) passed with exit code 0.
