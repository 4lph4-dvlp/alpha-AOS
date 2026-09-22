# Phase 8: Autonomous Project Pack Advisor and Cross-Harness Materializer - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable AI agents across all five supported harnesses (Claude Code, Codex, Antigravity GUI/CLI/IDE, Pi Agent, and Hermes Agent) to autonomously detect when a workspace qualifies for project capability packs, recommend matched packs to the user with evidence, and execute transactional plan approval and materialization without human CLI copy-pasting.

This phase owns PACK-01, PACK-02, and PACK-03:
- PACK-01: Built-in cross-harness skill (`alpha-aos-pack-advisor`) deployed to all supported harnesses that detects newly available project capability packs, prompts for user approval, and executes plan approval and materialization without manual hash copying.
- PACK-02: Strict plan digest verification, determinism, rollback safety, and fail-closed behavior on receipt or digest tampering.
- PACK-03: Catalog and lock registration as an owned skill and distribution to Claude, Codex, Antigravity, Pi, and Hermes via managed install and update.

Explicitly NOT in this phase:
- Mutating project files or applying plans without explicit user confirmation (unless running in explicit non-interactive or pre-authorized mode).
- Bypassing the 64-character plan digest check or writing untracked files outside the transaction journal.
- Modifying upstream GSD core state machines or changing external pack definitions.
</domain>

<decisions>
## Implementation Decisions

### 1. Built-in Cross-Harness Skill Architecture (PACK-01, PACK-02)
- **D-01:** **Autonomous Pack Advisor Skill Specification**: Create `skills/alpha-aos-pack-advisor/SKILL.md`. The skill instructs the agent to:
  1. Inspect the workspace via `alpha-aos project plan . --json` to detect applicable capability packs and extract `planDigest`.
  2. Inspect currently active packs via `alpha-aos project status . --json`.
  3. Compare installed vs. applicable packs. If no unmaterialized packs exist, report that capability packs are current.
  4. If unmaterialized packs exist (e.g. `BROWNFIELD_INIT`, `WEB_BASE`, etc.), present them clearly to the user with the satisfied evidence/reasons and prompt for approval.
  5. Upon confirmation, execute `alpha-aos project approve . --plan-digest <digest> --apply` followed by `alpha-aos project sync . --apply`.
  6. Verify the resulting status is `CURRENT` and guide the user that restarting or continuing the session activates the new tools/skills.
  - **Reversibility:** reversible.

- **D-02:** **Strict Digest Safety and Non-Interactive Compatibility**: The agent must extract the exact 64-character hex `planDigest` from the structured JSON output of `project plan . --json`. Never approximate, truncate, or bypass the digest. If `approve --apply` fails due to drift, the agent re-runs `project plan . --json`, informs the user of the drift, and requests re-confirmation with the updated digest.
  - **Reversibility:** one-way — core determinism invariant.

### 2. Multi-Target Owned Skill Infrastructure (PACK-03)
- **D-03:** **Target Generalization in `src/core/owned-skills.ts`**:
  Extend `destinationFor` and `renderOwnedSkill` beyond Claude to support all 5 harnesses:
  - `claude`: `~/.claude/skills/<id>/SKILL.md` (or `CLAUDE_CONFIG_DIR`)
  - `codex`: `~/.agents/skills/<id>/SKILL.md` (or `CODEX_HOME`)
  - `antigravity`: `~/.gemini/config/skills/<id>/SKILL.md` (or `ANTIGRAVITY_CONFIG_DIR`)
  - `pi`: `~/.agents/skills/<id>/SKILL.md`
  - `hermes`: `~/.hermes/skills/<id>/SKILL.md` (or `HERMES_HOME`)
  Allow `renderOwnedSkill` to handle `invocation: "automatic"` (model-invocable without `disable-model-invocation`) and `invocation: "explicit"`.
  - **Reversibility:** costly — multi-harness adapter expansion.

- **D-04:** **Universal Install & Reconciliation Loop in `src/core/install.ts`**:
  Update `planInstallation` and `applyInstallation` to iterate over all active targets for each owned skill declared in `catalog.components.ownedSkills`, rather than gating on `claude` only.
  - **Reversibility:** costly — core installation loop changes.

### 3. Catalog & Lock Channel Management (PACK-01, PACK-03)
- **D-05:** **Catalog & Lock Registration**:
  Declare `alpha-aos-pack-advisor` in `catalog/stack.yaml`:
  - `id`: `alpha-aos-pack-advisor`
  - `source`: `skills/alpha-aos-pack-advisor/SKILL.md`
  - `targets`: `[claude, codex, antigravity, pi, hermes]`
  - `invocation`: `automatic`
  Compute exact SHA-256 hashes for source and each target's rendered output, pinning them in `catalog/stack.lock.json`.
  - **Reversibility:** costly — locked catalog schema.

### 4. Testing & Verification Suite
- **D-06:** **Comprehensive Multi-Harness Owned Skill Tests**:
  Add tests in `test/owned-skills.test.ts` verifying path resolution, rendering, planning, and transactional application across all five harnesses.
  Add integration test in `test/pack-advisor.test.ts` verifying the skill source validity, JSON contract matching, and execution simulation on a brownfield repo.
  - **Reversibility:** reversible.

### the agent's Discretion
- Exact phrasing and formatting of the skill instructions in `skills/alpha-aos-pack-advisor/SKILL.md`.
- Layout and helper methods in `test/pack-advisor.test.ts`.
</decisions>

<canonical_refs>
## Canonical References

### Product Specifications and Invariants
- `.planning/PROJECT.md` — Core control plane invariants, determinism, and safety guarantees.
- `.planning/REQUIREMENTS.md` — PACK-01, PACK-02, PACK-03 requirements.
- `.planning/ROADMAP.md` — Phase 8 goal and deliverables.
- `src/core/owned-skills.ts` — Existing owned skill rendering and transaction machinery.
- `src/core/install.ts` — Managed install planner and orchestrator.
- `src/core/ecc-skills.ts` — Harness path resolution patterns (`globalEccSkillRoot`).
- `catalog/stack.yaml` — Declarative catalog schema.
- `catalog/stack.lock.json` — Immutable dependency lock.
</canonical_refs>
