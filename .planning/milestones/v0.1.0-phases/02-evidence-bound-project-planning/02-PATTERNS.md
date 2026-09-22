# Phase 2: Evidence-Bound Project Planning - Pattern Map

**Mapped:** 2026-09-07
**Files analyzed:** 21 (12 new, 9 modified)
**Analogs found:** 20 / 21

All analog paths below were verified git-tracked with `git ls-files -- <path>`. No install/runtime mirror paths appear in this document.

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `src/core/pack-catalog.ts` | new | service (strict loader) | file-I/O → validated value | `src/core/catalog.ts` | exact |
| `src/core/evidence.ts` | new | service (collector) | file-I/O → transform | `src/core/isolation.ts` (`discoverSkillPaths`, `isolationProjectId`) + `src/core/path-boundary.ts` | role-match |
| `src/core/project-plan.ts` | new | service (plan/apply pair) | request-response + transform | `src/core/ecc-skills.ts` | exact |
| `src/core/ignore-list.ts` | new | utility | transform (pure predicate) | `src/core/paths.ts` / `inside()` in `src/core/ecc-skills.ts:44-47` | partial |
| `src/core/project.ts` | modified | service | CRUD → replaced by predicate engine | itself (`inspectProjectManifest`, lines 149-173, is the surviving half) | exact |
| `src/core/ecc-fixture.ts` | modified | service (integrity-checked acquisition) | `npm pack` → verify integrity → hash | itself (`runEccFixture`, `createEccFixtureOperationPlan`; the change is an optional caller-supplied skill list defaulting to today's tuple) | exact |
| `src/core/validation.ts` | modified | validator registry | transform | itself (`ManagedDocumentKind` / `OWNED_SUBTREE` / `CORE_SCHEMAS` triple) | exact |
| `src/cli.ts` (`project plan` / `approve` / `status`) | modified | controller | request-response | `src/cli.ts:587-603` `repair` branch | exact |
| `src/format.ts` (`formatProjectPlan`) | modified | view/formatter | transform | `src/format.ts:37-39` `formatProject` | exact |
| `src/types.ts` | modified | model | — | existing `ProjectDetection` / `StackLock` shapes | exact |
| `schemas/pack-catalog.schema.json` | new | config (schema) | — | `schemas/stack.schema.json`, `schemas/evidence.schema.json` | exact |
| `schemas/fact-vocabulary.schema.json` | new | config (schema) | — | same | exact |
| `schemas/project-stack.schema.json` | modified | config (schema) | — | itself | exact |
| `catalog/facts.yaml` | new | config (data) | — | `catalog/packs/web.yaml` + `catalog/stack.yaml` | role-match |
| `catalog/stack.lock.json` | modified | config (lock) | — | itself (`components.ecc.sourceSha256`) | exact |
| `scripts/pin-pack-skills.mjs` | new | script (maintainer) | batch | `scripts/build-artifact.mjs` | role-match |
| `test/evidence.test.ts` | new | test | — | `test/path-boundary.test.ts` (real fixture, skip-aware) | exact |
| `test/pack-catalog.test.ts` | new | test | — | `test/catalog.test.ts` | exact |
| `test/project-plan.test.ts` | new | test | — | `test/project.test.ts` + `test/catalog.test.ts` | exact |
| `test/helpers/git-fixture.ts` | new | test helper | — | `test/helpers/termination-oracle.ts` | role-match |
| `test/project.test.ts` | modified | test | — | itself | exact |
| `test/preview.test.ts` | modified | test | — | itself (`PREVIEW_INVOCATIONS`, line 247) | exact |
| `test/ecc-skills.test.ts` | modified | test | — | itself (the existing global-sync-plan assertions; new cases are the count-and-ids anti-regression net) | exact |
| `test/catalog.test.ts` | modified | test | — | itself (the `packageRoot()` real-file style and the literal-digest assertion at line 26) | exact |

---

## Pattern Assignments

### `src/core/pack-catalog.ts` (service, strict loader)

**Analog:** `src/core/catalog.ts` — copy its shape wholesale. It is the only existing strict, schema-from-disk, domain-invariant loader.

**Imports pattern** (`src/core/catalog.ts:1-10`) — note `.js` extensions on relative imports, no aliases:

```typescript
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Channel, StackCatalog, StackLock } from "../types.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type MigrationPlan,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";
```

**Error type + schema-from-disk pattern** (`src/core/catalog.ts:12-35`) — reuse `ManagedDocumentError` by importing it rather than defining a second refusal class:

```typescript
export class ManagedDocumentError extends Error {
  readonly issues: readonly ValidationIssue[];
  readonly status: ValidationResult["status"];
  readonly migration: MigrationPlan | null;

  constructor(label: string, result: ValidationResult, migration: MigrationPlan | null = null) {
    const first = result.issues[0];
    const detail = first === undefined ? result.status : `${first.code} at ${first.documentPath} (${first.expected})`;
    super(`${label} was rejected: ${detail}`);
    ...
  }
}

let stackSchema: Record<string, unknown> | null = null;

/** Schemas are read from disk so `schemas/*.json` is the single source of truth. */
async function loadSchema(root: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, "schemas", name), "utf8")) as Record<string, unknown>;
}
```

**Core load pattern** (`src/core/catalog.ts:141-157`) — the exact body to mirror for `loadPackCatalogStrict` / `loadFactVocabularyStrict`:

```typescript
export async function loadCatalogStrict(root: string): Promise<StrictLoadResult<StackCatalog>> {
  stackSchema ??= await loadSchema(root, "stack.schema.json");
  const text = await readFile(join(root, "catalog", "stack.yaml"), "utf8");
  const result = validateManagedDocument<StackCatalog>({
    text,
    format: "yaml",
    kind: "catalog",
    schema: stackSchema,
    domain: catalogInvariants,
  });

  if (!result.ok || result.value === null) {
    // A migratable document is readable but is never authoritative as-is.
    throw new ManagedDocumentError("Stack catalog", result, createMigrationPlan(result));
  }
  return { value: result.value, extensions: result.extensions };
}
```

Note the loader reads **one** file per call. `catalog/packs/*.yaml` is seven files, so the merge step (duplicate `id` refusal across files, undeclared-fact refusal) belongs in a `packCatalogInvariants`-style function run over the merged value, or as a post-merge invariant pass with the same `ValidationIssue` shape.

**Domain-invariant pattern** (`src/core/catalog.ts:38-81`) — this is the template for "pack references a fact absent from `catalog/facts.yaml`" and "duplicate pack id". Copy the `actualShape: \`string(length=${id.length})\`` convention exactly; it is how every existing invariant reports without leaking a value:

```typescript
function catalogInvariants(value: unknown): ValidationIssue[] {
  const catalog = value as StackCatalog;
  const issues: ValidationIssue[] = [];

  if (!Object.hasOwn(catalog.channels, catalog.defaultChannel)) {
    issues.push({
      code: "domain.unknown-default-channel",
      documentPath: "/defaultChannel",
      expected: "a channel declared in /channels",
      actualShape: `string(length=${String(catalog.defaultChannel).length})`,
    });
  }
  for (const [index, skill] of catalog.components.ownedSkills.entries()) {
    for (const target of skill.targets) {
      if (Object.hasOwn(catalog.harnesses, target)) continue;
      issues.push({
        code: "domain.unknown-skill-target",
        documentPath: `/components/ownedSkills/${index}/targets`,
        expected: "every target to be a declared harness",
        actualShape: `string(length=${target.length})`,
      });
    }
  }
  const duplicateSkills = catalog.components.ownedSkills
    .map((skill) => skill.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  for (const id of new Set(duplicateSkills)) {
    issues.push({
      code: "domain.duplicate-owned-skill",
      documentPath: "/components/ownedSkills",
      expected: "each owned skill id to appear once",
      actualShape: `string(length=${id.length})`,
    });
  }
  return issues;
}
```

**Also copy** `loadLockStrict`'s "requested channel is authority input, not something the file decides" comment style (`src/core/catalog.ts:163-180`) — the same reasoning applies to "the requested repository root is authority input, not something a pack file decides".

---

### `src/core/validation.ts` (modified — two new document kinds)

**Analog:** itself. Three `Record<ManagedDocumentKind, …>` tables make `tsc` enumerate every omission; do not grep for call sites.

**Kind union** (`src/core/validation.ts:12-22`) — add `"pack-catalog"` and `"fact-vocabulary"`:

```typescript
export type ManagedDocumentKind =
  | "catalog"
  | "lock"
  | "project-manifest"
  | "journal"
  | "install-state"
  | "writer-lock"
  | "evidence"
  | "receipt"
  | "native-config";
```

**Owned subtree table** (`src/core/validation.ts:286-301`) — both new kinds are `null` (whole document owned):

```typescript
const OWNED_SUBTREE: Record<ManagedDocumentKind, string | null> = {
  catalog: null,
  lock: null,
  "project-manifest": null,
  ...
  "native-config": "alphaAos",
};
```

**Core schema table + closed-world helper** (`src/core/validation.ts:272-320`):

```typescript
function coreObject(required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required,
    properties,
    // Closed world: the core is exhaustively described. Namespaced extensions
    // are split out before validation, so they never reach this check.
    additionalProperties: false,
  };
}

const anyObject = { type: "object" } as const;

const CORE_SCHEMAS: Record<ManagedDocumentKind, Record<string, unknown>> = {
  catalog: coreObject(["schemaVersion", "name", "harnesses", "components", "policy"], {
    schemaVersion: { type: "integer" },
    ...
  }),
```

**Closed-world consequence for the new schemas:** `catalog/packs/brownfield.yaml` declares `lifecycle` and `catalog/packs/security.yaml` declares `selectionPolicy`. Because `additionalProperties: false` is applied to everything that is not `x-`-namespaced (`EXTENSION_NAMESPACE = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/u`, `src/core/validation.ts:83`), omitting those two fields from `schemas/pack-catalog.schema.json` makes alpha-AOS reject its own catalog.

**Bounded, deterministic issue output** (`src/core/validation.ts:104-106`) — the near-miss cap in `project-plan.ts` must follow this precedent verbatim in spirit:

```typescript
/** Deterministic order and a hard cap, so a hostile document cannot flood output. */
function finalizeIssues(issues: ValidationIssue[]): { issues: ValidationIssue[]; truncated: boolean } {
```

---

### `src/core/project.ts` (modified — rewrite target)

**Analog:** itself. Two halves with opposite fates.

**DELETE — the hardcoded rules being displaced.** `src/core/project.ts:15-96` is the whole of it: six package-name arrays, one `package.json`-only dependency reader, and a 60-line `detectProject` that emits bare evidence strings with no path, version, negative record, or canonical root. Recorded here so the planner knows exactly what is displaced:

```typescript
// src/core/project.ts:15-20 — hardcoded package lists (Python names like
// psycopg2/asyncpg can never appear in package.json, so they are dead)
const webFrameworks = ["react", "next", "vue", "nuxt", "svelte", "@sveltejs/kit"];
const postgresPackages = ["pg", "postgres", "psycopg", "psycopg2", "asyncpg"];
const redisPackages = ["redis", "ioredis", "aioredis"];
const modelPackages = ["openai", "@anthropic-ai/sdk", "anthropic", "google-generativeai", "@google/generative-ai"];
const agentPackages = ["langchain", "@langchain/core", "crewai", "autogen", "pydantic-ai"];
const mcpPackages = ["@modelcontextprotocol/sdk", "mcp"];

// src/core/project.ts:26-34 — package.json-only reader, raw JSON.parse
async function packageDependencies(root: string): Promise<Set<string>> {
  const packageFile = join(root, "package.json");
  if (!existsSync(packageFile)) return new Set();
  const pkg = JSON.parse(await readFile(packageFile, "utf8")) as Record<string, unknown>;
  ...
}

// src/core/project.ts:36-96 — the engine being replaced
export async function detectProject(inputRoot: string): Promise<ProjectDetection> {
  const root = resolve(inputRoot);            // <- bare resolve, no boundary proof
  ...
  if (hasWeb && hasBrowserEntrypoint) packs.add("WEB_BASE");
  ...
  return { root, evidence: [...evidence].sort(), packs: [...packs].sort() };
}
```

Two conventions inside the deleted code must **survive** into the new engine:
1. The synthesized-fact-id spelling already in use — `evidence.add("manifest:scientificResearch")` (`:86`) and `evidence.add("manifest:criticalUserFlows")` (`:90`). The evaluator's `file:Dockerfile` / `dependency:react` ids extend this same convention.
2. Deterministic sorted output — `[...evidence].sort()`, `[...packs].sort()` (`:95`).

**KEEP and extend — the strict manifest route** (`src/core/project.ts:149-173`). This is the analog for reading `.alpha-aos/stack.yaml` for D-06 pack overrides, and the exact model `pack-catalog.ts` follows for schema-from-disk:

```typescript
/**
 * Reads a project manifest through the strict route and reports what it is,
 * without acting on it. Returns null when no manifest exists.
 */
export async function inspectProjectManifest(inputRoot: string): Promise<ProjectManifestInspection | null> {
  const manifestPath = join(resolve(inputRoot), ".alpha-aos", "stack.yaml");
  if (!existsSync(manifestPath)) return null;

  const result = validateManagedDocument<ProjectStackManifest>({
    text: await readFile(manifestPath, "utf8"),
    format: "yaml",
    kind: "project-manifest",
    schema: await loadManifestSchema(),
    domain: manifestInvariants,
  });

  return {
    status: result.status,
    value: result.status === "current" ? result.value : null,
    readOnlyValue: result.readOnlyValue,
    migration: createMigrationPlan(result),
    extensions: result.extensions,
    issues: result.issues,
  };
}
```

**Status gating comment to preserve** (`src/core/project.ts:80-83`) — the new engine must keep this exact rule for D-06 overrides:

```typescript
// Only a current, valid manifest contributes detection evidence. A migratable
// one is readable but is not consumed as current, and an invalid one adds
// nothing rather than partially applying whatever happened to parse.
const manifest = inspection?.status === "current" ? inspection.value : null;
```

**Fail-closed domain invariant pattern for D-06** (`src/core/project.ts:111-136`) — `manifestInvariants` shows how an unsupported declared value becomes a refusal rather than a silent downgrade:

```typescript
if (isolation.mode === "sealed") {
  // `sealed` has no OS/container adapter yet and must fail closed rather
  // than be silently treated as `project-only`.
  issues.push({
    code: "domain.sealed-unsupported",
    documentPath: "/isolation/mode",
    expected: "a mode with an available adapter (managed or project-only)",
    actualShape: "string(length=6)",
  });
}
```

A `packOverrides` entry naming an undeclared pack id must produce an issue in exactly this shape.

---

### `src/core/evidence.ts` (service, collector — file-I/O → transform)

**Analog (canonical root + boundary stop):** `src/core/path-boundary.ts`. Do not re-derive containment.

**Boundary proof signature** (`src/core/path-boundary.ts:239-250`):

```typescript
/**
 * Proves that one path is inside an allowed root both as configured and after
 * canonical resolution, recording the identity of every component so the same
 * conclusion can be rechecked immediately before mutation.
 *
 * There is deliberately no override: a boundary that cannot be proven refuses.
 */
export async function provePathBoundary(options: {
  path: string;
  allowedRoots: readonly string[];
  role: OperationPathRole;
}): Promise<PathProof>;
```

**Batch proof for a whole operation** (`src/core/path-boundary.ts:415-424`) — the collector should prove its read set up front through this, not path-by-path at read time:

```typescript
/**
 * Proves every path an operation declared, up front and as one immutable set.
 * An apply step that discovers a new path cannot prove it after the fact —
 * `includes` returns false and the caller must refuse.
 */
export async function proveOperationPaths(options: {
  inputs: readonly OperationPathInput[];
  allowedRoots: readonly string[];
  requiredRoles: readonly OperationPathRole[];
}): Promise<OperationPathProofSet>;
```

**Analog (project id):** `src/core/isolation.ts:132-135` — reuse as-is, feeding it an already-canonical root. Do **not** modify it; its output names existing runtime roots under `~/.alpha-aos/`.

```typescript
export function isolationProjectId(projectRoot: string): string {
  const canonical = resolve(projectRoot).replaceAll("\\", "/").toLowerCase();
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
```

**Analog (bounded directory enumeration + target pre-state):** `src/core/isolation.ts:161-175` `discoverSkillPaths`. This is the closest existing "walk declared roots, skip what is absent, first-wins, return a Map" pattern, and it already enumerates the three project-local skill roots D-11's conflict check needs:

```typescript
async function discoverSkillPaths(projectRoot: string): Promise<Map<string, string>> {
  const roots = [join(projectRoot, ".agents", "skills"), join(projectRoot, ".claude", "skills"), join(projectRoot, ".pi", "skills")];
  const skills = new Map<string, string>();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md")) && !skills.has(entry.name)) {
        skills.set(entry.name, join(root, entry.name, "SKILL.md"));
      }
    }
  }
  return skills;
}
```

`src/core/isolation.ts:198-201` `discoverProjectMcpNames` is the same shape for `.mcp.json` / `.agents/mcp_config.json` / `.pi/settings.json`, if a fact needs them.

**Anti-pattern present in the analog:** `readProjectManifest` (`src/core/isolation.ts:137-146`) uses a raw `parse(...)` + hand-rolled `schemaVersion !== 1` check. That is the **old** route; `evidence.ts` must read managed documents through `validateManagedDocument`, per `inspectProjectManifest`.

**Hashing** (`src/core/ecc-skills.ts:40-42`) — the project's one-liner for `inputsDigest` leaf hashes:

```typescript
function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}
```

---

### `src/core/project-plan.ts` (service, plan/apply pair)

**Analog:** `src/core/ecc-skills.ts` — the canonical plan → review-digest → revalidate → transaction pipeline.

**Imports pattern** (`src/core/ecc-skills.ts:1-24`) — the exact import set a plan/apply module needs:

```typescript
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, StackLock } from "../types.js";
import { applyFileTransaction } from "./transaction.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  ComponentPlanError,
  plannedProof,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";
```

**Plan-entry shape with pre-state and action classification** (`src/core/ecc-skills.ts:28-34`) — copy directly for `targetPreState` / D-11 conflict:

```typescript
export interface EccSkillSyncEntry {
  skill: SelectedEccSkill;
  destination: string;
  expectedHash: string;
  currentHash: string | null;
  action: "create" | "update" | "current";
}
```

**Pre-state read + destination containment** (`src/core/ecc-skills.ts:73-90`):

```typescript
export async function planEccSkillSync(harness, lock, targetRoot = globalEccSkillRoot(harness)) {
  const ecc = requireEccLock(lock);
  const entries: EccSkillSyncEntry[] = [];
  for (const skill of selectedSkills) {
    const expectedHash = ecc.targetSha256[skill]?.[harness];
    if (!expectedHash) throw new Error(`ECC target hash is missing for ${skill}:${harness}`);
    const destination = skillFile(targetRoot, skill);
    if (!inside(targetRoot, destination)) throw new Error(`Unsafe ECC destination: ${destination}`);
    const currentHash = existsSync(destination) ? sha256(await readFile(destination)) : null;
    entries.push({ skill, destination, expectedHash, currentHash,
      action: currentHash === expectedHash ? "current" : currentHash ? "update" : "create" });
  }
  return { harness, targetRoot, entries };
}
```

**Lock-read refusal to mirror for D-08** (`src/core/ecc-skills.ts:26, 60-67`) — and the anti-pattern to avoid. `selectedSkills` is the **global** three; widening it would install all 22 skills globally. Write a separate pack-skill lock reader with the same refusal shape:

```typescript
const selectedSkills: SelectedEccSkill[] = ["unified-memory", "documentation-lookup", "deep-research"];

function requireEccLock(lock: StackLock): NonNullable<StackLock["components"]["ecc"]> {
  const ecc = lock.components.ecc;
  if (!ecc) throw new Error("Stable lock has no ECC component");
  for (const skill of selectedSkills) {
    if (!ecc.sourceSha256[skill]) throw new Error(`ECC source hash is missing for ${skill}`);
  }
  return ecc;
}
```

**Transaction apply** (`src/core/ecc-skills.ts:328-338`) — the shape for writing `.alpha-aos/plan.json`; `allowedRoots` becomes `[join(root, ".alpha-aos")]`:

```typescript
const journal = await applyFileTransaction({
  stateRoot: reviewed.stateRoot,
  allowedRoots: [reviewed.targetRoot],
  operations,
  session,
});
return { operationId: journal.id, plan: await planEccSkillSync(harness, lock, reviewed.targetRoot), digest: reviewed.digest };
```

---

### `src/cli.ts` — `project plan` / `project approve` / `project status`

**Analog:** the `repair` branch, `src/cli.ts:587-603`. Print the digest, require it back at apply.

```typescript
if (command === "repair") {
  const stateRoot = userStateRoot();
  const plan = await planWriterRepair(stateRoot);
  if (!hasFlag(args, "--apply")) {
    const state = await inspectWriterState(stateRoot);
    print({ plan, state }, json, [
      `Writer state: ${plan.status}`,
      `Operation: ${plan.operationId ?? "none"}`,
      ...plan.targets.map((target) => `${target.classification.toUpperCase()} ${target.target}`),
      `Permitted transition: ${plan.transition}`,
      ...plan.blockedReasons.map((reason) => `BLOCKED ${reason}`),
      `Plan digest: ${plan.planDigest}`,
      "Diagnosis only. Pass --apply to perform the one transition this evidence proves.",
    ].join("\n"));
  } else {
    const result = await applyWriterRepair(stateRoot, plan.planDigest);
    print(result, json, `Repaired ${result.operationId ?? "state"} by ${result.transition}.`);
  }
  return;
}
```

**Branch being replaced** (`src/cli.ts:575-584`) — record its current shape:

```typescript
if (!["detect", "plan", "sync"].includes(subcommand)) throw new Error(`Unknown project command: ${subcommand}`);
if (subcommand === "sync" && hasFlag(args, "--apply")) {
  throw new Error("Project apply is not enabled until trust and transaction support are implemented");
}
const parts = positional(args.slice(2));
const target = parts[0] ?? process.cwd();
const detection = await detectProject(target);
print(detection, json, formatProject(detection));
if (subcommand !== "detect") process.stdout.write("\nDry-run only. Project files and harness configuration were not changed.\n");
```

The `sync --apply` refusal stays until Phase 3. `plan` must gain **no** `--apply` (D-12); `--apply` belongs to `approve`.

**Note the direct `process.stdout.write` at `:583`** — it bypasses `print()`. New output must not copy that; route everything through `print`.

---

### Shared Pattern: single output seam (`src/cli.ts:132-142`)

**Apply to:** every line `project plan|approve|status` emits. `postgres-dsn` / `redis-dsn` facts are credential-adjacent and this seam already handles them.

```typescript
/**
 * The one seam every observable byte leaves through. JSON output is the
 * redacted envelope; human output is the formatted text with the same
 * replacements applied, so a value suppressed in one is suppressed in both.
 */
function print(value: unknown, json: boolean, formatted: string, context: RedactionContext = observableContext()): void {
  if (json) {
    process.stdout.write(`${serializeObservable(value, context).text}\n`);
    return;
  }
  process.stdout.write(`${redactString(formatted, context)}\n`);
}
```

**Formatter analog** (`src/format.ts:37-39`) — `formatProjectPlan` replaces this:

```typescript
export function formatProject(detection: ProjectDetection): string {
  return [`Root: ${detection.root}`, `Evidence: ${detection.evidence.join(", ") || "none"}`, `Packs: ${detection.packs.join(", ") || "none"}`].join("\n");
}
```

Table-building precedent for multi-column output is `formatUpdate` (`src/format.ts:41-49`), which accumulates `rows: string[][]` via a local `add` closure.

---

### Shared Pattern: review/apply digest contract (`src/core/component-session.ts`)

**Apply to:** `project-plan.ts` (`approve`, DETC-05, D-13) — do not build a second drift mechanism.

**Digest** (`:61-67`):

```typescript
/**
 * Digest of everything a reviewer would look at. Recomputing a plan and
 * comparing this value is how apply proves nothing moved since review.
 */
export function reviewedDigest(kind: string, content: unknown): string {
  return createHash("sha256").update(`${kind}\n${JSON.stringify(content)}`, "utf8").digest("hex");
}
```

**Reviewed-plan boundary interface** (`:38-50`) — `ProjectCapabilityPlan` must structurally satisfy this to reuse the helpers:

```typescript
export interface ReviewedPlanBoundary {
  /** Names the operation, so a refusal says which plan refused. */
  readonly kind: string;
  readonly proofs: OperationPathProofSet;
  /** Stable over the plan's reviewable content, so review can be rechecked. */
  readonly digest: string;
}
export interface ReviewedComponentPlan extends ReviewedPlanBoundary {
  readonly stateRoot: string;
}
```

**Drift refusal** (`:116-124`):

```typescript
/** Refuses when a re-read of the same inputs no longer produces the reviewed plan. */
export function assertPlanUnchanged(reviewed: ReviewedPlanBoundary, revalidated: ReviewedPlanBoundary): void {
  if (revalidated.digest !== reviewed.digest) {
    throw new ComponentPlanError(
      "plan-drift",
      `${reviewed.kind} changed between review and apply: reviewed ${reviewed.digest.slice(0, 12)}, observed ${revalidated.digest.slice(0, 12)}`,
    );
  }
}
```

**Typed refusal codes** (`:21-36`) — D-13's "inputs changed vs selection changed" split should extend this union rather than invent a parallel error taxonomy:

```typescript
export type ComponentPlanCode =
  | "plan-incomplete" | "plan-drift" | "unplanned-path"
  | "boundary-changed" | "source-drift" | "session-mismatch";

export class ComponentPlanError extends Error {
  readonly code: ComponentPlanCode;
  constructor(code: ComponentPlanCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ComponentPlanError";
    this.code = code;
  }
}
```

**Single-writer wrapper** (`:126-167`) — `approve` must run its write under `withComponentSession(plan, callerSession, run)`; the comment explains why a second lock deadlocks.

---

### Shared Pattern: containment helper for `ignore-list.ts` / any destination check

**Source:** `src/core/ecc-skills.ts:44-47`. Use this only for the cheap "is this string under that string" case; anything that decides a **read or write** must go through `provePathBoundary`.

```typescript
function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
```

`src/core/paths.ts:50-52` carries the comment explaining why a string prefix compare aliases `/home/al-backup` under `/home/al`.

---

## Test Pattern Assignments

### `test/pack-catalog.test.ts` — analog `test/catalog.test.ts`

**Imports + real-package-root assertion style** (`test/catalog.test.ts:1-27`):

```typescript
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectLock, loadCatalog, loadCatalogStrict, loadLock, ManagedDocumentError } from "../src/core/catalog.js";
import { packageRoot } from "../src/core/paths.js";

test("stable catalog loads exact locked components", async () => {
  const root = packageRoot();
  const lock = await loadLock(root);
  assert.equal(lock.components.ecc?.sourceSha256["unified-memory"], "a6eb9a96b92dfd4a700bceff15195ca1fd4b7fad2944bb014c08812d1a0dc8b0");
});
```

The "every skill named by `catalog/packs/*.yaml` has a `sourceSha256`" test (D-08) belongs here or in `test/catalog.test.ts`, in exactly this `packageRoot()` + real-file style. Refusal tests assert on `ManagedDocumentError`.

### `test/evidence.test.ts` — analog `test/path-boundary.test.ts`

Real filesystem fixtures with platform-conditional skips. `test/path-boundary.test.ts:60-72, 169-170`:

```typescript
/** Directory symlink creation differs by platform and may need privileges. */
await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
...
notRun.push({ fixture: "escape-file-link", reason: "this host cannot create file symlinks without privileges" });
context.skip("escape-file-link fixture not run: file symlinks unavailable");
```

Temp-root + `context.after` cleanup from `test/project.test.ts:9-10`:

```typescript
const root = await mkdtemp(join(tmpdir(), "alpha-aos-project-"));
context.after(async () => rm(root, { recursive: true, force: true }));
```

### `test/helpers/git-fixture.ts` — analog `test/helpers/termination-oracle.ts`

The only existing `test/helpers/` module; follow its export-a-builder shape. **No existing test spawns `git`** — this helper is genuinely new machinery (see §No Analog Found).

### `test/project.test.ts` (modified) — the two behavioral cases that must survive the rewrite

```typescript
test("project detector selects packs only from positive repository evidence", async (context) => {
  ...
  const result = await detectProject(root);
  assert.deepEqual(result.packs, ["CONTAINER", "DB_MIGRATION", "DB_POSTGRES", "WEB_BASE", "WEB_REACT"]);
  assert.equal(result.packs.includes("AGENT_RUNTIME"), false);
});

test("AGENTS.md alone does not activate agent runtime", async (context) => {   // test/project.test.ts:22
  await writeFile(join(root, "AGENTS.md"), "# Instructions\n", "utf8");
  const result = await detectProject(root);
  assert.equal(result.packs.includes("AGENT_RUNTIME"), false);
});
```

`withManifest` helper at `test/project.test.ts:34-52` is the reusable manifest fixture for D-06 override tests.

### `test/preview.test.ts` (modified) — one-line registration

`PREVIEW_INVOCATIONS` at `test/preview.test.ts:247`. Add `project plan` and `project approve` alongside:

```typescript
{ name: "project isolate plan", args: ["project", "isolate", "plan", "."] },
{ name: "project isolate sync", args: ["project", "isolate", "sync", "."] },
```

---

## Config / Data File Assignments

### `schemas/pack-catalog.schema.json`, `schemas/fact-vocabulary.schema.json`
**Analog:** `schemas/stack.schema.json` and `schemas/evidence.schema.json` (both tracked). Match their `$schema` draft, `required` ordering, `additionalProperties: false`, and per-property `description` style. `schemas/evidence.schema.json` `facts[].reason` — "Why a near-match failed. Present on negative evidence." — is the field DETC-03's failed leaves populate.

### `catalog/facts.yaml`
**Analog:** `catalog/packs/web.yaml` (whole file, 12 lines) for the `schemaVersion: 1` + top-level plural array shape:

```yaml
schemaVersion: 1
packs:
  - id: WEB_BASE
    evidence:
      all: [web-framework, browser-entrypoint]
    skills: [browser-qa, accessibility]
  - id: WEB_REACT
    evidence:
      anyDependencies: [react, next]
    skills: [frontend-a11y]
  - id: WEB_FLOW_AUDIT
    evidence:
      manifestOptIn: criticalUserFlows
    skills: [click-path-audit]
```

`catalog/facts.yaml` mirrors it as `schemaVersion: 1` + `facts: [...]`.

### `catalog/stack.lock.json` (modified)
**Analog:** itself. `components.ecc.sourceSha256` is an open map and `skills` an open array, so the 19 pack-skill entries need no schema change. Hash convention is proven by `test/catalog.test.ts:26` asserting a literal digest.

### `scripts/pin-pack-skills.mjs`
**Analog:** `scripts/build-artifact.mjs` — the only existing maintainer-side `.mjs` that reads the catalog and emits derived artifacts. Follow its shebang, arg parsing, and loud-failure conventions. Runner contract for tests: `scripts/run-tests.mjs --files` is terminal (flags before, paths after); never use a shell glob.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/core/ignore-list.ts` | utility | transform | No gitignore-semantics matcher exists anywhere in `src/`. `inside()` and `withinRoot` are containment, not pattern matching. If the `ignore@7.0.5` gate passes, the module is a thin wrapper with no in-repo precedent; if it fails, the bounded fallback is new code. Follow RESEARCH.md §Don't Hand-Roll, not a codebase analog. |
| `test/helpers/git-fixture.ts` | test helper | — | No test in `test/*.ts` spawns `git`; the only `git` references are string constants in `test/doctor.test.ts:17` / `test/install.test.ts:36` and grep patterns in `test/preview.test.ts:675`. Building real `git init` / `worktree add` / `submodule add` fixtures is new machinery. Note `test/preview.test.ts` forbids `git pull` / `git fetch` in shipped scripts — the fixture helper is test-only and must not introduce network git. |
| Multi-file catalog merge (in `src/core/pack-catalog.ts`) | service | file-I/O | `src/core/catalog.ts` loads exactly one file per kind. Merging seven `catalog/packs/*.yaml` into one validated value, with cross-file duplicate-id refusal, has no precedent; use `catalogInvariants`' issue shape over the merged value. |

---

## Metadata

**Analog search scope:** `src/core/`, `src/`, `test/`, `test/helpers/`, `schemas/`, `catalog/`, `scripts/`
**Files scanned:** 22 tracked files opened; 72 enumerated via `git ls-files`
**Tracked-source verification:** `git ls-files --` run over all 21 existing paths cited; all returned non-empty
**Pattern extraction date:** 2026-09-07
