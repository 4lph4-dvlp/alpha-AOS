# Phase 22 — Codebase Pattern Map

**Mapped:** 2026-10-10  
**Inputs:** `22-CONTEXT.md`, `22-RESEARCH.md`, inspected tracked source and tests.

## File Classification

| Intended path | Role | Closest existing analog | Pattern to keep |
| --- | --- | --- | --- |
| `src/core/release-evidence.ts` (new) | Pure release evidence validation/aggregation | `src/core/support-matrix.ts`, `src/core/task-verdict.ts`, `src/core/task-final-review.ts` | Typed statuses and fail-closed source validation; return structured values before formatting. |
| `src/core/support-matrix.ts` | Versioned role and capability cell evaluation | Existing module; `src/core/task-doctor.ts` | Use receipt readers and matching observed evidence; show exact version, OS, role and reason. |
| `src/format.ts`, `src/cli.ts` | Human and JSON release/doctor output | `formatSupportMatrixTable`, `doctor --matrix` dispatch | One evaluated model for both output forms; CLI owns printing/errors. |
| `scripts/release-evidence.mjs` (new) | Read-only CI/package/evidence assembly | `scripts/release.mjs`, `scripts/audit-tarball.mjs` | Explicit args and bounded raw output; no implicit publication or real-host mutation. |
| `.github/workflows/ci.yml` | One-artifact three-OS proof | Existing `package` → `test` jobs | All OS jobs consume the same checksum-verified tarball; no earlier-SHA substitution. |
| `test/release-fault-controls.test.ts` (new) | Paired positive/negative fault controls | `test/release-controls.test.ts`, `test/task-supervisor-recovery.test.ts`, `test/task-controller-lease.test.ts` | Name injected defect, intended assertion and observed failure. |
| `test/release-evidence.test.ts` (new) | Manifest and report truthfulness | `test/support-matrix.test.ts`, `test/task-final-review.test.ts` | Reject missing/stale/wrong-hash evidence and false completion. |
| `test/tarball-fixture.test.ts`, `test/helpers/packed-sandbox.ts` | Packed lifecycle and host-drift summaries | Existing tests/helpers | Isolated prefix/state/home, before/after host fingerprints, stable lock and candidate refusal. |
| `test/release-examples.test.ts` (new) | Development and CoursePilot oracles | `test/task-coursepilot-run.test.ts`, `test/task-coursepilot-report.test.ts`, `test/task-cli-review.test.ts` | Per-criterion/item verdict and actual capability receipt linkage. |
| `docs/SUPPORT_MATRIX_v0.2.0.md`, `docs/RELEASE_NOTES_v0.2.0.md` (new), `README.md`, `README.ko.md` | Public evidence and limits | Existing v0.1.0 support/release docs | Generate or verify facts from the structured release record; retain the v0.1.0 matrix as history and publish category hashes/counts only. |

## Concrete Existing Patterns

### Receipt-bound status

- `src/core/support-matrix.ts:evaluateMatrixCell` first applies known unsupported/platform rules, then detects harness, ledger availability and an inspectable matching invocation; absent evidence becomes `UNVERIFIED`.
- `src/adapters/task-receipts.ts:readHarnessRoleReceipt` validates strict receipt shape and checks version/binary drift. `src/core/task-doctor.ts:buildTaskDoctorReport` already loops five harnesses and three roles.
- `src/core/task-capability-receipts.ts` verifies native skill activation and MCP observation linkage; missing one side does not satisfy a required obligation. `src/core/task-hook-receipt.ts` and `src/core/task-final-review.ts` retain hook and independent review proof.

### Packed artifact and bounded host mutation

- `.github/workflows/ci.yml` creates the authoritative artifact once in Linux and downloads it into each OS job, checks the SHA with Node crypto, then calls `npm test`.
- `test/tarball-fixture.test.ts` chooses `ALPHA_AOS_RELEASE_TARBALL` in CI, otherwise packs locally; `installPackedRelease` checks allowlist/stable lock and rejects candidate lock inclusion. The test snapshots selected real-host paths before and after an isolated sandbox install/doctor/uninstall.
- `test/helpers/packed-sandbox.ts:fingerprintManifest` gives digest and per-entry metadata; `describeHostDrift` bounds detail. Public docs should only contain aggregate category summaries while private raw comparison remains local.

### Task and exemplar verdicts

- `test/task-supervisor-recovery.test.ts` covers crash-before/after-effect reconciliation; `test/task-controller-lease.test.ts` covers competing controllers and stop fencing; `test/task-final-review.test.ts` rejects stale/unknown final review evidence.
- `test/task-coursepilot-run.test.ts` preserves partial file successes, stale manifest refusal, missing local file and `viewed_only` uncertainty. The exemplar should use these real adapter outcomes rather than a narrative completion claim.
- `src/core/task-run.ts` owns run progress; `src/core/task-verdict.ts` owns accepted/blocked/unknown semantics; `src/core/task-final-review.ts` gates independent same-revision acceptance. New release reports should read them instead of duplicating their state transitions.

## No Direct Analog

There is no existing single release evidence manifest joining the final SHA, three OS jobs, tarball hash, live versioned role/capability calls, handoffs, lifecycle, both exemplars and milestone review. Introduce a narrow typed record and verifier; preserve the underlying source receipts as the authority.

## Tracked Source Check

Existing paths above are repository source files. Proposed new paths are under tracked source directories, outside ignored runtime mirrors. Verify `git ls-files` when implementation starts and keep generated local raw receipts out of public docs.
