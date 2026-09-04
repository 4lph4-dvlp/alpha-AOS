---
phase: 01-safe-operation-boundary
plan: 13
subsystem: infra
tags: [mutation-session, path-proof, reviewed-digest, mcp, skill-policy, isolation, update]

requires:
  - phase: 01-09
    provides: "MutationSession, writer lock and durable transaction journal"
  - phase: 01-10
    provides: "Strict native and operational document validation"
  - phase: 01-12
    provides: "component-session.ts: the shared plan/session contract"
provides:
  - "planMcpOperation / planClaudeSkillPolicyOperation / planOwnedSkillOperation: complete read-only plans"
  - "planIsolationManifestOperation / planIsolationRuntimeOperation / planIsolationClean / planCandidateStage"
  - "Every one of those applies takes an optional caller MutationSession"
  - "Isolated-runtime clean and candidate staging are journaled transactions rather than direct rm/rename"
affects: [01-14, 01-15]

actuals:
  tokens: 34000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A document carrying unrelated user configuration is bound by hash, never recorded as text"
    - "A removal is a journaled transaction with a snapshot, not an rm"

key-files:
  created: []
  modified:
    - src/core/mcp.ts
    - src/core/owned-skills.ts
    - src/core/skill-policy.ts
    - src/core/isolation.ts
    - src/core/update.ts
    - test/mcp.test.ts
    - test/skill-policy.test.ts
    - test/isolation.test.ts
    - test/update.test.ts

key-decisions:
  - "Every one of the five modules imports component-session.ts rather than restating the contract, as 01-12 intended"
  - "A clean removes files through the transaction and then rmdirs only the directories the plan enumerated, so an entry that appeared meanwhile blocks with ENOTEMPTY"
  - "A runtime entry that is neither a plain file nor a directory refuses the clean: this tool removes only what it generated"
  - "Owned skills and the Claude policy gained a claudeHome override so both are testable without writing into the real home"
  - "writeCandidate returns the journal id, or null when the staged candidate is already byte-identical"

patterns-established:
  - "A plan records renderedHash, and a test asserts the plan does not serialize the document it hashed"

requirements-completed: [SAFE-02, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "Every mutation publishes a complete read-only plan that names its path roles and writes nothing"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/mcp.test.ts#the reviewed MCP plan names every path role and binds the rendered hash without emitting it"
        status: pass
      - kind: unit
        ref: "test/skill-policy.test.ts#the reviewed policy plan names its path roles and binds the rendered hash without emitting it"
        status: pass
      - kind: unit
        ref: "test/skill-policy.test.ts#the reviewed owned-skill plan binds the locked source and rendered hashes"
        status: pass
      - kind: unit
        ref: "test/isolation.test.ts#the reviewed isolation plans name their path roles and write nothing"
        status: pass
      - kind: unit
        ref: "test/update.test.ts#the reviewed candidate stage names its path roles and writes nothing"
        status: pass
    human_judgment: false
  - id: D2
    description: "A standalone apply acquires one writer after complete revalidation and releases it"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/skill-policy.test.ts#Claude skill policy is transactional and semantically idempotent"
        status: pass
      - kind: integration
        ref: "test/skill-policy.test.ts#standalone and nested owned-skill applies write the same bytes under one writer"
        status: pass
      - kind: integration
        ref: "test/update.test.ts#candidate staging journals the write, is idempotent, and releases its writer"
        status: pass
    human_judgment: false
  - id: D3
    description: "A nested apply consumes the caller's session, takes no second lock, and does not release the caller's writer"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/mcp.test.ts#a nested MCP apply consumes the caller session and takes no second writer lock"
        status: pass
      - kind: integration
        ref: "test/skill-policy.test.ts#a nested policy apply consumes the caller session and takes no second writer lock"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#nested isolation applies consume the caller session and take no second writer lock"
        status: pass
      - kind: integration
        ref: "test/update.test.ts#a nested candidate stage consumes the caller session and takes no second writer lock"
        status: pass
    human_judgment: false
  - id: D4
    description: "An active writer blocks these mutations while plans, status and doctor stay readable"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/mcp.test.ts#an active writer blocks an MCP apply while the plan stays readable"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#an active writer blocks isolation mutations while plans and doctor stay readable"
        status: pass
    human_judgment: false
  - id: D5
    description: "A plan that no longer matches a re-read refuses with zero mutations and an unchanged target"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/mcp.test.ts#an MCP plan reviewed before the native config changed refuses and writes nothing"
        status: pass
      - kind: integration
        ref: "test/skill-policy.test.ts#a policy plan reviewed before the settings changed refuses and keeps the later edit"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#an isolation plan reviewed before the runtime changed refuses and writes nothing"
        status: pass
      - kind: integration
        ref: "test/update.test.ts#a candidate plan reviewed before the staged file changed refuses and writes nothing"
        status: pass
    human_judgment: false
  - id: D6
    description: "A removal is journaled and snapshotted rather than deleted outright"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#a clean journals every removal instead of deleting the tree outright"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#a runtime marker is read strictly before a directory is removed"
        status: pass
    human_judgment: false
  - id: D7
    description: "Plans and results never serialize the documents they read"
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "test/mcp.test.ts#MCP plans never serialize rendered user config or credential values"
        status: pass
      - kind: unit
        ref: "test/skill-policy.test.ts#the reviewed policy plan names its path roles and binds the rendered hash without emitting it"
        status: pass
    human_judgment: false
  - id: D8
    description: "Unrelated user-owned configuration survives every managed write"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/mcp.test.ts#MCP renderers preserve unrelated config and use exact locked versions"
        status: pass
      - kind: integration
        ref: "test/skill-policy.test.ts#a nested policy apply consumes the caller session and takes no second writer lock"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#isolation init preserves existing project policy and writes through a transaction"
        status: pass
    human_judgment: false
  - id: D9
    description: "No later-phase isolation behaviour was introduced"
    requirement: SAFE-01
    verification: []
    human_judgment: true
    rationale: "Reviewed by diff: isolation.ts gained plan/session/transaction plumbing only. No project-pack selection, tree-off inheritance, sealed fallback, full uninstall or general repair appears, and sealed mode still fails closed through the same adapter path."

duration: 85min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 13: Session-aware MCP, skill, policy, isolation and update mutators

**Every remaining public mutation now publishes a complete read-only plan, revalidates it before it acquires anything, and runs under exactly one writer — the caller's when nested. The last two direct `rm`/`rename` paths are journaled transactions.**

## Performance

- **Duration:** ~85 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- **All five modules import `component-session.ts`** rather than restating the contract, which is what 01-12 created it for. Seven new plan functions, seven applies taking an optional caller session, one contract.
- **`planMcpOperation` declares what a native sync actually reaches for**: the config file, the state roles, this package's own root and the proxy entrypoint a rendered `firecrawl` command names — plus, for Pi, the bridge manifest it checks. `mcpProxyEntrypoint()` exists now so that path is named once and proven rather than computed inline in a renderer.
- **Documents carrying unrelated user configuration are bound by hash, not by text.** A native MCP config and a Claude settings file both hold things this tool does not own, so the plan records `renderedHash` and the digest binds that. A test asserts the serialized plan contains neither `mcpServers` nor a settings value.
- **A clean is now a journaled removal.** `planIsolationClean` walks the generated runtime, proves every file, and refuses an entry that is neither a plain file nor a directory — this tool removes only what it generated. Apply snapshots and journals every removal through the transaction, then `rmdir`s only the directories the plan enumerated, deepest first, so anything that appeared meanwhile blocks with `ENOTEMPTY` instead of being swept away. All five existing marker-refusal cases still refuse, unchanged.
- **Candidate staging goes through the transaction.** `writeCandidate` no longer renames a temp file over whatever was there; the previous candidate is snapshotted, the write is journaled, and an already-identical candidate returns `null` instead of rewriting.
- **Owned skills and the Claude policy gained a `claudeHome` override**, so both paths are exercised against a fixture home. Before this, `applyOwnedSkillSync` could only be tested by writing into the developer's real `~/.claude`.

## Verification

`node --test dist/test/mcp.test.js` → 16/16.
`node --test dist/test/skill-policy.test.js dist/test/install.test.js` → 10/10.
`node --test dist/test/isolation.test.js dist/test/update.test.js` → 25/25.
Full suite: 161 tests, 157 pass, 1 fail, 2 skipped, 1 todo.

The one failure is `preview.test.ts#install and update wrappers preview without mutating either shell family` — the SAFE-01 wrapper violation already recorded as a phase blocker, failing identically before this plan. The todo is the 01-15 CLI output seam.

## Deviations from Plan

- **`applyOwnedSkillSync` gained a sixth parameter and `planOwnedSkillSync` a sixth.** The plan describes exact API preservation; both are optional and every existing call site is unchanged, but the signatures are wider than they were.
- **Owned-skill tests live in `test/skill-policy.test.ts`.** The plan groups owned skills and the Claude policy in one task and names only that test file, so the tests went there rather than into a new file the plan does not list.
- **`writeCandidate` returns `string | null` instead of `void`.** A caller needs the journal id to report or roll back the stage, and `null` distinguishes "already staged" from "written". The one existing call site ignores the value.

## Open Gaps

- **`cleanIsolationRuntime` still ends with real `rmdir` calls that the journal does not record.** The files are journaled and snapshotted, so an interruption between the transaction and the last `rmdir` leaves empty directories with a completed journal — recoverable state, but the directory removals themselves are not replayable. Making directory removal a journaled intent belongs with the transaction, not with this plan.
- **The 01-12 journal-id constraint now has six more callees.** `applyFileTransaction` derives its journal id from `session.operationId`, so any caller that runs two of these applies under one session collides on the same journal path. This is 01-14's first problem, and it is now unavoidable there rather than theoretical.

## Next Phase Readiness

`01-14` can wire managed install and wrapper bootstrap to all of these: every callee it needs is session-aware, and each exposes a plan function the aggregate plan can embed. It must resolve the journal-id constraint before it aggregates more than one apply under a session, and it still inherits the two gaps from `01-11` (`openProtocolProcess`, the fixture plan/execute split) and the ECC fixture-path gap from `01-12`.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
