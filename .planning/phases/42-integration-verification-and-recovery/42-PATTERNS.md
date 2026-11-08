# Phase 42: Integration Verification and Recovery - Pattern Map

**Mapped:** 2026-11-09  
**Files analyzed:** 22 proposed new/modified files  
**Analogs found:** 22 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest tracked analog | Match |
|---|---|---|---|---|
| `src/core/release-verification.ts` | service | request-response | `src/core/mcp-fixture.ts` | role/data-flow |
| `src/core/release-recovery.ts` | service | event-driven | `src/core/transaction.ts` | role-match |
| `src/core/update.ts` | service | CRUD + event-driven | `src/core/update.ts` | exact |
| `src/core/tool-records.ts` | model/reader | event-driven | `src/core/tool-records.ts` | exact |
| `src/core/tool-record-store.ts` | store | event-driven | `src/core/tool-record-store.ts` | exact |
| `schemas/tool-release-record.schema.json` | config/schema | transform | itself | exact |
| `src/types.ts` | model | transform | itself | exact |
| `src/core/component-session.ts` | middleware/utility | request-response | itself | exact |
| `src/core/process.ts` | utility | streaming | itself | exact |
| `src/core/transaction.ts` | service | file-I/O | itself | exact |
| `src/core/mcp-fixture.ts` | service | request-response | itself | exact |
| `src/core/mcp-proxy.ts` | service | streaming/request-response | itself | exact |
| `src/core/computer-use-install.ts` | service | file-I/O | itself | exact |
| `src/core/install.ts` | service | batch | itself | exact |
| `src/cli.ts` | controller | request-response | itself | exact |
| `src/format.ts` | utility | transform | itself | exact |
| `test/release-verification.test.ts` | test | request-response | `test/mcp-proxy.test.ts` | role/data-flow |
| `test/release-recovery.test.ts` | test | event-driven | `test/tool-record-store.test.ts` | role/data-flow |
| `test/local-release-update.test.ts` | test | CRUD + event-driven | itself | exact |
| `test/tool-record-store.test.ts` | test | event-driven | itself | exact |
| `test/tool-records.test.ts` | test | event-driven | itself | exact |
| `test/mcp-proxy.test.ts` | test | streaming/request-response | itself | exact |

All listed analogs are tracked (`git ls-files -- <path>` returned each source path). New Phase 42 files intentionally have no pre-existing path; their analogs above are tracked sources.

## Pattern Assignments

### `src/core/release-verification.ts` (service, request-response)

**Analog:** `src/core/mcp-fixture.ts`, `src/core/mcp-proxy.ts`

Use an explicit bounded protocol session; discovery is a separate evidence tier from invocation. `discoverTools` establishes the existing initialize → initialized → list sequence (`src/core/mcp-fixture.ts:94-155`):

```ts
const session = await openProtocolProcess({ ... });
try {
  await session.request({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", ... } });
  await session.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
  const tools = await session.request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  return [...];
} finally { await session.close(); }
```

For an actual allowed read-only call through the alpha-AOS boundary, retain the proxy’s denial/transport/tool-error/ok observation split (`src/core/mcp-proxy.ts:720-770`):

```ts
if (allow && !allow.has(tool)) {
  observe(..., "denied", request.params.arguments, { attemptId });
  throw new Error(mcpPolicyRefusal(tool));
}
try { result = await client.callTool(request.params, undefined, { timeout: requestTimeout }); }
catch (error) { observe(..., "transport-error", ...); throw error; }
const outcome: McpObservationOutcome = isError ? "tool-error" : "ok";
observe(..., outcome, request.params.arguments, { attemptId, rawResultSha256, isError, ... });
```

Do not claim host proof without a returned harness/path observation. Missing credentials, approval, or reload conditions must return a typed pending result, not a passed discovery result.

### `src/core/release-recovery.ts` (service, event-driven)

**Analog:** `src/core/tool-record-store.ts`, `src/core/transaction.ts`, `src/core/process.ts`

Keep recovery lifecycle append-only and guarded by current path/session proofs. Event writes validate schema, recheck writer ownership, and use a deterministic transaction ID (`src/core/tool-record-store.ts:93-115`):

```ts
await validateEvent(event);
await verifySession(plan, session);
const transactionId = `${plan.operationId}--event-${event.sequence}`;
const journal = await applyFileTransaction({
  stateRoot: plan.stateRoot,
  allowedRoots: [join(plan.stateRoot, "tool-records", "v1", "operations", plan.operationId)],
  operations: [{ target, content }], session: eventSession,
});
```

File rollback is only `rollbackManagedTransaction` (`src/core/transaction.ts:734-741`), so expose it as an owned-file recovery substep—not native installation recovery:

```ts
const journal = await planManagedRollback(stateRoot, id, options);
return rollbackFileTransaction(stateRoot, id, journal.allowedRoots, options);
```

Use `runProcess` for declared native adapter commands, preserving absolute executable, no shell, bounded output, cancellation/timeout state, and `closeConfirmed` (`src/core/process.ts:471-628`). Reconcile observed state after every recovery attempt; never infer it from process termination or transaction rollback.

### `src/core/update.ts` (service, CRUD + event-driven)

**Analog:** itself

Preserve reviewed-plan token binding and pre-state/adaptor drift checks (`src/core/update.ts:1029-1129`). The existing application seam records `started` before install, appends each tool result, and finishes last (`src/core/update.ts:1276-1401`):

```ts
const revalidated = await revalidateLocalReleasePlan(options);
const recordPlan = await planToolRecordOperation({ stateRoot: stRoot, packageRoot: pkgRoot, operationId, occurredAt, requests });
return await withToolRecordSession(recordPlan, async (session) => {
  await beginToolOperation(recordPlan, session);
  const installRes = await applyManagedInstall({ ..., session, selectedTools: ... });
  await appendToolResult(recordPlan, session, result);
  await finishToolOperation(recordPlan, session, []);
});
```

Replace the present unconditional post-install `verified: null`, empty transition, and successful message only after release verification/recovery states have explicit typed outcomes. Maintain exact release, integrity, plan digest, and local pre-state revalidation; batch acceptance must be withheld for all selected tools when any required tool/harness is failed or pending.

### `src/core/tool-records.ts`, `src/core/tool-record-store.ts`, `schemas/tool-release-record.schema.json`, `src/types.ts` (model/store/schema, event-driven)

**Analog:** existing v1 record chain

Keep records schema-validated and credential-safe before writing (`src/core/tool-record-store.ts:31-36`), and retain plan shape/path proof discipline (`src/core/tool-record-store.ts:44-71`). Existing schema uses closed `kind`, `outcome`, and proof enums (`schemas/tool-release-record.schema.json:1-36`); do not silently reinterpret v1 terminal events. Prefer a versioned sidecar/new schema contract if Phase 42 requires new lifecycle statuses.

The current public preview/apply contracts expose only release plan/recovery scope and simple apply result (`src/types.ts:1079-1143`). Add typed verification/recovery/pending fields alongside, keeping old values compatible where consumers still read them.

Acceptance remains a separate transition, not an installer result: the finish event owns `acceptedTransitions`, while current update code intentionally writes none (`src/core/update.ts:1398-1401`). Only construct transitions after matching successful integration invocation proof(s).

### `src/core/component-session.ts`, `src/core/transaction.ts`, `src/core/process.ts` (middleware/service/utility)

**Analog:** existing plan/session safety boundary

Keep plan revalidation fail-closed: `assertPlanUnchanged` compares reviewed and revalidated digests (`src/core/component-session.ts:117-123`). Every new recovery/resume/cleanup mutation must be bounded by the same reviewed scope and fresh path proof.

For all owned file writes, use `applyFileTransaction` and its pre-write containment proof (`src/core/transaction.ts:218-270`):

```ts
const proofs = await proveOperationPaths({ inputs: operationPathInputs(...), allowedRoots: [...options.allowedRoots, options.stateRoot], requiredRoles: ["target", "state", "journal", "snapshot"] });
if (!proofs.proven) throw new Error(`Transaction path boundary refused: ${proofs.code} — ${proofs.detail ?? "no detail"}`);
for (const operation of options.operations) requireAllowed(resolve(operation.target), options.allowedRoots);
```

### `src/core/mcp-fixture.ts`, `src/core/mcp-proxy.ts` (service, request-response)

**Analog:** existing MCP fixture/proxy boundary

Use `mcp-fixture` for protocol initialization/discovery and `mcp-proxy` for policy-constrained invocation. A direct upstream call cannot prove alpha-AOS proxy behavior. Keep the observation contract value-free: proxy code records outcome/hash metadata rather than raw arguments/results (`src/core/mcp-proxy.ts:751-770`).

### `src/core/computer-use-install.ts`, `src/core/install.ts` (service, file-I/O/batch)

**Analog:** current install result + process seam

Extend adapters through their declared official artifact/integrity and process interfaces; do not add generic native rollback claims. The current computer-use installer delegates its native command to `runProcess` (`src/core/computer-use-install.ts:913`), so recovery descriptors should state exact supported compensation/reconciliation rather than model filesystem rollback as external tool recovery.

### `src/cli.ts`, `src/format.ts` (controller/utility, request-response/transform)

**Analog:** existing `update` preview/apply branch

Extend closed flags—not permissive operands—and retain the apply token requirement (`src/cli.ts:1634-1685`):

```ts
const parsed = parseClosedFlags(args.slice(1), { valueFlags: [...], booleanFlags: [...] });
if (apply && (typeof planDigest !== "string" || typeof reviewedPlan !== "string")) {
  throw new Error("Applying update requires both --plan-digest and --reviewed-plan...");
}
print(result, json, formatLocalReleaseApplyResult(result));
```

Add `resume`, `cancel`, `recover`, and `cleanup` only as preview/apply operations with operation IDs and bounded scope. `formatLocalReleasePreview` already prints identity, harness impact, native effects, and recovery scope (`src/format.ts:2308-2355`); expand that exact result object with verification checks, cost/permission prerequisites, pending reason, actual observed identity, recovery outcome, residual effects, and next command. Human and JSON forms must derive from the same result; do not manufacture real-host receipts.

### Tests (test, request-response/event-driven)

**Analogs:** `test/local-release-update.test.ts`, `test/tool-record-store.test.ts`, `test/tool-records.test.ts`, `test/mcp-proxy.test.ts`

Follow node:test temporary-root fixture style and test observable durable outcomes. Particularly useful cases:

- `test/local-release-update.test.ts:763-823` pins the present result (`verified: null`, empty `acceptedTransitions`); replace/add assertions so pending, accepted, failed-and-recovered, and recovery-required are distinct.
- `test/tool-record-store.test.ts:79-124` covers an interrupted start and idempotent resume without overwriting journal bytes; extend it for reconciliation-before-new-work and explicit cancellation.
- `test/tool-records.test.ts:126-151` asserts acceptance requires matching proof and an applied journal; retain this guard for integration invocation proofs.
- `test/mcp-proxy.test.ts:1154-1222` tests denied calls and no-value observations; `:1642-1740` covers all four observation outcomes. Use fake servers/proxies for proof-path tests, leaving real host proof explicitly unverified unless actual evidence is supplied.

## Shared Patterns

### Reviewed mutation boundary

**Sources:** `src/core/update.ts:1029-1129`, `src/core/component-session.ts:117-123`  
Every apply/resume/recover path must revalidate exact reviewed identity and current pre-state; a mismatch is plan drift, never an implicit reselection.

### Durable, append-only operation history

**Sources:** `src/core/tool-record-store.ts:44-115`, `schemas/tool-release-record.schema.json:1-36`  
Started/result/finished events are transactionally persisted under proven paths. Preserve evidence and interrupted records; do not turn cancellation into artifact deletion.

### Honest external effects and recovery

**Sources:** `src/core/transaction.ts:734-770`, `src/core/process.ts:471-628`, `src/format.ts:2330-2336`  
Transaction rollback, native adapter recovery, and unrecovered external effects are separate fields. A closed or cancelled child process is not recovery proof.

### Proxy-safe actual invocation

**Sources:** `src/core/mcp-fixture.ts:94-155`, `src/core/mcp-proxy.ts:720-770`  
Initialization/listing, allowed read-only call, and proxy observation are different evidence types. Redact/bound durable evidence and record only safe fingerprints/outcomes.

## No Analog Found

| File | Role | Data Flow | Gap |
|---|---|---|---|
| `src/core/release-verification.ts` | service | request-response | No existing lifecycle orchestrator that distinguishes pending host proof from discovery; compose fixture/proxy patterns. |
| `src/core/release-recovery.ts` | service | event-driven | No generic native recovery coordinator; compose record/transaction/process patterns and dispatch per adapter. |
| `test/release-verification.test.ts` | test | request-response | New lifecycle behavior; copy fake proxy fixture style. |
| `test/release-recovery.test.ts` | test | event-driven | New recovery state behavior; copy temporary record-store fixtures. |

## Metadata

**Analog search scope:** `src/core/`, `src/`, `schemas/`, `test/`  
**Files scanned:** 20 tracked source/test/schema files  
**Pattern extraction date:** 2026-11-09
