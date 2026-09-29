# Architecture Research: Universal Autonomous Work (v0.2.0)

## Control ownership

```text
explicitly opted-in TaskContract (version + digest)
        |                        |
        v                        v
alpha-AOS supervisor      GSD controller (exclusive lease)
attempts, budgets,          discusses, plans, verifies,
recovery, effect ledger     transitions .planning state
        |                        |
        +---- execution plan ----+
        |
        +---- executor adapter ---- bounded workspace/tool action
        +---- check adapter ------- measured acceptance evidence
        +---- reviewer adapter ---- fresh session, read-only review
        +---- findings mapper ----- GSD gaps/new phase through controller
        +---- capability router ---- GSD-step skill/MCP/pack/hook obligations
```

Only GSD moves project lifecycle state. The supervisor owns a separate run journal under the alpha-AOS managed state root, with run/contract IDs, attempt sequence, lease generation, artifact digest, tool-effect key, status and redacted evidence refs. It does not assert GSD phase completion. GSD progress and the run journal are reconciled at every restart.

## Proposed modules

| Module | Responsibility | Closest existing seam |
|---|---|---|
| `src/core/task-contract.ts` | Schema, scope, authority, immutable revisions/digests | `src/core/project.ts`, `src/core/catalog.ts` |
| `src/core/agent-run.ts` | Normalized request/events/result and adapter registry | `src/core/process.ts`, `src/adapters/harnesses.ts` |
| `src/adapters/agent-*.ts` | Native launch, completion, cancel, usage and resume per harness | `src/adapters/capability-oracle.ts` |
| `src/core/autonomous-journal.ts` | Append-only attempts, lease/fencing and crash reconciliation | `src/core/writer-lock.ts`, `src/core/transaction.ts` |
| `src/core/autonomous-runner.ts` | Scheduling, limits, no-progress policy, state machine | `src/core/install.ts` orchestration style |
| `src/core/acceptance.ts` | Criterion evidence and reviewer report validation | `src/core/gate-receipt.ts`, `src/core/canary.ts` |
| `src/core/gsd-run-bridge.ts` | GSD command routing and single state writer | `src/core/gsd-context.ts`, GSD loop hooks |
| `src/core/task-capabilities.ts` | Full capability inventory, step matcher, invocation obligations and receipts | `src/core/capability-ledger.ts`, `src/core/project-pack-sync.ts`, `src/core/skill-policy.ts`, `src/core/mcp.ts` |
| `src/core/task-connectors.ts` | Manifest, perform, reconcile, verify contract | `src/core/project-plan.ts` |
| `src/adapters/coursepilot-task.ts` | Local CoursePilot material workflow | CoursePilot skill/JSON contract |

The names are planning targets, not an instruction to create parallel implementations of existing process or transaction code. During phase planning, map each target to the nearest existing module and tighten scope.

The capability router consumes native project-pack plan/status, global ECC and owned-skill delivery, MCP registration/tool discovery, GSD hooks and per-harness support receipts. Scaffolding, manifest and dependency events trigger the pack checkpoint before application work. Exact plan-digest approval is a separate gate; autopilot consent does not waive it. After sync reports CURRENT, the controller starts a fresh tool-aware agent session. Each GSD step carries required capability obligations, and only observed call/result receipts discharge them. Recompute on phase, environment or version change. Ordinary GSD never enters this supervisor unless the user opted in for the task.

## Run state machine

`draft -> approved -> validating_roles -> ready -> executing -> checking -> reviewing -> {accepted | repairing | blocked | stopped}`. A crash produces `reconciling` before any pending effect is replayed. A reviewer finding is advisory until matched to a contract criterion or a verified defect; one review cycle contains a single exact artifact set. `accepted` requires every mandatory criterion to carry current evidence and no unresolved blocking finding.

## Single-writer and role rules

Separate harness identity from operational role. A controller obtains an exclusive, fenced project lease and is the only actor permitted to request GSD mutations. Executors and reviewers use a role-specific launch policy; reviewers receive a fresh session with read-only access. Existing `witnessWorkerDelegation` can detect drift but is insufficient as the sole prevention mechanism because it restores after a write. The plan must prove isolation or gating before role claims are enabled.

## Effect model

Before an external action, persist `{operationKey, target, intendedEffect, contractDigest}`. On completion, persist source-specific receipt and independently verify it. On restart, look up the effect by its stable key; if the source cannot tell whether the effect happened, mark `uncertain` and require reconciliation rather than replay. Local GSD commits, CoursePilot downloads, and remote Notion writes use different verifiers. The general connector must never treat all effects as filesystem transactions.

## Review protocol

Require a structured report with reviewed contract and artifact digests, criterion IDs, `pass|fail|unknown`, severity, location, reproduction and evidence refs. A review from the executor's existing session cannot qualify as independent. Different model/provider may be preferred by policy, but independence is recorded as session identity and artifact access, not assumed from brand.
