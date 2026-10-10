# Phase 22 Plan 05 Summary: Release End-to-End Examples (Development Game & CoursePilot LMS)

## 1. Overview
- **Phase:** 22-release-proof
- **Plan:** 05 (`22-05-PLAN.md`)
- **Objective:** 소프트웨어 개발(1인칭 CLI 게임)과 비개발(CoursePilot LMS 코스 정리) 두 실질 워크로드에서 다중 하네스 협업·독립 리뷰어 입증·필수 기능 호출·다층 파일 식별자 보존 및 픽스처/실서버 경계 분리를 검증한다.
- **Requirements Satisfied:** VER-04 (D-13, D-14, D-15, D-16, VER-04 edge adjacency).

---

## 2. Completed Tasks

### Task 1: 개발·비개발 2개 워크로드의 엔드투엔드 기준과 독립 리뷰어 입증을 연결한다
- **Implementation:**
  - **워크로드 모델 및 평가 엔진 ([src/core/release-examples.ts](file:///D:/dev/alpha-AOS/src/core/release-examples.ts)):**
    - `ReleaseExampleCase`: `"development" | "coursepilot"`.
    - `ExampleCriterionResult`: `criterion`, `passed`, `evidenceDigest`, `notes`, `observedAt`.
    - `ExampleCapabilityCall`: `harness`, `capabilityId`, `role`, `timestamp`, `callDigest`, `observedResult`.
    - `ReviewWitnessProof`: `reviewerHarness`, `reviewerRole`, `workloadCase`, `targetRevision`, `digestParity`, `witnessDigest`, `evaluatedAt`.
    - `CoursePilotItemFile`: `courseId`, `weekId`, `moduleId`, `fileId`, `fileName`, `fileSha256`, `sizeBytes`.
    - `CoursePilotLmsStatus`: `kind: "fixture" | "live"`, `status: "passed" | "unverified" | "failed"`.
    - `ExampleEvaluationResult`: `workloadCase`, `status`, `criteria`, `capabilityCalls`, `reviewWitness`, `lmsStatus`, `distinctFiles`, `summary`.
    - `evaluateReleaseExample`:
      - 기준 통과 여부 검증 (전체 기준 passed 필수).
      - 독립 리뷰어 입증 검증: 대상 리비전 일치 및 `digestParity: true` 필수. 불일치 시 `failed`.
      - 필수 기능 호출 검증 (D-16): 명시된 필수 하네스/기능 호출이 없으면 `failed`.
      - CoursePilot 계층 파일 무손실 식별 검증 (`VER-04 edge adjacency`): 모듈 간 동일 파일명(`syllabus.pdf` 등) 발생 시 복합 키(`${courseId}:${weekId}:${moduleId}:${fileId}`)로 구별하여 유실/병합 방지.
      - LMS 경계 검증 (D-15): 픽스처 다운로드는 로컬 디스크 및 SHA-256 검증으로 `passed`, 실서버(live) 접근은 자격증명 부재 시 정직하게 `UNVERIFIED`와 구체적 nextAction 보고.
    - `renderReleaseExamplesMarkdown`: 두 워크로드의 상세 검증 결과 마크다운 렌더러 구현.
  - **개발 워크로드 CLI 게임 오라클 픽스처 ([test/fixtures/release-development-game.mjs](file:///D:/dev/alpha-AOS/test/fixtures/release-development-game.mjs)):**
    - 순수 ES 모듈로 구현된 1인칭 CLI 미로/전투 게임 시뮬레이터.
    - `start`, `movement`, `fire`, `hazard`, `win`, `loss`의 관찰 가능한 상태 머신 및 결정적 시퀀스 검증 제공.
  - **문서화 ([.planning/phases/22-release-proof/22-EXAMPLES.md](file:///D:/dev/alpha-AOS/.planning/phases/22-release-proof/22-EXAMPLES.md)):**
    - 두 워크로드의 평가 기준, 기능 호출, 리뷰어 증거, 파일 식별자 보존 표 기록.

### Task 2: 회귀 테스트 및 경계 조건 검증
- **Implementation:**
  - **테스트 슈트 ([test/release-examples.test.ts](file:///D:/dev/alpha-AOS/test/release-examples.test.ts)):**
    - 10개 테스트 작성 및 검증 통과:
      1. `development: game oracle transitions states and satisfies winning sequence`
      2. `development: full workload evaluates to passed when all criteria and review witness match`
      3. `development: reviewer witness fails if targetRevision or digest parity is broken`
      4. `development: evaluation fails if required capability call is missing (D-16)`
      5. `coursepilot: multi-level course-week-module file identity is strictly preserved (VER-04 edge adjacency)`
      6. `coursepilot: evaluation fails if distinct files are collated or overwritten`
      7. `coursepilot: fixture downloads pass with valid sha256 checksums (D-15)`
      8. `coursepilot: live LMS is UNVERIFIED without credentials and does not block fixture proof (D-15)`
      9. `coursepilot: evaluation fails if reviewer witness parity is broken`
      10. `renderReleaseExamplesMarkdown produces complete documentation for both workloads`

---

## 3. Verification
- **Automated Commands:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/release-examples.test.js && npm run check`: 10 tests passed, 0 failures, TypeScript checks cleanly.
- **Invariants Verified:**
  - **독립 리뷰어 정합성:** 제3자 리뷰어의 아티팩트 다이제스트가 대상 리비전과 100% 일치할 때만 승인.
  - **기능 호출 영수증 (D-16):** 계획된 하네스 capability 호출이 누락되면 즉시 거부.
  - **Edge Adjacency 무손실 (VER-04):** 인접/하위 계층의 동명 파일이 복합 키로 안전하게 분리 보존됨.
  - **D-15 경계 엄수:** 픽스처는 로컬 입증 완료(`passed`), 실 LMS는 자격증명 부재 시 `UNVERIFIED`로 분리 보고.

---

## 4. Key Decisions & Residual Notes
- **LMS Credential Boundary:** 실제 대학 LMS API 호출은 사용자의 안전한 자격증명 입력 전까지 자동 시뮬레이션하지 않고 `UNVERIFIED`로 남김.
- **Fixture Game Architecture:** 외부 그래픽 라이브러리 의존성 없이 순수 Node.js 스트림 기반의 관찰 가능한 텍스트 오라클로 구성하여 cross-platform headless CI 환경 완벽 대응.
