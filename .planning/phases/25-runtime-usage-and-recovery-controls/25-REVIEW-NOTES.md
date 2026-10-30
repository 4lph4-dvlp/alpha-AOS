# Initial independent review packet (historical)

This packet records the original pre-fix review scope. Session 64309 ended with
10 failures; it is no longer active. Current source is committed as 17718a3.
Review findings and focused closure are retained in 25-REVIEW.md,
25-REVIEW-DELTA.md, 25-REVIEW-FINAL.md and 25-REVIEW-FIXTURES.md. The current
final full regression is session 41645 / full-final.log. See 25-VALIDATION.md
for current evidence; the historical counts/handles below are not current gates.

Scope base: `952a179`; current changes are Phase 25 only. Original project is
read-only evidence. No native paid canary, global install or project restart.

Existing targeted fixtures: RED 4/4; regression subsets 42/42, 118/118,
38/38; integrated runtime/GSD subset 77/77. Full suite runs with live canary off;
do not duplicate it. Exact host session: `64309`, wait cell `g2:96`.

Review the final diff and the user handoff's R1–R8. Specifically audit:

- Native dispatch failure/argv rejection versus measured model calls: a process
  failure must not be shown as a successful runtime completion.
- Child survival/close-unconfirmed results must block relaunch; PID existence
  must not become authority to kill a different process.
- Shared runtime guards must reject unsupported required meters before dispatch,
  including final-review entry, and retain observed usage on exceptional exits.
- Final native reviewers must be isolated from the source project; their schema
  and last-message files must not become product modifications.
- Generic multi-phase source code now preserves checkpoint-bound dirty WIP;
  existing reduced fixture tests the lifecycle. Check generic entry integration
  coverage and avoid claiming it is proven by a lower-level fixture alone.
- Native family correlation must not include unrelated sessions or bill replay
  twice. Coverage bounds/unknown meters must remain visible, not zero.
- Review reuse must invalidate on SHA/tree/requirements/dependency changes and
  retain the original independent witness. No acceptance from readiness alone.
- New effort fields must remain digest-bound and reach native argv unchanged.

These are audit questions, not assertions that all are already verified. Resolve
actual findings with changed-line/counterexample regressions before final closure.
