#!/usr/bin/env node
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve, basename } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Decodes 512-byte POSIX ustar headers from a decompressed tar buffer.
 * Extracts clean relative POSIX paths (stripping the leading "package/").
 *
 * @param {string} tarballPath
 * @returns {Array<{ path: string, size: number }>}
 */
export function listTarballFiles(tarballPath) {
  const buffer = gunzipSync(readFileSync(tarballPath));
  const files = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    // End of archive indicator (consecutive zero blocks)
    if (header.every((b) => b === 0)) break;

    let nameEnd = header.indexOf(0, 0);
    if (nameEnd === -1 || nameEnd > 100) nameEnd = 100;
    let name = header.subarray(0, nameEnd).toString("utf8");

    const sizeStr = header.subarray(124, 136).toString("utf8").trim().replace(/\0/g, "");
    const size = parseInt(sizeStr, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);

    // Handle ustar prefix expansion
    const magic = header.subarray(257, 263).toString("utf8");
    if (magic.startsWith("ustar")) {
      let prefixEnd = header.indexOf(0, 345);
      if (prefixEnd === -1 || prefixEnd > 500) prefixEnd = 500;
      const prefix = header.subarray(345, prefixEnd).toString("utf8");
      if (prefix) {
        name = `${prefix}/${name}`;
      }
    }

    // Standard file entry ("0" or null byte)
    if ((typeFlag === "0" || typeFlag === "\0") && name.length > 0) {
      const cleanPath = name.startsWith("package/") ? name.slice(8) : name;
      if (cleanPath.length > 0 && !cleanPath.endsWith("/")) {
        files.push({ path: cleanPath.replace(/\\/g, "/"), size });
      }
    }

    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/**
 * Audits tarball entries against allowlist and forbidden patterns.
 *
 * @param {Array<{ path: string, size: number }>} files
 * @returns {string[]} Array of violation strings
 */
export function auditTarballEntries(files) {
  const forbiddenPatterns = [
    /candidate\.lock\.json/i,
    /^\.planning\//i,
    /^test\//i,
    /\.ts$/i,
    /^\.git/i,
    /\.log$/i,
    /^scratch\//i,
  ];

  const allowedExact = new Set([
    "package.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "dist/build-artifact.json",
  ]);

  const allowedPrefixes = [
    "dist/src/",
    "catalog/",
    "schemas/",
    "scripts/",
    "skills/",
    "docs/",
  ];

  const violations = [];
  for (const { path } of files) {
    if (forbiddenPatterns.some((pattern) => pattern.test(path))) {
      violations.push(`Forbidden file detected: ${path}`);
      continue;
    }

    // Explicitly disallow candidate.lock.json inside catalog/
    if (path.startsWith("catalog/") && path.includes("candidate.lock.json")) {
      violations.push(`Forbidden file detected in catalog: ${path}`);
      continue;
    }

    const isAllowed =
      allowedExact.has(path) || allowedPrefixes.some((p) => path.startsWith(p));
    if (!isAllowed) {
      violations.push(`Unallowlisted file detected: ${path}`);
    }
  }

  return violations;
}

function runCli() {
  const args = process.argv.slice(2);
  const isPrepack = args.includes("--prepack");
  const filteredArgs = args.filter((arg) => arg !== "--prepack");

  let tarballPath = filteredArgs[0];
  let isTempTarball = false;

  const rootDir = process.cwd();
  const defaultTarball = resolve(rootDir, "alpha-aos-0.1.0.tgz");

  if (!tarballPath) {
    if (!isPrepack && existsSync(defaultTarball)) {
      tarballPath = defaultTarball;
    } else {
      console.log("Generating temporary tarball via npm pack --ignore-scripts...");
      const packOutput = execSync("npm pack --ignore-scripts", {
        cwd: rootDir,
        encoding: "utf8",
      }).trim();
      // npm pack outputs the filename of the packed archive on the last line
      const lines = packOutput.split(/\r?\n/).filter(Boolean);
      const generatedFile = lines[lines.length - 1].trim();
      const packDest = process.env.npm_config_pack_destination
        ? resolve(process.env.npm_config_pack_destination)
        : rootDir;
      const candidatePath = resolve(packDest, generatedFile);
      tarballPath = existsSync(candidatePath) ? candidatePath : resolve(rootDir, generatedFile);
      isTempTarball = true;
    }
  } else {
    tarballPath = resolve(rootDir, tarballPath);
  }

  if (!existsSync(tarballPath)) {
    console.error(`ERROR: Tarball not found at ${tarballPath}`);
    process.exit(3);
  }

  try {
    const files = listTarballFiles(tarballPath);
    const violations = auditTarballEntries(files);

    if (violations.length > 0) {
      console.error(`\n❌ Tarball content audit FAILED (${violations.length} violation(s)):`);
      for (const v of violations) {
        console.error(`  - ${v}`);
      }
      process.exit(3);
    }

    console.log(`✅ Tarball content audit PASSED (${files.length} allowlisted entries verified in ${basename(tarballPath)}).`);
    process.exit(0);
  } finally {
    if (isTempTarball && existsSync(tarballPath)) {
      try {
        unlinkSync(tarballPath);
      } catch {
        // Ignore cleanup error
      }
    }
  }
}

const isMain =
  process.argv[1] &&
  (resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname) ||
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href);

if (isMain) {
  runCli();
}
