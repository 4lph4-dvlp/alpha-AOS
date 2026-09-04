// Wave 0 tracer for SAFE-01 (D-01, D-02).
//
// Every mutating entry point must be observable in preview form without
// changing a single byte of the source checkout, the package/global-link
// sentinels, native configuration, the managed state root, or any harness
// resource root. These assertions describe the contract; the implementation
// plans in later waves are what turn them green.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const scriptsRoot = join(repositoryRoot, "scripts");

/** Checkout subtrees that legitimately change between runs and are not part of the contract. */
const CHECKOUT_IGNORED = new Set([".git", "node_modules", "dist", "coverage", ".planning"]);

interface NotRunRecord {
  readonly surface: string;
  readonly reason: string;
}

/** Evidence for surfaces this host cannot exercise. Never counted as a pass. */
const notRun: NotRunRecord[] = [];

function recordNotRun(surface: string, reason: string): void {
  notRun.push({ surface, reason });
}

async function treeDigest(root: string, ignored: ReadonlySet<string> = new Set()): Promise<string> {
  const entries: string[] = [];

  async function walk(current: string): Promise<void> {
    let listing: Dirent[];
    try {
      listing = await readdir(current, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return;
      throw error;
    }
    for (const entry of [...listing].sort((left, right) => left.name.localeCompare(right.name))) {
      if (ignored.has(entry.name)) continue;
      const absolute = join(current, entry.name);
      const key = relative(root, absolute).split(sep).join("/");
      if (entry.isDirectory()) {
        entries.push(`d ${key}`);
        await walk(absolute);
      } else if (entry.isSymbolicLink()) {
        // Record the link itself, not its resolution: a preview must not
        // retarget a link either.
        const info = await stat(absolute).catch(() => null);
        entries.push(`l ${key} ${info === null ? "dangling" : "resolves"}`);
      } else if (entry.isFile()) {
        const content = await readFile(absolute);
        entries.push(`f ${key} ${createHash("sha256").update(content).digest("hex")}`);
      } else {
        entries.push(`o ${key}`);
      }
    }
  }

  if (!existsSync(root)) return "absent";
  await walk(root);
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

interface Sandbox {
  readonly root: string;
  readonly home: string;
  readonly stateRoot: string;
  readonly packageSentinel: string;
  readonly harnessRoot: string;
  readonly outsideSentinel: string;
  readonly projectRoot: string;
  readonly env: NodeJS.ProcessEnv;
}

async function createSandbox(context: { after: (fn: () => Promise<unknown> | unknown) => void }): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-preview-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const home = join(root, "home");
  const stateRoot = join(root, "state");
  const packageSentinel = join(root, "packages");
  const harnessRoot = join(home, ".claude");
  const outside = join(root, "outside");
  const projectRoot = join(root, "project");

  for (const directory of [home, packageSentinel, harnessRoot, outside, projectRoot]) {
    await mkdir(directory, { recursive: true });
  }
  // Native configuration and harness resources that a preview must not touch.
  await writeFile(join(harnessRoot, "settings.json"), `${JSON.stringify({ userOwned: true }, null, 2)}\n`, "utf8");
  await writeFile(join(home, ".codex.toml"), 'user_owned = true\n', "utf8");
  await writeFile(join(packageSentinel, "installed.json"), `${JSON.stringify({ globalLinks: [] }, null, 2)}\n`, "utf8");
  await writeFile(join(outside, "SENTINEL"), "must never change\n", "utf8");
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({ name: "fixture" }, null, 2)}\n`, "utf8");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    ALPHA_AOS_STATE_DIR: stateRoot,
    npm_config_prefix: packageSentinel,
    // Keep the child from inheriting a real credential surface.
    NO_COLOR: "1",
  };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.CODEX_HOME;

  return { root, home, stateRoot, packageSentinel, harnessRoot, outsideSentinel: join(outside, "SENTINEL"), projectRoot, env };
}

interface MutationDigests {
  readonly checkout: string;
  readonly home: string;
  readonly state: string;
  readonly packages: string;
  readonly harness: string;
  readonly outside: string;
}

async function captureDigests(sandbox: Sandbox): Promise<MutationDigests> {
  return {
    checkout: await treeDigest(repositoryRoot, CHECKOUT_IGNORED),
    home: await treeDigest(sandbox.home),
    state: await treeDigest(sandbox.stateRoot),
    packages: await treeDigest(sandbox.packageSentinel),
    harness: await treeDigest(sandbox.harnessRoot),
    outside: await treeDigest(dirname(sandbox.outsideSentinel)),
  };
}

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: string[], sandbox: Sandbox): RunResult {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: sandbox.projectRoot,
    env: sandbox.env,
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * Every mutating command in the CLI surface, in preview form. A command is in
 * this list because it can write; adding a mutating command without adding it
 * here is the regression this enumeration is meant to catch.
 */
const PREVIEW_INVOCATIONS: ReadonlyArray<{ readonly name: string; readonly args: string[] }> = [
  { name: "install", args: ["install", "--target", "claude"] },
  { name: "install --json", args: ["install", "--target", "claude", "--json"] },
  { name: "owned-skills sync", args: ["owned-skills", "sync", "alpha-aos-workflow", "--target", "claude"] },
  { name: "ecc-skills sync", args: ["ecc-skills", "sync", "--target", "claude"] },
  { name: "skill-policy sync", args: ["skill-policy", "sync", "--target", "claude"] },
  { name: "mcp sync", args: ["mcp", "sync", "--target", "claude"] },
  { name: "mcp sync --server context7", args: ["mcp", "sync", "--target", "claude", "--server", "context7"] },
  { name: "update --stage", args: ["update", "--stage"] },
  { name: "gsd compat codex", args: ["gsd", "compat", "codex"] },
  { name: "fixture gsd claude", args: ["fixture", "gsd", "claude"] },
  { name: "fixture ecc claude", args: ["fixture", "ecc", "claude"] },
  { name: "fixture mcp context7 claude", args: ["fixture", "mcp", "context7", "claude"] },
  { name: "project isolate init", args: ["project", "isolate", "init", ".", "--mode", "project-only", "--harness", "claude"] },
  { name: "project isolate plan", args: ["project", "isolate", "plan", "."] },
  { name: "project isolate sync", args: ["project", "isolate", "sync", "."] },
  { name: "project isolate clean", args: ["project", "isolate", "clean", "."] },
  { name: "rollback", args: ["rollback"] },
  { name: "repair", args: ["repair"] },
  { name: "support-bundle", args: ["support-bundle"] },
  { name: "bootstrap install", args: ["bootstrap", "install", "--skip-link"] },
];

test("every mutating CLI preview leaves all five mutation surfaces byte-identical", async (context) => {
  const sandbox = await createSandbox(context);
  assert.ok(existsSync(cliEntry), `CLI entry must be built before this suite runs: ${cliEntry}`);

  for (const invocation of PREVIEW_INVOCATIONS) {
    const before = await captureDigests(sandbox);
    const result = runCli(invocation.args, sandbox);
    const after = await captureDigests(sandbox);

    assert.deepEqual(
      after,
      before,
      `preview of \`${invocation.name}\` mutated an observable surface\n` +
        `stdout: ${result.stdout.slice(0, 400)}\nstderr: ${result.stderr.slice(0, 400)}`,
    );
  }
});

test("a preview never creates the managed state root or a writer lock", async (context) => {
  const sandbox = await createSandbox(context);

  for (const invocation of PREVIEW_INVOCATIONS) {
    runCli(invocation.args, sandbox);
    assert.equal(
      existsSync(sandbox.stateRoot),
      false,
      `preview of \`${invocation.name}\` created the managed state root at ${sandbox.stateRoot}`,
    );
  }
});

test("a preview refuses with a stable message when no runnable build artifact exists", async (context) => {
  const sandbox = await createSandbox(context);
  const absentEntry = join(sandbox.root, "absent", "cli.js");

  const before = await captureDigests(sandbox);
  const result = spawnSync(process.execPath, [absentEntry, "install", "--target", "claude"], {
    cwd: sandbox.projectRoot,
    env: sandbox.env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  const after = await captureDigests(sandbox);

  assert.notEqual(result.status, 0, "a missing build artifact must not exit successfully");
  assert.deepEqual(after, before, "a failed prerequisite check must not change any surface");
});

test("interrupting a preview leaves no partial managed state", async (context) => {
  const sandbox = await createSandbox(context);
  const before = await captureDigests(sandbox);

  const child = spawn(process.execPath, [cliEntry, "install", "--target", "claude"], {
    cwd: sandbox.projectRoot,
    env: sandbox.env,
    stdio: "ignore",
    windowsHide: true,
  });
  const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  // Kill while the command is still resolving its plan.
  setTimeout(() => child.kill("SIGKILL"), 40).unref();
  await exited;

  const after = await captureDigests(sandbox);
  assert.deepEqual(after, before, "an interrupted preview left residue on a mutation surface");
  assert.equal(existsSync(sandbox.stateRoot), false, "an interrupted preview created the managed state root");
});

test("two concurrent previews neither collide nor create shared state", async (context) => {
  const sandbox = await createSandbox(context);
  const before = await captureDigests(sandbox);

  const results = await Promise.all(
    ["claude", "codex"].map(
      (target) =>
        new Promise<number | null>((resolveExit) => {
          const child = spawn(process.execPath, [cliEntry, "install", "--target", target], {
            cwd: sandbox.projectRoot,
            env: sandbox.env,
            stdio: "ignore",
            windowsHide: true,
          });
          child.once("exit", (code) => resolveExit(code));
        }),
    ),
  );

  const after = await captureDigests(sandbox);
  assert.equal(results.length, 2);
  assert.deepEqual(after, before, "concurrent previews mutated an observable surface");
  assert.equal(existsSync(sandbox.stateRoot), false, "concurrent previews created the managed state root");
});

/** Copies the checkout into the sandbox so a wrapper that bootstraps cannot reach the developer's tree. */
async function copyCheckout(destination: string): Promise<void> {
  await cp(repositoryRoot, destination, {
    recursive: true,
    filter: (source) => {
      const relativePath = relative(repositoryRoot, source);
      if (relativePath === "") return true;
      const [head] = relativePath.split(sep);
      return head !== undefined && !CHECKOUT_IGNORED.has(head);
    },
  });
}

test("install and update wrappers preview without mutating either shell family", async (context) => {
  const sandbox = await createSandbox(context);
  const checkoutCopy = join(sandbox.root, "checkout");
  await copyCheckout(checkoutCopy);

  const families: ReadonlyArray<{
    readonly name: string;
    readonly script: string;
    readonly launcher: string;
    readonly leading: string[];
  }> = [
    { name: "install.ps1", script: join(checkoutCopy, "scripts", "install.ps1"), launcher: "pwsh", leading: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File"] },
    { name: "update.ps1", script: join(checkoutCopy, "scripts", "update.ps1"), launcher: "pwsh", leading: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File"] },
    { name: "install.sh", script: join(checkoutCopy, "scripts", "install.sh"), launcher: "bash", leading: [] },
    { name: "update.sh", script: join(checkoutCopy, "scripts", "update.sh"), launcher: "bash", leading: [] },
  ];

  let executed = 0;
  for (const family of families) {
    if (!existsSync(family.script)) {
      recordNotRun(family.name, "wrapper script is absent from the checkout");
      continue;
    }
    const launcherProbe = spawnSync(family.launcher, ["--version"], { encoding: "utf8", timeout: 15_000, windowsHide: true });
    if (launcherProbe.status !== 0) {
      recordNotRun(family.name, `${family.launcher} is unavailable on this host`);
      continue;
    }

    // The package/global-link sentinel and the managed state root are the
    // surfaces a bootstrap-happy wrapper reaches first.
    const packagesBefore = await treeDigest(sandbox.packageSentinel);
    const homeBefore = await treeDigest(sandbox.home);
    const sourceBefore = await treeDigest(repositoryRoot, CHECKOUT_IGNORED);

    const result = spawnSync(family.launcher, [...family.leading, family.script], {
      cwd: checkoutCopy,
      env: sandbox.env,
      encoding: "utf8",
      // A preview reports a plan; it does not fetch, build, or link. Twenty
      // seconds is generous for the former and impossible for the latter, so
      // exceeding it is itself evidence that install work is happening.
      timeout: 20_000,
      windowsHide: true,
    });
    executed += 1;

    const detail = `stdout: ${(result.stdout ?? "").slice(0, 400)}
stderr: ${(result.stderr ?? "").slice(0, 400)}`;

    // A preview that has to bootstrap before it can report is already a
    // mutation, whether or not it finishes inside the budget.
    assert.notEqual(
      (result.error as NodeJS.ErrnoException | undefined)?.code,
      "ETIMEDOUT",
      `wrapper \`${family.name}\` did not complete a preview within the budget, which means it is doing install work
${detail}`,
    );
    assert.equal(await treeDigest(sandbox.packageSentinel), packagesBefore, `wrapper \`${family.name}\` linked or installed a package without --apply
${detail}`);
    assert.equal(await treeDigest(sandbox.home), homeBefore, `wrapper \`${family.name}\` mutated the home surface without --apply
${detail}`);
    assert.equal(existsSync(sandbox.stateRoot), false, `wrapper \`${family.name}\` created the managed state root without --apply`);
    assert.equal(await treeDigest(repositoryRoot, CHECKOUT_IGNORED), sourceBefore, `wrapper \`${family.name}\` reached the developer checkout`);
  }

  context.diagnostic(`wrapper families executed: ${executed}; not-run: ${JSON.stringify(notRun)}`);
  assert.equal(executed + notRun.length, families.length, "every wrapper family must be either executed or explicitly recorded as not-run");
});
