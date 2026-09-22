# Phase 6: Managed Lifecycle, Uninstall, and Recovery - Pattern Mapping

**Phase Directory:** `D:/dev/alpha-AOS/.planning/phases/06-managed-lifecycle-uninstall-and-recovery`  
**Generated:** 2026-09-18  
**Status:** Complete  

---

## Executive Summary

Phase 6 implements **Managed Lifecycle, Uninstall, and Recovery** across the alpha-AOS control plane. This phase ensures that every change alpha-AOS introduces across supported harnesses ([`Codex`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15), [`Antigravity`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15), [`Pi`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15), [`Hermes`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L15)) is completely idempotent, inspectable offline, safely removable, atomically rollbackable, and cleanly repairable without disturbing harness applications, user credentials, or unrelated system configuration.

This document establishes the concrete code analogs, architectural patterns, typings, and testing conventions required to fulfill requirements **LIFE-01 through LIFE-08** and locked architectural decisions **D-01 through D-16**.

---

## File Mapping Matrix

| File Path | Role | Data Flow Summary | Existing Analog in Codebase | Key Invariants & Differences |
|-----------|------|-------------------|-----------------------------|------------------------------|
| [`src/core/uninstall.ts`](file:///D:/dev/alpha-AOS/src/core/uninstall.ts) *(created)* | Planner & Transactional Executor | Evaluates requested targets, project paths, or full stack -> inspects receipts and applied states -> computes semantic configuration pruning diffs -> validates no user drift -> prompts confirmation on `--apply` (or `--yes`) -> acquires mutation session -> applies transaction -> reverse sweeps empty parent directories. | [`src/core/project-plan.ts`](file:///D:/dev/alpha-AOS/src/core/project-plan.ts#L3187-L3212) (`planPackRemoval`, `applyPackRemoval`), [`src/core/mcp.ts`](file:///D:/dev/alpha-AOS/src/core/mcp.ts#L296-L347) (`stripManagedToml`), [`src/core/isolation.ts`](file:///D:/dev/alpha-AOS/src/core/isolation.ts#L661-L690) (`cleanIsolationRuntime`). | Must support three granularities (`--target`, `--project`, `--all`); excises only alpha-AOS-injected keys/blocks; preserves `journal/` on `--all` unless `--purge` is passed; refuses if user modified injected block. |
| [`src/core/transaction.ts`](file:///D:/dev/alpha-AOS/src/core/transaction.ts) *(modified)* | Durable Transaction & Rollback Engine | Preflights target hashes against post-transaction `afterHash` -> if any hash differs, aborts immediately without touching files -> emits Unified Diff diagnostics -> enforces strict LIFO head-of-chain ordering -> sweeps empty parent directories on unlinking created files. | [`src/core/transaction.ts`](file:///D:/dev/alpha-AOS/src/core/transaction.ts#L248-L282) (`rollbackFileTransaction`), [`src/core/path-boundary.ts`](file:///D:/dev/alpha-AOS/src/core/path-boundary.ts#L1-L60) (`proveOperationPaths`). | Upgrades rollback from best-effort/sequential erroring to strict all-or-nothing preflight refusal; generates structured in-memory Unified Diff; admits `"repaired"` journal status; sweeps empty parent dirs via `rmdir`. |
| [`src/core/repair.ts`](file:///D:/dev/alpha-AOS/src/core/repair.ts) *(created)* | Diagnosis & Crash Recovery Engine | Scans `~/.alpha-aos/journal/` and `writer.lock` -> checks writer PID liveness via `process.kill(pid, 0)` (ESRCH check) -> restores pre-crash state from intact snapshots in `snapshots/<id>/` -> marks journal `repaired` -> quarantines unparseable or snapshot-missing journals to `.corrupt.<timestamp>`. | [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L303-L444) (`planWriterRepair`, `applyWriterRepair`, `inspectWriterState`), [`src/core/transaction.ts`](file:///D:/dev/alpha-AOS/src/core/transaction.ts#L299-L313) (`listManagedTransactions`). | Restores snapshot baselines on partial crashes (where `writer-lock.ts` previously refused on mixed states); releases stale locks only on ESRCH; isolates corrupt journals to unblock operations. |
| [`src/core/status.ts`](file:///D:/dev/alpha-AOS/src/core/status.ts) *(created)* | Zero-Subprocess Offline Status Inspector | Reads local `stack.lock.json`, journal health (`status: "applying"` or corrupt), writer lock file, and tree policy registry -> aggregates host and stack status in <50ms without invoking child processes or network sockets. | [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L504-L509) (existing `status` command), [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L129-L158) (`inspectWriterState`), [`src/core/capability-ledger.ts`](file:///D:/dev/alpha-AOS/src/core/capability-ledger.ts#L78-L84) (`readCapabilityLedger`). | Strictly 0 subprocesses (`node`, `npm`, `git`, harness commands forbidden) and 0 network calls; completes in <50ms; flags `needs-repair` immediately. |
| [`src/core/recovery-receipt.ts`](file:///D:/dev/alpha-AOS/src/core/recovery-receipt.ts) *(created)* | External Package Compensation Manager | Generates validated recovery receipts for package manager modifications (GSD Core, ECC runtime, Pi bridge, npm-link) with explicit manual compensation instructions. | [`src/core/gate-receipt.ts`](file:///D:/dev/alpha-AOS/src/core/gate-receipt.ts#L114-L117) (`createGateReceipt`, `writeGateReceipt`), [`src/core/validation.ts`](file:///D:/dev/alpha-AOS/src/core/validation.ts#L30-L35) (`validateManagedDocument`). | Never claims false automated rollback for external package managers; outputs clear actionable shell commands; validates against Draft 2020-12 schema. |
| [`schemas/recovery-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/recovery-receipt.schema.json) *(created)* | JSON Schema Specification | Declares valid structure for external package recovery receipts (`schemaVersion: 1`, `operationId`, `createdAt`, `entries`). | [`schemas/transaction-journal.schema.json`](file:///D:/dev/alpha-AOS/schemas/transaction-journal.schema.json), [`schemas/gate-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/gate-receipt.schema.json). | Validated using `ajv` in Draft 2020-12 mode. |
| [`schemas/transaction-journal.schema.json`](file:///D:/dev/alpha-AOS/schemas/transaction-journal.schema.json) *(modified)* | JSON Schema Specification | Updates `status` enum to admit `"repaired"`. | [`schemas/transaction-journal.schema.json`](file:///D:/dev/alpha-AOS/schemas/transaction-journal.schema.json#L16). | Prevents schema validation rejection when repair engine marks a partially-crashed journal as repaired. |
| [`src/types.ts`](file:///D:/dev/alpha-AOS/src/types.ts) *(modified)* | TypeScript Type Definitions | Declares contracts for `UninstallPlan`, `UninstallResult`, `DriftDiagnostic`, `OfflineStatus`, `RecoveryReceipt`. | [`src/types.ts`](file:///D:/dev/alpha-AOS/src/types.ts#L14-L86), [`src/core/transaction.ts`](file:///D:/dev/alpha-AOS/src/core/transaction.ts#L28-L38) (`TransactionJournal`). | Extends core interfaces without breaking compatibility. |
| [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts) *(modified)* | CLI Command Router & Formatter | Dispatches `alpha-aos uninstall [--target|--project|--all] [--purge] [--yes]`, routes `status` to offline inspector, updates `rollback` with LIFO guard and Unified Diff display, updates `repair` with snapshot recovery. | [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L478-L509) (`install`, `status`), [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L1228-L1247) (`repair`), [`src/cli.ts`](file:///D:/dev/alpha-AOS/src/cli.ts#L1305-L1327) (`rollback`). | Enforces dry-run default (SAFE-01) with interactive TTY prompt (`[y/N]`) or `--yes` override; formats diffs and tables cleanly. |
| [`test/uninstall.test.ts`](file:///D:/dev/alpha-AOS/test/uninstall.test.ts) *(created)* | Integration Test Suite | Tests target uninstall, semantic pruning across TOML/JSON/YAML, project pack removal, full stack uninstall preserving `journal/`, `--purge` flag, and drift refusal. | [`test/project-plan.test.ts`](file:///D:/dev/alpha-AOS/test/project-plan.test.ts), [`test/mcp.test.ts`](file:///D:/dev/alpha-AOS/test/mcp.test.ts), [`test/isolation.test.ts`](file:///D:/dev/alpha-AOS/test/isolation.test.ts). | Verifies zero-leakage of user settings or auth credentials; tests TTY non-interactive refusal vs `--yes`. |
| [`test/rollback.test.ts`](file:///D:/dev/alpha-AOS/test/rollback.test.ts) *(created)* | Unit & Integration Test Suite | Tests all-or-nothing drift refusal, Unified Diff diagnostic emission, strict LIFO ordering, clean reverse directory sweep. | [`test/transaction.test.ts`](file:///D:/dev/alpha-AOS/test/transaction.test.ts). | Asserts zero writes occur when any file drifts; tests exit code 2 and diff formatting. |
| [`test/repair.test.ts`](file:///D:/dev/alpha-AOS/test/repair.test.ts) *(created)* | Crash & Recovery Test Suite | Tests incomplete journal diagnosis as `needs-repair`, ESRCH process death audit, snapshot-based safe rollback, corrupt journal quarantine (`.corrupt.<timestamp>`). | [`test/transaction-crash.test.ts`](file:///D:/dev/alpha-AOS/test/transaction-crash.test.ts). | Uses `ALPHA_AOS_FAILPOINT` fixtures to simulate mid-write crashes; tests process survival vs kill. |
| [`test/status.test.ts`](file:///D:/dev/alpha-AOS/test/status.test.ts) *(created)* | Benchmark & Unit Test Suite | Asserts 0 subprocesses, 0 network calls, <50ms execution speed, and accurate offline health evaluation. | [`test/preview.test.ts`](file:///D:/dev/alpha-AOS/test/preview.test.ts), [`test/capability-ledger.test.ts`](file:///D:/dev/alpha-AOS/test/capability-ledger.test.ts). | Asserts no child processes spawned; asserts latency <50ms. |
| [`test/lifecycle.test.ts`](file:///D:/dev/alpha-AOS/test/lifecycle.test.ts) *(created)* | Idempotency & Lifecycle Test Suite | Asserts stable-lock reconciliation idempotency (all `CURRENT`, 0 writes, exit 0), `update --check` pure read-only preview, `update --apply` rejection of candidate locks. | [`test/install.test.ts`](file:///D:/dev/alpha-AOS/test/install.test.ts), [`test/update.test.ts`](file:///D:/dev/alpha-AOS/test/update.test.ts). | Validates LIFE-01 and LIFE-08 contracts. |
| [`test/recovery-receipt.test.ts`](file:///D:/dev/alpha-AOS/test/recovery-receipt.test.ts) *(created)* | Schema & Compensation Test Suite | Validates recovery receipt schema against Draft 2020-12; verifies compensation instructions for GSD Core, ECC, Pi bridge, npm-link. | [`test/validation.test.ts`](file:///D:/dev/alpha-AOS/test/validation.test.ts). | Asserts schema conformance and command formatting. |

---

## Detailed Pattern Analyses

### 1. Pure Planner & Transactional Executor Architecture (D-01, D-02, SAFE-01)

#### Pattern Description
alpha-AOS enforces a strict separation between planning mutations (pure read-only functions computing deterministic plans, diffs, and cryptographic digests) and applying mutations (transactional execution under mutual exclusion locks).

For uninstall and removal:
1. `planUninstall(options)`: Pure read-only computation that scans target configuration files, receipts, project packs, and runtimes. Computes semantic pruning diffs, file unlinks, directory sweeps, and an approval digest. Mutates zero bytes on disk.
2. Dry-run preview by default: `alpha-aos uninstall` without `--apply` prints the formatted plan and exits 0.
3. Interactive confirmation: When `--apply` is passed:
   - In interactive TTY mode: prompts `Proceed with uninstall? [y/N]`. If user does not answer `y` or `Y`, halts immediately without mutation.
   - In non-interactive mode (e.g. CI scripts): requires `--yes` / `-y`; otherwise refuses execution.
4. `applyUninstall(options)`: Re-validates the plan against current disk state, acquires a [`MutationSession`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L65-L81) with path proofs, executes atomic file transactions via [`applyFileTransaction`](file:///D:/dev/alpha-AOS/src/core/transaction.ts#L132-L246), executes clean reverse directory sweeps, and emits recovery receipts for external packages.

#### Existing Analog
- [`src/core/project-plan.ts`](file:///D:/dev/alpha-AOS/src/core/project-plan.ts#L3187-L3212): [`planPackRemoval`](file:///D:/dev/alpha-AOS/src/core/project-plan.ts#L3187-L3212) and [`applyPackRemoval`](file:///D:/dev/alpha-AOS/src/core/project-plan.ts#L3355-L3425).
- [`src/core/isolation.ts`](file:///D:/dev/alpha-AOS/src/core/isolation.ts#L661-L690): [`cleanIsolationRuntime`](file:///D:/dev/alpha-AOS/src/core/isolation.ts#L661-L690).

```typescript
// Analog excerpt from src/core/project-plan.ts
export function planPackRemoval(reconciliation: ProjectReconciliation): RemovalPlan[] {
  const plans: RemovalPlan[] = [];
  for (const pack of reconciliation.packs) {
    const draft = {
      packId: pack.packId,
      receiptPath: pack.receiptPath,
      targets: pack.targets.map((target) => ({
        path: target.path,
        harness: target.harness,
        expectedHash: target.currentHash,
        exists: target.exists,
      })),
      reasons: [/* ... */],
    };
    plans.push({ ...draft, removalDigest: reviewedDigest(REMOVAL_DIGEST_KIND, digestableRemoval(draft)) });
  }
  return plans;
}
```

---

### 2. Multi-Format Semantic Pruning vs Full Deletion (D-03, LIFE-04)

#### Pattern Description
Harness configuration files are shared multi-tenant files. They contain user-configured servers, credentials, and settings alongside alpha-AOS-managed entries. 
**Semantic Pruning** parses each configuration format with AST/structural fidelity, excises *only* alpha-AOS-injected blocks/keys, and verifies that the remaining document remains valid. If an injected block was modified by the user or is malformed, removal is refused with diagnostic guidance.

#### Pruning Rules by Format

1. **Codex TOML (`~/.codex/config.toml`)**:
   - Delimited block: `# alpha-aos:start mcp` to `# alpha-aos:end mcp`.
   - Strips the managed block using [`stripManagedToml`](file:///D:/dev/alpha-AOS/src/core/mcp.ts#L296-L314).
   - Verifies remainder is valid TOML using `smol-toml`.
   - Never deletes `config.toml` if user-defined tables or keys exist. If file is empty after pruning, deletes file only if alpha-AOS created it.

2. **Claude Settings (`~/.claude/settings.json`)**:
   - Parses document with JSON parser.
   - Deletes only managed keys in `skillOverrides`: `"unified-memory"`, `"documentation-lookup"`, `"deep-research"`.
   - If `skillOverrides` becomes empty, deletes or retains empty object. Preserves all other user settings.

3. **Claude & Antigravity MCP JSON (`.claude.json`, `mcp_config.json`)**:
   - Deletes `mcpServers["context7"]`, `mcpServers["exa"]`, `mcpServers["firecrawl"]`.
   - Strictly preserves user servers, custom tokens, and auth secrets.

4. **Pi MCP JSON (`~/.pi/agent/mcp.json`)**:
   - Deletes managed servers from `mcpServers`.
   - Reverts managed keys in `settings`: `hostConfigDiscovery`, `directTools`, `toolPrefix`, `notifyOnStartupConnect`, `outputGuard`.
   - Preserves user custom settings and servers.

5. **Hermes YAML (`~/.hermes/config.yaml`)**:
   - Uses AST-level manipulation via `parseDocument` from `yaml`.
   - Calls `doc.deleteIn(["mcp_servers", server])` for `"context7"`, `"exa"`, `"firecrawl"`.
   - Preserves comments, formatting, and other tools.

6. **Codex Instructions Markdown (`AGENTS.md`)**:
   - Delimited block: `<!-- alpha-AOS:codex-execution:start -->` to `<!-- alpha-AOS:codex-execution:end -->`.
   - Removes the block. If remaining content contains user text, preserves the file; if file was created solely by alpha-AOS and remainder is blank, unlinks the file.

#### Existing Analog
- [`src/core/mcp.ts`](file:///D:/dev/alpha-AOS/src/core/mcp.ts#L296-L314) (`stripManagedToml`):
```typescript
// Analog excerpt from src/core/mcp.ts
function stripManagedToml(text: string): string {
  let result = text.replace(/(?:^|\r?\n)# alpha-aos:start mcp[\s\S]*?# alpha-aos:end mcp(?:\r?\n|$)/gu, "\n");
  for (const id of serverOrder) {
    const lines = result.split(/\r?\n/u);
    const kept: string[] = [];
    let skip = false;
    const prefix = `mcp_servers.${id}`;
    for (const line of lines) {
      const match = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
      if (match) {
        const table = (match[1] ?? "").replaceAll('"', "").replaceAll("'", "");
        skip = table === prefix || table.startsWith(`${prefix}.`);
      }
      if (!skip) kept.push(line);
    }
    result = kept.join("\n");
  }
  return result.trimEnd();
}
```

---

### 3. All-or-Nothing Rollback Preflight & Clean Directory Sweep (D-05, D-06, D-07, D-08, LIFE-05)

#### Pattern Description
When rolling back a transaction:
1. **LIFO Guard (D-07)**: Only the head transaction (most recent transaction with `status === "applied"`) may be rolled back. If an older ID is passed, rollback halts immediately:
   `LIFO violation: transaction <id> is not the most recent active transaction (head: <head-id>). Roll back <head-id> first.`
2. **All-or-Nothing Preflight (D-05)**: Before modifying any target file:
   - For every entry in `journal.files`, calculates current disk SHA-256 hash.
   - Compares against `file.afterHash`:
     - If `file.afterHash === null`: target must NOT exist on disk.
     - If `file.afterHash !== null`: target MUST exist and hash must match.
   - If even **one** file has drifted, **ZERO file mutations are performed**.
3. **Drift Unified Diff Diagnostics (D-06)**: Emits exact file path, expected hash, actual hash, Unified Diff snippet, and manual remediation steps. Sets `process.exitCode = 2`.
4. **Clean Reverse Directory Sweep (D-08)**:
   - For newly created files (`existed === false`), unlinks the file.
   - Walks up ancestor directories: calls `rmdir(parent)`.
   - If `rmdir` succeeds, continues upward until reaching an allowed root boundary.
   - If `rmdir` throws `ENOTEMPTY` or `EEXIST`, safely stops climbing without deleting user files.

#### Existing Analog
- [`src/core/transaction.ts`](file:///D:/dev/alpha-AOS/src/core/transaction.ts#L248-L282) (`rollbackFileTransaction`):
```typescript
// Analog excerpt from src/core/transaction.ts
export async function rollbackFileTransaction(stateRoot: string, id: string, allowedRoots: string[]): Promise<TransactionJournal> {
  const journalPath = join(stateRoot, "journal", `${id}.json`);
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as TransactionJournal;
  if (journal.status === "rolled-back") throw new Error(`Transaction is already rolled back: ${id}`);
  for (const file of journal.files) {
    requireAllowed(file.target, allowedRoots);
    if (file.afterHash === null) {
      if (existsSync(file.target)) throw new Error(`Rollback blocked by post-transaction drift: ${file.target}`);
    } else {
      if (!existsSync(file.target)) throw new Error(`Rollback blocked because target is missing: ${file.target}`);
      const current = await readFile(file.target);
      if (sha256(current) !== file.afterHash) throw new Error(`Rollback blocked by post-transaction drift: ${file.target}`);
    }
  }
  // Restores snapshots in reverse order...
}
```

---

### 4. Snapshot Crash Repair, ESRCH Lock Audit & Journal Quarantine (D-09, D-10, D-11, D-12, LIFE-06)

#### Pattern Description
When a transaction crashes mid-flight:
1. **Diagnosis as `needs-repair` (D-09)**: Any unreadable journal or journal with `status === "applying"` causes `status` and `doctor` to flag `needs-repair`.
2. **ESRCH Lock Audit (D-12)**: Checks the owning process PID using `process.kill(pid, 0)`.
   - If `process.kill` returns without error or throws `EPERM` (process alive under different user), repair halts with `WriterConflictError` (`ACTIVE_WRITER`).
   - If error code is `ESRCH`, the process is confirmed dead and lock can be safely cleared.
3. **Snapshot Baseline Restoration (D-10)**: Inspects `~/.alpha-aos/snapshots/<id>/`. If snapshots are intact, restores each modified file to its `beforeHash` baseline, writes `status: "repaired"`, sets `repairedAt`, and clears `writer.lock`.
4. **Journal Quarantine (D-11)**: If snapshots are missing or journal JSON is malformed beyond recovery:
   - Renames file to `~/.alpha-aos/journal/<id>.corrupt.<timestamp>`.
   - Clears stale `writer.lock`.
   - Emits an integrity report directing the user to run `alpha-aos doctor`.

#### Existing Analog
- [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L92-L101) (`isProcessAlive`), [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L303-L375) (`planWriterRepair`), and [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L416-L444) (`applyWriterRepair`).

```typescript
// Analog excerpt from src/core/writer-lock.ts
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
```

---

### 5. Zero-Subprocess Offline Status Engine (D-14, LIFE-02)

#### Pattern Description
`alpha-aos status` must complete in <50ms with strictly **0 subprocesses** and **0 network calls**. It inspects local state files:
1. Local active lock channel and timestamp from `catalog/stack.lock.json`.
2. Interrupted/corrupt journals in `~/.alpha-aos/journal/` (`needs-repair`).
3. Writer lock file presence (`writer.lock`).
4. Local tree policy registry (`~/.alpha-aos/trees.json`).
5. Local capability ledger (`~/.alpha-aos/capabilities.json`).

Active tool version probes (`node -v`, `npm -v`, `git --version`), tool discovery sweeps (`--discovery`), and canary executions (`--canary`) are strictly reserved for `alpha-aos doctor`.

#### Existing Analog
- [`src/core/writer-lock.ts`](file:///D:/dev/alpha-AOS/src/core/writer-lock.ts#L129-L158) (`inspectWriterState`): reads lock file without acquiring or mutating.
- [`src/core/capability-ledger.ts`](file:///D:/dev/alpha-AOS/src/core/capability-ledger.ts#L78-L84) (`readCapabilityLedger`): reads JSON ledger offline.

---

### 6. External Package Compensation & Recovery Receipts (D-13, LIFE-07)

#### Pattern Description
File modifications are reversible through snapshot rollback. External package modifications (GSD Core via `npx`, ECC global runtime via `npm install -g`, Pi MCP bridge, `npm link`) cannot be rolled back via file system snapshots.

Instead of claiming false automated rollback:
1. Emits a structured **Recovery Receipt** recording previous state, applied state, and exact manual shell compensation commands (`npm unlink`, `npx @opengsd/gsd-core@<ver>`).
2. Validates receipt against `schemas/recovery-receipt.schema.json`.
3. Displays clear human-readable instructions in CLI output.

#### Existing Analog
- [`src/core/gate-receipt.ts`](file:///D:/dev/alpha-AOS/src/core/gate-receipt.ts#L114-L117) (`createGateReceipt`, `writeGateReceipt`).
- [`src/core/validation.ts`](file:///D:/dev/alpha-AOS/src/core/validation.ts#L30-L35) (`validateManagedDocument`).

---

### 7. Strict Hash-Verified Reconciliation Idempotency (D-15, D-16, LIFE-01, LIFE-08)

#### Pattern Description
1. **Idempotency (LIFE-01, D-15)**: When `alpha-aos install` or `alpha-aos plan` is executed against an already-applied stack:
   - Computes SHA-256 hashes of all managed files and verifies external component versions against `catalog/stack.lock.json`.
   - When all hashes match, every step reports `CURRENT`.
   - Executes **0 disk writes**, modifies **0 configurations**, and exits with code 0.
2. **Update Preview & Promotion Guard (LIFE-08, D-16)**:
   - `alpha-aos update --check`: 100% read-only, 0 writes.
   - `alpha-aos update --apply`: Applies only committed, reviewed `catalog/stack.lock.json`. Rejects unreviewed candidate locks (`candidate.lock.json`).

#### Existing Analog
- [`src/core/install.ts`](file:///D:/dev/alpha-AOS/src/core/install.ts#L354-L437) (`createManagedInstallPlan`).
- [`src/core/update.ts`](file:///D:/dev/alpha-AOS/src/core/update.ts#L111-L159) (`planCandidateStage`).

---

## Target Types, Interfaces & Schemas

### 1. Unified Types Declaration

```typescript
// Proposed additions to src/types.ts or src/core/uninstall.ts

export type UninstallScope = "target" | "project" | "all";

export interface SemanticPrunePlan {
  path: string;
  format: "toml" | "json" | "yaml" | "markdown";
  existedBefore: boolean;
  userKeysPreserved: string[];
  injectedKeysRemoved: string[];
  action: "prune" | "delete" | "preserve";
  currentHash: string;
  expectedAfterHash: string | null;
}

export interface UninstallPlan {
  schemaVersion: 1;
  scope: UninstallScope;
  targetHarness?: HarnessId;
  projectPath?: string;
  purgeRequested: boolean;
  stateRoot: string;
  prunePlans: SemanticPrunePlan[];
  filesToRemove: string[];
  directoriesToSweep: string[];
  externalCompensation: RecoveryReceiptEntry[];
  planDigest: string;
}

export interface UninstallResult {
  plan: UninstallPlan;
  prunedFiles: string[];
  removedFiles: string[];
  sweptDirectories: string[];
  preservedJournals: string[];
  recoveryReceipt?: RecoveryReceipt;
}

export interface DriftDiagnostic {
  target: string;
  expectedHash: string | null;
  actualHash: string | null;
  unifiedDiff: string | null;
  remediation: string;
}

export interface RollbackPreflightResult {
  ok: boolean;
  headTransactionId: string;
  isHead: boolean;
  driftedFiles: DriftDiagnostic[];
}

export interface OfflineStatus {
  channel: Channel;
  generatedAt: string | null;
  writerStatus: WriterStatus;
  needsRepair: boolean;
  incompleteTransactions: string[];
  corruptJournals: string[];
  treePoliciesCount: number;
  managedStatePresent: boolean;
}

export interface RecoveryReceiptEntry {
  component: "gsd" | "ecc-runtime" | "mcp-bridge" | "npm-link";
  action: "install" | "upgrade" | "link";
  target: string;
  previousState: string | null;
  appliedState: string;
  compensation: {
    instructions: string;
    commands: string[];
  };
}

export interface RecoveryReceipt {
  schemaVersion: 1;
  operationId: string;
  createdAt: string;
  entries: RecoveryReceiptEntry[];
}
```

---

### 2. Transaction Journal Schema Update (`schemas/transaction-journal.schema.json`)

To prevent AJV schema validation errors when journals are marked as repaired (Pitfall 7, D-10), the `status` enum must be updated:

```diff
--- a/schemas/transaction-journal.schema.json
+++ b/schemas/transaction-journal.schema.json
@@ -13,7 +13,7 @@
   "properties": {
     "schemaVersion": { "type": "integer" },
     "id": { "type": "string", "minLength": 1 },
     "createdAt": { "type": "string", "minLength": 1 },
-    "status": { "enum": ["applying", "applied", "rolled-back", "failed"] },
+    "status": { "enum": ["applying", "applied", "rolled-back", "failed", "repaired"] },
     "allowedRoots": { "type": "array", "minItems": 1, "items": { "type": "string", "minLength": 1 } },
     "directorySyncSupported": {
```

And in [`src/core/transaction.ts`](file:///D:/dev/alpha-AOS/src/core/transaction.ts#L32):
```typescript
export interface TransactionJournal {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: "applying" | "applied" | "rolled-back" | "failed" | "repaired";
  allowedRoots: string[];
  files: JournalFile[];
  directorySyncSupported?: boolean;
  repairedAt?: string;
}
```

---

### 3. Recovery Receipt Schema (`schemas/recovery-receipt.schema.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://alpha-aos.local/schemas/recovery-receipt.schema.json",
  "title": "alpha-AOS external package recovery receipt",
  "description": "Write-ahead structured receipt recording external package modifications and explicit component-specific compensation instructions.",
  "type": "object",
  "required": ["schemaVersion", "operationId", "createdAt", "entries"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "type": "integer", "const": 1 },
    "operationId": { "type": "string", "minLength": 1 },
    "createdAt": { "type": "string", "minLength": 1 },
    "entries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["component", "action", "target", "compensation"],
        "additionalProperties": false,
        "properties": {
          "component": { "type": "string", "enum": ["gsd", "ecc-runtime", "mcp-bridge", "npm-link"] },
          "action": { "type": "string", "enum": ["install", "upgrade", "link"] },
          "target": { "type": "string", "minLength": 1 },
          "previousState": { "type": ["string", "null"] },
          "appliedState": { "type": "string", "minLength": 1 },
          "compensation": {
            "type": "object",
            "required": ["instructions", "commands"],
            "additionalProperties": false,
            "properties": {
              "instructions": { "type": "string", "minLength": 1 },
              "commands": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      }
    }
  }
}
```

---

## Testing Conventions & Fixture Patterns

All tests must adhere to the established repository standards:
1. **Node.js Native Test Runner**: `import test from "node:test"; import assert from "node:assert/strict";`
2. **Deterministic Cleanup & Windows Guard**:
   ```typescript
   const root = await mkdtemp(join(tmpdir(), "alpha-aos-test-"));
   context.after(async () => {
     // maxRetries and retryDelay prevent EPERM/EBUSY on Windows handle release lag
     await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
   });
   ```
3. **Simulated Crash Fixtures**:
   Use `ALPHA_AOS_FAILPOINT` (`after-snapshot-sync`, `after-intent-journal-sync`, `after-target-rename`) as modeled in [`test/transaction-crash.test.ts`](file:///D:/dev/alpha-AOS/test/transaction-crash.test.ts#L44-L50) to verify snapshot recovery and `needs-repair` classification.
4. **Drift & Refusal Assertions**:
   Verify that drifted transactions throw or exit with code 2, assert zero mutations are performed, and check Unified Diff formatting in output strings.
5. **Fast Offline Status Benchmark**:
   Assert that `getOfflineStatus(...)` runs in <50ms and that 0 subprocesses are spawned.

---

## Execution Invariants Checklist

- [ ] **SAFE-01 / D-02**: All uninstall/removal commands are dry-run by default. Live mutation requires `--apply`. Interactive TTY requires `[y/N]` confirmation; scripts require `--yes` / `-y`.
- [ ] **LIFE-01 / D-15**: Stable-lock reconciliation returns `CURRENT` for all unchanged items, writes 0 bytes, and exits 0.
- [ ] **LIFE-02 / D-14**: `alpha-aos status` executes 0 subprocesses and 0 network calls, completing in <50ms.
- [ ] **LIFE-03 / D-01**: `alpha-aos uninstall` supports `--target <harness>`, `--project <path>`, and `--all`.
- [ ] **LIFE-04 / D-03**: Shared configs (`config.toml`, `settings.json`, `config.yaml`, `AGENTS.md`) use semantic pruning. User settings, comments, and auth credentials are strictly preserved. Drift causes refusal.
- [ ] **LIFE-04 / D-04**: Full stack uninstall (`--all`) preserves historical audit logs in `~/.alpha-aos/journal/` unless `--purge` is explicitly provided.
- [ ] **LIFE-05 / D-05**: Rollback preflight halts immediately (exit code 2) before writing any byte if any file has drifted.
- [ ] **LIFE-05 / D-06**: Drift diagnostics print exact file paths, expected vs actual hashes, Unified Diff snippets, and remediation steps.
- [ ] **LIFE-05 / D-07**: Multi-transaction rollback enforces strict LIFO head-of-chain ordering.
- [ ] **LIFE-05 / D-08**: Reverse directory sweep removes empty parent directories created solely by the transaction and halts at non-empty boundaries.
- [ ] **LIFE-06 / D-09**: Interrupted (`applying`) or unreadable journals are diagnosed as `needs-repair`.
- [ ] **LIFE-06 / D-10**: `alpha-aos repair` safely restores pre-crash state from intact snapshots, marks journal `repaired`, and releases lock.
- [ ] **LIFE-06 / D-11**: Corrupt journals without snapshots are quarantined to `.corrupt.<timestamp>`.
- [ ] **LIFE-06 / D-12**: Stale writer locks are released only after verifying process death via `process.kill(pid, 0)` with ESRCH check.
- [ ] **LIFE-07 / D-13**: External package changes emit structured Recovery Receipts with manual compensation commands.
- [ ] **LIFE-08 / D-16**: `alpha-aos update --check` is 100% read-only. `alpha-aos update --apply` strictly applies reviewed stable locks and rejects candidate locks.

---

*Pattern Mapping Complete for Phase 06.*
