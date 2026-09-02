---
last_mapped_commit: f1ce41504ea94b699e71670d8cf9f6c0b02c9c34
last_mapped_at: 2026-09-02
---
# Coding Conventions

**Analysis Date:** 2026-09-02

## Naming Patterns

**Files:**

- TypeScript modules use lowercase kebab-free names such as `src/format.ts`, `src/cli.ts`, and `src/core/owned-skills.ts`; tests use the subject name plus `.test.ts`, for example `test/skill-policy.test.ts`.

**Functions:**

- Use camelCase for functions, with action-oriented names such as `loadCatalog`, `createInstallPlan`, `planMcpSync`, and `applyFileTransaction` in `src/core/catalog.ts`, `src/core/plan.ts`, `src/core/mcp.ts`, and `src/core/transaction.ts`.
- Prefer named exported functions for module APIs and local unexported helpers for parsing, validation, hashing, path checks, and rendering.

**Variables:**

- Use camelCase for locals and parameters (`configRoot`, `stateRoot`, `allowedRoots`); use descriptive nouns for paths and domain values.
- Use `UPPER_SNAKE_CASE` for module constants such as `HELP` in `src/cli.ts`; immutable domain lists are commonly lower camelCase (`managedSkills` in `src/core/skill-policy.ts`).

**Types:**

- Use PascalCase for interfaces, type aliases, and domain types (`HarnessConfig`, `StackLock`, `IsolationPlan`) in `src/types.ts`.
- Use string literal unions for finite identifiers and statuses in `src/types.ts`; use `interface` for object contracts and inline object types for small options.

## Code Style

**Formatting:**

- TypeScript uses double-quoted strings, semicolons, trailing commas in multiline constructs, two-space indentation, and braces for control blocks throughout `src/` and `test/`.
- No repository Prettier, ESLint, Biome, or other formatter configuration is detected. Match the hand-written style in `src/core/*.ts` and `test/*.test.ts`.
- Keep lines compact where practical; long import lists and assertions are occasionally kept on one line (for example `src/cli.ts` and `test/catalog.test.ts`).

**Linting:**

- No standalone lint script or lint configuration is detected. Type correctness is enforced by `npm run check`, which runs `tsc -p tsconfig.json --noEmit` using strict compiler options from `tsconfig.json`.
- Preserve `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames`, and ES module settings in `tsconfig.json`.

## Import Organization

**Order:**

1. Node built-ins (`node:fs`, `node:path`, `node:test`, etc.).
2. External packages such as `yaml` and `@modelcontextprotocol/sdk`.
3. Relative project modules, with type-only imports explicitly marked using `import type`.

**Path Aliases:**

- No path aliases are configured. Use explicit relative imports with `.js` extensions from TypeScript source, as in `src/core/catalog.ts` and `test/catalog.test.ts`.

## Error Handling

**Patterns:**

- Validate inputs and invariants at the boundary, then throw `new Error(...)` with a specific operation, identifier, and often the offending value; examples include `src/cli.ts`, `src/core/catalog.ts`, and `src/core/mcp.ts`.
- Use assertion-style guards (`requireObject` in `src/core/catalog.ts`, `inside`/`requireAllowed` in `src/core/transaction.ts`) to fail closed before filesystem or external operations.
- Propagate asynchronous failures rather than silently recovering. Optional cleanup is explicitly scoped with `.catch(() => undefined)` in `src/core/transaction.ts` and fixture modules.
- Represent expected diagnostics as typed values (`DoctorFinding` from `src/types.ts`) rather than exceptions in `src/core/doctor.ts`.

## Logging

**Framework:** console output through CLI formatting; no logging framework is detected.

**Patterns:**

- Keep core modules return-oriented and side-effect explicit. `src/cli.ts` formats results via `format*` functions in `src/format.ts` and writes errors at the CLI boundary.
- Do not print secrets or credential values; rendering and transaction paths deliberately redact or reject them in `src/core/mcp.ts` and `src/core/paths.ts`.

## Comments

**When to Comment:**

- Comments are sparse; encode behavior in names, types, and validation messages. Add comments only for non-obvious policy or safety constraints, matching the policy documentation in `CONTRIBUTING.md`.

**JSDoc/TSDoc:**

- JSDoc/TSDoc is not detected in `src/` or `test/`. Use explicit exported types and descriptive names instead.

## Function Design

**Size:** Keep functions focused on one operation. Larger orchestration functions exist in `src/cli.ts`, `src/core/install.ts`, `src/core/isolation.ts`, and `src/core/mcp.ts`; preserve their decomposition into named planning, rendering, and apply helpers.

**Parameters:** Prefer an options object for multi-part operations (`applyFileTransaction` in `src/core/transaction.ts`, sync functions in `src/core/mcp.ts`) and positional arguments for small pure helpers.

**Return Values:** Annotate exported function return types, including `Promise<...>` for async APIs. Use `null` for unavailable/current-no-op states and discriminated typed objects for plans and findings, as in `src/core/transaction.ts` and `src/types.ts`.

## Module Design

**Exports:** Export the public functions and types directly from their owning module; avoid default exports in `src/` and `test/` except the Node test import (`test` from `node:test`).

**Barrel Files:** No barrel/index files are detected. Import directly from `src/core/<module>.js`, `src/adapters/<module>.js`, or `src/types.js`.

---

*Convention analysis: 2026-09-02*
