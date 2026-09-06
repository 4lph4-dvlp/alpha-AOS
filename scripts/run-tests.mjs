#!/usr/bin/env node
// Runs the compiled test suite outside npm's lifecycle environment.
//
// npm injects its own configuration into the environment of every script it
// launches through a lifecycle, and some of those names decide where a child
// writes. `npm_config_cache` is the one that matters here: npm writes a debug
// log into its cache directory for every invocation, including a read-only
// query, and on POSIX the cache default is always derived from the user's
// home. A suite launched by `npm test` therefore observes npm children
// writing into an inherited cache, while the same suite launched as a bare
// `node --test` observes them writing into the user's home — which is what a
// user actually gets.
//
// That divergence hid a real safety-boundary violation. In CI run
// 33937610401, `npm test` reported 190 passing and 0 failing while the very
// same job's `Safety boundary suites` step, running the same compiled files
// with a bare `node --test`, reported 4 failures. The honest signal came from
// the step without npm in front of it.
//
// This script removes the difference: it strips npm's lifecycle injection and
// hands the test process the same environment either entry point would give.
//
// It also refuses to run an empty test set. The previous `dist/test/*.test.js`
// shell glob could expand to nothing and still exit 0, so a suite that
// silently stopped being built would have looked green.
//
// `--files` exists because only half of that repair was ever wired. Routing
// was applied to `package.json`, so `npm test` came through here, but the
// `Safety boundary suites` step in .github/workflows/ci.yml still reached
// `node --test` directly — because this script could only enumerate the whole
// of `dist/test`, and that step names a ten-file subset. The windows-latest
// runner image sets `npm_config_prefix` at MACHINE scope, so on that leg npm
// never has to be in front of a command for the name to be present, and
// nothing stripped it from the step that bypassed this runner. In CI run
// 33984247757, inside one windows-latest job, the `npm test` step reported
// `fail 0` while the `Safety boundary suites` step reported `fail 1` on
// `the test runner environment carries no npm lifecycle injection` with
// `actual: ['npm_config_prefix']` — same commit, same compiled files, opposite
// verdicts, with the primary gate the greener one. `--files` lets the CI step
// express its subset through this script, so both entry points observe one
// environment again.
//
// `init_cwd` is in the exact-name set below for the same class of reason: npm
// sets it on a lifecycle child and nothing else does, and the prefix regex
// does not reach it, so a name the scrubber never listed is exactly the shape
// RC-5 already took once. `NODE` and `COLOR` are deliberately NOT scrubbed —
// they are not npm-namespaced, `NODE` is legitimately useful to a child, and
// widening the scrub set on a guess is how a repair becomes a second defect.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiledTestRoot = join(repositoryRoot, "dist", "test");

/** Names npm sets on a lifecycle child, by prefix and by exact name. */
const INJECTED_PREFIX = /^npm_(config|package|lifecycle)_/iu;
const INJECTED_NAMES = new Set(["npm_execpath", "npm_command", "npm_node_execpath", "init_cwd"]);

function scrubbedEnvironment(source) {
  const result = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (INJECTED_PREFIX.test(name)) continue;
    if (INJECTED_NAMES.has(name.toLowerCase())) continue;
    result[name] = value;
  }
  return result;
}

async function compiledTestFiles() {
  let listing;
  try {
    listing = await readdir(compiledTestRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return listing
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
    .map((entry) => join(compiledTestRoot, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Splits the argument vector at the terminal `--files` marker: everything
 * before it is a flag forwarded to `node --test`, everything after it is a
 * compiled test file path.
 *
 * `--files` is terminal by design, so a second `--files` token later in the
 * list is simply a path — and, being a path that was never built, it fails the
 * existence check loudly instead of silently re-splitting the vector.
 *
 * `files: null` means the marker was absent, which keeps the behaviour every
 * caller had before `--files` existed: enumerate `dist/test` here.
 */
function namedTestFiles(argv) {
  const marker = argv.indexOf("--files");
  if (marker === -1) return { flags: argv, files: null };
  return { flags: argv.slice(0, marker), files: argv.slice(marker + 1) };
}

const { flags, files: named } = namedTestFiles(process.argv.slice(2));

let files;
if (named === null) {
  files = await compiledTestFiles();
  if (files.length === 0) {
    process.stderr.write(
      `no compiled test files found in dist/test\n` +
        `Looked in ${compiledTestRoot}. An empty test set is a failure, not a pass: ` +
        `run \`npm run build\` first, and if it produced nothing the suite has stopped being compiled.\n`,
    );
    process.exit(1);
  }
} else {
  if (named.length === 0) {
    process.stderr.write(
      `--files was given with no paths after it\n` +
        `An explicit empty file set is a failure, not a pass, for the same reason an empty ` +
        `dist/test/*.test.js glob was: a run that names nothing proves nothing. Name the compiled ` +
        `test files to run, or omit --files to enumerate dist/test.\n`,
    );
    process.exit(1);
  }
  // Resolved against the repository root, and deliberately NOT sorted: the
  // order the caller gives is declared, not incidental.
  const requested = named.map((name) => ({ name, path: resolve(repositoryRoot, name) }));
  const missing = requested.filter((entry) => !existsSync(entry.path));
  if (missing.length > 0) {
    process.stderr.write(
      `named test files that were not built:\n` +
        missing.map((entry) => `  ${entry.name} (resolved: ${entry.path})\n`).join("") +
        `A named file that is missing is a loud failure, never a shorter-but-green run. This is ` +
        `strictly stronger than the shell glob it replaces: a suite that silently stops being ` +
        `compiled goes red on every leg instead of quietly absent. Run \`npm run build\` first.\n`,
    );
    process.exit(1);
  }
  files = requested.map((entry) => entry.path);
}

const child = spawn(process.execPath, ["--test", ...flags, ...files], {
  cwd: repositoryRoot,
  stdio: "inherit",
  env: scrubbedEnvironment(process.env),
  shell: false,
  windowsHide: true,
});

child.once("error", (error) => {
  process.stderr.write(`failed to launch the test process: ${error.message}\n`);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal !== null) {
    process.stderr.write(`the test process was terminated by ${signal}\n`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
