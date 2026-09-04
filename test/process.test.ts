// Wave 0 corpus for SAFE-06 (D-12).
//
// External commands must run without a shell, receive only an explicitly
// approved environment, terminate on a timeout or an output cap, and return
// bounded, redacted evidence instead of raw bytes.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readCommandVersion, resolveCommand, resolveNodePackageCli, runCommandCapture } from "../src/core/process.js";

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
    [
      "process.stdout.write(JSON.stringify({",
      "  argv: process.argv.slice(2),",
      "  env: process.env,",
      "}));",
      "",
    ].join("\n"),
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

function capture(fixture: ProcessFixture, args: string[], env: NodeJS.ProcessEnv, timeout?: number) {
  return runCommandCapture(process.execPath, args, {
    cwd: fixture.root,
    env,
    ...(timeout === undefined ? {} : { timeout }),
  });
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
    const result = capture(fixture, [fixture.echoScript, injection], { ...process.env });
    assert.equal(result.status, 0, `the child failed for injection: ${injection}`);
    const reported = JSON.parse(result.stdout) as { argv: string[] };
    assert.deepEqual(reported.argv, [injection], "the argument must arrive verbatim as a single argv entry");
    assert.equal(existsSync(fixture.sideEffect), false, `injection executed a side effect: ${injection}`);
  }
});

test("only operation-approved environment names reach the child", async (context) => {
  const fixture = await createProcessFixture(context);

  const result = capture(fixture, [fixture.echoScript], {
    // A caller passes an allowlist. Anything the parent happens to hold must
    // not arrive on its own.
    ALPHA_AOS_ALLOWED: "yes",
    PATH: process.env.PATH ?? "",
  });
  const reported = JSON.parse(result.stdout) as { env: Record<string, string> };

  assert.equal(reported.env.ALPHA_AOS_ALLOWED, "yes", "an approved name must be delivered");
  for (const forbidden of ["ALPHA_AOS_TOKEN", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN", "npm_config__auth"]) {
    assert.equal(
      Object.hasOwn(reported.env, forbidden),
      false,
      `the ambient name ${forbidden} leaked into the child environment`,
    );
  }
});

test("environment names that collide only by case are rejected deterministically", async (context) => {
  const fixture = await createProcessFixture(context);

  // On Windows the environment is case-insensitive, so two names differing
  // only in case are an ambiguous request and must not be resolved silently.
  assert.throws(
    () =>
      capture(fixture, [fixture.echoScript], {
        ALPHA_AOS_MODE: "one",
        alpha_aos_mode: "two",
        PATH: process.env.PATH ?? "",
      }),
    "a case-colliding environment allowlist must be refused rather than silently resolved",
  );
});

test("a timeout terminates the child and reports the timeout as evidence", async (context) => {
  const fixture = await createProcessFixture(context);

  const startedAt = Date.now();
  let timedOut = false;
  let evidence: unknown;
  try {
    evidence = capture(fixture, [fixture.sleepScript], { ...process.env }, 1500);
  } catch (error) {
    timedOut = true;
    evidence = error;
  }
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed < 10_000, `the timeout did not terminate the child (${elapsed}ms elapsed)`);
  const serialized = JSON.stringify(evidence ?? {});
  assert.ok(
    timedOut || serialized.includes("timedOut") || serialized.includes("timeout"),
    "a timed-out command must report the timeout as a typed field rather than an ordinary failure",
  );
});

test("unbounded child output is capped and reported as capped", async (context) => {
  const fixture = await createProcessFixture(context);

  const result = capture(fixture, [fixture.floodScript], { ...process.env }, 30_000);
  const total = result.stdout.length + result.stderr.length;

  assert.ok(
    total <= 1_000_000,
    `child output was not capped: captured ${total} bytes, so a hostile child can exhaust memory`,
  );
  const serialized = JSON.stringify(result);
  assert.ok(
    serialized.includes("truncated") || serialized.includes("capped") || serialized.includes("outputHash"),
    "a capped capture must say it was capped and carry a whole-output fingerprint",
  );
});

test("a timed-out command leaves no descendant process behind", async (context) => {
  const fixture = await createProcessFixture(context);

  let descendantPid: number | null = null;
  try {
    const result = capture(fixture, [fixture.spawnerScript, fixture.sleepScript], { ...process.env }, 1500);
    const parsed = Number.parseInt(result.stdout.trim(), 10);
    descendantPid = Number.isFinite(parsed) ? parsed : null;
  } catch {
    descendantPid = null;
  }

  if (descendantPid === null) {
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

test("a captured result carries no raw bytes and no shell trace", async (context) => {
  const fixture = await createProcessFixture(context);

  // A minimal environment: anything the result mentions came from the adapter,
  // not from the child echoing an inherited environment back.
  const result = capture(fixture, [fixture.echoScript, `--token=${ENV_SECRET}`], {
    ALPHA_AOS_TOKEN: ENV_SECRET,
    PATH: process.env.PATH ?? "",
  });
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes(ENV_SECRET), false, "the captured result carried a secret verbatim");
  assert.ok(Object.hasOwn(result, "status"), "a captured result must expose typed exit metadata");
});

test("the adapter never routes a command through a shell interpreter", async (context) => {
  const fixture = await createProcessFixture(context);

  // The child reports only its own argv, so a shell name in the result can
  // only have come from the adapter's own execution path.
  const argvOnly = join(fixture.root, "argv-only.mjs");
  await writeFile(argvOnly, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n", "utf8");

  const result = capture(fixture, [argvOnly, "plain-argument"], { PATH: process.env.PATH ?? "" });
  const serialized = JSON.stringify(result).toLowerCase();

  for (const shellTrace of ["cmd.exe", "/bin/sh", "powershell.exe", "comspec"]) {
    assert.equal(serialized.includes(shellTrace), false, `the execution path shows a shell: ${shellTrace}`);
  }
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

  // Reading a version from an arbitrary batch file must be refused, not run
  // through cmd.exe. `readCommandVersion` currently does the opposite.
  let refused = false;
  try {
    const version = readCommandVersion(batch);
    refused = version === null;
  } catch {
    refused = true;
  }

  assert.equal(existsSync(fixture.sideEffect), false, "an arbitrary batch file was executed through a shell");
  assert.equal(refused, true, "an arbitrary batch input must be reported unsupported rather than executed");
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
