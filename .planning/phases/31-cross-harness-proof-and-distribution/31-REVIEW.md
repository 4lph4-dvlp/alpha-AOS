---
phase: 31-cross-harness-proof-and-distribution
reviewed: 2026-11-02T19:16:52Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - README.md
  - README.ko.md
  - docs/research/efficient-wait/BUG-06.md
  - docs/task-bootstrap-proof.md
  - docs/task-entry-proof-index.json
  - docs/task-entry-proof.md
  - docs/task-entry.md
  - docs/task-entry.ko.md
  - docs/task-runtime-controls.md
  - docs/task-style-proof-index.json
  - docs/task-style-proof.md
  - scripts/audit-tarball.mjs
  - scripts/verify-task-entry-proof.mjs
  - src/core/doctor.ts
  - test/doctor.test.ts
  - test/provenance.test.ts
  - test/tarball-fixture.test.ts
  - test/task-entry-cross-harness.test.ts
  - test/task-entry-docs.test.ts
  - test/task-entry-proof.test.ts
findings:
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-11-02T19:16:52Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Independent review of the Phase 31 changes relative to `d1ae4db66ec4e045c014fd801d4f5c8ced91ff05`, including the current uncommitted packed lifecycle test changes. The review traced verifier inputs, archive auditing, doctor callers, owned-skill rendering and sandbox path resolution. Three fail-open evidence/privacy checks and one diagnostic robustness defect require attention.

The current regression ledger correctly remains `pending-final-wave`; the findings do not assert that a final regression run has already happened. Native scratch-repository commits and owning-repository archive commits were treated as distinct evidence. Packed verification is archival verification, not fresh native execution. Paid Claude G-07-2, 3-OS CI, global reconciliation, push, publication and version holds remain intact.

No source files were changed, no test suites or builds were run, and the existing packed lifecycle run was neither monitored nor duplicated. Small read-only function probes used in-memory substituted inputs; all filesystem evidence remained unchanged. No structural pre-pass or external reviewer evidence was supplied.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER — A passed regression gate accepts zero tests and inconsistent suite totals

**File:** `D:/dev/alpha-AOS/scripts/verify-task-entry-proof.mjs:133-137`

**Issue:** The `passed` branch requires only a nonempty `suites` array and checks each count object independently. It does not require any known gate/suite identifiers, a nonzero executed test count, aggregate counts equal to suite totals, or actual source-commit evidence. A ledger with `sourceHead: "a".repeat(40)`, `platform: "fixture"`, aggregate counts all zero, and a single anonymous zero-count suite returns `valid: true, gateStatus: "passed"`. Changing only aggregate `total` and `passed` to 999 still returns success while its suite totals remain zero. Both cases were reproduced with the current verifier and real package/archive evidence, substituting only index bytes in memory. Consequently an absent or incomplete D-14 final run can be represented as a verified pass, and D-15's required current comparison suites can be omitted entirely.

**Fix:** Define the required final-gate command receipts and test-suite identifiers, require each exactly once, require successful measured results for every mandatory check, and require positive executed counts for test-bearing suites. Reconcile aggregate test counts against the included suite totals. In checkout mode, verify the recorded source commit exists and bind its reviewed source inputs; keep packed mode explicit about the evidence it can verify. Add negative cases for zero-test success, omitted mandatory suites, unknown/duplicate suite IDs, inconsistent aggregate totals and nonexistent source commits.

### CR-02: BLOCKER — Escaped JSON paths bypass the package privacy audit

**File:** `D:/dev/alpha-AOS/scripts/audit-tarball.mjs:259-262`

**Issue:** Inspectable JSON is scanned only as serialized text. An ordinary JSON-encoded Windows path contains doubled backslashes, so a value produced by `JSON.stringify({ projectRoot: "D:\\dev\\private-repo" })` does not match the drive-root pattern. Passing that serialized value as the text of `docs/leak.json` to `auditTarballEntries` returns an empty violations array. JSON Unicode escapes can similarly conceal path characters. Since `listTarballFiles` supplies the same raw UTF-8 JSON text, the real archive path has the same bypass. This defeats D-05's fail-closed private-path gate for packaged proof indices, schemas and catalog JSON.

**Fix:** Preserve the raw scan and additionally parse JSON entries, recursively scan decoded string values, and reject invalid JSON where a JSON document is expected. Apply equivalent decoded-value handling to YAML entries rather than relying exclusively on serialized spelling. Add a provenance/archive negative case using an actual serialized Windows path and escaped Unicode separators; assert the package audit rejects it.

### CR-03: BLOCKER — User-guide integrity bindings are optional

**File:** `D:/dev/alpha-AOS/scripts/verify-task-entry-proof.mjs:17-23`

**Issue:** `REQUIRED_FILES` omits both `docs/task-entry.md` and `docs/task-entry.ko.md`. The binding loop verifies only files the index elects to list, and its completeness guard checks this shorter constant. The current index lists neither guide and already returns `valid: true`; changing or removing either guide therefore leaves proof verification successful. Adding guide hashes during the final ledger step alone will not close the defect: deleting those two binding records would again bypass guide verification. `auditRequiredPackageEntries` checks presence but does not supply the missing SHA-256 enforcement. This breaks the required dual-context guide-integrity contract and allows altered user-facing approval/start guidance to be reported under a valid proof index.

**Fix:** Add both guides to the verifier's mandatory binding set and populate their exact on-disk SHA-256 values in `packageBindings.files`. Test each omitted guide binding, absent guide and one-byte guide mutation in checkout and packed contexts. Keep the guide-binding requirement enforced by code independently of the index content.

## Warnings

### WR-01: WARNING — Unreadable deployed skills abort the complete doctor report

**File:** `D:/dev/alpha-AOS/src/core/doctor.ts:160-162`

**Issue:** A deployed `SKILL.md` that exists but is a directory or cannot be read makes `readFileSync(dest)` throw outside any handler. `runDoctor` then rejects without returning its accumulated findings, and the CLI's normal structured doctor output is lost. The new deployed-state checks are meant to report host-global drift as a warning under the apply hold, but malformed or permission-restricted host state becomes a fatal diagnostic failure. A read-only in-memory probe supplying `EISDIR` for this deployed-file read reproduced rejection of the entire doctor call.

**Fix:** Handle each deployed-file probe independently. Validate file shape and catch read failures, emit a coded `policy.owned-skill.<skill>.<harness>` warning with a safe error code, and continue gathering findings. Keep packaged source/lock integrity failures as errors. Add focused cases for a deployed directory and a simulated permission-denied read that assert other doctor findings remain available.

---

_Reviewed: 2026-11-02T19:16:52Z_
_Reviewer: independent agent (gsd-code-reviewer), inherited authorized session model_
_Depth: standard_
