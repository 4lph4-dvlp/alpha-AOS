---
phase: 29-gsd-initialization-and-request-continuity
reviewed: 2026-11-03T15:54:00Z
depth: standard
source_commit: d98bdd8270d9b8040129fdf2a44722498cf351de
files_reviewed: 12
files_reviewed_list:
  - schemas/task-bootstrap.schema.json
  - src/core/task-bootstrap-evidence.ts
  - src/core/task-bootstrap-session.ts
  - src/core/task-bootstrap-store.ts
  - src/core/task-bootstrap.ts
  - test/helpers/task-bootstrap-evidence.ts
  - test/task-bootstrap-acceptance.test.ts
  - test/task-bootstrap-blockers.test.ts
  - test/task-bootstrap-cli.test.ts
  - test/task-bootstrap-handoff.test.ts
  - test/task-bootstrap-recovery.test.ts
  - test/task-bootstrap-resume.test.ts
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 29 Release Code Review

## Summary

Commit d98bdd8 adds substantive readiness, serialization, ambiguous-retry and native-artifact validation guards. One concrete residual blocker remains: the native phase identity is neither checked against an explicitly preserved phase target nor compatible with supported decimal phase identifiers. This review covers the commit's twelve source/schema/test changes and immediate dependencies. No tests, builds, source changes, commits, lifecycle edits, paid calls or global operations were performed by this reviewer.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER — Native reconciliation can accept the wrong requested phase and rejects valid decimal phases

**File:** `D:/dev/alpha-AOS/src/core/task-bootstrap-evidence.ts:49-60`

**Issue:** The phase branch checks that the descriptor's `phaseDirectory`, `id` and path agree with each other, and checks only quick-versus-phase kind against the preserved handoff. It never compares the artifact's phase token with `handoff.commandRoute.phase`. Therefore an explicitly requested `gsd-execute-phase 30` can link and acknowledge a fresh committed `31-fixture/31-01-PLAN.md` carrying the exact request/root/content/claim hash binding. Matching the original request hash establishes that the descriptor refers to that request; it does not establish that phase 31 is its requested native target. All current artifact/hash/commit/nonce/session checks can pass for that incorrectly allocated phase. Linking then redirects the user to the wrong work as `continue-existing`.

The same branch uses integer-only allocation regexes. The existing explicit-command parser accepts decimal phase strings (`src/core/task-intake-explicit.ts:216`), but a genuine `.planning/phases/30.1-fixture/30.1-01-PLAN.md` for preserved phase `30.1` is rejected at the ID/directory checks before its evidence can be verified. This breaks an otherwise valid direct-command continuation.

**Minimal negative control:** Prepare an explicit command route `{command:"gsd-execute-phase",workflow:"execute-phase",phase:"30",arguments:["30"],stoppingPoint:"execute:post"}`; claim it once; create the existing fixture-tier phase artifact using `createBootstrapArtifactFixture({...,phase:true})`, which allocates `31-fixture/31-01-PLAN.md` with the exact current handoff binding. Link must refuse and leave durable state unchanged. Source tracing shows d98bdd8 instead accepts this internally consistent phase-31 descriptor. This control was not executed by this reviewer.

**Fix:** Validate native phase identity against the preserved explicit phase target before linking, and support the phase identifier domain already accepted by direct-command intake. Extract the phase token from both directory and plan ID and require them to agree with each other and the preserved target. Preserve exact decimal string identity; do not collapse `30.01` into `30.1` through numeric coercion. Keep quick-ID validation separate and unchanged. If GSD requires integer padding normalization, implement and test that narrowly rather than interpreting decimal tokens numerically. Add wrong-phase refusal plus matching integer and decimal positive controls, including acknowledgement/reentry and unchanged-record assertions. No paid/native model invocation is required.

## Assessment of the four original gaps

| Gap | Source assessment at d98bdd8 |
| --- | --- |
| G29-01 Fresh readiness before dispatch | Addressed for absent/partial projects: the held-session claim path returns blocked, preserves the pending record and withholds dispatch when `readiness.ready` is false. Existing unavailable/error/unsupported rejection remains. |
| G29-02 One held session across decision/read/write | Addressed in the reviewed path: service wrappers acquire before policy/readiness/record decisions; store entry points acquire before collision/transition reads; the same session reaches `applyFileTransaction`. Caller-owned sessions are checked for ownership/root and remain caller-owned. The new deterministic two-process readiness barrier and competing-store callback tests exercise actual concurrent processes rather than sequential function calls. |
| G29-03 Ambiguous retry must not regrant dispatch | Addressed: same-nonce claimed reentry returns `dispatchAuthorized:false`; an exact supplied native reference reconciles to existing work rather than issuing another start. Initial/pre-link autopilot guards remain intact. |
| G29-04 Exact artifact/request/root/commit/session acceptance | Substantially addressed, but not fully closed because of CR-01. Label-only references fail, disk bytes are bounded/reopened and hashed, native binding includes exact root/request/content/nonce/session, commit evidence is checked, and acknowledgement requires the reopened artifact hash. The requested phase target still needs comparison. |

The separate cancellation follow-up owned by the BOOT debugger is outside this commit review. This report does not claim its unintegrated fix or regression receipts have passed.

## Privacy and evidence handling

`nativeBootstrapBinding` serializes identifiers and the request SHA-256; it does not insert the raw original request or known facts into the versioned native PLAN. `buildNativeBootstrapInput` places the actual request in explicitly private host context and instructs the host to preserve only the binding in versioned proof. The fixture helper writes only that binding and labels the artifact fixture-tier; the new negative assertion checks that the committed PLAN omits the private request sentinel. No raw-request reconstruction from redacted process excerpts is used for Git evidence: the raw-stream hash is compared without retaining an excerpt. These checks do not claim arbitrary native-host compliance or new native model proof.

## Existing receipts and limits

Read-only inspection confirms the supplied receipts:

- `.planning/tmp/boot04-remediation/.planning/tmp/boot04-revert-red.log`: five controls fail after reverting the source, with zero passing. They expose absent/partial readiness dispatch, duplicate retry authority, label-only linking and a competing writer entering during a stale transition.
- `.planning/tmp/boot04-remediation/.planning/tmp/boot04-hermetic-final.log`: 106 tests, 106 passing, zero failures/skips, 61473.9972 ms.
- `.planning/tmp/boot04-remediation/.planning/tmp/boot04-last-private-context.log`: 28 tests, 28 passing, zero failures/skips, 23035.5113 ms.

Those are worker/orchestrator executions, not tests run during this review. They do not contain the wrong-phase/decimal controls above and do not prove that residual boundary. Fixture-native-shaped PLAN files remain fixture evidence. Full gate, exact-source native CI, human judgments and publication authority remain separately owned and are not cleared by this report.

_Reviewer: gsd-code-reviewer; standard-depth commit review; implementation read-only._
