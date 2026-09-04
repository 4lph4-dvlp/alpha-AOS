// Contract for SAFE-03 (D-04 through D-07).
//
// One writer owns a managed state root. A competitor fails immediately with
// diagnostic fields instead of waiting or clearing the lock. An interruption
// at any durable boundary leaves the target hash-diagnosable as before, after,
// or neither, and only an explicit repair may move it.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { applyFileTransaction, type TransactionFailpoint } from "../src/core/transaction.js";
import {
  acquireMutationSession,
  applyWriterRepair,
  inspectWriterState,
  planWriterRepair,
  WriterConflictError,
  writerLockPath,
} from "../src/core/writer-lock.js";
import { proveOperationPaths } from "../src/core/path-boundary.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const transactionModule = pathToFileURL(join(repositoryRoot, "dist", "src", "core", "transaction.js")).href;
const writerLockModule = pathToFileURL(join(repositoryRoot, "dist", "src", "core", "writer-lock.js")).href;
const pathBoundaryModule = pathToFileURL(join(repositoryRoot, "dist", "src", "core", "path-boundary.js")).href;

const BEFORE_BYTES = "before\n";
const AFTER_BYTES = "after\n";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Every durable boundary a managed write crosses. */
const FAILPOINTS: readonly TransactionFailpoint[] = [
  "after-snapshot-sync",
  "after-intent-journal-sync",
  "after-target-rename",
  "after-step-sync",
  "after-final-sync",
];

interface CrashFixture {
  readonly root: string;
  readonly targetRoot: string;
  readonly stateRoot: string;
  readonly target: string;
  readonly childScript: string;
}

/**
 * Writes a child driver into the OS temp directory. The child performs one
 * managed write and honours `ALPHA_AOS_FAILPOINT` by dying at that boundary.
 */
async function createCrashFixture(context: { after: (fn: () => Promise<unknown> | unknown) => void }): Promise<CrashFixture> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-crash-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  await mkdir(targetRoot, { recursive: true });
  const target = join(targetRoot, "managed.txt");
  await writeFile(target, BEFORE_BYTES, "utf8");

  const childScript = join(root, "writer-child.mjs");
  await writeFile(
    childScript,
    [
      `import { applyFileTransaction } from ${JSON.stringify(transactionModule)};`,
      `import { acquireMutationSession } from ${JSON.stringify(writerLockModule)};`,
      `import { proveOperationPaths } from ${JSON.stringify(pathBoundaryModule)};`,
      "import { join } from 'node:path';",
      "const [stateRoot, allowedRoot, target, content] = process.argv.slice(2);",
      "const hold = process.env.ALPHA_AOS_HOLD_MS ? Number(process.env.ALPHA_AOS_HOLD_MS) : 0;",
      "try {",
      "  let session;",
      "  if (hold > 0) {",
      // Hold the session itself open, otherwise the lock is released the
      // moment the transaction finishes and there is nothing to contend with.
      "    const proofs = await proveOperationPaths({",
      "      inputs: [",
      "        { role: 'target', path: target },",
      "        { role: 'state', path: stateRoot },",
      "        { role: 'journal', path: join(stateRoot, 'journal') },",
      "        { role: 'snapshot', path: join(stateRoot, 'snapshots') },",
      "      ],",
      "      allowedRoots: [allowedRoot, stateRoot],",
      "      requiredRoles: ['target', 'state', 'journal', 'snapshot'],",
      "    });",
      "    session = await acquireMutationSession({ stateRoot, proofs, planDigest: 'hold' });",
      "  }",
      "  const journal = await applyFileTransaction({",
      "    stateRoot,",
      "    allowedRoots: [allowedRoot],",
      "    operations: [{ target, content }],",
      "    ...(session ? { session } : {}),",
      "  });",
      "  process.stdout.write(JSON.stringify({ ok: true, id: journal.id, status: journal.status }));",
      "  if (hold > 0) await new Promise((r) => setTimeout(r, hold));",
      "  if (session) await session.close();",
      "} catch (error) {",
      "  process.stdout.write(JSON.stringify({ ok: false, name: error?.name, code: error?.code, message: String(error?.message) }));",
      "  process.exitCode = 1;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  return { root, targetRoot, stateRoot, target, childScript };
}

function runChild(
  fixture: CrashFixture,
  content: string,
  env: NodeJS.ProcessEnv = {},
  overrides: Partial<Pick<CrashFixture, "stateRoot" | "targetRoot" | "target">> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [
      fixture.childScript,
      overrides.stateRoot ?? fixture.stateRoot,
      overrides.targetRoot ?? fixture.targetRoot,
      overrides.target ?? fixture.target,
      content,
    ],
    { encoding: "utf8", timeout: 60_000, windowsHide: true, env: { ...process.env, ...env } },
  );
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

async function readJournals(stateRoot: string): Promise<Array<Record<string, unknown>>> {
  const journalRoot = join(stateRoot, "journal");
  if (!existsSync(journalRoot)) return [];
  const journals: Array<Record<string, unknown>> = [];
  for (const name of (await readdir(journalRoot)).filter((entry) => entry.endsWith(".json")).sort()) {
    const raw = await readFile(join(journalRoot, name), "utf8").catch(() => "");
    try {
      journals.push(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      journals.push({ corrupt: true, name });
    }
  }
  return journals;
}

test("a second writer fails immediately instead of waiting or clearing the lock", async (context) => {
  const fixture = await createCrashFixture(context);

  // First writer holds the state root open.
  const holder = spawn(
    process.execPath,
    [fixture.childScript, fixture.stateRoot, fixture.targetRoot, fixture.target, AFTER_BYTES],
    { env: { ...process.env, ALPHA_AOS_HOLD_MS: "5000" }, stdio: "ignore", windowsHide: true },
  );
  context.after(() => holder.kill("SIGKILL"));
  await new Promise((resolveWait) => setTimeout(resolveWait, 400));

  const lockPath = writerLockPath(fixture.stateRoot);
  assert.equal(existsSync(lockPath), true, "the holder must have taken the lock before the competitor runs");

  const startedAt = Date.now();
  const competitor = runChild(fixture, "competitor\n");
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed < 3000, `the competing writer waited ${elapsed}ms instead of failing fast`);
  assert.notEqual(competitor.status, 0, "a competing writer must not succeed while another writer holds the state root");

  const diagnostics = `${competitor.stdout}${competitor.stderr}`.toLowerCase();
  for (const field of ["operationid", "startedat", "pid", "retry"]) {
    assert.ok(
      diagnostics.includes(field),
      `the refusal must name the active ${field} so the user can diagnose the contention; got: ${diagnostics.slice(0, 300)}`,
    );
  }
  assert.equal(existsSync(lockPath), true, "the competitor must not remove the lock it lost to");
});

test("a reader can inspect writer state while a writer holds the lock", async (context) => {
  const fixture = await createCrashFixture(context);
  await mkdir(fixture.stateRoot, { recursive: true });

  const proofs = await proveOperationPaths({
    inputs: [
      { role: "target", path: fixture.target },
      { role: "state", path: fixture.stateRoot },
      { role: "journal", path: join(fixture.stateRoot, "journal") },
      { role: "snapshot", path: join(fixture.stateRoot, "snapshots") },
    ],
    allowedRoots: [fixture.root],
    requiredRoles: ["target", "state", "journal", "snapshot"],
  });
  const session = await acquireMutationSession({ stateRoot: fixture.stateRoot, proofs, planDigest: "test" });
  context.after(async () => session.close());

  // Reading never acquires or mutates.
  const state = await inspectWriterState(fixture.stateRoot);
  assert.equal(state.status, "active");
  assert.equal(state.record?.pid, process.pid);
  assert.equal(state.record?.host, hostname());
  assert.equal(Object.hasOwn(state.record ?? {}, "token"), false, "the ownership token must not be handed to a reader");

  // A competitor in this process is refused with the same typed error.
  await assert.rejects(
    () => acquireMutationSession({ stateRoot: fixture.stateRoot, proofs, planDigest: "other" }),
    (error: unknown) => {
      assert.ok(error instanceof WriterConflictError);
      assert.equal(error.code, "ACTIVE_WRITER");
      return true;
    },
  );
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), true);
});

test("a writer lock is never removed on the basis of elapsed time or a missing pid", async (context) => {
  const fixture = await createCrashFixture(context);
  await mkdir(fixture.stateRoot, { recursive: true });

  // A lock whose owning process is long gone and whose timestamp is ancient.
  const lockPath = writerLockPath(fixture.stateRoot);
  await writeFile(
    lockPath,
    `${JSON.stringify({
      schemaVersion: 1,
      operationId: "abandoned-operation",
      token: "abandoned-token",
      pid: 999_999_999,
      host: hostname(),
      startedAt: "2000-01-01T00:00:00.000Z",
      journalPath: join(fixture.stateRoot, "journal", "abandoned-operation.json"),
      planDigest: "abandoned",
    })}\n`,
    "utf8",
  );

  const state = await inspectWriterState(fixture.stateRoot);
  assert.equal(state.status, "needs-repair", "an abandoned-looking lock is needs-repair, never free");
  assert.equal(existsSync(lockPath), true, "diagnosis must not delete the lock");

  const result = runChild(fixture, AFTER_BYTES);
  assert.ok(existsSync(lockPath), "an abandoned-looking lock must not be deleted automatically");
  assert.notEqual(result.status, 0, "an abandoned-looking lock must block the write until an explicit repair");
  assert.ok(
    `${result.stdout}${result.stderr}`.toLowerCase().includes("repair"),
    "the refusal must point at the explicit repair path rather than silently recovering",
  );
  assert.equal(await readFile(fixture.target, "utf8"), BEFORE_BYTES, "the target must be untouched");
});

test("every durable boundary leaves the target diagnosable as before, after, or neither", async (context) => {
  const fixture = await createCrashFixture(context);
  const beforeHash = sha256(BEFORE_BYTES);
  const afterHash = sha256(AFTER_BYTES);

  for (const failpoint of FAILPOINTS) {
    const caseRoot = join(fixture.root, failpoint);
    const caseTargetRoot = join(caseRoot, "target");
    const caseStateRoot = join(caseRoot, "state");
    await mkdir(caseTargetRoot, { recursive: true });
    const caseTarget = join(caseTargetRoot, "managed.txt");
    await writeFile(caseTarget, BEFORE_BYTES, "utf8");

    const result = runChild(
      fixture,
      AFTER_BYTES,
      { ALPHA_AOS_FAILPOINT: failpoint },
      { stateRoot: caseStateRoot, targetRoot: caseTargetRoot, target: caseTarget },
    );

    assert.notEqual(
      result.status,
      0,
      `failpoint \`${failpoint}\` was not honoured: the writer ran to completion, so this boundary is untested`,
    );

    const current = existsSync(caseTarget) ? sha256(await readFile(caseTarget)) : null;
    assert.ok(
      current === beforeHash || current === afterHash,
      `failpoint \`${failpoint}\` left the target in an undiagnosable state`,
    );

    const journals = await readJournals(caseStateRoot);
    assert.ok(
      journals.length > 0,
      `failpoint \`${failpoint}\` left no journal evidence, so the real operation state cannot be reported`,
    );
    const journal = journals[0];
    assert.ok(journal !== undefined && typeof journal.status === "string", "journal evidence must carry a status");

    // The lock survives the interruption, so the root is not silently reusable.
    const state = await inspectWriterState(caseStateRoot);
    assert.equal(state.status, "needs-repair", `failpoint \`${failpoint}\` left the state root claiming to be ${state.status}`);
  }
});

test("repair diagnosis is read-only and its plan digest is stable", async (context) => {
  const fixture = await createCrashFixture(context);
  runChild(fixture, AFTER_BYTES, { ALPHA_AOS_FAILPOINT: "after-target-rename" });

  async function digest(root: string): Promise<string> {
    if (!existsSync(root)) return "absent";
    const parts: string[] = [];
    async function walk(current: string): Promise<void> {
      for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const absolute = join(current, entry.name);
        if (entry.isDirectory()) await walk(absolute);
        else if (entry.isFile()) parts.push(`${absolute}:${sha256(await readFile(absolute))}`);
      }
    }
    await walk(root);
    return sha256(parts.join("\n"));
  }

  const beforeState = await digest(fixture.stateRoot);
  const beforeTarget = await digest(fixture.targetRoot);

  const first = await planWriterRepair(fixture.stateRoot);
  const second = await planWriterRepair(fixture.stateRoot);

  assert.equal(second.planDigest, first.planDigest, "the plan digest must be stable across repeated diagnosis");
  assert.equal(await digest(fixture.stateRoot), beforeState, "diagnosis mutated the state root");
  assert.equal(await digest(fixture.targetRoot), beforeTarget, "diagnosis mutated the target root");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), true, "diagnosis must not release the lock");

  // The CLI's diagnostic surfaces are equally non-mutating.
  const env = { ...process.env, ALPHA_AOS_STATE_DIR: fixture.stateRoot, NO_COLOR: "1" };
  for (const args of [["status"], ["status", "--json"], ["rollback"], ["rollback", "--json"]]) {
    spawnSync(process.execPath, [cliEntry, ...args], { encoding: "utf8", timeout: 60_000, windowsHide: true, env });
  }
  assert.equal(await digest(fixture.stateRoot), beforeState, "a CLI diagnosis mutated the state root");
  assert.equal(await digest(fixture.targetRoot), beforeTarget, "a CLI diagnosis mutated the target root");
});

test("an explicit repair finalizes a fully proven interruption", async (context) => {
  const fixture = await createCrashFixture(context);
  // Interrupted after the target was written and after the step was synced, so
  // every target hash matches the recorded after value.
  runChild(fixture, AFTER_BYTES, { ALPHA_AOS_FAILPOINT: "after-final-sync" });

  const plan = await planWriterRepair(fixture.stateRoot);
  assert.equal(plan.status, "needs-repair");
  assert.deepEqual(plan.targets.map((entry) => entry.classification), ["after"]);
  assert.equal(plan.transition, "finalize-applied");
  assert.deepEqual(plan.blockedReasons, []);

  // A stale digest is refused rather than acted on.
  await assert.rejects(() => applyWriterRepair(fixture.stateRoot, "not-the-reviewed-digest"), /reviewed/u);
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), true, "a refused apply must leave the lock in place");

  const applied = await applyWriterRepair(fixture.stateRoot, plan.planDigest);
  assert.equal(applied.transition, "finalize-applied");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "a proven repair releases the lock");
  assert.equal(await readFile(fixture.target, "utf8"), AFTER_BYTES, "a finalized repair keeps the applied bytes");

  const journals = await readJournals(fixture.stateRoot);
  assert.equal(journals[0]?.status, "applied");

  // The root is usable again.
  const state = await inspectWriterState(fixture.stateRoot);
  assert.equal(state.status, "free");
});

test("a neither-hash target blocks repair and keeps its drift", async (context) => {
  const fixture = await createCrashFixture(context);
  runChild(fixture, AFTER_BYTES, { ALPHA_AOS_FAILPOINT: "after-final-sync" });

  // A third party edits the target after the interruption.
  const driftBytes = "neither before nor after\n";
  await writeFile(fixture.target, driftBytes, "utf8");

  const plan = await planWriterRepair(fixture.stateRoot);
  assert.deepEqual(plan.targets.map((entry) => entry.classification), ["neither"]);
  assert.equal(plan.transition, "none", "a drifted target has no proven transition");
  assert.ok(
    plan.blockedReasons.some((reason) => reason.includes("neither")),
    `the refusal must name the drift; got ${JSON.stringify(plan.blockedReasons)}`,
  );

  await assert.rejects(() => applyWriterRepair(fixture.stateRoot, plan.planDigest), /cannot be repaired automatically/u);
  assert.equal(await readFile(fixture.target, "utf8"), driftBytes, "drift was overwritten by a repair");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), true, "a blocked repair must leave the lock in place");
});

test("an interruption before the target was touched restores to the before state", async (context) => {
  const fixture = await createCrashFixture(context);
  runChild(fixture, AFTER_BYTES, { ALPHA_AOS_FAILPOINT: "after-intent-journal-sync" });

  assert.equal(await readFile(fixture.target, "utf8"), BEFORE_BYTES, "the target must still hold its original bytes");

  const plan = await planWriterRepair(fixture.stateRoot);
  assert.deepEqual(plan.targets.map((entry) => entry.classification), ["before"]);
  assert.equal(plan.transition, "restore-before");

  const applied = await applyWriterRepair(fixture.stateRoot, plan.planDigest);
  assert.equal(applied.transition, "restore-before");
  assert.equal(await readFile(fixture.target, "utf8"), BEFORE_BYTES);
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);

  const journals = await readJournals(fixture.stateRoot);
  assert.equal(journals[0]?.status, "failed");
});

test("an interruption with no journal evidence refuses rather than guessing", async (context) => {
  const fixture = await createCrashFixture(context);
  await mkdir(fixture.stateRoot, { recursive: true });

  // A durable lock with no matching journal: nothing about the operation can
  // be proven, so no transition is permitted.
  await writeFile(
    writerLockPath(fixture.stateRoot),
    `${JSON.stringify({
      schemaVersion: 1,
      operationId: "orphan",
      token: "orphan-token",
      pid: 999_999_999,
      host: hostname(),
      startedAt: "2000-01-01T00:00:00.000Z",
      journalPath: join(fixture.stateRoot, "journal", "orphan.json"),
      planDigest: "orphan",
    })}\n`,
    "utf8",
  );

  const plan = await planWriterRepair(fixture.stateRoot);
  assert.equal(plan.transition, "none");
  assert.ok(plan.blockedReasons.some((reason) => reason.includes("journal")));
  await assert.rejects(() => applyWriterRepair(fixture.stateRoot, plan.planDigest), /cannot be repaired automatically/u);
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), true);
});

test("an in-process transaction serializes against a held session", async (context) => {
  const fixture = await createCrashFixture(context);

  const holder = spawn(
    process.execPath,
    [fixture.childScript, fixture.stateRoot, fixture.targetRoot, fixture.target, AFTER_BYTES],
    { env: { ...process.env, ALPHA_AOS_HOLD_MS: "4000" }, stdio: "ignore", windowsHide: true },
  );
  context.after(() => holder.kill("SIGKILL"));
  await new Promise((resolveWait) => setTimeout(resolveWait, 400));

  await assert.rejects(
    () =>
      applyFileTransaction({
        stateRoot: fixture.stateRoot,
        allowedRoots: [fixture.targetRoot],
        operations: [{ target: join(fixture.targetRoot, "other.txt"), content: "concurrent\n" }],
      }),
    (error: unknown) => {
      assert.ok(error instanceof WriterConflictError, `expected a writer conflict, got ${String(error)}`);
      return true;
    },
  );
  assert.equal(existsSync(join(fixture.targetRoot, "other.txt")), false, "a refused transaction must write nothing");
});
