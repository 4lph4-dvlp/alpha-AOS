# Phase 24: Autopilot Antigravity Routing, Receipt Re-Probing, and Snapshot Resilience — Context

**Phase goal:** Resolve the five P0/P1 autopilot defects discovered during real-world GPTRPG dogfooding (`CRITICAL_BUG_REPORT_AUTOPILOT_ANTIGRAVITY_ROUTING_AND_SNAPSHOT_DEFECTS.md`): enforce explicit model tier routing (`--model`) for Antigravity controller/executor/reviewer processes, guard against silent subagent model downgrades on `typeName: "self"`, provide `--probe` receipt re-probing on binary hash drift, mirror read-only `.planning` metadata into isolated measurement/reviewer snapshots without altering artifact digests, and support idempotent `.planning/quick/<id>` evidence verification across contract revision retries.

---

## 1. Background & Problem Statement

While dogfooding `alpha-aos task` (Autonomous Autopilot) on the GPTRPG project (`D:\dev\GPTRPG`), five critical runtime and architectural defects were uncovered:

1. **[BUG-01] Missing Antigravity Model Tier Routing (P0)**:
   - `src/adapters/task-antigravity.ts` (`antigravityControllerArgs`, `antigravityReviewerArgs`) did not accept or inject `--model <model-id>`, nor did `TaskAgentPolicy` or `.planning/config.json` model overrides propagate to `agy` CLI invocations. Every child process fell back to the user's global `settings.json` model.
2. **[BUG-02] Fail-Closed Binary SHA-256 Drift Without Recovery Path (P1)**:
   - When `agy.EXE` updated from `1.4.0` to `1.4.2`, `readHarnessRoleReceipt` in `src/adapters/task-receipts.ts` rejected `alpha-aos task start` with `binary hash mismatch ... Re-probe required. (D-02)`, but no `--probe` CLI flag or automatic re-probe workflow existed to refresh `~/.alpha-aos/receipts/harnesses/<harness>-<role>.json`.
3. **[BUG-03] Isolated Snapshot Missing `.planning` Metadata (P1)**:
   - `collectTaskArtifact` and `materializeTaskSnapshot` in `src/core/task-check.ts` excluded `.planning` from isolated snapshots. When criterion measurement oracles or reviewers inspected `.planning/ROADMAP.md` or `.planning/STATE.md` inside the snapshot directory, they failed with `ENOENT`.
4. **[BUG-04] `verifyGsdEvidence` Base-Commit Lock-In on Retries (P1)**:
   - When a contract failed on attempt 1 (after already creating `.planning/quick/<id>` and its `docs(quick-<id>)` commit) and was re-run under a new revision, `verifyGsdEvidence` in `src/core/task-gsd.ts` required a brand-new `.planning/quick` directory not present at `baseCommit`, rejecting valid reused quick tasks.
5. **[BUG-05] Silent Subagent Model Downgrade on `typeName: "self"` (P0)**:
   - In Antigravity, invoking `invoke_subagent` with `typeName: "self"` forces `"inherit": true` at the platform launcher layer, silently ignoring `Model: "pro"` and downgrading architecture/planning turns to the parent Flash model (`gemini-3.8-flash-tiered`).

---

## 2. Design Decisions (`discuss-phase` Results)

### D-01: Explicit Model Tier Parameterization for Antigravity (`BUG-01`)
- Extend `TaskAgentPolicy` (`src/core/task-contract.ts`, `schemas/task-contract.schema.json`) with optional `controllerModel`, `executorModel`, and `reviewerModel` fields.
- Preserve 100% backward-compatible contract digests when model fields are omitted; include them in `digestableTaskContract` and `changedContractFields` when specified so model policy changes are drift-checked.
- Add `antigravityExecutorArgs` and update `antigravityControllerArgs` / `antigravityReviewerArgs` in `src/adapters/task-antigravity.ts` to inject `["--model", model]` whenever a model is specified via adapter options, contract `agentPolicy`, or `.planning/config.json` (`model_profile_overrides` / `cross_ai_command`).

### D-02: Subagent Model Inheritance Guardrails (`BUG-05`)
- Provide `validateAntigravitySubagentDispatch` in `src/adapters/task-antigravity.ts` that fails closed with `INCOMPATIBLE_SUBAGENT_MODEL` whenever `typeName === "self"` is paired with an explicit non-`inherit` model override that differs from the parent session model.
- Embed explicit subagent routing rules into `buildGsdControllerPrompt` (`src/core/task-gsd.ts`) so controllers never use `typeName: "self"` for cross-tier model elevation.

### D-03: Receipt Re-Probe API and CLI `--probe` Flag (`BUG-02`)
- Implement `reprobeHarnessRoleReceipt` and `reprobePolicyReceipts` in `src/adapters/task-receipts.ts` (and support `autoReprobeOnDrift` in `ReadReceiptOptions`).
- Expose `--probe` on `alpha-aos task doctor [--probe]` and `alpha-aos task start <contract.json> [--probe] [--apply]` in `src/cli.ts` so binary updates (`1.4.0` → `1.4.2`) can be re-probed and atomically persisted without manual JSON editing.

### D-04: Read-Only `.planning` Metadata Mirroring in Task Snapshots (`BUG-03`)
- Keep `.planning` excluded from `collectTaskArtifact` and `manifest.digest` so GSD state transitions never invalidate code artifact digests.
- In `materializeTaskSnapshot` (`src/core/task-check.ts`), after verifying the re-collected artifact digest, mirror regular files from `<projectRoot>/.planning` (such as `ROADMAP.md`, `STATE.md`, `PROJECT.md`, `REQUIREMENTS.md`, `config.json`) into `<snapshot>/.planning` as read-only reference files (`0o444`), skipping any symbolic links.

### D-05: Retry-Resilient `verifyGsdEvidence` (`BUG-04`)
- In `verifyGsdEvidence` (`src/core/task-gsd.ts`), preserve strict rejection when an old quick directory is claimed on a first-time run with zero post-`baseCommit` activity.
- Allow a claimed existing `.planning/quick/<id>` directory when `allowExistingClaimedQuick: true` is set (automatically enabled in `startTask` when `contract.revision > 1` or prior runs exist for the same `contract.id`) or when commits/modifications occurred after `baseCommit`, verifying `PLAN.md`, `SUMMARY.md`, `STATE.md` row, and the `docs(quick-<id>)` commit across history.

---

## 3. Requirements & Traceability

| Requirement ID | Defect | Summary |
|---|---|---|
| **AUTO-FIX-01** | BUG-01 | `task-antigravity.ts` and `TaskAgentPolicy` support explicit `--model <id>` routing for controller, executor, and reviewer roles plus `.planning/config.json` fallback. |
| **AUTO-FIX-02** | BUG-02 | `task-receipts.ts` and `alpha-aos task doctor/start --probe` re-probe and atomically refresh harness role receipts upon binary hash or version drift. |
| **AUTO-FIX-03** | BUG-03 | `materializeTaskSnapshot` mirrors read-only `.planning` metadata into isolated measurement/reviewer snapshots without changing the artifact digest. |
| **AUTO-FIX-04** | BUG-04 | `verifyGsdEvidence` accepts valid reused `.planning/quick/<id>` directories and historical `docs(quick-<id>)` commits on contract revision retries. |
| **AUTO-FIX-05** | BUG-05 | `validateAntigravitySubagentDispatch` and controller prompts block silent `typeName: "self"` model downgrades with `INCOMPATIBLE_SUBAGENT_MODEL`. |

---

## 4. Work Breakdown (Waves)

- **Wave 1 (`24-01-PLAN.md`)**: Antigravity Model Tier Routing & Subagent Inheritance Guardrails (`BUG-01`, `BUG-05`).
- **Wave 2 (`24-02-PLAN.md`)**: Harness Role Receipt Re-Probing & CLI `--probe` Integration (`BUG-02`).
- **Wave 3 (`24-03-PLAN.md`)**: Snapshot `.planning` Read-Only Mirroring, `verifyGsdEvidence` Retry Resilience, and End-to-End Regression Suite (`BUG-03`, `BUG-04`).
