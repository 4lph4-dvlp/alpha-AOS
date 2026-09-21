# alpha-AOS

[English](./README.md) | [한국어 (Korean)](./README.ko.md)

일관되고 제어 가능한 AI 에이전트 작업 환경을 구축하기 위한 선언적(Declarative) 크로스 플랫폼 인스톨러 및 업데이트 관리자입니다.

alpha-AOS는 사용자 머신에 이미 설치된 지원 AI 하네스(Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent)를 자동으로 감지하고 최적의 환경으로 구성합니다. 프로젝트 워크플로우 및 상태 척추로 **GSD(Get Stuff Done)**를 사용하고, 엄선된 3개의 **ECC(Everything Claude Code)** 글로벌 스킬을 제공하며, **Context7**, **Exa**, 그리고 로컬 프록시로 안전하게 제한된 **Firecrawl** MCP 서버를 등록합니다. 하네스 애플리케이션 자체를 임의로 설치하지 않으며, 무분별한 전역 프로필 설치를 차단합니다.

모든 변경 작업은 기본적으로 **Dry-run(사전 검토)**을 거쳐 결정론적(Deterministic)으로 실행됩니다. 설치된 하네스를 감지하여 검증된 불변 락(`stack.lock.json`)과 비교하고, 변경이 필요한 경우에만 격리된 픽스처 테스트를 통과한 후 순차적으로 적용하며, 모든 파일 변경 이력을 트랜잭션 저널로 기록하여 완벽한 스냅샷 롤백을 보장합니다.

---

## 요구 사양 (Requirements)

- Windows 11, 최신 macOS 또는 최신 Linux 배포판
- Git
- Node.js 24 이상
- npm 10 이상
- 로그인 완료된 하나 이상의 지원 AI 하네스 (Claude Code, Codex, Antigravity, Pi, Hermes)

선택적 MCP API 키는 사용자의 환경 변수에서 읽어옵니다:
- `EXA_API_KEY`: Exa 실시간 웹 검색 실행 시 필요.
- `CONTEXT7_API_KEY`: 선택 사항 (계정 인증이 필요한 경우 설정).
- `FIRECRAWL_API_KEY`: 선택 사항 (웹 크롤링/스크래핑 인증이 필요한 경우 설정).

alpha-AOS는 환경 변수 **이름**만 참조하며, 민감한 키 값 자체는 설정 파일, 매니페스트, 저널 어디에도 기록하지 않습니다.

---

## 빠른 시작 (Workstation Setup)

저장소를 복제(clone)한 후, 루트 디렉터리에서 플랫폼별 부트스트랩 스크립트를 실행합니다:

```sh
git clone https://github.com/4lph4-dvlp/alpha-AOS.git
cd alpha-AOS
```

### Windows (PowerShell)

```powershell
# 감지된 하네스 및 적용 예정 계획 미리보기 (Dry-run)
.\scripts\install.ps1

# 감지된 모든 하네스에 정식 설치 적용
.\scripts\install.ps1 -Apply

# 특정 하네스만 지정하여 설치하는 경우
.\scripts\install.ps1 -Apply -Target "claude,codex,antigravity"
```

### macOS / Linux (POSIX Shell)

```sh
# 적용 예정 계획 미리보기 (Dry-run)
sh ./scripts/install.sh

# 감지된 모든 하네스에 정식 설치 적용
sh ./scripts/install.sh --apply

# 특정 하네스만 지정하여 설치하는 경우
sh ./scripts/install.sh --apply --target claude,codex
```

### 설치 상태 검증

설치를 적용한 후, 하네스(터미널, IDE, 에이전트 창)를 재시작하고 다음 명령어로 상태를 확인합니다:

```sh
alpha-aos doctor
alpha-aos status
alpha-aos install
```

모든 선택된 구성 요소가 `CURRENT`로 보고되고 닥터 진단이 통과하면 전역 환경 구성이 완료된 것입니다.

---

## 아키텍처: 전역 스택(Global) vs 프로젝트 전용 스택(Project-Specific)

alpha-AOS는 공통 전역 도구와 프로젝트 맞춤 기능 간의 경계를 엄격히 분리합니다:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        사용자 워크스테이션 (Global 스택)                  │
│  • GSD Core standard (프로젝트 워크플로우 & 상태 관리 척추)               │
│  • ECC 전역 스킬 (unified-memory, documentation-lookup,                │
│                   deep-research)                                       │
│  • 엄선된 MCP 도구 (Context7 최신 문서, Exa 검색, Firecrawl 프록시)       │
│  • 기본 탑재 소유 스킬 (alpha-aos-pack-advisor, alpha-aos-ship)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       ▼                                                         ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│     프로젝트 A (Python 백엔드) │        │     프로젝트 B (React 프론트)   │
│  • BROWNFIELD_INIT 팩        │        │  • WEB_BASE 팩               │
│  • 프로젝트 전용 컨벤션        │        │  • WEB_REACT 팩              │
│  • React/Node 도구 오염 없음   │        │  • frontend-a11y 접근성 스킬   │
└──────────────────────────────┘        └──────────────────────────────┘
```

1. **전역 스택 (Global Baseline)**: 공통으로 유용하고 부작용 위험이 적은 도구(GSD 워크플로우, 통합 메모리 저장소, 공식 문서 조회, 웹 심층 리서치)는 모든 AI 하네스에 전역으로 설치됩니다.
2. **프로젝트 맞춤 팩 (Project Capability Packs)**: 특정 언어나 프레임워크 전용 도구(React, Python, 브라운필드 컨벤션, DB 마이그레이션 등)는 **절대로 전역에 설치되지 않습니다**. 저장소 내 증거(의존성, 디렉터리 구조 등)를 분석하여 해당 프로젝트에만 안전하게 격리 배포됩니다.
3. **환경 오염 방지 (Zero Cross-Pollution)**: 파이썬 프로젝트에서 작업할 때는 리액트 관련 도구가 주입되지 않으며, 고(Go) 프로젝트에서 작업할 때는 관련 없는 MCP 서버가 에이전트의 컨텍스트를 낭비하지 않습니다.

---

## 프로젝트 작업 시 alpha-AOS 활용법

새 프로젝트를 시작하거나 기존 코드베이스 폴더(예: `D:\dev\my-project`)로 이동하여 작업할 때, **자율형 AI 에이전트 워크플로우** 또는 **수동 CLI 워크플로우**를 통해 프로젝트 전용 팩을 설치하고 활용할 수 있습니다.

### 모드 1: 자율형 AI 에이전트 워크플로우 (권장 — 무마찰 자동화)

모든 지원 하네스(Antigravity, Claude Code, Codex, Pi, Hermes)에는 기본 스킬인 `alpha-aos-pack-advisor`가 설치되어 있습니다. 사용자가 복잡한 터미널 명령어나 64자리 해시값을 직접 복사해 붙여넣을 필요가 없습니다.

1. **에이전트 실행**: 프로젝트 폴더에서 에이전트를 실행합니다 (예: `agy` 실행, Claude Code 실행 등).
2. **자율 증거 감지**:
   에이전트가 작업 폴더에 진입하거나, 온보딩(`/gsd-new-project`) 또는 작업을 시작할 때 백그라운드에서 `alpha-aos project plan . --json`을 확인합니다.
3. **에이전트의 추천 및 브리핑**:
   해당 프로젝트에 필요한 미설치 맞춤 팩이 감지되면 에이전트가 먼저 근거와 함께 질문합니다:
   > *"이 작업 공간은 기존 코드가 존재하지만 컨벤션 문서가 없는 환경입니다. 레거시 스타일 상속과 프로젝트 컨벤션을 제공하는 `BROWNFIELD_INIT` 팩을 설치할까요?"*
4. **간단한 승인**:
   사용자는 가볍게 승인만 답해주면 됩니다:
   > **"응"** (또는 **"설치해줘"**, **"Yes"**)
5. **전자동 승인 및 배포**:
   에이전트가 계획 JSON에서 정확한 64자리 SHA-256 `planDigest`를 추출하여 다음 명령을 자동으로 실행합니다:
   - `alpha-aos project approve . --plan-digest <64자리_다이제스트> --apply`
   - `alpha-aos project sync . --apply`
6. **세션 갱신 안내**:
   에이전트가 상태(`CURRENT`)를 확인하고 안내를 마칩니다:
   > *"프로젝트 전용 팩이 성공적으로 설치되었습니다. 새로 추가된 프로젝트 MCP 도구와 스킬을 활성화하려면 에이전트 세션을 재시작(또는 도구 새로고침)해 주세요."*

### 모드 2: 개발자 수동 CLI 워크플로우

터미널에서 직접 명령어를 통해 제어하고 검토하기를 선호하는 경우:

```sh
# 1. 증거 기반 팩 계획 및 매칭 이유 확인 (--why)
alpha-aos project plan . --why

# 2. 현재 프로젝트의 설치 상태 및 영수증(Receipt) 확인
alpha-aos project status .

# 3. 출력된 계획의 정확한 64자리 planDigest로 승인 적용
# (다이제스트는 계획 출력 하단에 표시됩니다)
alpha-aos project approve . --plan-digest <64자리_다이제스트> --apply

# 4. 승인된 스킬, 프로젝트 MCP 도구 및 영수증을 트랜잭션으로 배포
alpha-aos project sync . --apply

# 5. 모든 팩이 CURRENT 상태로 반영되었는지 확인
alpha-aos project status .
```

---

## 실전 사용 시나리오 및 자주 묻는 질문 (FAQ)

### 시나리오 A: 기존 코드베이스 온보딩 (Brownfield)
- **상황**: 기존에 개발 중이던 프로젝트(Python, TypeScript, Go 등) 폴더를 열었을 때.
- **동작**: alpha-AOS가 소스 디렉터리(`src/` 등)의 존재와 컨벤션 문서의 부재를 감지하여 `BROWNFIELD_INIT` 팩을 선택합니다.
- **효과**: Git 이력을 오염시키지 않고 프로젝트 로컬 컨벤션과 기존 코드 스타일 상속 스킬이 주입되어, 에이전트가 프로젝트의 맥락에 맞춰 안정적으로 코드를 작성합니다.

### 시나리오 B: 웹 및 프론트엔드 개발 (React / Next.js)
- **상황**: `package.json`에 `react` 또는 `next`가 선언된 프로젝트에 진입했을 때.
- **동작**: alpha-AOS가 웹 프레임워크 의존성을 감지하여 `WEB_BASE` 및 `WEB_REACT` 팩을 선택합니다.
- **효과**: 웹 접근성 검사 스킬(`frontend-a11y`)과 웹 테스트 도구가 해당 프로젝트 하네스에만 안전하게 추가됩니다.

### 시나리오 C: 새로운 프로젝트 시작 (Greenfield)
- **상황**: 빈 폴더에서 `/gsd-new-project`로 완전히 새로운 프로젝트를 기획할 때.
- **동작**: 기존 코드가 전혀 없는 상태(`fileAbsent`)를 감지하여 Greenfield로 분류합니다. 프로젝트 기본 파일이나 프레임워크가 추가되기 전까지는 불필요한 도구 없이 전역 스택만 깔끔하게 유지됩니다.

### 시나리오 D: 기밀 / 사내 보안 프로젝트 제외 (Tree-Off 정책)
- **질문**: *"회사 기밀 저장소나 보안 프로젝트에서는 alpha-AOS 기능이나 AI 에이전트 연동을 완전히 배제하고 싶습니다."*
- **해결책**: `--mode off` 정책을 설정합니다:
  ```sh
  alpha-aos tree policy set /경로/보안프로젝트 --mode off
  ```
  설정 즉시 alpha-AOS는 해당 디렉터리 하위에서 일체의 파일 쓰기나 스캔을 Fail-closed(즉시 차단) 처리하며 어떠한 상태 파일도 남기지 않습니다.

### 시나리오 E: 샌드박스 격리 런타임 (Project Isolation)
- **질문**: *"전역 스킬이나 설정을 일절 상속받지 않는 순수 격리 환경에서 에이전트를 구동하고 싶습니다."*
- **해결책**: `project isolate`를 활용합니다:
  ```sh
  # 격리 정책 초기화 및 승인
  alpha-aos project isolate init /경로/프로젝트 --mode project-only --harness claude --trust --apply
  
  # 격리 런타임 동기화 및 실행
  alpha-aos project isolate sync /경로/프로젝트 --apply
  alpha-aos project run claude /경로/프로젝트 --apply
  ```
  격리된 상태는 저장소 외부(`~/.alpha-aos/isolated/<project-id>/`)에 보관되므로 리포지토리에 비밀키나 설정이 유출되지 않습니다.

### 시나리오 F: 필수 품질 게이트 (품질 검사 강제)
- **질문**: *"보안 변경, DB 마이그레이션, 배포 관련 파일이 변경될 때 검증 단계를 건너뛰지 못하게 강제할 수 있나요?"*
- **해결책**: alpha-AOS 게이트 검사를 실행합니다:
  ```sh
  alpha-aos gate check
  alpha-aos gate check --apply
  ```
  인증 로직, 결제 경로, DB 스키마 등이 수정되면 게이트 엔진이 이를 감지하여 정식 영수증(Receipt)이 발급되기 전까지 워크플로우 진행을 엄격히 차단합니다.

### 시나리오 G: 안전한 롤백 및 크래시 복구
- **질문**: *"설치나 동기화 도중 오류가 발생했거나 이전 상태로 되돌리고 싶습니다."*
- **해결책**: alpha-AOS의 모든 변경 사항은 `~/.alpha-aos/journal/`에 원본 스냅샷과 함께 기록됩니다:
  ```sh
  # 최근 변경 트랜잭션 목록 조회
  alpha-aos rollback
  
  # 특정 트랜잭션 롤백 미리보기
  alpha-aos rollback <작업-ID>
  
  # 정확한 바이트 복원 롤백 적용
  alpha-aos rollback <작업-ID> --apply
  ```
  만약 작업 도중 비정상 종료(Crash)되어 쓰기 락이 남은 경우:
  ```sh
  alpha-aos repair
  alpha-aos repair --apply
  ```

### 시나리오 H: 완성된 GSD 작업물 PR 배포 (Ship)
- **질문**: *"GSD 단계를 모두 완료하고 안전하게 브랜치를 푸시하고 PR을 열고 싶습니다."*
- **해결책**: 저장소 소유 스킬인 `/alpha-aos-ship`을 사용합니다:
  ```sh
  # Claude Code 또는 지원 하네스에서:
  /alpha-aos-ship <단계번호>
  ```
  불필요한 유틸리티 낭비 없이 GSD 정식 Ship 워크플로우(클린 트리 검증, 브랜치 검사, 푸시, PR 생성)를 바로 호출합니다.

---

## 설치 구성 요소 목록 (전역 매트릭스)

| 레이어 | 패키지 / 구성 요소 | 타깃 | 설명 |
|---|---|---|---|
| **워크플로우 척추** | GSD Core `standard` (`1.12.0`) | Claude, Codex, Antigravity, Pi | 프로젝트 기획, 단계별 계획/실행 및 검증 총괄. |
| **작업자 하네스** | Hermes Agent | Hermes | 작업자 전용(Worker-only)으로 설정되어 GSD 기획 상태를 임의 변경하지 않음. |
| **에이전트 통합 메모리** | ECC `unified-memory` | 5대 하네스 공통 | 에이전트 간 맥락과 결정 사항을 공유하는 Memory Vault. |
| **최신 라이브러리 문서** | ECC `documentation-lookup` + Context7 | 5대 하네스 공통 | Context7 stdio MCP 게이트웨이를 통한 실시간 최신 공식 문서 조회. |
| **심층 멀티 웹 리서치** | ECC `deep-research` + Exa/Firecrawl | 5대 하네스 공통 | Exa 검색 및 안전하게 필터링된 Firecrawl 기반의 리서치. |
| **웹 스크래핑 프록시** | Firecrawl Proxy (`3.24.0`) | 5대 하네스 공통 | 상위 25개 도구 중 안전한 4개 추출/크롤링 도구만 노출하는 로컬 SDK 프록시. |
| **자율형 팩 어드바이저** | `alpha-aos-pack-advisor` | 5대 하네스 공통 | 프로젝트 진입 시 맞춤 팩을 감지·설명하고 사용자 승인 시 자동 설치. |
| **GSD PR 배포 스킬** | `alpha-aos-ship` | Claude Code | 사용자 호출 전용의 브랜치 푸시 및 PR 생성 스킬. |
| **프로젝트 격리 지원** | alpha-AOS 런타임 어댑터 | 5대 하네스 공통 | Fail-closed 보장을 갖춘 프로젝트 독립 샌드박스 실행. |

---

## 업데이트 (Updating)

업데이트 시스템은 항상 검증되고 동결된 안정 락(`catalog/stack.lock.json`)만을 반영합니다:

```powershell
# Windows
.\scripts\update.ps1          # 업데이트 계획 미리보기
.\scripts\update.ps1 -Apply   # 코드 pull, 빌드 및 스택 동기화
```

```sh
# macOS / Linux
sh ./scripts/update.sh
sh ./scripts/update.sh --apply
```

`git pull --ff-only`를 수행하고 CLI를 재빌드하며, 검증되지 않은 후보 버전(`candidate.lock.json`)은 일반 사용자 머신에 절대 적용되지 않습니다.

---

## 개발 및 테스트 (Development)

```sh
# 의존성 설치
npm ci

# 타입스크립트 검증 및 빌드
npm run check
npm run build
npm run build:check

# 전체 테스트 스위트 실행
npm test

# 배포 아카이브 무결성 검증
npm run audit-tarball
```

모든 상태 변경 명령어는 기본적으로 안전한 Dry-run 모드로 작동하며, 실제 디스크 변경 시에는 반드시 `--apply` 플래그를 명시해야 합니다.

---

## 라이선스 (License)

[Apache License 2.0](./LICENSE)을 따릅니다.
