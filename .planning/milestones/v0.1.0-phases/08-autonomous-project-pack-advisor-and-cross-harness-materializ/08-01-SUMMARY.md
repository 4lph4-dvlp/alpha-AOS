# Phase 08 Plan 01 Summary: Multi-Target Owned Skill Engine & Install Orchestration

## Execution Overview

Wave 1 of Phase 08 focused on generalizing the repository-owned skill architecture and installation loop so that owned skills (such as `alpha-aos-ship` and `alpha-aos-pack-advisor`) can be planned, rendered, verified, and transactionally applied across all five supported agent harnesses: **Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent**.

## Key Changes

1. **Multi-Harness Skill Destination Resolution** (`src/core/owned-skills.ts`):
   - Generalized `destinationFor(target, id, options)` to resolve canonical and environment-overridden skill destinations across all 5 harnesses:
     - `claude`: `$CLAUDE_CONFIG_DIR/skills/<id>/SKILL.md` or `~/.claude/skills/<id>/SKILL.md`
     - `codex`: `$CODEX_HOME/skills/<id>/SKILL.md` or `~/.agents/skills/<id>/SKILL.md`
     - `antigravity`: `$ANTIGRAVITY_CONFIG_DIR/skills/<id>/SKILL.md` or `~/.gemini/config/skills/<id>/SKILL.md`
     - `pi`: `~/.agents/skills/<id>/SKILL.md`
     - `hermes`: `$HERMES_HOME/skills/<id>/SKILL.md` or `~/.hermes/skills/<id>/SKILL.md`
   - Added `customHome?: string` option for test isolation and portable destination mapping.

2. **Automatic Model Invocability & Frontmatter Rendering** (`src/core/owned-skills.ts`):
   - Extended `renderOwnedSkill` to handle both `invocation: "explicit"` (user-invocable slash command with Claude frontmatter annotations like `disable-model-invocation: true` and `argument-hint`) and `invocation: "automatic"` (model-invocable without suppressing model execution across harnesses).
   - Supported standalone owned skills that do not require upstream GSD workflow files.

3. **Universal Managed Installation Loop** (`src/core/install.ts`):
   - Refactored `planInstallation`, `createInstallOperationPlan`, and `applyInstallation` to iterate over all active targets declared in `catalog.components.ownedSkills` instead of hardcoding Claude Code.
   - Preserved transactional boundaries, snapshot creation, and reverse rollback safety across all target directories.

4. **Schema & Type Refinement** (`src/types.ts`, `schemas/stack.schema.json`, `schemas/lock.schema.json`):
   - Made `requires` and `upstreamWorkflow` optional on `OwnedSkillConfig` and lock schema so standalone skills like `alpha-aos-pack-advisor` validate cleanly without bogus dependencies.

5. **Comprehensive Test Suite** (`test/owned-skills.test.ts`):
   - 5/5 unit & integration tests covering destination resolution across 5 harnesses, frontmatter rendering for explicit and automatic invocations, multi-harness transactional sync/apply/rollback, `createInstallPlan`, and `createManagedInstallPlan`.

## Verification Results

- `npm run check`: 0 errors.
- `npm run build`: built cleanly.
- `npm test`: 900 tests run, 891 passed, 0 failed, 9 skipped. All tests green.

## Traceability

- Requirements addressed: **PACK-03**, **D-03**, **D-04**.
