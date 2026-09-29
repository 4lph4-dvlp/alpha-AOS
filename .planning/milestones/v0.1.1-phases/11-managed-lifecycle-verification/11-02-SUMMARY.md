---
phase: 11-managed-lifecycle-verification
plan: 02
subsystem: testing
tags: [verification, packed-cli, io-trap, doctor, discovery, canary, evidence, LIFE-02]

requires:
  - phase: 11-managed-lifecycle-verification
    provides: "plan 11-01 packed-sandbox helper, probe-lib transcript vocabulary, host guard"
provides:
  - "test/helpers/io-trap-preload.ts: CLI-level child_process/network trap with syncBuiltinESMExports"
  - "test/status-offline-verification.test.ts: CI guard that CLI status spawns nothing and opens no connection, with positive controls"
  - "evidence/life02-status.txt and evidence/life02-discovery.txt transcripts"
  - "evidence/LIFE-02-findings.md: clause table, oracle audit, provisional PARTIAL, gap candidates LIFE-02/C1..C6"
affects: [11-07]

actuals:
  tokens: 73000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "node --import <file URL> preload trap, validated by a spawning and a network positive control before a zero-call claim"
    - "Real-home runner: probe-local allowlisted spawner (doctor --discovery / doctor --canary --no-spend only, sandbox state root, no --apply)"
    - "Harness-home fingerprint: immediate children of each real harness root, named exclusions with reasons, managed-path classification of drift"

key-files:
  created:
    - test/helpers/io-trap-preload.ts
    - test/status-offline-verification.test.ts
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-status.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/life02-status.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/life02-discovery.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-02-findings.md
  modified: []

key-decisions:
  - "Codex and pi read-only execution evidence comes from doctor --discovery (codex debug prompt-input, pi --mode rpc get_commands, paired COMPLETE units); their canary no-spend VIOLATED checks are argued as not failing the LIFE-02 'doctor or canary' text"
  - "Claude's cost-excluded discovery and canary legs are LIFE-02/C3, to be mapped onto G-07-2 / REL-02 by plan 11-07 rather than a new gap id"
  - "doctor --json not flagging a corrupt journal is a gap candidate (LIFE-02/C6): the coded surface is blind and the actionable status guidance is uncoded"
  - "Provisional LIFE-02 verdict PARTIAL (D-11): 2 of 5 harnesses have native discovery plus read-only execution evidence"

requirements-completed: [LIFE-09]

coverage:
  - id: D1
    description: "CLI-level I/O trap and pass-only CI test for offline status"
    requirement: LIFE-09
    verification:
      - kind: integration
        ref: "test/status-offline-verification.test.ts#offline status spawns no child process and opens no network connection through the CLI (LIFE-02)"
        status: pass
      - kind: other
        ref: "wsl.exe ... node scripts/run-tests.mjs --files dist/test/status-offline-verification.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "LIFE-02 status probe transcript (offline, fast, coded findings, needs-repair)"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-status.mjs + ten-check grep gate"
        status: pass
    human_judgment: false
  - id: D3
    description: "LIFE-02 discovery and no-spend canary transcript with harness-home fingerprint"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs + five/five/repo/harness-homes grep gate"
        status: pass
    human_judgment: false
  - id: D4
    description: "LIFE-02 findings file for plan 11-07"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "findings grep gate (contract quote, >=10 CHECK citations, cost note, verdict and gap headings, src untouched)"
        status: pass
    human_judgment: true
    rationale: "The per-clause judgement (discovery counting as read-only execution for codex and pi, the PARTIAL grade) is a reasoned reading of the LIFE-02 text that plan 11-07 and the verifier must confirm"

duration: 44min
completed: 2026-09-23
status: complete
---

# Phase 11 Plan 02: LIFE-02 Status, Doctor and Discovery Evidence Summary

**The packed CLI `status` makes no child-process or network call, which a `node --import` I/O trap proves with two positive controls, and it answers in 2.35 ms in-process on a populated state root. Native discovery plus read-only execution evidence exists for codex and pi only. Claude is excluded for cost, antigravity is absent, hermes is unsupported, and `doctor` does not see a corrupt journal. Provisional verdict: PARTIAL.**

## Performance

- **Duration:** 44 min
- **Started:** 2026-09-23T14:22:29Z
- **Completed:** 2026-09-23T15:06:08Z
- **Tasks:** 2
- **Files created:** 7

## Accomplishments

- `test/helpers/io-trap-preload.ts` wraps child_process (7 functions), net, tls, dns, http, https and `fetch` when `ALPHA_AOS_IO_TRAP_LOG` is set. Each wrapper logs a line and then calls the original with the same `this` and arguments. The preload also copies `util.promisify.custom` and calls `syncBuiltinESMExports()` so ESM named imports are trapped too.
- `test/status-offline-verification.test.ts` **was committed**. It passed on Windows (7/7 together with `path-literal-guard`) and under WSL (1/1).
- `life02-status.txt` records 9 HOLDS, 1 VIOLATED and 1 OBSERVED, with the host guard unchanged.
- `life02-discovery.txt` records 4 HOLDS, 7 VIOLATED, 1 NOT-OBSERVED and 4 OBSERVED, with the host guard unchanged, the real repository unchanged and no spend leg run.
- `LIFE-02-findings.md` carries 13 clause rows, an oracle audit for both Phase 6 status tests, the core clause, a provisional verdict and gap candidates C1..C6.

### Trap control results (`evidence/life02-status.txt`)

| Check | Outcome | Log |
|---|---|---|
| life02.status.trap-control-spawn | HOLDS | inventory: `child_process.spawnSync x14` |
| life02.status.trap-control-network | HOLDS | loopback fetch: `fetch x1` |
| life02.status.zero-subprocess | HOLDS | status: 0 lines |
| life02.status.zero-network | HOLDS | status: 0 lines |

Other checks: `ok-after-install` HOLDS, `cli-timing` OBSERVED (wall median 806.4 ms, in a note), `in-process-under-50ms` HOLDS (median 2.35 ms, in a note), `doctor.coded` HOLDS (19 findings, all coded), `needs-repair` HOLDS, `doctor.flags-corrupt-journal` **VIOLATED**, `doctor.actionable` HOLDS (through the status guidance `alpha-aos repair`; the repair dry-run exits 0 and plans `quarantine`).

### Per-harness discovery and no-spend execution (`evidence/life02-discovery.txt`)

| Harness | life02.discovery.* | life02.canary.*.no-spend-execution | Findings result |
|---|---|---|---|
| claude | NOT-OBSERVED, not executed (cost) | VIOLATED (every leg spends a model turn) | C3, owned by G-07-2 / REL-02 |
| codex | HOLDS (COMPLETE units, `codex debug prompt-input`) | VIOLATED (CAPA-03 free legs COMPLETE; receiving launch would spend) | discovery and execution HOLD via discovery |
| antigravity | VIOLATED (absent from discovery rows) | VIOLATED (no canary declared) | C1, C4 |
| pi | HOLDS (COMPLETE units, `pi --mode rpc` get_commands) | VIOLATED (no canary declared) | discovery and execution HOLD via discovery |
| hermes | VIOLATED (unsupported: no discovery oracle) | VIOLATED (only the handoff source; never launched) | C2, C5 |

The canary announced 10 canary/harness pairs, and all 10 spend a model turn. The canary checks record `spend-legs` OBSERVED (not executed (cost)), `planning-unchanged` HOLDS, `vault-writes` OBSERVED (four handoff memories and `.gitignore` in the scratch clone) and `json-cycle-markers` OBSERVED (21 `[redacted:cycle]` markers in the canary JSON). `life02.repo-unchanged` HOLDS.

### `life02.harness-homes-unchanged`

**OBSERVED: harness-native drift in codex and hermes.** In the committed run, `codex/logs_2.sqlite-shm`, `codex/models_cache.json`, `codex/sqlite` and `hermes/state.db-shm` drifted. No alpha-AOS-managed child drifted. The fingerprint covered 216 targets and took about 4-5 s per pass. Exclusions added after the first run (the SUMMARY must list these):

- codex `.tmp`, `tmp` and `thread-writer-locks`. The first real run aborted with `EBUSY` while fingerprinting, because a running Codex holds lock files open under `tmp/arg0/*/.lock` and `thread-writer-locks/*.lock`. `.tmp` was added alongside them as the same kind of transient scratch.
- The probe also gained a generic guard. Any unmanaged child that holds an exclusively locked file at enumeration time is excluded, and a note is written. A locked managed child makes the probe throw. The guard did not fire in the committed run.

Exclusions added before the first run, beyond the plan's seed list: hermes `.env` and codex `.sandbox-secrets` (both credential material outside the name rule), and hermes `hermes-agent` (see Deviations).

### Provisional LIFE-02 verdict

**PARTIAL** (D-02, D-11). Offline status, fast inspection, the explicit modes and coded findings hold. Native discovery and read-only execution hold for codex and pi only (2/5). Gap candidates: C1 antigravity discovery, C2 hermes discovery, C3 claude cost-excluded (G-07-2 / REL-02), C4 antigravity execution, C5 hermes execution, C6 a corrupt journal is not coded and actionable in one surface.

## Task Commits

1. **Task 1: I/O trap preload, offline-status CI test, LIFE-02 status probe and transcript**: `be6cfe2` (test)
2. **Task 2: discovery/canary probe, transcript, LIFE-02 findings**: `c280fd2` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY

## Files Created/Modified

- `test/helpers/io-trap-preload.ts`: env-gated I/O trap preload
- `test/status-offline-verification.test.ts`: pass-only CI guard (D-12)
- `evidence/probes/life02-status.mjs`, `evidence/life02-status.txt`: status/doctor probe and its transcript
- `evidence/probes/life02-discovery.mjs`, `evidence/life02-discovery.txt`: discovery/canary probe and its transcript
- `evidence/LIFE-02-findings.md`: findings for plan 11-07

## Decisions Made

See `key-decisions`. The main judgement call is how rows 5b and 5d read the LIFE text. It says "an explicit `doctor` **or** canary mode", and D-11 names `doctor --discovery` as an execution-evidence source. So for codex and pi, the paired native read-only invocation in a COMPLETE discovery unit counts as read-only execution evidence. The canary-specific VIOLATED checks are argued explicitly in the findings rather than ignored.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hermes application tree excluded from the harness-home fingerprint**
- **Found during:** Task 2 (before the first probe run)
- **Issue:** `HERMES_HOME/hermes-agent` is the Hermes application install, about 137k entries. One `fingerprintManifest` pass did not finish within 10 minutes, and a before/after pair would have made the probe impractical. The plan's exclusion categories (session, log, history, cache, credential) do not cover it.
- **Fix:** It is excluded with the reason written into the transcript note: a harness application tree, never an alpha-AOS-managed path. The managed hermes children (`config.yaml`, `skills`) stay fingerprinted, and `config.yaml` is also a host-guard target.
- **Files modified:** `evidence/probes/life02-discovery.mjs`
- **Committed in:** `c280fd2`

**2. [Rule 3 - Blocking] Locked Codex files abort the fingerprint (EBUSY)**
- **Found during:** Task 2 (first run, which ended in `PROBE-ERROR` before any doctor step ran)
- **Issue:** `fingerprintManifest` reads every file. On Windows, lock files held open by a running Codex (`tmp/arg0/*/.lock`, `thread-writer-locks/*.lock`) throw `EBUSY`. `probe-lib.mjs` and `packed-sandbox.ts` are read-only for this wave.
- **Fix:** Codex `.tmp`, `tmp` and `thread-writer-locks` were added as volatile exclusions with their reasons. A probe-local pre-scan (`openSync` only) excludes any unmanaged child that holds a locked file and writes a note. It throws if a managed child is locked.
- **Files modified:** `evidence/probes/life02-discovery.mjs`
- **Committed in:** `c280fd2`

**3. [Rule 1 - Bug] Canary legs classified from `rows[]` instead of `skipped`/`handoffResults`**
- **Found during:** Task 2 (second run)
- **Issue:** The CLI redaction seam prints the second appearance of a shared object as `"[redacted:cycle]"`. As a result, the codex `skipped[].selection` and the second `handoffResults[].pair` came out as `? (?)` in the check details.
- **Fix:** Legs are classified from `rows[]`, whose fields are primitives. Launches still come from `results[]` and the handoff `receiving` result. The count of markers is recorded as `life02.canary.json-cycle-markers` OBSERVED, and the findings list it as an Observation.
- **Files modified:** `evidence/probes/life02-discovery.mjs`
- **Committed in:** `c280fd2`

**4. [Rule 2 - Missing critical] Extra check and dry-run beyond the ten named status checks**
- **Found during:** Task 1
- **Issue:** The `life02.doctor.actionable` check requires the named command to be runnable, but nothing in the plan ran it.
- **Fix:** The probe runs the named command as a dry-run (`repair --json`, no `--apply`, inside the sandbox) and records its exit code and planned action.
- **Committed in:** `be6cfe2`

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing critical)
**Impact on plan:** The evidence stays honest and the probes finish in about 3 minutes. Every exclusion is named with a reason in the transcript, none covers a managed path, and `src/` is untouched.

## TDD Gate Compliance

Task 1 is `tdd="true"`, but it adds an oracle for behavior that already exists. Under D-12 only a passing test may be committed, so no RED commit was possible. Instead, the test's failure path is proven by the positive controls in the same test: the trap records inventory's `spawnSync` and a loopback `fetch`, so an empty status log is meaningful. The test went straight to green in `be6cfe2`.

## Issues Encountered

- The first discovery-probe run ended in `PROBE-ERROR` (EBUSY) before any doctor step. It launched no harness and wrote no committed evidence; the transcript was overwritten by the next run. Deviation 2 fixed it.

## Known Stubs

None.

## Verification (plan level)

- `npm run check`: pass. `npm run build`: pass.
- `node scripts/run-tests.mjs --files dist/test/status-offline-verification.test.js dist/test/path-literal-guard.test.js`: 7/7 pass on Windows. WSL: 1/1 pass.
- Host-safe full suite (scratch HOME, `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`, capability-oracle excluded): tests 889, pass 880, fail 0, skipped 9. The scratch home has no `.alpha-aos`.
- Both LIFE-02 transcripts end with `RESULT:` and `host-guard: unchanged (17 targets)`.
- Task 1 gate: all ten named checks are present, and no CHECK detail contains a millisecond figure. Task 2 gates: 5 discovery checks, 5 no-spend checks, `repo-unchanged` present, exactly one `harness-homes-unchanged`. The findings gate passes (27 CHECK citations).
- `git status --porcelain -- src` is empty. Apart from this plan's files, the real repository porcelain is identical before and after the tasks.

## User Setup Required

None: no external service configuration required.

## Next Phase Readiness

Plan 11-07 can compile LIFE-02 from `evidence/LIFE-02-findings.md`. It should map C3 onto G-07-2 / REL-02 and assign G-11 ids to C1, C2, C4, C5 and C6. LIFE-02 gaps do not block Phase 13 (D-08).

---
*Phase: 11-managed-lifecycle-verification*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 7 created files exist; task commits be6cfe2 and c280fd2 are in history; both LIFE-02 transcripts end with a RESULT line and an unchanged host guard.
