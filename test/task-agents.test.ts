import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { declaredEnvironmentNames } from "../src/core/component-session.js";
import { materializeEnvironment, type ProcessResult, type ProcessSpec } from "../src/core/process.js";
import { createRedactedExcerpt, createRedactionContext } from "../src/core/redaction.js";
import type { ControllerDispatchRequest } from "../src/core/task-run.js";
import {
  agentFacingSchema,
  parseHarnessVersion,
  resolveTaskAgentLaunch,
  TASK_AGENT_BASE_ENVIRONMENT_NAMES,
} from "../src/adapters/task-agents.js";
import {
  CODEX_TASK_OUTPUT_BYTES,
  CODEX_TASK_TIMEOUT_MS,
  codexControllerArgs,
  codexTaskEnvironment,
  parseCodexEvents,
  readCodexClaim,
  runCodexController,
} from "../src/adapters/task-codex.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXED_NOW = new Date("2026-09-30T00:00:00.000Z");
const TEN_MINUTES_LATER = "2026-09-30T00:10:00.000Z";
const FAKE_CODEX_VERSION_LINE = "codex-cli 9.9.9";

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

async function controllerRequest(context: TestContext, deadlineAt: string | null): Promise<ControllerDispatchRequest> {
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
  });
  assert.deepEqual(args, [
    "exec",
    "--json",
    "--ephemeral",
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
  for (const forbidden of ["--dangerously-bypass-approvals-and-sandbox", "danger-full-access", "--yolo"]) {
    assert.equal(args.includes(forbidden), false, `the vector never carries ${forbidden}`);
  }
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
