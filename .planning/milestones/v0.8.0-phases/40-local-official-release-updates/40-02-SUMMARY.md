---
phase: 40-local-official-release-updates
plan: "02"
subsystem: packaging
tags: [local-release, apply, revalidation, stack-lock-synthesis, tool-records, cli, format]
requires:
  - phase: 40-local-official-release-updates
    plan: "01"
    provides: local official release discovery, reviewed plan token codec, and Cua Sigstore verifier
provides:
  - Strict TOCTOU revalidation without moving /latest queries (revalidateLocalReleasePlan)
  - In-memory StackLock synthesis with dynamic ECC skill hashes from verified tarballs
  - Tool and target-filtered managed installation orchestration (ManagedInstallOptions.selectedTools & cuaPin)
  - Zero-checkout-mutation tool-records persistence with verified: null and acceptedTransitions: [] preserving accepted identities
  - 4-tier structured release preview and apply outcome formatters (formatLocalReleasePreview, formatLocalReleaseApplyResult)
  - Unified CLI flags (--tool, --target, --check, --apply, --plan-digest, --reviewed-plan, --json) with fail-closed refusal rules
affects:
  - src/cli.ts
  - src/format.ts
  - src/types.ts
  - src/core/update.ts
  - src/core/install.ts
actuals:
  tokens: 18500
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - TOCTOU revalidation with plan-drift fail-closed abort
    - In-memory USTAR tarball skill extraction and renderEccSkill hash synthesis without disk writes
    - Bound token and plan-digest required CLI apply boundary
    - Four-tier structured preview (Identity -> Affected Harnesses -> Native Side Effects -> Recovery Scope)
key-files:
  created:
    - .planning/phases/40-local-official-release-updates/40-02-SUMMARY.md
  modified:
    - src/types.ts
    - src/core/update.ts
    - src/core/install.ts
    - src/cli.ts
    - src/format.ts
    - test/local-release-update.test.ts
key-decisions:
  - "D-01/D-02: install and update commands support --tool <id[,id]> and --target <harness[,harness]> filtering, executing only the requested and changed tool steps."
  - "D-03: update --tool <absent> refuses with install guidance ('Tool \"<id>\" is not installed. Use \"alpha-aos install --tool <id>\" to install it.') rather than implicitly installing."
  - "D-04: update --stage is retired with explicit guidance ('The --stage option has been retired...'), refusing with non-zero exit and never creating or modifying candidate.lock.json."
  - "D-05/D-06: --apply strictly requires both --plan-digest and --reviewed-plan. On apply, only the bound version endpoints (/<pkg>/<version> and GitHub tag cua-driver-rs-v<version>) are queried—never /latest."
  - "D-07: formatLocalReleasePreview lists changed tools first with four structured tiers: ① Release Identity & Artifact, ② Affected Harnesses, ③ Native Side Effects, ④ Recovery Scope, followed by unchanged/absent summary and runnable command."
  - "D-08: Any local pre-state drift or metadata mismatch between preview and apply throws ComponentPlanError('plan-drift') before mutations."
  - "D-16: applyLocalReleasePlan leaves checkout catalog/*.json byte-identical and writes tool-records with verified: null and acceptedTransitions: [] to preserve unperformed host invocation evidence and existing accepted chains."
requirements-completed: [LOC-02, LOC-03]
verification:
  command: "npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/update.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js && npm run check"
  result: "37 passed, 0 failed; strict typecheck passed"
---

# Plan 40-02 Summary: Bound Release Apply, StackLock Synthesis, Tool-Records Persistence, and CLI Refusal Rules

Phase 40 Wave 2 (`40-02-PLAN.md`) implemented the bound apply transaction pipeline, in-memory `StackLock` synthesis, tool-records persistence, 4-tier structured preview and apply formatters, and CLI flags with fail-closed refusal rules.

## Core Capabilities Delivered

1. **Bound TOCTOU Apply Revalidation (`src/core/update.ts`):**
   - `revalidateLocalReleasePlan`: decodes `--reviewed-plan` token, verifies `--plan-digest`, inspects local pre-state via `collectToolInventory` to catch pre-apply drift (`ComponentPlanError("plan-drift")`), and queries exact version endpoints (`/<pkg>/<version>` and GitHub release tag `cua-driver-rs-v<version>`) without touching `/latest`.
   - Idempotency guard: if all selected tools are already current, `applyLocalReleasePlan` returns `applied: false` without performing external commands or writes (`D-08`).

2. **In-Memory StackLock Synthesis (`src/core/update.ts`):**
   - `synthesizeReleaseStackLock`: clones the stable lock in memory, applies reviewed npm package versions and integrities, and when ECC is updated, extracts `package/skills/<skill>/SKILL.md` from the verified `ecc-universal` tarball and computes `sourceSha256` and per-harness `targetSha256` via `renderEccSkill`, satisfying `requireEccLock` without modifying `catalog/stack.lock.json` (`D-16`).

3. **Tool-Records Persistence with Unverified Identity Integrity (`src/core/update.ts`):**
   - Interacts with `userStateRoot()/tool-records` through `withToolRecordSession`, journaling `started` -> `tool-result` -> `finished` events.
   - Preserves `verified: null` and `acceptedTransitions: []`, ensuring that without explicit host invocation tests, previously accepted versions are not prematurely overwritten.
   - Leaves checkout catalog files (`catalog/stack.lock.json`, `catalog/candidate.lock.json`, `catalog/computer-use-runtime.json`) byte-identical before and after apply.

4. **Structured 4-Tier Formatter (`src/format.ts`):**
   - `formatLocalReleasePreview`: presents changed tools first, detailing:
     ① Release Identity & Artifact (Current/Accepted, Planned Release, Source URL, Artifact digest)
     ② Affected Harnesses (Requested targets and shared blast radius across harnesses)
     ③ Native Installer Side Effects (junctions, PATH entries, extension paths, unverified notes)
     ④ Recovery Scope (Transactional rollback vs Adapter recovery vs Unrecovered effects)
   - Bottom summary presents unchanged tools (`already current`), skipped absent tools (`미설치 · 변경 없음 (skip-absent)`), and blocked reasons with copy-pasteable `--apply` command or `--tool` filter advice (`D-07`, `D-11`).
   - `formatLocalReleaseApplyResult`: formats operation ID, changed/unchanged tools, applied steps, and external changes.

5. **CLI Dispatch and Fail-Closed Refusal Rules (`src/cli.ts`):**
   - `alpha-aos install` and `alpha-aos update` parse `--tool <id[,id]>`, `--target <harness[,harness]>`, `--check`, `--apply`, `--plan-digest <digest>`, `--reviewed-plan <token>`, and `--json`.
   - `alpha-aos update --stage` refuses with deprecation guidance and does not create or modify `candidate.lock.json` (`D-04`).
   - `alpha-aos update --tool <absent>` refuses with `install --tool <absent>` guidance instead of implicitly installing (`D-03`).
   - `alpha-aos install --apply` and `alpha-aos update --apply` without `--plan-digest` / `--reviewed-plan` refuse before any mutation, prompting the user to preview first (`D-05`).

## Verification Results

- `dist/test/local-release-update.test.js` (16 tests): verifies `/latest` refusal on apply, `plan-drift` detection, no-op on current tools, in-memory ECC hash synthesis, catalog invariance, `tool-records` persistence with `verified: null`, 4-tier formatter rendering, `update --stage` refusal, `update --tool <absent>` refusal, and missing plan token refusal.
- `dist/test/cua-release-update.test.js` (5 tests): verifies Cua Sigstore verification, ZIP and tar.gz parsing, dynamic pin derivation, and version directory retention.
- `dist/test/update.test.js`, `dist/test/tool-inventory-cli.test.js`, `dist/test/tool-inventory-compat.test.js`: all 16 regression tests passed.
- Total Phase 40 target suite: 37 passed, 0 failed.
- Strict typecheck (`npm run check`): 0 errors.
