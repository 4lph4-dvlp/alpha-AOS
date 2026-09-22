---
phase: 01-safe-operation-boundary
plan: 17
subsystem: infra
tags: [child-process, json-rpc, ndjson, stdio, mcp, redaction, process-boundary]

# Dependency graph
requires:
  - phase: 01-08
    provides: "The shell-free, allowlisted, deadline-bound, output-capped `runProcess` adapter, its `ProcessCode`/`ProcessResult` vocabulary, `materializeEnvironment`, `killTree` and `BoundedStream`"
  - phase: 01-11
    provides: "The source enumeration `no source module spawns a child outside the process adapter`, which held the direct-spawn carve-out this plan retires"
provides:
  - "`openProtocolProcess`: a long-lived NDJSON JSON-RPC stdio child inside the same bounded boundary `runProcess` enforces"
  - "A per-frame stdout byte cap (`DEFAULT_MAX_MESSAGE_BYTES`, 1 MiB) that terminates a child emitting one unterminated frame instead of growing a buffer"
  - "An absolute session ceiling where `timeoutMs: 0` disables only that ceiling and never the frame cap"
  - "`BoundedStream.snapshot`, a non-destructive `hash.copy()` fingerprint that lets a live session read evidence repeatedly"
  - "`src/core/mcp-fixture.ts` reaching its JSON-RPC child only through the adapter, with `discoverTools` exported and driveable against a fake upstream server"
  - "A source enumeration with no exception set, so a direct spawn anywhere in src/ fails the suite"
affects: [01-18, mcp-proxy, mcp-fixture, process-boundary]

# Actuals (#2632) — same estimateTokens scale as the plan's `estimate`.
# Basis: chars/4 over the realized diff (44,007 chars across 5 files).
# For reference on the whole-file scale the same five files total 85,867 chars.
actuals:
  tokens: 11002
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Long-lived protocol children go through the same adapter as one-shot commands; being long-lived is never an exemption from a bound"
    - "Failure evidence is read non-destructively via hash.copy(), so a live session can be described more than once"
    - "A production path with no test coverage has its dependency inverted (inject the resolved command) rather than being rewritten blind"
    - "Retiring a test carve-out is proven by an automated negative control plus a positive control on the enclosing test's own existence"

key-files:
  created:
    - test/protocol-session.test.ts
  modified:
    - src/core/process.ts
    - src/core/mcp-fixture.ts
    - test/process.test.ts
    - .github/workflows/ci.yml

key-decisions:
  - "The per-frame cap is 1 MiB, deliberately narrower than the MCP SDK's own 10 MiB STDIO_DEFAULT_MAX_BUFFER_SIZE — a frame that large from a locked tool server is a malfunction, not a payload"
  - "`waitFor` landed in Task 1 rather than Task 2 because the tracer's round trip has to receive a reply; Task 2 proved its contract and added the absolute ceiling, which was the only genuinely unimplemented behaviour"
  - "`discoverTools` takes the resolved stdio command and cwd instead of the locked package, inverting its only use of `locked` so the production probe can be driven against a fake upstream server"
  - "The fixture's timeout path reports through `describeProcessFailure` instead of interpolating accumulated stderr into a message (D-12)"
  - "Unclaimed parsed frames are bounded by PROTOCOL_BACKLOG_LIMIT, so a server that talks unprompted cannot grow the parent either"

patterns-established:
  - "Protocol-session mode: send/onMessage/waitFor/evidence/closed/close over an adapter-owned child"
  - "Session evidence is always a bounded redacted excerpt plus a whole-stream SHA-256, truthful even after capping"
  - "Test fixtures that own child processes close them before the fixture root is removed, because context.after hooks run in registration order"

requirements-completed: [SAFE-04, SAFE-06]

coverage:
  - id: D1
    description: "openProtocolProcess runs a long-lived JSON-RPC stdio child through the same bounded boundary runProcess enforces, and a real round trip completes through it"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#a bounded protocol session completes a JSON-RPC round trip against a fake upstream server"
        status: pass
    human_judgment: false
  - id: D2
    description: "One unterminated stdout frame past DEFAULT_MAX_MESSAGE_BYTES terminates the child tree and settles as output-cap instead of growing a buffer"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#one unterminated protocol frame past the cap terminates the child instead of growing the buffer"
        status: pass
    human_judgment: false
  - id: D3
    description: "An absolute session ceiling settles as timed out, and timeoutMs: 0 disables only that ceiling while the per-frame cap stays in force"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#an absolute deadline settles the session as timed out, and disabling it leaves the frame cap in force"
        status: pass
    human_judgment: false
  - id: D4
    description: "A protocol child sees only the names its EnvironmentPolicy declared plus PLATFORM_FLOOR_ENVIRONMENT"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#only operation-approved environment names reach a protocol child"
        status: pass
    human_judgment: false
  - id: D5
    description: "A protocol-session failure is reported by coded outcome, exit metadata and stream fingerprints plus a bounded redacted excerpt — never by interpolating accumulated child output (D-12)"
    requirement: "SAFE-04"
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#protocol session evidence carries fingerprints and typed placeholders, never raw bytes"
        status: pass
      - kind: integration
        ref: "test/protocol-session.test.ts#a protocol response that never arrives fails on its own deadline and leaves no child behind"
        status: pass
    human_judgment: false
  - id: D6
    description: "A closed, timed-out or capped protocol session leaves no descendant process running"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#closing a protocol session terminates the whole child tree"
        status: pass
    human_judgment: false
  - id: D7
    description: "The MCP fixture's protocol probe reaches its child only through openProtocolProcess and still completes initialize -> notifications/initialized -> tools/list, returning the advertised tool names"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#the migrated fixture probe completes a tool discovery round trip through the bounded session"
        status: pass
    human_judgment: false
  - id: D8
    description: "test/process.test.ts enumerates every source module with no protocol-session carve-out, so a direct spawn added to any module — including mcp-fixture.ts — fails the suite"
    requirement: "SAFE-06"
    verification:
      - kind: unit
        ref: "test/protocol-session.test.ts#no protocol-session carve-out survives in the source enumeration"
        status: pass
      - kind: unit
        ref: "test/process.test.ts#no source module spawns a child outside the process adapter"
        status: pass
    human_judgment: false
  - id: D9
    description: "The three-OS safety-suite step names the protocol-session suite, so a suite that silently stops running is a failure rather than an omission"
    verification:
      - kind: other
        ref: "grep -c 'dist/test/protocol-session.test.js' .github/workflows/ci.yml -> 1"
        status: pass
    human_judgment: false
  - id: D10
    description: "This plan did not silently claim the reparse-point and file-symlink canaries or the three-OS CI legs, which remain open human items owned by 01-VERIFICATION.md"
    verification: []
    human_judgment: true
    rationale: "Task 3's own <human-check>. Confirming that an open item was NOT claimed is a judgment about scope honesty that no test can assert; HUMAN_VERIFY_MODE is end-of-phase, so it belongs at the phase checkpoint."

# Metrics
duration: 33min
completed: 2026-09-05
status: complete
---

# Phase 01 Plan 17: Bounded Protocol Session Summary

**`openProtocolProcess` puts long-lived NDJSON JSON-RPC children inside the same boundary `runProcess` enforces — 1 MiB per-frame stdout cap that kills the child tree, absolute deadline, environment allowlist, redacted fingerprinted evidence — and the MCP fixture's direct `spawn` is gone, carve-out retired.**

## Performance

- **Duration:** 33 min
- **Started:** 2026-09-05T00:32:12Z
- **Completed:** 2026-09-05T01:05:33Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- Closed the single gap 01-VERIFICATION.md left open: `openProtocolProcess` was declared a must-have export of `src/core/process.ts` by 01-08 and did not exist. It exists, is exported, and is proven end to end against fake upstream servers.
- Closed the concrete defect behind the gap. `src/core/mcp-fixture.ts:118-119` accumulated `stdout += chunk` and kept the residual after the last newline, so a child emitting a long line without a newline grew that buffer without a byte bound. A protocol session now drops the buffer, `killTree`s the child and settles `code: "output-cap"` once one unterminated frame passes 1 MiB.
- Wired the `src/core/mcp-fixture.ts` → `src/core/process.ts` key link that 01-VERIFICATION.md recorded as `NOT_WIRED`. The fixture imports no child-process primitive of its own.
- Retired the `protocolSessionExceptions` allowance in `test/process.test.ts` entirely, and proved its removal with an automated negative control rather than an executor's own grep — plus a positive control so deleting the enumeration test cannot be a way to go green.
- Gave a previously untested production path real coverage. `discoverTools` was reachable only from `src/cli.ts` and `src/core/install.ts` and from nowhere in `test/`; inverting its dependency on `mcpStdioCommand` lets it be driven against a fake upstream MCP server, so the boundary change is proven not to have broken the behaviour it bounds.

## Task Commits

Each task was committed atomically. Tasks 1 and 2 are TDD (`test` → `feat`).

1. **Task 1 (tracer): bounded protocol session proven against a fake upstream server**
   - `42241f4` (test — RED: `npm run check` failed with TS2305, the symbol did not exist)
   - `e3e42f2` (feat — GREEN)
2. **Task 2: deadline, termination, environment allowlist, redacted evidence**
   - `45482ef` (test — RED: exactly one failing test, the absolute deadline)
   - `20a6dfd` (feat — GREEN)
3. **Task 3: MCP fixture migrated onto the session, carve-out retired** — `2ec0130` (feat)

**Plan metadata:** see the `docs(01-17)` commit that carries this file.

### TDD gate compliance

Both TDD tasks show the full RED → GREEN sequence in `git log`: a `test(01-17)` commit whose failure was observed and recorded, followed by a `feat(01-17)` commit that turns it green. No REFACTOR commit was needed — neither implementation left duplication to remove.

## Files Created/Modified

- `test/protocol-session.test.ts` (new, 505 lines) — the fake-upstream-server contract: round trip, frame cap, per-message deadline, absolute ceiling, environment allowlist, redacted evidence, child-tree termination, the migrated fixture probe's own tool-discovery round trip, and the source negative control.
- `src/core/process.ts` (+342) — `openProtocolProcess`, `ProtocolProcessSpec`, `ProtocolSession`, `DEFAULT_MAX_MESSAGE_BYTES`, `DEFAULT_MESSAGE_TIMEOUT_MS`, module-local `DEFAULT_CLOSE_GRACE_MS` and `PROTOCOL_BACKLOG_LIMIT`, and `BoundedStream.snapshot`.
- `src/core/mcp-fixture.ts` — `discoverTools` exported and rebuilt on the session; `node:child_process` import removed; `materializeEnvironment` dropped from the import list rather than left dead; timeout path rebuilt on `describeProcessFailure`; the stale doc comment about an asserted exception replaced with what is now true.
- `test/process.test.ts` — carve-out retired; the enumeration now asserts `src/core/mcp-fixture.ts` is still in the list it walks.
- `.github/workflows/ci.yml` — the protocol-session suite named in the per-OS `Safety boundary suites` step.

## Decisions Made

- **`runProcess` was not touched.** `BoundedStream.finish` now delegates to `snapshot`, which fingerprints via `hash.copy()` (the pattern `collectUpstreamStderr` in `src/core/mcp-proxy.ts` already uses). Captured-mode behaviour is observably identical — `test/process.test.ts` stayed 19/19 green throughout.
- **No new `ProcessCode`.** The session reuses the existing union (`ok`, `non-zero-exit`, `output-cap`, `timeout`, `spawn-failed`), so a protocol refusal reads the same as any other refusal.
- **Only lines beginning with `{` are parsed**, and parse failures are dropped rather than surfaced raw or evaluated (threat T-01-17-05). The bytes still reach the stream hash, so the fingerprint stays truthful.
- **`waitFor` was implemented in Task 1**, not Task 2 as the plan's action text split it, because the tracer's round trip cannot be proven without receiving a reply. Task 2 proved its contract and added the absolute ceiling — the one behaviour that was genuinely unimplemented, and the one that produced the RED.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a test for the absolute deadline and the `timeoutMs: 0` prohibition**

- **Found during:** Task 2
- **Issue:** Task 2's `<behavior>` declares the absolute-ceiling contract, and `must_haves.prohibitions[0]` flags it `unverified`: *"a session whose absolute deadline is disabled still enforces the per-frame bound."* But none of the four test names the acceptance criteria pin covers it. All four passed unchanged against the Task 1 tracer, so the plan as written would have produced a green Task 2 with the only genuinely unimplemented behaviour — `spec.timeoutMs` was being ignored entirely — still unproven and unshipped.
- **Fix:** Added a fifth test, `an absolute deadline settles the session as timed out, and disabling it leaves the frame cap in force`, asserting both halves: a 1500 ms ceiling settles `code: "timeout"` with `timedOut: true` and no surviving child, and `timeoutMs: 0` against the flood fixture still settles `code: "output-cap"` with `timedOut: false`.
- **Files modified:** `test/protocol-session.test.ts`, `src/core/process.ts`
- **Verification:** This test was the sole RED in the Task 2 test commit (timed out at 20 s under `--test-timeout`), and the sole test the deadline implementation turned green.
- **Committed in:** `45482ef` (RED), `20a6dfd` (GREEN)

**2. [Rule 1 - Bug] Fixture teardown deleted the temp root while a child still held it**

- **Found during:** Task 2
- **Issue:** `context.after` hooks run in registration order. `createProtocolFixture` registers `rm(root)` first, and each test registered `session.close()` after it — so cleanup tried to remove the directory while a live child still had it as cwd. On Windows this surfaced as `EBUSY: resource busy or locked, rmdir` and failed a test whose body had already passed, i.e. cross-test contamination that would read as a flaky safety suite on the Windows CI leg.
- **Fix:** The fixture owns a session registry (`fixture.track`) and closes every tracked session before removing the root, with `maxRetries: 5, retryDelay: 200` on `rm` as a second line of defence.
- **Files modified:** `test/protocol-session.test.ts`
- **Verification:** After the fix the RED run showed exactly one failure (the absolute deadline) instead of two, and the suite has been 9/9 green on every run since.
- **Committed in:** `45482ef`

**3. [Rule 3 - Blocking] Fixture scripts could not carry an escaped newline through two levels of source**

- **Found during:** Task 1
- **Issue:** Writing a fixture script line as `"... + '\\n');"` in the TS source did not survive authoring into the emitted JS, where it became a real newline inside a string literal. Every fixture child died with `SyntaxError: Invalid or unexpected token`, and both Task 1 tests failed with `non-zero-exit`.
- **Fix:** The fixture scripts use `console.log`, which supplies the frame terminator itself, so no escape crosses a source boundary at all.
- **Files modified:** `test/protocol-session.test.ts`
- **Verification:** Both Task 1 tests went green immediately; the same shape is reused by all five later fixture servers.
- **Committed in:** `e3e42f2`

### Intentional divergence from the plan's action text

**4. [Plan text vs acceptance criterion] `maxMessageBytes` is not passed explicitly by the fixture**

- **Found during:** Task 3
- **Issue:** The Task 3 action text says to open the session with `maxMessageBytes: DEFAULT_MAX_MESSAGE_BYTES`. Doing so requires importing that constant, which would make the `./process.js` import list five names — and the Task 3 acceptance criterion pins it to *exactly* the four names `openProtocolProcess`, `resolveCommand`, `resolveNodePackageCli`, `runProcess`.
- **Resolution:** The argument is omitted. `DEFAULT_MAX_MESSAGE_BYTES` *is* the adapter default for `maxMessageBytes`, so behaviour is identical and the testable criterion is satisfied. The frame cap remains proven for this path by the migrated-probe round trip running through the same code path as the cap test.
- **Committed in:** `2ec0130`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 bug, 1 blocking) + 1 recorded divergence from action text.
**Impact on plan:** No scope creep. The added test proves a prohibition the plan itself flagged `unverified` and would otherwise have shipped unproven; the other two fixes were required to make the suite honest on Windows. The scope statement held exactly — nothing from the VERIFICATION `deferred:`, `behavior_unverified_items:` or `human_verification:` blocks was touched.

## Issues Encountered

- **The first full run of the new suite hung past the 120 s tool budget.** Without the absolute deadline, a silent fake server held its session open for its entire 30 s sleep, and several such tests compounded. Diagnosed by re-running with `--test-timeout=20000 --test-reporter=spec`, which isolated the single genuinely failing test. This was the RED, not an infrastructure problem — implementing the deadline removed it, and the suite now completes in roughly 9 s.

## Verification Results

All plan-level `<verification>` items were re-run on this host after the final commit:

| Check | Expected | Observed |
|---|---|---|
| `npm run check` | exit 0, no output | exit 0, no output |
| `node --test dist/test/protocol-session.test.js` | ≥ 8 tests, `fail 0` | **9 tests, 9 pass, 0 fail** |
| `node --test dist/test/process.test.js` | `fail 0`, enumeration test present and green | **19 tests, 19 pass, 0 fail**; `no source module spawns a child outside the process adapter` green |
| `npm test` | `fail 0`, total ≥ 184 | **185 tests, 183 pass, 0 fail, 2 skipped** |
| `npm run build:check` | `build artifact verified`, inputs > 53 | **`build artifact verified: 54 inputs, 102 outputs`** |
| `git grep -c 'node:child_process' -- src/core/mcp-fixture.ts` | no match (exit 1, empty) | exit 1, empty |
| `git grep -c 'protocolSessionExceptions' -- test/process.test.ts` | no match (exit 1, empty) | exit 1, empty |

**Test count of record: 185.** The baseline was 176 in 01-VERIFICATION.md; this plan adds 9 (the plan projected 8, plus the Rule 2 deadline test). Plan 01-18 should raise its own baseline to 185.

The 2 skipped tests are the pre-existing privileged Windows canaries in `test/path-boundary.test.ts` (reparse point, file symlink), already owned by `01-VERIFICATION.md` `behavior_unverified_items`. This plan neither addressed nor claimed them.

## Known Stubs

None. Every symbol this plan introduced is implemented and exercised by a passing test; no placeholder value, TODO marker or unwired data path was added.

## User Setup Required

None — no external service configuration required. The plan adds no dependency and runs no package-manager install, so the 01-04 legitimacy record and the verified `smol-toml@1.8.0` integrity remain the governing supply-chain evidence (threat T-01-17-SC, disposition `accept`).

## Next Phase Readiness

**Ready for 01-18.** It owns the fourth and last `missing` item from the 01-VERIFICATION gap — an MCP SDK `Transport` adapter in `src/core/mcp-proxy.ts` built on this mode. Everything it needs is in place:

- `openProtocolProcess` / `ProtocolProcessSpec` / `ProtocolSession` are exported and stable.
- `timeoutMs: 0` exists precisely for a long-lived proxy, and is proven not to weaken the frame cap.
- The source negative-control pattern it plans to reuse for `the proxy builds no transport from the SDK stdio client` is now established in `test/protocol-session.test.ts`.
- Its `npm test` baseline should be **185**, not 176 or 184.

**Open items this plan deliberately did not touch**, all still owned by `01-VERIFICATION.md`:

- The reparse-point and file-symlink canaries (privileged Windows fixtures).
- Observation of the macOS and Linux CI legs — every phase-1 commit, including these five, is still unpushed. `.github/workflows/ci.yml` now names the new suite on all three legs, but naming is not observing.
- The end-to-end managed install fixture, deferred to Phase 7.

**One out-of-scope discovery** was logged to `deferred-items.md` rather than fixed: `.gsd/dispatch-isolation-sentinel.json` is untracked run-scoped GSD runtime state not covered by `.gitignore`. It predates this plan's first commit and is orchestrator tooling, not phase-1 work.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-05*

## Self-Check: PASSED

All five created/modified files exist on disk, and all five task commits
(`42241f4`, `e3e42f2`, `45482ef`, `20a6dfd`, `2ec0130`) are present in
`git log --oneline --all`.
