---
phase: 01-safe-operation-boundary
plan: 27
subsystem: testing
tags: [process-termination, ci-matrix, three-os, broken-windows, safe-06, node-test]

requires:
  - phase: 01-26
    provides: "run 34046336104 의 2-of-3 관측과, ledger #2/#3/#4 의 증거 줄이 전사된 채 열려 있는 상태"
  - phase: 01-24
    provides: "`Safety boundary suites` 를 scripts/run-tests.mjs --files 로 라우팅한 CI 스텝 (RC-5 수리)"
  - phase: 01-22
    provides: "classifyProcessSample / nonce heartbeat / ProcessResult.treeTermination"
provides:
  - "test/helpers/termination-oracle.ts — 이 저장소의 유일한 termination 계측기 (두 스위트가 함께 판정)"
  - "terminal evidence 로 판정하고 treeTermination 을 단언하는 descendant 종료 테스트, POSIX `direct` 는 자체 메시지로 먼저 실패"
  - "leg 마다 `descendant termination evidence (<platform>)` 진단 줄 — 초록 leg 도 어떻게 초록인지 말한다"
  - "run 34051628180 — 세 leg 모두 초록인 하나의 run id. G-01-1 의 종료 증거"
  - "Broken Windows ledger 처분: #7/#2/#3/#4 fixed, #5/#6 open"
affects: [01-VERIFICATION, 01-UAT, phase-07-release-matrix]

actuals:
  tokens: 22600
  tasks: 3
  commits: 8

tech-stack:
  added: []
  patterns:
    - "종료 판정은 하나의 공유 계측기를 통과한다: 두 스위트가 같은 오라클로 같은 판정을 낸다"
    - "초록 leg 도 진단 줄을 남긴다 — 침묵은 증거가 아니다"
    - "ledger 처분은 leg 이 실제로 생산한 줄에만 대고 한다 (`not observed yet` ≠ `observed and negative`)"

key-files:
  created:
    - test/helpers/termination-oracle.ts
  modified:
    - test/process.test.ts
    - test/protocol-session.test.ts
    - .planning/WINDOWS.md

key-decisions:
  - "ledger #7 은 `unrun-verify` 가 아니라 `deviation` 으로 등록됐다: 무효한 도구가 실제로 출하돼 실제 leg 을 결정했으므로, 이것은 진단이 끝난 결함이지 아직 돌지 않은 검증이 아니다"
  - "상태 (b) 로 판정: 하나의 run id(34051628180)에서 세 leg 모두 초록이고, 세 leg 모두 terminal evidence 와 건강한 treeTermination 을 보고했다. G-01-1 은 이 run id 위에서 닫힌다"
  - "ubuntu 의 이전 빨간 칸은 제품 결함이 아니라 무효한 계측기였다 — 그러나 '왜 하필 그 run 에서 기울었는가' 는 여전히 가설이며 확립된 원인으로 기록하지 않는다"
  - "windows-latest 가 `escape-file-link` 픽스처를 실제로 실행했다는 관측은 plan 의 전제와 어긋난다. 관측은 기록하되 UAT 항목을 여기서 승격시키지 않는다 (01-UAT.md 는 files_modified 밖)"
  - "01-VERIFICATION.md 는 손대지 않는다 — G-01-1 의 공식 상태는 verifier 가 소유하고, 이 SUMMARY 는 그 종료 증거를 제출한다"

patterns-established:
  - "계측기 교체는 이동이지 재작성이 아니다: 이전 스위트의 통제 테스트가 새 계측기를 그대로 판정한다"
  - "leg 별 진단 전사는 초록 leg 을 포함한다 — 라운드가 산 정보는 초록 자체가 아니라 초록의 이유다"

requirements-completed: [SAFE-01, SAFE-06]

coverage:
  - id: D1
    description: "termination 오라클이 test/helpers/termination-oracle.ts 하나로 추출되고 두 스위트가 그것을 통해 판정한다 (이동이지 재작성이 아님)"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/protocol-session.test.ts#the termination oracle distinguishes a running descendant from a terminated one"
        status: pass
      - kind: unit
        ref: "test/protocol-session.test.ts#the termination classifier never reads a stalled heartbeat as a stopped process"
        status: pass
      - kind: integration
        ref: "CI run 34051628180 — `npm test` 208 tests / fail 0 on all three legs"
        status: pass
    human_judgment: false
  - id: D2
    description: "descendant 종료가 terminal evidence 로 판정되고 ProcessResult.treeTermination 이 단언된다; POSIX `direct` 는 자체 메시지로 먼저 실패한다"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/process.test.ts#a timed-out command leaves no descendant process behind — ✔ on ubuntu/macos/windows in BOTH entrypoints of run 34051628180"
        status: pass
      - kind: other
        ref: "descendant termination evidence 진단 줄 6개 (3 legs × 2 entrypoints), 전부 evidence:esrch / terminated:true / advanced:false"
        status: pass
    human_judgment: false
  - id: D3
    description: "무효한 계측기가 ledger #7 로 등록됐다 (kind: deviation, file: test/process.test.ts, line: 298, close() 계약 690-699 인용)"
    verification:
      - kind: other
        ref: "node -e <ledger entry gate> → `the invalidated-instrument entry is registered and cites its source: id 7`"
        status: pass
    human_judgment: false
  - id: D4
    description: "하나의 run id(34051628180)에서 세 leg 모두 네 스텝 초록; G-01-1 의 종료 증거가 존재한다"
    requirement: SAFE-01
    verification:
      - kind: e2e
        ref: "gh run view 34051628180 → conclusion: success; ubuntu/macos/windows 모두 success; npm test 208/fail 0, Safety boundary suites 131/fail 0 per leg"
        status: pass
    human_judgment: false
  - id: D5
    description: "Broken Windows ledger 가 관측된 leg 증거에만 근거해 처분됐다 (#7/#2/#3/#4 fixed, #5/#6 open)"
    verification:
      - kind: other
        ref: "node -e <counter consistency> → `ledger counters consistent: open 2, waived 1, fixed 4, total 7`"
        status: pass
    human_judgment: false
  - id: D6
    description: "두 개의 manual-only SAFE-02 canary 상태 — unknown-reparse 는 여전히 CI 로 답할 수 없고, escape-file-link 는 windows-latest 에서 실제로 실행됐다 (plan 전제와 불일치)"
    requirement: SAFE-02
    verification: []
    human_judgment: true
    rationale: "escape-file-link 가 windows-latest 에서 skip 이 아니라 실행/통과됐다는 관측은 이 plan 이 쓰인 전제('어떤 CI leg 도 그 증거를 만들 수 없다')를 반증한다. 그 관측이 01-UAT.md item 3 을 승격시키기에 충분한지는 verifier 의 판단이고, 01-UAT.md 는 이 plan 의 files_modified 밖이라 여기서 승격시키지 않았다."
  - id: D7
    description: "Windows 개발 호스트에서 관측된 설명되지 않은 `131 / pass 125 / fail 1 / skipped 5` 한 번"
    verification: []
    human_judgment: true
    rationale: "실패한 테스트 이름이 포착되지 않았고, 이 run 의 세 leg 은 그것을 재현하지 않았다(windows-latest 는 fail 0, 그리고 skip 이 5가 아니라 4다). 세 번의 독립된 관측이 침묵했다는 것은 원인 규명이 아니라 미재현이다. 열린 채로 이월한다."

duration: 63 min
completed: 2026-09-06
status: complete
---

# Phase 01 Plan 27: 후손 종료 오라클 수리와 세 leg 초록 run 관측 Summary

**무효한 pid 시그널 프로브를 공유 termination 오라클로 교체해 ubuntu 의 빨간 칸을 판정 가능하게 만든 뒤, 하나의 run id(`34051628180`)에서 세 leg 모두 초록을 관측했다 — 세 leg 전부 `evidence: "esrch"` 로 후손이 실제로 소멸했다고 보고했고, G-01-1 의 종료 증거가 처음으로 존재한다.**

## Performance

- **Duration:** 63 min (두 executor 세션 합계, CI run 대기 포함)
- **Started:** 2026-09-06T17:33Z (근사 — 첫 task 커밋 `4df09ba` 는 17:43Z)
- **Completed:** 2026-09-06T18:36Z
- **Tasks:** 3
- **Files modified:** 4 (신규 1, 수정 3)

## Accomplishments

- **하나의 계측기.** `test/helpers/termination-oracle.ts` 가 이 저장소의 유일한 termination 오라클이 되었고, `test/protocol-session.test.ts` 와 `test/process.test.ts` 가 둘 다 그것을 통해 판정한다. 추출은 이동이었다 — `protocol-session.test.ts` 의 오라클 통제 테스트 두 개가 그대로 남아 이제 추출된 계측기를 판정한다.
- **판정 가능해진 빨간 칸.** 좀비와 살아 있는 후손이 이제 서로 다른 판정·서로 다른 evidence 코드·서로 다른 실패 메시지를 낸다. POSIX 에서 `treeTermination: "direct"` 는 liveness 단언보다 **먼저** 자기 메시지로 실패한다.
- **초록도 말을 한다.** 모든 실행이 `descendant termination evidence (<platform>): {...}` 를 찍는다. 이번 라운드가 산 정보는 초록 자체가 아니라 초록의 이유였고, 그것이 실제로 로그에 남았다.
- **세 leg 초록 하나의 run.** `34051628180` (head `25b5434`) — `conclusion: success`, ubuntu/macos/windows 전부 네 스텝 초록. 2-of-3 도, 개별 재실행 leg 도, 서로 다른 run 을 기운 것도 아니다.
- **제품은 트리를 실제로 종료시켰다.** 여섯 개의 진단 줄이 전부 `evidence: "esrch"`, `terminated: true`, `advanced: false` 를 보고했다. `esrch` 는 pid 가 좀비로 남은 것이 아니라 **완전히 사라졌다**는 뜻이다.
- **ledger 4건 처분.** `#7`(이번에 등록한 무효 계측기), `#2`, `#3`, `#4` 를 관측된 leg 줄에 대고 fixed 처리. `#5`·`#6` 은 열린 채, 각각 무엇을 기다리는지 명시.

## Task Commits

1. **Task 1: termination 오라클을 하나의 공유 계측기로 추출** — `4df09ba` (refactor)
2. **Task 2: terminal evidence + `treeTermination` 위에 후손 판정 재구축** — `a087550` (test)
3. **Task 3 단계 1: 무효한 계측기를 ledger #7 로 등록** — `1ead377` (docs)
4. **halt 상태 기록 (push 전)** — `2be37c3`, `24f87b7`, `25b5434` (docs)
5. **Task 3 단계 5: run 34051628180 의 세 초록 leg 위에서 ledger #7/#2/#3/#4 처분** — `7cd9e06` (docs)

**Plan metadata:** 아래 SUMMARY 커밋

## Files Created/Modified

- `test/helpers/termination-oracle.ts` (신규, 360줄) — 이 저장소의 유일한 termination 계측기. nonce heartbeat 발행/파싱, `classifyProcessSample`, `CLOSE_TREE_DEADLINE_MS` 까지의 폴링.
- `test/process.test.ts` — 후손 liveness 판정을 공유 오라클로 교체, `ProcessResult.treeTermination` 단언 추가, POSIX `direct` 선-실패 메시지, leg 별 진단 줄 출력.
- `test/protocol-session.test.ts` — 오라클 인라인 구현 제거하고 공유 헬퍼 import. 테스트는 하나도 잃지 않았고 통제 두 개는 그대로 남았다.
- `.planning/WINDOWS.md` — `#7` 등록(단계 1), 이어서 `#7/#2/#3/#4` fixed 처분(단계 5).

---

## Task 3 — 관측 기록

### 상태 판정: **(b) 관측됨 · 세 leg 모두 초록**

명시적으로 판정한다. 이것은 (a) `not observed yet` 도, (c) `observed and negative` 도 아니다.

### push 는 일어나지 않았다 (이미 존재하는 run 을 읽었다)

plan 단계 2의 순서를 그대로 따랐다:

```
$ git log origin/main..HEAD --oneline
(비어 있음)
$ git rev-parse origin/main HEAD
25b5434a07717f43f93c9ef114af863bee47531d
25b5434a07717f43f93c9ef114af863bee47531d
```

승인된 한 번의 push 는 orchestrator 가 이미 집행했고(`8c04c5f..25b5434 main -> main`), 현재 HEAD 에 대한 run 이 이미 존재한다. 따라서 **두 번째 push 는 하지 않았다.** 그 run 을 읽었다.

### 관측한 run

| 항목 | 값 |
|---|---|
| run id | `34051628180` |
| URL | https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/34051628180 |
| head sha | `25b5434a07717f43f93c9ef114af863bee47531d` |
| conclusion | **`success`** |
| createdAt | 2026-09-06T18:24:47Z |

세 leg 전부 이 **하나의** run id 안에 있다. 개별 재실행된 leg 없음, 다른 run 에서 기워온 leg 없음.

| leg | job id | conclusion |
|---|---|---|
| ubuntu-latest / Node 24 | 101536175959 | success |
| macos-latest / Node 24 | 101536175806 | success |
| windows-latest / Node 24 | 101536176051 | success |

### 네 스텝 × 세 leg

| leg | `npm run check` | `npm test` | `npm run build:check` | `Safety boundary suites` |
|---|---|---|---|---|
| ubuntu-latest | success | success — **tests 208** / pass 207 / **fail 0** / skipped 1 | success — `build artifact verified: 56 inputs, 106 outputs` | success — **tests 131** / pass 130 / **fail 0** / skipped 1 |
| macos-latest | success | success — **tests 208** / pass 207 / **fail 0** / skipped 1 | success — `build artifact verified: 56 inputs, 106 outputs` | success — **tests 131** / pass 130 / **fail 0** / skipped 1 |
| windows-latest | success | success — **tests 208** / pass 204 / **fail 0** / skipped 4 | success — `build artifact verified: 56 inputs, 106 outputs` | success — **tests 131** / pass 127 / **fail 0** / skipped 4 |

`npm test` 총계는 세 leg 모두 정확히 **208**, `Safety boundary suites` 총계는 세 leg 모두 정확히 **131**. 다른 총계는 없었다 — 어떤 스위트도 컴파일을 멈추지 않았다.

build artifact 는 세 leg 모두 `56 inputs, 106 outputs` 로, `55 inputs, 104 outputs` 기준선 대비 **입력 1개 · 출력 2개** 증가. `test/helpers/termination-oracle.ts` 하나가 들어오고 `.js`/`.d.ts` 두 개가 나간 것과 정확히 일치한다.

### 이 라운드가 산 정보 — `descendant termination evidence`, 세 leg 전부 (초록 포함)

여섯 줄 전부를 그대로 옮긴다. 세 leg × 두 entrypoint(`npm test` 와 라우팅된 `Safety boundary suites`).

**ubuntu-latest (linux)**
```
18:25:35.7781283Z ℹ descendant termination evidence (linux): {"treeTermination":"group","evidence":"esrch","terminated":true,"observedMs":1,"lastCounter":28,"advanced":false,"heartbeatNonceMatches":true}
18:26:02.4331411Z ℹ descendant termination evidence (linux): {"treeTermination":"group","evidence":"esrch","terminated":true,"observedMs":1,"lastCounter":28,"advanced":false,"heartbeatNonceMatches":true}
```

**macos-latest (darwin)**
```
18:25:27.6539690Z ℹ descendant termination evidence (darwin): {"treeTermination":"group","evidence":"esrch","terminated":true,"observedMs":1,"lastCounter":28,"advanced":false,"heartbeatNonceMatches":true}
18:25:51.7925720Z ℹ descendant termination evidence (darwin): {"treeTermination":"group","evidence":"esrch","terminated":true,"observedMs":1,"lastCounter":27,"advanced":false,"heartbeatNonceMatches":true}
```

**windows-latest (win32)**
```
18:26:54.1678430Z ℹ descendant termination evidence (win32): {"treeTermination":"windows-tree","evidence":"esrch","terminated":true,"observedMs":1,"lastCounter":25,"advanced":false,"heartbeatNonceMatches":true}
18:27:45.5211653Z ℹ descendant termination evidence (win32): {"treeTermination":"windows-tree","evidence":"esrch","terminated":true,"observedMs":1,"lastCounter":27,"advanced":false,"heartbeatNonceMatches":true}
```

읽을 것:

- **POSIX 두 leg 모두 `treeTermination: "group"`.** 어느 leg 도 `"direct"` 를 보고하지 않았다. `killTree` 의 프로세스 그룹 신호가 거부되지 않았고 직속 자식으로 폴백하지 않았다 — 요청한 만큼 정확히 종료시켰다.
- **windows leg 은 `"windows-tree"`.** `taskkill /T /F` 경로가 그대로 살아 있다.
- **세 leg 전부 `evidence: "esrch"`.** `zombie` 도 `proc-absent` 도 아니라 `esrch` 다. pid 자체가 사라졌다는 뜻이고, 좀비였다면 나올 수 없는 코드다.
- **세 leg 전부 `advanced: false`, `heartbeatNonceMatches: true`.** heartbeat 는 우리 후손의 것이었고(pid 재사용/오파싱이 아님), 그것이 deadline 을 넘겨 전진하지 않았다.
- **`observedMs: 1`.** 종료는 `CLOSE_TREE_DEADLINE_MS` 를 거의 쓰지 않고 즉시 확정됐다.

그리고 해당 테스트 자체:
```
ubuntu  ✔ a timed-out command leaves no descendant process behind (1510.941988ms) / (1511.10031ms)
macos   ✔ a timed-out command leaves no descendant process behind (1506.050791ms) / (1521.025083ms)
windows ✔ a timed-out command leaves no descendant process behind (1720.4375ms) / (1588.8316ms)
```

`01-26` 에서 ubuntu 의 라우팅된 스텝만 빨갛고 `npm test` 스텝은 초록이던 **entrypoint 비대칭이 사라졌다** — 두 entrypoint 가 같은 판정을, 같은 증거로 낸다.

### RC-5 는 돌아오지 않았다

windows-latest 로그에서, **라우팅된 `Safety boundary suites` 스텝 안에서** (부재가 아니라 통과로):

```
line 259 (npm test step):              ✔ the test runner environment carries no npm lifecycle injection (2.4093ms)
line 436 (Safety boundary suites step): ✔ the test runner environment carries no npm lifecycle injection (3.2052ms)
```

`01-24` 의 라우팅은 온전하고, `01-21` 이 세운 "두 entrypoint 는 같은 환경을 본다" 불변식이 실제로 두 곳 모두에 적용돼 있다.

### `wrapper families executed: 4; not-run: []`

세 leg × 두 entrypoint, 여섯 곳 전부:

```
ubuntu  line 282 / line 459 : ℹ wrapper families executed: 4; not-run: []
macos   line 284 / line 461 : ℹ wrapper families executed: 4; not-run: []
windows line 269 / line 446 : ℹ wrapper families executed: 4; not-run: []
```

### `path-boundary.test.js` not-run 진단 (leg 별)

**ubuntu-latest / macos-latest** — 하나만 not-run:
```
ℹ path-boundary not-run evidence: [{"fixture":"unknown-reparse","reason":"reparse points are a Windows-only concept"}]
```
세 EACCES 픽스처는 **실행되고 통과했다**:
```
✔ an allowed root that became unreadable is refused at the recheck rather than compared unresolved
✔ an unreadable component is unprovable rather than unclassified
✔ losing readability between preflight and apply refuses at the recheck
```

**windows-latest** — 넷이 not-run:
```
ℹ path-boundary not-run evidence: [{"fixture":"unknown-reparse","reason":"fsutil reparsepoint is unavailable or unprivileged on this host"},{"fixture":"eacces-recheck-root","reason":"this host does not deny traversal by POSIX mode"},{"fixture":"eacces-component","reason":"this host does not deny traversal by POSIX mode"},{"fixture":"eacces-recheck-component","reason":"this host does not deny traversal by POSIX mode"}]
```

### `process.test.js` per-command 진단 (leg 별)

```
ubuntu  ℹ command probe evidence (linux):  [{"name":"npm","found":true,"version":"11.19.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.20.0","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0","unsupportedReason":null}]
macos   ℹ command probe evidence (darwin): [{"name":"npm","found":true,"version":"11.19.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.20.0","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0","unsupportedReason":null}]
windows ℹ command probe evidence (win32):  [{"name":"npm","found":true,"version":"11.17.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.19.0","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0.windows.5","unsupportedReason":null}]
```

세 leg 모두 `✔ a version probe answers under the probe environment on this platform`. **`version` 이 null 인 명령은 하나도 없다** — 세 플랫폼 어디서도 `commandProbeEnvironment` 의 passthrough 집합을 넓힐 이유가 나오지 않았다.

그리고 darwin floor 의 런타임 정확일치 단언:
```
macos ✔ the platform environment floor is declared rather than discovered at runtime (38.677459ms / 49.778375ms)
```
(단언 메시지: `the declared platform floor must match what the OS actually delivers`. `deepEqual` 이므로 과소 선언도 과대 선언도 실패한다.)

---

## Task 3 단계 4 — G-01-1

**분기 (b) 가 적용된다.** 세 leg 모두 초록이고, 진단 줄이 세 leg 모두에서 terminal evidence(`esrch`)와 건강한 `treeTermination`(POSIX `group`, win32 `windows-tree`)을 보고했다.

**G-01-1 은 run id `34051628180` 위에서 닫힌다.**

그리고 이제 무엇이 일어났는지 안다: **제품은 트리를 실제로 종료시켰다.** `01-26` 라운드의 ubuntu 빨간 칸은 SAFE-06 containment 실패가 아니라, 좀비에게도 성공하는 `process.kill(pid, 0)` 하나로 liveness 를 판정하던 무효한 도구가 만든 판정이었다.

**확립하지 않은 것.** 왜 하필 그 ubuntu run 에서, 열 파일 라우팅 entrypoint 에서만 그 도구가 기울었는지는 **여전히 가설이다.** 파일 집합 차이와 부모 체인 차이가 만든 스케줄링/부하 차이가 유력한 후보지만, 이 라운드는 그것을 구별하는 증거를 만들지 않았다. 이 라운드가 확립한 것은 두 가지뿐이다: (1) 계측기가 무효했다, (2) 종료는 이제 세 leg 모두에서 `group`/`windows-tree` + `esrch` 로 증명된다. 타이밍 가설을 확립된 원인으로 기록하지 않는다.

**`01-26-SUMMARY.md` 의 읽기를 상속하지 않는다.** 그 문서는 `actual: true` 를 "후손이 실제로 살아 있었다" 로 읽었다. 이 run 이 그것이 사실이 아니었다는 증거다 — 같은 코드 경로가 세 leg 에서 `esrch` 를 보고한다. 그 읽기는 무효한 계측기를 통과한 추론이었고, 여기서 정정한다.

---

## Task 3 단계 5 — Broken Windows ledger 처분

처분 전: `open 6, waived 1, fixed 0, total 7`
처분 후: `open 2, waived 1, fixed 4, total 7` (`open + waived + fixed == total` ✓)

| id | kind | file | 처분 | 근거가 된 leg 증거 |
|---|---|---|---|---|
| 1 | deviation | test/path-boundary.test.ts | **waived** (변경 없음, `01-26` 에서) | 예측 자기공개이지 제품 결함이 아님. reason 비어 있지 않음 |
| 2 | unrun-verify | src/core/path-boundary.ts | **fixed** | ubuntu **와** macos 두 POSIX leg 이, 두 entrypoint 모두에서, 세 EACCES 픽스처를 not-run 이 아니라 실행·통과로 보고했다. `path-boundary not-run evidence` 배열에 EACCES 항목이 없다 — `unknown-reparse` 하나뿐 |
| 3 | unrun-verify | test/process.test.ts | **fixed** | macos-latest leg 이 초록이고, 구체적으로 `the platform environment floor is declared rather than discovered at runtime` 이 두 entrypoint 모두에서 통과했다 — darwin floor 완전성이 실제 macOS 호스트에서 정확일치로 확인됨 |
| 4 | deviation | src/core/process.ts | **fixed** | 세 leg 모두 프로브 단언 초록, 그리고 찾아낸 아홉 개 명령(3 leg × npm/node/git) 중 `version` 이 null 인 것이 하나도 없다. Linux/macOS 에서 passthrough 집합을 넓힐 근거가 관측되지 않았다 |
| 5 | unrun-verify | scripts/run-tests.mjs | **open** | 기다리는 것: `--files` loud-failure 두 경로(빈 명시 집합, 빌드되지 않은 경로 지정)를 **매 leg 마다** 지키는 상설 스위트 테스트. `01-24` 에서 명령 호출로 증명됐지만 어느 leg 에서도 상시로 돌지 않는다. 이 plan 은 그것을 다루지 않았다 |
| 6 | unrun-verify | src/core/path-boundary.ts | **open** | 기다리는 것: `provePathBoundary:296-299` 에 도달하는 경로. `:285` 와 `:296` 사이의 TOCTOU 레이스 없이는 공개 API 로 도달 불가능하다. 초록 run 이 답할 수 있는 종류의 질문이 아니다 |
| 7 | deviation | test/process.test.ts:298 | **fixed** | 계측기가 교체됐고(`test/helpers/termination-oracle.ts`), 교체된 계측기가 세 leg 에서 판정을 내렸으며 그 판정이 로그에 진단 줄로 남았다. 분기 (b) 의 처분 규칙 그대로 |

**`#7` 을 `unrun-verify` 가 아니라 `deviation` 으로 등록한 이유** (plan 이 요구사항으로 명시): `unrun-verify` 는 "아직 확인되지 않음" 을 뜻한다. 이것은 확인됐다 — 무효한 도구가 실제로 출하돼 실제 CI leg 을 결정했고, 그 결과 `34046336104` 의 ubuntu 칸은 좀비와 containment 실패 사이에서 판정 불가였다. 돌지 않은 검증이 아니라 진단이 끝난 결함이다.

**`#5`·`#6` 에 대해 규칙을 발명하지 않았다.** 이 plan 은 둘 중 어느 것도 다루지 않고 어느 것에 대한 처분 규칙도 갖고 있지 않다. 각각이 무엇을 기다리는지 위 표에 그대로 적었다.

---

## 두 개의 manual-only SAFE-02 canary — 그리고 하나의 불일치

plan 은 "초록 run 이 두 canary 를 승격시키지 않는다. 어떤 CI leg 도 그 증거를 만들 수 없다" 고 지시한다. 첫 문장은 지켰다. **두 번째 문장은 관측과 어긋난다.**

### 1. Windows unknown-reparse canary (SAFE-02) — 여전히 미해결, plan 의 전제 성립

```
windows-latest ﹣ an unclassified reparse point yields a stable unsupported refusal
                 # unknown-reparse fixture not run: privileged reparse facilities unavailable
ubuntu/macos   ﹣ ... # unknown-reparse fixture not run: not a Windows host
```

windows-latest 는 `fsutil reparsepoint` 권한이 없고 POSIX leg 은 개념 자체가 없다. **어떤 CI leg 도 이 증거를 만들 수 없다.** `01-UAT.md` item 2 는 `result: skipped` 그대로다. 초록 run 이 승격시키지 않는다.

### 2. file-symlink escape canary (SAFE-02) — ⚠️ **plan 의 전제와 불일치, 여기서 승격시키지 않고 기록만 한다**

plan 과 `01-26-SUMMARY.md` 는 이 canary 도 CI 로 답할 수 없다고 전제했다. `01-26` 이 그렇게 쓴 근거는 **개발 호스트** 의 출력이었다: `escape-file-link fixture not run: this host cannot create file symlinks without privileges`.

**이 run 의 windows-latest 는 그 픽스처를 건너뛰지 않았다.** 실행하고 통과했다:

```
windows-latest ✔ a file link that escapes the allowed root is refused for both write and removal (26.4503ms)  [npm test]
windows-latest ✔ a file link that escapes the allowed root is refused for both write and removal (32.7016ms)  [Safety boundary suites]
```

그리고 그 leg 의 `path-boundary not-run evidence` 배열에 `escape-file-link` 는 **없다** (네 항목은 `unknown-reparse` 와 EACCES 셋뿐). `test/path-boundary.test.ts:169-170` 이 not-run 을 기록하는 유일한 경로이므로, 이는 GitHub windows-latest 이미지에서 파일 심볼릭 링크 생성이 실제로 허용됐다는 뜻이다 — 즉 **이 canary 는 이 run 에서 Windows 호스트 위의 실제 관측이 되었다.**

**그럼에도 여기서 승격시키지 않는다.** 세 가지 이유로:
1. `01-UAT.md` 는 이 plan 의 `files_modified` 밖이고, 이 task 는 `.planning/WINDOWS.md` 만 바꾸도록 되어 있다.
2. plan 의 지시는 "승격시키지 말라" 이고, 관측이 전제를 반증했다는 사실이 그 지시를 뒤집을 권한을 주지는 않는다.
3. windows-latest 러너가 개발자의 실제 호스트를 대표하는지 — 즉 UAT 가 요구하는 것이 "어떤 Windows 호스트에서든" 인지 "비특권 개발자 호스트에서" 인지 — 는 판단이 필요한 질문이다.

**verifier 에게 넘긴다:** 증거는 존재한다(run `34051628180`, windows-latest, 두 entrypoint 모두). `01-UAT.md` item 3 을 "수락된 권한 게이트" 에서 "관측" 으로 올릴지는 verifier 의 결정이다.

---

## 이월: 설명되지 않은 Windows 로컬 `fail 1` 관측

`01-27` Task 2 실행 중, Windows 개발 호스트에서 라우팅된 열 파일 명령을 일곱 번 돌렸다. 그중 **한 번** 이 `131 / pass 125 / fail 1 / skipped 5` 를 보고했고, **실패한 테스트의 이름은 포착되지 않았다.** 나머지 여섯 번은 전부 `131 / pass 126 / fail 0 / skipped 5`. 그 실행 자신의 진단 줄은 `windows-tree` / `esrch` / `terminated: true` 였으므로 후손 테스트는 아니었다.

**이 run 의 세 leg 이 그것에 대해 보여준 것:**

- **windows-latest 는 재현하지 않았다.** 라우팅된 스텝에서 `131 / pass 127 / fail 0 / skipped 4`, 두 entrypoint 모두 `fail 0`.
- **skip 수가 다르다 — 4 대 5.** windows-latest 는 4개(`unknown-reparse` + EACCES 3), 개발 호스트는 5개를 건너뛴다. 다섯 번째는 위에서 확인한 `escape-file-link` 다. 즉 **개발 호스트와 windows-latest 는 같은 131 총계 아래에서 서로 다른 테스트 집합을 실제로 실행한다.** 개발 호스트에서 실패한 테스트는 그 호스트에서 평소 통과하던 126개 중 하나였고, windows-latest 의 실행 집합은 그것과 정확히 겹치지 않는다.
- **ubuntu·macos 도 `fail 0`.**

**결론: 미재현이지 규명이 아니다.** 세 번의 독립된 관측이 침묵했다는 것은 그 한 번의 빨강이 무엇이었는지 말해주지 않는다. 이름이 없는 실패는 아직 이름이 없다. 열린 채로 이월하며, **이것을 초록으로 덮지 않는다.** 다음에 재현되면 반드시 실패한 테스트 이름을 먼저 포착해야 한다. (ledger 에 새 항목으로 넣지 않은 이유: 이 plan 의 disposition 범위는 관측된 leg 증거에 대한 처분이고, 재현되지 않은 로컬 관측에 대해 새 결함 항목을 여는 규칙은 plan 에 없다. 발명하지 않고 여기에 기록한다.)

---

## Decisions Made

1. **`#7` 은 `deviation`.** 진단이 끝난 결함이지 돌지 않은 검증이 아니다. (plan 요구사항, 위에 근거 서술)
2. **상태 (b) 로 판정하고 G-01-1 을 `34051628180` 위에서 닫는다.** 하나의 run id, 세 초록 leg, 세 leg 모두의 terminal evidence.
3. **push 하지 않았다.** 현재 HEAD 에 대한 run 이 이미 존재했다 (plan 단계 2, 규칙 2).
4. **`01-VERIFICATION.md` 를 손대지 않았다.** G-01-1 의 공식 상태는 verifier 문서가 소유한다. 이 plan 의 `files_modified` 는 `.planning/WINDOWS.md` 하나이고, 이 SUMMARY 가 종료 증거를 제출한다. `/gsd-verify-work 01` 이 다음 단계다.
5. **타이밍 가설을 확립된 원인으로 기록하지 않았다.** (plan 여섯 번째 금지)
6. **`escape-file-link` 불일치를 기록하되 승격시키지 않았다.** (위 상세)
7. **`REQUIREMENTS.md` 에서 SAFE-01·SAFE-06 을 Complete 로 표시하지 않았다.** 표준 executor 흐름은 plan frontmatter 의 `requirements` 를 완료 처리하지만, 여기서는 하지 않는다. 세 가지 이유: (a) `REQUIREMENTS.md` 는 이 plan 의 `files_modified` 밖이고 acceptance criterion 이 "`.planning/WINDOWS.md` 가 이 task 가 바꾸는 유일한 파일" 이라고 못박는다; (b) 이 phase 는 **정확히 이 행동을 되돌린 기록**을 갖고 있다 (`62a4444 docs(phase-01): revert premature Complete requirements after gaps found`); (c) SAFE-01/SAFE-06 의 완료 여부는 3-OS 게이트 하나가 아니라 phase 검증 전체의 판단이고, 그 권한은 `/gsd-verify-work 01` 에 있다. 현재 상태 그대로 둔다 — SAFE-01 `Pending`, SAFE-06 `Gaps Found`. 이 SUMMARY 는 그 재판정에 필요한 증거를 제출하는 것이지 재판정 자체가 아니다.

## Deviations from Plan

### 관측이 plan 의 전제를 반증한 건 (기록만, 조치 없음)

**1. [Rule 관측-보고] plan 은 두 SAFE-02 canary 모두 CI 로 답할 수 없다고 전제했지만, `escape-file-link` 는 windows-latest 에서 실제로 실행·통과했다**
- **Found during:** Task 3 단계 5
- **Issue:** plan 단계 5 는 "어떤 CI leg 도 그 증거를 만들 수 없다는 사실을 다시 적는다" 고 지시한다. 그것은 `unknown-reparse` 에는 참이지만 `escape-file-link` 에는 이 run 에서 거짓이다. windows-latest 의 not-run 배열에 그 픽스처가 없고, 테스트는 두 entrypoint 모두에서 ✔ 다.
- **Fix:** 아무것도 고치지 않았다. 관측을 그대로 기록하고, plan 의 전제가 어디서 왔는지(개발 호스트 출력) 와 함께 불일치를 명시했다. UAT 항목 승격은 하지 않았다 — `01-UAT.md` 는 `files_modified` 밖이고 승격 여부는 판단 문제다.
- **Files modified:** 없음
- **Verification:** windows 로그 line 236 / 414 (✔), line 257 / 435 (not-run 배열에 부재), `test/path-boundary.test.ts:169-170` (not-run 을 기록하는 유일한 경로)
- **Committed in:** 해당 없음 (이 SUMMARY 의 기록)

**2. [Rule 기록-정확성] plan 이 등록 전 상태로 명시한 `open 5, waived 1, fixed 0, total 6` 은 실행 시점에 이미 `open 6, waived 1, fixed 0, total 7` 이었다**
- **Found during:** Task 3 단계 5 진입 시
- **Issue:** Task 3 의 두 번째 `<precondition>` 은 ledger 가 여섯 항목(`open 5, waived 1, fixed 0, total 6`)이라고 전제한다. 그러나 그 전제는 **같은 task 의 단계 1이 실행되기 전** 상태이고, 단계 1(`1ead377`)이 `#7` 을 이미 등록한 뒤 halt 했으므로 continuation 시점의 정상 상태는 7항목이다.
- **Fix:** halt 로 처리하지 않았다. 카운터 차이가 "ledger 가 몰래 움직였다" 가 아니라 "이 task 자신의 단계 1이 완료됐다" 로 완전히 설명되고, 추가된 항목이 정확히 단계 1이 등록하도록 지시받은 그 항목(`test/process.test.ts:298`, close() 계약 인용)임을 확인했다.
- **Files modified:** 없음
- **Verification:** `1ead377` 커밋이 `.planning/WINDOWS.md` 만 바꾸고 `#7` 만 추가함; ledger 게이트 `the invalidated-instrument entry is registered and cites its source: id 7`
- **Committed in:** 해당 없음

---

**Total deviations:** 2건, 둘 다 기록-보고이고 코드/제품 변경 없음
**Impact on plan:** 범위 이탈 없음. `src/` 와 `.github/` 는 plan 전체에 걸쳐 한 바이트도 바뀌지 않았다.

## 금지사항 준수 확인

| plan 금지 | 준수 |
|---|---|
| G-01-1 을 로컬 증거·2-of-3·기운 leg 으로 닫지 않는다 | ✓ 하나의 run id `34051628180`, 세 leg 전부 그 run 안에서 초록. 개별 재실행 leg 없음 |
| 픽스처가 not-run 인 leg 위에서 Broken Window 를 fixed 로 만들지 않는다 | ✓ `#2` 는 픽스처가 **실행된** POSIX leg(ubuntu·macos) 위에서만 닫았다. windows 에서 not-run 이라는 사실이 근거를 훼손하지 않는 이유는 규칙이 "최소 한 POSIX leg" 이기 때문 |
| `01-24` 라우팅을 되돌리지 않는다 / bare `node --test` 로 복귀하지 않는다 | ✓ `.github/` 무변경, CI 계약 게이트 통과 |
| 좀비와 "여전히 실행 중" 을 다시 하나로 붕괴시키지 않는다 | ✓ 오라클은 `zombie`/`proc-absent`/`esrch`/`indeterminate` 를 구분하고, deadline 을 넘긴 전진 heartbeat 는 살아 있는 후손으로 보고한다 |
| POSIX `treeTermination === "direct"` 를 성공으로 받지 않는다 | ✓ 두 POSIX leg 모두 `"group"`. `direct` 는 애초에 자체 메시지로 먼저 실패하도록 되어 있고 발동하지 않았다 |
| 타이밍 가설을 확립된 원인으로 기록하지 않는다 | ✓ 위 「확립하지 않은 것」 참조 |
| `01-26-SUMMARY.md` 의 "실제로 살아 있었다" 읽기를 상속하지 않는다 | ✓ 명시적으로 정정 |
| `src/` 수정 금지 | ✓ `git diff aa71972..HEAD --name-only -- src/ .github/` 가 비어 있다 |

## Issues Encountered

**없음.** Task 3 는 계획된 세 갈래(a/b/c) 중 (b) 로 떨어졌고, 그 분기의 처분 규칙을 그대로 집행했다. 진단으로 되돌아갈 필요가 없었다.

주변 사실 하나: 작업 트리에 추적되지 않은 `.gsd/` 디렉터리가 있다(이 실행 이전부터 존재). 이 plan 의 `files_modified` 밖이므로 커밋하지도 `.gitignore` 를 고치지도 않았다. 다음 사이클이 처리할 것.

## User Setup Required

없음 — 외부 서비스 설정이 필요하지 않다.

## Next Phase Readiness

**준비됨:**

1. **G-01-1 의 종료 증거가 처음으로 존재한다.** run `34051628180`, head `25b5434`, `conclusion: success`, 세 leg 네 스텝 전부 초록. `01-VALIDATION.md` 가 `/gsd-verify-work` 앞에 요구하던 "완전히 초록인 3-OS 스위트" 가 충족됐다.
2. **다음 단계는 `/gsd-verify-work 01`.** `01-VERIFICATION.md` 의 truth 7(`01-21` T6, entrypoint 환경 동일성)과 truth 8(3-OS 게이트)은 이 run 위에서 재판정되어야 한다. 그 문서는 verifier 가 소유하므로 이 executor 가 고치지 않았다.
3. **ledger 는 `open 2`.** `#5`(상설 `--files` loud-failure 테스트)와 `#6`(TOCTOU-only 분기)만 남았고 둘 다 이 phase 의 3-OS 게이트와 무관하다. `workflow.windows_enforce` 가 켜져 있다면 `/gsd-ship` 은 이 둘을 먼저 처분하거나 waive 해야 한다.
4. **기준선 갱신.** `npm test` = **208** tests, `Safety boundary suites` = **131** tests, build artifact = **56 inputs, 106 outputs**. 다음 plan 은 이 숫자를 기준선으로 삼아야 한다.

**남은 우려:**

1. **설명되지 않은 Windows 로컬 `fail 1`** — 이름 없이 열린 채. 재현 시 테스트 이름 포착이 최우선.
2. **`escape-file-link` canary 의 지위** — 증거는 생겼는데 UAT 는 아직 "수락된 권한 게이트" 다. verifier 판단 필요.
3. **`unknown-reparse` canary** — 어떤 CI leg 도 답할 수 없다. 특권 있는 실제 Windows 호스트만이 답한다.
4. **이전 ubuntu 빨강의 정확한 발동 조건** — 계측기가 무효했다는 것은 확립됐지만 왜 그 run 에서 기울었는지는 가설로 남는다. 새 계측기가 그것을 다시 만나면 이번엔 진단 줄이 답을 줄 것이다.

---

## Self-Check

**파일 존재 확인:**
- `test/helpers/termination-oracle.ts` — FOUND
- `test/process.test.ts` — FOUND
- `test/protocol-session.test.ts` — FOUND
- `.planning/WINDOWS.md` — FOUND

**커밋 존재 확인:**
- `4df09ba` — FOUND (refactor(01-27): extract the termination oracle into one shared instrument)
- `a087550` — FOUND (test(01-27): judge descendant termination on terminal evidence and treeTermination)
- `1ead377` — FOUND (docs(01-27): register the invalidated descendant-liveness instrument (ledger #7))
- `7cd9e06` — FOUND (docs(01-27): dispose ledger #7/#2/#3/#4 on the three green legs of run 34051628180)

**Task 3 자동 게이트 3/3 통과:**
- `ci matrix contract intact: 3 legs, 4 steps, 10 suites, routed through the runner`
- `ledger counters consistent: open 2, waived 1, fixed 4, total 7`
- `the invalidated-instrument entry is registered and cites its source: id 7`

**범위 확인:**
- `git diff aa71972..HEAD --name-only -- src/ .github/` → 비어 있음

## Self-Check: PASSED

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-06*
