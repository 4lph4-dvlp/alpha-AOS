---
phase: 04-mandatory-gsd-gates
plan: 02
subsystem: core
tags: [gates, single-engine, native-first, suppression, receipts, transaction]

# Dependency graph
requires:
  - phase: 04-mandatory-gsd-gates
    provides: "src/core/gate.ts — resolvePhaseGitDiff, matchRiskFacts, evaluateRiskObligations"
provides:
  - "schemas/gate-receipt.schema.json — Draft 2020-12 closed JSON schema for structured gate receipts (D-06)"
  - "src/core/gate.ts — selectGateEngine with Native-First precedence (D-04) and visible suppression (D-05), executeGateCheck shell-free bounded execution"
  - "src/core/gate-receipt.ts — createGateReceipt, writeGateReceipt via applyFileTransaction (SAFE-03), readGateReceiptStrict, computeRiskSurfaceDigest"
  - "test/gate-engine.test.ts — comprehensive verification of native-first precedence, visible suppression, schema validation, and atomic receipt persistence"
affects: [gate-lifecycle, gsd-capability-overlay, worker-authority]

actuals:
  tokens: 48000
  tasks: 3
  commits: 1
plan_head_before: c904106

tech-stack:
  added: []
  patterns:
    - "Native-first engine selection inspecting project package.json scripts before falling back to ECC skills"
    - "Visible suppression recording cited rationale for non-selected review engines to ensure zero duplicate reviews (D-05)"
    - "JSON Schema Draft 2020-12 closed validation for structured gate receipts (schemas/gate-receipt.schema.json)"
    - "Atomic, pre-imaged file persistence of gate receipts via applyFileTransaction under .alpha-aos/receipts/gates/"
    - "Shell-free bounded child_process execution via runProcess with 60s timeout and 256 KiB output cap"

key-files:
  created:
    - schemas/gate-receipt.schema.json
    - src/core/gate-receipt.ts
    - test/gate-engine.test.ts
  modified:
    - src/core/gate.ts
    - src/core/validation.ts
    - src/types.ts

key-decisions:
  - "selectGateEngine strictly selects exactly one engine per obligation and records all alternative engines in suppressedEngines with explicit rationale (D-04, D-05)"
  - "executeGateCheck uses runProcess exclusively (no raw shell or child_process spawns), enforcing process security assertions in test/process.test.ts"
  - "Gate receipts are validated strictly via Ajv Draft 2020-12 both during creation and on readGateReceiptStrict"
  - "Non-zero exit codes or subprocess timeouts are recorded as status: 'failed' in the receipt without unhandled rejections (SAFE-05)"

requirements-completed: [GATE-02]

coverage:
  - id: D-04
    description: "Native-First engine selection with ECC fallback"
    requirement: "GATE-02"
    verification:
      - kind: integration
        ref: "test/gate-engine.test.ts#selectGateEngine follows Native-First precedence and visibly suppresses ECC skills (D-04, D-05)"
        status: pass
      - kind: integration
        ref: "test/gate-engine.test.ts#selectGateEngine falls back to ECC skill when no native script exists"
        status: pass
  - id: D-05
    description: "Visible suppression reporting with zero duplicate reviews"
    requirement: "GATE-02"
    verification:
      - kind: integration
        ref: "test/gate-engine.test.ts#selectGateEngine follows Native-First precedence and visibly suppresses ECC skills (D-04, D-05)"
        status: pass
  - id: D-06
    description: "Structured Gate Receipt schema validated and persisted atomically"
    requirement: "GATE-02"
    verification:
      - kind: integration
        ref: "test/gate-engine.test.ts#writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03)"
        status: pass
      - kind: integration
        ref: "test/gate-engine.test.ts#readGateReceiptStrict rejects invalid or tampered receipt documents"
        status: pass
---

# Phase 04 Plan 02 Summary

## Summary of Accomplishments

1. **Structured Gate Receipt Schema (`schemas/gate-receipt.schema.json`, `src/core/validation.ts`)**:
   - Designed a closed-world Draft 2020-12 JSON Schema for gate receipts.
   - Enforced strict validation for schema version, obligation enum (`security-review`, `database-migration`, `release-check`), status enum (`passed`, `failed`), engine specification, commit SHA hex, working tree digest hex, exit code, timestamp, suppressed alternatives, and evidence SHA-256.
   - Integrated `"gate-receipt"` into `src/core/validation.ts` under `OWNED_SUBTREE` and `CORE_SCHEMAS`.

2. **Native-First Precedence & Visible Suppression (`selectGateEngine` in `src/core/gate.ts`)**:
   - Implemented `selectGateEngine`:
     - Inspects `package.json` scripts (`security`, `audit`, `migrate:*`, `release:*`) or project structure (ORM configurations like Prisma, Alembic, Knex, Drizzle).
     - When native commands/scripts are available, selects the native engine (`kind: "native"`) and suppresses the ECC skill fallback (`kind: "ecc"`), explicitly recording the reason in `suppressedEngines` (D-04, D-05).
     - When no native script exists, gracefully selects the ECC skill engine.
     - Ensures exactly one check engine runs per obligation, guaranteeing zero duplicate reviews.

3. **Shell-Free Bounded Subprocess Dispatch (`executeGateCheck` in `src/core/gate.ts`)**:
   - Executes the selected gate engine using `runProcess` with a 60-second timeout and 256 KiB output cap.
   - Redacts or scrubs the environment and safely captures exit codes, stdout, and stderr.
   - Respects non-zero exits as `status: "failed"` without throwing unhandled errors (SAFE-05).

4. **Atomic Receipt Persistence & Verification (`src/core/gate-receipt.ts`, `test/gate-engine.test.ts`)**:
   - Implemented `computeRiskSurfaceDigest` to deterministically hash modified risk files.
   - Implemented `createGateReceipt`, `writeGateReceipt`, and `readGateReceiptStrict`.
   - `writeGateReceipt` utilizes `applyFileTransaction` with `.alpha-aos` in `allowedRoots`, creating snapshots and journals for rollback safety (SAFE-03).
   - Created test suite `test/gate-engine.test.ts` (9 tests) verifying Native-First selection, visible suppression, ORM detection, bounded subprocess execution, failure capture, deterministic surface digesting, atomic writing, and tampering rejection. All 9 tests pass.

## Self-Check: PASSED
- `schemas/gate-receipt.schema.json` and `src/core/gate-receipt.ts` created and validated.
- `src/core/gate.ts`, `src/core/validation.ts`, `src/types.ts` updated and compiling cleanly.
- `test/gate-engine.test.ts` passes 9/9 tests.
- Full test suite green (`npm test`: 786 passing).
