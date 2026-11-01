---
phase: 27-shared-project-behavior-policy
verified: 2026-11-02T07:18:00Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - "Native interactive session execution for external paid hosts (Claude Code, Codex, Pi Agent, Hermes Agent) requires interactive cloud model quota/credentials and remains open as human_needed per D-12. Antigravity is natively proven."
covered_files: [
  ".planning/REQUIREMENTS.md",
  ".planning/ROADMAP.md",
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
  ".planning/phases/27-shared-project-behavior-policy/27-CONTEXT.md",
  ".planning/phases/27-shared-project-behavior-policy/27-NATIVE-EVIDENCE.md",
  ".planning/phases/27-shared-project-behavior-policy/27-REVIEW.md",
  ".planning/phases/27-shared-project-behavior-policy/27-VALIDATION.md",
  "catalog/stack.lock.json",
  "docs/task-runtime-controls.md",
  "package.json",
  "README.md",
  "schemas/behavior-policy.schema.json",
  "schemas/transaction-journal.schema.json",
  "skills/alpha-aos-task/SKILL.md",
  "src/cli.ts",
  "src/core/behavior-policy.ts",
  "src/core/command-jobs.ts",
  "src/core/path-boundary.ts",
  "src/core/transaction.ts",
  "src/core/validation.ts",
  "src/core/writer-lock.ts",
  "src/format.ts",
  "test/behavior-policy.test.ts",
  "test/efficient-wait-cli.test.ts",
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
---

# Phase 27: Shared Project Behavior Policy Verification Report

**Phase Goal:** Provide a shared project behavior policy (`strict` vs `flexible`) across all five supported harnesses (Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent), consumable before GSD initialization, re-read at each task intake, and safely mutated via bounded, snapshotted transactions.  
**Verified:** 2026-11-02T07:18:00Z  
**Status:** `human_needed` (Automated verification: 100% PASS; Live external paid host proof: open for human check per D-12)  
**Re-verification:** No — initial verification of Phase 27 execution.

---

## Goal Achievement & Observable Truths

All fifteen observable truths defined across Plans 27-01 through 27-05 have been verified against the live repository codebase, unit/CLI test suites, transaction guarantees, and regression suites.

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Querying a project without a policy returns default `strict` with `builtin-default` source and `missing` revision without creating any directory, file, journal, or state entry. | **VERIFIED** | `src/core/behavior-policy.ts:266-277`, `test/behavior-policy.test.ts`, `test/project-mode-cli.test.ts` (zero-write hash assertion across project, home, and state roots passes). |
| 2 | Canonical project root resolution reuses `resolveCanonicalRoot` standard ladder, respects tree-off isolation, and prevents inheritance across Git repo/submodule boundaries. | **VERIFIED** | `src/core/behavior-policy.ts:159-219`, `test/behavior-policy.test.ts` (tree-off invocation/target, boundary isolation tests all pass). |
| 3 | Policy path containment is proved against canonical root; symlink escape, dangling link, and non-directory parents are rejected with actionable diagnostics. | **VERIFIED** | `src/core/behavior-policy.ts:244-386`, `test/behavior-policy.test.ts`. |
| 4 | Closed schema (`schemas/behavior-policy.schema.json`) enforces `schemaVersion: 1`, mode `strict` or `flexible`, and `additionalProperties: false`. | **VERIFIED** | `schemas/behavior-policy.schema.json`, `src/core/behavior-policy.ts:453-484`, `test/behavior-policy.test.ts`. |
| 5 | Malformed JSON and duplicate keys are rejected without leaking property names or file contents. | **VERIFIED** | `src/core/behavior-policy.ts:427-439`, `test/behavior-policy.test.ts` (sentinel key and value leak tests pass). |
| 6 | Bound task root mismatch is strictly blocked before reading or mutating policy. | **VERIFIED** | `src/core/behavior-policy.ts:222-238`, `test/behavior-policy.test.ts`. |
| 7 | Exact string device and inode identities (`deviceExact`, `inodeExact`) preserve >2^53 BigInt filesystem identity without truncation on Windows NTFS and 64-bit inodes. | **VERIFIED** | `src/core/path-boundary.ts:37-285`, `src/core/behavior-policy.ts:516-529`, `test/path-boundary.test.ts`. |
| 8 | Read-only mode change planner (`planProjectModeChange`) previews exact transition, binds root identity, computes reviewed `planDigest`, and creates zero filesystem mutations. | **VERIFIED** | `src/core/behavior-policy.ts:504-581`, `test/project-mode-cli.test.ts`. |
| 9 | Requesting the current mode is a linearized no-op that writes zero bytes, creates zero journals, and returns `operationId: null`. | **VERIFIED** | `src/core/behavior-policy.ts:616-626`, `test/project-mode-cli.test.ts`. |
| 10 | Target coordinator lock (`.alpha-aos-behavior.lock`) provides physical writer exclusion across separate processes and state roots. | **VERIFIED** | `src/core/writer-lock.ts:92-195`, `test/project-mode-concurrency.test.ts`. |
| 11 | Concurrent changes against the same reviewed revision serialize cleanly: one winner succeeds; second writer receives typed `stale-plan` diagnostic. | **VERIFIED** | `src/core/behavior-policy.ts:674-683`, `test/project-mode-concurrency.test.ts`. |
| 12 | Atomic file transaction (`applyFileTransaction`) creates `.alpha-aos/behavior.json` with snapshot, journal, and root-bounded permissions without touching unrelated project files. | **VERIFIED** | `src/core/behavior-policy.ts:686-705`, `src/core/transaction.ts:208-360`, `test/project-mode-cli.test.ts`. |
| 13 | Rollback (`alpha-aos rollback <operation-id>`) verifies root identity, restores previous bytes or absence, and leaves parent directory untouched without sweeping. | **VERIFIED** | `src/core/transaction.ts:420-740`, `test/rollback.test.ts`, `test/rollback-cli-verification.test.ts`. |
| 14 | Owned skill `alpha-aos-task` routes natural-language policy queries/changes first, maintains zero authority expansion (Mode Preference Invariant), and retains strict contract/start boundaries. | **VERIFIED** | `skills/alpha-aos-task/SKILL.md:13-52,204-208`, `catalog/stack.lock.json`, `test/project-mode-routing.test.ts`. |
| 15 | Cross-target visibility ensures that when Target A changes mode, Target B observes the fresh revision on next intake without inheriting state. | **VERIFIED** | `test/project-mode-routing.test.ts` (Host A / Host B cross-visibility test passes). |

---

## Required Artifacts Verification

| Artifact | Purpose | Status | Details |
|---|---|---|---|
| `schemas/behavior-policy.schema.json` | JSON Schema for behavior policy | **VERIFIED** | Validated via `validateAgainstSchema`, closed `additionalProperties: false`. |
| `schemas/transaction-journal.schema.json` | Schema extension for policyOperation | **VERIFIED** | Supports `policyOperation` metadata with `deviceExact` and `inodeExact`. |
| `src/core/behavior-policy.ts` | Core resolution, planning, and mutation | **VERIFIED** | Exports `resolveProjectBehavior`, `planProjectModeChange`, `applyProjectModeChange`, `BehaviorPolicyError`. |
| `src/core/writer-lock.ts` | Physical target coordinator lock | **VERIFIED** | Exports `acquirePolicyTargetSession`, `policyTargetLockPath`, `PolicyTargetConflictError`. |
| `src/core/path-boundary.ts` | Exact BigInt identity and comparison | **VERIFIED** | Exports `compareComponentIdentity`, `deviceExact`, `inodeExact` fields. |
| `src/core/transaction.ts` | Policy transaction and drift-safe rollback | **VERIFIED** | Implements target/state double-session verification and exact root rollback guards. |
| `src/cli.ts` | Public CLI command dispatch | **VERIFIED** | Implements `alpha-aos project mode [path] [--json]` and `project mode set strict\|flexible [path] [--apply] [--plan-digest <digest>] [--json]`. |
| `skills/alpha-aos-task/SKILL.md` | Five-target task intake skill | **VERIFIED** | Updated with Section 1 (Project Behavior Policy Request) and Mode Preference Invariant. |
| `catalog/stack.lock.json` | Lockfile synchronization | **VERIFIED** | SHA-256 `b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e` synchronized across all 5 targets. |
| `docs/task-runtime-controls.md` | Operational reference | **VERIFIED** | Complete command documentation, coordinator lock mechanics, and troubleshooting. |

---

## Key Link & Data Flow Verification

1. **Query Data Flow:**
   `alpha-aos project mode` → `resolveProjectBehavior` → `canonicalizeWithMissingTail` → `loadTreeRegistry` → `resolveCanonicalRoot` → `provePathBoundary` → `recheckPathProof` → `parseManagedDocument` → `validateAgainstSchema` → `formatProjectBehavior` → stdout.
2. **Preview Data Flow:**
   `alpha-aos project mode set strict|flexible` → `planProjectModeChange` → `resolveProjectBehavior` → exact root identity extraction → `reviewedDigest("project-mode-plan-v1", ...)` → `formatProjectModePlan` → stdout.
3. **Mutation & Locking Flow:**
   `alpha-aos project mode set ... --apply --plan-digest` → `applyProjectModeChange` → verify plan digest → `acquirePolicyTargetSession` (`.alpha-aos-behavior.lock`) → `acquireMutationSession` (`stateRoot`) → recheck plan under held locks → `applyFileTransaction` → snapshot → atomic write → sync directory → release locks in reverse order.
4. **Rollback Flow:**
   `alpha-aos rollback <id> --apply` → `rollbackManagedTransaction` → read & validate journal → verify tree policy → verify root identity (`deviceExact`, `inodeExact`) → lock target & state → atomic restore/removal → update journal status.

---

## Regression & Test Suite Execution

- **Targeted Phase 27 Suite:**
  `node scripts/run-tests.mjs --files dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js dist/test/project-mode-cli.test.js dist/test/behavior-policy.test.js dist/test/project-mode-concurrency.test.js`
  - Results: 32 tests, 31 passed, 0 failed, 1 skipped (Windows unprivileged symlink capability skip), duration: ~30.9s.
- **Full Regression Suite (`npm test`):**
  - Results: 100% passed (0 failed, 0 cancelled across entire repository test corpus).
- **Artifact Build Gate (`npm run build:check`):**
  - Results: 311 inputs, 612 outputs verified cleanly.
- **TypeScript Static Verification (`npm run check`):**
  - Results: 0 errors.

---

## Native Evidence & Human-Needed Boundary

Per Decision **D-12** and Phase 27 validation rules, fixture proof must not be deceptively reported as native execution proof:
- **Antigravity CLI / IDE:** **PROVEN** in active working session. Policy queries and skill instructions load and execute properly without authority expansion.
- **Claude Code, Codex, Pi Agent, Hermes Agent:** **`human_needed`** / Open. Fixture deployment, hash parity, and cross-target visibility are 100% verified in `test/project-mode-routing.test.ts`. However, live model interactions were not run because chargeable/paid model API calls and global package mutations are unauthorized in unattended CI execution.

---

## Final Verification Verdict

- **Automated Verification:** **PASS** (15/15 truths verified, 0 regressions, 0 typecheck errors).
- **Overall Phase 27 Status:** **`human_needed`** (Kept open for human review of live external paid host invocations per D-12).
