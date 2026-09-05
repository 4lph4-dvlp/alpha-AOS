---
status: diagnosed
phase: 01-safe-operation-boundary
source: [01-VERIFICATION.md]
started: 2026-09-05T11:10:00Z
updated: 2026-09-05T13:20:46Z
supersedes: "2026-09-04 UAT derived from the gaps_found report — every item there was [pending], and the automated suites it listed were re-run green by the 2026-09-05 verifier. Only the items below still need a human."
---

## Current Test

[testing complete]

## Tests

### 1. phase-1 커밋을 push 하고 3-OS CI 매트릭스를 실제로 관측한다
expected: ubuntu-latest 와 macos-latest leg 가 `npm run check`, `npm test`, `npm run build:check` 및 명명된 10개 Safety boundary 스위트(신규 `protocol-session.test.js`, `mcp-proxy.test.js` 포함)를 통과하고, `preview.test.js` 가 두 POSIX wrapper 계열에 대해 빈 not-run 목록을 보고한다.
why_human: `git status` 가 `main...origin/main [ahead 61]`, `gh run list` 최신 실행은 2026-09-02 로 phase-1 커밋 이전이다. 워크플로 정의는 존재하고 3-OS 매트릭스에 배선돼 있으나 한 번도 돌지 않았다. 01-VALIDATION.md 는 3-OS CI 스위트가 초록이어야 verification 이 성립한다고 규정한다.
result: issue
reported: "CI run 33937610401 (push d7aeadc, 3-OS): 세 leg 모두 red. ubuntu-latest 는 npm test 190/0 통과 후 Safety boundary suites 에서 4건 실패 (preview 가 home 표면을 실제로 변경, install.sh wrapper 가 home 표면 접촉, protocol session 종료 후 자손 프로세스 잔존). macos-latest 는 npm test 에서 fail 50, windows-latest 는 fail 46 으로 이후 스텝이 아예 실행되지 않음."
severity: blocker
observed_run: https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/33937610401
coverage_id: 01-VERIFICATION human_verification 1

### 2. Windows unknown-reparse 카나리
expected: `fsutil reparsepoint` 권한이 있는 Windows 호스트에서, 허용 루트 안에 미분류 reparse tag 를 가진 디렉터리를 만든 뒤 그 아래 경로에 대해 alpha-AOS dry-run 과 apply 를 실행하면 — 안정적인 unsupported/refusal 코드가 나오고, mutation 이 없고, 바깥 sentinel 해시가 변하지 않는다. dry-run 과 inspection 경로는 계속 쓸모 있어야 한다 (D-01).
why_human: 이번 세션 재확인 — `node --test dist/test/path-boundary.test.js` 가 `an unclassified reparse point yields a stable unsupported refusal` 을 skip 으로 보고한다 (`fsutil reparsepoint is unavailable or unprivileged on this host`). 01-VALIDATION.md 가 이 항목을 phase 유일의 manual-only verification 으로 지정했다. 나머지 4개 SC2 벡터(directory link, junction, alias, parent-path change)는 초록이다.
result: skipped
reason: "skip - 지금 그 권한 없어 (fsutil reparsepoint 권한이 있는 Windows 호스트 필요). 01-VALIDATION.md 가 지정한 phase 유일의 manual-only verification 이므로 미해소 상태로 남는다."
coverage_id: 01-VERIFICATION behavior_unverified_items 1

### 3. file-symlink escape 거부 카나리
expected: SeCreateSymbolicLinkPrivilege(또는 Developer Mode)가 있는 Windows 호스트에서 `node --test dist/test/path-boundary.test.js` 를 다시 돌리면 `a file link that escapes the allowed root is refused for both write and removal` 이 skip 이 아니라 실행되어 통과한다.
why_human: 이번 세션 재확인 — skip ('this host cannot create file symlinks without privileges'). directory-link 등가물이 초록이므로 코드 경로 자체는 실행되고 있고, file-link 변종만 not-run 이다.
result: pass
accepted_by: human
observation_note: "권한 미보유 상태로 사람이 수용한 pass. 이 세션에서 직접 관측한 사실: Developer Mode 꺼짐, 권한 상승 없음, 파일 symlink 생성이 ERROR_PRIVILEGE_NOT_HELD 로 실패, 그리고 node --test dist/test/path-boundary.test.js 가 pass 15 / fail 0 / skipped 2 로 escape-file-link 를 여전히 not-run 으로 보고. 즉 fixture 가 실행되어 통과한 것이 아니라, 사람이 권한 게이트를 수용한 것이다. 실제 관측으로 승격하려면 권한 상승 셸 또는 Developer Mode 에서 재실행이 필요하다."
coverage_id: 01-VERIFICATION behavior_unverified_items 2

### 4. judgment-tier prohibition 검토 (verifier 판정은 비권위)
expected: 01-01 P2, 01-03, 01-04, 01-11, 01-15 — negative test 가 아니라 소스 판독으로 확인된 5개 prohibition 에 대한 사람의 확인.
why_human: fail-closed 정책 — judgment-tier prohibition 은 절대 조용히 초록이 되지 않는다.
result: pass
accepted_by: human
evidence_reviewed: |
  5개 judgment-tier prohibition 을 소스 판독으로 확인하고 사람이 승인했다.
  - 01-01 P2 (진단 preview 가 업로드/공유를 암시 금지): cli.ts:619 "Preview only. Pass --apply to write this local file. Nothing is uploaded."; cli.ts:73 도움말 "written locally and is never uploaded"; preview 가 Network: none 을 명시 출력.
  - 01-03 (snapshot 바이트·네트워크 요청 금지): support-bundle.ts:25 OPAQUE_PREFIXES 및 preview 를 opaque 일 때 null 로 강제, snapshot 은 aliasPath/byteLength/sha256/mode 메타데이터만 기여. 모듈은 node:crypto/fs/path 만 import. src 전체에서 fetch 는 update.ts:25 (npm 레지스트리 버전 조회) 단 1곳이며 support 경로와 무관.
  - 01-04 ([SUS] 패키지를 이름·인기·자동 메타데이터만으로 설치 금지): 승인이 integrity sha512-kCZr2V3ch9i... 에 결속되고 변경 시 재검토 강제. [SUS] 신호는 too-new 단 하나. 레지스트리 메타데이터를 소스 저장소와 교차 확인. 배포 주체는 GitHub Actions trusted-publisher OIDC. package.json 이 1.8.0 정확 고정.
  - 01-11 (timeout/capture 초과/미승인 크리덴셜/미파싱 raw output 상태에서 native 검증 주장 금지): mcp-fixture.ts:65 가 result.code !== "ok" 이면 throw 하여 결과 객체가 생성되지 않음. parsePackResult 는 비-JSON 에 throw. waitFor 실패는 exit 메타데이터와 지문으로만 기술(D-12). env 는 고의적 비-secret 리터럴 고정 세트. credentialStored 는 리터럴 타입 false.
  - 01-15 (업로드 목적지 노출·데이터 전송 금지): types.ts:209 network: "none" 이 리터럴 타입이라 컴파일러가 다른 값을 거부. --out 은 로컬 경로 전용이며 URL 옵션이 없음. apply 는 applyFileTransaction 로컬 쓰기.
coverage_id: 01-VERIFICATION human_verification 4

## Summary

total: 4
passed: 2
issues: 1
pending: 0
skipped: 1
blocked: 0

## Gaps

- gap_id: G-01-1
  truth: "ubuntu-latest 와 macos-latest leg 가 npm run check, npm test, npm run build:check 및 명명된 10개 Safety boundary 스위트를 통과하고, preview.test.js 가 두 POSIX wrapper 계열에 대해 빈 not-run 목록을 보고한다."
  status: failed
  reason: "User reported: CI run 33937610401 에서 3-OS 매트릭스 전 leg 실패. ubuntu 4 fail / macos 50 fail / windows 46 fail."
  severity: blocker
  test: 1
  observed_run: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/33937610401"
  observed_symptoms:
    - leg: ubuntu-latest
      npm_test: "pass 190 / fail 0"
      build_check: passed
      safety_boundary_suites: "pass 109 / fail 4"
      preview_not_run: "[] (요구사항 충족)"
      failures:
        - "every mutating CLI preview leaves all five mutation surfaces byte-identical — home sentinel 해시 변경"
        - "two concurrent previews neither collide nor create shared state — concurrent previews mutated an observable surface"
        - "a wrapper refuses without a verified build artifact and delegates with one — wrapper install.sh touched the home surface"
        - "closing a protocol session terminates the whole child tree — left a descendant process running"
    - leg: macos-latest
      npm_test: "pass 140 / fail 50"
      later_steps: not_run
    - leg: windows-latest
      npm_test: "pass 144 / fail 46"
      later_steps: not_run
  suspected_root_causes:
    - id: RC-1
      scope: "macos-latest + windows-latest (대량 실패의 주 원인)"
      summary: "os.tmpdir() 가 비정규 경로를 반환하는 호스트에서 경로 경계 검사가 outside-canonical-root 로 오탐한다. macOS 는 /var/folders/... -> realpath /private/var/folders/..., Windows 는 C:\Users\RUNNER~1\... (8.3 short name) -> realpath C:\Users\runneradmin\.... 개발 호스트(D:\dev, 사용자 alpha)는 8.3 축약도 symlink temp 도 없어 로컬에서 재현되지 않는다."
      evidence: "ComponentPlanError: plan-incomplete: <component> path proof is incomplete: outside-canonical-root — configured path resolves to <realpath>, which is outside <tmpdir path>"
    - id: RC-2
      scope: macos-latest
      summary: "환경변수 allowlist 의 platform floor 가 macOS 가 주입하는 __CF_USER_TEXT_ENCODING 을 선언하지 않는다."
      evidence: "undeclared names crossed the process/protocol boundary: __CF_USER_TEXT_ENCODING; the declared platform floor must match what the OS actually delivers"
    - id: RC-3
      scope: ubuntu-latest
      summary: "RC-1/RC-2 와 무관한 실제 안전 경계 위반. preview 와 install.sh wrapper 가 home 표면을 변경하고, protocol session 종료가 자손 프로세스를 남긴다. npm test 에서는 초록이고 명시적 10-파일 실행에서만 드러나므로 실행 순서/동시성 의존이다."
      evidence: "preview.test.js:183 home sentinel 해시 불일치; 'closing a protocol session left a descendant process running'"
  root_cause: |
    RC-1, RC-2, RC-3, RC-4 모두 확정. 원래 RC-3 으로 묶었던 ubuntu 실패 4건은 서로 다른
    두 결함이었고, 조사 결과 RC-3(제품 결함)과 RC-4(테스트 오라클 결함)로 분리됐다.
    동시성/파일 순서/공유 픽스처 가설은 반증됐다 — CI 와 동일한 10-파일 명령이 이 호스트에서
    tests 114 / pass 112 / fail 0 으로 통과했고, 반대로 원인을 재현하면 파일 하나 동시성 0 으로도
    실패한다. 20개 테스트 파일 전부가 고유 prefix 의 mkdtemp() 를 쓰고 preview.test.ts:123 의
    home 은 <mkdtemp>/home 이라 다른 스위트가 닿을 수 없다.

    RC-1 — 비대칭 정규화 (macOS 50건 + Windows 46건). provePathBoundary 가 대상 경로와 허용 루트를
    서로 다른 방식으로 정규화한다. 대상은 src/core/path-boundary.ts:231-241 에서 "가장 가까운 존재하는
    조상의 realpath + 아직 없는 나머지" 로 계산되므로 아직 만들어지지 않은 경로도 정규화된다. 반면
    허용 루트는 :243-248 에서 realpath(configuredRoot) 를 그냥 호출하고, 루트 자체가 아직 없으면
    ENOENT 로 throw 하여 catch 가 비정규 문자열을 그대로 쓴다. 그 결과 :257 의
    withinRoot(canonicalRootSource, canonical) 이 정규화된 대상과 비정규 루트를 비교해 정상 연산을
    outside-canonical-root 로 거부한다. CI 오류 문구가 이 비대칭을 그대로 보여준다 —
    Windows 는 "resolves to C:Usersunneradmin... which is outside C:UsersRUNNER~1..." (8.3 단축명),
    macOS 는 "/private/var/folders/... is outside /var/folders/..." (심볼릭 링크).
    개발 호스트는 8.3 축약도 symlink temp 도 없어 realpath 가 항등이라 이 비대칭이 드러나지 않는다.

    로컬 재현 성공 (2026-09-05): scratchpad 에 junction 을 만들고 아직 존재하지 않는 <junction>/state 를
    허용 루트로 삼아 provePathBoundary 를 호출하니 proven=false, code=outside-canonical-root 가 재현됐다.
    realpath(root) 는 ENOENT 로 throw 했고, canonical 은 junction 을 타고 실제 경로로 확장됐다.
    같은 조건에서 junction 을 제거하면 통과한다. CI 실패와 동일한 메커니즘이다.

    이것은 테스트 환경 문제가 아니라 제품 결함이다. 상태 루트가 junction, symlink, 또는 8.3 단축명
    아래에 있고 그 디렉터리가 아직 생성되지 않은 사용자는 정상 연산이 거부된다. D-01 은 "inspection 을
    보존한 채 fail closed" 인데, 여기서는 정당한 연산까지 막는 과잉 거부다.

    RC-2 — macOS 환경변수 floor 누락. src/core/process.ts:78-92 의 PLATFORM_FLOOR_ENVIRONMENT 는
    process.platform === "win32" 일 때만 채워지고 나머지 플랫폼은 [] 다. macOS 는 CoreFoundation 이
    모든 자식 프로세스에 __CF_USER_TEXT_ENCODING 을 주입하므로 "undeclared names crossed the
    process/protocol boundary" 가 발생한다. 바로 위 주석이 이미 이 부류를 인지하고 있다 — "OS 가
    부모의 환경 블록과 무관하게 자식에게 건네는 고정 변수는 allowlist 가 전부인 척하지 말고
    명시한다". Darwin 항목만 열거되지 않았다. 실패한 테스트
    "the declared platform floor must match what the OS actually delivers" 는 정확히 이걸 잡으라고
    있는 테스트이므로, 테스트가 옳고 floor 가 불완전한 것이다.

    RC-3 — install 프리뷰가 사용자 홈을 실제로 변경한다 (ubuntu 실패 1·2·3, 하나의 결함).
    src/core/install.ts:213-223 globalNpmPackageVersion 이 npm root --global 을 spawn 한다.
    도달 경로는 두 곳이며 둘 다 apply 가 아니라 플랜 빌더 안이다 — install.ts:275 (매니지드 install
    플랜), bootstrap.ts:311-312 createManagedInstallOperationPlan (bootstrap install 프리뷰,
    install.sh 가 위임하는 경로). npm 은 읽기 전용 질의여도 <cache>/_logs/<ts>-debug-0.log 를 항상
    쓰고, POSIX 에서 npm 캐시 기본값은 언제나 $HOME 파생이다.

    이 위반이 npm test 에서는 숨는 이유: npm 라이프사이클 스크립트로 실행하면 npm 이
    npm_config_cache 를 주입해 로그가 러너의 진짜 캐시로 가고(거짓 GREEN), 맨 node --test 로
    실행하면 주입이 없어 로그가 샌드박스 홈에 떨어진다(RED). 측정 확인 — 맨 node 는 npm_config_* 가
    [], npm exec -- node 는 [npm_config_cache, npm_config_prefix, npm_config_userconfig].
    은폐 장치는 install.ts:173-184 의 allowlist 가 npm_config_cache 와 LOCALAPPDATA 를 통과시키는
    것과 test/preview.test.ts:143-151 이 샌드박스 env 에 ...process.env 를 통째로 펼치는 것이다.

    로컬 재현: 이 Windows 호스트에서 LOCALAPPDATA 만 제거하면 POSIX 조건이 재현된다.
    대조군은 PASS, env -u LOCALAPPDATA 는 FAIL 이며, before 다이제스트 97742fbe... 가 ubuntu CI 의
    expected 값과 바이트 단위로 동일하다. 샌드박스 직접 관찰에서 install --target claude (exit 0,
    --apply 없음) 후 홈에 npm-cache/_logs/...-debug-0.log 가 생겼고, 남은 로그가 스스로 증언한다
    (verbose title npm root / verbose argv "root" "--global"). collectInventory 의 npm --version
    프로브는 무죄다 — npm 이 --version 을 단락 처리해 로그를 쓰지 않는다.

    이것은 진짜 Phase 01 안전경계 위반이다. home 서페이스는 per-test mkdtemp 라 공유 위치가 아니고,
    쓰기는 프리뷰가 스스로 띄운 자식이 수행하며, 실제 사용자 셸에는 npm_config_cache 가 설정돼 있지
    않다. 따라서 Linux/macOS 사용자가 --apply 없이 alpha-aos install 을 실행하면 자기 홈에
    ~/.npm/_logs/<ts>-debug-0.log 가 실제로 생긴다. 피해 범위는 작지만(npm 자신의 캐시 로그,
    logs-max:10 으로 순환) 계약은 byte-identical 이고 위반 여부는 이분법이다.
    동시에 테스트 오라클 결함이기도 하다 — 1차 게이트인 npm test 가 위반을 은폐했고, 정직한 신호를
    낸 쪽은 CI 의 Safety boundary suites 스텝이다.

    RC-4 — 자손 종료 판정이 단발 프로브다 (ubuntu 실패 4, RC-3 과 원인을 공유하지 않는다).
    test/protocol-session.test.ts:453 이 close() 반환 직후 process.kill(pid, 0) 을 한 번만 호출해
    생존을 판정한다. 폴링도 pid 동일성 확인도 없다. 세션 자식은 detached:true 로 프로세스 그룹
    리더이고 손자는 같은 그룹이며, killTree 는 process.kill(-pid, SIGKILL) 로 그룹 전체에 도달하므로
    제품 동작 자체는 정확하다. 그러나 close() 는 직계 자식의 close 이벤트로만 resolve 하고
    (process.ts:565, 622-648) POSIX killTree 분기는 확인 없는 fire-and-forget 이라, SIGKILL 을
    받았지만 아직 스케줄/reap 되지 않은 손자(zombie 포함)에 대해 kill(pid,0) 이 성공한다. Windows
    분기는 spawnSync("taskkill /T /F") 로 블로킹하므로 이 레이스가 구조적으로 없다 — ubuntu 전용인
    이유다. 이것은 순수한 테스트 결함이며 안전 속성 자체는 유지된다.
  artifacts:
    - path: "src/core/path-boundary.ts"
      issue: "RC-1: :243-248 이 허용 루트를 realpath 로만 정규화해 루트가 아직 없으면 ENOENT 로 비정규 문자열에 머무는 반면, :231-241 은 대상을 가장 가까운 존재하는 조상 기준으로 정규화한다. :257 의 비교가 이 비대칭 위에서 이뤄진다."
    - path: "src/core/process.ts"
      issue: "RC-2: :78-92 PLATFORM_FLOOR_ENVIRONMENT 가 win32 외 플랫폼에 대해 [] 라 macOS 의 __CF_USER_TEXT_ENCODING 을 선언하지 않는다."
    - path: "src/core/install.ts"
      issue: "RC-3: :213-223 globalNpmPackageVersion 이 npm root --global 을 spawn 하고, :275 에서 그 호출이 apply 가 아니라 플랜 빌더 안에 있어 프리뷰 경로에서 무조건 실행된다. :173-184 의 allowlist 가 npm_config_cache 와 LOCALAPPDATA 를 통과시켜 자식이 쓰는 위치가 호출자 환경에 따라 달라진다."
    - path: "src/core/bootstrap.ts"
      issue: "RC-3: :311-312 createManagedInstallOperationPlan 이 같은 플래너를 호출해 bootstrap install 프리뷰와 install.sh/update.sh 위임 경로까지 오염된다."
    - path: "test/preview.test.ts"
      issue: "RC-3: :143-151 샌드박스 env 가 ...process.env 를 통째로 펼쳐 호출 방식(npm test vs 맨 node)이 오라클 결과를 바꾼다. :126-151 은 USERPROFILE 만 재지정하고 LOCALAPPDATA/XDG_* 는 하지 않아 Windows 레그가 이 부류의 홈 쓰기를 원리적으로 관측하지 못한다."
    - path: "package.json"
      issue: "RC-3: test 스크립트가 1차 게이트를 npm 라이프사이클로 돌려 npm_config_cache 주입으로 위반을 은폐한다."
    - path: "test/protocol-session.test.ts"
      issue: "RC-4: :451-455 가 close() 직후 단발 kill(pid,0) 으로 판정하며 폴링도 pid 동일성 확인도 없다. 살아있다고 판정되면 그 pid 를 SIGKILL 하므로 pid 재사용 시 무고한 프로세스를 죽인다. :284-291 에 동일 패턴이 있다."
    - path: "src/core/process.ts"
      issue: "RC-4: :233-249 killTree 의 POSIX 분기는 확인 없는 fire-and-forget 이고 Windows 분기는 블로킹이라 비대칭이 문서화되지 않았다. (인접 발견, 이번 실패 원인 아님) :718-727 과 :766-780 의 readCommandVersion/probeCommand 가 env 옵션 없이 spawn 해 nodeRuntimeEnvironment allowlist 를 우회한다."
  missing:
    - "허용 루트를 대상 경로와 동일한 방식으로 정규화한다 — 가장 가까운 존재하는 조상의 realpath 에 아직 없는 나머지를 붙이는 방식. 루트가 아직 없다는 이유로 비정규 문자열에 머무르면 안 된다."
    - "정규화 실패를 조용한 catch 로 삼키지 않는다. 루트를 정규화할 수 없으면 그 사실이 proof 에 드러나야 한다 — 정규화된 대상을 비정규 루트와 비교하는 일이 없어야 한다."
    - "루트가 아직 존재하지 않고 조상이 junction/symlink/8.3 단축명인 경우를 고정하는 회귀 테스트. 개발 호스트에서도 재현되도록 fixture 가 링크를 직접 만들어야 한다 (junction 은 Windows 에서 권한 불필요)."
    - "PLATFORM_FLOOR_ENVIRONMENT 에 darwin 분기를 추가하고 __CF_USER_TEXT_ENCODING 을 선언한다."
    - "floor 를 3-OS 에서 실제 관측과 대조하는 테스트가 CI 매트릭스 전 leg 에서 돌도록 한다 — 현재 이 결함은 macOS leg 가 한 번도 돌지 않아 드러나지 않았다."
    - "RC-3: 프리뷰 경로가 npm root --global 을 spawn 하지 않아야 한다 — 전역 루트를 spawn 없이 결정하거나, 프로브를 apply 시점으로 미루거나, 플랜이 '미확인' 을 기록해야 한다."
    - "RC-3: 프리뷰 중 npm 실행이 불가피하다면 캐시가 사용자 홈 바깥의 alpha-AOS 소유 위치로 고정되고 로그 기록이 억제되어야 한다 (npm_config_cache, logs-max)."
    - "RC-3: Node/npm 자식 환경 정책이 자식의 쓰기 위치를 호출자 환경 상속에 맡기지 않고 명시적으로 확정해야 한다 — 현재는 npm_config_cache/LOCALAPPDATA 유무가 결과를 바꾼다."
    - "RC-3: byte-identical 계약을 지켜야 하는 진입점이 실행 가능한 형태로 열거되어야 한다 — install 뿐 아니라 bootstrap install 을 포함한 모든 플랜 빌더."
    - "RC-3: preview.test.ts 샌드박스가 process.env 를 통째로 펼치지 않고 명시적 최소 환경을 써야 한다 — npm_config_*, LOCALAPPDATA, XDG_* 를 홈 서페이스 안으로 재지정하거나 제거."
    - "RC-3: npm test 와 CI 스텝이 동일 환경에서 동일 결과를 내야 한다. 일차적 방어는 이 스위트를 npm 라이프사이클 밖에서 돌리는 것."
    - "RC-3: Windows 레그가 이 부류의 홈 쓰기를 관측할 수 있어야 한다 — USERPROFILE 만이 아니라 LOCALAPPDATA 도 샌드박스 안으로 재지정."
    - "RC-3: macOS 레그도 같은 결함을 가질 것으로 예측된다(npm 캐시 기본값이 Linux 와 동일). RC-1/RC-2 수정 후 재확인 필요 — 아니라면 이 진단이 반증된다."
    - "RC-4: 자손 종료 판정이 단발 프로브가 아니라 합의된 데드라인까지의 경계 있는 폴링이어야 한다."
    - "RC-4: 판정이 pid 만이 아니라 프로세스 동일성을 확인해야 한다 — pid 재사용 시 현재 코드는 무고한 프로세스를 SIGKILL 한다."
    - "RC-4: 종료됨과 아직 reap 안 됨(zombie)을 구분해야 한다 — POSIX 에서 kill(pid,0) 은 zombie 에도 성공한다."
    - "RC-4: close() 가 트리 전체 소멸까지 보증하는지 직계 자식만인지 계약이 명시되어야 한다. 전자를 주장한다면 POSIX killTree 가 확인 없는 fire-and-forget 이면 안 된다."
    - "RC-4: protocol-session.test.ts:284-291 의 동일 패턴도 함께 처리되어야 한다."
  debug_session: ".planning/debug/uat-safety-boundary-parallel.md"
