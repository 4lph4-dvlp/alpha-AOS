import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { capabilityLedgerPath, readCapabilityLedger } from "./capability-ledger.js";
import { approvalCommand, ledgerHostEvidence, planProjectCapabilities, reconcileProjectState } from "./project-plan.js";
import type { TaskContract, TaskEffect } from "./task-contract.js";
import { runGitRead } from "./task-gsd.js";

// What a run actually changed, judged against what was approved (AUTO-02,
// D-03). Every path changed after the recorded clean base commit is
// classified; anything the approval did not cover is a violation that blocks
// the run before it is measured or reviewed. Nothing here writes: the pack
// checkpoint plans and reports, and a newly matching pack still needs its own
// exact-digest approval (D-07).

export const DEPENDENCY_LOCKFILES: readonly string[] = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

export const DEPENDENCY_FIELDS: readonly string[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundleDependencies",
  "bundledDependencies",
];

export type TaskBaseline =
  | { status: "clean"; baseCommit: string }
  | { status: "dirty"; paths: string[] }
  | { status: "not-git"; reason: string };

export interface TaskCommit {
  sha: string;
  subject: string;
}

export interface TaskChanges {
  paths: string[];
  commits: TaskCommit[];
}

export interface TaskEffectViolation {
  effect: TaskEffect;
  path: string;
  detail: string;
}

export interface TaskEffectAudit {
  implementationPaths: string[];
  planningPaths: string[];
  violations: TaskEffectViolation[];
  dependencyChanged: boolean;
  dependencyPaths: string[];
}

export interface TaskPackCheckpoint {
  planDigest: string;
  selected: string[];
  applicable: string[];
  approveCommand: string;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/** Paths named by `git status --porcelain=v1 -z`; a rename or copy contributes both of its paths. */
function porcelainPaths(output: string): string[] {
  const tokens = output.split("\0");
  const paths: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.length < 4) continue;
    const status = token.slice(0, 2);
    paths.push(token.slice(3));
    if (/[RC]/u.test(status)) {
      const origin = tokens[index + 1];
      if (origin !== undefined && origin !== "") paths.push(origin);
      index += 1;
    }
  }
  return paths;
}

function nulPaths(output: string): string[] {
  return output.split("\0").filter((entry) => entry !== "");
}

/**
 * The clean commit a run starts from. The project root must be the top level
 * of its repository so every git path is relative to it, and nothing may be
 * modified or untracked, so every later change is attributable to the run.
 */
export async function readTaskBaseline(options: { projectRoot: string }): Promise<TaskBaseline> {
  const projectRoot = resolve(options.projectRoot);
  let prefix: string;
  try {
    prefix = (await runGitRead(projectRoot, ["rev-parse", "--show-prefix"])).trim();
  } catch {
    return { status: "not-git", reason: "the project root is not inside a git repository" };
  }
  if (prefix !== "") {
    return { status: "not-git", reason: `the project root is not the top level of its git repository (it is ${prefix} inside it)` };
  }
  let baseCommit: string;
  try {
    baseCommit = (await runGitRead(projectRoot, ["rev-parse", "--verify", "HEAD"])).trim();
  } catch {
    return { status: "not-git", reason: "the repository has no commit to start from" };
  }
  const paths = sortedUnique(
    porcelainPaths(await runGitRead(projectRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])),
  );
  return paths.length === 0 ? { status: "clean", baseCommit } : { status: "dirty", paths };
}

/** Every path changed after the base commit (committed or not), plus the commits made since. */
export async function readTaskChanges(options: { projectRoot: string; baseCommit: string }): Promise<TaskChanges> {
  const projectRoot = resolve(options.projectRoot);
  const range = `${options.baseCommit}..HEAD`;
  const committed = nulPaths(await runGitRead(projectRoot, ["diff", "--name-only", "--no-renames", "-z", range]));
  const working = porcelainPaths(await runGitRead(projectRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const commits = (await runGitRead(projectRoot, ["log", range, "--format=%H%x09%s"]))
    .split(/\r?\n/u)
    .filter((line) => line !== "")
    .map((line) => {
      const tab = line.indexOf("\t");
      return tab < 0 ? { sha: line, subject: "" } : { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
  return { paths: sortedUnique([...committed, ...working]), commits };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The dependency fields of one manifest text, canonically; null when it does not parse as an object. */
function dependencyView(text: string | null): string | null {
  if (text === null) return canonical({});
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const manifest = parsed as Record<string, unknown>;
  const view: Record<string, unknown> = {};
  for (const field of DEPENDENCY_FIELDS) {
    if (field in manifest) view[field] = manifest[field];
  }
  return canonical(view);
}

async function manifestAtBase(projectRoot: string, baseCommit: string, path: string): Promise<string | null> {
  const listed = nulPaths(await runGitRead(projectRoot, ["ls-tree", "-z", "--name-only", baseCommit, "--", path]));
  if (!listed.includes(path)) return null;
  return runGitRead(projectRoot, ["show", `${baseCommit}:${path}`]);
}

async function manifestNow(projectRoot: string, path: string): Promise<string | null> {
  try {
    return await readFile(join(projectRoot, ...path.split("/")), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Whether one changed manifest's dependency fields differ from the base commit; a parse failure counts as changed. */
async function dependencyFieldsChanged(projectRoot: string, baseCommit: string, path: string): Promise<boolean> {
  const before = dependencyView(await manifestAtBase(projectRoot, baseCommit, path));
  const after = dependencyView(await manifestNow(projectRoot, path));
  return before === null || after === null || before !== after;
}

function underRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * GSD quick's own run state outside `.planning/`: installed gsd-tools records
 * every `query dispatch-isolation` decision in this project-root file. Exact
 * paths only, so any other `.gsd/` write still fails closed.
 */
export const GSD_RUNTIME_STATE_PATHS: readonly string[] = [".gsd/dispatch-isolation-sentinel.json"];

/**
 * alpha-AOS's own project-local control plane runtime state (e.g. controller lock
 * and reclaim log). Exact paths only, so any other write still fails closed.
 */
export const ALPHA_AOS_RUNTIME_STATE_PATHS: readonly string[] = [
  ".alpha-aos/controller.lock",
  ".alpha-aos/controller-reclaim.log",
];

/**
 * Classifies every changed path against the approved authority. `.planning/`
 * and GSD's run state belong to the gsd-quick workflow, the run's own decision log is allowed,
 * and a path equal to or under an allowed root is implementation; anything else
 * is a violation. Commits need local-commit, and a changed lockfile or
 * package.json dependency field needs dependency-change.
 */
export async function auditTaskEffects(options: {
  contract: TaskContract;
  runId: string;
  changes: TaskChanges;
  projectRoot: string;
  baseCommit: string;
}): Promise<TaskEffectAudit> {
  const { contract, runId, changes } = options;
  const projectRoot = resolve(options.projectRoot);
  const decisionLog = `.alpha-aos/task-runs/${runId}/decisions.jsonl`;
  const implementationPaths: string[] = [];
  const planningPaths: string[] = [];
  const violations: TaskEffectViolation[] = [];

  for (const path of sortedUnique(changes.paths)) {
    if (contract.scope.workflow === "gsd-quick" && (underRoot(path, ".planning") || GSD_RUNTIME_STATE_PATHS.includes(path))) {
      planningPaths.push(path);
    } else if (path === decisionLog || ALPHA_AOS_RUNTIME_STATE_PATHS.includes(path)) {
      continue;
    } else if (contract.allowedRoots.some((root) => underRoot(path, root))) {
      implementationPaths.push(path);
    } else {
      violations.push({ effect: "workspace-write", path, detail: "outside the approved roots" });
    }
  }

  if (changes.commits.length > 0 && !contract.allowedEffects.includes("local-commit")) {
    violations.push({
      effect: "local-commit",
      path: "",
      detail: `${changes.commits.length} commit(s) after the base commit without local-commit`,
    });
  }

  const dependencyPaths: string[] = [];
  for (const path of sortedUnique(changes.paths)) {
    const name = path.split("/").at(-1) ?? path;
    if (DEPENDENCY_LOCKFILES.includes(name)) {
      dependencyPaths.push(path);
    } else if (name === "package.json" && (await dependencyFieldsChanged(projectRoot, options.baseCommit, path))) {
      dependencyPaths.push(path);
    }
  }
  const dependencyChanged = dependencyPaths.length > 0;
  if (dependencyChanged && !contract.allowedEffects.includes("dependency-change")) {
    for (const path of dependencyPaths) {
      violations.push({
        effect: "dependency-change",
        path,
        detail: "a dependency manifest or lockfile changed without dependency-change",
      });
    }
  }

  return { implementationPaths, planningPaths, violations, dependencyChanged, dependencyPaths };
}

/**
 * The read-only alpha-aos-control checkpoint after an approved dependency
 * change: the project plan and status, never approve, sync or apply. The
 * returned approve command is for the user to run after their own review.
 */
export async function runPackCheckpoint(options: {
  projectRoot: string;
  packageRoot: string;
  stateRoot: string;
}): Promise<TaskPackCheckpoint> {
  const planOptions = { path: resolve(options.projectRoot), packageRoot: options.packageRoot };
  const plan = await planProjectCapabilities(planOptions);
  const ledger = await readCapabilityLedger(capabilityLedgerPath(options.stateRoot));
  await reconcileProjectState(planOptions, ledgerHostEvidence(ledger));
  return {
    planDigest: plan.planDigest,
    selected: [...plan.selected],
    applicable: [...plan.applicable],
    approveCommand: approvalCommand({ path: planOptions.path, planDigest: plan.planDigest }),
  };
}

// ---------------------------------------------------------------------------
// Effect ledger, deterministic operation keys, and crash reconciliation
// ---------------------------------------------------------------------------

export type EffectStatus = "planned" | "performing" | "applied" | "failed" | "uncertain" | "unknown";

export interface EffectLedgerEntry {
  effectKey: string;
  contractDigest: string;
  attemptIndex: number;
  effectType: TaskEffect;
  targetPayload: Record<string, unknown>;
  status: EffectStatus;
  startedAt: string;
  completedAt: string | null;
  error?: string | null;
  evidence?: string | null;
}

export interface TaskEffectLedger {
  schemaVersion: 1;
  contractDigest: string;
  entries: Record<string, EffectLedgerEntry>;
}

export function generateEffectKey(
  contractDigest: string,
  attemptIndex: number,
  effectType: TaskEffect,
  targetPayload: unknown,
): string {
  const canonicalPayload = canonical(targetPayload);
  const raw = `${contractDigest}:${attemptIndex}:${effectType}:${canonicalPayload}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function createEffectLedger(contractDigest: string): TaskEffectLedger {
  return {
    schemaVersion: 1,
    contractDigest,
    entries: {},
  };
}

export function recordEffectState(ledger: TaskEffectLedger, entry: EffectLedgerEntry): void {
  const existing = ledger.entries[entry.effectKey];
  if (existing !== undefined) {
    const current = existing.status;
    const next = entry.status;
    const valid =
      current === next ||
      (current === "planned" && next === "performing") ||
      (current === "performing" && (next === "applied" || next === "failed" || next === "uncertain")) ||
      (current === "uncertain" && (next === "applied" || next === "unknown" || next === "planned"));

    if (!valid) {
      throw new Error(
        `Invalid effect state transition from "${current}" to "${next}" for effectKey ${entry.effectKey}`,
      );
    }
  } else {
    if (entry.status !== "planned" && entry.status !== "performing") {
      throw new Error(
        `Initial effect state must be "planned" or "performing", received "${entry.status}" for effectKey ${entry.effectKey}`,
      );
    }
  }
  ledger.entries[entry.effectKey] = { ...entry };
}

export async function reconcileEffectEvidence(
  projectRoot: string,
  baseCommit: string,
  entry: EffectLedgerEntry,
): Promise<{ status: "applied" | "not-applied" | "unknown"; reason?: string }> {
  const resolvedRoot = resolve(projectRoot);
  try {
    switch (entry.effectType) {
      case "workspace-write": {
        const relPath = String(entry.targetPayload.relPath ?? "");
        if (!relPath) return { status: "unknown", reason: "relPath missing from workspace-write payload" };
        const filePath = join(resolvedRoot, ...relPath.split("/"));
        let content: Buffer;
        try {
          content = await readFile(filePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            if (entry.targetPayload.beforeSha256 === null) {
              return { status: "not-applied" };
            }
            return { status: "unknown", reason: `File ${relPath} does not exist but beforeSha256 was expected` };
          }
          return { status: "unknown", reason: `Failed to read ${relPath}: ${(error as Error).message}` };
        }
        const fileHash = createHash("sha256").update(content).digest("hex");
        if (entry.targetPayload.afterSha256 && fileHash === entry.targetPayload.afterSha256) {
          return { status: "applied" };
        }
        if (entry.targetPayload.beforeSha256 && fileHash === entry.targetPayload.beforeSha256) {
          return { status: "not-applied" };
        }
        return {
          status: "unknown",
          reason: `File ${relPath} sha256 ${fileHash} matches neither expected afterSha256 nor beforeSha256`,
        };
      }
      case "local-commit": {
        const changes = await readTaskChanges({ projectRoot: resolvedRoot, baseCommit });
        const expectedSubject = entry.targetPayload.expectedSubject ? String(entry.targetPayload.expectedSubject) : null;
        const commitSha = entry.targetPayload.commitSha ? String(entry.targetPayload.commitSha) : null;

        if (commitSha) {
          const match = changes.commits.some((c) => c.sha === commitSha);
          if (match) return { status: "applied" };
        }
        if (expectedSubject) {
          const match = changes.commits.some((c) => c.subject === expectedSubject);
          if (match) return { status: "applied" };
        }

        if (changes.commits.length === 0) {
          return { status: "not-applied" };
        }
        return {
          status: "unknown",
          reason: `Commits exist after baseCommit but none match expected subject or sha`,
        };
      }
      case "dependency-change": {
        const manifestPath = String(entry.targetPayload.manifestPath ?? "package.json");
        const changed = await dependencyFieldsChanged(resolvedRoot, baseCommit, manifestPath);
        return { status: changed ? "applied" : "not-applied" };
      }
      default:
        return { status: "unknown", reason: `Unsupported effect type: ${entry.effectType}` };
    }
  } catch (err) {
    return { status: "unknown", reason: `Reconciliation error: ${(err as Error).message}` };
  }
}

export async function reconcileLedgerOnRecovery(
  projectRoot: string,
  baseCommit: string,
  ledger: TaskEffectLedger,
): Promise<{ ledger: TaskEffectLedger; hasUnknown: boolean; unknownEffects: EffectLedgerEntry[] }> {
  const unknownEffects: EffectLedgerEntry[] = [];

  for (const key of Object.keys(ledger.entries)) {
    const entry = ledger.entries[key]!;
    if (entry.status === "performing" || entry.status === "uncertain") {
      const result = await reconcileEffectEvidence(projectRoot, baseCommit, entry);
      if (result.status === "applied") {
        entry.status = "applied";
        entry.completedAt = new Date().toISOString();
        entry.evidence = "source-evidence-reconciled";
      } else if (result.status === "not-applied") {
        entry.status = "planned";
        entry.completedAt = null;
        entry.evidence = null;
      } else {
        entry.status = "unknown";
        entry.error = result.reason ?? "Ambiguous source evidence";
        unknownEffects.push(entry);
      }
    }
  }

  return {
    ledger,
    hasUnknown: unknownEffects.length > 0,
    unknownEffects,
  };
}
