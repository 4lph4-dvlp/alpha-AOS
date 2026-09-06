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
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { discoverTools } from "../src/core/mcp-fixture.js";
import {
  CLOSE_TREE_DEADLINE_MS,
  DEFAULT_MAX_MESSAGE_BYTES,
  openProtocolProcess,
  PLATFORM_FLOOR_ENVIRONMENT,
  ProcessPolicyError,
  type ProtocolSession,
} from "../src/core/process.js";
import {
  describeTermination,
  heartbeatSource,
  mintHeartbeat,
  parseHeartbeatLine,
  type ProcessSample,
  classifyProcessSample,
  registerProbe,
  waitForHeartbeatAdvance,
  waitForTermination,
} from "./helpers/termination-oracle.js";

const ENV_SECRET = "alphaAOSprotocolSentinel0011";

// Compiled to dist/test, so the repository root is two levels up.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface ProtocolFixture {
  readonly root: string;
  /** Answers every request carrying a numeric id with a single NDJSON line. */
  readonly roundTripScript: string;
  /**
   * Announces its pid, then emits one very long line with no newline. Publishes
   * a heartbeat when `argv[2]`/`argv[3]` name a path and a nonce.
   */
  readonly unterminatedFloodScript: string;
  /**
   * Announces its pid, reads requests, and answers none of them. Publishes a
   * heartbeat when `argv[2]`/`argv[3]` name a path and a nonce.
   */
  readonly silentScript: string;
  /** Reports the environment block it actually received. */
  readonly environmentScript: string;
  /** Echoes the credential it was handed back through stderr. */
  readonly secretEchoScript: string;
  /**
   * Announces a descendant's pid, then stays alive. Forwards `argv[3]`/`argv[4]`
   * to the grandchild, because the grandchild is what gets judged.
   */
  readonly descendantScript: string;
  /**
   * The descendant the spawner leaves behind. Publishes a heartbeat when
   * `argv[2]`/`argv[3]` name a path and a nonce, and does nothing else.
   */
  readonly sleepScript: string;
  /** A fake upstream MCP server: initialize, initialized, tools/list. */
  readonly fakeMcpServerScript: string;
  /**
   * Registers a session for teardown. Windows will not remove a directory a
   * live child still holds as its cwd, so every session must be closed before
   * the fixture root is deleted — which a second `context.after` could not
   * guarantee, because hooks run in registration order.
   */
  track(session: ProtocolSession): ProtocolSession;
  /**
   * Mints one heartbeat identity. The path is named after the nonce it carries,
   * so one probe's heartbeat file can never be another's — which is what makes
   * a well-formed foreign nonce a fixture-integrity tripwire rather than
   * something a race can produce. `args` is spread straight after a session's
   * own arguments.
   */
  mintHeartbeat(): { path: string; nonce: string; args: [string, string] };
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
  const fakeMcpServerScript = join(root, "fake-mcp-server.mjs");

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
      // Beat zero is published before the pid is announced, so the heartbeat
      // file already exists by the time the test can register a probe on it.
      ...heartbeatSource,
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
      ...heartbeatSource,
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
      // The heartbeat path and nonce are forwarded to the grandchild: the
      // spawner is not what gets judged, the descendant is. They are filtered
      // rather than passed positionally, because an undefined argv entry would
      // make spawn throw when this script is opened without an identity.
      "const forwarded = [process.argv[2], process.argv[3], process.argv[4]].filter((value) => value !== undefined);",
      "const descendant = spawn(process.execPath, forwarded, { detached: false, stdio: 'ignore' });",
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 0, result: { pid: descendant.pid } }));",
      "await new Promise((resolve) => setTimeout(resolve, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    sleepScript,
    [
      ...heartbeatSource,
      "await new Promise((resolve) => setTimeout(resolve, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  // Speaks just enough of the MCP handshake for the fixture probe: it answers
  // initialize, ignores the initialized notification, and advertises one tool.
  await writeFile(
    fakeMcpServerScript,
    [
      "import { createInterface } from 'node:readline';",
      "const lines = createInterface({ input: process.stdin });",
      "lines.on('line', (line) => {",
      "  if (!line.trim().startsWith('{')) return;",
      "  let message;",
      "  try { message = JSON.parse(line); } catch { return; }",
      "  if (message.method === 'notifications/initialized') return;",
      "  if (message.id === 1) {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fixture-upstream', version: '0.0.0' } } }));",
      "    return;",
      "  }",
      "  if (message.id === 2) {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'fixture_probe_tool' }] } }));",
      "  }",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    root,
    roundTripScript,
    unterminatedFloodScript,
    silentScript,
    environmentScript,
    secretEchoScript,
    descendantScript,
    sleepScript,
    fakeMcpServerScript,
    track(session: ProtocolSession): ProtocolSession {
      opened.push(session);
      return session;
    },
    // Delegates to the shared instrument. The rule that a heartbeat file is
    // named after the nonce it carries belongs to the oracle, not to a
    // fixture, because that rule is what makes a well-formed foreign nonce a
    // tripwire. Call sites (`fixture.mintHeartbeat()`) are unchanged.
    mintHeartbeat(): { path: string; nonce: string; args: [string, string] } {
      return mintHeartbeat(root);
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

  const hb = fixture.mintHeartbeat();

  // No `maxMessageBytes` override: the shipped default is what must hold.
  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.unterminatedFloodScript, ...hb.args],
    cwd: fixture.root,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(session);

  const announced = await session.waitFor((message) => message.id === 0, 15_000);
  const announcedPid = (announced.result as { pid?: unknown } | undefined)?.pid;
  assert.equal(typeof announcedPid, "number", "the fake server must announce its own pid before flooding");
  const childPid = announcedPid as number;
  // Registered at the earliest moment the pid is known. The frame cap may
  // already have fired by now, in which case the start-time baseline is null
  // and only the pid-reuse branch is unavailable; every other kind of terminal
  // evidence stays exactly as valid.
  const probe = await registerProbe({ pid: childPid, heartbeatPath: hb.path, nonce: hb.nonce });

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

  const termination = await waitForTermination(probe, CLOSE_TREE_DEADLINE_MS);
  // A pid is signalled only once its identity is confirmed. `null` is no
  // evidence, which is not confirmation either.
  if (!termination.terminated && termination.heartbeatNonceMatches === true) {
    process.kill(childPid, "SIGKILL");
  }
  assert.equal(
    termination.terminated,
    true,
    `a capped protocol session left its child running (${describeTermination(termination)})`,
  );
  assert.equal(
    result.treeTermination,
    process.platform === "win32" ? "windows-tree" : "group",
    "the frame cap's termination did not reach the child's process group",
  );
});

test("a protocol response that never arrives fails on its own deadline and leaves no child behind", async (context) => {
  const fixture = await createProtocolFixture(context);

  const hb = fixture.mintHeartbeat();

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.silentScript, ...hb.args],
    cwd: fixture.root,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(session);

  const childPid = await announcedPid(session);
  assert.equal(typeof childPid, "number", "the fake server must announce its own pid");
  const probe = await registerProbe({ pid: childPid as number, heartbeatPath: hb.path, nonce: hb.nonce });

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
  // The judged process here is the direct child, so `treeTermination` is not
  // asserted: a child that left within the grace period reports
  // `not-required`, which is a legitimate value rather than a missed guarantee.
  // No cleanup signal is sent either — this child belongs to the fixture's
  // `track()`, which closes it at teardown.
  const termination = await waitForTermination(probe, CLOSE_TREE_DEADLINE_MS);
  assert.equal(
    termination.terminated,
    true,
    `a closed protocol session left its child running (${describeTermination(termination)})`,
  );
});

test("an absolute deadline settles the session as timed out, and disabling it leaves the frame cap in force", async (context) => {
  const fixture = await createProtocolFixture(context);

  // Only `bounded` is judged, so exactly one identity is minted. `unbounded`
  // is opened without one, and the fixture's absent-argument branch makes that
  // a no-op rather than a file named after `undefined`.
  const hb = fixture.mintHeartbeat();

  const bounded = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.silentScript, ...hb.args],
    cwd: fixture.root,
    timeoutMs: 1500,
    maxOutputBytes: 64 * 1024,
  });
  fixture.track(bounded);

  const boundedPid = await announcedPid(bounded);
  const boundedProbe =
    boundedPid === null
      ? null
      : await registerProbe({ pid: boundedPid, heartbeatPath: hb.path, nonce: hb.nonce });
  const startedAt = Date.now();
  const expired = await bounded.closed;

  assert.ok(Date.now() - startedAt < 20_000, "the absolute ceiling did not terminate the session");
  assert.equal(expired.code, "timeout", "an expired absolute ceiling must report a typed timeout");
  assert.equal(expired.timedOut, true);
  if (boundedPid !== null && boundedProbe !== null) {
    const termination = await waitForTermination(boundedProbe, CLOSE_TREE_DEADLINE_MS);
    assert.equal(
      termination.terminated,
      true,
      `a timed-out protocol session left its child running (${describeTermination(termination)})`,
    );
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

  const hb = fixture.mintHeartbeat();

  const session = await openProtocolProcess({
    executable: process.execPath,
    args: [fixture.descendantScript, fixture.sleepScript, ...hb.args],
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
  // The start-time baseline can only be read while the process is still alive,
  // so the probe is registered before anything is asked to terminate.
  const probe = await registerProbe({ pid: descendantPid, heartbeatPath: hb.path, nonce: hb.nonce });

  const result = await session.close();

  const termination = await waitForTermination(probe, CLOSE_TREE_DEADLINE_MS);
  // A pid is signalled only once its identity is confirmed. `null` is no
  // evidence, which is not confirmation either.
  if (!termination.terminated && termination.heartbeatNonceMatches === true) {
    process.kill(descendantPid, "SIGKILL");
  }
  assert.equal(
    termination.terminated,
    true,
    `closing a protocol session left a descendant process running (${describeTermination(termination)})`,
  );
  // The product's own report of how the signal was delivered corroborates the
  // observation. `not-required` here would mean the direct child left on its
  // own and killTree was never exercised, so this test would have proven
  // nothing about the tree — the fixture sleeps 30s precisely so that cannot
  // happen, and if it does, that is new information rather than cause to
  // weaken the assertion.
  assert.equal(
    result.treeTermination,
    process.platform === "win32" ? "windows-tree" : "group",
    "the close-time termination did not reach the child's process group",
  );
});

// ---------------------------------------------------------------------------
// Controls over the oracle itself
// ---------------------------------------------------------------------------

test("the termination oracle distinguishes a running descendant from a terminated one", async (context) => {
  const fixture = await createProtocolFixture(context);
  const hb = fixture.mintHeartbeat();

  // Deliberately outside a session: this control judges the instrument, not the
  // product. The direct-spawn enumeration in test/process.test.ts scans only
  // src/core, src/cli.ts and src/adapters, so a test file is not in its scope.
  const child = spawn(process.execPath, [fixture.sleepScript, ...hb.args], {
    detached: false,
    stdio: "ignore",
  });
  child.on("error", () => undefined);
  const pid = child.pid;
  assert.equal(typeof pid, "number", "the control fixture must report a pid");
  const controlPid = pid as number;

  const probe = await registerProbe({ pid: controlPid, heartbeatPath: hb.path, nonce: hb.nonce });

  // Teardown signals go through the same guard as every other signal in this
  // file: the oracle must not already call it stopped, and the identity must be
  // confirmed. A deadline of 0 takes exactly one sample. Registered after the
  // probe exists so the guard has something to consult.
  context.after(async () => {
    const residual = await waitForTermination(probe, 0);
    if (residual.terminated || residual.heartbeatNonceMatches !== true) return;
    try {
      process.kill(controlPid, "SIGKILL");
    } catch {
      // Already gone, which is the expected end state.
    }
  });

  // The live half rests on an observation MADE, not on one absent. An earlier
  // design watched for the counter failing to advance, which made the control
  // share the very load-sensitivity it was meant to catch.
  const advance = await waitForHeartbeatAdvance(probe, 2, 5_000);
  assert.ok(
    advance.advances >= 2,
    `the control fixture never proved it was running: ${advance.advances} advances, last counter ${String(advance.lastCounter)}`,
  );

  const running = await waitForTermination(probe, 1_000);
  assert.equal(
    running.terminated,
    false,
    `the oracle reported a demonstrably running process as terminated (${describeTermination(running)})`,
  );

  // Identity is confirmed before the pid is signalled, exactly as every other
  // signalling site in this file does it.
  assert.equal(
    running.heartbeatNonceMatches,
    true,
    "the control must confirm the pid's identity before signalling it",
  );
  process.kill(controlPid, "SIGKILL");

  const stopped = await waitForTermination(probe, CLOSE_TREE_DEADLINE_MS);
  assert.equal(
    stopped.terminated,
    true,
    `the oracle could not prove a killed process stopped (${describeTermination(stopped)})`,
  );
});

test("the termination classifier never reads a stalled heartbeat as a stopped process", () => {
  const LF = String.fromCharCode(10);
  const nonce = "11111111-2222-3333-4444-555555555555";

  /**
   * A `/proc/<pid>/stat` line with fields 3 through 22 present, so the state
   * character and the start time are both readable.
   */
  const statLine = (runState: string, startTime: string, comm = "(node)"): string => {
    const fields = Array.from({ length: 20 }, (_, index) => String(index + 1));
    fields[0] = runState;
    fields[19] = startTime;
    return `1234 ${comm} ${fields.join(" ")}${LF}`;
  };

  const base: ProcessSample = {
    signalProbe: "permitted",
    procfs: false,
    procStat: null,
    recordedStartTime: null,
    heartbeatNonceMatches: true,
    counterAdvanced: false,
  };

  // A process that has stopped executing but has not been reaped is terminated,
  // even though `process.kill(pid, 0)` still succeeds against it. Asserted from
  // literal text so the branch holds on hosts with no procfs and no zombies.
  const zombie = classifyProcessSample({
    ...base,
    procfs: true,
    procStat: statLine("Z", "9999"),
  });
  assert.equal(zombie.state, "terminated", "a zombie is a process that stopped running, not a live one");
  assert.equal(zombie.evidence, "zombie");

  // Field 2 can contain spaces and parentheses. A parser that does not anchor
  // on the LAST `)` misreads the state character here and says nothing about it.
  const awkwardComm = classifyProcessSample({
    ...base,
    procfs: true,
    procStat: statLine("Z", "9999", "(weird ) name)"),
  });
  assert.equal(awkwardComm.state, "terminated", "the stat parser must anchor on the last close-paren");
  assert.equal(awkwardComm.evidence, "zombie");

  const sleeping = classifyProcessSample({
    ...base,
    procfs: true,
    procStat: statLine("S", "9999"),
  });
  assert.notEqual(sleeping.state, "terminated", "a sleeping process has not stopped running");

  // The first of the two nails. A stalled counter is not evidence of anything.
  const stalled = classifyProcessSample({ ...base, counterAdvanced: false });
  assert.equal(
    stalled.state,
    "indeterminate",
    "a stalled heartbeat is not evidence of termination; reading it as one reports a live descendant "
      + "starved of CPU under concurrent load as terminated, which fails green on a safety boundary",
  );

  // The second nail, closing the same direction through the reader instead of
  // the classifier.
  const unreadable = classifyProcessSample({ ...base, heartbeatNonceMatches: null });
  assert.equal(
    unreadable.state,
    "indeterminate",
    "an unreadable or partial heartbeat is no evidence; reading it as a foreign nonce would report a "
      + "live, actively-writing descendant as terminated",
  );

  for (const raw of [null, "", nonce.slice(0, 8), `${nonce} 12`, `${nonce} `, `${nonce} x${LF}`]) {
    assert.equal(
      parseHeartbeatLine(nonce, raw).nonceMatches,
      null,
      `an incomplete heartbeat read must be no evidence, never a foreign nonce: ${JSON.stringify(raw)}`,
    );
  }
  assert.equal(
    parseHeartbeatLine(nonce, `other-${nonce} 12${LF}`).nonceMatches,
    false,
    "only a complete terminated line whose nonce token differs is a foreign nonce",
  );
  assert.deepEqual(
    parseHeartbeatLine(nonce, `${nonce} 12${LF}`),
    { nonceMatches: true, counter: 12 },
    "a complete beat under our own nonce must yield its counter",
  );

  const reused = classifyProcessSample({
    ...base,
    procfs: true,
    procStat: statLine("S", "7777"),
    recordedStartTime: "1234",
  });
  assert.equal(reused.state, "terminated", "a changed start time means the pid now belongs to another process");
  assert.equal(reused.evidence, "pid-reused");

  const gone = classifyProcessSample({ ...base, signalProbe: "esrch" });
  assert.equal(gone.state, "terminated");
  assert.equal(gone.evidence, "esrch");

  const foreignPid = classifyProcessSample({ ...base, signalProbe: "eperm" });
  assert.equal(foreignPid.state, "terminated", "our own descendant can never be unsignallable, so the pid was reused");
  assert.equal(foreignPid.evidence, "eperm-foreign-pid");

  const foreignNonce = classifyProcessSample({ ...base, heartbeatNonceMatches: false });
  assert.equal(foreignNonce.state, "terminated");
  assert.equal(foreignNonce.evidence, "foreign-nonce");
});

// ---------------------------------------------------------------------------
// Plan 01-17 Task 3: the migrated MCP fixture probe
// ---------------------------------------------------------------------------

test("the migrated fixture probe completes a tool discovery round trip through the bounded session", async (context) => {
  const fixture = await createProtocolFixture(context);

  // The boundary change must be proven not to have broken the behaviour it
  // bounds: this is the only automated evidence that the production probe
  // still completes initialize -> initialized -> tools/list.
  const tools = await discoverTools(
    { command: process.execPath, args: [fixture.fakeMcpServerScript] },
    "context7",
    fixture.root,
  );

  assert.deepEqual(tools, ["fixture_probe_tool"], "the migrated probe must return the advertised tool names");
});

test("no protocol-session carve-out survives in the source enumeration", async () => {
  const enumeration = await readFile(join(repositoryRoot, "test", "process.test.ts"), "utf8");
  const migrated = await readFile(join(repositoryRoot, "src", "core", "mcp-fixture.ts"), "utf8");

  // The identifiers below deliberately live only in this file. Grepping a file
  // for a literal it also contains would make the assertion permanently red.
  assert.equal(
    /protocolSessionExceptions/u.test(enumeration),
    false,
    "the direct-spawn exception set must be retired, not left behind as dead code",
  );
  // Positive control: deleting the enumeration test itself must not be a way
  // to make the assertion above pass.
  assert.equal(
    /no source module spawns a child outside the process adapter/u.test(enumeration),
    true,
    "the direct-spawn enumeration test must still exist",
  );
  assert.equal(
    /from\s+["']node:child_process["']/u.test(migrated),
    false,
    "the MCP fixture must not import a child-process primitive of its own",
  );
  assert.equal(
    /openProtocolProcess/u.test(migrated),
    true,
    "the MCP fixture must reach its JSON-RPC child through the bounded adapter",
  );
});
