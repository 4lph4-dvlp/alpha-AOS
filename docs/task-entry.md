# Predictable task entry

[English](./task-entry.md) | [한국어](./task-entry.ko.md)

Tell your agent what you want to accomplish. The shared project policy determines how it asks about execution; GSD owns planning, execution state and verification. This guide describes the **0.6.0 release candidate** source workflow. Publication remains held until release acceptance.

## 1. Shared Project Modes (`strict` vs `flexible`)

All five harnesses read one authority: `<project-root>/.alpha-aos/behavior.json`. An empty directory or missing policy means `strict`, with zero writes. Another harness sees a change on its next intake; an active task keeps its bound style.

```sh
alpha-aos project mode . --json
alpha-aos project mode set flexible . --json
alpha-aos project mode set flexible . --plan-digest <digest-from-preview> --apply
alpha-aos rollback <operation-id> --apply
```

Use `set strict` to switch back. Review the preview before applying its exact digest. Rollback restores previous bytes or removes only the first-created policy file. A stale digest or corrupt policy fails closed. `flexible` is an intake preference: it grants no execution consent, autopilot approval or start authority, and stores no default execution style.

## 2. Six Execution Styles (`1`–`6`)

The Korean labels below are the actual UI labels in every language. Pick a number, label or explicit style request.

| Number | Exact label | Canonical ID | Behavior and request example |
|---|---|---|---|
| 1 | 대화형-quick | `conversational-quick` | Bounded GSD quick work in this conversation: “Use conversational quick to fix this helper.” |
| 2 | 대화형-quick-full | `conversational-quick-full` | GSD quick `--full`, including research and plan-check: “Use conversational quick-full for this fix.” |
| 3 | 대화형-phase | `conversational-phase` | Discuss → plan → execute → verify a GSD phase here: “Continue Phase 31 in this conversation.” |
| 4 | 오토파일럿-quick | `autopilot-quick` | Isolated contract-bound standard quick: “Prepare an autopilot quick contract for this fix.” |
| 5 | 오토파일럿-quick-full | `autopilot-quick-full` | Isolated full quick, `scope.quickQuality: "full"`: “Prepare autopilot quick-full with all quality gates.” |
| 6 | 오토파일럿-phase | `autopilot-phase` | Isolated ordered phase execution and independent review: “Prepare an autopilot contract for these phases.” |

Full quick requires evidence for **discussion, research, planning, plan-check, implementation, verification, state-docs**. Ordinary quick evidence cannot substitute for those seven stages. All autopilot routes require exact contract approval followed by a separate start instruction.

## 3. Predictable Intake Decision Order

1. Preserve a matching active task's continuity and bound style.
2. Honor a leading direct GSD command.
3. Honor an explicit user style request; conflicting requests refuse.
4. Evaluate an evidence-backed simple task exemption.
5. For a new substantial task, `strict` asks with six options; `flexible` uses adaptive intake. If structured question UI is unavailable, show the same options as numbered **1–6 text fallback**.

An intake inspection is read-only and reports `executionAuthorized: false`. A style preference alone never starts a worker. A completed task's style is not an implicit choice for the next task.

## 4. Simple Task Exemption: Positive vs Counterexamples

An exemption needs concrete bounded evidence, including files and effects. It does not bypass a protected action's approval gate.

| May proceed as simple work with evidence | Requires ordinary intake and style selection |
|---|---|
| Rename a local variable/helper in one file | Rename a public API across subsystems or packages |
| Correct a README typo, translation or link | Change schemas, authentication or release behavior |
| Perform an explicitly requested bounded fast-forward git push | Resolve push conflicts or force push |

“Small fix” without affected-file evidence is insufficient. The current release push hold remains in force even when an abstract push example qualifies as simple.

## 5. Task Lifetime Boundaries

| New independent task | Follow-up inside the same active task |
|---|---|
| An autopilot-phase release completes; the user then requests a separate bug fix. Show a fresh six-style chooser, for example selecting option 5. | A test fails while implementing the current task. Repair it under the already-bound style. |
| Never inherit the completed release's style as a default. | A mode flip from another harness does not restart the active task or replace its style. |

Continuity requires matching canonical project root and active task identity. A wrong-root or conflicting binding fails closed.

## 6. GSD Readiness, Non-Destructive Recovery & Once-Only Handoff

Readiness distinguishes missing runtime, `absent-project` (no planning setup), `partial-project` (incomplete artifacts) and `ready`. A missing runtime is not permission to invent planning state. Hermes cannot be selected as the GSD controller.

| Recovery that preserves the request | Refused or deferred behavior |
|---|---|
| Diagnose absent/partial setup, prepare and review recovery, then run the native GSD initialization/recovery route. Preserve existing `.planning/PROJECT.md` and other artifacts byte-for-byte. | Synthesizing placeholder planning files, deleting partial work, cancelled recovery or launching an unapproved worker. |
| Resume the original request and selected style once: first claim `new-task`, reentry `continue-existing`. | Dispatching the original request a second time on reentry. |

The autopilot bootstrap claim retains `dispatchAuthorized: false`. Restoring GSD readiness does not replace exact contract approval and separate start. See the [bootstrap evidence ledger](./task-bootstrap-proof.md).

## 7. Direct GSD Commands & Autopilot Approval / Start Boundary

| Direct invocation | Mention in prose |
|---|---|
| Leading `/gsd-quick`, `/gsd-plan-phase` or `$gsd-quick` selects the explicit GSD route and bypasses the chooser. | “What does `/gsd-quick` mean?” or a quoted example does not select that route. Normal intake still applies. |

An autopilot request prepares a concrete reviewable contract, including root, scope, role/model assignments, acceptance criteria and limits. After the user reviews its 64-hex SHA-256 digest, approval and start are separate operations:

```sh
alpha-aos task preview <contract.json> --json
alpha-aos task approve <contract.json> --contract-digest <64-hex-digest> --apply
alpha-aos task start <contract.json> --contract-digest <64-hex-digest> --apply
```

The agent can carry the digest into these commands. Approval alone never launches workers. Changing scope or `scope.quickQuality` changes the digest and invalidates old approval. Autopilot implementation runs in the authorized isolated runner; GSD still owns lifecycle state.

## 8. Harness Support Limits, Verification & Release Status

| Harness | Controller / worker | Evidence and delivery limit |
|---|---|---|
| Claude Code | GSD controller and worker | Isolated paid canary held under **G-07-2**; no live paid proof claimed. Use 1–6 fallback if structured question UI is unavailable. |
| Codex | GSD controller and worker | Archived native bootstrap receipt; Windows `.CMD` discovery must be distinguished from invocation. Native question UI availability depends on the host session. |
| Antigravity | GSD controller and worker | Prior native intake/policy session observation; portable composition is fixture-verified. Native UI is not established by CLI tests. |
| Pi Agent | GSD controller and worker | Archived native receipts for all six routes in Phase 30; Windows `.CMD` discovery alone is not execution proof. Use numbered text when needed. |
| Hermes Agent | **worker-only** | Shared policy and intake are supported. GSD controller/state-writer execution is **unsupported**. Numbered text fallback remains available. |

Read the [55-cell proof ledger](./task-entry-proof.md) and [JSON index](./task-entry-proof-index.json); they distinguish verified-native, verified-fixture, unsupported, unverified and blocked. Recheck the index without model calls:

```sh
node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json
```

The packaged verifier works without `.git`, `.planning` or checkout tests, checking packaged hashes and archived evidence. It does not rerun native model turns. Package metadata is **0.6.0** by user decision; official npm publish, git push, global reconciliation, Claude G-07-2 and **3-OS/macOS CI** acceptance remain held. The macOS CI blocker is being remediated. A local Windows test pass cannot clear native CI or publication gates. Earlier 0.5.0 regression receipts remain historical and do not certify this candidate.

Related: [runtime operator controls](./task-runtime-controls.md), [support matrix](./SUPPORT_MATRIX.md), [historical matrix](./SUPPORT_MATRIX_v0.2.0.md), [style proof](./task-style-proof.md).
