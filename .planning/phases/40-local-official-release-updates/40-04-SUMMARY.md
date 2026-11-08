---
phase: 40-local-official-release-updates
plan: "04"
subsystem: packaging
tags: [local-release, gap-closure, sigstore, rekor, fulcio, transparency-log, set-verification]
requires:
  - phase: 40-local-official-release-updates
    plan: "03"
provides:
  - Cryptographic Rekor SignedEntryTimestamp (SET) verification against canonical payload bytes using trusted Rekor public key
  - Authenticated evidence time binding to leaf, intermediate, and root certificate validity periods
  - Full bundle-to-log binding across hash, signature, and leaf certificate
  - End-to-end official Sigstore bundle positive verification against actual signed payload with production roots
affects:
  - src/core/computer-use-install.ts
  - test/cua-release-update.test.ts
  - test/fixtures/cua-0.38.0.sigstore.json
actuals:
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - Rekor SET canonical JSON authentication via RFC 8785 lexicographical ordering
    - Time-bound certificate chain validity checks using authenticated transparency log evidence
    - Complete archive, signature, and certificate binding inside Rekor hashedrekord body
key-files:
  created:
    - .planning/phases/40-local-official-release-updates/40-04-SUMMARY.md
  modified:
    - src/core/computer-use-install.ts
    - test/cua-release-update.test.ts
    - test/fixtures/cua-0.38.0.sigstore.json
key-decisions:
  - "G-40-9: Authenticate Rekor SET signatures against canonicalized Payload bytes using trusted Rekor public key; reject forged SET or invalid public keys fail-closed."
  - "G-40-9: Validate evidence integratedTime against leaf, intermediate, and root certificate validity periods so valid historic releases remain verifiable while preventing time spoofing."
  - "G-40-9: Cryptographically bind logged hash, signature, and certificate inside Rekor body directly to archive bytes, bundle signature, and leaf certificate."
requirements-completed: [LOC-02, LOC-03]
verification:
  command: "node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/install.test.js dist/test/computer-use-install.test.js dist/test/update.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js; node .planning/phases/40-local-official-release-updates/40-REKOR-PROBE.mjs"
  result: "57 passed, 0 failed, 0 skipped; probe exit 0 (all 3 adversarial entries rejected)"
---

# Plan 40-04 Summary: Authenticated Rekor Transparency Log Evidence and Certificate Validity Binding (G-40-9)

Phase 40 Plan 04 (`40-04-PLAN.md`) closed the blocker gap `G-40-9` without installing or updating workstation tools, maintaining existing CA-chain, workflow identity, digest binding, selected-tool scope, and accepted-history rules:

## Gap Closure Delivered (G-40-9)

### 1. Authenticate Rekor Transparency Log Evidence and Bind Certificate Validity
- **Problem:** `verifyCuaSigstoreBundle` did not verify the Rekor SignedEntryTimestamp (SET) signature against the trusted Rekor public key. It relied solely on logID and field presence, accepted modern `tlogEntries` without body or evidence, and did not check whether the authenticated log time fell within the certificate chain validity period.
- **Fix:**
  - `src/core/computer-use-install.ts`:
    - Added RFC 8785 canonical JSON serialization (`canonicalizeRekorPayload`) for lexicographically sorted `{ body, integratedTime, logID, logIndex }` payload objects.
    - Added cryptographic SET signature verification against `rekorPublicKeyPem` (`verifyRekorSignature`) supporting DER and IEEE P1363 ECDSA encodings.
    - Authenticated both legacy `rekorBundle` and modern `tlogEntries` (requiring `inclusionPromise` or `inclusionProof` with signed checkpoint).
    - Normalized log IDs to 64-character lowercase hex (decoding base64 32-byte protobuf representations when present).
    - Bound `integratedTime` to the certificate chain: verified that `evidenceTimeMs` falls between `validFrom` and `validTo` for leaf, intermediate, and root certificates, preserving valid historic releases while rejecting forged or backdated log times.
    - Bound Rekor `hashedrekord` body content directly to the archive:
      - Algorithm must be `"sha256"`.
      - Digest value must match archive SHA-256.
      - Logged signature (`spec.signature.content`) must match bundle archive signature.
      - Logged certificate (`spec.signature.publicKey.content`) must match leaf certificate raw DER / public key SPKI.
- **Validation:**
  - Ran `40-REKOR-PROBE.mjs`: all 3 adversarial probe cases (forged SET with invalid key, log time before certificate validity, tlog without body/proof/time) are rejected (`rejected: true`, exit code 0).

### 2. Cover Real Official Success and Adversarial Inputs
- **Problem:** Existing tests used a synthetic arbitrary SET string (`"dGVzdC1zZXQ="`) and an arbitrary log ID without a corresponding Rekor key pair, and only tested non-matching payloads against official bundles rather than proving positive end-to-end official bundle success.
- **Fix:**
  - `test/cua-release-update.test.ts`:
    - Replaced dummy test log entry with an authentic test Rekor key pair (`TEST_REKOR_PRIVATE_KEY_PEM`, `TEST_REKOR_PUBLIC_KEY_PEM`) and deterministic `TEST_REKOR_KEY_ID`.
    - Updated `createTestSigstoreBundle` to sign canonical Rekor payloads using the test Rekor private key.
    - Added comprehensive negative regression cases for:
      - Tampered SET signature (`SignedEntryTimestamp verification failed`)
      - Invalid / forged Rekor public key (`Invalid Rekor public key`)
      - Evidence time outside certificate validity window (`integrated time falls outside certificate validity period`)
      - Mismatched logged signature (`Logged signature does not match bundle signature`)
      - Mismatched logged certificate (`Logged certificate does not match leaf certificate`)
      - Unsupported hash algorithm (`unsupported hash algorithm`)
      - Modern tlog missing inclusion evidence (`missing inclusion evidence`)
      - Modern tlog positive verification with valid inclusion promise
    - Updated `test/fixtures/cua-0.38.0.sigstore.json` to the official release bundle matching `docs/research/computer-use/cua-0.38.0-SHA256SUMS`.
    - Added positive end-to-end test verifying the official bundle with its actual matching signed payload against production Fulcio CA and Rekor roots (without test root overrides).

## Verification Results

- `npm run check`: Typecheck passed cleanly (exit code 0).
- `npm run build`: Build artifact manifest written cleanly (dist/build-artifact.json).
- `node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/install.test.js dist/test/computer-use-install.test.js dist/test/update.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js`: All 57 tests passed (0 fail, 0 skipped, 0 cancelled).
- `node .planning/phases/40-local-official-release-updates/40-REKOR-PROBE.mjs`: All 3 adversarial probes rejected, exit code 0.
- Catalog files (`catalog/stack.yaml`, `catalog/stack.lock.json`, `catalog/computer-use-runtime.json`) remain byte-identical.
