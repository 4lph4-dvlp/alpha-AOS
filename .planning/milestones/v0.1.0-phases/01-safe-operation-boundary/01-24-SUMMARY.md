---
phase: 01-safe-operation-boundary
plan: 24
subsystem: testing
tags: [ci, github-actions, node-test-runner, environment-scrubbing, npm-lifecycle, regression-test]

requires:
  - phase: 01-21
    provides: "scripts/run-tests.mjs — the scrubbing test runner and the `the test runner environment carries no npm lifecycle injection` oracle"
  - phase: 01-23
    provides: "the three-OS acceptance gate framing and the prohibition against making a red leg green by shrinking what it runs"
provides:
  - "A terminal `--files` argument on scripts/run-tests.mjs that expresses an explicit compiled-file subset, keeps self-enumeration as the default, and refuses both an empty explicit set and a named-but-unbuilt path"
  - "The `Safety boundary suites` step in .github/workflows/ci.yml routed through the scrubbing runner with all ten Phase 1 suites still named in their original order"
  - "`init_cwd` in the runner's scrubbed exact-name set and inside the runner-environment invariant, under a case-folded lookup that aligns all three injection loci"
  - "A differential regression test that reproduces RC-5 in-suite on every leg: routed invocation green, bare invocation red and naming npm_config_prefix"
  - "A region-scoped source control over the workflow's routing, anchored to the whole `- name: Safety boundary suites` line"
affects: [01-25, 01-26, phase-01-verification, ci-matrix]

actuals:
  tokens: 11199
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Terminal `--files` argument: flags before, paths after, order preserved, missing paths named loudly"
    - "Differential (routed vs bare) regression testing with a serialized probe that shares the parent's verdict rule"
    - "Region-scoped source control over CI workflow text instead of whole-file grep"

key-files:
  created: []
  modified:
    - scripts/run-tests.mjs
    - .github/workflows/ci.yml
    - test/preview.test.ts

key-decisions:
  - "`--files` is terminal: everything after it is a path, so a second `--files` token is just a path and fails the existence check rather than silently re-splitting the argument vector"
  - "A named-but-unbuilt path is a loud failure naming every missing path — strictly stronger than the shell glob it replaces, where a suite that stops being compiled goes quietly absent"
  - "Only `init_cwd` was added to the scrub set. `NODE` and `COLOR` were deliberately excluded: they are not npm-namespaced, and widening the scrub set on a guess is how a repair becomes a second defect"
  - "The singleton-name lookup in the invariant was case-folded rather than adding `INIT_CWD` in uppercase to a case-sensitive list — a strengthening that makes all three injection loci (regex `i` flag, runner `toLowerCase()`, this predicate) agree"
  - "The routed-vs-bare environment name difference is a `context.diagnostic` line, not a gate: the full set of names npm adds varies by npm version, and gating on it would make the acceptance gate hostage to an npm upgrade"
  - "Test B's step marker is a whole-line regex, not `indexOf` — the prefix match let a renamed step pass while guarding nothing (found by a controlled negative control, fixed under Rule 1)"

patterns-established:
  - "Fail-first by injection: when the developer host cannot reproduce a CI-only defect, inject what the runner image sets at machine scope and record the observed failure verbatim before changing anything"
  - "A negative control asserts both the non-zero exit AND the reason in the output, so it cannot pass on an unrelated failure"
  - "Every new source-text assertion is proven red by a controlled experiment on the real file, then restored"

requirements-completed: [SAFE-01, SAFE-06]

coverage:
  - id: D1
    description: "The CI `Safety boundary suites` step reaches the test process through scripts/run-tests.mjs with all ten Phase 1 suites still named in order — the NOT_WIRED link in 01-VERIFICATION.md"
    requirement: SAFE-01
    verification:
      - kind: unit
        ref: "test/preview.test.ts#the CI safety step reaches the suite through the scrubbing runner"
        status: pass
      - kind: other
        ref: "controlled negative controls: routing removed / one suite dropped / step renamed — each observed red, then restored"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/run-tests.mjs accepts a terminal `--files` subset, still self-enumerates dist/test without it, and refuses an empty explicit set and a named-but-unbuilt path"
    requirement: SAFE-01
    verification:
      - kind: other
        ref: "node scripts/run-tests.mjs --files (exit 1, 'An explicit empty file set is a failure')"
        status: pass
      - kind: other
        ref: "node scripts/run-tests.mjs --files dist/test/does-not-exist.test.js (exit 1, names the path)"
        status: pass
      - kind: other
        ref: "node scripts/run-tests.mjs --test-name-pattern ... (self-enumerated 20 files, exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "`init_cwd` is inside the runner-environment invariant under a case-folded lookup, so `INIT_CWD` and `init_cwd` are one name to the oracle and all three injection loci agree on case"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/preview.test.ts#the test runner environment carries no npm lifecycle injection"
        status: pass
      - kind: other
        ref: "INIT_CWD=$PWD / init_cwd=$PWD bare runs — missed before the edit, caught in both spellings after"
        status: pass
    human_judgment: false
  - id: D4
    description: "A differential regression test runs on every leg: the routed invocation exits 0 under injection while the bare invocation exits non-zero and names npm_config_prefix"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/preview.test.ts#the CI safety-suite invocation scrubs an injected npm setting that a bare invocation keeps"
        status: pass
    human_judgment: false
  - id: D5
    description: "RC-5 reproduced and then closed on this developer host, where npm injects nothing by itself"
    requirement: SAFE-01
    verification:
      - kind: other
        ref: "npm_config_prefix=... node --test dist/test/preview.test.js — fail 1 on the invariant, actual ['npm_config_prefix'] (before any edit)"
        status: pass
      - kind: other
        ref: "npm_config_prefix=... INIT_CWD=... node scripts/run-tests.mjs --files <ten suites> — tests 125 / pass 123 / fail 0 (after)"
        status: pass
    human_judgment: false

duration: 36 min
completed: 2026-09-06
status: complete
---

# Phase 01 Plan 24: RC-5 Entrypoint Asymmetry Closure Summary

**CI의 `Safety boundary suites` 스텝을 `scripts/run-tests.mjs --files` 로 배선하고, 러너에 명시적 파일 부분집합과 `init_cwd` 스크럽을 가르치고, RC-5 를 이 호스트에서 재현·수리한 뒤 그 증명을 세 leg 에서 매번 도는 차등 회귀 테스트로 고정했다.**

## Performance

- **Duration:** 36 min
- **Started:** 2026-09-06T10:49:26Z
- **Completed:** 2026-09-06T11:25:28Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **RC-5 를 로컬에서 재현했다.** `npm_config_*` 가 비어 있는 이 개발 호스트에서 windows-latest 러너 이미지가 머신 스코프로 하는 일을 직접 했다 — `npm_config_prefix` 주입 후 bare `node --test dist/test/preview.test.js` 는 정확히 CI 로그와 같은 실패를 냈다.
- **`scripts/run-tests.mjs` 에 terminal `--files` 인자를 추가**했다. 없으면 지금까지처럼 `dist/test/*.test.js` 를 스스로 열거하고, 있으면 뒤의 경로를 **주어진 순서 그대로** 사용한다. 빈 명시 집합도, 빌드되지 않은 이름도 loud failure 다.
- **CI 스텝을 그 러너로 배선**했다. 10개 스위트는 이름도 순서도 그대로이며, 스텝 이름 `Safety boundary suites` 도 그대로다. 스텝 위 주석에 되돌리면 RC-5 가 되돌아온다는 사실과 run id `33984247757` 을 남겼다.
- **`init_cwd` 를 러너의 스크럽 집합과 불변식 양쪽에 넣고, 불변식의 조회를 case-fold** 했다. 이제 세 loci — 정규식의 `i` 플래그, 러너의 `INJECTED_NAMES.has(name.toLowerCase())`, 불변식의 술어 — 가 한 목소리로 대소문자를 무시한다.
- **증명을 스위트 안으로 옮겼다.** 차등 회귀 테스트와 워크플로 배선 소스 통제가 `preview.test.js` 안에 있고, `preview.test.js` 는 10-파일 목록의 첫 항목이므로 세 OS leg 모두에서 매 실행마다 돈다.

## Task Commits

1. **Task 1 (tracer): RC-5 재현 · 러너 `--files` · CI 배선** — `3f8685b` (fix)
2. **Task 2 (tdd): 차등 회귀 테스트 · 워크플로 소스 통제 · `init_cwd` 불변식 강화** — `18b4f02` (test)

## Files Created/Modified

- `scripts/run-tests.mjs` — terminal `--files` 인자, `namedTestFiles(argv)`, 누락 경로 전체를 이름 짓는 loud failure, `init_cwd` 스크럽, RC-5 의 유래를 적은 헤더 주석 한 문단
- `.github/workflows/ci.yml` — `Safety boundary suites` 스텝이 `node scripts/run-tests.mjs --files` 로 시작. 10개 스위트·순서·스텝 이름 불변. 되돌림 금지 사유를 적은 주석 추가
- `test/preview.test.ts` — `init_cwd` 를 소문자로 추가하고 조회를 case-fold, 새 테스트 2개(`the CI safety-suite invocation scrubs an injected npm setting that a bare invocation keeps`, `the CI safety step reaches the suite through the scrubbing runner`)

## Fail-first 관측 (Task 1 단계 1) — 편집 전, 그대로 기록

`npm_config_prefix=/tmp/alpha-aos-rc5-probe node --test dist/test/preview.test.js` → exit 1, `tests 9 / pass 8 / fail 1`.

```
✖ the test runner environment carries no npm lifecycle injection
  AssertionError [ERR_ASSERTION]: the test process inherited npm lifecycle injection: npm_config_prefix.
  While these names exist, the write location of every child this process launches is decided by how the
  suite was invoked rather than by the code under test, so the surface the preview oracle observes differs
  between `npm test` and a bare `node --test`. The suite must run through scripts/run-tests.mjs, which
  strips them before spawning.
  + actual: [ 'npm_config_prefix' ]
  - expected: []
```

**주입 아래에서 실패한 테스트는 이 하나뿐이었다** (`fail 1`, 나머지 8개 통과, skipped 0). 주입을 좁혀 피해 가야 할 두 번째 실패는 없었고, 따라서 제품에 대한 새 정보로 기록할 항목도 없다. 이것은 `01-VERIFICATION.md` 가 windows-latest 에서 관측한 것과 같은 실패다.

## 수리 증명 (Task 1 단계 4)

같은 주입 아래, 이번에는 CI 와 동등한 배선된 호출:

`npm_config_prefix=/tmp/alpha-aos-rc5-probe INIT_CWD=$PWD node scripts/run-tests.mjs --files <10개 스위트>` → exit 0, `tests 125 / pass 123 / fail 0 / skipped 2`.

같은 주입, 같은 파일, 반대 판정. windows-latest 가 한 job 안에서 보여 준 비대칭의 거울상이며, 이번에는 배선된 쪽이 초록이다. (CI 가 관측한 값은 `125 / 123 / fail 1 / skipped 1` 이었다 — 여기서 skipped 2 인 것은 이 호스트의 권한 관련 not-run 항목 때문이며 CI 와는 무관하다.)

## `init_cwd` 강화의 fail-first (Task 2)

편집 전, `INIT_CWD` 와 `init_cwd` 를 둘 다 환경에 넣고 bare 실행 → 불변식은 **통과**했다 (거짓 초록: 오라클이 그 이름을 보지 못한다). 편집 후 같은 실행:

- `INIT_CWD=$PWD` → `✖ ... inherited npm lifecycle injection: INIT_CWD`, `actual: ['INIT_CWD']`
- `init_cwd=$PWD` → `✖ ... inherited npm lifecycle injection: init_cwd`

두 철자 모두 잡힌다. 전에 잡히던 것은 전부 그대로 잡히므로 이것은 **강화**이며, prohibition 이 금지하는 약화가 아니다.

## Test B negative controls (통제 실험, 각각 원복함)

| 실험 | 결과 |
|---|---|
| `run:` 를 bare `node --test` 로 되돌림 | ✖ `the Safety boundary suites step must reach the test process through scripts/run-tests.mjs` |
| `dist/test/redaction.test.js` 한 줄 제거 | ✖ `... no longer names every Phase 1 suite. Missing: dist/test/redaction.test.js` |
| 스텝 이름을 `Safety boundary suites RENAMED` 로 변경 | ✖ `the step named Safety boundary suites is absent from .github/workflows/ci.yml` |

세 실험 모두 `git checkout -- .github/workflows/ci.yml` 로 원복했고, 원복 후 baseline 은 초록이다.

## Decisions Made

frontmatter `key-decisions` 참조. 특히 두 가지가 이 plan 의 중심이다.

1. **`--files` 는 terminal 이다.** 뒤에 오는 모든 것이 경로이므로, 두 번째 `--files` 토큰은 그냥 경로이고 존재 검사에서 시끄럽게 실패한다. 인자 벡터가 조용히 재분할되는 경로는 없다.
2. **불변식의 singleton 조회를 case-fold 했다.** `INIT_CWD` 를 대문자로 case-sensitive 리스트에 끼워 넣으면 불변식이 `init_cwd` 를 놓치며, 그것이 RC-5 가 이미 한 번 취한 near-miss 계열이다. 대신 리스트를 소문자로 통일하고 조회를 접었다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test B 의 스텝 마커가 접두사 일치라 rename 을 놓쳤다**

- **Found during:** Task 2 (acceptance criterion "That test fails rather than passes when the step region cannot be located at all" 검증 중)
- **Issue:** plan 이 지시한 대로 `workflow.indexOf("- name: Safety boundary suites")` 로 구간을 찾으면, 스텝 이름을 `Safety boundary suites RENAMED` 로 바꿔도 접두사가 일치해 테스트가 **통과**했다. 통제 실험 3이 빨개지지 않았다 — acceptance criterion 이 요구하는 바로 그 실패가 일어나지 않은 것이고, 이 상태의 테스트는 이름이 바뀐 스텝을 계속 지키는 척했을 것이다.
- **Fix:** 마커를 whole-line 정규식 `/^[ \t]*- name: Safety boundary suites[ \t]*$/mu` 로 바꾸고, 못 찾으면 `assert.fail` 로 즉시 실패시켰다. 왜 `indexOf` 가 부족한지 그 자리 주석에 남겼다.
- **Files modified:** `test/preview.test.ts`
- **Verification:** 통제 실험 3 재실행 → `✖ the step named Safety boundary suites is absent from ...`. 실험 1·2 도 재실행해 여전히 각자의 이유로 빨간불임을 확인했고, 원복 후 baseline 초록.
- **Committed in:** `18b4f02` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 이 수정은 plan 의 acceptance criterion 을 만족시키기 위해 필수였고, 테스트를 **강화**하는 방향이다. scope creep 없음. prohibition 위반 없음 — 어떤 스위트도 제거되지 않았고, 어떤 테스트도 not-run 으로 표시되지 않았고, 어떤 단언도 완화되지 않았다.

## Prohibition compliance

| Prohibition | 상태 |
|---|---|
| 스위트 제거·not-run 표시·단언 완화로 빨간 leg 를 초록으로 만들지 말 것 | 준수. 10개 스위트 전부 이름·순서 그대로. 새 테스트 2개 추가, 제거 0. `npm test` 총계 202 → 204. |
| `test/preview.test.ts` 의 runner-environment 불변식을 약화·skip·삭제하지 말 것 | 준수. **강화**만 했다 (case-fold + `init_cwd`). 잡던 것은 전부 그대로 잡는다. |
| `npm_config_prefix` 를 제품의 global-root 해석에서 제거하지 말 것 | 준수. `src/core/install.ts` 는 이 plan 에서 커밋 0건이며, `resolveGlobalNodeModulesRoot` 는 여전히 `source.npm_config_prefix` 를 읽는다 (`src/core/install.ts:294`). |
| 빌드되지 않은 명시 파일을 조용히 받아들이지 말 것 | 준수. 누락 경로를 **전부** 이름 짓고 exit 1. |
| 주입 아래 다른 이유로 실패하는 테스트를 주입을 좁혀 회피하지 말 것 | 해당 없음 — 주입 아래 실패한 테스트는 불변식 하나뿐이었고, 그 사실을 위에 기록했다. |

## Issues Encountered

- **`node -e` 와 bash `/tmp` 경로 불일치 (Windows):** Git Bash 의 `/tmp` 는 Node 에서 `D:\tmp` 로 해석되어 스플라이스 스크립트가 ENOENT 로 실패했다. `cygpath -w /tmp` 로 실제 Windows 경로를 넘겨 해결. 제품 코드와 무관한 도구 문제.

## Known limitations

- **`--files` 의 loud-failure 두 경로(빈 명시 집합 / 빌드되지 않은 이름)에는 영구 회귀 테스트가 없다.** 이번 세션에서 명령으로 직접 관측해 통과를 확인했고 (`coverage` D2 에 명령 그대로 기록), 동작 자체는 결정적이지만, 스위트가 매 leg 에서 지켜 주지는 않는다. 후속 phase 에서 러너 자체의 단위 테스트를 세울 때 함께 고정하는 것이 적절하다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `01-VERIFICATION.md` 가 NOT_WIRED 로 기록한 링크 `.github/workflows/ci.yml` → `scripts/run-tests.mjs` 는 이제 배선되었고, `gaps[0].missing[1]`, `gaps[0].missing[2]`, `gaps[1].missing[0]` 이 닫혔다.
- **G-01-1 의 닫는 증거는 여전히 `gaps[0].missing[0]` — 세 leg 이 모두 초록인 새 three-OS run id 다.** 그것은 `01-26` 의 몫이며 이 plan 이 주장하지 않는다. 이 plan 이 주장하는 것은 그 run 이 초록일 수 있는 조건을 만들었다는 것뿐이다.
- `01-25` (EACCES `unprovable-filesystem` 픽스처, `commandProbeEnvironment` POSIX 커버리지) 는 이 plan 과 파일이 겹치지 않으므로 그대로 진행 가능하다.
- 로컬 게이트 상태: `npm run check` 통과, `npm test` `tests 204 / pass 202 / fail 0 / skipped 2`, 배선된 10-파일 호출 `tests 127 / pass 125 / fail 0 / skipped 2`.

## Self-Check: PASSED

- 파일 존재 확인: `scripts/run-tests.mjs`, `.github/workflows/ci.yml`, `test/preview.test.ts` — 전부 FOUND
- 커밋 존재 확인: `3f8685b`, `18b4f02` — 전부 FOUND
- `src/core/install.ts` 에 대한 이 plan 의 커밋: 0건

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-06*
