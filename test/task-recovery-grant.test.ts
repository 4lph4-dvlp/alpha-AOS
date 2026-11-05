import assert from "node:assert/strict";
import test from "node:test";
import { approveTaskContract, digestableTaskContract, loadTaskContract, readTaskApprovals, taskContractDigest } from "../src/core/task-contract.js";
import { assertRecoveryRevision, recordRecoveryRevision } from "../src/core/task-recovery-grant.js";
import { meteredTaskDispatch } from "../src/core/task-runtime.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract } from "./helpers/task-fixture.js";

function rootContract(projectRoot: string) {
  return inventorySummaryContract(projectRoot, { goal: "Use Exa for web research on CSV parsing; implement the approved inventory CLI.",
    recoveryPolicy: { maxRepairs: 2, allowQuestionRepair: true, allowWorkspaceRepair: true },
    capabilityQuestions: { research: "Exa research about CSV parsing edge cases" } });
}

test("recovery grant permits question correction but cannot change authority, criteria, models, limits or remove questions", () => {
  const root = rootContract(process.cwd());
  const candidate = { ...root, revision: 2, capabilityQuestions: { research: "CSV parsing official Node.js documentation and edge cases" } };
  const before = digestableTaskContract(root);
  assert.doesNotThrow(() => assertRecoveryRevision(before, digestableTaskContract(candidate), 1));
  for (const changed of [ { ...candidate, goal: "Different task" }, { ...candidate, allowedRoots: ["."] },
    { ...candidate, resourcePolicy: { maxCycles: 100 } }, { ...candidate, agentPolicy: { ...candidate.agentPolicy, controllerModel: "another-model" } },
    { ...candidate, criterion: [] }, { ...candidate, capabilityQuestions: {} } ]) assert.throws(() => assertRecoveryRevision(before, digestableTaskContract(changed), 1), /recovery|Recovery/u);
  assert.throws(() => assertRecoveryRevision(before, digestableTaskContract(candidate), 3), /exhaust|outside/u);
  assert.throws(() => assertRecoveryRevision(digestableTaskContract({ ...root, recoveryPolicy: { ...root.recoveryPolicy!, allowQuestionRepair: false } }), digestableTaskContract(candidate), 1), /outside/u);
});

test("delegated contract revision is transactional, inspectable and revalidated against the explicit root grant", async (context) => {
  const fixture = await createTaskFixture(context);
  const root = rootContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, root);
  const rootDigest = taskContractDigest(root);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: rootDigest, stateRoot: fixture.stateRoot });
  const candidate = { ...root, revision: 2, capabilityQuestions: { research: "Official Node.js CSV parsing examples and error behavior" } };
  const result = await recordRecoveryRevision({ stateRoot: fixture.stateRoot, contractPath: fixture.contractPath, rootDigest, parentDigest: rootDigest, candidate, repairIndex: 1 });
  assert.equal((await loadTaskContract(fixture.contractPath)).digest, result.digest);
  const approvals = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: root.id });
  const delegated = approvals.find((item) => item.contractDigest === result.digest)!;
  assert.equal(delegated.consent.grant, "bounded-recovery");
  assert.equal(delegated.recovery?.rootDigest, rootDigest);
  assert.equal(delegated.recovery?.parentDigest, rootDigest);
  await assert.rejects(recordRecoveryRevision({ stateRoot: fixture.stateRoot, contractPath: fixture.contractPath, rootDigest, parentDigest: result.digest,
    candidate: { ...candidate, revision: 3, allowedEffects: [...candidate.allowedEffects, "external-download"] }, repairIndex: 2 }), /authority|required|invalid/iu);
  assert.equal((await loadTaskContract(fixture.contractPath)).digest, result.digest, "refused expansion leaves the current contract intact");
});

test("native cycle budget is cumulative across delegated contract digests", async (context) => {
  const fixture = await createTaskFixture(context);
  const root = { ...rootContract(fixture.projectRoot), resourcePolicy: { maxCycles: 1 } };
  await writeTaskContract(fixture.contractPath, root);
  const rootDigest = taskContractDigest(root);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: rootDigest, stateRoot: fixture.stateRoot });
  const invoke = async () => ({ sessionId: "native-fixture", terminal: "completed", exitCode: 0, closeConfirmed: true });
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: root, digest: rootDigest, runId: "parent-run", role: "controller", cycleBoundary: true, invoke });
  const candidate = { ...root, revision: 2, capabilityQuestions: { research: "Official Node.js CSV parsing behavior reference" } };
  const revised = await recordRecoveryRevision({ stateRoot: fixture.stateRoot, contractPath: fixture.contractPath, rootDigest, parentDigest: rootDigest, candidate, repairIndex: 1 });
  let dispatched = false;
  await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: candidate, digest: revised.digest, runId: "child-run", role: "controller", cycleBoundary: true,
    invoke: async () => { dispatched = true; return invoke(); } }), /cycle_limit_exceeded/u);
  assert.equal(dispatched, false);
});
