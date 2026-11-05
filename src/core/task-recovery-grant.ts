import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { applyFileTransaction } from "./transaction.js";
import { changedContractFields, digestableTaskContract, loadTaskContract, parseTaskContract, readTaskApprovals, taskApprovalPath, taskContractDigest, type DigestableTaskContract, type TaskApprovalRecord, type TaskContract } from "./task-contract.js";
import { evaluateStepObligations } from "./task-capability-obligations.js";
import { packageRoot } from "./paths.js";
import { validateManagedDocument, rejectRawCredentials } from "./validation.js";

export function assertRecoveryRevision(root: DigestableTaskContract, candidate: DigestableTaskContract, repairIndex: number): void {
  const grant = root.recoveryPolicy;
  if (!grant?.allowQuestionRepair || !Number.isSafeInteger(repairIndex) || repairIndex < 1 || repairIndex > grant.maxRepairs) throw new Error("recovery-authority-required: contract question repair is outside the approved grant");
  const changed = changedContractFields(root, candidate);
  if (changed.some((field) => !["revision", "capabilityQuestions"].includes(field)) || candidate.revision <= root.revision ||
    !changed.includes("capabilityQuestions")) throw new Error("recovery-authority-required: only capability questions and an increased revision may change");
  for (const kind of ["documentation", "research"] as const) {
    const original = root.capabilityQuestions?.[kind];
    const revised = candidate.capabilityQuestions?.[kind];
    if (original && !revised) throw new Error("Recovery cannot remove an approved capability question");
    if (revised) {
      const capability = kind === "research" ? "deep-research" : "documentation-lookup";
      const present = evaluateStepObligations({ contract: root as unknown as TaskContract, projectRoot: root.scope.projectRoot, step: "execute" }).obligations.some((item) => item.capabilityId === capability);
      if (!present) throw new Error("recovery-authority-required: recovery cannot add a new capability obligation");
    }
  }
}

export async function recordRecoveryRevision(options: { stateRoot: string; contractPath: string; rootDigest: string; parentDigest: string; candidate: TaskContract; repairIndex: number }): Promise<{ digest: string }> {
  const current = await loadTaskContract(options.contractPath);
  if (current.digest !== options.parentDigest) throw new Error("Recovery contract drifted before revision application");
  const approvals = await readTaskApprovals({ stateRoot: options.stateRoot, contractId: current.contract.id });
  const root = approvals.find((approval) => approval.contractDigest === options.rootDigest && approval.consent.grant === "explicit-cli-approval");
  const parent = approvals.find((approval) => approval.contractDigest === options.parentDigest);
  if (!root || !parent || (parent.recovery?.repairIndex ?? 0) >= options.repairIndex ||
    options.repairIndex <= Math.max(0, ...approvals.filter((item) => item.recovery?.rootDigest === root.contractDigest).map((item) => item.recovery!.repairIndex)) ||
    (parent.recovery && parent.recovery.rootDigest !== root.contractDigest)) throw new Error("Invalid recovery approval ancestry");
  const text = JSON.stringify(options.candidate, null, 2) + "\n";
  const candidate = await parseTaskContract(text, options.contractPath);
  const view = digestableTaskContract(candidate);
  assertRecoveryRevision(root.contract, view, options.repairIndex);
  if (JSON.stringify(view.capabilityQuestions) === JSON.stringify(digestableTaskContract(current.contract).capabilityQuestions)) throw new Error("Recovery revision contains no corrective question change");
  if (candidate.revision <= Math.max(...approvals.map((item) => item.revision))) throw new Error("Recovery revision must be new");
  const digest = taskContractDigest(candidate);
  const record: TaskApprovalRecord = { schemaVersion: 1, kind: "task-approval", contractId: candidate.id, revision: candidate.revision,
    contractDigest: digest, approvedAt: new Date().toISOString(), canonicalProjectRoot: root.canonicalProjectRoot,
    ...(root.gitDirectory !== undefined ? { gitDirectory: root.gitDirectory } : {}),
    consent: { mode: "autopilot", grant: "bounded-recovery", scope: "single-run" },
    recovery: { rootDigest: root.contractDigest, parentDigest: parent.contractDigest, repairIndex: options.repairIndex }, contract: view };
  const schema = JSON.parse(await readFile(join(packageRoot(), "schemas", "task-receipt.schema.json"), "utf8")) as Record<string, unknown>;
  const validation = validateManagedDocument({ text: JSON.stringify(record), format: "json", kind: "task-receipt", schema, domain: rejectRawCredentials });
  if (!validation.ok) throw new Error("Recovery approval failed schema validation");
  await applyFileTransaction({ stateRoot: options.stateRoot, allowedRoots: [dirname(current.sourcePath), join(options.stateRoot, "tasks")], operations: [
    { target: current.sourcePath, content: text },
    { target: taskApprovalPath(options.stateRoot, candidate.id, candidate.revision, digest), content: JSON.stringify(record, null, 2) + "\n" },
  ] });
  return { digest };
}
