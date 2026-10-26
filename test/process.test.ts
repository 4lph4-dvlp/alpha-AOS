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
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  isDirectlyExecutable,
  materializeEnvironment,
  normalizeProcessSpec,
  PLATFORM_FLOOR_ENVIRONMENT,
  platformFloorEnvironment,
  ProcessPolicyError,
  probeCommand,
  readCommandVersion,
  resolveCommand,
  resolveNodePackageCli,
  runProcess,
  spawnDetachedProcess,
  CLOSE_TREE_DEADLINE_MS,
} from "../src/core/process.js";
import {
  describeTermination,
  heartbeatSource,
  mintHeartbeat,
  registerProbe,
  waitForTermination,
} from "./helpers/termination-oracle.js";
import { describeProcessFailure, nodeRuntimeEnvironment } from "../src/core/install.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");

const ENV_SECRET = "alphaAOSprocessSentinel0007";
const PARSEABLE_PROCESS_OUTPUT_BYTES = 64 * 1024;

interface ProcessFixture {
  readonly root: string;
  readonly echoScript: string;
  readonly floodScript: string;
  readonly sleepScript: string;
  readonly spawnerScript: string;
  readonly sideEffect: string;
  /**
   * Mints one heartbeat identity for the shared termination oracle. Delegates
   * to `test/helpers/termination-oracle.ts`, because the rule that a heartbeat
   * file is named after the nonce it carries is what makes a well-formed
   * foreign nonce a fixture-integrity tripwire — it belongs to the instrument,
   * not to a fixture that happens to use it.
   */
  mintHeartbeat(): { path: string; nonce: string; args: [string, string] };
  confirmDescendantTermination(): void;
}

async function createProcessFixture(context: { after: (fn: () => Promise<unknown> | unknown) => void }): Promise<ProcessFixture> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-process-"));
  let descendantTerminationConfirmed = false;
  context.after(async () => rm(root, {
    recursive: true,
    force: true,
    // A proven-dead Windows process can still have handles being released.
    // Unobserved/live descendants never acquire this cleanup allowance.
    maxRetries: process.platform === "win32" && descendantTerminationConfirmed ? 10 : 0,
    retryDelay: 50,
  }));

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

  // The descendant that gets judged. `heartbeatSource` installs NOTHING when
  // `argv[2]`/`argv[3]` are absent — no timer and no beat zero — so the plain
  // timeout test below, which passes no heartbeat arguments, is unaffected by
  // this and does not litter the fixture root with a file named `undefined`.
  await writeFile(
    sleepScript,
    [
      ...heartbeatSource,
      "await new Promise((r) => setTimeout(r, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    spawnerScript,
    [
      "import { spawn } from 'node:child_process';",
      // The heartbeat path and nonce are forwarded to the grandchild: the
      // spawner is not what gets judged, the descendant is. They are filtered
      // rather than passed positionally, because an undefined argv entry would
      // make spawn throw when this script is opened without an identity. Same
      // shape as `descendantScript` in test/protocol-session.test.ts.
      "const forwarded = [process.argv[2], process.argv[3], process.argv[4]].filter((value) => value !== undefined);",
      "const child = spawn(process.execPath, forwarded, { detached: false, stdio: 'ignore' });",
      "process.stdout.write(String(child.pid));",
      "await new Promise((r) => setTimeout(r, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    root,
    echoScript,
    floodScript,
    sleepScript,
    spawnerScript,
    sideEffect,
    mintHeartbeat(): { path: string; nonce: string; args: [string, string] } {
      return mintHeartbeat(root);
    },
    confirmDescendantTermination(): void {
      descendantTerminationConfirmed = true;
    },
  };
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
      excerptBytes: PARSEABLE_PROCESS_OUTPUT_BYTES,
    });
    assert.equal(result.code, "ok", `the child failed for injection: ${injection}`);
    assert.equal(result.stdout.capped, false, "the parseable argv response must be retained in full");
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
    excerptBytes: PARSEABLE_PROCESS_OUTPUT_BYTES,
    environment: {
      optional: ["ALPHA_AOS_ALLOWED", "ALPHA_AOS_PADDING"],
      // The ambient environment is offered as a source, but only the declared
      // names may cross the boundary.
      source: {
        ...process.env,
        ALPHA_AOS_ALLOWED: "yes",
        ALPHA_AOS_PADDING: "p".repeat(5_000),
        ALPHA_AOS_TOKEN: ENV_SECRET,
      },
    },
  });
  assert.equal(result.stdout.capped, false, "the parseable environment response must be retained in full");
  const reported = JSON.parse(result.stdout.excerpt) as { env: Record<string, string> };

  assert.equal(reported.env.ALPHA_AOS_ALLOWED, "yes", "an approved name must be delivered");
  assert.equal(reported.env.ALPHA_AOS_PADDING?.length, 5_000, "a response over the diagnostic excerpt limit must remain parseable");
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
    (name) => !["ALPHA_AOS_ALLOWED", "ALPHA_AOS_PADDING"].includes(name) && !PLATFORM_FLOOR_ENVIRONMENT.includes(name),
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
    excerptBytes: PARSEABLE_PROCESS_OUTPUT_BYTES,
    environment: { source: {} },
  });
  const reported = JSON.parse(result.stdout.excerpt) as { env: Record<string, string> };
  const observed = Object.keys(reported.env).sort();

  const expected = [...PLATFORM_FLOOR_ENVIRONMENT]
    .filter((name) => name !== "LOGONSERVER" || reported.env.LOGONSERVER !== undefined)
    .sort();

  assert.deepEqual(
    observed,
    expected,
    "the declared platform floor must match what the OS actually delivers",
  );
});

test("the platform floor is declared per platform rather than only for the running one", () => {
  // The runtime assertion above can only speak for the host it runs on. The
  // floor itself is a pure function of the platform name, so every branch is
  // assertable from any host — which is how a macOS-only regression stops
  // needing a macOS host to be seen.
  assert.ok(
    platformFloorEnvironment("darwin").includes("__CF_USER_TEXT_ENCODING"),
    "CoreFoundation hands __CF_USER_TEXT_ENCODING to every child regardless of the environment block, " +
      "so the darwin floor must name it; CI run 33937610401 (macos-latest) reported exactly this name as " +
      "an undeclared name crossing the process/protocol boundary",
  );

  assert.deepEqual(
    [...platformFloorEnvironment("win32", "x86_64")].sort(),
    [
      "HOMEDRIVE",
      "HOMEPATH",
      "LOGONSERVER",
      "PATH",
      "SYSTEMDRIVE",
      "SYSTEMROOT",
      "TEMP",
      "USERDOMAIN",
      "USERNAME",
      "USERPROFILE",
      "WINDIR",
    ].sort(),
    "the eleven Windows names libuv guarantees a child must stay declared, including the three that are user-identifying",
  );

  assert.deepEqual(
    [...platformFloorEnvironment("win32", "arm64")].sort(),
    [...platformFloorEnvironment("win32", "x86_64"), "PROCESSOR_ARCHITECTURE"].sort(),
    "Windows ARM64 injects its processor architecture in addition to libuv's required names",
  );
  assert.deepEqual(platformFloorEnvironment("linux", "arm64"), [], "ARM64 alone does not imply Windows injection");

  assert.deepEqual(
    platformFloorEnvironment("linux"),
    [],
    "ubuntu-latest passed the runtime exact-match assertion in CI run 33937610401, so the linux floor is empty",
  );

  assert.deepEqual(
    [...PLATFORM_FLOOR_ENVIRONMENT],
    [...platformFloorEnvironment(process.platform)],
    "the exported constant must be the floor function applied to the running platform, never a separate declaration",
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

  // The descendant carries an identity the test minted, forwarded to it by the
  // spawner. Judging it by a bare `process.kill(pid, 0)` was the defect this
  // site is being repaired for: that call answers "may I signal this pid", not
  // "is this process running", and it succeeds against a zombie. The product's
  // own close() contract (src/core/process.ts:690-699) says so outright — a
  // signalled grandchild is nobody's waitpid target, "which is why liveness
  // must be judged by terminal evidence rather than by whether a pid can still
  // be signalled". The old probe made a red leg undecidable between an unreaped
  // zombie and a real containment failure; the shared oracle separates them.
  const hb = fixture.mintHeartbeat();

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.spawnerScript, fixture.sleepScript, ...hb.args],
    cwd: fixture.root,
    timeoutMs: 1500,
  });

  const descendantPid = Number.parseInt(result.stdout.excerpt.trim(), 10);
  assert.ok(Number.isFinite(descendantPid), "descendant pid was not observable; termination assertion cannot pass without evidence");

  // The classifier's `pid-reused` branch is INERT at this site, and that is
  // recorded rather than hidden. A start-time baseline can only be read while
  // the process is alive, and this descendant's pid only becomes observable
  // after `runProcess` has already returned — so `recordedStartTime` is null or
  // read from a zombie. Its absence makes the classifier strictly MORE
  // conservative: `pid-reused` is a rule that RETURNS `terminated`, so a
  // judgment that cannot reach it falls to `indeterminate`, which is a red.
  // That is the correct direction to be wrong in on a safety boundary, the same
  // logic by which `classifyProcessSample` refuses a staleness rule. Identity
  // is carried by the nonce heartbeat instead.
  const probe = await registerProbe({ pid: descendantPid, heartbeatPath: hb.path, nonce: hb.nonce });
  const termination = await waitForTermination(probe, CLOSE_TREE_DEADLINE_MS);
  if (termination.terminated) fixture.confirmDescendantTermination();

  // A pid is signalled only once its identity is confirmed, exactly as every
  // signalling site in test/protocol-session.test.ts does it. `null` is no
  // evidence, which is not confirmation either.
  if (!termination.terminated && termination.heartbeatNonceMatches === true) {
    process.kill(descendantPid, "SIGKILL");
  }

  // One coded line per run, on every leg, green ones included. A leg that goes
  // green without saying HOW the descendant ended has not answered the question
  // — it has only failed to raise it. Coded metadata, never interpolated prose
  // (D-12).
  context.diagnostic(
    `descendant termination evidence (${process.platform}): ${JSON.stringify({
      treeTermination: result.treeTermination ?? null,
      evidence: termination.evidence,
      terminated: termination.terminated,
      observedMs: termination.observedMs,
      lastCounter: termination.lastCounter,
      advanced: termination.advanced,
      heartbeatNonceMatches: termination.heartbeatNonceMatches,
    })}`,
  );

  // Delivery is asserted BEFORE liveness, on purpose. If the group signal fell
  // back to the direct child then a surviving descendant is the CONSEQUENCE,
  // and a liveness assertion firing first would report the symptom in place of
  // the more useful root cause. On POSIX the child is spawned `detached`
  // (src/core/process.ts:334) so it leads its own group, which makes `group`
  // the healthy value and `direct` strictly less termination than the caller
  // asked for.
  if (process.platform !== "win32") {
    assert.notEqual(
      result.treeTermination,
      "direct",
      "the process-group signal was refused and only the direct child was killed, so the descendant was never signalled: "
        + "this is a containment failure, not a reaping delay",
    );
  }

  // `not-required` or `already-gone` fail here. The fixture sleeps 30s
  // precisely so a forced termination must have happened; a run where it did
  // not has proven nothing about the tree, which is new information rather than
  // cause to weaken the assertion. Same reasoning the session side already
  // wrote down at test/protocol-session.test.ts's close-time tree test.
  assert.equal(
    result.treeTermination,
    process.platform === "win32" ? "windows-tree" : "group",
    "the timeout's termination did not reach the child's process group",
  );

  assert.equal(
    termination.terminated,
    true,
    `a timed-out command left a descendant process running (${describeTermination(termination)})`,
  );
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
    join("src", "adapters", "task-agent-launch.ts"),
    join("src", "adapters", "task-agents.ts"),
    join("src", "adapters", "task-codex.ts"),
    join("src", "adapters", "task-claude.ts"),
  ];

  // The task agent adapters launch real harness CLIs, so none may drop out of
  // the enumeration silently.
  for (const adapter of ["task-agents.ts", "task-codex.ts", "task-claude.ts"]) {
    assert.ok(files.includes(join("src", "adapters", adapter)), `the ${adapter} task adapter must stay inside the enumeration`);
  }

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
      PATHEXT: ".EXE;.CMD",
      COMSPEC: "C:\\Windows\\System32\\cmd.exe",
      ALPHA_AOS_FIXTURE_NAME: "named",
      ALPHA_AOS_SECRET_TOKEN: "must-not-cross",
    },
  });
  const materialized = materializeEnvironment(policy);

  assert.equal(materialized.ALPHA_AOS_FIXTURE_NAME, "named", "an operation-named variable must be delivered");
  assert.equal(materialized.ALPHA_AOS_FIXTURE_LITERAL, "value", "a literal the operation sets must be delivered");
  assert.equal(materialized.PATH, "/usr/bin", "a declared runtime name must be delivered");
  assert.equal(materialized.PATHEXT, ".EXE;.CMD", "a Windows package-bin launcher must receive PATHEXT");
  assert.equal(materialized.COMSPEC, "C:\\Windows\\System32\\cmd.exe", "a Windows package-bin launcher must receive COMSPEC");
  assert.equal(
    Object.hasOwn(materialized, "ALPHA_AOS_SECRET_TOKEN"),
    false,
    "an undeclared name from the source must not cross the boundary",
  );
});

// SAFE-06 / Broken Window #4, and 01-21 coverage D5, which say the same thing:
// `commandProbeEnvironment`'s passthrough set was only ever validated on
// Windows. The test above asks what the environment policy DECLARES it passes;
// this one asks whether that declaration is SUFFICIENT for a real binary on the
// platform actually running the suite. A green macos or ubuntu leg was weak
// positive evidence at best — no assertion put the probe's own passthrough
// under test there.
test("a version probe answers under the probe environment on this platform", (context) => {
  // The interpreter running this suite is guaranteed present on all three legs
  // and guaranteed to answer `--version`, so this assertion is never not-run.
  // `readCommandVersion` materializes `commandProbeEnvironment()` for the child,
  // so a non-null answer means that environment ALONE was enough.
  const probed = readCommandVersion(process.execPath);
  const ownVersion = probed ?? "";
  const widenAdvice =
    "the passthrough set in commandProbeEnvironment is what needs widening, not its pinned literals (01-21 D5)";
  assert.ok(
    ownVersion.length > 0,
    `the running interpreter answered nothing under the probe environment on ${process.platform} ` +
      `(got ${JSON.stringify(probed)}); ${widenAdvice}`,
  );
  assert.match(
    ownVersion,
    /^v\d/u,
    `expected a leading v and a digit from the running interpreter on ${process.platform}, ` +
      `got ${JSON.stringify(probed)}; ${widenAdvice}`,
  );

  // `npm` covers both branches of probeCommand: on Windows it is a `.cmd` shim
  // and goes through the `resolveNodePackageCli` normalization, while on POSIX
  // it is executed directly. `node` is always present and is the positive
  // control. `git` is on all three runner images but can be absent on a
  // developer host, so it actually exercises the not-found branch. The list is
  // deliberately not longer: a command nobody has adds diagnostic noise while
  // asserting nothing.
  const observed = ["npm", "node", "git"].map((name) => {
    const probe = probeCommand(name);
    return {
      name,
      found: probe.command !== null,
      resolved: probe.command,
      version: probe.version,
      unsupportedReason: probe.unsupportedReason,
    };
  });

  for (const record of observed) {
    // Not on this host at all: recorded in the diagnostic below, never asserted.
    if (!record.found) continue;
    assert.ok(
      record.version !== null || record.unsupportedReason !== null,
      `${record.name} was found at ${String(record.resolved)} but answered with neither a version nor a ` +
        "stated unsupported reason. A found command that says nothing is exactly the SAFE-06 silence " +
        `Broken Window #4 names: the probe environment was insufficient on ${process.platform} and the ` +
        `outcome went unreported. ${widenAdvice}`,
    );
  }

  // This line is the artifact 01-26 reads off all three legs, so ledger entry
  // #4 is disposed on evidence rather than on the absence of a complaint.
  context.diagnostic(
    `command probe evidence (${process.platform}): ${JSON.stringify(
      observed.map(({ name, found, version, unsupportedReason }) => ({ name, found, version, unsupportedReason })),
    )}`,
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

test("opt-in overflowPolicy drain runs to completion with expected bytes, post-flood marker, UTF-8 cap, and redaction", async (context) => {
  const fixture = await createProcessFixture(context);
  const drainScript = join(fixture.root, "drain-test.mjs");
  const postFloodMarkerFile = join(fixture.root, "post-flood-marker.txt");

  const secretValue = "secret-token-drain-val-987654";
  const postFloodMarker = "\n__POST_FLOOD_MARKER_SUCCESS__\n";
  const utf8MultiByte = "✨ UTF-8 Multi-Byte Rocket 🚀 Test 🎉\n";
  const floodChunk = "X".repeat(1024);
  const floodChunksCount = 30; // 30KB of flood

  await writeFile(
    drainScript,
    [
      `import { writeFile } from 'node:fs/promises';`,
      `const secret = process.env.ALPHA_DRAIN_SECRET || '';`,
      `process.stdout.write('SECRET=' + secret + '\\n');`,
      `process.stdout.write(${JSON.stringify(utf8MultiByte)});`,
      `const chunk = ${JSON.stringify(floodChunk)};`,
      `for (let i = 0; i < ${floodChunksCount}; i++) {`,
      `  process.stdout.write(chunk);`,
      `}`,
      `process.stdout.write(${JSON.stringify(postFloodMarker)});`,
      `await writeFile(${JSON.stringify(postFloodMarkerFile)}, "post-flood-confirmed", "utf8");`,
      `process.exit(0);`,
    ].join("\n"),
    "utf8",
  );

  const secretLineBytes = Buffer.byteLength(`SECRET=${secretValue}\n`, "utf8");
  const utf8LineBytes = Buffer.byteLength(utf8MultiByte, "utf8");
  const floodBytes = floodChunksCount * 1024;
  const markerBytes = Buffer.byteLength(postFloodMarker, "utf8");
  const expectedTotalBytes = secretLineBytes + utf8LineBytes + floodBytes + markerBytes;

  let spawnedPid: number | undefined;
  const result = await runProcess({
    executable: process.execPath,
    args: [drainScript],
    cwd: fixture.root,
    timeoutMs: 10_000,
    maxOutputBytes: 1024,
    excerptBytes: 1024,
    overflowPolicy: "drain",
    environment: {
      literal: {
        ALPHA_DRAIN_SECRET: secretValue,
      },
    },
    onSpawn: (info) => {
      spawnedPid = info.pid;
    },
  });

  assert.equal(result.code, "ok");
  assert.equal(result.exitCode, 0);
  assert.ok(typeof spawnedPid === "number" && spawnedPid > 0);
  assert.equal(result.stdout.capped, true);
  assert.equal(result.outputCapped, true);
  assert.equal(result.stdout.totalBytes, expectedTotalBytes);

  assert.ok(existsSync(postFloodMarkerFile), "child must write post-flood marker file after completing full flood");
  const markerContent = await readFile(postFloodMarkerFile, "utf8");
  assert.equal(markerContent, "post-flood-confirmed");

  const excerptBytes = Buffer.byteLength(result.stdout.excerpt, "utf8");
  assert.ok(excerptBytes <= 1024, `excerpt bytes (${excerptBytes}) must not exceed maxOutputBytes (1024)`);
  assert.ok(!result.stdout.excerpt.includes(secretValue), "secret must not appear in excerpt");
  assert.ok(result.stdout.excerpt.includes("[redacted:secret:"), "excerpt must include redaction placeholder");
});

test("default overflowPolicy terminates child with output-cap when limit is exceeded", async (context) => {
  const fixture = await createProcessFixture(context);

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.floodScript],
    cwd: fixture.root,
    timeoutMs: 30_000,
    maxOutputBytes: 4096,
  });

  assert.equal(result.code, "output-cap");
  assert.equal(result.outputCapped, true);
  assert.equal(result.stdout.capped, true);
  assert.ok(result.stdout.totalBytes > 4096 * 8, "child must exceed 8x limit before being killed");
});

test("onSpawn hook is never called when executable does not exist", async (context) => {
  const fixture = await createProcessFixture(context);
  let spawnHookCalled = false;
  const missingExe = join(fixture.root, "nonexistent-cmd.exe");

  const result = await runProcess({
    executable: missingExe,
    args: [],
    cwd: fixture.root,
    onSpawn: () => {
      spawnHookCalled = true;
    },
  });

  assert.equal(result.code, "spawn-failed");
  assert.equal(spawnHookCalled, false, "onSpawn must not be called when executable fails to spawn");
});

test("onSpawn hook receives concrete PID with handlers ready on successful spawn", async (context) => {
  const fixture = await createProcessFixture(context);
  let spawnedPid: number | undefined;

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.echoScript, "hello-spawn"],
    cwd: fixture.root,
    excerptBytes: PARSEABLE_PROCESS_OUTPUT_BYTES,
    onSpawn: (info) => {
      spawnedPid = info.pid;
    },
  });

  assert.equal(result.code, "ok");
  assert.equal(typeof spawnedPid, "number");
  assert.ok(spawnedPid! > 0, "onSpawn must receive a concrete positive integer PID");
  assert.equal(result.stdout.capped, false);
  assert.equal(result.stderr.capped, false);
  assert.equal(result.outputCapped, false);
  const parsed = JSON.parse(result.stdout.excerpt) as { argv: string[] };
  assert.deepEqual(parsed.argv, ["hello-spawn"]);
});

test("onSpawn hook exceptions do not crash runProcess or abort child execution", async (context) => {
  const fixture = await createProcessFixture(context);
  let hookThrew = false;

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.echoScript, "after-throwing-hook"],
    cwd: fixture.root,
    excerptBytes: PARSEABLE_PROCESS_OUTPUT_BYTES,
    onSpawn: () => {
      hookThrew = true;
      throw new Error("simulated onSpawn hook failure");
    },
  });

  assert.equal(result.code, "ok");
  assert.equal(hookThrew, true);
  assert.equal(result.stdout.capped, false);
  assert.equal(result.stderr.capped, false);
  assert.equal(result.outputCapped, false);
  const parsed = JSON.parse(result.stdout.excerpt) as { argv: string[] };
  assert.deepEqual(parsed.argv, ["after-throwing-hook"]);
});

test("spawnDetachedProcess throws TypeError synchronously before spawn when onError is omitted or invalid", async (context) => {
  const fixture = await createProcessFixture(context);
  assert.throws(
    () => (spawnDetachedProcess as unknown as (spec: unknown) => void)({ executable: process.execPath, args: [], cwd: fixture.root }),
    TypeError,
  );
  assert.throws(
    () => (spawnDetachedProcess as unknown as (spec: unknown) => void)({ executable: process.execPath, args: [], cwd: fixture.root, onError: "not-a-func" }),
    TypeError,
  );
});

test("spawnDetachedProcess with supplied onError receives error in isolated subprocess without crash", async (context) => {
  const fixture = await createProcessFixture(context);
  const probeScript = join(fixture.root, "detached-error-probe.mjs");
  const missingExe = join(fixture.root, "nonexistent-detached-target.exe");

  const processModuleUrl = pathToFileURL(resolve(repositoryRoot, "dist", "src", "core", "process.js")).href;
  await writeFile(
    probeScript,
    [
      `import { spawnDetachedProcess } from ${JSON.stringify(processModuleUrl)};`,
      `let handled = false;`,
      `try {`,
      `  const handle = spawnDetachedProcess({`,
      `    executable: ${JSON.stringify(missingExe)},`,
      `    args: [],`,
      `    cwd: process.cwd(),`,
      `    onError: (err) => {`,
      `      handled = true;`,
      `      process.stdout.write(JSON.stringify({ code: err.code || err.name, handled: true }));`,
      `      process.exit(0);`,
      `    },`,
      `  });`,
      `  handle.unref();`,
      `} catch (e) {`,
      `  process.stderr.write("unexpected sync error: " + e.message);`,
      `  process.exit(2);`,
      `}`,
      `setTimeout(() => {`,
      `  if (!handled) {`,
      `    process.stderr.write("timeout waiting for onError");`,
      `    process.exit(1);`,
      `  }`,
      `}, 3000).unref();`,
    ].join("\n"),
    "utf8",
  );

  const result = await runProcess({
    executable: process.execPath,
    args: [probeScript],
    cwd: fixture.root,
    timeoutMs: 5000,
  });

  assert.equal(result.code, "ok");
  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout.excerpt.trim()) as { code: string; handled: boolean };
  assert.equal(parsed.handled, true);
  assert.ok(parsed.code.length > 0);
});

test("deadline with descendant holding inherited pipes yields unconfirmed timeout within cleanup grace", { concurrency: false }, async (context) => {
  const fixture = await createProcessFixture(context);
  const descendantScript = join(fixture.root, "pipe-holding-descendant.mjs");
  const parentScript = join(fixture.root, "direct-parent-spawner.mjs");
  const descendantPidFile = join(fixture.root, "descendant.pid");
  const descendantReadyFile = join(fixture.root, "descendant.ready");
  const parentExitFile = join(fixture.root, "parent-exit.marker");

  await writeFile(
    descendantScript,
    [
      `import { writeFile } from 'node:fs/promises';`,
      `const [pidFile, readyFile] = process.argv.slice(2);`,
      `if (pidFile) await writeFile(pidFile, String(process.pid), 'utf8');`,
      `if (readyFile) await writeFile(readyFile, 'PIPE_HOLDER_READY', 'utf8');`,
      `await new Promise((r) => setTimeout(r, 2000));`,
      `process.exit(0);`,
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    parentScript,
    [
      `import { spawn } from 'node:child_process';`,
      `import { writeFile } from 'node:fs/promises';`,
      `const [childScript, pidFile, readyFile, parentExit] = process.argv.slice(2);`,
      `const child = spawn(process.execPath, [childScript, pidFile, readyFile], {`,
      `  detached: true,`,
      `  stdio: ['ignore', 'inherit', 'inherit'],`,
      `});`,
      `child.unref();`,
      `process.stdout.write('PARENT_EXITING\\n');`,
      `if (parentExit) await writeFile(parentExit, String(process.pid), 'utf8');`,
      `process.exit(0);`,
    ].join("\n"),
    "utf8",
  );

  let directParentPid: number | undefined;
  let descendantPid: number | undefined;
  context.after(async () => {
    context.mock.restoreAll();
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
  });

  const TARGET_DEADLINE_MS = 150;
  const originalSetTimeout = globalThis.setTimeout;
  let capturedDeadlineCallback: (() => void) | null = null;
  let capturedDeadlineTimer: NodeJS.Timeout | null = null;

  context.mock.method(globalThis, "setTimeout", ((
    callback: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ): NodeJS.Timeout => {
    if (delay === TARGET_DEADLINE_MS && capturedDeadlineCallback === null) {
      // Retain a real Timeout object for unref/clearTimeout without triggering early
      const dummyTimer = originalSetTimeout(() => {}, 60_000);
      dummyTimer.unref();
      capturedDeadlineTimer = dummyTimer;
      capturedDeadlineCallback = () => {
        try {
          clearTimeout(dummyTimer);
        } catch {}
        callback(...args);
      };
      return dummyTimer;
    }
    return originalSetTimeout(callback, delay, ...args);
  }) as typeof globalThis.setTimeout);

  try {
    const runPromise = runProcess({
      executable: process.execPath,
      args: [parentScript, descendantScript, descendantPidFile, descendantReadyFile, parentExitFile],
      cwd: fixture.root,
      timeoutMs: TARGET_DEADLINE_MS,
      cleanupGraceMs: 200,
      onSpawn: ({ pid }) => {
        directParentPid = pid;
      },
    });

    // Deterministic readiness barrier with finite startup guard:
    const guardTimeoutMs = 5000;
    const guardStart = Date.now();
    let ready = false;

    while (Date.now() - guardStart < guardTimeoutMs) {
      if (
        capturedDeadlineCallback !== null &&
        existsSync(descendantPidFile) &&
        existsSync(descendantReadyFile) &&
        existsSync(parentExitFile)
      ) {
        const rawPid = await readFile(descendantPidFile, "utf8");
        const readyMarker = await readFile(descendantReadyFile, "utf8");
        const parsedPid = Number.parseInt(rawPid.trim(), 10);
        if (
          !Number.isNaN(parsedPid) &&
          parsedPid > 0 &&
          readyMarker.trim() === "PIPE_HOLDER_READY"
        ) {
          // Direct parent exit proof:
          let directParentExited = true;
          if (directParentPid !== undefined) {
            try {
              process.kill(directParentPid, 0);
              directParentExited = false;
            } catch {
              directParentExited = true;
            }
          }

          // Descendant liveness proof:
          let descendantAlive = false;
          try {
            process.kill(parsedPid, 0);
            descendantAlive = true;
          } catch {
            descendantAlive = false;
          }

          if (directParentExited && descendantAlive) {
            descendantPid = parsedPid;
            ready = true;
            break;
          }
        }
      }
      await new Promise((r) => originalSetTimeout(r, 20));
    }

    assert.ok(
      ready,
      "deterministic readiness barrier must prove descendant marker and direct parent exit before deadline",
    );
    assert.ok(descendantPid !== undefined && descendantPid > 0, "descendant identity must be proven");
    const deadlineCallback = capturedDeadlineCallback as (() => void) | null;
    assert.ok(deadlineCallback !== null, "target deadline timer must be intercepted");

    // Trigger the captured deadline callback after the barrier is fully satisfied
    const deadlineTriggeredAt = Date.now();
    deadlineCallback();

    const result = await runPromise;
    const deadlineSettlementElapsed = Date.now() - deadlineTriggeredAt;

    assert.equal(result.code, "timeout");
    assert.equal(result.closeConfirmed, false, "closeConfirmed must be false when descendant holds pipes open");
    assert.ok(
      deadlineSettlementElapsed < 900,
      `duration (${deadlineSettlementElapsed}ms) must resolve within cleanup grace (< 900ms), not wait for descendant`,
    );

    // Verify owned descendant self-exits cleanly
    const waitSelfExitStart = Date.now();
    let isAlive = true;
    while (isAlive && Date.now() - waitSelfExitStart < 3500) {
      try {
        process.kill(descendantPid, 0);
        isAlive = true;
        await new Promise((r) => originalSetTimeout(r, 50));
      } catch {
        isAlive = false;
      }
    }
    assert.equal(isAlive, false, "descendant must have self-exited cleanly, leaving no lasting process");
  } finally {
    context.mock.restoreAll();
    if (capturedDeadlineTimer) {
      try {
        clearTimeout(capturedDeadlineTimer);
      } catch {}
    }
  }
});

test("normal timeout with cleanly terminated child keeps closeConfirmed true", async (context) => {
  const fixture = await createProcessFixture(context);

  const result = await runProcess({
    executable: process.execPath,
    args: [fixture.sleepScript],
    cwd: fixture.root,
    timeoutMs: 200,
    cleanupGraceMs: 2000,
  });

  assert.equal(result.code, "timeout");
  assert.equal(result.closeConfirmed, true, "normal cleanly terminated timeout must have closeConfirmed true");
});

test("abort with descendant holding inherited pipes yields unconfirmed cancellation while clean abort confirms close", { concurrency: false }, async (context) => {
  const fixture = await createProcessFixture(context);
  const descendantScript = join(fixture.root, "abort-pipe-descendant.mjs");
  const parentScript = join(fixture.root, "abort-direct-parent.mjs");
  const descendantPidFile = join(fixture.root, "abort-descendant.pid");
  const barrierFile = join(fixture.root, "abort-barrier.txt");
  const parentExitFile = join(fixture.root, "abort-parent-exit.txt");

  await writeFile(
    descendantScript,
    [
      `import { writeFile } from 'node:fs/promises';`,
      `const [pidFile, barrier] = process.argv.slice(2);`,
      `if (pidFile) await writeFile(pidFile, String(process.pid), 'utf8');`,
      `if (barrier) await writeFile(barrier, 'PIPE_HOLDER_READY', 'utf8');`,
      `await new Promise((r) => setTimeout(r, 2000));`,
      `process.exit(0);`,
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    parentScript,
    [
      `import { spawn } from 'node:child_process';`,
      `import { writeFile } from 'node:fs/promises';`,
      `const [childScript, pidFile, barrier, parentExit] = process.argv.slice(2);`,
      `const child = spawn(process.execPath, [childScript, pidFile, barrier], {`,
      `  detached: true,`,
      `  stdio: ['ignore', 'inherit', 'inherit'],`,
      `});`,
      `child.unref();`,
      `process.stdout.write('PARENT_READY\\n');`,
      `if (parentExit) await writeFile(parentExit, String(process.pid), 'utf8');`,
      `process.exit(0);`,
    ].join("\n"),
    "utf8",
  );

  let directParentPid: number | undefined;
  let descendantPid: number | undefined;
  context.after(async () => {
    if (descendantPid) {
      try { process.kill(descendantPid, "SIGKILL"); } catch {}
    }
  });

  // Part A: Abort while descendant holds pipes -> closeConfirmed false
  const abortController = new AbortController();
  const runPromise = runProcess({
    executable: process.execPath,
    args: [parentScript, descendantScript, descendantPidFile, barrierFile, parentExitFile],
    cwd: fixture.root,
    signal: abortController.signal,
    timeoutMs: 10_000,
    cleanupGraceMs: 200,
    onSpawn: ({ pid }) => {
      directParentPid = pid;
    },
  });

  // Deterministic readiness barrier with finite startup guard:
  const barrierWaitStart = Date.now();
  let barrierReady = false;
  while (Date.now() - barrierWaitStart < 5000) {
    if (
      existsSync(barrierFile) &&
      existsSync(descendantPidFile) &&
      existsSync(parentExitFile)
    ) {
      const rawPid = await readFile(descendantPidFile, "utf8");
      const barrierMarker = await readFile(barrierFile, "utf8");
      const parsedPid = Number.parseInt(rawPid.trim(), 10);
      if (
        !Number.isNaN(parsedPid) &&
        parsedPid > 0 &&
        barrierMarker.trim() === "PIPE_HOLDER_READY"
      ) {
        let parentExited = true;
        if (directParentPid !== undefined) {
          try {
            process.kill(directParentPid, 0);
            parentExited = false;
          } catch {
            parentExited = true;
          }
        }
        let descendantAlive = false;
        try {
          process.kill(parsedPid, 0);
          descendantAlive = true;
        } catch {
          descendantAlive = false;
        }
        if (parentExited && descendantAlive) {
          descendantPid = parsedPid;
          barrierReady = true;
          break;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 20));
  }

  // Assert barrier success BEFORE abort! Do not unconditionally abort after failed readiness loop.
  assert.ok(barrierReady, "abort barrier must be proven ready before triggering abort");
  assert.ok(descendantPid !== undefined && descendantPid > 0, "descendant identity must be proven before abort");

  const abortTriggeredAt = Date.now();
  abortController.abort();

  const unconfirmedResult = await runPromise;
  const abortElapsed = Date.now() - abortTriggeredAt;

  assert.equal(unconfirmedResult.code, "cancelled");
  assert.equal(unconfirmedResult.closeConfirmed, false, "cancellation with surviving pipe-holder must be unconfirmed");
  if (process.platform === "win32") {
    assert.equal(unconfirmedResult.treeTermination, "already-gone", "an exited Windows parent must not be signalled again");
  }
  assert.ok(abortElapsed < 900, `unconfirmed cancellation (${abortElapsed}ms) must resolve within cleanup grace (< 900ms)`);

  // Part B: Clean abort on normal child -> closeConfirmed true
  const cleanController = new AbortController();
  const cleanPromise = runProcess({
    executable: process.execPath,
    args: [fixture.sleepScript],
    cwd: fixture.root,
    signal: cleanController.signal,
    timeoutMs: 10_000,
    cleanupGraceMs: 2000,
    onSpawn: () => {
      cleanController.abort();
    },
  });

  const confirmedResult = await cleanPromise;
  assert.equal(confirmedResult.code, "cancelled");
  assert.equal(confirmedResult.closeConfirmed, true, "clean cancellation must report closeConfirmed true");

  // Part C: Ensure descendant has cleanly self-exited
  if (descendantPid) {
    const waitSelfExitStart = Date.now();
    let isAlive = true;
    while (isAlive && Date.now() - waitSelfExitStart < 3500) {
      try {
        process.kill(descendantPid, 0);
        isAlive = true;
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        isAlive = false;
      }
    }
    assert.equal(isAlive, false, "descendant must have self-exited cleanly, leaving no lasting process");
  }
});
