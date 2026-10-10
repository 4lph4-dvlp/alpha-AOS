# alpha-AOS

## What This Is

alpha-AOS is a declarative, cross-platform control plane for building a consistent AI-agent working environment across Windows, macOS, and Linux. It configures active supported harnesses—Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent—so GSD provides the project workflow and state spine, selected ECC capabilities enrich the work, and MCP servers provide external tools without forcing every capability into every project. Claude Code is reinstated into active v0.1.0 harness scope per D-18, on equal footing with the other four harnesses, but — like every other harness — still requires its own real invocation-receipt evidence before promotion past `unverified` to advertised support, pass bars, or release gates.

The system manages capability scope as well as installation: broadly useful, low-risk capabilities can be available globally; evidence-matched capabilities can be supplied only to a project; mandatory checks can be attached to explicit quality gates; and selected directories can run without inheriting alpha-AOS at all.

## Core Value

A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.

## Current Milestone: v0.2.0 Universal Autonomous Work

**Goal:** A user explicitly enables autopilot for one task and approves its goal, acceptance criteria and authority; alpha-AOS then coordinates interchangeable agents and every applicable alpha-AOS capability through GSD-governed execution, independent review, correction and recovery until verified completion or an explicitly reported stop condition. Ordinary conversational GSD remains the default.

**Target features:**
- Versioned, digest-bound goal contracts with acceptance criteria, authority, role assignments and optional resource limits
- Per-task, default-off autopilot opt-in by direct request or approved in-agent offer, without changing ordinary GSD interaction
- Composable controller/executor/reviewer adapters for Claude Code, Codex, Antigravity, Pi and Hermes, with version-scoped native capability evidence
- Full inventory and automatic GSD-step use of global/project ECC skills, MCP tools, approved project packs, native tools and mandatory hooks, backed by actual invocation receipts
- Durable local execution, independent result review, GSD gap closure and recovery; GSD remains the only lifecycle/state authority
- Development and general tool workflows, including an opt-in CoursePilot materials-download connector with file-level completion evidence
- Unlimited cycles when explicitly selected, configurable time/usage/cost/cycle limits, no-progress strategy changes and honest blocked/unknown results
- Natural-language entry, CLI preview/status/resume/stop, native skill/MCP use and a cross-platform release evidence matrix

**Planning status:** Scope and nine-phase roadmap approved by the user on 2026-09-29. Requirements and design are ready for Phase 14 discussion; implementation has not started. Detailed design: `docs/design/autonomous-work/README.md`.

## Requirements

### Validated

- ✓ A TypeScript CLI inventories installed harnesses and produces deterministic, dry-run-first installation plans — existing
- ✓ Stable, integrity-locked GSD Core, ECC runtime/skills, MCP servers, and the Pi MCP bridge can be installed and diagnosed — existing
- ✓ GSD Core `standard` is installed for Claude Code, Codex, Antigravity, and Pi while Hermes remains a worker rather than a GSD state writer — existing
- ✓ Exactly three selected ECC capabilities (`unified-memory`, `documentation-lookup`, and `deep-research`) can be distributed to the five logical harness targets without installing an ECC profile — existing
- ✓ Context7, Exa, and a bounded four-tool Firecrawl surface can be rendered into native user-scope configuration for all five logical harness targets — existing
- ✓ alpha-AOS-owned configuration writes are root-bounded, snapshotted, journaled, hash-checked, and conservatively rollbackable — existing
- ✓ Candidate dependency updates are separated from the stable end-user lock and exercised through cross-platform CI fixtures — existing
- ✓ `project-only` policies can generate external harness runtimes that hide many user-scoped configuration roots, while `sealed` correctly fails closed when no OS/container adapter exists — existing
- ✓ Deterministic, boundary-bounded repository evidence selects capability packs and renders stable, digest-bound reviewed plans that explain both matches and near-misses, and refuse to apply once any bound input moves — Phase 2
- ✓ A previously installed pack whose evidence disappears reports `STALE` naming the missing evidence, and is never deleted automatically — Phase 2
- ✓ Native implicit invocation of globally installed ECC capabilities and MCP tools is proven through observation-front canaries on Codex (CAPA-01/02/05) and non-Claude handoff pairs (CAPA-03) — v0.1.0 (Phase 3)
- ✓ Transactional `project sync --apply` materializes approved packs with provenance receipts, native discovery, and journaled removal — v0.1.0 (Phase 3)
- ✓ Explicit GSD quality gates run mandatory security- and migration-sensitive checks deterministically — v0.1.0 (Phase 4)
- ✓ Directory-tree opt-out persists externally and ordinary harness entrypoints start from a clean baseline — v0.1.0 (Phase 5)
- ✓ Repository-owned skills (`alpha-aos-control`, formerly `alpha-aos-pack-advisor`) are distributed to all five active harnesses with unsupported parity reported explicitly — v0.1.0 (Phases 8-9)
- ✓ Filesystem boundaries, subprocess-output redaction, and bounded process/protocol transports are hardened — v0.1.0 (Phase 1)
- ✓ `main` CI is green on ubuntu, macOS and Windows in a single push run (35818198049, attempt 1), each red leg fixed at a diagnosed root cause (CI-01..03) — v0.1.1 Phase 10

### Active (keep-green)

- [ ] Keep `main` green on all three OS legs so the dependency-candidate guard remains a trustworthy promotion signal (implemented in v0.1.1 Phase 12)

### Active

- [ ] Deliver v0.2.0 Universal Autonomous Work according to the current REQUIREMENTS.md and ROADMAP.md; completion requires evidence, not an agent's success claim
- [ ] Resolve the named managed-lifecycle gaps in the archived Phase 6 verification report; v0.1.1 Phase 11 created formal evidence and did not declare every LIFE requirement verified
- [ ] Validate every active supported harness on at least one real host; Claude Code's own real-host invocation receipt is the outstanding item (G-07-2, REL-02)
- [ ] Publish the v0.1.0 release artifacts and documentation (v0.1.0 closed with a non-publishing release preview)
- [ ] Widen `PathProof.inode` beyond a JS double so a Windows file index above 2^53 cannot make two distinct inodes compare equal and hide a TOCTOU swap — emerged in Phase 2, currently owned by no phase
- [ ] Give Codex a first-class native-verification driver (debug session `codex-native-verification-gap`, acknowledged at v0.1.0 close)

### Out of Scope

- OS/container-backed `sealed` isolation — valuable but deferred until after v0.1.0; v0.1.0 must keep it fail-closed and must not misrepresent `project-only` as a security sandbox
- Full ECC profiles, broad language/framework rule packs, and duplicate workflow systems — they increase context and ownership conflicts instead of supporting the minimal GSD spine
- Requiring every ECC capability or MCP on every task — capability availability is global or project-scoped, but invocation remains intent-driven unless a quality gate makes it mandatory
- A complete 3 OS × every harness/surface live matrix — v0.1.0 uses three-OS CI fixtures, representative real hosts, and at least one live validation per active supported surface
- Installing or authenticating the harness applications themselves — alpha-AOS configures supported harnesses that already exist
- A hosted SaaS control plane, organization management, or centralized credential service — v0.1.0 remains a local workstation tool
- Common cross-harness telemetry infrastructure and additional harness families — defer until the core installation, routing, isolation, and removal contracts are frozen

## Context

The project began from `docs/alpha-vibe-stack-codex.md`, which defined GSD Core `standard` as the sole workflow/state owner, selected three ECC capabilities instead of an ECC profile, and assigned Context7, Exa, and Firecrawl distinct research roles. The initial implementation has already installed and live-tested much of the global stack on a Windows workstation and has a 38-test cross-platform CI baseline.

Current behavior demonstrates the desired native path on Codex: alpha-AOS installs `documentation-lookup` in the user skill root and registers Context7 in Codex configuration; Codex can then implicitly select the skill from its description and follow it into an MCP call without a user explicitly naming either one. This is the preferred path for low-risk global capabilities. alpha-AOS should not proxy every capability invocation.

v0.1.0 (closed 2026-09-23, 9 phases, 88 plans) delivered the policy and scope layer: transactional project sync, mandatory GSD gates, persistent tree-off isolation, managed lifecycle commands, a cross-platform release proof, and the `alpha-aos-control` natural-language controller across all five harnesses. It closed as an override with lifecycle and real-host receipt gaps. v0.1.1 restored three-OS CI, produced the Phase 6 verification report with named remaining gaps, enabled a red-main guard and promoted verified dependencies to the stable lock. Claude Code's own real-host invocation receipt remains outstanding (G-07-2). For opt-out repositories, alpha-AOS must configure a persistent tree policy and use either native project suppression or a transparent pre-launch guard so the user can later invoke the ordinary active supported harness entrypoint. Detection after an agent has already loaded global context cannot count as isolation; that path must record the decision and restart cleanly.

The authority boundaries are:

- GSD owns discuss, plan, execute, verify, ship, and `.planning/` state; only one active GSD controller writes project state
- Native harness skill selection handles optional low-risk capabilities when task intent matches
- alpha-AOS owns installation scope, deterministic project evidence, allowlists, mandatory-gate policy, removal, diagnostics, and isolation
- ECC skills provide selected specialist procedures without taking over the GSD lifecycle
- MCP servers provide external tools; connection and discovery do not count as success without a real read-only call
- Unified Memory is unreviewed handoff context and does not replace GSD state or repository-governed decisions

## Constraints

- **Compatibility**: Windows 11, current macOS, and current Linux distributions — v0.1.0 must keep scripts, path handling, and native configuration adapters portable
- **Runtime**: Node.js `>=24.0.0`, npm `>=10.0.0`, and Git — required by the locked toolchain and GSD version
- **Harness scope**: Active v0.1.0 development targets are Claude Code, Codex, Antigravity GUI/CLI/IDE, Pi Agent, and Hermes Agent. Claude Code is reinstated per D-18 on equal footing with the other four harnesses and still requires its own real invocation-receipt evidence before promotion, exactly like every other harness. Capabilities may use different native adapters, and unsupported parity must be reported rather than simulated
- **Workflow ownership**: GSD Core `standard` is the only project lifecycle/state spine — ECC and native features must not duplicate or overwrite its state transitions
- **Determinism**: Installation, project-pack selection, policy checks, and mandatory gates cannot depend only on LLM judgment — evidence, versions, hashes, and decisions must be inspectable
- **Safety**: Mutations are previewable, root-bounded, snapshotted, and rollback-aware — stale evidence never triggers automatic deletion
- **Secrets**: Credential values cannot enter manifests, locks, plans, journals, diagnostics, command arguments, or repository files — project-only launch environments must default to a reviewed allowlist
- **Supply chain**: End users receive only the verified stable lock — candidate dependencies reach it solely through the automated weekly promotion gates (registry integrity, full 3-OS CI, real component fixtures, and a registry re-check after a two-day cooldown), and mutable external automation is not trusted without them
- **Validation**: Native discovery plus a meaningful read-only invocation is required — configuration-file presence alone is insufficient

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use GSD Core `standard` as the sole workflow and project-state spine | It provides the strongest structured cross-harness phase boundaries without the broad overlap of the full profile | ✓ Good |
| Use a hybrid capability activation model | Native implicit invocation is sufficient for optional low-risk global skills; deterministic project detection and explicit quality gates cover scope-sensitive or mandatory behavior | — Pending |
| Keep alpha-AOS as a control plane, not an invocation proxy for every tool call | Harness-native selection preserves natural agent behavior while alpha-AOS concentrates on reproducibility, policy, and isolation | — Pending |
| Install only three global ECC capabilities and no ECC profile | This supplies memory, current documentation, and deep research without importing a competing workflow system | ✓ Good |
| Keep Hermes worker-only for GSD state | A single state writer avoids conflicting `.planning/` transitions while retaining Hermes as a capable worker and handoff consumer | ✓ Good |
| Replace harness-name controller eligibility with verified role capability in v0.2.0 | User requested arbitrary role combinations across all five harnesses; one controller lease per project remains mandatory | Planned revision of D-10; current worker-only implementation remains until its migration passes |
| Add an opt-in task execution supervisor without replacing GSD state | Supervisor owns process attempts, resources and recovery; GSD owns plans, phases, verification and lifecycle | v0.2.0 design |
| Keep ordinary GSD interaction as the default; bind autopilot to one approved task | The user explicitly requested that autonomous looping start only by direct request or approval of an in-agent offer | v0.2.0 design |
| Route every applicable alpha-AOS capability through GSD with actual invocation proof | Installed global/project ECC skills, MCP tools and packs are only useful if the matching task step can discover and call them | v0.2.0 design |
| Use stable exact versions and source/file integrity locks | Cross-harness user configuration is supply-chain-sensitive and must be reproducible | ✓ Good |
| Treat `project-only` as configuration isolation, not a security boundary | Process-level isolation cannot honestly guarantee filesystem, network, or host-secret containment | ✓ Good |
| Configure opt-out once and enforce it before normal harness startup | Directory-specific global exclusion cannot be applied reliably after skills, instructions, and MCP schemas have entered a running agent context | — Pending |
| Scope drift-naming to callers that hold the reviewed plan value, rather than letting the preview persist one | Naming which noun moved is a diagnostic property; a non-persisting preview is a stated safety property (SAFE-01). Both drift branches already refuse with a runnable next step, so the safety property was kept and the must-have narrowed | ✓ Good |
| Scope the path-literal test guard to host path semantics (literal reaching join/resolve/normalize/relative/dirname/basename or path.<fn>, directly or via const), not every absolute literal | A literal reading would flag ~50 legitimate opaque path strings; product-function shapes are caught by the POSIX CI legs. let/alias/namespace coverage deferred (10-UAT.md) | ✓ Good |
| Defer true `sealed` isolation until after v0.1.0 | A real OS/container adapter is substantial and must not delay proving the core workflow and scoping model | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-29 for v0.2.0 scope approval*
