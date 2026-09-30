// Why this module exists: Codex keeps a workspace's `.git` read-only unless a
// permission profile names that git directory explicitly, as the 2026-09-30
// host probes showed (codex-cli 0.158.0, elevated Windows sandbox: the legacy
// workspace-write sandbox refuses `git add` on `.git/index.lock`, and a profile
// that names the absolute git directory lets GSD quick commit). GSD quick must
// commit, so an approved local-commit effect has to name exactly one git
// directory. This module decides which one a run may name, from the project
// root alone and without launching anything: the project's own standalone git
// directory, in-tree or behind a one-line `gitdir:` pointer outside the root.
// Everything else — no `.git`, a link, a linked worktree whose objects and refs
// are shared, a pointer back into the root, a target without HEAD or an
// oversized pointer — is not grantable, with a reason.

import { lstat, open, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { canonicalizeWithMissingTail } from "./path-boundary.js";

/** A real `.git` pointer is one short line; anything larger is not one. */
export const TASK_GIT_POINTER_MAX_BYTES = 4096;

/** The maximum number of git control files snapshotGitControl will read before throwing. */
export const TASK_GIT_CONTROL_MAX_FILES = 256;

export async function snapshotGitControl(_options: {
  projectRoot: string;
  gitDirectory: string | null;
}): Promise<Array<[string, string]>> {
  return [];
}

export type TaskGitDirectory =
  | { status: "grantable"; layout: "in-tree" | "external"; gitDirectory: string }
  | {
      status: "not-grantable";
      layout: "missing" | "link" | "linked-worktree" | "unsupported";
      gitDirectory: string | null;
      reason: string;
    };

const POINTER_PREFIX = "gitdir: ";

function refuse(
  layout: "missing" | "link" | "linked-worktree" | "unsupported",
  reason: string,
  gitDirectory: string | null = null,
): TaskGitDirectory {
  return { status: "not-grantable", layout, gitDirectory, reason };
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function errnoCode(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? "unknown";
}

async function readPointer(path: string): Promise<{ text: string } | { reason: string }> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(TASK_GIT_POINTER_MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, TASK_GIT_POINTER_MAX_BYTES + 1, 0);
    if (bytesRead > TASK_GIT_POINTER_MAX_BYTES) {
      return { reason: `the .git file exceeds ${TASK_GIT_POINTER_MAX_BYTES} bytes, so it is not a gitdir pointer` };
    }
    return { text: buffer.subarray(0, bytesRead).toString("utf8") };
  } finally {
    await handle.close();
  }
}

/**
 * Resolves the one git directory a project could grant. Read-only: it lstats
 * and reads, and never follows a link at `.git` or launches git.
 */
export async function resolveTaskGitDirectory(projectRoot: string): Promise<TaskGitDirectory> {
  const root = await canonicalizeWithMissingTail(resolve(projectRoot));
  if (root.reason !== null) return refuse("unsupported", root.reason);
  const dotGit = join(root.canonical, ".git");

  let entry;
  try {
    entry = await lstat(dotGit);
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT") return refuse("missing", "the project root holds no .git, so there is no git directory to grant");
    return refuse("unsupported", `the project .git could not be inspected (${code})`);
  }

  let candidate: string;
  let layout: "in-tree" | "external";
  if (entry.isSymbolicLink()) {
    return refuse("link", "the project .git is a link, which is never followed; only a real git directory can be granted");
  } else if (entry.isDirectory()) {
    candidate = dotGit;
    layout = "in-tree";
  } else if (entry.isFile()) {
    if (entry.size > TASK_GIT_POINTER_MAX_BYTES) {
      return refuse("unsupported", `the .git file exceeds ${TASK_GIT_POINTER_MAX_BYTES} bytes, so it is not a gitdir pointer`);
    }
    const read = await readPointer(dotGit);
    if ("reason" in read) return refuse("unsupported", read.reason);
    const text = read.text.trim();
    if (/[\r\n]/u.test(text) || !text.startsWith(POINTER_PREFIX) || text.slice(POINTER_PREFIX.length).trim() === "") {
      return refuse("unsupported", "the .git file is not a single-line gitdir pointer");
    }
    candidate = resolve(root.canonical, text.slice(POINTER_PREFIX.length).trim());
    layout = "external";
  } else {
    return refuse("unsupported", "the project .git is neither a directory nor a gitdir pointer file");
  }

  const resolved = await canonicalizeWithMissingTail(candidate);
  if (resolved.reason !== null) return refuse("unsupported", resolved.reason);
  const gitDirectory = resolved.canonical;

  let target;
  try {
    target = await lstat(gitDirectory);
  } catch (error) {
    return refuse("unsupported", `the git directory ${gitDirectory} named by .git does not exist (${errnoCode(error)})`, gitDirectory);
  }
  if (!target.isDirectory()) {
    return refuse("unsupported", `the git directory ${gitDirectory} named by .git is not a directory`, gitDirectory);
  }
  let head;
  try {
    head = await lstat(join(gitDirectory, "HEAD"));
  } catch {
    head = null;
  }
  if (head === null || !head.isFile()) {
    return refuse("unsupported", `the git directory ${gitDirectory} has no HEAD file, so it is not a repository`, gitDirectory);
  }

  let commonDirectory: string | null = null;
  try {
    const common = await lstat(join(gitDirectory, "commondir"));
    if (common.isFile() && common.size <= TASK_GIT_POINTER_MAX_BYTES) {
      const text = (await readFile(join(gitDirectory, "commondir"), "utf8")).trim();
      const shared = await canonicalizeWithMissingTail(resolve(gitDirectory, text));
      commonDirectory = shared.canonical;
    } else {
      commonDirectory = join(gitDirectory, "commondir");
    }
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") commonDirectory = join(gitDirectory, "commondir");
  }
  if (commonDirectory !== null) {
    return refuse(
      "linked-worktree",
      `a linked worktree shares objects and refs with ${commonDirectory}; only a standalone git directory can be granted`,
      gitDirectory,
    );
  }

  if (layout === "external" && isInside(root.canonical, gitDirectory)) {
    return refuse(
      "unsupported",
      `the .git pointer names ${gitDirectory}, inside the project root, where the controller's workspace write would reach it; only a git directory outside the root can be named by a pointer`,
      gitDirectory,
    );
  }

  return { status: "grantable", layout, gitDirectory };
}

/**
 * The git directory an approved contract lets the controller write: the
 * resolved directory when it is grantable and local-commit is an allowed
 * effect, else null. Pure.
 */
export function grantedGitDirectory(
  contract: { readonly allowedEffects: readonly string[] },
  resolution: TaskGitDirectory,
): string | null {
  if (resolution.status !== "grantable") return null;
  return contract.allowedEffects.includes("local-commit") ? resolution.gitDirectory : null;
}
