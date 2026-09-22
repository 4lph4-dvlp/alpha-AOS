---
phase: 05-persistent-tree-off-preload-isolation
plan: 04
subsystem: core
tags: [surface-inspector, environment-allowlist, local-passthrough, sealed-guardrail, boundary-notice]

# Dependency graph
requires:
  - phase: 05-persistent-tree-off-preload-isolation
    plan: 03
    provides: "tree-policy.ts (resolveEffectivePolicy, canonicalizeTreePath), tree CLI commands"
provides:
  - "src/types.ts — ScrubbedEnvironmentResult, LocalProjectResources, TreeSurfaceInspection"
  - "src/core/process.ts — scrubEnvironmentForOffTree, REVIEWED_RUNTIME_ALLOWLIST, AI_AUTH_PREFIXES"
  - "src/core/surface-inspector.ts — discoverLocalProjectResources, assertSealedModeRefusal, inspectTreeSurface"
  - "src/format.ts — formatTreeInspection"
  - "src/cli.ts — alpha-aos tree inspect [path] [--harness <id>] [--mode <mode>] [--json]"
  - "test/tree-inspect.test.ts — Automated integration tests for allowlist scrubbing, local resource passthrough, 8-dimension surface reports, and sealed fail-closed enforcement"
affects: [phase-verification, uat]

actuals:
  tokens: 50000
  tasks: 3
  commits: 1
plan_head_before: 0759f41

tech-stack:
  added: []
  patterns:
    - "Reviewed environment allowlist with ambient secret scrubbing (D-14, OPTO-07)"
    - "Zero-intervention native passthrough for project-local resources (.agents/skills, .mcp.json, .codex/config.toml, AGENTS.md, .hooks) (D-13, OPTO-06)"
    - "8-dimension surface inspection report via alpha-aos tree inspect (D-15, OPTO-08)"
    - "Prominent configuration isolation boundary notice (D-16, OPTO-09)"
    - "Fail-closed exit code 2 refusal on unsupported sealed mode requests without silent fallback (D-16, OPTO-09)"

key-files:
  created:
    - src/core/surface-inspector.ts
    - test/tree-inspect.test.ts
  modified:
    - src/types.ts
    - src/core/process.ts
    - src/shim-dispatch.ts
    - src/format.ts
    - src/cli.ts
    - test/shims.test.ts

key-decisions:
  - "REVIEWED_RUNTIME_ALLOWLIST forwards essential OS and shell variables (PATH, HOME, USERPROFILE, SYSTEMROOT, etc.)"
  - "AI_AUTH_PREFIXES forwards recognized model provider credentials (OPENAI_*, ANTHROPIC_*, GEMINI_*, etc.)"
  - "Ambient cloud, database, payment, private tokens (AWS_*, DATABASE_URL, STRIPE_*) and internal ALPHA_AOS_* variables are strictly scrubbed"
  - "discoverLocalProjectResources performs read-only inspection of repository-local skills, MCP configs, and instructions without altering them"
  - "assertSealedModeRefusal throws ProcessPolicyError with code unsupported-executable and exit code 2 when sealed mode is requested"
  - "inspectTreeSurface evaluates policy hierarchy, isolated config roots, excluded global customizations, local resources, allowlist scrubbing, harness support proof, PATH shim precedence, and configuration isolation notices"

requirements-completed: [OPTO-06, OPTO-07, OPTO-08, OPTO-09]

coverage:
  - id: D-13
    description: "Zero-intervention native passthrough for project-local resources; vanilla when absent"
    requirement: "OPTO-06"
    verification:
      - kind: integration
        ref: "test/tree-inspect.test.ts#project-local resource passthrough discovers local configs and skills without modifying them"
        status: pass
  - id: D-14
    description: "Reviewed environment allowlist forwards runtime and AI keys while scrubbing ambient secrets"
    requirement: "OPTO-07"
    verification:
      - kind: unit
        ref: "test/tree-inspect.test.ts#reviewed environment allowlist preserves runtime and AI auth keys while scrubbing ambient secrets"
        status: pass
  - id: D-15
    description: "8-dimension surface inspection report via alpha-aos tree inspect"
    requirement: "OPTO-08"
    verification:
      - kind: integration
        ref: "test/tree-inspect.test.ts#inspectTreeSurface populates all 8 dimensions accurately"
        status: pass
  - id: D-06
    description: "Antigravity GUI desktop launches report provable: false and exit code 2"
    requirement: "OPTO-08"
    verification:
      - kind: unit
        ref: "test/tree-inspect.test.ts#Antigravity GUI reports unsupported and provable: false on surface inspection"
        status: pass
  - id: D-16
    description: "Configuration isolation boundary notice and fail-closed refusal for sealed container requests"
    requirement: "OPTO-09"
    verification:
      - kind: unit
        ref: "test/tree-inspect.test.ts#assertSealedModeRefusal throws ProcessPolicyError with exit code 2 and no fallback"
        status: pass
---

# Plan 05-04 Summary: Local Resource Native Passthrough, Reviewed Environment Allowlist, 8-Dimension Surface Inspector & Sealed Guardrail

## Accomplishments
1. **Reviewed Environment Allowlist and Ambient Secret Scrubbing (`src/core/process.ts`, D-14, OPTO-07)**:
   - Defined `REVIEWED_RUNTIME_ALLOWLIST` encompassing platform floor variables, shell paths, user profiles, and standard runtime certificates.
   - Defined `AI_AUTH_PREFIXES` covering major AI providers (`OPENAI_`, `ANTHROPIC_`, `GEMINI_`, `AZURE_OPENAI_`, `COPILOT_`, etc.).
   - Implemented `scrubEnvironmentForOffTree` which strips ambient secrets (database URLs, AWS keys, Stripe tokens) and internal `ALPHA_AOS_*` management variables.
   - Integrated `scrubEnvironmentForOffTree` into `src/shim-dispatch.ts` prior to child process execution in `off` trees.
2. **Project-Local Resource Passthrough Engine (`src/core/surface-inspector.ts`, D-13, OPTO-06)**:
   - Implemented `discoverLocalProjectResources` which checks for `.agents/skills`, `.mcp.json`, `.codex/config.toml`, `AGENTS.md`, `CLAUDE.md`, and `.hooks`.
   - Guaranteed zero modification, zero mutation, and zero promotion of local repository resources.
   - Accurately reports `isVanilla: true` when no local customization files exist.
3. **8-Dimension Surface Inspector (`src/core/surface-inspector.ts`, `src/format.ts`, D-15, OPTO-08)**:
   - Implemented `inspectTreeSurface` evaluating all 8 dimensions:
     1. Policy & Hierarchy
     2. Isolated Configuration Roots
     3. Excluded Global Resources (Skills, MCP, Hooks, Instructions, Memory)
     4. Discovered Project-Local Resources
     5. Environment Allowlist Status
     6. Harness Support & Isolation Proof
     7. Pre-Launch Enforcement (PATH Shim Precedence)
     8. Security Boundary Notice
   - Implemented `formatTreeInspection` rendering human-readable diagnostic tables.
4. **Sealed Mode Refusal Guardrail (`src/core/surface-inspector.ts`, `src/cli.ts`, D-16, OPTO-09)**:
   - Implemented `assertSealedModeRefusal` failing closed with `ProcessPolicyError` and exit code 2 without fallback when `sealed` mode is requested.
5. **CLI Subcommand Integration (`src/cli.ts`)**:
   - Implemented `alpha-aos tree inspect [path] [--harness <id>] [--mode <managed|off|sealed>] [--json]`.
6. **Automated Test Suite (`test/tree-inspect.test.ts`)**:
   - 5 comprehensive tests verifying environment scrubbing, local resource discovery, 8-dimension inspection, Antigravity GUI rejection, and sealed mode fail-closed enforcement.
