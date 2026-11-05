# Phase 28: Predictable Strict and Flexible Intake - Discussion Log

> **Audit trail only.** 연구·계획·실행의 입력은 `28-CONTEXT.md`이다. 이 문서는 검토한 대안과 자동 선택 경위를 남긴다.

**Date:** 2026-11-02
**Phase:** 28-predictable-strict-and-flexible-intake
**Mode:** `28 --auto`
**Areas discussed:** 공통 판정과 명시 요청의 우선순위, 여섯 선택지의 표시와 응답 처리, 현재 작업의 식별과 선택의 수명, 단순 작업 면제와 불확실한 범위, flexible 모드·판정 이유·검증 경계

사용자가 engineering user proxy에 모든 gray area의 권장 선택을 명시적으로 위임했다. 질문 UI는 호출하지 않았다. 아래 “선택”은 proxy의 권장안 자동 선택이며 실제 사용자가 각 질문에 직접 답했다고 주장하지 않는다. 선행 Phase 27 결정과 승인 요구사항은 다시 질문하지 않았다. 모든 영역을 한 번씩 다뤘으며 추가 gap 탐색 pass를 실행하지 않는다.

---

## 공통 판정과 명시 요청의 우선순위

| Question | Option | Selected |
|---|---|---|
| harness마다 별도 판단할 것인가? | 공통 typed decision과 검증 가능한 근거 사용 (권장) | ✓ |
| harness마다 별도 판단할 것인가? | harness별 prose 판단만 사용 |  |
| 분기 순서는 무엇인가? | 안전 경계 확인 후 명시 명령 → 명시 style → 현재 작업 연속성 → 단순 작업 → mode별 intake (권장) | ✓ |
| 분기 순서는 무엇인가? | 단순 작업이나 이전 style을 먼저 적용 |  |
| 직접 GSD 명령의 의미를 바꿀 것인가? | 명령·인수·호출 시점과 native gate 보존 (권장) | ✓ |
| 직접 GSD 명령의 의미를 바꿀 것인가? | 일반 chooser나 다른 workflow로 재라우팅 |  |
| 명시 style이 불완전하면 어떻게 할 것인가? | 확정된 선택을 보존하고 누락된 축만 질문 (권장) | ✓ |
| 명시 style이 불완전하면 어떻게 할 것인가? | 전체 chooser 반복 또는 임의 기본값 |  |

**Proxy's choices:**

- **D-01:** [auto] harness마다 별도 판단할 것인가? → 공통 typed decision과 검증 가능한 근거 사용. 근거: 같은 입력과 근거가 같은 분기·이유를 내도록 한다.
- **D-02:** [auto] 분기 순서는 무엇인가? → 안전 경계 확인 후 명시 명령 → 명시 style → 현재 작업 연속성 → 단순 작업 → mode별 intake. 근거: 명시적 선택이 자동 분류에 의해 바뀌지 않는다.
- **D-03:** [auto] 직접 GSD 명령의 의미를 바꿀 것인가? → 명령·인수·호출 시점과 native gate 보존. 근거: ENTRY-07의 선택한 workflow/timing을 유지한다.
- **D-04:** [auto] 명시 style이 불완전하면 어떻게 할 것인가? → 확정된 선택을 보존하고 누락된 축만 질문. 근거: 불필요한 재선택 없이 모호성만 제거한다.

**Notes:** 이 영역 완료 시 `28-DISCUSS-CHECKPOINT.json`에 누적 결정을 저장했다. 최종 canonical context 작성 후 checkpoint를 정리한다.

---

## 여섯 선택지의 표시와 응답 처리

| Question | Option | Selected |
|---|---|---|
| strict의 새 substantial task에 무엇을 보여줄 것인가? | 여섯 정확한 label과 승인된 짧은 설명 모두 표시 (권장) | ✓ |
| strict의 새 substantial task에 무엇을 보여줄 것인가? | 추천 일부만 표시하거나 자동 선택 |  |
| native UI가 여섯 항목을 지원하지 않으면? | 전체 여섯 항목의 번호 목록과 텍스트 응답 (권장) | ✓ |
| native UI가 여섯 항목을 지원하지 않으면? | 항목 누락 또는 다른 분류로 숨김 |  |
| 빈 응답·잘못된 번호·다른 질문에는? | pending 선택을 유지하고 필요한 재응답만 요청 (권장) | ✓ |
| 빈 응답·잘못된 번호·다른 질문에는? | 첫 항목으로 진행 |  |
| 선택 직후 무엇을 전달할 것인가? | 작업에 묶인 선택과 근거를 확인하고 downstream에 전달 (권장) | ✓ |
| 선택 직후 무엇을 전달할 것인가? | 전역·프로젝트 선호로 저장 |  |

**Proxy's choices:**

- **D-05:** [auto] strict의 새 substantial task에 무엇을 보여줄 것인가? → 여섯 정확한 label과 승인된 짧은 설명 모두 표시. 근거: 선택 범위와 의미가 harness에 따라 달라지지 않는다.
- **D-06:** [auto] native UI가 여섯 항목을 지원하지 않으면? → 전체 여섯 항목의 번호 목록과 텍스트 응답. 근거: 실제 host 제약을 지키면서 ENTRY-01을 만족시킨다.
- **D-07:** [auto] 빈 응답·잘못된 번호·다른 질문에는? → pending 선택을 유지하고 필요한 재응답만 요청. 근거: 응답 부재를 실행 동의로 오인하지 않는다.
- **D-08:** [auto] 선택 직후 무엇을 전달할 것인가? → 작업에 묶인 선택과 근거를 확인하고 downstream에 전달. 근거: 초기화나 실행 단계에서 불필요하게 다시 묻지 않는다.

**Notes:** 이 영역 완료 시 `28-DISCUSS-CHECKPOINT.json`에 누적 결정을 저장했다. 최종 canonical context 작성 후 checkpoint를 정리한다.

---

## 현재 작업의 식별과 선택의 수명

| Question | Option | Selected |
|---|---|---|
| 같은 작업이라는 근거는 무엇인가? | canonical root·bounded task ID·목표/범위·선택·상태 참조 (권장) | ✓ |
| 같은 작업이라는 근거는 무엇인가? | 최근 대화나 마지막 style만 사용 |  |
| 어떤 후속 요청이 선택을 유지하는가? | 동일 목표의 수정·테스트·검증·상태 확인 (권장) | ✓ |
| 어떤 후속 요청이 선택을 유지하는가? | 같은 프로젝트의 모든 후속 요청 |  |
| 완료·취소·중단 후에는? | 완료/취소 선택 종료, 중단은 exact task 참조로만 재개 (권장) | ✓ |
| 완료·취소·중단 후에는? | 종료 후에도 다음 작업에 style 유지 |  |
| 정책 변경이나 style 변경 요청이 오면? | 정책은 다음 intake에 반영, 현재 style 변경은 명시 요청과 기존 gate로 처리 (권장) | ✓ |
| 정책 변경이나 style 변경 요청이 오면? | 진행 중 workflow/계약을 자동 교체 |  |

**Proxy's choices:**

- **D-09:** [auto] 같은 작업이라는 근거는 무엇인가? → canonical root·bounded task ID·목표/범위·선택·상태 참조. 근거: 새 작업과 후속 수정을 설명 가능한 근거로 구분한다.
- **D-10:** [auto] 어떤 후속 요청이 선택을 유지하는가? → 동일 목표의 수정·테스트·검증·상태 확인. 근거: ENTRY-03의 검증 연속성과 새 작업 선택을 함께 지킨다.
- **D-11:** [auto] 완료·취소·중단 후에는? → 완료/취소 선택 종료, 중단은 exact task 참조로만 재개. 근거: 자동 재사용과 복구 가능성을 구분한다.
- **D-12:** [auto] 정책 변경이나 style 변경 요청이 오면? → 정책은 다음 intake에 반영, 현재 style 변경은 명시 요청과 기존 gate로 처리. 근거: Phase 27의 freshness와 승인된 실행 경계를 보존한다.

**Notes:** 이 영역 완료 시 `28-DISCUSS-CHECKPOINT.json`에 누적 결정을 저장했다. 최종 canonical context 작성 후 checkpoint를 정리한다.

---

## 단순 작업 면제와 불확실한 범위

| Question | Option | Selected |
|---|---|---|
| 단순함을 어떻게 판정할 것인가? | 명확한 대상·결과와 별도 설계/조사/다단계 구현 불필요의 근거 (권장) | ✓ |
| 단순함을 어떻게 판정할 것인가? | 작업명 allowlist 또는 파일 개수만 사용 |  |
| 어떤 예가 면제이고 반례는 무엇인가? | 동일 기준의 단순/복잡 쌍을 고정 (권장) | ✓ |
| 어떤 예가 면제이고 반례는 무엇인가? | 작업 이름별 무조건 면제 |  |
| 증거가 부족하면 strict chooser를 즉시 띄울 것인가? | 범위를 가르는 최소 질문 후 재판정 (권장) | ✓ |
| 증거가 부족하면 strict chooser를 즉시 띄울 것인가? | 임의 면제 또는 모든 경우 전체 질문 반복 |  |
| 면제 결정 후 범위가 커지면? | 확대 작업 전 안전 경계에서 재판정 (권장) | ✓ |
| 면제 결정 후 범위가 커지면? | 기존 면제를 전체 확장에 계속 적용 |  |

**Proxy's choices:**

- **D-13:** [auto] 단순함을 어떻게 판정할 것인가? → 명확한 대상·결과와 별도 설계/조사/다단계 구현 불필요의 근거. 근거: 단순/복잡 쌍에 같은 기준을 적용한다.
- **D-14:** [auto] 어떤 예가 면제이고 반례는 무엇인가? → 동일 기준의 단순/복잡 쌍을 고정. 근거: 허위 면제를 막는 회귀 기준이 된다.
- **D-15:** [auto] 증거가 부족하면 strict chooser를 즉시 띄울 것인가? → 범위를 가르는 최소 질문 후 재판정. 근거: ENTRY-05의 narrow clarification을 유지한다.
- **D-16:** [auto] 면제 결정 후 범위가 커지면? → 확대 작업 전 안전 경계에서 재판정. 근거: 작은 요청이 무승인 큰 작업으로 번지는 것을 막는다.

**Notes:** 이 영역 완료 시 `28-DISCUSS-CHECKPOINT.json`에 누적 결정을 저장했다. 최종 canonical context 작성 후 checkpoint를 정리한다.

---

## flexible 모드·판정 이유·검증 경계

| Question | Option | Selected |
|---|---|---|
| flexible에서도 여섯 항목을 강제할 것인가? | 기존 adaptive intake 유지, 명시 선택과 현재 task 연속성 존중 (권장) | ✓ |
| flexible에서도 여섯 항목을 강제할 것인가? | strict chooser 강제 또는 무조건 autopilot |  |
| 판정 이유는 얼마나 보여줄 것인가? | 한 문장 이유 + 필요 시 bounded text/JSON 근거 (권장) | ✓ |
| 판정 이유는 얼마나 보여줄 것인가? | 불투명한 분기 또는 전체 transcript/chain-of-thought |  |
| 분류와 선택이 어떤 권한을 부여하는가? | workflow 선호만 정하고 기존 효과·동의 경계 유지 (권장) | ✓ |
| 분류와 선택이 어떤 권한을 부여하는가? | 분류 결과를 포괄 실행 승인으로 사용 |  |
| Phase 28에서 무엇을 검증하고 무엇을 넘길 것인가? | ENTRY-01–07의 공통 분기·실제 intake 연결·행동 쌍 검증 (권장) | ✓ |
| Phase 28에서 무엇을 검증하고 무엇을 넘길 것인가? | 전체 여섯 실행 pipeline과 신규 bootstrap까지 구현 |  |

**Proxy's choices:**

- **D-17:** [auto] flexible에서도 여섯 항목을 강제할 것인가? → 기존 adaptive intake 유지, 명시 선택과 현재 task 연속성 존중. 근거: ENTRY-06과 모드 구분을 보존한다.
- **D-18:** [auto] 판정 이유는 얼마나 보여줄 것인가? → 한 문장 이유 + 필요 시 bounded text/JSON 근거. 근거: 예측 가능성과 기밀성·context 한도를 함께 지킨다.
- **D-19:** [auto] 분류와 선택이 어떤 권한을 부여하는가? → workflow 선호만 정하고 기존 효과·동의 경계 유지. 근거: intake 편의가 권한 확장으로 연결되지 않는다.
- **D-20:** [auto] Phase 28에서 무엇을 검증하고 무엇을 넘길 것인가? → ENTRY-01–07의 공통 분기·실제 intake 연결·행동 쌍 검증. 근거: 현재 phase의 결과를 완성하면서 다음 phase 범위를 침범하지 않는다.

**Notes:** 이 영역 완료 시 `28-DISCUSS-CHECKPOINT.json`에 누적 결정을 저장했다. 최종 canonical context 작성 후 checkpoint를 정리한다.

---

## Agent 재량

공통 타입/inspection command 명칭, 출력 배치, bounded task context의 전달 방식과 fixture 세부사항은 후속 연구·계획에 맡긴다. 전체 선택 문구, 우선순위, task 수명과 효과/동의 경계는 CONTEXT의 결정에 따른다. 새 lifecycle registry나 project style 기본값은 만들지 않는다.

## Deferred Ideas

Phase 29의 초기화/복구와 원래 요청 재개, Phase 30의 실제 여섯 실행 pipeline과 quality binding, Phase 31의 최종 cross-host/배포 증거는 이번 토론의 구현 범위로 끌어오지 않는다. 새 todo는 없었다. 기존 회귀 debt와 release/push/global/publication holds는 유지한다.

## Stop Boundary

사용자의 “Stop immediately after CONTEXT.md is written and committed”가 기본 `--auto` chain과 커밋 후 STATE 기록보다 우선한다. CONTEXT와 이 감사 기록만 명시적으로 stage/commit하고 종료하며 plan-phase·구현·다른 phase를 시작하지 않는다.
