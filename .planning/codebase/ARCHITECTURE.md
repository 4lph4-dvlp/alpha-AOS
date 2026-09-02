---
last_mapped_commit: f1ce41504ea94b699e71670d8cf9f6c0b02c9c34
last_mapped_at: 2026-09-02
---
<!-- refreshed: 2026-09-02 -->

# Architecture

**Analysis Date:** 2026-09-02

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                         CLI command layer                    │
│                         `src/cli.ts`                         │
├──────────────────┬──────────────────┬───────────────────────┤
│ Catalog/config    │ Install/update    │ Project/isolation     │
│ `src/core/        │ `src/core/        │ `src/core/            │
│ catalog.ts`       │ install.ts`       │ isolation.ts`         │
│                   │ `src/core/plan.ts`│ `src/core/project.ts` │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Core domain services and harness/external adapters            │
│ `src/core/*.ts`, `src/adapters/*.ts`                         │
│ planning, fixtures, MCP/skills, process and path utilities    │
└─────────────────────────────┬───────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Catalog/lock files, harness configuration, and user state     │
│ `catalog/`, native config roots, `~/.alpha-aos/` journals      │
└─────────────────────────────────────────────────────────────┘
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

**Overall:** Declarative catalog/lock-driven CLI with plan/apply separation, adapter boundaries, fixture gates, and journaled filesystem transactions.

**Key Characteristics:**

- Treat `catalog/stack.yaml` as policy and target metadata; treat `catalog/stack.lock.json` as the stable, version/integrity-pinned input. `src/core/catalog.ts` loads both before normal commands.
- Keep mutation commands dry-run by default. `src/cli.ts` selects plan functions without `--apply` and apply functions with it.
- Route alpha-AOS-owned file writes through `applyFileTransaction` with explicit allowed roots. External package-manager changes are verified and reported separately.
- Use harness-specific adapters for command names, config roots, launch flags, and native config rendering rather than branching these rules in generic callers.
- Run isolated package fixtures before package installation or MCP registration; use `src/core/install.ts` for sequential ordering and canary enforcement.

## Layers

**Command layer:**

- Purpose: Translate argv into domain operations and presentation.
- Location: `src/cli.ts`
- Contains: Command routing for inventory, plan, install, sync, fixtures, update, project isolation, doctor, and rollback.
- Depends on: Every public core service, `src/format.ts`, and `src/types.ts`.
- Used by: The `alpha-aos` binary declared in `package.json` and `src/cli.ts`'s `main()`.

**Declarative input layer:**

- Purpose: Define supported harnesses, components, policy, and locked versions.
- Location: `catalog/stack.yaml`, `catalog/stack.lock.json`, `catalog/candidate.lock.json`, `schemas/`.
- Contains: YAML catalog, stable/candidate locks, pack metadata, and JSON schemas.
- Depends on: YAML/JSON parsing in `src/core/catalog.ts`.
- Used by: Planning, inventory, install, fixtures, update, and doctor services.

**Core orchestration layer:**

- Purpose: Implement installation, update, project detection/isolation, rollback, and component synchronization.
- Location: `src/core/`.
- Contains: Pure-ish planners plus filesystem/process-backed apply functions.
- Depends on: `src/types.ts`, Node filesystem/process APIs, adapters, and `applyFileTransaction`.
- Used by: `src/cli.ts` and focused tests under `test/`.

**Adapter/integration layer:**

- Purpose: Encapsulate harness-specific detection and launch behavior.
- Location: `src/adapters/` and integration-focused modules in `src/core/`.
- Contains: Harness probes and isolation launch construction; native MCP and skill renderers live in `src/core/mcp.ts`, `src/core/ecc-skills.ts`, and related modules.
- Depends on: Core process/path helpers and domain types.
- Used by: Inventory and isolation/install orchestration.

**Persistence/output layer:**

- Purpose: Safely persist managed state and render results.
- Location: `src/core/transaction.ts`, `src/core/paths.ts`, `src/format.ts`.
- Contains: User state root resolution, atomic writes, snapshots/journals, rollback, and text formatting.
- Depends on: Node filesystem/path APIs and domain types.
- Used by: All apply paths and CLI presentation.

## Data Flow

### Primary Install Path

1. `src/cli.ts` resolves `packageRoot()`, then loads `catalog/stack.yaml` and `catalog/stack.lock.json` through `src/core/catalog.ts`.
2. `src/core/inventory.ts` probes supported harnesses via `src/adapters/harnesses.ts` and records tool versions/config roots.
3. `src/core/install.ts` validates Node/npm/git, selects detected or explicitly requested targets, and builds a managed plan from locked component state.
4. With `--apply`, `src/core/install.ts` runs GSD, ECC, and Pi external fixtures/installers sequentially, then applies alpha-AOS-owned skill, hook, MCP, and policy transactions.
5. `src/core/transaction.ts` snapshots and journals each managed write; post-apply plans re-read state for verification. `src/format.ts` or JSON serialization emits the result.

### Project Isolation Flow

1. `src/cli.ts` dispatches `project isolate` to `src/core/isolation.ts`; initialization renders `.alpha-aos/stack.yaml` under the project.
2. `readProjectManifest()` validates policy shape, allowed harnesses, inheritance flags, and sealed-mode constraints.
3. `createIsolationPlan()` hashes the canonical project path into an ID, discovers project skill/MCP resources, and delegates per-harness launch construction to `src/adapters/isolation.ts`.
4. `syncIsolationRuntime()` writes marked runtime files under `~/.alpha-aos/isolated/<project-id>/` using a transaction.
5. `selectIsolationLaunch()` fails if untrusted, unsynced, disallowed, unavailable, or sealed-without-container conditions remain; `src/core/process.ts` launches only after `--apply`.

### Component Synchronization Flow

1. A component planner compares native target files and hashes against the stable lock (`src/core/ecc-skills.ts`, `src/core/mcp.ts`, `src/core/skill-policy.ts`).
2. Renderers preserve/merge native configuration where supported and inject only locked component data (`src/core/mcp.ts`, `src/core/skill-policy.ts`).
3. Apply functions pass operations and adapter-owned roots to `src/core/transaction.ts`.
4. Rollback verifies every post-transaction hash before restoring snapshots, preventing overwrite of later user edits.

**State Management:**

- Repository state is declarative and committed in `catalog/` and `skills/`.
- Machine state is discovered from harness config roots and package installations.
- Managed operational state is stored under `userStateRoot()` (normally `~/.alpha-aos`, overrideable with `ALPHA_AOS_STATE_DIR`), including journals and snapshots.
- Project isolation state is external to the project except for the reviewed `.alpha-aos/stack.yaml` manifest.

## Key Abstractions

**Stack catalog and lock:**

- Purpose: Separate policy/targets from exact package versions and hashes.
- Examples: `catalog/stack.yaml`, `catalog/stack.lock.json`, `src/types.ts` (`StackCatalog`, `StackLock`).
- Pattern: Load once at CLI startup and pass explicitly into planners/apply functions.

**Managed file transaction:**

- Purpose: Make alpha-AOS-owned writes reversible and bounded.
- Examples: `src/core/transaction.ts`, callers in `src/core/mcp.ts` and `src/core/isolation.ts`.
- Pattern: Supply `stateRoot`, `allowedRoots`, and a list of `{target, content}` operations; rely on hash-checked rollback.

**Harness ID and adapter:**

- Purpose: Normalize five harness targets while retaining native behavior.
- Examples: `src/types.ts` (`HarnessId`), `src/adapters/harnesses.ts`, `src/adapters/isolation.ts`.
- Pattern: Add target metadata to the catalog and extend explicit adapter command/config mappings before adding orchestration branches.

**Plan/apply pair:**

- Purpose: Make changes inspectable and approval-gated.
- Examples: `planMcpSync`/`applyMcpSync` in `src/core/mcp.ts`, `planEccSkillSync`/`applyEccSkillSync` in `src/core/ecc-skills.ts`.
- Pattern: Keep plan output free of secret values; apply must verify the same locked inputs and journal owned writes.

## Entry Points

**Installed CLI:**

- Location: `src/cli.ts` (compiled to `dist/src/cli.js`, exposed by `package.json`).
- Triggers: `alpha-aos <command>` or `npm start`.
- Responsibilities: Command parsing, catalog loading, dry-run/apply branching, error-to-exit-code conversion.

**Development scripts:**

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

**What happens:** An implementation uses `catalog/candidate.lock.json` as an end-user install source.
**Why it's wrong:** Candidate versions have not passed the fixture/matrix gate and stable installs are required to use `catalog/stack.lock.json`.
**Do this instead:** Keep candidate resolution/staging in `src/core/update.ts` and apply only the stable lock through `src/core/install.ts`.

### Directly mutating harness files

**What happens:** A component writes a native config or skill file without an allowed-root transaction.
**Why it's wrong:** It loses snapshots, drift detection, rollback, and the managed-write boundary.
**Do this instead:** Expose a plan/apply pair and call `applyFileTransaction` as done in `src/core/mcp.ts` and `src/core/skill-policy.ts`.

## Error Handling

**Strategy:** Synchronous validation throws descriptive `Error` messages; the top-level `main().catch()` in `src/cli.ts` prints `alpha-aos: ...` and exits with status 2. Doctor-style checks return typed findings and set a nonzero status when errors exist.

**Patterns:**

- Validate catalog/lock schemas and CLI enum values before mutation (`src/core/catalog.ts`, `src/cli.ts`).
- Fail closed on missing executables, untrusted manifests, policy violations, integrity mismatches, and rollback drift (`src/core/isolation.ts`, `src/core/transaction.ts`).
- Mark journals failed and attempt reverse rollback when a transaction operation throws (`src/core/transaction.ts`).

## Cross-Cutting Concerns

**Logging:** User-facing status is returned through `src/format.ts` and CLI messages; subprocess output is captured by `src/core/process.ts` and included only in errors/results.
**Validation:** Structural checks are in `src/core/catalog.ts`, `src/core/isolation.ts`, and command-specific argument validation in `src/cli.ts`; integrity uses SHA-256 in fixture/transaction modules.
**Authentication:** Harness authentication is assumed pre-existing; credentials are referenced by environment-variable names in MCP config and never copied into locks, plans, fixtures, or isolated runtimes (`src/core/mcp.ts`, `src/adapters/isolation.ts`).

---

*Architecture analysis: 2026-09-02*
