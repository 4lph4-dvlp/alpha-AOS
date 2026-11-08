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

export const FULCIO_ROOT_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIB9zCCAXygAwIBAgIUALZNAPFdxHPwjeDloDwyYChAO/4wCgYIKoZIzj0EAwMw
KjEVMBMGA1UEChMMc2lnc3RvcmUuZGV2MREwDwYDVQQDEwhzaWdzdG9yZTAeFw0y
MTEwMDcxMzU2NTlaFw0zMTEwMDUxMzU2NThaMCoxFTATBgNVBAoTDHNpZ3N0b3Jl
LmRldjERMA8GA1UEAxMIc2lnc3RvcmUwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAAT7
XeFT4rb3PQGwS4IajtLk3/OlnpgangaBclYpsYBr5i+4ynB07ceb3LP0OIOZdxex
X69c5iVuyJRQ+Hz05yi+UF3uBWAlHpiS5sh0+H2GHE7SXrk1EC5m1Tr19L9gg92j
YzBhMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBRY
wB5fkUWlZql6zJChkyLQKsXF+jAfBgNVHSMEGDAWgBRYwB5fkUWlZql6zJChkyLQ
KsXF+jAKBggqhkjOPQQDAwNpADBmAjEAj1nHeXZp+13NWBNa+EDsDP8G1WWg1tCM
WP/WHPqpaVo0jhsweNFZgSs0eE7wYI4qAjEA2WB9ot98sIkoF3vZYdd3/VtWB5b9
TNMea7Ix/stJ5TfcLLeABLE4BNJOsQ4vnBHJ
-----END CERTIFICATE-----`;

export const FULCIO_INTERMEDIATE_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICGjCCAaGgAwIBAgIUALnViVfnU0brJasmRkHrn/UnfaQwCgYIKoZIzj0EAwMw
KjEVMBMGA1UEChMMc2lnc3RvcmUuZGV2MREwDwYDVQQDEwhzaWdzdG9yZTAeFw0y
MjA0MTMyMDA2MTVaFw0zMTEwMDUxMzU2NThaMDcxFTATBgNVBAoTDHNpZ3N0b3Jl
LmRldjEeMBwGA1UEAxMVc2lnc3RvcmUtaW50ZXJtZWRpYXRlMHYwEAYHKoZIzj0C
AQYFK4EEACIDYgAE8RVS/ysH+NOvuDZyPIZtilgUF9NlarYpAd9HP1vBBH1U5CV7
7LSS7s0ZiH4nE7Hv7ptS6LvvR/STk798LVgMzLlJ4HeIfF3tHSaexLcYpSASr1kS
0N/RgBJz/9jWCiXno3sweTAOBgNVHQ8BAf8EBAMCAQYwEwYDVR0lBAwwCgYIKwYB
BQUHAwMwEgYDVR0TAQH/BAgwBgEB/wIBADAdBgNVHQ4EFgQU39Ppz1YkEZb5qNjp
KFWixi4YZD8wHwYDVR0jBBgwFoAUWMAeX5FFpWapesyQoZMi0CrFxfowCgYIKoZI
zj0EAwMDZwAwZAIwPCsQK4DYiZYDPIaDi5HFKnfxXx6ASSVmERfsynYBiX2X6SJR
nZU84/9DZdnFvvxmAjBOt6QpBlc4J/0DxvkTCqpclvziL6BCCPnjdlIB3Pu3BxsP
mygUY7Ii2zbdCdliiow=
-----END CERTIFICATE-----`;

export const REKOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE2G2Y+2tabdTV5BcGiBIx0a9fAFwr
kBbmLSGtks4L3qX6yYY0zufBnhC8Ur/iy55GhWP/9A/bY2LhC30M9+RYtw==
-----END PUBLIC KEY-----`;

export const REKOR_KEY_ID = "c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d";

export interface TrustedSigstoreRoots {
  rootCertPem?: string;
  intermediateCertPem?: string;
  rekorPublicKeyPem?: string;
  rekorKeyId?: string;
}

function extractOidcIssuer(cert: X509Certificate): string | null {
  const der = cert.raw;
  // OID 1.3.6.1.4.1.57264.1.1 in DER ASN.1
  const oid = Buffer.from([0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xbf, 0x30, 0x01, 0x01]);
  const idx = der.indexOf(oid);
  if (idx === -1) return null;
  let pos = idx + oid.length;
  if (der[pos] === 0x04) {
    pos += 1;
    let len = der[pos]!;
    pos += 1;
    if (len & 0x80) {
      const numBytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < numBytes; i++) {
        len = (len << 8) | der[pos]!;
        pos += 1;
      }
    }
    let val = der.subarray(pos, pos + len);
    if (val.length > 2 && (val[0] === 0x0c || val[0] === 0x13 || val[0] === 0x16)) {
      let innerPos = 1;
      let innerLen = val[innerPos]!;
      innerPos += 1;
      if (innerLen & 0x80) {
        const numBytes = innerLen & 0x7f;
        innerLen = 0;
        for (let i = 0; i < numBytes; i++) {
          innerLen = (innerLen << 8) | val[innerPos]!;
          innerPos += 1;
        }
      }
      if (innerPos + innerLen <= val.length) {
        val = val.subarray(innerPos, innerPos + innerLen);
      }
    }
    return val.toString("utf8");
  }
  return null;
}

function extractSanUri(cert: X509Certificate): string | null {
  if (!cert.subjectAltName) return null;
  const entries = cert.subjectAltName.split(",").map((s) => s.trim());
  const uriEntry = entries.find((e) => e.startsWith("URI:"));
  return uriEntry ? uriEntry.slice(4) : null;
}

export function verifyCuaSigstoreBundle(
  bundle: unknown,
  archiveBytes: Uint8Array,
  expectedTag: string,
  options?: {
    expectedIssuer?: string;
    expectedWorkflowUri?: string;
    trustedRoots?: TrustedSigstoreRoots;
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

  // 1. Extract leaf certificate
  const verificationMaterial = bundleObj.verificationMaterial as Record<string, unknown> | undefined;
  const x509Chain = verificationMaterial?.x509CertificateChain as { certificates?: Array<{ rawBytes?: string }> } | undefined;
  const singleCert = verificationMaterial?.certificate as { rawBytes?: string } | undefined;
  const rawCert = x509Chain?.certificates?.[0]?.rawBytes ?? singleCert?.rawBytes ?? (bundleObj.cert as string | undefined) ?? (bundleObj.certificate as string | undefined);

  if (!rawCert || typeof rawCert !== "string") {
    throw new Error("Sigstore bundle missing X.509 certificate rawBytes");
  }

  let cert: X509Certificate;
  try {
    const certBytes = Buffer.from(rawCert, "base64");
    const certStr = certBytes.toString("utf8");
    cert = certStr.includes("-----BEGIN CERTIFICATE-----")
      ? new X509Certificate(certStr)
      : new X509Certificate(certBytes);
  } catch (err) {
    throw new Error(`Failed to parse X.509 certificate from Sigstore bundle: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Reject self-signed certificate
  if (cert.issuer === cert.subject) {
    throw new Error("Untrusted certificate chain: self-signed certificates cannot establish official publisher identity");
  }

  // 3. Authenticate certificate chain against trusted Sigstore roots
  const rootCertPem = options?.trustedRoots?.rootCertPem ?? FULCIO_ROOT_CERT_PEM;
  const intermediateCertPem = options?.trustedRoots?.intermediateCertPem ?? FULCIO_INTERMEDIATE_CERT_PEM;
  const rootCert = new X509Certificate(rootCertPem);
  const intermediateCert = new X509Certificate(intermediateCertPem);

  if (!rootCert.verify(rootCert.publicKey)) {
    throw new Error("Invalid Sigstore root CA: root certificate signature verification failed");
  }
  if (intermediateCert.raw.compare(rootCert.raw) !== 0 && !intermediateCert.verify(rootCert.publicKey)) {
    throw new Error("Invalid Sigstore intermediate CA: intermediate certificate was not issued by trusted root CA");
  }

  let leafChainValid = false;
  try {
    leafChainValid = cert.verify(intermediateCert.publicKey);
  } catch {}
  if (!leafChainValid) {
    try {
      leafChainValid = cert.verify(rootCert.publicKey);
    } catch {}
  }
  if (!leafChainValid) {
    throw new Error("Untrusted certificate chain: certificate was not issued by trusted Sigstore Fulcio CA");
  }

  // 4. Extract signature bytes
  const messageSignature = bundleObj.messageSignature as { messageDigest?: { digest?: string }; signature?: string } | undefined;
  const dsseEnvelope = bundleObj.dsseEnvelope as { signatures?: Array<{ sig?: string }> } | undefined;
  const rawSig = (bundleObj.base64Signature as string | undefined) ?? messageSignature?.signature ?? dsseEnvelope?.signatures?.[0]?.sig;

  if (!rawSig || typeof rawSig !== "string") {
    throw new Error("Missing signature in Sigstore bundle");
  }
  const sigBytes = Buffer.from(rawSig, "base64");
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest();
  const archiveSha256Hex = archiveSha256.toString("hex");

  // 5. Authenticate transparency log (Rekor) evidence
  const trustedRekorKeyId = options?.trustedRoots?.rekorKeyId ?? REKOR_KEY_ID;
  const rekorBundle = bundleObj.rekorBundle as {
    SignedEntryTimestamp?: unknown;
    Payload?: { body?: unknown; integratedTime?: unknown; logIndex?: unknown; logID?: unknown };
  } | undefined;
  const tlogEntries = verificationMaterial?.tlogEntries as Array<{
    logId?: { keyId?: unknown };
    logIndex?: unknown;
    integratedTime?: unknown;
    canonicalizedBody?: unknown;
  }> | undefined;

  if (rekorBundle) {
    if (!rekorBundle.SignedEntryTimestamp || typeof rekorBundle.SignedEntryTimestamp !== "string") {
      throw new Error("Invalid Rekor transparency log entry: missing SignedEntryTimestamp");
    }
    if (!rekorBundle.Payload || typeof rekorBundle.Payload !== "object") {
      throw new Error("Invalid Rekor transparency log entry: missing Payload");
    }
    if (typeof rekorBundle.Payload.logIndex !== "number" || rekorBundle.Payload.logIndex <= 0) {
      throw new Error("Invalid Rekor transparency log entry: invalid logIndex");
    }
    if (typeof rekorBundle.Payload.integratedTime !== "number" || rekorBundle.Payload.integratedTime <= 0) {
      throw new Error("Invalid Rekor transparency log entry: invalid integratedTime");
    }
    if (typeof rekorBundle.Payload.logID !== "string" || rekorBundle.Payload.logID.toLowerCase() !== trustedRekorKeyId.toLowerCase()) {
      throw new Error(`Invalid Rekor transparency log entry: logID ${String(rekorBundle.Payload.logID)} does not match trusted Rekor key ID`);
    }
    if (typeof rekorBundle.Payload.body !== "string") {
      throw new Error("Invalid Rekor transparency log entry: missing body");
    }
    try {
      const bodyJson = JSON.parse(Buffer.from(rekorBundle.Payload.body, "base64").toString("utf8")) as {
        spec?: {
          data?: { hash?: { algorithm?: string; value?: string } };
          signature?: { content?: string };
        };
      };
      const entryHash = bodyJson.spec?.data?.hash?.value?.toLowerCase();
      if (!entryHash || entryHash !== archiveSha256Hex.toLowerCase()) {
        throw new Error(`Archive SHA-256 does not match Rekor transparency log entry: expected ${entryHash ?? "none"}, got ${archiveSha256Hex}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Archive SHA-256 does not match")) throw err;
      throw new Error(`Failed to parse Rekor transparency log body: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (Array.isArray(tlogEntries) && tlogEntries.length > 0) {
    const first = tlogEntries[0]!;
    if (typeof first.logId?.keyId !== "string" || first.logId.keyId.toLowerCase() !== trustedRekorKeyId.toLowerCase()) {
      throw new Error("Invalid Rekor transparency log entry: logID does not match trusted Rekor key ID");
    }
    if (typeof first.logIndex !== "string" && typeof first.logIndex !== "number") {
      throw new Error("Invalid Rekor transparency log entry: invalid logIndex");
    }
    if (first.canonicalizedBody && typeof first.canonicalizedBody === "string") {
      try {
        const bodyJson = JSON.parse(Buffer.from(first.canonicalizedBody, "base64").toString("utf8")) as {
          spec?: { data?: { hash?: { value?: string } } };
        };
        const entryHash = bodyJson.spec?.data?.hash?.value?.toLowerCase();
        if (entryHash && entryHash !== archiveSha256Hex.toLowerCase()) {
          throw new Error(`Archive SHA-256 does not match Rekor transparency log entry: expected ${entryHash}, got ${archiveSha256Hex}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("Archive SHA-256 does not match")) throw err;
        throw new Error(`Failed to parse Rekor transparency log body: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    throw new Error("Missing transparency log evidence in Sigstore bundle: unlogged certificates cannot establish official publisher identity");
  }

  // 6. Validate structured OIDC issuer
  const expectedIssuer = options?.expectedIssuer ?? "https://token.actions.githubusercontent.com";
  const actualIssuer = extractOidcIssuer(cert);
  if (!actualIssuer) {
    throw new Error("Invalid OIDC issuer: certificate does not contain a structured OIDC issuer extension");
  }
  if (actualIssuer !== expectedIssuer) {
    throw new Error(`Invalid OIDC issuer: certificate was not issued by ${expectedIssuer} (got ${actualIssuer})`);
  }

  // 7. Validate structured workflow identity
  const expectedWorkflowUri = options?.expectedWorkflowUri ?? `https://github.com/trycua/cua/.github/workflows/cd-rust-cua-driver.yml@refs/tags/${expectedTag}`;
  const actualUri = extractSanUri(cert);
  if (!actualUri) {
    throw new Error("Certificate identity mismatch: certificate SAN does not contain a URI entry");
  }
  if (actualUri !== expectedWorkflowUri) {
    throw new Error(`Certificate identity mismatch: expected ${expectedWorkflowUri}, got ${actualUri}`);
  }

  // 8. Verify cryptographic signature over archive bytes
  let verified = false;
  try {
    verified = verify("sha256", archiveBytes, cert.publicKey, sigBytes);
  } catch {}
  if (!verified) {
    try {
      verified = verify("sha256", archiveBytes, { key: cert.publicKey, dsaEncoding: "ieee-p1363" }, sigBytes);
    } catch {}
  }
  if (!verified) {
    try {
      verified = verify("sha256", archiveBytes, { key: cert.publicKey, dsaEncoding: "der" }, sigBytes);
    } catch {}
  }
  if (!verified) {
    try {
      verified = verify(null, archiveSha256, { key: cert.publicKey, dsaEncoding: "ieee-p1363" }, sigBytes);
    } catch {}
  }
  if (!verified) {
    try {
      verified = verify(null, archiveSha256, { key: cert.publicKey, dsaEncoding: "der" }, sigBytes);
    } catch {}
  }

  if (!verified) {
    throw new Error("Sigstore signature verification failed: signature does not match archive bytes");
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
  readonly trustedRoots?: TrustedSigstoreRoots;
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

  verifyCuaSigstoreBundle(options.sigstoreBundle, options.archiveBytes, options.tag, {
    ...(options.trustedRoots ? { trustedRoots: options.trustedRoots } : {}),
  });

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
