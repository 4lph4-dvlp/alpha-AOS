---
phase: 13-dependency-candidate-promotion
plan: "01"
status: complete
date: 2026-09-25
tasks_completed: 3
tasks_total: 3
requirements: [DEP-01]
commits:
  - ce00a9a: "fix(fixture): harden npm pack excerpt buffer and resolve direct launch for pi on windows"
  - 8889e26: "feat(promote): implement candidate promotion script and test suite"
  - 3da3333: "feat(pinner): support version bump hash updates in pin-pack-skills"
---

# Plan 13-01 Summary: Fixture Hardening, Promotion CLI & Pre-Flight Verification

## Overview

Plan 13-01 prepared and hardened the maintainer automation, cryptographic pinner, and fixture execution layers for Phase 13 dependency candidate promotion. All five candidate components were validated locally through pre-flight fixtures prior to remote baseline execution.

## Key Changes & Accomplishments

### 1. Fixture Execution Layer Hardening (`src/core/mcp-fixture.ts`, `test/mcp-fixture.test.ts`)
- **Buffer Truncation Fix**: Configured `excerptBytes: 256 * 1024` in `verifyPackage` when running `npm pack --json`. This prevents `runProcess` from defaulting to a 4 KB buffer, eliminating `SyntaxError: Unterminated string in JSON` on large package manifests (such as `pi-mcp-adapter@2.36.0`'s ~23 KB file list).
- **Windows Launcher Normalization**: Updated `installPiBridge` to resolve `pi` using `resolveDirectLaunch` from `src/adapters/capability-oracle.ts`. On Windows, this normalizes `pi.cmd` to `node <cli.js>` for shell-free argument execution, preventing `spawn EINVAL`.
- **Unit Test Coverage**: Created `test/mcp-fixture.test.ts` covering large manifest parsing (>64 KB), malformed JSON handling, `excerptBytes` configuration, and Windows `.cmd` launcher normalization. All 4 tests passed.

### 2. Maintainer Promotion CLI (`scripts/promote-candidate.mjs`, `test/promote-candidate.test.ts`)
- **CLI Implementation**: Developed `scripts/promote-candidate.mjs` supporting `--verify-integrity`, `--components <list>`, `--reset-candidate`, `--dry-run`, and `--root`.
- **Integrity & Schema Safety**: Automatically validates live SHA-512 SRI against the npm registry over HTTPS, preserves the GSD Core `profile: "standard"` invariant, resets candidate lock to empty status, and verifies updated lockfiles using `loadLock(root, "stable")`.
- **Unit Test Coverage**: Implemented `test/promote-candidate.test.ts` testing CLI help, dry-run immutability, selective component promotion, full promotion with mock registry integrity, mismatch rejection, and schema validation. All 5 tests passed.

### 3. Pack Skill Pinner Upgrade (`scripts/pin-pack-skills.mjs`)
- **Version Upgrade Support**: Added `--all`, `--update-all`, and `--recompute` flags to `scripts/pin-pack-skills.mjs`.
- **Hash Update Invariance**: Allowed acquired skill source hashes to update existing pinned hashes on version upgrades (e.g. `deep-research`'s source hash shift) without failing cross-check assertions. Verified that `node scripts/pin-pack-skills.mjs check` passes with 19 pack skills verified.

### 4. Local Pre-Flight Component Fixture Receipts
All 5 candidate components passed clean pre-flight verification:
1. **`@opengsd/gsd-core@1.14.0`**: Standard profile, 23 skills, stop-hook smoke passed.
2. **`ecc-universal@2.2.1`**: Tarball acquired, SRI integrity verified, 22 skills rendered, target hash invariance confirmed for `deep-research` (`fdd97098a3a4a02513baf0428faacbe390b42fd4f86362387938e3455c80d90c`).
3. **`@upstash/context7-mcp@4.1.1`**: Stdio JSON-RPC initialize & `tools/list` handshake passed (`resolve-library-id`, `query-docs`).
4. **`firecrawl-mcp@3.25.2`**: Stdio JSON-RPC initialize & `tools/list` handshake passed (`firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, `firecrawl_check_crawl_status`).
5. **`pi-mcp-adapter@2.36.0`**: Clean bridge installation via direct launcher on Windows without spawn errors (`bridgeVersion=2.36.0`).

## Verification Output

- `npm run check && npm run build`: 0 errors.
- `node --test dist/test/mcp-fixture.test.js`: 4 pass, 0 fail.
- `node --test dist/test/promote-candidate.test.js`: 5 pass, 0 fail.
- `node scripts/pin-pack-skills.mjs check`: 0 errors, 19 pack skills verified.
- Pre-flight candidate fixtures: 5/5 components pass cleanly.
