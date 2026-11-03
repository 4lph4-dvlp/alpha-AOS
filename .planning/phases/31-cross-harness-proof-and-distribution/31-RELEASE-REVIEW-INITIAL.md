---
phase: 060-release-candidate
reviewed: 2026-11-03T07:47:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - scripts/run-tests.mjs
  - test/test-runner-isolation.test.ts
  - test/support-matrix.test.ts
  - .github/workflows/ci.yml
  - test/task-cli.test.ts
  - test/helpers/loopback-http.ts
  - test/loopback-http.test.ts
  - scripts/release.mjs
  - test/release-orchestration.test.ts
findings:
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# v0.6.0 Release Candidate Code Review

## Summary

Reviewed candidate fa6fcf7, the fa6fcf7 runner/doctor repair, c3dfb98 HTTP/CI remediation, and the actual official release entry point. Three release-path blockers remain. No source changes, tests, builds, publication, or CI dispatch were performed by this reviewer. The active pre-push gate belongs to the parent and is not certified by this report.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER — Official release bypasses Windows native suite isolation

**File:** `D:/dev/alpha-AOS/scripts/release.mjs:149-153`

**Issue:** `runReleaseTests` supplies every ordinary file to `run-tests.mjs --files`. The runner deliberately disables native isolation for explicit files (`scripts/run-tests.mjs:173-185`) and launches the ordinary selection with up to four concurrent files (`:149-153`). Thus official release still runs MCP shutdown, process, command-job, and panel suites together on Windows, even though ordinary `npm test` now isolates them. The CI safety-boundary step also names process/protocol/MCP suites together through this bypass (`.github/workflows/ci.yml:150-162`). The passing behavioral runner test exercises automatic discovery only (`test/test-runner-isolation.test.ts:43`); release orchestration tests contain no native suite fixture (`test/release-orchestration.test.ts:39-52`). These paths do not establish the required native scheduling invariant.

**Fix:** Route release verification through the runner's automatic-discovery schedule once; retain the existing precondition requiring ordinary files and exactly one packed lifecycle file. If explicit selections must preserve caller semantics, add a shared explicit isolation mode and use it for release and the CI safety subset. Extend the existing release orchestration fixture with overlapping native markers and verify ordinary-before-native, native non-overlap, exactly-once coverage, and packed-last. Preserve all assertions and test deadlines.

### CR-02: BLOCKER — Normal npm login credentials are discarded before publication

**File:** `D:/dev/alpha-AOS/scripts/release.mjs:65-77,207-210`

**Issue:** `cleanNpmEnvironment` deletes all `npm_*` configuration and redirects `npm_config_userconfig` to a fresh staging `.npmrc` that is never created. That same environment is passed to the real `npm publish`. A successful ordinary `npm login` writes scoped auth to the user's actual configuration, so completing login does not make this entry point publish successfully. Merely retaining `NODE_AUTH_TOKEN`/`NPM_TOKEN` does not configure scoped registry authentication without an npmrc reference. Local npm config loader inspection confirms that the user file comes from the overridden `userconfig` path. npm still loads global config afterward, so unusual global authentication can work; the defect concerns the ordinary documented login path, not a claim that every possible authentication mechanism is impossible.

**Fix:** Keep verification child processes on the isolated environment. Construct a separate publication-only environment using the caller's resolved npm user configuration and isolated cache/log paths, with no credential values copied into arguments, source, journals, or reports. Pin publication and registry smoke to the public npm registry. Perform a secret-safe read-only auth preflight using this exact publication environment before the expensive gate. Do not forward publication credentials into test processes. Add a fixture proving that the publisher, and only the publisher, receives the chosen userconfig path.

### CR-03: BLOCKER — Publish accepts a local main branch without current three-OS evidence

**File:** `D:/dev/alpha-AOS/scripts/release.mjs:56-63,157-207`

**Issue:** The official entry point verifies only the local branch name and clean working tree, then runs local verification before publishing. It never resolves the release SHA against authoritative main or verifies successful Linux/macOS/Windows jobs for that SHA. A clean local branch named `main` can contain an unpublished commit or a candidate whose remote CI failed, and `--publish` still reaches npm. `scripts/release-evidence.mjs` exists but is not consulted. The separate pre-push hook cannot guard direct npm publication and is explicitly clone-local in `docs/ci-verification.md:11`. Local checks cannot prove native three-OS acceptance.

**Fix:** Before publication, fail closed unless the captured checkout SHA is authoritative main and current successful CI evidence contains the complete required three-OS jobs for that exact SHA. Bind the selected release artifact/hash to those receipts; prefer publishing the authoritative CI artifact. Recheck the captured SHA/clean checkout before the irreversible publish step. Dry-run may report absent native acceptance, but must not describe it as complete. Add refusal fixtures for missing, failed, stale/wrong-SHA, and incomplete OS evidence.

## Warnings

### WR-01: WARNING — Release command failures discard the decisive diagnostic evidence

**File:** `D:/dev/alpha-AOS/scripts/release.mjs:34-53,221-222`

**Issue:** Every subprocess uses captured pipes and a shared 20-minute timeout without an explicit output policy. A timeout, output overflow, process launch error, or npm auth/registry refusal is reduced to a synthetic `exit 1`; `result.error`, `result.signal`, and ordinary stderr are discarded unless a line happens to match the narrow check-mark failure-title regex. The final cleanup then removes the staging npm logs and artifact. This prevents distinguishing the known external E401 from missing executable, output limits, timeout, or assertion failure and prevents retaining an artifact after a successful publish followed by failed registry smoke. Output overflow would fail closed, not create a false green. No overflow or release-timeout reproduction is claimed here.

**Fix:** Use durable bounded log files for verbose test output, return log paths and bounded redacted summaries, and include error code/signal/timeout classification explicitly. Keep structured stdout capture only for short machine-readable commands such as `npm pack --json`. Retain publish-state and artifact SHA/provenance evidence outside disposable staging before npm publication; report partial success distinctly if later smoke fails. Preserve individual test deadlines and fail-closed exit handling. A release aggregate time budget should be explicit and separately justified, without increasing the native assertions' timeouts.

## Evidence limits

The retained prior push receipt `.planning/tmp/31-060-push.log` reports 1955 tests, 1940 passing, two failing, and 1097522.4856 ms for its ordinary group; it is a historical failed receipt, not acceptance of fa6fcf7. The scoped 9/9 result and native-platform uncertainty are recorded in `.planning/debug/release-060-final-gates.md`; this reviewer did not reproduce them. A complete successful current release runtime has not been observed, so exceeding the release helper's 20-minute aggregate timeout is a concern to measure, not an independently proven finding. The npm E401/public E404 are supplied external blockers and do not justify bypassing authentication, CI, or tests. No complete local gate or native three-OS CI is claimed.

_Reviewer: gsd-code-reviewer; standard depth; implementation read-only._
