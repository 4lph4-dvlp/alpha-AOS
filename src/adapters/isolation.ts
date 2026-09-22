import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCommand } from "../core/process.js";
import type {
  HarnessId,
  HarnessPreloadExclusion,
  IsolationLaunchSpec,
  ProjectIsolationPolicy,
} from "../types.js";

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

/**
 * Claude's login file, relative to its config root.
 *
 * Checked for PRESENCE only — never opened. A canary runtime that carries this
 * entry has the caller's existing login by reference; one that does not would
 * start unauthenticated.
 */
const CLAUDE_LOGIN_FILE = ".credentials.json";

/**
 * The flags that make a canary's own MCP configuration the ONLY one a harness
 * loads.
 *
 * Two conditions, and both are required: the flag must NAME an alternative
 * configuration file, and a second flag must EXCLUDE every other source. One
 * without the other is not isolation — a runtime config loaded alongside the
 * user's own would leave a canary talking to unfronted servers and reporting an
 * invocation nobody observed.
 *
 * A null is a RECORDED absence, in the shape `READINESS_DEFINITIONS` already
 * uses: the reason sits beside it and the launch spec records a blocked reason
 * rather than pretending the isolation holds. That is the same fail-closed rule
 * this module already applies to sealed mode.
 */
const CANARY_MCP_ISOLATION: Readonly<Record<HarnessId, ((canary: CanaryLaunchIsolation) => readonly string[]) | null>> = {
  claude: (canary) => [
    "--mcp-config",
    canary.mcpConfigPath,
    "--strict-mcp-config",
    // Isolation hides the caller's tool approvals with the rest of their config,
    // and `-p` cannot prompt for one, so a fronted call is DENIED before it
    // reaches the observation front.
    //
    // Measured, not assumed: a run without this grant recorded
    // `permission_denials: [mcp__context7__resolve-library-id, …]` while the
    // sink stayed empty — the harness had chosen exactly the tool the canary
    // expects, and alpha-AOS would have recorded it as not routing. A false
    // negative against a working integration is worse than no measurement.
    // With the grant, the same prompt put one observation in the sink.
    //
    // By SERVER, never by declared tool name: the fronted servers are the
    // surface under test, and naming individual tools would forbid the ones a
    // declaration counts for fan-out or lists as forbidden, making a negative
    // control vacuously true rather than observed. Permitting a tool is not
    // calling it; which tools the harness reaches for stays its own act.
    ...(canary.servers === undefined || canary.servers.length === 0
      ? []
      : ["--allowedTools", canary.servers.map((server) => `mcp__${server}`).join(",")]),
  ],
  codex: (canary) => ["--ignore-user-config", "--ignore-rules", ...(canary.mcpConfigOverrides ?? [])],
  antigravity: null,
  pi: null,
  hermes: null,
};

/** Why a harness has no canary MCP isolation. Recorded, never silent. */
const CANARY_MCP_ISOLATION_ABSENCE: Readonly<Record<HarnessId, string | null>> = {
  claude: null,
  codex: null,
  antigravity: "antigravity has no documented config-root or MCP-configuration override on any host probed",
  pi: "no pi flag has been observed that replaces the harness's MCP configuration with a named file for one run",
  hermes: "hermes ignores user config wholesale but has no observed flag naming a replacement MCP configuration file",
};

/**
 * A launch that points a harness at a canary runtime's observation front.
 *
 * The path is the canary runtime's own rendered MCP configuration, in which
 * every server entry launches `alpha-aos mcp-proxy <id> --observe`. It exists
 * for the duration of one run and nowhere else, which is 03-CONTEXT.md D-02.
 */
export interface CanaryLaunchIsolation {
  readonly mcpConfigPath: string;
  /** Exact `-c` vector derived from the validated runtime-local Codex TOML. */
  readonly mcpConfigOverrides?: readonly string[];
  /**
   * The server ids this runtime fronts, for a harness that must be granted the
   * fronted surface before a non-interactive run may reach it.
   */
  readonly servers?: readonly string[];
}

export function createIsolationLaunchSpec(options: {
  projectId: string;
  projectRoot: string;
  harness: HarnessId;
  policy: ProjectIsolationPolicy;
  runtimeRoot: string;
  allowedSkillPaths: string[];
  /**
   * Present only for a canary run. A variant of this same spec rather than a
   * second launch construction: a canary that assembled its own equivalent
   * could stay green against a launch the product no longer uses.
   */
  canary?: CanaryLaunchIsolation;
  /** Source of an existing native login boundary for one canary run. */
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
}): IsolationLaunchSpec {
  const { harness, policy, runtimeRoot } = options;
  const canary = options.canary;
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
        // A canary supplies its own MCP configuration below, and loading the
        // project's alongside it would leave unfronted servers in the path —
        // which is precisely the isolation this run exists to prove.
        if (canary === undefined && existsSync(join(options.projectRoot, ".mcp.json"))) {
          args.push("--mcp-config", join(options.projectRoot, ".mcp.json"));
        }
        args.push("--strict-mcp-config");
        guarantees.push("Claude user configuration, user skills, hooks, memory, and MCP are hidden by the isolated CLAUDE_CONFIG_DIR");
        if (canary !== undefined && !existsSync(join(harnessRoot, CLAUDE_LOGIN_FILE))) {
          // Claude keeps its login INSIDE the config root, so the isolation two
          // lines above hides the credential along with the configuration.
          // `createCanaryRuntime` answers that by hard-linking the existing
          // login into the runtime — by reference, the way the codex canary
          // branch below reuses the caller's native login boundary. This is the
          // case where that link is not there.
          //
          // Observed rather than reasoned: a real run on 2026-09-22 reached the
          // init event, connected the fronted server, then ended at
          // `result: "Not logged in · Please run /login"` with
          // `permission_denials: []` and exit 1 — a spent model turn that could
          // only ever have failed. Refusing here is what makes that a refusal
          // before the spend instead of a receipt after it.
          blockedReasons.push(
            "claude keeps its login inside CLAUDE_CONFIG_DIR, which this canary runtime replaces, and the runtime " +
            "holds no link to an existing login — so the run would start unauthenticated and could only end at " +
            "`Not logged in` after spending a model turn. Log in with `claude` first, and check that the managed " +
            "state root is on the same volume as the claude config root, because the login is linked rather than copied",
          );
        }
        break;
      case "codex":
        if (canary === undefined) {
          env.CODEX_HOME = harnessRoot;
          env.HOME = syntheticHome;
          env.USERPROFILE = syntheticHome;
          args.push("--strict-config");
          guarantees.push("Codex state and user-level .agents skills are hidden by isolated CODEX_HOME and home directories");
          warnings.push("The isolated Codex home needs its own explicit login; alpha-aos never copies auth.json");
        } else {
          const source = options.sourceEnvironment ?? process.env;
          if (source.CODEX_HOME !== undefined && source.CODEX_HOME.length > 0) {
            env.CODEX_HOME = source.CODEX_HOME;
          } else {
            const homeName = process.platform === "win32" && source.USERPROFILE ? "USERPROFILE" : "HOME";
            const homeValue = source[homeName];
            if (homeValue !== undefined && homeValue.length > 0) env[homeName] = homeValue;
          }
          guarantees.push(
            "Codex reuses the caller's native login boundary while ignore flags and validated runtime-local MCP overrides exclude ambient configuration",
          );
        }
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

  if (canary !== undefined) {
    const isolate = CANARY_MCP_ISOLATION[harness];
    if (harness === "codex" && canary.mcpConfigOverrides === undefined) {
      blockedReasons.push("codex canary isolation requires validated runtime-local MCP configuration overrides");
    } else if (isolate === null) {
      blockedReasons.push(
        `${harness} cannot be pointed at a canary observation front: ${CANARY_MCP_ISOLATION_ABSENCE[harness] ?? "no reason recorded"}`,
      );
    } else {
      // Appended through the accumulator this function already builds. Only a
      // VALUELESS flag is de-duplicated, and only against the flags this
      // function itself pushed: the claude branch above already asked for
      // --strict-mcp-config, and asking twice is a second spelling of one
      // guarantee. Skipping a value-taking flag would leave its value behind
      // as a bare argument, so those are always pushed as a pair.
      const flags = isolate(canary);
      for (let index = 0; index < flags.length; index += 1) {
        const flag = flags[index] as string;
        const next = flags[index + 1];
        const takesValue = next !== undefined && !next.startsWith("--");
        if (!takesValue && args.includes(flag)) continue;
        args.push(flag);
        if (takesValue) {
          args.push(next);
          index += 1;
        }
      }
      guarantees.push(
        `${harness} loads only the canary runtime's MCP configuration, in which every server is fronted by the ` +
          "alpha-AOS observation proxy; the user's own MCP configuration is excluded for this run",
      );
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

/**
 * Returns harness-specific preload exclusion arguments and environment variables
 * to isolate an off tree, or reports unprovable support (D-06, D-08, OPTO-05, OPTO-08).
 */
export function getHarnessPreloadExclusion(
  harness: HarnessId,
  isolatedRoot: string,
  options?: { surface?: "cli" | "gui" | undefined },
): HarnessPreloadExclusion {
  switch (harness) {
    case "codex":
      return {
        args: ["--strict-config", "--ignore-user-config", "--ignore-rules"],
        env: { CODEX_HOME: join(isolatedRoot, "codex") },
        provable: true,
      };
    case "pi":
      return {
        args: ["--no-skills", "--no-extensions", "--no-prompt-templates", "--no-themes"],
        env: { PI_CODING_AGENT_DIR: join(isolatedRoot, "pi") },
        provable: true,
      };
    case "hermes":
      return {
        args: ["chat", "--ignore-user-config", "--ignore-rules"],
        env: { HERMES_HOME: join(isolatedRoot, "hermes") },
        provable: true,
      };
    case "antigravity":
      if (options?.surface === "gui") {
        return {
          args: [],
          env: {},
          provable: false,
          unsupportedReason:
            "Antigravity IDE/GUI desktop launches do not support pre-launch preload exclusion interception (D-06). Use CLI 'agy' or see 'alpha-aos tree inspect'.",
        };
      }
      return {
        args: [],
        env: {
          HOME: join(isolatedRoot, "antigravity", "home"),
          USERPROFILE: join(isolatedRoot, "antigravity", "home"),
        },
        provable: true,
      };
    case "claude":
      return {
        args: ["--setting-sources", "project,local", "--strict-mcp-config"],
        env: { CLAUDE_CONFIG_DIR: join(isolatedRoot, "claude") },
        provable: true,
      };
    default:
      return {
        args: [],
        env: {},
        provable: false,
        unsupportedReason: `Unsupported or unprovable preload isolation for harness '${harness}'`,
      };
  }
}
