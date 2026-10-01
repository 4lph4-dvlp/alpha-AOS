import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHarnessTelemetry,
  checkCostMeterReadiness,
  HARNESS_TELEMETRY_CAPABILITIES,
} from "../src/core/task-telemetry.js";
import type { TaskAgentPolicy, TaskResourcePolicy } from "../src/core/task-contract.js";

test("HARNESS_TELEMETRY_CAPABILITIES defines honest metering caps for all 5 harnesses", () => {
  assert.deepEqual(HARNESS_TELEMETRY_CAPABILITIES.claude, { metersTokens: true, metersCost: true });
  assert.deepEqual(HARNESS_TELEMETRY_CAPABILITIES.codex, { metersTokens: true, metersCost: false });
  assert.deepEqual(HARNESS_TELEMETRY_CAPABILITIES.antigravity, { metersTokens: true, metersCost: false });
  assert.deepEqual(HARNESS_TELEMETRY_CAPABILITIES.pi, { metersTokens: false, metersCost: false });
  assert.deepEqual(HARNESS_TELEMETRY_CAPABILITIES.hermes, { metersTokens: true, metersCost: false });
});

test("normalizeHarnessTelemetry preserves honest nulls and does not coerce unmetered to 0", () => {
  const empty = normalizeHarnessTelemetry("hermes", null);
  assert.equal(empty.status, "unmetered");
  assert.equal(empty.promptTokens, null);
  assert.equal(empty.completionTokens, null);
  assert.equal(empty.totalTokens, null);
  assert.equal(empty.costUsd, null);
  assert.equal(empty.durationMs, null);
  assert.equal(empty.modelId, null);

  const rawEmpty = normalizeHarnessTelemetry("hermes", {});
  assert.equal(rawEmpty.status, "unmetered");
  assert.equal(rawEmpty.costUsd, null);
});

test("Hermes, Codex, and Antigravity are not assumed free (0 USD) even if 0 or cost is passed (D-13, D-15)", () => {
  const hermesWithCost = normalizeHarnessTelemetry("hermes", {
    costUsd: 0,
    promptTokens: 100,
    completionTokens: 50,
  });
  assert.equal(hermesWithCost.costUsd, null);
  assert.equal(hermesWithCost.status, "measured");
  assert.equal(hermesWithCost.totalTokens, 150);

  const codexWithCost = normalizeHarnessTelemetry("codex", {
    costUsd: 0.5,
    promptTokens: 200,
    completionTokens: 100,
  });
  assert.equal(codexWithCost.costUsd, null);
  assert.equal(codexWithCost.status, "measured");
  assert.equal(codexWithCost.totalTokens, 300);

  const agyWithCost = normalizeHarnessTelemetry("antigravity", {
    cost: 1.25,
    tokens: { prompt: 40, completion: 60 },
  });
  assert.equal(agyWithCost.costUsd, null);
  assert.equal(agyWithCost.status, "measured");
  assert.equal(agyWithCost.totalTokens, 100);
});

test("Claude correctly captures measured cost and tokens", () => {
  const claudeTelemetry = normalizeHarnessTelemetry("claude", {
    costUsd: 0.125,
    promptTokens: 500,
    completionTokens: 250,
    durationMs: 1200,
    modelId: "claude-3-7-sonnet",
  });
  assert.equal(claudeTelemetry.status, "measured");
  assert.equal(claudeTelemetry.costUsd, 0.125);
  assert.equal(claudeTelemetry.promptTokens, 500);
  assert.equal(claudeTelemetry.completionTokens, 250);
  assert.equal(claudeTelemetry.totalTokens, 750);
  assert.equal(claudeTelemetry.durationMs, 1200);
  assert.equal(claudeTelemetry.modelId, "claude-3-7-sonnet");
});

test("Pi records unmetered for both tokens and cost", () => {
  const piTelemetry = normalizeHarnessTelemetry("pi", {
    promptTokens: 100,
    costUsd: 0.05,
    durationMs: 500,
  });
  assert.equal(piTelemetry.status, "unmetered");
  assert.equal(piTelemetry.promptTokens, null);
  assert.equal(piTelemetry.totalTokens, null);
  assert.equal(piTelemetry.costUsd, null);
  assert.equal(piTelemetry.durationMs, 500);
});

test("checkCostMeterReadiness succeeds when no cost or token limits are configured", () => {
  const policy: TaskAgentPolicy = {
    controller: "pi",
    executor: "hermes",
    reviewer: "antigravity",
    reviewerSession: "fresh-read-only",
  };
  const emptyLimits: TaskResourcePolicy = { maxWallTimeMinutes: 60 };
  const res = checkCostMeterReadiness(policy, emptyLimits);
  assert.equal(res.ready, true);
  assert.deepEqual(res.missingMeters, []);

  const undefinedPolicy = checkCostMeterReadiness(policy, undefined);
  assert.equal(undefinedPolicy.ready, true);
  assert.deepEqual(undefinedPolicy.missingMeters, []);
});

test("checkCostMeterReadiness fails closed with MISSING_TELEMETRY_METER when maxCostUsd is used on unmetered harness (ROL-05, D-14)", () => {
  const policy: TaskAgentPolicy = {
    controller: "codex",
    executor: "codex",
    reviewer: "codex",
    reviewerSession: "fresh-read-only",
  };
  const costLimit: TaskResourcePolicy = { maxCostUsd: 5.0 };
  const res = checkCostMeterReadiness(policy, costLimit);
  assert.equal(res.ready, false);
  assert.equal(res.missingMeters.length, 3);
  for (const msg of res.missingMeters) {
    assert.match(msg, /MISSING_TELEMETRY_METER/);
    assert.match(msg, /does not measure USD cost, required by maxCostUsd/);
  }
});

test("checkCostMeterReadiness fails closed with MISSING_TELEMETRY_METER when maxTokens is used on Pi (ROL-05, D-14)", () => {
  const policy: TaskAgentPolicy = {
    controller: "claude",
    executor: "pi",
    reviewer: "codex",
    reviewerSession: "fresh-read-only",
  };
  const tokenLimit: TaskResourcePolicy = { maxTokens: 10000 };
  const res = checkCostMeterReadiness(policy, tokenLimit);
  assert.equal(res.ready, false);
  assert.equal(res.missingMeters.length, 1);
  assert.match(res.missingMeters[0]!, /executor pi: does not measure token consumption, required by maxTokens \(MISSING_TELEMETRY_METER/);
});

test("checkCostMeterReadiness succeeds on Claude when both maxCostUsd and maxTokens are set", () => {
  const policy: TaskAgentPolicy = {
    controller: "claude",
    executor: "claude",
    reviewer: "claude",
    reviewerSession: "fresh-read-only",
  };
  const limits: TaskResourcePolicy = { maxCostUsd: 2.0, maxTokens: 20000 };
  const res = checkCostMeterReadiness(policy, limits);
  assert.equal(res.ready, true);
  assert.deepEqual(res.missingMeters, []);
});
