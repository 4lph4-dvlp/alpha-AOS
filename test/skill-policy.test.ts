import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyClaudeSkillPolicy,
  planClaudeSkillPolicy,
  planClaudeSkillPolicyOperation,
  renderClaudeSkillPolicy,
} from "../src/core/skill-policy.js";
import { applyOwnedSkillSync, planOwnedSkillOperation } from "../src/core/owned-skills.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { packageRoot } from "../src/core/paths.js";
import { ComponentPlanError } from "../src/core/component-session.js";
import { acquireMutationSession, inspectWriterState, writerLockPath } from "../src/core/writer-lock.js";

test("Claude skill policy preserves unrelated settings and overrides only three managed ECC skills", () => {
  const rendered = renderClaudeSkillPolicy(JSON.stringify({
    permissions: { allow: ["Bash(npm test)"] },
    skillOverrides: { "user-skill": "on", "unified-memory": "off" },
  }));
  const parsed = JSON.parse(rendered) as Record<string, any>;
  assert.deepEqual(parsed.permissions, { allow: ["Bash(npm test)"] });
  assert.equal(parsed.skillOverrides["user-skill"], "on");
  assert.equal(parsed.skillOverrides["unified-memory"], "user-invocable-only");
  assert.equal(parsed.skillOverrides["documentation-lookup"], "user-invocable-only");
  assert.equal(parsed.skillOverrides["deep-research"], "user-invocable-only");
});

test("Claude skill policy is transactional and semantically idempotent", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-skill-policy-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const settingsPath = join(root, "claude", "settings.json");
  const stateRoot = join(root, "state");
  await mkdir(join(root, "claude"), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ theme: "dark" }, null, 4)}\n`, "utf8");
  const before = await planClaudeSkillPolicy({ settingsPath });
  assert.equal(before.action, "update");
  const applied = await applyClaudeSkillPolicy({ settingsPath, stateRoot });
  assert.ok(applied.operationId);
  assert.equal(applied.plan.action, "current");
  const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, any>;
  assert.equal(parsed.theme, "dark");
  assert.equal(Object.keys(parsed.skillOverrides).length, 3);
  const reapplied = await applyClaudeSkillPolicy({ settingsPath, stateRoot });
  assert.equal(reapplied.operationId, null);

  // A standalone apply owns its session, so it releases the writer it took.
  assert.equal(existsSync(writerLockPath(stateRoot)), false);
});

test("the reviewed policy plan names its path roles and binds the rendered hash without emitting it", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-skill-policy-plan-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const settingsPath = join(root, "claude", "settings.json");
  const stateRoot = join(root, "state");
  await mkdir(join(root, "claude"), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ theme: "dark", apiKeyHelper: "secret-command" }, null, 2)}\n`, "utf8");

  const plan = await planClaudeSkillPolicyOperation({ settingsPath, stateRoot });
  assert.equal(plan.proofs.proven, true);
  for (const role of ["target", "state", "journal", "snapshot"] as const) {
    assert.ok(plan.proofs.get(role), `plan must declare the ${role} role`);
  }
  assert.equal(plan.renderedHash.length, 64);
  assert.equal(plan.digest.length, 64);
  assert.equal(JSON.stringify(plan).includes("secret-command"), false, "the plan records a hash, not the settings text");
  assert.equal(existsSync(writerLockPath(stateRoot)), false, "planning takes no writer");
});

test("a nested policy apply consumes the caller session and takes no second writer lock", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-skill-policy-nested-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const settingsPath = join(root, "claude", "settings.json");
  const stateRoot = join(root, "state");
  await mkdir(join(root, "claude"), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ theme: "dark" }, null, 2)}\n`, "utf8");

  const plan = await planClaudeSkillPolicyOperation({ settingsPath, stateRoot });
  const session = await acquireMutationSession({ stateRoot, proofs: plan.proofs, planDigest: plan.digest });
  let closed = false;
  context.after(async () => {
    if (!closed) await session.close();
  });

  // The writer lock is exclusive-create, so a second acquisition would fail here.
  const applied = await applyClaudeSkillPolicy({ plan, session, settingsPath, stateRoot });
  assert.equal(applied.operationId, session.operationId);
  const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, any>;
  assert.equal(parsed.theme, "dark", "unrelated user settings survive");
  assert.equal(Object.keys(parsed.skillOverrides).length, 3);

  assert.equal((await inspectWriterState(stateRoot)).status, "active", "the callee must not release a writer it did not take");
  await session.close();
  closed = true;
});

test("a policy plan reviewed before the settings changed refuses and keeps the later edit", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-skill-policy-drift-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const settingsPath = join(root, "claude", "settings.json");
  const stateRoot = join(root, "state");
  await mkdir(join(root, "claude"), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ theme: "dark" }, null, 2)}\n`, "utf8");

  const plan = await planClaudeSkillPolicyOperation({ settingsPath, stateRoot });
  const edited = `${JSON.stringify({ theme: "dark", permissions: { allow: ["Bash(npm test)"] } }, null, 2)}\n`;
  await writeFile(settingsPath, edited, "utf8");

  await assert.rejects(
    () => applyClaudeSkillPolicy({ plan, settingsPath, stateRoot }),
    (error: unknown) => {
      assert.ok(error instanceof ComponentPlanError);
      assert.equal(error.code, "plan-drift");
      return true;
    },
  );
  assert.equal(await readFile(settingsPath, "utf8"), edited);
  assert.equal(existsSync(writerLockPath(stateRoot)), false);
});

/** A Claude home with the upstream workflow present, so an owned skill can apply. */
async function ownedSkillFixture(context: { after: (fn: () => Promise<unknown>) => void }, label: string): Promise<{
  claudeHome: string;
  stateRoot: string;
  destination: string;
}> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-owned-skill-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const claudeHome = join(root, "claude");
  await mkdir(join(claudeHome, "gsd-core", "workflows"), { recursive: true });
  await writeFile(join(claudeHome, "gsd-core", "workflows", "ship.md"), "# ship\n", "utf8");
  return {
    claudeHome,
    stateRoot: join(root, "state"),
    destination: join(claudeHome, "skills", "alpha-aos-ship", "SKILL.md"),
  };
}

test("the reviewed owned-skill plan binds the locked source and rendered hashes", async (context) => {
  const fixture = await ownedSkillFixture(context, "plan");
  const root = packageRoot();
  const plan = await planOwnedSkillOperation(root, await loadCatalog(root), await loadLock(root), "alpha-aos-ship", "claude", {
    claudeHome: fixture.claudeHome,
    stateRoot: fixture.stateRoot,
  });

  assert.equal(plan.proofs.proven, true);
  for (const role of ["target", "state", "journal", "snapshot", "source", "package-root"] as const) {
    assert.ok(plan.proofs.get(role), `plan must declare the ${role} role`);
  }
  assert.equal(plan.sync.workflowFound, true);
  assert.equal(plan.sync.action, "create");
  assert.equal(plan.sourceHash.length, 64);
  assert.equal(plan.expectedHash.length, 64);
  assert.equal(existsSync(fixture.destination), false, "planning writes nothing");
});

test("standalone and nested owned-skill applies write the same bytes under one writer", async (context) => {
  const standalone = await ownedSkillFixture(context, "standalone");
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const first = await applyOwnedSkillSync(root, catalog, lock, "alpha-aos-ship", "claude", {
    claudeHome: standalone.claudeHome,
    stateRoot: standalone.stateRoot,
  });
  assert.ok(first.operationId);
  assert.equal(first.plan.action, "current");
  assert.equal(existsSync(writerLockPath(standalone.stateRoot)), false, "a standalone apply releases the writer it took");

  const nested = await ownedSkillFixture(context, "nested");
  const plan = await planOwnedSkillOperation(root, catalog, lock, "alpha-aos-ship", "claude", {
    claudeHome: nested.claudeHome,
    stateRoot: nested.stateRoot,
  });
  const session = await acquireMutationSession({ stateRoot: nested.stateRoot, proofs: plan.proofs, planDigest: plan.digest });
  let closed = false;
  context.after(async () => {
    if (!closed) await session.close();
  });

  const second = await applyOwnedSkillSync(root, catalog, lock, "alpha-aos-ship", "claude", {
    plan,
    session,
    claudeHome: nested.claudeHome,
    stateRoot: nested.stateRoot,
  });
  assert.equal(second.operationId, session.operationId);
  assert.deepEqual(await readFile(nested.destination), await readFile(standalone.destination));
  assert.equal((await inspectWriterState(nested.stateRoot)).status, "active");
  await session.close();
  closed = true;
});

test("an owned-skill apply refuses when its upstream workflow is missing", async (context) => {
  const fixture = await ownedSkillFixture(context, "missing-workflow");
  await rm(join(fixture.claudeHome, "gsd-core", "workflows", "ship.md"), { force: true });
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);
  await assert.rejects(
    () => applyOwnedSkillSync(root, catalog, lock, "alpha-aos-ship", "claude", {
      claudeHome: fixture.claudeHome,
      stateRoot: fixture.stateRoot,
    }),
    /Required GSD workflow is missing/u,
  );
  assert.equal(existsSync(fixture.destination), false);
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});
