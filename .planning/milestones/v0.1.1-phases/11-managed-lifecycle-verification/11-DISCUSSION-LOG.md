# Phase 11: Managed Lifecycle Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-23
**Phase:** 11-managed-lifecycle-verification
**Areas discussed:** Evidence standard and verdict grades, Gap handling, Requirement interpretation strictness, Milestone record update

---

## Evidence standard and verdict grades

| Question | Options | Selected |
|----------|---------|----------|
| Evidence required per verdict | Re-run tests + packed CLI probes / Test re-run only / Cite existing CI run | Re-run tests + packed CLI probes |
| Verdict grades | VERIFIED/PARTIAL/GAP / VERIFIED/GAP binary / Per-clause verdicts | VERIFIED/PARTIAL/GAP |
| OS scope | Local Windows + CI 3-OS citation / Fresh 3-OS dispatch run / Windows only | Local Windows + CI 3-OS citation |
| Audit test oracles | Yes, audit oracles / Pass-fail only | Yes, audit oracles |

**User's choice:** Recommended option on all four.

---

## Gap handling

| Question | Options | Selected |
|----------|---------|----------|
| Fix gaps in this phase? | Record only, fix later / Fix small, record large / Fix all | Record only, fix later |
| Do open gaps block Phase 13? | Only LIFE-01/08 gaps block / Never block / Any gap blocks | Only LIFE-01/08 gaps block |
| Where gaps are tracked | Report + REQUIREMENTS Future / Report + ROADMAP backlog phase / Report only | Report + REQUIREMENTS Future |
| Gap evidence | Reproduction command/probe required / Description only | Reproduction required |

**User's choice:** Recommended option on all four.

---

## Requirement interpretation strictness

| Question | Options | Selected |
|----------|---------|----------|
| Verdict bar | LIFE text is the contract / Phase 6 D-decisions are the bar | LIFE text is the contract |
| Harness scope | All five, Claude at file level / Phase 6's four only | All five, Claude at file level |
| LIFE-02 execution evidence | discovery + no-spend canary / One spending canary / Existing tests only | discovery + no-spend canary |
| Commit probes as tests? | Allow test/ additions / No repo changes | Allow test/ additions (passing probes only) |

**User's choice:** Recommended option on all four.

---

## Milestone record update

| Question | Options | Selected |
|----------|---------|----------|
| MILESTONES.md Known Gaps line | Keep original + dated resolution note / Rewrite the line | Keep original + dated note |
| v0.1.0-REQUIREMENTS LIFE rows | Verdict status + check VERIFIED only + ROADMAP link / Status column only | Verdict status + check VERIFIED only |
| LIFE-09 completion | Report complete (gaps allowed) / Zero gaps only | Report complete |
| Independent confirmation | Phase verifier re-executes sample / Human UAT review | Phase verifier re-executes |

**User's choice:** Recommended option on all four.

---

## Claude's Discretion

- Report layout and verdict-matrix format
- Gap ID scheme (`G-11-N` suggested)
- Packed-CLI probe orchestration
- Plan split and wave ordering

## Deferred Ideas

- Fixing LIFE gaps found in this phase (follow-up phase / future requirement)
- A spending canary run for LIFE-02 if no-spend evidence leaves it PARTIAL
