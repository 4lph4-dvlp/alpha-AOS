---
phase: 04-mandatory-gsd-gates
plan: 03
subsystem: core
tags: [gates, lifecycle, predicates, gsd-capability, staleness, cli]

# Dependency graph
requires:
  - phase: 04-mandatory-gsd-gates
    provides: "selectGateEngine, executeGateCheck, writeGateReceipt, readGateReceiptStrict"
provides:
  - "src/core/gate-lifecycle.ts — evaluateLifecycleGates, checkReceiptStaleness, formatGateBlockingFeedback"
  - ".gsd/capabilities/alpha-aos/capability.json — GSD capability overlay declaring command-exit-zero predicate gates at execute:post and verify:pre (D-07)"
  - "src/cli.ts — alpha-aos gate check and alpha-aos gate status CLI commands (D-08, D-09)"
  - "test/gate-lifecycle.test.ts — comprehensive automated verification of lifecycle blocking, staleness detection, and capability schema adherence"
affects: [worker-authority]

actuals:
  tokens: 48000
  tasks: 3
  commits: 1
plan_head_before: 051159a

tech-stack:
  added: []
  patterns:
    - "Protected GSD lifecycle gate enforcement via command-exit-zero predicate checks at execute:post and verify:pre"
    - "Strict revision and working-tree digest staleness detection comparing Git HEAD and re-hashed risk surfaces"
    - "Actionable, formatted diagnostic alert boxes providing runnable recheck commands upon gate blockage"
    - "Standard CLI exit code semantics: code 0 for pass/silent-pass, code 2 for domain refusal / gate blocked"

key-files:
  created:
    - .gsd/capabilities/alpha-aos/capability.json
    - src/core/gate-lifecycle.ts
    - test/gate-lifecycle.test.ts
  modified:
    - src/cli.ts
    - src/core/gate.ts

key-decisions:
  - "Lifecycle progression to UAT/verification is blocked fail-closed when required gate evidence is missing, failed, unverified, unsupported, or stale (D-07, GATE-03)"
  - "checkReceiptStaleness detects both Git HEAD movement and post-check working-tree modifications inside the risk surface, refusing advancement until re-run (D-09)"
  - "formatGateBlockingFeedback renders an alert box containing the obligation name, failure reason, list of offending files, verification output, and runnable recheck command (D-08)"
  - ".gsd/capabilities/alpha-aos/capability.json conforms strictly to GSD capability schema and predicate structure with command-exit-zero predicates"

requirements-completed: [GATE-03]

coverage:
  - id: D-07
    description: "Protected lifecycle boundary at execute:post and verify:pre"
    requirement: "GATE-03"
    verification:
      - kind: integration
        ref: "test/gate-lifecycle.test.ts#Risky change without receipt blocks lifecycle with actionable error (GATE-03, D-07, D-08)"
        status: pass
      - kind: integration
        ref: "test/gate-lifecycle.test.ts#Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03)"
        status: pass
  - id: D-08
    description: "Actionable blocking feedback with runnable re-check command"
    requirement: "GATE-03"
    verification:
      - kind: unit
        ref: "test/gate-lifecycle.test.ts#formatGateBlockingFeedback renders structured alert box with recheck command (D-08)"
        status: pass
      - kind: integration
        ref: "test/gate-lifecycle.test.ts#Risky change without receipt blocks lifecycle with actionable error (GATE-03, D-07, D-08)"
        status: pass
  - id: D-09
    description: "Revision-bound evidence with Git HEAD SHA + working tree hash"
    requirement: "GATE-03"
    verification:
      - kind: unit
        ref: "test/gate-lifecycle.test.ts#checkReceiptStaleness detects Git HEAD changes and working tree modifications (D-09)"
        status: pass
      - kind: integration
        ref: "test/gate-lifecycle.test.ts#Post-check modification inside risk surface marks receipt stale and blocks gate status (D-09)"
        status: pass
---

# Phase 04 Plan 03 Summary

## Summary of Accomplishments

1. **Strict Revision-Bound Staleness & Blocking Diagnostics (`src/core/gate-lifecycle.ts`)**:
   - Implemented `checkReceiptStaleness`: detects both Git HEAD commit movement and modifications to working-tree risk files that occurred after receipt generation.
   - Implemented `formatGateBlockingFeedback`: outputs an alert banner detailing the obligation, blocking reason, offending risk files, engine diagnostic output, and a runnable recheck command (`alpha-aos gate check --obligation <name>`).
   - Implemented `evaluateLifecycleGates`: inspects cumulative diffs and receipts, granting automatic silent pass on low-risk changes (GATE-04) and returning structured verdicts and blocking feedback on risk modifications (GATE-03).

2. **CLI Subcommand Router (`src/cli.ts`)**:
   - Added `alpha-aos gate check [options]`:
     - Inspects current repository risk obligations, evaluates existing receipts, and executes missing or requested checks via `selectGateEngine` and `executeGateCheck`.
     - Writes valid receipts atomically via `writeGateReceipt`.
     - Exits with code 0 on pass or silent-pass; exits with code 2 on gate blockage with actionable instructions printed to stderr.
   - Added `alpha-aos gate status [options]`:
     - Inspects and reports current gate obligation status, engine selections, and staleness in human-readable or structured JSON format.
     - Supports `--strict` to exit code 2 when any gate is blocked or stale.

3. **GSD Capability Overlay Manifest (`.gsd/capabilities/alpha-aos/capability.json`)**:
   - Materialized the capability manifest declaring `id: "alpha-aos"`, `role: "feature"`, and `version: "0.1.0"`.
   - Wired `command-exit-zero` predicate checks at both `execute:post` and `verify:pre`, ensuring GSD's native loop mechanically halts execution when gates are missing or failing.

4. **Integration Testing (`test/gate-lifecycle.test.ts`)**:
   - Authored 7 comprehensive tests verifying staleness detection, diagnostic formatting, silent pass on low-risk work, fail-closed blocking on risky unverified changes, receipt creation and unblocking, post-check modification staleness, and GSD capability manifest conformance.
   - Full test suite verified green (`npm test`: 793 passed, 0 failed, 9 skipped).

## Self-Check: PASSED
- `src/core/gate-lifecycle.ts` and `.gsd/capabilities/alpha-aos/capability.json` created.
- `src/cli.ts` updated with `alpha-aos gate check` and `alpha-aos gate status`.
- `test/gate-lifecycle.test.ts` passes 7/7 tests.
- Full test suite passes with 0 regressions.
