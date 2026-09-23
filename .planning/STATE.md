---
gsd_state_version: 1.0
milestone: v0.1.1
milestone_name: CI Green & Dependency Promotion
current_phase: 11
current_phase_name: Managed Lifecycle Verification
status: executing
stopped_at: Completed 11-01-PLAN.md
last_updated: "2026-09-23T12:11:59.130Z"
last_activity: 2026-09-23
last_activity_desc: Phase 11 execution started
state_head: dd54d88fd4cc31c9204797d014f9a3b0d6090419
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 11
  completed_plans: 5
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-23)

**Core value:** A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.
**Current focus:** Phase 11 — Managed Lifecycle Verification

## Current Position

Phase: 11 (Managed Lifecycle Verification) — EXECUTING
Plan: 2 of 7
Status: Ready to execute
Last activity: 2026-09-23 — Phase 11 execution started

Progress: [███░░░░░░░] 25% (1/4 phases)

## Performance Metrics

**Velocity:**

- Total plans completed: 51
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 27 | - | - |
| 2 | 16 | - | - |
| 4 | 4 | - | - |
| 10 | 4 | - | - |

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
| Phase 01 P27 | 63 min | 3 tasks | 4 files |
| Phase 02 P01 | 18 min | 2 tasks | 11 files |
| Phase 02 P02 | 18 min | 3 tasks | 7 files |
| Phase 02 P03 | 15 min | 2 tasks | 4 files |
| Phase 02 P04 | 30 min | 3 tasks | 5 files |
| Phase 02 P05 | 38 min | 3 tasks | 3 files |
| Phase 02 P06 | 35 min | 3 tasks | 8 files |
| Phase 02 P07 | 52 min | 3 tasks | 11 files |
| Phase 02 P08 | 28 min | 3 tasks | 5 files |
| Phase 02 P09 | 40 min | 3 tasks | 6 files |
| Phase 02 P10 | 118 min | 3 tasks | 7 files |
| Phase 02 P11 | 45 min | 3 tasks | 4 files |
| Phase 02 P12 | 56 min | 3 tasks | 11 files |
| Phase 02 P13 | 1h 47m | 3 tasks | 6 files |
| Phase 02 P14 | 68 min | 3 tasks | 8 files |
| Phase 02 P15 | 62 min | 2 tasks | 6 files |
| Phase 02 P16 | 5h 24m | 2 tasks | 8 files |
| Phase 03 P01 | 39 min | 3 tasks | 7 files |
| Phase 03 P02 | 41 min | 3 tasks | 3 files |
| Phase 03 P03 | 26 min | 3 tasks | 5 files |
| Phase 03 P04 | 39 min | 3 tasks | 5 files |
| Phase 03 P05 | 36 min | 3 tasks | 5 files |
| Phase 03 P06 | 46 min | 3 tasks | 8 files |
| Phase 03 P07 | 9 min | 1 tasks | 0 files |
| Phase 03 P08 | 60 min | 3 tasks | 11 files |
| Phase 03 P09 | 81 min | 3 tasks | 7 files |
| Phase 03 P10 | 66 min | 3 tasks | 6 files |
| Phase 03 P11 | 63 min | 3 tasks | 8 files |
| Phase 03 P12 | 68 min | 3 tasks | 9 files |
| Phase 03 P14 | 17min | 2 tasks | 4 files |
| Phase 03 P15 | 11min | 2 tasks | 4 files |
| Phase 03 P16 | 5h 35m | 2 tasks | 7 files |
| Phase 03 P17 | 19min | 2 tasks | 3 files |
| Phase 03 P18 | 19min | 2 tasks | 5 files |
| Phase 03 P19 | 15 min | 2 tasks | 4 files |
| Phase 03 P20 | 15 min | 2 tasks | 5 files |
| Phase 03 P21 | 20 min | 2 tasks | 4 files |
| Phase 03 P22 | 20 min | 2 tasks | 3 files |
| Phase 07 P01 | 39min | 2 tasks | 6 files |
| Phase 07 P02 | 24min | 2 tasks | 7 files |
| Phase 07 P03 | 20min | 2 tasks | 4 files |
| Phase 07 P04 | 1h 15m | 2 tasks | 8 files |
| Phase 10 P01 | 6 min | 2 tasks | 4 files |
| Phase 10 P02 | 8 min | 2 tasks | 4 files |
| Phase 10 P04 | 13 min | 2 tasks | 2 files |
| Phase 11 P01 | 25 min | 3 tasks | 12 files |

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
- [Phase 01]: [01-27]: Gap G-01-1 is CLOSED on CI run 34051628180 (head 25b5434, conclusion success) — one run id whose three legs are all green in that same run, with the descendant termination diagnostic transcribed from all three legs including the green ones. — Every leg reports terminal evidence "esrch" with treeTermination "group" on both POSIX legs and "windows-tree" on win32, terminated:true, advanced:false, heartbeatNonceMatches:true — the descendant pid was wholly gone rather than an unreaped zombie. npm test is exactly 208 tests fail 0 and Safety boundary suites exactly 131 tests fail 0 on all three legs. No leg was individually re-run and no leg was stitched in from another run.
- [Phase 01]: [01-27]: The 01-26 ubuntu-latest red cell was an INVALID INSTRUMENT, not a SAFE-06 containment defect; 01-26-SUMMARY.md's reading that the descendant was "actually still alive" is corrected rather than inherited. — The judgment was a single bare process.kill(descendantPid, 0), which succeeds against a zombie as well as a running process — the product's own close() contract at src/core/process.ts:690-699 already named that probe invalid. With the shared oracle in test/helpers/termination-oracle.ts the same code path now reports esrch on all three legs in both entrypoints, and the npm-test-vs-routed-step asymmetry is gone. What remains a HYPOTHESIS, deliberately not recorded as established cause, is why that invalid instrument tipped on that particular ubuntu run.
- [Phase 01]: [01-27]: Broken Windows ledger disposed strictly on observed per-leg evidence — #7, #2, #3 and #4 marked fixed on run 34051628180; #5 and #6 left open with what each awaits stated. — #2 closed because BOTH POSIX legs reported the three EACCES fixtures executed and passing rather than not-run (their path-boundary not-run array holds only unknown-reparse); #3 because macos-latest passed the darwin floor exact-match assertion in both entrypoints; #4 because all nine probed commands across three legs returned a non-null version with a null unsupportedReason. #5 awaits a permanent suite test for the --files loud-failure paths and #6 is reachable only through a TOCTOU race — neither is a question a green matrix can answer, so no disposition rule was invented for them.
- [Phase 01]: [01-27]: The file-symlink escape canary DID execute and pass on windows-latest, contradicting the plan's premise that no CI leg can produce that evidence — recorded as an observation, not promoted, and handed to the verifier. — `a file link that escapes the allowed root is refused for both write and removal` is green in BOTH windows-latest entrypoints and escape-file-link is absent from that leg's path-boundary not-run array, so the GitHub windows image permits file symlink creation where the developer host does not. The plan (inheriting 01-26's developer-host reading) assumed the opposite. 01-UAT.md is outside this plan's files_modified and whether a CI Windows host satisfies the canary is a judgment call, so item 3 was NOT promoted here.
- [Phase 02]: [02-01]: canonicalizeWithMissingTail is exported and reused for the project root rather than the root being routed through provePathBoundary — A canonical project root has no outer allowed root to be proven against, so provePathBoundary cannot express it. Re-deriving a second canonical form is exactly the 01-19 asymmetry. The export changes only the keyword and the doc comment; the body, the ENOENT-continues / other-errno-refuses split and every call site are untouched. This is what makes one repository yield one 16-hex projectId whether it is addressed directly or through a symlinked alias.
- [Phase 02]: [02-01]: A pack whose predicate operator has no evaluator yet is absent from the plan value entirely, never reported as `silent` — Research Pitfall 8: a pack that silently never matches is indistinguishable from a pack whose evidence is genuinely absent, which is the exact failure DETC-03 exists to prevent. evaluatePack returns null for such a pack so no false "did not qualify" claim is made. The gap - a user cannot yet tell "not evaluated" from "did not qualify" - is recorded as an open stub in .planning/WINDOWS.md and closed by 02-02 and 02-07.
- [Phase 02]: [02-01]: package.json is read through the exported parseManagedDocument({format: "json"}) rather than exporting the module-private parseStrictJson a second time — The plan named parseStrictJson, which is not exported from src/core/validation.ts. parseManagedDocument is its already-exported wrapper and delegates to it directly for JSON, so the duplicate-key refusal the plan required is obtained unchanged without widening a Phase 1 module public surface for one consumer. Deviation Rule 3.
- [Phase 02]: ignore@7.0.5 approved at the human legitimacy gate and pinned exactly, with dist.integrity re-verified against the live registry immediately before it was written and --ignore-scripts on install — Same shape as the smol-toml@1.8.0 approval at 01-04: a human verifies the package, then the executor re-proves the exact artifact hash rather than trusting the recorded one. 7.0.5 declares no install-time lifecycle script and has zero runtime dependencies.
- [Phase 02]: isIgnored decides a path ancestor-first, so a negation cannot re-include a file beneath an excluded directory — gitignore(5) forbids re-inclusion under an excluded parent. Delegating the path straight to the ignore matcher answers scannable there; git check-ignore was run against the exact fixture and reports ignored. The RED test had encoded the wrong expectation and was corrected to the verified value.
- [Phase 02]: An unreadable .gitignore yields undecidable, not an empty rule set; only ENOENT/ENOTDIR mean the file is genuinely absent — Reporting no-patterns for a file that exists but could not be read is a fail-open on the predicate deciding what gets scanned, which D-01 forbids. The errno code is reported; no file content is.
- [Phase 02]: [02-06]: An evidence file that exists but fails to read with a non-ENOENT errno reports UNDECIDABLE carrying the errno and the path — never STALE, never a silent absence. — Reuses plan 01-19's precedent one layer down rather than inventing a second story about unreadable paths. STALE is reserved for "the evidence is gone", which an EACCES does not establish. The fixture is a directory bearing a manifest's name, which yields EISDIR on every supported host, so the case needs no privileged fixture.
- [Phase 02]: [02-06]: The evidence envelope carries EXACTLY the vocabulary declared in catalog/facts.yaml; anyFiles and anyDependencies inline literals stay outside it and resolve against the dependency index. — Putting inline literals in the envelope would make the fact set depend on what the packs happen to say and would break the one-record-per-declared-fact property the empty-repository case rests on. The evaluator synthesizes the explaining fact id (dependency:react) at evaluation time instead — the split 02-RESEARCH.md Pattern 3 describes.
- [Phase 02]: [02-06]: project detect is folded into project plan rather than aliased, and the hardcoded rule engine is deleted rather than kept alongside the YAML declarations. — Two entry points would keep two answers to one question. The removed engine disagreed with catalog/packs/*.yaml in six ways and four of its declared alternatives were never checked at all. Documented consequence: project plan . selects no pack where detect reported MCP_SERVER, because MCP_SERVER uses the any: operator whose evaluator arrives in 02-07 — the evidence itself is observed positively.
- [Phase 02]: A conflicting target drops its pack from `applicable` while it stays in `selected`: the evidence decision and the actionable set are different questions, and collapsing them makes a D-11 drop indistinguishable from a pack the evidence never chose.
- [Phase 02]: DETC-05 executable noun recorded as an explicit null with `deferredTo: phase-3-capability-materialization`, carried INTO the digestable view — the same declared-and-attributed form 02-02 used for the eight `deferredTo: GATE-01` risk facts, so Phase 3 inherits a watched slot rather than a fiction.
- [Phase 02]: Cross-host Unicode path normalization is NOT proven by 02-08: the non-ASCII fixture proves same-host stability only. A macOS NFD vs Linux NFC path naming the same file is unaddressed and belongs to the Phase 7 three-OS matrix.
- [Phase 02]: [02-09]: manifestDigest is a named plan field rather than being folded into inputsDigest, so DETC-05's manifest noun is nameable and not merely detectable. — The plan assumed 02-08 already carried a manifest content hash. It did not: readManifestEvidence records .alpha-aos/stack.yaml into the read ledger, so the hash sat inside the aggregate inputsDigest. That refuses an apply but cannot say the manifest is what moved, which makes D-13's manifest-changed classification an unreachable branch - a manifest edit that moves the selection reads as selection-changed and an inert one reads as inputs-changed.
- [Phase 02]: [02-09]: approve journals into the managed user state root while .alpha-aos stays the only allowed WRITE root, and stateRoot is a required option rather than defaulting to userStateRoot(). — The journal and snapshots are what make the safe inverse real, and putting them where alpha-aos rollback already looks means a project approval is undoable by the command that already undoes managed writes. Requiring stateRoot rather than defaulting it stops a module-level test taking the exclusive writer lock on the developer's real ~/.alpha-aos - the ambient-write class 01-21 spent a plan closing, arriving through a convenience default.
- [Phase 02]: [02-VERIFICATION]: D-13 drift naming is scoped to callers that hold the reviewed plan value; the preview is NOT permitted to persist a reviewed-plan record. — SAFE-01 (the preview persists nothing) and D-12 both stand. Both drift branches refuse with exit 2 and a runnable re-approval command, so ROADMAP criterion 4 holds either way; only the window before a repository's first approval cannot name the moved noun, and it closes permanently after it. Broken-windows ledger #14 closed as a DECISION, not a patchable bug. Future candidate needing its own plan: expose `ApproveProjectPlanOptions.reviewedPlan` as a `--reviewed-plan` flag.
- [Phase 02]: [02-09]: Drift classification consumes the reviewed plan VALUE (explicit reviewedPlan, else .alpha-aos/plan.json when that artifact IS the reviewed plan); with neither available the refusal states the classification is unavailable rather than inferring one. — A digest cannot be un-hashed. D-12 plus SAFE-01 mean the CLI's two invocations share only a digest, because the preview persists nothing. Inferring which noun moved from a digest alone would be a guess presented as a finding, so the CLI branch carries both digests and the runnable re-approval command and says what it cannot name. Recorded as an open Broken Windows unmet-truth entry.
- [Phase 02]: 02-10: STALE vs CHANGED is discriminated by whether a specific approved fact can be NAMED as having flipped, not by an evidence-digest comparison — Removing a dependency always moves evidenceDigest, so a digest comparison cannot tell a stale pack from an artifact claiming something the evidence never supported; naming the flipped fact can. The artifact-level disagreement is reported separately as artifactState plus unsupportedClaims.
- [Phase 02]: 02-10: the branch and commit are recorded BESIDE the plan in .alpha-aos/plan.json, so digestablePlan cannot reach them — digestablePlan is a literal listing exactly what a reviewer reviewed. Putting gitContext at the artifact top level makes exclusion from every digest structural rather than a rule someone must remember; a test commits an irrelevant change and observes inputsDigest, evidenceDigest and planDigest all unchanged.
- [Phase 02]: 02-10: a removal is approved through the EXISTING approve verb with the removal digest; project status has no apply flag — D-14 requires that stale evidence never trigger automatic deletion. Reusing the approve verb and the same digest contract keeps exactly one writer in the phase and one command shape, instead of a second drift mechanism that would drift from the first.
- [Phase 02]: 02-10: only a STALE pack is offered a removal plan; DRIFTED, CONFLICT, CHANGED and UNDECIDABLE never are — Only STALE means the evidence that selected the pack is gone. An UNDECIDABLE evidence file is a read failure, not an absence, so it must never motivate a deletion - the same resolution 02-06 applied one layer down.
- [Phase 02]: Canonical-root ladder (02-11 Task 1, user option-a): explicit-override > project-declaration > git-root > standalone-directory; a descent reports project-declaration; worktree-root and submodule-root removed from RootReason — scope.rootReason folds into planDigest and D-10 commits approved plans under .alpha-aos/, so the union is contract and must contain only values the code produces (WR-11). isGitBoundary already matches the .git FILE of a worktree and a submodule, so git-root covers both.
- [Phase 02]: An alias inside the canonical root is refused unconditionally (alias-entry) before identity is marked, for files as well as directories — Only unconditional exclusion makes "adding a link changes neither the fact set nor the selection" true without a traversal-order tie-break, and stops a repository steering its own pack selection (T-02-41).
- [Phase 02]: [02-12]: The ignore parser has two failure channels: only a file that could not be taken on at all stays `undecidable` and fail-closed; one uncompilable line becomes a bounded `note` and the remaining patterns keep deciding. — A prefix of a rule set is a different rule set, so the pattern-count cap stays total; but one over-long line made a whole subtree unscannable on the strength of a line the parser could simply have reported (02-REVIEW WR-05).
- [Phase 02]: [02-12]: A .gitignore line escaping a leading # is kept VERBATIM; the escape is not stripped, contrary to 02-REVIEW IN-06 and this plan own acceptance criterion. — Verified both ways before deviating: ignore@7.0.5 and a real git check-ignore agree that an escaped-hash line ignores the hash-named file and that an unescaped one is a comment. Stripping the escape hands the matcher a comment and silently un-ignores the file.
- [Phase 02]: [02-12]: An over-budget --json envelope is a thrown refusal naming the byte budget and the envelope sha256, with NOTHING written to stdout. — A pipeline reads stdout, so a partial document there plus a refusal on stderr is worse than a refusal alone. Every byte budget in the redaction seam now measures and cuts in UTF-8 bytes through one code-point-boundary-safe helper.
- [Phase 02]: [02-12]: ECC fixture retention is initialised FROM the caller keep option, so a failure cleans up by default; when retention was requested the rethrow names the retained root, aliased. — Retention becomes something a caller asked for rather than an accident of where a throw landed, and a kept tree is a diagnostic instead of a silent leak in the system temp directory (02-REVIEW WR-12).
- [Phase 02]: The scan-completeness record (bounds, undecidable paths, boundary exclusions, dropped members) is carried into the plan value, rendered in all three modes and folded into digestablePlan, so a bounded scan can never print as a confident complete answer and an approval cannot outlive the bound it was taken under.
- [Phase 02]: A negative claim about a declared directory is emitted only about names absent from BOTH the scan paths and the exclusion records; where the walk observed and refused the name, the reason names the exclusion instead.
- [Phase 02]: Filesystem identity is read at the host's own 64-bit width: Node's default Stats.ino is a double, so a Windows file index above 2^53 rounds and two directories within one ulp collapsed into one identity, silently truncating the walk (broken-windows #13).
- [Phase 02]: project status prints its whole report AND exits with the domain-refusal status when .alpha-aos/plan.json is unreadable — The reconciliation is derived from freshly recomputed evidence and stays true even when the artifact is refused, so suppressing the report would cost the user more than the refusal buys; the exit status is what carries REJECTED rather than merely missing.
- [Phase 02]: schemas/receipt.schema.json narrows its harness enum to exactly the keys of PROJECT_SKILL_ROOTS (claude, codex, pi) — Phase 3 writes receipts and inherits this constraint: add a project-local skill root to PROJECT_SKILL_ROOTS first, then the enum follows. A test asserts the two tables agree.
- [Phase 02]: The approved-plan schema is authored against the plan shape at the END of the run, not its start — approvalArtifactBytes serializes the entire ProjectCapabilityPlan, so a schema authored against today shape would make project approve emit an artifact project status rejects. hostNotes, a null guard hash and an open approval code are all admitted up front for 02-15.
- [Phase 02]: The personal-skill collision moved from approvals into an undigested hostNotes field: planDigest must depend on the repository and the pinned lock alone, but the collision is still reported as a SHADOWED line
- [Phase 02]: TARGET_CONFLICT stays digested — the split is repository-derived versus host-derived, not important versus unimportant
- [Phase 02]: SafeInverse.guard.expectedHash admits an explicit null: no guard hash is invented for bytes that were never observed, and a TARGET_UNREADABLE approval tells the reviewer which undo is unguarded
- [Phase 02]: approvalCommand quotes the path and the --project value on whitespace, a quote or a shell metacharacter, and leaves an ordinary path byte-identical
- [Phase 02]: Plan 02-16 Task 2 (option-a): the catalog and lock drift check runs in a new scheduled workflow, .github/workflows/pack-skill-drift.yml, weekly on cron 17 4 * * 1, and drift fails the run red — Maintainer policy, chosen over folding it into ci.yml (which has no schedule and runs per push/PR) and over report-only. The cron hour is offset from dependency-candidate.yml (17 3 * * 1) so the two network-touching scheduled jobs do not contend. Read-only permissions because the job opens no pull request and pushes no branch. workflow_dispatch added for on-demand runs.
- [Phase 03]: Receipt sourceHash is a sha256 over the pack's sorted [skill, sourceSha256] pairs — A pack may declare several skills but the receipt carries one hash; the aggregate is recomputable from catalog/stack.lock.json alone
- [Phase 03]: createdAt is excluded from the already-current receipt comparison — It is the only field no input derives; comparing it would make every re-run rewrite a receipt whose every claim is unchanged, defeating D-06 idempotency
- [Phase 03]: A sync tolerates plan drift caused only by its own materialization landing — Writing the files a plan describes changes their pre-state and therefore the plan digest; without a narrow target-changed tolerance the D-06 idempotency edge is unreachable
- [Phase 03]: The receipt kind discriminator lands in schemas/receipt.schema.json only — CORE_SCHEMAS.receipt is the envelope check; the closed interior is where a target-kind vocabulary belongs
- [Phase 03]: Only claude can host an invocation canary: it is the one harness with both an MCP-config flag and a strict flag, so every other harness records a blocked reason rather than launching best-effort. — RESEARCH.md verified --mcp-config and --strict-mcp-config on claude only; codex --strict-config constrains how config is read, not which config is read. A canary that may have reached the user own servers proves nothing, so fail-closed is the only honest answer (T-03-50).
- [Phase 03]: A declared canary argument pattern cannot be checked from an observation record, and is reported UNCHECKED rather than satisfied. — McpObservation deliberately has no argument field because arguments are where credentials live (T-03-52). CAPA-01 structural claim must either narrow to "the tool was called" or the record shape must change with that reasoning re-argued.
- [Phase 03]: A canary runtime is single-use and consumption is marked BEFORE the launch, so a crashed run cannot be repeated through a runtime holding stale observation records. — A second run through one runtime would compute its verdict partly from the first run records, and those records look exactly like records the second run produced.
- [Phase 03]: CAPA-02 routing reconciliation resolved as option `narrow`: keep the four-tool extraction allowlist, reconcile in a new alpha-AOS-owned instruction (skills/alpha-aos-research-routing/SKILL.md), and record the third-party skill mismatch as a named finding — Developer selected the researcher-recommended option; no additional prose rationale was supplied. PROJECT.md's bounded four-tool Firecrawl claim (PROJECT.md:21, repeated at README.md:5 and README.md:113) therefore stays true as written.
- [Phase 03]: The 03-07 `narrow` branch is implemented: the four-name Firecrawl allowlist is unchanged, PROJECT.md's bounded-extraction claim stands, and the routing contract is restated in skills/alpha-aos-research-routing/SKILL.md
- [Phase 03]: A canary runtime materializes alpha-AOS-owned instructions into its own harness config root; project-only isolation hides user-scope skills, so an instruction written anywhere else would steer nothing
- [Phase 03]: McpObservation gained exactly one field, identifierShape, a closed two-value classification computed and discarded in the proxy frame; a declared argument pattern no recorded shape decides is still reported UNCHECKED
- [Phase 03]: A capability ledger row is keyed by project/harness/capability/POLARITY and replaced in place, with the replaced row's exact harness version retained in supersededHarnessVersions
- [Phase 03]: CAPA-01 and CAPA-02 are NOT marked complete: the machinery is proven live but no model turn was spent, so native selection is unproven
- [Phase 03]: CAPA-07's three axes are resolved from a product CEILING (code and catalog) and a host LEDGER that are never merged: a ledger may raise a surface within its ceiling and never above it, and where the ceiling bound the result the reason says so
- [Phase 03]: PackReconciliation.state was RENAMED to .capability so the deployment axis is reachable only through the composite CapabilityState; a stale read is a compile error, not a silent object read
- [Phase 03]: The one-shot lifecycle reports as a state with an offer and never deletes: planPackRemoval gained a second ground so the printed digest is the one applyPackRemoval accepts, proven by pasting the command back
- [Phase 03]: The sidecar path is a RECORDED receipt target (kind: "sidecar"), never derived at removal time, so it sits inside the drift guard planPackRemoval computes over each targets current hash — A derived path is invisible to that guard: mutation M2 (the receipt stops claiming sidecar rows) makes the removal both fail to remove the sidecar AND fail to refuse when a user has edited it. Recording it also makes the removal behaviours fall out of mechanisms that already exist rather than needing parallel new ones.
- [Phase 03]: A sidecar whose every claim is unchanged keeps the timestamp it was written with — The receipt claims the sidecar BYTE hash, so a fresh timestamp each run would move that hash, move the receipt, and make the D-06 already-current edge permanently unreachable. Mutation M5 confirms it: forcing a fresh timestamp turns the idempotency test red.
- [Phase 03]: pi stays receipts-only with its reason recorded, and every sidecar reason leads with the DECISION so the status width bound cannot cut it — Tolerance for a non-Markdown sidecar was never probed on pi; its documented ignore rule covers root Markdown files only. Plan 03-09 lost half a cited sentence to MAX_STATUS_DETAIL_CHARS, so the wording was rewritten to fit rather than exempted.
- [Phase 03]: Keep unsupportedReason on oracle and process support-domain results; only CapabilityReportRow uses notRunReason.
- [Phase 03]: Return identity-independent sweep aggregate views because observable serialization treats repeated object references as cycles.
- [Phase 03]: Codex discovery remains free while invocation uses a costed ephemeral exec vector. — Keeping separate adapter contracts prevents a discovery result from being reported as native use.
- [Phase 03]: The Codex canary reuses authentication by reference while controlled write roots remain runtime-local. — This preserves the user-managed login without reading or copying authentication bytes.
- [Phase 03]: Isolated Codex documentation canaries carry one exact developer instruction for ordered Context7 routing. — The required ignore-rules flag removes ambient routing instructions, while MCP-side observations remain the proof authority.
- [Phase 03]: Explicit zero-match canary filters are configuration refusals, not evidence outcomes. — This prevents an explicit request that ran nothing from appearing as a successful sweep.
- [Phase 03]: The doctor CLI validates canary selection before state resolution and harness probing. — The core selector remains the single policy authority while the CLI fails before state or spend.
- [Phase 03]: Unchecked required argument patterns prevent held and invoked outcomes. — Absent checkable identifier-shape evidence is unverified evidence, never successful invocation.
- [Phase 03]: Legacy proofs remain readable without invocationEvidence, but cannot satisfy strict CAPA-01 completion. — Additive compatibility preserves existing host state without fabricating audit evidence.
- [Phase 03]: Durable canary evidence is a closed redacted projection of observations and verdict fields. — Explicit reconstruction excludes raw arguments, responses, model text, auth data, environment values, and credentials.
- [Phase 07]: Accept only canonical ustar regular-file and directory entries within explicit resource bounds and an exact catalog allowlist.
- [Phase 07]: Generate and verify the authoritative archive digest with Node crypto so Linux, macOS, and Windows use one portable path.
- [Phase 07]: Treat locked external integrations as current sandbox prerequisites while exercising all alpha-AOS-owned mutations from the installed tarball.
- [Phase 07]: Use uninstall --purge in the disposable release fixture because ordinary uninstall intentionally preserves audit journals.
- [Phase 07]: 07-02: Baseline PROVEN is claim eligibility; live evaluation downgrades to UNVERIFIED until an inspectable matching invocation receipt exists.
- [Phase 07]: 07-02: Claude remains RESIDUE and Antigravity remains UNVERIFIED while its invocation proof is unrepresentable in the closed host ledger.
- [Phase 07]: 07-03: Brownfield release proof uses deterministic offline Context7 observations and Unified Memory runners so REL-04 requires no credentials, network availability, or paid calls.
- [Phase 07]: 07-03: A worker planning mutation outranks a simultaneous action failure; rollback is re-hashed before planning-mutation-detected is returned with the action failure retained as context.
- [Phase 07]: 07-04: Bind provenance to the tarball digest, archived build manifest, and archived stable-lock bytes.
- [Phase 07]: 07-04: Run release gates in a disposable tracked-file Git snapshot and require explicit --publish on a clean main checkout.
- [Phase 07]: 07-04: Public-registry Stage 2 remains a post-publication manual gate and was not run without publish authorization.
- [Phase 07]: 07-04: Machine-readable process output requests an explicit bounded excerpt budget before JSON parsing.
- [Quick 260922-om1]: D-18 added to 03-CONTEXT.md, explicitly superseding D-17 (mirroring how D-17 superseded D-09), without erasing either audit trail.
- [Quick 260922-om1]: Reinstating Claude Code's scope claim is not itself evidence — Claude stays subject to the same D-10 ceiling/ledger split and D-12 blocked/unverified distinction as every other harness; real invocation-receipt evidence is still required for promotion past unverified/RESIDUE.
- [Quick 260922-om1]: REQUIREMENTS.md's REL-02 bullet was deliberately left unchanged since it reflects Phase 7's already-verified support matrix under D-17, and the support-matrix.ts RESIDUE hardcode it describes is still unimplemented — routed to `/gsd-verify-work 7` then `$gsd-plan-phase 7 --gaps`.
- [Quick 260922-puy]: 07-VERIFICATION.md's Truth 2/REL-02 ("every claimed harness has real-host evidence") registered as stale gap G-07-1 under D-18, additively (frontmatter gaps[] entry, dated Evidence-cell annotations, new ## Gaps section) — Truths 1/3/4/5 and REL-01/03/04/05/06 left byte-identical. Ready for `$gsd-plan-phase 7 --gaps`.
- [Phase 07]: 07-08 closed G-07-1's structural component — `src/core/support-matrix.ts`'s `evaluateMatrixCell` no longer hardcodes claude to a fixed tier; `activeSurfaces` widened to the full `HarnessId` union with claude's four surfaces mirroring codex's. Full suite independently re-run twice (once by the executor, once by the re-verifier): 907 tests, 898 pass, 0 fail, 9 pre-existing skips.
- [Phase 07]: `policy.canaryHarness: codex` in catalog/stack.yaml confirmed unrelated to support-matrix evidence tiering (it only gates install-rollout pilot-harness sequencing in src/core/plan.ts/install.ts) — correctly left unchanged, not a gap.
- [Phase 07]: Re-verification registered narrower gap G-07-2 (superseding G-07-1): Claude Code has zero real-host invocation receipts, so its support-matrix cells are UNVERIFIED not PROVEN — an evidence-collection gap, not a code defect. User explicitly chose "code changes only for now" — real canary invocation (`alpha-aos doctor --canary --harness claude --no-spend` then `--capability CAPA-01`) deliberately deferred to a separate, later, human-triggered action.
- [Phase 07]: G-07-2's "only running the real canary closes this" diagnosis is DISPROVEN by running it (2026-09-22). Claude keeps its login inside CLAUDE_CONFIG_DIR, which the canary runtime replaces, so the run reached its init event, connected the fronted server, then died at `Not logged in` with `permission_denials: []` and exit 1 — a spent turn that could only ever fail. Codex avoids this only because its canary branch reuses the caller's login boundary by reference; claude has no equivalent and this stack never copies auth bytes. Authentication route is now an open human decision between: ANTHROPIC_API_KEY on the launch, a claude-side by-reference branch, or accepting it as a standing limitation.
- [Phase 07]: The spend-before-refusal half of that defect is FIXED (commit 7c2c737): an isolated claude canary records HARNESS_ISOLATION_UNPROVEN and does not launch. Verified against the CLI — outcome blocked, launched false, exit 2.
- [Phase 07]: Readiness for claude measures the WRONG environment — its connection probe lists the user's own MCP servers, not the isolated runtime the run would use, which is why it answered `ready: true` before a run that could not authenticate. Recorded in G-07-2's `missing`, not yet fixed.
- [Phase 07]: A provenance test REQUIRED the release docs to say Claude Code is compatibility RESIDUE, so those documents had to stay stale to stay green. Guard rewritten (commit afc36c6) to enforce the scope-vs-proof separation it was written for, and to reject the present-tense claim while still permitting the past-tense record.
- [Phase 07]: CHANGELOG entries for this work sit under `[Unreleased]`; package.json stays 0.1.0. Cutting a version is a release act gated behind `scripts/release.mjs`, not a side effect of documentation repair.
- [Roadmap v0.1.1]: Phases continue at 10. CI-01, CI-02 and CI-03 share Phase 10 because one all-green three-leg run id is that phase's own closing evidence, as it was for G-01-1 in v0.1.0.
- [Roadmap v0.1.1]: LIFE-09 (Phase 11) follows Phase 10 so the Phase 6 report can cite the CI-02 root-cause classification and the green lifecycle run; the red-main guard (Phase 12: CI-04, DEP-03) lands before promotion (Phase 13: DEP-01, DEP-02) so promotion itself runs through the guard.
- [Phase 10]: 10-01: path-literal guard marker is '// path-literal-ok: <reason>' (reason >= 4 chars) on the literal's own line; const bindings resolve by name (fail closed)
- [Phase 10]: 10-01: test fixture roots asserted against host path output are built with join(tmpdir(), fixture-name, ...), never platform-absolute literals
- [Phase 10]: 10-02: CI-02 classified as a test-isolation leak (D-01 class 3): mcp-proxy.test.ts npx cache writes to the real ~/.alpha-aos/mcp-cache/npm-cache; fixture alone writes nothing; D-02 governs 10-03, D-03 audit not triggered, D-06 not needed
- [Phase 10]: CI-03 proof is push run 35818198049 attempt 1 on 35d4c15 (all four jobs success, no re-run); CI_RUN.md is pinned to that run id, not to origin/main head
- [Phase 11]: LIFE-01 'the plan' is alpha-aos install without --apply; static alpha-aos plan is an OBSERVED fact and no docs line points users to it
- [Phase 11]: Phase 11 probes share test/helpers/packed-sandbox.ts with the CI packed lifecycle test; probe-lib.mjs owns the transcript vocabulary, containment assertion and host guard
- [Phase 11]: Packed lifecycle test now asserts dry-run CURRENT and sandbox byte identity across the dry-run and the second apply (tracer HOLDS)

### Pending Todos

- [Phase 10 follow-up] Widen `test/helpers/path-literal-scan.ts` to cover `let` bindings, aliased (`join as pj`) and namespace (`p.join`) `node:path` imports (10-UAT.md Deferred Follow-Ups).

### Blockers/Concerns

- Advisory from 10-VERIFICATION: the ENOENT → `vanished` branch of `fingerprintManifest` (test/tarball-fixture.test.ts) has no in-repo regression test.
- Partially resolved by Phase 02 (2026-09-09): evidence detection, pack selection and the reviewed, digest-bound plan are complete and verified; `project sync --apply` itself is still a stub. Phase 3 owns materialization, receipt writing and the transactional apply.
- Full uninstall, external-package compensation, and interrupted-operation recovery are absent.
- Ordinary-entrypoint tree-off suppression remains version- and surface-sensitive and must report unsupported unless exclusion is proven before load.
- Resolved by 07-01 (2026-09-19): `catalog/candidate.lock.json` is excluded by the exact npm file allowlist, `.npmignore`, and the post-pack archive audit; REL-05 is complete.
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
- Open from 01-27 (2026-09-06): an unexplained single-run Windows-local failure is carried forward unresolved. During Task 2 one routed ten-file run on the Windows developer host reported `131 / pass 125 / fail 1 / skipped 5` and the failing test's NAME WAS NOT CAPTURED; six further routed runs on the same host reported `131 / pass 126 / fail 0 / skipped 5`. It was not the descendant test (that run's own diagnostic showed windows-tree / esrch / terminated:true). Run 34051628180's three legs did not reproduce it — windows-latest is `131 / pass 127 / fail 0 / skipped 4`. Note the skip delta: the developer host skips FIVE (the fifth is escape-file-link, which windows-latest actually runs), so the two hosts execute different test sets under the same 131 total and the CI green does not cover the local failing test. This is non-reproduction, not diagnosis. If it recurs, capture the failing test name FIRST.
- Open from 01-27 (2026-09-06): Broken Windows ledger stands at `open 2, waived 1, fixed 4, total 7`. #5 (scripts/run-tests.mjs) awaits a permanent suite test asserting the `--files` loud-failure paths on every leg; #6 (src/core/path-boundary.ts provePathBoundary:296-299) is reachable only through a TOCTOU race between :285 and :296. Neither is answerable by a green three-OS matrix. With `workflow.windows_enforce` on, /gsd-ship blocks until both are fixed or waived with a reason.
- Open from 01-27 (2026-09-06): the two manual-only SAFE-02 canaries have DIVERGED and 01-UAT.md was deliberately not edited. The Windows unknown-reparse canary is still unanswerable by any CI leg (windows-latest reports `privileged reparse facilities unavailable`; POSIX legs correctly report it Windows-only), so 01-UAT.md item 2 stays `result: skipped`. The file-symlink escape canary, by contrast, DID execute and pass on windows-latest in both entrypoints of run 34051628180 — the plan's premise that no CI leg can produce that evidence is falsified for this fixture. The evidence now exists; whether it promotes 01-UAT.md item 3 from an accepted privilege gate to an observation is the verifier's call, and 01-UAT.md is outside 01-27's files_modified.
- Open from 01-27 (2026-09-06): baselines updated for any later plan — `npm test` is 208 tests (fail 0; 1 skip on POSIX, 4 on Windows), the routed `Safety boundary suites` step is 131 tests (fail 0), and `npm run build:check` reports `56 inputs, 106 outputs`. Any other total is a suite that stopped compiling, not a faster run. Also: WHY the old invalid instrument tipped on that particular ubuntu run remains a HYPOTHESIS (file-set / scheduling load), explicitly not recorded as established cause.
- src/core/path-boundary.ts records component identity as Number(info.ino) and recheckPathProof compares those doubles, so two different inodes within one ulp compare equal and a TOCTOU swap can go unnoticed. Same root cause as the identity bug 02-13 fixed in evidence.ts; left open because PathProof.inode is a typed number|null in the public shape and widening it needs its own plan.
- Open from 02-VERIFICATION (2026-09-09): a paste-ready re-approval command can name a path whose segment has been replaced by a redaction token, so the command as printed does not resolve. Reproduced on a scratch path with a UUID-shaped segment. The refusal, its exit code and its digests are all correct and an ordinary repository path never triggers it, so this is presentation, not safety — but CI checkout paths and temp dirs do carry UUIDs. Phase 6/7 decides whether a redacted path suppresses the runnable-command line instead of emitting an unresolvable one.
- Open from 03-04 (2026-09-10): the suite baseline is now 545 tests (539 pass, 0 fail, 6 skipped) and npm run build:check reports 72 inputs / 138 outputs. Plan 03-05 must raise its own baseline to 545 rather than 522.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | codex-native-verification-gap | diagnosed | 2026-09-23 | v0.1.0 |
| verification_gaps | 07/07-VERIFICATION.md (G-07-2) | gaps_found | 2026-09-23 | v0.1.0 |
| Isolation | OS/container-backed `sealed` mode | Deferred | Roadmap creation | v2 |

### Quick Tasks Completed

| ID | Description | Date | Commit | Directory |
|----|-------------|------|--------|-----------|
| 260911-w4s | Portable Codex execution guidance and bounded usage validation | 2026-09-12 | 6605c55 | [260911-w4s](./quick/260911-w4s-make-codex-gsd-execution-context-bounded/) |
| 260914-x2c | Rebaseline v0.1.0 around active non-Claude harnesses | 2026-09-17 | pending | [260914-x2c](./quick/260914-x2c-exclude-claude-from-the-v0-1-0-active-de/) |
| 260922-47e | Fix Windows Firecrawl fixture environment propagation and add regression coverage | 2026-09-22 | 57e70d1 | [260922-47e](./quick/260922-47e-fix-windows-firecrawl-fixture-environmen/) |
| 260922-om1 | Reinstate Claude Code into active v0.1.0 harness scope (D-18, reversing 260914-x2c) | 2026-09-22 | ae05eec | [260922-om1](./quick/260922-om1-reverse-quick-task-260914-x2c-reinstate-/) |
| 260922-puy | Register Phase 7 evidence gap G-07-1 for stale Truth 2/REL-02 claim under D-18 | 2026-09-22 | 1e785ad | [260922-puy](./quick/260922-puy-register-phase-7-evidence-gap-g-07-1-in-/) |

## Session Continuity

Last session: 2026-09-23T12:11:58.870Z
Stopped at: Completed 11-01-PLAN.md
Resume file: None

## Operator Next Steps

- Phase 10 verified and complete (UAT 2/2). Next: /gsd-discuss-phase 11 (or /gsd-plan-phase 11)
