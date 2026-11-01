# Research: milestone-capable GSD default

## Scope and evidence

The user explicitly requests a milestone-capable default for all alpha-AOS harnesses and immediate local GSD profile-only materialization, followed by a fresh session. Ordinary conversational GSD applies; no autopilot contract or external model dispatch is needed.

- The stable lock pins `@opengsd/gsd-core` 1.18.0. Its native `install-profiles.cjs` supports `core`, `standard`, and `full`; `standard` resolves to 23 skills without `new-milestone` or `complete-milestone`. `full` includes them. A composed `standard,milestone` is not a supported named profile in this installed resolver.
- Official 1.18.0 workflow: https://github.com/open-gsd/gsd-core/blob/v1.18.0/gsd-core/workflows/new-milestone.md
- Official 1.19.0 command remains present: https://github.com/open-gsd/gsd-core/blob/v1.19.0/commands/gsd/new-milestone.md
- Official profile documentation: https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/install-minimal-and-add-skills.md
- `catalog/stack.yaml` declares policy; `catalog/stack.lock.json` drives actual installer and fixture argv. Both currently say `standard`.
- `scripts/promote-candidate.mjs` forcibly resets the GSD profile to `standard`; this must preserve the stable profile. Candidate resolution already preserves an explicit profile, but its missing-profile fallback also needs the new default.
- Native `surface.applySurface` stages artifacts before publication and rewrites runtime-specific skill/agent formats. `install-profiles.writeActiveProfile` persists the native install marker. Use these APIs rather than editing third-party workflow bytes or running an unrelated full alpha-AOS reconciliation.
- Local Codex, Claude, Antigravity, Pi, and Hermes have GSD 1.18.0 with `standard` markers. Pi's 1.18.0 native artifact layout has zero surface kinds; do not pretend it has a standalone command corpus. Codex's shared user skill root is also used by other harness adapters.

## Decision

Use GSD `full` as the explicit default without changing any package version or integrity. Retain GSD as the sole state spine and ECC's selected-skill policy. Preserve legacy profile values when promoting an existing stable lock. Back up local destinations, then use each installed runtime's native surface engine sequentially and verify milestone discovery/read-only initialization. Record any runtime-specific limitation instead of claiming UI activation before restart.

## Execution mode

Research, planning, checking, implementation, and verification run inline in the current session under the installed Codex quick adapter's no-automatic-subagent fallback. No model substitution or parallel agents.
