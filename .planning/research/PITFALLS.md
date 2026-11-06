# Pitfalls Research

**Milestone:** v0.8.0 Unified Tool Updates & Compatibility
**Researched:** 2026-11-06
**Confidence:** HIGH for observed seams; MEDIUM for proposed recovery.

## Critical Pitfalls

| Pitfall | Failure | Prevention | Build stage |
|---|---|---|---|
| Generic GitHub stable filter | Cua stable driver releases disappear; repository latest can be another product | Source-family/channel rules; bounded pagination; separate OS support | Discovery |
| Floating latest launch arguments | Execution updates without an explicit user update | Resolve once and render exact identities | Local records/planning |
| New version with old bundled hashes | ECC/Cua consumers reject updates until alpha-AOS is republished | Derive hashes from verified sources and adapter revision; migrate all consumers | Records/migration |
| Hash/text success assumed semantic success | Upstream meaning or routing changes despite matching patterns | Structural preconditions and actual integration verification | Adapters |
| Exact-string hook detection | Changed upstream require syntax can bypass needed correction | Test required behavior; explicit applicability, verify upstream fix before retirement | Adapters |
| File rollback claimed to cover native effects | External installer changes remain after failure | Source-specific recovery, previous artifacts, observed final state | Recovery |
| One MCP recipe for all revisions | New protocol model differs from installed SDK capabilities | Probe actual common revision and tool schema, including proxies | Integration |
| Silent fallback to older version | CLI says updated despite keeping old bytes | Separate requested/resolved/active/retained outcome | Results |
| Separate guidance assumed effective | File is undiscovered, duplicated or lower precedence | Prove native discovery/precedence before removing transformation | Adapters |
| Full ECC setup imported | Duplicate hooks/profiles/lifecycle | Preserve selected scope and narrow official operations | Adapters |
| Handshake advertised as useful invocation | Credentials/permissions/quota/schema fail later | Distinct installed/discovered/invoked states | Verification |

Sources: [Cua release contract](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0), [npm tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/), [MCP changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog), [ECC setup](https://github.com/affaan-m/ECC), [local evidence](EVIDENCE.md).

## Recovery Constraints

Retain prior artifacts until acceptance and verify installer retention behavior. Do not automatically repeat GUI actions or other side effects as an update test. Prefer relevant permitted read-only calls. Expose failed restoration and remaining identity/effects. Keep runtime integrity/path/secret/recovery checks separate from optional full test suites and CI; do not restore historical promotion/cooldown gates.

## Research Gaps

No real upgrades, rollback experiments, GUI sessions or cross-platform invocation matrix were executed. Linux preview support and macOS permissions require host evidence. Actual compatibility of observed newer packages is unverified. Maturity of an upstream project does not establish compatibility of a particular release.
