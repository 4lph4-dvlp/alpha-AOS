# R2 reconciliation counterexample — closed

The original counterexample below is retained as RED evidence. The repair now
requires a positive owned-process close observation before removing an interrupted
fence. Resolved and throwing missing-PID cases, telemetry/result/callback-only
native handles, null final placeholders and process-only timeout outcomes all
remain interrupted without that evidence. Generic protocol IDs stay separate.
Actual observed closure still permits recovery after an owner bookkeeping crash.

`targeted-closure-accepted.log` passed 30/30 related runtime/native/supervisor/public
resume cases. `25-REVIEW-CLOSURE.md` records clean independent focused review.
The repaired source 77cf6d1 passed the final full gate: 1857 tests, 1846 passed,
11 skipped, zero failures, exit 0. See 25-FINAL-TESTS.json. The RED reproduction
below is historical and does not describe the delivered source.

`unknown-closure-red.log` reproduces this without paid calls or source mutation:
an observation with missing child PID and `closeConfirmed: false` becomes
`failed / closeConfirmed: true` after `reconcileTaskRuntime`. Missing PID evidence
does not establish owned-child or descendant closure. A subsequent dispatch can
therefore lose its fence.

Required repair: retain unknown/unconfirmed closure unless positive owned-process
evidence or a validated matching durable-job terminal receipt proves closure.
Test both unknown (refuse resume) and positively attested (permit reconciliation)
paths. Preserve imported usage and GSD ownership. Current full regression 90303
uses pre-repair source 04fab20; its outcome cannot close this counterexample.
