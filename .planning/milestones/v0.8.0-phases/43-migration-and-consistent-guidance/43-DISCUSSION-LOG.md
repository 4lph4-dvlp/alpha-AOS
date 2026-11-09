# Phase 43: Migration and Consistent Guidance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 43-migration-and-consistent-guidance
**Areas discussed:** 레거시 설치 감지 및 마이그레이션 진입점, 사용자 수정 설정 충돌 시 보존 정책, 기존 소비자 내부 핀 제거 및 폴백 처리, CLI 출력 및 영한 문서 일관성 체계

---

## 레거시 설치 감지 및 마이그레이션 진입점

### Q1: 주 진입점 및 감지 방식
| Option | Description | Selected |
|--------|-------------|:--------:|
| 전용 alpha-aos migrate 명령 제공 + 기존 명령(install/update/doctor) 감지 시 안내 및 연계 지원 | 독립된 프리뷰/검증을 보장하면서 일반 명령 실행 중 레거시 발견 시 마이그레이션 경로를 명확히 제시 | ✓ |
| 기존 install 및 update 명령에 자동 통합 | 별도 migrate 명령 없이 레거시 설치 발견 시 현재 실행 중인 명령의 프리뷰에 입양(adopt) 계획을 포함하여 일괄 처리 | |
| You decide | 에이전트가 안전성 및 발견성을 고려하여 최적 구조 결정 | |

**User's choice:** 전용 alpha-aos migrate 명령 제공 + 기존 명령(install/update/doctor) 감지 시 안내 및 연계 지원
**Notes:** 독립된 프리뷰와 일반 워크플로 중 발견성 양립

### Q2: 대상 도구 및 하네스 선택 범위
| Option | Description | Selected |
|--------|-------------|:--------:|
| 전체 일괄 마이그레이션을 기본으로 하되, --tool 및 --target 플래그로 개별 도구/하네스 선별 마이그레이션 허용 | Phase 40의 install/update 플래그 규칙과 일관성 유지 | ✓ |
| 전체 일괄 마이그레이션만 허용 | 도구 간 공유 하네스 설정 분열을 방지하기 위해 항상 전체 레거시 환경을 단일 작업으로 전환 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 전체 일괄 마이그레이션을 기본으로 하되, --tool 및 --target 플래그로 개별 도구/하네스 선별 마이그레이션 허용
**Notes:** Phase 40과 일관된 CLI 플래그 설계

### Q3: 안전성 보장 및 적용 승인 방식
| Option | Description | Selected |
|--------|-------------|:--------:|
| SAFE-01 원칙 준수: 기본 실행은 읽기 전용 프리뷰, 적용 시에는 검토된 계획 다이제스트(--digest) 및 --apply 바인딩 요구 | Phase 2/14/40 패턴 일치 | ✓ |
| 간이 대화형 확인 | 별도 다이제스트 없이 실행 시 터미널에서 변경 요약을 보여준 뒤 Y/N 확인 후 즉시 적용 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** SAFE-01 원칙 준수: 기본 실행은 읽기 전용 프리뷰, 적용 시에는 검토된 계획 다이제스트(--digest) 및 --apply 바인딩 요구
**Notes:** 변경 전 계획 검토 및 안전한 트랜잭션 바인딩

### Q4: 레거시 락/설정 파일 처리 및 스토어 기록 방식
| Option | Description | Selected |
|--------|-------------|:--------:|
| 레거시 파일은 임의 삭제하지 않고 폐기 마킹/유지하며, 로컬 스토어에 type: 'migrate' 작업 및 이전 출처·소유권 증거를 원자적 기록 | 비파괴 안전성 및 추적성 보장 | ✓ |
| 마이그레이션 성공 즉시 레거시 락/설정 파일을 삭제 | 이후의 혼선 가능성을 원천 차단 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 레거시 파일은 임의 삭제하지 않고 폐기 마킹/유지하며, 로컬 스토어에 type: 'migrate' 작업 및 이전 출처·소유권 증거를 원자적 기록
**Notes:** 비파괴 롤백 안전성 확보

---

## 사용자 수정 설정 충돌 시 보존 정책

### Q1: 사용자 수정 흔적(modified) 감지 시 기본 처리 방침
| Option | Description | Selected |
|--------|-------------|:--------:|
| 비파괴 안전 입양 — 사용자 수정 파일을 .user-backup으로 자동 백업 보존하고, 로컬 기록에 'modified' 상태와 이전 증거를 기록한 뒤 입양 완료 | 사용자 수정 사항 보존 및 안전 입양 | ✓ |
| Fail-closed 엄격 차단 — 수정 감지 시 마이그레이션을 즉시 차단(blocked)하고 diff를 출력하여 명시적 플래그(--adopt-modified)를 요구 | 엄격한 안전 게이트 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 비파괴 안전 입양 — 사용자 수정 파일을 .user-backup으로 자동 백업 보존하고, 로컬 기록에 'modified' 상태와 이전 증거를 기록한 뒤 입양 완료
**Notes:** MIG-01 비파괴 원칙 준수

### Q2: 관리 영역과 커스텀 섹션 혼재 시 처리
| Option | Description | Selected |
|--------|-------------|:--------:|
| 마커 경계 기반 선택적 보존 — alpha-AOS 소유 마커/키 영역만 로컬 도구 기록에 바인딩하고, 사용자의 고유 커스텀 섹션은 파일 내에 그대로 온전히 유지 | 사용자 고유 섹션 손상 방지 | ✓ |
| 파일 단위 백업 및 표준 템플릿 교체 | 원본 전체를 백업한 후 표준 설정으로 교체하며, 사용자 커스텀 설정은 백업에서 수동 이전하도록 안내 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 마커 경계 기반 선택적 보존 — alpha-AOS 소유 마커/키 영역만 로컬 도구 기록에 바인딩하고, 사용자의 고유 커스텀 섹션은 파일 내에 그대로 온전히 유지
**Notes:** 파일 내 마커 블록 단위의 최소 침습 바인딩

### Q3: 소유권/출처 불분명(ambiguous) 설정 발견 시 해결 경로
| Option | Description | Selected |
|--------|-------------|:--------:|
| 명시적 해결 경로 제공: 프리뷰에서 모호한 소유권(ambiguous)을 별도 섹션으로 격리하고, 자동 덮어쓰기 없이 --resolve-ownership(external/alpha-aos 선택) 플래그를 통한 명시적 해결 요구 | 자동 덮어쓰기 방지 및 명시적 해결 | ✓ |
| 자동 가정 및 경고: 경고 메시지만 출력하고 기본적으로 alpha-AOS 소유로 가정하여 마이그레이션 계속 진행 | 최소 개입 진행 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 명시적 해결 경로 제공: 프리뷰에서 모호한 소유권(ambiguous)을 별도 섹션으로 격리하고, 자동 덮어쓰기 없이 --resolve-ownership(external/alpha-aos 선택) 플래그를 통한 명시적 해결 요구
**Notes:** MIG-01의 "drift or ambiguous ownership produces an explicit resolution path rather than overwrite" 반영

### Q4: 사용자 수정 상태와 백업의 doctor/inventory 추적
| Option | Description | Selected |
|--------|-------------|:--------:|
| doctor 및 inventory에 수정 상태 통합 진단: inventory에 'modified (backup: .user-backup)' 태그를 표시하고, doctor에서 백업 보존 무결성 및 정돈 상태를 진단 항목으로 제공 | 종합 상태 가시성 확보 | ✓ |
| inventory에만 단순 표시: doctor 진단 항목에는 추가하지 않고 inventory 상세 출력에만 'modified' 플래그 노출 | 단순 표시 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** doctor 및 inventory에 수정 상태 통합 진단: inventory에 'modified (backup: .user-backup)' 태그를 표시하고, doctor에서 백업 보존 무결성 및 정돈 상태를 진단 항목으로 제공
**Notes:** 도구 기록과 진단 도구 간 연계

---

## 기존 소비자 내부 핀 제거 및 폴백 처리

### Q1: 로컬 도구 기록 부재 시 소비자 모듈 처리
| Option | Description | Selected |
|--------|-------------|:--------:|
| Fail-closed 원칙 적용: 로컬 도구 기록이 없으면 숨겨진 핀으로 자동 폴백하지 않고, 명시적 install 또는 migrate 실행을 요구하며 중단 | 버전 불일치 및 암묵적 회귀 원천 차단 | ✓ |
| 과도기 베이스라인 허용: 로컬 기록이 없을 때만 최소 베이스라인 핀을 읽되, 콘솔 및 진단에 '레거시 베이스라인 사용 중' 경고를 강제 출력 | 과도기 편의 제공 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** Fail-closed 원칙 적용: 로컬 도구 기록이 없으면 숨겨진 핀으로 자동 폴백하지 않고, 명시적 install 또는 migrate 실행을 요구하며 중단
**Notes:** MIG-02 일관성 보장을 위한 fail-closed

### Q2: 도구 버전 및 무결성 해시 획득 방식
| Option | Description | Selected |
|--------|-------------|:--------:|
| 단일 공통 로컬 기록 해석자(Unified Local Record Reader) 사용: 모든 소비자가 tool-record-store의 최신 승인(accepted) 기록에서 버전·출처·무결성 해시를 조회하여 동적 유도 | MIG-02 단일 진실 공급원(SSOT) | ✓ |
| 모듈별 독립 조회 및 자체 캐시: 성능을 위해 isolation, doctor 등이 개별 캐시를 관리하며 동기화 | 분산 캐시 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 단일 공통 로컬 기록 해석자(Unified Local Record Reader) 사용: 모든 소비자가 tool-record-store의 최신 승인(accepted) 기록에서 버전·출처·무결성 해시를 조회하여 동적 유도
**Notes:** 로컬 레코드를 시스템 전역 단일 진실 공급원으로 확립

### Q3: 저장소 내 catalog/stack.lock.json 역할 및 수명 주기
| Option | Description | Selected |
|--------|-------------|:--------:|
| 레거시 마이그레이션 시드(Read-only Seed)로만 격리 유지: 런타임 코드의 직접 참조는 완전 제거하고, 오직 migrate 명령이 과거 고정 버전을 추적·입양할 때만 읽기 전용 참조로 사용 | 런타임-체크아웃 격리 | ✓ |
| 체크아웃에서 즉시 완전 삭제: stack.lock.json 및 정적 런타임 핀 파일을 저장소에서 완전히 제거하여 레거시 의존 원천 차단 | 물리적 제거 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 레거시 마이그레이션 시드(Read-only Seed)로만 격리 유지: 런타임 코드의 직접 참조는 완전 제거하고, 오직 migrate 명령이 과거 고정 버전을 추적·입양할 때만 읽기 전용 참조로 사용
**Notes:** 신규 런타임은 참조하지 않되 마이그레이션 입양 시드로 보존

### Q4: 소비자 간 버전 일치 여부와 잔재의 doctor 진단
| Option | Description | Selected |
|--------|-------------|:--------:|
| doctor에 단일 진실 공급원(SSOT) 일치 검사 추가: 하네스 설정, 격리 런타임, MCP 프록시가 로컬 accepted 기록과 일치하는지 종합 진단하고, 불일치 시 drift 경고 및 복구 가이드 제공 | MIG-02 완결 진단 | ✓ |
| 단순 도구 파일 존재성만 검사: 실행 파일 경로와 기본 응답만 확인하고 소비자 간 상세 버전 동기화 상태는 생략 | 단순 확인 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** doctor에 단일 진실 공급원(SSOT) 일치 검사 추가: 하네스 설정, 격리 런타임, MCP 프록시가 로컬 accepted 기록과 일치하는지 종합 진단하고, 불일치 시 drift 경고 및 복구 가이드 제공
**Notes:** 시스템 전역 버전 동기화 상태 검증

---

## CLI 출력 및 영한 문서 일관성 체계

### Q1: 외부 도구 릴리스와 alpha-AOS 자체 코드 업데이트 구분
| Option | Description | Selected |
|--------|-------------|:--------:|
| 명확한 2-트랙 분리: alpha-aos update는 외부 관리 도구 릴리스 전용으로 한정하고, CLI 도움말/상태에서 alpha-AOS 자체 코드 업데이트(npm 배포 및 로컬 npm run deploy:local)와 엄격히 구분 안내 | MIG-03 일관된 안내 | ✓ |
| 단일 명령 통합: alpha-aos update tool과 alpha-aos update engine 서브커맨드로 일원화하여 단일 진입점 제공 | 통합 진입점 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 명확한 2-트랙 분리: alpha-aos update는 외부 관리 도구 릴리스 전용으로 한정하고, CLI 도움말/상태에서 alpha-AOS 자체 코드 업데이트(npm 배포 및 로컬 npm run deploy:local)와 엄격히 구분 안내
**Notes:** 도구 업데이트와 엔진 코드 배포의 명확한 개념 분리

### Q2: CLI 결과 화면의 상태 표시 포맷
| Option | Description | Selected |
|--------|-------------|:--------:|
| 컴포넌트·하네스 매트릭스 테이블 형식: [도구 | 하네스 | 상태(retained/updated/failed/recovered/unverified) | 공유 설정 영향 | 필요 조치]를 구조화된 표와 상태 뱃지로 출력하여 부분 상태를 명확히 공개 | MIG-04 구조화된 상태 보고 | ✓ |
| 순차적 텍스트 로그 형식: 실행 순서대로 도구별 성공/실패 텍스트 라인을 나열하고 마지막에 성공 카운트만 요약 | 단순 텍스트 로그 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 컴포넌트·하네스 매트릭스 테이블 형식: [도구 | 하네스 | 상태(retained/updated/failed/recovered/unverified) | 공유 설정 영향 | 필요 조치]를 구조화된 표와 상태 뱃지로 출력하여 부분 상태를 명확히 공개
**Notes:** 부분 성공, 검증 대기, 공유 설정 영향을 투명하게 공개

### Q3: 영한(Bilingual) 문서화 범위 및 배치 구조
| Option | Description | Selected |
|--------|-------------|:--------:|
| README/README.ko 갱신 + 전용 마이그레이션 가이드(docs/guides/migration.md & migration.ko.md) 신설: README에 최신 CLI 사용법 및 엔진 배포 구분을 반영하고, 전용 가이드에 레거시 입양·백업 복원·하네스별 트러블슈팅 상세화 | 체계적 이원화 문서 | ✓ |
| README/README.ko에만 단일 섹션으로 추가: 별도 가이드 문서 신설 없이 메인 README 파일에 마이그레이션 및 업데이트 주의사항 섹션만 간략히 통합 | 단순 통합 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** README/README.ko 갱신 + 전용 마이그레이션 가이드(docs/guides/migration.md & migration.ko.md) 신설: README에 최신 CLI 사용법 및 엔진 배포 구분을 반영하고, 전용 가이드에 레거시 입양·백업 복원·하네스별 트러블슈팅 상세화
**Notes:** 상세 가이드와 메인 README의 적절한 역할 분담

### Q4: 관리 스킬(alpha-aos-control, alpha-aos-task) 지침 동기화
| Option | Description | Selected |
|--------|-------------|:--------:|
| 배포 스킬 및 프롬프트 동기화: alpha-aos-control, alpha-aos-task 등 관리 스킬 내 명령 설명에서 구형 백그라운드 갱신 언급을 제거하고, 로컬 기록 기반 migrate/update 및 2트랙 배포 정책을 일관되게 반영 | 에이전트 지침 일치 | ✓ |
| 스킬 프롬프트 변경 생략: CLI 도움말과 docs 문서만 갱신하고 스킬 디렉터리의 SKILL.md 파일들은 현 상태 유지 | 최소 변경 | |
| You decide | 에이전트 판단에 위임 | |

**User's choice:** 배포 스킬 및 프롬프트 동기화: alpha-aos-control, alpha-aos-task 등 관리 스킬 내 명령 설명에서 구형 백그라운드 갱신 언급을 제거하고, 로컬 기록 기반 migrate/update 및 2트랙 배포 정책을 일관되게 반영
**Notes:** 하네스/에이전트 스킬 프롬프트와 CLI 실제 동작 동기화

---

## the agent's Discretion

- `alpha-aos migrate` 명령의 세부 콘솔 UI 서식 및 컬럼 간격 조율
- `.user-backup` 생성 시 타임스탬프 파일명 서식 (예: `<filename>.<timestamp>.user-backup`)
- 공통 로컬 기록 리더 헬퍼 모듈의 구체적인 함수 시그니처 및 에러 메시지 세부 문구

## Deferred Ideas

None — discussion stayed within phase scope.
