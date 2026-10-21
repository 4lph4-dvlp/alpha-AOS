// Side-effect-free runtime fixtures. Importing this module registers no tests.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import {
  cancelCommandJob, readJobRecord, startCommandJob, waitCommandJob, type CommandJobRecord,
} from "../../src/core/command-jobs.js";
import { isProcessAlive } from "../../src/core/writer-lock.js";

const terminal = new Set(["completed", "failed", "cancelled", "timed_out", "orphaned"]);
export async function waitForRuntimeFile(path: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) await delay(10);
  assert.equal(existsSync(path), true, "The child/worker barrier must actually be reached.");
}
async function processExited(pid: number): Promise<void> {
  assert.notEqual(pid, process.pid, "Runtime facts must name an actual other process.");
  const deadline = Date.now() + 3000;
  while (isProcessAlive(pid) && Date.now() < deadline) await delay(10);
  assert.equal(isProcessAlive(pid), false, "Actual owned process must have exited.");
}
export async function assertRuntimeReaped(record: CommandJobRecord): Promise<void> {
  assert.ok(typeof record.childPid === "number" && record.childPid > 0);
  assert.ok(typeof record.workerPid === "number" && record.workerPid > 0);
  assert.notEqual(record.workerPid, record.childPid);
  await processExited(record.childPid);
  await processExited(record.workerPid);
}
export async function runtimeFixture(context: TestContext) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "alpha-job-runtime-")));
  const stateRoot = join(base, "state"), projectRoot = join(base, "project");
  await mkdir(projectRoot);
  context.after(async () => {
    const jobsRoot = join(stateRoot, "jobs");
    const ids = existsSync(jobsRoot) ? await readdir(jobsRoot) : [];
    const failures: unknown[] = [];
    for (const jobId of ids.filter((id) => /^job-[0-9a-f]{16}$/.test(id))) {
      try {
        let record = await readJobRecord(stateRoot, jobId);
        if (!terminal.has(record.status)) record = await cancelCommandJob({ stateRoot, jobId, timeoutMs: 5000 });
        if (record.childPid !== null) await processExited(record.childPid);
        if (record.workerPid !== null) await processExited(record.workerPid);
      } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Runtime fixture cleanup failed; private state preserved at " + base);
    await rm(base, { recursive: true, force: true });
  });
  return {
    base, stateRoot, projectRoot,
    start: (args: string[], cliPath?: string) => startCommandJob({
      stateRoot, cwd: projectRoot, executable: process.execPath, args, deadlineMs: 10000,
      ...(cliPath ? { cliPath } : {}),
    }),
    finish: async (jobId: string) => {
      const result = await waitCommandJob({ stateRoot, jobId, timeoutMs: 6000 });
      assert.equal(result.status, "completed");
      if (result.status !== "completed") throw new Error("No canonical terminal result.");
      return result.value;
    },
  };
}

export async function realOwnedCancellation(context: TestContext): Promise<void> {
  const f = await runtimeFixture(context), ready = join(f.projectRoot, "ready");
  const child = "const fs=require('node:fs');fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},50);setTimeout(()=>process.exit(92),8000);";
  const handle = await f.start(["-e", child, ready]);
  await waitForRuntimeFile(ready);
  const running = await readJobRecord(f.stateRoot, handle.jobId);
  assert.equal(running.status, "running");
  const result = await cancelCommandJob({ stateRoot: f.stateRoot, jobId: handle.jobId, timeoutMs: 5000 });
  assert.equal(result.status, "cancelled");
  assert.equal(result.childPid, running.childPid);
  assert.equal(result.workerPid, running.workerPid);
  assert.equal(result.cancelRequested, true);
  assert.equal(result.cancelDelivered, true);
  assert.ok(result.cancelRequestedAt !== null && result.cancelConfirmedAt !== null);
  assert.ok(result.exitCode !== null || result.signal !== null);
  await assertRuntimeReaped(result);
}

async function stateFiles(root: string): Promise<Buffer[]> {
  const contents: Buffer[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) contents.push(...await stateFiles(path));
    else if (entry.isFile()) contents.push(await readFile(path));
  }
  return contents;
}
export async function realEnvironmentIsolation(context: TestContext): Promise<void> {
  const f = await runtimeFixture(context);
  const oldKey = process.env.OPENAI_API_KEY, oldOptions = process.env.NODE_OPTIONS;
  const opaque = "synthetic-opaque-" + Math.random().toString(36).slice(2) + "-credential";
  const nodeOptions = "--no-warnings";
  process.env.OPENAI_API_KEY = opaque;
  process.env.NODE_OPTIONS = nodeOptions;
  try {
    const code = "console.log(JSON.stringify({key:Object.hasOwn(process.env,'OPENAI_API_KEY'),nodeOptions:Object.hasOwn(process.env,'NODE_OPTIONS')}))";
    const handle = await f.start(["-e", code]);
    const result = await f.finish(handle.jobId);
    assert.equal(result.status, "completed");
    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(result.output!.stdout.trim()), { key: false, nodeOptions: false });
    await assertRuntimeReaped(result);
    for (const bytes of await stateFiles(f.stateRoot)) {
      assert.equal(bytes.includes(Buffer.from(opaque)), false, "Opaque ambient credential must not be persisted.");
      assert.equal(bytes.includes(Buffer.from(nodeOptions)), false, "Ambient Node options must not be persisted.");
    }
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = oldOptions;
  }
}
