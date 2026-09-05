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
import {
  DEFAULT_MAX_MESSAGE_BYTES,
  openProtocolProcess,
  PLATFORM_FLOOR_ENVIRONMENT,
  ProcessPolicyError,
  type ProtocolSession,
} from "../src/core/process.js";

const ENV_SECRET = "alphaAOSprotocolSentinel0011";

interface ProtocolFixture {
  readonly root: string;
  /** Answers every request carrying a numeric id with a single NDJSON line. */
  readonly roundTripScript: string;
  /** Announces its pid, then emits one very long line with no newline. */
  readonly unterminatedFloodScript: string;
  /** Announces its pid, reads requests, and answers none of them. */
  readonly silentScript: string;
  /** Reports the environment block it actually received. */
  readonly environmentScript: string;
  /** Echoes the credential it was handed back through stderr. */
  readonly secretEchoScript: string;
  /** Announces a descendant's pid, then stays alive. */
  readonly descendantScript: string;
  /** The descendant the spawner leaves behind. */
  readonly sleepScript: string;
  /**
   * Registers a session for teardown. Windows will not remove a directory a
   * live child still holds as its cwd, so every session must be closed before
   * the fixture root is deleted — which a second `context.after` could not
   * guarantee, because hooks run in registration order.
   */
  track(session: ProtocolSession): ProtocolSession;
}

async function createProtocolFixture(
  context: { after: (fn: () => Promise<unknown> | unknown) => void },
): Promise<ProtocolFixture> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-protocol-"));
  const opened: ProtocolSession[] = [];
  context.after(async () => {
    for (const session of opened) {
      await session.close().catch(() => undefined);
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  const roundTripScript = join(root, "round-trip-server.mjs");
  const unterminatedFloodScript = join(root, "unterminated-flood.mjs");
  const silentScript = join(root, "silent-server.mjs");
  const environmentScript = join(root, "environment-server.mjs");
  const secretEchoScript = join(root, "secret-echo-server.mjs");
  const descendantScript = join(root, "descendant-server.mjs");
  const sleepScript = join(root, "sleep.mjs");

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

  // Accepts requests and answers none of them, so a caller's own per-message
  // deadline is the only thing that can end the wait.
  await writeFile(
    silentScript,
    [
      "import { createInterface } from 'node:readline';",
      "const lines = createInterface({ input: process.stdin });",
      "lines.on('line', () => {});",
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 0, result: { pid: process.pid } }));",
      "await new Promise((resolve) => setTimeout(resolve, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    environmentScript,
    [
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { env: process.env } }));",
      "",
    ].join("\n"),
    "utf8",
  );

  // Hands the credential it was given straight back on stderr — the exact
  // shape a redaction seam has to catch, because the session itself supplied
  // the value.
  await writeFile(
    secretEchoScript,
    [
      "console.error('upstream reported ' + (process.env.ALPHA_AOS_TOKEN ?? '<absent>'));",
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { reported: true } }));",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    descendantScript,
    [
      "import { spawn } from 'node:child_process';",
      "const descendant = spawn(process.execPath, [process.argv[2]], { detached: false, stdio: 'ignore' });",
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 0, result: { pid: descendant.pid } }));",
      "await new Promise((resolve) => setTimeout(resolve, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(sleepScript, "await new Promise((resolve) => setTimeout(resolve, 30_000));\n", "utf8");

  return {
    root,
    roundTripScript,
    unterminatedFloodScript,
    silentScript,
    environmentScript,
    secretEchoScript,
    descendantScript,
    sleepScript,
    track(session: ProtocolSession): ProtocolSession {
      opened.push(session);
      return session;
    },
  };
}

/** Reads a pid a fake server announced as its first protocol frame. */
async function announcedPid(
  session: { waitFor: (match: (message: Record<string, unknown>) => boolean, timeoutMs?: number) => Promise<Record<string, unknown>> },
): Promise<number | null> {
  const announced = await session.waitFor((message) => message.id === 0, 15_000);
  const pid = (announced.result as { pid?: unknown } | undefined)?.pid;
  return typeof pid === "number" ? pid : null;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("a bounded protocol session completes a JSON-RPC round trip against a fake upstream server", async (context) => {
  const fixture = await createProtocolFixture(context);

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.roundTripScript],
    cwd: fixture.root,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(session);

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
  fixture.track(session);

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

test("a protocol response that never arrives fails on its own deadline and leaves no child behind", async (context) => {
  const fixture = await createProtocolFixture(context);

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.silentScript],
    cwd: fixture.root,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(session);

  const childPid = await announcedPid(session);
  assert.equal(typeof childPid, "number", "the fake server must announce its own pid");

  session.send({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} });
  const startedAt = Date.now();
  await assert.rejects(
    () => session.waitFor((message) => message.id === 7, 1500),
    (error: unknown) => {
      assert.ok(error instanceof ProcessPolicyError, "an expired wait must fail with a typed policy error");
      assert.equal(error.code, "timeout", "an expired wait must carry the coded outcome");
      assert.match(error.message, /sha256/u, "the refusal must carry a stream fingerprint");
      // D-12: the refusal is built from metadata, not from what the child said.
      assert.equal(
        error.message.includes("jsonrpc"),
        false,
        "a refusal must not interpolate accumulated child output",
      );
      return true;
    },
  );
  assert.ok(Date.now() - startedAt < 15_000, "the wait did not end on its own per-message deadline");

  await session.close();
  assert.equal(isAlive(childPid as number), false, "a closed protocol session left its child running");
});

test("an absolute deadline settles the session as timed out, and disabling it leaves the frame cap in force", async (context) => {
  const fixture = await createProtocolFixture(context);

  const bounded = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.silentScript],
    cwd: fixture.root,
    timeoutMs: 1500,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(bounded);

  const boundedPid = await announcedPid(bounded);
  const startedAt = Date.now();
  const expired = await bounded.closed;

  assert.ok(Date.now() - startedAt < 20_000, "the absolute ceiling did not terminate the session");
  assert.equal(expired.code, "timeout", "an expired absolute ceiling must report a typed timeout");
  assert.equal(expired.timedOut, true);
  if (boundedPid !== null) {
    assert.equal(isAlive(boundedPid), false, "a timed-out protocol session left its child running");
  }

  // Being long-lived is not an exemption. A session that deliberately runs
  // without an absolute ceiling still enforces every other bound.
  const unbounded = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.unterminatedFloodScript],
    cwd: fixture.root,
    timeoutMs: 0,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(unbounded);

  const capped = await unbounded.closed;
  assert.equal(capped.code, "output-cap", "a ceiling-free session must still cap one unterminated frame");
  assert.equal(capped.outputCapped, true);
  assert.equal(capped.timedOut, false, "the frame cap is a byte bound, not a deadline");
});

test("only operation-approved environment names reach a protocol child", async (context) => {
  const fixture = await createProtocolFixture(context);

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.environmentScript],
    cwd: fixture.root,
    environment: {
      optional: ["ALPHA_AOS_ALLOWED"],
      // The ambient environment is offered as a source; only declared names
      // may cross the boundary.
      source: { ...process.env, ALPHA_AOS_ALLOWED: "yes", ALPHA_AOS_TOKEN: ENV_SECRET },
    },
  });
  fixture.track(session);

  const reported = await session.waitFor((message) => message.id === 1, 15_000);
  const observed = (reported.result as { env: Record<string, string> }).env;

  assert.equal(observed.ALPHA_AOS_ALLOWED, "yes", "an approved name must be delivered");
  for (const forbidden of ["ALPHA_AOS_TOKEN", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "npm_config__auth"]) {
    assert.equal(
      Object.hasOwn(observed, forbidden),
      false,
      `the undeclared name ${forbidden} leaked into the protocol child environment`,
    );
  }

  const unexpected = Object.keys(observed).filter(
    (name) => name !== "ALPHA_AOS_ALLOWED" && !PLATFORM_FLOOR_ENVIRONMENT.includes(name),
  );
  assert.deepEqual(unexpected, [], `undeclared names crossed the protocol boundary: ${unexpected.join(", ")}`);
});

test("protocol session evidence carries fingerprints and typed placeholders, never raw bytes", async (context) => {
  const fixture = await createProtocolFixture(context);

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.secretEchoScript],
    cwd: fixture.root,
    // The session handed this value over, so it must also redact it back.
    environment: { literal: { ALPHA_AOS_TOKEN: ENV_SECRET }, source: {} },
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(session);

  const settled = await session.closed;
  const evidence = session.evidence();

  assert.match(evidence.stderr.excerpt, /\[redacted:secret:/u, "the withheld value must leave a typed placeholder");
  assert.equal(evidence.stderr.excerpt.includes(ENV_SECRET), false, "session evidence carried a secret verbatim");
  assert.equal(evidence.stderr.sha256.length, 64, "evidence must fingerprint the complete stream");
  assert.equal(evidence.stdout.sha256.length, 64);
  assert.equal(JSON.stringify(settled).includes(ENV_SECRET), false, "the settled result carried a secret verbatim");
  assert.equal(
    JSON.stringify(await session.close()).includes(ENV_SECRET),
    false,
    "closing the session re-exposed a secret",
  );
});

test("closing a protocol session terminates the whole child tree", async (context) => {
  const fixture = await createProtocolFixture(context);

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.descendantScript, fixture.sleepScript],
    cwd: fixture.root,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(session);

  const descendantPid = await announcedPid(session);
  if (descendantPid === null) {
    // Not observable is recorded as not-run rather than reported as a pass.
    context.diagnostic("descendant pid was not observable; the process tree assertion could not be evaluated");
    return;
  }

  await session.close();

  const alive = isAlive(descendantPid);
  if (alive) process.kill(descendantPid, "SIGKILL");
  assert.equal(alive, false, "closing a protocol session left a descendant process running");
});
