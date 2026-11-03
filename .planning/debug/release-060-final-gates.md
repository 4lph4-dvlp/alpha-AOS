---
status: investigating
trigger: User requested remaining v0.6.0 work, official release and passing CI on 2026-11-03
---

# v0.6.0 final gates and release

## Scope and authority

Ordinary conversational GSD; resume the six completed Phase 31 plans without restarting waves. The current user request authorizes candidate/main delivery and official release after required verification gates. Existing privacy, sandbox, historical evidence and unpaid-canary boundaries remain. Preserve pre-existing STATE/HANDOFF edits. No autopilot contract or model substitution.

## Evidence

- HEAD 9e379adb8e5c6a74a62dd9e02afd73c0e135c45b on release/0.6.0; six summaries exist, no incomplete plans.
- Native CI 41307974019 failed macOS; package/Linux/Windows passed. Candidate c3dfb98 has the native-HTTP test client remediation, not yet tested by remote CI.
- Prior pre-push receipt .planning/tmp/31-060-push.log: 1955 tests, 1940 pass, 2 fail, 13 skip; ordinary group 1097522ms. Oversize transport took 44593ms and missed 30000ms close deadline; doctor matrix child returned null after its 30000ms process deadline.
- Fresh unchanged focused baseline .planning/tmp/060-contention-baseline.log: both pass, oversize 3316ms, doctor 6253ms, 2/2, total 6667ms. This establishes load sensitivity, not a universal root-cause proof.
- Source inspection: Windows terminateProcessTree synchronously invokes taskkill /T /F. MCP proxy exercises this native primitive but is absent from the existing sequential native group. Doctor matrix invokes collectInventory, which probes installed host CLIs sequentially, each with a 10000ms budget; its test currently inherits the host PATH.
- Node 24 official test-runner documentation, discovered through Exa and extracted by Firecrawl: each file has a child process and --test-concurrency caps concurrent file processes. https://nodejs.org/docs/latest-v24.x/api/test.html

## Hypothesis and next action

Keep native MCP shutdown tests out of ordinary Windows file contention, preserving actual process-death checks and deadlines. Make compiled doctor formatting/matrix coverage use an empty fixture command path and fixture cwd, so it does not measure unrelated installed CLI startup. Extend the existing runner behavioral test to cover MCP ordering and exactly-once accounting. Run scoped tests, then the mandatory pre-push gate once and exact-SHA three-OS CI. Any new failure requires fresh evidence, not blind retries.

## Remaining acceptance

Candidate full local gate; exact-SHA Linux/macOS/Windows CI; fresh Phase 31 goal verification and GSD completion; milestone audit/completion; main integration; official release preview/publication with provenance and registry smoke as supported by authentication. Do not mark these complete before actual receipts.

## Scoped repair result

Windows native group now includes mcp-proxy.test.js. Existing runner integration fixture includes this file, asserts sequential exclusion and retains exactly-once/packed-last checks. Doctor matrix rendering uses an empty fixture PATH and fixture cwd; 30000ms deadlines and production discovery are unchanged. Scoped build passed; runner/matrix suites passed 9/9 in 13340ms (.planning/tmp/060-scoped-tests.log). These results justify a new full pre-push gate but do not certify it.

npm authentication preflight returned E401 and public alpha-aos lookup returned E404; GitHub repository push/admin permissions are available. User was asked asynchronously to complete npm login or choose GitHub-only delivery. No credential values were read or emitted.

## Independent release-path review and fixes

The first fa6fcf7 push gate was intentionally interrupted before completion after independent review found release-path blockers; .planning/tmp/060-candidate-push.log is an incomplete receipt, not a failed or passing full-suite result. Native session 81108 was stopped; its still-running owned verify-push process 887468 and descendants were then terminated with verified taskkill success before further source edits. No remote candidate branch or CI run was created.

Independent reports: 31-RELEASE-REVIEW-INITIAL.md and 31-RELEASE-REVIEW.md in Phase 31. Initial three blockers: release --files bypass of native scheduling (also CI safety subset), discarded npm login config, and missing authoritative-main/exact-SHA three-OS publication guard. Fixed by canonical runner enumeration, serial explicit CI safety subset, publication-only npm config restoration and authentication preflight, and live GitHub main/run/job checks. Public npm registry is pinned for whoami, publish and smoke install. Aggregate release tests receive 45 minutes because the previously recorded corrected-source full gate took 1799181ms; individual test/process deadlines remain unchanged. Process failure code/signal is retained in error summaries.

Final bounded independent re-review found no remaining blocker for ordinary npm-login publication. WR-01 durable full diagnostic retention remains partial/advisory; current outer logs and named error codes remain available. WR-02 custom NPM_TOKEN npmrc authentication is unsupported in this path; ordinary npm login is the intended supported authentication. These warnings remain disclosed, not silently marked fixed. External npm E401 is unresolved.

Final scoped build and release orchestration, runner isolation, matrix and provenance checks passed 28/28, zero skips (.planning/tmp/060-release-verified-scoped.log, 11535ms). Candidate full local and native three-OS acceptance remain pending. Freeze source and start the mandatory ordinary push gate for the new committed source.

## Actual 3f38a03 gate and native CI results

The mandatory pre-push gate actually passed and pushed exact source 3f38a03047f1e0fe2470735eac55d53101cc24c4: full suite 2157 total / 2143 passed / 0 failed / 14 explicit skips, plus locked upstream ECC 1/1, package/build/computer-use checks passed. .planning/tmp/060-release-push.log is the primary receipt. The passive continuation misread a null external Process.ExitCode as failure; its failed receipt is an observation-driver defect, not a failed push. After verifying the actual remote SHA, root explicitly dispatched CI41610263069.

CI41610263069 is completed/failure: package succeeded; Linux/macOS both failed the new ready-cancel cleanup assertion because the consumed panel spec remained after forced process termination. Windows also exposed RUNNER~1/runneradmin alias-dependent fixture expectations and readiness/packet failures, legacy proof canonical mismatch, and checkout fingerprint drift caused by CI tee writing its live log inside the inspected checkout. Receipts: 060-ci-41610263069-result.json, 060-ci-all-failed.log, 060-linux-preflight.log, 060-macos-preflight.log. No blind rerun.

Root moved consumed spec removal to the validated parent handoff before returning readiness, retained tolerant child cleanup and strengthened the test to require no residue before/after cancellation on all OSes. The new Windows negative control failed on the leftover spec, then panel preflight passed 4/4 (060-panel-red.log, 060-panel-green.log). Shared sandbox/path-proof fixtures now realpath their created roots; production boundary checks are unchanged. CI diagnostics move to RUNNER_TEMP, preserving full logging/upload without changing the checked-out source during its no-write oracle. Relevant fixture suites passed 61 total / 55 passed / 0 failed / 6 explicit permission skips (060-ci-fixtures-tests.log). Independent 31-CI-REVIEW.md is clean for this narrow diff.

## Phase 30 release-blocking review closure

Fresh independent review found three genuine goal defects: optional native observation bindings could certify empty proof; native artifact arrays were dropped or truncated/filtered before freshness checks; failures (including serialized JSON negatives) could become passed outcomes. Initial focused tests failed all three controls (060-stage-red.log). Fixes require hash-bound source/result metadata, normalize real JSON native results before verdict/artifact extraction, preserve and strictly validate supplied references/bounds/conflicts, and prioritize failed/unresolved outcomes over success text. Malformed serialized arguments/results fail closed. Current focused observation/native-proof/stages/adversarial receipt passed 31/31, zero skips (060-observer-final-tests.log). Existing six archival proof entries retain their original bytes and pass the tightened verifier; no paid calls or evidence synthesis occurred. 30-REVIEW-INITIAL.md preserves original findings; canonical 30-REVIEW.md closes all three with actual source hashes and receipts.

Release wording/guides now describe the 0.6.0 delivery gates and distinguish historical proof snapshots from current tagged evidence; guide hashes updated. Docs/proof tests passed 9/10 with one explicit Windows symlink permission skip. These source changes require a new full gate and exact-SHA native CI. Root will retain GSD lifecycle commits separately from the frozen release source so final main/tag/assets refer to exactly the CI-tested source; no hook or CI bypass is authorized.

## 0261dfd full gate and remaining CI checkout repair

Exact source 0261dfdeec85268f4cf35769a4d9a7a9ec36c77c passed the full ordinary pre-push gate and was pushed. Full suite: 2162 total / 2148 passed / 0 failed / 14 explicit skips; separate locked upstream ECC 1/1 passed. Counts: .planning/tmp/060-0261-full-counts.json. Immutable receipts: 060-0261-push.stdout.log and 060-0261-push.stderr.log. The owned pipeline automatically dispatched CI41618375786 after successful push.

An exhaustive comparison against prior CI41610263069 exposed two additional checkout proof failures previously missed in the abbreviated log inspection. CI logs explicitly show --depth=1; the native proof verifier requires owning archive commit 06838756804c7385ad5ee1c6330b7362cd068e26 and measured source commit 3215bca7540a964b02d5a7e636a8d5dcadf0ca3d. A one-commit checkout cannot provide either. Official actions/checkout documentation (discovered with Exa and extracted with Firecrawl) confirms default depth 1 and depth 0 for full history. No evidence verifier or assertion is weakened: only the native test job checkout receives fetch-depth: 0.

Root cancelled the superseded exact owned CI41618375786 once the local full result was retained, rather than allowing a known incomplete-history configuration to run to completion. Its cancellation is not acceptance or a new source defect; .planning/tmp/060-0261-ci-cancelled.json and 060-0261-candidate-receipt.json preserve it. Production src/, packaged scripts/docs and tests are unchanged from the passed 0261dfd tree; the next source amendment is CI history configuration plus GSD records only. Standard push hooks still run on the new exact commit. Goal verifiers may use the completed 0261dfd regression for byte-identical production inputs without duplicating an active full gate; final native CI must match the new release source exactly.
