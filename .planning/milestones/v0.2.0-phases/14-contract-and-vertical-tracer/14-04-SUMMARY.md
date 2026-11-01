---
phase: 14-contract-and-vertical-tracer
plan: 04
subsystem: autonomous-work
tags: [task-agents, codex, claude-code, reviewer, controller, process-boundary, structured-output, node-test]

requires:
  - phase: 14-01
    provides: "ControllerPort/ReviewerPort/TaskPorts/TaskPortAssessment types, task-review schema, task-agent-output document kind"
  - phase: 14-03
    provides: "Review snapshot handed to the reviewer as reviewRoot; a report whose session id differs from request.sessionId is refused as stale"
provides:
  - "src/adapters/task-codex.ts: Codex exec controller/executor adapter (fixed vector, name-only env, JSONL terminal parsing, schema-validated -o claim)"
  - "src/adapters/task-claude.ts: Claude Code fresh read-only reviewer adapter (alpha-AOS session UUID, restricted Read/Grep/Glob, review prompt, result parsing)"
  - "src/adapters/task-agents.ts: TASK_BOOTSTRAP_PAIR, probeTaskAgentPair, nativeTaskPorts, plus re-exports of the shared launch helpers"
  - "src/adapters/task-agent-launch.ts: shared base environment names, agentFacingSchema, resolveTaskAgentLaunch, parseHarnessVersion, bounded version probe"
  - "schemas/task-executor-result.schema.json: executor final-message schema in the structured-output-safe subset"
affects: [14-05, 14-06]

actuals:
  tokens: 19500
  tasks: 2
  commits: 4
plan_head_before: b1d2fadb77f00de8ccd6da6d0600a4d8cb770731

tech-stack:
  added: []
  patterns:
    - "Agent adapters take an injectable runner (defaults to runProcess) and resolver, so the whole adapter is testable offline with recorded-spec fakes"
    - "Shared launch helpers live in a leaf module; the registry imports the adapters and re-exports the helpers, so there is no circular module graph"
    - "Harness claims and reports are untrusted data: bounded read, closed-schema validation, credential check, extension keys refused"

key-files:
  created:
    - src/adapters/task-agent-launch.ts
    - src/adapters/task-agents.ts
    - src/adapters/task-codex.ts
    - src/adapters/task-claude.ts
    - schemas/task-executor-result.schema.json
    - test/task-agents.test.ts
  modified:
    - test/process.test.ts

key-decisions:
  - "Shared launch helpers moved to src/adapters/task-agent-launch.ts and re-exported from task-agents.ts: keeping them in task-agents.ts (which imports task-codex/task-claude) would make a circular import whose top-level constants hit the temporal dead zone"
  - "Codex terminal: the last turn event decides (turn.completed or turn.failed); an error event decides only when no turn ended, because Codex reports recoverable stream errors before a turn completes"
  - "The reported executable is the script a Node launch runs (codex.js) or the native binary, home-aliased"
  - "runClaudeReviewer refuses a non-UUID session id before resolving or launching (processCode invalid-request), so the id can never be read as a flag"
  - "A non-ok claude process never yields a report even if its output parses; a report is accepted only from a clean exit"
  - "Host bootstrap pair observed on 2026-09-30: codex-cli 0.158.0 (npm shim launched as node plus @openai/codex/bin/codex.js) and 2.1.285 (Claude Code) (native claude.EXE)"

patterns-established:
  - "processCode values added by the adapters: deadline, unsupported-executable, invalid-request, prompt-too-large; terminal values completed, failed, not-retained, missing"

requirements-completed: [RUN-01, REV-01]

coverage:
  - id: D1
    description: "Codex runs only through runProcess with the fixed exec vector (workspace-write sandbox, -C project root, prompt on stdin) and a name-only environment"
    requirement: RUN-01
    verification:
      - kind: unit
        ref: "test/task-agents.test.ts#the codex controller argument vector is fixed and never bypasses the sandbox"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#the codex child environment declares names only and passes no unrelated credential"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#runCodexController launches codex through the runner with stdin, cwd and a deadline-bounded timeout"
        status: pass
    human_judgment: false
  - id: D2
    description: "The executor claim is a validated, bounded record read from the -o file; a capped stream is not-retained, never a guessed completion"
    requirement: RUN-01
    verification:
      - kind: unit
        ref: "test/task-agents.test.ts#an invalid, oversized, missing or non-JSON codex final message yields no claim with an issue"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#a capped codex event stream is not-retained rather than a guessed completion"
        status: pass
    human_judgment: false
  - id: D3
    description: "The npm codex.cmd shim resolves to node plus its own script; an unrecognized shim or a passed deadline never launches"
    requirement: RUN-01
    verification:
      - kind: unit
        ref: "test/task-agents.test.ts#an npm-style codex.cmd shim resolves to the running node binary plus its own script"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#an unrecognized .cmd shim is unsupported and the controller is never launched"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#a deadline already in the past returns processCode deadline without launching"
        status: pass
    human_judgment: false
  - id: D4
    description: "Claude reviews in a fresh alpha-AOS-named read-only session on the snapshot; the report is accepted only after schema validation and a session match"
    requirement: REV-01
    verification:
      - kind: unit
        ref: "test/task-agents.test.ts#two reviews run in two fresh sessions, each named by its request, on the review snapshot"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#an error, a session mismatch, a capped or non-JSON output, or an invalid report yields no report with a named issue"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#the review prompt carries the binding, every criterion input and expectation, and the evidence rules"
        status: pass
    human_judgment: false
  - id: D5
    description: "Only codex/codex/claude is supported, with exact versions; every other assignment names its missing proof before anything launches"
    requirement: RUN-01
    verification:
      - kind: unit
        ref: "test/task-agents.test.ts#every other role assignment is unsupported with the missing proof named, and an absent codex names the command"
        status: pass
      - kind: other
        ref: "host probe: node --input-type=module -e probeTaskAgentPair(codex/codex/claude) printed supported:true, 0.158.0 and 2.1.285"
        status: pass
    human_judgment: false
  - id: D6
    description: "The declared name-only environments actually authenticate a real model turn for both CLIs"
    requirement: RUN-01
    verification: []
    human_judgment: true
    rationale: "No test in this plan spends a model turn; the live 14-06 tracer is the model-call canary for the declared names"

duration: 23min
completed: 2026-09-30
status: complete
---

# Phase 14 Plan 04: Native Bootstrap Agent Adapters Summary

**The 14-01 ports now have native adapters. Codex (`codex-cli 0.158.0`) is the single GSD controller and executor, launched through `runProcess` with a fixed `exec --json --ephemeral --sandbox workspace-write` vector and a name-only environment; its claim is read from the schema-validated `-o` file. Claude Code (`2.1.285 (Claude Code)`) is the fresh read-only reviewer, running in an alpha-AOS-named session on the review snapshot. Every other role assignment is refused before launch, with the missing proof named.**

## Performance

- **Duration:** about 23 min
- **Started:** 2026-09-30T05:04:35Z
- **Completed:** 2026-09-30T05:27:00Z
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

**Codex controller (`runCodexController`)**
- It resolves `codex` and turns the npm `codex.cmd` shim into the running Node binary plus `@openai/codex/bin/codex.js`. Any other shim is `unsupported-executable` and nothing is launched. A passed contract deadline returns `deadline` without calling the runner.
- It writes `agentFacingSchema(task-executor-result)` into `<scratchRoot>/codex/` and deletes any stale last-message file.
- It then runs `exec --json --ephemeral --sandbox workspace-write -C <projectRoot> --output-schema <file> -o <file> -`:
  - the prompt goes on stdin
  - cwd is the project root
  - the timeout is `min(60 min, deadline)`
  - output is capped at 8 MiB
- The child gets only the base names plus `CODEX_HOME` and `OPENAI_API_KEY`. No value goes into the policy, the argument vector or a record.

**Codex output parsing**
- `parseCodexEvents` reads `thread.started` as the session id and `turn.completed` as `completed` with numeric usage. `turn.failed`, or an `error` event when no turn ended, is `failed` with a bounded message.
- A capped stream is `not-retained`. A stream with no terminal event is `missing`. Non-JSON lines are counted, never thrown.
- `readCodexClaim` refuses links, files over 64 KiB, non-UTF-8 text, schema violations, credential-shaped values and extension keys. It also refuses a summary over 2000 characters and an authority effect or reason over 500. A refused claim is null with a named issue.

**Claude reviewer (`runClaudeReviewer`)**
- It refuses a non-UUID session id before doing anything else.
- It launches `-p --output-format json --json-schema <review schema> --session-id <request.sessionId> --no-session-persistence --restricted --tools Read,Grep,Glob --strict-mcp-config --permission-mode plan --permission-prompts none`:
  - cwd is `request.reviewRoot` (the 14-03 snapshot)
  - the prompt goes on stdin
  - the timeout is `min(15 min, deadline)`
  - output is capped at 1 MiB
- `CLAUDE_CONFIG_DIR` is passed through by name and never replaced, because Claude keeps its login there.

**Review prompt and result parsing**
- `buildReviewPrompt` is NFC text capped at 200 KiB. A larger prompt is `prompt-too-large` and nothing is launched. The prompt contains:
  - the role
  - the binding values to echo
  - the full contract JSON, with the project root home-aliased
  - per-criterion measured evidence
  - the verdict rules: a fail needs a reproduction alpha-AOS will run, and unknown needs an abstain reason
  - the data-not-instructions rule
- `parseClaudeReviewResult` accepts `structured_output`, or a JSON report in `result`. It returns no report, with a named issue, when:
  - the output was capped
  - the output is not JSON
  - the result has `is_error`
  - the session is not the requested one
  - the report fails the closed schema
- The observed session id is returned, never the requested one, so 14-03's `assessTaskReview` can see a mismatch.

**Registry**
- `probeTaskAgentPair` names each role that is not in `TASK_BOOTSTRAP_PAIR` as `<role> <harness>: no native task adapter is proven for this role in this build (role composition is Phase 16, ROL-01)`. It probes only `--version` for harnesses a supported role uses. `nativeTaskPorts` fills `TaskPorts` with the two adapters and that probe.

**Host probe (2026-09-30, no model turn)**
- `probeTaskAgentPair({codex, codex, claude})` returned:
  - `supported: true`
  - controller `0.158.0` (raw `codex-cli 0.158.0`, executable `~\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`)
  - reviewer `2.1.285` (raw `2.1.285 (Claude Code)`, executable `~\.local\bin\claude.EXE`)
  - `missingProof: []`

## Task Commits

1. **Task 1: Launch Codex as the bounded GSD controller and read its claim without trusting it**
   - `2fd5bde` test(14-04): failing tests, executor-result schema, interface skeleton and the no-spawn enumeration (RED)
   - `a63f409` feat(14-04): Codex adapter and shared launch helpers (GREEN)
2. **Task 2: Launch Claude as a fresh read-only reviewer and register the proven bootstrap pair**
   - `d6b9ff7` test(14-04): failing reviewer and registry tests plus interface skeleton (RED)
   - `00fb6f3` feat(14-04): Claude adapter, probeTaskAgentPair and nativeTaskPorts (GREEN)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY.

## Files Created/Modified
- `src/adapters/task-agent-launch.ts`: base environment names, `agentFacingSchema`, `resolveTaskAgentLaunch`, `parseHarnessVersion`, the bounded version probe, deadline and schema helpers
- `src/adapters/task-codex.ts`: the 9 planned Codex exports
- `src/adapters/task-claude.ts`: the 9 planned Claude exports plus `CLAUDE_REVIEW_PROMPT_MAX_BYTES`
- `src/adapters/task-agents.ts`: `TASK_BOOTSTRAP_PAIR`, `probeTaskAgentPair`, `nativeTaskPorts`, and re-exports of the shared helpers
- `schemas/task-executor-result.schema.json`: closed executor final-message schema (every property required, anyOf-null branches)
- `test/task-agents.test.ts`: 26 offline tests with fake runners (15 for Task 1, 11 for Task 2). None launches codex or claude.
- `test/process.test.ts`: the no-spawn guard enumerates all four adapter files and asserts that task-agents, task-codex and task-claude stay in the list

## Decisions Made
See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shared helpers moved to a leaf module to avoid a circular import**
- **Found during:** Task 1 (design, before the Task 2 registry existed)
- **Issue:** The plan puts the shared helpers and the registry in task-agents.ts. The registry imports task-codex.ts and task-claude.ts, and they import the base environment names from task-agents.ts, which is a circular import. `CODEX_TASK_ENVIRONMENT_NAMES` is built at module evaluation, so either load order would throw a temporal-dead-zone ReferenceError. The architecture notes forbid circular imports, and 14-03 resolved the same problem the same way.
- **Fix:** The helpers live in `src/adapters/task-agent-launch.ts`. task-agents.ts re-exports all of them, so every planned export is still importable from task-agents.ts. The new module is also enumerated by the no-spawn guard. One side effect: the plan's `resolveDirectLaunch(` key-link grep now matches task-agent-launch.ts, not task-agents.ts.
- **Files modified:** src/adapters/task-agent-launch.ts, src/adapters/task-agents.ts, test/process.test.ts
- **Commit:** 2fd5bde, a63f409, 00fb6f3

**2. [Rule 2 - Security] A non-UUID reviewer session id is refused before launch**
- **Found during:** Task 2
- **Issue:** `request.sessionId` goes into argv right after `--session-id`. A value such as `--dangerously-skip-permissions` would be read as a flag.
- **Fix:** `runClaudeReviewer` returns processCode `invalid-request` with no launch unless the id is a UUID. A test covers it.
- **Commit:** d6b9ff7, 00fb6f3

**3. [Rule 2 - Correctness] Extra bounds and refusals on untrusted agent output**
- **Found during:** Tasks 1 and 2
- **Issue:** The plan bounds the summary and the authority fields but not the GSD references. Validation also silently splits `x-*` extension keys out of the document.
- **Fix:** `gsd.quickId` and `gsd.summaryPath` are capped at 200 characters. Extension keys are refused in both the claim and the report, which matches 14-01's contract handling. A claude process that did not exit cleanly never yields a report.
- **Commit:** a63f409, 00fb6f3

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** No planned export was renamed or dropped. The adapters only add refusals. src/core/task-run.ts was not edited.

## TDD Gate Compliance
Both tasks have a `test(14-04)` RED commit before their `feat(14-04)` GREEN commit. No refactor commit was needed. `gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` for both RED runs (TAP reporter):
- **Task 1 target:** "runCodexController launches codex through the runner with stdin, cwd and a deadline-bounded timeout" (14 of 15 failing, all on `not implemented`)
- **Task 2 target:** "two reviews run in two fresh sessions, each named by its request, on the review snapshot" (11 of 26 failing)

Task 1's schema-shape test passed in RED because the schema is a data file created in the RED commit. Each RED commit carries a typed interface skeleton so the suite compiles and fails on behavior.

## Issues Encountered
- The full suite ran green: `node scripts/run-tests.mjs` reported 1052 tests, 1042 pass, 0 fail, 10 skipped. The known `tarball-fixture` host-cache flake did not appear.

## Verification
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-agents.test.js dist/test/process.test.js`: 47 pass, 0 fail.
- `npm run check`: exit 0.
- The host probe printed `"supported":true` with controller `0.158.0` and reviewer `2.1.285`, and exited 0.
- Acceptance greps:
  - `"workspace-write"` and `"--ephemeral"` each appear once in task-codex.ts
  - task-codex.ts has 9 exports
  - `"--no-session-persistence"`, `"--restricted"` and `"--strict-mcp-config"` each appear once in task-claude.ts
  - task-agents.ts has `export function nativeTaskPorts` and `export async function probeTaskAgentPair`
  - process.test.ts enumerates all three adapters
  - the schema contains `"needs-authority"` and `"additionalProperties": false`

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- 14-06 can pass `nativeTaskPorts()` to `startTask`. The live runs are the canary for three things:
  - the declared environment names (research A1)
  - the codex JSONL and `-o` shapes
  - the claude `structured_output` shape

  A shape mismatch there must be fixed in the parser, with a recorded sample added to this suite.
- The reviewer version drifted from 2.1.281 on 2026-09-29 to 2.1.285 on 2026-09-30, so every run records the version it observed.

---
*Phase: 14-contract-and-vertical-tracer*
*Completed: 2026-09-30*

## Self-Check: PASSED

All six created files exist, and commits 2fd5bde, a63f409, d6b9ff7 and 00fb6f3 are present.
