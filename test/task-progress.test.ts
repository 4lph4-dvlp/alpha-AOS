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

test("phase26 registered dedicated dispatch publishes configured evidence", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot, { agentPolicy: { controller: "codex", executor: "codex", reviewer: "codex",
    reviewerSession: "fresh-read-only", controllerModel: "fixture-model", controllerEffort: "high" } });
  await writeTaskContract(fixture.contractPath, contract);
  const { approveTaskContract, loadTaskContract, readTaskApprovals, reservedRunIdForApproval } = await import("../src/core/task-contract.js");
  const { approvedCodexJobArgs, runApprovedTaskJobProcess } = await import("../src/core/task-native-job.js");
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const jobBinding = { route: "codex-json-v1" as const, contractPath: fixture.contractPath, contractDigest: digest,
    runId: reservedRunIdForApproval({ contractDigest: digest }), role: "controller" as const, prompt: "fixture" };
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: contract.id, contractDigest: digest, revision: contract.revision,
    runId: jobBinding.runId, host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const [approval] = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: contract.id });
  const launch = { schemaVersion: 1 as const, kind: "command-job-launch" as const, task: jobBinding, jobId: "job-1234567890abcdef",
    ownerToken: "fixture-owner", executable: process.execPath, args: approvedCodexJobArgs(contract, jobBinding, approval?.gitDirectory ?? null),
    cwd: fixture.projectRoot, deadlineMs: 1000, createdAt: new Date().toISOString() };
  const output = { excerpt: "", totalBytes: 0, capped: false, sha256: "0".repeat(64) };
  let calls = 0;
  await runApprovedTaskJobProcess({ stateRoot: fixture.stateRoot, launch, resolve: () => process.execPath,
    processSpec: { executable: process.execPath, args: launch.args, cwd: fixture.projectRoot }, runner: async (spec) => {
      calls++;
      spec.onStdoutChunk?.(Buffer.from('{"type":"turn.completed"}\n'));
      return { code: "ok", exitCode: 0, signal: null, timedOut: false, outputCapped: false, durationMs: 1, stdout: output, stderr: output };
    } });
  const events = (await readTaskSessionEvents(fixture.stateRoot, binding)).events;
  assert.equal(calls, 1);
  assert.deepEqual(events.map((event) => event.kind), ["dispatch-start", "dispatch-end"]);
  assert.equal(events[0]?.configuredModel, "fixture-model");
  assert.equal(events[0]?.configuredEffort, "high");
  assert.equal(events.some((event) => event.outcome === "accepted"), false);
});

test("phase26 dead owner is not live progress", async (t) => {
  const fixture = await createTaskFixture(t);
  const { hostname } = await import("node:os");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { normalizeHarnessTelemetry } = await import("../src/core/task-telemetry.js");
  const { startTaskProgressPanel } = await import("../src/core/task-progress-panel.js");
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: "d".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const dispatchId = "e".repeat(64), root = join(fixture.stateRoot, "runs", binding.contractDigest, "dispatches");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, `${dispatchId}.json`), JSON.stringify({ schemaVersion: 1, dispatchId, contractDigest: binding.contractDigest,
    runId: binding.runId, role: "controller", harness: "codex", model: null, startedAt: "2026-10-31T00:00:00.000Z", finishedAt: null,
    host: hostname(), ownerPid: 2147483647, childPid: null, sessionId: null, status: "running", reason: null,
    telemetry: normalizeHarnessTelemetry("codex", null) }));
  const panel = await startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: Date.now() + 30000 });
  t.after(() => panel.dispose());
  const url = new URL(panel.url);
  const exchange = await fetch(`${url.origin}/session`, { method: "POST", headers: { Origin: url.origin, Authorization: `Bearer ${url.hash.slice(1)}` } });
  const { token } = await exchange.json() as { token: string };
  const snapshot = await (await fetch(`${url.origin}/snapshot`, { headers: { Authorization: `Bearer ${token}` } })).json() as {
    processObservations?: { state: string }[]; events: unknown[] };
  assert.equal(snapshot.processObservations?.[0]?.state, "unresolved");
  assert.equal(snapshot.events.length, 0);
});

test("phase26 run-ready hook sees the durable actual run before dispatch", async (t) => {
  const fixture = await createTaskFixture(t);
  const { approveTaskContract, previewTaskContract } = await import("../src/core/task-contract.js");
  const { startTask } = await import("../src/core/task-run.js");
  const { packageRoot } = await import("../src/core/paths.js");
  const { readFile } = await import("node:fs/promises");
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  let readyCount = 0, durable = false, readyBeforeDispatch = false;
  const base = referenceControllerPort("correct");
  const controller: typeof base = { async dispatch(request) { readyBeforeDispatch = readyCount === 1; return base.dispatch(request); } };
  const options = { contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run: import("../src/core/task-run.js").TaskRunRecord, path: string) => {
      readyCount++;
      const persisted = JSON.parse(await readFile(path, "utf8")) as typeof run;
      durable = persisted.runId === run.runId && persisted.contractDigest === digest && persisted.status === "executing";
    } };
  await startTask(options);
  assert.equal(readyCount, 1);
  assert.equal(durable, true);
  assert.equal(readyBeforeDispatch, true);
});
