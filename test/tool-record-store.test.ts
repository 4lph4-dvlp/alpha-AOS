import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { mkdtemp, mkdir, rm, readFile, writeFile, symlink, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { planToolRecordOperation, withToolRecordSession, beginToolOperation, appendToolResult, finishToolOperation, runToolRecordOperation } from "../src/core/tool-record-store.js";
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
    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      assert.equal((await readToolRecordStore({ stateRoot, packageRoot: checkout })).operations[0]?.status, "in-progress");
    });
    const store = await readToolRecordStore({ stateRoot, packageRoot: checkout });
    const operations = (store as unknown as { operations?: Array<{ operationId: string; status: string }> }).operations;
    assert.equal(operations?.find((operation) => operation.operationId === "interrupted")?.status, "interrupted");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("equal timestamps sort by operation identity independent of creation order", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-order-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    for (const operationId of ["tie-a", "tie-b"]) {
      const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId, occurredAt: "2026-01-01T00:00:00Z", requests: [{ toolId: "gsd", selector: "1.2.3", exact: true }] });
      await withToolRecordSession(plan, async (session) => { await beginToolOperation(plan, session); });
    }
    const store = await readToolRecordStore({ stateRoot, packageRoot: checkout });
    assert.deepEqual(store.events.map((event) => event.operationId), ["tie-b", "tie-a"]);
    assert.deepEqual(store.operations.map((operation) => operation.status), ["interrupted", "interrupted"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("resuming an operation does not overwrite its existing journal", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-resume-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    const request = { toolId: "gsd", selector: "1.2.3", exact: true };
    const options = { stateRoot, packageRoot: checkout, operationId: "resume", occurredAt: "2026-01-01T00:00:00Z", requests: [request] };
    const first = await planToolRecordOperation(options);
    await withToolRecordSession(first, async (session) => { await beginToolOperation(first, session); });
    const path = join(stateRoot, "journal", "resume--event-0.json"), before = await readFile(path);
    const resumed = await planToolRecordOperation(options);
    await withToolRecordSession(resumed, async (session) => {
      assert.equal((await beginToolOperation(resumed, session)).idempotent, true);
      await appendToolResult(resumed, session, { toolId: "gsd", requested: request, resolved: null, installed: null, verified: null, evidence: [], outcome: "failed" });
      await finishToolOperation(resumed, session);
    });
    assert.deepEqual(await readFile(path), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("partial operations retain prior acceptance and retries preserve event bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-partial-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    const request = { toolId: "gsd", selector: "1.2.3", exact: true };
    const second = { toolId: "ecc", selector: "1.2.3", exact: true };
    const result: ToolResult = { toolId: "gsd", requested: request, resolved: { release: "1.2.3", artifact: "gsd-1.2.3", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "npm-registry", sourceUrl: "https://registry.npmjs.org/%40opengsd%2Fgsd-core" }, installed: { installationId: "install-1", version: "1.2.3", pathAlias: "home/gsd" }, verified: "proof-1", evidence: [{ proofId: "proof-1", subject: "install-1", target: "integration", method: "invocation", result: "pass", platform: "windows", architecture: "x64", harness: "codex" }], outcome: "succeeded" };
    const prior = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "prior", occurredAt: "2026-01-01T00:00:00Z", requests: [request] });
    const transition = { toolId: "gsd", installationId: "install-1", proofId: "proof-1", priorDigest: null };
    await withToolRecordSession(prior, async (session) => {
      await beginToolOperation(prior, session); await appendToolResult(prior, session, result);
      await finishToolOperation(prior, session, [transition]);
      const before = await readFile(prior.targets[2]!);
      assert.equal((await finishToolOperation(prior, session, [transition])).idempotent, true);
      assert.deepEqual(await readFile(prior.targets[2]!), before);
      assert.equal((await appendToolResult(prior, session, result)).idempotent, true);
      await assert.rejects(appendToolResult(prior, session, { ...result, outcome: "failed" }), /conflict/);
    });
    const accepted = (await readToolRecordStore({ stateRoot, packageRoot: checkout })).accepted?.["gsd/install-1"];
    assert.ok(accepted);
    const stale = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "stale", occurredAt: "2026-01-01T01:00:00Z", requests: [request] });
    await withToolRecordSession(stale, async (session) => {
      await beginToolOperation(stale, session); await appendToolResult(stale, session, result);
      await assert.rejects(finishToolOperation(stale, session, [transition]), /prior reference invalid/);
      await assert.rejects(access(stale.targets[2]!));
    });
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "partial", occurredAt: "2026-01-02T00:00:00Z", requests: [request, second] });
    const failure = await runToolRecordOperation(plan, async (item) => { if (item.toolId === "ecc") throw new Error("private-canary-credential"); return result; });
    assert.equal(failure.ok, false);
    const store = await readToolRecordStore({ stateRoot, packageRoot: checkout });
    assert.equal(store.accepted?.["gsd/install-1"], accepted);
    assert.equal(store.operations.find((item) => item.operationId === "partial")?.status, "partial");
    assert.equal(store.operations.find((item) => item.operationId === "stale")?.status, "interrupted");
    assert.equal(store.events.filter((event) => event.operationId === "stale").length, 2);
    assert.equal(store.events.filter((event) => event.operationId === "partial").length, 4);
    assert.doesNotMatch(JSON.stringify(store), /private-canary-credential/);
    const journalPath = join(stateRoot, "journal", "prior--event-2.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as Record<string, unknown>;
    journal.directorySyncSupported = false;
    await writeFile(journalPath, JSON.stringify(journal));
    assert.ok((await readToolRecordStore({ stateRoot, packageRoot: checkout })).diagnostics.includes("directory-sync-unsupported"));
    const human = execFileSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver"], { env: { ...process.env, HOME: join(root, "home"), USERPROFILE: join(root, "home"), LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: stateRoot }, encoding: "utf8" });
    assert.match(human, /directory-sync-unsupported/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("terminal rename before applied journal never advances acceptance", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-crash-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    const request = { toolId: "gsd", selector: "1.2.3", exact: true };
    const item: ToolResult = { toolId: "gsd", requested: request, resolved: { release: "1.2.3", artifact: "gsd-1.2.3", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "npm-registry", sourceUrl: "https://registry.npmjs.org/%40opengsd%2Fgsd-core" }, installed: { installationId: "install-1", version: "1.2.3", pathAlias: "home/gsd" }, verified: "proof-1", evidence: [{ proofId: "proof-1", subject: "install-1", target: "integration", method: "invocation", result: "pass", platform: "windows", architecture: "x64", harness: "codex" }], outcome: "succeeded" };
    const prior = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "prior", occurredAt: "2026-01-01T00:00:00Z", requests: [request] });
    await withToolRecordSession(prior, async (session) => { await beginToolOperation(prior, session); await appendToolResult(prior, session, item); await finishToolOperation(prior, session, [{ toolId: "gsd", installationId: "install-1", proofId: "proof-1", priorDigest: null }]); });
    const previous = (await readToolRecordStore({ stateRoot, packageRoot: checkout })).accepted?.["gsd/install-1"];
    assert.ok(previous);
    const script = `const m = await import(process.argv[1]); const x = JSON.parse(process.env.RECORD_FIXTURE); const p = await m.planToolRecordOperation({stateRoot:x.stateRoot,packageRoot:x.checkout,operationId:'crash',occurredAt:'2026-01-02T00:00:00Z',requests:[x.request]}); await m.withToolRecordSession(p, async s => { await m.beginToolOperation(p,s); await m.appendToolResult(p,s,x.item); await m.finishToolOperation(p,s,[{toolId:'gsd',installationId:'install-1',proofId:'proof-1',priorDigest:x.previous}], () => 'after-target-rename'); });`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script, pathToFileURL(resolve("dist/src/core/tool-record-store.js")).href], { env: { ...process.env, RECORD_FIXTURE: JSON.stringify({ stateRoot, checkout, request, item, previous }) }, encoding: "utf8", timeout: 30000 });
    assert.equal(child.status, 70, child.stderr);
    const store = await readToolRecordStore({ stateRoot, packageRoot: checkout });
    assert.equal(store.accepted?.["gsd/install-1"], previous);
    assert.equal(store.operations.find((operation) => operation.operationId === "crash")?.status, "unknown");
    assert.ok(store.diagnostics.includes("terminal-commit-unverified"));
    assert.ok(store.events.some((event) => event.operationId === "crash" && event.kind === "finished"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
