# alpha-AOS v0.2.0 Release Notes

**Release Date:** October 2026  
**Version:** 0.2.0  
**License:** Apache 2.0  

alpha-AOS v0.2.0 is a major milestone delivering an intentional, declarative, and cross-platform AI-agent working environment across Windows 11, macOS, and Linux.

---

## Highlights

### 1. Unified 5-Harness Control Plane
- Configures **Claude Code**, **Codex**, **Antigravity**, **Pi Agent**, and **Hermes Agent** natively.
- Evaluates exact detected versions and binary integrity rather than coarse heuristics.
- Structured support taxonomy: each role and capability is strictly **PROVEN** via verifiable invocation receipts, **UNVERIFIED** when unrun or unauthenticated, or **UNSUPPORTED** when structurally incompatible.

### 2. GSD Workflow Spine & Composable Harness Roles
- GSD Core (`standard`) serves as the single project lifecycle and state spine.
- Composable role architecture: allows pairing an initiator/controller (e.g. Claude Code or Antigravity) with worker executors and independent reviewer witnesses.
- Architectural safety: Hermes Agent is strictly scoped to worker roles; controller and lifecycle hook mutation are structurally unsupported to prevent state corruption.

### 3. Capability Fabric & Pinned External Services
- Three selected ECC runtime skills: `unified-memory`, `documentation-lookup`, and `deep-research`.
- Pinned MCP servers: `@upstash/context7-mcp`, `exa-mcp-server`, and `firecrawl-mcp` behind a secure local allow-list proxy.
- Transparent capability ledger: records all tool and MCP invocations with zero secret values.

### 4. Supply Chain & Packaging Guarantees
- End users receive strictly reviewed and integrity-pinned releases via `catalog/stack.lock.json` (`channel: stable`).
- Candidate releases (`candidate.lock.json`) are automatically rejected on end-user machines.
- Packaged tarball lifecycle verified: isolated prefix install, idempotent reconciliation, diagnostics (`doctor`), and full purge (`uninstall`) proven with zero real-host managed directory mutations across 5 monitored categories (`managed_state`, `harness_config`, `harness_policy`, `skills`, `gsd_workflow`).

### 5. Multi-Workload Verification & Boundary Honesty
- **Software Development Workload:** 1인칭 CLI game state machine oracle verified end-to-end with independent reviewer witness digest parity and capability call receipts.
- **CoursePilot Academic Workload:** Multi-level course-week-module file identity preservation guaranteed (`VER-04 edge adjacency`); fixture downloads proved with SHA-256 integrity.
- **Ordinary GSD Non-Activation:** Ordinary conversational requests execute directly with zero supervisor runs and zero contract previews.

---

## Platform Support Matrix Overview

See [SUPPORT_MATRIX_v0.2.0.md](./SUPPORT_MATRIX_v0.2.0.md) for the complete 35-cell evaluation across all 5 harnesses.

| Harness | Evaluated Roles | Capabilities | Windows 11 | macOS | Linux | Notes |
|---|---|---|---|---|---|---|
| **Claude Code** | Controller, Executor, Reviewer | Skill, MCP, Pack, Hook | Supported | Supported | Supported | Full GSD lifecycle & tool support |
| **Codex** | Controller, Executor, Reviewer | Skill, MCP, Pack, Hook | Supported* | Supported | Supported | *Windows headless elevation sandbox restriction reported honestly |
| **Antigravity** | Controller, Executor, Reviewer | Skill, MCP, Pack, Hook | Supported | Supported | Supported | AGY CLI and IDE integration |
| **Pi Agent** | Controller, Executor, Reviewer | Skill, MCP, Pack, Hook | Supported | Supported | Supported | Pinned `pi-mcp-adapter` integration |
| **Hermes Agent**| Executor, Reviewer | Skill, MCP, Pack | Supported | Supported | Supported | Worker-only; controller & hook structurally unsupported |

---

## Known Boundaries and Disclaimers (D-02, D-08, D-15)

In strict accordance with the alpha-AOS determinism and zero-simulation policy:
1. **Live University LMS Access (D-15):** Local fixture downloads and file integrity hashes are proven. Live LMS access requires authenticated institutional credentials and remains explicitly `UNVERIFIED`.
2. **Codex Windows Sandbox:** Codex execution on Windows encounters sandbox elevation restrictions under non-interactive CLI runners; reported as `UNVERIFIED` until upstream fixes land.
3. **Hermes Worker Boundaries:** Hermes Agent is architecturally prevented from becoming a GSD lifecycle controller or hook runner to protect workflow state integrity.
4. **Paid/External Canaries:** External paid API keys that were not executed during automated runs are reported as `UNVERIFIED` without simulating green checks.

---

## Upgrade Instructions

From source:
```sh
git pull --ff-only
npm ci
npm run build
npm test
.\scripts\update.ps1 -Apply   # Windows PowerShell
./scripts/update.sh --apply    # macOS / Linux
```
