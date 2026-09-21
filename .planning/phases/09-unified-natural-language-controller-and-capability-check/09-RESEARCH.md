# Phase 09: Unified Natural Language Controller (`alpha-aos-control`) and Capability Checkpoint Automation - Research

## Research Findings & Architecture Decisions

### 1. Unified Skill Architecture vs. Multiple Skills
- Having separate skills (`alpha-aos-pack-advisor`, `alpha-aos-controller`, etc.) introduces routing contention where the LLM might hesitate over which skill to select, and increases prompt token count across all 5 harnesses.
- A single unified skill `alpha-aos-control` provides one authoritative entrypoint covering both capability lifecycle (discovery, plan, approve, sync) and environmental/policy management (tree policy, status, doctor, rollback, repair).
- The skill is configured with `invocation: automatic`, meaning models in Claude, Codex, Antigravity, Pi, and Hermes can invoke it directly upon recognizing intent or triggers.

### 2. The 2 → 3 Trigger Gap Analysis
- When an agent is working in GSD Phase 01 (scaffolding and environment setup) or general onboarding:
  1. The agent runs commands like `npm init`, `npm install react`, `pnpm add playwright`, or creates `package.json` / `pyproject.toml`.
  2. The environment is now ready to receive project capability packs (e.g. `WEB_REACT`, `WEB_BASE`, `NODE_WORKSPACE`), but the agent typically moves straight to writing domain source code unless explicitly prompted.
- Solution:
  - **Frontmatter semantic matching**: LLMs match skills based on keywords like "package installation finished", "environment setup completed", "manifest created", "scaffolding".
  - **In-skill checklist**: `## Automatic Checkpoint: Project Environment Setup Completion` provides clear step-by-step guidance for the agent to pause and inspect `project plan . --json` whenever environment setup completes.
  - **Policy injection**: In `docs/codex-execution-policy.md`, we include a concise checkpoint rule:
    `At project setup completion (manifests, dependencies, or scaffolding), run alpha-aos-control to evaluate project capability packs before continuing.`
    Character budget: `docs/codex-execution-policy.md` currently has 1918 characters. With a 2000-character maximum enforced by `src/core/codex-policy.ts`, we tighten existing sentences slightly to keep the total length safely around 1880-1920 characters.

### 3. Natural Language Command Mappings
- **Directory Isolation (Tree-Off)**:
  - CLI: `alpha-aos tree policy set . --mode off`
  - Invariant: Persists in external user registry (`userStateRoot()`), zero files written in the repository tree.
- **Directory Restoration**:
  - CLI: `alpha-aos tree policy set . --mode inherit`
- **Diagnostics**:
  - CLI: `alpha-aos status` (fast offline status)
  - CLI: `alpha-aos doctor` (full diagnostic report with canary results)
- **Rollback & Recovery**:
  - CLI: `alpha-aos rollback --apply` (transactional rollback with drift check)
  - CLI: `alpha-aos repair --apply` (snapshot crash recovery)

### 4. Catalog and Lock Channel Migration
- `catalog/stack.yaml`:
  - Replace `alpha-aos-pack-advisor` with `alpha-aos-control`:
    ```yaml
    - id: alpha-aos-control
      source: skills/alpha-aos-control/SKILL.md
      targets: [claude, codex, antigravity, pi, hermes]
      invocation: automatic
    ```
- `catalog/stack.lock.json`:
  - Calculate exact SHA-256 for `skills/alpha-aos-control/SKILL.md` source and target renderings, and register under `components.ownedSkills["alpha-aos-control"]`.
- Tests:
  - Update `test/catalog.test.ts` to assert `alpha-aos-control`.
  - Replace `test/pack-advisor.test.ts` with comprehensive `test/control.test.ts`.
