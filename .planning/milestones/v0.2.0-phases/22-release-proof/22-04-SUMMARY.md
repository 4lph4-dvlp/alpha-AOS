# Phase 22 Plan 04 Summary: Packed Tarball Lifecycle, Host Zero-Mutation Proof, and Supply Chain Gates

## 1. Overview
- **Phase:** 22-release-proof
- **Plan:** 04 (`22-04-PLAN.md`)
- **Objective:** 단일 v0.2.0 릴리스 tarball SHA-256 해시로 격리 샌드박스 접두사 설치·진단·제거의 전체 수명주기를 완주하고, 실제 호스트 관리 대상 경로의 무변경을 범주별로 입증하며, 안정 공급망 게이트 및 개인 경로 노출 방지를 검증한다.
- **Requirements Satisfied:** VER-03 (D-09, D-10, D-11, D-12, VER-03 unclassified boundary probe).

---

## 2. Completed Tasks

### Task 1: packed install·doctor·uninstall 단일 해시 수명주기 증거화
- **Implementation:**
  - **패키지 수명주기 및 호스트 지문 검증 엔진 ([src/core/release-package-proof.ts](file:///D:/dev/alpha-AOS/src/core/release-package-proof.ts)):**
    - `PackageLifecycleStep`: `name: "install" | "doctor" | "uninstall"`, `exitCode`, `status`, `tarballSha256`, `observedAt`, `stdoutSummary`, `stderrSummary`.
    - `HostPathCategory`: `"managed_state" | "harness_config" | "harness_policy" | "skills" | "gsd_workflow" | "unclassified_boundary"`.
    - `HostPathCategoryDelta`: 범주별 전후 다이제스트(`beforeDigest`, `afterDigest`), 추가/삭제/변경/소실 건수, `isClean: boolean`.
    - `evaluatePackedLifecycle`:
      - 동일 tarball SHA-256 일관성 검증 (단계 간 해시 불일치 시 `failed`).
      - 필수 3단계(`install`, `doctor`, `uninstall`) 완주 및 `exitCode: 0` 필수.
      - 공급망 게이트 (D-12): 패키지 내 `catalog/stack.lock.json`의 `channel: "stable"`, 잠금 파일 식별자 확인, unreviewed candidate lock 거부(`candidateRefused: true`) 확인.
      - 호스트 지문 검증 (D-09/D-11): 관리 대상 범주에 전후 차이가 발생하면 `indeterminate`와 구체적 원인 및 동일 tarball 재검증 `nextAction` 반환.
    - `computeCategoryDelta`: 대상 목록으로부터 범주별 지문 및 변경 건수 계산.
  - **샌드박스 헬퍼 확장 ([test/helpers/packed-sandbox.ts](file:///D:/dev/alpha-AOS/test/helpers/packed-sandbox.ts)):**
    - `targetDriftCounts`: 단일 대상의 manifest 비교를 통한 추가/삭제/변경/소실 건수 계산.
    - `buildHostCategoryDeltas`: 호스트 검증 대상 그룹별 `HostPathCategoryDelta` 일괄 생성.
  - **실제 패키지 수명주기 테스트 통합 ([test/tarball-fixture.test.ts](file:///D:/dev/alpha-AOS/test/tarball-fixture.test.ts)):**
    - 패키지 빌드(`alpha-aos-0.2.0.tgz`), 격리 샌드박스 글로벌 설치, GSD/ECC prerequisite seeding, `install --apply`, preview, idempotent `install --apply`, candidate lock 주입 후 `update --apply` 거부, `status --json` & `doctor --json`, `uninstall --all --yes --apply --purge --json` 완주.
    - `buildHostCategoryDeltas`를 통해 실제 호스트 관리 경로 5개 범주(`managed_state`, `harness_config`, `harness_policy`, `skills`, `gsd_workflow`)의 무변경을 `evaluatePackedLifecycle`로 검증.

### Task 2: 원인 불명 호스트 차이 보류 및 개인 경로 가림 차단
- **Implementation:**
  - **원인 불명 차이 보류 (D-11):**
    - `evaluatePackedLifecycle`는 관리 대상 범주에 드리프트 감지 시 `failed`나 `passed`로 단정하지 않고 `status: "indeterminate"`를 반환.
    - `reverifyPackedLifecycle`는 재검증 실행의 tarball SHA-256이 원래 tarball SHA-256과 정확히 일치할 때만 승격 허용 (다른 해시 시도시 예외 발생).
  - **개인 경로 노출 원천 차단 (D-10):**
    - `assertNoPrivatePaths`: 개인 사용자 디렉토리(`C:\Users`, `/home/`, `/Users/` 등)가 릴리스 보고서 및 필드에 진입하는 것을 탐지하여 즉시 예외 차단.
    - `renderReleasePackageReceiptsMarkdown`: 공개 릴리스 문서에는 범주명, 변경 수, 해시 다이제스트만 노출하며 상세 개인 경로를 절대 노출하지 않음.
  - **공개 영수증 문서화 ([.planning/phases/22-release-proof/22-PACKAGE-RECEIPTS.md](file:///D:/dev/alpha-AOS/.planning/phases/22-release-proof/22-PACKAGE-RECEIPTS.md)):**
    - 동일 tarball SHA-256(`30bbfc57d4268427549529bf9872ed75c1279e7d7da25d953272dc30c57d1ed5`)의 설치/진단/제거 결과, 공급망 게이트, 5개 호스트 범주의 `CLEAN` 상태, VER-03 관찰 경계 안내 기록.
  - **부정 대조 및 회귀 테스트 ([test/release-package-proof.test.ts](file:///D:/dev/alpha-AOS/test/release-package-proof.test.ts)):**
    - 9개 단위 테스트 작성 및 전체 통과 (단계 누락, 해시 불일치, candidate 미거부, 원인 불명 차이 indeterminate, 재검증 동일 해시 강제, 개인 경로 주입 차단 등).

---

## 3. Verification
- **Automated Commands:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/release-package-proof.test.js dist/test/tarball-fixture.test.js && npm run check`: 19 tests passed, 0 failures, TypeScript checks cleanly.
- **Invariants Verified:**
  - **D-09/D-10:** 설치·진단·제거 결과와 호스트 범주별 변경 수(0) 및 전후 동일 다이제스트가 첫 표에 연결됨.
  - **D-11:** 원인 불명 차이는 `indeterminate`로 분류되며 동일 tarball 해시 재검증만 허용.
  - **D-12:** 안정 채널(`stable`)과 candidate 잠금 파일 거부가 같은 수명주기 표에 명시됨.
  - **VER-03 Boundary:** 관찰된 5개 범주 외의 무변경을 과장하지 않고 관찰 경계와 공백을 명시.
  - **개인 정보 보호:** 로컬 사용자 경로 노출 시도 차단.

---

## 4. Key Decisions & Residual Notes
- **Sandboxed vs Host Scope Separation:** 샌드박스 내부의 임시 디렉토리 변동은 격리된 프리픽스에서 완전히 소멸되며, 실제 사용자 홈 및 관리 디렉토리는 1바이트의 오차도 없이 전후 일치함을 보장.
- **Immutable Tarball Binding:** 검증에 사용된 tarball은 `alpha-aos-0.2.0.tgz`의 sha256(`30bbfc57d4...`)으로 고정되어 이후 단계의 최종 릴리스 증거에 결합 가능.
