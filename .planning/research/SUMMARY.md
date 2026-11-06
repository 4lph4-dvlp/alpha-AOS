# Project Research Summary

**Project:** alpha-AOS v0.8.0 — Unified Tool Updates & Compatibility
**Domain:** Local managed-tool updates and cross-harness integration
**Researched:** 2026-11-06
**Confidence:** HIGH for current gaps/channel rules; MEDIUM for proposed recovery and adaptation removal.

## Executive Summary

The approved policy is feasible without remote lock promotion: query official releases locally on installation/explicit update, resolve an exact artifact, and use that identity throughout planning, apply and native launch configuration. Retain integrity and exact local records. npm tags are publisher-selected aliases, so also reject semantic prereleases. [npm tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/).

Cua shares the lifecycle, not the npm resolver. Its stable plain driver tags can carry GitHub's prerelease flag because the repository publishes several products. A repository-wide latest endpoint or generic prerelease filter would be wrong. Platform support, including Linux preview, is a separate question. [Cua contract](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0).

Maintenance reduction is central. Current ECC rewrites, GSD string detection and bundled hashes couple tool changes to alpha-AOS releases. Prefer public configuration and separately discoverable alpha-AOS guidance, retaining explicit small adapters where translation is needed. Native installer effects are not automatically restored by current file transactions; recovery must be designed per adapter with measured outcomes. [Local evidence](EVIDENCE.md).

## Key Findings

### Recommended Stack

Keep TypeScript/Node and current mutation boundaries. Add a local versioned tool record and source/compatibility contracts. No new library is currently justified. Separate external-tool updates from alpha-AOS dependencies/self-update. [Stack](STACK.md).

### Expected Features

Must have: complete managed inventory including Cua; source-aware local stable selection; exact preview/local records; minimal transformations; meaningful integration evidence; prior-state retention and native recovery; migration and CLI/docs consistency. Defer hosted-service migration, new harness installation, generic CLI-Hub provisioning, background/nightly updates. [Features](FEATURES.md).

### Architecture Approach

Inventory -> exact resolution -> bound preview -> acquire/verify -> stage/check -> activate -> verify target/record -> retain or recover on failure. Source-specific official adapters declare effects and recovery. Unknown versions may be checked; absent proof remains explicitly unverified. Runtime AI rewriting is excluded. [Architecture](ARCHITECTURE.md).

### Critical Pitfalls

- Cua stable classification differs from generic GitHub prerelease metadata.
- Floating @latest launch commands break explicit-update timing.
- Bundled expected hashes in downstream readers recreate centralized waiting.
- Text/hash success does not establish routing/protocol/invocation success.
- Owned-file rollback does not restore all external installer effects. [Pitfalls](PITFALLS.md).

The installed SDK supports through 2025-11-25. The [newer MCP revision](https://modelcontextprotocol.io/specification/2026-07-28/changelog) changes discovery behavior. This justifies testing actual common protocol support, not declaring observed latest servers incompatible.

## Implications for Roadmap

Proposed sections only; detailed requirements and roadmap approval are still required.

| Proposed phase | Delivers | Ordering rationale |
|---|---|---|
| 39 — Inventory and Local Release Records | Source ownership, exact local identity, migration contract | Every resolver/renderer/verifier needs the same identity |
| 40 — Local Official Release Updates | npm/Cua discovery and unified planning | Implements approved trigger/channel after identity rules |
| 41 — Minimal Compatibility Adapters | Verified transformation reduction, explicit adapter metadata | Isolate semantic adaptation from release bytes |
| 42 — Integration Verification and Recovery | Real protocol/schema/call evidence and native recovery | Exercise staging/active paths with declared effects |
| 43 — Migration and Consistent Guidance | Existing-install migration, diagnostics, bilingual docs | Close all hidden bundled-pin readers |

### Research Flags

Cua staging/recovery and permissions need exact-installer/platform evidence. ECC separate guidance needs discovery/precedence proof before removing rewrites. GSD hook helper necessity must be checked against the selected release. MCP checks must include alpha-AOS proxy/client boundaries, not only upstream servers.

## Confidence Assessment

| Area | Confidence | Limit |
|---|---|---|
| Current code/metadata | High | Bounded source inspection and read-only public observations |
| Official channel selection | High for documented conventions | Complete bounded Cua pagination remains implementation work |
| Need for adaptation cleanup | High | Concrete text/hash coupling |
| Removal of individual patches | Medium | Requires behavior/precedence evidence |
| Native recovery | Medium design confidence | Universal recovery not established |

## Sources

[EVIDENCE.md](EVIDENCE.md) registers 16 official documentation/source pages, six registry observations, a bounded release API read and local code. Exa discovery and Context7 npm documentation succeeded. Firecrawl read two key pages but failed with connection errors for others; official reads supplemented them. No live upgrades, compatibility tests or full suite ran.

## Next Checkpoint

Research for milestone definition is complete. Scope and approve the detailed requirements before roadmap creation. Preserved v0.7.0 live acceptance remains unresolved. No implementation or release is claimed.
