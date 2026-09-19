import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

interface TarballEntry {
  readonly path: string;
  readonly size: number;
}

interface AuditModule {
  listTarballFiles(tarballPath: string): TarballEntry[];
  auditTarballEntries(files: readonly TarballEntry[]): string[];
}

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const auditModuleUrl = pathToFileURL(join(repositoryRoot, "scripts", "audit-tarball.mjs")).href;

function writeOctal(header: Buffer, start: number, length: number, value: number): void {
  const encoded = value.toString(8).padStart(length - 1, "0");
  header.write(encoded, start, length - 1, "ascii");
  header[start + length - 1] = 0;
}

function tarHeader(path: string, size: number, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function tarArchive(entries: readonly { path: string; body?: Buffer; size?: number; type?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = entry.body ?? Buffer.alloc(0);
    const declaredSize = entry.size ?? body.length;
    blocks.push(tarHeader(entry.path, declaredSize, entry.type));
    blocks.push(body);
    const padding = (512 - (body.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

async function withArchive(
  context: test.TestContext,
  archive: Buffer,
  run: (path: string) => void | Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tar-audit-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const path = join(root, "fixture.tgz");
  await writeFile(path, gzipSync(archive));
  await run(path);
}

test("tarball allowlist rejects traversal aliases and undeclared catalog files", async () => {
  const audit = await import(auditModuleUrl) as AuditModule;
  const violations = audit.auditTarballEntries([
    { path: "catalog/evil.txt", size: 1 },
    { path: "docs/../../.planning/secret", size: 1 },
    { path: "dist/src/../../test/secret.js", size: 1 },
    { path: "catalog/stack.lock.json", size: 1 },
    { path: "catalog/packs/web.yaml", size: 1 },
  ]);

  assert.equal(violations.length, 3);
  assert.ok(violations.some((message) => message.includes("catalog/evil.txt")));
  assert.ok(violations.some((message) => message.includes("docs/../../.planning/secret")));
  assert.ok(violations.some((message) => message.includes("dist/src/../../test/secret.js")));
});

test("tar parser rejects invalid checksum and malformed octal size fields", async (context) => {
  const audit = await import(auditModuleUrl) as AuditModule;

  const badChecksum = tarArchive([{ path: "package/package.json", body: Buffer.from("{}") }]);
  badChecksum[0] = (badChecksum[0] ?? 0) ^ 0x01;
  await withArchive(context, badChecksum, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /checksum/iu);
  });

  const malformedSize = tarArchive([{ path: "package/package.json", body: Buffer.from("{}") }]);
  malformedSize.write("0000000000x\0", 124, 12, "ascii");
  malformedSize.fill(0x20, 148, 156);
  const checksum = malformedSize.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  malformedSize.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  malformedSize[154] = 0;
  malformedSize[155] = 0x20;
  await withArchive(context, malformedSize, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /size/iu);
  });
});

test("tar parser fails closed on truncation, missing terminators, and dangerous entry types", async (context) => {
  const audit = await import(auditModuleUrl) as AuditModule;

  const truncated = Buffer.concat([
    tarHeader("package/package.json", 1024),
    Buffer.from("{}"),
  ]);
  await withArchive(context, truncated, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /truncated/iu);
  });

  const missingTerminator = tarArchive([{ path: "package/package.json", body: Buffer.from("{}") }]).subarray(0, 1024);
  await withArchive(context, missingTerminator, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /end-of-archive|terminator/iu);
  });

  const symlink = tarArchive([{ path: "package/docs/link", type: "2" }]);
  await withArchive(context, symlink, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /entry type/iu);
  });
});

test("tar parser enforces bounded entry sizes before allocating or advancing", async (context) => {
  const audit = await import(auditModuleUrl) as AuditModule;
  const oversized = Buffer.concat([
    tarHeader("package/dist/src/huge.js", 128 * 1024 * 1024),
    Buffer.alloc(1024),
  ]);
  await withArchive(context, oversized, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /limit|large|size/iu);
  });
});
