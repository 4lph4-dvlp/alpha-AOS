---
status: complete
phase: 05-persistent-tree-off-preload-isolation
source: [05-VERIFICATION.md]
started: 2026-09-18T03:00:00Z
updated: 2026-09-18T03:04:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Directory Tree Policy Registry & Nearest Ancestor Inheritance (OPTO-01, D-01, D-02, D-03)
- **Scenario:** Developer registers an `off` policy for a directory (`alpha-aos tree set <path> --mode off`) and previews policy inside a nested subdirectory.
- **Expected:** Policy is persisted strictly in `~/.alpha-aos/trees.json` with zero repository modification. Nested descendants inherit `off` mode (Nearest Ancestor / Longest Prefix Match). Explicit nested overrides resolve to their specific mode.
- **Result:** pass (`test/tree-policy.test.ts` verified).

### 2. Transparent PATH CLI Shims & Harness Preload Exclusion (OPTO-02, OPTO-05, D-05, D-07)
- **Scenario:** Developer starts an agent (`codex`, `pi`, `hermes`, `agy`) normally without `alpha-aos run` inside an `off` tree.
- **Expected:** Transparent shims on PATH intercept execution in <0.2ms. For `off` trees, harness-specific preload exclusion flags (`--strict-config`, `--no-skills`, etc.) are injected alongside isolated configuration roots (`~/.alpha-aos/isolated/trees/<id>/`). Native logins are referenced via zero-copy links without reading secret bytes.
- **Result:** pass (`test/shims.test.ts` verified).

### 3. First-Use Git Root Classification & Headless CI Fallback (OPTO-03, D-09, D-10, D-11)
- **Scenario:** Developer opens an unclassified Git repository in an interactive terminal versus a headless CI runner.
- **Expected:** Interactive terminal presents 3 clear options (`[1] Managed, [2] Off, [3] 나중에 결정`). Choices persist globally to `trees.json` with zero repo edits. Headless/CI environments fall back safely to Fail-Safe Off without hanging.
- **Result:** pass (`test/tree-classify.test.ts` verified).

### 4. Late Discovery Clean Restart (OPTO-04)
- **Scenario:** An off tree requirement is detected after customizations have already loaded into process memory.
- **Expected:** alpha-AOS plans a clean subprocess restart with target arguments and preload exclusion flags, ensuring no false isolation claims or dirty in-memory customizations persist.
- **Result:** pass (`test/tree-classify.test.ts` verified).

### 5. Local Resource Native Passthrough (OPTO-06, D-13)
- **Scenario:** Developer places `.agents/skills`, `.codex/config.toml`, `.mcp.json`, `AGENTS.md`, or `.hooks` in an `off` repository.
- **Expected:** Native harnesses read and execute these project-local resources directly without alpha-AOS altering, managing, or globally promoting them. When absent, the harness runs vanilla.
- **Result:** pass (`test/tree-inspect.test.ts` verified).

### 6. Reviewed Environment Allowlist & Ambient Secret Scrubbing (OPTO-07, D-14)
- **Scenario:** Subprocess launched inside an `off` tree with ambient environment variables.
- **Expected:** Essential OS runtime variables and recognized AI model provider credentials (`OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`, etc.) pass through. Ambient cloud keys, database URLs, payment keys, and internal `ALPHA_AOS_*` variables are strictly scrubbed.
- **Result:** pass (`test/tree-inspect.test.ts` verified).

### 7. 8-Dimension Surface Inspector (OPTO-08, D-15)
- **Scenario:** Developer runs `alpha-aos tree inspect [path]`.
- **Expected:** Generates comprehensive diagnostic report covering all 8 dimensions: Policy & Hierarchy, Isolated Config Root, Excluded Global Resources, Discovered Local Resources, Environment Allowlist Status, Harness Support Proof, Pre-Launch Enforcement, and Security Boundary Notice.
- **Result:** pass (`test/tree-inspect.test.ts` verified).

### 8. Fail-Closed Guardrails & Sealed Mode Refusal (OPTO-08, OPTO-09, D-06, D-08, D-16)
- **Scenario:** Developer inspects an unprovable surface (Antigravity desktop GUI) or requests `sealed` mode.
- **Expected:** Antigravity GUI reports `provable: false` and halts with exit code 2. Unsupported `sealed` mode requests fail closed immediately with `ProcessPolicyError` (exit code 2) without silent fallback.
- **Result:** pass (`test/tree-inspect.test.ts` verified).
