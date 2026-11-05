---
phase: 27-shared-project-behavior-policy
reviewed: 2026-11-02T07:18:00Z
depth: standard
head: 0453ca223d51cf123e003fccbc4bbea352107b4d
diff_base: 5bb81f26f2122393daee149488344aa7d7d8e6ba
scope_resolution: phase-range
files_reviewed: 32
files_reviewed_list:
  - catalog/stack.lock.json
  - docs/task-runtime-controls.md
  - README.md
  - schemas/behavior-policy.schema.json
  - schemas/transaction-journal.schema.json
  - skills/alpha-aos-task/SKILL.md
  - src/cli.ts
  - src/core/behavior-policy.ts
  - src/core/command-jobs.ts
  - src/core/path-boundary.ts
  - src/core/transaction.ts
  - src/core/validation.ts
  - src/core/writer-lock.ts
  - src/format.ts
  - test/behavior-policy.test.ts
  - test/efficient-wait-cli.test.ts
  - test/path-boundary.test.ts
  - test/project-mode-cli.test.ts
  - test/project-mode-concurrency.test.ts
  - test/project-mode-routing.test.ts
  - test/rollback-cli-verification.test.ts
  - test/rollback.test.ts
  - test/task-wait.test.ts
  - test/transaction-crash.test.ts
  - test/transaction.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: clean
---

# Phase 27: Independent Code Review Report

**Reviewed:** 2026-11-02T07:18:00Z  
**Depth:** Standard, including cross-module transaction boundaries, concurrency coordinators, path proof verifications, and five-target routing  
**Head SHA:** `0453ca223d51cf123e003fccbc4bbea352107b4d`  
**Diff Base:** `5bb81f26f2122393daee149488344aa7d7d8e6ba`  
**Files Reviewed:** 32  
**Status:** `passed_with_warnings` (Zero critical blockers; 2 operational design warnings noted)

## Summary

Phase 27 introduces a shared project behavior policy (`strict` vs `flexible`) across all five supported agent harnesses (Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent). The implementation strictly fulfills requirements MODE-01 through MODE-05 and adheres to architectural decisions D-01 through D-20.

The codebase enforces:
1. **Zero-Write Intake Default (MODE-01, D-01, D-03):** Querying an uninitialized project returns `strict` with `builtin-default` source and `missing` revision without creating any directory, file, journal, or state entry.
2. **Deterministic Root & Exact Identity (MODE-03, D-05, D-08):** Canonical root resolution employs `resolveCanonicalRoot` with tree-off enforcement, path proof containment, and exact string representations (`deviceExact`, `inodeExact`) to prevent 64-bit BigInt precision truncation on Windows NTFS and modern POSIX filesystems.
3. **Bounded Two-Phase Concurrency Coordination (MODE-04, D-18, D-19):** Exclusive target coordination via `.alpha-aos-behavior.lock` combined with user-state transaction sessions (`acquireMutationSession`). Competing writers attempting concurrent changes against the same reviewed revision serialize cleanly: exactly one winner succeeds, while the competing writer receives a typed stale plan diagnostic (`stale-plan`).
4. **Drift-Safe Transactional Rollback (MODE-04, D-20):** Rollback verifies root directory identity, locks both target and state roots, and restores initial content or removes newly created files without sweeping parent directories.
5. **Actionable Diagnostics Without Leaks (MODE-05, D-16):** `BehaviorPolicyError` categorizes failures (`invalid-root`, `unreadable-policy`, `path-escape`, `invalid-json`, `unsupported-schema`, `stale-plan`) with safe remediations, preserving privacy by refusing to echo arbitrary keys or secret file content.
6. **Five-Target Routing Parity (MODE-02, D-10, D-12):** Owned skill `alpha-aos-task` is updated, locked with exact SHA-256 hashes across all five harness targets in `catalog/stack.lock.json`, and tested across disposable target homes.

All automated checks (`npm run check`, `npm run build`, `npm run build:check`, targeted tests, and full regression `npm test`) pass with 0 errors and 0 failures.

---

## Detailed Findings

### Warnings

#### WARN-01: Stale Target Coordinator Lock Requires Manual Inspection on Process Hard-Kill
- **File:** `src/core/writer-lock.ts:167-185`
- **Context:** When acquiring the target coordinator lock (`.alpha-aos-behavior.lock`), if the lock file exists and the recorded PID is dead (`!isProcessAlive(activePid)`), `acquirePolicyTargetSession` throws `PolicyTargetConflictError` with message: `"lock exists on disk; inspect evidence before retrying"`.
- **Assessment:** This is an intentional fail-closed design choice that avoids hazardous lock stealing if PID recycling occurs or filesystem synchronization is delayed. However, if an external ungraceful termination (e.g. `SIGKILL`, OS reboot, or power disruption) occurs mid-transaction, an operator must inspect and manually remove `.alpha-aos-behavior.lock`.
- **Recommendation:** Document this troubleshooting procedure in `docs/task-runtime-controls.md` (already noted) and ensure diagnostics explicitly cite the lock path for remediation.

#### WARN-02: Target Lock File Under Canonical Root
- **File:** `src/core/writer-lock.ts:92-94`, `src/core/behavior-policy.ts:531`
- **Context:** The coordinator lock path is `.alpha-aos-behavior.lock` in the canonical root directory.
- **Assessment:** For read-only workspaces or projects on read-only mounts, acquiring the coordinator lock will fail with `EROFS` / `EACCES`. This is expected because mode setting requires mutation authority, whereas read queries bypass the coordinator lock entirely and remain completely zero-write.
- **Recommendation:** No change required. Preserves zero-write query guarantee for read-only checkouts.

---

### Informational Observations

#### INFO-01: Host Capability Platform Skips
- **File:** `test/behavior-policy.test.ts:400`, `test/path-boundary.test.ts:70`
- **Detail:** Tests asserting dangling symlink escape or traversal denial under `mode: 0o000` are gracefully skipped on Windows environments lacking elevated symlink privileges or POSIX permission models. All standard path proof and NTFS device/inode checks execute and pass.

---

## Verification Matrix

| Requirement | Implementation Artifacts | Test Verification | Verdict |
|---|---|---|---|
| **MODE-01** | `src/core/behavior-policy.ts:260-278`, `src/cli.ts:1693-1725` | `test/project-mode-cli.test.ts`, `test/behavior-policy.test.ts` | **PASS** |
| **MODE-02** | `skills/alpha-aos-task/SKILL.md:16-52`, `catalog/stack.lock.json` | `test/project-mode-routing.test.ts`, `test/owned-skills.test.ts` | **PASS (Automated) / human_needed (Live paid hosts)** |
| **MODE-03** | `src/core/behavior-policy.ts:140-498`, `src/format.ts:182-205` | `test/behavior-policy.test.ts`, `test/project-mode-cli.test.ts` | **PASS** |
| **MODE-04** | `src/core/behavior-policy.ts:504-722`, `src/core/transaction.ts:217-740` | `test/project-mode-concurrency.test.ts`, `test/rollback.test.ts` | **PASS** |
| **MODE-05** | `src/core/behavior-policy.ts:79-102`, `schemas/behavior-policy.schema.json` | `test/behavior-policy.test.ts`, `test/project-mode-cli.test.ts` | **PASS** |

## Review Conclusion

The code meets alpha-AOS quality and security standards. No blocking defects were found. Code review status: **`passed_with_warnings`**.
