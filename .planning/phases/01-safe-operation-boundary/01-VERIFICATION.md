---
phase: 01-safe-operation-boundary
verified: 2026-09-06T00:00:00Z
status: gaps_found
score: 5/8 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "RC-1 (asymmetric canonicalization) — `canonicalizeWithMissingTail` now produces BOTH operands of every containment comparison in `src/core/path-boundary.ts`; four link-building regression fixtures pass on this host without privilege; the windows-latest `npm test` step went 46 fail -> 0 fail in run 33984247757"
    - "RC-2 (missing darwin environment floor) — `platformFloorEnvironment('darwin')` returns exactly `['__CF_USER_TEXT_ENCODING']`; the macos-latest runtime exact-match assertion passed in run 33984247757, closing the 50 macOS failures and simultaneously resolving 01-20 D4"
    - "RC-3 (install preview wrote into the user's home) — the plan builder now uses the spawn-free `readGlobalPackageVersion`; the surviving apply-time npm probe pins `npm_config_cache` outside the home with `npm_config_logs_max=0`; `every mutating CLI preview leaves all five mutation surfaces byte-identical` passed on all three legs, with `wrapper families executed: 4; not-run: []` on all three"
    - "RC-4 (single unsynchronised pid probe as the termination oracle) — replaced by an identity-bearing atomically published heartbeat, a strict full-line parser and the pure `classifyProcessSample` classifier polled to the product-declared `CLOSE_TREE_DEADLINE_MS`; all four probe sites converted; ubuntu-latest `Safety boundary suites` went 4 fail -> 0 fail"
    - "Previously deferred: 'the macOS and Linux CI legs are observed rather than asserted' — now genuinely observed and green in run 33984247757"
  gaps_remaining:
    - "G-01-1 — the three-OS acceptance gate. windows-latest is red on a new root cause (RC-5)."
  regressions: []
gaps:
  - truth: "Gap G-01-1 is closed only by an observed green three-OS CI matrix run; the windows-latest leg passes `npm run check`, `npm test`, `npm run build:check` and the named ten-file `Safety boundary suites` step (01-23 must_haves.truths 1 and 3)"
    status: failed
    reason: "Independently verified via `gh run view 33984247757`: conclusion=failure. ubuntu-latest success, macos-latest success, windows-latest FAILURE at the `Safety boundary suites` step (125 tests / 123 pass / 1 fail / 1 skipped). Two of three green is not the stated closing evidence, and 01-23's own prohibition forbids recording the gap closed on anything less. Local green on this Windows developer host (npm test 202/200/0 fail/2 skipped, verified by this verifier) does not substitute."
    artifacts:
      - path: ".github/workflows/ci.yml"
        issue: "The `Safety boundary suites` step invokes bare `node --test dist/test/*.js`, bypassing `scripts/run-tests.mjs`. The file is byte-identical across the whole gap-closure round (`git log bcf2de4..HEAD -- .github/workflows/ci.yml` is empty), so the invariant 01-21 established for `package.json` was never applied to the second entrypoint."
      - path: "scripts/run-tests.mjs"
        issue: "Scrubs `npm_config_*` correctly, but enumerates all of `dist/test/*.test.js` itself and treats `process.argv.slice(2)` as flags only. It cannot express the ten-file subset the CI step needs, so the CI step cannot simply be routed through it today."
    missing:
      - "A new three-OS CI run id in which all three legs are green. That run id is the closing evidence for G-01-1; nothing else is."
      - "RC-5 repair: make the CI `Safety boundary suites` step and `npm test` observe the same environment. Either teach `scripts/run-tests.mjs` to accept an explicit file subset and route the CI step through it, or scrub at another shared seam — without removing a suite from ci.yml, marking a test not-run, or relaxing the assertion (01-23 prohibition 2)."
      - "Any repair must keep `npm_config_prefix` a legitimate INPUT to `resolveGlobalNodeModulesRoot` (src/core/install.ts:294); blanket-deleting the name from the product would trade one defect for another."
  - truth: "`npm test` and the bare `node --test` CI step hand the test process the same environment, because the runner scrubs npm's lifecycle injection before spawning it. The primary gate can no longer be greener than the CI step that runs the same files. (01-21 must_haves.truths 6)"
    status: failed
    reason: "Observationally falsified on windows-latest in run 33984247757. Within the SAME job: the `npm test` step reported `fail 0`, and the `Safety boundary suites` step reported `fail 1` on `the test runner environment carries no npm lifecycle injection` with `actual: ['npm_config_prefix']`. The primary gate is demonstrably greener than the CI step running the same compiled files — which is the precise condition this truth asserts is now impossible. The windows runner image sets `npm_config_prefix` at machine scope, so the value is not npm lifecycle injection the runner can strip on the bare-node path it never spawns."
    artifacts:
      - path: "test/preview.test.ts"
        issue: "Line 280 `the test runner environment carries no npm lifecycle injection` is the invariant's own oracle. It is correct and it is red on windows CI — the test is right and the invariant is not yet delivered. Do not weaken it."
    missing:
      - "Close the entrypoint asymmetry at its source (see gap 1 `missing`). This is one root cause with two must-have consequences, not two independent defects."
deferred: []
behavior_unverified_items:
  - truth: "SC2 — a write or removal that could escape an allowed root through an unclassified REPARSE POINT is refused with a stable code, and the outside sentinel remains untouched"
    test: "On a Windows host with the privileges `fsutil reparsepoint` requires, create a directory carrying an unclassified reparse tag inside an allowed root, then run an alpha-AOS dry-run and an apply against a path beneath it."
    expected: "A stable unsupported/refusal code, no mutation, outside sentinel hash unchanged, and the dry-run/inspection paths still useful (D-01)."
    why_human: "Re-confirmed this session by running `node --test dist/test/path-boundary.test.js`: `an unclassified reparse point yields a stable unsupported refusal` reports `# unknown-reparse fixture not run: privileged reparse facilities unavailable`. On the POSIX legs it correctly reports `reparse points are a Windows-only concept`, so no CI leg can produce this evidence either. 01-VALIDATION.md designates this the phase's single manual-only verification. 01-UAT.md item 2 remains `result: skipped` — the human explicitly did not resolve it. The other four SC2 vectors are green."
  - truth: "SC2 / 01-19 truth 3 — not existing and not being readable are different facts: a non-ENOENT errno during canonicalization produces an `unprovable-filesystem` refusal with a stated reason rather than substituting the unresolved string"
    test: "Create a component (or an allowed root ancestor) that exists but returns EACCES/EPERM from realpath, then call `provePathBoundary` and `recheckPathProof` against a path beneath it."
    expected: "`proven: false`, `code: 'unprovable-filesystem'`, a stated reason naming the errno, and no comparison performed against a non-canonical root."
    why_human: "Verified structurally only. `src/core/path-boundary.ts:142-146` and `:202-206` discriminate the errno and both callers check `.reason` before comparing (`:290-298`, `:352-367`), but grep for `unprovable-filesystem` in `test/path-boundary.test.ts` returns zero hits — the existing test named `an unprovable filesystem is reported as unsupported rather than allowed` exercises the empty-allowedRoots path, not this branch. Recorded honestly by the executor as 01-19 D4 and open as Broken Window #2. Needs a privileged EACCES fixture."
coincidental_reliance_items: []
---

# Phase 01: Safe Operation Boundary Verification Report

**Phase Goal:** Users can trust alpha-AOS to preview changes, reject unsafe or ambiguous operations, preserve recoverable state, and keep secrets out of every observable surface.
**Verified:** 2026-09-06
**Status:** gaps_found
**Re-verification:** Yes — third pass. Supersedes the `human_needed` report of 2026-09-05T11:05:00Z, which was itself superseded on its central claim by UAT run 33937610401.

## Executive Note

**The four root causes are genuinely fixed. The phase's own acceptance gate is still red, and that is decisive.**

This round did real work, and the record of it is unusually honest. The previous verification passed SC1 on this host while the code was in fact writing `~/.npm/_logs/<ts>-debug-0.log` into a POSIX user's home during a preview — a genuine SAFE-01 violation that only a real CI leg could see. That is the strongest available argument against ever upgrading local green into a pass, and it is why this report does not do so now.

RC-1 through RC-4 are closed against the codebase and against CI legs I re-read myself:

- The windows-latest `npm test` step went **46 fail -> 0 fail**. That is the only proof that the RC-1 fix covers the 8.3 short-name shape this developer host cannot produce.
- The macos-latest leg went **50 fail -> 0 fail**, and its runtime exact-match assertion passing is what confirms the darwin floor is exactly `__CF_USER_TEXT_ENCODING` — resolving 01-20's own D4 flag rather than leaving it asserted.
- The ubuntu-latest `Safety boundary suites` step went **4 fail -> 0 fail**, with `wrapper families executed: 4; not-run: []` on all three legs.

What blocks the phase is one leg and one test. Run `33984247757` (head `403e017`) is **`conclusion: failure`** — windows-latest fails `Safety boundary suites` on `the test runner environment carries no npm lifecycle injection`, `actual: ['npm_config_prefix']`. G-01-1's stated closing evidence is three green legs. It does not exist.

This is not bookkeeping pedantry. RC-5 is the **same class of defect as RC-3**: two entrypoints that were supposed to share one environment do not, and the greener one is the one that runs first. 01-21 built the invariant, wrote its oracle, and applied it to `package.json` — and never applied it to `.github/workflows/ci.yml`, which is byte-identical across the entire round (`git log bcf2de4..HEAD -- .github/workflows/ci.yml` is empty; I ran it). So 01-21's own must-have truth 6 is falsified by direct observation, independently of the 01-23 gate.

**The executors did not overclaim.** `01-23-SUMMARY.md` states in its own frontmatter that "Gap G-01-1 is NOT closed", records RC-5 as new information, and explains why it refused to fix a red leg inline (its plan declares `files_modified: []` and its prohibition treats a red leg as new information about the product). `STATE.md:33` reads `Blocked — G-01-1 open`. This verdict agrees with the executors rather than correcting them.

## Goal Achievement

### Observable Truths

Merged from ROADMAP Success Criteria (1-5, the roadmap contract) and the G-01-1 gap-closure must-haves (6-8, the phase's own acceptance gate).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC1** — every mutating command previews with checkouts, packages, native config, managed state and harness resources byte-for-byte unchanged | ✓ VERIFIED | Behaviorally proven on all three OS legs of run 33984247757, which is what the previous report could not do. `every mutating CLI preview leaves all five mutation surfaces byte-identical` ✔ on ubuntu, macos and windows; `two concurrent previews neither collide nor create shared state` ✔; `wrapper families executed: 4; not-run: []` on **all three** legs; `a wrapper refuses without a verified build artifact and delegates with one` ✔ everywhere. Source: the RC-3 hole is gone — `src/core/install.ts:379` reads the filesystem instead of asking npm, the surviving probe at `:257` is apply-path-only and pins `npm_config_cache` + `npm_config_logs_max: "0"` (`:230-246`). Local: `npm test` 202/200 pass/**0 fail**/2 skipped, run by this verifier. |
| 2 | **SC2** — a write or removal that could escape an allowed root through a symlink, junction, reparse point, alias or parent-path change is refused, outside sentinel untouched | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Strengthened, not weakened, by RC-1.** New behavioral evidence I ran myself: `an allowed root that does not exist yet under a link is still provable` ✔, `an allowed root reached through a link is canonicalized on both sides` ✔, `a target that escapes a linked allowed root is still refused` ✔, `a canonical-root refusal names the canonically resolved root` ✔ — real junction fixtures, not skipped, on this host. Escape refusals all still green. Two vectors remain not-run: the unknown-reparse canary (privilege-gated; POSIX legs correctly report it Windows-only, so no CI leg can supply it either) and the non-ENOENT `unprovable-filesystem` branch (compiler-checked only). Routed to human; not counted as verified. |
| 3 | **SC3** — concurrent/interrupted managed writes serialize safely, leave hash-checked journal evidence, and report the real operation state | ✓ VERIFIED | Untouched by this round; regression-clean. Green in the local full run and inside the 125-test `Safety boundary suites` step on all three legs (`transaction-crash.test.js` is named in ci.yml:41). |
| 4 | **SC4** — output/plans/journals/snapshots/subprocess failures/CI evidence redact credentials; launched commands use no shell, bounded capture, timeouts, approved env names only | ✓ VERIFIED | Two real improvements this round. **Env-name completeness** is now true on macOS, not just claimed: `platformFloorEnvironment` (`src/core/process.ts:95-116`) is a pure function with an explicit darwin branch, and the macos-latest leg passed `the declared platform floor must match what the OS actually delivers` — an **exact** `deepEqual`, so the floor is neither under- nor over-declared. **Bounded termination** is now soundly verified: `killTree` returns a `KillDelivery` (`:282-303`) carried into `ProcessResult.treeTermination` (`:72`), and the ubuntu leg's descendant-tree assertion is green under the real ten-file concurrent load. |
| 5 | **SC5** — malformed, ambiguous, unsupported or schema-invalid documents are rejected before mutation | ✓ VERIFIED | Untouched; regression-clean locally and in all three legs' `validation.test.js`. |
| 6 | **G-01-1** — the four diagnosed root causes are observably closed on the platforms that exposed them | ✓ VERIFIED | Per-leg deltas from run 33937610401 to run 33984247757, read from the run logs: windows `npm test` 46 fail -> **0** (RC-1's 8.3 short-name shape); macos `npm test` 50 fail -> **0** (RC-1 + RC-2); ubuntu `Safety boundary suites` 4 fail -> **0** (RC-3 + RC-4). All three legs now 202 tests / 201 pass / 0 fail / 1 skipped at `npm test`. |
| 7 | **G-01-1 / 01-21 T6** — `npm test` and the bare `node --test` CI step hand the test process the same environment; the primary gate can no longer be greener than the CI step running the same files | ✗ **FAILED** | Falsified inside one windows-latest job: `npm test` -> `fail 0`; `Safety boundary suites` -> `fail 1`, `the test runner environment carries no npm lifecycle injection`, `actual: ['npm_config_prefix']`. The primary gate IS greener. `scripts/run-tests.mjs` scrubs correctly, but ci.yml never routes through it and is byte-identical across the round. This is RC-3's failure mode recurring at a different seam. |
| 8 | **G-01-1 / 01-23 T1+T3** — the gap closes only on an observed green three-OS run; the windows-latest leg passes all four steps | ✗ **FAILED** | `gh run view 33984247757` (run by this verifier): `conclusion: failure`. macos success, ubuntu success, **windows-latest failure** at `Safety boundary suites`. No newer run exists (`gh run list` newest is 33984247757). |

**Score:** 5/8 truths verified (1 present, behavior-unverified; 2 failed)

### Deferred Items

None. The previous report's deferred item *"the macOS and Linux CI legs are observed rather than asserted"* is **resolved** — both legs ran and are green. The other prior deferral (an end-to-end managed install test under one session) belongs to Phase 7 SC1 and is unchanged, but it is not among this phase's must-haves and is not re-listed as a Phase 1 deferral.

**Explicitly NOT deferred:** the windows-latest red leg. Phase 7 SC1 covers *release-artifact* three-OS fixtures (install/reconcile/diagnose/uninstall from packed bytes), not Phase 1's own CI safety-suite invariant. Deferring RC-5 to Phase 7 would be exactly the "explained away" outcome 01-23's prohibition 2 forbids.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/path-boundary.ts` | symmetric canonical resolution + explicit refusal when resolution fails | ✓ VERIFIED | `canonicalizeWithMissingTail` (:133) is the single canonical form; called for the target at :290 and the allowed root at :296, and again in `recheckPathProof` at :352/:367 — every containment operand. Non-ENOENT errno returns a stated reason (:141-147) that becomes `unprovable-filesystem` at the call sites. All six declared exports present. |
| `test/path-boundary.test.ts` | link-building regression fixtures + escape-refusal negative control | ✓ VERIFIED | Four new fixtures build their own junction so the defect reproduces on an ordinary host. All four pass here (not skipped). |
| `src/core/process.ts` | per-platform floor as a pure function; `CLOSE_TREE_DEADLINE_MS`; `killTree` reports its delivery path | ✓ VERIFIED | `platformFloorEnvironment` (:95) with `case "darwin": return ["__CF_USER_TEXT_ENCODING"]` (:112); `PLATFORM_FLOOR_ENVIRONMENT = platformFloorEnvironment(process.platform)` (:118); `CLOSE_TREE_DEADLINE_MS = 5_000` (:151); `KillDelivery` union (:280) threaded into `ProcessResult.treeTermination` at all six kill sites; `close()` contract documented at :690-699. |
| `test/process.test.ts` | host-independent assertions for every floor branch alongside the runtime exact match | ✓ VERIFIED | :169-208 asserts darwin, win32 and linux branches literally, plus that the exported constant IS the function applied to `process.platform`. The runtime `deepEqual` at :165 is retained, not relaxed. |
| `scripts/run-tests.mjs` | strips npm lifecycle injection; fails loudly on an empty test set | ⚠️ ORPHANED at the CI seam | The file is correct and substantive: `INJECTED_PREFIX = /^npm_(config\|package\|lifecycle)_/iu` plus three exact names, `shell: false`, exit-code propagation, and an explicit empty-set failure that the old `dist/test/*.test.js` glob could not give. **But its only consumer is `package.json:32`.** ci.yml's `Safety boundary suites` step never reaches it, which is exactly gap 2. It also cannot express a file subset today (argv is treated as flags; the file list is self-enumerated), so the wiring fix is a design decision, not a one-line change. |
| `package.json` | `test` routed through the scrubbing runner | ✓ VERIFIED | `"test": "npm run build && node scripts/run-tests.mjs"` |
| `test/preview.test.ts` | sandbox from an explicit allowlist, home-derived names redirected, runner-environment invariant | ✓ VERIFIED (oracle correct; invariant it guards is unmet) | `SANDBOX_ENVIRONMENT_PASSTHROUGH` (:122) replaces the `...process.env` spread; `LOCALAPPDATA`/`APPDATA`/`XDG_*` redirected into the observed home (:177-184); a self-soundness assertion (:193-199) proves `npm_config_prefix` is the only npm setting the sandbox supplies. The invariant test at :280 is well-written and is the thing that caught RC-5. |
| `src/core/install.ts` | spawn-free global-root resolution, pinned apply-time probe env, explicit unverified state | ✓ VERIFIED | All six declared exports present. `readGlobalPackageVersion` returns `state: "unverified"` on three distinct unreadable conditions (:318, :324, :328) and the plan builder turns unverified into *plan the install*, never `current` (:392-393). The spawning probe is named `probeGlobalNpmPackageVersion` and documented "nothing that runs before an apply is authorized may call it" (:249-253). |
| `test/install.test.ts` | region-scoped control that the plan builder does not reach the spawning probe | ✓ VERIFIED | :401 asserts the builder region contains no `probeGlobalNpmPackageVersion`, :406 asserts it does contain `readGlobalPackageVersion` (positive control, so a broken slice fails rather than passing vacuously). :354 asserts the probe's cache location cannot be decided by the caller. |
| `test/protocol-session.test.ts` | atomic identity-bearing heartbeats, strict parser, pure classifier, bounded oracle at all four sites | ✓ VERIFIED | `classifyProcessSample` (:402) returns `terminated` only on positive terminal evidence — `foreign-nonce`, `esrch`, `eperm`, `proc-absent`, `Z`/`X`, changed start time — and a stall or an unreadable heartbeat falls through to `indeterminate` (:416-417), which is a red, not a green. `statFieldsFromThree` anchors on the LAST `)` so an awkward comm name cannot misclassify. Heartbeats published by `renameSync` with bounded retry. All four former bare-probe sites now call `waitForTermination(probe, CLOSE_TREE_DEADLINE_MS)` (:641, :701, :738, :850). |
| `.github/workflows/ci.yml` | three-OS matrix naming the ten Phase 1 suites | ⚠️ PRESENT but is the locus of RC-5 | Ten suites named at :39-49; `fail-fast: false`; three-OS matrix. **Byte-identical across the whole gap-closure round** — confirmed, which is also the positive evidence that 01-23's prohibition 2 (do not close a red leg by editing the CI file) was honored. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `test/path-boundary.test.ts` | `src/core/path-boundary.ts` | regression fixtures call `provePathBoundary` with a linked, not-yet-existing root | ✓ WIRED | Four fixtures, all executing (not skipped) on this host |
| `src/core/path-boundary.ts` | itself | both containment operands come from `canonicalizeWithMissingTail` | ✓ WIRED | :290/:296 and :352/:367; only two other `realpath` calls exist and neither is a comparison operand |
| `test/process.test.ts` | `src/core/process.ts` | `platformFloorEnvironment` called with explicit platform names | ✓ WIRED | :169-208 |
| `src/core/process.ts` | itself | `platformFloorEnvironment(process.platform)` | ✓ WIRED | :118 |
| `package.json` | `scripts/run-tests.mjs` | `test` script routes through the scrubbing runner | ✓ WIRED | :32 |
| **`.github/workflows/ci.yml`** | **`scripts/run-tests.mjs`** | **the CI safety step should share the runner's environment** | ✗ **NOT_WIRED** | **The step runs bare `node --test`. This missing link IS RC-5.** |
| `test/install.test.ts` | `src/core/install.ts` | region control + materialized-environment assertion | ✓ WIRED | :401, :406, :354 |
| `test/preview.test.ts` | `src/core/install.ts` | byte-identical contract exercises the managed-install builder through the CLI | ✓ WIRED | 17 `install` references; both plan-builder callers enumerated by `the byte-identical entry points include both plan-builder callers` ✔ |
| `test/protocol-session.test.ts` | `src/core/process.ts` | test polls to the deadline the product declares | ✓ WIRED | `CLOSE_TREE_DEADLINE_MS` imported at :21, used at all four sites |
| `test/protocol-session.test.ts` | itself | `classifyProcessSample` as a pure function over one observation | ✓ WIRED | :402; branch tests from literal input at :963-1049 |
| `src/core/process.ts` | itself | `killTree` delivery path carried into `ProcessResult` | ✓ WIRED | :72, :362, :525; asserted in test at :653, :868 |
| `.github/workflows/ci.yml` | `test/preview.test.ts` | per-OS step names the ten suites | ✓ WIRED | :39-49 |

All 16 key links from the prior report re-checked; none regressed. One new link is missing.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `path-boundary.ts` `PathProof.canonical` | `canonical` | `realpath` of the deepest existing ancestor + the missing tail, for BOTH operands | Yes — a real junction fixture resolves through the link and the escape case still refuses | ✓ FLOWING |
| `path-boundary.ts` refusal `detail` | `reason` | the errno the host actually returned, or "no ancestor exists" | Yes for ENOENT/no-ancestor; **the non-ENOENT branch is never exercised** | ⚠️ STATIC (one branch) |
| `process.ts` `PLATFORM_FLOOR_ENVIRONMENT` | floor names | `platformFloorEnvironment(process.platform)` | Yes — macos-latest exact-matched the declaration against what CoreFoundation actually delivered | ✓ FLOWING |
| `process.ts` `ProcessResult.treeTermination` | `treeDelivery` | the branch `killTree` actually took | Yes — asserted as a real group delivery, not a fallback | ✓ FLOWING |
| `install.ts` runtime state | `runtime.state` | filesystem read of `<globalRoot>/<pkg>/package.json`, no child | Yes — three distinct `unverified` paths, and unverified plans the install | ✓ FLOWING |
| `protocol-session.test.ts` liveness verdict | `LivenessVerdict` | a real `/proc` stat / signal probe / atomically renamed heartbeat | Yes — the ubuntu leg's descendant assertion is green under real concurrent load | ✓ FLOWING |

### Behavioral Spot-Checks

Every command below was run by this verifier in its own process, or read from the CI run's own logs via `gh`. Nothing is quoted from a SUMMARY.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite, this host | `npm test` | tests 202 / pass 200 / **fail 0** / skipped 2 | ✓ PASS |
| RC-1 regression, real junction | `node --test dist/test/path-boundary.test.js` | `an allowed root that does not exist yet under a link is still provable` ✔, `...canonicalized on both sides` ✔, `a target that escapes a linked allowed root is still refused` ✔ — executing, not skipped | ✓ PASS |
| SC2 escape refusals | (above) | `a link that escapes the allowed root is refused and the outside sentinel is untouched` ✔ | ✓ PASS |
| SC2 privilege-gated canaries | (above) | 2 skipped: `escape-file-link fixture not run: file symlinks unavailable`; `unknown-reparse fixture not run: privileged reparse facilities unavailable` | ? SKIP -> human |
| No npm injection on this host | `node -e "…Object.keys(process.env).filter(/^npm_config_/)"` | `[]` — which is precisely why RC-5 cannot reproduce here | ℹ INFO |
| Acceptance run identity | `gh run view 33984247757 --json conclusion,headSha,jobs` | `conclusion: failure`, head `403e017`; macos success, ubuntu success, **windows failure** | ✗ **FAIL** |
| Windows leg failing step | `gh run view 33984247757 --json jobs` | only `Safety boundary suites` failed; `npm run check`, `npm test`, `build:check` all success | ✗ **FAIL** |
| Windows leg failure detail | `gh run view 33984247757 --log-failed` | `✖ the test runner environment carries no npm lifecycle injection` — `actual: [ 'npm_config_prefix' ]`; step totals 125/123 pass/**1 fail**/1 skipped | ✗ **FAIL** |
| Same-job asymmetry (RC-5 proof) | (same log) | `npm test` step: `✔ the test runner environment carries no npm lifecycle injection` + `ℹ fail 0`. Bare-node step: `✖` same test. Same commit, same files, opposite verdicts. | ✗ **FAIL** |
| POSIX leg health | (same log) | ubuntu + macos: `npm test` 202/201/**0 fail**/1 skipped; `Safety boundary suites` 125/124/**0 fail**/1 skipped | ✓ PASS |
| Wrapper coverage, all legs | (same log) | `wrapper families executed: 4; not-run: []` on ubuntu, macos AND windows | ✓ PASS |
| Preview byte-identity, all legs | (same log) | `every mutating CLI preview leaves all five mutation surfaces byte-identical` ✔ on all three | ✓ PASS |
| ci.yml untouched this round | `git log bcf2de4..HEAD -- .github/workflows/ci.yml` | empty | ✓ PASS (prohibition honored) |
| Newer run exists? | `gh run list --limit 8` | newest is 33984247757; nothing after it | ✗ **FAIL** |

### Probe Execution

N/A — this project declares no `scripts/*/tests/probe-*.sh`. Its runnable verification is the Node suite plus the three-OS CI matrix, both exercised above.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| **SAFE-01** | 01-01, 01-13, 01-14, 01-15, 01-16, **01-21**, **01-23** | ✗ **BLOCKED** | The *behavior* is now genuinely satisfied — the RC-3 home write is gone and byte-identity is proven on all three OS legs, which is more than any prior report could show. But SAFE-01 is the requirement 01-21's runner invariant and 01-23's acceptance gate both carry, and both are failed truths (7, 8). The requirement is substantively met and procedurally unclosed. |
| **SAFE-02** | 01-02, 01-07, 01-09, 01-12, 01-13, 01-14, 01-15, 01-16, **01-19**, **01-23** | ? NEEDS HUMAN | RC-1 fixed a real over-refusal without weakening containment; escape refusal re-proven. Two vectors not-run: the unknown-reparse canary (manual-only per 01-VALIDATION.md, UAT item 2 unresolved) and the non-ENOENT `unprovable-filesystem` branch. |
| **SAFE-03** | 01-02, 01-09, 01-12, 01-13, 01-14, 01-15, 01-16 | ✓ SATISFIED | SC3 green locally and on all three legs. |
| **SAFE-04** | 01-01, 01-03, 01-08…01-18 | ✓ SATISFIED | SC4 redaction clauses green across every surface; D-12 asserted by test on the protocol and proxy paths. |
| **SAFE-05** | 01-01, 01-04, 01-05, 01-06, 01-10, 01-13, 01-15, 01-16 | ✓ SATISFIED | SC5 green; Ajv remains `strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false`. |
| **SAFE-06** | 01-02, 01-08, 01-11…01-18, **01-20**, **01-21**, **01-22**, **01-23** | ? NEEDS HUMAN | The darwin floor is now complete and *proven complete by exact match on a real macOS host* — a real upgrade. Termination judgment is sound in both directions. Residual: `commandProbeEnvironment`'s passthrough set was validated on Windows only (01-21 D5, Broken Window #4), and SAFE-06 is a requirement 01-23's failed gate also carries. |

**Orphans:** none. REQUIREMENTS.md maps exactly SAFE-01..SAFE-06 to Phase 1; all six IDs appear in the gap-closure plans' `requirements` frontmatter (01-19 SAFE-02; 01-20 SAFE-06; 01-21 SAFE-01+SAFE-06; 01-22 SAFE-06; 01-23 SAFE-01+SAFE-02+SAFE-06) and every one is accounted for above.

**Bookkeeping:** `.planning/REQUIREMENTS.md` still marks SAFE-01/02/03/05 `[ ] Pending` and SAFE-04/06 `[x] Complete`. Given this verdict, no checkbox should flip yet. That is the correct current state, not an error.

### Prohibition Verification

All 16 prohibitions declared by 01-19…01-23 arrived `status: unverified, flagged: true`. Each was checked against source or a named passing test, never against a summary.

| Plan | Prohibition (abbreviated) | Verdict | Enforcement evidence |
|------|---------------------------|---------|----------------------|
| 01-19 | Never compare a canonically resolved path against a root not resolved the same way | **HOLDS** (test-tier) | `canonicalizeWithMissingTail` produces both operands at :290/:296 and :352/:367; only two other `realpath` calls exist and neither is a comparison operand; a grep gate in the suite counts direct resolution calls |
| 01-19 | A failed canonical resolution must not be absorbed into a fallback substituting the unresolved string | **HOLDS structurally — UNVERIFIED behaviorally** ⚠ | Every caller checks `.reason` before comparing and returns `unprovable-filesystem` with a stated reason. But no test drives the non-ENOENT branch. Flagged; see behavior_unverified_items 2 and Broken Window #2 |
| 01-19 | Do not restore the legitimate case by relaxing containment | **HOLDS** (test-tier) | `a target that escapes a linked allowed root is still refused` ✔ — I ran it |
| 01-20 | The runtime floor assertion must stay an exact match, not a subset check | **HOLDS** (test-tier) | `test/process.test.ts:165` is still `deepEqual`; it passed on a real macos-latest host, so the darwin floor is exactly right — over-declaration would have turned that leg red |
| 01-20 | An OS-injected name must not be silenced by widening a per-child allowlist | **HOLDS** (test-tier) | `grep -rn "__CF_USER_TEXT_ENCODING" src/` returns only the floor declaration and its doc comment — it was never written into `NODE_RUNTIME_ENVIRONMENT_NAMES` or `UPSTREAM_ENVIRONMENT_NAMES` |
| 01-21 | A preview must not spawn a child that writes under the user's home | **HOLDS** (test-tier) | Plan builder uses the spawn-free `readGlobalPackageVersion`; `test/install.test.ts:401` region control; byte-identity green on all three legs |
| 01-21 | A plan must not report `current` on a probe it could not run | **HOLDS** (test-tier) | `install.ts:318/324/328` -> `unverified`; `:392-393` turns unverified into *plan the install* |
| 01-21 | The preview sandbox must not spread the ambient environment | **HOLDS** (test-tier) | `SANDBOX_ENVIRONMENT_PASSTHROUGH` allowlist replaces the spread; a self-soundness `deepEqual` at :193-199 asserts `npm_config_prefix` is the sandbox's only npm setting |
| 01-21 | Do not go green by relaxing byte-identity, ignoring the npm cache path, or re-admitting `npm_config_cache` | **HOLDS** | No ignore-prefix added; `npm_config_cache` is excluded from the probe passthrough and pinned as a literal (`:236-238`) |
| 01-21 | A read-only probe's write location must not be set by an inherited name | **HOLDS** (test-tier) | `npmProbeEnvironment` removes `npm_config_cache` from passthrough AND pins it; asserted at `test/install.test.ts:354` |
| 01-22 | Never signal a pid whose identity has not been confirmed | **HOLDS** (test-tier) | Every `process.kill(pid, SIGNAL)` site (:645, :854, :904, :933) is gated on `heartbeatNonceMatches === true`; the only bare `kill(pid, 0)` left is inside `probeSignal`, which *collects* evidence and sends no signal |
| 01-22 | The descendant-termination assertion must not be deleted, skipped or downgraded to a diagnostic | **HOLDS** | The assertion is intact and green on ubuntu under real load; the file grew 652 lines and lost no assertion |
| 01-22 | `close()` must not claim whole-tree reaping while POSIX kill is unconfirmed | **HOLDS** | `:690-699` states what is guaranteed, what is only signalled, and that reaping is not awaited; `treeTermination` now reports the delivery path |
| 01-22 | A termination verdict must not come from a stalled or unreadable heartbeat | **HOLDS** (test-tier) | `classifyProcessSample` returns `indeterminate` for both (:416-417); literal-input branch tests at :996 (stalled) and :1006 (unreadable) |
| 01-23 | The gap must not be recorded closed on local evidence alone | **HOLDS — and is the reason for this verdict** | `01-23-SUMMARY.md` frontmatter states "Gap G-01-1 is NOT closed"; `STATE.md:33` reads `Blocked — G-01-1 open` |
| 01-23 | A red leg must not be closed by removing a suite, marking a test not-run, or relaxing an assertion | **HOLDS** | `git log bcf2de4..HEAD -- .github/workflows/ci.yml` is empty; the failing test is unchanged and still failing; `files_modified: []` as declared |

**No prohibition was violated.** Notably, the two prohibitions most tempting to violate — closing the gap on local green, and quieting the red leg by editing ci.yml — were both honored under direct pressure to ship.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `test/path-boundary.test.ts` | SAFE-02 | 24 | 2 | No | Behavioral; fixtures build their own links | ✓ STRONG (2 privilege-gated not-run) |
| `test/process.test.ts` | SAFE-06 | 21 | 0 | No | Value + pure-function branch coverage + runtime exact match | ✓ STRONG |
| `test/preview.test.ts` | SAFE-01 | — | 0 | No | Digest-based byte-identity + a self-soundness assertion on its own sandbox | ✓ STRONG |
| `test/protocol-session.test.ts` | SAFE-04, SAFE-06 | — | 0 | No | Pure classifier with literal-input branch tests + real process observation | ✓ STRONG |
| `test/install.test.ts` | SAFE-01, SAFE-06 | — | 0 | No | Region-scoped source control **with positive control and minimum-length guard** | ✓ STRONG |

**Circular patterns:** 0. **Insufficient assertions:** 0. The negative controls in this round consistently carry positive controls, so deleting the thing under test cannot make the assertion pass — that is above the norm.

**Fail-first evidence:** RC-1's asymmetry was reproduced locally before the fix (junction + not-yet-existing root -> `outside-canonical-root`), and RC-3 was reproduced by `env -u LOCALAPPDATA` with a `before` digest byte-identical to the ubuntu CI expectation. 01-19 fixture 4 was honestly recorded as *green before the fix* — a second negative control rather than the predicted reproducer — and logged as Broken Window #1 rather than passed off as a reproduction. That disclosure works against the executor's interest and is the kind of thing that makes the rest of the record credible.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TODO`/`FIXME`/`TBD`/`XXX`/`HACK`/`PLACEHOLDER`/"not yet implemented" | — | **Zero occurrences** across all ten files changed by 01-19…01-23. Debt-marker gate: clean. |
| `.github/workflows/ci.yml` | 36-49 | An entrypoint that bypasses the environment normalization the phase declared as an invariant | 🛑 **Blocker** | This is RC-5; captured as gap 1/2, not a separate finding |
| `src/core/process.ts` | 816-919 | `commandProbeEnvironment` passthrough set validated on Windows only | ⚠️ Warning | Open as Broken Window #4. A harness whose version reads null on Linux/macOS would mean the allowlist needs widening. The macOS and Linux legs are now green, which is weak positive evidence, but no test asserts the probe's own passthrough on those platforms. |
| `src/core/mcp-fixture.ts` | 142, 146 | `JSON.stringify(initialized.error)` interpolated into a thrown message | ℹ Info | Pre-existing, unchanged; a structured protocol reply rather than accumulated stdout, so outside the 01-17 prohibition. Carried forward from the prior report. |

**Broken Windows ledger cross-check:** `.planning/WINDOWS.md` records 4 open items, 0 waived. All four correspond to findings above (#1 fixture-4 disclosure, #2 EACCES branch, #3 darwin floor off-host — **now actually resolved by the green macos-latest leg and should be marked fixed**, #4 `commandProbeEnvironment`). The ledger is accurate and under-claiming rather than over-claiming.

### Summary Accuracy Check

Cross-referenced against `git`, `gh` and the source — not trusted.

- **`01-23-SUMMARY.md` is accurate and self-incriminating.** It reports the gap as NOT closed, names RC-5 as new information, records the macOS RC-3 prediction as "not verifiable from this run" rather than upgrading it on a green leg, and explains why it declined to fix the red leg inline. Every claim I checked matched.
- **`files_modified` discipline held.** The ten source/test files touched across `bcf2de4..HEAD` match the union of the five plans' declarations; 01-23 declared `files_modified: []` and touched no code.
- **Run id, head sha and per-leg conclusions** quoted in the summary match `gh run view 33984247757` exactly (head `403e017`).
- **No overclaiming found in any of the five summaries.** The one place a summary could have inflated — 01-20's darwin-floor completeness — was explicitly left as a prediction until the macOS leg confirmed it.

### Human Verification Required

**1. Windows unknown-reparse canary (SAFE-02, 01-VALIDATION.md manual-only)**
**Test:** On a privileged Windows host, create a directory with an unclassified reparse tag inside an allowed root; run dry-run then apply against a path beneath it.
**Expected:** Stable unsupported/refusal code, no mutation, outside sentinel hash unchanged, inspection still available (D-01).
**Why human:** `fsutil reparsepoint` requires privileges neither this host nor the CI runners guarantee; the POSIX legs correctly report the concept as Windows-only. 01-UAT.md item 2 is still `result: skipped`.

**2. EACCES `unprovable-filesystem` branch (SAFE-02, 01-19 D4 / Broken Window #2)**
**Test:** Make a component or allowed-root ancestor exist but return EACCES from realpath; call `provePathBoundary` and `recheckPathProof` beneath it.
**Expected:** `proven: false`, `code: "unprovable-filesystem"`, a reason naming the errno, and no comparison against a non-canonical root.
**Why human:** Needs a privileged fixture; currently compiler-checked only.

**3. File-symlink escape canary (SAFE-02)** — 01-UAT.md item 3 was accepted `pass` by the human, with an honest note that the acceptance was of the *privilege gate*, not of an observation (Developer Mode off, `ERROR_PRIVILEGE_NOT_HELD`, still reported not-run). Recorded here as accepted; re-run under an elevated shell to promote it to a real observation.

**4. `commandProbeEnvironment` passthrough on POSIX (SAFE-06, Broken Window #4)** — validated on Windows only. Confirm no harness version reads null on Linux/macOS.

**5. Judgment-tier prohibitions** — 01-01 P2, 01-03, 01-04, 01-11, 01-15 were reviewed and accepted by the human in 01-UAT.md item 4 with detailed per-item source evidence. Carried as resolved; no action needed unless those files change.

## Gaps Summary

**One root cause, two failed must-haves, one blocked phase.**

Everything the five gap-closure plans set out to fix, they fixed — and unlike the previous round, the fixes are proven on the platforms that exposed the defects rather than on the one host that could never reproduce them. Windows went 46 failures to zero. macOS went 50 to zero. Ubuntu's four safety-boundary failures went to zero. The preview byte-identity contract, which was silently false on POSIX one round ago, now holds on all three legs with every wrapper family actually executed. The termination oracle that produced a flaky red was replaced by one that cannot produce a flaky green.

What is not done is the gate. `G-01-1` closes on an observed three-green-leg run and there isn't one. The windows-latest leg fails a single test — but it fails the *right* test, the one 01-21 wrote to guarantee that the primary gate can never again be greener than the CI step running the same files. And it fails it by demonstrating exactly that condition inside a single job: `npm test` green, bare `node --test` red, same commit, same files.

That makes RC-5 structurally the same defect as RC-3, at a different seam. 01-21 built the invariant and applied it to `package.json`; `.github/workflows/ci.yml` is byte-identical across the entire round, so the second entrypoint was never brought under it. RC-3 is precisely the case where an environment divergence between two entrypoints concealed a real safety violation for a full verification cycle. Treating the current divergence as cosmetic because "only the meta-test failed" would repeat the reasoning error that produced the false green in the first place.

The repair is not mechanical and should not be improvised: `scripts/run-tests.mjs` self-enumerates its file list and treats argv as flags, so it cannot express the ten-file subset today, and any fix must keep `npm_config_prefix` a legitimate input to `resolveGlobalNodeModulesRoot`. That is a design decision for a new diagnosis round — which is exactly what 01-23 said and why it changed no files.

The phase goal is substantively achieved on every axis the code controls. It is not verified, because the phase itself defined what verification means here and that evidence does not exist yet.

---

_Verified: 2026-09-06_
_Verifier: Claude (gsd-verifier)_
