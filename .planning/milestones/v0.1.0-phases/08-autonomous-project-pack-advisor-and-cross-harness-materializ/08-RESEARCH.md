# Phase 8: Autonomous Project Pack Advisor and Cross-Harness Materializer - Research

**Date:** 2026-09-21
**Status:** Completed

## 1. Multi-Harness Global Skill Discovery Patterns

In `alpha-AOS`, capabilities are distributed across five supported harnesses:
1. **Claude Code (`claude`)**:
   - Location: `~/.claude/skills/<id>/SKILL.md` (override via `CLAUDE_CONFIG_DIR`).
   - Claude Code parses frontmatter directives such as `disable-model-invocation: true` (for explicit skills like `alpha-aos-ship`) or omits it for model-invocable skills.
   - Claude also accepts `argument-hint: "<args>"`.

2. **Codex (`codex`)**:
   - Location: `~/.agents/skills/<id>/SKILL.md` (override via `CODEX_HOME` / home resolution).
   - Global ECC skills already land in `~/.agents/skills/` (see `src/core/ecc-skills.ts:54`).
   - Codex discovers skills under `~/.agents/skills/` with `SKILL.md` frontmatter (`name`, `description`).

3. **Antigravity (`antigravity`)**:
   - Location: `~/.gemini/config/skills/<id>/SKILL.md` (override via `ANTIGRAVITY_CONFIG_DIR`).
   - Antigravity scans `~/.gemini/config/skills/` for custom skills (already hosting `documentation-lookup`, `deep-research`, `unified-memory`).
   - Supports standard YAML frontmatter (`name`, `description`).

4. **Pi Agent (`pi`)**:
   - Location: `~/.agents/skills/<id>/SKILL.md` (shares the standard agent skill directory).
   - Pi reads `SKILL.md` directly.

5. **Hermes Agent (`hermes`)**:
   - Location: `~/.hermes/skills/<id>/SKILL.md` (override via `HERMES_HOME`).
   - Hermes scans `~/.hermes/skills/` for user skills.

## 2. Frontmatter & Rendering Architecture for Owned Skills

Currently, `src/core/owned-skills.ts` only implements `target: "claude"`:
```typescript
function destinationFor(target: HarnessId, id: string, claudeHome?: string): string {
  if (target === "claude") return join(claudeHomeRoot(claudeHome), "skills", id, "SKILL.md");
  throw new Error(`Owned skill adapter is not implemented for target: ${target}`);
}
```
And:
```typescript
export function renderOwnedSkill(source: string, target: HarnessId, invocation: "explicit" | "automatic", argumentHint?: string): string {
  if (target !== "claude") throw new Error(`Owned skill renderer is not implemented for target: ${target}`);
  ...
}
```

### Generalizing Destination and Rendering
- We can define `destinationFor(target: HarnessId, id: string, customRoot?: string)` using the directory mapping:
  - `claude`: `join(customRoot ?? (process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude")), "skills", id, "SKILL.md")`
  - `codex`: `join(customRoot ?? (process.env.CODEX_HOME?.trim() || join(homedir(), ".agents")), "skills", id, "SKILL.md")`
  - `antigravity`: `join(customRoot ?? (process.env.ANTIGRAVITY_CONFIG_DIR?.trim() || join(homedir(), ".gemini", "config")), "skills", id, "SKILL.md")`
  - `pi`: `join(customRoot ?? join(homedir(), ".agents"), "skills", id, "SKILL.md")`
  - `hermes`: `join(customRoot ?? (process.env.HERMES_HOME?.trim() || join(homedir(), ".hermes")), "skills", id, "SKILL.md")`
- For rendering:
  - Frontmatter parser extracts existing frontmatter.
  - If `invocation === "explicit"` and target is `claude`, append `disable-model-invocation: true`.
  - If `argumentHint` is provided and target is `claude`, append `argument-hint: ...`.
  - For other targets, standard YAML frontmatter with `name` and `description` is preserved.
  - If `invocation === "automatic"`, no `disable-model-invocation` is added for any harness, making the skill directly discoverable and invocable by the LLM agent.

## 3. Project Pack Plan & Approval Contract

The CLI commands are already structured:
1. `alpha-aos project plan [path] --json`
   - Emits `ProjectCapabilityPlan` with:
     - `planDigest`: 64-character SHA-256 hex string.
     - `selected`: string array of selected packs (e.g. `["BROWNFIELD_INIT"]`).
     - `applicable`: string array of applicable packs.
     - `reasons`: detailed rationale per pack.
2. `alpha-aos project status [path] --json`
   - Emits `reconciliation`:
     - `artifactState`: `"intact" | "missing" | "changed" | "unreadable"`
     - `packs`: array of currently installed packs with `capability.deployment: "CURRENT"`.
3. `alpha-aos project approve [path] --plan-digest <digest> --apply`
   - Requires the exact `planDigest`.
   - Fails closed if the workspace has drifted.
   - Writes `.alpha-aos/plan.json`.
4. `alpha-aos project sync [path] --apply`
   - Materializes the approved plan, writing `.alpha-aos/receipts/<PACK>.json` and sidecars.

## 4. Advisor Skill Trigger & Interaction Strategy

The `alpha-aos-pack-advisor` skill should be structured so that:
- When an agent works in a project workspace, whenever it performs project setup, finishes a GSD phase, inspects a new repo, or changes dependencies:
  - It proactively runs `alpha-aos project plan . --json` and `alpha-aos project status . --json`.
  - It calculates if `selected` contains packs not in `status.reconciliation.packs`.
  - If any unmaterialized packs exist:
    - It concisely presents the pack name and reasons (e.g., "Matched BROWNFIELD_INIT: The repository already holds source code...").
    - It prompts the user for confirmation to install.
    - Upon user confirmation, it reads `planDigest` from the JSON and executes:
      `alpha-aos project approve . --plan-digest <digest> --apply`
      `alpha-aos project sync . --apply`
    - It validates that status is `CURRENT` and explains: "Installed `<packs>`. Restart your agent session or reload tools to use the newly configured MCP servers and project skills."
- If the user explicitly asks ("install packs", "alpha-aos pack check", "어울리는 팩 설치해줘"):
  - Same flow executes immediately.

## 5. Security & Invariant Guarantees

- **No Hash Guessing**: The plan digest MUST be extracted directly from the CLI's JSON stdout. Never hardcoded or truncated.
- **Fail Closed**: If `approve` or `sync` fails, the agent reports the error verbatim and does NOT attempt manual file mutations in `.alpha-aos/`.
- **Review Precedes Mutation**: The agent always informs the human user what is about to be installed before executing `--apply`.
