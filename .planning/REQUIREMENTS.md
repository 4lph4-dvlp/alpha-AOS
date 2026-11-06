# Requirements: alpha-AOS v0.8.0

**Milestone:** Unified Tool Updates & Compatibility
**Defined and approved:** 2026-11-06
**Approval:** Owner accepted all four categories and all 16 requirements after research (reply: 동의).
**Core value:** A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.

## v0.8.0 Requirements

Unchecked means not delivered/verified; approval of scope is not implementation evidence.

### Local Updates

- [ ] **LOC-01**: Users can inspect installed versions, official sources and management ownership for Cua, GSD, ECC, managed MCP servers and bridges in one inventory.
- [ ] **LOC-02**: Installation and explicit tool-update requests resolve the latest official releases locally, without prior alpha-AOS remote lock promotion or repository write permission; selection follows each source's official stable-channel rules and excludes semantic prereleases/nightlies.
- [ ] **LOC-03**: Before applying an update, users can review exact old/new versions, affected targets, native installer side effects and recovery scope; apply remains bound to the reviewed release identities.
- [ ] **LOC-04**: Users can inspect locally recorded exact versions, official sources, verified artifact integrity and applied results for each managed tool.

### Compatibility Management

- [ ] **ADAPT-01**: Users and maintainers can inspect each compatibility correction's rationale, applicability, verification method and removal condition.
- [ ] **ADAPT-02**: Tool integration minimizes upstream file/content transformations and prefers official settings and public interfaces; necessary translation remains explicit adapter code.
- [ ] **ADAPT-03**: When separate alpha-AOS guidance replaces an upstream transformation, the supported harness can actually discover that guidance and invoke the intended tool route, with evidence of effective behavior.
- [ ] **ADAPT-04**: A compatibility correction resolved upstream is removed after the selected release's behavior is verified, with the retirement reason and evidence retained.

### Verification and Recovery

- [ ] **PROOF-01**: A newly resolved version can be evaluated through actual integration checks rather than refused merely because its version has not previously been recorded as supported.
- [ ] **PROOF-02**: Users can distinguish installation, tool discovery, schema/protocol verification and successful real invocation; missing prerequisites or unperformed checks remain explicitly unverified.
- [ ] **PROOF-03**: A failed pre-apply check preserves the existing working installation and reports the specific failure rather than silently downgrading or claiming update success.
- [ ] **PROOF-04**: Failures after apply trigger tool-specific recovery and reconciliation, reporting effects that could not be restored and the actual remaining state.

### Migration and Operation

- [ ] **MIG-01**: Existing stable-lock and Cua-pin installations can migrate to local management while preserving user changes and prior ownership/provenance evidence.
- [ ] **MIG-02**: Installation, native configuration, diagnostics, project isolation and recovery use the same selected local version record rather than inconsistent hidden bundled pins.
- [ ] **MIG-03**: CLI and bilingual documentation distinguish external-tool updates from alpha-AOS code updates and document patch-release/local developer deployment for compatibility fixes.
- [ ] **MIG-04**: Users receive component/platform/harness-specific outcomes, including effects on shared configuration and dependencies rather than misleading universal success or failure.

## Interpretation and Boundaries

- Latest is selected only at installation/explicit-update time. Native launch configuration retains the exact selected identity. Reproducibility/integrity survive removal of centralized version selection.
- Cua's plain stable driver tags can have GitHub prerelease metadata; source-specific official channel semantics govern selection. Platform/architecture support remains separate from release-channel stability.
- Runtime integrity, root bounds, secret handling, writer ownership, reviewed mutations and recovery safeguards remain in force. Optional full-suite/CI policy is unchanged; meaningful product integration evidence is not a new push/CI prerequisite.
- Actual protocol/schema/call evidence concerns the selected tool/harness combination. Synthetic fixture/configuration presence alone is not proof of target-host invocation. Unavailable credentials, permissions, reload or service prerequisites are visible conditions.
- Upstream content should be retained where practical. Necessary corrections are not removed solely to reduce file counts; their replacement must work. Runtime AI rewriting is excluded.
- Alpha-AOS-owned skills/bundled dependencies, harness applications and CLI-Hub prerequisites are inventoried as ownership boundaries, not automatically added as new external-tool provisioning scope.

## Future and Preserved Work

- Unresolved v0.7.0 live acceptance and older work remain in [rollover archives](milestones/v0.7.0-ROLLOVER.md), not implicitly included in these 16 requirements.
- Hosted-service migration, broader CLI-Hub provisioning and installation of harness applications require separate scope.

## Out of Scope

| Feature | Reason |
|---|---|
| Background updates and scheduled remote promotion | Owner selected installation/explicit-update triggers; schedules remain disabled |
| Nightly, beta or release-candidate selection | Owner selected official stable releases only |
| Runtime AI self-patching | Compatibility changes remain reviewed alpha-AOS adapter/code changes |
| Full ECC profiles or duplicate workflow ownership | Preserve selected capabilities and GSD product lifecycle ownership |
| New remote compatibility plugin distribution service | Patch releases/local deployment cover the approved maintenance path |
| Automatic push, publication, deployment or live tool upgrade during planning | Milestone planning does not authorize these effects |

## Traceability

The approved roadmap allocates each requirement to exactly one phase, continuing at 39. The owner approved all 16 requirements and the five-phase allocation on 2026-11-06.

| Requirement | Phase | Status |
|---|---|---|
| LOC-01 | Phase 39 | Implemented; human verification pending |
| LOC-02 | Phase 40 | Not started |
| LOC-03 | Phase 40 | Not started |
| LOC-04 | Phase 39 | Implemented; human verification pending |
| ADAPT-01 | Phase 41 | Not started |
| ADAPT-02 | Phase 41 | Not started |
| ADAPT-03 | Phase 41 | Not started |
| ADAPT-04 | Phase 41 | Not started |
| PROOF-01 | Phase 42 | Not started |
| PROOF-02 | Phase 42 | Not started |
| PROOF-03 | Phase 42 | Not started |
| PROOF-04 | Phase 42 | Not started |
| MIG-01 | Phase 43 | Not started |
| MIG-02 | Phase 43 | Not started |
| MIG-03 | Phase 43 | Not started |
| MIG-04 | Phase 43 | Not started |

**Coverage:** 16 approved requirements; 16 mapped to exactly one approved phase; 0 unmapped; 0 duplicated.

## Evidence

[Research summary](research/SUMMARY.md), [source/code inventory](research/EVIDENCE.md). Research did not install/upgrade tools or establish new-version live compatibility. No requirements are marked complete.
