import assert from "node:assert/strict";
import { createHash, sign, X509Certificate } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crc32, deflateRawSync, gzipSync } from "node:zlib";
import {
  FULCIO_INTERMEDIATE_CERT_PEM,
  FULCIO_ROOT_CERT_PEM,
  REKOR_KEY_ID,
  planCuaInstall,
  verifyAndDeriveCuaReleasePin,
  verifyCuaSigstoreBundle,
  verifyOfficialCua,
  type ReviewedCuaReleasePin,
  type TrustedSigstoreRoots,
} from "../src/core/computer-use-install.js";
import { packageRoot } from "../src/core/paths.js";

const TEST_SELF_SIGNED_PEM = `-----BEGIN CERTIFICATE-----
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

const TEST_SELF_SIGNED_KEY_PEM = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIEdVighMcjzumKbbsf0dVeDbPIeSMb4+REl57bSlJ9xloAoGCCqGSM49
AwEHoUQDQgAEsrhB+S8fIOsZ9oMTVayrIYfMfeLTr0L5DlubqlS8whjzHd5nqHLz
tkrQLGx+OPNwU0XVqTIwLih1RrP6Tb/GJw==
-----END EC PRIVATE KEY-----`;

const TEST_ROOT_CRT_PEM = `-----BEGIN CERTIFICATE-----
MIIBuTCCAV+gAwIBAgIUQ36S2OyHKvvVTVsG5/iwI4hcrJ8wCgYIKoZIzj0EAwIw
KjEVMBMGA1UECgwMc2lnc3RvcmUuZGV2MREwDwYDVQQDDAhzaWdzdG9yZTAeFw0y
NjExMDgwMzI3NDRaFw0zNjExMDUwMzI3NDRaMCoxFTATBgNVBAoMDHNpZ3N0b3Jl
LmRldjERMA8GA1UEAwwIc2lnc3RvcmUwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AAQYO7j+ZhnGn4xGXulYv1HmdZGFBNEHA1IYQte5U4osIp99CYHT/muMdiSmz7g2
rl5fWFhB8fLDWti5zIUNvDS8o2MwYTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB
/wQEAwIBhjAdBgNVHQ4EFgQUJrb9H5RsQhm/roYR/mQh5s+3OC4wHwYDVR0jBBgw
FoAUJrb9H5RsQhm/roYR/mQh5s+3OC4wCgYIKoZIzj0EAwIDSAAwRQIhAPqNUd0W
mc58fpFz/6BZuWUQQAs7bFtvX+iThdTxkcAFAiBfjr5a9+M/Y5Pwm2C980Nfldlw
IDYXrhlQkWHKaCEBcQ==
-----END CERTIFICATE-----`;

const TEST_INTER_CRT_PEM = `-----BEGIN CERTIFICATE-----
MIIByTCCAW+gAwIBAgIUA1R3o9Zca4rWYQ1D+UsDtc3l+mYwCgYIKoZIzj0EAwIw
KjEVMBMGA1UECgwMc2lnc3RvcmUuZGV2MREwDwYDVQQDDAhzaWdzdG9yZTAeFw0y
NjExMDgwMzI3NDVaFw0zNjExMDUwMzI3NDVaMDcxFTATBgNVBAoMDHNpZ3N0b3Jl
LmRldjEeMBwGA1UEAwwVc2lnc3RvcmUtaW50ZXJtZWRpYXRlMFkwEwYHKoZIzj0C
AQYIKoZIzj0DAQcDQgAEl+NEmHDQshXpLOL4fnjdNyWoyKJ16V5A5SPrkCMEl5kT
P6tPcuvq3Dq5Ib39KwwnnDxikxXuu720Jc14BZhnSaNmMGQwEgYDVR0TAQH/BAgw
BgEB/wIBADAOBgNVHQ8BAf8EBAMCAYYwHQYDVR0OBBYEFI+blmMof9pylKzXFoAA
eSFENo+IMB8GA1UdIwQYMBaAFCa2/R+UbEIZv66GEf5kIebPtzguMAoGCCqGSM49
BAMCA0gAMEUCIEvAGz5aMRp39/Xh0dYCYYQTkQVid3AIiCliizdHFP9EAiEAiykI
tB/bUW0buNSZsZR7+pogISzVLOTunVgHQWPawyA=
-----END CERTIFICATE-----`;

const TEST_LEAF_CRT_PEM = `-----BEGIN CERTIFICATE-----
MIICYDCCAgegAwIBAgIUChFRanU2D6/ZGeNTu/E/wCl3NwswCgYIKoZIzj0EAwIw
NzEVMBMGA1UECgwMc2lnc3RvcmUuZGV2MR4wHAYDVQQDDBVzaWdzdG9yZS1pbnRl
cm1lZGlhdGUwHhcNMjYxMTA4MDMyNzQ1WhcNMzYxMTA1MDMyNzQ1WjAUMRIwEAYD
VQQDDAl0ZXN0LWxlYWYwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQ9XhDg0uwA
dkeIwMK9LC8sEQeIq1h3KcxZq4BEZ815+fLsAoVDf/gq/TtmPCtMgGrCSPhCk/9E
6WVNGnMlN5R0o4IBEjCCAQ4wDAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCB4Aw
cQYDVR0RBGowaIZmaHR0cHM6Ly9naXRodWIuY29tL3RyeWN1YS9jdWEvLmdpdGh1
Yi93b3JrZmxvd3MvY2QtcnVzdC1jdWEtZHJpdmVyLnltbEByZWZzL3RhZ3MvY3Vh
LWRyaXZlci1ycy12MC4zOS4wMDsGCisGAQQBg78wAQEELQwraHR0cHM6Ly90b2tl
bi5hY3Rpb25zLmdpdGh1YnVzZXJjb250ZW50LmNvbTAdBgNVHQ4EFgQUvpAsZrrw
wlZ+25BrWwTNCwaCAV0wHwYDVR0jBBgwFoAUj5uWYyh/2nKUrNcWgAB5IUQ2j4gw
CgYIKoZIzj0EAwIDRwAwRAIgC8KpRCMT6KMb3EsaWYca7QY78lsX2ibfMvE0HC+t
ZFECIAa50FeYmttU1b7z3T3YHRPOIMk3nn/IzpDexdHqFzIc
-----END CERTIFICATE-----`;

const TEST_LEAF_KEY_PEM = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIHABS6vCJMb2uYlDL4oiSOHIhx6/FVKa5EaKrDlRuKLRoAoGCCqGSM49
AwEHoUQDQgAEPV4Q4NLsAHZHiMDCvSwvLBEHiKtYdynMWauARGfNefny7AKFQ3/4
Kv07ZjwrTIBqwkj4QpP/ROllTRpzJTeUdA==
-----END EC PRIVATE KEY-----`;

const TEST_REKOR_KEY_ID = "d47b2c399f64dc68fa9f6f58e3567d3aa4b43ae0887ea2bf671086a2cedd380a";

const TEST_TRUSTED_ROOTS: TrustedSigstoreRoots = {
  rootCertPem: TEST_ROOT_CRT_PEM,
  intermediateCertPem: TEST_INTER_CRT_PEM,
  rekorKeyId: TEST_REKOR_KEY_ID,
};

function createTestSigstoreBundle(
  archiveBytes: Uint8Array,
  options?: {
    keyPem?: string;
    certPem?: string;
    rekorKeyId?: string;
    omitRekor?: boolean;
    tamperedHash?: string;
    invalidLogIndex?: boolean;
    invalidIntegratedTime?: boolean;
  },
) {
  const keyPem = options?.keyPem ?? TEST_LEAF_KEY_PEM;
  const certPem = options?.certPem ?? TEST_LEAF_CRT_PEM;
  const archiveSha256Hex = createHash("sha256").update(archiveBytes).digest("hex");
  const sig = sign("sha256", archiveBytes, { key: keyPem, dsaEncoding: "der" });
  const certDer = new X509Certificate(certPem).raw;

  const bundle: Record<string, unknown> = {
    mediaType: "application/vnd.dev.sigstore.bundle+json;version=0.1",
    base64Signature: sig.toString("base64"),
    cert: Buffer.from(certPem).toString("base64"),
    verificationMaterial: {
      x509CertificateChain: {
        certificates: [{ rawBytes: certDer.toString("base64") }],
      },
    },
    messageSignature: {
      messageDigest: {
        algorithm: "SHA2_256",
        digest: createHash("sha256").update(archiveBytes).digest("base64"),
      },
      signature: sig.toString("base64"),
    },
  };

  if (!options?.omitRekor) {
    const hashValue = options?.tamperedHash ?? archiveSha256Hex;
    const rekorBody = Buffer.from(
      JSON.stringify({
        apiVersion: "0.0.1",
        kind: "hashedrekord",
        spec: {
          data: {
            hash: {
              algorithm: "sha256",
              value: hashValue,
            },
          },
        },
      }),
    ).toString("base64");

    bundle.rekorBundle = {
      SignedEntryTimestamp: "dGVzdC1zZXQ=",
      Payload: {
        body: rekorBody,
        integratedTime: options?.invalidIntegratedTime ? -1 : 1730000000,
        logIndex: options?.invalidLogIndex ? -1 : 12345,
        logID: options?.rekorKeyId ?? TEST_REKOR_KEY_ID,
      },
    };
  }

  return bundle;
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

test("verifyCuaSigstoreBundle validates authentic Sigstore bundle and rejects forged bundles (D-13, G-40-7)", () => {
  const archive = Buffer.from("test-archive-binary-payload");
  const validBundle = createTestSigstoreBundle(archive);

  // 1. Valid bundle verifies with trusted roots
  const verified = verifyCuaSigstoreBundle(validBundle, archive, "cua-driver-rs-v0.39.0", {
    trustedRoots: TEST_TRUSTED_ROOTS,
  });
  assert.equal(verified.verified, true);
  assert.match(verified.identity, /cua-driver-rs-v0\.39\.0/);

  // 2. Reject self-signed certificate by default (G-40-7)
  const selfSignedBundle = createTestSigstoreBundle(archive, {
    keyPem: TEST_SELF_SIGNED_KEY_PEM,
    certPem: TEST_SELF_SIGNED_PEM,
  });
  assert.throws(
    () => verifyCuaSigstoreBundle(selfSignedBundle, archive, "cua-driver-rs-v0.39.0"),
    /Untrusted certificate chain: self-signed certificates cannot establish official publisher identity/,
  );

  // 3. Reject untrusted certificate chain by default without trusted roots (G-40-7)
  assert.throws(
    () => verifyCuaSigstoreBundle(validBundle, archive, "cua-driver-rs-v0.39.0"),
    /Untrusted certificate chain: certificate was not issued by trusted Sigstore Fulcio CA/,
  );

  // 4. Missing transparency log evidence rejected (G-40-7)
  const unloggedBundle = createTestSigstoreBundle(archive, { omitRekor: true });
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(unloggedBundle, archive, "cua-driver-rs-v0.39.0", {
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /Missing transparency log evidence in Sigstore bundle/,
  );

  // 5. Invalid Rekor logIndex / integratedTime rejected (G-40-7)
  const badLogIndexBundle = createTestSigstoreBundle(archive, { invalidLogIndex: true });
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(badLogIndexBundle, archive, "cua-driver-rs-v0.39.0", {
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /Invalid Rekor transparency log entry: invalid logIndex/,
  );

  const badTimeBundle = createTestSigstoreBundle(archive, { invalidIntegratedTime: true });
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(badTimeBundle, archive, "cua-driver-rs-v0.39.0", {
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /Invalid Rekor transparency log entry: invalid integratedTime/,
  );

  // 6. Mismatched Rekor log ID rejected (G-40-7)
  const badRekorIdBundle = createTestSigstoreBundle(archive, {
    rekorKeyId: "0000000000000000000000000000000000000000000000000000000000000000",
  });
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(badRekorIdBundle, archive, "cua-driver-rs-v0.39.0", {
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /does not match trusted Rekor key ID/,
  );

  // 7. Mismatched Rekor hash rejected (G-40-7)
  const badHashBundle = createTestSigstoreBundle(archive, {
    tamperedHash: "0000000000000000000000000000000000000000000000000000000000000000",
  });
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(badHashBundle, archive, "cua-driver-rs-v0.39.0", {
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /Archive SHA-256 does not match Rekor transparency log entry/,
  );

  // 8. Mismatched tag/identity rejected
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(validBundle, archive, "cua-driver-rs-v0.40.0", {
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /Certificate identity mismatch/,
  );

  // 9. Invalid OIDC issuer rejected
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(validBundle, archive, "cua-driver-rs-v0.39.0", {
        expectedIssuer: "https://evil-issuer.com",
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /Invalid OIDC issuer/,
  );

  // 10. Altered archive bytes (signature / rekor mismatch) rejected
  const tamperedArchive = Buffer.from("tampered-archive-payload");
  assert.throws(
    () =>
      verifyCuaSigstoreBundle(validBundle, tamperedArchive, "cua-driver-rs-v0.39.0", {
        trustedRoots: TEST_TRUSTED_ROOTS,
      }),
    /Archive SHA-256 does not match Rekor transparency log entry|Sigstore signature verification failed/,
  );
});

test("verifyCuaSigstoreBundle authenticates official Cua 0.38.0 bundle against official Fulcio CA and Rekor log ID (G-40-7)", async () => {
  const fixturePath = join(packageRoot(), "test", "fixtures", "cua-0.38.0.sigstore.json");
  const rawFixture = await readFile(fixturePath, "utf8");
  const bundle = JSON.parse(rawFixture) as {
    cert: string;
    rekorBundle: {
      Payload: {
        body: string;
        integratedTime: number;
        logIndex: number;
        logID: string;
      };
    };
  };

  // 1. Verify certificate chain against official Fulcio Root / Intermediate CA
  const certBytes = Buffer.from(bundle.cert, "base64");
  const leafCert = new X509Certificate(certBytes);
  const intermediate = new X509Certificate(FULCIO_INTERMEDIATE_CERT_PEM);
  const root = new X509Certificate(FULCIO_ROOT_CERT_PEM);

  assert.equal(root.verify(root.publicKey), true, "Fulcio Root CA must be self-signed valid");
  assert.equal(intermediate.verify(root.publicKey), true, "Fulcio Intermediate must be signed by Root CA");
  assert.equal(leafCert.verify(intermediate.publicKey), true, "Leaf cert must be signed by Fulcio Intermediate");
  assert.notEqual(leafCert.issuer, leafCert.subject, "Leaf cert must not be self-signed");

  // 2. Verify Rekor log entry in official bundle
  assert.equal(bundle.rekorBundle.Payload.logID, REKOR_KEY_ID);
  assert.ok(bundle.rekorBundle.Payload.logIndex > 0);
  assert.ok(bundle.rekorBundle.Payload.integratedTime > 0);
  const rekorBody = JSON.parse(Buffer.from(bundle.rekorBundle.Payload.body, "base64").toString("utf8")) as {
    spec?: { data?: { hash?: { value?: string } } };
  };
  assert.equal(
    rekorBody.spec?.data?.hash?.value,
    "5edaa74d0afa1b55a9668dbc4f32736507bd2bd4d75b18ca1dc8881bb12402b5",
  );

  // 3. Passing non-matching archive bytes passes cert chain check and fails specifically on Rekor hash check
  assert.throws(
    () => verifyCuaSigstoreBundle(bundle, Buffer.from("non-matching-archive-payload"), "cua-driver-rs-v0.38.0"),
    /Archive SHA-256 does not match Rekor transparency log entry/,
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
    trustedRoots: TEST_TRUSTED_ROOTS,
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
        trustedRoots: TEST_TRUSTED_ROOTS,
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
        trustedRoots: TEST_TRUSTED_ROOTS,
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
    trustedRoots: TEST_TRUSTED_ROOTS,
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
