---
phase: 42-integration-verification-and-recovery
plan: "03"
subsystem: release-verification-barrier
tags: [barrier, pre-activation, multi-tool, shared-install, atomic-acceptance, postcheck, concurrency]

requires:
  - phase: 42-01
    provides: ReleaseVerificationResult, buildEvidenceDependencyFingerprint, verifyPreparedReleaseCandidate
  - phase: 42-02
    provides: release-lifecycle-store, appendReleaseLifecycleEvent, schemas/tool-release-lifecycle.schema.json
provides:
  - Global pre-activation verification barrier: evaluateReleaseVerificationBarrier
  - Atomic batch acceptance and post-activation invocation postcheck in applyLocalReleasePlan
  - Distinct structured non-success statuses: accepted, verification-pending, failed-pre-apply, failed-post-apply, recovery-required
  - Pre-barrier writer lock session protection (single-writer concurrency guarantee)
  - Fresh tool filter advice for partial progress (--tool flags)
affects: [42-04, 42-05, 42-06]

actuals:
  tokens: 16000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - Pre-activation verification barrier before any native mutation (D-05 ~ D-07)
    - Two-harness shared install matrix evaluation (Codex/Claude per-harness visibility)
    - Atomic batch acceptance on postcheck-pass only; unaccepted updates preserve accepted chain (D-08, T-42-09)
    - Single-writer session boundary wrapped around preflight checks (PROOF-03/concurrency)

key-files:
  modified:
    - src/core/release-verification.ts
    - src/core/update.ts
    - src/types.ts
    - test/local-release-update.test.ts

key-decisions:
  - "D-05: shared installation은 실제로 영향받는 모든 하네스의 필수 evidence가 pass한 뒤 한 번만 전환되며 각 하네스의 pass/pending/fail은 별도로 보인다"
  - "D-06: barrier membership은 current config/execution path로 실제 사용이 증명된 하네스만 포함하고 unknown membership은 전환을 보류한다"
  - "D-07: reviewed batch의 어느 tool 또는 actual affected harness 하나라도 pending/fail이면 아무 tool도 activate하지 않으며 부분 진행은 새 --tool preview가 필요하다"
  - "D-08: activate와 post-activation verification이 전부 끝난 operation만 accepted이며 pending, failed-pre-apply, failed-post-apply/recovered는 서로 다른 non-success status다"
  - "EDGE [PROOF-03/concurrency]: single-writer operation/session과 all-tool barrier 때문에 동일 tool을 포함한 두 apply가 동시에 active identity 또는 accepted transition을 바꿀 수 없다"

patterns-established:
  - "Global pre-activation verification barrier: No tool activation occurs unless all tools and all actual-use harnesses pass required tiers"
  - "Atomic acceptance chain invariant: acceptedTransitions are committed to tool-records finish event only when postcheck verification passes completely"
  - "Single-writer mutation guard: withToolRecordSession is acquired before barrier evaluation, rejecting concurrent writers before any native mutations"

requirements-completed:
  - PROOF-01
  - PROOF-02
  - PROOF-03

coverage:
  - id: BARRIER-01
    description: "Shared MCP candidate two-harness barrier with zero-call on pending/fail and single activation on all-pass (D-05, D-06)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-01 Test 1: shared MCP candidate with 2 actual-use harnesses (Codex pass / Claude pending) blocks activation with 0 calls, retaining old active identity (D-05, D-06)"
        status: pass
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-01 Test 2: shared MCP candidate when all actual harnesses pass activates once and passes postcheck (D-05)"
        status: pass
  - id: BARRIER-02
    description: "Unknown actual-use membership holds activation in pending with manual confirmation instructions (D-06)"
    requirement: PROOF-02
    verification:
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-01 Test 3: unknown actual-use membership holds activation in pending with confirmation guidance (D-06)"
        status: pass
  - id: BARRIER-03
    description: "Concurrent apply attempts are rejected by single-writer lock before any native mutation (PROOF-03/concurrency)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-01 Test 4: concurrent apply attempts are rejected by writer lock before native mutation (PROOF-03/concurrency)"
        status: pass
  - id: BARRIER-04
    description: "Multi-tool batch zero-activation on partial failure and fresh --tool advice (D-07)"
    requirement: PROOF-01
    verification:
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-02 Test 1: multi-tool batch zero-activation when any tool pending or failed, returns fresh --tool advice (D-07)"
        status: pass
  - id: BARRIER-05
    description: "Atomic batch acceptance with matching invocation proofs on all-pass postcheck (D-08)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-02 Test 2: all tools pass precheck and postcheck records atomic accepted transitions (D-08)"
        status: pass
  - id: BARRIER-06
    description: "Distinct structured non-success statuses and invariant accepted chain preservation (D-08, T-42-09)"
    requirement: PROOF-03
    verification:
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-02 Test 3: pending, failed-pre-apply, failed-post-apply, and accepted are distinct structured statuses (D-08)"
        status: pass
      - kind: integration
        ref: "dist/test/local-release-update.test.js#Task 42-03-02 Test 4: post-activation failure records failed-post-apply and keeps accepted chain intact (D-08, T-42-09)"
        status: pass
---

# Plan 42-03 Summary: Batch Barrier and Atomic Acceptance

## 1. 개요 및 달성 결과

Plan 42-03에서는 Phase 42의 핵심 안전 계약인 **글로벌 검증 배리어(`evaluateReleaseVerificationBarrier`)**와 **원자적 배치 수용(`applyLocalReleasePlan`)** 메커니즘을 완성하였습니다.

- **완료된 태스크:**
  1. `42-03-01`: shared MCP 설치의 two-harness pre-activation barrier 및 동시성 락 제어 (커밋: `c144954`).
  2. `42-03-02`: multi-tool atomic acceptance와 5가지 터미널 상태 구조화 (커밋: `c144954`).

## 2. 주요 구현 내역

### 2.1 글로벌 검증 배리어 (`src/core/release-verification.ts`)
- `evaluateReleaseVerificationBarrier`:
  - 선택된 모든 도구와 실제 영향받는 하네스(`inActualUse: true`)의 검증 상태를 수집.
  - 단 하나의 도구나 하네스라도 pending/fail일 경우 `allowedToActivate = false`를 발행하여 네이티브 전환을 전면 차단 (D-05, D-07).
  - 실제 사용 여부가 불명확한 하네스(`unconfirmedHarnesses`, `actualUseMembershipUnknown`)가 존재하면 정적 지원표를 기준으로 통과시키지 않고 보류(`pending`) 상태로 전환 (D-06).
  - 부분 성공 도구가 존재할 경우 신규 `--tool` preview 명령어를 안내하는 `toolFilterAdvice` 및 `nextCommand` 생성 (D-07).

### 2.2 사전 락 획득 및 전환·재검증 상태 머신 (`src/core/update.ts`)
- `applyLocalReleasePlan` 상태 전이 파이프라인:
  1. **사전 뮤테이션 세션 획득**: 배리어 검증 이전 `withToolRecordSession`을 획득하여 동시 실행 충돌 시 어떠한 네이티브 변경도 없이 즉시 거부 (PROOF-03/concurrency).
  2. **비활성 후보 검증 및 글로벌 배리어 평가**: 배리어 불통과 시 `applyManagedInstall` 호출 0회, 기존 활성 식별자 유지, `verification-pending` 또는 `failed-pre-apply` 반환.
  3. **네이티브 설치 적용**: 모든 도구/하네스 all-pass 시에만 1회 전환 실행 (`applyManagedInstall`).
  4. **전환 후 재검증(Postcheck)**: 실제 식별자 및 프록시 경계 호출(`PostcheckObservation`) 재확인.
  5. **원자적 Acceptance 기록**: 전체 성공 시에만 일치하는 invocation proof를 갖는 `acceptedTransitions`를 `finishToolOperation`에 전달하여 durable accepted chain 갱신 (D-08).
  6. **비성공 격리**: postcheck 실패 시 `failed-post-apply` 상태 및 `postcheck-failed` 생명주기 이벤트를 기록하고, `acceptedTransitions`를 빈 목록으로 유지하여 기존 acceptance chain 불변성 보장 (D-08, T-42-09).

### 2.3 구조화된 결과 상태 (`src/types.ts`)
- `ReleaseApplyStatus`: `accepted`, `verification-pending`, `failed-pre-apply`, `failed-post-apply`, `recovery-required`
- `ToolApplyResultDetail`: 도구별 활성/시도 식별자, 검증 결과, 하네스별 상세 결과 포함.

## 3. 검증 결과

- `npm run check`: TypeScript 엄격 검증 무오류 통과.
- `npm run build`: 빌드 및 아티팩트 매니페스트 생성 완료.
- 통합 테스트 스위트:
  - `dist/test/local-release-update.test.js`: 32개 테스트 통과 (신규 배리어/원자성 테스트 8건 포함).
  - `dist/test/release-verification.test.js`: 10개 테스트 통과.
  - `dist/test/tool-record-store.test.js`: 9개 테스트 통과.
  - 총 51개 테스트 전체 통과 (0 fail).
