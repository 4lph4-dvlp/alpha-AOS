#!/usr/bin/env node
// Writes and verifies the record that names exactly which sources a build was
// produced from and exactly which files it produced.
//
// The wrappers use `check` as their only prerequisite: an install or update
// runs from an artifact whose provenance is proven, or it refuses. Nothing
// here builds anything — `write` is the last step of a build that already ran.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join("dist", "build-artifact.json");

/** Everything the TypeScript build consumes, and nothing else. */
const INPUT_ROOTS = ["src", "test"];
const INPUT_FILES = ["tsconfig.json", "package.json", "package-lock.json"];
/** Everything it emits. */
const OUTPUT_ROOTS = ["dist"];

/** Repo-relative, POSIX-separated, so a manifest is identical on every OS. */
function key(absolute) {
  return relative(repositoryRoot, absolute).split(sep).join("/");
}

async function walk(root) {
  const absoluteRoot = join(repositoryRoot, root);
  if (!existsSync(absoluteRoot)) return [];
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) found.push(absolute);
    }
  }
  await visit(absoluteRoot);
  return found;
}

async function hash(absolute) {
  return createHash("sha256").update(await readFile(absolute)).digest("hex");
}

/** Sorted, so the same tree always produces the same document. */
async function table(paths) {
  const entries = [];
  for (const absolute of [...paths].sort()) {
    const name = key(absolute);
    // The manifest cannot describe itself: its own bytes depend on the result.
    if (name === MANIFEST.split(sep).join("/")) continue;
    entries.push([name, await hash(absolute)]);
  }
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return Object.fromEntries(entries);
}

async function collect() {
  const inputPaths = [];
  for (const root of INPUT_ROOTS) inputPaths.push(...await walk(root));
  for (const file of INPUT_FILES) {
    const absolute = join(repositoryRoot, file);
    if (existsSync(absolute)) inputPaths.push(absolute);
  }
  const outputPaths = [];
  for (const root of OUTPUT_ROOTS) outputPaths.push(...await walk(root));
  return { inputs: await table(inputPaths), outputs: await table(outputPaths) };
}

async function write() {
  const { inputs, outputs } = await collect();
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputs,
    outputs,
  };
  const target = join(repositoryRoot, MANIFEST);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(`build artifact manifest written: ${MANIFEST} (${Object.keys(inputs).length} inputs, ${Object.keys(outputs).length} outputs)\n`);
}

async function check() {
  const target = join(repositoryRoot, MANIFEST);
  if (!existsSync(target)) {
    process.stderr.write(`alpha-aos: no build artifact manifest at ${MANIFEST}; run npm run build first.\n`);
    return 3;
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(target, "utf8"));
  } catch {
    process.stderr.write(`alpha-aos: the build artifact manifest is unreadable: ${MANIFEST}\n`);
    return 3;
  }
  if (manifest?.schemaVersion !== 1 || typeof manifest.inputs !== "object" || typeof manifest.outputs !== "object") {
    process.stderr.write(`alpha-aos: the build artifact manifest is malformed or from an unknown version: ${MANIFEST}\n`);
    return 3;
  }

  const problems = [];
  for (const group of ["inputs", "outputs"]) {
    for (const [name, expected] of Object.entries(manifest[group])) {
      const absolute = join(repositoryRoot, name);
      if (!existsSync(absolute)) problems.push(`missing ${group.slice(0, -1)}: ${name}`);
      else if (await hash(absolute) !== expected) problems.push(`changed ${group.slice(0, -1)}: ${name}`);
    }
  }
  if (problems.length > 0) {
    process.stderr.write(`alpha-aos: the build artifact does not match its manifest (${problems.length} difference(s)).\n`);
    // Bounded: enough to act on, not a dump of the whole tree.
    for (const problem of problems.slice(0, 10)) process.stderr.write(`  ${problem}\n`);
    if (problems.length > 10) process.stderr.write(`  …and ${problems.length - 10} more.\n`);
    process.stderr.write("Run npm run build to rebuild from the current sources.\n");
    return 3;
  }
  process.stdout.write(`build artifact verified: ${Object.keys(manifest.inputs).length} inputs, ${Object.keys(manifest.outputs).length} outputs\n`);
  return 0;
}

const mode = process.argv[2] ?? "";
if (mode === "write") {
  await write();
} else if (mode === "check") {
  process.exitCode = await check();
} else {
  process.stderr.write("Usage: node scripts/build-artifact.mjs write|check\n");
  process.exitCode = 2;
}
