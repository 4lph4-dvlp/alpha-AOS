import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCommand } from "../core/process.js";
import type { HarnessId, IsolationLaunchSpec, ProjectIsolationPolicy } from "../types.js";

const commands: Record<HarnessId, string[]> = {
  claude: ["claude"],
  codex: ["codex"],
  antigravity: ["agy", "antigravity"],
  pi: ["pi"],
  hermes: ["hermes"],
};

function executableFor(harness: HarnessId): string | null {
  return commands[harness].map(resolveCommand).find((candidate) => candidate !== null) ?? null;
}

export function createIsolationLaunchSpec(options: {
  projectId: string;
  projectRoot: string;
  harness: HarnessId;
  policy: ProjectIsolationPolicy;
  runtimeRoot: string;
  allowedSkillPaths: string[];
}): IsolationLaunchSpec {
  const { harness, policy, runtimeRoot } = options;
  const env: Record<string, string> = {};
  const args: string[] = [];
  const guarantees: string[] = [];
  const warnings: string[] = [];
  const blockedReasons: string[] = [];
  const harnessRoot = join(runtimeRoot, harness);
  const syntheticHome = join(harnessRoot, "home");

  if (!policy.allowedHarnesses.includes(harness)) {
    blockedReasons.push(`${harness} is not in isolation.allowedHarnesses`);
  }
  if (policy.mode === "sealed") {
    blockedReasons.push("sealed mode requires a container/OS sandbox adapter; process isolation is never used as a silent fallback");
  }

  if (policy.mode !== "managed") {
    switch (harness) {
      case "claude":
        env.CLAUDE_CONFIG_DIR = harnessRoot;
        args.push("--setting-sources", "project,local");
        if (existsSync(join(options.projectRoot, ".mcp.json"))) args.push("--mcp-config", join(options.projectRoot, ".mcp.json"));
        args.push("--strict-mcp-config");
        guarantees.push("Claude user configuration, user skills, hooks, memory, and MCP are hidden by the isolated CLAUDE_CONFIG_DIR");
        break;
      case "codex":
        env.CODEX_HOME = harnessRoot;
        env.HOME = syntheticHome;
        env.USERPROFILE = syntheticHome;
        args.push("--strict-config");
        guarantees.push("Codex state and user-level .agents skills are hidden by isolated CODEX_HOME and home directories");
        warnings.push("The isolated Codex home needs its own explicit login; alpha-aos never copies auth.json");
        break;
      case "antigravity":
        env.HOME = syntheticHome;
        env.USERPROFILE = syntheticHome;
        guarantees.push("Antigravity ~/.gemini configuration is hidden by the synthetic home directory");
        warnings.push("Antigravity has no documented config-root override; process isolation is best-effort and sealed mode remains blocked without a sandbox");
        break;
      case "pi":
        env.PI_CODING_AGENT_DIR = harnessRoot;
        args.push("--no-skills", "--no-extensions", "--no-prompt-templates", "--no-themes");
        for (const skillPath of options.allowedSkillPaths) args.push("--skill", skillPath);
        guarantees.push("Pi global resources are disabled and only allowlisted project skill paths are passed explicitly");
        break;
      case "hermes":
        env.HERMES_HOME = harnessRoot;
        args.push("chat", "--ignore-user-config", "--ignore-rules");
        guarantees.push("Hermes user config, rules, and memory are hidden by an isolated HERMES_HOME and ignore flags");
        if (policy.allowedSkills.length > 0) {
          blockedReasons.push("Hermes project skill path allowlisting is not yet proven; use an empty allowedSkills list or keep Hermes disallowed");
        }
        break;
    }
  }

  const executable = executableFor(harness);
  if (!executable) blockedReasons.push(`${harness} CLI executable was not found`);
  return {
    projectId: options.projectId,
    projectRoot: options.projectRoot,
    harness,
    mode: policy.mode,
    runtimeRoot: harnessRoot,
    executable,
    args,
    env,
    guarantees,
    warnings,
    blockedReasons,
  };
}
