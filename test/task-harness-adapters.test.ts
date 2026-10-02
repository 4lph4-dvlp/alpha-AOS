import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  antigravityControllerArgs,
  antigravityReviewerArgs,
  ANTIGRAVITY_TASK_ENVIRONMENT_NAMES,
  antigravityEnvironment,
} from "../src/adapters/task-antigravity.js";
import {
  piControllerArgs,
  piReviewerArgs,
  interpretPiExitResult,
  PI_TASK_ENVIRONMENT_NAMES,
  piEnvironment,
} from "../src/adapters/task-pi.js";
import {
  hermesControllerArgs,
  hermesReviewerArgs,
  parseHermesUsageFile,
  HERMES_TASK_ENVIRONMENT_NAMES,
  hermesEnvironment,
} from "../src/adapters/task-hermes.js";
import {
  codexControllerArgs,
  codexReviewerArgs,
  CODEX_TASK_ENVIRONMENT_NAMES,
} from "../src/adapters/task-codex.js";
import { createDynamicTaskPorts } from "../src/adapters/task-agents.js";
import type { ProcessResult } from "../src/core/process.js";

test("Antigravity argument vector formats controller and reviewer flags", () => {
  const reviewer = antigravityReviewerArgs({ schemaPath: "/tmp/schema.json" });
  assert.deepEqual(reviewer, [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    "/tmp/schema.json",
    "--mode",
    "plan",
    "--sandbox",
  ]);

  const controller = antigravityControllerArgs({ schemaPath: "/tmp/schema.json", prompt: "implement feature" });
  assert.deepEqual(controller, [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    "/tmp/schema.json",
    "--mode",
    "accept-edits",
    "implement feature",
  ]);
});

test("Pi argument vector formats controller and reviewer flags with read-only tools (D-11)", () => {
  const reviewer = piReviewerArgs({ schemaPath: "/tmp/review-schema.json" });
  assert.deepEqual(reviewer, [
    "-p",
    "--mode",
    "rpc",
    "--tools",
    "read,grep,find,ls",
    "--no-approve",
    "--no-session",
    "--json-schema",
    "/tmp/review-schema.json",
  ]);

  const controller = piControllerArgs({ schemaPath: "/tmp/ctrl-schema.json", prompt: "execute task" });
  assert.deepEqual(controller, [
    "-p",
    "--mode",
    "rpc",
    "--no-approve",
    "--no-session",
    "--json-schema",
    "/tmp/ctrl-schema.json",
    "execute task",
  ]);
});

test("Hermes argument vector formats controller and reviewer flags", () => {
  const controller = hermesControllerArgs({
    prompt: "do task",
    usageFile: "/tmp/usage.json",
    projectRoot: "/workspace/proj",
  });
  assert.deepEqual(controller, [
    "-z",
    "do task",
    "--usage-file",
    "/tmp/usage.json",
    "--toolsets",
    "file,git,terminal",
    "--ignore-rules",
    "--in",
    "/workspace/proj",
  ]);

  const reviewer = hermesReviewerArgs({
    prompt: "review task",
    usageFile: "/tmp/usage.json",
    reviewRoot: "/workspace/proj/.review",
  });
  assert.deepEqual(reviewer, [
    "-z",
    "review task",
    "--usage-file",
    "/tmp/usage.json",
    "--toolsets",
    "file",
    "--ignore-rules",
    "--in",
    "/workspace/proj/.review",
  ]);
});

test("Codex argument vector formats reviewer with read-only sandbox", () => {
  const reviewer = codexReviewerArgs({
    reviewRoot: "/workspace/review",
    outputSchemaPath: "/tmp/schema.json",
    lastMessagePath: "/tmp/last.json",
  });
  assert.deepEqual(reviewer, [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-rules",
    "--sandbox",
    "read-only",
    "-C",
    "/workspace/review",
    "--output-schema",
    "/tmp/schema.json",
    "-o",
    "/tmp/last.json",
    "-",
  ]);
});

test("interpretPiExitResult handles exit 0 cleanly and defends against Windows libuv stdin teardown crash (D-12, Pitfall 4)", () => {
  const cleanResult: ProcessResult = {
    code: "ok",
    exitCode: 0,
    signal: null,
    timedOut: false,
    stdout: { excerpt: "{}", totalBytes: 2, capped: false, sha256: "abc" },
    stderr: { excerpt: "", totalBytes: 0, capped: false, sha256: "abc" },
    durationMs: 500,
    outputCapped: false,
  };
  const cleanInterp = interpretPiExitResult(cleanResult, {});
  assert.equal(cleanInterp.status, "ok");
  assert.equal(cleanInterp.detail, null);

  // Simulated Windows teardown assertion code: 3221226505 (0xC0000409)
  const teardownCrashResult: ProcessResult = {
    code: "ok",
    exitCode: 3221226505,
    signal: null,
    timedOut: false,
    stdout: { excerpt: '{"status":"completed"}', totalBytes: 22, capped: false, sha256: "abc" },
    stderr: { excerpt: "Assertion failed: uv_is_closing(handle)", totalBytes: 39, capped: false, sha256: "abc" },
    durationMs: 750,
    outputCapped: false,
  };

  const parsedValid = { status: "completed" };
  const interp = interpretPiExitResult(teardownCrashResult, parsedValid);
  if (process.platform === "win32") {
    assert.equal(interp.status, "ok");
    assert.match(interp.detail!, /libuv assertion after successfully producing valid output/);
  }

  // Without valid parsed output, the teardown crash must be treated as failure
  const interpFailed = interpretPiExitResult(teardownCrashResult, null);
  if (process.platform === "win32") {
    assert.equal(interpFailed.status, "failed");
  }
});

test("parseHermesUsageFile extracts token telemetry from usage file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "alpha-aos-hermes-test-"));
  try {
    const usagePath = join(tempDir, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        promptTokens: 450,
        completionTokens: 150,
        totalTokens: 600,
      }),
      "utf8",
    );

    const telemetry = await parseHermesUsageFile(usagePath);
    assert.equal(telemetry.harness, "hermes");
    assert.equal(telemetry.promptTokens, 450);
    assert.equal(telemetry.completionTokens, 150);
    assert.equal(telemetry.totalTokens, 600);
    assert.equal(telemetry.costUsd, null); // Hermes is not assumed free (D-13, D-15)
    assert.equal(telemetry.status, "measured");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("environment allowlists restrict variables to declared names only", () => {
  const mockEnv: NodeJS.ProcessEnv = {
    PATH: "C:\\bin",
    HOME: "C:\\Users\\test",
    USERPROFILE: "C:\\Users\\test",
    SYSTEMROOT: "C:\\Windows",
    WINDIR: "C:\\Windows",
    AGY_HOME: "C:\\agy",
    PI_CODING_AGENT_DIR: "C:\\pi",
    HERMES_HOME: "C:\\hermes",
    SECRET_KEY: "supersecret",
    DATABASE_URL: "postgres://secret",
  };

  const agyPolicy = antigravityEnvironment(mockEnv);
  assert.ok(agyPolicy.optional?.includes("AGY_HOME"));
  assert.ok(!agyPolicy.optional?.includes("SECRET_KEY"));

  const piPolicy = piEnvironment(mockEnv);
  assert.ok(piPolicy.optional?.includes("PI_CODING_AGENT_DIR"));
  assert.ok(!piPolicy.optional?.includes("DATABASE_URL"));

  const hermesPolicy = hermesEnvironment(mockEnv);
  assert.ok(hermesPolicy.optional?.includes("HERMES_HOME"));
  assert.ok(!hermesPolicy.optional?.includes("SECRET_KEY"));
});

test("createDynamicTaskPorts routes all 5 harnesses to real adapter ports", () => {
  const ports = createDynamicTaskPorts({
    controller: "antigravity",
    executor: "pi",
    reviewer: "hermes",
    reviewerSession: "fresh-read-only",
  });

  assert.ok(typeof ports.controller.dispatch === "function");
  assert.ok(typeof ports.reviewer.review === "function");
  assert.ok(typeof ports.assess === "function");
});
