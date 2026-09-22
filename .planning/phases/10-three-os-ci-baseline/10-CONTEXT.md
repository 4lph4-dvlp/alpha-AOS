# Phase 10: Three-OS CI Baseline - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Restore a trustworthy `main` CI. Two red legs are fixed at their diagnosed root cause:

- **CI-01 (ubuntu/macOS):** `destinationFor resolves destinations across all five harnesses` (`test/owned-skills.test.ts:52-53`) builds its fixture root from Windows path literals. It must use host path APIs, and a guard must make the suite fail when any test asserts against a platform-specific absolute path literal.
- **CI-02 (windows):** the packed release lifecycle in `test/tarball-fixture.test.ts` changes the hash of the real host `~/.alpha-aos`. This is an investigation before it is a fix: classify, record evidence, fix, pin with a regression test.
- **CI-03:** one `main` CI run shows ubuntu-latest, macos-latest, and windows-latest green together.

Out of scope: new harness capabilities or packs, loosening the host-path immutability assertion without a root cause, the red-main tracking issue (Phase 12), LIFE-01..08 verification (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### CI-02 root-cause taxonomy
- **D-01:** The root-cause classification has **three** classes, not two: `product isolation leak` (alpha-AOS product code ignores the sandbox env and writes the real home), `test-oracle defect` (the snapshot/assertion itself is wrong), and `test-isolation leak` (a different test file, running in parallel under `node --test`, writes the real host `~/.alpha-aos` during the fixture's snapshot window). This phase updates the CI-02 wording in `.planning/REQUIREMENTS.md` and Phase 10 success criterion 3 in `.planning/ROADMAP.md` to name all three classes.
- **D-02:** If the cause is a **test-isolation leak**, fix the leaking test itself (redirect `ALPHA_AOS_STATE_DIR` / home / harness roots into its own sandbox). The `hostSnapshot()` assertion in `test/tarball-fixture.test.ts` stays unchanged. Do not serialize the fixture or add a suite-wide host guard as the fix.
- **D-03:** If the cause is a **product isolation leak**, fix the discovered path **and** audit `src/` for the same pattern (for example direct `homedir()` / default-root resolution that bypasses `ALPHA_AOS_STATE_DIR` or the harness env overrides) and fix every instance found. Each fixed instance gets regression coverage. — **Reversibility:** costly — the audit may touch many path-resolution call sites across `src/core/`.
- **D-04:** If the cause is a **test-oracle defect**, an assertion change is allowed after the evidence is recorded (D-07) and goes through normal commit review. No separate user approval checkpoint is needed. The change may only make the oracle more *precise*, never narrower in what host mutation it catches. `~/.alpha-aos` stays in `hostMutationTargets`.

### CI-02 evidence collection
- **D-05:** Reproduce locally on the Windows developer host first. In the same work, improve the fingerprint failure output so that a mismatch reports *which* entries changed (relative path, kind, size, per-entry hash), not just two opaque hashes. After that, a future CI failure can be diagnosed from the log alone. Never print file contents, because they may carry secrets.
- **D-06:** If local reproduction fails, push temporary instrumentation to a separate branch and run the Windows leg with `workflow_dispatch` to collect evidence. The instrumentation is **not** merged to `main`. Do not upload the host `~/.alpha-aos` tree as a CI artifact.
- **D-07:** Record the root cause in a `.planning/debug/` session file, following the existing `.planning/debug/*.md` convention. The record gives the classification, the bytes and entries that changed, which lifecycle step (or which foreign test) wrote them, and the evidence that decided it. Phase 11 (LIFE-03/LIFE-04 verdicts) references this file.
- **D-08:** The regression test for the diagnosed cause must be observed **failing against the unfixed code** and passing against the fix (success criterion 4). Record the red observation (command plus output excerpt) in the debug file.

### CI-01 path-literal guard
- **D-09:** Enforce the rule with a source-scanning test. It reads `test/*.ts` and fails when it finds a platform-specific absolute path literal (drive-letter `X:\…` or POSIX home/root paths such as `/Users/…`, `/home/…`) used in an assertion expectation. An intentional use is allowed only with an inline marker comment on that line that states the reason. A new violation fails on every OS.
- **D-10:** Guard scope is **assertion-bound literals only**, matching the CI-01 wording: literals that are compared against a path produced by host path operations (`join`/`resolve`/product path functions). Opaque input data, such as redaction sample strings, win32 path-parsing inputs, or literals fed to `path.win32`/`path.posix` explicitly, is out of scope and does not need a marker. There are currently about 51 absolute-path literal hits across 14 test files. Most are expected to be inputs, not violations.
- **D-11:** `destinationFor` test fixture roots (the custom root, fake home, and fake env roots) are built with `join(tmpdir(), …)`. These are string-only paths; no files are created.

### CI-03 proof run and record
- **D-12:** The accepted proof is the `main` **push-triggered** CI run for the fix commit(s). A `workflow_dispatch` run is not accepted as the proof.
- **D-13:** If a leg is red only because of a transient upstream fault in the three registry-touching MCP tests (`ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`), record the failure cause and use GitHub **"Re-run all jobs"** on the same run. That is accepted when all three legs are green in one attempt. Record the run id together with the attempt number. Re-running only the failed jobs is never accepted.
- **D-14:** Record the green proof in `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`, following the Phase 7 `CI_RUN.md` convention: run id, attempt, commit SHA, and per-leg conclusion, retrieved with `gh run view` rather than transcribed. Reference it from `10-VERIFICATION.md`.

### Claude's Discretion
- Whether to bisect the Windows failure across 638d3cc (last green) .. f1ca570 (first red) to establish when it began, as a supporting line of evidence.
- The exact marker syntax for D-09 exceptions and the literal-detection heuristic.
- Plan split (CI-01 and CI-02 are independent and may be separate plans or waves).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 10: Three-OS CI Baseline" — success criteria and the planning note with verified facts from run 35762417138 (`main` @ c6415a2)
- `.planning/REQUIREMENTS.md` — CI-01, CI-02, CI-03, and the Out of Scope table (no assertion loosening without root cause)
- `.planning/PROJECT.md` — Safety constraint (root-bounded, previewable mutations)

### Prior decisions (v0.1.0 Phase 7)
- `.planning/milestones/v0.1.0-phases/07-cross-platform-release-proof/07-CONTEXT.md` — D-01 authoritative single tarball, D-03 temp-root sandbox, D-04 full lifecycle fixture
- `.planning/milestones/v0.1.0-phases/07-cross-platform-release-proof/CI_RUN.md` — format convention for the CI proof record (D-14)

### Prior environment investigations
- `scripts/run-tests.mjs` (header comment) — RC-5 history: npm lifecycle env injection and the windows-latest machine-scope `npm_config_prefix`; the test environment must not diverge between `npm test` and direct runs
- `.planning/debug/uat-safety-boundary-parallel.md` — prior parallel-safety-boundary investigation (debug-file convention for D-07)
- `.planning/WINDOWS.md` — Windows-specific environment notes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createIsolatedSandbox()` in `test/tarball-fixture.test.ts:80` — the reference sandbox env (HOME/USERPROFILE/APPDATA/ALPHA_AOS_STATE_DIR/harness roots/npm prefix and cache/TEMP). A leaking test can adopt the same shape (D-02).
- `fingerprint()` and `hostSnapshot()` in `test/tarball-fixture.test.ts:151-190` — the oracle; D-05 extends its failure reporting to per-entry detail.
- `destinationFor()` in `src/core/owned-skills.ts` — takes explicit `env` and `home` parameters, so the CI-01 fix is test-side only.

### Established Patterns
- `hostSnapshot()` is taken at the start of a 900-second test and compared at the end. The whole compiled suite runs through `node --test` via `scripts/run-tests.mjs`, so other test files run concurrently inside that window. This is the basis for the test-isolation-leak hypothesis (D-01).
- `hostStateRoot` honors `ALPHA_AOS_STATE_DIR` or falls back to `~/.alpha-aos`. On the Windows runner the real `C:\Users\runneradmin\.alpha-aos` exists and is the only target whose hash moves. Every other target stays `absent`.
- CI runs `npm test`, then a separately named "Safety boundary suites" step, both through `scripts/run-tests.mjs`.

### Integration Points
- `.github/workflows/ci.yml` — three-OS matrix, the authoritative tarball from the `package` job, and `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`.
- The new path-literal guard test lives under `test/` and is picked up automatically by `scripts/run-tests.mjs`, which refuses an empty test set.

</code_context>

<specifics>
## Specific Ideas

- Failure output for the host snapshot should name changed entries, so the next red Windows leg is self-diagnosing from CI logs.
- The proof run is judged by `gh run view` output, not by a manual transcription.

</specifics>

<deferred>
## Deferred Ideas

- Suite-wide host-path guard in `scripts/run-tests.mjs` (snapshot of real host roots before and after the entire suite). This was considered as a stronger backstop for test-isolation leaks and deferred as scope growth. It is a candidate for a later hardening phase.

</deferred>

---

*Phase: 10-three-os-ci-baseline*
*Context gathered: 2026-09-23*
