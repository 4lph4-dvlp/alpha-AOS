import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexEvents } from "../src/adapters/task-codex.js";
import { checkCostMeterReadiness, evaluateResourceLimits } from "../src/core/task-contract.js";
import { normalizeHarnessTelemetry } from "../src/core/task-telemetry.js";

test("resource limits fail closed for missing requested telemetry", () => {
  for (const policy of [{ maxTokens: 100 }, { maxCostUsd: 1 }]) {
    const result = evaluateResourceLimits(policy, { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null });
    assert.equal(result.exceeded, true);
    assert.equal(result.stopCode, "telemetry_unavailable");
  }
});

test("token limit has its own stop code and Codex never supplies a USD meter", async () => {
  assert.equal(evaluateResourceLimits({ maxTokens: 100 }, { cycles: 1, wallTimeMs: 1, tokens: 100, costUsd: null }).stopCode, "token_limit_exceeded");
  assert.equal((await checkCostMeterReadiness({ controller: "codex", executor: "codex", reviewer: "codex", reviewerSession: "fresh-read-only" })).supported, false);
});

test("normalization rejects infinity and preserves inclusive cache/reasoning semantics", () => {
  assert.equal(normalizeHarnessTelemetry("codex", { totalTokens: Infinity }).totalTokens, null);
  const meter = normalizeHarnessTelemetry("codex", { usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20, reasoning_output_tokens: 10 } });
  assert.equal(meter.totalTokens, 120);
  assert.equal((meter as any).cachedInputTokens, 80);
  assert.equal((meter as any).uncachedInputTokens, 20);
  assert.equal((meter as any).reasoningTokens, 10);
  assert.equal(meter.costUsd, null);
});

test("Codex retains all completed turns before a quota failure", () => {
  const events = [
    { type: "thread.started", thread_id: "fixture-thread" },
    { type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 } },
    { type: "turn.completed", usage: { input_tokens: 50, cached_input_tokens: 40, output_tokens: 10 } },
    { type: "turn.failed", error: { message: "You've hit your usage limit" } },
  ].map((event) => JSON.stringify(event)).join("\n");
  const parsed = parseCodexEvents({ excerpt: events, sha256: "0".repeat(64), totalBytes: Buffer.byteLength(events), capped: false }, false);
  assert.equal(parsed.terminal, "failed");
  assert.equal(parsed.usage?.input_tokens, 150);
  assert.equal(parsed.usage?.output_tokens, 30);
});
