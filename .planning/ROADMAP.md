# Roadmap: alpha-AOS v0.1.0

## Overview

This roadmap delivers the brownfield v0.1.0 milestone as a vertical MVP: first make every mutation and process boundary trustworthy, then compile deterministic repository evidence into reviewed plans, materialize optional capabilities in the correct scope, enforce mandatory GSD obligations, make directory-tree `off` persistent through ordinary harness entrypoints, complete the managed lifecycle, and finally freeze only the support claims and release bytes proven across platforms and active harnesses (Codex, Antigravity, Pi, and Hermes). Claude Code integration remains shipped compatibility residue outside active support claims, phase pass bars, and release gates. Existing code and its 38 passing tests are foundations, not completed roadmap phases.

## Phases

- [x] **Phase 1: Safe Operation Boundary** - Make every preview, mutation, validation, and subprocess boundary fail safely and expose no secrets. (completed 2026-09-07)
- [x] **Phase 2: Evidence-Bound Project Planning** - Turn bounded repository evidence into stable, explainable, apply-bound plans without cross-project leakage. (completed 2026-09-09)
- [x] **Phase 3: Transactional Project Packs and Native Optional Use** - Materialize exact project packs and prove optional global and project capabilities through native intent-driven use. (completed 2026-09-17)
- [x] **Phase 4: Mandatory GSD Gates** - Convert deterministic risk evidence into one fail-closed mandatory check at the protected GSD lifecycle point. (completed 2026-09-17)
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

**Plans**: 27/27 plans executed. Verification gap G-01-1 is CLOSED on CI run 34051628180 (head `25b5434`, `conclusion: success`) — one run id whose ubuntu-latest, macos-latest and windows-latest legs are all green on all four steps. Awaiting `/gsd-verify-work 01`.

Plans:

- [x] 01-27-PLAN.md

**Wave 1**

- [x] 01-01-PLAN.md — Wave 0 preview, redaction, and strict-validation contracts
- [x] 01-02-PLAN.md — Wave 0 path, writer/crash, and process contracts
- [x] 01-03-PLAN.md — Central redaction, path aliases, and immutable support-bundle planning
- [x] 01-04-PLAN.md — smol-toml legitimacy checkpoint
- [x] 01-05-PLAN.md — Strict multi-format validation engine
- [x] 01-07-PLAN.md — Canonical PathProof and immediate recheck

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-06-PLAN.md — Strict catalog, lock, and project-manifest loaders
- [x] 01-08-PLAN.md — Shell-free bounded process adapter and probe migration
- [x] 01-09-PLAN.md — MutationSession and durable transaction/repair state

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-10-PLAN.md — Strict operational/native schemas and consumers
- [x] 01-11-PLAN.md — Fixture and installer subprocess migration

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-12-PLAN.md — Session-aware GSD/ECC component mutators
- [x] 01-13-PLAN.md — Session-aware MCP/skill/policy/isolation/update mutators

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-14-PLAN.md — Ordered install caller and core bootstrap/update safe apply

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-15-PLAN.md — Session-bound support bundle and CLI/output closure

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-16-PLAN.md — Thin wrappers and three-OS behavioral gate

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-17-PLAN.md — Gap closure: bounded `openProtocolProcess` session and MCP fixture migration

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 01-18-PLAN.md — Gap closure: MCP SDK transport over the bounded protocol session

**Wave 10** *(blocked on Wave 9 completion — UAT gap G-01-1, root cause RC-1)*

- [x] 01-19-PLAN.md — Gap closure (RC-1): symmetric canonicalization of the allowed root

**Wave 11** *(blocked on Wave 10 completion — UAT gap G-01-1, root cause RC-2)*

- [x] 01-20-PLAN.md — Gap closure (RC-2): darwin platform environment floor

**Wave 12** *(blocked on Wave 11 completion — UAT gap G-01-1, root cause RC-3)*

- [x] 01-21-PLAN.md — Gap closure (RC-3): preview stops spawning npm, and the oracle stops depending on the runner

**Wave 13** *(blocked on Wave 12 completion — UAT gap G-01-1, root cause RC-4)*

- [x] 01-22-PLAN.md — Gap closure (RC-4): bounded, identity-bearing descendant termination oracle

**Wave 14** *(blocked on Wave 13 completion)*

- [x] 01-23-PLAN.md — Gap closure: the three-OS CI matrix observation that closes G-01-1

**Wave 15** *(blocked on Wave 14 completion — verification gap G-01-1, root cause RC-5)*

- [x] 01-24-PLAN.md — Gap closure (RC-5): the CI safety step reaches the suite through the scrubbing runner

**Wave 16** *(blocked on Wave 15 completion)*

- [x] 01-25-PLAN.md — Gap closure: EACCES `unprovable-filesystem` fixture and cross-platform probe answerability

**Wave 17** *(blocked on Wave 16 completion)*

- [x] 01-26-PLAN.md — Gap closure: the new three-OS run that closes G-01-1, and the ledger disposed on it

**Wave 18** *(blocked on Wave 17 completion — the ubuntu red cell 01-26 observed was undecidable)*

- [x] 01-27-PLAN.md — Gap closure: the descendant-termination oracle repair, and the three green legs that close G-01-1

> Waves 15–17 hold one plan each for the same reason waves 10–13 did: each edits a file `npm run build` compiles for the whole tree, so a half-written file is a shared resource the file-overlap rule cannot see. `01-26` additionally must observe the combined effect of both preceding plans inside a single matrix run.

> Waves 10–13 hold one plan each rather than running 01-19/01-20/01-21 together. They share no files, but each opens with a committed RED and `01-20`'s RED is a type error that breaks `npm run build` for the whole tree — a shared resource the file-overlap rule cannot see. Rationale in `01-19-PLAN.md` `## Wave placement`.

### Phase 2: Evidence-Bound Project Planning

**Goal**: Bounded repository evidence deterministically selects capability packs and produces stable, digest-bound plans without cross-project leakage or automatic deletion.
**Depends on**: Phase 1
**Requirements**: DETC-01, DETC-02, DETC-03, DETC-04, DETC-05, DETC-06
**Delivers**: Bounded project scan; fact extraction envelope; evaluate-all predicates; stable reviewed plan format; `project approve` with digest binding; `project status` with missing-evidence reporting; and refusal on input change.
**Success Criteria** (what must be TRUE):

  1. Canonical project root descent stops cleanly at repository and worktree boundaries.
  2. Positive, versioned file, dependency, configuration, and manifest evidence selects capability packs.
  3. Near-matches explain why they did not select a pack, and generic files alone cannot activate packs.
  4. Plans identify scope, owner, source version/hash, renderer, pre-state, adapter support, and safe inverse.
  5. Applying a reviewed plan is refused once any bound input, manifest, lock, or target moves.
  6. Stale evidence is reported naming the missing fact, and never deletes files automatically.

**Plans**: 16/16 plans executed. Verification complete (2026-09-09).

Plans:

**Wave 1**

- [x] 02-01-PLAN.md — Tracer: one repository selects one pack end-to-end through `alpha-aos project plan`

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Strict pack catalog, declared fact vocabulary, and load-time refusals
- [x] 02-03-PLAN.md — Ignore-list semantics and the `ignore@7.0.5` legitimacy gate
- [x] 02-04-PLAN.md — Pack-skill source pinning and the global-sync anti-regression net

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — Bounded, boundary-proven scan and sub-project discovery

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-06-PLAN.md — Six detector kinds, five manifest readers, and the complete evidence envelope

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-07-PLAN.md — Evaluate-all predicates, near-miss explanation, and manifest pack overrides

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 02-08-PLAN.md — The reviewable plan artifact: nine DETC-04 nouns and byte stability

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 02-09-PLAN.md — `project approve`, change refusal, and the inputs-vs-selection split

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 02-10-PLAN.md — `project status`, `STALE` naming the missing fact, and the approval-gated removal plan

> Waves 3 through 8 hold one plan each because each successive plan extends the same two modules —
> `src/core/evidence.ts` then `src/core/project-plan.ts` — and a shared file is an implicit dependency
> the wave rule already forbids from being parallel. Wave 2's three plans touch disjoint file sets:
> the catalog/schema surface, the ignore-list module and its dependency, and the lock-pinning surface.

**Gap closure** *(`02-VERIFICATION.md` status `gaps_found`, 2/5 truths verified; run with `/gsd-execute-phase 2 --gaps-only`)*

Gap-closure waves are numbered independently of the waves above, because a `--gaps-only` run schedules
only these six plans.

**Gap wave 1**

- [x] 02-11-PLAN.md — CR-01 canonical-root descent that terminates, and CR-02 an alias that cannot evict its target

**Gap wave 2** *(blocked on gap wave 1)*

- [x] 02-12-PLAN.md — bounded-input honesty at the leaves: ignore-list caps, the output byte budget, and three contradicted contracts

**Gap wave 3** *(blocked on gap wave 2)*

- [x] 02-13-PLAN.md — CR-03 scan completeness reaches the user in text, `--why` and `--json`, and the negative-reason invariant

**Gap wave 4** *(blocked on gap wave 3)*

- [x] 02-14-PLAN.md — CR-04 `.alpha-aos/plan.json` through the strict validator, plus the receipt-driven crash and claim defects

**Gap wave 5** *(blocked on gap wave 4)*

- [x] 02-15-PLAN.md — host-independent plan digest, honest safe inverse, paste-safe refusal command, and the approve-then-read round trip

**Gap wave 6** *(blocked on gap wave 5)*

- [x] 02-16-PLAN.md — root-keyed catalog and manifest-schema caches, and a home for the catalog/lock drift check

> The gap-closure plans run fully serially. 02-13 through 02-16 serialize for the same reason the original
> waves 3 through 8 did — each extends `src/core/project-plan.ts`, and a shared file is an implicit
> dependency. 02-11 and 02-12 have disjoint file sets and could in principle run in parallel, but both run
> `npm run build` and then `node --test dist/...` against the same `dist/` output tree, so a parallel run
> can have one plan's build overwrite `dist/` mid-test-run for the other; 02-12 therefore declares an
> ordering-only `depends_on: ["02-11"]`. 02-14 authors the closed `schemas/approved-plan.schema.json`
> against the plan shape 02-15 will produce (`hostNotes`, a nullable guard hash, an open approval code),
> and 02-15 asserts the approve-then-status round trip, so `project approve` can never emit an artifact its
> own reader rejects.

### Phase 3: Transactional Project Packs and Native Optional Use

**Goal**: Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Depends on**: Phase 2
**Requirements**: CAPA-01, CAPA-02, CAPA-03, CAPA-04, CAPA-05, CAPA-06, CAPA-07, CAPA-08
**Delivers**: Project-scoped native skill/MCP/policy synchronization with receipts and failure rollback; `project sync --apply`; exact-hash representative packs; project-local provenance; capability-negotiated harness adapters; native discovery and invocation canaries; and multidimensional capability state.
**Success Criteria** (what must be TRUE):

  1. On active claimed harness surfaces anchored by Codex, a version-sensitive documentation request can natively select the global documentation capability without naming it and complete a meaningful read-only Context7 call.
  2. A multi-source research request can natively route through Exa discovery and bounded Firecrawl extraction without naming either tool on an active non-Claude surface (anchored by Codex), while an ordinary lookup does not fan out across the research stack.
  3. User can explicitly hand work between two distinct active non-Claude harnesses through Unified Memory while `.planning/` and repository-governed decisions remain unchanged and authoritative only through GSD.
  4. User can preview and apply an evidence-matched, exact-hash pack inside one selected project, see project-local provenance in the target harness, and exercise it with a representative intent-matched task on an active non-Claude harness (anchored by Codex).
  5. The same capability is unavailable outside that project; status distinguishes selected, deployed, discovered, invoked, blocked, stale, unsupported, and unverified states across representative web, API/data, infrastructure, agent/AI, security, and scientific packs without global profile installation; every other active surface remains unverified or unsupported until its own evidence promotes it, and Claude Code absence is neither a blocker nor a release limitation for v0.1.0.

**Plans**: 22/22 plans executed (4 gap-closure plans planned under D-17: 03-19..03-22).
**Planning note**: Targeted research and live probes are required for version-sensitive native discovery, invocation evidence, MCP scope, and configuration-preserving seams across active non-Claude targets (Codex, Antigravity, Pi, Hermes). Claude Code integration remains compatibility residue.

Plans:

- [x] 03-16-PLAN.md
- [x] 03-17-PLAN.md
- [x] 03-18-PLAN.md — Fail closed on unchecked version-sensitive evidence and retain an auditable Codex capability proof

**Wave 1**

- [x] 03-01-PLAN.md — Tracer: one approved pack lands in the project — skill bytes and receipt in ONE transaction

**Wave 2** *(blocked on Wave 1)*

- [x] 03-02-PLAN.md — MCP proxy environment repair, the three-server startup regression, and the observe/filter split

**Wave 3** *(blocked on Wave 2)*

- [x] 03-03-PLAN.md — The capability ledger: closed schema, three axes, the D-04 demotion binding, and the paired evidence unit

**Wave 4** *(blocked on Wave 3)*

- [x] 03-04-PLAN.md — Three free discovery oracles, their parsers, and the constructed inside/outside negative

**Wave 5** *(blocked on Wave 4)*

- [x] 03-05-PLAN.md — The declared canary catalog, readiness probes, and the `blocked`-versus-`unverified` split

**Wave 6** *(blocked on Wave 5)*

- [x] 03-06-PLAN.md — The canary runtime (D-02) and the two doctor verbs: free discovery, opt-in invocation

**Wave 7** *(blocked on Wave 6)*

- [x] 03-07-PLAN.md — Decision: how the CAPA-02 routing contract is reconciled (blocking human gate)

**Wave 8** *(blocked on Wave 7)*

- [x] 03-08-PLAN.md — CAPA-01 and CAPA-02 invocation canaries, the ordered-sequence matcher, and the recorded proofs

**Wave 9** *(blocked on Wave 8)*

- [x] 03-09-PLAN.md — Capability-state promotion: the D-10 ceiling/resolver split, the D-11 axes, and the D-13 one-shot offer

**Wave 10** *(blocked on Wave 9)*

- [x] 03-10-PLAN.md — CAPA-08 six-domain synthetic fixtures, their near-miss twins, and the one-file pack guard

**Wave 11** *(blocked on Wave 10)*

- [x] 03-11-PLAN.md — Project-local provenance: the D-07 sidecar where tolerance is proven, and the paired CAPA-05/CAPA-06 unit

**Wave 12** *(blocked on Wave 11)*

- [x] 03-12-PLAN.md — CAPA-03: the Unified Memory handoff canary and the `.planning/` immutability half

**Wave 13** *(blocked on Wave 12; gap closure)*

- [x] 03-13-PLAN.md — A proof records the inference it rests on and the scope it was taken in

**Wave 14** *(blocked on Wave 13; gap closure)*

- [x] 03-14-PLAN.md — The JSON surface says what it means: the not-run reason and one home per evidence unit

**Wave 15** *(blocked on Wave 14; gap closure)*

- [x] 03-15-PLAN.md — A suite that cannot silently prove nothing: the CI upstream gate and one stated precondition

**Wave 16** *(blocked on Wave 15; gap closure)*

- [x] 03-19-PLAN.md — Stable ordering backstop: deterministic offline equal-strength proof fixture (G-03-4)

**Wave 17** *(blocked on Wave 16; gap closure)*

- [x] 03-20-PLAN.md — Active Codex CAPA-02 multi-source research routing and ordinary lookup control (G-03-1)

**Wave 18** *(blocked on Wave 17; gap closure)*

- [x] 03-21-PLAN.md — Active non-Claude cross-harness handoff pair with .planning immutability (G-03-2)

**Wave 19** *(blocked on Wave 18; gap closure)*

- [x] 03-22-PLAN.md — Active Codex representative project pack exercise with provenance and absence boundary (G-03-3)

> Every wave holds one plan. Phase 2 recorded the reason and it still holds: successive plans extend the
> same modules, and even file-disjoint plans run `npm run build` and then execute compiled tests against
> the same `dist/` tree, so a parallel run can have one plan's build overwrite `dist/` mid-test-run for
> the other. Waves 3 through 6 additionally form a strict construction chain — the ledger is what the
> oracles write to, the canary catalog is what the runtime runs, and the runtime is what the canaries
> need. Wave 7 is a single blocking-human decision plan because a checkpoint and implementation never
> share a plan.

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

**Plans**: 4/4 plans executed

Plans:

**Wave 1**

- [x] 04-01-PLAN.md — Core gate engine, cumulative phase diff inspection & risk fact matching (GATE-01, GATE-04)

**Wave 2** *(blocked on Wave 1)*

- [x] 04-02-PLAN.md — Single-engine obligation resolver, native-first dispatch & structured gate receipt schema (GATE-02)

**Wave 3** *(blocked on Wave 2)*

- [x] 04-03-PLAN.md — GSD capability overlay, lifecycle predicate gates & CLI surface (GATE-03)

**Wave 4** *(blocked on Wave 3)*

- [x] 04-04-PLAN.md — Worker authority enforcement & cryptographic .planning/ immutability witness (GATE-05)

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

**Plans**: 4/4 plans executed. Verification complete (2026-09-18).

Plans:

**Wave 1**

- [x] 05-01-PLAN.md — Policy Registry Schema, Canonical Path Resolution & Nearest Ancestor Inheritance Engine (OPTO-01)

**Wave 2** *(blocked on Wave 1)*

- [x] 05-02-PLAN.md — Transparent CLI Shims, Sub-Millisecond Dispatch, Preload Exclusion & Fail-Closed Guardrails (OPTO-02, OPTO-05, OPTO-08)

**Wave 3** *(blocked on Wave 2)*

- [x] 05-03-PLAN.md — First-Use Git Root Classification, TTY Flow, Headless CI Fallback & Tree CLI Suite (OPTO-03, OPTO-04)

**Wave 4** *(blocked on Wave 3)*

- [x] 05-04-PLAN.md — Local Resource Native Passthrough, Reviewed Environment Allowlist, 8-Dimension Surface Inspector & Sealed Guardrail (OPTO-06, OPTO-07, OPTO-08, OPTO-09)

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

**Plans**: 3/3 plans executed. Verification complete (2026-09-18).

Plans:

**Wave 1**

- [x] 06-01-PLAN.md — Fast offline status engine, reconciliation idempotency, and update preview (LIFE-01, LIFE-02, LIFE-08)

**Wave 2** *(blocked on Wave 1)*

- [x] 06-02-PLAN.md — External package recovery receipts and snapshot crash repair (LIFE-06, LIFE-07)

**Wave 3** *(blocked on Wave 2)*

- [x] 06-03-PLAN.md — All-or-nothing rollback engine and managed multi-format uninstall (LIFE-03, LIFE-04, LIFE-05)

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

- [x] 07-01-PLAN.md
- [x] 07-02-PLAN.md
- [ ] 07-03-PLAN.md
- [ ] 07-04-PLAN.md

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Safe Operation Boundary | 27/27 | Complete    | 2026-09-07 |
| 2. Evidence-Bound Project Planning | 16/16 | Complete    | 2026-09-09 |
| 3. Transactional Project Packs and Native Optional Use | 18/18 | Complete    | 2026-09-12 |
| 4. Mandatory GSD Gates | 4/4 | Complete    | 2026-09-17 |
| 5. Persistent Tree-Off Preload Isolation | 4/4 | Complete    | 2026-09-18 |
| 6. Managed Lifecycle, Uninstall, and Recovery | 3/3 | Complete    | 2026-09-18 |
| 7. Cross-Platform Release Proof | 2/4 | In Progress|  |

---
*Roadmap created: 2026-09-03 for the v0.1.0 vertical MVP milestone*
