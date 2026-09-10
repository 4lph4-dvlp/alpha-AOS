---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 04
subsystem: testing
tags: [capability-oracle, harness-adapter, discovery, evidence, parsing, jsonl, codex, pi, claude]

# Dependency graph
requires:
  - phase: 01-safe-operation-boundary
    provides: "runProcess with a shell-free bounded launch, commandProbeEnvironment, resolveCommand / isDirectlyExecutable, createRedactedExcerpt, aliasPath / createPathAliases"
  - phase: 02-project-capability-planning
    provides: "PROJECT_SKILL_ROOTS as the table of roots alpha-AOS WRITES to, which this plan reads and deliberately does not widen"
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "plan 03-03's capability ledger — pairEvidence, EvidenceUnit, CapabilityProof, AncestorFreedom, OracleRecord and the three-value native-use axis this module is narrowed against"
provides:
  - "src/adapters/capability-oracle.ts — one per-harness oracle definition table, one bounded driver, three parsers, and the paired inside/outside run"
  - "ORACLE_DEFINITIONS — codex, pi and claude oracles with antigravity and hermes as explicit recorded nulls"
  - "runDiscoveryOracle — three outcomes: unsupported, unparsed, or a parsed answer that may legitimately be empty"
  - "DiscoveryAxis — discovered | unverified only, so a listing can never become invocation evidence"
  - "parseCodexPromptInput, parsePiCommands, parseClaudeInitEvent, splitJsonLines, readOracleOutput"
  - "runPairedDiscovery — the same command from two directories, paired into one EvidenceUnit"
  - "assertControlAncestorFreedom — the constructed negative control and its auditable checked-ancestor list"
  - "DISCOVERED_PROJECT_SKILL_ROOTS — what each harness READS, as distinct from what alpha-AOS writes"
  - "resolveDirectLaunch — npm's Windows .cmd shim mapped to its proven direct node equivalent"
  - "test/helpers/oracle-fixtures.ts — seven live oracle recordings, path-aliased, so every parser test runs offline"
  - "ProcessSpec.excerptBytes — an opt-in read budget for a caller that must parse rather than display"
affects: [canary-runner, invocation-evidence, connection-oracle, status-rendering, one-shot-lifecycle, doctor]

actuals:
  tokens: 43408
  tasks: 3
  commits: 4
plan_head_before: 9300a75383b187426149de694bf74d6cd5b90e35

tech-stack:
  added: []
  patterns:
    - "a per-harness definition table plus one generic driver, mirroring src/adapters/harnesses.ts, so no core caller branches on a harness id"
    - "three outcomes rather than two: unsupported, unparsed, and an answer — an empty list is only ever the third"
    - "a narrowed literal union whose excluded member is ABSENT from the file rather than subtracted from a wider type, proven a subset by a satisfies check"
    - "a recorded fixture is the live output with an enumerated substitution list, not a hand-written imitation"
    - "a negative control is constructed and its ancestry asserted before it is used, and the assertion is recorded with the evidence"
    - "an exemption is recorded on the record it applies to, so it is auditable rather than silent"

key-files:
  created:
    - src/adapters/capability-oracle.ts
    - test/helpers/oracle-fixtures.ts
    - test/capability-oracle.test.ts
  modified:
    - src/core/process.ts
    - src/core/redaction.ts

key-decisions:
  - "DiscoveryAxis is its own two-member union, not an Exclude<> of the ledger axis, so the selection value is absent from this file rather than merely excluded"
  - "ProcessSpec gained an optional excerptBytes: the default 4 KiB excerpt truncated every real oracle answer into an unparsed one"
  - "the ancestor-freedom walk exempts the HOME directory and records the exemption on the entry rather than applying it silently"
  - "a contaminated control gets no negative taken in it at all; the unit comes back INCOMPLETE naming the offending ancestor"
  - "resolveDirectLaunch maps npm's Windows .cmd shim to node plus the script beside it; any other shim stays unsupported"
  - "DISCOVERED_PROJECT_SKILL_ROOTS is what each harness READS and is deliberately not PROJECT_SKILL_ROOTS"
  - "the second codex project root is reported as CODEX_SECOND_PROJECT_ROOT_SHADOW and not added as a write target"

patterns-established:
  - "Absent-not-subtracted: a narrowed union omits the forbidden member from the file, and a grep over non-comment lines is the regression test"
  - "Recorded-with-substitutions: a fixture states every change made to the live output it came from"
  - "Constructed control: a negative is only taken in a directory whose ancestry was walked and asserted, and the walk rides on the evidence"
  - "Exempt-and-say-so: an exemption is written into the record it applies to"

requirements-completed: [CAPA-05, CAPA-06]

coverage:
  - id: D1
    description: "One adapter holds all three oracle commands, launches them through the bounded process adapter, and reports unsupported or unparsed rather than simulating an answer"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#every harness has an oracle definition or an explicit recorded null"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#only the claude oracle spends a model turn, and it carries a prompt because it must"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#a harness with no oracle returns unsupported naming why, and never a simulated empty list"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#an unresolvable executable returns unsupported and does not throw"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#an unsupported reason and an unparsed reason are separate fields on the result"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*[/*]' src/adapters/capability-oracle.ts | grep -c runProcess — 2; no child_process, spawn, execFile or exec in the file"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three harness output shapes parse deterministically OFFLINE from recorded live runs, with positional root labels resolved to absolute paths before anything is keyed on them"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#the recorded codex output parses to its skills with ABSOLUTE roots resolved from the positional labels"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#the same positional codex label resolves to a different absolute root outside the project"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#the recorded pi output separates project scope from user scope by the harness's own field"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#pi's scope comes from the nested source-info object, not the flat field its documentation describes"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#the recorded claude init event parses to its skills and its MCP servers, with pending recorded not judged"
        status: pass
      - kind: other
        ref: "PATH=/c/Windows/System32:<node> node scripts/run-tests.mjs --files dist/test/capability-oracle.test.js — 23 tests, fail 0, with no harness resolvable"
        status: pass
    human_judgment: false
  - id: D3
    description: "The pi RPC framing hazard is pinned: a JSON string carrying U+2028 and U+2029 yields exactly one record, and no line-reader module is imported"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#a pi record carrying a line separator and a paragraph separator inside a JSON string is ONE record"
        status: pass
      - kind: other
        ref: "grep -c node:readline src/adapters/capability-oracle.ts — 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "A skill whose frontmatter name differs from its directory is recorded under BOTH names per harness, and the recorded pair differs per harness in the measured direction"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#a scientific-pack skill is recorded under BOTH names, and the pair differs per harness"
        status: pass
      - kind: other
        ref: "live runs this session: codex advertised literature-review, pi advertised skill:literature-review, claude advertised scientific-thinking-literature-review, for one identical file"
        status: pass
    human_judgment: false
  - id: D5
    description: "An unparseable oracle output records unverified with a reason and NO skill list, never an empty one"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#a truncated recording yields an unparsed reason and NO skill list, never an empty one"
        status: pass
    human_judgment: false
  - id: D6
    description: "One command run from two directories forms one evidence unit whose negative control is constructed, its ancestry asserted, and the checked list recorded on the negative half"
    requirement: "CAPA-06"
    verification:
      - kind: integration
        ref: "test/capability-oracle.test.ts#one codex command run from two directories forms one evidence unit with an asserted control"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#the ancestor walk reaches the filesystem root and records every directory it checked"
        status: pass
      - kind: integration
        ref: "test/capability-oracle.test.ts#a project skill root in an ancestor of the control makes the unit INCOMPLETE naming that ancestor"
        status: pass
      - kind: integration
        ref: "test/capability-oracle.test.ts#a pi unit carries two negatives: the different directory and the same directory with trust withheld"
        status: pass
      - kind: integration
        ref: "test/capability-oracle.test.ts#a harness with no oracle produces a recorded unsupported paired result, never a false negative"
        status: pass
    human_judgment: false
  - id: D7
    description: "Discovery can never masquerade as invocation: the axis is narrowed at the type level and the selection value is absent from the module source"
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#this module cannot produce the invocation axis, at the type level and in its own source"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*[/*]' src/adapters/capability-oracle.ts | grep -c invoked — 0"
        status: pass
    human_judgment: false
  - id: D8
    description: "The second codex project root is reported as a named finding with a stable code and is not added as a write target"
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#the second codex project root, when populated, produces the shadow finding with its stable code"
        status: pass
    human_judgment: false
  - id: D9
    description: "The CAPA-05 and CAPA-06 edge-probe rows remain UNRESOLVED and must be raised with the developer rather than closed by a verifier"
    verification: []
    human_judgment: true
    rationale: "Both rows came back unclassified from the deterministic edge probe and are carried forward unresolved. CAPA-05 is a provenance-and-use requirement whose predicates come from CONTEXT.md D-05/D-07 and RESEARCH.md Pattern 2, not from a data-shape criterion, so no automated check can decide whether the developer considers either row answered."
  - id: D10
    description: "Cross-OS behaviour of the three oracles is unproven: every live run in this plan is from one Windows 11 host"
    verification: []
    human_judgment: true
    rationale: "Assumption A1 is explicit that the oracle findings do not generalise without observation. The parser tests are portable by construction and were demonstrated with no harness on PATH, but whether codex, pi and claude produce these exact shapes on macOS and Linux can only be answered by the three-OS matrix. A leg where an oracle is absent or differently shaped records unsupported or unparsed with its reason, which is a visible signal rather than a silent fallback — but it is not the same as having observed the shape."

# Metrics
duration: 39 min
completed: 2026-09-10
status: complete
---

# Phase 3 Plan 04: Free, Offline, Deterministic Discovery Oracles Summary

**Three harnesses will each name the skills they loaded before any model turn, and two of them cost nothing — so the DISCOVERY axis becomes an automated-suite fact: one adapter, three parsers pinned against seven live recordings that replay with no harness installed, and a paired inside/outside run whose negative control is walked to the filesystem root and asserted before it is allowed to count.**

## Performance

- **Duration:** 39 min
- **Started:** 2026-09-10T12:39:57Z
- **Completed:** 2026-09-10T13:19:16Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- **The discovery axis now costs nothing on two of three harnesses, and the split is real rather than planned.** `codex debug prompt-input` and `pi --mode rpc` both answer without a model turn; only claude spends one, and `costsModelTurn` is a field on the definition rather than a fact someone has to remember. That is what reserves the expensive scripted-intent run for the INVOCATION axis alone, which is the structural reason CI can own discovery at all — a bare model turn in an empty fixture costs real money and CI has no credential.

- **Three outcomes, not two, and the third is the one that matters.** `runDiscoveryOracle` reports `unsupported` (no oracle exists, or none resolved), `unparsed` (an oracle ran and this tool could not read what it said, skill list NULL plus the stderr fingerprint), or an answer that may legitimately list nothing. An unparseable output can never become "not discovered": an empty list and a failed read have the same shape at the call site and call for opposite next actions, which is exactly what assumption A2 warns about for a subcommand living under a `debug` namespace.

- **Seven live recordings, and the substitutions are enumerated rather than implied.** `test/helpers/oracle-fixtures.ts` holds the stdout of runs made while executing this plan: codex, pi and claude inside a probe project and in a constructed control, plus pi in the project with trust withheld. Host roots are aliased to synthetic ABSOLUTE roots in all three spellings a recording uses — including the dash-flattened project name claude embeds in `memory_paths`, which no path alias would have caught. Third-party prompt prose is elided and personal connector names replaced, with counts, order and statuses preserved. The module header lists every change, so a reader can tell what the harness said from what this repository wrote.

- **The offline claim was demonstrated, not asserted.** Run with `PATH` holding only `System32` and the node directory, the suite is 23 tests and `fail 0`: the parser tests pass on fixtures, and the paired tests take the recorded-unsupported branch in 100 ms instead of the 4.7 s a live run takes. That is precisely what a CI leg does, and it is a green signal that still carries the reason no oracle ran.

- **The positional-label trap is closed, and the recordings prove it is a trap.** codex names its skill roots `r0`…`r7` and the labels SHIFT: inside the probe project `r0` is `<project>/.codex/skills`, and in the control directory the same `r0` is `<home>/.agents/skills`. A ledger keyed on the label would call those the same root. Every label is resolved to an absolute path inside the parser and no label ever leaves it.

- **Pitfall 2 is now measured on all three harnesses at once, from one file.** The probe project held `scientific-thinking-literature-review` whose frontmatter says `literature-review`. codex advertised `literature-review`, pi advertised `skill:literature-review`, claude advertised `scientific-thinking-literature-review`. `DiscoveredSkill` carries both `advertisedName` and `directoryName` per harness and there is no canonicalizer, because a canonicalizer would pick a winner and be wrong on two of three — and neither the directory nor the frontmatter may be rewritten, since the directory is what the lock's `sourceSha256` keys on.

- **pi's scope comes from the nested object, and a record that disagrees with itself proves which field was read.** pi 0.85.1 emits `sourceInfo.scope`; its shipped `docs/rpc.md` still describes a flat `location`. A test feeds a record whose flat field says `user` and whose nested field says `project`, and asserts `project`. Reading the documented field would have yielded `undefined` on every entry — an undefined indistinguishable from the CAPA-06 answer.

- **The RPC framing hazard is pinned by a test rather than by a comment.** `splitJsonLines` splits on U+000A and nothing else, with no module behind it. A record carrying U+2028 and U+2029 inside a JSON string yields exactly one record; a line reader would have made three, of which two fail to parse and one is a truncated skill list — a CAPA-06 negative manufactured by the framing rather than reported by the harness.

- **The negative control is constructed, asserted, and the assertion travels with the evidence.** `assertControlAncestorFreedom` walks from the control directory to the filesystem root, checks every ancestor against the roots that harness READS, and records the checked list on the negative half. A test plants `.agents/skills` in an ancestor and the unit comes back INCOMPLETE naming it — and no negative is taken at all, because a negative from a contaminated control is worse than none: it reads as proof.

- **One command, two directories, live, and it works.** On this host the codex unit is COMPLETE with the axis `discovered`, the same resolved command string on both halves and different working directories, the project skill present in the positive and absent in the negative. The pi unit carries both negatives — the different directory and the same directory with trust withheld — each with zero project-scope skills.

- **Discovery cannot become invocation, at two layers.** `DiscoveryAxis` is its own two-member union proven a subset of the ledger axis by a `satisfies` check, so a caller needs no cast while the selection value is ABSENT from the file rather than subtracted from a wider type. A test greps the module's own non-comment lines for it and asserts an empty result, so the property survives an edit that a type alone would not catch.

## Task Commits

1. **Task 1: The per-harness oracle definition table and its bounded driver** — `41c04a6` (feat)
2. **Task 2: The three parsers, the framing rule, and recorded offline fixtures** — `84573ea` (test, RED) → `5b1e760` (feat, GREEN)
3. **Task 3: The paired inside/outside run and the constructed negative control** — `0fb2806` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `src/adapters/capability-oracle.ts` — `DiscoveryAxis`, `DISCOVERY_AXES`, `DiscoveredScope`, `DiscoveredSkill`, `DiscoveredMcpServer`, `OracleFinding`, `OracleParse`, `OracleParseContext`, `OracleParseError`, `OracleDefinition`, `DiscoveryResult`, `PI_GET_COMMANDS_REQUEST`, `ORACLE_PLACEHOLDER_PROMPT`, `ORACLE_DEFINITIONS`, `ORACLE_TIMEOUT_MS`, `ORACLE_EXCERPT_BYTES`, `DirectLaunch`, `resolveDirectLaunch`, `RunDiscoveryOracleOptions`, `runDiscoveryOracle`, `OracleReading`, `readOracleOutput`, `splitJsonLines`, `parseCodexPromptInput`, `parsePiCommands`, `parseClaudeInitEvent`, `DISCOVERED_PROJECT_SKILL_ROOTS`, `ORACLE_FINDING_CODES`, `ControlAssertion`, `assertControlAncestorFreedom`, `PairedNegative`, `RunPairedDiscoveryOptions`, `PairedDiscovery`, `runPairedDiscovery`, `lastPathSegment`, `joinDiscovered`, `isAbsoluteEitherPlatform`, `endsWithSegments`.
- `test/helpers/oracle-fixtures.ts` — seven recordings plus `SYNTHETIC_PROJECT_ROOT`, `SYNTHETIC_CONTROL_ROOT`, `SYNTHETIC_HOME_ROOT`. The header states the probe layout, the provenance, and the four classes of substitution applied.
- `test/capability-oracle.test.ts` — 23 tests: four over the definition table, four over the driver's unsupported paths, eight over the parsers against recordings, and seven over the paired run, the constructed control, the shadow finding and the axis prohibition.
- `src/core/process.ts` — `ProcessSpec.excerptBytes`, threaded through `BoundedStream.snapshot` / `finish`. Optional, defaulted, and used by exactly one caller.
- `src/core/redaction.ts` — `createRedactedExcerpt` takes an optional `budgetBytes`. Default unchanged; redaction, aliasing, the code-point-safe cut and the whole-stream fingerprint all unchanged.

## Decisions Made

- **`DiscoveryAxis` is its own union, not `Exclude<NativeUseState, …>`.** The acceptance criterion is a grep over non-comment lines, and a derived type would put the forbidden word in one. A `satisfies readonly DiscoveryAxis[]` check on `DISCOVERY_AXES` proves the narrow union is still assignable to the ledger's, so a caller needs no cast and nothing here can widen it.
- **The parse reads the excerpt, so the excerpt budget had to become a caller's choice.** `runProcess` returns bounded redacted excerpts and no raw bytes — correctly. But the default budget is 4 KiB, and a codex skills block measured 11 KiB inside a 26 KiB rendered prompt. Every live oracle would have reported `unparsed` naming the cut. `excerptBytes` is opt-in, defaulted, and changes only what one call retains; what reaches the ledger is `OracleRecord`, which carries fingerprints and no output at all.
- **The home directory is the one exempt ancestor, and the exemption is written into the record.** `~/.agents/skills`, `~/.claude/skills` and `~/.codex/skills` all exist on an ordinary developer host, and every Windows temporary directory sits beneath them. An unexempted rule reports every control directory on such a host as contaminated, and no CAPA-06 negative could ever be taken anywhere. Those roots are the harness's own USER roots — measured, pi classifies what it loads from them as `scope: "user"`, which is the side of the line a negative control is supposed to be on. The exemption is recorded on the checked-ancestor entry rather than applied silently, so it is auditable.
- **A contaminated control gets no negative taken in it.** The alternative — take it and mark it unusable — puts a false negative into the record where a later reader can find it. The unit comes back INCOMPLETE, the offending ancestor is named in `incompleteReasons` and in a finding with a stable code, and `unit.negative` is null. The same rule handles a control that DISCOVERED the capability: that is evidence against CAPA-06, not a control for it, so it is discarded with a named finding rather than paired into a unit that would read COMPLETE.
- **`DISCOVERED_PROJECT_SKILL_ROOTS` is separate from `PROJECT_SKILL_ROOTS`.** The first is what a harness READS, the second is what alpha-AOS WRITES. codex reads `.agents/skills` and `.codex/skills`; pi reads `.agents/skills` and `.pi/skills`; claude reads `.claude/skills`. The ancestor check has to cover everything the harness would load from, or it clears a control whose ancestor holds a root the harness reads anyway.
- **The second codex project root is reported and left alone.** `CODEX_SECOND_PROJECT_ROOT_SHADOW` fires only when a skill actually resolved under `<project>/.codex/skills`, because an empty directory casts no shadow. It is not added to `PROJECT_SKILL_ROOTS`: one write root per harness keeps removal confinement simple and `.agents/skills` is the cross-harness standard. A test asserts both halves — the finding fires, and the write table still names exactly one codex root.
- **claude's `directoryName` is filled from its advertised name, and that is claude's statement rather than an inference.** claude publishes directory names and no paths. Leaving `directoryName` null would lose the fact that claude keys on the directory, which is half of what Pitfall 2 measures. `path` and `root` stay null, so nothing is invented that claude did not publish.
- **`pending` MCP servers are recorded, never judged.** The init event is a REGISTRATION fact. Every server is legitimately `pending` there with no tools yet, so the rule that a connected server with zero tools is a failure cannot be evaluated at init at all. A test asserts no finding is raised for it. The connection oracle is a separate command and belongs to a later plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The default excerpt budget truncated every real oracle answer**

- **Found during:** Task 1 (authoring the driver)
- **Issue:** `runProcess` returns only a `RedactedExcerpt`, whose budget is fixed at 4096 UTF-8 bytes in `LIMITS.excerptBytes`. The codex oracle's rendered prompt measured 26,339 bytes on this host with an 11,018-byte skills block; pi's `get_commands` response measured 11,990 bytes. Every live oracle would therefore have been cut mid-token and reported `unparsed`, making `runPairedDiscovery` structurally unable to produce evidence.
- **Fix:** `createRedactedExcerpt` gained an optional `budgetBytes` parameter defaulting to the existing limit, threaded through `BoundedStream.snapshot` / `finish` and exposed as `ProcessSpec.excerptBytes`. The oracle adapter passes an explicit 512 KiB read budget. Everything that makes an excerpt safe is untouched: secrets are replaced and private roots aliased BEFORE the cut, the cut is still code-point-boundary safe, `maxOutputBytes` still bounds what is ever held, and the fingerprint is still taken over the whole stream. What reaches the ledger is `OracleRecord`, which carries fingerprints and no output.
- **Files modified:** `src/core/process.ts`, `src/core/redaction.ts` — both outside this plan's `files_modified`.
- **Verification:** `npm test` 545 tests, fail 0, including every existing redaction and process suite with the default budget unchanged. The live codex and pi paired runs parse.
- **Committed in:** `41c04a6` (Task 1 commit)

**2. [Rule 3 - Blocking] codex and pi resolve to npm `.cmd` shims on Windows, so every oracle reported unsupported**

- **Found during:** Task 3 (the live paired assertions completed in ~200 ms, which is the unsupported branch, not a run)
- **Issue:** `resolveCommand` returns `…\npm\codex.cmd` and `…\npm\pi.cmd`, and `isDirectlyExecutable` correctly refuses a `.cmd`. Task 3's precondition — "codex and pi resolve on PATH" — was satisfied and yet no oracle could launch, so the paired live assertions silently exercised only the recorded-unsupported branch.
- **Fix:** `resolveDirectLaunch` reads the shim, extracts the quoted `node_modules\…\*.js` entry npm's generated launcher names, verifies that the path exists and is under the shim's own directory, and returns `process.execPath` plus that script. This is the same "proven direct equivalent" reasoning `resolveNodePackageCli` already applies to the npm and npx shims. Any shim that does not match returns null and the caller reports `unsupported` — nothing is handed to a shell, and `shell: false` is unchanged.
- **Files modified:** `src/adapters/capability-oracle.ts`
- **Verification:** the two paired tests went from ~200 ms to 4.7 s and 5.3 s and now assert on real output: the codex unit is COMPLETE with the axis `discovered`, and the pi unit carries both negatives with zero project-scope skills in each. `an unresolvable executable returns unsupported and does not throw` still passes.
- **Committed in:** `0fb2806` (Task 3 commit)

**3. [Rule 1 - Bug] The ancestor-freedom rule reported every control directory on a developer host as contaminated**

- **Found during:** Task 3 (both control tests failed on the first run)
- **Issue:** The walk flagged any ancestor holding a root the harness reads. `~/.agents/skills`, `~/.claude/skills` and `~/.codex/skills` all exist on this host, and `tmpdir()` on Windows is `C:\Users\alpha\AppData\Local\Temp` — beneath all of them. Every `mkdtemp` control directory was therefore reported unusable, and no CAPA-06 negative could ever be taken. The deliberately-contaminated fixture reported two offending ancestors rather than one.
- **Fix:** the home directory is exempt, and the exemption is written onto the checked-ancestor entry (`… holds .agents/skills as the harness user root, loaded as user scope — exempt`) rather than applied silently. Those roots are the harness's own user roots; the live pi recordings show every skill loaded from them classified `scope: "user"`, which is the side of the line a control belongs on. A project skill root in any other ancestor is still disqualifying, which is what the contaminated-parent test now proves.
- **Files modified:** `src/adapters/capability-oracle.ts`
- **Verification:** `the ancestor walk reaches the filesystem root and records every directory it checked` and `a project skill root in an ancestor of the control makes the unit INCOMPLETE naming that ancestor`, plus the two live paired tests which could not otherwise have run.
- **Committed in:** `0fb2806` (Task 3 commit)

**4. [Rule 1 - Bug] The RED test encoded the codex-visible skill set as pi's**

- **Found during:** Task 2 GREEN
- **Issue:** One shared `PROJECT_SKILL_DIRECTORIES` constant was asserted against both harnesses. pi reported `zzz-pi-widget` where the constant said `zzz-codexlocal-widget`.
- **Fix:** verified against the raw recording before changing anything: pi reads `.agents/skills` and `.pi/skills` and never `.codex/skills`, so the three harnesses see three different subsets of one probe project. The constant was split into `CODEX_PROJECT_SKILLS` and `PI_PROJECT_SKILLS` with a comment recording why they differ. The implementation was not changed — the test expectation was wrong, the same way 02-12's RED expectation was.
- **Files modified:** `test/capability-oracle.test.ts`
- **Verification:** `the recorded pi output separates project scope from user scope by the harness's own field`
- **Committed in:** `5b1e760` (GREEN commit)

**5. [Process] Commits landed on `main`, the protected/default branch**

- **Found during:** Task 1 (pre-commit HEAD assertion)
- **Issue:** the executor's pre-commit guard halts on a protected branch unless `git.allow_default_branch_commits` is set, and `.planning/config.json` does not set it.
- **Fix:** proceeded, and recorded it here rather than silently — identical to the note in 03-01, 03-02 and 03-03. `git.branching_strategy` is `"none"`, the orchestrator explicitly degraded worktree isolation for this phase and named `main` as the intended target, and every previously completed plan in this project committed to `main`. No destructive git operation was used and no configuration was modified.

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs) + 1 process note
**Impact on plan:** No scope creep. Deviations 1 and 2 are the difference between an adapter that compiles and one that can actually read a harness — without either, every live oracle on this host reports a refusal and the paired run has nothing to pair. Deviation 3 corrects a rule that was too strict in exactly the direction that would have made the phase's central evidence unobtainable, and it was found by tests rather than by reasoning. Deviation 4 corrected a test, not an implementation, against the raw recording.

## Issues Encountered

- **Backslash escapes do not survive this shell's heredocs.** A `\\n` written inside `python - <<'PY'` arrived as a real newline, and `\\u2028` arrived as U+2028, twice producing source that would not compile. 03-03 recorded the apostrophe half of this; the backslash half is the same defect. Anything containing a backslash escape must be routed through the Write tool or built with `chr(92)`. Worth knowing for any later plan in this repository that generates source through the shell.
- **A regex `.` does not match U+2028, which is how the framing hazard announced itself.** An attempt to rewrite the separator constants with `/const LINE_SEPARATOR = .*;/` silently matched nothing, because U+2028 is a line terminator to the regex engine. That is the same property that makes a line reader tear a pi record in three, encountered from the other side while writing the test for it.
- **claude's init event is not the first line of its stream.** Four `hook_started` / `hook_response` events preceded it on this host. A parser that read line 0, as a naive reading of "the init event is emitted first" would suggest, reads a hook. The parser finds it by type and subtype and a comment records why.
- **Capturing the claude recording spent two model turns.** They are the only paid operations in this plan, and they are the reason the plan splits the axes: claude has no zero-cost variant, and an empty prompt exits non-zero before the init event is emitted.

## Deferred Issues

None.

## Known Stubs

None. Every export in `src/adapters/capability-oracle.ts` is implemented; the `not implemented` throws that carried the RED commit were replaced in `5b1e760` and `0fb2806`.

## Threat Flags

None. The surfaces this plan introduces are the three harness subprocess launches already named in the plan's threat register (T-03-30 through T-03-34), and each is mitigated as the register specifies. `ProcessSpec.excerptBytes` widens what one call RETAINS in memory, not what it accepts or where it writes; it is bounded, opt-in, applies after redaction and aliasing, and no oracle output reaches the ledger in any form other than a fingerprint.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **The discovery half of every CAPA-05/CAPA-06 assertion is now buildable offline.** `runPairedDiscovery` returns an `EvidenceUnit` from `pairEvidence`, so plan 03-08's canary runtime supplies only the INVOCATION half and the ledger already knows how to refuse an unpaired positive.
- **CAPA-05 and CAPA-06 are declared but NOT claimed by this plan.** `requirements.ready-ids` reports 0 of 2 ready: sibling plans in this phase declare both and have not finished, so the shared-ID gate correctly holds them open. The paired canary that proves CAPA-06 end to end runs in 03-08.
- **Both edge-probe rows stay UNRESOLVED and must be raised, not closed.** CAPA-05's row is authored here and CAPA-06's in 03-03; both came back `unclassified`. The predicates implemented here come from CONTEXT.md D-05/D-07 and RESEARCH.md Patterns 2 and 3. See coverage entry D9.
- **Every oracle finding in this plan is from one Windows 11 host (assumption A1).** The parser tests are portable and were demonstrated with no harness on PATH; the live paired assertions are the part that can differ. A leg where an oracle is absent or differently shaped records `unsupported` or `unparsed` with its reason and the tests assert that recorded absence, so a platform difference is a visible signal rather than a silent fallback — but the shapes themselves are unobserved on macOS and Linux. See coverage entry D10.
- **`resolveDirectLaunch` is Windows-shaped and untested elsewhere.** On POSIX, npm installs an extensionless shim that `isDirectlyExecutable` accepts and the kernel launches via its shebang, so the branch is never taken. If a POSIX leg reports `unsupported` for codex or pi, this function is what to widen.
- **Two observations that differ from what RESEARCH.md recorded, left as observations rather than promoted.** Claude's init event on this host lists MCP servers with MIXED statuses — `pending`, `connected` and `needs-auth` in one event — and 71 of 103 tools already carry an `mcp__` prefix, where Pitfall 5 measured every server `pending` with zero MCP tools. The parser is written for the general case (status recorded, never judged) so both observations are handled, but Pitfall 5's specific claim is narrower than it reads. A later plan that builds the connection oracle should re-measure rather than inherit it.
- **Baselines for the next plan:** `npm test` is 545 tests (539 pass, 0 fail, 6 skipped) and `npm run build:check` reports `72 inputs, 138 outputs`. Any other total is a suite that stopped compiling.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-10*

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 | — | `41c04a6` | — | Not a TDD task (`type="auto"` without `tdd="true"`); its eight tests were written with the table and driver in one commit |
| 2 (tdd) | `84573ea` | `5b1e760` | — (none needed) | `RED_EVIDENCE_OK` — 16 tests, 8 pass, 8 fail; target `the recorded codex output parses to its skills with ABSOLUTE roots resolved from the positional labels`, which failed on `OracleParseError: parseCodexPromptInput is not implemented yet` rather than on a load error |
| 3 | — | `0fb2806` | — | Not a TDD task (`type="auto"` without `tdd="true"`) |

No gate violations. No REFACTOR commit was made for the TDD task: readOracleOutput was extracted into a shared reader during GREEN rather than after it, so there was no separate cleanup to commit, and the cycle commits a refactor only when one changes something.

## Self-Check: PASSED

- `src/adapters/capability-oracle.ts`, `test/helpers/oracle-fixtures.ts`, `test/capability-oracle.test.ts` and this summary all exist on disk.
- Commits `41c04a6`, `84573ea`, `5b1e760` and `0fb2806` are all reachable from `git log`; `git rev-list --count 9300a75..HEAD` is 4, matching the `commits` field before this metadata commit.
- `npm run check` clean; `npm run build:check` 72 inputs / 138 outputs; `npm test` 545 tests / 539 pass / 0 fail / 6 skipped, above the 522 carried-forward baseline.
- Every task acceptance criterion re-run: `runProcess` occurs twice in non-comment `src/adapters/capability-oracle.ts` and no `child_process`, `spawn`, `spawnSync`, `execFile` or `exec(` appears anywhere in it; `ORACLE_DEFINITIONS` covers all five `HarnessId` values with antigravity and hermes null; `unsupportedReason` and `unparsedReason` are separate fields; `node:readline` occurs 0 times; `invoked` occurs 0 times in non-comment lines; `test/helpers/oracle-fixtures.ts` contains no host path, no `Users-alpha` and no bare username.
- The offline claim was executed, not asserted: with `PATH` reduced to `System32` plus the node directory, `node scripts/run-tests.mjs --files dist/test/capability-oracle.test.js` reports 23 tests, fail 0, and the paired tests complete in ~100 ms on the recorded-unsupported branch.
- No tracked file was deleted by this plan (`git diff --diff-filter=D --name-only 9300a75..HEAD` is empty).
- `C:\Users\alpha\.alpha-aos\capabilities` does not exist after the full suite: nothing in this plan wrote to the developer state root.
