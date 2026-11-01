# Phase 18: Capability Fabric and Automatic Invocation - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

CAP-01..05에 따라 프로젝트·하네스별 버전 결합 기능 목록을 만들고, 명시적으로 승인된 autopilot 작업의 GSD discuss, plan, execute, review, verify 경계에서 필요한 기능을 선택·호출·증명한다. 설정 완료 후 `alpha-aos-control` 팩 점검, 정확한 다이제스트 승인과 동기화, 새 세션에서의 활성화, 적용성 변화에 따른 재선택, 필수 호출 누락 시 완료 차단을 포함한다. GSD가 프로젝트 라이프사이클의 유일한 권위자이며 alpha-AOS의 실행·증거 기록은 별도 저널에 둔다. 일반 대화형 GSD 작업은 자동 실행으로 전환하지 않는다.

</domain>

<decisions>
## Implementation Decisions

### 설정 완료 감지와 팩 활성화
- **D-01:** 프로젝트 생성과 의존성 설치 등 연속된 설정 변경은 하나의 설정 작업으로 묶어 작업 종료 후 팩 계획·상태를 한 번 점검한다. 점검은 후속 애플리케이션 작업보다 먼저 끝나야 한다.
- **D-02:** 설정 작업이 실패했어도 파일이나 의존성 상태가 일부 변경됐다면 현재 상태의 팩 계획·상태를 읽기 전용으로 점검하고, 설정 실패를 해결하기 전까지 애플리케이션 작업을 멈춘다.
- **D-03:** 승인된 정확한 다이제스트로 팩을 동기화하고 `CURRENT`를 확인한 뒤에는 항상 새 에이전트 세션을 시작한다. 새 세션에서 프로젝트 전용 스킬과 MCP 도구의 발견을 다시 확인한다. 기존 세션의 도구 목록 재로드만으로 활성화를 주장하지 않는다.
- **D-04:** 초기 설정 이후 구현 중 manifest 또는 의존성이 다시 바뀌면, 변경을 묶을 수 있는 설정 작업 종료 후 다음 애플리케이션 작업 전에 팩을 재점검한다.
- **D-05:** 새 팩이나 변경된 계획의 동기화에는 해당 계획 다이제스트에 대한 구체적인 기존 승인 또는 새 사용자 승인이 필요하다. 이전 autopilot 동의나 오래된 승인으로 대체하지 않는다. 이 승인 경계는 기존 설계에서 이어받는다.

### 겹치는 기능의 선택과 결과 재사용
- **D-06:** 한 작업에 버전별 라이브러리 API 문서와 최신 외부 사례가 모두 필요하면 `documentation-lookup`/Context7과 `deep-research`/Exa·Firecrawl을 각각 호출해 서로 다른 근거를 결합한다.
- **D-07:** 승인된 프로젝트 전용 스킬과 전역 스킬이 같은 필요를 충족하면 프로젝트 전용 스킬을 우선한다. 중복된 전역 스킬을 생략한 이유를 기록한다. 서로 다른 근거가 필요한 경우에는 둘 다 선택한다.
- **D-08:** 작업 설명만으로 적용 여부가 불분명하면 계획, 저장소 파일, 현재 GSD 단계의 근거를 확인한다. 근거가 충분하면 기능을 선택하고, 필수 여부가 끝내 불분명하면 임의 호출이나 생략 대신 사용자 입력을 기다린다.
- **D-09:** 이전 GSD 단계에서 얻은 문서·외부 자료는 출처, 버전, 작업 범위가 그대로이고 현재 단계의 질문에도 충분할 때만 재사용한다. 현재 단계의 의무와 원래 실제 호출·결과 영수증을 명시적으로 연결한다. 출처·버전·범위 변경 또는 새 질문이 있으면 다시 호출한다. 재사용은 새 호출을 했다는 주장으로 기록하지 않는다.

### 필수 기능의 복구와 대체 경계
- **D-10:** 선택된 필수 기능을 사용할 수 없거나 호출이 실패하면 승인된 권한 안에서 현재 경로의 설정·발견 문제를 먼저 복구하고 재검증한다. 해결되지 않을 때 검증된 대체 경로를 평가한다.
- **D-11:** 대체 경로가 계약에 지정된 에이전트 역할이나 하네스를 바꿔야 한다면 대체 하네스, 달라지는 권한·비용·증거를 제시하고 새 계약 승인을 받기 전에는 전환하지 않는다.
- **D-12:** 다른 도구를 동등한 대체 경로로 인정하려면 같은 질문에 답할 수 있고 출처·버전·실제 호출 결과를 확인할 수 있어야 한다. 단순한 설치, 발견, 유사한 이름 또는 에이전트의 성공 주장만으로 대체 성공을 인정하지 않는다.
- **D-13:** 복구와 동등한 대체 경로가 실패한 뒤 사용자가 해결할 수 있는 조치가 남아 있으면 필요한 조치와 중단된 기능을 보여주고 `needs-input`에서 기다린다. 실행 가능한 경로가 없으면 구체적 사유와 함께 `blocked`로 기록한다.

### 호출 증거와 결과 표시
- **D-14:** 스킬이 MCP 도구 사용으로 이어지는 경우 스킬의 선택·활성화 증거와 MCP의 실제 호출·결과 영수증을 각각 확인하고 한 사용 경로로 연결한다. 한쪽만 확인된 경우 전체 경로를 사용했다고 판정하지 않는다.
- **D-15:** 실제 호출이 오류로 끝나면 호출 사실과 실패 결과를 별도로 표시하고 영수증을 보존한다. 실패를 성공한 사용으로 승격하지 않으며 오류와 복구·대체 경로 상태를 보여준다.
- **D-16:** 사람이 읽는 `task plan/status` 기본 화면은 이번 작업에 선택·실패·차단된 기능 및 주요 생략 이유를 요약한다. 전체 버전 결합 기능 목록, 적용·제외 상태와 이유는 별도 상세 보기와 JSON에서 확인할 수 있어야 한다.
- **D-17:** 하네스 버전, 팩 원본, manifest, 기능 원본 등 변경으로 증거가 무효가 되면 무엇이 바뀌었고 어떤 영수증이 무효가 됐는지, 재발견·재호출·재승인 중 필요한 다음 조치를 보여준다. 이전 영수증은 감사 기록으로 보존하되 현재 증명으로 재사용하지 않는다.

### the agent's Discretion
- 설정 작업의 시작·종료를 감지하고 연속 변경을 묶는 내부 이벤트 형식, 단 사용자에게 보이는 D-01·D-02·D-04 시점과 중단 규칙은 유지한다.
- 기능 간 중복 판단 및 결과 재사용을 위한 결정론적 데이터 표현, 단 D-06..D-09의 선택과 실제 영수증 연결 기준은 유지한다.
- 기본 요약, 상세 보기, JSON의 구체적인 필드 배열과 문구, 단 D-14..D-17의 상태와 증거를 빠짐없이 제공한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위와 요구사항
- `.planning/PROJECT.md` — GSD 단일 상태 권한, 명시적 autopilot 동의, 전역·프로젝트 기능 범위.
- `.planning/REQUIREMENTS.md` — CAP-01..05의 기능 목록, 팩 점검, 단계별 호출, 재선택 및 증거 기준.
- `.planning/ROADMAP.md` — Phase 18 목표, 구현 단면, 성공 기준과 검증 시나리오.

### 승인된 설계와 선행 결정
- `docs/design/autonomous-work/README.md` — 기능 그래프, 정확한 팩 다이제스트 승인, 새 세션 활성화, 실제 호출 영수증 원칙.
- `docs/design/autonomous-work/WORKFLOW.md` — GSD 경계별 기능 적용 조건과 증거, `alpha-aos-control` 점검 순서.
- `docs/design/autonomous-work/VALIDATION.md` — 팩·세션·기능 드리프트와 다섯 하네스의 긍정·부정 검증 시나리오.
- `skills/alpha-aos-control/SKILL.md` — 프로젝트 팩 계획·상태와 승인·동기화의 현재 사용자 경로.
- `.planning/phases/15-durable-supervisor-and-effect-ledger/15-CONTEXT.md` — 실행 저널, 효과 복구와 비진행·중단 정책.
- `.planning/phases/16-composable-harness-roles/16-CONTEXT.md` — 역할·버전 증명, 계약에 따른 하네스 배정과 새 세션 분리.
- `.planning/phases/17-gsd-lifecycle-bridge/17-CONTEXT.md` — GSD 경계, `needs-input`, 필수 훅 영수증과 거짓 완료 차단.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/task-effects.ts`의 `runPackCheckpoint`는 의존성 변경 뒤 읽기 전용 팩 계획과 상태를 확인한다. 현재 구현은 승인·동기화를 수행하지 않으므로 설정 완료 이벤트와 새 세션 경로의 출발점이다.
- `src/core/project-pack-sync.ts`와 `src/core/pack-catalog.ts`는 승인된 프로젝트 팩 계획, 동기화, provenance와 영수증을 제공한다.
- `src/core/capability-ledger.ts` 및 `src/adapters/capability-oracle.ts`는 하네스별 발견·호출 증거와 지원 상태를 제공한다.
- `src/core/task-gsd-lifecycle.ts`, `src/core/task-gsd-discovery.ts`, `src/core/task-hook-receipt.ts`는 GSD 단계 실행과 필수 훅의 실제 영수증을 제공한다.
- `src/core/task-run.ts`는 작업 실행·검토·판정, 기존 팩 체크포인트 및 상태 출력 연결 지점이다.

### Established Patterns
- 선언된 catalog/lock과 실제 하네스 발견·호출 영수증을 구분한다. 설치나 설정 파일의 존재만으로 지원·사용을 주장하지 않는다.
- 팩 변경은 읽기 전용 계획, 정확한 다이제스트 승인, 거래형 동기화, `CURRENT` 확인을 거친다. 사라진 증거 때문에 팩을 자동 삭제하지 않는다.
- GSD가 `.planning/` 상태를 소유하며 alpha-AOS는 실행 저널과 영수증을 외부 사용자 상태에 기록한다. 필수 훅 실패 및 오래된 리뷰 증거는 완료를 막는다.

### Integration Points
- `src/core/task-effects.ts`의 기존 체크포인트를 프로젝트 생성·manifest 변경·의존성 설치 이후의 설정 완료 신호와 연결한다.
- `src/core/task-gsd-lifecycle.ts`와 `src/core/task-run.ts`의 단계 경계에 기능 적용·의무·영수증 검증을 결합한다.
- `src/adapters/capability-oracle.ts`와 하네스 역할 어댑터를 통해 새 세션의 스킬·MCP 발견 및 의미 있는 호출을 확인한다.
- `src/cli.ts`와 출력 포맷 계층에서 작업 중심 요약, 전체 기능 목록 및 JSON 증거 경로를 제공한다.

</code_context>

<specifics>
## Specific Ideas

- 프로젝트 생성과 의존성 설치가 한 연속 작업일 때 최종 상태에서 한 번 점검하되, 그 사이 애플리케이션 작업은 시작하지 않는다.
- 설정이 일부 변경된 뒤 실패해도 팩 상태를 읽기 전용으로 보여주고 안전하게 멈춘다.
- 팩 동기화 후에는 도구 목록 재로드 대신 항상 새 에이전트 세션에서 실제 발견을 재확인한다.
- 같은 질문을 해결하는 프로젝트 전용 스킬이 있으면 전역 스킬과 중복 호출하지 않지만, API 문서와 최신 외부 사례처럼 근거가 다르면 두 경로를 모두 호출한다.
- 재사용된 이전 단계의 자료는 원래 호출 영수증을 연결해 보여주며 새 호출로 위장하지 않는다.
- 실패한 MCP 호출은 `invoked` 사실을 남겨도 성공한 사용이나 지원 증명으로 표시하지 않는다.

</specifics>

<deferred>
## Deferred Ideas

None — 논의된 사항은 모두 Phase 18 범위 안에 있다.

</deferred>

---

*Phase: 18-Capability Fabric and Automatic Invocation*
*Context gathered: 2026-10-03*
