---
phase: 10-three-os-ci-baseline
plan: 03
subsystem: testing
tags: [ci, windows, test-isolation, node-test, state-root, host-immutability-oracle]

requires:
  - phase: 10-three-os-ci-baseline
    provides: "10-02 CI-02 diagnosis (test-isolation leak) and per-entry host drift report"
provides:
  - "mcp-proxy.test.ts redirects ALPHA_AOS_STATE_DIR at module scope to join(tmpdir(), \"alpha-aos-test-mcp-proxy-state\"), so pinned npx startups never write the host state root"
  - "gate-engine.test.ts redirectStateRoot(context, stateRoot) helper around the direct writeGateReceipt call"
  - "gate-lifecycle.test.ts gateEnvironment(stateRoot) policy on all seven CLI spawns"
  - "Three regression assertions pinning where each writer's bytes land, each observed RED before its fix"
  - "Local fix evidence in .planning/debug/ci02-windows-alpha-aos-host-leak.md (Regression RED observations, Fix (local))"
affects: [10-04, phase-11-LIFE-03, phase-11-LIFE-04]

actuals:
  tokens: 3700
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "A test file that reaches userStateRoot() owns its own state root: module-scope redirect for whole-file writers, save/set/restore in context.after for a single test"
    - "A CLI child gets ALPHA_AOS_STATE_DIR only as an EnvironmentPolicy literal, because commandProbeEnvironment does not pass it through"
    - "Regression assertions pin the positive write location instead of asserting the host root is unchanged (which would race with concurrent files)"

key-files:
  created: []
  modified:
    - test/mcp-proxy.test.ts
    - test/gate-engine.test.ts
    - test/gate-lifecycle.test.ts
    - .planning/debug/ci02-windows-alpha-aos-host-leak.md

key-decisions:
  - "CI-02 fixed test-side only under D-02: src/, ci.yml and the tarball-fixture oracle are byte-identical to c6415a2; writeGateReceipt stateRoot option and upstreamEnvironmentPolicy ambient write root stay recorded follow-ups"
  - "The mcp-proxy test state root is a stable tmpdir path, not a mkdtemp root, so the npx cache stays warm across the two CI test steps without touching the host root"
  - "capability-oracle.test.js is excluded from the local scratch-home suite gate only because its 6 failures come from this dev host's PATH (pi and codex installed); 10-04 CI legs run it"

patterns-established:
  - "State-root ownership in tests: every test that journals or caches through userStateRoot() redirects it to a scratch root beside, never inside, the fixture repository"

requirements-completed: [CI-02]

coverage:
  - id: D1
    description: "mcp-proxy pinned startups keep their npx cache under a test-owned state root (RED ac67ffc, GREEN 8f17c7e)"
    requirement: CI-02
    verification:
      - kind: unit
        ref: "test/mcp-proxy.test.ts#pinned upstream startups keep their npx cache under the test-owned state root, never the host state root"
        status: pass
      - kind: integration
        ref: "node --test dist/test/mcp-proxy.test.js on a scratch home with ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1: 37/37 pass, 0 home entries"
        status: pass
    human_judgment: false
  - id: D2
    description: "gate-engine and gate-lifecycle gate-receipt journals land in scratch state roots (RED d9e044a, GREEN 7a3ee28)"
    requirement: CI-02
    verification:
      - kind: unit
        ref: "test/gate-engine.test.ts#writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03)"
        status: pass
      - kind: integration
        ref: "test/gate-lifecycle.test.ts#Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03)"
        status: pass
      - kind: other
        ref: "grep gate: 7 runProcess({ calls equal 7 environment: gateEnvironment(stateRoot)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Local proof: pair reproduction fail 0 (warm and cold), per-file probe shows 0 home writes for the three fixed files, suite minus capability-oracle fail 0 with no .alpha-aos"
    requirement: CI-02
    verification:
      - kind: integration
        ref: "node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js (scratch home): 47/47 pass x3, no .alpha-aos"
        status: pass
      - kind: integration
        ref: "node scripts/run-tests.mjs --files <all but capability-oracle> (scratch home): 888 tests, 879 pass, 0 fail, 9 skipped, no .alpha-aos"
        status: pass
      - kind: other
        ref: "git diff --quiet c6415a2 -- src/ .github/workflows/ci.yml"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 03: CI-02 Test-Isolation Leak Fix Summary

**Three test files that wrote the real `~/.alpha-aos` now own their state roots. mcp-proxy uses a module-scope `ALPHA_AOS_STATE_DIR` redirect to a stable tmpdir path, gate-engine uses a scoped save/set/restore, and gate-lifecycle passes an `ALPHA_AOS_STATE_DIR` policy literal to its CLI spawns. The concurrent mcp-proxy plus packed-lifecycle pair that reproduced the CI-02 windows red now passes 47/47 on a scratch home and writes nothing there.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-09-22T23:56:25Z
- **Completed:** 2026-09-23T00:20:45Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Primary writer fixed. `test/mcp-proxy.test.ts` declares `hostStateRootAtLoad` and `testStateRoot` right after its imports and sets `process.env.ALPHA_AOS_STATE_DIR = testStateRoot;` above the first `test(`. The pinned context7, exa and firecrawl npx caches now land in `%TEMP%\alpha-aos-test-mcp-proxy-state\mcp-cache\npm-cache`.
- Same-class writers fixed. gate-engine calls `redirectStateRoot(context, stateRoot)` before `writeGateReceipt`. gate-lifecycle declares `const stateRoot = join(parent, "state")` in all four CLI tests and passes `environment: gateEnvironment(stateRoot)` to all seven `runProcess` calls.
- Three regression assertions, each observed RED before its fix (D-08). The commands, excerpts and shas are in the debug record.
- Pair reproduction after the fix (`--test-concurrency=2`, `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`, scratch home):

  | Run | npx cache | TAP | packed lifecycle | `.alpha-aos` |
  |-----|-----------|-----|------------------|--------------|
  | 1 | warm | tests 47 / pass 47 / fail 0 | ok (60.6 s) | absent |
  | 2 | cold (test-owned cache removed first; startups 16.9 / 18.6 / 22.4 s overlapped the fixture) | tests 47 / pass 47 / fail 0 | ok (71.4 s) | absent |
  | 3 | warm, plan recipe verbatim | tests 47 / pass 47 / fail 0 | ok (63.6 s) | absent |

- Per-file home-write probe after the fix: 53 files, each alone on its own fresh scratch home, four at a time.

  | Test file | Exit | Pass / fail | Home entries | Note |
  |-----------|------|-------------|--------------|------|
  | mcp-proxy.test.js | 0 | 37 / 0 | 0 | was 20,447 |
  | gate-engine.test.js | 0 | 9 / 0 | 0 | was 5 |
  | gate-lifecycle.test.js | 0 | 7 / 0 | 0 | was 9 |
  | tarball-fixture.test.js | 0 | 10 / 0 | 0 | unchanged |
  | capability-oracle.test.js | 1 | 25 / 6 | 4 (`.pi/agent/*`) | dev-host only (A2); no `.alpha-aos` any more |
  | preview.test.js | 0 | 11 / 0 | 4 (`AppData/Local/Microsoft/PowerShell`) | pwsh cache, not a managed path |
  | redaction.test.js | 1 | 20 / 1 | 0 | probe artifact: the home sat inside `%TEMP%`; passes in the suite run |
  | 46 others | 0 | all pass | 0 | unchanged |

- Scratch-home suite with every file except capability-oracle, run through `scripts/run-tests.mjs --files`: `tests 888 / pass 879 / fail 0 / skipped 9`, and no `.alpha-aos` in the home. capability-oracle alone: `31 / 25 / 6`, with no `.alpha-aos` in its home.
- `git diff --quiet c6415a2 -- src/ .github/workflows/ci.yml` exits 0. The debug record keeps `status: diagnosed`.

## Task Commits

1. **Task 1 (tracer): mcp-proxy test-owned state root**
   - RED `ac67ffc` (test): regression test fails because `userStateRoot()` resolved the scratch home's `.alpha-aos`
   - GREEN `8f17c7e` (fix): module-scope redirect
   - Evidence `c3e68df` (docs): R1 in the debug record
2. **Task 2: gate-receipt writers**
   - RED `d9e044a` (test): both journal-location assertions fail (tests 16 / pass 14 / fail 2)
   - GREEN `7a3ee28` (fix): `redirectStateRoot` and `gateEnvironment`
   - Evidence `82a5ccf` (docs): R2 and R3 in the debug record
3. **Task 3: local proof** - `e259d4f` (docs): `## Fix (local)` in the debug record

**Plan metadata:** the final docs commit for this plan

## Files Created/Modified

- `test/mcp-proxy.test.ts`: `homedir`, `isAbsolute` and `relative` imports; `hostStateRootAtLoad`, `testStateRoot` and the module-scope redirect; the new regression test
- `test/gate-engine.test.ts`: `existsSync` import, the `redirectStateRoot` helper, and the journal-location assertion
- `test/gate-lifecycle.test.ts`: `readdir` and `EnvironmentPolicy` imports, the `gateEnvironment` helper, per-test `stateRoot`, seven spawns switched to `gateEnvironment(stateRoot)`, and the journal-directory assertion
- `.planning/debug/ci02-windows-alpha-aos-host-leak.md`: R1, R2 and R3 RED/GREEN observations, and `## Fix (local)`

## Decisions Made

- The fix is test-side only (D-02). `src/`, `ci.yml`, `hostMutationTargets`, `hostStateRoot` and the lifecycle host assertion are untouched. Nothing was serialized or reordered, and no suite guard was added.
- The mcp-proxy root is a stable `join(tmpdir(), ...)` path, which keeps the npx cache warm across CI steps (10-RESEARCH Pitfall 4).
- The outside-the-host-root check reads the first segment of `relative(hostStateRootAtLoad, testStateRoot)` as `..`, or an absolute result for a cross-drive path. A bare `startsWith("..")` would also accept a child named `..foo`.

## Deviations from Plan

- **[Rule 2 - Correctness] A slightly stricter containment check than the plan text suggested.** The plan said to use `relative(...)` to prove the test root sits outside the host root. The check tests the first path segment (`..`) or `isAbsolute`, which needed the extra `isAbsolute` import. Found during Task 1. Committed in `ac67ffc`.
- **[Rule 3 - Evidence] Debug-record updates were committed as separate `docs(10-03)` commits** (`c3e68df`, `82a5ccf`, `e259d4f`) rather than folded into the test/fix commits. This keeps each RED commit a pure test change, as the named commit messages require.
- **[Extra evidence] A cold-cache pair run.** It removed only the test-owned `%TEMP%\alpha-aos-test-mcp-proxy-state`, never the real home, so the startups really downloaded while the fixture's snapshot window was open. That is the exact condition that reproduced the leak before the fix.

**Total deviations:** 2 minor auto-adjustments plus 1 additional evidence run. **Impact:** none on scope; the prohibitions all hold.

## Issues Encountered

- A scratch home placed under `%TEMP%` makes `redaction.test.js` "path aliases are segment-aware across roots, separators and case" fail, because the `<temp>` alias wins over the home alias. This is a probe-environment artifact, not a regression. On this host Git Bash `mktemp -d` resolves to `C:\Users\Public\Documents\ESTsoft\CreatorTemp` (TMPDIR), outside `%TEMP%`, so the plan-recipe suite run passes it.
- The research probe had recorded capability-oracle writing `.alpha-aos/mcp-cache/npm-cache` empty directories. After the fix it writes only `.pi/agent/*`. The earlier observation is not reproduced, and this run does not explain why. Assumption A2 still covers the `.pi` writes.

## Safety Notes

- Every RED, GREEN, probe and suite run used a fresh scratch home, with `ALPHA_AOS_STATE_DIR` and the harness root variables unset. The developer's real `~/.alpha-aos` was not read, modified or deleted.
- The `mktemp -d` scratch homes created under TMPDIR were removed afterwards. The scratchpad homes stay in the session scratchpad.

## TDD Gate Compliance

- Task 1: RED `test(10-03)` `ac67ffc`, then GREEN `fix(10-03)` `8f17c7e`
- Task 2: RED `test(10-03)` `d9e044a`, then GREEN `fix(10-03)` `7a3ee28`
- No refactor commits were needed.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- 10-04 can push and observe the three-OS proof run. The windows packed lifecycle should now leave the runner's `~/.alpha-aos` byte-identical, because none of the former writers resolves it any more.
- The debug record stays `diagnosed` until 10-04 records a green run id.
- Open follow-ups (outside Phase 10): a `writeGateReceipt` stateRoot option, the `upstreamEnvironmentPolicy` ambient write root, and the capability-oracle dev-host audit.

---
*Phase: 10-three-os-ci-baseline*
*Completed: 2026-09-23*

## Self-Check: PASSED

- FOUND: test/mcp-proxy.test.ts, test/gate-engine.test.ts, test/gate-lifecycle.test.ts, .planning/debug/ci02-windows-alpha-aos-host-leak.md
- FOUND commits: ac67ffc, 8f17c7e, c3e68df, d9e044a, 7a3ee28, 82a5ccf, e259d4f
