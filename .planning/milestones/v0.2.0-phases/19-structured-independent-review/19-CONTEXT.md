# Phase 19: Structured Independent Review - Context

**Gathered:** 2026-10-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 19 makes the independent review of an exact artifact revision structured and actionable. It validates report identity and evidence, classifies and reconciles findings, routes confirmed defects through GSD repair, and performs an independent final review of required features, integration, architecture, and test evidence before a development milestone can be accepted. It implements REV-02..05; the approved task contract and prior GSD decisions remain the scope authority.

</domain>

<decisions>
## Implementation Decisions

### 리뷰 증거의 구체성
- **D-01:** 차단 결함에는 정확한 파일·코드 또는 검사 위치, 확인 가능한 증거 참조, 재현 절차를 필수로 한다. 통과 판정은 실제 검사 기록을 참조하고, `unknown`에는 검증할 수 없는 이유를 명시한다.
- **D-02:** 명령으로 재현하기 어려운 아키텍처 결함은 위반한 승인 규칙과 해당 파일·코드 위치를 제시하고 독립적으로 직접 확인한다. 실행 재현이 가능하면 그 절차와 결과도 기록한다. 리뷰어의 설명만으로 결함을 확정하지 않는다.
- **D-03:** 한 기준이라도 필수 증거가 빠지거나 모호하면 보고서 전체를 거부하고 다시 요청한다. 다른 행의 통과 판정을 골라 수락하지 않는다.
- **D-04:** 보고서가 가리키는 파일 또는 검사 기록을 실제로 찾고 읽을 수 있는지 확인한다. 참조가 해소되지 않으면 보고서 전체를 유효한 판정으로 사용하지 않는다. 리비전 드리프트에 따른 기존 무효화 규칙도 유지한다.

### 결함 등급과 범위
- **D-05:** 필수 기능 누락이나 승인된 안전·아키텍처 제약 위반은 수락 차단 결함이다. 일반적인 유지보수 개선과 코드 스타일 차이는 권고로 분류한다. 차단 결함은 앞선 단계에서 정한 재현 또는 객관적 확인 절차를 거쳐야 GSD 수정 작업이 된다.
- **D-06:** 계약 범위 밖에서 발견된 기존 문제가 이번 결과 또는 필수 증거의 신뢰성을 훼손하면 차단한다. 이번 수락과 무관한 문제는 별도 제안으로 분리한다.
- **D-07:** 아키텍처 차단 판정의 근거는 승인된 계약, 요구사항, 설계 문서의 규칙과 확인 가능한 위반 위치·영향이다. 암묵적인 코드 스타일 선호만으로 차단하지 않는다.
- **D-08:** 차단 사유가 아닌 범위 밖 제안은 나중에 사람이나 에이전트가 검토할 수 있는 별도 임시 파일로 보관한다. 검토자는 공식 GSD 후속 작업으로 옮긴 뒤 파일을 정리하거나 제안을 폐기할 수 있다. 결론 전까지 파일을 유지하며, 현재 계약이나 GSD 작업을 자동 확장하지 않는다. 사람이 진행 상황을 물으면 에이전트는 대기 중인 제안 파일을 확인하고 그 존재를 답변에 알린다.

### 중복 결함과 해결 이력
- **D-09:** 확인된 한 원인이 여러 필수 기준에 영향을 준다면 GSD 수정 작업 하나에 해당 기준을 모두 연결한다. 각 기준의 판정과 증거는 독립적으로 추적한다. 기존의 기준·실패 지문은 중복 후보 식별에 사용한다.
- **D-10:** 결함을 `resolved`로 표시하려면 원래 재현 절차 또는 직접 확인 가능한 규칙 위반을 새 산출물에서 다시 확인하고, 연결된 모든 기준의 새 판정을 기록한다. 앞서 결정된 전체 계약 기준 재검증과 새 리비전·새 세션 리뷰도 수행한다. GSD 수정 작업 완료만으로 해결을 선언하지 않는다.
- **D-11:** 해결된 결함은 새 리비전에서 같은 실패가 새로운 증거로 확인될 때만 다시 연다. 최초 발견, 수정, 재발의 리비전과 증거를 한 이력에 보존한다. 새 실패가 없으면 과거 결함을 재개하지 않는다.
- **D-12:** 유사한 오류 문구나 실패 지문은 중복 후보일 뿐이다. 서로 다른 원인으로 확인되면 결함과 수정 작업을 분리한다.

### 최종 종합 리뷰
- **D-13:** 종합 리뷰는 계획과 필수 게이트를 마친 마일스톤 완료 후보에 대해 최종 수락 전에 수행한다. 개별 구현 리뷰와 필수 게이트는 계속 적용한다. 종합 리뷰 뒤 수정이 생기면 변경된 리비전에 대해 다시 검토한다.
- **D-14:** 모든 필수 요구사항에 대해 구현 위치와 자동 검사·독립 리뷰 증거를 확인한다. 빠진 항목은 확인되지 않은 상태 또는 확인된 결함으로 남기며 완료 기록만으로 통과시키지 않는다.
- **D-15:** Phase 사이의 실제 사용자 흐름과 승인, GSD 단일 상태 소유권, 리뷰어 독립성 등 승인된 핵심 제약을 코드와 실패 사례 검사로 확인한다. 최종 리뷰는 기능 누락, 통합, 아키텍처, 테스트 증거를 모두 다룬다.
- **D-16:** 터미널 최종 결과는 전체 판정과 함께 각 필수 기준의 자동 검사 결과, 리뷰어 신원, 증거 참조, 남은 `unknown` 및 다음 조치를 보여준다. 검토 대기 중인 범위 밖 제안 파일의 존재도 알린다.

### the agent's Discretion
- 보고서, 증거 위치 및 결함 이력의 내부 자료 구조와 표시 순서. 위 필수 정보, 전체 보고서 거부 조건, 정확한 리비전 결합을 유지한다.
- 임시 제안 파일의 구체적인 명명 및 내부 형식. 결정 전 보관, 진행 상황에서의 발견, 공식 GSD 후속 작업 또는 폐기 후 정리 규칙을 유지한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위와 요구사항
- `.planning/PROJECT.md` — GSD 단일 상태 권한, 명시적 계약·승인, 독립 리뷰와 안전 제약.
- `.planning/REQUIREMENTS.md` — REV-02..05의 보고서, 최종 리뷰, 무효화, 범위 밖 제안 요구사항.
- `.planning/ROADMAP.md` — Phase 19 목표, 구현 단면, 성공 기준과 검증 시나리오.

### 승인된 리뷰 설계와 선행 결정
- `docs/design/autonomous-work/README.md` — 리뷰·수리 정책, 결과 검증, 결함 중복 제거 및 종합 리뷰 범위.
- `docs/design/autonomous-work/WORKFLOW.md` — 구현 리뷰어 입력, 객관적 결함 확인, GSD 수리 연결과 완료 조건.
- `docs/design/autonomous-work/VALIDATION.md` — 오래된 리뷰, 중복 결함, 범위 밖 제안의 적대적 시나리오와 릴리스 검증 기준.
- `.planning/phases/14-contract-and-vertical-tracer/14-CONTEXT.md` — 측정 기준과 독립 리뷰에 따른 수락 판정의 선행 결정.
- `.planning/phases/15-durable-supervisor-and-effect-ledger/15-CONTEXT.md` — 저널, 실패 지문, 비진행 전략과 정지 정책.
- `.planning/phases/16-composable-harness-roles/16-CONTEXT.md` — 새 읽기 전용 리뷰어 세션과 하네스·모델 독립성.
- `.planning/phases/17-gsd-lifecycle-bridge/17-CONTEXT.md` — GSD 갭 라우팅, 전체 기준 재검증, 리뷰 목격 영수증과 리비전 무효화.
- `.planning/phases/18-capability-fabric-and-automatic-invocation/18-CONTEXT.md` — 리뷰 경계에서 요구되는 기능 호출·영수증 및 진행 상황 증거 표시.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/task-run.ts`와 `src/core/task-verdict.ts`는 기준별 `pass|fail|unknown`, 리뷰 보고서, 결함, 재현 입력, 제안 및 보고서 무효화의 기존 출발점이다.
- `src/core/task-check.ts`는 실행 가능한 결함 재현의 별도 확인 경로를 제공한다. 명령 재현이 어려운 아키텍처 위반은 추가로 객관적 확인 경로가 필요하다.
- `src/core/task-review-witness.ts`는 리뷰어 세션·산출물 다이제스트·대상 리비전 영수증을 기록하고 확인한다.
- `src/core/task-gap-router.ts`, `src/core/task-strategy.ts`, `src/core/task-supervisor.ts`는 GSD 갭 라우팅, 실패 지문, 반복 실패 처리의 기존 경로다.

### Established Patterns
- 리뷰어의 텍스트 주장만으로 통과나 차단 결함을 확정하지 않는다. 측정·객관적 확인과 정확한 계약·산출물·세션 결합이 필요하다.
- GSD는 `.planning/` 라이프사이클 상태를 소유한다. alpha-AOS의 시도, 수리, 리뷰 영수증과 운영 기록은 별도 사용자 상태에 둔다.
- 오래되거나 잘못된 리뷰 및 필수 영수증 결손은 수락을 막는다. 결과 보고서는 검증할 수 없는 상태를 `unknown`으로 유지한다.

### Integration Points
- 보고서 검증과 판정은 `src/core/task-verdict.ts`, 리뷰 디스패치와 결과 결합은 `src/core/task-run.ts` 및 `src/core/task-review-witness.ts`에 연결된다.
- 결함 확인·중복·수리 이력은 `src/core/task-check.ts`, `src/core/task-gap-router.ts`, `src/core/task-strategy.ts`, `src/core/task-supervisor.ts`와 만난다.
- 사람용 진행 상황과 최종 근거 표시에는 `src/core/task-doctor.ts`, `src/cli.ts`, `src/format.ts`의 기존 출력 경로가 있다.

</code_context>

<specifics>
## Specific Ideas

- 사용자는 범위 밖 제안을 버리지 않고 별도 임시 파일에 보관해 사람이나 에이전트가 나중에 검토하기를 원한다. 진행 상황을 묻는 사람은 파일을 일일이 찾지 않아도 에이전트의 답변에서 대기 중인 제안이 있음을 알아야 한다.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. 범위 밖 제안은 이 단계에서 정의한 보류 절차로 관리하며, 구체적인 제안 자체는 이후 리뷰에서 발견될 때만 기록한다.

</deferred>

---

*Phase: 19-Structured Independent Review*
*Context gathered: 2026-10-08*
