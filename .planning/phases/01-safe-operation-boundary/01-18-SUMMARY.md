---
phase: 01-safe-operation-boundary
plan: 18
subsystem: infra
tags: [mcp, json-rpc, stdio, transport, process-boundary, redaction, allowlist]

# Dependency graph
requires:
  - phase: 01-17
    provides: "`openProtocolProcess`, `ProtocolProcessSpec`, `ProtocolSession` — a long-lived NDJSON JSON-RPC child inside the bounded boundary, with a per-frame byte cap, an absolute deadline that `timeoutMs: 0` disables in isolation, and non-destructive `evidence()`"
  - phase: 01-08
    provides: "`materializeEnvironment`, `EnvironmentPolicy`, `PLATFORM_FLOOR_ENVIRONMENT`, `resolveNodePackageCli`, and the `RedactedExcerpt` evidence shape"
provides:
  - "`BoundedStdioTransport`: an MCP SDK `Transport` whose upstream child runs inside the alpha-AOS process boundary instead of the SDK's"
  - "`upstreamEnvironmentPolicy`: the upstream child environment declared as an `EnvironmentPolicy`, so the adapter — not this module — materializes it and seeds redaction from it"
  - "`BoundedStdioTransport.stderrEvidence()`: bounded, redacted, fingerprinted upstream stderr as the only way to read it"
  - "A fake-upstream-MCP-server contract covering round trip, allowlist refusal witnessed by the upstream's own log, frame cap, environment allowlist, redacted stderr, and the absence of an SDK stdio transport"
affects: [mcp-proxy, mcp-fixture, process-boundary, 01-VERIFICATION]

# Actuals (#2632) — same estimateTokens scale as the plan's `estimate`.
# Basis: chars/4 over the realized diff (32,493 chars across 3 files).
# For reference on the whole-file scale, mcp-proxy.ts + mcp-proxy.test.ts total 29,065 chars.
actuals:
  tokens: 8123
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A dependency's transport is replaced, not wrapped, when its bounds are the operative ones; the dependency keeps only what it is authoritative about (here, JSON-RPC message validity via `JSONRPCMessageSchema`)"
    - "An environment allowlist is handed to the process adapter as an unmaterialized `EnvironmentPolicy`, so materialization and redaction seeding stay in one place"
    - "A refusal is proven by the refused party's own record — the upstream server's tools/call log — not by the refusing code's return value"
    - "A source negative control ships with a positive control, so deleting the thing under test cannot be a way to go green"

key-files:
  created:
    - test/mcp-proxy.test.ts
  modified:
    - src/core/mcp-proxy.ts
    - .github/workflows/ci.yml

key-decisions:
  - "`BoundedStdioTransport` has no fallback path: `send` on an unstarted transport throws rather than degrading to an unbounded transport, because an unstartable bounded session is a refusal, not a reason to lower the boundary"
  - "Message validity is delegated to the SDK's own `JSONRPCMessageSchema` rather than minted as a project prohibition; alpha-AOS owns only the byte bound and the process boundary"
  - "A frame that fails `JSONRPCMessageSchema` surfaces as a coded `onerror` with no raw bytes and is dropped — its bytes stay inside the session's fingerprinted evidence"
  - "`upstreamEnvironment` is kept as a thin materializing wrapper over `upstreamEnvironmentPolicy`, both because it is a declared export and because `test/process.test.ts` asserts `materializeEnvironment` still appears in this file"
  - "The `mcp-proxy.ts -> redaction.ts` key link was dropped rather than retargeted: after the change this file performs no redaction and holds no edge to that module, and a type-only import to `../types.js` is already compiler-enforced"
  - "The downstream `StdioServerTransport` is deliberately untouched — downstream is the harness alpha-AOS is inside, the trusted side of the boundary; only the upstream child was in scope"

patterns-established:
  - "Bounded-transport mode: an SDK-compatible `Transport` implemented over `openProtocolProcess`, with `timeoutMs: 0` for a deliberately long-lived proxy and the per-frame cap still in force"
  - "Fixture teardown closes every tracked transport before removing the fixture root, because `context.after` hooks run in registration order and Windows will not delete a directory a live child holds as its cwd"
  - "A test that reproduces a production guard asserts the guard's source text beside it, so the copy cannot drift from the original in silence"

requirements-completed: [SAFE-04, SAFE-06]

coverage:
  - id: D1
    description: "A real SDK Client completes initialize and tools/list against a fake upstream MCP server entirely through BoundedStdioTransport, and only allowlisted tool names survive the filter"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/mcp-proxy.test.ts#the filter proxy reaches a fake upstream server through the bounded transport and returns only allowlisted tools"
        status: pass
    human_judgment: false
  - id: D2
    description: "One unterminated upstream frame past maxMessageBytes closes the transport and terminates the child instead of buffering; the SDK's 10 MiB STDIO_DEFAULT_MAX_BUFFER_SIZE is not the operative bound"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/mcp-proxy.test.ts#an oversize upstream frame closes the transport instead of buffering"
        status: pass
    human_judgment: false
  - id: D3
    description: "A tool name outside allowedMcpTools(\"firecrawl\") is refused and never appears in the upstream server's own tools/call log, while the allowed name does"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/mcp-proxy.test.ts#a tool outside the allowlist is refused before it reaches upstream"
        status: pass
      - kind: unit
        ref: "test/mcp.test.ts#Firecrawl is reduced to the four extraction and bounded crawl tools"
        status: pass
    human_judgment: false
  - id: D4
    description: "The upstream child observes only the firecrawl allowlist, PLATFORM_FLOOR_ENVIRONMENT and the two firecrawl literals; an undeclared name does not cross, and upstreamEnvironment still describes what actually crosses"
    requirement: "SAFE-06"
    verification:
      - kind: integration
        ref: "test/mcp-proxy.test.ts#the upstream child receives only allowlisted environment names"
        status: pass
      - kind: unit
        ref: "test/process.test.ts#the MCP filter proxy inherits neither the ambient environment nor stderr"
        status: pass
    human_judgment: false
  - id: D5
    description: "An echoed FIRECRAWL_API_KEY returns from stderrEvidence() only as a typed placeholder, with capped true, a 64-character whole-stream fingerprint and a totalBytes larger than the retained excerpt (D-12)"
    requirement: "SAFE-04"
    verification:
      - kind: integration
        ref: "test/mcp-proxy.test.ts#upstream stderr becomes bounded redacted evidence, never terminal output"
        status: pass
    human_judgment: false
  - id: D6
    description: "The proxy source names no SDK stdio client transport, no ambient-environment helper and no inherited stderr handle, with openProtocolProcess as the positive control"
    requirement: "SAFE-06"
    verification:
      - kind: unit
        ref: "test/mcp-proxy.test.ts#the proxy builds no transport from the SDK stdio client"
        status: pass
      - kind: other
        ref: "git grep -c 'client/stdio.js' -- src/core/mcp-proxy.ts -> no match (exit 1)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The three-OS safety-suite step names the proxy suite, so a suite that silently stops running is a failure rather than an omission"
    verification:
      - kind: other
        ref: "grep -c 'dist/test/mcp-proxy.test.js' .github/workflows/ci.yml -> 1"
        status: pass
    human_judgment: false
  - id: D8
    description: "All four `missing` items in 01-VERIFICATION.md gaps[0] now have a delivered owner across 01-17 and 01-18, and the `deferred:`, `behavior_unverified_items:` and `human_verification:` blocks were left untouched by both plans"
    verification: []
    human_judgment: true
    rationale: "Task 2's own <human-check>. Confirming that a gap is closed AND that out-of-scope blocks were not quietly claimed is a judgment about scope honesty that no test can assert; HUMAN_VERIFY_MODE is end-of-phase, so it belongs at the phase checkpoint."

# Metrics
duration: 22min
completed: 2026-09-05
status: complete
---

# Phase 01 Plan 18: Bounded Upstream MCP Transport Summary

**`BoundedStdioTransport` replaces the SDK's `StdioClientTransport` in the Firecrawl filter proxy, so the upstream npm server runs inside alpha-AOS's own boundary — 1 MiB per-frame cap that terminates the child, a declared environment allowlist, and redacted fingerprinted stderr — with the SDK keeping only JSON-RPC message validity.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-05T01:09:40Z
- **Completed:** 2026-09-05T01:31:25Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Closed the last `missing` item in 01-VERIFICATION.md `gaps[0]`: "An MCP SDK `Transport` adapter in `src/core/mcp-proxy.ts` built on that mode." The `src/core/mcp-proxy.ts` → `src/core/process.ts` key link, recorded as `NOT_WIRED`, now matches `openProtocolProcess|ProtocolProcessSpec`.
- Made the 01-08 artifact claim literally true. `src/core/mcp-proxy.ts` was declared to provide an "SDK-compatible MCP client transport backed by the bounded ProcessSpec protocol session" and instead constructed `new StdioClientTransport(...)`. It now constructs `new BoundedStdioTransport(...)` over a `ProtocolProcessSpec`.
- Moved the operative upstream stdout bound from the dependency to this project. The SDK reads into a buffer bounded by `STDIO_DEFAULT_MAX_BUFFER_SIZE` (10 MiB) and grows until it is hit; the session terminates the child tree at `DEFAULT_MAX_MESSAGE_BYTES` (1 MiB) on one unterminated frame and discards the buffer.
- Proved the tool refusal from the refused party's side. Previous coverage asserted the allowlist's contents (`test/mcp.test.ts`); this plan drives a real SDK `Client` at a fake upstream server that appends every `tools/call` name it receives to a log, and asserts the disallowed name is absent from that log while `firecrawl_scrape` is present.
- Retired `collectUpstreamStderr` and `UpstreamStderrEvidence` along with the `createHash` and `./redaction.js` imports that existed only to serve them. Upstream stderr is now collected, bounded, redacted and fingerprinted by the session, read through `stderrEvidence()`, and this file holds no edge to the redaction module at all.
- Named the proxy suite in the three-OS `Safety boundary suites` step, so the suite silently ceasing to run would fail CI rather than pass unnoticed.

## Task Commits

Each task was committed atomically. Task 1 is TDD (`test` → `feat`).

1. **Task 1 (tracer): bounded SDK Transport proven end-to-end against a fake upstream MCP server**
   - `6a95361` (test — RED: `npm run check` failed with `TS2305: Module '"../src/core/mcp-proxy.js"' has no exported member 'BoundedStdioTransport'`)
   - `84e4943` (feat — GREEN)
2. **Task 2: cap, allowlist, environment, redaction and the SDK-stdio-transport negative control** — `5a16f17` (test)

**Plan metadata:** see the `docs(01-18)` commit that carries this file.

### TDD gate compliance

Task 1 shows the full RED → GREEN sequence in `git log`: a `test(01-18)` commit whose failure was observed and recorded, followed by a `feat(01-18)` commit that turns it green. No REFACTOR commit was needed.

Task 2 carries `tdd="true"` but no RED gate was achievable — see deviation 1 below. Its own action text defines it as negative controls over the implementation Task 1 already shipped, and explicitly forbids editing `src/core/mcp-proxy.ts`, so a failing-first state would have meant the contract was wrong rather than the code missing. The controls were instead validated by replaying them against the pre-change source (see "Verification Results"), which is the evidence a RED would otherwise have supplied.

## Files Created/Modified

- `test/mcp-proxy.test.ts` (new, 424 lines) — five fake upstream servers (MCP handshake, unterminated flooder, tool-call logger, environment reporter, secret echoer) and six tests: round trip through a real SDK `Client`, frame cap with child-death assertion, allowlist refusal witnessed by the upstream's own log, environment allowlist, redacted stderr evidence, and the source negative control.
- `src/core/mcp-proxy.ts` (+140 / −69) — `BoundedStdioTransport` and `upstreamEnvironmentPolicy` added; `upstreamEnvironment` rebuilt as a materializing wrapper; `runMcpFilterProxy` rewired onto the bounded spec; `collectUpstreamStderr`, `UpstreamStderrEvidence`, the `createHash` import, the `./redaction.js` import and the `client/stdio.js` import all removed.
- `.github/workflows/ci.yml` — `dist/test/mcp-proxy.test.js` named in the per-OS `Safety boundary suites` step.

## Decisions Made

- **No fallback transport, by construction.** `send()` on a transport with no session throws instead of degrading; `start()` refuses a second call. The prohibition `must_haves.prohibitions[0]` flagged `unverified` is now structural — there is no code path that could reach an SDK stdio transport, and `the proxy builds no transport from the SDK stdio client` asserts the import is absent entirely.
- **Message validity stays the SDK's.** Every parsed frame passes `JSONRPCMessageSchema.safeParse` before reaching `onmessage`. A rejection produces a coded `onerror` carrying no raw bytes, and the frame is dropped — its bytes remain counted in the session's stream fingerprint, so the evidence stays truthful.
- **`onmessage` is declared with the SDK's exact generic signature** (`<T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void`) rather than a simplified one, so `implements Transport` is satisfied by identity rather than by an assignability argument that a future SDK version could invalidate.
- **`upstreamEnvironment` was kept despite having no remaining caller in `src/`.** It is a declared export in `must_haves.artifacts`, and `test/process.test.ts`'s `assert.match(proxy, /materializeEnvironment/u)` requires that call to stay in the file. It is now covered by a test rather than left dead: the environment test asserts that what it materializes is exactly what reaches the child.
- **The `mcp-proxy.ts → redaction.ts` key link was dropped, not retargeted**, exactly as the plan reasoned. After the change this file performs no redaction; the safety chain stays greppable across `mcp-proxy.ts → process.ts` (here) and `process.ts → redaction.ts` (01-17).
- **`STDERR_CAP` is mirrored as a literal in the test rather than exported.** `UPSTREAM_STDERR_CAP` stays module-local so the export surface matches `must_haves.artifacts.exports` exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2's `tdd="true"` has no achievable RED gate**

- **Found during:** Task 2
- **Issue:** The task is marked `tdd="true"`, but its own `<action>` states `src/core/mcp-proxy.ts`는 이 task에서 수정하지 않는다 — the five tests are negative controls over the implementation Task 1 already shipped and green. A RED-first commit was therefore impossible without either deliberately breaking Task 1's work or writing a test asserting something the plan does not require.
- **Fix:** Executed Task 2 as a single `test(01-18)` commit and substituted an equivalent proof of teeth: the source negative control's three regexes and its positive control were replayed against the pre-change `src/core/mcp-proxy.ts` (`git show 6a95361:src/core/mcp-proxy.ts`). The SDK-stdio-import assertion evaluated `true` (would have failed the test) and the `openProtocolProcess` positive control evaluated `false` (would also have failed), confirming the control is not vacuous.
- **Files modified:** none beyond the planned `test/mcp-proxy.test.ts` and `.github/workflows/ci.yml`
- **Verification:** replay output recorded under "Verification Results"; the suite is 6/6 green.
- **Committed in:** `5a16f17`

**2. [Rule 2 - Missing Critical] The reproduced refusal guard had no link back to the guard it reproduces**

- **Found during:** Task 2
- **Issue:** `a tool outside the allowlist is refused before it reaches upstream` cannot invoke `runMcpFilterProxy` (that would need `npx` and the real Firecrawl package), so it reproduces the proxy's `CallToolRequestSchema` handler guard in the test body. As written, deleting that guard from `src/core/mcp-proxy.ts` would leave the test green — it would be asserting a policy nobody enforces, which is precisely the failure mode a negative control exists to prevent.
- **Fix:** Added a source assertion beside the reproduced guard, matching the handler line verbatim including the `MCP tool is not allowed by alpha-aos policy: ${request.params.name}` message. The copy and the original now fail together.
- **Files modified:** `test/mcp-proxy.test.ts`
- **Verification:** the regex was confirmed to match the post-change source and is exercised on every run of the test.
- **Committed in:** `5a16f17`

### Intentional divergence from the plan's action text

**3. [Plan text vs available surface] The environment test hardcodes the firecrawl allowlist instead of reading `UPSTREAM_ENVIRONMENT_NAMES`**

- **Found during:** Task 2
- **Issue:** The action text says to compare observed names against `UPSTREAM_ENVIRONMENT_NAMES.firecrawl`, but that constant is module-local and is not in `must_haves.artifacts.exports`. Exporting it to satisfy the test would widen the export surface the plan pinned.
- **Resolution:** The three firecrawl names are written out in the test. This is the stronger contract anyway — the test pins the allowlist independently rather than comparing the implementation against itself.
- **Committed in:** `5a16f17`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical) + 1 recorded divergence from action text.
**Impact on plan:** No scope creep. `src/core/mcp-proxy.ts` was untouched by Task 2 exactly as instructed; both auto-fixes are confined to test evidence, and both address a way the plan as written could have shipped a control that proves nothing. Nothing from the 01-VERIFICATION `deferred:`, `behavior_unverified_items:` or `human_verification:` blocks was touched.

## Issues Encountered

None. The precondition was checked before any edit and held: `@modelcontextprotocol/sdk` is 1.30.0 and `dist/esm/shared/transport.d.ts` declares `interface Transport` with `start()`, `send(message, options?)`, `close()` and the optional `onclose` / `onerror` / `onmessage` / `sessionId` / `setProtocolVersion` members, matching what `BoundedStdioTransport` implements. `'2025-06-18'` was confirmed present in the SDK's `SUPPORTED_PROTOCOL_VERSIONS` before the fake server was written to answer with it.

## Verification Results

All plan-level `<verification>` items were re-run on this host after the final commit:

| Check | Expected | Observed |
|---|---|---|
| `npm run check` | exit 0, no output | exit 0, no output |
| `npm run build && node --test dist/test/mcp-proxy.test.js` | ≥ 6 tests, `# fail 0` | **6 tests, 6 pass, 0 fail** |
| `node --test dist/test/process.test.js dist/test/mcp.test.js dist/test/protocol-session.test.js` | `# fail 0` | **44 tests, 44 pass, 0 fail** |
| `npm test` | `fail 0`, total ≥ 190 | **191 tests, 189 pass, 0 fail, 2 skipped** |
| `npm run build:check` | `build artifact verified`, inputs > 53 | **`build artifact verified: 55 inputs, 104 outputs`** |
| `git grep -c 'client/stdio.js' -- src/core/mcp-proxy.ts` | no match (exit 1, empty) | exit 1, empty |

Task 1's acceptance criteria were each executed individually and all nine passed, including the three "returns no match" greps (`client/stdio.js`, `collectUpstreamStderr`, `./redaction.js` — all exit 1) and the two retained-text greps (`materializeEnvironment` ×2, the policy refusal literal ×1).

**Negative-control teeth (substituting for Task 2's unachievable RED):** the three source regexes plus the positive control were replayed against `git show 6a95361:src/core/mcp-proxy.ts`, the file as it stood before Task 1:

| Assertion | Pre-change file | Post-change file |
|---|---|---|
| `/from\s+["']@modelcontextprotocol\/sdk\/client\/stdio\.js["']/u` must be `false` | `true` → **would fail** | `false` → passes |
| `/openProtocolProcess/u` must be `true` (positive control) | `false` → **would fail** | `true` → passes |

**Test count of record: 191.** The baseline was 185 (recorded in `01-17-SUMMARY.md`, re-measured on this host before any edit); this plan adds exactly the 6 it projected. The plan's own fallback clause — "If `01-17-SUMMARY.md` records a final count above 184, use that recorded number as the baseline instead and require strictly more than it" — is satisfied: 191 > 185.

The 2 skipped tests remain the pre-existing privileged Windows canaries in `test/path-boundary.test.ts` (reparse point, file symlink), already owned by `01-VERIFICATION.md` `behavior_unverified_items`. This plan neither addressed nor claimed them.

## Known Stubs

None. Every symbol this plan introduced is implemented and exercised by a passing test. `upstreamEnvironment` has no remaining caller inside `src/` but is not a stub — it is a fully implemented declared export, retained deliberately (see "Decisions Made") and covered by `the upstream child receives only allowlisted environment names`.

## User Setup Required

None — no external service configuration required. The plan adds no dependency and runs no package-manager install; `@modelcontextprotocol/sdk@1.30.0` remains the locked, reviewed version and its integrity record is unchanged (threat T-01-18-SC, disposition `accept`).

## Next Phase Readiness

**Phase 01 plans are complete: 18 of 18.** All four `missing` items in `01-VERIFICATION.md` `gaps[0]` now have a delivered owner — three closed by 01-17 (`openProtocolProcess`, the fixture migration, the carve-out retirement) and the fourth by this plan (the SDK `Transport` adapter). The final `NOT_WIRED` key link resolves.

**Suggested next step:** re-run `/gsd-verify-work 01` so the gap report is re-evaluated against the delivered state rather than left recording a closed gap as open.

**Open items this plan deliberately did not touch**, all still owned by `01-VERIFICATION.md`:

- The reparse-point and file-symlink canaries (privileged Windows fixtures).
- Observation of the macOS and Linux CI legs — every phase-1 commit, including these three, is still unpushed. `.github/workflows/ci.yml` now names the proxy suite on all three legs, but naming is not observing.
- The end-to-end managed install fixture, deferred to Phase 7.

**One carried-over out-of-scope item** remains in `deferred-items.md` and was not addressed here: `.gsd/` is untracked run-scoped GSD runtime state not covered by `.gitignore`. It predates this plan and is orchestrator tooling, not phase-1 work.

**One residual risk worth naming for the verifier.** `runMcpFilterProxy` itself is still only reachable end-to-end with a real `npx` and the real Firecrawl package, so no test drives that exact function. What this plan proves is that every component it composes — the transport, the environment policy, the allowlist guard's source text and the evidence seam — behaves correctly against a fake upstream. Closing that last inch is what the Phase 7 managed-install fixture is for.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-05*

## Self-Check: PASSED

All four created/modified files exist on disk, and all three task commits
(`6a95361`, `84e4943`, `5a16f17`) are present in `git log --oneline --all`.
Every `coverage[].verification[].ref` naming a test was checked against the
actual test name in its file.
