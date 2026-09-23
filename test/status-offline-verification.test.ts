import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { applyFileTransaction } from "../src/core/transaction.js";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";

// dist/test -> dist/src/cli.js and dist/test/helpers/io-trap-preload.js
const cliPath = join(import.meta.dirname, "..", "src", "cli.js");
const preloadUrl = pathToFileURL(join(import.meta.dirname, "helpers", "io-trap-preload.js")).href;

function trapLines(logPath: string): string[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8").split(/\r?\n/u).filter((line) => line.length > 0);
}

function runTrapped(args: readonly string[], env: NodeJS.ProcessEnv, cwd: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", preloadUrl, ...args], {
    env,
    cwd,
    encoding: "utf8",
    timeout: 300_000,
    windowsHide: true,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? result.error?.message ?? "" };
}

test("offline status spawns no child process and opens no network connection through the CLI (LIFE-02)", { timeout: 600_000 }, async (context) => {
  const sandbox = await createIsolatedSandbox(context);

  // Populated state: one applied journal written by the real transaction path.
  const journal = await applyFileTransaction({
    stateRoot: sandbox.state,
    allowedRoots: [sandbox.home],
    operations: [{ target: join(sandbox.home, "p11-status-probe.txt"), content: "phase 11 status probe\n" }],
  });
  assert.equal(journal.status, "applied");

  const statusLog = join(sandbox.root, "trap-status.log");
  const status = runTrapped([cliPath, "status", "--json"], { ...sandbox.env, ALPHA_AOS_IO_TRAP_LOG: statusLog }, sandbox.repo);
  assert.equal(status.status, 0, `status --json failed\nstdout:\n${status.stdout}\nstderr:\n${status.stderr}`);
  const report = JSON.parse(status.stdout) as { needsRepair?: unknown; managedStatePresent?: unknown };
  assert.equal(report.needsRepair, false);
  assert.equal(report.managedStatePresent, true);
  assert.deepEqual(trapLines(statusLog), [], "status must not spawn a child process or open a network connection");

  // Positive control: the same preload records the version probes inventory spawns.
  const inventoryLog = join(sandbox.root, "trap-inventory.log");
  const inventory = runTrapped([cliPath, "inventory", "--json"], { ...sandbox.env, ALPHA_AOS_IO_TRAP_LOG: inventoryLog }, sandbox.repo);
  assert.equal(inventory.status, 0, `inventory --json failed\nstdout:\n${inventory.stdout}\nstderr:\n${inventory.stderr}`);
  assert.ok(
    trapLines(inventoryLog).some((line) => line.startsWith("child_process.")),
    `the trap recorded no child_process call for inventory: ${JSON.stringify(trapLines(inventoryLog))}`,
  );

  // Positive control: the same preload records a loopback fetch.
  const fetchLog = join(sandbox.root, "trap-fetch.log");
  const fetchControl = runTrapped(
    [
      "--input-type=module",
      "-e",
      "try { await fetch(\"http://127.0.0.1:9/\", { signal: AbortSignal.timeout(5000) }); } catch {}",
    ],
    { ...sandbox.env, ALPHA_AOS_IO_TRAP_LOG: fetchLog },
    sandbox.repo,
  );
  assert.equal(fetchControl.status, 0, `fetch control failed\nstderr:\n${fetchControl.stderr}`);
  assert.ok(trapLines(fetchLog).includes("fetch"), `the trap recorded no fetch call: ${JSON.stringify(trapLines(fetchLog))}`);
});
