---
phase: 07-cross-platform-release-proof
plan: 01
subsystem: release-engineering
tags: [npm-pack, tar, ci, sha256, sandbox, lifecycle, cross-platform]

# Dependency graph
requires:
  - phase: 06-managed-lifecycle-uninstall-and-recovery
    provides: "Idempotent install/status/doctor/uninstall lifecycle and purge semantics"
provides:
  - "Strict npm package allowlist and pure-Node bounded tar archive auditor"
  - "One authoritative Linux-built tarball consumed byte-for-byte by Windows, macOS, and Linux CI jobs"
  - "Isolated packed-artifact lifecycle fixture proving install, reconciliation, diagnosis, and uninstall without host mutation"
affects: [release, ci, distribution, cross-platform, phase-07]

tech-stack:
  added: []
  patterns:
    - "Canonical-path allowlisting before archive entries may be trusted"
    - "Bounded fail-closed ustar parsing with checksum, size, type, duplicate, and truncation validation"
    - "Artifact identity verification through Node crypto on every supported CI operating system"
    - "Packed CLI lifecycle tests with every mutable home, harness, npm, temp, and state root redirected"

key-files:
  created:
    - .npmignore
    - scripts/audit-tarball.mjs
    - test/tarball-fixture.test.ts
  modified:
    - package.json
    - .gitignore
    - .github/workflows/ci.yml

key-decisions:
  - "Accept only canonical ustar regular-file and directory entries within explicit resource bounds and an exact catalog allowlist"
  - "Generate and verify the authoritative archive digest with Node crypto so Linux, macOS, and Windows use one portable path"
  - "Treat locked external GSD, ECC, and MCP integrations as current prerequisites in the packed lifecycle fixture while exercising all alpha-AOS-owned mutations from the installed tarball"
  - "Use uninstall --purge in the disposable fixture because Phase 06 intentionally preserves audit journals during ordinary uninstall"

patterns-established:
  - "Release archive inputs are selected by npm's files allowlist, filtered by .npmignore, and independently audited after packing"
  - "CI package consumers receive the archive path explicitly through ALPHA_AOS_RELEASE_TARBALL and never repack locally"

requirements-completed: [REL-01, REL-05]

coverage:
  - id: D1
    description: "A single audited Linux-built release archive is hashed with Node crypto and supplied unchanged to all three operating-system jobs"
    requirement: "REL-01"
    verification:
      - kind: integration
        ref: "test/tarball-fixture.test.ts#CI uses Node crypto and routes the downloaded authoritative tarball into the fixture"
        status: pass
      - kind: other
        ref: "npm test"
        status: pass
    human_judgment: false
  - id: D2
    description: "The packed archive contains only canonical allowlisted paths and rejects malformed, dangerous, truncated, or resource-abusive tar input"
    requirement: "REL-05"
    verification:
      - kind: unit
        ref: "test/tarball-fixture.test.ts#tarball allowlist and parser safety cases"
        status: pass
      - kind: integration
        ref: "node scripts/audit-tarball.mjs --prepack"
        status: pass
    human_judgment: false
  - id: D3
    description: "An installed release tarball completes apply, zero-write reconciliation, status, doctor, and clean purge inside an isolated sandbox"
    requirement: "REL-01"
    verification:
      - kind: e2e
        ref: "test/tarball-fixture.test.ts#packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle"
        status: pass
    human_judgment: false

# Metrics
duration: 39min
completed: 2026-09-19
status: complete
---

# Phase 07 Plan 01: Authoritative Cross-Platform Release Tarball Summary

**A bounded pure-Node tar audit, one-byte-identical CI artifact pipeline, and isolated packed-CLI lifecycle now prove the distributable rather than the checkout.**

## Performance

- **Duration:** 39 min
- **Started:** 2026-09-19T13:02:56Z
- **Completed:** 2026-09-19T13:41:56Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Tightened the npm release surface to explicit catalog files and added three independent gates: `package.json` selection, `.npmignore` exclusions, and a post-pack archive audit.
- Hardened the pure-Node ustar reader against traversal aliases, malformed octal fields, invalid checksums, truncated archives, missing terminators, unsafe entry types, duplicate paths, and bounded-resource abuse.
- Configured CI to build once on Linux, upload the archive plus digest, and make Windows, macOS, and Linux verify and test that downloaded archive through the same Node `crypto` path.
- Added an end-to-end fixture that installs the packed CLI into redirected roots, applies it, proves a second apply writes nothing, runs status and doctor, purges it, and verifies both the host and archive bytes remain unchanged.

## Task Commits

The partial implementation was preserved and superseded with explicit TDD recovery commits:

1. **Task 1: Allowlisted tarball packaging, audit, and CI matrix**
   - `d2ad4ab` — initial packaging pipeline
   - `e43198c` — initial pack-destination handling
   - `f3aaac4` — failing archive safety tests (RED)
   - `9c83412` — hardened deterministic archive pipeline (GREEN)
2. **Task 2: Isolated packed lifecycle fixture**
   - `f15ad5c` — failing packed lifecycle fixture (RED)
   - `e84f051` — passing packed lifecycle fixture (GREEN)

**Plan metadata:** committed with this summary and sequential GSD tracking update.

## Files Created/Modified

- `package.json` — exact published-file allowlist and audit/prepack scripts.
- `.npmignore` — secondary exclusions for candidate state, planning data, tests, sources, and logs.
- `.gitignore` — ignores generated release tarballs.
- `scripts/audit-tarball.mjs` — bounded ustar reader, canonical path/content policy, and deterministic temporary packing.
- `.github/workflows/ci.yml` — authoritative package job and three-OS artifact consumer matrix using Node crypto.
- `test/tarball-fixture.test.ts` — archive adversarial tests plus the isolated installed-artifact lifecycle.

## Decisions Made

- Archive paths are decoded and canonicalized before policy matching; dot, parent, absolute, backslash, control-character, overlong, and case-colliding paths are refusals.
- Only regular files and directories are accepted. Links, devices, PAX/GNU extensions, and other unsupported types fail closed rather than expanding the parser's trusted surface.
- Temporary packs always use a newly created destination and ignore inherited `npm_*` values, preventing a stale parent `npm_config_pack_destination` archive from being audited.
- The CLI records `process.exitCode` instead of calling `process.exit()` inside `try`, so the temporary archive directory is always removed by `finally`.
- The fixture pre-seeds byte-verified locked external prerequisites, then tests the installed tarball's alpha-AOS-owned planning and mutation lifecycle. This keeps the release proof deterministic and avoids falsely turning third-party network availability into archive evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Hardened tar parsing and canonical containment**
- **Found during:** Task 1
- **Issue:** The initial parser accepted traversal aliases and did not validate checksums, malformed numeric fields, truncation, entry types, or resource bounds.
- **Fix:** Added canonical segment validation, exact catalog allowlisting, header checksum and octal parsing, strict termination, safe entry types, duplicate detection, and compressed/decompressed/entry/count/path limits.
- **Files modified:** `scripts/audit-tarball.mjs`, `test/tarball-fixture.test.ts`
- **Verification:** Six archive-focused tests pass, including adversarial malformed archives.
- **Committed in:** `9c83412`

**2. [Rule 1 - Bug] Made temporary archive creation deterministic and cleanup reliable**
- **Found during:** Task 1
- **Issue:** Inherited npm pack destinations could select stale archives, while `process.exit()` inside `try` could bypass `finally` cleanup.
- **Fix:** Scrubbed inherited npm configuration, packed into a fresh private directory, selected the exact JSON-reported artifact, used `process.exitCode`, and removed the entire temporary directory.
- **Files modified:** `scripts/audit-tarball.mjs`, `test/tarball-fixture.test.ts`
- **Verification:** The stale-destination test passes and confirms the generated archive is removed.
- **Committed in:** `9c83412`

**3. [Rule 1 - Portability] Replaced GNU checksum commands with Node crypto**
- **Found during:** Task 1
- **Issue:** `sha256sum` is not a portable macOS/Windows CI interface.
- **Fix:** Both producer and consumers now run the same inline Node `crypto` digest calculation and comparison.
- **Files modified:** `.github/workflows/ci.yml`, `test/tarball-fixture.test.ts`
- **Verification:** CI contract test and YAML parsing pass; the workflow contains no `sha256sum` invocation.
- **Committed in:** `9c83412`

**4. [Rule 3 - Blocking] Aligned fixture teardown with preserved-journal semantics**
- **Found during:** Task 2
- **Issue:** Phase 06 deliberately preserves transaction journals on ordinary uninstall, so an assertion of a completely absent disposable state root cannot pass after `uninstall --all --yes` alone.
- **Fix:** The disposable release fixture invokes the public `--purge` option and verifies the state and harness roots return to the clean baseline.
- **Files modified:** `test/tarball-fixture.test.ts`
- **Verification:** Packed lifecycle e2e test passes.
- **Committed in:** `e84f051`

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 missing critical safeguard, 1 blocking lifecycle alignment).
**Impact on plan:** All changes are necessary for safety, determinism, or portable execution and remain within the declared release-proof files.

## Issues Encountered

- An unseeded external-prerequisite run exposed three pre-existing issues outside this plan's owned files: bounded npm-pack JSON parsing in `src/core/gsd-compat.ts`, wording drift in the current deep-research skill versus its stable locked target hash, and a Firecrawl handshake closure on this host. The fixture therefore installs or renders the exact locked prerequisites inside the sandbox and verifies their hashes before exercising the packed alpha-AOS control plane. Those upstream integrations were not changed or claimed as this plan's deliverable.
- `CHANGELOG.md` does not yet exist. The package allowlist and audit accept it when Phase 07's later release-documentation work creates it; this plan does not fabricate that future deliverable.

## Verification

- `npm run check` — passed.
- `npm run build` — passed.
- `npm run build:check` — passed (109 inputs, 212 outputs).
- `node scripts/audit-tarball.mjs --prepack` — passed (158 allowlisted entries).
- `node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js` — 7 passed, 0 failed.
- `npm test` — 874 tests: 865 passed, 0 failed, 9 platform-gated skips, 0 todo.

## Authentication Gates

None.

## Known Stubs

None. The missing `CHANGELOG.md` is a future release-documentation artifact, not a runtime or rendered-data stub.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07-02 can use the authoritative archive contract and isolated fixture as the base for OS-native release proof.
- Hosted CI still needs to execute the configured three-OS matrix; local Windows verification and structural CI tests are green.
- Release documentation may add `CHANGELOG.md` later without widening the archive auditor.

## Self-Check: PASSED

- All six declared release files and this summary exist.
- All six preserved or superseding task commits resolve in Git.
- Summary frontmatter parses with `status: complete` and three deterministic coverage entries.
- `git diff --check` reports no whitespace errors.

---
*Phase: 07-cross-platform-release-proof*
*Completed: 2026-09-19*
