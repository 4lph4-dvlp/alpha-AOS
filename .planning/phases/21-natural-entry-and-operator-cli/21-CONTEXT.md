# Phase 21: Natural Entry and Operator CLI - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 21 makes an alpha-AOS task skill discoverable through meaningful native invocation in each supported harness and connects natural task requests to either ordinary conversational GSD or explicitly chosen per-task autopilot. It completes the persistent `alpha-aos task plan|start|status|stop|resume|doctor|report` experience so a user can review the exact contract, control the same durable run after the original chat ends, and understand state, selected capabilities, agent/model identities, measured resources, limits, failed criteria, and next actions in human and JSON output. The approved contract and digest, GSD state ownership, journal, capability proofs, and independent acceptance rules from Phases 14–20 remain binding. Phase 22 owns the release-wide three-OS and live-host proof matrix.

</domain>

<decisions>
## Implementation Decisions

### 자연어 진입
- **D-01:** 일반적인 자연어 작업 요청에서는 목표와 범위를 짧게 파악한 뒤 일반 GSD와 autopilot 중 선택을 제시한다. 일반 GSD가 기본이며, 제안 자체가 autopilot 동의가 아니다.
- **D-02:** 사용자가 일반 GSD를 선택하면 같은 대화에서 작업에 맞는 GSD 흐름으로 바로 이어간다. 별도 명령을 사용자가 다시 입력해야 하는 진입 흐름으로 만들지 않는다.
- **D-03:** 사용자가 autopilot을 선택했으나 목표, 완료 기준 또는 허용 작업이 모호하면 빠진 내용만 확인한 뒤 계약 미리보기를 만든다. 모호한 권한을 임의로 추정해 승인 가능한 계약으로 제시하지 않는다.
- **D-04:** 사용자가 처음부터 autopilot을 명시적으로 요청하면 두 경로를 다시 묻지 않고 계약 미리보기로 진행한다. 명시적 요청은 경로 선택이며, 계약 승인 또는 실행 시작을 대신하지 않는다.

### 계약 검토
- **D-05:** 승인 전 첫 화면은 목표, 완료 기준, 허용 권한과 효과를 먼저 보여준다. 선택된 역할·도구와 자원 한도는 그 뒤에 배치하고, 전체 계약과 정확한 다이제스트를 검토할 수 있게 한다.
- **D-06:** 사용자가 미리보기의 목표나 허용 작업 등을 수정하면 새 계약 전체와 이전 미리보기 대비 변경점을 함께 보여준다. 바뀐 계약은 새 리비전·다이제스트의 승인 경계를 따른다.
- **D-07:** 선택된 역할이나 필수 도구가 현재 사용할 수 없으면 전체 계약은 검토할 수 있게 보여주되, 차단 사유와 해결할 다음 조치를 앞에 놓는다. 지원 증거가 없는 계약을 승인·시작 가능한 상태로 표시하지 않는다.
- **D-08:** 미리보기는 각 설정 한도, 한도를 두지 않은 항목, 실제 계측 가능 여부를 명시한다. 근거 없는 예상 시간·사용량·비용을 표시하지 않는다. 계측이 필요한 한도를 충족하지 못하는 경우 기존 fail-closed 규칙을 따른다.
- **D-09:** Phase 14의 승인 경계를 유지한다. 최종 계약 승인은 읽기 전용 CLI 미리보기를 확인한 뒤 정확한 계약 다이제스트를 지정해 수행하며, 승인과 실행 시작은 별도 명령이다. 스킬 경험은 이 단계를 명확히 안내한다.

### 채팅 종료 후 제어
- **D-10:** 계약 승인·실행 시작 결과에는 계약 ID, 실행 ID, 계약 파일 위치 및 바로 복사할 수 있는 `status`, `stop`, `resume` 명령을 제공한다. 사용자가 원래 채팅 없이 같은 실행을 다시 찾을 수 있어야 한다.
- **D-11:** `status` 또는 `report`에서 실행 ID를 생략했고 해당 계약에 실행 이력이 여러 개 있으면 최신 실행을 조회하되, 실제 선택한 실행의 ID와 시각을 눈에 띄게 표시한다.
- **D-12:** `stop` 요청이 접수된 상태와 실제 프로세스 종료가 확인된 `stopped` 상태를 구분한다. 요청 접수만으로 종료 완료를 주장하지 않는다.
- **D-13:** 중지 완료 결과에는 같은 승인 계약으로 재개 가능한지, 재개 전 확인할 상태와 정확한 재개 명령을 보여준다. 재개 전 GSD·Git 상태와 효과 조정 등 선행 복구 규칙은 유지한다.

### 상태와 진단 출력
- **D-14:** `task status` 첫 화면은 현재 판정, 구체적인 이유, 사용자의 다음 조치를 먼저 보여준다. 진행 상황, 역할·모델·도구, 측정 사용량은 이어서 표시한다. `accepted`, `blocked`, `stopped`, `failed`, `unknown`을 혼동하지 않는다.
- **D-15:** `task report`는 미충족·확인 불가 필수 기준과 다음 조치를 먼저 보여준다. 통과한 모든 필수 기준과 각각의 검증 증거도 빠짐없이 포함한다. 일반 작업의 항목별 결과와 개발 작업의 리뷰 근거는 기존 출처·증거 규칙을 따른다.
- **D-16:** `task doctor`는 ID 없이 실행하면 환경·하네스 전체 상태를 진단하고, 계약 또는 실행 ID를 주면 해당 작업의 차단 원인을 진단한다. ID가 없다는 이유로 최근 작업을 암묵적으로 선택하지 않는다.
- **D-17:** `--json`은 성공뿐 아니라 실패·차단에도 구조화된 상태, 사유 코드, 관련 식별자, 다음 조치를 제공한다. 사람이 읽는 출력과 JSON은 같은 실제 저널·GSD 상태 및 측정 근거를 반영한다.

### the agent's Discretion
- 스킬의 구체적인 문구, 요약과 상세 화면의 배열, 복사 가능한 명령의 서식 및 JSON 필드 구성은 위 결정을 충족하는 범위에서 정한다.
- 새 저장·조회 구조는 기존 계약·저널·GSD 권한 경계를 재사용하도록 설계한다. 이번 논의는 내부 자료 구조나 라이브러리를 지정하지 않았다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위와 승인된 제품 계약
- `.planning/ROADMAP.md` — Phase 21 목표, UX-01..03, 성공 기준 및 Phase 22 경계.
- `.planning/REQUIREMENTS.md` — UX-01..03와 명시적 autopilot, 내구 실행 및 출력 요구사항.
- `.planning/PROJECT.md` — GSD 단일 상태 권한, 다섯 하네스 범위, 기본 일반 GSD, 안전·비밀·검증 제약.
- `docs/design/autonomous-work/README.md` — 승인된 작업 계약, 능력 선택, 상태·권한, 진입점 및 CLI 제품 설계.

### 선행 단계의 고정 결정
- `.planning/phases/14-contract-and-vertical-tracer/14-CONTEXT.md` — CLI 최종 승인, 정확한 다이제스트, 승인과 시작 분리, 계약 변경 시 재승인.
- `.planning/phases/15-durable-supervisor-and-effect-ledger/15-CONTEXT.md` — 내구 저널·재개, 불확실한 효과, 중지·한도·계측 규칙.
- `.planning/phases/16-composable-harness-roles/16-CONTEXT.md` — 역할 지원 증거와 하네스별 모델·사용량 계측 상태.
- `.planning/phases/17-gsd-lifecycle-bridge/17-CONTEXT.md` — 일반 GSD와 승인 범위 내 autopilot 응답, `needs-input`, GSD 단일 상태 권한.
- `.planning/phases/18-capability-fabric-and-automatic-invocation/18-CONTEXT.md` — 선택·차단된 기능의 기본 요약, 상세/JSON 목록, 실제 호출 증거와 드리프트 조치.
- `.planning/phases/19-structured-independent-review/19-CONTEXT.md` — 기준별 통과·실패·확인 불가 증거 및 최종 보고.
- `.planning/phases/20-general-tool-connectors/20-CONTEXT.md` — 일반 작업 항목별 진행·부분 실패·다음 조치 보고.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli.ts`와 `src/format.ts`에 이미 `task` 하위 명령, 계약 미리보기, 역할·기능 계획, 시작·재개 준비 상태, 상태·보고서 출력이 있다.
- `src/core/task-contract.ts`, `src/core/task-run.ts`, `src/core/task-supervisor.ts`, `src/core/task-journal.ts`가 다이제스트 승인, 실행 기록, 체크포인트와 재개 근거를 제공한다.
- `src/core/task-doctor.ts`, `src/core/task-capability-inventory.ts` 및 하네스 어댑터가 진단, 지원 증거, 선택 기능과 계측 정보를 제공한다.
- `src/core/owned-skills.ts`, `skills/alpha-aos-control/SKILL.md`와 `catalog/stack.yaml`이 저장소 소유 스킬의 다섯 하네스 배포 경로를 보여준다.

### Established Patterns
- CLI는 읽기 전용 계획/미리보기와 명시적 `--apply`를 분리하며, 계약 다이제스트 및 잠금 근거를 재검증한다.
- 출력은 `src/format.ts`의 사람용 포맷과 CLI JSON을 통해 제공된다. 기존 Phase 18 결정은 선택·실패·차단 기능의 기본 요약과 상세/JSON 전체 근거를 구분한다.
- GSD가 프로젝트 라이프사이클 상태를 소유하고, alpha-AOS는 사용자 상태 루트의 별도 저널에 실행 시도·효과·사용량을 기록한다.

### Integration Points
- 자연어 작업 스킬은 기존 저장소 소유 스킬 배포·네이티브 발견 검증 경로에 연결한다.
- 기존 `task plan|preview|approve|start|status|stop|resume|doctor|report` 명령과 공통 계약·저널을 이어 사용하며, 채팅 종료 후 새 프로세스에서 같은 실행을 조회한다.
- 표시 정보는 역할·기능 선택, 실제 호출 영수증, 수퍼바이저 상태, GSD 상태와 기준별 리뷰 근거에서 취합한다.

</code_context>

<specifics>
## Specific Ideas

- 일반 작업 요청은 목표·범위를 이해한 뒤 선택을 제시하지만, 명시적인 autopilot 요청에는 같은 경로 선택을 반복하지 않는다.
- 계약 수정 시 바뀐 항목만 보여주지 말고 새 계약 전체와 변경점을 함께 보여준다.
- 종료 후 다시 찾을 수 있도록 계약·실행 식별자와 복사 가능한 제어 명령을 승인·시작 결과에 남긴다.
- `status`는 판정·이유·다음 조치, `report`는 미해결 기준과 증거, `doctor`는 환경 또는 특정 작업의 차단 원인에 초점을 둔다.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 21 scope.

</deferred>

---

*Phase: 21-Natural Entry and Operator CLI*
*Context gathered: 2026-10-10*
