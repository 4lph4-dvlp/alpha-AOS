import assert from "node:assert/strict";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  BehaviorPolicyError,
  planProjectModeChange,
  resolveProjectBehavior,
} from "../src/core/behavior-policy.js";
import { setTreePolicy } from "../src/core/tree-policy.js";
import {
  createIsolatedSandbox,
} from "./helpers/packed-sandbox.js";
import {
  createLinkedWorktree,
  createOrdinaryRepository,
  createSubmodule,
  gitAvailability,
} from "./helpers/git-fixture.js";

const SENTINEL_SECRET = "SUPER_SECRET_TOKEN_DO_NOT_LEAK";

test("resolveProjectBehavior rejects malformed JSON without leaking sentinel (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "bad-json-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  await writeFile(
    join(alphaAosDir, "behavior.json"),
    `{\n  "schemaVersion": 1,\n  "mode": "strict",\n  "broken": ${SENTINEL_SECRET}\n`,
    "utf8",
  );

  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "invalid-json");
      assert.equal(err.causeCategory, "invalid-json");
      assert.ok(err.remediation.length > 0);
      assert.equal(err.message.includes(SENTINEL_SECRET), false, "message must omit sentinel content");
      return true;
    },
  );
});

test("resolveProjectBehavior rejects duplicate JSON keys without leaking sentinel key (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "dup-key-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  await writeFile(
    join(alphaAosDir, "behavior.json"),
    `{\n  "schemaVersion": 1,\n  "mode": "strict",\n  "mode": "flexible",\n  "${SENTINEL_SECRET}": 1\n}`,
    "utf8",
  );

  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "invalid-policy");
      assert.equal(err.causeCategory, "duplicate-key");
      assert.equal(err.message.includes(SENTINEL_SECRET), false, "message must omit sentinel key");
      return true;
    },
  );
});

test("resolveProjectBehavior rejects unsupported schema versions (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "version-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  // version 0
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 0, mode: "strict" }),
    "utf8",
  );
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "unsupported-schema");
      assert.equal(err.causeCategory, "unsupported-version");
      return true;
    },
  );

  // version 2
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 2, mode: "strict" }),
    "utf8",
  );
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "unsupported-schema");
      assert.equal(err.causeCategory, "unsupported-version");
      return true;
    },
  );
});

test("resolveProjectBehavior rejects invalid mode or missing mode (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "mode-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  // Missing mode
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 1 }),
    "utf8",
  );
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "invalid-policy");
      assert.equal(err.causeCategory, "missing-field");
      return true;
    },
  );

  // Invalid mode value
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "permissive" }),
    "utf8",
  );
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "invalid-policy");
      assert.equal(err.causeCategory, "invalid-mode");
      return true;
    },
  );
});

test("resolveProjectBehavior rejects extra or namespaced keys without leaking them (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "extra-key-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  await writeFile(
    join(alphaAosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "strict", [SENTINEL_SECRET]: "leak_attempt" }),
    "utf8",
  );
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "invalid-policy");
      assert.equal(err.causeCategory, "unsupported-field");
      assert.equal(err.message.includes(SENTINEL_SECRET), false);
      return true;
    },
  );
});

test("resolveProjectBehavior rejects top-level array, null or primitive (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "shape-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  await writeFile(join(alphaAosDir, "behavior.json"), "[]\n", "utf8");
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.causeCategory, "invalid-shape");
      return true;
    },
  );

  await writeFile(join(alphaAosDir, "behavior.json"), "null\n", "utf8");
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.causeCategory, "invalid-shape");
      return true;
    },
  );
});

test("resolveProjectBehavior rejects root that is not a directory or does not exist (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const regularFile = join(sandbox.home, "file-not-dir.txt");
  await writeFile(regularFile, "content", "utf8");

  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: regularFile }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "not-a-directory");
      return true;
    },
  );

  const missingDir = join(sandbox.home, "does-not-exist");
  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: missingDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "invalid-root");
      return true;
    },
  );
});

test("resolveProjectBehavior rejects directory policy path (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "dir-policy-project");
  const policyAsDir = join(projectDir, ".alpha-aos", "behavior.json");
  await mkdir(policyAsDir, { recursive: true });

  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "invalid-policy-path");
      assert.equal(err.causeCategory, "policy-is-directory");
      return true;
    },
  );
});

test("resolveProjectBehavior rejects bound task root mismatch (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectA = join(sandbox.home, "project-a");
  const projectB = join(sandbox.home, "project-b");
  await mkdir(projectA, { recursive: true });
  await mkdir(projectB, { recursive: true });

  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectA, boundProjectRoot: projectB }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "bound-root-mismatch");
      assert.equal(err.causeCategory, "bound-root-mismatch");
      return true;
    },
  );
});

test("resolveProjectBehavior respects tree-off policy on invocation and target (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "off-project");
  await mkdir(projectDir, { recursive: true });

  await setTreePolicy(projectDir, "off", { stateRoot: sandbox.state });

  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir, stateRoot: sandbox.state }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.equal(err.code, "tree-off");
      assert.equal(err.causeCategory, "tree-off");
      return true;
    },
  );
});

test("resolveProjectBehavior respects declaration boundary and does not inherit parent policy (MODE-01, MODE-03)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const parentRepo = join(sandbox.home, "parent-workspace");
  const childProject = join(parentRepo, "child-app");
  await mkdir(join(parentRepo, ".alpha-aos"), { recursive: true });
  await mkdir(join(childProject, ".alpha-aos"), { recursive: true });

  // Parent has flexible policy
  await writeFile(
    join(parentRepo, ".alpha-aos", "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "flexible" }),
    "utf8",
  );

  // Child has package.json (declaration boundary) and NO policy
  await writeFile(join(childProject, "package.json"), '{"name":"child-app"}\n', "utf8");

  // Child should resolve to childProject with standalone strict, NOT inheriting parent's flexible!
  const childView = await resolveProjectBehavior({
    invocationPath: childProject,
  });
  assert.equal(childView.effectiveMode, "strict");
  assert.equal(childView.source, "builtin-default");
  assert.equal(childView.rootReason, "project-declaration");
  assert.equal(childView.canonicalRoot, childProject);

  // Child with its own flexible policy
  await writeFile(
    join(childProject, ".alpha-aos", "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "flexible" }),
    "utf8",
  );
  const childFlexible = await resolveProjectBehavior({
    invocationPath: childProject,
  });
  assert.equal(childFlexible.effectiveMode, "flexible");
  assert.equal(childFlexible.source, "project-policy");
});

test("resolveProjectBehavior respects Git repository, worktree and submodule boundaries (MODE-01, MODE-03)", async (context) => {
  const git = await gitAvailability();
  if (!git.available) {
    context.skip("git not available in environment");
    return;
  }

  const sandbox = await createIsolatedSandbox(context);
  const repo = await createOrdinaryRepository(sandbox.home, "main-repo");
  assert.equal(repo.ok, true);
  if (!repo.ok) return;

  // Add flexible policy to main repo
  const repoAlphaAos = join(repo.fixture.path, ".alpha-aos");
  await mkdir(repoAlphaAos, { recursive: true });
  await writeFile(
    join(repoAlphaAos, "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "flexible" }),
    "utf8",
  );

  // Create linked worktree
  const worktree = await createLinkedWorktree(repo.fixture.path, "worktree-1");
  assert.equal(worktree.ok, true);
  if (!worktree.ok) return;

  // Worktree has its own boundary (.git file) and NO behavior.json -> strict builtin-default, NOT main repo's flexible!
  const wtView = await resolveProjectBehavior({
    invocationPath: worktree.fixture.path,
  });
  assert.equal(wtView.effectiveMode, "strict");
  assert.equal(wtView.source, "builtin-default");
  assert.equal(wtView.rootReason, "git-root");
  assert.equal(wtView.canonicalRoot, worktree.fixture.path);

  // Create submodule
  const child = await createOrdinaryRepository(sandbox.home, "child-repo");
  assert.equal(child.ok, true);
  if (!child.ok) return;

  const sub = await createSubmodule(repo.fixture.path, child.fixture.path, "sub-dir");
  assert.equal(sub.ok, true);
  if (!sub.ok) return;

  // Submodule has its own boundary (.git file)
  const subView = await resolveProjectBehavior({
    invocationPath: join(repo.fixture.path, "sub-dir"),
  });
  assert.equal(subView.effectiveMode, "strict");
  assert.equal(subView.source, "builtin-default");
  assert.equal(subView.rootReason, "git-root");
});

test("resolveProjectBehavior handles symlink escape or dangling link safely (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "symlink-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  const danglingLink = join(alphaAosDir, "behavior.json");
  try {
    await symlink(join(sandbox.home, "nonexistent-target.json"), danglingLink);
  } catch {
    context.skip("symlink not supported on this host");
    return;
  }

  await assert.rejects(
    async () => resolveProjectBehavior({ projectRoot: projectDir }),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      assert.ok(err.code === "invalid-policy-path" || err.code === "path-escape");
      return true;
    },
  );
});

test("planProjectModeChange handles create, replace, current and detects formatting edits (MODE-03, MODE-04, MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "plan-mode-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Missing policy -> create (both strict and flexible)
  const planCreateStrict = await planProjectModeChange({ projectRoot: projectDir }, "strict");
  assert.equal(planCreateStrict.change, "create");
  assert.equal(planCreateStrict.currentRevision, "missing");
  assert.equal(planCreateStrict.requestedMode, "strict");

  const planCreateFlex = await planProjectModeChange({ projectRoot: projectDir }, "flexible");
  assert.equal(planCreateFlex.change, "create");
  assert.equal(planCreateFlex.requestedMode, "flexible");
  assert.notEqual(planCreateStrict.planDigest, planCreateFlex.planDigest);

  // 2. Existing policy with mode: "strict"
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    '{\n  "schemaVersion": 1,\n  "mode": "strict"\n}\n',
    "utf8",
  );

  // Requesting same mode -> current
  const planSame = await planProjectModeChange({ projectRoot: projectDir }, "strict");
  assert.equal(planSame.change, "current");

  // Requesting opposite mode -> replace
  const planOpposite = await planProjectModeChange({ projectRoot: projectDir }, "flexible");
  assert.equal(planOpposite.change, "replace");

  // 3. Formatting-only byte edit (adding trailing newline or spaces) changes revision and planDigest
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    '{\n  "schemaVersion": 1,\n  "mode": "strict"\n}\n\n',
    "utf8",
  );
  const planFormatted = await planProjectModeChange({ projectRoot: projectDir }, "strict");
  assert.equal(planFormatted.change, "current");
  assert.notEqual(planSame.currentRevision, planFormatted.currentRevision);
  assert.notEqual(planSame.planDigest, planFormatted.planDigest);

  // 4. Malformed existing policy refuses planProjectModeChange
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    '{\n  "schemaVersion": 1,\n  "mode": "invalid"\n}\n',
    "utf8",
  );
  await assert.rejects(
    async () => planProjectModeChange({ projectRoot: projectDir }, "flexible"),
    (err: unknown) => {
      assert.ok(err instanceof BehaviorPolicyError);
      return true;
    },
  );
});
