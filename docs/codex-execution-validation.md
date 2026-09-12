# Codex execution guidance: installation and validation

The policy is part of alpha-AOS, not a patch to GSD. Managed installation and updates plan/apply it when Codex is selected. A standalone GSD installation does not install this policy. Use a version of alpha-AOS containing this change on other machines; a local Git commit alone does not update a published package.

```sh
alpha-aos codex-policy sync --json
alpha-aos codex-policy sync --apply
alpha-aos gsd-context execute-phase --json
alpha-aos gsd-context execute-phase --step parse_args --json
```

The policy occupies one marked block in `$CODEX_HOME/AGENTS.md` (default `~/.codex/AGENTS.md`). User text outside the block is preserved. An `AGENTS.override.md`, malformed ownership markers, changed reviewed inputs or unprovable path boundary refuses the operation. Apply is snapshotted and journaled for drift-safe rollback. Start a new Codex session to load it; an existing conversation does not retroactively shed its accumulated context.

The context command exposes an outline and source hash, then exact selected sections or line ranges. A section over 12,000 characters requires smaller explicit ranges rather than truncation. JSON content is an array of chunks: concatenate with no separator. Normal observable redaction still applies. The preamble and applicable gates/references remain required; this is a reader, not an alternative lifecycle engine.

## Evidence recorded on 2026-09-12

- Clean temporary Codex home: transactional policy installation succeeded. A real `codex debug prompt-input` invocation returned a parsed message array containing the policy, bounded-reader command and fresh-fork rule. No model was called.
- User configuration: policy applied in transaction `2026-09-12T06-17-32-940Z-d8be521a-69fe-4fc6-8180-75ad64098520`. Replanning returned `current`. A separate native prompt-input invocation from the repository confirmed policy discovery without a model call.
- Fresh-context smoke: 3 shell commands, 4 model requests. Outline exposed 18 steps plus the preamble; `parse_args` was complete at lines 67–78. No truncation.
- Smoke counters: 100,394 inclusive input tokens; 73,856 cached; 26,538 uncached; 281 output. Average input/request 25,099; maximum 26,069. Recorded log: `rollout-2026-09-12T15-18-32-01a09444-8158-73b2-ba00-a7ee5a418859.jsonl`.
- The old executor averaged 96,449 input tokens/request; its parent averaged 108,603. The smoke demonstrates a smaller fresh context and bounded loading, **not** a controlled end-to-end cost comparison: it performed a much smaller task, with a different cache history. No percentage allowance-saving claim follows.
- The first CLI integration check found silent per-string truncation by the observable serializer. Commit `6605c55` fixed this with small content chunks and an end-to-end CLI regression. A real `initialize` read then returned 10,758 characters in 11 chunks with no truncation.
- Focused installation/policy/context tests passed (23 tests before the additional CLI regression); usage/context regression tests passed (8 tests after it). Full-suite result is recorded in the quick-task summary, not inferred from these focused runs.

## Remaining boundaries and upstream work

These are model instructions, not enforced token quotas. GSD's large upstream workflow and project instruction history still exist. Higher-priority requirements, the selected model, tool schemas and a long existing conversation can still make a request expensive. The selected model was not silently changed.

An upstream GSD improvement should expose bounded, versioned execution-context packets for each runtime, default to fresh executor context, remove redundant parent work, and preserve checkpoint/verification semantics through tests. Until reviewed upstream support exists, alpha-AOS leaves third-party workflow bytes unchanged and provides its own reader/policy. No upstream issue or patch has been published by this task.
