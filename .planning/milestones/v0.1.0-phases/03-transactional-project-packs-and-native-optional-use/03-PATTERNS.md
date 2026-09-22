# Phase 3: Transactional Project Packs and Native Optional Use - Pattern Map

**Mapped:** 2026-09-10
**Files analyzed:** 15 (6 new source/schema, 4 extended source, 2 extended schemas, 3 new tests)
**Analogs found:** 14 / 15

All analog paths below were verified git-tracked with `git ls-files`. No install/runtime
mirror paths appear in this document.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/project-pack-sync.ts` (NEW) | service (plan/apply writer) | file-I/O, transform | `src/core/ecc-skills.ts` | exact (declared sibling) |
| `src/core/capability-ledger.ts` (NEW) | service (host-state store) | CRUD, file-I/O | `src/core/isolation.ts` :700-742 (`inspectRuntimeMarker`) + `src/core/project-plan.ts` :1571-1639 (`readApprovedProjectPlan`) | role-match |
| `src/core/canary.ts` (NEW) | service (orchestrator) | event-driven, request-response | `src/core/mcp-fixture.ts` / `src/core/ecc-fixture.ts` | role-match |
| `src/adapters/capability-oracle.ts` (NEW) | adapter | request-response (subprocess), transform | `src/adapters/harnesses.ts` (per-harness probe table) | exact |
| `schemas/capability-ledger.schema.json` (NEW) | config/schema | — | `schemas/receipt.schema.json` | exact |
| `src/core/mcp-proxy.ts` (EXTEND — observation + Pitfall 8 env fix) | service (proxy) | streaming, pub-sub | itself + `src/core/process.ts` `runProcess` env policy | exact |
| `src/core/project-plan.ts` (EXTEND — D-10 ceiling/resolver, D-11 axis, D-13 one-shot) | model + service | transform | `ADAPTER_SUPPORT_EVIDENCE`/`classifyAdapterSupport` :600-670, `planPackRemoval` :2628 | exact (in-file) |
| `src/cli.ts` (EXTEND — `sync --apply`, canary/ledger verb) | controller | request-response | `src/cli.ts` `project approve` branch :625-733 | exact (in-file) |
| `src/format.ts` (EXTEND — axis summary line, one-shot offer) | utility (renderer) | transform | `formatProjectStatus` :359+, `formatProjectApproval` :273-285 | exact (in-file) |
| `schemas/receipt.schema.json` (EXTEND — `kind` discriminator) | config/schema | — | itself (`targets[].harness` enum + its rationale description) | exact |
| `schemas/pack-catalog.schema.json` (EXTEND — `lifecycle`) | config/schema | — | itself :155-165 (`lifecycle`/`selectionPolicy` neighbourhood) | exact |
| `src/core/validation.ts` (EXTEND — `capability-ledger` kind) | service (validator) | transform | its own `receipt` route (`ManagedDocumentKind` :20, `OWNED_SUBTREE` :307, `CORE_SCHEMAS.receipt` :370) | exact |
| `test/project-pack-sync.test.ts` (NEW) | test | file-I/O | `test/project-plan.test.ts` (real temp dirs, built-CLI tracer) | exact |
| `test/capability-oracle.test.ts` (NEW) | test | transform (recorded fixtures) | `test/validation.test.ts` / `test/mcp-proxy.test.ts` fixture-script style | role-match |
| `test/capability-ledger.test.ts` (NEW) | test | CRUD | `test/project-plan.test.ts` | role-match |

## Pattern Assignments

### `src/core/project-pack-sync.ts` (service, file-I/O)

**Analog:** `src/core/ecc-skills.ts` (RESEARCH Pattern 1 names it explicitly: "sibling, not a fork").

**Imports pattern** (`src/core/ecc-skills.ts:1-24`):

```ts
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, StackLock } from "../types.js";
import { userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged, assertUnchangedSincePlan, ComponentPlanError,
  plannedProof, reviewedDigest, withComponentSession,
} from "./component-session.js";
```

Relative `.js` extensions, no aliases, double quotes, two-space indent (AGENTS.md Conventions).

**Plan-shape pattern — bind bytes and hashes at review time** (`src/core/ecc-skills.ts:145-229`):
the operation plan enumerates every destination, source, state path and expected hash, proves
all path roles in one `proveOperationPaths` call, and folds the whole set into one
`reviewedDigest`. Copy this shape for the pack plan; the pack equivalent of `expectedHash` is
`resolvePackSource(...).sourceSha256` (`src/core/project-plan.ts:676`), since
`PLAN_RENDERER_ID = "ecc-skill/identity"` makes target hash == source hash.

```ts
const inputs: OperationPathInput[] = [
  ...sync.entries.map((entry): OperationPathInput => ({ role: "target", path: entry.destination })),
  { role: "state", path: stateRoot },
  { role: "journal", path: join(stateRoot, "journal") },
  { role: "snapshot", path: join(stateRoot, "snapshots") },
  { role: "source", path: sourceRoot },
];
const proofs = await proveOperationPaths({ inputs, allowedRoots, requiredRoles: [...] });
const digest = reviewedDigest("ecc-skill-sync", { harness, targetRoot, stateRoot, allowedRoots, sources, entries: sync.entries, boundary: { code: proofs.code, ... } });
```

**Apply pattern — revalidate, then one transaction** (`src/core/ecc-skills.ts:280-333`):

```ts
const revalidated = await planEccSkillOperation(harness, lock, revalidation);
assertPlanUnchanged(reviewed, revalidated);
return withComponentSession(reviewed, options.session, async (session) => {
  // per-entry: assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "source", source));
  //            sha256(content) !== entry.expectedHash -> ComponentPlanError("source-drift", ...)
  //            current !== entry.currentHash          -> ComponentPlanError("plan-drift", ...)
  const journal = await applyFileTransaction({
    stateRoot: reviewed.stateRoot,
    allowedRoots: [reviewed.targetRoot],
    operations,        // { target, content } only
    session,
  });
  return { operationId: journal.id, ... };
});
```

**D-06 divergence from the analog:** the pack writer passes **one** operations list carrying
both `SKILL.md` writes and `.alpha-aos/receipts/*.json` writes, and the `allowedRoots` come
from `PROJECT_SKILL_ROOTS` + `PROJECT_RECEIPT_DIRECTORY` rather than a single target root. The
allowed-roots derivation to copy is `removalAllowedRoots` (`src/core/project-plan.ts:2680-2700`),
which is already the inverse operation and already refuses a harness with no project root:

```ts
const skillRoot = PROJECT_SKILL_ROOTS[target.harness];
if (skillRoot === undefined) {
  throw new ComponentPlanError("plan-incomplete",
    `${receiptPath} names the harness ${target.harness}, which has no project-local skill root, ...`);
}
roots.add(join(canonicalRoot, ...skillRoot.split("/")));
```

**Target/receipt constants** — never re-derive (`src/core/project-plan.ts:570`, `:584`, `:593-597`):

```ts
export const PROJECT_RECEIPT_DIRECTORY = ".alpha-aos/receipts";
export const PLAN_RENDERER_ID = "ecc-skill/identity";
export const PROJECT_SKILL_ROOTS: Readonly<Partial<Record<HarnessId, string>>> = {
  claude: ".claude/skills", codex: ".agents/skills", pi: ".pi/skills",
};
```

---

### `src/core/capability-ledger.ts` (service, CRUD under `userStateRoot()`)

**Analogs:** `src/core/isolation.ts:711-742` (schema-file load + strict read of a state document)
and `src/core/project-plan.ts:1571-1639` (root-keyed schema cache + `validateManagedDocument`
route + `absent | unreadable | present` result union).

**Schema load + strict read** (`src/core/isolation.ts:711-742`):

```ts
let installStateSchema: Record<string, unknown> | null = null;

async function loadInstallStateSchema(): Promise<Record<string, unknown>> {
  if (installStateSchema !== null) return installStateSchema;
  const packageDirectory = packageRoot();
  installStateSchema = JSON.parse(
    await readFile(join(packageDirectory, "schemas", "install-state.schema.json"), "utf8"),
  ) as Record<string, unknown>;
  return installStateSchema;
}

export async function inspectRuntimeMarker(markerPath: string): Promise<RuntimeMarkerInspection> {
  const result = validateManagedDocument<RuntimeMarker>({
    text: await readFile(markerPath, "utf8"),
    format: "json",
    kind: "install-state",
    schema: await loadInstallStateSchema(),
  });
  return { status: result.status, value: result.status === "current" ? result.value : null, ... };
}
```

**Absent / unreadable / present tri-state** (`src/core/project-plan.ts:1584-1639`) — copy this
exact union and the `code: "io.unreadable"` issue shape for a missing or corrupt ledger; a
ledger that fails its schema is reported, never partially trusted.

**Ledger writes go through the same single writer** — `applyFileTransaction` with
`allowedRoots: [ledgerRoot]` under `userStateRoot()`, per `approveProjectPlan`
(`src/core/project-plan.ts:1686-1694`), which writes exactly one artifact and returns
`journal.id`.

**Union style for the new axes** (RESEARCH anti-pattern section; do not merge into one enum):

```ts
// src/core/project-plan.ts:1910 (existing, untouched)
export type PackState = "CURRENT" | "STALE" | "DRIFTED" | "CHANGED" | "CONFLICT" | "UNDECIDABLE";
// src/types.ts:401 (existing, untouched)
export type SurfaceSupport = "supported" | "unsupported" | "unverified";
```

New axes follow the same string-literal-union convention (AGENTS.md: "string literal unions for
finite identifiers").

---

### `src/adapters/capability-oracle.ts` (adapter, request-response)

**Analog:** `src/adapters/harnesses.ts:8-45` — the per-harness definition table plus one generic
driver. Harness-specific branching lives here, never in a core caller (ARCHITECTURE.md).

```ts
interface ProbeDefinition {
  commands: string[];
  configRoots: () => string[];
}

const probes: Record<HarnessId, ProbeDefinition> = {
  claude: { commands: ["claude"], configRoots: () => [environmentOrFallback("CLAUDE_CONFIG_DIR", join(homedir(), ".claude"))] },
  codex:  { commands: ["codex"],  configRoots: () => [environmentOrFallback("CODEX_HOME", join(homedir(), ".codex"))] },
  ...
};
```

Mirror this as `Record<HarnessId, OracleDefinition>` with `{ args, stdin?, parse }`, one entry
per harness (codex `debug prompt-input`, pi `--mode rpc` + `get_commands` + `--approve`, claude
`-p --output-format stream-json --verbose`).

**Launch pattern — bounded, shell-free, declared environment** (`src/core/process.ts:32-56`,
`:310-336`). Every oracle/canary child uses `runProcess` / `openProtocolProcess`; never
`child_process.spawn` directly:

```ts
export interface ProcessSpec {
  executable: string;          // must be absolute — runProcess throws ProcessPolicyError otherwise
  args: readonly string[];
  cwd: string;                 // the positive/negative directory switch for D-14 lives here
  timeoutMs?: number;
  maxOutputBytes?: number;
  environment?: EnvironmentPolicy;
  stdin?: string;              // e.g. the pi RPC line; stdin is written then closed
}
```

`ProcessResult.stdout/stderr` are `RedactedExcerpt` (bounded + fingerprinted) — that is the only
form of harness output allowed into the ledger.

**Executable resolution** (`src/adapters/isolation.ts:6-16`):

```ts
const commands: Record<HarnessId, string[]> = { claude: ["claude"], codex: ["codex"], antigravity: ["agy", "antigravity"], pi: ["pi"], hermes: ["hermes"] };
function executableFor(harness: HarnessId): string | null {
  return commands[harness].map(resolveCommand).find((candidate) => candidate !== null) ?? null;
}
```

**Unsupported/unreadable is a recorded note, never a simulated success** (`src/adapters/harnesses.ts:52-54`):

```ts
// An unreadable version is reported as unsupported, never simulated.
if (probe.unsupportedReason !== null) notes.push(`version unavailable: ${probe.unsupportedReason}`);
```

That is exactly RESEARCH A2's rule: an unparseable oracle is `unverified` with the raw stderr
recorded, never "not discovered".

---

### `src/core/canary.ts` (service, orchestrator)

**Analog:** `src/core/mcp-fixture.ts` / `src/core/ecc-fixture.ts` — the existing "run something
external in a temporary, declared location and return a typed verdict" modules; and
`src/adapters/isolation.ts:44-52` for the D-02 canary runtime launch spec:

```ts
case "claude":
  env.CLAUDE_CONFIG_DIR = harnessRoot;
  args.push("--setting-sources", "project,local");
  if (existsSync(join(options.projectRoot, ".mcp.json"))) args.push("--mcp-config", join(options.projectRoot, ".mcp.json"));
  args.push("--strict-mcp-config");
```

`--mcp-config` + `--strict-mcp-config` is already the isolation seam D-02 needs; the canary
runtime renders the same servers through `alpha-aos mcp-proxy` into a runtime-root config file
and reuses this spec construction rather than adding a second launch path.

Blocked-reason accumulation follows the same spec's `blockedReasons` array
(`src/adapters/isolation.ts:31-40`) — a coded, named reason, never a value.

---

### `src/core/mcp-proxy.ts` (EXTEND — observation + environment repair)

**In-file patterns to preserve:**

```ts
// :24-33 — allowlist and the per-server environment declaration
export function allowedMcpTools(server: McpServerId): ReadonlySet<string> | null {
  return server === "firecrawl" ? firecrawlTools : null;
}
const UPSTREAM_ENVIRONMENT_NAMES: Record<McpServerId, readonly string[]> = {
  firecrawl: ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "FIRECRAWL_OAUTH_TOKEN"],
  exa: ["EXA_API_KEY", "ENABLED_TOOLS"],
  context7: ["CONTEXT7_API_KEY"],
};
```

Observation must separate "observe" from "filter": today `runMcpFilterProxy` throws for any id
whose `allowedMcpTools` is `null` (`:166-168`). The recording hook goes in the two handlers at
`:193-200`, which already have the tool name and the upstream client.

**Environment repair (Pitfall 8)** follows `upstreamEnvironmentPolicy` (`:51-62`) — extend the
declared block (pin an npm cache under `userStateRoot()`), not the passthrough; the comment
block at `:38-50` states why the allowlist is declared rather than inherited.

---

### `src/cli.ts` (EXTEND — `sync --apply` and a canary/ledger verb)

**The line replaced** (`src/cli.ts:623`):

```ts
if (subcommand === "sync" && hasFlag(args, "--apply")) {
  throw new Error("Project apply is not enabled until trust and transaction support are implemented");
}
```

**Branch pattern to copy — `project approve --apply`** (`src/cli.ts:625-733`): read options via
`positional`/`optionValue`/`hasFlag`, build `planOptions`, pass an `observableContext()` to
`print()` so every rendering leaves through the redaction seam, and refuse with a *runnable*
command string rather than a bare error:

```ts
const context = observableContext();
...
throw new Error(`project approve --apply requires the digest that was reviewed. The current plan digest is ${revalidated.plan.planDigest}. Run: ${command}`);
```

D-08's "no artifact" refusal copies this shape verbatim, printing an `approve` command built the
way `approvalCommand({ path, subProject, planDigest })` builds one.

**Apply-result rendering** (`src/cli.ts:716-729`) — list each written path, name the transaction
id, and state reversibility:

```ts
`Transaction: ${removed.operationId}`,
"The transaction snapshotted every removed file before deleting it, so this removal is reversible with `alpha-aos rollback`.",
```

**Verb-discipline refusals already in place** (`:626-640`) — `plan --apply` and `status --apply`
each throw with the correct next command. A new canary verb states the same way that it is not a
preview and must not run on the plan path (SAFE-01).

---

### `src/format.ts` (EXTEND — axis summary and the one-shot offer)

**Analog:** `formatProjectStatus` (`src/format.ts:359-390+`) — a `lines: string[]` accumulator,
`KEY value` prefixes for machine-ish facts, `UPPER-CODE reason` lines for findings:

```ts
const lines = [
  `Project: ${reconciliation.plan.scope.canonicalRoot} (${reconciliation.plan.scope.rootReason})`,
  `Project id: ${reconciliation.plan.scope.projectId}`,
];
...
if (reconciliation.gitNote !== null) lines.push(`BRANCH-DIFFERS ${reconciliation.gitNote}`);
```

D-11's "human output summarises to one line" and D-13's one-shot offer ("`BROWNFIELD_INIT` —
one-shot, invoked on <date>, removal plan ready" + the runnable approve command) both land as
additional lines in this function. JSON stays the raw axes — the CLI, not `format.ts`, emits JSON
(ARCHITECTURE.md: "JSON output remains in the CLI").

---

### `schemas/capability-ledger.schema.json` (NEW)

**Analog:** `schemas/receipt.schema.json` — closed world, `$defs.sha256`, and a `description`
that records *why* an enum is narrowed:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://alpha-aos.local/schemas/receipt.schema.json",
  "type": "object",
  "required": ["schemaVersion", "packId", "producer", "createdAt", "sourceHash", "targets"],
  "additionalProperties": false,
  "$defs": { "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" } },
  ...
  "harness": {
    "description": "Exactly the harnesses that have a project-local skill root, i.e. the keys of PROJECT_SKILL_ROOTS ... Phase 3 WRITES receipts and must honour this narrowing.",
    "enum": ["claude", "codex", "pi"]
  }
}
```

**Registering the new kind** (`src/core/validation.ts`) touches three tables in lockstep, exactly
as `receipt` does:

```ts
// :20   ManagedDocumentKind union member
| "receipt"
// :307  OWNED_SUBTREE — null means alpha-AOS owns the whole document
receipt: null,
// :370  CORE_SCHEMAS — the built-in envelope check; the schemas/*.json file is the closed interior
receipt: coreObject(["schemaVersion", "packId", "sourceHash", "targets"], {
  schemaVersion: { type: "integer" }, packId: { type: "string" },
  sourceHash: { type: "string" }, targets: { type: "array" },
}),
```

`schemaRoutesFor` (`:446-451`) then yields the migratable/current pair automatically.

**`kind` discriminator (D-05)** lands beside `targets[].harness` in
`schemas/receipt.schema.json`, with a description stating that only `"skill"` is implemented and
that an unregistered kind is inert (Phase 1 D-08/D-09).

**`lifecycle` (D-13)** lands in `schemas/pack-catalog.schema.json` at `:155-165`, next to the
existing `lifecycle`/`selectionPolicy` property neighbourhood.

---

### Test files (`test/project-pack-sync.test.ts`, `test/capability-oracle.test.ts`, `test/capability-ledger.test.ts`)

**Analog:** `test/project-plan.test.ts:1-45` — header comment naming the plan/tracer and the seam
under test, `node:test` + `node:assert/strict`, real temp directories, no mocking framework:

```ts
// Plan 02-01 tracer: one repository directory selects one YAML-declared pack.
//
// The assertions here run the built CLI, not the modules, because the seam
// under test is the whole path — canonical root, evidence, pack catalog, ...
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
```

**Fixture-script pattern for a child process under test** (`test/mcp-proxy.test.ts:29-50`) — the
repository root is resolved two levels up from `dist/test`, and each external behaviour is a
small written script plus a named sentinel constant:

```ts
// Compiled to dist/test, so the repository root is two levels up.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The credential the fixture hands upstream, and expects never to see back. */
const CREDENTIAL_SENTINEL = "alphaAOSfirecrawlSentinel0011";
```

Use this shape for the oracle parser fixtures (recorded JSON from the research session, replayed
offline) and for the three-server `mcp-proxy` startup regression.

**Run command:** `node scripts/run-tests.mjs --files dist/test/<suite>.test.js` — never
`node --test dist/test/*.test.js`.

## Shared Patterns

### Single write path (applies to every byte this phase writes)
**Source:** `src/core/transaction.ts` (`applyFileTransaction`), called at
`src/core/ecc-skills.ts:328-333`, `src/core/project-plan.ts:1686-1694`, `:2765-2772`.
**Apply to:** `project-pack-sync.ts`, `capability-ledger.ts`.

```ts
const journal = await applyFileTransaction({
  stateRoot,                   // userStateRoot() — journal + snapshots
  allowedRoots,                // explicit absolutes; a target outside refuses inside the transaction
  operations,                  // { target, content }  |  { target, content: null } == removal
  session,                     // caller-supplied MutationSession
});
```

### Session + digest-gated apply
**Source:** `src/core/component-session.ts` via `src/core/ecc-skills.ts:280-293` and
`src/core/project-plan.ts:1647-1660`.
**Apply to:** every apply function added this phase.

```ts
assertPlanUnchanged(reviewed, revalidated);
return withComponentSession(reviewed, options.session, async (session) => { ... });
```

Typed refusals only: `ComponentPlanError("source-drift" | "plan-drift" | "plan-incomplete" | "unplanned-path", message)`.

### Path-boundary proof before mutation
**Source:** `src/core/path-boundary.ts` (`proveOperationPaths`), used at
`src/core/ecc-skills.ts:192-198` and `src/core/project-plan.ts:2740-2750`.
**Apply to:** pack sync and ledger writes. Roles: `target`, `state`, `journal`, `snapshot`,
`source`, `package-root`, `temp`; `requiredRolesForFileMutation()` gives the mutation set.

### Bounded, redacted subprocess evidence
**Source:** `src/core/process.ts:57-72` (`ProcessResult` with `RedactedExcerpt` stdout/stderr),
`src/core/mcp-proxy.ts:144-157` (`stderrEvidence()`).
**Apply to:** `capability-oracle.ts`, `canary.ts`, ledger records.
Raw harness/model bytes are hashed and dropped; only bounded redacted excerpts survive.

### Refusals name the operation and the next command
**Source:** `src/core/project-plan.ts:2712-2725` (`applyPackRemoval` drift refusal),
`src/cli.ts:626-640`.
**Apply to:** D-08's missing-artifact refusal, D-12's `blocked` rendering.

```ts
throw new ComponentPlanError("plan-drift",
  `no stale pack currently offers a removal plan with digest ${digest.slice(0, 12)} (on offer now: ${available}). ` +
  `... Review the current state again with: alpha-aos project status ${quotedPath}`);
```

D-12 adds the constraint that a `blocked` message names the credential **variable** only —
`src/core/redaction.ts` is the seam, and `src/core/mcp.ts` is the precedent for
credential-names-never-values.

### Evidence-only support classification (D-10 ceiling)
**Source:** `src/core/project-plan.ts:600-670`.
**Apply to:** the ceiling half of the D-10 split. `classifyAdapterSupport` becomes the resolver
over (ceiling table, ledger), keeping its fail-closed default:

```ts
if (recorded === undefined) {
  return { harness, support: "unverified" as SurfaceSupport,
           reason: `no recorded evidence classifies project-scope pack delivery for ${harness}` };
}
```

Note the two entries RESEARCH proved inaccurate (codex "no documented project-scope discovery",
hermes "gsdStrategy: worker-only rules out project-scope pack delivery") — the reasons must be
corrected in this table even where the decision stands.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| The paired positive/negative "evidence unit" aggregation inside `src/core/canary.ts` | service | event-driven | Nothing in the repository currently pairs a positive with its own negative control and renders the unpaired case INCOMPLETE. Build from D-14 + RESEARCH Pattern 3 directly; the nearest structural relative is `planPackRemoval`'s "compute both halves, digest the pair" shape (`src/core/project-plan.ts:2628-2646`). |

## Metadata

**Analog search scope:** `src/core/`, `src/adapters/`, `src/`, `schemas/`, `test/`
**Files scanned:** 22 tracked files inspected; 12 read in depth
**Pattern extraction date:** 2026-09-10
