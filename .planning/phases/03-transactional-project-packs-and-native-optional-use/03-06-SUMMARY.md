---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 06
subsystem: infra
tags: [canary-runtime, mcp-observation-proxy, strict-mcp-config, isolation, doctor-verbs, capability-ledger, cost-before-spend]

# Dependency graph
requires:
  - phase: 01-safe-operation-boundary
    provides: "runProcess with a shell-free bounded launch, PLATFORM_FLOOR_ENVIRONMENT and materializeEnvironment, the excerpt/fingerprint split, and applyFileTransaction's journaled snapshotted write with a proven path boundary"
  - phase: 02-project-capability-planning
    provides: "planProjectCapabilities and classifyAdapterSupport (the support axis), PackSource for the bound skill-source hash, and the verb-discipline refusal register in src/cli.ts"
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "03-02's mcp-proxy observe mode and McpObservation, 03-03's capability ledger (BlockedReason, CapabilityProof, pairEvidence, writeCapabilityLedger), 03-04's runPairedDiscovery + ORACLE_DEFINITIONS + resolveDirectLaunch, 03-05's canary catalog, probeReadiness, disposeCanary and the preview boundary"
provides:
  - "createCanaryRuntime — an isolated configuration root under the managed state root whose one MCP configuration fronts EVERY pinned server with `alpha-aos mcp-proxy <id> --observe`, rendered through the existing per-harness renderer"
  - "the canary variant of createIsolationLaunchSpec — claude gets --mcp-config + --strict-mcp-config and the project's own .mcp.json is excluded; every other harness records a blocked reason naming what is missing"
  - "runCanary — readiness, then sink, then isolation, then prompt vector, all before anything launches; the invocation axis is decided from observation records alone"
  - "decideInvocation — the pure verdict function, and the honest report that a declared argument pattern is UNCHECKED because the record has no argument field"
  - "the D-02 boundary as four refusals: assertRuntimeContainment, assertCanaryLaunchIsolation, assertCanaryEnvironmentDeclared, and single-use runtimes"
  - "the observation file format (observationLine / readObservationRecords / createFileObservationSink) and `alpha-aos mcp-proxy <server> --observe --observations <path>`"
  - "runDiscoverySweep — the FREE sweep, which skips any oracle that would spend a model turn"
  - "runCanarySweep + canaryCostLines — the paid sweep, which announces every cost line before the first run starts"
  - "CapabilityReportRow + formatCapabilityReport — one line per capability carrying three axes, with INCOMPLETE withholding the positive's axis"
  - "canaryProof — a canary run as a ledger row, so both commands record through one ledger"
  - "alpha-aos doctor --discovery and alpha-aos doctor --canary"
affects: [invocation-evidence, capability-promotion, status-rendering, one-shot-lifecycle, cross-os-matrix, ship-gate]

actuals:
  tokens: 30079
  tasks: 3
  commits: 5
plan_head_before: bfac9a6289e514223b88473719cfbf76d9ac9bac

tech-stack:
  added: []
  patterns:
    - "variant-not-second-path: a canary launch is an option on the ONE launch spec builder, so a test cannot stay green against a launch the product no longer uses"
    - "recorded absence at the flag level: a harness with no strict MCP-isolation flag gets a blocked reason naming what is missing, never a best-effort launch"
    - "boundary-as-refusal: the D-02 invariants throw with stable codes rather than becoming BlockedReasons, because a `blocked` a user cannot clear wastes their time"
    - "single-use runtime: consumption is marked BEFORE the launch, so a crashed run cannot be repeated through a runtime holding stale records"
    - "cost announced through an injected sink, so 'printed before anything ran' is an assertable ordering rather than a claim about stdout"
    - "unchecked-not-satisfied: an expectation the record shape cannot check is reported unchecked with the reason, never counted as met"
    - "axis withheld rather than defaulted: an axis this command did not measure is null WITH its reason, mirroring resolveCapabilityStatus's refusal to default one"

key-files:
  created: []
  modified:
    - src/core/canary.ts
    - src/adapters/isolation.ts
    - src/core/mcp.ts
    - src/core/mcp-proxy.ts
    - src/cli.ts
    - src/format.ts
    - test/canary.test.ts
    - test/isolation.test.ts

key-decisions:
  - "The observing front is an OPTION on the existing per-harness MCP renderer (`front: \"observe\"`), not a second renderer: the server-map key name stays the harness's own, and the everyday `policy` front is byte-identical to what it was"
  - "The canary MCP configuration renders credential NAMES as `${NAME}` references for every harness, because a sentinel test over a file that mentions neither the name nor the value is vacuous — 03-05 deviation 2 taught exactly that"
  - "createIsolationLaunchSpec gained a `canary` option rather than a sibling builder; the option also SUPPRESSES the project's own .mcp.json for claude, since an unfronted server loaded beside the runtime's is the whole failure D-02 prevents"
  - "Only claude has a canary MCP isolation vector. codex's --strict-config constrains how configuration is read, not which configuration is read, so it is a recorded absence with that reason and a blocked launch"
  - "The four D-02 invariants THROW (CanaryBoundaryError) rather than returning BlockedReasons: they are alpha-AOS's own bugs, not states a user can act on"
  - "A canary runtime is single-use and consumption is marked before the launch, not after: a crashed run is exactly the case where stale records are most likely to be read by a repeat"
  - "A declared argument pattern is reported UNCHECKED with its reason. McpObservation has no argument field by design (T-03-52), so the pattern cannot be checked from it, and counting it satisfied would be a proof that proves nothing"
  - "The free sweep SKIPS any oracle whose costsModelTurn is true, reading the flag from ORACLE_DEFINITIONS rather than restating it. `doctor --discovery` therefore drives codex and pi and never claude"
  - "The deployment axis is reported as null WITH a reason on both doctor verbs. resolveCapabilityStatus refuses a defaulted axis; picking UNDECIDABLE would claim a read failure that never happened, and the axis is genuinely a receipt fact that `project status` owns"
  - "The cost summary goes to stderr in both modes and rides in the --json envelope, so a human watching sees the spend before it happens and a program is not asked to parse a side channel"
  - "`--help` anywhere in argv prints help, because `alpha-aos doctor --help` running a real doctor sweep against a machine is the wrong answer to a request for help"

patterns-established:
  - "Variant, not second path: an isolation mode is an option on the one launch spec builder"
  - "Boundary-as-refusal with a stable code, separate from the user-actionable BlockedReason vocabulary"
  - "Single-use ephemeral runtime, consumed before the spend rather than after it"
  - "Cost announced through an injected sink so the ordering is assertable offline"
  - "Unchecked-not-satisfied: an unverifiable expectation is named as unchecked with its reason"

requirements-completed: [CAPA-05, CAPA-07]

coverage:
  - id: D1
    description: "A canary run reaches the pinned MCP servers through an alpha-AOS observation front that exists only inside the canary runtime; everyday configuration keeps talking to those servers directly"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the canary runtime's MCP configuration points every server at the alpha-AOS observation front"
        status: pass
      - kind: unit
        ref: "test/isolation.test.ts#the canary launch variant points claude at the runtime configuration and excludes every other MCP source"
        status: pass
      - kind: unit
        ref: "test/isolation.test.ts#a harness with no strict MCP isolation records a blocked reason rather than claiming the canary is isolated"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*[/*]' src/adapters/isolation.ts | grep -c strict — 4"
        status: pass
    human_judgment: false
  - id: D2
    description: "After a canary run the user's real harness configuration roots are byte-for-byte unchanged, asserted rather than assumed"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a canary run leaves every harness config root byte-identical and gains no entry"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a canary run creates paths only under the managed state root, and only ones it declared"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#no environment name outside the platform floor plus the declared canary names reaches the harness child"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a canary runtime is single-use, so a second run cannot inherit the first run's records"
        status: pass
    human_judgment: false
  - id: D3
    description: "The invocation verdict comes from what the observation proxy saw, never from what the model said"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the invocation axis is computed from observation records only, never from what the harness said"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a declared argument pattern is reported unchecked, never satisfied, because the record has no arguments"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a canary with an unavailable observation sink refuses before the harness launches"
        status: pass
    human_judgment: false
  - id: D4
    description: "The free discovery evidence and the paid invocation evidence are separate, separately runnable commands, and the paid one states its cost before spending it"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the free discovery sweep completes with no credential, spends no model turn, and records an evidence unit"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the canary sweep prints what it would spend before it runs anything"
        status: pass
      - kind: integration
        ref: "live on this host: `node dist/src/cli.js doctor --discovery .` — exit 0, drove codex and pi for real, skipped claude as spending, wrote 8 proofs"
        status: pass
      - kind: other
        ref: "node dist/src/cli.js doctor --help — exit 0, names both modes, states the canary is not a preview and persists a ledger record"
        status: pass
    human_judgment: false
  - id: D5
    description: "A canary blocked on an unset credential names the variable and the next action, never a value, and exits non-zero rather than running and failing"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a canary blocked on an unset credential names the variable and the next action, and never a value"
        status: pass
      - kind: integration
        ref: "live on this host: `env -u EXA_API_KEY node dist/src/cli.js doctor --canary . --capability RESEARCH_MULTI_SOURCE` — announced the spend first, refused MISSING_CREDENTIAL/EXA_API_KEY with a next action, wrote no ledger row, exit 2, no harness launched"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every reported capability carries three axes under --json and one summary line in the human rendering; an INCOMPLETE unit renders INCOMPLETE and withholds the positive's native-use value"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#--json carries all three axes for every capability and the human output carries one line each"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#an INCOMPLETE unit renders INCOMPLETE and never the positive's native-use value"
        status: pass
      - kind: other
        ref: "live --json envelope inspected: axes.deployment null with axisNotes.deployment stating why, axes.support and axes.nativeUse present"
        status: pass
    human_judgment: true
    rationale: "The mechanical half is covered above. Whether `deployment: null` plus a reason reads to a user as an honest recorded absence rather than a missing feature is a judgement no test can make — a human should read one rendered report and say whether the unmeasured axis is clear or merely quiet."
  - id: D7
    description: "A live paid canary that actually spends a model turn and produces an observed invocation"
    requirement: "CAPA-07"
    verification: []
    human_judgment: true
    rationale: "NOT RUN. Every path up to the launch is proven live (readiness probe, cost announcement, runtime creation, refusal, exit code) and the launch/verdict path is proven offline with an injected launcher. The one thing not demonstrated on this host is a run that spends real money: doing so unasked contradicts the plan's own cost-before-spend discipline. A human must run `alpha-aos doctor --canary . --capability ORDINARY_LOOKUP_CONTROL` once, with EXA_API_KEY set for the research canary, and confirm the observation records arrive."

# Metrics
duration: 46 min
completed: 2026-09-10
status: complete
---

# Phase 3 Plan 6: The Canary Runtime and the Two Doctor Verbs Summary

**A canary now reaches the pinned MCP servers through an alpha-AOS observation front that exists only inside a single-use runtime under the managed state root, the invocation verdict is computed from what that front recorded rather than from anything the model said, and the free discovery evidence and the paid invocation evidence are two separate commands — the paid one printing what it would spend before it spends it.**

## Performance

- **Duration:** 46 min
- **Started:** 2026-09-10T14:13:43Z
- **Completed:** 2026-09-10T14:59:52Z
- **Tasks:** 3
- **Files modified:** 8 (0 created, 8 modified)

## Accomplishments

- **The observation front exists only inside the canary runtime.** `createCanaryRuntime` writes one MCP configuration under `<state>/canary/<projectId>/<harness>/<runId>` in which every pinned server launches `alpha-aos mcp-proxy <id> --observe --observations <path>`. It is rendered through the SAME per-harness renderer everyday configuration goes through, so the server-map key is the harness's own spelling; the everyday `policy` front is byte-identical to what it was, which is D-02 and PROJECT.md's control-plane decision held together.
- **The isolation is a variant of the one launch builder, and where it cannot be proven it is refused.** `createIsolationLaunchSpec` gained a `canary` option: claude gets `--mcp-config <runtime config>` plus exactly one `--strict-mcp-config`, and the project's own `.mcp.json` is deliberately excluded for that run. codex, pi, hermes and antigravity get a blocked reason naming precisely what is missing — codex's `--strict-config` constrains how configuration is read, not which configuration is read, and that distinction is written into the absence table rather than glossed.
- **The verdict comes from the proxy.** `decideInvocation` sees observation records and nothing else. A test feeds a harness excerpt that says at length that it called `web_search_exa` and `firecrawl_scrape`, with an empty observation list, and asserts the axis does not move; a paired control with one recorded call proves the axis moves when there IS evidence, so the negative is not vacuous.
- **Four D-02 invariants are refusals with stable codes,** not descriptions of what happened to work: a runtime outside its state root, a launch pointing a harness config root outside the runtime, an environment name outside the platform floor plus the canary's own declaration, and a second run through a spent runtime.
- **Two commands, and the paid one states its cost first.** `doctor --discovery` skips every oracle that would spend a model turn — reading that flag from `ORACLE_DEFINITIONS` rather than restating it — so it needs no credential and runs on every platform. `doctor --canary` announces every cost line before the first run starts and refuses with 03-05's blocked codes rather than running and failing.
- **Both record through one ledger.** `canaryProof` turns a run into a `CapabilityProof`; the discovery sweep contributes both halves of each paired unit. A refused run has no `OracleRecord` and is reported rather than recorded — the ledger records what was proven, and a run that was refused proved nothing.

## Task Commits

1. **Task 1: The canary runtime — the same servers, fronted, only here** — `d71e25d` (feat)
2. **Task 2: The user's real configuration survives a canary run, proven** — `badc792` (test, RED) → `4857af4` (feat, GREEN)
3. **Task 3: Two commands — the free sweep and the paid canary** — `033b82f` (feat)

**Plan metadata:** the `docs(03-06)` commit carrying this file, `.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/WINDOWS.md`. Named rather than hashed: it is the commit this sentence is inside, so any hash written here is stale the moment it is written.

_Task 2 was a TDD task; RED and GREEN are separate commits. No REFACTOR commit — see TDD Gate Compliance below._

## TDD Gate Compliance

| Gate | Commit | Evidence |
|---|---|---|
| RED | `badc792` `test(03-06)` | 33 discovered, 29 pass, 4 fail — every failure on an assertion for the planned behaviour, against compiling stubs. `gsd-tools check tdd-red-evidence` returned **`RED_EVIDENCE_OK` / `target_test_failed`** for the target test "a canary run leaves every harness config root byte-identical and gains no entry". |
| GREEN | `4857af4` `feat(03-06)` | `dist/test/canary.test.js` + `dist/test/isolation.test.js` 56 tests, fail 0. Full suite 581 tests, fail 0. |
| REFACTOR | — | Not needed; the GREEN implementation warranted no cleanup, so no commit was made (per the cycle's "only commit if changes made"). |

No gate violations.

**One of the five behaviours was already GREEN when the RED commit was written**, and that is recorded rather than hidden: Task 1's action required `runCanary`, and the sink refusal was built there. Behaviour 4 ("an unavailable observation sink refuses before the harness launches") therefore passed on first run and is kept as a regression guard rather than counted as a RED. The other four failed intentionally and are what the RED evidence record names.

## Files Created/Modified

- `src/core/canary.ts` — the runtime (creation, containment, disposal, single-use consumption), the observation sink, `decideInvocation` and its unchecked-argument-pattern report, `runCanary` and its refusal ordering, the environment policy and its two assertions, `canaryPromptArgs`, both sweeps, `canaryProof`, and `CapabilityReportRow` with its two builders. Grew from 1030 to ~2400 lines.
- `src/adapters/isolation.ts` — the `canary` option on `createIsolationLaunchSpec`, the `CANARY_MCP_ISOLATION` table and its per-harness absence reasons, and the project-`.mcp.json` suppression for a canary claude launch.
- `src/core/mcp.ts` — `McpFront`/`McpRenderOptions`: an `observe` front that renders the proxy command for every server, and a `credentialNames` rendering. `assertNoCredentialValue` is now exported so the canary renderer travels the same refusal `planMcpSync` does.
- `src/core/mcp-proxy.ts` — the observation file format: `observationLine`, the field-selective `readObservationRecords`, and the synchronous `createFileObservationSink`.
- `src/cli.ts` — `mcp-proxy <server> --observe --observations <path>`, the `doctor --discovery` and `doctor --canary` branches, `probedHarnessVersions`, `packSkillSourceHash`, `appendCapabilityProofs`, `alphaAosVersion`, the global `--help` flag, and the HELP text recording that the canary is not a preview.
- `src/format.ts` — `formatCapabilityReport`: the three-axis table plus the upper-code-plus-reason lines, with the INCOMPLETE withholding rule at the rendering seam.
- `test/canary.test.ts` — 15 new assertions across the three tasks. Every one is offline; the only live evidence is recorded in this summary, not in the suite.
- `test/isolation.test.ts` — the two canary launch-variant assertions.

## Decisions Made

See `key-decisions` in the frontmatter. The four that most shape what comes next:

1. **Only claude can host a canary.** The two isolation flags RESEARCH.md verified exist on claude and nowhere else. Rather than launching another harness best-effort, the spec records a blocked reason naming what is missing. A canary that may have been talking to the user's own servers proves nothing, so the fail-closed answer is the only honest one.
2. **A declared argument pattern cannot be checked and says so.** `catalog/canaries.yaml`'s `DOCUMENTATION_VERSION_SCOPED` requires `query-docs` to carry a three-segment `libraryId`. `McpObservation` deliberately has no argument field — arguments are where credentials live (T-03-52) — so the verdict reports `uncheckedArgumentPatterns: ["query-docs.libraryId"]` with the reason. **This is a real gap in CAPA-01's structural proof and a later plan must close it or narrow the claim**, not a bookkeeping note.
3. **A canary runtime is single-use, marked before the launch.** The plan asked for "torn down or clearly marked". Marking before the spend is strictly stronger: a run that crashed mid-flight is exactly the case where stale records are sitting there for a repeat to read.
4. **The deployment axis is `null` with a reason on both verbs.** `resolveCapabilityStatus` refuses a caller that omits an axis rather than defaulting one, and there is no mapping from a `CAPA-xx` capability id to a pack receipt. Reporting a recorded absence keeps that refusal's spirit; picking `UNDECIDABLE` would claim a read failure that never happened.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The canary configuration renders credential NAMES for every harness**

- **Found during:** Task 1
- **Issue:** Task 1's acceptance criterion is "the rendered config contains credential NAMES only; a named test sets a credential to a sentinel and asserts the sentinel is absent". The existing claude/antigravity JSON renderer emits no `env` block at all unless a server has fixed env, so the sentinel assertion would have passed over a file that mentioned neither the name nor the value — the exact vacuity 03-05's deviation 2 recorded.
- **Fix:** `McpRenderOptions.credentialNames` renders `{ NAME: "${NAME}" }` per server for every harness; the canary runtime turns it on. The test now asserts the name IS present and the value is NOT, in the same document.
- **Files modified:** `src/core/mcp.ts`, `src/core/canary.ts`, `test/canary.test.ts`
- **Verification:** `test/canary.test.ts#a credential value never reaches the rendered canary runtime configuration, and its name does`
- **Committed in:** `d71e25d`

**2. [Rule 2 - Missing Critical] `assertNoCredentialValue` exported and applied to the canary rendering**

- **Found during:** Task 1
- **Issue:** The canary runtime renders a native MCP document OUTSIDE `planMcpSync`, so the credential-value refusal that guards every other rendering did not apply to it — and this document is written to disk and read by a child process.
- **Fix:** The function is exported and called by `createCanaryRuntime`. One rule, one copy.
- **Files modified:** `src/core/mcp.ts`, `src/core/canary.ts`
- **Verification:** same test as deviation 1; the refusal is now on the path.
- **Committed in:** `d71e25d`

**3. [Rule 2 - Missing Critical] The project's `.mcp.json` is suppressed on a canary claude launch**

- **Found during:** Task 1
- **Issue:** The existing claude branch appends `--mcp-config <projectRoot>/.mcp.json` when one exists. Left alone, a canary would load the project's unfronted servers ALONGSIDE the runtime's fronted ones, and a tool call could cross without being observed — the precise failure T-03-50 describes.
- **Fix:** The `.mcp.json` push is skipped when the `canary` option is present; a named test writes a project `.mcp.json` and asserts exactly one `--mcp-config` value, the runtime's, plus a control asserting the everyday launch still loads it.
- **Files modified:** `src/adapters/isolation.ts`, `test/isolation.test.ts`
- **Verification:** `test/isolation.test.ts#the canary launch variant points claude at the runtime configuration and excludes every other MCP source`
- **Committed in:** `d71e25d`

**4. [Rule 3 - Blocking] `--help` is honoured anywhere in argv**

- **Found during:** Task 3
- **Issue:** The plan's own `<verify>` runs `node dist/src/cli.js doctor --help`. Help was only handled as `args[0]`, so that command ran a real doctor sweep against the machine and printed findings — a request for help answered by probing the host.
- **Fix:** `hasFlag(args, "--help")` short-circuits to HELP for every command.
- **Files modified:** `src/cli.ts`
- **Verification:** `node dist/src/cli.js doctor --help` exits 0, names both modes, and carries "NOT a preview" and "persists a ledger record".
- **Committed in:** `033b82f`

**5. [Rule 1 - Bug] `discoveryRow` falls back to the unit's own incomplete reasons**

- **Found during:** Task 3 (while rendering a sample report to check the output was not vacuous)
- **Issue:** The row read `entry.discovery?.incompleteReasons ?? []`, so an INCOMPLETE unit with no paired-run record rendered "incomplete" with no reason beside it.
- **Fix:** falls back to `unit.incompleteReasons`, which an INCOMPLETE unit always carries.
- **Files modified:** `src/core/canary.ts`
- **Verification:** `test/canary.test.ts#an INCOMPLETE unit renders INCOMPLETE and never the positive's native-use value`
- **Committed in:** `033b82f`

**6. [Rule 2 - Missing Critical] `CanaryRunResult.oracle` and `canaryProof`**

- **Found during:** Task 3
- **Issue:** Task 3 requires both commands to record through the ledger, and `CapabilityProof` requires an `OracleRecord`. A canary result carried an excerpt and an exit code but no fingerprinted record, so there was no honest way to write one.
- **Fix:** `runCanary` builds an `OracleRecord` from the aliased launch command and the stdout/stderr fingerprints; `canaryProof` turns a result into a ledger row, or null when nothing launched.
- **Files modified:** `src/core/canary.ts`, `src/cli.ts`
- **Verification:** live run above wrote 8 discovery proofs; the blocked canary correctly wrote none.
- **Committed in:** `033b82f`

---

**Total deviations:** 6 auto-fixed (4 missing-critical under Rule 2, 1 blocking under Rule 3, 1 bug under Rule 1)
**Impact on plan:** Three of the six close a hole that would have made an acceptance criterion pass while proving nothing. No scope creep — no surface beyond what Tasks 1–3 named.

## Issues Encountered

- **The RED phase could not be five failing tests.** Task 1's action required `runCanary`, which necessarily built the sink refusal, so behaviour 4 was already GREEN. Rather than manufacture a failure, the RED was written around the four behaviours that genuinely did not exist (three new refusals plus single-use runtimes) and the fifth is documented above as a regression guard. `check tdd-red-evidence` verified the record against the target test.
- **`node scripts/run-tests.mjs` does not emit TAP,** which the RED-evidence verb parses. The record was produced from `node --test --test-reporter=tap dist/test/canary.test.js` — the same compiled files, a machine-readable reporter.
- **The declared argument pattern is unverifiable through the observation record.** Recorded as decision 2 and in the verdict itself. Not resolved here; it is a real limit on CAPA-01's structural proof.
- **A `CanaryBoundaryError` for an offending config root names only the NAMES.** The values are private paths and this message reaches stderr; naming them would have been the convenient choice and the wrong one.

## Known Stubs

None. Every function this plan introduced is implemented; the RED-phase stubs were filled in the GREEN commit of the same task and no stub survives in `HEAD`.

## Threat Flags

None. Every surface this plan adds was already in the plan's `<threat_model>`: the observation front (T-03-50), the transcript-versus-record split (T-03-51), the credential-free rendering and record shape (T-03-52), the cost-before-spend and readiness refusal (T-03-53), and the sink refusal (T-03-54).

## Re-measured on this host (orchestrator carry-forward)

The orchestrator asked that oracle and readiness facts be measured here rather than inherited. Measured live this session, 2026-09-10:

| Command | Measured result |
|---|---|
| `node dist/src/cli.js doctor --discovery .` | exit 0. Two applicable packs (`BROWNFIELD_INIT`, `MCP_SERVER`). **codex and pi were driven for real** and produced `COMPLETE` evidence units; claude was skipped as spending a model turn; hermes was skipped as having no oracle. 8 proofs written to the ledger. The run took real time, not the ~200 ms signature of silently taking an `unsupported` branch. |
| `env -u EXA_API_KEY … doctor --canary . --capability RESEARCH_MULTI_SOURCE` | exit 2. Cost announced first (`1 spend a model turn`, `SPENDS RESEARCH_MULTI_SOURCE on claude`), the readiness probe ran the real `claude mcp list`, and the run was refused with `MISSING_CREDENTIAL` / `EXA_API_KEY` and a next action. **No harness was launched, no ledger row was written, and the runtime was removed.** |
| `grep -v '^\s*[/*]' src/adapters/isolation.ts \| grep -c strict` | 4 |

Carried forward for later plans:

- **`READINESS_DEFINITIONS`'s holes were NOT filled from documentation.** This plan needed no new readiness oracle, so codex's absent probes and pi's absent connection listing remain recorded absences with their reasons. Nothing here guessed one.
- **`assertCanaryContext`'s refusal string still names `alpha-aos doctor --canary`,** and this plan declares exactly that verb. The string and the command agree; a later rename must move both.
- **No paid canary has been run on this host.** Every step up to the launch is proven live; the launch-and-verdict path is proven offline with an injected launcher. Coverage entry D7 records this as a human check rather than claiming it.

## User Setup Required

None — no external service configuration was introduced. `EXA_API_KEY` remains a declaration consumed by the readiness probe; nothing in this plan reads its value.

## Next Phase Readiness

Ready for plan 03-07. What it inherits:

- `createCanaryRuntime` / `runCanary` / `disposeCanaryRuntime` — a single-use, contained, observed runtime, and a run whose axis is decided from records.
- `runDiscoverySweep` and `runCanarySweep` — the free and paid sweeps, both with injectable drivers so a later plan can exercise them offline.
- `CapabilityReportRow` + `formatCapabilityReport` — the three-axis rendering. A later plan that adds a status surface should render THROUGH this rather than adding a fourth vocabulary.
- `canaryProof` + `appendCapabilityProofs` (CLI) — the one ledger write path, which refuses an unreadable ledger rather than overwriting it.

Three things a later plan must not inherit blindly:

1. **A declared argument pattern is not checkable from the observation record.** Either the record shape changes (and the T-03-52 reasoning must be re-argued) or CAPA-01's structural claim narrows to "the tool was called" rather than "with a version-scoped id".
2. **Only claude can host a canary today.** Every other harness's canary launch is blocked with a recorded reason. The cross-OS matrix in Phase 7 will find the same wall.
3. **The paid path has never actually spent.** D7 above is the one deliberately-unverified claim in this plan.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-10*

## Self-Check: PASSED

- All 8 modified files exist on disk and carry this plan's changes.
- All four task commits (`d71e25d`, `badc792`, `4857af4`, `033b82f`) are present in `git log`.
- `commits: 5` is MEASURED: `git rev-list --count bfac9a6..HEAD`, from the ledger recorded before the first commit. Four task commits plus this plan's own metadata commit, which the amend below folds the WINDOWS.md entries into.
- Every task's `<acceptance_criteria>` re-run and passing; plan-level `<verification>`: `npm test` → 586 tests, fail 0, 6 pre-existing platform skips; the sentinel test passes; `doctor --discovery` completed on this host with no harness credential read on that path.
