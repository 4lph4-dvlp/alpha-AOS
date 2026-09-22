# Phase 05: Persistent Tree-Off Preload Isolation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18
**Phase:** 05-persistent-tree-off-preload-isolation
**Areas discussed:** 정책 저장소 및 상속 구조, 일반 진입점 인터셉션 및 프리로드 차단 방식, 미분류 저장소 첫 진입 분류 경험, 로컬 리소스 패스스루 및 환경 변수 경계

---

## 1. 정책 저장소 및 상속 구조 (Policy Registry & Inheritance)

| Option | Description | Selected |
|--------|-------------|----------|
| 전역 상태 레지스트리 단독 저장 (~/.alpha-aos/trees.json) | 저장소 내부에 어떤 파일도 생성/수정하지 않아 Git 추적이나 커밋 오염을 원천 차단하고 중앙에서 관리합니다. | ✓ |
| 전역 레지스트리와 비추적 로컬 파일 하이브리드 | 로컬 파일이 있으면 최우선 적용하고, 없을 때는 전역 레지스트리를 참조합니다. | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 전역 상태 레지스트리 단독 저장 (~/.alpha-aos/trees.json)
**Notes:** Git 저장소 오염을 원천 차단하기 위해 레포 내부 파일 수정을 금지하고 전역 레지스트리에만 저장하기로 결정.

| Option | Description | Selected |
|--------|-------------|----------|
| 실물 파일시스템 정규화 (Canonical realpath) | 심볼릭 링크/정션을 실제 물리 경로로 해석하고, Windows/macOS는 대소문자 무시, Linux는 대소문자 구분하여 별칭이나 링크 우회를 방지합니다. | ✓ |
| 단순 경로 문자열 정규화 | 슬래시/백슬래시 통일 및 단순 절대경로화만 수행 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 실물 파일시스템 정규화 (Canonical realpath)
**Notes:** Phase 1 및 Phase 2의 경로 증명 계약(`canonicalizeWithMissingTail`)을 재사용하여 심볼릭 링크/정션 우회를 방지.

| Option | Description | Selected |
|--------|-------------|----------|
| 최근접 조상 우선 (Nearest Ancestor / Longest Prefix Match) | 현재 경로에서 루트로 올라가며 가장 먼저 만나는 부모 디렉터리의 정책을 상속받고, 중첩 오버라이드를 정확히 반영합니다. | ✓ |
| 정확 일치만 적용 (Exact Match Only) | 하위 디렉터리 자동 상속 없이, 명시적으로 등록한 바로 그 디렉터리에서만 적용합니다. | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 최근접 조상 우선 (Nearest Ancestor / Longest Prefix Match)
**Notes:** 디렉터리 트리 상속 및 중첩 오버라이드(예: off 트리 내 특정 하위 프로젝트 managed)를 일관되게 지원.

| Option | Description | Selected |
|--------|-------------|----------|
| 독립된 tree 하위 명령어 제공 (alpha-aos tree set/list/preview/remove) | 디렉터리 정책 전용 서브커맨드로 현재 디렉터리의 유효 정책 미리보기와 상속 계층을 한눈에 확인합니다. | ✓ |
| 기존 isolate 명령어 확장 (alpha-aos project isolate --tree <path> --mode off) | 기존 project isolate 명령에 트리 상속 옵션을 추가합니다. | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 독립된 tree 하위 명령어 제공 (alpha-aos tree set/list/preview/remove)
**Notes:** 직관적이고 깔끔한 CLI 네임스페이스 확보.

---

## 2. 일반 진입점 인터셉션 및 프리로드 차단 방식 (Preload Isolation)

| Option | Description | Selected |
|--------|-------------|----------|
| 투명 실행 심 (Transparent CLI Shim) | PATH 상위에 경량 래퍼 심을 두어 터미널에서 codex/pi/hermes 직접 실행 시 cwd 트리 정책을 판정하고, off 트리인 경우 전역 로드를 차단하는 하네스별 격리 인자/환경변수를 주입하여 원본 바이너리를 실행합니다. | ✓ |
| 셸 프로필 함수 주입 (Shell Profile Functions) | 사용자의 셸 프로필(.bashrc, $PROFILE 등)에 래퍼 함수 주입 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 투명 실행 심 (Transparent CLI Shim)
**Notes:** 셸 설정 파일을 건드리지 않고, 모든 셸(bash, zsh, pwsh, cmd) 및 스크립트에서 균일하게 작동하는 PATH 기반 심 채택.

| Option | Description | Selected |
|--------|-------------|----------|
| 세션 훅 기반 늦은 감지 & 클린 재시작 | GUI/IDE 시작 시 세션 진입 훅에서 off 트리를 감지하고 격리 재시작 | |
| GUI/IDE 환경은 명시적 '미지원(unsupported)' 보고 | GUI 앱 사전 가로채기가 불가능한 표면은 억지로 시뮬레이션하지 않고 OPTO-08에 따라 CLI(agy) 전용으로 한정하고 GUI는 미지원으로 명시합니다. | ✓ |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** GUI/IDE 환경은 명시적 '미지원(unsupported)' 보고
**Notes:** AGENTS.md 및 OPTO-08의 원칙에 따라 가짜 격리를 시뮬레이션하지 않고 정직하게 CLI 지원만 보장하고 GUI는 unsupported로 명시.

| Option | Description | Selected |
|--------|-------------|----------|
| 트리별 전용 격리 홈 (~/.alpha-aos/isolated/trees/<id>/) | 전역 스킬/MCP/지침이 일절 없는 깨끗한 빈 설정 루트를 하네스별 환경변수로 주입하여, 불필요한 재로그인 없이 전역 리소스만 완벽 차단합니다. | ✓ |
| 휘발성 임시 디렉터리 (OS TempDir) 매 실행 생성 | 매번 빈 임시 디렉터리를 생성하여 환경변수로 주입 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 트리별 전용 격리 홈 (~/.alpha-aos/isolated/trees/<id>/)
**Notes:** 매번 재로그인해야 하는 불편함 없이 전역 커스터마이징만 깨끗하게 차단하는 전용 격리 홈 채택.

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-Closed 차단 및 진단 명령 안내 | 전역 리소스 배제가 완전히 증명되지 않는 하네스/환경에서는 실행을 즉시 중단하여 전역 도구 유출을 방지하고, alpha-aos tree inspect 안내를 출력합니다. | ✓ |
| 경고 출력 후 계속 실행 (Fail-Open with Warning) | 격리 보장이 불확실하더라도 경고를 출력한 뒤 순정 바이너리 실행 허용 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** Fail-Closed 차단 및 진단 명령 안내
**Notes:** 보안 및 격리 정책 위반을 방지하기 위해 엄격한 Fail-Closed(exit 2) 채택.

---

## 3. 미분류 저장소 첫 진입 분류 경험 (First-Use Classification Flow)

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 네이티브 AI 설정 탐지 시에만 1회 확인 | 기존 AI 설정이 존재할 때만 1회 물어보고 일반 레포에서는 방해 없이 통과 | |
| 모든 새 Git 저장소 진입 시 1회 확인 | AI 설정 유무와 상관없이 레지스트리에 없는 모든 Git 루트 진입 시 무조건 alpha-AOS 적용 여부를 확인합니다. | ✓ |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 모든 새 Git 저장소 진입 시 1회 확인
**Notes:** 사용자가 명시적으로 관리 여부를 알 수 있도록, 레지스트리에 없는 모든 Git 루트 첫 진입 시 질문하도록 결정.

| Option | Description | Selected |
|--------|-------------|----------|
| 3가지 선택지 제공 [Managed(적용) / Off(격리) / 나중에 결정] | 'Managed' 또는 'Off' 선택 시 ~/.alpha-aos/trees.json에 즉시 영속화하여 다음부터 묻지 않고, '나중에 결정' 시 이번 실행만 임시 통과합니다. | ✓ |
| 단순 2가지 선택지 [Managed / Off] 강제 | 반드시 적용 여부를 바로 결정하게 하고 즉시 레지스트리에 영속화 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 3가지 선택지 제공 [Managed(적용) / Off(격리) / 나중에 결정]
**Notes:** 유연한 사용자 경험을 위해 일회성 임시 통과 옵션 포함.

| Option | Description | Selected |
|--------|-------------|----------|
| 안전한 기본 격리 (Fail-Safe Off) | CI나 스크립트 등 대화가 불가능한 환경에서는 전역 도구 무단 주입을 막기 위해 임시 'off' 상태로 안전하게 실행합니다. (ALPHA_AOS_DEFAULT_MODE 환경변수로 오버라이드 가능) | ✓ |
| 실행 즉시 중단 (Fail-Closed Exit) | 미분류 저장소에 대한 정책이 미리 설정되어 있지 않으면 에러를 발생시키고 실행을 중단 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 안전한 기본 격리 (Fail-Safe Off)
**Notes:** 자동화 빌드 및 CI 환경에서 전역 리소스가 무단 주입되지 않도록 안전하게 off로 보호.

| Option | Description | Selected |
|--------|-------------|----------|
| 명시적 변경 및 대화형 재분류 지원 (alpha-aos tree set / classify) | 'alpha-aos tree set . --mode managed'로 즉시 변경하거나, 'alpha-aos tree classify'로 첫 진입 프롬프트를 다시 띄워 변경할 수 있게 합니다. | ✓ |
| 레지스트리 삭제 후 재진입 방식 | 레지스트리에서 해당 트리를 삭제하고 다음에 다시 묻도록 유도 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 명시적 변경 및 대화형 재분류 지원 (alpha-aos tree set / classify)
**Notes:** CLI 명령으로 즉시 변경하거나 대화형 프롬프트를 다시 띄울 수 있는 양방향 지원.

---

## 4. 로컬 리소스 패스스루 및 환경 변수 경계 (Local Passthrough & Env Allowlist)

| Option | Description | Selected |
|--------|-------------|----------|
| 제로 개입 네이티브 패스스루 | alpha-AOS는 저장소 로컬 리소스(.mcp.json, .agents/skills, AGENTS.md 등)를 관리·변환하지 않고 하네스가 자체 네이티브 로직으로 직접 읽도록 두며, inspect 시 목록만 순수 조회합니다. | ✓ |
| 로컬 리소스 등록/승인제 | 허용 목록에 등록된 것만 패스스루 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 제로 개입 네이티브 패스스루
**Notes:** 순정 하네스가 프로젝트 로컬 리소스를 직접 읽는 자연스러운 경험 보장.

| Option | Description | Selected |
|--------|-------------|----------|
| 검토된 화이트리스트만 전달 (Runtime + AI Auth Allowlist) | OS/런타임 필수 변수(PATH, HOME, TEMP 등)와 하네스 동작에 필요한 공식 AI 인증키(OPENAI_*, ANTHROPIC_*, GEMINI_* 등)만 전달하고, 무관한 시스템 시크릿과 alpha-AOS 전역 변수는 완전히 차단합니다. | ✓ |
| 부모 환경변수 전체 상속 (Full Environment Passthrough) | 셸의 모든 환경변수를 그대로 전달 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 검토된 화이트리스트만 전달 (Runtime + AI Auth Allowlist)
**Notes:** AGENTS.md 시크릿 제약 조건에 따라 임의의 환경변수나 시크릿 센티널 유출 원천 차단.

| Option | Description | Selected |
|--------|-------------|----------|
| 8대 표면 투명 리포트 (Full Surface Inspection) | 정책 상속 경로, 격리 설정 루트, 배제된 전역 리소스, 로컬 리소스, 환경변수 통과/차단 목록, 하네스별 격리 증명 상태를 체계적으로 출력합니다. | ✓ |
| 단순 요약 상태만 출력 (Summary Only) | 현재 적용 모드와 하네스별 동작 여부만 간략히 표시 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 8대 표면 투명 리포트 (Full Surface Inspection)
**Notes:** OPTO-08 요구사항을 충족하는 상세하고 투명한 진단 리포트 출력.

| Option | Description | Selected |
|--------|-------------|----------|
| 명확한 한계 고지 배너 + Sealed Fail-Closed 거부 | tree inspect 및 CLI 안내 시 '설정 격리이며 OS/네트워크 샌드박스가 아님'을 명시하고, sealed 모드 요청 시 컨테이너 어댑터 부재로 즉시 거부합니다. | ✓ |
| 문서로만 고지하고 CLI 출력 생략 | 문서에만 한계 명시 | |
| 엔진 기본 권장안에 위임 (You decide) | 기본 권장안 적용 | |

**User's choice:** 명확한 한계 고지 배너 + Sealed Fail-Closed 거부
**Notes:** 사용자가 보안 경계를 오해하지 않도록 명확한 경계 고지 및 v2 기능의 안전한 거부 준수.

---

## the agent's Discretion

- `~/.alpha-aos/trees.json` JSON 스키마 설계 세부사항
- POSIX/Windows용 심(Shim) 래퍼 스크립트 바이너리 템플릿
- `alpha-aos tree inspect` 터미널 출력 포맷 및 컬럼 디자인

## Deferred Ideas
None — 모든 논의가 Phase 5 범위 내에서 완료됨.
