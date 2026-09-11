import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyCodexPolicy, planCodexPolicy, renderCodexPolicy } from "../src/core/codex-policy.js";
import { packageRoot } from "../src/core/paths.js";
import { listManagedTransactions, rollbackManagedTransaction } from "../src/core/transaction.js";
import { acquireMutationSession, writerLockPath } from "../src/core/writer-lock.js";

async function fixture(context: test.TestContext) {
  const base = await mkdtemp(join(tmpdir(), "alpha-aos-codex-policy-"));
  context.after(async () => rm(base, { recursive: true, force: true }));
  const root = join(base, "package");
  const configRoot = join(base, "profile with spaces");
  const stateRoot = join(base, "state");
  await mkdir(join(root, "docs"), { recursive: true });
  const source = join(root, "docs", "codex-execution-policy.md");
  const policy = await readFile(join(packageRoot(), "docs", "codex-execution-policy.md"), "utf8");
  await writeFile(source, policy);
  return { root, configRoot, stateRoot, source, policy, target: join(configRoot, "AGENTS.md") };
}

test("clean Codex policy preview is read-only; apply, reinstall and rollback are deterministic", async (context) => {
  const options = await fixture(context);
  const plan = await planCodexPolicy(options);
  assert.equal(plan.action, "create");
  assert.equal(existsSync(options.configRoot), false);
  assert.equal(existsSync(options.stateRoot), false);
  assert.ok(options.policy.length < 2000);
  assert.match(options.policy, /fork_turns="none"/u);
  const applied = await applyCodexPolicy({ plan });
  assert.ok(applied.operationId);
  assert.equal(applied.plan.action, "current");
  assert.equal(await readFile(options.target, "utf8"), renderCodexPolicy("", options.policy));
  const again = await applyCodexPolicy(options);
  assert.equal(again.operationId, null);
  assert.equal((await listManagedTransactions(options.stateRoot)).length, 1);
  await rollbackManagedTransaction(options.stateRoot, applied.operationId);
  assert.equal(existsSync(options.target), false);
  assert.equal((await planCodexPolicy(options)).action, "create");
});

test("policy updates preserve user bytes outside the block and never expose them in preview", async (context) => {
  const options = await fixture(context);
  await mkdir(options.configRoot);
  const user = "\uFEFF# User rules\r\nprivate-user-value\r\n";
  await writeFile(options.target, user);
  const plan = await planCodexPolicy(options);
  assert.equal(JSON.stringify(plan).includes("private-user-value"), false);
  const first = await applyCodexPolicy({ plan });
  const suffix = "\r\n# Later user rules\r\n";
  const edited = `${await readFile(options.target, "utf8")}${suffix}`;
  await writeFile(options.target, edited);
  await writeFile(options.source, `${options.policy}\nUpdated owned policy.\n`);
  const next = await applyCodexPolicy(options);
  const written = await readFile(options.target, "utf8");
  assert.ok(written.startsWith(user));
  assert.ok(written.endsWith(suffix));
  assert.ok(next.operationId);
  await rollbackManagedTransaction(options.stateRoot, next.operationId);
  assert.equal(await readFile(options.target, "utf8"), edited);
  await assert.rejects(rollbackManagedTransaction(options.stateRoot, first.operationId!), /drift|changed/iu);
});

test("malformed or duplicated ownership markers refuse without writing", async (context) => {
  const options = await fixture(context);
  await mkdir(options.configRoot);
  const block = renderCodexPolicy("", options.policy);
  for (const content of [
    "<!-- alpha-AOS:codex-execution:start -->\nuser text",
    "<!-- alpha-AOS:codex-execution:end -->\n<!-- alpha-AOS:codex-execution:start -->",
    `${block}${block}`,
    `user prefix ${block}`,
    "<!-- alpha-AOS:codex-execution:unknown -->",
  ]) {
    await writeFile(options.target, content);
    await assert.rejects(applyCodexPolicy(options), /Malformed/u);
    assert.equal(await readFile(options.target, "utf8"), content);
    assert.equal(existsSync(options.stateRoot), false);
  }
});

test("override precedence refuses both empty and populated global overrides", async (context) => {
  const options = await fixture(context);
  await mkdir(options.configRoot);
  for (const override of ["", "User override"]) {
    await writeFile(join(options.configRoot, "AGENTS.override.md"), override);
    await assert.rejects(applyCodexPolicy(options), /Unsupported Codex instruction precedence/u);
    assert.equal(existsSync(options.target), false);
    assert.equal(existsSync(options.stateRoot), false);
  }
});

test("reviewed plans refuse changed target, source and override, including current plans", async (context) => {
  const options = await fixture(context);
  const absent = await planCodexPolicy(options);
  await mkdir(options.configRoot);
  await writeFile(options.target, "New user rules\n");
  await assert.rejects(applyCodexPolicy({ plan: absent }), /plan-drift/u);
  const beforeSource = await planCodexPolicy(options);
  await writeFile(options.source, `${options.policy}\nNew source.\n`);
  await assert.rejects(applyCodexPolicy({ plan: beforeSource }), /plan-drift/u);
  await applyCodexPolicy(options);
  const current = await planCodexPolicy(options);
  assert.equal(current.action, "current");
  await writeFile(options.target, "User replaced instructions\n");
  await assert.rejects(applyCodexPolicy({ plan: current }), /plan-drift/u);
  const beforeOverride = await planCodexPolicy(options);
  await writeFile(join(options.configRoot, "AGENTS.override.md"), "Override\n");
  await assert.rejects(applyCodexPolicy({ plan: beforeOverride }), /precedence/u);
  assert.equal(await readFile(options.target, "utf8"), "User replaced instructions\n");
});

test("CODEX_HOME is honored and existing mutation sessions are reused", async (context) => {
  const options = await fixture(context);
  const saved = process.env.CODEX_HOME;
  context.after(() => {
    if (saved === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = saved;
  });
  process.env.CODEX_HOME = options.configRoot;
  const plan = await planCodexPolicy({ root: options.root, stateRoot: options.stateRoot });
  assert.equal(plan.configRoot, options.configRoot);
  const session = await acquireMutationSession({ stateRoot: plan.stateRoot, proofs: plan.proofs, planDigest: plan.digest });
  try {
    const result = await applyCodexPolicy({ plan, session });
    assert.ok(result.operationId);
    session.assertOwned();
    assert.equal(existsSync(writerLockPath(options.stateRoot)), true);
  } finally {
    await session.close();
  }
});

test("a target ancestor replaced by a link cannot widen a reviewed policy write", async (context) => {
  const options = await fixture(context);
  await mkdir(options.configRoot);
  const plan = await planCodexPolicy(options);
  const outside = join(options.root, "outside");
  await mkdir(outside);
  await rm(options.configRoot, { recursive: true });
  await symlink(outside, options.configRoot, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(applyCodexPolicy({ plan }), /boundary-changed|plan-incomplete/u);
  assert.equal(existsSync(join(outside, "AGENTS.md")), false);
});
