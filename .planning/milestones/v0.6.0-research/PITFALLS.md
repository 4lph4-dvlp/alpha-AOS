# Pitfalls Research

**Milestone:** v0.6.0
**Researched:** 2026-11-02
**Confidence:** HIGH for observed gaps; MEDIUM for semantic boundaries

## Critical Pitfalls

| Pitfall | Prevention | Proposed phase |
|---|---|---|
| Style becomes project preference | Persist mode only; release and later bug fix ask separately | 28 |
| Existing session retains stale mode | Read policy at intake; test A changes then B continues | 27, 31 |
| Simple keyword permits arbitrary bypass | Common reasoned criteria, positive/negative twins, uncertainty handling | 28 |
| Every minor operation starts new-project | Exempt simple requests before substantive workflow readiness | 29 |
| File presence mistaken for readiness | Native GSD prerequisites and partial-state diagnostics | 29 |
| Fake initialization via placeholder files | GSD owns initialization/recovery; never overwrite context | 29 |
| quick-full only renames ordinary quick | Digest/argv/evidence binding and missing-quality negatives | 30 |
| Project policy grants autopilot consent | Exact preview, approval and separate start per task | 30 |
| Pending intake duplicates GSD state | Separate handoff context; GSD remains lifecycle writer | 29, 30 |
| Owned skill integrity drifts | Update source/five-target hashes and packed checks | 30, 31 |
| Old regression gaps silently become green | Record actual runs and preserve not-run/failed results | 31 |

## Acceptance Scenarios

1. Missing policy defaults to strict and presents six choices for substantial work.
2. Codex sets flexible; Antigravity reads it without repeated mode instructions.
3. Pi sets strict; an existing Codex session sees it on the next task intake.
4. Release uses autopilot-phase; later bug fix asks again and uses autopilot-quick-full.
5. Follow-up edits and verification within an active task do not ask again.
6. Bounded push, simple display rename and README translation/linking avoid chooser/bootstrap prompts.
7. Cross-subsystem rename requiring discovery does not qualify as simple by name alone.
8. Named style skips chooser, not readiness or exact autopilot consent.
9. Absent project reuses the request through new-project and resumes once.
10. Partial project reports missing context and uses GSD recovery without overwriting it.
11. Invalid policy/stale selection produces a diagnostic, not silent fallback.
12. quick-full cannot pass with ordinary quick evidence only.
13. Direct GSD commands retain user-selected workflow/timing.

## Carried Verification Debt

Quick 261101-ww3 remains incomplete: broader regression hit a Phase 26 worker handshake timeout; four later suites were not run. Existing release/macOS CI/push/publication holds remain. This planning rollover neither repairs nor clears them.

## Evidence Limits

Four official pages were read using Exa/Firecrawl: GSD quick, GSD new-project, Codex guidance and Claude memory guidance. No paid model canary or native all-five-host test was run. Upstream next is mutable and not the stable lock. Installed local workflow is the implementation baseline.

## Sources

- [GSD quick](https://github.com/open-gsd/gsd-core/blob/next/commands/gsd/quick.md).
- [GSD new-project](https://github.com/open-gsd/gsd-core/blob/next/commands/gsd/new-project.md).
- [Codex guidance](https://developers.openai.com/codex/guides/agents-md).
- [Claude memory](https://code.claude.com/docs/en/memory).
- Local: task-gsd.ts; task-run.ts; task-skill.test.ts; task-governance-hierarchy.test.ts; archived Phase 26; quick 261101-ww3 summary.
