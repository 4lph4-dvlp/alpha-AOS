---
phase: 31-cross-harness-proof-and-distribution
plan: "03"
subsystem: packaging
tags: [packed-install, integrity, cross-harness, sandbox]
requires: [{phase: 31-02, provides: proof index}, {phase: 31-04, provides: bilingual packaged guides}]
provides: [five-target packed skill parity, tamper refusal, packed task-entry CLI journeys]
affects: [31-05]
key-files:
  created: []
  modified: [test/tarball-fixture.test.ts]
requirements-completed: [PROVE-02]
duration: 20m
completed: 2026-11-03
status: complete
coverage:
  - id: D06-D08
    description: Installed tarball skill parity, meaningful CLI inspection, tamper refusal and complete host fingerprint preservation
    verification: [{kind: integration, ref: "test/tarball-fixture.test.ts", status: pass}]
    human_judgment: false
---

# Phase 31 Plan 03: Packed task-entry lifecycle

**The real packed CLI verifies five-harness task guidance and exercises policy, intake, readiness and six-route previews without paid calls or host drift.**

## Task commits

| Task | Commit | Result |
|---|---|---|
| 31-03-01 | c4fe969 | Locked source/target parity, frontmatter and label inspection, doctor/inventory, three tamper refusals, expanded deduplicated host fingerprints |
| 31-03-02 | 9f4ad45 | Policy preview/apply/rollback, chooser and simple exemption, three conversational routes, readiness states, three autopilot previews and packed verifier |

## Verification

- Type check and build passed (`.planning/tmp/31-03-final-{check,build}.log`).
- Packed lifecycle suite: 10 total, 10 passed, 0 failed, 0 skipped, 458363 ms (`.planning/tmp/31-03-final-tests.log`).
- The lifecycle's before/after host fingerprints match; vanished-entry count is zero; authoritative tarball bytes are unchanged.
- Autopilot previews are unapproved and never dispatch workers. Readiness uses an explicit read-only GSD fixture and is not promoted to native evidence.

## Deviations from Plan

**[Rule 1 — Test correctness] Display paths are not filesystem authority.** The first run failed when reading the CLI-redacted `~` destination as a literal path. The fixture now derives exact paths with `destinationFor` and sandbox environment/home inputs. It also matches the precedence heading case-insensitively and isolates injected guidance/entry journals from the original install/uninstall state. One superseded run was explicitly stopped after its exact process/test identity was confirmed; it is not counted as a pass. Final complete rerun passes all assertions.

**[Rule 1 — Existing API contract]** The actual simple-operation action is `execute-simple`, not the plan prose's `proceed-simple`; assertions use the existing implementation contract.

## Self-Check: PASSED

The declared test exists, both task commits are reachable, all packed assertions pass, and no real host path was modified. Review findings on foundation/verifier code are tracked separately and remain subject to final regression and re-review.
