import assert from "node:assert/strict";
import test from "node:test";
import { createTaskFixture, inventorySummaryContract } from "./helpers/task-fixture.js";
import { createTaskSession, validateTaskSessionBinding } from "../src/core/task-session.js";
import { startTaskProgressPanel } from "../src/core/task-progress-panel.js";
import { meteredTaskDispatch } from "../src/core/task-runtime.js";

async function setup(t: import("node:test").TestContext) {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: "c".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const panel = await startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: Date.now() + 30000 });
  t.after(() => panel.dispose());
  const launch = new URL(panel.url);
  const token = launch.hash.slice(1);
  const origin = launch.origin;
  const exchange = await fetch(`${origin}/session`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${token}` } });
  assert.equal(exchange.status, 200);
  const session = await exchange.json() as { token: string };
  return { fixture, binding, panel, origin, token, session: session.token };
}

test("phase26 panel follows a real metered dispatch", async (t) => {
  const { fixture, binding, origin, session } = await setup(t);
  await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest: binding.contractDigest,
    runId: binding.runId, role: "controller", invoke: async () => ({ sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true }) });
  const snapshot = await fetch(`${origin}/snapshot`, { headers: { Authorization: `Bearer ${session}` } });
  assert.equal(snapshot.status, 200);
  const data = await snapshot.json() as { events: { kind: string }[]; cursor: number };
  assert.deepEqual(data.events.map((event) => event.kind), ["dispatch-start", "dispatch-end"]);
  const abort = new AbortController();
  const stream = await fetch(`${origin}/events?cursor=0`, { headers: { Authorization: `Bearer ${session}` }, signal: abort.signal });
  const frame = await stream.body!.getReader().read();
  assert.match(new TextDecoder().decode(frame.value), /dispatch-start/);
  abort.abort();
});

test("phase26 panel rejects hostile HTTP and bounds clients", async (t) => {
  const { origin, token, session } = await setup(t);
  assert.equal((await fetch(`${origin}/snapshot`)).status, 401);
  assert.equal((await fetch(`${origin}/snapshot`, { headers: { Authorization: `Bearer ${session}`, Origin: "https://evil.invalid" } })).status, 403);
  assert.equal((await fetch(`${origin}/session`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${token}` } })).status, 401);
  assert.equal((await fetch(`${origin}/exec`, { method: "POST", headers: { Authorization: `Bearer ${session}` } })).status, 404);
  const page = await fetch(origin);
  assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.match(await page.text(), /오토파일럿 진행 상황/);
});

test("phase26 panel assets are parseable and do not embed credentials", async (t) => {
  const { origin, token, session } = await setup(t);
  const script = await (await fetch(`${origin}/panel.js`)).text();
  const { Script } = await import("node:vm");
  assert.doesNotThrow(() => new Script(script));
  assert.ok(script.indexOf("history.replaceState") < script.indexOf("fetch("));
  assert.equal(script.includes(token), false);
  assert.equal(script.includes(session), false);
  assert.doesNotMatch(script, /innerHTML|localStorage|EventSource/);
});


test("phase26 live SSE reports dispatch start before held dispatch finishes", async (t) => {
  const { fixture, binding, origin, session } = await setup(t);
  const abort = new AbortController();
  const streamPromise = fetch(`${origin}/events?cursor=0`, { headers: { Authorization: `Bearer ${session}` }, signal: abort.signal });
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const work = meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest: binding.contractDigest,
    runId: binding.runId, role: "controller", invoke: async () => { await held; return { sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true }; } });
  const stream = await streamPromise;
  const reader = stream.body!.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /dispatch-start/);
  release();
  await work;
  const last = await reader.read();
  assert.match(new TextDecoder().decode(last.value), /dispatch-end/);
  abort.abort();
});

test("phase26 panel rejects duplicate authority and foreign fetch metadata", async (t) => {
  const { origin, session } = await setup(t);
  const { request } = await import("node:http");
  const url = new URL(origin);
  const status = await new Promise<number>((resolve, reject) => {
    const req = request({ hostname: url.hostname, port: Number(url.port), path: "/snapshot", method: "GET",
      headers: ["Host", url.host, "Host", url.host, "Authorization", `Bearer ${session}`] }, (response) => { response.resume(); response.on("end", () => resolve(response.statusCode!)); });
    req.on("error", reject); req.end();
  });
  assert.equal(status, 403);
  assert.equal((await fetch(`${origin}/snapshot`, { headers: { Authorization: `Bearer ${session}`, "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal((await fetch(`${origin}/snapshot`, { headers: { Authorization: `Bearer ${session}`, Origin: "null" } })).status, 403);
});

test("phase26 panel bounds concurrent streams and disposes without changing task data", async (t) => {
  const { origin, session, panel, fixture, binding } = await setup(t);
  const controller = new AbortController();
  const streams = await Promise.all(Array.from({ length: 4 }, () => fetch(`${origin}/events?cursor=0`, {
    headers: { Authorization: `Bearer ${session}` }, signal: controller.signal,
  })));
  assert.deepEqual(streams.map((response) => response.status), [200, 200, 200, 200]);
  const extra = await fetch(`${origin}/events?cursor=0`, { headers: { Authorization: `Bearer ${session}` } });
  assert.equal(extra.status, 400);
  controller.abort();
  await panel.dispose();
  await assert.rejects(fetch(`${origin}/snapshot`, { headers: { Authorization: `Bearer ${session}` } }));
  const { readTaskSessionEvents } = await import("../src/core/task-session.js");
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).cursor, 0);
});

test("phase26 observer abort closes only its listener", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "9".repeat(64), revision: 1,
    runId: "run-one", host: "claude", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const signal = new AbortController();
  const panel = await startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: Date.now() + 30000, signal: signal.signal });
  signal.abort(); await panel.dispose();
  await assert.rejects(fetch(new URL(panel.url).origin));
  const { readTaskSessionEvents } = await import("../src/core/task-session.js");
  assert.equal((await readTaskSessionEvents(fixture.stateRoot, binding)).cursor, 0);
});

test("phase26 panel accepts finite multi-hour observation and rejects over 24 hours", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "9".repeat(64), revision: 1,
    runId: "run-one", host: "claude", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const panel = await startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: Date.now() + 4 * 60 * 60_000 }).catch(() => null);
  assert.ok(panel, "a four-hour observation deadline must be accepted");
  await panel.dispose();
  await assert.rejects(startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: Date.now() + 25 * 60 * 60_000 }), /deadline/);
});

test("phase26 failed observer publication does not interrupt a dispatch", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "inventory-summary", contractDigest: "c".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const { mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { taskSessionRoot } = await import("../src/core/task-session.js");
  await mkdir(join(taskSessionRoot(fixture.stateRoot, binding), "events.sqlite-journal"));
  let invoked = false;
  const result = await meteredTaskDispatch({ stateRoot: fixture.stateRoot, contract: inventorySummaryContract(fixture.projectRoot), digest: binding.contractDigest,
    runId: binding.runId, role: "controller", invoke: async () => { invoked = true; return { sessionId: null, processCode: "ok", exitCode: 0, terminal: "completed", closeConfirmed: true }; } });
  assert.equal(invoked, true);
  assert.equal(result.terminal, "completed");
  const { readTaskDispatches } = await import("../src/core/task-runtime.js");
  assert.equal((await readTaskDispatches(fixture.stateRoot, binding.contractDigest))[0]?.status, "completed");
});
