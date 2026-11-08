# Phase 41: Minimal Compatibility Adapters - Pattern Map

**Mapped:** 2026-11-08
**Files analyzed:** 18
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/compatibility-adapters.ts` | service | transform | `src/core/ecc-fixture.ts` | role-match |
| `src/types.ts` | model | request-response | `src/types.ts` | exact |
| `src/core/ecc-fixture.ts` | service | transform | `src/core/ecc-fixture.ts` | exact |
| `src/core/ecc-skills.ts` | service | file-I/O | `src/core/ecc-skills.ts` | exact |
| `src/core/gsd-compat.ts` | service | file-I/O | `src/core/gsd-compat.ts` | exact |
| `src/core/gsd-fixture.ts` | service | file-I/O | `src/core/gsd-fixture.ts` | exact |
| `src/core/owned-skills.ts` | service | file-I/O | `src/core/owned-skills.ts` | exact |
| `catalog/stack.yaml` | config | CRUD | `catalog/stack.yaml` | exact |
| `catalog/stack.lock.json` | config | CRUD | `catalog/stack.lock.json` | exact |
| `src/core/update.ts` | service | request-response | `src/core/update.ts` | exact |
| `src/core/tool-inventory.ts` | service | file-I/O | `src/core/tool-inventory.ts` | exact |
| `src/format.ts` | utility | transform | `src/format.ts` | exact |
| `src/cli.ts` | controller | request-response | `src/cli.ts` | exact |
| `test/compatibility-adapters.test.ts` | test | transform | `test/gsd-compat.test.ts` | role-match |
| `test/gsd-compat.test.ts` | test | file-I/O | `test/gsd-compat.test.ts` | exact |
| `test/ecc-skills.test.ts` | test | file-I/O | `test/ecc-skills.test.ts` | exact |
| `test/tool-inventory-cli.test.ts` | test | request-response | `test/tool-inventory-cli.test.ts` | exact |
| `test/local-release-update.test.ts` | test | request-response | `test/local-release-update.test.ts` | exact |

## Pattern Assignments

### `src/core/compatibility-adapters.ts` (service, transform)

**Analog:** `src/core/ecc-fixture.ts` (for skill content transformation & SHA-256 hashing) and `src/core/tool-records.ts` (for `ToolEvidence` schema-compliant ID construction)

**Imports pattern** (`src/core/ecc-fixture.ts` lines 1-22):
```typescript
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, ManagedToolId } from "../types.js";
import type { ToolEvidence } from "./tool-records.js";
import { ComponentPlanError } from "./component-session.js";
```

**Core pattern — Deterministic hash & boundary helpers** (`src/core/ecc-fixture.ts` lines 49-56):
```typescript
function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
```

**Validation pattern — Closed-schema `ToolEvidence` ID normalization** (`src/core/tool-records.ts` lines 9-16 and `src/core/update.ts` lines 1270-1308):
```typescript
export interface ToolEvidence { proofId: string; subject: string; target: string; method: string; result: string; platform: string; architecture: string; harness: string | null; fingerprint?: string }
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// In src/core/update.ts lines 1270, 1296-1307:
const safeToolId = tool.toolId.replace(/:/g, "-");
// ...
{
  proofId: `${safeToolId}-integrity`,
  subject: `${safeToolId}-download`,
  target: "integrity",
  method: "sha256",
  result: "pass",
  platform: tool.platform,
  architecture: tool.architecture,
  harness: null,
  fingerprint: tool.digest,
}
```

**Error handling pattern — Fail-closed precondition failure** (`src/core/component-session.ts` via `src/core/gsd-compat.ts` lines 450-460):
```typescript
if (!existsSync(source.source)) {
  throw new ComponentPlanError("source-drift", `GSD hook helper is missing from the verified package: ${source.file}`);
}
```

---

### `src/types.ts` (model, request-response)

**Analog:** `src/types.ts`

**Core pattern — Local release binding and preview item contracts** (`src/types.ts` lines 1063-1108):
```typescript
export interface ReviewedToolBinding {
  readonly toolId: ManagedToolId;
  readonly action: ToolReleaseAction;
  readonly oldVersion: string | null;
  readonly acceptedVersion: string | null;
  readonly release: string;
  readonly artifact: string;
  readonly integrity: string;
  readonly digest: string;
  readonly sourceId: "npm-registry" | "driver-release";
  readonly sourceUrl: string;
  readonly platform: string;
  readonly architecture: string;
}

export interface ToolReleasePreviewItem {
  readonly toolId: ManagedToolId;
  readonly action: ToolReleaseAction;
  readonly oldVersion: string | null;
  readonly acceptedVersion: string | null;
  readonly newVersion: string | null;
  readonly sourceId: string | null;
  readonly sourceUrl: string | null;
  readonly artifact: string | null;
  readonly requestedHarnesses: readonly HarnessId[];
  readonly affectedHarnesses: readonly HarnessId[];
  readonly nativeSideEffects: readonly string[];
  readonly recoveryScope: {
    readonly transactionalRollback: readonly string[];
    readonly adapterRecovery: readonly string[];
    readonly unrecoveredEffects: readonly string[];
  };
  readonly blockedReason?: {
    readonly code: ReleaseResolutionFailureCode;
    readonly message: string;
  };
  readonly verificationNote?: string;
}
```

---

### `src/core/ecc-fixture.ts` (service, transform)

**Analog:** `src/core/ecc-fixture.ts`

**Core pattern — `renderEccSkill` entry point to replace with minimal structural adapter delegation** (`src/core/ecc-fixture.ts` lines 86-128):
```typescript
export function renderEccSkill(skill: PackSkillId, source: string, harness?: HarnessId): string {
  if (skill === "documentation-lookup" && harness === "antigravity") {
    const description = "description: Use up-to-date library and framework docs via Context7 MCP instead of training data. In Antigravity, use the surface's native Context7 MCP route and never substitute native web search. Activates for setup questions, API references, code examples, or named frameworks.";
    let rendered = source.replace(/^description:.*$/mu, description);
    if (rendered === source) throw new Error("documentation-lookup source no longer contains the expected description");
    const heading = "# Documentation Lookup (Context7)\n\n";
    const routing = "## Antigravity GUI/IDE Routing\n\n- In Antigravity GUI, call the namespaced MCP tools `context7/resolve-library-id` and, when documentation content is needed, `context7/query-docs`.\n- In Antigravity IDE, invoke the generic `call_mcp_tool` gateway. Resolve with `ServerName: \"context7\"`, `ToolName: \"resolve-library-id\"`, and `Arguments: { libraryName, query }`. When documentation content is needed, invoke the same gateway with `ToolName: \"query-docs\"` and `Arguments: { libraryId, query }`. Reading a JSON tool descriptor does not execute the MCP tool.\n\nDo not replace a required Context7 call with native web search. If the native Context7 route is unavailable, report that Context7 is unavailable and stop instead of searching the web for a guessed library ID.\n\n";
    if (!rendered.includes(heading)) throw new Error("documentation-lookup source no longer contains the expected title");
    rendered = rendered.replace(heading, `${heading}${routing}`);
    return rendered;
  }
  if (skill !== "deep-research") return source;
  // ... delegate to compatibility-adapters.ts instead of 4-section regex replacement
```

---

### `src/core/ecc-skills.ts` (service, file-I/O)

**Analog:** `src/core/ecc-skills.ts`

**Core pattern — Target hash verification and sync planning** (`src/core/ecc-skills.ts` lines 76-94):
```typescript
export async function planEccSkillSync(harness: HarnessId, lock: StackLock, targetRoot = globalEccSkillRoot(harness)): Promise<EccSkillSyncPlan> {
  const ecc = requireEccLock(lock);
  const entries: EccSkillSyncEntry[] = [];
  for (const skill of selectedSkills) {
    const expectedHash = ecc.targetSha256[skill]?.[harness];
    if (!expectedHash) throw new Error(`ECC target hash is missing for ${skill}:${harness}`);
    const destination = skillFile(targetRoot, skill);
    if (!inside(targetRoot, destination)) throw new Error(`Unsafe ECC destination: ${destination}`);
    const currentHash = existsSync(destination) ? sha256(await readFile(destination)) : null;
    entries.push({
      skill,
      destination,
      expectedHash,
      currentHash,
      action: currentHash === expectedHash ? "current" : currentHash ? "update" : "create",
    });
  }
  return { harness, targetRoot, entries };
}
```

---

### `src/core/gsd-compat.ts` (service, file-I/O)

**Analog:** `src/core/gsd-compat.ts`

**Core pattern — Hook compatibility planning & smoke test execution** (`src/core/gsd-compat.ts` lines 78-92 and 328-355):
```typescript
export async function planCodexGsdHookCompatibility(configRoot = codexConfigRoot()): Promise<CodexGsdHookCompatibilityPlan> {
  const root = resolve(configRoot);
  const monitor = join(root, "hooks", "gsd-context-monitor.js");
  const required = existsSync(monitor)
    && (await readFile(monitor, "utf8")).includes("require('./lib/hook-exit.js')");
  return {
    configRoot: root,
    monitor,
    required,
    entries: CODEX_HOOK_HELPERS.map((file) => {
      const destination = join(root, "hooks", "lib", file);
      return { file, destination, action: existsSync(destination) ? "verify" : "create" };
    }),
  };
}
```
```typescript
export async function smokeTestCodexGsdStopHook(configRoot = codexConfigRoot()): Promise<CodexHookSmokeResult> {
  const monitor = join(resolve(configRoot), "hooks", "gsd-context-monitor.js");
  const absent: RedactedExcerpt = { excerpt: "", capped: false, totalBytes: 0, sha256: EMPTY_STREAM_SHA256 };
  if (!existsSync(monitor)) return { ok: true, code: "not-applicable", exitCode: 0, stdout: absent, stderr: absent };

  const result = await runProcess({
    executable: process.execPath,
    args: [monitor],
    cwd: tmpdir(),
    timeoutMs: 15_000,
    maxOutputBytes: 64 * 1024,
    environment: nodeRuntimeEnvironment(),
    stdin: JSON.stringify({
      session_id: `alpha-aos-smoke-${process.pid}`,
      cwd: tmpdir(),
      hook_event_name: "Stop",
    }),
  });

  return {
    // The hook protocol is silence on success; anything written is a failure.
    ok: result.code === "ok" && result.stdout.totalBytes === 0 && result.stderr.totalBytes === 0,
    code: result.code,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
```

**Transaction & rollback pattern** (`src/core/gsd-compat.ts` lines 478-488):
```typescript
const journal = await applyFileTransaction({
  stateRoot: reviewed.stateRoot,
  allowedRoots: [targetRoot],
  operations,
  session,
});
const smoke = await smokeTestCodexGsdStopHook(reviewed.configRoot);
if (!smoke.ok) {
  await rollbackFileTransaction(reviewed.stateRoot, journal.id, [targetRoot]);
  throw new Error(describeSmokeFailure("Codex GSD Stop hook smoke test after compatibility sync", smoke));
}
```

---

### `src/core/gsd-fixture.ts` (service, file-I/O)

**Analog:** `src/core/gsd-fixture.ts`

**Core pattern — Fixture execution where pure upstream smoke check must precede helper copy** (`src/core/gsd-fixture.ts` lines 249-271):
```typescript
    const command = await runProcess({
      ...reviewed.spec,
      // The fixture redirects every harness root at its synthetic home, so
      // the child cannot reach the real one even by accident.
      environment: nodeRuntimeEnvironment({ literal: spec.fixtureEnvironment }),
    });
    if (command.code !== "ok") throw new Error(describeProcessFailure("GSD fixture install", command));
    let codexStopHookSmokePassed: boolean | null = null;
    if (options.harness === "codex") {
      await applyCodexGsdHookCompatibility({
        schemaVersion: 1,
        channel: "stable",
        generatedAt: null,
        components: { gsd: options.gsd },
      }, {
        // A throwaway state root of its own: one session owns one state root,
        // and this is not the user's.
        configRoot: spec.configRoot,
        stateRoot: reviewed.fixtureStateRoot,
      });
      codexStopHookSmokePassed = (await smokeTestCodexGsdStopHook(spec.configRoot)).ok;
      if (!codexStopHookSmokePassed) throw new Error("GSD fixture Codex Stop hook smoke test failed");
    }
```

---

### `src/core/owned-skills.ts` (service, file-I/O)

**Analog:** `src/core/owned-skills.ts`

**Core pattern — Owned skill rendering and upstream workflow dependency check** (`src/core/owned-skills.ts` lines 60-69 and 107-124):
```typescript
export function renderOwnedSkill(source: string, target: HarnessId, invocation: "explicit" | "automatic", argumentHint?: string): string {
  if (!["claude", "codex", "antigravity", "pi", "hermes"].includes(target)) {
    throw new Error(`Owned skill renderer is not implemented for target: ${target}`);
  }
  if (!source.startsWith("---\n")) throw new Error("Owned skill source must start with YAML frontmatter");
  const additions: string[] = [];
  if (argumentHint) additions.push(`argument-hint: ${JSON.stringify(argumentHint)}`);
  if (invocation === "explicit") additions.push("disable-model-invocation: true");
  return additions.length === 0 ? source : `---\n${additions.join("\n")}\n${source.slice(4)}`;
}
```
```typescript
  const customHome = options.targetHome ?? options.claudeHome;
  const destination = destinationFor(target, id, customHome);
  const currentHash = existsSync(destination) ? sha256(await readFile(destination)) : null;
  const workflow = locked.upstreamWorkflow
    ? join(customHome ? resolve(customHome) : homedirRootFor(target), locked.upstreamWorkflow)
    : null;
  return {
    id,
    target,
    source,
    destination,
    expectedHash,
    currentHash,
    action: currentHash === expectedHash ? "current" : currentHash === null ? "create" : "replace",
    workflow,
    workflowFound: workflow === null ? true : existsSync(workflow),
  };
```

---

### `catalog/stack.yaml` & `catalog/stack.lock.json` (config, CRUD)

**Analog:** `catalog/stack.yaml` & `catalog/stack.lock.json`

**Core pattern — Global ownedSkills declaration** (`catalog/stack.yaml` lines 49-74):
```yaml
  ownedSkills:
    - id: computer-use
      source: skills/computer-use/SKILL.md
      targets: [claude, codex, antigravity, pi, hermes]
      invocation: automatic
    - id: alpha-aos-ship
      source: skills/alpha-aos-ship/SKILL.md
      targets: [claude]
      invocation: explicit
      argumentHint: "<phase-number> [--draft] [--text] [--ws <name>]"
      requires:
        component: gsd
        workflow: gsd-core/workflows/ship.md
```

**Core pattern — Locked `ecc.targetSha256` and `ownedSkills` hashes** (`catalog/stack.lock.json` lines 72-86 and 112-129):
```json
        "documentation-lookup": {
          "claude": "81ad2b5b4acbe02259f4b6cbfd9111d81d5cfe51025051b6048959c45f6516c1",
          "codex": "81ad2b5b4acbe02259f4b6cbfd9111d81d5cfe51025051b6048959c45f6516c1",
          "antigravity": "93c880e4c6b18e508d8a9c79e08e192a9d3d1bbf5885f0b855d0243fc20e7143",
          "pi": "81ad2b5b4acbe02259f4b6cbfd9111d81d5cfe51025051b6048959c45f6516c1",
          "hermes": "81ad2b5b4acbe02259f4b6cbfd9111d81d5cfe51025051b6048959c45f6516c1"
        },
        "deep-research": {
          "claude": "4e976b0fa3dc41a1947cd26cf3b565e936a3e33834a442eaa4649126ce525351",
          "codex": "4e976b0fa3dc41a1947cd26cf3b565e936a3e33834a442eaa4649126ce525351",
          "antigravity": "4e976b0fa3dc41a1947cd26cf3b565e936a3e33834a442eaa4649126ce525351",
          "pi": "4e976b0fa3dc41a1947cd26cf3b565e936a3e33834a442eaa4649126ce525351",
          "hermes": "4e976b0fa3dc41a1947cd26cf3b565e936a3e33834a442eaa4649126ce525351"
        }
```

---

### `src/core/update.ts` (service, request-response)

**Analog:** `src/core/update.ts`

**Core pattern — Preview item & reviewed binding construction** (`src/core/update.ts` lines 803-840):
```typescript
    const previewItem: ToolReleasePreviewItem = {
      toolId,
      action,
      oldVersion,
      acceptedVersion,
      newVersion: action === "skip-absent" || action === "blocked" ? null : newVersion,
      sourceId,
      sourceUrl,
      artifact,
      requestedHarnesses: requestedTargets,
      affectedHarnesses,
      nativeSideEffects,
      recoveryScope,
      ...(blockedReason ? { blockedReason } : {}),
      ...(toolId === "cua-driver" && (osPlatform === "linux")
        ? { verificationNote: "Linux binary selected. Upstream Wayland helper and host GUI integration require explicit verification." }
        : {}),
    };

    previewItems.push(previewItem);

    if (action === "install" || action === "update" || action === "current") {
      reviewedBindings.push({
        toolId,
        action,
        oldVersion,
        acceptedVersion,
        release: newVersion ?? oldVersion ?? "0.0.0",
        artifact: artifact ?? `${toolId}-${newVersion}.tgz`,
        integrity: integrity ?? "",
        digest: digest ?? "",
        sourceId: sourceId ?? "npm-registry",
        sourceUrl: sourceUrl ?? "",
        platform: osPlatform === "win32" ? "windows" : osPlatform === "darwin" ? "macos" : "linux",
        architecture: osArch,
      });
    }
```

**Core pattern — In-memory `StackLock` synthesis with `renderEccSkill`** (`src/core/update.ts` lines 932-957):
```typescript
          for (const skill of ecc.skills) {
            const key = Object.keys(files).find(
              (name) =>
                name === `package/skills/${skill}/SKILL.md` ||
                name === `skills/${skill}/SKILL.md` ||
                name.endsWith(`/${skill}/SKILL.md`),
            );
            if (key && files[key]) {
              const content = files[key]!.toString("utf8");
              sourceSha256[skill] = createHash("sha256").update(content).digest("hex");
              const perHarness: Partial<Record<HarnessId, string>> = {};
              for (const h of harnesses) {
                const rendered = renderEccSkill(skill, content, h);
                perHarness[h] = createHash("sha256").update(rendered).digest("hex");
              }
              targetSha256[skill] = perHarness;
            }
          }
```

---

### `src/core/tool-inventory.ts` (service, file-I/O)

**Analog:** `src/core/tool-inventory.ts`

**Core pattern — `ToolObservation` state reconciliation & proof scopes** (`src/core/tool-inventory.ts` lines 13-33 and 63-77):
```typescript
export interface ToolObservation {
  category?: "managed-tool";
  toolId: string;
  installation: "installed" | "absent" | "unknown";
  installed: { version: string | null; source: string } | null;
  selected: { version: string; source: string } | null;
  integrity: "verified" | "failed" | "unverified" | "unknown";
  integration: "verified" | "failed" | "unverified" | "unknown";
  reason: string;
  nextAction: string;
  // ...
  proofScopes?: { discovery: string; integrity: string; protocol: string; invocation: string; fingerprintScope?: string; historical?: { discovery: string; integrity: string; protocol: string; invocation: string } };
}
```
```typescript
    for (const proof of acceptedResult.evidence) {
      if (proof.subject !== acceptedResult.installed.installationId || proof.fingerprint !== current.fingerprint || proof.platform !== current.platform || proof.architecture !== current.architecture) continue;
      if (proof.harness && !item.bindings?.some((binding) => binding.harness === proof.harness && binding.status === "active" && binding.candidatePath === current.path)) continue;
      if (proof.target === "integration" && !proof.harness) continue;
      const scope = proof.target === "installation" && proof.method === "discovery" ? "discovery" : proof.target === "integrity" && ["sha256", "signature"].includes(proof.method) ? "integrity" : proof.target === "integration" && proof.method === "protocol" ? "protocol" : proof.target === "integration" && proof.method === "invocation" ? "invocation" : null;
      if (scope) {
        const status = proof.result === "pass" ? "verified" : proof.result === "fail" ? "failed" : "unknown";
        if (evidence[scope] === "unverified" || status === "failed" || (status === "unknown" && evidence[scope] === "verified")) evidence[scope] = status;
      }
    }
```

---

### `src/format.ts` & `src/cli.ts` (utility / controller, transform / request-response)

**Analog:** `src/format.ts` & `src/cli.ts`

**Core pattern — `formatToolInventory` and `formatToolDetail`** (`src/format.ts` lines 62-69):
```typescript
export function formatToolInventory(inventory: import("./core/tool-inventory.js").ToolInventory): string {
  const diagnostics = inventory.records.diagnostics.length ? `\nRecord diagnostics: ${inventory.records.diagnostics.join(", ")}` : "";
  return [inventory.observations.map((item) => `${item.toolId}: installation=${item.installation}, installed=${item.installed?.version ?? "unknown"}, selected=${item.selected?.version ?? "unknown"}, integrity=${item.integrity}, integration=${item.integration}\n${item.reason}; ${item.nextAction}\n  accepted=${item.acceptedIdentity?.version ?? "none"}; latest operation=${item.latestOperation?.operationId ?? "none"}, status=${item.latestOperation?.status ?? "unknown"}, outcome=${item.latestOperation?.outcome ?? "unknown"}\n  proof scopes: ${JSON.stringify(item.proofScopes ?? {})}\n  handoff=${item.handoff?.status ?? "needs-evidence"}${(item.candidates ?? []).map((candidate) => `\n  candidate ${candidate.path}: version=${candidate.version ?? "unknown"}, installation owner=${candidate.installationOwner}`).join("")}${(item.bindings ?? []).map((binding) => `\n  ${binding.harness}: ${binding.status}, candidate=${binding.candidatePath ?? "unknown"}, connection owner=${binding.connectionOwner}, ${binding.reason}`).join("")}${(item.diagnostics ?? []).map((diagnostic) => `\n  ${diagnostic.severity}: ${diagnostic.code}`).join("")}`).join("\n"), ...(inventory.categorySummaries ?? []).map((s) => `${s.category}: ${s.count} (installed=${s.statuses.installed}, absent=${s.statuses.absent}, unknown=${s.statuses.unknown})`), `Records: ${inventory.records.status}${diagnostics}`].filter(Boolean).join("\n");
}

export function formatToolDetail(inventory: import("./core/tool-inventory.js").ToolInventory): string {
  return [formatToolInventory(inventory), ...inventory.observations.map((item) => `${item.toolId} detail: installed source=${item.installed?.source ?? "unknown"}, selected source=${item.selected?.source ?? "unknown"}; scope=${item.scope ?? "unknown"}; handoff=${JSON.stringify(item.handoff ?? null)}; candidates=${JSON.stringify(item.candidates ?? [])}`), ...(inventory.components ?? []).map((c) => `${c.category} ${c.id}: ${c.status}, version=${c.version ?? "unknown"}; ${c.reason}`), ...inventory.records.events.map((event) => `Evidence: ${JSON.stringify(event)}`)].join("\n");
}
```

**Core pattern — `formatLocalReleasePreview`** (`src/format.ts` lines 2274-2298):
```typescript
  if (plan.changedTools.length > 0) {
    lines.push("", "=== CHANGED TOOLS ===");
    for (const tool of plan.changedTools) {
      lines.push(
        `Tool: ${tool.toolId} (${tool.action})`,
        `  1. Release Identity & Artifact:`,
        // ...
        `  4. Recovery Scope:`,
        `     Transactional rollback: ${tool.recoveryScope.transactionalRollback.join(", ") || "none"}`,
        `     Adapter recovery: ${tool.recoveryScope.adapterRecovery.join(", ") || "none"}`,
        `     Unrecovered effects: ${tool.recoveryScope.unrecoveredEffects.join(", ") || "none"}`,
      );
    }
  }
```

**Core pattern — `inventory` CLI dispatch** (`src/cli.ts` lines 1091-1100):
```typescript
    const { collectToolInventory } = await import("./core/tool-inventory.js");
    const inventory = await collectToolInventory({ catalog, lock, ...options });
    if (typeof tool === "string") {
      inventory.observations = inventory.observations.filter((item) => item.toolId === tool);
      inventory.records.events = inventory.records.events.filter((event) => event.result?.toolId === tool || event.results?.some((result) => result.toolId === tool) || event.requests?.some((request) => request.toolId === tool));
    }
    if (!detail) delete inventory.components;
    print(inventory, json, detail ? formatToolDetail(inventory) : formatToolInventory(inventory));
    return;
```

---

### `test/compatibility-adapters.test.ts`, `test/gsd-compat.test.ts`, `test/ecc-skills.test.ts`, `test/tool-inventory-cli.test.ts`, `test/local-release-update.test.ts` (test)

**Analog:** `test/gsd-compat.test.ts` & `test/tool-inventory-cli.test.ts`

**Imports & temporary fixture setup pattern** (`test/gsd-compat.test.ts` lines 1-52):
```typescript
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ComponentPlanError } from "../src/core/component-session.js";

async function createFixture(context: { after: (fn: () => Promise<unknown>) => void }, label: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-gsd-compat-test-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true }));
  // ...
}
```

**CLI spawn & JSON/human output assertion pattern** (`test/tool-inventory-cli.test.ts` lines 37-51):
```typescript
    const env = { ...process.env, HOME: join(root, "home"), USERPROFILE: join(root, "home"), LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: stateRoot, PATH: "" };
    const cli = (...args: string[]) => spawnSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", ...args], { encoding: "utf8", env });
    const overview = JSON.parse(cli("--json").stdout) as { observations: Array<{ toolId: string }>; categorySummaries: unknown[]; components?: unknown[] };
    const detail = JSON.parse(cli("--detail", "--json").stdout) as { observations: Array<{ toolId: string }>; components: Array<{ category: string }> };
    assert.equal(overview.components, undefined); assert.ok(overview.categorySummaries.length);
```

---

## Shared Patterns

### Path Boundary Containment & Operation Path Proofs
**Source:** `src/core/gsd-compat.ts` lines 43-46, 265-272
**Apply to:** `src/core/compatibility-adapters.ts`, `src/core/gsd-compat.ts`, `src/core/ecc-fixture.ts`
```typescript
function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

const allowedRoots = [targetRoot, stateRoot, fixtureRoot ?? sourceRoot];
const proofs = await proveOperationPaths({
  inputs,
  allowedRoots,
  requiredRoles: fixtureRoot
    ? ["target", "state", "journal", "snapshot", "temp", "source", "package-root"]
    : ["target", "state", "journal", "snapshot", "source", "package-root"],
});
```

### Preview-to-Apply Digest Binding (`reviewedDigest` & `ComponentPlanError`)
**Source:** `src/core/update.ts` lines 862-869, 1000-1016
**Apply to:** `src/core/compatibility-adapters.ts`, `src/core/update.ts`, `src/core/gsd-compat.ts`
```typescript
const expectedDigest = reviewedDigest(
  payload.mode === "install" ? "local-install-plan" : "local-update-plan",
  {
    v: payload.v,
    mode: payload.mode,
    targets: payload.targets,
    selectedTools: payload.selectedTools,
    tools: payload.tools,
  },
);
if (options.planDigest !== expectedDigest) {
  throw new ComponentPlanError(
    "plan-drift",
    `Plan digest mismatch: token digest ${expectedDigest} does not match provided digest ${options.planDigest}.`,
  );
}
```

### Closed-World Schema Validation for `tool-records`
**Source:** `src/core/tool-records.ts` lines 16, 121-126
**Apply to:** `src/core/compatibility-adapters.ts`, `src/core/update.ts`, `src/core/tool-inventory.ts`
```typescript
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// All proofId and subject strings in ToolEvidence must match idPattern (no colons ':')
// and pass validateManagedDocument against schemas/tool-release-record.schema.json.
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| None | — | — | All 18 new and modified files have direct tracked analogs in `src/` and `test/`. |

## Metadata

**Analog search scope:** `src/`, `test/`, `catalog/`, `schemas/`, `skills/`
**Files scanned:** 20
**Pattern extraction date:** 2026-11-08
