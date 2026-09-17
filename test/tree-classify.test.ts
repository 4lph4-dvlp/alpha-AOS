import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import test from "node:test";
import {
  canonicalizeTreePath,
  classifyGitRootOrFallback,
  findEnclosingGitRoot,
  listTreePolicies,
  loadTreeRegistry,
  planLateDiscoveryRestart,
  previewTreePolicy,
  promptFirstUseClassification,
  removeTreePolicy,
  setTreePolicy,
} from "../src/core/tree-policy.js";

function createMockStreams(inputLines: string[]): {
  stdin: Readable;
  stderr: Writable;
  getOutput: () => string;
} {
  const stdin = new Readable({
    read() {
      if (inputLines.length > 0) {
        const line = inputLines.shift()!;
        this.push(`${line}\n`);
      } else {
        this.push(null);
      }
    },
  });

  let output = "";
  const stderr = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });

  return {
    stdin,
    stderr,
    getOutput: () => output,
  };
}

test("findEnclosingGitRoot detects standard git repositories and worktrees", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-git-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  // 1. Standard repo with .git directory
  const standardRepo = join(root, "std-repo");
  const stdSubdir = join(standardRepo, "src", "nested");
  await mkdir(join(standardRepo, ".git"), { recursive: true });
  await mkdir(stdSubdir, { recursive: true });

  const foundStd = await findEnclosingGitRoot(stdSubdir);
  assert.ok(foundStd !== null);
  const canonicalStd = await canonicalizeTreePath(standardRepo);
  assert.equal(foundStd, canonicalStd);

  // 2. Git worktree with .git file
  const worktreeRepo = join(root, "worktree-repo");
  const wtSubdir = join(worktreeRepo, "pkg", "lib");
  await mkdir(wtSubdir, { recursive: true });
  await writeFile(join(worktreeRepo, ".git"), "gitdir: /path/to/gitdir\n", "utf8");

  const foundWt = await findEnclosingGitRoot(wtSubdir);
  assert.ok(foundWt !== null);
  const canonicalWt = await canonicalizeTreePath(worktreeRepo);
  assert.equal(foundWt, canonicalWt);

  // 3. Non-git directory
  const nonGitDir = join(root, "non-git");
  await mkdir(nonGitDir, { recursive: true });
  const foundNonGit = await findEnclosingGitRoot(nonGitDir);
  assert.equal(foundNonGit, null);
});

test("promptFirstUseClassification prompts 3 options and parses interactive choices", async () => {
  // Option 1: Managed
  const mock1 = createMockStreams(["1"]);
  const choice1 = await promptFirstUseClassification("/fake/repo", {
    stdin: mock1.stdin,
    stderr: mock1.stderr,
  });
  assert.equal(choice1, "managed");
  assert.ok(mock1.getOutput().includes("Newly encountered Git repository root"));
  assert.ok(mock1.getOutput().includes("[1] Managed"));

  // Option 2: Off
  const mock2 = createMockStreams(["2"]);
  const choice2 = await promptFirstUseClassification("/fake/repo", {
    stdin: mock2.stdin,
    stderr: mock2.stderr,
  });
  assert.equal(choice2, "off");

  // Option 3: Skip / 나중에 결정
  const mock3 = createMockStreams(["3"]);
  const choice3 = await promptFirstUseClassification("/fake/repo", {
    stdin: mock3.stdin,
    stderr: mock3.stderr,
  });
  assert.equal(choice3, "ask-next-time");

  // Invalid choice retry then valid choice
  const mockRetry = createMockStreams(["invalid", "managed"]);
  const choiceRetry = await promptFirstUseClassification("/fake/repo", {
    stdin: mockRetry.stdin,
    stderr: mockRetry.stderr,
  });
  assert.equal(choiceRetry, "managed");
  assert.ok(mockRetry.getOutput().includes("Invalid choice 'invalid'"));
});

test("interactive first-use classification commits to trees.json with zero repository modification", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-classify-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const repoDir = join(root, "interactive-repo");
  await mkdir(join(repoDir, ".git"), { recursive: true });
  await writeFile(join(repoDir, "app.ts"), "console.log('hi');", "utf8");

  // User chooses "2" (off)
  const mockStreams = createMockStreams(["2"]);
  const result = await classifyGitRootOrFallback(repoDir, {
    isTTY: true,
    stdin: mockStreams.stdin,
    stderr: mockStreams.stderr,
    stateRoot,
  });

  assert.equal(result.mode, "off");
  assert.equal(result.persisted, true);
  assert.equal(result.reason, "interactive");

  // Verify trees.json persisted
  const registry = await loadTreeRegistry(stateRoot);
  assert.equal(registry.trees.length, 1);
  assert.equal(registry.trees[0]?.mode, "off");

  // Verify target repo has ZERO modification (D-01, D-10)
  const repoContents = await readdir(repoDir);
  assert.deepEqual(repoContents.sort(), [".git", "app.ts"]);

  // Second invocation returns already-classified without prompting
  const emptyStreams = createMockStreams([]);
  const result2 = await classifyGitRootOrFallback(repoDir, {
    isTTY: true,
    stdin: emptyStreams.stdin,
    stderr: emptyStreams.stderr,
    stateRoot,
  });
  assert.equal(result2.mode, "off");
  assert.equal(result2.persisted, true);
  assert.equal(result2.reason, "already-classified");
});

test("skip choice passes through without modifying trees.json or repository", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-skip-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const repoDir = join(root, "skip-repo");
  await mkdir(join(repoDir, ".git"), { recursive: true });

  const mockStreams = createMockStreams(["3"]);
  const result = await classifyGitRootOrFallback(repoDir, {
    isTTY: true,
    stdin: mockStreams.stdin,
    stderr: mockStreams.stderr,
    stateRoot,
  });

  assert.equal(result.mode, "passthrough");
  assert.equal(result.persisted, false);
  assert.equal(result.reason, "interactive");

  const registry = await loadTreeRegistry(stateRoot);
  assert.equal(registry.trees.length, 0);
});

test("headless / CI fallback defaults to Fail-Safe Off without hanging", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-ci-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const repoDir = join(root, "ci-repo");
  await mkdir(join(repoDir, ".git"), { recursive: true });

  // 1. Default non-interactive: falls back to Fail-Safe Off (D-11)
  const resultCi = await classifyGitRootOrFallback(repoDir, {
    isTTY: false,
    stateRoot,
  });
  assert.equal(resultCi.mode, "off");
  assert.equal(resultCi.persisted, false);
  assert.equal(resultCi.reason, "ci-fallback");

  // 2. Override via defaultModeEnv=managed
  const resultOverride = await classifyGitRootOrFallback(repoDir, {
    isTTY: false,
    defaultModeEnv: "managed",
    stateRoot,
  });
  assert.equal(resultOverride.mode, "managed");
  assert.equal(resultOverride.persisted, false);
  assert.equal(resultOverride.reason, "default-mode-override");
});

test("tree policy preview and management operations", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-cli-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");

  const repo = join(root, "cli-repo");
  const sub = join(repo, "packages", "service");
  await mkdir(sub, { recursive: true });
  await mkdir(join(repo, ".git"), { recursive: true });

  // 1. Unclassified preview
  const previewUnclassified = await previewTreePolicy(sub, { stateRoot });
  assert.equal(previewUnclassified.effectiveMode, "unclassified");
  assert.equal(previewUnclassified.inherited, false);
  assert.equal(previewUnclassified.launchFlags.length, 0);

  // 2. Set policy: setTreePolicy
  await setTreePolicy(repo, "off", { stateRoot, notes: "Repo-wide off" });
  const list = await listTreePolicies(stateRoot);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.mode, "off");
  assert.equal(list[0]?.notes, "Repo-wide off");

  // 3. Preview sub directory under off repo -> inherits off mode with preload exclusion flags
  const previewInherited = await previewTreePolicy(sub, { stateRoot, harness: "codex" });
  assert.equal(previewInherited.effectiveMode, "off");
  assert.equal(previewInherited.inherited, true);
  assert.equal(previewInherited.depth, 1);
  assert.ok(previewInherited.launchFlags.includes("--strict-config"));
  assert.ok(previewInherited.isolatedConfigRoot !== null);

  // 4. Remove policy
  const removed = await removeTreePolicy(repo, { stateRoot });
  assert.equal(removed, true);
  const previewAfterRemove = await previewTreePolicy(sub, { stateRoot });
  assert.equal(previewAfterRemove.effectiveMode, "unclassified");
});

test("late discovery clean restart handles dirty in-memory discovery cleanly (OPTO-04)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-restart-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const repo = join(root, "late-discovery-repo");
  await mkdir(repo, { recursive: true });

  const restartPlan = await planLateDiscoveryRestart({
    harness: "codex",
    targetPath: repo,
    upstreamBinary: "C:\\bin\\codex.cmd",
    args: ["--prompt", "hello"],
    stateRoot,
  });

  assert.equal(restartPlan.required, true);
  assert.equal(restartPlan.command, "C:\\bin\\codex.cmd");
  assert.ok(restartPlan.args.includes("--strict-config"));
  assert.ok(restartPlan.args.includes("--ignore-user-config"));
  assert.ok(restartPlan.args.includes("--prompt"));
  assert.ok(restartPlan.isolatedConfigRoot.includes("trees"));

  // Verify trees.json now records this tree as 'off'
  const registry = await loadTreeRegistry(stateRoot);
  assert.equal(registry.trees.length, 1);
  assert.equal(registry.trees[0]?.mode, "off");
});
