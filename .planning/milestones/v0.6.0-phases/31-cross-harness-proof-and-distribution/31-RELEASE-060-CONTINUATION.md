# v0.6.0 GitHub release continuation

## Authority and scope

2026-11-03 user requested remaining v0.6.0 work, successful CI and official release. Ordinary conversational GSD, not autopilot. The user subsequently chose **GitHub official release only**; no npm publication and no npm login required. No paid provider calls, global rollout, model substitution, force push or hook bypass. Preserve the user's accepted P1–P4 resolutions. Do not restart completed plans/waves.

## Committed implementation and checks

- Branch release/0.6.0; source HEAD 3f38a03 (full SHA is in the native CI receipt/retained command arguments).
- fa6fcf7 isolates Windows MCP native shutdown tests; doctor matrix rendering now uses fixture PATH/cwd, unchanged 30s deadlines; runner fixture asserts MCP exclusion/order and exactly-once packed-last execution. Scoped tests 9/9.
- 3f38a03 fixes actual release orchestration: canonical native scheduling, serial CI safety subset, ordinary npm-login config discovery restricted to publisher, explicit public registry, authoritative remote main/exact-SHA 4-job CI guard; adds real fixtures and process error/signal summaries. Final scoped release/runner/matrix/provenance tests **28/28, no skips**, .planning/tmp/060-release-verified-scoped.log (11535ms). Build passed.
- Fresh independent initial/final source reviews are committed as 31-RELEASE-REVIEW-INITIAL.md and 31-RELEASE-REVIEW.md. Three blockers resolved. Two advisory warnings retained: full durable subprocess diagnostics and custom NPM_TOKEN npmrc mode. Ordinary npm-login path has no remaining established review blocker; npm is outside the final user scope.
- Earlier first fa6fcf7 push gate was intentionally interrupted after discovering release blockers; .planning/tmp/060-candidate-push.log is incomplete, not passed. All owned verification descendants were stopped before editing. No CI/remote branch resulted from that attempt.

## Exact active handles — do not duplicate execution

1. **Mandatory current push/full gate:** native exec session **14378**, command git push --set-upstream origin release/0.6.0; raw log .planning/tmp/060-release-push.log. Source is frozen while this executes. Git push root process **877256**, start UTC ticks **639292892197347745**; native hook process tree owns tests. No successful full gate is claimed yet.
2. **Finite deterministic CI continuation:** command job **job-9f4197cd38b14e0c**, deadline 5400000ms, created 2026-11-03T08:01:37.143Z. State root is the external task-specific Windows temp directory **alpha-aos-release060-3f38a03-state** (derive from OS tmpdir; do not use default global state root). Driver .planning/tmp/060-native-ci-driver.ps1 was syntax-checked. It waits for the exact push PID/start identity and exit success, verifies the remote candidate SHA, dispatches ci.yml once, discovers that exact run within a finite window, waits with gh run watch and records all four required job outcomes. It never modifies GSD lifecycle, main, tags or releases. No retries, source changes, skipped tests or model calls occur in timers.
3. Receipts: .planning/tmp/060-native-ci-receipt.json and .planning/tmp/060-native-ci-watch.log. Run ID/URL will be added by the driver after successful push/dispatch. A running job/transport yield is not CI completion.

The single finite job observation used `job wait job-9f4197cd38b14e0c --timeout-ms 60000` (native observation session 53607, transport cell g11:46). It ended with observer status `timeout`, elapsed 60006ms; this is not the command job's 90-minute execution deadline, not a CI verdict and not evidence that the push stopped. No repeated model-driven status loop was started. ECC context `mem_20261103_621216f24c9f46ffa2ac` preserves the earlier packet; this on-disk packet adds the observation receipt.

For job commands set ALPHA_AOS_STATE_DIR to Join-Path ([IO.Path]::GetTempPath()) 'alpha-aos-release060-3f38a03-state', then invoke node dist/src/cli.js job status/wait/cancel with the exact ID. Prefer one finite runtime wait; avoid model status loops. Original native session 14378 can yield its final push receipt. If no callback is delivered, disclose the host limitation and retain these handles rather than claiming completion.

## Remaining gates after actual results

1. Inspect actual push/full receipt and CI receipt; on failure retain first failing assertion/OS/process evidence and repair only justified scope before a new gate. No blind rerun.
2. GSD init.manager currently projects phases 27–30 as stale and phase 31 gaps_found. All six Phase 31 summaries exist; there are no incomplete plans. Current src/ bytes are unchanged from corrected-source 3215bca; new remediation changes tests/scripts/CI only. Do not recreate G-31-01: e3ead95 fixed it, tested in the historical corrected-source full run (2150/2136/0/14). Fresh verifier must inspect source and regenerate canonical reports/fingerprints via verification.fingerprint and owner verification.status; old fingerprints cannot be refreshed cosmetically.
3. Execute required verify:post hooks (Nyquist/security/UI as applicable), code review disposition, regression gate using the completed same-source full receipt without duplicating an active gate, then fresh goal verification. Current Phase 31 SECURITY has 14 closed/0 open; VALIDATION validated/compliant; no frontend audit applies. Current session model inheritance was explicitly approved in prior session; do not retry a quota-limited provider or substitute tiers. Applicable GSD skills explicitly dispatch reviewers/verifiers; normal unrelated delegation is not authorized.
4. Only passed owner verdicts permit phase.complete. Complete lifecycle tracking via GSD, perform milestone audit/final review. audit-open has historical quick/debug/archived gaps; do not silently waive them or archive as verified. Resolve actual current gaps and preserve explicitly accepted historical debt. Phase 30 UAT is already recorded passed; do not request the same paid native proof again.
5. Prepare final bilingual release notes/changelog/proof disclosures without turning archival evidence into fresh native claims. Any new final candidate commit needs exact-SHA CI before main. Standard pre-push gates remain mandatory.
6. Land verified exact SHA on main through ordinary hooks, create/push v0.6.0 at that exact SHA. No v0.5.0 tag needs to be retroactively invented. Download authoritative successful CI release-tarball artifact, verify checksum/provenance and use it plus companion hashes for gh release create --verify-tag with factual notes. Verify main, peeled tag, release and assets. GitHub release success is separate from npm, global rollout and milestone archival.
7. Save final GSD evidence and ECC memory, report actual CI/release URLs and remaining limitations. Never report pending work complete.

## Other observations

- GitHub repository push/admin rights available. npm whoami returned E401 and public alpha-aos lookup E404, now irrelevant to GitHub-only scope.
- Read-only global bootstrap preview passed with verified build artifact; no apply or global mutation occurred.
- Pre-existing STATE.md and 31-FINAL-HANDOFF.md edits were preserved. Root updated only current stopped_at through GSD after preparing this continuation.
