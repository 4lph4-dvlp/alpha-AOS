import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { mkdtemp, mkdir, rm, readFile, writeFile, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { planToolRecordOperation, withToolRecordSession, beginToolOperation, appendToolResult, finishToolOperation } from "../src/core/tool-record-store.js";
import { readToolRecordStore, type ToolResult } from "../src/core/tool-records.js";

test("explicit tool record writer API is available", async () => {
  const path = new URL("../src/core/tool-record-store.js", import.meta.url);
  const available = await access(path).then(() => true, () => false);
  assert.equal(available, true, "the explicit record writer must be available");
});

test("writer persists a tool operation visible to the production CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-writer-"));
  try {
    const stateRoot = join(root, "state"), checkout = join(root, "checkout");
    await mkdir(checkout);
    const request = { toolId: "cua-driver", selector: "1.2.3", exact: true };
    const result: ToolResult = { toolId: request.toolId, requested: request, resolved: { release: "1.2.3", artifact: "driver-1.2.3", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "driver-release", sourceUrl: "https://github.com/trycua/cua/releases/download/v1.2.3/driver.zip" }, installed: { installationId: "driver-1", version: "1.2.3", pathAlias: "home/driver" }, verified: null, evidence: [], outcome: "succeeded" };
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "op-1", occurredAt: "2026-01-01T00:00:00Z", requests: [request] });
    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      await appendToolResult(plan, session, result);
      await finishToolOperation(plan, session);
    });
    const records = await readToolRecordStore({ stateRoot, packageRoot: checkout });
    assert.equal(records.events.length, 3);
    const output = execFileSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver", "--json"], { env: { ...process.env, HOME: join(root, "home"), USERPROFILE: join(root, "home"), LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: stateRoot }, encoding: "utf8" });
    assert.match(output, /driver-1\.2\.3/);
    assert.match(output, /github\.com\/trycua\/cua/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unsafe roots and replaced locks refuse writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-boundary-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    const request = { toolId: "gsd", selector: "1.2.3", exact: true };
    const options = { stateRoot, packageRoot: checkout, operationId: "op-1", occurredAt: "2026-01-01T00:00:00Z", requests: [request] };
    await assert.rejects(planToolRecordOperation({ ...options, stateRoot: join(checkout, "state") }));
    await assert.rejects(access(join(checkout, "state")));
    await symlink(checkout, join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(planToolRecordOperation({ ...options, stateRoot: join(root, "alias", "state") }));
    await assert.rejects(planToolRecordOperation({ ...options, operationId: "../escape" }));
    await assert.rejects(planToolRecordOperation({ ...options, requests: [{ ...request, selector: "secret=credential" }] }));
    const plan = await planToolRecordOperation(options);
    await withToolRecordSession(plan, async (session) => {
      await withToolRecordSession(plan, async (nested) => assert.equal(nested, session), session);
      await assert.rejects(withToolRecordSession(plan, async () => undefined));
      const lockPath = join(stateRoot, "writer.lock");
      const lock = JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>;
      lock.token = "replaced";
      await writeFile(lockPath, JSON.stringify(lock));
      await assert.rejects(beginToolOperation(plan, session), /ownership lost/);
      await assert.rejects(access(plan.targets[0]!));
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("checkout ancestor replacement is rejected before lock creation", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-swap-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "swap", occurredAt: "2026-01-01T00:00:00Z", requests: [{ toolId: "gsd", selector: "1.2.3", exact: true }] });
    await rename(checkout, `${checkout}-old`);
    await mkdir(checkout);
    await assert.rejects(withToolRecordSession(plan, async () => undefined));
    await assert.rejects(access(stateRoot));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("reader reports a started operation as interrupted after the writer closes", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-interrupted-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "interrupted", occurredAt: "2026-01-01T00:00:00Z", requests: [{ toolId: "gsd", selector: "1.2.3", exact: true }] });
    await withToolRecordSession(plan, async (session) => { await beginToolOperation(plan, session); });
    const store = await readToolRecordStore({ stateRoot, packageRoot: checkout });
    const operations = (store as unknown as { operations?: Array<{ operationId: string; status: string }> }).operations;
    assert.equal(operations?.find((operation) => operation.operationId === "interrupted")?.status, "interrupted");
  } finally { await rm(root, { recursive: true, force: true }); }
});
