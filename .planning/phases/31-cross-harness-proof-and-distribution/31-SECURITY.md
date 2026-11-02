---
phase: "31"
slug: cross-harness-proof-and-distribution
status: verified
threats_open: 0
threats_total: 13
threats_closed: 13
register_authored_at_plan_time: true
asvs_level: 1
created: "2026-11-03"
---

# Phase 31 — Security

The plan-authored STRIDE register was checked against implementation and passing tests at source 9b6679a481a0d694551712e6c1f621afbdada704. ASVS L1 / block-on-high applies. All 13 unique threats have concrete mitigations; the L1 zero-open-threat short-circuit in the secure-phase workflow applies, so no deeper auditor or new authority is required.

## Trust Boundaries

Packaged documentation, schemas, guidance and stable lock bytes cross into archive audit and doctor. Untrusted proof indices cross into the bounded verifier. Shared policy/bootstrap data cross into controller and approval gates. Packed fixtures cross sandbox environment and real host fingerprint boundaries.

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / evidence | Status |
|---|---|---|---|---|---|---|
| T-31-01 | Information Disclosure | `docs/*`, `README*.md`, `scripts/audit-tarball.mjs` | high | mitigate | provenance/doc privacy tests; decoded JSON/YAML/Set negative cases | closed |
| T-31-02 | Tampering | `scripts/audit-tarball.mjs` (`REQUIRED_V060_ENTRIES`) | high | mitigate | tarball allowlist and 14 required-entry tests; final tarball audit | closed |
| T-31-03 | Tampering | `src/core/doctor.ts` (`runDoctor` `ownedSkills`) | high | mitigate | doctor source/frontmatter/five-target tamper tests; deployed shape/read warnings | closed |
| T-31-04 | Elevation of Privilege | `test/task-entry-cross-harness.test.ts` (`behavior-policy`, `task-bootstrap`, `task-run`) | high | mitigate | four composed CLI journeys; exact approval/start and Hermes refusal assertions | closed |
| T-31-05 | Spoofing | `scripts/verify-task-entry-proof.mjs` & `docs/task-entry-proof-index.json` | high | mitigate | tier, commit/archive and hash spoofing negatives in task-entry-proof.test.ts | closed |
| T-31-06 | Denial of Service | `scripts/verify-task-entry-proof.mjs` & `docs/SUPPORT_MATRIX.md` | high | mitigate | bounded regular-file index, canonical cell order, privacy and malformed input tests | closed |
| T-31-07 | Tampering | `test/tarball-fixture.test.ts` (`skills/alpha-aos-task/SKILL.md`, `stack.lock.json`, deployed `SKILL.md`) | high | mitigate | packed source/target/deployed-byte tamper and rollback refusal tests | closed |
| T-31-08 | Tampering | `test/tarball-fixture.test.ts` (`hostSnapshot` & packed CLI sandbox) | high | mitigate | packed lifecycle before/after host fingerprints equal; zero vanished entries | closed |
| T-31-09 | Spoofing | `README.md`, `README.ko.md`, `docs/task-entry.md`, `docs/task-entry.ko.md`, `test/task-entry-docs.test.ts` | high | mitigate | bilingual section/label/link and version/limit contract tests | closed |
| T-31-10 | Information Disclosure | `docs/task-entry*.md`, `README*.md`, `scripts/audit-tarball.mjs` | high | mitigate | post-ledger privacy checks and tarball audit (451 entries) | closed |
| T-31-11 | Repudiation | `docs/task-entry-proof-index.json` & `docs/task-entry-proof.md` (`regressionLedger`) | high | mitigate | full log counts, exact required groups/gates, source bindings and five-row history | closed |
| T-31-12 | Elevation of Privilege | Final acceptance gate (`31-05-01`, `31-05-02`) | high | mitigate | clean independent review; all mandatory commands passed; release holds retained | closed |
| T-31-SC | Tampering | Supply chain & locked dependencies | high | mitigate | stable lock unchanged; no new dependencies; build artifact and packed stable channel verified | closed |

## Accepted Risks Log

No new risks were accepted or waived. Paid native G-07-2, other-OS CI, global reconciliation, push, version bump/publication and separate milestone final review remain held. Windows permission-constrained fixtures are counted as skipped, never passed. This L1 audit does not claim live paid/other-OS validation.

## Sign-Off

- [x] All plan-authored threats have a mitigation and observed source/test evidence.
- [x] No new risk acceptance or authority expansion.
- [x] threats_open: 0.
- [x] status: verified; 2149 total / 2135 passed / 0 failed / 14 skipped / 0 not-run.

Review fixes CR-01, CR-02, CR-03 and WR-01 are closed in the independent review disposition. Post-ledger package/build/proof checks pass.

## Security Audit 2026-11-02

| Metric | Count |
|---|---|
| Threats found | 13 |
| Closed | 13 |
| Open | 0 |
