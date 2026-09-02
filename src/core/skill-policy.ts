import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";

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

export async function applyClaudeSkillPolicy(options: {
  settingsPath?: string;
  stateRoot?: string;
} = {}): Promise<{ operationId: string | null; plan: ClaudeSkillPolicyPlan }> {
  const plan = await planClaudeSkillPolicy(options);
  if (plan.action === "current") return { operationId: null, plan };
  const journal = await applyFileTransaction({
    stateRoot: options.stateRoot ?? userStateRoot(),
    allowedRoots: [dirname(plan.settingsPath)],
    operations: [{ target: plan.settingsPath, content: plan.rendered }],
  });
  return { operationId: journal.id, plan: await planClaudeSkillPolicy(options) };
}
