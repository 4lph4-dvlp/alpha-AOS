import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCodexEvents } from "../src/adapters/task-codex.js";
import { checkCostMeterReadiness, evaluateResourceLimits } from "../src/core/task-contract.js";
import { aggregateTaskUsage, normalizeHarnessTelemetry, type TaskUsageObservation } from "../src/core/task-telemetry.js";
import { meteredTaskDispatch, readTaskDispatches, dispatchUsage } from "../src/core/task-runtime.js";
import { createTaskFixture, inventorySummaryContract } from "./helpers/task-fixture.js";

test("resource limits fail closed for missing requested telemetry", () => {
  for (const policy of [{ maxTokens: 100 }, { maxCostUsd: 1 }]) {
    const result = evaluateResourceLimits(policy, { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null });
    assert.equal(result.exceeded, true);
    assert.equal(result.stopCode, "telemetry_unavailable");
  }
});

function sample(sequence: number, input: number, overrides: Partial<TaskUsageObservation> = {}): TaskUsageObservation {
  return { contractDigest: "a".repeat(64), runId: "run-a", attemptId: "attempt-a", sessionId: "session-a",
    parentSessionId: null, role: "controller", model: "fixture-model", effort: "high", tier: "standard",
    source: "native-token-count", mode: "cumulative", scope: "self", observationId: `sample-${sequence}`,
    sequence, observedModelCalls: sequence + 1, granularity: "model-call",
    telemetry: normalizeHarnessTelemetry("codex", { usage: { input_tokens: input, cached_input_tokens: input / 2, output_tokens: 10 } }), ...overrides };
}

test("cumulative usage is idempotent across resume/replay; descendants are counted once", () => {
  const parent = sample(0, 100);
  const resumed = sample(1, 200, { runId: "run-b", attemptId: "attempt-b" });
  const child = sample(0, 50, { sessionId: "child", parentSessionId: "session-a", role: "subagent" });
  const totals = aggregateTaskUsage([parent, parent, resumed, resumed, child]);
  assert.equal(totals.tokens, 270);
  assert.equal(totals.observedModelCalls, 3);
  assert.equal(totals.costUsd, null);
  assert.deepEqual(totals.byRole, { controller: 210, subagent: 60 });
  const inclusive = aggregateTaskUsage([{ ...resumed, scope: "includes-children" }, child]);
  assert.equal(inclusive.tokens, 210);
  assert.equal(inclusive.excludedDescendants, 1);
  assert.throws(() => aggregateTaskUsage([resumed, sample(2, 100)]), /regressed/);
  assert.throws(() => aggregateTaskUsage([parent, { ...parent, telemetry: resumed.telemetry }]), /Contradictory/);
});

test("durable aggregate budget prevents the next dispatch across a new runtime/resume", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot, { resourcePolicy: { maxTokens: 120 } });
  let calls = 0;
  const invoke = async () => { calls++; return { sessionId: "native", telemetry: sample(0, 100).telemetry }; };
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest: "a".repeat(64), runId: "run-a", role: "controller", invoke });
  assert.equal(dispatchUsage(await readTaskDispatches(fixture.stateRoot, "a".repeat(64))).tokens, 110);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest: "a".repeat(64), runId: "run-b", role: "reviewer", invoke });
  await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest: "a".repeat(64), runId: "run-c", role: "controller", invoke }), /token_limit_exceeded/);
  assert.equal(calls, 2);
});

test("a missing final meter is unknown and blocks another budgeted dispatch", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot, { resourcePolicy: { maxTokens: 1000 } });
  let calls = 0;
  const invoke = async () => { calls++; return { sessionId: "native-quota", detail: "usage limit exceeded" }; };
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest: "b".repeat(64), runId: "quota-run", role: "controller", invoke });
  const records = await readTaskDispatches(fixture.stateRoot, "b".repeat(64));
  assert.equal(records[0]?.reason, "quota_exhausted");
  assert.equal(dispatchUsage(records).tokens, null);
  await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest: "b".repeat(64), runId: "resume", role: "reviewer", invoke }), /telemetry_unavailable/);
  assert.equal(calls, 1);
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

test("fresh common dispatch refuses an unsupported USD meter before invoking anything", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot, { resourcePolicy: { maxCostUsd: 1 } });
  let calls = 0;
  await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest: "f".repeat(64), runId: "fresh",
    role: "reviewer", invoke: async () => { calls++; return { sessionId: "never" }; } }), /telemetry_unavailable/);
  assert.equal(calls, 0);
});

test("unconfirmed timeout and exception preserve a fence while an owned child lives", async (t) => {
  for (const throws of [false, true]) {
    const fixture = await createTaskFixture(t);
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { stdio: "ignore", windowsHide: true });
    await once(child, "spawn");
    t.after(() => { child.kill(); });
    const digest = (throws ? "1" : "2").repeat(64);
    const contract = inventorySummaryContract(fixture.projectRoot);
    const run = meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "interrupted", role: "controller",
      invoke: async ({ onSpawn }) => {
        onSpawn({ pid: child.pid! });
        if (throws) throw new Error("fixture exception after native spawn");
        return { sessionId: "fixture", telemetry: sample(0, 10).telemetry, processCode: "timeout", exitCode: null,
          closeConfirmed: false, terminal: "failed" };
      } });
    if (throws) await assert.rejects(run, /fixture exception/); else await run;
    const [record] = await readTaskDispatches(fixture.stateRoot, digest);
    assert.equal(record?.status, "interrupted");
    assert.equal(record?.closeConfirmed, false);
    let secondCalls = 0;
    await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "second", role: "controller",
      invoke: async () => { secondCalls++; return { sessionId: "forbidden" }; } }), /runtime_dispatch_unresolved/);
    assert.equal(secondCalls, 0);
  }
});

test("ordinary native failure and argv rejection remain distinct from runtime completion", async (t) => {
  for (const evidence of [
    { processCode: "non-zero-exit", exitCode: 2, terminal: "missing", sessionId: null },
    { processCode: "ok", exitCode: 0, terminal: "failed", sessionId: "observed-thread" },
  ]) {
    const fixture = await createTaskFixture(t);
    const digest = (evidence.sessionId === null ? "3" : "4").repeat(64);
    await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest,
      runId: "failed", role: "controller", invoke: async () => ({ ...evidence, closeConfirmed: true }) });
    const [record] = await readTaskDispatches(fixture.stateRoot, digest);
    assert.equal(record?.status, "failed");
    assert.equal(record?.launchState, evidence.sessionId === null ? "not-spawned" : "native-session");
    assert.equal(record?.telemetry.observedModelCalls ?? null, null);
  }
});

test("callback-only native reviewer failure survives a successful process return", async (t) => {
  const fixture = await createTaskFixture(t);
  const digest = "6".repeat(64);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest,
    runId: "review-failed", role: "reviewer", invoke: async ({ onProcess }) => {
      onProcess({ nativeSessionId: "fixture-review-thread", processCode: "ok", exitCode: 0, terminal: "failed", closeConfirmed: true });
      return { sessionId: "fixture-review-thread", processCode: "ok", exitCode: 0, closeConfirmed: true };
    } });
  const [record] = await readTaskDispatches(fixture.stateRoot, digest);
  assert.equal(record?.status, "failed");
  assert.equal(record?.terminal, "failed");
  assert.equal(record?.reason, "native_failed");
});

test("exception before final usage recovers the correlated local parent and child watermarks", async (t) => {
  const fixture = await createTaskFixture(t);
  const nativeSessionRoot = join(fixture.scratch, "native-logs");
  const now = new Date();
  const directory = join(nativeSessionRoot, ...now.toISOString().slice(0, 10).split("-"));
  await mkdir(directory, { recursive: true });
  const rootId = "11111111-1111-4111-8111-111111111111", childId = "22222222-2222-4222-8222-222222222222";
  for (const [id, parent, input, output] of [[rootId, null, 50, 5], [childId, rootId, 20, 2]] as const) {
    await writeFile(join(directory, `${id}.jsonl`), [
      { type: "session_meta", payload: { id, cwd: fixture.projectRoot, parent_thread_id: parent } },
      { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: output } } } },
    ].map((event) => JSON.stringify(event)).join("\n") + "\n");
  }
  const digest = "5".repeat(64);
  await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest,
    runId: "crash", role: "controller", nativeSessionRoot, now: () => now,
    invoke: async ({ onTelemetry }) => {
      onTelemetry({ ...normalizeHarnessTelemetry("codex", null), nativeSessionId: rootId });
      throw new Error("You've hit your usage limit before final summary");
    } }), /usage limit/);
  const records = await readTaskDispatches(fixture.stateRoot, digest);
  assert.equal(dispatchUsage(records).knownTokens, 77);
  assert.equal(dispatchUsage(records).tokens, 77);
  assert.equal(dispatchUsage([...records, ...records]).tokens, 77);
  assert.equal(records[0]?.reason, "quota_exhausted");
});
