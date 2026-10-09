# Phase 20: General Tool Connectors - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 20 adds a versioned connector protocol so the existing approved task contract, durable run, effect ledger, and independent review can handle itemized non-code work. A generic fixture proves the protocol without Git or code-test assumptions. CoursePilot is the first real connector: it previews a fresh bounded materials manifest, performs only approved downloads, reconciles interrupted effects, and verifies saved files per item. The user authorized a supported CoursePilot materials contract extension as an upstream prerequisite on 2026-10-09; credentials, LMS-family support, VOD viewing, and Notion behavior remain outside scope. GSD remains the sole project lifecycle authority.

</domain>

<decisions>
## Implementation Decisions

### 목록 변경과 재승인
- **D-01:** 승인된 미리보기 뒤 새 LMS 자료가 발견되면 이번 실행에 자동 포함하지 않는다. 기존 승인 항목은 계속 진행하고 새 자료는 보류해 새 미리보기와 승인을 받는다.
- **D-02:** 승인된 자료가 실행 전 새 목록에서 사라지면 그 자료를 `미확인`으로 보고하고 나머지 독립된 승인 항목은 진행한다. 사라진 자료를 저장 성공으로 세지 않는다.
- **D-03:** 자료 ID가 같아도 파일명이나 첨부파일 목록이 바뀌면 변경된 자료만 보류해 다시 미리보기한다. 변경 전 승인을 새 파일의 다운로드 권한으로 해석하지 않는다.
- **D-04:** 재승인 화면에는 현재 승인 범위의 전체 과목·주차·자료 목록과 추가·삭제·변경된 항목을 함께 보여준다. 변경 항목을 강조해 사용자가 차이를 볼 수 있게 한다.

### 저장 성공 기준
- **D-05:** 출처와 실제 파일 존재가 검증된 기존 파일은 `저장 확인` 합계에 포함하되, 이번 실행에서 새로 다운로드한 파일 수와 기존 확인 파일 수를 분리한다. 단순 예정 경로, LMS 완료, `planned`, `viewed_only`는 저장 증거가 아니다.
- **D-06:** 자료 하나의 첨부파일 중 일부만 검증되면 검증된 파일은 파일별 성공으로 보존하고 자료 항목은 `부분 완료`로 표시한다. 자료 항목 전체의 충족은 필요한 파일이 모두 검증된 경우에만 인정한다.
- **D-07:** 서로 다른 자료 항목이 한 로컬 파일을 참조하면 물리적인 저장 파일 수는 한 번만 센다. 각 자료 항목은 해당 LMS 출처와 파일 연결을 독립적으로 검증한 경우에만 충족 수에 포함한다. 파일 수와 충족된 자료 항목 수를 별도로 보고한다.
- **D-08:** 재개 시점과 최종 보고 직전에 저장 파일을 다시 확인한다. 파일이 이동·삭제되었거나 검증할 수 없으면 현재 저장 성공 수에서 제외하고 해당 항목을 미해결로 돌린다. 과거 성공 기록은 감사 증거로 보존할 수 있지만 현재 성공으로 사용하지 않는다.

### 부분 실패와 재시도
- **D-09:** 한 과목의 조회 또는 다운로드가 실패해도 다른 과목의 독립된 승인 항목은 계속 처리한다. 확인된 성공 증거를 보존하고 실패 과목과 다음 조치를 분리한다. CoursePilot의 전역 치명적 오류나 계약·스키마 오류는 기존 fail-closed 규칙에 따라 중단한다.
- **D-10:** 일시적인 파일별 실패는 승인된 자원 한도 안에서 실패 파일만 자동 재시도한다. 이미 검증된 파일은 다시 다운로드하지 않는다. 같은 실패가 반복되면 Phase 15의 비진행·중단 정책을 적용한다. 효과 결과가 불확실한 경우에는 먼저 출처와 파일을 조정하며, 조정 불가능한 `unknown`을 임의 재시도하지 않는다.
- **D-11:** CoursePilot의 `viewed_only`는 미저장으로 남기고 수동 확인 조치를 표시한다. 동일한 결과를 자동 반복하지 않으며, LMS 자료 상태가 바뀐 경우 새 미리보기와 승인 범위를 확인한다.
- **D-12:** 유효한 결과 JSON에서 `downloaded`라고 보고했더라도 `saved_path`의 실제 파일이 없으면 해당 파일만 검증 실패로 처리하고 성공 수에서 제외한다. 다른 파일의 유효한 검증 결과는 보존한다. 이는 항목별 검증 실패이며, 알 수 없는 스키마 버전이나 구조적으로 잘못된 결과를 수락한다는 뜻은 아니다.

### 결과 보고
- **D-13:** 결과는 전체 집계부터 보여준 뒤 과목·주차별 파일 상세를 표시한다. 신규 다운로드, 기존 확인, 미저장, 오류 수를 구분한다.
- **D-14:** 미저장 자료는 `viewed_only`, 다운로드 오류, 파일 검증 실패, 승인 후 목록 변경·소실 등 원인별 상태와 해당 다음 조치를 파일 또는 자료 항목에 연결해 표시한다.
- **D-15:** `저장 확인 / 대상` 진행률의 분모는 승인된 자료 목록이다. 이후 발견된 미승인 자료는 분모에 섞지 않고 `승인 대기`로 별도 표시한다.
- **D-16:** 보고서 마지막에는 미해결 자료별 다음 조치를 나열하고 자동 재시도 예정, 수동 확인 필요, 재승인 필요, 실행 차단을 구분한다. 전체 결과가 부분 완료 또는 차단 상태인지도 명확하게 표시한다.

### CoursePilot 공개 계약 선행 변경
- **D-17:** Phase 20은 CoursePilot 저장소의 공개 materials 계약을 선행 확장할 수 있다. 자료·파일별 선택 실행과 첨부 목록·완전성·버전 증거를 지원한 뒤 alpha-AOS 커넥터를 연결한다. 설치된 스킬의 공개 계약과 CLI 결과에 없는 내부 Python 함수만 직접 호출하는 경로는 승인된 통합 계약으로 보지 않는다. 이는 2026-10-09의 사용자 선택으로 기존 CoursePilot 구현 변경 금지 범위를 대체한다.

### the agent's Discretion
- 내부 manifest, 파일 정체성 증거, 상태 코드의 구체적인 자료 구조와 표시 순서. 위 항목별 판단, 승인 경계, 현재 파일 검증, 정확한 집계는 유지한다.
- 승인된 한도와 기존 비진행 규칙 안에서 일시적 오류의 재시도 간격과 횟수. 성공 항목의 중복 실행과 불확실한 효과의 맹목적 재시도는 허용하지 않는다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위와 요구사항
- `.planning/PROJECT.md` — GSD 단일 상태 권한, 명시적 작업 승인, 비밀값과 파일 변경 안전 경계.
- `.planning/REQUIREMENTS.md` — TOOL-01, TOOL-02, TOOL-04의 버전 계약, CoursePilot 자료 저장 증거, 항목별 오류 요구사항.
- `.planning/ROADMAP.md` — Phase 20 목표, 구현 범위, 성공 기준 및 검증 범위.

### 승인된 설계와 선행 결정
- `docs/design/autonomous-work/README.md` — 일반 작업 커넥터, 효과 조정, CoursePilot 미리보기·실행·검증과 종료 코드 의미.
- `docs/design/autonomous-work/WORKFLOW.md` — GSD 단계별 기능 호출 증거와 일반 작업 연결.
- `docs/design/autonomous-work/VALIDATION.md` — 부분 성공, 알 수 없는 스키마, 악성 LMS 텍스트, 저장 파일 소실 검증 사례.
- `20-UPSTREAM-CONTRACT.md` — 승인된 CoursePilot 공개 계약 확장의 실행 전 검증 기준.
- `.planning/phases/14-contract-and-vertical-tracer/14-CONTEXT.md` — 계약 승인과 기준별 수락의 출발점.
- `.planning/phases/15-durable-supervisor-and-effect-ledger/15-CONTEXT.md` — 안정적 효과 키, 복구 시 출처 조정, `unknown` 정지, 비진행·한도 정책.
- `.planning/phases/17-gsd-lifecycle-bridge/17-CONTEXT.md` — GSD 상태 소유권과 계약 범위 밖 결정 시 대기.
- `.planning/phases/18-capability-fabric-and-automatic-invocation/18-CONTEXT.md` — 적용 가능한 기능의 실제 호출 영수증과 오류의 정직한 표시.
- `.planning/phases/19-structured-independent-review/19-CONTEXT.md` — 정확한 대상·증거를 확인하는 독립 리뷰와 잘못된 보고서 거부.

CoursePilot 스킬과 `JSON_CONTRACT.md`는 설치된 로컬 런타임에서 해석한다. 사용자별 설치 경로나 자격 증명 파일을 고정 참조 또는 저장소 산출물로 만들지 않는다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/task-contract.ts`와 `schemas/task-contract.schema.json`은 승인된 작업 범위, 기준, 효과 및 다이제스트의 현재 출발점이다. 현재 효과와 측정은 개발 작업 중심이므로 일반 작업 계약 확장이 필요하다.
- `src/core/task-effects.ts`는 안정적 효과 키, 상태 전이, 중단 후 출처 증거 조정을 제공한다. 현재 조정 대상은 저장소 파일·Git·의존성 변화다.
- `src/core/task-run.ts`, `src/core/task-supervisor.ts`, `src/core/task-verdict.ts`는 실행, 복구, 기준별 판정과 다음 조치의 통합 지점이다.
- `src/core/validation.ts`와 `src/core/process.ts`는 버전 계약 검증 및 범위가 제한된 외부 CLI 호출에 재사용할 수 있다.

### Established Patterns
- 승인된 정확한 계약과 관측된 효과를 분리한다. 효과가 불확실하면 출처 증거로 먼저 조정하고 증명할 수 없으면 `unknown`으로 멈춘다.
- 리뷰어 또는 도구의 성공 주장만으로 수락하지 않는다. 파일 존재와 LMS 항목 정체성 등 독립적인 증거가 필요하다.
- GSD만 `.planning/` 라이프사이클 상태를 쓰고 alpha-AOS 운영 저널과 영수증은 외부 사용자 상태에 둔다.

### Integration Points
- 일반 커넥터의 preview/perform/reconcile/verify 결과는 기존 계약·효과 원장·수퍼바이저·리뷰 판정으로 이어져야 한다.
- CoursePilot 어댑터는 로컬 스킬과 버전 계약을 실행 시 해석하고, stdout JSON과 종료 코드를 파싱한다. LMS 문자열은 지시가 아닌 데이터로 취급한다.
- 사람용 결과와 JSON 진단은 기존 `src/cli.ts` 및 `src/format.ts` 출력 경로에 연결한다. 자연어 진입과 지속 CLI 제어의 추가 범위는 Phase 21에 남긴다.

</code_context>

<specifics>
## Specific Ideas

- 사용자는 새·변경된 자료만 보류하면서 승인된 나머지는 진행하길 원한다. 재승인에는 전체 범위와 변경 내역이 함께 보여야 한다.
- 물리적 파일 수와 충족된 LMS 자료 항목 수는 서로 다른 지표다. 공유 파일을 두 번 저장했다고 표현하지 않는다.
- `viewed_only`와 `downloaded`이지만 실제 파일이 없는 경우는 서로 다른 미저장 사유이며, 각 항목에 다음 조치를 표시한다.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 20 scope.

</deferred>

---

*Phase: 20-General Tool Connectors*
*Context gathered: 2026-10-09*
