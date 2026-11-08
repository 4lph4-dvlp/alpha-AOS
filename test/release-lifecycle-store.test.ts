import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  planReleaseLifecycleOperation,
  appendReleaseLifecycleEvent,
  readReleaseLifecycle,
  deriveProtectedReleaseArtifacts,
  type ReviewedReleaseRef,
} from "../src/core/release-lifecycle-store.js";
import { readToolRecordStore } from "../src/core/tool-records.js";
import { packageRoot } from "../src/core/paths.js";

async function createTempState(context: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-lifecycle-test-"));
  context.after(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });
  return dir;
}

const mockReviewedRelease: ReviewedReleaseRef = {
  toolId: "mcp:context7",
  release: "4.5.0",
  artifact: "context7-mcp-4.5.0.tgz",
  integrity: "sha512-integrity450",
  digest: "f".repeat(64),
  planDigest: "e".repeat(64),
};

test("Task 42-02-01 Test 1: writes started -> evidence-recorded -> verification-pending lifecycle events with exact metadata", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();
  const operationId = "op-lifecycle-001";
  const now = new Date().toISOString();

  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId,
    occurredAt: now,
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  // Event 1: started
  const e1 = await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: now,
    kind: "started",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
    activeIdentity: {
      installationId: "context7-4.0.4",
      version: "4.0.4",
      pathAlias: "@upstash/context7-mcp",
    },
    lastGoodIdentity: {
      installationId: "context7-4.0.4",
      version: "4.0.4",
    },
  });
  assert.equal(e1.event.sequence, 1);
  assert.equal(e1.event.kind, "started");

  // Event 2: evidence-recorded
  const e2 = await appendReleaseLifecycleEvent(plan, {
    sequence: 2,
    occurredAt: new Date().toISOString(),
    kind: "evidence-recorded",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
    evidenceFingerprint: "1".repeat(64),
    overallState: "pending",
    tiers: [
      {
        tier: "installation",
        state: "pass",
        method: "inactive-check",
        resultDigest: "2".repeat(64),
        evaluatedAt: now,
        reason: "staged inactive",
      },
      {
        tier: "discovery",
        state: "pass",
        method: "exact-discovery",
        resultDigest: "3".repeat(64),
        evaluatedAt: now,
        reason: "discovered",
      },
      {
        tier: "protocol-schema",
        state: "pass",
        method: "schema-check",
        resultDigest: "4".repeat(64),
        evaluatedAt: now,
        reason: "valid schema",
      },
      {
        tier: "invocation",
        state: "pending",
        method: "proxy-check",
        resultDigest: "5".repeat(64),
        evaluatedAt: now,
        reason: "pending reload",
      },
    ],
  });
  assert.equal(e2.event.sequence, 2);
  assert.equal(e2.event.kind, "evidence-recorded");

  // Event 3: verification-pending
  const e3 = await appendReleaseLifecycleEvent(plan, {
    sequence: 3,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
    activeIdentity: {
      installationId: "context7-4.0.4",
      version: "4.0.4",
      pathAlias: "@upstash/context7-mcp",
    },
    lastGoodIdentity: {
      installationId: "context7-4.0.4",
      version: "4.0.4",
    },
    evidenceFingerprint: "1".repeat(64),
    pendingReason: "Host harness reload required before live invocation can be completed.",
    nextAction: "alpha-aos update --resume --tool mcp:context7",
  });
  assert.equal(e3.event.sequence, 3);
  assert.equal(e3.event.kind, "verification-pending");
});

test("Task 42-02-01 Test 2: tool-records acceptance events remain untouched and readable after lifecycle store writes", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();

  // Lifecycle store write
  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId: "op-lifecycle-002",
    occurredAt: new Date().toISOString(),
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "started",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  // Verify that readToolRecordStore continues to read cleanly without error or phantom promotion
  const legacyStore = await readToolRecordStore({ stateRoot, packageRoot: pkgRoot });
  assert.equal(legacyStore.status, "absent");
  assert.equal(legacyStore.events.length, 0);
  assert.equal(legacyStore.accepted, null);
});

test("Task 42-02-01 Test 3: raw credentials or secrets are rejected from serialized lifecycle bytes", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();

  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId: "op-lifecycle-003",
    occurredAt: new Date().toISOString(),
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  // Attempting to inject unexpected raw credential properties into event
  const invalidEvent = {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "started" as const,
    toolId: "mcp:context7" as const,
    reviewedRelease: mockReviewedRelease,
    apiKey: "alpha-aos-secret-token",
  };

  await assert.rejects(
    async () => {
      await appendReleaseLifecycleEvent(plan, invalidEvent as any);
    },
    /Invalid lifecycle event/,
  );
});

test("Task 42-02-01 Test 4: readReleaseLifecycle reconstructs exact pending state and resume inputs without querying latest (D-03)", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();
  const operationId = "op-lifecycle-004";
  const now = new Date().toISOString();

  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId,
    occurredAt: now,
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: now,
    kind: "started",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 2,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
    evidenceFingerprint: "7".repeat(64),
    pendingReason: "Awaiting approval for credential scope",
    nextAction: "alpha-aos update --resume --tool mcp:context7",
  });

  const reconstructed = await readReleaseLifecycle({ stateRoot, operationId });
  assert.ok(reconstructed);
  assert.equal(reconstructed.operationId, operationId);
  assert.equal(reconstructed.toolId, "mcp:context7");
  assert.equal(reconstructed.status, "verification-pending");
  assert.equal(reconstructed.reviewedRelease.release, "4.5.0");
  assert.equal(reconstructed.evidenceFingerprint, "7".repeat(64));
  assert.equal(reconstructed.nextAction, "alpha-aos update --resume --tool mcp:context7");
  assert.deepEqual(reconstructed.resumeInputs, {
    toolId: "mcp:context7",
    release: "4.5.0",
    artifact: "context7-mcp-4.5.0.tgz",
    integrity: "sha512-integrity450",
    fingerprint: "7".repeat(64),
  });
});

test("Task 42-02-02 Test 1: event append idempotency: identical retry succeeds while content drift is rejected (PROOF-03/idempotency)", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();
  const operationId = "op-lifecycle-005";
  const now = new Date().toISOString();

  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId,
    occurredAt: now,
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  const eventPayload = {
    sequence: 1,
    occurredAt: now,
    kind: "started" as const,
    toolId: "mcp:context7" as const,
    reviewedRelease: mockReviewedRelease,
  };

  // First append
  const r1 = await appendReleaseLifecycleEvent(plan, eventPayload);
  assert.equal(r1.idempotent, false);

  // Exact retry: returns idempotent: true
  const r2 = await appendReleaseLifecycleEvent(plan, eventPayload);
  assert.equal(r2.idempotent, true);
  assert.equal(r2.event.sequence, 1);

  // Conflicting retry with drifted content: must throw drift error
  await assert.rejects(
    async () => {
      await appendReleaseLifecycleEvent(plan, {
        ...eventPayload,
        pendingReason: "drifted content injected at sequence 1",
      });
    },
    /Lifecycle event drift: event sequence 1 already exists with different content/,
  );
});

test("Task 42-02-02 Test 2: out-of-order sequence is rejected before write", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();
  const operationId = "op-lifecycle-006";

  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId,
    occurredAt: new Date().toISOString(),
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  // Attempting to write sequence 2 before sequence 1
  await assert.rejects(
    async () => {
      await appendReleaseLifecycleEvent(plan, {
        sequence: 2,
        occurredAt: new Date().toISOString(),
        kind: "started",
        toolId: "mcp:context7",
        reviewedRelease: mockReviewedRelease,
      });
    },
    /Lifecycle event sequence out of order: expected 1, got 2/,
  );
});

test("Task 42-02-02 Test 3: deriveProtectedReleaseArtifacts collects active, last-good, pending and artifact refs (D-14)", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();
  const operationId = "op-lifecycle-007";
  const now = new Date().toISOString();

  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId,
    occurredAt: now,
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: now,
    kind: "started",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
    activeIdentity: {
      installationId: "context7-4.0.4",
      version: "4.0.4",
      pathAlias: "context7",
    },
    lastGoodIdentity: {
      installationId: "context7-3.9.0",
      version: "3.9.0",
    },
    artifactRefs: ["/staging/context7-backup.tgz"],
  });

  const protectedArtifacts = await deriveProtectedReleaseArtifacts({ stateRoot });

  assert.ok(protectedArtifacts.includes("context7-mcp-4.5.0.tgz"));
  assert.ok(protectedArtifacts.includes("/staging/context7-backup.tgz"));
  assert.ok(protectedArtifacts.includes("mcp:context7@4.0.4"));
  assert.ok(protectedArtifacts.includes("mcp:context7@3.9.0"));
});

test("Task 42-02-02 Test 4: cancellation terminal event preserves history and duplicate cancel is idempotent (D-15)", async (context) => {
  const stateRoot = await createTempState(context);
  const pkgRoot = packageRoot();
  const operationId = "op-lifecycle-008";
  const now = new Date().toISOString();

  const plan = await planReleaseLifecycleOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId,
    occurredAt: now,
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: now,
    kind: "started",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });

  // Cancel event
  const c1 = await appendReleaseLifecycleEvent(plan, {
    sequence: 2,
    occurredAt: new Date().toISOString(),
    kind: "cancelled",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
    pendingReason: "Cancelled by user instruction",
  });
  assert.equal(c1.event.kind, "cancelled");

  // Duplicate cancel is idempotent
  const c2 = await appendReleaseLifecycleEvent(plan, {
    sequence: 3,
    occurredAt: new Date().toISOString(),
    kind: "cancelled",
    toolId: "mcp:context7",
    reviewedRelease: mockReviewedRelease,
  });
  assert.equal(c2.idempotent, true);

  // Illegal transition after terminal cancellation
  await assert.rejects(
    async () => {
      await appendReleaseLifecycleEvent(plan, {
        sequence: 3,
        occurredAt: new Date().toISOString(),
        kind: "activated",
        toolId: "mcp:context7",
        reviewedRelease: mockReviewedRelease,
      });
    },
    /Illegal lifecycle transition: operation op-lifecycle-008 is already in terminal state 'cancelled'/,
  );

  // History is intact
  const lifecycle = await readReleaseLifecycle({ stateRoot, operationId });
  assert.ok(lifecycle);
  assert.equal(lifecycle.status, "cancelled");
  assert.equal(lifecycle.events.length, 2);
});
