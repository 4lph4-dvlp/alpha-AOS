---
phase: 39-tool-inventory-and-local-release-records
plan: "04"
status: complete
subsystem: tool-inventory
tags: [handoff, provenance, records, inventory]
requires: [39-02, 39-03]
provides: [signed-chain-evaluation-api, offline-npm-evidence-loader, separate-observation-acceptance-operation-projection]
affects: [39-05, 42, 43]
tech-stack:
  added: []
  patterns: [explicit-trust-anchors, fingerprint-bound-proof-reuse]
key-files:
  created: [src/core/tool-handoff.ts, src/core/tool-handoff-loader.ts, catalog/tool-handoff-policy.json, docs/tool-handoff-evidence.md, test/tool-handoff.test.ts, test/tool-inventory.test.ts, test/tool-handoff-loader.test.ts]
  modified: [src/core/tool-records.ts, schemas/tool-release-record.schema.json, src/core/tool-inventory.ts, src/format.ts, test/tool-inventory-cli.test.ts, package.json, scripts/audit-tarball.mjs]
key-decisions:
  - "Do not infer publisher provenance from pins, booleans, or a local hash."
  - "Keep source-specific signing keys independent of candidate evidence."
  - "Use reviewed npm registry ECDSA keys and package identities; retain an empty policy until actual keys and identities have been reviewed."
actuals:
  tokens: 17351
  tasks: 2
  commits: 7
  plan_head_before: ff0a69d60fd9917c7a810619ca02dafd253a79c9
  plan_head_after: c12a6617a11e365b6edaec85bbf4ea5305db3c25
completed: 2026-11-06
---

# Phase 39 Plan 04: Handoff and Inventory

The collector verifies retained npm registry signatures offline against separately reviewed source policy, compares an installed manifest with the signed archive, and reports the exact checked scope. Inventory separately reports current observations, accepted identity and the latest operation; prior proofs are reused only against matching identity, fingerprint, platform, architecture, and active harness.

## Work and Verification

- `eef163e` recorded a RED assertion for the missing reconciliation API. The classifier returned `RED_EVIDENCE_OK`; the assertion checked API availability, not the full feature.
- `011a82d` added the evaluator, typed record fields, inventory projection and tests.
- `5236d60` recorded a RED assertion for the production evidence loader; its evidence classifier returned `RED_EVIDENCE_OK`.
- `6437879` added the bounded loader, reviewed policy, package inclusion, documentation and collector fixtures.
- `c12a661` displays the precise handoff evidence scope in human output.
- `npm run build` passed. The targeted handoff, inventory, record and observer suite passed 26 tests. `npm run audit-tarball` passed with 513 allowlisted entries.
- The readiness tests use synthetic npm ECDSA keys and signatures. No integration check, download, installation, migration or recovery was executed by inventory.

## Trust Policy and Scope

Following the user's decision, the collector reads a closed retained npm record and actual tarball from external state, checks a repository-reviewed package mapping, non-revoked and non-expired npm ECDSA public key, registry signature, tarball SHA-512 and current manifest bytes. Matching fixtures reach ready only for `package.json`; changed bytes are modified. The collector does not execute observed tools or fetch evidence.

The shipped policy contains no trusted keys or enabled packages: no real-host package is asserted verified. Adding keys requires independent review. Registry signatures authenticate registry package content, not publisher build provenance. Direct binary signatures, npm provenance attestations, transformed installed files, unrecognized tar features, and unchecked installation files remain unsupported or unverified. The separate synthetic signed-chain API is not used as an official npm verifier.

Proof reuse currently fingerprints a single observed regular-file candidate up to 16 MiB; directories, larger files, old records without fingerprints, and unresolved identities remain unverified. Existing selected pins and journal entries are not treated as provenance.

## Self-Check: PASSED

Source and test artifacts exist, task commits are ancestors of the recorded plan head, and targeted tests passed. The measured commit count includes the intervening checkpoint commit `03759bf` from the orchestrator.
