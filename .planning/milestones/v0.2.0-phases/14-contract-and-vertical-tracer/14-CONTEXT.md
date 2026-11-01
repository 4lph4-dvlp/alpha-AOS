# Phase 14: Contract and Vertical Tracer - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

명시적으로 한 작업에만 켠 autopilot이 승인된 `TaskContract`로 시작해 GSD가 관리하는 구현, 측정 가능한 필수 기준, 동일 산출물 digest를 검토한 독립적인 새 세션을 거쳐 신뢰할 수 있는 수락·거부·확인 불가 판정에 이르는 첫 실제 수직 경로를 제공한다. 일반 GSD 대화는 supervisor를 시작하지 않는다. Phase 14는 하나의 실제로 검증된 에이전트 어댑터 쌍과 최소 GSD quick/phase 연결을 입증한다. 내구성·복구, 다섯 하네스 전체 지원, 완전한 리뷰·수정 반복, 범용 capability 라우팅 및 완성된 자연어/CLI 경험은 후속 단계의 범위다.

</domain>

<decisions>
## Implementation Decisions

### 승인 절차
- **D-01:** 최종 계약 승인은 CLI에서 한다. 대화 중 계약을 다듬을 수 있지만, 읽기 전용 CLI 미리보기를 확인한 뒤 정확한 계약 digest를 명시해 승인한다.
- **D-02:** 승인과 실행 시작은 별도 명령이다. `start`는 이미 승인된 계약 digest를 요구한다.
- **D-03:** 미리보기와 계약에는 허용된 경로와 효과 종류를 함께 보여준다. 변경될 모든 파일을 미리 열거할 필요는 없으며, 실제 변경 파일은 실행 결과에 기록한다.
- **D-04:** 승인 후 계약이 바뀌면 이전 digest의 실행을 거부하고, 바뀐 계약 항목과 새 미리보기·digest를 보여줘 재승인을 안내한다. 설계가 정한 목표·효과·권한·역할 변경의 재승인 경계는 유지한다.

### 위임 범위
- **D-05:** 제어자는 승인된 경로와 GSD 계획 안에서 구현 방식, 파일 구성, 필수 기준을 입증할 테스트 보강을 추가 승인 없이 결정할 수 있다. 계약 자체의 목표·권한·효과·필수 기준을 약화시키는 변경은 이 위임에 포함되지 않는다.
- **D-06:** 의미 있는 구현 방향, 파일 구성 또는 검증 선택마다 무엇을 선택했고 왜 선택했는지 결정 시점에 기록한다. 모든 작은 도구 호출에 별도 설명을 붙일 필요는 없다.
- **D-07:** 계약에 의존성 변경 권한이 명시된 경우 제어자가 필요한 의존성을 추가할 수 있고 이유를 기록한다. 변경 후 `alpha-aos-control`의 plan/status 점검을 실행하며, 새 프로젝트 팩 적용에는 기존의 별도 정확한 plan digest 승인이 필요하다.
- **D-08:** 원래 예정된 측정 방법을 사용할 수 없으면 동일한 필수 기준을 실제로 입증하는 대체 방법을 선택하고 동등한 이유를 기록할 수 있다. 입증이 부족하면 `unknown`으로 판정하며 기준을 몰래 바꾸지 않는다.

### 첫 수직 경로의 작업
- **D-09:** 실제 에이전트가 격리된 소형 CLI 프로젝트에서 개발 작업을 수행한다. 이 저장소 자체를 첫 tracer의 변경 대상으로 삼지 않는다.
- **D-10:** 작업은 입력 파일을 읽어 명시된 JSON 결과를 생성하는 기능이다. 정상 입력과 잘못된 입력의 동작을 측정 가능한 기준으로 포함한다. 구체적인 입력 형식과 값은 계획에서 결정하되 기대 출력과 오류 처리는 계약에 고정한다.
- **D-11:** 의도적인 실패에서는 실행자가 성공을 주장하거나 0으로 종료해도 결과 JSON이 필수 기준과 다르면 거부해야 한다. 변경된 산출물에 오래된 검토 결과를 대입해 거부하는 별도 테스트도 로드맵에 따라 수행한다.
- **D-12:** 올바른 결과의 수락과 결함이 심어진 결과의 거부는 각각 독립된 실제 에이전트 실행으로 입증한다. Phase 14의 증명을 실패 후 자동 수정 반복에 의존시키지 않는다.

### 판정 및 근거
- **D-13:** CLI의 첫 판정 화면은 필수 기준별로 판정, 측정 결과, 독립 검토 결과, 산출물 digest, 실패 이유를 함께 보여준다.
- **D-14:** 자동 측정은 통과했어도 독립 검토자가 같은 기준에서 재현 가능한 결함과 근거를 제시하고 확인되면 두 결과를 함께 보여주고 `rejected`로 판정한다. 단순 주장만으로 수락을 뒤집거나 결함을 자동 실행하지 않는다.
- **D-15:** 필수 기준을 측정할 수 없거나 검토자가 판단을 보류한 `unknown`은 빠진 근거와 해당하는 다음 조치(재실행, 환경 복구, 기준 명확화 등)를 명시한다.
- **D-16:** 로컬 관리 상태에 조회 가능한 판정 영수증을 둔다. 영수증은 계약 revision·digest, 산출물 digest, 측정 결과와 독립 검토 근거를 묶어 정확한 revision의 판정을 재확인할 수 있게 한다.

### Downstream Discretion
- 실제 bootstrap 에이전트 쌍은 로드맵의 native probe 결과에 따라 선정한다. 검증되지 않은 하네스·역할 조합의 지원을 주장하지 않는다.
- 격리 CLI 프로젝트의 입력 형식, 구체적인 예제 데이터, 파일 배치, 명령 이름 및 테스트 설계는 위 결정과 승인된 설계의 안전 경계를 만족하도록 연구·계획 단계에서 정한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위와 필수 기준
- `.planning/PROJECT.md` — v0.2.0 목표, GSD 소유권, 기본 off 및 프로젝트 제약.
- `.planning/REQUIREMENTS.md` — Phase 14의 CON-01..03, AUTO-01..03, RUN-01, REV-01과 후속 단계의 경계.
- `.planning/ROADMAP.md` — Phase 14 목표, 구현 단면, 성공 기준과 검증 요구.

### 승인된 설계와 검증
- `docs/design/autonomous-work/README.md` — `TaskContract`, 권한, 실행·검토 경계와 exact digest 규칙을 정한 승인된 설계.
- `docs/design/autonomous-work/WORKFLOW.md` — GSD 단계 연결, capability 점검 및 tracer-first 순서.
- `docs/design/autonomous-work/VALIDATION.md` — 거짓 수락을 막는 적대적 사례와 정확한 revision 근거.
- `.planning/research/v0.2.0/SUMMARY.md` — 기존 코드 경계와 하네스 증명 공백에 대한 배경 연구. 승인된 설계보다 우선하지 않는다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/process.ts`: `runProcess`/`openProtocolProcess`의 유계·redacted 실행, 명시적 환경과 자식 프로세스 정리.
- `src/core/transaction.ts`: 관리 상태 파일의 허용 root, snapshot, journal 및 drift-safe rollback 패턴.
- `src/core/gate-receipt.ts`: 근거와 digest를 묶어 검증하는 영수증 패턴.
- `src/adapters/harnesses.ts`: 설치된 하네스 탐지와 권한 probe.
- `src/core/gsd-context.ts`: GSD 실행 맥락의 제한된 읽기 경계.

### Established Patterns
- `src/cli.ts`의 `project approve`는 읽기 전용 미리보기, 정확한 digest 지정 및 apply 시 재검증의 기존 사례다.
- `.planning/codebase/ARCHITECTURE.md`의 경계대로 GSD만 프로젝트 lifecycle/state를 쓴다. alpha-AOS는 실행 시도와 근거를 별도 관리 상태에 둔다.
- `.planning/codebase/STACK.md`와 `.planning/codebase/INTEGRATIONS.md`에 따라 Node/TypeScript CLI, 로컬 파일 상태, 기본 `node:test`와 외부 하네스 프로세스가 현재 통합 표면이다.

### Integration Points
- `src/cli.ts` 명령 라우팅과 출력 포맷 계층에 계약 미리보기·승인·시작·판정 조회의 Phase 14 최소 표면을 연결한다.
- 하네스 어댑터는 `src/core/process.ts`의 기존 유계 실행 API를 거쳐 실제 CLI를 호출한다.
- 프로젝트 팩 관련 의존성 변경은 `skills/alpha-aos-control/SKILL.md`와 기존 project plan/status/approve 경계를 따른다.

</code_context>

<specifics>
## Specific Ideas

- 첫 tracer의 성공과 의도적 실패는 모두 실제 에이전트 실행이어야 한다. 틀린 JSON을 만들고도 성공을 주장하는 경우가 측정 기준의 독립성을 보여준다.
- 판정 첫 화면은 기준별 근거 표여야 하며, 이후에도 로컬 영수증을 조회할 수 있어야 한다.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 14 scope. The approved roadmap separately schedules durable recovery (15), five-harness adapters (16), full GSD bridge (17), broad capability routing (18), review/repair loop (19), complete entry experience (21), and release proof (22).

</deferred>

---

*Phase: 14-Contract and Vertical Tracer*
*Context gathered: 2026-09-29*
