---
phase: 18-capability-fabric-and-automatic-invocation
plan: "07"
status: completed
completed_at: 2026-10-08T02:05:00+09:00
commits:
  - (pending) feat(18-07): five-harness capability host matrix and declaration fixture manifest
artifacts:
  - test/task-capability-fixtures.test.ts
  - test/task-gsd-adversarial.test.ts
  - test/capability-oracle.test.ts
  - src/core/task-capability-inventory.ts
  - src/adapters/task-agents.ts
  - scripts/capability-host-matrix.mjs
requirements_addressed: [CAP-01, CAP-02, CAP-03, CAP-04, CAP-05]
---

# Plan 18-07 Summary: End-to-End Integration, Declaration Fixture Manifest, and Five-Harness Host Matrix

## Executive Overview

Plan 18-07 establishes end-to-end integration and truth verification for alpha-AOS capabilities across two distinct boundaries:
1. **Declaration completeness:** A data-driven fixture manifest proving exact set equality against `buildTaskCapabilityInventory()` across all 77 declared capabilities (workflows, global skills, project skills, owned skills, MCP servers, MCP tools, capability packs, control commands, native tools, mandatory hooks), ensuring every capability has positive and negative test cases.
2. **Honest live host support matrix:** A multi-harness collector (`scripts/capability-host-matrix.mjs`) and cell projection logic (`projectLiveSupportCell`) across all five harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`) that records exact executable, exact version, OS, session UUID, and enforces the CAP-05 / T-18-13 prohibition: synthetic fixture success must **NEVER** be recorded or promoted as live host support. Only meaningful read-only invocations actually observed with valid result IDs promote to `supported`; installed-only and discovered-only cells strictly remain `unverified`, while failed, denied, unavailable, or unsupported harnesses remain `unsupported`.

## Delivered Work

### 1. Declaration-Wide Matching/Nonmatching Fixtures (Task 1, CAP-01..CAP-05)
- Created `test/task-capability-fixtures.test.ts`:
  - Contains `CAPABILITY_FIXTURE_MANIFEST` covering all 77 declared capabilities with positive/negative prompts, expected category, and reason patterns.
  - Verifies exact set equality against `buildTaskCapabilityInventory()`. If any new capability is declared without a matching and non-matching fixture, tests fail closed.
  - Positive matching verifies obligation selection; negative matching verifies omission with documented justification.
  - Validates `CURRENT` status for approved packs and `STALE` status for unapproved packs.
  - Validates target harness selectivity for owned skills (`format-json-schema` vs `diagnose-yaml-format`).
  - Validates MCP servers and tools with exact pinned versions and integrity hashes.
- Extended `test/task-gsd-adversarial.test.ts`:
  - **ADV-05:** Cross-step receipt injection and tampered step identity fail verification closed.
  - **ADV-06:** Blank obligation question or empty capability name fails verification closed.
  - **ADV-07:** Process exit code 0 without required capability invocation cannot forge an accepted verdict.

### 2. Live Support Cell Projection & Five-Harness Matrix Collector (Task 2, CAP-05, T-18-13, T-18-14)
- **Support Cell Logic (`src/core/task-capability-inventory.ts`):**
  - Exported `CapabilitySupportStatus`, `CapabilityCellOutcome`, `HostCapabilitySupportCell`, `HarnessHostMatrixReport`.
  - Implemented `projectLiveSupportCell(options)`:
    - Rejects synthetic fixture promotion: if `isSynthetic: true`, `support` is always forced to `"unverified"` with a descriptive reason.
    - Missing executables or versions yield `"unsupported"`.
    - Failures, denials, and unavailable outcomes yield `"unsupported"`.
    - Inherently unsupported harness roles (e.g. Hermes worker attempting GSD controller workflows, Claude autonomous controller) yield `"unsupported"`.
    - Installed-only and discovered-only states yield `"unverified"`.
    - Only meaningful read-only invocations actually observed with a valid result ID and `outcome: "ok"` yield `"supported"`.
- **Harness Version Probes (`src/adapters/task-agents.ts`):**
  - Exported per-harness probe functions (`probeClaudeVersion`, `probeCodexVersion`, `probeAntigravityVersion`, `probePiVersion`, `probeHermesVersion`).
  - Added and exported unified dispatcher `probeHarnessVersion(harness, options)`.
- **Collector Script (`scripts/capability-host-matrix.mjs`):**
  - Probes exact executables and versions for all five harnesses via bounded launch adapters.
  - Evaluates installed, discovered, invoked, resultId, outcome, and support across all 77 capabilities for all 5 harnesses (385 cells).
  - Persists structured report to `${userStateRoot()}/reports/capability-host-matrix.json`.
  - Supports `--json` flag for machine-readable JSON output or human-readable terminal table output.
- **Matrix & Projection Tests (`test/capability-oracle.test.ts`):**
  - Tests `projectLiveSupportCell` across all states: installed-only, discovered-only, live success, failure, denied, unavailable, missing executable, unsupported harness, and synthetic rejection.
  - Tests `collectHostMatrix()` verifying presence of all 5 harnesses, 77 capabilities, 385 cells, cell contracts, and arithmetic consistency.

## Verification Results

1. **Targeted Tests:**
   `node scripts/run-tests.mjs --files dist/test/capability-oracle.test.js dist/test/task-capability-fixtures.test.js dist/test/task-gsd-adversarial.test.js`
   -> **46 passing, 0 failing**.
2. **Human-Check Verification (`node scripts/capability-host-matrix.mjs --json`):**
   - Probed real host versions:
     - `claude`: `ok`, `v2.1.291` (`~\.local\bin\claude.EXE`)
     - `codex`: `ok`, `v0.160.1` (`~\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`)
     - `antigravity`: `ok`, `v1.3.1` (`~\AppData\Local\agy\bin\agy.EXE`)
     - `pi`: `ok`, `v1.0.4` (`~\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`)
     - `hermes`: `ok`, `v2026.9.24` (`~\.hermes\bin\hermes.EXE`)
   - Summary: 77 capabilities, 385 cells:
     - `supportedCount: 0` (no live read-only invocation run in fresh session)
     - `unsupportedCount: 10` (Hermes worker GSD workflows, Claude autonomous controller)
     - `unverifiedCount: 375` (installed or detected, but uninvoked with live receipt)
3. **Full Suite & Static Analysis:**
   - `npm test`: **1,380 passing** (1,370 pass, 0 fail, 10 Windows skips).
   - `npm run check`: **0 errors**.
