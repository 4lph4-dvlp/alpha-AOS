# Roadmap: alpha-AOS v0.8.0

## Overview

Unified Tool Updates & Compatibility moves external-tool release selection from alpha-AOS remote lock promotion to the local installation/explicit-update lifecycle. Build a shared exact-identity record, connect official npm/Cua release sources, minimize compatibility transformations, verify actual integration and recover native effects, then migrate all consumers and guidance.

**Status:** Owner approved the five-phase roadmap on 2026-11-06 (reply: 승인). Phase 39 planning and independent plan review are complete; implementation has not started. All 16 requirements remain undelivered/unverified.
**Numbering:** Continue after v0.7.0 Phase 38, starting at 39.
**Research:** [summary](research/SUMMARY.md), [evidence](research/EVIDENCE.md).
**Requirements:** [16 approved requirements](REQUIREMENTS.md).

## Milestone History

- Earlier releases and unfinished work remain recorded in [MILESTONES.md](MILESTONES.md) and [milestone archives](milestones/).
- v0.7.0 implementation/live-acceptance distinction is preserved in [rollover](milestones/v0.7.0-ROLLOVER.md). This roadmap does not close that milestone or restart its external tasks.
- v0.8.0 comprises only the 16 requirements approved on 2026-11-06.

## Phases

- [x] **Phase 39: Tool Inventory and Local Release Records** — shared ownership and exact identity for all managed tools. (completed 2026-11-07)
- [ ] **Phase 40: Local Official Release Updates** — source-aware npm/Cua discovery and exact reviewed updates.
- [ ] **Phase 41: Minimal Compatibility Adapters** — reduce upstream transformations with verified explicit adapters.
- [ ] **Phase 42: Integration Verification and Recovery** — real integration evidence and native-effect recovery.
- [ ] **Phase 43: Migration and Consistent Guidance** — migrate old consumers and expose consistent operation/results.

## Phase Map

| Phase | Requirements | Success criteria | Depends on |
|---|---|---|---|
| 39 | LOC-01, LOC-04 | 4 | None |
| 40 | LOC-02, LOC-03 | 4 | 39 |
| 41 | ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04 | 4 | 40 |
| 42 | PROOF-01, PROOF-02, PROOF-03, PROOF-04 | 4 | 41 |
| 43 | MIG-01, MIG-02, MIG-03, MIG-04 | 4 | 42 |

## Phase Details

### Phase 39: Tool Inventory and Local Release Records

**Goal:** Users and every downstream consumer can inspect one authoritative local identity and ownership model for managed external tools, including Cua.
**Depends on:** Nothing (first phase of this milestone).
**Requirements:** LOC-01, LOC-04
**Success Criteria:**
1. One inventory lists Cua, GSD, ECC, managed MCP servers and bridges with installed version, official source and management ownership; missing/unknown evidence is distinguished from verified evidence.
2. A local versioned record can identify the exact selected artifact, source, verified integrity, installed result and associated operation; records are outside the alpha-AOS package checkout and contain no credential values.
3. Requested, resolved, installed and verified identities remain distinguishable, and interrupted or failed operations do not overwrite prior accepted identity with false success.
4. Maintainers can see which components are alpha-AOS-owned skills/bundled libraries or external prerequisites rather than managed tool installations; the record contract defines how old stable/Cua identities will be adopted without assuming trust in arbitrary current bytes.

**Plans:** 5/5 plans complete; verified and UAT passed on 2026-11-07. All 4 UAT items accepted.
**Wave 1**
- [x] 39-01-PLAN.md — Actual Cua read-only inventory tracer and versioned record reader.

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 39-02-PLAN.md — Explicit safe record writer and failure/interruption history.
- [x] 39-03-PLAN.md — Full managed-tool observation and per-harness installation attribution.

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 39-04-PLAN.md — Evidence-bounded legacy handoff contract and current/accepted/latest-result reconciliation.

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 39-05-PLAN.md — Default/detail/tool-and-operation-history output and consumer compatibility checks.

### Phase 40: Local Official Release Updates

**Goal:** Users can resolve and review official latest external-tool releases locally without alpha-AOS remote lock promotion or repository write permission.
**Depends on:** Phase 39.
**Requirements:** LOC-02, LOC-03
**Success Criteria:**
1. Installation and an explicit tool-update request use a common lifecycle covering npm-managed components and Cua through their official source-specific adapters; normal launches do not silently select new releases.
2. Cua selection follows the driver release family and official stable-channel convention despite GitHub prerelease labels, excludes nightly tags, and handles OS/architecture support and incomplete bounded discovery explicitly. npm selection excludes semantic prereleases even when tagged latest.
3. Preview identifies exact old/new versions and artifacts, affected targets, native effects and recovery scope. Apply revalidates reviewed identities rather than resolving a moving latest tag again or falling back silently.
4. Discovery failure, invalid/unverifiable metadata or an unsupported platform produces a specific refusal with existing state retained; no checkout catalog/remote repository mutation is needed for ordinary tool updates. Existing runtime safeguards remain applied through the common installer route.

**Plans:** 4/4 plans executed
- [x] 40-03-PLAN.md
- [x] 40-04-PLAN.md

**Wave 1**
- [x] 40-01-PLAN.md — Source-specific official stable release resolvers, Cua dynamic archive verification & version retention, and read-only preview binding tracer.

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 40-02-PLAN.md — Bound `--apply` revalidation, in-memory `StackLock` synthesis, filtered install/update orchestration, `tool-records` persistence, and 4-section CLI/formatter integration.

### Phase 41: Minimal Compatibility Adapters

**Goal:** Routine upstream updates need fewer alpha-AOS changes because integration uses official interfaces and explicit, retireable compatibility adapters.
**Depends on:** Phase 40.
**Requirements:** ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04
**Success Criteria:**
1. Users/maintainers can inspect every retained correction's rationale, applicability, verification method and removal condition, including affected tool/harness/platform context.
2. The existing ECC section replacements, GSD hook detection and other identified transformations are reviewed and reduced in favor of official settings/public interfaces where effective; remaining transformations are explicit adapters with validated preconditions rather than unexplained edits.
3. Before a rewrite is replaced by separate alpha-AOS guidance, supported native discovery/precedence and intended tool invocation are demonstrated; duplicate or ineffective guidance cannot count as completed migration.
4. An upstream-resolved correction can be retired with selected-release behavior evidence and a retained retirement reason; necessary corrections are not removed on a guessed version threshold, and runtime AI rewriting is absent.

**Plans:** TBD after roadmap approval.

### Phase 42: Integration Verification and Recovery

**Goal:** Update acceptance depends on meaningful integration evidence, and failures preserve or recover the working state with honest native-effect reporting.
**Depends on:** Phase 41.
**Requirements:** PROOF-01, PROOF-02, PROOF-03, PROOF-04
**Success Criteria:**
1. A previously unrecorded version can be checked through the actual required protocol/schema and relevant permitted read-only invocation, including alpha-AOS client/proxy boundaries; absence from a version list alone is not incompatibility.
2. Results separately identify installed, discovered, schema/protocol-checked and successfully invoked states. Missing credentials, permissions, service availability, host reload or unrun checks remain explicitly unverified/needs-action rather than ready.
3. A failed pre-apply check leaves the prior working installation active and shows the attempted target and reason; no hidden downgrade or false update success is reported.
4. A post-apply or interrupted native installation is recovered/reconciled through the adapter's declared mechanism, retaining previous artifacts where required and reporting actual active identity, unrecovered effects and the next bounded recovery action. Owned-file rollback alone is not claimed as full native rollback.

**Plans:** TBD after roadmap approval.

### Phase 43: Migration and Consistent Guidance

**Goal:** Existing installations and every consumer use the same selected local record, with consistent commands, documentation and component-specific outcomes.
**Depends on:** Phase 42.
**Requirements:** MIG-01, MIG-02, MIG-03, MIG-04
**Success Criteria:**
1. Existing stable-lock/Cua-pin installations can be adopted with prior identity/provenance retained and user-owned edits preserved; drift or ambiguous ownership produces an explicit resolution path rather than overwrite.
2. Installation, native config, diagnostics, project isolation and recovery agree on the local selected identity, and updated tools are not rejected by stale hidden bundled hashes/pins. Required output hashes are derived from verified sources and adapter revisions.
3. CLI/skills and English/Korean docs consistently describe install/explicit-update timing, tool updates versus alpha-AOS code updates, and patch-release/local developer deployment for compatibility fixes; scheduled promotion and background/nightly updates stay disabled.
4. End-to-end outcomes identify the affected component/platform/harness and shared dependency/configuration effects, showing retained/updated/failed/recovered/unverified states without claiming untested parity or completion of old v0.7.0 acceptance.

**Plans:** TBD after roadmap approval.

## Progress

**Execution order:** 39 -> 40 -> 41 -> 42 -> 43. Dependencies order implementation. Phase 39 is complete and verified.

| Phase | Plans complete | Status | Completed |
|---|---|---|---|
| 39. Tool Inventory and Local Release Records | 5/5 | Complete    | 2026-11-07 |
| 40. Local Official Release Updates | 0/2 | In Progress | - |
| 41. Minimal Compatibility Adapters | 0/TBD | Not started | - |
| 42. Integration Verification and Recovery | 0/TBD | Not started | - |
| 43. Migration and Consistent Guidance | 0/TBD | Not started | - |

## Coverage and Delivery Boundaries

16 approved requirements map to exactly one phase each; no unmapped or duplicated requirement. There are five phases and 20 observable success criteria. The owner approved this requirements traceability allocation on 2026-11-06.

The owner invoked GSD milestone planning only. Native Codex development remains the repository default; alpha-AOS must not orchestrate its own development. No full test suite/CI/push gate is reintroduced. Product integration acceptance needs real evidence, with unperformed host checks stated explicitly. Runtime approvals, root bounds, writer ownership, secret protections and rollback safeguards remain in force. No autopilot, tool update, deployment, publication or push is started by this roadmap.

*Approved: 2026-11-06 after owner review of all five phases and their success criteria.*
