import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { approvedCodexJobArgs, runApprovedTaskJobProcess, type TaskJobBinding } from "../src/core/task-native-job.js";
import { approveTaskContract, loadTaskContract, readTaskApprovals, reservedRunIdForApproval } from "../src/core/task-contract.js";
import { dispatchUsage, meteredTaskDispatch, readTaskDispatches, type TaskDispatchObservation } from "../src/core/task-runtime.js";
import { CodexUsageCollector } from "../src/core/task-native-usage.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract } from "./helpers/task-fixture.js";
import { normalizeHarnessTelemetry } from "../src/core/task-telemetry.js";
import type { ProcessResult } from "../src/core/process.js";
import { collectCodexSessionFamily } from "../src/core/task-native-sessions.js";
import { aggregateTaskUsage } from "../src/core/task-telemetry.js";

function result(stdout = ""): ProcessResult {
  const excerpt = { excerpt: "", totalBytes: 0, capped: false, sha256: "0".repeat(64) };
  return { code: "ok", exitCode: 0, signal: null, timedOut: false, outputCapped: false, durationMs: 1,
    stdout: { ...excerpt, excerpt: stdout }, stderr: excerpt };
}

test("registered dedicated route binds approval/model/effort and blocks the next paid spawn after quota usage", async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot, { agentPolicy: {
    controller: "codex", executor: "codex", reviewer: "codex", reviewerSession: "fresh-read-only",
    controllerModel: "gpt-6.1-sol", executorModel: "gpt-6.1-terra", reviewerModel: "gpt-6.1-sol",
    controllerEffort: "high", executorEffort: "high", reviewerEffort: "high",
  }, resourcePolicy: { maxTokens: 120, maxWallTimeMinutes: 5 } });
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  const binding: TaskJobBinding = { route: "codex-json-v1", contractPath: fixture.contractPath, contractDigest: digest,
    runId: reservedRunIdForApproval({ contractDigest: digest }), role: "controller", prompt: "한글 fixture — remaining slice only" };
  const launch = { schemaVersion: 1 as const, kind: "command-job-launch" as const, task: binding,
    jobId: "job-1234567890abcdef", ownerToken: "fixture-owner", executable: process.execPath,
    args: approvedCodexJobArgs(contract, binding), cwd: fixture.projectRoot, deadlineMs: 1000, createdAt: new Date().toISOString() };
  let paidSpawns = 0;
  const options = { stateRoot: fixture.stateRoot, launch, processSpec: { executable: process.execPath, args: launch.args, cwd: fixture.projectRoot },
    resolve: () => process.execPath,
    runner: async (spec: import("../src/core/process.js").ProcessSpec) => {
      paidSpawns++;
      const events = [
        { type: "thread.started", thread_id: "fixture-thread" },
        { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 } } } },
        { type: "turn.failed", error: { message: "You've hit your usage limit" } },
      ].map((event) => JSON.stringify(event)).join("\n") + "\n";
      spec.onStdoutChunk?.(Buffer.from(events));
      return result(events);
    } };
  assert.equal((await runApprovedTaskJobProcess(options)).taskStopCode, "task_launch_not_authorized");
  assert.equal(paidSpawns, 0);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const [approval] = await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: contract.id });
  launch.args = approvedCodexJobArgs(contract, binding, approval?.gitDirectory ?? null);
  assert.equal((await runApprovedTaskJobProcess(options)).taskStopCode, "quota_exhausted");
  assert.equal(dispatchUsage(await readTaskDispatches(fixture.stateRoot, digest)).tokens, 120);
  assert.equal((await runApprovedTaskJobProcess(options)).taskStopCode, "token_limit_exceeded");
  assert.equal(paidSpawns, 1);
  const wrong = { ...options, launch: { ...launch, args: [...launch.args, "--model", "unapproved"] } };
  assert.equal((await runApprovedTaskJobProcess(wrong)).taskStopCode, "task_launch_not_authorized");
  assert.equal(paidSpawns, 1);
});

test("typed argv preserves multilingual prompt and exact resume handle without a shell separator", () => {
  const contract = inventorySummaryContract("fixture", { agentPolicy: { controller: "codex", executor: "codex", reviewer: "codex",
    reviewerSession: "fresh-read-only", executorModel: "gpt-6.1-terra", executorEffort: "high" } });
  const binding: TaskJobBinding = { route: "codex-json-v1", contractPath: join(process.cwd(), "공백 경로", "contract.json"),
    contractDigest: "a".repeat(64), runId: "abcdefgh-12345678", role: "executor", prompt: '공백 "quoted" $() `한글`', resumeSessionId: "exact-resume-id" };
  const args = approvedCodexJobArgs(contract, binding);
  assert.deepEqual(args.slice(-4), ["resume", "exact-resume-id", "--", binding.prompt]);
  assert.deepEqual(args.slice(args.indexOf("-m"), args.indexOf("-m") + 4), ["-m", "gpt-6.1-terra", "-c", 'model_reasoning_effort="high"']);
});

test("stream accounting survives capped narrative and a missing final usage event", () => {
  const collector = new CodexUsageCollector();
  collector.push(Buffer.from("x".repeat(100_000) + "\n"));
  const line = JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 50, cached_input_tokens: 30, output_tokens: 5 } } } }) + "\n";
  for (const byte of Buffer.from(line + line)) collector.push(Buffer.from([byte]));
  assert.equal(collector.finish().totalTokens, 55);
  assert.equal(collector.observedModelCalls, 1);
});

test("parent death is terminal observation while a surviving child remains explicitly unresolved", async (t) => {
  const fixture = await createTaskFixture(t);
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { stdio: "ignore", windowsHide: true });
  await once(child, "spawn");
  t.after(() => { child.kill(); });
  const digest = "c".repeat(64), dispatchId = "d".repeat(64);
  const root = join(fixture.stateRoot, "runs", digest, "dispatches");
  await mkdir(root, { recursive: true });
  const record: TaskDispatchObservation = { schemaVersion: 1, dispatchId, contractDigest: digest, runId: "fixture",
    role: "controller", harness: "codex", model: "gpt-6.1-sol", startedAt: new Date().toISOString(), finishedAt: null,
    host: hostname(), ownerPid: 2147483647, childPid: child.pid!, sessionId: "fixture-thread", status: "running", reason: null,
    telemetry: normalizeHarnessTelemetry("codex", { usage: { input_tokens: 50, output_tokens: 5 } }) };
  await writeFile(join(root, `${dispatchId}.json`), JSON.stringify(record));
  const [observed] = await readTaskDispatches(fixture.stateRoot, digest);
  assert.equal(observed?.status, "interrupted");
  assert.match(observed?.reason ?? "", /child_may_be_alive/);
  let calls = 0;
  await assert.rejects(meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot),
    digest, runId: "resume", role: "controller", invoke: async () => { calls++; return { sessionId: "new" }; } }), /runtime_dispatch_unresolved/);
  assert.equal(calls, 0);
});

test("native local cumulative fixtures join exact parent/child ancestry and deduplicate resume", async (t) => {
  const fixture = await createTaskFixture(t);
  const sessionRoot = join(fixture.scratch, "native-sessions");
  const directory = join(sessionRoot, "2026", "10", "30");
  await mkdir(directory, { recursive: true });
  const rootId = "11111111-1111-4111-8111-111111111111";
  const childId = "22222222-2222-4222-8222-222222222222";
  const unrelatedId = "33333333-3333-4333-8333-333333333333";
  for (const [id, parent, input] of [[rootId, null, 100], [childId, rootId, 50], [unrelatedId, null, 9999]] as const) {
    const count = { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, cached_input_tokens: input / 2, output_tokens: 10 } } } };
    const events = [{ type: "session_meta", payload: { id, cwd: fixture.projectRoot,
      source: parent ? { subagent: { thread_spawn: { parent_thread_id: parent } } } : "exec" } },
      { type: "response_item", payload: { content: "PRIVATE_NARRATIVE_SENTINEL" } }, count, count];
    await writeFile(join(directory, `${id}.jsonl`), events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  }
  const observations = await collectCodexSessionFamily({ sessionId: rootId, projectRoot: fixture.projectRoot,
    contractDigest: "e".repeat(64), runId: "fixture", attemptId: "attempt", role: "controller", sessionRoot,
    now: new Date("2026-10-30T00:00:00Z") });
  assert.ok(observations);
  assert.equal(observations.length, 2);
  const resumed = observations.map((entry) => ({ ...entry, runId: "resumed", attemptId: "resumed" }));
  const totals = aggregateTaskUsage([...observations, ...resumed]);
  assert.equal(totals.tokens, 170);
  assert.equal(totals.observedModelCalls, 2);
  assert.equal(totals.costUsd, null);
  assert.equal(JSON.stringify(observations).includes("PRIVATE_NARRATIVE_SENTINEL"), false);
});

test("native usage finds the exact session across local/UTC date boundaries without absorbing unrelated sessions", async (t) => {
  const fixture = await createTaskFixture(t);
  const sessionRoot = join(fixture.scratch, "native-date-sessions");
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  for (const [date, sessionId] of [["2026/11/06", id], ["2026/11/04", "11111111-2222-4333-8444-555555555555"]]) {
    const directory = join(sessionRoot, date!);
    await mkdir(directory, { recursive: true });
    const events = [{ type: "session_meta", payload: { id: sessionId, cwd: fixture.projectRoot, source: "exec" } },
      { type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: 10 } } } }];
    await writeFile(join(directory, `${sessionId}.jsonl`), events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  }
  const observations = await collectCodexSessionFamily({ sessionId: id, projectRoot: fixture.projectRoot, contractDigest: "e".repeat(64),
    runId: "date-boundary", attemptId: "attempt", role: "controller", sessionRoot, now: new Date("2026-11-05T17:00:00Z") });
  assert.equal(observations?.length, 1);
  assert.equal(observations?.[0]?.sessionId, id);
  assert.equal(aggregateTaskUsage(observations!).tokens, 110);
});

test("Windows reproduces unquoted PowerShell shim separator loss and typed native argv preserves it", { skip: process.platform !== "win32" }, async (t) => {
  const fixture = await createTaskFixture(t);
  const echo = join(fixture.scratch, "argv echo 한글.mjs"), shim = join(fixture.scratch, "npm shim fixture.ps1");
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  await writeFile(echo, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  await writeFile(shim, `& ${literal(process.execPath)} ${literal(echo)} $args\nexit $LASTEXITCODE\n`);
  const expected = ["--", process.execPath, '한글 "quoted" $() `literal`', "exact-resume-id"];
  const legacy = spawnSync("pwsh", ["-NoProfile", "-Command", `& ${literal(shim)} -- ${expected.slice(1).map(literal).join(" ")}`],
    { encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.deepEqual(JSON.parse(legacy.stdout), expected.slice(1), "PowerShell consumed the shell-level separator before the npm-style shim");
  const typed = spawnSync(process.execPath, [echo, ...expected], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.equal(typed.status, 0, typed.stderr);
  assert.deepEqual(JSON.parse(typed.stdout), expected);
});
