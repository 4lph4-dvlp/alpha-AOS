import assert from "node:assert/strict";
import { createHash, sign, X509Certificate } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32, deflateRawSync, gzipSync } from "node:zlib";
import {
  planCuaInstall,
  verifyAndDeriveCuaReleasePin,
  verifyCuaSigstoreBundle,
  verifyOfficialCua,
  type ReviewedCuaReleasePin,
} from "../src/core/computer-use-install.js";
import { packageRoot } from "../src/core/paths.js";

const TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIICFDCCAbmgAwIBAgIUKKuUoJAddyo80HBhzN9UftT3tgowCgYIKoZIzj0EAwIw
HzEdMBsGA1UEAwwUU2lnc3RvcmUgRnVsY2lvIFRlc3QwHhcNMjYxMTA3MTY0MjA1
WhcNMzYxMTA0MTY0MjA1WjAfMR0wGwYDVQQDDBRTaWdzdG9yZSBGdWxjaW8gVGVz
dDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABLK4QfkvHyDrGfaDE1WsqyGHzH3i
069C+Q5bm6pUvMIY8x3eZ6hy87ZK0CxsfjjzcFNF1akyMC4odUaz+k2/xiejgdIw
gc8wcQYDVR0RBGowaIZmaHR0cHM6Ly9naXRodWIuY29tL3RyeWN1YS9jdWEvLmdp
dGh1Yi93b3JrZmxvd3MvY2QtcnVzdC1jdWEtZHJpdmVyLnltbEByZWZzL3RhZ3Mv
Y3VhLWRyaXZlci1ycy12MC4zOS4wMDsGCisGAQQBg78wAQEELQwraHR0cHM6Ly90
b2tlbi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTAdBgNVHQ4EFgQUAvNK
BdG+wkEcN/l/4TZtbYlEfUowCgYIKoZIzj0EAwIDSQAwRgIhAIphbFjthAFU4PcY
7fNgAhZ92j/0YjeJV/sJAf1LL0l/AiEA0tDhr2rugjy6oi0pbDhvOKU3kTuOfmIf
eIIqk3khljw=
-----END CERTIFICATE-----`;

const TEST_KEY_PEM = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIEdVighMcjzumKbbsf0dVeDbPIeSMb4+REl57bSlJ9xloAoGCCqGSM49
AwEHoUQDQgAEsrhB+S8fIOsZ9oMTVayrIYfMfeLTr0L5DlubqlS8whjzHd5nqHLz
tkrQLGx+OPNwU0XVqTIwLih1RrP6Tb/GJw==
-----END EC PRIVATE KEY-----`;

function createTestSigstoreBundle(
  archiveBytes: Uint8Array,
  keyPem = TEST_KEY_PEM,
  certPem = TEST_CERT_PEM,
) {
  const hash = createHash("sha256").update(archiveBytes).digest();
  const sig = sign(null, hash, { key: keyPem, dsaEncoding: "ieee-p1363" });
  const certDer = new X509Certificate(certPem).raw;
  return {
    mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.1",
    verificationMaterial: {
      x509CertificateChain: {
        certificates: [{ rawBytes: certDer.toString("base64") }],
      },
    },
    messageSignature: {
      messageDigest: {
        algorithm: "SHA2_256",
        digest: hash.toString("base64"),
      },
      signature: sig.toString("base64"),
    },
  };
}

function createZip(files: Record<string, string | Uint8Array>): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const compBuf = deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);
    localHeaders.push(localHeader, compBuf);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);
    centralHeaders.push(centralHeader);

    offset += localHeader.length + compBuf.length;
  }
  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) centralDirSize += h.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function createTarGz(files: Record<string, string | Uint8Array>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, "utf8");
    header.write(dataBuf.length.toString(8).padStart(11, "0") + " ", 124, 12, "utf8");
    header.write("0", 156, 1, "utf8");
    header.write("ustar\0", 257, 6, "utf8");
    header.write("00", 263, 2, "utf8");

    header.fill(32, 148, 156);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i] ?? 0;
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");

    blocks.push(header, dataBuf);
    const pad = (512 - (dataBuf.length % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test("verifyCuaSigstoreBundle validates authentic Sigstore bundle and rejects forged bundles (D-13)", () => {
  const archive = Buffer.from("test-archive-binary-payload");
  const validBundle = createTestSigstoreBundle(archive);

  // 1. Valid bundle verifies
  const verified = verifyCuaSigstoreBundle(validBundle, archive, "cua-driver-rs-v0.39.0");
  assert.equal(verified.verified, true);
  assert.match(verified.identity, /cua-driver-rs-v0\.39\.0/);

  // 2. Mismatched tag/identity rejected
  assert.throws(
    () => verifyCuaSigstoreBundle(validBundle, archive, "cua-driver-rs-v0.40.0"),
    /Certificate identity mismatch/,
  );

  // 3. Invalid OIDC issuer rejected
  assert.throws(
    () => verifyCuaSigstoreBundle(validBundle, archive, "cua-driver-rs-v0.39.0", { expectedIssuer: "https://evil-issuer.com" }),
    /Invalid OIDC issuer/,
  );

  // 4. Altered archive bytes (signature mismatch) rejected
  const tamperedArchive = Buffer.from("tampered-archive-payload");
  assert.throws(
    () => verifyCuaSigstoreBundle(validBundle, tamperedArchive, "cua-driver-rs-v0.39.0"),
    /Archive SHA-256 does not match|Sigstore signature verification failed/,
  );
});

test("verifyAndDeriveCuaReleasePin parses ZIP archive, checks SHA256SUMS and derives file hashes (D-13)", () => {
  const archive = createZip({
    "cua-driver.exe": "binary-cua-driver-exe",
    "cua-cursor-theme.exe": "binary-cursor-theme-exe",
    "cua-driver-uia.exe": "binary-driver-uia-exe",
  });
  const archiveSha256 = createHash("sha256").update(archive).digest("hex");
  const assetName = "cua-driver-rs-0.39.0-windows-x86_64-binary.zip";
  const sha256sumsText = `${archiveSha256}  ${assetName}\n`;
  const bundle = createTestSigstoreBundle(archive);

  const pin = verifyAndDeriveCuaReleasePin({
    version: "0.39.0",
    tag: "cua-driver-rs-v0.39.0",
    os: "windows",
    arch: "x64",
    assetName,
    archiveBytes: archive,
    archiveUrl: `https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.39.0/${assetName}`,
    sha256sumsText,
    sigstoreBundle: bundle,
  });

  assert.equal(pin.version, "0.39.0");
  assert.equal(pin.tag, "cua-driver-rs-v0.39.0");
  assert.equal(pin.os, "windows");
  assert.equal(pin.arch, "x64");
  assert.equal(pin.entrypoint, "cua-driver.exe");
  assert.equal(pin.archiveSha256, archiveSha256);
  assert.ok(pin.files["cua-driver.exe"]);
  assert.ok(pin.files["cua-cursor-theme.exe"]);
  assert.ok(pin.files["cua-driver-uia.exe"]);
  assert.ok(pin.installer.directory);
});

test("verifyAndDeriveCuaReleasePin rejects SHA256SUMS mismatch and path traversal entries (D-13)", () => {
  const validArchive = createZip({ "cua-driver.exe": "valid" });
  const assetName = "cua-driver-rs-0.39.0-windows-x86_64-binary.zip";
  const bundle = createTestSigstoreBundle(validArchive);

  // SHA256SUMS mismatch
  assert.throws(
    () =>
      verifyAndDeriveCuaReleasePin({
        version: "0.39.0",
        tag: "cua-driver-rs-v0.39.0",
        os: "windows",
        arch: "x64",
        assetName,
        archiveBytes: validArchive,
        archiveUrl: `https://example.com/${assetName}`,
        sha256sumsText: `0000000000000000000000000000000000000000000000000000000000000000  ${assetName}\n`,
        sigstoreBundle: bundle,
      }),
    /checksum-mismatch/,
  );

  // Path traversal entry in archive rejected
  const maliciousArchive = createZip({ "../evil.exe": "malicious payload" });
  const evilSha256 = createHash("sha256").update(maliciousArchive).digest("hex");
  const evilBundle = createTestSigstoreBundle(maliciousArchive);

  assert.throws(
    () =>
      verifyAndDeriveCuaReleasePin({
        version: "0.39.0",
        tag: "cua-driver-rs-v0.39.0",
        os: "windows",
        arch: "x64",
        assetName,
        archiveBytes: maliciousArchive,
        archiveUrl: `https://example.com/${assetName}`,
        sha256sumsText: `${evilSha256}  ${assetName}\n`,
        sigstoreBundle: evilBundle,
      }),
    /Unsafe archive entry/,
  );
});

test("verifyAndDeriveCuaReleasePin parses tar.gz archive on Linux (D-12, D-13)", () => {
  const archive = createTarGz({
    "cua-driver": "linux-cua-driver-binary",
    "cua-cursor-theme": "linux-cursor-theme-binary",
    "wayland-helper/install.sh": "echo wayland",
  });
  const archiveSha256 = createHash("sha256").update(archive).digest("hex");
  const assetName = "cua-driver-rs-0.39.0-linux-x86_64-binary.tar.gz";
  const sha256sumsText = `${archiveSha256}  ${assetName}\n`;
  const bundle = createTestSigstoreBundle(archive);

  const pin = verifyAndDeriveCuaReleasePin({
    version: "0.39.0",
    tag: "cua-driver-rs-v0.39.0",
    os: "linux",
    arch: "x64",
    assetName,
    archiveBytes: archive,
    archiveUrl: `https://github.com/trycua/cua/releases/download/cua-driver-rs-v0.39.0/${assetName}`,
    sha256sumsText,
    sigstoreBundle: bundle,
  });

  assert.equal(pin.os, "linux");
  assert.equal(pin.entrypoint, "cua-driver");
  assert.ok(pin.files["cua-driver"]);
  assert.ok(pin.files["wayland-helper/install.sh"]);
});

test("planCuaInstall supports dynamic pin and sets CUA_DRIVER_RS_KEEP_VERSIONS: 2 (D-14, D-15)", async () => {
  const dynamicPin: ReviewedCuaReleasePin = {
    version: "0.39.0",
    tag: "cua-driver-rs-v0.39.0",
    os: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
    arch: process.arch,
    assetName: "dummy.zip",
    archiveUrl: "https://example.com/dummy.zip",
    archiveSha256: "a".repeat(64),
    entrypoint: process.platform === "win32" ? "cua-driver.exe" : "cua-driver",
    files: {
      [process.platform === "win32" ? "cua-driver.exe" : "cua-driver"]: "b".repeat(64),
    },
    installedFiles: {
      [process.platform === "win32" ? "cua-driver.exe" : "cua-driver"]: "b".repeat(64),
    },
    publisherIdentity: "https://github.com/trycua/cua/.github/workflows/cd-rust-cua-driver.yml@refs/tags/cua-driver-rs-v0.39.0",
    installer: {
      directory: "scripts/vendor/cua-driver-0.38.0",
      sourceCommit: "85e2b1318bd77ccf3cfa88ccdf875a4bb7eaed19",
      files: {
        "install.ps1": "d9d4d29aa10c76dcc1bb3595cd9003d2fbf554f99c09ce3dd6147dfaa869da9b",
        "install.sh": "a103177e0df86d04d752bfa20c73f99a3e501906f1814c3127da84788539d9ba",
        "_install-common.psm1": "99f34a84ceab04d4b488b1db4d71536c7a7ac7e645ac2ec295b4fd85244085b6",
        "_install-common.sh": "0d5d4b023bfe9111db810b0fde2be23188b703a94093b438edc79b0af8f4b987",
        "_install-rust.sh": "1fc19c3c35bb459c5d1987f3d1b8ab54bffb457b7827bfae06147b36e56d28e3",
      },
    },
  };

  const plan = await planCuaInstall(undefined, packageRoot(), dynamicPin);
  assert.equal(plan.spec.environment?.literal?.CUA_DRIVER_RS_VERSION, "0.39.0");
  assert.equal(plan.spec.environment?.literal?.CUA_DRIVER_RS_KEEP_VERSIONS, "2");
  if (process.platform === "win32") {
    assert.ok(plan.spec.args.includes("-Release"));
    assert.ok(plan.spec.args.includes("0.39.0"));
  }
});
