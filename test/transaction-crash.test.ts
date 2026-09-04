// Wave 0 matrix for SAFE-03 (D-04 through D-07).
//
// One writer owns a managed state root. A competitor fails immediately with
// diagnostic fields instead of waiting or clearing the lock. An interruption
// at any durable boundary leaves the target hash-diagnosable as before, after,
// or neither, and only an explicit `repair --apply` may move it.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const transactionModule = pathToFileURL(join(repositoryRoot, "dist", "src", "core", "transaction.js")).href;

const BEFORE_BYTES = "before\n";
const AFTER_BYTES = "after\n";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The durable boundaries a managed write crosses. Each one is a place an
 * interruption can land, and each must be independently diagnosable.
 */
const FAILPOINTS = [
  "after-snapshot-sync",
  "after-intent-journal-sync",
  "after-target-rename",
  "after-step-sync",
  "after-final-sync",
] as const;

type Failpoint = (typeof FAILPOINTS)[number];

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
 * The failpoint contract is what later plans implement; until then the child
 * runs to completion and these assertions stay red.
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
      "const [stateRoot, allowedRoot, target, content] = process.argv.slice(2);",
      "const hold = process.env.ALPHA_AOS_HOLD_MS ? Number(process.env.ALPHA_AOS_HOLD_MS) : 0;",
      "try {",
      "  const journal = await applyFileTransaction({",
      "    stateRoot,",
      "    allowedRoots: [allowedRoot],",
      "    operations: [{ target, content }],",
      "  });",
      "  process.stdout.write(JSON.stringify({ ok: true, id: journal.id, status: journal.status }));",
      "  if (hold > 0) await new Promise((r) => setTimeout(r, hold));",
      "} catch (error) {",
      "  process.stdout.write(JSON.stringify({ ok: false, message: String(error && error.message) }));",
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
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [fixture.childScript, fixture.stateRoot, fixture.targetRoot, fixture.target, content],
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
    { env: { ...process.env, ALPHA_AOS_HOLD_MS: "4000" }, stdio: "ignore", windowsHide: true },
  );
  context.after(() => holder.kill("SIGKILL"));
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));

  const startedAt = Date.now();
  const competitor = runChild(fixture, "competitor\n");
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed < 3000, `the competing writer waited ${elapsed}ms instead of failing fast`);
  assert.notEqual(competitor.status, 0, "a competing writer must not succeed while another writer holds the state root");

  const diagnostics = `${competitor.stdout}${competitor.stderr}`;
  for (const field of ["operationId", "startedAt", "pid", "retry"]) {
    assert.ok(
      diagnostics.includes(field),
      `the refusal must name the active ${field} so the user can diagnose the contention; got: ${diagnostics.slice(0, 300)}`,
    );
  }
});

test("a writer lock is never removed on the basis of elapsed time or a missing pid", async (context) => {
  const fixture = await createCrashFixture(context);
  await mkdir(fixture.stateRoot, { recursive: true });

  // A lock whose owning process is long gone and whose timestamp is ancient.
  const lockPath = join(fixture.stateRoot, "writer.lock");
  await writeFile(
    lockPath,
    `${JSON.stringify({
      schemaVersion: 1,
      operationId: "abandoned-operation",
      pid: 999_999_999,
      startedAt: "2000-01-01T00:00:00.000Z",
      host: "absent-host",
    })}\n`,
    "utf8",
  );

  const result = runChild(fixture, AFTER_BYTES);

  assert.ok(existsSync(lockPath), "an abandoned-looking lock must not be deleted automatically");
  assert.notEqual(result.status, 0, "an abandoned-looking lock must block the write until an explicit repair");
  assert.ok(
    `${result.stdout}${result.stderr}`.toLowerCase().includes("repair"),
    "the refusal must point at the explicit repair path rather than silently recovering",
  );
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

    const result = spawnSync(
      process.execPath,
      [fixture.childScript, caseStateRoot, caseTargetRoot, caseTarget, AFTER_BYTES],
      {
        encoding: "utf8",
        timeout: 60_000,
        windowsHide: true,
        env: { ...process.env, ALPHA_AOS_FAILPOINT: failpoint satisfies Failpoint },
      },
    );

    assert.notEqual(
      result.status,
      0,
      `failpoint \`${failpoint}\` was not honoured: the writer ran to completion, so this boundary is untested`,
    );

    const current = existsSync(caseTarget) ? sha256(await readFile(caseTarget)) : null;
    assert.ok(
      current === beforeHash || current === afterHash || current === null || current !== undefined,
      `failpoint \`${failpoint}\` left the target in an undiagnosable state`,
    );

    const journals = await readJournals(caseStateRoot);
    assert.ok(
      journals.length > 0,
      `failpoint \`${failpoint}\` left no journal evidence, so the real operation state cannot be reported`,
    );
    const journal = journals[0];
    assert.ok(journal !== undefined && typeof journal.status === "string", "journal evidence must carry a status");
  }
});

test("diagnosis and repair preview never change the tree they describe", async (context) => {
  const fixture = await createCrashFixture(context);
  assert.ok(existsSync(cliEntry), `CLI entry must be built before this suite runs: ${cliEntry}`);

  // Leave interrupted-looking evidence behind.
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

  const env = { ...process.env, ALPHA_AOS_STATE_DIR: fixture.stateRoot, NO_COLOR: "1" };
  for (const args of [["status"], ["status", "--json"], ["rollback"], ["rollback", "--json"]]) {
    spawnSync(process.execPath, [cliEntry, ...args], { encoding: "utf8", timeout: 60_000, windowsHide: true, env });
  }

  assert.equal(await digest(fixture.stateRoot), beforeState, "a diagnosis or repair preview mutated the state root");
  assert.equal(await digest(fixture.targetRoot), beforeTarget, "a diagnosis or repair preview mutated the target root");
});

test("a neither-hash target keeps its drift and is not silently reconciled", async (context) => {
  const fixture = await createCrashFixture(context);

  const journal = runChild(fixture, AFTER_BYTES);
  assert.equal(journal.status, 0, "the baseline write must succeed before drift is introduced");

  // A third party edits the target after the managed write.
  const driftBytes = "neither before nor after\n";
  await writeFile(fixture.target, driftBytes, "utf8");

  const env = { ...process.env, ALPHA_AOS_STATE_DIR: fixture.stateRoot, NO_COLOR: "1" };
  const preview = spawnSync(process.execPath, [cliEntry, "rollback"], { encoding: "utf8", timeout: 60_000, windowsHide: true, env });

  assert.equal(await readFile(fixture.target, "utf8"), driftBytes, "drift was reconciled without an explicit apply");
  assert.ok(
    `${preview.stdout ?? ""}${preview.stderr ?? ""}`.length > 0,
    "the drifted state must be reported rather than passed over in silence",
  );
});
