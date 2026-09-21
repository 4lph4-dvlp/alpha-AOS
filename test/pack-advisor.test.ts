import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadCatalogStrict, loadLock } from "../src/core/catalog.js";
import { renderOwnedSkill } from "../src/core/owned-skills.js";
import { packageRoot } from "../src/core/paths.js";
import { applyProjectPackSync } from "../src/core/project-pack-sync.js";
import {
  approveProjectPlan,
  planProjectCapabilities,
  reconcileProjectState,
} from "../src/core/project-plan.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
}

interface ProjectFixture {
  readonly root: string;
  readonly stateRoot: string;
  readonly packageRoot: string;
  readonly sourceRoot: string;
}

const PACK_ID = "WEB_REACT";
const PACK_SKILL = "frontend-a11y";

async function createProjectFixture(context: TestContext, label: string): Promise<ProjectFixture> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-advisor-${label}-proj-`));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "advisor-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );

  const support = await mkdtemp(join(tmpdir(), `alpha-aos-advisor-${label}-supp-`));
  context.after(async () => rm(support, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const stateRoot = join(support, "state");
  const pkgRoot = join(support, "pkg");
  await cp(join(repositoryRoot, "catalog"), join(pkgRoot, "catalog"), { recursive: true });
  await cp(join(repositoryRoot, "schemas"), join(pkgRoot, "schemas"), { recursive: true });

  const sourceRoot = join(support, "source");
  const sourceBody = `---\nname: ${PACK_SKILL}\n---\n\n# frontend accessibility fixture\n`;
  await mkdir(join(sourceRoot, PACK_SKILL), { recursive: true });
  await writeFile(join(sourceRoot, PACK_SKILL, "SKILL.md"), sourceBody, "utf8");

  const lockPath = join(pkgRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    components: { ecc: { sourceSha256: Record<string, string> } };
  };
  lock.components.ecc.sourceSha256[PACK_SKILL] = sha256(sourceBody);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  return { root, stateRoot, packageRoot: pkgRoot, sourceRoot };
}

test("alpha-aos-pack-advisor skill artifact adheres to strict instruction and safety contracts (PACK-01, PACK-03, D-01)", async () => {
  const skillFile = join(packageRoot(), "skills", "alpha-aos-pack-advisor", "SKILL.md");
  assert.equal(existsSync(skillFile), true, "skills/alpha-aos-pack-advisor/SKILL.md must exist");

  const content = await readFile(skillFile, "utf8");
  assert.match(content, /^---\r?\n/u, "skill must begin with YAML frontmatter");
  assert.match(content, /name:\s*alpha-aos-pack-advisor/u, "skill must declare name");
  assert.match(content, /description:/u, "skill must declare description");

  // Instruction and command coverage
  assert.match(content, /alpha-aos project plan \. --json/u, "must instruct running project plan . --json");
  assert.match(content, /alpha-aos project status \. --json/u, "must instruct running project status . --json");
  assert.match(content, /alpha-aos project approve \. --plan-digest/u, "must instruct running project approve with plan-digest");
  assert.match(content, /alpha-aos project sync \. --apply/u, "must instruct running project sync . --apply");

  // Invariant guarantees
  assert.match(content, /64-character/u, "must enforce 64-character SHA-256 digest invariant");
  assert.match(content, /MUST NOT/u, "must emphasize safety prohibition against unconfirmed mutations");
  assert.match(content, /restart the agent session|reload tools/u, "must guide user on activating new MCP tools and skills");
});

test("catalog and lock declare alpha-aos-pack-advisor across all 5 harnesses with automatic invocation (PACK-03, D-05)", async () => {
  const root = packageRoot();
  const catalog = await loadCatalogStrict(root);
  const lock = await loadLock(root);

  const advisor = catalog.value.components.ownedSkills.find((s) => s.id === "alpha-aos-pack-advisor");
  assert.ok(advisor, "catalog must contain alpha-aos-pack-advisor");
  assert.deepEqual(advisor.targets, ["claude", "codex", "antigravity", "pi", "hermes"], "must target all 5 harnesses");
  assert.equal(advisor.invocation, "automatic", "must be automatically invocable by models");

  const locked = lock.components.ownedSkills?.["alpha-aos-pack-advisor"];
  assert.ok(locked, "lock must pin alpha-aos-pack-advisor");

  const skillSource = await readFile(join(root, advisor.source), "utf8");
  const sourceHash = sha256(skillSource);
  assert.equal(locked.sourceSha256, sourceHash, "lock sourceSha256 must match skill source file hash");

  for (const target of ["claude", "codex", "antigravity", "pi", "hermes"] as const) {
    const rendered = renderOwnedSkill(skillSource, target, "automatic");
    assert.equal(locked.targetSha256[target], sha256(rendered), `lock targetSha256 for ${target} must match rendered output`);
  }
});

test("autonomous advisor workflow discovers, approves, and materializes capability packs end-to-end (PACK-01, PACK-02, D-02)", async (context) => {
  const fixture = await createProjectFixture(context, "autonomous-e2e");

  // Step 1: Workspace Inspection (plan)
  const plan = await planProjectCapabilities({ path: fixture.root, packageRoot: fixture.packageRoot });
  assert.deepEqual(plan.applicable, [PACK_ID], "plan must detect applicable pack");
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/u, "planDigest must be exact 64-character hex string");

  // Step 2: Workspace Status (unmaterialized check)
  const initialRecon = await reconcileProjectState({ path: fixture.root, packageRoot: fixture.packageRoot });
  assert.equal(initialRecon.packs.length, 0, "no packs should be materialized yet");
  assert.equal(initialRecon.artifactState, "absent", "plan artifact should not exist yet");

  // Step 3: User Confirmation & Autonomous Approval
  const approved = await approveProjectPlan({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    expectedDigest: plan.planDigest,
  });
  assert.equal(approved.status, "written", "approved plan artifact must be written");

  // Step 4: Materialization (sync)
  const syncResult = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.equal(syncResult.status, "written", "sync must successfully apply");
  assert.equal(syncResult.packs.length, 1, "exactly one pack must be synced");
  assert.equal(syncResult.packs[0], PACK_ID);

  // Step 5: Verification (reconciled CURRENT state)
  const postRecon = await reconcileProjectState({ path: fixture.root, packageRoot: fixture.packageRoot });
  const deployedPack = postRecon.packs.find((p) => p.packId === PACK_ID);
  assert.equal(deployedPack?.capability.deployment, "CURRENT", "pack must be in CURRENT deployment state");
});

test("advisor workflow fails closed on tampered digest, file drift, and unapproved sync (PACK-02, D-02)", async (context) => {
  const fixture = await createProjectFixture(context, "fail-closed");

  const plan = await planProjectCapabilities({ path: fixture.root, packageRoot: fixture.packageRoot });
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/u);

  // 1. Tampered / modified digest must reject
  const lastChar = plan.planDigest.slice(-1);
  const corruptedChar = lastChar === "0" ? "1" : "0";
  const tamperedDigest = `${plan.planDigest.slice(0, -1)}${corruptedChar}`;

  await assert.rejects(
    () =>
      approveProjectPlan({
        path: fixture.root,
        packageRoot: fixture.packageRoot,
        stateRoot: fixture.stateRoot,
        expectedDigest: tamperedDigest,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /plan-drift|plan digest|mismatch/iu);
      return true;
    },
    "tampered digest must be rejected without mutating approved plan",
  );

  // 2. Unapproved sync must reject before writing
  await assert.rejects(
    () =>
      applyProjectPackSync({
        path: fixture.root,
        packageRoot: fixture.packageRoot,
        stateRoot: fixture.stateRoot,
        verifiedSourceRoot: fixture.sourceRoot,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /no approved plan|plan\.json/iu);
      return true;
    },
    "sync without approved plan must fail closed",
  );

  // 3. Workspace modification after planning (drift) changes digest and rejects previous digest
  await writeFile(
    join(fixture.root, "package.json"),
    `${JSON.stringify({ name: "advisor-fixture", private: true, dependencies: { react: "^19.0.0", redux: "^5.0.0" } }, null, 2)}\n`,
    "utf8",
  );

  await assert.rejects(
    () =>
      approveProjectPlan({
        path: fixture.root,
        packageRoot: fixture.packageRoot,
        stateRoot: fixture.stateRoot,
        expectedDigest: plan.planDigest,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /plan-drift|plan digest|mismatch/iu);
      return true;
    },
    "stale plan digest after workspace file drift must be rejected",
  );
});

test("CLI project plan --json output provides exact planDigest and selected packs for autonomous parsing", async (context) => {
  const fixture = await createProjectFixture(context, "cli-json");

  const child = spawnSync(process.execPath, [cliEntry, "project", "plan", fixture.root, "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.equal(child.status, 0, `CLI project plan failed: ${child.stderr}`);
  const parsed = JSON.parse(child.stdout) as {
    planDigest: string;
    selected: string[];
    applicable: string[];
  };

  assert.match(parsed.planDigest, /^[0-9a-f]{64}$/u, "CLI JSON output must expose 64-character hex planDigest");
  assert.ok(Array.isArray(parsed.selected), "CLI JSON output must expose selected array");
  assert.ok(parsed.selected.includes(PACK_ID), "CLI JSON selected must include detected pack");
});
