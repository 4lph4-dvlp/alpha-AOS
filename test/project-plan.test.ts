// Plan 02-01 tracer: one repository directory selects one YAML-declared pack.
//
// The assertions here run the built CLI, not the modules, because the seam
// under test is the whole path — canonical root, evidence, pack catalog,
// predicate evaluation, plan digests, and the single `print()` output seam.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { collectProjectEvidence, resolveCanonicalRoot } from "../src/core/evidence.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Mirrors `runCli` in test/preview.test.ts, but asynchronous so two runs can overlap. */
function runCli(args: readonly string[]): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: repositoryRoot,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
  skip: (message: string) => void;
}

/** A real directory whose `package.json` declares `react`, and nothing else. */
async function reactFixture(context: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-plan-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "plan-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  return root;
}

/** Directory symlink creation differs by platform and may need privileges. */
async function tryDirectorySymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return existsSync(linkPath);
  } catch {
    return false;
  }
}

test("project plan selects WEB_REACT and names the path and digests that decided it", async (context) => {
  const root = await reactFixture(context);
  const result = await runCli(["project", "plan", root]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /WEB_REACT/u);
  assert.match(result.stdout, /package\.json/u);
  assert.match(result.stdout, /Inputs digest: [0-9a-f]{64}/u);
  assert.match(result.stdout, /Evidence digest: [0-9a-f]{64}/u);
  assert.match(result.stdout, /Plan digest: [0-9a-f]{64}/u);
});

test("project plan --json emits the same decision as a redacted JSON envelope", async (context) => {
  const root = await reactFixture(context);
  const result = await runCli(["project", "plan", root, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout) as {
    scope: { canonicalRoot: string; rootReason: string; projectId: string };
    selected: Array<{ packId: string; satisfied: Array<{ factId: string; path: string | null }> }>;
    inputsDigest: string;
    evidenceDigest: string;
    planDigest: string;
  };

  assert.deepEqual(plan.selected.map((pack) => pack.packId), ["WEB_REACT"]);
  assert.match(plan.scope.projectId, /^[0-9a-f]{16}$/u);
  assert.equal(plan.scope.rootReason, "standalone-directory");
  assert.deepEqual(
    plan.selected[0]?.satisfied.map((leaf) => [leaf.factId, leaf.path]),
    [["dependency:react", "package.json"]],
  );
  for (const digest of [plan.inputsDigest, plan.evidenceDigest, plan.planDigest]) {
    assert.match(digest, /^[0-9a-f]{64}$/u);
  }

  // D-07: a fact records path, name and version — never a per-file hash.
  const canonical = await resolveCanonicalRoot(root);
  const envelope = await collectProjectEvidence(canonical);
  assert.ok(envelope.facts.length > 0);
  for (const fact of envelope.facts) {
    assert.equal(Object.hasOwn(fact, "hash"), false, `fact ${fact.id} carries a hash`);
  }
});

test("two concurrent project plan invocations are byte-identical", async (context) => {
  const root = await reactFixture(context);
  const [first, second] = await Promise.all([
    runCli(["project", "plan", root]),
    runCli(["project", "plan", root]),
  ]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
});

test("a symlinked alias of the same repository yields the same canonical root and project id", async (context) => {
  const root = await reactFixture(context);
  const linkParent = await mkdtemp(join(tmpdir(), "alpha-aos-plan-link-"));
  context.after(async () => rm(linkParent, { recursive: true, force: true }));
  const linkPath = join(linkParent, "alias");

  if (!(await tryDirectorySymlink(root, linkPath))) {
    context.skip("symlink-alias case not run: this host cannot create directory symlinks");
    return;
  }

  const direct = JSON.parse((await runCli(["project", "plan", root, "--json"])).stdout) as {
    scope: { canonicalRoot: string; projectId: string };
  };
  const aliased = JSON.parse((await runCli(["project", "plan", linkPath, "--json"])).stdout) as {
    scope: { canonicalRoot: string; projectId: string };
  };

  assert.equal(aliased.scope.canonicalRoot, direct.scope.canonicalRoot);
  assert.equal(aliased.scope.projectId, direct.scope.projectId);
});
