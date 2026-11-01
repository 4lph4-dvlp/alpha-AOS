---
phase: 25-runtime-usage-and-recovery-controls
reviewed: 2026-10-30T06:11:37Z
depth: focused-regression-infrastructure
head: 1afcdaf4091506a9db4aca90dd6464bff78030d4
product_commit: 17718a3
basis_digest: e900f68b2f7de3e10743d3ec12c31983b50ed499c106c4fea897edc84d11b953
files_reviewed: 3
files_reviewed_list:
  - scripts/run-tests.mjs
  - test/test-runner-isolation.test.ts
  - test/task-review-adversarial.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 25: Regression Infrastructure Review

No dropped coverage, failure masking or weakened acceptance criterion was found in the three requested deltas. Prior product/source review dispositions remain unchanged; this review does not repeat or expand that scope.

## Narrative Findings (AI reviewer)

No findings in this narrowly reviewed delta.

## Evidence

- **Complete partition:** `scripts/run-tests.mjs:173-184` derives all groups from the same complete discovered list. Every file belongs either to the ordinary group, a named isolated group or the packed group. No file is filtered out without assignment to a later group. The six Windows names do not overlap the packed filename. Explicit `--files` disables both automatic partitions, preserving the supplied file list and ordering semantics.
- **Failure propagation:** `scripts/run-tests.mjs:185-192` retains the ordinary group's exit result; every isolated file is awaited sequentially. A nonzero result stops later groups and reaches `process.exitCode` unchanged. The packed gate runs only after earlier groups succeed. Existing spawn-error/signal handling remains failure-producing. Fail-fast omission of later groups is not a passing full-suite claim.
- **Concurrency boundary:** Windows serialization applies to the six named suites only. The ordinary group still runs with the existing concurrency policy; POSIX leaves the native-name set empty. This is not a claim that every subprocess-producing fixture in the repository is globally serialized. No native kill policy or process deadline is changed by the runner delta.
- **Actual runner fixture:** `test/test-runner-isolation.test.ts:9-49` copies and invokes the actual runner in a private root. It verifies the exact sentinel multiset, packed-last ordering, Windows ordinary-before-native execution and mutually exclusive native markers. It does not replace the implementation with a duplicate planner. The fixture's success-path assertions are consistent with the inspected partition; failure propagation is established here by source tracing, not an executed injected-failure fixture.
- **Adversarial precondition repair:** `test/task-review-adversarial.test.ts:109-114` declares exactly REQ-01, matching the existing `baseValidReport` requirement ID and description. The same three cases use that scratch helper. Existing checks still require blocked routing/unified findings, accepted advisory-only review plus a persisted witness/suggestion, and rejection of stale revision SHA. No gate, report defect, assertion or expected outcome was removed to obtain those results.

The prior full run's five failures and the supplied isolated/targeted pass counts are parent-provided context. No tests, polling, paid calls, source/test changes or commits were performed by this reviewer. This artifact does not claim the full suite now passes; a new actual full-regression result and GSD closure evidence are still required. Only this report was written.

## Exact reviewed bytes

HEAD was verified as `1afcdaf4091506a9db4aca90dd6464bff78030d4`; the three deltas are working-tree bytes. Basis digest is SHA-256 of `JSON.stringify(files)` for the ordered `{path, sha256}` array below.

| File | SHA-256 |
|---|---|
| `scripts/run-tests.mjs` | `abd3a0465cb61333ff53e7a7edb01d01bfd48cefb4e22fe34dba0a0c13c031a0` |
| `test/test-runner-isolation.test.ts` | `005e58121f68859e948e603aa3fecc2093f8d58804d2bea92e5e32f3d266ac74` |
| `test/task-review-adversarial.test.ts` | `f958f76b95ca7104323f2e4a8b68edb94fa1bcf076f65aa0a5cf3ec853b0c016` |

_Independent narrow regression-infrastructure review._
