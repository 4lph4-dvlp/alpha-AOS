---
phase: 42-integration-verification-and-recovery
plan: "04"
subsystem: release-recovery
tags: [recovery, adapter-native, rollback, postcheck-failure, reverse-order, scope-check, observation, integrity]

requires:
  - phase: 42-01
    provides: ReleaseVerificationResult, buildEvidenceDependencyFingerprint
  - phase: 42-02
    provides: release-lifecycle-store, appendReleaseLifecycleEvent
  - phase: 42-03
    provides: evaluateReleaseVerificationBarrier, applyLocalReleasePlan, postcheck failure handling
provides:
  - NativeReleaseAdapter interface and default implementations
  - recoverActivatedBatch executing reverse-order recovery across all switched tools (D-09, D-10)
  - Post-recovery actual active identity observation and verification (D-12)
  - Non-success preservation: recovery success keeps update failed without reactivating candidate (D-11)
  - reacquireReviewedPreviousArtifact with exact tuple SHA-512 verification and substitute rejection (D-16)
  - reconcileReleaseOperation for terminal state, interrupted state, and recovery guidance (D-03, D-12)
affects: [42-05, 42-06]

actuals:
  tokens: 18000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - Adapter-native rollback dispatch in reverse order of tool activation (D-09, D-10)
    - Two-layer recovery: native tool uninstallation/reversion plus owned file transaction rollback (D-09, D-12)
    - Independent observation: process exit code 0 is insufficient; actual active identity observation must confirm prior state (D-09, D-12)
    - Bounded recovery scope: unauthorized paths/tools stop mutations and yield recovery-required with residual effects (D-12, T-42-10)
    - Strict artifact reacquisition: exact reviewed identity (version + digest + integrity) reacquired; latest substitute rejected (D-16)

key-files:
  created:
    - src/core/release-recovery.ts
    - test/release-recovery.test.ts
  modified:
    - src/core/update.ts
    - src/types.ts

key-decisions:
  - "D-09: post-activation failure는 즉시 native tool adapter rollback과 alpha-AOS file rollback을 실행해 직전 active identity로 복원한다"
  - "D-10: multi-tool batch failure는 activation의 역순으로 복구를 시도해 의존성 충돌과 불완전 상태를 방지한다"
  - "D-11: rollback이 성공해도 이번 attempted update의 outcome은 여전히 failed이며 candidate를 accepted로 전환하거나 재활성화하지 않는다"
  - "D-12: 복구 성공 판단은 rollback 명령의 exit code 0만으로 하지 않고 복구 후 actual active identity를 다시 관찰해 이전 상태와 일치함을 검증한다"
  - "D-16: 이전 artifact가 로컬에 남아있지 않다면 최초 reviewed token에 기록된 동일 identity의 reviewed artifact만 다시 가져오며 latest로 대체하지 않는다"

patterns-established:
  - "Reverse-order batch recovery: Switched tools are rolled back in strict reverse order of activation"
  - "Identity verification over exit codes: Recovery is confirmed only when adapter.observeActiveIdentity() matches previous version/installation"
  - "Scope-bounded recovery: Any tool outside approved recovery scope halts mutations and reports structured residual effects"

requirements-completed:
  - PROOF-01
  - PROOF-02
  - PROOF-03

coverage:
  - id: RECOVER-01
    description: "One tool postcheck failure triggers immediate native recovery and restores previous identity (D-09)"
    requirement: PROOF-01
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-01 Test 1: one tool postcheck fails triggers immediate native recovery and restores previous identity (D-09)"
        status: pass
  - id: RECOVER-02
    description: "Actual identity observation confirms previous state; process exit 0 alone is rejected (D-09, D-12)"
    requirement: PROOF-01
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-01 Test 2: process exit alone is insufficient; actual identity observation must confirm previous state (D-09, D-12)"
        status: pass
  - id: RECOVER-03
    description: "Recovery success preserves failed status and does not reactivate candidate (D-11)"
    requirement: PROOF-01
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-01 Test 3: recovery success keeps attempted update failed and does not reactivate candidate (D-11)"
        status: pass
  - id: RECOVER-04
    description: "Recovery scope mismatch halts mutation and returns recovery-required with residual effects (D-12, T-42-10)"
    requirement: PROOF-02
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-01 Test 4: recovery scope mismatch stops mutation and returns recovery-required with residual effects (D-12, T-42-10)"
        status: pass
  - id: RECOVER-05
    description: "Multi-tool failure attempts native recovery in reverse order of activation (D-10)"
    requirement: PROOF-01
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-02 Test 1: multi-tool failure attempts native recovery in reverse order of activation (D-10)"
        status: pass
  - id: RECOVER-06
    description: "Unsupported capability declarations report explicit failure without claiming success (capability honesty)"
    requirement: PROOF-02
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-02 Test 2: unsupported capability declarations return explicit failure without claiming success (capability honesty)"
        status: pass
  - id: RECOVER-07
    description: "Previous artifact reacquisition accepts only exact reviewed tuple and rejects latest substitute (D-16)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-02 Test 3: missing previous artifact reacquisition accepts only exact reviewed tuple and rejects latest substitute (D-16)"
        status: pass
  - id: RECOVER-08
    description: "reconcileReleaseOperation reports terminal and interrupted states with exact next actions (D-03, D-12)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/release-recovery.test.js#Task 42-04-02 Test 4: reconcileReleaseOperation reports terminal and interrupted states with exact next actions (D-03, D-12)"
        status: pass
---

# Phase 42 Plan 04 Summary: Post-Activation Failure Recovery and Adapter-Native Rollback

Plan 42-04 establishes robust post-activation failure recovery and adapter-native rollback across all managed tools and affected harnesses according to decisions D-09, D-10, D-11, D-12, and D-16.

## Accomplishments
1. **Adapter-Native Rollback (`src/core/release-recovery.ts`)**:
   - Implemented `NativeReleaseAdapter` interface with support for candidate preparation, verification, activation, recovery, active identity observation, and residual effects classification.
   - Built `recoverActivatedBatch` which reverses tool activation order (D-10) and invokes adapter-specific rollback alongside owned file transaction rollbacks (D-09).
   - Enforced recovery scope bounds (D-12, T-42-10): unauthorized tools/paths immediately halt mutations and report `recovery-required` with structured residual effects.
   - Enforced actual observation verification (D-12): process exit code 0 is treated as a probe, but recovery is verified only if `observeActiveIdentity` confirms restoration of the previous identity.
   - Guaranteed non-success outcome (D-11): even when all tools recover to their prior state, `LocalReleaseApplyResult.status` remains `failed-post-apply` and candidate versions are never accepted or reactivated.
2. **Exact Previous Artifact Reacquisition**:
   - Implemented `reacquireReviewedPreviousArtifact` enforcing reviewed tuple matching (toolId, version, integrity, sourceUrl).
   - Rejects missing scope authorization and latest substitute releases (D-16).
3. **Interrupted & Terminal Operation Reconciliation**:
   - Implemented `reconcileReleaseOperation` reading release lifecycle events and tool records to distinguish completed/terminal operations from interrupted operations, deriving honest available actions (`canResume`, `canCancel`, `canRecover`, `canCleanup`).
4. **Integration with `applyLocalReleasePlan`**:
   - Connected `recoverActivatedBatch` into postcheck verification failure handling in `src/core/update.ts`, exposing structured `recoveryResult` on `LocalReleaseApplyResult`.
5. **Testing**:
   - Created comprehensive test suite in `test/release-recovery.test.ts` covering 8 specific requirements (all 8 pass; total 40 tests in test run pass).
