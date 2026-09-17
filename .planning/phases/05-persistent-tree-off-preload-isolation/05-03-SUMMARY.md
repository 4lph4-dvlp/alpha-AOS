---
phase: 05-persistent-tree-off-preload-isolation
plan: 03
subsystem: core
tags: [first-use, git-root, classification, cli, ci-fallback, preview]

# Dependency graph
requires:
  - phase: 05-persistent-tree-off-preload-isolation
    plan: 02
    provides: "shims.ts (generateShimScripts, findUpstreamBinary), shim-dispatch.ts"
provides:
  - "src/types.ts — FirstUseChoice, ClassificationResult, TreePreviewReport"
  - "src/core/tree-policy.ts — findEnclosingGitRoot, promptFirstUseClassification, classifyGitRootOrFallback, previewTreePolicy, planLateDiscoveryRestart"
  - "src/format.ts — formatTreeList, formatTreePreview"
  - "src/cli.ts — alpha-aos tree (set|list|preview|remove|classify)"
  - "test/tree-classify.test.ts — Unit and integration tests for classification, headless CI fallback, and tree CLI operations"
affects: [surface-inspector, tree-inspect]

actuals:
  tokens: 48000
  tasks: 3
  commits: 1
plan_head_before: cb6007e

tech-stack:
  added: []
  patterns:
    - "First-use Git repository root detection without borrowing from parents (D-09, OPTO-03)"
    - "Interactive 3-choice prompt [Managed / Off / 나중에 결정] (D-10)"
    - "Headless CI environment fail-safe fallback to Off mode by default, overrideable via ALPHA_AOS_DEFAULT_MODE (D-11)"
    - "Persistence solely to ~/.alpha-aos/trees.json with zero repository modifications or git commits (D-01, D-10)"
    - "Clean subprocess restart planning on late discovery of off mode to prevent dirty in-memory isolation claims (OPTO-04)"
    - "alpha-aos tree CLI management suite: set, list, preview, remove, classify (D-04, D-12)"

key-files:
  created:
    - test/tree-classify.test.ts
  modified:
    - src/types.ts
    - src/core/tree-policy.ts
    - src/shim-dispatch.ts
    - src/format.ts
    - src/cli.ts

key-decisions:
  - "findEnclosingGitRoot detects standard git repositories (.git directory) and git worktrees (.git pointer file)"
  - "promptFirstUseClassification uses an async iterator (for await) on readline to handle interactive re-prompts and stream closure without use-after-close errors"
  - "Headless/CI fallback defaults to off mode without hanging terminal sessions; ALPHA_AOS_DEFAULT_MODE=managed overrides this when explicitly desired"
  - "alpha-aos tree CLI commands provide full introspection (preview, list) and lifecycle management (set, remove, classify) without in-repo files"
  - "Late discovery triggers planLateDiscoveryRestart which persists off policy and returns clean launch arguments for child process execution"

requirements-completed: [OPTO-03, OPTO-04]

coverage:
  - id: D-09
    description: "Opening an unclassified Git root prompts user once before agent startup"
    requirement: "OPTO-03"
    verification:
      - kind: integration
        ref: "test/tree-classify.test.ts#findEnclosingGitRoot detects standard git repositories and worktrees"
        status: pass
      - kind: integration
        ref: "test/tree-classify.test.ts#interactive first-use classification commits to trees.json with zero repository modification"
        status: pass
  - id: D-10
    description: "3 explicit choices [Managed / Off / 나중에 결정] with zero repository files created or modified"
    requirement: "OPTO-03"
    verification:
      - kind: unit
        ref: "test/tree-classify.test.ts#promptFirstUseClassification prompts 3 options and parses interactive choices"
        status: pass
      - kind: unit
        ref: "test/tree-classify.test.ts#skip choice passes through without modifying trees.json or repository"
        status: pass
  - id: D-11
    description: "Headless/CI environments fall back to Fail-Safe Off without hanging"
    requirement: "OPTO-03"
    verification:
      - kind: unit
        ref: "test/tree-classify.test.ts#headless / CI fallback defaults to Fail-Safe Off without hanging"
        status: pass
  - id: D-04
    description: "alpha-aos tree management CLI suite (set, list, preview, remove, classify)"
    requirement: "OPTO-03"
    verification:
      - kind: integration
        ref: "test/tree-classify.test.ts#tree policy preview and management operations"
        status: pass
  - id: OPTO-04
    description: "Late discovery restart plan avoids false isolation claims"
    requirement: "OPTO-04"
    verification:
      - kind: unit
        ref: "test/tree-classify.test.ts#late discovery clean restart handles dirty in-memory discovery cleanly (OPTO-04)"
        status: pass
---

# Plan 05-03 Summary: First-Use Git Root Classification, TTY Flow, and Tree CLI Suite

## Accomplishments
1. **Git Root Detection & Interactive First-Use Classification (`src/core/tree-policy.ts`)**:
   - Implemented `findEnclosingGitRoot` supporting both standard Git repos (`.git` directory) and Git worktrees (`.git` file pointer).
   - Implemented `promptFirstUseClassification` presenting the 3 options (`Managed`, `Off`, `나중에 결정`) with robust async stream iteration.
   - Implemented `classifyGitRootOrFallback` which distinguishes interactive TTY environments from headless/CI runners, safely falling back to Fail-Safe Off by default or honoring `ALPHA_AOS_DEFAULT_MODE`.
   - Verified that user decisions are committed strictly to `~/.alpha-aos/trees.json` with zero changes or files created inside the repository (`D-01`, `D-10`).
2. **Late Discovery Clean Subprocess Restart (`src/core/tree-policy.ts`, OPTO-04)**:
   - Implemented `planLateDiscoveryRestart` which persists `off` policy and prepares clean upstream launch arguments with preload exclusion flags to prevent false isolation claims when customizations have already entered process memory.
3. **`alpha-aos tree` CLI Management Suite (`src/cli.ts`, `src/format.ts`)**:
   - Implemented `tree set <path> --mode <managed|off> [--notes <notes>]`.
   - Implemented `tree list [--json]` with `formatTreeList` table rendering.
   - Implemented `tree preview [path] [--harness <id>] [--json]` with `formatTreePreview` showing effective policy, inheritance depth, and launch arguments.
   - Implemented `tree remove <path> [--json]`.
   - Implemented `tree classify [path] [--json]` triggering the interactive flow for any repository.
4. **Integration Test Suite (`test/tree-classify.test.ts`)**:
   - 7 test cases covering standard repos, worktrees, non-git dirs, interactive choices, skip/passthrough, headless CI fallback, CLI preview/set/remove lifecycle, and late discovery clean restart.
