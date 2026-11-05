---
phase: 30-six-execution-styles-and-quality-binding
reviewed: 2026-11-03T08:16:00Z
depth: standard
source_commit: 3f38a03047f1e0fe2470735eac55d53101cc24c4
scope_status: blocked-on-material-findings
files_reviewed: 15
files_reviewed_list:
  - src/core/task-style.ts
  - src/core/task-phase-scope.ts
  - src/core/task-contract.ts
  - src/core/task-bootstrap.ts
  - src/core/task-gsd-stage-observation.ts
  - src/core/task-gsd-stages.ts
  - src/core/task-run.ts
  - src/adapters/task-codex.ts
  - schemas/task-gsd-stage-receipt.schema.json
  - scripts/verify-task-style-native.mjs
  - docs/task-style-proof-index.json
  - docs/task-style-proof.md
  - test/task-style-native-proof.test.ts
  - test/task-gsd-stage-observation.test.ts
  - test/task-gsd-full-run.test.ts
findings:
  critical: 3
  warning: 0
  info: 0
  total: 3
status: issues_found
---

# Phase 30 Code Review

## Summary

Three concrete fail-open defects remain in native proof and full-quality evidence handling. This bounded standard-depth review followed the implementation scope from the eight Phase 30 plan frontmatters, concentrated on the material evidence/authority paths, and stopped on confirmed blockers as directed by the orchestrator. Large shared modules were examined at the relevant contract, bootstrap, adapter and acceptance boundaries; this report does not certify every unrelated legacy function or every remaining plan file clean. No tests, builds, paid calls, source changes, commits, or lifecycle changes were performed.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER — Native proof can be marked verified without any invocation/result evidence

**File:** `D:/dev/alpha-AOS/scripts/verify-task-style-native.mjs:154-215,259-270`

**Issue:** Source locator, result locator, their digests, artifact references/digests and git evidence are all optional conditional checks. A recognized route with `evidenceTier: "native"` and an existing project root reaches `status: "verified"` without a source or result file, harness identity, or commit. Full routes additionally require only seven self-authored `{stage,outcome:"passed"}` objects. Hashing optional files cannot establish provenance when all files can be omitted. This violates the Plan 30-07 proof contract that native labels and a passed manifest alone are insufficient.

**Minimal failing input:** Save the following JSON index anywhere under an existing directory. Its `projectRoot: "."` resolves to that existing index directory; no observation files or git repository are needed:

```json
{"schemaVersion":1,"routes":[{"route":"conversational-quick","evidenceTier":"native","projectRoot":"."}]}
```

Source tracing shows this entry receives `routes["conversational-quick"].status === "verified"`. Expanding the same shape to all six canonical routes and adding the mandatory seven passed stage labels for the two full routes yields `allVerified: true`. This input was not executed during review.

**Fix:** Validate a closed required evidence shape before considering a native entry verified: supported harness, existing directory root, nonempty source/result locators, valid SHA-256 digests, regular source/result files, required artifact bindings with valid digests, and valid existing commit evidence for the supported proof contract. Missing or malformed fields must produce blocked/unverified, never verified. For full routes distinguish integrity of an accepted archival record from fresh native stage execution; bare passed labels must not create a new live-native claim. Add omitted-field, malformed-digest and six-route no-evidence negative controls. Do not manufacture new receipts or native turns.

**Archival compatibility:** All six committed `docs/task-style-proof-index.json` entries already contain source/result locators, 64-hex digests, artifact records and 40-hex git commit references. Both full entries have seven stages. Making the existing cryptographic fields mandatory can preserve their bytes and the accepted P2 archival interpretation. Reopening files and checking digests/commit existence proves integrity of referenced bytes, not that one underlying task independently executed six distinct routes. This finding does not revoke the human acceptance of the archival claims or request paid re-execution.

### CR-02: BLOCKER — Observer drops artifact arrays before full-quality freshness validation

**File:** `D:/dev/alpha-AOS/src/core/task-gsd-stage-observation.ts:98-127,298-299`

**Issue:** `extractArtifacts` understands a wrapper object containing `artifacts`/`files`, or one direct `{path,sha256}` record. The observer calls it with `output.inputArtifacts` and `output.outputArtifacts`/`inputs`/`outputs` directly. When these fields are ordinary arrays of artifact records, neither wrapper nor direct-record branch matches, so the helper returns `[]`. A stale or forged plan/checker/implementation hash in those arrays is silently erased. `task-run.ts:1838-1889` persists those empty lists, and `task-gsd-stages.ts:362-375` validates only references still present. Schema validation permits empty lists, so it does not recover the omitted hashes.

**Minimal failing observation:**

```jsonl
{"type":"thread.started","thread_id":"s"}
{"type":"stage_invocation","id":"check-1","stage":"plan-check"}
{"type":"stage_result","call_id":"check-1","output":{"outcome":"passed","inputArtifacts":[{"path":"PLAN.md","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]}}
```

Source tracing yields an observed passed checker stage with `inputArtifacts: []`, even if the real `PLAN.md` hash differs. Other required stages can remain valid; the checker freshness requirement has been removed before acceptance. This trace was not executed during review.

**Fix:** Normalize raw arrays as well as the documented wrapper forms, preserve every valid reference, and reject malformed or excess references rather than silently trimming/dropping them. Feed a complete observed seven-stage chain through the real observer into the full-evidence verifier; change one array-carried checker hash and assert acceptance is refused. Retain the existing 32-reference and receipt-size limits. No native model call is needed for this negative control.

### CR-03: BLOCKER — Failure text containing a passing count becomes a passed stage

**File:** `D:/dev/alpha-AOS/src/core/task-gsd-stage-observation.ts:75-95`

**Issue:** String parsing checks for any `"passed"` substring before checking `"failed"`/`"error"`. Consequently `"0 passed, 1 failed"`, `"verification failed; earlier checks passed"`, and `"not passed"` all become `outcome: "passed"`. A structured object with `status: "completed"` and `passed: false` also becomes passed because the generic completion condition precedes negative indicators. Completed execution does not establish a successful gate verdict. These outcomes are persisted into stage receipts and `task-run.ts:1900-1924` uses them for the full-quality precondition, so this is an acceptance bug rather than display wording.

**Minimal failing observation:** Reuse the invocation/result correlation shape in CR-02 with `stage: "verification"` and `output: "0 passed, 1 failed"`. The observer reports a passed verification stage by the first string branch. The object `output: {"status":"completed","passed":false}` follows the same incorrect success path. Neither input was executed during review.

**Fix:** Prefer explicit typed stage outcomes and structured negative verdicts. Treat conflicting or ambiguous output as failed/unknown; never derive success from generic process completion or an unanchored substring. If native text formats must be supported, recognize their exact reviewed verdict/count syntax and require zero failures. Add negative controls for mixed counts, explicit false plus completed, negated success and needs-input, alongside genuine success.

## Requirement and authority coverage

- **STYLE-01–STYLE-04:** Examined six-style route projection and effective quick-quality contract handling. The route projection retains `executionAuthorized: false`. This is source inspection, not fresh native question/UI delivery or workflow execution proof.
- **STYLE-05:** Not accepted by this review: CR-02 and CR-03 permit incorrect full-stage evidence. Existing passing tests do not exercise the array-carried stale hash or ambiguous/negative outcome controls above. No claim is made that every later acceptance check is bypassed; the mandatory full-quality precondition itself can be satisfied incorrectly.
- **STYLE-06:** Examined approved-phase membership/order handling at the phase-scope boundary. The entire multi-phase lifecycle implementation was not re-certified in this blocker-bounded pass.
- **STYLE-07:** Inspected contract/quick-quality binding and the corrected bootstrap initial/pre-link same-nonce branches. The `e3ead95` correction remains present: both initial and idempotent claimed autopilot handoffs withhold dispatch authority (`task-bootstrap.ts:838-862,932-960`). No regression of that fix was established. This report does not replace the independent goal verifier's broader approval/start/model/sandbox judgment.
- **PROVE-01/PROVE-04:** CR-01 prevents treating the standalone verifier as an independent fail-closed native-proof oracle. Distinct archival/fixture/unsupported/unverified/blocked tiers, historical failed/not-run receipts and P1–P4 decisions remain preserved. PROVE-02/PROVE-03 and packaged/bilingual distribution are later-phase responsibilities and were not re-certified here.

## Existing receipts and limits

The orchestrator supplied the completed exact-source mandatory push gate at `3f38a03`: 2157 total, 2143 pass, zero fail, 14 host-permission skips, plus upstream ECC 1/1 and package/build/computer-use checks. Read-only inspection of `.planning/tmp/060-release-push.log` confirms the terminal upstream ECC pass, four successful computer-use checks, verified build manifest and successful candidate push. These are existing receipts, not executions by this reviewer, and they lack the negative controls identified above. No repeated gate was started.

Native CI run `41610263069` was reported in progress when this review was assigned; this report makes no current CI success claim. No new native/paid turns, global application, publication, or model substitution occurred. The original archival native claims are treated as accepted historical evidence, not relabeled as fresh execution.

_Reviewer: gsd-code-reviewer; standard depth; implementation read-only; report only._
