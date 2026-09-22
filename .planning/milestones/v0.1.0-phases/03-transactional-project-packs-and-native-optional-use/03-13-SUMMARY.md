---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 13
subsystem: capability-evidence
tags: [claim-notes, discovery, canary, closed-schema]
requires:
  - phase: 03-12
    provides: persisted capability proofs and handoff scope witnesses
provides:
  - Closed optional proof claim notes with statements and observed bases
  - Negative discovery invocation inference and recorded canary runtime scope
  - Full-length claim lines in capability reports and durable requirements inference
affects: [capability-ledger, doctor, phase-verification]
tech-stack:
  added: []
  patterns: [proof qualifications carried without changing verdicts, runtime materialization as instruction provenance]
key-files:
  created: []
  modified:
    - src/core/capability-ledger.ts
    - schemas/capability-ledger.schema.json
    - src/adapters/capability-oracle.ts
    - src/core/canary.ts
    - src/format.ts
    - test/capability-ledger.test.ts
    - test/capability-oracle.test.ts
    - test/canary.test.ts
    - .planning/REQUIREMENTS.md
key-decisions:
  - Claim notes qualify recorded evidence and never participate in verdict computation.
  - Preserve every CAPA status and require separate real behavior evidence before completing requirements.
requirements-completed: []
coverage:
  - id: D1
    description: Closed optional discovery inference notes persist without changing paired verdicts.
    requirement: CAPA-06
    verification:
      - kind: integration
        ref: test/capability-ledger.test.ts and test/capability-oracle.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Canary proofs and rows share scope notes based on recorded runtime instruction ids.
    verification:
      - kind: integration
        ref: test/canary.test.ts#a launched canary proof records its runtime scope and the recorded instruction ids without recomputing them
        status: pass
    human_judgment: false
  - id: D3
    description: Report notes render in full outside table cells and requirements retain their existing statuses.
    verification:
      - kind: unit
        ref: test/canary.test.ts#claim notes render in full on tagged lines after incompleteness without changing the table
        status: pass
      - kind: other
        ref: REQUIREMENTS.md checks returned 8 unchecked CAPA items, 8 Phase 3 rows, and 1 Recorded Inferences subsection
        status: pass
    human_judgment: false
actuals:
  tokens: 7497
  tasks: 3
  commits: 5
duration: interrupted execution; final full verification 245s
completed: 2026-09-12
status: complete
---

# Phase 3 Plan 13: Proof Claim Qualifications Summary

**Discovery proofs carry their invocation inference; canary proofs carry their runtime scope and exact instruction ids; doctor displays both with their bases.**

## Performance

- Tasks: 3; implementation/requirements files changed: 9.
- Task 1 was committed on 2026-09-11, followed by an interruption and the separately authorized quick remediation. Tasks 3 and 2 resumed on 2026-09-12. A complete active-time measurement was not retained across that interruption.
- Actual tokens are `ceil(29985 / 4)` over the three realized task diffs, excluding unrelated quick-task changes and closeout metadata. The five commits comprise three task commits plus summary and state closeout commits.

## Accomplishments

- Added the optional closed `ClaimNote` contract with `inference` and `scope-limit` kinds. Existing proofs remain readable without inventing an empty persisted note list. A negative control that did not discover a capability records the invocation inference; positives and controls that discovered it do not.
- Recorded `ownedInstructionIds` in the runtime materialization loop and carried them through launched, blocked, and refused results. `canaryClaimNotes` feeds both the persisted proof and report row. Refused runs still create no proof.
- Made report-row notes required, collecting positive then negative proof notes and leaving skipped rows empty. `CLAIM-INFERENCE` and `CLAIM-SCOPE` lines follow incompleteness reasons and precede unsupported reasons, without changing table cells.
- Added exactly one CAPA-06 inference entry beside requirements traceability. All eight CAPA checkboxes and all traceability statuses remain unchanged.

## Task Commits

1. Task 1 — `ae3a713`: record qualified negative discovery inference (prior completed work, preserved).
2. Task 3 — `1901b52`: record canary runtime claim scope and instruction ids.
3. Task 2 — `6ad73a1`: surface proof claim notes in capability reports.

## Verification

- Prior Task 1 focused ledger/oracle suite: 61 passing cases, as recorded in the recovery handoff; the final full suite also reran these files successfully.
- Task 3: `npm run check`, `npm run build`, focused canary suite: 84 passed, zero failed.
- Task 2: `npm run check`, `npm run build`, focused canary suite: 86 passed, zero failed.
- Final `npm test`: 731 tests, 725 passed, zero failed, six existing host-dependent skips, 244.9 seconds. The runner emits the spec summary `fail 0`, equivalent to the plan's TAP failure-count check. Output is in the local temporary `alpha-aos-03-13-final.log`.
- Requirement assertions: 8 unchecked CAPA entries, 8 Phase 3 traceability rows, 1 inference subsection. `git diff --check` passed.
- On Windows, the test process prepended installed Git Bash to PATH so wrapper tests exercised all four shell variants; no wrapper source change was needed.

## Decisions Made

Claim notes are carried evidence qualifications, never verdict inputs. Module-owned wording names the configuration boundary without persisting raw runtime paths; the sole run-derived text is the recorded instruction vocabulary.

`requirements-completed` remains empty by explicit plan and user instruction. This plan improves how claims are qualified; it does not supply the four remaining real behavior observations or change the earlier status revert.

## Deviations from Plan

- Task 3 ran before Task 2 because Task 2 consumes its shared helper. This order was explicitly authorized in recovery. No architecture or feature scope changed.
- Verification was consolidated into focused checks after each resumed task and one final full suite, as explicitly directed for recovery. No paid canary or native model turn ran.
- Generic requirement auto-completion was intentionally omitted because the plan explicitly preserves the reverted CAPA statuses. The existing stale plan counter is corrected through GSD state handlers after this summary is committed.

## Deferred Issues

The following pre-existing tests were skipped by host capability detection in the full run. Each is also recorded in `.planning/WINDOWS.md` as required by the executor ledger rule; none was introduced or disabled by this plan.

| File and line | Host limitation |
| --- | --- |
| test/evidence.test.ts:514 | File links unavailable for the file-alias fixture. |
| test/path-boundary.test.ts:163 | File symlinks unavailable for the escaping-link fixture. |
| test/path-boundary.test.ts:256 | Privileged reparse facilities unavailable. |
| test/path-boundary.test.ts:732 | Host resolves the unreadable root despite mode 0o000. |
| test/path-boundary.test.ts:794 | Host resolves the unreadable component despite mode 0o000. |
| test/path-boundary.test.ts:840 | Host resolves the changed component despite mode 0o000. |

No new stub or skipped test was added. The existing oracle placeholder prompt is a deliberate discovery input, not an unfinished implementation. No new endpoint, authentication path, filesystem boundary, or unmodeled trust surface was introduced.

## Next Phase Readiness

Plan 03-13 is complete; 03-14 and 03-15 remain for the orchestrator. Phase 3 verification and the four previously recorded human/spending boundaries remain pending, including the CAPA-01/CAPA-02 live canaries, CAPA-03 receiving leg, and CAPA-05 exercise evidence. No credential setup was required for this implementation.

## Self-Check: PASSED

All nine implementation/requirements paths exist. Task commits `ae3a713`, `1901b52`, and `6ad73a1` exist and contain the stated files; their diffs delete no tracked files. The final test and requirements checks above passed. Existing `.gsd/` and `.planning/milestone.lock` remain untracked and are excluded from commits.
