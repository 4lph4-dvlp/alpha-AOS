---
phase: "39"
slug: tool-inventory-and-local-release-records
status: blocked
threats_open: 3
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
| T-39-04 | DoS / local files | medium | mitigate | `tool-records.ts` bounds file size, depth and count, with incomplete history; no oversized/deep/limit fixture was found among phase tests. | open — below threshold |
| T-39-05 | Elevation / state path | high | mitigate | `proveToolRecordRoot`, path proofs and pre-write rechecks; `tool-record-store.test.ts` exercises checkout alias, lock replacement and ancestor replacement. | closed |
| T-39-06 | Tampering / writer | high | mitigate | Session ownership, digest/proof checks and immutable event conflict rejection in `tool-record-store.ts`; retry and stale tests in `tool-record-store.test.ts`. | closed |
| T-39-07 | Repudiation / history | high | mitigate | Started/result/finish event sequence and interrupted state; multi-result and crash cases in `tool-record-store.test.ts`. | closed |
| T-39-08 | Spoofing / acceptance | high | mitigate | Reducer checks bound proof, matching results and applied terminal journal, prior digest and incomplete history; tests cover missing journal, stale transition and crash before commit. | closed |
| T-39-09 | Disclosure / exceptions | high | mitigate | `runToolRecordOperation` converts callback exceptions to typed failed results; existing canary asserts the read model excludes the exception. The plan explicitly requires checking persisted files and CLI output too; no such canary assertion was found. | open |
| T-39-10 | Elevation / observer commands | high | mitigate | Observer reads bounded files without executing commands; subprocess sentinel in `tool-observers.test.ts`, wrapper fixture in `tool-bindings.test.ts`. | closed |
| T-39-11 | Spoofing / ownership | high | mitigate | `tool-bindings.ts` resolves target identities and separates connection and installation ownership; five-harness, split and wrapper tests. | closed |
| T-39-12 | Disclosure / projection | high | mitigate | Observer and bindings project selected fields; configuration and wrapper canaries in `tool-observers.test.ts` and `tool-bindings.test.ts`. | closed |
| T-39-13 | Tampering / unknown versus missing | medium | mitigate | Observer models failed reads and malformed manifests as uncertain; tests cover malformed files and empty universe, but no explicit EACCES fixture was found. | open — below threshold |
| T-39-14 | Spoofing / official provenance | high | mitigate | `tool-handoff-loader.ts` authenticates npm signature, digest and `package.json` bytes against a policy read from package root; checked-in policy is empty and fails closed. With a populated policy, only the manifest is compared, while `userModificationEvidence: unmodified` and prior ownership are retained claims not authenticated by npm signature. Manifest-only readiness can be valid if consumers and labels limit it to that scope, but it does not establish the plan's complete current installation and prior modification/ownership chain. Test only changes the manifest. No real host chain was assumed. | open |
| T-39-15 | Tampering / legacy changes | high | mitigate | Closed legacy references survive explicit writer→reader roundtrip (`tool-handoff.test.ts`); loader test checks input bytes unchanged. This does not independently prove those claims, tracked in T-39-14. | closed |
| T-39-16 | Spoofing / present health | high | mitigate | `reconcileToolState` separates accepted and current state, scopes reuse by fingerprint, path, platform, architecture and active harness; `tool-inventory.test.ts` exercises mismatches and later failure. | closed |
| T-39-17 | Repudiation / failure display | medium | mitigate | Latest operation retained separately; CLI fixture checks mixed result and operation identity in human and JSON output. | closed |
| T-39-18 | Tampering / CLI IDs | high | mitigate | ID validation and exclusive options; traversal, invalid combinations and missing operation fixtures in `tool-inventory-cli.test.ts`. | closed |
| T-39-19 | Disclosure / rendering | high | mitigate | Projection canaries and human/JSON shape tests exist, but no end-to-end secret canary asserts both human and JSON CLI output and byte-budget boundary as specified in the plan. | open |
| T-39-20 | Elevation / read dispatch | high | mitigate | Subprocess sentinel and snapshot comparison cover read-only collector/CLI; `tool-inventory-compat.test.ts` checks legacy consumer compatibility. | closed |
| T-39-21 | Spoofing / category display | medium | mitigate | Category summary, problem-first ordering and independent axes covered by `tool-inventory.test.ts` and binding fixtures. | closed |
| T-39-SC | Tampering / new packages | high | mitigate | Phase plans add no package installation; package changes for handoff cover shipped policy, rather than new npm/pip/cargo dependencies. | closed |

## Required closure evidence

- T-39-14: keep readiness limited to authenticated manifest scope without claiming installation-wide unmodified state or established prior ownership, or verify the entire claimed installation and independently supported ownership/modification chain. Add negative fixtures that alter a non-manifest file and forge the retained ownership/modification claims, with expected scoped or needs-evidence outcomes.
- T-39-09: inject an exception secret and assert it is absent from persisted event/journal bytes and both relevant CLI renderings.
- T-39-19: exercise secret-bearing configuration and records through both CLI formats and assert no canary leakage; exercise the documented output byte budget.
- T-39-04 and T-39-13: add bounded/deep/oversize and access-denied fixtures, respectively, and confirm incomplete or unknown diagnostics.

## Accepted Risks Log

No accepted risks. Gaps are not accepted by this audit.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open (all severities) | Blocking open | Run By |
|---|---:|---:|---:|---:|---|
| 2026-11-06 | 22 | 17 | 5 | 3 | Codex source and test review |

## Sign-Off

- [x] Every plan-time threat has a disposition.
- [ ] All blocking mitigations and their specified negative tests verified.
- [ ] `threats_open: 0`.
- [ ] `status: verified`.

**Approval:** pending. Fix or explicitly accept the blocking gaps and rerun. Test gaps are recorded as unverified requirements, not claims of exploitable disclosure. A populated trust policy or actual host provenance was not inferred.

