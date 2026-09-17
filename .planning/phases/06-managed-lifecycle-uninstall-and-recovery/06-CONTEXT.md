# Phase 6: Managed Lifecycle, Uninstall, and Recovery - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a safe, idempotent, inspectable, removable, rollbackable, and repairable lifecycle for everything alpha-AOS owns across supported harnesses (Codex, Antigravity, Pi, and Hermes) without disturbing harness applications, user authentication, or unrelated user configuration.

This phase owns LIFE-01 through LIFE-08:
- LIFE-01: Idempotent stable-lock reconciliation (`alpha-aos install` / `plan` reports `CURRENT` when unchanged).
- LIFE-02: Fast offline `status` vs explicit `doctor` / canary modes with actionable coded findings.
- LIFE-03: Preview and removal of project packs, isolated runtimes, individual harness targets, or the full managed stack without removing harness applications, authentication, or unrelated resources.
- LIFE-04: Removal restricted to receipted alpha-AOS-owned bytes/semantic entries matching applied state; refusal on drift.
- LIFE-05: All-or-nothing rollback preflight to exact prior bytes; refusal before any mutation if post-transaction drift exists.
- LIFE-06: Diagnosis of corrupt/interrupted journals as `needs-repair` with restart-safe recovery guidance.
- LIFE-07: Verified external package recovery receipts and component-specific recovery instructions for non-rollbackable package changes (GSD, ECC, npm-link, Pi bridge).
- LIFE-08: Truly non-mutating update preview (`alpha-aos update`) and promotion restricted to reviewed stable-lock files.

Explicitly NOT in this phase:
- Cross-platform release packaging, release tarball freezing, and registry publishing (Phase 7: REL-01…06).
- Modifying GSD Core lifecycle ownership or changing `.planning/` authority (GSD remains sole lifecycle owner).
- OS/container-level `sealed` execution (v2 requirement SEAL-01).
- Active v0.1.0 obligations or release gates for Claude Code (Claude Code remains compatibility residue).
</domain>

<decisions>
## Implementation Decisions

### 1. Removal & Uninstall Granularity (LIFE-03, LIFE-04)
- **D-01:** Unified CLI command structure: **`alpha-aos uninstall [--target <harness> | --project <path> | --all]`** serves as the central entrypoint for managed removal, coordinating target removal, project pack removal, isolated runtime cleanup, and full stack uninstall. — **Reversibility:** costly — public CLI contract and dispatch wiring.
- **D-02:** Dry-run preview by default (SAFE-01) with interactive TTY confirmation prompt (`Proceed with uninstall? [y/N]`) upon `--apply`, and **`--yes` / `-y` flag** for non-interactive/CI script environments. — **Reversibility:** reversible.
- **D-03:** Shared configuration removal (e.g. `config.toml`, `settings.json`) uses **Semantic Pruning**: alpha-AOS parses and extracts only the exact configuration blocks and keys it injected. Unrelated user settings and credentials are strictly preserved. If an injected block has been edited or corrupted by the user, removal is safely refused. — **Reversibility:** costly — format-specific semantic pruning parsers.
- **D-04:** Full stack uninstall (`alpha-aos uninstall --all`) removes all managed files, skills, MCP configs, and PATH shims while **preserving historical transaction journals in `~/.alpha-aos/journal/` by default** for auditability. A dedicated **`--purge` flag** must be explicitly passed to completely remove the `~/.alpha-aos` state directory. — **Reversibility:** reversible.

### 2. Rollback Preflight & Drift Policy (LIFE-04, LIFE-05)
- **D-05:** **All-or-nothing drift refusal**: Rollback preflight verifies the SHA-256 hashes of all target files against their post-transaction journal hashes. If even a single file has drifted (modified externally), zero file writes are performed, the operation immediately halts (exit code 2), and no partial rollback is executed. — **Reversibility:** costly — safety invariant preventing partial rollback corruption.
- **D-06:** Drift refusal diagnostics output **exact file paths, expected vs actual hashes, Unified Diff snippets**, and actionable manual remediation guidance to help the user resolve or reconcile differences. — **Reversibility:** reversible.
- **D-07:** Multi-transaction rollback enforces **LIFO (Reverse Chronological / Head-First) ordering**: Only the most recent active transaction (Head) can be rolled back, preventing state tearing and interleaved file conflicts. — **Reversibility:** reversible.
- **D-08:** Newly created file rollback (unlinking newly added files) performs a **clean reverse directory sweep**: Any parent directory created solely by that transaction that becomes empty is removed (`rmdir`), while non-empty directories containing other user files are preserved. — **Reversibility:** reversible.

### 3. Corrupt/Interrupted Journal Diagnosis & Repair (LIFE-06)
- **D-09:** Any incomplete (`status: "applying"`) or unreadable journal is classified by `status`/`doctor` as **`needs-repair`**, reporting transaction ID, target paths, snapshot availability, and directing the user to `alpha-aos repair`. — **Reversibility:** reversible.
- **D-10:** `alpha-aos repair` implements **Snapshot-based Safe Rollback**: If pre-mutation snapshot files are intact, the partial transaction is safely rolled back to the pre-crash baseline, the journal is marked `repaired`, and the user is guided to safely re-execute the original operation. — **Reversibility:** costly — recovery engine state machine.
- **D-11:** Unrecoverable corrupt journals (missing snapshots or unparseable JSON) are moved to **Quarantine (`.corrupt`)** to release the operational lock, accompanied by an explicit integrity report and manual verification steps via `doctor`. — **Reversibility:** reversible.
- **D-12:** Stale writer locks (`writer.lock`) left behind by crashed processes are safely released only after verifying process death via **ESRCH check**, unified directly into the `alpha-aos repair` workflow. — **Reversibility:** reversible.

### 4. External Package Compensation & Status/Doctor Split (LIFE-01, LIFE-02, LIFE-07, LIFE-08)
- **D-13:** External package states that cannot be reversed via file rollback (GSD Core, ECC runtime, npm link, Pi bridge) emit a structured **Recovery Receipt** with clear component-specific manual commands (e.g. `npm unlink`, `npx @opengsd/gsd-core@<ver>`). alpha-AOS never claims false automated rollback for external package managers. — **Reversibility:** reversible.
- **D-14:** **Zero-subprocess offline `status`**: `alpha-aos status` executes 0 subprocesses and 0 network calls, completing in <50ms by evaluating local receipts, journals, tree policies, and file presence. Active binary probes, tool discovery (`--discovery`), and execution canaries (`--canary`) are strictly reserved for `alpha-aos doctor`. — **Reversibility:** costly — status/doctor architectural boundary.
- **D-15:** **Strict hash-verified idempotency**: Stable-lock reconciliation (`install` / `plan`) computes exact SHA-256 hashes of all installed components against `catalog/stack.lock.json`. When all hashes match, all items are reported as `CURRENT`, zero mutations are executed, and exit code 0 is returned. — **Reversibility:** reversible.
- **D-16:** **Pure read-only update preview**: `alpha-aos update --check` performs zero filesystem or package mutations. `alpha-aos update --apply` strictly rejects candidate locks (`candidate.lock.json`) and applies only committed, reviewed stable locks (`catalog/stack.lock.json`). — **Reversibility:** costly — supply chain security policy.

### the agent's Discretion
- Exact table layout and terminal colors for `alpha-aos uninstall` preview.
- Recovery receipt JSON schema (`schemas/recovery-receipt.schema.json`).
- Quarantine filename format for unparseable journals (e.g. `<journal-id>.corrupt.<timestamp>`).

### Folded Todos
None.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specifications and Core Architecture
- `.planning/PROJECT.md` — Control plane values, cross-platform constraints, safe mutation invariants, and secrets handling.
- `.planning/REQUIREMENTS.md` §Lifecycle, Diagnostics, and Recovery — LIFE-01 through LIFE-08 requirements verbatim.
- `.planning/ROADMAP.md` §Phase 6 — Goals, success criteria, and deliverables for Phase 6.
- `.planning/phases/01-safe-operation-boundary/01-CONTEXT.md` — Durable transactions, failpoints, path boundaries, and secret redaction.
- `.planning/phases/04-mandatory-gsd-gates/04-CONTEXT.md` — GSD lifecycle authority and active harness scope (Codex, Antigravity, Pi, Hermes).
- `.planning/phases/05-persistent-tree-off-preload-isolation/05-CONTEXT.md` — Policy registry, shims, and isolated tree runtimes.

### Code Modules
- `src/core/transaction.ts` — `FileTransactionOptions`, `TransactionJournal`, `rollbackManagedTransaction`, snapshots, and failpoints.
- `src/core/writer-lock.ts` — `inspectWriterState`, `applyWriterRepair`, session management, and `syncDirectory`.
- `src/core/doctor.ts` — Diagnostic findings, coded rules, and health assessment.
- `src/core/install.ts` — Managed install planner and component deployers.
- `src/core/update.ts` — Upstream candidate discovery and stable lock handling.
- `src/core/project-plan.ts` — Pack removal planning (`planPackRemoval`) and approval digest verification.
- `src/core/isolation.ts` — Runtime isolation cleanup (`cleanIsolationRuntime`).
- `src/core/paths.ts` — Managed user state root (`userStateRoot()`) and path resolution.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/transaction.ts` (`rollbackManagedTransaction`, `planManagedRollback`): Foundation for reading journal files and restoring pre-state snapshots.
- `src/core/writer-lock.ts` (`inspectWriterState`, `applyWriterRepair`): Mechanics for stale lock detection and writer recovery.
- `src/core/project-plan.ts` (`planPackRemoval`, `applyPackRemoval`): Established pattern for safe inverse and hash-guarded removal.
- `src/core/doctor.ts` (`DoctorFinding`): Unified structured finding contract for diagnostics.
- `src/core/path-boundary.ts` (`canonicalizeWithMissingTail`, `proveOperationPaths`): Boundary verification preventing symlink escape during rollback or uninstall.

### Established Patterns
- Pure planner (`plan*`) vs transactional executor (`apply*`).
- Strict fail-closed on missing evidence, unreadable files, or unexpected drift.
- All-or-nothing atomic operations backed by durable write-ahead journals.
- Redaction of all credentials, secrets, and auth tokens from output and receipts.

### Integration Points
- `src/cli.ts`: Route `alpha-aos uninstall`, `alpha-aos repair`, `alpha-aos rollback`, `alpha-aos status`, and `alpha-aos update`.
- `src/core/lifecycle.ts` or `src/core/uninstall.ts`: New orchestrator module for multi-target and full stack uninstall.
- `src/core/repair.ts`: Dedicated journal diagnosis and snapshot-rollback repair engine.
- `schemas/recovery-receipt.schema.json`: Schema for external package recovery receipts.
</code_context>

<specifics>
## Specific Ideas

- Discussion conducted in Korean on 2026-09-18.
- User selected all 4 proposed gray areas and agreed with the builder-recommended architectural defaults.
- All-or-nothing rollback confirmed as a strict safety invariant: no partial writes if drift is detected.
- Fast offline `status` (<50ms, zero-subprocess) strictly separated from active `doctor`.
- External package changes honestly report recovery receipts and manual CLI commands rather than claiming fake automated rollback.
- Full stack uninstall preserves transaction logs in `~/.alpha-aos/journal/` unless `--purge` is explicitly requested.
</specifics>

<deferred>
## Deferred Ideas

- None — all decisions stayed strictly within Phase 6 scope.
</deferred>

---

*Phase: 06-managed-lifecycle-uninstall-and-recovery*
*Context gathered: 2026-09-18*
