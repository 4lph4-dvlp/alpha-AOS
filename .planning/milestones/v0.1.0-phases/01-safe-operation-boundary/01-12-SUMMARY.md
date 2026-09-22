---
phase: 01-safe-operation-boundary
plan: 12
subsystem: infra
tags: [mutation-session, path-proof, reviewed-digest, gsd-compat, ecc-skills]

requires:
  - phase: 01-07
    provides: "OperationPathProofSet, role-tagged proofs and immediate recheck"
  - phase: 01-09
    provides: "MutationSession, writer lock and durable transaction journal"
  - phase: 01-11
    provides: "Process adapter, declared environments and redacted failure text"
provides:
  - "component-session.ts: the one contract a component mutator states — reviewed digest, planned-path lookup, immediate recheck, standalone-or-caller session"
  - "planCodexGsdHookCompatibilityOperation / planEccSkillOperation: complete read-only plans"
  - "applyCodexGsdHookCompatibility / applyEccSkillSync: standalone or nested under a caller's writer"
affects: [01-13, 01-14]

actuals:
  tokens: 21000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A component plan is reviewable content plus a digest; apply re-reads and compares before it acquires anything"
    - "Apply looks a path up in the plan; it never proves one late"
    - "A deferred argument is bound to a proven root, so a child's output cannot widen the operation"

key-files:
  created:
    - src/core/component-session.ts
  modified:
    - src/core/gsd-compat.ts
    - src/core/ecc-skills.ts
    - test/gsd-compat.test.ts
    - test/ecc-skills.test.ts

key-decisions:
  - "The shared contract is a module rather than a pattern repeated per component, because 01-13 adds five more callees"
  - "GSD compatibility names its fixture root in the plan and creates it with a non-recursive mkdir, so mkdtemp is gone from that apply path"
  - "ECC gained verifiedSourceRoot, mirroring GSD: a caller that already rendered the skills binds every source byte at review time"
  - "The caller's session is validated by state-root ownership and open handle, not by digest equality — an aggregate caller's digest is its own, not the component's"

patterns-established:
  - "A refusal is a typed ComponentPlanError with a code, so a test asserts why it refused rather than that it threw"

requirements-completed: [SAFE-02, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "The plan enumerates every path role, source hash, declared child and environment name, and creates nothing"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/gsd-compat.test.ts#the reviewed plan names every path role, source hash and declared child before apply"
        status: pass
      - kind: unit
        ref: "test/ecc-skills.test.ts#the reviewed ECC plan binds every destination, source byte and path role"
        status: pass
    human_judgment: false
  - id: D2
    description: "A standalone apply acquires exactly one writer after complete revalidation and releases it"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/gsd-compat.test.ts#Codex GSD compatibility installs missing helper closure and smoke-tests Stop"
        status: pass
      - kind: integration
        ref: "test/ecc-skills.test.ts#standalone and nested ECC applies write the same bytes, and the nested one takes no second lock"
        status: pass
    human_judgment: false
  - id: D3
    description: "A nested apply consumes the caller's session, takes no second lock, journals under the caller's operation and does not release the caller's writer"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/gsd-compat.test.ts#a nested apply consumes the caller session and never takes a second writer lock"
        status: pass
      - kind: integration
        ref: "test/ecc-skills.test.ts#standalone and nested ECC applies write the same bytes, and the nested one takes no second lock"
        status: pass
    human_judgment: false
  - id: D4
    description: "A plan that no longer matches a re-read refuses with zero mutations, zero processes and an unchanged target"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/gsd-compat.test.ts#a plan reviewed before the source changed refuses and writes nothing"
        status: pass
      - kind: integration
        ref: "test/ecc-skills.test.ts#a reviewed ECC plan refuses a changed source and preserves the target and its neighbours"
        status: pass
    human_judgment: false
  - id: D5
    description: "A caller session that owns a different state root is refused before any mutation"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/gsd-compat.test.ts#an apply whose caller session owns another state root refuses before mutating"
        status: pass
    human_judgment: false
  - id: D6
    description: "Failure evidence stays typed, bounded and free of raw subprocess output"
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "test/process.test.ts#a failed child is described by fingerprints, never by its raw output"
        status: pass
    human_judgment: true
    rationale: "describeProcessFailure is unchanged and still the only path that reports a child's outcome; the new refusals are ComponentPlanError codes plus paths, which carry no process output and no credential value. No new test asserts this about the new code paths."
  - id: D7
    description: "The ECC fixture branch precomputes its source paths"
    requirement: SAFE-02
    verification: []
    human_judgment: true
    rationale: "Not built. runEccFixture still names its own mkdtemp directory, so in the no-verifiedSourceRoot branch the plan declares the temp root and apply proves containment inside it rather than reading a precomputed path. This is the same gap 01-11 recorded and 01-14 owns."

duration: 65min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 12: Session-aware GSD and ECC mutators

**Both component mutators publish a complete plan, revalidate it before they take anything, and run under exactly one writer — their own when standalone, the caller's when nested.**

## Performance

- **Duration:** ~65 min
- **Completed:** 2026-09-04
- **Tasks:** 2
- **Files created:** 1 · **modified:** 4

## Accomplishments

- **`src/core/component-session.ts` states the contract once.** A reviewed digest over the plan's content; `plannedProof` to look a path up rather than prove it late; `assertUnchangedSincePlan` for the immediate ancestor recheck; `assertPlanUnchanged` for the re-read comparison; and `withComponentSession`, which acquires and releases a writer when standalone and consumes the caller's when nested. Plan 01-13 adds five more callees; they state this once each instead of restating it.
- **`planCodexGsdHookCompatibilityOperation` is complete and read-only.** It declares target, state, journal, snapshot, temp, source and package-root roles; binds each helper's source and destination hash; declares both npm child processes with their cwd, deadline, output cap and environment *names*; and folds all of it plus the boundary result into one digest. It creates nothing — the test asserts the destinations and the writer lock are still absent afterwards.
- **The GSD fixture root is named in the plan, not discovered during apply.** `mkdtemp` is gone from this path: the plan picks the location, proves it, and apply creates it with a non-recursive `mkdir`, so an entry already sitting there is someone else's and `EEXIST` refuses. That closes part of the 01-11 fixture gap for this module.
- **A child's output can no longer widen the operation.** The extraction step declares a `deferredArgument` naming the argument index and the root the value must live in. Apply substitutes the archive npm named, but only after proving it resolves inside the proven pack root.
- **`planEccSkillOperation` binds every destination, expected rendered hash and — when a source tree is supplied — every source byte.** `verifiedSourceRoot` now mirrors GSD's: a caller that has already rendered and verified the skills hands them over, and the plan is fully hash-bound before anything is acquired.
- **Every write is looked up, rechecked, then handed to the transaction under the session.** Source proof recheck before the read, target proof recheck before the write, destination hash compared against the reviewed value, and `applyFileTransaction` called with the session so it acquires nothing.
- **Refusals are typed.** `ComponentPlanError` carries `plan-incomplete`, `plan-drift`, `unplanned-path`, `boundary-changed`, `source-drift` or `session-mismatch`, so a test asserts *why* apply refused.

## Verification

`node --test dist/test/gsd-compat.test.js dist/test/ecc-skills.test.js` → 10/10.
Full suite: 142 tests, 138 pass, 1 fail, 2 skipped, 1 todo.

The one failure is `preview.test.ts#install and update wrappers preview without mutating either shell family`, which fails identically on the previous commit — it is the SAFE-01 wrapper violation already recorded as a phase blocker, not a regression from this plan. The todo is the 01-15 CLI output seam.

## Deviations from Plan

- **`src/core/component-session.ts` is a new file, and the plan's `files_modified` lists only four.** The contract is stated identically by two modules here and by five more in 01-13; duplicating it seven times would guarantee drift. Nothing else in the codebase changed.
- **`ProcessSpec` and `EnvironmentPolicy` are recorded in the plan without their `source`.** `nodeRuntimeEnvironment()` carries `source: process.env`, so digesting the spec as-is would have written the entire ambient environment into the plan. `declaredProcessSpec` strips it and `declaredEnvironmentNames` records only the names.
- **A nested caller's session is validated by state-root ownership, not by digest equality.** The plan text says apply should verify "operation/plan digest ownership". An aggregate install session's `planDigest` is the aggregate's, not the component's, so requiring equality would make nesting impossible. Apply instead asserts the session is open and owns the same state root, and separately proves its own plan digest by re-reading — which is the property the digest was for.

## Open Gaps

- **The ECC fixture branch still discovers its source root.** With no `verifiedSourceRoot`, `runEccFixture` mkdtemps its own directory; the plan declares the temp root and apply proves the fixture landed inside it and that every byte matches the locked rendered hash, but the path itself is not precomputed. Closing this needs `runEccFixture` to accept a caller-named root — `ecc-fixture.ts` is 01-14's file, and 01-14 already owns this gap from 01-11.
- **One session, one transaction.** `applyFileTransaction` derives its journal id from `session.operationId`, so two component applies under a single caller session would write the same journal path and the second would overwrite the first's record. Nothing does this yet. Plan 01-14 aggregates several component applies under one session and must either give each a distinct journal or make the transaction namespace them; this is a prerequisite for that plan, not an optional cleanup.

## Next Phase Readiness

`01-13` can proceed and should import `component-session.ts` rather than restating the contract. `01-14` inherits both gaps above and the two still open from `01-11` (`openProtocolProcess`, the fixture plan/execute split).

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
