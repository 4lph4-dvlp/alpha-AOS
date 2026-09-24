import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { applyFileTransaction } from "../src/core/transaction.js";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("CLI rollback preview changes no byte and apply restores exact prior bytes (LIFE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const existingFile = join(sandbox.home, "existing.txt");
  const createdFile = join(sandbox.home, "created.txt");

  await writeFile(existingFile, "p11 before\n", "utf8");

  const journal = await applyFileTransaction({
    stateRoot: sandbox.state,
    allowedRoots: [sandbox.home],
    operations: [
      { target: existingFile, content: "p11 after\n" },
      { target: createdFile, content: "p11 created\n" },
    ],
  });
  assert.equal(journal.status, "applied");

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);

  const preview = spawnSync(process.execPath, [cliPath, "rollback", journal.id], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(preview.status, 0, `preview failed: ${preview.stderr}`);
  assert.match(preview.stdout, /existing\.txt/u);
  assert.match(preview.stdout, /created\.txt/u);

  const homeAfterPreview = await fingerprintManifest(sandbox.home);
  const stateAfterPreview = await fingerprintManifest(sandbox.state);
  assert.equal(homeBefore.digest, homeAfterPreview.digest);
  assert.equal(stateBefore.digest, stateAfterPreview.digest);

  const apply = spawnSync(process.execPath, [cliPath, "rollback", journal.id, "--apply", "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(apply.status, 0, `apply failed: ${apply.stderr}`);

  const restoredContent = await readFile(existingFile, "utf8");
  assert.equal(restoredContent, "p11 before\n");
  assert.equal(existsSync(createdFile), false);
});

test("CLI rollback refuses on post-transaction drift and changes no byte, journal or snapshot (LIFE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const existingFile = join(sandbox.home, "existing.txt");
  const createdFile = join(sandbox.home, "created.txt");

  await writeFile(existingFile, "p11 before\n", "utf8");

  const journal = await applyFileTransaction({
    stateRoot: sandbox.state,
    allowedRoots: [sandbox.home],
    operations: [
      { target: existingFile, content: "p11 after\n" },
      { target: createdFile, content: "p11 created\n" },
    ],
  });
  assert.equal(journal.status, "applied");

  await writeFile(createdFile, "p11 drift\n", "utf8");

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);

  const apply = spawnSync(process.execPath, [cliPath, "rollback", journal.id, "--apply", "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(apply.status, 2, `expected exit code 2, got ${apply.status}`);
  const parsed = JSON.parse(apply.stdout) as { ok?: boolean };
  assert.equal(parsed.ok, false);

  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  assert.equal(homeBefore.digest, homeAfter.digest);
  assert.equal(stateBefore.digest, stateAfter.digest);
});
