import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy, type ProcessResult } from "../src/core/process.js";
import { canonicalizeWithMissingTail } from "../src/core/path-boundary.js";
import { aliasPath, createPathAliases } from "../src/core/paths.js";
import { approveTaskContract, loadTaskContract, readTaskApprovals } from "../src/core/task-contract.js";
import { readCheckpoint, writeCheckpoint, type TaskCheckpoint } from "../src/core/task-journal.js";
import type { ControllerPort } from "../src/core/task-run.js";
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
  assert.ok(output.includes(`observed session ${run.reviewer?.sessionId ?? "missing"}`));

  const machine = await cli(fixture, ["report", "inventory-summary", "--run", run.runId, "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  // The JSON seam is the redacted envelope: session-named fields are withheld
  // by key, and everything else is the run record exactly as persisted.
  assert.ok(run.executor !== null && run.reviewer !== null);
  assert.deepEqual(JSON.parse(machine.stdout.excerpt), {
    ...run,
    gitDirectory: run.gitDirectory ? aliasPath(run.gitDirectory, createPathAliases({ projectRoot: fixture.scratch })) : null,
    executor: { ...run.executor, sessionId: "[redacted:value]" },
    reviewer: { ...run.reviewer, sessionId: "[redacted:value]" },
  });
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

test("an unknown task subcommand lists all valid subcommands", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const result = await cli(fixture, ["run", fixture.contractPath, "--contract-digest", digest]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /Use one of: plan, preview, approve, start, report, resume, status, stop, doctor, answer, final-review\./u);
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

// ---------------------------------------------------------------------------
// task start (AUTO-01, AUTO-03, CON-03, D-02)
//
// Every start test below either stops before any agent launch (a refusal) or
// is a readiness preview. Each one runs the CLI child with PATH set to an
// empty scratch directory, so no host codex or claude can be resolved — let
// alone launched — by this suite on any host.
// ---------------------------------------------------------------------------

async function emptyPath(fixture: TaskFixture): Promise<string> {
  const directory = join(fixture.scratch, "empty-path");
  await mkdir(directory, { recursive: true });
  return directory;
}

async function startCli(fixture: TaskFixture, args: readonly string[]): Promise<ProcessResult> {
  const path = await emptyPath(fixture);
  const environment = taskEnvironment(fixture.stateRoot);
  return runProcess({
    executable: process.execPath,
    args: [cliEntry, "task", "start", ...args],
    cwd: fixture.scratch,
    environment: { ...environment, literal: { ...environment.literal, PATH: path } },
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
}

function runDirectory(fixture: TaskFixture, contractId = "inventory-summary"): string {
  return join(fixture.stateRoot, "tasks", contractId, "runs");
}

async function approvedFixture(context: Parameters<typeof createTaskFixture>[0]): Promise<{ fixture: TaskFixture; digest: string }> {
  const { fixture, digest } = await contractFixture(context);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  return { fixture, digest };
}

test("task start without --apply prints the readiness of an approved contract and starts nothing", async (context) => {
  const { fixture, digest } = await approvedFixture(context);
  const before = await listing(fixture.stateRoot);

  const result = await startCli(fixture, [fixture.contractPath, "--contract-digest", digest]);
  const output = result.stdout.excerpt;
  assert.ok(output.includes(`Contract digest: ${digest}`), result.stderr.excerpt);
  assert.match(output, /Controller: codex /u);
  assert.match(output, /Executor: codex /u);
  assert.match(output, /Reviewer: claude /u);
  assert.match(output, /GSD quick: /u);
  assert.match(output, /Baseline: /u);
  assert.match(output, /Approval: approved/u);
  assert.match(output, /spend model turns under your own/u);
  assert.ok(output.includes(`alpha-aos task start`));
  assert.ok(output.includes(`--contract-digest ${digest} --apply`));
  assert.equal(result.exitCode, 2, "an unproven pair makes the readiness preview exit 2");

  assert.equal(existsSync(runDirectory(fixture)), false);
  assert.deepEqual(await listing(fixture.stateRoot), before);
});

test("task start readiness with no codex or claude on PATH reports both as missing proof and writes nothing", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const result = await startCli(fixture, [fixture.contractPath]);
  assert.equal(result.exitCode, 2);
  const output = result.stdout.excerpt;
  assert.match(output, /(?:controller |executor )?codex: (?:.*(was not found on PATH|could not be located on PATH)|no native invocation receipt)/u);
  assert.match(output, /(?:reviewer )?claude: (?:.*(was not found on PATH|could not be located on PATH)|no native invocation receipt)/u);
  assert.match(output, /Approval: not approved/u);
  assert.ok(output.includes(`--contract-digest ${digest} --apply`));
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("task start --apply without a digest names the current digest and the start command", async (context) => {
  const { fixture, digest } = await approvedFixture(context);
  const before = await listing(fixture.stateRoot);

  const result = await startCli(fixture, [fixture.contractPath, "--apply"]);
  assert.equal(result.exitCode, 2);
  assert.ok(result.stderr.excerpt.includes(digest));
  assert.match(result.stderr.excerpt, /alpha-aos task start /u);
  assert.ok(result.stderr.excerpt.includes(`--contract-digest ${digest} --apply`));
  assert.deepEqual(await listing(fixture.stateRoot), before);
});

test("task start --apply on an unapproved contract is refused as not-approved", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const result = await startCli(fixture, [fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /not-approved/u);
  assert.ok(result.stderr.excerpt.includes("alpha-aos task approve"));
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("task start --apply with an unproven reviewer is refused as unsupported-agent-pair and records no run", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(
    fixture.contractPath,
    inventorySummaryContract(fixture.projectRoot, {
      agentPolicy: { controller: "codex", executor: "codex", reviewer: "pi", reviewerSession: "fresh-read-only" },
    }),
  );
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const result = await startCli(fixture, [fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /unsupported-agent-pair/u);
  assert.match(result.stderr.excerpt, /(reviewer pi: no native task adapter is proven|no native invocation receipt for reviewer)/u);
  assert.equal(existsSync(runDirectory(fixture)), false);
});

test("task start --apply with a consumed approval is refused and a foreign digest starts nothing", async (context) => {
  const { fixture, digest } = await approvedFixture(context);
  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: digest,
  });
  assert.equal(run.status, "accepted");
  const runsBefore = await listing(runDirectory(fixture));

  const again = await startCli(fixture, [fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(again.exitCode, 2);
  assert.match(again.stderr.excerpt, /approval-consumed/u);
  assert.deepEqual(await listing(runDirectory(fixture)), runsBefore);

  const secondPath = join(fixture.scratch, "second-contract.json");
  await writeTaskContract(secondPath, inventorySummaryContract(fixture.projectRoot, { id: "inventory-report" }));
  const foreign = await startCli(fixture, [secondPath, "--contract-digest", digest, "--apply"]);
  assert.equal(foreign.exitCode, 2);
  assert.match(foreign.stderr.excerpt, /contract-drift/u);
  assert.equal(existsSync(join(fixture.stateRoot, "tasks", "inventory-report")), false);
  assert.deepEqual(await listing(runDirectory(fixture)), runsBefore);
});

test("task start with the old digest after the goal was edited names the changed field and the re-approval path", async (context) => {
  const { fixture, digest } = await approvedFixture(context);
  await writeTaskContract(
    fixture.contractPath,
    inventorySummaryContract(fixture.projectRoot, { goal: `${inventorySummaryContract(fixture.projectRoot).goal} Also print a trailing newline.` }),
  );
  const { digest: changed } = await loadTaskContract(fixture.contractPath);
  assert.notEqual(changed, digest);

  const result = await startCli(fixture, [fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /contract-drift/u);
  assert.match(result.stderr.excerpt, /\bgoal\b/u);
  assert.ok(result.stderr.excerpt.includes(changed));
  assert.ok(result.stderr.excerpt.includes("alpha-aos task approve"));
  assert.equal(existsSync(runDirectory(fixture)), false);
});

test("ordinary gsd-context, status and project plan commands never create a task run", async (context) => {
  const { fixture } = await approvedFixture(context);
  const environment = taskEnvironment(fixture.stateRoot);
  const path = await emptyPath(fixture);
  for (const argv of [["gsd-context", "quick", "--json"], ["status", "--json"], ["project", "plan", fixture.projectRoot, "--json"]]) {
    await runProcess({
      executable: process.execPath,
      args: [cliEntry, ...argv],
      cwd: fixture.scratch,
      environment: { ...environment, literal: { ...environment.literal, PATH: path } },
      maxOutputBytes: OUTPUT_BYTES,
      excerptBytes: OUTPUT_BYTES,
    });
  }
  assert.equal(existsSync(runDirectory(fixture)), false);
  assert.ok(!(await listing(fixture.stateRoot)).some((entry) => /^tasks\/[^/]+\/runs(\/|$)/u.test(entry)));
});

async function filesUnder(root: string, keep: (path: string) => boolean): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => entry.replaceAll("\\", "/")).filter(keep).sort();
}

test("startTask is called only by the task start branch and no shipped skill starts a task", async () => {
  const callers: string[] = [];
  for (const file of await filesUnder(join(repositoryRoot, "src"), (path) => path.endsWith(".ts"))) {
    if ((await readFile(join(repositoryRoot, "src", file), "utf8")).includes("startTask(")) callers.push(`src/${file}`);
  }
  assert.deepEqual(callers, ["src/cli.ts", "src/core/task-run.ts", "src/core/task-supervisor.ts"]);

  const skills = await filesUnder(join(repositoryRoot, "skills"), (path) => path.endsWith("SKILL.md"));
  assert.ok(skills.length > 0);
  for (const skill of skills) {
    assert.ok(!(await readFile(join(repositoryRoot, "skills", skill), "utf8")).includes("task start"), `skills/${skill} mentions task start`);
  }
});

test("task report shows consent, decisions, GSD evidence, changed paths, the executor claim and both reviewer sessions", async (context) => {
  const { fixture, digest } = await approvedFixture(context);
  const reference = referenceControllerPort("correct");
  const controller: ControllerPort = {
    async dispatch(request) {
      const result = await reference.dispatch(request);
      const path = join(request.projectRoot, ...request.decisionLogPath.split("/"));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        `${JSON.stringify({
          id: "d-1",
          at: "2026-09-30T00:00:00.000Z",
          category: "implementation",
          choice: "Parse the CSV line by line without a dependency.",
          rationale: "The contract forbids dependencies and the input is small.",
          criterionIds: ["valid-summary"],
          substitute: null,
        })}\n`,
        "utf8",
      );
      return result;
    },
  };
  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: digest,
  });
  assert.equal(run.status, "accepted");
  assert.ok(run.reviewer !== null && run.gsd !== null && run.effects !== null);

  const result = await cli(fixture, ["report", "inventory-summary"]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const output = result.stdout.excerpt;
  assert.match(output, /Status: ACCEPTED/u);
  assert.match(output, /^valid-summary\s+pass\s+pass \(exit 0\)\s+pass\s+/mu);
  assert.ok(output.includes("Consent: autopilot, single run of revision 1"));
  assert.ok(output.includes("Decisions:"));
  assert.ok(output.includes("implementation: Parse the CSV line by line without a dependency. — The contract forbids dependencies and the input is small."));
  assert.ok(output.includes(`GSD: verified (quick ${run.gsd.quickId ?? "missing"})`));
  assert.ok(output.includes("Changed paths:"));
  assert.ok(output.includes("bin/inventory-summary.mjs"));
  assert.match(output, /planning: .*\.planning\/STATE\.md/u);
  assert.match(output, /Executor claim \(not evidence\): completed, exit 0, terminal completed, codex fixture/u);
  assert.ok(output.includes(`requested session ${run.reviewer.requestedSessionId}`));
  assert.ok(output.includes(`observed session ${run.reviewer.sessionId ?? "missing"}`));
});

// ---------------------------------------------------------------------------
// Plan 14-07 Task 3: the preview names what local-commit grants (CON-01, D-03)
// ---------------------------------------------------------------------------

test("task preview names the git directory local-commit lets the controller write, in text and JSON", async (context) => {
  const { fixture } = await contractFixture(context);
  const root = await canonicalizeWithMissingTail(fixture.projectRoot);
  assert.equal(root.reason, null);
  const gitDirectory = join(root.canonical, ".git");

  const human = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  assert.ok(
    human.stdout.excerpt.includes(
      `Git authority (local-commit): the controller may write ${gitDirectory} for this run; its config, hooks and info stay read-only`,
    ),
    human.stdout.excerpt,
  );
  const lines = human.stdout.excerpt.split(/\r?\n/u);
  const effects = lines.findIndex((line) => line.startsWith("Allowed effect kinds:"));
  assert.ok(lines[effects + 1]?.startsWith("Git authority (local-commit): "), "the git authority line follows the effect kinds");

  const machine = await cli(fixture, ["preview", fixture.contractPath, "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  const envelope = JSON.parse(machine.stdout.excerpt) as {
    gitAuthority?: { grant: string; gitDirectory: string | null; layout: string; reason: string | null };
  };
  assert.ok(envelope.gitAuthority !== undefined, "the JSON envelope carries gitAuthority");
  assert.equal(envelope.gitAuthority.grant, "git-directory");
  assert.equal(envelope.gitAuthority.layout, "in-tree");
  assert.equal(envelope.gitAuthority.reason, null);
  assert.match(envelope.gitAuthority.gitDirectory ?? "", /inventory-summary[\\/]\.git$/u);
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

test("task preview of a project without .git names no git authority and the reason", async (context) => {
  const fixture = await createTaskFixture(context);
  const bare = join(fixture.scratch, "no-git-project");
  await mkdir(bare, { recursive: true });
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(bare));

  const human = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  assert.ok(
    human.stdout.excerpt.includes("Git authority (local-commit): none — the project root holds no .git, so there is no git directory to grant"),
    human.stdout.excerpt,
  );
  const machine = await cli(fixture, ["preview", fixture.contractPath, "--json"]);
  const envelope = JSON.parse(machine.stdout.excerpt) as { gitAuthority?: unknown };
  assert.deepEqual(envelope.gitAuthority, {
    grant: "none",
    gitDirectory: null,
    layout: "missing",
    reason: "the project root holds no .git, so there is no git directory to grant",
  });
});

// ---------------------------------------------------------------------------
// Plan 15-06: Task resume, status, and stop CLI subcommands
// ---------------------------------------------------------------------------

test("task resume preview shows readiness and returns exit code 2 when no checkpoint exists", async (context) => {
  const { fixture, digest } = await contractFixture(context);
  const result = await cli(fixture, ["resume", fixture.contractPath]);
  assert.equal(result.exitCode, 2);
  assert.ok(result.stdout.excerpt.includes(`Contract digest: ${digest}`));
  assert.ok(result.stdout.excerpt.includes("Readiness: not ready to resume"));
  assert.ok(result.stdout.excerpt.includes("No checkpoint found"));
});

test("task resume preview shows ready to resume when checkpoint and state are consistent", async (context) => {
  const { fixture, digest } = await contractFixture(context);
  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  const result = await cli(fixture, ["resume", fixture.contractPath]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  assert.ok(result.stdout.excerpt.includes("Readiness: ready to resume"));
  assert.ok(result.stdout.excerpt.includes("alpha-aos task resume"));
});

test("task status prints checkpoint and effect summary", async (context) => {
  const { fixture, digest } = await contractFixture(context);
  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 2,
    lastSequence: 3,
    lastVerifiedHead: "abc1234",
    usage: { cycles: 2, wallTimeMs: 5000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  const human = await cli(fixture, ["status", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  assert.ok(human.stdout.excerpt.includes("Task: inventory-summary"));
  assert.ok(human.stdout.excerpt.includes("Status: running"));
  assert.ok(human.stdout.excerpt.includes("Cycle: 2"));
  assert.ok(human.stdout.excerpt.includes("Attempt: 2"));

  const machine = await cli(fixture, ["status", "inventory-summary", "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  const data = JSON.parse(machine.stdout.excerpt) as { checkpoint: TaskCheckpoint };
  assert.equal(data.checkpoint.contractId, "inventory-summary");
  assert.equal(data.checkpoint.attemptIndex, 2);
});

test("task stop sets stopped status on checkpoint and records limit_exceeded event", async (context) => {
  const { fixture, digest } = await contractFixture(context);
  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  const stopResult = await cli(fixture, ["stop", "inventory-summary", "--reason", "operator_halt"]);
  assert.equal(stopResult.exitCode, 0, stopResult.stderr.excerpt);
  assert.ok(stopResult.stdout.excerpt.includes("stopped: operator_halt"));

  const updated = await readCheckpoint(fixture.stateRoot, digest);
  assert.ok(updated !== null);
  assert.equal(updated.status, "stopped");
  assert.equal(updated.stopReason, "operator_halt");
});

// ---------------------------------------------------------------------------
// Plan 21-02: Contract preview fidelity, ordering, diffs, and blocked preview
// ---------------------------------------------------------------------------

test("task preview places goal, criteria and allowed effects before agents and resource limits (D-05)", async (context) => {
  const { fixture } = await contractFixture(context);
  const result = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const out = result.stdout.excerpt;

  const goalIndex = out.indexOf("Goal:");
  const criteriaIndex = out.indexOf("Mandatory criteria:");
  const rootsIndex = out.indexOf("Allowed roots:");
  const effectsIndex = out.indexOf("Allowed effect kinds:");
  const agentsIndex = out.indexOf("Agents:");
  const wallTimeIndex = out.indexOf("Wall-time limit:");
  const approvalIndex = out.indexOf("Approval:");

  assert.ok(goalIndex !== -1 && criteriaIndex !== -1 && rootsIndex !== -1 && effectsIndex !== -1);
  assert.ok(agentsIndex !== -1 && wallTimeIndex !== -1 && approvalIndex !== -1);

  // Goal, criteria, roots and effects must precede agents and resource limits
  assert.ok(goalIndex < criteriaIndex);
  assert.ok(criteriaIndex < rootsIndex);
  assert.ok(rootsIndex < effectsIndex);
  assert.ok(effectsIndex < agentsIndex);
  assert.ok(agentsIndex < wallTimeIndex);
  assert.ok(wallTimeIndex < approvalIndex);

  // Limits without configuration must state no limit without invented numbers
  assert.ok(out.includes("Cycles limit: no limit"));
  assert.ok(out.includes("Tokens limit: no limit"));
  assert.ok(out.includes("Cost limit: no limit"));
});

test("task preview shows changed fields diff when previewing a contract after prior revision was approved (D-06, D-09)", async (context) => {
  const { fixture, digest: digest1 } = await contractFixture(context);

  // 1. Approve initial contract revision 1
  const approveResult = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest1, "--apply"]);
  assert.equal(approveResult.exitCode, 0, approveResult.stderr.excerpt);

  // 2. Modify contract: change goal, bump revision to 2
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.revision = 2;
  contract.goal = "Refactored inventory summary implementation";
  await writeTaskContract(fixture.contractPath, contract);
  const { digest: digest2 } = await loadTaskContract(fixture.contractPath);
  assert.notEqual(digest1, digest2);

  // 3. Preview modified contract
  const previewResult = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(previewResult.exitCode, 0, previewResult.stderr.excerpt);
  const out = previewResult.stdout.excerpt;

  // Full modified contract is visible
  assert.ok(out.includes("Task: inventory-summary (revision 2)"));
  assert.ok(out.includes(`Contract digest: ${digest2}`));
  assert.ok(out.includes("Goal: Refactored inventory summary implementation"));
  assert.ok(out.includes("Mandatory criteria:"));

  // Changed contract fields diff is displayed
  assert.ok(out.includes("Changed contract fields from previous approved revision:"));
  assert.ok(out.includes("- goal"));
  assert.ok(out.includes("- revision"));

  // Stale approval cannot be used for new contract
  const staleApprove = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest1, "--apply"]);
  assert.equal(staleApprove.exitCode, 2);
  assert.match(staleApprove.stderr.excerpt, /contract-drift/u);
});

test("task preview renders full contract and blocked reasons when telemetry meter is missing (D-07, D-08)", async (context) => {
  const { fixture } = await contractFixture(context);

  // Contract requiring cost telemetry but controller is pi (unmetered)
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.agentPolicy.controller = "pi";
  contract.resourcePolicy.maxCostUsd = 10.0;
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);

  // 1. Preview still shows full contract and blocked reasons
  const previewResult = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(previewResult.exitCode, 0, previewResult.stderr.excerpt);
  const out = previewResult.stdout.excerpt;

  assert.ok(out.includes("Blocked: task prerequisites not satisfied"));
  assert.ok(out.includes("MISSING_TELEMETRY_METER"));
  assert.ok(out.includes("Next actions:"));
  assert.ok(out.includes("Goal: Implement a Node ESM program at bin/inventory-summary.mjs"));
  assert.ok(out.includes("Mandatory criteria:"));
  assert.ok(out.includes("Telemetry: unmetered"));

  // JSON preview includes status: blocked and full contract
  const jsonResult = await cli(fixture, ["preview", fixture.contractPath, "--json"]);
  assert.equal(jsonResult.exitCode, 0, jsonResult.stderr.excerpt);
  const jsonEnvelope = JSON.parse(jsonResult.stdout.excerpt) as {
    status: string;
    blockedReasons: string[];
    contract: { id: string; goal: string };
  };
  assert.equal(jsonEnvelope.status, "blocked");
  assert.ok(Array.isArray(jsonEnvelope.blockedReasons));
  assert.ok(jsonEnvelope.blockedReasons.some((r) => r.includes("MISSING_TELEMETRY_METER")));
  assert.equal(jsonEnvelope.contract.id, "inventory-summary");

  // 2. Approve --apply fails closed
  const approveResult = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(approveResult.exitCode, 2);
  assert.match(approveResult.stderr.excerpt, /MISSING_TELEMETRY_METER/u);
});

// ---------------------------------------------------------------------------
// Plan 21-03: Consistent runId, copyable commands, and status/stop/resume (D-10)
// ---------------------------------------------------------------------------

test("task approval and start receipts present matching runId, contract location, and copyable commands (D-10)", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  // 1. Approval outputs contract path, reserved run ID, and copyable control commands
  const approveHuman = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(approveHuman.exitCode, 0, approveHuman.stderr.excerpt);
  const approveOut = approveHuman.stdout.excerpt;

  assert.ok(approveOut.includes("Task: inventory-summary"));
  assert.ok(approveOut.includes(`Contract file: ${fixture.contractPath}`));
  assert.ok(approveOut.includes("Reserved run ID:"));
  assert.ok(approveOut.includes(`Contract digest: ${digest}`));
  assert.ok(approveOut.includes("Operator control commands (durable across chat sessions):"));
  assert.ok(approveOut.includes("Status: alpha-aos task status inventory-summary --run"));
  assert.ok(approveOut.includes("Stop:   alpha-aos task stop inventory-summary --run"));
  assert.ok(approveOut.includes("Resume: alpha-aos task resume"));
  assert.ok(approveOut.includes(`--contract-digest ${digest} --apply`));

  const approveJson = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest, "--apply", "--json"]);
  assert.equal(approveJson.exitCode, 0, approveJson.stderr.excerpt);
  const approveData = JSON.parse(approveJson.stdout.excerpt) as {
    contractId: string;
    contractPath: string;
    contractDigest: string;
    reservedRunId: string;
    startCommand: string;
    statusCommand: string;
    stopCommand: string;
    resumeCommand: string;
  };
  assert.equal(approveData.contractId, "inventory-summary");
  assert.ok(approveData.contractPath.endsWith("contract.json"));
  assert.equal(approveData.contractDigest, digest);
  assert.ok(approveData.reservedRunId.length > 0);
  assert.ok(approveData.statusCommand.includes(approveData.reservedRunId));
  assert.ok(approveData.stopCommand.includes(approveData.reservedRunId));

  // 2. Start presents matching real run ID identical to reserved run ID
  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: digest,
    runId: approveData.reservedRunId,
  });
  assert.equal(run.runId, approveData.reservedRunId);
  assert.equal(run.contractId, "inventory-summary");
  assert.equal(run.contractDigest, digest);

  // 3. New CLI process can query report using the copied command
  const reportResult = await cli(fixture, ["report", "inventory-summary", "--run", run.runId]);
  assert.equal(reportResult.exitCode, 0, reportResult.stderr.excerpt);
  assert.ok(reportResult.stdout.excerpt.includes(`Run: ${run.runId}`));
});
