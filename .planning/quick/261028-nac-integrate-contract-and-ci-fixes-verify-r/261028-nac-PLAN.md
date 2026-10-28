---
status: planned
---
# Integrate repairs and release 0.4.8

User authorizes combining the other session's contract repair with the CI repairs, checking the combined result, bumping the version and updating the remote repository plus all installed local harnesses. Ordinary conversational GSD, inline implementation and review; no agent delegation or autopilot start.

Inputs: CI commits 42446cf..df8edf9; contract repair 062c7f6 and its evidence cc190d8. They are already linear on fix/ci-parity. Other session's durable full job 927acc9961894ba8 ended failed with the same Windows EBUSY cleanup defect as stable CI 40649620949. Candidate 40649624517 passed all OS/package gates.

1. Review schema/runtime alignment and negative tests. Fix bounded Windows fixture cleanup without ignoring failures. Prepare package/lock/changelog version 0.4.8.
2. Compile and run focused tests. Freeze a clean combined release checkout; full local push gate, three-OS CI and weekly candidate verification must pass before release. No edits to a running verification checkout.
3. Fast-forward remote main without discarding concurrent changes; publish the version tag. Link the verified package and preview/apply stable alpha-AOS installation for Claude, Codex, Antigravity, Pi and Hermes. Use managed transactions; preserve secrets and stable lock promotion policy.
4. Verify installed alpha-AOS version, native harness discovery and read-only invocation, synchronization and diagnostics. Record exact results, any unsupported parity or remaining multi-phase lifecycle limitations, then close GSD records and memory.

Acceptance: actual final product commit passes the complete local gate, all OS CI legs and candidate fixtures. All locally detected harnesses report updated managed configuration, or an explicit unresolved limitation blocks completion. No claim that enabling schema routes proves complete live multi-phase execution.
