---
phase: 06-managed-lifecycle-uninstall-and-recovery
plan: 03
subsystem: core
tags: [rollback, preflight-drift, lifo-guard, unified-diff, uninstall, semantic-pruning, confirmation-guard, lifecycle]

# Dependency graph
requires:
  - phase: 06-managed-lifecycle-uninstall-and-recovery
    plan: 02
    provides: "External package recovery receipts and snapshot crash repair"
provides:
  - "src/core/transaction.ts — All-or-nothing rollback preflight, LIFO head guard, unified diff generator, reverse directory sweep"
  - "src/core/uninstall.ts — Multi-format semantic pruning engine, target/project/all uninstall planner and transactional executor"
  - "src/types.ts — DriftDiagnostic, RollbackPreflightResult, UninstallScope, SemanticPrunePlan, UninstallPlan, UninstallResult"
  - "src/format.ts — formatDriftDiagnostics, formatUninstallPlan, formatUninstallResult"
  - "src/cli.ts — alpha-aos rollback and alpha-aos uninstall commands with confirmation guards"
  - "test/rollback.test.ts — Verification for all-or-nothing drift refusal, LIFO ordering, unified diffs, and reverse directory sweep"
  - "test/uninstall.test.ts — Verification for target/project/stack uninstall, semantic pruning across TOML/JSON/YAML/MD, drift refusal, and purge guard"
affects: [cli, rollback, uninstall, transaction, format, types]

actuals:
  tokens: 48000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "All-or-nothing rollback preflight verifying SHA-256 hashes of all targets before touching disk (LIFE-05, D-05)"
    - "LIFO reverse-chronological head-first transaction rollback guard (LIFE-05, D-07)"
    - "Standard Unified Diff diagnostics with remediation guidance on drift refusal (LIFE-05, D-06)"
    - "Clean reverse directory sweep removing empty parent directories up to allowed root (LIFE-05, D-08)"
    - "Granular uninstall (--target, --project, --all) without removing applications, auth, or unrelated resources (LIFE-03, D-01)"
    - "Multi-format semantic pruning for TOML, JSON, YAML, and Markdown preserving user tokens and preferences (LIFE-04, D-03)"
    - "Historical audit journal retention in ~/.alpha-aos/journal/ by default, requiring --purge for full deletion (LIFE-04, D-04)"
    - "Dry-run preview default and interactive confirmation prompt with --yes bypass (LIFE-03, D-02)"

key-files:
  created:
    - src/core/uninstall.ts
    - test/rollback.test.ts
    - test/uninstall.test.ts
  modified:
    - src/types.ts
    - src/core/transaction.ts
    - src/core/mcp.ts
    - src/format.ts
    - src/cli.ts

key-decisions:
  - "Rollback preflight checks every file hash against afterHash: any drift immediately halts with exit code 2 and zero disk writes"
  - "LIFO ordering strictly enforced: only the head active (un-rolled-back/un-repaired) transaction can be rolled back"
  - "Unlinking created files performs clean reverse directory sweeping via rmdir, halting at non-empty user directories"
  - "Uninstall uses semantic pruning to excise only alpha-AOS injected keys and markers from shared TOML, JSON, YAML, and Markdown configs"
  - "Tampered or corrupted markers throw SemanticPruneDriftError and refuse removal with exit code 2"
  - "Full stack uninstall preserves historical transaction journals in ~/.alpha-aos/journal/ unless --purge is explicitly requested"
  - "Non-interactive execution without --yes refuses with exit code 2; interactive execution requires y/N confirmation"

requirements-completed: [LIFE-03, LIFE-04, LIFE-05]

coverage:
  - id: LIFE-03
    description: "Preview and removal of project packs, isolated runtimes, individual harness targets, or the full managed stack without removing harness applications, authentication, or unrelated resources"
    requirement: "LIFE-03"
    verification:
      - kind: automated
        ref: "test/uninstall.test.ts#target-level uninstall removes managed MCP servers while preserving user servers and credentials (LIFE-03, D-01)"
        status: pass
      - kind: automated
        ref: "test/uninstall.test.ts#project pack removal removes sidecars and sweeps empty directories (LIFE-03, D-01)"
        status: pass
      - kind: automated
        ref: "test/uninstall.test.ts#non-interactive environment requires --yes to apply uninstall (LIFE-03, D-02)"
        status: pass
  - id: LIFE-04
    description: "Removal restricted to receipted alpha-AOS-owned bytes/semantic entries matching applied state; refusal on drift"
    requirement: "LIFE-04"
    verification:
      - kind: automated
        ref: "test/uninstall.test.ts#semantic pruning fidelity across TOML, JSON, YAML, and Markdown (LIFE-04, D-03)"
        status: pass
      - kind: automated
        ref: "test/uninstall.test.ts#tampering and missing closing markers safely refuse with SemanticPruneDriftError (LIFE-04, D-03)"
        status: pass
      - kind: automated
        ref: "test/uninstall.test.ts#full stack uninstall preserves historical transaction journals by default (LIFE-04, D-04)"
        status: pass
      - kind: automated
        ref: "test/uninstall.test.ts#purge flag completely removes state directory (LIFE-04, D-04)"
        status: pass
  - id: LIFE-05
    description: "All-or-nothing rollback preflight to exact prior bytes; refusal before any mutation if post-transaction drift exists"
    requirement: "LIFE-05"
    verification:
      - kind: automated
        ref: "test/rollback.test.ts#all-or-nothing preflight refusal on drift performs zero writes (LIFE-05, D-05)"
        status: pass
      - kind: automated
        ref: "test/rollback.test.ts#drift diagnostics emit exact paths, hashes, unified diffs, and manual guidance (LIFE-05, D-06)"
        status: pass
      - kind: automated
        ref: "test/rollback.test.ts#strict LIFO ordering enforcement prevents non-head rollback (LIFE-05, D-07)"
        status: pass
      - kind: automated
        ref: "test/rollback.test.ts#clean reverse directory sweep removes only empty parent directories (LIFE-05, D-08)"
        status: pass
---

# Plan 06-03 Summary: All-or-Nothing Rollback Engine & Managed Multi-Format Uninstall

## Accomplishments
1. **All-or-Nothing Rollback Engine & LIFO Guard (`src/core/transaction.ts`, `src/types.ts`, `src/format.ts`)**:
   - Implemented SHA-256 preflight verification in `rollbackFileTransaction`: verifies all target files against `afterHash` before touching disk. If any file drifted or is missing, immediately throws `RollbackDriftError` with 0 disk writes executed.
   - Built standard `generateUnifiedDiff` producing patch headers (`--- a/...`, `+++ b/...`, `@@ ... @@`) and `-`/`+` lines with remediation advice.
   - Enforced strict LIFO (Head-First / reverse chronological) transaction rollback ordering in `planManagedRollback`: only the most recent active (un-rolled-back and un-repaired) transaction can be rolled back.
   - Implemented `sweepReverseDirectories` for newly created files: safely removes empty parent directories up to `allowedRoots` and halts cleanly at non-empty user boundaries.
2. **Multi-Format Semantic Pruning & Managed Uninstall (`src/core/uninstall.ts`)**:
   - Implemented format-specific semantic pruning parsers:
     - `pruneCodexConfig`: strips `# alpha-aos:start mcp` to `# alpha-aos:end mcp` from TOML, validates remainder via `smol-toml`.
     - `pruneCodexAgentsMarkdown`: excises `<!-- alpha-AOS:codex-execution:start -->` to `end` markers.
     - `pruneClaudeConfig`: deletes managed MCP servers (`context7`, `exa`, `firecrawl`) while preserving user tokens and custom servers.
     - `pruneClaudeSettings`: removes managed entries from `skillOverrides` while preserving user settings.
     - `pruneAntigravityConfig`: removes managed MCP servers from `mcp_config.json`.
     - `prunePiConfig`: removes managed MCP servers and managed settings keys (`hostConfigDiscovery`, `toolPrefix`, etc.) while preserving custom servers.
     - `pruneHermesConfig`: surgically deletes managed servers using `yaml` AST while preserving formatting and user comments.
   - Guarded against tampering: missing closing markers or malformed blocks throw `SemanticPruneDriftError` and halt with exit code 2.
   - Implemented `planUninstall` and `applyUninstall` for `--target <harness>`, `--project <path>`, and `--all`.
   - Guaranteed audit trail preservation: `uninstall --all` preserves `~/.alpha-aos/journal/` by default; complete deletion requires `--purge`.
3. **CLI Integration & Interactive Confirmation Guards (`src/cli.ts`, `src/format.ts`)**:
   - Wired `alpha-aos uninstall` and `alpha-aos rollback` with dry-run default.
   - Enforced non-interactive refusal without `--yes` (exit code 2) and interactive `Proceed with uninstall? [y/N]` confirmation in TTY.
4. **Comprehensive Automated Test Coverage (`test/rollback.test.ts`, `test/uninstall.test.ts`)**:
   - 12 new dedicated automated tests passing across all-or-nothing drift refusal, unified diffs, LIFO enforcement, reverse directory sweeps, target/project/stack uninstalls, semantic pruning, and confirmation guards.
   - Full test suite passing (858 passed, 0 failed, 9 skipped).
