# Alpha Vibe 에이전트 워크플로우 스택 결정서

- 상태: v4 — Claude v4 이관 항목을 사실 검증·정정한 최종 권위 문서 (구성 준비 단계)
- 작성일: 2026-09-01
- 대상 OS: Windows 11
- 대상 하네스: Claude Code, Codex, Antigravity GUI, Antigravity CLI, Antigravity IDE, Pi Agent, Hermes Agent
- 목표: GSD를 유일한 워크플로우 척추로 사용하고, ECC는 검증된 범용 기능과 프로젝트별 조건부 팩만 선택 설치한다.
- 문서 권위: 실제 설치·변경·검수는 이 문서만 기준으로 한다. `alpha-vibe-stack-claude.md`는 교차 검증 기록으로 보존하되 구현 명세로 병행 갱신하지 않는다.

## 1. 최종 결정 요약

최종 스택은 다음과 같다.

| 계층 | 선택 | 역할 |
|---|---|---|
| 워크플로우/상태 | `@opengsd/gsd-core`, `standard` 프로필 | discuss → plan → execute → verify → ship 및 `.planning/` 상태 소유 |
| 범용 ECC 기능 | `unified-memory`, `documentation-lookup`, `deep-research` | 하네스 간 기억, 최신 문서 조회, 심층 조사 |
| 연구 MCP | Context7 + Exa + Firecrawl을 모든 하네스에 연결 | 라이브러리 문서, 검색·출처 발견, 웹 추출·크롤링 |
| 프로젝트 기능 | 결정론적 프로젝트 팩 | 파일·의존성·위험 증거에 따라 보안 점검을 포함한 ECC 스킬만 프로젝트 로컬로 공급 |
| 라우팅 | 자작 `alpha-vibe-stack` CLI + 얇은 하네스 어댑터 | 탐지, 계획, 승인 정책, 적용, 잠금, 진단 |
| 작은 작업 | 각 하네스 네이티브 레인 | GSD 의례 없이 단순 수정·질문·로컬 검증 처리 |

핵심 원칙은 “모든 하네스에서 같은 능력”이지 “모든 하네스에 같은 파일을 복사”가 아니다. 하네스가 Markdown skill을 지원하면 ECC skill을 설치하고, Pi처럼 확장 기반인 하네스는 CLI/extension 어댑터로 동일 기능을 노출한다.

## 2. 확정 입력값

원 질문지의 선택 문자는 그대로 보존한다.

| 항목 | 확정 답변 | 추가 조건 |
|---|---|---|
| GSD | A | Open GSD의 GSD Core를 사용 |
| Q1 | A |  |
| Q2 | A, B, E | TypeScript, JavaScript, React, Next.js, Vue, Node, Python, FastAPI, Django, Kotlin, Java, Swift, Flutter, Go, Rust, C++, Bash, Zsh, PowerShell, Git, Docker. 특정 언어 팩에 의존하지 않는 폴리글랏 구성을 원함 |
| Q3 | A |  |
| Q4 | A, B, C |  |
| Q5 | B에 가까움 | LLM/RAG/에이전트 앱을 종종 만듦. 프로젝트마다 수동 설치하지 않아도, 필요가 탐지되면 관련 기능이 자동으로 사용 가능한 구조를 원함 |
| Q6 | A, B, F |  |
| Q7 | A | 하네스 간 인계가 필요함 |
| Q8 | E |  |
| Q9 | B, C, D | 다중 출처 심층 조사·인용 보고서, 최신 라이브러리 문서, 논문·특허·과학 DB가 필요함 |
| Q10 | A, C |  |
| Q11 | 확정 | Context7, Exa, Firecrawl을 7개 하네스 모두에 연결 |

이 입력에서 직접 도출되는 요구사항은 다음과 같다.

1. 언어별 규칙 묶음을 글로벌로 설치하지 않는다.
2. AI 서비스 기능은 저장소 증거를 통해 자동 탐지하고, 허용된 팩을 자동 공급할 수 있어야 한다.
3. 기억과 연구 결과는 특정 벤더의 세션 형식이 아니라 파일 기반으로 인계한다.
4. 최신 문서, 일반 웹 조사, 사이트 추출은 서로 다른 도구로 명시적으로 라우팅한다.
5. 보안 검토는 범용 기능이지만 GSD의 일반 검증 및 하네스 네이티브 리뷰와 한 작업에서 중복 실행하지 않는다.

## 3. GSD 선택

### 3.1 변종 비교와 제품 선택 근거

아래 수치는 2026-09-01 GitHub API 확인 시점의 참고값이다. star 수는 변동하므로 선택 기준이 아니라 유지보수 상태와 제품 경계를 설명하는 보조 자료로만 사용한다.

| 제품 | 확인 상태 | 이 구성에서의 판정 |
|---|---|---|
| `open-gsd/gsd-core` | 약 8,972 stars, MIT, active, 다중 runtime installer | **채택.** 기존 하네스에 동일 워크플로우와 `.planning/` 상태 모델을 공급 |
| `buildomator/buildomator` | 86 stars, MIT, Claude Code 전용, MCP-backed state | Claude 단독 최적화 후보이나 7개 하네스 공통 척추로는 부적합 |
| `rokicool/gsd-opencode` | 약 825 stars, OpenCode 전용, 2026-05-16 이후 유지보수 축소 | maintainer가 upstream 사용을 권고. README의 MIT badge와 달리 실제 `LICENSE` 파일 및 GitHub license metadata가 없어 제외 |
| `open-gsd/gsd-pi` | 약 1,185 stars, MIT, active | 기존 하네스에 얹는 팩이 아니라 별도 Pi 기반 coding agent이므로 현재 목표와 다름 |
| `gsd-build/get-shit-done` | 약 64,618 stars, MIT, archived | 과거 원본. 신규 설치 대상에서 제외 |
| `gsd-build/gsd-2` | 약 7,772 stars, MIT | 저장소가 active home을 `open-gsd/gsd-pi`로 이전했다고 명시 |

`gsd-core`를 선택하는 결정적 이유는 star 수가 아니라 Claude Code, Codex, Antigravity, Pi 등 기존 하네스에 runtime별 변환 설치하면서 동일한 파일 기반 프로젝트 상태를 유지할 수 있기 때문이다. Buildomator는 Claude 전용이고 GSD Pi는 별도 agent runtime이므로 이 요구를 충족하지 않는다.

### 3.2 제품과 프로필

선택은 **Open GSD의 `@opengsd/gsd-core` 제품 + `standard` 프로필**이다.

여기서 `GSD Core`는 제품명이고 `core`는 그 제품의 최소 설치 프로필이다. 둘을 혼동하지 않는다.

`standard`를 선택하는 이유:

- `core` 프로필은 핵심 루프 8개만 제공하며 서브에이전트가 없다.
- `standard`는 core에 brownfield onboarding, review/config/progress/resume/pause/workspace와 필요한 서브에이전트를 더한다.
- 사용자는 신규 프로젝트뿐 아니라 여러 언어의 기존 저장소, 다중 하네스 인계, 중장기 작업을 모두 다룬다.
- `full`은 UI, 연구, 평가 등 ECC 및 네이티브 기능과 겹치는 surface까지 넓히므로 기본값으로 쓰지 않는다.

공식 문서가 제시하는 대략적인 description 비용은 core 약 130, standard 약 700, full 약 1,200 토큰이다.

이 수치는 **cold-start description 비용만** 뜻한다. Claude Code에서는 호출된 skill 본문이 후속 turn에 남으므로 §5.5의 lifecycle과 §9의 실측을 함께 적용한다. 그렇다고 즉시 core로 내리지는 않는다. core에는 subagent가 없고, 이 구성에서 standard를 고른 핵심 이유가 brownfield 및 fresh-context 실행이기 때문이다.

2026-09-01 npm 레지스트리 직접 조회 결과 최신 안정 버전은 **`1.12.0`**이며 2026-08-30 배포되었다. 최초 구현은 `@opengsd/gsd-core@1.12.0`으로 재현하고 lock에 기록한다. 설치일이 달라지면 최신 버전을 다시 확인하되, 검증 없이 `@latest`를 실행 명세에 남기지 않는다.

`1.12.0` package manifest의 선행 조건은 Node.js **`>=24.0.0`**, npm **`>=10.0.0`**이다. 설치 전에 각 버전을 inventory하고 조건을 충족하지 않으면 GSD 설치를 진행하지 않는다.

합의한 `standard`를 설치하는 정확한 명령은 다음과 같다. `--profile=standard`가 없으면 기본값인 `full`이 설치되므로 생략하지 않는다.

```powershell
npx --yes @opengsd/gsd-core@1.12.0 --claude      --global --profile=standard
npx --yes @opengsd/gsd-core@1.12.0 --codex       --global --profile=standard
npx --yes @opengsd/gsd-core@1.12.0 --antigravity --global --profile=standard
npx --yes @opengsd/gsd-core@1.12.0 --pi           --global --profile=standard
```

확인된 GSD installer 옵션은 `--global`, `--local`, `--config-dir`, `--uninstall`, `--portable-hooks`다. `--skills-dir`와 `--agent-file`은 GSD installer 옵션이 아니며 Kimi 계열 runtime 실행 옵션이므로 설치 명세에 넣지 않는다.

### 3.3 하네스 적용 범위

| 하네스 | GSD 적용 방식 | 주의점 |
|---|---|---|
| Claude Code | 공식 installer | 글로벌/로컬 중복 설치를 피하고 hook 상태를 검사 |
| Codex | 공식 `--codex` 변환 설치 | Codex CLI/앱 버전 전제와 생성된 skill/agent/hook을 검사 |
| Antigravity GUI/CLI/IDE | 공식 `--antigravity` 설치 | 공통 skill/agent 루트와 각 변형의 runtime config를 별도로 smoke test |
| Pi Agent | 공식 `--pi` extension 설치 | Markdown skill 복사가 아니라 `gsd.js` extension과 `gsd_invoke`를 사용 |
| Hermes Agent | 정책상 GSD 컨트롤러로 설치하지 않음 | GSD `1.12.0` installer에는 `--hermes`가 존재하지만 단일 state writer 정책 때문에 worker/native lane으로만 참여 |

Hermes에서도 프로젝트 코드를 작업할 수는 있지만 GSD 단계 전이와 `.planning/STATE.md` 갱신은 GSD를 실행 중인 지원 하네스 하나만 담당한다. 인계는 ECC Memory Vault와 프로젝트 문서를 사용한다.

### 3.4 단일 소유권 규칙

| 동사/상태 | 소유자 |
|---|---|
| discuss / plan / execute / verify / ship | GSD |
| `.planning/` 단계 상태 | 현재 활성 GSD 컨트롤러 1개 |
| 하네스 간 임시 인계 | ECC Unified Memory |
| 승인된 설계·규칙·결정 | 저장소의 governed docs |
| 최신 라이브러리 문서 | Context7 |
| 출처 발견·범용 웹 검색 | Exa |
| 알려진 URL 추출·사이트 크롤링 | Firecrawl |
| 앱 보안 점검 | 한 실행에서 네이티브 또는 ECC 중 하나 |

GSD 내부에서 병렬 wave를 사용하면 외부 오케스트레이터가 같은 작업을 다시 병렬화하지 않는다. 여러 독립 프로젝트를 외부에서 병렬 실행할 때는 각 프로젝트의 GSD 실행을 단일 레인으로 제한한다.

## 4. Q11: 모든 하네스의 공통 연구 MCP

### 4.1 확정 연결

다음 세 MCP를 Claude Code, Codex, Antigravity GUI/CLI/IDE, Pi Agent, Hermes Agent에 모두 연결한다.

| MCP | 전담 역할 | 사용 조건 |
|---|---|---|
| Context7 | 버전별 라이브러리·프레임워크·API 문서와 예제 | 구현이 외부 라이브러리의 현재 동작에 의존할 때 |
| Exa | 다중 출처 탐색, 최신 웹 검색, 후보 출처 발견, 심층 조사 시작점 | 조사 질문, 비교, 최신 동향, 출처 목록이 필요할 때 |
| Firecrawl | 단일 URL 정제, JS 사이트 추출, map/crawl, 구조화 추출 | 읽어야 할 URL 또는 크롤링할 사이트가 정해졌을 때 |

세 MCP가 항상 연결되어 있어도 매 작업에서 셋을 모두 호출하지 않는다. 연결은 가용성이고 호출은 라우팅 규칙에 따른다.

### 4.2 중복 호출 방지 라우팅

1. 라이브러리·프레임워크의 사용법과 버전 차이는 Context7부터 조회한다.
2. 일반 조사와 출처 발견은 Exa부터 시작한다.
3. Exa가 찾은 후보 중 본문 전체나 사이트 구조가 필요한 URL만 Firecrawl로 넘긴다.
4. 이미 알려진 URL 한두 개의 본문이 목적이면 Exa를 거치지 않고 Firecrawl을 사용한다.
5. 논문·특허의 최종 사실 확인은 PubMed, Crossref, DOI 원문, USPTO 등 1차 DB로 되돌아간다.
6. 어떤 MCP의 요약도 그 자체를 최종 출처로 인용하지 않는다. 최종 보고서는 원문 URL과 발행 주체를 인용한다.

권장 연구 흐름은 다음과 같다.

```text
질문 분류
  ├─ 라이브러리/API 문서 ──> Context7 ──> 공식 문서 확인
  ├─ 일반/최신 조사 ───────> Exa ───────> 후보 출처 선별
  │                                      └─ 본문 필요 ──> Firecrawl
  └─ 알려진 사이트 추출 ───> Firecrawl ──> 원문·구조화 데이터
```

### 4.3 연결 및 비밀 관리 계약

- MCP 연결은 user scope를 기본으로 하되, 키와 토큰은 저장소에 기록하지 않는다.
- 가능하면 remote HTTP + OAuth를 사용하고, OAuth가 불가능한 하네스만 환경 변수 또는 OS 비밀 저장소를 사용한다.
- API 키를 명령 인자, 커밋 파일, lock 파일, 로그에 넣지 않는다.
- Firecrawl의 키 포함 remote URL은 그 URL 자체가 비밀이므로 로그·스크린샷·진단 번들에 남기지 않는다. 가능하면 stdio와 `FIRECRAWL_API_KEY` 환경 변수를 사용한다.
- 비용 추적이 필요하면 공급자별 하나의 공용 키가 아니라 하네스별 키를 발급한다.
- 하네스마다 독립적인 MCP 클라이언트 연결을 구성한다. “모든 하네스 연결”을 하나의 MCP 프로세스에 동시 접속한다는 뜻으로 해석하지 않는다.
- 설치 완료 판정은 설정 파일 존재가 아니라 각 하네스에서 `list tools`와 최소 1회 read-only 호출이 성공하는지로 한다.
- 공급자 장애 시 native web search 또는 공식 사이트 직접 조회로 폴백하고, 결과에 폴백 사실을 남긴다.

Claude Code에서는 `/mcp`가 `connected`여도 tool 수가 0이면 실패로 판정한다. 먼저 reconnect하고, 계속 0이면 `claude --debug='mcp'` 또는 비밀이 없는 명시적 경로를 지정한 `claude --debug-file <path>`로 stderr와 초기화 로그를 확인한다. 디버그 로그를 공유하기 전에는 URL query, header, 환경 변수 등 비밀을 반드시 제거한다. 다른 하네스도 “프로세스 연결”과 “tool discovery 성공”을 분리해 판정한다.

Codex CLI와 IDE extension은 같은 Codex host에서 MCP 구성을 공유할 수 있다. 이것을 Antigravity나 다른 제품에도 그대로 적용된다고 가정하지 않고 각 surface를 따로 검증한다.

### 4.4 최종 목표와 배포 순서의 구분

최종 목표는 사용자가 확정한 대로 **Context7 + Exa + Firecrawl을 7개 하네스 모두에 연결**하는 것이다. 다만 21개 연결을 한 번에 변경하지 않고 다음 wave별 health gate를 통과시키며 배포한다.

1. Context7을 7개 하네스에 순차 연결하고 tool discovery, 인증, 문서 조회를 검증한다.
2. Exa를 7개 하네스에 순차 연결하고 검색, 원문 URL 반환, 비용 식별자를 검증한다.
3. Firecrawl을 7개 하네스에 순차 연결하고 단일 URL scrape만 먼저 검증한 뒤 crawl/map을 허용한다.
4. 각 wave에서 실패한 하네스만 중단·수정하며, 이미 통과한 하네스의 목표 연결을 되돌리지 않는다.

공식 OpenAI 문서는 Codex의 local MCP 지원과 CLI·IDE extension의 설정 공유를 확인해 주지만, 모든 하네스의 tool schema 지연 로딩을 보장하지는 않는다. 이 불확실성은 최종 범위를 축소할 근거가 아니라 하네스별 `/tools`·MCP 목록·read-only smoke test를 요구하는 근거로 사용한다.

## 5. ECC 선택 결과

### 5.1 글로벌 논리 기능

글로벌 상주 기능은 **ECC 3개 + 자작 라우터 1개**로 확정한다.

| 기능 | ECC skill | 범위 | 실행 정책 |
|---|---|---|---|
| 하네스 간 기억 | `unified-memory` | 전역 | CLI runtime을 공통 source of truth로 사용. 기억은 unreviewed context로 취급 |
| 최신 문서 워크플로우 | `documentation-lookup` | 전역 | Context7가 건강할 때만 사용. 공식 문서 우선 |
| 심층 조사 워크플로우 | `deep-research` | 전역 | Exa로 발견하고 필요 시 Firecrawl로 추출. 원문 인용 필수 |
| 결정론적 팩 공급 | `ecc-pack-router` 자작 어댑터 | 전역 | LLM이 팩을 추론하지 않음. `alpha-vibe-stack` CLI 결과만 설명·호출 |

“전역 논리 기능”과 “모든 대상에 동일 ECC Markdown 파일 설치”는 다르다.

- Markdown skill을 지원하는 하네스에는 선택 설치한다.
- Pi에서는 extension이 `ecc`/`alpha-vibe-stack` CLI를 호출한다.
- 하네스 네이티브 기능이 더 강한 경우 router가 native 구현을 선택하고 ECC 중복 실행을 막는다.
- Unified Memory는 skill 파일만으로 동작하지 않으므로 `ecc-universal` CLI runtime을 별도 설치한다. 2026-09-01 npm 직접 조회 기준 안정 버전은 **`2.2.0`**이며 이 버전을 lock한다.

Agent Skills 형식을 쓰는 대상에는 flat file인 `<name>.md`가 아니라 반드시 `<skill-root>/<name>/SKILL.md`로 배포한다. Claude Code의 project 경로는 `.claude/skills/<name>/SKILL.md`다. 정확한 root와 discovery 방식은 하네스 어댑터가 소유하며, Pi처럼 이 형식을 지원하지 않는 대상에는 억지로 복사하지 않는다.

`security-review`는 범용적으로 필요한 **논리 기능**이지만 글로벌 상주 skill에서는 제외한다. ECC 원문 description은 인증·입력·비밀뿐 아니라 새 API endpoint와 서드파티 API 연동까지 자동 활성화 대상으로 잡아 범위가 넓다. 따라서 router가 아래 위험 증거를 확인한 작업에서만 네이티브 보안 리뷰 또는 ECC `security-review` 중 하나를 선택한다.

- 인증·인가, 사용자 입력·파일 업로드
- 비밀·결제·개인정보·민감 데이터
- 외부 명령 실행, 네트워크 신뢰 경계, 새 공개 API endpoint
- 위험한 역직렬화, 권한 모델, 보안 관련 인프라 변경

### 5.2 프로젝트 팩

| 팩 | 결정론적 탐지 증거 | 설치할 ECC skill |
|---|---|---|
| `BROWNFIELD_INIT` | 기존 소스가 있고 표준화된 conventions 문서가 없음 | `inherit-legacy-style`를 1회 실행 후 제거 |
| `WEB_BASE` | 웹 프레임워크 의존성 + 브라우저 진입점/route 증거 | `browser-qa`, `accessibility` |
| `WEB_REACT` | React 또는 Next.js 의존성 | `frontend-a11y` |
| `WEB_FLOW_AUDIT` | pack manifest에 critical user flow 선언 | `click-path-audit` |
| `API` | FastAPI/Django REST/Express/Nest 등 서버 프레임워크, OpenAPI, route/controller 증거 | API 공통 검증 항목만 공급. 단순히 “프론트가 없음”으로 판정하지 않음 |
| `DB_MIGRATION` | migration 디렉터리 또는 ORM migration 설정 | `database-migrations` |
| `DB_POSTGRES` | PostgreSQL driver/DSN/config 증거 | `postgres-patterns` |
| `CACHE_REDIS` | Redis client/DSN/config 증거 | `redis-patterns` |
| `CONTAINER` | `Dockerfile`, Compose 파일 | `docker-patterns` |
| `DEPLOYMENT` | 실제 deploy/release/publish workflow, Kubernetes/Terraform 등 | `deployment-patterns` |
| `MCP_SERVER` | MCP SDK 의존성 또는 MCP server manifest | `mcp-server-patterns` |
| `AGENT_RUNTIME` | 실제 agent SDK/runtime 의존성 | `agent-harness-construction` |
| `AI_EVAL` | 모델 SDK + eval 데이터/config/test 증거 | `ai-regression-testing`, `eval-harness` |
| `SECURITY_REVIEW` | 위 위험 증거 또는 manifest opt-in | 네이티브 보안 리뷰가 없거나 명시적으로 ECC를 선택한 대상에만 `security-review` |
| `RESEARCH_SCIENTIFIC` | manifest opt-in 또는 명시적인 과학·논문·특허 조사 작업 | `scientific-db-pubmed-database`, `scientific-db-uspto-database`, `scientific-thinking-literature-review`, `scientific-thinking-scholar-evaluation` |

`AGENTS.md`나 `.claude/skills/`의 존재만으로 `AGENT_RUNTIME`을 활성화하지 않는다. 일반 저장소에도 흔히 존재하기 때문이다. AI pack은 실제 SDK/설정/평가 자산처럼 프로젝트 의미를 나타내는 양성 증거가 있어야 한다.

### 5.3 도구함과 제외 목록

필요할 때 명시적으로만 설치하거나 실행하는 도구함:

- `config-gc`
- `skill-comply`
- `skill-stocktake`
- `workspace-surface-audit`

도구함은 기본적으로 **설치하지 않고 명시적인 CLI 실행**으로 사용한다. 지속 설치가 꼭 필요한 경우에도 자동 발동을 금지한다.

- Claude Code의 제3자 ECC skill은 고정한 원본과 file hash를 보존하기 위해 `SKILL.md`를 수정하지 않는다. `skillOverrides`에서 `"user-invocable-only"`로 지정한다.
- 우리가 직접 소유하는 wrapper skill에는 `disable-model-invocation: true`를 넣을 수 있다.
- Claude plugin skill에는 `skillOverrides`가 적용되지 않지만, 이 설계는 ECC plugin/profile 자체를 설치하지 않으므로 해당 경로를 사용하지 않는다.
- 다른 하네스는 동등한 manual-only 제어가 있으면 사용하고, 없으면 도구함을 상주 설치하지 않는다. Pi에서는 명시적 extension/CLI 명령으로만 노출한다.
- `config-gc`처럼 삭제·정리를 수행하는 도구는 항상 dry-run과 사용자 확인을 요구한다.

Claude Code `skillOverrides`의 전체 상태는 다음과 같다.

| 값 | Claude 모델에 노출 | `/` 메뉴 | 용도 |
|---|---|---|---|
| `"on"` | 이름 + description | 표시 | 기본 자동 탐색 |
| `"name-only"` | 이름만 | 표시 | 존재는 알리되 description 비용·오라우팅 축소 |
| `"user-invocable-only"` | 숨김 | 표시 | 사용자가 명시적으로만 실행하는 도구함 |
| `"off"` | 숨김 | 숨김 | 완전 비활성 |

`/skills`에서는 `Space`로 상태를 순환하고 `Esc`로 저장하며, 결과는 현재 프로젝트의 `.claude/settings.local.json`에 기록된다. 글로벌 ECC 도구함 정책은 프로젝트별 UI 저장에 의존하지 않고 Windows의 `%USERPROFILE%\.claude\settings.json`에 `skillOverrides`를 명시한다. plugin skill에는 이 설정이 적용되지 않지만 ECC plugin/profile을 설치하지 않으므로 현재 설계에는 영향이 없다.

기본 제외:

- `context-budget`: 현재의 lazy tool/schema discovery를 정확히 모델링하지 못하는 Claude 중심 휴리스틱이므로 사용하지 않는다.
- ECC 전체 profile (`minimal`, `core` 포함)
- `workflow-quality` 모듈
- `tdd-workflow`, `verification-loop`, `plan-canvas`, `intent-driven-development`, `delivery-gate`
- `git-workflow`, `dev-team`, `council*`, `codebase-onboarding`, `code-tour`, `product-lens`: GSD 또는 네이티브 레인과 중복
- `continuous-learning*`, instincts/evolve/promote 계열: 일회성 우회나 과거 제약을 새 프로젝트의 보편 규칙으로 전파할 위험
- framework/language rules 전량: 폴리글랏 요구에서는 상시 규칙보다 프로젝트의 formatter, linter, type checker, test, CI를 권위로 둠
- `architecture-decision-records`, `living-docs-governance`, `contract-first`: Q8 = E에 따라 기본 제외하되 §12 조건에서 재검토
- `search-first`: Context7·Exa·Firecrawl 라우팅과 중복
- `cost-tracking`: ECC hook 의존 계측 대신 §9의 native OTel과 공통 wrapper 지표 사용
- `codehealth-mcp`, `repo-scan`: 외부 서비스·외부 저장소 의존성을 기본 표면에 추가하지 않음
- `windows-desktop-e2e`: WPF/WinForms/Qt 등 Windows native desktop 프로젝트에서만 별도 pack 후보
- `gateguard`, `safety-guard`: 현재 선택 범위 밖이며 실제 결손이 증명될 때 재검토
- ECC agents, legacy command shims, hooks runtime, rules-core의 전량 설치
- `production-audit`를 모든 GSD verify에 자동 결합하는 구성

`inherit-legacy-style`은 글로벌 상주 skill이 아니다. brownfield 최초 분석에서 중립적인 `docs/ai/CONVENTIONS.md`를 만든 뒤 제거하고, 이후에는 그 문서를 모든 하네스가 읽는다.

### 5.4 ECC 선택 설치 명령

ECC의 profile은 사용하지 않고 `--skills`로 개별 ID만 선택한다. Windows PowerShell에서는 `install.ps1`을 우선 사용한다.

```powershell
# 사용자 전역 Claude Code — 미리보기
.\install.ps1 --target claude `
  --skills unified-memory,documentation-lookup,deep-research `
  --dry-run --json

# 프로젝트 로컬 Claude Code 팩 — 미리보기
.\install.ps1 --target claude-project `
  --skills browser-qa,accessibility `
  --dry-run --json
```

`--target claude`는 사용자 전역 Claude root, `--target claude-project`는 현재 저장소의 `.claude/`를 대상으로 한다. `--dry-run --json` 결과에서 source, destination, operation 수, warning을 검토한 뒤 동일 exact version/hash에만 실제 적용한다. Git Bash에서 `install.sh`를 사용할 경우 wrapper가 MSYS2 경로를 Windows 경로로 변환하지만 PowerShell 기본 경로로 삼지는 않는다. Codex, Antigravity, Hermes 등에는 각 target adapter를 사용하고 Pi는 별도 extension/CLI 어댑터를 사용한다.

### 5.5 Claude Code skill 본문 lifecycle

Claude Code에서 skill이 호출되면 렌더링된 `SKILL.md` 본문은 하나의 대화 메시지로 들어가 후속 turn에도 남는다. 따라서 비용 모델은 시작 시 description뿐 아니라 실제 호출된 본문과 동적 출력까지 포함해야 한다.

- 동일 렌더링 결과를 재호출하면 본문을 다시 넣지 않고 이미 로드되었다는 짧은 note만 추가한다.
- argument 또는 동적 command 출력이 달라지면 전체 렌더링 본문이 다시 추가될 수 있다.
- auto-compaction 후에는 skill별 최근 호출의 앞부분 최대 5,000 tokens를 재첨부한다.
- 재첨부되는 모든 skill의 합계 예산은 25,000 tokens이며 오래된 skill은 탈락할 수 있다.
- 이 동작은 Claude Code의 lifecycle이다. 다른 하네스에도 동일하다고 가정하지 않고 각각 측정한다.

## 6. 결정론적 라우터 설계

라우터의 권위는 LLM skill이 아니라 `alpha-vibe-stack` CLI에 둔다.

```text
detect -> plan -> policy check -> apply -> lock -> status/doctor
```

필수 명령:

```text
alpha-vibe-stack detect
alpha-vibe-stack plan
alpha-vibe-stack apply
alpha-vibe-stack status
alpha-vibe-stack doctor
alpha-vibe-stack remove <pack>
```

각 하네스 어댑터는 다음 계약을 구현한다.

1. 정확한 skill root와 `<name>/SKILL.md` 레이아웃
2. native discovery/status 명령과 실제 로드 검증
3. manual-only/비활성화 기능의 지원 여부와 적용 방식
4. MCP tool 수와 read-only smoke test
5. 설치·제거 시 router 소유 경로의 경계

저장소에 커밋할 파일:

```text
.alpha-vibe/stack.yaml       # 선택한 pack, 자동 적용 정책, 예외
.alpha-vibe/stack.lock.json  # GSD/ECC 정확 버전, skill 목록, 대상, 파일 hash, 탐지 증거
```

생성된 하네스별 skill 복사본은 기본적으로 gitignore하고, manifest와 lock만 커밋한다. 단, 기존 `.claude/`, `.codex/`, `.agents/` 전체를 광범위하게 ignore하지 않고 router가 소유한 하위 경로만 정확히 제외한다.

### 6.1 자동 설치 정책

Q5의 “프로젝트마다 수동 설치 없이 자동 사용” 요구는 다음 방식으로 충족한다.

- 탐지와 install plan 생성은 항상 자동이다.
- 순수 Markdown skill pack은 사용자가 한 번 승인한 exact ECC version + file hash allowlist 안에서 자동 적용할 수 있다.
- 버전 또는 hash가 바뀌면 자동 적용을 중단하고 새 diff 승인을 요구한다.
- hook, MCP, rules, agent executable, 설정 파일 병합은 항상 별도 확인을 요구한다.
- 탐지 증거가 사라지면 자동 삭제하지 않고 stale 상태로 표시한다. 제거는 명시 명령으로만 한다.
- 모든 적용은 dry-run diff를 생성하고 lock에 결과를 기록한다.
- 파일 복사 성공을 설치 성공으로 간주하지 않는다. 적용 후 하네스의 native skill 목록과 router `doctor`에서 이름, 출처, 레이아웃, invocation 정책을 확인한다.

이 구조는 “모델이 필요하다고 느껴서 설치”하는 비결정성을 제거하면서도, 한번 신뢰한 안전한 pack은 프로젝트마다 반복 승인하지 않게 한다.

### 6.2 `context: fork` 사용 경계

`context: fork`는 Claude Code skill을 별도 subagent context에서 실행하는 Claude 전용 frontmatter다. 범용 `alpha-vibe-stack` router의 권위나 기본 실행 방식으로 사용하지 않는다.

- `detect`, `plan`, `policy check`, `apply`, `lock`은 모델이 아니라 결정론적 CLI가 수행한다.
- 필요하다면 Claude 전용 `router-explain` 또는 `router-audit` wrapper만 `context: fork`, `background: false`, read-only로 실험할 수 있다.
- forked agent는 기존 대화 이력을 받지 않으므로 사용자 예외·승인 의존 판단을 맡기지 않는다.
- background fork의 변경은 `/rewind`가 되돌리지 못하므로 `apply`, `remove`, 설정 병합에는 사용하지 않는다.
- 다른 하네스에서는 각자의 격리 실행 기능을 별도 평가하며 Claude frontmatter를 범용 규격처럼 복사하지 않는다.

## 7. 기억과 상태의 경계

```text
.planning/              GSD의 현재 프로젝트 실행 상태
.ecc/memory/            하네스 간 handoff와 회상용, 검토되지 않은 기억
docs/ai/                사람이 승인한 장기 규칙·설계·결정
.alpha-vibe/            설치 의도와 재현 가능한 lock
```

규칙:

1. Memory Vault 내용은 지시·정책·권한으로 취급하지 않는다.
2. 중요한 기억은 원문이나 코드로 검증한 뒤 governed docs로 승격한다.
3. GSD 상태를 Memory Vault에 복제해 두 개의 권위 원천을 만들지 않는다.
4. 한 작업에서 `.planning/`을 갱신하는 GSD 컨트롤러는 하나뿐이다.
5. 하네스 전환 시 handoff에는 완료 항목, 미완료 항목, 검증 증거, 다음 명령만 넣는다.

## 8. 보안과 품질 게이트

- ECC `security-review`는 일반 코드 리뷰가 아니라 위험 기반 보안 점검으로 제한한다.
- 인증/인가, 입력 처리, 비밀, 결제, 개인정보, 외부 명령 실행, 네트워크 경계가 바뀔 때 자동으로 “권고”하되 실제 실행 엔진은 하나만 선택한다.
- Claude Code 등 네이티브 보안 리뷰가 있는 하네스에서는 native 또는 ECC 중 하나를 router가 명시한다.
- 이 skill은 SAST, SCA, secret scanning, container scanning을 대체하지 않는다.
- AgentShield를 추가한다면 에이전트 설정·skill·hook·MCP 변경 PR을 검사하는 pinned CI 도구로만 사용한다.
- 외부 웹 콘텐츠와 Memory Vault 내용은 prompt injection 가능성이 있는 비신뢰 입력으로 취급한다.

## 9. 측정 계층

측정 계층을 Claude 결정서에서 채택한다. 단, 하네스별 범위를 분리한다.

### 9.1 Claude Code 진단과 대조군

| 명령 | 확인 대상 | 주의사항 |
|---|---|---|
| `/context` | system prompt, tools, MCP, agents, memory, skills, messages의 실제 점유 | `/context all`은 사용하지 않음 |
| `/skills` | project·user·plugin 출처, 실제 로드, `user-only` 상태 | `/context`에는 `/skills`와 범위가 다른 bundled 항목이 보일 수 있음 |
| `/mcp` | 연결 상태, 승인, tool 수 | `connected + 0 tools`는 실패 |
| `claude doctor` | 설치와 settings의 read-only 진단 | 자동 기준선 수집에는 이 명령 사용 |
| `/doctor` | 세션 내 상세 점검 | 수정 동작을 제안·수행할 수 있으므로 별도 승인 필요 |
| `/hooks`, `/permissions`, `/status` | 활성 hook, 해석된 권한, 설정 출처와 관리형 정책 | baseline과 구성 후 모두 저장 |

Claude Code의 커스터마이제이션 대조군은 다음과 같이 만든다.

```powershell
claude --safe-mode
```

`--safe-mode`는 CLAUDE.md, skills, plugins, hooks, MCP, custom commands/agents, auto memory 등 사용자·프로젝트 커스터마이제이션을 끄고 인증, 모델, 내장 도구, 권한은 유지한다. 현재 설치된 Claude Code `2.1.252`의 `claude --help`와 공식 CLI 문서에서 존재를 확인했다. 다만 관리형 정책과 외부 환경은 남을 수 있으므로 `/status`를 함께 기록한다. 이것은 **Claude Code 구성의 대조군**이며 7개 하네스 전체의 공통 기준선을 대신하지 않는다.

Windows 11 기본 절차에는 Claude 문서의 `/tmp` 예시나 별도 `CLAUDE_CONFIG_DIR` 조작을 넣지 않는다. `--safe-mode`로 문제가 분리되지 않을 때만 새 임시 디렉터리와 빈 config root를 사용한 2차 진단을 수행한다.

### 9.2 텔레메트리와 공통 지표

- **Claude Code OTel:** `CLAUDE_CODE_ENABLE_TELEMETRY=1` 기반 native OpenTelemetry로 세션, 토큰, 비용, tool activity를 수집한다. prompt·response·tool content 로깅은 기본 비활성 상태를 유지한다.
- **나머지 하네스:** 각 하네스가 제공하는 native status/usage 진단을 사용하고, 공통 비교 지표는 `alpha-vibe-stack` wrapper가 별도 기록한다. Claude OTel이 7개 하네스 전체를 관측한다고 가정하지 않는다.
- **공통 지표:** 완료 시간, 입력·출력 토큰과 비용(노출되는 경우), 도구 호출 수, MCP별 호출·실패·지연·비용, 잘못된 pack 활성화, 재작업 횟수, 검증에서 발견된 결함을 기록한다.
- **비교 방식:** 외부의 평균 비용 숫자를 합격선으로 삼지 않고, 같은 유형의 프로젝트를 설치 전/후 또는 기능 on/off로 A/B 비교한다.

Grafana는 필수가 아니라 OTel backend 선택지다. 특정 커뮤니티 dashboard ID를 아키텍처 의존성으로 고정하지 않는다.

## 10. 구성 준비와 설치 계획

이 문서는 설치 명세지만 아직 실제 사용자 전역 설정 변경을 승인하지 않는다. 구성은 한 번에 전량 설치하지 않고 아래 단계와 게이트를 통과한 항목만 다음 wave로 확장한다.

### 10.1 Phase 0 — inventory, 기준선, 복구점

1. 7개 하네스의 정확한 버전, 실행 파일, config root, skill/extension root, MCP 지원 방식과 현재 설치 목록을 read-only로 inventory 한다.
2. Node.js `>=24.0.0`, npm `>=10.0.0`, Git, PowerShell과 각 설치기의 선행 조건을 확인한다.
3. Claude Code `--safe-mode` 대조군과 현재 설정의 `/context`, `/skills`, `/mcp`, `/status`, OTel을 저장하고, 나머지 하네스의 native 진단과 공통 지표를 baseline으로 저장한다.
4. 변경 대상 설정은 적용 직전 사용자 로컬 snapshot으로 보존한다. snapshot은 비밀을 포함할 수 있으므로 저장소 밖의 제한된 로컬 경로에 두며 `.alpha-vibe/stack.lock.json`에는 경로·hash·복구 명령만 기록한다.

**산출물:** redacted inventory, baseline report, 변경 대상 목록, rollback plan.

**중단 게이트:** 선행 버전 미달, config root 불명, 기존 사용자 변경과 소유 경로 충돌, snapshot/rollback 검증 실패 중 하나라도 있으면 설치하지 않는다.

### 10.2 Phase 1 — 최소 제어면과 Claude 단일 레인 파일럿

1. `.alpha-vibe/stack.yaml`, `.alpha-vibe/stack.lock.json` schema와 `detect`, `plan`, `status`, `doctor`의 read-only 골격을 먼저 만든다.
2. Claude Code 한 곳에만 GSD Core `1.12.0` `standard`를 exact command로 설치한다.
3. `/skills`, `/hooks`, `/permissions`, `/context`, `claude doctor`로 실제 surface와 설정 diff를 검증한다.
4. 작은 fixture 프로젝트에서 discuss → plan → execute → verify → ship을 한 번 완주하고, 호출된 skill 본문 비용과 compaction 후 잔존량을 측정한다.

**중단 게이트:** `full` 오설치, 기존 hook/skill 덮어쓰기, native discovery 실패, GSD 상태 복구 실패, baseline 대비 품질 회귀가 있으면 다른 하네스로 확장하지 않는다.

### 10.3 Phase 2 — GSD 하네스별 확장

1. Codex → Antigravity → Pi 순서로 한 하네스씩 설치하고 매번 native discovery와 최소 GSD cycle을 확인한다.
2. 같은 fixture의 `.planning/` 상태를 읽을 수 있는지 검증하되, 단계 전이와 `STATE.md` 갱신은 매 시험마다 지정한 컨트롤러 하나만 수행한다.
3. Hermes에는 GSD를 설치하지 않고 native worker + handoff 소비자 경로만 준비한다.

**중단 게이트:** runtime 변환 결과가 예상 레이아웃과 다르거나 두 하네스가 동시에 state writer가 되는 경우 해당 하네스 확장을 되돌린다.

### 10.4 Phase 3 — MCP wave 배포

각 wave는 Claude Code에서 먼저 smoke test한 뒤 Codex, Antigravity GUI/CLI/IDE, Pi, Hermes로 한 하네스씩 확장한다.

1. Context7: library resolve와 read-only docs query.
2. Exa: 검색, 출처 URL, 인증 및 비용 식별.
3. Firecrawl: 단일 URL scrape부터 시작하고 승인 후 crawl/map 권한을 연다.

연결됨 표지만 보지 않고 tool 수가 0이 아닌지와 실제 read-only 호출을 확인한다. API 키는 환경·하네스 비밀 저장소에만 두고 manifest, lock, diff, 로그에는 넣지 않는다.

### 10.5 Phase 4 — ECC 글로벌 최소 기능

1. `ecc-universal@2.2.0` runtime과 `unified-memory`를 먼저 설치한다.
2. 서로 다른 두 하네스 사이에서 handoff 작성 → 조회 → 원문 검증 → governed docs 승격을 왕복 검증한다.
3. `documentation-lookup`, `deep-research`를 차례로 추가하고 Context7/Exa/Firecrawl과 역할이 겹치지 않는지 tool trace로 확인한다.
4. Claude Code의 제3자 ECC skill은 전역 `skillOverrides`에서 `user-invocable-only`로 시작한다. 자동 호출이 필요한 자작 wrapper만 좁은 description과 명시적 정책을 가진다.

**중단 게이트:** Memory Vault가 `.planning/`을 수정하거나, ECC skill이 GSD workflow를 재소유하거나, 연구 요청 하나에서 중복 엔진이 무조건 호출되면 해당 기능을 비활성화한다.

### 10.6 Phase 5 — 프로젝트 팩과 적용 제어면

1. `alpha-vibe-stack apply/remove`와 하네스 어댑터를 완성한다. 쓰기 명령은 항상 plan diff, 소유 경계 검사, snapshot, lock 갱신을 거친다.
2. WEB, API/DB, INFRA, AI, SECURITY, SCIENTIFIC 대표 fixture 저장소에서 탐지·dry-run·apply·native discovery·remove·rollback을 검증한다.
3. exact ECC version + file hash allowlist 안의 Markdown-only pack만 무인 적용한다. hook, MCP, rules, executable, 설정 병합은 계속 명시 승인을 요구한다.
4. Pi는 extension/CLI 어댑터, Hermes는 native/CLI 어댑터로 논리 기능을 노출한다.

### 10.7 Phase 6 — 실제 프로젝트 검수와 동결

1. 실제 brownfield 프로젝트 하나를 GSD discuss → plan → execute → verify → ship으로 완주한다.
2. §9 지표를 재측정하고 standard 유지 여부, pack 오탐, MCP 중복 호출, memory handoff 품질을 판정한다.
3. 합격한 exact version, hash, adapter와 설정 결과를 lock하고 release tag를 만든다.
4. Headroom, 외부 오케스트레이터, GSD surface 승격은 이 기본 구성이 동결된 뒤 별도 A/B 실험으로만 다룬다.

## 11. 완료 판정 기준

- [ ] Node.js `>=24.0.0`, npm `>=10.0.0`과 7개 하네스의 버전·config root가 redacted inventory에 기록되어 있다.
- [ ] 적용 전 snapshot과 실제 rollback이 적어도 한 fixture에서 성공하며 비밀이 저장소·lock·로그에 들어가지 않는다.
- [ ] GSD surface가 `standard`이며 full/ECC workflow 중복이 없다.
- [ ] GSD `1.12.0`의 exact version과 `--profile=standard`가 lock에 기록되고 프로필 생략 설치가 없다.
- [ ] Claude Code, Codex, Antigravity GUI/CLI/IDE, Pi, Hermes에서 Context7·Exa·Firecrawl이 각각 보이고 read-only 호출이 성공한다.
- [ ] 모든 하네스에서 MCP 연결 상태뿐 아니라 tool 수가 0이 아님을 확인한다.
- [ ] API 키가 저장소, 명령 기록, lock, 로그에 노출되지 않는다.
- [ ] Context7 → Exa → Firecrawl 역할 분리가 라우터 규칙과 skill 설명에 반영된다.
- [ ] Unified Memory handoff가 서로 다른 두 하네스 사이에서 왕복된다.
- [ ] Memory Vault가 `.planning/` 또는 governed docs의 권위를 침범하지 않는다.
- [ ] AI SDK가 있는 fixture에서 필요한 AI pack이 자동 계획되고, 일반 `AGENTS.md`만 있는 저장소에서는 오탐하지 않는다.
- [ ] 허용된 동일 version/hash의 Markdown pack은 무인 적용되고, hash 변경 시 차단된다.
- [ ] Agent Skills 대상의 설치 팩은 `<name>/SKILL.md` 구조로 배포되고 native 목록과 `alpha-vibe-stack doctor`에 나타난다.
- [ ] 지속 설치한 도구함은 하네스별 manual-only 정책이 검증된다. Claude Code 제3자 skill은 `skillOverrides: "user-invocable-only"`를 우선 사용해 upstream hash를 보존한다.
- [ ] Claude Code의 글로벌 `skillOverrides`는 `%USERPROFILE%\.claude\settings.json`에 있고 프로젝트별 UI 설정과 혼동되지 않는다.
- [ ] Claude Code에서 실제 호출된 GSD/ECC skill 본문과 compaction 후 잔존량을 `/context`로 측정했으며 description 비용만으로 프로필을 판정하지 않는다.
- [ ] 범용 router의 detect/plan/apply는 `context: fork`나 LLM 추론에 의존하지 않는다.
- [ ] GSD 내부 병렬화와 외부 병렬화가 같은 작업에서 중첩되지 않는다.
- [ ] Hermes가 GSD state writer로 동작하지 않는다.
- [ ] Pi에서 Markdown skill 탐색을 기대하지 않고 extension/CLI 경로가 검증된다.
- [ ] ECC `security-review`가 글로벌 상주하지 않으며 위험 증거가 있을 때 한 엔진만 선택된다.
- [ ] Claude `--safe-mode` 대조군, 현재 구성의 `/context`·`/skills`·`/mcp`·`/status`, OTel, 공통 wrapper 지표의 설치 전후 비교가 기록되어 있다.

## 12. 이번 기본 구성에서 보류·재검토하는 것

- Headroom: 기본 스택에 넣지 않고 별도 A/B 파일럿으로 평가한다.
- 외부 worktree/Kanban 오케스트레이터: 다중 프로젝트 동시 운용이 실제 병목일 때만 검토한다.
- gstack 전체, superpowers 전체, ECC profile 전체: GSD와 워크플로우 소유권이 충돌하므로 제외한다.
- 언어별 ECC rules pack: 폴리글랏 요구와 상시 컨텍스트 비용 때문에 기본 제외한다.
- GSD full surface: standard에서 실제 결손이 측정될 때 cluster 단위로만 승격한다.
- `architecture-decision-records`: Q8 = E에 따라 기본 제외한다. 다만 GSD 파일럿에서 기존 설계 취지나 규제 제약이 반복해서 유실되면 `docs/ai/`와 GSD 산출물만으로 부족하다는 증거이므로 가장 먼저 재검토한다.

## 13. Claude 결정서와의 교차 검증 판정

### 13.1 서로 동의한 부분

- Open GSD의 GSD Core와 `standard` 프로필을 워크플로우 척추로 사용한다.
- GSD가 discuss/plan/execute/verify/ship과 `.planning/`을 소유하고, 한 작업의 GSD state writer는 하나뿐이다.
- 작은 작업은 하네스 네이티브 레인으로 처리하고, 같은 작업에서 병렬화 주체를 중첩하지 않는다.
- ECC profile 설치를 금지하고 individual skill만 선택 설치한다.
- 글로벌 연구·기억 skill은 `unified-memory`, `documentation-lookup`, `deep-research`로 최소화한다.
- `inherit-legacy-style`은 brownfield 1회성 pack이며 `config-gc`는 도구함이다.
- pack 탐지는 LLM 판단이 아니라 파일·의존성 증거를 읽는 결정론적 CLI가 담당한다.
- Pi는 extension/CLI 어댑터를 사용하고, Hermes는 GSD state writer가 아니다.
- Memory Vault는 unreviewed context이며 승인된 지식은 `docs/ai/`로 승격한다.
- API 키를 저장소·lock·로그에 남기지 않고 하네스별 read-only smoke test로 MCP 연결을 판정한다.
- Headroom, 외부 오케스트레이터, GSD full surface는 기본 구성에서 보류한다.

### 13.2 달랐던 부분과 판정

| 쟁점 | 판정 | 최종 반영 |
|---|---|---|
| GSD 제품·프로필 | 합의 | Open GSD `gsd-core` + `standard` |
| GSD 현재 버전 | Claude가 맞음 | npm 직접 확인한 `1.12.0`을 최초 구현 버전으로 고정 |
| ECC 선택 설치·프로필 금지 | 합의 | 개별 skill만 설치, `ecc-universal@2.2.0` 고정 |
| 글로벌 ECC 개수 | Claude가 맞음 | 3개 + router. `security-review`는 위험 기반 논리 기능/팩 |
| MCP 최종 범위 | Codex 결정서와 사용자 확정이 맞음 | Context7·Exa·Firecrawl을 7개 하네스 모두에 연결 |
| MCP 적용 방식 | Claude의 운영 방식이 맞음 | 최종 범위는 유지하되 Context7 → Exa → Firecrawl wave 배포 |
| Q11 의미 | 이전 Claude v2는 틀렸고 v3에서 정정 | 사용자가 확정한 3개 MCP × 7개 하네스, wave 배포 |
| 측정 계층 | Claude가 맞음 | 독립 계층으로 채택하되 Claude 전용과 공통 지표를 분리 |
| `/context all` | Codex 지적을 Claude v3가 수용 | 공식 Claude Code 문서에 확인되는 `/context` 사용 |
| Grafana 특정 ID·외부 비용 기준 | Codex 지적을 Claude v3가 수용 | 선택 가능한 backend로만 두고 프로젝트 자체 A/B를 판정 기준으로 사용 |
| ADR | Claude의 재검토 조건이 타당 | 기본 제외, 설계·규제 유실 재발 시 우선 검토 |
| Spec Kit 단일 벤치마크의 일반화 | 근거 부족 | 이 스택의 기대 성능 수치로 사용하지 않음 |

### 13.3 Claude v3의 신규 기여와 최종 판정

| 신규 항목 | 판정 | 최종 반영 |
|---|---|---|
| `claude --safe-mode` | 채택 | Claude 전용 clean-customization 대조군. 관리형 정책이 남을 수 있어 `/status` 병기 |
| `CLAUDE_CONFIG_DIR` + `/tmp` | 조건부 채택 | Windows 기본 절차에서는 제외하고 2차 장애 격리에서만 OS 임시 경로 사용 |
| `disable-model-invocation: true` | 취지는 채택, 구현 정밀화 | 자작 skill에는 frontmatter, 제3자 ECC skill에는 hash 보존을 위해 `skillOverrides` 우선 |
| `/skills`·`/mcp`·`/doctor` 등 진단 | 채택 | 파일 존재가 아니라 native discovery와 실제 로드로 판정. 자동 진단은 read-only `claude doctor` 사용 |
| `<name>/SKILL.md` 구조 | 채택 | Agent Skills 대상 어댑터의 필수 검증 계약으로 추가 |
| `connected + 0 tools` 진단 | 채택 | reconnect → MCP debug → 비밀 제거 순서로 운영 |
| 권위 문서 단일화 | 채택 | 이 문서를 유일한 구현 명세로 지정하고 Claude 문서는 검토 기록으로 유지 |

### 13.4 Claude v4의 이관 요청 6건과 사실 검증

| 이관 항목 | 판정 | 최종 반영 |
|---|---|---|
| GSD 변종 비교 | 채택·현재값 재확인 | §3.1에 선택 근거를 추가. star 수는 시점성 참고값으로만 사용 |
| 정확한 GSD 설치 명령 | 채택·정정 | `1.12.0`, `--profile=standard`를 명시. `--skills-dir`, `--agent-file`은 GSD installer 옵션이 아니므로 제외 |
| ECC installer 플래그 | 채택·Windows 경로 정밀화 | §5.4에 `--target`, `--skills`, `--dry-run`, `--json`과 PowerShell 우선 경로를 명시 |
| `skillOverrides` 4개 값 | 채택·scope 정밀화 | §5.3에 네 값을 모두 기록. `/skills` 저장은 project-local이고 글로벌 정책은 user settings에 명시 |
| 호출된 skill 본문 상주 | 채택·과장 정정 | §5.5에 동일 재호출, 동적 출력, compaction의 5K/25K 한계를 포함한 실제 lifecycle을 기록 |
| `context: fork` | 기능은 채택, router 기본안은 기각 | §6.2에 Claude 전용 read-only 설명/감사 wrapper로만 허용. 결정론적 적용 경로에는 사용하지 않음 |

추가로 GSD `1.12.0`은 Hermes installer를 기술적으로 제공한다. Hermes 제외는 “미지원” 판정이 아니라 이 구성의 단일 state writer 정책 선택으로 정정했다.

## 14. 문서 권위와 변경 관리

1. 설치 스크립트, manifest, lock, acceptance test는 이 문서를 참조한다.
2. `alpha-vibe-stack-claude.md`는 삭제하지 않고 교차 검증 근거로 보존한다. 다만 구현 중 새 결정을 두 문서에 각각 기록하지 않는다.
3. 새 결정은 이 문서의 버전과 변경 근거를 갱신한 뒤 `.alpha-vibe/stack.lock.json`에 구현 버전을 연결한다.
4. GSD, ECC, 각 하네스 또는 MCP의 버전이 바뀌면 관련 주장만 재검증하고 전체 profile을 암묵적으로 승격하지 않는다.

## 15. 근거 자료

- [GSD Core 설치 및 runtime별 변환](https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/install-on-your-runtime.md)
- [GSD Core profile과 surface 관리](https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/install-minimal-and-add-skills.md)
- [GSD Core package manifest](https://github.com/open-gsd/gsd-core/blob/next/package.json)
- [GSD Core npm package](https://www.npmjs.com/package/@opengsd/gsd-core)
- [Buildomator](https://github.com/buildomator/buildomator)
- [GSD OpenCode](https://github.com/rokicool/gsd-opencode)
- [GSD Pi](https://github.com/open-gsd/gsd-pi)
- [아카이브된 GSD 원본](https://github.com/gsd-build/get-shit-done)
- [ECC 저장소와 선택 설치·Memory Vault 개요](https://github.com/affaan-m/ECC)
- [ECC Universal npm package](https://www.npmjs.com/package/ecc-universal)
- [ECC install modules manifest](https://github.com/affaan-m/ECC/blob/main/manifests/install-modules.json)
- [ECC Windows installer](https://github.com/affaan-m/ECC/blob/main/install.ps1)
- [ECC Unix/Git Bash installer](https://github.com/affaan-m/ECC/blob/main/install.sh)
- [ECC Unified Memory skill](https://github.com/affaan-m/ECC/blob/main/skills/unified-memory/SKILL.md)
- [ECC Security Review skill](https://github.com/affaan-m/ECC/blob/main/skills/security-review/SKILL.md)
- [ECC Documentation Lookup skill](https://github.com/affaan-m/ECC/blob/main/skills/documentation-lookup/SKILL.md)
- [ECC Deep Research skill](https://github.com/affaan-m/ECC/blob/main/skills/deep-research/SKILL.md)
- [OpenAI 공식 Codex MCP 문서](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [OpenAI 공식 Codex skill 문서](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code 공식 context 진단 문서](https://code.claude.com/docs/en/debug-your-config)
- [Claude Code 공식 skill 및 invocation 제어 문서](https://code.claude.com/docs/en/skills)
- [Claude Code 공식 settings 및 skillOverrides 문서](https://code.claude.com/docs/en/settings-reference)
- [Claude Code 공식 CLI 문서 (`--safe-mode`, `--debug`, `claude doctor`)](https://code.claude.com/docs/en/cli-reference)
- [Claude Code 공식 OpenTelemetry 문서](https://code.claude.com/docs/en/monitoring-usage)
- [Context7 공식 MCP client 설정](https://github.com/upstash/context7/blob/master/docs/resources/all-clients.mdx)
- [Exa 공식 MCP server](https://github.com/exa-labs/exa-mcp-server)
- [Firecrawl 공식 MCP 안내](https://docs.firecrawl.dev/ai-onboarding)

---

최종 구조를 한 문장으로 요약하면 다음과 같다.

> GSD Core standard가 프로젝트 실행과 상태를 독점하고, ECC는 기억·문서·연구와 위험 기반 보안 팩만 제공하며, Context7·Exa·Firecrawl은 모든 하네스에 wave 배포한 뒤 역할별로 단일 라우팅한다.
