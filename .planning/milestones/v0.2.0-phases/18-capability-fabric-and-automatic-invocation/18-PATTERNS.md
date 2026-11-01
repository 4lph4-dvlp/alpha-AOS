# Phase 18: Capability Fabric and Automatic Invocation - Pattern Map

**Mapped:** 2026-10-03  
**Files analyzed:** 20 candidate new or modified files  
**Analogs found:** 20/20; every analog below is Git tracked. Candidate file names are planning suggestions where no implementation path was fixed upstream.

## File Classification

| New/modified file | Role | Data flow | Closest tracked analog | Match |
|---|---|---|---|---|
| `src/core/task-capability-inventory.ts` (new) | service | transform | `src/core/project-plan.ts` | role and flow |
| `src/core/task-capability-obligations.ts` (new) | service | transform | `src/core/task-gsd-lifecycle.ts` | role |
| `src/core/task-capability-receipts.ts` (new) | service | event-driven | `src/core/task-hook-receipt.ts` | role and flow |
| `src/core/task-capability-drift.ts` (new) | service | transform | `src/core/capability-ledger.ts` | role |
| `schemas/task-capability-receipt.schema.json` (new) | config | transform | `schemas/hook-execution-receipt.schema.json` | role and flow |
| `src/types.ts` | model | transform | `src/types.ts` | exact |
| `src/core/task-effects.ts` | service | event-driven | `src/core/task-effects.ts` | exact |
| `src/core/task-run.ts` | service | event-driven | `src/core/task-run.ts` | exact |
| `src/core/task-gsd-lifecycle.ts` | service | event-driven | `src/core/task-gsd-lifecycle.ts` | exact |
| `src/core/task-verdict.ts` | service | transform | `src/core/task-verdict.ts` | exact |
| `src/core/project-pack-sync.ts` | service | file-I/O | `src/core/project-pack-sync.ts` | exact |
| `src/core/capability-ledger.ts` | model/service | file-I/O | `src/core/capability-ledger.ts` | exact |
| `src/core/mcp-proxy.ts` | middleware | request-response | `src/core/mcp-proxy.ts` | exact |
| `src/adapters/capability-oracle.ts` | adapter | request-response | `src/adapters/capability-oracle.ts` | exact |
| `src/adapters/task-agents.ts` | adapter | request-response | `src/adapters/task-agents.ts` | exact |
| `src/cli.ts` | controller | request-response | `src/cli.ts` | exact |
| `src/format.ts` | utility | transform | `src/format.ts` | exact |
| `test/task-capability-inventory.test.ts` (new) | test | transform | `test/capability-ledger.test.ts` | role and flow |
| `test/task-capability-drift.test.ts` (new) | test | event-driven | `test/task-gsd-adversarial.test.ts` | role and flow |
| existing `test/task-effects.test.ts`, `test/project-pack-sync.test.ts`, `test/task-gsd-lifecycle.test.ts`, `test/task-run.test.ts`, `test/canary.test.ts`, `test/capability-oracle.test.ts`, `test/capability-ledger.test.ts`, `test/task-gsd-adversarial.test.ts` | test | event-driven/request-response | respective same file | exact |

## Pattern Assignments

### Inventory, selection, and drift (CAP-01, CAP-03, CAP-04; D-06..D-13, D-17)

**Apply to:** `task-capability-inventory.ts`, `task-capability-obligations.ts`, `task-capability-drift.ts`, `src/types.ts`.

**Analog:** `src/core/project-plan.ts:704-715`. Keep declaration and host proof separate:

```typescript
export function provenSurfaceSupport(
  ledger: CapabilityLedger | null | undefined,
): ReadonlyMap<HarnessId, { readonly support: SurfaceSupport; readonly nativeUse: NativeUseState }> {
  const proven = new Map<HarnessId, { support: SurfaceSupport; nativeUse: NativeUseState }>();
  if (ledger === null || ledger === undefined) return proven;
  for (const proof of ledger.proofs) {
    if (proof.polarity !== "positive") continue;
    if (proof.projectId === null) continue;
    if (proof.nativeUse !== "discovered" && proof.nativeUse !== "invoked") continue;
    proven.set(proof.harness as HarnessId, { support: "supported", nativeUse: proof.nativeUse });
  }
  return proven;
}
```

**Model:** `src/types.ts:551-557` defines orthogonal `deployment`, `nativeUse`, `support`; `src/core/capability-ledger.ts:197-234` binds proofs to `boundInputs`, `harnessVersion`, `invocationEvidence`, and audit-only older versions. New inventory must enumerate catalog/lock, global and approved project skills, MCP, native tools, hooks, and GSD commands; show excluded reasons and version/source, never fold host facts into approval digest. New obligation rows need deterministic scope, phase, question, source/version, required flag, original receipt ID on reuse, and explicit ambiguity/overlap decision. Check current inputs before accepting any old receipt. Same-need project skills supersede global skills; distinct API documentation and external research remain separate obligations.

**GSD stage seam:** `src/core/task-gsd-lifecycle.ts:23-35` defines `GsdStepKind = "discuss" | "plan" | "execute" | "verify"`; review has a separate dispatch in `src/core/task-run.ts:1013-1082`. Plan obligations at both seams. Do not imply review belongs to the existing union without changing its contract.

### Setup barrier and pack transition (CAP-02; D-01..D-05)

**Apply to:** `src/core/task-effects.ts`, `src/core/task-run.ts`, `src/core/project-pack-sync.ts`.

**Analog checkpoint:** `src/core/task-effects.ts:281-296`:

```typescript
const planOptions = { path: resolve(options.projectRoot), packageRoot: options.packageRoot };
const plan = await planProjectCapabilities(planOptions);
const ledger = await readCapabilityLedger(capabilityLedgerPath(options.stateRoot));
await reconcileProjectState(planOptions, ledgerHostEvidence(ledger));
return { planDigest: plan.planDigest, selected: [...plan.selected], applicable: [...plan.applicable],
  approveCommand: approvalCommand({ path: planOptions.path, planDigest: plan.planDigest }) };
```

`src/core/task-effects.ts:55-61` supplies `dependencyChanged` and `dependencyPaths`. The current call is **after dispatch** at `src/core/task-run.ts:957-963`; it cannot alone enforce the pre-application setup barrier. Group consecutive setup edits, checkpoint once at completion or partial failure, and stop application work until the checkpoint is resolved. `src/core/project-pack-sync.ts:1282-1293` re-plans read-only and calls `assertPlanUnchanged` before writing. Preserve exact digest approval, transactional sync and `CURRENT` check; then start a distinct agent session and rediscover project skills/MCP before use. Autopilot consent does not substitute for pack digest approval.

### Invocation, outcome, and final gate (CAP-03, CAP-04; D-09..D-15)

**Apply to:** `task-capability-receipts.ts`, its schema, `src/core/capability-ledger.ts`, `src/core/mcp-proxy.ts`, `src/core/task-gsd-lifecycle.ts`, `src/core/task-run.ts`, `src/core/task-verdict.ts`.

**Analog invocation:** `src/core/task-gsd-lifecycle.ts:175-192` executes a pre-hook through `executeHookWithReceipt` and appends the actual receipt. `src/core/task-hook-receipt.ts:171-202` uses `runProcess` with scrubbed environment and records exit/stdout/stderr hashes; it creates `HOOK_EXECUTION_FAILED` for nonzero outcome. `src/core/task-hook-receipt.ts:75-85` loads its tracked JSON schema. Follow this external-result validation and receipt pattern for both skill activation and MCP invocation, linking them to one obligation without claiming either alone is full use.

**Critical failure seam:** `src/core/capability-ledger.ts:161-169` currently has `outcome: "ok" | "denied"`. `src/core/mcp-proxy.ts:691-701` currently calls `observe(..., "ok", ...)` after `client.callTool` returns. Inspect `result.isError` and thrown errors; preserve attempted invocation separately from successful result. Add schema/read compatibility so old evidence without result cannot establish strict success. Recovery order: repair current approved path, verify equivalent answer/source/version/outcome on alternate path, request new contract approval for role/harness changes, then `needs-input` or `blocked` with concrete reason.

**Verdict seam:** `src/core/task-run.ts:1145-1153` passes `preconditions` into `reduceTaskVerdict`. `src/core/task-verdict.ts:292-297` returns `"unknown"` if any precondition is unsatisfied. Add required capability/result validity checks to preconditions before verdict; do not create a second success rule.

### Harness proof and display (CAP-01, CAP-05; D-03, D-12, D-16, D-17)

**Apply to:** `src/adapters/capability-oracle.ts`, `src/adapters/task-agents.ts`, `src/cli.ts`, `src/format.ts`.

`src/adapters/capability-oracle.ts:452-458` exposes `runDiscoveryOracle` and returns unsupported when an oracle is absent. `src/adapters/task-agents.ts:51-65` checks role proofs and versions. New-session proof must bind session, harness executable/version, skill/MCP discovery and actual result, reporting unverified cells honestly. `src/cli.ts:1845-1868` gathers checkpoint, ledger, journal events, optional GSD diagnostics and calls `print(statusData, json, formatTaskStatus(statusData), context)`. `src/format.ts:1332-1352` builds the human summary from structured status. Extend plan/status default with selected/failed/blocked and major omissions; provide full inventory, applicability, evidence invalidations and next action in detail and JSON.

### Tests and fixtures (CAP-01..05)

**Apply to:** new inventory/drift tests and the existing tests named above.

**Analog test imports/fixture:** `test/task-gsd-lifecycle.test.ts:1-17` uses `node:assert/strict`, `node:test`, relative `.js` imports, `mkdtemp`, and `context.after(() => rm(root, { recursive: true, force: true }))`. Cover each declared capability with matching and nonmatching fixtures; staged setup and partial failure; stale approval; `CURRENT` then distinct session; each GSD and review boundary; successful, `isError`, thrown and reused invocation; input drift; five harnesses' claimed cells with actual version-bound receipts. Synthetic tests establish logic but do not upgrade untested real-host cells.

## Shared Patterns

- **Imports/style:** Node built-ins first, relative `.js` source imports, double quotes, named exports, strict types. See `src/core/task-gsd-discovery.ts:1-4` and `test/task-gsd-lifecycle.test.ts:1-12`.
- **Error and validation:** fail closed at boundary with specific `Error`; `src/core/project-pack-sync.ts:1289-1293` rejects stale plan before mutation; `src/core/task-hook-receipt.ts:75-85` loads a closed schema. No credential values in receipts.
- **Evidence location:** GSD owns `.planning/`; keep execution receipts in alpha-AOS state. `src/core/capability-ledger.ts:216-234` retains old proof for audit while withholding strict completion when invocation detail is absent.
- **No implicit support:** `src/core/project-plan.ts:704-715` requires positive, project-bound, discovered/invoked proof; `src/types.ts:527-557` keeps support and native use orthogonal.

## No Analog Found

There is no existing module for a full version-bound capability graph, phase obligation selection/reuse, grouped setup barrier, or skill-to-MCP outcome chain. The analogs above cover their component patterns only; planners must define the new contracts explicitly using RESEARCH.md and D-01..17.

## Metadata

**Search scope:** tracked `src/core/`, `src/adapters/`, `src/cli.ts`, `src/format.ts`, `src/types.ts`, `schemas/`, `test/`.  
**Analog path check:** `git ls-files -- <path>` returned every named analog; no runtime mirrors are referenced.  
**Extraction date:** 2026-10-03.
