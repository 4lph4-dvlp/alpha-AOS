---
phase: 06-managed-lifecycle-uninstall-and-recovery
verified_in: 11-managed-lifecycle-verification
status: TO-BE-COMPILED
score: TO-BE-COMPILED
phase13_gating: TO-BE-COMPILED
gaps: []
---

# Phase 6: Managed Lifecycle, Uninstall, and Recovery - Verification Report

This report is produced by Phase 11 (LIFE-09). It judges each of LIFE-01..LIFE-08 against its requirement text using evidence produced in Phase 11 against the current code. Plan 11-01 seeded this skeleton and the LIFE-01 Codex rows; plan 11-07 compiles the remaining sections from the per-requirement findings in `.planning/phases/11-managed-lifecycle-verification/evidence/`.

## Evidence standard

Every verdict rests on evidence produced in Phase 11: the six Phase 6 suites re-run on this host, and each user-facing lifecycle behavior driven through the packed CLI (`npm pack` tarball installed into an isolated sandbox) with a host guard around every probe (D-01). Phase 6 SUMMARY coverage claims are leads, not evidence. Fresh evidence comes from the local Windows 11 developer host; POSIX coverage is corroborated by the same tests passing in `main` push run `35818198049` attempt 1 (ubuntu, macOS and windows jobs, D-03).

Verdicts are VERIFIED (every clause has passing evidence), PARTIAL (some clauses evidenced, each unmet clause a named gap) or GAP (the core promise is not met); a requirement with any unmet clause is never VERIFIED (D-02). Each cited test's oracle is audited against the clause it is cited for, and a weak oracle alone cannot carry VERIFIED (D-04). The LIFE requirement text is the contract, clause by clause; Phase 6 decisions are the implementation's interpretation, not the bar (D-09).

## Verdict matrix

| Requirement | Verdict | Gaps | Primary evidence |
|---|---|---|---|
| LIFE-01 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |
| LIFE-02 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |
| LIFE-03 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |
| LIFE-04 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |
| LIFE-05 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |
| LIFE-06 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |
| LIFE-07 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |
| LIFE-08 | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## Phase 13 gating

TO-BE-COMPILED

## Evidence records

TO-BE-COMPILED

## LIFE-01

> **LIFE-01**: User can install or reconcile the reviewed stable lock idempotently, and a second unchanged plan reports `CURRENT`

"The plan" for LIFE-01 is `alpha-aos install` without `--apply`: it is the stateful plan that prints `CURRENT` step lines. The static `alpha-aos plan` table never reports `CURRENT`; it is recorded as an observation (`life01.plan-command-static`), and `life01.plan-command-docs` records whether README.md or docs/ direct users to `alpha-aos plan` for reconcile state.

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| 1 | install or reconcile the reviewed stable lock (Codex) | `evidence/life01-codex-reconcile.txt` CHECK `life01.codex.initial-apply` (OBSERVED: exit 0, managed components applied and journaled from the packed release whose installed lock channel is `stable`) | Packed CLI in an isolated sandbox; the installed package carries no `catalog/candidate.lock.json` (asserted by `installPackedRelease`) | HOLDS |
| 2 | idempotently (Codex): a second apply changes nothing | `evidence/life01-codex-reconcile.txt` CHECK `life01.codex.second-apply-noop` (HOLDS) and `life01.codex.second-apply-byte-identical` (HOLDS) | Second `install --target codex --apply --json` returns no applied step, no operation id, every step current, journal file names unchanged; sandbox home, state and prefix byte fingerprints equal before and after | HOLDS |
| 3 | a second unchanged plan reports `CURRENT` (Codex) | `evidence/life01-codex-reconcile.txt` CHECK `life01.codex.preview-current` (HOLDS), `life01.codex.preview-json-current` (HOLDS) and `life01.codex.preview-no-mutation` (HOLDS) | The dry-run output the user reads: every step line starts with `CURRENT`, every JSON `steps[].action` is `current`, and the dry-run changes no sandbox byte | HOLDS |
| 4 | five-harness scope (D-10) | TO-BE-COMPILED (plan 11-03) | TO-BE-COMPILED | TO-BE-COMPILED |

## LIFE-02

> **LIFE-02**: User can run offline `status` for fast inspection and an explicit `doctor` or canary mode for native discovery and meaningful read-only execution evidence with actionable coded findings

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| - | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## LIFE-03

> **LIFE-03**: User can preview and remove a project pack, clean an isolated runtime, uninstall one target, or uninstall the full managed stack without removing harness applications, authentication, or unrelated user resources

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| - | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## LIFE-04

> **LIFE-04**: User can remove only receipted alpha-AOS-owned bytes or semantic entries that still match their recorded applied state, while drifted or user-modified resources cause a refusal

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| - | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## LIFE-05

> **LIFE-05**: User can preview and apply rollback to restore exact prior bytes, and any post-transaction drift prevents all rollback writes before mutation begins

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| - | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## LIFE-06

> **LIFE-06**: User can diagnose corrupt or interrupted journals as `needs-repair` and receive restart-safe recovery guidance instead of a false success state

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| - | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## LIFE-07

> **LIFE-07**: User is shown verified external package changes and component-specific recovery instructions when managed-file rollback cannot safely reverse GSD, ECC, npm-link, or Pi bridge state

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| - | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## LIFE-08

> **LIFE-08**: User can run update preview with no checkout, package, global-link, configuration, or managed-state mutation, and update apply reconciles only a reviewed stable-lock promotion

| # | Clause | Evidence | Oracle audit (D-04) | Result |
|---|---|---|---|---|
| - | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED | TO-BE-COMPILED |

## Gap register

TO-BE-COMPILED

## Leads (not reproduced)

TO-BE-COMPILED

## Observations

TO-BE-COMPILED

## Re-run index (D-17)

TO-BE-COMPILED
