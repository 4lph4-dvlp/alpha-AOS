---
id: 260926-woa
status: complete
---

## Summary

Fixed the third fresh-install failure (claude-skill-policy: `ancestor-changed — component identity changed`) by replacing the MCP-only re-plan from 260926-ro0 with a full component re-plan.

**Root cause:** `~/.claude/settings.json` exists on a real host, so the plan-time proof recorded its identity; the GSD claude installer then rewrote it (hook registrations) under a new file identity inside the same operation. The 260926-ro0 fix covered only the MCP components — the journal from the failing run shows all five MCP targets applied successfully (that fix worked) before the failure moved to the last step.

**Fix:** After the external installers complete, `applyManagedInstall` now re-creates every managed component plan (gsdCompatibility, codexPolicy, ownedSkills, eccSkills, mcp, policy) with the reviewed fixture roots reused, and applies those fresh plans. The reviewed aggregate declared the external steps, so their changes are expected; anything that moves a file after the re-plan is still drift. This ends the component-by-component whack-a-mole.

**Changes:**
- `src/core/install.ts` — full component re-plan after the external install block; all apply loops use the fresh plans
- `test/lifecycle.test.ts` — the regression test now requests codex+claude, stages the claude GSD root with `workflows/ship.md`, creates `settings.json` up front, rewrites both config files between plan and apply, and asserts both `mcp:codex` and `policy:claude-ecc` apply

**Tests:**

| Suite | Result |
|-------|--------|
| lifecycle.test.ts | 5/5 pass (extended regression test, 43.2s) |
| install.test.ts + owned-skills.test.ts + skill-policy.test.ts | 28/28 pass |
| `npm run check` | pass |
