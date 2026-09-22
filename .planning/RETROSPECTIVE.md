# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.1.0 — Vertical MVP

**Shipped:** 2026-09-23 (override closeout; release preview only, not published)
**Phases:** 9 | **Plans:** 88 | **Tasks:** 165

### What Was Built
- A root-bounded, journaled, drift-safe mutation boundary with bounded process and MCP protocol transports (Phase 1)
- Deterministic, digest-bound project capability plans and transactional pack materialization with provenance receipts (Phases 2-3)
- Mandatory GSD quality gates and persistent tree-off preload isolation (Phases 4-5)
- Managed lifecycle commands and a cross-platform packed-release proof (Phases 6-7)
- The `alpha-aos-control` natural-language controller distributed to all five harnesses (Phases 8-9)

### What Worked
- Refusing to accept a passing check without asking what it could fail on caught several false-green paths (canary verdicts, readiness answers, registry skips)
- Evidence-driven support tiers: removing the hard-coded Claude RESIDUE tier made the remaining gap an honest evidence gap instead of a structural one
- Running the real Claude canary exposed two stacked defects (hidden login, hidden tool approvals) that no deterministic test could have found

### What Was Inefficient
- `main` CI stayed red on all three OS legs from at least 2026-09-21 without being treated as a blocker, so the dependency-candidate PR had no trustworthy baseline
- Phase 6 was marked complete without a `06-VERIFICATION.md`, leaving LIFE-01..08 unverified at close
- The milestone label drifted (`STATE.md` said v0.2.0 while ROADMAP, REQUIREMENTS and `package.json` said v0.1.0), which broke milestone tooling at close
- Requirement checkboxes and the traceability table drifted from the per-phase verification reports and had to be reconciled by hand

### Patterns Established
- Paired positive/negative evidence units; an unpaired positive renders INCOMPLETE
- Paid canary legs print their spend before spending and refuse before spending when they cannot succeed

### Key Lessons
1. A red `main` is a release blocker, not background noise; the candidate-promotion design depends on it being green.
2. A test fixture must be built from the host platform's path conventions, never from a literal of one OS.
3. No phase is complete without its VERIFICATION report; the close audit should not be the first place that absence surfaces.
4. Bump the milestone label through `state.milestone-switch` only, never by hand.

### Cost Observations
- Model mix: not recorded
- Sessions: not recorded
- Notable: the largest phase (Phase 1, 27 plans) was dominated by cross-platform CI gap closure

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v0.1.0 | — | 9 | First milestone; closed as override with known gaps |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v0.1.0 | 907 (Phase 07 re-verification run) | — | — |

### Top Lessons (Verified Across Milestones)

1. (Pending a second milestone)
