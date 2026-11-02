# Native Execution Style Proof and Regression Ledger

This document serves as the bounded proof ledger and regression registry for the six execution routes, quality evidence gates, and operational boundaries defined in Phase 30 (STYLE-01–STYLE-07, D-21, D-22, D-24).

## 1. Proof Tier Separation

| Tier | Name | Evidence Source | Scope & Authority |
|---|---|---|---|
| **Tier 1** | Unit & Fixture Suites | `test/task-style-acceptance.test.ts`, `test/task-style-native-proof.test.ts`, `test/task-style-routing.test.ts`, `test/task-quick-quality.test.ts`, `test/task-phase-scope.test.ts` | Validates schemas, deterministic state machines, quality evidence evaluation, error diagnostics, and contract authority gates. **Zero native proof**: fixture success does not simulate or prove live native runner behavior. |
| **Tier 2** | Native Proof Index & Verifier | `scripts/verify-task-style-native.mjs`, `docs/task-style-proof-index.json` | Read-only index verifier. Reopens actual source/result files, checks git commits via `git cat-file`, verifies artifact hashes, rejects fixture-tier promotion, and reports per-route status (`verified`, `unsupported`, `unverified`, `blocked`). |
| **Tier 3** | Live Native Execution Checkpoint | Separately captured native runs in Phase 30 Plan 08 | Real external CLI invocations (e.g. Codex, Antigravity, Claude) producing authentic on-disk GSD artifacts and stage receipts. |

## 2. Six Canonical Routes and Verification Ledger

| Number | Canonical Identifier | Korean Label | Quality | Surface | Plan 07 Status | Plan 08 Target |
|---|---|---|---|---|---|---|
| 1 | `conversational-quick` | 대화형-quick | `standard` | `conversation` | Fixture Verified | Native Checkpoint |
| 2 | `conversational-quick-full` | 대화형-quick-full | `full` | `conversation` | Fixture Verified | Native Checkpoint |
| 3 | `conversational-phase` | 대화형-phase | N/A | `conversation` | Fixture Verified | Native Checkpoint |
| 4 | `autopilot-quick` | 오토파일럿-quick | `standard` | `isolated-runner` | Fixture Verified | Native Checkpoint |
| 5 | `autopilot-quick-full` | 오토파일럿-quick-full | `full` | `isolated-runner` | Fixture Verified | Native Checkpoint |
| 6 | `autopilot-phase` | 오토파일럿-phase | N/A | `isolated-runner` | Fixture Verified | Native Checkpoint |

## 3. Native Verifier Specification (`scripts/verify-task-style-native.mjs`)

The native proof verifier is a standalone, read-only script:
```bash
node scripts/verify-task-style-native.mjs --index <path> [--json]
```

### Invariants and Boundaries:
- **Maximum Index Size**: 64 KiB (`stat.size <= 65536`).
- **Maximum Entries**: 64 route items.
- **Regular File Mandate**: Rejects symlinks and non-regular files (`stat.isSymbolicLink()` or `!stat.isFile()`).
- **Fail-Closed Fixture Rejection**: Rejects `evidenceTier: "fixture"` for native verification.
- **Anti-Spoofing Guard**: Rejects entries where `evidenceTier` is labeled `"native"` but `provenance` or `harness` indicates fixture origin (`provenance: "fixture"`, `harness: "fixture"`, `isFixture: true`).
- **Disk Re-Verification**: Re-opens `sourceLocator` and `resultLocator` files from disk and verifies SHA-256 hashes against recorded values.
- **Git Commit Validation**: When `gitEvidence.commitSha` is present, validates object existence using `git cat-file -t <commitSha>`.
- **7-Stage Quality Gate**: For full-quality routes (`conversational-quick-full`, `autopilot-quick-full`), verifies that all seven mandatory stages (`discussion`, `research`, `planning`, `plan-check`, `implementation`, `verification`, `state-docs`) are present with `outcome: "passed"`.
- **Zero Mutation & Zero LLM**: Strictly read-only; executes zero LLM calls and performs zero filesystem mutations.

## 4. Historical Regression Holds and Outstanding Debt

### Quick 261101-ww3 Unexecuted Suites
In quick task `261101-ww3` (`.planning/quick/261101-ww3-make-milestone-capable-gsd-full-profile-/261101-ww3-SUMMARY.md`), four suites were not executed following an unresolved Phase 26 worker handshake timeout:
1. `task-progress-integration.test.js`
2. `task-progress.test.js`
3. `verify-efficient-wait.test.js`
4. `tarball-fixture.test.js`

These suites remain recorded as historical debt; they are not marked passed without demonstrable current execution.

### Active Release and CI Holds
The following holds remain in effect and are NOT cleared by local Windows fixture runs:
- **macOS / 3-OS CI Hold**: Cross-platform CI verification in GitHub Actions remains required before release.
- **Publication Hold**: `npm publish` and git tag release remain blocked until final milestone verification.
- **Global Apply Hold**: No global reconciliation or automatic global skill installation is performed during local development.
- **Separate Reviewer Mandate**: Independent code review remains mandatory in the phase verify stage with the approved fresh read-only reviewer; local test execution does not substitute for review.
