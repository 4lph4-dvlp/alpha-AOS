---
phase: 40-local-official-release-updates
plan: "01"
subsystem: packaging
tags: [local-release, preview, npm-registry, cua-driver, sigstore, sha256sums]
requires:
  - phase: 39-tool-inventory-and-local-release-records
    provides: unified 7-tool inventory observation and local record persistence engine
provides:
  - Local official release resolution (npm latest SemVer check, bounded Cua GitHub Releases discovery)
  - Zero-filesystem-write preview generator (LocalReleasePlan) with bound token codec (encodeReviewedReleasePlan / decodeReviewedReleasePlan)
  - Pure Node.js Cua Sigstore X.509 bundle & SHA256SUMS archive verifier and local file hash derivation adapter
  - Cua version retention adapter (CUA_DRIVER_RS_KEEP_VERSIONS: "2") preserving prior working release directory
affects:
  - 40-02-PLAN.md
  - src/cli.ts
  - src/format.ts
  - src/core/install.ts
actuals:
  tokens: 14200
  tasks: 2
  commits: 4
tech-stack:
  added: []
  patterns:
    - Zero-write preview with bound reviewed-plan base64url token
    - Pure Node.js X.509 SAN URI and OIDC issuer check with ECDSA P-256 signature verification
    - In-memory ZIP Central Directory and tar.gz block extraction with path traversal fail-closed boundaries
    - Bounded GitHub releases pagination with nightly/draft/withdrawn exclusions
key-files:
  created:
    - test/local-release-update.test.ts
    - test/cua-release-update.test.ts
    - .planning/phases/40-local-official-release-updates/40-01-SUMMARY.md
  modified:
    - src/types.ts
    - src/core/update.ts
    - src/core/computer-use-install.ts
    - test/computer-use-install.test.ts
key-decisions:
  - "D-01/D-03: install and update share the local release resolver; install targets absent/unaccepted tools while update plans upgrades for installed tools and skips absent tools by default."
  - "D-05/D-06: Preview writes nothing to disk (SAFE-01) and emits a copy-pasteable --apply command bound to plan-digest and reviewed-plan token."
  - "D-09/D-10: npm latest pointing to a semantic prerelease refuses with latest-is-prerelease; Cua releases page limit or missing platform asset refuses with incomplete-discovery / unsupported-platform without falling back to older releases."
  - "D-13/D-14/D-15: Cua driver dynamically verifies official SHA256SUMS and Sigstore workflow certificate identity before deriving local file hashes, using CUA_DRIVER_RS_KEEP_VERSIONS: '2' to retain the previous working version."
patterns-established:
  - "encodeReviewedReleasePlan / decodeReviewedReleasePlan: compressed base64url serialization for preview-apply binding contracts."
  - "extractArchiveFiles: in-memory archive extraction for .zip and .tar.gz with safeName boundary assertions."
requirements-completed: [LOC-02, LOC-03]
verification:
  command: "npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/update.test.js dist/test/computer-use-install.test.js"
  result: "27 passed, 0 failed, 0 skipped"
---

# Plan 40-01 Summary: Local Official Release Resolution and Cua Sigstore Verification

Phase 40 Wave 1 (`40-01-PLAN.md`) implemented the local official release discovery and read-only preview engine alongside the dynamic Cua Sigstore/SHA256SUMS archive verification and version retention adapter.

## Core Capabilities Delivered

1. **Local Official Release Resolution (`src/core/update.ts`):**
   - `resolveNpmStableRelease`: strictly validates `^\d+\.\d+\.\d+$`, refuses semantic prereleases (`latest-is-prerelease`), and checks `sha512-...` SRI metadata (`invalid-metadata`).
   - `resolveCuaStableRelease`: traverses GitHub releases up to `maxPages: 10`, selects highest `cua-driver-rs-v<X.Y.Z>` tag excluding `draft`, `nightly-*`, and withdrawn `0.28.3`, refuses platform mismatches with `unsupported-platform`, and requires `SHA256SUMS` + `.sigstore.json`.
   - `createLocalReleasePlan`: collects current observations, resolves official releases, classifies tools into changed and unchanged sections, aggregates multi-tool failures into `applyAllowed: false` with `--tool` filter advice, calculates shared affected harness blast radius, and emits runnable `--apply` commands with `--plan-digest` and `--reviewed-plan`.

2. **Reviewed Plan Token Codec (`src/core/update.ts`):**
   - `encodeReviewedReleasePlan`: serializes `ReviewedReleasePlanPayload` via raw deflate + base64url into shell-safe compact tokens.
   - `decodeReviewedReleasePlan`: inflates and validates schema, throwing `ComponentPlanError("plan-incomplete", ...)` on corruption.

3. **Cua Cryptographic Verification Adapter (`src/core/computer-use-install.ts`):**
   - `verifyCuaSigstoreBundle`: verifies `.sigstore.json` using Node built-in `node:crypto` (`X509Certificate`, `verify`), enforcing OIDC issuer `https://token.actions.githubusercontent.com`, workflow SAN URI `https://github.com/trycua/cua/.github/workflows/cd-rust-cua-driver.yml@refs/tags/<tag>`, and ECDSA P-256 signature over archive SHA-256.
   - `extractArchiveFiles`: in-memory extraction of `.zip` (via central directory + `inflateRawSync`) and `.tar.gz` (via `gunzipSync` + 512-byte block parser) with `safeName` and traversal rejection.
   - `verifyAndDeriveCuaReleasePin`: authenticates archive against `SHA256SUMS` and Sigstore bundle, derives entrypoint and companion file SHA-256 digests, and attaches committed installer provenance.
   - `planCuaInstall` / `verifyOfficialCua` / `installCua`: extended to accept dynamic `ReviewedCuaReleasePin` or `userStateRoot()/cua-release-pin.json`, configuring `CUA_DRIVER_RS_KEEP_VERSIONS: "2"` to retain the prior working release.

4. **Automated Verification:**
   - `dist/test/local-release-update.test.js`: 11 unit/integration tests verifying SAFE-01 zero disk writes, token codec round-trips, absent tool skipping, explicit `--tool` absent refusal, prerelease rejection, incomplete discovery, Linux unverified notes, and multi-tool advice.
   - `dist/test/cua-release-update.test.js`: 5 unit/integration tests verifying authentic vs forged Sigstore bundles, ZIP and TAR.GZ parsing, SHA256SUMS checks, path traversal rejection, dynamic pin planning, and `CUA_DRIVER_RS_KEEP_VERSIONS: "2"` retention.
