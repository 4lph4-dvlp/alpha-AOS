---
status: complete
phase: 04-mandatory-gsd-gates
source: [04-VERIFICATION.md]
started: 2026-09-17T14:42:00Z
updated: 2026-09-17T14:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Low-Risk Silent Pass (GATE-04, D-03)
- **Scenario:** Developer modifies non-risk files (e.g. documentation, CSS styles, tests).
- **Expected:** `alpha-aos gate check` completes with exit code 0, returns `silentPass: true` and `obligations: []`, advancing GSD lifecycle points without prompting or blocking.
- **Result:** pass (`test/gate-lifecycle.test.ts` verified).

### 2. Mandatory Gate Block on Risk Surfaces (GATE-01, GATE-03, D-07, D-08)
- **Scenario:** Developer modifies authentication (`src/auth/token.ts`), database migration, or release configuration without prior verified gate execution.
- **Expected:** `alpha-aos gate check` exits with code 2 (domain refusal), prints a formatted alert banner detailing the obligation, offending files, and runnable recheck command (`alpha-aos gate check --obligation <name>`).
- **Result:** pass (`test/gate-lifecycle.test.ts` verified).

### 3. Native-First Check Execution and Receipt Persistence (GATE-02, D-04, D-05, D-06)
- **Scenario:** Developer executes `alpha-aos gate check --obligation <name>`.
- **Expected:** alpha-AOS selects the project's native script from `package.json` (or detects ORM) over ECC fallback, records suppressed alternatives with cited reason, executes in a bounded shell-free subprocess, atomically writes `.alpha-aos/receipts/gates/<obligation>.json`, and exits 0. Subsequent gate check passes.
- **Result:** pass (`test/gate-engine.test.ts` and `test/gate-lifecycle.test.ts` verified).

### 4. Revision-Bound Staleness Detection (GATE-03, D-09)
- **Scenario:** After a gate check passes, developer modifies a file inside the risk surface before verification.
- **Expected:** The receipt is immediately recognized as stale (`workingTreeDigest` mismatch). `alpha-aos gate status` reports `status: "stale"`, and `alpha-aos gate status --strict` or GSD verification halts fail-closed until re-run.
- **Result:** pass (`test/gate-lifecycle.test.ts` verified).

### 5. Worker Authority Enforcement and .planning Immutability (GATE-05, D-10, D-11)
- **Scenario:** Hermes or a delegated worker harness is invoked to work on workspace tasks.
- **Expected:** Hermes is structurally prohibited from acting as GSD state controller. Worker launch spec is stripped of controller workflow instructions. Pre- and post-execution tree witnessing detects any attempt by the worker to modify `.planning/`, halts immediately, rolls back `.planning/` byte-for-byte, and raises `WorkerAuthorityError`.
- **Result:** pass (`test/worker-authority.test.ts` verified).
