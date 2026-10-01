import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ATTEMPT_MAX_OUTPUT_BYTES,
  ATTEMPT_PROCESS_TIMEOUT_MS,
  runProcess,
  terminateProcessTree,
  terminateProcessTreeGraceful,
} from "../src/core/process.js";

test("attempt safety constants have mandatory bound values", () => {
  assert.equal(ATTEMPT_PROCESS_TIMEOUT_MS, 15 * 60 * 1000);
  assert.equal(ATTEMPT_MAX_OUTPUT_BYTES, 10 * 1024 * 1024);
});

test("terminateProcessTree and terminateProcessTreeGraceful are exported functions", async () => {
  assert.equal(typeof terminateProcessTree, "function");
  assert.equal(typeof terminateProcessTreeGraceful, "function");

  // Call with non-existent PID - should safely return already-gone
  const delivery = terminateProcessTree(9999999);
  assert.ok(["already-gone", "windows-tree"].includes(delivery));

  const gracefulDelivery = await terminateProcessTreeGraceful(9999999, 50);
  assert.ok(["already-gone", "windows-tree"].includes(gracefulDelivery));
});

test("runProcess with pre-aborted signal terminates immediately with code cancelled", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-cancel-pre-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const script = join(dir, "sleep.mjs");
  await writeFile(script, "setTimeout(() => {}, 30000);\n", "utf8");

  const controller = new AbortController();
  controller.abort();

  const result = await runProcess({
    executable: process.execPath,
    args: [script],
    cwd: dir,
    signal: controller.signal,
    timeoutMs: 10000,
  });

  assert.equal(result.code, "cancelled");
});

test("runProcess with AbortSignal cancellation terminates running process and retains pre-abort output", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-cancel-live-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  // Script that prints initial progress, flushes, then sleeps
  const script = join(dir, "emitter.mjs");
  await writeFile(
    script,
    `
    process.stdout.write("started-and-working\\n");
    setTimeout(() => {
      process.stdout.write("should-not-reach-here\\n");
    }, 10000);
    `,
    "utf8",
  );

  const controller = new AbortController();
  const runPromise = runProcess({
    executable: process.execPath,
    args: [script],
    cwd: dir,
    signal: controller.signal,
    timeoutMs: 10000,
  });

  // Wait a short duration to ensure child is running and has written output, then abort
  await new Promise((resolve) => setTimeout(resolve, 400));
  controller.abort();

  const result = await runPromise;
  assert.equal(result.code, "cancelled");
  assert.ok(result.stdout.excerpt.includes("started-and-working"), "Pre-abort stdout must be retained");
  assert.ok(!result.stdout.excerpt.includes("should-not-reach-here"), "Post-abort output must not occur");
  assert.ok(result.stdout.sha256 && result.stdout.sha256.length === 64, "Pre-abort stdout hash must be present");
});

test("runProcess terminates child on timeout and reports code timeout", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-timeout-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const script = join(dir, "hang.mjs");
  await writeFile(script, "setTimeout(() => {}, 60000);\n", "utf8");

  const result = await runProcess({
    executable: process.execPath,
    args: [script],
    cwd: dir,
    timeoutMs: 300,
  });

  assert.equal(result.code, "timeout");
  assert.equal(result.timedOut, true);
});

test("runProcess terminates child when output exceeds limit and reports output-cap", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-output-cap-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  // Script continuously spams stdout past limit * 8
  const script = join(dir, "flood.mjs");
  await writeFile(
    script,
    `
    const chunk = "X".repeat(1024);
    const interval = setInterval(() => {
      process.stdout.write(chunk);
    }, 1);
    setTimeout(() => clearInterval(interval), 5000);
    `,
    "utf8",
  );

  const result = await runProcess({
    executable: process.execPath,
    args: [script],
    cwd: dir,
    maxOutputBytes: 1024,
    timeoutMs: 5000,
  });

  assert.ok(["output-cap", "timeout"].includes(result.code));
  assert.equal(result.outputCapped, true);
});
