---
phase: 01-safe-operation-boundary
verified: 2026-09-05T11:05:00Z
status: human_needed
score: 4/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "MCP protocol sessions use the same bounded process boundary (01-08 artifact export `openProtocolProcess`; 01-08 and 01-11 key_links) — closed by 01-17 and 01-18 and confirmed against the codebase, not against the summaries"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "An end-to-end managed install test exercising `applyManagedInstall` under one session"
    addressed_in: "Phase 7"
    evidence: "Phase 7 success criterion 1: 'The same packed release bytes install, reconcile, diagnose, and uninstall successfully in Windows, macOS, and Linux fixture environments without touching real shared roots.' A fixture/container-backed environment is exactly what 01-14 says this test needs. Re-checked: still absent from test/, still correctly reasoned."
  - truth: "The macOS and Linux CI legs are observed rather than asserted"
    addressed_in: "Phase 7"
    evidence: "Phase 7 success criterion 1 requires the three-OS fixture matrix to pass; REL-01 owns cross-platform proof. Phase 1 supplies the workflow definition, which exists, is on a 3-OS matrix, and now names all ten Phase 1 suites including the two added by 01-17/01-18. Also raised as human item 1 for the immediate push."
behavior_unverified_items:
  - truth: "SC2 — a write or removal that could escape an allowed root through a REPARSE POINT is refused, and an outside sentinel remains untouched"
    test: "On a Windows host with the privileges `fsutil reparsepoint` requires, create a directory carrying an unclassified reparse tag inside an allowed root, then run an alpha-AOS dry-run and an apply against a path under it."
    expected: "A stable unsupported/refusal code, no mutation, and the outside sentinel hash unchanged. The dry-run and inspection paths must remain useful (D-01)."
    why_human: "Re-confirmed this session: `node --test dist/test/path-boundary.test.js` reports `an unclassified reparse point yields a stable unsupported refusal` as skipped — `fsutil reparsepoint is unavailable or unprivileged on this host`. 01-VALIDATION.md designates this the phase's one manual-only verification. The other four SC2 vectors (directory link, junction, alias, parent-path change) are green."
  - truth: "SC2 — file-symlink escape refusal for both write and removal"
    test: "On a Windows host with SeCreateSymbolicLinkPrivilege (or Developer Mode), re-run `node --test dist/test/path-boundary.test.js`."
    expected: "`a file link that escapes the allowed root is refused for both write and removal` runs and passes rather than skipping."
    why_human: "Re-confirmed this session: skipped — 'this host cannot create file symlinks without privileges'. The directory-link equivalent is green, so the code path is exercised; only the file-link variant is not-run."
human_verification:
  - test: "Push the phase-1 commits and let `.github/workflows/ci.yml` run"
    expected: "The ubuntu-latest and macos-latest legs pass `npm run check`, `npm test`, `npm run build:check` and the ten named Safety boundary suites — now including `dist/test/protocol-session.test.js` and `dist/test/mcp-proxy.test.js` — with `preview.test.js` reporting an empty not-run list for the two POSIX wrapper families."
    why_human: "Re-confirmed this session: `git status` reports `main...origin/main [ahead 61]`, and `gh run list` still shows the newest CI run as 33632928589 dated 2026-09-02 — before any phase-1 commit. 01-VALIDATION.md states the three-OS CI suite must be green before verification; that gate has not been exercised."
  - test: "Windows unknown-reparse canary — see behavior_unverified_items item 1"
    expected: "As stated per item"
    why_human: "Privileged Windows filesystem fixture (`fsutil reparsepoint`)"
  - test: "File-symlink escape canary — see behavior_unverified_items item 2"
    expected: "As stated per item"
    why_human: "Requires SeCreateSymbolicLinkPrivilege or Developer Mode"
  - test: "Judgment-tier prohibition review (non-authoritative verifier verdict)"
    expected: "Human confirmation of 01-01 P2, 01-03, 01-04, 01-11 and 01-15 — the five prohibitions verified by source reading rather than by a negative test"
    why_human: "Fail-closed policy: a judgment-tier prohibition is never silently green"
---

# Phase 01: Safe Operation Boundary Verification Report

**Phase Goal:** Users can trust alpha-AOS to preview changes, reject unsafe or ambiguous operations, preserve recoverable state, and keep secrets out of every observable surface.
**Verified:** 2026-09-05
**Status:** human_needed
**Re-verification:** Yes — after gap closure by plans 01-17 and 01-18. This report supersedes the `gaps_found` report of 2026-09-05T01:05:00Z.

## Executive Note

**The one gap that blocked the previous pass is genuinely closed.** I did not take the summaries' word for it. `openProtocolProcess` exists as a real 200-line bounded protocol-session mode in `src/core/process.ts`; `src/core/mcp-fixture.ts` no longer imports a child-process primitive; `src/core/mcp-proxy.ts` no longer imports the SDK's `StdioClientTransport`; the `protocolSessionExceptions` carve-out is gone from `test/process.test.ts`; and both new suites are green when run from this verifier's own process. There are exactly two `spawn(` call sites left in all of `src/`, and both are inside `src/core/process.ts`.

What keeps this from `passed` is no longer a defect. It is three pieces of evidence that cannot be produced on this host or in this process: two privilege-gated Windows filesystem canaries, and a CI matrix that has never run because 61 phase-1 commits are unpushed. Under the Step 9 decision tree that is `human_needed`, not `gaps_found`.

## Gap Closure — Direct Codebase Evidence

The previous report's `gaps[0].missing` had four items. Each is checked against the code, not the SUMMARY.

| # | `missing` item | Status | Codebase evidence |
|---|---|---|---|
| 1 | "A protocol-session mode on the process adapter (`openProtocolProcess`) with a byte cap on the stdout side, plus a fake-upstream-server test" | ✓ CLOSED | `src/core/process.ts:394` `export async function openProtocolProcess(spec: ProtocolProcessSpec)`. Absolute-path guard (398-403), `materializeEnvironment(spec.environment)` (405), `shell: false` (413), `detached` + `killTree` (485, 550, 638), absolute deadline with an explicit `timeoutMs === 0` opt-out that disables **only** that timer (494-501), per-frame cap `pending.byteLength > frameLimit` → `killTree(SIGKILL)` + `frameCapped` → `code: "output-cap"` (549-554, 566). `test/protocol-session.test.ts` is 505 lines / 9 tests against five fake upstream servers. |
| 2 | "Migration of `src/core/mcp-fixture.ts` off the direct `spawn` … retiring the `protocolSessionExceptions` allowance" | ✓ CLOSED | `mcp-fixture.ts:8` imports `openProtocolProcess`; line 97 opens the session; no `node:child_process` import remains. `test/process.test.ts:411-444` — the enumeration now carries **no exception set** and asserts `files.includes("src/core/mcp-fixture.ts")` so the module cannot be dropped from the list instead of migrated. Repo-wide: `grep spawn(` in `src/` returns only `process.ts:274` and `process.ts:411`. |
| 3 | "An MCP SDK `Transport` adapter in `src/core/mcp-proxy.ts` built on that mode" | ✓ CLOSED | `mcp-proxy.ts:86` `export class BoundedStdioTransport implements Transport`; `start()` calls `openProtocolProcess(this.#spec)` (104); `send()` on a null session **throws** rather than degrading (131); `stderrEvidence()` is the only reader of upstream stderr (154). `runMcpFilterProxy` (166-176) constructs it with `timeoutMs: 0, maxOutputBytes: 64KiB, maxMessageBytes: DEFAULT_MAX_MESSAGE_BYTES`. No `client/stdio.js` import anywhere in the file. |
| 4 | "No later roadmap phase names this work … it is not deferrable" | ✓ MOOT | Work was done in-phase rather than deferred. STATE.md:112 records the intermediate state honestly. |

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Preview every mutating command; checkouts, packages, native config, managed state, harness resources byte-for-byte unchanged | ✓ VERIFIED | Unchanged by the gap plans (`test/preview.test.ts` not touched by any 01-17/01-18 commit). Regression check: suite green at 191 tests / 189 pass / 0 fail / 2 skipped; `npm run build:check` → `build artifact verified: 55 inputs, 104 outputs` (run by this verifier). Prior evidence stands: 20 mutating CLI commands digested across 5 surfaces before/after, 4/4 wrapper families executed with an empty not-run list. |
| 2 | Refusal when a write/removal could escape an allowed root through symlink, junction, reparse point, alias, or parent-path change; outside sentinel untouched | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Re-run this session: `node --test dist/test/path-boundary.test.js` → 17 tests, 15 pass, **0 fail**, 2 skipped. Green: `a link that escapes the allowed root is refused and the outside sentinel is untouched`, `a parent swapped between preflight and mutation is caught by an immediate recheck`, `every managed root class enforces containment, not just the target root`, `an unproven boundary offers no override that turns it into an applyable one`, `an ancestor replaced by a different directory fails the recheck`, `a component the operation creates is allowed, but a link appearing there is not`. Not-run: `an unclassified reparse point yields a stable unsupported refusal` and `a file link that escapes the allowed root is refused for both write and removal`. The suite prints the not-run evidence explicitly (`path-boundary not-run evidence: [...]`) and `unsupported path fixtures are reported, never counted as passes` ✔ enforces that. Routed to human verification; not counted as verified. |
| 3 | Concurrent/interrupted managed writes serialize safely, leave hash-checked journal evidence, and report the real operation state | ✓ VERIFIED | Unchanged by the gap plans. Regression check green in the full-suite run. Prior evidence stands (writer-lock D-06, durable-boundary D-07, no-false-rollback). |
| 4 | Human/JSON output, plans, journals, snapshots, subprocess failures and CI evidence redact credentials; launched commands use no shell, bounded capture, timeouts, approved env names only | ✓ VERIFIED **(upgraded from partial)** | The prior report's one qualification — "one narrow bounded-capture hole on the MCP protocol stdout path" — is closed and now behaviorally proven, not merely present. See the Behavioral Spot-Checks table: `one unterminated protocol frame past the cap terminates the child instead of growing the buffer` ✔, `an absolute deadline settles the session as timed out, and disabling it leaves the frame cap in force` ✔, `only operation-approved environment names reach a protocol child` ✔, `protocol session evidence carries fingerprints and typed placeholders, never raw bytes` ✔, `closing a protocol session terminates the whole child tree` ✔, plus `an oversize upstream frame closes the transport instead of buffering` ✔ and `upstream stderr becomes bounded redacted evidence, never terminal output` ✔ on the proxy. |
| 5 | Malformed, ambiguous, unsupported or schema-invalid catalogs, locks, manifests, evidence, receipts, journals and native config are rejected before mutation | ✓ VERIFIED | Unchanged by the gap plans. Regression check green. Ajv remains `strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false`. |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

The headline score is numerically identical to the prior report, and that is not a lack of progress: the prior 4/5 was 4 verified + 1 behavior-unverified **with a blocking gap underneath SC4**. The gap is gone; SC4 is now clean rather than qualified. The single remaining shortfall is the privilege-gated SC2 canary, which no amount of code can close on an unprivileged host.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | End-to-end managed install test | Phase 7 | SC1: three-OS fixture install/reconcile/diagnose/uninstall "without touching real shared roots" — the fixture environment 01-14 says this test requires. Re-checked: still absent, reasoning still correct. |
| 2 | macOS and Linux CI legs observed | Phase 7 | SC1 requires the three-OS matrix to pass; REL-01 owns cross-platform proof. Also raised as human item 1. |

`openProtocolProcess` is no longer deferred or open — it was built in-phase.

### Required Artifacts

Newly delivered / changed by the gap-closure plans, checked at all four levels:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/process.ts` | exports `normalizeProcessSpec`, `runProcess`, **`openProtocolProcess`** | ✓ VERIFIED | 798 lines (was 460). All three exports present. `ProtocolProcessSpec` / `ProtocolSession` interfaces exported and consumed by `mcp-proxy.ts`. Wired: imported by `mcp-fixture.ts`, `mcp-proxy.ts`, `harnesses.ts`, and both new suites. |
| `src/core/mcp-fixture.ts` | probe driven by a bounded session, no child-process primitive | ✓ VERIFIED | 340 lines. `openProtocolProcess` at line 97 with an explicit `nodeRuntimeEnvironment` allowlist, `timeoutMs: 120_000`, `maxOutputBytes: 64KiB`, and `finally { await session.close(); }`. No `node:child_process` import. |
| `src/core/mcp-proxy.ts` | "SDK-compatible MCP client transport backed by the bounded ProcessSpec protocol session" | ✓ VERIFIED **(was ⚠️ PARTIAL)** | 212 lines (was 141). All five declared exports present: `allowedMcpTools`, `upstreamEnvironment`, `upstreamEnvironmentPolicy`, `BoundedStdioTransport`, `runMcpFilterProxy`. Data flows: `cli.ts:172` → `runMcpFilterProxy` → `BoundedStdioTransport` → `openProtocolProcess`. |
| `test/protocol-session.test.ts` | fake-upstream contract for the session mode | ✓ VERIFIED | 505 lines, 9 tests, all green in this verifier's own run. |
| `test/mcp-proxy.test.ts` | fake-upstream-MCP contract for the bounded transport | ✓ VERIFIED | 6 tests, all green in this verifier's own run. Drives the transport through a **real SDK `Client`**, not a mock. |
| `test/process.test.ts` | direct-spawn enumeration with **no** exception set | ✓ VERIFIED | 523 lines. Lines 411-444 carry no exception set and add a guard that `mcp-fixture.ts` stays inside the enumeration. |
| `.github/workflows/ci.yml` | three-OS list naming the two new suites | ✓ VERIFIED (never executed) | Lines 48-49 name `dist/test/protocol-session.test.js` and `dist/test/mcp-proxy.test.js` inside the ten-suite per-OS step. |

All 44 artifacts from the prior report remain present and substantive; no regressions found.

**ℹ Info (not a gap):** `upstreamEnvironment` has no caller in `src/` — its only consumer is `test/mcp-proxy.test.ts:425`. This is honestly recorded as a decision in 01-18-SUMMARY.md and the export is required by `must_haves.artifacts.exports`, so it is a declared surface covered by a test rather than dead code.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/core/mcp-fixture.ts` | `src/core/process.ts` | `openProtocolProcess` | ✓ WIRED **(was ✗ NOT_WIRED)** | Line 8 import, line 97 call site |
| `src/core/mcp-proxy.ts` | `src/core/process.ts` | `openProtocolProcess\|ProtocolProcessSpec` | ✓ WIRED **(was ✗ NOT_WIRED)** | Lines 7, 12, 104 — both symbols present |
| `src/core/process.ts` | `src/core/redaction.ts` | session evidence redacted + fingerprinted before leaving the adapter | ✓ WIRED | `createRedactedExcerpt` / `createRedactionContext` at line 6; `BoundedStream.snapshot()` (217-220) applies redaction; `openProtocolProcess` calls `stdout.snapshot(redaction)` / `stderr.snapshot(redaction)` (439-440) |
| `test/protocol-session.test.ts` | `src/core/process.ts` | fake NDJSON server end-to-end | ✓ WIRED | 8 `openProtocolProcess` call sites |
| `test/protocol-session.test.ts` | `src/core/mcp-fixture.ts` | production probe driven against a fake MCP server | ✓ WIRED | `the migrated fixture probe completes a tool discovery round trip through the bounded session` ✔ |
| `test/mcp-proxy.test.ts` | `src/core/mcp-proxy.ts` | fake upstream drives the transport through a real SDK `Client` | ✓ WIRED | `BoundedStdioTransport` imported and exercised |
| `.github/workflows/ci.yml` | `test/protocol-session.test.ts`, `test/mcp-proxy.test.ts` | per-OS safety step | ✓ WIRED (never executed) | ci.yml:48-49 |
| `src/cli.ts` | `src/core/mcp-proxy.ts` | `runMcpFilterProxy` | ✓ WIRED | cli.ts:26 import, cli.ts:172 call |
| `src/core/install.ts` | `src/core/mcp-fixture.ts` | `createMcpFixtureOperationPlan` | ✓ WIRED | install.ts:27, 486, 518 |
| `src/core/mcp-proxy.ts` | `src/core/redaction.ts` | — | ℹ DROPPED, by design | 01-18 removed the `./redaction.js` import because the file now performs no redaction. The chain stays greppable across `mcp-proxy.ts → process.ts → redaction.ts`. Recorded as a decision, not a silent removal. |

All 16 key links from the prior report re-checked; the two previously-broken ones are now wired, none regressed.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `process.ts` `ProtocolSession.evidence()` | `stdout` / `stderr` | `BoundedStream.snapshot(redaction)` over live `child.stdout`/`child.stderr` `data` events | Yes — asserted `sha256.length === 64` and `totalBytes > DEFAULT_MAX_MESSAGE_BYTES` under flood | ✓ FLOWING |
| `process.ts` settled `ProcessResult.code` | `code` | real `child.once("close")` + `timedOut`/`frameCapped` flags | Yes — `output-cap`, `timeout`, `ok`, `non-zero-exit` all observed in the suite | ✓ FLOWING |
| `mcp-fixture.ts` `discoverTools` → tool names | `tools` | real `tools/list` JSON-RPC reply from the child | Yes — round trip asserted against a fake upstream | ✓ FLOWING |
| `mcp-proxy.ts` `ListTools` result | `result.tools` | real upstream `client.listTools()` filtered by `allow` | Yes — "returns only allowlisted tools" asserted through a real SDK `Client` | ✓ FLOWING |
| `mcp-proxy.ts` `stderrEvidence()` | `RedactedExcerpt` | `session.evidence().stderr` | Yes — asserted bounded, redacted, fingerprinted | ✓ FLOWING |

No hollow props, no static returns, no fixture-only data paths on the production side.

### Behavioral Spot-Checks

All commands run by this verifier in its own process. Nothing below is quoted from a SUMMARY.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck clean | `npm run check` | exit 0, no output | ✓ PASS |
| Build provenance | `npm run build:check` | `build artifact verified: 55 inputs, 104 outputs` | ✓ PASS |
| Protocol-session contract | `node --test dist/test/protocol-session.test.js` | **9 tests, 9 pass, 0 fail, 0 skipped**, 9.5s | ✓ PASS |
| — round trip | (above) | `a bounded protocol session completes a JSON-RPC round trip against a fake upstream server` ✔ | ✓ PASS |
| — **frame cap terminates, not buffers** | (above) | `one unterminated protocol frame past the cap terminates the child instead of growing the buffer` ✔ — asserts `code: "output-cap"`, `outputCapped: true`, whole-stream `totalBytes > 1 MiB`, retained excerpt ≤ 64 KiB, `sha256.length === 64`, **and the announced child pid is dead** | ✓ PASS |
| — **deadline / no orphan** | (above) | `a protocol response that never arrives fails on its own deadline and leaves no child behind` ✔ | ✓ PASS |
| — **`timeoutMs: 0` does not disable the frame cap** | (above) | `an absolute deadline settles the session as timed out, and disabling it leaves the frame cap in force` ✔ — proves 01-17 prohibition 1 in both directions | ✓ PASS |
| — env allowlist | (above) | `only operation-approved environment names reach a protocol child` ✔ — `deepEqual(unexpected, [])` | ✓ PASS |
| — D-12 evidence | (above) | `protocol session evidence carries fingerprints and typed placeholders, never raw bytes` ✔ — asserts `/\[redacted:secret:/`, no verbatim secret in the excerpt, in the settled result, or in the `close()` result | ✓ PASS |
| — **child-tree cleanup** | (above) | `closing a protocol session terminates the whole child tree` ✔ — descendant pid observed and confirmed dead (no not-run diagnostic emitted on this host) | ✓ PASS |
| — migrated production path | (above) | `the migrated fixture probe completes a tool discovery round trip through the bounded session` ✔ | ✓ PASS |
| — carve-out retired | (above) | `no protocol-session carve-out survives in the source enumeration` ✔ — with a positive control asserting the enumeration test itself still exists | ✓ PASS |
| Bounded proxy transport | `node --test dist/test/mcp-proxy.test.js` | **6 tests, 6 pass, 0 fail, 0 skipped** | ✓ PASS |
| — real SDK client round trip + filtering | (above) | `the filter proxy reaches a fake upstream server through the bounded transport and returns only allowlisted tools` ✔ | ✓ PASS |
| — oversize frame | (above) | `an oversize upstream frame closes the transport instead of buffering` ✔ | ✓ PASS |
| — allowlist refusal | (above) | `a tool outside the allowlist is refused before it reaches upstream` ✔ — witnessed by the upstream's own call log | ✓ PASS |
| — no SDK stdio transport | (above) | `the proxy builds no transport from the SDK stdio client` ✔ — with a positive control (`openProtocolProcess` must be present) so deleting the transport cannot make it pass | ✓ PASS |
| Direct-spawn enumeration | `node --test --test-name-pattern "no source module spawns a child outside the process adapter" dist/test/process.test.js` | 1 pass, 0 fail | ✓ PASS |
| Path boundary (SC2) | `node --test dist/test/path-boundary.test.js` | 17 tests, 15 pass, **0 fail**, 2 skipped | ⚠️ PARTIAL → human |
| Only two spawn sites in src/ | `grep -rn "spawn(" src/` | `process.ts:274`, `process.ts:411` — nothing else | ✓ PASS |
| CI has run on phase-1 code | `git status -sb`; `gh run list` | `main...origin/main [ahead 61]`; newest run 33632928589 dated 2026-09-02 | ✗ FAIL → human |

### Probe Execution

N/A — this project declares no `scripts/*/tests/probe-*.sh` probes; the phase's runnable verification is the Node test suite, exercised above.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| SAFE-01 | 01-01, 01-13, 01-14, 01-15, 01-16 | ✓ SATISFIED | SC1 green; wrappers are launchers with no fallback branch |
| SAFE-02 | 01-02, 01-07, 01-09, 01-12, 01-13, 01-14, 01-15, 01-16 | ? NEEDS HUMAN | 4/5 escape vectors green; unknown-reparse and file-symlink fixtures not-run on this host (01-VALIDATION.md manual-only) |
| SAFE-03 | 01-02, 01-09, 01-12, 01-13, 01-14, 01-15, 01-16 | ✓ SATISFIED | SC3 green |
| SAFE-04 | 01-01, 01-03, 01-08, 01-09, 01-10, 01-11, 01-12, 01-13, 01-14, 01-15, 01-16, **01-17, 01-18** | ✓ SATISFIED | SC4 redaction clauses green across CLI, JSON, doctor, errors, journals, support bundle — and now across the protocol-session and upstream-transport paths, with D-12 asserted by test on both |
| SAFE-05 | 01-01, 01-04, 01-05, 01-06, 01-10, 01-13, 01-15, 01-16 | ✓ SATISFIED | SC5 green |
| SAFE-06 | 01-02, 01-08, 01-11, 01-12, 01-14, 01-15, 01-16, **01-17, 01-18** | ✓ SATISFIED **(was ⚠️ PARTIAL)** | Shell-free, timeouts, env allowlist and byte cap now proven on **every** child path. The two MCP protocol paths that were outside the adapter are inside it, and the enumeration test that guards the boundary carries no exception set |

**Orphans:** none. REQUIREMENTS.md maps exactly SAFE-01..SAFE-06 to Phase 1; every ID is claimed by at least one plan and accounted for above.

**ℹ Bookkeeping note (not a gap):** `.planning/REQUIREMENTS.md` currently marks SAFE-04 and SAFE-06 `[x] / Complete` and SAFE-01, SAFE-02, SAFE-03, SAFE-05 `[ ] / Pending`. The four pending ones are substantively satisfied by this verification (SAFE-02 pending human). The checkbox flip belongs to phase completion, not to the verifier.

### Prohibition Verification

The 18 prohibitions from the prior report were re-confirmed to still hold (no source regressions in the files they cover). The five new ones from 01-17 and 01-18 all arrived `status: unverified, flagged: true`, and each was checked against source or a named passing test rather than accepted on the summary's word.

| Plan | Prohibition (abbreviated) | Verdict | Enforcement evidence |
|------|---------------------------|---------|----------------------|
| 01-17 | A protocol session MUST NOT be exempted from the byte cap for being long-lived; disabling the absolute deadline still enforces the per-frame bound | **HOLDS** (test-tier, enforcement wired) | `an absolute deadline settles the session as timed out, and disabling it leaves the frame cap in force` ✔ — the `timeoutMs: 0` half asserts `code: "output-cap"` with `timedOut: false`. Source: `process.ts:494-501` gates **only** the `setTimeout`; the frame cap at 549-554 is outside that branch. The executor added this test itself after noticing the plan's four named tests all passed against the tracer — a genuine fail-first, recorded in the 01-17 deviations |
| 01-17 | A protocol-session failure message MUST NOT interpolate accumulated child output | **HOLDS** (test-tier) | `process.ts:437-443` `describe()` emits only a 12-char sha256 prefix and a byte count. `protocol session evidence carries fingerprints and typed placeholders, never raw bytes` ✔ asserts no verbatim secret in the excerpt, the settled result, or the `close()` result |
| 01-17 | The direct-spawn allowance MUST NOT be widened, renamed, or re-pointed at another module instead of migrating the module that holds it | **HOLDS** (test-tier) | `test/process.test.ts:411-444` has no exception set and asserts `files.includes("src/core/mcp-fixture.ts")`. `no protocol-session carve-out survives in the source enumeration` ✔ greps for `protocolSessionExceptions` (absent) **and** for the enumeration test's own name (present), so deleting the guard is not a way to pass |
| 01-18 | The filter proxy MUST NOT fall back to the SDK's stdio client transport, or any unbounded transport, when the bounded session cannot start | **HOLDS** (test-tier, structural) | `the proxy builds no transport from the SDK stdio client` ✔ with a positive control. Source: `mcp-proxy.ts:131` `send()` throws on a null session; `start()` throws on a second call; the `client/stdio.js` import is gone entirely |
| 01-18 | The proxy MUST NOT forward a tool name outside the allowlist even when upstream advertises it or a client requests it by exact name | **HOLDS** (test-tier) | `a tool outside the allowlist is refused before it reaches upstream` ✔ — refusal witnessed by the fake upstream's own call log, not just by the return value. Source: `mcp-proxy.ts` filters on the list path and throws on the call path |

**All 23 prohibitions hold.** None was accepted on a summary's word. The five judgment-tier ones (01-01 P2, 01-03, 01-04, 01-11, 01-15) remain non-authoritative verifier judgments and are carried into `human_verification` rather than silently green.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `test/protocol-session.test.ts` | SAFE-04, SAFE-06 | 9 | 0 | No | Behavioral (multi-step JSON-RPC round trips; process-liveness assertions via `process.kill(pid, 0)`) | ✓ STRONG |
| `test/mcp-proxy.test.ts` | SAFE-04, SAFE-06 | 6 | 0 | No | Behavioral (real SDK `Client` against five fake upstream servers; refusal witnessed by the upstream's log) | ✓ STRONG |
| `test/process.test.ts` | SAFE-06 | 19 | 0 | No | Value + source-enumeration | ✓ STRONG |
| `test/path-boundary.test.ts` | SAFE-02 | 15 | 2 | No | Behavioral | ⚠️ 2 privilege-gated fixtures not-run |

**Disabled tests on requirements:** 2, both on SAFE-02, both environment-gated at runtime via `context.skip` with a stated reason — not `it.skip`/`xit` source-level disables. Neither is the only test for its requirement: SAFE-02 has 15 other active tests including a directory-link escape equivalent. → ⚠️ WARNING, routed to human, not a BLOCKER.

**Circular patterns detected:** 0. Every expected value in the two new suites comes from a hand-written fake upstream server whose behavior is defined in the test, not from the system under test. `writeFile` appears only to author those fake-server scripts.

**Insufficient assertions:** 0. Both new negative-control tests carry explicit **positive controls** so that deleting the thing under test cannot make the assertion pass — that is stronger than the norm and worth noting.

**Fail-first evidence:** 01-17's frame-cap and round-trip tests were committed RED (`42241f4`) before the implementation (`e3e42f2`), and the deadline test was the sole RED that `20a6dfd` turned green. 01-18 Task 2 could not achieve a RED by construction (it forbids editing the implementation); the executor substituted a replay of the three negative-control regexes against the pre-change source (`git show 6a95361:src/core/mcp-proxy.ts`) and recorded that substitution openly in the deviations section. That is an acceptable equivalent, honestly disclosed.

### Decision Coverage

15 trackable decisions (D-01..D-15) in `01-CONTEXT.md`; 15 honored, 0 not honored. The two decisions most directly exercised by the gap-closure work:

- **D-12** (bounded redacted excerpt + fingerprint, never raw output) — honored by `describe()` in `process.ts` and asserted by name in both new suites.
- **D-01** (fail closed with inspection preserved) — honored structurally by `BoundedStdioTransport.send()` throwing rather than degrading to an unbounded transport.

Non-blocking gate; no status impact.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TODO`/`FIXME`/`TBD`/`XXX`/`HACK`/`PLACEHOLDER`/"not yet implemented" | — | **Zero occurrences** across all seven files changed by 01-17 and 01-18 |
| `src/core/mcp-fixture.ts` | 142, 146 | `JSON.stringify(initialized.error)` interpolates a parsed JSON-RPC `error` object into a thrown message | ℹ Info | **Pre-existing, unchanged by 01-17** (present verbatim at `7edc1b6:src/core/mcp-fixture.ts:150,154`). This is a structured protocol-level reply, not accumulated stdout, so it is outside 01-17's prohibition — which governs *session failure* messages and is satisfied by `describeProcessFailure`. Residual risk is low: the probe hands the child only deliberate non-secret fixture keys. Worth a line in a future hardening pass; not a gap. |
| `src/core/mcp-proxy.ts` | 65 | `upstreamEnvironment` exported with no `src/` caller | ℹ Info | Declared must-have export, consumed by `test/mcp-proxy.test.ts:425`. Recorded as a decision in 01-18-SUMMARY.md. |

The previous report's one ⚠️ Warning — `mcp-fixture.ts:118-119` unbounded residual buffer — **is resolved**. That code no longer exists; the residual is now a `Buffer` bounded by `frameLimit` inside `openProtocolProcess`, and exceeding it kills the child tree.

### Summary Accuracy Check

Both gap-closure summaries were cross-referenced against `git show --stat` rather than trusted.

- **01-17** declared 5 `files_modified`; commits `42241f4`, `e3e42f2`, `45482ef`, `20a6dfd`, `2ec0130` touched exactly those 5 and nothing else.
- **01-18** declared 3 `files_modified`; commits `6a95361`, `84e4943`, `5a16f17` touched exactly those 3 and nothing else.
- Every numeric claim I re-ran matched: 9/9 protocol-session, 6/6 mcp-proxy, 55 inputs / 104 outputs, `npm run check` clean.
- Both summaries disclose their deviations in detail, including 01-18's inability to produce a RED gate — a disclosure that works against the executor's own interest. No overclaiming found in either.

### Human Verification Required

**1. Push phase 1 and confirm the three-OS CI legs**
**Test:** Push the 61 unpushed phase-1 commits; let `.github/workflows/ci.yml` run.
**Expected:** ubuntu-latest and macos-latest pass `npm run check`, `npm test`, `npm run build:check` and the ten named Safety boundary suites — including the two added by this gap closure — with `preview.test.js` reporting an empty not-run list for `install.sh`/`update.sh`.
**Why human:** `git status -sb` → `main...origin/main [ahead 61]`; `gh run list` newest run is 33632928589 dated 2026-09-02, predating every phase-1 commit. 01-VALIDATION.md makes this a pre-verification gate. Requires a push, which is a human decision.

**2. Windows unknown-reparse canary (SAFE-02, 01-VALIDATION.md manual-only)**
**Test:** On a privileged Windows host, create a directory with an unclassified reparse tag inside an allowed root; run dry-run then apply against a path beneath it.
**Expected:** Stable unsupported/refusal code, no mutation, outside sentinel hash unchanged, inspection still available (D-01).
**Why human:** `fsutil reparsepoint` requires privileges this host and CI runners do not guarantee. The suite reports it not-run and never as a pass.

**3. File-symlink escape canary (SAFE-02)**
**Test:** With SeCreateSymbolicLinkPrivilege or Developer Mode enabled, re-run `node --test dist/test/path-boundary.test.js`.
**Expected:** `a file link that escapes the allowed root is refused for both write and removal` runs and passes.
**Why human:** Skipped on this host for lack of privilege. The directory-link equivalent is green, so the code path is exercised.

**4. Judgment-tier prohibitions (non-authoritative verifier verdict — human review recommended)**
01-01 P2, 01-03, 01-04, 01-11 and 01-15 were verified by source reading rather than by a negative test. All five hold in my judgment; per the fail-closed policy they remain flagged rather than silently green.

## Gaps Summary

**None.** The single gap from the prior report is closed, and I confirmed the closure against source and against tests I ran myself rather than against the summaries.

What remains is evidence that cannot be produced here, not work that was not done:

- Two SAFE-02 escape vectors need a privileged Windows host. The suite already refuses to count them as passes and prints explicit not-run evidence, which is the correct behavior for a safety boundary — a fixture that cannot run must never read as green.
- The three-OS CI matrix is defined, correct, and names all ten suites, but has never executed because the phase's 61 commits are unpushed.
- The end-to-end managed install fixture is genuinely deferred to Phase 7, whose SC1 names exactly the fixture environment it requires.

The phase goal — preview safely, refuse unsafe or ambiguous input, preserve recoverable state, keep secrets out of every observable surface — is achieved on this host, and the last path that sat outside the bounded process adapter is now inside it with behavioral proof rather than assertion.

---

_Verified: 2026-09-05_
_Verifier: Claude (gsd-verifier)_
