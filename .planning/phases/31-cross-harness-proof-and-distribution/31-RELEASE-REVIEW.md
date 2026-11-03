---
phase: 060-release-candidate
reviewed: 2026-11-03T07:53:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - scripts/release.mjs
  - scripts/smoke-test.mjs
  - test/release-orchestration.test.ts
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# v0.6.0 Release Fix Re-review

## Summary

The three original blockers are addressed in the current uncommitted source for the intended ordinary npm-login publication path. No remaining blocker was independently established in this bounded re-review. Two robustness warnings remain. This is source review and read-only GitHub metadata inspection, not a test/build/publication receipt.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: WARNING — Diagnostic retention remains partial

**File:** `D:/dev/alpha-AOS/scripts/release.mjs:35-54,262-263`

**Issue:** Process error codes/signals now distinguish timeout, launch, and output errors, addressing part of the original warning. Ordinary npm stderr remains omitted, though, so authentication E401, permission E403, invalid config, and registry errors can still all appear only as `npm publication authentication failed with exit 1`. Verbose test output is still captured under the subprocess default output cap. Disposable staging, npm logs, artifacts and provenance are deleted after failures, including registry-smoke failure after a successful irreversible publish. No actual output overflow is claimed.

**Fix:** Preserve bounded redacted failure diagnostics in a durable external log, and report its path. Retain artifact/provenance hash and partial publication state before the irreversible step. Use file-backed capture for long test output; keep short structured capture for machine-readable commands. This is advisory and does not justify weakening any assertion or gate.

### WR-02: WARNING — Custom token-based npmrc authentication is still dropped

**File:** `D:/dev/alpha-AOS/scripts/release.mjs:89-116`

**Issue:** Ordinary `npm login` credentials in the default user npmrc can now be read by the publisher. However, a valid user npmrc using `//registry.npmjs.org/:_authToken=${NPM_TOKEN}` still fails: `cleanNpmEnvironment` removes `NPM_TOKEN` via its case-insensitive `^npm_` filter, and `publicationEnvironment` restores only user/global configuration path variables. The new helper test checks path restoration, not npmrc environment substitution. This concerns custom environment-token authentication; it does not invalidate the repaired ordinary-login path or establish the cause of the supplied external E401.

**Fix:** If environment-token publication is supported, explicitly restore the required allowlisted token variable only into the publication/preflight environment, never verification children, argv, diagnostics or files. Otherwise document the supported ordinary-login requirement and report unsupported token-based configuration before expensive verification. Preserve secret-free diagnostics.

## Original finding disposition

| Earlier finding | Source assessment |
| --- | --- |
| CR-01 Windows native scheduling bypass | Addressed: release invokes canonical discovery once at `scripts/release.mjs:187-189`; runner supplies native isolation and packed-last ordering. CI safety selection now explicitly requests `--test-concurrency=1` at `.github/workflows/ci.yml:152`. New native fixture tests exclusion/order and packed-last. |
| CR-02 Ordinary npm login discarded | Addressed for ordinary login: publication restores user/global config discovery separately; auth preflight precedes tests; public npm registry is explicit for both whoami and publish at `scripts/release.mjs:200,248`. Config restoration does not copy credential values into tracked files or argv. Custom token mode is WR-02 above. |
| CR-03 Missing exact-SHA native CI gate | Addressed at `scripts/release.mjs:58-86`: clean local main, authoritative GitHub main SHA, successful exact-SHA CI run, and successful package plus all three native jobs are required. Missing or failed evidence fails closed. |
| WR-01 Lost diagnostics | Partially addressed: error code/signal added; persistent bounded output and partial-publication evidence remain advisory above. |

The initially identified operator-registry redirection risk was corrected during this re-review. `publicationEnvironment` pins the public registry, whoami/publish use an explicit registry argument, and `scripts/smoke-test.mjs` pins the same registry in both environment and install argv. The final source, rather than the intermediate diff, is assessed here.

## Evidence and limits

- `gh run list --help` and `gh run view --help` confirm the requested JSON fields. Read-only inspection of actual run 41307974019 confirms `jobs[].name/status/conclusion` and the exact four required names used by the validator. That historical run still has failed macOS and overall failure; it is not passing evidence for this candidate. The authoritative-main API endpoint also returned a SHA successfully.
- `.planning/phases/31-cross-harness-proof-and-distribution/31-FINAL-HANDOFF.md:33` records the prior corrected-source full command at 1799181 ms. The new 45-minute release aggregate budget can accommodate that recorded approximately 30-minute command; individual test deadlines and native assertions are unchanged. No new runtime duration is claimed.
- No tests or builds were run. The earlier reported 14/14 scoped pass cannot cover newly added CI validation fixtures or final registry-pin changes. Fresh targeted and mandatory full-gate receipts remain necessary, followed by exact-SHA three-OS CI.
- npm E401 remains an external authentication blocker. No successful login, public publication, or complete CI is claimed.
- CI gating now binds source SHA and native jobs. It does not claim byte identity between the locally rebuilt publication tarball and the authoritative CI artifact; no such byte-identity receipt was inspected.

_Reviewer: gsd-code-reviewer; implementation read-only; report only._
