import type { DoctorFinding, Inventory, IsolationLaunchSpec, IsolationPlan, PlanAction, ProjectCapabilityPlan, StackLock } from "./types.js";
import { describeLeaf, MAX_NEAR_MISS_LINES, MAX_TARGET_ROWS } from "./core/project-plan.js";

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const render = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ").trimEnd();
  return [render(headers), render(widths.map((width) => "-".repeat(width))), ...rows.map(render)].join("\n");
}

export function formatInventory(inventory: Inventory): string {
  const rows = inventory.harnesses.map((harness) => [
    harness.id,
    harness.detected ? "yes" : "no",
    harness.version ?? "-",
    harness.configRoots.join(", ") || "-",
    harness.notes.join("; ") || "-",
  ]);
  const tools = Object.entries(inventory.tools).map(([name, value]) => `${name}=${value.version ?? "missing"}`).join(", ");
  return [`Platform: ${inventory.platform}/${inventory.architecture}`, `Tools: ${tools}`, "", table(["HARNESS", "FOUND", "VERSION", "CONFIG", "NOTES"], rows)].join("\n");
}

export function formatPlan(actions: PlanAction[]): string {
  const rows = actions.map((action) => [
    String(action.phase),
    action.id,
    action.operation,
    action.writes ? "write" : "read",
    action.approval ? "yes" : "no",
    action.command ?? action.note,
  ]);
  return `${table(["PHASE", "ACTION", "OP", "MODE", "APPROVAL", "COMMAND / NOTE"], rows)}\n\nDry-run only. No user or harness configuration was changed.`;
}

export function formatDoctor(findings: DoctorFinding[]): string {
  return table(["LEVEL", "CODE", "MESSAGE"], findings.map((finding) => [finding.level.toUpperCase(), finding.code, finding.message]));
}

/**
 * D-09's default output contract, rendered.
 *
 * Full reasoning for every selected pack; one line for every pack that
 * satisfied part of its conditions and failed the rest, bounded by
 * `MAX_NEAR_MISS_LINES` and deterministically ordered; an honest line for a
 * pack whose facts are declared but deliberately unimplemented; and silence
 * for packs that matched nothing. `--why` drops the cap and prints every
 * declared pack with full leaf detail.
 *
 * Every phrase below comes from `PackEvaluation.explanation` or from a leaf's
 * `phrase`, both of which the evaluator renders out of `catalog/facts.yaml`.
 * Nothing here is a per-pack string, so all 15 packs explain uniformly.
 */
export function formatProjectPlan(plan: ProjectCapabilityPlan, options: { why?: boolean } = {}): string {
  const lines = [`Project: ${plan.scope.canonicalRoot} (${plan.scope.rootReason})`, `Project id: ${plan.scope.projectId}`];
  if (plan.scope.subProjectPath !== null) lines.push(`Sub-project: ${plan.scope.subProjectPath}`);
  const byId = new Map(plan.evaluations.map((evaluation) => [evaluation.packId, evaluation]));

  if (plan.subProjects.length > 0) {
    // D-01: the user names the target rather than the tool guessing which
    // member of a workspace they meant.
    lines.push(`${plan.subProjects.length} sub-project(s) discovered; none selected. Name one with --project <path>.`);
    for (const member of plan.subProjects) {
      lines.push(`  ${member.path} (${member.declarationFile}): ${member.selected.join(", ") || "no pack qualified"}`);
    }
  } else if (plan.selected.length === 0) {
    lines.push("No pack qualified on the evidence found.");
  } else {
    for (const packId of plan.selected) {
      const pack = byId.get(packId);
      if (pack !== undefined) lines.push(`SELECT ${pack.explanation}`);
    }
  }

  if (options.why === true) {
    for (const evaluation of plan.evaluations) {
      lines.push(`WHY ${evaluation.packId} [${evaluation.status}] ${evaluation.explanation}`);
      for (const leaf of evaluation.satisfied) lines.push(`  + ${describeLeaf(leaf)}`);
      for (const leaf of evaluation.failed) lines.push(`  - ${leaf.phrase}: ${leaf.reason ?? "no reason recorded"}`);
    }
  } else {
    // Deterministic order and a hard cap, mirroring `finalizeIssues` in
    // validation.ts, so a hostile or pathological catalog cannot flood output.
    const shown = plan.nearMissOrder.slice(0, MAX_NEAR_MISS_LINES);
    for (const packId of shown) {
      const pack = byId.get(packId);
      if (pack !== undefined) lines.push(`NEAR-MISS ${pack.explanation}`);
    }
    const suppressed = plan.nearMissOrder.length - shown.length;
    if (suppressed > 0) lines.push(`... ${suppressed} more near-miss pack(s) suppressed (use --why)`);
    // A pack that can NEVER select says so. Reporting it as an ordinary
    // non-match would make it indistinguishable from an unqualified repository.
    for (const evaluation of plan.evaluations) {
      if (evaluation.status === "unimplemented") lines.push(`UNIMPLEMENTED ${evaluation.explanation}`);
    }
  }

  // D-11, rendered from the pre-state rather than from the approval text: a
  // conflicting target is a fact about the filesystem, and naming the pack and
  // the path is what turns a dropped pack from an unexplained absence into a
  // reviewable decision.
  for (const target of plan.targetPreState) {
    if (!target.exists || target.ownedByReceipt) continue;
    lines.push(
      `CONFLICT ${target.packId} ${target.path} — a file alpha-AOS did not write; the pack is dropped, and nothing was overwritten or renamed`,
    );
  }

  if (plan.targetPreState.length > 0) {
    // Deterministic order plus a hard cap, the same discipline the near-miss
    // lines follow, so a catalog naming many skills cannot flood the output.
    const shown = plan.targetPreState.slice(0, MAX_TARGET_ROWS);
    const rows = shown.map((target) => [
      target.path,
      target.harness,
      target.exists ? (target.ownedByReceipt ? "ours" : "foreign") : "absent",
      target.action,
    ]);
    lines.push("", table(["TARGET", "HARNESS", "STATE", "ACTION"], rows));
    const suppressed = plan.targetPreState.length - shown.length;
    if (suppressed > 0) lines.push(`... ${suppressed} more target(s) suppressed (use --json)`);
  }

  if (plan.adapterSupportEvidence.length > 0) {
    // `supported` means a real probe passed. No probe runs on this path, so
    // the basis column carries what was actually recorded instead.
    lines.push(
      "",
      table(
        ["HARNESS", "SUPPORT", "BASIS"],
        plan.adapterSupportEvidence.map((entry) => [entry.harness, entry.support, entry.reason]),
      ),
      "",
    );
  }

  for (const approval of plan.approvals) lines.push(`APPROVAL ${approval.code} ${approval.detail}`);

  lines.push(
    `Inputs digest: ${plan.inputsDigest}`,
    `Evidence digest: ${plan.evidenceDigest}`,
    `Plan digest: ${plan.planDigest}`,
    "Preview only. Nothing was written: `project plan` persists nothing.",
  );
  return lines.join("\n");
}

export function formatUpdate(current: StackLock, candidate: StackLock): string {
  const rows: string[][] = [];
  const add = (id: string, currentVersion: string | undefined, candidateVersion: string | undefined): void => {
    rows.push([id, currentVersion ?? "-", candidateVersion ?? "-", currentVersion === candidateVersion ? "current" : "update"]);
  };
  add("gsd", current.components.gsd?.version, candidate.components.gsd?.version);
  add("ecc", current.components.ecc?.version, candidate.components.ecc?.version);
  for (const [id, entry] of Object.entries(candidate.components.mcp ?? {})) {
    add(`mcp:${id}`, current.components.mcp?.[id]?.version, entry.version);
  }
  for (const [id, entry] of Object.entries(candidate.components.mcpBridges ?? {})) {
    if (entry) add(`mcp-bridge:${id}`, current.components.mcpBridges?.[id as keyof NonNullable<StackLock["components"]["mcpBridges"]>]?.version, entry.version);
  }
  return table(["COMPONENT", "STABLE", "UPSTREAM", "STATUS"], rows);
}

export function formatIsolationPlan(plan: IsolationPlan): string {
  const rows = plan.launches.map((launch) => [
    launch.harness,
    plan.policy.allowedHarnesses.includes(launch.harness) ? "allowed" : "denied",
    launch.executable ?? "missing",
    launch.blockedReasons.join("; ") || "ready",
  ]);
  return [
    `Project: ${plan.projectRoot}`,
    `Project ID: ${plan.projectId}`,
    `Mode: ${plan.policy.mode}`,
    `Runtime: ${plan.runtimeRoot}`,
    `Allowed skills: ${plan.policy.allowedSkills.join(", ") || "none"}`,
    `Allowed MCP: ${plan.policy.allowedMcp.join(", ") || "none"}`,
    "",
    table(["HARNESS", "POLICY", "EXECUTABLE", "STATUS"], rows),
  ].join("\n");
}

export function formatIsolationLaunch(launch: IsolationLaunchSpec): string {
  const env = Object.entries(launch.env).map(([key, value]) => `${key}=${value}`).join("\n") || "none";
  return [
    `Harness: ${launch.harness}`,
    `Mode: ${launch.mode}`,
    `Executable: ${launch.executable ?? "missing"}`,
    `Arguments: ${launch.args.join(" ") || "none"}`,
    `Environment overrides:\n${env}`,
    `Guarantees: ${launch.guarantees.join("; ") || "none"}`,
    `Warnings: ${launch.warnings.join("; ") || "none"}`,
    `Blocked: ${launch.blockedReasons.join("; ") || "no"}`,
  ].join("\n");
}
