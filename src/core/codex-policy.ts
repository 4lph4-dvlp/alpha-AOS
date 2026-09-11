import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { codexConfigRoot } from "./gsd-compat.js";
import { packageRoot, userStateRoot } from "./paths.js";
import { proveOperationPaths, type OperationPathProofSet } from "./path-boundary.js";
import { applyFileTransaction } from "./transaction.js";
import type { MutationSession } from "./writer-lock.js";
import { assertPlanUnchanged, assertUnchangedSincePlan, ComponentPlanError, plannedProof, reviewedDigest, withComponentSession } from "./component-session.js";

const startMarker = "<!-- alpha-AOS:codex-execution:start -->";
const endMarker = "<!-- alpha-AOS:codex-execution:end -->";
const markerPrefix = "<!-- alpha-AOS:codex-execution:";

export interface CodexPolicyPlanOptions {
  root?: string;
  configRoot?: string;
  stateRoot?: string;
}

export interface CodexPolicyOperationPlan {
  kind: "codex-execution-policy";
  root: string;
  configRoot: string;
  stateRoot: string;
  source: string;
  target: string;
  override: string;
  action: "create" | "update" | "current";
  sourceHash: string;
  currentHash: string | null;
  renderedHash: string;
  allowedRoots: readonly string[];
  proofs: OperationPathProofSet;
  digest: string;
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function renderCodexPolicy(existing: string, policy: string): string {
  const block = `${startMarker}\n${policy.trim()}\n${endMarker}`;
  const start = existing.indexOf(startMarker);
  const end = existing.indexOf(endMarker);
  const occurrences = existing.split(markerPrefix).length - 1;
  if (occurrences === 0) return `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${block}\n`;
  const markerLine = (offset: number, marker: string): boolean => {
    const before = offset === 0 || existing[offset - 1] === "\n";
    const after = existing.slice(offset + marker.length);
    return before && (after === "" || after.startsWith("\n") || after.startsWith("\r\n"));
  };
  if (occurrences !== 2 || start < 0 || end <= start || !markerLine(start, startMarker) || !markerLine(end, endMarker)) {
    throw new Error("Malformed alpha-AOS Codex execution markers; preserve user text and repair ownership markers before sync");
  }
  return `${existing.slice(0, start)}${block}${existing.slice(end + endMarker.length)}`;
}

async function policyContent(plan: CodexPolicyOperationPlan): Promise<{ current: string | null; policy: string; rendered: string }> {
  for (const [role, path] of [["source", plan.source], ["target", plan.target], ["source", plan.override]] as const) {
    await assertUnchangedSincePlan(plan, plannedProof(plan, role, path));
  }
  // Even an empty override is refused: users may fill it later and silently suppress this policy.
  if (await readOptional(plan.override) !== null) {
    throw new Error("Unsupported Codex instruction precedence: AGENTS.override.md exists; review it before syncing AGENTS.md");
  }
  const policy = await readOptional(plan.source);
  if (policy === null || !policy.trim() || policy.length > 2000 || policy.includes(markerPrefix)) {
    throw new Error("Codex execution policy asset must contain 1–2000 characters without ownership markers");
  }
  const current = await readOptional(plan.target);
  return { current, policy, rendered: renderCodexPolicy(current ?? "", policy) };
}

export async function planCodexPolicy(options: CodexPolicyPlanOptions = {}): Promise<CodexPolicyOperationPlan> {
  const root = resolve(options.root ?? packageRoot());
  const configRoot = resolve(options.configRoot ?? codexConfigRoot());
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const source = join(root, "docs", "codex-execution-policy.md");
  const target = join(configRoot, "AGENTS.md");
  const override = join(configRoot, "AGENTS.override.md");
  const allowedRoots = [configRoot, stateRoot, join(root, "docs")];
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "source", path: source }, { role: "source", path: override },
      { role: "target", path: target }, { role: "state", path: stateRoot },
      { role: "journal", path: join(stateRoot, "journal") },
      { role: "snapshot", path: join(stateRoot, "snapshots") },
    ],
    allowedRoots,
    requiredRoles: ["source", "target", "state", "journal", "snapshot"],
  });
  if (!proofs.proven) throw new ComponentPlanError("plan-incomplete", `Codex policy boundary refused: ${proofs.code}`);
  const plan: CodexPolicyOperationPlan = {
    kind: "codex-execution-policy", root, configRoot, stateRoot, source, target, override,
    action: "create", sourceHash: "", currentHash: null, renderedHash: "", allowedRoots, proofs, digest: "",
  };
  const { current, policy, rendered } = await policyContent(plan);
  plan.action = current === rendered ? "current" : current === null ? "create" : "update";
  plan.sourceHash = hash(policy);
  plan.currentHash = current === null ? null : hash(current);
  plan.renderedHash = hash(rendered);
  const { proofs: boundary, digest: unused, ...content } = plan;
  plan.digest = reviewedDigest(plan.kind, {
    ...content,
    boundary: { code: boundary.code, roles: boundary.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });
  return plan;
}

export async function applyCodexPolicy(options: CodexPolicyPlanOptions & {
  plan?: CodexPolicyOperationPlan;
  session?: MutationSession;
} = {}): Promise<{ operationId: string | null; plan: CodexPolicyOperationPlan }> {
  const reviewed = options.plan ?? await planCodexPolicy(options);
  const revalidate = async (): Promise<CodexPolicyOperationPlan> => {
    for (const proof of reviewed.proofs.proofs) await assertUnchangedSincePlan(reviewed, proof);
    const fresh = await planCodexPolicy(reviewed);
    assertPlanUnchanged(reviewed, fresh);
    return fresh;
  };
  await revalidate();
  if (reviewed.action === "current") return { operationId: null, plan: reviewed };
  return withComponentSession(reviewed, options.session, async (session) => {
    await revalidate();
    const { current, policy, rendered } = await policyContent(reviewed);
    if ((current === null ? null : hash(current)) !== reviewed.currentHash
      || hash(policy) !== reviewed.sourceHash || hash(rendered) !== reviewed.renderedHash) {
      throw new ComponentPlanError("plan-drift", "Codex execution instructions changed immediately before write");
    }
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [reviewed.configRoot],
      operations: [{ target: reviewed.target, content: rendered }],
      session,
    });
    return { operationId: journal.id, plan: await planCodexPolicy(reviewed) };
  });
}
