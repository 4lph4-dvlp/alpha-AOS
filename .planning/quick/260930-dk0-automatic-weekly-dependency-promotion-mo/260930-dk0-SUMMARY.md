---
quick_id: 260930-dk0
status: complete
date: 2026-09-30
branch: feat/auto-dependency-promotion
commits:
  - 0d7b74c test: derive pinned versions from the stable lock instead of literals
  - 686f916 feat: unattended stage and registry re-verification for dependency promotion
  - 3ef1de4 ci: promote dependencies weekly without manual approval
  - 1a7d1a3 docs: document the unattended weekly dependency promotion
---

# Summary: automatic weekly dependency promotion

## Decision

User decision (2026-09-30): every upstream version, major or minor, is promoted
without a human approval step. Monday verifies, Wednesday lands on main when
green. This replaces the "fixture and review gates" supply-chain constraint
with automated gates (AGENTS.md, PROJECT.md, CONTRIBUTING.md, README.md,
docs/how-to/promote-dependencies.md).

## Root cause of the original report

`alpha-aos update --apply` reconciles only `catalog/stack.lock.json`; upstream
versions shown by `update --check` were never promoted because the candidate PR
(#1) sat unmerged and its latest CI run was `action_required`. Its CI also never
exercised the new versions, since the CLI reads only the stable lock.

## What changed

- `scripts/auto-promote.mjs`: `stage` promotes every changed package (exa now
  included; `promote-candidate.mjs` default list fixed too), re-pins ECC source
  hashes and recomputes the 3 global skills x 5 harness target hashes when ECC
  moves, resets the candidate. `verify-registry` refuses unpublished, altered,
  or <36h-old versions relative to a base lock.
- `.github/workflows/dependency-candidate.yml` (Mon): stage -> push lock-only
  commit to `automation/dependency-candidate` -> `promotion-verify.yml` ->
  `verified-candidate` artifact.
- `.github/workflows/auto-promote.yml` (Wed): find verified SHA -> rebase onto
  main (lock files only) -> registry re-check -> `promotion-verify.yml` ->
  fast-forward main (refuses if main moved).
- `.github/workflows/promotion-verify.yml`: reuses `ci.yml` (new
  `workflow_call` + `ref` input) and adds real GSD/ECC/MCP/Pi-bridge fixtures on
  3 OSes (unit tests only use loopback fixtures for GSD and the bridge).
- Tests no longer restate pinned versions/hashes as literals, so a promotion
  commit only moves the two lock files.

## Verification

- `npm run check`, `npm run build`, `npm run build:check`: pass.
- `auto-promote`, `promote-candidate`, `catalog` suites: 23/23 pass.
- actionlint 1.x on all four workflows: clean.
- Live Monday simulation against the registry (worktree, reverted afterwards):
  promoted gsd 1.14.0 -> 1.15.0, firecrawl-mcp 3.25.2 -> 3.26.0,
  pi-mcp-adapter 2.36.0 -> 3.3.0; real fixtures on Windows all passed
  (gsd x4 harnesses, mcp context7/exa/firecrawl via pi with bridge 3.3.0).
- Full `npm test` against the promoted lock (Windows): 948 pass, 10 skipped
  (host-capability not-run), 2 fail. Both failures were checkout-digest
  assertions in preview.test.ts tripped by concurrent doc edits during the
  run; re-running preview.test.js alone against the promoted lock: 11/11 pass.
- Simulated promotion reverted; the branch carries no lock change.

## Deviations

- STATE.md was intentionally not updated: another session owns v0.2.0 Phase 14
  on local main, and this branch must merge without touching its state.
- Planner/executor ran inline in an isolated worktree instead of subagents, so
  no agent could write into the other session's checkout.

## Not done / follow-ups

- Candidate PR #1 is obsolete and should be closed after merge.
- All-or-nothing weekly bundle: one failing package holds the week back.
- The first scheduled runs are the first real exercise of the reusable-workflow
  wiring; a manual `workflow_dispatch` of dependency-candidate.yml after merge
  is the fastest proof.
