import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  codexStageObservationCapability,
  observeCodexStages,
  type ObservedNativeStageResult,
} from "../src/core/task-gsd-stage-observation.js";
import { runCodexController } from "../src/adapters/task-codex.js";
import { createTaskFixture, inventorySummaryContract } from "./helpers/task-fixture.js";

function jsonl(...events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n");
}

test("codexStageObservationCapability: supported only for codex controller", () => {
  const codexPolicy = {
    controller: "codex" as const,
    executor: "codex" as const,
    reviewer: "antigravity" as const,
    reviewerSession: "fresh-read-only" as const,
  };
  const cap = codexStageObservationCapability(codexPolicy);
  assert.equal(cap.supported, true);
  assert.equal(cap.harness, "codex");

  const agyPolicy = {
    controller: "antigravity" as const,
    executor: "antigravity" as const,
    reviewer: "codex" as const,
    reviewerSession: "fresh-read-only" as const,
  };
  const agyCap = codexStageObservationCapability(agyPolicy);
  assert.equal(agyCap.supported, false);
  assert.ok(agyCap.reason?.includes("antigravity does not provide native full stage observation"));
});

test("observeCodexStages: extracts full 7-stage chain from complete supported fixture", () => {
  const stdout = jsonl(
    { type: "thread.started", thread_id: "thread-full-01" },
    { type: "turn_context", payload: { model: "gpt-6.1-sol", effort: "high" } },
    // 1. discussion
    { type: "item.created", item: { id: "call_01", type: "function_call", name: "gsd_discussion", arguments: "{}" } },
    { type: "item.created", item: { id: "res_01", type: "function_call_output", call_id: "call_01", output: { outcome: "passed" } } },
    // 2. research
    { type: "item.created", item: { id: "call_02", type: "function_call", name: "gsd_research", arguments: "{}" } },
    { type: "item.created", item: { id: "res_02", type: "function_call_output", call_id: "call_02", output: { outcome: "passed" } } },
    // 3. planning
    { type: "item.created", item: { id: "call_03", type: "function_call", name: "gsd_planning", arguments: "{}" } },
    {
      type: "item.created",
      item: {
        id: "res_03",
        type: "function_call_output",
        call_id: "call_03",
        output: {
          outcome: "passed",
          artifacts: [{ path: ".planning/quick/01-test/01-test-PLAN.md", sha256: "0".repeat(64) }],
        },
      },
    },
    // 4. plan-check
    {
      type: "item.created",
      item: {
        id: "call_04",
        type: "function_call",
        name: "gsd_plan_check",
        arguments: JSON.stringify({
          artifacts: [{ path: ".planning/quick/01-test/01-test-PLAN.md", sha256: "0".repeat(64) }],
        }),
      },
    },
    { type: "item.created", item: { id: "res_04", type: "function_call_output", call_id: "call_04", output: { outcome: "passed" } } },
    // 5. implementation
    { type: "item.created", item: { id: "call_05", type: "function_call", name: "gsd_implementation", arguments: "{}" } },
    {
      type: "item.created",
      item: {
        id: "res_05",
        type: "function_call_output",
        call_id: "call_05",
        output: {
          outcome: "passed",
          artifacts: [{ path: "src/index.ts", sha256: "1".repeat(64) }],
        },
      },
    },
    // 6. verification
    { type: "item.created", item: { id: "call_06", type: "function_call", name: "gsd_verification", arguments: "{}" } },
    {
      type: "item.created",
      item: {
        id: "res_06",
        type: "function_call_output",
        call_id: "call_06",
        output: {
          outcome: "passed",
          artifacts: [{ path: ".planning/quick/01-test/01-test-SUMMARY.md", sha256: "2".repeat(64) }],
        },
      },
    },
    // 7. state-docs
    { type: "item.created", item: { id: "call_07", type: "function_call", name: "gsd_state_docs", arguments: "{}" } },
    {
      type: "item.created",
      item: {
        id: "res_07",
        type: "function_call_output",
        call_id: "call_07",
        output: {
          outcome: "passed",
          artifacts: [{ path: ".planning/STATE.md", sha256: "3".repeat(64) }],
        },
      },
    },
  );

  const result = observeCodexStages(stdout, {
    projectRoot: "/workspace",
    expectedModel: "gpt-6.1-sol",
    expectedEffort: "high",
  });

  assert.equal(result.status, "observed");
  assert.equal(result.sessionId, "thread-full-01");
  assert.equal(result.stages.length, 7);

  const stageNames = result.stages.map((s) => s.stage);
  assert.deepEqual(stageNames, [
    "discussion",
    "research",
    "planning",
    "plan-check",
    "implementation",
    "verification",
    "state-docs",
  ]);

  // Verify plan-check inherited plan artifact from arguments
  const planCheckStage = result.stages.find((s) => s.stage === "plan-check");
  assert.ok(planCheckStage);
  assert.equal(planCheckStage.inputArtifacts.length, 1);
  assert.equal(planCheckStage.inputArtifacts[0]?.path, ".planning/quick/01-test/01-test-PLAN.md");
});

test("observeCodexStages: rejects event replay and duplicate IDs", () => {
  const stdout = jsonl(
    { type: "thread.started", thread_id: "thread-dup" },
    { type: "item.created", item: { id: "call_dup", type: "function_call", name: "gsd_discussion", arguments: "{}" } },
    { type: "item.created", item: { id: "res_01", type: "function_call_output", call_id: "call_dup", output: "passed" } },
    // Duplicate call ID
    { type: "item.created", item: { id: "call_dup", type: "function_call", name: "gsd_research", arguments: "{}" } },
  );

  const result = observeCodexStages(stdout, { projectRoot: "/workspace" });
  assert.equal(result.status, "failed");
  assert.ok(result.reason?.includes("Duplicate invocation/result IDs observed"));
});

test("observeCodexStages: rejects mixed session ancestry", () => {
  const stdout = jsonl(
    { type: "thread.started", thread_id: "session-A" },
    { type: "item.created", item: { id: "call_mix", type: "function_call", name: "gsd_discussion", arguments: "{}" } },
    // Result arrives under a different thread_id
    { type: "item.created", session_id: "session-B", item: { id: "res_mix", type: "function_call_output", call_id: "call_mix", output: "passed" } },
  );

  const result = observeCodexStages(stdout, { projectRoot: "/workspace" });
  assert.equal(result.status, "failed");
  assert.ok(result.reason?.includes("Mixed session ancestry"));
});

test("observeCodexStages: rejects unexpected model or effort", () => {
  const stdoutWrongModel = jsonl(
    { type: "thread.started", thread_id: "thread-model" },
    { type: "turn_context", payload: { model: "claude-3-5-sonnet", effort: "high" } },
  );
  const resultModel = observeCodexStages(stdoutWrongModel, {
    projectRoot: "/workspace",
    expectedModel: "gpt-6.1-sol",
  });
  assert.equal(resultModel.status, "unsupported");
  assert.ok(resultModel.reason?.includes("Observed turn model claude-3-5-sonnet does not match expected"));

  const stdoutWrongEffort = jsonl(
    { type: "thread.started", thread_id: "thread-effort" },
    { type: "turn_context", payload: { model: "gpt-6.1-sol", effort: "low" } },
  );
  const resultEffort = observeCodexStages(stdoutWrongEffort, {
    projectRoot: "/workspace",
    expectedModel: "gpt-6.1-sol",
    expectedEffort: "high",
  });
  assert.equal(resultEffort.status, "unsupported");
  assert.ok(resultEffort.reason?.includes("Observed turn effort low does not match expected"));
});

test("observeCodexStages: returns partial when output stream is capped or missing result", () => {
  const stdout = jsonl(
    { type: "thread.started", thread_id: "thread-cap" },
    { type: "item.created", item: { id: "call_01", type: "function_call", name: "gsd_discussion", arguments: "{}" } },
  );

  // 1. Explicit outputCapped
  const resultCapped = observeCodexStages(stdout, { projectRoot: "/workspace", outputCapped: true });
  assert.equal(resultCapped.status, "partial");
  assert.ok(resultCapped.reason?.includes("capped"));

  // 2. Missing result for invocation
  const resultMissing = observeCodexStages(stdout, { projectRoot: "/workspace", outputCapped: false });
  assert.equal(resultMissing.status, "partial");
  assert.ok(resultMissing.reason?.includes("Missing result for observed stage invocation"));
});

test("observeCodexStages: controller claim alone and exit 0 cannot create stage receipts", () => {
  // Ordinary output where model output doesn't contain stage tool invocations
  const stdout = jsonl(
    { type: "thread.started", thread_id: "thread-claim-only" },
    { type: "item.created", item: { id: "msg_01", type: "agent_message", text: "I have completed all stages including --full!" } },
    { type: "turn.completed" },
  );

  const result = observeCodexStages(stdout, { projectRoot: "/workspace" });
  assert.equal(result.status, "unsupported");
  assert.ok(result.reason?.includes("No native GSD stages observed"));
  assert.equal(result.stages.length, 0);
});

test("runCodexController attaches stageObservation to ControllerDispatchResult", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.agentPolicy = {
    controller: "codex",
    executor: "codex",
    reviewer: "antigravity",
    controllerModel: "gpt-6.1-sol",
    controllerEffort: "high",
    reviewerSession: "fresh-read-only",
  };

  const mockStdout = jsonl(
    { type: "thread.started", thread_id: "thread-mock" },
    { type: "turn_context", payload: { model: "gpt-6.1-sol", effort: "high" } },
    { type: "item.created", item: { id: "call_d1", type: "function_call", name: "gsd_discussion", arguments: "{}" } },
    { type: "item.created", item: { id: "res_d1", type: "function_call_output", call_id: "call_d1", output: { outcome: "passed" } } },
    { type: "turn.completed" },
  );

  // Run mock controller
  const result = await runCodexController(
    {
      runId: "run-mock-01",
      contract,
      contractDigest: "0".repeat(64),
      projectRoot: fixture.projectRoot,
      scratchRoot: fixture.scratch,
      decisionLogPath: join(fixture.scratch, "decisions.jsonl"),
      prompt: "test prompt",
      deadlineAt: null,
      gitDirectory: null,
    },
    {
      runner: async () => ({
        code: "ok",
        exitCode: 0,
        signal: null,
        timedOut: false,
        durationMs: 10,
        stdout: {
          excerpt: mockStdout,
          sha256: "0".repeat(64),
          totalBytes: Buffer.byteLength(mockStdout),
          capped: false,
        },
        stderr: { excerpt: "", sha256: "0".repeat(64), totalBytes: 0, capped: false },
        outputCapped: false,
        closeConfirmed: true,
      }),
      resolve: () => join(fixture.scratch, "codex.exe"),
    },
  );

  assert.equal(result.harness, "codex");
  assert.ok(result.stageObservation);
  assert.equal(result.stageObservation.status, "observed");
  assert.equal(result.stageObservation.stages.length, 1);
  assert.equal(result.stageObservation.stages[0]?.stage, "discussion");
});
