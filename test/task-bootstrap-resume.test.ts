import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  acknowledgeTaskBootstrap,
  cancelTaskBootstrap,
  claimTaskBootstrap,
  linkTaskBootstrapNativeReference,
  prepareTaskBootstrap,
  TaskBootstrapError,
} from "../src/core/task-bootstrap.js";
import type { GsdToolsRunner } from "../src/core/task-gsd-readiness.js";
import type { ProcessResult, ProcessSpec } from "../src/core/process.js";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";

function mockReadyRunner(projectDir: string): GsdToolsRunner {
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
    const text = JSON.stringify({
      planning_exists: true,
      init_incomplete: false,
      project_exists: true,
      requirements_exists: true,
      roadmap_exists: true,
      state_exists: true,
      agents_installed: true,
      project_root: projectDir,
    });
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

test("full lifecycle: prepare -> claim -> link -> acknowledge delivery (BOOT-04, D-15, D-16)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "lifecycle-project");
  const planningDir = join(projectDir, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(join(planningDir, "PROJECT.md"), "# Project Context\n", "utf8");

  const runner = mockReadyRunner(projectDir);

  const preparePacket = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-life-01",
    projectRoot: projectDir,
    request: {
      text: "Add audit trail events for organization membership changes",
      shortGoal: "Audit trail events",
    },
    facts: [
      { fact: "Audit logger is Winston", source: "package.json" },
    ],
    selectedStyle: "conversational-quick",
  };

  // 1. Prepare (Preview & Apply)
  const preview = await prepareTaskBootstrap({
    input: preparePacket,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  const applied = await prepareTaskBootstrap({
    input: {
      ...preparePacket,
      planDigest: preview.planDigest,
    },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: true,
  });

  assert.equal(applied.status, "pending");
  assert.equal(applied.applied, true);

  // 2. Claim
  const claimed = await claimTaskBootstrap({
    pendingId: "pending-life-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    claimNonce: "claim-nonce-alpha",
    runner,
  });

  assert.equal(claimed.operation, "claim");
  assert.equal(claimed.status, "claimed");
  assert.equal(claimed.dispatchAuthorized, true);
  assert.equal(claimed.selectedStyle, "conversational-quick");

  // 3. Link exact native reference
  const linked = await linkTaskBootstrapNativeReference({
    pendingId: "pending-life-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    nativeReference: {
      kind: "gsd-quick",
      id: "quick-task-0042",
      path: ".planning/quick/quick-task-0042.md",
    },
  });

  assert.equal(linked.operation, "link");
  assert.equal(linked.status, "linked");
  assert.equal((linked.nativeReference as Record<string, unknown>)?.id, "quick-task-0042");

  // 4. Acknowledge delivery
  const acknowledged = await acknowledgeTaskBootstrap({
    pendingId: "pending-life-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    deliveryReceipt: {
      receiptSha256: "b".repeat(64),
    },
  });

  assert.equal(acknowledged.operation, "acknowledge");
  assert.equal(acknowledged.status, "acknowledged");
  assert.ok(acknowledged.reasons.some((r) => r.includes("Delivery acceptance recorded")));
});

test("two processes competing for one pending transfer grant only one dispatch permission (BOOT-04, D-18)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "race-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });
  await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# Race Test\n", "utf8");

  const runner = mockReadyRunner(projectDir);

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-race-01",
    projectRoot: projectDir,
    request: {
      text: "Parallel worker race test",
    },
    selectedStyle: "conversational-quick",
  };

  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  await prepareTaskBootstrap({
    input: { ...packet, planDigest: preview.planDigest },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: true,
  });

  // Process A claims first
  const claimA = await claimTaskBootstrap({
    pendingId: "pending-race-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    claimNonce: "worker-A-nonce",
    runner,
  });

  assert.equal(claimA.status, "claimed");
  assert.equal(claimA.dispatchAuthorized, true);

  // Process B attempts to claim with a different nonce -> must fail closed
  await assert.rejects(
    async () => {
      await claimTaskBootstrap({
        pendingId: "pending-race-01",
        projectRoot: projectDir,
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        claimNonce: "worker-B-nonce",
        runner,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskBootstrapError);
      assert.equal(err.code, "already-claimed");
      return true;
    },
  );

  // Re-claim by Process A with the SAME nonce is idempotent
  const claimARetry = await claimTaskBootstrap({
    pendingId: "pending-race-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    claimNonce: "worker-A-nonce",
    runner,
  });

  assert.equal(claimARetry.status, "claimed");
  assert.equal(claimARetry.dispatchAuthorized, true);
});

test("already linked handoff redirects to continue-existing without second quick dispatch (BOOT-04, D-18)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "continue-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });
  await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# Continue Test\n", "utf8");

  const runner = mockReadyRunner(projectDir);

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-cont-01",
    projectRoot: projectDir,
    request: {
      text: "Link continuation test",
    },
    selectedStyle: "conversational-quick",
  };

  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  await prepareTaskBootstrap({
    input: { ...packet, planDigest: preview.planDigest },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: true,
  });

  await claimTaskBootstrap({
    pendingId: "pending-cont-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    claimNonce: "worker-cont",
    runner,
  });

  await linkTaskBootstrapNativeReference({
    pendingId: "pending-cont-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    nativeReference: {
      kind: "gsd-quick",
      id: "quick-task-continue-check",
    },
  });

  // Re-claiming an already linked task redirects to continue-existing
  const reClaim = await claimTaskBootstrap({
    pendingId: "pending-cont-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    claimNonce: "another-worker",
    runner,
  });

  assert.equal(reClaim.status, "linked");
  assert.equal(reClaim.dispatchAuthorized, false);
  assert.equal(reClaim.nextAction, "continue-existing");
  assert.ok(reClaim.reasons.some((r) => r.includes("already linked")));
});

test("cancellation marks transfer cancelled and forbids subsequent claim or link (BOOT-04, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "cancel-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });
  await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# Cancel Test\n", "utf8");

  const runner = mockReadyRunner(projectDir);

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-cancel-01",
    projectRoot: projectDir,
    request: {
      text: "Cancel test request",
    },
    selectedStyle: "conversational-quick",
  };

  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  await prepareTaskBootstrap({
    input: { ...packet, planDigest: preview.planDigest },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: true,
  });

  // Cancel before claim
  const cancelled = await cancelTaskBootstrap({
    pendingId: "pending-cancel-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    reason: "User cancelled task intake",
  });

  assert.equal(cancelled.operation, "cancel");
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.reasons.some((r) => r.includes("User cancelled task intake")));

  // Attempt to claim cancelled handoff must fail closed
  await assert.rejects(
    async () => {
      await claimTaskBootstrap({
        pendingId: "pending-cancel-01",
        projectRoot: projectDir,
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        claimNonce: "late-worker",
        runner,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskBootstrapError);
      assert.equal(err.code, "already-cancelled");
      return true;
    },
  );

  // Attempt to link cancelled handoff must fail closed
  await assert.rejects(
    async () => {
      await linkTaskBootstrapNativeReference({
        pendingId: "pending-cancel-01",
        projectRoot: projectDir,
        invocationPath: projectDir,
        stateRoot: sandbox.state,
        nativeReference: { kind: "quick", id: "late-link" },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskBootstrapError);
      assert.equal(err.code, "already-cancelled");
      return true;
    },
  );
});

test("cancellation of in-flight claimed handoff reports delivery-in-flight and routes to native stop (BOOT-04, D-18, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "cancel-inflight");
  await mkdir(join(projectDir, ".planning"), { recursive: true });
  await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# In-Flight Cancel\n", "utf8");

  const runner = mockReadyRunner(projectDir);

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-inflight-01",
    projectRoot: projectDir,
    request: {
      text: "In flight cancellation",
    },
    selectedStyle: "conversational-quick",
  };

  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  await prepareTaskBootstrap({
    input: { ...packet, planDigest: preview.planDigest },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: true,
  });

  await claimTaskBootstrap({
    pendingId: "pending-inflight-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    claimNonce: "inflight-worker",
    runner,
  });

  // Cancel while in flight (after claim)
  const cancelResult = await cancelTaskBootstrap({
    pendingId: "pending-inflight-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    reason: "Aborted mid-flight",
  });

  assert.equal(cancelResult.status, "cancelled");
  assert.ok(cancelResult.nextAction.includes("Delivery was in flight; stop native execution"));
  assert.ok(cancelResult.reasons.some((r) => r.includes("delivery-in-flight")));
});

test("autopilot style claim restores identity but withholds dispatch authorization until explicit contract approval (BOOT-04, D-20)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "autopilot-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });
  await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# Autopilot Context\n", "utf8");

  const runner = mockReadyRunner(projectDir);

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-auto-01",
    projectRoot: projectDir,
    request: {
      text: "Autonomous background cleanup",
    },
    selectedStyle: "autopilot-quick",
  };

  const preview = await prepareTaskBootstrap({
    input: packet,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: false,
  });

  await prepareTaskBootstrap({
    input: { ...packet, planDigest: preview.planDigest },
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    runner,
    apply: true,
  });

  const claimed = await claimTaskBootstrap({
    pendingId: "pending-auto-01",
    projectRoot: projectDir,
    invocationPath: projectDir,
    stateRoot: sandbox.state,
    claimNonce: "autopilot-runner-claim",
    runner,
  });

  assert.equal(claimed.status, "claimed");
  assert.equal(claimed.selectedStyle, "autopilot-quick");
  assert.equal(claimed.dispatchAuthorized, false, "Autopilot claim MUST NOT grant direct dispatch authorization");
  assert.ok(claimed.nextAction.includes("requires separate contract preview, exact digest approval, and separate start command"));
});
