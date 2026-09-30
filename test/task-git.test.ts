import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { canonicalizeWithMissingTail } from "../src/core/path-boundary.js";
import { approveTaskContract, previewTaskContract } from "../src/core/task-contract.js";
import { grantedGitDirectory, resolveTaskGitDirectory, TASK_GIT_POINTER_MAX_BYTES, type TaskGitDirectory } from "../src/core/task-git.js";
import type { ControllerDispatchRequest, ControllerPort } from "../src/core/task-run.js";
import { gitCommand } from "./helpers/git-fixture.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeTaskContract,
} from "./helpers/task-fixture.js";

async function canonical(path: string): Promise<string> {
  const resolved = await canonicalizeWithMissingTail(path);
  assert.equal(resolved.reason, null, `${path} has a canonical form`);
  return resolved.canonical;
}

function git(cwd: string, args: readonly string[]): string {
  const result = gitCommand(cwd, args);
  assert.ok(result.ok, `${result.display} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function notGrantable(resolution: TaskGitDirectory): Extract<TaskGitDirectory, { status: "not-grantable" }> {
  assert.equal(resolution.status, "not-grantable", `expected not-grantable, got ${JSON.stringify(resolution)}`);
  return resolution as Extract<TaskGitDirectory, { status: "not-grantable" }>;
}

// ---------------------------------------------------------------------------
// resolveTaskGitDirectory
// ---------------------------------------------------------------------------

test("a project whose .git is a directory at its root resolves grantable in-tree to its canonical .git", async (context) => {
  const fixture = await createTaskFixture(context);
  const resolution = await resolveTaskGitDirectory(fixture.projectRoot);
  assert.deepEqual(resolution, {
    status: "grantable",
    layout: "in-tree",
    gitDirectory: join(await canonical(fixture.projectRoot), ".git"),
  });
});

test("a .git pointer to a standalone git directory outside the root resolves grantable external", async (context) => {
  const fixture = await createTaskFixture(context);
  const moved = join(fixture.scratch, "moved.git");
  git(fixture.projectRoot, ["init", "--separate-git-dir", moved]);
  const resolution = await resolveTaskGitDirectory(fixture.projectRoot);
  assert.deepEqual(resolution, { status: "grantable", layout: "external", gitDirectory: await canonical(moved) });
});

test("a linked worktree is not grantable and its reason names the shared common directory", async (context) => {
  const fixture = await createTaskFixture(context);
  const worktree = join(fixture.scratch, "linked-worktree");
  git(fixture.projectRoot, ["worktree", "add", "-b", "linked", worktree]);
  const resolution = notGrantable(await resolveTaskGitDirectory(worktree));
  assert.equal(resolution.layout, "linked-worktree");
  assert.ok(
    resolution.reason.includes(join(await canonical(fixture.projectRoot), ".git")),
    `the reason names the common directory: ${resolution.reason}`,
  );
  assert.match(resolution.reason, /only a standalone git directory can be granted/u);
});

test("a project root without .git is not grantable as missing", async (context) => {
  const fixture = await createTaskFixture(context);
  const bare = join(fixture.scratch, "no-git");
  await mkdir(bare, { recursive: true });
  const resolution = notGrantable(await resolveTaskGitDirectory(bare));
  assert.equal(resolution.layout, "missing");
  assert.equal(resolution.gitDirectory, null);
  assert.equal(resolution.reason, "the project root holds no .git, so there is no git directory to grant");
});

test("a .git pointer whose target lies inside the project root is not grantable", async (context) => {
  const fixture = await createTaskFixture(context);
  const nested = join(fixture.projectRoot, "nested.git");
  git(fixture.projectRoot, ["init", "--separate-git-dir", nested]);
  const resolution = notGrantable(await resolveTaskGitDirectory(fixture.projectRoot));
  assert.equal(resolution.layout, "unsupported");
  assert.match(resolution.reason, /inside the project root/u);
});

test("a .git pointer whose target has no HEAD file is not grantable", async (context) => {
  const fixture = await createTaskFixture(context);
  const project = join(fixture.scratch, "no-head");
  const target = join(fixture.scratch, "empty.git");
  await mkdir(project, { recursive: true });
  await mkdir(target, { recursive: true });
  await writeFile(join(project, ".git"), `gitdir: ${target}\n`, "utf8");
  const resolution = notGrantable(await resolveTaskGitDirectory(project));
  assert.equal(resolution.layout, "unsupported");
  assert.match(resolution.reason, /no HEAD file/u);
});

test("a .git pointer file of 4097 bytes is not grantable", async (context) => {
  const fixture = await createTaskFixture(context);
  const project = join(fixture.scratch, "oversize");
  await mkdir(project, { recursive: true });
  const text = `gitdir: ${"a".repeat(TASK_GIT_POINTER_MAX_BYTES + 1 - "gitdir: ".length)}`;
  assert.equal(Buffer.byteLength(text), 4097);
  await writeFile(join(project, ".git"), text, "utf8");
  const resolution = notGrantable(await resolveTaskGitDirectory(project));
  assert.equal(resolution.layout, "unsupported");
  assert.match(resolution.reason, /4096 bytes/u);
});

test("a .git that is a link is not followed and not grantable", async (context) => {
  const fixture = await createTaskFixture(context);
  const project = join(fixture.scratch, "linked-dot-git");
  await mkdir(project, { recursive: true });
  await symlink(join(fixture.projectRoot, ".git"), join(project, ".git"), process.platform === "win32" ? "junction" : "dir");
  const resolution = notGrantable(await resolveTaskGitDirectory(project));
  assert.equal(resolution.layout, "link");
});

test("every not-grantable shape reports a distinct reason", async (context) => {
  const fixture = await createTaskFixture(context);
  const missing = join(fixture.scratch, "distinct-missing");
  await mkdir(missing, { recursive: true });
  const noHead = join(fixture.scratch, "distinct-no-head");
  await mkdir(noHead, { recursive: true });
  await mkdir(join(fixture.scratch, "distinct-empty.git"), { recursive: true });
  await writeFile(join(noHead, ".git"), `gitdir: ${join(fixture.scratch, "distinct-empty.git")}\n`, "utf8");
  const oversize = join(fixture.scratch, "distinct-oversize");
  await mkdir(oversize, { recursive: true });
  await writeFile(join(oversize, ".git"), `gitdir: ${"b".repeat(TASK_GIT_POINTER_MAX_BYTES)}`, "utf8");
  git(fixture.projectRoot, ["init", "--separate-git-dir", join(fixture.projectRoot, "inner.git")]);

  const reasons: string[] = [];
  for (const root of [missing, noHead, oversize, fixture.projectRoot]) {
    reasons.push(notGrantable(await resolveTaskGitDirectory(root)).reason);
  }
  assert.equal(new Set(reasons).size, reasons.length, `reasons are distinct: ${JSON.stringify(reasons)}`);
});

// ---------------------------------------------------------------------------
// grantedGitDirectory
// ---------------------------------------------------------------------------

test("the git directory is granted only for a grantable resolution under an approved local-commit effect", async (context) => {
  const fixture = await createTaskFixture(context);
  const resolution = await resolveTaskGitDirectory(fixture.projectRoot);
  assert.equal(resolution.status, "grantable");
  const withCommit = inventorySummaryContract(fixture.projectRoot);
  const withoutCommit = inventorySummaryContract(fixture.projectRoot, { allowedEffects: ["workspace-write"] });

  assert.equal(grantedGitDirectory(withCommit, resolution), join(await canonical(fixture.projectRoot), ".git"));
  assert.equal(grantedGitDirectory(withoutCommit, resolution), null);
  const missing: TaskGitDirectory = {
    status: "not-grantable",
    layout: "missing",
    gitDirectory: null,
    reason: "the project root holds no .git, so there is no git directory to grant",
  };
  assert.equal(grantedGitDirectory(withCommit, missing), null);
});

// ---------------------------------------------------------------------------
// startTask dispatch
// ---------------------------------------------------------------------------

test("startTask dispatches the canonical git directory of an approved local-commit contract", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  const approval = await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  assert.equal(approval.status, "approved");

  const requests: ControllerDispatchRequest[] = [];
  const reference = referenceControllerPort("correct");
  const capturing: ControllerPort = {
    async dispatch(request) {
      requests.push(request);
      return reference.dispatch(request);
    },
  };

  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: capturing, reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: preview.digest,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.gitDirectory, join(await canonical(fixture.projectRoot), ".git"));
  assert.equal(run.status, "accepted");
});
