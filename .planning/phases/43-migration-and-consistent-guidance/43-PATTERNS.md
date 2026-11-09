# Phase 43: Migration and Consistent Guidance - Pattern Map
**Mapped:** 2026-11-09  
**Files analyzed:** 19  
**Analogs found:** 19 / 19  

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/core/migrate.ts` | service / orchestrator | CRUD / transaction / file-I/O | `src/core/update.ts` & `src/core/repair.ts` | role-match |
| `src/core/tool-bindings.ts` | service / SSOT resolver | request-response / store read | `src/core/tool-bindings.ts` | exact |
| `src/cli.ts` | controller / CLI dispatcher | request-response | `src/cli.ts` | exact |
| `src/format.ts` | presenter / formatter | transform | `src/format.ts` | exact |
| `src/core/doctor.ts` | service / diagnostic | request-response / read | `src/core/doctor.ts` | exact |
| `src/core/tool-inventory.ts` | service / inspector | request-response / read | `src/core/tool-inventory.ts` | exact |
| `src/core/mcp.ts` | service / config synchronizer | request-response / file-I/O | `src/core/mcp.ts` | exact |
| `src/core/isolation.ts` | service / environment isolation | request-response / file-I/O | `src/core/isolation.ts` | exact |
| `src/core/install.ts` | service / installer | request-response / batch / file-I/O | `src/core/install.ts` | exact |
| `src/types.ts` | model / domain types | declarative | `src/types.ts` | exact |
| `docs/guides/migration.md` | documentation | declarative | `docs/task-entry.md` | role-match |
| `docs/guides/migration.ko.md` | documentation | declarative | `docs/task-entry.ko.md` | role-match |
| `README.md` & `README.ko.md` | documentation | declarative | `README.md` & `README.ko.md` | exact |
| `skills/alpha-aos-control/SKILL.md` | agent skill instructions | declarative | `skills/alpha-aos-control/SKILL.md` | exact |
| `skills/alpha-aos-task/SKILL.md` | agent skill instructions | declarative | `skills/alpha-aos-task/SKILL.md` | exact |
| `test/migrate.test.ts` | test / integration | transaction / file-I/O | `test/tool-handoff.test.ts` & `test/update.test.ts` | role-match |
| `test/migrate-ownership.test.ts` | test / integration | request-response / validation | `test/tool-handoff.test.ts` | role-match |
| `test/tool-bindings-ssot.test.ts` | test / unit | request-response / SSOT | `test/tool-bindings.test.ts` | exact |
| `test/doctor-migration.test.ts` | test / integration | request-response / diagnostics | `test/tool-inventory-safety.test.ts` | role-match |
| `test/matrix-format.test.ts` | test / unit | transform / presentation | `test/tool-inventory-cli.test.ts` | role-match |
| `test/migrate-cli-guidance.test.ts` | test / unit | CLI routing / help check | `test/tool-inventory-cli.test.ts` | role-match |
| `test/migrate-docs-consistency.test.ts` | test / unit | declarative / parity check | `test/task-entry-docs.test.ts` | exact |

---

## Pattern Assignments

### `src/core/migrate.ts` (service / orchestrator, CRUD / transaction / file-I/O)

**Analog:** `src/core/update.ts` & `src/core/repair.ts` & `src/core/tool-record-store.ts`

**Imports pattern:**
```typescript
// Copy import style from src/core/update.ts:1-20, 56-83
import { createHash } from "node:crypto";
import { copyFile, stat, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { userStateRoot, packageRoot } from "./paths.js";
import {
  planToolRecordOperation,
  withToolRecordSession,
  beginToolOperation,
  appendToolResult,
  finishToolOperation,
} from "./tool-record-store.js";
import { readToolRecordStore, type ToolRecordStore, type ToolResult } from "./tool-records.js";
import { evaluateLegacyHandoff, prepareLegacyToolHandoff, type LegacyToolEvidence } from "./tool-handoff.js";
import { assessRetainedNpmHandoff } from "./tool-handoff-loader.js";
import { assertPlanUnchanged, reviewedDigest } from "./component-session.js";
import { applyFileTransaction } from "./transaction.js";
import type { HarnessId, ManagedToolId } from "../types.js";
```

**Non-destructive `.user-backup` pattern (D-05, D-06):**
```typescript
// Analogous to src/core/repair.ts:15-20 (quarantineJournal) and atomic copy
export async function createSafeUserBackup(filePath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.${timestamp}.user-backup`;
  await copyFile(filePath, backupPath);
  return backupPath;
}
```

**Core Migration Planning & Execution Pattern (SAFE-01, D-01 ~ D-04):**
```typescript
// Copy atomic tool record transaction pattern from src/core/update.ts:1395-1445
export async function planMigrationOperation(options: {
  tools?: ManagedToolId[];
  targets?: HarnessId[];
  resolveOwnership?: Record<string, "alpha-aos" | "external">;
  stateRoot?: string;
  packageRoot?: string;
}): Promise<MigrationPlan> {
  // 1. Gather legacy evidence across requested tools and targets
  // 2. Classify: ready | modified | ambiguous | unsupported
  // 3. Compute reviewed digest for SAFE-01 preview
  const digest = reviewedDigest("migrate-plan", { ... });
  return { ...plan, planDigest: digest };
}

export async function applyMigrationOperation(options: {
  planDigest: string;
  reviewedPlanToken: string;
  stateRoot?: string;
  packageRoot?: string;
}): Promise<MigrationApplyResult> {
  // Validate token & digest via assertPlanUnchanged
  // Execute within withToolRecordSession
  const recordPlan = await planToolRecordOperation({ ... });
  return await withToolRecordSession(recordPlan, async (session) => {
    await beginToolOperation(recordPlan, session);
    // Append ToolResult with type: 'migrate' and LegacyToolEvidence
    // Atomic finishToolOperation
  });
}
```

**Error Handling & Ambiguity Resolution (Fail-closed, D-07):**
```typescript
// Copy fail-closed pattern from src/core/component-session.ts:61-66
if (candidate.status === "ambiguous" && !resolvedOwnership[candidate.toolId]) {
  throw new Error(
    `Ambiguous ownership detected for '${candidate.toolId}'. ` +
    `Explicit resolution required: provide '--resolve-ownership ${candidate.toolId}=<alpha-aos|external>'`
  );
}
```

---

### `src/core/tool-bindings.ts` (service / SSOT resolver, request-response / store read)

**Analog:** `src/core/tool-bindings.ts` lines 19-31 (`acceptedToolResults`)

**Imports pattern:**
```typescript
// Source: src/core/tool-bindings.ts:1-13
import { userStateRoot, packageRoot } from "./paths.js";
import { readToolRecordStore, type ToolRecordStore, type ToolRecordEvent, type ToolResult } from "./tool-records.js";
import type { ManagedToolId, HarnessId } from "../types.js";
```

**SSOT Resolver Pattern (`resolveAcceptedToolRecord` / `assertAcceptedToolRecord`, D-09, D-10):**
```typescript
// Pattern to add to src/core/tool-bindings.ts
export interface AcceptedToolRecord {
  toolId: ManagedToolId | string;
  version: string;
  installationId: string;
  pathAlias: string;
  sourceUrl: string;
  digest: string;
  legacy?: import("./tool-handoff.js").LegacyToolEvidence;
}

export async function resolveAcceptedToolRecord(
  toolId: ManagedToolId | string,
  options: { stateRoot?: string; packageRoot?: string } = {}
): Promise<AcceptedToolRecord> {
  const store = await readToolRecordStore({
    stateRoot: options.stateRoot ?? userStateRoot(),
    packageRoot: options.packageRoot ?? packageRoot(),
  });

  if (store.status !== "current" || store.incomplete || !store.accepted) {
    throw new Error(
      `No accepted tool records found for '${toolId}' (store status: ${store.status}). ` +
      `Run 'alpha-aos migrate' to adopt existing installations or 'alpha-aos install' to set up.`
    );
  }

  const accepted = acceptedToolResults(store, toolId);
  const match = accepted.find((item) => item.result.installed !== null);
  if (!match || !match.result.installed || !match.result.resolved) {
    throw new Error(
      `Tool '${toolId}' has no accepted active release in local store. ` +
      `Run 'alpha-aos install --tool ${toolId}' or 'alpha-aos migrate'.`
    );
  }

  return {
    toolId,
    version: match.result.installed.version,
    installationId: match.result.installed.installationId,
    pathAlias: match.result.installed.pathAlias,
    sourceUrl: match.result.resolved.sourceUrl,
    digest: match.result.resolved.digest,
    legacy: match.result.legacy,
  };
}
```

---

### `src/cli.ts` (controller / CLI dispatcher, request-response)

**Analog:** `src/cli.ts` lines 1110-1135 (`install`) & 1640-1670 (`update`)

**Imports & Flag Parsing pattern:**
```typescript
// Copy from src/cli.ts:1110-1135
if (command === "migrate") {
  const parsed = parseClosedFlags(args.slice(1), {
    valueFlags: ["--tool", "--target", "--plan-digest", "--reviewed-plan", "--resolve-ownership"],
    booleanFlags: ["--apply", "--json"],
  });
  if (parsed.operands.length > 0) throw new Error(`Unexpected migrate argument: ${parsed.operands[0]}`);

  const apply = parsed.options.has("--apply");
  const planDigest = parsed.options.get("--plan-digest");
  const reviewedPlan = parsed.options.get("--reviewed-plan");
  const tools = parseManagedToolList(parsed.options.get("--tool") as string | undefined);
  const targets = parseTargetHarnessList(parsed.options.get("--target") as string | undefined);
  const resolveOwnership = parseOwnershipResolution(parsed.options.get("--resolve-ownership") as string | undefined);

  if (apply) {
    if (typeof planDigest !== "string" || typeof reviewedPlan !== "string") {
      throw new Error(
        'Applying migrate requires both --plan-digest and --reviewed-plan. ' +
        'Run "alpha-aos migrate" to preview and obtain a reviewed plan.'
      );
    }
    const result = await applyMigrationOperation({ ... });
    print(result, json, formatMigrationApplyResult(result));
  } else {
    const preview = await planMigrationOperation({ ... });
    print(preview, json, formatMigrationPreview(preview));
  }
}
```

**2-Track CLI Guidance Pattern (D-13):**
```typescript
// Copy from src/cli.ts:40-70 HELP block
// Delineate external-tool update from engine deployment
const HELP = `alpha-aos
...
External Tool Updates:
  alpha-aos update [--tool <id>] [--target <harness>] [--check] [--apply ...]
    (Updates managed external tools: Cua, GSD, ECC, MCP servers. Does not update alpha-AOS engine)

Engine Deployment (alpha-AOS code):
  Workstation:  npm run deploy:local
  Global npm:   npm install -g alpha-aos@latest
...`;
```

---

### `src/format.ts` (presenter / formatter, transform)

**Analog:** `src/format.ts` lines 2308-2370 (`formatLocalReleasePreview`) & 88-115 (`formatToolInventory`)

**Matrix Table Formatting Pattern (MIG-04, D-14):**
```typescript
// Copy table styling from src/format.ts:2308-2370
export interface ComponentHarnessMatrixRow {
  toolId: string;
  harness: string;
  status: "retained" | "updated" | "failed" | "recovered" | "unverified";
  sharedConfigImpact: string;
  actionRequired: string;
}

export function formatComponentHarnessMatrix(rows: ComponentHarnessMatrixRow[]): string {
  const lines: string[] = [
    "=== COMPONENT & HARNESS OUTCOME MATRIX ===",
    "",
    "| Tool | Harness | Status | Shared Config Impact | Action Required |",
    "|---|---|---|---|---|",
  ];

  for (const row of rows) {
    const badge =
      row.status === "updated" ? "UPDATED [OK]" :
      row.status === "retained" ? "RETAINED [SKIP]" :
      row.status === "recovered" ? "RECOVERED [ROLLBACK]" :
      row.status === "unverified" ? "UNVERIFIED [PENDING]" :
      "FAILED [ERR]";

    lines.push(
      `| ${row.toolId} | ${row.harness} | ${badge} | ${row.sharedConfigImpact} | ${row.actionRequired} |`
    );
  }

  return lines.join("\n");
}
```

---

### `src/core/doctor.ts` (service / diagnostic, request-response / read)

**Analog:** `src/core/doctor.ts` lines 44-80 & `src/core/isolation.ts` lines 489-515

**SSOT Alignment & Backup Hygiene Diagnostic Pattern (D-08, D-12):**
```typescript
// Copy finding structure from src/core/doctor.ts:50-70
export async function diagnoseToolRecordsAlignment(
  stateRoot: string = userStateRoot(),
  packageRoot: string = packageRoot()
): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  const store = await readToolRecordStore({ stateRoot, packageRoot });

  if (store.status !== "current" || !store.accepted) {
    findings.push({
      level: "warn",
      code: "TOOL_RECORDS_UNINITIALIZED",
      message: "No accepted local tool records found. Run 'alpha-aos migrate' to adopt existing installations.",
    });
    return findings;
  }

  // Check backup integrity and hygiene (.user-backup)
  // Verify SSOT parity with harness configurations
  return findings;
}
```

---

### `src/core/mcp.ts` & `src/core/isolation.ts` & `src/core/install.ts` (consumers converting to SSOT, MIG-02)

**Analog:** `src/core/mcp.ts` lines 645-665 & `src/core/install.ts` lines 415-430

**SSOT Replacement Pattern (D-10, D-11):**
```typescript
// Replace direct loadLock() or stack.lock.json reads:
// BEFORE:
// const cuaPin = JSON.parse(await readFile(join(packageRoot(), "catalog", "computer-use-runtime.json"), "utf8"));
// const gsd = options.lock.components.gsd;

// AFTER:
import { resolveAcceptedToolRecord } from "./tool-bindings.js";

const cuaRecord = await resolveAcceptedToolRecord("cua-driver", { stateRoot: options.stateRoot });
const gsdRecord = await resolveAcceptedToolRecord("gsd", { stateRoot: options.stateRoot });
```

---

### `test/migrate.test.ts` & `test/migrate-ownership.test.ts` (test / integration)

**Analog:** `test/tool-handoff.test.ts` lines 16-50 & `test/update.test.ts` lines 40-70

**Integration Test Structure Pattern:**
```typescript
// Copy fixture & transaction harness from test/tool-handoff.test.ts:16-31
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planMigrationOperation, applyMigrationOperation } from "../src/core/migrate.js";
import { readToolRecordStore } from "../src/core/tool-records.js";

test("migrate detects legacy installation and creates safe .user-backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-migrate-"));
  try {
    const stateRoot = join(root, "state"), home = join(root, "home");
    // set up fixture legacy files
    // execute planMigrationOperation -> assert .user-backup planned
    // execute applyMigrationOperation -> assert .user-backup exists and tool-record accepted
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

---

### `test/migrate-docs-consistency.test.ts` (test / unit, bilingual parity)

**Analog:** `test/task-entry-docs.test.ts` lines 1-50

**Bilingual Docs Parity Pattern (MIG-03):**
```typescript
// Copy exact parity assertion from test/task-entry-docs.test.ts:20-43
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import { assertNoPrivatePaths } from "../src/core/release-package-proof.js";

test("migration guides and README keep bilingual section and command parity", async () => {
  const root = packageRoot();
  const guides = ["docs/guides/migration.md", "docs/guides/migration.ko.md"];
  for (const path of guides) {
    const text = await readFile(join(root, path), "utf8");
    assertNoPrivatePaths(text, path);
    // Check balanced code fences
    assert.equal([...text.matchAll(/^\s*```/gmu)].length % 2, 0, `unbalanced fence: ${path}`);
    // Check 2-track terms
    assert.ok(text.includes("npm run deploy:local"), `${path}: deploy:local missing`);
    assert.ok(text.includes("alpha-aos update"), `${path}: update missing`);
  }
});
```

---

## Shared Patterns

### Safe Transaction & Plan Digest Binding (SAFE-01)
**Source:** `src/core/component-session.ts` lines 61-75 & `src/core/tool-record-store.ts` lines 75-105  
**Apply to:** `src/core/migrate.ts`, `src/cli.ts`
```typescript
const digest = reviewedDigest("migrate-plan", {
  operationId,
  occurredAt,
  tools: options.tools,
  targets: options.targets,
  candidates: plannedCandidates,
});
// Validation on apply:
assertPlanUnchanged(reviewedPlan, revalidatedPlan);
```

### Fail-Closed on Missing Records (MIG-02)
**Source:** `src/core/tool-bindings.ts`  
**Apply to:** `src/core/mcp.ts`, `src/core/isolation.ts`, `src/core/doctor.ts`, `src/core/install.ts`
```typescript
if (!match || !match.result.installed) {
  throw new Error(
    `Tool '${toolId}' has no accepted active release in local store. ` +
    `Run 'alpha-aos install --tool ${toolId}' or 'alpha-aos migrate'.`
  );
}
```

### Non-destructive File Preservation (SAFE-02)
**Source:** `src/core/transaction.ts` lines 353-418 & `src/core/path-boundary.ts`  
**Apply to:** `src/core/migrate.ts` (user config adoption)
```typescript
// 1. Create .user-backup copy before touching existing file
// 2. Only modify marker region '# alpha-aos:start' ~ '# alpha-aos:end'
// 3. Keep user custom configurations intact outside markers
```

---

## No Analog Found

Every file to be created or modified has a strong, directly applicable analog in the git-tracked codebase:
- All 19 planned files have exact or role-matched patterns.
- No new external libraries or foreign architectural patterns are introduced.

---

## Metadata

**Analog search scope:** `src/core/*.ts`, `src/*.ts`, `test/*.ts`, `docs/**/*.md`, `skills/**/*.md`  
**Files scanned:** 65+ tracked files  
**Pattern extraction date:** 2026-11-09  
