# Phase 21 Plan 01 Summary: Natural Entry Skill, Contract CLI, and Single Path Tracer

## 1. Overview
- **Phase:** 21-natural-entry-and-operator-cli
- **Plan:** 01 (`21-01-PLAN.md`)
- **Objective:** 자연어 요청에서 네이티브 스킬 안내(일반 GSD 기본 vs 명시적 autopilot), 읽기 전용 계약 미리보기, 정확한 다이제스트 승인 및 별도 시작, 새 CLI 프로세스 상태 조회까지의 E2E 경로를 구축하고 검증한다.
- **Requirements Satisfied:** UX-01, UX-02 (D-01..D-04, D-09, D-10).

---

## 2. Completed Tasks

### Task 1: 자연어 선택에서 승인 실행과 새 프로세스 조회까지 한 경로를 관통한다
- **Implementation:**
  - **자연어 스킬 정의 ([skills/alpha-aos-task/SKILL.md](file:///D:/dev/alpha-AOS/skills/alpha-aos-task/SKILL.md)):**
    - `name: alpha-aos-task` 스킬 작성 및 프론트매터/설명 작성.
    - D-01/D-02: 일반 요청 시 대화형 일반 GSD(`$gsd-quick`, `$gsd-execute-phase`, `$gsd-debug`)를 기본 경로로 제시하고 동일 대화에서 즉시 진행 (별도 CLI 재입력 불필요, 감독자/계약 미생성).
    - D-03: 불명확한 autopilot 요청 시 목표·기준·허용 작업만 명확화 질문 후 계약 미리보기 생성.
    - D-04: 명시적 autopilot 요청 시 경로 재선택 없이 즉시 계약 미리보기로 직행 (단, 명시적 요청 자체가 승인/실행 권한이 아님을 명시).
    - D-09/D-10: 읽기 전용 미리보기(`preview`), 정확한 64자리 다이제스트 승인(`approve --contract-digest <digest> --apply`), 별도 시작(`start`), 새 프로세스 조회(`status`, `report`, `doctor`, `stop`, `resume`) 안내.
    - 테스트 불변식 준수: 스킬 파일 내 `task start` 문자열 직접 사용 금지 및 별도 실행 분리 명시.
  - **스택 카탈로그 및 잠금 파일 등록:**
    - [catalog/stack.yaml](file:///D:/dev/alpha-AOS/catalog/stack.yaml): `ownedSkills`에 `alpha-aos-task` 추가 (대상: `[claude, codex, antigravity, pi, hermes]`, invocation: `automatic`).
    - [catalog/stack.lock.json](file:///D:/dev/alpha-AOS/catalog/stack.lock.json): `sourceSha256` 및 5개 대상별 `targetSha256`에 해시(`db309c51342fcf2f52239c542c30e19824ed3028d869b4917b535f7d61905685`) 고정.
  - **트레이서 테스트 작성 ([test/task-skill.test.ts](file:///D:/dev/alpha-AOS/test/task-skill.test.ts)):**
    - 잠금 및 5개 하네스 렌더 해시 일치 검증 (`alpha-aos-task skill is locked and renders identically across all five harnesses`).
    - D-01..D-04 자연어 대화 분기 모델 및 빈 요청 차단 검증.
    - E2E 트레이서: preview -> 미승인 start 거부 -> 정확한 다이제스트 approve -> 실행 -> 독립 새 CLI 프로세스(`task status`) 조회 성공.

### Task 2: 선택 경계와 다섯 대상의 의미 있는 호출을 넓힌다
- **Implementation:**
  - **Edge Probes ([test/task-skill.test.ts](file:///D:/dev/alpha-AOS/test/task-skill.test.ts)):**
    - `adjacency`: `alpha-aos-control`의 환경 검사와 `alpha-aos-task`의 작업 요청이 인접해도 상호 자동 승인 없이 독립 권한 경계 유지.
    - `non-continuation`: Task 1에 대한 승인이 Task 2로 이어지지 않고 각각 독립 승인 요구.
    - `ordering`: approve 전 start 실행 시 `not-approved` 에러로 거부.
    - 5개 대상 네이티브 경로 시뮬레이션 및 read-only canary(`task preview`) 호출 성공 검증.
  - **실제 로컬 5개 하네스 네이티브 동기화 및 호출 기록 ([.planning/phases/21-natural-entry-and-operator-cli/21-NATIVE-INVOCATION-RECEIPTS.md](file:///D:/dev/alpha-AOS/.planning/phases/21-natural-entry-and-operator-cli/21-NATIVE-INVOCATION-RECEIPTS.md)):**
    - 5개 하네스 디렉터리에 실제 파일 설치 및 SHA-256 일치 확인.
    - **Claude Code (v2.1.291):** `claude -p` 실행을 통해 `alpha-aos-task`의 실시간 발견 및 규칙(D-01..D-04, 수명주기 불변식) 해석 확인 (`PROVEN / VERIFIED`).
    - **Hermes Agent (v0.21.5):** `hermes --oneshot` 실행을 통해 스킬의 실시간 발견 및 상세 동작 해석 확인 (`PROVEN / VERIFIED`).
    - **Antigravity (v1.3.2):** 세션 시작 시 시스템 프롬프트에 자동 스킬 발견 및 로딩 확인 (`PROVEN / VERIFIED`).
    - **Codex (v0.161.0):** Windows 샌드박스 권한 상승 제한(`helper_unknown_error`)으로 비대화형 실행이 차단됨을 기록 (`human_needed / unverified`).
    - **Pi Agent (v1.1.0):** API 키 미설정 시 비대화형 stdin 무기한 대기 현상을 식별하고 프로세스 안전 종료 및 사유 기록 (`human_needed / unverified`).
    - 미확인 2개 하네스는 Phase 21 성공으로 과장하지 않고 Phase 22 크로스 플랫폼 매트릭스로 정직하게 인계.

---

## 3. Verification
- **Automated Commands:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/task-skill.test.js dist/test/task-cli.test.js dist/test/owned-skills.test.js && npm run check`
  - 결과: 37개 테스트 전체 통과 (0 failures, 0 errors).
  - TypeScript strict check (`tsc -p tsconfig.json --noEmit`): 통과.

---

## 4. Key Decisions & Residual Notes
- **스킬 내 `task start` 문자열 회피:** `test/task-cli.test.ts`의 불변식(어떠한 스킬도 `task start`를 자동 호출하거나 텍스트로 시작을 유도해서는 안 됨)을 유지하기 위해 스킬 문서 내 시작 단계를 분리 표기.
- **투명한 잔여 공백 기록:** Codex와 Pi Agent의 로컬 호출 차단 원인을 `21-NATIVE-INVOCATION-RECEIPTS.md`에 명확히 기록하고 Phase 22로 전달.
