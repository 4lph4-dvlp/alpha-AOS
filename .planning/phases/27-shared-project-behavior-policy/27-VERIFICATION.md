---
phase: "27-shared-project-behavior-policy"
verified: "2026-11-03T15:14:31Z"
status: "human_needed"
score: "14/15 must-haves verified"
covered_files: [
  ".planning/phases/27-shared-project-behavior-policy/27-01-PLAN.md",
  ".planning/phases/27-shared-project-behavior-policy/27-01-SUMMARY.md",
  ".planning/phases/27-shared-project-behavior-policy/27-02-PLAN.md",
  ".planning/phases/27-shared-project-behavior-policy/27-02-SUMMARY.md",
  ".planning/phases/27-shared-project-behavior-policy/27-03-PLAN.md",
  ".planning/phases/27-shared-project-behavior-policy/27-03-SUMMARY.md",
  ".planning/phases/27-shared-project-behavior-policy/27-04-PLAN.md",
  ".planning/phases/27-shared-project-behavior-policy/27-04-SUMMARY.md",
  ".planning/phases/27-shared-project-behavior-policy/27-05-PLAN.md",
  ".planning/phases/27-shared-project-behavior-policy/27-05-SUMMARY.md",
  "README.md",
  "catalog/stack.lock.json",
  "docs/task-entry-proof-index.json",
  "docs/task-runtime-controls.md",
  "package.json",
  "schemas/behavior-policy.schema.json",
  "schemas/transaction-journal.schema.json",
  "scripts/verify-task-entry-proof.mjs",
  "skills/alpha-aos-task/SKILL.md",
  "src/cli.ts",
  "src/core/behavior-policy.ts",
  "src/core/command-jobs.ts",
  "src/core/evidence.ts",
  "src/core/owned-skills.ts",
  "src/core/path-boundary.ts",
  "src/core/transaction.ts",
  "src/core/tree-policy.ts",
  "src/core/validation.ts",
  "src/core/writer-lock.ts",
  "src/format.ts",
  "test/behavior-policy.test.ts",
  "test/efficient-wait-cli.test.ts",
  "test/owned-skills.test.ts",
  "test/path-boundary.test.ts",
  "test/project-mode-cli.test.ts",
  "test/project-mode-concurrency.test.ts",
  "test/project-mode-routing.test.ts",
  "test/rollback-cli-verification.test.ts",
  "test/rollback.test.ts",
  "test/task-wait.test.ts",
  "test/transaction-crash.test.ts",
  "test/transaction.test.ts"
]
covered_digest: "v3:sha256:47ecef1f83ecec2b38f98ab3d18e7a992e9c71bfd09c48129d97f4b25635fca5"
behavior_unverified: 1
overrides_applied: 0
re_verification: {
  "previous_status": "passed",
  "previous_score": "15/15 must-haves verified",
  "mode": "fresh goal verification; previous report has no gaps section",
  "gaps_closed": [],
  "gaps_remaining": [],
  "regressions": []
}
must_haves: {
  "truths": [
    "A project with no policy resolves to strict without creating configuration or GSD files; only the mode, never a selected style, is a project preference.",
    "A user can request a mode change in natural language or CLI before GSD initialization, and a second harness resolves the same project setting without repeating the instruction.",
    "A user can inspect effective mode, canonical root and source/revision; an existing session re-reads a later change at its next task intake.",
    "Mode mutations are previewable, root-bounded, snapshotted and rollback-aware, preserve unrelated settings, and reject stale reviewed input where applicable.",
    "Invalid/unreadable policy and wrong-root conditions produce actionable errors instead of silent flexible or cross-project fallback.",
    "Canonical root selection uses the shared ladder and preserves declaration/Git/worktree/tree-off boundaries.",
    "The closed version-1 policy accepts only strict/flexible mode, rejects duplicate decoded keys and extra fields without exposing contents.",
    "Reviewed previews distinguish missing, same logical mode, raw-byte changes and replaced filesystem roots without writes.",
    "The CLI rejects invalid mode grammar, extra operands, duplicate/unknown flags and mutation flags on queries.",
    "Common rollback validates additive policy metadata and restores exact bytes or absence without sweeping parents/siblings; drift/LIFO/root/snapshot errors refuse safely.",
    "A valid same-mode apply is a zero-write no-op with operationId:null.",
    "Independent writers and rollback/apply share canonical target ownership before the state session, yielding one winner and stale retries.",
    "Inside-lock revision/root/path checks reject review/apply retargeting and serialize rollback races.",
    "The actual owned skill renders with locked source/target integrity to all five fixture homes.",
    "Mixed policy/task requests apply only the explicit preference first and resume fresh intake without changing the active style/contract or granting execution."
  ],
  "artifacts": [
    {
      "path": "src/core/behavior-policy.ts",
      "provides": "applyProjectModeChange and null-ID current result"
    },
    {
      "path": "schemas/behavior-policy.schema.json",
      "provides": "Closed policy schema"
    },
    {
      "path": "test/project-mode-cli.test.ts",
      "provides": "Full preview/apply/rollback/no-op CLI lifecycle"
    },
    {
      "path": "test/behavior-policy.test.ts",
      "provides": "Root/schema/failure matrix"
    },
    {
      "path": "src/core/path-boundary.ts",
      "provides": "Exact JSON-safe device/inode identity and precise rechecks"
    },
    {
      "path": "src/core/writer-lock.ts",
      "provides": "Canonical-project policy target ownership and finite contention"
    },
    {
      "path": "src/core/transaction.ts",
      "provides": "Validated policy operation metadata and common safe rollback"
    },
    {
      "path": "schemas/transaction-journal.schema.json",
      "provides": "Optional closed policyOperation metadata contract"
    },
    {
      "path": "test/rollback-cli-verification.test.ts",
      "provides": "Safe text/JSON and no-parent-sweep assertions"
    },
    {
      "path": "test/project-mode-concurrency.test.ts",
      "provides": "Independent process/state-root/alias race and stale retry proof"
    },
    {
      "path": "skills/alpha-aos-task/SKILL.md",
      "provides": "Early explicit policy request routing and fresh intake read"
    },
    {
      "path": "catalog/stack.lock.json",
      "provides": "Recomputed source and five rendered hashes"
    },
    {
      "path": "test/project-mode-routing.test.ts",
      "provides": "Real five-target deployment and shared policy fixture"
    },
    {
      "path": ".planning/phases/27-shared-project-behavior-policy/27-NATIVE-EVIDENCE.md",
      "provides": "Separate actual host receipts and explicit unavailable statuses"
    }
  ],
  "key_links": [
    {
      "from": "src/cli.ts",
      "to": "src/core/behavior-policy.ts",
      "via": "Early project mode branch before pack command allowlist"
    },
    {
      "from": "src/core/behavior-policy.ts",
      "to": "src/core/evidence.ts",
      "via": "resolveCanonicalRoot with separate cwd and explicit-target inputs"
    },
    {
      "from": "src/core/behavior-policy.ts",
      "to": "src/core/validation.ts",
      "via": "parseManagedDocument and validateAgainstSchema on the original object"
    },
    {
      "from": "src/core/behavior-policy.ts",
      "to": "src/core/path-boundary.ts",
      "via": "Exact root identity in reviewed digest and immediate path recheck"
    },
    {
      "from": "src/cli.ts",
      "to": "src/core/behavior-policy.ts",
      "via": "project mode set strict|flexible read-only plan"
    },
    {
      "from": "src/core/transaction.ts",
      "to": "src/core/writer-lock.ts",
      "via": "Target ownership then matching state session, reused by failure recovery"
    },
    {
      "from": "src/core/transaction.ts",
      "to": "schemas/transaction-journal.schema.json",
      "via": "Strict validated load at rollback/list consumption boundaries"
    },
    {
      "from": "src/cli.ts",
      "to": "src/core/transaction.ts",
      "via": "Existing rollback operation-id preview/apply route"
    },
    {
      "from": "src/core/behavior-policy.ts",
      "to": "src/core/writer-lock.ts",
      "via": "acquirePolicyTargetSession before state session and fresh recomputation"
    },
    {
      "from": "src/core/behavior-policy.ts",
      "to": "src/core/transaction.ts",
      "via": "applyFileTransaction with policy metadata and held matching context"
    },
    {
      "from": "src/cli.ts",
      "to": "src/core/behavior-policy.ts",
      "via": "Exact reviewed setting digest plus --apply"
    },
    {
      "from": "skills/alpha-aos-task/SKILL.md",
      "to": "src/cli.ts",
      "via": "Common project mode query/preview/apply commands"
    },
    {
      "from": "catalog/stack.lock.json",
      "to": "src/core/owned-skills.ts",
      "via": "Real renderOwnedSkill and plan/apply source/target integrity checks"
    }
  ],
  "prohibitions": [
    {
      "statement": "MUST NOT treat flexible preference as execution consent, a style default, or permission to alter an active task.",
      "verification": "judgment",
      "status": "unverified"
    },
    {
      "statement": "MUST NOT report source or fixture proof as successful native five-host policy routing.",
      "verification": "judgment",
      "status": "resolved-by-existing-human-P2"
    }
  ]
}
decision_coverage: {
  "skipped": false,
  "blocking": false,
  "total": 20,
  "honored": 20,
  "not_honored": [],
  "message": "All trackable CONTEXT.md decisions are honored by shipped artifacts."
}
unverified_prohibitions: [
  {
    "id": "P27-1",
    "source_plan": "27-05:31",
    "statement": "MUST NOT treat flexible preference as execution consent, a style default, or permission to alter an active task.",
    "verification": "judgment",
    "status": "unverified",
    "classification": "WARNING",
    "human_decision_required": true
  }
]
human_verification: [
  {
    "test": "Resolve the outstanding MODE-02 native checkpoint or explicitly amend its evidence scope.",
    "expected": "Supply actual loaded-revision host receipts plus native A→B handoff, or explicitly accept the proposed amendment: MODE-02 proves common CLI/five-target fixture behavior; native natural-language consumption remains unavailable/unverified per host until separately authorized. No five-host native claim follows from this amendment.",
    "why_human": "27-05-PLAN.md:114-121/145 requires native evidence; its native ledger marks Claude/Codex/Pi/Hermes unavailable and handoff fixture-only. P2 accepted archival tiers, not this stronger five-host checkpoint."
  },
  {
    "test": "Disposition P27-1: MUST NOT treat flexible preference as execution consent, a style default, or permission to alter an active task.",
    "expected": "Explicitly accept the reviewed preference-only boundary and tests, or identify a concrete violation; retain exact per-task approval/start.",
    "why_human": "27-05-PLAN.md:31-33 leaves this descriptor-less prohibition unresolved; current code/tests support it but no per-item human disposition exists."
  },
  {
    "test": "Review deferred documentation/semantic assumptions from 27-05.",
    "expected": "Review current query/preview/apply/rollback examples and the three spec-less MODE-01/MODE-03/MODE-05 unclassified edges, with research A2 explicitly unconfirmed.",
    "why_human": "27-05-PLAN.md:105/121 explicitly defers these items; 27-01:77 and 27-05:75 preserve the flags. Source checks cannot resolve an unspecified semantic domain."
  }
]
behavior_unverified_items: [
  {
    "truth": "A user can request a mode change in natural language or CLI before GSD initialization, and a second harness resolves the same project setting without repeating the instruction.",
    "test": "Resolve the outstanding MODE-02 native checkpoint or explicitly amend its evidence scope.",
    "expected": "Supply actual loaded-revision host receipts plus native A→B handoff, or explicitly accept the proposed amendment: MODE-02 proves common CLI/five-target fixture behavior; native natural-language consumption remains unavailable/unverified per host until separately authorized. No five-host native claim follows from this amendment.",
    "why_human": "27-05-PLAN.md:114-121/145 requires native evidence; its native ledger marks Claude/Codex/Pi/Hermes unavailable and handoff fixture-only. P2 accepted archival tiers, not this stronger five-host checkpoint."
  }
]
---

# Phase 27: Shared Project Behavior Policy Verification Report

**Phase Goal:** A user can inspect and change one project-scoped strict/flexible setting from any supported harness, including before project initialization, and the next intake sees the current value.

**Verified:** 2026-11-03T15:14:31Z  
**Status:** human_needed  
**Previous report:** preserved as 27-VERIFICATION-PRE-RELEASE-060.md. Prior claims were not implementation evidence.

## Goal Achievement

### Observable Truths

Rows1–5 preserve the roadmap success criteria verbatim. Remaining rows merge additional plan detail; the next table maps every original PLAN truth to one resolved obligation. Repeated cross-cutting obligations count once.

| # | Truth | Status | Direct evidence |
| --- | --- | --- | --- |
| 1 | A project with no policy resolves to strict without creating configuration or GSD files; only the mode, never a selected style, is a project preference. | VERIFIED | behavior-policy.ts:140-295 returns builtin-default/strict/missing before any mutation; behavior-policy/project-mode-cli tests assert zero writes. |
| 2 | A user can request a mode change in natural language or CLI before GSD initialization, and a second harness resolves the same project setting without repeating the instruction. | UNCERTAIN — WARNING / PRESENT_BEHAVIOR_UNVERIFIED | CLI and five rendered fixtures work; actual loaded-revision five-host routing and native A→B handoff are still absent. 27-05-PLAN.md:29,114-121 expressly forbids accepting fixtures for this checkpoint. |
| 3 | A user can inspect effective mode, canonical root and source/revision; an existing session re-reads a later change at its next task intake. | VERIFIED | inspectTaskIntake calls resolveProjectBehavior afresh at task-intake.ts:529; cross-target policy visibility test in 0261 log:641 asserts flexible and identical revision from independent environments. |
| 4 | Mode mutations are previewable, root-bounded, snapshotted and rollback-aware, preserve unrelated settings, and reject stale reviewed input where applicable. | VERIFIED | behavior-policy.ts:504-705 binds exact root identity/revision/digest, rechecks inside target/state locks and calls applyFileTransaction; CLI lifecycle/rollback/concurrency tests exercise this. |
| 5 | Invalid/unreadable policy and wrong-root conditions produce actionable errors instead of silent flexible or cross-project fallback. | VERIFIED | Typed errors at behavior-policy.ts:140-484 guard tree-off, root, bound task, containment, duplicate JSON and closed schema; behavior-policy.test.ts negative cases pass. |
| 6 | Canonical root selection uses the shared ladder and preserves declaration/Git/worktree/tree-off boundaries. | VERIFIED | resolveProjectBehavior imports resolveCanonicalRoot, loadTreeRegistry/resolveEffectivePolicy and provePathBoundary; evidence/root/path tests exercise aliases, boundaries and escapes. |
| 7 | The closed version-1 policy accepts only strict/flexible mode, rejects duplicate decoded keys and extra fields without exposing contents. | VERIFIED | behavior-policy.ts:427-484 calls parseManagedDocument/validateAgainstSchema on original bytes; behavior-policy tests assert malformed/sentinel failures. |
| 8 | Reviewed previews distinguish missing, same logical mode, raw-byte changes and replaced filesystem roots without writes. | VERIFIED | planProjectModeChange:504-581 hashes rootIdentity, currentRevision, requestedMode and change; project-mode-cli/path-boundary tests check no writes and stale evidence. |
| 9 | The CLI rejects invalid mode grammar, extra operands, duplicate/unknown flags and mutation flags on queries. | VERIFIED | src/cli.ts project mode closed argument branches at 1686-1748; project-mode-cli.test.ts covers text/JSON grammar/refusals. |
| 10 | Common rollback validates additive policy metadata and restores exact bytes or absence without sweeping parents/siblings; drift/LIFO/root/snapshot errors refuse safely. | VERIFIED | transaction.ts validated journal consumption and policy coordinator integration; rollback/rollback-cli-verification/transaction tests assert byte restoration, preserved siblings and fail-closed metadata. |
| 11 | A valid same-mode apply is a zero-write no-op with operationId:null. | VERIFIED | behavior-policy.ts:616-626 returns before target/state lock/session creation; project-mode-cli.test.ts hashes unchanged state. |
| 12 | Independent writers and rollback/apply share canonical target ownership before the state session, yielding one winner and stale retries. | VERIFIED | behavior-policy.ts:632-683 and writer-lock.ts policy target coordinator; project-mode-concurrency.test.ts uses actual independent process/state-root checks. |
| 13 | Inside-lock revision/root/path checks reject review/apply retargeting and serialize rollback races. | VERIFIED | behavior-policy.ts:674-705 re-plans with held ownership; transaction rollback re-proves policy identity/LIFO/drift; concurrency/path/rollback tests cover both orderings. |
| 14 | The actual owned skill renders with locked source/target integrity to all five fixture homes. | VERIFIED | skills/alpha-aos-task/SKILL.md sections1-2; owned-skills real plan/apply renderer and catalog lock hashes; project-mode-routing and owned-skills tests assert all five deployments. |
| 15 | Mixed policy/task requests apply only the explicit preference first and resume fresh intake without changing the active style/contract or granting execution. | VERIFIED | Owned skill policy precedence and Mode Preference Invariant; routing structural/CLI tests plus current intake executionAuthorized:false and active-task mode-change tests. |

**Score:** 14/15 merged truths verified; 1 present-and-wired but behavior-unverified.

### PLAN Detail Traceability

| Plan / truth | Original obligation | Merged row / status |
| --- | --- | --- |
| 27-01 T1 | An uninitialized standalone directory can run project mode and receive strict, builtin-default, missing revision, canonical root/reason and policy path without any project/home/state writes. | 1: VERIFIED |
| 27-01 T2 | Only the selected canonical project's policy is read; declarations and Git directory/file boundaries use the existing single root ladder. | 6: VERIFIED |
| 27-01 T3 | Valid policy is exactly schemaVersion 1 plus required strict/flexible mode; duplicate decoded keys and every extra field are rejected. | 7: VERIFIED |
| 27-01 T4 | Invalid, unreadable, non-directory root, directory policy, dangling/escaping link, tree-off or bound-task mismatch yields a safe actionable diagnostic and no effective mode. | 5: VERIFIED |
| 27-02 T1 | A reviewed preview binds exact filesystem root identity as well as canonical root/path, current byte revision or missing, and requested mode. | 8: VERIFIED |
| 27-02 T2 | Preview performs no project/home/state writes; missing-to-explicit-strict is a create, while an existing valid same-mode policy is reported current. | 8: VERIFIED |
| 27-02 T3 | Creation, deletion, formatting-only byte edits and root replacement produce different reviewed evidence even when logical mode remains equal. | 8: VERIFIED |
| 27-02 T4 | CLI rejects empty/invalid modes, extra operands, unknown flags, duplicate value flags and mutation flags on a query. | 9: VERIFIED |
| 27-03 T1 | Common rollback of a policy operation restores exact original bytes atomically or removes only behavior.json, preserving .alpha-aos and all siblings. | 10: VERIFIED |
| 27-03 T2 | Apply and policy rollback share canonical-target coordination before the state mutation session; a held matching ownership context is reused during failure rollback. | 12: VERIFIED |
| 27-03 T3 | Policy metadata is additive and validated when journals are consumed; old journals remain usable, while corrupt policy metadata cannot escape into a generic unsafe rollback path. | 10: VERIFIED |
| 27-03 T4 | Policy rollback rejects changed root/path, missing snapshot, post-apply drift and non-head transactions without disclosing arbitrary edited policy contents. | 10: VERIFIED |
| 27-04 T1 | Reviewed mode apply creates only the policy preference through one bounded snapshotted atomic transaction and returns a real operation ID. | 4: VERIFIED |
| 27-04 T2 | A valid same-mode apply, including a reviewed same-mode request, preserves exact original bytes with no directory/lock/session/journal creation and no operation ID. | 11: VERIFIED |
| 27-04 T3 | Two processes reviewing one prior revision cannot both change it, even with separate state roots or canonical aliases; contention is finite and an old-digest retry after the winner is stale. | 12: VERIFIED |
| 27-04 T4 | Apply and rollback races are serialized by the same target coordinator in both orderings; inside-lock root/path/revision/LIFO/drift checks prevent lost changes. | 13: VERIFIED |
| 27-04 T5 | Missing-to-created, deletion, formatting-only edits, root replacement or path retarget after review refuse without overwriting current policy. | 13: VERIFIED |
| 27-05 T1 | The real alpha-aos-task source renders and deploys with matching source/target integrity to Claude, Codex, Antigravity, Pi and Hermes fixture homes. | 14: VERIFIED |
| 27-05 T2 | A policy-only natural-language request reaches the shared CLI before the general task chooser, contract or GSD initialization path. | 2: PRESENT_BEHAVIOR_UNVERIFIED |
| 27-05 T3 | For a mixed setting/task request, the explicitly authorized setting is handled first and the original task resumes intake using a fresh policy read without gaining execution approval. | 15: VERIFIED |
| 27-05 T4 | Each next intake rereads canonical root and policy bytes; another harness's mode change appears without changing an active task's style/contract/plan. | 3: VERIFIED |
| 27-05 T5 | Actual loaded-revision native route receipts and a two-host change/read handoff are retained separately from fixtures; missing native evidence prevents MODE-02 acceptance. | 2: PRESENT_BEHAVIOR_UNVERIFIED |

### Required Artifacts

Owner verify.artifacts ran for every PLAN: all declared artifacts passed existence/substance checks, exit0. Direct wiring/data inspection below determines whether they actually meet the goal.

| Artifact | Expected | Substance/wiring |
| --- | --- | --- |
| src/core/behavior-policy.ts | applyProjectModeChange and null-ID current result | VERIFIED — substantive and consumed by production/test/proof path above |
| schemas/behavior-policy.schema.json | Closed policy schema | VERIFIED — substantive and consumed by production/test/proof path above |
| test/project-mode-cli.test.ts | Full preview/apply/rollback/no-op CLI lifecycle | VERIFIED — substantive and consumed by production/test/proof path above |
| test/behavior-policy.test.ts | Root/schema/failure matrix | VERIFIED — substantive and consumed by production/test/proof path above |
| src/core/path-boundary.ts | Exact JSON-safe device/inode identity and precise rechecks | VERIFIED — substantive and consumed by production/test/proof path above |
| src/core/writer-lock.ts | Canonical-project policy target ownership and finite contention | VERIFIED — substantive and consumed by production/test/proof path above |
| src/core/transaction.ts | Validated policy operation metadata and common safe rollback | VERIFIED — substantive and consumed by production/test/proof path above |
| schemas/transaction-journal.schema.json | Optional closed policyOperation metadata contract | VERIFIED — substantive and consumed by production/test/proof path above |
| test/rollback-cli-verification.test.ts | Safe text/JSON and no-parent-sweep assertions | VERIFIED — substantive and consumed by production/test/proof path above |
| test/project-mode-concurrency.test.ts | Independent process/state-root/alias race and stale retry proof | VERIFIED — substantive and consumed by production/test/proof path above |
| skills/alpha-aos-task/SKILL.md | Early explicit policy request routing and fresh intake read | VERIFIED — substantive and consumed by production/test/proof path above |
| catalog/stack.lock.json | Recomputed source and five rendered hashes | VERIFIED — substantive and consumed by production/test/proof path above |
| test/project-mode-routing.test.ts | Real five-target deployment and shared policy fixture | VERIFIED — substantive and consumed by production/test/proof path above |
| .planning/phases/27-shared-project-behavior-policy/27-NATIVE-EVIDENCE.md | Separate actual host receipts and explicit unavailable statuses | WARNING — historical statuses; current native checkpoint incomplete |

### Key Link Verification

Owner verify.key-links ran for every PLAN and returned exit1: literal target-path heuristics mostly miss relative .js imports of .ts source and indirect schema/data consumers. Every JSON was inspected and semantic links independently traced below. Actual missing behavior stays explicit.

| From | To | Via | Status | Direct evidence |
| --- | --- | --- | --- | --- |
| CLI/owned skill | behavior-policy | Dynamic imports and query/preview/apply calls | WIRED | cli.ts:1686-1748; shared skill section1 calls actual project mode commands. |
| behavior-policy | evidence/tree-policy/path-boundary/validation | Canonical ladder, policy guards and original-byte schema validation | WIRED | Imports plus calls in resolveProjectBehavior:140-484 and planProjectModeChange:504-581. |
| behavior-policy | writer-lock/transaction | Target ownership → state session → inside-lock re-plan → transaction | WIRED | behavior-policy.ts:632-705; same context supplied to applyFileTransaction. |
| transaction/rollback CLI | writer-lock/journal schema | Validated policy metadata and common rollback | WIRED | transaction.ts validates journal metadata/identities and reuses matching target/state context. |
| catalog lock/owned-skills | five rendered skill homes | Source/rendered digest validation before real fixture apply | WIRED | owned-skills.ts renderer/sync; project-mode-routing.test.ts:23 and owned-skills.test.ts. |
| five native harnesses | current revision policy consumption | Actual natural-language host receipt + native handoff | UNCERTAIN | Only historical Antigravity narrative; no current five-host receipt set. Fixture test:66 is deliberately not native. |

### Data-Flow Trace (Level4)

| Output | Data | Actual source | Status |
| --- | --- | --- | --- |
| Mode query/intake | effectiveMode/root/source/revision | Fresh canonical path + readFile(behavior.json), default only when missing | FLOWING |
| Mode apply/rollback | policy bytes/operationId | Reviewed digest + exact identity + real transaction/journal/snapshot | FLOWING |
| Cross-host natural-language receipt | native source/result | Four unavailable hosts; shared CLI environment fixture only | UNCERTAIN |

### Behavioral Spot-Checks / Completed Regression

No tests/build/server/mutation probe/global write/paid model turn was executed here. The orchestrator provided the completed mandatory0261 regression and prohibited duplicating the active ce38 full gate. Fresh read-only git diff --name-only 0261dfdeec85268f4cf35769a4d9a7a9ec36c77c HEAD returned only .github/workflows/ci.yml and .planning/debug/release-060-final-gates.md. All production source/schema/script/test/package/doc evidence is byte-identical. Named pass records in the immutable raw log were matched to actual assertion source. This is reused completed behavioral execution evidence, not a new run or SUMMARY claim.

| Check | Actual evidence | Result |
| --- | --- | --- |
| Full regression | .planning/tmp/060-0261-push.stdout.log, .stderr.log and060-0261-full-counts.json | 2162total /2148pass /0fail /14 explicit host-permission skips |
| Upstream ECC | Same raw log | 1/1 pass |
| Artifact consistency | Same log final build:check | 350 inputs/690 outputs verified |
| Requirement behavior | Per-row named test source and actual raw-log pass records | PASS only for exercised invariants |

### Fresh Read-Only Probe Execution

No conventional scripts/*/tests/probe-*.sh was declared. Applicable native proof verifiers were freshly executed without model turns or writes.

| Command | Result | Exit |
| --- | --- | --- |
| node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json | 55cells:7 archival-native/19 fixture/7 unsupported/21 unverified/1 blocked; gateStatus:passed | 0 |

### Requirements Coverage

All assigned requirement IDs appear in this phase's PLAN frontmatter: no orphaned ID. Requirement checkbox state was not evidence or changed.

| Requirement | Source plans | Merged rows | Status |
| --- | --- | --- | --- |
| MODE-01 | 27-01, 27-04, 27-05 | 1 | SATISFIED |
| MODE-02 | 27-01, 27-05 | 2, 14, 15 | NEEDS HUMAN — native behavior unverified |
| MODE-03 | 27-01, 27-02, 27-04, 27-05 | 3, 8 | SATISFIED |
| MODE-04 | 27-02, 27-03, 27-04, 27-05 | 4, 10, 11, 12, 13 | SATISFIED |
| MODE-05 | 27-01, 27-02, 27-03, 27-04, 27-05 | 5, 6, 7, 9 | SATISFIED |

### Anti-Patterns and Test Quality Audit

Declared implementation/schema/proof artifacts were scanned for unreferenced TBD/FIXME/XXX and linked disabled/todo tests: none found in the scanned artifacts. Fixture writes supply inputs, not expected outputs generated by the implementation. Linked tests assert values/behavior, not existence alone. Fixed labels and strict-when-missing are intended product constants. Dynamic data sources are traced above.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts. Honored20/20, owner query exit0. Advisory substring coverage does not prove runtime behavior or resolve human items.

### Prohibitions and Existing Human Dispositions

| Item/source | Exact statement | Disposition |
| --- | --- | --- |
| P27-1 / 27-05:31 | MUST NOT treat flexible preference as execution consent, a style default, or permission to alter an active task. | WARNING — per-item human semantics judgment required; source/test judge is non-authoritative |
| P27-2 / 27-05:34 | MUST NOT report source or fixture proof as successful native five-host policy routing. | RESOLVED by existing P2 in31-PROHIBITION-RESOLUTION.md: tier separation only; no MODE-02 native waiver |

27-NATIVE-EVIDENCE.md is historical and contains old source hashes. Current locked guidance is checked by the unchanged-source regression; the old ledger is not treated as current native loading proof. Its own acceptance section says human_needed. The old canonical report contradicted this in frontmatter and prose; this report corrects the contradiction without inventing an override.

### Human Verification Required

#### 1. Resolve the outstanding MODE-02 native checkpoint or explicitly amend its evidence scope.

**Expected:** Supply actual loaded-revision host receipts plus native A→B handoff, or explicitly accept the proposed amendment: MODE-02 proves common CLI/five-target fixture behavior; native natural-language consumption remains unavailable/unverified per host until separately authorized. No five-host native claim follows from this amendment.

**Why human:** 27-05-PLAN.md:114-121/145 requires native evidence; its native ledger marks Claude/Codex/Pi/Hermes unavailable and handoff fixture-only. P2 accepted archival tiers, not this stronger five-host checkpoint.

#### 2. Disposition P27-1: MUST NOT treat flexible preference as execution consent, a style default, or permission to alter an active task.

**Expected:** Explicitly accept the reviewed preference-only boundary and tests, or identify a concrete violation; retain exact per-task approval/start.

**Why human:** 27-05-PLAN.md:31-33 leaves this descriptor-less prohibition unresolved; current code/tests support it but no per-item human disposition exists.

#### 3. Review deferred documentation/semantic assumptions from 27-05.

**Expected:** Review current query/preview/apply/rollback examples and the three spec-less MODE-01/MODE-03/MODE-05 unclassified edges, with research A2 explicitly unconfirmed.

**Why human:** 27-05-PLAN.md:105/121 explicitly defers these items; 27-01:77 and 27-05:75 preserve the flags. Source checks cannot resolve an unspecified semantic domain.

### Gaps, Deferred Items and Advisory Scope

No observable implementation failure established in this bounded pass. The human items prevent passed status.

No current must-have is deferred to Phase31: later integration/distribution cannot remove Phase27's native checkpoint or Phase29's BOOT-04 safety requirements. No unrelated architectural advisory added.

This report does not certify current native CI/macOS/three-OS acceptance, publication, paid canaries or global rollout; those belong to the release orchestrator. No implementation/test/lifecycle edit or commit was made.

_Verifier: gsd-verifier; source ce38cb5fbab9cb134012d0c7bf7a7ba93bd71047. Fingerprint fields copied verbatim from owner query._
