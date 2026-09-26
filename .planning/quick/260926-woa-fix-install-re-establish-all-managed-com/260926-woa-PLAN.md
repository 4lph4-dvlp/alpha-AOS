---
id: 260926-woa
description: Re-establish all managed component plans after external installs so plan-time proofs survive GSD rewrites of settings.json and config.toml
status: incomplete
---

## Problem

Extends 260926-ro0. After that fix, the MCP syncs stopped failing — but the very next step
(claude-skill-policy) failed with the same class of error (observed 2026-09-26 23:08, durable
evidence `2026-09-26T14-08-03-884Z-fe5b963d`):

1. `createManagedInstallOperationPlan` proves `~/.claude/settings.json` — which exists on a
   real host — and records its filesystem identity at plan time.
2. The GSD claude install runs first inside the same operation and rewrites `settings.json`
   (hook registrations) under a new file identity.
3. `applyClaudeSkillPolicy` re-checks the plan-time proof — the identity no longer matches —
   so the whole managed install fails and rolls back every successful write before it.

The 260926-ro0 fix covered only the MCP components. The journal from the failing run shows all
five MCP targets applied successfully (the fix worked); the failure moved to the last step.

## Fix

Replace the MCP-only re-plan with a full component re-plan: after the external installers
complete, re-create every managed component plan (gsdCompatibility, codexPolicy, ownedSkills,
eccSkills, mcp, policy) so their proofs reflect the post-external filesystem, and apply those.
The reviewed aggregate declared the external steps, so their changes are expected; anything
that moves a file after the re-plan is still drift. This ends the component-by-component
whack-a-mole: any current or future component whose target an external installer rewrites is
covered.

## Tasks

### Task 1: Full component re-plan after external installs

- files: `src/core/install.ts`
- action: in `applyManagedInstall`, after the external install block, re-run the plan
  functions for all six component kinds (reusing the reviewed fixture roots) and apply the
  fresh plans instead of `reviewed.components.*`.
- verify: `npm run check` passes; the regression test in task 2 passes
- done: a fresh install no longer fails at any managed step when an external installer
  rewrote the component's target

### Task 2: Extend the regression test to the policy step

- files: `test/lifecycle.test.ts`
- action: the fresh-install regression test now requests codex+claude, stages the claude GSD
  root (with `workflows/ship.md`) so no external npx runs, creates `settings.json` up front
  the way a real host does, rewrites both `config.toml` and `settings.json` with identical
  content between plan and apply, and asserts both `mcp:codex` and `policy:claude-ecc` apply.
- verify: the test passes; against the pre-fix code it fails at the policy step
- done: the fresh-install regression covers every component that an external rewrite breaks
