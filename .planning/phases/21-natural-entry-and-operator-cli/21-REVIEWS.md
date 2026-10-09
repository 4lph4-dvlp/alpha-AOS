---
phase: 21
reviewers: [claude]
reviewed_at: 2026-10-10
plans_reviewed: [21-01-PLAN.md, 21-02-PLAN.md, 21-03-PLAN.md, 21-04-PLAN.md, 21-05-PLAN.md, 21-06-PLAN.md, 21-07-PLAN.md]
models:
  claude: "unknown"
model_sources:
  claude: "unknown"
---

# Cross-AI Plan Review — Phase 21

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts

<!-- gsd:plan-revision-conflicts:end -->

## Claude Review

Claude CLI가 일곱 계획과 저장소 코드를 검토했다. 첫 호출은 검토문 대신 진행 상태 한 문장만 반환했다. 같은 세션에서 전체 검토문을 받은 뒤, 계획이 구현하기로 명시한 기능의 현재 부재를 결함으로 오인한 지적을 재평가하도록 요청했다. 아래는 계획과 코드 인용을 다시 확인해 남긴 피드백이다. 전체 CLI 응답은 `.review-diagnostics/`에 보존한다.

### 21-01 — 네이티브 스킬과 진입 경로

**강점:** 자동 테스트와 다섯 실제 하네스의 발견·호출 영수증을 분리하고, 한 대상이라도 증거가 없으면 Phase 21 완료로 판정하지 않는 기준이 명확하다. 일반 GSD 경로와 명시적 autopilot 선택도 각각 검증한다. [21-01-PLAN.md:71](21-01-PLAN.md), [21-01-PLAN.md:72](21-01-PLAN.md).

**계획 수정 권고:** 없음. 실제 하네스 인증이나 설치가 막히면 계획에 적힌 `human_needed/unverified` 판정을 그대로 적용해야 한다.

### 21-02 — 계약 미리보기와 차단 상태

**강점:** 차단된 경우에도 전체 계약을 먼저 보여 주고 승인·시작은 거절하도록 작업과 검증 기준을 분리했다. [21-02-PLAN.md:61](21-02-PLAN.md), [21-02-PLAN.md:62](21-02-PLAN.md).

**계획 수정 권고:** 없음. Claude가 지적한 현재 meter 예외 경로는 이 계획의 Task 2가 고치도록 명시한 대상이다.

### 21-03 — 예약 실행 ID

**강점:** 승인 다이제스트에서 결정적 ID를 만들면서 시작 전 `TaskRunRecord`는 생성하지 않는 경계를 정의했다. [21-03-PLAN.md:53](21-03-PLAN.md), [21-03-PLAN.md:54](21-03-PLAN.md).

**우려 — MEDIUM:** 계획 05는 시작 전의 예약 ID를 조회 대상으로 테스트하지만, 현재 실행 목록은 실제 run record만 읽는다. 계획 03과 05 사이에 예약 ID를 어떤 승인 기록에서 재계산하거나 조회할지 명시하면, 새 프로세스 조회가 run record 부재를 잘못된 ID로 취급하지 않도록 구현할 수 있다. 별도의 실행 기록을 예약 시점에 만드는 방식은 계획 03의 금지 조건과 충돌한다. [21-03-PLAN.md:54](21-03-PLAN.md), [21-05-PLAN.md:54](21-05-PLAN.md), [src/core/task-run.ts:533](../../../src/core/task-run.ts).

**제안:** 계획 03의 인터페이스에 `reservedRunId ↔ 승인된 contractDigest` 조회 방법을 적고, 계획 05에서 새 프로세스가 예약 ID를 조회하는 테스트를 명시한다.

### 21-04 — 다른 프로세스의 중지와 재개

**강점:** 중지 요청 접수와 실제 자식·후손 종료 확인을 구분하고, 확인 전에는 `stopped`를 쓰지 않도록 했다. [21-04-PLAN.md:57](21-04-PLAN.md), [21-04-PLAN.md:68](21-04-PLAN.md).

**우려 — MEDIUM:** 요청과 확인은 별도 상태로 영속화되지만, 계획 05의 read model이 이를 어느 파일이나 API에서 읽는지 계약이 없다. 계획 05는 `stop acknowledgment`를 판정 입력으로 적고 있으므로, 계획 04가 제공하는 읽기 인터페이스를 이름 붙여 두면 CLI의 `pending`/`stopped` 표시가 실행별 출처와 연결된다. [21-04-PLAN.md:50](21-04-PLAN.md), [21-04-PLAN.md:68](21-04-PLAN.md), [21-05-PLAN.md:64](21-05-PLAN.md).

**우려 — MEDIUM:** controller crash 뒤의 미확인 중지 요청은 `pending/unknown`으로 남긴다고 했지만, 재개 준비 검사 목록은 그 요청을 명시적으로 확인하지 않는다. 재개가 자식이나 외부 효과를 다시 시작하기 전에 미처리 중지 요청을 재확인해야 한다. [21-04-PLAN.md:57](21-04-PLAN.md), [21-04-PLAN.md:67](21-04-PLAN.md), [21-04-PLAN.md:68](21-04-PLAN.md).

**제안:** 계획 04의 인터페이스에 run ID·digest·lease가 결속된 요청/확인 읽기 API와 crash 후 재개 시 `pending` 처리 규칙을 추가하고, 계획 05가 그 API를 소비하도록 적는다.

### 21-05 — 실행별 상태 조회

**강점:** status와 report가 동일한 `startedAt/runId` 선택 규칙을 사용하고, 다른 시도의 checkpoint를 선택 실행에 섞지 않는 검증이 있다. `failed`도 저장된 상태 문자열을 단순 변경하지 않고 실패 근거에서 도출하도록 명시했다. [21-05-PLAN.md:54](21-05-PLAN.md), [21-05-PLAN.md:64](21-05-PLAN.md).

**계획 수정 권고:** 계획 03의 예약 ID 조회 방법과 계획 04의 중지 확인 읽기 API를 Task 1의 입력으로 명시한다.

### 21-06 — 기준별 보고서

**강점:** 필수 기준을 누락하지 않고 미충족·미확인을 먼저 보여 주며, 다른 artifact의 리뷰를 통과 근거로 사용하지 않는 테스트가 있다. [21-06-PLAN.md:52](21-06-PLAN.md), [21-06-PLAN.md:54](21-06-PLAN.md).

**계획 수정 권고:** 없음. 현재 formatter에 없는 표시 항목은 두 작업의 구현 범위에 포함된다.

### 21-07 — doctor와 JSON 실패 결과

**강점:** ID 범위 진단, 실패 JSON, 전체 테스트, 다섯 실제 하네스 호출 영수증을 최종 게이트로 연결했다. 영수증이 없으면 완료를 보류하는 정책도 명확하다. [21-07-PLAN.md:61](21-07-PLAN.md), [21-07-PLAN.md:71](21-07-PLAN.md), [21-07-PLAN.md:74](21-07-PLAN.md).

**계획 수정 권고:** 없음. 현재 CLI의 ID 무시와 일반 stderr 출력은 이 계획이 수정하도록 지정한 결함이다.

## Consensus Summary

Claude 한 시스템만 유효한 전체 검토문을 제공했다. 따라서 검토자 간 합의나 이견은 판정할 수 없다. Antigravity 경로는 필수 도구 `jq`가 PATH에 없어 실행하지 않았고, Codex CLI는 현재 실행 주체와 같아 독립 검토자로 세지 않았다.

### Agreed Strengths

검토자 간 합의는 평가할 수 없다. 단일 검토에서 승인 경계, 실행별 출처 보존, 실제 하네스 호출 영수증을 강점으로 확인했다.

### Agreed Concerns

검토자 간 합의는 평가할 수 없다. 계획을 수정한다면 예약 ID 조회 출처(03→05), 중지 요청·확인 읽기 인터페이스(04→05), crash 뒤 재개 전 미처리 중지 요청 확인(04)을 우선한다.

### Divergent Views

비교할 두 번째 검토자가 없다. Claude의 첫 전체 응답에 있던 “현재 구현 부재” 항목은 계획이 해당 구현을 명시하므로 계획 결함으로 채택하지 않았다.
