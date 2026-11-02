import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  planNativeBootstrapRecovery,
  snapshotPlanningArtifacts,
  verifyNativeBootstrapRecovery,
  type NativeBootstrapRecoveryPlan,
} from "../src/core/task-bootstrap-recovery.js";
import {
  buildNativeBootstrapInput,
  inspectTaskBootstrap,
  prepareTaskBootstrap,
  type TaskBootstrapResult,
} from "../src/core/task-bootstrap.js";
import type { GsdProjectReadiness } from "../src/core/task-gsd-readiness.js";
import { createIsolatedSandbox, fingerprintManifest } from "./helpers/packed-sandbox.js";
import type { ProcessResult, ProcessSpec } from "../src/core/process.js";
import type { GsdToolsRunner } from "../src/core/task-gsd-readiness.js";

function mockRunner(data: Record<string, unknown>): GsdToolsRunner {
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
    const text = JSON.stringify(data);
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
  };
}

function mockReadiness(options: {
  canonicalRoot: string;
  diagnosis?: GsdProjectReadiness["diagnosis"];
  ready?: boolean;
  initIncomplete?: boolean;
  milestonesExists?: boolean;
  roadmapExists?: boolean;
  stateExists?: boolean;
  controller?: GsdProjectReadiness["controller"];
}): GsdProjectReadiness {
  return {
    schemaVersion: 1,
    canonicalRoot: options.canonicalRoot,
    projectId: "proj-recovery-test",
    controller: options.controller ?? "codex",
    runtime: {
      packageName: "@opengsd/gsd-core",
      version: "1.18.0",
      workflowHash: "a".repeat(64),
      configRoot: join(options.canonicalRoot, ".gsd"),
      gsdToolsPath: join(options.canonicalRoot, "bin", "gsd-tools"),
    },
    workflow: "quick",
    phase: null,
    diagnosis: options.diagnosis ?? "partial-project",
    ready: options.ready ?? false,
    executionAuthorized: false,
    satisfiedPrerequisites: [".planning directory"],
    missingPrerequisites: ["requirements"],
    nextAction: "Resume native project initialization",
    reasons: ["GSD reports init_incomplete: true"],
    nativeEvidence: {
      init_incomplete: options.initIncomplete ?? true,
      milestones_exists: options.milestonesExists ?? false,
      roadmap_exists: options.roadmapExists ?? false,
      state_exists: options.stateExists ?? false,
    },
  };
}

test("planNativeBootstrapRecovery resumes new-project at REQUIREMENTS.md when PROJECT.md exists (BOOT-01, BOOT-03, D-09)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "partial-step-1");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });

  const projectContent = "# Test Project\n\nInitial scope and context.\n";
  await writeFile(join(planningDir, "PROJECT.md"), projectContent, "utf8");

  const readiness = mockReadiness({
    canonicalRoot: projectDir,
    initIncomplete: true,
    roadmapExists: false,
    stateExists: false,
  });

  const plan = await planNativeBootstrapRecovery({
    canonicalRoot: projectDir,
    readiness,
  });

  assert.equal(plan.status, "resumable");
  assert.equal(plan.route, "resume-new-project");
  assert.equal(plan.firstMissingStep, "REQUIREMENTS.md");
  assert.deepEqual(plan.remainingSteps, ["REQUIREMENTS.md", "ROADMAP.md", "STATE.md"]);
  assert.ok(plan.completedSteps.some((s) => s.includes("PROJECT.md")));
  assert.ok(plan.artifactCheckpoints.includes("PROJECT.md"));
  assert.ok(plan.nativeAction.includes("REQUIREMENTS"));
});

test("planNativeBootstrapRecovery resumes at ROADMAP.md and skips REQUIREMENTS regeneration when REQUIREMENTS exists (BOOT-01, BOOT-03, D-10)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "partial-step-2");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });

  await writeFile(join(planningDir, "PROJECT.md"), "# Project Context\n", "utf8");
  await writeFile(join(planningDir, "REQUIREMENTS.md"), "# Project Requirements\n- REQ-01\n", "utf8");

  const readiness = mockReadiness({
    canonicalRoot: projectDir,
    initIncomplete: true,
    roadmapExists: false,
    stateExists: false,
  });

  const plan = await planNativeBootstrapRecovery({
    canonicalRoot: projectDir,
    readiness,
  });

  assert.equal(plan.status, "resumable");
  assert.equal(plan.route, "resume-new-project");
  assert.equal(plan.firstMissingStep, "ROADMAP.md");
  assert.deepEqual(plan.remainingSteps, ["ROADMAP.md", "STATE.md"]);
  assert.ok(plan.completedSteps.includes("REQUIREMENTS.md"));
  assert.ok(plan.artifactCheckpoints.includes("REQUIREMENTS.md"));
  assert.ok(plan.reasons.some((r) => r.includes("Existing REQUIREMENTS.md skips regeneration")));
});

test("planNativeBootstrapRecovery blocks inconsistent partial planning with absent PROJECT.md (BOOT-03, D-10)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "inconsistent-partial");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });

  // Only REQUIREMENTS exists, no PROJECT.md
  await writeFile(join(planningDir, "REQUIREMENTS.md"), "# Orphan Requirements\n", "utf8");

  const readiness = mockReadiness({
    canonicalRoot: projectDir,
    initIncomplete: true,
  });

  const plan = await planNativeBootstrapRecovery({
    canonicalRoot: projectDir,
    readiness,
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.route, "blocked");
  assert.equal(plan.firstMissingStep, "PROJECT.md");
  assert.ok(plan.reasons.some((r) => r.includes("PROJECT.md is absent")));
});

test("planNativeBootstrapRecovery routes archived milestones without active roadmap to new-milestone (BOOT-03, D-11)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "between-milestones");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });

  await writeFile(join(planningDir, "PROJECT.md"), "# Project\n", "utf8");
  await writeFile(join(planningDir, "MILESTONES.md"), "# Milestones Archive\n- v0.1.0\n", "utf8");

  const readiness = mockReadiness({
    canonicalRoot: projectDir,
    initIncomplete: false,
    milestonesExists: true,
    roadmapExists: false,
    stateExists: false,
  });

  const plan = await planNativeBootstrapRecovery({
    canonicalRoot: projectDir,
    readiness,
  });

  assert.equal(plan.status, "resumable");
  assert.equal(plan.route, "new-milestone");
  assert.equal(plan.firstMissingStep, "ROADMAP.md");
  assert.ok(plan.nativeAction.includes("gsd-new-milestone"));
  assert.ok(plan.artifactCheckpoints.includes("MILESTONES.md"));
});

test("planNativeBootstrapRecovery routes missing STATE with history to reconstruct-state (BOOT-03, D-11)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "history-state-loss");
  const planningDir = join(projectDir, ".planning");
  const phasesDir = join(planningDir, "phases", "01-core");
  await mkdir(phasesDir, { recursive: true });

  await writeFile(join(planningDir, "PROJECT.md"), "# Project\n", "utf8");
  await writeFile(join(planningDir, "ROADMAP.md"), "# Roadmap\n", "utf8");
  await writeFile(join(phasesDir, "01-01-PLAN.md"), "# Phase 01 Plan\n", "utf8");

  const readiness = mockReadiness({
    canonicalRoot: projectDir,
    initIncomplete: false,
    roadmapExists: true,
    stateExists: false,
  });

  const plan = await planNativeBootstrapRecovery({
    canonicalRoot: projectDir,
    readiness,
  });

  assert.equal(plan.status, "resumable");
  assert.equal(plan.route, "reconstruct-state");
  assert.equal(plan.firstMissingStep, "STATE.md");
  assert.ok(plan.nativeAction.includes("gsd-resume-project"));
  assert.ok(plan.artifactCheckpoints.includes("ROADMAP.md"));
});

test("planNativeBootstrapRecovery blocks missing STATE when NO history exists (BOOT-03, D-12)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "no-history-state-loss");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });

  await writeFile(join(planningDir, "PROJECT.md"), "# Project\n", "utf8");
  await writeFile(join(planningDir, "ROADMAP.md"), "# Roadmap\n", "utf8");
  // No phases or milestones directory

  const readiness = mockReadiness({
    canonicalRoot: projectDir,
    initIncomplete: false,
    roadmapExists: true,
    stateExists: false,
  });

  const plan = await planNativeBootstrapRecovery({
    canonicalRoot: projectDir,
    readiness,
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.route, "blocked");
  assert.equal(plan.firstMissingStep, "STATE.md");
  assert.ok(plan.reasons.some((r) => r.includes("no historical phase artifacts exist")));
});

test("planNativeBootstrapRecovery blocks empty or corrupt planning artifacts (BOOT-03, D-12)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "corrupt-artifact");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });

  // 0-byte PROJECT.md
  await writeFile(join(planningDir, "PROJECT.md"), "", "utf8");

  const readiness = mockReadiness({
    canonicalRoot: projectDir,
    initIncomplete: true,
  });

  const plan = await planNativeBootstrapRecovery({
    canonicalRoot: projectDir,
    readiness,
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.route, "blocked");
  assert.equal(plan.firstMissingStep, "PROJECT.md");
  assert.ok(plan.reasons.some((r) => r.includes("corrupt artifact") || r.includes("empty")));
});

test("verifyNativeBootstrapRecovery enforces byte-for-byte preservation and detects unauthorized mutations (BOOT-01, BOOT-03, D-09)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "preservation-check");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });

  const originalProject = "# Preserved Project\n\nDo not change.\n";
  await writeFile(join(planningDir, "PROJECT.md"), originalProject, "utf8");

  // Take snapshot before recovery
  const beforeSnapshot = await snapshotPlanningArtifacts(projectDir);
  assert.ok(beforeSnapshot["PROJECT.md"]);

  // 1. Simulate legitimate native recovery adding REQUIREMENTS.md without touching PROJECT.md
  await writeFile(join(planningDir, "REQUIREMENTS.md"), "# New Requirements\n", "utf8");

  const legitimateCheck = await verifyNativeBootstrapRecovery({
    projectRoot: projectDir,
    beforeSnapshot,
    allowedGeneratedArtifacts: ["REQUIREMENTS.md"],
  });

  assert.equal(legitimateCheck.verified, true);
  assert.deepEqual(legitimateCheck.preserved, ["PROJECT.md"]);
  assert.deepEqual(legitimateCheck.modifiedOrCreated, ["REQUIREMENTS.md"]);
  assert.equal(legitimateCheck.violated.length, 0);

  // 2. Simulate unauthorized tampering: modifying preserved PROJECT.md
  await writeFile(join(planningDir, "PROJECT.md"), "# Tampered Project\n", "utf8");

  const tamperedCheck = await verifyNativeBootstrapRecovery({
    projectRoot: projectDir,
    beforeSnapshot,
    allowedGeneratedArtifacts: ["REQUIREMENTS.md"],
  });

  assert.equal(tamperedCheck.verified, false);
  assert.ok(tamperedCheck.violated.some((v) => v.includes("Unexpected modification: PROJECT.md")));
});

test("buildNativeBootstrapInput formats recovery guidance, completed steps, and preservation rules (BOOT-01, BOOT-04)", () => {
  const handoff = {
    schemaVersion: 1 as const,
    canonicalRoot: "/mock/repo",
    projectId: "mock-proj",
    pendingId: "pending-format-test",
    originalRequest: {
      text: "Implement tenant authorization policies",
      shortGoal: "Tenant auth",
      shortScope: "RBAC middleware",
    },
    knownFacts: [
      { fact: "Framework is Express", source: "package.json" },
    ],
    canonicalSelectedStyle: "conversational-quick" as const,
    policyRevision: "rev-01",
    status: "pending" as const,
    createdAt: "2026-11-02T00:00:00Z",
    updatedAt: "2026-11-02T00:00:00Z",
    contentDigest: "c".repeat(64),
  };

  const recoveryPlan: NativeBootstrapRecoveryPlan = {
    route: "resume-new-project",
    status: "resumable",
    completedSteps: ["PROJECT.md (context and configuration)"],
    firstMissingStep: "REQUIREMENTS.md",
    remainingSteps: ["REQUIREMENTS.md", "ROADMAP.md", "STATE.md"],
    nativeAction: "gsd-new-project (resume at REQUIREMENTS generation stage)",
    reasons: ["GSD reports init_incomplete: true with PROJECT.md present."],
    artifactCheckpoints: ["PROJECT.md"],
    preservedArtifacts: ["PROJECT.md"],
  };

  const formatted = buildNativeBootstrapInput(handoff, recoveryPlan);

  assert.ok(formatted.includes("# Project Task Context (pending-format-test)"));
  assert.ok(formatted.includes("Goal: Tenant auth"));
  assert.ok(formatted.includes("Scope: RBAC middleware"));
  assert.ok(formatted.includes("[package.json] Framework is Express"));
  assert.ok(formatted.includes("## Recovery Guidance (resume-new-project)"));
  assert.ok(formatted.includes("Status: resumable"));
  assert.ok(formatted.includes("First Missing Stage: REQUIREMENTS.md"));
  assert.ok(formatted.includes("PROJECT.md (context and configuration)"));
  assert.ok(formatted.includes("Existing planning artifacts and unrelated user working tree files MUST be preserved"));
  assert.ok(formatted.includes("Required Artifact Checkpoints:"));
  assert.ok(formatted.includes("- PROJECT.md"));
});

test("prepareTaskBootstrap preview and apply expose recovery plan for partial projects (BOOT-01, BOOT-03)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "partial-e2e");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(join(planningDir, "PROJECT.md"), "# Partial E2E Project\n", "utf8");

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-partial-e2e",
    projectRoot: projectDir,
    request: {
      text: "Setup webhook routing and secret verification",
      shortGoal: "Webhook verification",
    },
    facts: [
      { fact: "Webhooks from Stripe", source: "user" },
    ],
    selectedStyle: "conversational-quick",
  };

  const runner = mockRunner({
    planning_exists: true,
    project_exists: true,
    project_root: projectDir,
    init_incomplete: true,
    milestones_exists: false,
    roadmap_exists: false,
    state_exists: false,
    agents_installed: true,
  });

  // 1. Preview
  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  assert.equal(preview.applied, false);
  assert.equal(preview.status, "pending");
  assert.equal(preview.readinessDiagnosis, "partial-project");
  assert.ok(preview.recoveryPlan);
  assert.equal(preview.recoveryPlan.route, "resume-new-project");
  assert.equal(preview.recoveryPlan.firstMissingStep, "REQUIREMENTS.md");
  assert.ok(preview.planDigest);

  // 2. Apply
  const applied = await prepareTaskBootstrap({
    input: {
      ...packet,
      planDigest: preview.planDigest,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: true,
  });

  assert.equal(applied.applied, true);
  assert.equal(applied.status, "pending");
  assert.ok(applied.recoveryPlan);
  assert.equal(applied.recoveryPlan.route, "resume-new-project");

  // 3. Inspect
  const inspected = await inspectTaskBootstrap({
    pendingId: "pending-partial-e2e",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
  });

  assert.equal(inspected.operation, "inspect");
  assert.equal(inspected.pendingId, "pending-partial-e2e");
  assert.equal(inspected.status, "pending");
  assert.equal(inspected.readinessDiagnosis, "partial-project");
  assert.ok(inspected.recoveryPlan);
  assert.equal(inspected.recoveryPlan.route, "resume-new-project");
});

test("prepareTaskBootstrap blocks partial project when PROJECT.md is missing (BOOT-03, D-10)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "partial-no-project");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });
  // .planning exists, but PROJECT.md does NOT exist

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-no-project",
    projectRoot: projectDir,
    request: {
      text: "Test missing project.md handling",
    },
    selectedStyle: "conversational-quick",
  };

  const runner = mockRunner({
    planning_exists: true,
    project_exists: false,
    project_root: projectDir,
    init_incomplete: true,
    milestones_exists: false,
    roadmap_exists: false,
    state_exists: false,
    agents_installed: true,
  });

  const result = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.applied, false);
  assert.ok(result.recoveryPlan);
  assert.equal(result.recoveryPlan.status, "blocked");
  assert.equal(result.recoveryPlan.firstMissingStep, "PROJECT.md");
  assert.ok(result.reasons.some((r) => r.includes("PROJECT.md is absent")));
});
