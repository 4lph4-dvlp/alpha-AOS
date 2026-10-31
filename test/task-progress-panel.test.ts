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
  const data = await snapshot.json() as { events: { kind: string }[]; cursor: number; capabilities: { host: string; bound: boolean; delivery: string; nativeUi: string; nativeSessionId: string | null }[] };
  assert.deepEqual(data.events.map((event) => event.kind), ["dispatch-start", "dispatch-end"]);
  assert.deepEqual(data.capabilities.map((entry) => entry.host), ["claude", "codex", "antigravity", "pi", "hermes"]);
  assert.deepEqual(data.capabilities.filter((entry) => entry.bound).map((entry) => entry.host), ["codex"]);
  assert.ok(data.capabilities.every((entry) => entry.delivery === "disabled" && entry.nativeUi === "unverified" && entry.nativeSessionId === null));
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

test("phase26 panel exchange rejects oversized bodies and limits invalid authentication", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "9".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const panel = await startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: Date.now() + 30000 });
  t.after(() => panel.dispose());
  const url = new URL(panel.url), origin = url.origin;
  const oversized = await fetch(`${origin}/session`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${url.hash.slice(1)}` }, body: "x".repeat(4097) });
  assert.equal(oversized.status, 413);
  const valid = await fetch(`${origin}/session`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${url.hash.slice(1)}` } });
  assert.equal(valid.status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await fetch(`${origin}/snapshot`)).status, 401);
  assert.equal((await fetch(`${origin}/snapshot`)).status, 429);
});

test("phase26 SSE retains consecutive commits while observation is active", { timeout: 30000 }, async (t) => {
  const { fixture, binding, origin, session } = await setup(t);
  const { appendTaskSessionEvent } = await import("../src/core/task-session.js");
  const signal = AbortSignal.timeout(20000);
  const response = await fetch(`${origin}/events?cursor=0`, { headers: { Authorization: `Bearer ${session}` }, signal });
  const reader = response.body!.getReader();
  const collected = (async () => {
    let text = "";
    while (!text.includes('"sequence":3')) {
      const part = await reader.read();
      if (part.done) break;
      text += new TextDecoder().decode(part.value);
    }
    return text;
  })();
  const event = { observedAt: "2026-10-31T00:00:00.000Z", kind: "dispatch-start", workflow: null, step: null,
    role: "controller", configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: "running", processState: null, recordedReason: null, evidenceRefs: [] } as const;
  for (let i = 1; i <= 3; i++) await appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, sourceEventId: `burst:${i}` });
  const frames = await collected;
  assert.deepEqual([...frames.matchAll(/"sequence":(\d+)/gu)].map((match) => Number(match[1])), [1, 2, 3]);
  await reader.cancel();
});

test("phase26 bootstrap and bearer expire without extending observation", async (t) => {
  const fixture = await createTaskFixture(t);
  const binding = validateTaskSessionBinding({ schemaVersion: 1, contractId: "fixture", contractDigest: "9".repeat(64), revision: 1,
    runId: "run-one", host: "codex", originatingSessionId: "conversation-one" });
  await createTaskSession(fixture.stateRoot, binding);
  const now = Date.now();
  const first = await startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: now + 180000 });
  t.after(() => first.dispose());
  const url = new URL(first.url);
  const second = await startTaskProgressPanel({ stateRoot: fixture.stateRoot, binding, deadlineAt: now + 180000 });
  t.after(() => second.dispose());
  const other = new URL(second.url);
  const exchanged = await fetch(`${other.origin}/session`, { method: "POST", headers: { Origin: other.origin, Authorization: `Bearer ${other.hash.slice(1)}` } });
  const { token } = await exchanged.json() as { token: string };
  const original = Date.now;
  try {
    Date.now = () => now + 121000;
    assert.equal((await fetch(`${url.origin}/session`, { method: "POST", headers: { Origin: url.origin, Authorization: `Bearer ${url.hash.slice(1)}` } })).status, 401);
    assert.equal((await fetch(`${other.origin}/snapshot`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    Date.now = () => now + 181000;
    assert.equal((await fetch(`${other.origin}/snapshot`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  } finally { Date.now = original; }
});

test("phase26 SSE rechecks commits received during a blocked flush", { timeout: 30000 }, async (t) => {
  const { fixture, binding, origin, session } = await setup(t);
  const { appendTaskSessionEvent } = await import("../src/core/task-session.js");
  const { ServerResponse } = await import("node:http");
  const originalWrite = ServerResponse.prototype.write;
  let unblock!: () => void, reportBlocked!: () => void;
  const blocked = new Promise<void>((resolve) => { reportBlocked = resolve; });
  let intercepted = false;
  ServerResponse.prototype.write = function (this: import("node:http").ServerResponse, chunk: unknown, ...args: unknown[]) {
    const result = (originalWrite as (...args: unknown[]) => boolean).call(this, chunk, ...args);
    if (!intercepted && typeof chunk === "string" && chunk.startsWith("data: ")) {
      intercepted = true;
      unblock = () => this.emit("drain");
      reportBlocked();
      return false;
    }
    return result;
  } as typeof ServerResponse.prototype.write;
  t.after(() => { ServerResponse.prototype.write = originalWrite; });
  const response = await fetch(`${origin}/events?cursor=0`, { headers: { Authorization: `Bearer ${session}` }, signal: AbortSignal.timeout(20000) });
  const reader = response.body!.getReader();
  const event = { observedAt: "2026-10-31T00:00:00.000Z", kind: "dispatch-start", workflow: null, step: null,
    role: "controller", configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: "running", processState: null, recordedReason: null, evidenceRefs: [] } as const;
  await appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, sourceEventId: "flush:1" });
  await blocked;
  await appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, sourceEventId: "flush:2" });
  await appendTaskSessionEvent(fixture.stateRoot, binding, { ...event, sourceEventId: "flush:3" });
  unblock();
  let frames = "";
  while (!frames.includes('"sequence":3')) {
    const part = await reader.read();
    if (part.done) break;
    frames += new TextDecoder().decode(part.value);
  }
  assert.deepEqual([...frames.matchAll(/"sequence":(\d+)/gu)].map((match) => Number(match[1])), [1, 2, 3]);
  await reader.cancel();
});

test("phase26 stalled SSE drain disconnects within the finite bound", { timeout: 15000 }, async (t) => {
  const { fixture, binding, origin, session } = await setup(t);
  const { appendTaskSessionEvent } = await import("../src/core/task-session.js");
  const { ServerResponse } = await import("node:http");
  const originalWrite = ServerResponse.prototype.write;
  let intercepted = false;
  ServerResponse.prototype.write = function (this: import("node:http").ServerResponse, chunk: unknown, ...args: unknown[]) {
    const result = (originalWrite as (...args: unknown[]) => boolean).call(this, chunk, ...args);
    if (!intercepted && typeof chunk === "string" && chunk.startsWith("data: ")) { intercepted = true; return false; }
    return result;
  } as typeof ServerResponse.prototype.write;
  t.after(() => { ServerResponse.prototype.write = originalWrite; });
  const response = await fetch(`${origin}/events?cursor=0`, { headers: { Authorization: `Bearer ${session}` }, signal: AbortSignal.timeout(10000) });
  const reader = response.body!.getReader();
  await appendTaskSessionEvent(fixture.stateRoot, binding, { sourceEventId: "stall:1", observedAt: "2026-10-31T00:00:00.000Z",
    kind: "dispatch-start", workflow: null, step: null, role: "controller", configuredModel: null, configuredEffort: null,
    observedModel: null, observedEffort: null, outcome: "running", processState: null, recordedReason: null, evidenceRefs: [] });
  const started = Date.now();
  let closed = false;
  try { while (!(await reader.read()).done) { /* consume until the server closes the stalled stream */ } closed = true; }
  catch { closed = true; }
  assert.equal(intercepted, true);
  assert.equal(closed, true);
  assert.ok(Date.now() - started < 8000);
});

test("phase26 UI retains focused history within 200 rows", async (t) => {
  const { origin } = await setup(t);
  const script = await (await fetch(`${origin}/panel.js`)).text();
  const { runInNewContext } = await import("node:vm");
  class Element {
    children: Element[] = [];
    parent: Element | null = null;
    textContent = "";
    hidden = false;
    append(...items: Element[]) { for (const item of items) { item.parent = this; this.children.push(item); } }
    appendChild(item: Element) { this.append(item); }
    get firstElementChild() { return this.children[0]!; }
    contains(item: Element | null): boolean { return this === item || this.children.some((child) => child.contains(item)); }
    querySelector() { return null; }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    addEventListener() {}
  }
  const nodes = new Map<string, Element>();
  const document = { activeElement: null as Element | null, getElementById(id: string) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id)!; }, createElement() { return new Element(); } };
  const context = { document, location: { hash: "", pathname: "/" }, history: { replaceState() {} }, sessionStorage: { getItem() { return null; }, removeItem() {} }, Intl, Date, JSON, Map, Error };
  runInNewContext(`${script}\nfor(let i=1;i<=200;i++)display({sequence:i,observedAt:"2026-01-01",kind:"decision"}); document.activeElement=document.getElementById("events").firstElementChild; for(let i=201;i<=240;i++)display({sequence:i,observedAt:"2026-01-01",kind:"decision"});`, context);
  const rows = nodes.get("events")!;
  assert.equal(rows.children.length, 200);
  assert.ok(rows.children.includes(document.activeElement!));
  assert.match(nodes.get("notice")!.textContent, /200/u);
});
