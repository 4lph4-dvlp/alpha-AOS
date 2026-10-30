# R2 reconciliation counterexample — repaired, final regression pending

The original counterexample below is retained as RED evidence. The repair now
requires a positive owned-process close observation before removing an interrupted
fence. Resolved and throwing missing-PID cases, telemetry/result/callback-only
native handles, null final placeholders and process-only timeout outcomes all
remain interrupted without that evidence. Generic protocol IDs stay separate.
Actual observed closure still permits recovery after an owner bookkeeping crash.

`targeted-closure-accepted.log` passed 30/30 related runtime/native/supervisor/public
resume cases. `25-REVIEW-CLOSURE.md` records clean independent focused review.
The pre-repair full gate passed 1854 tests (1843 pass, 11 skipped), but final
acceptance still requires the repaired-source full gate.

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
