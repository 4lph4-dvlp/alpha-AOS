# Roadmap: alpha-AOS v0.1.0

## Overview

This roadmap delivers the brownfield v0.1.0 milestone as a vertical MVP: first make every mutation and process boundary trustworthy, then compile deterministic repository evidence into reviewed plans, materialize optional capabilities in the correct scope, enforce mandatory GSD obligations, make directory-tree `off` persistent through ordinary harness entrypoints, complete the managed lifecycle, and finally freeze only the support claims and release bytes proven across platforms and real harnesses. Existing code and its 38 passing tests are foundations, not completed roadmap phases.

## Phases

- [ ] **Phase 1: Safe Operation Boundary** - Make every preview, mutation, validation, and subprocess boundary fail safely and expose no secrets.
- [ ] **Phase 2: Evidence-Bound Project Planning** - Turn bounded repository evidence into stable, explainable, apply-bound plans without cross-project leakage.
- [ ] **Phase 3: Transactional Project Packs and Native Optional Use** - Materialize exact project packs and prove optional global and project capabilities through native intent-driven use.
- [ ] **Phase 4: Mandatory GSD Gates** - Convert deterministic risk evidence into one fail-closed mandatory check at the protected GSD lifecycle point.
- [ ] **Phase 5: Persistent Tree-Off Preload Isolation** - Persist inherited directory opt-out and enforce it before global context loads through ordinary harness entrypoints.
- [ ] **Phase 6: Managed Lifecycle, Uninstall, and Recovery** - Make the complete managed stack inspectable, idempotent, removable, rollbackable, and repairable.
- [ ] **Phase 7: Cross-Platform Release Proof** - Qualify one allowlisted v0.1.0 artifact with three-OS fixtures, real-host canaries, and a complete brownfield GSD cycle.

## Phase Details

### Phase 1: Safe Operation Boundary
**Goal**: Users can trust alpha-AOS to preview changes, reject unsafe or ambiguous operations, preserve recoverable state, and keep secrets out of every observable surface.
**Depends on**: Nothing (first phase)
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05, SAFE-06
**Delivers**: Strict input schemas and domain validation; realpath/reparse-aware root containment; serialized content-addressed transactions with durable journals; centralized redaction; and a shell-free, bounded, timeout-aware process adapter built from an explicit environment allowlist.
**Success Criteria** (what must be TRUE):
  1. User can preview every mutating command and confirm that source checkouts, packages, native configuration, managed state, and harness resources remain byte-for-byte unchanged.
  2. User sees a refusal when a write or removal could escape an allowed root through a symlink, junction, reparse point, alias, or parent-path change, and an outside sentinel remains untouched.
  3. Concurrent or interrupted managed writes serialize safely and leave hash-checked journal evidence from which alpha-AOS reports the real operation state instead of silently losing data.
  4. Human and JSON output, plans, journals, snapshots, subprocess failures, and CI evidence redact credential values and secret-bearing URLs; launched commands use no shell, bounded capture, timeouts, and only operation-approved environment names.
  5. Malformed, ambiguous, unsupported, or schema-invalid catalogs, locks, manifests, evidence, receipts, journals, and native configuration are rejected before mutation.
**Plans**: 16 plans

Plans:
- [x] 01-01-PLAN.md — Wave 0 preview, redaction, and strict-validation contracts
- [x] 01-02-PLAN.md — Wave 0 path, writer/crash, and process contracts
- [x] 01-03-PLAN.md — Central redaction, path aliases, and immutable support-bundle planning
- [x] 01-04-PLAN.md — smol-toml legitimacy checkpoint
- [x] 01-05-PLAN.md — Strict multi-format validation engine
- [x] 01-06-PLAN.md — Strict catalog, lock, and project-manifest loaders
- [x] 01-07-PLAN.md — Canonical PathProof and immediate recheck
- [x] 01-08-PLAN.md — Shell-free bounded process adapter and probe migration
- [x] 01-09-PLAN.md — MutationSession and durable transaction/repair state
- [ ] 01-10-PLAN.md — Strict operational/native schemas and consumers
- [ ] 01-11-PLAN.md — Fixture and installer subprocess migration
- [ ] 01-12-PLAN.md — Session-aware GSD/ECC component mutators
- [ ] 01-13-PLAN.md — Session-aware MCP/skill/policy/isolation/update mutators
- [ ] 01-14-PLAN.md — Ordered install caller and core bootstrap/update safe apply
- [ ] 01-15-PLAN.md — Session-bound support bundle and CLI/output closure
- [ ] 01-16-PLAN.md — Thin wrappers and three-OS behavioral gate

### Phase 2: Evidence-Bound Project Planning
**Goal**: Users receive reproducible project-pack decisions and reviewed plans that are bound to one canonical repository state and explain both matches and non-matches.
**Depends on**: Phase 1
**Requirements**: DETC-01, DETC-02, DETC-03, DETC-04, DETC-05, DETC-06
**Delivers**: Canonical-root and nested-VCS boundary detection; versioned positive and negative evidence; typed pack predicates; stable text/JSON desired-state plans; full input and target digests; support-state reporting; and non-destructive stale classification.
**Success Criteria** (what must be TRUE):
  1. User can select a canonical project root and observe that detection stops at nested repository and worktree boundaries without borrowing evidence from parents, siblings, aliases, or unrelated repositories.
  2. User can inspect the exact versioned files, dependencies, entrypoints, configuration, and manifest facts that selected each pack, plus reasons near-matches failed; a generic `AGENTS.md` alone never selects an agent-runtime pack.
  3. Repeated detection of unchanged inputs produces stable text and JSON plans that expose scope, owner, exact source version and hash, renderer, target pre-state, adapter support, approvals, and safe inverse.
  4. Applying a reviewed plan is refused if evidence, manifest, stable lock, renderer, executable, adapter capability, or target bytes changed after review.
  5. When evidence for an installed pack disappears, the user sees `STALE` with the missing evidence identified and no automatic deletion.
**Plans**: TBD

### Phase 3: Transactional Project Packs and Native Optional Use
**Goal**: Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Depends on**: Phase 2
**Requirements**: CAPA-01, CAPA-02, CAPA-03, CAPA-04, CAPA-05, CAPA-06, CAPA-07, CAPA-08
**Delivers**: Project-scoped native skill/MCP/policy synchronization with receipts and failure rollback; `project sync --apply`; exact-hash representative packs; project-local provenance; capability-negotiated harness adapters; native discovery and invocation canaries; and multidimensional capability state.
**Success Criteria** (what must be TRUE):
  1. On every claimed harness surface, a version-sensitive documentation request can natively select the global documentation capability without naming it and complete a meaningful read-only Context7 call.
  2. A multi-source research request can natively route through Exa discovery and bounded Firecrawl extraction without naming either tool, while an ordinary lookup does not fan out across the research stack.
  3. User can explicitly hand work between supported harnesses through Unified Memory while `.planning/` and repository-governed decisions remain unchanged and authoritative only through GSD.
  4. User can preview and apply an evidence-matched, exact-hash pack inside one selected project, see project-local provenance in the target harness, and exercise it with a representative intent-matched task.
  5. The same capability is unavailable outside that project; status distinguishes selected, deployed, discovered, invoked, blocked, stale, unsupported, and unverified states across representative web, API/data, infrastructure, agent/AI, security, and scientific packs without global profile installation.
**Plans**: TBD
**Planning note**: Targeted research and live probes are required for version-sensitive native discovery, invocation evidence, MCP scope, and configuration-preserving seams across Antigravity surfaces, Pi, and Hermes.

### Phase 4: Mandatory GSD Gates
**Goal**: Users cannot accidentally bypass a required security, migration, or release check, while low-risk work remains free of irrelevant gates and GSD retains sole lifecycle authority.
**Depends on**: Phase 3
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, GATE-05
**Delivers**: Exact-version GSD capability bundles; deterministic risk predicates; one-engine obligation resolution; revision-bound structured gate evidence; protected lifecycle blocking; worker/controller authority enforcement; and clean capability uninstall seams.
**Success Criteria** (what must be TRUE):
  1. Authentication-boundary, database-migration, and release-sensitive changes deterministically select their matching mandatory GSD obligation from inspectable project evidence.
  2. Each obligation runs through exactly one supported native or ECC check engine, with duplicate engines and overlapping reviews suppressed visibly.
  3. User cannot advance the protected lifecycle point when current-revision evidence is missing, failed, unsupported, unverified, or stale, and receives the precise blocking reason.
  4. Unrelated low-risk work completes without an unnecessary mandatory security, migration, or release gate.
  5. Supported harnesses can participate as workers while exactly one active GSD controller performs `.planning/` transitions and Hermes cannot become a GSD state writer.
**Plans**: TBD
**Planning note**: Validate capability injection, `agent_skills`, structured result, blocking, consent, and uninstall contracts against the exact locked GSD Core version before implementation is fixed.

### Phase 5: Persistent Tree-Off Preload Isolation
**Goal**: After one directory policy decision, users can start supported harnesses normally inside that tree with global customization excluded before load and repository-local user-owned resources still available.
**Depends on**: Phase 4
**Requirements**: OPTO-01, OPTO-02, OPTO-03, OPTO-04, OPTO-05, OPTO-06, OPTO-07, OPTO-08, OPTO-09
**Delivers**: External tree-policy registry with descendant inheritance and nested overrides; native suppression or transparent pre-launch integration for ordinary CLI/application entrypoints; first-use classification; clean late-detection restart; isolated configuration roots; local-resource passthrough; reviewed environment allowlists; resolved-surface inspection; and fail-closed support negotiation.
**Success Criteria** (what must be TRUE):
  1. User can preview and persist `off` once for a directory tree, see it inherited by descendants, and create an explicit nested override without alpha-AOS silently modifying or committing repository files.
  2. Later ordinary supported harness commands and application entrypoints enforce the effective policy without any per-session `alpha-aos project run` command and before global skills, instructions, hooks, or MCP schemas load; an unclassified repository prompts once, and late discovery records the choice then restarts cleanly.
  3. An `off` launch excludes alpha-AOS-managed and other user-global skills, MCP servers, hooks, memory, workflow guidance, tools, and settings while allowing user-owned repository-local skills, MCP, instructions, hooks, tools, and harness settings; with none present, the harness is vanilla.
  4. User can inspect the resolved configuration roots, skills, MCP, hooks, instructions, memory, environment-name allowlist, policy inheritance, and pre-launch enforcement, and global exclusion fails closed or reports unsupported when it cannot be proven for that harness, surface, version, and OS.
  5. User is told that `off` provides configuration isolation rather than filesystem or network sandboxing, unrelated ambient secret sentinels are absent, and an unsupported `sealed` request fails without fallback.
**Plans**: TBD
**Planning note**: This phase requires per-surface live research, especially for Antigravity GUI/IDE interception, Codex project-resource behavior, Hermes profile/environment behavior, and authentication reuse without customization import.

### Phase 6: Managed Lifecycle, Uninstall, and Recovery
**Goal**: Users can understand and safely reconcile, diagnose, remove, roll back, update, or repair everything alpha-AOS owns without disturbing harness applications, authentication, or unrelated user resources.
**Depends on**: Phase 5
**Requirements**: LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06, LIFE-07, LIFE-08
**Delivers**: Receipt-aware offline status and explicit doctor/canary modes; idempotent stable-lock reconciliation; project-pack, runtime, target, and full-stack removal; all-or-nothing rollback preflight; corrupt/incomplete journal recovery; external-package recovery receipts; and truly non-mutating update wrappers.
**Success Criteria** (what must be TRUE):
  1. User can install or reconcile the reviewed stable lock repeatedly and see `CURRENT` on an unchanged second plan; update preview changes nothing and update apply accepts only a reviewed stable-lock promotion.
  2. User can run fast offline `status` or opt into `doctor`/canary execution and receive coded, actionable findings that distinguish deployment, discovery, invocation, policy, support, drift, and repair state.
  3. User can preview and remove a project pack, clean an isolated runtime, uninstall one target, or uninstall the full managed stack; only receipted bytes or semantic entries matching their applied state are removed, while drifted resources cause refusal and harness applications, authentication, and unrelated resources remain.
  4. User can preview and apply restoration of exact prior bytes only after every rollback target passes a no-drift preflight; corrupt or interrupted journals remain visible as `needs-repair` with restart-safe guidance instead of false success.
  5. When GSD, ECC, npm-link, Pi bridge, or another external package change cannot be safely reversed, the user sees its verified state and component-specific recovery instructions rather than a false rollback claim.
**Plans**: TBD
**Planning note**: Define adoption, upgrade, downgrade, unknown-pre-state, and compensation rules separately for each external installer during phase research.

### Phase 7: Cross-Platform Release Proof
**Goal**: Users receive one v0.1.0 package whose behavior, contents, provenance, support claims, and complete brownfield workflow are proven against the same frozen bytes.
**Depends on**: Phase 6
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06
**Delivers**: Identical-tarball three-OS fixtures; versioned real-host surface ledger; paired positive/negative acceptance artifacts; a full brownfield GSD cycle; immutable CI dependencies; package-content allowlist; candidate/local-state exclusion; frozen stable lock; tarball hash and provenance; release notes; registry publication; and fresh-install smoke proof.
**Success Criteria** (what must be TRUE):
  1. The same packed release bytes install, reconcile, diagnose, and uninstall successfully in Windows, macOS, and Linux fixture environments without touching real shared roots.
  2. A versioned support matrix shows current real-host native discovery and representative invocation evidence for every claimed harness and surface, while every unproven combination is visibly limited or unsupported.
  3. Paired positive and negative controls prove optional native invocation, project-pack scope, mandatory-gate blocking, and tree-off exclusion instead of inferring success from installed files.
  4. A real brownfield project completes discuss → plan → execute → verify → ship with one GSD writer while exercising one global optional capability, one project pack, one mandatory gate, one cross-harness handoff, and safe cleanup.
  5. The published v0.1.0 tarball excludes `catalog/candidate.lock.json` and local state, contains only allowlisted files, is byte-identical to the three-OS tested artifact, and exposes verifiable provenance, a frozen stable lock, release notes, limitations, and a fresh public-registry install smoke test.
**Plans**: TBD

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Safe Operation Boundary | 9/16 | In progress | - |
| 2. Evidence-Bound Project Planning | 0/TBD | Not started | - |
| 3. Transactional Project Packs and Native Optional Use | 0/TBD | Not started | - |
| 4. Mandatory GSD Gates | 0/TBD | Not started | - |
| 5. Persistent Tree-Off Preload Isolation | 0/TBD | Not started | - |
| 6. Managed Lifecycle, Uninstall, and Recovery | 0/TBD | Not started | - |
| 7. Cross-Platform Release Proof | 0/TBD | Not started | - |

---
*Roadmap created: 2026-09-03 for the v0.1.0 vertical MVP milestone*
