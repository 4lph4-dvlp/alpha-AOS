import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capabilityDiagnostic, classifyCapabilityFailure, inspectTaskCapabilities } from "./task-capability-health.js";
import { collectTaskArtifact, materializeTaskSnapshot, measureTaskCriterion } from "./task-check.js";
import { auditTaskEffects, readTaskChanges, GSD_RUNTIME_STATE_PATHS } from "./task-effects.js";
import { meteredTaskDispatch } from "./task-runtime.js";
import { assertRecoveryRevision } from "./task-recovery-grant.js";
import { digestableTaskContract, taskContractDigest, type TaskContract } from "./task-contract.js";
import type { TaskPorts } from "./task-run.js";
import { acquireControllerLease } from "./controller-lease.js";
import { snapshotPlanningState } from "./task-gsd.js";
import { readBoundedFile } from "./command-jobs.js";

async function protectedRepairState(projectRoot: string): Promise<string> {
  const runtime = [];
  for (const path of GSD_RUNTIME_STATE_PATHS) {
    try { runtime.push([path, createHash("sha256").update(await readBoundedFile(join(projectRoot, path), projectRoot, 1024 * 1024, undefined, true)).digest("hex")]); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; runtime.push([path, null]); }
  }
  return JSON.stringify({ planning: await snapshotPlanningState(projectRoot), runtime });
}

export interface TaskRepairEvidence {
  status: "repaired" | "retry-repair" | "needs-input" | "stopped";
  kind: string;
  before: string;
  after: string;
  verification: string;
  reason: string;
  candidate?: TaskContract;
}

/** Runs one corrective action under the existing approved native model and effect boundary. */
export async function repairTaskFailure(options: { contract: TaskContract; rootContract: TaskContract; stateRoot: string; ports: TaskPorts; failure: string; runId: string; repairIndex: number; baseCommit: string }): Promise<TaskRepairEvidence> {
  const { contract } = options;
  const lease = await acquireControllerLease({ projectRoot: contract.scope.projectRoot, harness: contract.agentPolicy.controller, contractDigest: taskContractDigest(contract) });
  try {
    const grant = options.rootContract.recoveryPolicy;
    const kind = classifyCapabilityFailure(options.failure);
    const capabilityFailure = /capability-|capability evidence/iu.test(options.failure);
    const workspaceRepair = grant?.allowWorkspaceRepair === true && !capabilityFailure;
    const beforeArtifact = await collectTaskArtifact({ projectRoot: contract.scope.projectRoot, allowedRoots: contract.allowedRoots });
    const before = createHash("sha256").update(JSON.stringify(beforeArtifact)).digest("hex");
    const refused = (reason: string, status: "retry-repair" | "needs-input" | "stopped" = "needs-input"): TaskRepairEvidence => ({ status, kind, before, after: before, verification: "No successful correction verified", reason });
    if (!grant || options.repairIndex > grant.maxRepairs) return refused("Approved repair grant is absent or exhausted");
    if (kind === "quota") return refused("Quota requires an external availability change", "stopped");
    if (kind === "authentication") return refused("Authentication requires user action; credential/configuration mutations are outside workspace repair");
    if (capabilityFailure) {
      const readiness = await inspectTaskCapabilities(contract, options.ports.capability, options.runId);
      if (readiness.length > 0 && readiness.every((item) => item.ready)) {
        return { status: "repaired", kind, before, after: createHash("sha256").update(JSON.stringify(readiness)).digest("hex"), verification: "Actual read-only capability invocation now succeeds", reason: "Capability availability changed and was reverified" };
      }
      if (!grant.allowQuestionRepair || ["unavailable", "transport", "service"].includes(kind)) return refused(`Native capability correction is unavailable within this grant: ${readiness.filter((item) => !item.ready).map((item) => item.detail).join("; ")}`);
    } else if (!grant.allowWorkspaceRepair) return refused("Workspace repair is outside the approved grant");
    if (!workspaceRepair && contract.agentPolicy.controller !== "codex") return refused("Read-only question repair is not verified for the approved controller harness");
    const assessment = await options.ports.assess(contract.agentPolicy);
    if (!assessment.supported) return refused(`Approved native agent pair is unverified: ${assessment.missingProof.join("; ") || "no proof recorded"}`);
    const protectedBefore = await protectedRepairState(contract.scope.projectRoot);
    const changesBefore = await readTaskChanges({ projectRoot: contract.scope.projectRoot, baseCommit: options.baseCommit });

    const scratchRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-"));
    try {
      const prompt = [
        "Perform ONE bounded repair for the already approved task. Do not run GSD commands, edit lifecycle state, change models, credentials or global configuration, or broaden scope.",
        `Approved goal: ${contract.goal}`,
        `Allowed project-relative roots: ${JSON.stringify(contract.allowedRoots)}. Effects: ${JSON.stringify(contract.allowedEffects)}.`,
        `Failure: ${capabilityDiagnostic(options.failure)}`,
        workspaceRepair ? "You may correct implementation files within the approved roots. Run a relevant bounded verification. Do not edit .planning or commit." : "Do not modify implementation files.",
        grant.allowQuestionRepair ? "You may propose corrections to existing required capability questions. Return JSON {capabilityQuestions:{documentation?:string,research?:string}} in the result summary. Do not write the contract or change goal, acceptance criteria, authority or resources." : "Contract changes are not authorized.",
        "Return the normal executor result with completed only when a concrete repair and verification were performed; otherwise return needs-authority or failed with the actual missing action. A stronger prompt or handoff file is not a repair.",
      ].join("\n");
      const result = await meteredTaskDispatch({ stateRoot: options.stateRoot, contract, digest: taskContractDigest(contract), runId: options.runId, role: "controller", cycleBoundary: true,
        invoke: (observer) => options.ports.controller.dispatch({ ...observer, readOnly: !workspaceRepair, runId: options.runId, contract,
          contractDigest: taskContractDigest(contract), projectRoot: contract.scope.projectRoot, scratchRoot,
          decisionLogPath: join(scratchRoot, "decisions.jsonl"), prompt, deadlineAt: observer.deadlineAt,
          gitDirectory: null,
        }) });
      const changes = await readTaskChanges({ projectRoot: contract.scope.projectRoot, baseCommit: options.baseCommit });
      if (await protectedRepairState(contract.scope.projectRoot) !== protectedBefore || JSON.stringify(changes.commits) !== JSON.stringify(changesBefore.commits)) return refused("Repair changed protected lifecycle state or created a commit; task retry refused");
      const audit = await auditTaskEffects({ contract, runId: options.runId, changes, projectRoot: contract.scope.projectRoot, baseCommit: options.baseCommit });
      if (audit.violations.length) return refused("Repair changed paths or effects outside approved authority");
      const artifact = await collectTaskArtifact({ projectRoot: contract.scope.projectRoot, allowedRoots: contract.allowedRoots });
      const after = createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
      if (!workspaceRepair && after !== before) return { ...refused("Question-only repair changed workspace bytes; execution refused"), after };
      if (result.exitCode !== 0 || result.terminal !== "completed" || result.claim?.status !== "completed" || result.closeConfirmed === false) {
        const detail = capabilityDiagnostic(result.detail ?? result.claim?.summary ?? "Native repair did not complete");
        const failureKind = classifyCapabilityFailure(detail);
        const authority = result.claim?.authorityRequest;
        return { ...refused(detail, result.closeConfirmed === false || failureKind === "quota" ? "stopped" : failureKind === "authentication" || failureKind === "unavailable" || (authority && !contract.allowedEffects.includes(authority.effect as never)) ? "needs-input" : "retry-repair"), after };
      }
      let proposed: { capabilityQuestions?: TaskContract["capabilityQuestions"] } = {};
      try { proposed = JSON.parse(result.claim.summary) as typeof proposed; } catch { /* Workspace-only repairs may return a text summary. */ }
      if (proposed.capabilityQuestions) {
        const candidate = { ...contract, revision: contract.revision + 1, capabilityQuestions: proposed.capabilityQuestions };
        assertRecoveryRevision(digestableTaskContract(options.rootContract), digestableTaskContract(candidate), options.repairIndex);
        const readiness = await inspectTaskCapabilities(candidate, options.ports.capability, options.runId);
        if (!readiness.length || readiness.some((item) => !item.ready)) return refused(`Proposed question repair did not restore invocation: ${readiness.filter((item) => !item.ready).map((item) => item.detail).join("; ")}`, "retry-repair");
        return { status: "repaired", kind, before: taskContractDigest(contract), after: taskContractDigest(candidate), verification: "Revised questions passed actual native preflight", reason: "Corrected capability questions within grant", candidate };
      }
      if (!workspaceRepair || after === before) return refused("No relevant corrective change was observed; unchanged task execution refused", "retry-repair");
      if (artifact.status !== "ok") return refused("Corrected artifact could not be collected safely");
      const snapshot = await materializeTaskSnapshot({ manifest: artifact, projectRoot: contract.scope.projectRoot, destination: join(scratchRoot, "verify") });
      const measured = [];
      for (const criterion of contract.criterion.filter((item) => item.measurement.kind === "cli-json")) measured.push(await measureTaskCriterion({ criterion, root: snapshot, scratchRoot, allowedRoots: contract.allowedRoots, substitute: null }));
      if (!measured.length || measured.some((item) => item.outcome !== "pass")) return { ...refused(`Repair did not pass approved measurable criteria: ${measured.filter((item) => item.outcome !== "pass").map((item) => `${item.criterionId}: ${item.detail}`).join("; ") || "no independently measurable criteria"}`, "retry-repair"), after };
      return { status: "repaired", kind, before, after, verification: `${measured.length} approved criteria passed on a fresh artifact snapshot`, reason: "Implementation corrected and independently measured before retry" };
    } finally { await rm(scratchRoot, { recursive: true, force: true }); }
  } finally { await lease.release(); }
}
