---
phase: 40-local-official-release-updates
plan: "03"
subsystem: packaging
tags: [local-release, gap-closure, sigstore, fulcio, rekor, mcp-filtering, sri-integrity]
requires:
  - phase: 40-local-official-release-updates
    plan: "01"
  - phase: 40-local-official-release-updates
    plan: "02"
provides:
  - Reviewed mutation scope enforcement (only revalidated changed tools passed to applyManagedInstall; selected MCP servers propagated across plans, canary fixtures, and apply)
  - Cryptographic Sigstore verification against embedded Fulcio Root/Intermediate CAs and Rekor transparency log evidence with self-signed certificate rejection
  - Mandatory exact-version SHA-512 SRI integrity validation on npm revalidation rejecting missing dist, absent/null/non-string/malformed integrity, and integrity drift
affects:
  - src/core/install.ts
  - src/core/update.ts
  - src/core/computer-use-install.ts
  - test/cua-release-update.test.ts
  - test/local-release-update.test.ts
actuals:
  tokens: 15600
  tasks: 3
  commits: 2
tech-stack:
  added: []
  patterns:
    - X.509 certificate chain validation against embedded Fulcio Root/Intermediate CA
    - Rekor transparency log payload body hash and logID authentication
    - Reviewed mutation scope filtering for MCP servers and tools
    - Mandatory exact-version SHA-512 SRI validation
key-files:
  created:
    - test/fixtures/cua-0.38.0.sigstore.json
    - .planning/phases/40-local-official-release-updates/40-03-SUMMARY.md
  modified:
    - src/core/install.ts
    - src/core/update.ts
    - src/core/computer-use-install.ts
    - test/cua-release-update.test.ts
    - test/local-release-update.test.ts
key-decisions:
  - "G-40-5: applyLocalReleasePlan forwards only revalidated changed tools (revalidated.changedTools.map((t) => t.toolId)) to applyManagedInstall, and propagates selected MCP server IDs across managed install planning, MCP sync, and canary fixtures."
  - "G-40-7: verifyCuaSigstoreBundle validates leaf certificates against embedded Fulcio Root/Intermediate CAs, rejects self-signed certificates by default, verifies Rekor transparency log ID and entry hash against the archive, and parses structured OIDC issuer and SAN URI extensions."
  - "G-40-8: revalidateLocalReleasePlan strictly validates that exact-version npm metadata includes a valid dist.integrity matching /^sha512-[A-Za-z0-9+/]+=*$/ and equals the reviewed plan integrity, rejecting missing dist, missing/null/non-string integrity, malformed integrity, or drifted integrity with plan-drift."
requirements-completed: [LOC-02, LOC-03]
verification:
  command: "npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/install.test.js dist/test/computer-use-install.test.js dist/test/update.test.js"
  result: "61 passed, 0 failed, 0 skipped"
---

# Plan 40-03 Summary: Gap Closure for Local Official Release Updates

Phase 40 Wave 3 (`40-03-PLAN.md`) addressed and resolved the three automated UAT gap findings identified during milestone verification (`G-40-5`, `G-40-7`, `G-40-8`) without executing unreviewed real workstation mutations:

## Gap Closures Delivered

### 1. Enforce Reviewed Mutation Scope (G-40-5)
- **Problem:** `applyLocalReleasePlan` forwarded `payload.selectedTools` instead of the revalidated `changedTools` list into `applyManagedInstall`. Additionally, when selecting a single MCP tool (e.g. `mcp:context7`), managed installation planning registered and ran canary fixtures for all MCP servers (`context7`, `exa`, `firecrawl`).
- **Fix:**
  - `src/core/update.ts`: `applyLocalReleasePlan` now passes `selectedTools: revalidated.changedTools.map((t) => t.toolId)` to `applyManagedInstall`.
  - `src/core/install.ts`: `createManagedInstallPlan`, `createManagedInstallOperationPlan`, and `applyManagedInstall` derive `selectedMcpServers` from `options.selectedTools`. MCP sync planning passes `selected: selectedMcpServers`, and MCP canary fixtures are filtered strictly to `selectedMcpServers ?? mcpServerIds()`.
- **Validation:** Added isolated tests in `test/local-release-update.test.ts` verifying that `selectedTools: ["mcp:context7"]` restricts step planning strictly to Context7, limits canary fixtures to `["context7"]`, and omits GSD, ECC, and Cua runtime operations.

### 2. Authenticate Cua Publisher Identity with Sigstore Fulcio and Rekor (G-40-7)
- **Problem:** `verifyCuaSigstoreBundle` previously accepted any certificate passed in the bundle, including self-signed test certificates, without verifying the certificate chain against trusted Sigstore roots or verifying Rekor transparency log evidence.
- **Fix:**
  - `src/core/computer-use-install.ts`:
    - Embedded official `FULCIO_ROOT_CERT_PEM`, `FULCIO_INTERMEDIATE_CERT_PEM`, `REKOR_PUBLIC_KEY_PEM`, and `REKOR_KEY_ID`.
    - Added `TrustedSigstoreRoots` option interface for deterministic offline unit testing.
    - Added self-signed certificate rejection (`cert.issuer === cert.subject`).
    - Cryptographically verified leaf certificate issuance against Fulcio intermediate/root CA.
    - Verified Rekor transparency log evidence (`rekorBundle` or `verificationMaterial.tlogEntries`) requiring matching `REKOR_KEY_ID`, positive `logIndex`, positive `integratedTime`, and matching archive SHA-256 in decoded Rekor payload body.
    - Extracted structured OIDC issuer (OID `1.3.6.1.4.1.57264.1.1`) and verified exact match against `https://token.actions.githubusercontent.com`.
    - Extracted SAN URI and verified exact match against official workflow URI.
- **Validation:** Added `test/fixtures/cua-0.38.0.sigstore.json` (official bundle from GitHub release). Updated `test/cua-release-update.test.ts` proving that self-signed negative probes are rejected by default, untrusted chains are rejected, missing Rekor evidence is rejected, and official Cua bundle verifies against official Fulcio CA.

### 3. Require Exact-Version SHA-512 SRI Metadata (G-40-8)
- **Problem:** `revalidateLocalReleasePlan` only verified integrity if `data.dist?.integrity` was already a string, allowing missing `dist`, absent `integrity`, or malformed metadata to bypass verification.
- **Fix:**
  - `src/core/update.ts`: `revalidateLocalReleasePlan` now requires `data.dist` to exist, `data.dist.integrity` to be a string matching `/^sha512-[A-Za-z0-9+/]+=*$/`, and `data.dist.integrity === tool.integrity`. Any missing, non-string, malformed, or drifted integrity throws `ComponentPlanError("plan-drift")`.
- **Validation:** Added tests in `test/local-release-update.test.ts` covering missing `dist`, null/absent `integrity`, malformed integrity, drifted integrity, and valid matching SHA-512 integrity.

## Verification Results

- `npm run check`: Typecheck passed cleanly (exit code 0).
- `node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/install.test.js dist/test/computer-use-install.test.js dist/test/update.test.js`: All 61 tests passed without failure.
- Invariance checks: `catalog/stack.lock.json` and `catalog/computer-use-runtime.json` remain byte-identical; accepted transitions and tool records maintain `verified: null`.
