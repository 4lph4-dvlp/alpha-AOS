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
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { IgnoreDecision, IgnoreRuleSet } from "../src/core/ignore-list.js";
import {
  IGNORE_FILE_BYTE_CAP,
  IGNORE_NOTE_COUNT_CAP,
  IGNORE_PATTERN_COUNT_CAP,
  IGNORE_PATTERN_LENGTH_CAP,
  isIgnored,
  loadIgnoreRules,
} from "../src/core/ignore-list.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
}

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Mirrors `runCli` in test/preview.test.ts. The end-to-end assertion below has
 * to run the built CLI rather than the module, because the defect it closes was
 * invisible for exactly as long as this seam was only ever tested one layer
 * down: the module reported `undecidable` honestly and the whole scan went
 * quiet.
 */
function runCli(args: readonly string[], cwd: string = repositoryRoot): RunResult {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

async function createRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-ignore-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true }));
  return root;
}

/**
 * A real project whose root `.gitignore` is valid apart from one line past
 * `IGNORE_PATTERN_LENGTH_CAP`. The evidence that decides `WEB_REACT` — a
 * `package.json` declaring `react` and a `src/` tree — is deliberately NOT
 * matched by any of the 500 valid patterns, so anything other than a selection
 * means the over-long line blinded the scan.
 */
async function partialIgnoreFixture(context: TestContext): Promise<string> {
  const root = await createRoot(context, "partial");
  const lines: string[] = [];
  for (let index = 0; index < 500; index += 1) lines.push(`p${index}.tmp`);
  lines.push("z".repeat(IGNORE_PATTERN_LENGTH_CAP + 976));
  await writeFile(join(root, ".gitignore"), `${lines.join("\n")}\n`, "utf8");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "partial-ignore-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "export const app = 1;\n", "utf8");
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
  // One line that could not be compiled is a NOTE, not an undecidable file:
  // the rest of the file is still the repository's own complete rule set.
  assert.deepEqual(ruleSet.undecidable, []);
  assert.equal(ruleSet.notes.length, 1);
  const reason = ruleSet.notes[0] ?? "";
  assert.equal(reason.includes("pattern-length-cap"), true);
  assert.equal(reason.includes(String(hostile.length)), true);
  assert.equal(reason.includes(hostile), false);
  assert.equal(reason.includes("ssss"), false);

  // The patterns that DID compile keep answering — one bad line must not make
  // a whole subtree unscannable (02-REVIEW WR-05).
  assert.equal(isIgnored("notes.md", false, [ruleSet]).decision, "ignored");
  assert.equal(isIgnored("keep.md", false, [ruleSet]).decision, "scannable");
});

test("an over-long line leaves the remaining patterns deciding, and is reported as a bounded note", async (context) => {
  const root = await createRoot(context, "partialrules");
  const lines: string[] = [];
  for (let index = 0; index < 500; index += 1) lines.push(`p${index}.tmp`);
  lines.push("z".repeat(IGNORE_PATTERN_LENGTH_CAP + 976));
  await writeFile(join(root, ".gitignore"), `${lines.join("\n")}\n`, "utf8");

  const ruleSet = await loadIgnoreRules(root);
  assert.equal(ruleSet.patterns.length, 500);
  assert.equal(ruleSet.notes.length > 0, true);
  assert.deepEqual(ruleSet.undecidable, []);

  const decided = isIgnored("p7.tmp", false, [ruleSet]);
  assert.equal(decided.decision, "ignored");
  assert.equal(isIgnored("src/index.ts", false, [ruleSet]).decision, "scannable");
});

test("a hostile .gitignore of over-long lines produces a bounded note list, not an unbounded one", async (context) => {
  const root = await createRoot(context, "notecap");
  const hostile = "q".repeat(IGNORE_PATTERN_LENGTH_CAP + 1);
  const lines: string[] = ["notes.md"];
  for (let index = 0; index < IGNORE_NOTE_COUNT_CAP + 50; index += 1) lines.push(hostile);
  await writeFile(join(root, ".gitignore"), `${lines.join("\n")}\n`, "utf8");

  const ruleSet = await loadIgnoreRules(root);
  assert.equal(ruleSet.notes.length <= IGNORE_NOTE_COUNT_CAP + 1, true);
  assert.equal(ruleSet.notes.some((note) => note.includes("note-count-cap")), true);
  assert.deepEqual(ruleSet.undecidable, []);
  assert.equal(isIgnored("notes.md", false, [ruleSet]).decision, "ignored");
});

test("the pattern-count cap accepts the file at the cap and refuses the one past it", async (context) => {
  const atCapRoot = await createRoot(context, "atcap");
  const atCap: string[] = [];
  for (let index = 0; index < IGNORE_PATTERN_COUNT_CAP; index += 1) atCap.push(`c${index}.tmp`);
  await writeFile(join(atCapRoot, ".gitignore"), `${atCap.join("\n")}\n`, "utf8");

  const accepted = await loadIgnoreRules(atCapRoot);
  assert.equal(accepted.patterns.length, IGNORE_PATTERN_COUNT_CAP);
  assert.deepEqual(accepted.undecidable, []);

  const pastCapRoot = await createRoot(context, "pastcap");
  await writeFile(join(pastCapRoot, ".gitignore"), `${[...atCap, "one-too-many.tmp"].join("\n")}\n`, "utf8");

  const refused = await loadIgnoreRules(pastCapRoot);
  assert.equal(refused.patterns.length, 0);
  assert.equal(refused.undecidable.some((reason) => reason.includes("pattern-count-cap")), true);
  // The number in the refusal is the number that decided.
  assert.equal(refused.undecidable.some((reason) => reason.includes(String(IGNORE_PATTERN_COUNT_CAP))), true);
});

test("a leading # escaped with a backslash names a file whose name begins with #", async (context) => {
  const root = await createRoot(context, "escapedhash");
  const gitignore = "\\#literal.md\n# an ordinary comment\nnotes.md\n";
  await writeFile(join(root, ".gitignore"), gitignore, "utf8");
  await writeFile(join(root, "#literal.md"), "literal\n", "utf8");

  const ruleSet = await loadIgnoreRules(root);
  // The unescaped comment is dropped; the escaped line survives VERBATIM,
  // because the escape belongs to the matcher's grammar. Stripping it would
  // hand `#literal.md` over, which the matcher discards as a comment.
  assert.deepEqual(ruleSet.patterns, ["\\#literal.md", "notes.md"]);
  assert.deepEqual(ruleSet.undecidable, []);
  assert.deepEqual(ruleSet.notes, []);

  // The observable contract: the file whose name begins with `#` is ignored.
  assert.equal(isIgnored("#literal.md", false, [ruleSet]).decision, "ignored");
  assert.equal(isIgnored("other.md", false, [ruleSet]).decision, "scannable");

  // Cross-checked against the authority this module claims to match, where the
  // host has it. A disagreement here is the regression, not the assertion.
  if (tryGitInit(root)) {
    const escaped = spawnSync("git", ["check-ignore", "-q", "#literal.md"], { cwd: root, stdio: "ignore" });
    assert.equal(escaped.status, 0, "git check-ignore must also report #literal.md as ignored");
  }
});

test("an unescaped leading # is a comment for this parser and for git alike", async (context) => {
  const root = await createRoot(context, "hashcomment");
  await writeFile(join(root, ".gitignore"), "#literal.md\n", "utf8");
  await writeFile(join(root, "#literal.md"), "literal\n", "utf8");

  const ruleSet = await loadIgnoreRules(root);
  assert.deepEqual(ruleSet.patterns, []);
  assert.equal(isIgnored("#literal.md", false, [ruleSet]).decision, "scannable");

  if (tryGitInit(root)) {
    const unescaped = spawnSync("git", ["check-ignore", "-q", "#literal.md"], { cwd: root, stdio: "ignore" });
    assert.equal(unescaped.status, 1, "git check-ignore must report #literal.md as NOT ignored");
  }
});

test("an over-long .gitignore line does not blind the scan — the CLI still selects the packs the evidence supports", async (context) => {
  const root = await partialIgnoreFixture(context);
  assert.ok(existsSync(cliEntry), `CLI entry must be built before this suite runs: ${cliEntry}`);

  const result = runCli(["project", "plan", root, "--json"]);
  assert.equal(result.status, 0, result.stderr);

  const plan = JSON.parse(result.stdout) as { selected: string[] };
  assert.equal(
    plan.selected.includes("WEB_REACT"),
    true,
    `one over-long .gitignore line made the whole subtree unscannable; selected=${JSON.stringify(plan.selected)}`,
  );
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
