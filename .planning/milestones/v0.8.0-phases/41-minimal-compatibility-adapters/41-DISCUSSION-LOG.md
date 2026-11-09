# Phase 41: Minimal Compatibility Adapters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 41-Minimal Compatibility Adapters
**Areas discussed:** 어댑터 레지스트리 범위와 메타데이터 조회 방식, ECC 스킬 본문 치환 축소와 별도 가이드 전환 기준, GSD Codex 훅 보정의 동작 판별과 은퇴 절차, 어댑터 사전조건 불일치 처리와 리비전·은퇴 기록

---

## 어댑터 레지스트리 범위와 메타데이터 조회 방식

### 질문 1: 레지스트리 등록 및 분류 범위
| Option | Description | Selected |
|--------|-------------|----------|
| 호환성 보정 어댑터 + 상시 정책 인터페이스 구분 등록 (Recommended) | 호환성 보정 어댑터(ECC 스킬 치환 2종, GSD Codex 훅 보정, Pi MCP 브리지)를 은퇴 조건이 있는 핵심 레지스트리로 관리하고, 상시 정책/설정 렌더러(Firecrawl 프록시, Claude skillOverrides 등)는 `policy-interface`로 구분 표기하여 경계를 명확히 함 | ✓ |
| 업스트림 변환·보정 어댑터만 등록 | ECC 치환 2종, GSD Codex 훅 보정만 레지스트리에 등록하고 Pi 브리지와 모든 정책/설정 렌더러는 제외함 | |
| 모든 설정 렌더러를 동일 취급 | 하네스별 모든 네이티브 설정 렌더러와 정책 프록시까지 전부 동일한 제거 조건 필드를 가진 호환성 어댑터로 취급함 | |

**User's choice:** 호환성 보정 어댑터 + 상시 정책 인터페이스 구분 등록 (Recommended)

### 질문 2: CLI 및 사용자 조회 화면
| Option | Description | Selected |
|--------|-------------|----------|
| 기존 워크플로 통합 조회 (Recommended) | 기본 `inventory`에서는 도구별 활성/은퇴 어댑터 요약만 간결히 보여주고, `inventory --detail`(또는 `--tool <id>`)과 `install`/`update` 프리뷰에서 이유·적용 조건·검증 방법·제거 조건·리비전·은퇴 증거 전체를 표시함 (JSON 출력 포함) | ✓ |
| 별도 전용 명령 신설 | `alpha-aos adapters`만 새로 만들고 기존 `inventory`나 `install`/`update` 프리뷰에는 표시하지 않음 | |
| 기본 inventory에 항상 전문 표시 | 기본 `alpha-aos inventory` 실행 시에도 모든 어댑터의 이유·적용 조건·검증 방법·제거 조건 전문을 항상 펼쳐서 표시함 | |

**User's choice:** 기존 워크플로 통합 조회 (Recommended)

### 질문 3: 어댑터 정의 구조와 코드-메타데이터 동기화
| Option | Description | Selected |
|--------|-------------|----------|
| 단일 권위 레지스트리 모듈 + 계약 테스트 (Recommended) | `src/core/compatibility-adapters.ts`에 어댑터별 정적 메타데이터와 실행 함수(사전조건·변환·검증)를 함께 묶어 선언하고, 암묵적 변환을 금지하는 계약 테스트로 검증함 | ✓ |
| YAML과 코드 분산 유지 | 메타데이터는 `catalog/stack.yaml`에만 두고 TypeScript 변환 코드는 기존 각 파일에 분산 유지한 채 수동으로 버전을 맞춤 | |
| 외부 런타임 JSON 동적 로드 | `~/.alpha-aos`의 외부 JSON 설정 파일에서 어댑터 정의와 정규식을 동적으로 읽어 실행함 | |

**User's choice:** 단일 권위 레지스트리 모듈 + 계약 테스트 (Recommended)

### 질문 4: Pi MCP 브리지(`pi-mcp-adapter`) 어댑터의 상태와 은퇴 조건
| Option | Description | Selected |
|--------|-------------|----------|
| 검증 전 활성 유지 + 제거 조건 명시 (Recommended) | 호환성 보정 어댑터(`mcp:pi-bridge`)로 등록하고 제거 조건을 명시하되, 설치된 Pi 버전에서 내장 MCP만으로 기존 브리지 정책(`lazy` lifecycle, `toolPrefix`, `outputGuard`)과 실제 읽기 전용 호출이 검증되기 전까지는 `active` 상태를 유지함 | ✓ |
| 즉시 은퇴 처리 | Pi 업스트림에 내장 MCP가 문서화되어 있으므로 별도 호출·정책 동등성 검증 없이 Phase 41에서 즉시 은퇴 처리함 | |
| 영구 정책 인터페이스로 고정 | 향후에도 은퇴 가능성을 열어두지 않고 `policy-interface`로 고정함 | |

**User's choice:** 검증 전 활성 유지 + 제거 조건 명시 (Recommended)

---

## ECC 스킬 본문 치환 축소와 별도 가이드 전환 기준

### 질문 1: `deep-research` 치환 축소와 `alpha-aos-research-routing` 전환
| Option | Description | Selected |
|--------|-------------|----------|
| 전역 ownedSkills 배포 + 증명 기반 치환 축소/유지 (Recommended) | `alpha-aos-research-routing`을 지원 하네스 전역 `ownedSkills`로 정식 배포하고, 하네스별로 별도 가이드 발견·우선순위 및 의도된 도구 경로(`web_search_exa` → `firecrawl_scrape`) 호출이 증명된 대상에서는 본문 치환을 제거(또는 최소 라우팅 헤더로 축소)하며 미증명 하네스에서는 명시적 어댑터를 유지함 | ✓ |
| 검증 없이 모든 치환 즉시 삭제 | 발견·우선순위 증명 여부와 무관하게 모든 하네스에서 `deep-research` 변환을 즉시 완전 삭제함 | |
| 기존 4개 섹션 정규식 치환 유지 | 별도 가이드는 사용하지 않고 기존 4개 섹션 정규식 통째 치환을 그대로 유지함 | |

**User's choice:** 전역 ownedSkills 배포 + 증명 기반 치환 축소/유지 (Recommended)

### 질문 2: Antigravity용 `documentation-lookup` 라우팅 보정 처리
| Option | Description | Selected |
|--------|-------------|----------|
| 명시적 어댑터 격리 + 실증 전 보정 유지 (Recommended) | 명시적 호환성 어댑터(`ecc:antigravity-doc-lookup`)로 격리하고 업스트림 본문 변형을 최소화하되, 별도 가이드 분리 시 Antigravity에서의 발견·우선순위와 Context7 실제 호출(네이티브 웹 검색 대체 방지) 증거가 확보되기 전까지는 보정을 유지함 | ✓ |
| 검증 없이 즉시 제거 | Antigravity에서 별도 가이드 발견·호출 증거가 없어도 즉시 변환을 완전 제거함 | |
| 전 하네스 일괄 주입 | 모든 하네스의 `documentation-lookup`에도 동일한 Antigravity 전용 문구를 일괄 주입함 | |

**User's choice:** 명시적 어댑터 격리 + 실증 전 보정 유지 (Recommended)

### 질문 3: 별도 alpha-AOS 가이드 전환의 유효성 증명 기준 (`ADAPT-03`)
| Option | Description | Selected |
|--------|-------------|----------|
| 3단계 실증 기준 (Recommended) | ① 하네스의 네이티브 가이드 발견(`discovery`), ② 업스트림 원문과 공존 시 차단 도구(`firecrawl_search` 등) 대신 alpha-AOS 라우팅 규칙 우선 적용(`precedence`), ③ 의도된 도구 경로의 실제 호출 관찰(`invocation receipt`)이 모두 확인된 하네스만 전환 완료로 인정하고 미확인 대상은 명시적 어댑터를 유지함 | ✓ |
| 파일 존재만으로 인정 | 하네스 스킬 디렉터리에 별도 가이드 파일(`SKILL.md`)이 생성되어 존재하는 것만으로 전환 완료로 간주함 | |
| 정적 텍스트 비교만으로 선언 | 실제 도구 호출 관찰 없이 프롬프트나 정적 텍스트 비교만으로 모든 하네스의 전환 완료를 선언함 | |

**User's choice:** 3단계 실증 기준 (Recommended)

### 질문 4: 유지되는 ECC 호환성 어댑터의 텍스트 변환 범위 축소
| Option | Description | Selected |
|--------|-------------|----------|
| 최소 범위 구조적 어댑터로 축소 (Recommended) | 4개 본문 섹션을 각각 정규식으로 통째 덮어쓰는 대신, 필수 프론트매터·라우팅 경계 사전조건만 검증하고 상단(또는 MCP 요구사항 블록)에 명시적 alpha-AOS 라우팅 계약 블록 주입 + 차단된 도구 호출(`firecrawl_search` 등) 중립화만 수행하는 최소 범위 어댑터로 축소함 | ✓ |
| 기존 4개 섹션 정규식 치환 유지 | 기존처럼 본문 내 4개 섹션과 6개 마크다운 헤딩 문자열에 강하게 결합된 전체 정규식 치환을 그대로 유지함 | |
| 사전조건 없이 파일 끝 단순 추가 | 사전조건 검사 없이 파일 맨 끝에 텍스트를 무조건 이어붙이고 본문 안의 차단된 도구 호출 지시는 그대로 둠 | |

**User's choice:** 최소 범위 구조적 어댑터로 축소 (Recommended)

---

## GSD Codex 훅 보정의 동작 판별과 은퇴 절차

### 질문 1: GSD Codex Stop 훅 보정 필요성 및 업스트림 해결 판별 방식
| Option | Description | Selected |
|--------|-------------|----------|
| 구조적 참조 분석 + 무보정 스모크 검증 결합 (Recommended) | `gsd-context-monitor.js`의 로컬 `./lib/*` 모듈 참조와 실제 설치된 `hooks/lib/*` 존재 여부를 구조적으로 점검하고, 알파-AOS 보정 전 업스트림 설치 상태 그대로 `smokeTestCodexGsdStopHook`을 실행해 정상 통과하면 '업스트림 해결(`resolved-upstream`)'로 판정함 | ✓ |
| 단일 문자열 검사 유지 | 기존처럼 `require('./lib/hook-exit.js')` 단일 문자열 일치 여부만 계속 검사함 | |
| 버전 번호 기반 생략 | 버전 번호만 보고 특정 버전 이상이면 실제 스모크 검증 없이 무조건 보정을 생략함 | |

**User's choice:** 구조적 참조 분석 + 무보정 스모크 검증 결합 (Recommended)

### 질문 2: GSD 훅 헬퍼 대상 판별 및 경계 검증
| Option | Description | Selected |
|--------|-------------|----------|
| 상대 참조 체인 바인딩 + 경계/누락 검증 (Recommended) | 모니터 엔트리포인트에서 시작하는 `hooks/lib/` 내부 상대 참조 체인을 검증된 업스트림 패키지 안에서 확인해 필요한 헬퍼만 복사 계획에 바인딩하고, `hooks/lib/` 경계를 벗어나거나 패키지에 존재하지 않는 참조가 있으면 어댑터 사전조건 불일치(`precondition-failed`)로 거부함 | ✓ |
| 고정 3개 파일명 강제 | 업스트림이 일부 헬퍼를 통합해 파일이 필요 없어져도 무조건 기존 3개 고정 파일명이 모두 있어야만 통과시킴 | |
| 무제한 전체 복사 | 사전조건이나 경로 제한 없이 업스트림 패키지의 모든 `.js` 파일을 `~/.codex/hooks/`에 통째로 복사함 | |

**User's choice:** 상대 참조 체인 바인딩 + 경계/누락 검증 (Recommended)

### 질문 3: 업스트림 해결 판정 시 호스트 잔여 파일로 인한 오판 방지
| Option | Description | Selected |
|--------|-------------|----------|
| 깨끗한 격리 픽스처 선검증 + 잔여 헬퍼 안전 정리 (Recommended) | 깨끗한 격리 픽스처(`runGsdFixture`)의 순수 업스트림 설치 결과에 대해 먼저 무보정 스모크 검증과 파일 존재 검사를 수행하여 업스트림 자체 해결 여부를 판정하고, 해결이 증명된 릴리스에서만 어댑터를 은퇴(`retired`) 처리하며 호스트의 불필요해진 alpha-AOS 소유 잔여 헬퍼만 안전하게 정리함 | ✓ |
| 호스트 디렉터리 상태만 검사 | 격리 픽스처 검증 없이 현재 사용자의 `~/.codex/` 디렉터리 상태에서 스모크 테스트가 통과하기만 하면 업스트림이 해결된 것으로 간주함 | |
| 영구 덮어쓰기 고정 | 업스트림이 문제를 해결하더라도 영구적으로 alpha-AOS가 헬퍼 파일을 덮어쓰도록 고정함 | |

**User's choice:** 깨끗한 격리 픽스처 선검증 + 잔여 헬퍼 안전 정리 (Recommended)

### 질문 4: 기타 GSD 호환성 경계(`alpha-aos-ship` 등) 관리
| Option | Description | Selected |
|--------|-------------|----------|
| 사전조건 및 제거 조건 명시 (Recommended) | `alpha-aos-ship`의 `gsd-core/workflows/ship.md` 경로 의존성 및 Claude 네이티브 커맨드 노출 여부도 어댑터/소유 스킬 사전조건과 제거 조건에 명시하여, 업스트림 GSD가 네이티브 노출을 해결하면 은퇴하고 워크플로 경로가 바뀌면 사전조건 불일치로 명확히 안내함 | ✓ |
| 기록 대상에서 제외 | Codex Stop 훅 외의 GSD 연동 요소는 이유·적용 조건·제거 조건 기록 대상에서 제외함 | |
| 워크플로 검사 삭제 | `gsd-core/workflows/ship.md` 존재 여부 검사를 삭제하고 항상 무조건 배포함 | |

**User's choice:** 사전조건 및 제거 조건 명시 (Recommended)

---

## 어댑터 사전조건 불일치 처리와 리비전·은퇴 기록

### 질문 1: 업스트림 변경 시 '정상 은퇴'와 '호환성 거부' 판정
| Option | Description | Selected |
|--------|-------------|----------|
| 제거 조건 선검증 후 은퇴 또는 fail-closed 거부 (Recommended) | 먼저 해당 어댑터의 '제거 조건(업스트림 자체 해결 검증)'이 충족되었는지 검사하여 통과하면 정상 은퇴(`retired` / `resolved-upstream`)로 기록·진행하고, 제거 조건을 통과하지 못했는데 사전조건이 깨진 경우에는 어댑터 ID·이유·실패한 사전조건을 명시하여 업데이트를 거부(`fail-closed`, 기존 정상 버전 유지)함 — 런타임 AI 재작성이나 깨진 원문 무검증 통과는 금지함 | ✓ |
| 무조건 원문 통과 (fail-open) | 사전조건이 맞지 않으면 업스트림이 해결되었는지 확인하지 않고 무조건 원문 그대로 통과시켜 설치함 | |
| 업스트림 해결 시에도 무조건 실패 | 업스트림 해결 여부와 무관하게 패턴이 달라지면 무조건 오류로 실패시켜 업스트림이 문제를 고쳐도 어댑터 코드를 수정하기 전에는 업데이트할 수 없게 함 | |

**User's choice:** 제거 조건 선검증 후 은퇴 또는 fail-closed 거부 (Recommended)

### 질문 2: 어댑터 리비전과 도출된 출력 해시의 바인딩
| Option | Description | Selected |
|--------|-------------|----------|
| 원본 해시 + 어댑터 리비전 도출 및 tool-records 기록 (Recommended) | 검증된 업스트림 원본 해시(`sourceSha256`)와 결정론적 어댑터 리비전(`adapterId` + `revision` + 적용/은퇴 상태)으로부터 기대 출력 해시를 로컬 도출하여 프리뷰-적용 다이제스트에 바인딩하고, `tool-records` 증거(`ToolEvidence`)에 적용·은퇴된 어댑터 리비전과 검증 결과를 함께 기록함 | ✓ |
| 최종 파일 해시만 저장 | 어댑터 리비전은 기록하지 않고 최종 생성된 파일 해시만 단순 저장함 | |
| 체크아웃 고정 targetSha256 유지 | 업스트림 버전이 바뀔 때마다 `catalog/stack.lock.json`의 하드코딩된 `targetSha256`과 계속 비교하여 불일치 시 거부함 | |

**User's choice:** 원본 해시 + 어댑터 리비전 도출 및 tool-records 기록 (Recommended)

### 질문 3: 은퇴한 어댑터의 사유와 검증 증거 보존 방식 (`ADAPT-04`)
| Option | Description | Selected |
|--------|-------------|----------|
| 레지스트리 및 tool-records에 은퇴 메타데이터·증거 보존 (Recommended) | 어댑터 레지스트리(`src/core/compatibility-adapters.ts`)에서 항목을 단순 삭제하지 않고 `status: 'retired'`(또는 선택된 릴리스 기준 `resolved-upstream`)와 은퇴 사유·검증 릴리스·검증 방법을 보존하여 변환은 수행하지 않되(no-op), 로컬 `tool-records`와 `inventory --detail`에서 은퇴 사유와 실제 검증 증거를 계속 조회할 수 있게 함 | ✓ |
| 은퇴 즉시 삭제 | 은퇴 즉시 레지스트리와 출력에서 모든 흔적을 삭제하고 git 커밋 로그에만 남김 | |
| 사유·증거 없이 상태만 표시 | 은퇴 상태만 표시하고 어떤 릴리스에서 어떤 검증 증거로 은퇴했는지는 기록하지 않음 | |

**User's choice:** 레지스트리 및 tool-records에 은퇴 메타데이터·증거 보존 (Recommended)

### 질문 4: 추측성 버전 임계값 금지와 은퇴 후 업스트림 회귀 방어
| Option | Description | Selected |
|--------|-------------|----------|
| 실증 기반 은퇴 + 은퇴 후에도 사후 조건 지속 검증 (Recommended) | 단순 버전 문자열 비교(`>= X.Y.Z`)만으로 보정을 생략하는 것을 금지하고 반드시 선택된 릴리스 아티팩트에 대한 실제 구조·동작 검증 증거로만 은퇴를 판정하며, 은퇴된 어댑터라도 후속 릴리스 업데이트 시 사후 검증 조건(postcondition)을 계속 확인하여 업스트림 회귀 발생 시 즉시 감지·거부함 | ✓ |
| 은퇴 버전 이후 검사 생략 | 한 번 특정 버전에서 은퇴하면 이후 릴리스에서는 사후 조건을 다시 확인하지 않고 버전 번호만 보고 통과시킴 | |
| 릴리스 노트 문구 기반 제거 | 업스트림 릴리스 노트나 체인지로그 텍스트에 수정 언급이 있는지만 보고 보정을 제거함 | |

**User's choice:** 실증 기반 은퇴 + 은퇴 후에도 사후 조건 지속 검증 (Recommended)

---

## the agent's Discretion

사용자가 별도로 판단을 위임한 항목은 없다. 세부 인터페이스/타입명, 어댑터 리비전 문자열 포맷, `ToolEvidence`의 `proofId`/`method` 명명 규칙, CLI 출력 열 배치는 위 결정을 만족하는 범위에서 연구·계획 단계에서 정한다.

## Deferred Ideas

None — discussion stayed within phase scope.
