import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  antigravityControllerArgs,
  antigravityReviewerArgs,
  assertAntigravitySubagentDispatch,
  assertModelCompliance,
  canonicalModelToAntigravityTier,
  resolveAntigravityRoleModel,
  resolveHarnessRoleModel,
  runAntigravityController,
  runAntigravityReviewer,
  validateAntigravitySubagentDispatch,
} from "../src/adapters/task-antigravity.js";
import {
  claudeReviewerArgs,
  runClaudeReviewer,
} from "../src/adapters/task-claude.js";
import {
  codexControllerArgs,
  codexReviewerArgs,
  runCodexController,
  runCodexReviewer,
} from "../src/adapters/task-codex.js";
import {
  piControllerArgs,
  piReviewerArgs,
  runPiController,
  runPiReviewer,
} from "../src/adapters/task-pi.js";
import {
  hermesControllerArgs,
  hermesReviewerArgs,
  runHermesController,
  runHermesReviewer,
} from "../src/adapters/task-hermes.js";
import type { TaskAgentPolicy, DevelopmentTaskContract } from "../src/core/task-contract.js";
import type { ControllerDispatchRequest, ReviewRequest } from "../src/core/task-run.js";
import type { ProcessResult, ProcessSpec } from "../src/core/process.js";
import { createRedactedExcerpt, createRedactionContext } from "../src/core/redaction.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-models-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function mockProcessResult(stdoutText: string, exitCode = 0): ProcessResult {
  const redaction = createRedactionContext();
  return {
    code: exitCode === 0 ? "ok" : "non-zero-exit",
    exitCode,
    signal: null,
    timedOut: false,
    outputCapped: false,
    durationMs: 10,
    stdout: createRedactedExcerpt(stdoutText, redaction, 65536),
    stderr: createRedactedExcerpt("", redaction, 65536),
  };
}

function sampleContract(projectRoot: string, policyOverrides?: Partial<TaskAgentPolicy>): DevelopmentTaskContract {
  return {
    schemaVersion: 1,
    id: "cross-harness-model-contract",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Verify deterministic cross-harness model enforcement across all agents",
    scope: {
      projectRoot,
      workflow: "gsd-quick",
      summary: "Ensure no silent fallback occurs and all contracted models are honored",
    },
    allowedRoots: ["src", "scripts"],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "crit-1",
        title: "Check model dispatch",
        description: "Verify model argument is included in runner execution",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "scripts/test.mjs",
          inputText: "",
          expect: { exitCode: 0 },
        },
      },
    ],
    agentPolicy: {
      controller: "antigravity",
      executor: "antigravity",
      reviewer: "claude",
      reviewerSession: "fresh-read-only",
      controllerModel: "gemini-3.8-flash-high",
      executorModel: "gemini-3.8-flash-high",
      reviewerModel: "gemini-4-argon-high",
      ...policyOverrides,
    },
    resourcePolicy: {
      maxWallTimeMinutes: 15,
    },
  };
}

test("resolveHarnessRoleModel respects precedence: direct option > agentPolicy > .planning/config.json", async (t) => {
  const root = await scratch(t, "precedence");
  await mkdir(join(root, ".planning"), { recursive: true });

  await writeFile(
    join(root, ".planning", "config.json"),
    JSON.stringify({
      model_profile_overrides: {
        antigravity: { reviewer: "gemini-4-argon-config", controller: "gemini-3.8-flash-config" },
        claude: { reviewer: "claude-3-7-sonnet-config" },
        codex: { controller: "o3-mini-config" },
      },
    }),
    "utf8",
  );

  // 1. Direct adapterModel takes highest priority
  const directModel = await resolveHarnessRoleModel({
    harness: "antigravity",
    role: "reviewer",
    adapterModel: "gemini-4-argon-direct",
    agentPolicy: { controller: "antigravity", executor: "antigravity", reviewer: "antigravity", reviewerSession: "fresh-read-only", reviewerModel: "gemini-4-argon-contract" },
    projectRoot: root,
  });
  assert.equal(directModel, "gemini-4-argon-direct");

  // 2. In absence of direct option, contract agentPolicy takes priority
  const policyModel = await resolveHarnessRoleModel({
    harness: "antigravity",
    role: "reviewer",
    agentPolicy: { controller: "antigravity", executor: "antigravity", reviewer: "antigravity", reviewerSession: "fresh-read-only", reviewerModel: "gemini-4-argon-contract" },
    projectRoot: root,
  });
  assert.equal(policyModel, "gemini-4-argon-contract");

  // 3. In absence of direct and policy, .planning/config.json is resolved
  const configModel = await resolveHarnessRoleModel({
    harness: "antigravity",
    role: "reviewer",
    projectRoot: root,
  });
  assert.equal(configModel, "gemini-4-argon-config");

  // 4. Claude reviewer resolves from config when no direct or policy
  const claudeConfigModel = await resolveHarnessRoleModel({
    harness: "claude",
    role: "reviewer",
    projectRoot: root,
  });
  assert.equal(claudeConfigModel, "claude-3-7-sonnet-config");

  // 5. Codex controller resolves from config when no direct or policy
  const codexConfigModel = await resolveHarnessRoleModel({
    harness: "codex",
    role: "controller",
    projectRoot: root,
  });
  assert.equal(codexConfigModel, "o3-mini-config");
});

test("resolveHarnessRoleModel sanitizes invalid characters against SAFE_MODEL_ID", async () => {
  const unsafeModel = await resolveHarnessRoleModel({
    harness: "antigravity",
    role: "reviewer",
    adapterModel: "gemini-4-argon; rm -rf /",
    agentPolicy: { controller: "antigravity", executor: "antigravity", reviewer: "antigravity", reviewerSession: "fresh-read-only", reviewerModel: "gemini-4-argon-safe" },
  });
  // Unsafe direct option should be rejected, falling back to agentPolicy
  assert.equal(unsafeModel, "gemini-4-argon-safe");
});

test("canonicalModelToAntigravityTier maps canonical models to AGY invoke_subagent tiers", () => {
  assert.equal(canonicalModelToAntigravityTier("gemini-4-argon-high"), "pro");
  assert.equal(canonicalModelToAntigravityTier("gemini-4-argon"), "pro");
  assert.equal(canonicalModelToAntigravityTier("gemini-3.8-pro"), "pro");
  assert.equal(canonicalModelToAntigravityTier("gemini-2.5-pro"), "pro");
  assert.equal(canonicalModelToAntigravityTier("claude-3-opus"), "pro");
  assert.equal(canonicalModelToAntigravityTier("o3"), "pro");

  assert.equal(canonicalModelToAntigravityTier("gemini-3.8-flash-high"), "flash");
  assert.equal(canonicalModelToAntigravityTier("gemini-3.8-flash"), "flash");
  assert.equal(canonicalModelToAntigravityTier("gemini-2.5-flash"), "flash");
  assert.equal(canonicalModelToAntigravityTier("claude-3-5-sonnet"), "flash");
  assert.equal(canonicalModelToAntigravityTier("gpt-4o"), "flash");

  assert.equal(canonicalModelToAntigravityTier("gemini-2.5-flash-lite"), "flash_lite");
  assert.equal(canonicalModelToAntigravityTier("gemini-2.0-flash-lite"), "flash_lite");
  assert.equal(canonicalModelToAntigravityTier("claude-3-haiku"), "flash_lite");

  // Fallback default
  assert.equal(canonicalModelToAntigravityTier(undefined), "pro");
});

test("assertModelCompliance enforces exact matching or fails closed", () => {
  // Matching succeeds without error
  assert.doesNotThrow(() => {
    assertModelCompliance({
      step: "discuss",
      expectedModel: "gemini-4-argon-high",
      actualModel: "gemini-4-argon-high",
      harness: "antigravity",
    });
  });

  // Mismatch throws MODEL_ENFORCEMENT_VIOLATION
  assert.throws(
    () => {
      assertModelCompliance({
        step: "discuss",
        expectedModel: "gemini-4-argon-high",
        actualModel: "gemini-3.8-flash-high",
        harness: "antigravity",
      });
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /MODEL_ENFORCEMENT_VIOLATION/);
      assert.match(err.message, /gemini-4-argon-high/);
      assert.match(err.message, /gemini-3.8-flash-high/);
      return true;
    },
  );

  // Missing actual model when expected is defined throws
  assert.throws(
    () => {
      assertModelCompliance({
        step: "plan",
        expectedModel: "gemini-4-argon-high",
        actualModel: undefined,
        harness: "claude",
      });
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /MODEL_ENFORCEMENT_VIOLATION/);
      return true;
    },
  );
});

test("Antigravity argument vector formats model flags", () => {
  const withoutModel = antigravityControllerArgs({ schemaPath: "/tmp/schema.json" });
  assert.equal(withoutModel.includes("--model"), false);

  const withModel = antigravityControllerArgs({ schemaPath: "/tmp/schema.json", model: "gemini-3.8-flash-high" });
  assert.equal(withModel.includes("--model"), true);
  const idx = withModel.indexOf("--model");
  assert.equal(withModel[idx + 1], "gemini-3.8-flash-high");

  const reviewerWithModel = antigravityReviewerArgs({ schemaPath: "/tmp/schema.json", model: "gemini-4-argon-high" });
  assert.equal(reviewerWithModel.includes("--model"), true);
  const rIdx = reviewerWithModel.indexOf("--model");
  assert.equal(reviewerWithModel[rIdx + 1], "gemini-4-argon-high");
});

test("Claude argument vector formats model flags", () => {
  const withoutModel = claudeReviewerArgs({ sessionId: "11111111-2222-3333-4444-555555555555", reviewSchemaJson: "{}" });
  assert.equal(withoutModel.includes("--model"), false);

  const withModel = claudeReviewerArgs({
    sessionId: "11111111-2222-3333-4444-555555555555",
    reviewSchemaJson: "{}",
    model: "claude-3-7-sonnet-20250219",
  });
  assert.equal(withModel.includes("--model"), true);
  const idx = withModel.indexOf("--model");
  assert.equal(withModel[idx + 1], "claude-3-7-sonnet-20250219");
});

test("Codex argument vector formats model flags with -m", () => {
  const withoutModel = codexControllerArgs({
    projectRoot: "/tmp/repo",
    outputSchemaPath: "/tmp/schema.json",
    lastMessagePath: "/tmp/msg.json",
    gitDirectory: null,
  });
  assert.equal(withoutModel.includes("-m"), false);

  const withModel = codexControllerArgs({
    projectRoot: "/tmp/repo",
    outputSchemaPath: "/tmp/schema.json",
    lastMessagePath: "/tmp/msg.json",
    gitDirectory: null,
    model: "o3-mini",
  });
  assert.equal(withModel.includes("-m"), true);
  const idx = withModel.indexOf("-m");
  assert.equal(withModel[idx + 1], "o3-mini");

  const reviewerWithModel = codexReviewerArgs({
    reviewRoot: "/tmp/review",
    outputSchemaPath: "/tmp/schema.json",
    lastMessagePath: "/tmp/msg.json",
    model: "o3-mini",
  });
  assert.equal(reviewerWithModel.includes("-m"), true);
  const rIdx = reviewerWithModel.indexOf("-m");
  assert.equal(reviewerWithModel[rIdx + 1], "o3-mini");
});

test("Pi argument vector formats model flags", () => {
  const withoutModel = piControllerArgs({ schemaPath: "/tmp/schema.json" });
  assert.equal(withoutModel.includes("--model"), false);

  const withModel = piControllerArgs({ schemaPath: "/tmp/schema.json", model: "claude-3-5-sonnet" });
  assert.equal(withModel.includes("--model"), true);
  const idx = withModel.indexOf("--model");
  assert.equal(withModel[idx + 1], "claude-3-5-sonnet");

  const reviewerWithModel = piReviewerArgs({ schemaPath: "/tmp/schema.json", model: "gemini-2.5-pro" });
  assert.equal(reviewerWithModel.includes("--model"), true);
  const rIdx = reviewerWithModel.indexOf("--model");
  assert.equal(reviewerWithModel[rIdx + 1], "gemini-2.5-pro");
});

test("Hermes argument vector formats model flags", () => {
  const withoutModel = hermesControllerArgs({
    prompt: "do work",
    usageFile: "/tmp/usage.json",
    projectRoot: "/tmp/project",
  });
  assert.equal(withoutModel.includes("--model"), false);

  const withModel = hermesControllerArgs({
    prompt: "do work",
    usageFile: "/tmp/usage.json",
    projectRoot: "/tmp/project",
    model: "hermes-3-llama-3.1-405b",
  });
  assert.equal(withModel.includes("--model"), true);
  const idx = withModel.indexOf("--model");
  assert.equal(withModel[idx + 1], "hermes-3-llama-3.1-405b");

  const reviewerWithModel = hermesReviewerArgs({
    prompt: "review work",
    usageFile: "/tmp/usage.json",
    reviewRoot: "/tmp/review",
    model: "hermes-3-llama-3.1-70b",
  });
  assert.equal(reviewerWithModel.includes("--model"), true);
  const rIdx = reviewerWithModel.indexOf("--model");
  assert.equal(reviewerWithModel[rIdx + 1], "hermes-3-llama-3.1-70b");
});

test("Cross-harness delegation dispatches the exact contracted model for each harness", async (t) => {
  const root = await scratch(t, "cross-delegation");
  const contract = sampleContract(root, {
    controller: "antigravity",
    executor: "antigravity",
    reviewer: "claude",
    controllerModel: "gemini-3.8-flash-high",
    executorModel: "gemini-3.8-flash-high",
    reviewerModel: "gemini-4-argon-high",
  });

  const capturedCommands: { executable: string; args: string[] }[] = [];
  const testRunner = async (spec: ProcessSpec): Promise<ProcessResult> => {
    capturedCommands.push({ executable: spec.executable, args: [...spec.args] });
    if (spec.args.includes("--version")) {
      return mockProcessResult("1.0.0");
    }
    // Return minimal valid schema-conformant output
    return mockProcessResult(
      JSON.stringify({
        schemaVersion: 1,
        status: "complete",
        summary: "Execution succeeded",
        gsd: { quickId: "q-1", summaryPath: ".planning/quick/q-1.md" },
        authorityRequest: null,
        decisionsLogged: 1,
      }),
    );
  };

  const fakeResolver = (cmd: string) => `/mock/bin/${cmd}`;

  // 1. Run Antigravity Controller - should use controllerModel (gemini-3.8-flash-high)
  await runAntigravityController(
    {
      runId: "run-test-1",
      contract,
      contractDigest: "digest1",
      prompt: "Execute task",
      projectRoot: root,
      scratchRoot: join(root, "scratch"),
      decisionLogPath: join(root, "decisions.log"),
      gitDirectory: null,
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
    },
    {
      runner: testRunner,
      resolve: fakeResolver,
    },
  );

  const ctrlLaunch = capturedCommands.find((c) => !c.args.includes("--version"));
  assert(ctrlLaunch !== undefined, "Antigravity controller command must be launched");
  assert(ctrlLaunch.args.includes("--model"), "Antigravity controller must include --model flag");
  const ctrlModelIdx = ctrlLaunch.args.indexOf("--model");
  assert.equal(ctrlLaunch.args[ctrlModelIdx + 1], "gemini-3.8-flash-high");

  // 2. Run Claude Reviewer - should use reviewerModel (gemini-4-argon-high)
  capturedCommands.length = 0;
  const reviewRunner = async (spec: ProcessSpec): Promise<ProcessResult> => {
    capturedCommands.push({ executable: spec.executable, args: [...spec.args] });
    if (spec.args.includes("--version")) {
      return mockProcessResult("1.0.0");
    }
    return mockProcessResult(
      JSON.stringify({
        schemaVersion: 2,
        requestId: "req-1",
        contractId: contract.id,
        contractDigest: "digest1",
        artifactDigest: "art1",
        targetRevisionSha: "sha1",
        verdict: "pass",
        decisions: [{ criterionId: "crit-1", verdict: "pass", rationale: "passed", locator: { kind: "check-receipt", measurementIndex: 0 } }],
        feedback: "clean pass",
      }),
    );
  };

  await runClaudeReviewer(
    {
      runId: "run-test-2",
      contract,
      requestId: "req-1",
      sessionId: "11111111-2222-3333-4444-555555555555",
      contractDigest: "digest1",
      artifactDigest: "art1",
      targetRevisionSha: "sha1",
      reviewRoot: root,
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      measurements: [],
    },
    {
      runner: reviewRunner,
      resolve: fakeResolver,
    },
  );

  const revLaunch = capturedCommands.find((c) => !c.args.includes("--version"));
  assert(revLaunch !== undefined, "Claude reviewer command must be launched");
  assert(revLaunch.args.includes("--model"), "Claude reviewer must include --model flag");
  const revModelIdx = revLaunch.args.indexOf("--model");
  assert.equal(revLaunch.args[revModelIdx + 1], "gemini-4-argon-high");
});

test("Antigravity subagent dispatch rejects typeName 'self' with explicit override and allows dedicated types", () => {
  // Reject 'self' with explicit model override
  const selfCheck = validateAntigravitySubagentDispatch({
    typeName: "self",
    requestedModel: "gemini-4-argon-high",
    parentModel: "gemini-3.8-flash-high",
  });
  assert.equal(selfCheck.ok, false);
  assert.equal(selfCheck.code, "INCOMPATIBLE_SUBAGENT_MODEL");

  assert.throws(
    () => {
      assertAntigravitySubagentDispatch({
        typeName: "self",
        requestedModel: "gemini-4-argon-high",
        parentModel: "gemini-3.8-flash-high",
      });
    },
    (err: unknown) => {
      assert(err instanceof Error);
      assert.match(err.message, /INCOMPATIBLE_SUBAGENT_MODEL/);
      return true;
    },
  );

  // Allow 'self' when model is inherit
  const selfInherit = validateAntigravitySubagentDispatch({
    typeName: "self",
    requestedModel: "inherit",
    parentModel: "gemini-3.8-flash-high",
  });
  assert.equal(selfInherit.ok, true);

  // Allow dedicated role subagents with explicit model override
  const plannerCheck = validateAntigravitySubagentDispatch({
    typeName: "gsd-planner",
    requestedModel: "pro",
    parentModel: "flash",
  });
  assert.equal(plannerCheck.ok, true);
  assert.equal(plannerCheck.code, "OK");
});
