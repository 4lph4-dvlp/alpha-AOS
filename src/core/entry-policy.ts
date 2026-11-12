import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { isMap, isSeq, parseDocument } from "yaml";
import type { HarnessId } from "../types.js";
import { hermesHome } from "../adapters/harnesses.js";
import { packageRoot, userStateRoot } from "./paths.js";
import { proveOperationPaths, type OperationPathProofSet } from "./path-boundary.js";
import { assertPlanUnchanged, assertUnchangedSincePlan, ComponentPlanError, plannedProof, reviewedDigest, withComponentSession } from "./component-session.js";
import { applyFileTransaction } from "./transaction.js";
import type { MutationSession } from "./writer-lock.js";

const startMarker = "<!-- alpha-AOS:task-entry:start -->";
const endMarker = "<!-- alpha-AOS:task-entry:end -->";
const markerPrefix = "<!-- alpha-AOS:task-entry:";

export interface EntryPolicyOptions {
  harness: HarnessId;
  root?: string;
  configRoot?: string;
  stateRoot?: string;
}

export interface EntryPolicyOperationPlan {
  kind: "task-entry-policy";
  harness: HarnessId;
  root: string;
  configRoot: string;
  stateRoot: string;
  source: string;
  target: string;
  override: string | null;
  action: "create" | "update" | "current";
  sourceHash: string;
  currentHash: string | null;
  renderedHash: string;
  proofs: OperationPathProofSet;
  digest: string;
}

export function entryPolicyRoot(harness: HarnessId, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  switch (harness) {
    case "claude": return env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude");
    case "codex": return env.CODEX_HOME?.trim() || join(home, ".codex");
    case "pi": return env.PI_CODING_AGENT_DIR?.trim() || join(home, ".pi", "agent");
    case "antigravity": return env.ANTIGRAVITY_CONFIG_DIR?.trim() || join(home, ".gemini");
    case "hermes": return hermesHome(env, home);
  }
}

export function entryPolicyPath(harness: HarnessId, configRoot = entryPolicyRoot(harness)): string {
  const filename = harness === "claude" ? "CLAUDE.md" : harness === "antigravity" ? "GEMINI.md" : harness === "hermes" ? "config.yaml" : "AGENTS.md";
  return join(configRoot, filename);
}

function blockRange(content: string): [number, number] | null {
  const occurrences = content.split(markerPrefix).length - 1;
  if (occurrences === 0) return null;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  const markerLine = (offset: number, marker: string): boolean => (offset === 0 || content[offset - 1] === "\n")
    && /^(?:\r?\n|$)/u.test(content.slice(offset + marker.length));
  if (occurrences !== 2 || start < 0 || end <= start || !markerLine(start, startMarker) || !markerLine(end, endMarker)) {
    throw new Error("Malformed alpha-AOS task-entry markers; preserve user instructions and repair ownership before sync");
  }
  return [start, end + endMarker.length];
}

export function stripEntryPolicy(content: string): string {
  const range = blockRange(content);
  return range ? `${content.slice(0, range[0])}${content.slice(range[1])}` : content;
}

export function renderEntryPolicy(existing: string, policy: string): string {
  const block = `${startMarker}\n${policy.trim()}\n${endMarker}`;
  const range = blockRange(existing);
  if (range) return `${existing.slice(0, range[0])}${block}${existing.slice(range[1])}`;
  return `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${block}\n`;
}

export function renderHermesEntryPolicy(existing: string): string {
  const document = parseDocument(existing.trim() ? existing : "{}\n");
  if (document.errors.length > 0 || !isMap(document.contents)) throw new Error("Hermes task-entry config must be a valid YAML mapping");
  const skills = document.get("skills");
  if (skills !== undefined && !isMap(skills)) throw new Error("Hermes skills must be a YAML mapping");
  if (skills === undefined) document.set("skills", document.createNode({}));
  const disabled = document.getIn(["skills", "disabled"]);
  if (isSeq(disabled) && (disabled.toJSON() as unknown[]).includes("alpha-aos-task")) throw new Error("Hermes alpha-aos-task is disabled; preserve the user choice and review native skill policy before sync");
  const current = document.getIn(["skills", "auto_load"]);
  const values: unknown = isSeq(current) ? current.toJSON() : typeof current === "string" ? [current] : current === undefined ? [] : null;
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) throw new Error("Hermes skills.auto_load must contain skill names");
  if (isSeq(current) && values.includes("alpha-aos-task")) return existing;
  if (isSeq(current)) current.add("alpha-aos-task");
  else document.setIn(["skills", "auto_load"], values.includes("alpha-aos-task") ? values : [...values, "alpha-aos-task"]);
  return document.toString({ lineWidth: 0 });
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    // Do not copy native parser or filesystem messages containing user bytes.
    throw new Error("Task-entry instructions could not be read as UTF-8");
  }
}

async function policyContent(plan: EntryPolicyOperationPlan): Promise<{ current: string | null; rendered: string }> {
  await assertUnchangedSincePlan(plan, plannedProof(plan, "source", plan.source));
  await assertUnchangedSincePlan(plan, plannedProof(plan, "target", plan.target));
  if (plan.override) await assertUnchangedSincePlan(plan, plannedProof(plan, "source", plan.override));
  if (plan.override && await readOptional(plan.override) !== null) throw new Error(`${plan.harness} AGENTS.override.md suppresses AGENTS.md; review native precedence before sync`);
  const policy = await readOptional(plan.source);
  if (!policy?.trim() || policy.length > 3600 || policy.includes(markerPrefix)) throw new Error("Task-entry policy asset must contain 1–3600 characters without ownership markers");
  const current = await readOptional(plan.target);
  return { current, rendered: plan.harness === "hermes" ? renderHermesEntryPolicy(current ?? "") : renderEntryPolicy(current ?? "", policy) };
}

export async function planEntryPolicy(options: EntryPolicyOptions): Promise<EntryPolicyOperationPlan> {
  const root = resolve(options.root ?? packageRoot());
  const configRoot = resolve(options.configRoot ?? entryPolicyRoot(options.harness));
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const source = join(root, "docs", "task-entry-policy.md");
  const target = entryPolicyPath(options.harness, configRoot);
  const override = options.harness === "codex" || options.harness === "pi" ? join(configRoot, "AGENTS.override.md") : null;
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "source", path: source }, { role: "target", path: target },
      ...(override ? [{ role: "source" as const, path: override }] : []),
      { role: "state", path: stateRoot }, { role: "journal", path: join(stateRoot, "journal") }, { role: "snapshot", path: join(stateRoot, "snapshots") },
    ],
    allowedRoots: [configRoot, stateRoot, join(root, "docs")],
    requiredRoles: ["source", "target", "state", "journal", "snapshot"],
  });
  if (!proofs.proven) throw new ComponentPlanError("plan-incomplete", `Task-entry policy boundary refused: ${proofs.code}`);
  const plan: EntryPolicyOperationPlan = { kind: "task-entry-policy", harness: options.harness, root, configRoot, stateRoot, source, target, override, action: "create", sourceHash: "", currentHash: null, renderedHash: "", proofs, digest: "" };
  const { current, rendered } = await policyContent(plan);
  plan.action = current === rendered ? "current" : current === null ? "create" : "update";
  plan.sourceHash = hash((await readOptional(source))!);
  plan.currentHash = current === null ? null : hash(current);
  plan.renderedHash = hash(rendered);
  const { proofs: boundary, digest: unused, ...content } = plan;
  plan.digest = reviewedDigest(plan.kind, { ...content, boundary: { code: boundary.code, roles: boundary.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) } });
  return plan;
}

export async function applyEntryPolicy(options: EntryPolicyOptions & { plan?: EntryPolicyOperationPlan; session?: MutationSession }): Promise<{ operationId: string | null; plan: EntryPolicyOperationPlan }> {
  const reviewed = options.plan ?? await planEntryPolicy(options);
  const revalidate = async (): Promise<void> => {
    for (const proof of reviewed.proofs.proofs) await assertUnchangedSincePlan(reviewed, proof);
    assertPlanUnchanged(reviewed, await planEntryPolicy(reviewed));
  };
  await revalidate();
  if (reviewed.action === "current") return { operationId: null, plan: reviewed };
  return withComponentSession(reviewed, options.session, async (session) => {
    await revalidate();
    const { current, rendered } = await policyContent(reviewed);
    if ((current === null ? null : hash(current)) !== reviewed.currentHash || hash(rendered) !== reviewed.renderedHash) throw new ComponentPlanError("plan-drift", "Task-entry instructions changed immediately before write");
    const journal = await applyFileTransaction({ stateRoot: reviewed.stateRoot, allowedRoots: [reviewed.configRoot], operations: [{ target: reviewed.target, content: rendered }], session });
    return { operationId: journal.id, plan: await planEntryPolicy(reviewed) };
  });
}
