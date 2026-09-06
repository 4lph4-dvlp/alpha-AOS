---
phase: 01-safe-operation-boundary
plan: 25
subsystem: testing
tags: [path-boundary, eacces, unprovable-filesystem, symlink, commandProbeEnvironment, SAFE-02, SAFE-06, not-run-honesty]

requires:
  - phase: 01-19
    provides: "canonicalizeWithMissingTail, the ENOENT / non-ENOENT errno split, and the three unprovable-filesystem refusal sites this plan drives"
  - phase: 01-21
    provides: "commandProbeEnvironment and its coverage D5 conclusion — a null version on Linux/macOS means widen the passthrough, not the pin"
  - phase: 01-24
    provides: "the CI safety step routed through scripts/run-tests.mjs, which is the wiring these new fixtures run under on all three legs"
provides:
  - "An unprivileged POSIX EACCES fixture that drives the `unprovable-filesystem` refusal at all three sites reachable through the public API"
  - "`makeDeniableTree` / `denyTraversal` — a self-owned mkdtemp tree with order-independent cleanup, and a gate that asks the host for the real errno instead of trusting a platform name"
  - "A source-grounded derivation that `provePathBoundary:296-299` is unreachable through the public API, recorded rather than claimed as covered"
  - "A cross-platform assertion that a real binary answers under `commandProbeEnvironment()`, and that a found command never returns both a null version and a null reason"
  - "A per-command `context.diagnostic` line every CI leg prints, which is the evidence 01-26 disposes Broken Window #4 on"
  - "The not-run reporter moved to the bottom of test/path-boundary.test.ts so its diagnostic sees every fixture's record"
affects: [01-26, phase-01-verification, ci-matrix]

actuals:
  tokens: 5019
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A privilege/platform gate probes the host for the real errno rather than branching on process.platform or a uid"
    - "A fixture that changes a directory mode owns its whole lifecycle in its own mkdtemp tree, with one restore-then-remove hook, so cleanup never depends on `after` hook ordering"
    - "A not-run reporter is declared LAST, after every fixture that can push a record"
    - "Fail-first by wrong sentinel on a host where the fixture actually executes, not on the host that skips it"

key-files:
  created: []
  modified:
    - test/path-boundary.test.ts
    - test/process.test.ts

key-decisions:
  - "The EACCES shape is a directory link pointing INTO an unreadable directory. Aiming at the unreadable directory's child directly produces `unknown-reparse` (lstat itself fails), which is a different fact; only the link makes lstat+readlink succeed while realpath fails"
  - "The denied directory lives in its own mkdtemp tree, never inside the fixture root — `node:test` runs `after` hooks in registration order, so `createFixture`'s `rm` would run first, descend into a 0o000 directory and both strand the tree and turn the test red for an environmental reason"
  - "`denyTraversal` confirms the denial by observing a real EACCES/EPERM from `realpath` and restores the mode and returns null otherwise, so Windows and a root user both land on not-run rather than on a false red"
  - "Test 3's link and allowed root moved into the deniable tree (plan deviation): reaching `recheckPathProof:365-367` requires a readable allowed root AND a proven preflight, which forces the allowed root to contain the deniable tree"
  - "`provePathBoundary:296-299` is recorded as unreachable with its derivation and is NOT claimed as covered; the ledger carries the finding so a later plan decides on the record"
  - "The not-run reporter was moved to the bottom of the file rather than duplicated — it had always under-reported every fixture declared below it, which is precisely the transparency hazard it exists to close"

patterns-established:
  - "Host-probing gate: a fixture asks the filesystem whether the condition it needs actually holds, and records not-run with a distinct reason per missing condition"
  - "Site-distinct tests: one test per call site even when the asserted code is identical, so a dead site is visible rather than masked by its twin"

requirements-completed: [SAFE-02, SAFE-06]

coverage:
  - id: D1
    description: "An allowed root that became unreadable after the proof was taken is refused at `recheckPathProof:352-355` with `unprovable-filesystem` and a detail naming the observed errno, before `canonicalRoot` is ever assigned — the one site where `canonicalizeWithMissingTail`'s non-ENOENT reason (:140-147) becomes an actual refusal"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/path-boundary.test.ts#an allowed root that became unreadable is refused at the recheck rather than compared unresolved"
        status: pass
      - kind: other
        ref: "executed on a real unprivileged POSIX host (WSL2 Arch, Linux 6.18, uid 1000, node v26.8.1): fail-first against a wrong sentinel observed 'unprovable-filesystem' with detail '.../allowed/link could not be canonically resolved at .../allowed/link: EACCES', then green"
        status: pass
    human_judgment: false
  - id: D2
    description: "A component the host refuses to resolve answers `unprovable-filesystem` from `classifyComponent:200-207` through `provePathBoundary`'s component loop at :281-283, and `unknown-reparse` is not accepted in its place"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/path-boundary.test.ts#an unreadable component is unprovable rather than unclassified"
        status: pass
      - kind: other
        ref: "POSIX fail-first observed 'unprovable-filesystem' with detail 'component could not be canonically resolved: .../allowed/link (EACCES)', then green"
        status: pass
    human_judgment: false
  - id: D3
    description: "Losing readability between preflight and apply refuses at `recheckPathProof`'s own component loop (:365-367) with the allowed root still readable, so :352 passes and this is a genuinely different site from D1"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/path-boundary.test.ts#losing readability between preflight and apply refuses at the recheck"
        status: pass
      - kind: other
        ref: "POSIX fail-first observed 'unprovable-filesystem' with detail 'component could not be canonically resolved: /tmp/alpha-aos-deny-.../link (EACCES)' — the deny-tree path confirms the allowed root canonicalized fine and the recheck's own loop answered"
        status: pass
    human_judgment: false
  - id: D4
    description: "A fixture that cannot run on this host reports itself as not-run with a stated reason distinguishing which condition was missing, is never counted as a pass, and its record reaches the reporter's diagnostic"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/path-boundary.test.ts#unsupported path fixtures are reported, never counted as passes"
        status: pass
      - kind: other
        ref: "win32: `node --test dist/test/path-boundary.test.js | grep -c 'not run:'` -> 5 (2 pre-existing + 3 new), fail 0, skipped 2 -> 5; the reporter diagnostic lists all five records with distinct fixture values"
        status: pass
      - kind: other
        ref: "linux: the same three tests execute rather than skip; only the Windows-only reparse fixture is not-run"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real binary answers `--version` under `commandProbeEnvironment()` on the platform running the suite, and a found command never returns both a null version and a null reason"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/process.test.ts#a version probe answers under the probe environment on this platform"
        status: pass
      - kind: other
        ref: "win32 diagnostic: npm 11.8.0, node v24.13.1, git 2.55.0.windows.3 — all found, all versioned, no unsupportedReason"
        status: pass
      - kind: other
        ref: "linux (WSL2) diagnostic: npm 12.0.2, node v26.8.1, git 2.55.0 — first direct evidence that the passthrough set is sufficient off Windows"
        status: pass
      - kind: other
        ref: "controlled negatives, both restored: version pattern -> red naming 'v24.13.1'; silence predicate inverted -> red naming 'npm was found at C:\\Program Files\\nodejs\\npm.cmd'"
        status: pass
    human_judgment: false
  - id: D6
    description: "The ubuntu-latest and macos-latest legs actually execute the EACCES fixture, and all three legs print the per-command probe diagnostic — the observation that lets 01-26 dispose Broken Windows #2 and #4 on evidence"
    requirement: SAFE-02
    verification: []
    human_judgment: true
    rationale: "This plan can build the fixture and prove it runs on a POSIX host; it cannot produce a CI run. WSL2 is a real unprivileged Linux kernel and is strong evidence, but it is not ubuntu-latest and it is not macOS at all, and this phase has already learned three times that local green is not leg green. 01-26 owns the matrix run that observes it."
  - id: D7
    description: "`provePathBoundary:296-299` is recorded as unreachable through the public API with a source-grounded derivation, and no test claims it"
    requirement: SAFE-02
    verification:
      - kind: other
        ref: "derivation transcribed below and into .planning/WINDOWS.md entry #6; the site appears in no test, only in a comment at the D1 test explaining why its twin is covered instead"
        status: pass
    human_judgment: true
    rationale: "The claim is that a branch is unreachable for EVERY filesystem state, which is a proof about control flow rather than an observation a test can make — a test that fails to reach it is consistent with both 'unreachable' and 'my fixture was wrong'. A human should read the derivation before a later plan acts on it."

duration: 14 min
completed: 2026-09-06
status: complete
---

# Phase 01 Plan 25: EACCES `unprovable-filesystem` Fixture and Cross-Platform Probe Answerability Summary

**권한 없이 도는 EACCES 픽스처로 `unprovable-filesystem` 거부를 공개 API 로 도달 가능한 세 지점에서 실제로 실행시키고, 프로브 환경이 실행 중인 플랫폼에서 진짜 답을 받아 내는지 묻는 단언을 세웠다 — 둘 다 실제 POSIX 호스트에서 fail-first 를 거쳤고, 도달 불가능한 네 번째 지점은 커버리지가 아니라 유도 과정으로 기록했다.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-06T11:34:46Z
- **Completed:** 2026-09-06T11:48:20Z
- **Tasks:** 2
- **Files modified:** 2 (`src/` 커밋 0건)

## Accomplishments

- **`unprovable-filesystem` 가 컴파일러 말고 처음으로 실제로 실행됐다.** `grep -c "unprovable-filesystem" test/path-boundary.test.ts` 는 0 이었고 지금은 8 이다. 01-19 가 D4 로, `01-VERIFICATION.md` 가 `behavior_unverified_items[1]` 로, `WINDOWS.md` 가 #2 로 각각 적어 둔 같은 구멍이다.
- **권한이 필요 없다.** plan 은 "privileged EACCES fixture" 를 예상했지만, 평범한 비특권 사용자가 자기 디렉터리의 mode 를 바꾸는 것으로 충분했다. 그래서 이 픽스처는 phase 의 privilege-gated not-run 목록에 합류하지 않고 ubuntu-latest 와 macos-latest 에서 **실제로 돈다**.
- **fail-first 를 실제로 수행했다.** 이 Windows 개발 호스트에서는 세 테스트가 skip 되므로, WSL2 Arch (Linux 6.18, uid 1000, node v26.8.1) 에서 틀린 sentinel 로 돌렸다. 세 테스트 모두 **skip 이 아니라 실행되어 실패**했고, 관측된 코드는 셋 다 미리 고정해 둔 `unprovable-filesystem` 이었다.
- **세 지점이 서로 다른 지점임을 실패 메시지의 detail 이 스스로 증명했다** — 하나는 `canonicalizeWithMissingTail` 의 문장 형식, 둘은 `classifyComponent` 의 문장 형식, 그리고 세 번째는 deny-tree 경로를 가리켜 allowed root 가 정상 정규화됐음을 함께 보인다.
- **`provePathBoundary:296-299` 을 커버됐다고 주장하지 않았다.** 도달 불가능성 유도를 요약과 ledger #6 에 남겼다.
- **프로브 답변성 단언이 Linux 에서 처음으로 확인됐다.** `commandProbeEnvironment()` 만으로 npm/node/git 셋 다 버전을 답했다 — Broken Window #4 가 "Windows 에서만 검증됐다" 고 말한 그 명제에 대한 첫 직접 증거다 (CI leg 은 아니지만).
- **not-run 리포터가 이제 모든 기록을 본다.** 파일 위쪽에 있던 리포터는 아래에 선언된 모든 픽스처의 증거를 조용히 빠뜨리고 있었다.

## Task Commits

1. **Task 1 (tdd): EACCES 픽스처 3개 · 헬퍼 2개 · not-run 리포터 이동** — `a303250` (test)
2. **Task 2 (tdd): 프로브 답변성 단언 · 명령별 diagnostic** — `4ee34bd` (test)

## Files Created/Modified

- `test/path-boundary.test.ts` — `chmod` import; `DeniableTree` / `makeDeniableTree` / `denyTraversal`; 세 개의 새 테스트; not-run 리포터를 파일 맨 아래로 이동하고 그 이유를 원래 자리와 새 자리 양쪽에 주석으로 남김
- `test/process.test.ts` — `probeCommand` import; `a version probe answers under the probe environment on this platform` 테스트 하나

`src/` 는 이 plan 에서 커밋 0건이다 (`git diff --name-only a303250~1..HEAD -- src/` 가 비어 있음). `commandProbeEnvironment` 는 넓혀지지 않았다.

## Fail-first 관측 (Task 1) — 편집 전 그대로 기록

세 테스트를 쓴 직후 기대값을 `"__deliberately-wrong__"` 로 두고, **이 픽스처가 skip 되지 않는 호스트**에서 돌렸다: WSL2 Arch, `uname -r` = 6.18.33.2-microsoft-standard-WSL2, `id -u` = 1000 (비특권), node v26.8.1. 결과는 `tests 24 / pass 20 / fail 3 / skipped 1` — 새 테스트 3개가 정확히 실행되어 실패했다.

| 테스트 | 관측된 code | 관측된 detail |
|---|---|---|
| an allowed root that became unreadable is refused at the recheck rather than compared unresolved | `unprovable-filesystem` | `/tmp/alpha-aos-path-JbrzeI/allowed/link could not be canonically resolved at /tmp/alpha-aos-path-JbrzeI/allowed/link: EACCES` |
| an unreadable component is unprovable rather than unclassified | `unprovable-filesystem` | `component could not be canonically resolved: /tmp/alpha-aos-path-DKPKeE/allowed/link (EACCES)` |
| losing readability between preflight and apply refuses at the recheck | `unprovable-filesystem` | `component could not be canonically resolved: /tmp/alpha-aos-deny-nSvg8U/link (EACCES)` |

**관측된 코드는 셋 다 미리 고정된 `unprovable-filesystem` 이었다.** 따라서 기대값을 관측에 맞춰 바꾼 일은 없고, prohibition 이 요구하는 halt-and-report 조건도 발생하지 않았다. sentinel 을 되돌린 뒤 파일은 실험 전과 **byte-identical** 임을 `diff -q` 로 확인했다.

detail 의 문장 형식이 세 지점이 서로 다르다는 독립적 증거다:

- 1행은 `canonicalizeWithMissingTail` 의 `${pathValue} could not be canonically resolved at ${ancestor}: ${code}` (`:140-147`) → `recheckPathProof:352-355`.
- 2·3행은 `classifyComponent` 의 `component could not be canonically resolved: ${path} (${code})` (`:200-207`) → 각각 `provePathBoundary:281-283` 와 `recheckPathProof:365-367`.
- 3행의 경로가 `alpha-aos-deny-…/link` 라는 것이 3행이 2행과 다른 지점임을 보인다: allowed root(deny 트리 root)는 정상적으로 정규화됐고(그래서 `:352` 를 통과했고), 답한 것은 recheck **자신의** component 루프다.

되돌린 뒤 같은 POSIX 호스트: `tests 24 / pass 23 / fail 0 / skipped 1` (남은 skip 은 Windows 전용 reparse 픽스처). `/tmp` 에 남은 `alpha-aos-*` 디렉터리 0개 — mode `0o000` 트리가 좌초되지 않았다.

## Task 2 의 통제 실험 (각각 원복함)

| 실험 | 결과 |
|---|---|
| 버전 패턴을 `/^__deliberately-wrong__/u` 로 | ✖ `expected a leading v and a digit ... on win32, got "v24.13.1"; the passthrough set in commandProbeEnvironment is what needs widening, not its pinned literals (01-21 D5)` |
| 침묵 판정식을 반전 (`version === null && unsupportedReason === null`) | ✖ `npm was found at C:\Program Files\nodejs\npm.cmd but answered with neither a version nor a stated unsupported reason...` — 루프 본문이 실제 found 명령에 대해 돈다는 것과 실패 메시지가 이름·해석된 경로를 담는다는 것을 함께 보임 |

원복 후 파일은 실험 전과 byte-identical (`diff -q`).

## 명령 프로브 증거 (01-26 이 세 leg 에서 읽을 줄)

- **win32:** `[{"name":"npm","found":true,"version":"11.8.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.13.1","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0.windows.3","unsupportedReason":null}]`
- **linux (WSL2):** `[{"name":"npm","found":true,"version":"12.0.2","unsupportedReason":null},{"name":"node","found":true,"version":"v26.8.1","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0","unsupportedReason":null}]`

Linux 줄이 Broken Window #4 에 대한 첫 직접 증거다: `commandProbeEnvironment()` 의 passthrough 집합만으로 세 명령 모두 버전을 답했으므로, POSIX 에서 allowlist 를 넓혀야 할 이유는 현재 관측 범위 안에 없다. **다만 이것은 ubuntu-latest 가 아니고 macOS 는 아예 미관측이므로, ledger #4 의 처분은 `01-26` 의 몫이다.**

## Flagged finding: `provePathBoundary:296-299` 은 공개 API 로 도달 불가능하다 (소스 기반 유도)

plan 의 이전 개정판은 네 번째 테스트가 이 지점(preflight 안의 allowed-root 정규화 거부)을 몰 수 있다고 봤다. 소스를 읽으면 그럴 수 없고, 다른 어떤 픽스처 모양으로도 그렇다:

1. `:260` 의 루트 선택은 **어휘적**이다 — `roots.find((root) => withinRoot(root, configured))`. 어떤 정규화보다도 먼저 돌고, 대상을 어휘적으로 포함하지 않는 루트에 대해서는 `undefined` 를 돌려 `:261-266` 의 `outside-configured-root` 로 나간다.
2. 선택이 성공하면 `configuredRoot` 는 `configured` 자신이거나 그 진성 어휘 조상이므로, `configuredRoot ∈ ancestorChain(configured)` 이고 `configuredRoot` 의 모든 조상도 그렇다.
3. `:271-285` 의 component 루프는 그 체인 전체를 걸으며 각 원소에 `classifyComponent` 를 부르고, `classifyComponent` 는 `:296` 이 부를 것과 **같은** `realpath` 호출을 낸다.
4. 따라서 `:296-299` 이 발화하려면 `configuredRoot` 의 어떤 조상에서 `realpath` 가 non-ENOENT 로 실패해야 하는데, 루프는 이미 그 조상을 방문해 `:274-279` 의 `unknown-reparse`(lstat 자체가 non-ENOENT 실패) 또는 `:281-283` 의 `unprovable-filesystem`(realpath 가 non-ENOENT 실패)으로 **먼저 반환**했다.

남는 유일한 길은 `:285` 와 `:296` 사이에 파일시스템이 바뀌는 TOCTOU 뿐이고, 그것은 어떤 픽스처도 결정적으로 몰 수 없다. `node:fs/promises` 를 몽키패치해 흉내 내는 것은 "실제 파일시스템이 오라클" 이라는 이 스위트의 전제 자체를 뒤집는 일이므로 하지 않았다.

**처분: flagged, 미해결, 의도적으로 커버하지 않음.** 이 분기는 죽은 코드가 아니라 **순서에 의해 가려진 방어적 대칭**이다 — component 루프를 재정렬·축소·제거하는 순간 살아난다. 이 plan 은 `src/` 를 건드리지 않으므로 아무것도 삭제하지 않았고 그 자리에 주석도 추가하지 않았다. 대신 유도를 여기와 `.planning/WINDOWS.md` #6 에 남겨, 나중 plan 이 재발견이 아니라 **기록 위에서** 판단하게 했다. 그 행동적 쌍둥이 — 정규화할 수 없는 루트는 해석되지 않은 채 비교되는 대신 거부된다 — 는 `recheckPathProof:352-355` 에서 D1 이 **증명한다**.

## 명시적으로 커버하지 않은 것 (조용한 누락이 아니라 이유와 함께)

- **Windows unknown-reparse 카나리아** (SAFE-02, `behavior_unverified_items[0]`). `01-VALIDATION.md` 가 이 phase 의 유일한 manual-only 검증으로 지정했고, `01-UAT.md` 항목 2 는 `result: skipped` 다 — 사람이 `fsutil reparsepoint` 가 요구하는 권한을 현재 갖고 있지 않다. POSIX leg 도 공급할 수 없다(개념 자체가 Windows 전용이라고 정확히 보고한다). `01-26` 이 `<human-check>` 로 들고 가며, 여기서 테스트로 위조하지 않았다.
- **파일 심링크 탈출 카나리아** (SAFE-02). `01-UAT.md` 항목 3 은 사람이 `pass` 로 수락하되 "관측이 아니라 권한 게이트를 수락한 것" 이라고 명시했다. 승격에는 관리자 셸 또는 개발자 모드가 필요하고, 그것은 어떤 plan 도 만들 수 없는 호스트 상태다. `01-26` 이 `<human-check>` 로 들고 간다.
- **`WINDOWS.md` #1** (01-19 픽스처 4 가 예측된 재현자가 아니라 두 번째 음성 통제였다는 사실). 제품이나 스위트의 결함이 아니라 planning 예측에 대한 정직한 공시이므로 고칠 것이 없다. `01-26` 이 기록 위에서 ledger 처분을 정한다.

## Decisions Made

frontmatter `key-decisions` 참조. 이 plan 의 중심은 두 가지다.

1. **게이트는 플랫폼 이름이 아니라 호스트에게 묻는다.** `denyTraversal` 은 `chmod(0o000)` 후 `realpath` 를 실제로 불러 `EACCES`/`EPERM` 이 오는지 확인하고, 오지 않으면 mode 를 되돌린 뒤 `null` 을 돌려준다. Windows 도 root 도 "해석에 성공" 이라는 같은 답으로 not-run 에 착지하며, 새 픽스처가 환경적 이유로 leg 를 빨갛게 만드는 경로는 없다. plan 의 `<reversibility rating="costly">` 가 경고한, "너무 성급한 self-gate 가 영원히 not-run 을 보고하는데 파일은 커버된 것처럼 보이는" 실패를 피하는 것도 같은 설계다 — 게이트가 잘못 잠기면 CI 로그의 not-run 사유가 즉시 그것을 말한다.
2. **거부되는 디렉터리는 fixture root 안에 두지 않는다.** `node:test` 는 `context.after` 를 **등록 순서대로** 돌린다(설치된 Node v24.13.1 에서 직접 측정: 먼저 등록한 훅이 먼저 돈다). `createFixture` 가 자기 `rm` 을 먼저 등록하므로, mode 복원을 나중에 등록하면 그 `rm` 이 먼저 돌아 `0o000` 디렉터리를 내려가려다 EACCES 로 실패해 **지울 수 없는 트리를 남기는 동시에 테스트까지 빨갛게 만든다**. 그래서 복원과 삭제를 `makeDeniableTree` 자기 트리의 **한 훅 안에서** 하고, fixture root 에는 심링크만 남긴다(`rm` 은 심링크를 따라가지 않고 unlink 한다). 두 훅의 상대 순서는 무관해진다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 3 의 plan 지정 픽스처 모양으로는 `proven === true` 가 불가능하다**

- **Found during:** Task 1 (테스트 3 작성 중, 제어 흐름 도출 단계)
- **Issue:** plan 은 테스트 3 에 `allowedRoots: [fixture.allowed]`, `path: join(fixture.allowed, "link", "file.txt")` 를 지정하고 `denyTraversal` 전에 `proven === true` 를 단언하라고 했다. deniable 트리는 (정리 안전성 때문에) fixture root 밖의 자기 `mkdtemp` 트리에 있으므로, `<allowed>/link` 의 정규 해석은 `<deny-tree>/blocked/inner` — `fixture.allowed` **밖**이다. 따라서 preflight 는 `outside-canonical-root` 로 `proven === false` 가 되고, 단언은 실패하며 `:365-367` 에는 영영 닿지 못한다.
- **Fix:** 테스트 3 의 링크를 deniable 트리 자기 root 안(`<tree.root>/link`)에 만들고 `allowedRoots: [tree.root]` 를 쓴다. 유도: `:365-367` 이 답하려면 (a) allowed root 가 정규화에 성공해야 하고(`:352` 통과), (b) 기록된 어떤 component 는 정규화에 실패해야 하며, (c) preflight 가 **proven** 이었어야 하므로 대상의 정규형이 정규 allowed root 안에, 즉 deniable 트리 안에 있어야 한다. deniable 트리를 포함하지 않는 fixture root 는 (c) 를 만족시킬 수 없다. `tree.root` 는 세 조건을 동시에 만족하는 최소 루트다. 테스트 3 은 fixture 를 쓰지 않으므로 `createFixture` 호출도 뺐다.
- **Files modified:** `test/path-boundary.test.ts`
- **Verification:** POSIX 에서 실제 실행 — fail-first 에서 `proven === true` 단언을 통과한 뒤 code 단언에서 실패했고(즉 preflight 는 정상 성공), 관측된 detail 이 `/tmp/alpha-aos-deny-…/link` 를 가리켜 recheck 자신의 component 루프가 답했음을 보인다. 원상 복구 후 green.
- **Committed in:** `a303250` (Task 1 commit)
- **주석:** 유도를 테스트 자리에 남겼고 이 절을 참조하게 했다.

**2. [Rule 2 - Missing Critical] not-run 리포터가 자기 아래 선언된 모든 픽스처의 증거를 빠뜨리고 있었다**

- **Found during:** Task 1 (acceptance criterion "`unsupported path fixtures are reported, never counted as passes` still passes and prints the new records in its diagnostic" 검증 중)
- **Issue:** `node:test` 는 top-level 테스트를 선언 순서대로 돌린다. 리포터는 파일 311행에 있었고 새 픽스처 3개는 파일 끝에 있으므로, Windows 실행에서 리포터의 diagnostic 은 기존 2건만 출력하고 새 3건을 **빠뜨렸다**. 이것은 새 테스트만의 문제가 아니라 **선재 결함**이다 — 01-07 과 01-19 가 추가한 `created-link-substitution`, `linked-missing-root`, `linked-existing-root`, `linked-root-escape`, `linked-root-refusal-detail` 도 전부 리포터 아래에 선언돼 있어 지금까지 한 번도 집계되지 않았다. 이 plan 의 prohibition #1(“게이트된 픽스처가 통과한 것처럼 보이면 안 된다”)이 이름 붙인 바로 그 위험이고, 메커니즘 자체가 그 위험을 반쯤 열어 두고 있었다.
- **Fix:** 리포터 테스트를 단언 변경 없이 파일 맨 아래로 옮기고, 원래 자리와 새 자리 양쪽에 왜 여기여야 하는지와 "not-run 을 push 하는 것은 무엇이든 이 테스트 **위**에 온다" 는 규칙을 주석으로 남겼다.
- **Files modified:** `test/path-boundary.test.ts`
- **Verification:** win32 재실행 → diagnostic 이 5건 전부 출력(`escape-file-link`, `unknown-reparse`, `eacces-recheck-root`, `eacces-component`, `eacces-recheck-component`), fail 0. linux 재실행 → 1건(`unknown-reparse`), fail 0.
- **Committed in:** `a303250` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** 둘 다 plan 의 acceptance criteria 를 만족시키기 위해 필수였고 방향은 **강화**다. scope creep 없음, `src/` 커밋 0건. prohibition 위반 없음 — not-run 을 pass 로 보고한 픽스처 없음, 관측값에 맞춰 바꾼 기대값 없음, 침묵을 수용 가능한 결과로 취급한 명령 없음, 환경적 이유로 빨개질 수 있는 새 테스트 없음.

## Prohibition compliance

| Prohibition | 상태 |
|---|---|
| 게이트된 픽스처를 실행하지 않고 통과로 보고하지 말 것 | 준수. 세 테스트 모두 이 호스트에서 `notRun.push` + `context.skip` 으로 **not-run** 이며, 사유는 어느 조건이 없었는지(링크 불가 / mode 로 traversal 거부 안 함)를 구별한다. 리포터가 그것을 출력하도록 이동까지 했다. |
| 아무 non-ok 코드나 받아들여 EACCES 픽스처를 초록으로 만들지 말 것 | 준수. 세 단언 모두 리터럴 `unprovable-filesystem` 이고 `unknown-reparse` 를 대안으로 받지 않는다. fail-first 에서 관측된 코드도 셋 다 `unprovable-filesystem` 이었으므로 기대값을 관측에 맞춘 일이 없고, halt-and-report 조건도 발생하지 않았다. |
| 찾은 명령이 버전도 이유도 없이 침묵하는 것을 수용 가능한 결과로 두지 말 것 | 준수. `version !== null \|\| unsupportedReason !== null` 이 실패 단언이고, 통제 실험으로 그 루프가 실제 found 명령에 대해 돈다는 것을 확인했다. |
| 새 픽스처가 환경적 이유로 leg 를 빨갛게 만들지 말 것 | 준수. `denyTraversal` 이 호스트에게 실제 거부 여부를 묻고, 거부하지 않으면 mode 를 되돌린 뒤 not-run 으로 착지한다. 이 픽스처가 빨개지는 유일한 길은 제품이 거부를 멈추는 것이다. |

## Verification (plan `<verification>`)

| 항목 | 결과 |
|---|---|
| `grep unprovable-filesystem test/path-boundary.test.ts` 가 0 이 아님 | ✓ 8 |
| 세 EACCES 테스트가 존재하고 세 개의 서로 다른 소스 지점을 이름 짓는다 | ✓ `:352-355`, `:281-283`, `:365-367` — 각 테스트 주석에 명시 |
| 이 Windows 호스트에서 세 테스트가 구별되는 사유로 not-run 을 보고한다 | ✓ `not run:` 5줄, fixture 값 3개가 각각 다름, skipped 2 → 5 |
| fail-first 관측이 요약에 기록됨 (수행 불가였다면 그 사실도) | ✓ 위 절. **수행 가능했고 수행했다** — WSL2 POSIX 호스트 |
| `:296-299` 도달 불가능 유도가 요약에 전사되고 어떤 테스트도 그 지점을 주장하지 않음 | ✓ 위 절 + ledger #6 |
| `a version probe answers under the probe environment on this platform` 통과 + 명령별 diagnostic 출력 | ✓ win32 통과, diagnostic 출력. linux 에서도 통과 확인 |
| `npm test` fail 0, 총계가 `01-24-SUMMARY.md` 대비 최소 4 증가 | ✓ `tests 208 / pass 203 / fail 0 / skipped 5` (01-24 는 204) |
| `src/` 가 이 plan 에 의해 변경되지 않음 | ✓ `git diff --name-only a303250~1..HEAD -- src/` 가 비어 있음 |
| manual-only SAFE-02 카나리아 2건이 사유와 함께 이름 지어져 01-26 으로 이월됨 | ✓ 위 「명시적으로 커버하지 않은 것」 절 |

## Issues Encountered

- **이 개발 호스트에서는 새 픽스처가 원리적으로 skip 된다.** Windows 는 POSIX mode 로 traversal 을 거부하지 않으므로 fail-first 를 여기서 수행할 수 없었다. plan 은 "POSIX leg 또는 POSIX 컨테이너에서 수행하거나, 수행할 수 없었다면 그 사실을 그대로 적으라" 고 했고, WSL2 (비특권 uid 1000, 실제 Linux 커널, `/tmp` 는 실제 POSIX 파일시스템) 가 그 조건을 만족해 **수행했다**. `/mnt/d` 는 POSIX mode 를 강제하지 않지만 픽스처는 `os.tmpdir()` 아래에만 트리를 만들므로 영향이 없다.
- **`git add` 대상 외 untracked `.gsd/` 디렉터리**가 세션 시작 시점부터 존재한다. 이 plan 이 만든 것이 아니며 커밋에 포함하지 않았다.

## Known limitations

- **WSL2 는 ubuntu-latest 가 아니고, macOS 는 이 세션에서 전혀 관측되지 않았다.** 세 픽스처가 macOS 에서 도는지, 그리고 `commandProbeEnvironment` 가 macOS 에서 충분한지는 `01-26` 의 매트릭스 실행만이 답한다 (coverage D6).
- **`provePathBoundary:296-299` 은 여전히 커버되지 않는다.** 유도상 도달 불가능하며, 이것은 커버리지가 아니라 기록으로 남았다 (ledger #6, coverage D7).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **G-01-1 은 이 plan 이 닫지 않는다.** 닫는 증거는 여전히 세 leg 이 모두 초록인 새 three-OS run id 이며, 그것은 `01-26` 의 몫이다. 이 plan 이 주장하는 것은 그 실행이 지금 **두 개의 잔여 커버리지 창까지 함께 관측하게 됐다**는 것뿐이다.
- `WINDOWS.md` #2 와 #4 는 **열린 채로 둔다.** 픽스처와 단언은 존재하지만, plan 이 정한 처분 시점은 실제 leg 관측 이후(`01-26`)다. 대신 `#6` 이 새로 기록됐다 (`:296-299` 도달 불가능성).
- 로컬 게이트 상태: `npm run check` 통과, `npm test` `tests 208 / pass 203 / fail 0 / skipped 5`. `01-26` 은 자기 baseline 을 **208** 로 인용해야 한다 (204 가 아니라).
- POSIX 실측 baseline (참고, WSL2): `path-boundary` 24/23 pass/0 fail/1 skipped, `process` 21/21 pass/0 fail/0 skipped.

## Self-Check: PASSED

- 파일 존재 확인: `test/path-boundary.test.ts` — FOUND, `test/process.test.ts` — FOUND
- 커밋 존재 확인: `a303250` — FOUND, `4ee34bd` — FOUND
- 두 커밋 모두 파일 삭제 0건 (`git diff --diff-filter=D --name-only` 가 각각 비어 있음)
- `src/` 에 대한 이 plan 의 커밋: 0건
- 이 plan 이 만든 untracked 파일: 0건

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-06*
