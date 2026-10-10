# Phase 22 Plan 01 Summary: Release Evidence Model & Doctor Matrix Evaluation

## 1. Overview
- **Phase:** 22-release-proof
- **Plan:** 01 (`22-01-PLAN.md`)
- **Objective:** v0.2.0 릴리스 증거의 얇은 실제 경로를 먼저 만든다. 하나의 정확 버전 역할 영수증을 공통 증거 모델에서 평가하고 `doctor --matrix`의 사람용·JSON 출력까지 관통시키며, 없는 근거는 `UNVERIFIED`로 보여준다.
- **Requirements Satisfied:** VER-01, VER-02, VER-03, VER-04 (D-01..D-04).

---

## 2. Completed Tasks

### Task 1: 정확 버전 역할 영수증 한 셀을 doctor 출력까지 연결한다
- **Implementation:**
  - **릴리스 증거 모델 ([src/core/release-evidence.ts](file:///D:/dev/alpha-AOS/src/core/release-evidence.ts)):**
    - `ReleaseCandidateIdentity` (`releaseVersion: "0.2.0"`, `releaseSha`, `tarballSha256`) 및 `ReleaseEvidenceSource` 타입 정의.
    - `evaluateReleaseEvidence`: 후보 SHA/패키지 해시 일치 검증, 출처 식별자 결손 검사, 상태 집계(`PROVEN`, `UNVERIFIED`, `REJECTED`, `UNSUPPORTED`).
  - **v0.2.0 지원 매트릭스 평가자 ([src/core/support-matrix.ts](file:///D:/dev/alpha-AOS/src/core/support-matrix.ts)):**
    - `RELEASE_SUPPORT_MATRIX_VERSION = "0.2.0"` 및 `BASE_RELEASE_SUPPORT_MATRIX` 정의.
    - `evaluateReleaseMatrixCell` 및 `evaluateReleaseSupportMatrix`:
      - 5개 하네스(`claude`, `codex`, `antigravity`, `pi`, `hermes`)의 역할(`controller`, `executor`, `reviewer`) 평가.
      - 실제 호출 영수증(`readHarnessRoleReceipt`), 정확한 버전 일치, 바이너리 해시 드리프트 여부를 검사하여 `PROVEN` / `UNVERIFIED` / `UNSUPPORTED` 판정.
      - 미검증 셀에 대해 구체적인 `reason`과 `nextAction` 안내.
      - `compareMatrixCells`: 하네스·버전·OS·역할·기능 순의 결정적 정렬(VER-02 ordering).
    - 기존 v0.1.0 `evaluateSupportMatrix` 및 `docs/SUPPORT_MATRIX.md` historical evaluator는 그대로 보존.
  - **포맷팅 및 CLI 연동 ([src/format.ts](file:///D:/dev/alpha-AOS/src/format.ts), [src/cli.ts](file:///D:/dev/alpha-AOS/src/cli.ts)):**
    - `formatReleaseSupportMatrixTable`: 하네스별 요약(proven/unverified 수), 정확한 버전, 역할, 기능, 상태, 이유, 다음 조치를 표로 렌더링.
    - `doctor --matrix` (사람용 및 `--json`): 새 `evaluateReleaseSupportMatrix` 결과를 공유하여 일관된 진단 출력 제공.

### Task 2: 후보 식별자와 일반 GSD 비활성 경계를 검사한다
- **Implementation:**
  - **릴리스 증거 거부 및 GSD 경계 검사 ([src/core/release-evidence.ts](file:///D:/dev/alpha-AOS/src/core/release-evidence.ts)):**
    - `evaluateOrdinaryGsdBoundary`: 일반 대화형 GSD 요청 시 명시적 autopilot 승인 없이는 supervisor 실행 기록이 0개여야 함을 검증(`PROVEN`). supervisor 실행 기록이 1개 이상 발생하면 즉시 `REJECTED` 판정.
  - **테스트 스위트 ([test/release-evidence.test.ts](file:///D:/dev/alpha-AOS/test/release-evidence.test.ts), [test/support-matrix.test.ts](file:///D:/dev/alpha-AOS/test/support-matrix.test.ts)):**
    - 후보 식별자 유효성 검증(잘못된 버전/빈 문자열 거부).
    - 커밋 SHA 불일치, tarball SHA 불일치, 빈 참조에 대한 `REJECTED`/`UNVERIFIED` 판정 검증.
    - VER-02 edge probes:
      - `adjacency`: 동일 버전의 다른 역할 영수증(예: claude controller)이 다른 셀(claude executor, codex controller)로 전이되지 않음.
      - `empty`: 영수증이 0개일 때 모든 advertised 셀이 `UNVERIFIED`로 남음.
      - `ordering`: 입력 순서를 역순으로 변경해도 정렬된 셀 출력이 동일함을 검증.
    - CLI `doctor --matrix` 및 `doctor --matrix --json` E2E 출력 검증.

---

## 3. Verification
- **Automated Commands:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/release-evidence.test.js dist/test/support-matrix.test.js && npm run check`: 15 passed, 0 failures, TypeScript check 통과.
  - `npm test`: 전체 69개 테스트 스위트, 497개 테스트 전체 통과 (0 failures).

---

## 4. Key Decisions & Residual Notes
- **D-01..D-04 준수:** 하네스별 포괄적 boolean support를 제공하지 않고, 입증된 역할 수와 미검증 수를 명시하며, 미검증 셀에 구체적인 다음 조치를 출력하도록 구현.
- **Historical Path 보존:** 기존 v0.1.0 `evaluateSupportMatrix`와 `docs/SUPPORT_MATRIX.md` 바이트 동일성 단언을 훼손하지 않고 v0.2.0 평가자를 나란히 배치.
