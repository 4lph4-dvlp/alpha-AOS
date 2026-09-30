import assert from "node:assert/strict";
import { mkdir, realpath, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { canonicalizeWithMissingTail } from "../src/core/path-boundary.js";
import {
  approveTaskContract,
  assertTaskStartable,
  loadTaskContract,
  previewTaskContract,
  readTaskApprovals,
  TaskContractError,
  taskContractDigest,
  type TaskContract,
  type TaskContractPreview,
} from "../src/core/task-contract.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract, type TaskFixture } from "./helpers/task-fixture.js";

const HEX64 = /[0-9a-f]{64}/u;

const loadWithSource = loadTaskContract as (
  path: string,
  options?: { source?: NodeJS.ProcessEnv },
) => ReturnType<typeof loadTaskContract>;

type BoundPreview = TaskContractPreview & { consent?: unknown; resourceLimit?: unknown };

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

// ---------------------------------------------------------------------------
// Task 2: bounded authority, credential-free text, bound project root (AUTO-02)
// ---------------------------------------------------------------------------

async function loadVariant(fixture: TaskFixture, contract: unknown, source: NodeJS.ProcessEnv = {}): Promise<void> {
  await writeTaskContract(fixture.contractPath, contract);
  await loadWithSource(fixture.contractPath, { source });
}

test("the wall-time limit loads at 1 and 1440 minutes and is refused outside them", async (context) => {
  const fixture = await createTaskFixture(context);
  for (const minutes of [1, 1440]) {
    await loadVariant(fixture, inventorySummaryContract(fixture.projectRoot, { resourcePolicy: { maxWallTimeMinutes: minutes } }));
  }
  for (const minutes of [0, 1441, "60"]) {
    const contract = { ...inventorySummaryContract(fixture.projectRoot), resourcePolicy: { maxWallTimeMinutes: minutes } };
    await assert.rejects(
      loadVariant(fixture, contract),
      isCode("contract-invalid", (message) => assert.ok(message.includes("/resourcePolicy/maxWallTimeMinutes"), message)),
    );
  }
});

test("an absent wall-time limit loads and the preview binds consent and reports no overall limit", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot, { resourcePolicy: {} }));
  const preview = (await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot })) as BoundPreview;
  assert.equal(preview.contract.resourcePolicy.maxWallTimeMinutes, null);
  assert.equal(preview.resourceLimit, null);
  assert.deepEqual(preview.consent, { mode: "autopilot", grant: "explicit-cli-approval", scope: "single-run", revision: 1 });
});

test("a fractional wall-time limit is refused rather than rounded", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = { ...inventorySummaryContract(fixture.projectRoot), resourcePolicy: { maxWallTimeMinutes: 1.5 } };
  await assert.rejects(
    loadVariant(fixture, contract),
    isCode("contract-invalid", (message) => assert.ok(message.includes("/resourcePolicy/maxWallTimeMinutes"), message)),
  );
});

test("an allowed root outside the project or inside reserved state is refused by index", async (context) => {
  const fixture = await createTaskFixture(context);
  const refused = ["/abs", "C:/x", "//server/share", "../up", "bin/../..", ".git", "src/.git/hooks", ".planning", ".planning/x", ".alpha-aos", "./", "."];
  for (const entry of refused) {
    const contract = inventorySummaryContract(fixture.projectRoot, { allowedRoots: ["bin", "src", "test", "package.json", "README.md", entry] });
    await assert.rejects(
      loadVariant(fixture, contract),
      isCode("contract-invalid", (message) => {
        assert.ok(message.includes("/allowedRoots/5"), `${entry}: ${message}`);
      }),
      `allowed root ${JSON.stringify(entry)} is refused`,
    );
  }
});

test("a measurement entry outside every allowed root is refused by criterion index", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const second = contract.criterion[1];
  assert.ok(second !== undefined);
  second.measurement.entry = "lib/tool.mjs";
  await assert.rejects(
    loadVariant(fixture, contract),
    isCode("contract-invalid", (message) => assert.ok(message.includes("/criterion/1/measurement/entry"), message)),
  );

  const binary = inventorySummaryContract(fixture.projectRoot);
  const first = binary.criterion[0];
  assert.ok(first !== undefined);
  first.measurement.entry = "binary/tool.mjs";
  await assert.rejects(
    loadVariant(fixture, binary),
    isCode("contract-invalid", (message) => assert.ok(message.includes("/criterion/0/measurement/entry"), message)),
    "a sibling that only shares the prefix of an allowed root is outside it",
  );
});

test("a relative project root is refused", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.scope.projectRoot = "inventory-summary";
  await assert.rejects(
    loadVariant(fixture, contract),
    isCode("contract-invalid", (message) => assert.ok(message.includes("/scope/projectRoot"), message)),
  );
});

test("a gsd-quick contract without the local-commit effect is refused", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot, { allowedEffects: ["workspace-write"] });
  await assert.rejects(
    loadVariant(fixture, contract),
    isCode("contract-invalid", (message) => {
      assert.ok(message.includes("local-commit"), message);
      assert.ok(message.includes("/allowedEffects"), message);
    }),
  );
});

test("a hermes controller is refused and every other controller loads", async (context) => {
  const fixture = await createTaskFixture(context);
  const withController = (controller: TaskContract["agentPolicy"]["controller"]) =>
    inventorySummaryContract(fixture.projectRoot, {
      agentPolicy: { controller, executor: "codex", reviewer: "claude", reviewerSession: "fresh-read-only" },
    });
  await assert.rejects(
    loadVariant(fixture, withController("hermes")),
    isCode("unsupported-controller", (message) => assert.match(message, /worker-only/u)),
  );
  for (const controller of ["codex", "claude", "pi", "antigravity"] as const) {
    await loadVariant(fixture, withController(controller));
  }
});

test("a contract carrying a credential environment value is refused by path and variable name only", async (context) => {
  const fixture = await createTaskFixture(context);
  const value = "Zq8vLm3Rt7Wx2Kp9Nd4F";
  assert.equal(value.length, 20);
  const contract = inventorySummaryContract(fixture.projectRoot, { goal: `Call the service with ${value} and summarize the inventory.` });

  await loadVariant(fixture, contract, { UNRELATED_SETTING: value });
  await assert.rejects(
    loadVariant(fixture, contract, { SERVICE_API_KEY: value }),
    isCode("secret-in-contract", (message) => {
      assert.ok(message.includes("/goal"), message);
      assert.ok(message.includes("SERVICE_API_KEY"), message);
      assert.equal(message.includes(value), false);
    }),
  );
});

test("approval records the canonical project root and refuses a project root that does not exist", async (context) => {
  const fixture = await createTaskFixture(context);
  await approveOriginal(fixture);
  const [approval] = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" });
  assert.ok(approval !== undefined);
  const expected = await canonicalizeWithMissingTail(fixture.projectRoot);
  assert.equal(expected.reason, null);
  assert.equal(approval.canonicalProjectRoot, expected.canonical);

  const missing = inventorySummaryContract(join(fixture.scratch, "not-created"), { id: "missing-root" });
  await writeTaskContract(fixture.contractPath, missing);
  await assert.rejects(
    approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: taskContractDigest(missing), stateRoot: fixture.stateRoot }),
    isCode("contract-invalid", (message) => assert.ok(message.includes("/scope/projectRoot"), message)),
  );
  assert.deepEqual(await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "missing-root" }), []);
});

test("a project root retargeted after approval is refused as root-changed", async (context) => {
  const fixture = await createTaskFixture(context);
  const linkType = process.platform === "win32" ? "junction" : "dir";
  const link = join(fixture.scratch, "linked-root");
  const other = join(fixture.scratch, "other-root");
  await mkdir(other, { recursive: true });
  try {
    await symlink(fixture.projectRoot, link, linkType);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown";
    if (code === "EPERM" || code === "EACCES") {
      context.skip(`directory links unavailable: ${code}`);
      return;
    }
    throw error;
  }

  const digest = await approveOriginal(fixture, inventorySummaryContract(link));
  const [approval] = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" });
  assert.equal(approval?.canonicalProjectRoot, await realpath(fixture.projectRoot));
  await assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  await unlink(link);
  await symlink(other, link, linkType);
  const retargeted = await realpath(other);
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot }),
    isCode("root-changed", (message) => {
      assert.ok(message.includes(approval?.canonicalProjectRoot ?? "<none>"), message);
      assert.ok(message.includes(retargeted), message);
    }),
  );
});
