import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RED_MAIN_LABEL = "ci-red-main";
export const RED_MAIN_TITLE_PREFIX = "[CI] Main branch failure";

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
 * Extracts 3-OS matrix legs and any failing prerequisite packaging steps from jobs list.
 */
export function parseMatrixLegs(jobs = []) {
  const legs = [];

  // Inspect prerequisite release package step
  const packageJob = jobs.find((j) => /authoritative release package|package/i.test(j.name));
  if (packageJob && packageJob.conclusion && packageJob.conclusion !== "success") {
    const failedStep = packageJob.steps?.find((s) => s.conclusion === "failure" || s.conclusion === "timed_out");
    legs.push({
      os: packageJob.name,
      result: packageJob.conclusion,
      failingStep: failedStep ? failedStep.name : "—",
    });
  }

  const osTargets = [
    { key: "ubuntu", defaultName: "ubuntu-latest" },
    { key: "macos", defaultName: "macos-latest" },
    { key: "windows", defaultName: "windows-latest" },
  ];

  for (const target of osTargets) {
    const matchedJob = jobs.find((j) => j.name.toLowerCase().includes(target.key));
    if (!matchedJob) {
      legs.push({
        os: target.defaultName,
        result: "missing",
        failingStep: "Job not run",
      });
      continue;
    }
    const failedStep = matchedJob.steps?.find((s) => s.conclusion === "failure" || s.conclusion === "timed_out");
    legs.push({
      os: matchedJob.name,
      result: matchedJob.conclusion ?? "unknown",
      failingStep: failedStep ? failedStep.name : "—",
    });
  }

  return legs;
}

/**
 * Formats matrix legs as a markdown table.
 */
export function formatMatrixTable(legs = []) {
  const header = "| OS Leg | Result | Failing Step |\n|--------|--------|--------------|\n";
  const rows = legs.map((leg) => {
    const icon = leg.result === "success" ? "✅ Pass" : "❌ Fail";
    return `| \`${leg.os}\` | ${icon} | ${leg.failingStep} |`;
  }).join("\n");
  return header + rows;
}

/**
 * Manages the tracking issue lifecycle on main branch CI completions.
 */
export async function runRedMainGuard(options = {}, execute = defaultExecutor) {
  // Defense-in-depth: ignore non-main branches
  if (options.branch !== undefined && options.branch !== "main") {
    return { action: "ignored", reason: `Branch "${options.branch}" is not main` };
  }

  let runId = options.runId;
  let conclusion = options.conclusion;
  let sha = options.sha;
  let url = options.url;

  // If runId is missing, query latest completed run on main
  if (!runId) {
    const listRes = await execute([
      "run", "list",
      "--workflow", "ci.yml",
      "--branch", "main",
      "--status", "completed",
      "--limit", "1",
      "--json", "databaseId,status,conclusion,headSha,url",
    ]);
    if (listRes.exitCode !== 0) {
      throw new Error(`Failed to list completed runs on main: ${listRes.stderr}`);
    }
    const runs = JSON.parse(listRes.stdout || "[]");
    if (runs.length === 0) {
      return { action: "none", reason: "No completed runs on main" };
    }
    runId = runs[0].databaseId;
    conclusion = conclusion || runs[0].conclusion;
    sha = sha || runs[0].headSha;
    url = url || runs[0].url;
  } else if (!conclusion || !sha || !url) {
    // If runId provided but details missing, query run view
    const viewRes = await execute([
      "run", "view", String(runId),
      "--json", "databaseId,conclusion,headSha,url",
    ]);
    if (viewRes.exitCode !== 0) {
      throw new Error(`Failed to view run ${runId}: ${viewRes.stderr}`);
    }
    const runData = JSON.parse(viewRes.stdout || "{}");
    conclusion = conclusion || runData.conclusion;
    sha = sha || runData.headSha;
    url = url || runData.url;
  }

  // Query open issues with RED_MAIN_LABEL
  const issueListRes = await execute([
    "issue", "list",
    "--state", "open",
    "--label", RED_MAIN_LABEL,
    "--json", "number,title,body,url",
  ]);
  if (issueListRes.exitCode !== 0) {
    throw new Error(`Failed to list open issues: ${issueListRes.stderr}`);
  }
  const openIssues = JSON.parse(issueListRes.stdout || "[]");
  const existingIssue = openIssues.find((issue) => issue.title && issue.title.startsWith(RED_MAIN_TITLE_PREFIX)) || null;

  // Case 1: CI failure -> Open or refresh tracking issue
  if (conclusion !== "success") {
    // Query job details for matrix breakdown
    const jobsRes = await execute([
      "run", "view", String(runId),
      "--json", "jobs",
    ]);
    const jobsData = jobsRes.exitCode === 0 ? JSON.parse(jobsRes.stdout || "{}").jobs || [] : [];
    const legs = parseMatrixLegs(jobsData);
    const matrixTable = formatMatrixTable(legs);

    // Preflight label creation
    await execute([
      "label", "create", RED_MAIN_LABEL,
      "--color", "d73a4a",
      "--description", "Tracking issue for failing CI runs on main",
      "--force",
    ]);

    const timestamp = new Date().toISOString();
    const issueBody = [
      `## [CI] Main Branch Failure: Run #${runId}`,
      "",
      `- **Run ID:** [${runId}](${url || `#`})`,
      `- **Commit SHA:** \`${sha || "unknown"}\``,
      `- **Conclusion:** \`${conclusion}\``,
      `- **Timestamp:** ${timestamp}`,
      "",
      "### 3-OS Matrix Status",
      "",
      matrixTable,
      "",
      "> This tracking issue was automatically generated by Red-Main Guard. It will be automatically closed when main CI passes green on all legs.",
    ].join("\n");

    if (existingIssue) {
      // Refresh issue body
      await execute(["issue", "edit", String(existingIssue.number), "--body", issueBody]);

      // Append update comment
      const commentBody = [
        `### ⚠️ Main CI Failure Recurred: Run #${runId}`,
        "",
        `- **Run ID:** [${runId}](${url || `#`})`,
        `- **Commit SHA:** \`${sha || "unknown"}\``,
        `- **Timestamp:** ${timestamp}`,
        "",
        "#### Matrix Status",
        "",
        matrixTable,
      ].join("\n");
      await execute(["issue", "comment", String(existingIssue.number), "--body", commentBody]);

      return {
        action: "refreshed",
        issueNumber: existingIssue.number,
        url: existingIssue.url,
      };
    }

    // Create new tracking issue
    const createRes = await execute([
      "issue", "create",
      "--title", `${RED_MAIN_TITLE_PREFIX}: run #${runId}`,
      "--body", issueBody,
      "--label", RED_MAIN_LABEL,
    ]);
    if (createRes.exitCode !== 0) {
      throw new Error(`Failed to create tracking issue: ${createRes.stderr}`);
    }

    const createdUrl = createRes.stdout.trim();
    const match = createdUrl.match(/\/issues\/(\d+)/);
    const issueNumber = match ? Number(match[1]) : undefined;

    return {
      action: "created",
      issueNumber,
      url: createdUrl,
    };
  }

  // Case 2: CI success -> Auto-close if tracking issue open
  if (existingIssue) {
    const resolveComment = [
      `### ✅ Main CI Baseline Resolved: Run #${runId}`,
      "",
      `- **Run ID:** [${runId}](${url || `#`})`,
      `- **Commit SHA:** \`${sha || "unknown"}\``,
      `- **Timestamp:** ${new Date().toISOString()}`,
      "",
      "All 3-OS matrix legs have completed successfully. Auto-closing this tracking issue.",
    ].join("\n");

    await execute(["issue", "comment", String(existingIssue.number), "--body", resolveComment]);
    await execute(["issue", "close", String(existingIssue.number), "--reason", "completed"]);

    return {
      action: "closed",
      issueNumber: existingIssue.number,
      url: existingIssue.url,
    };
  }

  return { action: "none", reason: "Main is green and no tracking issue is open" };
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) {
  try {
    const result = await runRedMainGuard({
      runId: process.env.WORKFLOW_RUN_ID,
      branch: process.env.WORKFLOW_RUN_BRANCH,
      sha: process.env.WORKFLOW_RUN_SHA,
      conclusion: process.env.WORKFLOW_RUN_CONCLUSION,
      url: process.env.WORKFLOW_RUN_URL,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 0;
  } catch (err) {
    console.error("Red-Main Guard error:", err);
    process.exitCode = 1;
  }
}
