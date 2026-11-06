# Stack Research

**Milestone:** v0.8.0 Unified Tool Updates & Compatibility
**Researched:** 2026-11-06
**Confidence:** HIGH for observed code/metadata; MEDIUM for proposed recovery feasibility.

## Recommended Stack

Retain TypeScript, Node built-in fetch/crypto/filesystem/process APIs, existing schema validation and component sessions. No new library is justified by discovery alone. External-tool selection must remain separate from alpha-AOS's package dependencies and self-update. This is a design recommendation based on [package.json](../../package.json) and [existing resolution](../../src/core/update.ts).

| Technology | Version / policy | Purpose |
|---|---|---|
| Node.js | Existing >=24 floor | Bounded HTTP, hashing, subprocess control; also required by observed latest GSD metadata |
| npm registry | Official latest tag resolved to an exact non-prerelease version | GSD, ECC, MCP and bridge discovery |
| Cua official releases | Driver-specific stable channel, exact release artifacts | Native driver discovery/installation |
| Local tool record | Proposed versioned schema under userStateRoot | Exact versions, artifacts, source and compatibility/recovery evidence |
| Component sessions and transactions | Existing implementation | Writer ownership, reviewed input binding and owned-file rollback |

Sources: [npm tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/), [Cua stable semantics](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0), [component sessions](../../src/core/component-session.ts).

## Observed Package Versions

Read-only registry observations at 2026-11-06 00:56 UTC. All six metadata responses contained integrity. These are observations, not installed versions, compatibility claims or future pins. Re-resolve when an update is requested.

| Component | Repository lock | Observed latest | Official source |
|---|---|---|---|
| GSD | 1.18.0 | 1.20.1 | [registry](https://registry.npmjs.org/@opengsd%2Fgsd-core/latest) |
| ECC | 2.2.3 | 2.2.3 | [registry](https://registry.npmjs.org/ecc-universal/latest) |
| Context7 | 4.4.4 | 4.5.0 | [registry](https://registry.npmjs.org/@upstash%2Fcontext7-mcp/latest) |
| Exa | 3.4.2 | 3.4.3 | [registry](https://registry.npmjs.org/exa-mcp-server/latest) |
| Firecrawl | 3.34.1 | 3.37.0 | [registry](https://registry.npmjs.org/firecrawl-mcp/latest) |
| Pi bridge | 6.0.0 | 7.0.1 | [registry](https://registry.npmjs.org/pi-mcp-adapter/latest) |

Cua is pinned at 0.38.0. A bounded first page of 100 [official releases](https://api.github.com/repos/trycua/cua/releases?per_page=100) included eight plain driver tags through 0.38.0, all GitHub-prerelease-labelled. This is not exhaustive latest-version proof. Production discovery needs bounded pagination and explicit incomplete-result handling. Upstream says plain driver SemVer releases are stable despite that flag; Linux preview support is a separate platform constraint. [Release contract](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0).

## Protocol Boundary

The installed SDK declares 2025-11-25 as its latest supported protocol in node_modules/@modelcontextprotocol/sdk/dist/esm/types.js. The [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) documents changed discovery/negotiation. Do not infer every latest server requires it. Probe the actual common protocol and tool schemas through each alpha-AOS client/proxy. Updating alpha-AOS's bundled SDK is a code/dependency change, not an external-tool update side effect.

## Alternatives Considered

| Recommended | Alternative | Consequence |
|---|---|---|
| Resolve once; render exact launch identity | Leave @latest in native config | Unrequested version changes on later launches |
| Source-specific official adapters | One npm installer for everything | Cannot represent Cua platform effects |
| Local exact records | Remove all integrity/version locks | No reproducible identity or recovery evidence |
| Selected ECC scope | Full upstream plugin/profile migration | Potential hooks/workflow duplication |

Context7, Exa and Firecrawl document hosted endpoints too. A transport/authentication migration is separate scope, not needed for local package updates. [Context7](https://github.com/upstash/context7), [Exa](https://github.com/exa-labs/exa-mcp-server), [Firecrawl](https://github.com/firecrawl/firecrawl-mcp-server).

## Installation

No dependencies, managed tools or global configuration were installed/updated during research. Revalidate mutable installer documentation against the exact selected artifact during implementation.
