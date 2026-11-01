# Phase 22: Release Proof - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 22 produces the v0.2.0 release proof for Windows, macOS, and Linux. It connects a single three-OS CI run and fault-injection controls to exact-version real-host role and capability receipts, representative cross-harness handoffs, the packed install/doctor/uninstall lifecycle, development and CoursePilot end-to-end examples, ordinary-GSD nonactivation, support documentation, and final independent milestone review. A missing paid, authenticated, or live-harness canary remains explicitly unverified. Existing GSD lifecycle, task approval, receipt, and acceptance rules from Phases 14–21 remain binding; this phase does not broaden them.

</domain>

<decisions>
## Implementation Decisions

### 지원 매트릭스
- **D-01:** 릴리스 지원 매트릭스의 첫 묶음은 하네스와 정확한 버전이다. 그 아래에서 OS, 역할, 기능별 상태와 증거를 확인하게 한다. 현재 `doctor --matrix`의 하네스 중심 구조를 출발점으로 삼되 v0.2.0의 역할·기능 범위를 반영한다.
- **D-02:** `UNVERIFIED` 항목은 첫 화면에 부족한 증거의 구체적 이유와 필요한 다음 조치를 함께 표시한다. 영수증의 상세 내용은 연결된 증거에서 확인하게 한다.
- **D-03:** 한 하네스 버전의 요약은 입증된 역할·기능 수와 미검증 수를 보여준다. 일부 셀만 입증된 하네스 전체에 포괄적인 지원 판정을 붙이지 않는다. 각 셀의 `PROVEN`, `UNVERIFIED`, `UNSUPPORTED` 등 상태는 실제 증거로 판정한다.
- **D-04:** 실제 하네스 간 인계는 별도 표에 송신·수신 하네스의 정확한 버전, 역할, 영수증을 표시한다. 합성 조합 검사는 실제 인계와 구분된 별도 결과로 둔다.

### 실패 검증 증거
- **D-05:** 릴리스 고장 검증 표는 충돌, 취소, 동시 실행, 중복 효과, 잘못된 수락 등 실패 상황별로 묶는다. 각 행에 기대 동작, 주입한 고장, 정상 및 고장 주입 결과, 세 OS의 CI 실행 링크를 연결한다.
- **D-06:** 현재 릴리스 대상 커밋의 최종 세 OS CI 실행을 먼저 제시한다. 수정 과정의 이전 실패와 수정 근거는 링크로 보존한다. 이전 실행의 통과를 현재 리비전의 통과로 대신하지 않는다.
- **D-07:** 고장 주입의 빨간 실행 상태만으로 검증 성공을 주장하지 않는다. 주입한 고장, 의도한 검사 이름, 실패한 단언과 관찰 결과를 요약하고 원본 로그를 연결한다.
- **D-08:** 한 OS의 결과가 없거나 판정할 수 없으면 제품 동작 실패, CI 환경 문제, 실행 불가, 판정 불가를 구분하고 해당 OS 증거의 공백과 다음 조치를 표시한다. 미검증 결과를 세 OS 통과로 세지 않는다.

### 패키지 설치 검증
- **D-09:** 패키지 검증의 첫 표는 패키지 해시, 설치·진단·제거 단계의 실제 결과, 격리 환경의 의도된 변경, 실제 호스트 관리 경로의 전후 변경 여부를 함께 보여준다.
- **D-10:** 공개 문서에는 하네스 설정, 스킬, 관리 상태 등 경로 범주별 비교 결과, 변경 수와 해시를 표시한다. 개인 경로가 포함될 수 있는 개별 상세 목록은 로컬 증거로 남긴다.
- **D-11:** 전후 비교에서 원인을 알 수 없는 실제 호스트 경로 차이가 발견되면 해당 실행을 통과로 세지 않고 판정 보류로 남긴다. 차이의 원인을 조사한 뒤 동일한 패키지 해시로 재검증한다.
- **D-12:** 패키지 해시, 안정 잠금 파일 식별자, 후보 잠금 파일 거부 결과를 설치 수명주기와 같은 검증 표에 포함한다. 공급망 게이트의 통과 여부를 별도 로그만 찾아야 알 수 있게 하지 않는다.

### 종단 간 예시 보고
- **D-13:** 개발 작업과 CoursePilot 작업을 각각 묶고 필수 기준별 판정, 관찰 증거, 기능 호출 영수증, 남은 제한을 연결한다. 작업의 총괄 판정은 필수 기준의 미충족·확인 불가를 가리지 않는다.
- **D-14:** 개발 예시는 각 동작 기준에 대한 자동 입력, 관찰 결과와 검사 결과를 기록하고 같은 리비전의 독립 리뷰 영수증을 연결한다. 짧은 재생 자료가 있다면 보조 증거로 둔다.
- **D-15:** CoursePilot fixture에서 입증한 파일별 결과와 인증된 실제 LMS 검증 상태를 분리한다. 실제 LMS 검증이 없으면 `UNVERIFIED`와 필요한 다음 조치를 표시하며 fixture 결과를 실사용 검증으로 바꾸어 말하지 않는다.
- **D-16:** 각 작업의 기능 호출 표에는 스킬·MCP·프로젝트 팩·필수 훅의 적용 이유, 필수 여부, 실제 호출 결과와 영수증을 나열한다. 미호출과 적용 제외를 이유별로 구분하며 필수 호출이 빠진 작업은 완료로 표시하지 않는다.

### the agent's Discretion
- 표·문서의 구체적인 파일 배치, 링크 형식, 영수증 식별자와 요약 문구는 위 결정과 기존 기밀·경로 가림 규칙을 지키는 범위에서 정한다.
- 고장 주입 구현과 fixture 구성, CI 아티팩트 형식은 동일 리비전·의도한 실패 단언·세 OS 검증을 객관적으로 재현할 수 있도록 연구와 계획에서 정한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 릴리스 범위와 승인된 제품 계약
- `.planning/ROADMAP.md` — Phase 22 목표, VER-01..04, 여섯 성공 기준, 최종 검증·감사 게이트.
- `.planning/REQUIREMENTS.md` — VER-01..04 및 정확한 버전의 실제 호출 영수증을 요구하는 지원 정의.
- `.planning/PROJECT.md` — GSD 단일 상태 권한, 다섯 하네스 범위, 안전·비밀·안정 잠금 파일 제약.
- `docs/design/autonomous-work/README.md` — v0.2.0 제품 계약, 기능 호출 증거, 역할 지원, CoursePilot과 릴리스 조건.
- `docs/design/autonomous-work/VALIDATION.md` — 고장 사례, 지원 매트릭스, 세 OS·패키지·종단 간 릴리스 게이트와 예시 판정 기준.
- `docs/design/autonomous-work/WORKFLOW.md` — GSD 게이트에서 기능을 호출하고 영수증을 요구하는 규칙 및 Phase 22 체크포인트.

### 선행 단계의 고정 결정
- `.planning/phases/14-contract-and-vertical-tracer/14-CONTEXT.md` — 작업별 명시적 계약 승인과 다이제스트 경계.
- `.planning/phases/15-durable-supervisor-and-effect-ledger/15-CONTEXT.md` — 재개·효과 조정·불확실성 처리.
- `.planning/phases/16-composable-harness-roles/16-CONTEXT.md` — 정확한 버전별 역할 지원 증거와 하네스 한계.
- `.planning/phases/17-gsd-lifecycle-bridge/17-CONTEXT.md` — GSD 상태 권한과 일반 대화식 작업의 경계.
- `.planning/phases/18-capability-fabric-and-automatic-invocation/18-CONTEXT.md` — 적용 가능한 기능의 선택, 실제 호출 영수증, 드리프트 처리.
- `.planning/phases/19-structured-independent-review/19-CONTEXT.md` — 기준별 검증, 정확한 리비전의 독립 리뷰와 최종 종합 리뷰.
- `.planning/phases/20-general-tool-connectors/20-CONTEXT.md` — CoursePilot 자료별 저장 증거, 부분 실패와 미확인 결과.
- `.planning/phases/21-natural-entry-and-operator-cli/21-CONTEXT.md` — 일반 GSD 기본 경로, 작업별 autopilot 동의, 상태·보고서 출력.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/support-matrix.ts`와 `src/core/task-doctor.ts`는 하네스별 증거 평가와 진단 출력을 제공한다. 현재 지원 매트릭스의 릴리스 상수와 셀은 v0.1.0 기준이므로 v0.2.0 주장을 그대로 대신하지 않는다.
- `src/adapters/task-receipts.ts`, `src/core/task-capability-receipts.ts`, `src/core/task-hook-receipt.ts`, `src/core/task-final-review.ts`는 역할·기능·훅·리뷰 영수증의 기존 출처다.
- `test/tarball-fixture.test.ts`는 패키지 설치·진단·제거와 실제 호스트 관리 경로 전후 지문 비교, 안정 잠금 파일 게이트의 출발점이다.
- `.github/workflows/ci.yml`은 동일 패키지 아티팩트를 세 OS 테스트 작업에 전달하는 현재 CI 경로다.
- `src/core/task-connector.ts`, `src/core/task-verdict.ts`, `src/core/task-run.ts`와 CoursePilot 관련 테스트는 항목별·기준별 예시 결과를 모으는 접점이다.

### Established Patterns
- 실제 호출과 관찰 가능한 결과가 있어야 지원이나 기능 사용으로 인정한다. 설치, 발견 또는 모델의 진술만으로는 `PROVEN`이 되지 않는다.
- `node:test` 기반 검사는 명시적 fixture와 안전 경계 단언을 사용한다. 패키지 검증은 후보 잠금 파일을 안정 채널에 섞지 않고, 호스트 변경은 전후 지문으로 확인한다.
- 사람용 요약과 JSON·영수증 상세를 연결하되 인증값과 개인 경로를 릴리스 문서로 복사하지 않는다.

### Integration Points
- 지원 문서와 `doctor --matrix`는 역할·기능별 정확한 버전 영수증 및 미검증 이유를 같은 근거에서 계산해야 한다.
- CI와 패키지 수명주기 결과는 릴리스 대상 커밋, 동일 패키지 해시와 세 OS 실행 ID를 공유해야 한다.
- 두 종단 간 예시는 기존 작업 보고·기능 영수증·독립 리뷰 판정에 연결하고, 일반 GSD의 autopilot 비활성 대조 검사도 최종 릴리스 증거에 포함한다.

</code_context>

<specifics>
## Specific Ideas

- 실제 하네스 간 인계와 5×5×5 합성 조합 검사는 다른 종류의 증거로 표시한다.
- 고장 주입의 실패는 의도한 단언에서 발생했는지 확인 가능해야 한다.
- 패키지 검증의 실제 호스트 경로 차이는 원인 불명일 때 통과나 제품 결함으로 단정하지 않고 조사 후 동일 아티팩트로 재검증한다.
- CoursePilot fixture 결과와 인증된 실제 LMS 결과를 명확히 구분한다.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 22 scope.

</deferred>

---

*Phase: 22-Release Proof*
*Context gathered: 2026-10-10*
