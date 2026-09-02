import type { DoctorFinding, Inventory, IsolationLaunchSpec, IsolationPlan, PlanAction, ProjectDetection, StackLock } from "./types.js";

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

export function formatProject(detection: ProjectDetection): string {
  return [`Root: ${detection.root}`, `Evidence: ${detection.evidence.join(", ") || "none"}`, `Packs: ${detection.packs.join(", ") || "none"}`].join("\n");
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
