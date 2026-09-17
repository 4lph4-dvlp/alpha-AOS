---
phase: 05-persistent-tree-off-preload-isolation
verified: 2026-09-18T03:00:00Z
status: passed
score: 9/9 must-haves verified
requirements:
  - OPTO-01
  - OPTO-02
  - OPTO-03
  - OPTO-04
  - OPTO-05
  - OPTO-06
  - OPTO-07
  - OPTO-08
  - OPTO-09
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/ROADMAP.md"
  - ".planning/STATE.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-01-PLAN.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-01-SUMMARY.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-02-PLAN.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-02-SUMMARY.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-03-PLAN.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-03-SUMMARY.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-04-PLAN.md"
  - ".planning/phases/05-persistent-tree-off-preload-isolation/05-04-SUMMARY.md"
  - "schemas/tree-registry.schema.json"
  - "src/adapters/isolation.ts"
  - "src/adapters/shims.ts"
  - "src/cli.ts"
  - "src/core/process.ts"
  - "src/core/surface-inspector.ts"
  - "src/core/tree-policy.ts"
  - "src/core/validation.ts"
  - "src/format.ts"
  - "src/shim-dispatch.ts"
  - "src/types.ts"
  - "test/shims.test.ts"
  - "test/tree-classify.test.ts"
  - "test/tree-inspect.test.ts"
  - "test/tree-policy.test.ts"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 05: Persistent Tree-Off Preload Isolation Verification

## Executive Summary

Phase 05 establishes directory-tree opt-out policy registration, transparent PATH CLI shims, sub-millisecond preload exclusion, first-use git root classification, reviewed environment allowlist scrubbing, zero-intervention local resource passthrough, and the 8-dimension surface inspector across active harnesses (Codex, Pi, Hermes, and Antigravity CLI). All 9 phase requirements (`OPTO-01` through `OPTO-09`) and locked user constraints (`D-01` through `D-16`) are fully verified with 100% green test results (825 passed, 0 failed, 9 skipped).

---

## Requirement Verification

### OPTO-01: Persistent Tree Policy Registry & Nearest Ancestor Inheritance
- **Status:** Verified
- **Evidence:** `schemas/tree-registry.schema.json`, `src/core/tree-policy.ts` (`canonicalizeTreePath`, `computeTreeId`, `withinTreeRoot`, `resolveEffectivePolicy`, `setTreePolicy`, `removeTreePolicy`, `listTreePolicies`).
- **Tests:** `test/tree-policy.test.ts` (7/7 passed).
- **Verification Details:** Policy decisions persist solely to `~/.alpha-aos/trees.json` without creating or modifying repository files (`D-01`). Paths are canonicalized with OS-aware case matching (`D-02`). Nearest Ancestor (Longest Prefix Match) ensures deep descendants inherit parent policies while nested directories can set explicit overrides (`D-03`).

### OPTO-02 & OPTO-05: Transparent CLI Shims, Sub-Millisecond Dispatch & Preload Exclusion
- **Status:** Verified
- **Evidence:** `src/adapters/shims.ts` (`generateShimScripts`, `findUpstreamBinary`, `linkAuthWithoutCopying`, `prepareIsolatedTreeRoot`, `verifyShimsPrecedence`), `src/adapters/isolation.ts` (`getHarnessPreloadExclusion`), `src/shim-dispatch.ts`.
- **Tests:** `test/shims.test.ts` (6/6 passed).
- **Verification Details:** Transparent CLI shims in `~/.alpha-aos/shims/` intercept `codex`, `pi`, `hermes`, and `agy` on `PATH` without wrapper commands (`D-05`). Fast standalone dispatcher resolves cwd policy under 1ms (<0.2ms typical). Harness preload exclusion flags (`--strict-config --ignore-user-config --ignore-rules` for Codex; `--no-skills ...` for Pi; `chat --ignore-user-config ...` for Hermes) isolate from global customizations (`D-05`, `D-07`). User logins are referenced via zero-copy hardlinks without copying secret bytes (`D-07`).

### OPTO-03: First-Use Git Root Classification & Headless CI Fallback
- **Status:** Verified
- **Evidence:** `src/core/tree-policy.ts` (`findEnclosingGitRoot`, `promptFirstUseClassification`, `classifyGitRootOrFallback`), `src/shim-dispatch.ts`.
- **Tests:** `test/tree-classify.test.ts` (7/7 passed).
- **Verification Details:** Newly encountered Git roots (or worktrees) trigger an interactive 3-option prompt (`[Managed / Off / 나중에 결정]`) before agent startup (`D-09`, `D-10`). Non-interactive CI runners safely fall back to Fail-Safe Off without hanging terminal sessions (`D-11`). Decisions persist globally without repo modification (`D-01`).

### OPTO-04: Clean Restart on Late Discovery
- **Status:** Verified
- **Evidence:** `src/core/tree-policy.ts` (`planLateDiscoveryRestart`).
- **Tests:** `test/tree-classify.test.ts` (`late discovery clean restart handles dirty in-memory discovery cleanly`).
- **Verification Details:** When off mode is discovered after customizations have entered process memory, alpha-AOS persists off mode and generates a clean subprocess restart plan with preload exclusion flags to prevent false isolation claims.

### OPTO-06: Zero-Intervention Local Resource Native Passthrough
- **Status:** Verified
- **Evidence:** `src/core/surface-inspector.ts` (`discoverLocalProjectResources`).
- **Tests:** `test/tree-inspect.test.ts` (5/5 passed).
- **Verification Details:** In `off` mode, project-local `.agents/skills`, `.codex/config.toml`, `.mcp.json`, `AGENTS.md`/`CLAUDE.md`, and `.hooks` pass directly to native harnesses without alpha-AOS altering, managing, or globally promoting them (`D-13`). With no local resources present, the harness runs completely vanilla.

### OPTO-07: Reviewed Environment Allowlist & Ambient Secret Scrubbing
- **Status:** Verified
- **Evidence:** `src/core/process.ts` (`REVIEWED_RUNTIME_ALLOWLIST`, `AI_AUTH_PREFIXES`, `scrubEnvironmentForOffTree`), `src/shim-dispatch.ts`.
- **Tests:** `test/tree-inspect.test.ts`.
- **Verification Details:** Subprocess environments in `off` trees preserve essential OS runtime variables and recognized AI model provider credentials (`OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`, etc.), while stripping ambient secrets (database URLs, AWS keys, Stripe tokens) and internal `ALPHA_AOS_*` variables (`D-14`).

### OPTO-08: 8-Dimension Surface Inspector & Fail-Closed Guardrails
- **Status:** Verified
- **Evidence:** `src/core/surface-inspector.ts` (`inspectTreeSurface`), `src/format.ts` (`formatTreeInspection`), `src/cli.ts` (`alpha-aos tree inspect`).
- **Tests:** `test/tree-inspect.test.ts`.
- **Verification Details:** `alpha-aos tree inspect [path]` reports on all 8 dimensions: Policy & Hierarchy, Isolated Config Root, Excluded Global Resources, Discovered Local Resources, Environment Allowlist Status, Harness Support Proof, Pre-Launch Enforcement, and Security Boundary Notice (`D-15`). Antigravity desktop GUI launches are reported as unprovable/unsupported and fail closed with exit code 2 (`D-06`, `D-08`).

### OPTO-09: Configuration Isolation Boundary Notice & Sealed Container Refusal
- **Status:** Verified
- **Evidence:** `src/core/surface-inspector.ts` (`assertSealedModeRefusal`), `src/cli.ts`.
- **Tests:** `test/tree-inspect.test.ts`.
- **Verification Details:** Surface inspection clearly specifies that `off` mode provides Configuration Isolation rather than OS filesystem or network sandboxing (`D-16`). Requests for unsupported `sealed` mode fail closed immediately with `ProcessPolicyError` (exit code 2) without silent fallback (`D-16`).

---

## Test Execution Summary

```text
✔ 825 passing tests
✔ 0 failing tests
✔ 9 skipped tests (live network / optional platform harnesses)
✔ 0 regressions
```
