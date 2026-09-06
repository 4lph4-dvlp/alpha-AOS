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

/**
 * PowerShell writes a startup profile cache into the home directory the moment
 * it launches, before the script it was given runs at all. That is the
 * interpreter's own footprint, not the wrapper's, so it is excluded by exact
 * path rather than by name — everything else under the home surface, including
 * every harness resource root, still has to be byte-identical.
 */
const LAUNCHER_FOOTPRINT: readonly string[] = [
  "AppData/Local/Microsoft/PowerShell",
  ".cache/powershell",
  ".local/share/powershell",
];

interface NotRunRecord {
  readonly surface: string;
  readonly reason: string;
}

/** Evidence for surfaces this host cannot exercise. Never counted as a pass. */
const notRun: NotRunRecord[] = [];

function recordNotRun(surface: string, reason: string): void {
  notRun.push({ surface, reason });
}

async function treeDigest(
  root: string,
  ignored: ReadonlySet<string> = new Set(),
  ignoredPrefixes: readonly string[] = [],
): Promise<string> {
  const entries: string[] = [];

  /** The ignored subtree itself: omitted entirely, contents included. */
  function excluded(key: string): boolean {
    return ignoredPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}/`));
  }

  /**
   * A directory that exists only because it contains an ignored subtree. Its
   * own name carries no information, so the entry line is omitted — but the
   * walk still descends, so a real sibling written beside the ignored subtree
   * is still recorded.
   */
  function ancestorOfExcluded(key: string): boolean {
    return ignoredPrefixes.some((prefix) => prefix.startsWith(`${key}/`));
  }

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
      if (excluded(key)) continue;
      if (entry.isDirectory()) {
        if (!ancestorOfExcluded(key)) entries.push(`d ${key}`);
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

/**
 * The only ambient names the sandbox forwards: a process cannot start or find
 * its interpreter without them. Everything else a command needs is set
 * explicitly below, and every home-derived name is redirected into the
 * observed home surface rather than inherited.
 *
 * Spreading `process.env` here would make the verdict depend on how the suite
 * was launched - an inherited `npm_config_cache` or a real `LOCALAPPDATA`
 * moves a child's write out of the surface this oracle watches, which is the
 * exact class of defect the oracle exists to catch.
 */
const SANDBOX_ENVIRONMENT_PASSTHROUGH: readonly string[] = [
  "PATH", "PATHEXT", "COMSPEC", "SYSTEMDRIVE", "SYSTEMROOT", "WINDIR",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
  "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TZ",
];

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

  // Forwarded by name, keeping the original casing so Windows never ends up
  // with both `Path` and `PATH` in one environment.
  const forwarded = new Set(SANDBOX_ENVIRONMENT_PASSTHROUGH.map((name) => name.toUpperCase()));
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (!forwarded.has(name.toUpperCase())) continue;
    env[name] = value;
  }

  // Every home-derived location a child might write to, redirected into the
  // observed home surface. These directories are deliberately not created: if
  // a preview creates one, that is the violation and the digest must see it.
  // TMPDIR/TEMP/TMP keep the real temp space - temporary storage is not one of
  // the five surfaces, and moving it under the home would report legitimate
  // temp use as a mutation.
  env.HOME = home;
  env.USERPROFILE = home;
  env.LOCALAPPDATA = join(home, "AppData", "Local");
  env.APPDATA = join(home, "AppData", "Roaming");
  env.XDG_CACHE_HOME = join(home, ".cache");
  env.XDG_CONFIG_HOME = join(home, ".config");
  env.XDG_DATA_HOME = join(home, ".local", "share");
  env.XDG_STATE_HOME = join(home, ".local", "state");
  env.ALPHA_AOS_STATE_DIR = stateRoot;
  env.npm_config_prefix = packageSentinel;
  // Keep the child from inheriting a real credential surface.
  env.NO_COLOR = "1";

  // The oracle asserting its own soundness: `npm_config_prefix` names what a
  // child may look at, and it is the only npm setting the sandbox supplies.
  // Any other `npm_config_*` name - `npm_config_cache` above all - would
  // decide where a child writes, moving the write off the observed surface.
  const npmConfigNames = Object.keys(env).filter((name) => /^npm_config_/iu.test(name));
  assert.deepEqual(
    npmConfigNames,
    ["npm_config_prefix"],
    `the sandbox environment carries npm settings beyond npm_config_prefix: ${npmConfigNames.join(", ")}. ` +
      "A cache or log setting reached the child under test, so where it writes is no longer decided by the " +
      "code under test and this suite can no longer observe a home write.",
  );

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

/**
 * Names npm injects into the environment of any script it launches through a
 * lifecycle. They are not decoration: `npm_config_cache` decides the directory
 * npm writes its debug log into for every invocation, including a read-only
 * query, so a process that inherits it launches children whose write location
 * was chosen by the caller rather than by the code under test.
 */
const NPM_LIFECYCLE_INJECTION = /^npm_(config|package|lifecycle)_/iu;
/**
 * The exact names npm injects that the prefix regex above cannot reach. All
 * four are written in lowercase and are looked up through `name.toLowerCase()`
 * in the invariant below, which puts this locus in one voice with the two
 * others that decide the same question: the `i` flag on
 * NPM_LIFECYCLE_INJECTION, and `INJECTED_NAMES.has(name.toLowerCase())` in
 * scripts/run-tests.mjs. Until that alignment the lookup here was a
 * case-SENSITIVE `includes`, which nobody decided - it was an artifact of one
 * list being a Set queried through toLowerCase() and this one an Array queried
 * through includes.
 *
 * Case-folding the lookup STRENGTHENS this invariant and cannot weaken it:
 * every name it caught before is still caught, and it additionally catches
 * `NPM_EXECPATH`, `Npm_Command` and every other spelling of the names it
 * already listed. A name caught in one spelling and missed in another is the
 * same near-miss class as a name the scrubber never listed at all, which is
 * the shape RC-5 took once already.
 *
 * `init_cwd` is here because npm sets it on a lifecycle child and nothing else
 * does. `npm test` and the CI `Safety boundary suites` step both reach the
 * test process through scripts/run-tests.mjs, which strips it; a direct
 * `node --test` with no npm in front of it never had it to begin with. All
 * three entry points are green on it, and a fourth one that is not is exactly
 * what this invariant exists to report.
 */
const NPM_LIFECYCLE_SINGLETON_NAMES: readonly string[] = [
  "npm_execpath",
  "npm_command",
  "npm_node_execpath",
  "init_cwd",
];

test("the test runner environment carries no npm lifecycle injection", () => {
  const injected = Object.keys(process.env).filter(
    (name) => NPM_LIFECYCLE_INJECTION.test(name) || NPM_LIFECYCLE_SINGLETON_NAMES.includes(name.toLowerCase()),
  );
  assert.deepEqual(
    injected,
    [],
    `the test process inherited npm lifecycle injection: ${injected.join(", ")}. While these names exist, the ` +
      "write location of every child this process launches is decided by how the suite was invoked rather than " +
      "by the code under test, so the surface the preview oracle observes differs between `npm test` and a bare " +
      "`node --test`. The suite must run through scripts/run-tests.mjs, which strips them before spawning.",
  );
});

/**
 * The child environment for both halves of the differential test below. It is
 * built from the same explicit allowlist SANDBOX_ENVIRONMENT_PASSTHROUGH uses
 * rather than by spreading the ambient environment - spreading is the defect
 * this file already fixed once - plus the three injected names whose fate is
 * the thing under test. `npm_config_prefix` is the name the windows-latest
 * runner image sets at machine scope; `npm_lifecycle_event` is reached by the
 * prefix regex; `INIT_CWD` is reached only by the exact-name set, and only in
 * its case-folded form.
 */
function injectedChildEnvironment(injectedPrefix: string): NodeJS.ProcessEnv {
  const forwarded = new Set(SANDBOX_ENVIRONMENT_PASSTHROUGH.map((name) => name.toUpperCase()));
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (!forwarded.has(name.toUpperCase())) continue;
    env[name] = value;
  }
  env.npm_config_prefix = injectedPrefix;
  env.npm_lifecycle_event = "test";
  env.INIT_CWD = repositoryRoot;
  return env;
}

/**
 * The probe's verdict rule is serialized from the two constants above,
 * including the case-folded lookup, rather than restated. A probe with its own
 * rule is a second oracle that drifts from the first; a probe that copied the
 * values but not the lookup would miss `INIT_CWD` and would then prove the
 * routed invocation green for the wrong reason.
 */
const INJECTION_PROBE_SOURCE = [
  'import assert from "node:assert/strict";',
  'import test from "node:test";',
  "",
  `const INJECTION = ${NPM_LIFECYCLE_INJECTION.toString()};`,
  `const SINGLETONS = ${JSON.stringify(NPM_LIFECYCLE_SINGLETON_NAMES)};`,
  "",
  'test("the probe child carries no npm lifecycle injection", () => {',
  "  const injected = Object.keys(process.env).filter(",
  "    (name) => INJECTION.test(name) || SINGLETONS.includes(name.toLowerCase()),",
  "  );",
  "  assert.deepEqual(",
  "    injected,",
  "    [],",
  '    `the probe child inherited npm lifecycle injection: ${injected.join(", ")}`,',
  "  );",
  "});",
  "",
].join("\n");

test("the CI safety-suite invocation scrubs an injected npm setting that a bare invocation keeps", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "alpha-aos-injection-"));
  context.after(async () => rm(sandbox, { recursive: true, force: true }));

  // Written outside dist/test and named by absolute path, so `--files` is
  // exercised on a path the runner's own enumeration would never reach.
  const probe = join(sandbox, "injection-probe.test.js");
  await writeFile(probe, INJECTION_PROBE_SOURCE, "utf8");

  const env = injectedChildEnvironment(join(sandbox, "prefix"));

  const routed = spawnSync(
    process.execPath,
    [join(repositoryRoot, "scripts", "run-tests.mjs"), "--files", probe],
    { cwd: repositoryRoot, env, encoding: "utf8", timeout: 60_000, windowsHide: true },
  );
  assert.equal(
    routed.status,
    0,
    "the invocation the CI safety step uses must hand the test process an environment free of npm " +
      "lifecycle injection, whatever the runner image put in this process's own environment\n" +
      `stdout: ${(routed.stdout ?? "").slice(0, 800)}\nstderr: ${(routed.stderr ?? "").slice(0, 800)}`,
  );

  const bare = spawnSync(process.execPath, ["--test", probe], {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  const bareOutput = `${bare.stdout ?? ""}${bare.stderr ?? ""}`;
  assert.notEqual(
    bare.status,
    0,
    "the negative control must still fail: a bare `node --test` strips nothing, so if it passes under " +
      "this injection the probe has stopped detecting what it claims to detect\n" +
      `stdout: ${(bare.stdout ?? "").slice(0, 800)}\nstderr: ${(bare.stderr ?? "").slice(0, 800)}`,
  );
  assert.ok(
    bareOutput.includes("npm_config_prefix"),
    "the negative control must fail FOR THE INJECTION, not for an unrelated non-zero exit: the child " +
      `output has to name npm_config_prefix.\noutput: ${bareOutput.slice(0, 800)}`,
  );

  // Logged rather than gated on purpose. The full set of names npm adds varies
  // by npm version, so asserting the difference would make this acceptance
  // gate hostage to an npm upgrade. As a diagnostic it still puts the
  // divergence in every leg's log, so the next one is visible instead of
  // being discovered as a red leg.
  const stripped = Object.keys(env)
    .filter(
      (name) =>
        NPM_LIFECYCLE_INJECTION.test(name) || NPM_LIFECYCLE_SINGLETON_NAMES.includes(name.toLowerCase()),
    )
    .sort();
  context.diagnostic(
    `environment names the bare invocation keeps and the routed invocation drops: ${stripped.join(", ") || "(none)"}`,
  );
});

/** The suites the CI safety step names, in the order it names them. */
const CI_SAFETY_SUITES: readonly string[] = [
  "dist/test/preview.test.js",
  "dist/test/path-boundary.test.js",
  "dist/test/transaction-crash.test.js",
  "dist/test/redaction.test.js",
  "dist/test/validation.test.js",
  "dist/test/process.test.js",
  "dist/test/protocol-session.test.js",
  "dist/test/mcp-proxy.test.js",
  "dist/test/install.test.js",
  "dist/test/update.test.js",
];

test("the CI safety step reaches the suite through the scrubbing runner", async () => {
  const workflow = await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8");

  // Only this step's region is examined. Searching the whole file would pass
  // on a `scripts/run-tests.mjs` occurring in some other step, and would
  // therefore say nothing at all about this one. The marker is anchored to a
  // whole line: a plain `indexOf` would also match a step merely NAMED with
  // this as a prefix, so a rename could slip past and this test would go on
  // asserting against a step that is no longer the one CI runs.
  const marker = /^[ \t]*- name: Safety boundary suites[ \t]*$/mu;
  const located = marker.exec(workflow);
  if (located === null) {
    assert.fail(
      "the step named `Safety boundary suites` is absent from .github/workflows/ci.yml. That name is the " +
        "anchor three legs' logs are compared across runs by, and without it this test would pass while " +
        "guarding nothing.",
    );
  }
  const rest = workflow.slice(located.index + located[0].length);
  const nextStep = rest.indexOf("- name:");
  const region = nextStep === -1 ? rest : rest.slice(0, nextStep);

  assert.ok(
    region.includes("scripts/run-tests.mjs"),
    "the `Safety boundary suites` step must reach the test process through scripts/run-tests.mjs. A bare " +
      "`node --test` here is RC-5: the windows-latest image sets npm_config_prefix at machine scope and " +
      `nothing would strip it.\nstep region: ${region.slice(0, 600)}`,
  );
  assert.ok(
    region.includes("--files"),
    `the step must name its file subset through the runner's --files argument.\nstep region: ${region.slice(0, 600)}`,
  );

  const absent = CI_SAFETY_SUITES.filter((suite) => !region.includes(suite));
  assert.deepEqual(
    absent,
    [],
    `the \`Safety boundary suites\` step no longer names every Phase 1 suite. Missing: ${absent.join(", ")}. ` +
      "A red leg is never made green by dropping a suite from this list.",
  );
});

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
    const homeBefore = await treeDigest(sandbox.home, new Set(), LAUNCHER_FOOTPRINT);
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
    assert.equal(await treeDigest(sandbox.home, new Set(), LAUNCHER_FOOTPRINT), homeBefore, `wrapper \`${family.name}\` mutated the home surface without --apply
${detail}`);
    assert.equal(existsSync(sandbox.stateRoot), false, `wrapper \`${family.name}\` created the managed state root without --apply`);
    assert.equal(await treeDigest(repositoryRoot, CHECKOUT_IGNORED), sourceBefore, `wrapper \`${family.name}\` reached the developer checkout`);
  }

  context.diagnostic(`wrapper families executed: ${executed}; not-run: ${JSON.stringify(notRun)}`);
  assert.equal(executed + notRun.length, families.length, "every wrapper family must be either executed or explicitly recorded as not-run");
});

/** Commands a wrapper must never run itself; the reviewed operation owns them. */
const FORBIDDEN_WRAPPER_COMMANDS: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = [
  { label: "npm ci", pattern: /(?:^|[^-\w])npm\s+ci\b/mu },
  { label: "npm install", pattern: /(?:^|[^-\w])npm\s+install\b/mu },
  { label: "npm run build", pattern: /(?:^|[^-\w])npm\s+run\s+build\b/mu },
  { label: "npm link", pattern: /(?:^|[^-\w])npm\s+link\b/mu },
  { label: "git pull", pattern: /(?:^|[^-\w])git\s+pull\b/mu },
  { label: "git fetch", pattern: /(?:^|[^-\w])git\s+fetch\b/mu },
  { label: "git merge", pattern: /(?:^|[^-\w])git\s+merge\b/mu },
];

const WRAPPER_SCRIPTS = ["install.sh", "install.ps1", "update.sh", "update.ps1"] as const;

test("no wrapper contains a direct mutation command or a fallback that would run one", async () => {
  for (const name of WRAPPER_SCRIPTS) {
    const script = join(scriptsRoot, name);
    assert.equal(existsSync(script), true, `wrapper is missing: ${name}`);
    const source = await readFile(script, "utf8");

    for (const forbidden of FORBIDDEN_WRAPPER_COMMANDS) {
      assert.equal(
        forbidden.pattern.test(source),
        false,
        `wrapper \`${name}\` runs \`${forbidden.label}\` itself; that belongs to the reviewed operation`,
      );
    }

    // The one prerequisite and the one delegation, both present.
    assert.match(source, /build-artifact\.mjs check/u, `wrapper \`${name}\` does not verify the build artifact`);
    assert.match(source, /cli\.js/u, `wrapper \`${name}\` does not delegate to the CLI`);
    assert.match(source, /bootstrap/u, `wrapper \`${name}\` does not delegate to the bootstrap route`);
  }
});

test("a wrapper refuses without a verified build artifact and delegates with one", async (context) => {
  const sandbox = await createSandbox(context);
  const families: ReadonlyArray<{ readonly name: string; readonly script: string; readonly launcher: string; readonly leading: string[] }> = [
    { name: "install.sh", script: join(scriptsRoot, "install.sh"), launcher: "bash", leading: [] },
    { name: "update.sh", script: join(scriptsRoot, "update.sh"), launcher: "bash", leading: [] },
    { name: "install.ps1", script: join(scriptsRoot, "install.ps1"), launcher: "pwsh", leading: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File"] },
    { name: "update.ps1", script: join(scriptsRoot, "update.ps1"), launcher: "pwsh", leading: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File"] },
  ];

  const manifest = join(repositoryRoot, "dist", "build-artifact.json");
  if (!existsSync(manifest)) {
    recordNotRun("wrapper delegation", "this checkout has no build artifact manifest to delegate with");
    return;
  }

  for (const family of families) {
    const launcherProbe = spawnSync(family.launcher, ["--version"], { encoding: "utf8", timeout: 15_000, windowsHide: true });
    if (launcherProbe.status !== 0) {
      recordNotRun(family.name, `${family.launcher} is unavailable on this host`);
      continue;
    }

    const packagesBefore = await treeDigest(sandbox.packageSentinel);
    const homeBefore = await treeDigest(sandbox.home, new Set(), LAUNCHER_FOOTPRINT);
    const sourceBefore = await treeDigest(repositoryRoot, CHECKOUT_IGNORED);

    const result = spawnSync(family.launcher, [...family.leading, family.script], {
      cwd: repositoryRoot,
      env: sandbox.env,
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    // The prerequisite ran and passed, so the wrapper reached its delegation.
    assert.match(output, /build artifact verified/u, `wrapper \`${family.name}\` did not verify the artifact\n${output.slice(0, 400)}`);
    // Whatever the core decides, the wrapper itself changed nothing.
    assert.equal(await treeDigest(sandbox.packageSentinel), packagesBefore, `wrapper \`${family.name}\` touched the package sentinel`);
    assert.equal(await treeDigest(sandbox.home, new Set(), LAUNCHER_FOOTPRINT), homeBefore, `wrapper \`${family.name}\` touched the home surface`);
    assert.equal(await treeDigest(repositoryRoot, CHECKOUT_IGNORED), sourceBefore, `wrapper \`${family.name}\` changed the checkout`);
    assert.equal(existsSync(sandbox.stateRoot), false, `wrapper \`${family.name}\` created the managed state root without an apply`);
  }
});
