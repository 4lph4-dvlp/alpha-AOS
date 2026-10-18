import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";
import {
  antigravityControllerArgs,
  antigravityExecutorArgs,
  antigravityReviewerArgs,
  assertAntigravitySubagentDispatch,
  resolveAntigravityRoleModel,
  runAntigravityController,
  runAntigravityReviewer,
  validateAntigravitySubagentDispatch,
} from "../src/adapters/task-antigravity.js";
import { verifyRoleCapabilities } from "../src/adapters/task-agents.js";
import {
  receiptFilePath,
  writeHarnessRoleReceipt,
  type HarnessRoleReceipt,
} from "../src/adapters/task-receipts.js";
import {
  collectTaskArtifact,
  materializeTaskSnapshot,
  measureTaskCriterion,
} from "../src/core/task-check.js";
import {
  changedContractFields,
  digestableTaskContract,
  loadTaskContract,
  taskContractDigest,
  type DevelopmentTaskContract,
  type TaskAgentPolicy,
  type TaskContract,
} from "../src/core/task-contract.js";
import {
  buildGsdControllerPrompt,
  verifyGsdEvidence,
} from "../src/core/task-gsd.js";
import type { ProcessResult, ProcessSpec } from "../src/core/process.js";
import { createRedactedExcerpt, createRedactionContext } from "../src/core/redaction.js";

const execFileAsync = promisify(execFile);

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-bugfixes-${name}-`));
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
    durationMs: 12,
    stdout: createRedactedExcerpt(stdoutText, redaction, 65536),
    stderr: createRedactedExcerpt("", redaction, 65536),
  };
}

function sampleContract(projectRoot: string, overrides?: Partial<TaskAgentPolicy>): DevelopmentTaskContract {
  return {
    schemaVersion: 1,
    id: "gptrpg-phase-audit-fix",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Fix autopilot routing, receipt drift, snapshot .planning mirroring, and GSD quick retry resilience",
    scope: {
      projectRoot,
      workflow: "gsd-quick",
      summary: "Execute and verify autopilot bugfixes under GSD quick.",
    },
    allowedRoots: ["src", "scripts"],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "roadmap-check",
        title: "Verify roadmap state from snapshot",
        description: "Script inside snapshot reads .planning/ROADMAP.md and .planning/STATE.md.",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "scripts/verify-roadmap.mjs",
          inputText: "",
          expect: {
            exitCode: 0,
            stdoutJson: { ok: true, hasRoadmap: true },
          },
        },
      },
    ],
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "antigravity",
      reviewerSession: "fresh-read-only",
      ...overrides,
    },
    resourcePolicy: {
      maxWallTimeMinutes: 15,
    },
  };
}

test("BUG-01 & BUG-05: Antigravity args inject --model when configured and resolve models from contract or .planning/config.json", async (context) => {
  const root = await scratch(context, "agy-model");
  await mkdir(join(root, ".planning"), { recursive: true });
  await writeFile(
    join(root, ".planning", "config.json"),
    JSON.stringify(
      {
        model_profile: "quality",
        model_profile_overrides: {
          executor: "claude-sonnet-4-6",
          verifier: "claude-sonnet-4-6",
        },
        review: {
          cross_ai_command: "antigravity -p --model gemini-3-flash-preview",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  assert.deepEqual(antigravityReviewerArgs({ schemaPath: "/tmp/schema.json", model: "claude-sonnet-4-6" }), [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    "/tmp/schema.json",
    "--mode",
    "plan",
    "--sandbox",
    "--model",
    "claude-sonnet-4-6",
  ]);

  assert.deepEqual(
    antigravityControllerArgs({ schemaPath: "/tmp/schema.json", prompt: "run task", model: "gemini-3.1-pro-high" }),
    [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      "/tmp/schema.json",
      "--mode",
      "accept-edits",
      "--model",
      "gemini-3.1-pro-high",
      "run task",
    ],
  );

  assert.deepEqual(
    antigravityExecutorArgs({ schemaPath: "/tmp/schema.json", prompt: "exec task", model: "claude-sonnet-4-6" }),
    [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      "/tmp/schema.json",
      "--mode",
      "accept-edits",
      "--model",
      "claude-sonnet-4-6",
      "exec task",
    ],
  );

  const contractWithoutExplicitModel = sampleContract(root);
  const resolvedFromPlanningConfig = await resolveAntigravityRoleModel({
    role: "reviewer",
    agentPolicy: contractWithoutExplicitModel.agentPolicy,
    projectRoot: root,
  });
  assert.equal(resolvedFromPlanningConfig, "claude-sonnet-4-6");

  const contractWithExplicitModel = sampleContract(root, {
    reviewerModel: "gemini-3.1-pro-high",
    controllerModel: "claude-opus-4-6",
  });
  const resolvedFromContract = await resolveAntigravityRoleModel({
    role: "reviewer",
    agentPolicy: contractWithExplicitModel.agentPolicy,
    projectRoot: root,
  });
  assert.equal(resolvedFromContract, "gemini-3.1-pro-high");

  // Verify contract digest backward compatibility & drift tracking for model fields
  const baseDigest = taskContractDigest(contractWithoutExplicitModel);
  const modelDigest = taskContractDigest(contractWithExplicitModel);
  assert.notEqual(baseDigest, modelDigest);
  const diffFields = changedContractFields(
    digestableTaskContract(contractWithoutExplicitModel),
    digestableTaskContract(contractWithExplicitModel),
  );
  assert.ok(diffFields.includes("agentPolicy.reviewerModel"));
  assert.ok(diffFields.includes("agentPolicy.controllerModel"));

  const contractFile = join(root, "contract.json");
  await writeFile(contractFile, JSON.stringify(contractWithExplicitModel, null, 2), "utf8");
  const loaded = await loadTaskContract(contractFile);
  assert.equal(loaded.contract.agentPolicy.reviewerModel, "gemini-3.1-pro-high");
  assert.equal(loaded.digest, modelDigest);

  // Verify runAntigravityReviewer and runAntigravityController pass --model into spawned ProcessSpec
  const capturedSpecs: ProcessSpec[] = [];
  const fakeExe = join(root, "antigravity.exe");
  await writeFile(fakeExe, "mock-agy-binary", "utf8");

  await runAntigravityReviewer(
    {
      runId: "00000001-abcdef12",
      requestId: "req-1",
      sessionId: "sess-1",
      contract: contractWithExplicitModel,
      contractDigest: modelDigest,
      artifactDigest: "a".repeat(64),
      targetRevisionSha: "b".repeat(40),
      reviewRoot: root,
      measurements: [],
      deadlineAt: null,
    },
    {
      resolve: () => fakeExe,
      runner: async (spec) => {
        capturedSpecs.push(spec);
        if (spec.args.includes("--version")) {
          return mockProcessResult("antigravity 1.107.0");
        }
        return mockProcessResult(
          JSON.stringify({
            schemaVersion: 1,
            requestId: "req-1",
            sessionId: "sess-1",
            contractDigest: modelDigest,
            artifactDigest: "a".repeat(64),
            summary: "looks good",
            criteria: [
              {
                criterionId: "roadmap-check",
                verdict: "pass",
                severity: "blocking",
                evidence: "ok",
                nextAction: "none",
              },
            ],
            findings: [],
          }),
        );
      },
    },
  );

  const reviewInvocation = capturedSpecs.find((spec) => !spec.args.includes("--version"));
  assert.ok(reviewInvocation, "Expected reviewer process invocation");
  assert.ok(reviewInvocation.args.includes("--model"));
  assert.equal(
    reviewInvocation.args[reviewInvocation.args.indexOf("--model") + 1],
    "gemini-3.1-pro-high",
  );

  capturedSpecs.length = 0;
  await runAntigravityController(
    {
      runId: "00000001-abcdef12",
      contract: contractWithExplicitModel,
      contractDigest: modelDigest,
      projectRoot: root,
      scratchRoot: root,
      decisionLogPath: ".alpha-aos/task-runs/00000001-abcdef12/decisions.jsonl",
      prompt: "controller prompt",
      deadlineAt: null,
      gitDirectory: null,
    },
    {
      resolve: () => fakeExe,
      runner: async (spec) => {
        capturedSpecs.push(spec);
        if (spec.args.includes("--version")) {
          return mockProcessResult("antigravity 1.107.0");
        }
        return mockProcessResult(
          JSON.stringify({
            status: "completed",
            summary: "done",
            authorityRequest: null,
            gsdQuickId: "261018-fix",
          }),
        );
      },
    },
  );

  const controllerInvocation = capturedSpecs.find((spec) => !spec.args.includes("--version"));
  assert.ok(controllerInvocation, "Expected controller process invocation");
  assert.ok(controllerInvocation.args.includes("--model"));
  assert.equal(
    controllerInvocation.args[controllerInvocation.args.indexOf("--model") + 1],
    "claude-opus-4-6",
  );
});

test("BUG-05: validateAntigravitySubagentDispatch fails closed on typeName=self with explicit non-inherit Model", () => {
  const invalidSelfOverride = validateAntigravitySubagentDispatch({
    typeName: "self",
    requestedModel: "flash",
  });
  assert.equal(invalidSelfOverride.ok, false);
  assert.equal(invalidSelfOverride.code, "INCOMPATIBLE_SUBAGENT_MODEL");
  assert.match(invalidSelfOverride.reason ?? "", /forces parent model inheritance/i);

  assert.throws(
    () => assertAntigravitySubagentDispatch({ typeName: "self", requestedModel: "pro" }),
    /INCOMPATIBLE_SUBAGENT_MODEL/,
  );

  assert.equal(validateAntigravitySubagentDispatch({ typeName: "self", requestedModel: "inherit" }).ok, true);
  assert.equal(validateAntigravitySubagentDispatch({ typeName: "self" }).ok, true);
  assert.equal(validateAntigravitySubagentDispatch({ typeName: "gsd-executor", requestedModel: "inherit" }).ok, true);

  const prompt = buildGsdControllerPrompt({
    contract: sampleContract("/workspace/project"),
    contractDigest: "a".repeat(64),
    runId: "00000001-abcdef12",
    decisionLogPath: ".alpha-aos/task-runs/00000001-abcdef12/decisions.jsonl",
    outline: {
      sourceSha256: "b".repeat(64),
      stepNames: ["Step 1: Parse arguments", "Step 2: Initialize"],
    },
  });
  assert.match(prompt, /INCOMPATIBLE_SUBAGENT_MODEL/);
  assert.match(prompt, /typeName 'self'/);
});

test("BUG-02: readHarnessRoleReceipt and verifyRoleCapabilities auto-reprobe and update drifted receipts", async (context) => {
  const root = await scratch(context, "receipt-reprobe");
  const mockCodexExe = join(root, "codex.exe");
  const mockAgyExe = join(root, "antigravity.exe");

  const v1CodexBytes = Buffer.from("codex-binary-v1", "utf8");
  const v1AgyBytes = Buffer.from("agy-binary-v1", "utf8");
  await writeFile(mockCodexExe, v1CodexBytes);
  await writeFile(mockAgyExe, v1AgyBytes);

  const v1CodexHash = createHash("sha256").update(v1CodexBytes).digest("hex");
  const v1AgyHash = createHash("sha256").update(v1AgyBytes).digest("hex");

  for (const role of ["controller", "executor"] as const) {
    const receipt: HarnessRoleReceipt = {
      schemaVersion: 1,
      harness: "codex",
      role,
      version: "0.110.0",
      binarySha256: v1CodexHash,
      executable: mockCodexExe,
      probedAt: new Date(Date.now() - 86_400_000).toISOString(),
      capabilities: { invoked: true, cancelled: true, outputParsed: true },
      sampleDigest: "c".repeat(64),
    };
    await writeHarnessRoleReceipt(receipt, root);
  }

  await writeHarnessRoleReceipt(
    {
      schemaVersion: 1,
      harness: "antigravity",
      role: "reviewer",
      version: "1.100.0",
      binarySha256: v1AgyHash,
      executable: mockAgyExe,
      probedAt: new Date(Date.now() - 86_400_000).toISOString(),
      capabilities: { invoked: true, cancelled: true, outputParsed: true, readOnlyGuaranteed: true },
      sampleDigest: "d".repeat(64),
    },
    root,
  );

  // Simulate host binary upgrade (new binary bytes + new CLI --version output)
  const v2CodexBytes = Buffer.from("codex-binary-v2-upgraded", "utf8");
  const v2AgyBytes = Buffer.from("agy-binary-v2-upgraded", "utf8");
  await writeFile(mockCodexExe, v2CodexBytes);
  await writeFile(mockAgyExe, v2AgyBytes);
  const v2CodexHash = createHash("sha256").update(v2CodexBytes).digest("hex");
  const v2AgyHash = createHash("sha256").update(v2AgyBytes).digest("hex");

  const resolve = (cmd: string) => {
    if (cmd === "codex") return mockCodexExe;
    if (cmd === "antigravity" || cmd === "agy") return mockAgyExe;
    return null;
  };
  const runner = async (spec: ProcessSpec) => {
    if (spec.executable.includes("codex") || spec.args.some((a) => a.includes("codex"))) {
      return mockProcessResult("codex 0.121.0");
    }
    return mockProcessResult("antigravity 1.107.0");
  };

  const policy: TaskAgentPolicy = {
    controller: "codex",
    executor: "codex",
    reviewer: "antigravity",
    reviewerSession: "fresh-read-only",
  };

  // Without reprobeOnDrift, drift is flagged (preserving strict drift detection contract)
  const strictCheck = await verifyRoleCapabilities(policy, { receiptsRoot: root, resolve, runner });
  assert.equal(strictCheck.supported, false);
  assert.equal(strictCheck.missingProof.length, 3);

  // With reprobeOnDrift: true, drifted receipts are automatically re-probed and updated on disk
  const reprobedCheck = await verifyRoleCapabilities(policy, {
    receiptsRoot: root,
    reprobeOnDrift: true,
    resolve,
    runner,
  });
  assert.equal(
    reprobedCheck.supported,
    true,
    `Expected supported: true, got missingProof: ${reprobedCheck.missingProof.join("; ")}`,
  );
  assert.equal(reprobedCheck.controller.version, "0.121.0");
  assert.equal(reprobedCheck.reviewer.version, "1.107.0");

  // Verify the updated receipts were persisted atomically to disk with the new binary hashes
  const persistedCodex = JSON.parse(await readFile(receiptFilePath("codex", "controller", root), "utf8")) as HarnessRoleReceipt;
  assert.equal(persistedCodex.version, "0.121.0");
  assert.equal(persistedCodex.binarySha256, v2CodexHash);

  const persistedAgy = JSON.parse(await readFile(receiptFilePath("antigravity", "reviewer", root), "utf8")) as HarnessRoleReceipt;
  assert.equal(persistedAgy.version, "1.107.0");
  assert.equal(persistedAgy.binarySha256, v2AgyHash);
});

test("BUG-03: materializeTaskSnapshot mirrors .planning regular files without altering artifact digest", async (context) => {
  const root = await scratch(context, "snapshot-planning");
  const projectRoot = join(root, "project");
  const scratchRoot = join(root, "scratch");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await mkdir(join(projectRoot, "scripts"), { recursive: true });
  await mkdir(join(projectRoot, ".planning", "phases", "08-audit"), { recursive: true });
  await mkdir(scratchRoot, { recursive: true });

  await writeFile(join(projectRoot, "src", "index.js"), "export const ready = true;\n", "utf8");
  await writeFile(
    join(projectRoot, "scripts", "verify-roadmap.mjs"),
    [
      'import { existsSync, readFileSync } from "node:fs";',
      'const hasRoadmap = existsSync(".planning/ROADMAP.md");',
      'const hasState = existsSync(".planning/STATE.md");',
      'const text = hasRoadmap ? readFileSync(".planning/ROADMAP.md", "utf8") : "";',
      'process.stdout.write(JSON.stringify({ ok: hasRoadmap && hasState && text.includes("Phase 08"), hasRoadmap }));',
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(projectRoot, ".planning", "ROADMAP.md"), "# Roadmap\n- [x] Phase 08: Audit\n", "utf8");
  await writeFile(join(projectRoot, ".planning", "STATE.md"), "current_phase: 08\nstatus: complete\n", "utf8");
  await writeFile(join(projectRoot, ".planning", "phases", "08-audit", "08-VERIFICATION.md"), "status: passed\n", "utf8");

  const collected = await collectTaskArtifact({
    projectRoot,
    allowedRoots: ["src", "scripts"],
  });
  assert.equal(collected.status, "ok");

  const snapshotDir = join(scratchRoot, "snapshot");
  await materializeTaskSnapshot({
    manifest: collected,
    projectRoot,
    destination: snapshotDir,
  });

  // Verify .planning files are accessible inside snapshotDir
  const snapshotRoadmap = await readFile(join(snapshotDir, ".planning", "ROADMAP.md"), "utf8");
  assert.match(snapshotRoadmap, /Phase 08: Audit/);

  // Verify re-collecting the snapshot preserves the exact manifest digest and file list
  const recollected = await collectTaskArtifact({
    projectRoot: snapshotDir,
    allowedRoots: ["."],
  });
  assert.equal(recollected.status, "ok");
  assert.equal(recollected.digest, collected.digest);

  // Verify criterion measurement script inside snapshot can read .planning/ROADMAP.md and .planning/STATE.md
  const contract = sampleContract(projectRoot);
  const measured = await measureTaskCriterion({
    criterion: contract.criterion[0]!,
    root: snapshotDir,
    scratchRoot,
    allowedRoots: contract.allowedRoots,
    substitute: null,
  });
  assert.equal(measured.outcome, "pass", `Expected pass, got ${measured.outcome}: ${measured.detail}`);
});

test("BUG-04: verifyGsdEvidence accepts pre-existing claimed .planning/quick/<id> directory when allowExistingClaimedQuick is true", async (context) => {
  const root = await scratch(context, "gsd-retry");
  await mkdir(root, { recursive: true });

  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });

  const quickDir = join(root, ".planning", "quick", "261018-r4w-fix-audit");
  await mkdir(quickDir, { recursive: true });
  await writeFile(join(quickDir, "261018-r4w-PLAN.md"), "# Plan\n", "utf8");
  await writeFile(join(quickDir, "261018-r4w-SUMMARY.md"), "# Summary\n", "utf8");
  await writeFile(
    join(root, ".planning", "STATE.md"),
    "| Quick ID | Summary |\n| --- | --- |\n| 261018-r4w | Completed quick audit |\n",
    "utf8",
  );
  await writeFile(join(root, "README.md"), "# Test Repo\n", "utf8");

  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "docs(quick-261018-r4w): complete quick task"], { cwd: root });

  const { stdout: headOut } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  const retryBaseCommit = headOut.trim();

  // Without allowExistingClaimedQuick (initial run), a quick directory already at baseCommit is rejected
  const withoutRetryFlag = await verifyGsdEvidence({
    projectRoot: root,
    baseCommit: retryBaseCommit,
    claimQuickId: "261018-r4w-fix-audit",
  });
  assert.equal(withoutRetryFlag.status, "missing");

  // With allowExistingClaimedQuick: true (contract retry / revision > 1), the claimed quick directory and its commit in HEAD are verified
  const withRetryFlag = await verifyGsdEvidence({
    projectRoot: root,
    baseCommit: retryBaseCommit,
    claimQuickId: "261018-r4w-fix-audit",
    allowExistingClaimedQuick: true,
  });
  assert.equal(withRetryFlag.status, "verified", `Expected verified, got missing: ${withRetryFlag.missing.join(", ")}`);
  assert.equal(withRetryFlag.quickId, "261018-r4w");
  assert.equal(withRetryFlag.stateRow, true);
  assert.equal(withRetryFlag.commits.length, 1);
});
