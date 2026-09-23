---
phase: 10-three-os-ci-baseline
verified: 2026-09-23T04:46:50Z
status: human_needed
score: 29/30 must-haves verified
behavior_unverified: 0
overrides_applied: 0
flagged_prohibitions: 13
human_verification:
  - test: "Decide whether the path-literal guard's scope satisfies ROADMAP success criterion 1, second clause ('the suite fails if any test under test/ asserts against a platform-specific absolute path literal')."
    expected: "Either accept the implemented scope (literal reaching join/resolve/normalize/relative/dirname/basename or path.<fn>, directly or through a const binding) with an override entry, or open a follow-up to widen it."
    why_human: "D-10 (10-CONTEXT.md line 36) names 'product path functions' in scope and left the heuristic to Claude's discretion; the plan narrowed it to host path calls. The verifier observed that five concrete shapes are not flagged (see Observable Truths #2). Whether that narrowing meets the roadmap contract is a scope decision, not a code fact."
  - test: "Resolve the 13 judgment-tier prohibitions listed in the 'Prohibitions (judgment tier)' table."
    expected: "Each item confirmed or rejected by a human. The verifier's LLM-judge verdict and the evidence behind it are recorded per item; all 13 are judged held."
    why_human: "Judgment-tier prohibitions are never silently passed (ADR-550 D4). The verifier's verdicts are non-authoritative."
---

# Phase 10: Three-OS CI Baseline Verification Report

**Phase Goal:** Users can trust `main` CI again: each red leg is fixed at its diagnosed root cause, and one run proves ubuntu, macOS, and Windows green together.
**Verified:** 2026-09-23T04:46:50Z
**Status:** human_needed
**Re-verification:** No. This is the initial verification.

**Primary evidence records:**
- CI-03 proof (D-14): `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`, run `35818198049` attempt `1`.
- CI-02 root-cause record: `.planning/debug/ci02-windows-alpha-aos-host-leak.md` (`status: resolved`, `classification: test-isolation leak`).

The verifier re-checked the proof by run id, not by the current `origin/main` head. `origin/main` is now `7df2327`, a docs-only commit touching only `CI_RUN.md` and the debug record. Local `main` has two further unpushed `.planning/` commits (`4e47615`, `9ff18bf`).

## Goal Achievement

### Independent re-check of the proof run

`gh run view 35818198049 --attempt 1 --json databaseId,attempt,headSha,event,conclusion,url,headBranch,jobs` (run by the verifier):

| Field | Returned value | Matches CI_RUN.md |
|---|---|---|
| databaseId / attempt | 35818198049 / 1 | yes |
| event / headBranch | push / main | yes |
| headSha | 35d4c1579102fd9effd2ad7bf0f4d438db7865ba | yes |
| conclusion | success | yes |
| Authoritative Release Package (Linux) | 107044198034, success, 04:24:25Z, all 14 steps success | yes |
| windows-latest / Node 24 | 107044319963, success, 04:25:02Z; `Run npm test` and `Safety boundary suites` success | yes |
| macos-latest / Node 24 | 107044319988, success, 04:25:06Z; `Run npm test` and `Safety boundary suites` success | yes |
| ubuntu-latest / Node 24 | 107044319989, success, 04:25:02Z; `Run npm test` and `Safety boundary suites` success | yes |

`gh api repos/4lph4-dvlp/alpha-AOS/actions/runs/35818198049` returns `run_attempt: 1` and `run_started_at: 2026-09-23T04:24:21Z`. The run's latest attempt is attempt 1, so no re-run of any kind was issued. Every job started after the attempt began.

Job logs (`gh run view --job JOB --log`, all three legs, downloaded by the verifier) show the summaries recorded in CI_RUN.md: windows 919/911/0 fail/8 skipped and 177/172/0/5; macOS 919/913/0/6 and 177/175/0/2; ubuntu 919/914/0/5 and 177/175/0/2. No Phase 10 test is skipped on any leg. The skipped tests are the three opt-in Codex canaries plus environment-conditional fixtures (reparse, eacces, `ecc-universal` deep-research), none of them Phase 10 tests.

Pre-fix baseline, re-checked: run `35762417138` (push, `c6415a2`) is `failure` on all three OS legs. Its failed log shows `✖ destinationFor resolves destinations across all five harnesses` (POSIX legs) and `✖ packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle` (windows).

### Observable Truths

Roadmap success criteria (the contract) come first. Plan truths that restate a success criterion are merged into it.

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | SC1a: On ubuntu-latest and macos-latest, `destinationFor resolves destinations across all five harnesses` passes, with its fixture root built from host path APIs | ✓ VERIFIED | `test/owned-skills.test.ts` builds `base = join(tmpdir(), "alpha-aos-destination-fixture")` and every root from it (no drive-letter literal left). Proof run: `✔ destinationFor ...` on ubuntu (1.96 ms) and macOS (4.06 ms). Red in 35762417138. Passes locally on Windows. |
| 2 | SC1b: The suite fails if any test under `test/` asserts against a platform-specific absolute path literal | ? UNCERTAIN (WARNING) | Guard `test/path-literal-guard.test.ts` + `test/helpers/path-literal-scan.ts` exist, are wired, and pass on all three legs. The pre-fix sources at c6415a2 scan to 5 + 3 = 8 violations (the verifier re-ran this). An injected `const injected = "/home/runner/x"; join(injected, "y")` is flagged. **Not flagged** by the scanner (verifier probe): (a) a literal passed straight to a product path function and compared with a bare literal expectation, e.g. `assert.equal(destinationFor("claude","s","C:\\root"), "C:\\root\\skills\\s\\SKILL.md")`, which is the CI-01 defect class and red on POSIX; (b) a `let` binding; (c) an aliased import `join as pj`; (d) a namespace import `p.join`; (e) an object-property value `env.HOME`. D-10 names "product path functions" in scope. The plan narrowed the scope to host path calls. Human decision requested. |
| 3 | SC2: The Windows packed lifecycle leaves every real host managed path, including `~/.alpha-aos`, byte-identical, and the immutability assertion is unchanged | ✓ VERIFIED | Proof run windows leg: `✔ packed release completes ... lifecycle (82396.9 ms)` in the same `npm test` step as the cold context7/exa/firecrawl startups (37.0 s, 58.9 s, 70.4 s). The `hostMutationTargets` block has the same sha256 at c6415a2 and HEAD (`18ed4bc8...`). The verifier ran the c6415a2 `fingerprint` and the new `fingerprintManifest(...).digest` on `skills/`, `catalog/`, `schemas/`, `test/`, `package.json` and a missing path: all identical. `assert.deepEqual(afterHost, beforeHost, ...)` still compares the same map. The only added assertion (`vanishedEntryCount == 0`) is stricter. |
| 4 | SC3: The Windows `~/.alpha-aos` change has a recorded, classified root cause with the deciding evidence (which bytes changed, which step wrote them) | ✓ VERIFIED | `.planning/debug/ci02-windows-alpha-aos-host-leak.md`: `classification: test-isolation leak`; the writer chain runs `startPinnedServer` → `upstreamEnvironmentPolicy` → `proxyCacheRoot` → `userStateRoot`; the per-entry drift is 20,447 added entries under `mcp-cache/npm-cache/{_npx,_cacache,_update-notifier-last-checked}`; a control run of the fixture alone left 0 entries; it records the CI timing overlap (~27 s) and the onset table. The product and test-oracle classes are ruled out with evidence. |
| 5 | SC4: A regression test pins the diagnosed cause. It was observed failing against the unfixed code and passes against the fix | ✓ VERIFIED | The verifier reproduced RED on its own: the `git archive` of `ac67ffc` built in scratch fails `pinned upstream startups keep their npx cache ...` with `this file must resolve its own state root, not the host one`, and `d9e044a` fails both gate regressions (`tests 16 / pass 14 / fail 2`; the scratch home gained `.alpha-aos/journal` and `snapshots`). At HEAD on a scratch home, all pass (`16/16`, `1/1`) with 0 home entries. On CI all three regressions pass on all three legs. |
| 6 | SC5: A single `main` CI run id shows ubuntu, macOS and windows all green, with no leg individually re-run or taken from another run | ✓ VERIFIED | Run 35818198049, attempt 1, event `push`, all 4 jobs `success`, `run_attempt: 1` (independent re-check above). |
| 7 | 10-01: The ECC-roots test builds its home and every profile root from `join(tmpdir(), ...)` | ✓ VERIFIED | `test/ecc-skills.test.ts` uses `alpha-aos-ecc-root-fixture` and six unchanged assertions. `✔` on all three legs. |
| 8 | 10-01: The guard fails on every OS when a literal reaches an unqualified host path call (directly or through a `const` binding) without a reasoned marker | ✓ VERIFIED | The scanner implements exactly this contract, and the injected violation is flagged. No `path-literal-ok` marker is used anywhere in `test/` outside the guard's own samples. |
| 9 | 10-01: Opaque inputs (`path.win32/posix`, `win32/posix`, env values, redaction samples, never-joined consts) are not flagged | ✓ VERIFIED | Self-test `leaves win32/posix-qualified inputs and opaque strings alone` passes on 3 CI legs and locally. |
| 10 | 10-01: The c6415a2 sources scan to exactly 8 (5 + 3) | ✓ VERIFIED | Verifier re-ran: `owned-skills 5`, `ecc-skills 3`, `total 8`. |
| 11 | 10-01: A marker exempts only its own line. POSIX roots match whole segments only | ✓ VERIFIED | Self-tests `a path-literal-ok marker ...` and `... whole path segments only` pass. `PATH_LITERAL_MARKER` requires at least 4 reason characters. |
| 12 | 10-01: Empty source yields `[]`. The real-tree scan refuses a vacuous pass (self, owned-skills, at least 50 files) | ✓ VERIFIED | Guard asserts all three preconditions. `test/*.ts` count is 53. |
| 13 | 10-01: Sorted enumeration and sorted violations give an identical message on every OS | ✓ VERIFIED | `readdir(...).filter(...).sort()` (code-unit) and violations sorted by file (`<`), then line, then column. |
| 14 | 10-02: The drift message names changed targets and entries by path, kind, size and a 12-hex prefix, bounded to 50 with per-target totals | ✓ VERIFIED | `describeHostDrift` in `test/tarball-fixture.test.ts`. Tests `host drift report names ...` and `... bounds its listing ...` pass on all 3 legs. The debug record shows the real report output. |
| 15 | 10-02: The drift report never contains file content | ✓ VERIFIED | Sentinel test asserts both sentinels are absent. Passes on 3 legs. |
| 16 | 10-02: Oracle verdict unchanged (targets byte-identical, `~/.alpha-aos` first, same digest stream) | ✓ VERIFIED | See #3 (block hash and old-vs-new digest comparison). |
| 17 | 10-02: An ENOENT mid-walk becomes a `vanished` entry that keeps the test red and is named. Other errnos propagate | ✓ VERIFIED (verifier probe; no in-repo test) | The verifier executed the verbatim `fingerprintManifest`/`describeHostDrift`/`vanishedEntryCount` source (extracted from the file, transpiled) with injected fs errors. With ENOENT on `d/a.txt`, the digest changes, `vanished` is recorded, `vanishedEntryCount` is 1, and the report line is `vanished d/a.txt file/1/ca978112ca1b -> vanished/-/-`. EACCES (readFile) and EPERM (readdir) propagate. No repository test exercises this path (advisory below). |
| 18 | 10-02: The debug record classifies the leak and names the writer, local pair evidence, CI signature/timing and onset | ✓ VERIFIED | See #4. It contains `upstreamEnvironmentPolicy` (key-link pattern). |
| 19 | 10-02: REQUIREMENTS CI-02 and ROADMAP SC3 name all three root-cause classes | ✓ VERIFIED | `.planning/REQUIREMENTS.md:11` and `.planning/ROADMAP.md:52` both name product isolation leak, test-oracle defect and test-isolation leak. |
| 20 | 10-02: A file that became a directory is one `changed` line. Identical entries are not listed | ✓ VERIFIED | Sentinel test asserts one `morph` line and no `keep.txt`. |
| 21 | 10-02: Missing target is `absent`. Absent-to-present lists every entry as added. An empty dir is not `absent` | ✓ VERIFIED | `host fingerprint keeps the aggregate digest byte stream` and the created-target assertions. |
| 22 | 10-02: Drift ordering is target order, then code-unit path order | ✓ VERIFIED | `compareCodeUnits`. The 60-file test asserts names `entry-00..49` listed in order. |
| 23 | 10-03: `mcp-proxy.test.ts` sets `ALPHA_AOS_STATE_DIR = join(tmpdir(), "alpha-aos-test-mcp-proxy-state")` at module scope | ✓ VERIFIED | Lines 48-52 in the current file. The regression test asserts `userStateRoot() === testStateRoot` and the per-server `npm_config_cache`. |
| 24 | 10-03: The gate-engine receipt test and every gate-lifecycle CLI spawn use scratch state roots | ✓ VERIFIED | `redirectStateRoot(context, stateRoot)` with restore in `context.after`. There are 7 `runProcess({` calls and 7 `environment: gateEnvironment(stateRoot)` calls, with no `environment: probeEnv` left. `stateRoot = join(parent, "state")` sits beside the repo. |
| 25 | 10-03: Running `mcp-proxy` and `tarball-fixture` concurrently on a scratch home gives fail 0 and no `.alpha-aos` | ✓ VERIFIED | The verifier re-ran it (`--test-concurrency=2`, `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`, fresh scratch home): `tests 47 / pass 47 / fail 0`, packed lifecycle ok (63.5 s), `.alpha-aos` absent, 0 home entries. |
| 26 | 10-03: The post-fix per-file home-write probe shows 0 home entries for the three fixed files | ✓ VERIFIED | Verifier scratch-home runs: gate-engine + gate-lifecycle left 0 entries. `mcp-proxy` as a whole file (inside the pair run) left 0 entries. |
| 27 | 10-03: `src/` and `.github/workflows/ci.yml` are byte-identical to c6415a2 | ✓ VERIFIED | `git diff --quiet c6415a2 35d4c15 -- src .github/workflows/ci.yml` exits 0, and the same holds against HEAD. |
| 28 | 10-04: In the proof run, the POSIX legs report `destinationFor` ok, every leg reports the guard ok, and windows reports the packed lifecycle ok | ✓ VERIFIED | Grepped from the three downloaded job logs (see #1, #3). The guard is `✔` on windows (569 ms), macOS (507 ms) and ubuntu (584 ms). |
| 29 | 10-04: Any re-run would have been `Re-run all jobs` on the same run. The accepted attempt is recorded | ✓ VERIFIED | No re-run happened (`run_attempt: 1`). Attempt 1 is recorded in CI_RUN.md. |
| 30 | 10-04: CI_RUN.md records the run facts from `gh` output. The debug record is resolved and cites it. Both are published by a docs-only fast-forward. CI_RUN.md stays pinned | ✓ VERIFIED | Every CI_RUN.md field matches the verifier's `gh` output. The debug record has `status: resolved` and cites `CI_RUN.md`. `7df2327` touches only those two files. `git reflog show origin/main` shows only `update by push`. The proof SHA is an ancestor of `origin/main` and of local `main`. |

**Score:** 29/30 truths verified (0 present-but-behavior-unverified; 1 UNCERTAIN routed to human decision)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `test/helpers/path-literal-scan.ts` | Pure TS-AST scanner and its 6 exports | ✓ VERIFIED | 99 lines. Exports `ABSOLUTE_PATH_LITERAL`, `HOST_PATH_FUNCTIONS`, `PATH_LITERAL_MARKER`, `PathLiteralViolation`, `scanPathLiterals` and `formatPathLiteralViolation`. `import ts from "typescript"`, no `node:fs`. |
| `test/path-literal-guard.test.ts` | 6 named tests and the real-tree scan | ✓ VERIFIED | All 6 names present verbatim. 6/6 pass locally and on 3 legs. |
| `test/owned-skills.test.ts` | `alpha-aos-destination-fixture` roots | ✓ VERIFIED | Wired to `destinationFor` (src/core/owned-skills.ts). |
| `test/ecc-skills.test.ts` | `alpha-aos-ecc-root-fixture` roots | ✓ VERIFIED | Wired to `globalEccSkillRoot`. |
| `test/tarball-fixture.test.ts` | `fingerprintManifest`, `snapshotTargets`, `hostSnapshot(manifests)`, `describeHostDrift`, `vanishedEntryCount`, 3 unit tests | ✓ VERIFIED | Contains `describeHostDrift(beforeManifests, afterManifests)` in the lifecycle assertion. |
| `test/mcp-proxy.test.ts` | `hostStateRootAtLoad`, `testStateRoot`, redirect, regression test | ✓ VERIFIED | Contains `alpha-aos-test-mcp-proxy-state`. |
| `test/gate-engine.test.ts` | `redirectStateRoot` and the journal assertion | ✓ VERIFIED | Contains the exact assertion message. |
| `test/gate-lifecycle.test.ts` | `gateEnvironment(stateRoot)` on every spawn | ✓ VERIFIED | 7/7 spawns. |
| `.planning/debug/ci02-windows-alpha-aos-host-leak.md` | Root-cause record, RED observations, resolution | ✓ VERIFIED | `status: resolved`. Contains `test-isolation leak`, `RED commit` and `CI_RUN.md`. |
| `.planning/phases/10-three-os-ci-baseline/CI_RUN.md` | CI-03 proof record | ✓ VERIFIED | Contains `Attempt` and `gh run view`. All values match gh. |
| `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` | Three-class wording | ✓ VERIFIED | Both contain `test-isolation leak`. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `path-literal-guard.test.ts` | `helpers/path-literal-scan.ts` | `from "./helpers/path-literal-scan.js"` | WIRED | Import present and used. |
| `path-literal-guard.test.ts` | `test/*.ts` | `readdir(join(repositoryRoot, "test"))` | WIRED | `repositoryRoot = resolve(import.meta.dirname, "..", "..")`. Scans the sources, not dist. |
| `owned-skills.test.ts` | `destinationFor` | tmpdir-based custom root | WIRED | Passes on POSIX CI. |
| lifecycle test | `describeHostDrift` | `assert.deepEqual(afterHost, beforeHost, describeHostDrift(beforeManifests, afterManifests))` | WIRED | Exact pattern present. |
| `hostSnapshot` | `hostMutationTargets` | `snapshotTargets(hostMutationTargets, manifests)` | WIRED | Present. |
| debug record | writer chain | `upstreamEnvironmentPolicy` | WIRED | Present in the Writer section. |
| `mcp-proxy.test.ts` module scope | `userStateRoot` via `proxyCacheRoot` | `process.env.ALPHA_AOS_STATE_DIR = testStateRoot` | WIRED | Behavior confirmed by RED/GREEN and the pair run. |
| `gate-lifecycle` `gateEnvironment` | CLI child | `ALPHA_AOS_STATE_DIR: stateRoot` literal | WIRED | Journal lands under the scratch `state/journal` (regression asserts it). |
| `gate-engine` `redirectStateRoot` | `writeGateReceipt` → `userStateRoot()` | env saved, set, restored | WIRED | `redirectStateRoot(context, stateRoot)` present. |
| `CI_RUN.md` | `gh run view ... --attempt 1 --json ...` | captured JSON | WIRED | Re-checked by the verifier. |
| debug record | `CI_RUN.md` | Resolution section | WIRED | Cites run 35818198049 attempt 1. |
| `10-VERIFICATION.md` | `CI_RUN.md` | D-14 citation | WIRED | This report cites it as the CI-03 evidence. |

### Data-Flow Trace (Level 4)

Not applicable. The phase changes test code and planning records only. No rendered dynamic data exists.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Guard and scanner self-tests | `node --test dist/test/path-literal-guard.test.js` | 6/6 pass | ✓ PASS |
| CI-01 fixtures on Windows | `node --test --test-name-pattern="destinationFor resolves\|global ECC roots" dist/test/owned-skills.test.js dist/test/ecc-skills.test.js` | 2/2 pass | ✓ PASS |
| Pre-fix scan count | `scanPathLiterals` over `git show c6415a2:test/{owned,ecc}-skills.test.ts` | 5 + 3 = 8 | ✓ PASS |
| Guard catches a new violation | scanner over `owned-skills.test.ts` text plus an injected `/home/runner/x` const passed to `join` | 1 violation `binding injected` | ✓ PASS |
| Helpers carry no violation | scanner over each `test/helpers/*.ts` | 0 each | ✓ PASS |
| R1 RED at `ac67ffc` | scratch build, scratch home, `--test-name-pattern="test-owned state root"` | fail 1, `this file must resolve its own state root` | ✓ PASS (RED observed) |
| R2/R3 RED at `d9e044a` | scratch build, scratch home, gate-engine + gate-lifecycle | 16 / 14 / fail 2, home gained `.alpha-aos/journal` | ✓ PASS (RED observed) |
| R1-R3 GREEN at HEAD | same commands at HEAD, scratch home | 16/16 and 1/1, 0 home entries | ✓ PASS |
| Pair run post-fix | `node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js`, scratch home, upstream required | 47/47, `.alpha-aos` absent | ✓ PASS |
| Aggregate digest unchanged | old `fingerprint` vs new `fingerprintManifest().digest` on 6 paths | all identical | ✓ PASS |
| ENOENT → vanished, other errnos propagate | verbatim-extracted code with injected fs errors | vanished recorded and reported; EACCES/EPERM thrown | ✓ PASS |

The full suite was not run locally. CI is the authoritative full-suite observation, because this Windows dev host has 6 known capability-oracle failures (10-RESEARCH Pitfall 6) and a redaction alias perturbation when the scratch home sits under `%TEMP%`. Every RED/GREEN/pair run used a fresh scratch HOME/USERPROFILE with `ALPHA_AOS_STATE_DIR` and harness roots unset. The developer's real `~/.alpha-aos` was not touched.

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` exists, and no PLAN declares one. The phase's "per-file home-write probe" is an ad-hoc procedure, and its three relevant files were re-run above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CI-01 | 10-01 | `destinationFor` passes on ubuntu/macOS via host path APIs, and no test asserts against a platform-specific absolute path literal | ✓ SATISFIED (guard-scope caveat, truth #2) | Truths 1, 2, 7-13. Proof-run POSIX legs green. |
| CI-02 | 10-02, 10-03 | Windows packed lifecycle leaves real host paths byte-identical. Root cause classified, recorded, pinned by a regression test | ✓ SATISFIED | Truths 3-5, 14-27. Debug record `.planning/debug/ci02-windows-alpha-aos-host-leak.md`. |
| CI-03 | 10-04 | `main` CI passes on all three OS in a single run id | ✓ SATISFIED | Run 35818198049 attempt 1, recorded in `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`. |

Orphaned requirements: none. REQUIREMENTS.md maps only CI-01, CI-02 and CI-03 to Phase 10, and every plan's `requirements:` field claims one of them.

### Prohibitions (judgment tier, flagged for human review)

Verdicts are non-authoritative LLM-judge verdicts. Each needs explicit human resolution.

| # | Plan | Prohibition | LLM-judge verdict | Evidence |
|---|---|---|---|---|
| P1 | 10-01 | No skip, platform gate or deletion of the `destinationFor` assertions, and no file excluded from the guard | held | The diff adds no `skip`/`process.platform`. Assertions are kept 1:1. Readdir covers all `test/*.ts`. |
| P2 | 10-01 | A reasonless marker is itself flagged | held | Self-test line 2 (`// path-literal-ok:`) is flagged. The regex requires at least 4 characters. |
| P3 | 10-02 | Oracle not loosened, narrowed, serialized or reordered, and no CI redirect | held | Targets block hash identical. `ci.yml` unchanged. No `concurrency: false`. |
| P4 | 10-02 | No file contents printed and no `.alpha-aos` artifact upload | held | Sentinel test passes. The debug record lists metadata only (paths, kinds, sizes, hash prefixes). `ci.yml` unchanged. |
| P5 | 10-02 | No run against the real home, and no deletion of the real `~/.alpha-aos` | held (mtime evidence only) | The newest entries in real `~/.alpha-aos/journal` and `snapshots` are 2026-09-22T17:33Z. `mcp-cache` mtime is 2026-09-10. The first Phase 10 code commit is 2026-09-22T23:32Z. Reads cannot be proven from mtimes. |
| P6 | 10-02 | No D-06 evidence branch merged into `main` | held | No local or remote `*evidence*` branch. Remote heads: `main` and `automation/dependency-candidate`. |
| P7 | 10-03 | No serializing or reordering of the fixture, no suite-wide guard, no edit to `hostMutationTargets` or the host assertion | held | See P3. `scripts/run-tests.mjs` is not in the phase diff. |
| P8 | 10-03 | No state-root/HOME redirect in `ci.yml` | held | `ci.yml` byte-identical to c6415a2. |
| P9 | 10-03 | No RED or probe run against the real home | held (mtime evidence only) | As P5. The debug record documents scratch homes for every run. |
| P10 | 10-03 | No `src/` change | held | `git diff --quiet c6415a2 HEAD -- src` exits 0. |
| P11 | 10-04 | No `workflow_dispatch` proof, no per-job or `--failed` re-run, no mixing of runs or attempts | held | `event: push`, `run_attempt: 1`, all jobs from attempt 1. |
| P12 | 10-04 | No force-push, history rewrite or `ci.yml` edit | held | `origin/main` reflog shows only `update by push` (c6415a2 → 35d4c15 → 7df2327). |
| P13 | 10-04 | No hand-transcribed run facts | held (as to correctness) | Every CI_RUN.md value matches the verifier's own `gh` output. Provenance (generated rather than typed) cannot be proven after the fact. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (phase-modified test files) | - | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | none found | - |
| `test/tarball-fixture.test.ts` | ~168-214 | ENOENT → `vanished` branch has no in-repo regression test | ⚠️ Warning (advisory) | Behavior confirmed by a verifier probe only. A future edit could break it silently, and a real mid-walk removal would again surface only as an error. |
| `test/helpers/path-literal-scan.ts` | 36-43, 55-63 | Detection is limited to bare `join`/`resolve`/etc. identifiers, `path.<fn>`, and `const` bindings | ⚠️ Warning | See truth #2. Aliased or namespace imports, `let` bindings, product-function inputs and bare-literal expectations bypass it. The POSIX CI legs would still turn red on such a defect. The guard just would not catch it on Windows first. |
| `test/mcp-proxy.test.ts` | 50-52 | Module-scope `ALPHA_AOS_STATE_DIR` is never restored, and the test-owned tmp cache is never cleaned | ℹ️ Info | Intentional, documented in the code comment (per-file process; warm cache across CI steps). On a dev host it leaves a persistent `%TEMP%\alpha-aos-test-mcp-proxy-state`. |
| repo root | - | Untracked `nul` file | ℹ️ Info | Windows redirection artifact, not a phase file. |

### Human Verification Required

#### 1. Path-literal guard scope versus ROADMAP SC1

**Test:** Review truth #2. Decide whether the implemented guard scope (a literal reaching a bare host path call or `path.<fn>`, directly or through a `const`) meets "the suite fails if any test under `test/` asserts against a platform-specific absolute path literal", given that D-10 also names product path functions.
**Expected:** Either accept with an override, or record a follow-up to extend the scanner (literals passed to product path functions or compared as bare expectations, `let` bindings, aliased or namespace `node:path` imports).
**Why human:** This is a contract-scope decision. D-10 gave the heuristic to Claude's discretion, and the plan narrowed it. Code facts cannot settle it.

If accepted, add to this file's frontmatter:

```yaml
overrides:
  - must_have: "The suite fails if any test under test/ asserts against a platform-specific absolute path literal"
    reason: "Guard covers the CI-01 defect shape (literal into join/resolve/normalize/relative/dirname/basename or path.<fn>, directly or via const), proven 8/8 on the pre-fix sources; remaining shapes are caught by the POSIX CI legs themselves"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

#### 2. Judgment-tier prohibitions P1-P13

**Test:** Confirm or reject each row of the Prohibitions table.
**Expected:** All 13 held, as judged by the verifier. P5, P9 and P13 rest on mtime or consistency evidence, not proof of provenance.
**Why human:** ADR-550 D4 requires explicit human resolution of judgment-tier prohibitions.

### Gaps Summary

No blocking gaps. The three red legs of run 35762417138 were each fixed at a diagnosed root cause:
- CI-01: drive-letter fixture literals became `join(tmpdir(), ...)`, and a source guard was added.
- CI-02: the test-isolation leak from `mcp-proxy`, `gate-engine` and `gate-lifecycle` writing the real `~/.alpha-aos` was fixed with test-owned state roots. The oracle is unchanged.

Push-triggered run 35818198049 attempt 1 is green on ubuntu, macOS, windows and the package job, with no re-run. The verifier re-established the proof by run id and reproduced the RED-then-GREEN regressions and the post-fix pair run on its own. Two items are open for human decision: whether the path-literal guard's narrower-than-D-10 scope satisfies SC1's second clause, and resolution of the 13 judgment-tier prohibitions. Advisory: add an in-repo test for the ENOENT → `vanished` branch of `fingerprintManifest`.

---

_Verified: 2026-09-23T04:46:50Z_
_Verifier: Claude (gsd-verifier)_
