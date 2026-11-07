import { createHash, verify, X509Certificate } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { packageRoot, userStateRoot } from "./paths.js";
import { runProcess, type ProcessSpec } from "./process.js";
import type { MutationSession } from "./writer-lock.js";

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export interface Asset {
  os: string;
  arch: string;
  entrypoint: string;
  installedEntrypoint?: string;
  files: Record<string, string>;
  installedFiles?: Record<string, string>;
}

export interface Pin {
  version: string;
  assets: Asset[];
  installer: {
    directory: string;
    sourceCommit: string;
    files: Record<string, string>;
  };
}

export interface ReviewedCuaReleasePin {
  readonly version: string;
  readonly tag: string;
  readonly os: string;
  readonly arch: string;
  readonly assetName: string;
  readonly archiveUrl: string;
  readonly archiveSha256: string;
  readonly entrypoint: string;
  readonly installedEntrypoint?: string | undefined;
  readonly files: Record<string, string>;
  readonly installedFiles: Record<string, string>;
  readonly publisherIdentity: string;
  readonly installer: {
    readonly directory: string;
    readonly sourceCommit: string;
    readonly files: Record<string, string>;
  };
}

const safeName = (name: string): boolean =>
  /^(?:[\w.@+-]+\/)*[\w.@+-]+$/.test(name) &&
  name.split("/").every((part) => part !== "." && part !== "..");

export function extractArchiveFiles(assetName: string, archiveBytes: Uint8Array): Record<string, Buffer> {
  const buf = Buffer.isBuffer(archiveBytes) ? archiveBytes : Buffer.from(archiveBytes);
  const files: Record<string, Buffer> = {};

  if (assetName.endsWith(".zip")) {
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) throw new Error("Invalid ZIP archive: EOCD record not found");
    const cdEntries = buf.readUInt16LE(eocdOffset + 10);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    let offset = cdOffset;
    for (let i = 0; i < cdEntries; i++) {
      if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid central directory header in ZIP");
      const compMethod = buf.readUInt16LE(offset + 10);
      const compSize = buf.readUInt32LE(offset + 20);
      const uncompSize = buf.readUInt32LE(offset + 24);
      const nameLen = buf.readUInt16LE(offset + 28);
      const extraLen = buf.readUInt16LE(offset + 30);
      const commentLen = buf.readUInt16LE(offset + 32);
      const localHeaderOffset = buf.readUInt32LE(offset + 42);
      const rawName = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");

      offset += 46 + nameLen + extraLen + commentLen;

      if (rawName.endsWith("/") || rawName.endsWith("\\")) continue;

      if (rawName.includes("..") || rawName.startsWith("/") || rawName.startsWith("\\") || !safeName(rawName)) {
        throw new Error(`Unsafe archive entry path: ${rawName}`);
      }
      if (uncompSize > 256 * 1024 * 1024) {
        throw new Error(`Archive entry exceeds maximum allowed size: ${rawName}`);
      }

      if (buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error("Invalid local file header in ZIP");
      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

      const compData = buf.subarray(dataOffset, dataOffset + compSize);
      let data: Buffer;
      if (compMethod === 0) data = Buffer.from(compData);
      else if (compMethod === 8) data = inflateRawSync(compData);
      else throw new Error(`Unsupported ZIP compression method ${compMethod}`);

      files[rawName] = data;
    }
  } else if (assetName.endsWith(".tar.gz") || assetName.endsWith(".tgz")) {
    const tar = gunzipSync(buf, { maxOutputLength: 256 * 1024 * 1024 });
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every((b) => b === 0)) break;
      const field = (s: number, e: number) => header.subarray(s, e).toString("utf8").split("\0")[0] ?? "";
      const sizeText = field(124, 136).trim();
      const checksumText = field(148, 156).trim();
      if (!/^[0-7]+$/.test(sizeText) || !/^[0-7]+$/.test(checksumText)) throw new Error("Invalid tar archive header");
      const sum = [...header].reduce((t, b, i) => t + (i >= 148 && i < 156 ? 32 : b), 0);
      if (sum !== parseInt(checksumText, 8)) throw new Error("Invalid tar checksum");
      const size = parseInt(sizeText, 8);
      const type = header[156];
      const prefix = field(345, 500);
      const rawName = (prefix ? `${prefix}/` : "") + field(0, 100);
      const start = offset + 512;
      const end = start + size;
      if (!Number.isSafeInteger(size) || end > tar.length || size > 256 * 1024 * 1024) throw new Error("Unsupported tar entry");

      offset = start + Math.ceil(size / 512) * 512;
      if (type === 53 || rawName.endsWith("/")) continue;

      if (rawName.includes("..") || rawName.startsWith("/") || !safeName(rawName)) {
        throw new Error(`Unsafe archive entry path: ${rawName}`);
      }

      files[rawName] = Buffer.from(tar.subarray(start, end));
    }
  } else {
    throw new Error(`Unsupported archive format for ${assetName}`);
  }
  return files;
}

export function verifyCuaSigstoreBundle(
  bundle: unknown,
  archiveBytes: Uint8Array,
  expectedTag: string,
  options?: {
    expectedIssuer?: string;
    expectedWorkflowUri?: string;
  },
): {
  verified: boolean;
  identity: string;
  issuer: string;
} {
  const bundleObj = typeof bundle === "string"
    ? (JSON.parse(bundle) as Record<string, unknown>)
    : Buffer.isBuffer(bundle) || bundle instanceof Uint8Array
      ? (JSON.parse(Buffer.from(bundle).toString("utf8")) as Record<string, unknown>)
      : (bundle as Record<string, unknown>);

  if (!bundleObj || typeof bundleObj !== "object") {
    throw new Error("Invalid Sigstore bundle: payload must be a JSON object");
  }

  const verificationMaterial = bundleObj.verificationMaterial as Record<string, unknown> | undefined;
  const x509Chain = verificationMaterial?.x509CertificateChain as { certificates?: Array<{ rawBytes?: string }> } | undefined;
  const singleCert = verificationMaterial?.certificate as { rawBytes?: string } | undefined;
  const rawCertBase64 = x509Chain?.certificates?.[0]?.rawBytes ?? singleCert?.rawBytes ?? (bundleObj.certificate as string | undefined);

  if (!rawCertBase64 || typeof rawCertBase64 !== "string") {
    throw new Error("Sigstore bundle missing X.509 certificate rawBytes");
  }

  const certDer = Buffer.from(rawCertBase64, "base64");
  const cert = new X509Certificate(certDer);

  const expectedIssuer = options?.expectedIssuer ?? "https://token.actions.githubusercontent.com";
  if (!cert.raw.includes(Buffer.from(expectedIssuer, "utf8"))) {
    throw new Error(`Invalid OIDC issuer: certificate was not issued by ${expectedIssuer}`);
  }

  const expectedWorkflowUri = options?.expectedWorkflowUri ?? `https://github.com/trycua/cua/.github/workflows/cd-rust-cua-driver.yml@refs/tags/${expectedTag}`;
  if (!cert.subjectAltName || !cert.subjectAltName.includes(expectedWorkflowUri)) {
    throw new Error(`Certificate identity mismatch: expected ${expectedWorkflowUri}, got ${cert.subjectAltName ?? "none"}`);
  }

  const messageSignature = bundleObj.messageSignature as { messageDigest?: { digest?: string }; signature?: string } | undefined;
  const dsseEnvelope = bundleObj.dsseEnvelope as { signatures?: Array<{ sig?: string }> } | undefined;
  const sigBase64 = messageSignature?.signature ?? dsseEnvelope?.signatures?.[0]?.sig;

  if (!sigBase64 || typeof sigBase64 !== "string") {
    throw new Error("Missing signature in Sigstore bundle");
  }

  const sigBytes = Buffer.from(sigBase64, "base64");
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest();

  if (messageSignature?.messageDigest?.digest) {
    const expectedDigest = Buffer.from(messageSignature.messageDigest.digest, "base64");
    if (!expectedDigest.equals(archiveSha256)) {
      throw new Error("Archive SHA-256 does not match messageDigest in Sigstore bundle");
    }
  }

  let verified = false;
  try {
    verified = verify(null, archiveSha256, { key: cert.publicKey, dsaEncoding: "ieee-p1363" }, sigBytes);
  } catch {
    // try der
  }
  if (!verified) {
    try {
      verified = verify(null, archiveSha256, { key: cert.publicKey, dsaEncoding: "der" }, sigBytes);
    } catch {
      // failed
    }
  }

  if (!verified) {
    throw new Error("Sigstore signature verification failed");
  }

  return { verified: true, identity: expectedWorkflowUri, issuer: expectedIssuer };
}

export interface DeriveCuaReleasePinOptions {
  readonly version: string;
  readonly tag: string;
  readonly os: "windows" | "macos" | "linux";
  readonly arch: "x64" | "arm64" | "universal";
  readonly assetName: string;
  readonly archiveBytes: Uint8Array;
  readonly archiveUrl: string;
  readonly sha256sumsText: string;
  readonly sigstoreBundle: unknown;
  readonly root?: string;
}

export function verifyAndDeriveCuaReleasePin(
  options: DeriveCuaReleasePinOptions,
): ReviewedCuaReleasePin {
  const archiveSha256 = createHash("sha256").update(options.archiveBytes).digest("hex");

  let expectedSha256: string | undefined;
  for (const line of options.sha256sumsText.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (
      parts.length >= 2 &&
      (parts[1] === options.assetName ||
        parts[1] === `*${options.assetName}` ||
        parts[1]?.endsWith(`/${options.assetName}`))
    ) {
      expectedSha256 = parts[0]?.toLowerCase();
      break;
    }
  }

  if (!expectedSha256) {
    throw new Error(`Asset ${options.assetName} not found in SHA256SUMS`);
  }
  if (expectedSha256 !== archiveSha256) {
    throw new Error(`checksum-mismatch: expected ${expectedSha256}, got ${archiveSha256}`);
  }

  verifyCuaSigstoreBundle(options.sigstoreBundle, options.archiveBytes, options.tag);

  const extracted = extractArchiveFiles(options.assetName, options.archiveBytes);
  const files: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(extracted)) {
    files[name] = hash(bytes);
  }

  let entrypoint: string;
  let installedEntrypoint: string | undefined;
  if (options.os === "windows") {
    entrypoint = "cua-driver.exe";
    if (!files[entrypoint]) throw new Error("Entrypoint cua-driver.exe missing in archive");
  } else if (options.os === "macos") {
    if (files["cua-driver"]) {
      entrypoint = "cua-driver";
    } else if (files["Contents/MacOS/cua-driver"]) {
      entrypoint = "Contents/MacOS/cua-driver";
    } else {
      entrypoint = "cua-driver";
    }
    installedEntrypoint = "/Applications/CuaDriver.app/Contents/MacOS/cua-driver";
  } else {
    entrypoint = "cua-driver";
    if (!files[entrypoint]) throw new Error("Entrypoint cua-driver missing in archive");
  }

  const installer = {
    sourceCommit: "85e2b1318bd77ccf3cfa88ccdf875a4bb7eaed19",
    directory: "scripts/vendor/cua-driver-0.38.0",
    files: {
      "install.ps1": "d9d4d29aa10c76dcc1bb3595cd9003d2fbf554f99c09ce3dd6147dfaa869da9b",
      "install.sh": "a103177e0df86d04d752bfa20c73f99a3e501906f1814c3127da84788539d9ba",
      "_install-common.psm1": "99f34a84ceab04d4b488b1db4d71536c7a7ac7e645ac2ec295b4fd85244085b6",
      "_install-common.sh": "0d5d4b023bfe9111db810b0fde2be23188b703a94093b438edc79b0af8f4b987",
      "_install-rust.sh": "1fc19c3c35bb459c5d1987f3d1b8ab54bffb457b7827bfae06147b36e56d28e3",
    },
  };

  return {
    version: options.version,
    tag: options.tag,
    os: options.os,
    arch: options.arch,
    assetName: options.assetName,
    archiveUrl: options.archiveUrl,
    archiveSha256,
    entrypoint,
    ...(installedEntrypoint ? { installedEntrypoint } : {}),
    files,
    installedFiles: files,
    publisherIdentity: `https://github.com/trycua/cua/.github/workflows/cd-rust-cua-driver.yml@refs/tags/${options.tag}`,
    installer,
  };
}

async function loadPin(
  root: string,
  dynamicPin?: ReviewedCuaReleasePin,
  stateRoot?: string,
): Promise<{ pin: Pin; pinHash: string; asset: Asset }> {
  if (dynamicPin) {
    const asset: Asset = {
      os: dynamicPin.os,
      arch: dynamicPin.arch,
      entrypoint: dynamicPin.entrypoint,
      ...(dynamicPin.installedEntrypoint ? { installedEntrypoint: dynamicPin.installedEntrypoint } : {}),
      files: dynamicPin.files,
      installedFiles: dynamicPin.installedFiles,
    };
    const pin: Pin = {
      version: dynamicPin.version,
      assets: [asset],
      installer: dynamicPin.installer,
    };
    return { pin, pinHash: hash(Buffer.from(JSON.stringify(dynamicPin))), asset };
  }

  if (stateRoot) {
    const localPinPath = join(stateRoot, "cua-release-pin.json");
    try {
      const source = await readFile(localPinPath, "utf8");
      const parsed = JSON.parse(source) as ReviewedCuaReleasePin;
      if (parsed && typeof parsed.version === "string" && parsed.installer) {
        return loadPin(root, parsed);
      }
    } catch {
      // ignore missing local state file
    }
  }

  const source = await readFile(join(root, "catalog", "computer-use-runtime.json"));
  const pin = JSON.parse(source.toString()) as Pin;
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
  const asset = pin.assets.find((item) => item.os === os && (item.arch === process.arch || item.arch === "universal"));
  if (!asset || !/^\d+\.\d+\.\d+$/.test(pin.version)) throw new Error("No reviewed Cua release for this platform");
  return { pin, pinHash: hash(source), asset };
}

export function officialCuaPaths(platform = process.platform, home = homedir(), localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local")) {
  const packageHome = join(home, ".cua-driver");
  const binRoot = platform === "win32" ? join(localAppData, "Programs", "Cua", "cua-driver") : join(home, ".local", "bin");
  return {
    packageHome, binRoot,
    legacyRoots: [join(home, ".cua-driver-rs"), ...(platform === "win32" ? [join(localAppData, "Programs", "trycua", "cua-driver-rs")] : [])],
    executable: platform === "darwin" ? "/Applications/CuaDriver.app/Contents/MacOS/cua-driver" : join(binRoot, ...(platform === "win32" ? ["bin", "cua-driver.exe"] : ["cua-driver"])),
    roots: [packageHome, binRoot, ...(platform === "darwin" ? ["/Applications/CuaDriver.app"] : [])],
  };
}

export async function verifyOfficialCua(
  executable: string,
  root = packageRoot(),
  dynamicPin?: ReviewedCuaReleasePin,
  stateRoot = userStateRoot(),
) {
  const { pin, asset } = await loadPin(root, dynamicPin, stateRoot);
  const entrypoint = asset.installedEntrypoint ?? asset.entrypoint;
  if (!safeName(entrypoint)) throw new Error("Invalid Cua entrypoint");
  const resolved = await realpath(executable);
  let runtimeRoot = resolved;
  for (const _part of entrypoint.split("/")) runtimeRoot = dirname(runtimeRoot);
  if (await realpath(join(runtimeRoot, entrypoint)) !== resolved) throw new Error("Invalid installed Cua layout");
  const files = asset.installedFiles ?? asset.files;
  if (!files[entrypoint] || Object.keys(files).length > 128) throw new Error("Invalid installed Cua manifest");
  for (const [name, digest] of Object.entries(files)) {
    if (!safeName(name) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid installed Cua file pin");
    const file = join(runtimeRoot, name);
    const rel = relative(runtimeRoot, await realpath(file));
    const stat = await lstat(file);
    if (rel.startsWith("..") || isAbsolute(rel) || !stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024 || hash(await readFile(file)) !== digest) throw new Error("Installed Cua bytes differ from the reviewed release");
  }
  return { executable: resolved, version: pin.version, executableHash: files[entrypoint]! };
}

export async function planCuaInstall(
  stateRoot = userStateRoot(),
  root = packageRoot(),
  dynamicPin?: ReviewedCuaReleasePin,
) {
  const { pin, pinHash } = await loadPin(root, dynamicPin, stateRoot);
  const paths = officialCuaPaths();
  const legacyConflicts: string[] = [];
  for (const path of paths.legacyRoots) {
    try { await lstat(path); legacyConflicts.push(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const installer = pin.installer;
  if (!installer || !safeName(installer.directory) || !/^[a-f0-9]{40}$/.test(installer.sourceCommit)) throw new Error("Cua installer provenance is missing");
  for (const [name, digest] of Object.entries(installer.files)) {
    if (!safeName(name) || !/^[a-f0-9]{64}$/.test(digest) || hash(await readFile(join(root, installer.directory, name))) !== digest) throw new Error("Official Cua installer bytes drifted");
  }
  for (const name of ["install.ps1", "install.sh", "_install-rust.sh", "_install-common.sh", "_install-common.psm1"]) {
    if (!installer.files[name]) throw new Error("Official Cua installer helper is missing");
  }
  let current = false;
  try { await verifyOfficialCua(paths.executable, root, dynamicPin, stateRoot); current = true; } catch { /* Missing/drifted installations require the official installer. */ }
  const directory = join(root, installer.directory);
  const spec: ProcessSpec = {
    executable: process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "/bin/bash",
    args: process.platform === "win32"
      ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", join(directory, "install.ps1"), "-Release", pin.version, "-NoAutoStart"]
      : [join(directory, "install.sh")],
    cwd: directory, timeoutMs: 300_000, maxOutputBytes: 1024 * 1024,
    environment: {
      optional: ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "SHELL"],
      literal: {
        CUA_DRIVER_RS_VERSION: pin.version, CUA_DRIVER_RS_KEEP_VERSIONS: "2",
        CUA_DRIVER_RS_TELEMETRY_ENABLED: "false", CUA_DRIVER_RS_UPDATE_CHECK: "false",
      },
    },
  };
  return { ...paths, legacyConflicts, targetRoot: paths.packageHome, current, pinHash, spec };
}

export async function installCua(
  plan: Awaited<ReturnType<typeof planCuaInstall>>,
  session?: MutationSession,
  root = packageRoot(),
  dynamicPin?: ReviewedCuaReleasePin,
  stateRoot = userStateRoot(),
) {
  const fresh = await planCuaInstall(stateRoot, root, dynamicPin);
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) throw new Error("Cua installation plan changed before apply");
  if (plan.current) return false;
  if (!session) throw new Error("Official Cua installation requires a managed writer session");
  session.assertOwned();
  if (plan.legacyConflicts.length > 0) throw new Error("Legacy Cua directories require explicit migration review before running the official installer; no legacy files were removed");
  const result = await runProcess({ ...plan.spec, environment: { ...plan.spec.environment, source: process.env } });
  if (result.code !== "ok") throw new Error(`Official Cua installer failed (${result.code}, exit ${result.exitCode}); inspect native Cua installation before retrying`);
  await verifyOfficialCua(plan.executable, root, dynamicPin, stateRoot);
  return true;
}
