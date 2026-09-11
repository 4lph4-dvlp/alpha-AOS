# Codex usage audit

Run the shipped read-only script against explicit local rollout files:

```sh
node scripts/audit-codex-usage.mjs --since 2026-09-11T08:47:00Z --until 2026-09-11T09:11:00Z -- parent.jsonl executor.jsonl
```

The window includes `since` and excludes `until`. The JSON report deduplicates response IDs across all files and uses per-response `token_usage_record` events. It deliberately rejects older cumulative-only logs rather than guessing whether parent totals include child usage. Cache tokens are a subset of input; reasoning tokens are a subset of output. Neither is added twice. This is selected-log accounting, not a reconstruction of account billing or allowance percentages. No prompt or tool-result text is printed.

For an execution-policy comparison, keep model, task, reasoning setting and test scope the same. Record request count, average/max input per request, cache and uncached input, output, completion and failures. A shorter smoke task can prove bounded loading and native policy discovery, but cannot establish an end-to-end percentage saving against a different implementation task. Cold-cache effects and other account sessions also prevent direct quota attribution.

The interrupted 2026-09-11 run, before 09:11 UTC, measured 72 requests, 7,394,041 inclusive input tokens (7,125,760 cached), 268,281 uncached input tokens and 17,962 output tokens across the parent and one executor. Both used Astra/high. These numbers establish the baseline; they are not 7.4 million newly read tokens.
