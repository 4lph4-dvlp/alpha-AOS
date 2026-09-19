#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const TAR_BLOCK_BYTES = 512;
const TAR_END_BYTES = TAR_BLOCK_BYTES * 2;
const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_COUNT = 20_000;
const MAX_PATH_BYTES = 255;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isZeroBlock(block) {
  return block.every((byte) => byte === 0);
}

function decodeStringField(header, start, length, label) {
  const field = header.subarray(start, start + length);
  const nul = field.indexOf(0);
  const bytes = nul === -1 ? field : field.subarray(0, nul);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Malformed tar ${label}: invalid UTF-8`);
  }
}

function parseOctalField(header, start, length, label) {
  const field = header.subarray(start, start + length);
  if ((field[0] ?? 0) >= 0x80) throw new Error(`Malformed tar ${label}: base-256 values are unsupported`);
  const value = field.toString("ascii").replace(/[\0 ]+$/u, "").trimStart();
  if (!/^[0-7]+$/u.test(value)) throw new Error(`Malformed tar ${label}: expected an octal integer`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Malformed tar ${label}: value is outside the safe integer range`);
  }
  return parsed;
}

function headerChecksum(header) {
  let sum = 0;
  for (let index = 0; index < TAR_BLOCK_BYTES; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
  }
  return sum;
}

function unsafePathReason(path) {
  if (typeof path !== "string" || path.length === 0) return "path is empty";
  if (Buffer.byteLength(path, "utf8") > MAX_PATH_BYTES) return `path exceeds ${MAX_PATH_BYTES} UTF-8 bytes`;
  if (path.includes("\\")) return "backslashes are not valid POSIX tar separators";
  if (isAbsolute(path) || path.startsWith("/") || /^[A-Za-z]:/u.test(path)) return "absolute paths are forbidden";
  if (/[\0-\x1f\x7f]/u.test(path)) return "control characters are forbidden";
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "empty, dot, and parent path segments are forbidden";
  }
  return null;
}

function archivePath(header) {
  const name = decodeStringField(header, 0, 100, "entry name");
  const magic = header.subarray(257, 263).toString("ascii");
  if (!magic.startsWith("ustar")) throw new Error("Malformed tar header: only POSIX ustar archives are supported");
  const prefix = decodeStringField(header, 345, 155, "entry prefix");
  const rawPath = prefix ? `${prefix}/${name}` : name;
  const reason = unsafePathReason(rawPath);
  if (reason !== null) throw new Error(`Unsafe tar entry path ${JSON.stringify(rawPath)}: ${reason}`);
  const cleanPath = rawPath.startsWith("package/") ? rawPath.slice("package/".length) : rawPath;
  const cleanReason = unsafePathReason(cleanPath);
  if (cleanReason !== null) throw new Error(`Unsafe tar entry path ${JSON.stringify(rawPath)}: ${cleanReason}`);
  return cleanPath;
}

/**
 * Decodes a bounded gzip-compressed POSIX ustar archive using Node.js only.
 * Every header and entry boundary is validated before advancing.
 *
 * @param {string} tarballPath
 * @returns {Array<{ path: string, size: number }>}
 */
export function listTarballFiles(tarballPath) {
  const compressedSize = statSync(tarballPath).size;
  if (compressedSize > MAX_COMPRESSED_BYTES) {
    throw new Error(`Compressed tarball exceeds the ${MAX_COMPRESSED_BYTES}-byte limit`);
  }
  let archive;
  try {
    archive = gunzipSync(readFileSync(tarballPath), { maxOutputLength: MAX_ARCHIVE_BYTES });
  } catch (error) {
    throw new Error(`Tarball gzip decompression failed or exceeded the ${MAX_ARCHIVE_BYTES}-byte limit: ${error instanceof Error ? error.message : String(error)}`);
  }

  const files = [];
  const seenPaths = new Set();
  let offset = 0;
  let entryCount = 0;
  let terminated = false;
  while (offset < archive.length) {
    if (archive.length - offset < TAR_BLOCK_BYTES) throw new Error(`Truncated tar header at byte ${offset}`);
    const header = archive.subarray(offset, offset + TAR_BLOCK_BYTES);
    if (isZeroBlock(header)) {
      if (archive.length - offset < TAR_END_BYTES) {
        throw new Error("Tar end-of-archive marker is truncated; two zero blocks are required");
      }
      const second = archive.subarray(offset + TAR_BLOCK_BYTES, offset + TAR_END_BYTES);
      if (!isZeroBlock(second)) {
        throw new Error("Malformed tar terminator: first zero block is not followed by a second zero block");
      }
      if (!archive.subarray(offset + TAR_END_BYTES).every((byte) => byte === 0)) {
        throw new Error("Malformed tar archive: non-zero data follows the end-of-archive marker");
      }
      terminated = true;
      break;
    }

    entryCount += 1;
    if (entryCount > MAX_ENTRY_COUNT) throw new Error(`Tar archive exceeds the ${MAX_ENTRY_COUNT}-entry limit`);
    const expectedChecksum = parseOctalField(header, 148, 8, "checksum");
    const actualChecksum = headerChecksum(header);
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Malformed tar header checksum at byte ${offset}: expected ${expectedChecksum}, got ${actualChecksum}`);
    }

    const path = archivePath(header);
    const size = parseOctalField(header, 124, 12, "entry size");
    if (size > MAX_ENTRY_BYTES) {
      throw new Error(`Tar entry ${path} exceeds the ${MAX_ENTRY_BYTES}-byte per-entry size limit`);
    }
    const typeFlag = String.fromCharCode(header[156] ?? 0);
    if (typeFlag !== "0" && typeFlag !== "\0" && typeFlag !== "5") {
      throw new Error(`Unsupported or dangerous tar entry type ${JSON.stringify(typeFlag)} for ${path}`);
    }
    if (typeFlag === "5" && size !== 0) throw new Error(`Malformed tar directory entry ${path}: directory size must be zero`);

    const dataStart = offset + TAR_BLOCK_BYTES;
    const dataEnd = dataStart + size;
    const paddedEnd = dataStart + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
    if (!Number.isSafeInteger(paddedEnd) || dataEnd > archive.length || paddedEnd > archive.length) {
      throw new Error(`Truncated tar entry ${path}: declared ${size} bytes extend beyond the archive`);
    }
    if (typeFlag === "0" || typeFlag === "\0") {
      const collisionKey = path.toLowerCase();
      if (seenPaths.has(collisionKey)) throw new Error(`Duplicate or case-colliding tar entry path: ${path}`);
      seenPaths.add(collisionKey);
      files.push({ path, size });
    }
    offset = paddedEnd;
  }
  if (!terminated) throw new Error("Tar archive is missing the required two-block end-of-archive terminator");
  return files;
}

/**
 * Audits file entries against the release's exact positive allowlist.
 * Invalid or aliased paths are violations, never normalized into safe names.
 *
 * @param {ReadonlyArray<{ path: string, size: number }>} files
 * @returns {string[]}
 */
export function auditTarballEntries(files) {
  const forbiddenPatterns = [
    /candidate\.lock\.json$/iu,
    /^\.planning(?:\/|$)/iu,
    /^test(?:\/|$)/iu,
    /\.ts$/iu,
    /^\.git(?:\/|$)/iu,
    /\.log$/iu,
    /^scratch(?:\/|$)/iu,
  ];
  const allowedExact = new Set([
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "dist/build-artifact.json",
    "catalog/stack.yaml",
    "catalog/stack.lock.json",
    "catalog/facts.yaml",
    "catalog/canaries.yaml",
  ]);
  const allowedPrefixes = ["dist/src/", "catalog/packs/", "schemas/", "scripts/", "skills/", "docs/"];

  const violations = [];
  const seenPaths = new Set();
  let totalBytes = 0;
  if (files.length === 0) violations.push("Archive contains no regular files");
  if (files.length > MAX_ENTRY_COUNT) violations.push(`Archive contains more than ${MAX_ENTRY_COUNT} regular files`);
  for (const entry of files) {
    const reason = unsafePathReason(entry.path);
    if (reason !== null) {
      violations.push(`Unsafe path detected: ${String(entry.path)} (${reason})`);
      continue;
    }
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > MAX_ENTRY_BYTES) {
      violations.push(`Invalid or oversized entry size: ${entry.path} (${String(entry.size)})`);
      continue;
    }
    totalBytes += entry.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_ARCHIVE_BYTES) {
      violations.push(`Archive content exceeds the ${MAX_ARCHIVE_BYTES}-byte limit`);
      break;
    }
    const collisionKey = entry.path.toLowerCase();
    if (seenPaths.has(collisionKey)) {
      violations.push(`Duplicate or case-colliding path detected: ${entry.path}`);
      continue;
    }
    seenPaths.add(collisionKey);
    if (forbiddenPatterns.some((pattern) => pattern.test(entry.path))) {
      violations.push(`Forbidden file detected: ${entry.path}`);
      continue;
    }
    if (!allowedExact.has(entry.path) && !allowedPrefixes.some((prefix) => entry.path.startsWith(prefix))) {
      violations.push(`Unallowlisted file detected: ${entry.path}`);
    }
  }
  return violations;
}

function cleanNpmEnvironment() {
  const clean = { ...process.env };
  for (const key of Object.keys(clean)) {
    if (/^npm_/iu.test(key)) delete clean[key];
  }
  return clean;
}

function packTemporaryTarball() {
  const destination = mkdtempSync(join(tmpdir(), "alpha-aos-pack-audit-"));
  try {
    const npmCli = process.platform === "win32"
      ? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
      : null;
    if (npmCli !== null && !existsSync(npmCli)) throw new Error(`npm CLI not found beside Node.js: ${npmCli}`);
    const executable = npmCli === null ? "npm" : process.execPath;
    const argsPrefix = npmCli === null ? [] : [npmCli];
    const output = execFileSync(
      executable,
      [...argsPrefix, "pack", "--ignore-scripts", "--json", "--pack-destination", destination],
      {
        cwd: packageRoot,
        encoding: "utf8",
        env: cleanNpmEnvironment(),
        stdio: ["ignore", "pipe", "inherit"],
        windowsHide: true,
        shell: false,
      },
    );
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0]?.filename !== "string") {
      throw new Error("npm pack --json returned no single authoritative filename");
    }
    const filename = basename(parsed[0].filename);
    if (filename !== parsed[0].filename) throw new Error(`npm pack returned an unsafe filename: ${parsed[0].filename}`);
    const tarballPath = resolve(destination, filename);
    if (!existsSync(tarballPath) || dirname(tarballPath) !== resolve(destination)) {
      throw new Error(`npm pack did not create the declared archive in ${destination}`);
    }
    return { destination, tarballPath };
  } catch (error) {
    rmSync(destination, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    throw error;
  }
}

function parseCliArguments(args) {
  const prepack = args.includes("--prepack");
  const paths = args.filter((arg) => arg !== "--prepack");
  if (paths.length > 1 || paths.some((arg) => arg.startsWith("--"))) {
    throw new Error("Usage: node scripts/audit-tarball.mjs [--prepack | <tarball-path>]");
  }
  if (prepack && paths.length > 0) throw new Error("--prepack cannot be combined with an explicit tarball path");
  return { prepack, path: paths[0] ?? null };
}

function runCli() {
  let temporary = null;
  try {
    const args = parseCliArguments(process.argv.slice(2));
    const defaultTarball = resolve(packageRoot, "alpha-aos-0.1.0.tgz");
    let tarballPath;
    if (args.path !== null) tarballPath = resolve(process.cwd(), args.path);
    else if (!args.prepack && existsSync(defaultTarball)) tarballPath = defaultTarball;
    else {
      console.log("Generating isolated temporary tarball via npm pack --ignore-scripts...");
      temporary = packTemporaryTarball();
      tarballPath = temporary.tarballPath;
    }

    if (!existsSync(tarballPath)) throw new Error(`Tarball not found at ${tarballPath}`);
    const files = listTarballFiles(tarballPath);
    const violations = auditTarballEntries(files);
    if (violations.length > 0) {
      console.error(`Tarball content audit FAILED (${violations.length} violation(s)):`);
      for (const violation of violations) console.error(`  - ${violation}`);
      return 3;
    }
    console.log(`Tarball content audit PASSED (${files.length} allowlisted entries verified in ${basename(tarballPath)}).`);
    return 0;
  } catch (error) {
    console.error(`Tarball content audit FAILED: ${error instanceof Error ? error.message : String(error)}`);
    return 3;
  } finally {
    if (temporary !== null) {
      rmSync(temporary.destination, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) process.exitCode = runCli();
