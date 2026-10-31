import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFixture } from "./helpers/task-fixture.js";
import { createTaskSession, appendTaskSessionEvent, readTaskSessionEvents, validateTaskSessionBinding } from "../src/core/task-session.js";

test("phase26 session rejects cross binding and conflicting replay", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "a".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  await assert.rejects(createTaskSession(fixture.stateRoot, { ...binding, originatingSessionId: "other-conversation" }), /binding/i);
  const event = { sourceEventId: "dispatch-one:start", observedAt: "2026-10-31T00:00:00.000Z", kind: "dispatch-start",
    workflow: null, step: null, role: "controller", configuredModel: "fixture", configuredEffort: "high", observedModel: null,
    observedEffort: null, outcome: "running", processState: null, recordedReason: null, evidenceRefs: [] } as const;
  await appendTaskSessionEvent(fixture.stateRoot, binding, event);
  await appendTaskSessionEvent(fixture.stateRoot, binding, event);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).events.length, 1);
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, outcome: "failed" }), /conflict/i);
  const other = { ...binding, revision: 2 };
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, other));
  assert.throws(() => validateTaskSessionBinding({ ...binding, originatingSessionId: "../other" }));
});

import { meteredTaskDispatch } from "../src/core/task-runtime.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";

test("phase26 session receives real metered dispatch observations", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: "b".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const wrongRevision = { ...binding, revision: 2 };
  await assert.rejects(createTaskSession(fixture.stateRoot, wrongRevision), /binding/i);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest: binding.contractDigest,
    runId: binding.runId, role: "controller", invoke: async () => ({ sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true }) });
  const { events } = await readTaskSessionEvents(fixture.stateRoot, binding);
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, wrongRevision));
  assert.deepEqual(events.map((event) => event.kind), ["dispatch-start", "dispatch-end"]);
  assert.deepEqual(events.map((event) => event.outcome), ["running", "completed"]);
  assert.equal((events[1] as unknown as { processState: string }).processState, "confirmed-closed");
});

test("phase26 session refuses credentials and preserves events after restart", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "d".repeat(64), revision: 1,
    runId: "run-one", host: "agy", originatingSessionId: "conversation-one" });
  assert.equal(binding.host, "antigravity");
  await createTaskSession(fixture.stateRoot, binding);
  const event = { sourceEventId: "decision-one", observedAt: "2026-10-31T00:00:00.000Z", kind: "decision",
    workflow: "quick", step: null, role: null, configuredModel: null, configuredEffort: null, observedModel: null,
    observedEffort: null, outcome: null, processState: null, recordedReason: "Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJK", evidenceRefs: [] };
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, event), /sensitive/i);
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, recordedReason: "password=private-value" }), /sensitive/i);
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, recordedReason: "read /opt/private/document" }), /sensitive/i);
  await appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, recordedReason: "recorded" });
  await createTaskSession(fixture.stateRoot, binding);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding, 0)).events[0]?.recordedReason, "recorded");
});







test("phase26 replay marks an evicted cursor gap and never duplicates a source event", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "e".repeat(64), revision: 1,
    runId: "run-one", host: "pi", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  for (let n = 0; n < 251; n++) await appendTaskSessionEvent(fixture.stateRoot, binding, {
    sourceEventId: `event-${n}`, observedAt: "2026-10-31T00:00:00.000Z", kind: "decision", workflow: null, step: null,
    role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: null, processState: null, recordedReason: null, evidenceRefs: [],
  });
  const replay = await readTaskSessionEvents(fixture.stateRoot, binding, 0);
  assert.equal(replay.gap, true);
  assert.equal(replay.events.length, 250);
  assert.equal(replay.events[0]?.sequence, 2);
  assert.equal(replay.cursor, 251);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding, 250)).events[0]?.sequence, 251);
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, binding, 252));
});

test("phase26 session refuses a replaced session directory", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "f".repeat(64), revision: 1,
    runId: "run-one", host: "hermes", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  const { rename, symlink } = await import("node:fs/promises");
  const root = taskSessionRoot(fixture.stateRoot, binding);
  await rename(root, `${root}-original`);
  await symlink(`${root}-original`, root, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, binding));
});

test("phase26 session recovers a durable pending event exactly once", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "8".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const first = { sourceEventId: "event-one", observedAt: "2026-10-31T00:00:00.000Z", kind: "decision", workflow: null, step: null,
    role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: null, processState: null, recordedReason: "recorded", evidenceRefs: [] } as const;
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  const { writeAtomicPrivateFile } = await import("../src/core/command-jobs.js");
  const { join } = await import("node:path");
  await writeAtomicPrivateFile(join(taskSessionRoot(fixture.stateRoot, binding), "pending.json"), JSON.stringify({ ...first, binding, sequence: 1 }), 16384, fixture.stateRoot);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).events[0]?.sourceEventId, "event-one");
  await appendTaskSessionEvent(fixture.stateRoot, binding, { ...first, sourceEventId: "event-two" });
  const replay = await readTaskSessionEvents(fixture.stateRoot, binding);
  assert.deepEqual(replay.events.map((event) => event.sourceEventId), ["event-one", "event-two"]);
  assert.equal((await appendTaskSessionEvent(fixture.stateRoot, binding, first)).sequence, 1);
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, { ...first, recordedReason: "conflict" }), /conflict/i);
});

test("phase26 session preserves live and unresolved publisher fences", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "7".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  const { hostname } = await import("node:os");
  const { writeFile, unlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const lock = join(taskSessionRoot(fixture.stateRoot, binding), "events.lock");
  const event = { sourceEventId: "event-one", observedAt: "2026-10-31T00:00:00.000Z", kind: "decision", workflow: null, step: null,
    role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: null, processState: null, recordedReason: null, evidenceRefs: [] } as const;
  await writeFile(lock, JSON.stringify({ host: hostname(), pid: process.pid, token: "live-owner" }));
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, event), /fence/i);
  await unlink(lock);
  await writeFile(lock, JSON.stringify({ host: hostname(), pid: 2147483647, token: "dead-owner" }));
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, event), /fence/i);
});

