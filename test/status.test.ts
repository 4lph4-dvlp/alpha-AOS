import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { getOfflineStatus } from "../src/core/status.js";
import { formatOfflineStatus } from "../src/format.js";
import type { StackCatalog, StackLock } from "../src/types.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function fixtureSetup(context: test.TestContext): Promise<{
  stateRoot: string;
  catalog: StackCatalog;
  lock: StackLock;
}> {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-status-test-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));
  const catalog = await loadCatalog(repositoryRoot);
  const lock = await loadLock(repositoryRoot);
  return { stateRoot, catalog, lock };
}

test("offline status strictly executes zero subprocesses (LIFE-02, D-14)", async (context) => {
  const { stateRoot, catalog, lock } = await fixtureSetup(context);

  let subprocessCalls = 0;
  const methods = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const;
  const originalMethods: Record<string, unknown> = {};

  for (const method of methods) {
    originalMethods[method] = childProcess[method];
    // @ts-expect-error Mocking for test
    childProcess[method] = (...args: unknown[]) => {
      subprocessCalls++;
      throw new Error(`Subprocess execution forbidden in offline status: ${method}`);
    };
  }

  context.after(() => {
    for (const method of methods) {
      // @ts-expect-error Restoring original method
      childProcess[method] = originalMethods[method];
    }
  });

  const status = await getOfflineStatus(stateRoot, catalog, lock);
  assert.equal(subprocessCalls, 0, "offline status invoked child processes");
  assert.equal(status.channel, lock.channel);
  assert.equal(status.needsRepair, false);
});

test("offline status completes in under 50ms benchmark (LIFE-02, D-14)", async (context) => {
  const { stateRoot, catalog, lock } = await fixtureSetup(context);

  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await getOfflineStatus(stateRoot, catalog, lock);
    const duration = performance.now() - start;
    times.push(duration);
  }

  times.sort((a, b) => a - b);
  const median = (times[4]! + times[5]!) / 2;
  assert.ok(median < 50, `median execution time (${median.toFixed(2)}ms) exceeded 50ms requirement`);
});

test("healthy stack reports needsRepair=false and free writer (LIFE-02)", async (context) => {
  const { stateRoot, catalog, lock } = await fixtureSetup(context);
  const status = await getOfflineStatus(stateRoot, catalog, lock);

  assert.equal(status.channel, "stable");
  assert.equal(status.needsRepair, false);
  assert.equal(status.writerStatus, "free");
  assert.deepEqual(status.incompleteTransactions, []);
  assert.deepEqual(status.corruptJournals, []);

  const formatted = formatOfflineStatus(status);
  assert.match(formatted, /STATUS: OK/u);
});

test("incomplete transaction flags needsRepair=true (LIFE-02, D-09)", async (context) => {
  const { stateRoot, catalog, lock } = await fixtureSetup(context);
  const journalDir = join(stateRoot, "journal");
  await mkdir(journalDir, { recursive: true });

  const incompleteJournal = {
    schemaVersion: 1,
    id: "tx-incomplete-001",
    createdAt: new Date().toISOString(),
    status: "applying",
    allowedRoots: [stateRoot],
    files: [],
  };
  await writeFile(join(journalDir, "tx-incomplete-001.json"), JSON.stringify(incompleteJournal, null, 2), "utf8");

  const status = await getOfflineStatus(stateRoot, catalog, lock);
  assert.equal(status.needsRepair, true);
  assert.deepEqual(status.incompleteTransactions, ["tx-incomplete-001"]);

  const formatted = formatOfflineStatus(status);
  assert.match(formatted, /STATUS: NEEDS-REPAIR/u);
  assert.match(formatted, /Incomplete transactions: tx-incomplete-001/u);
  assert.match(formatted, /alpha-aos repair/u);
});

test("corrupt journal flags needsRepair=true and records filename (LIFE-02, D-09)", async (context) => {
  const { stateRoot, catalog, lock } = await fixtureSetup(context);
  const journalDir = join(stateRoot, "journal");
  await mkdir(journalDir, { recursive: true });

  await writeFile(join(journalDir, "tx-corrupt-002.json"), "{ unparseable json content", "utf8");

  const status = await getOfflineStatus(stateRoot, catalog, lock);
  assert.equal(status.needsRepair, true);
  assert.deepEqual(status.corruptJournals, ["tx-corrupt-002.json"]);

  const formatted = formatOfflineStatus(status);
  assert.match(formatted, /STATUS: NEEDS-REPAIR/u);
  assert.match(formatted, /Corrupt journals: tx-corrupt-002\.json/u);
});

test("stale lock flags needsRepair=true and writerStatus=needs-repair (LIFE-02, D-09)", async (context) => {
  const { stateRoot, catalog, lock } = await fixtureSetup(context);
  // Write a writer.lock with a dead PID (9999999 on most systems)
  const lockRecord = {
    schemaVersion: 1,
    pid: 9999999,
    acquiredAt: new Date(Date.now() - 3600_000).toISOString(),
    owner: "test-interrupted",
  };
  await writeFile(join(stateRoot, "writer.lock"), JSON.stringify(lockRecord, null, 2), "utf8");

  const status = await getOfflineStatus(stateRoot, catalog, lock);
  assert.equal(status.writerStatus, "needs-repair");
  assert.equal(status.needsRepair, true);

  const formatted = formatOfflineStatus(status);
  assert.match(formatted, /STATUS: NEEDS-REPAIR/u);
});

test("directory tree policies count is accurately reported", async (context) => {
  const { stateRoot, catalog, lock } = await fixtureSetup(context);
  const treeRegistry = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    trees: [
      { path: "/repo/one", mode: "off" },
      { path: "/repo/two", mode: "isolated" },
    ],
  };
  await writeFile(join(stateRoot, "trees.json"), JSON.stringify(treeRegistry, null, 2), "utf8");

  const status = await getOfflineStatus(stateRoot, catalog, lock);
  assert.equal(status.treePoliciesCount, 2);

  const formatted = formatOfflineStatus(status);
  assert.match(formatted, /Directory tree policies: 2/u);
});
