import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  prepareTaskBootstrap,
  inspectTaskBootstrap,
  buildNativeBootstrapInput,
} from "../src/core/task-bootstrap.js";
import {
  readTaskBootstrapHandoff,
  resolveBootstrapStoragePath,
} from "../src/core/task-bootstrap-store.js";
import {
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";
import { createBootstrapSandbox as createIsolatedSandbox } from "./helpers/task-bootstrap-evidence.js";
import type { GsdToolsRunner } from "../src/core/task-gsd-readiness.js";
import type { ProcessResult, ProcessSpec } from "../src/core/process.js";
import type { TaskExecutionStyle } from "../src/core/task-intake.js";

function mockAbsentProjectRunner(projectRoot: string): GsdToolsRunner {
  return async (spec: ProcessSpec): Promise<ProcessResult> => {
    const subquery = spec.args[2];
    if (subquery === "runtime-identity") {
      const text = JSON.stringify({ packageName: "@opengsd/gsd-core", version: "1.18.0" });
      return {
        code: "ok",
        exitCode: 0,
        signal: null,
        stdout: { excerpt: text, capped: false, totalBytes: text.length, sha256: "0".repeat(64) },
        stderr: { excerpt: "", capped: false, totalBytes: 0, sha256: "0".repeat(64) },
        durationMs: 5,
        outputCapped: false,
        timedOut: false,
      };
    }
    if (subquery === "init.resume") {
      const text = JSON.stringify({ planning_exists: false, project_root: projectRoot });
      return {
        code: "ok",
        exitCode: 0,
        signal: null,
        stdout: { excerpt: text, capped: false, totalBytes: text.length, sha256: "0".repeat(64) },
        stderr: { excerpt: "", capped: false, totalBytes: 0, sha256: "0".repeat(64) },
        durationMs: 5,
        outputCapped: false,
        timedOut: false,
      };
    }
    return {
      code: "ok",
      exitCode: 1,
      signal: null,
      stdout: { excerpt: "", capped: false, totalBytes: 0, sha256: "0".repeat(64) },
      stderr: { excerpt: "unexpected query", capped: false, totalBytes: 16, sha256: "0".repeat(64) },
      durationMs: 5,
      outputCapped: false,
      timedOut: false,
    };
  };
}

test("task bootstrap prepare preview changes zero bytes (BOOT-02, D-05, D-06)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "preview-project");
  await mkdir(projectDir, { recursive: true });

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);
  const projectBefore = await fingerprintManifest(projectDir);

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    projectRoot: projectDir,
    request: {
      text: "Build a customer feedback ingestion API endpoint",
      shortGoal: "Feedback API",
      shortScope: "HTTP handler and JSON validation",
    },
    facts: [
      { fact: "Database is PostgreSQL 16", source: "user-specification" },
      { fact: "Authentication uses JWT bearer tokens", source: "architecture-adr" },
    ],
    selectedStyle: "conversational-quick",
  };

  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: false,
  });

  assert.equal(preview.applied, false);
  assert.equal(preview.status, "pending");
  assert.equal(preview.readinessDiagnosis, "absent-project");
  assert.ok(preview.planDigest !== null && preview.planDigest.length === 64);
  assert.match(preview.nextAction, /Apply bootstrap plan/u);

  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  const projectAfter = await fingerprintManifest(projectDir);

  assert.equal(homeBefore.digest, homeAfter.digest);
  assert.equal(stateBefore.digest, stateAfter.digest);
  assert.equal(projectBefore.digest, projectAfter.digest);
});

test("task bootstrap apply creates root-bound transfer record under state root, no .planning mutations (BOOT-02, D-13)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "apply-project");
  await mkdir(projectDir, { recursive: true });

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-test0001",
    projectRoot: projectDir,
    request: {
      text: "Add billing subscription webhooks",
      shortGoal: "Billing webhooks",
      shortScope: "Stripe webhook route",
    },
    facts: [
      { fact: "Provider is Stripe", source: "user-request" },
    ],
    selectedStyle: "conversational-quick",
  };

  // 1. Get preview to obtain planDigest
  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: false,
  });

  const planDigest = preview.planDigest!;
  assert.ok(planDigest);

  // 2. Apply with planDigest
  const applied = await prepareTaskBootstrap({
    input: {
      ...packet,
      planDigest,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: true,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.status, "pending");
  assert.equal(applied.planDigest, planDigest);

  // Verify storage location: under stateRoot/task-intake/<projectId>/<pendingId>.json
  const storedPath = resolveBootstrapStoragePath(sandbox.state, applied.projectId, "pending-test0001");
  assert.equal(applied.destinationPath, storedPath);

  // Read stored record directly
  const handoff = await readTaskBootstrapHandoff({
    stateRoot: sandbox.state,
    projectId: applied.projectId,
    pendingId: "pending-test0001",
  });

  assert.equal(handoff.schemaVersion, 1);
  assert.equal(handoff.canonicalRoot, projectDir);
  assert.equal(handoff.pendingId, "pending-test0001");
  assert.equal(handoff.originalRequest.text, "Add billing subscription webhooks");
  assert.equal(handoff.canonicalSelectedStyle, "conversational-quick");
  assert.equal(handoff.knownFacts.length, 1);
  assert.equal(handoff.knownFacts[0]?.fact, "Provider is Stripe");

  // Verify no files were written into project directory
  const projectFingerprint = await fingerprintManifest(projectDir);
  const filesWritten = projectFingerprint.entries.filter((e) => e.kind !== "dir");
  assert.equal(filesWritten.length, 0, "No files written into project directory");
});

test("two same-ID prepare calls are idempotent for equal content and refuse unequal content (BOOT-02, D-16)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "idempotent-project");
  await mkdir(projectDir, { recursive: true });

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-fixed-id",
    projectRoot: projectDir,
    request: {
      text: "Standardize API response error formats",
      shortGoal: "Error envelope",
    },
    selectedStyle: "conversational-quick",
  };

  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: false,
  });

  const planDigest = preview.planDigest!;

  // First apply
  const applied1 = await prepareTaskBootstrap({
    input: { ...packet, planDigest },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: true,
  });
  assert.equal(applied1.applied, true);

  // Second apply with identical content: idempotent success!
  const applied2 = await prepareTaskBootstrap({
    input: { ...packet, planDigest },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: true,
  });
  assert.equal(applied2.applied, true);
  assert.equal(applied2.contentDigest, applied1.contentDigest);

  // Third apply with DIFFERENT content but SAME pending ID: refused!
  const differentPacket = {
    ...packet,
    request: {
      text: "Completely different request content that collisions should reject",
      shortGoal: "Different goal",
    },
  };
  const diffPreview = await prepareTaskBootstrap({
    input: differentPacket,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: false,
  });

  await assert.rejects(
    async () => {
      await prepareTaskBootstrap({
        input: { ...differentPacket, planDigest: diffPreview.planDigest! },
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        runner: mockAbsentProjectRunner(projectDir),
        apply: true,
      });
    },
    { name: "TaskBootstrapError", code: "pending-id-collision" },
  );
});

test("all six canonical style IDs and direct-command arguments round-trip (BOOT-02, D-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "styles-project");
  await mkdir(projectDir, { recursive: true });

  const styles: TaskExecutionStyle[] = [
    "conversational-quick",
    "conversational-quick-full",
    "conversational-phase",
    "autopilot-quick",
    "autopilot-quick-full",
    "autopilot-phase",
  ];

  for (let i = 0; i < styles.length; i++) {
    const style = styles[i]!;
    const pendingId = `pending-style-${i}`;
    const packet = {
      schemaVersion: 1,
      operation: "prepare",
      controller: "codex",
      workflow: "quick",
      pendingId,
      projectRoot: projectDir,
      request: { text: `Test task for style ${style}` },
      selectedStyle: style,
      commandRoute: {
        command: "quick",
        workflow: "quick",
        arguments: ["--flag1", "value1"],
      },
    };

    const prev = await prepareTaskBootstrap({
      input: packet,
      invocationPath: projectDir,
      stateRoot: sandbox.state,
      runner: mockAbsentProjectRunner(projectDir),
      apply: false,
    });

    const res = await prepareTaskBootstrap({
      input: { ...packet, planDigest: prev.planDigest! },
      invocationPath: projectDir,
      stateRoot: sandbox.state,
      runner: mockAbsentProjectRunner(projectDir),
      apply: true,
    });

    const read = await readTaskBootstrapHandoff({
      stateRoot: sandbox.state,
      projectId: res.projectId,
      pendingId,
    });

    assert.equal(read.canonicalSelectedStyle, style);
    assert.deepEqual(read.commandRoute?.arguments, ["--flag1", "value1"]);
  }
});

test("buildNativeBootstrapInput produces conversational prompt with known facts and no synthetic --auto (BOOT-02, D-06, D-08)", () => {
  const handoff = {
    schemaVersion: 1 as const,
    canonicalRoot: "D:/dev/sample",
    projectId: "proj-123",
    pendingId: "pending-001",
    contentDigest: "0".repeat(64),
    originalRequest: {
      text: "Build a notifications service",
      shortGoal: "Notifications service",
      shortScope: "Email and SMS delivery",
    },
    knownFacts: [
      { fact: "Use AWS SES for email", source: "user-request" },
      { fact: "Use Twilio for SMS", source: "user-request", detail: "credentials in secrets manager" },
    ],
    canonicalSelectedStyle: "conversational-quick" as const,
    policyRevision: "rev-1",
    status: "pending" as const,
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };

  const prompt = buildNativeBootstrapInput(handoff);
  assert.match(prompt, /Goal: Notifications service/u);
  assert.ok(prompt.includes("## Original Request (Private Host Context)\nBuild a notifications service"));
  const marker = prompt.split("## Exact Bootstrap Request Binding\n")[1]!.split("\n")[0]!;
  assert.match(marker, /"requestSha256":"[a-f0-9]{64}"/u);
  assert.doesNotMatch(marker, /Build a notifications service/u);
  assert.match(prompt, /do not copy private payload into versioned artifacts solely as proof/u);
  assert.match(prompt, /Scope: Email and SMS delivery/u);
  assert.match(prompt, /\[user-request\] Use AWS SES for email/u);
  assert.match(prompt, /\[user-request\] Use Twilio for SMS/u);
  assert.doesNotMatch(prompt, /--auto/u, "Never synthesize --auto from style alone");
  assert.match(prompt, /Confirm any missing or ambiguous requirements directly with the user/u);
});

test("rejects input exceeding limits and suspected credentials (BOOT-02, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "limits-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Suspected credentials in request text
  await assert.rejects(
    async () => {
      await prepareTaskBootstrap({
        input: {
          schemaVersion: 1,
          controller: "codex",
          workflow: "quick",
          projectRoot: projectDir,
          request: { text: "Deploy using token ghp_123456789012345678901234567890123456" },
        },
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        runner: mockAbsentProjectRunner(projectDir),
        apply: false,
      });
    },
    { name: "TaskBootstrapError", code: "credentials-detected" },
  );

  // 2. Suspected credentials in facts
  await assert.rejects(
    async () => {
      await prepareTaskBootstrap({
        input: {
          schemaVersion: 1,
          controller: "codex",
          workflow: "quick",
          projectRoot: projectDir,
          request: { text: "Regular task request" },
          facts: [{ fact: "API key is sk-123456789012345678901234567890123456" }],
        },
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        runner: mockAbsentProjectRunner(projectDir),
        apply: false,
      });
    },
    { name: "TaskBootstrapError", code: "credentials-detected" },
  );

  // 3. Invalid pending ID with path traversal
  await assert.rejects(
    async () => {
      await prepareTaskBootstrap({
        input: {
          schemaVersion: 1,
          controller: "codex",
          workflow: "quick",
          pendingId: "../traversal",
          projectRoot: projectDir,
          request: { text: "Regular task request" },
        },
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        runner: mockAbsentProjectRunner(projectDir),
        apply: false,
      });
    },
    { name: "TaskBootstrapError", code: "invalid-pending-id" },
  );

  // 4. Stale planDigest rejection on apply
  const prev = await prepareTaskBootstrap({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
      request: { text: "Digest check task" },
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: false,
  });

  await assert.rejects(
    async () => {
      await prepareTaskBootstrap({
        input: {
          schemaVersion: 1,
          controller: "codex",
          workflow: "quick",
          projectRoot: projectDir,
          request: { text: "Digest check task" },
          planDigest: "0".repeat(64), // deliberately wrong digest
        },
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        runner: mockAbsentProjectRunner(projectDir),
        apply: true,
      });
    },
    { name: "TaskBootstrapError", code: "stale-plan-digest" },
  );
});

test("inspectTaskBootstrap reports public status and does not leak raw private request or facts (BOOT-02, D-13)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "inspect-project");
  await mkdir(projectDir, { recursive: true });

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-inspect-check",
    projectRoot: projectDir,
    request: {
      text: "Super secret confidential business logic request text",
      shortGoal: "Confidential feature",
    },
    facts: [
      { fact: "Proprietary algorithm fact that must not be in public inspection", source: "secret" },
    ],
    selectedStyle: "conversational-quick",
  };

  const prev = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: false,
  });

  await prepareTaskBootstrap({
    input: { ...packet, planDigest: prev.planDigest! },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner: mockAbsentProjectRunner(projectDir),
    apply: true,
  });

  // Now inspect
  const inspection = await inspectTaskBootstrap({
    pendingId: "pending-inspect-check",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
  });

  assert.equal(inspection.operation, "inspect");
  assert.equal(inspection.pendingId, "pending-inspect-check");
  assert.equal(inspection.status, "pending");
  assert.equal(inspection.selectedStyle, "conversational-quick");

  const stringified = JSON.stringify(inspection);
  assert.doesNotMatch(stringified, /Super secret confidential business logic/u);
  assert.doesNotMatch(stringified, /Proprietary algorithm fact/u);
});
