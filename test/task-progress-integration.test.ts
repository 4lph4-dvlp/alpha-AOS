import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { approveTaskContract, loadTaskContract } from "../src/core/task-contract.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract } from "./helpers/task-fixture.js";
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
  const handoff = new Promise<{ url: string; jobId: string }>((resolve, reject) => {
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => { buffer += chunk; const index = buffer.indexOf("\n"); if (index >= 0) { try { const value = JSON.parse(buffer.slice(0, index)) as { type: string; url: string; jobId: string }; if (value.type === "panel-launch") resolve(value); } catch (error) { reject(error); } } });
    child.once("error", reject); child.once("close", () => reject(new Error(`CLI exited before panel handoff: ${stderr}`)));
  });
  let launch: { url: string; jobId: string } | undefined;
  try {
    launch = await handoff;
    const { waitForCompletion } = await import("../src/core/completion-wait.js");
    const entered = await waitForCompletion({ targetPath: marker, timeoutMs: 20000, check: async () => existsSync(marker) ? { state: "terminal" as const, value: true } : { state: "pending" as const } });
    assert.equal(entered.status, "completed");
    assert.equal(child.exitCode, null);
    const url = new URL(launch.url);
    const exchange = await fetch(`${url.origin}/session`, { method: "POST", headers: { Origin: url.origin, Authorization: `Bearer ${url.hash.slice(1)}` } });
    assert.equal(exchange.status, 200);
  } finally {
    await writeFile(release, "release");
    await ended;
    if (launch) { const { cancelCommandJob } = await import("../src/core/command-jobs.js"); await cancelCommandJob({ stateRoot: fixture.stateRoot, jobId: launch.jobId, timeoutMs: 10000 }); }
  }
});


}
