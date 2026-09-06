---
phase: 01-safe-operation-boundary
plan: 26
subsystem: testing
tags: [ci, github-actions, three-os-matrix, acceptance-gate, broken-windows, process-containment, entrypoint-asymmetry]

requires:
  - phase: 01-24
    provides: "the `Safety boundary suites` CI step routed through scripts/run-tests.mjs with a terminal `--files` argument — the RC-5 repair this run was pushed to test on the platform that produced it"
  - phase: 01-25
    provides: "the three EACCES unprovable-filesystem fixtures and the cross-platform probe-answerability assertion, plus the corrected 208-test baseline"
  - phase: 01-23
    provides: "the three-OS acceptance-gate framing and the prohibition set this plan re-declares verbatim"
provides:
  - "An observed three-OS CI run id (34046336104, head 8c04c5f) with per-leg, per-step evidence read back through the GitHub API"
  - "Confirmation that RC-5 is repaired: `the test runner environment carries no npm lifecycle injection` is seen PASSING inside the windows-latest `Safety boundary suites` step, not merely absent"
  - "A NEW, previously unrecorded defect: an entrypoint asymmetry on ubuntu-latest where `a timed-out command leaves no descendant process behind` passes under `npm test` and fails under the routed `Safety boundary suites` step, on the same leg, same commit, same compiled file"
  - "Broken Windows ledger entry #1 waived on the written record; #2, #3, #4, #5, #6 left open with the observation each is waiting on named"
  - "G-01-1 recorded as STILL OPEN with the awaited evidence named"
affects: [01-VERIFICATION, phase-01-verification, ci-matrix, next-gap-closure-cycle]

actuals:
  tokens: 1072
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Per-leg evidence transcription: every ledger disposition and every closure claim quotes the exact diagnostic line a named leg produced, and an entry with no such line stays open"
    - "State (a)/(b)/(c) determination recorded before any disposition, so `not observed yet` and `observed and negative` never blur into each other"
    - "Differential entrypoint comparison inside one CI job: the same compiled test under two invocations is a first-class signal, not noise"

key-files:
  created: []
  modified:
    - .planning/WINDOWS.md

key-decisions:
  - "G-01-1 is NOT closed. Run 34046336104 returned macos-latest and windows-latest green on all four steps and ubuntu-latest red at `Safety boundary suites`. Two of three is not closure, and the plan's own prohibition makes one run id with three green legs the only closing evidence."
  - "The ubuntu failure is NOT cosmetic. `a timed-out command leaves no descendant process behind` asserts that a descendant is dead after a timeout; `actual: true` means a descendant was actually alive. That is a real SAFE-06 containment fact, not a meta-test."
  - "The failure is recorded as an entrypoint asymmetry rather than diagnosed: the identical compiled test at dist/test/process.test.js:187 passed in the same job's `npm test` step and failed in the routed `Safety boundary suites` step. Structurally the same defect class as RC-5, at a different seam, now with the routed entrypoint as the stricter one."
  - "Ledger entries #2, #3 and #4 were left OPEN even though this run produced lines that would satisfy their conditions, because the plan's acceptance criteria make each an `if and only if state (b)` disposition and this execution is state (c)."
  - "requirements-completed is deliberately `[]` rather than the plan's `[SAFE-01..SAFE-06]` array. Marking those Complete on a run whose acceptance gate did not close is exactly what commit 62a4444 reverted for this phase."
  - "Entries #5 and #6 exist in the ledger but not in the plan, which was authored against a 4-entry ledger. No disposition rule was invented for them; they stay open and the discrepancy is recorded."

patterns-established:
  - "A red leg is recorded verbatim and returned to diagnosis — no suite removed, no test marked not-run, no assertion relaxed, no failing test called cosmetic"
  - "An `if and only if state (b)` disposition rule is honored even when the evidence for the entry happens to exist, because the rule protects against reading a partial run as a whole one"

requirements-completed: []

coverage:
  - id: D1
    description: "The four CI-equivalent steps are green on this Windows developer host, in the workflow's own order, with the fourth command read out of .github/workflows/ci.yml rather than retyped"
    requirement: SAFE-01
    verification:
      - kind: other
        ref: "npm run check && npm test && npm run build:check (exit 0; tests 208 / pass 203 / fail 0 / skipped 5; `build artifact verified: 55 inputs, 104 outputs`)"
        status: pass
      - kind: other
        ref: "node scripts/run-tests.mjs --files <10 suites, read from ci.yml> (exit 0; tests 131 / pass 126 / fail 0 / skipped 5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The routed safety step stays green when npm_config_prefix is injected — the strongest RC-5 evidence obtainable on a host whose npm_config_* is naturally empty"
    requirement: SAFE-06
    verification:
      - kind: other
        ref: "npm_config_prefix=D:/tmp/alpha-aos-rc5-probe INIT_CWD=$PWD node scripts/run-tests.mjs --files <10 suites> (exit 0; tests 131 / pass 126 / fail 0 / skipped 5)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The CI workflow still names all three legs, all four steps and all ten Phase 1 suite files, and reaches them through scripts/run-tests.mjs --files"
    requirement: SAFE-01
    verification:
      - kind: other
        ref: "node -e <ci matrix contract check> → `ci matrix contract intact: 3 legs, 4 steps, 10 suites, routed through the runner`"
        status: pass
    human_judgment: false
  - id: D4
    description: "RC-5 is repaired on the platform that produced it: the runner-environment invariant is seen PASSING inside the windows-latest Safety boundary suites step"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "CI run 34046336104 job 101521935349 log:430 — `✔ the test runner environment carries no npm lifecycle injection (4.0598ms)` inside the routed step"
        status: pass
    human_judgment: false
  - id: D5
    description: "The three-OS acceptance gate for G-01-1"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "CI run 34046336104 — ubuntu-latest FAILURE at step 8 `Safety boundary suites` (fail 1)"
        status: fail
    human_judgment: true
    rationale: "The gate is not met. One run id with three green legs is the only closing evidence; this run has two. The gap stays open and the red leg returns to diagnosis."
  - id: D6
    description: "Broken Windows ledger disposed strictly against observed per-leg evidence, with `observed and negative` distinguished from `not observed yet`"
    verification:
      - kind: other
        ref: "node -e <counter consistency> → `ledger counters consistent: open 5, waived 1, fixed 0, total 6`"
        status: pass
      - kind: other
        ref: "node -e <disposed entries> → `disposed ledger entries: 1=waived`"
        status: pass
    human_judgment: true
    rationale: "Whether leaving #2/#3/#4 open under the plan's `iff state (b)` rule is the right call when this run did produce their evidence lines is a judgment the verifier should confirm. The conservative reading was taken."
  - id: D7
    description: "The two manual-only SAFE-02 canaries recorded as still unresolved and not promoted by a partially green run"
    requirement: SAFE-02
    verification: []
    human_judgment: true
    rationale: "Both require a privileged host (fsutil reparsepoint / elevated shell or Developer Mode). No CI leg can produce the evidence; the record states this rather than upgrading them."

duration: 17 min
completed: 2026-09-06
status: complete
---

# Phase 01 Plan 26: Three-OS Acceptance Gate (G-01-1) Summary

**관측된 새 run `34046336104` 에서 RC-5 는 windows-latest 에서 실제로 통과로 보이며 수리가 확인됐지만, 같은 run 의 ubuntu-latest 가 `Safety boundary suites` 에서 빨갛다 — 같은 leg 의 `npm test` 에서는 초록인 동일 컴파일 테스트가 라우팅된 스텝에서만 실패하는 entrypoint asymmetry 다. G-01-1 은 열린 채로 남는다.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-06T16:46:00Z (approximate — executor spawn)
- **Completed:** 2026-09-06T17:03:42Z
- **Tasks:** 3
- **Files modified:** 1 (`.planning/WINDOWS.md`)

## Accomplishments

- **Task 1 — 로컬 4스텝 게이트 + 주입 재현 모두 초록.** 워크플로에서 읽어 온 명령으로 실행했고, `npm_config_prefix` 주입 상태에서도 `fail 0`.
- **Task 2 — 새 3-OS run 을 GitHub API 로 되읽어 관측.** `34046336104` / head `8c04c5f` / conclusion `failure`. 세 leg 의 스텝별 결론과 진단 줄을 leg 로그에서 그대로 옮겨 적었다.
- **RC-5 는 닫힌 것으로 확인.** windows-latest 의 `Safety boundary suites` 안에서 `the test runner environment carries no npm lifecycle injection` 이 **부재가 아니라 통과(`✔`)로** 보고됐다. `01-24` 의 라우팅 수리가 이 러너 이미지 위에서 실제로 통한다.
- **새 결함 발견 및 기록.** ubuntu-latest 에서 `a timed-out command leaves no descendant process behind` 가 `npm test` 에서는 통과, 라우팅된 스텝에서는 실패. 진단은 다음 사이클로 넘기되 **기록**했다.
- **Task 3 — ledger 를 관측된 증거에만 대고 처분.** `#1` waive, `#2`·`#3`·`#4`·`#5`·`#6` open 유지.

## Task Commits

Tasks 1 and 2 modify no files by design (`<files>` reads "no files modified — this task runs commands and records results"), so they produce no commit. Their output is the evidence transcribed below.

1. **Task 1: 로컬 4스텝 + 주입 재현** — no commit (records numbers only)
2. **Task 2: 3-OS 매트릭스 관측** — no commit (records the run id and per-leg lines)
3. **Task 3: ledger 처분** — `24042d7` (docs)

**Plan metadata:** see the `docs(01-26)` commit that carries this SUMMARY.

## The state this execution ran under

**State (c) — OBSERVED, A LEG RED.**

How it was determined: the orchestrator pushed `main` to `origin/main` before this executor was spawned, and this execution read the resulting run back through the GitHub API with `gh run view 34046336104 --json ...` and `gh run view --job=<id> --log`. A run id therefore exists and was read in this execution, so state (a) does not apply. At least one leg failed, so state (b) does not apply.

Per the plan, state (c) disposes entry `#1` only and leaves every evidence-dependent entry open.

## Task 1 — local gate (this Windows host)

Run in the workflow's own order. Step 4's command was **read out of `.github/workflows/ci.yml`** with a parser, printed, and then executed — not retyped.

| # | Step | Result |
|---|------|--------|
| 1 | `npm run check` | exit 0 (`tsc -p tsconfig.json --noEmit`) |
| 2 | `npm test` | exit 0 — `tests 208 / suites 0 / pass 203 / fail 0 / cancelled 0 / skipped 5 / todo 0`, duration 148.6s |
| 3 | `npm run build:check` | exit 0 — `build artifact verified: 55 inputs, 104 outputs` |
| 4 | `Safety boundary suites` (read from ci.yml) | exit 0 — `tests 131 / pass 126 / fail 0 / skipped 5`, duration 133.0s |
| 4' | same command with `npm_config_prefix=D:/tmp/alpha-aos-rc5-probe INIT_CWD=$PWD` | exit 0 — `tests 131 / pass 126 / fail 0 / skipped 5`, duration 129.8s |

The command as read from the workflow, verbatim:

```
node scripts/run-tests.mjs --files dist/test/preview.test.js dist/test/path-boundary.test.js dist/test/transaction-crash.test.js dist/test/redaction.test.js dist/test/validation.test.js dist/test/process.test.js dist/test/protocol-session.test.js dist/test/mcp-proxy.test.js dist/test/install.test.js dist/test/update.test.js
```

**Baseline arithmetic — the chain adds up.** `01-22-SUMMARY.md` recorded 202. `01-24-SUMMARY.md` records `tests 204` (+2). `01-25-SUMMARY.md` records `tests 208 / pass 203 / fail 0 / skipped 5` and states explicitly that `01-26` must quote **208**, not 204 (+4: three EACCES fixtures plus the probe-answerability assertion). Local observation is 208. No plan's tests went missing.

**Local diagnostics, verbatim:**

```
ℹ path-boundary not-run evidence: [{"fixture":"escape-file-link","reason":"this host cannot create file symlinks without privileges"},{"fixture":"unknown-reparse","reason":"fsutil reparsepoint is unavailable or unprivileged on this host"},{"fixture":"eacces-recheck-root","reason":"this host does not deny traversal by POSIX mode"},{"fixture":"eacces-component","reason":"this host does not deny traversal by POSIX mode"},{"fixture":"eacces-recheck-component","reason":"this host does not deny traversal by POSIX mode"}]
ℹ wrapper families executed: 4; not-run: []
ℹ command probe evidence (win32): [{"name":"npm","found":true,"version":"11.8.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.13.1","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0.windows.3","unsupportedReason":null}]
```

## Task 2 — the observed run

**Run id `34046336104`**
**URL:** https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/34046336104
**head sha:** `8c04c5f883f25f63cf34e69ceff16166425f0ec0` (= `main` HEAD at push time)
**created:** 2026-09-06T16:43:03Z · **status:** completed · **conclusion:** `failure`

This is one run id, read back through the GitHub API in this execution. No leg was individually re-run; no evidence is stitched from another run.

### Per-leg, per-step

| Leg | `npm run check` | `npm test` | `build:check` | `Safety boundary suites` | wrapper syntax | job |
|-----|-----------------|-----------|---------------|--------------------------|----------------|-----|
| **ubuntu-latest** | success | success — `tests 208 / pass 207 / fail 0 / skipped 1` | success | **failure** — `tests 131 / pass 129 / fail 1 / skipped 1` | POSIX step **skipped** (step 8 failed first) | **failure** |
| **macos-latest** | success | success — `tests 208 / pass 207 / fail 0 / skipped 1` | success | success — `tests 131 / pass 130 / fail 0 / skipped 1` | POSIX success | success |
| **windows-latest** | success | success — `tests 208 / pass 204 / fail 0 / skipped 4` | success | success — `tests 131 / pass 127 / fail 0 / skipped 4` | PowerShell success | success |

Job ids: ubuntu `101521935176`, macos `101521935280`, windows `101521935349`.

**Step-total floor holds.** Every leg's `Safety boundary suites` total is **131**, above the previous run's 125. No suite silently stopped running. `npm test` is 208 on every leg, meeting the required floor.

**Note on the ubuntu POSIX wrapper step.** `Validate POSIX wrapper syntax` reported `skipped` on ubuntu-latest — not because it was disabled, but because step 8 failed and GitHub Actions stopped the job. That leg produced **no evidence** for POSIX wrapper syntax in this run. macos-latest ran it green, so the check itself is exercised somewhere; the ubuntu answer for this run is `not observed`, not `pass`.

### RC-5: repaired, and seen repaired

The load-bearing observation this run was pushed for:

```
windows-latest / Node 24  (job 101521935349)
  log:254  ✔ the test runner environment carries no npm lifecycle injection (4.2563ms)   [npm test step]
  log:430  ✔ the test runner environment carries no npm lifecycle injection (4.0598ms)   [Safety boundary suites step]
```

The line is present **and marked as a pass** inside the routed step. In the previous run `33984247757` this exact test failed on windows-latest with `actual: ['npm_config_prefix']`. `01-24`'s routing repair works on the runner image that produced the defect. RC-5 is closed as a matter of observation.

`wrapper families executed: 4; not-run: []` holds on **all three legs, in both steps** (ubuntu log:282/458, macos log:283/459, windows log:264/440).

### The red leg — recorded, not explained away

```
ubuntu-latest / Node 24, step 8 "Safety boundary suites"

test at dist/test/process.test.js:187:1
✖ a timed-out command leaves no descendant process behind (1509.809552ms)
  AssertionError [ERR_ASSERTION]: a timed-out command left a descendant process running

  true !== false

      at TestContext.<anonymous> (file:///home/runner/work/alpha-AOS/alpha-AOS/dist/test/process.test.js:209:12)
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
##[error]Process completed with exit code 1.
```

**This is not a meta-test.** The source (`test/process.test.ts:298-322`) reads the descendant pid out of the child's stdout, calls `process.kill(pid, 0)`, and asserts the descendant is gone. `actual: true` means a descendant process was **actually still alive** after `runProcess` returned from a 1500 ms timeout. That is a SAFE-06 containment fact about the product. The prohibition against calling a failing meta-test cosmetic is not the reason this stays red — it stays red because nothing about it is meta.

**The finding to hand the next cycle: an entrypoint asymmetry on one leg.**

```
ubuntu-latest / Node 24  (job 101521935176)
  log:293  ✔ a timed-out command leaves no descendant process behind (1509.291349ms)   [npm test step]
  log:469  ✖ a timed-out command leaves no descendant process behind (1509.809552ms)   [Safety boundary suites step]
```

Same job, same commit, same compiled file `dist/test/process.test.js`. Green under `npm test`; red under the routed `Safety boundary suites` step. Both entrypoints go through `scripts/run-tests.mjs`; the differences between them are the **file set** (self-enumerated full suite vs. the ten named files) and the **parent process chain** (`npm run` wrapper vs. bare `node`).

That is structurally the same defect class as RC-5 — an invocation-dependent result on identical compiled code — at a different seam, and now in the **opposite direction**: the routed entrypoint is the stricter one. Whether the cause is `scripts/run-tests.mjs` altering the child's process-group or detachment semantics on Linux, load/scheduling under a different concurrency profile, or something else, is a diagnosis this plan does not own.

**Provenance of the failing test.** It predates this round: introduced by `11f6273` (`test(01-02): add shell-free bounded process contract`). `01-25` changed no descendant-related lines in `test/process.test.ts`. In the previous run `33984247757` the ubuntu `Safety boundary suites` step was the **bare `node --test` invocation** and was green at 125/124/fail 0; `01-24` changed that step to the routed one. So the ubuntu red cell appeared together with the routing change — which is exactly why it is being recorded as an entrypoint asymmetry rather than as a new product regression, and exactly why it must not be closed by reverting the routing (that would reinstate RC-5).

**Nothing was done to make it green.** No suite was removed from `.github/workflows/ci.yml`, no test was marked not-run, no assertion was relaxed, and the failing test was not called cosmetic.

### The two inputs Task 3 needed, transcribed per leg

**1. `path-boundary.test.js` not-run diagnostic**

```
ubuntu-latest  (log:270 / 447)
  ℹ path-boundary not-run evidence: [{"fixture":"unknown-reparse","reason":"reparse points are a Windows-only concept"}]

macos-latest   (log:271 / 448)
  ℹ path-boundary not-run evidence: [{"fixture":"unknown-reparse","reason":"reparse points are a Windows-only concept"}]

windows-latest (log:252 / 429)
  ℹ path-boundary not-run evidence: [{"fixture":"unknown-reparse","reason":"fsutil reparsepoint is unavailable or unprivileged on this host"},{"fixture":"eacces-recheck-root","reason":"this host does not deny traversal by POSIX mode"},{"fixture":"eacces-component","reason":"this host does not deny traversal by POSIX mode"},{"fixture":"eacces-recheck-component","reason":"this host does not deny traversal by POSIX mode"}]
```

On both POSIX legs the three `01-25` EACCES fixtures are **absent from the not-run list**, i.e. they actually executed, and each is green:

```
ubuntu-latest  ✔ an unreadable component is unprovable rather than unclassified (8.598485ms)                                    (log:267)
               ✔ an allowed root that became unreadable is refused at the recheck rather than compared unresolved (7.815293ms)  (log:266)
               ✔ losing readability between preflight and apply refuses at the recheck (10.675947ms)                            (log:268)
macos-latest   ✔ an unreadable component is unprovable rather than unclassified (4.766458ms)                                    (log:268)
               ✔ an allowed root that became unreadable is refused at the recheck rather than compared unresolved (5.03175ms)   (log:267)
               ✔ losing readability between preflight and apply refuses at the recheck (4.627542ms)                             (log:269)
```

**2. `process.test.js` per-command diagnostic**

```
ubuntu-latest  ℹ command probe evidence (linux):  [{"name":"npm","found":true,"version":"11.19.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.20.0","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0","unsupportedReason":null}]
macos-latest   ℹ command probe evidence (darwin): [{"name":"npm","found":true,"version":"11.19.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.20.0","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0","unsupportedReason":null}]
windows-latest ℹ command probe evidence (win32):  [{"name":"npm","found":true,"version":"11.17.0","unsupportedReason":null},{"name":"node","found":true,"version":"v24.19.0","unsupportedReason":null},{"name":"git","found":true,"version":"git version 2.55.0.windows.5","unsupportedReason":null}]
```

`a version probe answers under the probe environment on this platform` is `✔` on all three legs (ubuntu log:303/479, macos log:304/480, windows log:285/461). No found command carries both a null `version` and a null `unsupportedReason`.

## Task 3 — Broken Windows ledger disposition

All changes were made through `gsd-tools windows waive`, never by hand, so the markdown table and the JSON block agree.

| id | file | disposition | evidence it rests on |
|----|------|-------------|----------------------|
| **1** | `test/path-boundary.test.ts` | **waived** | Decided on the written record, not on a leg. `01-19` predicted fixture 4 would be the RC-1 reproducer; it was green before the fix because a not-yet-existing allowed root cannot have an existing escaping descendant — a second negative control. Not a defect; a prediction disclosure that `01-VERIFICATION.md` rated as what makes the rest of the `01-19` record trustworthy. The fixture still runs and is green on all three legs of `34046336104` (ubuntu log:265/442, macos log:266/443, windows log:247/424). Waived with that reason rather than silently marked fixed. |
| **2** | `src/core/path-boundary.ts` | **open** | *Waiting on:* a state-(b) run. This run's POSIX legs DID execute the three EACCES fixtures green (quoted above), which is the evidence the entry needs — but the plan's acceptance criterion is `if and only if the state is (b)`, and this is state (c). Recorded here so the next cycle can close it on this line the moment three legs are green. |
| **3** | `test/process.test.ts` | **open** | *Waiting on:* a state-(b) run with a green macos-latest leg. macos-latest WAS green in this run (`Safety boundary suites` fail 0, and `the declared platform floor must match what the OS actually delivers` passed), which is the evidence `01-VERIFICATION.md` named. Same `iff state (b)` rule applies. |
| **4** | `src/core/process.ts` | **open** | *Waiting on:* a state-(b) run. All three legs report the probe assertion green with no found command carrying both a null version and a null reason (quoted above) — the entry's condition is met on evidence, but not on state. |
| **5** | `scripts/run-tests.mjs` | **open** | *Waiting on:* a permanent suite test for the `--files` loud-failure paths. Not addressed by this plan; no disposition rule exists for it. |
| **6** | `src/core/path-boundary.ts` | **open** | *Waiting on:* nothing this run could produce — `provePathBoundary:296-299` is reachable only through a TOCTOU race. Not addressed by this plan. |

Counters after the change: **open 5, waived 1, fixed 0, total 6** — consistent.

**Why #2, #3 and #4 were not marked fixed even though the evidence exists.** The plan's acceptance criteria are written as biconditionals: *"Entry #3 is marked fixed **if and only if** the state is (b) and this run's macos-latest leg is green."* State (b) is defined as "observed, all three legs green." This run is state (c). Closing them anyway would be closing Broken Windows on the strength of a run that did not go green — which is the reasoning pattern this phase's prohibitions exist to prevent, even when the specific lines happen to look convincing. The evidence is transcribed above so the next cycle closes them in one step rather than re-running the observation.

## What this run could NOT decide

Recorded as plainly as what it did decide. Neither is added to the ledger as a new entry — `01-VERIFICATION.md` and `01-UAT.md` already own them, and duplicating would let the two records diverge.

1. **Windows unknown-reparse canary (SAFE-02) — still unresolved.** `01-VALIDATION.md` designates it this phase's only manual-only verification; `01-UAT.md` item 2 is `result: skipped`. In this run: windows-latest reported `unknown-reparse fixture not run: privileged reparse facilities unavailable`, and both POSIX legs correctly reported it as a Windows-only concept. **No CI leg can produce this evidence.** A green run does not promote it.
2. **file-symlink escape canary (SAFE-02) — still unresolved.** `01-UAT.md` item 3 was accepted `pass` by a human, but what was accepted is the privilege gate, not an observation. This host reported `escape-file-link fixture not run: this host cannot create file symlinks without privileges`. It becomes a real observation only when re-run in an elevated shell or under Developer Mode.

**`01-UAT.md` item 4 — no action.** The five judgment-tier prohibitions were already approved by the human with source grounding, and none of the files they cover appear in this round's `files_modified` (which is `.planning/WINDOWS.md` alone). Carried as resolved.

## Decisions Made

- **G-01-1 stays OPEN.** Closing evidence is one run id with three green legs; `34046336104` has two. Two of three is not closure and the green local gate on this Windows host is not a substitute — the rule exists because a local green once passed a real SAFE-01 violation that wrote into a POSIX user's home.
- **The ubuntu failure returns to diagnosis, not to repair-in-place.** It is not this plan's `files_modified` and the plan explicitly hands a red leg to the next cycle.
- **The failure is characterised as an entrypoint asymmetry, on evidence** (`npm test` green / routed step red, same job) rather than asserted as a product regression or as flakiness. Both remain open readings; the two invocations' observable difference is recorded so the next plan can start from the seam rather than from the symptom.
- **`requirements-completed: []`.** The plan's frontmatter carries `[SAFE-01..SAFE-06]`, but those are the requirements this plan *observes*, not ones it completes. Marking them Complete on a run whose acceptance gate did not close is precisely what commit `62a4444` ("revert premature Complete requirements after gaps found") undid for this phase. `requirements.mark-complete` was therefore not run.

## Deviations from Plan

### Recorded deviations

**1. [Rule 2 - Record accuracy] The ledger has six entries, not the four the plan describes**

- **Found during:** Task 3
- **Issue:** `01-26-PLAN.md` states `.planning/WINDOWS.md` 는 "open 4, waived 0" and gives disposition rules for entries #1-#4 only. At execution the ledger held **6 open entries** — `#5` (`scripts/run-tests.mjs`, recorded by `01-24` at 2026-09-06T11:29Z) and `#6` (`src/core/path-boundary.ts`, recorded by `01-25` at 2026-09-06T11:48Z) were added after this plan was authored.
- **Fix:** No disposition rule was invented for them. Both left `open`, and each is listed in the disposition table above with what it is waiting on. The discrepancy is recorded rather than silently absorbed, because a plan that thinks the ledger has four entries and a ledger that has six would otherwise diverge unnoticed.
- **Files modified:** `.planning/WINDOWS.md` (no change to #5/#6; they are named in this SUMMARY)
- **Verification:** `ledger counters consistent: open 5, waived 1, fixed 0, total 6`
- **Committed in:** `24042d7`

**2. [Rule 2 - Missing critical / transparency] `requirements-completed` deliberately left empty**

- **Found during:** SUMMARY creation
- **Issue:** The summary template requires copying the plan's `requirements` array verbatim, which would mark SAFE-01 through SAFE-06 Complete in `REQUIREMENTS.md`. This plan's acceptance gate did not close.
- **Fix:** `requirements-completed: []`, and `gsd-tools requirements mark-complete` was not run. Rationale recorded in `key-decisions` and in "Decisions Made".
- **Files modified:** none (a non-action)
- **Verification:** `REQUIREMENTS.md` untouched by this plan
- **Committed in:** n/a

### State note (not a deviation)

The plan expects state **(a)** ("not yet observed") as the ordinary autonomous path, because Task 2's observation is a `<human-check>` normally harvested at end of phase. This execution ran in state **(c)**: the orchestrator performed the push before spawning the executor, and this execution read the run back through the GitHub API. The plan explicitly provides for state (c) and its rules were followed; this is the plan working as designed, not a departure from it.

---

**Total deviations:** 2 recorded (2 transparency/record-accuracy; 0 code auto-fixes)
**Impact on plan:** No scope creep. This plan modified exactly the one file its `files_modified` names. No source file, test file or workflow file was touched.

## Issues Encountered

- **The acceptance gate did not close.** `ubuntu-latest` is red at `Safety boundary suites` on `a timed-out command leaves no descendant process behind`. Not resolved here by design — the plan forbids repairing a red leg in this round and requires it to return to diagnosis with the failure text, leg name and run id recorded. All three are above.
- **The ubuntu leg's `Validate POSIX wrapper syntax` step never ran** (job stopped at the failed step 8), so that leg contributed no wrapper-syntax evidence in this run. macos-latest ran it green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Phase 1 verification remains BLOCKED.** `01-VALIDATION.md` requires a fully green three-OS suite before `/gsd-verify-work`, and G-01-1 is open.

**What the next gap-closure cycle inherits — a much narrower problem than the last one:**

1. **One red cell, on one leg, with a precise seam.** `dist/test/process.test.js:187` (`test/process.test.ts:298`) on ubuntu-latest, green under `npm test` and red under the routed `Safety boundary suites` step in the same job. The diagnosis question is what differs between those two invocations for a Linux child process tree — the file set, the concurrency profile, or the `npm run` parent chain. Do **not** answer it by reverting `01-24`'s routing: that reinstates RC-5 on windows-latest.
2. **RC-1 through RC-5 are all observably closed.** The windows leg that was red last round is green across all four steps, with the invariant test seen passing rather than absent.
3. **Three ledger entries are one green run away from closing.** `#2`, `#3` and `#4` each have their evidence line transcribed in this SUMMARY. When a run reaches state (b), they close on those lines without re-observation.
4. **Two SAFE-02 canaries need a privileged host, not a CI leg.** Neither will ever be answered by the matrix.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-06*

## Self-Check: PASSED

- `.planning/phases/01-safe-operation-boundary/01-26-SUMMARY.md` exists on disk
- `.planning/WINDOWS.md` exists on disk and its counters are consistent (`open 5, waived 1, fixed 0, total 6`)
- Commit `24042d7` (ledger disposition) present in git log
- Commit `ef05007` (this SUMMARY) present in git log
