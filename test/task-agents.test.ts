import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { declaredEnvironmentNames } from "../src/core/component-session.js";
import { materializeEnvironment, type ProcessResult, type ProcessSpec } from "../src/core/process.js";
import { createRedactedExcerpt, createRedactionContext } from "../src/core/redaction.js";
import type { ControllerDispatchRequest, ReviewRequest, TaskMeasurement, TaskReviewReport } from "../src/core/task-run.js";
import {
  agentFacingSchema,
  createDynamicTaskPorts,
  nativeTaskPorts,
  parseHarnessVersion,
  probeTaskAgentPair,
  resolveTaskAgentLaunch,
  TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  TASK_BOOTSTRAP_PAIR,
  type HarnessVersionProbe,
} from "../src/adapters/task-agents.js";
import { writeHarnessRoleReceipt } from "../src/adapters/task-receipts.js";
import type { HarnessId } from "../src/types.js";
import {
  buildReviewPrompt,
  CLAUDE_REVIEW_OUTPUT_BYTES,
  CLAUDE_REVIEW_TIMEOUT_MS,
  claudeReviewEnvironment,
  claudeReviewerArgs,
  parseClaudeReviewResult,
  runClaudeReviewer,
} from "../src/adapters/task-claude.js";
import {
  CODEX_TASK_OUTPUT_BYTES,
  CODEX_TASK_PERMISSION_PROFILE,
  CODEX_TASK_TIMEOUT_MS,
  codexControllerArgs,
  codexGitAuthorityOverrides,
  codexTaskEnvironment,
  parseCodexEvents,
  readCodexClaim,
  runCodexController,
  writeCodexRunGitConfig,
} from "../src/adapters/task-codex.js";
import type { TaskAgentPolicy } from "../src/core/task-contract.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXED_NOW = new Date("2026-09-30T00:00:00.000Z");
const TEN_MINUTES_LATER = "2026-09-30T00:10:00.000Z";
const FAKE_CODEX_VERSION_LINE = "codex-cli 9.9.9";
const FORBIDDEN_CONTROLLER_TOKENS = [
  "--dangerously-bypass-approvals-and-sandbox",
  "danger-full-access",
  "--yolo",
  "--add-dir",
] as const;

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-task-agents-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function executorSchema(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(repositoryRoot, "schemas", "task-executor-result.schema.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

function excerpt(text: string) {
  return createRedactedExcerpt(text, createRedactionContext(), CODEX_TASK_OUTPUT_BYTES);
}

function processResult(stdout: string, overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    code: "ok",
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputCapped: false,
    durationMs: 1,
    stdout: excerpt(stdout),
    stderr: excerpt(""),
    ...overrides,
  };
}

function jsonl(...events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function validClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: "completed",
    summary: "Implemented bin/inventory-summary.mjs and its tests through one GSD quick task.",
    gsd: { quickId: "260930-abc", summaryPath: ".planning/quick/260930-abc/SUMMARY.md" },
    authorityRequest: null,
    decisionsLogged: 2,
    ...overrides,
  };
}

/** A fake runner that records every spec and answers version probes and exec launches. */
function recordingRunner(onExec: (spec: ProcessSpec) => Promise<ProcessResult>) {
  const calls: ProcessSpec[] = [];
  const runner = async (spec: ProcessSpec): Promise<ProcessResult> => {
    calls.push(spec);
    if (spec.args.includes("--version")) return processResult(`${FAKE_CODEX_VERSION_LINE}\n`);
    return onExec(spec);
  };
  return { calls, runner };
}

function argumentAfter(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  assert.ok(index >= 0 && index + 1 < args.length, `the argument vector carries ${flag} with a value`);
  return args[index + 1] as string;
}

async function controllerRequest(
  context: TestContext,
  deadlineAt: string | null,
  gitDirectory: string | null = null,
): Promise<ControllerDispatchRequest> {
  const projectRoot = await scratch(context, "project");
  const scratchRoot = await scratch(context, "scratch");
  return {
    runId: "run-test",
    contract: inventorySummaryContract(projectRoot),
    contractDigest: "a".repeat(64),
    projectRoot,
    scratchRoot,
    decisionLogPath: ".alpha-aos/task-runs/run-test/decisions.jsonl",
    prompt: "Implement the approved task contract through $gsd-quick.",
    deadlineAt,
    gitDirectory,
  };
}

async function npmStyleShim(context: TestContext): Promise<{ shim: string; script: string }> {
  const root = await scratch(context, "shim");
  const script = join(root, "node_modules", "@openai", "codex", "bin", "codex.js");
  await mkdir(dirname(script), { recursive: true });
  await writeFile(script, "// codex entry stand-in\n", "utf8");
  const shim = join(root, "codex.cmd");
  await writeFile(
    shim,
    [
      "@ECHO off",
      "SETLOCAL",
      "SET dp0=%~dp0",
      "IF EXIST \"%dp0%\\node.exe\" (SET \"_prog=%dp0%\\node.exe\") ELSE (SET \"_prog=node\")",
      "endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & \"%_prog%\"  \"%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js\" %*",
      "",
    ].join("\r\n"),
    "utf8",
  );
  return { shim, script };
}

// ---------------------------------------------------------------------------
// Task 1: the Codex controller adapter
// ---------------------------------------------------------------------------

test("the codex controller argument vector is fixed and never bypasses the sandbox", () => {
  const args = codexControllerArgs({
    projectRoot: "/work/project",
    outputSchemaPath: "/scratch/codex/executor-result.schema.json",
    lastMessagePath: "/scratch/codex/last-message.json",
    gitDirectory: null,
  });
  assert.deepEqual(args, [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-rules",
    "--sandbox",
    "workspace-write",
    "-C",
    "/work/project",
    "--output-schema",
    "/scratch/codex/executor-result.schema.json",
    "-o",
    "/scratch/codex/last-message.json",
    "-",
  ]);
  for (const forbidden of FORBIDDEN_CONTROLLER_TOKENS) {
    assert.equal(args.includes(forbidden), false, `the vector never carries ${forbidden}`);
  }
});

test("a granted git directory replaces the sandbox flag with the alpha-aos-task profile overrides", async (context) => {
  const gitDirectory = join(await scratch(context, "granted"), "project", ".git");
  const paths = {
    projectRoot: "/work/project",
    outputSchemaPath: "/scratch/codex/executor-result.schema.json",
    lastMessagePath: "/scratch/codex/last-message.json",
  };
  const args = codexControllerArgs({ ...paths, gitDirectory });
  assert.deepEqual(args, [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-rules",
    ...codexGitAuthorityOverrides(gitDirectory),
    "-C",
    "/work/project",
    "--output-schema",
    "/scratch/codex/executor-result.schema.json",
    "-o",
    "/scratch/codex/last-message.json",
    "-",
  ]);
  assert.equal(args.includes("--sandbox"), false, "the profile replaces the legacy sandbox flag");
  for (const forbidden of FORBIDDEN_CONTROLLER_TOKENS) {
    assert.equal(args.includes(forbidden), false, `the granted vector never carries ${forbidden}`);
  }
});

test("the git authority overrides name exactly one git directory with its control files read-only", async (context) => {
  const root = await scratch(context, "overrides");
  const gitDirectory = join(root, "project", ".git");
  const forward = gitDirectory.replaceAll("\\", "/");
  assert.equal(CODEX_TASK_PERMISSION_PROFILE, "alpha-aos-task");
  assert.deepEqual(codexGitAuthorityOverrides(gitDirectory), [
    "-c",
    'default_permissions="alpha-aos-task"',
    "-c",
    `permissions.alpha-aos-task.filesystem={":root"="read", ":tmpdir"="write", ":workspace_roots"={"."="write", ".codex"="read"}, ${JSON.stringify(forward)}="write", ${JSON.stringify(`${forward}/config`)}="read", ${JSON.stringify(`${forward}/hooks`)}="read", ${JSON.stringify(`${forward}/info`)}="read"}`,
  ]);
  assert.ok(!codexGitAuthorityOverrides(gitDirectory).join(" ").includes("\\"), "paths use forward slashes");

  assert.throws(() => codexGitAuthorityOverrides(join("relative", ".git")), /absolute/u);
  for (const bad of [`${root}/a"b/.git`, `${root}/a\nb/.git`, `${root}/a\u0001b/.git`, `${root}/a\tb/.git`]) {
    assert.throws(() => codexGitAuthorityOverrides(bad), /double quote or a control character/u, JSON.stringify(bad));
  }
});

test("the run git config holds only safe.directory and an include of an existing global config", async (context) => {
  const root = await scratch(context, "gitconfig");
  const projectRoot = join(root, "project");
  const globalConfig = join(root, "home", ".gitconfig");
  await mkdir(join(root, "home"), { recursive: true });
  await writeFile(globalConfig, "[user]\n\tname = someone\n", "utf8");

  const withInclude = join(root, "with-include");
  await mkdir(withInclude, { recursive: true });
  const path = await writeCodexRunGitConfig({ workDirectory: withInclude, projectRoot, globalConfigPath: globalConfig });
  assert.equal(path, join(withInclude, "gitconfig"));
  const forwardRoot = projectRoot.replaceAll("\\", "/");
  const forwardGlobal = globalConfig.replaceAll("\\", "/");
  assert.equal(await readFile(path, "utf8"), `[safe]\n\tdirectory = "${forwardRoot}"\n[include]\n\tpath = "${forwardGlobal}"\n`);

  const withoutInclude = join(root, "without-include");
  await mkdir(withoutInclude, { recursive: true });
  const absent = await writeCodexRunGitConfig({ workDirectory: withoutInclude, projectRoot, globalConfigPath: join(root, "home", "missing") });
  assert.equal(await readFile(absent, "utf8"), `[safe]\n\tdirectory = "${forwardRoot}"\n`);
  const directory = await writeCodexRunGitConfig({ workDirectory: withoutInclude, projectRoot, globalConfigPath: join(root, "home") });
  assert.equal(await readFile(directory, "utf8"), `[safe]\n\tdirectory = "${forwardRoot}"\n`, "a directory is not a global config file");

  await assert.rejects(writeCodexRunGitConfig({ workDirectory: withoutInclude, projectRoot: `${projectRoot}"x` }), /double quote or a line break/u);
  await assert.rejects(
    writeCodexRunGitConfig({ workDirectory: withoutInclude, projectRoot, globalConfigPath: `${globalConfig}\nx` }),
    /double quote or a line break/u,
  );
});

test("the codex child environment with a run git config adds exactly one literal, GIT_CONFIG_GLOBAL", () => {
  const source: NodeJS.ProcessEnv = { PATH: "/usr/bin", OPENAI_API_KEY: "openai-value-for-test" };
  const plain = codexTaskEnvironment(source);
  assert.equal(plain.literal, undefined);
  const granted = codexTaskEnvironment(source, { gitConfigGlobal: "/scratch/codex/gitconfig" });
  assert.deepEqual(granted.optional, plain.optional, "the same names are read by name only");
  assert.deepEqual(granted.literal, { GIT_CONFIG_GLOBAL: "/scratch/codex/gitconfig" });
  assert.equal(granted.required, undefined);
  assert.ok(!JSON.stringify(granted.literal).includes("openai-value-for-test"));
});

test("the codex child environment declares names only and passes no unrelated credential", () => {
  const source: NodeJS.ProcessEnv = {
    PATH: "/usr/bin",
    HOME: "/home/user",
    USERPROFILE: "C:\\Users\\user",
    CODEX_HOME: "/home/user/.codex",
    OPENAI_API_KEY: "openai-value-for-test",
    DATABASE_URL: "postgres://user:pass@host/db",
    SERVICE_TOKEN: "service-token-value",
  };
  const policy = codexTaskEnvironment(source);
  assert.equal(policy.literal, undefined, "the policy carries no literal values");
  assert.equal(policy.required, undefined, "no name is required, so a missing credential is not a crash");
  const names = declaredEnvironmentNames(policy);
  for (const name of ["CODEX_HOME", "OPENAI_API_KEY", "PATH", "USERPROFILE", "HOME"]) {
    assert.ok(names.includes(name), `the codex child may receive ${name}`);
  }
  for (const name of TASK_AGENT_BASE_ENVIRONMENT_NAMES) {
    assert.ok(names.includes(name), `the base name ${name} is declared`);
  }
  const materialized = materializeEnvironment(policy);
  assert.equal(materialized.DATABASE_URL, undefined);
  assert.equal(materialized.SERVICE_TOKEN, undefined);
  assert.equal(materialized.CODEX_HOME, "/home/user/.codex");
  assert.ok(!JSON.stringify(policy.optional).includes("openai-value-for-test"), "no value is written into the policy");
});

test("a completed codex event stream yields its thread id and usage", () => {
  const parsed = parseCodexEvents(
    excerpt(
      jsonl(
        { type: "thread.started", thread_id: "thread-123" },
        { type: "turn.started" },
        { type: "item.completed", item: { id: "item_0", type: "agent_message", text: "done" } },
        { type: "turn.completed", usage: { input_tokens: 120, cached_input_tokens: 20, output_tokens: 30 } },
      ),
    ),
    false,
  );
  assert.equal(parsed.sessionId, "thread-123");
  assert.equal(parsed.terminal, "completed");
  assert.deepEqual(parsed.usage, { input_tokens: 120, cached_input_tokens: 20, output_tokens: 30 });
  assert.equal(parsed.unparsedLines, 0);
});

test("a codex event stream ending in turn.failed is failed with a bounded message", () => {
  const parsed = parseCodexEvents(
    excerpt(
      jsonl(
        { type: "thread.started", thread_id: "thread-456" },
        { type: "turn.started" },
        { type: "turn.failed", error: { message: `stream disconnected ${"x".repeat(1000)}` } },
      ),
    ),
    false,
  );
  assert.equal(parsed.terminal, "failed");
  assert.equal(parsed.sessionId, "thread-456");
  assert.ok(parsed.message !== null && parsed.message.startsWith("stream disconnected"));
  assert.ok(parsed.message.length <= 300, "the failure message is bounded");
});

test("parseCodexEvents extracts string errors, last_error and details", () => {
  const parsedStringError = parseCodexEvents(
    excerpt(
      jsonl(
        { type: "thread.started", thread_id: "thread-err1" },
        { type: "turn.started" },
        { type: "turn.failed", error: "top-level string error" },
      ),
    ),
    false,
  );
  assert.equal(parsedStringError.terminal, "failed");
  assert.equal(parsedStringError.message, "top-level string error");

  const parsedLastError = parseCodexEvents(
    excerpt(
      jsonl(
        { type: "thread.started", thread_id: "thread-err2" },
        { type: "turn.started" },
        { type: "turn.failed", last_error: "last error description" },
      ),
    ),
    false,
  );
  assert.equal(parsedLastError.terminal, "failed");
  assert.equal(parsedLastError.message, "last error description");

  const parsedDetails = parseCodexEvents(
    excerpt(
      jsonl(
        { type: "thread.started", thread_id: "thread-err3" },
        { type: "turn.started" },
        { type: "error", details: "error event details" },
      ),
    ),
    false,
  );
  assert.equal(parsedDetails.terminal, "failed");
  assert.equal(parsedDetails.message, "error event details");
});

test("a capped codex event stream is not-retained rather than a guessed completion", () => {
  const stream = jsonl({ type: "thread.started", thread_id: "thread-789" }, { type: "turn.completed", usage: {} });
  assert.equal(parseCodexEvents(excerpt(stream), true).terminal, "not-retained");
  const cappedExcerpt = { ...excerpt(stream), capped: true };
  assert.equal(parseCodexEvents(cappedExcerpt, false).terminal, "not-retained");
});

test("a codex event stream with no terminal event is missing and a non-JSON line is counted, not thrown", () => {
  const parsed = parseCodexEvents(
    excerpt(`${JSON.stringify({ type: "thread.started", thread_id: "thread-000" })}\nnot json at all\n{"type":"turn.started"}\n`),
    false,
  );
  assert.equal(parsed.terminal, "missing");
  assert.equal(parsed.unparsedLines, 1);
  assert.equal(parsed.sessionId, "thread-000");
});

test("a valid codex final message maps to a bounded executor claim", async (context) => {
  const root = await scratch(context, "claim");
  const path = join(root, "last-message.json");
  await writeFile(path, JSON.stringify(validClaim()), "utf8");
  const read = await readCodexClaim(path, await executorSchema());
  assert.equal(read.issue, null);
  assert.deepEqual(read.claim, {
    status: "completed",
    summary: "Implemented bin/inventory-summary.mjs and its tests through one GSD quick task.",
    authorityRequest: null,
    gsdQuickId: "260930-abc",
  });

  await writeFile(
    path,
    JSON.stringify(validClaim({ status: "needs-authority", authorityRequest: { effect: "dependency-change", reason: "needs a CSV parser" } })),
    "utf8",
  );
  const authority = await readCodexClaim(path, await executorSchema());
  assert.deepEqual(authority.claim?.authorityRequest, { effect: "dependency-change", reason: "needs a CSV parser" });
});

test("an invalid, oversized, missing or non-JSON codex final message yields no claim with an issue", async (context) => {
  const root = await scratch(context, "claim-invalid");
  const schema = await executorSchema();
  const path = join(root, "last-message.json");

  await writeFile(path, JSON.stringify(validClaim({ status: "succeeded" })), "utf8");
  const badStatus = await readCodexClaim(path, schema);
  assert.equal(badStatus.claim, null);
  assert.ok(badStatus.issue !== null);

  await writeFile(path, JSON.stringify(validClaim({ summary: "s".repeat(2001) })), "utf8");
  const longSummary = await readCodexClaim(path, schema);
  assert.equal(longSummary.claim, null);
  assert.match(longSummary.issue ?? "", /summary/u);

  const missing = await readCodexClaim(join(root, "absent.json"), schema);
  assert.equal(missing.claim, null);
  assert.match(missing.issue ?? "", /no final message/u);

  await writeFile(path, "The task is done.", "utf8");
  const prose = await readCodexClaim(path, schema);
  assert.equal(prose.claim, null);
  assert.ok(prose.issue !== null);
});

test("runCodexController launches codex through the runner with stdin, cwd and a deadline-bounded timeout", async (context) => {
  const request = await controllerRequest(context, TEN_MINUTES_LATER);
  const { calls, runner } = recordingRunner(async (spec) => {
    await writeFile(argumentAfter(spec.args, "-o"), JSON.stringify(validClaim()), "utf8");
    return processResult(
      jsonl(
        { type: "thread.started", thread_id: "thread-run" },
        { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
      ),
    );
  });

  const result = await runCodexController(request, {
    runner,
    resolve: () => join(request.scratchRoot, "codex.exe"),
    now: () => FIXED_NOW,
  });

  assert.equal(result.harness, "codex");
  assert.equal(result.processCode, "ok");
  assert.equal(result.terminal, "completed");
  assert.equal(result.sessionId, "thread-run");
  assert.equal(result.claim?.status, "completed");
  assert.equal(result.version, "9.9.9");
  assert.equal(result.detail, null);

  const launch = calls.find((spec) => spec.args.includes("exec"));
  assert.ok(launch !== undefined, "the exec launch went through the runner");
  assert.equal(launch.stdin, request.prompt);
  assert.equal(launch.cwd, request.projectRoot);
  assert.equal(launch.maxOutputBytes, CODEX_TASK_OUTPUT_BYTES);
  assert.equal(launch.excerptBytes, CODEX_TASK_OUTPUT_BYTES);
  assert.ok(launch.timeoutMs !== undefined && launch.timeoutMs > 0);
  assert.ok(launch.timeoutMs <= Math.min(CODEX_TASK_TIMEOUT_MS, 10 * 60 * 1000), "the timeout never outlives the contract deadline");
  assert.equal(argumentAfter(launch.args, "-C"), request.projectRoot);
  assert.ok(!launch.args.includes(request.prompt), "the prompt never travels in the argument vector");

  const schemaFile = JSON.parse(await readFile(argumentAfter(launch.args, "--output-schema"), "utf8")) as Record<string, unknown>;
  assert.equal(schemaFile.$id, undefined, "the agent receives only structural keywords");
  assert.equal(schemaFile.additionalProperties, false);

  // Without a granted git directory the legacy sandbox stays and no literal is set.
  assert.equal(argumentAfter(launch.args, "--sandbox"), "workspace-write");
  assert.ok(launch.args.includes("--ignore-rules"), "user and project execpolicy rules are never loaded");
  assert.equal(launch.environment?.literal, undefined);
});

test("runCodexController launches a granted git directory under the profile with a run-scoped GIT_CONFIG_GLOBAL", async (context) => {
  const projectRoot = await scratch(context, "granted-project");
  const gitDirectory = join(projectRoot, ".git");
  const request = { ...(await controllerRequest(context, TEN_MINUTES_LATER, gitDirectory)), projectRoot };
  const expectedConfig = join(request.scratchRoot, "codex", "gitconfig");
  let configDuringLaunch = "";
  const { calls, runner } = recordingRunner(async (spec) => {
    const info = await lstat(expectedConfig);
    assert.ok(info.isFile(), "the run git config exists during the launch");
    configDuringLaunch = await readFile(expectedConfig, "utf8");
    await writeFile(argumentAfter(spec.args, "-o"), JSON.stringify(validClaim()), "utf8");
    return processResult(jsonl({ type: "thread.started", thread_id: "thread-granted" }, { type: "turn.completed", usage: {} }));
  });

  const result = await runCodexController(request, {
    runner,
    resolve: () => join(request.scratchRoot, "codex.exe"),
    now: () => FIXED_NOW,
  });
  assert.equal(result.processCode, "ok");
  const launch = calls.find((spec) => spec.args.includes("exec"));
  assert.ok(launch !== undefined);
  assert.equal(launch.args.includes("--sandbox"), false);
  const overrides = codexGitAuthorityOverrides(gitDirectory);
  const at = launch.args.indexOf(overrides[1] as string);
  assert.ok(at > 0, "the profile overrides are in the vector");
  assert.deepEqual(launch.args.slice(at - 1, at + 3), overrides);
  assert.ok(launch.args.includes("--ignore-rules"));
  for (const forbidden of FORBIDDEN_CONTROLLER_TOKENS) assert.equal(launch.args.includes(forbidden), false);
  assert.deepEqual(launch.environment?.literal, { GIT_CONFIG_GLOBAL: expectedConfig });
  assert.match(configDuringLaunch, /^\[safe\]\n\tdirectory = "/u);

  // The version probe never receives the literal: it runs outside any grant.
  const probe = calls.find((spec) => spec.args.includes("--version"));
  assert.equal(probe?.environment?.literal, undefined);
});

test("a deadline already in the past returns processCode deadline without launching", async (context) => {
  const request = await controllerRequest(context, "2026-09-29T23:59:00.000Z");
  const { calls, runner } = recordingRunner(async () => processResult(""));
  const result = await runCodexController(request, {
    runner,
    resolve: () => join(request.scratchRoot, "codex.exe"),
    now: () => FIXED_NOW,
  });
  assert.equal(result.processCode, "deadline");
  assert.equal(result.claim, null);
  assert.equal(calls.length, 0, "the runner is never called");
});

test("runCodexController populates detail with stderr excerpt on non-zero exit without turn events", async (context) => {
  const request = await controllerRequest(context, null);
  const { runner } = recordingRunner(async () =>
    processResult("", {
      code: "non-zero-exit",
      exitCode: 1,
      stderr: excerpt("SyntaxError: Unexpected token in JSON or Node crash"),
    }),
  );
  const result = await runCodexController(request, {
    runner,
    resolve: () => join(request.scratchRoot, "codex.exe"),
    now: () => FIXED_NOW,
  });
  assert.equal(result.processCode, "non-zero-exit");
  assert.equal(result.exitCode, 1);
  assert.ok(result.detail !== null);
  assert.match(result.detail, /codex exec ended with non-zero-exit \(exit 1\): SyntaxError: Unexpected token/u);
});

test("an npm-style codex.cmd shim resolves to the running node binary plus its own script", async (context) => {
  const { shim, script } = await npmStyleShim(context);
  const launch = resolveTaskAgentLaunch("codex", { resolve: () => shim });
  assert.equal(launch.status, "ok");
  if (launch.status !== "ok") return;
  assert.equal(launch.executable, process.execPath);
  assert.deepEqual(launch.argsPrefix, [script]);
  assert.equal(launch.resolved, shim);

  const absent = resolveTaskAgentLaunch("codex", { resolve: () => null });
  assert.equal(absent.status, "unsupported");
  if (absent.status === "unsupported") assert.match(absent.reason, /codex/u);
});

test("an unrecognized .cmd shim is unsupported and the controller is never launched", async (context) => {
  const root = await scratch(context, "odd-shim");
  const shim = join(root, "codex.cmd");
  await writeFile(shim, "@ECHO off\r\npowershell -File codex.ps1 %*\r\n", "utf8");
  const launch = resolveTaskAgentLaunch("codex", { resolve: () => shim });
  assert.equal(launch.status, "unsupported");

  const request = await controllerRequest(context, null);
  const { calls, runner } = recordingRunner(async () => processResult(""));
  const result = await runCodexController(request, { runner, resolve: () => shim, now: () => FIXED_NOW });
  assert.equal(result.processCode, "unsupported-executable");
  assert.equal(result.claim, null);
  assert.equal(calls.length, 0, "nothing is launched for an unsupported executable");
});

test("the agent-facing schema drops only the top-level metadata keywords", () => {
  const facing = agentFacingSchema({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://alpha-aos.local/schemas/example.schema.json",
    title: "Example",
    description: "Example schema",
    type: "object",
    properties: { note: { type: "string", description: "kept below the top level" } },
  });
  assert.deepEqual(facing, {
    type: "object",
    properties: { note: { type: "string", description: "kept below the top level" } },
  });
});

test("parseHarnessVersion reads the first semantic version on the first line", () => {
  assert.equal(parseHarnessVersion("codex-cli 9.9.9\n"), "9.9.9");
  assert.equal(parseHarnessVersion("2.1.999 (Claude Code)\nsecond line 3.3.3"), "2.1.999");
  assert.equal(parseHarnessVersion("tool 1.2.3-beta.4 build"), "1.2.3-beta.4");
  assert.equal(parseHarnessVersion("no version here\n1.2.3"), null);
  assert.equal(parseHarnessVersion(""), null);
});

test("the executor-result schema is closed and lists every property as required", async () => {
  const schema = await executorSchema();
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    if (record.type === "object") {
      assert.equal(record.additionalProperties, false);
      const properties = Object.keys((record.properties ?? {}) as Record<string, unknown>).sort();
      assert.deepEqual([...((record.required ?? []) as string[])].sort(), properties);
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(schema);
  const text = JSON.stringify(schema);
  assert.ok(text.includes("\"needs-authority\""));
});

// ---------------------------------------------------------------------------
// Task 2: the Claude reviewer adapter and the bootstrap pair registry
// ---------------------------------------------------------------------------

const FAKE_CLAUDE_VERSION_LINE = "9.9.8 (Claude Code)";
const REQUEST_ID = "5b3f0c0e-1d2a-4c55-9a53-7f1e2b3c4d5e";

function measurements(): TaskMeasurement[] {
  return [
    {
      criterionId: "invalid-quantity",
      outcome: "pass",
      exitCode: 2,
      stdoutSha256: "b".repeat(64),
      detail: "exit 2, stdout empty and stderr JSON as expected",
      cause: "none",
      measuredBy: "contract",
      substituteDecisionId: null,
    },
    {
      criterionId: "valid-summary",
      outcome: "fail",
      exitCode: 0,
      stdoutSha256: "c".repeat(64),
      detail: "stdout JSON differs at /totalQuantity: expected 10, got 11",
      cause: "none",
      measuredBy: "contract",
      substituteDecisionId: null,
    },
  ];
}

async function reviewRequest(context: TestContext, sessionId: string = randomUUID()): Promise<ReviewRequest> {
  const reviewRoot = await scratch(context, "review");
  return {
    runId: "run-review",
    requestId: REQUEST_ID,
    sessionId,
    contract: inventorySummaryContract(await scratch(context, "review-project")),
    contractDigest: "d".repeat(64),
    artifactDigest: "e".repeat(64),
    targetRevisionSha: "0".repeat(40),
    reviewRoot,
    measurements: measurements(),
    deadlineAt: null,
  };
}

function reportFor(request: ReviewRequest): TaskReviewReport {
  return {
    schemaVersion: 2,
    requestId: request.requestId,
    contractId: request.contract.id,
    contractDigest: request.contractDigest,
    artifactDigest: request.artifactDigest,
    targetRevisionSha: request.targetRevisionSha,
    criteria: request.contract.criterion.map((criterion) => ({
      criterionId: criterion.id,
      verdict: "pass",
      severity: "blocking",
      evidence: `bin/inventory-summary.mjs satisfies ${criterion.id}`,
      locator: {
        kind: "check-receipt",
        identifier: criterion.measurement.entry,
        inspectedRange: null,
        digest: null,
      },
      abstainReason: null,
      finding: null,
    })),
    suggestions: [],
  };
}

function claudeResult(fields: Record<string, unknown>): string {
  return `${JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 3,
    result: "",
    ...fields,
  })}\n`;
}

async function reviewSchema(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(repositoryRoot, "schemas", "task-review.schema.json"), "utf8")) as Record<string, unknown>;
}

function claudeRunner(build: (spec: ProcessSpec) => ProcessResult) {
  const calls: ProcessSpec[] = [];
  const runner = async (spec: ProcessSpec): Promise<ProcessResult> => {
    calls.push(spec);
    if (spec.args.includes("--version")) return processResult(`${FAKE_CLAUDE_VERSION_LINE}\n`);
    return build(spec);
  };
  return { calls, runner };
}

const okProbe = (version: string, executable: string): (() => Promise<HarnessVersionProbe>) => async () => ({
  status: "ok",
  executable,
  version,
  raw: version,
});

test("the claude reviewer argument vector is fixed, fresh and read-only", () => {
  assert.deepEqual(claudeReviewerArgs({ sessionId: "11111111-2222-4333-8444-555555555555", reviewSchemaJson: "{\"type\":\"object\"}" }), [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    "{\"type\":\"object\"}",
    "--session-id",
    "11111111-2222-4333-8444-555555555555",
    "--no-session-persistence",
    "--restricted",
    "--tools",
    "Read,Grep,Glob",
    "--strict-mcp-config",
    "--permission-mode",
    "plan",
    "--permission-prompts",
    "none",
  ]);
});

test("the claude reviewer environment declares names only, including its config directory", () => {
  const policy = claudeReviewEnvironment({ PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/home/user/.claude", SERVICE_TOKEN: "service-token-value" });
  const names = declaredEnvironmentNames(policy);
  for (const name of ["CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY", "PATH", "HOME", "USERPROFILE"]) {
    assert.ok(names.includes(name), `the claude child may receive ${name}`);
  }
  assert.equal(names.includes("OPENAI_API_KEY"), false, "the reviewer never receives the executor's credential name");
  assert.equal(policy.literal, undefined);
  const materialized = materializeEnvironment(policy);
  assert.equal(materialized.SERVICE_TOKEN, undefined);
  assert.equal(materialized.CLAUDE_CONFIG_DIR, "/home/user/.claude", "the config directory is passed through, not replaced");
});

test("two reviews run in two fresh sessions, each named by its request, on the review snapshot", async (context) => {
  const first = await reviewRequest(context);
  const second = await reviewRequest(context);
  assert.notEqual(first.sessionId, second.sessionId);

  for (const request of [first, second]) {
    const { calls, runner } = claudeRunner((spec) =>
      processResult(claudeResult({ session_id: argumentAfter(spec.args, "--session-id"), structured_output: reportFor(request) })),
    );
    const result = await runClaudeReviewer(request, {
      runner,
      resolve: () => join(request.reviewRoot, "claude.exe"),
      now: () => FIXED_NOW,
    });
    const launch = calls.find((spec) => spec.args.includes("-p"));
    assert.ok(launch !== undefined, "the review went through the runner");
    assert.equal(argumentAfter(launch.args, "--session-id"), request.sessionId);
    assert.equal(launch.cwd, request.reviewRoot);
    assert.ok(launch.stdin !== undefined && launch.stdin.includes(request.requestId), "the prompt arrives on stdin");
    assert.ok(!launch.args.some((argument) => argument.includes(request.requestId)), "the prompt never travels in argv");
    assert.equal(launch.maxOutputBytes, CLAUDE_REVIEW_OUTPUT_BYTES);
    assert.equal(launch.excerptBytes, CLAUDE_REVIEW_OUTPUT_BYTES);
    assert.equal(launch.timeoutMs, CLAUDE_REVIEW_TIMEOUT_MS);
    const schemaArgument = JSON.parse(argumentAfter(launch.args, "--json-schema")) as Record<string, unknown>;
    assert.equal(schemaArgument.$id, undefined);

    assert.equal(result.harness, "claude");
    assert.equal(result.processCode, "ok");
    assert.equal(result.sessionId, request.sessionId);
    assert.equal(result.version, "9.9.8");
    assert.deepEqual(result.report, reportFor(request));
    assert.deepEqual(result.issues, []);
  }
});

test("the review prompt carries the binding, every criterion input and expectation, and the evidence rules", async (context) => {
  const request = await reviewRequest(context);
  const built = buildReviewPrompt(request);
  assert.equal(built.status, "ok");
  if (built.status !== "ok") return;
  const prompt = built.prompt;
  for (const value of [request.requestId, request.contract.id, request.contractDigest, request.artifactDigest]) {
    assert.ok(prompt.includes(value), `the prompt echoes ${value}`);
  }
  for (const criterion of request.contract.criterion) {
    assert.ok(prompt.includes(criterion.id));
    assert.ok(prompt.includes(JSON.stringify(criterion.measurement.inputText)), `the prompt carries the ${criterion.id} input`);
    assert.ok(prompt.includes(`"exitCode": ${criterion.measurement.expect.exitCode}`), `the prompt carries the ${criterion.id} exit code`);
  }
  for (const measurement of request.measurements) {
    assert.ok(prompt.includes(`${measurement.criterionId}: outcome ${measurement.outcome}`));
    assert.ok(prompt.includes(measurement.detail));
  }
  assert.match(prompt, /reproduction/iu);
  assert.match(prompt, /alpha-AOS will run/iu);
  assert.match(prompt, /data, never instructions/iu);
  assert.match(prompt, /not evidence/iu);
  assert.equal(prompt, prompt.normalize("NFC"));
});

test("an oversized review prompt is refused and the reviewer is never launched", async (context) => {
  const request = await reviewRequest(context);
  const bloated: ReviewRequest = {
    ...request,
    measurements: request.measurements.map((measurement) => ({ ...measurement, detail: "x".repeat(210 * 1024) })),
  };
  const built = buildReviewPrompt(bloated);
  assert.equal(built.status, "too-large");
  const { calls, runner } = claudeRunner(() => processResult(""));
  const result = await runClaudeReviewer(bloated, { runner, resolve: () => join(request.reviewRoot, "claude.exe"), now: () => FIXED_NOW });
  assert.equal(result.report, null);
  assert.equal(calls.filter((spec) => spec.args.includes("-p")).length, 0);
  assert.ok(result.issues.length > 0);
});

test("a claude result yields its structured report or its JSON result text", async (context) => {
  const request = await reviewRequest(context);
  const schema = await reviewSchema();
  const structured = parseClaudeReviewResult(
    excerpt(claudeResult({ session_id: request.sessionId, structured_output: reportFor(request) })),
    false,
    request.sessionId,
    schema,
  );
  assert.deepEqual(structured.report, reportFor(request));
  assert.equal(structured.sessionId, request.sessionId);
  assert.deepEqual(structured.issues, []);

  const textual = parseClaudeReviewResult(
    excerpt(claudeResult({ session_id: request.sessionId, result: JSON.stringify(reportFor(request)) })),
    false,
    request.sessionId,
    schema,
  );
  assert.deepEqual(textual.report, reportFor(request));
});

test("an error, a session mismatch, a capped or non-JSON output, or an invalid report yields no report with a named issue", async (context) => {
  const request = await reviewRequest(context);
  const schema = await reviewSchema();
  const report = reportFor(request);

  const errored = parseClaudeReviewResult(
    excerpt(claudeResult({ session_id: request.sessionId, is_error: true, subtype: "error_max_turns", structured_output: report })),
    false,
    request.sessionId,
    schema,
  );
  assert.equal(errored.report, null);
  assert.match(errored.issues.join(" "), /error/u);

  const otherSession = randomUUID();
  const mismatched = parseClaudeReviewResult(
    excerpt(claudeResult({ session_id: otherSession, structured_output: report })),
    false,
    request.sessionId,
    schema,
  );
  assert.equal(mismatched.report, null);
  assert.equal(mismatched.sessionId, otherSession, "the observed session id is reported, not the requested one");
  assert.match(mismatched.issues.join(" "), /session mismatch/u);

  const capped = parseClaudeReviewResult(
    excerpt(claudeResult({ session_id: request.sessionId, structured_output: report })),
    true,
    request.sessionId,
    schema,
  );
  assert.equal(capped.report, null);
  assert.match(capped.issues.join(" "), /capped/u);

  const prose = parseClaudeReviewResult(excerpt("Looks good to me.\n"), false, request.sessionId, schema);
  assert.equal(prose.report, null);
  assert.match(prose.issues.join(" "), /not JSON/u);

  const invalid = parseClaudeReviewResult(
    excerpt(
      claudeResult({
        session_id: request.sessionId,
        structured_output: { ...report, criteria: [{ criterionId: "valid-summary", verdict: "maybe" }] },
      }),
    ),
    false,
    request.sessionId,
    schema,
  );
  assert.equal(invalid.report, null);
  assert.match(invalid.issues.join(" "), /invalid/u);
});

test("a review request whose session id is not a UUID is refused without launching", async (context) => {
  const request = await reviewRequest(context, "--dangerously-skip-permissions");
  const { calls, runner } = claudeRunner(() => processResult(""));
  const result = await runClaudeReviewer(request, { runner, resolve: () => join(request.reviewRoot, "claude.exe"), now: () => FIXED_NOW });
  assert.equal(result.report, null);
  assert.equal(calls.length, 0);
  assert.match(result.issues.join(" "), /UUID/u);
});

test("the bootstrap pair codex/codex/claude is supported with both exact versions", async () => {
  const assessment = await probeTaskAgentPair(
    { controller: "codex", executor: "codex", reviewer: "claude", reviewerSession: "fresh-read-only" },
    { probeCodex: okProbe("9.9.9", "~/codex.js"), probeClaude: okProbe("9.9.8", "~/claude.exe") },
  );
  assert.deepEqual(TASK_BOOTSTRAP_PAIR, { controller: "codex", executor: "codex", reviewer: "claude" });
  assert.equal(assessment.supported, true);
  assert.deepEqual(assessment.missingProof, []);
  assert.deepEqual(assessment.controller, { harness: "codex", version: "9.9.9", executable: "~/codex.js" });
  assert.deepEqual(assessment.reviewer, { harness: "claude", version: "9.9.8", executable: "~/claude.exe" });
});

test("arbitrary role assignments are supported with verified receipts, and missing receipts fail closed (ROL-01)", async (context) => {
  const receiptsRoot = await scratch(context, "role-pair-tests");
  const makeReceipt = (harness: HarnessId, role: "controller" | "executor" | "reviewer") => ({
    schemaVersion: 1 as const,
    harness,
    role,
    version: "1.0.0",
    binarySha256: "0".repeat(64),
    executable: `/bin/${harness}`,
    probedAt: new Date().toISOString(),
    capabilities: { invoked: true, cancelled: true, outputParsed: true },
    sampleDigest: "digest",
  });

  // When receipts exist for hermes, pi, and antigravity:
  await writeHarnessRoleReceipt(makeReceipt("hermes", "controller"), receiptsRoot);
  await writeHarnessRoleReceipt(makeReceipt("pi", "executor"), receiptsRoot);
  await writeHarnessRoleReceipt(makeReceipt("antigravity", "reviewer"), receiptsRoot);

  const policy: TaskAgentPolicy = {
    controller: "hermes",
    executor: "pi",
    reviewer: "antigravity",
    reviewerSession: "fresh-read-only",
  };

  const assessment = await probeTaskAgentPair(policy, { receiptsRoot, probeVersion: false });
  assert.equal(assessment.supported, true);
  assert.deepEqual(assessment.missingProof, []);
  assert.equal(assessment.controller.harness, "hermes");
  assert.equal(assessment.reviewer.harness, "antigravity");

  // When a receipt is missing, fails closed with explicit missing proof (D-01)
  const missingPolicy: TaskAgentPolicy = {
    controller: "codex",
    executor: "codex",
    reviewer: "claude",
    reviewerSession: "fresh-read-only",
  };
  const missingAssessment = await probeTaskAgentPair(missingPolicy, { receiptsRoot, probeVersion: false });
  assert.equal(missingAssessment.supported, false);
  assert.ok(missingAssessment.missingProof.some((p) => p.includes("controller codex")));
  assert.ok(missingAssessment.missingProof.some((p) => p.includes("executor codex")));
  assert.ok(missingAssessment.missingProof.some((p) => p.includes("reviewer claude")));

  // Missing codex when using legacy mock probe
  const noCodex = await probeTaskAgentPair(
    { controller: "codex", executor: "codex", reviewer: "claude", reviewerSession: "fresh-read-only" },
    {
      probeCodex: async () => ({ status: "unsupported", reason: "codex was not found on PATH" }),
      probeClaude: okProbe("9.9.8", "~/claude.exe"),
    },
  );
  assert.equal(noCodex.supported, false);
  assert.equal(noCodex.controller.version, null);
  assert.ok(noCodex.missingProof.some((proof) => proof.includes("codex was not found")));
});

test("createDynamicTaskPorts binds controller and reviewer ports matching requested policy (ROL-01)", async () => {
  const policy: TaskAgentPolicy = {
    controller: "codex",
    executor: "codex",
    reviewer: "claude",
    reviewerSession: "fresh-read-only",
  };
  const ports = createDynamicTaskPorts(policy);
  assert.ok(typeof ports.controller.dispatch === "function");
  assert.ok(typeof ports.reviewer.review === "function");
  assert.ok(typeof ports.assess === "function");

  const nonCodexPolicy: TaskAgentPolicy = {
    controller: "hermes",
    executor: "pi",
    reviewer: "antigravity",
    reviewerSession: "fresh-read-only",
  };
  const dynamicPorts = createDynamicTaskPorts(nonCodexPolicy);
  assert.ok(typeof dynamicPorts.controller.dispatch === "function");
  assert.ok(typeof dynamicPorts.reviewer.review === "function");
});

test("nativeTaskPorts delegates assess, dispatch and review to the native adapters", async (context) => {
  const tools = await scratch(context, "tools");
  const codexPath = join(tools, "codex.exe");
  const claudePath = join(tools, "claude.exe");
  const controllerRequestValue = await controllerRequest(context, null);
  const review = await reviewRequest(context);
  const calls: ProcessSpec[] = [];
  const runner = async (spec: ProcessSpec): Promise<ProcessResult> => {
    calls.push(spec);
    const isCodex = spec.executable === codexPath;
    if (spec.args.includes("--version")) return processResult(`${isCodex ? FAKE_CODEX_VERSION_LINE : FAKE_CLAUDE_VERSION_LINE}\n`);
    if (isCodex) {
      await writeFile(argumentAfter(spec.args, "-o"), JSON.stringify(validClaim()), "utf8");
      return processResult(jsonl({ type: "thread.started", thread_id: "thread-ports" }, { type: "turn.completed", usage: {} }));
    }
    return processResult(claudeResult({ session_id: argumentAfter(spec.args, "--session-id"), structured_output: reportFor(review) }));
  };
  const ports = nativeTaskPorts({
    runner,
    resolve: (command) => (command === "codex" ? codexPath : command === "claude" ? claudePath : null),
    now: () => FIXED_NOW,
  });

  const assessment = await ports.assess({ controller: "codex", executor: "codex", reviewer: "claude", reviewerSession: "fresh-read-only" });
  assert.equal(assessment.supported, true);
  assert.equal(assessment.controller.version, "9.9.9");
  assert.equal(assessment.reviewer.version, "9.9.8");

  const dispatched = await ports.controller.dispatch(controllerRequestValue);
  assert.equal(dispatched.harness, "codex");
  assert.equal(dispatched.claim?.status, "completed");

  const reviewed = await ports.reviewer.review(review);
  assert.equal(reviewed.harness, "claude");
  assert.deepEqual(reviewed.report, reportFor(review));

  assert.ok(calls.some((spec) => spec.executable === codexPath && spec.args.includes("exec")));
  assert.ok(calls.some((spec) => spec.executable === claudePath && spec.args.includes("--restricted")));
});
