# Phase 28 Spec-less Probe Resolution

No plain phase SPEC exists. Default-on fallback ran the installed `edge-probe.cjs` against the seven ENTRY requirement texts on 2026-11-02. Engine output: applicable 13, initially unresolved 13, unclassified 3. The following ten classified edges are resolved with explicit testable predicates; three unclassified rows remain flagged assumptions. No rows dismissed. Predicates below are lifted verbatim into plan truths.

| Requirement / category | Resolution | Plan / acceptance predicate |
|---|---|---|
| ENTRY-01 adjacency | explicit | 28-01: Distinct canonical styles remain distinct even when labels share a prefix; ambiguous partial labels leave selection pending. |
| ENTRY-01 empty | explicit | 28-01: Empty or invalid chooser answers select no style and launch no workflow. |
| ENTRY-01 encoding | explicit | 28-01: The six Korean labels and descriptions preserve exact spelling and order in native question data and numbered text. |
| ENTRY-01 ordering | explicit | 28-01: Equal recommendation scores never reorder or remove any canonical chooser item. |
| ENTRY-01 concurrency | explicit | 28-03: Separate pending tasks in the same project cannot consume each other's chooser answers. |
| ENTRY-02 idempotency | explicit | 28-02: Repeating the same explicit style request returns the same route without creating approvals, runs or initialization files. |
| ENTRY-02 concurrency | explicit | 28-03: A fresh policy revision never replaces a verified active task's explicit style or exact contract binding. |
| ENTRY-03 concurrency | explicit | 28-03: A yielded or failed task is not completed by inference, and resume never selects a different or latest run. |
| ENTRY-05 empty | explicit | 28-04: Missing target, result or impact evidence yields one discriminating clarification and no simple-operation exemption. |
| ENTRY-05 encoding | explicit | 28-01: Oversized or multibyte intake input is refused before parsing and inspection never emits partial JSON or raw request contents. |
| ENTRY-04 unclassified | unresolved | Flagged assumption in 28-04: generic engine could not classify simple-operation semantics; require the explicit push/rename/README positive-negative matrix and human review of residual semantic ambiguity. |
| ENTRY-06 unclassified | unresolved | Flagged assumption in 28-05: adaptive host behavior is not captured by the edge vocabulary; fixture routing is required and unavailable native evidence stays unverified. |
| ENTRY-07 unclassified | unresolved | Flagged assumption in 28-02: command intent is not captured by the edge vocabulary; test direct invocation versus quote/code/example and preserve uncertain intent as clarification. |

Equality check: 13 surfaced = 10 lifted predicates + 3 flagged assumptions.

## Prohibition recall and precision

Recall considered hidden defaults, silent autopilot start, cross-task consent, omitted options, invalid answer fallback, stale lifecycle claims, oversized diagnostics, path escape, raw-secret output and scope expansion. Per-requirement recall also considered forced bootstrap (ENTRY-04), a mode flip treated as consent (ENTRY-06), and a discuss command silently expanded to execute (ENTRY-07). Routine answer/format/lifecycle correctness belongs in the edge tests. Canon path/secret/injection risks are referred to ASVS L1 threat models rather than minted as duplicate prohibitions.

Two values/safety candidates survive. They were projected using installed `probe-core.cjs::projectProhibitions`, with no wired-check descriptors, and are copied into 28-06 `must_haves.prohibitions`:

1. A task style selection must not become implicit consent to run or expand another task.
2. The system must not hide available styles or persist a task choice as a project default.

Both retain `status: unresolved`, `verification: judgment` and the reason `Autonomous fallback; no human-wired descriptor; flagged-unverified.` They remain visible to verify-phase; planning does not mark prohibition enforcement proven. Behavioral tests are still required by the plan. Two surfaced = two authored prohibitions, none silently dropped.
