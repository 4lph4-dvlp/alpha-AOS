import { lstat, readFile, mkdir, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ComputerSession, stopComputerSession } from "./computer-use.js";
import { verifyComputerAudit, safeComputerPath, expireComputerCaptures } from "./computer-use-audit.js";
import { computerHash, validateComputerAuthority, decideComputerVerification } from "./computer-use-policy.js";
import type { ComputerAuthority, ComputerAction } from "./computer-use-policy.js";
import type { ComputerPostcondition } from "./computer-use.js";
import type { ComputerAnchor } from "./computer-use-audit.js";
import { loadTaskContract, readTaskApprovals, reservedRunIdForApproval } from "./task-contract.js";
import { CuaComputerTransport } from "../adapters/computer-use-cua.js";
import type { CuaRuntimeApproval } from "../adapters/computer-use-cua.js";
import { userStateRoot, packageRoot } from "./paths.js";

export async function readComputerJson(path: string): Promise<unknown> {
  await safeComputerPath(path); const stat = await lstat(path);
  if (!stat.isFile() || stat.size > 262144) throw new Error("Computer JSON input exceeds file bound");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
export function computerAuthorityGrantHash(a: ComputerAuthority): string {
  const { runId: _run, contractDigest: _digest, ...grant } = a; return computerHash(grant);
}
export async function requireComputerGrant(contractPath: string, a: ComputerAuthority): Promise<{ deterministic: boolean; reversible: boolean; projectRoot: string }> {
  const loaded = await loadTaskContract(contractPath);
  const grant = loaded.contract.computerUse;
  if (!grant || loaded.digest !== a.contractDigest || grant.authorityHash !== computerAuthorityGrantHash(a)) throw new Error("Computer authority is absent from approved task digest");
  const approvals = await readTaskApprovals({ stateRoot: userStateRoot(), contractId: loaded.contract.id });
  if (!approvals.some((v) => v.contractDigest === loaded.digest && reservedRunIdForApproval(v) === a.runId)) throw new Error("Computer task/run is not approved");
  return { deterministic: grant.deterministic, reversible: grant.reversible, projectRoot: loaded.contract.scope.projectRoot };
}
export async function computerDoctor(root = packageRoot()): Promise<Record<string, unknown>> {
  const pin = await readComputerJson(join(root, "catalog", "computer-use-runtime.json")) as Record<string, unknown>;
  return { capability: "computer-use", version: pin.version, optional: true, enabled: false, nativeUse: "unverified", platform: process.platform, arch: process.arch, reason: "Task-local verified runtime and approved exact-target authority required; configuration is not invocation proof", stableLockPromotion: false };
}
export async function runComputerCommand(args: string[]): Promise<unknown> {
  const operation = args[0] ?? "doctor";
  const option = (name: string): string | undefined => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  if (operation === "doctor") return computerDoctor();
  if (["report", "replay", "retain"].includes(operation)) {
    const root = option("--evidence"); const run = option("--run"); const anchorPath = option("--anchor");
    if (!root || !run || !anchorPath) throw new Error("Computer report/replay requires --evidence --run --anchor");
    const anchor = await readComputerJson(anchorPath) as ComputerAnchor;
    if (operation === "retain") {
      if (!args.includes("--apply") || !args.includes("--reviewed")) return { dryRun: true, requiresReview: true, defaultRetentionDays: 7 };
      const expiry = Number(option("--older-than"));
      return expireComputerCaptures(root, run, anchor, { reviewed: true, olderThan: expiry });
    }
    return verifyComputerAudit(root, run, anchor);
  }
  if (operation === "stop") {
    const root = option("--evidence"); const run = option("--run"); if (!root || !run) throw new Error("Computer stop requires --evidence --run");
    await stopComputerSession(root, run); return { stopped: true, runId: run };
  }
  if (!["plan", "action", "mcp"].includes(operation)) throw new Error("Unknown computer-use operation");
  const authorityPath = option("--authority"); const contractPath = option("--contract");
  if (!authorityPath || !contractPath) throw new Error("Computer plan/action/mcp requires --authority and --contract");
  const a = validateComputerAuthority(await readComputerJson(authorityPath)); const grant = await requireComputerGrant(contractPath, a);
  const decision = decideComputerVerification({ mode: "autopilot", ...grant, covered: true });
  if (operation === "plan" || !args.includes("--apply")) return { dryRun: true, runId: a.runId, authorityHash: computerAuthorityGrantHash(a), decision, preference: "Use an application CLI/API when available" };
  if (decision.mode !== "automatic") throw new Error("Computer verification needs manual human judgment");
  const runtimePath = option("--runtime"); if (!runtimePath) throw new Error("Computer apply requires a reviewed --runtime receipt");
  const ownedRoot = join(resolve(grant.projectRoot), ".alpha-aos", "computer-use-runtime"); await safeComputerPath(ownedRoot); await mkdir(ownedRoot, { recursive: true, mode: 0o700 });
  const evidenceRoot = join(resolve(grant.projectRoot), ".alpha-aos", "computer-use-evidence");
  const pin = await readComputerJson(join(packageRoot(), "catalog", "computer-use-runtime.json")) as Record<string, unknown>;
  const transport = await CuaComputerTransport.connect(a, await readComputerJson(runtimePath) as CuaRuntimeApproval, pin, ownedRoot);
  const session = await ComputerSession.open(a, transport, evidenceRoot);
  await session.audit.append("decision", { decision: decision.mode, reason: decision.reason, contractDigest: a.contractDigest });
  try {
    if (operation === "mcp") {
      const { serveComputerMcp } = await import("./computer-use-mcp.js"); await serveComputerMcp(session); return undefined;
    }
    const requestPath = option("--request"); if (!requestPath) throw new Error("Computer action requires --request JSON file");
    const request = await readComputerJson(requestPath) as { action: ComputerAction; postcondition: ComputerPostcondition };
    return await session.action(request.action, request.postcondition);
  } finally {
    const anchor = await session.audit.checkpoint();
    const anchorFile = await open(join(evidenceRoot, `${a.runId}.anchor.json`), "wx", 0o600);
    try { await anchorFile.writeFile(JSON.stringify(anchor)); await anchorFile.sync(); } finally { await anchorFile.close(); await session.close(); }
  }
}
