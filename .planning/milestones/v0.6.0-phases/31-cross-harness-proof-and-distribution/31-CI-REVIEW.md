---
phase: 31-cross-harness-proof-and-distribution
reviewed: 2026-11-03T09:45:00Z
depth: standard
source_state: uncommitted-ci-remediation
files_reviewed: 5
files_reviewed_list:
  - src/core/task-progress-launch.ts
  - test/task-cli.test.ts
  - test/helpers/packed-sandbox.ts
  - test/path-boundary.test.ts
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 31 Narrow CI Remediation Review

## Summary

No concrete residual defect was established in this bounded source review of the panel-spec lifetime, canonical temporary roots and CI diagnostic location changes. This clean review applies to the five listed files' narrow remediation diff and immediate dependencies. It is not a passing full regression, native CI, publication or fresh paid-native receipt.

## Narrative Findings (AI reviewer)

No unresolved BLOCKER or WARNING was found in the reviewed change.

The parent removes the launch spec only after the child has read it, started the panel and published a validated ready handoff (`src/core/task-progress-launch.ts:65-80,110-125`). The running child retains its parsed spec in memory. Child `finally` cleanup still treats already-removed files as optional (`:127-135`), so normal shutdown remains compatible with parent-side removal. Removal no longer depends on POSIX signal delivery or child cleanup timing.

The regression checks the launch directory both before and after real cancellation on every OS (`test/task-cli.test.ts:106-117`). Existing owned-process reaping remains active in `withPanelCleanup`; the previous Windows-specific omission is removed, and no cancellation assertion or deadline is weakened.

Both temporary-root changes canonicalize an already-created root before constructing descendants (`test/helpers/packed-sandbox.ts:219-222`, `test/path-boundary.test.ts:50-59`). Cleanup remains restricted to that created root. This consistently supplies long/canonical Windows paths to fixture construction and comparison without changing production path-boundary validation or relaxing its containment/symlink checks.

CI logs are now written under quoted `RUNNER_TEMP/alpha-aos-ci-diagnostics`, outside the source checkout, and the upload action points at the matching `runner.temp` directory (`.github/workflows/ci.yml:105-118,179-186`). Preflight creates the directory before the full suite uses it. Pipe failure propagation, real full regression, serial safety subset and retained diagnostics remain; no retry/skip or timeout relaxation was introduced by this diff. Moving live logs outside the checkout removes their writes from checkout-fingerprint races.

## Existing receipts and limitations

- `.planning/tmp/060-ci-41610263069-result.json` records completed overall failure at old source `3f38a03047f1e0fe2470735eac55d53101cc24c4`; package passed and all three native OS jobs failed. Bounded raw failure extracts in `.planning/tmp/060-ci-all-failed.log` show Linux/macOS panel cancellation retained a launch `.json` file instead of an empty directory. These failures remain preserved.
- `.planning/tmp/060-panel-red.log` demonstrates that the strengthened all-OS oracle fails on the old cleanup specifically for a remaining spec, while real cancellation is recorded. `.planning/tmp/060-panel-green.log` reports all four panel preflight tests passing after parent-side cleanup, zero failures and zero skips. These were existing orchestrator-run controls, not tests executed by this reviewer.
- The completed root-owned fixture-targeted receipt `.planning/tmp/060-ci-fixtures-tests.log` now records **61 total, 55 passing, zero failing, six explicit permission skips**, 6117.0086 ms. Its path-boundary evidence names unavailable privileged reparse facilities, Windows file-symlink privilege, and POSIX traversal-denial fixtures. Those skips remain skips, not proved native behavior. This reviewer inspected the completed receipt and did not duplicate session `48829`.
- The separately reviewed Phase 30 hardening is closed in `30-REVIEW.md`; `.planning/tmp/060-observer-final-tests.log` records 31/31 passing with zero skips. The archived style verifier receipt `.planning/tmp/060-style-frozen.json` retains valid/allVerified status without new native/paid execution. These receipts do not replace a whole-suite or native three-OS gate.
- Production bytes have changed. A new full gate and exact-source native three-OS CI remain required after final freeze. Local panel success alone does not clear native acceptance, phase/milestone, authentication or publication gates. No paid model turns, global writes, source changes, commits or lifecycle updates were performed by this reviewer.

_Reviewer: gsd-code-reviewer; narrow source review; implementation read-only._
