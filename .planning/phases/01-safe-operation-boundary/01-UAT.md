---
status: complete
phase: 01-safe-operation-boundary
source: [01-VERIFICATION.md]
started: 2026-09-05T11:10:00Z
updated: 2026-09-05T13:00:41Z
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
  artifacts: []
  missing: []
