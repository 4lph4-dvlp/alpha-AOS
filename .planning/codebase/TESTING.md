---
last_mapped_commit: f1ce41504ea94b699e71670d8cf9f6c0b02c9c34
last_mapped_at: 2026-09-02
---
# Testing Patterns

**Analysis Date:** 2026-09-02

## Test Framework

**Runner:**

- Node.js built-in `node:test` runner, compiled from TypeScript; tests are in `test/*.test.ts` and emitted to `dist/test/*.test.js` by `tsconfig.json`.
- Config: `package.json` scripts and `tsconfig.json`; no Jest, Vitest, or separate test config is detected.

**Assertion Library:**

- Node strict assertions via `node:assert/strict`, using `assert.equal`, `deepEqual`, `ok`, `match`, `doesNotMatch`, `throws`, and `rejects`.

**Run Commands:**

```bash
npm test                 # Build with tsc, then run all dist/test/*.test.js
npm run check            # Type-check without emitting
npm run build            # Compile src and test TypeScript into dist/
```

## Test File Organization

**Location:**

- Tests are separate from implementation under `test/`, grouped by core capability: `test/catalog.test.ts`, `test/transaction.test.ts`, `test/isolation.test.ts`, and similar.

**Naming:**

- Use `<module>.test.ts`, matching the primary implementation module or feature (`test/mcp.test.ts` covers `src/core/mcp.ts` and its proxy; `test/gsd-compat.test.ts` covers compatibility behavior).

**Structure:**

```text
test/
├── catalog.test.ts
├── doctor.test.ts
├── ecc-skills.test.ts
├── gsd-compat.test.ts
├── install.test.ts
├── isolation.test.ts
├── mcp.test.ts
├── paths.test.ts
├── project.test.ts
├── skill-policy.test.ts
├── transaction.test.ts
└── update.test.ts
```

## Test Structure

**Suite Organization:**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

test("describes one observable behavior", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-feature-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  assert.equal(result, expected);
});
```

**Patterns:**

- Tests are flat top-level `test(...)` cases; suites and `describe` blocks are not detected.
- Temporary filesystem fixtures use `mkdtemp(join(tmpdir(), "alpha-aos-..."))` and register cleanup with `context.after`, as in `test/isolation.test.ts`, `test/mcp.test.ts`, and `test/transaction.test.ts`.
- Prefer behavior and invariant assertions over snapshots: exact structures use `deepEqual`, scalar state uses `equal`, rendered text uses `match`/`doesNotMatch`, and expected failures use `throws`/`rejects`.

## Mocking

**Framework:** No mocking framework or spy library is detected.

**Patterns:**

```typescript
const inventory: Inventory = {
  schemaVersion: 1,
  generatedAt: new Date(0).toISOString(),
  platform: process.platform,
  architecture: process.arch,
  tools: { node: { version: "v24.0.0", command: "node" }, npm: { version: "10.0.0", command: "npm" }, git: { version: "2.0.0", command: "git" } },
  harnesses: [...],
};
```

**What to Mock:**

- Construct plain typed fixtures and synthetic directories rather than mocking modules or network calls; examples are `inventory()` in `test/install.test.ts` and `fixture()` in `test/isolation.test.ts`.

**What NOT to Mock:**

- Exercise real parsing, rendering, hashing, transactional filesystem writes, and subprocess-adjacent fixture behavior. Tests in `test/mcp.test.ts` and `test/transaction.test.ts` verify actual bytes and idempotence.

## Fixtures and Factories

**Test Data:**

```typescript
async function fixture(context: test.TestContext): Promise<{ root: string; project: string; state: string }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-isolation-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const project = join(root, "project");
  const state = join(root, "state");
  await mkdir(project);
  return { root, project, state };
}
```

**Location:**

- Small factories live at the top of their owning test file (`seed` in `test/mcp.test.ts`, `lock` in `test/update.test.ts`, and `inventory` in `test/install.test.ts`). Shared fixture modules are not detected.

## Coverage

**Requirements:** No coverage threshold, coverage script, or coverage configuration is detected. The current suite contains 38 passing tests across 12 files when run with `npm test` on 2026-09-02.

**View Coverage:** Not applicable; no coverage command is configured.

## Test Types

**Unit Tests:**

- Pure policy, path, formatting, catalog, detector, and plan logic is tested directly in `test/paths.test.ts`, `test/update.test.ts`, `test/project.test.ts`, `test/catalog.test.ts`, and `test/doctor.test.ts`.

**Integration Tests:**

- Filesystem-backed integration tests verify config merge, transactions, rollback, isolation runtimes, and fixture workflows in `test/mcp.test.ts`, `test/transaction.test.ts`, `test/isolation.test.ts`, `test/gsd-compat.test.ts`, and `test/skill-policy.test.ts`.

**E2E Tests:**

- No browser or dedicated E2E framework is used. The closest end-to-end checks are CLI-adjacent fixture and subprocess flows in `src/core/*-fixture.ts`, exercised by `test/gsd-compat.test.ts` and `test/isolation.test.ts`.

## Common Patterns

**Async Testing:**

```typescript
test("rejects an unsafe operation", async () => {
  await assert.rejects(
    () => operation(options),
    /outside allowed roots/u,
  );
});
```

**Error Testing:**

- Match stable error text with a regular expression and the `u` flag, for example `assert.throws(() => selectInstallTargets(...), /not installed or configured/u)` in `test/install.test.ts` and `assert.rejects(...)` in `test/transaction.test.ts`.
- Verify safety boundaries explicitly: secret non-disclosure in `test/mcp.test.ts`, fail-closed isolation in `test/isolation.test.ts`, and post-edit rollback refusal in `test/transaction.test.ts`.

---

*Testing analysis: 2026-09-02*
