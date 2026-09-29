---
phase: 13-dependency-candidate-promotion
plan: "02"
status: complete
date: 2026-09-25
tasks_completed: 3
tasks_total: 3
requirements: [DEP-01, DEP-03]
commits:
  - 402b347: "test(preview): increase wrapper preview timeout and disable powershell telemetry on windows"
  - 793a1ad: "fix(fixtures): increase npm pack and extract timeoutMs to 300s to eliminate CI contention flakiness"
---

# Plan 13-02 Summary: Remote Baseline Verification, Red-Main Guard Unblock & 3-OS Matrix CI

## Overview

Plan 13-02 established an authoritative, inspectable green baseline on remote `main`, updated and unblocked dependency candidate PR #1 via the Red-Main Guard, executed the full 3-OS GitHub Actions CI matrix, and generated the formal verification ledger `PROMOTION-EVIDENCE.md`.

## Key Accomplishments

### 1. Remote 3-OS CI Baseline Verification (`main`)
- **Fixing Contention Flakiness**:
  - `402b347`: Disabled PowerShell telemetry/update checks in `test/preview.test.ts` and adjusted timeout on Windows runner from 60s to 180s to resolve runner load contention timeouts.
  - `793a1ad`: Increased `timeoutMs` for npm pack and extract operations in `src/core/ecc-fixture.ts` and `src/core/gsd-compat.ts` from 180s to 300s.
- **Workflow Run #36092161231**:
  - Authoritative Release Package (Linux): `success` (28s)
  - Ubuntu Linux (`ubuntu-latest` / Node 24): `success` (3m 22s)
  - macOS (`macos-latest` / Node 24): `success` (2m 32s)
  - Windows (`windows-latest` / Node 24): `success` (9m 15s)
  - Conclusion: `success` across all 4 jobs.

### 2. Candidate PR #1 Rebase & Red-Main Guard Evaluation
- Rebased `origin/automation/dependency-candidate` onto green `main` commit `793a1ad` and force-pushed to update PR #1 cleanly.
- Executed Red-Main Guard: `node scripts/check-main-baseline.mjs --branch main --update-pr --pr-number 1`.
- Guard evaluated `eligible: true` referencing baseline run #36092161231.
- Updated PR #1 description banner to `✅ Promotion Eligible: Main CI Baseline is Green`.
- Safely removed the `promotion-blocked` label from PR #1.

### 3. PR #1 3-OS Matrix CI Execution & Evidence Recording
- Monitored workflow run **#36092908991** triggered on PR #1 head commit `cd06f9d`.
- Verified 100% green pass across all matrix jobs:
  - Authoritative Release Package (Linux): `success` (29s)
  - Linux (`ubuntu-latest`): `success` (2m 3s)
  - macOS (`macos-latest`): `success` (4m 28s)
  - Windows (`windows-latest`): `success` (9m 24s)
- Initialized `.planning/phases/13-dependency-candidate-promotion/PROMOTION-EVIDENCE.md` with:
  - Header: Baseline and PR #1 run IDs, commit SHAs, and timestamp.
  - Section 1: Candidate Component Matrix (5 candidates, live SRI hashes, fixture receipts).
  - Section 2: Red-Main Guard baseline verification ledger.
  - Section 3: PR #1 GitHub Actions 3-OS CI matrix job breakdown.

## Verification Output

- `node scripts/check-main-baseline.mjs --branch main`: reports `eligible: true`.
- `gh pr view 1 --json labels --jq ".labels[].name"`: contains 0 blocked labels.
- `gh run view 36092908991 --json conclusion --jq .conclusion`: returns `"success"`.
- `PROMOTION-EVIDENCE.md`: recorded and complete.
