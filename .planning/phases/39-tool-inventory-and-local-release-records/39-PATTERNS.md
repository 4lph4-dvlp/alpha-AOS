# Phase 39: Tool Inventory and Local Release Records — Pattern Map

**Mapped:** 2026-11-06  
**Files classified:** 9 (proposed names for new files)  
**Analogs found:** 9 / 9; partial matches are explicitly qualified below.

## File Classification

| New/modified file | Role | Data flow | Tracked analog | Match |
|---|---|---|---|---|
| `src/core/tool-inventory.ts` (proposed) | service | read-only aggregation | `src/core/inventory.ts` | role-match |
| `src/core/tool-records.ts` (proposed) | service | file-I/O, history | `src/core/capability-ledger.ts` | role-match |
| `schemas/tool-release-record.schema.json` (proposed) | config/schema | validation | `schemas/capability-ledger.schema.json` | role-match |
| `src/core/validation.ts` | utility | validation/transform | same file | exact |
| `src/types.ts` | model | transform | `src/core/capability-ledger.ts` | partial |
| `src/cli.ts` | controller | request-response | same file | exact |
| `src/format.ts` | utility | transform | same file | exact |
| `test/tool-inventory.test.ts` (proposed) | test | fixture/read-only | `test/capability-ledger.test.ts` | partial |
| `test/tool-records.test.ts` (proposed) | test | file-I/O | `test/capability-ledger.test.ts` | role-match |

The proposed aggregation module may instead be named differently; preserve the existing synchronous `collectInventory` contract used by install, doctor and update. Observer adapters and fixtures may be separate files if planning needs them. All analogs named here were checked with `git ls-files`.

## Pattern Assignments

### Read-only inventory aggregation

**Sources:** `src/core/inventory.ts:1-22`, `src/adapters/harnesses.ts:69-92`.

```typescript
import type { Inventory, StackCatalog } from "../types.js";
import { harnessIds, probeHarness } from "../adapters/harnesses.js";
// ...
harnesses: harnessIds().map((id) => probeHarness(id, catalog)),
```

```typescript
const probe = definition.commands.map(probeCommand).find((value) => value.command !== null)
  ?? { command: null, version: null, unsupportedReason: null };
if (probe.unsupportedReason !== null) notes.push(`version unavailable: ${probe.unsupportedReason}`);
```

Keep collection return-oriented and observe without writing; seed managed tools from catalog/lock and merge bounded, injectable observations and existing records. **Do not copy the first-match selection as multi-install attribution:** it drops other candidates, does not prove per-harness active use, and `existsSync` does not distinguish all access errors. Model absent, inaccessible, unverified and ambiguous separately, independently for installation and connection ownership. Lock/pin values are selection evidence, not observed installs. Group multiple candidates by tool, retain each harness's evidence, and prioritize proven use and genuine problems without treating duplicates alone as failures.

`src/core/computer-use-install.ts:40-57` is a bounded Cua byte-comparison analog:

```typescript
const rel = relative(runtimeRoot, await realpath(file));
const stat = await lstat(file);
if (rel.startsWith("..") || isAbsolute(rel) || !stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024 || hash(await readFile(file)) !== digest) throw new Error("Installed Cua bytes differ from the reviewed release");
```

This checks installed bytes against a pin; it does not by itself prove the pin's official provenance or harness integration. Do not turn a local hash into provenance.

### Record model, schema and validation

**Sources:** `src/core/capability-ledger.ts:12-33,45-70`, `schemas/capability-ledger.schema.json:1-20`, `src/core/validation.ts:576-612,700-710,768-809`.

```typescript
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument, type ValidationIssue } from "./validation.js";
import type { MutationSession } from "./writer-lock.js";
```

```json
{ "type": "object", "required": ["schemaVersion", "producer", "updatedAt", "proofs"], "additionalProperties": false }
```

```typescript
const route = routes.find((candidate) => candidate.version === rawVersion);
// unknown versions return unknown-newer / unsupported-old, not an empty document
const validate = validatorFor(options.kind, options.schema);
const schemaOk = validate(core);
```

Register a new managed document kind and version route as appropriate, load the dedicated closed schema, and validate at both read and write boundaries. Closed nested objects are essential but insufficient for secrets: construct metadata from an explicit allowlist, constrain values and URLs, use domain validation and credential checks; do not persist arbitrary stderr, command lines, environment values or free-form untrusted observations. Existing ledger types include raw output/command fields and are **not** a safe field template for this stricter contract. Reject corrupt or unsupported documents with diagnostics; never silently reset them. Represent requested/resolved/installed/verified identity and evidence separately, with operation-to-many-tool results, append-preserving history and a separately maintained accepted reference. Failed/interrupted operations must not advance accepted identity, and an old accepted record alone does not prove current use.

### Writer session, path proof and durability

**Sources:** `src/core/component-session.ts:117-165`, `src/core/writer-lock.ts:13-24,355-427`, `src/core/transaction.ts:163-200,257-260,360-404`.

```typescript
if (!plan.proofs.proven) throw new ComponentPlanError(/* plan-incomplete */);
if (caller !== undefined) {
  caller.assertOwned();
  if (resolve(caller.stateRoot) !== resolve(plan.stateRoot)) throw new ComponentPlanError(/* session-mismatch */);
  return run(caller);
}
```

```typescript
handle = await open(lockPath, "wx", 0o600);
await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
await handle.sync();
```

```typescript
await handle.writeFile(content);
await handle.sync();
await rename(temporary, path);
return syncDirectory(dirname(path));
```

Reuse reviewed path proofs, exclusive writer, journal/snapshot and pre-mutation `recheckPathProof`; use one session for nested transactions. `userStateRoot()` allows an override, so independently prove the resolved state root is outside the checkout, including aliases/symlinks and platform case behavior; generic allowed-root containment alone does not establish that exclusion. Directory sync returns false on unsupported filesystems; callers must expose or explicitly handle this limitation. Atomic replacement of an individual file does not make a multi-file history plus accepted pointer crash-atomic, prove ordering/durability, or mean the tool itself passed verification. Specify and test interruption recovery and the evidence gate before advancing a pointer.

### CLI, formatting and tests

**Sources:** `src/cli.ts:293,1036-1038`, `src/format.ts:55-69`.

```typescript
const inventory = collectInventory(catalog);
print(inventory, json, formatInventory(inventory));
```

Use the same sanitized result for JSON and human output; add detail and operation/tool history routes without making reads write records. The existing table helper derives widths from headers and rows. Render installation, integrity and integration independently, with reasons/actions and recent operation separate from currently observed state.

**Test analog:** `test/capability-ledger.test.ts:11-34,41-65` imports `node:test`, strict assertions and temporary filesystem fixtures. Its fail-closed coverage is useful; add meaningful new fixtures for multiple installations and harness bindings, inaccessible versus absent, current state versus failed latest attempt, and human/JSON consistency. Add record tests for closed fields/secret leakage, identity/evidence correctness, history ordering, partial failure, corrupt or unknown version, checkout/symlink escape, concurrent writers and interruption at durable write boundaries. Verify reads create no files. Existing runner `scripts/run-tests.mjs:89-104` treats `--files` as terminal and expects compiled paths; build first, then use e.g. `node scripts/run-tests.mjs --files dist/test/tool-inventory.test.js dist/test/tool-records.test.js`. These are planned checks, not executed evidence; full suite is optional under owner delivery policy.

## Shared Patterns

- **Error handling:** propagate specific bounded diagnostics; distinguish missing from unreadable and unknown from failed. Never include arbitrary sensitive values in diagnostic output.
- **Evidence:** bind each proof to subject, scope, method and result; preserve prior accepted facts and avoid inferring present health from historical success.
- **Ownership:** inventory is observational; only explicit operations write records. Separate tool ownership from connection ownership and never infer management from discovery.
- **Scope:** phase 39 defines record and handoff contracts; actual updates, compatibility adapters, integration recovery and full migration remain later phases.

## No Exact Analog Found

No existing single implementation supplies append-preserving multi-tool operation history, per-harness multi-install attribution, secret-free release provenance, or a crash-safe accepted-record transition. The partial analogs above provide building blocks only; planner must explicitly specify and verify the missing guarantees.

## Metadata

**Search scope:** current tracked `src/core`, `src/adapters`, `src/cli.ts`, `src/format.ts`, `schemas`, `test`, `scripts`.  
**Pattern extraction date:** 2026-11-06. No tests or live installation were run.
