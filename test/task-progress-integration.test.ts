import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { approveTaskContract, loadTaskContract, previewTaskContract } from "../src/core/task-contract.js";
import { createTaskFixture, fixturePorts, inventorySummaryContract, passingReview, referenceControllerPort, staticReviewerPort, writeTaskContract } from "./helpers/task-fixture.js";
import { packageRoot } from "../src/core/paths.js";
import { startTask } from "../src/core/task-run.js";
import { createTaskSession, type TaskSessionBinding } from "../src/core/task-session.js";
import { submitTaskSteering } from "../src/core/task-steering.js";
const invoke = promisify(execFile);
const cliEntry = join(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), "dist", "src", "cli.js");
for (const host of ["claude", "codex", "antigravity", "pi", "hermes"] as const) {
test(`phase26 five host integration ${host} public start hands off while fixture controller is held`, { timeout: 60000, skip: process.platform !== "win32" }, async (t) => {
  const fixture = await createTaskFixture(t);
  const contract = inventorySummaryContract(fixture.projectRoot, { agentPolicy: { controller: "codex", executor: "codex", reviewer: "codex", reviewerSession: "fresh-read-only", controllerModel: "fixture-model", controllerEffort: "high", executorModel: "fixture-model", executorEffort: "high", reviewerModel: "fixture-model", reviewerEffort: "high" } });
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const fakeBin = join(fixture.scratch, "held fake bin"), scriptDir = join(fakeBin, "node_modules", "fixture");
  await mkdir(scriptDir, { recursive: true });
  const marker = join(fakeBin, "entered"), release = join(fakeBin, "release"), script = join(scriptDir, "codex.cjs");
  await writeFile(join(fakeBin, "codex.cmd"), '"%dp0%\\node_modules\\fixture\\codex.cjs"\r\n');
  await writeFile(script, `const fs=require("node:fs"); if(process.argv.includes("--version")){console.log("codex 1.2.3");process.exit(0)} const marker=${JSON.stringify(marker)}, release=${JSON.stringify(release)}; const watcher=fs.watch(${JSON.stringify(fakeBin)},()=>{if(fs.existsSync(release)){watcher.close();console.log(JSON.stringify({type:"turn.failed"}));process.exit(1)}}); fs.writeFileSync(marker,"entered"); setTimeout(()=>{watcher.close();process.exit(1)},30000);`);
  const { computeBinarySha256, writeHarnessRoleReceipt } = await import("../src/adapters/task-receipts.js");
  const binarySha256 = await computeBinarySha256(script);
  for (const role of ["controller", "executor", "reviewer"] as const) await writeHarnessRoleReceipt({ schemaVersion: 1, harness: "codex", role, version: "1.2.3", binarySha256, executable: script, probedAt: new Date().toISOString(), capabilities: { invoked: true, cancelled: true, outputParsed: true, ...(role === "reviewer" ? { readOnlyGuaranteed: true } : {}) }, sampleDigest: "a".repeat(64) }, join(fixture.stateRoot, "receipts"));
  const child = spawn(process.execPath, [cliEntry, "task", "start", fixture.contractPath, "--contract-digest", digest, "--apply", "--progress", "panel", "--origin-host", host, "--origin-session", `cli-held-${host}`, "--observer-timeout-ms", "30000", "--json"], { cwd: fixture.scratch, env: { ...process.env, CODEX_HOME: fixture.gsdConfigRoot, ALPHA_AOS_STATE_DIR: fixture.stateRoot, PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}` }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "", buffer = "";
  child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const ended = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const handoff = new Promise<{ url: string; jobId: string; binding: { contractId: string; contractDigest: string; revision: number; runId: string; host: string; originatingSessionId: string } }>((resolve, reject) => {
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => { buffer += chunk; const index = buffer.indexOf("\n"); if (index >= 0) { try { const value = JSON.parse(buffer.slice(0, index)) as { type: string; url: string; jobId: string; binding: { contractId: string; contractDigest: string; revision: number; runId: string; host: string; originatingSessionId: string } }; if (value.type === "panel-launch") resolve(value); } catch (error) { reject(error); } } });
    child.once("error", reject); child.once("close", () => reject(new Error(`CLI exited before panel handoff: ${stderr}`)));
  });
  let launch: { url: string; jobId: string; binding: { contractId: string; contractDigest: string; revision: number; runId: string; host: string; originatingSessionId: string } } | undefined;
  try {
    launch = await handoff;
    const { waitForCompletion } = await import("../src/core/completion-wait.js");
    const entered = await waitForCompletion({ targetPath: marker, timeoutMs: 20000, check: async () => existsSync(marker) ? { state: "terminal" as const, value: true } : { state: "pending" as const } });
    assert.equal(entered.status, "completed");
    assert.equal(child.exitCode, null);
    const url = new URL(launch.url);
    const exchange = await fetch(`${url.origin}/session`, { method: "POST", headers: { Origin: url.origin, Authorization: `Bearer ${url.hash.slice(1)}` } });
    assert.equal(exchange.status, 200);
    const { token } = await exchange.json() as { token: string };
    const snapshot = await fetch(`${url.origin}/snapshot`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(snapshot.status, 200);
    const observed = await snapshot.json() as { binding: typeof launch.binding; cursor: number };
    assert.deepEqual(observed.binding, launch.binding);
    const stream = await fetch(`${url.origin}/events?cursor=0`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    assert.equal(stream.status, 200);
    await stream.body!.cancel();
    const binding = launch.binding;
    const exact = [binding.contractId, "--run", binding.runId, "--contract-digest", binding.contractDigest, "--revision", String(binding.revision), "--origin-host", host, "--origin-session", binding.originatingSessionId];
    const options = { cwd: fixture.scratch, env: { ...process.env, ALPHA_AOS_STATE_DIR: fixture.stateRoot } };
    const packet = await invoke(process.execPath, [cliEntry, "task", "context", ...exact, "--limit", "10", "--json"], options);
    assert.deepEqual((JSON.parse(packet.stdout) as { binding: typeof binding }).binding, binding);
    const proposal = join(fixture.scratch, "proposal.json");
    await writeFile(proposal, JSON.stringify({ schemaVersion: 1, binding, requestId: `request-${host}`, submittedAt: new Date().toISOString(), text: "Please review the output format." }));
    const receipt = await invoke(process.execPath, [cliEntry, "task", "steer", proposal, "--apply", "--json"], options);
    assert.equal((JSON.parse(receipt.stdout) as { receipt: { state: string } }).receipt.state, "received");
  } finally {
    await writeFile(release, "release");
    await ended;
    if (launch) { const { cancelCommandJob } = await import("../src/core/command-jobs.js"); await cancelCommandJob({ stateRoot: fixture.stateRoot, jobId: launch.jobId, timeoutMs: 10000 }); }
  }
  assert.ok(launch);
  const binding = launch.binding;
  const disposition = await invoke(process.execPath, [cliEntry, "task", "steering", binding.contractId, "--run", binding.runId, "--contract-digest", binding.contractDigest, "--revision", String(binding.revision), "--origin-host", host, "--origin-session", binding.originatingSessionId, "--json"], { cwd: fixture.scratch, env: { ...process.env, ALPHA_AOS_STATE_DIR: fixture.stateRoot } });
  const facts = (JSON.parse(disposition.stdout) as { facts: { state: string }[] }).facts;
  assert.ok(facts.some((fact) => fact.state === "deferred"));
  assert.ok(!facts.some((fact) => fact.state === "applied"));
});

}
for (const host of ["claude", "codex", "antigravity", "pi", "hermes"] as const) {
test(`phase26 five host normal controller ${host} consumes steering`, async (t) => {
  const fixture = await createTaskFixture(t);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const base = referenceControllerPort("correct");
  let calls = 0, prompt = "", binding: TaskSessionBinding | undefined;
  const controller: typeof base = { async dispatch(request) { calls++; prompt = request.prompt; return base.dispatch(request); } };
  await startTask({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot, packageRoot: packageRoot(),
    ports: fixturePorts({ controller, reviewer: staticReviewerPort(passingReview) }), gsd: { configRoot: fixture.gsdConfigRoot },
    onRunReady: async (run) => {
      binding = { schemaVersion: 1, contractId: run.contractId, contractDigest: digest, revision: run.revision, runId: run.runId,
        host, originatingSessionId: `quick-tracer-${host}` };
      await createTaskSession(fixture.stateRoot, binding);
      await submitTaskSteering({ stateRoot: fixture.stateRoot, proposal: { schemaVersion: 1, binding, requestId: "quick-1",
        submittedAt: "2026-11-01T00:00:00Z", text: "Reuse the existing input validation layout for the output checks." } });
    } });
  assert.equal(calls, 1);
  assert.match(prompt, /Reuse the existing input validation layout for the output checks\./u);
  assert.match(prompt, /UNTRUSTED/u);
  assert.ok(binding);
  const { readTaskSessionPacket } = await import("../src/core/task-read.js");
  const packet = await readTaskSessionPacket({ stateRoot: fixture.stateRoot, binding, limit: 50 });
  const dispositions: { state: string }[] = packet.proposalDispositions;
  assert.ok(dispositions.some((entry) => entry.state === "delivered"));
  assert.ok(dispositions.some((entry) => entry.state === "deferred"));
  assert.ok(!dispositions.some((entry) => entry.state === "applied"));
});


}
