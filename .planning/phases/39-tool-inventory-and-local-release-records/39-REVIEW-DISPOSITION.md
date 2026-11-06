# Phase 39 Review Disposition

Re-review of commits `84153ad`, `052ae7e` and `47a2a04` against the original review.

- **CR-01 — resolved:** `readToolRecordStore` reconstructs accepted heads from `priorDigest` links independently of timestamp display order and detects ambiguous, unlinked and non-atomic transitions. The writer refuses new acceptance when those diagnostics exist. The added tests cover equal timestamps, clock rollback, forks and atomicity.
- **CR-02 — open:** Directory and Cua fingerprinting were added, but a package manifest or GSD VERSION fingerprint now promotes integrity and invocation to whole-tool verified even if runtime code changed. See the updated review for the failure and required scope boundary.
- **CR-03 — resolved:** `acceptedToolResults` requires the specific applied event digest to equal the accepted reference; attribution matches hashed aliases and no longer derives ownership from a later failed result. The added binding test covers reused IDs and a hashed Windows path.

The handoff wording change limits the npm result to `package.json` and directs inspection of other files and ownership. The default reviewed key list is empty; synthetic test keys are not evidence of real-host registry trust.

This re-review inspected source and tests without rerunning them. The parent reported 16 record and 16 collector/binding tests passed; the consolidated suite remains pending.
