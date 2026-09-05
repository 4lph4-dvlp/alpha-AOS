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

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compiledTestRoot = join(repositoryRoot, "dist", "test");

/** Names npm sets on a lifecycle child, by prefix and by exact name. */
const INJECTED_PREFIX = /^npm_(config|package|lifecycle)_/iu;
const INJECTED_NAMES = new Set(["npm_execpath", "npm_command", "npm_node_execpath"]);

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

const files = await compiledTestFiles();
if (files.length === 0) {
  process.stderr.write(
    `no compiled test files found in dist/test\n` +
      `Looked in ${compiledTestRoot}. An empty test set is a failure, not a pass: ` +
      `run \`npm run build\` first, and if it produced nothing the suite has stopped being compiled.\n`,
  );
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", ...process.argv.slice(2), ...files], {
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
