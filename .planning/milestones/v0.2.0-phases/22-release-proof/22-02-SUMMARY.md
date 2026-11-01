# Phase 22 Plan 02 Summary: Release Fault Proof Controls & Three-OS CI Binding

## 1. Overview
- **Phase:** 22-release-proof
- **Plan:** 02 (`22-02-PLAN.md`)
- **Objective:** 현재 릴리스 후보의 단일 세 OS CI 실행에 다섯 고장(`crash`, `cancellation`, `concurrency`, `duplicate-effect`, `false-acceptance`)별 정상/주입 결함 대조를 묶어 VER-01을 객관적으로 증명하고, 패키지 버전을 0.2.0으로 동기화한다.
- **Requirements Satisfied:** VER-01 (D-05, D-06, D-07, D-08).

---

## 2. Completed Tasks

### Task 1: 다섯 결함의 의도한 실패 단언을 고정한다
- **Implementation:**
  - **결함 대조 모델 ([src/core/release-fault-proof.ts](file:///D:/dev/alpha-AOS/src/core/release-fault-proof.ts)):**
    - `FaultCaseId`: `crash`, `cancellation`, `concurrency`, `duplicate-effect`, `false-acceptance` 고정 5개 ID 정의.
    - `FAULT_CASE_DEFINITIONS`: 각 ID별 기대 결과, 주입 결함(defect description), 의도한 named assertion (`expectedAssertion`), 복구 원칙 매핑:
      - `crash`: `assertReconciledEffects` (효과 기록 전/후 재개 검증)
      - `cancellation`: `assertChildWorkerTerminated` (자식 종료 확인 전 stopped 거부)
      - `concurrency`: `assertSingleActiveControllerLease` (두 controller 중 단일 lease 획득 강제)
      - `duplicate-effect`: `assertEffectKeyDeduplicated` (동일 effect key 중복 적용 거부)
      - `false-acceptance`: `assertMandatoryCriteriaVerified` (필수 기준/리뷰 영수증 누락 시 accepted 거부)
    - `evaluateFaultCase`:
      - 단순히 비영(non-zero) 종료로 성공을 주장하지 않고, 실패한 단언 이름(`failedAssertion`)이 의도한 `expectedAssertion`과 정확히 일치하는지 대조.
      - 정상(green) 레그 실패(`exitCode !== 0` 또는 `!passed`) 시 거절.
      - 적색(red) 레그 비실패(`exitCode === 0` 또는 `passed`) 시 거절.
      - 원본 로그 참조(`logReference`) 누락 시 거절.
  - **테스트 스위트 ([test/release-fault-controls.test.ts](file:///D:/dev/alpha-AOS/test/release-fault-controls.test.ts)):**
    - 5개 결함의 정상 경로 통과 및 주입 결함의 의도한 named assertion 실패 확인.
    - assertion 이름 불일치, green 레그 실패, red 레그 미실패, logReference 누락 시의 엄격한 거절 검증.

### Task 2: 단일 후보 SHA와 패키지 해시로 세 OS 실행을 묶는다
- **Implementation:**
  - **버전 0.2.0 동기화:**
    - [package.json](file:///D:/dev/alpha-AOS/package.json) 및 [package-lock.json](file:///D:/dev/alpha-AOS/package-lock.json): `0.1.0` -> `0.2.0`으로 승격.
    - [scripts/release.mjs](file:///D:/dev/alpha-AOS/scripts/release.mjs): 기대 패키지명을 `alpha-aos-0.2.0.tgz`로 변경하고 릴리스 스모크 테스트 버전을 `@0.2.0`으로 업데이트.
    - [.github/workflows/ci.yml](file:///D:/dev/alpha-AOS/.github/workflows/ci.yml): 패키지 생성 아티팩트명을 `alpha-aos-0.2.0.tgz`로 갱신하고, Windows/macOS/Linux 매트릭스에 named fault controls suite (`dist/test/release-fault-controls.test.js`) 명시적 실행 단계 추가.
    - [test/tarball-fixture.test.ts](file:///D:/dev/alpha-AOS/test/tarball-fixture.test.ts): stale archive fixture 대조 대상을 `alpha-aos-0.2.0.tgz`로 업데이트.
  - **3개 OS 실행 평가기 ([src/core/release-fault-proof.ts](file:///D:/dev/alpha-AOS/src/core/release-fault-proof.ts)):**
    - `evaluateThreeOsRun`:
      - 3대 OS (`windows`, `macos`, `linux`) 레그 전체 존재 확인 (하나라도 누락 시 `indeterminate` 및 누락 OS 명시).
      - 각 레그의 Git commit SHA가 현재 릴리스 후보 SHA와 일치하는지 검증 (불일치 시 `indeterminate`).
      - 각 레그의 패키지 tarball SHA-256이 후보 tarball 해시와 일치하는지 검증 (불일치 시 `indeterminate`).
      - 레그의 상태 분류: `passed`, `product_failed`, `environment_failed`, `not_run`, `indeterminate`.
      - 5개 고장 대조(`crash`, `cancellation`, `concurrency`, `duplicate-effect`, `false-acceptance`)가 3대 OS 모두에서 완전히 `detected=true`로 판정되었는지 전수 검증.
  - **CI 메타데이터 파서 ([scripts/release-evidence.mjs](file:///D:/dev/alpha-AOS/scripts/release-evidence.mjs)):**
    - `parseCiMetadata`: CI 실행 run/job/artifact 결과 JSON을 읽기 전용으로 안전하게 파싱하여 `evaluateThreeOsRun`에 바인딩.

---

## 3. Verification
- **Automated Commands:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/release-fault-controls.test.js && npm run check`: 12 tests passed, 0 failures, TypeScript check 통과.
  - `node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js`: 10 tests passed (v0.2.0 tarball packaging and sandbox lifecycle confirmed).
- **Invariants Verified:**
  - VER-01 unclassified probe 방지: red exit 만으로 합격 처리되지 않고 `assertReconciledEffects`, `assertChildWorkerTerminated`, `assertSingleActiveControllerLease`, `assertEffectKeyDeduplicated`, `assertMandatoryCriteriaVerified` 단언 실패가 증명됨.
  - 3-OS 일관성: 커밋 SHA 불일치, tarball SHA 불일치, 특정 OS 누락 시 즉시 `indeterminate`/`product_failed`로 fail-closed 처리.

---

## 4. Key Decisions & Residual Notes
- **D-05..D-08 충족:** 단순 exit code가 아닌 named assertion 일치를 필수 검증 조건으로 확립.
- **v0.2.0 Tarball Alignment:** `package.json`, `package-lock.json`, `ci.yml`, `release.mjs`, `tarball-fixture.test.ts`가 모두 `0.2.0` 아카이브 규격을 가리키도록 정렬.
