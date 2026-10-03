import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createFreshSessionCapabilityPort,
  startFreshCapabilitySession,
} from "../src/adapters/task-agents.js";
import {
  applyProjectPackSync,
  planProjectPackSync,
} from "../src/core/project-pack-sync.js";
import { ComponentPlanError } from "../src/core/component-session.js";
import {
  approveProjectPlan,
  planProjectCapabilities,
} from "../src/core/project-plan.js";
import {
  createCapabilityReceipt,
  verifyRequiredCapabilityReceipts,
} from "../src/core/task-capability-receipts.js";
import type { TaskCapabilityObligation } from "../src/core/task-capability-obligations.js";
import { sha256 } from "./project-pack-sync.test.js";

import { packageRoot as getPackageRoot } from "../src/core/paths.js";

const repositoryRoot = getPackageRoot();

const PACK_ID = "WEB_REACT";
const PACK_SKILL = "frontend-a11y";

interface SessionFixture {
  readonly root: string;
  readonly stateRoot: string;
  readonly packageRoot: string;
  readonly sourceRoot: string;
}

async function createSessionFixture(context: TestContext, label: string): Promise<SessionFixture> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-sess-${label}-`));
  const support = await mkdtemp(join(tmpdir(), `alpha-aos-sess-sup-${label}-`));

  context.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    await rm(support, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "session-test", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );

  const stateRoot = join(support, "state");
  const packageRoot = join(support, "package-root");
  await cp(join(repositoryRoot, "catalog"), join(packageRoot, "catalog"), { recursive: true });
  await cp(join(repositoryRoot, "schemas"), join(packageRoot, "schemas"), { recursive: true });

  const sourceRoot = join(support, "source");
  const sourceBody = `---\nname: ${PACK_SKILL}\n---\n\n# frontend accessibility fixture bytes\n`;
  await mkdir(join(sourceRoot, PACK_SKILL), { recursive: true });
  await writeFile(join(sourceRoot, PACK_SKILL, "SKILL.md"), sourceBody, "utf8");
  const sourceHash = sha256(sourceBody);

  const lockPath = join(packageRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    components: { ecc: { sourceSha256: Record<string, string> } };
  };
  lock.components.ecc.sourceSha256[PACK_SKILL] = sourceHash;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  return { root, stateRoot, packageRoot, sourceRoot };
}

test("D-05: exact approved plan digest required for sync; rejects stale approval on manifest change", async (context) => {
  const fixture = await createSessionFixture(context, "exact-approval");

  // Initial plan and approval
  const initialPlan = await planProjectCapabilities({ path: fixture.root, packageRoot: fixture.packageRoot });
  await approveProjectPlan({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    expectedDigest: initialPlan.planDigest,
  });

  // Manifest changes: add a dependency
  const pkgJsonPath = join(fixture.root, "package.json");
  const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf8"));
  pkgJson.dependencies["vue"] = "^3.0.0";
  await writeFile(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`, "utf8");

  // Attempting to plan/apply sync with the stale approval fails (driftRefusal)
  await assert.rejects(
    planProjectPackSync({
      path: fixture.root,
      packageRoot: fixture.packageRoot,
      stateRoot: fixture.stateRoot,
    }),
    (err: unknown) => {
      assert.ok(err instanceof ComponentPlanError);
      assert.equal(err.code, "plan-drift");
      return true;
    },
  );

  // Re-approving with the exact new digest allows sync to proceed
  const updatedPlan = await planProjectCapabilities({ path: fixture.root, packageRoot: fixture.packageRoot });
  assert.notEqual(updatedPlan.planDigest, initialPlan.planDigest);

  await approveProjectPlan({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    expectedDigest: updatedPlan.planDigest,
  });

  const syncResult = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  assert.equal(syncResult.status, "written");
});

test("D-03: existing session tool reload is explicitly rejected", async () => {
  await assert.rejects(
    startFreshCapabilitySession({
      harness: "claude",
      projectRoot: "/dummy/root",
      previousSessionId: "session-old-123",
      allowExistingSessionReload: true,
    }),
    /Tool reload in existing session does not prove activation in fresh session \(D-03\)/,
  );
});

test("D-03: fresh session creates distinct sessionId and native discovery probe discovers skills and MCP", async () => {
  const previousSessionId = "session-prev-12345";
  const freshSession = await startFreshCapabilitySession({
    harness: "claude",
    projectRoot: "/dummy/root",
    previousSessionId,
    probeDiscovery: (sessionId) => {
      assert.notEqual(sessionId, previousSessionId);
      return {
        skills: ["frontend-a11y", "react-best-practices"],
        mcpTools: ["context7", "exa"],
      };
    },
  });

  assert.notEqual(freshSession.sessionId, previousSessionId);
  assert.equal(freshSession.previousSessionId, previousSessionId);
  assert.equal(freshSession.status, "ok");
  assert.deepEqual(freshSession.discoveredSkills, ["frontend-a11y", "react-best-practices"]);
  assert.deepEqual(freshSession.discoveredMcpTools, ["context7", "exa"]);
});

test("D-03: capability invocation in fresh session records receipt bound to fresh sessionId", async () => {
  const freshSession = await startFreshCapabilitySession({
    harness: "codex",
    projectRoot: "/test/project",
    previousSessionId: "old-session-999",
    probeDiscovery: () => ({
      skills: ["frontend-a11y"],
      mcpTools: ["context7"],
    }),
  });

  const port = createFreshSessionCapabilityPort({
    session: freshSession,
    invoker: async (toolName, question) => ({
      outcome: "ok",
      rawResult: `result for ${toolName}: ${question}`,
      isError: false,
    }),
  });

  const obligation: TaskCapabilityObligation = {
    id: "ob-execute-1",
    capabilityId: "frontend-a11y",
    step: "execute",
    question: "Check accessibility rules for button component",
    required: true,
    scope: "/test/project",
    source: "project-pack",
    version: "project",
  };

  const invocation = await port.invoke({
    runId: "run-session-test",
    step: "execute",
    obligation,
    projectRoot: "/test/project",
  });

  assert.equal(invocation.receipt.outcome, "ok");
  assert.equal(invocation.receipt.sessionId, freshSession.sessionId);
  assert.equal(invocation.receipt.isError, false);

  // Verifying receipt against the fresh sessionId succeeds
  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [invocation.receipt],
    currentRunId: "run-session-test",
    currentStep: "execute",
    currentSessionId: freshSession.sessionId,
  });

  assert.equal(verification.satisfied, true);
  assert.equal(verification.verifiedReceipts.length, 1);
});

test("D-03: undiscovered capability in fresh session records failed receipt and fails verification", async () => {
  const freshSession = await startFreshCapabilitySession({
    harness: "codex",
    projectRoot: "/test/project",
    probeDiscovery: () => ({
      skills: ["frontend-a11y"],
      mcpTools: [],
    }),
  });

  const port = createFreshSessionCapabilityPort({
    session: freshSession,
  });

  const obligation: TaskCapabilityObligation = {
    id: "ob-execute-2",
    capabilityId: "deep-research",
    step: "execute",
    question: "Perform deep research on state machines",
    required: true,
    scope: "/test/project",
    source: "exa",
    version: "stable",
  };

  const invocation = await port.invoke({
    runId: "run-session-test-2",
    step: "execute",
    obligation,
    projectRoot: "/test/project",
  });

  assert.equal(invocation.receipt.outcome, "failed");
  assert.equal(invocation.receipt.isError, true);
  assert.match(invocation.receipt.errorMessage ?? "", /was not discovered in fresh session/);

  // Verification fails because receipt has outcome: failed
  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [invocation.receipt],
    currentRunId: "run-session-test-2",
    currentStep: "execute",
    currentSessionId: freshSession.sessionId,
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.failedReceipts.length, 1);
});

test("D-03: receipt bound to stale session ID is rejected during verification of fresh session", async () => {
  const obligation: TaskCapabilityObligation = {
    id: "ob-execute-3",
    capabilityId: "documentation-lookup",
    step: "execute",
    question: "Look up React 19 documentation",
    required: true,
    scope: "/test/project",
    source: "context7",
    version: "stable",
  };

  // Receipt created in an old session
  const staleReceipt = createCapabilityReceipt({
    runId: "run-session-test-3",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: obligation.id,
    question: obligation.question,
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "claude",
    harnessVersion: "1.0.0",
    harnessExecutable: "claude",
    sessionId: "old-session-stale",
    source: "context7",
    sourceVersion: "stable",
    observationId: "obs-1",
    rawResultSha256: "hash-result",
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  // Verify against a fresh session ID -> rejected!
  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [staleReceipt],
    currentRunId: "run-session-test-3",
    currentStep: "execute",
    currentSessionId: "fresh-session-new",
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.failedReceipts.length, 1);
  assert.equal(verification.failedReceipts[0]?.sessionId, "old-session-stale");
});
