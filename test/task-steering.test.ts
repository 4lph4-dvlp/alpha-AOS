import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFixture, fixturePorts, inventorySummaryContract, passingReview, referenceControllerPort, staticReviewerPort, writeTaskContract } from "./helpers/task-fixture.js";
import { approveTaskContract, previewTaskContract } from "../src/core/task-contract.js";
import { packageRoot } from "../src/core/paths.js";
import { startTask } from "../src/core/task-run.js";
import { createTaskSession, type TaskSessionBinding } from "../src/core/task-session.js";
import { readTaskSteering, submitTaskSteering, type TaskSteeringProposal } from "../src/core/task-steering.js";

test("phase26 steering receipt is durable and idempotent", async (t) => {
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
  assert.deepEqual(await readTaskSteering({ stateRoot: fixture.stateRoot, binding }), [receipt]);
  const { readTaskSessionPacket } = await import("../src/core/task-read.js");
  assert.deepEqual((await readTaskSessionPacket({ stateRoot: fixture.stateRoot, binding, limit: 10 })).proposalDispositions, [receipt]);
  await assert.rejects(readTaskSteering({ stateRoot: fixture.stateRoot, binding: { ...binding, originatingSessionId: "another-session" } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "big", text: "x".repeat(8193) } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "secret", text: "token=private-value" } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "path", evidenceIds: ["/private/file"] } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "unknown-evidence", evidenceIds: ["not-recorded"] } }));
  await assert.rejects(submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { ...proposal, requestId: "extra", extra: true } as TaskSteeringProposal }));
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
