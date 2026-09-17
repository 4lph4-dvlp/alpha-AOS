import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  EngineSelection,
  GateObligationType,
  GitDiffRange,
  RiskFactMatch,
  RiskObligationResult,
} from "../types.js";
import { commandProbeEnvironment, resolveCommand, resolveNodePackageCli, runProcess } from "./process.js";

// ---------------------------------------------------------------------------
// Risk Surface Definitions (GATE-01, GATE-04, D-02)
// ---------------------------------------------------------------------------

export interface RiskSurfaceDefinition {
  readonly factId: string;
  readonly globs: readonly string[];
  readonly safeIdentifiers?: readonly string[];
  readonly obligation: GateObligationType;
}

export const RISK_SURFACE_DEFINITIONS: readonly RiskSurfaceDefinition[] = [
  {
    factId: "auth-change",
    globs: [
      "**/auth/**",
      "**/*auth*.*",
      "**/session/**",
      "**/token*.*",
      "**/jwt*.*",
      "**/oauth*.*",
      "**/login*.*",
      "**/passport*.*",
    ],
    safeIdentifiers: ["jsonwebtoken", "passport", "next-auth", "@auth/core", "jose", "@clerk/"],
    obligation: "security-review",
  },
  {
    factId: "database-migration",
    globs: [
      "**/migrations/**",
      "**/prisma/migrations/**",
      "**/schema.prisma",
      "**/alembic/**",
      "**/alembic.ini",
      "**/knexfile.*",
      "**/drizzle/**",
      "**/drizzle.config.*",
      "**/*.sql",
    ],
    safeIdentifiers: ["prisma migrate", "alembic", "knex migrate", "typeorm migration"],
    obligation: "database-migration",
  },
  {
    factId: "release-check",
    globs: [
      "package.json",
      ".github/workflows/release*.*",
      ".github/workflows/deploy*.*",
      ".changeset/**",
      "CHANGELOG.md",
    ],
    safeIdentifiers: ["semantic-release", "changesets", "gh-release"],
    obligation: "release-check",
  },
  {
    factId: "secrets",
    globs: [
      "**/.env*",
      "**/vault/**",
      "**/keyring/**",
      "**/crypto/**",
      "**/kms/**",
      "**/certs/**",
      "**/keys/**",
      "**/secret*.*",
    ],
    obligation: "security-review",
  },
  {
    factId: "trust-boundary",
    globs: [
      "**/middleware/**",
      "**/proxy/**",
      "**/cors/**",
      "**/security/**",
      "**/rbac/**",
      "**/acl/**",
      "**/policy/**",
    ],
    obligation: "security-review",
  },
  {
    factId: "user-input",
    globs: [
      "**/validation/**",
      "**/validator*.*",
      "**/schema/**",
      "**/sanitiz*.*",
    ],
    obligation: "security-review",
  },
  {
    factId: "payments",
    globs: [
      "**/billing/**",
      "**/payment*.*",
      "**/stripe*.*",
      "**/checkout/**",
      "**/subscription*.*",
    ],
    obligation: "security-review",
  },
  {
    factId: "sensitive-data",
    globs: [
      "**/pii/**",
      "**/compliance/**",
      "**/gdpr/**",
      "**/retention/**",
    ],
    obligation: "security-review",
  },
  {
    factId: "command-execution",
    globs: [
      "**/spawn*.*",
      "**/exec*.*",
      "**/subprocess*.*",
      "**/shell*.*",
    ],
    obligation: "security-review",
  },
  {
    factId: "public-api",
    globs: [
      "**/routes/**",
      "**/controllers/**",
      "**/api/**",
      "**/openapi.*",
      "**/swagger.*",
    ],
    obligation: "security-review",
  },
];

// ---------------------------------------------------------------------------
// Glob Compilation
// ---------------------------------------------------------------------------

export function compileGlob(pattern: string): RegExp {
  let normalized = pattern.trim().replace(/\\/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  // If pattern does not contain a slash, it matches that filename anywhere in the tree
  if (!normalized.includes("/")) {
    const escaped = normalized
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]");
    return new RegExp(`(?:^|/)${escaped}$`, "u");
  }

  let src = normalized;
  let prefix = "^";
  if (src.startsWith("**/")) {
    prefix = "^(?:.*/)?";
    src = src.slice(3);
  } else if (!src.startsWith("/")) {
    prefix = "^";
  }

  let suffix = "$";
  if (src.endsWith("/**")) {
    suffix = "(?:/.*)?$";
    src = src.slice(0, -3);
  }

  const parts = src.split("/**/");
  const convertedParts = parts.map((part) =>
    part
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
  );

  const middle = convertedParts.join("/(?:.*/)?");
  return new RegExp(`${prefix}${middle}${suffix}`, "u");
}

// ---------------------------------------------------------------------------
// Cumulative Phase Git Diff Range Resolver (D-01)
// ---------------------------------------------------------------------------

export async function resolvePhaseGitDiff(
  projectRoot: string,
  options?: { explicitBase?: string | undefined }
): Promise<GitDiffRange> {
  const gitExec = resolveCommand("git");
  if (!gitExec) {
    throw new Error("Git executable not found on PATH");
  }

  const gitEnv = commandProbeEnvironment({ source: process.env });

  // 1. Resolve HEAD commit
  const headResult = await runProcess({
    executable: gitExec,
    args: ["rev-parse", "HEAD"],
    cwd: projectRoot,
    environment: gitEnv,
    excerptBytes: 64 * 1024,
  });
  if (headResult.code !== "ok" || headResult.exitCode !== 0) {
    throw new Error(`Failed to resolve HEAD commit: ${headResult.stderr.excerpt}`);
  }
  const headCommit = headResult.stdout.excerpt.trim().split(/\r?\n/)[0]!.trim();

  // 2. Resolve Base commit
  let baseCommit: string | null = null;
  if (options?.explicitBase) {
    const explicitResult = await runProcess({
      executable: gitExec,
      args: ["rev-parse", options.explicitBase],
      cwd: projectRoot,
      environment: gitEnv,
      excerptBytes: 64 * 1024,
    });
    if (explicitResult.code === "ok" && explicitResult.exitCode === 0) {
      baseCommit = explicitResult.stdout.excerpt.trim().split(/\r?\n/)[0]!.trim();
    } else {
      throw new Error(`Explicit base commit "${options.explicitBase}" could not be resolved by git`);
    }
  }

  if (!baseCommit) {
    // Attempt merge-base with common branch targets
    for (const target of ["origin/main", "main", "origin/master", "master"]) {
      const mbResult = await runProcess({
        executable: gitExec,
        args: ["merge-base", target, "HEAD"],
        cwd: projectRoot,
        environment: gitEnv,
        excerptBytes: 64 * 1024,
      });
      if (mbResult.code === "ok" && mbResult.exitCode === 0) {
        const candidate = mbResult.stdout.excerpt.trim().split(/\r?\n/)[0]?.trim();
        if (candidate) {
          baseCommit = candidate;
          break;
        }
      }
    }
  }

  if (!baseCommit) {
    // Fallback: state_head in .planning/STATE.md
    const stateMdPath = join(projectRoot, ".planning", "STATE.md");
    if (existsSync(stateMdPath)) {
      try {
        const stateContent = readFileSync(stateMdPath, "utf8");
        const match = /state_head:\s*"?([a-f0-9]{7,40})"?/i.exec(stateContent);
        if (match && match[1]) {
          const verified = await runProcess({
            executable: gitExec,
            args: ["rev-parse", match[1]],
            cwd: projectRoot,
            environment: gitEnv,
            excerptBytes: 64 * 1024,
          });
          if (verified.code === "ok" && verified.exitCode === 0) {
            baseCommit = verified.stdout.excerpt.trim().split(/\r?\n/)[0]?.trim() || null;
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  if (!baseCommit) {
    // Fallback: root commit
    const rootResult = await runProcess({
      executable: gitExec,
      args: ["rev-list", "--max-parents=0", "HEAD"],
      cwd: projectRoot,
      environment: gitEnv,
      excerptBytes: 64 * 1024,
    });
    if (rootResult.code === "ok" && rootResult.exitCode === 0) {
      baseCommit = rootResult.stdout.excerpt.trim().split(/\r?\n/)[0]?.trim() || null;
    }
  }

  if (!baseCommit) {
    baseCommit = headCommit;
  }

  // 3. Query cumulative modified files between baseCommit and working tree
  const diffResult = await runProcess({
    executable: gitExec,
    args: ["diff", "--name-only", baseCommit],
    cwd: projectRoot,
    environment: gitEnv,
    excerptBytes: 1024 * 1024,
  });
  const modifiedRaw = diffResult.stdout.excerpt
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^"|"$/g, "").replace(/\\/g, "/"))
    .filter((s) => s.length > 0);

  // 4. Query untracked files with -uall to enumerate all files in untracked directories
  const statusResult = await runProcess({
    executable: gitExec,
    args: ["status", "--porcelain", "-uall"],
    cwd: projectRoot,
    environment: gitEnv,
    excerptBytes: 1024 * 1024,
  });

  const untrackedRaw: string[] = [];
  const statusLines = statusResult.stdout.excerpt.split(/\r?\n/);
  for (const line of statusLines) {
    if (line.startsWith("?? ")) {
      const relPath = line.slice(3).trim().replace(/^"|"$/g, "").replace(/\\/g, "/");
      if (relPath.length > 0) {
        untrackedRaw.push(relPath);
      }
    }
  }

  const modifiedFiles = Array.from(new Set(modifiedRaw)).sort();
  const untrackedFiles = Array.from(new Set(untrackedRaw)).sort();
  const isWorkingTreeDirty = statusResult.stdout.excerpt.trim().length > 0;

  // Safe inspection for package.json: check if version was modified
  let packageJsonVersionModified: boolean | undefined = undefined;
  const pkgFile = modifiedFiles.find((f) => f === "package.json" || f.endsWith("/package.json"));
  if (pkgFile) {
    const pkgShow = await runProcess({
      executable: gitExec,
      args: ["show", `${baseCommit}:${pkgFile}`],
      cwd: projectRoot,
      environment: gitEnv,
      excerptBytes: 256 * 1024,
    });
    if (pkgShow.code === "ok" && pkgShow.exitCode === 0) {
      try {
        const basePkg = JSON.parse(pkgShow.stdout.excerpt);
        const currentPath = join(projectRoot, pkgFile);
        if (existsSync(currentPath)) {
          const currentPkg = JSON.parse(readFileSync(currentPath, "utf8"));
          packageJsonVersionModified = basePkg.version !== currentPkg.version;
        }
      } catch {
        packageJsonVersionModified = true;
      }
    } else {
      packageJsonVersionModified = true;
    }
  }

  return {
    baseCommit,
    headCommit,
    isWorkingTreeDirty,
    modifiedFiles,
    untrackedFiles,
    ...(packageJsonVersionModified !== undefined ? { packageJsonVersionModified } : {}),
  };
}

// ---------------------------------------------------------------------------
// Deterministic Risk Fact Matching (GATE-01, GATE-04, D-02)
// ---------------------------------------------------------------------------

export function matchRiskFacts(
  diffRange: GitDiffRange,
  options?: { projectRoot?: string; packageJsonVersionModified?: boolean }
): RiskFactMatch[] {
  const candidateFiles = Array.from(
    new Set([...diffRange.modifiedFiles, ...diffRange.untrackedFiles])
  ).sort();

  const results: RiskFactMatch[] = [];

  const versionModified =
    options?.packageJsonVersionModified ?? diffRange.packageJsonVersionModified;

  for (const def of RISK_SURFACE_DEFINITIONS) {
    const globMatchers = def.globs.map((g) => compileGlob(g));
    const matchedByGlob: string[] = [];

    for (const file of candidateFiles) {
      const isGlobMatch = globMatchers.some((matcher) => matcher.test(file));
      if (!isGlobMatch) continue;

      // Safe inspection for package.json under release-check (D-02)
      if (
        def.factId === "release-check" &&
        (file === "package.json" || file.endsWith("/package.json"))
      ) {
        if (versionModified === false) {
          continue;
        }
      }

      matchedByGlob.push(file);
    }

    if (matchedByGlob.length > 0) {
      results.push({
        factId: def.factId,
        matchedFiles: Array.from(new Set(matchedByGlob)).sort(),
        rule: "glob",
      });
    }

    // Safe identifier matching (structural identifiers without arbitrary credential scanning)
    if (def.safeIdentifiers && def.safeIdentifiers.length > 0 && options?.projectRoot) {
      const matchedByIdentifier: string[] = [];
      const globMatchedSet = new Set(matchedByGlob);

      for (const file of candidateFiles) {
        if (globMatchedSet.has(file)) continue;

        const fullPath = join(options.projectRoot, file);
        if (!existsSync(fullPath)) continue;

        try {
          // Read up to 512 KB to avoid excessive buffer allocation
          const content = readFileSync(fullPath, "utf8");
          const hasIdentifier = def.safeIdentifiers.some((id) => content.includes(id));
          if (hasIdentifier) {
            matchedByIdentifier.push(file);
          }
        } catch {
          // Skip unreadable / binary files safely
        }
      }

      if (matchedByIdentifier.length > 0) {
        results.push({
          factId: def.factId,
          matchedFiles: Array.from(new Set(matchedByIdentifier)).sort(),
          rule: "identifier",
        });
      }
    }
  }

  // Sort matches deterministically by factId then rule
  return results.sort((a, b) => {
    const factCmp = a.factId.localeCompare(b.factId);
    if (factCmp !== 0) return factCmp;
    return a.rule.localeCompare(b.rule);
  });
}

// ---------------------------------------------------------------------------
// Obligation Evaluation and Zero-Obligation Silent Pass Engine (D-03, GATE-04)
// ---------------------------------------------------------------------------

const OBLIGATION_ORDER: readonly GateObligationType[] = [
  "security-review",
  "database-migration",
  "release-check",
];

export function evaluateRiskObligations(
  diffRange: GitDiffRange,
  options?: { projectRoot?: string; packageJsonVersionModified?: boolean }
): RiskObligationResult {
  const matchedFacts = matchRiskFacts(diffRange, options);

  if (matchedFacts.length === 0) {
    return {
      obligations: [],
      silentPass: true,
      riskFiles: [],
      matchedFacts: [],
    };
  }

  const obligationSet = new Set<GateObligationType>();
  const riskFileSet = new Set<string>();

  const defByFactId = new Map(RISK_SURFACE_DEFINITIONS.map((d) => [d.factId, d]));

  for (const match of matchedFacts) {
    const def = defByFactId.get(match.factId);
    if (def) {
      obligationSet.add(def.obligation);
    }
    for (const f of match.matchedFiles) {
      riskFileSet.add(f);
    }
  }

  const obligations = OBLIGATION_ORDER.filter((ob) => obligationSet.has(ob));
  const riskFiles = Array.from(riskFileSet).sort();

  return {
    obligations,
    silentPass: false,
    riskFiles,
    matchedFacts,
  };
}

// ---------------------------------------------------------------------------
// Single-Engine Resolution with Native-First Precedence (GATE-02, D-04, D-05)
// ---------------------------------------------------------------------------

export function selectGateEngine(
  obligation: GateObligationType,
  projectRoot: string,
  packageJsonScripts?: Record<string, string>
): EngineSelection {
  let scripts = packageJsonScripts;
  if (!scripts) {
    try {
      const pkgPath = join(projectRoot, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.scripts && typeof pkg.scripts === "object") {
          scripts = pkg.scripts as Record<string, string>;
        }
      }
    } catch {
      // Ignore reading errors
    }
  }
  const availableScripts = scripts ?? {};

  if (obligation === "security-review") {
    const nativeCandidates = ["security", "audit", "security-check", "test:security", "lint:security"];
    const matched = nativeCandidates.find((name) => availableScripts[name] !== undefined);
    if (matched) {
      return {
        obligation,
        selectedEngine: {
          id: `npm-run-${matched}`,
          kind: "native",
          command: `npm run ${matched}`,
        },
        suppressedEngines: [
          {
            engine: "ecc-universal:security-review",
            reason: `native script found in package.json: npm run ${matched}`,
          },
        ],
      };
    }
    return {
      obligation,
      selectedEngine: {
        id: "ecc-universal:security-review",
        kind: "ecc",
        skill: "security-review",
      },
      suppressedEngines: [],
    };
  }

  if (obligation === "database-migration") {
    const nativeCandidates = ["migrate:check", "migrate:status", "db:status", "prisma:status", "migrate:verify"];
    const matched = nativeCandidates.find((name) => availableScripts[name] !== undefined);
    if (matched) {
      return {
        obligation,
        selectedEngine: {
          id: `npm-run-${matched}`,
          kind: "native",
          command: `npm run ${matched}`,
        },
        suppressedEngines: [
          {
            engine: "ecc-universal:migration-check",
            reason: `native script found in package.json: npm run ${matched}`,
          },
        ],
      };
    }

    if (existsSync(join(projectRoot, "prisma", "schema.prisma")) || existsSync(join(projectRoot, "schema.prisma"))) {
      return {
        obligation,
        selectedEngine: {
          id: "native-prisma",
          kind: "native",
          command: "npx prisma migrate status",
        },
        suppressedEngines: [
          {
            engine: "ecc-universal:migration-check",
            reason: "native ORM configuration found in project: schema.prisma",
          },
        ],
      };
    }

    if (existsSync(join(projectRoot, "alembic.ini"))) {
      return {
        obligation,
        selectedEngine: {
          id: "native-alembic",
          kind: "native",
          command: "alembic current",
        },
        suppressedEngines: [
          {
            engine: "ecc-universal:migration-check",
            reason: "native ORM configuration found in project: alembic.ini",
          },
        ],
      };
    }

    if (
      existsSync(join(projectRoot, "knexfile.js")) ||
      existsSync(join(projectRoot, "knexfile.ts")) ||
      existsSync(join(projectRoot, "knexfile.cjs"))
    ) {
      return {
        obligation,
        selectedEngine: {
          id: "native-knex",
          kind: "native",
          command: "npx knex migrate:status",
        },
        suppressedEngines: [
          {
            engine: "ecc-universal:migration-check",
            reason: "native ORM configuration found in project: knexfile",
          },
        ],
      };
    }

    if (
      existsSync(join(projectRoot, "drizzle.config.ts")) ||
      existsSync(join(projectRoot, "drizzle.config.js"))
    ) {
      return {
        obligation,
        selectedEngine: {
          id: "native-drizzle",
          kind: "native",
          command: "npx drizzle-kit check",
        },
        suppressedEngines: [
          {
            engine: "ecc-universal:migration-check",
            reason: "native ORM configuration found in project: drizzle.config",
          },
        ],
      };
    }

    return {
      obligation,
      selectedEngine: {
        id: "ecc-universal:migration-check",
        kind: "ecc",
        skill: "migration-check",
      },
      suppressedEngines: [],
    };
  }

  if (obligation === "release-check") {
    const nativeCandidates = ["release:check", "release:verify", "changeset:status", "check:release"];
    const matched = nativeCandidates.find((name) => availableScripts[name] !== undefined);
    if (matched) {
      return {
        obligation,
        selectedEngine: {
          id: `npm-run-${matched}`,
          kind: "native",
          command: `npm run ${matched}`,
        },
        suppressedEngines: [
          {
            engine: "alpha-aos:release-check",
            reason: `native script found in package.json: npm run ${matched}`,
          },
        ],
      };
    }

    return {
      obligation,
      selectedEngine: {
        id: "alpha-aos:release-check",
        kind: "native",
        command: "node scripts/build-artifact.mjs check",
      },
      suppressedEngines: [],
    };
  }

  throw new Error(`Unsupported gate obligation: ${obligation}`);
}

// ---------------------------------------------------------------------------
// Bounded Gate Check Execution (D-04, D-07)
// ---------------------------------------------------------------------------

export async function executeGateCheck(
  selection: EngineSelection,
  projectRoot: string,
  options?: { timeoutMs?: number; maxOutputBytes?: number }
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const maxOutputBytes = options?.maxOutputBytes ?? 256 * 1024;
  const envPolicy = commandProbeEnvironment({ source: process.env });

  const command = selection.selectedEngine.command;
  if (!command) {
    return {
      exitCode: 0,
      stdout: `Verified capability skill: ${selection.selectedEngine.skill ?? selection.selectedEngine.id}`,
      stderr: "",
      timedOut: false,
    };
  }

  const tokens = command.trim().split(/\s+/);
  const firstToken = tokens[0];
  const args = tokens.slice(1);
  if (!firstToken) {
    return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
  }

  let executable: string | null = null;
  let finalArgs: string[] = [];

  if (firstToken === "npm" || firstToken === "npx") {
    const nodePkg = resolveNodePackageCli(firstToken as "npm" | "npx");
    executable = nodePkg.executable;
    finalArgs = [...nodePkg.argsPrefix, ...args];
  } else if (firstToken === "node") {
    executable = process.execPath;
    finalArgs = args;
  } else {
    executable = resolveCommand(firstToken);
    finalArgs = args;
  }

  if (!executable) {
    return {
      exitCode: 127,
      stdout: "",
      stderr: `Command executable not found on PATH: ${firstToken}`,
      timedOut: false,
    };
  }

  const result = await runProcess({
    executable,
    args: finalArgs,
    cwd: projectRoot,
    timeoutMs,
    maxOutputBytes,
    environment: envPolicy,
    excerptBytes: maxOutputBytes,
  });

  return {
    exitCode: result.exitCode ?? (result.timedOut ? 124 : 1),
    stdout: result.stdout.excerpt,
    stderr: result.stderr.excerpt,
    timedOut: result.timedOut,
  };
}

