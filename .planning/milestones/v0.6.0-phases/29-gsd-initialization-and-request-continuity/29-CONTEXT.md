# Phase 29: GSD Initialization and Request Continuity - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning
**Mode:** `29 --auto` — 사용자 위임에 따라 모든 미결정 영역의 권장안을 단일 pass로 선택.

<domain>
## Phase Boundary

BOOT-01–BOOT-04: substantial 작업을 요청한 사용자가 설치된 GSD의 준비 상태를 이해하고, 프로젝트가 없거나 부분 초기화된 경우 native 초기화·복구를 거친 뒤 원래 요청과 선택 style을 한 번 이어가게 한다. GSD만 프로젝트 lifecycle/state를 소유한다.

Phase 27의 공통 strict/flexible 정책, Phase 28의 task별 선택·직접 명령 우선순위·단순 작업 면제는 이미 정해진 전제다. 이번 범위는 readiness, new-project 입력 재사용, 비파괴 recovery, bounded request handoff와 실제 재개 연결이다. 여섯 실행 pipeline과 full-quality 계약 완성은 Phase 30, 최종 배포 증명은 Phase 31의 범위다.

이번 invocation은 CONTEXT와 discussion log를 작성·commit한 직후 종료한다. `--auto`의 일반 auto-advance보다 사용자의 명시적 stop 지시를 우선하며 plan/execute 또는 후속 STATE session commit을 수행하지 않는다.

</domain>

<decisions>
## Implementation Decisions

### Native 준비 상태와 진단

- **D-01:** canonical root와 controller harness에 실제 설치된 GSD runtime의 identity/version을 확인한 뒤, 선택 workflow의 native init/prerequisite 결과로 진단한다. 사용자에게 missing runtime, absent project, partial initialization, ready project를 구분해 설명한다. `.planning` 또는 `PROJECT.md` 존재만으로 ready를 만들지 않는다.
- **D-02:** 진단에는 root, runtime/version, 대상 workflow, 충족·누락 prerequisite, 판정 근거, 다음 native 동작을 bounded text/JSON으로 제공한다. 실행 실패·malformed/capped 출력·읽기 불가·미지원 capability는 별도 오류/미지원 진단이다. 이를 absent로 바꾸어 새 초기화를 시작하거나 ready로 간주하지 않는다. runtime 부재가 project 부재의 증거도 아니다.
- **D-03:** 설치 version의 native 의미를 따른다. GSD 1.18.0은 `init_incomplete`와 `milestones_exists`를 노출하며, milestone archive 후 파일 부재와 bootstrap 중단을 구분한다. shared PROJECT/workstream 경로도 native 해석을 보존한다. 고정된 네 파일 목록만으로 모든 프로젝트를 재초기화하지 않고, between-milestones 등은 해당 GSD 후속 경로와 아직 충족되지 않은 실행 전제를 설명한다.
- **D-04:** ready는 해당 workflow의 진입 조건에 대한 현재 증거이며 실행 권한이나 전체 프로젝트 정상 판정이 아니다. 실행/재개 직전에 root와 native prerequisite를 재확인한다. version별 증거가 부족하면 그 한계를 명시하고 안전하게 보류한다. silent dependency upgrade, harness 설치·인증, 다른 runtime으로의 임의 대체는 하지 않는다.

### 원래 정보를 재사용하는 new-project

- **D-05:** Phase 28에서 정해진 task identity, selected style 또는 explicit command/arguments를 보존한 채 substantial 실행 전에 readiness gate를 통과한다. strict에서 필요한 style 선택을 bootstrap 뒤 다시 묻지 않는다. flexible의 기존 adaptive intake도 같은 readiness 경계를 사용하며 임의 autopilot 기본값을 만들지 않는다.
- **D-06:** absent project는 native new-project로 안내한다. 원래 요청의 목표·기대 결과·범위·제약·이미 제공한 기술/기존 코드 사실과 결정 사항을 명시적으로 전달해 초기 질문의 답으로 재사용한다. 사용자 제공 사실과 아직 검증하지 않은 추정을 구분하며, 작은 변경 요청을 새로운 제품 전체의 요구사항으로 확대하지 않는다.
- **D-07:** 이미 답한 질문은 반복하지 않고 누락된 사실, 서로 충돌하는 정보, native mandatory decision/checkpoint만 묻는다. native 승인·범위 확정·필요한 brownfield 판단은 유지한다. 모르는 내용을 placeholder나 임의 요구사항으로 채우지 않는다. 전달 형식은 설치된 workflow가 실제 지원하는 방법을 연구해 선택하며 가상의 CLI flag/API를 만들지 않는다.
- **D-08:** style 선택만으로 초기화의 모든 결정을 자동 승인하지 않는다. 일반 conversational 초기화는 native 질문을 유지하고, 명시적 `--auto` 또는 승인된 bounded proxy 권한이 있는 경우에만 그 범위의 권장안을 자동 응답한다. 초기화에 필요한 쓰기/effect가 현재 권한을 벗어나면 그 경계에서 멈춘다. 이번 discuss의 자동 응답 위임을 제품의 일반 strict intake 규칙으로 확장하지 않는다.

### 부분 초기화의 비파괴 복구

- **D-09:** partial 상태는 실제 누락 prerequisite와 native recovery 경로를 함께 제시한다. native `init_incomplete`가 bootstrap 중단을 가리키면 new-project를 첫 누락 단계부터 재개한다. GSD 1.18.0의 기존 PROJECT/REQUIREMENTS/config 보존 규칙과 REQUIREMENTS → ROADMAP/STATE 순서를 참고하되 설치 version에서 재검증한다.
- **D-10:** 기존 문서의 원문 bytes, 알려진 사실, 승인된 결정, partial summary와 dirty WIP를 보존한다. 빈 문서 생성, 문서 전체 재생성, 무조건 덮어쓰기, git reset/clean으로 ready를 제조하지 않는다. native 복구 중 기존 유효 자료 변경이 필요하면 변경 이유와 범위를 보여주고 적용 가능한 native checkpoint를 거친다. 사용자 작업을 자동 commit해 문서 복구와 섞지 않는다.
- **D-11:** 중단된 최초 초기화, 초기화 완료 후 STATE 손실, 정상 milestone archive를 같은 문제로 취급하지 않는다. 실제 GSD history와 native 결과가 뒷받침할 때만 resume/reconstruction/new-milestone 등 해당 native 경로로 연결한다. 과거 이력이 없는 bootstrap을 STATE 재구성으로 완료 처리하지 않는다.
- **D-12:** 손상·읽기 불가·모순된 자료 또는 안전한 native recovery 미지원은 구체적인 차단 원인과 가능한 다음 조치를 반환한다. 수동 삭제나 새 lifecycle을 자동 대안으로 실행하지 않는다. 복구의 완료 증거가 없으면 pending substantial task는 시작하지 않는다. 실패해도 기존 자료와 정확한 재개 참조는 남긴다.

### 최소 pending-request handoff

- **D-13:** handoff는 canonical root identity, bounded pending correlation ID, 원래 요청/짧은 목표·범위, 알려진 사실과 참조, 선택한 canonical style 또는 직접 명령/인수, 정확한 native 초기화·재개 참조만 가진 최소 전달 기록이다. 기존 Phase 28 task reference와 GSD/contract/run ID를 재사용한다. 프로젝트 style 기본값, 전체 transcript, 별도 roadmap/task lifecycle·새 supervisor를 만들지 않는다.
- **D-14:** 요청과 사실은 bounded 크기·개수로 제한하고 secret은 저장·출력·command argument에 넣지 않는다. 큰 입력은 허용된 자료의 검증 가능한 참조/revision을 사용하며 조용한 truncation으로 요구를 잃지 않는다. 한도를 넘거나 원본을 안전하게 재구성할 수 없으면 무엇이 필요한지 좁혀 설명한다. schema·정확한 한도·저장 위치는 기존 저장소/transaction 경계를 재사용하는 방향으로 연구하되 무제한 transcript 저장은 허용하지 않는다.
- **D-15:** 세션/harness 재진입 시 동일 canonical root와 exact pending/GSD 참조를 검증한다. 다른 root, stale/tampered handoff, 여러 후보, 다른 task의 선택은 자동 복원하지 않는다. `latest`, 마지막 사용 style, 같은 repository라는 이유만으로 연속성을 정하지 않는다. memory/handoff는 근거를 찾는 힌트이며 GSD 상태나 autopilot 승인의 권위가 아니다.
- **D-16:** handoff의 목적은 원래 요청을 native workflow에 한 번 전달하는 것이다. native 수락/생성된 task 참조와 결합해 중복 인계를 막고, 중단된 초기화에는 재개할 수 있게 남긴다. 명시 취소된 요청은 실행 불가로 처리하며 이후 독립 요청에 style을 상속하지 않는다. 새 lifecycle 상태표를 설계하지 않고 기존 GSD 상태와 최소 소비/연결 증거로 충분한지 연구한다.

### 한 번의 재개와 중단 처리

- **D-17:** bootstrap/recovery가 성공하면 fresh readiness 검사 뒤 원래 요청과 알려진 사실을 기존 style/명령으로 한 번 인계한다. 요청 재입력, 두 번째 chooser, bootstrap용 구현과 원래 작업의 중복 구현을 요구하지 않는다. 준비 완료 안내와 선택된 다음 동작을 짧게 설명한다. native checkpoint나 아직 필요한 권한은 그대로 남는다.
- **D-18:** 인계 직전/직후 crash, 응답 유실 또는 transport yield는 완료도 재실행 허가도 아니다. 기존 GSD quick/task/phase artifact, 정확한 참조와 관련 commit 등으로 인계 여부를 reconcile한다. 이미 시작됐으면 그 작업을 재개하고 새 quick/plan을 만들지 않는다. 증거가 모호하면 자동 재실행을 차단하고 필요한 확인/복구만 요청한다. transport의 exactly-once 보장을 주장하지 않는다.
- **D-19:** 초기화 중단·실패에는 완료된 native 단계와 남은 prerequisite, pending 요청/style을 찾을 정확한 참조를 보존한다. 취소하면 pending task를 시작하지 않으며 이미 생성된 유효 문서를 자동 삭제하지 않는다. status 문의는 현재 상태만 설명하고 인계·승인·start·중복 실행을 유발하지 않는다. 재진입에서 완료 단계 전체를 다시 수행하지 않는다.
- **D-20:** autopilot style의 재개는 exact contract preview·digest 승인·별도 start와 기존 isolated runner, model/effort, reviewer, allowed roots/effects 및 GSD single-writer 경계를 유지한다. bootstrap 성공이나 style 복원은 승인/start가 아니다. 이미 승인된 계약은 원래 binding으로 확인하며 범위/effect/model 변경이 필요하면 새 revision과 필요한 승인을 거친다. chat inline 구현으로 대체하지 않는다.

### 면제·연결·검증 범위

- **D-21:** Phase 27 policy-only 및 Phase 28의 증거가 충족된 simple-operation은 chooser와 forced bootstrap 면제를 유지한다. 면제 작업이 substantial로 확대되면 WIP를 보존하고 기존 intake 규칙으로 재판정한다. 직접 GSD 명령은 원래 workflow·대상·시점을 보존하며 그 명령의 native prerequisite만 적용한다. readiness gate를 이유로 discuss-only를 실행까지 확장하지 않는다.
- **D-22:** Phase 29에서 공통 readiness 진단, native bootstrap/recovery 안내, pending 요청 전달과 한 번의 재개를 사용자 진입점까지 연결한다. 순수 helper나 문구만으로 완료라고 하지 않는다. 공통 owned alpha-aos-task 지침을 다섯 target에 배포할 때 source/target integrity와 fixture를 함께 맞춘다. 여섯 pipeline/quality dispatch 자체의 완성은 Phase 30에 남기되 모든 canonical style identity를 전달·보존하는 검증은 이번 범위다.
- **D-23:** 최소 하나의 실제 conversational-quick absent-project → native 초기화 → 원래 요청 한 번 실행 tracer를 확보한다. partial negative fixtures, 중단/재진입, 인계 경계 crash와 duplicate 방지, known-fact 재사용, simple/policy-only 무초기화를 검증한다. 명령 문자열·소스 assertion만으로 행동 증명을 대체하지 않는다. 실제 host tracer를 못 돌렸다면 이유와 미검증을 명시하고 구현 완료 증거로 대체하지 않는다.
- **D-24:** 구현 중 targeted checks와 최종 acceptance full suite를 실행하며 native proof, credential-free fixture, unsupported/unverified를 구분한다. quick `261101-ww3` 등 기존 실패/미실행 회귀와 release/push/global 변경 hold는 유지한다. 이번 논의는 docs만 작성하며 구현·테스트·다섯 harness 실행 증명을 완료로 표시하지 않는다.

### Agent 재량

내부 모듈 분리, typed diagnostic 명칭, 공개 command/JSON의 최종 형태, pending handoff의 최소 schema/한도/저장 위치, 동시 인계 방지 및 recovery reconciliation의 구체적 방식은 연구·계획에서 현행 source와 native capability를 확인해 정한다. 위 관찰 동작, 비파괴 보장, root/effect/승인 경계와 GSD 단일 lifecycle 소유권은 고정이다. 새 dependency나 별도 lifecycle은 이번 결정의 전제가 아니다.

관련 pending todo는 없었다. SPEC, 기존 Phase 29 CONTEXT/계획/중단 checkpoint 및 blocking anti-pattern 기록도 없었다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 승인 범위와 선행 결정

- `.planning/PROJECT.md` — v0.6.0 목표, GSD lifecycle 소유권과 안전 경계.
- `.planning/REQUIREMENTS.md` — BOOT-01–BOOT-04, ENTRY/STYLE/PROVE 범위와 locked scope.
- `.planning/ROADMAP.md` — Phase 29 목표·성공 기준·native readiness 연구·실제 quick tracer.
- `.planning/phases/27-shared-project-behavior-policy/27-CONTEXT.md` — 공통 root/정책, policy-only 면제, transaction 경계.
- `.planning/phases/28-predictable-strict-and-flexible-intake/28-CONTEXT.md` — 직접 명령/style 우선순위, 현재 task 참조·선택 수명, simple 면제.
- `.planning/milestones/v0.2.0-phases/26-autopilot-session-progress-and-steering/26-CONTEXT.md` — 정확한 binding, process/transport truth와 bounded evidence. 과거 model 배정은 이번 approved runtime packet보다 우선하지 않는다.

### 현행 intake·readiness·GSD 연결

- `src/core/task-intake.ts` — 공통 판정과 style/nextAction 전달.
- `src/core/task-intake-continuity.ts` — exact task/run/artifact 연속성 확인과 terminal/unknown 처리.
- `src/core/task-intake-explicit.ts` — 직접 GSD 명령과 style 정규화.
- `schemas/task-intake.schema.json` — 현행 bounded interchange 경계.
- `src/core/task-gsd.ts` — `probeGsdQuickReadiness`, native quick 호출과 bounded artifact evidence.
- `src/core/task-gsd-discovery.ts` — 기존 phase/task 증거 발견; bootstrap readiness와 구분할 기준.
- `src/core/task-gsd-lifecycle.ts` — discuss/plan/execute/verify 경계와 native 단계 연결.
- `src/core/task-gsd-prompt.ts` — 승인 범위 내 권장 응답과 needs-input 경계.
- `src/core/task-contract.ts` — exact contract/allowed roots/effects, GSD가 소유하는 .planning의 별도 경계.
- `src/core/path-boundary.ts`, `src/core/transaction.ts` — root proof, 재검증, bounded/snapshot/rollback 패턴.

### 사용자 진입점·배포·검증

- `skills/alpha-aos-task/SKILL.md` — fresh policy read, 공통 intake, downstream authority와 다섯 harness 공통 안내.
- `src/core/owned-skills.ts`, `catalog/stack.yaml`, `catalog/stack.lock.json` — target 배포, 설치 GSD pin과 skill integrity.
- `src/cli.ts` — read-only inspection과 mutation dispatch의 기존 경계.
- `test/task-doctor-gsd.test.ts`, `test/task-gsd.test.ts`, `test/task-gsd-lifecycle.test.ts` — native readiness/호출/단계 증거 fixture 시작점.
- `test/task-intake-continuity.test.ts`, `test/task-intake-acceptance.test.ts`, `test/task-intake-routing.test.ts`, `test/owned-skills.test.ts` — 기존 선택 연속성·사용자 routing·배포 회귀.

별도 외부 spec은 없다. 설치된 GSD package의 `workflows/new-project.md`, `workflows/resume-project.md`, `workflows/quick.md` 및 `bin/lib/init.cjs`는 후속 연구에서 해당 runtime/version 기준으로 확인한다. 이는 repository 상대 경로가 아니며 repo 내부 파일로 가정하지 않는다. 웹의 최신 버전으로 설치 version 의미를 대체하지 않는다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `probeGsdQuickReadiness`는 이미 bounded native `query init.quick`를 호출하고 비정상 JSON/출력 초과를 거부한다. 현재 ready 판정은 planning/roadmap 존재에 한정되어 있어 BOOT 전체 진단을 대신하지 못한다.
- Phase 28 intake는 style, taskReference, commandRoute, reasons/observations를 반환하고 exact contract/run/artifact 연결을 확인한다. 이를 bootstrap 앞뒤에 보존할 수 있다.
- 기존 GSD bridge는 단계·artifact·commit 증거를 읽는다. pending handoff가 이 lifecycle을 복제하지 않도록 인계 참조만 연결한다.
- owned-skill renderer와 catalog lock은 다섯 target에 공통 지침을 전달하는 기존 수단이다.

### Established Patterns

- alpha-AOS는 read-only로 native 결과를 해석하고 GSD workflow가 .planning artifact를 소유한다.
- root-bound reads/writes, 제한된 출력, inspectable reason, exact digest와 별도 start, drift-safe transaction을 유지한다.
- 2026-09-02 codebase maps는 오래된 구조 참고 자료다. 현행 source와 실제 설치 runtime/version을 우선한다.

### Integration Points

- intake의 execute-workflow/explicit-command 경계와 실행 직전 readiness 검사 사이에 공통 bootstrap/recovery 연결을 둔다.
- 복구 성공 후 기존 intake 결과/style/명령을 소비하는 handoff를 잇고 Phase 30의 실제 실행 route는 바꾸지 않는다.
- 공통 CLI inspection과 alpha-aos-task 안내가 같은 준비 상태·누락 근거·다음 동작을 설명해야 한다.

### 이번 read-only 관찰의 한계

설치된 Antigravity 경로의 GSD identity는 `@opengsd/gsd-core 1.18.0`이며 stable lock pin과 일치한다. 현 checkout의 `init.resume`는 core 자료와 MILESTONES 존재, `init_incomplete: false`, interrupted agent 없음으로 응답했다. 이는 현재 프로젝트 자료에 대한 관찰이다. `init.phase-op`는 해당 Antigravity agents 디렉터리의 named agents 미설치를 보고했으므로 모든 native 실행 가능 여부까지 증명한 것은 아니다. 이 discuss는 subagent 실행을 필요로 하지 않는다.

</code_context>

<specifics>
## Specific Ideas and Acceptance Examples

| 상황 | 후속 구현에서 증명할 관찰 결과 |
|------|------------------------------|
| runtime 없음 | runtime 부재와 project 부재를 구별하고 설치/복구 안내만 제공; 자동 설치·bootstrap·작업 시작 없음. |
| absent + 대화형-quick | 요청의 목표·범위가 new-project에 전달되고 누락/native 질문만 남음; 준비 확인 뒤 원래 quick 하나와 관련 GSD 기록/commit만 생성. |
| PROJECT/config만 생성된 중단 | 누락 prerequisite와 native 재개 단계 제시; 기존 bytes와 WIP 보존; 빈 문서 생성 없음. |
| REQUIREMENTS 생성 뒤 중단 | 이미 완료된 질문/자료를 재생성하지 않고 남은 native 초기화 단계만 수행. |
| 정상 milestone archive | MILESTONES 등 native 근거에 따라 초기 bootstrap 중단으로 오인하지 않음; 필요한 후속 GSD 경로 설명. |
| 문서 손상·probe 실패·기능 미지원 | 구체적 진단과 안전한 다음 동작; ready/absent를 임의 확정하지 않고 pending 실행 차단. |
| bootstrap 종료와 인계 사이 중단 | exact handoff/GSD 증거로 재개; duplicate quick/plan/implementation 없음; 모호한 경우 자동 재실행 없음. |
| 취소·status·다른 root | 취소는 pending 시작 차단, status는 상태만 반환, root mismatch는 복원 거부. 유효 문서/WIP 자동 삭제 없음. |
| 여섯 selected style·explicit command | canonical style/명령/인수 보존과 chooser 비반복을 각각 검증; autopilot 승인/start 및 native checkpoint 유지. |
| simple·policy-only | GSD 미초기화 상태에서도 기존 면제 동작; 초기화 파일/handoff를 불필요하게 생성하지 않음. |
| 두 세션의 같은 요청 재개 | 같은 exact pending 인계의 중복 시작을 막으며 실제 GSD 증거에 연결; 독립 요청은 별도 intake. |

새 테스트 파일 이름과 native tracer의 실행 방법은 연구·계획에서 정한다. fixture proof와 real native receipt는 별도로 기록하며 현재 docs 작업으로 이를 달성했다고 주장하지 않는다.

</specifics>

<deferred>
## Deferred Ideas

- Phase 30: 여섯 execution style의 실제 pipeline, full-quality contract/digest와 evidence binding.
- Phase 31: 최종 cross-harness proof·packed distribution과 전체 bilingual 사용자 안내. Phase 29의 실제 bootstrap/resume tracer와 최소 owned-skill 연결은 미루지 않는다.
- 새 lifecycle registry, 전체 transcript 저장, project style default, 자동 dependency/runtime 업그레이드, harness 설치·인증, GUI/dashboard, publish/push/global reconciliation은 추가하지 않는다.

관련 todo는 없었으며 새로운 milestone 범위를 추가하지 않았다.

</deferred>

---

*Phase: 29-gsd-initialization-and-request-continuity*
*Context gathered: 2026-11-02*
