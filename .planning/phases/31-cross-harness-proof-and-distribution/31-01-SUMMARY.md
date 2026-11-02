---
phase: 31-cross-harness-proof-and-distribution
plan: "01"
subsystem: packaging
tags: [distribution, tarball, security, doctor, owned-skills, provenance]

# Dependency graph
requires:
  - phase: 30-six-execution-styles-and-quality-binding
    provides: 6-route bindings and native receipts
provides:
  - Sanitized packaged documentation and JSON proof index free of developer workstation paths
  - Enhanced audit-tarball script scanning UTF-8 entries for private host paths and verifying 9 required v0.6.0 files
  - Fail-closed runDoctor packaged owned-skill frontmatter, sourceSha256, and 5-target rendered hash checks
affects: [31-02, 31-03, 31-04, 31-05]

# Actuals (#2632)
actuals:
  tokens: 3750
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [POSIX tarball UTF-8 content scanning, isolated mkdtemp package-root doctor fixture]

key-files:
  created: []
  modified:
    - docs/task-bootstrap-proof.md
    - docs/task-style-proof.md
    - docs/task-style-proof-index.json
    - docs/research/efficient-wait/BUG-06.md
    - README.md
    - README.ko.md
    - scripts/audit-tarball.mjs
    - test/provenance.test.ts
    - src/core/doctor.ts
    - test/doctor.test.ts

key-decisions:
  - "D-05: Normalized all 6 packaged text files containing developer workstation paths with portable aliases while preserving SHA-256 digests and commit SHAs verbatim."
  - "D-06, D-07: Extended runDoctor to verify packaged owned-skill frontmatter, sourceSha256, and 5-target rendered hashes against catalog/stack.lock.json with level error on tamper, while preserving host-global un-reconciled skills as warning under Global Apply Hold."
  - "D-12: Preserved package.json version 0.5.0 and prevented release metadata inflation."

patterns-established:
  - "Inspectable text entry UTF-8 decoding in listTarballFiles and PRIVATE_PATH_PATTERN content enforcement in auditTarballEntries"
  - "Dual-level doctor diagnostics: package tamper fails closed with error, host-global un-reconciled skills report warning"

requirements-completed:
  - PROVE-02

coverage:
  - id: D1
    description: "Sanitize packaged documents and proof index from private host paths while preserving cryptographic hashes"
    requirement: PROVE-02
    verification:
      - kind: automated_ui
        ref: "node scripts/verify-task-style-native.mjs --index docs/task-style-proof-index.json --json"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fail-closed audit-tarball scanning of inspectable UTF-8 text entries for private paths and enforcement of 9 required v0.6.0 entries"
    requirement: PROVE-02
    verification:
      - kind: unit
        ref: "test/provenance.test.ts#auditTarballEntries rejects private workstation paths in inspectable text entries"
        status: pass
      - kind: unit
        ref: "test/provenance.test.ts#auditRequiredPackageEntries rejects missing v0.6.0 entries"
        status: pass
      - kind: integration
        ref: "npm run audit-tarball"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fail-closed runDoctor verification of packaged owned-skill YAML frontmatter, sourceSha256, and 5-target rendered hashes"
    requirement: PROVE-02
    verification:
      - kind: unit
        ref: "test/doctor.test.ts#doctor verifies packaged owned-skill hashes and frontmatter fail-closed"
        status: pass
    human_judgment: false

# Metrics
duration: 18m
completed: 2026-11-03
status: complete
---

# Phase 31: Cross-Harness Proof and Distribution - Plan 01 Summary

**Sanitized packaged workstation path leaks, enforced fail-closed UTF-8 tarball content scanning with required v0.6.0 foundation files, and hardened runDoctor owned-skill lock validation across all 5 harness targets.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-11-03T03:00:00Z
- **Completed:** 2026-11-03T03:18:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Sanitized all 6 packaged text files containing developer workstation path leaks (`docs/task-bootstrap-proof.md`, `docs/task-style-proof.md`, `docs/task-style-proof-index.json`, `docs/research/efficient-wait/BUG-06.md`, `README.md`, `README.ko.md`) into portable aliases (`<scratch-root>`, `<temp-dir>`, `~/projects/my-project`, `../.planning/tmp/pi-native-proof`) while preserving all recorded SHA-256 digests and Git commit SHAs verbatim.
- Upgraded `scripts/audit-tarball.mjs` to decode inspectable UTF-8 text entries in `listTarballFiles`, scan for private host paths using `PRIVATE_PATH_PATTERN`, assert presence of `REQUIRED_V060_ENTRIES` (9 foundation schema, skill, and verifier paths), and exit 3 on violations.
- Extended `runDoctor` in `src/core/doctor.ts` with optional `root` parameter to verify packaged owned-skill YAML frontmatter (`name` matching skill ID and non-empty `description`), `sourceSha256`, and rendered `targetSha256` for all 5 targets (`claude`, `codex`, `antigravity`, `pi`, `hermes`) against `catalog/stack.lock.json`, emitting level `error` on tamper while preserving host-global un-reconciled skills as `warning` under the Global Apply Hold.
- Added comprehensive unit tests in `test/provenance.test.ts` and `test/doctor.test.ts` covering clean baseline and negative tamper scenarios.

## Task Commits

Each task was committed atomically:

1. **Task 1: Normalize packaged workstation paths and enforce fail-closed tarball surface and content auditing** - `0683875` (feat)
2. **Task 2: Harden runDoctor packaged owned-skill frontmatter, sourceSha256, and 5-target rendered hash verification** - `a20136d` (feat)

## Files Created/Modified

- `docs/task-bootstrap-proof.md` - Replaced Windows user-profile scratch paths with portable `<scratch-root>/...` aliases while keeping all digests and SHAs verbatim.
- `docs/task-style-proof.md` - Renamed `tarball.test.js` to `tarball-fixture.test.js` on line 79, replaced file-scheme workstation links with inline code and relative link, and sanitized `.planning/tmp/pi-native-proof` path.
- `docs/task-style-proof-index.json` - Replaced workstation projectRoot with portable `../.planning/tmp/pi-native-proof` across all 6 route entries.
- `docs/research/efficient-wait/BUG-06.md` - Replaced workstation user-profile temp prefix with `<temp-dir>/alpha-aos-041/codex-wait-ab-20261027/comparison.json`.
- `README.md` & `README.ko.md` - Replaced workstation example directory with `~/projects/my-project`.
- `scripts/audit-tarball.mjs` - Added `PRIVATE_PATH_PATTERN`, `isInspectableTextEntry`, `REQUIRED_V060_ENTRIES`, `auditRequiredPackageEntries`, and wired UTF-8 private-path scanning into `listTarballFiles` and `runCli`.
- `test/provenance.test.ts` - Added unit assertions for `auditTarballEntries` private path rejection and `auditRequiredPackageEntries` missing entry rejection.
- `src/core/doctor.ts` - Hardened `runDoctor` with optional `root` parameter and full 5-target owned-skill frontmatter, `sourceSha256`, and rendered `targetSha256` verification against `catalog/stack.lock.json`.
- `test/doctor.test.ts` - Added isolated `mkdtemp` package-root fixture tests asserting clean baseline and fail-closed errors on corrupted SKILL.md, tampered `targetSha256.pi`, or stripped YAML frontmatter.

## Decisions Made

- D-05: Normalized all 6 packaged text files containing developer workstation paths with portable aliases while preserving SHA-256 digests and commit SHAs verbatim.
- D-06, D-07: Extended `runDoctor` to verify packaged owned-skill frontmatter, `sourceSha256`, and 5-target rendered hashes against `catalog/stack.lock.json` with level `error` on tamper, while preserving host-global un-reconciled skills as `warning` under Global Apply Hold.
- D-12: Preserved `package.json` version `0.5.0` and prevented release metadata inflation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All TypeScript checks, builds, tests, and tarball audits completed cleanly with zero errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Packaging hygiene and owned-skill tamper-refusal foundations are complete (`PROVE-02`).
- Ready for Plan 31-02 (5-harness scenario proof matrix, index, verifier, and composed journey tests covering `PROVE-01` and `PROVE-04`).

---
*Phase: 31-cross-harness-proof-and-distribution*
*Completed: 2026-11-03*
