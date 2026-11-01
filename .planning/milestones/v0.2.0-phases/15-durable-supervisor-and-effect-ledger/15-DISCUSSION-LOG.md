# Phase 15: Durable Supervisor and Effect Ledger - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-01
**Phase:** 15-durable-supervisor-and-effect-ledger
**Areas discussed:** 저널 저장 구조 및 체크포인트 세분성, 효과 키(Operation Key) 및 중단된 효과의 소스 조정, 비진행(No-progress) 감지 기준 및 전략 전환 정책, 자원 제한(Limits) 및 미계측 텔레메트리 처리

---

## 저널 저장 구조 및 체크포인트 세분성

### Q1: 실행 저널과 체크포인트를 파일시스템 상에 어떻게 구성하고 저장할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) ~/.alpha-aos/runs/<contractDigest>/ 아래에 append-only `journal.jsonl`과 원자적 `checkpoint.json` 분리 | 모든 상태/시도 이벤트를 보존하면서 크래시 후 빠른 O(1) 복구 지원 | ✓ |
| 원자적 `checkpoint.json` 단일 파일로 매 전이 시 덮어쓰기 | 단순하지만 과거 시도 내역 및 세부 타임라인 추적에 한계 | |
| 기존 transaction.ts의 ~/.alpha-aos/journal/ 파일 롤백 저널에 통합 | 파일 트랜잭션과 수퍼바이저 프로세스 상태가 혼재되어 관심사 분리 위배 | |

**User's choice:** (Recommended) ~/.alpha-aos/runs/<contractDigest>/ 아래에 append-only `journal.jsonl`과 원자적 `checkpoint.json` 분리
**Notes:** 저널은 순차적 이벤트 스트림으로 남기고, 최신 복구 상태는 원자적 JSON 스냅샷으로 유지.

### Q2: 체크포인트(checkpoint.json)를 디스크에 원자적으로 기록(fsync)하는 세분성(시점)은 어떻게 할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 매 주요 상태 전이 및 각 외부 효과 실행 직전/직후에 즉시 원자적 기록 | 크래시 발생 시 효과 실행 여부의 불확실성을 최소화 | ✓ |
| 시도(Attempt) 완료 및 판정(Verdict) 산출 시점에만 기록 | 디스크 쓰기 횟수는 줄어들지만 시도 도중 강제 종료 시 세부 진행 상태 유실 | |
| 제어자(Controller) 종료 및 에러 발생 시에만 기록 | 예기치 않은 시스템 전원 차단이나 SIGKILL 시 복구 불가능 위험 | |

**User's choice:** (Recommended) 매 주요 상태 전이 및 각 외부 효과 실행 직전/직후에 즉시 원자적 기록
**Notes:** 상태 전이와 효과 경계마다 즉각적인 fsync 기반 원자적 체크포인트 작성.

### Q3: 저널에 프로세스 출력과 로그를 기록할 때 보안 리댁션(Redaction) 및 크기 제한은 어떻게 적용할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 기록 시점에 시크릿/환경변수 패턴을 즉시 마스킹([REDACTED])하고 stdout/stderr 출력은 64KB 캡 및 sha256 해시 요약 저장 | 저널 내 비밀 유출 차단 및 대용량 출력으로 인한 저널 비대화 방지 | ✓ |
| 원시 출력 전문을 그대로 저장하되 CLI에서 조회/출력할 때만 마스킹 처리 | 저널 원시 파일 자체에 민감 정보가 남아 보안 제약 위배 위험 | |
| 출력 본문은 저장하지 않고 프로세스 종료 코드와 에러 요약 메시지만 기록 | 안전하지만 실패 원인 정밀 디버깅과 지문 분석에 정보 부족 | |

**User's choice:** (Recommended) 기록 시점에 시크릿/환경변수 패턴을 즉시 마스킹([REDACTED])하고 stdout/stderr 출력은 64KB 캡 및 sha256 해시 요약 저장
**Notes:** 디스크 저장 시점에 즉각적인 리댁션과 64KB 상한 적용.

### Q4: 프로세스 중단 후 재개(Resume)할 때 alpha-AOS 저널 상태와 GSD 프로젝트 상태 간의 불일치를 어떻게 다룰까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 재개 시점에 실제 GSD 상태(.planning/STATE.md, Git HEAD)를 먼저 관측하여 저널 체크포인트와 대조하고, 일치 여부를 검증한 후 안전하게 다음 미완료 단계부터 재개 | GSD의 단일 프로젝트 라이프사이클 권위 원칙 보장 | ✓ |
| 저널 체크포인트만 전적으로 신뢰하고 GSD 디스크 상태와 무관하게 저널의 마지막 기록 시점부터 재개 | GSD 디스크 상태와 수퍼바이저 간 상태 드리프트 위험 | |
| GSD 상태와 저널 체크포인트 간에 조금이라도 차이가 있으면 즉시 `blocked`로 중단하고 사용자 개입 요구 | 안전하지만 사소한 환경 차이에도 자동 복구 실패 | |

**User's choice:** (Recommended) 재개 시점에 실제 GSD 상태를 먼저 관측하여 대조 후 미완료 단계부터 안전하게 재개
**Notes:** GSD가 프로젝트 상태 권위자임을 유지하면서 불일치 시 안전한 재동기화 수행.

---

## 효과 키(Operation Key) 및 중단된 효과의 소스 조정

### Q1: 외부 효과에 할당할 고유 효과 키(Operation Key)는 어떻게 생성할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 결정론적 해시 키: `sha256(contractDigest:attemptIndex:effectType:targetPayload)` 생성 | 크래시 전후 동일 시도의 동일 효과에 대해 불변의 고유 식별자 보장 | ✓ |
| 실행 시점마다 무작위 UUID v4 발급 | 단순하지만 크래시 후 이전 미완료 효과와의 동일성 매핑을 위해 별도 매핑 테이블 필요 | |
| 시도 내 순번(예: effect-001, effect-002) 사용 | 간단하지만 페이로드 변경이나 순서 변경 시 중복 감지 취약 | |

**User's choice:** (Recommended) 결정론적 해시 키 `sha256(contractDigest:attemptIndex:effectType:targetPayload)`
**Notes:** 멱등성과 중복 실행 방지를 위한 결정론적 해시 채택.

### Q2: 효과 원장(Effect Ledger)에서 개별 효과가 거치는 상태 전이 머신은 어떻게 정의할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) `planned` -> `performing` -> `applied` \| `failed` \| `uncertain` | 실행 직전 performing으로 상태를 잠그고, 크래시 시 uncertain으로 분류하여 안전한 조정 유도 | ✓ |
| `pending` -> `completed` 2단계 상태 | 단순하지만 실행 중 중단되었을 때 실제 실행 여부를 상태만으로 판별 불가 | |
| `scheduled` -> `executed` -> `verified` 3단계 | 검증 단계를 별도 상태로 분리하되 불확실 상태는 별도 플래그로 관리 | |

**User's choice:** (Recommended) `planned` -> `performing` -> `applied` | `failed` | `uncertain`
**Notes:** 실행 전 performing 잠금, 크래시 발생 시 uncertain 식별.

### Q3: 크래시 후 재개 시 `performing` 상태로 남아있는 불확실한 효과를 소스 증거와 대조하여 어떻게 조정할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 효과 유형별 결정론적 소스 증거 검사(파일 해시, Git HEAD/커밋 로그, 패키지 manifest)로 이미 반영됨이 확인되면 `applied`로 전이하고 스킵, 확인 불가 시 `unknown` 처리 | 중복 부작용 원천 방지 | ✓ |
| 불확실한 효과는 이전 흔적을 무조건 롤백/삭제하고 항상 처음부터 재실행 | 외부 API나 비멱등 작업 시 중복 호출/커밋 발생 위험 | |
| 불확실한 효과 발견 시 수퍼바이저 자동 조정을 중단하고 사용자에게 CLI/대화로 수동 확인 요청 | 자율 복구가 중단되어 무인 실행 불가 | |

**User's choice:** (Recommended) 효과 유형별 결정론적 소스 증거 검사로 확인 시 `applied` 스킵, 미확인 시 `unknown`
**Notes:** 소스 증거 기반의 멱등 조정 보장.

### Q4: 소스 증거로도 효과 완료 여부를 증명할 수 없거나 상충되는 증거가 발견될 경우 어떻게 처리할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 상태를 `unknown`으로 기록하고 수퍼바이저를 `blocked`로 안전하게 멈추며, 원인과 수동 검토 가이드 제시 | 외부 부작용의 임의 재시도를 방지하는 fail-closed | ✓ |
| 실패(`failed`)로 처리하고 다음 시도 루프로 넘어가 새로운 작업으로 재시도 | 비멱등 외부 작업의 중복 호출이나 깃 히스토리 오염 위험 | |
| 성공(`applied`)으로 가정한 채 후속 단계로 강제 진행 | 미완료 작업이 완료된 것처럼 오인되어 결함 발생 | |

**User's choice:** (Recommended) `unknown` 기록 후 `blocked`로 안전하게 정지 (Fail-Closed)
**Notes:** 위험한 중복 부작용을 막기 위한 명시적 수동 검토 유도.

---

## 비진행(No-progress) 감지 기준 및 전략 전환 정책

### Q1: 반복되는 동일 실패를 식별하기 위한 '실패 지문(Failure Fingerprint)'은 어떻게 정의할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) `criterionId` + 실패 유형(`cause`) + 정규화된 에러 요약 해시 `sha256(...)` | 타임스탬프나 임시 경로 변동을 정규화하여 실제 동일 원인의 실패를 정확히 식별 | ✓ |
| 실행 stdout/stderr 전체 내용의 sha256 해시 | 출력 내 사소한 시간/경로 차이만 있어도 해시가 달라져 동일 실패 탐지 실패 | |
| 실패한 필수 기준 ID(`criterionId`)만 단순 일치 비교 | 서로 다른 원인으로 동일 기준이 실패해도 무조건 같은 실패로 오인할 위험 | |

**User's choice:** (Recommended) `criterionId` + 실패 유형(`cause`) + 정규화된 에러 요약 해시 `sha256(...)`
**Notes:** 변동 요소를 제외한 정규화된 결정론적 지문.

### Q2: 몇 번 연속으로 동일한 실패 지문이 발생했을 때 '비진행(no-progress)'으로 판단하고 전략을 변경할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 2회 연속 동일 지문 실패 시 즉시 전략 변경 트리거 | 1차 수정 실패 후 동일 증상이 반복되면 단순 시도 낭비를 막고 즉시 대안 전략 적용 | ✓ |
| 3회 연속 동일 지문 실패 시 트리거 | 조금 더 여유를 두고 기본 수정 기회를 주지만 동일 에러에 대한 토큰/시간 소모 증가 | |
| 1회 실패 시마다 즉시 전략 변경 | 사소한 일시적 결함이나 미세 수정 기회에도 과민하게 전략을 교체할 위험 | |

**User's choice:** (Recommended) 2회 연속 동일 지문 실패 시 즉시 전략 변경 트리거
**Notes:** 토큰 낭비 방지 및 빠른 대안 탐색을 위한 2회 연속 기준.

### Q3: 동일 실패 지문이 2회 반복되었을 때 수퍼바이저가 적용할 대안 전략 순서는 어떻게 구성할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 1단계: 검측/리뷰어의 정밀 진단 및 최소 재현 코드(reproducer) 주입 -> 2단계: 실패한 기준 1개에 집중하도록 작업 범위 좁힘 -> 소진 시: `blocked` 전환 | 구조적이고 점진적인 대안 탐색 | ✓ |
| 1단계 진단 정보 주입만 1회 시도 후 즉시 `blocked` 종료 | 단순하지만 작업 범위를 좁혀 해결할 기회를 놓침 | |
| 실패 시마다 프롬프트 힌트 없이 다른 하네스/모델로만 변경 시도 | Phase 15 범위는 단일 하네스 내 수퍼바이저 전략이며 5개 하네스 합성은 Phase 16 영역임 | |

**User's choice:** (Recommended) 1단계 진단/재현코드 주입 -> 2단계 단일 기준 집중 -> 소진 시 `blocked`
**Notes:** 점진적이고 구조적인 2단계 대안 전략 및 소진 시 차단.

### Q4: 모든 대안 전략이 소진되어 `blocked`로 종료될 때 사용자에게 어떤 결과와 다음 단계를 제공할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 구조화된 Blocked 리포트 제공: 반복된 실패 지문, 시도된 전략 내역, 실패 기준의 최소 재현 증거, 명확한 다음 조치 제시 | 사용자가 바로 이어서 개입 가능 | ✓ |
| 단순 콘솔 에러 한 줄 출력 및 프로세스 비정상 종료 | 구체적으로 왜 멈췄고 무엇을 시도했는지 파악하기 어려움 | |
| 시도 중 변경된 모든 파일을 강제 롤백하고 작업 상태를 완전 초기화 | 사용자에게 유용한 디버깅 흔적이나 부분 작업까지 모두 유실 | |

**User's choice:** (Recommended) 구조화된 Blocked 리포트 제공 및 명확한 다음 조치 안내
**Notes:** 상태와 시도 내역을 보존하고 즉시 재개할 수 있는 액셔너블 정보 제공.

---

## 자원 제한(Limits) 및 미계측 텔레메트리 처리

### Q1: 사용자가 자원 제한을 '무제한(unlimited)'으로 지정했을 때 개별 시도의 안전 경계는 어떻게 다룰까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 전체 시도/시간은 무제한을 허용하되, 개별 시도 프로세스에는 단일 실행 타임아웃(15분)과 스트림 버퍼 상한(10MB) 및 프로세스 트리 정리를 필수 안전망으로 강제 적용 | 시스템 정체 및 좀비 프로세스 방지 | ✓ |
| 개별 프로세스 타임아웃까지 모두 제거하여 에이전트가 영구 응답하지 않아도 무한 대기 | 하네스 행 발생 시 무한 교착 상태 위험 | |
| 무제한 옵션을 아예 금지하고 모든 실행에 기본 사이클을 강제 부여 | 요구사항 RUN-04의 'unlimited cycles' 선택 권한 침해 | |

**User's choice:** (Recommended) 전체 무제한 허용하되 개별 시도 15분 타임아웃/10MB 버퍼/트리 정리 강제
**Notes:** 무제한 의도를 만족하면서도 프로세스 행 방지 안전망 유지.

### Q2: 계약에 '비용 한도(maxCostUsd)'가 명시되었으나 하네스가 비용/토큰 텔레메트리를 제공하지 못할 경우 어떻게 처리할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 시작(Start/Preview) 시점에 즉시 Fail-Closed 차단: 신뢰할 수 있는 비용 계측기가 없음을 명시하고 실행 거부 | 비용 폭탄 사고 원천 차단 | ✓ |
| 비용 텔레메트리가 없으면 0달러로 간주하고 경고만 로그에 남긴 채 계속 진행 | 설계 원칙 위배 및 예기치 않은 요금 청구 위험 | |
| 비용 제한을 자동으로 시간/사이클 제한으로 환산/대체하여 실행 | 사용자가 승인한 계약 조건을 수퍼바이저가 임의 변조 | |

**User's choice:** (Recommended) 시작 시점에 즉시 Fail-Closed 차단
**Notes:** 알 수 없는 비용 발생을 원천 차단하는 fail-closed 보안/재정 원칙.

### Q3: 자원 한계에 도달하여 수퍼바이저가 중단될 때 정지 사유와 텔레메트리 보고는 어떻게 구성할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 정밀한 표준 정지 코드(`cycle_limit_exceeded`, `wall_time_exceeded`, `cost_limit_exceeded`, `no_progress_exhausted`, `quota_exhausted`)와 누적 사용량 내역 및 재개 방법 출력 | 명확한 원인 파악 및 후속 조치 지원 | ✓ |
| 단순히 "resource limit exceeded" 단일 메시지만 제공 | 어떤 자원이 고갈되어 중단되었는지 식별 불가 | |
| 프로세스 비정상 종료 코드만으로 상태 표현 | 기계적이고 사용자 친화적이지 않음 | |

**User's choice:** (Recommended) 정밀 표준 정지 코드, 누적 사용량 및 재개 방법 출력
**Notes:** 정지 원인을 코드화하고 재개 안내 제공.

### Q4: 타임아웃 또는 사용자 취소 시 에이전트 및 하위 자식 프로세스의 정리는 어떻게 보장할까요?

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Windows(`taskkill /F /T /PID`) 및 Unix/macOS(프로세스 그룹 `kill -SIGTERM` -> 유예 후 `SIGKILL`) 크로스 플랫폼 프로세스 트리 완전 정리 및 취소 시점까지의 버퍼/증거 보존 | 좀비 프로세스 누수 방지 | ✓ |
| Node.js 기본 `child.kill()`만 호출 | Windows 및 하위 프로세스를 띄우는 CLI에서 고아 프로세스 잔존 | |
| 타임아웃 시 프로세스를 죽이지 않고 대기하며 프로세스 분리 처리 | 시스템 리소스 고갈 및 충돌 위험 | |

**User's choice:** (Recommended) Windows taskkill 및 Unix 프로세스 그룹 kill 기반 트리 완전 정리
**Notes:** 3대 OS 전체에서 고아 자식 프로세스를 남기지 않는 완전한 프로세스 트리 종료 구현.

---

## the agent's Discretion

- 저널/체크포인트 디렉터리 생성 및 파일 쓰기 원자성을 위한 임시 파일 확장자(`.tmp`)와 교체(rename) 세부 구현 방식.
- 단일 프로세스 타임아웃(15분) 및 출력 버퍼 상한(10MB)의 세부 설정 가능 여부 및 CLI 플래그 노출 수준.
- 정규화된 에러 요약 추출 시 공백/스택트레이스 경로 정규화 정규식 상세 패턴.

## Deferred Ideas

None — discussion stayed within Phase 15 scope.
