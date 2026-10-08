import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ALL_HARNESSES } from "../adapters/task-agents.js";
import { readHarnessRoleReceipt } from "../adapters/task-receipts.js";
import { HARNESS_TELEMETRY_CAPABILITIES } from "./task-telemetry.js";
import { userStateRoot } from "./paths.js";
import { discoverPhaseProgression } from "./task-gsd-discovery.js";
import { runGitRead } from "./task-gsd.js";
import { readTaskReviewSuggestions } from "./task-review-suggestions.js";

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

export interface GsdLifecycleDiagnostics {
  readonly currentPhase: string | null;
  readonly phaseStatus: string | null;
  readonly completedPlansCount: number;
  readonly pendingPlansCount: number;
  readonly isPhaseComplete: boolean;
  readonly hooks: {
    readonly executedCount: number;
    readonly passedCount: number;
    readonly failedCount: number;
    readonly details: readonly {
      readonly hookPoint: string;
      readonly status: "passed" | "failed";
      readonly durationMs: number;
      readonly executedAt: string;
    }[];
  };
  readonly reviewWitness: {
    readonly recorded: boolean;
    readonly headSha: string | null;
    readonly witnessRevisionSha: string | null;
    readonly matchesHead: boolean;
    readonly verdict: string | null;
  };
  readonly pendingSuggestions?: {
    readonly count: number;
    readonly status: "ok" | "error";
    readonly error?: string | undefined;
  } | undefined;
}

export async function diagnoseGsdLifecycleStatus(options: {
  projectRoot: string;
  phaseId?: string | undefined;
  receiptsRoot?: string | undefined;
  baseCommit?: string | undefined;
  stateRoot?: string | undefined;
  contractId?: string | undefined;
}): Promise<GsdLifecycleDiagnostics> {
  const { projectRoot } = options;
  let phaseId = options.phaseId ?? null;
  let phaseStatus: string | null = null;

  // 1. Read STATE.md if present
  const statePath = join(projectRoot, ".planning", "STATE.md");
  if (existsSync(statePath)) {
    try {
      const stateContent = await readFile(statePath, "utf8");
      if (!phaseId) {
        const phaseMatch =
          stateContent.match(/current_phase:\s*([^\r\n]+)/i) ||
          stateContent.match(/Phase:\s*([0-9]+[a-zA-Z0-9_-]*)/i);
        if (phaseMatch?.[1]) {
          phaseId = phaseMatch[1].trim();
        }
      }
      const statusMatch = stateContent.match(/status:\s*([^\r\n]+)/i);
      if (statusMatch?.[1]) {
        phaseStatus = statusMatch[1].trim();
      }
    } catch {}
  }

  // 2. Discover progression
  let completedPlansCount = 0;
  let pendingPlansCount = 0;
  let isPhaseComplete = false;
  if (phaseId) {
    try {
      const progression = await discoverPhaseProgression({
        projectRoot,
        phaseId,
        baseCommit: options.baseCommit,
      });
      completedPlansCount = progression.completedPlans.length;
      pendingPlansCount = progression.pendingPlans.length;
      isPhaseComplete = progression.isPhaseComplete;
    } catch {}
  }

  // 3. Inspect Hook Receipts
  const hooksRoot = options.receiptsRoot
    ? join(options.receiptsRoot, "hooks")
    : join(userStateRoot(), "receipts", "hooks");

  const hookDetails: {
    hookPoint: string;
    status: "passed" | "failed";
    durationMs: number;
    executedAt: string;
  }[] = [];

  if (existsSync(hooksRoot)) {
    try {
      const files = await readdir(hooksRoot);
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const raw = await readFile(join(hooksRoot, file), "utf8");
            const parsed = JSON.parse(raw);
            if (parsed.kind === "hook-execution-receipt") {
              if (!phaseId || parsed.phaseId === phaseId || parsed.phaseId?.startsWith(phaseId)) {
                hookDetails.push({
                  hookPoint: parsed.hookPoint,
                  status: parsed.status,
                  durationMs: parsed.durationMs,
                  executedAt: parsed.executedAt,
                });
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  const passedHooks = hookDetails.filter((h) => h.status === "passed").length;
  const failedHooks = hookDetails.filter((h) => h.status === "failed").length;

  // 4. Inspect Review Witness
  let headSha: string | null = null;
  try {
    headSha = (await runGitRead(projectRoot, ["rev-parse", "HEAD"])).trim();
  } catch {}

  const witnessesRoot = options.receiptsRoot
    ? join(options.receiptsRoot, "witnesses")
    : join(userStateRoot(), "receipts", "witnesses");

  let recordedWitness = false;
  let witnessRevisionSha: string | null = null;
  let witnessVerdict: string | null = null;

  if (existsSync(witnessesRoot)) {
    try {
      const files = await readdir(witnessesRoot);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      if (jsonFiles.length > 0) {
        const latestFile = jsonFiles[jsonFiles.length - 1]!;
        const raw = await readFile(join(witnessesRoot, latestFile), "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.kind === "review-witness-receipt") {
          recordedWitness = true;
          witnessRevisionSha = parsed.targetRevisionSha ?? null;
          witnessVerdict = parsed.witnessVerdict ?? null;
        }
      }
    } catch {}
  }

  const matchesHead = recordedWitness && headSha !== null && witnessRevisionSha === headSha;

  // 5. Inspect Pending Suggestions (D-08, REV-05)
  let pendingSuggestions: GsdLifecycleDiagnostics["pendingSuggestions"] = undefined;
  const stateRoot = options.stateRoot ?? userStateRoot();
  if (options.contractId) {
    const sugResult = await readTaskReviewSuggestions({ stateRoot, contractId: options.contractId });
    if (sugResult.status === "ok") {
      pendingSuggestions = { count: sugResult.pendingCount, status: "ok" };
    } else {
      pendingSuggestions = { count: 0, status: "error", error: sugResult.error };
    }
  } else {
    const tasksDir = join(stateRoot, "tasks");
    if (existsSync(tasksDir)) {
      try {
        const contracts = await readdir(tasksDir);
        let totalPending = 0;
        let anyError: string | null = null;
        let foundAny = false;
        for (const cid of contracts) {
          const sugResult = await readTaskReviewSuggestions({ stateRoot, contractId: cid });
          if (sugResult.status === "ok") {
            foundAny = true;
            totalPending += sugResult.pendingCount;
          } else {
            anyError = sugResult.error;
          }
        }
        if (anyError !== null) {
          pendingSuggestions = { count: 0, status: "error", error: anyError };
        } else if (foundAny) {
          pendingSuggestions = { count: totalPending, status: "ok" };
        }
      } catch {}
    }
  }

  return {
    currentPhase: phaseId,
    phaseStatus,
    completedPlansCount,
    pendingPlansCount,
    isPhaseComplete,
    hooks: {
      executedCount: hookDetails.length,
      passedCount: passedHooks,
      failedCount: failedHooks,
      details: hookDetails,
    },
    reviewWitness: {
      recorded: recordedWitness,
      headSha,
      witnessRevisionSha,
      matchesHead,
      verdict: witnessVerdict,
    },
    pendingSuggestions,
  };
}

export function formatGsdDoctorReport(diagnostics: GsdLifecycleDiagnostics): string {
  const lines: string[] = [
    "GSD Lifecycle Status",
    "====================",
    `Current Phase:    ${diagnostics.currentPhase ?? "none"} (${diagnostics.phaseStatus ?? "unknown"})`,
    `Phase Progress:   ${diagnostics.completedPlansCount} completed, ${diagnostics.pendingPlansCount} pending (complete: ${diagnostics.isPhaseComplete ? "yes" : "no"})`,
    `Hook Receipts:    ${diagnostics.hooks.executedCount} executed (${diagnostics.hooks.passedCount} passed, ${diagnostics.hooks.failedCount} failed)`,
    `Review Witness:   ${diagnostics.reviewWitness.recorded ? (diagnostics.reviewWitness.matchesHead ? `valid (matches HEAD: ${diagnostics.reviewWitness.headSha?.slice(0, 12)})` : `stale (HEAD: ${diagnostics.reviewWitness.headSha?.slice(0, 12)}, witness: ${diagnostics.reviewWitness.witnessRevisionSha?.slice(0, 12)})`) : "none recorded"}`,
  ];
  if (diagnostics.pendingSuggestions) {
    if (diagnostics.pendingSuggestions.status === "error") {
      lines.push(`Pending Suggestions: unknown (read error: ${diagnostics.pendingSuggestions.error})`);
    } else if (diagnostics.pendingSuggestions.count > 0) {
      lines.push(`Pending Suggestions: ${diagnostics.pendingSuggestions.count} pending review (out-of-scope recommendations)`);
    } else {
      lines.push("Pending Suggestions: none");
    }
  }
  return lines.join("\n");
}

