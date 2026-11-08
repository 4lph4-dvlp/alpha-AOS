import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ComponentPlanError } from "../src/core/component-session.js";
import {
  applyCodexGsdHookCompatibility,
  discoverCodexHookHelperClosure,
  extractLocalHookSpecifiers,
  inspectPureUpstreamCodexStopHook,
  planCodexGsdHookCompatibility,
  planCodexGsdHookCompatibilityOperation,
  smokeTestCodexGsdStopHook,
  stripJsComments,
} from "../src/core/gsd-compat.js";
import { acquireMutationSession, inspectWriterState, writerLockPath } from "../src/core/writer-lock.js";
import type { StackLock } from "../src/types.js";

const lock: StackLock = {
  schemaVersion: 1,
  channel: "stable",
  generatedAt: null,
  components: { gsd: { package: "@opengsd/gsd-core", version: "1.12.0", integrity: "sha512-fixture", profile: "standard" } },
};

const HELPERS = ["hook-exit.js", "cli-exit.js", "exit-code-registry.js"] as const;

interface Fixture {
  root: string;
  configRoot: string;
  sourceRoot: string;
  stateRoot: string;
}

/** A Codex config whose Stop hook needs the helper closure, plus a source tree. */
async function createFixture(context: { after: (fn: () => Promise<unknown>) => void }, label: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-gsd-compat-test-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, "config");
  const sourceRoot = join(root, "source");
  const stateRoot = join(root, "state");
  await mkdir(join(configRoot, "hooks"), { recursive: true });
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(configRoot, "hooks", "gsd-context-monitor.js"), [
    "const { allow } = require('./lib/hook-exit.js');",
    "process.stdin.resume();",
    "process.stdin.on('end', () => allow(undefined));",
    "",
  ].join("\n"));
  await writeFile(join(sourceRoot, "hook-exit.js"), "const { terminateNow } = require('./cli-exit.js');\nmodule.exports = { allow: (value) => terminateNow(value) };\n");
  await writeFile(join(sourceRoot, "cli-exit.js"), "require('./exit-code-registry.js');\nmodule.exports = { terminateNow: () => process.exit(0) };\n");
  await writeFile(join(sourceRoot, "exit-code-registry.js"), "module.exports = {};\n");
  return { root, configRoot, sourceRoot, stateRoot };
}

function destinations(configRoot: string): string[] {
  return HELPERS.map((file) => join(configRoot, "hooks", "lib", file));
}

test("Codex GSD compatibility installs missing helper closure and smoke-tests Stop", async (context) => {
  const fixture = await createFixture(context, "standalone");

  const before = await planCodexGsdHookCompatibility(fixture.configRoot);
  assert.equal(before.required, true);
  assert.equal(before.entries.every((entry) => entry.action === "create"), true);

  const result = await applyCodexGsdHookCompatibility(lock, {
    configRoot: fixture.configRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.ok(result.operationId);
  assert.equal((await smokeTestCodexGsdStopHook(fixture.configRoot)).ok, true);
  const after = await planCodexGsdHookCompatibility(fixture.configRoot);
  assert.equal(after.entries.every((entry) => entry.action === "verify"), true);

  // A standalone apply owns its session, so it releases the writer it took.
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
  assert.equal((await inspectWriterState(fixture.stateRoot)).status, "free");
});

test("the reviewed plan names every path role, source hash and declared child before apply", async (context) => {
  const fixture = await createFixture(context, "plan");
  const plan = await planCodexGsdHookCompatibilityOperation(lock, {
    configRoot: fixture.configRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  assert.equal(plan.proofs.proven, true);
  for (const role of ["target", "state", "journal", "snapshot", "source", "package-root"] as const) {
    assert.ok(plan.proofs.get(role), `plan must declare the ${role} role`);
  }
  assert.deepEqual(plan.sources.map((source) => source.file), [...HELPERS].sort());
  assert.equal(plan.sources.every((source) => typeof source.sourceHash === "string"), true, "a supplied source tree is hash-bound at review time");
  assert.equal(plan.sources.every((source) => source.action === "create"), true);
  // A supplied source tree needs no package steps, so none are declared.
  assert.equal(plan.processes.length, 0);
  assert.equal(plan.environmentNames.includes("PATH") || plan.environmentNames.includes("Path"), true);
  assert.equal(plan.digest.length, 64);

  // Planning is read-only: nothing exists yet.
  assert.equal(destinations(fixture.configRoot).some((path) => existsSync(path)), false);
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});

test("a nested apply consumes the caller session and never takes a second writer lock", async (context) => {
  const fixture = await createFixture(context, "nested");
  const plan = await planCodexGsdHookCompatibilityOperation(lock, {
    configRoot: fixture.configRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  // The caller owns the writer, exactly as install orchestration will.
  const session = await acquireMutationSession({
    stateRoot: fixture.stateRoot,
    proofs: plan.proofs,
    planDigest: plan.digest,
  });
  let closed = false;
  context.after(async () => {
    if (!closed) await session.close();
  });

  // The lock is exclusive-create: a nested acquisition would raise
  // WriterConflictError here rather than succeeding.
  const result = await applyCodexGsdHookCompatibility(lock, {
    plan,
    session,
    configRoot: fixture.configRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  assert.equal(result.operationId, session.operationId, "a nested apply journals under the caller's operation");
  for (const file of HELPERS) {
    const written = await readFile(join(fixture.configRoot, "hooks", "lib", file));
    const source = await readFile(join(fixture.sourceRoot, file));
    assert.deepEqual(written, source);
  }

  // The callee must not release a writer it did not take.
  assert.equal((await inspectWriterState(fixture.stateRoot)).status, "active");
  await session.close();
  closed = true;
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});

test("a plan reviewed before the source changed refuses and writes nothing", async (context) => {
  const fixture = await createFixture(context, "drift");
  const plan = await planCodexGsdHookCompatibilityOperation(lock, {
    configRoot: fixture.configRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  await writeFile(join(fixture.sourceRoot, "hook-exit.js"), "module.exports = { allow: () => process.exit(1) };\n");

  await assert.rejects(
    () => applyCodexGsdHookCompatibility(lock, {
      plan,
      configRoot: fixture.configRoot,
      stateRoot: fixture.stateRoot,
      verifiedSourceRoot: fixture.sourceRoot,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ComponentPlanError);
      assert.equal(error.code, "plan-drift");
      return true;
    },
  );

  assert.equal(destinations(fixture.configRoot).some((path) => existsSync(path)), false, "a refused plan writes nothing");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "a refused plan never takes the writer");
  assert.equal(existsSync(join(fixture.stateRoot, "journal")), false);
});

test("an apply whose caller session owns another state root refuses before mutating", async (context) => {
  const fixture = await createFixture(context, "mismatch");
  const otherStateRoot = join(fixture.root, "other-state");
  const plan = await planCodexGsdHookCompatibilityOperation(lock, {
    configRoot: fixture.configRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  const foreign = await planCodexGsdHookCompatibilityOperation(lock, {
    configRoot: fixture.configRoot,
    stateRoot: otherStateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  const session = await acquireMutationSession({
    stateRoot: otherStateRoot,
    proofs: foreign.proofs,
    planDigest: foreign.digest,
  });
  context.after(async () => session.close());

  await assert.rejects(
    () => applyCodexGsdHookCompatibility(lock, {
      plan,
      session,
      configRoot: fixture.configRoot,
      stateRoot: fixture.stateRoot,
      verifiedSourceRoot: fixture.sourceRoot,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ComponentPlanError);
      assert.equal(error.code, "session-mismatch");
      return true;
    },
  );

  assert.equal(destinations(fixture.configRoot).some((path) => existsSync(path)), false);
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});

test("stripJsComments removes block and line comments while preserving strings", () => {
  const code = [
    "// single comment",
    "/* multi",
    "   comment */",
    "const a = 'hello // not a comment';",
    "const b = `world /* not a comment */`;",
    "require('./lib/real.js'); // inline comment",
  ].join("\n");

  const stripped = stripJsComments(code);
  assert.ok(!stripped.includes("single comment"));
  assert.ok(!stripped.includes("multi"));
  assert.ok(stripped.includes("hello // not a comment"));
  assert.ok(stripped.includes("world /* not a comment */"));
  assert.ok(stripped.includes("require('./lib/real.js')"));
});

test("extractLocalHookSpecifiers extracts literals and rejects dynamic or escaping require", () => {
  const valid = [
    "const a = require('./lib/hook-exit.js');",
    "import { b } from './lib/cli-exit.js';",
    "const external = require('external-pkg');",
  ].join("\n");
  const extracted = extractLocalHookSpecifiers(valid, "valid.js");
  assert.deepEqual(extracted, ["./lib/hook-exit.js", "./lib/cli-exit.js"]);

  // Dynamic require must throw ComponentPlanError
  const dynamicRequire = "const a = require('./lib/' + dynamicName);";
  assert.throws(
    () => extractLocalHookSpecifiers(dynamicRequire, "dynamic.js"),
    (err: unknown) => {
      assert.ok(err instanceof ComponentPlanError);
      assert.equal(err.code, "plan-incomplete");
      return true;
    },
  );

  // Escaping relative path must throw ComponentPlanError
  const escapingRequire = "const a = require('./lib/../../escape.js');";
  assert.throws(
    () => extractLocalHookSpecifiers(escapingRequire, "escape.js"),
    (err: unknown) => {
      assert.ok(err instanceof ComponentPlanError);
      assert.equal(err.code, "plan-incomplete");
      return true;
    },
  );
});

test("discoverCodexHookHelperClosure traverses helper dependency graph and validates bounds", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-closure-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const hooksDir = join(root, "hooks");
  const hooksLibDir = join(hooksDir, "lib");
  await mkdir(hooksLibDir, { recursive: true });

  const monitorPath = join(hooksDir, "gsd-context-monitor.js");
  await writeFile(monitorPath, "const { allow } = require('./lib/main-helper.js');\n");
  await writeFile(join(hooksLibDir, "main-helper.js"), "require('./sub-helper.js');\n");
  await writeFile(join(hooksLibDir, "sub-helper.js"), "// leaf\n");

  const closure = await discoverCodexHookHelperClosure({
    monitorPath,
    upstreamHooksLibRoot: hooksLibDir,
    installedHooksLibRoot: hooksLibDir,
  });

  assert.equal(closure.required, true);
  assert.deepEqual(closure.helpers, ["main-helper.js", "sub-helper.js"]);
  assert.deepEqual(closure.missingInInstalled, []);

  // When referenced helper does not exist upstream, it must throw ComponentPlanError
  await writeFile(join(hooksLibDir, "main-helper.js"), "require('./missing-helper.js');\n");
  await assert.rejects(
    () => discoverCodexHookHelperClosure({
      monitorPath,
      upstreamHooksLibRoot: hooksLibDir,
      installedHooksLibRoot: hooksLibDir,
    }),
    (err: unknown) => {
      assert.ok(err instanceof ComponentPlanError);
      assert.equal(err.code, "plan-incomplete");
      return true;
    },
  );
});

test("inspectPureUpstreamCodexStopHook detects resolved-upstream when all helpers exist and smoke passes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-pure-upstream-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const hooksDir = join(root, "hooks");
  const hooksLibDir = join(hooksDir, "lib");
  await mkdir(hooksLibDir, { recursive: true });

  const monitorPath = join(hooksDir, "gsd-context-monitor.js");
  await writeFile(monitorPath, [
    "const { allow } = require('./lib/hook-exit.js');",
    "process.stdin.resume();",
    "process.stdin.on('end', () => allow(undefined));",
    "",
  ].join("\n"));

  // Before helpers are present: active, resolution: applied
  const before = await inspectPureUpstreamCodexStopHook(root, "1.13.0");
  assert.equal(before.status, "active");
  assert.equal(before.resolution, "applied");
  assert.ok(before.missingHelpers.length > 0);

  // Provide native upstream helpers
  await writeFile(join(hooksLibDir, "hook-exit.js"), "const { terminateNow } = require('./cli-exit.js');\nmodule.exports = { allow: (value) => terminateNow(value) };\n");
  await writeFile(join(hooksLibDir, "cli-exit.js"), "require('./exit-code-registry.js');\nmodule.exports = { terminateNow: () => process.exit(0) };\n");
  await writeFile(join(hooksLibDir, "exit-code-registry.js"), "module.exports = {};\n");

  const after = await inspectPureUpstreamCodexStopHook(root, "1.13.0");
  assert.equal(after.status, "retired");
  assert.equal(after.resolution, "resolved-upstream");
  assert.deepEqual(after.missingHelpers, []);
  assert.equal(after.smoke.ok, true);
  assert.ok(after.retirement);
  assert.equal(after.retirement.verifiedRelease, "1.13.0");
});
