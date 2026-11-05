import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acknowledgeTaskOrigin, followTaskOrigin, nativeOriginReadiness, readTaskOriginOutcome, registerTaskOrigin, settleTaskOrigin, taskOriginProcessClosed } from "../src/core/task-delivery.js";
import type { TaskSessionBinding } from "../src/core/task-session.js";
import { createTaskFixture, inventorySummaryContract } from "./helpers/task-fixture.js";
import { taskContractDigest } from "../src/core/task-contract.js";
import { meteredTaskDispatch } from "../src/core/task-runtime.js";

const binding: TaskSessionBinding = { schemaVersion: 1, contractId: "native-delivery", contractDigest: "a".repeat(64), revision: 1, runId: "native-run-12345678", host: "codex", originatingSessionId: "origin-session" };

test("origin process closure requires every observed dispatch to have confirmed settlement", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const digest = taskContractDigest(contract);
  assert.equal(await taskOriginProcessClosed(fixture.stateRoot, contract), false);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "closed", role: "controller",
    invoke: async () => ({ sessionId: "closed-session", exitCode: 0, terminal: "completed", closeConfirmed: true }) });
  assert.equal(await taskOriginProcessClosed(fixture.stateRoot, contract), true);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest, runId: "unconfirmed", role: "reviewer",
    invoke: async () => ({ sessionId: "unconfirmed-session", exitCode: null, terminal: "failed", closeConfirmed: false }) });
  assert.equal(await taskOriginProcessClosed(fixture.stateRoot, contract), false);
});

test("native delivery distinguishes awaited return from unsupported idle-session wakeup", () => {
  assert.equal(nativeOriginReadiness(undefined, undefined, {}).supported, false);
  const result = nativeOriginReadiness(undefined, undefined, { CODEX_THREAD_ID: "codex-session" });
  assert.equal(result.supported, true);
  assert.equal(result.automaticIdleWakeup, false);
  assert.equal(nativeOriginReadiness("claude", "known-session", {}).supported, false, "other hosts are registered but must not inherit unproven Codex delivery support");
  assert.throws(() => nativeOriginReadiness("codex", undefined, {}), /both origin/u);
});

test("origin binding exists without a panel; native wait returns the final chain outcome and acknowledges once", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "aos-native-origin-"));
  context.after(() => rm(stateRoot, { recursive: true, force: true }));
  await registerTaskOrigin(stateRoot, binding);
  const waiting = followTaskOrigin({ stateRoot, binding, timeoutMs: 2000 });
  await settleTaskOrigin({ stateRoot, binding, finalRunId: "final-attempt", finalDigest: "b".repeat(64), status: "accepted", reason: null, processClosed: true });
  const settlement = await waiting;
  assert.equal(settlement.status, "completed");
  if (settlement.status !== "completed") return;
  assert.equal(settlement.value.outcome.status, "accepted");
  assert.equal(settlement.value.outcome.finalRunId, "final-attempt");
  assert.equal(settlement.value.outcome.acceptance, "verified");
  const replay = await followTaskOrigin({ stateRoot, binding, timeoutMs: 1000 });
  assert.deepEqual(replay, settlement);
  const acks = await Promise.all([acknowledgeTaskOrigin(stateRoot, binding, settlement.value.outcome.outcomeId), acknowledgeTaskOrigin(stateRoot, binding, settlement.value.outcome.outcomeId)]);
  assert.equal(acks.filter((ack) => ack.firstAcknowledgement).length, 1);
  const afterAck = await followTaskOrigin({ stateRoot, binding, timeoutMs: 1000 });
  assert.equal(afterAck.status === "completed" && afterAck.value.acknowledged, true);
});

test("final failure survives reconnect and cannot be overwritten or acknowledged under another identity", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "aos-native-origin-fail-"));
  context.after(() => rm(stateRoot, { recursive: true, force: true }));
  await registerTaskOrigin(stateRoot, binding);
  const options = { stateRoot, binding, finalRunId: "attempt-four", finalDigest: binding.contractDigest, status: "blocked" as const, reason: "Credential intervention required" };
  const failed = await settleTaskOrigin(options);
  assert.deepEqual(await settleTaskOrigin(options), failed);
  assert.equal(failed.processClosure, "unknown");
  assert.equal(failed.acceptance, "not-accepted");
  await assert.rejects(settleTaskOrigin({ ...options, status: "accepted" }), /cannot be overwritten/u);
  await assert.rejects(acknowledgeTaskOrigin(stateRoot, binding, "f".repeat(64)), /different origin outcome/u);
  assert.equal(await readTaskOriginOutcome(stateRoot, { ...binding, originatingSessionId: "another-session" }), null);
});

test("an observer timeout is not a task failure or acceptance", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "aos-native-origin-timeout-"));
  context.after(() => rm(stateRoot, { recursive: true, force: true }));
  await registerTaskOrigin(stateRoot, binding);
  const result = await followTaskOrigin({ stateRoot, binding, timeoutMs: 30 });
  assert.equal(result.status, "timeout");
  assert.equal(await readTaskOriginOutcome(stateRoot, binding), null);
});

test("explicit stop and needs-input remain distinct from acceptance during final delivery", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "aos-native-origin-stops-"));
  context.after(() => rm(stateRoot, { recursive: true, force: true }));
  for (const status of ["stopped", "needs-input", "rejected", "unknown"] as const) {
    const origin = { ...binding, runId: `origin-${status}` };
    await registerTaskOrigin(stateRoot, origin);
    const result = await settleTaskOrigin({ stateRoot, binding: origin, finalRunId: null, finalDigest: binding.contractDigest, status, reason: "Explicit boundary" });
    assert.equal(result.status, status);
    assert.equal(result.acceptance, "not-accepted");
    assert.equal(result.processClosure, "unknown");
  }
});
