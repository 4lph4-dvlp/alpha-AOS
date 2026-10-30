import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { parseCodexEvents } from "../src/adapters/task-codex.js";
import { checkCostMeterReadiness, evaluateResourceLimits } from "../src/core/task-contract.js";
import { aggregateTaskUsage, normalizeHarnessTelemetry, type TaskUsageObservation } from "../src/core/task-telemetry.js";
import { meteredTaskDispatch, readTaskDispatches, dispatchUsage, reconcileTaskRuntime } from "../src/core/task-runtime.js";
import { runProcess } from "../src/core/process.js";
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
      runId: "failed", role: "controller", invoke: async () => ({ ...evidence, nativeSessionId: evidence.sessionId, closeConfirmed: true }) });
    const [record] = await readTaskDispatches(fixture.stateRoot, digest);
    assert.equal(record?.status, "failed");
    assert.equal(record?.launchState, evidence.sessionId === null ? "process-only" : "native-session");
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

test("reconciliation cannot invent closure when a child PID is unavailable", async (t) => {
  for (const throws of [false, true]) {
    const fixture = await createTaskFixture(t);
    const digest = (throws ? "8" : "7").repeat(64);
    const dispatch = meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot),
      digest, runId: "unknown-closure", role: "controller", invoke: async ({ onProcess }) => {
        const evidence = { nativeSessionId: null, processCode: "timeout", exitCode: null, terminal: "failed", closeConfirmed: false };
        onProcess(evidence);
        if (throws) throw new Error("transport failed after unconfirmed process closure");
        return { ...evidence, sessionId: null };
      } });
    if (throws) await assert.rejects(dispatch, /transport failed/); else await dispatch;
    await assert.rejects(reconcileTaskRuntime(fixture.stateRoot, digest), /runtime_dispatch_unresolved/);
    const [record] = await readTaskDispatches(fixture.stateRoot, digest);
    assert.equal(record?.childPid, null);
    assert.equal(record?.closeConfirmed, false);
    assert.equal(record?.status, "interrupted");
    let calls = 0;
    await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot),
      digest, runId: "forbidden", role: "controller", invoke: async () => { calls++; return { sessionId: null }; } }), /runtime_dispatch_unresolved/);
    assert.equal(calls, 0);
  }
});

test("reconciliation permits recovery after positively observed owned process closure", async (t) => {
  const fixture = await createTaskFixture(t);
  const digest = "9".repeat(64), contract = inventorySummaryContract(fixture.projectRoot);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "closed", role: "controller",
    invoke: async ({ onSpawn, onProcess }) => {
      const result = await runProcess({ executable: process.execPath, args: ["-e", ""], cwd: fixture.projectRoot, onSpawn });
      assert.equal(result.closeConfirmed, true);
      onProcess({ nativeSessionId: null, processCode: result.code, exitCode: result.exitCode, terminal: "completed", closeConfirmed: true });
      return { sessionId: null, processCode: result.code, exitCode: result.exitCode, terminal: "completed", closeConfirmed: true };
    } });
  const [closed] = await readTaskDispatches(fixture.stateRoot, digest);
  assert.ok(closed);
  const root = join(fixture.stateRoot, "runs", digest, "dispatches");
  // Crash point: the actual close callback persisted, but final owner bookkeeping
  // did not. A missing owner PID is only safe because closure was already proved.
  await writeFile(join(root, `${closed.dispatchId}.json`), JSON.stringify({ ...closed, ownerPid: 2147483647, status: "running", finishedAt: null }));
  await writeFile(join(root, "dispatch.lock"), JSON.stringify({ host: hostname(), pid: 2147483647, digest, token: "fixture-closed-owner", ownerSettled: true }));
  await reconcileTaskRuntime(fixture.stateRoot, digest);
  const [recovered] = await readTaskDispatches(fixture.stateRoot, digest);
  assert.equal(recovered?.status, "failed");
  assert.equal(recovered?.closeConfirmed, true);
  let calls = 0;
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "remaining", role: "controller",
    invoke: async () => { calls++; return { sessionId: null }; } });
  assert.equal(calls, 1);
});

test("an observed native handle without a PID cannot imply successful closure", async (t) => {
  for (const source of ["telemetry", "result", "callback", "process-only"] as const) {
    const fixture = await createTaskFixture(t);
    const digest = (source === "telemetry" ? "a" : "b").repeat(64);
    const contract = inventorySummaryContract(fixture.projectRoot);
    const nativeSessionId = `observed-native-${source}`;
    await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "handle-only", role: "controller",
      invoke: async ({ onTelemetry, onProcess }) => {
        if (source === "telemetry") onTelemetry({ ...normalizeHarnessTelemetry("codex", { usage: { input_tokens: 20, output_tokens: 2 } }), nativeSessionId });
        if (source === "callback") onProcess({ nativeSessionId, processCode: "ok", exitCode: null, terminal: "missing", closeConfirmed: false });
        return { sessionId: "protocol-reply", processCode: source === "process-only" ? "timeout" : "ok", exitCode: null,
          ...(source === "result" ? { nativeSessionId } : source === "callback" ? { nativeSessionId: null } : {}) };
      } });
    const [record] = await readTaskDispatches(fixture.stateRoot, digest);
    assert.equal(record?.status, "interrupted");
    assert.equal(record?.closeConfirmed, false);
    assert.equal(record?.sessionId, source === "process-only" ? null : nativeSessionId);
    assert.equal(record?.protocolSessionId, "protocol-reply");
    if (source === "telemetry") assert.equal(record.telemetry.totalTokens, 22);
    await assert.rejects(reconcileTaskRuntime(fixture.stateRoot, digest), /runtime_dispatch_unresolved/);
    let calls = 0;
    await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "forbidden", role: "controller",
      invoke: async () => { calls++; return { sessionId: null }; } }), /runtime_dispatch_unresolved/);
    assert.equal(calls, 0);
  }
});
