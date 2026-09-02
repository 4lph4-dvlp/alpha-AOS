# Project Research Summary

**Project:** alpha-AOS v0.1.0
**Domain:** Local, cross-platform, cross-harness AI-agent workflow control plane
**Researched:** 2026-09-03
**Confidence:** MEDIUM

## Executive Summary

alpha-AOS is a declarative control plane for creating the same intentional AI-agent working environment across Windows, macOS, and Linux and across Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent. Experts should build this class of product as a compile-and-materialize system: inspect trusted, bounded inputs; compile a typed, content-addressed desired state; preview it; transactionally render only owned entries into each harness's native surfaces; and verify the effective runtime. alpha-AOS should not become a universal prompt or tool-call proxy, a second workflow engine, or a hosted control plane. GSD remains the sole lifecycle and `.planning/` state owner, while alpha-AOS owns capability selection, scope, installation, exclusion, diagnostics, and recovery.

The product model is a confirmed hybrid and should be treated as a requirement, not reopened during roadmap creation. Optional, low-risk global capabilities remain available through native harness discovery and implicit intent matching. Project packs are selected deterministically from positive, versioned repository evidence and materialized with exact provenance. Security-, migration-, and release-sensitive obligations run through explicit fail-closed GSD gates with one selected engine. Directory opt-out and `project-only` operation are implemented through an alpha-AOS launcher that constructs a minimal environment and isolated configuration roots; they are configuration isolation, not a filesystem or network sandbox, and `sealed` must remain unavailable unless a real OS/container adapter exists.

The dominant risks are unsafe filesystem mutation, scope leakage, corrupted user configuration, secret-bearing diagnostics, probabilistic checks being mistaken for guarantees, and unsupported cross-harness parity. Mitigation must shape the roadmap order: establish realpath, locking, journaling, redaction, schema validation, and adapter contracts before project sync; ship sync with removal and recovery rather than as a one-way copy; prove optional native use separately from mandatory gates; and make support claims only after three-OS fixtures plus versioned real-host canaries. A green renderer test or a file in the expected directory is not product success—native discovery, meaningful read-only invocation, negative exclusion, and drift-aware cleanup are the required evidence chain.

## Key Findings

### Recommended Stack

Retain the existing Node.js 24, TypeScript, ESM, and npm-package architecture. The current platform supplies the required portable filesystem, hashing, process, globbing, and test primitives; adding a daemon, database, container baseline, native addon, alternate package manager, or new test framework would add risk without solving a v0.1.0 requirement. Use the repository's existing transaction and state model rather than creating a second installer or state store. See [STACK.md](./STACK.md) for detailed version and platform analysis.

Add only Ajv and cross-spawn after candidate-lock review. Ajv provides strict draft 2020-12 schema validation at every untrusted data boundary, without coercion, defaults, or removal of unknown fields. cross-spawn belongs only inside the process adapter to handle Windows shims, PATHEXT, shebangs, and argument passing while preserving `shell: false`, bounded output, explicit timeouts, an environment allowlist, and centralized redaction.

**Core technologies:**

- **Node.js `>=24.0.0 <25` for v0.1 qualification:** portable CLI/runtime layer; use `fs.promises.glob`, `node:test`, crypto, process control, `realpath`, and flushed file writes from core.
- **TypeScript `5.9.3` exact:** strict domain contracts for evidence, plans, adapters, launch envelopes, and recovery receipts; do not mix milestone work with a compiler migration.
- **npm `>=10` for users and `>=11.5.1` in release publishing:** retain the current package distribution and use trusted publishing only in the protected release job.
- **`yaml@2.9.0` exact:** retain for the current catalog, pack, and project-manifest formats; do not use it as a substitute for schema validation.
- **`@modelcontextprotocol/sdk@1.30.0` exact:** retain for native MCP integration and the bounded Firecrawl proxy; promote changes only through candidate fixtures.
- **`ajv@8.20.0` exact:** compile strict draft 2020-12 schemas once per CLI invocation, then apply explicit domain normalization and cross-file checks.
- **`cross-spawn@7.0.6` exact plus `@types/cross-spawn@6.0.6`:** replace hand-built Windows command wrapping inside the process adapter only.

**Release posture:**

- Build one platform-neutral npm tarball, inspect its allowlisted contents, hash it once, install the same bytes on all three OS runners, and publish those tested bytes with OIDC provenance.
- Pin GitHub Actions by reviewed full commit SHA and use explicit runner images for release qualification, with a moving-image canary for drift.
- Exclude `catalog/candidate.lock.json` from the public package; end users receive only the reviewed stable lock.
- Treat network and synchronized-folder state roots as outside the v0.1 automatic-mutation guarantee unless explicitly proven safe.

### Expected Features

The feature set is not an ordinary installer checklist. Its differentiator is observable control over availability, scope, invocation, enforcement, exclusion, and cleanup. Status must preserve four separate claims: deployed/available, natively discovered, actually invoked, and mandatory gate satisfied. See [FEATURES.md](./FEATURES.md) for the full journey and acceptance-oracle catalog.

**Must have (table stakes):**

- Read-only inventory with harness, version, scope, adapter, and unsupported-state reporting.
- Deterministic, content-addressed, dry-run-first plans bound to the stable lock and target pre-state.
- Idempotent stable-lock install/reconcile and a genuinely non-mutating update preview.
- Native configuration preservation through owned entries or sections, source-hash compare-and-swap, and collision refusal.
- Scope and provenance visibility for global, project-local, isolated-runtime, and user-owned resources.
- Secret-safe human, JSON, journal, snapshot-metadata, subprocess, and CI output.
- Actionable `status` and `doctor` that distinguish selected, available, discovered, invoked, blocked, stale, unsupported, and recovery states.
- Complete project removal, target/global uninstall, conservative rollback, incomplete-operation recovery, and external-package recovery reporting.
- Directory-level opt-out/project-only launch using isolated config roots and a reviewed environment-name allowlist.
- Honest Windows/macOS/Linux support through portable fixtures and honest harness/surface support through live versioned canaries.
- Explicit labeling that `project-only` is configuration isolation and fail-closed behavior for unsupported `sealed` requests.

**Should have (core differentiators for v0.1.0):**

- Native implicit use of optional, low-risk global capabilities, verified by intent-matched and negative-control prompts.
- Deterministic project evidence and exact-hash project packs, followed by native discovery and actual-use proof.
- Transactional project sync that is bounded to one canonical project and ships with a safe inverse.
- An evidence-to-use proof chain instead of a single misleading “installed” state.
- Explicit GSD must-run gates for risk-sensitive obligations, with exactly one selected engine and fail-closed missing/error behavior.
- Safe stale-evidence lifecycle: mark a pack stale, never delete because evidence disappeared, and require explicit drift-aware removal.
- Capability equivalence through native, versioned adapters rather than false file-layout parity.
- Single GSD controller ownership of `.planning/`, with Hermes and other harnesses remaining workers/handoff consumers.
- A representative brownfield GSD cycle that exercises an optional global capability, a project pack, a mandatory gate, opt-out, handoff, and cleanup before the stable lock is frozen.

**Defer to v0.1.x or v0.2+:**

- Resumable progress for long-running operations, additional project packs, and additional repository-owned harness surfaces until real usage justifies them.
- OS/container-backed `sealed` isolation until filesystem, network, process, and environment enforcement exist and have platform threat validation.
- Additional harness families, organization/fleet management, centralized credentials, common cross-harness telemetry, and hosted services.
- Installing or authenticating harness applications, full ECC profiles, broad language packs, or a complete live 3 OS × every surface matrix.

**Explicit anti-features:**

- No universal invocation proxy and no second workflow/state engine.
- No model-selected project installation decisions and no skill-description-based mandatory guarantees.
- No automatic deletion when evidence disappears, whole-user-config rewrites, recursive removal of harness roots, or rollback that guesses external package pre-state.
- No ambient environment inheritance for project-only/off launches and no claim that process configuration isolation is a sandbox.

### Architecture Approach

Extend the existing CLI into a typed desired-state compiler with three output planes: optional native capabilities, mandatory GSD gates, and launch/isolation policy. A managed apply/recovery coordinator then renders those outputs through capability-negotiated harness adapters. Optional steady-state invocation goes directly from prompt to native harness skill/MCP selection; alpha-AOS is absent from that path. Mandatory checks go through GSD's supported project capability and lifecycle interfaces, never through direct edits of `.planning/` or copied registry files. See [ARCHITECTURE.md](./ARCHITECTURE.md) for contracts, data flows, and target layout.

**Major components:**

1. **Catalog and strict schema boundary** — loads stable catalog, packs, lock, project manifest, receipts, and journals; validates before domain conversion and never executes repository-provided inputs.
2. **Evidence detector** — selects a canonical project root, performs bounded positive observations, emits sorted evidence with detector version, hashes, provenance, and negative reasons, and never mutates.
3. **Desired-state compiler** — combines evidence, manifest decisions, stable lock, activation class, ownership, and adapter support into an immutable content-addressed plan.
4. **Native capability synchronizers** — render project/global skills, MCP entries, hooks, and policies into proven native scopes while owning only namespaced entries and preserving unknown user content.
5. **GSD lifecycle bridge** — uses the locked GSD CLI/capability contract for project skill injection and mandatory gates while preserving GSD as the sole lifecycle and state writer.
6. **Managed apply and recovery coordinator** — serializes writes, checks source and pre-state hashes under lock, extends existing journals/transactions, tracks external-operation receipts, verifies results, compensates failures, and exposes `needs-repair` honestly.
7. **Capability-negotiated harness adapters** — declare support per harness, surface, version, OS, and capability; render, launch, inspect, and fail closed when a guarantee is unverified.
8. **Launch policy compiler** — constructs complete project-only/off launch envelopes from an allowlist, redirects configuration roots, applies native suppression flags, and never begins with a copy of `process.env`.
9. **Runtime verifier and diagnostics** — inspects effective native surfaces and performs paired positive/negative canaries, meaningful read-only MCP calls, gate evidence checks, and receipt-aware status.

**Patterns to enforce:**

- Control plane/native data plane: compile and materialize, then leave optional invocation to the harness.
- Policy as typed desired state: separate deterministic selection from renderer-specific file formats.
- Content-addressed preview/apply: reject apply when evidence, manifest, stable lock, renderer, executable, or target bytes differ from the reviewed plan.
- Capability-negotiated adapters: `supported`, `unsupported`, and `unverified` are versioned per surface; unverified blocks gates and isolation claims.
- Paired positive/negative verification: a positive control proves the inspector works; a negative control proves exclusion or non-invocation.
- Ownership before removal: receipts and current hashes, not filenames or missing evidence, authorize deletion.

### Critical Pitfalls

The roadmap must treat these as release-blocking design constraints, not late hardening. See [PITFALLS.md](./PITFALLS.md) for the complete failure catalog and phase mapping.

1. **Lexical containment can escape through symlinks, junctions, reparse points, or TOCTOU swaps** — canonicalize and revalidate every existing parent under a single-writer lock immediately before mutation; require ownership and current-hash matches for removal; prove outside sentinels are unchanged on Windows and POSIX fixtures.
2. **Project evidence and packs can leak across parents, siblings, nested repositories, worktrees, or aliases** — bind evidence and receipts to an explicit canonical root, stop at nested VCS boundaries, use positive versioned evidence, record root provenance, and mark disappeared evidence stale rather than deleting.
3. **Model-selected invocation can be mistaken for a mandatory guarantee** — use native implicit behavior only for optional low-risk capabilities; encode risk-sensitive work as structured, exact-version GSD gates that block on missing, failed, unsupported, or unexamined results and choose one engine.
4. **Native configuration merging can preserve syntax while corrupting semantics or user intent** — prefer version-probed native commands or alpha-owned files/sections, validate before and after, compare source hashes under lock, preserve unknown content, and refuse ambiguous TOML/user-config mutations.
5. **Partial install and unsafe uninstall can leave the machine worse than before** — journal package pre-state and ownership, model external changes as compensating operations, refuse drifted removal, keep corrupt/incomplete journals visible, and never claim full rollback when an external change remains.
6. **Project-only can leak ambient secrets or be misrepresented as a sandbox** — build an environment allowlist from scratch, normalize Windows keys case-insensitively, isolate configuration roots, prove absent skills/MCP/hooks/guidance/memory/environment canaries, and keep filesystem/network limitations explicit.
7. **Plans, diagnostics, subprocess output, snapshots, and CI artifacts can disclose secrets** — centralize bounded capture and redaction, keep secrets out of argv and internal serializable plan objects, store snapshots outside the repository, and scan every output path using synthetic canaries.
8. **Atomic writes do not prevent concurrent lost updates or multiple GSD controllers** — serialize mutations per canonical root, revalidate hashes under the lock, recover locks using owner/journal state rather than age, and enforce one `.planning/` state writer.
9. **Green CI fixtures can be mistaken for cross-harness parity** — require independent, expiring real-host evidence for every claimed harness/surface and at least representative real-host OS coverage; never transfer CLI evidence to GUI/IDE or file-presence evidence to invocation claims.

## Implications for Requirements

Requirements should describe observable contracts rather than implementation presence. Each requirement must name its activation class, scope, ownership, unsupported behavior, acceptance evidence, and safe inverse where mutation occurs.

- **Hybrid activation is locked:** optional global capabilities use native implicit invocation; optional project capabilities require deterministic evidence and project-local provenance; mandatory obligations use explicit GSD gates; destructive/costly/credential-changing actions remain explicit-only and dry-run-first.
- **Support is a tuple, not a brand claim:** requirements must be scoped to harness + surface + version + OS + capability. `unverified` is a real state and must block mandatory and opt-out guarantees.
- **Project sync is a lifecycle, not a copy command:** detect → plan → apply → native discovery → representative use → stale → explicit remove must be specified and tested together.
- **Opt-out is launcher-enforced:** the requirement is not merely a config flag. The alpha-AOS launcher must redirect applicable config roots, construct a minimal environment, explicitly allow project resources, inspect the resolved surface, and fail closed when exclusion cannot be proven.
- **Status is multidimensional:** available, discovered, invoked, gate-satisfied, stale, unsupported, blocked, and needs-repair must not be collapsed.
- **Removal is ownership reconciliation:** stale evidence never authorizes deletion; only receipted, unchanged alpha-AOS-owned bytes or semantic entries may be removed automatically.
- **GSD authority is invariant:** alpha-AOS may use supported GSD capability/configuration commands, but it may not hand-edit lifecycle state. Hermes and all workers are denied state transitions.
- **Release evidence is part of the product:** the package manifest, tarball hash, three-OS fixture results, live support ledger, opt-out negative tests, mandatory-gate artifacts, and brownfield cycle are release requirements.

## Implications for Roadmap

Based on the combined dependency graph, use seven phases. Do not merge later validation into earlier implementation phases, and do not defer removal/recovery until after project sync is already considered shipped.

### Phase 1: Safety and Contract Foundation

**Rationale:** Every later capability writes files, launches processes, or makes a support claim. Unsafe roots, unvalidated data, secret-bearing errors, and concurrent writes would infect every subsequent feature.

**Delivers:** Strict Ajv validation boundaries; typed activation/evidence/plan/support/launch/receipt contracts; canonical project and target identities; realpath/reparse defenses; content hashes; single-writer locks; durable journal checkpoints; shell-free cross-platform spawning through cross-spawn; bounded redacted output; versioned adapter probes.

**Addresses:** Secret-safe plans and diagnostics, deterministic planning prerequisites, native configuration preservation prerequisites, conservative rollback foundations, honest support states.

**Avoids:** Path escape, secret disclosure, lost updates, plan/apply drift, mutable or malformed catalog state, and wrapper argument errors.

**Research flag:** Standard core patterns are sufficiently documented to skip broad phase research. Perform targeted implementation spikes for Windows junction/locked-file behavior and durability rather than reopening the architecture.

### Phase 2: Deterministic Project Evidence and Planning

**Rationale:** Project-local mutation cannot be safe or reproducible until project identity, evidence, pack selection, manifest policy, stable-lock inputs, and adapter limitations compile into one inspectable plan.

**Delivers:** Canonical root selection; nested-repository boundaries; bounded detectors; positive/negative evidence records; typed pack predicates; stable sorted plan/JSON output; exact source, renderer, evidence, manifest, target, and adapter digests; unsupported/unverified reporting; stale classification without deletion.

**Addresses:** Deterministic project evidence and capability packs, read-only inventory, scope/provenance visibility, repeatable dry runs, near-miss negative fixtures.

**Avoids:** Parent/sibling/worktree leakage, generic-file overmatching, LLM-decided installation, stale-evidence deletion, and approval drift.

**Research flag:** Standard pattern. Skip ecosystem research; spend planning effort on fixture taxonomy and exact evidence thresholds for WEB, API/data, infrastructure, agent/AI, security, and scientific packs.

### Phase 3: Transactional Project Packs and Native Optional Routing

**Rationale:** Once plans are trustworthy, the first product-visible differentiator is safe project-local materialization and native use. Apply, verification, removal, rollback, and incomplete-operation handling belong in one vertical slice so no one-way sync ships.

**Delivers:** Project-scope parameterization of existing skill/MCP/policy synchronizers; collision-safe native rendering; owned-subtree config changes; project `sync --apply`; receipts; native discovery; meaningful optional invocation canaries; stale and explicit remove; rollback and restart-safe recovery; capability-specific support matrix.

**Addresses:** Transactional project sync, native implicit project pack use, evidence-to-use proof, safe stale lifecycle, removal/uninstall foundations, capability equivalence through native adapters.

**Avoids:** File-presence-only success, config corruption, unowned overwrite/removal, false MCP “connected” states, automatic stale cleanup, and universal lowest-common-denominator adapters.

**Research flag:** Needs targeted phase research and real-host probing. Antigravity GUI/IDE discovery, Pi bridge behavior, Hermes project-local MCP limits, native trace formats, and comment-preserving configuration seams remain version-sensitive.

### Phase 4: GSD Capability Injection and Mandatory Gates

**Rationale:** Mandatory policy depends on stable project evidence and materialization. It must be built separately from optional routing so model-mediated skill selection can never satisfy a must-run obligation.

**Delivers:** Supported GSD project capability install/config/uninstall bridge; `agent_skills` mapping for required worker context; exact-version gate bundles; deterministic risk predicates; one-engine selection; structured pass/block/error evidence bound to project inputs or revision; blocking at selected GSD lifecycle points; waiver policy; single-controller enforcement.

**Addresses:** Explicit security/migration/release gates, engine de-duplication, project capabilities in GSD subagents, cross-harness workflow ownership.

**Avoids:** Probabilistic guarantees, duplicate native/ECC checks, stale gate evidence, unavailable checks treated as pass, direct `.planning/` mutation, and multiple GSD writers.

**Research flag:** Needs phase research against the exact locked GSD Core version. Validate the public capability, consent, lifecycle contribution, blocking, and uninstall contracts before locking alpha-AOS bundles.

### Phase 5: Launcher-Enforced Project-Only and Directory Opt-Out

**Rationale:** Exclusion can be proven only after alpha-AOS knows every installed surface and each adapter can inspect it. Config-root redirection and environment filtering must be designed together.

**Delivers:** Complete launch envelopes built from allowlists; isolated HOME/XDG/Windows profile and harness config roots; case-insensitive Windows environment normalization; reviewed per-harness auth variable selection; native disable/strict flags; static envelope inspection; resolved-surface preflight; paired positive/negative canaries; blocked unsupported adapters; honest `project-only` and fail-closed `sealed` UX.

**Addresses:** Directory opt-out, environment secret isolation, absence of global skills/MCP/hooks/memory/workflow guidance, launcher/config-root opt-out, explicit security-boundary messaging.

**Avoids:** Ambient secret leakage, repository skill leakage through isolated user roots, copied authentication stores, blank-root false confidence, and sandbox overclaiming.

**Research flag:** Requires deep per-harness live research. Highest-risk questions are Antigravity cross-surface suppression, Codex repository `.agents/skills` suppression, Hermes `.env`/profile behavior, and authentication reuse separated from customization state.

### Phase 6: Lifecycle UX, Diagnostics, Uninstall, and Recovery

**Rationale:** The same receipts and inspectors should power status, doctor, rollback, target/global uninstall, isolated-runtime cleanup, and recovery. Consolidating them prevents inconsistent definitions of ownership and health.

**Delivers:** Receipt-aware status; coded doctor findings; explicit live canary mode; transaction listing and rollback preview/apply; external-operation compensation; target/global uninstall; isolated-runtime cleanup; drift refusal; visible corrupt/incomplete journals; `needs-repair` state and redacted operator guidance; wrapper dry-run guarantees.

**Addresses:** Complete install/update/remove flows, multidimensional status, actionable doctor, conservative rollback, safe package recovery, repeated-operation idempotence.

**Avoids:** Recursive uninstallation, guessed package downgrades, invisible corrupt journals, false rollback success, destructive previews, and user-drift overwrite.

**Research flag:** Targeted phase research is needed for external package pre-state and compensation contracts across GSD, ECC runtime, npm/global links, and the Pi bridge. Core receipt/status patterns are standard.

### Phase 7: Cross-Platform and Live-Harness Release Proof

**Rationale:** Portable implementation evidence and native harness behavior are different proof layers. The stable lock and public support matrix must be frozen only after both layers pass against the same release candidate.

**Delivers:** Three-OS unit/golden/fault/wrapper matrix; identical packed-tarball install/uninstall on explicit runner images; real-host canary ledger for every claimed surface; meaningful MCP calls; native implicit positive/negative trials; opt-out sentinels; mandatory gate pass/fail artifacts; one complete brownfield GSD cycle; package allowlist; tarball hash; OIDC publish; registry provenance and fresh published-version smoke test.

**Addresses:** Honest OS and harness support, representative real-host release evidence, stable-lock freeze, v0.1.0 artifacts and documentation.

**Avoids:** CI-only parity claims, cross-surface inference, moving action tags/images, candidate lock leakage, untested published bytes, and stale support evidence.

**Research flag:** No broad architecture research; this is evidence execution. Targeted operational validation is mandatory for npm trusted-publisher setup, current runner images, and each live harness version immediately before release.

### Phase Ordering Rationale

- Safety, schema, process, ownership, and adapter contracts precede every new mutation path.
- Deterministic evidence and a content-addressed plan precede project apply; project apply ships with native verification and a safe inverse.
- Mandatory GSD gates reuse project evidence and capability packaging but stay separate from probabilistic optional invocation.
- Project-only/off exclusion follows complete surface ownership and adapter introspection; otherwise the launcher cannot know what it must suppress.
- Status, doctor, uninstall, and recovery reuse the same receipts and effective-surface evidence rather than building parallel state definitions.
- Release validation comes last and freezes only proven versions and claims; failures feed back to the owning adapter or prior phase rather than being papered over in documentation.

### Research Flags

**Phases likely needing `$gsd-plan-phase --research-phase <N>`:**

- **Phase 3:** Native project discovery, implicit-use traces, MCP behavior, and configuration merge facilities vary by harness/version/surface.
- **Phase 4:** GSD third-party project capability and blocking-gate packaging must be validated against the exact stable GSD release.
- **Phase 5:** Per-harness clean-launch, project-skill suppression, config-root, and authentication separation are the largest unresolved product seams.
- **Phase 6:** External package compensation needs component-specific pre-state and safe-recovery contracts.

**Phases with established patterns (skip broad research-phase):**

- **Phase 1:** Node/Ajv/cross-spawn, filesystem transaction, hashing, redaction, and typed contract patterns are well documented; use targeted OS spikes.
- **Phase 2:** Deterministic detection and content-addressed planning are repository-domain work with clear local authority and fixtures.
- **Phase 7:** The release architecture is defined; execute current-version checks and evidence collection rather than conducting open-ended research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Existing Node/TypeScript choices are confirmed by repository state and official Node APIs. Exact Ajv/cross-spawn candidates and release tooling still require integrity promotion and fixtures; filesystem durability varies by OS/volume. |
| Features | MEDIUM | The product contract and current gaps are high-confidence local evidence. Native implicit behavior and user-visible support are version-sensitive and must be proven on real harness surfaces. |
| Architecture | MEDIUM | All four studies converge on compile/materialize, typed desired state, native optional invocation, GSD gates, launcher isolation, and receipt-based recovery. Adapter-specific discovery, opt-out, and GSD packaging seams remain unproven. |
| Pitfalls | MEDIUM | Repository exposures such as lexical containment, environment spreading, incomplete external rollback, and missing concurrency coverage are directly evidenced. Cross-platform and harness edge behavior needs fault and live-host testing. |

**Overall confidence:** MEDIUM

The core product direction and roadmap order are high-confidence because PROJECT.md and all four research streams converge. The overall rating remains MEDIUM because the hardest acceptance claims concern mutable external harnesses and OS/filesystem behavior that documentation alone cannot certify.

### Gaps to Address

- **Native invocation traces:** Determine the reliable machine-readable or strictly parseable evidence for skill load and tool use on each supported surface; measure optional invocation as a rate, never a guarantee.
- **Antigravity surface separation:** Establish which config, skill, MCP, and opt-out guarantees are shared by CLI, GUI, and IDE; keep each unverified cell unsupported until its own canary passes.
- **Codex full-off behavior:** Prove how repository `.agents/skills`, project configuration, and guidance are suppressed in every claimed Codex host; changing `CODEX_HOME` alone is insufficient.
- **Hermes project MCP:** Keep project-local MCP unsupported unless official documentation and a live canary establish a stable contract.
- **Authentication separation:** Identify minimal per-harness auth environment/config inputs that can be reused without importing customizations or unrelated secrets; never copy opaque credential stores as a shortcut.
- **GSD capability contract:** Validate third-party project capability install, consent, lifecycle gate, structured result, `agent_skills`, and uninstall behavior against the locked GSD version.
- **Config preservation:** Prefer native commands and owned files. If in-place TOML mutation becomes unavoidable, select a comment-preserving CST strategy only after golden fixtures prove byte/semantic preservation.
- **External package recovery:** Define pre-state, adoption, upgrade, downgrade, and compensation rules separately for every installer; unknown pre-state must be retained and reported.
- **Filesystem guarantee boundary:** Define and diagnose unsupported UNC, network, synchronized, bind-mounted, overlay, or hostile concurrently writable roots instead of implying universal atomicity.
- **Release-time volatility:** Recheck npm trusted-publishing requirements, package-name availability, explicit runner images, action SHAs, and all harness versions immediately before freezing the lock.

## Sources

The detailed research files contain the complete source annotations. The following primary and repository sources most directly support roadmap decisions.

### Primary Project Sources (HIGH confidence)

- [PROJECT.md](../PROJECT.md) — authoritative v0.1.0 scope, constraints, hybrid activation decision, GSD ownership, and out-of-scope boundaries.
- [STACK.md](./STACK.md) — runtime, dependency, OS adapter, packaging, and release recommendations.
- [FEATURES.md](./FEATURES.md) — table stakes, differentiators, anti-features, journeys, and observable acceptance oracles.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — component boundaries, activation classes, data flows, adapter contracts, opt-out proof, and build order.
- [PITFALLS.md](./PITFALLS.md) — portable and harness-specific risks, required verification, recovery strategies, and phase mapping.
- [alpha-vibe stack decision](../../docs/alpha-vibe-stack-codex.md) — confirmed GSD spine, selected ECC capabilities, and research-tool responsibilities.

### Primary Runtime, Packaging, and OS Documentation (MEDIUM confidence for portable claims)

- [Node.js 24 filesystem API](https://nodejs.org/docs/latest-v24.x/api/fs.html) — globbing, realpath/lstat, flush/sync, rename/remove, flags, and concurrency caveats.
- [Node.js 24 child process API](https://nodejs.org/docs/latest-v24.x/api/child_process.html) — explicit environment, argv, stdio, timeout, and Windows process behavior.
- [Node.js 24 test runner](https://nodejs.org/docs/latest-v24.x/api/test.html) — built-in unit and fixture runner.
- [Ajv draft 2020-12 and options](https://ajv.js.org/json-schema.html#draft-2020-12) — strict schema compilation and non-mutating validation settings.
- [cross-spawn upstream repository](https://github.com/moxystudio/node-cross-spawn) — Windows shims, PATHEXT, shebang, and escaping behavior.
- [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) and [trusted publishing](https://docs.npmjs.com/trusted-publishers/) — tarball inspection, OIDC publishing, and release constraints.
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) and [hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) — immutable action pinning and runner-image behavior.
- [Microsoft path rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file), [junctions](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions), and [reparse-point behavior](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points-and-file-operations) — Windows path and boundary hazards.
- [POSIX rename](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html) and [fsync](https://pubs.opengroup.org/onlinepubs/9799919799/functions/fsync.html) — namespace replacement and durability primitives.

### Primary Harness Documentation (MEDIUM confidence; live canary required)

- [Claude Code skills](https://code.claude.com/docs/en/skills) and [configuration diagnostics](https://code.claude.com/docs/en/debug-your-config) — native skill behavior, scopes, effective-state inspection, and safe-mode limitations.
- [OpenAI Codex skills](https://developers.openai.com/codex/skills), [advanced configuration](https://developers.openai.com/codex/config-advanced), and [MCP](https://developers.openai.com/codex/mcp) — project skill roots, trust/config precedence, and MCP behavior.
- [Google Antigravity skills](https://antigravity.google/docs/skills/) and [MCP](https://antigravity.google/docs/mcp/) — workspace/global native surfaces; surface-specific canaries remain necessary.
- [Pi coding-agent README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md) and [skills documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md) — native skill discovery, trust, disable flags, and extension posture.
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [CLI commands](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md), and [MCP configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/mcp-config-reference.md) — project skill precedence, ignore flags, and profile-level MCP limits.

---
*Research completed: 2026-09-03*
*Ready for roadmap: yes*
