# alpha-vibe 에이전트 환경 구성안 (Claude 측 최종안)

- 상태: **v4 — 검토 기록 (ARCHIVE). 구현 명세 아님.**
- **권위 문서는 `alpha-vibe-stack-codex.md`다.** 설치·변경·검수는 그 문서만 기준으로 한다.
- 이 문서의 역할: 결정에 이른 경위, 폐기된 대안, 교차 검증에서 정정된 오류의 기록. 구현 중 새 결정을 여기에 기록하지 않는다.
- **§13의 이관 대상 6건이 권위 문서에 반영되기 전까지는 그 항목에 한해 이 문서를 참조한다.**
- 최초 2026-08-31 · v2 2026-09-01 · v3 2026-09-01 · v4 2026-09-01
- 대상 OS: Windows 11
- 대상 하네스: Claude Code, Codex, Antigravity GUI/IDE/CLI, Pi Agent, Hermes Agent

## 개정 이력

### v1 → v2 (Codex v1 교차 검증, 6건 정정)

| 항목 | v1 | v2 | 사유 |
|---|---|---|---|
| `context-budget` | 글로벌 | 제외 | MCP tool search 기본 활성 구조를 모델링 못함 |
| `documentation-lookup`, `deep-research` | 제외 | 글로벌 | Q9 = B,C,D 반영 전이었음 |
| `architecture-decision-records` | 글로벌 | 제외(재검토 예약) | Q8 = E |
| `inherit-legacy-style` | 글로벌 상주 | 1회 실행 후 제거 | 상시 비용 0, 산출 문서는 Pi·Hermes도 읽음 |
| `config-gc` | 글로벌 | 도구함 | 삭제 동작을 자동 발동 가능하게 두면 위험 |
| 팩 탐지 조건 | `AGENTS.md` 존재 | 실제 SDK 증거 | 원안은 GSD/ECC 사용 저장소 전부에서 오탐 |

### v2 → v3 (Codex v2 교차 검증, 3건 정정 + 4건 신규 기여)

| 항목 | v2 | v3 | 사유 |
|---|---|---|---|
| `/context all` | 실행 명세에 사용 | **`/context`** | 공식 문서에 `all` 인자 없음. `/context` 하나가 이미 전 카테고리를 분해 |
| Grafana #25052 | 지정 대시보드 | **선택 가능한 OTel backend** | 커뮤니티 대시보드 ID를 아키텍처 의존성으로 고정하지 않음 |
| 외부 비용 기준선 | 비교 기준으로 인용 | **프로젝트 자체 A/B가 판정 기준** | 외부 평균을 합격선으로 쓰지 않음 |
| 연구 MCP 범위 | Context7부터 단계적, 최종 범위 미정 | **최종 범위는 3종 × 7 하네스, wave 배포** | 사용자가 Codex 채널에서 Q11을 명시 확정. 내 이견은 *범위*가 아니라 *검증 절차*였고 §4.4 wave가 그것을 수용 |
| — | — | **신규:** `claude --safe-mode` 기준선 | 전 커스터마이제이션 비활성 세션 = 진짜 대조군 |
| — | — | **신규:** `disable-model-invocation: true` | 도구함을 "자동 발동 불가"로 강제하는 실제 메커니즘 |
| — | — | **신규:** `/skills`·`/mcp`·`/doctor` 검증 절차 | 설치 결과를 파일 존재가 아니라 로드 여부로 판정 |
| — | — | **신규:** skill 폴더 구조 요구사항 | `name.md`가 아니라 `name/SKILL.md`. 팩 배포 시 실패 원인 1순위 |

---

## 0. 배경 — 폐기한 구성과 그 이유

기존: `gstack + gsd + superpowers`

기대는 "GSD 워크플로우만 돌려도 나머지가 자동 결합"이었으나 실제 동작은 다르다. Skill은 오케스트레이션으로 조합되지 않고 **설명문 유사도 매칭**으로 선택된다. 세션 시작 시 `name` + `description`만 로드되고 본문은 매칭될 때만 읽힌다. GSD의 `execute-phase`가 superpowers의 `test-driven-development`를 호출한다는 보장이 없으며, GSD의 지시가 구체적일수록 다른 skill의 자동 발동은 오히려 억제된다.

공식 문서도 같은 실패 모드를 명시한다 — *"Skill appears in `/skills` but Claude never invokes it: 설명이 요청 문구와 맞지 않음."*

### 3종 구성의 충돌 지도

| 레이어 | gstack | GSD | superpowers | 상태 |
|---|---|---|---|---|
| 발의·기획 | `/office-hours`, `/plan-ceo-review` | `new-project`, `discuss-phase` | `brainstorming` | 3중 충돌 |
| 계획 | `/plan-eng-review` | `plan-phase` | `writing-plans` | 3중 충돌 |
| 실행 | — | `execute-phase` | `executing-plans`, TDD | 2중 충돌 |
| 검증 | `/qa` | `verify-work` | `verification-before-completion` | 3중 충돌 |
| 리뷰 | `/review` | 내장 에이전트 | code-review | 3중 충돌 |
| 상태 지속 | ✗ | `.planning/`, `STATE.md` | ✗ | GSD 단독 |
| 실제 앱 QA | `/browse`, `/qa` | ✗ | ✗ | gstack 단독 |
| 프로젝트 간 기억 | ✗ | ✗ | ✗ | 전부 공백 |

---

## 1. 아키텍처 원칙

> **GSD는 큰 작업 레인을 소유하고, ECC는 GSD가 돌지 않는 작은 작업 레인과 프로젝트별 능력만 공급한다.**

- **레인 A (작은 작업)** — 명확한 버그 수정, 소수 파일 변경, 문서 수정, acceptance criteria가 이미 분명한 작업
  → GSD 의례 없이 하네스 네이티브(`/code-review`, `/security-review`, `/simplify`)
- **레인 B (큰 작업)** — 요구사항 모호, 다중 모듈, 여러 세션·하네스에 걸침, 단계별 UAT 필요
  → GSD가 상태와 요구사항 검증을 끝까지 소유

### 단일 소유권

| 동사 / 상태 | 소유자 |
|---|---|
| discuss / plan / execute / verify / ship | GSD |
| `.planning/` 단계 상태 | 현재 활성 GSD 컨트롤러 **1개** |
| 하네스 간 임시 인계 | ECC Unified Memory |
| 승인된 설계·규칙·결정 | 저장소의 `docs/ai/` |
| 라이브러리·API 문서 | Context7 |
| 출처 발견·범용 웹 검색 | Exa |
| 알려진 URL 추출·크롤링 | Firecrawl |
| 앱 보안 점검 | 한 실행에서 네이티브 **또는** ECC 중 하나 |
| 에이전트 설정 보안 | AgentShield (pinned CI 전용) |
| 컨텍스트 실측 | `/context` + OTel |

**병렬화 규칙:** 한 작업 단위에서 병렬화 주체는 하나. GSD 레인 안에서는 GSD가 병렬화를 소유하고, 외부 오케스트레이터는 프로젝트당 GSD 실행을 단일 레인으로 제한한다.

---

## 2. GSD (확정)

`open-gsd/gsd-core` — npm **`@opengsd/gsd-core@1.12.0`** (2026-08-30 배포, 2026-09-01 재확인), **`standard` 프로필**

### 변종 비교 (2026-08-31 실측)

| 저장소 | Stars | 상태 | 마지막 커밋 | 하네스 |
|---|---|---|---|---|
| **`open-gsd/gsd-core`** | 8,945 | 활성, MIT | 2026-08-30 | 문서화된 런타임 17개 |
| `gsd-build/get-shit-done` (원본) | 64,618 | **아카이브** | 2026-05-31 | 사실상 Claude Code |
| `buildomator` | 86 | 활성 | 2026-08-07 | Claude Code 전용 |
| `rokicool/gsd-opencode` | 824 | 방치, 라이선스 없음 | 2026-05-16 | OpenCode 전용 |
| `open-gsd/gsd-pi` | 1,183 | 활성, MIT | 2026-08-31 | **별도 에이전트** (`.gsd/` 상태) |

원본의 64,618 stars는 과거 인기이지 현재 품질이 아니다. 아카이브는 버그·보안 수정이 영구 중단된다.

### 프로필 — `standard` 확정

| 프로필 | 설명 토큰 | 내용 |
|---|---|---|
| `core` | ~130 | core-loop 8개. **subagent 없음** |
| **`standard`** | **~700** | + onboarding, review, config, progress, pause/resume, workspace + 필요한 subagent |
| `full` | ~1,200 | 전체 — ECC·네이티브와 재중복하므로 기본값 아님 |

`core`는 subagent가 없어 GSD의 핵심 장점인 fresh-context 실행을 온전히 쓸 수 없다. 폴리글랏 브라운필드 저장소와 다중 하네스 인계를 다루는 이 환경에서는 `standard`가 시작점이다.

`/gsd-surface`로 사후 조절한다. 클러스터 10개: `core_loop`, `audit_review`, `milestone`, `research_ideate`, `workspace_state`, `docs`, `ui`, `ai_eval`, `ns_meta`, `utility`.

`@latest`를 실행 명세에 남기지 않는다. 설치일이 다르면 최신 버전을 재확인하되 검증한 버전만 lock에 기록한다.

### 하네스별 설치 (플래그 실측 확인)

| 하네스 | 명령 | 주의 |
|---|---|---|
| Claude Code | `npx @opengsd/gsd-core@1.12.0 --claude --global` | 글로벌/로컬 중복 설치 회피, hook 상태 검사 |
| Codex | `npx @opengsd/gsd-core@1.12.0 --codex --global` | `~/.codex/config.toml`은 **데스크톱 앱·CLI·IDE 확장이 공유** |
| Antigravity GUI/IDE/CLI | `npx @opengsd/gsd-core@1.12.0 --antigravity --global` | **단일 통합 경로**, config 디렉토리 auto-detect. 세 변형을 각각 smoke test |
| Pi | `npx @opengsd/gsd-core@1.12.0 --pi --global` | `~/.pi/agent/extensions/gsd.js` **extension 전용**. 마크다운 skill 자동탐색 없음 |
| **Hermes** | — | **문서화된 설치 대상 아님.** `.planning/`을 읽는 worker/네이티브 레인으로만 참여, 상태를 소유하지 않음 |

기타 확인된 플래그: `--global`, `--local`, `--config-dir`, `--skills-dir`, `--uninstall`, `--portable-hooks`, `--agent-file`.

---

## 3. ECC 선별

### 원칙

**프로필 단위 설치 금지.** `minimal`조차 `rules-core, agents-core, commands-core, platform-configs, workflow-quality`를 끌어오고, `workflow-quality`는 skill 경로 47개(`tdd-workflow`, `verification-loop`, `continuous-learning` v1/v2, `council`, `dev-team`, `plan-canvas`, `e2e-testing`, `production-audit` 등)를 포함한다. 이름만 minimal이고 GSD와 정면 충돌하는 품질 OS가 통째로 딸려온다.

→ **개별 `--skills` 설치만 사용.**

인스톨러 실측 확인:

```
--target claude          → ~/.claude/ (글로벌)
--target claude-project  → ./.claude/ (프로젝트 로컬, rules/ecc + flat skills/)
--skills <id,id,...>     → skill 디렉토리 개별 설치
--dry-run                → 복사 없이 계획만
--json                   → 기계 판독 출력
```

`install.sh`는 MSYS2/Git Bash 경로 변환을 명시적으로 처리한다 (Windows 지원 확인).

**runtime:** `ecc-universal@2.2.0` (2026-08-27 배포, npm 확인). Unified Memory는 skill 파일만으로 동작하지 않으므로 이 CLI runtime을 별도 설치하고 버전을 고정한다.

**skill 폴더 구조:** `.claude/skills/<name>/SKILL.md`. `.claude/skills/<name>.md`는 로드되지 않는다. 팩 배포 스크립트가 이 구조를 지키는지 반드시 검증한다.

### 3.1 글로벌 — ECC 3개 + 자작 라우터 1개

| 기능 | skill | 실행 정책 |
|---|---|---|
| 하네스 간 기억 | `unified-memory` | `ecc-universal@2.2.0`을 공통 원본으로. 기억은 **unreviewed context**로 취급, 지시·정책으로 승격 금지 |
| 최신 문서 조회 | `documentation-lookup` | Context7가 건강할 때만. 공식 문서 우선 |
| 심층 조사 | `deep-research` | Exa로 발견, 필요 시 Firecrawl로 추출. 원문 URL·발행 주체 인용 필수 |
| 결정론적 팩 공급 | `ecc-pack-router` (자작) | **LLM이 팩을 추론하지 않는다.** `alpha-vibe-stack` CLI 결과만 설명·호출 |

`security-review`는 글로벌 상주에서 제외한다. ECC 원문 description이 인증·입력·비밀뿐 아니라 **새 API endpoint와 서드파티 API 연동까지** 자동 활성화 대상으로 잡아 범위가 너무 넓다. 대신 `SECURITY_REVIEW` 팩으로 두고, 라우터가 아래 위험 증거를 확인한 작업에서만 **네이티브 보안 리뷰 또는 ECC 중 하나**를 선택한다.

- 인증·인가, 사용자 입력·파일 업로드
- 비밀·결제·개인정보·민감 데이터
- 외부 명령 실행, 네트워크 신뢰 경계, 새 공개 API endpoint
- 위험한 역직렬화, 권한 모델, 보안 관련 인프라 변경

"글로벌 논리 기능"과 "모든 대상에 동일 마크다운 파일 설치"는 다르다. 마크다운 skill을 지원하는 하네스에는 선택 설치하고, Pi에서는 extension이 CLI를 호출한다. 네이티브 기능이 더 강한 경우 라우터가 네이티브를 선택하고 ECC 중복 실행을 막는다.

### 3.2 프로젝트 팩

| 팩 | 결정론적 탐지 증거 | 설치 skill |
|---|---|---|
| `BROWNFIELD_INIT` | 기존 소스 존재 + 표준 conventions 문서 없음 | `inherit-legacy-style` **1회 실행 → `docs/ai/CONVENTIONS.md` 산출 → 제거** |
| `WEB_BASE` | 웹 프레임워크 의존성 + 브라우저 진입점/route 증거 | `browser-qa`, `accessibility` |
| `WEB_REACT` | React 또는 Next.js 의존성 | `frontend-a11y` |
| `WEB_FLOW_AUDIT` | manifest에 critical user flow 선언 | `click-path-audit` |
| `API` | FastAPI/Django REST/Express/Nest 등 서버 프레임워크, OpenAPI, route/controller 증거 | API 공통 검증 항목. **"프론트가 없음"으로 판정하지 않음** |
| `DB_MIGRATION` | migration 디렉토리 또는 ORM migration 설정 | `database-migrations` |
| `DB_POSTGRES` | PostgreSQL driver/DSN/config 증거 | `postgres-patterns` |
| `CACHE_REDIS` | Redis client/DSN/config 증거 | `redis-patterns` |
| `CONTAINER` | `Dockerfile`, Compose 파일 | `docker-patterns` |
| `DEPLOYMENT` | 실제 deploy/release/publish workflow, K8s/Terraform | `deployment-patterns` |
| `MCP_SERVER` | MCP SDK 의존성 또는 MCP server manifest | `mcp-server-patterns` |
| `AGENT_RUNTIME` | **실제 agent SDK/runtime 의존성** | `agent-harness-construction` |
| `AI_EVAL` | 모델 SDK + eval 데이터/config/test 증거 | `ai-regression-testing`, `eval-harness` |
| `SECURITY_REVIEW` | §3.1 위험 증거 또는 manifest opt-in | 네이티브 보안 리뷰가 없거나 명시적으로 ECC를 선택한 대상에만 `security-review` |
| `RESEARCH_SCIENTIFIC` | manifest opt-in 또는 명시적 과학·논문·특허 조사 | `scientific-db-pubmed-database`, `scientific-db-uspto-database`, `scientific-thinking-literature-review`, `scientific-thinking-scholar-evaluation` |

**`AGENTS.md`나 `.claude/skills/`의 존재만으로 `AGENT_RUNTIME`을 활성화하지 않는다.** 일반 저장소에도 흔하고, GSD·ECC를 쓰는 저장소 전부에서 오탐한다. 실제 SDK·설정·평가 자산 같은 양성 증거가 있어야 한다.

### 3.3 도구함 (설치하지 않고 필요할 때만 실행)

`config-gc`, `skill-comply`, `skill-stocktake`, `workspace-surface-audit`

**강제 메커니즘:** 도구함 skill을 굳이 설치하는 경우 frontmatter에 `disable-model-invocation: true`를 넣는다. `/skills`에서 "user-only" 배지로 표시되고 모델이 스스로 발동할 수 없다. `config-gc`처럼 설정을 삭제하는 동작에는 이 플래그가 사실상 필수다.

### 3.4 제외 목록

| 대상 | 근거 |
|---|---|
| `context-budget` | MCP tool search가 기본 활성인 현 구조를 모델링하지 못하는 Claude 중심 휴리스틱. `/context`가 권위 있는 원본 |
| `framework-language` 69개 전량 | 폴리글랏(TS/Python/JVM/Go/Rust/C++/셸) → 20개+ 필요. formatter·linter·type checker·test·CI가 권위 |
| `tdd-workflow`, `verification-loop`, `plan-canvas`, `intent-driven-development`, `delivery-gate` | GSD 정면 중복 |
| `git-workflow`, `dev-team`, `council*`, `codebase-onboarding`, `code-tour`, `product-lens` | GSD 또는 네이티브 레인과 중복 |
| `continuous-learning` v1/v2, instincts/evolve/promote 계열 | 일회성 우회나 과거 제약을 새 프로젝트의 보편 규칙으로 전파할 위험 |
| `architecture-decision-records`, `living-docs-governance`, `contract-first` | Q8 = E. **§8 재검토 조건 참조** |
| `search-first` | Context7·Exa·Firecrawl 라우팅과 중복 |
| `cost-tracking` | ECC hook 의존 계측 대신 §7의 네이티브 OTel + 공통 wrapper 지표 |
| `codehealth-mcp`, `repo-scan` | 외부 서비스·외부 저장소 의존성을 기본 표면에 추가하지 않음 |
| `windows-desktop-e2e` | WPF/WinForms/Qt 등 Windows 네이티브 데스크톱 프로젝트에서만 별도 팩 후보 |
| `gateguard`, `safety-guard` | Q6에서 C 미선택. 실제 결손이 증명될 때 재검토 |
| ECC agents, legacy command shims, hooks-runtime, rules-core 전량 | 프로필 단위 도입 금지 원칙 |
| `production-audit`를 모든 GSD verify에 자동 결합하는 구성 | 검증 소유권 이중화 |

---

## 4. 연구 MCP

**최종 범위:** Context7 + Exa + Firecrawl을 7개 하네스 전부에 연결 (사용자 확정).

| MCP | 전담 역할 | 사용 조건 |
|---|---|---|
| Context7 | 버전별 라이브러리·프레임워크·API 문서와 예제 | 구현이 외부 라이브러리의 현재 동작에 의존할 때 |
| Exa | 다중 출처 탐색, 최신 웹 검색, 후보 출처 발견 | 조사 질문, 비교, 최신 동향, 출처 목록이 필요할 때 |
| Firecrawl | 단일 URL 정제, JS 사이트 추출, map/crawl, 구조화 추출 | 읽어야 할 URL 또는 크롤링할 사이트가 정해졌을 때 |

연결은 가용성이고 호출은 라우팅 규칙에 따른다. 항상 연결돼 있어도 매 작업에서 셋을 모두 호출하지 않는다.

### wave 배포

21개 연결을 한 번에 바꾸지 않는다. Codex CLI의 로컬 MCP 지원과 CLI·IDE 설정 공유는 공식 문서로 확인되지만, **모든 하네스의 tool schema 지연 로딩은 보장되지 않는다.** 이 불확실성은 범위 축소가 아니라 하네스별 검증을 요구하는 근거다.

1. Context7을 7개 하네스에 순차 연결 → tool discovery, 인증, 문서 조회 검증
2. Exa 순차 연결 → 검색, 원문 URL 반환, 비용 식별자 검증
3. Firecrawl 순차 연결 → **단일 URL scrape만 먼저** 검증한 뒤 crawl/map 허용
4. 각 wave에서 실패한 하네스만 중단·수정하고, 통과한 하네스의 연결은 되돌리지 않는다

### 라우팅

```
질문 분류
  ├─ 라이브러리/API 문서 ──> Context7 ──> 공식 문서 확인
  ├─ 일반/최신 조사 ───────> Exa ───────> 후보 출처 선별
  │                                      └─ 본문 필요 ──> Firecrawl
  └─ 알려진 사이트 추출 ───> Firecrawl ──> 원문·구조화 데이터
```

- 이미 알려진 URL 한둘의 본문이 목적이면 Exa를 거치지 않고 Firecrawl
- 논문·특허의 최종 사실 확인은 PubMed·Crossref·DOI 원문·USPTO 등 1차 DB로 되돌아간다
- **어떤 MCP의 요약도 그 자체를 최종 출처로 인용하지 않는다**

### 비밀 관리

- user scope 기본. 키·토큰을 저장소에 기록하지 않는다
- 가능하면 remote HTTP + OAuth. 불가능한 하네스만 환경 변수 또는 OS 비밀 저장소
- API 키를 명령 인자, 커밋 파일, lock, 로그에 넣지 않는다
- **Firecrawl의 키 포함 remote URL은 그 URL 자체가 비밀**이다. 로그·스크린샷·진단 번들에 남기지 않고, 가능하면 stdio + `FIRECRAWL_API_KEY`
- 비용 추적이 필요하면 하네스별 키를 발급한다
- 하네스마다 독립적인 MCP 클라이언트 연결을 구성한다. "모든 하네스 연결"이 하나의 MCP 프로세스에 동시 접속한다는 뜻이 아니다
- **설치 완료 판정은 설정 파일 존재가 아니라 `/mcp`에서 connected 확인 + read-only 호출 1회 성공**
- 공급자 장애 시 네이티브 검색 또는 공식 사이트 직접 조회로 폴백하고, 결과에 폴백 사실을 남긴다

> `/mcp`에서 **connected인데 tool이 0개**로 나오면 서버는 떴지만 tool list를 반환하지 않은 것이다. Reconnect 후에도 0이면 `claude --debug=mcp`로 `~/.claude/debug/<session-id>.txt`의 stderr를 읽는다.

---

## 5. 결정론적 라우터

권위는 LLM skill이 아니라 `alpha-vibe-stack` CLI에 둔다.

```
detect -> plan -> policy check -> apply -> lock -> status/doctor
```

```
alpha-vibe-stack detect
alpha-vibe-stack plan
alpha-vibe-stack apply
alpha-vibe-stack status
alpha-vibe-stack doctor
alpha-vibe-stack remove <pack>
```

저장소에 커밋할 파일:

```
.alpha-vibe/stack.yaml       # 선택한 pack, 자동 적용 정책, 예외
.alpha-vibe/stack.lock.json  # GSD/ECC 정확 버전, skill 목록, 대상, 파일 hash, 탐지 증거
```

생성된 하네스별 skill 복사본은 gitignore하고 manifest와 lock만 커밋한다. 단 `.claude/`, `.codex/`, `.agents/` 전체를 광범위하게 ignore하지 않고 **라우터가 소유한 하위 경로만** 정확히 제외한다.

### 자동 설치 정책

Q5의 "프로젝트마다 수동 설치 없이 자동 사용" 요구는 다음으로 충족한다.

- 탐지와 install plan 생성은 항상 자동
- 순수 마크다운 skill 팩은 **사용자가 한 번 승인한 exact version + file hash allowlist** 안에서 자동 적용
- 버전 또는 hash가 바뀌면 자동 적용 중단하고 새 diff 승인 요구
- hook, MCP, rules, agent executable, 설정 파일 병합은 **항상 별도 확인**
- 탐지 증거가 사라져도 자동 삭제하지 않고 stale로 표시. 제거는 명시 명령으로만
- 모든 적용은 dry-run diff를 생성하고 lock에 기록
- 적용 후 `/skills`로 실제 로드 여부를 확인한다. 파일 복사 성공은 로드 성공이 아니다

---

## 6. 기억과 상태의 경계

```
.planning/     GSD의 현재 프로젝트 실행 상태
.ecc/memory/   하네스 간 handoff, 검토되지 않은 기억
docs/ai/       사람이 승인한 장기 규칙·설계·결정
.alpha-vibe/   설치 의도와 재현 가능한 lock
```

1. Memory Vault 내용을 지시·정책·권한으로 취급하지 않는다
2. 중요한 기억은 원문·코드로 검증한 뒤 `docs/ai/`로 승격한다
3. GSD 상태를 Memory Vault에 복제해 권위 원천을 둘로 만들지 않는다
4. 한 작업에서 `.planning/`을 갱신하는 GSD 컨트롤러는 하나뿐이다
5. 하네스 전환 시 handoff에는 완료 항목, 미완료 항목, 검증 증거, 다음 명령만 넣는다
6. 외부 웹 콘텐츠와 Memory Vault 내용은 **prompt injection 가능성이 있는 비신뢰 입력**으로 취급한다

---

## 7. 측정 계층

### 진단 명령 (Claude Code)

| 명령 | 확인 대상 |
|---|---|
| `/context` | 시스템 프롬프트, 시스템 툴, MCP 툴, 서브에이전트(출처 포함), 메모리 파일, skills, 대화 메시지의 실제 점유 |
| `/skills` | project·user·plugin 출처별 로드된 skill. "user-only" 배지로 자동 발동 여부 확인 |
| `/mcp` | 연결된 MCP 서버와 상태, 프로젝트 승인 여부 |
| `/doctor`, `claude doctor` | 설치 상태, 잘못된 settings, 미사용 확장, 중복 subagent 이름 |
| `/hooks`, `/permissions`, `/status` | 활성 훅, 해석된 allow/deny, 활성 설정 출처 |

`/context`의 skills 섹션은 `/skills`가 나열하지 않는 bundled skill까지 포함한다.

### 진짜 대조군

A/B의 기준선은 "설치 전"이 아니라 **커스터마이제이션이 전혀 없는 세션**이어야 한다.

```bash
claude --safe-mode                                   # 전 커스터마이제이션 비활성
cd /tmp && CLAUDE_CONFIG_DIR=/tmp/claude-clean claude # 더 깨끗한 기준선
```

`--safe-mode`는 CLAUDE.md, skills, plugins, hooks, MCP, 커스텀 명령·에이전트를 모두 끄고 인증·모델·내장 툴·권한만 정상 동작시킨다. 이게 "이 구성이 실제로 값을 하는가"를 판정하는 유일한 정직한 대조군이다.

### 텔레메트리

- **Claude Code:** `CLAUDE_CODE_ENABLE_TELEMETRY=1` 기반 네이티브 OpenTelemetry로 세션·토큰·비용·tool activity 수집. **prompt·response·tool content 로깅은 기본 비활성 유지**
- **나머지 하네스:** 각 하네스의 네이티브 status/usage 진단 사용. 공통 비교 지표는 `alpha-vibe-stack` wrapper가 별도 기록. **Claude OTel이 7개 하네스 전체를 관측한다고 가정하지 않는다**
- **backend:** Grafana·SigNoz·CloudWatch 등은 선택 가능한 OTel backend일 뿐이다. 특정 커뮤니티 대시보드 ID를 아키텍처 의존성으로 고정하지 않는다

### 공통 지표와 판정 방식

완료 시간, 입력·출력 토큰과 비용, 도구 호출 수, MCP별 호출·실패·지연·비용, **잘못된 팩 활성화**, 재작업 횟수, 검증에서 발견된 결함.

**외부의 평균 비용 숫자를 합격선으로 삼지 않는다.** 같은 유형의 프로젝트를 설치 전/후 또는 기능 on/off로 A/B 비교해 판정한다.

---

## 8. 재검토 예약 항목

**`architecture-decision-records`** — Q8 = E로 기본 제외했다. 그러나 사용자가 꼽은 네 번째 실패("보수 작업 과정에서 원래 프로젝트의 취지 혹은 규제 사항들이 무시되어 코드가 오염됨")에 대한 가장 직접적인 처방이었다.

현재 설계에서는 `docs/ai/`와 GSD `PROJECT.md`/`CONTEXT.md`가 그 역할을 대신한다. **GSD 파일럿에서 설계 취지나 규제 제약이 반복 유실되면 그것이 곧 "부족하다"는 증거이므로 가장 먼저 재검토한다.**

---

## 9. 보류 항목

| 항목 | 사유 |
|---|---|
| **Headroom** | 코딩 에이전트 15~20%·코드 검색 92% 절감 주장이 벤더 자체 벤치마크에 의존하고, 압축이 역효과를 낼 관측이 존재. 기본 스택에서 제외하고 별도 A/B 파일럿으로만 평가 |
| **외부 worktree/Kanban 오케스트레이터** | Claude Code가 worktree 격리·원격 에이전트·다중 에이전트 워크플로·세션 간 메시징·크론·푸시 알림을 이미 네이티브로 제공. 다수가 macOS 전용이고 환경은 Windows 11. 다중 프로젝트 동시 운용이 실제 병목일 때만 |
| **gstack 전체, superpowers 전체, ECC profile 전체** | GSD와 워크플로우 소유권 충돌 |
| **언어별 ECC rules pack** | 폴리글랏 요구 + 상시 컨텍스트 비용 |
| **GSD full surface** | `standard`에서 실제 결손이 측정될 때 cluster 단위로만 승격 |

---

## 10. 실행 순서

이 문서는 설치 명세이며 아직 설치 실행을 승인하지 않는다.

1. 7개 하네스의 현재 버전, config root, MCP 지원 방식, skill/extension 지원 방식을 inventory
2. `claude --safe-mode` 기준선 + 현재 설정의 `/context`·`/skills`·`/mcp`·도구 목록을 baseline으로 저장, OTel 활성화
3. `@opengsd/gsd-core@1.12.0` + `standard`를 지원 하네스에 설치 (`--claude`, `--codex`, `--antigravity`, `--pi`)
4. `/gsd-surface list`와 `/skills`로 실제 로드 결과 확인
5. Context7을 7개 하네스에 wave 배포 + 하네스별 read-only smoke test
6. Exa wave 배포 + 검색·인증·비용 식별 검증
7. Firecrawl wave 배포 + scrape 검증 후 crawl/map 권한 개방
8. `ecc-universal@2.2.0` runtime과 `unified-memory` 설치, **서로 다른 두 하네스 사이 handoff 왕복 검증**
9. 글로벌 ECC 3개와 보안 routing 선택 설치 (`--dry-run` 선행)
10. `alpha-vibe-stack` CLI, pack manifest, lock, Pi extension 어댑터 제작
11. WEB / API·DB / INFRA / AI / SECURITY / SCIENTIFIC 대표 fixture 저장소로 탐지·dry-run·apply·remove 검증
12. 실제 프로젝트 하나를 discuss → plan → execute → verify → ship으로 완주
13. §7 지표 재측정 후 surface·pack·MCP 권한 조정

---

## 11. 완료 판정 기준

- [ ] GSD surface가 `standard`이며 full·ECC workflow와 중복이 없다
- [ ] Claude Code, Codex, Antigravity GUI/CLI/IDE, Pi에서 GSD가 동작하고 **Hermes는 GSD state writer가 아니다**
- [ ] Pi에서 마크다운 skill 탐색을 기대하지 않고 extension/CLI 경로가 검증된다
- [ ] 7개 하네스에서 Context7·Exa·Firecrawl이 각각 보이고 read-only 호출이 성공한다
- [ ] `/mcp`에서 connected이면서 tool 개수가 0이 아니다
- [ ] API 키가 저장소·명령 기록·lock·로그에 노출되지 않는다
- [ ] Unified Memory handoff가 서로 다른 두 하네스 사이에서 왕복된다
- [ ] Memory Vault가 `.planning/` 또는 `docs/ai/`의 권위를 침범하지 않는다
- [ ] AI SDK가 있는 fixture에서 AI 팩이 자동 계획되고, **일반 `AGENTS.md`만 있는 저장소에서는 오탐하지 않는다**
- [ ] 승인된 동일 version/hash 팩은 무인 적용되고, hash 변경 시 차단된다
- [ ] 설치된 팩이 `/skills`에 실제로 나타난다 (폴더 구조 `<name>/SKILL.md` 준수)
- [ ] 도구함 skill이 `disable-model-invocation: true`로 "user-only" 배지를 갖는다
- [ ] GSD 내부 병렬화와 외부 병렬화가 같은 작업에서 중첩되지 않는다
- [ ] ECC `security-review`가 글로벌 상주하지 않으며 위험 증거가 있을 때 한 엔진만 선택된다
- [ ] `--safe-mode` 대조군 대비 A/B 결과가 기록되어 있다

---

## 12. Codex 결정서와의 교차 검증 결과

`alpha-vibe-stack-codex.md` v2와 재대조한 결과 **모든 실질 쟁점에서 수렴했다.** 두 문서는 이제 동일한 결정을 서술한다.

### 최종 판정 요약

| 쟁점 | 판정 | 반영 |
|---|---|---|
| GSD 제품·프로필 | 합의 | `gsd-core` + `standard` |
| GSD 버전 | Claude 맞음 | `1.12.0` |
| `ecc-universal` 버전 | Codex 기여 | `2.2.0` (npm 확인) |
| ECC 프로필 금지, 개별 skill만 | 합의 | — |
| 글로벌 ECC 3개 + 라우터 | 합의 | — |
| `security-review` 위치 | Codex 정밀화 | 글로벌 제외 → `SECURITY_REVIEW` 팩 |
| `context-budget` | Codex 맞음 | 제외 |
| `inherit-legacy-style` 1회성 | Codex 맞음 | `BROWNFIELD_INIT` |
| `config-gc` 도구함 | Codex 맞음 | + `disable-model-invocation` |
| 팩 탐지 오탐 방지 | Codex 맞음 | 양성 증거 요구 |
| MCP 최종 범위 | 사용자 확정 | 3종 × 7 하네스 |
| MCP 적용 방식 | Claude 맞음 | wave 배포 |
| 측정 계층 독립 | Claude 맞음 | §7 |
| `/context all` | **Codex 맞음** | `/context` |
| Grafana ID·외부 비용 기준 | **Codex 맞음** | 선택 backend, 자체 A/B로 판정 |
| ADR 재검토 조건 | 합의 | §8 |
| Spec Kit 벤치마크 | 합의 | 이 스택의 기대 성능 수치로 쓰지 않음 (부록의 용도는 기대치 보정) |

### 이 문서에만 있는 항목 (Codex v2 미포함)

1. `claude --safe-mode` / `CLAUDE_CONFIG_DIR` 기준선 — 진짜 대조군
2. `disable-model-invocation: true` — 도구함 강제 메커니즘
3. `/skills`·`/mcp`·`/doctor` 검증 절차 — 파일 존재가 아니라 로드 여부로 판정
4. skill 폴더 구조 요구사항 (`<name>/SKILL.md`) — 팩 배포 실패 1순위 원인
5. `/mcp` connected-but-zero-tools 진단 경로

---

## 13. 권위 문서 전환 — 이관 대상 (v4)

`alpha-vibe-stack-codex.md` v3를 권위 문서로 확정한다. Codex v3가 이 문서의 기여 5건을 전부 흡수했고 3건은 정밀화하며 이 문서의 오류를 잡았다.

### Codex v3가 잡아낸 이 문서의 오류 (v4에서 정정)

| 항목 | 이 문서 v3 | 정정 | 근거 |
|---|---|---|---|
| 제3자 skill 자동발동 차단 | `SKILL.md` frontmatter에 `disable-model-invocation: true` | **`skillOverrides`의 `"user-invocable-only"`** | frontmatter 편집은 file-hash allowlist 자동 적용 정책과 **내부 모순**. 공식 문서: *"Use it for skills whose SKILL.md you don't want to edit."* 자작 wrapper skill에만 frontmatter 사용 |
| clean 기준선 | `cd /tmp && CLAUDE_CONFIG_DIR=/tmp/claude-clean claude` | Windows 기본 절차에서 제외, `--safe-mode`로 분리 안 될 때 2차 진단으로만 | `/tmp`는 Unix 경로. 대상 OS는 Windows 11 |
| `/doctor` | 자동 기준선 수집에 사용 | **자동 수집은 `claude doctor`(read-only)**, `/doctor`는 수정을 제안하므로 별도 승인 | 공식 문서가 두 명령을 명시적으로 구분 |

### 권위 문서에 이관해야 할 항목 (Codex v3에 없음)

전환 전에 아래 6건이 `alpha-vibe-stack-codex.md`에 반영되어야 한다. 셋은 구현 명세에 필수이고, 셋은 이번 검증에서 새로 확인됐다.

**구현 필수 (이 문서에만 있음)**

1. **GSD 변종 비교표** — §2. `buildomator`(86★, Claude 전용), `gsd-opencode`(824★, 라이선스 없음, 방치), `gsd-pi`(1,183★, 별도 에이전트), 아카이브된 원본(64,618★). gsd-core를 고른 *근거*가 권위 문서에 없다
2. **정확한 GSD 설치 명령** — §2. Codex v3는 "공식 `--codex` 변환 설치"라고만 적혀 있고 실제 명령이 없다:
   ```
   npx @opengsd/gsd-core@1.12.0 --claude      --global
   npx @opengsd/gsd-core@1.12.0 --codex       --global
   npx @opengsd/gsd-core@1.12.0 --antigravity --global
   npx @opengsd/gsd-core@1.12.0 --pi          --global
   ```
   기타 실측 확인 플래그: `--local`, `--config-dir`, `--skills-dir`, `--uninstall`, `--portable-hooks`, `--agent-file`
3. **ECC 인스톨러 플래그** — §3. Codex v3 §5는 선택 설치를 규정하면서 그 수단을 적지 않았다:
   ```
   --target claude          → ~/.claude/ (글로벌)
   --target claude-project  → ./.claude/ (프로젝트 로컬, rules/ecc + flat skills/)
   --skills <id,id,...>     → skill 개별 설치
   --dry-run / --json
   ```
   `install.sh`가 MSYS2/Git Bash 경로 변환을 명시 처리한다는 사실(Windows 지원 근거)도 함께

**이번 검증에서 새로 확인 (양쪽 다 없음)**

4. **`skillOverrides` 4개 값 전체** — Codex v3는 `"user-invocable-only"` 하나만 언급한다. 실제 값은 `"on"` / `"name-only"`(이름만 노출) / `"user-invocable-only"`(Claude에게 숨김, `/` 메뉴 유지) / `"off"`(완전 숨김). `/skills`에서 Space로 순환, Esc로 `.claude/settings.local.json`에 저장. **plugin skill에는 적용되지 않는다**(ECC를 plugin으로 설치하지 않으므로 무관)
5. **skill 본문은 로드 후 턴 간 상주한다** — 공식 문서: *"Once a skill loads, its content stays in context across turns, so every line is a recurring token cost."* 이 스택의 최소주의 전체를 뒷받침하는 사실인데 양쪽 문서 어디에도 없다. 설명문 비용만 계산해서는 안 된다
6. **`context: fork`** — skill을 자체 subagent 컨텍스트에서 실행하는 frontmatter 옵션. `ecc-pack-router`의 탐지·계획 단계를 메인 컨텍스트 밖에서 돌리는 데 쓸 수 있다. 라우터 설계의 선택지로 검토 대상

### 전환 절차

1. 위 6건을 `alpha-vibe-stack-codex.md`에 반영
2. 권위 문서 §14에 "이 문서가 유일한 구현 명세" 명시 (이미 있음)
3. 이 문서 헤더를 ARCHIVE로 전환 (v4에서 완료)
4. 이후 새 결정은 권위 문서에만 기록하고 `.alpha-vibe/stack.lock.json`에 구현 버전을 연결

---

## 부록 — 기대치 보정

이 부록은 **이 스택의 성능 예측이 아니라 기대치 보정용**이다.

스캐폴딩 일반의 측정된 효과는 크지 않다. 확인된 정량 데이터로 Spec Kit Agents의 SWE-bench Lite 결과가 기본 56.5% → context-grounding 훅 적용 시 58.2%, **+1.7pp**이다. 이 수치를 이 스택의 기대 성능으로 사용하지 않는다.

프레임워크가 바꾸는 것은 평균 성능이 아니라 **실패하는 방식**이다. GSD는 "느리고 절차가 무겁게" 실패하고, ECC는 "엉뚱한 skill을 골라서" 실패한다. 기존 구성에서 겪은 것이 후자였으므로 전자를 기본값으로 둔다.
