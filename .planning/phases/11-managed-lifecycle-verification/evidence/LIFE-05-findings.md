# LIFE-05 Findings

Transcript: `evidence/life05-rollback.txt` (probe `probes/life05-rollback.mjs`, win32, packed CLI, one sandbox). It ends with `host-guard: unchanged (17 targets)`. Committed CI guard: `test/rollback-cli-verification.test.ts` (passing on Windows and Linux under WSL). Phase 6 suites: `evidence/suites-local.txt` (`suites.phase6 HOLDS`, 33/33) and CI run 35818198049 (`evidence/ci-35818198049-lifelines.txt`, `ci.ubuntu|macos|windows.phase6-titles HOLDS`).

## Contract

- [ ] **LIFE-05**: User can preview and apply rollback to restore exact prior bytes, and any post-transaction drift prevents all rollback writes before mutation begins

(verbatim, `.planning/milestones/v0.1.0-REQUIREMENTS.md:81`)

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | preview ... rollback | `life05-rollback.txt`: **`life05.preview.no-mutation HOLDS`** (home and state fingerprints identical before and after human and `--json` preview). **`life05.preview.lists-targets HOLDS`** (preview lists target `AGENTS.md` with RESTORE action). **`life05.preview.reflects-drift VIOLATED`** (preview displays RESTORE lines and dry-run footer on a drifted target without warning that apply will refuse). Guard test: `CLI rollback preview changes no byte and apply restores exact prior bytes (LIFE-05)` passes | Phase 6 test suite contains no CLI-level rollback preview test. The new test in `test/rollback-cli-verification.test.ts` asserts zero-mutation on the filesystem at CLI process level | PARTIAL (preview mutates nothing, but fails to reflect drift; LIFE-05/C1) |
| 2 | apply rollback to restore exact prior bytes | `life05-rollback.txt`: **`life05.apply.exact-bytes HOLDS`** (restored target sha256 matches pre-state sha256 byte-for-byte: `b50218c344e0baaab6c2ac6948919c00380b4217656dbe0fdcb884093e015759`). **`life05.apply.created-removed HOLDS`** (created targets removed). Guard test: `CLI rollback preview changes no byte and apply restores exact prior bytes (LIFE-05)` asserts byte-level restoration and absence of created files | Phase 6 test `clean reverse directory sweep removes only empty parent directories (LIFE-05, D-08)` (ubuntu line 45, macos 89, windows 133) tests directory cleanup. The probe proves byte-exact content restoration through the packed CLI | HOLDS |
| 3 | any post-transaction drift prevents all rollback writes | `life05-rollback.txt`: **`life05.drift.refuses HOLDS`** (exit 2, JSON `ok: false`, stderr diff output). **`life05.drift.zero-writes HOLDS`** (fingerprints of home and whole state root, including journal and snapshots, are unchanged). Guard test: `CLI rollback refuses on post-transaction drift and changes no byte, journal or snapshot (LIFE-05)` asserts refusal and zero writes | Phase 6 test `all-or-nothing preflight refusal on drift performs zero writes (LIFE-05, D-05)` (ubuntu line 42, macos 86, windows 130) verifies target contents only (`test/rollback.test.ts:61-63`). The probe and CI guard extend the check to the entire state root (snapshots and journal metadata) | HOLDS |
| 4 | before mutation begins | `life05-rollback.txt`: **`life05.drift.zero-writes HOLDS`** (preflight validation aborts before touching any file). **`life05.lifo.enforced HOLDS`** (attempting to roll back an older active transaction when a newer transaction exists refuses with exit 2, naming LIFO ordering; zero bytes changed) | Phase 6 test `strict LIFO ordering enforcement prevents non-head rollback (LIFE-05, D-07)` (ubuntu line 44, macos 88, windows 132) verifies head-of-chain enforcement at unit level. The probe verifies it through the packed CLI | HOLDS |

## Core clause

The core promise is: the user can preview and apply rollback to restore exact prior bytes, and any post-transaction drift prevents all rollback writes before mutation begins. When applied, rollback restores exact prior bytes byte-for-byte and deletes created files. Post-transaction drift safely aborts execution with exit code 2, emitting drift diagnostics while performing zero writes across the entire state root. Strict LIFO ordering prevents rolling back non-head transactions. The only divergence is that the preview command does not preflight drift checks and therefore promises an unfulfillable restore on drifted targets.

## Provisional verdict

PARTIAL (D-02): the restoration and refusal guarantees hold completely. Apply restores exact prior bytes, drift refusal executes zero writes across both target roots and internal state, and LIFO ordering is enforced. However, under D-09, the `preview` clause is judged on whether the preview truthfully reflects what apply will execute; because `planManagedRollback` checks only structural metadata rather than current file hashes, preview displays a valid restoration plan for files whose drift will cause apply to refuse.

## Host safety (D-13)

Phase 10 classified the Windows `~/.alpha-aos` change in CI run 35762417138 as `classification: test-isolation leak` (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). A different test file running concurrently wrote the real host state root; the released lifecycle alone left no `.alpha-aos` in its scratch home. The fix was in test code only: commits `8f17c7e` (`fix(10-03): redirect mcp-proxy test state root out of the host home`) and `7a3ee28` (`fix(10-03): journal gate receipts into test-owned state roots`), pinned by Phase 10 regression tests which passed on all three legs of run 35818198049. That record names no product requirement violation, and this verdict names none for it either.

The fresh product judgment is the host guard around this probe: `life05-rollback.txt` ends with `host-guard: unchanged (17 targets)`. The probe ran transaction applies, previews, exact byte restores, drift refusals, and LIFO refusal checks without changing the real state root or any of the 16 managed harness paths.

## Gap candidates

### LIFE-05/C1

- clause: preview ... rollback
- missing: `alpha-aos rollback <id>` (dry-run preview) checks only whether the transaction exists and enforces LIFO ordering, but does not compare target file hashes on disk with the recorded `afterHash`. When a target has drifted, the preview prints `RESTORE <target>` and `Dry-run only. Pass --apply to restore...`, promising a restore that `rollback --apply` will immediately refuse with `RollbackDriftError`.
- close condition: `planManagedRollback` checks target file hashes on disk against the journal's `afterHash` and indicates drift or refusal in the preview output. Reproducing `life05.preview.reflects-drift` as HOLDS closes it.
- reproduction: `node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life05-rollback.mjs`; transcript `evidence/life05-rollback.txt`, step 6:
  - `CHECK life05.preview.reflects-drift VIOLATED preview printed RESTORE and dry-run footer without reporting that target has drifted`

## Leads (not reproduced)

- CLI rollback does not acquire an exclusive writer session lock (`withWriterSession`), so concurrent mutations could theoretically race during rollback planning. In single-operator workstation workflows, this was not observed to produce drift.

## Observations

- Diff redaction: in accordance with threat model T-11-23, unified diff bodies produced during drift diagnostics were redacted in the transcript to lines of the form `[diff body redacted: <n> lines, sha256=<12-hex>]`, preventing fixture contents from leaking into committed evidence while confirming that the product generated detailed diff diagnostics.
