---
phase: 01-safe-operation-boundary
plan: 21
subsystem: infra
tags: [npm, process-environment, preview-safety, node-test-runner, sandbox-oracle]

requires:
  - phase: 01-safe-operation-boundary
    provides: "01-17/01-18 bounded child-process boundary (`runProcess`, `EnvironmentPolicy`, `materializeEnvironment`); 01-20 `platformFloorEnvironment` as a pure function over a named platform"
provides:
  - "`scripts/run-tests.mjs`: a test runner that strips npm's lifecycle injection so `npm test` and the bare CI `node --test` step hand the test process the same environment, and that fails loudly on an empty compiled test set"
  - "`resolveGlobalNodeModulesRoot` / `readGlobalPackageVersion`: spawn-free global-runtime inspection for plan builders, with an explicit `unverified` state that can never read as `current`"
  - "`npmProbeEnvironment`: a pinned cache and suppressed logs for the one npm child that survives, on the apply path only"
  - "`commandProbeEnvironment`: version-detection probes no longer inherit the ambient environment; the names that decide where a probe writes are pinned outside the user's home"
  - "A preview sandbox built from an explicit environment allowlist, with LOCALAPPDATA/APPDATA/XDG_* redirected into the observed home surface"
affects: [01-22, 01-23, three-OS CI matrix, any future plan builder that wants to ask an external tool a question]

actuals:
  tokens: 5638
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "A read-only probe declares where it is allowed to write; the caller's environment never decides it"
    - "A plan builder reads the filesystem; only the apply path is allowed to launch a child"
    - "An oracle's sandbox is built from an allowlist, not from a spread of the ambient environment"
    - "RED and GREEN live in separate commits, and a `<verify>` gate re-creates the RED state to prove the product change caused the green"

key-files:
  created:
    - scripts/run-tests.mjs
  modified:
    - package.json
    - src/core/install.ts
    - src/core/process.ts
    - test/preview.test.ts
    - test/install.test.ts

key-decisions:
  - "The plan builder records `unverified` rather than guessing a global npm root; D-01 makes the unverified branch plan the install, never claim `current`"
  - "No `.npmrc` parser was built. Knowing an effective `prefix` means running npm, so the honest answer is `unverified` and plan 01-23 measures how often real hosts land there"
  - "`HOME`/`USERPROFILE` stay passed through to a version probe; redirecting them would trade a write violation for a lie about what was detected"
  - "The region-slice control is bounded by the builder's own closing brace, not by the plan's `next \\nexport` rule, which over-ran into apply-time helpers that are supposed to spawn"

patterns-established:
  - "Probe environment policies: `npmProbeEnvironment` and `commandProbeEnvironment` both remove a name from the passthrough list AND pin it as a literal, so the allowlist never reads as though the value were inherited"
  - "Source-region negative controls carry a positive control and a minimum-length guard, so a broken slice fails rather than passing vacuously"

requirements-completed: [SAFE-01, SAFE-06]

coverage:
  - id: D1
    description: "`alpha-aos install` and `bootstrap install` without `--apply` create nothing under the user's home; the managed-install plan builder launches no child"
    requirement: SAFE-01
    verification:
      - kind: e2e
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical"
        status: pass
      - kind: e2e
        ref: "test/preview.test.ts#two concurrent previews neither collide nor create shared state"
        status: pass
      - kind: e2e
        ref: "test/preview.test.ts#install and update wrappers preview without mutating either shell family"
        status: pass
      - kind: unit
        ref: "test/install.test.ts#the managed install plan builder does not spawn to learn the global npm root"
        status: pass
    human_judgment: false
  - id: D2
    description: "The preview oracle reaches its verdict from the sandbox alone: no ambient environment is spread into the child, and LOCALAPPDATA/APPDATA/XDG_* are redirected into the observed home surface"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "test/preview.test.ts#createSandbox self-assertion that npm_config_prefix is the only npm_config_* name"
        status: pass
      - kind: other
        ref: "git checkout HEAD~1 -- src/core/install.ts && npm run build && node --test --test-name-pattern 'five mutation surfaces byte-identical' (must fail)"
        status: pass
    human_judgment: false
  - id: D3
    description: "`npm test` and the CI `Safety boundary suites` step give the test process the same environment, and a test says so"
    requirement: SAFE-01
    verification:
      - kind: unit
        ref: "test/preview.test.ts#the test runner environment carries no npm lifecycle injection"
        status: pass
      - kind: other
        ref: "npm exec -- node --test --test-name-pattern 'no npm lifecycle injection' dist/test/preview.test.js (must fail)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A read-only npm probe writes into an alpha-AOS-owned location outside the user's home, and no inherited name can move it"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/install.test.ts#a read-only npm probe cannot have its write location decided by the caller"
        status: pass
    human_judgment: false
  - id: D5
    description: "A version-detection probe no longer inherits the ambient environment; `hermes --version` bootstraps into an alpha-AOS-owned probe root instead of the user's LOCALAPPDATA"
    requirement: SAFE-06
    verification:
      - kind: e2e
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical"
        status: pass
    human_judgment: true
    rationale: "The suite proves the sandbox home stays byte-identical, which is the contract. It does not prove that `commandProbeEnvironment` is the right passthrough set for every harness on every OS — `codex` and `pi` already report a null version on this host for unrelated shim reasons, and only the three-OS matrix in 01-23 can show whether detection degrades anywhere. Claude 2.1.261, antigravity 1.1.23, hermes v0.20.6 and npm 11.8.0 were all re-checked by hand on this host and are unchanged."
  - id: D6
    description: "The byte-identical entry-point enumeration executably includes both plan-builder callers"
    requirement: SAFE-01
    verification:
      - kind: unit
        ref: "test/install.test.ts#the byte-identical entry points include both plan-builder callers"
        status: pass
    human_judgment: false
  - id: D7
    description: "An empty compiled test set is a loud failure rather than a silent green"
    requirement: SAFE-01
    verification:
      - kind: manual_procedural
        ref: "scripts/run-tests.mjs copied into an empty tree: stderr `no compiled test files found in dist/test`, exit 1"
        status: pass
    human_judgment: false

duration: 40 min
completed: 2026-09-05
status: complete
---

# Phase 01 Plan 21: Preview Home-Write Closure Summary

**`alpha-aos install` no longer writes to the user's home in preview form — the managed-install plan builder reads the global npm root off disk instead of spawning `npm root --global`, version-detection probes stopped inheriting the environment that decided where they write, and the test oracle that hid all of it now builds its sandbox from an explicit allowlist.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-09-05T16:54:17Z
- **Completed:** 2026-09-05T17:34:34Z
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- **Closed gap `G-01-1` RC-3.** The `ecc:runtime` step of `createManagedInstallPlan` called `npm root --global` unconditionally, with no `--apply`. npm writes `<cache>/_logs/<ts>-debug-0.log` for every invocation including a read-only query, and on POSIX the cache default is always home-derived. A Linux or macOS user previewing an install got a file in their home. That spawn is gone from the builder.
- **Closed a second, independent home write the hardened oracle exposed.** `readCommandVersion` passed no `env` to `spawnSync`, so `hermes --version` — run during harness detection, on every preview — inherited the ambient environment and bootstrapped fifteen entries under `%LOCALAPPDATA%\hermes`. Proven causal by removing the hermes bin directory from `PATH`: the write disappears.
- **Made the primary gate honest.** `npm test` ran the suite inside npm's lifecycle, which injected 22 names including `npm_config_cache`. That is exactly why CI run 33937610401 reported `npm test` green while the same job's `Safety boundary suites` step, running the same compiled files, reported four failures. `scripts/run-tests.mjs` strips the injection, and a test now asserts the absence under both entry points.
- **Proved the fix rather than attesting it.** Task 2's RED and GREEN are separate commits, and a `<verify>` gate puts the pre-fix `src/core/install.ts` back beside the hardened oracle, rebuilds, and requires the byte-identical assertion to fail. It did.

## Task Commits

1. **Task 1: run the suite outside the npm lifecycle** — `aaf62eb` (test, RED) → `5c633ff` (fix, GREEN)
2. **Task 2: allowlist sandbox, then remove the plan builder's spawn** — `eea38fb` (test, RED — `test/preview.test.ts` only) → `ee79131` (fix, GREEN — no test file touched)
3. **Task 3: pin the npm probe write location and the spawn-free plan builder** — `9ac5385` (test)

## Files Created/Modified

- `scripts/run-tests.mjs` (new) — Enumerates `dist/test/*.test.js` itself, strips every `npm_(config|package|lifecycle)_` name plus `npm_execpath`/`npm_command`/`npm_node_execpath`, spawns `node --test` with the scrubbed environment, forwards extra arguments, inherits the child's exit code, and exits 1 with a stated reason on an empty test set.
- `package.json` — `scripts.test` is now `npm run build && node scripts/run-tests.mjs`.
- `src/core/install.ts` — `globalNpmPackageVersion` renamed to `probeGlobalNpmPackageVersion` (both remaining callers are inside `installEccRuntime`, on the apply path); new `resolveGlobalNodeModulesRoot`, `readGlobalPackageVersion` and `npmProbeEnvironment`; `createManagedInstallPlan` now reads instead of spawning and carries an `unverified` branch.
- `src/core/process.ts` — new `commandProbeEnvironment`; `readCommandVersion` and the npm branch of `probeCommand` now materialize it instead of inheriting `process.env`.
- `test/preview.test.ts` — `SANDBOX_ENVIRONMENT_PASSTHROUGH` allowlist replaces the `...process.env` spread; LOCALAPPDATA, APPDATA and the four XDG_* roots are redirected into the observed home; `createSandbox` asserts its own soundness; new runner-environment invariant test.
- `test/install.test.ts` — three new tests (probe write-location policy, region-scoped spawn-free control, entry-point enumeration).

## Decisions Made

- **An unresolvable global root is `unverified`, and `unverified` plans the install.** D-01 says fail closed with inspection preserved. The safe side here is planning an install that `installEccRuntime` will no-op if the runtime is already at the locked version, not claiming `current` on the strength of a probe that never ran.
- **No `.npmrc` parser.** A user `prefix` set in `.npmrc` is only knowable by running npm. Rather than guess, the doc comment states the limit plainly: nvm/volta/`.npmrc`-prefix users will always see `unverified` in a preview, and plan 01-23 records how often that actually happens across this host and the three CI legs. That measurement, not a guess, is the input to deciding whether the parser is worth building.
- **`HOME`/`USERPROFILE` are passed through to version probes; the data-root names are not.** A version probe legitimately reads user configuration to answer. Redirecting the home would trade a write violation for a wrong answer about what is installed — and detection is what every downstream plan step is built on. The names that decide where a probe *writes* (LOCALAPPDATA, APPDATA, XDG_*, npm cache) are pinned to `<tmp>/alpha-aos-command-probe`.
- **Both probe policies remove a name from the passthrough list *and* pin it as a literal.** The literal alone wins, since `materializeEnvironment` applies literals last. Leaving the name in the passthrough list would read as though the value were inherited, and an allowlist that lies about what it forwards is worse than no allowlist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical safety control] Version-detection probes inherited the environment that decides where they write**

- **Found during:** Task 2 (GREEN half)
- **Issue:** With the sandbox rebuilt from an allowlist, `every mutating CLI preview leaves all five mutation surfaces byte-identical` stayed red *after* the npm spawn was removed. The residual write was `AppData/Local/hermes/` — fifteen entries including `SOUL.md` — created by `hermes --version` during harness detection. `readCommandVersion` and the npm branch of `probeCommand` passed no `env` to `spawnSync`, so the child inherited the ambient environment wholesale and `LOCALAPPDATA` decided where it wrote. The old oracle could not see this: it spread the real `LOCALAPPDATA`, so the write landed outside the observed surface. This is prohibition 5 of this plan verbatim (SAFE-06), and on a real machine it means a preview materializes a harness data root in the user's home.
- **Fix:** Added `commandProbeEnvironment` to `src/core/process.ts` — the platform floor plus `PATH`/`PATHEXT`/`COMSPEC`/`HOME`/`USERPROFILE`/temp/locale names passed through, with `LOCALAPPDATA`, `APPDATA`, the four `XDG_*` roots, `npm_config_cache` and `npm_config_logs_max` pinned into `<tmp>/alpha-aos-command-probe`. Both probe spawns materialize it.
- **Files modified:** `src/core/process.ts`
- **Verification:** Isolation repro (CLI run against a sandbox home, with and without hermes on `PATH`) went from 15 added entries to 0. The hermes bootstrap tree now appears under `<tmp>/alpha-aos-command-probe/local/hermes`. Version detection re-checked by hand and unchanged: claude 2.1.261, antigravity 1.1.23, hermes v0.20.6, npm 11.8.0; codex and pi remain `null` for the pre-existing `.cmd`-shim reason. `dist/test/preview.test.js` 9/9, `install|update|catalog|process` 49/49.
- **Committed in:** `ee79131` (folded into the Task 2 GREEN commit, because that task is required to produce exactly two commits and the `<verify>` separation gates read `HEAD~1`/`HEAD`)

**2. [Rule 1 - Bug in the plan's own gate] The region-slice rule did not bound the region it claimed**

- **Found during:** Task 3
- **Issue:** The plan specifies slicing from `export async function createManagedInstallPlan(` to the next `\nexport `. Nothing between the builder and the next export is exported — `runDeclared`, `installGsd`, `installEccRuntime`, `installPiBridge` are all module-local — so the slice ran on into `installEccRuntime`, which is *supposed* to call the spawning probe. The negative control failed against correct code.
- **Fix:** Bounded the region by the function's own closing brace at column zero. The slice is now 4269 characters, first line the builder signature, last line its final `};`. The plan's minimum-length guard and positive control are kept unchanged, so a broken slice still fails loudly rather than passing vacuously.
- **Files modified:** `test/install.test.ts`
- **Verification:** `dist/test/install.test.js` 12/12; region asserted to contain `readGlobalPackageVersion` and not `probeGlobalNpmPackageVersion`.
- **Committed in:** `9ac5385`

---

**Total deviations:** 2 auto-fixed (1 × Rule 2 missing critical safety control, 1 × Rule 1 bug).
**Impact on plan:** No scope creep. Deviation 1 was required for Task 2's own `<done>` criterion ("creates nothing in the sandbox home on any platform") and closes a prohibition this plan already declared. Deviation 2 corrected a gate that would otherwise have blocked on correct code. No plan objective was dropped, relaxed, or deferred; `CHECKOUT_IGNORED` and `LAUNCHER_FOOTPRINT` are byte-identical to their pre-task form, and no ignored-prefix list was widened.

## Issues Encountered

None that required problem-solving beyond the two deviations above. The RED window between `eea38fb` and `ee79131` was deliberate and is the reason this plan ran alone in wave 12.

## Verification Results

| Check | Result |
|---|---|
| `npm run check` | exit 0, no output |
| `npm test` | tests 200, pass 198, **fail 0**, skipped 2 — four more than the 196 recorded by `01-20-SUMMARY.md`, which is exactly what this plan adds |
| `node --test dist/test/preview.test.js` | 9/9 pass, **not-run list empty** (both POSIX wrapper families executed; `bash` present) |
| `node --test dist/test/install.test.js update.test.js catalog.test.js process.test.js` | 49/49 pass |
| `npm run build:check` | `build artifact verified: 55 inputs, 104 outputs` |
| Task 1 negative control: `npm exec -- node --test --test-name-pattern "no npm lifecycle injection"` | fails, as required — the invariant is not vacuous |
| Task 2 commit-shape gate: `git diff --name-only HEAD~1 HEAD -- test/preview.test.ts` empty | pass |
| Task 2 commit-shape gate: `git show --name-only --format= HEAD~1` = `test/preview.test.ts` | pass |
| Task 2 separation gate: revert only `src/core/install.ts`, rebuild, byte-identical assertion must fail | **red confirmed** — the green came from the product fix, not the oracle change |
| Empty-test-set guard | `no compiled test files found in dist/test`, exit 1 |

The two commit-shape gates were evaluated immediately after `ee79131`, when it was `HEAD` and `eea38fb` was `HEAD~1`. `9ac5385` now sits on top, so re-running them today reads a different pair; the recorded results above are the ones the plan asked for.

**RED evidence, Task 2.** Before home digest `97742fbec6bfa9bbe36a1517f6d1376cb4c00c432d34622a7a57d9fd61d916cd` — byte-identical to the `expected` digest the ubuntu-latest CI leg reported, which is what makes this the same defect run 33937610401 saw and not a Windows-local artifact. After: `439ccb6c…` (bare `node --test`) / `d3ba48ec…` (`npm test`; the npm log filename carries a timestamp, so only the before digest is stable). checkout, packages, harness and outside identical; state absent.

## Known Stubs

None. No placeholder value, empty-collection default, or unwired component was introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema at a trust boundary. The two new environment policies narrow an existing trust boundary rather than opening one.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for 01-22.**

Carry-forward facts for the next plan:

- **The suite baseline is now 200 tests** (pass 198, fail 0, 2 pre-existing platform skips). Plan 01-22 must raise its own baseline to 200 rather than 196.
- **`npm test` now means `npm run build && node scripts/run-tests.mjs`.** Any plan that reasons about what the primary gate runs must read the runner, not a shell glob. `npm test -- <args>` still forwards.
- **Two predictions in this plan are falsifiable only on the three-OS matrix, and 01-23 owns them.** (1) The ubuntu-latest `Safety boundary suites` step should report pass with `preview.test.js` green and an empty not-run list. (2) macOS should show, and then stop showing, the same home write as Linux; if the macOS leg was already clean on this class before the fix, the RC-3 diagnosis must be revisited rather than quietly accepted.
- **`commandProbeEnvironment`'s passthrough set is proven on Windows only.** Version detection was hand-checked here and is unchanged, but whether that allowlist is sufficient for every harness on Linux and macOS is coverage D5 (`human_judgment: true`). If a leg reports a version that went `null`, the passthrough set is what to widen — not the pin.
- **Local green is necessary but not sufficient** for gap `G-01-1`. The authoritative verification is a green three-OS matrix run.

## Self-Check: PASSED

All six key files verified present on disk. All five task commits verified in `git log --oneline --all`.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-05*
