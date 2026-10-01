# Phase 16: Composable Harness Roles - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Claude Code, Codex, Antigravity, Pi, Hermes의 5개 하네스가 검증된 네이티브 어댑터를 통해 컨트롤러(Controller), 실행자(Executor), 리뷰어(Reviewer) 역할을 수행할 수 있도록 합성 가능한 역할 시스템(5×5×5 = 125개 역할 조합)을 구현한다. 동일 프로젝트의 GSD 상태를 변경할 수 있는 컨트롤러는 오직 하나뿐이어야 하며, 프로젝트 로컬 배타적 임대(fenced lease with token)로 동시 실행 충돌을 차단한다. D-10의 기존 이름 기반 Hermes 컨트롤러 차단을 실측 영수증 및 펜싱 락 기반 검증으로 마이그레이션한다. 동일 하네스 리뷰어는 격리된 임시 런타임 환경과 고유 세션 ID, 읽기 전용 불변식(트리 변조 방지)을 보장하며, 명시적 `differentReviewerPolicy`를 적용한다. 텔레메트리 출력은 실측 필드와 unknown을 엄격히 구분하고, 특정 브랜드의 무료 가정을 배제하며, 비용 한도 설정 시 미계측 하네스에 대해 사전 Fail-closed 처리한다. 전체 GSD 라이프사이클 라우팅은 Phase 17, 전면적 기능 패브릭 연동은 Phase 18의 범위다.

</domain>

<decisions>
## Implementation Decisions

### 역할 조합 및 증명 정책 (5×5×5 Role Composition & Capability Proof)
- **D-01:** 계약 미리보기(Preview) 시점에 3개 역할(컨트롤러, 실행자, 리뷰어)의 네이티브 어댑터 검증 영수증을 엄격히 검사하며, 미설치 또는 영수증 누락 시 누락된 증거 항목(예: `pi: no native invocation receipt for controller`)을 구체적으로 명시하고 시작을 Fail-Closed로 차단한다. — **Reversibility:** costly — 역할 선택기, CLI 미리보기 및 계약 검증 규격 전반에 영향.
- **D-02:** 하네스 CLI 바이너리가 업데이트되어 이전 검증 영수증의 버전/바이너리 해시와 불일치(Version Drift)가 감지되면, 해당 하네스의 역할을 즉시 `unverified`로 강등하고 명시적 재프로브 명령을 안내한다. — **Reversibility:** one-way — 검증되지 않은 바이너리로 인한 안전 보증 파괴 방지.
- **D-03:** 125개(5×5×5) 역할 조합 합성 테스트를 위한 결정론적 Capability Matrix Fixture를 구축한다. 테스트 스위트에서는 모의 프로브(Mock Capability)를 통해 125개 전체 트리플의 합성 검증 로직(증거 충분 시 수락, 결손 시 원인 명시)을 완전 검증하고, 실제 호스트 런타임에서는 로컬에 존재하는 하네스의 실측 영수증으로만 활성화한다. — **Reversibility:** costly — 어댑터 계약 테스트 및 픽스처 아키텍처.
- **D-04:** 하네스/역할별 실측 영수증(Invocation Receipt)은 개별 JSON 파일 `~/.alpha-aos/receipts/harnesses/<harness>-<role>.json`에 저장한다. 스키마에는 CLI 버전, 바이너리 해시, 실행/결과해석/취소 검증 플래그, 프로브 시각, 샘플 실행 다이제스트를 보관하여 독립적이고 원자적인 갱신을 지원한다. — **Reversibility:** costly — 영수증 저장소 규격 및 진단 도구 연동.

### 배타적 컨트롤러 임대 및 동시성 펜싱 (Exclusive Controller Lease & Fencing)
- **D-05:** 동일한 프로젝트에 대해 두 번째 컨트롤러가 진입하려 할 때 대기나 이전 작업 복원 없이 즉시 Fail-Fast 코드화된 충돌 오류(`LOCKED_PROJECT_CONTROLLER` / `ACTIVE_WRITER`)를 반환하고, 현재 락을 보유한 컨트롤러의 정보(harness, pid, startedAt, contractDigest)를 출력하며 안전 종료한다. — **Reversibility:** one-way — GSD 상태 무결성 및 단일 라이프사이클 권위자 보장.
- **D-06:** 락을 보유한 프로세스가 비정상 종료된 경우(Stale Lock), 락 파일에 기록된 PID의 생존 여부(`isProcessAlive(pid) === false`) 및 호스트명을 확인하여 좀비 락으로 판별되면 감사 로그(Reclaim audit log)를 남기고 안전하게 새 임대를 발급(Auto-Reclaim)한다. — **Reversibility:** reversible
- **D-07:** D-10의 기존 'Hermes 컨트롤러 하드코딩 차단' 규칙을 완전히 마이그레이션한다. `assertControllerRole`에서 `hermes` 이름 하드코딩을 제거하고, 하네스 이름과 무관하게 컨트롤러 역할 영수증과 유효한 펜싱 임대 토큰 보유 여부를 검증하도록 리팩토링한다. — **Reversibility:** one-way — 하네스 중립적 역할 모델(ROL-03)로의 전환.
- **D-08:** 프로젝트 컨트롤러 임대 잠금 파일은 프로젝트 로컬 `.alpha-aos/controller.lock`에 생성하고 임대 토큰(lease token)을 바인딩한다. 이를 통해 프로젝트 파일시스템 경계 내에서 동시 쓰기를 원천 차단하고 프로젝트 상태와 함께 추적한다. — **Reversibility:** costly — 프로젝트 디렉터리 레이아웃 및 락 관리 계층.

### 동일 하네스 리뷰어 격리 및 세션 분리 (Same-Harness Reviewer Isolation)
- **D-09:** 컨트롤러/실행자와 리뷰어가 동일한 하네스(예: Claude-Claude)로 지정된 경우, 컨트롤러와 캐시 및 설정 상태를 공유하지 않도록 격리된 임시 홈/설정 경로를 제공하고, 고유한 `reviewerSessionId`를 발급하여 읽기 전용으로 프로세스를 실행한다. — **Reversibility:** costly — 하네스 실행기 격리 어댑터.
- **D-10:** 사용자가 서로 다른 하네스/모델 리뷰어를 요구할 수 있도록 `differentReviewerPolicy: "require-different-harness" | "require-different-model" | "allow-same"` 계약 정책을 제공하며, 요구된 조건이 충족되지 않으면 preview 단계에서 missing proof로 명확히 시작을 거부한다. — **Reversibility:** costly — 계약 스키마 및 정책 검증기.
- **D-11:** 리뷰어의 읽기 전용 불변식을 보장하기 위해 계약 및 증거를 읽기 전용 컨텍스트로 주입하고, 리뷰어 세션 종료 후 프로젝트 트리(Git status 및 해시)가 변경되었는지 검증(Tree Mutation Guard)하여 파일 수정 발생 시 즉시 해당 리뷰 결과를 무효화(`INVALID_MUTATING_REVIEW`)한다. — **Reversibility:** one-way — 독립 검토의 신뢰성 보증.
- **D-12:** Codex 등 네이티브 어댑터의 조기 비정상 종료(Premature non-zero exit)를 방지하기 위해 5개 하네스 어댑터 각각에 대해 필수 환경변수(`PATH`, `HOME`, 런타임 변수)를 최소 권한으로 정밀하게 허용(Launch Spec 정제)하고, 프로세스 종료 코드와 실제 작업 결과물(산출물 파일/stdout)의 유효성을 결합 검증하는 표준 종료 상태 해석기를 구축한다. — **Reversibility:** costly — 어댑터 프로세스 런처 전반.

### 사용량·비용 텔레메트리 및 미계측 하네스 처리 (Usage & Cost Telemetry)
- **D-13:** 하네스별 텔레메트리 수집 규격을 엄격히 정규화하여, 하네스 출력에서 직접 파싱된 실측 필드(promptTokens, completionTokens, durationMs, modelId 등)만 `measured`로 기록하고, 미제공 항목은 0으로 왜곡하지 않고 `null`/`unknown`으로 정직하게 보존한다. — **Reversibility:** costly — 텔레메트리 스키마 및 저널 파서.
- **D-14:** 계약에 비용 한도(`maxCostUsd`) 또는 토큰 한도(`maxTokens`)가 설정되어 있으나 선택된 하네스 어댑터가 이를 측정할 역량(`telemetryCapabilities`)이 없는 경우, preview 단계에서 `MISSING_TELEMETRY_METER` 에러 코드와 함께 구체적인 하네스/미터 결손 이유를 출력하고 즉시 시작을 거부(Fail-Closed)한다. — **Reversibility:** one-way — 승인되지 않은 비용 발생 및 미계측 초과 방지 안전 불변식.
- **D-15:** 특정 하네스(예: 로컬 Hermes, Ollama, 구독형 CLI)를 0원이나 무료(Free-by-brand)로 단정하지 않는다. 공급자/모델 식별자를 명시하고 비용 필드는 `unmetered` 또는 `unknown`으로 기록하여 비용 상태를 왜곡하지 않는다. — **Reversibility:** reversible
- **D-16:** CLI(`alpha-aos task doctor` 및 `task status`)에서 5개 하네스별로 (1) 컨트롤러/실행자/리뷰어 역할 증명 상태, (2) 네이티브 스킬/MCP 연동 지원, (3) 토큰·비용 계측 역량(`measured` vs `unmetered`)을 독립된 열로 분리한 3차원 종합 리포트 표를 제공한다. — **Reversibility:** reversible

### the agent's Discretion
- `~/.alpha-aos/receipts/harnesses/` 하위 영수증 JSON 파일의 세부 파일명 규칙 및 임시 프로브용 스크립트 작성 방식.
- 125개 트리플 픽스처 테스트의 모의(Mock) 어댑터 구현 세부 형태.
- Tree Mutation Guard에서 무시할 수 있는 OS 생성 임시 파일(예: `.DS_Store`) 필터링 규칙.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위 및 요구사항
- `.planning/PROJECT.md` — v0.2.0 Universal Autonomous Work 목표, GSD 단일 라이프사이클 원칙, 프로세스 격리.
- `.planning/REQUIREMENTS.md` — ROL-01..05 요구사항 명세.
- `.planning/ROADMAP.md` — Phase 16 목표, 성공 기준 및 계획 매핑.

### 승인된 아키텍처 및 검증 기준
- `docs/design/autonomous-work/README.md` — 합성 가능한 하네스 역할, 어댑터 계약, 배타적 임대 및 텔레메트리 설계.
- `docs/design/autonomous-work/WORKFLOW.md` — 수퍼바이저 루프 및 역할별 디스패치 순서.
- `docs/design/autonomous-work/VALIDATION.md` — 동시성 충돌, 조기 종료 결함, 영수증 검증 시나리오.
- `.planning/phases/14-contract-and-vertical-tracer/14-CONTEXT.md` — Phase 14 수직 트레이서 및 판정 영수증 결정 사항.
- `.planning/phases/15-durable-supervisor-and-effect-ledger/15-CONTEXT.md` — Phase 15 내구성 있는 수퍼바이저, 프로세스 정리 및 자원 제한 결정 사항.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/adapters/task-agents.ts`: `probeTaskAgentPair`, `TASK_BOOTSTRAP_PAIR`, `nativeTaskPorts` (Phase 16 5×5×5 확장 베이스).
- `src/adapters/task-agent-launch.ts`: `resolveTaskAgentLaunch`, `TASK_AGENT_BASE_ENVIRONMENT_NAMES`, `HarnessVersionProbe`.
- `src/adapters/task-codex.ts` & `src/adapters/task-claude.ts`: 기존 Codex 컨트롤러 및 Claude 리뷰어 네이티브 어댑터.
- `src/core/writer-lock.ts`: `isProcessAlive`, `syncDirectory`, 배타적 파일 락 및 소유권 검증 로직.
- `src/core/worker-authority.ts`: `assertControllerRole`, `sanitizeWorkerLaunchSpec` (D-10 마이그레이션 대상).
- `src/core/process.ts`: `runProcess`, `openProtocolProcess` 프로세스 실행, 출력 버퍼 캡 및 크로스 플랫폼 프로세스 트리 종료.
- `src/core/task-contract.ts`: `TaskAgentPolicy`, `TaskContract`, `ResourcePolicy` 스키마.
- `src/core/task-run.ts`: `startTask`, `TaskPorts`, `TaskPortAssessment`.

### Established Patterns
- Fail-closed 원칙: 미검증 하네스/역할 및 미계측 비용 한도는 preview 단계에서 즉시 차단.
- GSD 단일 라이프사이클 권위자: 프로젝트 라이프사이클 및 `.planning/` 상태는 단 하나의 컨트롤러만 변경.
- 결정론적 픽스처: CI 환경에서는 모의 프로브를 통해 125개 전체 조합을 합성 검증하고, 실제 호스트는 실측 영수증 기반으로 활성화.

### Integration Points
- `src/adapters/` 하위에 Antigravity, Pi, Hermes 네이티브 어댑터 신설 (`task-antigravity.ts`, `task-pi.ts`, `task-hermes.ts`).
- `src/adapters/task-agents.ts`에 125개 역할 조합 레지스트리 및 증명 프로브 구현.
- `src/core/writer-lock.ts`를 바탕으로 프로젝트 로컬 `.alpha-aos/controller.lock` 펜싱 임대 시스템 구축.
- `src/core/worker-authority.ts`의 D-10 하드코딩을 펜싱 락 및 컨트롤러 영수증 검사로 마이그레이션.
- `src/cli.ts`의 `task doctor`, `task plan`, `task start`에 3차원 하네스 매트릭스 리포트 및 Fail-Closed 검증 통합.

</code_context>

<specifics>
## Specific Ideas

- 125개 역할 조합은 모의 픽스처에서 완전히 합성 가능해야 하며, 어떤 조합이든 누락된 증거가 있으면 정확히 결손된 이유를 출력해야 한다.
- 동시 실행 시 두 번째 컨트롤러는 즉시 `LOCKED_PROJECT_CONTROLLER` 오류로 빠져나가야 하며 첫 번째 컨트롤러의 작업을 건드리지 않는다.
- Codex 컨트롤러의 GSD quick 결함 수정 라이브 트레이서가 조기 비정상 종료 없이 끝까지 완주되어야 한다.

</specifics>

<deferred>
## Deferred Ideas

None — 토론은 Phase 16 범위 내에서 완료되었습니다. 전체 GSD 라이프사이클 브리지는 Phase 17, 전면적 기능 패브릭 연동은 Phase 18, 심층 독립 리뷰/수정 루프는 Phase 19, 비코드/CoursePilot 커넥터는 Phase 20에서 순차적으로 구현됩니다.

</deferred>

---

*Phase: 16-Composable Harness Roles*
*Context gathered: 2026-10-02*
