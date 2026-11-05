import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import { applyFileTransaction, rollbackFileTransaction } from "./transaction.js";
import type { MutationSession } from "./writer-lock.js";

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
export async function planCuaInstall(stateRoot = userStateRoot(), root = packageRoot()) {
  const source = await readFile(join(root, "catalog", "computer-use-runtime.json"));
  const pin = JSON.parse(source.toString()) as { version: string; signatureVerified: boolean; assets: Array<{ os: string; arch: string; name: string; url: string; sha256: string; entrypoint: string; files: Record<string, string> }> };
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
  const asset = pin.assets.find((item) => item.os === os && (item.arch === process.arch || item.arch === "universal"));
  if (!pin.signatureVerified || !asset || !/^https:\/\/github\.com\/trycua\/cua\/releases\/download\//.test(asset.url)) throw new Error("No reviewed Cua release for this platform");
  for (const [name, digest] of Object.entries(asset.files)) {
    if (!/^(?:[\w.@+-]+\/)*[\w.@+-]+$/.test(name) || name.split("/").some((part) => part === "." || part === "..") || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid Cua file manifest");
  }
  if (!(asset.entrypoint in asset.files) || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("Invalid Cua archive manifest");
  const targetRoot = join(stateRoot, "computer-use", "runtime", pin.version, `${process.platform}-${process.arch}`);
  let current = true;
  for (const [name, digest] of Object.entries(asset.files)) {
    if (await readFile(join(targetRoot, name)).then((bytes) => hash(bytes) === digest, () => false) === false) current = false;
  }
  return { asset, targetRoot, executable: join(targetRoot, asset.entrypoint), current, pinHash: hash(source) };
}

export async function installCua(stateRoot: string, session?: MutationSession) {
  const plan = await planCuaInstall(stateRoot);
  if (plan.current) return { plan, operationId: null };
  const temporary = await mkdtemp(join(tmpdir(), "alpha-aos-cua-"));
  try {
    const response = await fetch(plan.asset.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new Error("Cua release download failed");
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 256 * 1024 * 1024) throw new Error("Cua archive exceeds size limit");
      chunks.push(chunk);
    }
    const archive = Buffer.concat(chunks);
    if (hash(archive) !== plan.asset.sha256) throw new Error("Cua archive checksum mismatch");
    const archivePath = join(temporary, "release.archive");
    await writeFile(archivePath, archive);
    const operations = [];
    // Extract only pinned regular-file content to memory; archive paths never write files.
    for (const [name, digest] of Object.entries(plan.asset.files)) {
      const result = await promisify(execFile)("tar", ["-xOf", archivePath, name], { encoding: "buffer", maxBuffer: 256 * 1024 * 1024, timeout: 30_000, windowsHide: true });
      if (hash(result.stdout) !== digest) throw new Error(`Cua companion checksum mismatch: ${name}`);
      operations.push({ target: join(plan.targetRoot, name), content: result.stdout });
    }
    const journal = await applyFileTransaction({ stateRoot, allowedRoots: [plan.targetRoot], operations, session });
    try {
      if (process.platform !== "win32") {
        for (const name of Object.keys(plan.asset.files)) await chmod(join(plan.targetRoot, name), 0o755);
      }
    } catch (error) {
      await rollbackFileTransaction(stateRoot, journal.id, [plan.targetRoot]);
      throw error;
    }
    return { plan, operationId: journal.id };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
