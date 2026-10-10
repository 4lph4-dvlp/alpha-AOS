import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import Ajv2020Module from "ajv/dist/2020.js";
import { packageRoot } from "../src/core/paths.js";
import {
  acquireControllerLease,
  ControllerLockConflictError,
  type ControllerLockRecord,
} from "../src/core/controller-lease.js";
import {
  approveTaskContract,
  previewTaskContract,
} from "../src/core/task-contract.js";
import {
  requestTaskStop,
  readTaskStopState,
  recordTaskStopConfirmation,
} from "../src/core/task-control.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as
  typeof import("ajv/dist/2020.js").default;

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-lease-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("acquireControllerLease creates atomic controller.lock matching schema (ROL-03, D-08)", async (context) => {
  const projectRoot = await scratch(context, "create");
  const lease = await acquireControllerLease({
    projectRoot,
    harness: "codex",
    contractDigest: "abcdef1234567890",
  });

  const lockPath = join(projectRoot, ".alpha-aos", "controller.lock");
  const text = await readFile(lockPath, "utf8");
  const record = JSON.parse(text) as ControllerLockRecord;

  assert.equal(record.schemaVersion, 1);
  assert.equal(record.harness, "codex");
  assert.equal(record.pid, process.pid);
  assert.equal(record.host, hostname());
  assert.equal(record.contractDigest, "abcdef1234567890");
  assert.equal(record.token, lease.token);

  // Validate with Ajv against schemas/controller-lock.schema.json
  const schemaPath = join(packageRoot(), "schemas", "controller-lock.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;
  const ajv = new Ajv2020({ strict: true });
  const validate = ajv.compile(schema);
  assert.equal(validate(record), true);

  await lease.release();
});

test("second controller acquisition immediately fails fast with LOCKED_PROJECT_CONTROLLER (ROL-03, D-05)", async (context) => {
  const projectRoot = await scratch(context, "conflict");
  const lease = await acquireControllerLease({
    projectRoot,
    harness: "claude",
    contractDigest: "digest-1111",
  });

  await assert.rejects(
    async () => {
      await acquireControllerLease({
        projectRoot,
        harness: "hermes",
        contractDigest: "digest-2222",
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ControllerLockConflictError);
      assert.equal(err.code, "LOCKED_PROJECT_CONTROLLER");
      assert.equal(err.activeController.harness, "claude");
      assert.equal(err.activeController.pid, process.pid);
      assert.equal(err.activeController.contractDigest, "digest-1111");
      assert.match(err.message, /LOCKED_PROJECT_CONTROLLER/);
      assert.match(err.message, /Cannot run two controllers simultaneously/);
      return true;
    },
  );

  // Releasing frees the lock for another controller
  await lease.release();

  const secondLease = await acquireControllerLease({
    projectRoot,
    harness: "hermes",
    contractDigest: "digest-2222",
  });
  assert.equal(secondLease.record.harness, "hermes");
  await secondLease.release();
});

test("zombie lock from dead process is safely auto-reclaimed with audit log (ROL-03, D-06)", async (context) => {
  const projectRoot = await scratch(context, "zombie");
  const lockDir = join(projectRoot, ".alpha-aos");
  await mkdir(lockDir, { recursive: true });
  const lockPath = join(lockDir, "controller.lock");
  const auditPath = join(lockDir, "controller-lease-audit.jsonl");

  // Write a fake lock file with a non-existent dead PID
  const deadPid = 99999999;
  const staleRecord = {
    schemaVersion: 1,
    harness: "codex",
    token: "00000000-0000-0000-0000-000000000001",
    pid: deadPid,
    host: hostname(),
    startedAt: "2026-01-01T00:00:00.000Z",
    contractDigest: "old-digest-9999",
  };
  await writeFile(lockPath, JSON.stringify(staleRecord, null, 2), "utf8");

  // acquireControllerLease should detect that PID 99999999 is dead and auto-reclaim
  const lease = await acquireControllerLease({
    projectRoot,
    harness: "pi",
    contractDigest: "new-digest-8888",
  });

  assert.equal(lease.record.harness, "pi");
  assert.equal(lease.record.pid, process.pid);

  // Check audit log
  const auditContent = await readFile(auditPath, "utf8");
  const auditEntries = auditContent.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].reason, "stale-process-dead");
  assert.equal(auditEntries[0].previous.pid, deadPid);
  assert.equal(auditEntries[0].reclaimedBy.harness, "pi");
  assert.equal(auditEntries[0].reclaimedBy.pid, process.pid);

  await lease.release();
});

test("startTask acquires project controller lease and releases on completion (ROL-03, D-05)", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  const approval = await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: preview.digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(approval.status, "approved");

  // Start the task: during execution it holds controller.lock, and on completion releases it
  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: preview.digest,
  });
  assert.equal(run.status, "accepted");

  // After task completion, controller.lock must be released
  const lockPath = join(fixture.projectRoot, ".alpha-aos", "controller.lock");
  const text = await readFile(lockPath, "utf8").catch(() => null);
  assert.equal(text, null, "controller.lock should be deleted on task completion");

  // A new controller lease can be acquired immediately on the project
  const newLease = await acquireControllerLease({
    projectRoot: fixture.projectRoot,
    harness: "codex",
    contractDigest: preview.digest,
  });
  assert.ok(newLease.token);
  await newLease.release();
});

test("requestTaskStop fences against foreign controller lease and reports pending for live process (D-12, UX-02, T-21-07)", async (context) => {
  const fixture = await createTaskFixture(context);
  const lease = await acquireControllerLease({
    projectRoot: fixture.projectRoot,
    harness: "codex",
    contractDigest: "digest-matching-task",
  });

  try {
    // 1. Stop request targeting a foreign digest does not target this live controller
    const foreignStop = await requestTaskStop({
      stateRoot: fixture.stateRoot,
      contractId: "other-task",
      contractDigest: "foreign-digest",
      projectRoot: fixture.projectRoot,
      reason: "test_foreign_stop",
    });
    // Controller PID must be null because lease digest does not match foreign digest
    assert.equal(foreignStop.controllerPid, null);

    // 2. Stop request targeting matching digest attaches controllerPid and reports pending (since process is alive)
    const matchingStop = await requestTaskStop({
      stateRoot: fixture.stateRoot,
      contractId: "inventory-summary",
      contractDigest: "digest-matching-task",
      projectRoot: fixture.projectRoot,
      reason: "test_matching_stop",
    });
    assert.equal(matchingStop.controllerPid, process.pid);
    assert.equal(matchingStop.status, "pending");

    // 3. readTaskStopState also confirms pending, not confirmed/stopped (D-12)
    const stopState = await readTaskStopState({
      stateRoot: fixture.stateRoot,
      contractId: "inventory-summary",
      contractDigest: "digest-matching-task",
      projectRoot: fixture.projectRoot,
    });
    assert.equal(stopState.status, "pending");
    assert.equal(stopState.controllerPid, process.pid);
    assert.ok(stopState.nextAction.includes("Waiting for child process"));

    // 4. Once confirmation is explicitly recorded, state transitions to confirmed
    await recordTaskStopConfirmation({
      stateRoot: fixture.stateRoot,
      contractId: "inventory-summary",
      runId: matchingStop.runId,
      contractDigest: "digest-matching-task",
      terminationEvidence: "test-verified-termination",
    });
    const confirmedState = await readTaskStopState({
      stateRoot: fixture.stateRoot,
      contractId: "inventory-summary",
      contractDigest: "digest-matching-task",
      projectRoot: fixture.projectRoot,
    });
    assert.equal(confirmedState.status, "confirmed");
    assert.equal(confirmedState.terminationEvidence, "test-verified-termination");
  } finally {
    await lease.release();
  }
});
