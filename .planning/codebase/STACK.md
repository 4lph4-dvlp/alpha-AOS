---
last_mapped_commit: f1ce41504ea94b699e71670d8cf9f6c0b02c9c34
last_mapped_at: 2026-09-02
---
# Technology Stack

**Analysis Date:** 2026-09-02

## Languages

**Primary:**

- TypeScript (ES2024) - CLI, catalog/lock handling, installation planning, harness adapters, MCP rendering/proxying, transactions, and tests under `src/` and `test/`.

**Secondary:**

- JavaScript (ES modules) - compiled CLI entrypoint `dist/src/cli.js` and generated test output.
- YAML - stack catalog and harness/MCP metadata in `catalog/stack.yaml`, plus YAML configuration rendering in `src/core/mcp.ts`.
- JSON - package metadata, immutable locks, schemas, transaction journals, and native JSON configuration rendering in `package.json`, `catalog/stack.lock.json`, `schemas/`, and `src/core/transaction.ts`.
- TOML - Codex MCP configuration blocks rendered by `src/core/mcp.ts`.
- Bash and PowerShell - cross-platform bootstrap/update scripts in `scripts/install.sh`, `scripts/update.sh`, `scripts/install.ps1`, and `scripts/update.ps1`.

## Runtime

**Environment:**

- Node.js >=24.0.0 - runtime requirement declared in `package.json` and enforced by `src/core/install.ts`.

**Package Manager:**

- npm >=10.0.0 - package installation, global package discovery, linking, and registry metadata access in `package.json`, `scripts/install.sh`, and `src/core/update.ts`.
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**

- Node.js built-in APIs - filesystem, process, child-process, crypto, path, URL, OS, and test functionality throughout `src/`.
- TypeScript 5.9.3 - compilation and strict static checking in `package.json` and `tsconfig.json`.
- `@modelcontextprotocol/sdk` 1.30.0 - MCP client/server stdio transport and tool filtering in `src/core/mcp-proxy.ts`.
- `yaml` 2.9.0 - catalog and YAML/TOML-adjacent configuration parsing/rendering in `src/core/catalog.ts`, `src/core/project.ts`, and `src/core/mcp.ts`.

**Testing:**

- Node.js built-in `node:test` runner and `node:assert/strict` - test suites in `test/*.test.ts`, executed after compilation by `package.json`.

**Build/Dev:**

- TypeScript compiler (`tsc`) 5.9.3 - build output to `dist/` and no-emit checks via scripts in `package.json`.
- GitHub Actions - cross-platform CI and scheduled dependency-candidate workflow in `.github/workflows/ci.yml` and `.github/workflows/dependency-candidate.yml`.

## Key Dependencies

**Critical:**

- `@modelcontextprotocol/sdk` 1.30.0 - launches upstream MCP servers over stdio and exposes the local Firecrawl policy proxy in `src/core/mcp-proxy.ts`.
- `yaml` 2.9.0 - parses the catalog, project manifests, and Hermes configuration in `src/core/catalog.ts`, `src/core/project.ts`, and `src/core/mcp.ts`.
- `@opengsd/gsd-core` 1.12.0 - pinned external workflow/state spine installed for Claude, Codex, Antigravity, and Pi according to `catalog/stack.lock.json` and `src/core/install.ts`.
- `ecc-universal` 2.2.0 - pinned runtime whose selected skill files are distributed through adapters in `src/core/ecc-skills.ts` and `catalog/stack.lock.json`.

**Infrastructure:**

- `@upstash/context7-mcp` 4.0.4 - pinned Context7 MCP server in `catalog/stack.lock.json`.
- `exa-mcp-server` 3.4.1 - pinned Exa MCP server in `catalog/stack.lock.json`.
- `firecrawl-mcp` 3.24.0 - pinned upstream Firecrawl MCP server behind the local allow-list proxy in `src/core/mcp-proxy.ts`.
- `pi-mcp-adapter` 2.31.0 - pinned Pi MCP bridge installed and verified separately by `src/core/install.ts` and `src/core/mcp-fixture.ts`.
- `@types/node` 24.7.2 - Node.js type declarations used by the TypeScript compiler in `package.json`.

## Configuration

**Environment:**

- Runtime configuration is read from process environment without committing values; names include `ALPHA_AOS_STATE_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `ANTIGRAVITY_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `HERMES_HOME`, and MCP credential variables referenced by `src/core/paths.ts`, `src/core/install.ts`, and `src/core/mcp.ts`.
- The repository contains environment-file patterns in `.gitignore`; secret-bearing environment files are not part of this analysis.
- Catalog policy and component selection are configured in `catalog/stack.yaml`; exact stable versions and integrity hashes are in `catalog/stack.lock.json`.

**Build:**

- `tsconfig.json` - ES2024 target, NodeNext modules/resolution, strict mode, source maps, and `src/**/*.ts`/`test/**/*.ts` inclusion.
- `package.json` - ESM package metadata, CLI bin mapping, build/check/test/start scripts, engines, and dependency versions.
- `package-lock.json` - npm dependency resolution lock.

## Platform Requirements

**Development:**

- Windows 11, current macOS, or current Linux distribution, with Node.js >=24, npm >=10, and Git; bootstrap syntax is validated for both shell families in `.github/workflows/ci.yml` and scripts are provided in `scripts/`.
- At least one supported pre-existing harness (Claude Code, Codex, Antigravity, Pi Agent, or Hermes Agent) is required for managed target installation; harness applications are not installed by this package, as enforced by `src/core/install.ts`.

**Production:**

- User workstation installation via npm package linking (`npm link`) and user-scoped harness configuration; there is no long-running alpha-AOS service or server deployment. The published package surface is defined by `package.json` and includes `dist/src/`, `catalog/`, `schemas/`, `scripts/`, `skills/`, `README.md`, and `docs/`.

---

*Stack analysis: 2026-09-02*
