---
phase: 07-cross-platform-release-proof
plan: 07
subsystem: release-engineering
tags: [cross-platform-ci, release-verification, github-actions, provenance, stage1-smoke]

# Dependency graph
requires:
  - phase: 07-cross-platform-release-proof
    provides: "07-05 Antigravity receipts & real paired controls, 07-06 package-safe brownfield proof"
provides:
  - "Inspectable multi-OS GitHub Actions CI execution record (CI_RUN.md) proving 100% pass across Linux, macOS, and Windows"
  - "Byte-identical authoritative release package verification (alpha-aos-0.1.0.tgz, SHA-256: ce176c364fdaaa736343fca3656248e12fed673d20b0cab426b5d0da831e47b4)"
  - "Verified release preview orchestrator (scripts/release.mjs --dry-run) and Stage 1 local smoke verification (scripts/smoke-test.mjs --local)"
  - "Updated release notes and provenance documentation in docs/RELEASE_NOTES_v0.1.0.md"
affects: [release, ci, packaging, provenance]

tech-stack:
  added: []
  patterns:
    - "Authoritative release tarball built and audited once on Linux runner and distributed to matrix jobs"
    - "Multi-OS matrix independently downloads and verifies cryptographic SHA-256 digest before running full test suites"
    - "Preview-first release orchestrator gating npm publication behind explicit flag and clean Git tree"

key-files:
  created:
    - .planning/phases/07-cross-platform-release-proof/CI_RUN.md
  modified:
    - src/core/mcp-proxy.ts
    - test/mcp-proxy.test.ts
    - docs/RELEASE_NOTES_v0.1.0.md

key-decisions:
  - "Add PATH to upstreamEnvironmentPolicy optional list in src/core/mcp-proxy.ts so POSIX node shebangs resolve correctly across Linux and macOS"
  - "Maintain authoritative release archive build on Linux and cryptographic verification across Linux, macOS, and Windows runners"
  - "Incorporate user checkpoint decision for npm publication, keeping verified release artifact and passing Stage 1 local smoke verification while deferring public npm publish"

patterns-established:
  - "All supported platforms verify identical archive checksum and run full test suites before release qualification"
  - "CI execution evidence must be recorded with inspectable run ID, commit SHA, and platform outcomes in CI_RUN.md"

requirements-completed: [REL-01, REL-05, REL-06]

verification:
  - kind: ci
    ref: "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/35496805483"
    status: pass
    details: "Run ID 35496805483 passed 100% on Ubuntu, macOS, and Windows with matching SHA-256"
  - kind: script
    ref: "node scripts/release.mjs --dry-run"
    status: pass
    details: "All pre-flight checks, build, 894 tests, audit, pack, provenance, and Stage 1 smoke passed"
  - kind: script
    ref: "node scripts/smoke-test.mjs --local"
    status: pass
    details: "Stage 1 local tarball smoke test passed in isolated environment"

## Self-Check: PASSED
- [x] Three-OS GitHub Actions CI matrix passed 100% (Run ID: 35496805483)
- [x] Identical SHA-256 digest verified across all runners (ce176c36...)
- [x] CI_RUN.md created with complete metadata and job outcomes
- [x] Stage 1 local smoke test verified
- [x] Release notes updated
