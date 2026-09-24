---
phase: 11-managed-lifecycle-verification
plan: 06
subsystem: testing
tags: [verification, packed-cli, rollback, crash-repair, failpoints, recovery, LIFE-05, LIFE-06]

requires:
  - phase: 11-managed-lifecycle-verification
    provides: "plan 11-01 packed-sandbox helper, probe-lib transcript vocabulary, host guard"
provides:
  - "test/rollback-cli-verification.test.ts: CI guard for CLI rollback preview, byte-exact restore, drift refusal and zero writes"
  - "evidence/life05-rollback.txt: packed CLI rollback preview, restore, drift refusal, and LIFO evidence"
  - "evidence/LIFE-05-findings.md: LIFE-05 clause table, oracle audit, gap candidate LIFE-05/C1"
  - "evidence/life06-recovery.txt: 5 durable boundary failpoints, repair, restart, guidance, corrupt JSON, P5 and P6 evidence"
  - "evidence/LIFE-06-findings.md: LIFE-06 clause table, open-question-2 resolution, gap candidates LIFE-06/C1..C4"
affects: [11-07]

actuals:
  tokens: 110000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Whole-state-root fingerprinting: verifying zero-writes across targets, snapshots, and journals on drift refusal"
    - "Deterministic failpoint injection: exercising product failpoints at every durable boundary via ALPHA_AOS_FAILPOINT"
    - "Restart-safety and idempotence auditing: verifying clean restart of interrupted operations and repeat repair behavior"

key-files:
  created:
    - test/rollback-cli-verification.test.ts
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life05-rollback.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/life05-rollback.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/life06-recovery.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-05-findings.md
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-06-findings.md
  modified: []

key-decisions:
  - "Committed test/rollback-cli-verification.test.ts as a permanent cross-platform CI guard after passing on Windows and in WSL Linux"
  - "Provisional LIFE-05 verdict PARTIAL: byte-exact restore, drift refusal with zero writes across the entire state root, and LIFO ordering hold, but dry-run preview fails to check drift and promises an unfulfillable restore"
  - "Provisional LIFE-06 verdict PARTIAL: all 5 durable boundary failpoints avoid false success, diagnose needs-repair, restore target consistency, and restart successfully, but repair preview omits --apply guidance, repeat repair exits 2, and malformed journals missing files array crash repair"
  - "Resolved research open question 2 by plan rule: CLI command failure paths execute clean compensating rollback, so real failed journals with intermediate bytes were not produced (Attempt A & B produced no failed journal); stays an unconfirmed lead"

requirements-completed: [LIFE-09]

coverage:
  - id: D1
    description: "LIFE-05 rollback preview, byte-exact restore, drift refusal and zero writes via packed CLI and committed test"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node scripts/run-tests.mjs --files dist/test/rollback-cli-verification.test.js (Windows + WSL) + Task 1 grep gate (8 life05 checks, diff redaction, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "LIFE-06 real interruptions at five durable boundaries, corrupt journals, guidance, and restart safety"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs + Task 2 grep gate (40 failpoint checks, 8 named single checks, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Findings files for LIFE-05 and LIFE-06 with D-13 host safety, open question 2 resolution, and gap candidates"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "findings grep gates (verdict headings, host safety citations, check citations >= 6 and >= 10, src untouched)"
        status: pass
    human_judgment: true
    rationale: "Provisional PARTIAL verdicts and candidate classifications require confirmation during Phase 11 reconciliation"

duration: 40min
completed: 2026-09-24
status: complete
---

# Phase 11 Plan 06: LIFE-05 and LIFE-06 Evidence Summary

**The packed CLI was tested against rollback preview, byte-exact restoration, post-transaction drift refusal, strict LIFO ordering, and deterministic interruptions across all five durable transaction boundaries (`after-snapshot-sync`, `after-intent-journal-sync`, `after-target-rename`, `after-step-sync`, `after-final-sync`). Rollback apply restores prior bytes byte-for-byte and drift refusal executes zero writes across targets, snapshots, and journals, but rollback preview fails to check drift and promises unfulfillable restores. Interrupted transactions consistently flag `needs-repair` without false success, repair safely, and restart cleanly, but crash repair preview omits `--apply` instructions, repeat repair exits 2, and structurally malformed journals crash repair planning. A permanent CLI-level rollback guard test was verified on Windows and WSL Linux and committed. Provisional verdicts: LIFE-05 PARTIAL, LIFE-06 PARTIAL.**

## Performance

- **Tasks:** 2
- **Files created:** 7
- **Probes executed:** `life05-rollback.mjs`, `life06-recovery.mjs`
- **Committed tests:** `test/rollback-cli-verification.test.ts` (passing on Windows 8/8, WSL Linux 2/2)
- **Host guard status:** `unchanged (17 targets)` on both probes

---

## Accomplishments

### 1. Single-Transaction Commands

- **LIFE-05 Probe:** `codex-policy sync --apply --json` (with pre-existing `<CODEX_HOME>/AGENTS.md`) journaled a two-file transaction modifying `AGENTS.md` and writing managed policy.
- **LIFE-06 Probe:** `owned-skills sync alpha-aos-control --target codex --apply --json` was verified in step 2 to produce exactly one journal transaction (`life06.command.single-transaction OBSERVED: added=1`).

### 2. Eight LIFE-05 Outcomes (`evidence/life05-rollback.txt`)

| Check ID | Result | Detail |
|---|---|---|
| `life05.preview.no-mutation` | **HOLDS** | Home and state fingerprints identical before and after human and `--json` preview |
| `life05.preview.lists-targets` | **HOLDS** | Preview lists target `AGENTS.md` with RESTORE action |
| `life05.apply.exact-bytes` | **HOLDS** | Restored target sha256 byte-for-byte identical to pre-state (`b50218c344e0...`) |
| `life05.apply.created-removed` | **HOLDS** | Targets created by the transaction are cleanly removed |
| `life05.preview.reflects-drift` | **VIOLATED** | Preview prints RESTORE lines and dry-run footer without warning that target has drifted and apply will refuse (`LIFE-05/C1`) |
| `life05.drift.refuses` | **HOLDS** | Exits 2 with JSON `ok: false` and stderr diff output |
| `life05.drift.zero-writes` | **HOLDS** | Fingerprints of home and whole state root (including journal and snapshots) completely unchanged |
| `life05.lifo.enforced` | **HOLDS** | Rolling back an older transaction while a newer one exists refuses with exit 2 naming LIFO ordering; zero bytes changed |

### 3. Five-Failpoint Recovery Table (`evidence/life06-recovery.txt`)

Every durable boundary was interrupted using `ALPHA_AOS_FAILPOINT`:

| Failpoint | Interrupted Exit | Status exit / needsRepair | No False Success | Repair Action & Exit | Status OK After Repair | Target Consistent | Restart Succeeds | Repeat Repair Idempotent |
|---|---|---|---|---|---|---|---|---|
| `after-snapshot-sync` | 70 (HOLDS) | 1, `true` (OBSERVED) | **HOLDS** | `snapshot-rollback`, 0 | **HOLDS** (`false`, 0) | **HOLDS** (`absent`) | **HOLDS** (0, OK) | **VIOLATED** (exit 2) |
| `after-intent-journal-sync` | 70 (HOLDS) | 1, `true` (OBSERVED) | **HOLDS** | `snapshot-rollback`, 0 | **HOLDS** (`false`, 0) | **HOLDS** (`absent`) | **HOLDS** (0, OK) | **VIOLATED** (exit 2) |
| `after-target-rename` | 70 (HOLDS) | 1, `true` (OBSERVED) | **HOLDS** | `snapshot-rollback`, 0 | **HOLDS** (`false`, 0) | **HOLDS** (`absent`) | **HOLDS** (0, OK) | **VIOLATED** (exit 2) |
| `after-step-sync` | 70 (HOLDS) | 1, `true` (OBSERVED) | **HOLDS** | `snapshot-rollback`, 0 | **HOLDS** (`false`, 0) | **HOLDS** (`absent`) | **HOLDS** (0, OK) | **VIOLATED** (exit 2) |
| `after-final-sync` | 70 (HOLDS) | 1, `true` (OBSERVED) | **HOLDS** | `release-only`, 0 | **HOLDS** (`false`, 0) | **HOLDS** (`a66debb56c9f`) | **HOLDS** (0, OK) | **VIOLATED** (exit 2) |

### 4. Guidance, Corrupt Journals, P5, and P6 Outcomes

- **Guidance:**
  - `life06.guidance.names-repair-command`: **HOLDS** (`STATUS: NEEDS-REPAIR (Run 'alpha-aos repair' to recover from interrupted operation)`).
  - `life06.guidance.names-apply`: **VIOLATED** — `alpha-aos repair` preview prints `alpha-AOS Crash Repair Plan` with action, but omits the instruction `Pass --apply to execute this repair plan` (`LIFE-06/C1`).
  - `life06.guidance.says-rerun`: **VIOLATED** — neither status nor repair advises re-running the interrupted command (`LIFE-06/C2`).
- **Corrupt JSON:**
  - `life06.corrupt.flagged`: **HOLDS** — syntax error in JSON flags `needsRepair: true`, `corruptJournals: ["p11-corrupt.json"]`.
  - `life06.corrupt.resolved`: **HOLDS** — `repair --apply` plans action `quarantine`, moves corrupt journal aside, and status returns to OK.
- **P5 (Journal Missing `files` Array):**
  - `life06.p5.flagged`: **HOLDS** — status flags `needsRepair: true`, `incompleteTransactions: ["p11-nofiles"]`.
  - `life06.p5.resolved`: **VIOLATED** — `planCrashRepair` throws unhandled TypeError when accessing `journal.files`, outer catch falls back to writer repair planning `none`, and repair fails with exit 2, leaving status permanently in `needsRepair: true` (`LIFE-06/C4`).
- **P6 / Open Question 2 (Real `failed` Journal):**
  - Attempt A (pre-created blocker directory) and Attempt B (obstructed rollback): both completed cleanly or rolled back without leaving a `failed` journal (`life06.p6.real-failed-journal OBSERVED: not produced`).
  - Synthetic observation: `status --json` on a synthetic `failed` journal reports `needsRepair: false`. In accordance with plan rules, P6 remains an unconfirmed lead under `## Leads (not reproduced)`.

### 5. CI Guard Test Committed

`test/rollback-cli-verification.test.ts` was implemented and passed:
- `CLI rollback preview changes no byte and apply restores exact prior bytes (LIFE-05)`
- `CLI rollback refuses on post-transaction drift and changes no byte, journal or snapshot (LIFE-05)`

Verified on Windows (passed in full suite run with `path-literal-guard.test.js`) and in WSL Linux (exited 0, 2/2 passed).

---

## Provisional Verdicts

- **LIFE-05: PARTIAL (D-02)** — Apply restores exact prior bytes, drift refusal aborts with exit 2 and zero writes across targets and state root, and LIFO ordering is enforced. However, dry-run preview omits drift preflight, promising an unfulfillable restore on drifted targets.
- **LIFE-06: PARTIAL (D-02)** — Real interruptions across all five durable boundaries are reliably flagged as `needs-repair` without false success, repair restores pre-state or releases locks, and restarting the interrupted command succeeds cleanly. However, crash repair preview omits `--apply` instructions, repeat repair exits 2, neither status nor repair instructs command re-run, and malformed journals missing `files` crash crash repair.

---

## Gap Candidates Summary

- **LIFE-05/C1**: `alpha-aos rollback <id>` (dry-run preview) checks structural existence and LIFO ordering but omits hash preflight against disk, displaying a valid restore plan for targets whose post-transaction drift will cause apply to refuse.
- **LIFE-06/C1**: `alpha-aos repair` (crash repair preview) displays `alpha-AOS Crash Repair Plan` without instructing the user to pass `--apply` to execute it.
- **LIFE-06/C2**: neither `status` nor `repair` / `repair --apply` advises the user to re-run the interrupted command upon successful repair.
- **LIFE-06/C3**: `alpha-aos repair --apply` re-invoked on an already-repaired clean state exits 2 with `no writer lock is present` rather than exiting 0 or no-op.
- **LIFE-06/C4**: incomplete journal missing `files` array throws unhandled TypeError in `planCrashRepair`, falling back to writer repair planning `none`, leaving the state permanently unrecoverable via automated repair.

---

## Verification (plan level)

- Task 1 tests gate: pass (passed on Windows host and WSL Linux).
- Task 1 probe gate: pass (8 life05 checks present, diffs redacted, host guard unchanged).
- Task 1 findings gate: pass (D-13 citation, restore exact prior bytes cited, 11 check citations, src untouched).
- Task 2 probe gate: pass (40 failpoint checks, 8 named checks, host guard unchanged).
- Task 2 findings gate: pass (verdict heading, restart-safe recovery guidance, Open Question 2 resolution, 19 check citations, src untouched).
- `git status --porcelain -- src`: empty.

## Self-Check: PASSED

All evidence artifacts, transcripts, findings files, and tests exist and pass verification. Host guard verified unchanged across all runs.
