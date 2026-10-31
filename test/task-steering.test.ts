import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFixture, fixturePorts, inventorySummaryContract, passingReview, referenceControllerPort, staticReviewerPort, writeTaskContract } from "./helpers/task-fixture.js";
import { approveTaskContract, previewTaskContract } from "../src/core/task-contract.js";
import { packageRoot } from "../src/core/paths.js";
import { startTask } from "../src/core/task-run.js";
import { createTaskSession, type TaskSessionBinding } from "../src/core/task-session.js";
import { readTaskSteering, submitTaskSteering, type TaskSteeringProposal } from "../src/core/task-steering.js";

test("phase26 receipt is not application: durable and idempotent", async (t) => {
  const fixture = await createTaskFixture(t);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  let binding: TaskSessionBinding | undefined;
  await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    gsd: { configRoot: fixture.gsdConfigRoot }, onRunReady: async (run) => {
      binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision, runId: run.runId,
        host: "codex", originatingSessionId: "steering-session" };
      await createTaskSession(fixture.stateRoot, binding);
    } });
  assert.ok(binding);
  const proposal: TaskSteeringProposal = { schemaVersion: 1, binding, requestId: "request-1", submittedAt: "2026-11-01T00:00:00Z", text: "Please check the output format." };
  const receipt = await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal });
  assert.equal(receipt.state, "received");
  assert.deepEqual(await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal }), receipt);
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, text: "Different content" } }));
  const receivedFacts = await readTaskSteering({ stateRoot: fixture.stateRoot, binding });
  assert.deepEqual(receivedFacts[0], receipt);
  assert.ok(receivedFacts.some((fact) => fact.state === "deferred" && fact.reason?.includes("no-safe-boundary") && typeof fact.sequence === "number"));
  const { readTaskSessionPacket } = await import("../src/core/task-read.js");
  assert.deepEqual((await readTaskSessionPacket({ stateRoot: fixture.stateRoot, binding, limit: 10 })).proposalDispositions, receivedFacts);
  await assert.rejects(readTaskSteering({ stateRoot: fixture.stateRoot, binding: { ...binding, originatingSessionId: "another-session" } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "big", text: "x".repeat(8193) } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "secret", text: "token=private-value" } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "path", evidenceIds: ["/private/file"] } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "unknown-evidence", evidenceIds: ["not-recorded"] } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "extra", extra: true } as TaskSteeringProposal }));
  const { consumeTaskSteeringAtBoundary } = await import("../src/core/task-steering.js");
  const contract = inventorySummaryContract(fixture.projectRoot);
  const fakeLease = { token: "forged", record: { schemaVersion: 1 as const, harness: "codex" as const, token: "forged", pid: process.pid,
    host: "fake", startedAt: proposal.submittedAt, contractDigest: digest }, release: async () => {} };
  await assert.rejects(consumeTaskSteeringAtBoundary({ stateRoot: fixture.stateRoot, binding, contract, lease: fakeLease,
    projectRoot: fixture.projectRoot, boundary: `quick:${binding.runId}` }));
  const simultaneous = { ...proposal, requestId: "simultaneous" };
  const pair = await Promise.all([submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: simultaneous }), submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: simultaneous })]);
  assert.deepEqual(pair[0], pair[1]);
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  await writeFile(join(taskSessionRoot(fixture.stateRoot, binding), "steering", "unexpected"), "x");
  await assert.rejects(readTaskSteering({ stateRoot: fixture.stateRoot, binding }));
  await assert.rejects(readTaskSessionPacket({ stateRoot: fixture.stateRoot, binding, limit: 10 }));
});

test("phase26 steering tracer uses the existing controller", async (t) => {
  const fixture = await createTaskFixture(t);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const base = referenceControllerPort("correct");
  let calls = 0, prompt = "", binding: TaskSessionBinding | undefined;
  const controller: typeof base = { async dispatch(request) { calls++; prompt = request.prompt; return base.dispatch(request); } };
  await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run) => {
      binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision, runId: run.runId,
        host: "codex", originatingSessionId: "quick-tracer" };
      await createTaskSession(fixture.stateRoot, binding);
      await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "quick-1",
        submittedAt: "2026-11-01T00:00:00Z", text: "Reuse the existing input validation layout for the output checks." } });
    } });
  assert.equal(calls, 1);
  assert.match(prompt, /Reuse the existing input validation layout for the output checks\./u);
  assert.match(prompt, /UNTRUSTED/u);
  assert.ok(binding);
  const { readTaskSessionPacket } = await import("../src/core/task-read.js");
  const packet = await readTaskSessionPacket({ stateRoot: fixture.stateRoot, binding, limit: 50 });
  const dispositions: { state: string }[] = packet.proposalDispositions;
  assert.ok(dispositions.some((entry) => entry.state === "delivered"));
  assert.ok(dispositions.some((entry) => entry.state === "deferred"));
  assert.ok(!dispositions.some((entry) => entry.state === "applied"));
});

test("phase26 mid-dispatch steering is deferred without a new controller", async (t) => {
  const fixture = await createTaskFixture(t);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const base = referenceControllerPort("correct");
  let calls = 0, entered!: () => void, release!: () => void, binding: TaskSessionBinding | undefined;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const controller: typeof base = { async dispatch(request) { calls++; entered(); await hold; return base.dispatch(request); } };
  const running = startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run) => { binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision,
      runId: run.runId, host: "codex", originatingSessionId: "mid-dispatch" }; await createTaskSession(fixture.stateRoot, binding); } });
  await started;
  try {
    assert.ok(binding);
    await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "mid-1",
      submittedAt: "2026-11-01T00:00:00Z", text: "Please follow the approved contract." } });
  } finally { release(); }
  await running;
  assert.ok(binding);
  const facts = await readTaskSteering({ stateRoot: fixture.stateRoot, binding });
  assert.equal(calls, 1);
  assert.ok(facts.some((fact) => fact.state === "deferred" && fact.reason?.includes("no-safe-boundary")));
  assert.ok(!facts.some((fact) => fact.state === "delivered"));
});

test("phase26 controller assessment applies a committed in-scope plan change", async (t) => {
  const fixture = await createTaskFixture(t);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const { fixtureQuickId } = await import("./helpers/task-fixture.js");
  const { appendFile, mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const base = referenceControllerPort("correct");
  let binding: TaskSessionBinding | undefined, calls = 0;
  const controller: typeof base = { async dispatch(request) {
    calls++;
    const match = /<UNTRUSTED_USER_PROPOSAL_JSON>\s*([^\n]+)\s*<\/UNTRUSTED_USER_PROPOSAL_JSON>/u.exec(request.prompt);
    assert.ok(match?.[1]);
    const proposal = JSON.parse(match[1]) as { digest: string; boundary: string };
    const result = await base.dispatch(request);
    const quickId = fixtureQuickId(request.runId);
    const path = `.planning/quick/${quickId}-inventory-summary/${quickId}-PLAN.md`;
    await appendFile(join(fixture.projectRoot, path), "Reuse the existing input validation layout for output checks.\n");
    execFileSync("git", ["add", "--", path], { cwd: fixture.projectRoot });
    execFileSync("git", ["commit", "-m", "docs: refine approved plan"], { cwd: fixture.projectRoot });
    const log = join(fixture.projectRoot, request.decisionLogPath);
    await mkdir(dirname(log), { recursive: true });
    await writeFile(log, `${JSON.stringify({ id: `steering:${proposal.digest.slice(0, 48)}`, at: new Date().toISOString(), category: "gsd-default",
      choice: JSON.stringify({ schemaVersion: 1, proposalDigest: proposal.digest, binding, boundary: proposal.boundary, disposition: "applied", actionPath: path }),
      rationale: "Reuse the approved implementation layout", criterionIds: [], substitute: null })}\n`);
    return result;
  } };
  await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run) => {
      binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision, runId: run.runId,
        host: "codex", originatingSessionId: "applied-tracer" };
      await createTaskSession(fixture.stateRoot, binding);
      await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "applied-1",
        submittedAt: "2026-11-01T00:00:00Z", text: "Reuse the existing input validation layout for output checks." } });
    } });
  assert.equal(calls, 1);
  assert.ok(binding);
  const facts = await readTaskSteering({ stateRoot: fixture.stateRoot, binding });
  assert.ok(facts.some((fact) => fact.state === "assessed"));
  assert.ok(facts.some((fact) => fact.state === "applied"));
});

test("phase26 applied receipt is deferred for an uncommitted plan change", async (t) => {
  const fixture = await createTaskFixture(t);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const { fixtureQuickId } = await import("./helpers/task-fixture.js");
  const { appendFile, mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const base = referenceControllerPort("correct");
  let binding: TaskSessionBinding | undefined;
  const controller: typeof base = { async dispatch(request) {
    const match = /<UNTRUSTED_USER_PROPOSAL_JSON>\s*([^\n]+)\s*<\/UNTRUSTED_USER_PROPOSAL_JSON>/u.exec(request.prompt);
    assert.ok(match?.[1]);
    const proposal = JSON.parse(match[1]) as { digest: string; boundary: string };
    const result = await base.dispatch(request);
    const quickId = fixtureQuickId(request.runId);
    const path = `.planning/quick/${quickId}-inventory-summary/${quickId}-PLAN.md`;
    await appendFile(join(fixture.projectRoot, path), "This change is not committed.\n");
    const log = join(fixture.projectRoot, request.decisionLogPath);
    await mkdir(dirname(log), { recursive: true });
    await writeFile(log, `${JSON.stringify({ id: `steering:${proposal.digest.slice(0, 48)}`, at: new Date().toISOString(), category: "gsd-default",
      choice: JSON.stringify({ schemaVersion: 1, proposalDigest: proposal.digest, binding, boundary: proposal.boundary, disposition: "applied", actionPath: path }),
      rationale: "An uncommitted change", criterionIds: [], substitute: null })}\n`);
    return result;
  } };
  await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run) => {
      binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision, runId: run.runId,
        host: "codex", originatingSessionId: "dirty-tracer" };
      await createTaskSession(fixture.stateRoot, binding);
      await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "dirty-1",
        submittedAt: "2026-11-01T00:00:00Z", text: "Reuse the approved layout." } });
    } });
  assert.ok(binding);
  const facts = await readTaskSteering({ stateRoot: fixture.stateRoot, binding });
  assert.ok(facts.some((fact) => fact.state === "assessed"));
  assert.ok(facts.some((fact) => fact.state === "deferred"));
  assert.ok(!facts.some((fact) => fact.state === "applied"));
});

test("phase26 safe boundaries preserve active plan and single writer", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.scope.workflow = "gsd-multi-phase";
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const { join } = await import("node:path");
  const { readFile } = await import("node:fs/promises");
  const marker = join(fixture.scratch, "controller-stdin.txt");
  let binding: TaskSessionBinding | undefined;
  const script = "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{require('node:fs').writeFileSync(process.argv[1],s);process.exit(1)});";
  await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    gsd: { lifecycle: { hookCommand: process.execPath, hookArgs: ["-e", "process.exit(0)"], commandMap: { discuss: { executable: process.execPath, args: ["-e", script, marker] } } } },
    onRunReady: async (run) => { binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision,
      runId: run.runId, host: "codex", originatingSessionId: "full-boundary" }; await createTaskSession(fixture.stateRoot, binding);
      await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "full-1", submittedAt: "2026-11-01T00:00:00Z", text: "Reuse prior research." } }); } });
  assert.match(await readFile(marker, "utf8"), /Reuse prior research/u);
  assert.ok(binding);
  const facts = await readTaskSteering({ stateRoot: fixture.stateRoot, binding });
  assert.equal(facts.filter((fact) => fact.state === "delivered").length, 1);
  assert.ok(facts.some((fact) => fact.state === "deferred"));
});

test("phase26 authority changes require revision approval", async (t) => {
  const fixture = await createTaskFixture(t);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  let binding: TaskSessionBinding | undefined;
  const base = referenceControllerPort("correct");
  const controller: typeof base = { async dispatch(request) {
    const match = /<UNTRUSTED_USER_PROPOSAL_JSON>\s*([^\n]+)\s*<\/UNTRUSTED_USER_PROPOSAL_JSON>/u.exec(request.prompt);
    assert.ok(match?.[1]);
    const proposal = JSON.parse(match[1]) as { digest: string; boundary: string };
    const result = await base.dispatch(request);
    const log = join(fixture.projectRoot, request.decisionLogPath);
    await mkdir(dirname(log), { recursive: true });
    await writeFile(log, `${JSON.stringify({ id: `steering:${proposal.digest.slice(0, 48)}`, at: new Date().toISOString(), category: "gsd-default",
      choice: JSON.stringify({ schemaVersion: 1, proposalDigest: proposal.digest, binding, boundary: proposal.boundary, disposition: "revision-required", actionPath: null }),
      rationale: "Additional authority required", criterionIds: [], substitute: null })}\n`);
    return result;
  } };
  const result = await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run) => { binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision,
      runId: run.runId, host: "codex", originatingSessionId: "authority-check" }; await createTaskSession(fixture.stateRoot, binding);
      await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "authority-1", submittedAt: "2026-11-01T00:00:00Z", text: "Please request additional authority." } }); } });
  assert.equal(result.run.status, "blocked");
  assert.ok(binding);
  const facts = await readTaskSteering({ stateRoot: fixture.stateRoot, binding });
  assert.ok(facts.some((fact) => fact.state === "deferred" && fact.reason?.includes("revision-required")));
  assert.ok(!facts.some((fact) => fact.state === "applied"));
});

test("phase26 steering survives crash and no boundary", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  let binding: TaskSessionBinding | undefined, runPath = "";
  await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run, path) => { runPath = path; binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision,
      runId: run.runId, host: "codex", originatingSessionId: "recovery" }; await createTaskSession(fixture.stateRoot, binding); } });
  assert.ok(binding);
  const { readFile, writeFile } = await import("node:fs/promises");
  const stranded = JSON.parse(await readFile(runPath, "utf8")) as { status: string; finishedAt: string | null };
  stranded.status = "executing"; stranded.finishedAt = null;
  await writeFile(runPath, JSON.stringify(stranded));
  await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "crash-1", submittedAt: "2026-11-01T00:00:00Z", text: "Reuse the approved layout." } });
  const { acquireControllerLease } = await import("../src/core/controller-lease.js");
  const { consumeTaskSteeringAtBoundary } = await import("../src/core/task-steering.js");
  const acquire = () => acquireControllerLease({ projectRoot: fixture.projectRoot, harness: "codex", contractDigest: digest });
  const first = await acquire();
  try {
    const consumed = await consumeTaskSteeringAtBoundary({ stateRoot: fixture.stateRoot, binding, contract, lease: first, projectRoot: fixture.projectRoot, boundary: "first" });
    assert.ok(consumed);
    await consumed.delivered();
  } finally { await first.release(); }
  const second = await acquire();
  try {
    assert.equal(await consumeTaskSteeringAtBoundary({ stateRoot: fixture.stateRoot, binding, contract, lease: second, projectRoot: fixture.projectRoot, boundary: "second" }), null);
  } finally { await second.release(); }
  const facts = await readTaskSteering({ stateRoot: fixture.stateRoot, binding });
  assert.equal(facts.filter((fact) => fact.state === "delivered").length, 1);
  assert.ok(facts.some((fact) => fact.state === "deferred" && fact.reason?.includes("Prior controller")));
  assert.ok(!facts.some((fact) => fact.state === "applied"));
});
