# Phase 16: Composable Harness Roles - Pattern Mapping

**Phase Directory:** `D:/dev/alpha-AOS/.planning/phases/16-composable-harness-roles`  
**Generated:** 2026-10-02  
**Status:** Complete  

---

## Executive Summary

Phase 16 executes the **Composable Harness Roles** milestone of alpha-AOS v0.2.0. The central architectural imperative of this phase is to eliminate bootstrap-era hardcoded harness-role assignments ([`TASK_BOOTSTRAP_PAIR`](file:///D:/dev/alpha-AOS/src/adapters/task-agents.ts#L28-L29)) and unlock full $5 \times 5 \times 5 = 125$ composable role triplets across the 5 verified native harnesses: **Claude Code, Codex, Antigravity, Pi, and Hermes**.

To ensure enterprise-grade safety, security, and reproducibility, this composable role system is anchored by 4 core technical pillars:
1. **Capability Proof & Version Drift Defense (ROL-01, ROL-02, D-01..D-04)**: Roles are validated strictly at preview against isolated atomic invocation receipts (`~/.alpha-aos/receipts/harnesses/<harness>-<role>.json`). Version or binary hash drift immediately demotes roles to `unverified` and triggers fail-closed preview refusal. A deterministic 125-triple matrix test fixture guarantees end-to-end composability validation.
2. **Project-Local Exclusive Controller Fenced Lease (ROL-03, D-05..D-08)**: Enforces the GSD single-authority lifecycle invariant. Exactly one controller may hold a lease (`.alpha-aos/controller.lock`) on a project at any time. Racing controllers immediately fail fast with `LOCKED_PROJECT_CONTROLLER` (`ACTIVE_WRITER`), while stale/zombie locks from deceased processes are safely reclaimed via PID aliveness checks and logged to `controller-lease-audit.jsonl`. D-10's legacy hardcoded Hermes controller refusal is fully migrated to receipt-and-lease verification.
3. **Same-Harness Reviewer Isolation & Tree Mutation Guard (ROL-04, D-09..D-12)**: Prevents review pollution and covert modification. When controller/executor and reviewer share a harness (e.g. Claude-Claude), the reviewer receives an isolated ephemeral environment (`scratch/reviewer-env`), unique `reviewerSessionId`, and read-only tools. A post-execution `TreeMutationGuard` detects any tree alteration and invalidates the review report with `INVALID_MUTATING_REVIEW`.
4. **Normalized Usage/Cost Telemetry & 3D Diagnostics (ROL-05, D-13..D-16)**: Distinguishes measured metrics from unknown/unmetered fields without assuming free-by-brand defaults. Enforces fail-closed rejection (`MISSING_TELEMETRY_METER`) if contracts specify token/cost limits on unmetered harnesses. Exposes a 3D diagnostic matrix in CLI `task doctor` across roles, MCP/skills, and telemetry.
5. **Codex Live Defect Rejection & Stale Review Tracer (SC6)**: Finalizes the deferred Plan 14-09 verification with a robust launch environment and unified process exit status interpreter.

This document establishes the concrete code analogs, architectural patterns, data flows, interfaces, and test conventions required to implement requirements **ROL-01 through ROL-05** and implementation decisions **D-01 through D-16**.

---

## File Classification Matrix

| File Path | Role | Data Flow Summary | Existing Analog in Codebase | Key Invariants & Differences |
|-----------|------|-------------------|-----------------------------|------------------------------|
| [`src/adapters/task-agents.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-agents.ts) *(modified)* | 125 Role Registry & Dynamic Dispatcher | Resolves contract `agentPolicy` -> checks receipts via `task-receipts.ts` -> validates 5×5×5 matrix -> dynamically binds controller, executor, and reviewer ports across all 5 harnesses. | [`src/adapters/task-agents.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-agents.ts#L22-L80) | Replaces hardcoded `TASK_BOOTSTRAP_PAIR` with dynamic 5×5×5 registry; routes all 5 harnesses to their respective native adapters; enforces D-01/D-02/D-10. |
| [`src/adapters/task-antigravity.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-antigravity.ts) *(created)* | Antigravity Native Adapter | Prepares `agy` CLI launch spec (`-p`, `--output-format json`, `--json-schema`, `--mode plan`/`accept-edits`, `--sandbox`) -> executes via `runProcess` -> normalizes result & telemetry. | [`src/adapters/task-codex.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-codex.ts#L404-L450), [`src/adapters/task-claude.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-claude.ts#L69-L93) | Native Antigravity adapter supporting Controller, Executor, and Reviewer; maps `--sandbox` flags and extracts token usage. |
| [`src/adapters/task-pi.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-pi.ts) *(created)* | Pi Native Adapter | Prepares `pi` CLI launch spec (`-p`, `--mode rpc`, `--tools read,grep,find,ls` for reviewer, `--no-approve`, `--no-session`) -> handles Windows libuv stdin teardown (0xC0000409) -> parses JSON. | [`src/adapters/task-claude.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-claude.ts#L69-L93), [`src/adapters/capability-oracle.ts`](file:///D:/dev/alpha-AOS/src/adapters/capability-oracle.ts#L533-L540) | Enforces read-only tool whitelists for reviewer role; wraps Windows process teardown crash with output validity checks. |
| [`src/adapters/task-hermes.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-hermes.ts) *(created)* | Hermes Native Adapter | Prepares `hermes` CLI launch spec (`-z, --oneshot`, `--usage-file <path>`, `--toolsets`, `--ignore-rules`, `--in <dir>`) -> runs `runProcess` -> parses `--usage-file` -> extracts telemetry. | [`src/adapters/task-codex.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-codex.ts#L435-L450), [`src/adapters/task-claude.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-claude.ts#L33-L67) | Hermes native adapter for Controller (with lease), Executor, and Reviewer; parses dedicated `--usage-file`. |
| [`src/adapters/task-receipts.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-receipts.ts) *(created)* | Role Receipt Store & Drift Detector | Reads/writes `~/.alpha-aos/receipts/harnesses/<harness>-<role>.json` -> computes binary SHA-256 & version -> compares against host binary -> reports verified/unverified/missing. | [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L180-L211), [`src/adapters/task-agent-launch.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-agent-launch.ts#L138-L164) | Atomic JSON file persistence with `wx` flag; detects binary/version drift (D-02); supports mock roots for CI deterministic testing. |
| [`src/core/controller-lease.ts`](file:///D:/dev/alpha-AOS/src/core/controller-lease.ts) *(created)* | Project Controller Fenced Lease | Atomically creates `.alpha-aos/controller.lock` with `wx` flag -> records lease token, pid, hostname, contractDigest -> handles collisions via `isProcessAlive` -> logs audit on zombie auto-reclaim. | [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L88-L101,L180-L211) | Project-local scope (not global state root); throws `ControllerLockConflictError` (`LOCKED_PROJECT_CONTROLLER`); auto-reclaims dead PIDs. |
| [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts) *(modified)* | Worker Authority & D-10 Migration | Replaces name-based Hermes controller refusal with controller receipt & valid lease token check; updates `resolveHarnessRole`. | [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L57-L76) | Removes `if (harnessId === "hermes") throw ...`; unifies all harnesses under receipt-and-lease model (D-07, ROL-03). |
| [`src/core/tree-mutation-guard.ts`](file:///D:/dev/alpha-AOS/src/core/tree-mutation-guard.ts) *(created)* | Reviewer Tree Mutation Guard | Snapshots project artifact state (`collectTaskArtifact`) before review -> compares snapshot after review -> flags file creation/modification/deletion -> invalidates with `INVALID_MUTATING_REVIEW`. | [`src/core/task-check.ts`](file:///D:/dev/alpha-AOS/src/core/task-check.ts#L57-L60,L120-L180), [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L135-L160) | Protects review integrity; ignores OS-generated noise files (`.DS_Store`, `Thumbs.db`); fails closed on any source tree mutation. |
| [`src/core/task-telemetry.ts`](file:///D:/dev/alpha-AOS/src/core/task-telemetry.ts) *(created)* | Telemetry Normalizer & Meter Gate | Normalizes raw harness telemetry into measured fields (`promptTokens`, `completionTokens`, `durationMs`) and preserves `null`/`unknown` -> verifies meter readiness against cost limits. | [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L890-L915), [`src/adapters/task-codex.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-codex.ts#L56-L63) | Strictly distinguishes measured from unmetered (D-13, D-15); fails closed with `MISSING_TELEMETRY_METER` (D-14). |
| [`src/core/task-doctor.ts`](file:///D:/dev/alpha-AOS/src/core/task-doctor.ts) *(created)* | Task Doctor 3D Matrix Renderer | Probes 5 harnesses across (1) Role proofs, (2) Native Skills/MCP, (3) Telemetry metering -> formats structured 3D diagnostic table for CLI. | [`src/core/support-matrix.ts`](file:///D:/dev/alpha-AOS/src/core/support-matrix.ts#L25-L40,L80-L110), [`src/adapters/harnesses.ts`](file:///D:/dev/alpha-AOS/src/adapters/harnesses.ts#L47-L68) | Implements D-16; exposes complete role/metering status in terminal and JSON modes. |
| [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts) *(modified)* | Contract Schema & Policy Extension | Extends `TaskAgentPolicy` with `differentReviewerPolicy` -> integrates fail-closed telemetry readiness check -> removes legacy Hermes error conversion. | [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L47-L59,L386-L394) | Supports `"require-different-harness" \| "require-different-model" \| "allow-same"`; gates contract preview against meter capabilities. |
| [`src/core/task-run.ts`](file:///D:/dev/alpha-AOS/src/core/task-run.ts) *(modified)* | Task Execution Lifecycle & Fencing | Acquires controller lease at start of `startTask` -> releases in `finally` -> wraps reviewer execution with `TreeMutationGuard` -> passes isolated reviewer session config. | [`src/core/task-run.ts`](file:///D:/dev/alpha-AOS/src/core/task-run.ts#L843-L868,L994-L1065) | Guarantees controller single-writer lease lifecycle; invalidates mutating reviews; passes clean ephemeral directories to reviewers. |
| [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts) *(modified)* | CLI Command Dispatcher | Adds `alpha-aos task doctor [--json]` -> integrates `verifyRoleCapabilities`, `checkCostMeterReadiness`, and lease conflict error handling in `task preview`/`task start`. | [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L176-L182,L1770-L1940) | Seamless CLI interface for 3D doctor diagnostics and fail-closed task initiation. |
| [`schemas/harness-role-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/harness-role-receipt.schema.json) *(created)* | Role Receipt Schema | JSON schema for `~/.alpha-aos/receipts/harnesses/<harness>-<role>.json`. | [`schemas/task-run.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-run.schema.json) | Validates CLI version, binary SHA-256, verified flags, probe timestamp, and sample run digest. |
| [`schemas/controller-lock.schema.json`](file:///D:/dev/alpha-AOS/schemas/controller-lock.schema.json) *(created)* | Controller Fenced Lease Schema | JSON schema for `.alpha-aos/controller.lock`. | [`schemas/writer-lock.schema.json`](file:///D:/dev/alpha-AOS/schemas/writer-lock.schema.json) | Validates schemaVersion, harness, token UUID, pid, host, startedAt, and contractDigest. |
| [`schemas/task-contract.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-contract.schema.json) *(modified)* | Contract JSON Schema | Updates `agentPolicy` definition with `differentReviewerPolicy`. | [`schemas/task-contract.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-contract.schema.json#L100-L107) | Adds enum validation for `differentReviewerPolicy`. |
| [`test/task-matrix.test.ts`](file:///D:/dev/alpha-AOS/test/task-matrix.test.ts) *(created)* | 125 Role Triples Matrix Suite | Deterministic mock fixture testing all 125 ($5 \times 5 \times 5$) role combinations -> asserts fail-closed missing proof attribution. | [`test/task-agents.test.ts`](file:///D:/dev/alpha-AOS/test/task-agents.test.ts#L45-L100) | Exhaustive 125-triple synthesis test (ROL-01, D-03); validates exact missing proof error messages. |
| [`test/task-receipts.test.ts`](file:///D:/dev/alpha-AOS/test/task-receipts.test.ts) *(created)* | Role Receipts & Drift Test Suite | Tests receipt storage, schema validation, binary SHA-256 calculation, and Version Drift detection/demotion. | [`test/validation.test.ts`](file:///D:/dev/alpha-AOS/test/validation.test.ts) | Verifies D-02 and D-04; validates that modified binaries immediately drop to `unverified`. |
| [`test/task-controller-lease.test.ts`](file:///D:/dev/alpha-AOS/test/task-controller-lease.test.ts) *(created)* | Fenced Controller Lease Suite | Tests atomic `open('wx')`, `LOCKED_PROJECT_CONTROLLER` conflict, zombie lock auto-reclaim (`isProcessAlive === false`), and audit log. | [`test/brownfield-gsd-cycle.test.ts`](file:///D:/dev/alpha-AOS/test/brownfield-gsd-cycle.test.ts), [`test/isolation.test.ts`](file:///D:/dev/alpha-AOS/test/isolation.test.ts#L25-L56) | Verifies D-05, D-06, D-08; guarantees single-writer authority on `.alpha-aos/controller.lock`. |
| [`test/task-tree-guard.test.ts`](file:///D:/dev/alpha-AOS/test/task-tree-guard.test.ts) *(created)* | Tree Mutation Guard Suite | Tests reviewer mutation detection (file creation, modification, deletion), system file filtering, and `INVALID_MUTATING_REVIEW`. | [`test/task-check.test.ts`](file:///D:/dev/alpha-AOS/test/task-check.test.ts), [`test/worker-authority.test.ts`](file:///D:/dev/alpha-AOS/test/worker-authority.test.ts#L80-L120) | Verifies D-11; asserts that mutating reviewers are rejected and clean reviewers succeed. |
| [`test/task-telemetry.test.ts`](file:///D:/dev/alpha-AOS/test/task-telemetry.test.ts) *(created)* | Telemetry & Meter Gate Suite | Tests parsing measured vs unmetered fields, no brand-free assumptions, and `MISSING_TELEMETRY_METER` fail-closed gate. | [`test/task-contract.test.ts`](file:///D:/dev/alpha-AOS/test/task-contract.test.ts) | Verifies D-13, D-14, D-15; tests contracts with and without cost/token limits against metered and unmetered adapters. |
| [`test/task-doctor.test.ts`](file:///D:/dev/alpha-AOS/test/task-doctor.test.ts) *(created)* | 3D Doctor Report Suite | Tests 3D diagnostic table formatting and data extraction across roles, MCP/skills, and telemetry. | [`test/support-matrix.test.ts`](file:///D:/dev/alpha-AOS/test/support-matrix.test.ts), [`test/doctor.test.ts`](file:///D:/dev/alpha-AOS/test/doctor.test.ts) | Verifies D-16; tests both terminal table rendering and `--json` envelope. |
| [`test/worker-authority.test.ts`](file:///D:/dev/alpha-AOS/test/worker-authority.test.ts) *(modified)* | Worker Authority Migration Suite | Migrates legacy D-10 Hermes hardcoding assertions to receipt + fenced lease token verification. | [`test/worker-authority.test.ts`](file:///D:/dev/alpha-AOS/test/worker-authority.test.ts#L38-L55) | Updates tests to verify that Hermes with receipt & lease is a valid controller, while unverified or unleased fails. |
| [`test/task-tracer.integration.ts`](file:///D:/dev/alpha-AOS/test/task-tracer.integration.ts) *(verified/integrated)* | Live Vertical Tracer (Codex SC6) | Live tracer proving Codex controller defect reproduction refusal and stale review substitution. | [`test/task-tracer.integration.ts`](file:///D:/dev/alpha-AOS/test/task-tracer.integration.ts#L370-L554) | Satisfies Phase 16 Success Criterion 6 (transferred from Plan 14-09). |

---

## Detailed Component & Pattern Analyses

### 1. Harness Role Registry & Dynamic Dispatcher (`src/adapters/task-agents.ts`)

#### Pattern Description
`src/adapters/task-agents.ts` is the central registry and dispatch boundary for agent roles. Previously, it hardcoded [`TASK_BOOTSTRAP_PAIR = { controller: "codex", executor: "codex", reviewer: "claude" }`](file:///D:/dev/alpha-AOS/src/adapters/task-agents.ts#L28) and rejected any other assignment.
In Phase 16, this module expands to support all 5 harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`) across all 3 roles (`controller`, `executor`, `reviewer`), producing a 125-triple composable role space.
It validates the requested `TaskAgentPolicy` against invocation receipts stored in `~/.alpha-aos/receipts/harnesses/` (or a configurable root), detects binary/version drift (D-02), validates `differentReviewerPolicy` (D-10), and dynamically binds `TaskPorts` to the respective native adapters.

#### Existing Analog
- [`src/adapters/task-agents.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-agents.ts#L45-L80): Current `probeTaskAgentPair` and `nativeTaskPorts`.
- [`src/adapters/task-agent-launch.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-agent-launch.ts#L91-L164): Resolution, executable naming, and version probing.

#### Concrete Code Pattern
```typescript
// Excerpt from src/adapters/task-agents.ts (Phase 16 Architecture)
import type { HarnessId } from "../types.js";
import type { TaskAgentPolicy } from "../core/task-contract.js";
import type { TaskPortAssessment, TaskPorts, ControllerPort, ReviewerPort } from "../core/task-run.js";
import { readHarnessRoleReceipt, type HarnessRoleReceipt } from "./task-receipts.js";
import { runClaudeReviewer, probeClaudeVersion, type ClaudeAdapterOptions } from "./task-claude.js";
import { runCodexController, probeCodexVersion, type CodexAdapterOptions } from "./task-codex.js";
import { runAntigravityController, runAntigravityReviewer, probeAntigravityVersion, type AntigravityAdapterOptions } from "./task-antigravity.js";
import { runPiController, runPiReviewer, probePiVersion, type PiAdapterOptions } from "./task-pi.js";
import { runHermesController, runHermesReviewer, probeHermesVersion, type HermesAdapterOptions } from "./task-hermes.js";

export const ALL_HARNESSES: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"] as const;
export const ALL_ROLES = ["controller", "executor", "reviewer"] as const;
export type Role = (typeof ALL_ROLES)[number];

export interface RoleCapabilityAssessment {
  supported: boolean;
  controller: { harness: HarnessId; version: string | null; executable: string | null };
  executor: { harness: HarnessId; version: string | null; executable: string | null };
  reviewer: { harness: HarnessId; version: string | null; executable: string | null };
  missingProof: string[];
}

export async function verifyRoleCapabilities(
  policy: TaskAgentPolicy,
  options: { receiptsRoot?: string; probeVersion?: boolean } = {}
): Promise<RoleCapabilityAssessment> {
  const missingProof: string[] = [];
  const proven: Record<Role, { version: string | null; executable: string | null }> = {
    controller: { version: null, executable: null },
    executor: { version: null, executable: null },
    reviewer: { version: null, executable: null },
  };

  for (const role of ALL_ROLES) {
    const harness = policy[role];
    const proof = await readHarnessRoleReceipt(harness, role, options.receiptsRoot);
    if (!proof.receipt) {
      missingProof.push(`${role} ${harness}: no native invocation receipt for ${role} (ROL-01, D-01)`);
    } else if (proof.versionDrift) {
      missingProof.push(`${role} ${harness}: version drift detected: ${proof.driftReason} (D-02)`);
    } else {
      proven[role] = { version: proof.receipt.version, executable: proof.receipt.executable };
    }
  }

  // D-10: differentReviewerPolicy verification
  if (policy.differentReviewerPolicy === "require-different-harness") {
    if (policy.reviewer === policy.controller || policy.reviewer === policy.executor) {
      missingProof.push(
        `differentReviewerPolicy requires a different reviewer harness, but reviewer '${policy.reviewer}' matches controller or executor (D-10)`
      );
    }
  }

  return {
    supported: missingProof.length === 0,
    controller: { harness: policy.controller, ...proven.controller },
    executor: { harness: policy.executor, ...proven.executor },
    reviewer: { harness: policy.reviewer, ...proven.reviewer },
    missingProof,
  };
}

export function createDynamicTaskPorts(policy: TaskAgentPolicy, options: DynamicTaskPortOptions = {}): TaskPorts {
  const controllerMap: Record<HarnessId, ControllerPort> = {
    codex: { dispatch: (req) => runCodexController(req, options.codex) },
    claude: { dispatch: (req) => runClaudeController(req, options.claude) },
    antigravity: { dispatch: (req) => runAntigravityController(req, options.antigravity) },
    pi: { dispatch: (req) => runPiController(req, options.pi) },
    hermes: { dispatch: (req) => runHermesController(req, options.hermes) },
  };

  const reviewerMap: Record<HarnessId, ReviewerPort> = {
    claude: { review: (req) => runClaudeReviewer(req, options.claude) },
    codex: { review: (req) => runCodexReviewer(req, options.codex) },
    antigravity: { review: (req) => runAntigravityReviewer(req, options.antigravity) },
    pi: { review: (req) => runPiReviewer(req, options.pi) },
    hermes: { review: (req) => runHermesReviewer(req, options.hermes) },
  };

  return {
    controller: controllerMap[policy.controller],
    reviewer: reviewerMap[policy.reviewer],
    assess: (p) => verifyRoleCapabilities(p, options),
  };
}
```

---

### 2. Native Harness Adapters (`task-antigravity.ts`, `task-pi.ts`, `task-hermes.ts`)

#### Pattern Description
Each harness adapter bridges alpha-AOS contracts to the respective CLI's native machine interface without ever invoking a command shell (`shell: false`).
- **Antigravity (`agy`)**: Operates in non-interactive print mode (`-p`), emits JSON (`--output-format json`), uses `--json-schema <path>`, supports plan mode for reviewer and accept-edits mode for controller/executor, and enforces `--sandbox`.
- **Pi (`pi`)**: Operates in `-p` or `--mode rpc`, restricts tools for reviewer (`--tools read,grep,find,ls`), sets `--no-approve`, `--no-session`. Critically, it implements teardown defense against the Windows Node/libuv stdin crash (code 0xC0000409) by validating stdout JSON completeness.
- **Hermes (`hermes`)**: Operates in one-shot mode (`-z, --oneshot <prompt>`), writes usage to `--usage-file <path>`, uses `--toolsets <set>`, `--ignore-rules`, and runs in specified directory `--in <dir>`. Controller role requires valid lease token and receipt.

#### Existing Analog
- [`src/adapters/task-codex.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-codex.ts#L41-L45): Name-only environment whitelist (`uniqueNames([...TASK_AGENT_BASE_ENVIRONMENT_NAMES, ...])`).
- [`src/adapters/task-codex.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-codex.ts#L435-L442): Ephemeral work directory, writing schema files, removing stale last-message files.
- [`src/adapters/task-claude.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-claude.ts#L69-L92): Explicit argument vectors, read-only tool restrictions, plan mode, strict MCP configuration.
- [`src/adapters/capability-oracle.ts`](file:///D:/dev/alpha-AOS/src/adapters/capability-oracle.ts#L533-L540): Handling of Windows libuv assertion teardown codes.

#### Concrete Code Pattern
```typescript
// Excerpt from src/adapters/task-pi.ts (Handling Windows teardown and read-only tools)
import { runProcess, type ProcessResult, type ProcessSpec } from "../core/process.js";
import { resolveTaskAgentLaunch, nameOnlyEnvironment, TASK_AGENT_BASE_ENVIRONMENT_NAMES, uniqueNames } from "./task-agent-launch.js";
import type { ReviewRequest, ReviewDispatchResult } from "../core/task-run.js";

export const PI_TASK_ENVIRONMENT_NAMES = uniqueNames([
  ...TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  "PI_CODING_AGENT_DIR",
]);

export function piReviewerArgs(options: { schemaPath: string; prompt: string }): string[] {
  return [
    "-p",
    "--mode", "rpc",
    "--tools", "read,grep,find,ls", // Strictly read-only tools (D-11)
    "--no-approve",
    "--no-session",
    "--json-schema", options.schemaPath,
    options.prompt,
  ];
}

/**
 * Interprets Pi exit status, defending against Windows libuv stdin teardown crash (0xC0000409 / 3221226505).
 * If stdout contains a complete, valid JSON review report, the teardown crash is treated as successful completion.
 */
export function interpretPiExitResult(result: ProcessResult, parsedOutput: unknown | null): { status: "ok" | "failed"; detail: string | null } {
  if (result.code === "ok" && result.exitCode === 0) {
    return { status: "ok", detail: null };
  }
  // Windows libuv stdin close assertion failure (D-12, Pitfall 4)
  const isWindowsTeardownCrash = process.platform === "win32" && (result.exitCode === 3221226505 || result.exitCode === 1);
  if (isWindowsTeardownCrash && parsedOutput !== null) {
    return { status: "ok", detail: "pi process teardown exited with libuv assertion after successfully producing valid output" };
  }
  return {
    status: "failed",
    detail: `pi execution failed with ${result.code} (exit ${String(result.exitCode)}): ${result.stderr.excerpt.trim()}`,
  };
}
```

```typescript
// Excerpt from src/adapters/task-hermes.ts (One-shot execution & usage file parsing)
export function hermesControllerArgs(options: { prompt: string; usageFile: string; projectRoot: string }): string[] {
  return [
    "-z",
    options.prompt,
    "--usage-file", options.usageFile,
    "--toolsets", "file,git,terminal",
    "--ignore-rules",
    "--in", options.projectRoot,
  ];
}
```

---

### 3. Harness Role Receipts Store & Version Drift Detector (`src/adapters/task-receipts.ts`)

#### Pattern Description
Pursuant to **D-01, D-02, and D-04**, each harness and role combination must have an explicit Invocation Receipt stored as an individual JSON file:
`~/.alpha-aos/receipts/harnesses/<harness>-<role>.json`
The receipt records the CLI version, binary SHA-256 hash, verified execution/output/cancellation flags, probe timestamp, and sample execution digest.
When validating roles at contract preview or launch:
1. If the receipt does not exist: the role is rejected fail-closed with a specific missing proof message (e.g. `pi: no native invocation receipt for controller`).
2. If the receipt exists, the current host binary's SHA-256 and version are computed via `probeLaunchVersion`. If either has drifted (Version Drift), the role is immediately demoted to `unverified`, prompting the user to run `alpha-aos task probe`.

#### Existing Analog
- [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L193-L211): Atomic creation with `open(path, 'wx')`, writing UTF-8 JSON, `sync()`, and closing.
- [`src/adapters/task-agent-launch.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-agent-launch.ts#L138-L164): `probeLaunchVersion` bound by timeout.
- [`src/core/paths.js`](file:///D:/dev/alpha-AOS/src/core/paths.js): User home receipt resolution.

#### Concrete Code Pattern
```typescript
// Excerpt from src/adapters/task-receipts.ts
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessId } from "../types.js";
import { resolveTaskAgentLaunch, probeLaunchVersion, nameOnlyEnvironment, TASK_AGENT_BASE_ENVIRONMENT_NAMES } from "./task-agent-launch.js";
import { syncDirectory } from "../core/writer-lock.js";

export interface HarnessRoleReceipt {
  schemaVersion: 1;
  harness: HarnessId;
  role: "controller" | "executor" | "reviewer";
  version: string;
  binarySha256: string;
  executable: string;
  probedAt: string;
  capabilities: {
    invoked: boolean;
    cancelled: boolean;
    outputParsed: boolean;
    readOnlyGuaranteed?: boolean;
  };
  sampleDigest: string;
}

export interface ReceiptReadResult {
  receipt: HarnessRoleReceipt | null;
  versionDrift: boolean;
  driftReason: string | null;
}

export function receiptFilePath(harness: HarnessId, role: string, root?: string): string {
  const base = root ?? join(homedir(), ".alpha-aos", "receipts", "harnesses");
  return join(base, `${harness}-${role}.json`);
}

export async function computeBinarySha256(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function readHarnessRoleReceipt(
  harness: HarnessId,
  role: string,
  receiptsRoot?: string
): Promise<ReceiptReadResult> {
  const path = receiptFilePath(harness, role, receiptsRoot);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") return { receipt: null, versionDrift: false, driftReason: null };
    throw err;
  }

  const receipt = JSON.parse(text) as HarnessRoleReceipt;

  // D-02: Check version and binary hash drift against host binary
  const launch = resolveTaskAgentLaunch(harness);
  if (launch.status !== "ok") {
    return { receipt, versionDrift: true, driftReason: `CLI executable no longer resolvable: ${launch.reason}` };
  }

  const currentBinaryHash = await computeBinarySha256(launch.executable).catch(() => null);
  if (currentBinaryHash && currentBinaryHash !== receipt.binarySha256) {
    return {
      receipt,
      versionDrift: true,
      driftReason: `binary hash mismatch (receipt: ${receipt.binarySha256.slice(0, 12)}, current: ${currentBinaryHash.slice(0, 12)}). Re-probe required.`,
    };
  }

  return { receipt, versionDrift: false, driftReason: null };
}

export async function writeHarnessRoleReceipt(
  receipt: HarnessRoleReceipt,
  receiptsRoot?: string
): Promise<void> {
  const path = receiptFilePath(receipt.harness, receipt.role, receiptsRoot);
  const dir = join(path, "..");
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const tempPath = `${path}.tmp.${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(receipt, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  // Rename for atomic update
  const { rename } = await import("node:fs/promises");
  await rename(tempPath, path);
  await syncDirectory(dir);
}
```

---

### 4. Project-Local Controller Fenced Lease (`src/core/controller-lease.ts`)

#### Pattern Description
Pursuant to **D-05, D-06, and D-08**, alpha-AOS guarantees that **only one controller** can modify GSD state for a project at any given time.
- The lease file is placed at `<projectRoot>/.alpha-aos/controller.lock`.
- It is created using `fs.open(path, 'wx', 0o600)` to ensure atomic single-creator arbitration.
- When an active lock file already exists:
  - It checks whether the holding process is still alive on the same host using [`isProcessAlive(pid)`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L92).
  - **If alive**: It immediately throws `ControllerLockConflictError` (`code = "LOCKED_PROJECT_CONTROLLER"`), outputting active holder metadata (harness, pid, host, startedAt, contractDigest). It **does not wait**, **does not overwrite**, and **fails fast**.
  - **If dead (Zombie Lock)**: It logs an audit record to `<projectRoot>/.alpha-aos/controller-lease-audit.jsonl` and auto-reclaims the lock for the new controller.
- The returned lease object provides an atomic `release()` method that deletes the lock file only if the current file's token matches this controller's token.

#### Existing Analog
- [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L49-L63): `WriterConflictError` pattern with code `ACTIVE_WRITER`.
- [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L92-L101): `isProcessAlive` using `process.kill(pid, 0)`.
- [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L193-L211): Exclusive file creation and fsync via `syncDirectory`.

#### Concrete Code Pattern
```typescript
// Excerpt from src/core/controller-lease.ts
import { open, readFile, rm, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { isProcessAlive, syncDirectory } from "./writer-lock.js";
import type { HarnessId } from "../types.js";

export interface ControllerLockRecord {
  schemaVersion: 1;
  harness: HarnessId;
  token: string;
  pid: number;
  host: string;
  startedAt: string;
  contractDigest: string;
}

export class ControllerLockConflictError extends Error {
  readonly code = "LOCKED_PROJECT_CONTROLLER";
  readonly activeController: Omit<ControllerLockRecord, "token">;

  constructor(active: ControllerLockRecord) {
    super(
      `LOCKED_PROJECT_CONTROLLER: Another controller holds this project: ` +
      `harness=${active.harness}, pid=${active.pid}, host=${active.host}, startedAt=${active.startedAt}, ` +
      `contractDigest=${active.contractDigest.slice(0, 12)}. Cannot run two controllers simultaneously on the same project (D-05, ROL-03).`
    );
    this.name = "ControllerLockConflictError";
    const { token: _, ...safe } = active;
    this.activeController = safe;
  }
}

export interface ControllerLease {
  token: string;
  record: ControllerLockRecord;
  release: () => Promise<void>;
}

export async function acquireControllerLease(options: {
  projectRoot: string;
  harness: HarnessId;
  contractDigest: string;
}): Promise<ControllerLease> {
  const lockDir = join(options.projectRoot, ".alpha-aos");
  await mkdir(lockDir, { recursive: true, mode: 0o700 });
  const lockPath = join(lockDir, "controller.lock");
  const auditPath = join(lockDir, "controller-lease-audit.jsonl");

  const record: ControllerLockRecord = {
    schemaVersion: 1,
    harness: options.harness,
    token: randomUUID(),
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    contractDigest: options.contractDigest,
  };

  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (err: any) {
    if (err.code !== "EEXIST") throw err;

    const existingText = await readFile(lockPath, "utf8").catch(() => null);
    if (!existingText) throw new Error("controller.lock exists but could not be read");
    const existing = JSON.parse(existingText) as ControllerLockRecord;

    const isSameHost = existing.host === hostname();
    const isAlive = isSameHost && isProcessAlive(existing.pid);

    if (isAlive) {
      // D-05: Active controller detected -> Fail-Fast
      throw new ControllerLockConflictError(existing);
    }

    // D-06: Dead process detected -> Zombie Auto-Reclaim with audit logging
    const auditLog = {
      reclaimedAt: new Date().toISOString(),
      reason: isSameHost ? "stale-process-dead" : "cross-host-stale",
      previous: existing,
      reclaimedBy: { harness: options.harness, pid: process.pid, token: record.token },
    };
    await appendFile(auditPath, JSON.stringify(auditLog) + "\n", "utf8");
    await rm(lockPath, { force: true });
    handle = await open(lockPath, "wx", 0o600);
  }

  try {
    await handle.writeFile(JSON.stringify(record, null, 2) + "\n", "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(lockDir);

  return {
    token: record.token,
    record,
    release: async () => {
      try {
        const currentText = await readFile(lockPath, "utf8").catch(() => null);
        if (currentText) {
          const current = JSON.parse(currentText) as ControllerLockRecord;
          if (current.token === record.token) {
            await rm(lockPath, { force: true });
            await syncDirectory(lockDir);
          }
        }
      } catch {
        // Ignored during shutdown
      }
    },
  };
}
```

---

### 5. Worker Authority Bridge & D-10 Migration (`src/core/worker-authority.ts`)

#### Pattern Description
In Phase 4, decision **D-10** hardcoded Hermes as worker-only:
[`if (harnessId === "hermes") throw new WorkerAuthorityError("unauthorized-controller", "hermes", ...);`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L58-L64)
Pursuant to **D-07 and ROL-03**, this hardcoding is fully migrated to the harness-neutral receipt-and-fenced-lease model:
- `assertControllerRole` is refactored from `assertControllerRole(harnessId: HarnessId)` to:
  `assertControllerRole(harnessId: HarnessId, context?: { hasReceipt?: boolean; hasLease?: boolean })`
- Instead of checking if `harnessId === "hermes"`, it enforces that the harness has verified controller role capability and holds a valid lease.
- In `src/core/task-contract.ts` (lines 386-394), the Hermes-specific try/catch conversion to `unsupported-controller` is updated so that any harness lacking a receipt or lease is reported with neutral proof attribution.

#### Existing Analog
- [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L57-L76): Existing `assertControllerRole` and `resolveHarnessRole`.
- [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L386-L394): Contract loading authority assertion.

#### Concrete Code Pattern
```typescript
// Excerpt from src/core/worker-authority.ts (Migrated D-07 Pattern)
export function assertControllerRole(
  harnessId: HarnessId,
  context?: { hasReceipt?: boolean; hasLease?: boolean }
): void {
  // If verification context is supplied, enforce receipt and lease proofs
  if (context) {
    if (context.hasReceipt === false) {
      throw new WorkerAuthorityError(
        "unauthorized-controller",
        harnessId,
        `Harness '${harnessId}' lacks a verified controller invocation receipt (ROL-01, D-01)`
      );
    }
    if (context.hasLease === false) {
      throw new WorkerAuthorityError(
        "unauthorized-controller",
        harnessId,
        `Harness '${harnessId}' does not hold a valid controller fencing lease (ROL-03, D-05)`
      );
    }
  }
}

export function resolveHarnessRole(
  initiatorHarness: HarnessId,
  targetHarness: HarnessId,
  targetHasControllerProof: boolean = false
): GsdRole {
  if (targetHarness === initiatorHarness) {
    return "controller";
  }
  // When target has explicit controller receipt and is granted authority, it may act as controller
  if (targetHasControllerProof) {
    return "controller";
  }
  return "worker";
}
```

---

### 6. Reviewer Tree Mutation Guard (`src/core/tree-mutation-guard.ts`)

#### Pattern Description
Pursuant to **D-11 and ROL-04**, independent reviewers must strictly adhere to a **read-only invariant**. Reviewers evaluate existing artifacts and measurements; they must never mutate the project tree or create backdoor modifications.
`TreeMutationGuard`:
1. Collects a pre-review snapshot of all files and their SHA-256 hashes using [`collectTaskArtifact`](file:///D:/dev/alpha-AOS/src/core/task-check.ts#L57).
2. Executes the reviewer session (with read-only tools and session isolation per D-09).
3. Collects a post-review snapshot and performs a diff.
4. Ignores harmless OS metadata files (e.g. `.DS_Store`, `Thumbs.db`, `desktop.ini`).
5. If any project file was **created**, **modified**, or **deleted**:
   - Immediately throws/returns `INVALID_MUTATING_REVIEW`.
   - The review verdict is invalidated and rejected fail-closed.

#### Existing Analog
- [`src/core/task-check.ts`](file:///D:/dev/alpha-AOS/src/core/task-check.ts#L51-L60): `TaskArtifactManifest` and `TaskArtifactFile`.
- [`src/core/task-run.ts`](file:///D:/dev/alpha-AOS/src/core/task-run.ts#L1048-L1055): Re-hashing artifact snapshots after reviewer execution.
- [`src/core/worker-authority.ts`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L135-L160): `snapshotPlanningTree` and `comparePlanningTrees`.

#### Concrete Code Pattern
```typescript
// Excerpt from src/core/tree-mutation-guard.ts
import { collectTaskArtifact, type TaskArtifactManifest } from "./task-check.js";

const IGNORED_OS_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

export interface TreeMutationResult {
  mutated: boolean;
  code: "ok" | "INVALID_MUTATING_REVIEW";
  violations: string[];
}

export async function captureTreeSnapshot(projectRoot: string, allowedRoots: string[]): Promise<TaskArtifactManifest> {
  const manifest = await collectTaskArtifact({ projectRoot, allowedRoots });
  if (manifest.status !== "ok") {
    throw new Error(`Failed to capture tree snapshot: ${manifest.cause} ${manifest.detail}`);
  }
  return manifest;
}

export function evaluateTreeMutations(
  before: TaskArtifactManifest,
  after: TaskArtifactManifest
): TreeMutationResult {
  if (before.digest === after.digest) {
    return { mutated: false, code: "ok", violations: [] };
  }

  const beforeMap = new Map(before.files.map((f) => [f.path, f.sha256]));
  const afterMap = new Map(after.files.map((f) => [f.path, f.sha256]));
  const violations: string[] = [];

  for (const [path, hash] of afterMap) {
    const filename = path.split("/").pop() ?? "";
    if (IGNORED_OS_FILES.has(filename)) continue;

    if (!beforeMap.has(path)) {
      violations.push(`created: ${path}`);
    } else if (beforeMap.get(path) !== hash) {
      violations.push(`modified: ${path}`);
    }
  }

  for (const [path] of beforeMap) {
    const filename = path.split("/").pop() ?? "";
    if (IGNORED_OS_FILES.has(filename)) continue;
    if (!afterMap.has(path)) {
      violations.push(`deleted: ${path}`);
    }
  }

  return {
    mutated: violations.length > 0,
    code: violations.length > 0 ? "INVALID_MUTATING_REVIEW" : "ok",
    violations,
  };
}
```

---

### 7. Telemetry Normalization & Fail-Closed Metering (`src/core/task-telemetry.ts`)

#### Pattern Description
Pursuant to **D-13, D-14, and D-15**:
1. **Measured vs Unmetered Distinction**: Harness outputs are parsed strictly for actual reported fields: `promptTokens`, `completionTokens`, `durationMs`, and `modelId`. Unreported fields are preserved as `null` or marked `"unmetered"`; they are **never** coerced to `0`.
2. **Brand-Free Neutrality**: Local Hermes, Ollama, or subscription CLIs are never assumed to be 0 USD. If pricing/usage cannot be measured directly by the harness adapter, cost fields are marked `unmetered`.
3. **Fail-Closed Meter Gate (`MISSING_TELEMETRY_METER`)**: If a contract defines `resourcePolicy.maxCostUsd` or `resourcePolicy.maxTokens`, but any assigned harness lacks token/cost measuring capabilities, contract preview immediately rejects execution with `MISSING_TELEMETRY_METER`.

#### Existing Analog
- [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L54-L59): `TaskResourcePolicy` (`maxCostUsd`, `maxTokens`).
- [`src/core/task-contract.ts`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L890-L920): `evaluateResourceLimits`.
- [`src/adapters/task-codex.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-codex.ts#L56-L63): `CodexEvents.usage`.

#### Concrete Code Pattern
```typescript
// Excerpt from src/core/task-telemetry.ts
import type { HarnessId } from "../types.js";
import type { TaskResourcePolicy, TaskAgentPolicy } from "./task-contract.js";

export interface NormalizedTelemetry {
  harness: HarnessId;
  status: "measured" | "unmetered";
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  modelId: string | null;
}

export interface TelemetryReadiness {
  ready: boolean;
  missingMeters: string[];
}

export const HARNESS_TELEMETRY_CAPABILITIES: Record<HarnessId, { metersTokens: boolean; metersCost: boolean }> = {
  codex: { metersTokens: true, metersCost: false },
  claude: { metersTokens: true, metersCost: true },
  antigravity: { metersTokens: true, metersCost: false },
  pi: { metersTokens: false, metersCost: false },
  hermes: { metersTokens: true, metersCost: false },
};

export function checkCostMeterReadiness(
  agentPolicy: TaskAgentPolicy,
  resourcePolicy: TaskResourcePolicy
): TelemetryReadiness {
  const missingMeters: string[] = [];
  const requiresCost = resourcePolicy.maxCostUsd !== undefined;
  const requiresTokens = resourcePolicy.maxTokens !== undefined;

  if (!requiresCost && !requiresTokens) {
    return { ready: true, missingMeters: [] };
  }

  const assignedHarnesses = new Set([agentPolicy.controller, agentPolicy.executor, agentPolicy.reviewer]);

  for (const harness of assignedHarnesses) {
    const caps = HARNESS_TELEMETRY_CAPABILITIES[harness];
    if (requiresTokens && !caps.metersTokens) {
      missingMeters.push(`${harness}: does not measure token consumption, required by maxTokens (D-14)`);
    }
    if (requiresCost && !caps.metersCost) {
      missingMeters.push(`${harness}: does not measure USD cost, required by maxCostUsd (D-14)`);
    }
  }

  return {
    ready: missingMeters.length === 0,
    missingMeters,
  };
}
```

---

### 8. Task Doctor 3D Matrix Report & CLI Integration (`src/core/task-doctor.ts`, `src/cli.ts`)

#### Pattern Description
Pursuant to **D-16 and ROL-05**, `alpha-aos task doctor` provides a 3-dimensional diagnostic report across:
1. **Role Capability Proofs**: Verified status (`PROVEN`, `UNVERIFIED`, `MISSING`) for Controller, Executor, and Reviewer.
2. **Native Tool & MCP Integration**: Support for native skills, Read/Grep tools, and MCP servers.
3. **Telemetry & Metering Capabilities**: Measured vs unmetered classification for tokens and cost.

#### Existing Analog
- [`src/core/support-matrix.ts`](file:///D:/dev/alpha-AOS/src/core/support-matrix.ts#L25-L40): `EvaluatedMatrixCell` and `SupportMatrixReport`.
- [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L1770-L1940): Command option parsing, table display, and `--json` envelope.

#### Concrete Code Pattern
```typescript
// Excerpt from src/core/task-doctor.ts
import { ALL_HARNESSES, type Role } from "../adapters/task-agents.js";
import { readHarnessRoleReceipt } from "../adapters/task-receipts.js";
import { HARNESS_TELEMETRY_CAPABILITIES } from "./task-telemetry.js";

export interface HarnessDoctorEntry {
  harness: string;
  roles: {
    controller: "PROVEN" | "UNVERIFIED" | "MISSING";
    executor: "PROVEN" | "UNVERIFIED" | "MISSING";
    reviewer: "PROVEN" | "UNVERIFIED" | "MISSING";
  };
  toolsAndMcp: string;
  telemetry: "measured (tokens)" | "measured (tokens+cost)" | "unmetered";
}

export async function buildTaskDoctorReport(receiptsRoot?: string): Promise<HarnessDoctorEntry[]> {
  const report: HarnessDoctorEntry[] = [];

  for (const harness of ALL_HARNESSES) {
    const roles: HarnessDoctorEntry["roles"] = {
      controller: "MISSING",
      executor: "MISSING",
      reviewer: "MISSING",
    };

    for (const role of ["controller", "executor", "reviewer"] as const) {
      const res = await readHarnessRoleReceipt(harness, role, receiptsRoot);
      if (res.receipt && !res.versionDrift) {
        roles[role] = "PROVEN";
      } else if (res.versionDrift) {
        roles[role] = "UNVERIFIED";
      } else {
        roles[role] = "MISSING";
      }
    }

    const caps = HARNESS_TELEMETRY_CAPABILITIES[harness];
    const telemetry = caps.metersCost
      ? "measured (tokens+cost)"
      : caps.metersTokens
      ? "measured (tokens)"
      : "unmetered";

    report.push({
      harness,
      roles,
      toolsAndMcp: harness === "claude" ? "Native (Read, Grep, MCP)" : "Native CLI tools",
      telemetry,
    });
  }

  return report;
}
```

---

## Anti-Patterns & Don't Hand-Roll Standards

| Domain | Prohibited Anti-Pattern (Don't Hand-Roll) | Adopted Standard Pattern | Rationale |
|---|---|---|---|
| **Process Concurrency Lock** | Hand-rolled timeouts, advisory locks, or non-exclusive `writeFile` / `existsSync` checks. | Atomic `open(lockPath, "wx", 0o600)` and directory fsync ([`syncDirectory`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L13)). | Prevents race windows between two simultaneous controllers. Guaranteed atomic by OS kernel. |
| **Process Aliveness Check** | Parsing shell output from `ps`, `tasklist`, or `pgrep`. | `isProcessAlive(pid)` using Node.js `process.kill(pid, 0)` ([`src/core/writer-lock.ts:92`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L92)). | Zero subprocess overhead; cross-platform standard; distinguishes dead processes from permissions boundaries (`EPERM`). |
| **Tree Mutation Check** | Checking file modification timestamps (`mtime`) or simple directory file counts. | Content SHA-256 manifests using [`collectTaskArtifact`](file:///D:/dev/alpha-AOS/src/core/task-check.ts#L57) filtered against system metadata files. | Timestamps can drift or be preserved by tools. Byte-level hashing guarantees absolute source immutability. |
| **Harness Launch Invocation** | Invoking harnesses through `cmd.exe /c`, `powershell.exe`, or `sh -c`. | Direct process invocation with `shell: false` via [`resolveTaskAgentLaunch`](file:///D:/dev/alpha-AOS/src/adapters/task-agent-launch.ts#L91). | Shell interpolation is vulnerable to command injection, argument escaping flaws, and environment leakage. |
| **Missing Telemetry Coercion** | Defaulting missing token or cost fields to `0` or `0.00 USD`. | Honest `null` or `"unmetered"` preservation (D-13, D-15). | Defaulting to 0 deceives auditing and can silently allow unmetered runs to exceed budgets. |
| **Floating Point Currency** | Raw IEEE-754 floating-point arithmetic for dollars/cents. | Explicit integer-cent rounding: `Math.round(val * 100) / 100` ([`src/core/task-contract.ts:899`](file:///D:/dev/alpha-AOS/src/core/task-contract.ts#L899)). | Prevents floating-point accumulation drift during budget evaluation. |

---

## Concurrency, Security & Multi-Platform Invariants

### 1. Concurrency Fencing & Single-Writer Invariant
- **The Invariant**: Within any project directory, exactly one controller process may hold an active lease. No other process may transition GSD state or modify planning files while the lease is held.
- **Enforcement Mechanism**:
  1. `acquireControllerLease` attempts atomic creation of `.alpha-aos/controller.lock`.
  2. If an active process holds the file, the newcomer immediately throws `ControllerLockConflictError` (`code = "LOCKED_PROJECT_CONTROLLER"`). It does not block or retry.
  3. If the PID is dead, `isProcessAlive` detects the zombie state, logs an audit line to `controller-lease-audit.jsonl`, removes the dead file, and re-claims the lease.
  4. At task termination, `release()` safely checks matching token ownership before deleting the lock file.

### 2. STRIDE & ASVS Security Controls
- **Spoofing**: Defended by binary SHA-256 integrity hashing in `task-receipts.ts`. Modified binaries fail Version Drift checks.
- **Tampering**: Defended by `TreeMutationGuard` on reviewer runs and atomic `controller.lock` on controller runs.
- **Repudiation**: Defended by audit logs in `controller-lease-audit.jsonl` recording PID, host, harness, and contract digests.
- **Information Disclosure**: Defended by name-only environment allowlisting ([`nameOnlyEnvironment`](file:///D:/dev/alpha-AOS/src/adapters/task-agent-launch.ts#L70)) and home redaction ([`redactHome`](file:///D:/dev/alpha-AOS/src/core/paths.js)).
- **Denial of Service**: Defended by zombie lock auto-reclaim and fail-closed telemetry budget gates (`MISSING_TELEMETRY_METER`).
- **Elevation of Privilege**: Defended by sanitizing worker specs (`ALPHA_AOS_GSD_ROLE: "worker"` in [`sanitizeWorkerLaunchSpec`](file:///D:/dev/alpha-AOS/src/core/worker-authority.ts#L90)) and removing GSD orchestrator workflows from worker prompts.

### 3. Windows 11 Host Specifics
- **Process Teardown Crash Defense (Pitfall 4)**: On Windows, Node.js 24 child processes interacting with stdin may trigger libuv assertion failures (code `0xC0000409` or `1`) upon closing. The adapter checks output completeness before flagging failure.
- **Case-Insensitive Environment Names**: Handled by [`uniqueNames`](file:///D:/dev/alpha-AOS/src/adapters/task-agent-launch.ts#L57) ensuring uppercase deduplication.
- **File System Syncing**: Directory syncing ([`syncDirectory`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L13)) safely handles platforms where directory fd sync is unsupported.

---

## Verification & Test Patterns

### 1. Deterministic 125-Triple Matrix Fixture (`test/task-matrix.test.ts`)
```typescript
// Test Pattern for ROL-01 / D-03: 125 Composable Role Triplets
import test from "node:test";
import assert from "node:assert/strict";
import { ALL_HARNESSES, verifyRoleCapabilities } from "../src/adapters/task-agents.js";

test("125 role triplets: all permutations evaluate deterministically against mock receipts", async () => {
  let count = 0;
  for (const c of ALL_HARNESSES) {
    for (const e of ALL_HARNESSES) {
      for (const r of ALL_HARNESSES) {
        count++;
        const policy = {
          controller: c,
          executor: e,
          reviewer: r,
          reviewerSession: "fresh-read-only" as const,
        };

        // When all receipts exist in mock fixture root
        const assessment = await verifyRoleCapabilities(policy, { receiptsRoot: "test/fixtures/mock-receipts-all" });
        assert.equal(assessment.supported, true, `Expected triple (${c}, ${e}, ${r}) to be supported`);
        assert.equal(assessment.missingProof.length, 0);

        // When receipts are missing
        const missingAssessment = await verifyRoleCapabilities(policy, { receiptsRoot: "test/fixtures/empty-receipts" });
        assert.equal(missingAssessment.supported, false);
        assert.ok(missingAssessment.missingProof.length >= 1);
      }
    }
  }
  assert.equal(count, 125, "Must evaluate exactly 125 permutations");
});
```

### 2. Controller Fenced Lease Conflict Test (`test/task-controller-lease.test.ts`)
```typescript
test("second controller immediately fails with LOCKED_PROJECT_CONTROLLER", async (context) => {
  const root = await scratchRoot(context, "lease-conflict");
  const lease1 = await acquireControllerLease({ projectRoot: root, harness: "codex", contractDigest: "abc1" });

  await assert.rejects(
    () => acquireControllerLease({ projectRoot: root, harness: "claude", contractDigest: "abc2" }),
    (err: any) => {
      assert.equal(err.code, "LOCKED_PROJECT_CONTROLLER");
      assert.equal(err.activeController.harness, "codex");
      return true;
    }
  );

  await lease1.release();

  // After release, new lease acquisition succeeds
  const lease2 = await acquireControllerLease({ projectRoot: root, harness: "claude", contractDigest: "abc2" });
  assert.ok(lease2.token);
  await lease2.release();
});
```

### 3. Tree Mutation Invalidation Test (`test/task-tree-guard.test.ts`)
```typescript
test("reviewer modifying a file invalidates report with INVALID_MUTATING_REVIEW", async (context) => {
  const root = await scratchRoot(context, "tree-guard");
  await writeFile(join(root, "src.js"), "console.log('original');", "utf8");

  const before = await captureTreeSnapshot(root, ["."]);

  // Simulate rogue reviewer modifying file
  await writeFile(join(root, "src.js"), "console.log('tampered');", "utf8");

  const after = await captureTreeSnapshot(root, ["."]);
  const result = evaluateTreeMutations(before, after);

  assert.equal(result.mutated, true);
  assert.equal(result.code, "INVALID_MUTATING_REVIEW");
  assert.match(result.violations[0], /modified: src\.js/);
});
```

---

## Pattern Mapping Summary & Implementation Roadmap

1. **Step 1 (Schemas & Receipts Store)**:
   - Create `schemas/harness-role-receipt.schema.json` and `schemas/controller-lock.schema.json`.
   - Implement `src/adapters/task-receipts.ts` with atomic write, read, and SHA-256 drift detection.
   - Implement `test/task-receipts.test.ts`.

2. **Step 2 (Fenced Controller Lease & Authority Migration)**:
   - Implement `src/core/controller-lease.ts` with `acquireControllerLease`, `ControllerLockConflictError`, and zombie auto-reclaim.
   - Refactor `src/core/worker-authority.ts` to remove Hermes name hardcoding and migrate to receipt/lease verification.
   - Update `src/core/task-contract.ts` to remove legacy Hermes checks and support `differentReviewerPolicy`.
   - Implement `test/task-controller-lease.test.ts` and update `test/worker-authority.test.ts`.

3. **Step 3 (Tree Mutation Guard & Telemetry Metering)**:
   - Implement `src/core/tree-mutation-guard.ts` for reviewer mutation detection.
   - Implement `src/core/task-telemetry.ts` for telemetry normalization and `MISSING_TELEMETRY_METER` fail-closed gate.
   - Implement `test/task-tree-guard.test.ts` and `test/task-telemetry.test.ts`.

4. **Step 4 (Native Adapters & 5×5×5 Matrix Integration)**:
   - Implement `src/adapters/task-antigravity.ts`, `src/adapters/task-pi.ts`, and `src/adapters/task-hermes.ts`.
   - Upgrade `src/adapters/task-agents.ts` with `verifyRoleCapabilities` and dynamic port routing.
   - Update `src/core/task-run.ts` to bind controller lease, tree guard, and session isolation.
   - Implement `test/task-matrix.test.ts`.

5. **Step 5 (Task Doctor 3D Matrix & CLI)**:
   - Implement `src/core/task-doctor.ts`.
   - Update `src/cli.ts` to expose `alpha-aos task doctor` and integrate fail-closed checks in `task preview`/`task start`.
   - Implement `test/task-doctor.test.ts`.

6. **Step 6 (Success Criterion 6 Live Defect Tracer Verification)**:
   - Verify Codex defect rejection and stale review tracer in `test/task-tracer.integration.ts`.
