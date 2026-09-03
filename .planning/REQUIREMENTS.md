# Requirements: alpha-AOS

**Defined:** 2026-09-03
**Core Value:** A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.

## User Stories

- As an individual developer, I can preview and reproduce the same managed AI-agent environment across supported operating systems and harnesses.
- As a polyglot project owner, I can receive only the project capabilities supported by positive repository evidence without asking an LLM to install tools for me.
- As a GSD user, I can let optional low-risk capabilities activate naturally while knowing that mandatory security, migration, and release checks cannot be skipped accidentally.
- As a developer working in a sensitive or unrelated directory tree, I can launch from a clean harness baseline with global customizations absent and optionally add only the local skills, MCP servers, instructions, and harness settings I choose inside that tree.
- As an operator, I can understand, remove, roll back, and repair everything alpha-AOS owns without losing unrelated user configuration or exposing credentials.

## v1 Requirements

### Safety Foundation

- [ ] **SAFE-01**: User can preview any mutating alpha-AOS operation without changing source checkouts, global packages, configuration files, managed state, or harness resources
- [ ] **SAFE-02**: User is protected from writes or removals that escape an allowed root through symlinks, junctions, reparse points, aliases, or changed parent paths
- [ ] **SAFE-03**: User receives serialized, hash-checked, journaled, and crash-diagnosable managed writes so concurrent or interrupted operations cannot silently lose data
- [ ] **SAFE-04**: User can inspect human output, JSON output, plans, journals, snapshots, subprocess failures, and CI evidence without credential values or secret-bearing URLs being exposed
- [ ] **SAFE-05**: User receives a clear refusal when catalogs, locks, manifests, evidence, receipts, or native configuration inputs are malformed, ambiguous, unsupported, or fail strict schema validation
- [ ] **SAFE-06**: User-launched external commands run without a shell, with bounded output and timeout behavior, and with only the environment variables allowed for that operation

### Deterministic Project Detection and Planning

- [ ] **DETC-01**: User can select one canonical project root, and detection stops at nested repository or worktree boundaries instead of borrowing evidence from parents, siblings, or unrelated repositories
- [ ] **DETC-02**: User can see the positive, versioned file, dependency, entrypoint, configuration, and manifest evidence that caused each project capability pack to be selected
- [ ] **DETC-03**: User can see why a near-match did not select a pack, and generic files such as `AGENTS.md` alone cannot activate agent-runtime capabilities
- [ ] **DETC-04**: User receives stable text and JSON plans that identify scope, owner, exact source version and hash, renderer, target pre-state, adapter support, approvals, and safe inverse
- [ ] **DETC-05**: User cannot apply a reviewed plan after its evidence, manifest, stable lock, renderer, executable, adapter capability, or target bytes have changed
- [ ] **DETC-06**: User sees a previously installed project pack marked `STALE` when its evidence disappears, with no automatic deletion

### Optional Capabilities and Project Packs

- [ ] **CAPA-01**: User can ask a version-sensitive documentation question without naming a skill or MCP and have each claimed harness surface natively select the global documentation capability and make a meaningful read-only Context7 call
- [ ] **CAPA-02**: User can request multi-source research without naming a skill or MCP and have native deep-research routing use Exa for source discovery and Firecrawl only for bounded extraction, while ordinary lookups do not fan out across every research tool
- [ ] **CAPA-03**: User can perform an explicit cross-harness handoff through Unified Memory without Memory Vault content modifying `.planning/` or becoming authoritative project policy
- [ ] **CAPA-04**: User can preview and apply an evidence-matched, exact-hash project capability pack only inside the selected project scope
- [ ] **CAPA-05**: User can see a synced project capability in the target harness with project-local provenance and can exercise it through a representative intent-matched task
- [ ] **CAPA-06**: User running the same task outside the project cannot discover or invoke that project-only capability
- [ ] **CAPA-07**: User can distinguish a capability that is selected, deployed, natively discovered, actually invoked, blocked, stale, unsupported, or unverified instead of seeing a single misleading installed state
- [ ] **CAPA-08**: User can use representative evidence-based packs for web, API/data, infrastructure, agent/AI, security, and scientific projects without installing broad language/framework profiles globally

### Mandatory GSD Gates

- [ ] **GATE-01**: User changing an authentication boundary, database migration, or release-sensitive surface receives the matching mandatory GSD gate from deterministic risk evidence
- [ ] **GATE-02**: User receives exactly one selected native or ECC check engine for each mandatory obligation, without duplicate reviews of the same concern
- [ ] **GATE-03**: User cannot advance the protected GSD lifecycle point when mandatory evidence is missing, failed, unsupported, unverified, or stale for the current project revision
- [ ] **GATE-04**: User performing unrelated low-risk work does not receive an unnecessary mandatory security, migration, or release gate
- [ ] **GATE-05**: User can employ supported harnesses as workers while exactly one active GSD controller owns `.planning/` transitions and Hermes remains unable to become a GSD state writer

### Directory Opt-Out and Configuration Isolation

- [ ] **OPTO-01**: User can mark a directory as alpha-AOS `off`, have that policy apply to the directory and all descendants until an explicit nested override, and preview the effective launch policy before applying it
- [ ] **OPTO-02**: User who configured an `off` tree once can later invoke each claimed harness through its ordinary supported command or application entrypoint without running an `alpha-aos run` command, and the isolation policy is enforced before that harness loads customizations
- [ ] **OPTO-03**: User opening an unclassified repository that already contains native AI-agent skills, MCP configuration, instructions, hooks, or harness settings is asked once before agent startup whether to use alpha-AOS or establish an `off` tree; the decision is persisted without silently modifying or committing the repository
- [ ] **OPTO-04**: User receives a clean restart instead of a false isolation claim when a harness or hook discovers the need for `off` mode only after global instructions, skill descriptions, or MCP schemas have already loaded
- [ ] **OPTO-05**: User launching from an `off` tree receives a clean harness baseline with alpha-AOS-managed and other user-global skills, MCP servers, hooks, memory, workflow guidance, and customization settings absent
- [ ] **OPTO-06**: User can add skills, MCP servers, `CLAUDE.md`/`AGENTS.md`, hooks, tools, and harness-specific settings inside an `off` tree and have the harness use those local resources without alpha-AOS installing, managing, or promoting them globally; with no local resources, the experience remains vanilla
- [ ] **OPTO-07**: User launching from an `off` tree does not pass unrelated ambient environment variables or secret sentinels to the harness; only reviewed names required for runtime or authentication are forwarded
- [ ] **OPTO-08**: User can inspect the resolved skill, MCP, hook, instruction, memory, configuration-root, environment-name, policy-inheritance, and pre-launch-enforcement surfaces and receives a fail-closed or explicitly unsupported result when global exclusion cannot be proven for that harness, surface, version, and OS
- [ ] **OPTO-09**: User is told that `off` mode provides configuration isolation rather than filesystem or network sandboxing, and an unsupported `sealed` request fails without falling back

### Lifecycle, Diagnostics, and Recovery

- [ ] **LIFE-01**: User can install or reconcile the reviewed stable lock idempotently, and a second unchanged plan reports `CURRENT`
- [ ] **LIFE-02**: User can run offline `status` for fast inspection and an explicit `doctor` or canary mode for native discovery and meaningful read-only execution evidence with actionable coded findings
- [ ] **LIFE-03**: User can preview and remove a project pack, clean an isolated runtime, uninstall one target, or uninstall the full managed stack without removing harness applications, authentication, or unrelated user resources
- [ ] **LIFE-04**: User can remove only receipted alpha-AOS-owned bytes or semantic entries that still match their recorded applied state, while drifted or user-modified resources cause a refusal
- [ ] **LIFE-05**: User can preview and apply rollback to restore exact prior bytes, and any post-transaction drift prevents all rollback writes before mutation begins
- [ ] **LIFE-06**: User can diagnose corrupt or interrupted journals as `needs-repair` and receive restart-safe recovery guidance instead of a false success state
- [ ] **LIFE-07**: User is shown verified external package changes and component-specific recovery instructions when managed-file rollback cannot safely reverse GSD, ECC, npm-link, or Pi bridge state
- [ ] **LIFE-08**: User can run update preview with no checkout, package, global-link, configuration, or managed-state mutation, and update apply reconciles only a reviewed stable-lock promotion

### Cross-Platform Release Proof

- [ ] **REL-01**: User can install, reconcile, diagnose, and uninstall the same packed release bytes in Windows, macOS, and Linux fixture environments without touching real shared roots
- [ ] **REL-02**: User can consult a versioned support matrix in which every claimed harness and surface has at least one current real-host discovery and invocation canary, while unproven combinations remain visibly limited or unsupported
- [ ] **REL-03**: User can inspect paired positive and negative controls proving native optional invocation, project-only capability scope, mandatory gate blocking, and opt-out exclusion
- [ ] **REL-04**: User can complete a real brownfield GSD discuss → plan → execute → verify → ship cycle that exercises one global optional capability, one project pack, one mandatory gate, one cross-harness handoff, and safe cleanup
- [ ] **REL-05**: User receives a v0.1.0 package that excludes candidate locks and local state, contains only allowlisted release files, and matches the tarball tested on all three operating systems
- [ ] **REL-06**: User can verify the published v0.1.0 package provenance, frozen stable lock, release notes, limitations, and a fresh-install smoke test from the public registry

## v2 Requirements

### Strong Isolation

- **SEAL-01**: User can launch a supported harness inside a verified OS/container boundary that enforces filesystem, network, environment, and process policy

### Operational Scale

- **OPER-01**: User can resume long-running multi-target operations from durable progress checkpoints
- **OPER-02**: User can collect privacy-preserving, normalized cross-harness performance and reliability metrics without capturing prompts, responses, or tool content

### Ecosystem Expansion

- **ECOS-01**: User can install additional project packs after each pack has unambiguous evidence, an exact-hash source, a safe inverse, and a representative invocation oracle
- **ECOS-02**: User can use additional repository-owned workflows and harness families only after their native semantics and opt-out behavior are independently verified
- **ECOS-03**: A team can distribute shared alpha-AOS policy without centralizing personal credentials or weakening local approval and rollback boundaries

## Out of Scope

| Feature | Reason |
|---------|--------|
| OS/container-backed `sealed` execution in v0.1.0 | Requires a separately threat-modeled adapter; current `project-only` process isolation must not be overstated |
| Full ECC profiles and broad language/framework rule packs | They increase context, supply-chain surface, and workflow overlap with GSD |
| Universal alpha-AOS invocation proxy | Optional capabilities should retain native harness selection; alpha-AOS owns scope and policy, not every tool call |
| LLM-selected project installation | Project mutation must be reproducible from positive evidence, manifests, versions, and hashes |
| Automatic removal when evidence disappears | Missing or temporary evidence cannot safely authorize deletion |
| Complete 3 OS × every harness/surface live matrix | v0.1.0 uses three-OS fixtures, representative real hosts, and one live proof per claimed surface |
| Installing or authenticating harness applications | Harnesses and vendor accounts remain user-managed prerequisites |
| Hosted service, centralized credentials, and fleet management | v0.1.0 is a local workstation tool for individual developers and power users |
| Common cross-harness telemetry | Defer until core lifecycle and support evidence stabilize without collecting sensitive content |

## Definition of Done

- Every v1 requirement is mapped to exactly one roadmap phase and verified by automated evidence or a named real-host canary.
- The same allowlisted npm tarball passes Windows, macOS, and Linux install/reconcile/uninstall fixtures.
- Every advertised harness/surface has current, redacted discovery and representative-use evidence; unverified claims are not advertised as supported.
- Project-pack, mandatory-gate, directory-tree `off`, uninstall, rollback, and interrupted-operation negative paths fail safely.
- A real brownfield project completes the full GSD lifecycle with one state writer and the confirmed hybrid capability model.
- The stable lock, support matrix, documentation, release notes, provenance, and fresh public-registry smoke test all refer to the same v0.1.0 artifact.

## Traceability

Roadmap phase mappings are populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 0
- Unmapped: 48 ⚠️

---
*Requirements defined: 2026-09-03*
*Last updated: 2026-09-03 after initial definition*
