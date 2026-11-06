---
phase: 39-tool-inventory-and-local-release-records
plan: "04"
status: incomplete
subsystem: tool-inventory
tags: [handoff, provenance, records, inventory]
requires: [39-02, 39-03]
provides: [signed-chain-evaluation-api, separate-observation-acceptance-operation-projection]
affects: [39-05, 42, 43]
tech-stack:
  added: []
  patterns: [explicit-trust-anchors, fingerprint-bound-proof-reuse]
key-files:
  created: [src/core/tool-handoff.ts, test/tool-handoff.test.ts, test/tool-inventory.test.ts]
  modified: [src/core/tool-records.ts, schemas/tool-release-record.schema.json, src/core/tool-inventory.ts, src/format.ts, test/tool-inventory-cli.test.ts]
key-decisions:
  - "Do not infer publisher provenance from pins, booleans, or a local hash."
  - "Keep source-specific signing keys independent of candidate evidence."
actuals:
  tokens: 10381
  tasks: 0
  commits: 2
  plan_head_before: ff0a69d60fd9917c7a810619ca02dafd253a79c9
  plan_head_after: 011a82d84264ab7dc3f3643832473f50d3bc5e40
completed: 2026-11-06
---

# Phase 39 Plan 04: Handoff and Inventory — Incomplete

The typed handoff evaluator checks source-specific trust anchors, signed retained metadata, subject and scope links, artifact hashes, and current or transformed bytes. Synthetic signed fixtures can produce ready without installation or downloading, and the explicit record writer preserves the closed legacy fields. Inventory separately reports current observations, accepted identity and the latest operation; prior proofs are reused only against matching identity, fingerprint, platform, architecture, and active harness.

## Work and Verification

- `eef163e` recorded a RED assertion for the missing reconciliation API. The classifier returned `RED_EVIDENCE_OK`; the assertion checked API availability, not the full feature.
- `011a82d` added the evaluator, typed record fields, inventory projection and tests.
- `npm run build` passed. `node scripts/run-tests.mjs --files dist/test/tool-handoff.test.js dist/test/tool-inventory.test.js dist/test/tool-records.test.js dist/test/tool-record-store.test.js dist/test/tool-inventory-cli.test.js` passed 20 tests.
- The trust anchor and signatures used by the readiness tests are generated fixture keys. They do not establish that any installed host artifact has official provenance. No integration check, download, installation, migration or recovery was executed.

## Unmet Production Criterion and Decision

The production collector has no bounded loader for retained signed chains and no established policy for source-specific trust anchor provisioning. It therefore reports observed legacy candidates as needing evidence and cannot recognize a sufficient retained chain on an actual host. The plan's collector-level ready criterion is not met; no requirement is claimed complete by this summary.

The concrete design decision is where and how an independently reviewed source-specific public-key trust store is provisioned, updated and revoked, and how a separately stored bounded chain refers to it. Candidate-supplied or adjacent unreviewed keys cannot be treated as trusted. Once a policy is chosen, implement a read-only, external-root-bounded loader that validates the closed chain fields, authenticates against that trust store, and binds current bytes and the candidate path before invoking the existing evaluator. Then add production collector fixtures and rerun the plan verification.

Proof reuse currently fingerprints a single observed regular-file candidate up to 16 MiB; directories, larger files, old records without fingerprints, and unresolved identities remain unverified. Existing selected pins and journal entries are not treated as provenance.

## Self-Check: PASSED

Source and test artifacts exist, both task commits are ancestors of the recorded plan head, and targeted tests passed. The plan remains incomplete because the production trust-store and retained-chain loader are unresolved.
