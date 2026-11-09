---
phase: 42-integration-verification-and-recovery
plan: "01"
subsystem: release-verification
tags: [verification, mcp, security, evidence, fingerprint]

requires:
  - phase: 41-minimal-compatibility-adapters
    provides: compatibility adapter registry and tracer evaluation
provides:
  - Inactive candidate preparation proof (NativePreparationProof)
  - Four-tier evidence verification (installation, discovery, protocol-schema, invocation)
  - Exact dependency fingerprint derivation (buildEvidenceDependencyFingerprint)
  - Proxy boundary invocation enforcement (alpha-aos-proxy vs direct-upstream)
  - Pre-activation verification interlock in applyLocalReleasePlan
affects: [42-02, 42-03, 42-04, 42-05, 42-06]

actuals:
  tokens: 12500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - Four-tier verification gate (installation, discovery, protocol-schema, invocation)
    - Zero-call activation barrier for pending/failed candidates
    - SHA-256 canonical dependency fingerprint for evidence invalidation/reuse

key-files:
  created:
    - src/core/release-verification.ts
    - test/release-verification.test.ts
  modified:
    - src/types.ts
    - src/core/update.ts

key-decisions:
  - "D-01: 미등록 exact candidate는 무결성/프로토콜 검사가 통과해도 invocation 미확인 시 inactive 준비 상태로 유지되고 활성 identity는 바뀌지 않음"
  - "D-02: invocation 증거는 alpha-AOS proxy/client 경계를 실제로 통과하고 허용된 읽기 전용 observation 'ok'인 경우에만 pass로 인정"
  - "D-04: 버전·무결성·어댑터·설정·하네스·플랫폼·권한/비용의 64-hex SHA-256 fingerprint가 일치할 때만 증거를 재사용하고 변경 시 해당 tier부터 재실행"
  - "D-06: 검증 대상 하네스는 정적 지원 목록이 아닌 현재 native config와 resolved path로 실제 사용이 증명된 하네스만 포함"

patterns-established:
  - "Inactive staging positive proof: candidate artifact & integrity + preserved active alias & config digests"
  - "Boundary-verified invocation: direct upstream bypass is rejected; only alpha-aos-proxy observation proves invocation"

requirements-completed:
  - PROOF-01
  - PROOF-02
  - PROOF-03

coverage:
  - id: VERIF-01
    description: "미등록 exact candidate의 protocol/schema 도달 및 unlisted 목록 부재 거부 방지 (PROOF-01)"
    requirement: PROOF-01
    verification:
      - kind: unit
        ref: "dist/test/release-verification.test.js#Task 42-01-01 Test 1: unlisted exact MCP candidate proceeds through protocol/schema checks without rejection (PROOF-01)"
        status: pass
  - id: VERIF-02
    description: "4단계 독립 evidence tier (installation, discovery, protocol-schema, invocation) 평가 및 pending 사유 보존 (PROOF-02)"
    requirement: PROOF-02
    verification:
      - kind: unit
        ref: "dist/test/release-verification.test.js#Task 42-01-02 Test 1: all four tiers maintain independent states and reasons (PROOF-02)"
        status: pass
  - id: VERIF-03
    description: "검증 미충족/실패 시 zero-activation 및 기존 active identity 완벽 보존 (PROOF-03, D-01)"
    requirement: PROOF-03
    verification:
      - kind: unit
        ref: "dist/test/release-verification.test.js#Task 42-01-01 Integration: applyLocalReleasePlan rejects activation when candidate verification is pending or failed (D-01, PROOF-03)"
        status: pass
---

# Plan 42-01 Summary: Inactive Candidate Preparation and Proxy Invocation Tracer

## 1. 개요 및 달성 결과

Plan 42-01에서는 로컬 공식 릴리스 연동 검증의 핵심 기반인 **비활성 후보 준비(Inactive Candidate Preparation)**, **4단계 검증 티어(Installation, Discovery, Protocol-Schema, Invocation)**, **의존성 핑거프린트(buildEvidenceDependencyFingerprint)** 및 **적용 전 사전 검증 인터록(applyLocalReleasePlan pre-activation barrier)**을 구현하였습니다.

- **완료된 태스크:**
  1. `42-01-01`: 미등록 MCP 후보의 inactive 준비부터 실제 proxy invocation까지 연결 (커밋: `fbd6efd`).
  2. `42-01-02`: 네 evidence tier와 dependency fingerprint 재사용/무효화 확장 (커밋: `bcc931d`).

## 2. 주요 구현 내역

### 2.1 도메인 타입 및 계약 선언 (`src/types.ts`)
- `ReleaseEvidenceTier`: `"installation" | "discovery" | "protocol-schema" | "invocation"`
- `ReleaseEvidenceState`: `"pass" | "pending" | "failed" | "not-run"`
- `NativePreparationProof`: `prepareMode: "inactive" | "activation-required" | "unsupported"`, 기존 활성 식별자·별칭·설정 다이제스트 보존 증명.
- `ReadOnlyInvocationDescriptor`: 도구명, 인자 스키마, 권한 범위, 비용 등급, 프록시 경계, 관찰 기댓값을 포함하는 읽기 전용 호출 서술자.
- `ReleaseVerificationRequest` / `ReleaseVerificationResult`: 4단계 티어 결과, 의존성 핑거프린트, 영향받는 하네스 바인딩, 다음 권고 액션(`nextAction`).
- `LocalReleaseApplyResult`에 선택적 `verification`, `pendingReasons`, `nextAction` 필드 추가.

### 2.2 릴리스 검증 코어 서비스 (`src/core/release-verification.ts`)
- `discoverAffectedHarnesses`: 정적 지원 목록이 아닌 현재 하네스 네이티브 설정과 실행 경로가 해당 도구를 실제로 사용하는지 검증(D-06). 미확정 시 `inActualUse: false`.
- `buildEvidenceDependencyFingerprint`: 버전, 무결성, 플랫폼/아키텍처, 어댑터, 하네스 설정 다이제스트, 호출 서술자, 이전 복구 스코프를 정규 직렬화한 64-hex SHA-256 핑거프린트 도출(D-04).
- `verifyPreparedReleaseCandidate`: 4단계 티어 독립 평가.
  - **Installation**: 비활성 격리 스테이징 및 기존 활성 상태 보존 실증.
  - **Discovery**: 공식 지원 목록 미등록 버전도 소스/무결성이 확인되면 통과 (PROOF-01).
  - **Protocol-Schema**: 프로토콜 초기화 및 스키마 적합성 평가.
  - **Invocation**: 직접 업스트림 우회는 거부되며, alpha-AOS 프록시 경계를 통과한 실제 관찰(`ok`)만 통과 (PROOF-02, D-01). 자격증명/비용 승인 부재 시 typed `pending` 반환.
- `reconcileEvidenceTiersWithFingerprint`: 핑거프린트 일치 시 캐시 재사용, 불일치 시 영향 티어 무효화(D-04).

### 2.3 업데이트 적용 인터록 (`src/core/update.ts`)
- `applyLocalReleasePlan`이 `applyManagedInstall` 호출 전에 `candidateVerificationRequests`를 평가.
- 검증 결과가 `pass`가 아니면(pending/failed) 네이티브 설치/활성화를 전혀 수행하지 않고, 기존 사용 버전을 보존한 채 typed pending/failure 결과를 반환(PROOF-03, D-01).
- 활성화 직전 `recheckActualTarget` 옵션을 통해 대상 도구의 실제 설치 상태 드리프트 여부 최종 재확인.

## 3. 검증 결과

- `npm run build`: TypeScript 컴파일 성공 (0 errors)
- `node scripts/run-tests.mjs --files dist/test/release-verification.test.js dist/test/local-release-update.test.js`:
  - `release-verification.test.js`: 10/10 tests PASS
  - `local-release-update.test.js`: 24/24 tests PASS
  - **총 34개 테스트 전체 통과 (0 fail)**
- `npm run check`: strict typecheck 100% 통과
