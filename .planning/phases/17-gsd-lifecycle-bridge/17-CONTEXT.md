# Phase 17: GSD Lifecycle Bridge - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

<domain>
## Phase Boundary

명시적으로 승인된 계약 하에 자율 실행(Autopilot) 작업이 독자적인 프로젝트 상태 머신을 만들거나 필수 품질 게이트를 우회하지 않고, 설치된 GSD의 discuss, plan, execute, verify 및 gap 해결 경로를 네이티브 상태 전이 그대로 통과할 수 있도록 GSD 라이프사이클 어댑터, 자동 응답(Default-Answer) 정책, 갭 라우팅(Gap Routing), 다중 Phase 연속 오케스트레이션 및 훅 실측 영수증 시스템을 구축한다. GSD는 프로젝트 라이프사이클의 유일한 권위자이며, alpha-AOS는 실행 시도, 역할 디스패치, 자원 한도 및 중단 복구를 별도의 저널(`userStateRoot()`)에서 관리한다. 전면적인 alpha-AOS 기능 패브릭 연동은 Phase 18, 심층 독립 리뷰 및 수리 루프는 Phase 19의 범위다.

</domain>

<decisions>
## Implementation Decisions

### GSD 대화형 프롬프트 자동 응답 및 일시정지 정책 (Prompt & Pause Policy)
- **D-01:** 자율 실행 중 GSD 워크플로(discuss, plan, execute, verify)에서 발생하는 대화형 질문은 사전 승인된 계약 범위 내인 경우 권장 기본값(Recommended Default)으로 자동 응답하고, 모든 자동 응답 내역을 `gsd-default` 카테고리로 실행 저널에 전수 기록한다. — **Reversibility:** costly — 자율 실행 루프, 프롬프트 파서 및 감사 저널 규격 전반에 영향.
- **D-02:** 질문 내용이 계약 경계(목표, 허용 루트, 허용 효과, 비용 한도, 필수 기준)를 초과하거나 새로운 권한을 요구하는 경우, 또는 권장 기본값이 없는 모호한 질문일 경우 즉시 자동 응답을 멈추고 안전 일시정지(`needs-input`) 상태로 전환한다. — **Reversibility:** one-way — 안전 우선(Fail-Safe) 불변식 및 승인되지 않은 작업 확산 방지.
- **D-03:** `needs-input` 상태에 도달하면 터미널에 중단 원인(질문 내용, 결정 필요 항목, 현재 실행 컨텍스트)을 명확히 출력하고 안전 대기 상태로 전환하며, 사용자가 `alpha-aos task answer <answer>` 또는 `task resume` 명령으로 언제든 비동기 응답 및 실행 재개를 할 수 있도록 지원한다. — **Reversibility:** costly — CLI 상태 머신 및 비동기 대기/재개 인터페이스.
- **D-04:** 컨트롤러가 GSD 워크플로의 각 단계(discuss, plan, execute, verify)를 호출할 때 각 단계의 의도에 맞게 `--auto` 플래그를 명시적으로 주입하며, 각 단계를 독립 프로세스로 호출하고 단계 간 체크포인트를 통해 상태 전이를 엄격히 감시한다. — **Reversibility:** costly — GSD 프로세스 실행 어댑터 및 단계별 오케스트레이터.

### 검증 갭 라우팅 및 복구 메커니즘 (Gap-Plan vs New-Phase Routing)
- **D-05:** 검증(`verify-work` / `verify-phase`) 또는 독립 리뷰에서 확인된 결함/갭에 대해 범위 및 아키텍처 영향도 기반으로 라우팅을 분기한다. 현재 Phase 목표 및 계약 기준 내의 결함 수정은 현재 Phase의 갭 플랜(`*-GAP-*.md`)으로 처리하고, 새로운 기능 요구 또는 Phase 경계를 넘는 구조적 변경은 ROADMAP.md에 새 Phase로 라우팅한다. — **Reversibility:** one-way — 도메인 무결성 및 로드맵 추적성 보장.
- **D-06:** 갭 플랜 생성 시 GSD 네이티브 도구 연동을 준수한다. 갭 플랜은 GSD의 갭 플래닝 워크플로(`gsd-plan-phase --gap` 등)를 통해 정규 생성하고, 새 Phase는 GSD 로드맵 추가 워크플로를 거치도록 호출하여 GSD를 유일한 상태 권위자로 유지(GSD-03)한다. — **Reversibility:** one-way — GSD 상태 머신과의 일관성 유지.
- **D-07:** 갭 플랜이 실행 완료된 후에는 실패했던 기준뿐 아니라 전체 계약 기준(회귀 방지)에 대해 GSD verify를 다시 수행하고, 독립 리뷰어 세션을 거친 동일 리비전 영수증을 확인한 뒤에야 다음 단계로 진행한다. — **Reversibility:** one-way — 부분 수정으로 인한 회귀 결함 방지 및 품질 보증.
- **D-08:** 갭 플랜 수정 중에도 동일 실패 핑거프린트가 2회 연속 발생하면 Phase 15의 비진행 정책과 통합하여 3단계 점진적 대안 전략을 적용하고, 대안이 소진되면 즉시 `blocked`로 안전 정지하여 무한 수정 루프를 방지한다. — **Reversibility:** costly — 결함 복구 전략 및 자원 보호 메커니즘.

### 다중 Phase 연속 진행 및 상태 관측 (Multi-Phase Progression & Boundary Discovery)
- **D-09:** 계약 범위 내에서 복수 Phase를 연속 진행할 때, GSD의 `.planning/STATE.md` 및 `ROADMAP.md`의 완료 상태를 순수 읽기로 관측하여 후속 Phase 진행 여부를 판단하고, 수퍼바이저 자체 전이 머신 없이 GSD 라이프사이클의 다음 단계로 자연스럽게 오케스트레이션한다. — **Reversibility:** one-way — GSD를 프로젝트 라이프사이클의 단일 진실 공급원(SSOT)으로 확립.
- **D-10:** 비정상 중단된 Phase를 재개(Resume)할 때 Phase 내 완료된 `*-SUMMARY.md`, `STATE.md` 진행 상태, `docs(<phase>-<plan>):` Git 커밋을 삼중 대조하여 완료된 플랜은 재실행 없이 건너뛰고, 미완료 플랜부터 정확히 재개(성공 기준 4)한다. — **Reversibility:** one-way — 멱등성 보장 및 중복 실행/비용 방지.
- **D-11:** 재개 시 미완료 플랜에 대해 새로운 범위 결정을 임의로 내리는 것(Silently defaulting a new scope decision)을 원천 차단하기 위해, 기존 생성된 `*-CONTEXT.md`와 `*-PLAN.md`의 결정을 불변 기준으로 고정하고 계획된 작업을 정직하게 수행한다. — **Reversibility:** one-way — 계약 및 승인된 범위 불변성 준수.
- **D-12:** `.planning/` 및 프로젝트 Git 커밋은 GSD/컨트롤러만 작성하고 alpha-AOS는 순수 읽기 관측만 수행하며, 실행 시도/역할/자원 한도/중단 복구는 오직 `~/.alpha-aos/` 저널에만 분리 기록하여 GSD 프로젝트 상태와 수퍼바이저 저널의 소유권을 엄격히 분리(GSD-03)한다. — **Reversibility:** one-way — 시스템 상태 아키텍처 불변식.

### 필수 게이트 및 라이프사이클 훅 실측 증명 (Mandatory Gates & Hook Execution Receipts)
- **D-13:** GSD 라이프사이클 훅(`discuss:pre/post`, `plan:pre/post`, `execute:pre/post`, `verify:pre/post`)을 실제로 호출하고 실행 결과(명령어, Git revision, sha256, exitCode, 텔레메트리)를 개별 영수증 JSON(`Hook Execution Receipt`)으로 발행하며, 훅 미실행 또는 실패 시 즉시 Fail-Closed로 진행을 차단(GSD-04)한다. — **Reversibility:** one-way — 필수 품질 게이트의 실측 보증.
- **D-14:** 최종 산출물/커밋 SHA와 독립 리뷰어가 평가한 `targetRevisionSha`가 100% 일치할 때만 수락(acceptance)하며, 리뷰 이후 단 1바이트라도 파일이 변경되었거나 리뷰어 목격 영수증(`ReviewWitnessReceipt`)이 누락되면 즉시 판정을 거부(`STALE_REVIEW_REFUSED` / `MISSING_REVIEW_WITNESS`)한다. — **Reversibility:** one-way — 거짓 수락 방지 및 독립 검토 무결성 보증(성공 기준 3).
- **D-15:** 4대 적대적 실패 주입 픽스처 스위트((1) 훅 실패 시 차단, (2) 필수 산출물 결손 시 거부, (3) 중간 중단 후 재개 시 완료 플랜 보존 및 미완료 재개, (4) 오래된/위조된 리뷰 영수증 거부)를 구축하여 결정론적 안전 불변식을 완전 검증한다. — **Reversibility:** costly — 테스트 인프라 및 CI 회귀 스위트.
- **D-16:** CLI 진단 도구(`alpha-aos task status`, `task doctor`)에 GSD 라이프사이클 진행 단계, 훅 실행 영수증 상태, 갭 라우팅 이력, 리뷰 목격 리비전 일치 여부를 직관적인 표와 JSON 양방향으로 통합 가시화한다. — **Reversibility:** reversible

### the agent's Discretion
- `~/.alpha-aos/receipts/hooks/` 하위 훅 실행 영수증 JSON 파일의 세부 명명 규칙 및 해시 계산 세부 형식.
- `needs-input` 상태 전환 시 콘솔에 출력할 상세 레이아웃 및 텍스트 안내 메시지 서식.
- 합성 픽스처 테스트용 임시 git 저장소 및 GSD 샌드박스 구성 유틸리티의 세부 구현.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위 및 요구사항
- `.planning/PROJECT.md` — v0.2.0 Universal Autonomous Work 목표, GSD 단일 라이프사이클 권위자 원칙.
- `.planning/REQUIREMENTS.md` — GSD-01..04 요구사항 명세.
- `.planning/ROADMAP.md` — Phase 17 목표, 구현 단면, 성공 기준 및 검증 요구사항.

### 승인된 아키텍처 및 검증 기준
- `docs/design/autonomous-work/README.md` — GSD 워크플로 연동, 계약 경계, 훅 및 게이트 영수증 아키텍처.
- `docs/design/autonomous-work/WORKFLOW.md` — 수퍼바이저 루프와 GSD 라이프사이클 단계별 연결 순서.
- `docs/design/autonomous-work/VALIDATION.md` — 실패 주입, 크래시 복구, 갭 라우팅 및 훅 검증 시나리오.
- `.planning/phases/14-contract-and-vertical-tracer/14-CONTEXT.md` — Phase 14 수직 트레이서 및 판정 영수증 결정 사항.
- `.planning/phases/15-durable-supervisor-and-effect-ledger/15-CONTEXT.md` — Phase 15 내구성 수퍼바이저, 실행 저널, 비진행 정책 결정 사항.
- `.planning/phases/16-composable-harness-roles/16-CONTEXT.md` — Phase 16 합성 가능한 하네스 역할, 배타적 임대 락, 독립 리뷰어 격리 결정 사항.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/task-gsd.ts`: `probeGsdQuickReadiness`, `readGsdQuickOutline`, `buildGsdControllerPrompt`, `snapshotPlanningState`, `verifyGsdEvidence` (Phase 17 전체 라이프사이클 확장 베이스).
- `src/core/task-run.ts`: `startTask`, `superviseTask`, `resumeTask` 수퍼바이저 실행 루프 및 상태 머신.
- `src/core/task-contract.ts`: `TaskContract`, `ResourcePolicy`, 계약 경계 및 승인 다이제스트 검증.
- `src/core/gate-receipt.ts`: 근거와 다이제스트를 묶어 검증하는 영수증 패턴 (`TaskVerdictReceipt` 등).
- `src/core/writer-lock.ts`: `.alpha-aos/controller.lock` 펜싱 임대 및 배타적 쓰기 권한 제어.
- `src/core/process.ts`: 유계 프로세스 실행, 크로스 플랫폼 프로세스 트리 종료 (`runProcess`).
- `src/core/transaction.ts`: 파일 트랜잭션, 스냅샷, 저널 및 롤백.

### Established Patterns
- GSD 단일 라이프사이클 권위자: `.planning/` 및 프로젝트 Git 커밋은 GSD와 컨트롤러만 작성하며, alpha-AOS는 순수 읽기 관측만 수행.
- Fail-Closed 원칙: 훅 미실행, 산출물 결손, 불확실한 효과, 리비전 불일치 발생 시 즉시 중단 및 거부.
- 결정론적 픽스처: CI 환경에서 4대 적대적 실패 주입 픽스처를 구축하여 회귀 방지.

### Integration Points
- `src/core/task-gsd.ts` 확장: `quick` 중심 단일 지원에서 `discuss-phase`, `plan-phase`, `execute-phase`, `verify-work` 및 갭 플래닝 전체를 아우르는 어댑터 구축.
- `src/core/gate-receipt.ts`: `HookExecutionReceipt` 및 `ReviewWitnessReceipt` 스키마 및 검증 함수 추가.
- `src/core/task-run.ts`: 다중 Phase 전이 감지, 갭 발생 시 GSD 갭 워크플로 호출 및 전체 재검증 루프 연동.
- `src/cli.ts`: `task status`, `task doctor`에 GSD 라이프사이클 진행 및 게이트 영수증 상태 표 통합.

</code_context>

<specifics>
## Specific Ideas

- 두 개 이상의 Phase에 걸친 개발 작업이 사용자의 수동 명령 입력 없이 GSD의 ROADMAP과 STATE를 정직하게 전이시키며 완주되어야 한다 (성공 기준 1).
- 인위적으로 주입된 검증 갭이 GSD 갭 플랜 또는 새 Phase로 라우팅되어 수정 실행 및 전체 재검증을 거쳐야 한다 (성공 기준 2).
- 스킬 설정 파일이 존재하거나 프로세스가 단순히 exit 0으로 끝났더라도 필수 훅 영수증과 동일 리비전 리뷰어 목격 증거가 없으면 결코 수락되지 않아야 한다 (성공 기준 3).
- 실행 도중 중단된 작업이 재개될 때 이미 완료된 플랜을 절대 중복 실행하지 않고, 새로운 범위 결정을 임의로 내리지 않아야 한다 (성공 기준 4).

</specifics>

<deferred>
## Deferred Ideas

None — 토론은 Phase 17 범위 내에서 완료되었습니다. 전면적인 기능 패브릭 연동(CAP-01..05)은 Phase 18, 심층 구조화 독립 리뷰 및 수리 루프(REV-02..05)는 Phase 19, 비코드/CoursePilot 도구 커넥터(TOOL-01..04)는 Phase 20에서 순차적으로 구현됩니다.

</deferred>

---

*Phase: 17-GSD Lifecycle Bridge*
*Context gathered: 2026-10-02*
