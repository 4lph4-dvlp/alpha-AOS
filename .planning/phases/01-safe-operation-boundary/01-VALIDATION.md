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
| 01-W0-06 | 01-02, 01-08 | 0 | External commands use no shell, receive only approved environment names, and produce bounded timeout-aware evidence | subprocess integration | `npm run build && node --test dist/test/process.test.js` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

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

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native Windows unknown-reparse refusal on a host fixture unavailable to ordinary CI | SAFE-02 | Some reparse tags require Windows privileges or host facilities not guaranteed on CI runners | Create the documented fixture on a Windows canary, run dry-run and apply attempts, confirm the stable refusal code, and verify the outside sentinel hash is unchanged |

All other Phase 1 behaviors require automated verification. An unavailable privileged fixture is reported as not-run, never as passed.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify commands or explicit Wave 0 dependencies.
- [ ] Every runnable `<automated>` command has an adjacent observable `<fails_when>` direction in its PLAN task.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification.
- [ ] Wave 0 covers all missing test references.
- [ ] No watch-mode flags are used.
- [ ] Focused feedback latency stays below 60 seconds.
- [x] Cross-platform wrapper behavior is executed, not syntax-checked only.
- [ ] `nyquist_compliant: true` and `wave_0_complete: true` are set only after the corresponding evidence exists.

**Approval:** pending
