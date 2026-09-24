# Phase 12: Red-Main Guard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-24
**Phase:** 12-red-main-guard
**Areas discussed:** Tracking Issue 생명주기 및 식별 방식, Guard 워크플로우 실행 위치 및 권한 분리, 후보 프로모션 차단(DEP-03) 연동 방식, Guard 스크립트 모듈화 및 테스트 전략

---

## Tracking Issue 생명주기 및 식별 방식

### Question 1: [Issue ID] Red main CI 추적 이슈 중복 방지 및 식별 기준

| Option | Description | Selected |
|--------|-------------|----------|
| 전용 라벨(ci-red-main) + 고정 제목 접두사([CI] Main branch failure) | 검색하여 기존 열린 이슈를 식별 및 갱신 | ✓ |
| 고정 제목([CI] Main branch failure) 단독 | 제목만으로 열린 이슈를 검색하여 식별 | |
| You decide | 권장 방식(전용 라벨 ci-red-main + 제목 검색) 채택 | |

**User's choice:** 전용 라벨(ci-red-main)과 고정 제목 접두사([CI] Main branch failure) 조합으로 검색하여 기존 열린 이슈를 식별 및 갱신
**Notes:** 중복 이슈 생성 방지를 위해 라벨과 제목 모두 일치하는 열린 이슈 검색.

### Question 2: [Issue Update] 열린 추적 이슈가 있을 때 갱신(refresh) 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 본문 업데이트 + 히스토리 코멘트 1개 추가 | 본문을 최신 상태로 갱신하고 코멘트 추가 | ✓ |
| 본문만 덮어쓰기 업데이트 | 알림/코멘트 누적 방지 | |
| 코멘트만 추가 | 본문은 최초 상태 유지 | |

**User's choice:** 본문(Issue Body)을 최신 실패 상태(커밋 SHA, Run ID, 실패한 OS 레그 테이블)로 업데이트하고, 히스토리용 코멘트를 1개 추가
**Notes:** 한눈에 보는 현재 상태와 실행 히스토리를 모두 보존.

### Question 3: [Issue Close] 3개 OS 레그 모두 Green 복구 시 자동 close 형태

| Option | Description | Selected |
|--------|-------------|----------|
| 복구 완료 코멘트 + completed 상태 close | 성공한 Run ID, 커밋 SHA 요약 남기고 close | ✓ |
| 코멘트 + close + 라벨 교체 | ci-red-main 제거 및 ci-resolved 부여 | |
| 코멘트 없이 즉시 close | 단순 종료 | |

**User's choice:** 복구 완료 코멘트(성공한 Run ID, 커밋 SHA, 3개 OS 매트릭스 통과 요약)를 남기고 이슈를 'completed' 상태로 close
**Notes:** 어떤 실행에 의해 복구되었는지 명확히 기록.

### Question 4: [Issue Body] 추적 이슈 본문에 포함될 실패 세부 정보 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 3개 OS 매트릭스 상태 요약 테이블 + Run 링크 + 커밋 정보 | OS, 결과, 실패 Step 이름, Run 링크 포함 | ✓ |
| Pass/Fail 및 Run 링크 최소 구성 | 최소 정보만 기재 | |
| You decide | 권장 방식 채택 | |

**User's choice:** 3개 OS 매트릭스 상태 요약 테이블 (OS, 결과, 실패한 구체적 Step 이름) + GitHub Actions Run 링크 + 실패 커밋 정보 포함
**Notes:** 어떤 OS의 어떤 Step이 실패했는지 한눈에 파악할 수 있도록 구성.

---

## Guard 워크플로우 실행 위치 및 권한 분리

### Question 1: [Workflow Placement] Red-Main Guard 실행 위치

| Option | Description | Selected |
|--------|-------------|----------|
| 별도 workflow_run 기반 워크플로우(.github/workflows/red-main-guard.yml) | CI 완료 시 main 컨텍스트에서 issues: write 격리 실행 | ✓ |
| ci.yml 내부 마지막 guard job | if 조건으로 main에서만 실행하고 job에 권한 부여 | |
| You decide | 권장 방식 채택 | |

**User's choice:** 별도의 workflow_run 기반 워크플로우(.github/workflows/red-main-guard.yml) — CI 워크플로우 완료 시 실행되며, main 브랜치 컨텍스트에서만 issues: write 권한을 안전하게 격리
**Notes:** 외부 PR에 권한이 누출되는 위험 원천 차단.

### Question 2: [Trigger Events] red-main-guard.yml 트리거 이벤트

| Option | Description | Selected |
|--------|-------------|----------|
| workflow_run(workflow: 'CI', types: [completed]) + workflow_dispatch | 자동 실행 및 수동 테스트 지원 | ✓ |
| workflow_run 단독 | 자동 실행만 지원 | |
| You decide | 권장 방식 채택 | |

**User's choice:** workflow_run(workflow: 'CI', types: [completed]) + workflow_dispatch(수동 실행/테스트 지원)
**Notes:** 수동 검증 및 시뮬레이션을 위한 workflow_dispatch 포함.

### Question 3: [Workflow Permissions] GitHub Actions 토큰 권한 범위

| Option | Description | Selected |
|--------|-------------|----------|
| issues: write, contents: read, actions: read | 실행 결과 조회 및 이슈 관리에 필요한 최소 권한 | ✓ |
| issues: write 전용 | 이슈 관리 외 배제 | |
| You decide | 권장 방식 채택 | |

**User's choice:** issues: write, contents: read, actions: read — 실행된 CI Run 정보(작업/레그 결과) 조회 및 이슈 작성/수정에 필요한 최소 권한만 명시
**Notes:** 최소 권한 원칙(least privilege) 준수.

### Question 4: [Branch Filtering] main 브랜치 외 CI 실행 필터링

| Option | Description | Selected |
|--------|-------------|----------|
| 워크플로우 job 조건 + 스크립트 내부 검증 (다중 방어) | defense-in-depth 적용 | ✓ |
| 워크플로우 job 조건 단독 | job 조건으로만 필터링 | |
| You decide | 권장 방식 채택 | |

**User's choice:** 워크플로우 job 조건(if: github.event.workflow_run.head_branch == 'main')과 스크립트 내부 검증을 모두 적용하는 다중 방어(defense-in-depth)
**Notes:** 조건 누락 또는 환경 차이로 인한 오작동 원천 방지.

---

## 후보 프로모션 차단(DEP-03) 연동 방식

### Question 1: [Promotion Block Surfacing] 후보 PR 차단 상태 표기

| Option | Description | Selected |
|--------|-------------|----------|
| PR 본문 배너 자동 반영 + promotion-blocked 라벨 토글 | 명확한 시각적 배너 및 라벨 | ✓ |
| PR 코멘트 추가 + 워크플로우 exit 1 실패 | 체크 런 실패 처리 | |
| You decide | 권장 방식 채택 | |

**User's choice:** Candidate PR 본문에 상태 배너(🚫 Promotion Blocked: Main CI failing (Run #ID) vs ✅ Promotion Eligible)를 자동 반영하고, 전용 라벨(promotion-blocked)을 토글 관리
**Notes:** PR 리뷰어가 상태를 즉시 인지하도록 배너와 라벨 사용.

### Question 2: [Baseline Query Logic] 최신 main CI 상태 조회 로직

| Option | Description | Selected |
|--------|-------------|----------|
| status: completed 최신 main 실행 조회 (없으면 fail-closed 차단) | in-progress 건너뛰고 완료본만 평가 | ✓ |
| in-progress 시 대기(poll/wait) | 완료될 때까지 대기 | |
| You decide | 권장 방식 채택 | |

**User's choice:** gh CLI 또는 GitHub API로 'status: completed' 상태인 최신 main CI 실행을 조회 — 진행 중(in-progress)은 건너뛰고 완료된 최신 실행의 conclusion을 평가하며, 완료 이력이 없으면 fail-closed(차단) 처리
**Notes:** 완료되지 않은 중간 상태를 오판하지 않고, 이력 부재 시 fail-closed 보장.

### Question 3: [Candidate PR Execution Status] 프로모션 차단 시 워크플로우 종료 코드

| Option | Description | Selected |
|--------|-------------|----------|
| 스테이징 정상 완료(exit 0) + 배너/라벨/Step Summary 기록 | 후보 lockfile 변경사항 유지 | ✓ |
| commit status failure 등록 또는 exit 1 종료 | PR 머지 체크 실패 처리 | |
| You decide | 권장 방식 채택 | |

**User's choice:** PR 본문 배너 + promotion-blocked 라벨 + Actions Step Summary에 차단 기록을 남기되, 워크플로우 자체는 후보 lockfile 스테이징 작업을 정상 완료(exit 0)하여 최신 차이점 유지
**Notes:** 후보 종속성 diff를 유지하면서 프로모션 불가 상태만 명확히 고지.

### Question 4: [Block Information Scope] 배너 및 요약에 기록할 정보 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 실패한 main Run ID, URL, 커밋 SHA, 시각, 실패 OS 레그 상세 | 상세 정보 포함 | ✓ |
| Run ID 및 URL 한 줄 기재 | 최소 정보만 기재 | |
| You decide | 권장 방식 채택 | |

**User's choice:** 실패한 main의 Run ID, Run URL, 커밋 SHA, 실패 시각 및 실패한 OS 레그 목록을 배너/요약에 상세 기재 (Green일 때는 통과한 Run ID, SHA 기재)
**Notes:** 차단 원인을 추적할 수 있도록 완결된 정보 제공.

---

## Guard 스크립트 모듈화 및 테스트 전략

### Question 1: [Script Architecture] Guard 코드 위치 및 런타임 구조

| Option | Description | Selected |
|--------|-------------|----------|
| scripts/ 디렉토리에 독립 Node.js ES 모듈(.mjs) | 경량 독립 스크립트로 분리 | ✓ |
| src/core/ 내부 TypeScript 모듈 + CLI 서브커맨드 | CLI 바이너리에 통합 | |
| 워크플로우 yaml 내 인라인 bash | 워크플로우 내부 직접 작성 | |

**User's choice:** scripts/ 디렉토리에 독립 Node.js ES 모듈(scripts/red-main-guard.mjs, scripts/check-main-baseline.mjs)로 작성 — 가볍고 외부 의존성 없이 GitHub CLI/API와 연동하며 로컬 테스트 용이
**Notes:** 리포지토리의 scripts/audit-tarball.mjs, scripts/run-tests.mjs 패턴과 일관성 유지.

### Question 2: [Testing Strategy] 테스트 스위트 구성 및 검증 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 6개 핵심 시나리오 Mock 단위 테스트 | 생성, 갱신, 종료, 차단, 허용, fail-closed 검증 | ✓ |
| 순수 포맷팅/파싱만 테스트 | API 호출 제외 | |
| You decide | 권장 방식 채택 | |

**User's choice:** GitHub API/CLI 응답을 Mocking하여 6가지 핵심 시나리오(신규 생성, 중복 방지 갱신, 자동 종료, Red 차단, Green 허용, 이력 부재 시 fail-closed 차단)를 test/*.test.ts에서 엄격하게 단위 테스트
**Notes:** 모든 분기 및 엣지 케이스를 로컬 CI에서 결정론적으로 검증.

### Question 3: [GitHub Interaction Method] GitHub 연동 구현 방식

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub CLI(gh) 명령 래퍼 함수 | subprocess 단위 mock 용이 및 기존 yaml과 일관 | ✓ |
| Node 24 내장 fetch로 REST API 직접 호출 | 외부 CLI 의존성 없음 | |
| You decide | 권장 방식 채택 | |

**User's choice:** GitHub CLI(gh) 명령 래퍼 함수를 사용 — 기존 dependency-candidate.yml과 일관성을 유지하고 서브프로세스 단위 mock 테스트 용이
**Notes:** 주입 가능한 실행 함수(executor) 형태로 설계하여 테스트 용이성 극대화.

### Question 4: [Error Handling & Exit Policy] 예외 상황 에러 핸들링 및 종료 정책

| Option | Description | Selected |
|--------|-------------|----------|
| 명확한 stderr 로깅 후 exit 1 (Guard 실패 가시화) + baseline fail-closed | fail-closed 원칙 적용 | ✓ |
| 경고만 출력하고 exit 0 (fail-open) | 오류 무시 진행 | |
| You decide | 권장 방식 채택 | |

**User's choice:** Guard 실행 중 네트워크/API 실패 발생 시 명확한 stderr 로깅 후 exit 1 종료(Guard 실패를 가시화)하며, baseline 판정 시에는 fail-closed 원칙으로 항상 차단(blocked) 처리
**Notes:** 안전 경계 및 품질 가드의 핵심 원칙인 fail-closed 유지.

---

## the agent's Discretion

- 이슈 및 PR 배너의 구체적 마크다운 디자인 및 이모지 스타일.
- 스크립트 내부 헬퍼 분할 구조.
- 플랜 분할 및 웨이브 구성.

## Deferred Ideas

- Slack/Discord 등 외부 알림 채널 연동.
- 일시적 오류(flaky test) 감지 시 자동 재실행(re-run) 기능.
