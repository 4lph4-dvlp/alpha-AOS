---
phase: 07-cross-platform-release-proof
plan: 08
subsystem: release-engineering
tags: [support-matrix, gap-closure, harness-parity, evidence-tiering]
status: complete

# Dependency graph
requires:
  - phase: 07-cross-platform-release-proof
    provides: "07-VERIFICATION.md gap G-07-1 (stale Truth 2/REL-02 claim) registered under D-18 by quick task 260922-puy"
provides:
  - "src/core/support-matrix.ts judging claude through the identical evaluateMatrixCell evidence path as codex, antigravity, pi, and hermes"
  - "docs/SUPPORT_MATRIX.md regenerated to reflect claude's evidence-based UNVERIFIED cells instead of a fixed RESIDUE claim"
  - "Confirmed (unedited) catalog/stack.yaml and catalog/canaries.yaml claude-inclusive parity with codex, and a recorded justification for policy.canaryHarness staying codex"
affects: [support-matrix, docs, catalog-confirmation-only]

tech-stack:
  added: []
  patterns:
    - "activeSurfaces/activeEntries now type over the full HarnessId union; a harness gains evidence-tiered cells by adding an entry to activeSurfaces, never by branching inside evaluateMatrixCell"

key-files:
  created: []
  modified:
    - src/core/support-matrix.ts
    - test/support-matrix.test.ts
    - docs/SUPPORT_MATRIX.md

key-decisions:
  - "Claude's four surfaces (GSD Core/GSD_CORE, Context7/CAPA-01, Unified Memory/CAPA-03, Project Packs/CAPA-05) mirror codex's own four rows exactly in shape and notes, grounded in catalog/stack.yaml's harnesses.claude block (same gsdTarget/eccTarget shape as codex), catalog/canaries.yaml's claude membership on all five declared canaries, and project-plan.ts's SURFACE_CEILING claude entry ('supported', the strongest non-hermes/antigravity ceiling recorded)"
  - "policy.canaryHarness stays codex by design: confirmed it is consumed only at src/core/plan.ts:43,50 (which harness's GSD install runs at rollout phase 2 vs phase 4) and src/core/install.ts:665 (which harness's fixture validates a changed MCP-server rollout before other targets), neither of which is reachable from support-matrix.ts's evaluateMatrixCell/activeSurfaces — it is an install-rollout pilot-harness selector, not a support-matrix evidence gate, so no catalog edit was needed to close G-07-1"
  - "A real Claude Code canary invocation was deliberately NOT run by this plan (per Task 2's explicit deferral and this phase's own 07-02/07-05 precedent of never spending a real model turn inside a deterministic gap-closure plan); the follow-up commands are recorded below rather than fabricated or silently skipped"
  - ".planning/REQUIREMENTS.md's REL-02 body text was left untouched, per the gap's own instruction not to touch it until real Claude invocation evidence exists"

patterns-established:
  - "No harness identity may special-case its way out of evaluateMatrixCell's shared unsupported/undetected/no-ledger/no-receipt/matching-receipt evaluation chain; every claimed harness surface lives in activeSurfaces and is judged identically"

requirements-completed: [REL-02]

verification:
  - kind: automated
    ref: "npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/support-matrix.test.js && ! grep -q 'harnessId === \"claude\"' src/core/support-matrix.ts"
    status: pass
    details: "check and build clean; support-matrix.test.js: 6/6 pass; grep found zero occurrences of the removed claude special-case branch"
  - kind: automated
    ref: "[ \"$(grep -c 'claude' catalog/canaries.yaml)\" -eq 5 ] && [ \"$(grep -c 'claude' catalog/stack.yaml)\" -eq 7 ] && npm test"
    status: pass
    details: "catalog/canaries.yaml: 5 claude occurrences (unchanged); catalog/stack.yaml: 7 claude occurrences (unchanged); full suite: 907 tests, 898 pass, 0 fail, 9 skipped (pre-existing platform skips)"

actuals:
  tokens: 2460
  tasks: 2
  commits: 1
---

# Phase 07 Plan 08: Close Support-Matrix Gap G-07-1 (Claude Evidence Parity) Summary

Removed the hardcoded `harnessId === "claude"` branch in `evaluateMatrixCell` and the structural `Exclude<HarnessId, "claude">` type exclusion on `activeSurfaces`, so Claude Code is now judged by the exact same evidence-based tiering (unsupported → undetected → no-ledger → no-receipt → matching-receipt) as codex, antigravity, pi, and hermes — closing gap G-07-1 without granting Claude any free pass to PROVEN.

## What Was Built

### Task 1: Remove Claude's hardcoded tier and judge it by the same evidence rule as every other harness

**`src/core/support-matrix.ts`:**
- Widened `activeSurfaces`'s type constraint from `Readonly<Record<Exclude<HarnessId, "claude">, ...>>` to `Readonly<Record<HarnessId, ...>>` and added a `claude` entry with exactly four surfaces, mirroring codex's own four rows in shape and notes verbatim: GSD Core/`GSD_CORE` ("Lifecycle controller and state writer"), Context7/`CAPA-01` ("Version-sensitive documentation lookup"), Unified Memory/`CAPA-03` ("Cross-harness handoff sender and receiver"), Project Packs/`CAPA-05` ("Evidence-selected project capability materialization").
- Updated the `activeEntries` cast's key type from `Exclude<HarnessId, "claude">` to `HarnessId` to match.
- Removed the standalone claude entry from `BASE_SUPPORT_MATRIX` (the one that named "All managed surfaces" at a fixed `RESIDUE` baseline tier outside `activeEntries`). Claude's real surfaces now flow entirely through `activeEntries`.
- Deleted the early-return branch at the top of `evaluateMatrixCell` that special-cased `entry.harnessId === "claude"` and returned a fixed `RESIDUE` tier before any evidence check ran. Every cell — claude's included — now reaches the shared unsupported-check, undetected-harness-check, unavailable-ledger-check, and matching-receipt-check in the order they already ran for every other harness.
- Restated the one-sentence taxonomy summary above the rendered table to describe all four tiers generically ("A cell reaches **PROVEN** only through a matching, inspectable real-host invocation receipt; an unmatched claim is **UNVERIFIED**; a surface offered only for legacy compatibility is **RESIDUE**; and a structurally incompatible surface is **UNSUPPORTED**.") without naming any specific harness. The `## Taxonomy` bullet list further down was left unchanged, as instructed — it already defines each tier generically.

**`test/support-matrix.test.ts`:**
- Replaced the "support taxonomy refuses false PROVEN states" test's lookup of the removed standalone claude entry with a lookup of claude's Context7 surface (mirroring the existing codex/Context7 lookup pattern), asserting it evaluates to `UNVERIFIED` both when claude is absent from the inventory and when claude is present but the ledger carries no matching receipt.
- Added a new test, "inspectable matching invocation receipt promotes Claude active cell to PROVEN", following the exact structure of the existing Antigravity-parity test: a synthetic claude/Context7 `SupportMatrixEntry` bound to `CAPA-01`, asserting `UNVERIFIED` with an evidence summary mentioning "canary" when unreceipted, and `PROVEN` with a receipt reference naming the ledger file and a matching `observedAt` when a matching proof exists.
- In "compiled doctor exposes table and structured matrix diagnostics": replaced the assertion matching the old fixed claude/RESIDUE row with an assertion that the rendered table contains a `claude / GSD Core / all / UNVERIFIED` row (deterministic because the test's isolated, receipt-free state root always yields an empty ledger, so claude — detected or not — never has a matching receipt), an assertion that `RESIDUE` never appears anywhere in the table output, and (on the JSON side) an assertion that no cell's `tier` is `RESIDUE` and an assertion that at least one cell's `entry.harnessId` is `claude`. Widened the test's local JSON response type to also expose `entry.harnessId`.

**`docs/SUPPORT_MATRIX.md`:** Regenerated via a scratch Node ESM script (not committed) that imported the compiled `evaluateSupportMatrix`/`renderSupportMatrixMarkdown` from `dist/src/core/support-matrix.js`, using the same `inventory([])` (all five harnesses, none detected) and empty-ledger fixtures the test file's own helpers build, with the fixed `generatedAt: "2026-09-18T00:00:00.000Z"` and `platform: "linux"` the byte-identical test asserts against. The regenerated table now lists claude's four surfaces (GSD Core, Context7, Unified Memory, Project Packs) at `UNVERIFIED`, exactly parallel to codex's four rows, with no `RESIDUE` row anywhere.

### Task 2: Confirm catalog canary-eligibility, run the full regression suite, and record what stays honestly deferred

**Catalog confirmations (no edits made to either file):**
- `catalog/stack.yaml`'s `harnesses.claude` block (lines 16-19: `displayName: Claude Code`, `gsdTarget: claude`, `eccTarget: claude`) is confirmed equal in shape to `harnesses.codex` (lines 20-23: `displayName: Codex`, `gsdTarget: codex`, `eccTarget: codex`). Both declare `gsdTarget`/`eccTarget`.
- `catalog/canaries.yaml`'s claude harness identifier is confirmed present in the `harnesses:` array of all five declared canaries (`DOCUMENTATION_VERSION_SCOPED`, `RESEARCH_MULTI_SOURCE`, `PACK_EXERCISE_FRONTEND_A11Y`, `CROSS_HARNESS_HANDOFF`, `ORDINARY_LOOKUP_CONTROL`), alongside codex on every one — read directly, not inferred.
- Post-Task-1 grep counts match the plan's recorded baseline exactly: `grep -c 'claude' catalog/canaries.yaml` = 5, `grep -c 'claude' catalog/stack.yaml` = 7. Neither file's shape changed.

**`policy.canaryHarness` scope confirmation:** Read `src/core/plan.ts:43,50` and `src/core/install.ts:665` directly. In `plan.ts`, `catalog.policy.canaryHarness` decides which one harness's `gsd:<target>` install action is scheduled at rollout phase 2 ("canary first", line 43) versus phase 4 for the rest (line 50's note explains why). In `install.ts:665`, it decides which one harness's fixture validates a changed MCP-server rollout (`changedMcpTargets`) before that change reaches the other install targets, falling back to `install.targets[0]` if the canary harness isn't part of the install. Cross-checked `src/core/support-matrix.ts`'s `evaluateMatrixCell`/`activeSurfaces` (the Task-1-corrected version) and confirmed neither call site is referenced by, or reachable from, any part of the support-matrix evidence path — `support-matrix.ts` imports only from `./capability-ledger.js` and `../types.js`, never from `plan.ts`, `install.ts`, or `catalog.ts`. `canaryHarness` is exclusively an install/bootstrap pilot-harness selector for rollout sequencing; it does not gate REL-02/Truth 2's per-cell evidence tiering, which Task 1 already fixed at the `evaluateMatrixCell` level. Therefore `policy.canaryHarness` correctly remains `codex` by design and needed no change to close G-07-1. Widening it (e.g., to an array of eligible pilot harnesses, or an install-time `--harness claude` override) would be an unrelated production behavior change to install-rollout sequencing, out of scope for this gap-closure plan.

**Full regression suite:** `npm test` (after Task 1's change) ran the complete suite: **907 tests, 898 pass, 0 fail, 9 skipped** (pre-existing platform-conditional skips, unrelated to this plan). Zero regressions introduced by the widened `HarnessId` coverage in `activeSurfaces` or the removed `evaluateMatrixCell` branch.

**Explicitly deferred, not silently skipped:**
- **Real Claude Code canary invocation:** NOT run by this plan. Claude's support-matrix cells remain honestly `UNVERIFIED` after this plan lands — they were structurally incapable of ever reaching `PROVEN` before this plan and now can, but no receipt exists yet on any host. The only legitimate way to promote them is a real invocation producing a genuine inspectable receipt. A human can trigger:
  1. `alpha-aos doctor --canary --harness claude --no-spend` (readiness check only, zero cost)
  2. `alpha-aos doctor --canary --harness claude --capability CAPA-01` (or another declared capability, when ready to spend a real model turn)
- **`.planning/REQUIREMENTS.md`'s REL-02 body text:** left untouched, per the gap's own instruction not to touch it until real Claude invocation evidence exists. This reconciliation stays deferred to a future plan that runs the canary above.
- **`docs/RELEASE_NOTES_v0.1.0.md` and other REL-06 artifacts:** untouched — explicitly out of scope for this gap.
- Truths 1, 3, 4, 5 and Requirements REL-01, REL-03, REL-04, REL-05, REL-06: unaffected, byte-identical to their pre-plan state.

## Deviations from Plan

None - plan executed exactly as written. Task 2 made no catalog edits, exactly as the plan's own action anticipated ("no catalog edit was needed").

## Commits

- `d0f9795`: `fix(07-08): remove Claude hardcoded RESIDUE tier from support matrix` — Task 1 (src/core/support-matrix.ts, test/support-matrix.test.ts, docs/SUPPORT_MATRIX.md)
- Task 2 produced no file changes (confirmation-only + regression run), so no separate commit exists for it; its findings are recorded in this Summary.

## Known Stubs

None. This plan wired Claude into the same evidence path every other active harness already uses; no new stub was introduced.

## Threat Flags

None. The single relevant threat (T-07-08-01, Elevation of Privilege on `evaluateMatrixCell`) was already assessed in the plan's own threat model as `mitigate`-disposed and low severity — removing claude's hardcode makes it reachable by PROVEN for the first time, but only through the identical `matchingReceipt`/`receiptIsInspectable` gate already required of every other active harness. No new promotion path was introduced.

## Self-Check: PASSED
- [x] `src/core/support-matrix.ts` contains zero occurrences of `harnessId === "claude"` (verified by grep as part of Task 1's automated verify)
- [x] `test/support-matrix.test.ts` compiles and all 6 support-matrix tests pass
- [x] `docs/SUPPORT_MATRIX.md` is byte-identical to the structured source (asserted by "support matrix markdown stays byte-identical to the structured source", which passed)
- [x] `catalog/stack.yaml` and `catalog/canaries.yaml` are unmodified (confirmed via `git status` and grep counts matching the plan's recorded baseline)
- [x] `.planning/REQUIREMENTS.md` is unmodified (no edits made)
- [x] Full suite (`npm test`) passes: 907 tests, 898 pass, 0 fail, 9 skipped
- [x] Commit `d0f9795` exists in git log
