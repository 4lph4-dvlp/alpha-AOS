import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { packageRoot } from "../src/core/paths.js";
import { assertNoPrivatePaths } from "../src/core/release-package-proof.js";

const root = packageRoot();
const guides = ["docs/guides/migration.md", "docs/guides/migration.ko.md"];
const readmes = ["README.md", "README.ko.md"];
const skills = [
  "skills/alpha-aos-control/SKILL.md",
  "skills/alpha-aos-task/SKILL.md",
];

test("Task 1 & 2: migration guides have balanced code fences, matching section headers, and no private paths", async () => {
  for (const guidePath of guides) {
    const fullPath = join(root, guidePath);
    assert.ok(existsSync(fullPath), `${guidePath} must exist`);
    const text = await readFile(fullPath, "utf8");

    // Balanced code fences
    const fenceCount = [...text.matchAll(/^\s*```/gmu)].length;
    assert.equal(fenceCount % 2, 0, `unbalanced fence in ${guidePath}`);
    assert.ok(fenceCount >= 6, `${guidePath} should have at least 3 code blocks`);

    // Section symmetry: ## 1. through ## 6.
    const sectionNumbers = [...text.matchAll(/^## (\d)\./gmu)].map((m) => m[1]);
    assert.deepEqual(sectionNumbers, ["1", "2", "3", "4", "5", "6"], `${guidePath} must have sections 1 to 6`);

    // No private paths
    assertNoPrivatePaths(text, guidePath);

    // Key topic coverage
    for (const term of [
      "alpha-aos migrate",
      "alpha-aos update",
      ".user-backup",
      "--resolve-ownership",
      "--plan-digest",
      "--reviewed-plan",
      "alpha-aos doctor",
      "deploy:local",
    ]) {
      assert.ok(text.includes(term), `${guidePath} must mention '${term}'`);
    }

    // Relative links point to existing files
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1]!.replace(/^<|>$/gu, "").split("#")[0]!;
      if (!target || /^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith("/")) continue;
      const targetPath = resolve(dirname(fullPath), decodeURIComponent(target));
      assert.ok(existsSync(targetPath), `${guidePath}: broken relative link to ${target}`);
    }
  }
});

test("Task 1 & 2: READMEs document alpha-aos migrate and link to migration guides", async () => {
  for (const readmePath of readmes) {
    const fullPath = join(root, readmePath);
    assert.ok(existsSync(fullPath), `${readmePath} must exist`);
    const text = await readFile(fullPath, "utf8");

    assertNoPrivatePaths(text, readmePath);
    assert.ok(text.includes("alpha-aos migrate"), `${readmePath} must mention 'alpha-aos migrate'`);
    assert.ok(
      text.includes("docs/guides/migration.md") || text.includes("docs/guides/migration.ko.md"),
      `${readmePath} must link to migration guide`,
    );
    assert.ok(text.includes("deploy:local"), `${readmePath} must mention 'deploy:local'`);

    // Balanced code fences
    const fenceCount = [...text.matchAll(/^\s*```/gmu)].length;
    assert.equal(fenceCount % 2, 0, `unbalanced fence in ${readmePath}`);
  }
});

test("Task 1 & 2: zero occurrences of deprecated background or scheduled promotion terms", async () => {
  const allFiles = [...guides, ...readmes, ...skills];

  for (const relPath of allFiles) {
    const fullPath = join(root, relPath);
    assert.ok(existsSync(fullPath), `${relPath} must exist`);
    const text = await readFile(fullPath, "utf8");

    assert.equal(
      /scheduled promotion/i.test(text),
      false,
      `${relPath} contains deprecated 'scheduled promotion'`,
    );
    assert.equal(
      /background update/i.test(text),
      false,
      `${relPath} contains deprecated 'background update'`,
    );
    assert.equal(
      /nightly update/i.test(text),
      false,
      `${relPath} contains deprecated 'nightly update'`,
    );
  }
});

test("Task 2: management skills describe alpha-aos migrate and 2-track update model", async () => {
  for (const skillPath of skills) {
    const fullPath = join(root, skillPath);
    assert.ok(existsSync(fullPath), `${skillPath} must exist`);
    const text = await readFile(fullPath, "utf8");

    assertNoPrivatePaths(text, skillPath);

    // Balanced code fences
    const fenceCount = [...text.matchAll(/^\s*```/gmu)].length;
    assert.equal(fenceCount % 2, 0, `unbalanced fence in ${skillPath}`);

    // Mentions alpha-aos migrate and tool-records / SSOT
    assert.ok(
      text.includes("alpha-aos migrate") || text.includes("tool-records"),
      `${skillPath} must mention alpha-aos migrate or tool-records`,
    );
  }
});
