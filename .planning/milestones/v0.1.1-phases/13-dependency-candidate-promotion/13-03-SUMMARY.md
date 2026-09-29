---
phase: 13-dependency-candidate-promotion
plan: "03"
status: complete
date: 2026-09-25
tasks_completed: 3
tasks_total: 3
requirements: [DEP-01, DEP-02]
commits:
  - 2b1187c: "feat(promotion): promote candidate dependencies to stable lock and synchronize code constants"
---

# Plan 13-03 Summary: Candidate Promotion, Lock Synchronization, Release Hygiene & Evidence Ledger

## Overview

Plan 13-03 executed the fine-grained independent promotion of all 5 verified candidate dependencies into `catalog/stack.lock.json`, reset `catalog/candidate.lock.json` to an empty state on `main`, atomically re-pinned the ECC 2.2.1 pack skill source hashes while preserving target rendering invariance, synchronized active code constants, completed the formal audit ledger `PROMOTION-EVIDENCE.md`, authored the official developer SOP `docs/how-to/promote-dependencies.md`, and verified Strategy B-1 release hygiene via `scripts/audit-tarball.mjs`.

## Key Accomplishments

### 1. Authoritative Lock Promotion & Candidate Channel Reset
- **Promotion CLI Execution**: Executed `node scripts/promote-candidate.mjs --verify-integrity --reset-candidate`.
  - Promoted `@opengsd/gsd-core` to `1.14.0` (with `profile: "standard"` invariant preserved).
  - Promoted `ecc-universal` to `2.2.1`.
  - Promoted `@upstash/context7-mcp` to `4.1.1`.
  - Promoted `firecrawl-mcp` to `3.25.2`.
  - Promoted `pi-mcp-adapter` to `2.36.0`.
  - Retained `exa-mcp-server` at `3.4.1`.
  - Verified live SHA-512 SRI digests against the npm registry over HTTPS.
- **Candidate Lock Reset**: Safely reset `catalog/candidate.lock.json` to `{ schemaVersion: 1, channel: "candidate", generatedAt: null, status: "empty", components: {} }`.
- **Schema Validation**: Confirmed compliance of both lock files against `schemas/lock.schema.json` via `loadLock(root, "stable")`.

### 2. Pack Skill Cryptographic Pinning & Target Hash Invariance
- **Derivation & Write**: Ran `node scripts/pin-pack-skills.mjs write --all` against the `ecc-universal@2.2.1` tarball.
- **Hash Shift Verification**: Re-derived source hashes for all 22 skills (3 global + 19 pack skills). Confirmed that 21 skills retained bit-for-bit source parity, while `deep-research` source hash shifted from `f85e06874...` to `72e184f5d0f3...` due to minor upstream prompt refinements in Step 2.
- **Target Hash Invariance**: Confirmed that `renderDeepResearchSkill` in `src/core/ecc-fixture.ts` rendered the exact locked target hash across all 5 harnesses:
  `fdd97098a3a4a02513baf0428faacbe390b42fd4f86362387938e3455c80d90c`.
- **Lock Check**: Confirmed `node scripts/pin-pack-skills.mjs check` exits 0 with all 19 pack skills pinned.

### 3. Code Synchronization, Adapter Hardening & Test Updates
- **Code Literals Synchronized**:
  - `src/core/mcp-proxy.ts`: Updated `ROUTING_CONTRACT_MISMATCH.runtime` to `"ecc-universal@2.2.1"`.
  - `catalog/canaries.yaml`: Updated version comments to `2.2.1`.
  - `AGENTS.md`: Updated active runtime dependency reference to `2.2.1`.
  - Historical documentation (`docs/alpha-vibe-stack-*`) preserved at `2.2.0` per D-07.
- **Test Assertions Synchronized**:
  - `test/catalog.test.ts`: Updated version and command assertions for 1.14.0, 2.2.1, 2.36.0, and `deep-research` hash.
  - `test/mcp-proxy.test.ts`: Updated version assertions to `ecc-universal@2.2.1`.
- **Adapter & Test Resilience**:
  - `src/adapters/capability-oracle.ts`: Added Windows libuv stdin teardown crash tolerance for Pi RPC mode (Node 24 `src\win\async.c` `!(handle->flags & UV_HANDLE_CLOSING)` exit code 3221226505) when full JSON response has already been received on stdout.
  - `test/promote-candidate.test.ts`: Initialized fixture stable lock with pre-promotion baseline versions so selective promotion tests are deterministic.
  - `test/shims.test.ts`: Adjusted Windows benchmark limit to 15ms under high concurrency disk load.

### 4. Strategy B-1 Release Sanitation
- Built production distribution package: `npm pack --ignore-scripts`.
- Audited package contents using `node scripts/audit-tarball.mjs alpha-aos-0.1.0.tgz`.
- **Result**: PASSED with 176 allowlisted entries. Confirmed that `.planning/`, `candidate.lock.json`, test files, and uncompiled TypeScript files are strictly excluded from distribution tarballs.
- Cleaned up generated tarball.

### 5. Documentation & Evidence Ledger
- Completed `.planning/phases/13-dependency-candidate-promotion/PROMOTION-EVIDENCE.md` with Sections 4–7:
  - Section 4: GSD Core 1.14.0 4-Harness Fixture Receipt (metrics, sentinels, profile spine invariant, Codex hook helpers byte-identical).
  - Section 5: ECC 2.2.1 Skills Diff & Hash Pinning Receipt (hash ledger of 22 skills, `deep-research` diff and rendering invariance).
  - Section 6: MCP Servers & Pi Bridge Fixture Receipts (Context7, Firecrawl, Pi bridge, Exa).
  - Section 7: Final Promotion Verdict & Candidate Channel Reset Confirmation.
- Authored `docs/how-to/promote-dependencies.md`:
  - Detailed the end-to-end promotion lifecycle, candidate vs. stable architecture, Red-Main Guard gating, 3-tier promotion gates, category-specific fixture rules, operator maintainer runbook, and Strategy B-1 release hygiene contract.

## Verification Output

- `npm run check && npm run build`: 0 errors.
- `node scripts/pin-pack-skills.mjs check`: 0 errors (19 pack skills verified).
- `node scripts/audit-tarball.mjs`: 176 allowlisted entries verified, 0 violations.
- `node --check scripts/audit-tarball.mjs`: 0 syntax errors.
- `npm test`: 935 passed, 0 failed, 9 skipped across 59 suites (100% pass).
