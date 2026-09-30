import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy, type ProcessResult } from "../src/core/process.js";
import { approveTaskContract, loadTaskContract, readTaskApprovals } from "../src/core/task-contract.js";
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

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const probeEnv = commandProbeEnvironment({ source: process.env });
const OUTPUT_BYTES = 256 * 1024;

// The CLI child never inherits the parent's ALPHA_AOS_STATE_DIR because the
// probe policy does not list it, so a declared literal is the only route that
// keeps task records in the fixture's scratch state root instead of the host's.
function taskEnvironment(stateRoot: string): EnvironmentPolicy {
  return { ...probeEnv, literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: stateRoot } };
}

async function cli(fixture: TaskFixture, args: readonly string[]): Promise<ProcessResult> {
  return runProcess({
    executable: process.execPath,
    args: [cliEntry, "task", ...args],
    cwd: fixture.scratch,
    environment: taskEnvironment(fixture.stateRoot),
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
}

async function listing(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true });
    return entries.map((entry) => entry.replaceAll("\\", "/")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function contractFixture(context: Parameters<typeof createTaskFixture>[0]): Promise<{ fixture: TaskFixture; digest: string }> {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await loadTaskContract(fixture.contractPath);
  return { fixture, digest };
}

test("task preview prints the reviewable contract and writes nothing", async (context) => {
  const { fixture, digest } = await contractFixture(context);
  const before = await listing(fixture.stateRoot);

  const result = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const output = result.stdout.excerpt;
  assert.ok(output.includes(`Contract digest: ${digest}`));
  assert.ok(output.includes("Goal: Implement a Node ESM program at bin/inventory-summary.mjs"));
  assert.match(output, /Project root: .*inventory-summary/u);
  assert.ok(output.includes("Allowed roots: README.md, bin, package.json, src, test"));
  assert.ok(output.includes("Allowed effect kinds: local-commit, workspace-write"));
  assert.ok(output.includes("invalid-quantity: An invalid quantity is reported with its line"));
  assert.ok(output.includes("valid-summary: A valid inventory is summarized"));
  assert.ok(output.includes("controller codex, executor codex, reviewer claude"));
  assert.ok(output.includes("Wall-time limit: 60 minutes"));
  assert.match(output, /single run of this revision only/u);
  assert.ok(output.includes(`--contract-digest ${digest} --apply`));

  assert.deepEqual(await listing(fixture.stateRoot), before);
  assert.ok(!(await listing(fixture.stateRoot)).some((entry) => entry === "tasks" || entry.startsWith("tasks/")));
});

test("task preview --json prints a redacted envelope whose digest matches the human output", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const human = await cli(fixture, ["preview", fixture.contractPath]);
  const machine = await cli(fixture, ["preview", fixture.contractPath, "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  const envelope = JSON.parse(machine.stdout.excerpt) as { digest: string; applied: boolean; approved: boolean };
  const shown = /Contract digest: ([0-9a-f]{64})/u.exec(human.stdout.excerpt)?.[1];
  assert.equal(envelope.digest, shown);
  assert.equal(envelope.digest, digest);
  assert.equal(envelope.applied, false);
  assert.equal(envelope.approved, false);
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("task approve without --apply previews and writes nothing", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const result = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  assert.ok(result.stdout.excerpt.includes(`Contract digest: ${digest}`));
  assert.ok(result.stdout.excerpt.includes(`alpha-aos task approve`));
  assert.ok(result.stdout.excerpt.includes(`--contract-digest ${digest} --apply`));
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("task approve --apply without a digest names the current digest and the command", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const result = await cli(fixture, ["approve", fixture.contractPath, "--apply"]);
  assert.equal(result.exitCode, 2);
  assert.ok(result.stderr.excerpt.includes(digest));
  assert.ok(result.stderr.excerpt.includes(`--contract-digest ${digest} --apply`));
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("task approve with a digest that is not the current digest is refused", async (context) => {
  const { fixture, digest } = await contractFixture(context);
  const wrong = digest.startsWith("f") ? "e".repeat(64) : "f".repeat(64);

  const result = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", wrong, "--apply"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /contract-drift/u);
  assert.ok(result.stderr.excerpt.includes(digest));
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("task approve with the current digest records one approval and repeats as already-approved", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const first = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(first.exitCode, 0, first.stderr.excerpt);
  assert.match(first.stdout.excerpt, /Approved for a single run/u);
  const approvals = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" });
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0]?.contractDigest, digest);

  const second = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest, "--apply", "--json"]);
  assert.equal(second.exitCode, 0, second.stderr.excerpt);
  assert.equal((JSON.parse(second.stdout.excerpt) as { status: string }).status, "already-approved");
  assert.equal((await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" })).length, 1);
});

test("task report prints one verdict row per criterion from the recorded run", async (context) => {
  const { fixture, digest } = await contractFixture(context);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: referenceControllerPort("off-by-one"), reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: digest,
  });
  const artifact = run.artifact?.digest.slice(0, 12) ?? "";
  assert.equal(artifact.length, 12);
  const before = await listing(fixture.stateRoot);

  const human = await cli(fixture, ["report", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  const output = human.stdout.excerpt;
  assert.match(output, /Status: REJECTED/u);
  assert.ok(output.includes(`Run: ${run.runId}`));
  const rows = output.split("\n").filter((line) => /^(valid-summary|invalid-quantity)\s/u.test(line));
  assert.equal(rows.length, 2);
  const valid = rows.find((line) => line.startsWith("valid-summary")) ?? "";
  assert.match(valid, /^valid-summary\s+fail\s+fail \(exit 0\)\s+pass\s+/u);
  assert.ok(valid.includes(artifact));
  assert.match(valid, /stdout JSON differs/u);
  const invalid = rows.find((line) => line.startsWith("invalid-quantity")) ?? "";
  assert.match(invalid, /^invalid-quantity\s+pass\s+pass \(exit 2\)\s+pass\s+/u);
  assert.match(output, /Next action: /u);
  assert.match(output, /Executor claim \(not evidence\): completed, exit 0/u);
  assert.ok(output.includes(`Reviewer session: ${run.reviewer?.sessionId ?? "missing"}`));

  const machine = await cli(fixture, ["report", "inventory-summary", "--run", run.runId, "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  assert.deepEqual(JSON.parse(machine.stdout.excerpt), run);
  assert.deepEqual(await listing(fixture.stateRoot), before);

  const missing = await cli(fixture, ["report", "no-such-task"]);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stderr.excerpt, /no run recorded for task no-such-task/u);
});

test("task preview --apply and task report --apply are refused because they persist nothing", async (context) => {
  const { fixture } = await contractFixture(context);

  const preview = await cli(fixture, ["preview", fixture.contractPath, "--apply"]);
  assert.equal(preview.exitCode, 2);
  assert.match(preview.stderr.excerpt, /previews and persists nothing/u);
  const report = await cli(fixture, ["report", "inventory-summary", "--apply"]);
  assert.equal(report.exitCode, 2);
  assert.match(report.stderr.excerpt, /reads and persists nothing/u);
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("an unknown task subcommand lists exactly preview, approve and report", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const result = await cli(fixture, ["start", fixture.contractPath, "--contract-digest", digest]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /Use one of: preview, approve, report\./u);
  assert.deepEqual(await listing(fixture.stateRoot), []);
});
