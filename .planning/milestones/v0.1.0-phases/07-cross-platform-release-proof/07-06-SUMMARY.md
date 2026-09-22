---
phase: 07-cross-platform-release-proof
plan: 06
subsystem: release-engineering
tags: [brownfield-proof, packaging, gsd-lifecycle, worker-authority]

# Dependency graph
requires:
  - phase: 07-cross-platform-release-proof
    provides: "07-04 brownfield benchmark and packaging audit"
provides:
  - "Package-included core engine src/core/brownfield-proof.ts for brownfield repository setup and 5-stage GSD lifecycle execution"
  - "Standalone runner scripts/run-brownfield-proof.mjs importing dist/src/core/brownfield-proof.js without referencing dist/test/"
  - "5-stage authentic GSD lifecycle execution (discuss -> plan -> execute -> verify -> ship) with worker authority witnessing"
affects: [packaging, brownfield-proof, worker-authority]

tech-stack:
  added: []
  patterns:
    - "Relocate brownfield proof runtime from test helpers to package-included src/core/brownfield-proof.ts"
    - "Execute authentic 5-stage GSD lifecycle and witness worker delegation immutability"

key-files:
  created:
    - src/core/brownfield-proof.ts
  modified:
    - scripts/run-brownfield-proof.mjs
    - test/helpers/brownfield-fixture.ts
    - test/brownfield-gsd-cycle.test.ts

key-decisions:
  - "Relocate setupBrownfieldFixture and runBrownfieldLifecycle to src/core/brownfield-proof.ts so release scripts in scripts/ import only package-included modules in dist/src/"
  - "Re-export brownfield helpers from test/helpers/brownfield-fixture.ts to preserve backward compatibility across tests without duplication"
  - "Integrate witnessWorkerDelegation into the brownfield execute phase to verify worker role execution preserves planning immutability"

patterns-established:
  - "Published scripts in scripts/ must never import from dist/test/; all runtime helpers must live in dist/src/"
  - "Brownfield benchmark exercises all 5 lifecycle stages with inspectable report details and worker authority verification"

requirements-completed: [REL-04]

verification:
  - kind: script
    ref: "scripts/run-brownfield-proof.mjs"
    status: pass
    details: "All 5 stages (DISCUSS, PLAN, EXECUTE, VERIFY, SHIP) passed in standalone runner"
  - kind: unit
    ref: "test/brownfield-gsd-cycle.test.ts"
    status: pass
    details: "All 5 unit/e2e tests pass including deterministic history, 5-stage cycle, and worker authority enforcement"
  - kind: script
    ref: "scripts/audit-tarball.mjs"
    status: pass
    details: "158 allowlisted entries verified with zero forbidden or unallowlisted files"

## Self-Check: PASSED
- [x] scripts/run-brownfield-proof.mjs imports only dist/src/core/brownfield-proof.js
- [x] Package closure verified via audit-tarball.mjs
- [x] Authentic 5-stage GSD lifecycle executed with single-writer authority
- [x] Automated test commands exit 0
