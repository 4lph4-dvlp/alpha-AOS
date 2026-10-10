import assert from "node:assert/strict";
import { mkdir, readdir, readFile, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { canonicalizeWithMissingTail } from "../src/core/path-boundary.js";
import {
  approveTaskContract,
  assertTaskStartable,
  loadTaskContract,
  previewTaskContract,
  readTaskApprovals,
  readReservedTaskRun,
  reservedRunIdForApproval,
  TaskContractError,
  taskContractDigest,
  taskSchema,
  type TaskContract,
  type TaskContractPreview,
} from "../src/core/task-contract.js";
import { listTaskRuns, TaskRunError } from "../src/core/task-run.js";
import { validateManagedDocument } from "../src/core/validation.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";
import { gitCommand } from "./helpers/git-fixture.js";

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
  for (const criterion of backslashed.criterion) {
    if (criterion.measurement.kind === "cli-json") criterion.measurement.entry = "bin\\inventory-summary.mjs";
  }

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
  assert.ok(criterion !== undefined && criterion.measurement.kind === "cli-json");
  criterion.measurement.expect.stdoutJson = { skus: { "B-200": 5, "A-100": 5 }, totalQuantity: 10, rows: 3 };
  assert.equal(taskContractDigest(reordered), taskContractDigest(base));

  const crlf = clone(base);
  const crlfCriterion = crlf.criterion[0];
  assert.ok(crlfCriterion !== undefined && crlfCriterion.measurement.kind === "cli-json");
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
  assert.ok(valid !== undefined && valid.measurement.kind === "cli-json");
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
  await loadTaskContract(fixture.contractPath, { source });
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
  const preview: TaskContractPreview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
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
  assert.ok(second !== undefined && second.measurement.kind === "cli-json");
  second.measurement.entry = "lib/tool.mjs";
  await assert.rejects(
    loadVariant(fixture, contract),
    isCode("contract-invalid", (message) => assert.ok(message.includes("/criterion/1/measurement/entry"), message)),
  );

  const binary = inventorySummaryContract(fixture.projectRoot);
  const first = binary.criterion[0];
  assert.ok(first !== undefined && first.measurement.kind === "cli-json");
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

test("every supported harness loads cleanly as controller (ROL-01, ROL-03)", async (context) => {
  const fixture = await createTaskFixture(context);
  const withController = (controller: TaskContract["agentPolicy"]["controller"]) =>
    inventorySummaryContract(fixture.projectRoot, {
      agentPolicy: { controller, executor: "codex", reviewer: "claude", reviewerSession: "fresh-read-only" },
    });
  for (const controller of ["codex", "claude", "pi", "antigravity", "hermes"] as const) {
    await loadVariant(fixture, withController(controller));
  }
});

test("differentReviewerPolicy require-different-harness rejects matching reviewer and accepts distinct harnesses (ROL-04, D-10)", async (context) => {
  const fixture = await createTaskFixture(context);

  // Reviewer matches controller: rejected
  const matchesController = inventorySummaryContract(fixture.projectRoot, {
    agentPolicy: {
      controller: "claude",
      executor: "codex",
      reviewer: "claude",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "require-different-harness",
    },
  });
  await assert.rejects(
    loadVariant(fixture, matchesController),
    isCode("contract-invalid", (message) => {
      assert.ok(message.includes("differentReviewerPolicy 'require-different-harness' is violated"), message);
      assert.ok(message.includes("/agentPolicy/differentReviewerPolicy"), message);
    }),
  );

  // Reviewer matches executor: rejected
  const matchesExecutor = inventorySummaryContract(fixture.projectRoot, {
    agentPolicy: {
      controller: "claude",
      executor: "codex",
      reviewer: "codex",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "require-different-harness",
    },
  });
  await assert.rejects(
    loadVariant(fixture, matchesExecutor),
    isCode("contract-invalid", (message) => {
      assert.ok(message.includes("differentReviewerPolicy 'require-different-harness' is violated"), message);
    }),
  );

  // Distinct harnesses: accepted
  const distinctHarnesses = inventorySummaryContract(fixture.projectRoot, {
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "claude",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "require-different-harness",
    },
  });
  await loadVariant(fixture, distinctHarnesses);

  // allow-same accepts same harness
  const allowSame = inventorySummaryContract(fixture.projectRoot, {
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "codex",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "allow-same",
    },
  });
  await loadVariant(fixture, allowSame);
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

// ---------------------------------------------------------------------------
// Plan 14-07 Task 3: the approved git directory (CON-01, CON-03, AUTO-02, D-04)
// ---------------------------------------------------------------------------

async function canonicalGitDirectory(projectRoot: string): Promise<string> {
  const root = await canonicalizeWithMissingTail(projectRoot);
  assert.equal(root.reason, null);
  return join(root.canonical, ".git");
}

async function stateListing(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { recursive: true })).map((entry) => entry.replaceAll("\\", "/")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function moveGitDirectory(fixture: TaskFixture): string {
  const moved = join(fixture.scratch, "moved.git");
  const result = gitCommand(fixture.projectRoot, ["init", "--separate-git-dir", moved]);
  assert.ok(result.ok, result.stderr);
  return moved;
}

test("preview names the git directory local-commit grants and writes nothing", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const before = await stateListing(fixture.stateRoot);
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  assert.deepEqual(preview.gitAuthority, {
    grant: "git-directory",
    gitDirectory: await canonicalGitDirectory(fixture.projectRoot),
    layout: "in-tree",
    reason: null,
  });
  assert.deepEqual(await stateListing(fixture.stateRoot), before);
});

test("preview of a project without .git grants no git directory and names the resolver reason", async (context) => {
  const fixture = await createTaskFixture(context);
  const bare = join(fixture.scratch, "no-git-project");
  await mkdir(bare, { recursive: true });
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(bare));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  assert.deepEqual(preview.gitAuthority, {
    grant: "none",
    gitDirectory: null,
    layout: "missing",
    reason: "the project root holds no .git, so there is no git directory to grant",
  });
});

test("approval records the canonical granted git directory and the record validates, with or without the field", async (context) => {
  const fixture = await createTaskFixture(context);
  await approveOriginal(fixture);
  const [approval] = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" });
  assert.ok(approval !== undefined);
  assert.equal(approval.gitDirectory, await canonicalGitDirectory(fixture.projectRoot));

  const schema = await taskSchema("task-receipt");
  const withField = validateManagedDocument({ text: JSON.stringify(approval), format: "json", kind: "task-receipt", schema });
  assert.equal(withField.ok, true, JSON.stringify(withField.issues));
  const { gitDirectory: _dropped, ...legacy } = approval;
  const withoutField = validateManagedDocument({ text: JSON.stringify(legacy), format: "json", kind: "task-receipt", schema });
  assert.equal(withoutField.ok, true, JSON.stringify(withoutField.issues));
  const nullField = validateManagedDocument({ text: JSON.stringify({ ...legacy, gitDirectory: null }), format: "json", kind: "task-receipt", schema });
  assert.equal(nullField.ok, true, JSON.stringify(nullField.issues));
});

test("a git directory moved after approval refuses the start as git-directory-changed before any run record exists", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approveOriginal(fixture);
  const approved = await canonicalGitDirectory(fixture.projectRoot);
  const moved = await realpath(moveGitDirectory(fixture));

  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot }),
    isCode("git-directory-changed", (message) => {
      assert.ok(message.includes(approved), message);
      assert.ok(message.includes(moved), message);
      assert.match(message, /increase revision to 2/u);
      assert.ok(message.includes("alpha-aos task preview"), message);
    }),
  );

  await assert.rejects(
    startFixtureTask(fixture, {
      ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
      expectedDigest: digest,
    }),
    (error: unknown) => {
      assert.ok(error instanceof TaskContractError || error instanceof TaskRunError, String(error));
      assert.equal(error.code, "git-directory-changed");
      return true;
    },
  );
  assert.deepEqual(await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" }), []);
});

test("an approval recorded before git-directory binding is refused as git-directory-changed for a grantable project", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approveOriginal(fixture);
  const directory = join(fixture.stateRoot, "tasks", "inventory-summary", "approvals");
  const [name] = (await readdir(directory)).filter((entry) => entry.endsWith(".json"));
  assert.ok(name !== undefined);
  const record = JSON.parse(await readFile(join(directory, name), "utf8")) as Record<string, unknown>;
  delete record.gitDirectory;
  await writeFile(join(directory, name), `${JSON.stringify(record, null, 2)}\n`, "utf8");

  const now = await canonicalGitDirectory(fixture.projectRoot);
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot }),
    isCode("git-directory-changed", (message) => {
      assert.ok(message.includes("none (approved before git-directory binding)"), message);
      assert.ok(message.includes(now), message);
    }),
  );
});

// ---------------------------------------------------------------------------
// Plan 21-03: Deterministic reserved runId and readReservedTaskRun (D-09, D-10)
// ---------------------------------------------------------------------------

test("reservedRunIdForApproval produces deterministic valid runId from contract digest", () => {
  const digest1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const digest2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  const runId1 = reservedRunIdForApproval({ contractDigest: digest1 });
  const runId1Repeat = reservedRunIdForApproval({ contractDigest: digest1 });
  const runId2 = reservedRunIdForApproval({ contractDigest: digest2 });

  // RUN_ID_PATTERN: ^[0-9a-z]{8,}-[0-9a-f]{8}$
  assert.match(runId1, /^[0-9a-z]{8,}-[0-9a-f]{8}$/u);
  assert.match(runId2, /^[0-9a-z]{8,}-[0-9a-f]{8}$/u);

  assert.equal(runId1, runId1Repeat);
  assert.notEqual(runId1, runId2);
});

test("readReservedTaskRun queries reserved state before start and refuses missing/tampered approvals", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approveOriginal(fixture);
  const reservedId = reservedRunIdForApproval({ contractDigest: digest });

  // 1. Before start: status is reserved, run record does not exist
  const reserved = await readReservedTaskRun({
    stateRoot: fixture.stateRoot,
    contractId: "inventory-summary",
    runId: reservedId,
  });
  assert.equal(reserved.status, "reserved");
  assert.equal(reserved.runId, reservedId);
  assert.equal(reserved.contractDigest, digest);
  assert.equal(reserved.contractId, "inventory-summary");
  assert.equal(reserved.run, undefined);

  // 2. Refuses query for non-existent runId or non-existent contractId
  const missing = await readReservedTaskRun({
    stateRoot: fixture.stateRoot,
    contractId: "inventory-summary",
    runId: "nonexistent-00000000",
  });
  assert.equal(missing.status, "refused");
  assert.ok(missing.reason?.includes("No approval record"));

  const otherContract = await readReservedTaskRun({
    stateRoot: fixture.stateRoot,
    contractId: "other-task",
    runId: reservedId,
  });
  assert.equal(otherContract.status, "refused");
});
