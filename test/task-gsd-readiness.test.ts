import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import test, { type TestContext } from "node:test";
import {
  inspectGsdProjectReadiness,
  type GsdToolsRunner,
} from "../src/core/task-gsd-readiness.js";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";
import type { ProcessResult, ProcessSpec } from "../src/core/process.js";

async function scratchDir(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-readiness-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function mockRunner(responses: Record<string, unknown>): GsdToolsRunner {
  return async (spec: ProcessSpec): Promise<ProcessResult> => {
    const query = spec.args[1];
    const subquery = spec.args[2];
    const key = query === "query" ? subquery ?? "" : query ?? "";

    if (key in responses) {
      const resp = responses[key];
      if (resp instanceof Error) {
        throw resp;
      }
      if (typeof resp === "object" && resp !== null && "customResult" in resp) {
        return (resp as { customResult: ProcessResult }).customResult;
      }
      const text = typeof resp === "string" ? resp : JSON.stringify(resp);
      return {
        code: "ok",
        exitCode: 0,
        signal: null,
        stdout: {
          excerpt: text,
          capped: false,
          totalBytes: Buffer.byteLength(text),
          sha256: "0".repeat(64),
        },
        stderr: {
          excerpt: "",
          capped: false,
          totalBytes: 0,
          sha256: "0".repeat(64),
        },
        durationMs: 5,
        outputCapped: false,
        timedOut: false,
      };
    }

    return {
      code: "ok",
      exitCode: 1,
      signal: null,
      stdout: {
        excerpt: "",
        capped: false,
        totalBytes: 0,
        sha256: "0".repeat(64),
      },
      stderr: {
        excerpt: `Unknown mock query: ${key}`,
        capped: false,
        totalBytes: 30,
        sha256: "0".repeat(64),
      },
      durationMs: 5,
      outputCapped: false,
      timedOut: false,
    };
  };
}

test("inspectGsdProjectReadiness: Hermes controller is diagnosed as unsupported (BOOT-01, D-01)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "hermes-project");
  await mkdir(projectDir, { recursive: true });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "hermes",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
  });

  assert.equal(readiness.diagnosis, "unsupported");
  assert.equal(readiness.ready, false);
  assert.equal(readiness.executionAuthorized, false);
  assert.match(readiness.reasons[0] ?? "", /Hermes controller is unsupported/u);
});

test("inspectGsdProjectReadiness: missing runtime when gsd-tools is absent (BOOT-01, D-01)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "no-runtime-project");
  await mkdir(projectDir, { recursive: true });

  // Point CLAUDE_CONFIG_DIR to an empty directory in sandbox
  const emptyConfig = join(sandbox.home, "empty-claude-config");
  await mkdir(emptyConfig, { recursive: true });

  const prevEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = emptyConfig;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CLAUDE_CONFIG_DIR = prevEnv;
    else delete process.env.CLAUDE_CONFIG_DIR;
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "claude",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
  });

  assert.equal(readiness.diagnosis, "missing-runtime");
  assert.equal(readiness.ready, false);
  assert.equal(readiness.executionAuthorized, false);
  assert.match(readiness.reasons[0] ?? "", /GSD Core runtime executable/u);
});

test("inspectGsdProjectReadiness: absent project when .planning does not exist (BOOT-01, D-01)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "absent-project");
  await mkdir(projectDir, { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: false,
      project_root: projectDir,
    },
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(readiness.diagnosis, "absent-project");
  assert.equal(readiness.ready, false);
  assert.equal(readiness.executionAuthorized, false);
  assert.ok(readiness.missingPrerequisites.includes(".planning directory"));
  assert.equal(readiness.nativeQueryEvidence?.query, "init.resume");
});

test("inspectGsdProjectReadiness: partial project when init_incomplete is true (BOOT-01, D-03)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "partial-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: true,
      init_incomplete: true,
      project_exists: true,
      requirements_exists: true,
      roadmap_exists: false,
      state_exists: false,
      project_root: projectDir,
    },
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(readiness.diagnosis, "partial-project");
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missingPrerequisites.includes("ROADMAP.md"));
  assert.ok(readiness.missingPrerequisites.includes("STATE.md"));
  assert.match(readiness.nextAction, /Resume native project initialization/u);
});

test("inspectGsdProjectReadiness: between-milestones state routes to native new-milestone/progress (BOOT-01, D-03)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "between-milestones");
  await mkdir(join(projectDir, ".planning"), { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: true,
      init_incomplete: false,
      milestones_exists: true,
      roadmap_exists: false,
      state_exists: false,
      project_root: projectDir,
    },
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(readiness.diagnosis, "partial-project");
  assert.equal(readiness.ready, false);
  assert.match(readiness.nextAction, /gsd-new-milestone|gsd-progress/u);
  assert.match(readiness.reasons[0] ?? "", /between-milestones/u);
});

test("inspectGsdProjectReadiness: probe-error on malformed JSON, failure, or root mismatch (BOOT-01, D-02)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "error-project");
  await mkdir(projectDir, { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  // 1. Process exit failure
  const failRunner = mockRunner({
    "runtime-identity": {
      customResult: {
        code: "error",
        exitCode: 1,
        signal: null,
        stdout: { excerpt: "", capped: false, totalBytes: 0, sha256: "0".repeat(64) },
        stderr: { excerpt: "fatal crash", capped: false, totalBytes: 11, sha256: "0".repeat(64) },
        durationMs: 5,
        outputCapped: false,
        timedOut: false,
      },
    },
  });

  const res1 = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: failRunner,
  });
  assert.equal(res1.diagnosis, "probe-error");
  assert.equal(res1.ready, false);

  // 2. Malformed JSON
  const malformedRunner = mockRunner({
    "runtime-identity": "not json at all {",
  });
  const res2 = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: malformedRunner,
  });
  assert.equal(res2.diagnosis, "probe-error");
  assert.equal(res2.ready, false);

  // 3. Root mismatch
  const rootMismatchRunner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: true,
      project_root: join(sandbox.home, "some-other-project"),
    },
  });
  const res3 = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: rootMismatchRunner,
  });
  assert.equal(res3.diagnosis, "probe-error");
  assert.equal(res3.ready, false);
  assert.match(res3.reasons[0] ?? "", /Native project root mismatch/u);
});

test("inspectGsdProjectReadiness: ready artifacts but agents_installed: false is execution-blocked (BOOT-01, D-04)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "blocked-capability-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: true,
      init_incomplete: false,
      project_exists: true,
      requirements_exists: true,
      roadmap_exists: true,
      state_exists: true,
      project_root: projectDir,
      agents_installed: false,
      missing_agents: ["gsd-planner", "gsd-executor"],
    },
    "init.quick": {
      planning_exists: true,
      roadmap_exists: true,
      agents_installed: false,
      missing_agents: ["gsd-planner", "gsd-executor"],
    },
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.diagnosis, "partial-project");
  assert.match(readiness.reasons[0] ?? "", /execution-blocked: GSD agents are not installed/u);
  assert.equal(readiness.capabilities?.agentsInstalled, false);
  assert.deepEqual(readiness.capabilities?.missingAgents, ["gsd-planner", "gsd-executor"]);
});

test("inspectGsdProjectReadiness: ready project when all artifacts and agents are present (BOOT-01, D-01)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "ready-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: true,
      init_incomplete: false,
      project_exists: true,
      requirements_exists: true,
      roadmap_exists: true,
      state_exists: true,
      project_root: projectDir,
      agents_installed: true,
      missing_agents: [],
    },
    "init.quick": {
      planning_exists: true,
      roadmap_exists: true,
      agents_installed: true,
      missing_agents: [],
    },
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(readiness.diagnosis, "ready");
  assert.equal(readiness.ready, true);
  assert.equal(readiness.executionAuthorized, false);
  assert.ok(readiness.satisfiedPrerequisites.includes("ROADMAP.md"));
  assert.ok(readiness.satisfiedPrerequisites.includes("GSD agents installed"));
  assert.equal(readiness.missingPrerequisites.length, 0);
  assert.equal(readiness.nativeQueryEvidence?.query, "init.quick");
});

test("inspectGsdProjectReadiness: follows safe bounded @file: target (BOOT-01)", async (context) => {
  const scratch = await scratchDir(context, "at-file");
  const targetFile = join(scratch, "init-output.json");
  await writeFile(
    targetFile,
    JSON.stringify({
      planning_exists: true,
      init_incomplete: false,
      project_exists: true,
      requirements_exists: true,
      roadmap_exists: true,
      state_exists: true,
      project_root: scratch,
      agents_installed: true,
      missing_agents: [],
    }),
    "utf8",
  );

  const fakeGsdTools = join(scratch, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = scratch;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": `@file:${targetFile}`,
    "init.quick": `@file:${targetFile}`,
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: scratch,
    },
    invocationPath: scratch,
    stateRoot: scratch,
    runner,
  });

  assert.equal(readiness.diagnosis, "ready");
  assert.equal(readiness.ready, true);
});

test("inspectGsdProjectReadiness: handles explicit discuss-phase with phase argument (BOOT-01, D-21)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "discuss-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: true,
      init_incomplete: false,
      project_exists: true,
      requirements_exists: true,
      roadmap_exists: true,
      state_exists: true,
      project_root: projectDir,
      agents_installed: true,
      missing_agents: [],
    },
    "init.phase-op": {
      phase: "01",
      phase_dir: join(projectDir, ".planning", "phases", "01-test"),
      agents_installed: true,
      missing_agents: [],
    },
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "discuss-phase",
      phase: "01",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(readiness.diagnosis, "ready");
  assert.equal(readiness.ready, true);
  assert.equal(readiness.phase, "01");
  assert.equal(readiness.nativeQueryEvidence?.query, "init.phase-op");
});

test("inspectGsdProjectReadiness: discuss-phase without phase argument is diagnosed as unsupported (BOOT-01, D-21)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "discuss-project-no-phase");
  await mkdir(join(projectDir, ".planning"), { recursive: true });

  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "// stub", "utf8");

  const prevEnv = process.env.CODEX_HOME;
  process.env.CODEX_HOME = sandbox.home;
  context.after(() => {
    if (prevEnv !== undefined) process.env.CODEX_HOME = prevEnv;
    else delete process.env.CODEX_HOME;
  });

  const runner = mockRunner({
    "runtime-identity": { packageName: "@opengsd/gsd-core", version: "1.18.0" },
    "init.resume": {
      planning_exists: true,
      init_incomplete: false,
      project_exists: true,
      requirements_exists: true,
      roadmap_exists: true,
      state_exists: true,
      project_root: projectDir,
      agents_installed: true,
      missing_agents: [],
    },
  });

  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "discuss-phase",
      projectRoot: projectDir,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(readiness.diagnosis, "unsupported");
  assert.equal(readiness.ready, false);
  assert.match(readiness.reasons[0] ?? "", /requires a phase parameter/u);
});

test("inspectGsdProjectReadiness: rejects duplicate keys, invalid UTF-8, and oversized input (BOOT-01)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "validation-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Duplicate key
  const dupPath = join(projectDir, "dup.json");
  await writeFile(
    dupPath,
    '{\n  "schemaVersion": 1,\n  "controller": "codex",\n  "controller": "claude",\n  "workflow": "quick"\n}\n',
    "utf8",
  );
  await assert.rejects(
    async () => {
      await inspectGsdProjectReadiness({
        inputPath: dupPath,
        invocationPath: projectDir,
        stateRoot: sandbox.state,
      });
    },
    { name: "TaskReadinessError", code: "duplicate-key" },
  );

  // 2. Oversized input (> 16 KiB)
  const hugePath = join(projectDir, "huge.json");
  const hugeContent = JSON.stringify({
    schemaVersion: 1,
    controller: "codex",
    workflow: "quick",
    extra: "x".repeat(20000),
  });
  await writeFile(hugePath, hugeContent, "utf8");
  await assert.rejects(
    async () => {
      await inspectGsdProjectReadiness({
        inputPath: hugePath,
        invocationPath: projectDir,
        stateRoot: sandbox.state,
      });
    },
    { name: "TaskReadinessError", code: "input-too-large" },
  );

  // 3. Invalid UTF-8
  const invalidUtf8Path = join(projectDir, "invalid-utf8.json");
  await writeFile(invalidUtf8Path, Buffer.from([0x7b, 0x22, 0xff, 0xfe, 0x7d]));
  await assert.rejects(
    async () => {
      await inspectGsdProjectReadiness({
        inputPath: invalidUtf8Path,
        invocationPath: projectDir,
        stateRoot: sandbox.state,
      });
    },
    { name: "TaskReadinessError", code: "invalid-input" },
  );
});
