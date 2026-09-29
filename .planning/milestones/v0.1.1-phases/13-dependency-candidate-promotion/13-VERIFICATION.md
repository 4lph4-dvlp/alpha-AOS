---
phase: 13-dependency-candidate-promotion
verified: 2026-09-25T07:46:00Z
status: passed
score: 18/18 must-haves verified
behavior_unverified: 0
overrides_applied: 0
overrides: []
flagged_prohibitions: 0
prohibitions_resolved: "All prohibitions held"
human_verification: []
---

# Phase 13: Dependency Candidate Promotion Verification Report

**Phase Goal:** Users receive the validated dependency candidate in the stable lock, promoted only through the red-main guard on green three-OS evidence with verified integrity.
**Verified:** 2026-09-25T07:46:00Z
**Status:** passed
**Re-verification:** No. Initial verification.

## Goal Achievement & Requirement Traceability

### Requirement DEP-01: Candidate Dependency Verification
- **Isolated Component Pre-Flight Fixtures**:
  - GSD Core 1.14.0 verified across all 4 supported harnesses (`claude`, `codex`, `antigravity`, `pi`) via `src/core/gsd-fixture.ts`. Global sentinels reported clean, 23 skills verified, Codex stop-hook compatibility smoke passed cleanly, and Codex hook helpers (`hook-exit.js`, `cli-exit.js`, `exit-code-registry.js`) proved byte-identical to 1.12.0.
  - `ecc-universal@2.2.1` tarball acquired, SRI verified, 22 skills extracted, and `deep-research` target rendered hash invariance confirmed (`fdd97098a3a4...`) across all 5 harnesses.
  - `@upstash/context7-mcp@4.1.1` and `firecrawl-mcp@3.25.2` verified via stdio JSON-RPC protocol handshakes and `tools/list` responses.
  - `pi-mcp-adapter@2.36.0` verified with 256 KB excerpt buffer and direct launcher normalization on Windows.
- **Remote Baseline Proof**:
  - Baseline CI on `main` executed and passed on all 4 jobs across Linux, macOS, and Windows ([Run #36092161231](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36092161231)).
- **Red-Main Guard Gating**:
  - `scripts/check-main-baseline.mjs --branch main --update-pr --pr-number 1` evaluated `eligible: true`, updated the PR #1 banner, and safely removed the `promotion-blocked` label.
- **Candidate 3-OS CI Matrix**:
  - Rebased `automation/dependency-candidate` (PR #1) onto green `main` and executed GitHub Actions [Run #36092908991](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36092908991). All 4 matrix jobs passed 100% with 0 failures across Ubuntu, macOS, and Windows.

### Requirement DEP-02: Authoritative Lock Promotion & Reset
- **Maintainer Promotion Automation**:
  - Developed and verified `scripts/promote-candidate.mjs` and test suite `test/promote-candidate.test.ts`.
  - Promoted 5 candidate dependencies into `catalog/stack.lock.json` with live SRI hashes verified over HTTPS against npm registry metadata:
    - `@opengsd/gsd-core`: `1.14.0` (with `profile: "standard"` invariant preserved)
    - `ecc-universal`: `2.2.1`
    - `@upstash/context7-mcp`: `4.1.1`
    - `firecrawl-mcp`: `3.25.2`
    - `pi-mcp-adapter`: `2.36.0`
    - `exa-mcp-server`: `3.4.1` (retained)
  - Updated `generatedAt` on `catalog/stack.lock.json` and validated schema compliance via `loadLock(root, "stable")`.
- **Candidate Lock Reset**:
  - Reset `catalog/candidate.lock.json` on `main` to `{ schemaVersion: 1, channel: "candidate", generatedAt: null, status: "empty", components: {} }`.
- **Pack Skill Cryptographic Pinning**:
  - Re-derived `sourceSha256` for all 22 skills in ECC 2.2.1 via `scripts/pin-pack-skills.mjs write --all`. Confirmed `deep-research` target rendered hash remains byte-identical (`fdd97098a3a4...`) across all 5 harnesses.
- **Code Constants & Unit Test Synchronization**:
  - Synchronized active code literals in `src/core/mcp-proxy.ts` (`ROUTING_CONTRACT_MISMATCH.runtime = "ecc-universal@2.2.1"`), `catalog/canaries.yaml`, `AGENTS.md`, `test/catalog.test.ts`, and `test/mcp-proxy.test.ts`, while preserving historical release docs per D-07.
- **Strategy B-1 Release Sanitation**:
  - Built distribution tarball via `npm pack --ignore-scripts` and audited contents via `scripts/audit-tarball.mjs`. Confirmed 176 allowlisted entries and 0 violations, proving `.planning/` and `candidate.lock.json` are strictly excluded from distribution tarballs.
- **Documentation & Runbooks**:
  - Authored formal evidence ledger `PROMOTION-EVIDENCE.md` with complete receipts across all 7 sections.
  - Authored `docs/how-to/promote-dependencies.md` detailing the complete promotion lifecycle, architecture, and maintainer SOP.

---

## Observable Truths Matrix

| # | Truth / Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Candidate components have live SHA-512 SRI hashes matching npm registry manifests bit-for-bit (DEP-01, DEP-02, D-01) | ✓ VERIFIED | Verified during promotion execution and recorded in `PROMOTION-EVIDENCE.md` Section 1. |
| 2 | GSD Core 1.14.0 passes 4-harness isolated fixtures with `profile: "standard"` invariant preserved and global sentinels clean (DEP-01, D-14, D-16) | ✓ VERIFIED | `PROMOTION-EVIDENCE.md` Section 4; 23 skills verified; Codex stop-hook smoke passed. |
| 3 | GSD Core 1.14.0 Codex hook helpers are byte-identical to 1.12.0, requiring no renderer hash changes in `src/core/gsd-compat.ts` (DEP-01, D-15) | ✓ VERIFIED | `PROMOTION-EVIDENCE.md` Section 4; diff of `hook-exit.js`, `cli-exit.js`, `exit-code-registry.js` confirmed byte-identical. |
| 4 | ECC 2.2.1 tarball extracts 22 skills, with 21 skills retaining byte-identical source parity and `deep-research` source hash updated (DEP-01, D-06, D-08) | ✓ VERIFIED | `PROMOTION-EVIDENCE.md` Section 5; hash ledger recorded for all 22 skills. |
| 5 | `deep-research` rendered target hash across all 5 harnesses remains `fdd97098a3a4...` in ECC 2.2.1 (DEP-01, D-06, D-08) | ✓ VERIFIED | `PROMOTION-EVIDENCE.md` Section 5; deterministic target hash invariance confirmed. |
| 6 | CAPA-02 routing reconciliation finding in `src/core/mcp-proxy.ts` is retained and synchronized to `runtime: "ecc-universal@2.2.1"` (DEP-01, D-07, D-09) | ✓ VERIFIED | `src/core/mcp-proxy.ts:160` and `test/mcp-proxy.test.ts:1457` verified passing. |
| 7 | Historical documentation (`docs/alpha-vibe-stack-*`) retains historical `2.2.0` record without modification (DEP-01, D-07) | ✓ VERIFIED | Git diff confirms no modifications to historical release docs. |
| 8 | MCP servers Context7 4.1.1 and Firecrawl 3.25.2 pass isolated stdio JSON-RPC initialization and tool discovery (DEP-01, D-18) | ✓ VERIFIED | `PROMOTION-EVIDENCE.md` Section 6; tools listed and allowlist filter verified. |
| 9 | Pi MCP adapter 2.36.0 passes buffer-hardened extraction and direct launcher installation on Windows without spawn errors (DEP-01, D-18) | ✓ VERIFIED | `src/core/mcp-fixture.ts:58-165` and `test/mcp-fixture.test.ts` pass cleanly. |
| 10 | Remote `main` baseline is proven green across all 3 operating systems before candidate unblocking (DEP-01, D-10, D-12) | ✓ VERIFIED | GitHub Actions Run #36092161231 passed 100% across Ubuntu, macOS, and Windows. |
| 11 | Red-Main Guard evaluates `eligible: true` on green baseline, updates PR banner, and removes `promotion-blocked` label (DEP-01, D-12) | ✓ VERIFIED | `scripts/check-main-baseline.mjs` executed; PR #1 unblocked. |
| 12 | Candidate PR #1 passes 100% across all 4 jobs of GitHub Actions 3-OS CI matrix (DEP-01, D-13) | ✓ VERIFIED | GitHub Actions Run #36092908991 passed 100% across all 4 matrix jobs. |
| 13 | Maintainer promotion CLI `scripts/promote-candidate.mjs` supports selective promotion, registry SRI verification, candidate reset, and schema validation (DEP-02, D-20) | ✓ VERIFIED | `test/promote-candidate.test.ts` passes 5/5 tests. |
| 14 | `catalog/stack.lock.json` contains promoted candidate versions and passes `loadLock(root, "stable")` (DEP-02, D-01) | ✓ VERIFIED | Lockfile validated against `schemas/lock.schema.json`. |
| 15 | `catalog/candidate.lock.json` is reset on `main` to `status: "empty"` with empty components (DEP-02, D-03) | ✓ VERIFIED | `catalog/candidate.lock.json` verified reset. |
| 16 | `scripts/pin-pack-skills.mjs check` verifies all 19 pack skills are pinned in `catalog/stack.lock.json` (DEP-02, D-06) | ✓ VERIFIED | `node scripts/pin-pack-skills.mjs check` exits 0 with 19 pack skills pinned. |
| 17 | Strategy B-1 release hygiene is validated via `npm pack` and `scripts/audit-tarball.mjs` (DEP-02, D-05, D-21) | ✓ VERIFIED | Tarball audit verified 176 allowlisted entries; 0 violations; `.planning/` and `candidate.lock.json` strictly excluded. |
| 18 | Full test suite (`npm test`) passes with 0 failures across all 59 test suites (DEP-01, DEP-02) | ✓ VERIFIED | 935 passed, 0 failed, 9 skipped across 59 suites (100% pass). |

---

## Prohibitions Check

- **MUST NOT include unverified candidate dependencies or candidate lock records in `catalog/stack.lock.json`**: HELD. All promoted components passed live SRI checks, isolated fixtures, and 3-OS matrix CI.
- **MUST NOT leave active candidate components in `catalog/candidate.lock.json` on `main`**: HELD. Candidate channel on `main` is reset to `status: "empty"`, `components: {}`.
- **MUST NOT alter historical documentation (`docs/alpha-vibe-stack-*`) when synchronizing code constants to 2.2.1**: HELD. Historical documents remain untouched.
- **MUST NOT package `.planning/`, `candidate.lock.json`, or test files into release distribution archives**: HELD. Enforced via `scripts/audit-tarball.mjs` with positive allowlist.

---

**Score:** 18/18 must-haves verified  
**Status:** PASSED
