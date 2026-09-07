// Wave 2 executor for DETC-01 (D-04).
//
// Ignore-list membership decides what is scannable — not commit status, and not
// a hardcoded directory name. The same rule has to hold in a plain directory
// that is not a git repository at all, which is why no `git` subprocess may
// answer it. A pattern set the matcher could not fully take on is reported
// `undecidable` and never collapsed into `scannable`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { IgnoreDecision, IgnoreRuleSet } from "../src/core/ignore-list.js";
import {
  IGNORE_FILE_BYTE_CAP,
  IGNORE_PATTERN_COUNT_CAP,
  IGNORE_PATTERN_LENGTH_CAP,
  isIgnored,
  loadIgnoreRules,
} from "../src/core/ignore-list.js";

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
}

async function createRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-ignore-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true }));
  return root;
}

/** Real `git init`, reported rather than assumed — the suite must run without git too. */
function tryGitInit(root: string): boolean {
  const result = spawnSync("git", ["init", "--quiet"], { cwd: root, stdio: "ignore" });
  return result.status === 0 && existsSync(join(root, ".git"));
}

test("a listed path is ignored and an unlisted sibling is scannable", async (context) => {
  const root = await createRoot(context, "listed");
  await writeFile(join(root, ".gitignore"), "secrets.env\n", "utf8");
  await writeFile(join(root, "secrets.env"), "TOKEN=x\n", "utf8");
  await writeFile(join(root, "notes.md"), "# notes\n", "utf8");

  const stack = [await loadIgnoreRules(root)];
  const ignored = isIgnored("secrets.env", false, stack);
  assert.equal(ignored.decision, "ignored");
  assert.equal(ignored.pattern, "secrets.env");
  assert.equal(isIgnored("notes.md", false, stack).decision, "scannable");
});

test("an uncommitted, unignored file is scannable — commit status is never consulted", async (context) => {
  const root = await createRoot(context, "uncommitted");
  const initialized = tryGitInit(root);
  await writeFile(join(root, ".gitignore"), "*.log\n", "utf8");
  await writeFile(join(root, "fresh.ts"), "export const fresh = 1;\n", "utf8");
  await writeFile(join(root, "debug.log"), "noise\n", "utf8");

  if (initialized) {
    // Nothing was ever committed here, so `fresh.ts` is untracked by git.
    const status = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    assert.equal(status.stdout.includes("fresh.ts"), true);
  }

  const stack = [await loadIgnoreRules(root)];
  assert.equal(isIgnored("fresh.ts", false, stack).decision, "scannable");
  assert.equal(isIgnored("debug.log", false, stack).decision, "ignored");
});

test("the same .gitignore decides identically in a directory that is not a git repository", async (context) => {
  const patterns = "*.log\nbuild/\n!build/keep.txt\n";
  const probes: ReadonlyArray<readonly [string, boolean]> = [
    ["app.log", false],
    ["src/main.ts", false],
    ["build", true],
    ["build/keep.txt", false],
  ];

  const gitRoot = await createRoot(context, "git");
  const initialized = tryGitInit(gitRoot);
  await writeFile(join(gitRoot, ".gitignore"), patterns, "utf8");

  const plainRoot = await createRoot(context, "plain");
  await writeFile(join(plainRoot, ".gitignore"), patterns, "utf8");
  assert.equal(existsSync(join(plainRoot, ".git")), false);
  if (initialized) assert.equal(existsSync(join(gitRoot, ".git")), true);

  const gitStack = [await loadIgnoreRules(gitRoot)];
  const plainStack = [await loadIgnoreRules(plainRoot)];
  const gitDecisions: IgnoreDecision[] = probes.map(([path, dir]) => isIgnored(path, dir, gitStack).decision);
  const plainDecisions: IgnoreDecision[] = probes.map(([path, dir]) => isIgnored(path, dir, plainStack).decision);

  assert.deepEqual(plainDecisions, gitDecisions);
  // `build/keep.txt` is ignored despite `!build/keep.txt`: gitignore(5) says a
  // file cannot be re-included once a parent directory is excluded. Verified
  // against `git check-ignore -q` in a scratch repository with this exact
  // .gitignore, which reports build/keep.txt as ignored.
  assert.deepEqual(plainDecisions, ["ignored", "scannable", "ignored", "ignored"]);
});

test("a nested .gitignore takes precedence over a shallower one for paths beneath it", async (context) => {
  const root = await createRoot(context, "nested");
  await mkdir(join(root, "pkg"), { recursive: true });
  await writeFile(join(root, ".gitignore"), "*.tmp\n", "utf8");
  await writeFile(join(root, "pkg", ".gitignore"), "!keep.tmp\n", "utf8");

  const stack = [await loadIgnoreRules(root), await loadIgnoreRules(join(root, "pkg"))];
  assert.equal(isIgnored("pkg/keep.tmp", false, stack).decision, "scannable");
  assert.equal(isIgnored("pkg/other.tmp", false, stack).decision, "ignored");
  assert.equal(isIgnored("top.tmp", false, stack).decision, "ignored");
});

test("a negation re-includes a file whose parent directory is not itself excluded", async (context) => {
  const root = await createRoot(context, "negation");
  await writeFile(join(root, ".gitignore"), "*.log\n!important.log\n", "utf8");

  const stack = [await loadIgnoreRules(root)];
  assert.equal(isIgnored("important.log", false, stack).decision, "scannable");
  assert.equal(isIgnored("app.log", false, stack).decision, "ignored");
});

test("a .gitignore beyond the byte cap is undecidable rather than partially applied", async (context) => {
  const root = await createRoot(context, "bytecap");
  const line = "pattern-that-is-long-enough-to-fill\n";
  const body = line.repeat(Math.ceil((IGNORE_FILE_BYTE_CAP + 1) / line.length));
  assert.equal(Buffer.byteLength(body, "utf8") > IGNORE_FILE_BYTE_CAP, true);
  await writeFile(join(root, ".gitignore"), body, "utf8");

  const ruleSet = await loadIgnoreRules(root);
  assert.equal(ruleSet.undecidable.length > 0, true);
  assert.equal(ruleSet.patterns.length, 0);
  assert.equal(ruleSet.undecidable.some((reason) => reason.includes("byte-cap")), true);

  // Fail-closed: an undecidable rule set must never be reported as not-ignored.
  const verdict = isIgnored("anything.ts", false, [ruleSet]);
  assert.equal(verdict.decision, "undecidable");
  assert.notEqual(verdict.pattern, null);
});

test("a .gitignore beyond the pattern-count cap is undecidable and names the cap", async (context) => {
  const root = await createRoot(context, "countcap");
  const lines: string[] = ["# a comment is not a pattern", ""];
  for (let index = 0; index <= IGNORE_PATTERN_COUNT_CAP; index += 1) lines.push(`p${index}.tmp`);
  await writeFile(join(root, ".gitignore"), `${lines.join("\n")}\n`, "utf8");

  const ruleSet = await loadIgnoreRules(root);
  assert.equal(ruleSet.patterns.length, 0);
  assert.equal(ruleSet.undecidable.some((reason) => reason.includes("pattern-count-cap")), true);
  assert.equal(ruleSet.undecidable.some((reason) => reason.includes(String(IGNORE_PATTERN_COUNT_CAP))), true);
  assert.equal(isIgnored("p0.tmp", false, [ruleSet]).decision, "undecidable");
});

test("an over-long pattern is reported by shape — construct and length, never its text", async (context) => {
  const root = await createRoot(context, "lengthcap");
  const hostile = `${"s".repeat(IGNORE_PATTERN_LENGTH_CAP + 1)}ecret`;
  await writeFile(join(root, ".gitignore"), `notes.md\n${hostile}\n`, "utf8");

  const ruleSet = await loadIgnoreRules(root);
  assert.equal(ruleSet.undecidable.length, 1);
  const reason = ruleSet.undecidable[0] ?? "";
  assert.equal(reason.includes("pattern-length-cap"), true);
  assert.equal(reason.includes(String(hostile.length)), true);
  assert.equal(reason.includes(hostile), false);
  assert.equal(reason.includes("ssss"), false);

  // The surviving pattern is not applied on its own — the set is incomplete.
  assert.equal(isIgnored("notes.md", false, [ruleSet]).decision, "undecidable");
});

test("a deliberately un-ignored build directory stays scannable — membership decides, not the name", async (context) => {
  const root = await createRoot(context, "buildname");
  await writeFile(join(root, ".gitignore"), "node_modules/\n", "utf8");

  const stack = [await loadIgnoreRules(root)];
  assert.equal(isIgnored("build", true, stack).decision, "scannable");
  assert.equal(isIgnored("build/artifact.js", false, stack).decision, "scannable");
  assert.equal(isIgnored("node_modules", true, stack).decision, "ignored");
  assert.equal(isIgnored("node_modules/pkg/index.js", false, stack).decision, "ignored");
});

test("a missing .gitignore yields an empty rule set rather than an error", async (context) => {
  const root = await createRoot(context, "missing");
  const ruleSet: IgnoreRuleSet = await loadIgnoreRules(root);

  assert.deepEqual(ruleSet.patterns, []);
  assert.deepEqual(ruleSet.undecidable, []);
  assert.equal(isIgnored("src/main.ts", false, [ruleSet]).decision, "scannable");
});
