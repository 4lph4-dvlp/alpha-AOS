# Phase 10: Three-OS CI Baseline - Pattern Map

**Mapped:** 2026-09-23
**Files analyzed:** 12
**Analogs found:** 12 / 12 (all analogs are git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/helpers/path-literal-scan.ts` (NEW) | utility (test helper) | transform (source text -> violations) | `test/helpers/upstream-gate.ts` | role-match |
| `test/path-literal-guard.test.ts` (NEW) | test (source scan) | file-I/O (read test/*.ts) | `test/process.test.ts:582-615` ("no source module spawns a child...") | exact |
| `test/owned-skills.test.ts` (EDIT 52-86) | test | transform | self; Research Pattern 1 | exact |
| `test/ecc-skills.test.ts` (EDIT 74-81) | test | transform | `test/owned-skills.test.ts` after fix | exact |
| `test/tarball-fixture.test.ts` (EDIT fingerprint/hostSnapshot 151-190) | test oracle | file-I/O | self | exact |
| `test/mcp-proxy.test.ts` (EDIT: module-scope redirect + regression test) | test | event-driven (child process) | `test/mcp-proxy.test.ts:932-972` | exact |
| `test/gate-engine.test.ts` (EDIT ~184) | test | CRUD (journal write) | `test/mcp-proxy.test.ts:941-948` save/restore env | role-match |
| `test/gate-lifecycle.test.ts` (EDIT probeEnv line 20) | test (integration, spawned CLI) | request-response | `src/core/process.ts:32-44` `EnvironmentPolicy.literal` | role-match |
| `.planning/debug/ci02-windows-alpha-aos-host-leak.md` (NEW) | doc | — | `.planning/debug/uat-safety-boundary-parallel.md` | exact |
| `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` (EDIT CI-02 wording) | doc | — | self | exact |
| `.planning/phases/10-three-os-ci-baseline/CI_RUN.md` (NEW) | doc | — | `.planning/milestones/v0.1.0-phases/07-cross-platform-release-proof/CI_RUN.md` | exact |
| `10-VERIFICATION.md` reference to CI_RUN.md | doc | — | Phase 7 verification | role-match |

## Pattern Assignments

### `test/helpers/path-literal-scan.ts` (utility, transform)

**Analog:** `test/helpers/upstream-gate.ts` (lines 1-3 header, named exports, pure functions)
```ts
// This module is NOT a test. It lives under `test/helpers` because
// `run-tests.mjs` enumerates only files directly under `dist/test`, so helper
// modules in `dist/test/helpers` are never mistaken for suites.

export const UPSTREAM_REQUIRED_ENV_NAME = "ALPHA_AOS_REQUIRE_UPSTREAM_MCP";
```
Copy: the NOT-a-test header comment, `export const` for regex constants (`ABSOLUTE`, `PATH_LITERAL_MARKER`), pure `export function scanPathLiterals(fileName, text): string[]` with no fs. Scanner body: RESEARCH.md Pattern 2 (`import ts from "typescript";`, `ts.createSourceFile`, two passes, exclude `path.win32`/`path.posix`, marker `// path-literal-ok: <reason>`).

### `test/path-literal-guard.test.ts` (test, file-I/O source scan)

**Analog:** `test/process.test.ts:582-615`
```ts
test("no source module spawns a child outside the process adapter", async () => {
  const sources = await readdir(join(repositoryRoot, "src", "core"));
  const files = [
    ...sources.filter((name) => name.endsWith(".ts")).map((name) => join("src", "core", name)),
    ...
  ];
  assert.ok(
    files.includes(join("src", "core", "mcp-fixture.ts")),
    "the MCP fixture must stay inside the enumeration rather than be dropped from it",
  );
  for (const relativePath of files) {
    const source = await readFile(join(repositoryRoot, relativePath), "utf8");
    assert.equal(/.../u.test(source), false, `${relativePath} spawns a child directly ...`);
```
Copy: enumerate with `readdir(join(repositoryRoot, "test"))`, self-inclusion assertion (guard file itself must be in the enumeration — Pitfall 1), and a message naming every violation. `repositoryRoot` computed as in `test/tarball-fixture.test.ts:40`:
```ts
const repositoryRoot = resolve(import.meta.dirname, "..", "..");
```
Imports convention (from `test/owned-skills.test.ts:1-7`): `import assert from "node:assert/strict";` ... `import test from "node:test";`, relative `../` imports with `.js` (helper: `./helpers/path-literal-scan.js`). Self-tests keep sample sources inside outer string/template literals.

### `test/owned-skills.test.ts` (EDIT lines 52-86)

**Current defect** (lines 53, 59-65, 69/77/85):
```ts
const custom = "C:\\test\\custom-root";
const fakeHome = "C:\\Users\\fakeuser";
const fakeEnv: NodeJS.ProcessEnv = { CLAUDE_CONFIG_DIR: "C:\\env\\claude", ... };
join("C:\\env\\claude", "skills", "test-skill", "SKILL.md"),
```
Replace with RESEARCH.md Pattern 1: `const base = join(tmpdir(), "alpha-aos-destination-fixture");` plus named consts (`claudeRoot`, `codexRoot`, `geminiRoot`, `hermesRoot`) used both in `fakeEnv` and in expected `join(...)` (avoid `!` under `noUncheckedIndexedAccess`). `tmpdir` and `join` are already imported (lines 5-6). Strings only; nothing created (D-11).

### `test/ecc-skills.test.ts` (EDIT lines 74-81)

Same conversion. Current:
```ts
const home = "C:\\Users\\fixture";
assert.equal(globalEccSkillRoot("claude", { CLAUDE_CONFIG_DIR: "C:\\profiles\\claude" }, home), join("C:\\profiles\\claude", "skills"));
```
Also convert `C:\\profiles\\codex`/`pi` for consistency (guard flags claude/antigravity/home; codex/pi are inputs but trivially converted). Verify `tmpdir` import exists.

### `test/tarball-fixture.test.ts` (EDIT fingerprint, D-05)

**Analog:** self, lines 151-190
```ts
async function fingerprint(path: string): Promise<string> {
  if (!existsSync(path)) return "absent";
  const hash = createHash("sha256");
  const visit = async (current: string, relativePath: string): Promise<void> => {
    const info = await lstat(current);
    if (info.isSymbolicLink()) { hash.update(`link:${relativePath}:${await readlink(current)}\n`); return; }
    if (info.isDirectory()) {
      hash.update(`dir:${relativePath}\n`);
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        await visit(join(current, entry.name), relativePath ? `${relativePath}/${entry.name}` : entry.name);
      }
      return;
    }
    hash.update(`file:${relativePath}:${info.size}\n`);
    if (info.size <= 1024 * 1024) hash.update(await readFile(current));
  };
  ...
}
const hostMutationTargets = [ hostStateRoot, join(hostCodexRoot, "AGENTS.md"), ... ];  // UNCHANGED
async function hostSnapshot(): Promise<Map<string, string>> { ... }
```
Rules: keep aggregate digest byte stream identical so `Map<path, digest>` and the `assert.deepEqual` at ~line 547 are unchanged; additionally collect `{path, kind, size, sha256|null}` manifest, bounded diff (first ~50 + totals) in the message; `ENOENT` mid-walk -> `vanished` entry, other errors propagate; never print contents. `hostMutationTargets` must not change (D-02/D-04). Add a unit test feeding two synthetic `mkdtemp` trees.

### `test/mcp-proxy.test.ts` (EDIT, D-02)

**Analog:** self, lines 941-948 (env save/restore) and 962-970 (positive-location assertion)
```ts
const previousStateDir = process.env.ALPHA_AOS_STATE_DIR;
process.env.ALPHA_AOS_STATE_DIR = syntheticState;
context.after(() => {
  if (previousStateDir === undefined) delete process.env.ALPHA_AOS_STATE_DIR;
  else process.env.ALPHA_AOS_STATE_DIR = previousStateDir;
});
...
const cacheEntries = await readdir(expectedProxyCacheRoot(syntheticState)).catch(() => [] as string[]);
assert.ok(cacheEntries.length > 0, "the pinned cache root received nothing, ...");
```
New: module-scope redirect before any `upstreamEnvironmentPolicy()` call (RESEARCH Pattern 3), stable `join(tmpdir(), "alpha-aos-test-mcp-proxy-state")`. Regression test asserts positively that `upstreamEnvironmentPolicy(...)`'s `npm_config_cache` is under the test state root and not under `hostStateRootAtLoad` (deterministic, no network). Do NOT assert host unchanged (racy).

### `test/gate-engine.test.ts` (EDIT ~line 184)

Current: `const written = await writeGateReceipt(root, receipt);` (no redirect). Apply the save/restore env pattern above with `join(root, "state")`, then assert `written.transactionId` journal exists under `join(root, "state", "journal")`.

### `test/gate-lifecycle.test.ts` (EDIT line 20)

Current: `const probeEnv = commandProbeEnvironment({ source: process.env });` — `commandProbeEnvironment` (`src/core/process.ts:922-958`) does not pass `ALPHA_AOS_STATE_DIR`. Add per-scratch-root env:
```ts
function gateEnvironment(root: string): EnvironmentPolicy {
  return { ...probeEnv, literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: join(root, "state") } };
}
```
Scratch root from existing `scratchRoot(context, label)` (lines 22-28). Assert journal lands in `join(root, "state", "journal")`.

### `.planning/debug/ci02-windows-alpha-aos-host-leak.md` (NEW)

**Analog:** `.planning/debug/uat-safety-boundary-parallel.md` — YAML front matter (`status`, `trigger`, `created`, `updated`), then `## Resolution (date)`, then `## Current Focus`, RC-n labeled findings, closing CI run id evidence. Include classification (class 3), per-entry diff, onset table (RESEARCH Finding 6), RED observation (D-08), follow-ups (writeGateReceipt stateRoot option, upstreamEnvironmentPolicy ambient env, capability-oracle).

### `.planning/phases/10-three-os-ci-baseline/CI_RUN.md` (NEW)

**Analog:** Phase 7 `CI_RUN.md` — `## 1. Run Metadata` table (Run ID, URL, Workflow File, Trigger `push`, Commit SHA, Branch, Status) + matrix job table (Job Name, Platform, Job ID, Result). Add `Attempt` row (D-13). Values from `gh run view <id> --json databaseId,attempt,headSha,event,conclusion,url,jobs`.

## Shared Patterns

### Env redirect with restore
**Source:** `test/mcp-proxy.test.ts:941-948` — apply to gate-engine and any per-test redirect.

### Scratch root lifecycle
**Source:** `test/gate-lifecycle.test.ts:22-28`
```ts
const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
context.after(async () => { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); });
```

### Host state root resolution (for "not the host" comparisons)
**Source:** `test/tarball-fixture.test.ts:42-43`
```ts
const hostHome = homedir();
const hostStateRoot = resolve(process.env.ALPHA_AOS_STATE_DIR?.trim() || join(hostHome, ".alpha-aos"));
```

### Forbidden
- No `ALPHA_AOS_STATE_DIR` in `.github/workflows/ci.yml`; no fixture serialization; no change to `hostMutationTargets` or the `assert.deepEqual` verdict; never delete real `~/.alpha-aos`.

## No Analog Found

None. The TS compiler API usage in the scanner has no in-repo precedent; use RESEARCH.md Pattern 2.

## Metadata

**Analog search scope:** `test/`, `test/helpers/`, `src/core/`, `.planning/debug/`, `.planning/milestones/v0.1.0-phases/07-*`
**Files scanned:** 10
**Pattern extraction date:** 2026-09-23
