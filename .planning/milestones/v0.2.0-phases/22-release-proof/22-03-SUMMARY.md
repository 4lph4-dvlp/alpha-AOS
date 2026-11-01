# Phase 22 Plan 03 Summary: Expanded 5-Harness Support Matrix, Capabilities, and Handoff Receipts

## 1. Overview
- **Phase:** 22-release-proof
- **Plan:** 03 (`22-03-PLAN.md`)
- **Objective:** 다섯 하네스(`claude`, `codex`, `antigravity`, `pi`, `hermes`)의 정확한 버전·OS·역할(`controller`, `executor`, `reviewer`)·기능(`skill`, `mcp`, `pack`, `hook`)별 35개 지원 셀을 실제 호출 증거로 평가하고, 대표적인 실하네스 인계와 합성 5×5×5 조합을 명확히 구분하여 공개한다.
- **Requirements Satisfied:** VER-02 (D-01, D-02, D-03, D-04).

---

## 2. Completed Tasks

### Task 1: 역할·기능 셀을 실제 영수증에만 승격한다
- **Implementation:**
  - **35-Cell 지원 매트릭스 모델 ([src/core/support-matrix.ts](file:///D:/dev/alpha-AOS/src/core/support-matrix.ts)):**
    - `BASE_RELEASE_SUPPORT_MATRIX`: 5개 하네스 × 7개 셀 = 35개 셀 정의:
      - `claude`: `controller`, `hook`, `executor`, `mcp`, `pack`, `skill`, `reviewer`
      - `codex`: `controller`, `hook`, `executor`, `mcp`, `pack`, `skill`, `reviewer`
      - `antigravity`: `controller`, `hook`, `executor`, `mcp`, `pack`, `skill`, `reviewer`
      - `pi`: `controller`, `hook`, `executor`, `mcp`, `pack`, `skill`, `reviewer`
      - `hermes`: `controller` (`UNSUPPORTED`), `hook` (`UNSUPPORTED`), `executor`, `mcp`, `pack`, `skill`, `reviewer`
    - `evaluateReleaseMatrixCell`:
      - **Role 셀 (`controller`, `executor`, `reviewer`):** `readHarnessRoleReceipt`를 통한 정확 버전 및 바이너리 해시 검증. 드리프트 발견 시 즉시 `UNVERIFIED` 강등.
      - **Hook 셀 (`hook`):** Hermes는 `UNSUPPORTED`. 타 하네스는 `task-hook-receipt`의 통과(`status === "passed" && exitCode === 0`) 영수증 존재 시에만 `PROVEN`, 없으면 `UNVERIFIED`.
      - **기능 셀 (`skill`, `mcp`, `pack`):** 실제 invocation+result(`task-capability-receipts` 또는 `capability-ledger`) 증거가 확인된 경우에만 `PROVEN`, 단순 파일 발견은 `UNVERIFIED`.
      - **미검증 항목 안내:** 모든 `UNVERIFIED` 셀에 구체적인 원인(`reason`)과 실행 가능한 해결 조치(`nextAction`) 제공.
  - **영수증 경로 해석 및 격리 ([src/adapters/task-receipts.ts](file:///D:/dev/alpha-AOS/src/adapters/task-receipts.ts)):**
    - `receiptFilePath`: `root` 디렉토리가 `harnesses` 하위 폴더를 가질 경우 자동으로 하위 폴더를 참조하고, 테스트 임시 디렉토리 등 독립 경로도 완벽 지원.
  - **문서 동기화 ([docs/SUPPORT_MATRIX_v0.2.0.md](file:///D:/dev/alpha-AOS/docs/SUPPORT_MATRIX_v0.2.0.md)):**
    - `renderReleaseSupportMatrixMarkdown` 함수 구현 및 baseline 평가 markdown 생성.
    - 구조적 소스와 markdown 문서의 바이트 일치성 테스트 통과.
  - **CLI 및 포맷팅 ([src/format.ts](file:///D:/dev/alpha-AOS/src/format.ts)):**
    - `formatReleaseSupportMatrixTable`: 35개 셀 테이블 외에 인계 요약(`real PROVEN`, `synthetic`) 및 대표 인계 테이블 추가 렌더링.

### Task 2: 대표적인 실제 인계와 기능 호출의 버전별 영수증을 채운다
- **Implementation:**
  - **인계 모델 및 통계 ([src/core/support-matrix.ts](file:///D:/dev/alpha-AOS/src/core/support-matrix.ts)):**
    - `ReleaseHandoffEntry`: `kind: "real" | "synthetic"`, `fromHarness`, `fromVersion`, `fromRole`, `fromReceipt`, `toHarness`, `toVersion`, `toRole`, `toReceipt`, `artifactDigest`, `status`, `observedAt`, `notes`.
    - `BASE_RELEASE_HANDOFFS`:
      - **Real Handoff 1:** Claude Code (`2.1.291`, controller) -> Antigravity (`1.3.3`, executor)
      - **Real Handoff 2:** Antigravity (`1.3.3`, executor) -> Claude Code (`2.1.291`, reviewer)
      - **Real Handoff 3:** Pi Agent (`1.1.0`, executor) -> Hermes Agent (`v0.21.5+8825.g69d126b`, reviewer)
      - **Synthetic Permutation:** Claude (`1.0.0`, controller) -> Codex (`1.0.0`, executor) 125-triple 검증 (`kind: "synthetic"`).
    - `summary.realHandoffsCount` (3)와 `summary.syntheticHandoffsCount` (1)를 명확히 분리하여 실호스트 증거 수치 왜곡 방지.
  - **호스트 라이브 영수증 기록 ([.planning/phases/22-release-proof/22-LIVE-RECEIPTS.md](file:///D:/dev/alpha-AOS/.planning/phases/22-release-proof/22-LIVE-RECEIPTS.md)):**
    - Windows 실호스트 5대 하네스(Claude 2.1.291, Codex 0.161.0, Antigravity 1.3.3, Pi 1.1.0, Hermes v0.21.5)의 네이티브 호출 결과, 관찰 출력, 영수증 참조, 잔여 한계(Codex sandbox 권한 이슈) 정리.

---

## 3. Verification
- **Automated Commands:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/support-matrix.test.js dist/test/task-doctor.test.js dist/test/task-capability-receipts.test.js dist/test/task-receipts.test.js && npm run check`: 28 tests passed, 0 failures, TypeScript check 통과.
- **Invariants Verified:**
  - **VER-02 Taxonomy:** 영수증 없는 셀은 `PROVEN`으로 승격되지 않고 `UNVERIFIED` 유지.
  - **Version Drift 방어:** 호스트 바이너리 해시 불일치 시 즉시 `UNVERIFIED` 및 re-probe 조치 출력.
  - **Adjacency 격리:** Claude controller 영수증이 Claude executor나 Codex controller로 전이되지 않음.
  - **인계 분리 (D-04):** 합성(synthetic) 결과가 실호스트(real) 인계 개수에 포함되지 않음.

---

## 4. Key Decisions & Residual Notes
- **Hermes Worker Boundary:** Hermes의 `controller` 및 `hook`은 `UNSUPPORTED`로 고정하여 GSD 수명주기/상태 침해 방지.
- **Codex Windows Sandbox:** Codex의 샌드박스 권한 상승 제약으로 인한 headless 미실행 상태를 거짓 `PROVEN`으로 포장하지 않고 투명하게 `UNVERIFIED`로 보고.
