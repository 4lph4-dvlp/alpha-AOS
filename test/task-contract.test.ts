import assert from "node:assert/strict";
import test from "node:test";
import {
  approveTaskContract,
  assertTaskStartable,
  loadTaskContract,
  readTaskApprovals,
  TaskContractError,
  taskContractDigest,
  type TaskContract,
} from "../src/core/task-contract.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract, type TaskFixture } from "./helpers/task-fixture.js";

const HEX64 = /[0-9a-f]{64}/u;

function isCode(code: string, check?: (message: string) => void): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof TaskContractError, `unexpected error: ${String(error)}`);
    assert.equal(error.code, code, error.message);
    check?.(error.message);
    return true;
  };
}

/** The same value rebuilt with every object's keys in reverse order; arrays keep their order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value === "object" && value !== null) {
    const rebuilt: Record<string, unknown> = {};
    for (const key of Object.keys(value).reverse()) rebuilt[key] = reverseKeys((value as Record<string, unknown>)[key]);
    return rebuilt;
  }
  return value;
}

function clone(contract: TaskContract): TaskContract {
  return JSON.parse(JSON.stringify(contract)) as TaskContract;
}

async function approveOriginal(fixture: TaskFixture, contract: TaskContract = inventorySummaryContract(fixture.projectRoot)): Promise<string> {
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  const result = await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  assert.equal(result.status, "approved");
  return digest;
}

// ---------------------------------------------------------------------------
// Task 1: canonical digest, drift explanation and revision reuse (CON-03, D-04)
// ---------------------------------------------------------------------------

test("permuting key, criterion, allowedRoots and allowedEffects order keeps the digest", async (context) => {
  const fixture = await createTaskFixture(context);
  const original = inventorySummaryContract(fixture.projectRoot);
  const permuted = reverseKeys(original) as TaskContract;
  permuted.criterion = [...permuted.criterion].reverse();
  permuted.allowedRoots = [...permuted.allowedRoots].reverse();
  permuted.allowedEffects = [...permuted.allowedEffects].reverse();

  await writeTaskContract(fixture.contractPath, original);
  const first = await loadTaskContract(fixture.contractPath);
  await writeTaskContract(fixture.contractPath, permuted);
  const second = await loadTaskContract(fixture.contractPath);
  assert.equal(second.digest, first.digest);
  assert.equal(taskContractDigest(permuted), taskContractDigest(original));
});

test("equivalent spellings of an allowed root and a measurement entry keep the digest", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = inventorySummaryContract(fixture.projectRoot);
  const dotted = clone(base);
  dotted.allowedRoots = ["./bin/", "src", "test", "package.json", "README.md"];
  const slashed = clone(base);
  slashed.allowedRoots = ["bin/", "src", "test", "package.json", "README.md"];
  const backslashed = clone(base);
  for (const criterion of backslashed.criterion) criterion.measurement.entry = "bin\\inventory-summary.mjs";

  const digest = taskContractDigest(base);
  assert.equal(taskContractDigest(dotted), digest);
  assert.equal(taskContractDigest(slashed), digest);
  assert.equal(taskContractDigest(backslashed), digest);
});

test("a goal in NFD form digests like its NFC form and one changed character does not", async (context) => {
  const fixture = await createTaskFixture(context);
  const composed = `${inventorySummaryContract(fixture.projectRoot).goal} Label the café output.`;
  const nfc = inventorySummaryContract(fixture.projectRoot, { goal: composed.normalize("NFC") });
  const nfd = inventorySummaryContract(fixture.projectRoot, { goal: composed.normalize("NFD") });
  assert.notEqual(nfd.goal, nfc.goal, "the fixture really stores two spellings");
  assert.equal(taskContractDigest(nfd), taskContractDigest(nfc));

  const changed = inventorySummaryContract(fixture.projectRoot, { goal: composed.replace("café", "cafe") });
  assert.notEqual(taskContractDigest(changed), taskContractDigest(nfc));
});

test("expected JSON is compared by meaning while inputText is compared byte for byte", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = inventorySummaryContract(fixture.projectRoot);
  const reordered = clone(base);
  const criterion = reordered.criterion[0];
  assert.ok(criterion !== undefined);
  criterion.measurement.expect.stdoutJson = { skus: { "B-200": 5, "A-100": 5 }, totalQuantity: 10, rows: 3 };
  assert.equal(taskContractDigest(reordered), taskContractDigest(base));

  const crlf = clone(base);
  const crlfCriterion = crlf.criterion[0];
  assert.ok(crlfCriterion !== undefined);
  crlfCriterion.measurement.inputText = crlfCriterion.measurement.inputText.replaceAll("\n", "\r\n");
  assert.notEqual(taskContractDigest(crlf), taskContractDigest(base));
});

test("an edited goal after approval is refused with the changed field, the new digest and the re-approval path", async (context) => {
  const fixture = await createTaskFixture(context);
  const approved = await approveOriginal(fixture);
  const edited = inventorySummaryContract(fixture.projectRoot, { goal: "Print the inventory as YAML instead." });
  await writeTaskContract(fixture.contractPath, edited);
  const current = taskContractDigest(edited);

  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: approved, stateRoot: fixture.stateRoot }),
    isCode("contract-drift", (message) => {
      assert.match(message, /\bgoal\b/u);
      assert.ok(message.includes(current), "the refusal names the new digest");
      assert.ok(message.includes(approved.slice(0, 12)), "the refusal names the approved digest prefix");
      assert.ok(message.includes("alpha-aos task approve"), "the refusal names the approve command");
      assert.ok(message.includes("alpha-aos task preview"), "the refusal names the preview command");
      assert.ok(message.includes("Increase revision to 2"), "the refusal asks for a new revision");
    }),
  );
});

test("each changed authority field is named in the drift refusal", async (context) => {
  const fixture = await createTaskFixture(context);
  const approved = await approveOriginal(fixture);
  const base = inventorySummaryContract(fixture.projectRoot);

  const effects = clone(base);
  effects.allowedEffects = ["workspace-write", "local-commit", "dependency-change"];
  const reviewer = clone(base);
  reviewer.agentPolicy.reviewer = "pi";
  const criterion = clone(base);
  const valid = criterion.criterion.find((entry) => entry.id === "valid-summary");
  assert.ok(valid !== undefined);
  valid.measurement.expect.stdoutJson = { rows: 3, totalQuantity: 11, skus: { "A-100": 5, "B-200": 5 } };
  const limit = clone(base);
  limit.resourcePolicy = { maxWallTimeMinutes: 90 };

  const cases: Array<[TaskContract, string]> = [
    [effects, "allowedEffects"],
    [reviewer, "agentPolicy.reviewer"],
    [criterion, "criterion[valid-summary]"],
    [limit, "resourcePolicy.maxWallTimeMinutes"],
  ];
  for (const [contract, field] of cases) {
    await writeTaskContract(fixture.contractPath, contract);
    await assert.rejects(
      assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: approved, stateRoot: fixture.stateRoot }),
      isCode("contract-drift", (message) => {
        assert.ok(message.includes(field), `the refusal names ${field}: ${message}`);
        assert.ok(!message.includes("criterion[invalid-quantity]"), "an unchanged criterion is not named");
      }),
    );
  }
});

test("changed content cannot reuse an approved revision number", async (context) => {
  const fixture = await createTaskFixture(context);
  const first = await approveOriginal(fixture);
  const edited = inventorySummaryContract(fixture.projectRoot, { goal: "Print the inventory as YAML instead." });
  await writeTaskContract(fixture.contractPath, edited);
  const editedDigest = taskContractDigest(edited);

  await assert.rejects(
    approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: editedDigest, stateRoot: fixture.stateRoot }),
    isCode("revision-reused", (message) => {
      assert.match(message, /revision 2\b/u);
      assert.match(message, /\bgoal\b/u);
      assert.ok(message.includes("alpha-aos task preview"));
    }),
  );
  assert.equal((await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" })).length, 1);

  const revised = inventorySummaryContract(fixture.projectRoot, { goal: "Print the inventory as YAML instead.", revision: 2 });
  await writeTaskContract(fixture.contractPath, revised);
  const revisedDigest = taskContractDigest(revised);
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: revisedDigest, stateRoot: fixture.stateRoot }),
    isCode("not-approved"),
    "the revision-1 approval does not authorize the revision-2 digest",
  );
  const result = await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: revisedDigest, stateRoot: fixture.stateRoot });
  assert.equal(result.status, "approved");
  const { approval } = await assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: revisedDigest, stateRoot: fixture.stateRoot });
  assert.equal(approval.revision, 2);
  assert.equal(approval.contractDigest, revisedDigest);
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: first, stateRoot: fixture.stateRoot }),
    isCode("contract-drift"),
  );
});

test("a digest that was never approved is reported as unknown to this state root", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const current = taskContractDigest(contract);
  const unknown = current.startsWith("a") ? "b".repeat(64) : "a".repeat(64);

  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: unknown, stateRoot: fixture.stateRoot }),
    isCode("contract-drift", (message) => {
      assert.ok(message.includes(unknown.slice(0, 12)));
      assert.match(message, /never approved in this state root/u);
      assert.ok(message.includes(current));
      assert.ok(message.includes("alpha-aos task preview"));
      assert.match(message, HEX64);
    }),
  );
});
