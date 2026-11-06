import { createHash, createPublicKey, verify } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { provePathBoundary, recheckPathProof } from "./path-boundary.js";
import { proveToolRecordRoot } from "./tool-records.js";
import { parseNativeConfiguration, type ToolCandidate } from "./tool-observers.js";
import type { LegacyHandoffAssessment } from "./tool-handoff.js";

const knownPackages: Record<string, string> = { gsd: "@opengsd/gsd-core", ecc: "ecc-universal", "mcp:context7": "@upstash/context7-mcp", "mcp:exa": "exa-mcp-server", "mcp:firecrawl": "firecrawl-mcp", "bridge:pi": "pi-mcp-adapter" };
const safe = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const base64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const keysOnly = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const assessment = (status: LegacyHandoffAssessment["status"], reason: string, scope: string | null = null): LegacyHandoffAssessment => ({ status, reason, scope, nextAction: status === "ready" ? "Inspect remaining installation files and ownership before handoff" : "Inspect retained evidence and reviewed policy" });

async function readProven(path: string, root: string, max: number): Promise<Buffer> {
  const proof = await provePathBoundary({ path, allowedRoots: [root], role: "source" });
  const base = resolve(root);
  if (!proof.proven || !proof.capability.componentIdentity || proof.components.some((part) => (part.path === base || part.path.startsWith(`${base}${sep}`)) && part.reparse !== "none")) throw new Error("unsafe path");
  const file = await open(path, "r");
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > max) throw new Error("invalid size");
    const bytes = Buffer.alloc(before.size);
    if ((await file.read(bytes, 0, bytes.length, 0)).bytesRead !== bytes.length) throw new Error("short read");
    const after = await file.stat();
    if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || !(await recheckPathProof(proof)).ok) throw new Error("changed path");
    return bytes;
  } finally { await file.close(); }
}

function json(bytes: Buffer): unknown {
  const parsed = parseNativeConfiguration(bytes.toString("utf8"), "json");
  if (!parsed.ok) throw new Error("invalid JSON");
  return parsed.value;
}

function manifestFromArchive(archive: Buffer): Buffer {
  const tar = gunzipSync(archive, { maxOutputLength: 32 * 1024 * 1024 });
  let found: Buffer | null = null;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, end: number) => header.subarray(start, end).toString("utf8").split("\0")[0] ?? "";
    const sizeText = field(124, 136).trim(), checksumText = field(148, 156).trim();
    if (!/^[0-7]+$/.test(sizeText) || !/^[0-7]+$/.test(checksumText)) throw new Error("invalid tar");
    const sum = [...header].reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (sum !== parseInt(checksumText, 8)) throw new Error("invalid tar checksum");
    const size = parseInt(sizeText, 8), type = header[156], prefix = field(345, 500), name = `${prefix ? `${prefix}/` : ""}${field(0, 100)}`;
    const start = offset + 512, end = start + size;
    if (!Number.isSafeInteger(size) || end > tar.length || ![0, 48, 53].includes(type ?? -1)) throw new Error("unsupported tar entry");
    if (name === "package/package.json") {
      if (found || type === 53 || size > 256 * 1024) throw new Error("ambiguous manifest");
      found = Buffer.from(tar.subarray(start, end));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  if (!found) throw new Error("manifest missing");
  return found;
}

export async function assessRetainedNpmHandoff(options: { packageRoot: string; stateRoot: string; toolId: string; candidate: ToolCandidate }): Promise<LegacyHandoffAssessment> {
  const missing = (reason: string) => assessment("needs-evidence", reason);
  const pkg = knownPackages[options.toolId];
  if (!pkg || options.candidate.evidence !== "package-manifest" || options.candidate.identity !== pkg || !options.candidate.version) return missing("unsupported-candidate-scope");
  try {
    if (!(await proveToolRecordRoot(options.stateRoot, options.packageRoot))) return missing("unsafe-state-root");
    const [statePath, packagePath] = await Promise.all([realpath(options.stateRoot), realpath(options.packageRoot)]);
    const rel = relative(statePath, packagePath);
    if (rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))) return missing("unsafe-state-root");
    const policy = json(await readProven(join(options.packageRoot, "catalog", "tool-handoff-policy.json"), options.packageRoot, 64 * 1024));
    if (!keysOnly(policy, ["schemaVersion", "registry", "packages", "keys", "revokedKeyIds"]) || policy.schemaVersion !== 1 || policy.registry !== "https://registry.npmjs.org" || !policy.packages || typeof policy.packages !== "object" || Array.isArray(policy.packages) || (policy.packages as Record<string, unknown>)[options.toolId] !== pkg || !Array.isArray(policy.keys) || policy.keys.length > 32 || !Array.isArray(policy.revokedKeyIds) || policy.revokedKeyIds.some((id) => typeof id !== "string")) return missing("reviewed-policy-missing");
    const dir = join(options.stateRoot, "tool-handoff", options.toolId.replace(":", "-"));
    const record = json(await readProven(join(dir, "evidence.json"), options.stateRoot, 64 * 1024));
    if (!keysOnly(record, ["schemaVersion", "toolId", "package", "version", "integrity", "keyid", "signature", "previousIdentity", "priorInstallationOwner", "priorConnectionOwner", "userModificationEvidence"]) || record.schemaVersion !== 1 || record.toolId !== options.toolId || record.package !== pkg || record.version !== options.candidate.version || typeof record.integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(record.integrity) || typeof record.keyid !== "string" || typeof record.signature !== "string" || !base64.test(record.signature) || record.signature.length > 256 || typeof record.previousIdentity !== "string" || !safe.test(record.previousIdentity) || !["external", "alpha-aos"].includes(String(record.priorInstallationOwner)) || record.priorInstallationOwner !== options.candidate.installationOwner || !["external", "alpha-aos", "unknown"].includes(String(record.priorConnectionOwner)) || record.userModificationEvidence !== "unmodified") return missing("retained-record-invalid");
    if ((policy.revokedKeyIds as unknown[]).includes(record.keyid)) return missing("registry-key-revoked");
    const candidates = (policy.keys as unknown[]).filter((key) => keysOnly(key, ["keyid", "key", "expires"]) && key.keyid === record.keyid);
    if (candidates.length !== 1) return missing("registry-key-untrusted");
    const key = candidates[0] as { keyid: string; key: unknown; expires: unknown };
    if (typeof key.key !== "string" || !base64.test(key.key) || key.key.length > 512 || !(key.expires === null || (typeof key.expires === "string" && Number.isFinite(Date.parse(key.expires)) && Date.parse(key.expires) > Date.now()))) return missing("registry-key-invalid-or-expired");
    const der = Buffer.from(key.key, "base64"), publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.keyid !== `SHA256:${createHash("sha256").update(der).digest("base64")}` || publicKey.asymmetricKeyType !== "ec" || publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1" || !verify("sha256", Buffer.from(`${pkg}@${record.version}:${record.integrity}`), publicKey, Buffer.from(record.signature, "base64"))) return missing("registry-signature-invalid");
    const archive = await readProven(join(dir, "artifact.tgz"), options.stateRoot, 16 * 1024 * 1024);
    if (`sha512-${createHash("sha512").update(archive).digest("base64")}` !== record.integrity) return missing("artifact-integrity-mismatch");
    const archived = manifestFromArchive(archive);
    const current = await readProven(join(options.candidate.path, "package.json"), options.candidate.path, 256 * 1024);
    if (!archived.equals(current)) return assessment("modified", "current-manifest-modified", "package.json");
    const manifest = json(archived);
    if (!manifest || typeof manifest !== "object" || (manifest as Record<string, unknown>).name !== pkg || (manifest as Record<string, unknown>).version !== record.version) return missing("artifact-identity-mismatch");
    return assessment("ready", "registry-signature-and-scoped-bytes-match", "package.json");
  } catch { return missing("retained-evidence-unavailable"); }
}
