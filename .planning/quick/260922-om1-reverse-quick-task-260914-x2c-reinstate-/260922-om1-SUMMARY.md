---
phase: quick
plan: 260922-om1
subsystem: planning-docs
tags: [claude-code, harness-scope, decision-record, roadmap, requirements]

# Dependency graph
requires:
  - phase: quick/260914-x2c
    provides: D-17 (the Claude exclusion this task reverses)
provides:
  - D-18 decision in 03-CONTEXT.md explicitly superseding D-17
  - Claude Code reinstated as fifth active v0.1.0 harness in PROJECT.md, REQUIREMENTS.md, ROADMAP.md
  - Routing of the unimplemented support-matrix.ts/canaryHarness/real-canary follow-up to Phase 7
affects: [phase-7-cross-platform-release-proof, phase-3-transactional-project-packs-and-native-optional-use]

# Actuals (#2632)
actuals:
  tokens: 5918
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/03-CONTEXT.md
    - .planning/PROJECT.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "D-18 added to 03-CONTEXT.md, explicitly superseding D-17 (mirroring how D-17 superseded D-09), without erasing either audit trail."
  - "Reinstating Claude Code's scope claim is not itself evidence — Claude stays subject to the same D-10 ceiling/ledger split and D-12 blocked/unverified distinction as every other harness."
  - "REQUIREMENTS.md's REL-02 requirement bullet (\"Claude Code remains compatibility residue\") was deliberately left unchanged — it describes what Phase 7's already-verified real-host support matrix actually proved under D-17, and the support-matrix.ts RESIDUE hardcode this bullet reflects is still unimplemented. Rewriting it would imply evidence that does not yet exist."
  - "03-UAT.md and 03-VERIFICATION.md were read in full and left byte-identical: neither file's D-17-scoped exclusion wording (\"D-17 excludes Claude from active verification\", \"Claude remains RESIDUE\") asserts a permanent exclusion, so no correction was needed."

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "D-18 added to 03-CONTEXT.md, explicitly superseding D-17 without erasing D-17 or D-09, with a non-implementation/routing note naming support-matrix.ts, canaryHarness, and the real-canary follow-up."
    verification:
      - kind: other
        ref: "node -e automated substring check (plan Task 1 <verify>) — asserted presence of D-18, D-17 supersession marker, Formerly text, Codex anchor language, reinstated, support-matrix.ts, Exclude<HarnessId, canaryHarness, and Phase 7 routing command"
        status: pass
    human_judgment: false
  - id: D2
    description: "PROJECT.md, REQUIREMENTS.md, and ROADMAP.md name Claude Code as a fifth active v0.1.0 harness alongside Codex, Antigravity, Pi, and Hermes, citing D-18, with every existing requirement checkbox and Traceability status byte-identical."
    verification:
      - kind: other
        ref: "node -e automated substring/regex check (plan Task 2 <verify>) — asserted five-harness enumeration, absence of 'shipped compatibility residue', Out-of-Scope exclusion rows removed, and byte-identical CAPA-01..08 Traceability rows"
        status: pass
    human_judgment: false
  - id: D3
    description: "03-UAT.md and 03-VERIFICATION.md confirmed to need no change — no permanent-exclusion claim found; gap records (G-03-1..4) and phase-pass status remain untouched."
    verification:
      - kind: other
        ref: "node -e automated status/gap-status check (plan Task 3 <verify>) — asserted UAT status: complete, all four gap statuses: closed, and VERIFICATION status: passed unchanged"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-09-22
status: complete
---

# Quick Task 260922-om1: Reinstate Claude Code into Active v0.1.0 Harness Scope Summary

**Added decision D-18 (superseding D-17) and reversed 260914-x2c's exclusion language across PROJECT.md, REQUIREMENTS.md, and ROADMAP.md so Claude Code reads as a fifth active v0.1.0 harness — without marking any requirement, tier, or capability Complete/PROVEN for Claude.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-22T08:57:19Z (first task commit)
- **Completed:** 2026-09-22T09:00:42Z (second task commit)
- **Tasks:** 3 (2 produced file changes; Task 3's correct outcome was zero edits)
- **Files modified:** 4

## Accomplishments

- Annotated D-17 in `03-CONTEXT.md` as superseded (mirroring the existing D-09 → D-17 supersession pattern) and added D-18, recording that the Claude-account verification blocker is resolved, restating the operative pass-bar rules, and explicitly routing the unimplemented `support-matrix.ts`/`canaryHarness`/real-canary work to `/gsd-verify-work 7` then `$gsd-plan-phase 7 --gaps` (or `$gsd-plan-phase 3 --gaps` as the named alternate).
- Reversed the Claude-exclusion language in `PROJECT.md` ("What This Is", three Active requirements bullets, Out of Scope, Context paragraph, Harness scope constraint) so all five harnesses — Claude Code, Codex, Antigravity, Pi, Hermes — read as active on equal footing, each still requiring its own invocation-receipt evidence before promotion.
- Reversed the same language in `REQUIREMENTS.md` (Active Harness Scope header, both Definition of Done bullets, Out of Scope table row removed) while leaving every CAPA/GATE/OPTO/LIFE/REL Traceability row, checkbox, and Coverage count byte-identical.
- Reversed the same language in `ROADMAP.md` (Overview harness enumeration) and added dated post-verification notes to the Phase 3 and Phase 7 sections stating D-18 does not reopen either phase's already-verified success criteria, and naming the concrete outstanding gap (Claude re-entering the claimed harness set with no real-host canary evidence) plus the exact follow-up commands.
- Re-read `03-UAT.md` and `03-VERIFICATION.md` in full and confirmed — as the plan's own research predicted — neither contains a *permanent*-exclusion claim about Claude Code; both files' D-17-scoped wording describes a dated state, not an irreversible one, so correctly made zero edits to either.

## Task Commits

Each task with file changes was committed atomically:

1. **Task 1: Add decision D-18 to 03-CONTEXT.md, explicitly superseding D-17** - `cb1c967` (docs)
2. **Task 2: Reinstate Claude Code as a fifth active harness across PROJECT.md, REQUIREMENTS.md, and ROADMAP.md** - `ae05eec` (docs)
3. **Task 3: Confirm 03-UAT.md and 03-VERIFICATION.md need no change** - no commit (zero edits was the expected, correct outcome; verified via automated check)

**Plan metadata:** committed separately by the orchestrator after this summary is written.

## Files Created/Modified

- `.planning/phases/03-transactional-project-packs-and-native-optional-use/03-CONTEXT.md` - Annotated D-17 as superseded; added D-18 decision with pass-bar restatement and Phase 7 follow-up routing
- `.planning/PROJECT.md` - Five-harness enumeration, reinstatement language in Active bullets/Context/Constraints, Out of Scope exclusion bullet removed
- `.planning/REQUIREMENTS.md` - Five-harness Active Harness Scope header, reinstatement language in Definition of Done, Out of Scope exclusion row removed
- `.planning/ROADMAP.md` - Five-harness Overview enumeration; dated post-verification notes added to Phase 3 and Phase 7 sections routing the outstanding Claude real-host-evidence gap

## Decisions Made

- D-18 explicitly supersedes D-17 in `03-CONTEXT.md` without deleting either D-17 or the D-09 annotation beneath it — the full decision audit trail (D-09 → D-17 → D-18) remains readable.
- Reinstating the scope claim is not itself evidence: every reinstatement sentence added across the three files explicitly states Claude still needs its own real invocation-receipt evidence before promotion past `unverified`/RESIDUE, exactly like every other harness (D-10 ceiling/ledger split, D-12 `blocked`/`unverified` distinction).
- `REQUIREMENTS.md`'s REL-02 requirement bullet text ("...while Claude Code remains compatibility residue and other unproven combinations remain visibly limited or unsupported") was deliberately left unchanged. It was not named in the plan's Task 2 action list (which enumerated exactly three edit locations: the Active Harness Scope header, both Definition of Done bullets, and the Out of Scope row), and it accurately reflects what Phase 7's already-verified real-host support matrix actually proved under D-17 — the `support-matrix.ts` RESIDUE hardcode and `Exclude<HarnessId, "claude">` exclusion this bullet describes are explicitly still unimplemented per this task's own non-implementation note. Rewriting it would have implied structural evidence that does not yet exist.
- No edits made to `03-UAT.md` or `03-VERIFICATION.md`: both files' D-17-scoped Claude-exclusion sentences ("D-17 excludes Claude from active verification", "Claude remains RESIDUE", "preserved as compatibility residue") describe the dated state in effect when that gap-closure verification ran, not a permanent claim — matching the plan's own predicted (and now confirmed) finding.

## Deviations from Plan

None - plan executed exactly as written. Task 3's zero-edit outcome was the plan's own stated expected result, not a deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The scope claim is reinstated; the concrete remaining work (removing the `evaluateMatrixCell` `harnessId === "claude"` RESIDUE hardcode and the `Exclude<HarnessId, "claude">` type exclusion in `src/core/support-matrix.ts`, restoring a Claude `canaryHarness` path in `catalog/stack.yaml`/`catalog/canaries.yaml`, and running a real Claude Code canary) is explicitly NOT implemented here and is routed to `/gsd-verify-work 7` (to formally register the now-stale Phase 7 Observable Truth 2 claim) followed by `$gsd-plan-phase 7 --gaps`, or `$gsd-plan-phase 3 --gaps` as the named alternate if that verification finds the work better scoped to Phase 3's CAPA-01/02/03/05 canary mechanics.
- No blockers. No product source, catalog, schema, adapter, or test file was touched by this quick task.

---
*Phase: quick*
*Completed: 2026-09-22*

## Self-Check: PASSED

- FOUND: `.planning/phases/03-transactional-project-packs-and-native-optional-use/03-CONTEXT.md`
- FOUND: `.planning/PROJECT.md`
- FOUND: `.planning/REQUIREMENTS.md`
- FOUND: `.planning/ROADMAP.md`
- FOUND: `.planning/quick/260922-om1-reverse-quick-task-260914-x2c-reinstate-/260922-om1-SUMMARY.md`
- FOUND commit: `cb1c967` (Task 1)
- FOUND commit: `ae05eec` (Task 2)
