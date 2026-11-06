import assert from "node:assert/strict";
import test from "node:test";
import * as inventory from "../src/core/tool-inventory.js";
import { evaluateLegacyHandoff, prepareLegacyToolHandoff, type LegacyToolEvidence } from "../src/core/tool-handoff.js";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planToolRecordOperation, withToolRecordSession, beginToolOperation, appendToolResult, finishToolOperation } from "../src/core/tool-record-store.js";
import { readToolRecordStore } from "../src/core/tool-records.js";
import { createHash, generateKeyPairSync, sign } from "node:crypto";

test("legacy candidates expose a handoff assessment", () => {
  assert.equal(typeof (inventory as Record<string, unknown>).reconcileToolState, "function");
});

test("explicit writer preserves closed legacy references", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-handoff-"));
  try {
    const checkout = join(root, "checkout"), stateRoot = join(root, "state");
    await mkdir(checkout);
    const requested = { toolId: "cua-driver", selector: "1.0.0", exact: true };
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "handoff", occurredAt: "2026-01-01T00:00:00Z", requests: [requested] });
    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      await appendToolResult(plan, session, { toolId: requested.toolId, requested, resolved: null, installed: null, verified: null, evidence: [], outcome: "succeeded", legacy: prepareLegacyToolHandoff(evidence, chain, anchors) });
      await finishToolOperation(plan, session);
    });
    const store = await readToolRecordStore({ stateRoot, packageRoot: checkout });
    assert.deepEqual(store.events.find((event) => event.result)?.result?.legacy, evidence);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const artifact = Buffer.from("retained artifact");
const evidence: LegacyToolEvidence = { toolId: "cua-driver", sourceId: "driver-release", sourceUrl: "https://github.com/trycua/cua/releases/download/v1.0.0/cua.zip", release: "1.0.0", artifact: "cua.zip", platform: "windows", architecture: "x64", artifactDigest: createHash("sha256").update(artifact).digest("hex"), provenanceRef: "official-metadata", verificationRef: "artifact-check", currentRef: "current-files", scope: "one-file", previousIdentity: "old", priorInstallationOwner: "external", priorConnectionOwner: "unknown", userModificationEvidence: "no-changes" };
const keys = generateKeyPairSync("ed25519");
const metadata = Buffer.from(JSON.stringify(evidence));
const chain = { metadata, signature: sign(null, metadata, keys.privateKey), artifact, current: artifact };
const anchors = [{ sourceId: "driver-release" as const, publicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString() }];

test("handoff needs an independently checked chain and preserves its references", () => {
  assert.equal(evaluateLegacyHandoff(evidence).reason, "trusted-chain-unchecked");
  assert.equal(evaluateLegacyHandoff(evidence, chain, anchors).status, "ready");
  assert.equal(evaluateLegacyHandoff(evidence, { ...chain, current: Buffer.from("changed") }, anchors).status, "modified");
  assert.equal(evaluateLegacyHandoff(evidence, { ...chain, signature: Buffer.alloc(64) }, anchors).reason, "provenance-signature-untrusted");
  assert.throws(() => prepareLegacyToolHandoff(evidence), /insufficient/);
  assert.equal(evaluateLegacyHandoff({ ...evidence, sourceUrl: "https://evil.example/file" }).reason, "official-source-unproven");
  assert.equal(evaluateLegacyHandoff({ ...evidence, verificationRef: "" }).reason, "artifact-verification-missing");
  assert.equal(evaluateLegacyHandoff({ ...evidence, transformed: { sourceDigest: "", revision: "v1", parametersRef: "p", targetDigest: "a" } }).reason, "transformation-sourceDigest-missing");
});

test("transformed output is linked to signed source and target hashes", () => {
  const source = Buffer.from("source"), current = Buffer.from("transformed");
  const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
  const transformed = { ...evidence, transformed: { sourceDigest: digest(source), revision: "revision1", parametersRef: "params1", targetDigest: digest(current) } };
  const signed = Buffer.from(JSON.stringify(transformed));
  const transformedChain = { metadata: signed, signature: sign(null, signed, keys.privateKey), artifact, source, current };
  assert.equal(evaluateLegacyHandoff(transformed, transformedChain, anchors).status, "ready");
  assert.equal(evaluateLegacyHandoff(transformed, { ...transformedChain, source: Buffer.from("different") }, anchors).reason, "transformation-source-mismatch");
  assert.equal(evaluateLegacyHandoff({ ...transformed, transformed: { ...transformed.transformed, revision: "other" } }, transformedChain, anchors).reason, "transformation-link-mismatch");
});
