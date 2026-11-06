import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { reconcileToolState, type ToolObservation } from "../src/core/tool-inventory.js";
import type { ToolRecordEvent, ToolRecordStore, ToolResult } from "../src/core/tool-records.js";

test("inventory formatter shows category summaries", async () => {
  const { formatToolInventory } = await import("../src/format.js");
  const inventory = { observations: [], records: { status: "absent" as const, events: [], accepted: null, diagnostics: [], incomplete: false, operations: [] }, categorySummaries: [{ category: "bundled-library", count: 2, statuses: { installed: 1, absent: 0, unknown: 1 } }] };
  assert.match(formatToolInventory(inventory), /bundled-library.*2/);
});

test("prior acceptance and a later failure do not promote the observed installation", () => {
  const result: ToolResult = { toolId: "cua-driver", requested: { toolId: "cua-driver", selector: "1.0.0", exact: true }, resolved: { release: "1.0.0", artifact: "cua.zip", architecture: "x64", digest: "a".repeat(64), sourceId: "driver-release", sourceUrl: "https://github.com/trycua/cua/releases/download/v1/cua.zip", platform: "windows" }, installed: { installationId: "old", version: "1.0.0", pathAlias: "cua" }, verified: null, evidence: [], outcome: "succeeded" };
  const accepted: ToolRecordEvent = { schemaVersion: 1, eventId: "old-finish", operationId: "old", sequence: 2, occurredAt: "2026-01-01T00:00:00Z", kind: "finished", results: [result], outcome: "succeeded", acceptedTransitions: [] };
  const failed: ToolRecordEvent = { ...accepted, eventId: "new-finish", operationId: "new", occurredAt: "2026-01-02T00:00:00Z", results: [{ ...result, resolved: { ...result.resolved!, release: "2.0.0" }, outcome: "failed" }], outcome: "failed" };
  const records: ToolRecordStore = { status: "current", diagnostics: [], incomplete: false, events: [failed, accepted], operations: [{ operationId: "new", status: "failed" }], accepted: { "cua-driver/old": createHash("sha256").update(`${JSON.stringify(accepted)}\n`).digest("hex") } };
  const observation: ToolObservation = { toolId: "cua-driver", installation: "installed", installed: { version: "2.0.0", source: "observed-file" }, selected: null, integrity: "unverified", integration: "unverified", reason: "not checked", nextAction: "inspect" };
  reconcileToolState(observation, records);
  assert.equal(observation.currentObservation?.version, "2.0.0");
  assert.equal(observation.currentObservation?.integrity, "unverified");
  assert.equal(observation.acceptedIdentity?.version, "1.0.0");
  assert.equal(observation.latestOperation?.status, "failed");
  assert.equal(observation.latestOperation?.version, "2.0.0");
});

test("current proof is reused only for the exact fingerprint, identity and harness", () => {
  const fingerprint = "a".repeat(64), path = "/fixture/driver";
  const result: ToolResult = { toolId: "cua-driver", requested: { toolId: "cua-driver", selector: "1.0.0", exact: true }, resolved: { release: "1.0.0", artifact: "cua.zip", architecture: "x64", digest: "b".repeat(64), sourceId: "driver-release", sourceUrl: "https://github.com/trycua/cua/releases/download/v1/cua.zip", platform: "linux" }, installed: { installationId: "old", version: "1.0.0", pathAlias: path }, verified: "invoke", evidence: ["protocol", "invocation"].map((method) => ({ proofId: method, subject: "old", target: "integration", method, result: "pass", platform: "linux", architecture: "x64", harness: "codex", fingerprint })), outcome: "succeeded" };
  const event: ToolRecordEvent = { schemaVersion: 1, eventId: "finish", operationId: "old", sequence: 2, occurredAt: "2026-01-01T00:00:00Z", kind: "finished", results: [result], outcome: "succeeded", acceptedTransitions: [] };
  const records: ToolRecordStore = { status: "current", diagnostics: [], incomplete: false, events: [event], operations: [], accepted: { "cua-driver/old": createHash("sha256").update(`${JSON.stringify(event)}\n`).digest("hex") } };
  const observation: ToolObservation = { toolId: "cua-driver", installation: "installed", installed: { version: "1.0.0", source: "observed-file" }, selected: null, integrity: "unverified", integration: "unverified", reason: "not checked", nextAction: "inspect", bindings: [{ harness: "codex", status: "active", candidatePath: path, connectionOwner: "unknown", reason: "fixture", nextAction: "inspect" }] };
  reconcileToolState(observation, records, { path, fingerprint, platform: "linux", architecture: "x64" });
  assert.equal(observation.proofScopes?.protocol, "verified");
  assert.equal(observation.proofScopes?.invocation, "verified");
  reconcileToolState(observation, records, { path, fingerprint: "c".repeat(64), platform: "linux", architecture: "x64" });
  assert.equal(observation.proofScopes?.invocation, "unverified");
});
