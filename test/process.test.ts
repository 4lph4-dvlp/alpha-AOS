// Contract for SAFE-06 (D-12).
//
// External commands must run without a shell, receive only an explicitly
// approved environment, terminate on a timeout or an output cap, and return
// bounded, redacted evidence instead of raw bytes.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  isDirectlyExecutable,
  materializeEnvironment,
  normalizeProcessSpec,
  PLATFORM_FLOOR_ENVIRONMENT,
  ProcessPolicyError,
  readCommandVersion,
  resolveCommand,
  resolveNodePackageCli,
  runProcess,
} from "../src/core/process.js";
import { describeProcessFailure, nodeRuntimeEnvironment } from "../src/core/install.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");

const ENV_SECRET = "alphaAOSprocessSentinel0007";

interface ProcessFixture {
  readonly root: string;
  readonly echoScript: string;
  readonly floodScript: string;
  readonly sleepScript: string;
  readonly spawnerScript: string;
  readonly sideEffect: string;
}

async function createProcessFixture(context: { after: (fn: () => Promise<unknown> | unknown) => void }): Promise<ProcessFixture> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-process-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const sideEffect = join(root, "SIDE-EFFECT");
  const echoScript = join(root, "echo.mjs");
  const floodScript = join(root, "flood.mjs");
  const sleepScript = join(root, "sleep.mjs");
  const spawnerScript = join(root, "spawner.mjs");

  // Reports its own argv and environment so the test can inspect exactly what
  // crossed the process boundary.
  await writeFile(
    echoScript,
    "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), env: process.env }));\n",
    "utf8",
  );

  await writeFile(
    floodScript,
    [
      "const chunk = 'F'.repeat(1024);",
      "for (let index = 0; index < 20_000; index += 1) process.stdout.write(chunk);",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(sleepScript, "await new Promise((r) => setTimeout(r, 30_000));\n", "utf8");

  await writeFile(
    spawnerScript,
    [
      "import { spawn } from 'node:child_process';",
      "const child = spawn(process.execPath, [process.argv[2]], { detached: false, stdio: 'ignore' });",
      "process.stdout.write(String(child.pid));",
      "await new Promise((r) => setTimeout(r, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  return { root, echoScript, floodScript, sleepScript, spawnerScript, sideEffect };
}

test("shell metacharacters in an argument stay data and never execute", async (context) => {
  const fixture = await createProcessFixture(context);

  // Each of these would create the side-effect file if any layer handed the
  // argument to a shell.
  const injections = [
    `x & echo pwned > ${fixture.sideEffect}`,
    `x; touch ${fixture.sideEffect}`,
    `x | tee ${fixture.sideEffect}`,
    `$(touch ${fixture.sideEffect})`,
    `\`touch ${fixture.sideEffect}\``,
    `x && echo pwned > "${fixture.sideEffect}"`,
    `x\nnew-line-command > ${fixture.sideEffect}`,
  ];

  for (const injection of injections) {
    const result = await runProcess({
      executable: process.execPath,
      args: [fixture.echoScript, injection],
      cwd: fixture.root,
    });
    assert.equal(result.code, "ok", `the child failed for injection: ${injection}`);
    const reported = JSON.parse(result.stdout.excerpt) as { argv: string[] };
    assert.deepEqual(reported.argv, [injection], "the argument must arrive verbatim as a single argv entry");
    assert.equal(existsSync(fixture.sideEffect), false, `injection executed a side effect: ${injection}`);
  }
});

test("only operation-approved environment names reach the child", async (context) => {
  const fixture = await createProcessFixture(context);

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.echoScript],
    cwd: fixture.root,
    environment: {
      optional: ["ALPHA_AOS_ALLOWED"],
      // The ambient environment is offered as a source, but only the declared
      // names may cross the boundary.
      source: { ...process.env, ALPHA_AOS_ALLOWED: "yes", ALPHA_AOS_TOKEN: ENV_SECRET },
    },
  });
  const reported = JSON.parse(result.stdout.excerpt) as { env: Record<string, string> };

  assert.equal(reported.env.ALPHA_AOS_ALLOWED, "yes", "an approved name must be delivered");
  for (const forbidden of ["ALPHA_AOS_TOKEN", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "npm_config__auth"]) {
    assert.equal(
      Object.hasOwn(reported.env, forbidden),
      false,
      `the undeclared name ${forbidden} leaked into the child environment`,
    );
  }

  // Nothing beyond the declared names and the documented platform floor may
  // cross the boundary. Widening that floor silently is the regression here.
  const unexpected = Object.keys(reported.env).filter(
    (name) => name !== "ALPHA_AOS_ALLOWED" && !PLATFORM_FLOOR_ENVIRONMENT.includes(name),
  );
  assert.deepEqual(unexpected, [], `undeclared names crossed the process boundary: ${unexpected.join(", ")}`);
});

test("the platform environment floor is declared rather than discovered at runtime", async (context) => {
  const fixture = await createProcessFixture(context);

  // Windows injects system variables no allowlist can suppress. The adapter
  // must name them so callers can reason about what a child really sees.
  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.echoScript],
    cwd: fixture.root,
    environment: { source: {} },
  });
  const reported = JSON.parse(result.stdout.excerpt) as { env: Record<string, string> };
  const observed = Object.keys(reported.env).sort();

  assert.deepEqual(
    observed,
    [...PLATFORM_FLOOR_ENVIRONMENT].sort(),
    "the declared platform floor must match what the OS actually delivers",
  );
});

test("a required environment name that is absent refuses before spawning", async (context) => {
  const fixture = await createProcessFixture(context);

  await assert.rejects(
    () =>
      runProcess({
        executable: process.execPath,
        args: [fixture.echoScript],
        cwd: fixture.root,
        environment: { required: ["ALPHA_AOS_ABSENT"], source: {} },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProcessPolicyError);
      assert.equal(error.code, "missing-required-environment");
      return true;
    },
  );
});

test("environment names that collide only by case are rejected deterministically", () => {
  // On Windows the environment is case-insensitive, so two names differing
  // only in case are an ambiguous request and must not be resolved silently.
  assert.throws(
    () =>
      materializeEnvironment({
        optional: ["ALPHA_AOS_MODE", "alpha_aos_mode"],
        source: { ALPHA_AOS_MODE: "one", alpha_aos_mode: "two" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProcessPolicyError);
      assert.equal(error.code, "environment-conflict");
      return true;
    },
    "a case-colliding environment allowlist must be refused rather than silently resolved",
  );

  // The same name twice is not a collision.
  assert.deepEqual(
    materializeEnvironment({ optional: ["ALPHA_AOS_MODE", "ALPHA_AOS_MODE"], source: { ALPHA_AOS_MODE: "one" } }),
    { ALPHA_AOS_MODE: "one" },
  );
});

test("a timeout terminates the child and reports the timeout as typed evidence", async (context) => {
  const fixture = await createProcessFixture(context);

  const startedAt = Date.now();
  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.sleepScript],
    cwd: fixture.root,
    timeoutMs: 1500,
  });
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed < 10_000, `the timeout did not terminate the child (${elapsed}ms elapsed)`);
  assert.equal(result.code, "timeout", "a timed-out command must report a typed timeout code");
  assert.equal(result.timedOut, true);
  assert.ok(result.durationMs >= 1000, "the observed duration must be reported");
});

test("unbounded child output is capped and reported as capped", async (context) => {
  const fixture = await createProcessFixture(context);

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.floodScript],
    cwd: fixture.root,
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
  });

  assert.ok(
    result.stdout.excerpt.length <= 64 * 1024,
    `child output was not capped: retained ${result.stdout.excerpt.length} bytes`,
  );
  assert.equal(result.stdout.capped, true, "a capped capture must say it was capped");
  assert.equal(result.outputCapped, true);
  assert.equal(result.stdout.sha256.length, 64, "the complete stream must still be fingerprinted");
  assert.ok(
    result.stdout.totalBytes > result.stdout.excerpt.length,
    "the untruncated size must stay observable after capping",
  );
});

test("a timed-out command leaves no descendant process behind", async (context) => {
  const fixture = await createProcessFixture(context);

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.spawnerScript, fixture.sleepScript],
    cwd: fixture.root,
    timeoutMs: 1500,
  });

  const descendantPid = Number.parseInt(result.stdout.excerpt.trim(), 10);
  if (!Number.isFinite(descendantPid)) {
    context.diagnostic("descendant pid was not observable; the process tree assertion could not be evaluated");
    return;
  }

  let alive = true;
  try {
    process.kill(descendantPid, 0);
  } catch {
    alive = false;
  }
  if (alive) process.kill(descendantPid, "SIGKILL");
  assert.equal(alive, false, "a timed-out command left a descendant process running");
});

test("a captured result carries no raw secret and no shell trace", async (context) => {
  const fixture = await createProcessFixture(context);

  // The child echoes the environment it was given, including a secret-bearing
  // name. The adapter handed that value over, so it must also redact it back.
  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.echoScript, `--token=${ENV_SECRET}`],
    cwd: fixture.root,
    environment: { literal: { ALPHA_AOS_TOKEN: ENV_SECRET }, source: {} },
  });
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes(ENV_SECRET), false, "the captured result carried a secret verbatim");
  assert.match(result.stdout.excerpt, /\[redacted:secret:/u, "the withheld value must leave a typed placeholder");
  assert.equal(result.stdout.sha256.length, 64, "typed exit metadata must include a stream fingerprint");
  assert.equal(result.code, "ok");
});

test("the adapter never routes a command through a shell interpreter", async (context) => {
  const fixture = await createProcessFixture(context);

  // The child reports only its own argv, so a shell name in the result can
  // only have come from the adapter's own execution path.
  const argvOnly = join(fixture.root, "argv-only.mjs");
  await writeFile(argvOnly, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n", "utf8");

  const result = await runProcess({ executable: process.execPath, args: [argvOnly, "plain-argument"], cwd: fixture.root });
  const serialized = JSON.stringify(result).toLowerCase();

  for (const shellTrace of ["cmd.exe", "/bin/sh", "powershell.exe", "comspec"]) {
    assert.equal(serialized.includes(shellTrace), false, `the execution path shows a shell: ${shellTrace}`);
  }
});

test("a relative executable is refused rather than resolved through a PATH search", async (context) => {
  const fixture = await createProcessFixture(context);

  await assert.rejects(
    () => runProcess({ executable: "node", args: ["--version"], cwd: fixture.root }),
    (error: unknown) => {
      assert.ok(error instanceof ProcessPolicyError);
      assert.equal(error.code, "unsupported-executable");
      return true;
    },
  );
});

test("known npm and npx shims normalize to node plus an exact CLI script", () => {
  for (const command of ["npm", "npx"] as const) {
    if (resolveCommand(command) === null) continue;
    const resolved = resolveNodePackageCli(command);
    if (process.platform === "win32") {
      assert.equal(
        resolved.executable,
        process.execPath,
        `${command} must normalize to the running node executable instead of a .cmd shim`,
      );
      assert.equal(resolved.argsPrefix.length, 1, `${command} must be launched through exactly one CLI script`);
      const script = resolved.argsPrefix[0];
      assert.ok(script !== undefined && existsSync(script), `${command} CLI script must exist: ${String(script)}`);
    }
    assert.equal(
      resolved.executable.toLowerCase().endsWith(".cmd"),
      false,
      `${command} must never be launched through a .cmd shim`,
    );
  }
});

test("an arbitrary cmd or bat input is unsupported rather than routed through a shell", async (context) => {
  const fixture = await createProcessFixture(context);

  const batch = join(fixture.root, "payload.bat");
  await writeFile(batch, `@echo off\r\necho pwned > "${fixture.sideEffect}"\r\n`, "utf8");

  assert.equal(isDirectlyExecutable(batch), false, "a batch file is not directly executable");
  assert.equal(readCommandVersion(batch), null, "an arbitrary batch input must be reported unsupported");
  assert.throws(
    () => normalizeProcessSpec({ executable: batch, args: [], cwd: fixture.root }),
    (error: unknown) => {
      assert.ok(error instanceof ProcessPolicyError);
      assert.equal(error.code, "unsupported-executable");
      return true;
    },
  );
  assert.equal(existsSync(fixture.sideEffect), false, "an arbitrary batch file was executed through a shell");
});

test("the repository ships no shell-enabled spawn in its process adapter", async () => {
  const adapter = await readFile(join(repositoryRoot, "src", "core", "process.ts"), "utf8");

  assert.equal(/shell\s*:\s*true/u.test(adapter), false, "the process adapter must never enable a shell");
  assert.equal(
    /windowsVerbatimArguments\s*:\s*true/u.test(adapter),
    false,
    "verbatim argument passing hands quoting to the OS and reintroduces injection",
  );
  assert.equal(
    /ComSpec|cmd\.exe|powershell\.exe/u.test(adapter),
    false,
    "the process adapter must not route commands through a shell interpreter",
  );
});

test("the MCP filter proxy inherits neither the ambient environment nor stderr", async () => {
  const proxy = await readFile(join(repositoryRoot, "src", "core", "mcp-proxy.ts"), "utf8");

  // Match a call or an import, not a comment explaining why it is avoided.
  assert.equal(
    /getDefaultEnvironment\s*\(/u.test(proxy),
    false,
    "getDefaultEnvironment copies ambient environment into the upstream child",
  );
  assert.equal(
    /import[^;]*getDefaultEnvironment[^;]*from/su.test(proxy),
    false,
    "getDefaultEnvironment must not be imported at all",
  );
  assert.equal(
    /stderr\s*:\s*["']inherit["']/u.test(proxy),
    false,
    "an inherited stderr handle bypasses the redaction and byte-cap policy",
  );
  // The upstream environment must come from an explicit allowlist.
  assert.match(proxy, /materializeEnvironment/u, "the proxy must build its child environment from a declared allowlist");
});

// ---------------------------------------------------------------------------
// Plan 01-11: the fixture and installer boundary
// ---------------------------------------------------------------------------

test("no source module spawns a child outside the process adapter", async () => {
  const sources = await readdir(join(repositoryRoot, "src", "core"));
  const files = [
    ...sources.filter((name) => name.endsWith(".ts")).map((name) => join("src", "core", name)),
    join("src", "cli.ts"),
    join("src", "adapters", "harnesses.ts"),
    join("src", "adapters", "isolation.ts"),
  ];

  // The enumeration carries no exception set. The MCP fixture's long-lived
  // JSON-RPC child was the last holdout and now runs through the adapter's
  // protocol-session mode, so its presence in this list is the assertion.
  assert.ok(
    files.includes(join("src", "core", "mcp-fixture.ts")),
    "the MCP fixture must stay inside the enumeration rather than be dropped from it",
  );

  for (const relativePath of files) {
    if (relativePath === join("src", "core", "process.ts")) continue;
    const source = await readFile(join(repositoryRoot, relativePath), "utf8");

    assert.equal(
      /\bspawnSync\s*\(|\bspawn\s*\(/u.test(source),
      false,
      `${relativePath} spawns a child directly instead of going through the process adapter`,
    );
    // Spreading process.env hands a child every credential this process holds.
    assert.equal(
      /\.\.\.process\.env\b/u.test(source),
      false,
      `${relativePath} spreads the ambient environment into a child environment`,
    );
  }
});

test("the environment policy for a node child names what it passes", () => {
  const policy = nodeRuntimeEnvironment({
    extraNames: ["ALPHA_AOS_FIXTURE_NAME"],
    literal: { ALPHA_AOS_FIXTURE_LITERAL: "value" },
    source: {
      PATH: "/usr/bin",
      ALPHA_AOS_FIXTURE_NAME: "named",
      ALPHA_AOS_SECRET_TOKEN: "must-not-cross",
    },
  });
  const materialized = materializeEnvironment(policy);

  assert.equal(materialized.ALPHA_AOS_FIXTURE_NAME, "named", "an operation-named variable must be delivered");
  assert.equal(materialized.ALPHA_AOS_FIXTURE_LITERAL, "value", "a literal the operation sets must be delivered");
  assert.equal(materialized.PATH, "/usr/bin", "a declared runtime name must be delivered");
  assert.equal(
    Object.hasOwn(materialized, "ALPHA_AOS_SECRET_TOKEN"),
    false,
    "an undeclared name from the source must not cross the boundary",
  );
});

test("a failed child is described by fingerprints, never by its raw output", async (context) => {
  const fixture = await createProcessFixture(context);
  const noisy = join(fixture.root, "noisy-failure.mjs");
  const sentinel = "alphaAOSfailureSentinel0009";
  await writeFile(
    noisy,
    [
      `process.stdout.write(${JSON.stringify(sentinel)});`,
      `process.stderr.write(${JSON.stringify(sentinel)});`,
      "process.exit(3);",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await runProcess({
    executable: process.execPath,
    args: [noisy],
    cwd: fixture.root,
    environment: { literal: { ALPHA_AOS_TOKEN: sentinel }, source: {} },
  });
  assert.equal(result.code, "non-zero-exit");

  const described = describeProcessFailure("fixture step", result);
  assert.equal(described.includes(sentinel), false, "a failure description must not quote a secret it was given");
  assert.match(described, /non-zero-exit/u, "the description must carry the coded outcome");
  assert.match(described, /exit 3/u, "the description must carry the exit status");
  assert.match(described, /sha256/u, "the description must carry a stream fingerprint");
});

test("stdin is delivered to a child that expects an event on it", async (context) => {
  const fixture = await createProcessFixture(context);
  const reader = join(fixture.root, "reader.mjs");
  await writeFile(
    reader,
    [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "for await (const chunk of process.stdin) input += chunk;",
      "process.stdout.write(JSON.stringify({ received: input }));",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = await runProcess({
    executable: process.execPath,
    args: [reader],
    cwd: fixture.root,
    stdin: JSON.stringify({ hook_event_name: "Stop" }),
  });

  assert.equal(result.code, "ok");
  const reported = JSON.parse(result.stdout.excerpt) as { received: string };
  assert.deepEqual(JSON.parse(reported.received), { hook_event_name: "Stop" });
});
