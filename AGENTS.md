<!-- GSD:project-start source:PROJECT.md -->

## Project

**alpha-AOS**

alpha-AOS is a declarative, cross-platform control plane for building a consistent AI-agent working environment across Windows, macOS, and Linux. It configures supported harnesses such as Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent so GSD provides the project workflow and state spine, selected ECC capabilities enrich the work, and MCP servers provide external tools without forcing every capability into every project.

The system manages capability scope as well as installation: broadly useful, low-risk capabilities can be available globally; evidence-matched capabilities can be supplied only to a project; mandatory checks can be attached to explicit quality gates; and selected directories can run without inheriting alpha-AOS at all.

**Core Value:** A user can enter any supported project on any supported operating system and get the same intentional AI-agent workflow, capability boundaries, and safety guarantees without manually rebuilding each harness configuration.

### Constraints

- **Compatibility**: Windows 11, current macOS, and current Linux distributions — v0.1.0 must keep scripts, path handling, and native configuration adapters portable
- **Runtime**: Node.js `>=24.0.0`, npm `>=10.0.0`, and Git — required by the locked toolchain and GSD version
- **Harness scope**: Claude Code, Codex, Antigravity GUI/CLI/IDE, Pi Agent, and Hermes Agent — capabilities may use different native adapters, and unsupported parity must be reported rather than simulated
- **Workflow ownership**: GSD Core `standard` is the only project lifecycle/state spine — ECC and native features must not duplicate or overwrite its state transitions
- **Determinism**: Installation, project-pack selection, policy checks, and mandatory gates cannot depend only on LLM judgment — evidence, versions, hashes, and decisions must be inspectable
- **Safety**: Mutations are previewable, root-bounded, snapshotted, and rollback-aware — stale evidence never triggers automatic deletion
- **Secrets**: Credential values cannot enter manifests, locks, plans, journals, diagnostics, command arguments, or repository files — project-only launch environments must default to a reviewed allowlist
- **Supply chain**: End users receive only the reviewed stable lock — candidate dependencies and mutable external automation are not trusted without fixture and review gates
- **Validation**: Native discovery plus a meaningful read-only invocation is required — configuration-file presence alone is insufficient

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript (ES2024) - CLI, catalog/lock handling, installation planning, harness adapters, MCP rendering/proxying, transactions, and tests under `src/` and `test/`.
- JavaScript (ES modules) - compiled CLI entrypoint `dist/src/cli.js` and generated test output.
- YAML - stack catalog and harness/MCP metadata in `catalog/stack.yaml`, plus YAML configuration rendering in `src/core/mcp.ts`.
- JSON - package metadata, immutable locks, schemas, transaction journals, and native JSON configuration rendering in `package.json`, `catalog/stack.lock.json`, `schemas/`, and `src/core/transaction.ts`.
- TOML - Codex MCP configuration blocks rendered by `src/core/mcp.ts`.
- Bash and PowerShell - cross-platform bootstrap/update scripts in `scripts/install.sh`, `scripts/update.sh`, `scripts/install.ps1`, and `scripts/update.ps1`.

## Runtime

- Node.js >=24.0.0 - runtime requirement declared in `package.json` and enforced by `src/core/install.ts`.
- npm >=10.0.0 - package installation, global package discovery, linking, and registry metadata access in `package.json`, `scripts/install.sh`, and `src/core/update.ts`.
- Lockfile: present (`package-lock.json`)

## Frameworks

- Node.js built-in APIs - filesystem, process, child-process, crypto, path, URL, OS, and test functionality throughout `src/`.
- TypeScript 5.9.3 - compilation and strict static checking in `package.json` and `tsconfig.json`.
- `@modelcontextprotocol/sdk` 1.30.0 - MCP client/server stdio transport and tool filtering in `src/core/mcp-proxy.ts`.
- `yaml` 2.9.0 - catalog and YAML/TOML-adjacent configuration parsing/rendering in `src/core/catalog.ts`, `src/core/project.ts`, and `src/core/mcp.ts`.
- Node.js built-in `node:test` runner and `node:assert/strict` - test suites in `test/*.test.ts`, executed after compilation by `package.json`.
- TypeScript compiler (`tsc`) 5.9.3 - build output to `dist/` and no-emit checks via scripts in `package.json`.
- GitHub Actions - cross-platform CI and scheduled dependency-candidate workflow in `.github/workflows/ci.yml` and `.github/workflows/dependency-candidate.yml`.

## Key Dependencies

- `@modelcontextprotocol/sdk` 1.30.0 - launches upstream MCP servers over stdio and exposes the local Firecrawl policy proxy in `src/core/mcp-proxy.ts`.
- `yaml` 2.9.0 - parses the catalog, project manifests, and Hermes configuration in `src/core/catalog.ts`, `src/core/project.ts`, and `src/core/mcp.ts`.
- `@opengsd/gsd-core` 1.12.0 - pinned external workflow/state spine installed for Claude, Codex, Antigravity, and Pi according to `catalog/stack.lock.json` and `src/core/install.ts`.
- `ecc-universal` 2.2.0 - pinned runtime whose selected skill files are distributed through adapters in `src/core/ecc-skills.ts` and `catalog/stack.lock.json`.
- `@upstash/context7-mcp` 4.0.4 - pinned Context7 MCP server in `catalog/stack.lock.json`.
- `exa-mcp-server` 3.4.1 - pinned Exa MCP server in `catalog/stack.lock.json`.
- `firecrawl-mcp` 3.24.0 - pinned upstream Firecrawl MCP server behind the local allow-list proxy in `src/core/mcp-proxy.ts`.
- `pi-mcp-adapter` 2.31.0 - pinned Pi MCP bridge installed and verified separately by `src/core/install.ts` and `src/core/mcp-fixture.ts`.
- `@types/node` 24.7.2 - Node.js type declarations used by the TypeScript compiler in `package.json`.

## Configuration

- Runtime configuration is read from process environment without committing values; names include `ALPHA_AOS_STATE_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `ANTIGRAVITY_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `HERMES_HOME`, and MCP credential variables referenced by `src/core/paths.ts`, `src/core/install.ts`, and `src/core/mcp.ts`.
- The repository contains environment-file patterns in `.gitignore`; secret-bearing environment files are not part of this analysis.
- Catalog policy and component selection are configured in `catalog/stack.yaml`; exact stable versions and integrity hashes are in `catalog/stack.lock.json`.
- `tsconfig.json` - ES2024 target, NodeNext modules/resolution, strict mode, source maps, and `src/**/*.ts`/`test/**/*.ts` inclusion.
- `package.json` - ESM package metadata, CLI bin mapping, build/check/test/start scripts, engines, and dependency versions.
- `package-lock.json` - npm dependency resolution lock.

## Platform Requirements

- Windows 11, current macOS, or current Linux distribution, with Node.js >=24, npm >=10, and Git; bootstrap syntax is validated for both shell families in `.github/workflows/ci.yml` and scripts are provided in `scripts/`.
- At least one supported pre-existing harness (Claude Code, Codex, Antigravity, Pi Agent, or Hermes Agent) is required for managed target installation; harness applications are not installed by this package, as enforced by `src/core/install.ts`.
- User workstation installation via npm package linking (`npm link`) and user-scoped harness configuration; there is no long-running alpha-AOS service or server deployment. The published package surface is defined by `package.json` and includes `dist/src/`, `catalog/`, `schemas/`, `scripts/`, `skills/`, `README.md`, and `docs/`.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- TypeScript modules use lowercase kebab-free names such as `src/format.ts`, `src/cli.ts`, and `src/core/owned-skills.ts`; tests use the subject name plus `.test.ts`, for example `test/skill-policy.test.ts`.
- Use camelCase for functions, with action-oriented names such as `loadCatalog`, `createInstallPlan`, `planMcpSync`, and `applyFileTransaction` in `src/core/catalog.ts`, `src/core/plan.ts`, `src/core/mcp.ts`, and `src/core/transaction.ts`.
- Prefer named exported functions for module APIs and local unexported helpers for parsing, validation, hashing, path checks, and rendering.
- Use camelCase for locals and parameters (`configRoot`, `stateRoot`, `allowedRoots`); use descriptive nouns for paths and domain values.
- Use `UPPER_SNAKE_CASE` for module constants such as `HELP` in `src/cli.ts`; immutable domain lists are commonly lower camelCase (`managedSkills` in `src/core/skill-policy.ts`).
- Use PascalCase for interfaces, type aliases, and domain types (`HarnessConfig`, `StackLock`, `IsolationPlan`) in `src/types.ts`.
- Use string literal unions for finite identifiers and statuses in `src/types.ts`; use `interface` for object contracts and inline object types for small options.

## Code Style

- TypeScript uses double-quoted strings, semicolons, trailing commas in multiline constructs, two-space indentation, and braces for control blocks throughout `src/` and `test/`.
- No repository Prettier, ESLint, Biome, or other formatter configuration is detected. Match the hand-written style in `src/core/*.ts` and `test/*.test.ts`.
- Keep lines compact where practical; long import lists and assertions are occasionally kept on one line (for example `src/cli.ts` and `test/catalog.test.ts`).
- No standalone lint script or lint configuration is detected. Type correctness is enforced by `npm run check`, which runs `tsc -p tsconfig.json --noEmit` using strict compiler options from `tsconfig.json`.
- Preserve `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames`, and ES module settings in `tsconfig.json`.

## Import Organization

- No path aliases are configured. Use explicit relative imports with `.js` extensions from TypeScript source, as in `src/core/catalog.ts` and `test/catalog.test.ts`.

## Error Handling

- Validate inputs and invariants at the boundary, then throw `new Error(...)` with a specific operation, identifier, and often the offending value; examples include `src/cli.ts`, `src/core/catalog.ts`, and `src/core/mcp.ts`.
- Use assertion-style guards (`requireObject` in `src/core/catalog.ts`, `inside`/`requireAllowed` in `src/core/transaction.ts`) to fail closed before filesystem or external operations.
- Propagate asynchronous failures rather than silently recovering. Optional cleanup is explicitly scoped with `.catch(() => undefined)` in `src/core/transaction.ts` and fixture modules.
- Represent expected diagnostics as typed values (`DoctorFinding` from `src/types.ts`) rather than exceptions in `src/core/doctor.ts`.

## Logging

- Keep core modules return-oriented and side-effect explicit. `src/cli.ts` formats results via `format*` functions in `src/format.ts` and writes errors at the CLI boundary.
- Do not print secrets or credential values; rendering and transaction paths deliberately redact or reject them in `src/core/mcp.ts` and `src/core/paths.ts`.

## Comments

- Comments are sparse; encode behavior in names, types, and validation messages. Add comments only for non-obvious policy or safety constraints, matching the policy documentation in `CONTRIBUTING.md`.
- JSDoc/TSDoc is not detected in `src/` or `test/`. Use explicit exported types and descriptive names instead.

## Function Design

## Module Design

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI dispatcher | Parses command/flags, loads stable catalog and lock, invokes services, formats output, sets exit status | `src/cli.ts` |
| Catalog loader | Parses and minimally validates YAML catalog and JSON lock channels | `src/core/catalog.ts` |
| Install planner/orchestrator | Builds ordered dry-run actions, detects targets, runs fixtures and sequential managed installation | `src/core/plan.ts`, `src/core/install.ts` |
| Harness adapters | Detects supported CLIs/config roots and creates harness-specific isolated launch specs | `src/adapters/harnesses.ts`, `src/adapters/isolation.ts` |
| Component synchronizers | Render and transactionally apply GSD compatibility, ECC skills, owned skills, MCP, and Claude policy | `src/core/gsd-compat.ts`, `src/core/ecc-skills.ts`, `src/core/owned-skills.ts`, `src/core/mcp.ts`, `src/core/skill-policy.ts` |
| Fixture runners | Verify package integrity and credential-free/runtime behavior in temporary environments before mutation | `src/core/gsd-fixture.ts`, `src/core/ecc-fixture.ts`, `src/core/mcp-fixture.ts` |
| Isolation service | Reads project manifests, discovers allowlisted resources, creates external runtimes, and gates launches | `src/core/isolation.ts` |
| Transaction service | Snapshots bytes, atomically writes/removes owned files, journals hashes, and performs drift-safe rollback | `src/core/transaction.ts` |
| Output formatter | Converts domain results into human-readable tables/text; JSON output remains in the CLI | `src/format.ts` |
| Domain model | Defines catalog, lock, inventory, plan, isolation, and finding contracts | `src/types.ts` |

## Pattern Overview

- Treat `catalog/stack.yaml` as policy and target metadata; treat `catalog/stack.lock.json` as the stable, version/integrity-pinned input. `src/core/catalog.ts` loads both before normal commands.
- Keep mutation commands dry-run by default. `src/cli.ts` selects plan functions without `--apply` and apply functions with it.
- Route alpha-AOS-owned file writes through `applyFileTransaction` with explicit allowed roots. External package-manager changes are verified and reported separately.
- Use harness-specific adapters for command names, config roots, launch flags, and native config rendering rather than branching these rules in generic callers.
- Run isolated package fixtures before package installation or MCP registration; use `src/core/install.ts` for sequential ordering and canary enforcement.

## Layers

- Purpose: Translate argv into domain operations and presentation.
- Location: `src/cli.ts`
- Contains: Command routing for inventory, plan, install, sync, fixtures, update, project isolation, doctor, and rollback.
- Depends on: Every public core service, `src/format.ts`, and `src/types.ts`.
- Used by: The `alpha-aos` binary declared in `package.json` and `src/cli.ts`'s `main()`.
- Purpose: Define supported harnesses, components, policy, and locked versions.
- Location: `catalog/stack.yaml`, `catalog/stack.lock.json`, `catalog/candidate.lock.json`, `schemas/`.
- Contains: YAML catalog, stable/candidate locks, pack metadata, and JSON schemas.
- Depends on: YAML/JSON parsing in `src/core/catalog.ts`.
- Used by: Planning, inventory, install, fixtures, update, and doctor services.
- Purpose: Implement installation, update, project detection/isolation, rollback, and component synchronization.
- Location: `src/core/`.
- Contains: Pure-ish planners plus filesystem/process-backed apply functions.
- Depends on: `src/types.ts`, Node filesystem/process APIs, adapters, and `applyFileTransaction`.
- Used by: `src/cli.ts` and focused tests under `test/`.
- Purpose: Encapsulate harness-specific detection and launch behavior.
- Location: `src/adapters/` and integration-focused modules in `src/core/`.
- Contains: Harness probes and isolation launch construction; native MCP and skill renderers live in `src/core/mcp.ts`, `src/core/ecc-skills.ts`, and related modules.
- Depends on: Core process/path helpers and domain types.
- Used by: Inventory and isolation/install orchestration.
- Purpose: Safely persist managed state and render results.
- Location: `src/core/transaction.ts`, `src/core/paths.ts`, `src/format.ts`.
- Contains: User state root resolution, atomic writes, snapshots/journals, rollback, and text formatting.
- Depends on: Node filesystem/path APIs and domain types.
- Used by: All apply paths and CLI presentation.

## Data Flow

### Primary Install Path

### Project Isolation Flow

### Component Synchronization Flow

- Repository state is declarative and committed in `catalog/` and `skills/`.
- Machine state is discovered from harness config roots and package installations.
- Managed operational state is stored under `userStateRoot()` (normally `~/.alpha-aos`, overrideable with `ALPHA_AOS_STATE_DIR`), including journals and snapshots.
- Project isolation state is external to the project except for the reviewed `.alpha-aos/stack.yaml` manifest.

## Key Abstractions

- Purpose: Separate policy/targets from exact package versions and hashes.
- Examples: `catalog/stack.yaml`, `catalog/stack.lock.json`, `src/types.ts` (`StackCatalog`, `StackLock`).
- Pattern: Load once at CLI startup and pass explicitly into planners/apply functions.
- Purpose: Make alpha-AOS-owned writes reversible and bounded.
- Examples: `src/core/transaction.ts`, callers in `src/core/mcp.ts` and `src/core/isolation.ts`.
- Pattern: Supply `stateRoot`, `allowedRoots`, and a list of `{target, content}` operations; rely on hash-checked rollback.
- Purpose: Normalize five harness targets while retaining native behavior.
- Examples: `src/types.ts` (`HarnessId`), `src/adapters/harnesses.ts`, `src/adapters/isolation.ts`.
- Pattern: Add target metadata to the catalog and extend explicit adapter command/config mappings before adding orchestration branches.
- Purpose: Make changes inspectable and approval-gated.
- Examples: `planMcpSync`/`applyMcpSync` in `src/core/mcp.ts`, `planEccSkillSync`/`applyEccSkillSync` in `src/core/ecc-skills.ts`.
- Pattern: Keep plan output free of secret values; apply must verify the same locked inputs and journal owned writes.

## Entry Points

- Location: `src/cli.ts` (compiled to `dist/src/cli.js`, exposed by `package.json`).
- Triggers: `alpha-aos <command>` or `npm start`.
- Responsibilities: Command parsing, catalog loading, dry-run/apply branching, error-to-exit-code conversion.
- Location: `package.json`, `scripts/install.ps1`, `scripts/install.sh`, `scripts/update.ps1`, `scripts/update.sh`.
- Triggers: npm build/check/test or platform bootstrap/update commands.
- Responsibilities: Build the TypeScript CLI and invoke platform-specific setup/update workflows.

## Architectural Constraints

- **Threading:** Node event loop with async filesystem/process operations; managed installation deliberately executes target installers sequentially in `src/core/install.ts`.
- **Global state:** User-wide harness roots and `userStateRoot()` are external mutable state; transaction journals under `~/.alpha-aos/journal/` are the recovery record.
- **Circular imports:** No intentional circular dependency chain is detected; keep adapters dependent on core utilities/types, not on CLI dispatch.
- **Configuration ownership:** Do not patch third-party managed files directly; render only native config fragments or alpha-AOS-owned skill/policy files and route writes through transactions.
- **Security boundary:** `sealed` isolation requires a container/OS adapter and fails closed in `src/adapters/isolation.ts`; it must not silently use process isolation.

## Anti-Patterns

### Applying an unverified candidate lock

### Directly mutating harness files

## Error Handling

- Validate catalog/lock schemas and CLI enum values before mutation (`src/core/catalog.ts`, `src/cli.ts`).
- Fail closed on missing executables, untrusted manifests, policy violations, integrity mismatches, and rollback drift (`src/core/isolation.ts`, `src/core/transaction.ts`).
- Mark journals failed and attempt reverse rollback when a transaction operation throws (`src/core/transaction.ts`).

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `$gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `$gsd-debug` for investigation and bug fixing
- `$gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `$gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
