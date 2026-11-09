---
phase: "39"
slug: tool-inventory-and-local-release-records
status: verified
threats_open: 0
asvs_level: 1
block_on: high
created: "2026-11-06"
---

# Phase 39 — Security

Plan-time STRIDE register; one shared supply-chain row is deduplicated. This is a source and test review, not a certification. The parent owns test execution; no tests were run as part of this audit. The threshold count covers high and critical open threats; below-threshold open entries remain visible.

## Trust Boundaries

| Boundary | Data crossing |
|---|---|
| External tool files and harness configuration → inventory | Untrusted paths, manifests, commands, configuration and evidence; output must be bounded and projected. |
| External state root → records and reducer | Local event and journal bytes cross path, schema, integrity, identity and durability checks. Journals are local integrity evidence, not a signature against an attacker controlling the whole state root. |
| Retained provenance → handoff assessment | A reviewed application policy supplies trust keys; untrusted candidate and retained evidence must not create trust. |
| Model → human/JSON output | Credentials and raw configuration, exception text and arguments must not be disclosed. |

## Threat Register

| ID | Category / component | Severity | Disposition | Evidence and assessment | Status |
|---|---|---|---|---|---|
| T-39-01 | Spoofing / Cua identity | high | mitigate | `tool-inventory.ts` reads observed file independently of pin; `tool-inventory-cli.test.ts` exercises present and absent file. | closed |
| T-39-02 | Disclosure / records | high | mitigate | Closed schema and source checks in `tool-records.ts`; `tool-records.test.ts` rejects credential URL and extension canaries. | closed |
| T-39-03 | Tampering / record versions | high | mitigate | `tool-records.ts` validates versions and identities and prevents acceptance on invalid state; `tool-records.test.ts` exercises unknown versions and conflicts. | closed |
| T-39-04 | DoS / local files | medium | mitigate | Bounded size, depth and count with incomplete history in `tool-records.ts`; `tool-inventory-safety.test.ts` rejects oversize and deeply nested records without acceptance. | closed |
| T-39-05 | Elevation / state path | high | mitigate | `proveToolRecordRoot`, path proofs and pre-write rechecks; `tool-record-store.test.ts` exercises checkout alias, lock replacement and ancestor replacement. | closed |
| T-39-06 | Tampering / writer | high | mitigate | Session ownership, digest/proof checks and immutable event conflict rejection in `tool-record-store.ts`; retry and stale tests in `tool-record-store.test.ts`. | closed |
| T-39-07 | Repudiation / history | high | mitigate | Started/result/finish event sequence and interrupted state; multi-result and crash cases in `tool-record-store.test.ts`. | closed |
| T-39-08 | Spoofing / acceptance | high | mitigate | Reducer checks bound proof, matching results and applied terminal journal, prior digest and incomplete history; tests cover missing journal, stale transition and crash before commit. | closed |
| T-39-09 | Disclosure / exceptions | high | mitigate | Callback errors become typed failed results; `tool-record-disclosure.test.ts` scans all persisted state files and exercises operation and tool-history CLI in human and JSON formats with an exception canary. | closed |
| T-39-10 | Elevation / observer commands | high | mitigate | Observer reads bounded files without executing commands; subprocess sentinel in `tool-observers.test.ts`, wrapper fixture in `tool-bindings.test.ts`. | closed |
| T-39-11 | Spoofing / ownership | high | mitigate | `tool-bindings.ts` resolves target identities and separates connection and installation ownership; five-harness, split and wrapper tests. | closed |
| T-39-12 | Disclosure / projection | high | mitigate | Observer and bindings project selected fields; configuration and wrapper canaries in `tool-observers.test.ts` and `tool-bindings.test.ts`. | closed |
| T-39-13 | Tampering / unknown versus missing | medium | mitigate | Malformed files and absent candidates are distinguished; injected EACCES in `tool-inventory-safety.test.ts` verifies unknown. This is injected error behavior, not an OS ACL integration test. | closed |
| T-39-14 | Spoofing / official provenance | high | mitigate | Reviewed policy authenticates npm signature and artifact; scoped result explicitly identifies `package.json` and instructs inspection of remaining files and ownership. `tool-handoff-loader.test.ts` changes non-manifest bytes and forges owner/modification claims without promoting whole-installation integrity or integration. Checked-in policy is empty; no actual host provenance chain is assumed. | closed |
| T-39-15 | Tampering / legacy changes | high | mitigate | Closed legacy references survive explicit writer→reader roundtrip (`tool-handoff.test.ts`); loader test checks input bytes unchanged. This does not independently prove those claims, tracked in T-39-14. | closed |
| T-39-16 | Spoofing / present health | high | mitigate | Acceptance and observation stay separate; `9e545b9` keeps metadata-file matches in historical scoped evidence rather than promoting aggregate health. Real collector test modifies runtime files while metadata remains unchanged and also changes the Cua executable. | closed |
| T-39-17 | Repudiation / failure display | medium | mitigate | Latest operation retained separately; CLI fixture checks mixed result and operation identity in human and JSON output. | closed |
| T-39-18 | Tampering / CLI IDs | high | mitigate | ID validation and exclusive options; traversal, invalid combinations and missing operation fixtures in `tool-inventory-cli.test.ts`. | closed |
| T-39-19 | Disclosure / rendering | high | mitigate | `tool-inventory-safety.test.ts` checks configuration canaries through human and JSON CLI and exercises JSON byte-budget refusal; `tool-record-disclosure.test.ts` checks exception canaries in both formats. Human output budget is not established by the JSON budget fixture. | closed |
| T-39-20 | Elevation / read dispatch | high | mitigate | Snapshot and common network/subprocess sentinels cover default inventory; entry instrumentation confirmed planner and transaction loaded and not invoked. Other entry modules and network transports are not all dynamically exercised. | closed |
| T-39-21 | Spoofing / category display | medium | mitigate | Category summary, problem-first ordering and independent axes covered by `tool-inventory.test.ts` and binding fixtures. | closed |
| T-39-SC | Tampering / new packages | high | mitigate | Phase plans add no package installation; package changes for handoff cover shipped policy, rather than new npm/pip/cargo dependencies. | closed |

## Accepted Risks Log

No accepted risks. Gaps are not accepted by this audit.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open (all severities) | Blocking open | Run By |
|---|---:|---:|---:|---:|---|
| 2026-11-06 | 22 | 17 | 5 | 3 | Initial source and test review |
| 2026-11-06 | 22 | 22 | 0 | 0 | Re-audit of fixes and targeted fixture evidence |

## Sign-Off

- [x] Every plan-time threat has a disposition.
- [x] All blocking mitigations and applicable negative tests verified.
- [x] `threats_open: 0`.
- [x] `status: verified`.

**Verification:** 2026-11-06. Review considered commits `84153ad`, `052ae7e`, `47a2a04`, `a4c7d3e`, and `9e545b9`. Fixture owner reported safety tests 7/7 and scoped-collector tests 16/16 after build on Windows; this audit did not rerun them. The parent owns the consolidated suite. The checks do not establish a populated trust policy, actual host provenance, cross-platform ACL behavior, all network transports, or a human output byte budget.

