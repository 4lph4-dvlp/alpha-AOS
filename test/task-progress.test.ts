import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFixture, inventorySummaryContract, fixturePorts, passingReview, referenceControllerPort, startFixtureTask, staticReviewerPort, writeTaskContract } from "./helpers/task-fixture.js";
import { createTaskSession, readTaskSessionEvents, validateTaskSessionBinding } from "../src/core/task-session.js";
import { meteredTaskDispatch } from "../src/core/task-runtime.js";

test("phase26 progress projects the actual quick workflow", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: "a".repeat(64), revision: 1,
    runId: "12345678-abcdef12", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest: binding.contractDigest,
    runId: binding.runId, role: "controller", invoke: async () => ({ sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true }) });
  const events = (await readTaskSessionEvents(fixture.stateRoot, binding)).events;
  assert.equal(events[0]?.workflow, "gsd-quick");
  assert.equal(events[1]?.workflow, "gsd-quick");
});

test("phase26 progress records final acceptance only from the run", async (t) => {
  const fixture = await createTaskFixture(t);
  const { approveTaskContract, previewTaskContract } = await import("../src/core/task-contract.js");
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: digest, revision: 1,
    runId: "12345678-abcdef12", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { run } = await startFixtureTask(fixture, { expectedDigest: digest, runId: binding.runId,
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }) });
  assert.equal(run.status, "accepted");
  const events = (await readTaskSessionEvents(fixture.stateRoot, binding)).events;
  assert.equal(events.filter((event) => event.kind === "run-outcome" && event.outcome === "accepted").length, 1);
});

test("phase26 progress preserves recorded decision reasons", async (t) => {
  const fixture = await createTaskFixture(t);
  const { approveTaskContract, previewTaskContract } = await import("../src/core/task-contract.js");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: digest, revision: 1,
    runId: "12345678-abcdef12", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const base = referenceControllerPort("correct");
  const controller: typeof base = { async dispatch(request) {
    const path = join(request.projectRoot, request.decisionLogPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ id: "choice-1", at: "2026-10-31T00:00:00.000Z", category: "implementation",
      choice: "Use a bounded parser", rationale: "Input length is limited", criterionIds: [], substitute: null }) + "\n");
    return base.dispatch(request);
  } };
  const { run } = await startFixtureTask(fixture, { expectedDigest: digest, runId: binding.runId,
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }) });
  assert.equal(run.decisions[0]?.rationale, "Input length is limited");
  const events = (await readTaskSessionEvents(fixture.stateRoot, binding)).events;
  assert.equal(events.find((event) => event.kind === "decision")?.recordedReason, "Input length is limited");
});

test("phase26 phase projection preserves the multi-phase workflow", async () => {
  const { projectGsdStep } = await import("../src/core/task-progress.js");
  const event = projectGsdStep({ phaseId: "26", attemptId: "fixture-attempt", workflow: "gsd-multi-phase", step: "verify",
    at: "2026-10-31T00:00:00.000Z", outcome: "completed", evidenceRefs: [] });
  assert.equal(event.workflow, "gsd-multi-phase");
  assert.equal(event.step, "26: verify");
  assert.equal(event.outcome, "completed");
});

test("phase26 progress preserves configured and observed model separately", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.agentPolicy.controllerModel = "configured-model";
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: contract.id, contractDigest: "b".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { normalizeHarnessTelemetry } = await import("../src/core/task-telemetry.js");
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract, digest: binding.contractDigest, runId: binding.runId, role: "controller",
    invoke: async () => ({ sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true,
      telemetry: { ...normalizeHarnessTelemetry(contract.agentPolicy.controller, null), modelId: "observed-model" } }) });
  const end = (await readTaskSessionEvents(fixture.stateRoot, binding)).events.at(-1)!;
  assert.equal(end.configuredModel, "configured-model");
  assert.equal(end.observedModel, "observed-model");
  assert.equal(end.observedEffort, null);
});
