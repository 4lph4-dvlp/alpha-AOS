import { createHash, randomUUID } from "node:crypto";
import { copyFile, open, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { reviewedDigest } from "./component-session.js";
import { globalMcpConfigPath } from "./mcp.js";
import { provePathBoundary } from "./path-boundary.js";
import { packageRoot as defaultPackageRoot, userStateRoot as defaultUserStateRoot } from "./paths.js";
import { evaluateLegacyHandoff, type LegacyToolEvidence } from "./tool-handoff.js";
import {
  appendToolResult,
  beginToolOperation,
  finishToolOperation,
  planToolRecordOperation,
  withToolRecordSession,
} from "./tool-record-store.js";
import {
  readToolRecordStore,
  type ToolEvidence,
  type ToolResult,
} from "./tool-records.js";
import type { HarnessId, ManagedToolId } from "../types.js";

export const MANAGED_MIGRATION_TOOLS: readonly string[] = [
  "gsd",
  "cua-driver",
  "mcp:context7",
  "mcp:exa",
  "mcp:firecrawl",
  "bridge:pi",
  "ecc",
];

export interface MigrationCandidate {
  toolId: ManagedToolId | string;
  target?: HarnessId;
  version: string;
  sourceId: "npm-registry" | "driver-release";
  sourceUrl: string;
  artifact: string;
  platform: string;
  architecture: string;
  artifactDigest: string;
  path: string;
  pathAlias: string;
  status: "ready" | "modified" | "ambiguous" | "unsupported";
  reason: string;
  ownership: "alpha-aos" | "external" | "unknown";
  userModificationEvidence?: string;
  backupPath?: string;
  evidence?: LegacyToolEvidence;
}

export interface MigrationPlanOptions {
  tools?: (ManagedToolId | string)[];
  targets?: HarnessId[];
  resolveOwnership?: Record<string, "alpha-aos" | "external">;
  stateRoot?: string;
  packageRoot?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  architecture?: string;
  simulatedCandidates?: MigrationCandidate[];
  simulatedConfigs?: Array<{ path: string; content: string; modified: boolean }>;
}

export interface ReviewedMigrationPayload {
  v: 1;
  mode: "migrate";
  targets: string[];
  selectedTools: string[];
  candidates: MigrationCandidate[];
  resolveOwnership?: Record<string, "alpha-aos" | "external">;
}

export interface MigrationPlan {
  schemaVersion: 1;
  planDigest: string;
  reviewedPlanToken: string;
  occurredAt: string;
  candidates: MigrationCandidate[];
  ambiguousCandidates: MigrationCandidate[];
  readyCandidates: MigrationCandidate[];
  modifiedCandidates: MigrationCandidate[];
  unsupportedCandidates: MigrationCandidate[];
  retainedLockfiles: string[];
  payload: ReviewedMigrationPayload;
}

export interface MigrationApplyOptions {
  planDigest: string;
  reviewedPlanToken: string;
  plan?: MigrationPlan;
  tools?: (ManagedToolId | string)[];
  targets?: HarnessId[];
  resolveOwnership?: Record<string, "alpha-aos" | "external">;
  stateRoot?: string;
  packageRoot?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  simulatedConfigs?: Array<{ path: string; content: string; modified: boolean }>;
}

export interface MigrationApplyResult {
  applied: boolean;
  operationId: string;
  planDigest: string;
  migratedTools: Array<{
    toolId: string;
    version: string;
    installationId: string;
    backupPath?: string;
  }>;
  backupsCreated: string[];
  retainedLockfiles: string[];
  message: string;
}

export function parseOwnershipResolution(
  flagValue: string | undefined,
): Record<string, "alpha-aos" | "external"> {
  const result: Record<string, "alpha-aos" | "external"> = {};
  if (!flagValue || typeof flagValue !== "string" || flagValue.trim() === "") {
    return result;
  }
  const pairs = flagValue.split(",").map((p) => p.trim()).filter(Boolean);
  for (const pair of pairs) {
    const parts = pair.split("=").map((s) => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid --resolve-ownership format: '${pair}'. Expected <tool>=<alpha-aos|external>.`);
    }
    const [rawKey, rawOwner] = parts as [string, string];
    const key = rawKey === "cua" ? "cua-driver" : rawKey;
    if (rawOwner !== "alpha-aos" && rawOwner !== "external") {
      throw new Error(`Invalid owner '${rawOwner}' in --resolve-ownership for '${rawKey}'. Must be 'alpha-aos' or 'external'.`);
    }
    result[key] = rawOwner;
  }
  return result;
}

export function encodeReviewedMigrationPlan(payload: ReviewedMigrationPayload): string {
  const json = JSON.stringify(payload);
  const deflated = deflateRawSync(Buffer.from(json, "utf8"));
  return deflated.toString("base64url");
}

export function decodeReviewedMigrationPlan(token: string): ReviewedMigrationPayload {
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Reviewed migration plan token is missing or empty");
  }
  try {
    const buf = Buffer.from(token, "base64url");
    const json = inflateRawSync(buf).toString("utf8");
    return JSON.parse(json) as ReviewedMigrationPayload;
  } catch (err) {
    throw new Error(`Failed to decode reviewed migration plan token: ${(err as Error).message}`);
  }
}

export async function createSafeUserBackup(filePath: string): Promise<string> {
  const resolved = resolve(filePath);
  const fileStat = await stat(resolved);
  if (!fileStat.isFile()) {
    throw new Error(`Cannot backup non-file: ${resolved}`);
  }
  const parent = dirname(resolved);
  const allowedRoots = [parent, defaultUserStateRoot(), homedir(), resolve(".")];
  const proof = await provePathBoundary({
    path: resolved,
    allowedRoots,
    role: "state",
  });
  if (!proof.proven || !proof.capability.componentIdentity) {
    throw new Error(`Unsafe path boundary for backup: ${resolved}`);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${resolved}.${timestamp}.user-backup`;
  await copyFile(resolved, backupPath);
  return backupPath;
}

export function updateMarkerBoundary(
  existingContent: string,
  newManagedContent: string,
): { updatedContent: string; modifiedOutsideMarkers: boolean } {
  const startMarker = "# alpha-aos:start mcp";
  const endMarker = "# alpha-aos:end mcp";

  const startIndex = existingContent.indexOf(startMarker);
  const endIndex = existingContent.indexOf(endMarker);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = existingContent.slice(0, startIndex);
    const after = existingContent.slice(endIndex + endMarker.length);
    const hasCustomContentOutside = before.trim().length > 0 || after.trim().length > 0;
    const updatedContent = `${before}${startMarker}\n${newManagedContent.trim()}\n${endMarker}${after}`;
    return {
      updatedContent,
      modifiedOutsideMarkers: hasCustomContentOutside,
    };
  }

  // If no markers present, treat entire file as custom content and append managed block
  const hasCustomContent = existingContent.trim().length > 0;
  const updatedContent = existingContent.trim()
    ? `${existingContent.trim()}\n\n${startMarker}\n${newManagedContent.trim()}\n${endMarker}\n`
    : `${startMarker}\n${newManagedContent.trim()}\n${endMarker}\n`;

  return {
    updatedContent,
    modifiedOutsideMarkers: hasCustomContent,
  };
}

function officialSourceUrl(toolId: string, version: string, artifactName?: string): { sourceUrl: string; sourceId: "npm-registry" | "driver-release" } {
  if (toolId === "cua-driver") {
    const art = artifactName ?? `cua-driver-rs-${version}-windows-x86_64-binary.zip`;
    return {
      sourceId: "driver-release",
      sourceUrl: `https://github.com/trycua/cua/releases/download/cua-driver-rs-v${version}/${art}`,
    };
  }
  const packages: Record<string, string> = {
    gsd: "@opengsd/gsd-core",
    ecc: "ecc-universal",
    "mcp:context7": "@upstash/context7-mcp",
    "mcp:exa": "exa-mcp-server",
    "mcp:firecrawl": "firecrawl-mcp",
    "bridge:pi": "pi-mcp-adapter",
  };
  const pkg = packages[toolId] ?? toolId;
  return {
    sourceId: "npm-registry",
    sourceUrl: `https://registry.npmjs.org/${pkg}`,
  };
}

export async function planMigrationOperation(options: MigrationPlanOptions = {}): Promise<MigrationPlan> {
  const pkgRoot = resolve(options.packageRoot ?? defaultPackageRoot());
  const stRoot = resolve(options.stateRoot ?? defaultUserStateRoot());
  const platform = options.platform ?? (process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux");
  const architecture = options.architecture ?? (process.arch === "arm64" ? "arm64" : "x64");
  const requestedTools = (options.tools && options.tools.length > 0 ? options.tools : MANAGED_MIGRATION_TOOLS) as string[];
  const requestedTargets = (options.targets && options.targets.length > 0 ? options.targets : ["codex", "claude", "antigravity", "pi", "hermes"]) as HarnessId[];

  const retainedLockfiles: string[] = [];
  let stackLock: Record<string, unknown> | null = null;
  let cuaLock: Record<string, unknown> | null = null;

  try {
    const stackLockContent = await readFile(join(pkgRoot, "catalog", "stack.lock.json"), "utf8");
    stackLock = JSON.parse(stackLockContent) as Record<string, unknown>;
    retainedLockfiles.push("catalog/stack.lock.json");
  } catch {
    // optional historical lock
  }

  try {
    const cuaLockContent = await readFile(join(pkgRoot, "catalog", "computer-use-runtime.json"), "utf8");
    cuaLock = JSON.parse(cuaLockContent) as Record<string, unknown>;
    retainedLockfiles.push("catalog/computer-use-runtime.json");
  } catch {
    // optional historical lock
  }

  const store = await readToolRecordStore({ stateRoot: stRoot, packageRoot: pkgRoot });
  const rawCandidates: MigrationCandidate[] = [];

  if (options.simulatedCandidates && options.simulatedCandidates.length > 0) {
    rawCandidates.push(...options.simulatedCandidates);
  } else {
    // Build candidates from seed lock metadata for requested tools
    for (const toolId of requestedTools) {
      if (store.status === "current" && !store.incomplete && store.accepted) {
        const alreadyAccepted = Object.keys(store.accepted).some((k) => k.startsWith(`${toolId}/`));
        if (alreadyAccepted) continue;
      }

      let version = "0.0.0";
      let artifactDigest = createHash("sha256").update(`${toolId}-seed`).digest("hex");
      let artifact = `${toolId}.zip`;

      if (toolId === "cua-driver" && cuaLock) {
        version = typeof cuaLock.version === "string" ? cuaLock.version : "0.38.0";
        const assets = Array.isArray(cuaLock.assets) ? (cuaLock.assets as Array<Record<string, unknown>>) : [];
        const matchedAsset = assets.find((a) => a.os === platform && a.arch === architecture) ?? assets[0];
        if (matchedAsset) {
          artifact = typeof matchedAsset.name === "string" ? matchedAsset.name : artifact;
          artifactDigest = typeof matchedAsset.sha256 === "string" ? matchedAsset.sha256 : artifactDigest;
        }
      } else if (stackLock && typeof stackLock.components === "object" && stackLock.components) {
        const comps = stackLock.components as Record<string, unknown>;
        if (toolId === "gsd" && comps.gsd && typeof comps.gsd === "object") {
          version = String((comps.gsd as Record<string, unknown>).version ?? version);
        } else if (toolId === "ecc" && comps.ecc && typeof comps.ecc === "object") {
          version = String((comps.ecc as Record<string, unknown>).version ?? version);
        } else if (comps.mcp && typeof comps.mcp === "object") {
          const mcpComps = comps.mcp as Record<string, unknown>;
          const sub = toolId.replace("mcp:", "");
          if (mcpComps[sub] && typeof mcpComps[sub] === "object") {
            version = String((mcpComps[sub] as Record<string, unknown>).version ?? version);
          }
        } else if (comps.mcpBridges && typeof comps.mcpBridges === "object") {
          const brComps = comps.mcpBridges as Record<string, unknown>;
          const sub = toolId.replace("bridge:", "");
          if (brComps[sub] && typeof brComps[sub] === "object") {
            version = String((brComps[sub] as Record<string, unknown>).version ?? version);
          }
        }
      }

      const { sourceUrl, sourceId } = officialSourceUrl(toolId, version, artifact);
      const isModified = options.simulatedConfigs?.some((c) => c.modified) ?? false;
      const candidatePath = join(stRoot, "tool-candidates", toolId.replace(/:/g, "-"));

      rawCandidates.push({
        toolId,
        target: requestedTargets[0] ?? "codex",
        version,
        sourceId,
        sourceUrl,
        artifact,
        platform,
        architecture,
        artifactDigest,
        path: candidatePath,
        pathAlias: toolId.replace(/^@/, ""),
        status: isModified ? "modified" : "ready",
        reason: isModified ? "config-modified" : "legacy-seed-match",
        ownership: "alpha-aos",
        userModificationEvidence: isModified ? "modified" : "unmodified",
      });
    }
  }

  // Check for ambiguous candidates and apply resolveOwnership
  const resolveOwnership = options.resolveOwnership ?? {};
  const classifiedCandidates: MigrationCandidate[] = [];
  const ambiguousCandidates: MigrationCandidate[] = [];

  for (const candidate of rawCandidates) {
    const toolKey = String(candidate.toolId);
    const resolvedOwner = resolveOwnership[toolKey] ?? (toolKey === "cua-driver" ? resolveOwnership.cua : undefined);

    if (candidate.status === "ambiguous" || candidate.ownership === "unknown") {
      if (resolvedOwner) {
        classifiedCandidates.push({
          ...candidate,
          ownership: resolvedOwner,
          status: candidate.userModificationEvidence === "modified" ? "modified" : "ready",
          reason: `ownership-resolved-to-${resolvedOwner}`,
        });
      } else {
        ambiguousCandidates.push(candidate);
      }
    } else {
      classifiedCandidates.push(candidate);
    }
  }

  if (ambiguousCandidates.length > 0) {
    const unresolvable = ambiguousCandidates[0]!;
    throw new Error(
      `Ambiguous candidate ownership detected for ${String(unresolvable.toolId)}. Supply --resolve-ownership ${String(unresolvable.toolId)}=<alpha-aos|external> to proceed.`,
    );
  }

  const readyCandidates = classifiedCandidates.filter((c) => c.status === "ready");
  const modifiedCandidates = classifiedCandidates.filter((c) => c.status === "modified");
  const unsupportedCandidates = classifiedCandidates.filter((c) => c.status === "unsupported");

  const payload: ReviewedMigrationPayload = {
    v: 1,
    mode: "migrate",
    targets: requestedTargets,
    selectedTools: requestedTools,
    candidates: classifiedCandidates,
    ...(Object.keys(resolveOwnership).length > 0 ? { resolveOwnership } : {}),
  };

  const planDigest = reviewedDigest("migrate-plan", {
    v: 1,
    mode: "migrate",
    targets: requestedTargets,
    selectedTools: requestedTools,
    candidates: classifiedCandidates,
    ...(Object.keys(resolveOwnership).length > 0 ? { resolveOwnership } : {}),
  });

  const reviewedPlanToken = encodeReviewedMigrationPlan(payload);

  return {
    schemaVersion: 1,
    planDigest,
    reviewedPlanToken,
    occurredAt: new Date().toISOString(),
    candidates: classifiedCandidates,
    ambiguousCandidates: [],
    readyCandidates,
    modifiedCandidates,
    unsupportedCandidates,
    retainedLockfiles,
    payload,
  };
}

export async function applyMigrationOperation(options: MigrationApplyOptions): Promise<MigrationApplyResult> {
  const pkgRoot = resolve(options.packageRoot ?? defaultPackageRoot());
  const stRoot = resolve(options.stateRoot ?? defaultUserStateRoot());

  const decoded = decodeReviewedMigrationPlan(options.reviewedPlanToken);
  const expectedDigest = reviewedDigest("migrate-plan", {
    v: decoded.v,
    mode: decoded.mode,
    targets: decoded.targets,
    selectedTools: decoded.selectedTools,
    candidates: decoded.candidates,
    ...(decoded.resolveOwnership ? { resolveOwnership: decoded.resolveOwnership } : {}),
  });

  if (options.planDigest !== expectedDigest) {
    throw new Error(
      `Migration plan digest mismatch: expected ${expectedDigest}, received ${options.planDigest}. Re-run "alpha-aos migrate" to preview fresh state.`,
    );
  }

  const backupsCreated: string[] = [];

  // If there are modified config files, create safe backups
  if (options.simulatedConfigs && options.simulatedConfigs.length > 0) {
    for (const config of options.simulatedConfigs) {
      if (config.modified) {
        const backup = await createSafeUserBackup(config.path);
        backupsCreated.push(backup);
      }
    }
  }

  // Create user backup for modified candidates if their config path exists
  for (const candidate of decoded.candidates) {
    if (candidate.status === "modified" && candidate.path) {
      try {
        const backup = await createSafeUserBackup(candidate.path);
        backupsCreated.push(backup);
        candidate.backupPath = backup;
      } catch {
        // file may be in-memory or simulated
      }
    }
  }

  const operationId = `migrate-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const occurredAt = new Date().toISOString();
  const requests = decoded.candidates.map((c) => ({
    toolId: String(c.toolId),
    selector: c.version,
    exact: true,
  }));

  const recordPlan = await planToolRecordOperation({
    stateRoot: stRoot,
    packageRoot: pkgRoot,
    operationId,
    occurredAt,
    requests,
  });

  return await withToolRecordSession(recordPlan, async (session) => {
    await beginToolOperation(recordPlan, session);

    const store = await readToolRecordStore({ stateRoot: stRoot, packageRoot: pkgRoot });
    const acceptedTransitions: Array<{
      toolId: string;
      installationId: string;
      proofId: string;
      priorDigest: string | null;
    }> = [];

    const migratedTools: Array<{
      toolId: string;
      version: string;
      installationId: string;
      backupPath?: string;
    }> = [];

    for (const candidate of decoded.candidates) {
      const toolId = String(candidate.toolId);
      const installationId = `${toolId.replace(/:/g, "-")}-${candidate.version}`;
      const proofId = `${toolId.replace(/:/g, "-")}-migrated`;
      const harness = candidate.target ?? "codex";

      const legacyEvidence: LegacyToolEvidence = {
        toolId,
        sourceId: candidate.sourceId,
        sourceUrl: candidate.sourceUrl,
        release: candidate.version,
        artifact: candidate.artifact,
        platform: candidate.platform,
        architecture: candidate.architecture,
        artifactDigest: candidate.artifactDigest,
        provenanceRef: "legacy-catalog-seed",
        verificationRef: "host-verified-signature",
        currentRef: "current-files",
        scope: "managed-tool",
        previousIdentity: `${toolId}-${candidate.version}`,
        priorInstallationOwner: candidate.ownership === "external" ? "external" : "alpha-aos",
        priorConnectionOwner: "alpha-aos",
        userModificationEvidence: candidate.userModificationEvidence ?? (candidate.status === "modified" ? "modified" : "unmodified"),
      };

      const integrationEvidence: ToolEvidence = {
        proofId,
        subject: installationId,
        target: "integration",
        method: "invocation",
        result: "pass",
        platform: candidate.platform,
        architecture: candidate.architecture,
        harness,
        fingerprint: candidate.artifactDigest,
      };

      const result: ToolResult = {
        toolId,
        requested: {
          toolId,
          selector: candidate.version,
          exact: true,
        },
        resolved: {
          release: candidate.version,
          artifact: candidate.artifact,
          platform: candidate.platform,
          architecture: candidate.architecture,
          digest: candidate.artifactDigest,
          sourceId: candidate.sourceId,
          sourceUrl: candidate.sourceUrl,
        },
        installed: {
          installationId,
          version: candidate.version,
          pathAlias: candidate.pathAlias || toolId,
        },
        verified: proofId,
        evidence: [integrationEvidence],
        outcome: "succeeded",
        legacy: legacyEvidence,
      };

      await appendToolResult(recordPlan, session, result);

      const priorDigest = store.accepted?.[`${toolId}/${installationId}`] ?? null;
      acceptedTransitions.push({
        toolId,
        installationId,
        proofId,
        priorDigest,
      });

      migratedTools.push({
        toolId,
        version: candidate.version,
        installationId,
        ...(candidate.backupPath ? { backupPath: candidate.backupPath } : {}),
      });
    }

    await finishToolOperation(recordPlan, session, acceptedTransitions);

    return {
      applied: true,
      operationId,
      planDigest: options.planDigest,
      migratedTools,
      backupsCreated,
      retainedLockfiles: ["catalog/stack.lock.json", "catalog/computer-use-runtime.json"],
      message: `Successfully migrated ${migratedTools.length} tool(s) to local tool-records.`,
    };
  });
}

export function formatMigrationPreview(plan: MigrationPlan): string {
  const lines: string[] = [];
  lines.push("alpha-aos migration preview");
  lines.push(`Generated: ${plan.occurredAt}`);
  lines.push(`Plan digest: ${plan.planDigest}`);
  lines.push("");
  lines.push("Candidates for adoption:");
  if (plan.candidates.length === 0) {
    lines.push("  (no legacy candidates to adopt)");
  } else {
    for (const c of plan.candidates) {
      lines.push(`  - ${String(c.toolId)}@${c.version} [${c.status}] owner: ${c.ownership}`);
      lines.push(`    source: ${c.sourceUrl}`);
      lines.push(`    path: ${c.path}`);
      if (c.userModificationEvidence === "modified") {
        lines.push(`    user config: modified (will create .user-backup on apply)`);
      }
    }
  }
  if (plan.retainedLockfiles.length > 0) {
    lines.push("");
    lines.push("Retained historical lockfiles (read-only):");
    for (const file of plan.retainedLockfiles) {
      lines.push(`  - ${file}`);
    }
  }
  lines.push("");
  lines.push("To apply this migration, run:");
  lines.push(`  alpha-aos migrate --apply --plan-digest ${plan.planDigest} --reviewed-plan ${plan.reviewedPlanToken}`);
  return lines.join("\n");
}

export function formatMigrationApplyResult(result: MigrationApplyResult): string {
  const lines: string[] = [];
  lines.push("alpha-aos migration applied");
  lines.push(`Operation ID: ${result.operationId}`);
  lines.push(`Plan digest: ${result.planDigest}`);
  lines.push("");
  lines.push("Migrated tools:");
  for (const tool of result.migratedTools) {
    lines.push(`  - ${tool.toolId}@${tool.version} (installationId: ${tool.installationId})`);
    if (tool.backupPath) {
      lines.push(`    backup: ${tool.backupPath}`);
    }
  }
  if (result.backupsCreated.length > 0) {
    lines.push("");
    lines.push("User backups created:");
    for (const b of result.backupsCreated) {
      lines.push(`  - ${b}`);
    }
  }
  lines.push("");
  lines.push(result.message);
  return lines.join("\n");
}

export async function checkLegacyMigrationAdvisory(pkgRoot: string, stRoot: string): Promise<string | null> {
  try {
    const store = await readToolRecordStore({ stateRoot: stRoot, packageRoot: pkgRoot });
    const hasAccepted = store.status === "current" && !store.incomplete && store.accepted && Object.keys(store.accepted).length > 0;
    if (!hasAccepted) {
      const hasLegacyLocks = existsSync(join(pkgRoot, "catalog", "stack.lock.json")) || existsSync(join(pkgRoot, "catalog", "computer-use-runtime.json"));
      if (hasLegacyLocks) {
        return "Notice: Unadopted legacy tool installations detected. Run 'alpha-aos migrate' to adopt them into local tool records.";
      }
    }
  } catch {
    // Non-blocking advisory check
  }
  return null;
}


