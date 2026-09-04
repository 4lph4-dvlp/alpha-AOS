---
phase: 01-safe-operation-boundary
verified: 2026-09-05T01:05:00Z
status: gaps_found
score: 4/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "MCP protocol sessions use the same bounded process boundary (01-08 artifact export `openProtocolProcess`; 01-08 and 01-11 key_links)"
    status: failed
    reason: "`openProtocolProcess` does not exist anywhere in src/. Two MCP protocol paths therefore sit outside the single bounded process adapter that SAFE-06 asserts. The gap is honestly recorded in four places (01-08, 01-11, 01-14, 01-16 summaries and STATE.md) and the exception is asserted in code, not just prose — but it is still an undelivered must-have artifact export and two undelivered key links."
    artifacts:
      - path: src/core/process.ts
        issue: "01-08 must_haves declares exports [normalizeProcessSpec, runProcess, openProtocolProcess]. Only the first two exist."
      - path: src/core/mcp-fixture.ts
        issue: "Line 96 calls `spawn` directly. Line 118-119 accumulates `stdout += chunk` and keeps the residual after the last newline; a child that emits a long line without a newline grows that buffer without a byte cap. stderr IS capped (`.slice(-8_000)`), a 60s deadline and `child.kill()` exist, shell is off, and the environment is an explicit allowlist — only the stdout byte bound is missing."
      - path: src/core/mcp-proxy.ts
        issue: "01-08 declares this artifact as an 'SDK-compatible MCP client transport backed by the bounded ProcessSpec protocol session'. It still uses the SDK's own `StdioClientTransport`; neither `openProtocolProcess` nor `ProcessSpec` appears in the file. It does use `materializeEnvironment` and `resolveNodePackageCli` from process.ts, and it bounds upstream stderr, so the environment and stderr leaks the plan named are closed — the transport itself is not."
    missing:
      - "A protocol-session mode on the process adapter (`openProtocolProcess`) with a byte cap on the stdout side, plus a fake-upstream-server test"
      - "Migration of `src/core/mcp-fixture.ts` off the direct `spawn` and onto that mode, retiring the `protocolSessionExceptions` allowance in test/process.test.ts"
      - "An MCP SDK `Transport` adapter in `src/core/mcp-proxy.ts` built on that mode"
      - "No later roadmap phase names this work (STATE.md line 85: 'No plan in phase 1 now owns it'), so it is not deferrable on current evidence"
deferred:
  - truth: "An end-to-end managed install test exercising `applyManagedInstall` under one session"
    addressed_in: "Phase 7"
    evidence: "Phase 7 success criterion 1: 'The same packed release bytes install, reconcile, diagnose, and uninstall successfully in Windows, macOS, and Linux fixture environments without touching real shared roots.' A fixture/container-backed environment is exactly what 01-14 says this test needs."
  - truth: "The macOS and Linux CI legs are observed rather than asserted"
    addressed_in: "Phase 7"
    evidence: "Phase 7 success criterion 1 requires the three-OS fixture matrix to pass; REL-01 owns cross-platform proof. Phase 1 supplies the workflow definition, which exists and names every Phase 1 suite."
behavior_unverified_items:
  - truth: "SC2 — a write or removal that could escape an allowed root through a REPARSE POINT is refused, and an outside sentinel remains untouched"
    test: "On a Windows host with the privileges `fsutil reparsepoint` requires, create a directory carrying an unclassified reparse tag inside an allowed root, then run an alpha-AOS dry-run and an apply against a path under it."
    expected: "A stable unsupported/refusal code, no mutation, and the outside sentinel hash unchanged. The dry-run and inspection paths must remain useful (D-01)."
    why_human: "`test/path-boundary.test.ts#an unclassified reparse point yields a stable unsupported refusal` skipped on this host — `fsutil reparsepoint is unavailable or unprivileged`. 01-VALIDATION.md designates this the phase's one manual-only verification. The other four SC2 vectors (symlink, junction, alias, parent-path change) are green; this is the fifth."
  - truth: "SC2 — file-symlink escape refusal for both write and removal"
    test: "On a Windows host with SeCreateSymbolicLinkPrivilege (or Developer Mode), re-run `node --test dist/test/path-boundary.test.js`."
    expected: "`a file link that escapes the allowed root is refused for both write and removal` runs and passes rather than skipping."
    why_human: "Skipped on this host — 'this host cannot create file symlinks without privileges'. The directory-link equivalent is green, so the code path is exercised; only the file-link variant is not-run."
human_verification:
  - test: "Push the phase-1 commits and let `.github/workflows/ci.yml` run"
    expected: "The ubuntu-latest and macos-latest legs pass `npm run check`, `npm test`, `npm run build:check` and the named Safety boundary suites, with `preview.test.js` reporting an empty not-run list for the two POSIX wrapper families."
    why_human: "`gh run list` shows the newest CI run is 33632928589 from 2026-09-02 — before any phase-1 commit. Every phase-1 commit is unpushed. 01-VALIDATION.md states the three-OS CI suite must be green before verification; that gate has not been exercised. 01-16-SUMMARY.md records this honestly."
  - test: "See the reparse-point and file-symlink canary items in behavior_unverified_items above"
    expected: "As stated per item"
    why_human: "Privileged Windows filesystem fixtures"
---

# Phase 01: Safe Operation Boundary Verification Report

**Phase Goal:** Users can trust alpha-AOS to preview changes, reject unsafe or ambiguous operations, preserve recoverable state, and keep secrets out of every observable surface.
**Verified:** 2026-09-05
**Status:** gaps_found
**Re-verification:** No — initial verification

## Executive Note

This phase is in unusually good shape. The suite is genuinely green (176 tests, 174 pass, **0 fail**, 2 skipped, 0 todo — exactly as claimed), the typecheck is clean, the build-artifact manifest verifies (53 inputs, 100 outputs), and there is not a single `TODO`/`FIXME`/`TBD`/`XXX`/`HACK` marker anywhere in the source, test, script, schema or workflow files this phase touched. Every open gap I could find was already written down by the executor before I looked. That is rare and it is worth saying plainly.

The one thing that keeps this from `passed` is not a documentation defect — it is a real undelivered must-have. See Gaps.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Preview every mutating command; checkouts, packages, native config, managed state, harness resources byte-for-byte unchanged | ✓ VERIFIED | `test/preview.test.ts` — 8 tests green. 20 mutating CLI commands enumerated, each digested across 5 surfaces before/after. `every mutating CLI preview leaves all five mutation surfaces byte-identical` ✔ (75.5s), `a preview never creates the managed state root or a writer lock` ✔, `interrupting a preview leaves no partial managed state` ✔, `two concurrent previews neither collide nor create shared state` ✔, `install and update wrappers preview without mutating either shell family` ✔ with **4/4 wrapper families executed and an empty not-run list**. |
| 2 | Refusal when a write/removal could escape an allowed root through symlink, junction, reparse point, alias, or parent-path change; outside sentinel untouched | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 4 of 5 named vectors green: `a link that escapes the allowed root is refused and the outside sentinel is untouched` ✔, `a parent swapped between preflight and mutation is caught by an immediate recheck` ✔, `every managed root class enforces containment, not just the target root` ✔, `an unproven boundary offers no override that turns it into an applyable one` ✔, `an ancestor replaced by a different directory fails the recheck` ✔. The **reparse-point** vector is not-run: `an unclassified reparse point yields a stable unsupported refusal` skipped (privileged `fsutil reparsepoint` unavailable). Routed to human verification, not counted as passed. |
| 3 | Concurrent/interrupted managed writes serialize safely, leave hash-checked journal evidence, and report the real operation state | ✓ VERIFIED | `a second writer fails immediately instead of waiting or clearing the lock` ✔, `a writer lock is never removed on the basis of elapsed time or a missing pid` ✔ (D-06), `every durable boundary leaves the target diagnosable as before, after, or neither` ✔ (D-07 / 01-09 prohibition), `a failed external step reports what it observed and never claims a rollback` ✔ (01-14 prohibition), `a bootstrap apply journals durable intent and honest before/after evidence` ✔. |
| 4 | Human/JSON output, plans, journals, snapshots, subprocess failures and CI evidence redact credentials; launched commands use no shell, bounded capture, timeouts, approved env names only | ✓ VERIFIED | `no observable CLI surface leaks a secret sentinel` ✔ (102s), `a removed secret leaves a visible typed placeholder, not a silent hole` ✔, `a failed child is described by fingerprints, never by its raw output` ✔, `unbounded child output is capped and reported as capped` ✔, `environment names that collide only by case are rejected deterministically` ✔, `shell metacharacters in an argument stay data and never execute` ✔, `no source module spawns a child outside the process adapter` ✔ (one named exception), `no source module spreads `...process.env`` ✔. One narrow bounded-capture hole on the MCP protocol stdout path is recorded under Gaps rather than failing the whole criterion. |
| 5 | Malformed, ambiguous, unsupported or schema-invalid catalogs, locks, manifests, evidence, receipts, journals and native config are rejected before mutation | ✓ VERIFIED | `malformed, ambiguous, closed-world and newer-version documents are rejected before mutation` ✔, `validation never coerces, defaults, or strips the input it is judging` ✔ (01-05 prohibition), `validating the same invalid document twice produces identical, bounded issues` ✔ (D-11), `a document with many faults is capped rather than allowed to flood output` ✔, `an unknown namespaced extension is preserved and never reaches an operation plan` ✔ (D-09), `version routing distinguishes current, migratable and newer, and plans without mutating` ✔ (D-10), `ambiguous native configuration is rejected before anything is rendered` ✔, `a runtime marker is read strictly before a directory is removed` ✔. Ajv is configured `strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false` (src/core/validation.ts:367-373). |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | End-to-end managed install test | Phase 7 | SC1: three-OS fixture install/reconcile/diagnose/uninstall "without touching real shared roots" — the fixture environment 01-14 says this test requires |
| 2 | macOS and Linux CI legs observed | Phase 7 | SC1 requires the three-OS matrix to pass; REL-01 owns cross-platform proof |

`openProtocolProcess` is **not** deferred: no later phase names it, and STATE.md line 85 states "No plan in phase 1 now owns it."

### Required Artifacts

All 44 declared artifacts exist and are substantive. Selected checks:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/process.ts` | exports normalizeProcessSpec, runProcess, **openProtocolProcess** | ⚠️ PARTIAL | 460 lines; first two exist, third does not exist anywhere in the repo |
| `src/core/mcp-proxy.ts` | "transport backed by the bounded ProcessSpec protocol session" | ⚠️ PARTIAL | 141 lines; uses SDK `StdioClientTransport`. Does use `materializeEnvironment` + `resolveNodePackageCli` and bounds upstream stderr |
| `src/core/writer-lock.ts` | acquireMutationSession, inspectWriterState, planWriterRepair, applyWriterRepair | ✓ VERIFIED | 457 lines, wired into transaction.ts and component-session.ts |
| `src/core/path-boundary.ts` | provePathBoundary, proveOperationPaths, recheckPathProof | ✓ VERIFIED | 410 lines, `recheckPathProof` consumed by transaction.ts |
| `src/core/validation.ts` | parseManagedDocument, validateManagedDocument, registerExtensionAdapter, createMigrationPlan | ✓ VERIFIED | 750 lines, consumed by catalog.ts, project.ts, mcp.ts |
| `src/core/support-bundle.ts` | planSupportBundle, applySupportBundle, renderSupportBundleBytes | ✓ VERIFIED | 286 lines; no network primitive anywhere in the module |
| `src/core/bootstrap.ts` | createBootstrapOperationPlan, applyBootstrapOperation | ✓ VERIFIED | 636 lines; session acquired via `withComponentSession` before first external child |
| `scripts/install.ps1 / .sh`, `update.ps1 / .sh` | thin verified-artifact wrappers | ✓ VERIFIED | 44-61 lines each; artifact check then `exec node dist/src/cli.js bootstrap …`, no fallback branch |
| `src/format.ts` | declared in 01-15 `files_modified` | ℹ️ UNCHANGED | Never modified in this phase (last touched by `f1ce415`). Not a defect: `cli.ts:136 print()` applies `redactString` to format.ts output, so the file needed no change. The 01-15 deviation section does not record this. |
| 8 schemas | closed contracts | ✓ VERIFIED | All present, 19-213 lines |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| test/preview.test.ts | scripts/install.ps1 | tree digest before/after | ✓ WIRED | Copied checkout + 4 launched families |
| src/core/support-bundle.ts | src/core/redaction.ts | redact before preview/write | ✓ WIRED | 4 references |
| src/core/redaction.ts | src/core/paths.ts | alias stage after replacement | ✓ WIRED | 2 references |
| src/core/catalog.ts | src/core/validation.ts | managed document route | ✓ WIRED | 4 references |
| src/adapters/harnesses.ts | src/core/process.ts | probe declarations | ✓ WIRED (different symbol) | Declared pattern `runProcess\|ProcessSpec` does not match; the real link is `probeCommand` (process.ts:427), which normalizes shims and runs `spawnSync` with `shell: false` inside the adapter. Substantively wired; the plan named the wrong symbol. |
| src/core/process.ts | src/core/redaction.ts | redaction before result | ✓ WIRED | `createRedactedExcerpt` ×2 |
| src/core/mcp-proxy.ts | src/core/process.ts | `openProtocolProcess\|ProcessSpec` | ✗ NOT_WIRED | Neither symbol present. Partial link via `materializeEnvironment`. |
| src/core/mcp-fixture.ts | src/core/process.ts | `openProtocolProcess` | ✗ NOT_WIRED | Direct `spawn` at line 96 |
| src/core/transaction.ts | src/core/writer-lock.ts | MutationSession token | ✓ WIRED | 3 references |
| src/core/transaction.ts | src/core/path-boundary.ts | recheck | ✓ WIRED | `recheckPathProof` ×2 |
| src/core/mcp.ts | src/core/validation.ts | native syntax route | ✓ WIRED | 2 references |
| src/core/gsd-compat.ts | src/core/transaction.ts | caller session + proof set | ✓ WIRED | 4 references |
| src/core/install.ts | fixtures/components | one caller session | ✓ WIRED | 12 + 8 references |
| src/core/bootstrap.ts | src/core/writer-lock.ts | one session before first external step | ✓ WIRED (one hop) | Via `withComponentSession` (component-session.ts:134-165), which reuses a caller session after a state-root ownership check and otherwise calls `acquireMutationSession` |
| src/cli.ts | src/core/bootstrap.ts | plan/apply | ✓ WIRED | 3 references |
| .github/workflows/ci.yml | test/preview.test.ts | three-OS run | ✓ WIRED (never executed) | Workflow names all 8 suites explicitly on a 3-OS matrix; has never run against a phase-1 commit |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck clean | `npm run check` | exit 0, no output | ✓ PASS |
| Full suite | `npm test` | tests 176, pass 174, **fail 0**, skipped 2, todo 0, 209s | ✓ PASS |
| Build provenance | `npm run build:check` | `build artifact verified: 53 inputs, 100 outputs` | ✓ PASS |
| Approved dependency integrity | grep package-lock.json | `smol-toml@1.8.0` integrity `sha512-kCZr2V3ch9i00x8zXRhjUNVcjG9ijES5dDudkXvUVCT5QlJNQWElSJdZqyPemffHoLNUYwOcou0Fy+ojN0uHSQ==` — byte-identical to the 01-04 approval record | ✓ PASS |
| CI has run on phase-1 code | `gh run list` | newest run 33632928589 dated 2026-09-02, before any phase-1 commit | ✗ FAIL → human |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| SAFE-01 | 01-01, 01-13, 01-14, 01-15, 01-16 | ✓ SATISFIED | SC1 green; wrappers are launchers with no fallback |
| SAFE-02 | 01-02, 01-07, 01-09, 01-12, 01-13, 01-14, 01-15, 01-16 | ? NEEDS HUMAN | 4/5 escape vectors green; unknown-reparse fixture not-run (01-VALIDATION.md manual-only) |
| SAFE-03 | 01-02, 01-09, 01-12, 01-13, 01-14, 01-15, 01-16 | ✓ SATISFIED | SC3 green |
| SAFE-04 | 01-01, 01-03, 01-08, 01-09, 01-10, 01-11, 01-12, 01-13, 01-14, 01-15, 01-16 | ✓ SATISFIED | SC4 redaction clauses green across CLI, JSON, doctor, errors, journals, support bundle |
| SAFE-05 | 01-01, 01-04, 01-05, 01-06, 01-10, 01-13, 01-15, 01-16 | ✓ SATISFIED | SC5 green |
| SAFE-06 | 01-02, 01-08, 01-11, 01-12, 01-14, 01-15, 01-16 | ⚠️ PARTIAL | Shell-free, timeouts, env allowlist and byte cap all proven; bounded capture not proven on the two MCP protocol paths (see Gaps) |

**Orphans:** none. REQUIREMENTS.md maps exactly SAFE-01..SAFE-06 to Phase 1, and every one is claimed by at least one plan.

### Prohibition Verification

Every plan carried `status: unverified, flagged: true`. Each was checked against the codebase.

| Plan | Prohibition (abbreviated) | Verdict | Evidence |
|------|---------------------------|---------|----------|
| 01-01 | Preview must not bootstrap/pull/install/build/link/create state before proving a runnable artifact exists | **HOLDS** (test-tier) | `a preview refuses with a stable message when no runnable build artifact exists` ✔; wrappers gate on `build-artifact.mjs check` and `exit 3` |
| 01-01 | Diagnostic preview must not imply upload/sharing | **HOLDS** (judgment) | cli.ts:73 "never uploaded", cli.ts:619 "Nothing is uploaded"; no network primitive in support-bundle.ts |
| 01-02 | Unknown filesystem guarantees must offer no override | **HOLDS** (test-tier) | `an unproven boundary offers no override that turns it into an applyable one` ✔ |
| 01-02 | Abandoned-looking lock never presented as safely removable on time/PID alone | **HOLDS** (test-tier) | `a writer lock is never removed on the basis of elapsed time or a missing pid` ✔ |
| 01-03 | Support diagnostics must contain no snapshot bytes and make no network request | **HOLDS** (judgment) | Repo-wide grep: the only `fetch(` in src/ is `update.ts:25` (registry version metadata), unrelated to support bundles |
| 01-04 | A [SUS]-flagged package must not be installed on name/popularity/automated metadata alone | **HOLDS** (judgment) | Human verdict recorded 2026-09-04 with cross-checked repository ownership; lockfile integrity matches the approved hash byte-for-byte |
| 01-05 | Validation must not coerce, default, remove or rewrite untrusted input | **HOLDS** (test-tier) | Ajv `coerceTypes:false, useDefaults:false, removeAdditional:false`; `validation never coerces, defaults, or strips the input it is judging` ✔ |
| 01-06 | A candidate lock or unregistered extension must not become authoritative on syntax alone | **HOLDS** (test-tier) | `lockInvariants` channel-mismatch domain check (catalog.ts:83-98); `an unknown namespaced extension is preserved and never reaches an operation plan` ✔ |
| 01-07 | Filesystem support must not be reported proven when a probe could not classify | **HOLDS** (test-tier) | `an unprovable filesystem is reported as unsupported rather than allowed` ✔ |
| 01-08 | Adapter must not silently fall back to ComSpec, /bin/sh, or inherited env | **HOLDS** (test-tier) | No `ComSpec`, `/bin/sh` or `shell: true` in process.ts; `no source module spreads ...process.env` ✔ across all of src/ |
| 01-09 | Diagnosis must not label an interrupted op rolled back/applied/safe-to-clear on an unknown hash | **HOLDS** (test-tier) | `every durable boundary leaves the target diagnosable as before, after, or neither` ✔ |
| 01-10 | Strict native handling must not delete/normalize/claim unrelated user fields | **HOLDS** (test-tier) | `OWNED_SERVER_SCHEMA` keeps `additionalProperties: true` (mcp.ts:367); `validation claims only the fields alpha-AOS writes, not the whole entry` ✔ |
| 01-11 | Fixture result must not claim native verification after timeout/cap/unapproved credential/unparsed output | **HOLDS** (judgment) | `runProcess` returns typed `code`; every fixture step does `if (…code !== "ok") throw describeProcessFailure(...)`. Results carry specific evidence fields (`expectedToolFound`, `codexStopHookSmokePassed: boolean \| null`), not a blanket `verified` boolean |
| 01-12 | Nested component apply must not take a second writer lock or compute a new mutation path | **HOLDS** (test-tier) | `a nested apply consumes the caller session and never takes a second writer lock` ✔, plus MCP and isolation equivalents ✔; `withComponentSession` returns the caller session after a state-root equality check |
| 01-13 | Isolation hardening must not introduce project-pack selection, tree-off inheritance, sealed fallback, or claims beyond supported adapter behavior | **HOLDS** | No `projectPack`/`tree-off` symbol anywhere in isolation.ts. `sealed` is pre-existing manifest vocabulary, and `src/adapters/isolation.ts:38-39` blocks it with the explicit reason "process isolation is never used as a silent fallback". Confirmed by `sealed mode is fail-closed until a container adapter is available` ✔ and `project-only launch adapters hide user resources without claiming a sealed sandbox` ✔ |
| 01-14 | Bootstrap must not claim checkout/package/link rollback when the journal proves only managed-file restoration | **HOLDS** (test-tier) | `a failed external step reports what it observed and never claims a rollback` ✔ |
| 01-15 | Support-bundle CLI must not expose an upload destination or transmit data | **HOLDS** (judgment) | No network primitive in support-bundle.ts or the CLI support route; support-bundle.ts:143 documents the invariant |
| 01-16 | A wrapper must not fall back to direct git/npm/build/link/native mutation when the artifact or plan is unavailable | **HOLDS** (test-tier + source) | Read all four wrappers: each does artifact check → `exit 3` on failure → `exec node dist/src/cli.js bootstrap …`. `no wrapper contains a direct mutation command or a fallback that would run one` ✔ greps all four for `npm ci\|install\|run build\|link` and `git pull\|fetch\|merge` |

**All 18 prohibitions hold.** Per the fail-closed rule, none was accepted on a summary's word; each was checked against source or a named passing test. The four judgment-tier ones (01-01 P2, 01-03, 01-04, 01-11, 01-15) are recorded as non-authoritative verifier judgments and remain flagged for human review at the phase checkpoint.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TODO`/`FIXME`/`TBD`/`XXX`/`HACK`/`PLACEHOLDER` | — | **Zero occurrences** across every src/, test/, scripts/, schemas/ and .github/ file changed since `f1ce415` |
| src/core/mcp-fixture.ts | 118-119 | Unbounded residual buffer | ⚠️ Warning | `stdout += chunk` retains the segment after the last newline with no byte cap. Folded into the openProtocolProcess gap. |

## Specific Items Investigated

**1. Stale `status: fail` coverage in 01-01 and 01-02 — CONFIRMED STALE, all now green.** Ten verification refs carry `status: fail` in those two summaries. I ran each by name against the suite:

| Ref | Recorded | Actual |
|-----|----------|--------|
| preview.test.ts#install and update wrappers preview without mutating either shell family | fail | ✔ PASS (10.4s) |
| redaction.test.ts#a removed secret leaves a visible typed placeholder, not a silent hole | fail | ✔ PASS |
| validation.test.ts#malformed, ambiguous, closed-world and newer-version documents are rejected before mutation | fail | ✔ PASS |
| path-boundary.test.ts#a link that escapes the allowed root is refused and the outside sentinel is untouched | fail | ✔ PASS |
| path-boundary.test.ts#a parent swapped between preflight and mutation is caught by an immediate recheck | fail | ✔ PASS |
| transaction-crash.test.ts#a second writer fails immediately instead of waiting or clearing the lock | fail | ✔ PASS |
| transaction-crash.test.ts#a writer lock is never removed on the basis of elapsed time or a missing pid | fail | ✔ PASS |
| transaction-crash.test.ts#every durable boundary leaves the target diagnosable as before, after, or neither | fail | ✔ PASS |
| process.test.ts#unbounded child output is capped and reported as capped | fail | ✔ PASS |
| process.test.ts#environment names that collide only by case are rejected deterministically | fail | ✔ PASS |
| path-boundary.test.ts#an unclassified reparse point yields a stable unsupported refusal | unknown, human_judgment | ﹣ still skipped — correctly recorded |

These are **stale Wave 0 records, not failures**. They were written red by design in the TDD tracers and never updated when later waves closed them. 01-VALIDATION.md's per-task map carries the correct current status (all six rows ✅ green). Recommend a housekeeping pass over the two frontmatters; it is not a phase-goal defect.

**2. 01-10 summary reconstruction — ACCURATE.** The summary's `key-files` list matches `git show --name-only b7a01eb` exactly: created `evidence.schema.json` + `receipt.schema.json`; modified `install-state.schema.json`, `validation.ts`, `mcp.ts`, `isolation.ts` and three test files. Nine files claimed, nine files in the commit, no extras either way. All three claimed exports exist (`validateNativeConfig` mcp.ts:379, `inspectRuntimeMarker` isolation.ts:728, `rejectRawCredentials` validation.ts:717). The claim "no collection, materialization or apply behaviour was added" holds — grep for `collectEvidence|materializeEvidence|writeEvidence|applyReceipt|writeReceipt` returns nothing. The `OWNED_SERVER_SCHEMA additionalProperties: true` key-decision is literally true at mcp.ts:367. All seven coverage refs are green in the suite. **Neither overclaimed nor omitted.**

**3. Three recorded open gaps — all genuinely open and honestly recorded.**
- *`openProtocolProcess`*: genuinely absent. The exception is **asserted in code**, not merely prose: `test/process.test.ts:425` defines `const protocolSessionExceptions = new Set([join("src","core","mcp-fixture.ts")])` and the enumeration test fails if any other module spawns directly. Adding a second direct `spawn` anywhere in src/ breaks the build. That is a good containment mechanism — but it does not make the gap smaller, and I have promoted it to a **BLOCKER-level gap** (see below).
- *No end-to-end managed install test*: confirmed absent; the stated reason (it would install GSD/ECC globally) is correct. Deferred to Phase 7.
- *macOS/Linux CI unobserved*: confirmed. `.github/workflows/ci.yml` really does define a 3-OS matrix and name all 8 Phase 1 suites, but `gh run list` shows the newest run predates every phase-1 commit. Deferred to Phase 7 for the matrix proof; raised as a human item for the immediate push.

I also found a **fourth gap that was recorded in 01-11 and then correctly closed** rather than dropped: 01-11 recorded "the fixture plan/execute split is not built". 01-14 built it — `createGsdFixtureOperationPlan`, `createEccFixtureOperationPlan` and `createMcpFixtureOperationPlan` all exist, and `mkdtemp` no longer appears on any mutating path in src/ (only in three explanatory comments). Closure verified, not assumed.

**4. Deviations from `files_modified` — recorded, with two nits.**
- 01-12: declared 4 files, commit `e2a1087` touched 5. The extra (`src/core/component-session.ts`) **is** recorded, with the reasoning.
- 01-13: commit `fd28c87` matches the declared 9 files **exactly**. Its recorded deviations are API-shape deviations, which is honest reporting beyond the file list.
- 01-14: commit `94f6b1e` touched 11 files against 4 declared. All 7 extras are named in the deviation section. **Nit:** the section says "Six files outside `files_modified` changed" and then names seven (`gsd-fixture`, `ecc-fixture`, `mcp-fixture`, `writer-lock`, `transaction`, `ecc-skills`, `component-session`). Miscount only; nothing is unrecorded.
- 01-15: commit `a6586c8` touched 5 of the 6 declared files. **Nit:** `src/format.ts` was declared but never modified, and the deviation section does not say so. Harmless — `cli.ts:136 print()` pipes format.ts output through `redactString`, so the file genuinely needed no change — but the record is incomplete in the opposite direction from the usual failure.
- 01-16: commit `02df6b6` touched 9 files against 8 declared; the extra (`src/cli.ts`, four lines for `--target`) is recorded.

**No undeclared change went unrecorded.** Two record-keeping nits, both benign.

**5. Flagged prohibitions.** See the Prohibition Verification table — all 18 hold. The two singled out for scrutiny:
- *01-13*: holds cleanly. Nothing resembling project-pack selection or tree-off inheritance entered `isolation.ts`, and sealed mode is explicitly blocked with a message that names the anti-pattern it is refusing.
- *01-16*: holds cleanly, verified two independent ways — I read all four wrapper scripts end to end (each is 44-61 lines, artifact check → `exit 3` → `exec node dist/src/cli.js bootstrap`, no `else` branch that mutates), and the suite greps them for seven forbidden command patterns.

**6. SAFE-01 tracer — genuinely green, and the `LAUNCHER_FOOTPRINT` exclusion is legitimate.** The test ran all four wrapper families (`wrapper families executed: 4; not-run: []`) — it did not pass by skipping. It is green because the wrappers no longer bootstrap: the forbidden-command grep would fail on any `npm ci/install/run build/link` or `git pull/fetch/merge`, and there is none.

On the exclusion: it is three **exact relative paths** (`AppData/Local/Microsoft/PowerShell`, `.cache/powershell`, `.local/share/powershell`), matched by `key === prefix || key.startsWith(prefix + "/")` — not by name and not by glob. It is applied **only** to the sandbox home digest inside the two tests that launch `pwsh`, never to the CLI preview tests, never to the package sentinel, never to the state root, never to the checkout digest. The harness resource root under test (`home/.claude`) is not under any excluded prefix, so every harness resource is still byte-checked. And `treeDigest`'s `ancestorOfExcluded` deliberately keeps walking into the excluded path's parents, so a file written *beside* `AppData/Local/Microsoft/PowerShell` — e.g. under `AppData/Local/Microsoft/` — is still recorded. **This does not hollow out the assertion.** It removes exactly the interpreter's own pre-script startup cache and nothing else. Verdict: legitimate.

One residual weakness worth naming: in the wrapper preview test the wrapper runs with `cwd: checkoutCopy`, and the digests asserted are the *original* `repositoryRoot`, home and packages — the copy itself is not digested. A wrapper that mutated only its own working copy would be caught by the 20-second ETIMEDOUT assertion and the static forbidden-command grep, but not by a digest. Minor; noted, not filed as a gap.

### Human Verification Required

**1. Push phase 1 and confirm the three-OS CI legs**
**Test:** Push the phase-1 commits; let `.github/workflows/ci.yml` run.
**Expected:** ubuntu-latest and macos-latest pass `npm run check`, `npm test`, `npm run build:check` and the named Safety boundary suites, with `preview.test.js` reporting an empty not-run list for `install.sh`/`update.sh`.
**Why human:** No CI run exists against any phase-1 commit. 01-VALIDATION.md makes this a pre-verification gate.

**2. Windows unknown-reparse canary (SAFE-02, 01-VALIDATION.md manual-only)**
**Test:** On a privileged Windows host, create a directory with an unclassified reparse tag inside an allowed root; run dry-run then apply against a path beneath it.
**Expected:** Stable unsupported/refusal code, no mutation, outside sentinel hash unchanged, inspection still available (D-01).
**Why human:** `fsutil reparsepoint` requires privileges CI runners do not guarantee. Reported not-run, never as a pass.

**3. File-symlink escape canary (SAFE-02)**
**Test:** With SeCreateSymbolicLinkPrivilege or Developer Mode enabled, re-run `node --test dist/test/path-boundary.test.js`.
**Expected:** `a file link that escapes the allowed root is refused for both write and removal` runs and passes.
**Why human:** Skipped on this host for lack of privilege. The directory-link equivalent is green.

**4. Judgment-tier prohibitions (non-authoritative verifier verdict — human review recommended)**
01-01 P2, 01-03, 01-04, 01-11 and 01-15 were verified by source reading rather than by a negative test. All five hold in my judgment; per the fail-closed policy they remain flagged rather than silently green.

## Gaps Summary

One gap blocks a clean pass, and it is a real one rather than a paperwork issue.

**`openProtocolProcess` was declared as a must-have export of `src/core/process.ts` and as the mechanism behind two declared key links, and it does not exist.** The consequence is not abstract: two MCP protocol paths sit outside the single bounded process adapter that SAFE-06 is about.

- `src/core/mcp-fixture.ts:96` spawns its JSON-RPC child directly. Most of the SAFE-06 contract still holds there by hand — `shell` is off, the environment comes from an explicit `nodeRuntimeEnvironment` allowlist, stderr is capped at 8 KB, there is a 60-second deadline and a `child.kill()`. But the stdout side keeps the post-newline residual in an ever-growing string with no byte cap, so a child emitting one very long line is not bounded. That is precisely the property `unbounded child output is capped and reported as capped` proves for every *other* child.
- `src/core/mcp-proxy.ts` still uses the SDK's `StdioClientTransport`. The two leaks 01-08 set out to close (ambient environment copy, inherited stderr handle) **are** closed and the proxy does bound upstream stderr — but the transport is not the reviewed adapter, so its stdout bound is the SDK's, not alpha-AOS's.

To the executor's credit this was never hidden: it is recorded in the 01-08, 01-11, 01-14 and 01-16 summaries and in STATE.md, and — unusually — the exception is *enforced* in code, so it cannot widen without breaking the suite. That is the right way to leave a gap open. But STATE.md itself says "No plan in phase 1 now owns it", and no later roadmap phase names this work, so it cannot be deferred on the evidence available. It needs an owner.

Everything else that looked like a gap turned out to be either genuinely deferred to Phase 7 (end-to-end install, three-OS observation) or a stale record from Wave 0 (the ten `status: fail` refs, all now green). The phase goal itself — preview safely, refuse unsafe input, preserve recoverable state, keep secrets out of every surface — is substantively achieved on this host.

---

_Verified: 2026-09-05_
_Verifier: Claude (gsd-verifier)_
