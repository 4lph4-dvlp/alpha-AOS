import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROMOTION_STATUS_START = "<!-- PROMOTION-STATUS-START -->";
export const PROMOTION_STATUS_END = "<!-- PROMOTION-STATUS-END -->";
export const PROMOTION_BLOCKED_LABEL = "promotion-blocked";

/**
 * Default GitHub CLI command executor using child_process.spawn with argument vectors.
 * Shell interpolation is forbidden (shell: false).
 */
export async function defaultExecutor(args, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn("gh", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => reject(err));
    child.on("close", (exitCode) => {
      resolveResult({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

/**
 * Checks the latest completed main branch CI baseline run to determine candidate promotion eligibility.
 * Fails closed (eligible: false) if no completed run is found or if the API query errors.
 */
export async function checkMainBaseline(options = {}, execute = defaultExecutor) {
  const branch = options.branch || "main";
  const workflow = options.workflow || "ci.yml";

  const res = await execute([
    "run", "list",
    "--workflow", workflow,
    "--branch", branch,
    "--status", "completed",
    "--limit", "1",
    "--json", "databaseId,status,conclusion,headSha,url,createdAt",
  ]);

  if (res.exitCode !== 0) {
    return {
      eligible: false,
      reason: `API error querying runs: ${res.stderr.trim()}`,
      baselineRun: null,
    };
  }

  let runs = [];
  try {
    runs = JSON.parse(res.stdout || "[]");
  } catch {
    return {
      eligible: false,
      reason: "Malformed JSON response from GitHub CLI while querying runs",
      baselineRun: null,
    };
  }

  if (!Array.isArray(runs) || runs.length === 0) {
    return {
      eligible: false,
      reason: "No completed main CI baseline run found",
      baselineRun: null,
    };
  }

  const latest = runs[0];
  if (latest.conclusion === "success") {
    return {
      eligible: true,
      reason: undefined,
      baselineRun: {
        runId: latest.databaseId,
        headSha: latest.headSha,
        url: latest.url,
        createdAt: latest.createdAt,
        conclusion: "success",
      },
    };
  }

  // Failing baseline: query job details to extract failed legs
  const viewRes = await execute([
    "run", "view", String(latest.databaseId),
    "--json", "jobs",
  ]);
  let failedLegs = [];
  if (viewRes.exitCode === 0) {
    try {
      const jobsData = JSON.parse(viewRes.stdout || "{}").jobs || [];
      failedLegs = jobsData
        .filter((j) => j.conclusion && j.conclusion !== "success")
        .map((j) => j.name);
    } catch {
      failedLegs = ["Unknown (error parsing jobs)"];
    }
  }

  return {
    eligible: false,
    reason: "Main CI baseline is red",
    baselineRun: {
      runId: latest.databaseId,
      headSha: latest.headSha,
      url: latest.url,
      createdAt: latest.createdAt,
      conclusion: latest.conclusion,
      failedLegs,
    },
  };
}

/**
 * Renders promotion status banner bounded by stable HTML comments.
 */
export function renderPromotionBanner(status) {
  if (status.eligible && status.baselineRun) {
    return [
      PROMOTION_STATUS_START,
      "### ✅ Promotion Eligible: Main CI Baseline is Green",
      `- **Baseline Run:** [${status.baselineRun.runId}](${status.baselineRun.url})`,
      `- **Commit:** \`${status.baselineRun.headSha}\``,
      `- **Timestamp:** ${status.baselineRun.createdAt}`,
      PROMOTION_STATUS_END,
    ].join("\n");
  }

  if (status.baselineRun) {
    const failedList = status.baselineRun.failedLegs && status.baselineRun.failedLegs.length > 0
      ? status.baselineRun.failedLegs.join(", ")
      : "Unknown";
    return [
      PROMOTION_STATUS_START,
      `### 🚫 Promotion Blocked: Main CI is failing (Run #${status.baselineRun.runId})`,
      `- **Baseline Run:** [${status.baselineRun.runId}](${status.baselineRun.url})`,
      `- **Commit:** \`${status.baselineRun.headSha}\``,
      `- **Timestamp:** ${status.baselineRun.createdAt}`,
      `- **Failed Legs:** ${failedList}`,
      PROMOTION_STATUS_END,
    ].join("\n");
  }

  return [
    PROMOTION_STATUS_START,
    "### 🚫 Promotion Blocked: Main CI is failing (No completed run)",
    `- **Reason:** ${status.reason || "Indeterminate baseline"}`,
    PROMOTION_STATUS_END,
  ].join("\n");
}

/**
 * Updates candidate PR description banner and toggles promotion-blocked label safely.
 */
export async function updateCandidatePrStatus(status, options = {}, execute = defaultExecutor) {
  let pr = null;

  if (options.prNumber) {
    const viewRes = await execute([
      "pr", "view", String(options.prNumber),
      "--json", "number,body,labels",
    ]);
    if (viewRes.exitCode === 0) {
      try {
        pr = JSON.parse(viewRes.stdout || "{}");
      } catch {
        pr = null;
      }
    }
  } else {
    const candidateBranch = options.candidateBranch || "automation/dependency-candidate";
    const listRes = await execute([
      "pr", "list",
      "--head", candidateBranch,
      "--json", "number,body,labels",
      "--limit", "1",
    ]);
    if (listRes.exitCode === 0) {
      try {
        const prs = JSON.parse(listRes.stdout || "[]");
        if (Array.isArray(prs) && prs.length > 0) {
          pr = prs[0];
        }
      } catch {
        pr = null;
      }
    }
  }

  const banner = renderPromotionBanner(status);

  // Write to GitHub Step Summary if defined
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, banner + "\n\n", "utf8");
    } catch (err) {
      console.warn("Failed to write to GITHUB_STEP_SUMMARY:", err);
    }
  }

  if (!pr) {
    return { action: "no_pr_found", eligible: status.eligible };
  }

  // Idempotently replace or prepend status banner
  const oldBody = pr.body || "";
  let newBody = "";
  const startIndex = oldBody.indexOf(PROMOTION_STATUS_START);
  const endIndex = oldBody.indexOf(PROMOTION_STATUS_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    const before = oldBody.slice(0, startIndex);
    const after = oldBody.slice(endIndex + PROMOTION_STATUS_END.length);
    newBody = before + banner + after;
  } else {
    newBody = oldBody ? `${banner}\n\n${oldBody}` : banner;
  }

  // Preflight label creation
  await execute([
    "label", "create", PROMOTION_BLOCKED_LABEL,
    "--color", "b60205",
    "--description", "Candidate dependency promotion is blocked",
    "--force",
  ]);

  const labels = Array.isArray(pr.labels) ? pr.labels : [];
  const hasBlockedLabel = labels.some((l) => (typeof l === "string" ? l : l?.name) === PROMOTION_BLOCKED_LABEL);

  const editArgs = ["pr", "edit", String(pr.number), "--body", newBody];

  if (!status.eligible) {
    // Promotion is blocked: add label if not present
    if (!hasBlockedLabel) {
      editArgs.push("--add-label", PROMOTION_BLOCKED_LABEL);
    }
  } else {
    // Promotion is eligible: remove label ONLY if present (avoids validation error)
    if (hasBlockedLabel) {
      editArgs.push("--remove-label", PROMOTION_BLOCKED_LABEL);
    }
  }

  const editRes = await execute(editArgs);
  if (editRes.exitCode !== 0) {
    throw new Error(`Failed to update PR #${pr.number}: ${editRes.stderr}`);
  }

  return {
    action: "updated",
    prNumber: pr.number,
    eligible: status.eligible,
  };
}

function parseCliArgs(argv) {
  const options = {
    updatePr: false,
    candidateBranch: "automation/dependency-candidate",
    branch: "main",
    workflow: "ci.yml",
    prNumber: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--update-pr") {
      options.updatePr = true;
    } else if (arg === "--candidate-branch" && i + 1 < argv.length) {
      options.candidateBranch = argv[++i];
    } else if (arg === "--branch" && i + 1 < argv.length) {
      options.branch = argv[++i];
    } else if (arg === "--workflow" && i + 1 < argv.length) {
      options.workflow = argv[++i];
    } else if (arg === "--pr-number" && i + 1 < argv.length) {
      options.prNumber = Number(argv[++i]);
    }
  }
  return options;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) {
  try {
    const cliOptions = parseCliArgs(process.argv.slice(2));
    const status = await checkMainBaseline(cliOptions, defaultExecutor);

    let prResult = null;
    if (cliOptions.updatePr) {
      prResult = await updateCandidatePrStatus(status, cliOptions, defaultExecutor);
    }

    console.log(JSON.stringify({ status, prResult }, null, 2));
    // D-10: always exit 0 so candidate lock updates remain inspectable
    process.exitCode = 0;
  } catch (err) {
    console.error("check-main-baseline error:", err);
    // D-10: keep exit 0 even on unexpected error to preserve staging artifact visibility
    process.exitCode = 0;
  }
}
