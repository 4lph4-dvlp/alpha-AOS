#!/usr/bin/env node
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { listTarballFiles } from "./audit-tarball.mjs";

const TAR_BLOCK_BYTES = 512;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_PROVENANCE_BYTES = 16 * 1024;
const BUILD_MANIFEST_PATH = "dist/build-artifact.json";
const STACK_LOCK_PATH = "catalog/stack.lock.json";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export function computeFileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function plainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readValidatedArchive(tarballPath, expectedTarballSha256 = null) {
  const files = listTarballFiles(tarballPath);
  const compressed = readFileSync(tarballPath);
  if (expectedTarballSha256 !== null && sha256(compressed) !== expectedTarballSha256) {
    throw new Error("tarball changed while provenance was being verified");
  }
  const archive = gunzipSync(compressed, { maxOutputLength: MAX_ARCHIVE_BYTES });
  const contents = new Map();
  let fileIndex = 0;
  let offset = 0;
  while (offset + TAR_BLOCK_BYTES <= archive.length) {
    const header = archive.subarray(offset, offset + TAR_BLOCK_BYTES);
    if (header.every((byte) => byte === 0)) break;
    const typeFlag = String.fromCharCode(header[156] ?? 0);
    if (typeFlag === "5") {
      offset += TAR_BLOCK_BYTES;
      continue;
    }
    const file = files[fileIndex];
    if (file === undefined) throw new Error("validated tar entry index is inconsistent");
    const dataStart = offset + TAR_BLOCK_BYTES;
    const dataEnd = dataStart + file.size;
    contents.set(file.path, Buffer.from(archive.subarray(dataStart, dataEnd)));
    offset = dataStart + Math.ceil(file.size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
    fileIndex += 1;
  }
  if (fileIndex !== files.length) throw new Error("validated tar entry count is inconsistent");
  return { files, contents };
}

function requiredArchiveEntry(archive, path) {
  const bytes = archive.contents.get(path);
  if (bytes === undefined) throw new Error(`tarball is missing required entry ${path}`);
  return bytes;
}

function parseJsonEntry(bytes, path) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}

function validateBuildManifest(archive) {
  const bytes = requiredArchiveEntry(archive, BUILD_MANIFEST_PATH);
  const manifest = parseJsonEntry(bytes, BUILD_MANIFEST_PATH);
  if (manifest?.schemaVersion !== 1 || !plainObject(manifest.inputs) || !plainObject(manifest.outputs)) {
    throw new Error(`${BUILD_MANIFEST_PATH} is malformed or uses an unknown schema`);
  }
  for (const group of [manifest.inputs, manifest.outputs]) {
    for (const [path, digest] of Object.entries(group)) {
      if (typeof path !== "string" || typeof digest !== "string" || !SHA256_PATTERN.test(digest)) {
        throw new Error(`${BUILD_MANIFEST_PATH} contains an invalid SHA-256 record`);
      }
    }
  }

  const packagedOutputs = archive.files
    .map((entry) => entry.path)
    .filter((path) => path.startsWith("dist/") && path !== BUILD_MANIFEST_PATH);
  if (packagedOutputs.length === 0) throw new Error(`${BUILD_MANIFEST_PATH} has no packaged build outputs to verify`);
  for (const path of packagedOutputs) {
    const expected = manifest.outputs[path];
    if (typeof expected !== "string") throw new Error(`build artifact manifest does not record packaged output ${path}`);
    const actual = sha256(requiredArchiveEntry(archive, path));
    if (actual !== expected) {
      throw new Error(`changed build output ${path}: build artifact SHA-256 mismatch`);
    }
  }
  return bytes;
}

function validateStableLock(archive) {
  const bytes = requiredArchiveEntry(archive, STACK_LOCK_PATH);
  const lock = parseJsonEntry(bytes, STACK_LOCK_PATH);
  if (lock?.schemaVersion !== 1 || lock.channel !== "stable" || !plainObject(lock.components)) {
    throw new Error(`${STACK_LOCK_PATH} is not a schemaVersion 1 stable lock`);
  }
  let lockedPackageCount = 0;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!plainObject(value)) return;
    if (Object.hasOwn(value, "package")) {
      if (typeof value.package !== "string" || value.package.length === 0
        || typeof value.version !== "string" || value.version.length === 0
        || typeof value.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(value.integrity)) {
        throw new Error(`${STACK_LOCK_PATH} contains an unpinned package record`);
      }
      lockedPackageCount += 1;
    }
    for (const nested of Object.values(value)) visit(nested);
  };
  visit(lock.components);
  if (lockedPackageCount === 0) throw new Error(`${STACK_LOCK_PATH} contains no integrity-pinned packages`);
  return bytes;
}

function expectedBundleRecords(tarballPath) {
  return [basename(tarballPath), BUILD_MANIFEST_PATH, STACK_LOCK_PATH];
}

function parseProvenanceBundle(sha256Path, tarballPath) {
  if (!existsSync(sha256Path)) throw new Error(`provenance bundle is missing: ${sha256Path}`);
  const size = statSync(sha256Path).size;
  if (size > MAX_PROVENANCE_BYTES) throw new Error(`provenance bundle exceeds ${MAX_PROVENANCE_BYTES} bytes`);
  const records = new Map();
  for (const line of readFileSync(sha256Path, "utf8").split(/\r?\n/u)) {
    if (line.trim().length === 0) continue;
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/u.exec(line);
    if (match === null) throw new Error("provenance bundle contains a malformed SHA-256 record");
    const name = match[2]?.trim() ?? "";
    if (records.has(name)) throw new Error(`provenance bundle contains duplicate record ${name}`);
    records.set(name, match[1]?.toLowerCase());
  }
  const required = expectedBundleRecords(tarballPath);
  if (records.size !== required.length || required.some((name) => !records.has(name))) {
    throw new Error(`provenance bundle must contain exactly: ${required.join(", ")}`);
  }
  return records;
}

function validateInternalRecords(archive, records) {
  const buildManifest = validateBuildManifest(archive);
  const stackLock = validateStableLock(archive);
  for (const [path, bytes] of [[BUILD_MANIFEST_PATH, buildManifest], [STACK_LOCK_PATH, stackLock]]) {
    const actual = sha256(bytes);
    const expected = records.get(path);
    if (actual !== expected) throw new Error(`${path} SHA-256 mismatch (expected ${expected}, actual ${actual})`);
  }
}

export function createProvenanceBundle(tarballPath, sha256Path = `${tarballPath}.sha256`) {
  const resolvedTarball = resolve(tarballPath);
  if (!existsSync(resolvedTarball)) throw new Error(`tarball is missing: ${resolvedTarball}`);
  const tarballSha256 = computeFileSha256(resolvedTarball);
  const archive = readValidatedArchive(resolvedTarball, tarballSha256);
  const buildManifest = validateBuildManifest(archive);
  const stackLock = validateStableLock(archive);
  const body = [
    `${tarballSha256}  ${basename(resolvedTarball)}`,
    `${sha256(buildManifest)}  ${BUILD_MANIFEST_PATH}`,
    `${sha256(stackLock)}  ${STACK_LOCK_PATH}`,
    "",
  ].join("\n");
  writeFileSync(resolve(sha256Path), body, { encoding: "utf8", mode: 0o600 });
  return resolve(sha256Path);
}

export function verifyProvenance(tarballPath, sha256Path = `${tarballPath}.sha256`) {
  try {
    const resolvedTarball = resolve(tarballPath);
    const resolvedBundle = resolve(sha256Path);
    if (!existsSync(resolvedTarball)) throw new Error(`tarball is missing: ${resolvedTarball}`);
    const records = parseProvenanceBundle(resolvedBundle, resolvedTarball);
    const actualTarballSha256 = computeFileSha256(resolvedTarball);
    const expectedTarballSha256 = records.get(basename(resolvedTarball));
    if (actualTarballSha256 !== expectedTarballSha256) {
      throw new Error(`tarball SHA-256 mismatch (expected ${expectedTarballSha256}, actual ${actualTarballSha256})`);
    }
    const archive = readValidatedArchive(resolvedTarball, actualTarballSha256);
    validateInternalRecords(archive, records);
    process.stdout.write(`Provenance verified: ${basename(resolvedTarball)} SHA-256 ${actualTarballSha256}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Provenance verification FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }
}

function runCli(args) {
  if (args[0] === "--write") {
    if (args.length < 2 || args.length > 3) {
      process.stderr.write("Usage: node scripts/verify-provenance.mjs --write <tarball> [sha256-path]\n");
      return 2;
    }
    try {
      const path = createProvenanceBundle(args[1], args[2]);
      process.stdout.write(`Provenance bundle written: ${path}\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`Provenance bundle generation FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
      return 3;
    }
  }
  if (args.length < 1 || args.length > 2) {
    process.stderr.write("Usage: node scripts/verify-provenance.mjs <tarball> [sha256-path]\n");
    return 2;
  }
  return verifyProvenance(args[0], args[1]);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) process.exitCode = runCli(process.argv.slice(2));
