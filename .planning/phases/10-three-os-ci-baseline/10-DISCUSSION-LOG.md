# Phase 10: Three-OS CI Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-23
**Phase:** 10-three-os-ci-baseline
**Areas discussed:** CI-02 root-cause taxonomy, CI-02 evidence collection, CI-01 path-literal guard, CI-03 proof run and record

---

## CI-02 root-cause taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| Add third class | Record "test-isolation leak" separately; update CI-02 wording | ✓ |
| Force into two classes | Map to product leak or oracle defect | |
| Decide after investigation | Settle taxonomy once cause is known | |

**User's choice:** Add third class.

| Option | Description | Selected |
|--------|-------------|----------|
| Isolate leaking test | Redirect its state/home into a sandbox; snapshot assertion unchanged | ✓ |
| Also add suite-wide host guard | Snapshot host paths around whole suite in run-tests.mjs | |
| Serialize the fixture | Run tarball lifecycle alone; leak remains | |

**User's choice:** Isolate the leaking test itself.

| Option | Description | Selected |
|--------|-------------|----------|
| Fix found path only | Defer similar-path audit to Phase 11 | |
| Audit same pattern everywhere | Find and fix the same shape across src/ | ✓ |

**User's choice:** Audit the same pattern everywhere (for the product-leak case).

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence + commit review | Record evidence; only precision-improving changes; no separate approval | ✓ |
| Stop and ask user | Checkpoint before any assertion change | |

**User's choice:** Evidence + commit review.

---

## CI-02 evidence collection

| Option | Description | Selected |
|--------|-------------|----------|
| Local repro + better failure message | Reproduce on Windows host; fingerprint mismatch lists changed entries | ✓ |
| Also CI diagnostic artifact | Upload ~/.alpha-aos tree from Windows leg | |
| Local repro only | No test changes | |

| Option | Description | Selected |
|--------|-------------|----------|
| Instrumented CI run on a branch | workflow_dispatch on a branch; instrumentation not merged | ✓ |
| Stop and report | Checkpoint to user | |

| Option | Description | Selected |
|--------|-------------|----------|
| .planning/debug/ session file | Follow existing debug convention; Phase 11 references it | ✓ |
| Phase 10 ROOT-CAUSE.md | Dedicated doc in phase folder | |

---

## CI-01 path-literal guard

| Option | Description | Selected |
|--------|-------------|----------|
| Source scan test + inline exception marker | Fails on every OS for new violations | ✓ |
| Source scan + central file allowlist | Whole files exempted | |
| Fix existing test only | No guard (misses SC-1) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Assertion-bound literals only | Matches CI-01 wording; opaque inputs allowed | ✓ |
| All absolute path literals in test/ | Scope growth across ~51 hits | |

| Option | Description | Selected |
|--------|-------------|----------|
| tmpdir()-based join | Host path API, string-only | ✓ |
| You decide | Planner chooses | |

---

## CI-03 proof run and record

| Option | Description | Selected |
|--------|-------------|----------|
| main push run of fix commit | Same kind of baseline Phase 12 will read | ✓ |
| push or workflow_dispatch | Accept manual reruns on main | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rerun whole workflow | Record cause; all legs green in one attempt | ✓ |
| Treat as failure | Investigate upstream cause | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same-run "Re-run all jobs" allowed | Record run id + attempt; failed-only rerun forbidden | ✓ |
| Only a new push's new run | attempt 1 only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 10 VERIFICATION + CI_RUN.md | Phase 7 convention; verified via gh | ✓ |
| VERIFICATION.md only | | |

---

## Claude's Discretion

- Whether to bisect 638d3cc..f1ca570 for the Windows failure onset
- Exception marker syntax and literal-detection heuristic
- Plan split between CI-01 and CI-02

## Deferred Ideas

- Suite-wide host-path guard in `scripts/run-tests.mjs` — later hardening phase
