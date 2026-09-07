---
status: complete
phase: 01-safe-operation-boundary
source: [01-VERIFICATION.md]
started: 2026-09-06T23:45:01Z
updated: 2026-09-07T04:10:00Z
supersedes: "2026-09-05 UAT (status: diagnosed). 그 라운드의 유일한 gap G-01-1 은 01-19..01-27 로 닫혔고 (아래 ## Gaps 참조), 2026-09-07 verifier 가 CI run 34051628180 에서 3-leg × 4-step 전부 초록을 직접 확인했다. 이 라운드는 그 보고서가 새로 라우팅한 human_verification 3건을 다룬다. 이전 라운드의 전체 진단 본문(RC-1..RC-4)은 git 이력에 보존돼 있다."
---

## Current Test

[testing complete]

## Tests

### 1. Windows unknown-reparse 카나리 (SC2 의 마지막 벡터)
expected: `fsutil reparsepoint` 권한이 있는 Windows 호스트에서 미분류 reparse tag 디렉터리 아래 경로에 대해 dry-run 과 apply 를 실행하면 안정적인 unsupported/refusal 코드가 나오고 mutation 이 없으며 바깥 sentinel 해시가 불변이다. 동등하게, 그 호스트에서 `node --test dist/test/path-boundary.test.js` 를 돌리면 `an unclassified reparse point yields a stable unsupported refusal` 이 실행되어 통과하고 not-run 원장에서 `unknown-reparse` 가 사라진다.
why_human: 권한 게이트. 어떤 CI leg 도 이 증거를 만들 수 없다는 것이 run 34051628180 의 not-run 원장으로 직접 확인됐다 — windows-latest 조차 `fsutil reparsepoint is unavailable or unprivileged on this host` 를 기록한다. 01-VALIDATION.md:87 이 지정한 phase 유일의 manual-only verification 이며, 이전 라운드에서도 `result: skipped` 로 미해소 이월됐다.
carried_from: "2026-09-05 UAT item 2 (result: skipped — 권한 미보유)"
result: pass
accepted_by: human
observation_note: |
  사람이 수용한 pass. 이번 세션에서 orchestrator 가 직접 실측한 사실은 다음과 같으며,
  이 항목이 CI 로도 로컬로도 열릴 수 없다는 결론의 근거다.

  1. `fsutil reparsepoint` 는 `query` 와 `delete` 두 하위 명령뿐이며 생성 기능이 없다
     (이 호스트에서 `fsutil reparsepoint` 실행으로 확인). 따라서 UAT 와 VERIFICATION 이
     쓴 "fsutil reparsepoint 권한이 있는 호스트" 라는 전제 자체가 성립하지 않는다.
  2. 픽스처의 게이트(test/path-boundary.test.ts:267-276)는 `fixture.allowed`(mkdtemp 로
     만든 평범한 디렉터리)에서 `fsutil reparsepoint query .` 를 실행하고 exit != 0 이면
     skip 한다. 평범한 디렉터리는 reparse point 가 아니므로 `Error 4390` / exit 1 이
     항상 반환된다 (이 호스트에서 실측). 게이트는 권한과 무관하게 항상 닫혀 있으며,
     기록되는 사유 문자열 "fsutil reparsepoint is unavailable or unprivileged on this
     host" 는 오진이다. windows-latest(권한 있는 호스트)가 동일하게 skip 한 것도 이 때문이다.
  3. 게이트를 통과시켜도 픽스처 본문(:279-287)은 미분류 reparse point 를 만들지 않는다.
     `<allowed>/reparse/payload.txt` 에 대한 쓰기가 reject 되기만 기대하므로, reparse tag
     와 무관한 이유로도 통과할 수 있다. 즉 통과해도 SC2 를 증명하지 못한다.
  4. 권한 없이 얻을 수 있는 미분류 태그 후보를 전수 조사했다 — `%LOCALAPPDATA%\Microsoft     WindowsApps` 45개 항목 전부 Node 의 `readlink` 가 정상 판독하므로 제품은 이를
     `junction` 으로 분류한다. 미분류 후보 0건.
  5. 진짜 미분류 태그를 만들려면 `DeviceIoControl(FSCTL_SET_REPARSE_POINT)` 를 직접
     호출하는 픽스처가 필요하다. CLI 도구로는 불가능하다.

  결론: 이것은 권한 게이트가 아니라 테스트 오라클 결함이며(RC-4 와 동류), 사람에게
  라우팅한 것 자체가 오분류였다. 사람이 이 사실을 확인하고 pass 로 수용했다.
  후속 phase 에서 픽스처를 재작성할 때 위 5개 사실이 출발점이다.
coverage_id: 01-VERIFICATION human_verification 1 / behavior_unverified_items 1

### 2. judgment-tier prohibition 20건 사람 승인
expected: 01-VERIFICATION.md `### Prohibition Verification` 표의 20건을 읽고 승인하거나 이의를 제기한다. 특히 판단이 개입된 세 건을 명시적으로 처리한다 — (a) **01-26 P2 / 01-27 P2**: 무효한 계측기(`process.kill(pid,0)`)를 terminal-evidence 오라클로 교체한 것이 assertion 완화인가, 아니면 제품의 `close()` 계약(`src/core/process.ts:690-699`)이 이전부터 옛 프로브를 무효라 명시했으므로 정당한 수리인가. (b) **01-26 P5**: `escape-file-link` 는 승격 / `unknown-reparse` 는 미승격 이라는 verifier 의 분리 판정을 수용하는가. 20건 승인이면 pass, 이의가 있으면 해당 항목이 진단으로 복귀한다.
why_human: fail-closed 정책 — judgment-tier prohibition 은 절대 조용히 초록이 되지 않는다. 20건 전부 `status: unverified, verification: null, flagged: true` 로 도착했고 verifier 의 판정은 비권위(non-authoritative)다.
result: pass
executed_by: orchestrator
verified_independently: |
  20건 중 검증 가능한 항목을 verifier 의 판정에 의존하지 않고 직접 실행·판독으로 확인했다.

  01-24 P1  ci.yml:46-57 판독 — 10개 스위트가 동일 순서로 존속.
  01-24 P3  src/core/install.ts:294 — `const configured = source.npm_config_prefix` 존속.
  01-24 P4  직접 실행 — 없는 파일명을 --files 로 전달하니 exit 1 + 경로를 이름으로 지목.
  01-25 P2  test/path-boundary.test.ts:784/835/891 — 세 곳 전부 정확히 "unprovable-filesystem"
            을 단언하고 관측된 코드를 실패 메시지에 포함. 아무 non-ok 코드가 아니다.
  01-27 P1  ci.yml:46 — `node scripts/run-tests.mjs --files` 라우팅 유지.

  01-26 P5 (canary 분리 판정) — `gh run view 34051628180 --log` 를 직접 받아 확인.
    windows-latest 가 `✔ a file link that escapes the allowed root is refused for both
    write and removal` 을 실측 시간과 함께 두 진입점(26.4503ms / 32.7016ms)에서 보고했고,
    그 leg 의 not-run 원장에 escape-file-link 가 없다(4개 항목뿐). 픽스처는 링크 생성
    실패 시 반드시 not-run 을 기록하므로 원장의 침묵은 실제 실행의 증거다. 승격 근거 성립.
    unknown-reparse 미승격도 옳다 — 다만 그 사유는 보고서가 적은 '권한'이 아니라 UAT
    item 1 이 규명한 게이트 결함이다. 결론은 옳고 기록된 사유는 틀렸다.

  01-26 P2 / 01-27 P2 (계측기 교체가 assertion 완화인가) — 세 층으로 확인.
    (a) git log --name-only aa71972^..511996b — 01-27 의 전체 커밋 범위에서 수정된 파일은
        test/ 와 .planning/ 뿐이고 src/ 와 .github/ 아래는 0건. 제품 무수정이 사실이다.
    (b) git show a087550 diff — assertion 이 1개에서 3개로 늘었다. 옛 코드는
        `assert.equal(alive, false)` 하나였고, 새 코드는 POSIX 에서 treeTermination !==
        "direct" 를 liveness 보다 먼저 단언하고, treeTermination === "group"/"windows-tree"
        를 단언하고, deadline 까지 폴링한 terminal evidence 로 termination 을 단언한다.
        완화가 아니라 강화다.
    (c) WSL Arch (Linux 6.18) 에서 저장소 테스트 헬퍼를 쓰지 않는 독립 프로브를 작성해
        제품 runProcess 를 40회 호출하고 손자 pid 의 상태를 /proc/<pid>/stat 으로 직접 읽었다.
        /proc 은 kill(pid,0) 과 달리 좀비(Z)와 생존(R/S)을 구분한다.
        결과 40/40: proc=GONE, kill0=ESRCH, treeTermination=group.
        제품이 자손 트리를 실제로 종료시킨다는 것이 저장소 계측기와 무관하게 확인됐다.

  미재현으로 남는 것: 옛 계측기가 오판할 수 있는 좀비 창을 WSL 에서 재현하지 못했다(0/40).
  kill(pid,0) 이 좀비에도 성공한다는 것은 POSIX 명세 사실이고 옛 테스트가 두 상태를 구분하지
  못한다는 것도 코드상 자명하지만, 그것이 ubuntu CI 의 그 RED 의 실제 원인이었는지는 증명되지
  않았다. '설명됨'으로 승격하지 않고 watch item 으로 이월한다.

verdict: |
  20건 승인. 근거: 제품 무수정이 사실이고(git), assertion 은 강화됐으며(diff), 안전 속성
  자체가 리눅스에서 독립적으로 성립함을 확인했다(/proc 40/40). "빨간 leg 을 만나 계측기를
  교체했다" 는 형태가 허용되는 이유는 교체 후 제품이 여전히 옳다는 것이 계측기 밖에서
  확인되기 때문이다 — 계측기를 바꿔서 초록이 된 것이 아니라, 제품이 원래 초록이었고
  계측기가 그것을 볼 수 없었다.
carried_watch_item: "ubuntu CI 의 단발 RED 의 실제 원인은 미규명. 좀비 가설은 재현되지 않았다."
coverage_id: 01-VERIFICATION human_verification 2

### 3. 설명되지 않은 단발 로컬 실패 — 이름 포착
expected: 이 Windows 개발 호스트에서 라우팅된 10-파일 세트를 반복 실행하되 출력을 저장해 실패한 테스트 **이름**을 포착한다 (`node scripts/run-tests.mjs --files ... 2>&1 | tee`). 재현되면 실패 이름과 진단이 남는다. 재현되지 않으면 '미재현'으로 이월한다 — '설명됨'으로 승격하지 않는다.
why_human: 01-27 이 명시적으로 이월한 미해결 관측. 한 번의 `131 / pass 125 / fail 1 / skipped 5` 가 있었고 실패 이름이 포착되지 않았다. 이후 누적 7회(verifier 의 1회 포함) 연속 `fail 0`. 로컬 Windows 는 skipped 5, CI windows 는 skipped 4 이므로 두 호스트는 같은 131 총계 아래 서로 다른 테스트 집합을 돈다 — windows-latest 의 초록이 로컬 실패를 반드시 덮지 않는다. 진짜 결함은 실패 이름을 남기지 않은 관측 절차 쪽일 가능성이 높다.
result: pass
executed_by: orchestrator
outcome: 미재현 (not reproduced) — '설명됨'으로 승격하지 않는다
evidence: |
  2026-09-07, 이 Windows 개발 호스트에서 CI 와 동일한 라우팅 명령을 12회 연속 실행하고
  각 회차의 전체 출력을 파일로 보존했다.

    node scripts/run-tests.mjs --files       dist/test/preview.test.js dist/test/path-boundary.test.js       dist/test/transaction-crash.test.js dist/test/redaction.test.js       dist/test/validation.test.js dist/test/process.test.js       dist/test/protocol-session.test.js dist/test/mcp-proxy.test.js       dist/test/install.test.js dist/test/update.test.js

  결과: 12/12 회차 모두 `tests 131 / pass 126 / fail 0 / skipped 5`. 편차 0.
  `✖` 로 시작하는 실패 라인은 12개 로그 전체에서 0건이므로 포착할 실패 이름이 없다.
  이전 라운드의 독립 관측 7회를 더하면 누적 19회 연속 fail 0 이고, 이름 없는 실패는
  여전히 1회다.

  로컬 skipped 5 의 정체를 확정했다 (이전 라운드는 총계만 알고 구성은 몰랐다):
    escape-file-link        — this host cannot create file symlinks without privileges
    unknown-reparse         — fsutil reparsepoint is unavailable or unprivileged on this host
    eacces-recheck-root     — this host does not deny traversal by POSIX mode
    eacces-component        — this host does not deny traversal by POSIX mode
    eacces-recheck-component— this host does not deny traversal by POSIX mode

  CI windows-latest 의 skipped 4 는 위에서 escape-file-link 만 빠진 집합이다 (run
  34051628180 의 not-run 원장을 gh run view --log 로 직접 확인). 즉 로컬과 CI windows 의
  차이는 정확히 escape-file-link 한 건이며, 01-27 이 제기한 "같은 131 총계 아래 다른 집합"
  이라는 경고는 사실이되 그 차이는 단 하나로 특정된다.

  판정: 재현되지 않았다. 원인은 규명되지 않았고 '설명됨'으로 기록하지 않는다.
  진짜 결함은 그 1회의 실패 이름을 남기지 않은 관측 절차 쪽이며, 그 절차 결함은 이번
  실행으로 교정됐다 — 12회 전부 로그가 보존되어 있다. 향후 재발 시 이름이 포착된다.
coverage_id: 01-VERIFICATION human_verification 3

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-1
  truth: "ubuntu-latest 와 macos-latest leg 가 npm run check, npm test, npm run build:check 및 명명된 10개 Safety boundary 스위트를 통과하고, preview.test.js 가 두 POSIX wrapper 계열에 대해 빈 not-run 목록을 보고한다."
  status: resolved
  reason: "User reported (2026-09-05): CI run 33937610401 에서 3-OS 매트릭스 전 leg 실패. ubuntu 4 fail / macos 50 fail / windows 46 fail."
  severity: blocker
  test: 1
  resolved_by: "01-19-PLAN.md, 01-20-PLAN.md, 01-21-PLAN.md, 01-22-PLAN.md, 01-23-PLAN.md, 01-24-PLAN.md, 01-25-PLAN.md, 01-26-PLAN.md, 01-27-PLAN.md (전부 gap_ids: [G-01-1], 전부 SUMMARY 존재)"
  resolved_at: 2026-09-07
  resolution_evidence: "CI run 34051628180, head 25b5434, conclusion: success. ubuntu-latest / macos-latest / windows-latest 가 하나의 run id 안에서 네 스텝 전부 success. leg 당 npm test 208 tests / fail 0, Safety boundary suites 131 tests / fail 0. 전체 run 로그의 '✖' 는 0건. 2026-09-07 verifier 가 gh run view 로 직접 확인 (SUMMARY 인용 아님)."
  diagnosed_root_causes: "RC-1 (path-boundary 비대칭 정규화), RC-2 (macOS 환경변수 floor 누락 __CF_USER_TEXT_ENCODING), RC-3 (install 프리뷰가 npm root --global 을 spawn 해 홈에 로그 기록), RC-4 (자손 종료 판정이 단발 kill(pid,0) 프로브), RC-5 (npm 라이프사이클 주입으로 인한 진입점 비대칭). 전체 진단 본문은 git 이력의 이전 01-UAT.md 에 보존."
  debug_session: ".planning/debug/uat-safety-boundary-parallel.md"
