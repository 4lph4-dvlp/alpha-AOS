---
phase: 07-cross-platform-release-proof
plan: 05
subsystem: release-engineering
tags: [support-matrix, capability-ledger, antigravity-receipts, release-controls, mcp-proxy]

# Dependency graph
requires:
  - phase: 07-cross-platform-release-proof
    provides: "07-02 support matrix taxonomy and paired acceptance controls"
provides:
  - "Antigravity capability proof and receipt representation in support-matrix and capability-ledger"
  - "Real stdio process execution for Context7 optional invocation paired acceptance control"
  - "Parameter preservation fix in openObservedUpstream callTool"
affects: [support-matrix, capability-ledger, release-controls, doctor, mcp-proxy]

tech-stack:
  added: []
  patterns:
    - "Extend capability ledger schema and harness union to represent Antigravity invocation receipts"
    - "Execute real stdio child processes for paired MCP acceptance controls rather than in-memory observation arrays"

key-files:
  created: []
  modified:
    - src/core/support-matrix.ts
    - src/core/capability-ledger.ts
    - src/core/mcp-proxy.ts
    - src/core/canary.ts
    - src/adapters/capability-oracle.ts
    - schemas/capability-ledger.schema.json
    - test/support-matrix.test.ts
    - test/release-controls.test.ts

key-decisions:
  - "Include antigravity in LedgerHarness and schemas/capability-ledger.schema.json to allow Antigravity real-host discovery and invocation receipts to be represented"
  - "Fix openObservedUpstream callTool to pass params.arguments to observe(), ensuring identifierShapeOf classifies version-scoped arguments correctly"
  - "Execute genuine stdio child process for Context7 in test/release-controls.test.ts to prove native invocation behavior"

patterns-established:
  - "Antigravity receipts can now promote Antigravity cells to PROVEN when inspectable proofs exist in the capability ledger"
  - "Release controls execute real child processes over bounded stdio transport to produce authentic observation evidence"

requirements-completed: [REL-02, REL-03]

verification:
  - kind: unit
    ref: "test/support-matrix.test.ts"
    status: pass
    details: "All 5 tests pass including inspectable Antigravity receipt promotion to PROVEN"
  - kind: unit
    ref: "test/release-controls.test.ts"
    status: pass
    details: "All 4 paired control domains pass with real stdio process execution for Context7"

## Self-Check: PASSED
- [x] All acceptance criteria verified
- [x] Antigravity receipt representation enabled and tested
- [x] Real native Context7 invocation in release controls verified
- [x] Automated test commands exit 0
