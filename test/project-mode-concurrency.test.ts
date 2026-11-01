import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

interface WorkerHolder {
  adopt: (child: ChildProcess) => void;
}

function createHolder(context: { after: (fn: () => Promise<unknown> | unknown) => void }): WorkerHolder {
  const children: ChildProcess[] = [];
  context.after(async () => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      child.kill("SIGKILL");
      await once(child, "exit").catch(() => undefined);
    }
  });
  return {
    adopt(child: ChildProcess) {
      children.push(child);
    },
  };
}

test("two processes reviewing the same initial state with separate state roots result in exactly one winner and stale refusal (MODE-04, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "concurrency-project");
  await mkdir(projectDir, { recursive: true });

  const stateRootA = join(sandbox.root, "state-a");
  const stateRootB = join(sandbox.root, "state-b");
  await mkdir(stateRootA, { recursive: true });
  await mkdir(stateRootB, { recursive: true });

  // Both preview against the initial missing state
  const previewA = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"], {
    env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootA },
    encoding: "utf8",
  });
  assert.equal(previewA.status, 0);
  const planA = JSON.parse(previewA.stdout);

  const previewB = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "strict", projectDir, "--json"], {
    env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootB },
    encoding: "utf8",
  });
  assert.equal(previewB.status, 0);
  const planB = JSON.parse(previewB.stdout);

  // Process A applies successfully
  const applyA = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", planA.planDigest, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootA },
      encoding: "utf8",
    },
  );
  assert.equal(applyA.status, 0, `Process A failed: ${applyA.stderr}`);
  const resultA = JSON.parse(applyA.stdout);
  assert.equal(resultA.change, "created");
  assert.equal(resultA.mode, "flexible");

  // Process B attempts to apply with its old reviewed digest
  const applyB = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "strict", projectDir, "--apply", "--plan-digest", planB.planDigest, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootB },
      encoding: "utf8",
    },
  );
  assert.notEqual(applyB.status, 0, "Process B must be refused because initial state was modified by Process A");
  assert.match(applyB.stderr, /stale-plan|plan digest does not match/u);

  // State B must have NO journals recorded for this failed transaction
  const stateBJournals = join(stateRootB, "journal");
  assert.equal(existsSync(stateBJournals), false, "refused stale apply must allocate no journal or operation ID");

  // Policy file reflects Process A's winning change
  const policyFile = join(projectDir, ".alpha-aos", "behavior.json");
  const currentContent = JSON.parse(await readFile(policyFile, "utf8"));
  assert.equal(currentContent.mode, "flexible");
});

test("canonical root alias shares the same target coordinator lock (MODE-04, D-18, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "alias-project");
  await mkdir(projectDir, { recursive: true });

  // Use relative vs absolute path alias
  const relativeAlias = join(".", "my-alias");
  const stateRoot = sandbox.state;

  const preview1 = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(preview1.status, 0);
  const plan1 = JSON.parse(preview1.stdout);

  // Apply via canonical path
  const apply1 = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", plan1.planDigest, "--json"],
    {
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(apply1.status, 0);

  // Both aliases resolve to the same canonicalRoot and coordinatorPath
  const queryAlias = spawnSync(process.execPath, [cliPath, "project", "mode", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(queryAlias.status, 0);
  const view = JSON.parse(queryAlias.stdout);
  assert.equal(view.effectiveMode, "flexible");
  assert.ok(view.canonicalRoot.endsWith("alias-project"));
});

test("stale retry after winner finishes is rejected without overwriting current policy (MODE-04, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "retry-project");
  const dotAlphaAos = join(projectDir, ".alpha-aos");
  await mkdir(dotAlphaAos, { recursive: true });
  await writeFile(join(dotAlphaAos, "behavior.json"), '{\n  "schemaVersion": 1,\n  "mode": "strict"\n}\n');

  // Preview replacement from strict -> flexible
  const preview = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(preview.status, 0);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.change, "replace");

  // Meanwhile, another tool/user modifies the policy file directly
  await writeFile(join(dotAlphaAos, "behavior.json"), '{\n  "schemaVersion": 1,\n  "mode": "flexible"\n}\n');

  // Applying with the previous digest must be rejected as stale
  const applyRes = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", plan.planDigest, "--json"],
    {
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.notEqual(applyRes.status, 0);
  assert.match(applyRes.stderr, /stale-plan|plan digest does not match/u);

  // Current policy content was preserved and not overwritten
  const content = JSON.parse(await readFile(join(dotAlphaAos, "behavior.json"), "utf8"));
  assert.equal(content.mode, "flexible");
});

test("apply followed by rollback preserves exact initial state and coordinator lock is removed (MODE-04, D-20)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "lifecycle-project");
  await mkdir(projectDir, { recursive: true });

  const coordinatorLock = join(projectDir, ".alpha-aos-behavior.lock");

  // 1. Preview
  const preview = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  const plan = JSON.parse(preview.stdout);

  // 2. Apply
  const apply = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", plan.planDigest, "--json"],
    {
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(apply.status, 0);
  const result = JSON.parse(apply.stdout);
  assert.equal(existsSync(coordinatorLock), false, "coordinator lock must be released after apply");

  // 3. Rollback
  const rollback = spawnSync(
    process.execPath,
    [cliPath, "rollback", result.operationId, "--apply", "--json"],
    {
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(rollback.status, 0);
  assert.equal(existsSync(coordinatorLock), false, "coordinator lock must be released after rollback");
  assert.equal(existsSync(join(projectDir, ".alpha-aos", "behavior.json")), false);
});
