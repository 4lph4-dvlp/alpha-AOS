# LIFE-06 Findings

Transcript: `evidence/life06-recovery.txt` (probe `probes/life06-recovery.mjs`, win32, packed CLI, nine isolated sandboxes). It ends with `host-guard: unchanged (17 targets)`. Phase 6 suites: `evidence/suites-local.txt` (`suites.phase6 HOLDS`, 33/33) and CI run 35818198049 (`evidence/ci-35818198049-lifelines.txt`, `ci.ubuntu|macos|windows.phase6-titles HOLDS`).

## Contract

- [ ] **LIFE-06**: User can diagnose corrupt or interrupted journals as `needs-repair` and receive restart-safe recovery guidance instead of a false success state

(verbatim, `.planning/milestones/v0.1.0-REQUIREMENTS.md:82`)

## Clauses

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|--------|----------|---------------------|--------|
| 1 | diagnose corrupt journals as `needs-repair` | `life06-recovery.txt`: **`life06.corrupt.flagged HOLDS`** (syntax error in JSON journal flags `needsRepair: true`, exit 1, `corruptJournals: ["p11-corrupt.json"]`). **`life06.corrupt.resolved HOLDS`** (`repair --apply` plans action `quarantine`, moves corrupt file to `.corrupt.<timestamp>`, status returns to OK). **`life06.p5.flagged HOLDS`** (journal missing `files` array flagged with exit 1, `needsRepair: true`). **`life06.p5.resolved VIOLATED`** (crash repair planner crashes on missing `files` array, falls back to writer repair planning `none`, leaving status permanently in `needsRepair: true`; candidate LIFE-06/C4) | Phase 6 tests `corrupt journal flags needsRepair=true and records filename (LIFE-02, D-09)` (ubuntu line 50, macos 94, windows 138) and `corrupt journal is quarantined to unblock operations (LIFE-06, D-11)` (ubuntu line 40, macos 84, windows 128) verify quarantine on invalid JSON. The packed CLI probe verifies quarantine through the installed binary, and additionally exposes P5 structural corruption where repair fails to resolve the issue | PARTIAL (syntax corruption quarantined cleanly; missing `files` array unhandled; LIFE-06/C4) |
| 2 | diagnose interrupted journals as `needs-repair` | `life06-recovery.txt`: failpoints at all 5 durable boundaries yield exit 70 with deterministic stderr message. **`life06.after-snapshot-sync.status-needs-repair OBSERVED`** (exit 1, `needsRepair: true`, incomplete transaction listed). **`life06.after-intent-journal-sync.status-needs-repair OBSERVED`** (exit 1, `needsRepair: true`). **`life06.after-target-rename.status-needs-repair OBSERVED`** (exit 1, `needsRepair: true`). **`life06.after-step-sync.status-needs-repair OBSERVED`** (exit 1, `needsRepair: true`). **`life06.after-final-sync.status-needs-repair OBSERVED`** (exit 1, `needsRepair: true`, `writerStatus: "needs-repair"`). In all 5 cases, **`life06.<fp>.status-needs-repair`** flags the interrupted state | Phase 6 test `snapshot crash repair safely restores pre-crash baseline and marks repaired (LIFE-06, D-09, D-10)` (ubuntu line 37, macos 81, windows 125) and `incomplete transaction flags needsRepair=true (LIFE-02, D-09)` (ubuntu line 49, macos 93, windows 137) test synthetic and in-process failpoints. The packed-CLI probe exercises all five distinct transaction failpoints end-to-end via CLI process execution | HOLDS |
| 3 | restart-safe recovery guidance | `life06-recovery.txt`: **`life06.guidance.names-repair-command HOLDS`** (human status prints `STATUS: NEEDS-REPAIR (Run 'alpha-aos repair' to recover from interrupted operation)`). **`life06.guidance.names-apply VIOLATED`** (human crash repair plan prints `alpha-AOS Crash Repair Plan` with action, but does not tell the user to pass `--apply` to execute; candidate LIFE-06/C1). **`life06.guidance.says-rerun VIOLATED`** (neither status nor repair advises re-running the interrupted command; candidate LIFE-06/C2). **`life06.<fp>.repair-apply HOLDS`** (exit 0 across all 5 failpoints: 4 execute `snapshot-rollback`, 1 executes `release-only`). **`life06.<fp>.status-ok-after-repair HOLDS`** (status returns to exit 0, `needsRepair: false` across all 5 failpoints). **`life06.<fp>.target-consistent HOLDS`** (target sha256 matches pre-state or post-state across all 5 failpoints). **`life06.<fp>.restart-succeeds HOLDS`** (re-running the original command without failpoint override exits 0 and reaches target state across all 5 failpoints). **`life06.<fp>.repair-idempotent VIOLATED`** (second `repair --apply` exits 2 with `no writer lock is present`, though fingerprints are unchanged; candidate LIFE-06/C3) | Phase 6 tests `stale writer lock with dead process is released (LIFE-06, D-12)` (ubuntu line 39, macos 83, windows 127) and `repair refuses when writer process is still alive (LIFE-06, D-12)` (ubuntu line 38, macos 82, windows 126) verify crash repair logic. The probe proves that restart succeeds safely across all five durable boundaries, but exposes missing guidance text and non-zero exit on repeated repair | PARTIAL (restart is proven safe and repair succeeds, but guidance text omits `--apply` and re-run instructions, and second repair exits 2; LIFE-06/C1, C2, C3) |
| 4 | instead of a false success state | `life06-recovery.txt`: **`life06.after-snapshot-sync.no-false-success HOLDS`**, **`life06.after-intent-journal-sync.no-false-success HOLDS`**, **`life06.after-target-rename.no-false-success HOLDS`**, **`life06.after-step-sync.no-false-success HOLDS`**, **`life06.after-final-sync.no-false-success HOLDS`**. Across all five durable boundaries, `status` reported exit 1 with `needsRepair: true` immediately after interruption. At no point did an interrupted state report exit 0 or OK | Phase 6 test `healthy stack reports needsRepair=false and free writer (LIFE-02)` (ubuntu line 48, macos 92, windows 136) contrasts with incomplete transaction checks. The probe confirms that every real failpoint interruption is classified as `needs-repair` and never as success | HOLDS |

## Core clause

The core promise is: the user can diagnose corrupt or interrupted journals as `needs-repair` and receive restart-safe recovery guidance instead of a false success state. Across all five durable transaction boundaries (`after-snapshot-sync`, `after-intent-journal-sync`, `after-target-rename`, `after-step-sync`, `after-final-sync`), interruptions never produce a false success state: `status` consistently exits 1 with `needsRepair: true`, identifying the interrupted state. Crash repair executes the appropriate restorative action (`snapshot-rollback` or `release-only`), preserves target consistency, and leaves the system in a clean state where re-running the interrupted command succeeds with exit 0. Syntax-corrupted journals are diagnosed and safely quarantined. Divergences occur in guidance completeness (omission of `--apply` in crash repair preview and omission of command re-run instruction), repair idempotence (second `repair --apply` exits 2), and structural corruption where a journal missing the `files` array cannot be repaired.

## Provisional verdict

PARTIAL (D-02): the diagnostic detection and recovery safety guarantees hold. Interrupted operations at every durable boundary are flagged as `needs-repair`, never report false success, repair safely to consistent target states, and successfully restart. Corrupt JSON journals are quarantined. However, under D-09, the `restart-safe recovery guidance` clause is judged on the verbatim guidance text: the crash repair preview omits instruction to pass `--apply`, neither status nor repair instructs the user to re-run the interrupted operation, repeat repair exits 2 instead of no-op, and structurally incomplete journals without a `files` array crash the repair planner (P5).

## Host safety (D-13)

Phase 10 classified the Windows `~/.alpha-aos` change in CI run 35762417138 as `classification: test-isolation leak` (`.planning/debug/ci02-windows-alpha-aos-host-leak.md`). A different test file running concurrently wrote the real host state root; the released lifecycle alone left no `.alpha-aos` in its scratch home. The fix was in test code only: commits `8f17c7e` (`fix(10-03): redirect mcp-proxy test state root out of the host home`) and `7a3ee28` (`fix(10-03): journal gate receipts into test-owned state roots`), pinned by Phase 10 regression tests which passed on all three legs of run 35818198049. That record names no product requirement violation, and this verdict names none for it either.

The fresh product judgment is the host guard around this probe: `life06-recovery.txt` ends with `host-guard: unchanged (17 targets)`. The probe ran nine separate sandbox environments, triggering failpoints, repair previews, repair applies, corrupt journal injections, and restart executions without modifying the real state root or any of the 16 managed harness paths.

## Open Question 2 resolution

Research open question 2 asked whether real command paths can produce a `failed` journal that leaves targets in an inconsistent state, and how such journals should be judged under LIFE-06.
Per the rule established in `11-06-PLAN.md`: a `failed` journal counts as "interrupted" under LIFE-06 only if a real command path produces it with target bytes matching neither the pre- nor the post-state. Two bounded attempts were made:
- **Attempt A** (step 67): pre-created a blocker directory at `<sandbox-9>\home\.agents\skills\deep-research` before `install --target codex --apply --json`. The command completed or skipped cleanly with exit 0 (`failed` journal found: false).
- **Attempt B** (step 68): repeated with obstructed rollback paths. The command completed cleanly with exit 0 (`failed` journal found: false).
Because transaction operations in `applyFileTransaction` either execute cleanly or trigger compensating rollback before writing a `failed` journal status, real CLI commands did not produce a `failed` journal with intermediate target bytes (`life06.p6.real-failed-journal OBSERVED not produced`). In accordance with the plan rule, the `failed`-journal behavior is recorded as an observation and remains a research lead rather than a gap candidate.

## Gap candidates

### LIFE-06/C1

- clause: restart-safe recovery guidance
- missing: `alpha-aos repair` (crash repair preview) prints `alpha-AOS Crash Repair Plan` with the planned action (`snapshot-rollback` or `release-only`), but unlike other dry-run preview commands, it does not inform the user to pass `--apply` to execute the repair plan.
- close condition: `formatCrashRepairPlan` prints `Pass --apply to execute this repair plan` or equivalent guidance. Reproducing `life06.guidance.names-apply` as HOLDS closes it.
- reproduction: `node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs`; transcript `evidence/life06-recovery.txt`, step 6 / step 57:
  - `CHECK life06.guidance.names-apply VIOLATED repair preview does not instruct passing '--apply'`

### LIFE-06/C2

- clause: restart-safe recovery guidance
- missing: neither `alpha-aos status` nor `alpha-aos repair` / `repair --apply` informs the user to re-run the command that was interrupted once repair has completed.
- close condition: `formatCrashRepairResult` or `formatOfflineStatus` includes a note advising the user to re-run their interrupted operation after successful repair. Reproducing `life06.guidance.says-rerun` as HOLDS closes it.
- reproduction: `node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs`; transcript `evidence/life06-recovery.txt`, step 57:
  - `CHECK life06.guidance.says-rerun VIOLATED repair/status guidance does not instruct user to re-run the interrupted operation`

### LIFE-06/C3

- clause: restart-safe recovery guidance
- missing: running `alpha-aos repair --apply` a second time immediately following a successful repair exits 2 with `alpha-aos: This state cannot be repaired automatically: no writer lock is present`. While the second run performs zero writes and leaves state fingerprints intact, exiting 2 on an already-healthy state rather than exit 0 violates repair idempotence expectations.
- close condition: `alpha-aos repair --apply` on a clean state reports that no repair is needed and exits 0. Reproducing `life06.<fp>.repair-idempotent` as HOLDS closes it.
- reproduction: `node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs`; transcript `evidence/life06-recovery.txt`, steps 12, 23, 34, 45, 56:
  - `CHECK life06.after-snapshot-sync.repair-idempotent VIOLATED exit=2, fingerprints unchanged=true`

### LIFE-06/C4

- clause: diagnose corrupt journals as `needs-repair`
- missing: when an incomplete/applying journal is missing the `files` property entirely (e.g. truncated during serialization, research lead P5), `planCrashRepair` throws an unhandled `TypeError` inside `for (const file of journal.files)` because `files` is undefined. The error is swallowed by the outer fallback catch, which falls back to writer lock repair (`planWriterRepair`). Because writer lock is free, it plans `none` with blocked reason `no writer lock is present`. As a result, `repair --apply` fails with exit 2, leaving `status` permanently reporting `needsRepair: true` with no recovery path.
- close condition: `planCrashRepair` validates that `Array.isArray(journal.files)` and treats a journal missing `files` as corrupt/unrecoverable, quarantining it like other unreadable journals. Reproducing `life06.p5.resolved` as HOLDS closes it.
- reproduction: `node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs`; transcript `evidence/life06-recovery.txt`, step 66:
  - `CHECK life06.p5.resolved VIOLATED repair planned action unknown; status after still needsRepair=true`

## Leads (not reproduced)

- **Failed journal status handling (Open Question 2 / P6)**: Step 70 demonstrated that when a synthetic journal with status `"failed"` is placed in `<state>/journal/`, `status --json` reports `needsRepair: false` and `repair --json` plans `none`. If a transaction were ever to fail and persist a `failed` journal without clean rollback, automatic repair would not engage. However, in all observed failure modes, `applyFileTransaction`'s built-in compensating rollback either succeeds completely or cleans up the transaction, preventing a stranded `failed` journal from occurring in practice (`life06.p6.real-failed-journal OBSERVED not produced`).

## Observations

- Single-transaction command candidate: `owned-skills sync alpha-aos-control --target codex --apply --json` was confirmed in step 2 to produce exactly one journal transaction (`life06.command.single-transaction OBSERVED owned-skills sync exit=0; journals before=0, after=1 (added=1)`), making it an ideal deterministic workload for failpoint injection.
- Snapshot rollback fidelity: across all four pre-commit failpoints (`after-snapshot-sync`, `after-intent-journal-sync`, `after-target-rename`, `after-step-sync`), `repair --apply` successfully leveraged snapshots to roll back affected files, restoring the target to its pre-crash state (`sha=absent`).
- Lock-release fidelity: at the final failpoint (`after-final-sync`), all filesystem modifications were already committed and snapshots cleared; `repair --apply` recognized this and selected action `release-only`, preserving target state (`sha=a66debb56c9f`) while releasing the abandoned lock.
