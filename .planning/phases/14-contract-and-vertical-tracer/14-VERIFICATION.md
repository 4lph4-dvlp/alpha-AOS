---
phase: 14-contract-and-vertical-tracer
verified: 2026-09-30T10:44:01Z
status: gaps_found
score: 50/53 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/14-contract-and-vertical-tracer/14-01-PLAN.md
  - .planning/phases/14-contract-and-vertical-tracer/14-01-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-02-PLAN.md
  - .planning/phases/14-contract-and-vertical-tracer/14-02-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-03-PLAN.md
  - .planning/phases/14-contract-and-vertical-tracer/14-03-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-04-PLAN.md
  - .planning/phases/14-contract-and-vertical-tracer/14-04-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-05-PLAN.md
  - .planning/phases/14-contract-and-vertical-tracer/14-05-SUMMARY.md
  - .planning/phases/14-contract-and-vertical-tracer/14-06-PLAN.md
  - .planning/phases/14-contract-and-vertical-tracer/14-06-SUMMARY.md
  - schemas/task-contract.schema.json
  - schemas/task-executor-result.schema.json
  - schemas/task-receipt.schema.json
  - schemas/task-review.schema.json
  - src/adapters/task-agent-launch.ts
  - src/adapters/task-agents.ts
  - src/adapters/task-claude.ts
  - src/adapters/task-codex.ts
  - src/cli.ts
  - src/core/task-check.ts
  - src/core/task-contract.ts
  - src/core/task-effects.ts
  - src/core/task-gsd.ts
  - src/core/task-run.ts
  - src/core/task-verdict.ts
  - src/core/validation.ts
  - src/format.ts
  - test/helpers/task-fixture.ts
  - test/task-tracer.integration.ts
covered_digest: "v1:sha256:664aec15d223fd586931c7e8be2edde6eff4cb0a3cd3946ba6414be5cef58ebb"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "ROADMAP SC3 / 14-06 truth 6: A real end-to-end task reaches accepted only after its check and fresh reviewer both evaluate the same artifact digest (real Codex GSD quick controller + fresh Claude reviewer session through the CLI)."
    status: failed
    reason: "The only live run (munx7h9w-b9ec114f) ended `blocked` with `new-authority-required: local-commit requiring write access to .git`; it never reached measurement or review. No real run has ever produced an `accepted` verdict on this host. Root cause independently reproduced by the verifier: `codex sandbox -c sandbox_mode=\"workspace-write\" -- git add f.txt` in a scratch repo fails with `.git/index.lock: Permission denied` (codex-cli 0.158.0). User decision D deferred the `.git` write authority; the later-phase ROADMAP text does not yet name this re-run."
    artifacts:
      - path: "test/task-tracer.integration.ts"
        issue: "Live accept test exists and is strict (no skip, no relaxed assertion) but is red on this host: `task start exited 1 with status blocked`."
      - path: "src/adapters/task-codex.ts"
        issue: "Controller launch is fixed to `--sandbox workspace-write`, which keeps `.git` read-only, so GSD quick can never make its required `docs(quick-<id>)` commit and `verifyGsdEvidence` can never be satisfied for a real run."
    missing:
      - "A controller authority model under which GSD quick can write `.git` (exec-policy allow rule, sealed/container adapter, or an equivalent reviewed design) without breaking T-14-23..28/T-14-34/T-14-41"
      - "A green run of `node scripts/run-tests.mjs --test-name-pattern=\"accept a correct\" --files dist/test/task-tracer.integration.js` recording exact versions, reviewer session == requested UUID != executor session, verified GSD evidence and one artifact digest"
  - truth: "14-06 truth 7: A separate real run whose contract differs only by a neutral id and a planted held-out expectation is `rejected` by measurement while its record shows executor claim `completed` and exit code 0."
    status: failed
    reason: "Task 3 was never executed and its test was never written; zero live turns. Same root cause as the SC3 gap (precondition is an accepted real run). Note: ROADMAP SC4 itself is proven offline — this gap is the plan's live form only."
    artifacts:
      - path: "test/task-tracer.integration.ts"
        issue: "No seeded-defect test exists; `seededDefectContract` in test/helpers/task-fixture.ts is unused."
    missing:
      - "Live seeded-defect test in test/task-tracer.integration.ts and a recorded red-by-measurement run"
  - truth: "14-06 truth 8: That real run's review report, substituted onto a one-byte-changed copy of its artifact, is assessed stale and never produces `accepted`."
    status: failed
    reason: "Not written, not run (same root cause). ROADMAP SC5 itself is proven offline by fixture substitution tests — this gap is the plan's live form with a real Claude report."
    artifacts:
      - path: "test/task-tracer.integration.ts"
        issue: "No live stale-review substitution test exists."
    missing:
      - "Live stale-review substitution test using a real reviewer report"
---

# Phase 14: Contract and Vertical Tracer Verification Report

**Phase Goal:** An explicitly opted-in, approved task can travel through GSD-governed implementation, one measured criterion and an independent fresh reviewer session to a trustworthy accepted/rejected verdict; ordinary GSD interaction stays unchanged.
**Verified:** 2026-09-30T10:44:01Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Verdict in one paragraph

Everything that can be proven with the production pipeline and test-double agent ports is real, wired and green: contract digest/preview/approval, one-shot consumption, drift refusal naming changed fields, measurement on an exact snapshot, the verdict reducer that ignores executor claims and exit codes, stale-review/stale-artifact refusal, decision logs, GSD evidence reading, and the effect audit that pauses on new authority. The verifier re-ran the eight task suites itself: **143 pass / 0 fail / 0 skipped**. What is **not** achieved is the goal's central claim on a real host: no real Codex-controlled GSD quick run has ever reached measurement, a fresh Claude review, or any verdict. The one live run stopped `blocked` because Codex `workspace-write` keeps `.git` read-only, which the verifier reproduced independently. ROADMAP SC3 explicitly requires a *real* end-to-end accepted run, so it is FAILED. That makes the phase `gaps_found`, even though the user consciously chose to defer the fix (decision D).

## Goal Achievement

### ROADMAP Success Criteria (the contract)

| # | Success criterion | Status | Evidence |
|---|---|---|---|
| SC1 | An ordinary GSD conversation never starts the supervisor; explicit request or approved offer binds autopilot to one contract; ending it does not enable the next task | ✓ VERIFIED | `startTask(` has exactly one non-test call site, `src/cli.ts:1735`, inside `task start ... --apply` (grep). Tests pass: "ordinary gsd-context, status and project plan commands never create a task run", "startTask is called only by the task start branch and no shipped skill starts a task", "task start --apply with a consumed approval is refused and a foreign digest starts nothing", "contracts differing only in id never share an approval". `startTask` refuses `approval-consumed` (task-run.ts:720-727). |
| SC2 | Changing goal, effect permission or role after approval makes `start` refuse the old digest; delegated routine decisions stay auditable; new authority pauses for approval | ✓ VERIFIED | "each changed authority field is named in the drift refusal" (allowedEffects, agentPolicy.reviewer, criterion, limit), "task start with the old digest after the goal was edited names the changed field...". Decisions: "a valid decision log is copied into the run record", "task report shows consent, decisions...". Pause: "a needs-authority claim ends the run blocked without a review" (reviewer.calls == 0), "a write outside the approved roots ends the run blocked". The live run also paused correctly on new authority and recorded 5 valid decisions (per 14-VALIDATION.md; scratch state not retained, so not independently re-read). |
| SC3 | A **real** end-to-end task reaches accepted only after its check and fresh reviewer both evaluate the same artifact digest | ✗ FAILED | The code path exists and the offline fixture reaches `accepted` ("an approved contract with a correct implementation and a passing review is accepted"). But the criterion says *real*, and the only real run (munx7h9w-b9ec114f) ended `blocked` before measurement or review. The live test `test/task-tracer.integration.ts` is red. The verifier reproduced the root cause: `git add` under `codex sandbox` with workspace-write gives `.git/index.lock: Permission denied`. |
| SC4 | A failing or unknown required check gives rejected/unknown even if the executor claims success or exits 0 | ✓ VERIFIED (offline) | "an executor that claims success with wrong output is rejected by measurement" asserts `claim.status === "completed"`, `exitCode === 0`, overall `rejected`. The measurement genuinely runs the off-by-one Node entry on a snapshot. `reduceTaskVerdict` takes no claim or exit-code input (task-verdict.ts:204-298). Unknown paths: "an unavailable measurement is unknown even with a review pass...", "a measured pass with an abstaining review is unknown". The live form of this (14-06 truth 7) is a separate gap. |
| SC5 | A test substitutes stale review output and observes refusal before GSD completion | ✓ VERIFIED (offline) | "a review bound to another artifact digest is refused as stale" (refusal `stale-review`, never accepted, no pass rows) and "a review bound to another request, contract, artifact or session is stale and refused". "a project file changed before the review returns is refused as stale-artifact". "Before GSD completion" is read as 14-06-PLAN.md:276 defines it: refused before any accepted verdict is recorded, with GSD-gate wiring owned by GSD-04 (Phase 17). The live form (14-06 truth 8) is a separate gap. |

### Plan must-have truths

Every truth below is backed by a named test that ran green in the verifier's own run of the eight task suites (143/143).

| Plan | Truths | Status | Evidence (named tests / code) |
|---|---|---|---|
| 14-01 | 8/8 | ✓ VERIFIED | The digest and `reviewedDigest(TASK_CONTRACT_DIGEST_KIND` are at task-contract.ts:466. Tests: "task preview prints the reviewable contract and writes nothing", "preview writes nothing under the state root", "task approve with a digest that is not the current digest is refused", "start refuses an unapproved contract and a consumed approval", the accept test, the claim-success rejection test, the stale-artifact-digest test, "task report prints one verdict row per criterion", "contracts differing only in id never share an approval", "a missing, empty or criterion-less contract is refused". |
| 14-02 | 9/9 | ✓ VERIFIED | Drift names fields; "changed content cannot reuse an approved revision number"; the permutation, spelling and NFD tests; the wall-time 1/1440, fractional and absent tests; allowed-root and entry boundary tests; the gsd-quick-without-local-commit and hermes-controller tests; "a contract carrying a credential environment value is refused by path and variable name only"; "a project root retargeted after approval is refused as root-changed". Code: `assertControllerRole(` at :360 and `canonicalizeWithMissingTail(` at :608. |
| 14-03 | 9/9 | ✓ VERIFIED | Snapshot tests ("the snapshot holds exactly the manifest files and re-collects to the same digest"), the unavailable-cause tests (entry-missing, timeout, output-capped), the substitute tests, the D-14 confirmed and fabricated reproduction tests, the stale tests, the decision-log copied/absent/invalid tests, the adjacency, empty and ordering verdict tests. Wiring: `measureTaskCriterion(`, `confirmReviewerReproduction(`, `reduceTaskVerdict(` and `assessTaskReview` are all called in `startTask`. |
| 14-04 | 7/7 | ✓ VERIFIED (offline) | "the codex controller argument vector is fixed and never bypasses the sandbox", "the codex child environment declares names only", the shim resolution and unrecognized-shim tests, "a capped codex event stream is not-retained", "the claude reviewer argument vector is fixed, fresh and read-only", "two reviews run in two fresh sessions", "the review prompt carries the binding, every criterion input and expectation", "the bootstrap pair codex/codex/claude is supported with both exact versions", "every other role assignment is unsupported". The no-spawn guard in test/process.test.ts:599-613 enumerates task-agent-launch/agents/codex/claude. The live Codex launch was exercised once, but the Claude reviewer adapter has never launched against a real run. |
| 14-05 | 8/8 | ✓ VERIFIED | Prompt binding and holdout tests; "a dirty project is refused before the approval is consumed, and the same approval starts once it is committed"; "a project GSD reports without a roadmap is refused as gsd-not-ready"; the GSD evidence tests (deleted SUMMARY, missing STATE row, missing docs commit); "a correct implementation without GSD quick evidence is not accepted and .planning stays byte-identical"; the blocked-authority tests; "an approved dependency change runs the read-only pack checkpoint and never approves a pack"; "a run whose approved wall time elapses before review is stopped without a review"; "runGitRead refuses every git subcommand that could write". |
| 14-06 | 5/8 | ✗ 3 FAILED | Truths 1-5 are verified by the 19 task-cli tests (readiness preview with an empty PATH, the refusals, the drift test, the extended report). Truth 6 is merged into SC3 (FAILED). Truths 7 and 8 FAILED: not written, not run. |

**Score:** 50/53 truths verified (5 ROADMAP SC + 48 plan truths after merging 14-06 truth 6 into SC3). 0 present-but-behavior-unverified.

### Prohibitions (all test-tier)

| Source | Prohibition | Disposition | Enforcement evidence |
|---|---|---|---|
| 14-03 | Controller decisions cannot change criterion input/expectation or widen roots/effects | ✓ enforced | "a decision that tries to carry an input or expectation is refused as invalid", "a substitute outside the allowed roots or for a present contract entry is ignored" |
| 14-03 | No `accepted` without measured pass + reviewer pass on the same artifact digest | ✓ enforced | Claim-success rejection test, "an unsatisfied precondition or a refusal keeps an all-pass run from being accepted", the stale tests |
| 14-05 | Supervisor never writes GSD lifecycle state | ✓ enforced | ".planning stays byte-identical" test, "runGitRead refuses every git subcommand that could write" |
| 14-06 | Supervisor only starts from an explicit `task start --apply` with its own unconsumed digest | ✓ enforced | Source-scan test, the ordinary-commands test, the consumed/foreign digest test |

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| schemas/task-contract.schema.json (116 lines) | ✓ VERIFIED | closed schema |
| schemas/task-receipt.schema.json (368) | ✓ VERIFIED | includes task-approval, stale-artifact, gsd-evidence precondition |
| schemas/task-review.schema.json (60) | ✓ VERIFIED | artifactDigest bound |
| schemas/task-executor-result.schema.json (38) | ✓ VERIFIED | needs-authority status |
| src/core/task-contract.ts (766) | ✓ VERIFIED | wired from cli.ts and task-run.ts |
| src/core/task-run.ts (1019) | ✓ VERIFIED | full pipeline read, lines 715-1019 |
| src/core/task-check.ts (581), task-verdict.ts (299) | ✓ VERIFIED | pure reducer, no claim input |
| src/core/task-gsd.ts (406), task-effects.ts (286) | ✓ VERIFIED | wired in startTask |
| src/adapters/task-{agents,agent-launch,codex,claude}.ts | ✓ VERIFIED | `nativeTaskPorts()` used at cli.ts:1740 |
| test/task-tracer.integration.ts (172) | ⚠️ PARTIAL | Only the accept test exists, and it is red on this host. The defect and stale live tests are absent. |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| task-run.ts | task-contract.ts | `assertTaskStartable(` (:717), before any run record | ✓ WIRED |
| task-contract.ts | component-session.ts | `reviewedDigest(TASK_CONTRACT_DIGEST_KIND` (:466) | ✓ WIRED |
| task-run.ts | transaction.ts | `applyFileTransaction(` (:406) | ✓ WIRED |
| cli.ts | task-contract.ts | `previewTaskContract(`/`approveTaskContract(` (:1728, :1763, :1771) | ✓ WIRED |
| task-run.ts | task-verdict.ts / task-check.ts | `reduceTaskVerdict(` :979, `measureTaskCriterion(` :906 | ✓ WIRED |
| task-run.ts | task-gsd.ts | `verifyGsdEvidence(` :872, `buildGsdControllerPrompt` :828 | ✓ WIRED |
| cli.ts | task-run.ts / task-agents.ts | `startTask(` :1735 with `nativeTaskPorts()` :1740; `probeTaskAgentPair(` :466 | ✓ WIRED |
| task-tracer.integration.ts | dist/src/cli.js | scratch `ALPHA_AOS_STATE_DIR` | ✓ WIRED (but red) |
| Real Codex controller | `.git` (GSD quick commit) | Codex workspace-write sandbox | ✗ NOT WIRED on this host (sandbox denies `.git` writes) |

### Data-Flow Trace (Level 4)

| Value | Source | Real data | Status |
|---|---|---|---|
| verdict.overall | `reduceTaskVerdict` over snapshot measurements plus the bound review assessment plus preconditions | Yes: real Node entry execution on a snapshot copy | ✓ FLOWING (offline) |
| executor claim | `-o` last-message file, schema-validated | Recorded only; not an input to the verdict | ✓ correct isolation |
| gsd-evidence precondition | `verifyGsdEvidence` git reads plus bounded `.planning` reads | Yes | ✓ FLOWING; unsatisfiable for real runs on this host |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Build | `npm run build` | tsc plus artifact manifest, 152 inputs / 302 outputs | ✓ PASS |
| Eight task suites | `node scripts/run-tests.mjs --files dist/test/task-{run,contract,check,verdict,agents,gsd,effects,cli}.test.js` | tests 143, pass 143, fail 0, skipped 0, 70 s | ✓ PASS |
| CLI surface | `node dist/src/cli.js --help` | lists task preview/approve/start/report; `task bogus` names the four verbs | ✓ PASS |
| Root cause of live block | scratch repo: `codex sandbox -c 'sandbox_mode="workspace-write"' -- git add f.txt` | `fatal: Unable to create '.../.git/index.lock': Permission denied`; f.txt stays untracked | ✓ reproduced (confirms the gap is environmental and security-boundary related, not an alpha-AOS bug) |
| Live accept tracer | not re-run (spends model turns; user decision D; outcome deterministic per the reproduction above) | recorded red in 14-VALIDATION.md | ✗ FAIL (recorded) |

Full `npm test` was not re-run by the verifier. The orchestrator reported 1095 tests, 1085 pass, 0 fail, 10 skipped.

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by any Phase 14 plan. SKIPPED.

### Requirements Coverage

Every ID declared across the 14-01..06 `requirements:` fields is one of the 8 phase IDs, and all 8 appear. No orphans.

| Requirement | Source plans | Status | Evidence |
|---|---|---|---|
| CON-01 | 01, 02, 06 | ✓ SATISFIED | `formatTaskContractPreview` shows the goal, root, workflow, roots, effects, criteria, three roles, the wall-time limit and the approval state. The approve step checks the exact digest. |
| CON-02 | 03, 05 | ✓ SATISFIED | The decision log is ingested and validated, and the report shows decisions with rationale. |
| CON-03 | 02, 06 | ✓ SATISFIED | Drift names the changed fields, and revision reuse is refused. |
| AUTO-01 | 01, 06 | ✓ SATISFIED | The only entry is an explicit `task start --apply` with the task's own digest. No skill starts a task. |
| AUTO-02 | 02, 05, 06 | ✓ SATISFIED in code | Consent, scope, authority and duration appear in the preview, readiness and report. The effect audit and needs-authority claim block the run, with a wall-time stop. The live run paused on new authority as designed. REQUIREMENTS.md leaves the checkbox open pending an accepted live run. The verifier finds no code gap, but consent inside an accepted real run is unobserved. |
| AUTO-03 | 01, 06 | ✓ SATISFIED | `approval-consumed`, and a foreign digest starts nothing |
| RUN-01 | 01, 03, 04, 05, 06 | ✗ BLOCKED | No user can observe the production path through to a verdict on this host. Every real run stops `blocked` at the `.git` write. |
| REV-01 | 01, 03, 04, 06 | ⚠️ PARTIAL | Per-criterion verdict and unknown logic is correct and tested with real measurement. A real reviewer has never produced a verdict, so users get no REV-01 verdict through the real path on this host (same root cause). |

The SUMMARY claims for 14-01, 14-03 and 14-04 list RUN-01 and REV-01 under `requirements-completed`. That conflicts with 14-06-SUMMARY and REQUIREMENTS.md, which correctly leave them open. The earlier SUMMARY claims should not be trusted.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (all 15 phase-modified source/test files) | — | TBD/FIXME/XXX | none found | — |
| src/format.ts | 166, 240 | "unimplemented" | ℹ️ Info | Pre-existing capability-pack wording, unrelated to Phase 14 |
| .planning/REQUIREMENTS.md | 100 | Traceability row still `Planned` for Phase 14 | ℹ️ Info | Bookkeeping only |
| 14-VALIDATION.md | frontmatter | `status: draft`, `nyquist_compliant: false` | ℹ️ Info | Consistent with the NOT PROVEN live rows |

### Deferred Items (Step 9b)

The gap is recorded as deferred in STATE.md ("Deferred to Phase 16/17 or sealed/container adapter", user decision D). It was **not** moved to `deferred:` in this report. The rule is to defer only when a later phase's ROADMAP goal or success criteria clearly own the item, and none names the `.git` write authority or the re-run of 14-06-02/03. There are partial overlaps:
- Phase 16 SC2 (real native invocation per role) and SC4 (fresh reviewer session)
- Phase 17 SC1 (a real installed-GSD run whose STATE/ROADMAP match the work, which implicitly needs controller commits)
- Phase 19 ("deliberately broken implementation trial")

These are spread across phases and tangential, so the item stays a gap.

**To make this a legitimate deferral:** add an explicit success criterion to Phase 16 or 17 in ROADMAP.md, for example "the controller can make GSD quick's commits under its sandbox, and the Phase 14 live tracer (14-06-02 accept, 14-06-03 defect reject and stale refusal) passes". A re-verification would then classify these three gaps as `deferred`.

**Alternatively, if the user accepts Phase 14 as complete without the live proof**, add to this file's frontmatter:

```yaml
overrides:
  - must_have: "A real end-to-end task reaches accepted only after its check and fresh reviewer both evaluate the same artifact digest"
    reason: "User decision D (14-06): Codex workspace-write keeps .git read-only on this host; keep the security boundary and defer .git write authority to Phase 16/17 or a sealed/container adapter. Offline pipeline proven 143/143."
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
```

(Similar entries would be needed for 14-06 truths 7 and 8.)

### Human Verification Required

None beyond the gap. The missing evidence is a live run, not a judgment call.

### Gaps Summary

All three gaps share **one root cause**: the bootstrap controller (Codex 0.158.0, `--sandbox workspace-write`) cannot write the project `.git` on this Windows host. GSD quick therefore cannot commit, `verifyGsdEvidence` is unsatisfiable for any real run, and every real run ends `blocked` before measurement and review. Consequences:
- SC3, the one success criterion that explicitly demands a *real* end-to-end accepted run, is unmet.
- The plan's live defect-rejection and live stale-review proofs (14-06 truths 7 and 8) were never written.
- RUN-01 is blocked, and REV-01 is only partially met for users.

The rest of the phase is sound, and the verifier re-proved it independently:
- ordinary interaction untouched (SC1)
- drift and authority pause (SC2)
- claim-independent rejection (SC4)
- stale refusal (SC5)
- every offline must-have

This was a conscious security-boundary choice by the user, not a defect in alpha-AOS code. Closing it needs one focused plan: a reviewed `.git` write authority model for the controller, then re-running 14-06-02 and writing and running 14-06-03. The alternative is an explicit override or roadmap-backed deferral, as shown above.

---

_Verified: 2026-09-30T10:44:01Z_
_Verifier: Claude (gsd-verifier)_
