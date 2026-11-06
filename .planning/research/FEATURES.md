# Feature Research

**Milestone:** v0.8.0 Unified Tool Updates & Compatibility
**Researched:** 2026-11-06
**Confidence:** HIGH for goals/current gaps; MEDIUM for recovery mechanisms until demonstrated.

## Feature Landscape

These are detailed scope recommendations derived from the approved [direction](../PROJECT.md), [code evidence](EVIDENCE.md) and cited official interfaces. They await user approval as requirements.

### Table Stakes

| Category | Proposed user behavior | Complexity | Basis |
|---|---|---|---|
| Inventory | See every managed tool, official source, installed version and owning adapter, including Cua | Medium | npm/Cua paths are separate today |
| Local discovery | Install/update finds official stable releases without alpha-AOS remote promotion | Medium | [npm tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/), [Cua channels](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0) |
| Exact preview | Inspect old/new identity, affected targets, effects and recovery before apply | Medium | Extend existing reviewed plans |
| Local records | Inspect exact artifacts and separate installed, verified, failed and recovered outcomes | Medium | New ECC versions invalidate bundled hashes |
| Minimal adaptation | Prefer original upstream content and official config with separate alpha-AOS guidance | High | Current ECC text rewrites/GSD string detection |
| Integration | See actual protocol/schema and relevant read-only invocation evidence | High | [MCP revision changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog) |
| Recovery | Keep the working install on preflight failure; recover/reconcile supported post-apply effects | High | External installers are outside file rollback |
| Migration | Adopt existing stable-lock/Cua-pin installations without overwriting user changes | High | Ownership/provenance must be preserved |
| Guidance | CLI and bilingual docs distinguish external-tool updates from alpha-AOS code updates | Medium | Existing CLI promises stable reconciliation |

### Differentiators

Include explicit adapter rationale, applicability, verification and removal conditions. Report outcomes per component/platform/harness, accounting for shared dependency effects. Compatibility fixes should fit a patch release/local developer deployment without a new remotely distributed plugin system. [Architecture](ARCHITECTURE.md).

### Anti-Features

- Nightly/beta selection and background updates: outside user-approved triggers/channel.
- Runtime AI patching: replace with reviewed adapter/code changes.
- Blanket rejection of unknown versions: run checks against the resolved exact artifact.
- Full ECC profile/plugin migration: can import duplicate hooks/workflows beyond selected scope.
- Universal rollback claims: measure source-specific recovery and expose incomplete restoration.

## Dependencies and Ownership

Inventory/source rules -> exact local plan/record -> adaptation and staged checks -> activation/recovery -> migration and consistent guidance.

Pi upstream now documents built-in MCP alongside the optional adapter. Investigate necessity per supported installed Pi version; do not silently remove the bridge or change tool availability. [Pi adapter](https://github.com/nicobailon/pi-mcp-adapter).

Inventory alpha-AOS-owned skills, CLI-Hub prerequisites, harness applications and alpha-AOS bundled libraries, distinguishing external update ownership from dependencies merely mentioned in guidance. Generic CLI-Hub provisioning, new harness installation, hosted-service migration and v0.7.0 acceptance remain separate scope.

The [v0.6.0 expansion](../milestones/v0.6.0-REQUIREMENTS.md) already proposed LATEST-01..03 and COMPAT-01..03 but did not complete them. It is historical design, not current implementation or automatic approval of every old policy. Current user choices and workstation delivery policy govern.
