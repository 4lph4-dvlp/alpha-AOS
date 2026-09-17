import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  evaluateRiskObligations,
  matchRiskFacts,
  resolvePhaseGitDiff,
  RISK_SURFACE_DEFINITIONS,
} from "../src/core/gate.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";

async function scratchRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return root;
}

test("resolvePhaseGitDiff captures cumulative changes across multiple commits and uncommitted working tree", async (context) => {
  const parent = await scratchRoot(context, "gate-diff-cumulative");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  // Base commit is the initial commit
  const baseCommitResult = gitCommand(root, ["rev-parse", "HEAD"]);
  assert.equal(baseCommitResult.ok, true);
  const baseCommit = baseCommitResult.stdout.trim();

  // Commit 1: add docs
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "arch.md"), "# Architecture\n", "utf8");
  gitCommand(root, ["add", "docs/arch.md"]);
  gitCommand(root, ["commit", "-m", "docs: add arch.md"]);

  // Commit 2: add style
  await mkdir(join(root, "styles"), { recursive: true });
  await writeFile(join(root, "styles", "main.css"), "body { color: red; }\n", "utf8");
  gitCommand(root, ["add", "styles/main.css"]);
  gitCommand(root, ["commit", "-m", "style: add main.css"]);

  // Uncommitted working tree modification
  await writeFile(join(root, "docs", "arch.md"), "# Architecture v2\n", "utf8");

  // Untracked file
  await writeFile(join(root, "untracked.txt"), "hello world\n", "utf8");

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });

  assert.equal(diffRange.baseCommit, baseCommit);
  assert.equal(diffRange.isWorkingTreeDirty, true);
  assert.deepEqual(diffRange.modifiedFiles, ["docs/arch.md", "styles/main.css"]);
  assert.deepEqual(diffRange.untrackedFiles, ["untracked.txt"]);
});

test("evaluateRiskObligations grants silent pass with zero obligations for low-risk work (GATE-04, D-03)", async (context) => {
  const parent = await scratchRoot(context, "gate-silent-pass");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;
  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // Low-risk doc and CSS changes
  await writeFile(join(root, "README.md"), "# Updated Readme\n", "utf8");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "assets", "logo.svg"), "<svg></svg>\n", "utf8");
  await writeFile(join(root, "notes.txt"), "private notes\n", "utf8");

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  assert.equal(result.silentPass, true);
  assert.deepEqual(result.obligations, []);
  assert.deepEqual(result.riskFiles, []);
  assert.deepEqual(result.matchedFacts, []);
});

test("untracked files in risk surface trigger corresponding obligations (D-01)", async (context) => {
  const parent = await scratchRoot(context, "gate-untracked-risk");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;
  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // Untracked authentication file in subfolder
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await writeFile(join(root, "src", "auth", "session.ts"), "export const session = {};\n", "utf8");

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });

  assert.equal(diffRange.untrackedFiles.includes("src/auth/session.ts"), true);

  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  assert.equal(result.silentPass, false);
  assert.deepEqual(result.obligations, ["security-review"]);
  assert.deepEqual(result.riskFiles, ["src/auth/session.ts"]);
  assert.equal(result.matchedFacts[0]?.factId, "auth-change");
  assert.equal(result.matchedFacts[0]?.rule, "glob");
});

test("authentication boundary change deterministically selects security-review (GATE-01)", async (context) => {
  const parent = await scratchRoot(context, "gate-auth-change");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;
  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // Commit an auth controller
  await mkdir(join(root, "controllers"), { recursive: true });
  await writeFile(join(root, "controllers", "login.controller.ts"), "export function login() {}\n", "utf8");
  gitCommand(root, ["add", "controllers/login.controller.ts"]);
  gitCommand(root, ["commit", "-m", "feat: add login controller"]);

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  assert.equal(result.silentPass, false);
  assert.deepEqual(result.obligations, ["security-review"]);
  assert.equal(result.riskFiles.includes("controllers/login.controller.ts"), true);
  assert.equal(result.matchedFacts.some((m) => m.factId === "auth-change"), true);
});

test("database migration change deterministically selects database-migration (GATE-01)", async (context) => {
  const parent = await scratchRoot(context, "gate-db-migration");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;
  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // Create a Prisma migration file
  await mkdir(join(root, "prisma", "migrations", "20260918_init"), { recursive: true });
  await writeFile(
    join(root, "prisma", "migrations", "20260918_init", "migration.sql"),
    "CREATE TABLE users (id INT PRIMARY KEY);\n",
    "utf8"
  );

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  assert.equal(result.silentPass, false);
  assert.deepEqual(result.obligations, ["database-migration"]);
  assert.equal(
    result.riskFiles.includes("prisma/migrations/20260918_init/migration.sql"),
    true
  );
  assert.equal(result.matchedFacts.some((m) => m.factId === "database-migration"), true);
});

test("release surface changes deterministically select release-check (GATE-01)", async (context) => {
  const parent = await scratchRoot(context, "gate-release-check");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  // Add initial package.json with version 1.0.0
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "my-app", version: "1.0.0" }, null, 2),
    "utf8"
  );
  gitCommand(root, ["add", "package.json"]);
  gitCommand(root, ["commit", "-m", "chore: add package.json"]);

  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // Bump version to 1.1.0 and add changeset
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "my-app", version: "1.1.0" }, null, 2),
    "utf8"
  );
  await mkdir(join(root, ".changeset"), { recursive: true });
  await writeFile(join(root, ".changeset", "smart-whale.md"), "---\nmy-app: minor\n---\n", "utf8");

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  assert.equal(result.silentPass, false);
  assert.deepEqual(result.obligations, ["release-check"]);
  assert.equal(result.riskFiles.includes("package.json"), true);
  assert.equal(result.riskFiles.includes(".changeset/smart-whale.md"), true);
  assert.equal(result.matchedFacts.some((m) => m.factId === "release-check"), true);
});

test("package.json modification without version change does NOT trigger release-check (safe inspection, D-02)", async (context) => {
  const parent = await scratchRoot(context, "gate-package-safe-inspect");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "my-app", version: "1.0.0", description: "old desc" }, null, 2),
    "utf8"
  );
  gitCommand(root, ["add", "package.json"]);
  gitCommand(root, ["commit", "-m", "chore: initial package.json"]);

  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // Change only description and formatting, version stays 1.0.0
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      { name: "my-app", version: "1.0.0", description: "new desc", devDependencies: { prettier: "3.0.0" } },
      null,
      4
    ),
    "utf8"
  );

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  // release-check is not triggered because version did not change
  assert.equal(result.obligations.includes("release-check"), false);
  assert.equal(result.matchedFacts.some((m) => m.factId === "release-check"), false);
  assert.equal(result.silentPass, true);
});

test("secret configuration change matches secrets by path glob without leaking values (D-02)", async (context) => {
  const parent = await scratchRoot(context, "gate-secrets-leak-free");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;
  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  const secretPayload = "DATABASE_PASSWORD=SuperSecretPassword123!Token=ghp_abcdef1234567890\n";
  await writeFile(join(root, ".env.production"), secretPayload, "utf8");

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  assert.equal(result.silentPass, false);
  assert.deepEqual(result.obligations, ["security-review"]);
  assert.deepEqual(result.riskFiles, [".env.production"]);
  assert.equal(result.matchedFacts[0]?.factId, "secrets");
  assert.equal(result.matchedFacts[0]?.rule, "glob");

  // Verify that neither the secret password nor token value is leaked in the result object
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("SuperSecretPassword123"), false);
  assert.equal(serialized.includes("ghp_abcdef"), false);
});

test("safe structural identifier matching detects auth imports without cred scanning (D-02)", async (context) => {
  const parent = await scratchRoot(context, "gate-safe-identifiers");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;
  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // A file named user.ts (which does not match auth path globs directly)
  await mkdir(join(root, "src", "routes"), { recursive: true });
  await writeFile(
    join(root, "src", "routes", "user.ts"),
    `import { sign } from "jsonwebtoken";\nexport const token = sign({ id: 1 }, "key");\n`,
    "utf8"
  );

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const matches = matchRiskFacts(diffRange, { projectRoot: root });

  const authMatch = matches.find((m) => m.factId === "auth-change");
  assert.notEqual(authMatch, undefined);
  assert.equal(authMatch?.rule, "identifier");
  assert.deepEqual(authMatch?.matchedFiles, ["src/routes/user.ts"]);

  const result = evaluateRiskObligations(diffRange, { projectRoot: root });
  assert.deepEqual(result.obligations, ["security-review"]);
});

test("multiple risk surfaces deterministically trigger deduplicated obligations in stable order", async (context) => {
  const parent = await scratchRoot(context, "gate-multiple-obligations");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "app", version: "1.0.0" }, null, 2),
    "utf8"
  );
  gitCommand(root, ["add", "package.json"]);
  gitCommand(root, ["commit", "-m", "initial commit"]);
  const baseCommit = gitCommand(root, ["rev-parse", "HEAD"]).stdout.trim();

  // 1. Auth change
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await writeFile(join(root, "src", "auth", "token.ts"), "export const t = 1;\n", "utf8");

  // 2. DB Migration
  await mkdir(join(root, "migrations"), { recursive: true });
  await writeFile(join(root, "migrations", "001.sql"), "CREATE TABLE t (id INT);\n", "utf8");

  // 3. Release bump
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "app", version: "2.0.0" }, null, 2),
    "utf8"
  );

  const diffRange = await resolvePhaseGitDiff(root, { explicitBase: baseCommit });
  const result = evaluateRiskObligations(diffRange, { projectRoot: root });

  assert.equal(result.silentPass, false);
  // Deterministic order: security-review, database-migration, release-check
  assert.deepEqual(result.obligations, ["security-review", "database-migration", "release-check"]);
  assert.equal(result.riskFiles.length, 3);
});
