import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { cancelCommandJob, readJobRecord, waitCommandJob } from "../src/core/command-jobs.js";
import { isProcessAlive } from "../src/core/writer-lock.js";
import {
  assertRuntimeReaped, realEnvironmentIsolation, realOwnedCancellation, runtimeFixture, waitForRuntimeFile,
} from "./helpers/command-job-runtime.js";

test("command-job-runtime: fast zero exit returns real acknowledgement and child facts", async (context) => {
  const f = await runtimeFixture(context);
  const handle = await f.start(["-e", "process.stdout.write('FAST_ZERO');"]);
  const result = await f.finish(handle.jobId);
  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.output?.stdout, "FAST_ZERO");
  assert.ok(result.startedAt && result.acknowledgedAt && result.finishedAt);
  assert.ok(result.stateRevision >= 2);
  await assertRuntimeReaped(result);
});

test("command-job-runtime: cold worker startup beyond five seconds still returns proven child acknowledgement", { timeout: 25000 }, async (context) => {
  const f = await runtimeFixture(context);
  const adapter = join(f.projectRoot, "slow-worker.mjs");
  const workerUrl = new URL("../src/core/command-job-worker.js", import.meta.url).href;
  await writeFile(adapter, [
    "await new Promise(resolve=>setTimeout(resolve,6000));",
    `const {runJobWorker}=await import(${JSON.stringify(workerUrl)});`,
    "const flag=n=>process.argv[process.argv.indexOf(n)+1];",
    "await runJobWorker({stateRoot:flag('--state-root'),jobId:flag('--job-id'),ownerToken:flag('--owner-token')});",
  ].join("\n"));
  const handle = await f.start(["-e", "process.stdout.write('COLD_START_CONFIRMED')"], adapter);
  const result = await f.finish(handle.jobId);
  assert.equal(result.status, "completed");
  assert.equal(result.output?.stdout, "COLD_START_CONFIRMED");
  assert.ok(result.childPid && result.acknowledgedAt && result.workerPid);
  await assertRuntimeReaped(result);
});

test("command-job-runtime: a pre-spawn refusal reports its actual error without inventing child acknowledgement", async (context) => {
  const f = await runtimeFixture(context);
  const adapter = join(f.projectRoot, "refusing-worker.mjs");
  const workerUrl = new URL("../src/core/command-job-worker.js", import.meta.url).href;
  await writeFile(adapter, [
    "import {unlink} from 'node:fs/promises';",
    `const {runJobWorker}=await import(${JSON.stringify(workerUrl)});`,
    "const flag=n=>process.argv[process.argv.indexOf(n)+1];",
    "await unlink(flag('--state-root')+'/jobs/'+flag('--job-id')+'/launch-spec.json');",
    "await runJobWorker({stateRoot:flag('--state-root'),jobId:flag('--job-id'),ownerToken:flag('--owner-token')});",
  ].join("\n"));
  await assert.rejects(f.start(["-e", "process.exit(91)"], adapter), /Worker rejected launch before child start \(LAUNCH_SPEC_MISSING\)/u);
});

test("command-job-runtime: observer expiry leaves the actual child alive to execute its release marker", async (context) => {
  const f = await runtimeFixture(context);
  const ready = join(f.projectRoot, "ready"), release = join(f.projectRoot, "release"), survived = join(f.projectRoot, "survived");
  const code = "const fs=require('node:fs');fs.writeFileSync(process.argv[1],'ready');const t=setInterval(()=>{if(fs.existsSync(process.argv[2])){clearInterval(t);fs.writeFileSync(process.argv[3],'survived');process.exit(0)}},10);setTimeout(()=>process.exit(93),8000).unref();";
  const handle = await f.start(["-e", code, ready, release, survived]);
  await waitForRuntimeFile(ready);
  const running = await readJobRecord(f.stateRoot, handle.jobId);
  assert.equal(running.status, "running");
  const expiry = await waitCommandJob({ stateRoot: f.stateRoot, jobId: handle.jobId, timeoutMs: 150 });
  assert.equal(expiry.status, "timeout");
  assert.ok(running.childPid && isProcessAlive(running.childPid));
  await writeFile(release, "release");
  const result = await f.finish(handle.jobId);
  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(await readFile(survived, "utf8"), "survived");
  await assertRuntimeReaped(result);
});

test("command-job-runtime: owned cancellation proves actual child and worker exit", async (context) => {
  await realOwnedCancellation(context);
});
test("command-job-runtime: opaque ambient credentials and Node options stay absent and unpersisted", async (context) => {
  await realEnvironmentIsolation(context);
});

test("command-job-runtime: delayed cancellation delivery after proven natural close preserves zero exit", async (context) => {
  const f = await runtimeFixture(context);
  const release = join(f.projectRoot, "release"), entered = join(f.projectRoot, "cancel-entered");
  const adapter = join(f.projectRoot, "worker-adapter.mjs");
  const workerUrl = new URL("../src/core/command-job-worker.js", import.meta.url).href;
  const adapterCode = [
    "import {writeFile} from 'node:fs/promises';",
    "import {runJobWorker} from " + JSON.stringify(workerUrl) + ";",
    "const flag=n=>process.argv[process.argv.indexOf(n)+1];",
    "let resolveSettled;const settled=new Promise(r=>{resolveSettled=r});",
    "await runJobWorker({stateRoot:flag('--state-root'),jobId:flag('--job-id'),ownerToken:flag('--owner-token'),_testSeams:{",
    "onProcessSettled:()=>resolveSettled(),",
    "onBeforeCancelDelivery:async()=>{await writeFile(" + JSON.stringify(entered) + ",'entered');let timer;try{await Promise.race([settled,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('settled barrier deadline')),6000)})]);}finally{clearTimeout(timer)}}",
    "}});",
  ].join("\n");
  await writeFile(adapter, adapterCode, "utf8");
  const child = "const fs=require('node:fs');const t=setInterval(()=>{if(fs.existsSync(process.argv[1])){clearInterval(t);process.exit(0)}},10);setTimeout(()=>process.exit(94),8000).unref();";
  const handle = await f.start(["-e", child, release], adapter);
  const [result] = await Promise.all([
    cancelCommandJob({ stateRoot: f.stateRoot, jobId: handle.jobId, timeoutMs: 7000 }),
    (async () => { await waitForRuntimeFile(entered); await writeFile(release, "release"); })(),
  ]);
  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.cancelRequested, true);
  assert.equal(result.cancelDelivered, null);
  assert.equal(result.cancelConfirmedAt, null);
  await assertRuntimeReaped(result);
});
