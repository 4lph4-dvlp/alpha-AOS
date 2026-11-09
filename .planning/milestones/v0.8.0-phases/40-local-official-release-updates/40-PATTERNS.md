# Phase 40: Local Official Release Updates - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types.ts` | model | transform | `src/types.ts`, `src/core/tool-records.ts` | exact |
| `src/core/update.ts` | service | request-response | `src/core/update.ts`, `src/core/tool-handoff-loader.ts` | exact |
| `src/core/computer-use-install.ts` | service | file-I/O | `src/core/computer-use-install.ts`, `src/core/tool-handoff-loader.ts` | exact |
| `src/core/install.ts` | service | batch | `src/core/install.ts`, `src/core/tool-record-store.ts` | exact |
| `src/cli.ts` | controller | request-response | `src/cli.ts` (`inventory`, `install`, `update` branches) | exact |
| `src/format.ts` | utility | transform | `src/format.ts` (`formatToolInventory`, `formatUpdate`, `formatProjectModePlan`) | exact |
| `test/local-release-update.test.ts` | test | request-response | `test/update.test.ts`, `test/tool-inventory.test.ts`, `test/tool-records.test.ts` | role-match |
| `test/cua-release-update.test.ts` | test | file-I/O | `test/install.test.ts`, `test/tool-inventory.test.ts` | role-match |

## Pattern Assignments

### `src/types.ts` (model, transform)

**Analog:** `src/types.ts` (lines 17-50, 166-192) and `src/core/tool-records.ts` (lines 9-15)

**Imports & finite union pattern** (`src/types.ts` lines 11-20):
```typescript
import type { CapabilityLedger, NativeUseState } from "./core/capability-ledger.js";
import type { PackState } from "./core/project-plan.js";
import type { WriterStatus } from "./core/writer-lock.js";

export type { CapabilityLedger, NativeUseState, PackState };

export type HarnessId = "claude" | "codex" | "antigravity" | "pi" | "hermes";
export type McpServerId = "context7" | "exa" | "firecrawl";
export type Channel = "stable" | "candidate" | "pinned";
export type IsolationMode = "managed" | "project-only" | "sealed";
```

**Core domain contract pattern** (`src/types.ts` lines 166-192):
```typescript
export interface LockedPackage {
  package: string;
  version: string;
  integrity: string;
}

export interface StackLock {
  schemaVersion: 1;
  channel: Channel;
  generatedAt: string | null;
  status?: string;
  components: {
    gsd?: LockedPackage & { profile: string };
    ecc?: LockedPackage & {
      skills: string[];
      sourceSha256: Record<string, string>;
      targetSha256: Record<string, Partial<Record<HarnessId, string>>>;
    };
    mcp?: Record<string, LockedPackage>;
    mcpBridges?: Partial<Record<HarnessId, LockedPackage>>;
    ownedSkills?: Record<string, {
      sourceSha256: string;
      targetSha256: Partial<Record<HarnessId, string>>;
      upstreamWorkflow?: string;
    }>;
  };
}
```

**Tool record & release identity contract pattern** (`src/core/tool-records.ts` lines 9-12):
```typescript
export interface ToolIdentity { toolId: string; installationId: string }
export interface ToolEvidence { proofId: string; subject: string; target: string; method: string; result: string; platform: string; architecture: string; harness: string | null; fingerprint?: string }
export interface ToolResult { toolId: string; requested: { toolId: string; selector: string; exact: boolean }; resolved: { release: string; artifact: string; architecture: string; digest: string; sourceId: string; sourceUrl: string; platform: string } | null; installed: { installationId: string; version: string; pathAlias: string } | null; verified: string | null; evidence: ToolEvidence[]; outcome: string; legacy?: import("./tool-handoff.js").LegacyToolEvidence }
```

---

### `src/core/update.ts` (service, request-response)

**Analog:** `src/core/update.ts` (lines 1-217), `src/core/tool-handoff-loader.ts` (lines 38-60), and `src/core/ecc-fixture.ts` (lines 86-128)

**Imports pattern** (`src/core/update.ts` lines 1-18):
```typescript
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { LockedPackage, StackLock } from "../types.js";
import { userStateRoot } from "./paths.js";
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

**Core npm registry query pattern** (`src/core/update.ts` lines 19-33):
```typescript
interface RegistryDocument {
  version: string;
  dist?: { integrity?: string };
}

async function latestPackage(name: string): Promise<LockedPackage> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${name}`);
  const body = await response.json() as RegistryDocument;
  if (!body.version || !body.dist?.integrity) throw new Error(`npm metadata incomplete for ${name}`);
  return { package: name, version: body.version, integrity: body.dist.integrity };
}
```
*Phase 40 extension notes for `update.ts`:*
- Enforce stable SemVer check on `body.version`: if `!/^\d+\.\d+\.\d+$/.test(body.version)` (e.g. contains `-alpha`, `-beta`, `-rc`, `-nightly`), record refusal code `"latest-is-prerelease"` (`D-09`) without falling back to an older version.
- For bound `--apply` revalidation (`D-06`), fetch `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(boundVersion)}` rather than `/latest`.
- For Cua (`cua-driver`), query `https://api.github.com/repos/trycua/cua/releases?per_page=100&page=${page}` across bounded pages (`1..10`), filtering `!release.draft`, matching `^cua-driver-rs-v(\d+\.\d+\.\d+)$` (allowing GitHub's `prerelease: true` boolean while excluding `nightly-*` and withdrawn `"0.28.3"`), and refusing with `"unsupported-platform"` or `"incomplete-discovery"` (`D-10`, `D-12`).

**In-memory `.tgz` extraction pattern for dynamic ECC skill hashes** (`src/core/tool-handoff-loader.ts` lines 38-60 and `src/core/ecc-fixture.ts` lines 86-97):
```typescript
function manifestFromArchive(archive: Buffer): Buffer {
  const tar = gunzipSync(archive, { maxOutputLength: 32 * 1024 * 1024 });
  let found: Buffer | null = null;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, end: number) => header.subarray(start, end).toString("utf8").split("\0")[0] ?? "";
    const sizeText = field(124, 136).trim(), checksumText = field(148, 156).trim();
    if (!/^[0-7]+$/.test(sizeText) || !/^[0-7]+$/.test(checksumText)) throw new Error("invalid tar");
    const sum = [...header].reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (sum !== parseInt(checksumText, 8)) throw new Error("invalid tar checksum");
    const size = parseInt(sizeText, 8), type = header[156], prefix = field(345, 500), name = `${prefix ? `${prefix}/` : ""}${field(0, 100)}`;
    const start = offset + 512, end = start + size;
    if (!Number.isSafeInteger(size) || end > tar.length || ![0, 48, 53].includes(type ?? -1)) throw new Error("unsupported tar entry");
    if (name === "package/package.json") {
      if (found || type === 53 || size > 256 * 1024) throw new Error("ambiguous manifest");
      found = Buffer.from(tar.subarray(start, end));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  if (!found) throw new Error("manifest missing");
  return found;
}
```
*Phase 40 note:* Reuse this exact USTAR walk in memory over the `ecc-universal` tarball (`package/skills/${skill}/SKILL.md`) and pass each skill source through `renderEccSkill(skill, source, harness)` (`src/core/ecc-fixture.ts:86-128`) so `sourceSha256` and `targetSha256` are populated in the synthesized `StackLock` without writing to disk (`SAFE-01`) or failing `requireEccLock` (`src/core/ecc-skills.ts:62-69`).

**Plan digest & drift guard pattern** (`src/core/update.ts` lines 136-146, 181-190):
```typescript
  const digest = reviewedDigest("candidate-stage", {
    root: resolve(root),
    target,
    stateRoot,
    allowedRoots,
    currentHash,
    renderedHash,
    action,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });
```
```typescript
  const revalidated = await planCandidateStage(reviewed.root, candidate, { stateRoot: reviewed.stateRoot });
  assertPlanUnchanged(reviewed, revalidated);
```

---

### `src/core/computer-use-install.ts` (service, file-I/O)

**Analog:** `src/core/computer-use-install.ts` (lines 1-107) and `src/core/tool-handoff-loader.ts` (lines 71-85)

**Imports & path safety guard pattern** (`src/core/computer-use-install.ts` lines 1-18):
```typescript
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import { runProcess, type ProcessSpec } from "./process.js";
import type { MutationSession } from "./writer-lock.js";

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
interface Asset {
  os: string; arch: string; entrypoint: string; installedEntrypoint?: string;
  files: Record<string, string>; installedFiles?: Record<string, string>;
}
interface Pin {
  version: string; assets: Asset[];
  installer: { directory: string; sourceCommit: string; files: Record<string, string> };
}
const safeName = (name: string): boolean => /^(?:[\w.@+-]+\/)*[\w.@+-]+$/.test(name) && name.split("/").every((part) => part !== "." && part !== "..");
```

**Core verification & installer spec pattern** (`src/core/computer-use-install.ts` lines 40-94):
```typescript
export async function verifyOfficialCua(executable: string, root = packageRoot()) {
  const { pin, asset } = await loadPin(root);
  const entrypoint = asset.installedEntrypoint ?? asset.entrypoint;
  if (!safeName(entrypoint)) throw new Error("Invalid Cua entrypoint");
  const resolved = await realpath(executable);
  let runtimeRoot = resolved;
  for (const _part of entrypoint.split("/")) runtimeRoot = dirname(runtimeRoot);
  if (await realpath(join(runtimeRoot, entrypoint)) !== resolved) throw new Error("Invalid installed Cua layout");
  const files = asset.installedFiles ?? asset.files;
  if (!files[entrypoint] || Object.keys(files).length > 128) throw new Error("Invalid installed Cua manifest");
  for (const [name, digest] of Object.entries(files)) {
    if (!safeName(name) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid installed Cua file pin");
    const file = join(runtimeRoot, name);
    const rel = relative(runtimeRoot, await realpath(file));
    const stat = await lstat(file);
    if (rel.startsWith("..") || isAbsolute(rel) || !stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024 || hash(await readFile(file)) !== digest) throw new Error("Installed Cua bytes differ from the reviewed release");
  }
  return { executable: resolved, version: pin.version, executableHash: files[entrypoint]! };
}

export async function planCuaInstall(_stateRoot = userStateRoot(), root = packageRoot()) {
  const { pin, pinHash } = await loadPin(root);
  const paths = officialCuaPaths();
  ...
  const spec: ProcessSpec = {
    executable: process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "/bin/bash",
    args: process.platform === "win32"
      ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", join(directory, "install.ps1"), "-Release", pin.version, "-NoAutoStart"]
      : [join(directory, "install.sh")],
    cwd: directory, timeoutMs: 300_000, maxOutputBytes: 1024 * 1024,
    environment: {
      optional: ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "SHELL"],
      literal: {
        CUA_DRIVER_RS_VERSION: pin.version, CUA_DRIVER_RS_KEEP_VERSIONS: "0",
        CUA_DRIVER_RS_TELEMETRY_ENABLED: "false", CUA_DRIVER_RS_UPDATE_CHECK: "false",
      },
    },
  };
  return { ...paths, legacyConflicts, targetRoot: paths.packageHome, current, pinHash, spec };
}
```
*Phase 40 extension notes for `computer-use-install.ts`:*
- Allow passing a dynamically verified Cua release pin (`version`, `asset`, `archiveSha256`, `installedFiles`) derived after verifying `SHA256SUMS` and `<asset>.sigstore.json` against the reviewed publisher workflow identity (`https://github.com/trycua/cua/.github/workflows/cd-rust-cua-driver.yml@refs/tags/cua-driver-rs-v<version>`, OIDC issuer `https://token.actions.githubusercontent.com`) (`D-13`, `D-14`).
- Change `CUA_DRIVER_RS_KEEP_VERSIONS` from `"0"` to `"2"` (or configurable >= 2) so at least the newly installed version and the immediately preceding working version directory in `~/.cua-driver/packages/releases/` are retained (`D-15`).

**Cryptographic signature & policy verification pattern** (`src/core/tool-handoff-loader.ts` lines 81-84):
```typescript
    const der = Buffer.from(key.key, "base64"), publicKey = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.keyid !== `SHA256:${createHash("sha256").update(der).digest("base64")}` || publicKey.asymmetricKeyType !== "ec" || publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1" || !verify("sha256", Buffer.from(`${pkg}@${record.version}:${record.integrity}`), publicKey, Buffer.from(record.signature, "base64"))) return missing("registry-signature-invalid");
    const archive = await readProven(join(dir, "artifact.tgz"), options.stateRoot, 16 * 1024 * 1024);
    if (`sha512-${createHash("sha512").update(archive).digest("base64")}` !== record.integrity) return missing("artifact-integrity-mismatch");
```

---

### `src/core/install.ts` (service, batch)

**Analog:** `src/core/install.ts` (lines 376-972) and `src/core/tool-record-store.ts` (lines 44-150)

**Options & read-only planning pattern** (`src/core/install.ts` lines 376-416):
```typescript
export interface ManagedInstallOptions {
  root: string;
  catalog: StackCatalog;
  lock: StackLock;
  inventory: Inventory;
  requestedTargets?: HarnessId[];
  /** Defaults to the user state root; named explicitly by the bootstrap service. */
  stateRoot?: string;
  /**
   * Reuses reviewed fixture locations, keyed by fixture id, so re-reading the
   * plan produces the same digest instead of naming fresh temp directories.
   */
  fixtureRoots?: Readonly<Record<string, string>>;
}

export async function createManagedInstallPlan(options: ManagedInstallOptions): Promise<ManagedInstallPlan> {
  requirePreflight(options.inventory);
  const selection = selectInstallTargets(options.inventory, options.requestedTargets);
  const steps: ManagedInstallStep[] = [];
  if (selection.targets.includes("codex")) {
    const plan = await planCodexPolicy({ root: options.root, ...installStateOptions(options) });
    steps.push({ id: "policy:codex-execution", component: "execution-policy", target: "codex", action: plan.action, external: false, note: plan.target });
  }
  const gsd = options.lock.components.gsd;
  const ecc = options.lock.components.ecc;
  if (!gsd || !ecc) throw new Error("Stable lock is missing GSD or ECC");

  for (const target of selection.targets.filter((value): value is GsdFixtureHarness => gsdHarnesses.includes(value as GsdFixtureHarness))) {
    const state = await inspectGsdInstall(target, options.lock);
    steps.push({
      id: `gsd:${target}`, component: "gsd", target,
      action: state.current ? "current" : "install", external: true,
      note: state.current ? `${state.version}/${state.profile}/${state.runtime}` : `fixture then ${gsd.package}@${gsd.version} (${gsd.profile})`,
    });
  }
```

**Aggregate operation revalidation, single-writer execution, and rollback pattern** (`src/core/install.ts` lines 830-850, 956-971):
```typescript
  // The whole aggregate is re-read before anything is acquired or run.
  assertPlanUnchanged(reviewed, await createManagedInstallOperationPlan({
    root: reviewed.root,
    catalog: options.catalog,
    lock: options.lock,
    inventory: options.inventory,
    stateRoot: reviewed.stateRoot,
    fixtureRoots: reviewed.fixtureRoots,
    ...(options.requestedTargets === undefined ? {} : { requestedTargets: options.requestedTargets }),
  }));

  return withComponentSession({ kind: "managed-install", stateRoot, proofs: reviewed.proofs, digest: reviewed.digest }, options.session, async (session) => {
  try {
    if (reviewed.cua.current) current.push("cua:runtime");
    else {
      // Native installers may have partially changed their own state on failure.
      externalChanges.push("cua:runtime");
      await installCua(reviewed.cua, session);
      applied.push("cua:runtime");
    }
```
```typescript
    return { plan: await createManagedInstallPlan(options), applied, current, operationIds, externalChanges };
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const entry of [...rollback].reverse()) {
      try {
        await rollbackFileTransaction(stateRoot, entry.id, [entry.allowedRoot]);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    const external = externalChanges.length > 0 ? ` External installer steps may have changed native state (not automatically rolled back): ${externalChanges.join(", ")}.` : "";
    const rollbackNote = rollbackErrors.length > 0 ? ` Rollback errors: ${rollbackErrors.join("; ")}.` : "";
    throw new Error(`${message}.${external}${rollbackNote}`);
  }
  });
```
*Phase 40 extension notes for `install.ts`:*
- Support `selectedTools?: readonly ManagedToolId[]` and dynamic `cuaPin` in `ManagedInstallOptions` so `--tool` filtering (`D-02`) and `update` only plan and execute the requested/changed tools.
- Persist local release operation records (`started` → `tool-result` → `finished`) via `planToolRecordOperation`, `beginToolOperation`, `appendToolResult`, and `finishToolOperation(recordPlan, session, [])` (`src/core/tool-record-store.ts:44-150`) with `verified: null` and `acceptedTransitions: []` (`D-16`).

---

### `src/cli.ts` (controller, request-response)

**Analog:** `src/cli.ts` (`parseClosedFlags` at lines 252-288, `inventory` at lines 1038-1076, `install` at lines 1084-1108, `update` at lines 1598-1628)

**Closed flag parsing & tool ID validation pattern** (`src/cli.ts` lines 1038-1048):
```typescript
  if (command === "inventory") {
    const parsed = parseClosedFlags(args.slice(1), { valueFlags: ["--tool", "--operation"], booleanFlags: ["--detail", "--history", "--json"] });
    if (parsed.operands.length) throw new Error("Unexpected inventory argument");
    const tool = parsed.options.get("--tool"), operation = parsed.options.get("--operation");
    const history = parsed.options.has("--history"), detail = parsed.options.has("--detail");
    if (history && typeof tool !== "string") throw new Error("--history requires --tool");
    if ((operation && (tool || history || detail)) || (history && detail)) throw new Error("Incompatible inventory options");
    const ids = ["cua-driver", "gsd", "ecc", "mcp:context7", "mcp:exa", "mcp:firecrawl", "bridge:pi"];
    if (typeof tool === "string" && !ids.includes(tool)) throw new Error(`Unsupported tool: ${tool}`);
    if (typeof operation === "string" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operation)) throw new Error("Invalid operation ID");
```

**Install & Update CLI dispatch pattern** (`src/cli.ts` lines 1084-1108 and 1598-1628):
```typescript
  if (command === "install") {
    const inventory = collectInventory(catalog);
    const requestedTargets = optionalHarnessList(optionValue(args, "--target"));
    const installOptions = { root, catalog, lock, inventory, ...(requestedTargets ? { requestedTargets } : {}) };
    if (!hasFlag(args, "--apply")) {
      const plan = await createManagedInstallPlan(installOptions);
      print(plan, json, [
        `alpha-AOS managed install (${plan.selection})`,
        `Targets: ${plan.targets.join(", ")}`,
        ...plan.steps.map((step) => `${step.action.toUpperCase().padEnd(7)} ${step.id} - ${step.note}`),
        ...plan.warnings.map((warning) => `WARNING ${warning}`),
        "Dry-run only. Pass --apply to fixture, apply, and verify the selected stack.",
      ].join("\n"));
    } else {
      const result = await applyManagedInstall(installOptions);
      print(result, json, [
        `alpha-AOS install complete: ${result.plan.targets.join(", ")}`,
        `Applied: ${result.applied.length > 0 ? result.applied.join(", ") : "none"}`,
        `Already current: ${result.current.length > 0 ? result.current.join(", ") : "none"}`,
        `Journaled operations: ${result.operationIds.length}`,
        `External verified changes retained outside journal rollback: ${result.externalChanges.length > 0 ? result.externalChanges.join(", ") : "none"}`,
      ].join("\n"));
    }
    return;
  }
```
*Phase 40 extension notes for `src/cli.ts`:*
- Both `install` and `update` accept `--tool <id[,id]>`, `--target <harness[,harness]>`, `--apply`, `--plan-digest <digest>`, `--reviewed-plan <token>`, and `--json` (`update` also accepts `--check` as an alias for default preview).
- If `update` receives `--stage`, refuse immediately with an explicit deprecation error directing the user to `alpha-aos update` (preview) and `alpha-aos update --apply --plan-digest <digest> --reviewed-plan <token>` (`D-04`).
- If `install --apply` or `update --apply` is called from the CLI without `--plan-digest` and `--reviewed-plan`, refuse before any mutation and instruct the user to run the preview command first (`D-05`).

---

### `src/format.ts` (utility, transform)

**Analog:** `src/format.ts` (`table` at lines 54-58, `formatToolInventory` at lines 60-63, `formatProjectModePlan` at lines 566-582, `formatUpdate` at lines 647-661)

**Table helper & tool inventory formatting pattern** (`src/format.ts` lines 54-63):
```typescript
function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const render = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ").trimEnd();
  return [render(headers), render(widths.map((width) => "-".repeat(width))), ...rows.map(render)].join("\n");
}

export function formatToolInventory(inventory: import("./core/tool-inventory.js").ToolInventory): string {
  const diagnostics = inventory.records.diagnostics.length ? `\nRecord diagnostics: ${inventory.records.diagnostics.join(", ")}` : "";
  return [inventory.observations.map((item) => `${item.toolId}: installation=${item.installation}, installed=${item.installed?.version ?? "unknown"}, selected=${item.selected?.version ?? "unknown"}, integrity=${item.integrity}, integration=${item.integration}\n${item.reason}; ${item.nextAction}\n  accepted=${item.acceptedIdentity?.version ?? "none"}; latest operation=${item.latestOperation?.operationId ?? "none"}, status=${item.latestOperation?.status ?? "unknown"}, outcome=${item.latestOperation?.outcome ?? "unknown"}\n  proof scopes: ${JSON.stringify(item.proofScopes ?? {})}\n  handoff=${item.handoff?.status ?? "needs-evidence"}${(item.candidates ?? []).map((candidate) => `\n  candidate ${candidate.path}: version=${candidate.version ?? "unknown"}, installation owner=${candidate.installationOwner}`).join("")}${(item.bindings ?? []).map((binding) => `\n  ${binding.harness}: ${binding.status}, candidate=${binding.candidatePath ?? "unknown"}, connection owner=${binding.connectionOwner}, ${binding.reason}`).join("")}${(item.diagnostics ?? []).map((diagnostic) => `\n  ${diagnostic.severity}: ${diagnostic.code}`).join("")}`).join("\n"), ...(inventory.categorySummaries ?? []).map((s) => `${s.category}: ${s.count} (installed=${s.statuses.installed}, absent=${s.statuses.absent}, unknown=${s.statuses.unknown})`), `Records: ${inventory.records.status}${diagnostics}`].filter(Boolean).join("\n");
}
```

**Digest-bound preview formatting pattern** (`src/format.ts` lines 566-582):
```typescript
export function formatProjectModePlan(plan: ProjectModePlan): string {
  return [
    `Project: ${plan.canonicalRoot}`,
    `Root reason: ${plan.rootReason}`,
    `Project ID: ${plan.projectId}`,
    `Root identity: ${plan.rootIdentity.deviceExact}:${plan.rootIdentity.inodeExact}`,
    `Policy path: ${plan.policyPath}`,
    `Coordinator path: ${plan.coordinatorPath}`,
    `Current mode: ${plan.currentMode} (${plan.currentSource}, revision ${plan.currentRevision})`,
    `Requested mode: ${plan.requestedMode}`,
    `Planned change: ${plan.change}`,
    `Plan digest: ${plan.planDigest}`,
    plan.change === "current"
      ? "Already current. Applying this plan will perform no writes."
      : "Preview only. Nothing was written: applying requires --apply with this plan digest.",
  ].join("\n");
}
```
*Phase 40 extension notes for `src/format.ts`:*
- Place changed tools (`action === "install" || action === "update"`) first, and for each changed tool render in order (`D-07`):
  1. Old/accepted version → new version, official source, and artifact identity/digest summary
  2. Affected harnesses (including shared installation blast radius across other harnesses)
  3. Native installer side effects (e.g., Windows junctions/PATH, macOS `/Applications/CuaDriver.app`, Linux `~/.local/bin` & Wayland helper, npm global prefix)
  4. Recovery scope (alpha-AOS file transactions auto-rolled back vs adapter recovery / retained prior Cua release directory / external state)
- Summarize unchanged (`current`) or skipped absent (`미설치 · 변경 없음`) tools concisely at the bottom, followed by the copy-pasteable `--apply --plan-digest <digest> --reviewed-plan <token>` command (or refusal guidance if any tool discovery failed per `D-11`).

---

### `test/local-release-update.test.ts` (test, request-response)

**Analog:** `test/update.test.ts` (lines 1-139) and `test/tool-inventory.test.ts` (lines 19-72)

**Imports & fixture setup pattern** (`test/update.test.ts` lines 1-25, 49-54):
```typescript
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ComponentPlanError } from "../src/core/component-session.js";
import { listManagedTransactions } from "../src/core/transaction.js";
import { acquireMutationSession, inspectWriterState, writerLockPath } from "../src/core/writer-lock.js";
import type { StackLock } from "../src/types.js";

async function stageFixture(context: test.TestContext): Promise<{ root: string; stateRoot: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-candidate-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "catalog"), { recursive: true });
  return { root, stateRoot: join(root, "state"), target: candidateLockPath(root) };
}
```

**Zero-write preview & `plan-drift` assertion pattern** (`test/update.test.ts` lines 68-70, 120-138):
```typescript
  assert.equal(existsSync(fixture.target), false, "planning writes nothing");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "planning takes no writer");
```
```typescript
  await assert.rejects(
    () => writeCandidate(fixture.root, candidate, { plan, stateRoot: fixture.stateRoot }),
    (error: unknown) => {
      assert.ok(error instanceof ComponentPlanError);
      assert.equal(error.code, "plan-drift");
      return true;
    },
  );
  assert.equal(await readFile(fixture.target, "utf8"), interfering, "a refused stage leaves the file alone");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
```

---

### `test/cua-release-update.test.ts` (test, file-I/O)

**Analog:** `test/install.test.ts` (lines 75-155) and `test/tool-inventory.test.ts` (lines 19-47)

**Synthetic home & environment isolation pattern** (`test/install.test.ts` lines 76-100):
```typescript
async function syntheticHome(context: test.TestContext): Promise<{ home: string; restore: () => void }> {
  const home = await mkdtemp(join(tmpdir(), "alpha-aos-install-home-"));
  context.after(async () => rm(home, { recursive: true, force: true }));
  const saved = new Map<string, string | undefined>();
  const set = (name: string, value: string | undefined): void => {
    saved.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  set("HOME", home);
  set("USERPROFILE", home);
  set("CODEX_HOME", join(home, ".codex"));
  set("CLAUDE_CONFIG_DIR", undefined);
  set("ANTIGRAVITY_CONFIG_DIR", undefined);
  set("PI_CODING_AGENT_DIR", undefined);
  set("HERMES_HOME", undefined);
  const restore = (): void => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  context.after(restore);
  return { home, restore };
}
```

**Tool record operation assertion pattern** (`test/tool-inventory.test.ts` lines 43-45):
```typescript
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "accepted", occurredAt: "2026-01-01T00:00:00Z", requests });
    await withToolRecordSession(plan, async (session) => { await beginToolOperation(plan, session); for (const result of results) await appendToolResult(plan, session, result); await finishToolOperation(plan, session, results.map((result) => ({ toolId: result.toolId, installationId: result.installed!.installationId, proofId: "invoke", priorDigest: null }))); });
```
*Phase 40 test note:* In Phase 40 (`D-16`), `finishToolOperation(plan, session, [])` is called with an empty `acceptedTransitions` array and `verified: null`, proving that unexecuted host invocation checks remain `"unverified"` and prior `accepted` chains are preserved.

---

## Shared Patterns

### 1. Preview-Apply Digest Binding & Drift Refusal (`D-05`, `D-06`, `D-08`)
**Source:** `src/core/component-session.ts` (lines 21-36, 65-67, 117-124)
**Apply to:** `src/core/update.ts`, `src/core/install.ts`, `src/cli.ts`
```typescript
export type ComponentPlanCode =
  | "plan-incomplete"
  | "plan-drift"
  | "unplanned-path"
  | "boundary-changed"
  | "source-drift"
  | "session-mismatch";

export class ComponentPlanError extends Error {
  readonly code: ComponentPlanCode;
  constructor(code: ComponentPlanCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ComponentPlanError";
    this.code = code;
  }
}

export function reviewedDigest(kind: string, content: unknown): string {
  return createHash("sha256").update(`${kind}\n${JSON.stringify(content)}`, "utf8").digest("hex");
}

export function assertPlanUnchanged(reviewed: ReviewedPlanBoundary, revalidated: ReviewedPlanBoundary): void {
  if (revalidated.digest !== reviewed.digest) {
    throw new ComponentPlanError(
      "plan-drift",
      `${reviewed.kind} changed between review and apply: reviewed ${reviewed.digest.slice(0, 12)}, observed ${revalidated.digest.slice(0, 12)}`,
    );
  }
}
```

### 2. Local Tool Record Persistence & Source URL Validation (`D-16`)
**Source:** `src/core/tool-records.ts` (lines 54-69) and `src/core/tool-record-store.ts` (lines 44-52, 116-150)
**Apply to:** `src/core/update.ts`, `src/core/install.ts`
```typescript
export function safeToolRecordSource(result: ToolResult): boolean {
  if (result.toolId !== result.requested.toolId) return false;
  if (result.legacy) {
    const legacy = result.legacy;
    if (legacy.toolId !== result.toolId || !safeToolRecordSource({ toolId: legacy.toolId, requested: result.requested, resolved: { release: legacy.release, artifact: legacy.artifact, platform: legacy.platform, architecture: legacy.architecture, digest: legacy.artifactDigest, sourceId: legacy.sourceId, sourceUrl: legacy.sourceUrl }, installed: null, verified: null, evidence: [], outcome: "unknown" })) return false;
  }
  if (!result.resolved) return true;
  try {
    const url = new URL(result.resolved.sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port) return false;
    if (result.resolved.sourceId === "driver-release") return result.toolId === "cua-driver" && url.hostname === "github.com" && url.pathname.startsWith("/trycua/cua/releases/download/");
    const packages: Record<string, string> = { gsd: "@opengsd/gsd-core", ecc: "ecc-universal", "mcp:context7": "@upstash/context7-mcp", "mcp:exa": "exa-mcp-server", "mcp:firecrawl": "firecrawl-mcp", "bridge:pi": "pi-mcp-adapter" };
    const expected = packages[result.toolId], path = decodeURIComponent(url.pathname);
    return result.resolved.sourceId === "npm-registry" && url.hostname === "registry.npmjs.org" && expected !== undefined && (path === `/${expected}` || path.startsWith(`/${expected}/-/`));
  } catch { return false; }
}
```
*Schema constraint reminder (`schemas/tool-release-record.schema.json` lines 25-29):*
- `resolved.artifact` must match `^[A-Za-z0-9][A-Za-z0-9.+_-]*$` (no `/` or `@` characters; format scoped npm package artifacts as e.g. `opengsd-gsd-core-1.18.0.tgz` and Cua artifacts as `cua-driver-rs-0.38.0-windows-x86_64-binary.zip`).
- `resolved.digest` must match `^[a-f0-9]{64}$` (64-char hex SHA-256).

### 3. Closed CLI Flag Parsing & Single Redaction Seam
**Source:** `src/cli.ts` (lines 252-288, 295-315)
**Apply to:** `src/cli.ts`
```typescript
function parseClosedFlags(
  argv: readonly string[],
  config: ClosedFlagsConfig,
): ClosedParsedFlags {
  const options = new Map<string, string | true>();
  const operands: string[] = [];
  const valueSet = new Set(config.valueFlags);
  const boolSet = new Set(config.booleanFlags);
  ...
```
All CLI output must leave through `print(value, json, formatted, context)` so credentials and private paths are redacted identically in human and `--json` modes.

## No Analog Found

All 8 new or modified files have direct, high-confidence analogs in the repository.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| None | — | — | Every file maps to existing Phase 1–3 and Phase 39 modules in `src/` and `test/`. |

## Metadata

**Analog search scope:** `src/`, `src/core/`, `src/adapters/`, `test/`, `schemas/`, `catalog/`, `scripts/vendor/cua-driver-0.38.0/`
**Files scanned:** 17
**Pattern extraction date:** 2026-11-07
