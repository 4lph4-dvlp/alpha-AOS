import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { applyFileTransaction, type PolicyOperationMetadata } from "../src/core/transaction.js";
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

test("CLI rollback on drifted policy file prints safe diagnostics in text and JSON without leaking secret sentinel (MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectRoot = join(sandbox.home, "my-project");
  const dotAlphaAos = join(projectRoot, ".alpha-aos");
  await mkdir(dotAlphaAos, { recursive: true });

  const lstats = await lstat(projectRoot, { bigint: true });
  const policyMeta: PolicyOperationMetadata = {
    kind: "project-mode",
    canonicalRoot: projectRoot,
    rootIdentity: {
      deviceExact: lstats.dev.toString(),
      inodeExact: lstats.ino.toString(),
    },
    policyRelativePath: ".alpha-aos/behavior.json",
  };

  const policyFile = join(dotAlphaAos, "behavior.json");
  const journal = await applyFileTransaction({
    stateRoot: sandbox.state,
    allowedRoots: [dotAlphaAos],
    policyOperation: policyMeta,
    operations: [{ target: policyFile, content: '{\n  "schemaVersion": 1,\n  "mode": "strict"\n}\n' }],
  });

  const SECRET_SENTINEL = "sk-super-secret-user-token-999";
  await writeFile(policyFile, `{\n  "schemaVersion": 1,\n  "mode": "flexible",\n  "leak": "${SECRET_SENTINEL}"\n}\n`);

  // Text mode rollback
  const textApply = spawnSync(process.execPath, [cliPath, "rollback", journal.id, "--apply"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(textApply.status, 2, `expected exit code 2, got ${textApply.status}`);
  assert.equal(textApply.stdout.includes(SECRET_SENTINEL), false, "stdout must not leak secret");
  assert.equal(textApply.stderr.includes(SECRET_SENTINEL), false, "stderr must not leak secret");
  assert.ok(textApply.stderr.includes("alpha-AOS Rollback Drift Error"));
  assert.equal(textApply.stderr.includes("Unified Diff snippet:"), false, "must not include unified diff snippet for policy");

  // JSON mode rollback
  const jsonApply = spawnSync(process.execPath, [cliPath, "rollback", journal.id, "--apply", "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(jsonApply.status, 2, `expected exit code 2, got ${jsonApply.status}`);
  assert.equal(jsonApply.stdout.includes(SECRET_SENTINEL), false, "json stdout must not leak secret");
  const parsed = JSON.parse(jsonApply.stdout) as { ok?: boolean; diagnostics?: Array<{ unifiedDiff?: string | null }> };
  assert.equal(parsed.ok, false);
  assert.equal(parsed.diagnostics?.[0]?.unifiedDiff, null);
});

test("CLI rollback of policy first-create restores state and preserves .alpha-aos and siblings (MODE-04)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectRoot = join(sandbox.home, "my-project");
  const dotAlphaAos = join(projectRoot, ".alpha-aos");
  await mkdir(dotAlphaAos, { recursive: true });
  const siblingFile = join(dotAlphaAos, "stack.yaml");
  await writeFile(siblingFile, "trusted: true\n");

  const lstats = await lstat(projectRoot, { bigint: true });
  const policyMeta: PolicyOperationMetadata = {
    kind: "project-mode",
    canonicalRoot: projectRoot,
    rootIdentity: {
      deviceExact: lstats.dev.toString(),
      inodeExact: lstats.ino.toString(),
    },
    policyRelativePath: ".alpha-aos/behavior.json",
  };

  const policyFile = join(dotAlphaAos, "behavior.json");
  const journal = await applyFileTransaction({
    stateRoot: sandbox.state,
    allowedRoots: [dotAlphaAos],
    policyOperation: policyMeta,
    operations: [{ target: policyFile, content: '{\n  "schemaVersion": 1,\n  "mode": "flexible"\n}\n' }],
  });
  assert.equal(journal.status, "applied");
  assert.equal(existsSync(policyFile), true);

  const apply = spawnSync(process.execPath, [cliPath, "rollback", journal.id, "--apply", "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(apply.status, 0, `apply failed: ${apply.stderr}`);

  assert.equal(existsSync(policyFile), false, "policy file must be removed");
  assert.equal(existsSync(dotAlphaAos), true, ".alpha-aos must NOT be swept");
  assert.equal(existsSync(siblingFile), true, "sibling stack.yaml must remain intact");
  assert.equal(await readFile(siblingFile, "utf8"), "trusted: true\n");
});
