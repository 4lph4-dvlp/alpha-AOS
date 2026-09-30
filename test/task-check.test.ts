import assert from "node:assert/strict";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { TaskContract, TaskCriterion } from "../src/core/task-contract.js";
import {
  collectTaskArtifact,
  confirmReviewerReproduction,
  materializeTaskSnapshot,
  measureTaskCriterion,
  selectMeasurementSubstitutes,
  TASK_ARTIFACT_LIMITS,
  type TaskArtifactManifest,
  type TaskDecision,
  type TaskMeasurementSubstitute,
} from "../src/core/task-check.js";
import type { TaskMeasurement } from "../src/core/task-run.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  writeInventorySummaryImplementation,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const HANG_PROGRAM = "setTimeout(() => undefined, 60_000);\n";
const FLOOD_PROGRAM = "process.stdout.write(\"x\".repeat(100 * 1024));\n";
const THREE_ROWS = "sku,qty\nC-1,1\nC-2,2\nC-3,3\n";

function criterionOf(contract: TaskContract, id: string): TaskCriterion {
  const found = contract.criterion.find((criterion) => criterion.id === id);
  assert.ok(found !== undefined, `the contract names criterion ${id}`);
  return found;
}

function withEntry(criterion: TaskCriterion, entry: string): TaskCriterion {
  return { ...criterion, measurement: { ...criterion.measurement, entry } };
}

function requireManifest(collection: Awaited<ReturnType<typeof collectTaskArtifact>>): TaskArtifactManifest {
  assert.equal(collection.status, "ok", collection.status === "unavailable" ? collection.detail : "");
  return collection as TaskArtifactManifest;
}

async function snapshotOf(fixture: TaskFixture, allowedRoots: readonly string[]) {
  const manifest = requireManifest(await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots }));
  const scratchRoot = join(fixture.scratch, "run");
  await mkdir(scratchRoot, { recursive: true });
  const root = await materializeTaskSnapshot({
    manifest,
    projectRoot: fixture.projectRoot,
    destination: join(scratchRoot, "snapshot"),
  });
  return { manifest, scratchRoot, root };
}

async function measure(
  fixture: TaskFixture,
  criterion: TaskCriterion,
  options: { substitute?: TaskMeasurementSubstitute | null; timeoutMs?: number } = {},
): Promise<TaskMeasurement> {
  const contract = inventorySummaryContract(fixture.projectRoot);
  const { scratchRoot, root } = await snapshotOf(fixture, contract.allowedRoots);
  return await measureTaskCriterion({
    criterion,
    root,
    scratchRoot,
    allowedRoots: contract.allowedRoots,
    substitute: options.substitute ?? null,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
}

async function writeProgram(fixture: TaskFixture, name: string, source: string): Promise<void> {
  await mkdir(join(fixture.projectRoot, "bin"), { recursive: true });
  await writeFile(join(fixture.projectRoot, "bin", name), source, "utf8");
}

function decision(overrides: Partial<TaskDecision>): TaskDecision {
  return {
    id: "d-1",
    at: "2026-09-30T00:00:00.000Z",
    category: "measurement-substitute",
    choice: "Measure valid-summary through bin/summary.mjs.",
    rationale: "The program was written under a different file name.",
    criterionIds: ["valid-summary"],
    substitute: { criterionId: "valid-summary", entry: "bin/summary.mjs" },
    ...overrides,
  };
}

async function fixtureWithImplementation(context: TestContext, variant: "correct" | "off-by-one") {
  const fixture = await createTaskFixture(context);
  await writeInventorySummaryImplementation(fixture.projectRoot, variant);
  return fixture;
}

test("the artifact manifest lists the allowed files in sorted order, skips managed directories and is stable", async (context) => {
  const fixture = await fixtureWithImplementation(context, "correct");
  const { allowedRoots } = inventorySummaryContract(fixture.projectRoot);
  await mkdir(join(fixture.projectRoot, "bin", "node_modules"), { recursive: true });
  await writeFile(join(fixture.projectRoot, "bin", "node_modules", "dep.js"), "export {};\n", "utf8");
  await mkdir(join(fixture.projectRoot, "bin", ".alpha-aos"), { recursive: true });
  await writeFile(join(fixture.projectRoot, "bin", ".alpha-aos", "note.txt"), "managed\n", "utf8");

  const first = requireManifest(await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots }));
  const second = requireManifest(await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots }));
  assert.deepEqual(
    first.files.map((file) => file.path),
    ["README.md", "bin/inventory-summary.mjs", "package.json"],
  );
  assert.equal(first.fileCount, 3);
  assert.equal(first.totalBytes, first.files.reduce((sum, file) => sum + file.bytes, 0));
  for (const file of first.files) assert.match(file.sha256, /^[0-9a-f]{64}$/u);
  assert.match(first.digest, /^[0-9a-f]{64}$/u);
  assert.equal(second.digest, first.digest);

  const whole = requireManifest(await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots: ["."] }));
  for (const file of whole.files) {
    assert.ok(
      !file.path.split("/").some((segment) => [".git", ".planning", ".alpha-aos", "node_modules"].includes(segment)),
      `${file.path} is not part of the artifact`,
    );
  }
  assert.ok(whole.files.some((file) => file.path === ".gitignore"));
});

test("an untracked file under an allowed root moves the digest and a planning edit does not", async (context) => {
  const fixture = await fixtureWithImplementation(context, "correct");
  const { allowedRoots } = inventorySummaryContract(fixture.projectRoot);
  const before = requireManifest(await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots }));

  await writeFile(join(fixture.projectRoot, ".planning", "STATE.md"), "# State\n\nTouched.\n", "utf8");
  const planningTouched = requireManifest(await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots }));
  assert.equal(planningTouched.digest, before.digest);

  await writeFile(join(fixture.projectRoot, "bin", "untracked.mjs"), "export {};\n", "utf8");
  const untracked = requireManifest(await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots }));
  assert.notEqual(untracked.digest, before.digest);
  assert.ok(untracked.files.some((file) => file.path === "bin/untracked.mjs"));
});

test("a symbolic link inside an allowed root makes the artifact unavailable as artifact-link", async (context) => {
  const fixture = await fixtureWithImplementation(context, "correct");
  const { allowedRoots } = inventorySummaryContract(fixture.projectRoot);
  // A file link needs a privilege Windows withholds by default; a directory
  // junction does not, and lstat reports both as links.
  let linkName = "readme-link.md";
  try {
    await symlink(join(fixture.projectRoot, "README.md"), join(fixture.projectRoot, "bin", linkName), "file");
  } catch (fileError) {
    linkName = "linked-dir";
    await mkdir(join(fixture.scratch, "elsewhere"), { recursive: true });
    try {
      await symlink(join(fixture.scratch, "elsewhere"), join(fixture.projectRoot, "bin", linkName), "junction");
    } catch (junctionError) {
      const codes = [fileError, junctionError].map((error) => (error as NodeJS.ErrnoException).code ?? "unknown");
      context.skip(`this host cannot create symbolic links (${codes.join(", ")})`);
      return;
    }
  }
  const collection = await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots });
  assert.equal(collection.status, "unavailable");
  assert.ok(collection.status === "unavailable");
  assert.equal(collection.cause, "artifact-link");
  assert.ok(collection.detail.includes(`bin/${linkName}`), collection.detail);
});

test("more files than the artifact bound makes the artifact unavailable as artifact-too-large", async (context) => {
  const fixture = await createTaskFixture(context);
  const directory = join(fixture.projectRoot, "src", "generated");
  await mkdir(directory, { recursive: true });
  for (let index = 0; index <= TASK_ARTIFACT_LIMITS.maxFiles; index += 1) {
    await writeFile(join(directory, `f${index}.txt`), "x", "utf8");
  }
  const collection = await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots: ["src"] });
  assert.equal(collection.status, "unavailable");
  assert.ok(collection.status === "unavailable");
  assert.equal(collection.cause, "artifact-too-large");
  assert.match(collection.detail, new RegExp(String(TASK_ARTIFACT_LIMITS.maxFiles), "u"));
});

test("more bytes than the artifact bound makes the artifact unavailable as artifact-too-large", async (context) => {
  const fixture = await createTaskFixture(context);
  await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
  await writeFile(join(fixture.projectRoot, "src", "big.bin"), Buffer.alloc(TASK_ARTIFACT_LIMITS.maxTotalBytes + 1));
  const collection = await collectTaskArtifact({ projectRoot: fixture.projectRoot, allowedRoots: ["src"] });
  assert.equal(collection.status, "unavailable");
  assert.ok(collection.status === "unavailable");
  assert.equal(collection.cause, "artifact-too-large");
});

test("the snapshot holds exactly the manifest files and re-collects to the same digest", async (context) => {
  const fixture = await fixtureWithImplementation(context, "correct");
  const { allowedRoots } = inventorySummaryContract(fixture.projectRoot);
  const { manifest, root, scratchRoot } = await snapshotOf(fixture, allowedRoots);

  const again = requireManifest(await collectTaskArtifact({ projectRoot: root, allowedRoots }));
  assert.equal(again.digest, manifest.digest);
  assert.deepEqual(again.files, manifest.files);
  const whole = requireManifest(await collectTaskArtifact({ projectRoot: root, allowedRoots: ["."] }));
  assert.deepEqual(
    whole.files.map((file) => file.path),
    manifest.files.map((file) => file.path),
  );
  assert.equal(
    await readFile(join(root, "bin", "inventory-summary.mjs"), "utf8"),
    await readFile(join(fixture.projectRoot, "bin", "inventory-summary.mjs"), "utf8"),
  );
  await assert.rejects(
    materializeTaskSnapshot({ manifest, projectRoot: fixture.projectRoot, destination: join(scratchRoot, "snapshot") }),
    (error: unknown) => (error as NodeJS.ErrnoException).code === "EEXIST",
  );
});

test("the correct implementation passes both criteria when measured on the snapshot", async (context) => {
  const fixture = await fixtureWithImplementation(context, "correct");
  const contract = inventorySummaryContract(fixture.projectRoot);
  const { scratchRoot, root } = await snapshotOf(fixture, contract.allowedRoots);
  for (const criterion of contract.criterion) {
    const measured = await measureTaskCriterion({
      criterion,
      root,
      scratchRoot,
      allowedRoots: contract.allowedRoots,
      substitute: null,
    });
    assert.equal(measured.outcome, "pass", `${criterion.id}: ${measured.detail}`);
    assert.equal(measured.cause, "none");
    assert.equal(measured.measuredBy, "contract");
    assert.equal(measured.substituteDecisionId, null);
    assert.equal(measured.exitCode, criterion.measurement.expect.exitCode);
    assert.match(measured.stdoutSha256 ?? "", /^[0-9a-f]{64}$/u);
  }
});

test("the off-by-one implementation fails valid-summary with a detail naming totalQuantity", async (context) => {
  const fixture = await fixtureWithImplementation(context, "off-by-one");
  const contract = inventorySummaryContract(fixture.projectRoot);
  const measured = await measure(fixture, criterionOf(contract, "valid-summary"));
  assert.equal(measured.outcome, "fail");
  assert.equal(measured.cause, "none");
  assert.match(measured.detail, /totalQuantity/u);
  assert.match(measured.detail, /stdout/u);
  assert.ok(measured.detail.length < 300);
});

test("a missing entry is unavailable with cause entry-missing", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const measured = await measure(fixture, criterionOf(contract, "valid-summary"));
  assert.equal(measured.outcome, "unavailable");
  assert.equal(measured.cause, "entry-missing");
  assert.equal(measured.measuredBy, "contract");
  assert.equal(measured.exitCode, null);
});

test("a program that outlives the measurement bound is unavailable with cause timeout", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeProgram(fixture, "hang.mjs", HANG_PROGRAM);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const started = Date.now();
  const measured = await measure(fixture, withEntry(criterionOf(contract, "valid-summary"), "bin/hang.mjs"), {
    timeoutMs: 2000,
  });
  assert.equal(measured.outcome, "unavailable");
  assert.equal(measured.cause, "timeout");
  assert.ok(Date.now() - started < 30_000, "the 2 s bound was honored");
});

test("a program printing more than 64 KiB is unavailable with cause output-capped", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeProgram(fixture, "flood.mjs", FLOOD_PROGRAM);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const measured = await measure(fixture, withEntry(criterionOf(contract, "valid-summary"), "bin/flood.mjs"));
  assert.equal(measured.outcome, "unavailable");
  assert.equal(measured.cause, "output-capped");
});

test("a substitute entry measures a missing-entry criterion with the contract's expectations", async (context) => {
  const fixture = await fixtureWithImplementation(context, "off-by-one");
  const source = await readFile(join(fixture.projectRoot, "bin", "inventory-summary.mjs"), "utf8");
  await writeProgram(fixture, "summary.mjs", source);
  await rm(join(fixture.projectRoot, "bin", "inventory-summary.mjs"));
  const contract = inventorySummaryContract(fixture.projectRoot);
  const substitute = { decisionId: "d-7", criterionId: "valid-summary", entry: "bin/summary.mjs" };

  const measured = await measure(fixture, criterionOf(contract, "valid-summary"), { substitute });
  assert.equal(measured.measuredBy, "substitute");
  assert.equal(measured.substituteDecisionId, "d-7");
  assert.equal(measured.outcome, "fail", "the contract's expected output still decides the outcome");
  assert.match(measured.detail, /totalQuantity/u);
});

test("a substitute outside the allowed roots or for a present contract entry is ignored", async (context) => {
  const fixture = await fixtureWithImplementation(context, "correct");
  const contract = inventorySummaryContract(fixture.projectRoot);
  const criterion = criterionOf(contract, "valid-summary");
  const { scratchRoot, root } = await snapshotOf(fixture, contract.allowedRoots);
  await writeFile(join(scratchRoot, "outside.mjs"), "process.stdout.write('{}');\n", "utf8");
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "scripts", "summary.mjs"), "process.stdout.write('{}');\n", "utf8");

  const present = await measureTaskCriterion({
    criterion,
    root,
    scratchRoot,
    allowedRoots: contract.allowedRoots,
    substitute: { decisionId: "d-1", criterionId: "valid-summary", entry: "scripts/summary.mjs" },
  });
  assert.equal(present.measuredBy, "contract");
  assert.equal(present.substituteDecisionId, null);
  assert.equal(present.outcome, "pass");

  const missing = withEntry(criterion, "bin/not-written.mjs");
  for (const entry of ["../outside.mjs", "scripts/summary.mjs"]) {
    const measured = await measureTaskCriterion({
      criterion: missing,
      root,
      scratchRoot,
      allowedRoots: contract.allowedRoots,
      substitute: { decisionId: "d-2", criterionId: "valid-summary", entry },
    });
    assert.equal(measured.outcome, "unavailable", entry);
    assert.equal(measured.cause, "entry-missing", entry);
    assert.equal(measured.measuredBy, "contract", entry);
    assert.equal(measured.substituteDecisionId, null, entry);
  }
});

test("substitutes come only from measurement-substitute decisions naming a contract criterion, first one wins", () => {
  const contract = inventorySummaryContract("project");
  const selected = selectMeasurementSubstitutes(
    [
      decision({ id: "d-0", category: "implementation" }),
      decision({ id: "d-1", substitute: { criterionId: "no-such-criterion", entry: "bin/x.mjs" } }),
      decision({ id: "d-2", substitute: null }),
      decision({ id: "d-3", substitute: { criterionId: "valid-summary", entry: "./bin\\summary.mjs" } }),
      decision({ id: "d-4", substitute: { criterionId: "valid-summary", entry: "bin/other.mjs" } }),
      decision({ id: "d-5", substitute: { criterionId: "invalid-quantity", entry: "bin/errors.mjs/" } }),
    ],
    contract,
  );
  assert.deepEqual(selected, [
    { decisionId: "d-3", criterionId: "valid-summary", entry: "bin/summary.mjs" },
    { decisionId: "d-5", criterionId: "invalid-quantity", entry: "bin/errors.mjs" },
  ]);
  for (const entry of selected) assert.deepEqual(Object.keys(entry).sort(), ["criterionId", "decisionId", "entry"]);
});

test("a reviewer reproduction is confirmed only when the contract entry really prints what was observed", async (context) => {
  const fixture = await fixtureWithImplementation(context, "off-by-one");
  const contract = inventorySummaryContract(fixture.projectRoot);
  const criterion = criterionOf(contract, "valid-summary");
  const { scratchRoot, root } = await snapshotOf(fixture, contract.allowedRoots);

  const real = await confirmReviewerReproduction({
    criterion,
    root,
    scratchRoot,
    reproduction: {
      inputText: THREE_ROWS,
      observedExitCode: 0,
      observedStdout: "{\"skus\":{\"C-1\":1,\"C-2\":2,\"C-3\":3},\"rows\":3,\"totalQuantity\":7}\n",
    },
  });
  assert.equal(real.confirmed, true, real.detail);

  const fabricated = await confirmReviewerReproduction({
    criterion,
    root,
    scratchRoot,
    reproduction: {
      inputText: THREE_ROWS,
      observedExitCode: 0,
      observedStdout: "{\"rows\":3,\"totalQuantity\":99,\"skus\":{\"C-1\":1,\"C-2\":2,\"C-3\":3}}",
    },
  });
  assert.equal(fabricated.confirmed, false);
  assert.ok(fabricated.detail.length > 0);

  const wrongExit = await confirmReviewerReproduction({
    criterion,
    root,
    scratchRoot,
    reproduction: { inputText: THREE_ROWS, observedExitCode: 2, observedStdout: "" },
  });
  assert.equal(wrongExit.confirmed, false);
});
