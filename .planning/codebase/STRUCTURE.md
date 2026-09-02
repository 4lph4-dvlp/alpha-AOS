---
last_mapped_commit: f1ce41504ea94b699e71670d8cf9f6c0b02c9c34
last_mapped_at: 2026-09-02
---
# Codebase Structure

**Analysis Date:** 2026-09-02

## Directory Layout

```text
alpha-AOS/
├── src/                  # TypeScript CLI and domain services
│   ├── adapters/         # Harness detection and isolation launch adapters
│   ├── core/             # Catalog, planning, sync, fixtures, isolation, transactions
│   ├── cli.ts            # Executable command dispatcher
│   ├── format.ts         # Human-readable result formatting
│   └── types.ts          # Shared domain contracts
├── test/                 # Node test-runner tests for core behavior
├── catalog/              # Declarative stack catalog, locks, and component packs
│   └── packs/             # Detection/selection pack YAML files
├── schemas/              # JSON schemas for catalog, locks, manifests, and state
├── skills/               # Repository-owned skill sources
├── scripts/              # Windows PowerShell and POSIX bootstrap/update scripts
├── docs/                 # Design and stack decision/reference documents
├── dist/                 # TypeScript build output and source maps (generated)
├── package.json          # npm metadata, binary mapping, scripts, dependencies
├── tsconfig.json         # Strict NodeNext TypeScript build configuration
└── README.md             # User-facing installation and operation guide
```

## Directory Purposes

**`src/`:**

- Purpose: Application implementation compiled to `dist/`.
- Contains: CLI entrypoint, shared types/formatting, core services, and harness adapters.
- Key files: `src/cli.ts`, `src/types.ts`, `src/format.ts`.

**`src/core/`:**

- Purpose: Domain logic and side-effect orchestration.
- Contains: `catalog.ts`, `plan.ts`, `install.ts`, `update.ts`, `inventory.ts`, `doctor.ts`, process/path helpers, component synchronizers, fixtures, isolation, and transactions.
- Key files: `src/core/install.ts`, `src/core/transaction.ts`, `src/core/isolation.ts`, `src/core/mcp.ts`.

**`src/adapters/`:**

- Purpose: Keep harness-specific command/config behavior behind small interfaces.
- Contains: Harness probing in `src/adapters/harnesses.ts` and launch construction in `src/adapters/isolation.ts`.
- Key files: `src/adapters/harnesses.ts`, `src/adapters/isolation.ts`.

**`catalog/`:**

- Purpose: Declarative source of supported targets and reproducible component versions.
- Contains: `catalog/stack.yaml`, stable `catalog/stack.lock.json`, candidate `catalog/candidate.lock.json`, and pack definitions under `catalog/packs/`.
- Key files: `catalog/stack.yaml`, `catalog/stack.lock.json`.

**`schemas/`:**

- Purpose: Machine-readable schema references for repository and project configuration.
- Contains: `schemas/stack.schema.json`, `schemas/lock.schema.json`, `schemas/project-stack.schema.json`, and `schemas/install-state.schema.json`.
- Key files: `schemas/project-stack.schema.json`, `schemas/lock.schema.json`.

**`test/`:**

- Purpose: Coherent repository-level tests for exported core functions.
- Contains: Node `node:test` suites covering catalog/paths, planning/install, fixtures, MCP, project detection/isolation, policy, transactions, doctor, and updates.
- Key files: `test/install.test.ts`, `test/isolation.test.ts`, `test/transaction.test.ts`, `test/mcp.test.ts`.

**`skills/`:**

- Purpose: Sources for alpha-AOS-owned skills that are rendered to selected harness targets.
- Contains: `skills/alpha-aos-ship/SKILL.md`.
- Key files: `skills/alpha-aos-ship/SKILL.md`.

**`scripts/`:**

- Purpose: Platform bootstrap and update entrypoints around the CLI.
- Contains: `scripts/install.ps1`, `scripts/install.sh`, `scripts/update.ps1`, `scripts/update.sh`.
- Key files: `scripts/install.ps1`, `scripts/install.sh`.

**`docs/`:**

- Purpose: Design rationale and stack reference material.
- Contains: `docs/alpha-vibe-stack-codex.md` (authoritative design reference) and `docs/alpha-vibe-stack-claude.md` (archive/reference).
- Key files: `docs/alpha-vibe-stack-codex.md`.

**`dist/`:**

- Purpose: Compiled JavaScript consumed by npm scripts and the published binary.
- Contains: Mirrored `dist/src/` and `dist/test/` JavaScript plus source maps.
- Key files: `dist/src/cli.js`.
- Generated: Yes, by `npm run build`; do not hand-edit.

## Key File Locations

**Entry Points:**

- `src/cli.ts`: Main command router and executable `main()`.
- `package.json`: Maps `alpha-aos` to `dist/src/cli.js` and defines `build`, `check`, and `test`.
- `scripts/install.ps1`, `scripts/install.sh`: Platform bootstrap wrappers.

**Configuration:**

- `catalog/stack.yaml`: Harness/component policy and target metadata.
- `catalog/stack.lock.json`: Stable pinned versions/integrity hashes.
- `catalog/candidate.lock.json`: Maintainer staging lock for upstream candidates.
- `tsconfig.json`: Strict ES2024/NodeNext compiler settings.
- `schemas/project-stack.schema.json`: Project manifest contract.

**Core Logic:**

- `src/core/install.ts`: Target selection, managed plan, fixture-gated apply.
- `src/core/plan.ts`: Full declarative install action plan.
- `src/core/transaction.ts`: Atomic write/snapshot/journal/rollback boundary.
- `src/core/isolation.ts`: Project policy, runtime plan/sync/launch lifecycle.
- `src/core/mcp.ts`, `src/core/ecc-skills.ts`, `src/core/owned-skills.ts`: Native component synchronization.
- `src/adapters/harnesses.ts`, `src/adapters/isolation.ts`: Harness-specific behavior.

**Testing:**

- `test/*.test.ts`: TypeScript tests compiled into `dist/test/*.test.js` and run by `npm test`.

## Naming Conventions

**Files:**

- Use lowercase kebab-free names with one domain concept per module, e.g. `src/core/owned-skills.ts`, `src/core/mcp-fixture.ts`.
- Tests mirror the module/domain name with `.test.ts`, e.g. `test/owned-skills` behavior is covered in relevant component suites; existing suites include `test/mcp.test.ts` and `test/isolation.test.ts`.
- Repository documentation uses uppercase operational map names under `.planning/codebase/` and descriptive lowercase names under `docs/`.

**Directories:**

- Use lowercase plural/domain directories: `src/core/`, `src/adapters/`, `catalog/packs/`, `schemas/`, `skills/`, `test/`.
- Keep generated output in `dist/` mirroring source paths.

**Code symbols:**

- Use camelCase functions/variables, PascalCase interfaces/types, and string-literal unions for finite IDs in `src/types.ts`.
- Use `planX`/`applyX` pairs for changes, such as `planMcpSync` and `applyMcpSync` in `src/core/mcp.ts`.

## Where to Add New Code

**New Feature:**

- Primary code: Add domain behavior under `src/core/<feature>.ts`; expose the command branch from `src/cli.ts` only after defining typed inputs/results.
- Configuration: Add policy/target metadata to `catalog/stack.yaml`; add pinned package data to the appropriate lock in `catalog/` and update schemas if the shape changes.
- Tests: Add focused coverage in `test/<feature>.test.ts`, using temporary directories and injected roots/options for filesystem behavior.

**New Component/Module:**

- Implementation: Put cross-harness orchestration in `src/core/`; put command/config differences in `src/adapters/`; put shared contracts in `src/types.ts`.
- For mutations, provide separate plan and apply functions and use `src/core/transaction.ts` for every alpha-AOS-owned file write.

**Utilities:**

- Shared helpers: Extend `src/core/paths.ts` for path/state-root logic and `src/core/process.ts` for executable resolution/subprocess execution. Keep `src/format.ts` limited to presentation.

## Special Directories

**`.planning/`:**

- Purpose: GSD planning and generated codebase maps, including this document.
- Generated: Partly, by GSD workflows.
- Committed: Managed by the project workflow; do not place runtime state here.

**`dist/`:**

- Purpose: Build artifacts consumed by the npm binary and tests.
- Generated: Yes.
- Committed: Present in the working tree; regenerate with `npm run build` rather than hand-editing.

**`node_modules/`:**

- Purpose: Installed npm dependencies, including `yaml` and `@modelcontextprotocol/sdk`.
- Generated: Yes, by npm.
- Committed: No; excluded from source mapping and package publication.

**External user-state roots:**

- Purpose: Harness configuration and alpha-AOS journals/snapshots outside the repository.
- Generated: At runtime under harness-specific home/config roots and `~/.alpha-aos/`.
- Committed: No; never add credentials or generated runtime state to the repository.

---

*Structure analysis: 2026-09-02*
