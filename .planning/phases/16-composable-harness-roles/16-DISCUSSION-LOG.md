# Phase 16: Composable Harness Roles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-02
**Phase:** 16-composable-harness-roles
**Areas discussed:** 역할 조합 및 증명 정책, 배타적 컨트롤러 임대 및 동시성 펜싱, 동일 하네스 리뷰어 격리 및 세션 분리, 사용량·비용 텔레메트리 및 미계측 하네스 처리

---

## 역할 조합 및 증명 정책 (5×5×5 Role Composition & Capability Proof)

### 질문 1: 계약 미리보기(Preview) 시점에 특정 하네스나 역할의 검증 영수증이 부족한 경우 어떻게 처리할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 엄격한 Fail-Closed | preview 시점에 3개 역할의 영수증을 검사하고, 미설치 또는 영수증 부재 시 누락된 증거(CLI 바이너리 미발견 또는 미검증 역할)를 구체적으로 명시하며 계약 승인/시작 차단 | ✓ |
| 온디맨드 프로브 (On-Demand Probe) | 바이너리가 존재하면 preview 단계에서 안전한 읽기 전용 canary(버전/도움말 호출)를 즉석 실행해 영수증을 획득하고 지원 역할로 자동 승격 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 엄격한 Fail-Closed
**Notes:** 사전에 입증되지 않은 하네스/역할이 실수로 실행되는 것을 완전히 방지하기 위해 엄격한 사전 거부(Fail-Closed)를 채택했습니다.

### 질문 2: 하네스 CLI 바이너리가 업데이트되어 이전 검증 영수증과 버전이 달라진 경우(Version Drift) 어떻게 대응할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 즉시 unverified로 강등 | 바이너리 버전이 영수증의 버전과 다르면 즉시 역할을 unverified로 강등하고 명시적 재프로브 명령을 안내 (안전 불변식 준수) | ✓ |
| 자동 갱신 프로브 | 버전 불일치 감지 시 즉시 백그라운드에서 읽기 전용 프로브를 수행하여 새 버전에 대한 영수증을 자동으로 갱신 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 즉시 unverified로 강등
**Notes:** CLI 버전 변경 시 발생할 수 있는 호환성 파괴를 선제적으로 차단하기 위해 강등 후 재프로브 방식을 선택했습니다.

### 질문 3: 5×5×5 (125개) 역할 트리플 합성 검증 픽스처는 어떻게 구성할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 결정론적 매트릭스 픽스처 + 호스트별 런타임 분리 | 테스트 스위트에서는 모의 프로브(Mock Capability)를 통해 125개 전체 트리플의 결정론적 검증 로직(증거 충분 시 수락, 결손 시 원인 명시)을 완전 검증하고, 실제 호스트에서는 로컬에 존재하는 하네스 실측 영수증으로만 활성화 | ✓ |
| 대표 조합 중심 실측 검증 | 125개 전체를 픽스처로 돌리지 않고, 검증된 대표 5개 조합만 테스트하고 나머지는 온디맨드로 처리 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 결정론적 매트릭스 픽스처 + 호스트별 런타임 분리
**Notes:** CI 환경에서 외부 인증/토큰 의존성 없이 전체 125개 조합의 선택 및 거부 로직을 완벽하게 검증할 수 있도록 설계했습니다.

### 질문 4: 하네스/역할별 실측 영수증(Invocation Receipt)의 저장 위치와 구조는 어떻게 관리할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 개별 영수증 파일 (~/.alpha-aos/receipts/harnesses/<harness>-<role>.json) | 하네스/역할별 독립 JSON 파일에 CLI 버전, 바이너리 해시, 실행/해석/취소 검증 플래그, 프로브 시각을 보관하여 원자적 갱신 및 독립 검증 지원 | ✓ |
| 단일 통합 매트릭스 파일 (~/.alpha-aos/harness-matrix.json) | 한 파일 안에 5개 하네스의 모든 역할 검증 상태와 영수증을 종합하여 저장 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 개별 영수증 파일
**Notes:** 각 하네스/역할의 원자적 업데이트와 파일 경합 없는 관리를 위해 개별 파일로 분리했습니다.

---

## 배타적 컨트롤러 임대 및 동시성 펜싱 (Exclusive Controller Lease & Fencing)

### 질문 1: 동일한 프로젝트에 대해 두 번째 컨트롤러가 동시에 진입하려 할 때(충돌 발생 시) 어떻게 동작해야 할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 즉시 Fail-Fast 충돌 반환 | 대기나 복원 없이 코드화된 충돌 오류(LOCKED_PROJECT_CONTROLLER)를 반환하고, 현재 잠금을 획득한 컨트롤러의 정보(harness, pid, startedAt, contractDigest)를 출력하며 안전 종료 | ✓ |
| 지정 시간 대기 (Spin-wait with timeout) | 짧은 시간(예: 30초) 동안 지수 백오프로 잠금 해제를 기다린 후 타임아웃 시 충돌 에러로 종료 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 즉시 Fail-Fast 충돌 반환
**Notes:** 기존 진행 중인 컨트롤러의 작업을 결코 손상시키지 않고 명확한 에러 코드로 충돌을 알립니다.

### 질문 2: 이전 실행 프로세스가 비정상 종료(Crash/Kill)되어 락 파일이 남아있는 경우(Stale Lock) 어떻게 처리할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) PID 생존 검사 기반 자동 정리 (Stale Lock Auto-Reclaim) | 락을 보유한 PID가 더 이상 생존하지 않는 경우(isProcessAlive false) 좀비 락으로 판단해 감사 로그를 남기고 안전하게 새 임대를 발급 | ✓ |
| 수동 수리 강제 (Manual Repair Required) | PID 종료 여부와 무관하게 락 파일이 남아 있으면 중단하고 `alpha-aos repair --apply` 실행을 명시적으로 요구 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) PID 생존 검사 기반 자동 정리 (Stale Lock Auto-Reclaim)
**Notes:** 동일 호스트에서 PID가 이미 사망한 것이 명백한 경우 개발자 경험을 위해 안전한 자동 회수를 수행합니다.

### 질문 3: D-10의 기존 'Hermes 컨트롤러 하드코딩 차단' 규칙은 어떻게 마이그레이션할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 영수증 및 임대 토큰 기반 검증으로 완전 전환 | assertControllerRole의 'hermes' 이름 하드코딩을 제거하고, 하네스에 상관없이 컨트롤러 영수증과 유효한 펜싱 임대 토큰을 보유했는지를 검사하도록 마이그레이션 | ✓ |
| 단계적 완화 (Opt-in Flag) | 기본적으로는 Hermes 컨트롤러를 차단하되, 명시적인 영수증이 있고 플래그가 지정된 경우에만 허용하는 완충 단계 유지 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 영수증 및 임대 토큰 기반 검증으로 완전 전환
**Notes:** ROL-03 요구사항에 따라 특정 브랜드 이름 차단에서 실측 역량 검증으로 전환했습니다.

### 질문 4: 프로젝트 컨트롤러 임대 잠금 파일(Controller Lock)은 어디에 위치시켜야 할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 프로젝트 로컬 .alpha-aos/controller.lock | 프로젝트 저장소의 `.alpha-aos/` 디렉터리에 직접 락을 기록하여 프로젝트 격리 및 펜싱 토큰을 보장하고, 프로젝트와 함께 상태가 추적되도록 구성 | ✓ |
| 전역 관리 루트 ~/.alpha-aos/locks/<projectId>.lock | 프로젝트 파일을 수정하지 않고 사용자 전역 상태 디렉터리에서 프로젝트 해시(projectId)별로 잠금을 중앙 집중 관리 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 프로젝트 로컬 .alpha-aos/controller.lock
**Notes:** 프로젝트 파일시스템 경계 내에 락을 위치시켜 단일 프로젝트 단위의 배타적 쓰기 권한을 명확히 보장합니다.

---

## 동일 하네스 리뷰어 격리 및 세션 분리 (Same-Harness Reviewer Isolation)

### 질문 1: 컨트롤러/실행자와 리뷰어가 동일 하네스(예: Claude-Claude)일 때, '별도로 식별되는 신선한 세션(Fresh Session)'을 어떤 수준으로 격리할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 격리된 임시 런타임 환경 + 고유 세션 ID 부여 | 컨트롤러와 캐시/설정 상태를 공유하지 않도록 격리된 임시 홈/설정 경로를 제공하고, 고유 reviewerSessionId를 발급하여 읽기 전용으로 프로세스 실행 | ✓ |
| 기본 환경 공유 + 새 프로세스 및 읽기 전용 프롬프트 분리 | 사용자 기본 설정/홈을 공유하되 새 프로세스 PID와 읽기 전용 지침(Role instruction)만 분리하여 경량 실행 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 격리된 임시 런타임 환경 + 고유 세션 ID 부여
**Notes:** 독립적인 검토 결과를 담보하기 위해 설정 및 캐시 오염을 물리적으로 차단하는 임시 환경을 생성합니다.

### 질문 2: 사용자가 다른 하네스/모델 리뷰어를 요구하는 정책(Different Reviewer Policy)은 어떻게 지정하고 강제할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 명시적 계약 정책 (require-different-harness \| require-different-model \| allow-same) | 계약의 agentPolicy에 엄격한 옵션을 제공하고, 요구된 조건이 충족되지 않으면 preview 단계에서 missing proof로 명확히 거부 | ✓ |
| 자동 최선의 노력 (Best-effort fallback) | 다른 하네스/모델이 존재하면 우선 배정하되, 불가능할 경우 동일 하네스로 자동 강등하고 경고만 기록 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 명시적 계약 정책
**Notes:** 엄격한 독립 검토 요구를 준수하기 위해 조건 미충족 시 사전에 실패하도록 정책을 고정했습니다.

### 질문 3: 리뷰어의 읽기 전용(Read-only) 불변식을 프로젝트 파일시스템 수준에서 어떻게 보증할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 읽기 전용 컨텍스트 주입 + 트리 변조 감지 (Tree Mutation Guard) | 계약 및 증거를 읽기 전용으로 주입하고, 리뷰어 세션 종료 후 프로젝트 트리(Git status / 해시)가 변경되었는지 검증하여 파일 수정 발생 시 즉시 리뷰 무효화 | ✓ |
| 임시 Git Worktree 물리 격리 | 리뷰용 임시 worktree를 별도 디렉터리에 체크아웃하여 실행함으로써 원본 작업 트리에 대한 파일 쓰기를 원천 차단 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 읽기 전용 컨텍스트 주입 + 트리 변조 감지
**Notes:** 리뷰어 프로세스가 무단으로 소스코드를 변경하거나 산출물을 위조하지 못하도록 종료 즉시 트리 무결성을 검증합니다.

### 질문 4: Codex 등 네이티브 어댑터 실행 시 조기 비정상 종료(Premature non-zero exit)를 방지하고 안정적인 실행/종료 해석을 보장하기 위한 어댑터 표준화 방식은 무엇인가요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 하네스별 정밀 Launch Spec 및 종료 상태 해석기 표준화 | 5개 하네스 어댑터 각각에 대해 필수 환경변수(PATH, HOME, 런타임)를 명시적으로 허용하고, 프로세스 종료 코드와 실제 작업 결과물(산출물 파일/stdout)의 유효성을 결합 검증하여 조기 비정상 종료 방지 | ✓ |
| 셸 래퍼 스크립트 실행 | 하네스별로 임시 배치/셸 스크립트를 작성하여 환경을 초기화한 후 실행하도록 래핑 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 하네스별 정밀 Launch Spec 및 종료 상태 해석기 표준화
**Notes:** Phase 14에서 드러난 어댑터 조기 종료 결함을 체계적으로 방지하기 위해 최소 권한 환경 변수와 표준화된 종료 해석기를 도입합니다.

---

## 사용량·비용 텔레메트리 및 미계측 하네스 처리 (Usage & Cost Telemetry)

### 질문 1: 하네스별로 토큰이나 비용 출력 지원 수준이 다를 때, 텔레메트리 수집 규격을 어떻게 정규화할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 엄격한 실측치(measured) vs unknown 분리 | 하네스 출력에서 직접 파싱된 실측 필드만 기록하고, 미제공 항목은 0으로 간주하지 않고 null/unknown으로 정직하게 보존 | ✓ |
| 모델 단가표 기반 휴리스틱 추정치 제공 | 미제공 시 모델 식별자를 바탕으로 예상 토큰/비용 추정치(estimated)를 계산하여 보조 필드로 제공 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 엄격한 실측치(measured) vs unknown 분리
**Notes:** 측정되지 않은 데이터를 0으로 처리하거나 추정치로 왜곡하지 않고 정직하게 unknown으로 보존합니다.

### 질문 2: 계약에 비용 한도(maxCostUsd)가 지정되었으나 선택된 하네스가 비용 측정을 지원하지 못할 때 언제 어떻게 차단할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Preview 단계에서 telemetryCapabilities 검증 후 사전 Fail-Closed | 계약에 maxCostUsd/maxTokens가 설정되어 있으나 선택된 하네스 어댑터가 이를 측정하지 못하면 preview 단계에서 MISSING_TELEMETRY_METER로 즉시 시작 거부 | ✓ |
| 사후 검사 중단 (Runtime Stop) | preview는 통과시키되 첫 실행 시도 후 하네스 텔레메트리가 unknown으로 반환되면 그 즉시 안전 정지 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) Preview 단계에서 telemetryCapabilities 검증 후 사전 Fail-Closed
**Notes:** Phase 15 D-14의 비용 한도 Fail-Closed 원칙을 preview 단계에서 선제 적용합니다.

### 질문 3: 로컬 모델이나 구독형 하네스처럼 건당 API 비용이 발생하지 않는 환경의 비용 표기는 어떻게 할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) provider/model 표기 및 cost는 unmetered/unknown으로 명시 | 특정 하네스(예: 로컬 Hermes, 구독형 CLI)를 0원이나 무료로 단정하지 않고, 측정 불가는 unmetered/unknown으로 표시하여 비용 왜곡 방지 | ✓ |
| 비용을 0.00으로 표시하고 각주에 '구독/로컬 환경' 표기 | 숫자 계산 편의를 위해 0.00으로 두되 라벨로 구분 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) provider/model 표기 및 cost는 unmetered/unknown으로 명시
**Notes:** 브랜드 이름만으로 비용을 0원으로 단정하는 Free-by-brand 안티패턴(ROL-05)을 철저히 배제합니다.

### 질문 4: CLI(task doctor / status)에서 하네스별 역할 지원과 텔레메트리 역량을 사용자에게 어떻게 시각화하여 보고할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 3차원 분리 리포트 표 (역할 지원 / MCP·스킬 연동 / 텔레메트리 역량) | 5개 하네스별로 (1) 역할 증명 상태, (2) 네이티브 스킬/MCP 지원, (3) 토큰·비용 계측 가용 여부(measured / unmetered)를 독립 열로 명확히 분리하여 CLI 표로 출력 | ✓ |
| 역할 중심 단순 요약 표 | 5개 하네스의 역할 지원(Controller, Executor, Reviewer)만 간략히 요약하고 상세 텔레메트리는 --verbose 플래그로 분리 | |
| 에이전트 재량 위임 (You decide) | 구현자 재량에 위임 | |

**User's choice:** (Recommended) 3차원 분리 리포트 표
**Notes:** 하네스의 기능과 계측 역량을 직관적이고 투명하게 파악할 수 있도록 3차원 표 형태로 제공합니다.

---

## the agent's Discretion

- `~/.alpha-aos/receipts/harnesses/` 하위 영수증 JSON 파일의 세부 파일명 규칙 및 임시 프로브용 스크립트 작성 방식.
- 125개 트리플 픽스처 테스트의 모의(Mock) 어댑터 구현 세부 형태.
- Tree Mutation Guard에서 무시할 수 있는 OS 생성 임시 파일(예: `.DS_Store`) 필터링 규칙.

## Deferred Ideas

None — 토론은 Phase 16 범위 내에서 완료되었습니다. 전체 GSD 라이프사이클 브리지는 Phase 17, 전면적 기능 패브릭 연동은 Phase 18, 심층 독립 리뷰/수정 루프는 Phase 19, 비코드/CoursePilot 커넥터는 Phase 20에서 순차적으로 다룹니다.
