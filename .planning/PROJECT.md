# alpha-AOS

## What This Is

alpha-AOS is a declarative, cross-platform control plane for building a consistent AI-agent working environment across Windows, macOS, and Linux. It configures supported harnesses such as Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent so GSD provides the project workflow and state spine, selected ECC capabilities enrich the work, and MCP servers provide external tools without forcing every capability into every project.

The system manages capability scope as well as installation: broadly useful, low-risk capabilities can be available globally; evidence-matched capabilities can be supplied only to a project; mandatory checks can be attached to explicit quality gates; and selected directories can run without inheriting alpha-AOS at all.

## Core Value

A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.

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

### Active

- [ ] Preserve native implicit invocation for globally installed, low-risk ECC capabilities and MCP tools, and verify that each supported harness uses them naturally when task intent matches
- [ ] Add deterministic project evidence detection and transactional project sync so matched ECC capability packs are installed only in the intended project scope, discovered natively, used during relevant work, and removable without disturbing user files
- [ ] Add explicit GSD quality-gate integration for capabilities that must run rather than relying on probabilistic model selection, including security- and migration-sensitive checks
- [ ] Make directory-level alpha-AOS opt-out verifiable: a launched harness must not inherit alpha-AOS-managed skills, MCP servers, hooks, or workflow guidance, and unrelated environment secrets must not leak into `project-only` runs
- [ ] Provide safe, comprehensible install, update, remove/uninstall, rollback, status, and doctor flows for the complete managed stack
- [ ] Expand the repository-owned workflow surface beyond its current Claude-only implementation wherever native invocation semantics are proven, while reporting unsupported targets explicitly
- [ ] Harden filesystem boundaries, subprocess-output redaction, native configuration merging, and external-package recovery before public release
- [ ] Validate Windows, macOS, and Linux through CI fixtures plus representative real-host canaries, and validate every supported harness/surface on at least one real host
- [ ] Complete a real brownfield GSD cycle with capability-routing traces, freeze the verified lock, and publish the v0.1.0 release artifacts and documentation

### Out of Scope

- OS/container-backed `sealed` isolation — valuable but deferred until after v0.1.0; v0.1.0 must keep it fail-closed and must not misrepresent `project-only` as a security sandbox
- Full ECC profiles, broad language/framework rule packs, and duplicate workflow systems — they increase context and ownership conflicts instead of supporting the minimal GSD spine
- Requiring every ECC capability or MCP on every task — capability availability is global or project-scoped, but invocation remains intent-driven unless a quality gate makes it mandatory
- A complete 3 OS × every harness/surface live matrix — v0.1.0 uses three-OS CI fixtures, representative real hosts, and at least one live validation per supported surface
- Installing or authenticating the harness applications themselves — alpha-AOS configures supported harnesses that already exist
- A hosted SaaS control plane, organization management, or centralized credential service — v0.1.0 remains a local workstation tool
- Common cross-harness telemetry infrastructure and additional harness families — defer until the core installation, routing, isolation, and removal contracts are frozen

## Context

The project began from `docs/alpha-vibe-stack-codex.md`, which defined GSD Core `standard` as the sole workflow/state owner, selected three ECC capabilities instead of an ECC profile, and assigned Context7, Exa, and Firecrawl distinct research roles. The initial implementation has already installed and live-tested much of the global stack on a Windows workstation and has a 38-test cross-platform CI baseline.

Current behavior demonstrates the desired native path on Codex: alpha-AOS installs `documentation-lookup` in the user skill root and registers Context7 in Codex configuration; Codex can then implicitly select the skill from its description and follow it into an MCP call without a user explicitly naming either one. This is the preferred path for low-risk global capabilities. alpha-AOS should not proxy every capability invocation.

The missing product layer is policy and scope completion. Transactional `project sync --apply` is still a stub, repository-owned skill distribution is Claude-only, uninstall is incomplete, project-only processes inherit too much of the ambient environment, and several filesystem/configuration edge cases require hardening. The v0.1.0 milestone closes these gaps and proves the behavior through user-flow tests rather than treating file presence as success.

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
- **Harness scope**: Claude Code, Codex, Antigravity GUI/CLI/IDE, Pi Agent, and Hermes Agent — capabilities may use different native adapters, and unsupported parity must be reported rather than simulated
- **Workflow ownership**: GSD Core `standard` is the only project lifecycle/state spine — ECC and native features must not duplicate or overwrite its state transitions
- **Determinism**: Installation, project-pack selection, policy checks, and mandatory gates cannot depend only on LLM judgment — evidence, versions, hashes, and decisions must be inspectable
- **Safety**: Mutations are previewable, root-bounded, snapshotted, and rollback-aware — stale evidence never triggers automatic deletion
- **Secrets**: Credential values cannot enter manifests, locks, plans, journals, diagnostics, command arguments, or repository files — project-only launch environments must default to a reviewed allowlist
- **Supply chain**: End users receive only the reviewed stable lock — candidate dependencies and mutable external automation are not trusted without fixture and review gates
- **Validation**: Native discovery plus a meaningful read-only invocation is required — configuration-file presence alone is insufficient

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use GSD Core `standard` as the sole workflow and project-state spine | It provides the strongest structured cross-harness phase boundaries without the broad overlap of the full profile | ✓ Good |
| Use a hybrid capability activation model | Native implicit invocation is sufficient for optional low-risk global skills; deterministic project detection and explicit quality gates cover scope-sensitive or mandatory behavior | — Pending |
| Keep alpha-AOS as a control plane, not an invocation proxy for every tool call | Harness-native selection preserves natural agent behavior while alpha-AOS concentrates on reproducibility, policy, and isolation | — Pending |
| Install only three global ECC capabilities and no ECC profile | This supplies memory, current documentation, and deep research without importing a competing workflow system | ✓ Good |
| Keep Hermes worker-only for GSD state | A single state writer avoids conflicting `.planning/` transitions while retaining Hermes as a capable worker and handoff consumer | ✓ Good |
| Use stable exact versions and source/file integrity locks | Cross-harness user configuration is supply-chain-sensitive and must be reproducible | ✓ Good |
| Treat `project-only` as configuration isolation, not a security boundary | Process-level isolation cannot honestly guarantee filesystem, network, or host-secret containment | ✓ Good |
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
*Last updated: 2026-09-03 after initialization*
