import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadLock } from "../src/core/catalog.js";
import { ComponentPlanError } from "../src/core/component-session.js";
import { applyEccSkillSync, globalEccSkillRoot, planEccSkillOperation, planEccSkillSync } from "../src/core/ecc-skills.js";
import { packageRoot } from "../src/core/paths.js";
import { acquireMutationSession, inspectWriterState, writerLockPath } from "../src/core/writer-lock.js";
import type { HarnessId, StackLock } from "../src/types.js";

const SKILLS = ["unified-memory", "documentation-lookup", "deep-research"] as const;
const HARNESS: HarnessId = "codex";

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

interface Fixture {
  root: string;
  sourceRoot: string;
  lock: StackLock;
}

/** A rendered ECC skill tree plus a lock whose hashes bind exactly those bytes. */
async function createFixture(context: { after: (fn: () => Promise<unknown>) => void }, label: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-ecc-test-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, "source");
  const targetSha256: Record<string, Partial<Record<HarnessId, string>>> = {};
  const sourceSha256: Record<string, string> = {};
  for (const skill of SKILLS) {
    const body = `---\nname: ${skill}\n---\n\nrendered for ${HARNESS}\n`;
    await mkdir(join(sourceRoot, skill), { recursive: true });
    await writeFile(join(sourceRoot, skill, "SKILL.md"), body);
    targetSha256[skill] = { [HARNESS]: sha256(body) };
    sourceSha256[skill] = sha256(`upstream ${skill}`);
  }
  return {
    root,
    sourceRoot,
    lock: {
      schemaVersion: 1,
      channel: "stable",
      generatedAt: null,
      components: {
        ecc: {
          package: "@ecc/skills",
          version: "2.4.0",
          integrity: "sha512-fixture",
          skills: [...SKILLS],
          sourceSha256,
          targetSha256,
        },
      },
    },
  };
}

test("ECC exact-file sync plans exactly three locked writes", async (context) => {
  const target = await mkdtemp(join(tmpdir(), "alpha-aos-ecc-target-"));
  context.after(async () => rm(target, { recursive: true, force: true }));
  const plan = await planEccSkillSync("codex", await loadLock(packageRoot()), target);
  assert.equal(plan.entries.length, 3);
  assert.deepEqual(plan.entries.map((entry) => entry.skill), ["unified-memory", "documentation-lookup", "deep-research"]);
  assert.equal(plan.entries.every((entry) => entry.action === "create"), true);
  assert.equal(plan.entries.every((entry) => entry.destination.startsWith(target)), true);
});

test("global ECC roots preserve native roots and share Agent Skills between Codex and Pi", () => {
  const home = "C:\\Users\\fixture";
  assert.equal(globalEccSkillRoot("claude", { CLAUDE_CONFIG_DIR: "C:\\profiles\\claude" }, home), join("C:\\profiles\\claude", "skills"));
  assert.equal(globalEccSkillRoot("codex", { CODEX_HOME: "C:\\profiles\\codex" }, home), join(home, ".agents", "skills"));
  assert.equal(globalEccSkillRoot("antigravity", {}, home), join(home, ".gemini", "config", "skills"));
  assert.equal(globalEccSkillRoot("antigravity", { ANTIGRAVITY_CONFIG_DIR: "C:\\profiles\\antigravity" }, home), join("C:\\profiles\\antigravity", "skills"));
  assert.equal(globalEccSkillRoot("pi", { PI_CODING_AGENT_DIR: "C:\\profiles\\pi" }, home), join(home, ".agents", "skills"));
  assert.equal(globalEccSkillRoot("pi", {}, home), globalEccSkillRoot("codex", {}, home));
});

test("the reviewed ECC plan binds every destination, source byte and path role", async (context) => {
  const fixture = await createFixture(context, "plan");
  const plan = await planEccSkillOperation(HARNESS, fixture.lock, {
    targetRoot: join(fixture.root, "target"),
    stateRoot: join(fixture.root, "state"),
    verifiedSourceRoot: fixture.sourceRoot,
  });

  assert.equal(plan.proofs.proven, true);
  for (const role of ["target", "state", "journal", "snapshot", "source", "package-root"] as const) {
    assert.ok(plan.proofs.get(role), `plan must declare the ${role} role`);
  }
  assert.equal(plan.sources.every((source) => typeof source.sourceHash === "string"), true);
  assert.equal(plan.sync.entries.every((entry) => entry.action === "create"), true);
  assert.equal(plan.digest.length, 64);
  assert.equal(existsSync(join(fixture.root, "target")), false, "planning creates nothing");
});

test("standalone and nested ECC applies write the same bytes, and the nested one takes no second lock", async (context) => {
  const fixture = await createFixture(context, "session");

  const standaloneTarget = join(fixture.root, "standalone-target");
  const standaloneState = join(fixture.root, "standalone-state");
  const standalone = await applyEccSkillSync(HARNESS, fixture.lock, {
    targetRoot: standaloneTarget,
    stateRoot: standaloneState,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.ok(standalone.operationId);
  assert.equal(standalone.plan.entries.every((entry) => entry.action === "current"), true);
  // A standalone apply owns its session and releases it.
  assert.equal(existsSync(writerLockPath(standaloneState)), false);

  const nestedTarget = join(fixture.root, "nested-target");
  const nestedState = join(fixture.root, "nested-state");
  const plan = await planEccSkillOperation(HARNESS, fixture.lock, {
    targetRoot: nestedTarget,
    stateRoot: nestedState,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  const session = await acquireMutationSession({
    stateRoot: nestedState,
    proofs: plan.proofs,
    planDigest: plan.digest,
  });
  let closed = false;
  context.after(async () => {
    if (!closed) await session.close();
  });

  // The writer lock is exclusive-create, so a nested acquisition would fail here.
  const nested = await applyEccSkillSync(HARNESS, fixture.lock, {
    plan,
    session,
    targetRoot: nestedTarget,
    stateRoot: nestedState,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.equal(nested.operationId, session.operationId, "a nested apply journals under the caller's operation");

  for (const skill of SKILLS) {
    const fromStandalone = await readFile(join(standaloneTarget, skill, "SKILL.md"));
    const fromNested = await readFile(join(nestedTarget, skill, "SKILL.md"));
    const source = await readFile(join(fixture.sourceRoot, skill, "SKILL.md"));
    assert.deepEqual(fromStandalone, source);
    assert.deepEqual(fromNested, source);
  }

  assert.equal((await inspectWriterState(nestedState)).status, "active", "the callee must not release the caller's writer");
  await session.close();
  closed = true;
  assert.equal(existsSync(writerLockPath(nestedState)), false);
});

test("a reviewed ECC plan refuses a changed source and preserves the target and its neighbours", async (context) => {
  const fixture = await createFixture(context, "drift");
  const targetRoot = join(fixture.root, "target");
  const stateRoot = join(fixture.root, "state");
  const sentinel = join(fixture.root, "outside.txt");
  await writeFile(sentinel, "untouched\n");
  await mkdir(join(targetRoot, "unified-memory"), { recursive: true });
  const existing = join(targetRoot, "unified-memory", "SKILL.md");
  await writeFile(existing, "local edit\n");

  const plan = await planEccSkillOperation(HARNESS, fixture.lock, {
    targetRoot,
    stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  await writeFile(join(fixture.sourceRoot, "deep-research", "SKILL.md"), "tampered\n");

  await assert.rejects(
    () => applyEccSkillSync(HARNESS, fixture.lock, {
      plan,
      targetRoot,
      stateRoot,
      verifiedSourceRoot: fixture.sourceRoot,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ComponentPlanError);
      assert.equal(error.code, "plan-drift");
      return true;
    },
  );

  assert.equal(await readFile(existing, "utf8"), "local edit\n", "a refused plan leaves the target byte-identical");
  assert.equal(existsSync(join(targetRoot, "deep-research", "SKILL.md")), false);
  assert.equal(await readFile(sentinel, "utf8"), "untouched\n");
  assert.equal(existsSync(writerLockPath(stateRoot)), false, "a refused plan never takes the writer");
});
