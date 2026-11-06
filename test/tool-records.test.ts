import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, rename, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { readToolRecordStore } from "../src/core/tool-records.js";
import { appendToolResult, beginToolOperation, finishToolOperation, planToolRecordOperation, withToolRecordSession } from "../src/core/tool-record-store.js";

async function writeAcceptedOperation(stateRoot: string, operationId: string, occurredAt: string, priorDigest: string | null): Promise<string> {
  const dir = join(stateRoot, "tool-records", "v1", "operations", operationId);
  await mkdir(dir, { recursive: true });
  await mkdir(join(stateRoot, "journal"), { recursive: true });
  const request = { toolId: "gsd", selector: "1.2.3", exact: true };
  const item = { toolId: "gsd", requested: request, resolved: { release: "1.2.3", artifact: "gsd-1.2.3", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "npm-registry", sourceUrl: "https://registry.npmjs.org/%40opengsd%2Fgsd-core" }, installed: { installationId: "installation-1", version: "1.2.3", pathAlias: "home/gsd" }, verified: "proof-1", evidence: [{ proofId: "proof-1", subject: "installation-1", target: "integration", method: "invocation", result: "pass", platform: "windows", architecture: "x64", harness: "codex" }], outcome: "succeeded" };
  const common = { schemaVersion: 1, operationId, occurredAt };
  const start = { ...common, eventId: `${operationId}-start`, sequence: 0, kind: "started", requests: [request] };
  const tool = { ...common, eventId: `${operationId}-tool`, sequence: 1, kind: "tool-result", result: item };
  const finish = { ...common, eventId: `${operationId}-finish`, sequence: 2, kind: "finished", results: [item], outcome: "succeeded", acceptedTransitions: [{ toolId: "gsd", installationId: "installation-1", proofId: "proof-1", priorDigest }] };
  const finishPath = join(dir, `2-${operationId}-finish.json`), bytes = JSON.stringify(finish), digest = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(dir, `0-${operationId}-start.json`), JSON.stringify(start));
  await writeFile(join(dir, `1-${operationId}-tool.json`), JSON.stringify(tool));
  await writeFile(finishPath, bytes);
  await writeFile(join(stateRoot, "journal", `${operationId}.json`), JSON.stringify({ schemaVersion: 1, id: operationId, createdAt: occurredAt, status: "applied", allowedRoots: [stateRoot], files: [{ target: finishPath, afterHash: digest, beforeHash: null, existed: false, snapshot: null, proofDigest: "b".repeat(64) }] }));
  return digest;
}

test("acceptance follows digest links across equal timestamps and clock rollback", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-causal-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout");
    await mkdir(packageRoot);
    const first = await writeAcceptedOperation(stateRoot, "z", "2026-01-02T00:00:00Z", null);
    assert.equal(await writeAcceptedOperation(stateRoot, "z", "2026-01-02T00:00:00Z", null), first);
    const second = await writeAcceptedOperation(stateRoot, "a", "2026-01-02T00:00:00Z", first);
    let store = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(store.accepted?.["gsd/installation-1"], second);
    const third = await writeAcceptedOperation(stateRoot, "older-clock", "2026-01-01T00:00:00Z", second);
    store = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(store.accepted?.["gsd/installation-1"], third);
    assert.deepEqual(store.events.filter((event) => event.kind === "finished").map((event) => event.operationId), ["z", "a", "older-clock"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ambiguous forks and missing predecessors cannot advance accepted references", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-fork-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout");
    await mkdir(packageRoot);
    const first = await writeAcceptedOperation(stateRoot, "root", "2026-01-01T00:00:00Z", null);
    await writeAcceptedOperation(stateRoot, "missing", "2026-01-02T00:00:00Z", "f".repeat(64));
    let store = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(store.accepted?.["gsd/installation-1"], first);
    assert.ok(store.diagnostics.includes("accepted-chain-unlinked"));
    await writeAcceptedOperation(stateRoot, "branch-a", "2026-01-03T00:00:00Z", first);
    await writeAcceptedOperation(stateRoot, "branch-b", "2026-01-04T00:00:00Z", first);
    store = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(store.accepted?.["gsd/installation-1"], first);
    assert.ok(store.diagnostics.includes("accepted-chain-ambiguous"));
    const existing = store.events.find((event) => event.operationId === "root" && event.kind === "tool-result")?.result;
    assert.ok(existing);
    const plan = await planToolRecordOperation({ stateRoot, packageRoot, operationId: "blocked-writer", occurredAt: "2026-01-05T00:00:00Z", requests: [existing.requested] });
    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      await appendToolResult(plan, session, existing);
      await assert.rejects(finishToolOperation(plan, session, [{ toolId: "gsd", installationId: "installation-1", proofId: "proof-1", priorDigest: first }]), /history is ambiguous or unlinked/);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a multi-tool transition is withheld for every identity when one chain forks", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-atomic-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout");
    await mkdir(packageRoot);
    const prior = await writeAcceptedOperation(stateRoot, "root", "2026-01-01T00:00:00Z", null);
    await writeAcceptedOperation(stateRoot, "other", "2026-01-02T00:00:00Z", prior);
    const store = await readToolRecordStore({ stateRoot, packageRoot });
    const gsd = store.events.find((event) => event.operationId === "root" && event.kind === "tool-result")!.result!;
    const eccRequest = { toolId: "ecc", selector: "1.2.3", exact: true };
    const ecc = { ...gsd, toolId: "ecc", requested: eccRequest, resolved: { ...gsd.resolved!, sourceUrl: "https://registry.npmjs.org/ecc-universal" }, installed: { ...gsd.installed!, installationId: "ecc-1" }, evidence: [{ ...gsd.evidence[0]!, subject: "ecc-1" }] };
    const operationId = "multi", occurredAt = "2026-01-03T00:00:00Z", dir = join(stateRoot, "tool-records", "v1", "operations", operationId);
    await mkdir(dir, { recursive: true });
    const common = { schemaVersion: 1, operationId, occurredAt };
    const start = { ...common, eventId: "multi-start", sequence: 0, kind: "started", requests: [gsd.requested, eccRequest] };
    const resultA = { ...common, eventId: "multi-a", sequence: 1, kind: "tool-result", result: gsd };
    const resultB = { ...common, eventId: "multi-b", sequence: 2, kind: "tool-result", result: ecc };
    const terminal = { ...common, eventId: "multi-finish", sequence: 3, kind: "finished", results: [gsd, ecc], outcome: "succeeded", acceptedTransitions: [{ toolId: "gsd", installationId: "installation-1", proofId: "proof-1", priorDigest: prior }, { toolId: "ecc", installationId: "ecc-1", proofId: "proof-1", priorDigest: null }] };
    const target = join(dir, "3-multi-finish.json"), bytes = JSON.stringify(terminal), digest = createHash("sha256").update(bytes).digest("hex");
    for (const [name, value] of [["0-multi-start.json", start], ["1-multi-a.json", resultA], ["2-multi-b.json", resultB], ["3-multi-finish.json", terminal]] as const) await writeFile(join(dir, name), JSON.stringify(value));
    await writeFile(join(stateRoot, "journal", "multi.json"), JSON.stringify({ schemaVersion: 1, id: "multi", createdAt: occurredAt, status: "applied", allowedRoots: [stateRoot], files: [{ target, afterHash: digest, beforeHash: null, existed: false, snapshot: null, proofDigest: "b".repeat(64) }] }));
    const after = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(after.accepted?.["gsd/installation-1"], prior);
    assert.equal(after.accepted?.["ecc/ecc-1"], undefined);
    assert.ok(after.diagnostics.includes("accepted-chain-atomicity"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("empty existing record store has current empty history", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-records-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout");
    await mkdir(packageRoot);
    await mkdir(join(stateRoot, "tool-records", "v1", "operations"), { recursive: true });
    const result: { status: string; events: unknown[]; accepted: unknown } = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(result.status, "current");
    assert.deepEqual(result.events, []);
    assert.equal(result.accepted, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("record roots refuse aliases and ancestor replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-boundary-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout"), alias = join(root, "alias");
    await mkdir(packageRoot); await symlink(packageRoot, alias, process.platform === "win32" ? "junction" : "dir");
    assert.equal((await readToolRecordStore({ stateRoot: join(alias, "state"), packageRoot })).status, "inaccessible");
    const dir = join(stateRoot, "tool-records", "v1", "operations", "operation-1"); await mkdir(dir, { recursive: true });
    const event = { schemaVersion: 1, eventId: "event-1", operationId: "operation-1", sequence: 0, occurredAt: "2026-01-01T00:00:00Z", kind: "started", requests: [{ toolId: "gsd", selector: "1.2.3", exact: true }] };
    await writeFile(join(dir, "0-event-1.json"), JSON.stringify(event));
    const read = await readToolRecordStore({ stateRoot, packageRoot, onAfterRead: async () => { await rename(dir, `${dir}-old`); await mkdir(dir); } });
    assert.equal(read.status, "inaccessible"); assert.equal(read.events.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("acceptance requires matching proof and applied journal", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-records-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout"), operationId = "op-1";
    const dir = join(stateRoot, "tool-records", "v1", "operations", operationId);
    await mkdir(packageRoot); await mkdir(dir, { recursive: true });
    const request = { toolId: "gsd", selector: "1.2.3", exact: true };
    const item = { toolId: "gsd", requested: request, resolved: { release: "1.2.3", artifact: "gsd-1.2.3", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "npm-registry", sourceUrl: "https://registry.npmjs.org/%40opengsd%2Fgsd-core" }, installed: { installationId: "installation-1", version: "1.2.3", pathAlias: "home/gsd" }, verified: "proof-1", evidence: [{ proofId: "proof-1", subject: "installation-1", target: "integration", method: "invocation", result: "pass", platform: "windows", architecture: "x64", harness: "codex" }], outcome: "succeeded" };
    const common = { schemaVersion: 1, operationId, occurredAt: "2026-01-01T00:00:00Z" };
    const start = { ...common, eventId: "start", sequence: 0, kind: "started", requests: [request] };
    const tool = { ...common, eventId: "tool", sequence: 1, kind: "tool-result", result: item };
    const finish = { ...common, eventId: "finish", sequence: 2, kind: "finished", results: [item], outcome: "succeeded", acceptedTransitions: [{ toolId: "gsd", installationId: "installation-1", proofId: "proof-1", priorDigest: null }] };
    const finishPath = join(dir, "2-finish.json"), bytes = JSON.stringify(finish), digest = createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(dir, "0-start.json"), JSON.stringify(start)); await writeFile(join(dir, "1-tool.json"), JSON.stringify(tool)); await writeFile(finishPath, bytes);
    let read = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(read.status, "current"); assert.equal(read.accepted, null); assert.deepEqual(read.verifiedEventDigests, {});
    const journalDir = join(stateRoot, "journal"); await mkdir(journalDir);
    await writeFile(join(journalDir, "tx.json"), JSON.stringify({ schemaVersion: 1, id: "tx", createdAt: "2026-01-01T00:00:00Z", status: "applied", allowedRoots: [stateRoot], files: [{ target: finishPath, afterHash: digest, beforeHash: null, existed: false, snapshot: null, proofDigest: "b".repeat(64) }] }));
    read = await readToolRecordStore({ stateRoot, packageRoot }); assert.equal(read.accepted?.["gsd/installation-1"], digest);
    assert.equal(read.verifiedEventDigests?.["op-1:2:finish"], digest);
    const poisoned = { ...tool, result: { ...item, resolved: { ...item.resolved, sourceUrl: "https://user:secret@registry.npmjs.org/gsd?token=secret" } } };
    await writeFile(join(dir, "1-tool.json"), JSON.stringify(poisoned));
    read = await readToolRecordStore({ stateRoot, packageRoot }); assert.equal(read.status, "invalid");
    assert.equal(read.accepted, null); assert.deepEqual(read.verifiedEventDigests, {}); assert.equal(JSON.stringify(read).includes("secret"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("record reader validates events and version boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-records-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout");
    const dir = join(stateRoot, "tool-records", "v1", "operations", "operation-1");
    await mkdir(packageRoot); await mkdir(dir, { recursive: true });
    const path = join(dir, "0-event-1.json");
    const event = { schemaVersion: 1, eventId: "event-1", operationId: "operation-1", sequence: 0, occurredAt: "2026-01-01T00:00:00Z", kind: "started", requests: [{ toolId: "gsd", selector: "1.2.3", exact: true }] };
    await writeFile(path, JSON.stringify(event));
    let read = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(read.status, "current"); assert.equal(read.events.length, 1);
    await writeFile(path, JSON.stringify({ ...event, requests: [] }));
    read = await readToolRecordStore({ stateRoot, packageRoot }); assert.equal(read.status, "invalid");
    await writeFile(path, JSON.stringify({ ...event, schemaVersion: 2 }));
    read = await readToolRecordStore({ stateRoot, packageRoot }); assert.equal(read.status, "unknown-newer");
    await writeFile(path, JSON.stringify({ ...event, schemaVersion: 0 }));
    read = await readToolRecordStore({ stateRoot, packageRoot }); assert.equal(read.status, "unsupported-old");
    await writeFile(path, JSON.stringify({ ...event, "x-secret": { token: "canary" } }));
    read = await readToolRecordStore({ stateRoot, packageRoot }); assert.equal(read.status, "invalid");
    assert.equal(JSON.stringify(read).includes("canary"), false);
    await writeFile(path, JSON.stringify(event));
    await writeFile(join(dir, "0-event-2.json"), JSON.stringify({ ...event, eventId: "event-2" }));
    read = await readToolRecordStore({ stateRoot, packageRoot }); assert.equal(read.status, "invalid");
    assert.ok(read.diagnostics.includes("event-conflict"));
    assert.equal((await readToolRecordStore({ stateRoot: join(packageRoot, "state"), packageRoot })).status, "inaccessible");
  } finally { await rm(root, { recursive: true, force: true }); }
});
