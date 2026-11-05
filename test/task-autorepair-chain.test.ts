import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { approveTaskContract, assertTaskStartable, loadTaskContract, readTaskApprovals, taskContractDigest } from "../src/core/task-contract.js";
import { TaskCapabilityPreflightError } from "../src/core/task-capability-health.js";
import { startTaskWithRecovery } from "../src/core/task-supervisor.js";
import { createTaskFixture, fixturePorts, inventorySummaryContract, passingReview, referenceControllerPort, staticReviewerPort, writeTaskContract } from "./helpers/task-fixture.js";
import type { ControllerDispatchResult } from "../src/core/task-run.js";
import { packageRoot } from "../src/core/paths.js";
import { createCapabilityReceipt } from "../src/core/task-capability-receipts.js";
import { listTaskRuns } from "../src/core/task-run.js";
import { repairTaskFailure } from "../src/core/task-autorepair.js";
import { readTaskBaseline } from "../src/core/task-effects.js";

function repairResult(summary: string): ControllerDispatchResult {
  return { harness: "codex", version: "fixture", executable: null, sessionId: "repair-session", exitCode: 0, processCode: "ok", terminal: "completed", closeConfirmed: true,
    claim: { status: "completed", summary, authorityRequest: null, gsdQuickId: null }, detail: null };
}

test("a failed repair cannot use workflow authority to change protected lifecycle state", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot, { recoveryPolicy: { maxRepairs: 1, allowWorkspaceRepair: true, allowQuestionRepair: false } });
  const baseline = await readTaskBaseline({ projectRoot: fixture.projectRoot });
  assert.equal(baseline.status, "clean");
  if (baseline.status !== "clean") return;
  const ports = fixturePorts({ controller: { dispatch: async () => {
    await writeFile(join(fixture.projectRoot, ".planning", "STATE.md"), "Claimed lifecycle progress from a failed repair");
    return { ...repairResult("Cannot complete"), claim: { status: "failed", summary: "Cannot complete", authorityRequest: null, gsdQuickId: null } };
  } }, reviewer: staticReviewerPort(passingReview) });
  const result = await repairTaskFailure({ contract, rootContract: contract, stateRoot: fixture.stateRoot, ports,
    failure: "criterion failed", runId: "protected-repair", repairIndex: 1, baseCommit: baseline.baseCommit });
  assert.equal(result.status, "needs-input");
  assert.match(result.reason, /protected lifecycle state/u);
});

test("preflight recovery refuses unproven agents without consuming task execution approval", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot, { goal: "Use Exa for web research on CSV parsing.",
    recoveryPolicy: { maxRepairs: 1, allowWorkspaceRepair: false, allowQuestionRepair: true } });
  await writeTaskContract(fixture.contractPath, contract);
  const digest = taskContractDigest(contract);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  let dispatches = 0;
  const ports = fixturePorts({ controller: { dispatch: async () => { dispatches++; return repairResult("unexpected"); } }, reviewer: staticReviewerPort(passingReview) });
  const assess = ports.assess;
  ports.assess = async (policy) => ({ ...await assess(policy), supported: false, missingProof: ["native role proof missing"] });
  ports.capability = { preflight: async () => { throw new Error("Invalid arguments: query"); }, invoke: async () => { throw new Error("unexpected execution"); } };
  await assert.rejects(startTaskWithRecovery({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(), ports, gsd: { configRoot: fixture.gsdConfigRoot } }), (error: unknown) => {
    assert.ok(error instanceof TaskCapabilityPreflightError);
    assert.equal(error.status, "needs-input");
    assert.equal(error.contractDigest, digest);
    assert.match(error.message, /native role proof missing/u);
    return true;
  });
  assert.equal(dispatches, 0);
  assert.equal((await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: contract.id })).length, 0);
  await assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
});

test("native recovery corrects a measured implementation defect, verifies it and reruns without a user request", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot, { recoveryPolicy: { maxRepairs: 2, allowWorkspaceRepair: true, allowQuestionRepair: false }, resourcePolicy: { maxCycles: 6 } });
  await writeTaskContract(fixture.contractPath, contract);
  const digest = taskContractDigest(contract);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  let fixed = false, repairs = 0, attempts = 0;
  const ports = fixturePorts({ controller: { dispatch: async (request) => {
    if (request.prompt.startsWith("Perform ONE bounded repair")) {
      repairs++;
      const target = join(fixture.projectRoot, "bin", "inventory-summary.mjs");
      const old = await readFile(target, "utf8");
      assert.ok(old.includes("totalQuantity + 1"));
      if (repairs === 1) {
        await writeFile(target, old + "\n// First correction has not yet fixed the measured defect.\n");
        return repairResult("Adjusted implementation; verification must determine whether it is fixed");
      }
      await writeFile(target, old.replace("totalQuantity + 1", "totalQuantity"));
      fixed = true;
      return repairResult("Corrected the off-by-one quantity calculation");
    }
    attempts++;
    return referenceControllerPort(fixed ? "correct" : "off-by-one").dispatch(request);
  } }, reviewer: staticReviewerPort(passingReview) });
  const options = { contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(), ports, gsd: { configRoot: fixture.gsdConfigRoot } };
  const result = await startTaskWithRecovery(options);
  assert.equal(result.supervision?.status, "accepted");
  assert.equal(result.run.status, "accepted");
  assert.equal(repairs, 2);
  assert.equal(attempts, 2);
  assert.equal(result.recovery!.repairs[0]!.status, "retry-repair");
  assert.match(result.recovery!.repairs[1]!.verification, /approved criteria passed/u);
  assert.notEqual(result.recovery!.repairs[1]!.before, result.recovery!.repairs[1]!.after);
  await assert.rejects(startTaskWithRecovery(options), /already accepted/u);
  assert.equal(attempts, 2);
});

test("unverified repair claims consume only the bounded repair grant without rerunning the unchanged task", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot, { recoveryPolicy: { maxRepairs: 2, allowWorkspaceRepair: true, allowQuestionRepair: false }, resourcePolicy: { maxCycles: 6 } });
  await writeTaskContract(fixture.contractPath, contract);
  const digest = taskContractDigest(contract);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  let attempts = 0;
  const ports = fixturePorts({ controller: { dispatch: async (request) => {
    if (request.prompt.startsWith("Perform ONE bounded repair")) return repairResult("I would retry with a stronger prompt");
    attempts++; return referenceControllerPort("off-by-one").dispatch(request);
  } }, reviewer: staticReviewerPort(passingReview) });
  const result = await startTaskWithRecovery({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(), ports, gsd: { configRoot: fixture.gsdConfigRoot } });
  assert.equal(result.supervision?.status, "blocked");
  assert.match(result.supervision!.checkpoint.stopReason!, /repair_budget_exhausted/u);
  assert.equal(result.recovery?.repairs.length, 2);
  assert.equal(attempts, 1);
});

test("approved preflight question repair restores invocation before creating any execution run", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot, { goal: "Use Exa for web research about CSV parsing, then implement inventory summary.",
    capabilityQuestions: { research: "Invalid oversized search question for CSV parsing" },
    recoveryPolicy: { maxRepairs: 2, allowWorkspaceRepair: false, allowQuestionRepair: true }, resourcePolicy: { maxCycles: 6 } });
  await writeTaskContract(fixture.contractPath, contract);
  const digest = taskContractDigest(contract);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  let corrected = 0;
  const ports = fixturePorts({ controller: { dispatch: async (request) => {
    if (request.prompt.startsWith("Perform ONE bounded repair")) {
      assert.equal(request.readOnly, true);
      assert.equal((await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: contract.id })).length, 0);
      corrected++;
      return repairResult(JSON.stringify({ capabilityQuestions: { research: "Official CSV parsing examples in Node.js documentation" } }));
    }
    return referenceControllerPort("correct").dispatch(request);
  } }, reviewer: staticReviewerPort(passingReview) });
  ports.capability = {
    preflight: async (request) => { if (!request.obligation.question.startsWith("Official CSV")) throw new Error("Invalid arguments: query too long"); },
    invoke: async (request) => ({ receipt: createCapabilityReceipt({ runId: request.runId, step: request.step, capabilityId: request.obligation.capabilityId,
      obligationId: request.obligation.id, question: request.obligation.question, selected: true, invoked: true, toolName: "fixture-web-search",
      harness: "codex", harnessVersion: "fixture", harnessExecutable: process.execPath, sessionId: request.sessionId ?? "fixture-native-capability",
      source: request.obligation.source, sourceVersion: request.obligation.version, observationId: "e".repeat(64), rawResultSha256: "e".repeat(64), isReused: false, originalReceiptId: null, isError: false, errorMessage: null }) }),
  };
  const result = await startTaskWithRecovery({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(), ports, gsd: { configRoot: fixture.gsdConfigRoot } });
  assert.equal(result.supervision?.status, "accepted");
  assert.equal(corrected, 1);
  assert.equal((await loadTaskContract(fixture.contractPath)).contract.revision, 2);
  const approvals = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: contract.id });
  assert.equal(approvals.find((item) => item.revision === 2)?.consent.grant, "bounded-recovery");
  assert.notEqual(result.run.contractDigest, digest);
});
