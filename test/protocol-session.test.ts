// Contract for the long-lived protocol-session mode of the process adapter
// (SAFE-06, D-12).
//
// A JSON-RPC stdio child is long-lived, but that does not exempt it from the
// boundary `runProcess` already enforces: no shell, an absolute executable,
// only the environment names the operation declared, a deadline that reaches
// descendants, a byte cap that terminates a child rather than growing a
// buffer, and evidence that is bounded, redacted and fingerprinted instead of
// raw.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_MAX_MESSAGE_BYTES, openProtocolProcess } from "../src/core/process.js";

interface ProtocolFixture {
  readonly root: string;
  /** Answers every request carrying a numeric id with a single NDJSON line. */
  readonly roundTripScript: string;
  /** Announces its pid, then emits one very long line with no newline. */
  readonly unterminatedFloodScript: string;
}

async function createProtocolFixture(
  context: { after: (fn: () => Promise<unknown> | unknown) => void },
): Promise<ProtocolFixture> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-protocol-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const roundTripScript = join(root, "round-trip-server.mjs");
  const unterminatedFloodScript = join(root, "unterminated-flood.mjs");

  await writeFile(
    roundTripScript,
    [
      "import { createInterface } from 'node:readline';",
      "const lines = createInterface({ input: process.stdin });",
      "lines.on('line', (line) => {",
      "  if (!line.trim().startsWith('{')) return;",
      "  let message;",
      "  try { message = JSON.parse(line); } catch { return; }",
      "  if (typeof message.id !== 'number') return;",
      // console.log supplies the frame terminator, so the fixture never has to
      // carry an escaped newline through two levels of source.
      "  console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { method: message.method ?? null } }));",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    unterminatedFloodScript,
    [
      // The pid is announced as a complete frame first, so the test can prove
      // the capped session actually terminated this child.
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 0, result: { pid: process.pid } }));",
      "const chunk = 'F'.repeat(64 * 1024);",
      "for (let index = 0; index < 64; index += 1) process.stdout.write(chunk);",
      "await new Promise((resolve) => setTimeout(resolve, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  return { root, roundTripScript, unterminatedFloodScript };
}

test("a bounded protocol session completes a JSON-RPC round trip against a fake upstream server", async (context) => {
  const fixture = await createProtocolFixture(context);

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.roundTripScript],
    cwd: fixture.root,
    maxOutputBytes: 64 * 1024,
  });
  context.after(async () => {
    await session.close();
  });

  session.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  const response = await session.waitFor((message) => message.id === 1, 15_000);

  assert.equal(response.jsonrpc, "2.0", "the upstream frame must be delivered as a parsed object");
  assert.equal(response.id, 1);
  assert.deepEqual(response.result, { method: "initialize" }, "the round trip must carry the request through to the reply");

  // Evidence is readable while the session is still alive, and it is already
  // bounded and fingerprinted rather than raw.
  const evidence = session.evidence();
  assert.equal(evidence.stdout.sha256.length, 64, "live evidence must fingerprint the complete stream");
  assert.equal(evidence.stderr.sha256.length, 64);
  assert.ok(evidence.stdout.totalBytes > 0, "the round trip must be reflected in the stream evidence");

  const result = await session.close();
  assert.equal(result.stdout.sha256.length, 64, "a settled session must still carry a stream fingerprint");
  assert.equal(result.stderr.sha256.length, 64);
  assert.ok(result.durationMs >= 0, "the observed duration must be reported");
});

test("one unterminated protocol frame past the cap terminates the child instead of growing the buffer", async (context) => {
  const fixture = await createProtocolFixture(context);

  // No `maxMessageBytes` override: the shipped default is what must hold.
  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.unterminatedFloodScript],
    cwd: fixture.root,
    maxOutputBytes: 64 * 1024,
  });
  context.after(async () => {
    await session.close();
  });

  const announced = await session.waitFor((message) => message.id === 0, 15_000);
  const announcedPid = (announced.result as { pid?: unknown } | undefined)?.pid;
  assert.equal(typeof announcedPid, "number", "the fake server must announce its own pid before flooding");
  const childPid = announcedPid as number;

  const result = await session.closed;
  assert.equal(result.code, "output-cap", "an unterminated frame past the cap must settle as capped");
  assert.equal(result.outputCapped, true);
  assert.ok(
    result.stdout.totalBytes > DEFAULT_MAX_MESSAGE_BYTES,
    `the whole stream must stay fingerprinted past the cap: ${result.stdout.totalBytes} bytes`,
  );
  assert.ok(
    Buffer.byteLength(result.stdout.excerpt, "utf8") <= 64 * 1024,
    `retained evidence was not bounded: ${Buffer.byteLength(result.stdout.excerpt, "utf8")} bytes`,
  );
  assert.equal(result.stdout.sha256.length, 64, "the complete stream must still be fingerprinted");

  let alive = true;
  try {
    process.kill(childPid, 0);
  } catch {
    alive = false;
  }
  if (alive) process.kill(childPid, "SIGKILL");
  assert.equal(alive, false, "a capped protocol session left its child running");
});
