import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFixture, inventorySummaryContract } from "./helpers/task-fixture.js";
import { createTaskSession, readTaskSessionEvents, validateTaskSessionBinding } from "../src/core/task-session.js";
import { meteredTaskDispatch } from "../src/core/task-runtime.js";

test("phase26 progress projects the actual quick workflow", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: "a".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest: binding.contractDigest,
    runId: binding.runId, role: "controller", invoke: async () => ({ sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true }) });
  const events = (await readTaskSessionEvents(fixture.stateRoot, binding)).events;
  assert.equal(events[0]?.workflow, "gsd-quick");
  assert.equal(events[1]?.workflow, "gsd-quick");
});
