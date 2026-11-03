import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import { assertNoPrivatePaths } from "../src/core/release-package-proof.js";

const root = packageRoot();
const guides = ["docs/task-entry.md", "docs/task-entry.ko.md"];
const readmes = ["README.md", "README.ko.md"];
const styles = [
  ["대화형-quick", "conversational-quick"], ["대화형-quick-full", "conversational-quick-full"],
  ["대화형-phase", "conversational-phase"], ["오토파일럿-quick", "autopilot-quick"],
  ["오토파일럿-quick-full", "autopilot-quick-full"], ["오토파일럿-phase", "autopilot-phase"],
];

test("task entry guides and README keep bilingual section, style and scenario parity", async () => {
  for (const path of [...guides, ...readmes]) {
    const text = await readFile(join(root, path), "utf8");
    assert.equal([...text.matchAll(/^## /gmu)].length, guides.includes(path) ? 8 : 10, path);
    assert.equal([...text.matchAll(/^\s*```/gmu)].length % 2, 0, `unbalanced fence: ${path}`);
    let previous = -1;
    for (const [label, id] of styles) {
      const position = text.indexOf(`| ${label} |`);
      assert.ok(position > previous, `${path}: missing or misordered label ${label}`);
      assert.ok(text.slice(position, text.indexOf("\n", position)).includes(`\`${id}\``), `${path}: label/ID mapping`);
      previous = position;
    }
    if (guides.includes(path)) {
      assert.deepEqual([...text.matchAll(/^## (\d)\./gmu)].map((match) => match[1]), ["1", "2", "3", "4", "5", "6", "7", "8"]);
      for (const topic of ["strict", "flexible", "README", "public API", "fast-forward", "force push", "new-task", "continue-existing", "dispatchAuthorized: false", "G-07-2", "worker-only", "1–6", "3-OS/macOS CI", "0.6.0", "task approve", "task start", "quickQuality", "PROJECT.md"]) {
        // The Korean guide uses the Korean term for a public API.
        assert.ok(text.includes(topic === "public API" && path.endsWith(".ko.md") ? "공개 API" : topic), `${path}: ${topic}`);
      }
    } else {
      assert.deepEqual([...text.matchAll(/^### (?:Scenario|시나리오) ([A-J]):/gmu)].map((match) => match[1]), [..."ABCDEFGHIJ"]);
      assert.ok(text.includes("alpha-aos-task"));
    }
  }
});

test("task entry documents link to existing files and contain no private host paths", async () => {
  const files = [...readmes, ...guides, "docs/task-entry-proof.md", "docs/task-runtime-controls.md"];
  for (const path of files) {
    const text = await readFile(join(root, path), "utf8");
    assertNoPrivatePaths(text, path);
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1]!.replace(/^<|>$/gu, "").split("#")[0]!;
      if (!target || /^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith("/")) continue;
      assert.ok(existsSync(resolve(dirname(join(root, path)), decodeURIComponent(target))), `${path}: broken relative link ${target}`);
    }
  }
  for (const path of ["docs/task-entry-proof-index.json", "docs/task-bootstrap-proof.md", "docs/task-style-proof.md", "docs/task-style-proof-index.json"]) {
    assertNoPrivatePaths(await readFile(join(root, path), "utf8"), path);
  }
});

test("task entry package contract requires 14 artifacts, preserves matrix and version", async () => {
  const url = pathToFileURL(join(root, "scripts/audit-tarball.mjs")).href;
  const audit = await import(url) as { REQUIRED_V060_ENTRIES: string[] };
  assert.equal(audit.REQUIRED_V060_ENTRIES.length, 14);
  for (const path of audit.REQUIRED_V060_ENTRIES) assert.ok(existsSync(join(root, path)), path);
  assert.equal(JSON.parse(await readFile(join(root, "package.json"), "utf8")).version, "0.6.0");
  const diff = spawnSync("git", ["diff", "--", "docs/SUPPORT_MATRIX.md"], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(diff.status, 0);
  assert.equal(diff.stdout, "");
});
