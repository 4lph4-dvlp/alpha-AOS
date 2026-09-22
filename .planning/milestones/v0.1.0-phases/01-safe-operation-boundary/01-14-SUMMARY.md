---
phase: 01-safe-operation-boundary
plan: 14
subsystem: infra
tags: [mutation-session, aggregate-plan, fixture-plan, bootstrap, external-evidence]

requires:
  - phase: 01-11
    provides: "Process adapter, declared environments, redacted failure text"
  - phase: 01-12
    provides: "component-session.ts and session-aware GSD/ECC component mutators"
  - phase: 01-13
    provides: "Session-aware MCP, skill, policy, isolation and update mutators"
provides:
  - "One journal per transaction under a session, and repair that reads every journal an operation wrote"
  - "createGsdFixtureOperationPlan / createEccFixtureOperationPlan / createMcpFixtureOperationPlan: no fixture calls mkdtemp"
  - "createManagedInstallOperationPlan / applyManagedInstall: one aggregate plan, one session, every callee nested"
  - "src/core/bootstrap.ts: the reviewed wrapper operation the shell scripts will call"
affects: [01-15, 01-16]

actuals:
  tokens: 52000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A fixture root is named in a plan and created with a non-recursive mkdir"
    - "An external effect is reported as changed, unchanged or unknown, never as rolled back"
    - "A reviewed plan reuses its fixture locations so re-reading it produces the same digest"

key-files:
  created:
    - src/core/bootstrap.ts
  modified:
    - src/core/writer-lock.ts
    - src/core/transaction.ts
    - src/core/component-session.ts
    - src/core/gsd-fixture.ts
    - src/core/ecc-fixture.ts
    - src/core/mcp-fixture.ts
    - src/core/ecc-skills.ts
    - src/core/install.ts
    - test/install.test.ts
    - test/update.test.ts

key-decisions:
  - "A session allocates a journal id per transaction; the first is the operation id, later ones carry a sequence suffix"
  - "Repair reads every journal belonging to an operation, so a multi-transaction operation is diagnosed as a whole"
  - "A fixture never consumes the caller session: one session owns one state root, and a fixture writes only inside its own throwaway root. It does assert the session is open before it touches the disk"
  - "An update refuses a target commit that is not already readable locally rather than fetching it during preflight"
  - "The aggregate plan records its fixture roots so revalidation reproduces the same digest instead of naming fresh temp directories"

patterns-established:
  - "A blocked plan is a returned plan with reasons, not a throw, so a preview can show why"

requirements-completed: [SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-06]

coverage:
  - id: D1
    description: "The aggregate plan enumerates every fixture, component and external step, and creates nothing"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/install.test.ts#the managed install operation plan enumerates every fixture and component before it mutates"
        status: pass
    human_judgment: false
  - id: D2
    description: "A reviewed plan re-read with its own fixture roots is digest-stable, and a plan naming fresh roots is a different plan"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/install.test.ts#a managed install plan re-read with its reviewed fixture roots is digest-stable"
        status: pass
    human_judgment: false
  - id: D3
    description: "No fixture calls mkdtemp; each creates the root its plan named, exclusively"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/install.test.ts#the managed install operation plan enumerates every fixture and component before it mutates"
        status: pass
      - kind: integration
        ref: "test/ecc-skills.test.ts#standalone and nested ECC applies write the same bytes, and the nested one takes no second lock"
        status: pass
    human_judgment: false
  - id: D4
    description: "One operation writes several journals without collision, and repair reads all of them"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/install.test.ts#a bootstrap apply journals durable intent and honest before/after evidence"
        status: pass
      - kind: integration
        ref: "test/transaction-crash.test.ts#an explicit repair finalizes a fully proven interruption"
        status: pass
    human_judgment: false
  - id: D5
    description: "The session is acquired before the first external child; a contended root runs nothing"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/install.test.ts#an active writer blocks the bootstrap before its first external child runs"
        status: pass
    human_judgment: false
  - id: D6
    description: "A wrapper operation refuses a missing or stale build artifact with a stable digest and no mutation"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "test/install.test.ts#a missing or stale build artifact blocks the bootstrap without touching anything"
        status: pass
      - kind: unit
        ref: "test/install.test.ts#the bootstrap preflight plan is byte-stable and names every external child"
        status: pass
    human_judgment: false
  - id: D7
    description: "An update binds the exact remote OID, refuses a dirty checkout, and refuses a target object it cannot inspect locally"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "test/update.test.ts#an update preflight binds the exact resolved remote commit without touching the checkout"
        status: pass
      - kind: integration
        ref: "test/update.test.ts#a dirty checkout blocks an update before any external step is declared runnable"
        status: pass
      - kind: integration
        ref: "test/update.test.ts#an update refuses a target source object it cannot inspect locally"
        status: pass
    human_judgment: false
  - id: D8
    description: "External evidence is durable and honest; a failed step never claims a rollback"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/install.test.ts#a failed external step reports what it observed and never claims a rollback"
        status: pass
    human_judgment: false
  - id: D9
    description: "Every component and fixture callee runs under the caller session with no nested lock"
    requirement: SAFE-03
    verification: []
    human_judgment: true
    rationale: "Structurally true and typechecked — applyManagedInstall wraps the whole body in one withComponentSession and passes that session to every callee, each of which is separately proven session-aware by its own suite. No test drives a full managed install end to end, because doing so would install GSD and ECC globally on the machine running the tests."
  - id: D10
    description: "The MCP protocol probe runs through the process adapter"
    requirement: SAFE-06
    verification: []
    human_judgment: true
    rationale: "Not built, unchanged from 01-08 and 01-11. openProtocolProcess does not exist; mcp-fixture.ts still spawns its JSON-RPC child directly and the exception is asserted in test/process.test.ts."

duration: 120min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 14: Ordered install caller and core bootstrap service

**One reviewed plan now covers every fixture, component and external step an install or update performs, and one session spans all of them — acquired before the first `git` or `npm` child, not after.**

## Performance

- **Duration:** ~120 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files created:** 1 · **modified:** 9

## Accomplishments

- **The journal-id collision is closed.** A session allocates a transaction id per transaction — the operation id for the first, a sequence suffix after that — so an operation that writes six components leaves six journals instead of overwriting one. `planWriterRepair` now reads every journal belonging to the operation, so a multi-transaction interruption is diagnosed as a whole; mixed states across journals correctly block rather than finalize.
- **`mkdtemp` is gone from all three fixtures.** Each has `create*FixtureOperationPlan`, which names the fixture root, every writable subpath, and each child's declared spec before anything exists. `runXFixture` revalidates that plan, asserts the authorizing session is open, and creates the root with a non-recursive `mkdir` — `EEXIST` gives the same exclusive-create guarantee `mkdtemp` did, with a location that was reviewed instead of discovered.
- **A child's output can no longer widen a fixture.** The ECC fixture's extraction step carries a `deferredArgument` naming the argument index and the proven root the archive must live in, the same shape 01-12 gave GSD compatibility.
- **ECC skill sync binds its sources at review time in both branches.** Its plan now embeds the fixture plan, so `<targetRoot>/<skill>/SKILL.md` is addressable before the fixture runs. That closes the gap 01-11 recorded and 01-12 carried forward.
- **`createManagedInstallOperationPlan` is the aggregate.** It holds every fixture plan, every component plan, every external installer spec and the environment names, and folds all their digests into one. `applyManagedInstall` revalidates it, acquires exactly one session, and hands that session to every fixture and component callee — all of which were made session-aware by 01-12 and 01-13.
- **The plan reuses its own fixture locations.** Without that, re-reading an aggregate would name fresh temp directories and never match its own digest; `fixtureRoots` makes revalidation exact, and a test pins that a plan built without them is correctly a different plan.
- **`src/core/bootstrap.ts` is where the wrapper work moves.** The plan verifies an existing build against its manifest (missing, malformed or stale all block), binds the package lock, and — for an update — resolves the exact remote OID with `git ls-remote`, then checks the object is already readable here. Fetching it would change the object store before review, so the plan refuses and says to run `git fetch`, offering no override.
- **Apply is one session and honest evidence.** The writer is taken before the first `git` or `npm` child; intent is journaled before that child runs; each step records its observed before and after state as `changed`, `unchanged` or `unknown`. A failure reports what moved and explicitly does not claim a rollback of a checkout, package set or global link.

## Verification

`node --test dist/test/install.test.js` → 9/9.
`node --test dist/test/update.test.js` → 8/8.
Full suite: 171 tests, 167 pass, 1 fail, 2 skipped, 1 todo.

The one failure is `preview.test.ts#install and update wrappers preview without mutating either shell family` — the SAFE-01 wrapper violation this plan builds the replacement for. The wrappers themselves are `01-16`'s files; until they call this service the test stays red, which is the honest state. The todo is the 01-15 CLI output seam.

## Deviations from Plan

- **Seven files outside `files_modified` changed.** The plan lists `install.ts`, `bootstrap.ts` and two test files, but its own body and `key_links` require `gsd-fixture.ts`, `ecc-fixture.ts` and `mcp-fixture.ts` ("before any fixture mkdir"), and the aggregate is impossible without the journal-id fix in `writer-lock.ts` and `transaction.ts` that 01-12 and 01-13 both recorded as this plan's prerequisite. `ecc-skills.ts` and `component-session.ts` follow from the fixture split.
- **A fixture does not consume the caller's session.** The plan says the same token passes into every fixture executor. A fixture writes only inside its own throwaway root — and the GSD fixture runs a Codex hook sync against a *fixture-local* state root, which is a different resource from the user's. One session owns one state root, so consuming the caller's there would be wrong. What the fixtures do instead is assert the authorizing session is open before touching the disk, which is the ordering property the requirement is actually about.
- **`npm link` is planned but not exercised.** The bootstrap tests use `skipLink: true`, because a passing test must not leave a real global link on the machine running it. The step is declared, ordered and observed like the others; only its execution is untested.

## Open Gaps

- **No end-to-end managed install test.** `applyManagedInstall` under one session is structurally verified and every callee is separately proven session-aware, but nothing drives the whole thing, because that would install GSD and ECC globally on the test machine. A container-backed integration test is the right home for it and does not exist yet.
- **`openProtocolProcess` is still unbuilt.** Unchanged from 01-08 and 01-11: the MCP fixture's JSON-RPC child is a long-lived bidirectional session the one-shot adapter cannot express. It remains a named, asserted exception.
- **The build-artifact manifest has no producer yet.** `inspectBuildArtifact` verifies `dist/build-artifact.json`; `scripts/build-artifact.mjs` writes it and is `01-16`'s file. Until then every real bootstrap plan blocks on a missing manifest — which is the correct fail-closed behaviour, but it means the wrappers cannot be switched over until 01-16 lands.

## Next Phase Readiness

`01-15` can wire the CLI output seam and the repair/support surfaces; `applyBootstrapOperation` and the aggregate plan are the shapes it renders. `01-16` writes the manifest producer and rewrites all four wrapper scripts to preview through `createBootstrapOperationPlan` and apply through `applyBootstrapOperation`, which is what finally turns `preview.test.ts` green.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
