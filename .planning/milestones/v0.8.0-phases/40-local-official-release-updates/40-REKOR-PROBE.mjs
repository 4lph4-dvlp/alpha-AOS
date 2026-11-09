// Read-only negative probes. Uses the repository's public test CA, not production trust roots.
import { readFileSync } from "node:fs";
import { createHash, sign, X509Certificate } from "node:crypto";
import { verifyCuaSigstoreBundle, REKOR_KEY_ID } from "../../../dist/src/core/computer-use-install.js";

const source = readFileSync(new URL("../../../test/cua-release-update.test.ts", import.meta.url), "utf8");
function pem(name) {
  const match = source.match(new RegExp("const " + name + " = `([\\s\\S]*?)`;"));
  if (!match) throw new Error("Missing test constant: " + name);
  return match[1];
}
const archive = Buffer.from("phase-40-read-only-rekor-probe");
const cert = new X509Certificate(pem("TEST_LEAF_CRT_PEM"));
const signature = sign("sha256", archive, pem("TEST_LEAF_KEY_PEM")).toString("base64");
const body = Buffer.from(JSON.stringify({ spec: { data: { hash: {
  algorithm: "sha256", value: createHash("sha256").update(archive).digest("hex"),
} } } })).toString("base64");
const base = {
  cert: Buffer.from(pem("TEST_LEAF_CRT_PEM")).toString("base64"),
  base64Signature: signature,
  rekorBundle: {
    SignedEntryTimestamp: Buffer.from("not-a-valid-Rekor-signature").toString("base64"),
    Payload: { body, integratedTime: Math.floor(Date.parse(cert.validFrom) / 1000) + 1, logIndex: 1, logID: REKOR_KEY_ID },
  },
};
const options = { trustedRoots: {
  rootCertPem: pem("TEST_ROOT_CRT_PEM"),
  intermediateCertPem: pem("TEST_INTER_CRT_PEM"),
  rekorPublicKeyPem: "deliberately-invalid-public-key",
} };
const expired = structuredClone(base);
expired.rekorBundle.Payload.integratedTime = 1;
const modern = structuredClone(base);
delete modern.rekorBundle;
modern.verificationMaterial = { tlogEntries: [{ logId: { keyId: REKOR_KEY_ID }, logIndex: "1" }] };
const results = [];
for (const [name, bundle] of [["forged-set-and-invalid-rekor-key", base], ["log-time-before-certificate-validity", expired], ["tlog-without-body-or-proof-or-time", modern]]) {
  try {
    results.push({ name, expected: "reject", actual: verifyCuaSigstoreBundle(bundle, archive, "cua-driver-rs-v0.39.0", options) });
  } catch (error) {
    results.push({ name, expected: "reject", rejected: true, error: error.message });
  }
}
console.log(JSON.stringify({ trustScope: "test CA override; production Rekor key ID, no valid Rekor signature", results }, null, 2));
process.exitCode = results.some((result) => result.actual?.verified) ? 1 : 0;
