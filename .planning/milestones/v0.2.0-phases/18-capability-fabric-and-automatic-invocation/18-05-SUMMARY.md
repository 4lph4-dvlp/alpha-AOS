---
phase: 18-capability-fabric-and-automatic-invocation
plan: "05"
status: completed
completed_at: 2026-10-03T14:05:00+09:00
commits:
  - fbd8b97 feat(18-05): compute capability drift and proof invalidation reasons
  - 5ff5136 feat(18-05): evaluate capability recovery, equivalent alternates, and approval barriers
artifacts:
  - src/core/task-capability-drift.ts
  - src/core/task-run.ts
  - test/task-capability-drift.test.ts
  - test/task-run.test.ts
requirements_addressed: [CAP-03, CAP-04, CAP-05]
---

# Plan 18-05 Summary: Input Drift Detection, Automatic Re-selection, and Recovery Fallbacks

## Executive Overview

Plan 18-05 established the capability input drift evaluator (`assessCapabilityDrift`), evidence invalidation reason tracking, and the capability recovery and fallback state machine (`evaluateCapabilityRecovery`) integrated directly into the `startTask` execution lifecycle.

## Delivered Capabilities

### 1. Capability Input Drift Detection (`src/core/task-capability-drift.ts`)
- **D-17 & D-09 (Declaration vs Observation Drift):** Evaluates differences across declaration fingerprints (`phase`, `scope`, `manifestDigest`, `dependencyDigest`, `packState`, `packSourceHash`, `skillSourceHash`) and host observation fingerprints (`harness`, `harnessExecutable`, `harnessVersion`, `mcpServerVersion`, `mcpToolAvailability`).
- **Targeted Evidence Invalidation:** Marks only affected receipts in `invalidatedReceiptIds` while retaining original receipt files in external `stateRoot` as immutable audit history.
- **Specific Remediation Prescriptions:**
  - `phase-mismatch` / `scope-mismatch` -> prescribes `re-invoke`
  - `manifest-changed` / `dependency-changed` -> prescribes `re-plan`
  - `pack-not-current` / `pack-source-changed` -> prescribes `re-sync`
  - `skill-source-changed` -> prescribes `re-discover` in fresh session
  - `harness-version-changed` / `harness-executable-changed` -> prescribes `re-probe`
  - `mcp-tool-unavailable` -> prescribes `restore-tool`
- **Zero-Drift Reuse:** Unchanged inputs preserve existing proofs and populate `reusableReceiptIds` without unnecessary re-invocation.

### 2. Recovery and Fallback Boundaries (`src/core/task-capability-drift.ts`, `src/core/task-run.ts`)
- **D-10 (Current Path Repair Priority):** First checks if the current capability path recovers on retry within approved permissions.
- **D-12 (Verified Equivalent Alternates Only):** Accepts candidate alternate tools only when they prove the same requirement (`answersSameQuestion: true`) and carry verified proof (`provenResult: true`), rejecting unproven tools or superficial name matches.
- **D-11 (Harness / Role Change Approval Barrier):** When an equivalent alternate requires switching agent role or harness, execution pauses at `needs-input` (status `unknown`) with a deterministic proposed contract digest. The switch proceeds only when explicitly approved with that exact digest.
- **D-13 (Needs-Input vs Blocked Differentiation):** Halts with `needs-input` and actionable instructions if user remediation exists (such as configuring a missing API key), and halts with `blocked` if no viable path exists.
- **Accepted Verdict Protection:** Defeats `accepted` verdicts whenever capability obligations remain unmet by setting `preconditions` unsatisfied.

## Verification

- Automated test suites:
  - `test/task-capability-drift.test.ts`: 9 passing tests verifying identical fingerprint reuse, phase mismatch invalidation, scope change invalidation, manifest/dependency drift, pack state drift, source hash drift, harness drift, MCP tool loss, and recovery evaluation rules.
  - `test/task-run.test.ts`: 12 passing tests including end-to-end task runs validating blocked halt on failure, needs-input halt on required user action, approval barrier on harness change, and successful completion on verified equivalent alternate.
- Static type checking: `npm run check` with 0 errors across the codebase.
