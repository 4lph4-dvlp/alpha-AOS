# Phase 17: GSD Lifecycle Bridge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-02
**Phase:** 17-gsd-lifecycle-bridge
**Areas discussed:** GSD 대화형 프롬프트 자동 응답 및 일시정지 정책 (Prompt & Pause Policy), 검증 갭 라우팅 및 복구 메커니즘 (Gap-Plan vs New-Phase Routing), 다중 Phase 연속 진행 및 상태 관측 (Multi-Phase Progression & Boundary Discovery), 필수 게이트 및 라이프사이클 훅 실측 증명 (Mandatory Gates & Hook Execution Receipts)

---

## GSD 대화형 프롬프트 자동 응답 및 일시정지 정책 (Prompt & Pause Policy)

### Q1: 자율 실행 중 발생하는 GSD 대화형 질문 자동 응답 방식

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 계약 범위 내 질문 권장 기본값 자동 응답 및 `gsd-default` 저널 기록 | 위임된 구현 재량 내에서는 중단 없이 진행하며 감사 추적성 보장 | ✓ |
| 엄격 모드: 질문 발생 시 항상 일시정지 및 사용자 터미널 입력 대기 | 사용자의 100% 직접 개입 보장 | |
| 유형별 화이트리스트: 파일 구조/테스트/문서화 질문만 자동 응답 | 위험도 기반 절충 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 계약 범위 내 질문은 권장 기본값(Recommended Default)으로 자동 응답하고 `gsd-default` 저널에 기록 — 위임된 구현 재량 내에서는 중단 없이 진행하며 감사 추적성 보장  
**Notes:** 계약에 위배되지 않는 일상적 질문은 멈춤 없이 권장 기본값으로 응답하고 감사 로그를 남기기로 결정.

### Q2: 자동 응답 중단 및 일시정지(`needs-input`) 감지 기준

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 계약 경계 초과/새 권한 요구/기본값 부재 시 즉시 일시정지 | 안전 우선(Fail-Safe) 불변식 준수 | ✓ |
| 위험 키워드 매칭 (권한, 비밀, 삭제 등) | 패턴 기반 감지 | |
| GSD 도구 메타데이터에 "확인 필요" 플래그 존재 시만 일시정지 | GSD 자체 메타데이터에 의존 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 계약 경계(허용 루트/허용 효과/비용/필수 기준)를 초과하거나 새 권한을 요구하는 질문, 또는 권장 기본값이 없는 모호한 질문 시 즉시 일시정지(`needs-input`) 및 안내 — 안전 우선(Fail-Safe) 불변식 준수  
**Notes:** 승인되지 않은 권한 확장이나 모호한 선택을 방지하기 위해 엄격한 Fail-Safe 적용.

### Q3: `needs-input` 상태 알림 및 사용자 재개 인터페이스

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 대화형 프롬프트와 함께 CLI 종료/대기 전환 및 CLI 응답·재개 지원 | `alpha-aos task answer` 또는 `task resume` 명령으로 비동기 재개 | ✓ |
| 블로킹 표준입력(stdin) 대기 | 콘솔 직접 입력 대기 (세션 유지 필요) | |
| 자동 타임아웃 적용 및 프로세스 안전 종료 | 일정 시간 후 저널 체크포인트 남기고 안전 종료 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 대화형 프롬프트와 함께 CLI 종료/대기 전환: 질문 상세와 사유를 명시하고 `alpha-aos task answer <answer>` 또는 `task resume` 명령으로 언제든 비동기 응답·재개 가능하도록 지원 — 터미널 분리 및 장기 세션 지원  
**Notes:** 장기 실행 세션 및 터미널 분리를 완벽히 지원하는 비동기 대기 구조 채택.

### Q4: GSD 라이프사이클 단계별 호출 모드 및 플래그

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 각 단계별 의도에 맞게 `--auto` 명시 주입 및 단계 간 체크포인트 검증 | 독립 프로세스로 호출하여 상태 전이 엄격 감시 | ✓ |
| 전체 체인 호출: 첫 진입 시 `--auto --chain` 일괄 실행 | GSD 내부 체인에 일임 | |
| GSD 도구 직접 호출(RPC/CLI subcommands) 방식 | 세밀한 에러 처리 가능 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 각 단계별 의도에 맞게 `--auto`를 명시적으로 주입하고 단계별 실행 결과를 단계 간 체크포인트로 검증 — discuss/plan/execute 각 단계를 독립 프로세스로 호출하여 상태 전이 엄격 감시  
**Notes:** 단계별 경계 검증 및 관측 무결성을 위해 독립 프로세스 기반 오케스트레이션 선택.

---

## 검증 갭 라우팅 및 복구 메커니즘 (Gap-Plan vs New-Phase Routing)

### Q1: 갭 플랜(Gap Plan) vs 새 Phase 라우팅 분기 기준

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 범위 및 아키텍처 영향도 기반 분기 | Phase 목표 내 수정은 갭 플랜, Phase 경계 초과는 새 Phase | ✓ |
| 플랜 규모 기반 (1~2개 플랜은 갭 플랜, 3개 이상은 새 Phase) | 작업량 기반 분류 | |
| 항상 갭 플랜 생성 (새 Phase 자동 생성 금지) | 단순하지만 Phase 비대화 위험 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 범위 및 아키텍처 영향도 기반: 현재 Phase 목표 및 계약 기준 내의 결함 수정은 현재 Phase의 갭 플랜(`*-GAP-*.md`)으로 처리하고, 새로운 기능/인터페이스 변경 등 Phase 경계를 넘는 갭은 ROADMAP.md에 새 Phase로 라우팅 — 도메인 무결성 보장  
**Notes:** 도메인 및 로드맵 무결성을 지키기 위해 결함의 영향 범위를 기준으로 분기.

### Q2: 갭 플랜 및 새 Phase 생성 시 GSD 워크플로 연동

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) GSD 네이티브 도구 연동 (`gsd-plan-phase` gap 모드 등) | GSD를 유일한 상태 권위자로 유지(GSD-03) | ✓ |
| 수퍼바이저 자체 템플릿 생성 및 executor 위임 | 속도는 빠르나 GSD 라이프사이클 추적 불완전 | |
| 실패 플랜 인라인 덮어쓰기 | 히스토리 추적 불가 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) GSD 네이티브 도구 연동: 갭 플랜은 GSD의 갭 플래닝 워크플로(`gsd-plan-phase` gap 모드)로 생성하고, 새 Phase는 GSD 로드맵 추가 워크플로를 거치도록 호출 — GSD를 유일한 상태 권위자로 유지(GSD-03)  
**Notes:** 상태 머신 변조를 방지하기 위해 GSD 네이티브 워크플로에 전적으로 위임.

### Q3: 갭 플랜 완료 후 재검증(Re-verification) 절차

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 전체 재검증 및 동일 리비전 독립 리뷰 | 실패 기준 + 전체 계약 기준 재검증 및 리뷰어 영수증 확인 | ✓ |
| 증분 검증(Delta Verification): 수정된 기준만 신속 평가 | 빠른 피드백이지만 회귀 결함 탐지 한계 | |
| 실행자 자체 보고 수용 (exit 0 시 verify 생략) | 안전 게이트 무력화 위험 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 전체 재검증 및 독립 리뷰: 갭 플랜 실행 완료 후 GSD verify를 다시 수행하여 실패한 기준뿐 아니라 전체 계약 기준(회귀 방지)을 재검증하고, 독립 리뷰어 세션을 거친 동일 리비전 영수증을 확인 후 진행 — 완전한 품질 보증  
**Notes:** 회귀 방지와 엄격한 품질 보증을 위해 전체 기준 재검증을 필수로 지정.

### Q4: 갭 수정 반복 실패 시 비진행(No-progress) 한도 처리

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) Phase 15 비진행 핑거프린트 정책 통합 | 동일 실패 2회 연속 시 3단계 대안 전략 및 소진 시 `blocked` | ✓ |
| 단순 횟수 상한선 (Phase당 최대 2~3회) | 단순 명료한 카운터 기준 | |
| 계약 자원 한도(Cost/Time/Cycles)에만 의존 | 유연하지만 루프 감지 지연 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) Phase 15 비진행 핑거프린트 정책 통합: 갭 플랜 수정 중에도 동일 실패 핑거프린트 2회 연속 시 3단계 대안 전략 적용 및 대안 소진 시 즉시 `blocked` 안전 정지 — 무한 수정 루프 및 자원 낭비 원천 차단  
**Notes:** 무한 루프를 방지하고 체계적인 실패 격리를 위해 Phase 15 핑거프린트 엔진 재사용.

---

## 다중 Phase 연속 진행 및 상태 관측 (Multi-Phase Progression & Boundary Discovery)

### Q1: 다중 Phase 연속 진행 판단 및 오케스트레이션

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) GSD STATE 및 ROADMAP 관측 기반 자연스러운 전이 | GSD를 단일 진실 공급원(SSOT)으로 유지(GSD-03) | ✓ |
| 수퍼바이저 내부 Phase 큐 관리 | 자체 상태 의존도 높음 | |
| 단일 Phase 강제 분리 (Phase마다 계약 재시작) | 2개 Phase 연속 실행 불가 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) GSD STATE 및 ROADMAP 관측 기반 전이: GSD의 `.planning/STATE.md` 및 `ROADMAP.md`의 Phase 완료 상태를 읽어 관측하고, 계약 목표 범위 내에 후속 Phase가 있으면 GSD의 다음 Phase discuss/plan으로 자연스럽게 오케스트레이션 — GSD를 단일 진실 공급원으로 유지(GSD-03)  
**Notes:** 수퍼바이저 소유의 상태 머신 없이 GSD 산출물 관측만으로 다중 Phase 전이 구현.

### Q2: 비정상 중단 후 재개 시 GSD 기록 경계 탐지

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) GSD 파일 및 Git 커밋 삼중 대조 경계 복원 | `*-SUMMARY.md`, `STATE.md`, `docs(<phase>-<plan>):` 커밋 대조 | ✓ |
| alpha-AOS 저널 체크포인트 단독 신뢰 | 외부 파일 수정 시 불일치 위험 | |
| 단계 단위 전체 롤백 및 재시작 | 이전 작업 손실 및 중복 비용 발생 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) GSD 파일 및 Git 커밋 대조 경계 복원: Phase 내 완료된 `*-SUMMARY.md`, `STATE.md` 진행 상태, `docs(<phase>-<plan>):` 커밋을 삼중 대조하여 완료된 플랜은 재실행 없이 스킵하고 미완료 플랜부터 정확히 재개(성공 기준 4) — 멱등성 및 무결성 보장  
**Notes:** 완료된 플랜의 중복 실행을 철저히 방지하고 멱등한 재개 지원.

### Q3: 재개 시 미완료 플랜 범위 불변성 보존

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 컨텍스트 및 플랜 불변성 고정 보존 | `*-CONTEXT.md`와 `*-PLAN.md` 고정하여 임의 범위 변조 차단 | ✓ |
| 미완료 플랜 재플래닝 허용 | 범위 변경 가능성 존재 | |
| 범위 변경 감지 시 즉시 일시정지 | 극도의 보수적 접근 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 컨텍스트 및 플랜 불변성 보존: 기존 생성된 `*-CONTEXT.md`와 `*-PLAN.md`의 결정을 변경 불가능한 기준으로 고정하고, 미완료 플랜 재개 시 새 범위 결정을 임의로 내리지 않고 기존 플랜을 정직하게 수행 — 암묵적 범위 변조 차단  
**Notes:** 재개 과정에서 암묵적으로 새로운 범위 결정이 내려지는 것을 원천 봉쇄.

### Q4: GSD 프로젝트 상태와 alpha-AOS 저널 소유권 분리 (GSD-03)

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 엄격한 소유권 분리 및 단방향 관측 | `.planning/`은 GSD만, 실행 시도/한도/복구는 `~/.alpha-aos/`에만 기록 | ✓ |
| 동기화 마커 삽입 (`STATE.md`에 주석 링크 추가) | GSD 파일 변조 발생 | |
| GSD 상태 머신 미러링 (저널 내 전체 Phase 트리 복제) | 중복 상태 유지 부담 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 엄격한 소유권 분리 및 단방향 관측: `.planning/`과 프로젝트 Git 커밋은 GSD만 작성하고 alpha-AOS는 순수 읽기 관측만 수행; 실행 시도/역할/자원 한도/중단 복구는 오직 `~/.alpha-aos/` 저널에만 분리 기록 — GSD-03 완전 준수  
**Notes:** 아키텍처 불변식에 따라 프로젝트 파일과 수퍼바이저 상태 저장소를 철저히 격리.

---

## 필수 게이트 및 라이프사이클 훅 실측 증명 (Mandatory Gates & Hook Execution Receipts)

### Q1: GSD 라이프사이클 훅 실제 호출 증명

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 실측 훅 실행 영수증(`HookExecutionReceipt`) 발행 | 실제 호출 후 exitCode, sha256, revision 영수증 기록, 실패 시 Fail-Closed | ✓ |
| 콘솔 출력 텍스트 정규식 검사 | 실행 위조 및 출력 변조 취약 | |
| 설정 파일 선언 정적 검사 | GSD-04 명시적 금지 방식 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 실측 훅 실행 영수증(Hook Execution Receipt) 발행: 훅 실행 스펙을 실제 호출하고 실행 결과(명령어, git revision, sha256, exitCode, 텔레메트리)를 개별 영수증 JSON으로 기록하여 검증 — 미실행/실패 시 즉시 Fail-Closed 차단(GSD-04)  
**Notes:** 스킬 파일 존재나 exit 0 위조를 차단하고 실제 실행 증거를 강제.

### Q2: 독립 리뷰어 목격 증거(Review Witness) 리비전 바인딩

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 동일 리비전 SHA 엄격 대조 | 최종 아티팩트 SHA와 `targetRevisionSha` 100% 일치 강제 | ✓ |
| 시간순 선후 관계만 검증 | 사후 산출물 변조 감지 불가 | |
| 경미한 변경(README 등) 사후 예외 허용 | 보안 불변식 약화 위험 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 동일 리비전 SHA 엄격 대조: 최종 아티팩트/커밋 SHA와 리뷰어가 평가한 `targetRevisionSha`가 100% 일치할 때만 수락하며, 이후 단 1바이트라도 변경되거나 리뷰어 영수증 누락 시 즉시 거부(`STALE_REVIEW_REFUSED`) — 성공 기준 3 완전 충족  
**Notes:** 리뷰어 평가 이후의 사후 변조나 오래된 리뷰를 통한 거짓 수락 방지.

### Q3: 합성 GSD 픽스처(Synthetic GSD Fixture) 실패 주입 시나리오

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 4대 적대적 실패 주입 픽스처 스위트 | (1) 훅 실패, (2) 산출물 누락, (3) 중단 재개 보존, (4) stale 리뷰 거부 | ✓ |
| 정상 경로 중심 스모크 테스트 | 실패 경로 결합 검증 취약 | |
| 라이브 하네스 결함 주입 | 비결정론적이고 비용 과다 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 4대 적대적 실패 주입 픽스처 스위트: (1) 훅 실패 시 차단, (2) 필수 산출물 결손 시 거부, (3) 중간 중단 후 재개 시 완료 플랜 보존 및 미완료 재개, (4) 오래된/위조된 리뷰 영수증 거부를 전용 픽스처로 전수 검증 — 결정론적 안전 보증  
**Notes:** CI 회귀 테스트를 위한 완전한 결정론적 픽스처 스위트 구축 합의.

### Q4: CLI 진단 도구 라이프사이클 및 게이트 가시화

| Option | Description | Selected |
|--------|-------------|:--------:|
| (추천) 라이프사이클 및 게이트 상태 통합 진단 표 | 단계, 훅 영수증, 갭 이력, 리뷰 일치 여부 표 및 JSON 양방향 제공 | ✓ |
| 경량 진행 상태 요약 (Phase/퍼센트 1줄) | 화면 점유 최소화 | |
| 오류 발생 시에만 게이트 상세 덤프 | 로그 간결화 | |
| 직접 결정해 주세요 (You decide) | 시스템 기본 안전 설계에 위임 | |

**User's choice:** (추천) 라이프사이클 및 게이트 상태 통합 진단 표: 현재 Phase/Plan 단계, 훅 실행 영수증 상태(호출/성공 여부), 갭 라우팅 이력, 리뷰 목격 리비전 일치 여부를 CLI 진단 화면에 직관적인 표와 JSON 양방향으로 제공 — 투명한 감사 가능성 제공  
**Notes:** 운영 투명성과 감사 추적성을 위한 포괄적 진단 출력 지원.

---

## the agent's Discretion

- `~/.alpha-aos/receipts/hooks/` 디렉터리 내 훅 영수증 JSON 파일의 세부 저장 경로 및 필드 규격.
- `needs-input` 상태 전환 시 CLI 콘솔에 표시할 ANSI 색상, 구분선 및 안내 문구 포맷팅.
- 합성 GSD 픽스처 테스트를 위한 임시 디렉터리 및 Git 저장소 자동 생성/정리 헬퍼 구현 세부사항.

## Deferred Ideas

None — 모든 논의는 Phase 17 범위 내에서 충실히 완료되었습니다.
