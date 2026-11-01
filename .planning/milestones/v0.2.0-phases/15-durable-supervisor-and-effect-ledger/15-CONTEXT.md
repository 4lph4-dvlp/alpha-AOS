# Phase 15: Durable Supervisor and Effect Ledger - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Phase Boundary

프로세스 중단 후 안전하게 복구하고(Resume after interruption), 계약에 정의된 자원 한계(Cycles, Time, Tokens, Cost)를 준수하며, 외부 효과(Effect)를 결정론적 키와 소스 증거로 조정하여 중복 실행을 방지하는 내구성 있는 수퍼바이저(Durable Supervisor) 및 효과 원장(Effect Ledger)을 구현한다. alpha-AOS의 시도/프로세스 저널과 GSD의 프로젝트 라이프사이클 상태를 엄격히 분리하고, 비진행(no-progress) 핑거프린트 감지 시 점진적 대안 전략을 적용하며 대안 소진 시 안전하게 `blocked`로 멈춘다. 5개 하네스 전체 어댑터 및 역할 합성은 Phase 16, 전체 GSD 라이프사이클 라우팅은 Phase 17의 범위다.

</domain>

<decisions>
## Implementation Decisions

### 저널 저장 구조 및 체크포인트 세분성
- **D-01:** 실행 저널과 체크포인트를 `~/.alpha-aos/runs/<contractDigest>/` 아래에 append-only `journal.jsonl`과 원자적 `checkpoint.json`으로 분리 유지한다. — **Reversibility:** costly — 수퍼바이저 복구 엔진, CLI 조회 도구 및 디스크 레이아웃 규격 전반에 영향.
- **D-02:** 매 주요 상태 전이(시작, 실행, 검측, 리뷰, 수리) 및 각 외부 효과(Effect) 실행 직전/직후에 즉시 원자적으로 디스크에 체크포인트를 기록(fsync)한다. — **Reversibility:** reversible
- **D-03:** 저널 기록 시점에 시크릿 및 환경변수 패턴을 즉시 마스킹(`[REDACTED]`)하고, stdout/stderr 프로세스 출력은 64KB 상한 캡 및 sha256 해시 요약으로 저장한다. — **Reversibility:** costly — 보안 제약 및 저널 파싱/포맷 계약과 직결.
- **D-04:** 프로세스 중단 후 재개(Resume) 시점에 실제 GSD 상태(`.planning/STATE.md`, Git HEAD)를 먼저 관측하여 저널 체크포인트와 대조하고, 일치 여부를 검증한 후 안전하게 다음 미완료 단계부터 재개한다. — **Reversibility:** one-way — GSD를 단일 프로젝트 라이프사이클 권위자로 유지하는 시스템 불변식.

### 효과 키(Operation Key) 및 중단된 효과의 소스 조정
- **D-05:** 외부 효과에 할당할 고유 효과 키는 결정론적 해시 `sha256(contractDigest:attemptIndex:effectType:targetPayload)`로 생성한다. — **Reversibility:** costly — 효과 식별 및 중복 판별의 기초 규격.
- **D-06:** 효과 원장(Effect Ledger)에서 개별 효과는 `planned` -> `performing` -> `applied` | `failed` | `uncertain` 상태 머신을 따른다. — **Reversibility:** costly — 원장 상태 머신 및 복구 로직의 핵심 상태.
- **D-07:** 크래시 후 재개 시 `performing` 상태로 남아있는 불확실한 효과는 효과 유형별 결정론적 소스 증거 검사(파일: 해시 대조, Git: HEAD/커밋 로그 대조, 패키지: manifest 대조)로 이미 반영됨이 확인되면 `applied`로 전이하고 스킵하며, 확인 불가 시 `unknown` 처리한다. — **Reversibility:** one-way — 외부 시스템 부작용의 중복 실행 방지 안전 보증.
- **D-08:** 소스 증거로도 효과 완료 여부를 증명할 수 없거나 상충될 경우 상태를 `unknown`으로 기록하고 수퍼바이저를 `blocked`로 안전 정지하며 원인과 수동 검토 가이드를 제시한다. — **Reversibility:** reversible

### 비진행(No-progress) 감지 기준 및 전략 전환 정책
- **D-09:** 반복되는 동일 실패를 식별하는 실패 지문(Failure Fingerprint)은 `criterionId` + 실패 유형(`cause`) + 정규화된 에러 요약 해시 `sha256(...)`으로 정의한다. — **Reversibility:** costly — 반복 실패 판별 및 디바운싱 알고리즘.
- **D-10:** 동일 실패 지문이 2회 연속 발생하면 즉시 비진행(no-progress)으로 판단하고 대안 전략 전환을 트리거한다. — **Reversibility:** reversible
- **D-11:** 대안 전략은 순차적 3단계를 적용한다: 1단계(검측/리뷰어의 정밀 진단 및 최소 재현 코드 주입) -> 2단계(실패한 기준 1개에 집중하도록 작업 범위 좁힘) -> 소진 시 `blocked` 전환. — **Reversibility:** reversible
- **D-12:** 모든 대안 전략이 소진되어 `blocked`로 종료될 때 실패 지문, 시도된 전략 내역, 실패 기준 최소 재현 증거, 명확한 다음 조치(Next Action)를 포함한 구조화된 Blocked 리포트를 제공하고 저널에 영구 보존한다. — **Reversibility:** reversible

### 자원 제한(Limits) 및 미계측 텔레메트리 처리
- **D-13:** 사용자가 자원 제한을 무제한(unlimited)으로 지정해도 전체 시도/시간만 무제한일 뿐, 개별 시도(Attempt) 프로세스에는 단일 실행 타임아웃(15분), 스트림 버퍼 상한(10MB), 프로세스 트리 정리를 필수 안전망으로 강제 적용한다. — **Reversibility:** one-way — 프로세스 무한 행 및 좀비 프로세스 방지 안전 보증.
- **D-14:** 계약에 비용 한도(maxCostUsd)가 명시되었으나 하네스가 신뢰할 수 있는 비용/토큰 텔레메트리를 제공하지 못할 경우 시작(Start/Preview) 시점에 즉시 Fail-Closed로 차단하고 실행을 거부한다. — **Reversibility:** one-way — 승인되지 않은 비용 발생을 방지하는 보안/재정 불변식.
- **D-15:** 자원 한계 도달 시 정밀한 표준 정지 코드(`cycle_limit_exceeded`, `wall_time_exceeded`, `cost_limit_exceeded`, `no_progress_exhausted`, `quota_exhausted`)와 누적 사용량 내역(측정값 및 미계측 필드 명시), 재개 방법을 명시한다. — **Reversibility:** reversible
- **D-16:** 타임아웃 또는 취소 시 Windows(`taskkill /F /T /PID`) 및 Unix/macOS(프로세스 그룹 `kill -SIGTERM` -> 유예 후 `SIGKILL`) 크로스 플랫폼 프로세스 트리를 완전 정리하고, 취소 시점까지의 리댁션된 버퍼/증거를 저널에 보존한다. — **Reversibility:** costly — `src/core/process.ts`의 핵심 프로세스 관리 로직.

### the agent's Discretion
- 저널/체크포인트 디렉터리 생성 및 파일 쓰기 원자성을 위한 임시 파일 확장자(`.tmp`)와 교체(rename) 세부 구현 방식.
- 단일 프로세스 타임아웃(15분) 및 출력 버퍼 상한(10MB)의 세부 설정 가능 여부 및 CLI 플래그 노출 수준.
- 정규화된 에러 요약 추출 시 공백/스택트레이스 경로 정규화 정규식 상세 패턴.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 범위 및 요구사항
- `.planning/PROJECT.md` — v0.2.0 Universal Autonomous Work 목표, GSD 단일 라이프사이클 원칙, 프로세스 격리.
- `.planning/REQUIREMENTS.md` — RUN-02..05, TOOL-03 요구사항 명세.
- `.planning/ROADMAP.md` — Phase 15 목표, 성공 기준 및 계획 매핑.

### 승인된 아키텍처 및 검증 기준
- `docs/design/autonomous-work/README.md` — 수퍼바이저 상태 머신, 실행 저널, 효과 원장 및 자원 제한 설계.
- `docs/design/autonomous-work/WORKFLOW.md` — 수퍼바이저 루프 및 복구 시점 연결.
- `docs/design/autonomous-work/VALIDATION.md` — 비진행, 결함 주입, 크래시 복구 및 세 플랫폼 검증 시나리오.
- `.planning/phases/14-contract-and-vertical-tracer/14-CONTEXT.md` — Phase 14 수직 트레이서 및 판정 영수증 결정 사항.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/process.ts`: 프로세스 실행, 타임아웃, 출력 버퍼 캡 및 트리 종료 (`runProcess`, `openProtocolProcess`).
- `src/core/transaction.ts`: snapshot, journal, 원자적 쓰기 및 drift-safe 롤백 로직.
- `src/core/task-run.ts`: `startTask`, `TaskContract`, `TaskMeasurement`, `TaskVerdict` 단일 시도 구현.
- `src/core/task-effects.ts`: `auditTaskEffects`, `TaskCommit`, `runPackCheckpoint` 효과 검사기.
- `src/core/task-check.ts`: `collectTaskArtifact`, `confirmReviewerReproduction`, `materializeTaskSnapshot`.
- `src/core/task-git.ts`: Git 디렉터리 격리 및 제어 파일 보호.

### Established Patterns
- GSD가 프로젝트 상태의 단일 권위자이며, alpha-AOS는 실행 시도, 효과 원장, 영수증을 `userStateRoot()` 하위에 별도 관리.
- Fail-closed 원칙: 불확실한 효과나 계측되지 않은 비용 제한은 추측으로 통과시키지 않고 즉시 차단.
- 검증 및 판정 결과의 불변 digest 바인딩.

### Integration Points
- `src/core/task-run.ts`의 `startTask`를 래핑하거나 확장하여 내구성 있는 수퍼바이저 루프(`superviseTask`, `resumeTask`) 구축.
- `~/.alpha-aos/runs/<contractDigest>/` 경로에 `journal.jsonl` 및 `checkpoint.json` 원속성 계층 연결.
- `src/core/process.ts`에 Windows/Unix/macOS 프로세스 트리 완전 정리 및 강제 종료 로직 강화.

</code_context>

<specifics>
## Specific Ideas

- 저널은 JSONL 형식으로 한 줄씩 append-only 스트림으로 기록되어 프로세스가 불시에 죽더라도 이전 이벤트가 디스크에 온전히 남아야 한다.
- 체크포인트는 원자적 rename 방식으로 기록되어 파손된 JSON이 남지 않도록 보장한다.
- 2회 동일 실패 시 맹목적인 재시도 대신 최소 재현 코드를 프롬프트에 주입하는 구체적 전략 전환이 이루어져야 한다.

</specifics>

<deferred>
## Deferred Ideas

None — 토론은 Phase 15 범위 내에서 완료되었습니다. 5개 하네스 역할 합성은 Phase 16, 전체 GSD 라이프사이클 브리지는 Phase 17, 전면적 독립 리뷰/수정 루프는 Phase 19, 비코드/CoursePilot 커넥터는 Phase 20에서 순차적으로 구현됩니다.

</deferred>

---

*Phase: 15-Durable Supervisor and Effect Ledger*
*Context gathered: 2026-10-01*
