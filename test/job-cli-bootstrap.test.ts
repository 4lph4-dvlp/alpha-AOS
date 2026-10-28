import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { commandProbeEnvironment, runProcess } from "../src/core/process.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("job bootstrap: actual job and both worker aliases do not load unused installer catalogs", async (context) => {
  const base = await realpath(await mkdtemp(join(tmpdir(), "alpha-job-bootstrap-")));
  // A terminal job receipt can precede the worker releasing its Windows cwd
  // handle. Retry cleanup briefly; a persistent lock still fails the test.
  context.after(() => rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const packageRoot = join(base, "package"), projectRoot = join(base, "project"), stateRoot = join(base, "state");
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await mkdir(join(packageRoot, "catalog"));
  await mkdir(projectRoot);
  await mkdir(stateRoot);
  await cp(join(repositoryRoot, "dist", "src"), join(packageRoot, "dist", "src"), { recursive: true });
  await cp(join(repositoryRoot, "schemas"), join(packageRoot, "schemas"), { recursive: true });
  await cp(join(repositoryRoot, "package.json"), join(packageRoot, "package.json"));
  await symlink(join(repositoryRoot, "node_modules"), join(packageRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(join(packageRoot, "catalog", "stack.yaml"), "BROKEN_INSTALLER_CATALOG: [\n", "utf8");
  await writeFile(join(packageRoot, "catalog", "stack.lock.json"), "{ BROKEN_INSTALLER_LOCK", "utf8");
  await rm(join(packageRoot, "dist", "src", "core", "mcp-proxy.js"));
  const cli = join(packageRoot, "dist", "src", "cli.js");
  const probe = commandProbeEnvironment({ source: process.env });
  const invoke = (args: string[]) => runProcess({
    executable: process.execPath, args: [cli, ...args], cwd: projectRoot,
    environment: { ...probe, literal: { ...probe.literal, ALPHA_AOS_STATE_DIR: stateRoot } }, timeoutMs: 10_000,
    maxOutputBytes: 16 * 1024, excerptBytes: 16 * 1024,
  });
  const preview = await invoke(["job", "start", "--cwd", projectRoot, "--deadline-ms", "5000", "--json", "--", process.execPath, "-e", "process.exit(0)"]);
  assert.equal(preview.code, "ok", preview.stderr.excerpt);
  assert.equal(preview.outputCapped, false);
  const payload = JSON.parse(preview.stdout.excerpt) as { applied: boolean; args: string[]; deadlineMs: number };
  assert.equal(payload.applied, false);
  assert.deepEqual(payload.args, ["-e", "process.exit(0)"]);
  assert.equal(payload.deadlineMs, 5000);
  assert.deepEqual(await readdir(stateRoot), [], "a preview must create no private state");
  for (const prefix of [["job-worker"], ["job", "worker"]]) {
    const missing = await invoke([...prefix, "--state-root", stateRoot, "--job-id", "job-0000000000000001", "--owner-token", "fixture-owner"]);
    assert.equal(missing.exitCode, 1, missing.stderr.excerpt);
    assert.match(missing.stderr.excerpt, /Worker failed to read job record:/u);
    assert.doesNotMatch(missing.stderr.excerpt, /BROKEN_INSTALLER|YAMLParseError|Unexpected token/u);
    assert.deepEqual(await readdir(stateRoot), [], "a missing worker record must not create state");
  }
  const malformed = await invoke(["job-worker", "--state-root", stateRoot]);
  assert.equal(malformed.exitCode, 1);
  assert.equal(malformed.stderr.excerpt.trim(), "job-worker requires --job-id and --owner-token");
  const invalid = await invoke(["job", "start", "--json"]);
  assert.equal(invalid.exitCode, 2);
  assert.equal(JSON.parse(invalid.stdout.excerpt).reasonCode, "COMMAND_FAILED");
  assert.match(invalid.stderr.excerpt, /job start requires '-- <executable>/u);
  assert.doesNotMatch(invalid.stderr.excerpt, /ERR_MODULE_NOT_FOUND|mcp-proxy/u);
  const started = await invoke(["job", "start", "--cwd", projectRoot, "--deadline-ms", "5000", "--apply", "--json", "--", process.execPath, "-e", "console.log('BOOTSTRAP_REAL_JOB')"]);
  assert.equal(started.exitCode, 0, started.stderr.excerpt);
  const job = JSON.parse(started.stdout.excerpt) as { jobId: string };
  assert.match(job.jobId, /^job-[0-9a-f]{16}$/u);
  const waited = await invoke(["job", "wait", job.jobId, "--timeout-ms", "5000", "--json"]);
  assert.equal(waited.exitCode, 0, waited.stderr.excerpt);
  const terminal = JSON.parse(waited.stdout.excerpt) as { jobId: string; status: string; exitCode: number; output: { stdout: string } };
  assert.equal(terminal.jobId, job.jobId);
  assert.equal(terminal.status, "completed");
  assert.equal(terminal.exitCode, 0);
  assert.match(terminal.output.stdout, /BOOTSTRAP_REAL_JOB/u);
});
