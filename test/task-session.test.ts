import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFixture } from "./helpers/task-fixture.js";
import { createTaskSession, appendTaskSessionEvent, readTaskSessionEvents, validateTaskSessionBinding } from "../src/core/task-session.js";

test("phase26 store uses one run location and refuses unknown legacy evidence", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "9".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  assert.equal(taskSessionRoot(fixture.stateRoot, binding), taskSessionRoot(fixture.stateRoot, { ...binding, revision: 2, originatingSessionId: "other" }));
  const { mkdir, writeFile, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const root = taskSessionRoot(fixture.stateRoot, binding);
  await mkdir(root, { recursive: true });
  const legacy = join(root, "events.json");
  await writeFile(legacy, "unknown evidence");
  await assert.rejects(createTaskSession(fixture.stateRoot, binding));
  assert.equal(await readFile(legacy, "utf8"), "unknown evidence");
});

test("phase26 session rejects cross binding and conflicting replay", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "a".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  await assert.rejects(createTaskSession(fixture.stateRoot, { ...binding, originatingSessionId: "other-conversation" }), /binding/i);
  const event = { sourceEventId: "dispatch-one:start", observedAt: "2026-10-31T00:00:00.000Z", kind: "dispatch-start",
    workflow: null, step: null, role: "controller", configuredModel: "fixture", configuredEffort: "high", observedModel: null,
    observedEffort: null, outcome: "running", processState: null, recordedReason: null, evidenceRefs: [] } as const;
  await appendTaskSessionEvent(fixture.stateRoot, binding, event);
  await appendTaskSessionEvent(fixture.stateRoot, binding, event);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).events.length, 1);
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, outcome: "failed" }), /conflict/i);
  const other = { ...binding, revision: 2 };
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, other));
  assert.throws(() => validateTaskSessionBinding({ ...binding, originatingSessionId: "../other" }));
});

import { meteredTaskDispatch } from "../src/core/task-runtime.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";

test("phase26 session receives real metered dispatch observations", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: "b".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const wrongRevision = { ...binding, revision: 2 };
  await assert.rejects(createTaskSession(fixture.stateRoot, wrongRevision), /binding/i);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest: binding.contractDigest,
    runId: binding.runId, role: "controller", invoke: async () => ({ sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true }) });
  const { events } = await readTaskSessionEvents(fixture.stateRoot, binding);
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, wrongRevision));
  assert.deepEqual(events.map((event) => event.kind), ["dispatch-start", "dispatch-end"]);
  assert.deepEqual(events.map((event) => event.outcome), ["running", "completed"]);
  assert.equal((events[1] as unknown as { processState: string }).processState, "confirmed-closed");
});

test("phase26 session refuses credentials and preserves events after restart", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "d".repeat(64), revision: 1,
    runId: "run-one", host: "agy", originatingSessionId: "conversation-one" });
  assert.equal(binding.host, "antigravity");
  await createTaskSession(fixture.stateRoot, binding);
  const event = { sourceEventId: "decision-one", observedAt: "2026-10-31T00:00:00.000Z", kind: "decision",
    workflow: "quick", step: null, role: null, configuredModel: null, configuredEffort: null, observedModel: null,
    observedEffort: null, outcome: null, processState: null, recordedReason: "Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJK", evidenceRefs: [] };
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, event), /sensitive/i);
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, recordedReason: "password=private-value" }), /sensitive/i);
  await assert.rejects(appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, recordedReason: "read /opt/private/document" }), /sensitive/i);
  await appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, recordedReason: "recorded" });
  await createTaskSession(fixture.stateRoot, binding);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding, 0)).events[0]?.recordedReason, "recorded");
});







test("phase26 replay marks an evicted cursor gap and never duplicates a source event", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "e".repeat(64), revision: 1,
    runId: "run-one", host: "pi", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  for (let n = 0; n < 251; n++) await appendTaskSessionEvent(fixture.stateRoot, binding, {
    sourceEventId: `event-${n}`, observedAt: "2026-10-31T00:00:00.000Z", kind: "decision", workflow: null, step: null,
    role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: null, processState: null, recordedReason: null, evidenceRefs: [],
  });
  const replay = await readTaskSessionEvents(fixture.stateRoot, binding, 0);
  assert.equal(replay.gap, true);
  assert.equal(replay.events.length, 250);
  assert.equal(replay.events[0]?.sequence, 2);
  assert.equal(replay.cursor, 251);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding, 250)).events[0]?.sequence, 251);
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, binding, 252));
});

test("phase26 session refuses a replaced session directory", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "f".repeat(64), revision: 1,
    runId: "run-one", host: "hermes", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  const { rename, symlink } = await import("node:fs/promises");
  const root = taskSessionRoot(fixture.stateRoot, binding);
  await rename(root, `${root}-original`);
  await symlink(`${root}-original`, root, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, binding));
});

test("phase26 native transaction crash recovers and retry preserves committed identity", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "8".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  const { join } = await import("node:path");
  const { spawn } = await import("node:child_process");
  const path = join(taskSessionRoot(fixture.stateRoot, binding), "events.sqlite");
  const child = spawn(process.execPath, ["-e", "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO events(sequence,source,input) VALUES(1,?,?)').run('uncommitted','{}');console.log('ready');setInterval(()=>{},1000)", path], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => { child.stdout.once("data", () => resolve()); child.once("error", reject); child.once("exit", () => reject(new Error("child exited before ready"))); });
  child.kill();
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).events.length, 0);
  const event = { sourceEventId: "event-one", observedAt: "2026-10-31T00:00:00.000Z", kind: "decision", workflow: null, step: null,
    role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: null, processState: null, recordedReason: "recorded", evidenceRefs: [] } as const;
  assert.equal((await appendTaskSessionEvent(fixture.stateRoot, binding, event)).sequence, 1);
  assert.equal((await appendTaskSessionEvent(fixture.stateRoot, binding, event)).sequence, 1);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).events.length, 1);
  const committed = { ...event, sourceEventId: "committed-before-return" };
  const committedChild = spawn(process.execPath, ["-e", "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO events(sequence,source,input) VALUES(2,?,?)').run('committed-before-return',process.argv[2]);db.exec('COMMIT');console.log('ready');setInterval(()=>{},1000)", path, JSON.stringify(committed)], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => { committedChild.stdout.once("data", () => resolve()); committedChild.once("error", reject); committedChild.once("exit", () => reject(new Error("child exited before commit"))); });
  committedChild.kill();
  await new Promise<void>((resolve) => committedChild.once("close", () => resolve()));
  assert.equal((await appendTaskSessionEvent(fixture.stateRoot, binding, committed)).sequence, 2);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).events.length, 2);
});

test("phase26 refuses hostile sqlite sidecar without touching target", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "7".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  const { writeFile, readFile, symlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const target = join(fixture.stateRoot, "sentinel");
  await writeFile(target, "untouched");
  try { await symlink(target, join(taskSessionRoot(fixture.stateRoot, binding), "events.sqlite-journal"), "file"); }
  catch (error) { if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") { t.skip("file symlinks unavailable"); return; } throw error; }
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, binding));
  assert.equal(await readFile(target, "utf8"), "untouched");
});

test("phase26 sqlite refuses a non-file sidecar and reports finite contention", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "6".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  const { mkdir, rmdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { spawn } = await import("node:child_process");
  const path = join(taskSessionRoot(fixture.stateRoot, binding), "events.sqlite");
  await mkdir(path + "-journal");
  await assert.rejects(readTaskSessionEvents(fixture.stateRoot, binding));
  await rmdir(path + "-journal");
  const child = spawn(process.execPath, ["-e", "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN EXCLUSIVE');console.log('ready');setInterval(()=>{},1000)", path], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => { child.stdout.once("data", () => resolve()); child.once("error", reject); child.once("exit", () => reject(new Error("child exited before ready"))); });
  try {
    const started = Date.now();
    await assert.rejects(readTaskSessionEvents(fixture.stateRoot, binding));
    assert.ok(Date.now() - started < 5000);
  } finally {
    child.kill();
    await new Promise<void>((resolve) => child.once("close", () => resolve()));
  }
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).cursor, 0);
});

test("phase26 separate publishers serialize duplicate and conflicting identities", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "5".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const event = { sourceEventId: "same", observedAt: "2026-10-31T00:00:00.000Z", kind: "decision", workflow: null, step: null,
    role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: null, processState: null, recordedReason: "recorded", evidenceRefs: [] } as const;
  const { spawn } = await import("node:child_process");
  const moduleUrl = new URL("../src/core/task-session.js", import.meta.url).href;
  const script = "import(process.argv[1]).then(m=>m.appendTaskSessionEvent(process.argv[2],JSON.parse(process.argv[3]),JSON.parse(process.argv[4]))).then(x=>console.log(x.sequence)).catch(e=>{console.error(e.message);process.exitCode=1})";
  const run = (value: import("../src/core/task-session.js").TaskSessionEventInput) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", script, moduleUrl, fixture.stateRoot, JSON.stringify(binding), JSON.stringify(value)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", (part) => { output += String(part); }); child.stderr.on("data", (part) => { output += String(part); });
    child.once("error", reject); child.once("close", (code) => resolve({ code, output }));
  });
  const results = await Promise.all([run(event), run(event)]);
  assert.deepEqual(results.map((result) => result.code), [0, 0]);
  assert.ok(results.every((result) => /1/.test(result.output)));
  assert.equal((await run({ ...event, recordedReason: "different" })).code, 1);
  assert.equal((await run({ ...event, recordedReason: "recorded" })).code, 0);
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).events.length, 1);
});

