import { ALL_HARNESSES } from "../adapters/task-agents.js";
import { readHarnessRoleReceipt } from "../adapters/task-receipts.js";
import { HARNESS_TELEMETRY_CAPABILITIES } from "./task-telemetry.js";

export interface HarnessDoctorEntry {
  harness: string;
  roles: {
    controller: "PROVEN" | "UNVERIFIED" | "MISSING";
    executor: "PROVEN" | "UNVERIFIED" | "MISSING";
    reviewer: "PROVEN" | "UNVERIFIED" | "MISSING";
  };
  toolsAndMcp: string;
  telemetry: "measured (tokens)" | "measured (tokens+cost)" | "unmetered";
}

export async function buildTaskDoctorReport(
  receiptsRoot?: string,
  options?: { checkDrift?: boolean },
): Promise<HarnessDoctorEntry[]> {
  const report: HarnessDoctorEntry[] = [];
  const checkDrift = options?.checkDrift ?? true;

  for (const harness of ALL_HARNESSES) {
    const roles: HarnessDoctorEntry["roles"] = {
      controller: "MISSING",
      executor: "MISSING",
      reviewer: "MISSING",
    };

    for (const role of ["controller", "executor", "reviewer"] as const) {
      const res = await readHarnessRoleReceipt(harness, role, receiptsRoot, { checkDrift });
      if (res.receipt && !res.versionDrift) {
        roles[role] = "PROVEN";
      } else if (res.versionDrift) {
        roles[role] = "UNVERIFIED";
      } else {
        roles[role] = "MISSING";
      }
    }

    const caps = HARNESS_TELEMETRY_CAPABILITIES[harness];
    const telemetry: HarnessDoctorEntry["telemetry"] = caps?.metersCost
      ? "measured (tokens+cost)"
      : caps?.metersTokens
        ? "measured (tokens)"
        : "unmetered";

    const toolsDescription =
      harness === "claude"
        ? "Native tools + Claude stdio MCP (JSON)"
        : harness === "codex"
          ? "Native tools + Codex MCP bridge (TOML)"
          : harness === "antigravity"
            ? "Native tools + Antigravity MCP config"
            : harness === "pi"
              ? "Native tools + pi-mcp-adapter"
              : "Native tools + Hermes YAML config";

    report.push({
      harness,
      roles,
      toolsAndMcp: toolsDescription,
      telemetry,
    });
  }

  return report;
}

export function formatDoctorTable(entries: HarnessDoctorEntry[]): string {
  const headers = ["Harness", "Roles (Ctrl/Exec/Rev)", "Tools & MCP", "Telemetry"];
  const rows = entries.map((entry) => [
    entry.harness,
    `${entry.roles.controller}/${entry.roles.executor}/${entry.roles.reviewer}`,
    entry.toolsAndMcp,
    entry.telemetry,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );
  const render = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ").trimEnd();

  return [render(headers), render(widths.map((width) => "-".repeat(width))), ...rows.map(render)].join("\n");
}
