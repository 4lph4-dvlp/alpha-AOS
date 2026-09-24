import assert from "node:assert/strict";
import test from "node:test";

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

type CommandExecutor = (
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string },
) => Promise<CommandResult>;

interface BaselineRunInfo {
  readonly runId: number | string;
  readonly headSha: string;
  readonly url: string;
  readonly createdAt: string;
  readonly conclusion: string;
  readonly failedLegs?: readonly string[] | undefined;
}

interface BaselineCheckResult {
  readonly eligible: boolean;
  readonly reason?: string | undefined;
  readonly baselineRun: BaselineRunInfo | null;
}

interface CheckBaselineOptions {
  readonly branch?: string | undefined;
  readonly workflow?: string | undefined;
  readonly candidateBranch?: string | undefined;
  readonly prNumber?: number | undefined;
}

interface PrUpdateResult {
  readonly action: string;
  readonly prNumber?: number | undefined;
  readonly eligible: boolean;
}

interface CheckMainBaselineModule {
  readonly checkMainBaseline: (options?: CheckBaselineOptions, execute?: CommandExecutor) => Promise<BaselineCheckResult>;
  readonly renderPromotionBanner: (status: BaselineCheckResult) => string;
  readonly updateCandidatePrStatus: (
    status: BaselineCheckResult,
    options?: CheckBaselineOptions,
    execute?: CommandExecutor,
  ) => Promise<PrUpdateResult>;
  readonly PROMOTION_STATUS_START: string;
  readonly PROMOTION_STATUS_END: string;
  readonly PROMOTION_BLOCKED_LABEL: string;
}

const scriptUrl = new URL("../../scripts/check-main-baseline.mjs", import.meta.url).href;
const {
  checkMainBaseline,
  renderPromotionBanner,
  updateCandidatePrStatus,
  PROMOTION_STATUS_START,
  PROMOTION_STATUS_END,
  PROMOTION_BLOCKED_LABEL,
} = (await import(scriptUrl)) as CheckMainBaselineModule;

test("Scenario 4: candidate promotion check on red main -> returns blocked and names failing run and legs", async () => {
  const executedCalls: string[][] = [];

  const mockExecutor: CommandExecutor = async (args) => {
    executedCalls.push([...args]);
    const cmd = args.join(" ");

    if (cmd.includes("run list")) {
      return {
        stdout: JSON.stringify([
          {
            databaseId: 20001,
            status: "completed",
            conclusion: "failure",
            headSha: "abc20001sha",
            url: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/20001",
            createdAt: "2026-09-24T10:00:00Z",
          },
        ]),
        stderr: "",
        exitCode: 0,
      };
    }
    if (cmd.includes("run view 20001 --json jobs")) {
      return {
        stdout: JSON.stringify({
          jobs: [
            { name: "ubuntu-latest / Node 24", conclusion: "failure", steps: [] },
            { name: "macos-latest / Node 24", conclusion: "success", steps: [] },
            { name: "windows-latest / Node 24", conclusion: "success", steps: [] },
          ],
        }),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  const result = await checkMainBaseline({}, mockExecutor);

  assert.equal(result.eligible, false);
  assert.ok(result.baselineRun);
  assert.equal(result.baselineRun.runId, 20001);
  assert.equal(result.baselineRun.headSha, "abc20001sha");
  assert.equal(result.baselineRun.conclusion, "failure");
  assert.deepEqual(result.baselineRun.failedLegs, ["ubuntu-latest / Node 24"]);
});

test("Scenario 5: candidate promotion check on green main -> returns eligible and names baseline run", async () => {
  const executedCalls: string[][] = [];

  const mockExecutor: CommandExecutor = async (args) => {
    executedCalls.push([...args]);
    const cmd = args.join(" ");

    if (cmd.includes("run list")) {
      return {
        stdout: JSON.stringify([
          {
            databaseId: 20002,
            status: "completed",
            conclusion: "success",
            headSha: "abc20002sha",
            url: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/20002",
            createdAt: "2026-09-24T11:00:00Z",
          },
        ]),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  const result = await checkMainBaseline({}, mockExecutor);

  assert.equal(result.eligible, true);
  assert.ok(result.baselineRun);
  assert.equal(result.baselineRun.runId, 20002);
  assert.equal(result.baselineRun.conclusion, "success");
  assert.equal(result.baselineRun.headSha, "abc20002sha");
});

test("Scenario 6: candidate promotion check with no completed main runs -> fails closed and returns blocked", async () => {
  const mockExecutor: CommandExecutor = async () => {
    return { stdout: "[]", stderr: "", exitCode: 0 };
  };

  const result = await checkMainBaseline({}, mockExecutor);

  assert.equal(result.eligible, false);
  assert.equal(result.baselineRun, null);
  assert.equal(result.reason, "No completed main CI baseline run found");
});

test("Scenario 6b: candidate promotion check on GitHub CLI API error -> fails closed and returns blocked", async () => {
  const mockExecutor: CommandExecutor = async () => {
    return { stdout: "", stderr: "rate limit exceeded", exitCode: 1 };
  };

  const result = await checkMainBaseline({}, mockExecutor);

  assert.equal(result.eligible, false);
  assert.equal(result.baselineRun, null);
  assert.ok(result.reason?.includes("rate limit exceeded"));
});

test("Scenario: renderPromotionBanner and PR body update idempotently replaces existing status banner", async () => {
  const eligibleStatus: BaselineCheckResult = {
    eligible: true,
    baselineRun: {
      runId: 20002,
      headSha: "abc20002sha",
      url: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/20002",
      createdAt: "2026-09-24T11:00:00Z",
      conclusion: "success",
    },
  };

  const banner = renderPromotionBanner(eligibleStatus);
  assert.ok(banner.includes(PROMOTION_STATUS_START));
  assert.ok(banner.includes(PROMOTION_STATUS_END));
  assert.ok(banner.includes("Promotion Eligible: Main CI Baseline is Green"));
  assert.ok(banner.includes("20002"));

  // 1. Updating body without existing banner: prepends banner
  const initialBody = "This is a candidate dependency bump description.";
  let updatedBodyCaptured = "";

  const mockExecutor1: CommandExecutor = async (args) => {
    const cmd = args.join(" ");
    if (cmd.includes("pr list")) {
      return {
        stdout: JSON.stringify([{ number: 1, body: initialBody, labels: [] }]),
        stderr: "",
        exitCode: 0,
      };
    }
    if (cmd.includes("label create")) {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (cmd.includes("pr edit")) {
      const bodyIdx = args.indexOf("--body");
      if (bodyIdx !== -1) {
        updatedBodyCaptured = args[bodyIdx + 1] ?? "";
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  await updateCandidatePrStatus(eligibleStatus, {}, mockExecutor1);
  assert.ok(updatedBodyCaptured.startsWith(PROMOTION_STATUS_START));
  assert.ok(updatedBodyCaptured.includes(initialBody));

  // 2. Updating body WITH existing banner: cleanly replaces existing banner slice
  const bodyWithOldBanner = [
    PROMOTION_STATUS_START,
    "### 🚫 Promotion Blocked: Main CI is failing",
    "- Old Run: 19999",
    PROMOTION_STATUS_END,
    "",
    "Original preserved notes and instructions for reviewers.",
  ].join("\n");

  let secondUpdatedBody = "";
  const mockExecutor2: CommandExecutor = async (args) => {
    const cmd = args.join(" ");
    if (cmd.includes("pr list")) {
      return {
        stdout: JSON.stringify([{ number: 1, body: bodyWithOldBanner, labels: [] }]),
        stderr: "",
        exitCode: 0,
      };
    }
    if (cmd.includes("label create")) {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (cmd.includes("pr edit")) {
      const bodyIdx = args.indexOf("--body");
      if (bodyIdx !== -1) {
        secondUpdatedBody = args[bodyIdx + 1] ?? "";
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  await updateCandidatePrStatus(eligibleStatus, {}, mockExecutor2);
  assert.ok(!secondUpdatedBody.includes("Old Run: 19999"), "Old banner content must be replaced");
  assert.ok(secondUpdatedBody.includes("Promotion Eligible: Main CI Baseline is Green"), "New banner content present");
  assert.ok(secondUpdatedBody.includes("Original preserved notes and instructions for reviewers."), "Body text preserved");
});

test("Scenario: updateCandidatePrStatus safely toggles promotion-blocked label and does not remove label when absent", async () => {
  const eligibleStatus: BaselineCheckResult = {
    eligible: true,
    baselineRun: {
      runId: 20005,
      headSha: "abc20005sha",
      url: "https://example.com",
      createdAt: "2026-09-24T12:00:00Z",
      conclusion: "success",
    },
  };

  const blockedStatus: BaselineCheckResult = {
    eligible: false,
    reason: "Main CI baseline is red",
    baselineRun: {
      runId: 20006,
      headSha: "abc20006sha",
      url: "https://example.com",
      createdAt: "2026-09-24T12:05:00Z",
      conclusion: "failure",
      failedLegs: ["windows-latest / Node 24"],
    },
  };

  // Case A: Eligible + PR has label -> invokes --remove-label
  const callsA: string[][] = [];
  const mockA: CommandExecutor = async (args) => {
    callsA.push([...args]);
    if (args.includes("list")) {
      return {
        stdout: JSON.stringify([{ number: 1, body: "", labels: [{ name: PROMOTION_BLOCKED_LABEL }] }]),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  await updateCandidatePrStatus(eligibleStatus, {}, mockA);
  const editCallA = callsA.find((c) => c[0] === "pr" && c[1] === "edit");
  assert.ok(editCallA);
  assert.ok(editCallA.includes("--remove-label") && editCallA.includes(PROMOTION_BLOCKED_LABEL));

  // Case B: Eligible + PR does NOT have label -> does NOT invoke --remove-label
  const callsB: string[][] = [];
  const mockB: CommandExecutor = async (args) => {
    callsB.push([...args]);
    if (args.includes("list")) {
      return {
        stdout: JSON.stringify([{ number: 1, body: "", labels: [{ name: "dependencies" }] }]),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  await updateCandidatePrStatus(eligibleStatus, {}, mockB);
  const editCallB = callsB.find((c) => c[0] === "pr" && c[1] === "edit");
  assert.ok(editCallB);
  assert.ok(!editCallB.includes("--remove-label"), "Must not call --remove-label when label absent");

  // Case C: Blocked + PR does NOT have label -> invokes --add-label
  const callsC: string[][] = [];
  const mockC: CommandExecutor = async (args) => {
    callsC.push([...args]);
    if (args.includes("list")) {
      return {
        stdout: JSON.stringify([{ number: 1, body: "", labels: [] }]),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  await updateCandidatePrStatus(blockedStatus, {}, mockC);
  const editCallC = callsC.find((c) => c[0] === "pr" && c[1] === "edit");
  assert.ok(editCallC);
  assert.ok(editCallC.includes("--add-label") && editCallC.includes(PROMOTION_BLOCKED_LABEL));

  // Case D: Blocked + PR already has label -> does NOT invoke duplicate --add-label
  const callsD: string[][] = [];
  const mockD: CommandExecutor = async (args) => {
    callsD.push([...args]);
    if (args.includes("list")) {
      return {
        stdout: JSON.stringify([{ number: 1, body: "", labels: [{ name: PROMOTION_BLOCKED_LABEL }] }]),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  await updateCandidatePrStatus(blockedStatus, {}, mockD);
  const editCallD = callsD.find((c) => c[0] === "pr" && c[1] === "edit");
  assert.ok(editCallD);
  assert.ok(!editCallD.includes("--add-label"), "Must not call duplicate --add-label when already present");
});
