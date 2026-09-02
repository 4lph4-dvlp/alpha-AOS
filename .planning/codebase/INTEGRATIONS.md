---
last_mapped_commit: f1ce41504ea94b699e71670d8cf9f6c0b02c9c34
last_mapped_at: 2026-09-02
---
# External Integrations

**Analysis Date:** 2026-09-02

## APIs & External Services

**MCP research services:**

- Context7 - current library and API documentation through `@upstash/context7-mcp@4.0.4`, configured by `src/core/mcp.ts`; credential name `CONTEXT7_API_KEY` is passed through the harness environment when present.
- Exa - web search and source discovery through `exa-mcp-server@3.4.1`, configured by `src/core/mcp.ts` and `src/core/mcp-proxy.ts`; authenticated calls require `EXA_API_KEY`, with optional `ENABLED_TOOLS` forwarded by the proxy.
- Firecrawl - web scrape/map/crawl through `firecrawl-mcp@3.24.0`; `src/core/mcp-proxy.ts` starts it over stdio and exposes only `firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, and `firecrawl_check_crawl_status`. Credential names include `FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`, and `FIRECRAWL_OAUTH_TOKEN`; feedback suppression variables are fixed by `src/core/mcp.ts` and `src/core/mcp-proxy.ts`.

**Package distribution and metadata:**

- npm registry - `src/core/update.ts` performs HTTPS `fetch` requests to `https://registry.npmjs.org/<package>/latest` to discover candidate versions and integrity metadata for locked GSD, ECC, MCP, and Pi bridge packages.
- npm CLI - `src/core/install.ts`, `src/core/mcp.ts`, and `src/core/process.ts` invoke `npx`, `npm`, or `npm link` to install exact package versions after fixture/integrity checks.

## Data Storage

**Databases:**

- None detected. Persistent state is file-based, not relational or document database-backed, using `catalog/*.json`, project `.alpha-aos/stack.yaml`, and user state under `~/.alpha-aos` through `src/core/paths.ts` and `src/core/transaction.ts`.

**File Storage:**

- Local filesystem only - managed harness configuration, skills, snapshots, and journals are written transactionally by `src/core/transaction.ts` to user-scoped roots and native harness paths.
- Package tarballs and extracted fixtures use temporary directories created by `src/core/gsd-fixture.ts`, `src/core/ecc-fixture.ts`, and `src/core/mcp-fixture.ts`.

**Caching:**

- npm's local cache is used implicitly by npm/CI (`.github/workflows/ci.yml`); no application cache service or cache client is implemented.

## Authentication & Identity

**Auth Provider:**

- Harness and MCP providers own authentication; alpha-AOS does not implement an auth server or token exchange. MCP keys/tokens are read from process environment and only variable names are rendered into configuration by `src/core/mcp.ts` and `src/core/mcp-proxy.ts`.
- GitHub Actions authenticates repository automation with the workflow-provided `github.token` exposed as `GH_TOKEN` in `.github/workflows/dependency-candidate.yml`; its value is not stored in the repository.

## Monitoring & Observability

**Error Tracking:**

- None detected. Errors are raised as typed/ordinary `Error` values and surfaced by the CLI in `src/cli.ts` and core modules.

**Logs:**

- CLI status, plan, warning, and error text is formatted by `src/format.ts` and printed by `src/cli.ts`; external installer stderr/stdout is captured by `src/core/process.ts`. MCP subprocess stderr is inherited by `src/core/mcp-proxy.ts`.

## CI/CD & Deployment

**Hosting:**

- GitHub repository/package workflow - CI runs on Ubuntu, macOS, and Windows in `.github/workflows/ci.yml`; the project declares its GitHub repository in `package.json`.

**CI Pipeline:**

- `CI` checks Node 24 builds, type checks, tests, and bootstrap script syntax across three operating systems in `.github/workflows/ci.yml`.
- `Dependency candidate` runs weekly or manually, resolves npm registry versions, writes `catalog/candidate.lock.json`, and pushes/creates a pull request with GitHub CLI using `.github/workflows/dependency-candidate.yml`.

## Environment Configuration

**Required env vars:**

- Optional MCP credentials: `CONTEXT7_API_KEY`, `EXA_API_KEY`, and `FIRECRAWL_API_KEY`; Exa requires its key for authenticated calls, while the other services support limited keyless operation. The names and presence checks are implemented in `src/core/mcp.ts`.
- Optional Firecrawl upstream values: `FIRECRAWL_API_URL` and `FIRECRAWL_OAUTH_TOKEN`, forwarded only to the Firecrawl subprocess by `src/core/mcp-proxy.ts`.
- Optional path overrides: `ALPHA_AOS_STATE_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `ANTIGRAVITY_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, and `HERMES_HOME`, read in `src/core/paths.ts`, `src/core/install.ts`, and `src/core/mcp.ts`.

**Secrets location:**

- User environment or harness-managed secret stores; alpha-AOS explicitly prevents credential values from rendered configs, plans, locks, journals, and command arguments in `src/core/mcp.ts` and `test/mcp.test.ts`.

## Webhooks & Callbacks

**Incoming:**

- None detected. The CLI is local and exposes no HTTP listener or webhook route in `src/cli.ts` or `src/`.

**Outgoing:**

- HTTPS GET requests to npm registry latest-package endpoints from `src/core/update.ts`.
- GitHub Actions pushes a dependency candidate branch and opens or refreshes a pull request via `git` and `gh` in `.github/workflows/dependency-candidate.yml`.
- MCP integrations use local stdio subprocess callbacks between harnesses, alpha-AOS, and upstream MCP servers through `src/core/mcp.ts` and `src/core/mcp-proxy.ts`; no public callback URL is configured.

---

*Integration audit: 2026-09-02*
