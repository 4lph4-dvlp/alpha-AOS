---
gsd_state_version: 1.0
milestone: v0.1.0
current_phase: 01
current_phase_name: Safe Operation Boundary
status: executing
stopped_at: Completed 01-26-PLAN.md
last_updated: "2026-09-06T17:08:02.227Z"
last_activity: 2026-09-06
last_activity_desc: "01-26 executed: three-OS gate observed at run 34046336104 - RC-5 repaired on windows-latest, ubuntu entrypoint asymmetry found, G-01-1 still open"
state_head: 2b33e2a2c23d82679f0dd6f7ca1ff32b9f298d96
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 26
  completed_plans: 26
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-03)

**Core value:** A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.
**Current focus:** Phase 01 — Safe Operation Boundary

## Current Position

Phase: 01 (Safe Operation Boundary) — EXECUTING
Plan: 26 of 26 complete (01-01..01-26 all have summaries)
Status: All 26 plans executed, but G-01-1 is STILL OPEN — run 34046336104 is 2-of-3 (ubuntu-latest red at `Safety boundary suites`). Phase verification stays blocked; a new gap-closure cycle is needed for the ubuntu entrypoint asymmetry.
Last activity: 2026-09-06 — 01-26 executed: three-OS acceptance gate observed, RC-5 confirmed repaired on windows-latest, new ubuntu-only entrypoint asymmetry recorded

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: Not started

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P17 | 33 min | 3 tasks | 5 files |
| Phase 01 P18 | 22 min | 2 tasks | 3 files |
| Phase 01 P19 | 11 min | 2 tasks | 2 files |
| Phase 01 P20 | 7 min | 2 tasks | 2 files |
| Phase 01 P21 | 40 min | 3 tasks | 6 files |
| Phase 01 P22 | 32 min | 2 tasks | 2 files |
| Phase 01 P23 | 22 min | 2 tasks | 0 files |
| Phase 01 P24 | 36 min | 2 tasks | 3 files |
| Phase 01 P25 | 14 min | 2 tasks | 2 files |
| Phase 01 P26 | 17 min | 3 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- [Roadmap]: Treat the existing 38-test green baseline and CURRENT global stack as foundations, not completed phase work.
- [Phase 3]: Optional capabilities use native intent-driven selection; alpha-AOS owns deterministic scope, provenance, and verification rather than proxying calls.
- [Phase 4]: GSD Core `standard` remains the sole lifecycle and `.planning/` writer; Hermes and other harnesses are workers.
- [Phase 5]: `off` is inherited by a directory tree until a nested override and must work through ordinary entrypoints before global context loads; late detection triggers a clean restart.
- [Phase 5]: `off` excludes alpha-AOS-managed and other user-global customization but allows repository-local user-owned resources; `sealed` remains v2 and fail-closed.
- [Phase 01]: [01-17]: `openProtocolProcess` closes the SAFE-06 protocol gap; the MCP fixture reaches its JSON-RPC child only through the bounded adapter and the direct-spawn carve-out in test/process.test.ts is retired. — The fixture accumulated stdout with no byte cap, the one property `unbounded child output is capped and reported as capped` proves for every other child. A 1 MiB per-frame cap now terminates the child tree instead of growing a buffer.
- [Phase 01]: [01-17]: A long-lived session is never exempt from a bound - `timeoutMs: 0` disables only the absolute ceiling, and the per-frame cap plus forced close-time termination stay in force. — Recorded as a flagged SAFE-06 prohibition by the plan with status `unverified`; no named test covered it, so one was added (deviation Rule 2) rather than shipping it unproven.
- [Phase 01]: BoundedStdioTransport has no fallback to an unbounded transport: an unstartable bounded session is a refusal — A fallback branch would make the byte cap, environment allowlist and stderr redaction advisory rather than operative, so send() on a transport with no session throws instead of degrading.
- [Phase 01]: JSON-RPC message validity stays delegated to the MCP SDK JSONRPCMessageSchema — alpha-AOS owns the process boundary and the byte bound; minting a project-local message-shape prohibition would duplicate canon the SDK already maintains and would rot against SDK versions.
- [Phase 01]: The mcp-proxy.ts to redaction.ts key link was dropped rather than retargeted — After the transport swap the proxy performs no redaction; the session does. A type-only edge to ../types.js is already compiler-enforced, so keeping the link would assert nothing a grep could see that the build cannot.
- [Phase 01]: [01-19]: canonicalizeWithMissingTail is the single canonical form for every containment operand; classifyComponent keeps its own resolution call because it records a component's own identity, not a comparison operand — The target was canonicalized through its deepest existing ancestor while the allowed root got a bare realpath whose catch left an unresolved string, so withinRoot compared a resolved path against an unresolved one and refused legitimate operations. Routing component identity through the same helper would add a permanently dead missing-tail branch and a third apparent resolution site.
- [Phase 01]: [01-19]: not existing and not being readable are different facts - ENOENT continues the ancestor walk, every other errno becomes an unprovable-filesystem refusal carrying a reason — Without that split, walking up to a shallower ancestor would itself be a silent catch by another name. A dangling link (lstat ok, realpath ENOENT) keeps today's meaning and today's value.
- [Phase 01]: [01-20]: The platform environment floor is a pure function of the platform name, not a `process.platform` constant initializer — A constant keyed on the running host makes a macOS-only regression unobservable until a macOS host runs it. Making the platform an argument puts the declaration itself under test from any host, while the runtime exact-match assertion stays the separate authority for whether the declaration is true.
- [Phase 01]: [01-20]: The darwin floor names exactly `__CF_USER_TEXT_ENCODING` and nothing speculative, and the name stays in the floor rather than in a per-child allowlist — The runtime assertion is an exact deepEqual, so an over-declared floor is as wrong as an under-declared one. Adding the name to NODE_RUNTIME_ENVIRONMENT_NAMES or UPSTREAM_ENVIRONMENT_NAMES would have silenced the failure while making an OS-injected name read as operation-approved, collapsing the distinction between the floor and the allowlist. Its value's first field is the caller's numeric UID, so it is documented as user-identifying alongside USERNAME, USERPROFILE and HOMEPATH.
- [Phase 01]: [01-21]: The managed-install plan builder reads the global npm root off disk instead of spawning `npm root --global`; an unresolvable root is recorded as `unverified` and never as `current`. — npm writes a debug log into its cache for every invocation including a read-only query, and on POSIX the cache default is always home-derived, so the probe made every preview write to the user's home. D-01 makes the unverified branch plan the install; installEccRuntime re-probes authoritatively at apply and no-ops when the locked version is already installed. No .npmrc parser was built - knowing an effective prefix means running npm - so 01-23 will measure how often real hosts land on `unverified`.
- [Phase 01]: [01-21]: A child launched for a read-only query gets a declared environment, and the names that decide where it writes are pinned outside the user's home rather than inherited. — readCommandVersion passed no env to spawnSync, so `hermes --version` during harness detection inherited LOCALAPPDATA and bootstrapped fifteen entries under it - a second, independent SAFE-01/SAFE-06 violation the old ambient-spread oracle could not see. commandProbeEnvironment and npmProbeEnvironment both remove the name from the passthrough list AND pin it as a literal; HOME/USERPROFILE stay passed through because redirecting them would trade a write violation for a wrong answer about what is installed.
- [Phase 01]: [01-21]: `npm test` now runs through scripts/run-tests.mjs, which strips npm's lifecycle injection so the primary gate and the CI `Safety boundary suites` step share one environment. — CI run 33937610401 reported `npm test` green at 190/0 while the same job's bare `node --test` step failed four suites, because npm injected 22 names including npm_config_cache. The runner also fails loudly on an empty compiled test set, closing the shell-glob hazard where a suite that stopped being built looked green.
- [Phase 01]: [01-22]: Descendant termination is judged only by positive terminal evidence; a stalled heartbeat and an unreadable one both classify as indeterminate rather than terminated. — The failure was load-induced on the ubuntu ten-file leg. A staleness rule would report a live descendant starved of CPU as terminated, converting a flaky red into a flaky green on a safety boundary. A deadline reached without terminal evidence returns terminated:false, which reads as "could not prove it stopped" and fails the assertion.
- [Phase 01]: [01-22]: A torn heartbeat read is no evidence (null) and can never become a foreign nonce (false); publish-by-rename and strict full-line parsing are two independent closures over the same hazard. — A reader landing mid-write would see a first token that is not our nonce, fire the foreign-nonce rule, and report a live, actively-writing descendant as terminated - load-sensitive in exactly RC-4's way. parseHeartbeatLine requires a newline terminator, so heartbeatNonceMatches:false is reachable only from a complete line whose nonce token differs.
- [Phase 01]: [01-22]: close() states what it guarantees and what it only signals, and killTree reports its delivery path into ProcessResult.treeTermination instead of discarding it. — close() resolves on the direct child's close event with the whole group already signalled; reaping is explicitly not awaited because a grandchild is not a waitpid target. The POSIX/Windows asymmetry is deliberate and written down. Two tests assert a real "group" delivery, so a silent fallback to signalling the direct child alone is visible rather than indistinguishable from success.
- [Phase 01]: [01-23]: Gap G-01-1 is NOT closed. CI run 33984247757 on 403e017 returned ubuntu-latest and macos-latest green on all four steps and windows-latest red at `Safety boundary suites`. — The plan's own prohibition makes an observed three-green-leg run the only closing evidence, so two green legs is not closure. RC-1..RC-4 are observably closed on the platforms that own them - the ubuntu step that reported 109/4 in run 33937610401 now reports fail 0, and the windows/macOS npm test legs that died at 46 and 50 failures are green at 202.
- [Phase 01]: [01-23]: The darwin platform floor is confirmed as exactly `__CF_USER_TEXT_ENCODING` against a real macOS host; the macOS RC-3 prediction is recorded as not verifiable from this run rather than upgraded by a green leg. — The runtime assertion is an exact deepEqual, so an over-declared floor fails it as surely as an under-declared one; it passed on macos-latest in both the npm test and ten-file steps, so 01-20's branch needs no widening. Prediction 1 cannot be decided by a green run because run 33937610401's macOS leg died at npm test and never reached the step where RC-3 manifested - recording the non-answer is the honest result.
- [Phase 01]: `--files` on scripts/run-tests.mjs is terminal: flags before, paths after, order preserved; a named-but-unbuilt path is a loud failure naming every missing path — A shell glob that expands to nothing exits 0 and a suite that stops being compiled goes quietly absent; an explicit list that names a missing file must be red on every leg instead
- [Phase 01]: The runner-environment invariant's singleton lookup is case-folded and `init_cwd` joins it in lowercase, aligning all three injection loci — Adding INIT_CWD uppercase to a case-sensitive list would make the invariant catch one spelling and miss the other - the same near-miss class RC-5 already took once. Case-folding is strictly a strengthening: every name caught before is still caught
- [Phase 01]: [01-26]: Gap G-01-1 is NOT closed. Observed run 34046336104 (head 8c04c5f) returned macos-latest and windows-latest green on all four steps and ubuntu-latest red at `Safety boundary suites` on `a timed-out command leaves no descendant process behind`. — Two of three green legs is not closure; the closing evidence is one run id whose three legs are all green in that same run. RC-5 IS confirmed repaired - the windows-latest routed step shows `the test runner environment carries no npm lifecycle injection` as a pass rather than absent - but the ubuntu leg regressed at a different seam.
- [Phase 01]: [01-26]: The ubuntu red cell is recorded as an entrypoint asymmetry, not diagnosed and not explained away as cosmetic. Ledger entries #2/#3/#4 were left OPEN even though this run produced their evidence lines, because the plan's disposition rule is `if and only if state (b)` and this execution is state (c). — The identical compiled test dist/test/process.test.js:187 passed in the same ubuntu job's `npm test` step and failed in the routed `Safety boundary suites` step - same commit, same file, two invocations. `actual: true` means a descendant process was actually alive after a 1500ms timeout, so it is a real SAFE-06 containment fact rather than a meta-test. Closing Broken Windows on a run that did not go green is the reasoning pattern this phase's prohibitions exist to prevent, so the evidence was transcribed into 01-26-SUMMARY.md for a one-step close next cycle instead.

### Pending Todos

None yet.

### Blockers/Concerns

- `project sync --apply` is currently blocked; no project-pack phase is complete.
- Full uninstall, external-package compensation, and interrupted-operation recovery are absent.
- Ordinary-entrypoint tree-off suppression remains version- and surface-sensitive and must report unsupported unless exclusion is proven before load.
- `catalog/candidate.lock.json` is currently included by `npm pack`, blocking REL-05 until the release allowlist is corrected. Not phase 1 scope.
- Resolved by 01-16 (2026-09-04): all four wrappers verify a build artifact and delegate to `alpha-aos bootstrap`; a source-level test fails any wrapper that runs `npm` or `git` itself. The Wave 0 SAFE-01 tracer is green.
- Resolved by 01-09 (2026-09-04): `src/core/transaction.ts` now proves every path role and rechecks the ancestor chain immediately before each mutation.
- Resolved 2026-09-04: `smol-toml@1.8.0` approved at the 01-04 gate, bound to `sha512-kCZr2V3ch9i00x8zXRhjUNVcjG9ijES5dDudkXvUVCT5QlJNQWElSJdZqyPemffHoLNUYwOcou0Fy+ojN0uHSQ==`; plan 01-05 must verify that integrity before writing the lock.
- Resolved by 01-08 (2026-09-04): `src/core/process.ts` is shell-free, allowlisted, deadline-bound and output-capped; interpreted shims without a proven direct equivalent are reported unsupported.
- Phases 3–6 require targeted exact-version research for harness discovery, GSD gate contracts, preload isolation, and package recovery.
- Resolved by 01-06 (2026-09-04): the stack, lock and project-manifest schemas are closed and are now the loaders' source of truth. The remaining operational and native schemas are plan 01-10.
- Open from 01-08, 01-11 and 01-14: `openProtocolProcess` is unbuilt. The MCP filter proxy still uses the SDK's own StdioClientTransport, and `mcp-fixture.ts` still spawns its JSON-RPC child directly (named as an asserted exception in test/process.test.ts). No plan in phase 1 now owns it.
- Resolved by 01-14 (2026-09-04): the fixture plan/execute split exists; a fixture asserts the authorizing session is open before it touches the disk, and writes only inside the root its plan named.
- Resolved by 01-12 (2026-09-04): `src/core/gsd-compat.ts` and `src/core/ecc-skills.ts` publish complete reviewed plans and consume a standalone or caller-supplied `MutationSession`; the shared contract is `src/core/component-session.ts`, which 01-13 should import rather than restate.
- Resolved by 01-14 (2026-09-04): a session allocates a journal id per transaction, and `planWriterRepair` reads every journal an operation wrote.
- Resolved by 01-14 (2026-09-04): all three fixtures publish a plan that names their root before it exists, so no fixture calls `mkdtemp` and ECC skill sync binds its source paths at review time.
- Resolved by 01-13 (2026-09-04): MCP sync, owned skills, the Claude skill policy, the isolation manifest and runtime, the isolated-runtime clean and candidate staging all publish complete plans and consume a standalone or caller `MutationSession` through `src/core/component-session.ts`.
- Open from 01-13: `cleanIsolationRuntime` journals and snapshots every file removal, but the trailing `rmdir` calls are not journaled intents. An interruption between the transaction and the last `rmdir` leaves empty directories behind a completed journal.
- Resolved by 01-16 (2026-09-04): `scripts/build-artifact.mjs write|check` exists and `npm run build` writes the manifest, so a bootstrap plan verifies real provenance instead of blocking.
- Open from 01-14: no end-to-end managed install test exists, because running one would install GSD and ECC globally on the test machine. One session spanning every callee is structurally verified and each callee is separately proven.
- Resolved by 01-15 (2026-09-04): every CLI surface serializes through the redaction seam and doctor states the placeholder contract, so the last open todo in the suite is closed. The suite now has zero todos.
- Open from 01-15: no CLI-level bootstrap apply test exists, because the route runs `npm ci`, `npm run build` and `npm link` against a real checkout. The same apply path is covered directly in `test/install.test.ts` against a fixture repository.
- Superseded 2026-09-05: the macOS/Linux CI leg gap is now formally deferred to Phase 7 by 01-VERIFICATION.md.
- Open from 01-VERIFICATION (2026-09-05): `openProtocolProcess` is an undelivered must-have export of 01-08 and the mechanism behind two of its key links. Two MCP protocol paths sit outside the bounded adapter: `src/core/mcp-fixture.ts` spawns directly and accumulates stdout with no byte cap (stderr is capped, shell off, env allowlisted, 60s deadline), and `src/core/mcp-proxy.ts` still uses the SDK StdioClientTransport. No later roadmap phase names this work, so it is not deferrable on current evidence.
- Deferred to Phase 7 by 01-VERIFICATION (2026-09-05): the end-to-end managed install test and the observed macOS/Linux CI legs, both covered by Phase 7 success criterion 1 (three-OS fixture matrix).
- Windows delivers a floor of environment variables no allowlist can suppress (`PLATFORM_FLOOR_ENVIRONMENT`), three of them user-identifying. Phase 5 must state this rather than imply total control of a project-only launch environment.
- Resolved by 01-17 (2026-09-05): `openProtocolProcess` exists and is exported; `src/core/mcp-fixture.ts` no longer spawns directly and the enumeration carries no carve-out. Still open from 01-VERIFICATION: `src/core/mcp-proxy.ts` uses the SDK StdioClientTransport - owned by plan 01-18, the last of the four `missing` items.
- Open from 01-17 (2026-09-05): the suite baseline is now 185 tests (was 176). Plan 01-18 must raise its own baseline to 185 rather than 176 or 184.
- Open from 01-19 (2026-09-05): the unprovable-filesystem branch for an existing-but-unreadable component or allowed root (EACCES/EPERM/ELOOP/EIO) is compiler-checked at both classifyComponent call sites but has no automated coverage - an unreadable-but-existing fixture needs privileged or platform-specific setup. Tracked as coverage D4 in 01-19-SUMMARY.md with human_judgment: true.
- Open from 01-19 (2026-09-05): the suite baseline is now 195 tests (fail 0, 2 pre-existing platform skips). Plan 01-20 must raise its own baseline to 195 rather than the 190/191 figures earlier plans quote.
- Open from 01-20 (2026-09-05): the suite baseline is now 196 tests (fail 0, 2 pre-existing platform skips). Plan 01-21 must raise its own baseline to 196 rather than 195. Whether `__CF_USER_TEXT_ENCODING` is the complete darwin floor is still unproven on this host - only the macos-latest leg of the three-OS matrix owned by 01-23 can answer it, and if it reports a second injected name the floor is extended to match observation.
- Open from 01-21 (2026-09-05): the suite baseline is now 200 tests (fail 0, 2 pre-existing platform skips). Plan 01-22 must raise its own baseline to 200 rather than 196. `npm test` now means `npm run build && node scripts/run-tests.mjs`, so any plan reasoning about the primary gate must read the runner rather than a shell glob. commandProbeEnvironment's passthrough set is proven on Windows only - coverage D5 in 01-21-SUMMARY.md is human_judgment:true, and if a CI leg reports a harness version that went null, the passthrough set is what to widen, not the pin. Gap G-01-1 is not authoritatively closed until the three-OS matrix is green; 01-23 checks the two falsifiable predictions.
- Open from 01-22 (2026-09-05): the suite baseline is now 202 tests (fail 0, 2 pre-existing platform skips). Plan 01-23 must raise its own baseline to 202. Gap G-01-1 is still not authoritatively closed - RC-4 is load-dependent and POSIX-only and never reproduced on this Windows host even under the exact ten-file command, so the authoritative verification is the green three-OS matrix 01-23 owns. Two falsifiable predictions for the ubuntu leg: the descendant failure message now carries evidence/observedMs/lastCounter/advanced, which distinguishes "the tree really was not terminated" from "the oracle is still mis-instrumented"; and result.treeTermination should read "group" on both POSIX legs, so a "direct" or "not-required" there is new information about the product rather than the test.
- Open from 01-23 (2026-09-05): RC-5 blocks phase verification. windows-latest fails `Safety boundary suites` on `the test runner environment carries no npm lifecycle injection` with actual ['npm_config_prefix'], expected []. The windows-2025-vs2026 runner image sets npm_config_prefix machine-wide, so scripts/run-tests.mjs strips it under `npm test` while the bare `node --test` CI step sees it - the exact invocation divergence that invariant forbids. 01-21's stated goal of one shared environment was applied to package.json but never to .github/workflows/ci.yml. The repair is not mechanical: run-tests.mjs enumerates all dist/test/*.test.js itself and treats argv as flags, so it cannot express the ten-file subset today, and any fix must keep npm_config_prefix a legitimate input to resolveGlobalNodeModulesRoot (src/core/install.ts:294). 01-VALIDATION.md requires a fully green three-OS suite before /gsd-verify-work, so phase 1 verification is blocked until a new run id shows three green legs.
- Open from 01-26 (2026-09-06): G-01-1 is STILL OPEN and phase 1 verification stays blocked. Observed run 34046336104 (head 8c04c5f) is 2-of-3: macos-latest and windows-latest green on all four steps, ubuntu-latest red at `Safety boundary suites`. RC-5 is closed - the windows leg shows `the test runner environment carries no npm lifecycle injection` PASSING inside the routed step. The new red cell is an entrypoint asymmetry on ubuntu: `a timed-out command leaves no descendant process behind` (dist/test/process.test.js:187, source test/process.test.ts:298) passes under `npm test` and fails under the routed `Safety boundary suites` step in the SAME job, same commit, same compiled file, with `actual: true` meaning a descendant was really alive after the 1500ms timeout. The two invocations differ only in file set (self-enumerated full suite vs the ten named files) and parent chain (`npm run` wrapper vs bare node). Do NOT diagnose it by reverting 01-24's routing - that reinstates RC-5 on windows-latest. Baselines for the next plan: `npm test` 208 tests, `Safety boundary suites` 131 tests. Ledger entries #2/#3/#4 have their closing evidence lines already transcribed in 01-26-SUMMARY.md and close in one step on the next state-(b) run.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Isolation | OS/container-backed `sealed` mode | Deferred | Roadmap creation | v2 |

## Session Continuity

Last session: 2026-09-06T17:08:02.129Z
Stopped at: Completed 01-26-PLAN.md
Resume file: None
