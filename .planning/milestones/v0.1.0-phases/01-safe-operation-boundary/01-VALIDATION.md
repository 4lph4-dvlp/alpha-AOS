---
phase: "01"
slug: "safe-operation-boundary"
status: active
nyquist_compliant: false
wave_0_complete: true
created: "2026-09-03"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js 24 built-in `node:test` + `node:assert/strict` |
| **Config file** | `package.json`, `tsconfig.json` |
| **Quick run command** | `npm run check` plus the focused compiled test file |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds locally before the Phase 1 matrix is added |

---

## Sampling Rate

- **After every task commit:** Run `npm run check` and the focused compiled test file named by the task.
- **After every plan wave:** Run `npm test`.
- **Before `$gsd-verify-work`:** The full Windows, macOS, and Linux CI suite must be green.
- **Max feedback latency:** 60 seconds for focused checks; 5 minutes for the cross-platform phase gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-W0-01 | 01-01 | 0 | SAFE-01 | T-01 | Every dry-run entry point leaves checkout, package, config, state, and harness digests unchanged | cross-platform integration | `npm run build && node --test dist/test/preview.test.js` | ✅ | ✅ green (closed by 01-16) |
| 01-W0-02 | 01-02, 01-07, 01-09 | 0 | Escaping or unprovable symlink, junction, reparse, alias, and parent-swap paths never touch the outside sentinel | filesystem integration | `npm run build && node --test dist/test/path-boundary.test.js` | ✅ | ✅ green (2 skipped: privileged link fixtures) |
| 01-W0-03 | 01-02, 01-09 | 0 | A competing writer fails fast and interrupted writes remain hash-checkable and explicitly repairable | subprocess + filesystem integration | `npm run build && node --test dist/test/transaction-crash.test.js` | ✅ | ✅ green |
| 01-W0-04 | 01-01, 01-03 | 0 | Secret values and secret-bearing URLs are absent from all observable output and persisted evidence | unit + CLI integration | `npm run build && node --test dist/test/redaction.test.js` | ✅ | ✅ green (todo closed by 01-15) |
| 01-W0-05 | 01-01, 01-05 | 0 | SAFE-05 | Malformed, duplicate, ambiguous, unsupported, and newer-version documents are rejected before mutation | table-driven unit | `npm run build && node --test dist/test/validation.test.js` | ✅ | ✅ green |
| 01-W0-06 | 01-02, 01-08, 01-17, 01-18 | 0 | SAFE-06 | T-06 | External commands use no shell, receive only approved environment names, and produce bounded timeout-aware evidence — for one-shot children *and* for long-lived protocol children | subprocess integration | `npm run build && node --test dist/test/process.test.js dist/test/protocol-session.test.js dist/test/mcp-proxy.test.js` | ✅ `process.test.ts` · ⬜ `protocol-session.test.ts` · ⬜ `mcp-proxy.test.ts` | ✅ green for `process.test.js`; ⬜ pending for the two suites 01-17 and 01-18 add |
| 01-17-T1 | 01-17 | 8 | SAFE-06 | T-01-17-01, T-01-17-05, T-01-17-06 | A long-lived JSON-RPC child runs shell-free under the same adapter, and one unterminated stdout frame past `DEFAULT_MAX_MESSAGE_BYTES` terminates the child instead of growing a buffer | subprocess integration (fake upstream server) | `npm run check && npm run build && node --test dist/test/protocol-session.test.js` | ⬜ | ⬜ pending |
| 01-17-T2 | 01-17 | 8 | SAFE-06, SAFE-04 | T-01-17-02, T-01-17-03, T-01-17-04 | A protocol session enforces its own deadline, passes only allowlisted environment names, kills the whole child tree, and retains only redacted fingerprinted evidence | subprocess integration (fake upstream server) | `npm run check && npm run build && node --test dist/test/protocol-session.test.js dist/test/redaction.test.js` | ⬜ | ⬜ pending |
| 01-17-T3 | 01-17 | 8 | SAFE-06, SAFE-04 | T-01-17-02 | The MCP fixture reaches its JSON-RPC child only through the bounded adapter, still completes a tool-discovery round trip, and the enumeration carve-out is retired rather than left as dead code | subprocess integration + source negative control | `npm run check && npm run build && node --test dist/test/process.test.js dist/test/protocol-session.test.js && npm test` | ⬜ | ⬜ pending |
| 01-18-T1 | 01-18 | 9 | SAFE-06 | T-01-18-03, T-01-18-04, T-01-18-06 | A real SDK `Client` speaks MCP to a fake upstream server entirely through the bounded session, and the filter still drops a disallowed tool | subprocess + protocol integration | `npm run check && npm run build && node --test dist/test/mcp-proxy.test.js dist/test/mcp.test.js` | ⬜ | ⬜ pending |
| 01-18-T2 | 01-18 | 9 | SAFE-06, SAFE-04 | T-01-18-01, T-01-18-02 | alpha-AOS's own byte cap is the operative upstream bound (not the SDK's 10 MiB default), a disallowed name never reaches upstream, and upstream stderr survives only as bounded redacted fingerprinted evidence | subprocess integration + source negative control | `npm run check && npm run build && node --test dist/test/mcp-proxy.test.js && npm test` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Rows 01-W0-01 through 01-W0-06 are the Wave-0 sampling contract. Rows `01-17-*` and `01-18-*` are the gap-closure contract for 01-VERIFICATION.md `gaps[0]`; they extend the SAFE-06 row rather than replacing it, because the requirement is unchanged and only the set of children it governs grows. Every listed command is run from the repository root and each has an adjacent observable `<fails_when>` in its PLAN task.

---

## Wave 0 Requirements

- [x] `test/preview.test.ts` — byte-for-byte dry-run matrix for the CLI and four wrapper families.
- [x] `test/path-boundary.test.ts` — symlink, junction, reparse, alias, and parent-swap controls with an outside sentinel.
- [x] `test/transaction-crash.test.ts` — writer contention and deterministic interruption stages; extend `test/transaction.test.ts` where appropriate.
- [x] `test/redaction.test.ts` — exact credential, URL, PEM, JWT, API-key, chunk-boundary, and path-alias corpus across surfaces.
- [x] `test/validation.test.ts` — every managed document type, duplicate keys, extensions, old/new versions, and bounded deterministic errors; extend `test/catalog.test.ts` where appropriate.
- [x] `test/process.test.ts` — argument injection, executable normalization, timeout, byte cap, and environment-name case collisions.
- [x] `.github/workflows/ci.yml` — execute wrapper behavior tests on Windows, macOS, and Linux instead of syntax checks alone.

---

## Gap-Closure Suites (Waves 8–9)

Added by 01-17 and 01-18 to close 01-VERIFICATION.md `gaps[0]`. Both are new files, both are named explicitly in the `Safety boundary suites` CI step so a silently unrun suite is red on all three OS legs, and both belong to the SAFE-06 row above.

- [ ] `test/protocol-session.test.ts` — fake-upstream-server contract for `openProtocolProcess`: JSON-RPC round trip, unterminated-frame byte cap, per-message and absolute deadlines, environment allowlist, redacted fingerprinted evidence, child-tree termination, the migrated fixture probe's own tool-discovery round trip, and a source negative control that the enumeration carve-out is gone. Expected: at least 8 tests.
- [ ] `test/mcp-proxy.test.ts` — fake-upstream-MCP-server contract for `BoundedStdioTransport`: SDK `Client` round trip through the bounded session, allowlist enforcement proven against the upstream's own request log, oversize-frame close, environment allowlist, redacted stderr evidence, and a source negative control that no SDK stdio client transport survives. Expected: at least 6 tests.
- [ ] `.github/workflows/ci.yml` — both suites listed by name in the per-OS `Safety boundary suites` step.

Expected full-suite totals: 176 recorded in 01-VERIFICATION.md → at least 184 after 01-17 → at least 190 after 01-18. 01-17 records its exact observed count in `01-17-SUMMARY.md`, which is the baseline 01-18 must strictly exceed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native Windows unknown-reparse refusal on a host fixture unavailable to ordinary CI | SAFE-02 | Some reparse tags require Windows privileges or host facilities not guaranteed on CI runners | Create the documented fixture on a Windows canary, run dry-run and apply attempts, confirm the stable refusal code, and verify the outside sentinel hash is unchanged |

All other Phase 1 behaviors require automated verification. An unavailable privileged fixture is reported as not-run, never as passed.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands or explicit Wave 0 dependencies. *(Measured across `01-01`…`01-18`: 47 tasks, every task carrying at least one `<automated>`.)*
- [x] Every runnable `<automated>` command has an adjacent observable `<fails_when>` direction in its PLAN task. *(Measured: `<automated>` and `<fails_when>` counts are equal in every plan file — 3/3, 3/3, 2/2, 1/1, 3/3, 3/3, 2/2, 3/3, 3/3, 3/3, 3/3, 2/2, 3/3, 3/3, 2/2, 3/3, 10/10, 5/5.)*
- [x] Sampling continuity: no 3 consecutive tasks without automated verification. *(No task anywhere in the phase lacks one, so the gap length is zero.)*
- [x] Wave 0 covers all missing test references. *(All seven Wave 0 Requirements above are checked; the two Wave 8–9 suites are additions to the SAFE-06 row, not previously-missing Wave 0 references.)*
- [x] No watch-mode flags are used. *(No `--watch` occurrence in any Phase 1 plan.)*
- [ ] Focused feedback latency stays below 60 seconds. *(Observed for the Wave 0 suites; not yet observed for `protocol-session.test.ts` and `mcp-proxy.test.ts`, which do not exist until 01-17/01-18 execute.)*
- [x] Cross-platform wrapper behavior is executed, not syntax-checked only.
- [ ] `nyquist_compliant: true` and `wave_0_complete: true` are set only after the corresponding evidence exists. *(`wave_0_complete` is evidenced. `nyquist_compliant` stays `false` until the 01-17 and 01-18 rows above are green on all three OS legs — the gap-closure suites are planned, not yet run.)*

**Approval:** pending — blocked only on executing 01-17 and 01-18 and turning their five rows green.
