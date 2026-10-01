import assert from "node:assert/strict";
import test from "node:test";
import {
  changedContractFields,
  checkCostMeterReadiness,
  detectQuotaExhaustion,
  digestableTaskContract,
  evaluateResourceLimits,
  taskSchema,
  type DigestableTaskContract,
  type TaskContract,
} from "../src/core/task-contract.js";
import { validateManagedDocument } from "../src/core/validation.js";

function baseContract(): TaskContract {
  return {
    schemaVersion: 1,
    id: "task-test-01",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "test limits",
    scope: {
      projectRoot: "test-project",
      workflow: "gsd-quick",
      summary: "summary",
    },
    allowedRoots: ["test-project"],
    allowedEffects: ["workspace-write"],
    criterion: [
      {
        id: "c1",
        title: "criterion 1",
        description: "description 1",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "verify.js",
          inputText: "",
          expect: { exitCode: 0 },
        },
      },
    ],
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "codex",
      reviewerSession: "fresh-read-only",
    },
    resourcePolicy: {},
  };
}

test("schema validation accepts boundary resourcePolicy values", async () => {
  const schema = await taskSchema("task-contract");
  const contract = baseContract();
  contract.resourcePolicy = {
    maxCycles: 1,
    maxWallTimeMinutes: 1,
    maxCostUsd: 0.01,
    maxTokens: 1,
  };

  const validation1 = validateManagedDocument({
    text: JSON.stringify(contract, null, 2),
    format: "json",
    kind: "task-contract",
    schema,
  });
  assert.equal(validation1.ok, true);

  // Upper boundary for wall time (1440 min = 24h)
  contract.resourcePolicy.maxWallTimeMinutes = 1440;
  const validation2 = validateManagedDocument({
    text: JSON.stringify(contract, null, 2),
    format: "json",
    kind: "task-contract",
    schema,
  });
  assert.equal(validation2.ok, true);
});

test("schema validation rejects values outside boundary limits", async () => {
  const schema = await taskSchema("task-contract");

  // maxCycles: 0 rejected
  const c1 = baseContract();
  c1.resourcePolicy = { maxCycles: 0 };
  const v1 = validateManagedDocument({ text: JSON.stringify(c1), format: "json", kind: "task-contract", schema });
  assert.equal(v1.ok, false);

  // maxWallTimeMinutes: 0 rejected
  const c2 = baseContract();
  c2.resourcePolicy = { maxWallTimeMinutes: 0 };
  const v2 = validateManagedDocument({ text: JSON.stringify(c2), format: "json", kind: "task-contract", schema });
  assert.equal(v2.ok, false);

  // maxWallTimeMinutes: 1441 rejected
  const c3 = baseContract();
  c3.resourcePolicy = { maxWallTimeMinutes: 1441 };
  const v3 = validateManagedDocument({ text: JSON.stringify(c3), format: "json", kind: "task-contract", schema });
  assert.equal(v3.ok, false);

  // maxCostUsd: 0 rejected
  const c4 = baseContract();
  c4.resourcePolicy = { maxCostUsd: 0 };
  const v4 = validateManagedDocument({ text: JSON.stringify(c4), format: "json", kind: "task-contract", schema });
  assert.equal(v4.ok, false);

  // maxTokens: 0 rejected
  const c5 = baseContract();
  c5.resourcePolicy = { maxTokens: 0 };
  const v5 = validateManagedDocument({ text: JSON.stringify(c5), format: "json", kind: "task-contract", schema });
  assert.equal(v5.ok, false);
});

test("digestableTaskContract orders resourcePolicy keys alphabetically", () => {
  const contract = baseContract();
  contract.resourcePolicy = {
    maxWallTimeMinutes: 60,
    maxCycles: 5,
    maxTokens: 50000,
    maxCostUsd: 2.5,
  };

  const digestable = digestableTaskContract(contract);
  const keys = Object.keys(digestable.resourcePolicy);
  assert.deepEqual(keys, ["maxCostUsd", "maxCycles", "maxTokens", "maxWallTimeMinutes"]);
});

test("changedContractFields identifies changes in all resourcePolicy fields", () => {
  const c1 = baseContract();
  const c2 = baseContract();

  c1.resourcePolicy = { maxCycles: 2, maxCostUsd: 1.0, maxTokens: 1000, maxWallTimeMinutes: 30 };
  c2.resourcePolicy = { maxCycles: 3, maxCostUsd: 2.0, maxTokens: 2000, maxWallTimeMinutes: 60 };

  const d1 = digestableTaskContract(c1);
  const d2 = digestableTaskContract(c2);

  const changed = changedContractFields(d1, d2);
  assert.deepEqual(changed, [
    "resourcePolicy.maxCostUsd",
    "resourcePolicy.maxCycles",
    "resourcePolicy.maxTokens",
    "resourcePolicy.maxWallTimeMinutes",
  ]);
});

test("evaluateResourceLimits detects cycle limit threshold", () => {
  const res1 = evaluateResourceLimits({ maxCycles: 3 }, { cycles: 2, wallTimeMs: 1000, tokens: 10, costUsd: 0.01 });
  assert.equal(res1.exceeded, false);
  assert.equal(res1.stopCode, null);

  const res2 = evaluateResourceLimits({ maxCycles: 3 }, { cycles: 3, wallTimeMs: 1000, tokens: 10, costUsd: 0.01 });
  assert.equal(res2.exceeded, true);
  assert.equal(res2.stopCode, "cycle_limit_exceeded");
});

test("evaluateResourceLimits detects wall time limit threshold", () => {
  const policy = { maxWallTimeMinutes: 10 }; // 600,000 ms

  const res1 = evaluateResourceLimits(policy, { cycles: 1, wallTimeMs: 599_999, tokens: null, costUsd: null });
  assert.equal(res1.exceeded, false);

  const res2 = evaluateResourceLimits(policy, { cycles: 1, wallTimeMs: 600_000, tokens: null, costUsd: null });
  assert.equal(res2.exceeded, true);
  assert.equal(res2.stopCode, "wall_time_exceeded");
});

test("evaluateResourceLimits handles cent-safe financial precision", () => {
  const policy = { maxCostUsd: 0.08 };
  // 0.07 + 0.01 in JS IEEE-754 floating point equals 0.08000000000000002
  const floatSum = 0.07 + 0.01;

  const res = evaluateResourceLimits(policy, { cycles: 1, wallTimeMs: 100, tokens: 50, costUsd: floatSum });
  assert.equal(res.exceeded, true);
  assert.equal(res.stopCode, "cost_limit_exceeded");
  assert.equal(res.usageBreakdown.costUsd, 0.08);
});

test("evaluateResourceLimits accurately reports unmetered fields", () => {
  const res = evaluateResourceLimits({}, { cycles: 1, wallTimeMs: 500, tokens: null, costUsd: null });
  assert.deepEqual(res.usageBreakdown.unmeteredFields, ["tokens", "costUsd"]);
});

test("checkCostMeterReadiness enforces fail-closed behavior for unmetered harnesses", async () => {
  // Codex has telemetry
  const codex = await checkCostMeterReadiness({
    controller: "codex",
    executor: "codex",
    reviewer: "codex",
    reviewerSession: "fresh-read-only",
  });
  assert.equal(codex.supported, true);

  // Claude CLI has no telemetry
  const claude = await checkCostMeterReadiness({
    controller: "claude",
    executor: "claude",
    reviewer: "claude",
    reviewerSession: "fresh-read-only",
  });
  assert.equal(claude.supported, false);
  assert.ok(claude.reason);
});

test("detectQuotaExhaustion identifies HTTP 429 and provider balance messages", () => {
  assert.equal(detectQuotaExhaustion("Error occurred", 429), true);
  assert.equal(detectQuotaExhaustion("Server returned rate_limit_exceeded from endpoint"), true);
  assert.equal(detectQuotaExhaustion("insufficient_quota on account"), true);
  assert.equal(detectQuotaExhaustion("Credit balance is too low to complete the request"), true);
  assert.equal(detectQuotaExhaustion("usage limit exceeded for model"), true);

  assert.equal(detectQuotaExhaustion("SyntaxError: Unexpected token", 1), false);
  assert.equal(detectQuotaExhaustion("File not found", 0), false);
});
