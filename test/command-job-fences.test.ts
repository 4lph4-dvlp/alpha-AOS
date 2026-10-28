import { realpathSync as canonicalFixturePath } from "node:fs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { assertJobIdentityMatch, cancelCommandJob, cancelRequestPath, createJobRecord, jobRecordPath, readJobRecord, updateJobRecord, waitCommandJob, type CommandJobRecord } from "../src/core/command-jobs.js";

async function fixture() {
  const root = await mkdtemp(join(canonicalFixturePath(tmpdir()), "alpha-job-fences-"));
  const record: CommandJobRecord = {
    schemaVersion: 1, kind: "command-job", jobId: "job-0123456789abcdef", ownerToken: "storage-owner",
    specDigest: "d".repeat(64), status: "pending", createdAt: new Date().toISOString(),
    startedAt: null, acknowledgedAt: null, finishedAt: null, stateRevision: 0,
    cwd: root, command: basename(process.execPath), deadlineMs: 10000,
    workerPid: null, workerHost: null, childPid: null, exitCode: null, signal: null,
    cancelRequested: false, cancelRequestedAt: null, cancelDelivered: null, cancelConfirmedAt: null,
    durationMs: null, output: null, error: null,
  };
  await createJobRecord(root, record);
  return { root, record, cleanup: () => rm(root, { recursive: true, force: true }) };
}
const fence = (r: CommandJobRecord) => ({ jobId: r.jobId, ownerToken: r.ownerToken, specDigest: r.specDigest, stateRevision: r.stateRevision });

test("job-fences: storage updater cannot mutate its baseline, revision, or frozen nested facts", async () => {
  const f = await fixture();
  try {
    const before = await readFile(jobRecordPath(f.root, f.record.jobId));
    await assert.rejects(updateJobRecord(f.root, fence(f.record), (current) => {
      Object.assign(current, { ownerToken: "replacement", stateRevision: 100 });
      return { status: "pending" };
    }), TypeError);
    assert.deepEqual(await readFile(jobRecordPath(f.root, f.record.jobId)), before);
    await assert.rejects(updateJobRecord(f.root, fence(f.record), { stateRevision: 100 }), /REVISION_REGRESSION/);
    const withOutput = await updateJobRecord(f.root, fence(f.record), { output: { stdout: "before", stderr: "", combined: "before", truncated: false, totalBytes: 6 } });
    const nestedBefore = await readFile(jobRecordPath(f.root, f.record.jobId));
    await assert.rejects(updateJobRecord(f.root, fence(withOutput), (current) => {
      Object.assign(current.output!, { stdout: "tampered" });
      return {};
    }), TypeError);
    assert.deepEqual(await readFile(jobRecordPath(f.root, f.record.jobId)), nestedBefore);
  } finally { await f.cleanup(); }
});

test("job-fences: storage running claim cannot be cleared or reassigned by null patches", async () => {
  const f = await fixture();
  try {
    const now = new Date().toISOString();
    const running = await updateJobRecord(f.root, fence(f.record), { status: "running", startedAt: now, acknowledgedAt: now, workerPid: process.pid, workerHost: hostname(), childPid: process.pid });
    const before = await readFile(jobRecordPath(f.root, f.record.jobId));
    for (const key of ["workerPid", "workerHost", "childPid", "startedAt", "acknowledgedAt"] as const) {
      await assert.rejects(updateJobRecord(f.root, fence(running), { [key]: null }), /CLAIM_DRIFT/);
      assert.deepEqual(await readFile(jobRecordPath(f.root, f.record.jobId)), before);
    }
  } finally { await f.cleanup(); }
});

test("job-fences: exact identity comparator and terminal wait reject every seeded metadata and claim drift", async () => {
  const f = await fixture();
  try {
    const now = new Date().toISOString();
    const running = await updateJobRecord(f.root, fence(f.record), { status: "running", startedAt: now, acknowledgedAt: now, workerPid: process.pid, workerHost: hostname(), childPid: process.pid });
    const terminal = await updateJobRecord(f.root, fence(running), { status: "completed", finishedAt: now, exitCode: 0, durationMs: 0 });
    for (const change of [{ createdAt: "2000-01-01T00:00:00.000Z" }, { cwd: join(f.root, "other") }, { command: "other" }, { deadlineMs: 9999 }, { minRevision: terminal.stateRevision + 1 }, { workerPid: process.pid + 1 }, { workerHost: "other-host" }, { childPid: process.pid + 1 }, { startedAt: "2000-01-01T00:00:00.000Z" }, { acknowledgedAt: "2000-01-01T00:00:00.000Z" }]) {
      const expected = { ...terminal, minRevision: terminal.stateRevision, ...change };
      assert.throws(() => assertJobIdentityMatch(terminal, expected));
      const result = await waitCommandJob({ stateRoot: f.root, jobId: terminal.jobId, expectedIdentity: expected, timeoutMs: 1000 });
      assert.equal(result.status, "unresolved");
    }
  } finally { await f.cleanup(); }
});

test("job-fences: invalid cancel deadline refuses before creating any cancel marker", async () => {
  const f = await fixture();
  try {
    for (const timeoutMs of [0, NaN, Infinity, -1, 86400001]) {
      await assert.rejects(cancelCommandJob({ stateRoot: f.root, jobId: f.record.jobId, timeoutMs }), /timeoutMs/);
      assert.equal(existsSync(cancelRequestPath(f.root, f.record.jobId)), false);
    }
    assert.equal((await readJobRecord(f.root, f.record.jobId)).stateRevision, 0);
  } finally { await f.cleanup(); }
});
