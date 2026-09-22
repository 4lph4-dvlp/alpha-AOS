# Phase 6: Managed Lifecycle, Uninstall, and Recovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 6-Managed Lifecycle, Uninstall, and Recovery
**Areas discussed:** 제거 및 언인스톨 세분화, 롤백 사전 검증 및 드리프트 거부 정책, 손상/중단된 저널 진단 및 Repair 복구 전략, 외부 패키지 보상 가이드 및 Status/Doctor 분리

---

## 제거 및 언인스톨 세분화 (Uninstall & Removal Granularity)

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 통합 uninstall 명령 + 대상 플래그 | alpha-aos uninstall [--target <harness> \| --project <path> \| --all] | ✓ |
| 도메인별 분리 명령 체계 | alpha-aos target remove <harness>, alpha-aos project clean, alpha-aos uninstall --full | |
| You decide | 권장 통합 명령 체계로 위임 | |

**User's choice:** (Recommended) 통합 uninstall 명령 + 대상 플래그 (alpha-aos uninstall [--target <harness> | --project <path> | --all])
**Notes:** 단일 진입점에서 타깃별/프로젝트별/전체 스택 제거를 일관되게 제어하며, 기존 `project isolate clean`, `pack removal`과 연계.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) Dry-run 기본 + --apply 시 대화형 TTY 확인 프롬프트 | CI/스크립트용 --yes / -y 플래그 제공 | ✓ |
| Dry-run 기본 + --apply 시 추가 확인 없이 즉시 실행 | --apply 자체를 확인으로 간주 | |
| You decide | 권장 안전 확인 방식 위임 | |

**User's choice:** (Recommended) Dry-run 기본 + --apply 시 대화형 TTY 확인 프롬프트 (CI/스크립트용 --yes / -y 플래그 제공)
**Notes:** SAFE-01을 준수하여 실수로 인한 언인스톨 방지.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 정밀 시맨틱 역연산 | alpha-AOS 소유 블록/키만 파싱하여 제거, 사용자 커스텀 설정 및 인증 완전 보존 | ✓ |
| 스냅샷 전체 롤백 | 설치 전 백업 파일로 파일 단위 복원 - 중간에 추가된 사용자 설정 손실 가능 | |
| You decide | 시맨틱 역연산 방식으로 위임 | |

**User's choice:** (Recommended) 정밀 시맨틱 역연산 (alpha-AOS 소유 블록/키만 파싱하여 제거, 사용자 커스텀 설정 및 인증 완전 보존)
**Notes:** 사용자 설정 및 자격 증명 보존을 위해 파일 덮어쓰기가 아닌 AST/파서 기반 역연산 수행.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 기본: 관리 리소스 및 Shim 정리 + 저널 보존 | --purge 지정 시 ~/.alpha-aos 전체 완전 삭제 | ✓ |
| 즉시 완전 소거 | uninstall --all 시 ~/.alpha-aos 디렉토리 전체를 예외 없이 즉시 삭제 | |
| You decide | 저널 보존 기본 + --purge 지원 방식으로 위임 | |

**User's choice:** (Recommended) 기본: 관리 리소스 및 Shim 정리 + 저널 보존, --purge 지정 시 ~/.alpha-aos 전체 완전 삭제
**Notes:** 감사 및 디버깅을 위해 과거 저널을 기본 보존하되, 필요 시 완전 제거 플래그 제공.

---

## 롤백 사전 검증 및 드리프트 거부 정책 (Rollback Preflight & Drift Policy)

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) All-or-nothing 즉시 거부 | 단 하나의 파일이라도 변경 시 모든 롤백 쓰기 차단 및 드리프트 상세 보고 | ✓ |
| 부분 롤백 허용 | 변경되지 않은 파일만 롤백하고 드리프트 파일은 건너뛰기 (위험 경고 표시) | |
| You decide | All-or-nothing 원칙으로 위임 | |

**User's choice:** (Recommended) All-or-nothing 즉시 거부: 단 하나의 파일이라도 변경 시 모든 롤백 쓰기 차단 및 드리프트 상세 보고
**Notes:** 부분 롤백으로 인한 시스템 상태 파편화 방지.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 상세 Diff 및 해시 비교 | 파일 경로, 예상/실제 해시, 차이점(Unified Diff) 및 수동 해결 가이드 출력 | ✓ |
| 간략 상태 출력 | 변경된 파일 목록 및 해시 불일치 상태만 단순 출력 | |
| You decide | 상세 Diff 및 가이드 제공 방식으로 위임 | |

**User's choice:** (Recommended) 상세 Diff 및 해시 비교: 파일 경로, 예상/실제 해시, 차이점(Unified Diff) 및 수동 해결 가이드 출력
**Notes:** 사용자가 수동으로 변경 사항을 확인하고 화해(reconcile)할 수 있도록 상세 diff 출력.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) LIFO(최신 역순) 순차 롤백 | 가장 최근 완료된 트랜잭션(Head)부터 역순으로 롤백 강제하여 상태 일관성 유지 | ✓ |
| 트랜잭션 ID 지정 롤백 | 특정 트랜잭션을 지정하되, 후속 트랜잭션과 겹치는 파일이 있으면 드리프트로 거부 | |
| You decide | 권장 안전 롤백 순서 모델로 위임 | |

**User's choice:** (Recommended) LIFO(최신 역순) 순차 롤백: 가장 최근 완료된 트랜잭션(Head)부터 역순으로 롤백 강제하여 상태 일관성 유지
**Notes:** 트랜잭션 의존성 체인을 보존하기 위해 최신 헤드부터 순차 롤백.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 파일 삭제 + 트랜잭션 생성 빈 디렉토리 안전 정리 | 해당 트랜잭션으로 생성된 디렉토리가 비었을 때만 rmdir | ✓ |
| 파일만 삭제하고 디렉토리 보존 | 빈 폴더가 남아도 파일 삭제만 수행 | |
| You decide | 안전한 디렉토리 정리 방식 위임 | |

**User's choice:** (Recommended) 파일 삭제 + 트랜잭션 생성 빈 디렉토리 안전 정리 (해당 트랜잭션으로 생성된 디렉토리가 비었을 때만 rmdir)
**Notes:** 파일 삭제 후 빈 디렉토리만 역순 정리하여 깔끔한 원상 복구.

---

## 손상/중단된 저널 진단 및 Repair 복구 전략 (Corrupt Journal & Repair Flow)

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) needs-repair 상태 분류 | 트랜잭션 ID, 타깃 파일, 스냅샷 상태 및 alpha-aos repair 실행 가이드 제공 | ✓ |
| 단순 failed 처리 | 실패로만 마킹하고 후속 작업 진행 시 경고만 출력 | |
| You decide | needs-repair 분류 및 진단 상세 방식 위임 | |

**User's choice:** (Recommended) needs-repair 상태 분류: 트랜잭션 ID, 타깃 파일, 스냅샷 상태 및 alpha-aos repair 실행 가이드 제공
**Notes:** 미완료 작업을 명시적 복구 대기 상태로 격리.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 스냅샷 기반 안전 롤백 | 충돌 전 스냅샷으로 온전 복원 후 저널을 repaired로 마킹, 원래 명령 재실행 권고 | ✓ |
| 남은 작업 재개(Resume) | 중단된 지점부터 파일 쓰기를 이어 나가 트랜잭션 완료 시도 | |
| You decide | 스냅샷 기반 안전 롤백 방식 위임 | |

**User's choice:** (Recommended) 스냅샷 기반 안전 롤백: 충돌 전 스냅샷으로 온전 복원 후 저널을 repaired로 마킹, 원래 명령 재실행 권고
**Notes:** 검증되지 않은 환경에서 작업을 밀어붙이지 않고 안전했던 직전 상태로 복구.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 검역 격리(.corrupt) 및 수동 점검 리포트 | 손상 저널 격리 보관 후 무결성 점검 및 수동 조치 가이드 제시 | ✓ |
| 손상 저널 즉시 삭제 | 별도 격리 없이 삭제하여 잠금 해제 | |
| You decide | 검역 격리 및 수동 점검 가이드 위임 | |

**User's choice:** (Recommended) 검역 격리(.corrupt) 및 수동 점검 리포트: 손상 저널 격리 보관 후 무결성 점검 및 수동 조치 가이드 제시
**Notes:** 손상 저널을 보존하여 원인 조사를 가능하게 하고 락을 해제.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 프로세스 생존 검증(ESRCH) 및 저널 복구 연동 원자적 락 해제 | 죽은 프로세스 락 안전 정리 | ✓ |
| 사용자 확인 프롬프트 기반 락 강제 삭제 | 대화형 확인 후 즉시 rm | |
| You decide | 프로세스 생존 검증 연동 방식으로 위임 | |

**User's choice:** (Recommended) 프로세스 생존 검증(ESRCH) 및 저널 복구 연동 원자적 락 해제
**Notes:** 프로세스가 실제로 종료된 경우에만 저널 repair와 연동하여 락 해제.

---

## 외부 패키지 보상 가이드 및 Status/Doctor 분리 (External Package Compensation & Status/Doctor Split)

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 복구 영수증 및 컴포넌트별 복구 명령어 안내 | 허위 롤백 주장 금지, npm unlink / 이전 버전 재설치 등 구체적 명령 출력 | ✓ |
| 자동 백그라운드 패키지 역명령 실행 시도 | npm uninstall/link 역실행 | |
| You decide | 복구 영수증 및 구체적 안내 제공 방식으로 위임 | |

**User's choice:** (Recommended) 복구 영수증 및 컴포넌트별 복구 명령어 안내 (허위 롤백 주장 금지, npm unlink / 이전 버전 재설치 등 구체적 명령 출력)
**Notes:** 외부 패키지 매니저는 안전 역연산을 보장할 수 없으므로 투명하게 영수증 및 명령어 안내.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 완전 오프라인 status vs 능동형 doctor | status: 서브프로세스 0회, 로컬 영수증/락/해시 정적 점검 (<50ms) / doctor: 바이너리 프로브, discovery/canary 검증 | ✓ |
| status에서도 경량 하네스 버전 프로브 수행 | 실제 설치 감지 포함 | |
| You decide | 완전 오프라인 status 모델로 위임 | |

**User's choice:** (Recommended) 완전 오프라인 status (서브프로세스 0회, 로컬 영수증/락/해시 정적 점검) vs 능동형 doctor (바이너리 프로브, discovery/canary 검증)
**Notes:** 일상적인 status 명령의 초고속 무부작용 실행 보장.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 엄격한 해시 기반 CURRENT 판정 | 영수증 및 실물 파일 해시가 stable lock과 완벽 일치 시 CURRENT 보고, 0건 변형 | ✓ |
| 버전 번호 기준 CURRENT 판정 | 파일 해시 검증 생략, 속도 우선 | |
| You decide | 엄격 해시 기반 멱등성 모델 위임 | |

**User's choice:** (Recommended) 엄격한 해시 기반 CURRENT 판정 (영수증 및 실물 파일 해시가 stable lock과 완벽 일치 시 CURRENT 보고, 0건 변형)
**Notes:** 임의 파일 변형을 정확히 감지하여 완전한 멱등성 보장.

| Option | Description | Selected |
|--------|-------------|----------|
| (Recommended) 순수 읽기 전용 프리뷰 + 사전 검토된 stable-lock 승격 시에만 apply 허용 | 후보 락 직접 적용 엄격 차단 | ✓ |
| update --apply 시 온라인 최신 버전을 실시간 다운로드하여 즉시 반영 | 편의성 중심 | |
| You decide | 순수 읽기 전용 프리뷰 및 안정 락 승격 전용 모델 위임 | |

**User's choice:** (Recommended) 순수 읽기 전용 프리뷰 (변형 0건) + 사전 검토된 stable-lock 승격 시에만 apply 허용 (후보 락 직접 적용 엄격 차단)
**Notes:** 안전한 공급망 원칙: 검토되지 않은 candidate lock 직접 적용 방지.

---

## the agent's Discretion

- `alpha-aos uninstall` CLI 출력 레이아웃 및 서식.
- 외부 패키지 복구 영수증 스키마 설계 (`schemas/recovery-receipt.schema.json`).
- 손상 저널 격리 파일명 규격.

## Deferred Ideas

None — discussion stayed strictly within Phase 6 scope.
