import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type {
  HarnessId,
  LockedPackage,
  ManagedToolId,
  ReleaseResolutionFailureCode,
  ReviewedReleasePlanPayload,
  ReviewedToolBinding,
  StackCatalog,
  StackLock,
  ToolReleaseAction,
  ToolReleasePreviewItem,
  LocalReleasePlan,
} from "../types.js";
import { MANAGED_TOOL_IDS } from "../types.js";
import { packageRoot, userStateRoot } from "./paths.js";
import { loadCatalog, loadLock } from "./catalog.js";
import { collectToolInventory } from "./tool-inventory.js";
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

export async function resolveCandidate(current: StackLock): Promise<StackLock> {
  const gsdName = current.components.gsd?.package;
  const eccName = current.components.ecc?.package;
  const mcpEntries = Object.entries(current.components.mcp ?? {});
  const bridgeEntries = Object.entries(current.components.mcpBridges ?? {}).filter((entry): entry is [string, LockedPackage] => Boolean(entry[1]));
  if (!gsdName || !eccName) throw new Error("Current lock does not name GSD and ECC packages");
  const [gsd, ecc, mcp, bridges] = await Promise.all([
    latestPackage(gsdName),
    latestPackage(eccName),
    Promise.all(mcpEntries.map(([, entry]) => latestPackage(entry.package))),
    Promise.all(bridgeEntries.map(([, entry]) => latestPackage(entry.package))),
  ]);
  const candidateMcp: Record<string, LockedPackage> = {};
  mcpEntries.forEach(([id], index) => {
    const entry = mcp[index];
    if (entry) candidateMcp[id] = entry;
  });
  const candidateBridges: NonNullable<StackLock["components"]["mcpBridges"]> = {};
  bridgeEntries.forEach(([id], index) => {
    const entry = bridges[index];
    if (entry) candidateBridges[id as keyof typeof candidateBridges] = entry;
  });
  return {
    schemaVersion: 1,
    channel: "candidate",
    generatedAt: new Date().toISOString(),
    status: "unverified",
    components: {
      gsd: { ...gsd, profile: current.components.gsd?.profile ?? "full" },
      ecc: {
        ...ecc,
        skills: current.components.ecc?.skills ?? [],
        sourceSha256: ecc.version === current.components.ecc?.version ? current.components.ecc.sourceSha256 : {},
        targetSha256: ecc.version === current.components.ecc?.version ? current.components.ecc.targetSha256 : {},
      },
      mcp: candidateMcp,
      mcpBridges: candidateBridges,
      ...(current.components.ownedSkills ? { ownedSkills: current.components.ownedSkills } : {}),
    },
  };
}

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The document a candidate stage would write, byte for byte. */
export function renderCandidate(candidate: StackLock): string {
  return `${JSON.stringify(candidate, null, 2)}\n`;
}

export function candidateLockPath(root: string): string {
  return join(resolve(root), "catalog", "candidate.lock.json");
}

export interface CandidateStagePlan {
  kind: "candidate-stage";
  root: string;
  target: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  currentHash: string | null;
  renderedHash: string;
  action: "create" | "update" | "current";
  proofs: OperationPathProofSet;
  digest: string;
}

export interface CandidateStageOptions {
  stateRoot?: string;
}

/**
 * Enumerates the paths a candidate stage would touch and binds the current and
 * rendered hashes. Reads only — a preview compares without writing.
 */
export async function planCandidateStage(
  root: string,
  candidate: StackLock,
  options: CandidateStageOptions = {},
): Promise<CandidateStagePlan> {
  const target = candidateLockPath(root);
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const rendered = renderCandidate(candidate);
  const renderedHash = sha256(rendered);
  const currentHash = existsSync(target) ? sha256(await readFile(target)) : null;

  const allowedRoots = [dirname(target), stateRoot];
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "target", path: target },
      { role: "package-root", path: resolve(root) },
      { role: "state", path: stateRoot },
      { role: "journal", path: join(stateRoot, "journal") },
      { role: "snapshot", path: join(stateRoot, "snapshots") },
    ],
    allowedRoots: [...allowedRoots, resolve(root)],
    requiredRoles: ["target", "state", "journal", "snapshot", "package-root"],
  });

  const action = currentHash === renderedHash ? "current" : currentHash === null ? "create" : "update";
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

  return {
    kind: "candidate-stage",
    root: resolve(root),
    target,
    stateRoot,
    allowedRoots,
    currentHash,
    renderedHash,
    action,
    proofs,
    digest,
  };
}

export interface CandidateStageApplyOptions extends CandidateStageOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: CandidateStagePlan;
  /** A writer already held by the caller; apply then takes no lock of its own. */
  session?: MutationSession;
}

/**
 * Stages a candidate lock through the shared transaction, so the previous
 * candidate is snapshotted and the write is journaled rather than renamed
 * over whatever was there.
 */
export async function writeCandidate(
  root: string,
  candidate: StackLock,
  options: CandidateStageApplyOptions = {},
): Promise<string | null> {
  const reviewed = options.plan ?? await planCandidateStage(root, candidate, options);
  if (reviewed.action === "current") return null;

  const revalidated = await planCandidateStage(reviewed.root, candidate, { stateRoot: reviewed.stateRoot });
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(reviewed, options.session, async (session) => {
    const proof = plannedProof(reviewed, "target", reviewed.target);
    await assertUnchangedSincePlan(reviewed, proof);
    const rendered = renderCandidate(candidate);
    if (sha256(rendered) !== reviewed.renderedHash) {
      throw new ComponentPlanError("plan-drift", `Candidate lock changed between review and apply: ${reviewed.target}`);
    }
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [dirname(reviewed.target)],
      operations: [{ target: reviewed.target, content: rendered }],
      session,
    });
    return journal.id;
  });
}

export function hasVersionChanges(current: StackLock, candidate: StackLock): boolean {
  const version = (value: LockedPackage | undefined): string | null => value?.version ?? null;
  if (version(current.components.gsd) !== version(candidate.components.gsd)) return true;
  if (version(current.components.ecc) !== version(candidate.components.ecc)) return true;
  const ids = new Set([...Object.keys(current.components.mcp ?? {}), ...Object.keys(candidate.components.mcp ?? {})]);
  for (const id of ids) {
    if (version(current.components.mcp?.[id]) !== version(candidate.components.mcp?.[id])) return true;
  }
  const bridgeIds = new Set([
    ...Object.keys(current.components.mcpBridges ?? {}),
    ...Object.keys(candidate.components.mcpBridges ?? {}),
  ]) as Set<keyof NonNullable<StackLock["components"]["mcpBridges"]>>;
  for (const id of bridgeIds) {
    if (version(current.components.mcpBridges?.[id]) !== version(candidate.components.mcpBridges?.[id])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Phase 40: Local Official Release Updates (LOC-02, LOC-03)
// ---------------------------------------------------------------------------

export const MANAGED_TOOL_PACKAGES: Record<Exclude<ManagedToolId, "cua-driver">, string> = {
  gsd: "@opengsd/gsd-core",
  ecc: "ecc-universal",
  "mcp:context7": "@upstash/context7-mcp",
  "mcp:exa": "exa-mcp-server",
  "mcp:firecrawl": "firecrawl-mcp",
  "bridge:pi": "pi-mcp-adapter",
};

export const MANAGED_TOOL_AFFECTED_HARNESSES: Record<ManagedToolId, readonly HarnessId[]> = {
  "cua-driver": ["claude", "codex", "antigravity", "pi", "hermes"],
  gsd: ["claude", "codex", "antigravity", "pi", "hermes"],
  ecc: ["claude", "codex", "antigravity", "pi", "hermes"],
  "mcp:context7": ["claude", "codex", "antigravity", "pi", "hermes"],
  "mcp:exa": ["claude", "codex", "antigravity", "pi", "hermes"],
  "mcp:firecrawl": ["claude", "codex", "antigravity", "pi", "hermes"],
  "bridge:pi": ["pi"],
};

export interface ResolvedNpmRelease {
  readonly version: string;
  readonly integrity: string;
  readonly artifact: string;
  readonly sourceUrl: string;
  readonly digest: string;
}

export type NpmReleaseResolution =
  | { readonly ok: true; readonly release: ResolvedNpmRelease }
  | { readonly ok: false; readonly errorCode: ReleaseResolutionFailureCode; readonly message: string };

export async function resolveNpmStableRelease(
  packageName: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<NpmReleaseResolution> {
  try {
    const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return {
        ok: false,
        errorCode: "discovery-failed",
        message: `npm registry returned HTTP ${response.status} for ${packageName}`,
      };
    }
    const body = (await response.json()) as { version?: unknown; dist?: { integrity?: unknown; tarball?: unknown } };
    if (
      typeof body.version !== "string" ||
      typeof body.dist?.integrity !== "string" ||
      !/^sha512-[A-Za-z0-9+/]+=*$/.test(body.dist.integrity)
    ) {
      return {
        ok: false,
        errorCode: "invalid-metadata",
        message: `npm metadata incomplete or invalid for ${packageName}`,
      };
    }
    // Strict SemVer check: exclude prereleases (D-09)
    if (!/^\d+\.\d+\.\d+$/.test(body.version)) {
      return {
        ok: false,
        errorCode: "latest-is-prerelease",
        message: `npm latest version "${body.version}" for ${packageName} is a prerelease`,
      };
    }

    const rawArtifact = typeof body.dist.tarball === "string" && body.dist.tarball.length > 0
      ? body.dist.tarball.split("/").pop() ?? `${packageName}-${body.version}.tgz`
      : `${packageName}-${body.version}.tgz`;
    // Normalize artifact to match schemas/tool-release-record.schema.json ^[A-Za-z0-9][A-Za-z0-9.+_-]*$
    const artifact = rawArtifact.replace(/^@/, "").replace(/\//g, "-");
    const sourceUrl = typeof body.dist.tarball === "string" && body.dist.tarball.length > 0
      ? body.dist.tarball
      : `https://registry.npmjs.org/${packageName}/-/${rawArtifact}`;

    const digest = createHash("sha256").update(`${packageName}@${body.version}:${body.dist.integrity}`, "utf8").digest("hex");

    return {
      ok: true,
      release: {
        version: body.version,
        integrity: body.dist.integrity,
        artifact,
        sourceUrl,
        digest,
      },
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: "discovery-failed",
      message: `Failed to query npm registry for ${packageName}: ${(error as Error).message}`,
    };
  }
}

export interface ResolvedCuaRelease {
  readonly version: string;
  readonly tag: string;
  readonly artifact: string;
  readonly sourceUrl: string;
  readonly integrity: string;
  readonly digest: string;
  readonly archiveUrl: string;
  readonly assetName: string;
  readonly platform: string;
  readonly architecture: string;
}

export type CuaReleaseResolution =
  | { readonly ok: true; readonly release: ResolvedCuaRelease }
  | { readonly ok: false; readonly errorCode: ReleaseResolutionFailureCode; readonly message: string };

export async function resolveCuaStableRelease(options: {
  fetchImpl?: typeof fetch;
  platform?: string;
  architecture?: string;
  maxPages?: number;
}): Promise<CuaReleaseResolution> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;
  const maxPages = options.maxPages ?? 10;

  const os = platform === "win32" || platform === "windows" ? "windows" : platform === "darwin" || platform === "macos" ? "macos" : "linux";
  const arch = architecture === "x64" || architecture === "x86_64" ? "x64" : architecture === "arm64" ? "arm64" : architecture;

  interface GitHubAsset {
    name: string;
    browser_download_url: string;
  }
  interface GitHubRelease {
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: GitHubAsset[];
  }

  const candidateReleases: Array<{ release: GitHubRelease; version: string; semver: [number, number, number] }> = [];

  for (let page = 1; page <= maxPages; page++) {
    let releases: GitHubRelease[];
    try {
      const res = await fetchFn(`https://api.github.com/repos/trycua/cua/releases?per_page=100&page=${page}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        if (page === 1) {
          return { ok: false, errorCode: "discovery-failed", message: `GitHub API returned HTTP ${res.status}` };
        }
        break;
      }
      releases = (await res.json()) as GitHubRelease[];
      if (!Array.isArray(releases) || releases.length === 0) break;
    } catch (err) {
      if (page === 1) {
        return { ok: false, errorCode: "discovery-failed", message: `Failed to query GitHub releases: ${(err as Error).message}` };
      }
      break;
    }

    for (const rel of releases) {
      if (rel.draft) continue;
      if (rel.tag_name?.startsWith("nightly-")) continue;
      // Tag must match ^cua-driver-rs-v(\d+\.\d+\.\d+)$
      const match = /^cua-driver-rs-v(\d+)\.(\d+)\.(\d+)$/.exec(rel.tag_name ?? "");
      if (!match) continue;
      const major = parseInt(match[1]!, 10);
      const minor = parseInt(match[2]!, 10);
      const patch = parseInt(match[3]!, 10);
      const version = `${major}.${minor}.${patch}`;
      // Exclude withdrawn version 0.28.3
      if (version === "0.28.3") continue;

      candidateReleases.push({
        release: rel,
        version,
        semver: [major, minor, patch],
      });
    }
  }

  if (candidateReleases.length === 0) {
    return {
      ok: false,
      errorCode: "incomplete-discovery",
      message: "No official stable Cua driver release found within bounded discovery limit",
    };
  }

  // Sort candidate releases descending by version
  candidateReleases.sort((a, b) => {
    if (a.semver[0] !== b.semver[0]) return b.semver[0] - a.semver[0];
    if (a.semver[1] !== b.semver[1]) return b.semver[1] - a.semver[1];
    return b.semver[2] - a.semver[2];
  });

  const highest = candidateReleases[0]!;
  const assets = highest.release.assets ?? [];

  // Match platform asset
  let assetPattern: RegExp;
  if (os === "windows") {
    const archLabel = arch === "arm64" ? "arm64" : "x86_64";
    assetPattern = new RegExp(`^cua-driver-rs-${highest.version}-windows-${archLabel}(-binary)?\\.zip$`);
  } else if (os === "macos") {
    assetPattern = new RegExp(`^cua-driver-rs-${highest.version}-darwin-universal(-binary)?\\.tar\\.gz$`);
  } else {
    // linux
    const archLabel = arch === "arm64" ? "arm64" : "x86_64";
    assetPattern = new RegExp(`^cua-driver-rs-${highest.version}-linux-${archLabel}(-binary)?\\.tar\\.gz$`);
  }

  const matchedAsset = assets.find((a) => assetPattern.test(a.name));
  if (!matchedAsset) {
    return {
      ok: false,
      errorCode: "unsupported-platform",
      message: `Platform "${platform}" (${architecture}) is not supported by highest Cua release ${highest.release.tag_name}`,
    };
  }

  const hasChecksums = assets.some((a) => a.name === "SHA256SUMS");
  const hasSigstore = assets.some((a) => a.name === `${matchedAsset.name}.sigstore.json`);
  if (!hasChecksums || !hasSigstore) {
    return {
      ok: false,
      errorCode: "invalid-metadata",
      message: `Required SHA256SUMS or .sigstore.json missing in Cua release ${highest.release.tag_name}`,
    };
  }

  let archiveSha256 = createHash("sha256").update(matchedAsset.browser_download_url, "utf8").digest("hex");
  const checksumsAsset = assets.find((a) => a.name === "SHA256SUMS");
  if (checksumsAsset) {
    try {
      const res = await fetchFn(checksumsAsset.browser_download_url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        const text = await res.text();
        for (const line of text.split(/\r?\n/)) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && parts[1]?.endsWith(matchedAsset.name) && /^[a-f0-9]{64}$/i.test(parts[0]!)) {
            archiveSha256 = parts[0]!.toLowerCase();
            break;
          }
        }
      }
    } catch {
      // Ignore network errors on optional checksum probe during preview
    }
  }

  const artifact = matchedAsset.name;

  return {
    ok: true,
    release: {
      version: highest.version,
      tag: highest.release.tag_name,
      artifact,
      sourceUrl: matchedAsset.browser_download_url,
      integrity: archiveSha256,
      digest: archiveSha256,
      archiveUrl: matchedAsset.browser_download_url,
      assetName: matchedAsset.name,
      platform: os,
      architecture: arch,
    },
  };
}

export function encodeReviewedReleasePlan(payload: ReviewedReleasePlanPayload): string {
  const json = JSON.stringify(payload);
  const deflated = deflateRawSync(Buffer.from(json, "utf8"));
  return deflated.toString("base64url");
}

export function decodeReviewedReleasePlan(token: string): ReviewedReleasePlanPayload {
  if (typeof token !== "string" || token.length === 0) {
    throw new ComponentPlanError("plan-incomplete", "Reviewed plan token is missing or empty");
  }
  try {
    const buf = Buffer.from(token, "base64url");
    const json = inflateRawSync(buf).toString("utf8");
    const data = JSON.parse(json) as ReviewedReleasePlanPayload;
    if (
      !data ||
      data.v !== 1 ||
      !["install", "update"].includes(data.mode) ||
      !Array.isArray(data.targets) ||
      !Array.isArray(data.selectedTools) ||
      !Array.isArray(data.tools)
    ) {
      throw new Error("Payload missing required fields or invalid schema");
    }
    for (const item of data.tools) {
      if (
        !item ||
        typeof item.toolId !== "string" ||
        typeof item.action !== "string" ||
        typeof item.release !== "string" ||
        typeof item.artifact !== "string" ||
        typeof item.integrity !== "string" ||
        typeof item.digest !== "string" ||
        typeof item.sourceId !== "string" ||
        typeof item.sourceUrl !== "string"
      ) {
        throw new Error("Tool binding item missing required fields");
      }
    }
    return data;
  } catch (error) {
    throw new ComponentPlanError("plan-incomplete", `Invalid or corrupted reviewed plan token: ${(error as Error).message}`);
  }
}

function getNativeSideEffects(toolId: ManagedToolId, platform: string): readonly string[] {
  switch (toolId) {
    case "cua-driver":
      if (platform === "win32" || platform === "windows") {
        return [
          "%LOCALAPPDATA%\\Programs\\Cua\\cua-driver\\bin junction",
          "~/.cua-driver/packages/current junction",
          "User PATH entry",
          "Retained version in ~/.cua-driver/packages/releases/",
        ];
      }
      if (platform === "darwin" || platform === "macos") {
        return [
          "/Applications/CuaDriver.app",
          "/usr/local/bin/cua-driver symlink",
          "Accessibility and Screen Recording permissions",
        ];
      }
      return [
        "~/.local/bin/cua-driver binary",
        "~/.cua-driver/packages/releases/ version directory",
        "GNOME Wayland helper ~/.local/share/gnome-shell/extensions/winrects@cua (when Wayland active)",
        "Host GUI invocation unverified",
      ];
    case "gsd":
      return [
        "Global npm install @opengsd/gsd-core",
        "Harness config shims in ~/.gemini/antigravity, ~/.codex, ~/.claude, ~/.pi",
      ];
    case "ecc":
      return [
        "Global npm install ecc-universal",
        "Distributed skill markdown in harness skill directories",
      ];
    case "mcp:context7":
    case "mcp:exa":
      return ["Harness native MCP server registration"];
    case "mcp:firecrawl":
      return ["Harness native MCP server registration via local policy proxy"];
    case "bridge:pi":
      return ["Global npm install pi-mcp-adapter", "Pi harness bridge configuration"];
  }
}

function getRecoveryScope(toolId: ManagedToolId): ToolReleasePreviewItem["recoveryScope"] {
  switch (toolId) {
    case "cua-driver":
      return {
        transactionalRollback: [],
        adapterRecovery: ["cua-driver uninstall script", "CUA_DRIVER_RS_KEEP_VERSIONS prior version activation"],
        unrecoveredEffects: ["User PATH modifications", "Native permissions granted"],
      };
    case "gsd":
      return {
        transactionalRollback: ["alpha-AOS owned config fragments"],
        adapterRecovery: ["npm uninstall -g @opengsd/gsd-core"],
        unrecoveredEffects: ["Global npm cache"],
      };
    case "ecc":
      return {
        transactionalRollback: ["alpha-AOS owned skill files"],
        adapterRecovery: ["npm uninstall -g ecc-universal"],
        unrecoveredEffects: ["Global npm cache"],
      };
    case "mcp:context7":
    case "mcp:exa":
    case "mcp:firecrawl":
      return {
        transactionalRollback: ["Harness MCP config blocks"],
        adapterRecovery: [],
        unrecoveredEffects: [],
      };
    case "bridge:pi":
      return {
        transactionalRollback: ["Pi extension configuration"],
        adapterRecovery: ["npm uninstall -g pi-mcp-adapter"],
        unrecoveredEffects: ["Global npm cache"],
      };
  }
}

export interface CreateLocalReleasePlanOptions {
  mode: "install" | "update";
  packageRoot?: string;
  stateRoot?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  tools?: readonly ManagedToolId[];
  targets?: readonly HarnessId[];
  fetchImpl?: typeof fetch;
  platform?: string;
  architecture?: string;
}

export async function createLocalReleasePlan(
  options: CreateLocalReleasePlanOptions,
): Promise<LocalReleasePlan> {
  const mode = options.mode;
  const pkgRoot = resolve(options.packageRoot ?? packageRoot());
  const stRoot = resolve(options.stateRoot ?? userStateRoot());
  const userHome = resolve(options.home ?? homedir());
  const processEnv = options.env ?? process.env;
  const osPlatform = options.platform ?? process.platform;
  const osArch = options.architecture ?? process.arch;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  const requestedTools = options.tools && options.tools.length > 0 ? options.tools : MANAGED_TOOL_IDS;
  const requestedTargets: readonly HarnessId[] = options.targets && options.targets.length > 0
    ? options.targets
    : ["claude", "codex", "antigravity", "pi", "hermes"];

  let catalog: StackCatalog;
  let lock: StackLock;
  try {
    catalog = await loadCatalog(pkgRoot);
    lock = await loadLock(pkgRoot, "stable");
  } catch {
    const repoRoot = packageRoot();
    catalog = await loadCatalog(repoRoot);
    lock = await loadLock(repoRoot, "stable");
  }

  const inventory = await collectToolInventory({
    catalog,
    lock,
    packageRoot: pkgRoot,
    stateRoot: stRoot,
    home: userHome,
    env: processEnv,
    platform: osPlatform as NodeJS.Platform,
    architecture: osArch,
  });

  const previewItems: ToolReleasePreviewItem[] = [];
  const reviewedBindings: ReviewedToolBinding[] = [];
  const blockedReasons: string[] = [];

  for (const toolId of requestedTools) {
    const obs = inventory.observations.find((o) => o.toolId === toolId);
    const installation = obs?.installation ?? "absent";
    const oldVersion = obs?.installed?.version ?? null;
    const acceptedVersion = obs?.acceptedIdentity?.version ?? null;

    let action: ToolReleaseAction;
    let newVersion: string | null = null;
    let sourceId: "npm-registry" | "driver-release" | null = null;
    let sourceUrl: string | null = null;
    let artifact: string | null = null;
    let integrity: string | null = null;
    let digest: string | null = null;
    let blockedReason: { code: ReleaseResolutionFailureCode; message: string } | undefined;

    if (mode === "update" && installation !== "installed") {
      const isExplicitTool = options.tools !== undefined && options.tools.includes(toolId);
      if (isExplicitTool) {
        action = "blocked";
        blockedReason = {
          code: "absent-tool-in-update",
          message: `Tool "${toolId}" is not installed. Use "alpha-aos install --tool ${toolId}" to install it.`,
        };
        blockedReasons.push(blockedReason.message);
      } else {
        action = "skip-absent";
      }
    } else {
      // Resolve release
      if (toolId === "cua-driver") {
        sourceId = "driver-release";
        const cuaRes = await resolveCuaStableRelease({
          fetchImpl: fetchFn,
          platform: osPlatform,
          architecture: osArch,
        });
        if (!cuaRes.ok) {
          action = "blocked";
          blockedReason = { code: cuaRes.errorCode, message: cuaRes.message };
          blockedReasons.push(blockedReason.message);
        } else {
          newVersion = cuaRes.release.version;
          artifact = cuaRes.release.artifact;
          sourceUrl = cuaRes.release.sourceUrl;
          integrity = cuaRes.release.integrity;
          digest = cuaRes.release.digest;
        }
      } else {
        sourceId = "npm-registry";
        const pkgName = MANAGED_TOOL_PACKAGES[toolId];
        const npmRes = await resolveNpmStableRelease(pkgName, fetchFn);
        if (!npmRes.ok) {
          action = "blocked";
          blockedReason = { code: npmRes.errorCode, message: npmRes.message };
          blockedReasons.push(blockedReason.message);
        } else {
          newVersion = npmRes.release.version;
          artifact = npmRes.release.artifact;
          sourceUrl = npmRes.release.sourceUrl;
          integrity = npmRes.release.integrity;
          digest = npmRes.release.digest;
        }
      }

      if (!blockedReason) {
        if (mode === "install") {
          const isInstalledAndAccepted = installation === "installed" && Boolean(acceptedVersion);
          if (isInstalledAndAccepted) {
            action = "current";
            newVersion = oldVersion;
          } else {
            action = "install";
          }
        } else {
          // mode === "update"
          if (oldVersion === newVersion) {
            action = "current";
          } else {
            action = "update";
          }
        }
      } else {
        action = "blocked";
      }
    }

    const affectedHarnesses = MANAGED_TOOL_AFFECTED_HARNESSES[toolId] ?? requestedTargets;
    const nativeSideEffects = getNativeSideEffects(toolId, osPlatform);
    const recoveryScope = getRecoveryScope(toolId);

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
  }

  const changedTools = previewItems.filter((item) => item.action === "install" || item.action === "update");
  const unchangedTools = previewItems.filter(
    (item) => item.action === "current" || item.action === "skip-absent" || item.action === "blocked",
  );

  const applyAllowed = blockedReasons.length === 0;
  const toolFilterAdvice = !applyAllowed ? "Use --tool <id> to apply only ready tool(s)." : undefined;

  let planDigest: string | null = null;
  let reviewedPlanToken: string | null = null;
  let applyCommand: string | null = null;

  if (applyAllowed) {
    const payload: ReviewedReleasePlanPayload = {
      v: 1,
      mode,
      targets: requestedTargets,
      selectedTools: requestedTools,
      tools: reviewedBindings,
    };
    planDigest = reviewedDigest(mode === "install" ? "local-install-plan" : "local-update-plan", {
      v: 1,
      mode,
      targets: requestedTargets,
      selectedTools: requestedTools,
      tools: reviewedBindings,
    });
    reviewedPlanToken = encodeReviewedReleasePlan(payload);

    const toolFlags = options.tools && options.tools.length < MANAGED_TOOL_IDS.length
      ? ` --tool ${options.tools.join(",")}`
      : "";
    const targetFlags = options.targets && options.targets.length < 5
      ? ` --target ${options.targets.join(",")}`
      : "";
    applyCommand = `alpha-aos ${mode} --apply --plan-digest ${planDigest} --reviewed-plan ${reviewedPlanToken}${toolFlags}${targetFlags}`;
  }

  return {
    mode,
    requestedTools,
    requestedTargets,
    changedTools,
    unchangedTools,
    allTools: previewItems,
    applyAllowed,
    blockedReasons,
    toolFilterAdvice,
    planDigest,
    reviewedPlanToken,
    applyCommand,
  };
}
