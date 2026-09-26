---
id: 260926-ro0
status: complete
---

## Summary

Fixed the fresh-install failure at the MCP sync step (`ancestor-changed — component identity changed`).

**Root cause:** `applyManagedInstall` proved each MCP target's filesystem identity (device/inode) at plan time. The GSD external installs run first inside the same operation and the GSD codex installer rewrites `config.toml` with byte-identical content under a new file identity — so the plan-time proof was stale by the time `applyMcpSync` re-checked it. The content-based digest checks passed (identical bytes); only the identity check false-positived. The bug was previously masked by the owned-skill workflow-check failure (fixed in bd027f5), which stopped every earlier attempt before the MCP step ever ran.

**Fix:** In `applyManagedInstall`, after the external installers complete, the MCP component plans are re-created so their proofs reflect the post-external filesystem, and those fresh plans are applied. The reviewed aggregate declared the external steps, so their changes are expected; anything that moves a config after the re-plan is still drift.

**Changes:**
- `src/core/install.ts` — re-establish MCP plans after the external install block; the MCP apply loop uses the fresh plans
- `test/lifecycle.test.ts` — regression test: plan → rewrite `config.toml` with identical content (new file identity) → apply → `mcp:codex` must apply and the managed blocks must merge into the user config

**Tests:**

| Suite | Result |
|-------|--------|
| lifecycle.test.ts | 5/5 pass (new regression test included, 33.7s) |
| install.test.ts + owned-skills.test.ts + skill-policy.test.ts | 28/28 pass |
| `npm run check` | pass |
