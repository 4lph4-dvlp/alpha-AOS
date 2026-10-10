# Phase 22: Release Proof — Research

**Researched:** 2026-10-10  
**Status:** Ready for planning  
**Scope:** VER-01..04; D-01..16 in `22-CONTEXT.md`

## Summary

Phase 22 is an evidence and release integration phase. The underlying supervisor, role probes, capability receipts, CoursePilot adapter, and packed lifecycle already exist. The missing release path is a common, versioned evidence model joining those sources to the final three-OS CI revision and package hash, plus tests that prove the report fails closed. Do not treat fixture results as live harness or authenticated LMS receipts.

## User Constraints and Locked Decisions

- Present support by exact harness version first, then OS, role, capability, status, evidence, missing reason, and next action (D-01..04). A partly proven harness must never get a blanket supported label. Real handoffs are separate from synthetic composition.
- Fault rows must bind the injected defect, intended assertion, observed red and green outcomes, and each OS job from the final release SHA (D-05..08). An unavailable OS is an evidence gap with a typed reason.
- Packed lifecycle evidence must bind the same tarball hash and stable lock, disclose category-level host drift counts/hashes, and withhold pass on unexplained drift (D-09..12).
- Development and CoursePilot examples need criterion and item verdicts, actual applicable skill/MCP/pack/hook call receipts, independent review, and honest authenticated-LMS status (D-13..16).
- GSD remains the only lifecycle state authority; ordinary GSD never enters autopilot without task-specific consent.

## Existing Architecture and Reuse

| Area | Reusable source | Gap to plan |
| --- | --- | --- |
| CI/package | `.github/workflows/ci.yml` packs one authoritative Linux tarball, verifies its SHA-256 on Windows/macOS/Linux, runs full tests; `test/tarball-fixture.test.ts` and `test/helpers/packed-sandbox.ts` perform isolated install, doctor, stable-lock-only update, uninstall and host fingerprint comparison. | Current CI tarball filename is `alpha-aos-0.1.0.tgz`; report final run/job IDs, SHA, stage results and red controls for v0.2.0. Avoid concurrent real-host mutations; preserve fixture's root isolation and exact tarball identity. |
| Support | `src/core/support-matrix.ts`, `src/format.ts`, `src/cli.ts:doctor --matrix`, `docs/SUPPORT_MATRIX.md`, `test/support-matrix.test.ts`; `src/core/task-doctor.ts` uses `readHarnessRoleReceipt`. | Matrix is v0.1.0, keyed by harness/surface/platform. It must join exact binary/version role receipts and capability invocation proof, show per-cell reason/action, and decline stale or absent proof. Shared evaluator should drive human, JSON and generated docs. |
| Roles and handoffs | `src/adapters/task-receipts.ts` writes strict role receipts with version, binary hash and sample digest; `src/core/task-doctor.ts` checks drift; prior phase native invocation notes record a Codex gap. | Collect actual role calls at exact versions and representative sender/receiver handoff receipts. Synthetic 5×5×5 combinations are composition evidence only. |
| Capabilities and gates | `src/core/task-capability-receipts.ts`, `src/core/task-hook-receipt.ts`, `src/core/task-final-review.ts`, and the capability ledger distinguish invocation from discovery and reject stale or missing required receipts. | Release report must reuse verified source records and show applicability, requirement, result, missing reason and source link for skill/MCP/pack/hook rows. No claimed call from installation or model narrative. |
| Examples | `src/core/task-run.ts`, `src/core/task-verdict.ts`, `src/core/task-connector.ts`, `src/adapters/coursepilot-task.ts`, `test/task-coursepilot-run.test.ts` and Phase 21 task reports support criterion/item evidence. | Add repeatable development and CoursePilot fixture recipes/report oracles. Authenticated LMS remains a separately recorded live check. Same-revision independent review and explicit incomplete verdict are mandatory. |
| Release | `scripts/release.mjs` stages a clean tracked checkout, dry-runs full checks and package audit, then publishes only with `--publish`. | A preview can prove mechanics; it is not permission to publish. Versioned docs and package/CI references must agree before the final release candidate run. |

## Recommended Implementation Order

1. **Production tracer:** Build one release evidence record from an existing fixture and final-SHA placeholder, render it through `doctor --matrix` and report output, and prove missing receipts remain `UNVERIFIED`. The record must identify its sources and prohibit synthetic/live substitution.
2. Add five-harness exact-version role/capability aggregation and separate real handoff rows, with drift, absent receipt, OS and partial-proof tests.
3. Add a deterministic fault-control harness and CI evidence manifest: pair each intact assertion with one deliberately broken behavior, record intended failing assertion, and bind all three OS jobs to one commit. Do not infer a three-OS pass from local execution.
4. Extend packed lifecycle reporting from the existing sandbox test; compare real-host managed-path categories before/after, keep path details local, and record tarball/stable-lock/candidate-lock evidence.
5. Build both exemplar recipes and criterion/item/capability receipt reports. Use actual GSD route and task report sources; fixture and authenticated outcomes stay separate.
6. Run final full local gates, one current three-OS CI run, live read-only canaries, independent code/integration review, GSD audit/UAT, then freeze support/docs only from collected evidence. Any unavailable paid or authenticated canary remains unverified.

## Architecture Choices

- Prefer an immutable release evidence manifest keyed by `releaseSha`, tarball SHA-256 and exact target version, with references to bounded raw logs/receipts. Public summaries contain hashes, counts, status and links, not personal paths or credential values.
- `PROVEN` requires an actual matching native invocation with a retained observable result and current version/binary. `UNVERIFIED` includes missing, blocked, stale, or environmental inability with a specific next action. `UNSUPPORTED` is reserved for known structural incompatibility.
- Compute summaries from cells, not from a harness-level default. Keep the existing v0.1.0 matrix as historical evidence or migrate it explicitly; do not silently relabel it v0.2.0.
- A final CI verdict is a conjunction of three job conclusions for the same SHA and package hash. Classify product assertion failure, environment failure, unable to run, and undecidable separately.
- Keep release proof generation read-only with respect to real host state. The packed fixture may mutate only its isolated sandbox; fingerprint unknown external drift and withhold pass until investigated and rerun with the identical tarball.

## Pitfalls

- A GitHub job green at an earlier SHA cannot prove the current candidate. A red mutation run only proves control sensitivity if the intended named assertion failed for the injected behavior.
- `test/release-controls.test.ts` already has paired controls for v0.1.0; its pattern is useful, but does not cover Phase 22's crash/cancel/duplicate/concurrency/false-acceptance matrix by itself.
- Existing role receipts can be stale after executable upgrades. Existing capability ledger proofs are harness/surface scoped; a role proof does not imply every skill/MCP/pack/hook cell.
- The packed fixture's `hostMutationTargets` is a bounded list. Release reporting must state coverage and categories, rather than claim an unbounded whole-host scan.
- A CoursePilot `viewed_only`, planned, partial, or absent local file result is not a downloaded file. Fixture results do not prove authenticated production LMS access.
- The CI workflow and `scripts/release.mjs` hard-code `0.1.0` filenames/text; coordinate the release version before the candidate run, then verify package metadata, lock, docs and artifact hash agree.
- Phase 19 and 20 have completed plan summaries but no `19-VERIFICATION.md` or `20-VERIFICATION.md` in their phase directories as inspected during planning. GSD milestone audit treats a missing phase verification as blocking, so closeout must establish those records through the supported GSD verification route or retain an explicit blocking gap. Phase 21 has a passed verification report.

## Validation Architecture

| Gate | Automated oracle | Required external or human evidence |
| --- | --- | --- |
| VER-01 faults | Named positive and injected-negative assertions for crash, cancel, concurrency, effect deduplication and false acceptance; CI manifest parser rejects mismatched SHA/job/hash and missing assertions. | One completed Windows/macOS/Linux run at the release candidate SHA; job URLs and raw log/artifact references. |
| VER-02 matrix | Tests reject absent/stale/mismatched version or binary receipts and prevent blanket harness support; human/JSON/docs derive from one source. | Exact-version native role and skill/MCP/pack/hook calls; representative sender/receiver handoff receipts. Missing access remains `UNVERIFIED`. |
| VER-03 package | Existing packed fixture plus category fingerprint report; candidate lock rejection and unchanged tarball hash. | CI package artifact SHA and local host before/after category summary from the same tarball. Unknown drift blocks pass. |
| VER-04 examples | Development input/output oracle and CoursePilot file-by-file fixture; report rejects a missing required call or unknown mandatory criterion. | Same-revision independent review; authenticated LMS result if access is available, otherwise explicit unverified status. Ordinary GSD nonactivation control. |

Focused checks use `npm run build && node scripts/run-tests.mjs --files ... && npm run check`. Final local gate: `npm run check`, `npm test`, `npm run build:check`; `npm run build` is part of `npm test` and may also be run explicitly for the roadmap gate. A local pass cannot replace the three-OS run.

## Planning Questions Resolved

- Evidence record identity is the release commit plus tarball hash; role and capability receipts additionally bind exact harness version and observed source.
- Release documentation may include public CI links and category hashes/counts. Raw local paths, auth data and private canary logs stay local.
- Missing live access yields a truthful unverified cell and next action. It does not silently become a skipped pass.

## Sources

- `.planning/ROADMAP.md` Phase 22 and `.planning/REQUIREMENTS.md` VER-01..04.
- `.planning/phases/22-release-proof/22-CONTEXT.md` D-01..16.
- `docs/design/autonomous-work/README.md`, `VALIDATION.md`, `WORKFLOW.md`.
- Inspected implementation and tests named in the architecture table above; `.github/workflows/ci.yml`, `package.json`, `scripts/release.mjs`, and Phase 21 verification.
