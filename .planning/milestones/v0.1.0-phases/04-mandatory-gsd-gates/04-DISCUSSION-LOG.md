# Phase 4: Mandatory GSD Gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-17
**Phase:** 04-mandatory-gsd-gates
**Areas discussed:** 위험 변경 탐지 방식 (GATE-01, GATE-04), 단일 검증 엔진 선택 및 중복 억제 (GATE-02), GSD 수명주기 훅 결합 및 차단 (GATE-03), Worker 하네스 통제 및 .planning 보호 (GATE-05)

---

## 위험 변경 탐지 방식 (GATE-01, GATE-04)

### 질문 1: 위험 변경(diff) 측정 기준 범위
| Option | Description | Selected |
|--------|-------------|----------|
| Phase 시작 기준점 및 작업 트리 전체 누적 diff 기준 | 현재 Phase에서 변경된 모든 커밋과 미커밋 작업 트리를 베이스 브랜치(또는 Phase 시작 커밋)와 비교하여 검사 | ✓ |
| 최근 커밋 및 현재 미커밋 작업 트리만 검사 | 직전 커밋 대비 변경분만 즉각 평가 | |
| 에이전트가 상황에 맞게 결정 | You decide | |

**User's choice:** Phase 시작 기준점 및 작업 트리 전체 누적 diff 기준
**Notes:** Phase 진행 중 언제라도 발생한 위험 변경이 이후 커밋에 의해 가려지지 않도록 전체 누적 diff를 안전하게 검사.

### 질문 2: 위험 탐지 메커니즘
| Option | Description | Selected |
|--------|-------------|----------|
| 경로 패턴(Path Glob) 중심 + 안전한 식별자 매칭 | 파일 경로(**/auth/**, **/migrations/**, package.json version 등)를 우선으로 하고, 임의의 시크릿 스캔은 엄격히 배제하여 credential 누출 방지 | ✓ |
| 파일 경로 패턴만 엄격하게 적용 | 파일 본문은 전혀 읽지 않고 변경된 파일 경로(Glob)만으로 100% 결정론적 판별 | |
| 정규식 기반 파일 내용 변경 스캔 포함 | 위험 키워드 diff 검사 포함 (단, credential 스캔 제외) | |

**User's choice:** 경로 패턴(Path Glob) 중심 + 안전한 식별자 매칭
**Notes:** `AGENTS.md`의 비밀 유지 제약을 100% 준수하면서도 결정론적 위험 식별 보장.

### 질문 3: 저위험(Low-Risk) 작업 처리 방식
| Option | Description | Selected |
|--------|-------------|----------|
| 자동 면제 (Zero-Obligation Silent Pass) | 변경된 파일 중 위험 사실이 매칭되지 않으면 게이트 평가 결과가 빈 목록이 되어 추가 점검 없이 즉시 통과 | ✓ |
| 요약 리포트 표시 후 통과 | 저위험 작업이라도 "Low Risk - No Gates Required" 1줄 요약 출력 후 통과 | |
| 에이전트가 상황에 맞게 결정 | You decide | |

**User's choice:** 자동 면제 (Zero-Obligation Silent Pass)
**Notes:** 일반적인 버그픽스/문서/UI 작업 시 불필요한 게이트 부담 없이 원활한 진행 보장 (GATE-04).

---

## 단일 검증 엔진 선택 및 중복 억제 (GATE-02)

### 질문 1: 엔진 우선순위
| Option | Description | Selected |
|--------|-------------|----------|
| 프로젝트 네이티브 우선 (Native-First) | 프로젝트에 정의된 검증 스크립트/도구(npm test, prisma, linter 등)가 있으면 최우선 실행하고, 부재 시에만 검증된 ECC 스킬로 폴백 | ✓ |
| ECC 표준 스킬 우선 (ECC-First) | 항상 alpha-AOS가 보증하는 ECC 스킬을 우선 단일 실행 | |
| 매니페스트 명시적 지정 방식 | .alpha-aos/stack.yaml에 게이트별 엔진을 명시하도록 강제 | |

**User's choice:** 프로젝트 네이티브 우선 (Native-First)
**Notes:** 프로젝트 고유의 툴링을 존중하고, 미보유 프로젝트에서만 ECC 스킬이 안전망으로 작동.

### 질문 2: 중복 억제 표기
| Option | Description | Selected |
|--------|-------------|----------|
| 실행 리포트에 억제 사유 명시 | 선택된 엔진과 함께 억제된 엔진 목록 및 사유를 투명하게 표기 | ✓ |
| 선택된 엔진만 단일 출력 | 중복 억제 내역은 상세 로그(--verbose)나 JSON에서만 확인 가능하게 처리 | |
| 에이전트가 상황에 맞게 결정 | You decide | |

**User's choice:** 실행 리포트에 억제 사유 명시
**Notes:** 중복 검증이 생략된 이유를 투명하게 제공하여 개발자의 혼선 방지.

### 질문 3: 엔진 결과 표준화
| Option | Description | Selected |
|--------|-------------|----------|
| 정규화된 구조화 게이트 증적 (Structured Gate Receipt) | 엔진 종류, 대상 커밋 SHA, 판정 상태(passed/failed), 억제 내역, 증적 해시를 포함하는 엄격한 JSON 스키마로 보관 | ✓ |
| 단순 프로세스 종료 코드 및 로그만 보관 | 통과 시 0, 실패 시 비정상 종료만 확인 | |
| 에이전트가 상황에 맞게 결정 | You decide | |

**User's choice:** 정규화된 구조화 게이트 증적 (Structured Gate Receipt)
**Notes:** 사후 감사 및 수명주기 전진 검증의 근거가 되는 불변 증적 확보.

---

## GSD 수명주기 훅 결합 및 차단 (GATE-03)

### 질문 1: 게이트 강제 지점
| Option | Description | Selected |
|--------|-------------|----------|
| 실행 완료 후 및 검증 진입 직전 (execute:post 및 verify:pre) | 플랜 실행이 완료되는 시점에 게이트를 평가하고, 필수 게이트가 통과되지 않으면 UAT/검증 단계로의 전진을 차단 | ✓ |
| 각 웨이브 완료 직후 (execute:wave:post) | 작업 웨이브가 끝날 때마다 즉각 게이트 평가 | |
| 최종 Phase 완료 승인 직전 (verify:post) | 최종 마감 단계에서만 단일 차단 | |

**User's choice:** 실행 완료 후 및 검증 진입 직전 (execute:post 및 verify:pre)
**Notes:** 검증 단계 진입 전 확실한 안전 게이트 강제.

### 질문 2: 게이트 차단 시 피드백
| Option | Description | Selected |
|--------|-------------|----------|
| 정밀한 차단 사유 + 실행 가능한 해결 가이드 제공 | 어떤 변경으로 어떤 게이트가 차단되었는지(missing/failed/stale), 실패 원인 상세 및 재검증 실행 명령어(CLI)를 명확히 제시 | ✓ |
| 단순 차단 에러만 출력 | 실패 상태 코드와 차단 메시지만 표시 | |
| 에이전트가 상황에 맞게 결정 | You decide | |

**User's choice:** 정밀한 차단 사유 + 실행 가능한 해결 가이드 제공
**Notes:** 개발자가 즉시 조치하고 차단을 해제할 수 있도록 실행 가능한 명령어 제공.

### 질문 3: 증적 최신성 검증
| Option | Description | Selected |
|--------|-------------|----------|
| Git HEAD SHA + 작업 트리 해시 엄격 바인딩 | 통과 증적에 기록된 Git SHA 및 작업 트리 해시와 현재 상태가 불일치하면 즉시 'stale'로 분류하여 게이트 재검증 강제 | ✓ |
| Git HEAD 커밋 SHA만 바인딩 | 커밋이 변경된 경우에만 'stale' 처리 | |
| 에이전트가 상황에 맞게 결정 | You decide | |

**User's choice:** Git HEAD SHA + 작업 트리 해시 엄격 바인딩
**Notes:** 통과 후 추가 수정으로 인한 보안 회피를 원천 차단.

---

## Worker 하네스 통제 및 .planning 보호 (GATE-05)

### 질문 1: Controller/Worker 식별
| Option | Description | Selected |
|--------|-------------|----------|
| 세션 개시자 단일 Controller + 위임 하네스 자동 Worker 지정 | GSD 워크플로우를 주도하는 활성 하네스가 Controller가 되고, 외부 위임(Hermes 등)으로 실행되는 하네스는 무조건 Worker로 실행 | ✓ |
| 하네스 타입별 역할 정적 제한 | Hermes/Pi 등은 항상 Worker로만 참여 가능하도록 정책 고정 | |
| 환경 변수 및 명시적 플래그 기반 제어 | ALPHA_AOS_GSD_ROLE=controller\|worker | |

**User's choice:** 세션 개시자 단일 Controller + 위임 하네스 자동 Worker 지정
**Notes:** 단일 수명주기 책임성을 보장하면서 Hermes의 GSD 상태 작성을 원천 배제.

### 질문 2: .planning 보호 메커니즘
| Option | Description | Selected |
|--------|-------------|----------|
| 다중 계층 방어 (지침 격리 + 런타임 환경 통제 + 게이트 트리 해시 Witness 검증) | Worker에게 GSD 지침 비노출, 런타임 시 .planning 보호, 그리고 핸드오프 전후 .planning/의 재귀 SHA-256 해시 일치 검증을 통해 변조 시 즉각 거부 | ✓ |
| 런타임 후 해시 검증만 적용 | Worker 실행 완료 후 .planning/ 변경이 발견되면 즉시 거부 및 롤백 | |
| 에이전트가 상황에 맞게 결정 | You decide | |

**User's choice:** 다중 계층 방어 (지침 격리 + 런타임 환경 통제 + 게이트 트리 해시 Witness 검증)
**Notes:** Phase 3의 Plan 03-21에서 검증된 `comparePlanningTrees` SHA-256 증적 체계를 계승 및 발전.

---

## the agent's Discretion
- 독립 실행형 게이트 검사 CLI 플래그 및 인터페이스 세부 구현.
- 게이트 영수증(Gate Receipt) JSON 세부 스키마 설계.
- 위험 경로와 매핑되는 기본 네이티브 검증 명령어 매핑 테이블.

## Deferred Ideas
None — discussion stayed within phase scope.
