# alpha-AOS 마이그레이션 가이드: 로컬 도구 기록 (v0.8.0)

본 가이드는 기존 alpha-AOS 설치본 및 과거 정적 락파일/핀 설정을 v0.8.0에 도입된 단일 진실 공급원(SSOT) 로컬 도구 기록(tool-records) 아키텍처로 안전하게 마이그레이션하는 절차를 안내합니다.

---

## 1. 개요: 로컬 도구 기록 아키텍처

이전 버전의 alpha-AOS에서는 런타임 컴포넌트가 저장소 내 정적 락파일(`catalog/stack.lock.json`) 및 번들 핀 파일(`catalog/computer-use-runtime.json`)을 직접 읽어 도구와 MCP 버전을 판정했습니다.

v0.8.0부터는 다음과 같이 개선되었습니다:
- **로컬 도구 기록(SSOT)**: 모든 런타임 컴포넌트(`mcp`, `isolation`, `install`, `doctor`, `recovery`)는 `~/.alpha-aos/tool-records/v1/`에 저장된 불변 로컬 기록만을 단일 진실 공급원으로 참조합니다.
- **Fail-Closed 원칙**: 로컬 승인 기록이 없거나 초기화되지 않은 상태에서 소비자 모듈이 실행되면 숨겨진 번들 핀으로 조용히 폴백하지 않고, 명확한 해결 안내와 함께 즉시 안전하게 중단됩니다.
- **역사적 시드 보존**: 과거 락파일(`catalog/stack.lock.json`, `catalog/computer-use-runtime.json`)은 마이그레이션을 위한 읽기 전용 역사적 시드로 보존되며, 런타임 코드에서는 직접 접근하지 않습니다.

---

## 2. 단계별 마이그레이션 워크플로

마이그레이션 파이프라인은 기존 도구 설치와 설정 파일을 비파괴적으로 안전하게 입양합니다.

### 1단계: 읽기 전용 프리뷰 생성

마이그레이션 프리뷰를 실행하여 레거시 설치를 탐색하고 준비 상태를 확인합니다:

```bash
alpha-aos migrate
```

특정 도구나 하네스 대상만 선별하여 마이그레이션할 수도 있습니다:

```bash
alpha-aos migrate --tool cua-driver,mcp:context7 --target codex,antigravity
```

프리뷰는 설치된 도구, 이전 증거, 하네스 설정을 검사하고 64자리 SHA-256 계획 다이제스트와 서명된 검토 토큰을 출력합니다:

```text
alpha-aos migration preview
Plan digest: 1a2b3c4d...
Reviewed plan token: eyJhbGci...

Component and Harness Status Matrix:
Tool        Harness      Status           Shared Config Impact    Action Required
----------  -----------  ---------------  ----------------------  -----------------
cua-driver  codex        RETAINED [SKIP]  preserved               ready to migrate
mcp:context7 antigravity RETAINED [SKIP]  preserved               ready to migrate
```

### 2단계: 후보 및 공유 영향 검토

후보 목록의 상태를 확인합니다:
- **Ready**: 이전 증거와 일치하며 즉시 입양할 수 있는 상태입니다.
- **Modified**: 하네스 설정에서 사용자의 수정 사항이 감지되었습니다. 적용 시 `.user-backup` 백업이 자동 생성됩니다.
- **Ambiguous**: 소유권 출처를 자동으로 확정할 수 없습니다. 아래 안내에 따라 `--resolve-ownership`을 지정해야 합니다.

### 3단계: 마이그레이션 계획 적용

프리뷰 내용을 확인한 후 계획 다이제스트와 검토 토큰을 전달하여 적용합니다:

```bash
alpha-aos migrate --apply --plan-digest <DIGEST> --reviewed-plan <TOKEN>
```

적용 시 alpha-AOS는 다음 작업을 수행합니다:
1. 계획 다이제스트가 현재 머신 상태와 정확히 일치하는지 검증합니다.
2. 수정된 설정 파일이 있을 경우 비파괴 원본 `.user-backup` 스냅샷을 생성합니다.
3. 로컬 도구 기록 스토어에 `type: "migrate"` 이벤트를 원자적으로 커밋합니다.
4. 입양된 모든 도구의 활성 승인(accepted) 전환을 등록합니다.

---

## 3. 소유권 판별 및 마커 경계 선택적 보존

### 모호한 후보 소유권 해결

기존 설치본의 소유권 증거가 불명확한 경우(예: alpha-AOS와 독립적으로 전역 설치된 바이너리), 프리뷰는 해당 항목을 `ambiguous`로 격리하고 fail-closed로 중단합니다:

```text
Error: Ambiguous candidate ownership detected for cua-driver. Supply --resolve-ownership cua-driver=<alpha-aos|external> to proceed.
```

명시적 소유권을 지정하여 해결할 수 있습니다:
- alpha-AOS가 로컬 기록을 통해 해당 도구를 관리해야 하는 경우 `alpha-aos`를 지정합니다.
- 사용자가 직접 또는 호스트 패키지 관리자로 관리해야 하는 경우 `external`을 지정합니다.

```bash
alpha-aos migrate --resolve-ownership cua-driver=alpha-aos,mcp:context7=external
```

### 마커 경계 기반 선택적 보존

Codex `config.toml`과 같은 공유 설정 파일의 경우, alpha-AOS는 지정된 마커 블록 내부만 관리합니다:

```toml
# alpha-aos:start mcp
[mcp_servers.context7]
command = "npx"
args = ["--yes", "@upstash/context7-mcp@0.3.0"]
# alpha-aos:end mcp
```

마커 영역 외부의 사용자 고유 커스텀 서버 항목이나 일반 하네스 설정은 온전히 보존됩니다.

---

## 4. 비파괴 사용자 백업 및 복원 절차

### 자동 `.user-backup` 스냅샷

사용자 정의 수정 사항이 포함된 설정 파일을 입양하거나 갱신하기 전에, alpha-AOS는 타임스탬프가 포함된 백업 파일을 생성합니다:

```text
<config-path>.<timestamp>.user-backup
```

예시:
- `~/.codex/config.toml.20261109120000.user-backup`
- `~/.gemini/config/mcp_config.json.20261109120000.user-backup`

### 백업 무결성 진단

`alpha-aos doctor`를 실행하여 보존된 백업 파일의 가독성과 접근 권한을 점검할 수 있습니다:

```bash
alpha-aos doctor
```

백업이 존재하면 닥터에서 안내 항목을 보고합니다:

```text
[info] USER_BACKUP_RETAINED: User backup retained at ~/.codex/config.toml.20261109120000.user-backup (readable)
Next action: Review or archive backup files if migration verification is complete.
```

### 수동 복원 절차

마이그레이션 이전 설정으로 복원해야 하는 경우:
1. 해당 하네스 설정 폴더에서 `.user-backup` 파일을 찾습니다.
2. 백업 파일을 활성 설정 파일에 덮어씁니다:
   ```bash
   cp ~/.codex/config.toml.<timestamp>.user-backup ~/.codex/config.toml
   ```
3. `alpha-aos doctor`를 실행하여 설정 정합성을 다시 점검합니다.

---

## 5. 2-트랙 업데이트 모델

alpha-AOS v0.8.0은 외부 도구 릴리스 업데이트와 제어 평면 코드 배포를 엄격히 분리합니다:

```text
트랙 1: 외부 관리 도구 업데이트                트랙 2: alpha-AOS 엔진 코드 배포
------------------------------------           -----------------------------------
명령:    alpha-aos update                      명령:    npm run deploy:local (개발 워크스테이션)
범위:    Cua, GSD, ECC, MCP 서버                        npm install -g alpha-aos@latest (전역 패키지)
출처:    공식 패키지 및 드라이버 릴리스        범위:    CLI 디스패처, 어댑터, 포매터
```

### 트랙 1: 외부 관리 도구 업데이트

외부 도구 릴리스를 확인하고 적용할 때는 `alpha-aos update`를 사용합니다:

```bash
# 사용 가능한 외부 도구 릴리스 점검
alpha-aos update --check

# 전체 하네스에 도구 릴리스 적용
alpha-aos update --apply --plan-digest <DIGEST> --reviewed-plan <TOKEN>

# 특정 도구만 선별 갱신
alpha-aos update --tool cua-driver --apply --plan-digest <DIGEST> --reviewed-plan <TOKEN>
```

*참고: `alpha-aos update`는 alpha-AOS 엔진 코드를 수정하지 않습니다.*

### 트랙 2: alpha-AOS 엔진 업데이트 및 배포

alpha-AOS 자체 코드를 갱신할 때는 다음 절차를 따릅니다:

- **개인 개발 워크스테이션**:
  ```bash
  npm run deploy:local
  ```
  CLI를 빌드하고, 기동을 검증한 뒤 로컬 체크아웃을 직접 링크합니다.
- **전역 배포 환경**:
  ```bash
  npm install -g alpha-aos@latest
  ```

*정책 참고: 모든 업데이트는 사용자가 명시적으로 개시하며, 자동화된 외부 승격 루틴은 완전히 제거되었습니다.*

---

## 6. 하네스별 설정 참고사항

### Claude Code
- 설정 파일: `~/.claude.json`
- stdio MCP 서버 등록 및 사용자 호출 전용 스킬 오버라이드를 관리합니다.

### Codex
- 설정 파일: `~/.codex/config.toml` (또는 `$CODEX_HOME/config.toml`)
- `# alpha-aos:start mcp` 마커 블록을 사용합니다. 마커 외부의 커스텀 섹션은 온전히 보존됩니다.

### Antigravity
- 설정 파일: `~/.gemini/config/mcp_config.json`
- Antigravity GUI 및 CLI용 MCP 서버 및 소유 스킬을 등록합니다.

### Pi Agent
- 설정 파일: `~/.pi/agent/mcp.json` (또는 `$PI_CODING_AGENT_DIR/mcp.json`)
- `pi-mcp-adapter` 브리지를 통해 lazy 수명 주기로 도구를 라우팅합니다.

### Hermes Agent
- 설정 파일: `~/.hermes/config.yaml` (또는 `$HERMES_HOME/config.yaml`)
- YAML 설정 파일에 `alpha-aos-task` 스킬 자동 로드를 보존합니다.
