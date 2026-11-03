import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { promisify } from "node:util";
import { loopbackFetch } from "./helpers/loopback-http.js";

test("panel HTTP transport survives the macOS QoS fault without intercepting process errors", async () => {
  const helper = new URL("./helpers/loopback-http.js", import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import { Socket } from 'node:net';
    import { once } from 'node:events';
    import { loopbackFetch } from ${JSON.stringify(helper)};
    let qosCalls = 0;
    Socket.prototype.setTypeOfService = function () {
      qosCalls++;
      throw Object.assign(new Error('setTypeOfService EINVAL'), { code: 'EINVAL', syscall: 'setTypeOfService' });
    };
    const server = createServer((req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.origin, 'http://fixture.invalid');
      res.writeHead(201, { 'Content-Type': 'application/json', 'X-Fixture': 'native' });
      res.end(JSON.stringify({ ok: true }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const response = await loopbackFetch('http://127.0.0.1:' + server.address().port, {
        method: 'POST', headers: { Origin: 'http://fixture.invalid' }, body: 'fixture',
      });
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('x-fixture'), 'native');
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(qosCalls, 0, 'The test transport must not enter undici QoS writes');
      assert.equal(process.listenerCount('uncaughtException'), 0);
      assert.equal(process.listenerCount('unhandledRejection'), 0);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  `;
  const result = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { timeout: 15000, windowsHide: true });
  assert.equal(result.stderr, "");
});

test("panel HTTP transport streams before close and aborts the actual socket", { timeout: 15000 }, async (t) => {
  let closed!: () => void;
  const disconnected = new Promise<void>((resolve) => { closed = resolve; });
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write("data: first\n\n");
    res.once("close", closed);
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const abort = new AbortController();
  const response = await loopbackFetch(`http://127.0.0.1:${address.port}/events`, { signal: abort.signal });
  const reader = response.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /data: first/u);
  abort.abort();
  await assert.rejects(reader.read());
  await disconnected;
});

test("panel HTTP transport refuses external authority and preserves connection failure", { timeout: 15000 }, async () => {
  await assert.rejects(loopbackFetch("http://example.invalid/"), /loopback/u);
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await assert.rejects(loopbackFetch(`http://127.0.0.1:${address.port}/`));
});
