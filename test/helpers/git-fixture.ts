// The git shape builder: the one instrument in this repository that produces a
// REAL repository boundary for a test to judge against.
//
// This module is NOT a test. It lives beside `termination-oracle.ts` in
// `test/helpers/` for the same reason that one does: `scripts/run-tests.mjs`
// reads `dist/test` without recursion and keeps only `entry.isFile()`, so
// `dist/test/helpers` is never enumerated as a suite. `tsconfig.json` includes
// `test/**/*.ts` with `rootDir: "."`, so this compiles to
// `dist/test/helpers/git-fixture.js` and nowhere else.
//
// Why it exists. `.git` is a DIRECTORY for an ordinary repository and for a
// nested `git init`, and a FILE for a linked worktree and for a submodule
// (verified on Git 2.55.0, transcribed in 02-RESEARCH.md §Pattern 2). A
// boundary rule written against the "a repository has a .git directory" mental
// model walks straight into two of the four, borrowing their evidence — the
// precise DETC-01 failure `.planning/research/PITFALLS.md` §Pitfall 4 names.
// A hand-built directory containing a fake `.git` file cannot prove the rule,
// because the thing under test is whether the rule matches what git ACTUALLY
// produces. So every shape here is built by git itself.
//
// Every builder returns evidence rather than a boolean: the created path, the
// `.git` entry's kind and pointer text, the git invocations that produced it,
// and — where one applies — the superproject `.gitmodules` path and the
// parent's own `git status` line. A caller asserting on that evidence is
// asserting on the fixture it actually got.
//
// Three constraints are load-bearing and enforced here rather than trusted:
//
//  1. **No network, ever.** `test/preview.test.ts` already forbids network git
//     in shipped scripts; this helper is test-only, but a fixture that reached
//     the network would make the suite depend on a remote host. `runGit`
//     refuses an argv whose first non-option token is in
//     `FORBIDDEN_GIT_SUBCOMMANDS`, so a future edit cannot quietly add a
//     `clone <url>` or a `fetch`. (`--no-hardlinks` is a `git clone` flag and
//     no builder invokes `clone`; `git submodule add` clones internally from a
//     local path, which is why `protocol.file.allow` is set per-invocation
//     rather than globally.)
//  2. **No dependence on the host's git identity.** Every fixture repository
//     gets its own local `user.name` / `user.email`, so a commit succeeds on a
//     machine with no global git config — including CI.
//  3. **Unavailable is reported, not thrown.** A host without git on PATH gets
//     `{ ok: false, reason }` so the consuming test can `context.skip` with a
//     named reason. A skipped fixture is visible in output; an absent one is
//     not, and the four boundary cases silently not running is exactly how a
//     containment guarantee stops being guarded.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type GitFixtureShape = "ordinary-repository" | "linked-worktree" | "submodule" | "nested-repository";

export interface GitEntryEvidence {
  /** Absolute path of the `.git` entry itself. */
  readonly path: string;
  /** What git actually created here, observed with `statSync`. */
  readonly kind: "directory" | "file";
  /** The trimmed `gitdir:` line for a `.git` FILE; null for a directory. */
  readonly pointer: string | null;
}

export interface GitFixture {
  readonly shape: GitFixtureShape;
  /** Absolute path of the created working tree. */
  readonly path: string;
  readonly gitEntry: GitEntryEvidence;
  /** Superproject `.gitmodules` for a submodule; null for every other shape. */
  readonly gitmodulesPath: string | null;
  /** The parent working tree's own `git status --porcelain`, where one applies. */
  readonly parentStatus: string | null;
  /** Every git invocation that produced this fixture, in order. */
  readonly commands: readonly string[];
  readonly description: string;
}

export type GitFixtureResult =
  | { readonly ok: true; readonly fixture: GitFixture }
  | { readonly ok: false; readonly reason: string };

/**
 * Subcommands that can reach a remote host. Refused by `runGit` rather than
 * merely avoided by convention, because "we do not do that" is not a control.
 */
export const FORBIDDEN_GIT_SUBCOMMANDS: readonly string[] = ["clone", "fetch", "pull", "push", "remote", "ls-remote"];

/** 4 KiB is far above any `.git` pointer file; anything larger is not one. */
const GIT_ENTRY_BYTE_CAP = 4096;

/**
 * A prompt would hang the suite rather than fail it, so terminal and askpass
 * prompting are disabled outright. The system-level config is skipped so a
 * machine-wide `[init] templateDir` or hook path cannot alter a fixture's
 * shape; the per-repository identity below replaces what the global config
 * would otherwise supply.
 */
const GIT_ENVIRONMENT: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_ADVICE_DETACHEDHEAD: "0",
};

const FIXTURE_IDENTITY: readonly (readonly string[])[] = [
  ["config", "user.name", "alpha-aos fixture"],
  ["config", "user.email", "fixture@alpha-aos.invalid"],
  ["config", "commit.gpgsign", "false"],
  ["config", "core.autocrlf", "false"],
];

export interface GitRun {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly display: string;
}

/** The first token that is not an option or a `-c key=value` pair. */
function subcommandOf(args: readonly string[]): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] as string;
    if (token === "-c" || token === "-C") {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    return token;
  }
  return null;
}

function runGit(cwd: string, args: readonly string[]): GitRun {
  const subcommand = subcommandOf(args);
  if (subcommand !== null && FORBIDDEN_GIT_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(`git-fixture refuses a network-capable subcommand: ${subcommand}`);
  }
  const display = `git ${args.join(" ")}`;
  const result = spawnSync("git", [...args], { cwd, env: GIT_ENVIRONMENT, encoding: "utf8", windowsHide: true });
  if (result.error !== undefined) {
    return { ok: false, stdout: "", stderr: String(result.error), display };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    display,
  };
}

/**
 * One git invocation inside an already-built fixture.
 *
 * Exported so a test can BRANCH, COMMIT or PACK REFS on a fixture repository
 * without reimplementing the environment hardening above — and, more to the
 * point, without escaping `FORBIDDEN_GIT_SUBCOMMANDS`: this routes through the
 * same `runGit`, so a future edit still cannot quietly reach the network.
 */
export function gitCommand(cwd: string, args: readonly string[]): GitRun {
  return runGit(cwd, args);
}

interface GitAvailability {
  readonly available: boolean;
  /** The `git --version` line, or null when git could not be probed. */
  readonly version: string | null;
  /** Why it is unavailable. Null when it is available. */
  readonly reason: string | null;
}

let availability: GitAvailability | null = null;

/** Probes `git --version` once per process and memoizes the answer. */
export function gitAvailability(): GitAvailability {
  if (availability !== null) return availability;
  const probe = spawnSync("git", ["--version"], { env: GIT_ENVIRONMENT, encoding: "utf8", windowsHide: true });
  if (probe.error !== undefined || probe.status !== 0) {
    availability = {
      available: false,
      version: null,
      reason: "git is not available on this host, so no real repository shape can be built",
    };
    return availability;
  }
  availability = { available: true, version: (probe.stdout ?? "").trim(), reason: null };
  return availability;
}

/** Reads the `.git` entry as git left it — kind first, pointer text second. */
function inspectGitEntry(workingTree: string): GitEntryEvidence | null {
  const entryPath = join(workingTree, ".git");
  if (!existsSync(entryPath)) return null;
  const info = statSync(entryPath);
  if (info.isDirectory()) return { path: entryPath, kind: "directory", pointer: null };
  if (info.size > GIT_ENTRY_BYTE_CAP) return { path: entryPath, kind: "file", pointer: null };
  return { path: entryPath, kind: "file", pointer: readFileSync(entryPath, "utf8").trim() };
}

interface Recorder {
  readonly commands: string[];
  run(cwd: string, args: readonly string[]): GitRun;
}

function recorder(): Recorder {
  const commands: string[] = [];
  return {
    commands,
    run(cwd, args) {
      const result = runGit(cwd, args);
      commands.push(result.display);
      return result;
    },
  };
}

function failed(run: GitRun): string {
  const detail = (run.stderr || run.stdout).trim().split(/\r?\n/)[0] ?? "no output";
  return `\`${run.display}\` failed: ${detail}`;
}

/**
 * `git init` + local identity + one commit. The commit matters: a submodule
 * cannot be added from a repository with no commits, and a worktree cannot be
 * created from one either.
 */
async function initialiseRepository(
  log: Recorder,
  directory: string,
  fileName: string,
): Promise<string | null> {
  await mkdir(directory, { recursive: true });
  const init = log.run(directory, ["init", "-b", "main"]);
  if (!init.ok) return failed(init);
  for (const identity of FIXTURE_IDENTITY) {
    const applied = log.run(directory, identity);
    if (!applied.ok) return failed(applied);
  }
  await writeFile(join(directory, fileName), `${fileName}\n`, "utf8");
  const staged = log.run(directory, ["add", "--", fileName]);
  if (!staged.ok) return failed(staged);
  const committed = log.run(directory, ["commit", "-m", "fixture: initial commit"]);
  if (!committed.ok) return failed(committed);
  return null;
}

function assembled(
  shape: GitFixtureShape,
  path: string,
  log: Recorder,
  description: string,
  extra: { gitmodulesPath?: string | null; parentStatus?: string | null } = {},
): GitFixtureResult {
  const gitEntry = inspectGitEntry(path);
  if (gitEntry === null) {
    return { ok: false, reason: `${shape} fixture produced no .git entry at ${path}` };
  }
  return {
    ok: true,
    fixture: {
      shape,
      path,
      gitEntry,
      gitmodulesPath: extra.gitmodulesPath ?? null,
      parentStatus: extra.parentStatus ?? null,
      commands: [...log.commands],
      description,
    },
  };
}

function unavailable(): GitFixtureResult | null {
  const probe = gitAvailability();
  return probe.available ? null : { ok: false, reason: probe.reason ?? "git is unavailable" };
}

/**
 * An ordinary repository: `git init` in a new directory. Produces a `.git`
 * DIRECTORY.
 */
export async function createOrdinaryRepository(parent: string, name: string): Promise<GitFixtureResult> {
  const blocked = unavailable();
  if (blocked !== null) return blocked;

  const log = recorder();
  const path = join(parent, name);
  const failure = await initialiseRepository(log, path, "README.md");
  if (failure !== null) return { ok: false, reason: failure };
  return assembled("ordinary-repository", path, log, `ordinary repository created by git init at ${path}`);
}

/**
 * A linked worktree: `git worktree add`. Produces a `.git` FILE whose
 * `gitdir:` pointer is ABSOLUTE. The worktree is placed INSIDE the
 * repository's own working tree on purpose — that is the shape a scan
 * actually meets, and the shape an `isDirectory()` boundary test walks into.
 */
export async function createLinkedWorktree(repository: string, name: string): Promise<GitFixtureResult> {
  const blocked = unavailable();
  if (blocked !== null) return blocked;

  const log = recorder();
  const path = join(repository, name);
  const added = log.run(repository, ["worktree", "add", "-b", `fixture-${name}`, path]);
  if (!added.ok) return { ok: false, reason: failed(added) };
  for (const identity of FIXTURE_IDENTITY) {
    const applied = log.run(path, identity);
    if (!applied.ok) return { ok: false, reason: failed(applied) };
  }
  return assembled("linked-worktree", path, log, `linked worktree created by git worktree add at ${path}`);
}

/**
 * A submodule: `git submodule add`. Produces a `.git` FILE whose `gitdir:`
 * pointer is RELATIVE, plus a `.gitmodules` entry at the superproject root.
 *
 * `protocol.file.allow=always` is required from Git 2.38 onward: adding a
 * submodule from a local path uses the `file` transport, which is refused by
 * default since CVE-2022-39253. It is set per invocation, never written into
 * a config file, and the source is always a local path — never a URL.
 */
export async function createSubmodule(
  superproject: string,
  childRepository: string,
  path: string,
): Promise<GitFixtureResult> {
  const blocked = unavailable();
  if (blocked !== null) return blocked;

  const log = recorder();
  // git wants a POSIX-shaped source even on Windows.
  const source = childRepository.split("\\").join("/");
  const added = log.run(superproject, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "--",
    source,
    path,
  ]);
  if (!added.ok) return { ok: false, reason: failed(added) };
  const committed = log.run(superproject, ["commit", "-m", "fixture: add submodule"]);
  if (!committed.ok) return { ok: false, reason: failed(committed) };

  const workingTree = join(superproject, path);
  const gitmodulesPath = join(superproject, ".gitmodules");
  if (!existsSync(gitmodulesPath)) {
    return { ok: false, reason: `submodule fixture left no .gitmodules at ${gitmodulesPath}` };
  }
  return assembled("submodule", workingTree, log, `submodule added at ${workingTree}`, { gitmodulesPath });
}

/**
 * A nested `git init` inside an existing working tree. Produces a `.git`
 * DIRECTORY that the parent's own `git status` reports as one opaque
 * untracked directory — git itself does not descend, and neither may we.
 */
export async function createNestedRepository(parent: string, name: string): Promise<GitFixtureResult> {
  const blocked = unavailable();
  if (blocked !== null) return blocked;

  const log = recorder();
  const path = join(parent, name);
  const failure = await initialiseRepository(log, path, "NESTED.md");
  if (failure !== null) return { ok: false, reason: failure };

  const status = log.run(parent, ["status", "--porcelain"]);
  return assembled("nested-repository", path, log, `nested git init inside a working tree at ${path}`, {
    parentStatus: status.ok ? status.stdout : null,
  });
}
