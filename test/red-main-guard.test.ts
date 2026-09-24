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

interface MatrixLeg {
  readonly os: string;
  readonly result: string;
  readonly failingStep: string;
}

interface RedMainGuardOptions {
  readonly runId?: number | string | undefined;
  readonly branch?: string | undefined;
  readonly sha?: string | undefined;
  readonly conclusion?: string | undefined;
  readonly url?: string | undefined;
}

interface RedMainGuardResult {
  readonly action: "created" | "refreshed" | "closed" | "none" | "ignored";
  readonly issueNumber?: number | undefined;
  readonly url?: string | undefined;
  readonly reason?: string | undefined;
}

interface RedMainGuardModule {
  readonly runRedMainGuard: (options?: RedMainGuardOptions, execute?: CommandExecutor) => Promise<RedMainGuardResult>;
  readonly parseMatrixLegs: (jobs?: readonly Record<string, unknown>[]) => readonly MatrixLeg[];
  readonly formatMatrixTable: (legs?: readonly MatrixLeg[]) => string;
  readonly RED_MAIN_LABEL: string;
  readonly RED_MAIN_TITLE_PREFIX: string;
}

const scriptUrl = new URL("../../scripts/red-main-guard.mjs", import.meta.url).href;
const {
  runRedMainGuard,
  parseMatrixLegs,
  formatMatrixTable,
  RED_MAIN_LABEL,
  RED_MAIN_TITLE_PREFIX,
} = (await import(scriptUrl)) as RedMainGuardModule;

test("Scenario 1: main CI fails (first time) -> preflights label and creates tracking issue with run ID and failed legs table", async () => {
  const executedCalls: string[][] = [];

  const mockExecutor: CommandExecutor = async (args) => {
    executedCalls.push([...args]);
    const cmd = args.join(" ");

    if (cmd.includes("issue list")) {
      return { stdout: "[]", stderr: "", exitCode: 0 };
    }
    if (cmd.includes("run view 12345 --json jobs")) {
      return {
        stdout: JSON.stringify({
          jobs: [
            { name: "ubuntu-latest / Node 24", conclusion: "success", steps: [] },
            { name: "macos-latest / Node 24", conclusion: "success", steps: [] },
            {
              name: "windows-latest / Node 24",
              conclusion: "failure",
              steps: [{ name: "Run npm test", conclusion: "failure" }],
            },
          ],
        }),
        stderr: "",
        exitCode: 0,
      };
    }
    if (cmd.includes("label create")) {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (cmd.includes("issue create")) {
      return {
        stdout: "https://github.com/4lph4-dvlp/alpha-AOS/issues/101\n",
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  const result = await runRedMainGuard({
    runId: 12345,
    branch: "main",
    sha: "abcdef123456",
    conclusion: "failure",
    url: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/12345",
  }, mockExecutor);

  assert.equal(result.action, "created");
  assert.equal(result.issueNumber, 101);
  assert.equal(result.url, "https://github.com/4lph4-dvlp/alpha-AOS/issues/101");

  // Verify label preflight
  const labelCall = executedCalls.find((c) => c[0] === "label" && c[1] === "create");
  assert.ok(labelCall, "label create was invoked");
  assert.ok(labelCall.includes(RED_MAIN_LABEL), "label create includes ci-red-main");
  assert.ok(labelCall.includes("--force"), "label create includes --force");

  // Verify issue create call
  const issueCreateCall = executedCalls.find((c) => c[0] === "issue" && c[1] === "create");
  assert.ok(issueCreateCall, "issue create was invoked");
  const titleIndex = issueCreateCall.indexOf("--title");
  assert.ok(titleIndex !== -1 && issueCreateCall[titleIndex + 1]?.includes(`${RED_MAIN_TITLE_PREFIX}: run #12345`));
  const bodyIndex = issueCreateCall.indexOf("--body");
  assert.ok(bodyIndex !== -1);
  const bodyText = issueCreateCall[bodyIndex + 1] ?? "";
  assert.ok(bodyText.includes("windows-latest"), "body includes windows-latest leg");
  assert.ok(bodyText.includes("Run npm test"), "body includes failing step name");
  assert.ok(issueCreateCall.includes("--label") && issueCreateCall.includes(RED_MAIN_LABEL));
});

test("Scenario 2: main CI fails (issue already open) -> refreshes issue body and appends comment without duplicating issue", async () => {
  const executedCalls: string[][] = [];

  const mockExecutor: CommandExecutor = async (args) => {
    executedCalls.push([...args]);
    const cmd = args.join(" ");

    if (cmd.includes("issue list")) {
      return {
        stdout: JSON.stringify([
          {
            number: 101,
            title: `${RED_MAIN_TITLE_PREFIX}: run #12340`,
            body: "Previous failure body",
            url: "https://github.com/4lph4-dvlp/alpha-AOS/issues/101",
          },
        ]),
        stderr: "",
        exitCode: 0,
      };
    }
    if (cmd.includes("run view 12345 --json jobs")) {
      return {
        stdout: JSON.stringify({
          jobs: [
            {
              name: "ubuntu-latest / Node 24",
              conclusion: "failure",
              steps: [{ name: "Run npm check", conclusion: "failure" }],
            },
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

  const result = await runRedMainGuard({
    runId: 12345,
    branch: "main",
    sha: "abcdef123456",
    conclusion: "failure",
    url: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/12345",
  }, mockExecutor);

  assert.equal(result.action, "refreshed");
  assert.equal(result.issueNumber, 101);

  // Assert NO issue create call was made
  const issueCreateCall = executedCalls.find((c) => c[0] === "issue" && c[1] === "create");
  assert.equal(issueCreateCall, undefined, "Must not create duplicate issue");

  // Assert issue edit and issue comment were called
  const issueEditCall = executedCalls.find((c) => c[0] === "issue" && c[1] === "edit");
  assert.ok(issueEditCall, "issue edit was called");
  assert.equal(issueEditCall[2], "101");

  const issueCommentCall = executedCalls.find((c) => c[0] === "issue" && c[1] === "comment");
  assert.ok(issueCommentCall, "issue comment was called");
  assert.equal(issueCommentCall[2], "101");
  const commentBodyIndex = issueCommentCall.indexOf("--body");
  const commentText = issueCommentCall[commentBodyIndex + 1] ?? "";
  assert.ok(commentText.includes("Run #12345"));
  assert.ok(commentText.includes("Run npm check"));
});

test("Scenario 3: main CI passes (issue open) -> adds resolution comment and auto-closes tracking issue with reason completed", async () => {
  const executedCalls: string[][] = [];

  const mockExecutor: CommandExecutor = async (args) => {
    executedCalls.push([...args]);
    const cmd = args.join(" ");

    if (cmd.includes("issue list")) {
      return {
        stdout: JSON.stringify([
          {
            number: 101,
            title: `${RED_MAIN_TITLE_PREFIX}: run #12340`,
            body: "Previous failure body",
            url: "https://github.com/4lph4-dvlp/alpha-AOS/issues/101",
          },
        ]),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  const result = await runRedMainGuard({
    runId: 12346,
    branch: "main",
    sha: "fedcba654321",
    conclusion: "success",
    url: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/12346",
  }, mockExecutor);

  assert.equal(result.action, "closed");
  assert.equal(result.issueNumber, 101);

  // Assert resolution comment added
  const commentCall = executedCalls.find((c) => c[0] === "issue" && c[1] === "comment");
  assert.ok(commentCall, "resolution comment was added");
  assert.equal(commentCall[2], "101");
  const commentText = commentCall[commentCall.indexOf("--body") + 1] ?? "";
  assert.ok(commentText.includes("12346"), "comment references green run ID");
  assert.ok(commentText.includes("fedcba654321"), "comment references green commit SHA");

  // Assert issue close with reason completed
  const closeCall = executedCalls.find((c) => c[0] === "issue" && c[1] === "close");
  assert.ok(closeCall, "issue close was called");
  assert.equal(closeCall[2], "101");
  assert.ok(closeCall.includes("--reason") && closeCall.includes("completed"));
});

test("Scenario 3b: main CI passes (no issue open) -> takes no action", async () => {
  const executedCalls: string[][] = [];

  const mockExecutor: CommandExecutor = async (args) => {
    executedCalls.push([...args]);
    const cmd = args.join(" ");

    if (cmd.includes("issue list")) {
      return { stdout: "[]", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  const result = await runRedMainGuard({
    runId: 12347,
    branch: "main",
    sha: "112233445566",
    conclusion: "success",
  }, mockExecutor);

  assert.equal(result.action, "none");
  const mutatingCall = executedCalls.find((c) => c[0] === "issue" && (c[1] === "create" || c[1] === "edit" || c[1] === "close" || c[1] === "comment"));
  assert.equal(mutatingCall, undefined, "No issue mutation calls should occur when green and no issue open");
});

test("Scenario: non-main branch execution -> exits immediately without executing GitHub API mutations", async () => {
  const executedCalls: string[][] = [];

  const mockExecutor: CommandExecutor = async (args) => {
    executedCalls.push([...args]);
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  const result = await runRedMainGuard({
    runId: 99999,
    branch: "feature/experimental-work",
    sha: "998877665544",
    conclusion: "failure",
  }, mockExecutor);

  assert.equal(result.action, "ignored");
  assert.equal(result.reason, 'Branch "feature/experimental-work" is not main');
  assert.equal(executedCalls.length, 0, "Zero CLI calls must be executed on non-main branches");
});

test("Scenario: parseMatrixLegs correctly handles step failures and prerequisite package failures", () => {
  const jobs = [
    {
      name: "Authoritative Release Package (Linux)",
      conclusion: "failure",
      steps: [{ name: "Run npm run audit-tarball", conclusion: "failure" }],
    },
    {
      name: "ubuntu-latest / Node 24",
      conclusion: "success",
      steps: [{ name: "Run tests", conclusion: "success" }],
    },
    {
      name: "macos-latest / Node 24",
      conclusion: "success",
      steps: [],
    },
    {
      name: "windows-latest / Node 24",
      conclusion: "failure",
      steps: [{ name: "Run npm test", conclusion: "failure" }],
    },
  ];

  const legs = parseMatrixLegs(jobs);
  assert.equal(legs.length, 4, "Includes prerequisite packaging job and 3 matrix legs");

  const pkgLeg = legs.find((l) => l.os.includes("Release Package"));
  assert.ok(pkgLeg);
  assert.equal(pkgLeg.result, "failure");
  assert.equal(pkgLeg.failingStep, "Run npm run audit-tarball");

  const winLeg = legs.find((l) => l.os.includes("windows"));
  assert.ok(winLeg);
  assert.equal(winLeg.result, "failure");
  assert.equal(winLeg.failingStep, "Run npm test");

  const table = formatMatrixTable(legs);
  assert.ok(table.includes("| OS Leg | Result | Failing Step |"));
  assert.ok(table.includes("❌ Fail"));
  assert.ok(table.includes("✅ Pass"));
  assert.ok(table.includes("Run npm run audit-tarball"));
  assert.ok(table.includes("Run npm test"));
});
