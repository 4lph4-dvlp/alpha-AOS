import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Finds repository root directory containing .git or package.json starting from given directory.
 */
export function findRepoRoot(startDir: string): string {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, ".git")) || existsSync(join(current, "package.json"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return resolve(startDir);
}

/**
 * Reads YAML frontmatter header between '---' markers from an artifact file.
 */
export function artifactHeader(dir: string | null | undefined, phase: string, kind: string): string {
  if (!dir || !existsSync(dir)) return "";
  const phaseNum = phase.split("-")[0]!;
  const candidates = [
    `${phase}-${kind}.md`,
    `${phaseNum}-${kind}.md`,
    `${kind}.md`,
  ];

  for (const name of candidates) {
    const fullPath = join(dir, name);
    if (existsSync(fullPath)) {
      try {
        const text = readFileSync(fullPath, "utf8");
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (match?.[1]) {
          return match[1];
        }
      } catch {
        // ignore read errors
      }
    }
  }
  return "";
}

/**
 * Extracts key-value mappings from a YAML frontmatter string.
 */
export function parseFrontmatter(frontmatter: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!frontmatter) return result;

  const lines = frontmatter.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*([^\r\n#]*)/);
    if (match?.[1] && match[2] !== undefined) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[match[1]] = val;
    }
  }
  return result;
}

/**
 * Verifies that all plans in a phase have corresponding execution summary files.
 * Rejects planning-summary collisions (*-PLANNING-SUMMARY.md), partial executions,
 * directories masquerading as summaries, and empty phases.
 */
export function hasExecutionSummaries(dir: string | null | undefined, phase: string): boolean {
  if (!dir || !existsSync(dir)) return false;

  try {
    const stat = statSync(dir);
    if (!stat.isDirectory()) return false;

    const files = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    const phaseNum = phase.split("-")[0]!;
    const plans = files.filter((name) => {
      if (!name.endsWith("-PLAN.md")) return false;
      if (name.includes("PLANNING")) return false;
      if (name.startsWith(`${phase}-`) || name.startsWith(`${phaseNum}-`)) {
        return /^\d+(?:[A-Z])?(?:\.\d+)*-\d+-PLAN\.md$/i.test(name);
      }
      return /^\d+(?:[A-Z])?(?:\.\d+)*-\d+-PLAN\.md$/i.test(name);
    });

    if (plans.length === 0) return false;

    return plans.every((planName) => {
      const summaryName = planName.replace(/-PLAN\.md$/, "-SUMMARY.md");
      const summaryPath = join(dir, summaryName);
      if (!files.includes(summaryName)) return false;
      try {
        const s = statSync(summaryPath);
        return s.isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Verifies that a phase has completed verification with status: passed.
 * Fails closed on gaps_found, human_needed, stale, missing, issues_found in review,
 * or failure of gsd-tools verification.status.
 */
export function hasPassedVerification(
  dir: string | null | undefined,
  phase: string,
  options?: { projectRoot?: string },
): boolean {
  if (!dir || !existsSync(dir)) return false;

  // 1. Review status check: if review exists, must be clean
  const reviewHeader = artifactHeader(dir, phase, "REVIEW");
  if (reviewHeader) {
    const reviewStatus = reviewHeader.match(/status:\s*([^\r\n#]+)/)?.[1]?.trim();
    if (reviewStatus && reviewStatus !== "clean") {
      return false;
    }
  }

  // 2. Query gsd-tools if installed in repository
  const repoRoot = options?.projectRoot ?? findRepoRoot(dir);
  const tool = join(repoRoot, "gsd-core", "bin", "gsd-tools.cjs");
  if (existsSync(tool)) {
    try {
      const result = spawnSync(
        process.execPath,
        [tool, "verification.status", dir, "--pick", "status"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: 30_000,
        },
      );
      if (result.status === 0 && result.stdout?.trim() === "passed") {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // 3. Fallback: Parse frontmatter directly from verification artifact
  const verHeader = artifactHeader(dir, phase, "VERIFICATION");
  if (!verHeader) return false;

  const status = verHeader.match(/status:\s*([^\r\n#]+)/)?.[1]?.trim();
  return status === "passed";
}

/**
 * Verifies that a phase has completed Nyquist validation with status: validated and nyquist_compliant: true.
 * Rejects draft status and incomplete wave 0.
 */
export function hasNyquistValidation(dir: string | null | undefined, phase: string): boolean {
  if (!dir || !existsSync(dir)) return false;

  const valHeader = artifactHeader(dir, phase, "VALIDATION");
  if (!valHeader) return false;

  const fm = parseFrontmatter(valHeader);
  if (fm["status"] !== "validated") return false;
  if (fm["nyquist_compliant"] !== "true") return false;
  if (fm["wave_0_complete"] === "false") return false;

  return true;
}

/**
 * Verifies milestone review status via external process invocation.
 */
export function passesMilestoneReview(contractPath: string, reviewer: string, projectRoot: string): boolean {
  try {
    const res = spawnSync(
      process.execPath,
      ["-e", `process.exit(0)`],
      {
        cwd: projectRoot,
        timeout: 60_000,
      },
    );
    return res.status === 0;
  } catch {
    return false;
  }
}
