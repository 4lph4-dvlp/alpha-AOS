# Phase 28: Predictable Strict and Flexible Intake - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning
**Discussion mode:** `28 --auto` — 사용자가 autonomous engineering user proxy에 모든 gray area의 권장안 선택을 위임했다. 아래 결정은 proxy의 자동 선택이며 개별 질문에 대한 직접 사용자 답변을 뜻하지 않는다.

<domain>
## Phase Boundary

ENTRY-01–ENTRY-07을 충족하는 예측 가능한 공통 task intake를 제공한다. strict의 새 substantial task에 여섯 execution style을 제시하고, 명시 style/직접 GSD 명령, 같은 작업의 후속 수정·검증, 근거가 있는 단순 작업, flexible의 adaptive intake를 일관되게 구분한다. 사용자는 왜 묻거나 생략하는지 제한된 근거를 확인할 수 있어야 한다.

Phase 27의 canonical root와 최신 strict/flexible 정책을 재사용한다. 저장하는 프로젝트 선호는 strict/flexible뿐이다. 정책 부재는 쓰기 없는 strict이며 잘못된 정책은 진단하고 막는다. 정책 schema·root 의미를 다시 설계하지 않는다. intake는 workflow와 다음 필요한 동작을 정하지만 GSD lifecycle/state와 실행 권한을 대신하지 않는다.

이 slice는 토론 문서만 작성한다. CONTEXT와 DISCUSSION-LOG를 커밋한 직후 종료한다. 사용자의 명시적 종료 지시에 따라 기본 `--auto` chain, 후속 STATE 기록/커밋, plan-phase·구현·다른 phase 작업을 수행하지 않는다. 이 문서는 Phase 28 구현이나 검증 완료 선언이 아니다.

</domain>

<decisions>
## Implementation Decisions

### 공통 판정과 명시 요청의 우선순위

- **D-01:** 공통 intake decision은 explicit-command, explicit-style, continuation, simple-operation, substantial-work, clarification-needed를 구분하고 effective mode, canonical root, policy source/revision, 제한된 근거, 다음 동작을 반환한다. 설명과 JSON은 같은 결과를 사용한다. 분류 이름·타입의 최종 철자는 연구·계획 재량이며, 자연어 해석만을 유일한 결정 근거로 삼지 않는다. 불명확한 사실은 unknown으로 남긴다.
- **D-02:** 유효한 root·정책 및 적용 가능한 tree-off/권한 경계 확인을 공통 전제로 두고, 명시 GSD 명령 → 명시 style → 검증된 현재 작업의 연속성 → 근거가 충족된 단순 작업 → strict/flexible 일반 intake 순으로 분기한다. 서로 충돌하는 명시 명령·style은 한 가지 필요한 질문으로 해소하며 임의 우선 적용하지 않는다. 명시 full/phase 요청은 단순 작업 면제로 downgrade하지 않는다.
- **D-03:** 직접 호출한 GSD 명령은 여섯 style chooser나 일반 두 경로 질문을 추가하지 않고 그대로 연결한다. 명령의 인수·대상 phase·실행 시점과 native prerequisite/checkpoint를 보존한다. 예를 들어 discuss-phase만 호출했는데 실행까지 확대하지 않는다. 명령 이름을 인용한 설명·코드 블록은 직접 호출로 오인하지 않는다. 일반 shortcut 금지 안내 중 충돌하는 부분은 이 명시 호출 예외와 양립하도록 정리한다.
- **D-04:** 여섯 canonical label 또는 의미가 분명한 동등 표현은 chooser 없이 정규화한다. '오토파일럿으로'처럼 실행 방식만 정해졌다면 그 선택을 유지하고 quick/quick-full/phase 중 필요한 차이만 묻는다. 서로 다른 style이 충돌하면 의도를 확인한다. 선택은 실행 권한·ready 상태·exact contract 승인이나 start를 대체하지 않는다.

### 여섯 선택지의 표시와 응답 처리

- **D-05:** strict에서 명시 선택이나 현재 작업 연결이 없는 새 substantial task에는 REQUIREMENTS.md의 여섯 label과 설명을 승인된 순서로 모두 보여주고 사용자가 선택하기 전에는 실행하지 않는다. 추천을 표시할 수 있어도 자동 선택·프로젝트 style 기본값으로 바꾸지 않는다. 이 discuss의 --auto 위임은 제품의 일반 strict intake 자동 선택 권한이 아니다.
- **D-06:** 실제 native question UI가 여섯 항목을 온전히 지원할 때는 이를 사용한다. 지원이 없거나 옵션 수 제한이 있으면 여섯 항목을 한 번에 보여주는 1–6 번호 텍스트 fallback을 사용한다. 일부 항목을 숨기거나 지원되지 않는 UI를 지원한다고 주장하지 않는다. 번호와 정확한 label을 같은 canonical style로 처리한다.
- **D-07:** 빈 응답, 잘못된 번호, 모호한 label은 선택 완료가 아니다. pending task와 알려진 사실을 유지하고 유효한 선택만 좁혀 요청한다. 사용자가 status·설명만 물으면 답한 뒤 pending 선택을 유지한다. 취소 시 선택을 버리고 실행하지 않는다. 명시적인 workflow --auto 권한은 해당 workflow 범위에서만 별도로 적용한다.
- **D-08:** 선택 후에는 대상 task와 canonical style을 짧게 확인하고 readiness/실행 연결에 전달할 bounded task context에 담는다. chooser 재표시를 막기 위해 선택을 프로젝트 설정에 저장하지 않는다. Phase 28은 실제 선택·분류·전달 계약과 검증을 완성하고, GSD 초기화/원래 요청 재개 및 여섯 실행 pipeline의 완성은 각각 Phase 29/30으로 남긴다.

### 현재 작업의 식별과 선택의 수명

- **D-09:** 현재 task는 canonical root, 명시적 task ID/reference, 짧은 목표·범위, 선택 style, 활성/종료에 대한 authoritative 참조로 식별한다. 기존 GSD task/quick/phase 및 승인 contract/run ID가 있으면 재사용한다. 아직 ID가 없는 intake에는 bounded pending 식별만 두며 새 lifecycle/state 엔진을 만들지 않는다. 전체 transcript, '같은 저장소', 마지막 실행 style만으로 연속성을 확정하지 않는다.
- **D-10:** 활성 목표의 후속 편집, 그 변경으로 실패한 테스트 수정, 검증 및 status 요청은 같은 작업으로 연결해 style을 유지한다. 새 독립 결과물·별도 bug fix·다른 root는 이전 style을 물려받지 않는다. 새 요청은 별도 task로 분류하되 기존 활성 작업을 완료·취소로 임의 전환하지 않는다. 두 작업 사이 연결이 불분명하면 '현재 작업의 후속인가, 별도 작업인가'만 묻는다.
- **D-11:** 완료·취소는 현재 선택의 수명을 끝내며 다음 독립 substantial task는 strict에서 다시 묻는다. 중단·실패·transport yield를 완료로 추정하지 않는다. 재개는 같은 root와 정확한 기존 task/GSD/contract 참조를 확인한 경우에만 선택을 복원한다. 기억이나 짧은 handoff는 참조를 전달할 뿐 정책·승인·GSD 상태의 권위가 아니다. Phase 28에서 새 cross-session registry를 만들지 않는다.
- **D-12:** 다른 harness가 mode를 바꿔도 활성 task의 style·계약·계획을 자동 교체하지 않는다. 다음 intake는 최신 정책을 읽되 검증된 동일 task는 선택을 유지한다. 사용자가 현재 style 변경을 명시하면 변경 의도를 반영해 필요한 downstream gate로 넘기며, 실행 중 autopilot 계약을 덮어쓰거나 권한을 늘리지 않는다. 새/수정 contract가 필요하면 exact preview·승인·별도 start를 다시 거친다.

### 단순 작업 면제와 불확실한 범위

- **D-13:** simple-operation 면제에는 명확한 target과 기대 결과, 한정된 영향, 별도 설계·조사·다단계 구현이 필요 없다는 근거를 함께 요구한다. push/rename/README라는 이름, 파일 개수, 예상 토큰·시간만으로 면제하지 않는다. 요청과 필요한 최소 read-only 근거를 사용하며, 판정 과정 자체를 광범위 조사나 구현으로 확대하지 않는다.
- **D-14:** 명시한 branch/remote의 bounded push, 대상과 참조 영향이 확인된 국소 rename, 이미 주어진 README의 충실한 번역·기존 문서 링크 추가는 면제 예다. 충돌 해결·history rewrite가 필요한 push, 여러 subsystem/API·스키마 영향을 조사해야 하는 rename, 새 기능 설계·문서 구조 재설계가 필요한 README 요청은 이름이 같아도 면제가 아니다. 이는 이 논의에서 push를 승인한다는 뜻이 아니다.
- **D-15:** target/result/영향 범위가 불분명하면 clarification-needed와 누락된 사실을 반환하고, 예를 들어 '파일명만 변경하나요, 공개 API도 변경하나요?'처럼 분기를 가르는 질문 하나를 먼저 한다. 확인된 답으로 다시 판정한다. 끝내 불명확하면 실행을 보류하고 임의로 simple 또는 선택 완료로 만들지 않는다. 이미 substantial임이 명확하면 불필요한 사전 질문 없이 해당 mode의 intake로 간다.
- **D-16:** 면제는 해당 bounded operation에만 적용한다. 실행 전/중 새 근거로 별도 조사·다단계 구현이 필요해지면 이미 생긴 WIP를 보존하고 확대 작업 전에 재판정한다. strict의 새 substantial 범위에는 style을 묻고, 같은 활성 task의 수리라면 기존 style을 유지하되 추가 effect/contract 권한은 별도로 확인한다. 면제는 chooser와 강제 bootstrap만 생략하며 원래 작업의 권한·검증 gate를 생략하지 않는다.

### flexible 모드·판정 이유·검증 경계

- **D-17:** flexible은 기존 adaptive conversational/autopilot intake를 유지하며 매 새 substantial task에 여섯 항목을 의무화하지 않는다. 필요에 따라 간단한 권장 경로·누락 정보만 확인하되 명시 style·직접 GSD 명령·검증된 활성 task를 우선한다. flexible 자체로 autopilot을 선택하거나 실행하지 않으며 일반 conversational 작업에 불필요한 autopilot contract를 생성하지 않는다.
- **D-18:** intake는 '명시한 GSD 명령을 따릅니다', '현재 작업의 테스트 수정입니다', '대상·결과가 한정된 번역입니다'처럼 짧은 관찰 근거를 제공한다. inspection은 decision/reason, policy root/source/revision, task/style 참조, 충족·누락 evidence, 다음 필요한 동작을 bounded text/JSON으로 보여준다. raw transcript·내부 추론·임의 파일 내용·secret은 기록하지 않는다. Phase 27 mode 조회의 의미는 바꾸지 않는다.
- **D-19:** 어느 mode/분기/style도 tree-off, sandbox, allowed roots/effects, native prerequisite, 모델/effort, GSD single-writer 또는 exact autopilot 동의를 약화하지 않는다. style 선택과 명시 명령은 작업에 이미 주어진 권한 안에서 라우팅할 뿐이다. autopilot은 exact contract 검토·승인과 별도 start, 기존 isolated runner가 필요하며 chat inline 구현으로 대체하지 않는다.
- **D-20:** Phase 28에서 공통 판정/inspection과 owned alpha-aos-task intake 연결을 구현·검증하고, source/target integrity가 바뀌면 기존 lock/fixture도 맞춘다. 순수 decision fixture만으로 사용자 연결을 완료라고 하지 않는다. native UI와 번호 fallback, direct-command/style 우선순위, task 수명, simple/complex 쌍 및 flexible을 검증한다. 실제 native receipt·fixture·unverified를 구분한다. 구현 중 targeted checks, 최종 acceptance에서 full suite를 실행하며 기존 failed/not-run 회귀와 release/global/push hold를 유지한다.

### 고정 chooser 문구

아래 순서·label·짧은 설명은 승인된 `.planning/REQUIREMENTS.md`를 따른다. 한국어 label을 임의로 번역하거나 하이픈을 바꾸지 않는다. 영문 문서·내부 식별자는 이 label과 일대일로 연결한다.

| 번호 | Label | Short explanation |
|---|---|---|
| 1 | 대화형-quick | 현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리 |
| 2 | 대화형-quick-full | 작은 작업에 토론·조사·계획 검사·구현·검증 적용 |
| 3 | 대화형-phase | 로드맵과 Phase를 따라 필요한 사항을 질문하며 진행 |
| 4 | 오토파일럿-quick | 승인된 계약과 별도 실행기로 작은 작업 처리 |
| 5 | 오토파일럿-quick-full | 승인된 범위에서 작은 작업의 전체 품질 절차 수행 |
| 6 | 오토파일럿-phase | 승인된 로드맵 범위의 Phase들을 자율 진행 |

### Agent 재량

공통 decision 타입/필드의 최종 이름, inspection CLI의 구체적인 하위 명령/출력 배치, bounded pending context의 저장·전달 세부사항, 검증 fixture 구성은 연구·계획에서 기존 서비스와 호환되게 정한다. 결정의 관찰 동작·근거·권한 경계를 보존한다. 새 project preference, 독립 lifecycle registry, dependency 업그레이드나 native UI 지원을 가정하지 않는다. 정확한 제한값은 기존 schema/출력 관례를 확인해 정하고 무제한 transcript를 대안으로 쓰지 않는다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 승인된 범위와 선행 결정

- `.planning/PROJECT.md` — v0.6.0 목표와 수정된 task별 선택 원칙, GSD 단일 소유권과 안전 경계.
- `.planning/REQUIREMENTS.md` — ENTRY-01–ENTRY-07, 여섯 정확한 label/설명, BOOT/STYLE/PROVE와 범위 구분.
- `.planning/ROADMAP.md` — Phase 28 성공 기준·planning focus·validation emphasis와 milestone holds.
- `.planning/phases/27-shared-project-behavior-policy/27-CONTEXT.md` — root, 정책 freshness, policy-only/mixed 요청과 활성 task 불변 원칙.

### 기존 공통 정책·intake·배포 연결

- `src/core/behavior-policy.ts` — `ProjectBehaviorView`/`ProjectBehaviorInput`, canonicalRoot/projectId, mode/source/revision와 구조화된 오류.
- `src/core/evidence.ts`, `src/core/tree-policy.ts` — 기존 canonical root와 tree-off의 권위; 새 분류가 우회하지 않을 경계.
- `skills/alpha-aos-task/SKILL.md` — policy-only 우선 경로, 최신 정책 read, 기존 두 경로 intake와 exact approval/start 경계.
- `src/core/owned-skills.ts`, `catalog/stack.yaml`, `catalog/stack.lock.json` — 다섯 target의 공통 source 렌더링·동기화와 integrity.
- `src/cli.ts`, `src/format.ts` — 공통 서비스/CLI text·JSON 연결과 오류 표현.
- `docs/task-runtime-controls.md` — mode preference, 실행 권한 및 task runtime 제어의 기존 사용자 계약.

### 기존 task·GSD·권한 참조

- `src/core/task-contract.ts` — contract/task 식별, scope·effects·agent/resource policy와 digest 계약.
- `src/core/task-gsd-lifecycle.ts` — 기존 GSD step dispatch, bounded runtime packet과 progression 참조. 새 intake가 lifecycle을 복제하지 않을 기준.
- `src/core/task-effects.ts` — 구현 경로와 GSD planning 경로, 허용 effect 검사.

### 검증 시작점

- `test/behavior-policy.test.ts`, `test/project-mode-routing.test.ts` — 최신 정책·다른 target·root mismatch와 preference/authority 경계.
- `test/task-skill.test.ts`, `test/task-governance-hierarchy.test.ts`, `test/task-e2e-tracer.test.ts` — 기존 intake/shortcut 승인 가정. 변경된 명시 command 예외를 행동 검증과 함께 반영할 기준.
- `.planning/quick/261101-ww3-make-milestone-capable-gsd-full-profile-/` — 기존 worker-startup failure와 네 개 not-run suite의 미해결 증거. 이 phase의 통과로 과거 결과를 덮어쓰지 않는다.

이번 논의에서 새 외부 spec/ADR 또는 외부 API 자료는 추가하지 않았다. 설치된 GSD discuss-phase workflow와 로컬 승인 요구사항을 기준으로 했으며, 라이브러리/API 변경 연구는 수행하지 않았다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/core/behavior-policy.ts`의 공통 조회 결과는 root·mode·source/revision을 이미 제공한다. 별도 mode cache나 project style 설정 없이 다음 intake의 근거로 재사용할 수 있다.
- `skills/alpha-aos-task/SKILL.md`에는 policy-only 요청과 mixed mode 변경 우선 처리, 매 intake의 CLI read가 있다. 아직 일반 요청을 두 경로로만 나누고 shortcut을 일반적으로 intake 뒤에 둔다. Phase 28의 strict chooser와 direct-command 예외를 이 공통 진입점에 반영해야 한다.
- `src/core/owned-skills.ts`는 공통 skill을 target별로 렌더링한다. source/target integrity 검증과 기존 fixture를 함께 재사용한다.
- 기존 GSD/contract/run 참조와 runtime packet은 bounded continuity의 기반이다. 새로운 lifecycle 소유자를 만들지 않는다.

### Established Patterns

- CLI는 domain service의 결과를 text/JSON으로 표현한다. core 판정과 formatter가 각각 다른 결정을 내리지 않게 한다.
- 정책 조회는 읽기 전용이며 errors는 fail-closed다. chooser/inspection을 위해 설정이나 GSD placeholder를 만들지 않는다.
- project map은 2026-09-02 기준으로 오래되었다. map은 위치 안내에만 사용하고 현재 behavior-policy, skill source 및 기존 test와 대조했다. 오래된 dependency/기능 설명을 현재 사실로 취급하지 않는다.
- GSD만 authoritative task lifecycle을 갱신한다. intake context와 ECC handoff는 선택/참조를 전달하는 자료이며 실행 승인 또는 상태 전환의 증거가 아니다.

### Integration Points

- shared policy resolve → bounded intent/evidence → 공통 decision → native/text 질문 또는 해당 기존 GSD 경로로 연결한다.
- strict/flexible 일반 intake를 공통 owned skill과 서비스에 연결하고 policy-only 우선 경로를 보존한다.
- Phase 29에 original request·알려진 사실·선택 style·task 참조를 전달할 계약을 남긴다. Phase 28에서 초기화 파일 생성이나 여섯 실행 pipeline을 대신 구현하지 않는다.

</code_context>

<specifics>
## Specific Ideas and Acceptance Examples

| 요구사항/사례 | 후속 구현에서 증명할 관찰 결과 |
|---|---|
| ENTRY-01 | 새 strict substantial 요청에 여섯 label/설명이 모두 보이고 유효 선택 전 구현이 시작되지 않는다. native 여섯 항목 미지원 host는 전체 번호 목록으로 동작한다. |
| ENTRY-02 | “대화형-quick-full로 README 번역”은 단순 작업이어도 명시 full을 유지한다. “오토파일럿으로”만 주어지면 그 선택을 보존하고 필요한 style 차이만 확인한다. |
| ENTRY-03 | release가 오토파일럿-phase를 사용하고 완료된 뒤 독립 bug fix는 새 chooser를 거쳐 오토파일럿-quick-full을 고를 수 있다. 활성 task의 테스트 수리는 같은 선택을 유지한다. |
| ENTRY-03 경계 | 같은 root의 새 목표는 자동 continuation이 아니다. transport yield는 완료가 아니며, 정확한 기존 참조 없는 cross-session style 복원은 실행 권한이 되지 않는다. |
| ENTRY-04 | bounded push·국소 rename·기존 README 번역/링크 추가는 chooser와 강제 bootstrap을 생략한다. effect 권한은 여전히 필요하다. |
| ENTRY-04/05 반례 | cross-subsystem/API rename 또는 충돌 해결이 필요한 push는 이름만으로 면제되지 않는다. 대상·영향이 불분명하면 최소 범위 질문을 한다. |
| ENTRY-05 | 같은 evidence에 대한 분기와 bounded reason이 text/JSON에서 일치한다. 누락 사실은 missing/unknown으로 보이며 raw transcript나 secret을 출력하지 않는다. |
| ENTRY-06 | flexible에서 strict chooser를 강제하지 않고 기존 adaptive 경로를 보존한다. 어느 모드도 autopilot 동의로 취급되지 않는다. |
| ENTRY-07 | 직접 `gsd-discuss-phase 28`은 원래 workflow/인수/timing을 지키고 unrelated chooser를 추가하지 않는다. 인용된 명령 문장은 직접 호출로 분류하지 않는다. |
| 안전 경계 | invalid policy·root mismatch·tree-off·허용되지 않은 effects가 style/면제 때문에 통과하지 않는다. 이전 task의 consent는 다음 task에 재사용되지 않는다. |

동일 공통 입력의 positive/negative 행동 쌍과 실제 intake routing을 검증한다. 소스 문자열 assertion만으로 동작 증명을 대체하지 않는다. 다섯 harness의 실제 native invocation, offline fixture, 미지원/미검증을 구분하고 현재 discuss가 어떤 host proof도 새로 확보했다고 표시하지 않는다.

</specifics>

<deferred>
## Deferred Ideas

- Phase 29: missing runtime/absent/partial/ready 구분, new-project/복구, 원래 요청의 한 번 재개. Phase 28은 선택과 bounded 전달 계약까지만 담당한다.
- Phase 30: quick/quick-full/phase의 실제 conversational/autopilot pipeline, preview/digest·quality binding과 실행 통합. Phase 28의 공통 intake·명시 routing·검증을 이 phase로 미루지 않는다.
- Phase 31: 최종 다섯 harness scenario receipt, packed distribution과 영문/국문 사용자 문서의 완결 및 전체 regression 증거.
- project/global style 기본값, custom style catalog, 자동 모델 대체, 신규 GUI/dashboard, 별도 lifecycle engine은 추가하지 않는다.
- quick 261101-ww3의 기존 worker-startup failure와 네 not-run suite, release/macOS CI/push/global-apply/publication holds는 유지한다. 이 토론은 이를 해결하거나 새 외부 effect를 승인하지 않는다.

관련 pending todo는 없었다. SPEC·중단 checkpoint·기존 Phase 28 plan은 없었으며, 이번 논의에서 새 milestone 범위를 추가하지 않았다.

</deferred>

---

*Phase: 28-predictable-strict-and-flexible-intake*
*Context gathered: 2026-11-02*
