import { open, mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { TaskContract } from "./task-contract.js";
import type { TaskDecision } from "./task-check.js";
import { computerHash, decideComputerVerification, validateComputerAuthority } from "./computer-use-policy.js";
import { readComputerJson, runComputerCommand } from "./computer-use-command.js";
import { safeComputerPath } from "./computer-use-audit.js";

export interface TaskComputerVerificationResult { status: "verified" | "manual" | "unavailable" | "not-requested"; reason: string; decision: TaskDecision | null }
export async function runTaskComputerVerification(options: {
  contract: TaskContract; contractPath: string; runId: string; digest: string; stateRoot: string;
  execute?: (args: string[], context: { stateRoot: string }) => Promise<unknown>;
}): Promise<TaskComputerVerificationResult> {
  const grant = options.contract.computerUse;
  if (!grant) return { status: "not-requested", reason: "No GUI authority requested", decision: null };
  if (!/^[a-zA-Z0-9][\w-]{0,95}$/.test(options.runId)) throw new Error("Computer task run id invalid");
  const routing = decideComputerVerification({ mode: "autopilot", deterministic: grant.deterministic, reversible: grant.reversible, covered: grant.verification !== undefined });
  const decision: TaskDecision = { id: `CU-${Date.now()}`, at: new Date().toISOString(), category: "verification", choice: `GUI verification: ${routing.mode}`, rationale: routing.reason, criterionIds: options.contract.criterion.map((v) => v.id), substitute: null };
  const directory = await safeComputerPath(join(options.contract.scope.projectRoot, ".alpha-aos", "task-runs", options.runId)); await mkdir(directory, { recursive: true, mode: 0o700 });
  const log = await open(await safeComputerPath(join(directory, "decisions.jsonl")), "a", 0o600);
  try { await log.writeFile(JSON.stringify(decision) + "\n"); await log.sync(); } finally { await log.close(); }
  if (routing.mode !== "automatic" || !grant.verification) return { status: "manual", reason: routing.reason, decision };
  const root = resolve(options.contract.scope.projectRoot);
  async function boundedFile(path: string): Promise<string> { const result = resolve(root, path); const rel = relative(root, result); if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Computer verification path escapes task root"); return safeComputerPath(result); }
  try {
    const definition = grant.verification;
    const authorityFile = await boundedFile(definition.authorityFile); const runtimeFile = await boundedFile(definition.runtimeFile); const requestFile = await boundedFile(definition.requestFile);
    const authority = validateComputerAuthority(await readComputerJson(authorityFile));
    if (authority.runId !== options.runId || authority.contractDigest !== options.digest || computerHash(await readComputerJson(requestFile)) !== definition.requestHash || computerHash(await readComputerJson(runtimeFile)) !== definition.runtimeReceiptHash) throw new Error("Computer verification inputs differ from approved task/run");
    const result = await (options.execute ?? runComputerCommand)(["action", "--authority", authorityFile, "--contract", options.contractPath, "--runtime", runtimeFile, "--request", requestFile, "--mode", "autopilot", "--apply"], { stateRoot: options.stateRoot }) as { outcome?: string };
    if (result?.outcome !== "verified") return { status: "unavailable", reason: "GUI input did not establish the approved observed postcondition", decision };
    return { status: "verified", reason: "Approved deterministic reversible GUI check executed through the shared broker", decision };
  } catch { return { status: "unavailable", reason: "GUI verification refused or failed; inspect bounded runtime and audit evidence", decision }; }
}
