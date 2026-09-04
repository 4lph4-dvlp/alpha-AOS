import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  plannedProof,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";

const managedSkills = ["unified-memory", "documentation-lookup", "deep-research"] as const;
const desiredMode = "user-invocable-only" as const;

export interface SkillPolicyEntry {
  skill: typeof managedSkills[number];
  current: string | null;
  desired: typeof desiredMode;
}

export interface ClaudeSkillPolicyPlan {
  target: "claude";
  settingsPath: string;
  action: "create" | "update" | "current";
  currentHash: string | null;
  expectedHash: string;
  entries: SkillPolicyEntry[];
  rendered: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return value as Record<string, unknown>;
}

export function globalClaudeSettingsPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return join(env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude"), "settings.json");
}

export function renderClaudeSkillPolicy(existing: string): string {
  const document = existing.trim() ? objectValue(JSON.parse(existing) as unknown, "Claude settings") : {};
  const rawOverrides = document.skillOverrides;
  const overrides = rawOverrides === undefined ? {} : objectValue(rawOverrides, "Claude skillOverrides");
  for (const skill of managedSkills) overrides[skill] = desiredMode;
  document.skillOverrides = overrides;
  return `${JSON.stringify(document, null, 2)}\n`;
}

export async function planClaudeSkillPolicy(options: {
  settingsPath?: string;
} = {}): Promise<ClaudeSkillPolicyPlan> {
  const settingsPath = options.settingsPath ?? globalClaudeSettingsPath();
  const existing = existsSync(settingsPath) ? await readFile(settingsPath, "utf8") : "";
  const currentDocument = existing.trim() ? objectValue(JSON.parse(existing) as unknown, "Claude settings") : {};
  const rawOverrides = currentDocument.skillOverrides;
  const currentOverrides = rawOverrides === undefined ? {} : objectValue(rawOverrides, "Claude skillOverrides");
  const entries = managedSkills.map((skill): SkillPolicyEntry => ({
    skill,
    current: typeof currentOverrides[skill] === "string" ? currentOverrides[skill] : null,
    desired: desiredMode,
  }));
  const rendered = renderClaudeSkillPolicy(existing);
  const currentHash = existing ? sha256(existing) : null;
  const managedCurrent = entries.every((entry) => entry.current === entry.desired);
  const plan: ClaudeSkillPolicyPlan = {
    target: "claude",
    settingsPath,
    action: managedCurrent ? "current" : currentHash ? "update" : "create",
    currentHash,
    expectedHash: managedCurrent && currentHash ? currentHash : sha256(rendered),
    entries,
    rendered,
  };
  Object.defineProperty(plan, "rendered", { value: rendered, enumerable: false, writable: false });
  return plan;
}

// ---------------------------------------------------------------------------
// Complete operation plan
// ---------------------------------------------------------------------------

export interface ClaudeSkillPolicyOperationPlan {
  kind: "claude-skill-policy";
  settingsPath: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  currentHash: string | null;
  /** Hash of the document that would be written; the text is never recorded. */
  renderedHash: string;
  proofs: OperationPathProofSet;
  digest: string;
  /** The narrow shape existing callers and the CLI already render. */
  policy: ClaudeSkillPolicyPlan;
}

export interface ClaudeSkillPolicyPlanOptions {
  settingsPath?: string;
  stateRoot?: string;
}

/**
 * Enumerates the settings file and state paths this policy write may touch and
 * binds the current and rendered hashes. Reads only; parses strictly, so a
 * settings file this tool cannot understand refuses before any writer exists.
 */
export async function planClaudeSkillPolicyOperation(
  options: ClaudeSkillPolicyPlanOptions = {},
): Promise<ClaudeSkillPolicyOperationPlan> {
  const settingsPath = resolve(options.settingsPath ?? globalClaudeSettingsPath());
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const policy = await planClaudeSkillPolicy({ settingsPath });

  const inputs: OperationPathInput[] = [
    { role: "target", path: settingsPath },
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
  ];
  const allowedRoots = [dirname(settingsPath), stateRoot];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots,
    requiredRoles: ["target", "state", "journal", "snapshot"],
  });

  // The settings file carries unrelated user-owned configuration, so the
  // digest binds the rendered hash rather than the rendered text.
  const renderedHash = sha256(policy.rendered);
  const digest = reviewedDigest("claude-skill-policy", {
    settingsPath,
    stateRoot,
    allowedRoots,
    action: policy.action,
    currentHash: policy.currentHash,
    expectedHash: policy.expectedHash,
    renderedHash,
    entries: policy.entries,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "claude-skill-policy",
    settingsPath,
    stateRoot,
    allowedRoots,
    currentHash: policy.currentHash,
    renderedHash,
    proofs,
    digest,
    policy,
  };
}

export interface ClaudeSkillPolicyApplyOptions extends ClaudeSkillPolicyPlanOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: ClaudeSkillPolicyOperationPlan;
  /** A writer already held by the caller; apply then takes no lock of its own. */
  session?: MutationSession;
}

export async function applyClaudeSkillPolicy(options: ClaudeSkillPolicyApplyOptions = {}): Promise<{
  operationId: string | null;
  plan: ClaudeSkillPolicyPlan;
  digest: string;
}> {
  const reviewed = options.plan ?? await planClaudeSkillPolicyOperation(options);
  if (reviewed.policy.action === "current") return { operationId: null, plan: reviewed.policy, digest: reviewed.digest };

  const planOptions: ClaudeSkillPolicyPlanOptions = { settingsPath: reviewed.settingsPath, stateRoot: reviewed.stateRoot };
  const revalidated = await planClaudeSkillPolicyOperation(planOptions);
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(reviewed, options.session, async (session) => {
    const proof = plannedProof(reviewed, "target", reviewed.settingsPath);
    await assertUnchangedSincePlan(reviewed, proof);
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [dirname(reviewed.settingsPath)],
      operations: [{ target: reviewed.settingsPath, content: revalidated.policy.rendered }],
      session,
    });
    return {
      operationId: journal.id,
      plan: await planClaudeSkillPolicy(planOptions),
      digest: reviewed.digest,
    };
  });
}
