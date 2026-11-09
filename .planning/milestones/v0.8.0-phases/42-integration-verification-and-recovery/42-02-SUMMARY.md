---
phase: 42-integration-verification-and-recovery
plan: "02"
subsystem: release-lifecycle-store
tags: [lifecycle, schema, append-only, idempotency, retention, recovery]

requires:
  - phase: 42-01
    provides: ReleaseVerificationResult, buildEvidenceDependencyFingerprint
provides:
  - Closed append-only schema: schemas/tool-release-lifecycle.schema.json
  - Durable lifecycle store: planReleaseLifecycleOperation, appendReleaseLifecycleEvent, readReleaseLifecycle
  - Idempotent event appending with drift detection and terminal transition guards
  - Protected artifact references derivation: deriveProtectedReleaseArtifacts
affects: [42-03, 42-04, 42-05, 42-06]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - Separate append-only lifecycle event store (userStateRoot()/tool-release-lifecycle/v1/operations/<opId>/events/<seq>.json)
    - Closed schema validation without credential or raw-arg persistence
    - Strict monotonic sequence & terminal idempotency
    - Multi-generational protected artifact reference derivation (D-14, D-15)

key-files:
  created:
    - schemas/tool-release-lifecycle.schema.json
    - src/core/release-lifecycle-store.ts
    - test/release-lifecycle-store.test.ts
  modified:
    - src/core/validation.ts

key-decisions:
  - "D-03: pending lifecycle은 exact candidate identity와 resume command inputs를 내구성 있게 보존하며 최신 버전 재선택으로 변질되지 않음"
  - "D-04: evidence dependency fingerprint와 각 tier 판정이 append-only lifecycle event에 남아 재개 시 동일 조건 검증 가능"
  - "D-14: active, last-good, pending 및 recovery 작업에 필요한 artifact reference와 모든 metadata/history는 protected set에 포함되어 자동 삭제되지 않음"
  - "D-15: cancellation은 terminal lifecycle event만 추가하고 기존 active identity, evidence, candidate artifact reference와 history를 절대 삭제하지 않음"

patterns-established:
  - "Separation of lifecycle records from acceptance events: tool-records maintains strict accepted proof chain while release-lifecycle tracks operational state transitions"
  - "Idempotent event append: identical content replay succeeds as no-op; content drift or out-of-order sequence fails closed"

requirements-completed:
  - PROOF-02
  - PROOF-03
  - PROOF-04

coverage:
  - id: LIFE-01
    description: "별도 closed lifecycle schema 및 pending/verification event append/read 왕복 (PROOF-02, D-03)"
    requirement: PROOF-02
    verification:
      - kind: unit
        ref: "dist/test/release-lifecycle-store.test.js#Task 42-02-01 Test 1: writes started -> evidence-recorded -> verification-pending lifecycle events with exact metadata"
        status: pass
  - id: LIFE-02
    description: "동일 event/cancel replay의 멱등성 및 콘텐츠 드리프트/불법 전이 거부 (PROOF-03, D-15)"
    requirement: PROOF-03
    verification:
      - kind: unit
        ref: "dist/test/release-lifecycle-store.test.js#Task 42-02-02 Test 1: event append idempotency: identical retry succeeds while content drift is rejected (PROOF-03/idempotency)"
        status: pass
  - id: LIFE-03
    description: "active, last-good, pending, recovery 대상 아티팩트 및 메타데이터 자동 삭제 방지 보호 집합 산출 (PROOF-04, D-14)"
    requirement: PROOF-04
    verification:
      - kind: unit
        ref: "dist/test/release-lifecycle-store.test.js#Task 42-02-02 Test 3: deriveProtectedReleaseArtifacts collects active, last-good, pending and artifact refs (D-14)"
        status: pass
---

# Plan 42-02 Summary: Release Lifecycle Store and Invariant Protection

## 1. 개요 및 달성 결과

Plan 42-02에서는 기존 Phase 39 `tool-records`의 불변 acceptance chain과 완전히 격리된 별도의 **릴리스 생명주기 스토어(`src/core/release-lifecycle-store.ts`)** 및 **닫힌 이벤트 스키마(`schemas/tool-release-lifecycle.schema.json`)**를 구축하였습니다.

- **완료된 태스크:**
  1. `42-02-01`: pending verification 한 건을 별도 lifecycle record로 왕복 (커밋: `2b17d13`).
  2. `42-02-02`: append-only idempotency, single-writer 및 protected artifact 계약 완성 (커밋: `4ba5271`).

## 2. 주요 구현 내역

### 2.1 닫힌 릴리스 생명주기 이벤트 스키마 (`schemas/tool-release-lifecycle.schema.json`)
- 기존 acceptance record와 분리된 `tool-release-lifecycle` 전용 Draft 2020-12 스키마.
- 10개 생명주기 상태 지원: `started`, `evidence-recorded`, `verification-pending`, `activated`, `postcheck-passed`, `postcheck-failed`, `recovery-started`, `recovered`, `recovery-failed`, `cancelled`.
- 자격증명/원시 인자 등 비인가 비밀 필드의 유입을 원천 차단(`additionalProperties: false`, Ajv 엄격 검증).

### 2.2 생명주기 스토어 코어 엔진 (`src/core/release-lifecycle-store.ts`)
- `planReleaseLifecycleOperation`: 경로 경계 실증(OperationPathProofSet) 및 결정론적 planDigest 발행.
- `appendReleaseLifecycleEvent`:
  - 단조 증가 시퀀스(`sequence.json`) 및 단일 작성자 뮤테이션 세션 검증.
  - **멱등성(Idempotency)**: 동일 이벤트 재호출 시 no-op 성공; 내용 불일치(Drift) 시 즉시 거부.
  - **종결 상태 보호**: `cancelled`, `postcheck-passed`, `recovered` 등 터미널 상태 이후의 불법 전이 차단.
- `readReleaseLifecycle`: 이벤트 파일들을 시퀀스 순서로 재구성하여 현재 상태, 활성/직전 식별자, 의존성 핑거프린트, 재개 인자(`resumeInputs`) 복원 (D-03).
- `deriveProtectedReleaseArtifacts`: 현재 사용 중인 버전, 직전 정상 버전, 검증 대기 중인 아티팩트 및 복구 스코프 참조를 추출하여 자동 삭제 방지 보호 집합 생성 (D-14).

### 2.3 문서 검증 레지스트리 연결 (`src/core/validation.ts`)
- `ManagedDocumentKind`에 `tool-release-lifecycle` 등록.
- `OWNED_SUBTREE` 및 `CORE_SCHEMAS`에 등록하여 alpha-AOS 표준 검증 경로와 통합.

## 3. 검증 결과

- `npm run build`: 정상 빌드 완료 (0 errors).
- `node scripts/run-tests.mjs --files dist/test/release-lifecycle-store.test.js dist/test/release-verification.test.js dist/test/tool-record-store.test.js dist/test/tool-records.test.js`:
  - `release-lifecycle-store.test.js`: 8/8 통과
  - `release-verification.test.js`: 10/10 통과
  - `tool-record-store.test.js`: 9/9 통과
  - `tool-records.test.js`: 7/7 통과
  - **총 34개 테스트 전체 통과 (0 fail)**
- `npm run check`: strict typecheck 통과.
