---
phase: quick
plan: 260922-puy
type: execute
autonomous: true
---

# Register Phase 7 evidence gap G-07-1 in 07-VERIFICATION.md

<objective>
Register a new gap `G-07-1` in `.planning/phases/07-cross-platform-release-proof/07-VERIFICATION.md`: Observable Truth 2 / REL-02 ("every claimed harness/surface has current real-host native discovery and representative invocation evidence") was verified `✓ VERIFIED`/`✓ SATISFIED` on 2026-09-20 against D-17's four-harness claimed set (Codex, Antigravity, Pi, Hermes). D-18 (recorded 2026-09-22 in `03-CONTEXT.md` by quick task 260922-om1) reinstated Claude Code into the active v0.1.0 harness scope, superseding D-17, without any real-host canary/invocation evidence for Claude. Claude has therefore re-entered the *claimed* harness set that Truth 2/REL-02 covers, with zero evidence of its own — making that specific claim stale.

Purpose: Phase 7 is `passed`/complete and its existing evidence (Truths 1, 3, 4, 5 and REL-01/03/04/05/06) is real and must not be touched or reopened. Only the one claim whose scope changed under D-18 needs a dated pointer to the new gap, so `$gsd-plan-phase 7 --gaps` has a concrete, self-contained record to plan against later. This task registers the gap; it does not close it.

Output: `07-VERIFICATION.md` updated with `status: gaps_found`, a frontmatter `gaps:` entry for `G-07-1`, dated annotations on Truth 2's row and REL-02's Requirements Coverage row (added text only — the original `✓ VERIFIED`/`✓ SATISFIED` markers and evidence sentences are not rewritten or removed), and a new `## Gaps` body section carrying the full structured gap record. No other file changes.
</objective>

<constraints>
- Do NOT modify `src/**`, `catalog/**`, `schemas/**`, or `test/**`. This is a documentation-only gap registration; do not implement the `support-matrix.ts` fix, restore `canaryHarness`/`catalog/canaries.yaml` entries, or run any canary.
- Do NOT edit `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/ROADMAP.md`, or `03-CONTEXT.md` — all four were already updated by quick task 260922-om1 (D-18) and REQUIREMENTS.md's REL-02 body text was deliberately left stale on purpose by that task; reconciling it is named as future work inside the new gap's `missing` list, not done here.
- Do NOT touch Truths 1, 3, 4, or 5, their Evidence cells, or the Requirements Coverage rows for REL-01, REL-03, REL-04, REL-05, REL-06 in `07-VERIFICATION.md`. Every character of those rows' existing text must remain byte-identical.
- Do NOT change the `✓ VERIFIED` / `✓ SATISFIED` symbols on Truth 2's row or REL-02's row, and do NOT delete or reword their existing evidence sentences — only append new dated annotation text to the end of each Evidence cell, before the closing table-cell delimiter.
- Do NOT change `score:`, `behavior_unverified:`, `overrides_applied:`, or `decision_coverage:` in the frontmatter — the original 2026-09-20 verification numbers describe what was actually tested and stay accurate for that scope.
- Do NOT invent a `re_verification:` frontmatter block — no verification was re-run; this is a scope-driven gap registration, not a re-verification pass.
- Do not run or claim to run any canary invocation.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Register gap G-07-1 in 07-VERIFICATION.md without touching what was verified true</name>
  <files>.planning/phases/07-cross-platform-release-proof/07-VERIFICATION.md</files>
  <precondition>03-CONTEXT.md already contains a D-18 decision explicitly superseding D-17 (added by quick task 260922-om1, commit cb1c967) — this task cites D-18 but does not create it.</precondition>
  <action>
Make exactly five edits to `.planning/phases/07-cross-platform-release-proof/07-VERIFICATION.md`. Read the file fresh first — do not assume line numbers; find each anchor by its exact current text.

1. **Frontmatter `status` and `gaps`.** Change the frontmatter line `status: passed` to `status: gaps_found`. Change the frontmatter line `gaps: []` to a populated block:

gaps:
  - gap_id: G-07-1
    requirement: REL-02
    summary: "D-18 (03-CONTEXT.md, 2026-09-22) reinstated Claude Code into the active v0.1.0 harness scope, superseding D-17; Claude re-entered the claimed harness set with no real-host canary/invocation evidence of its own, so Truth 2's 2026-09-20 verification (scoped to D-17's four-harness claimed set) no longer covers every currently-claimed harness."

Use 2-space YAML list indentation as shown (list item at 2 spaces under `gaps:`, its keys at 4 spaces). Leave every other frontmatter field (`phase`, `verified`, `score`, `behavior_unverified`, `overrides_applied`, `decision_coverage`, `deferred`) untouched.

2. **Body header block.** In the metadata block directly under the `# Phase 7: ...` title, change the line `**Status:** passed  ` to `**Status:** gaps_found  ` (keep the two trailing spaces used for Markdown line breaks). Immediately after the existing `**Re-verification:** Yes — gap closure verified across Plans 07-05, 07-06, and 07-07` line, add one new line:

**Gap registered (2026-09-22):** `G-07-1` — Truth 2 / REL-02 is stale under D-18 (Claude Code reinstated into the active v0.1.0 harness scope, superseding D-17, with no real-host canary evidence of its own). See Gaps section below. Truths 1, 3, 4, 5 and requirements REL-01, REL-03, REL-04, REL-05, REL-06 are unaffected.

3. **Goal Achievement paragraph.** Directly after the existing sentence "All 5 core verification gaps identified in the initial review have been fully closed through real execution, cryptographic validation, and inspectable multi-platform evidence." (do not delete or edit that sentence), add a new paragraph:

**Post-verification note (2026-09-22):** D-18 (`03-CONTEXT.md`) reinstated Claude Code into the active v0.1.0 harness scope, superseding D-17. Truth 2 and REL-02 below were verified true on 2026-09-20 against D-17's four-harness claimed set (Codex, Antigravity, Pi, Hermes); that verification is not rewritten here and remains accurate for the scope it was tested against. Claude Code has since re-entered the claimed harness set with no real-host canary/invocation evidence of its own, so the claim "every claimed harness/surface has current real-host evidence" no longer covers every currently-claimed harness. This is registered as gap `G-07-1` (see Gaps section). Truths 1, 3, 4, 5 and Requirements REL-01, REL-03, REL-04, REL-05, REL-06 are unaffected and remain exactly as verified.

4. **Observable Truths table, row 2, and Requirements Coverage table, REL-02 row.** In each of these two table rows, append one bolded sentence to the END of the existing Evidence cell text, immediately before the closing `|` of that cell — do not touch anything before it in that cell, do not touch the Status cell (`✓ VERIFIED` / `✓ SATISFIED` stay exactly as they are), and do not touch any other cell in the row.

   Row 2 (Observable Truths, whose Evidence cell currently ends "...Matrix evaluation correctly reports receipt-backed status without fabricating false PROVEN claims."), append:
   ` **Gap note (2026-09-22, \`G-07-1\`):** this was verified against D-17's four-harness claimed set only; D-18 reinstated Claude Code into the claimed set with no real-host evidence of its own — see Gaps section.`

   REL-02 row (Requirements Coverage, whose Evidence cell currently reads exactly "Antigravity receipts supported in ledger, oracle, and matrix evaluator."), append:
   ` **Gap note (2026-09-22, \`G-07-1\`):** satisfied against D-17's four-harness claimed set only; D-18 reinstated Claude Code into the claimed set with no real-host evidence of its own — see Gaps section.`

5. **New `## Gaps` body section.** Insert a new section titled `## Gaps` immediately after the Requirements Coverage table and before the closing `---` / verifier footer at the end of the file. Use this exact structured record (this is the shape `03-UAT.md` used for `G-03-1..4` and is what `$gsd-plan-phase 7 --gaps` will consume):

## Gaps

- gap_id: G-07-1
  status: failed
  truth: "Observable Truth 2 / REL-02: every actively claimed harness/surface has current real-host discovery and invocation evidence"
  reason: "D-18 (03-CONTEXT.md, 2026-09-22) reinstated Claude Code into the active v0.1.0 harness scope, superseding D-17. Claude re-entered the claimed harness set with no real-host canary/invocation evidence of its own, so the truth verified on 2026-09-20 under D-17's four-harness scope (Codex, Antigravity, Pi, Hermes) no longer covers every currently-claimed harness."
  severity: major
  test: "Run a real Claude Code canary invocation and confirm src/core/support-matrix.ts promotes it past RESIDUE using the same evidence-based rule every other harness is judged by."
  root_cause: "src/core/support-matrix.ts's evaluateMatrixCell (around line 145) hardcodes harnessId === \"claude\" to always return tier RESIDUE regardless of any evidence, and its activeSurfaces map (around lines 50-69) is typed Exclude<HarnessId, \"claude\">, structurally excluding Claude from the PROVEN-eligible surface list. catalog/stack.yaml's canaryHarness is codex, not claude, and .planning/REQUIREMENTS.md's REL-02 body text still says Claude \"remains compatibility residue\" — both untouched because D-18 was scoped to reinstating claimed status only, not implementation."
  artifacts:
    - src/core/support-matrix.ts
    - catalog/stack.yaml
    - catalog/canaries.yaml
    - .planning/REQUIREMENTS.md
  missing:
    - "Remove the evaluateMatrixCell harnessId === \"claude\" RESIDUE hardcode and the Exclude<HarnessId, \"claude\"> type exclusion in src/core/support-matrix.ts (~lines 50-69, ~145) so Claude is judged by real evidence like every other harness."
    - "Restore a Claude canary run path in catalog/stack.yaml (currently canaryHarness: codex) and confirm/extend the existing Claude entries in catalog/canaries.yaml."
    - "Actually execute a real Claude Code canary invocation to produce a genuine PROVEN-tier receipt."
    - "Reconcile .planning/REQUIREMENTS.md's REL-02 body text (still says Claude remains compatibility residue) with D-18, once the three items above land — do not perform this reconciliation until real evidence exists."
  diagnosis_note: "Ready for $gsd-plan-phase 7 --gaps"

Do not add, remove, or reorder any other heading or section in the file.
  </action>
  <verify>
    <automated>node -e "const fs=require('node:fs');const p='.planning/phases/07-cross-platform-release-proof/07-VERIFICATION.md';const s=fs.readFileSync(p,'utf8');function need(x){if(!s.includes(x))throw Error('MISSING: '+x);}['status: gaps_found','gap_id: G-07-1','requirement: REL-02','score: 5/5 must-haves verified','honored: 16','**Status:** gaps_found','severity: major','status: failed','evaluateMatrixCell','Exclude<HarnessId','canaryHarness: codex','real Claude Code canary invocation','REL-02 body text','## Gaps'].forEach(need);const gapNoteCount=s.split('Gap note (2026-09-22,').length-1;if(gapNoteCount!==2)throw Error('expected 2 Gap note annotations (Truth 2 row + REL-02 row), found '+gapNoteCount);need('Every claimed harness/surface has current real-host native discovery and representative invocation evidence. | ✓ VERIFIED | Antigravity receipts are fully supported');need('REL-02 | 07-02, 07-05 | Current real-host discovery and invocation evidence for every active claim | ✓ SATISFIED | Antigravity receipts supported in ledger, oracle, and matrix evaluator.');['GitHub Actions CI run \`35496805483\` executed on Linux, macOS, and Windows','Real paired positive and negative controls in \`test/release-controls.test.ts\`','Standalone runner \`scripts/run-brownfield-proof.mjs\` imports solely from \`dist/src/\`','Pre-flight release orchestrator (\`node scripts/release.mjs --dry-run\`) passed all checks'].forEach(need);['CI run \`35496805483\` passed on Ubuntu, macOS, and Windows with identical SHA-256.','Real paired controls execute native invocation and task routing.','\`src/core/brownfield-proof.ts\` and \`scripts/run-brownfield-proof.mjs\` pass 5 stages.','Authoritative tarball matches across CI and local audit allowlist.','Provenance verified, Stage 1 smoke passed, notes updated, publish deferred per user decision.'].forEach(need);console.log('OK');"</automated>
  </verify>
  <done>07-VERIFICATION.md's frontmatter reads status: gaps_found with one gaps[] entry for G-07-1; Truth 2's and REL-02's rows still show their original ✓ VERIFIED / ✓ SATISFIED symbols and untouched evidence text, each with one appended dated Gap note sentence; Truths 1/3/4/5 and REL-01/03/04/05/06 are byte-identical to before; and a new ## Gaps section carries the full G-07-1 structured record (truth, status, reason, severity, test, root_cause, artifacts, missing, diagnosis_note) naming all four missing items.</done>
</task>

</tasks>

<verification>
Run the task's automated check. Then run `git diff --name-only` and confirm the ONLY file changed is `.planning/phases/07-cross-platform-release-proof/07-VERIFICATION.md` (plus this quick task's own PLAN/SUMMARY and normal GSD state bookkeeping created by the orchestrator). Run `git diff -- .planning/phases/07-cross-platform-release-proof/07-VERIFICATION.md` and manually confirm every removed line (`-`) is only a `status: passed` / `gaps: []` / `**Status:** passed` replacement — no evidence sentence, table row text, or table cell for Truths 1/3/4/5 or REL-01/03/04/05/06 appears as a removed (`-`) line. Do not run product source, catalog, or test-suite checks — this plan changes no product source, catalog, schema, or test file, and does not run any canary.
</verification>

<success_criteria>
- `07-VERIFICATION.md` frontmatter: `status: gaps_found`, `gaps:` contains exactly one entry (`gap_id: G-07-1`, `requirement: REL-02`), and `score`/`behavior_unverified`/`overrides_applied`/`decision_coverage` are unchanged.
- Truth 2's row and REL-02's Requirements Coverage row keep their original `✓ VERIFIED`/`✓ SATISFIED` markers and original evidence sentences fully intact, each with exactly one appended dated Gap note pointing to `G-07-1`.
- Truths 1, 3, 4, 5 and Requirements REL-01, REL-03, REL-04, REL-05, REL-06 are byte-identical to their pre-task text — nothing about them is reopened, reworded, or reweighted.
- A new `## Gaps` section exists with a complete, self-contained `G-07-1` record (truth, status: failed, reason, severity: major, test, root_cause, artifacts, missing naming all four follow-up items (a)-(d), diagnosis_note pointing to `$gsd-plan-phase 7 --gaps`).
- No file other than `07-VERIFICATION.md` is modified. No source, catalog, schema, or test file is touched. No canary is run or claimed to run.
</success_criteria>

## Source coverage audit

| Source | Item | Task | Status |
|---|---|---:|---|
| GOAL | Register the stale Truth 2/REL-02 claim created by D-18's reinstatement of Claude Code as gap G-07-1 in 07-VERIFICATION.md, without reopening already-true evidence | 1 | COVERED |
| PROJECT | Not touched — PROJECT.md was already updated by quick task 260922-om1 | — | OUT OF SCOPE (already done) |
| REQ | REL-02's stale scope is named and pointed to a gap; REL-01/03/04/05/06 stay untouched; REQUIREMENTS.md body text itself is explicitly named as future work in the gap's `missing` list, not edited here | 1 | COVERED |
| ROADMAP | Not touched — ROADMAP.md's Phase 7 post-verification note (added by 260922-om1) already routes to this exact task | — | OUT OF SCOPE (already done) |
| CONTEXT | D-18 in 03-CONTEXT.md is cited as the cause of the gap; 03-CONTEXT.md itself is not edited | 1 | COVERED |
| UAT / VERIFICATION | 07-VERIFICATION.md gets a full structured gap record (07 has no UAT.md, so the record lives directly in VERIFICATION.md per this task's explicit design) | 1 | COVERED |
| RESEARCH | Quick mode explicitly excludes a research phase; no new library or external integration is selected here | — | EXCLUDED |

<output>
Create `.planning/quick/260922-puy-register-phase-7-evidence-gap-g-07-1-in-/260922-puy-SUMMARY.md` when execution completes. The next implementation-planning command is `$gsd-plan-phase 7 --gaps`, which will consume the new `G-07-1` record to plan the actual `support-matrix.ts` fix, `catalog/stack.yaml`/`catalog/canaries.yaml` restoration, a real Claude Code canary run, and the deferred `REQUIREMENTS.md` REL-02 reconciliation. This quick task must not execute that gap-closure work itself.
</output>
