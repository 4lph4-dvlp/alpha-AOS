import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { officialCuaPaths } from "./computer-use-install.js";
import { readToolRecordStore } from "./tool-records.js";
import { evaluateLegacyHandoff, type LegacyHandoffAssessment } from "./tool-handoff.js";
import { assessRetainedNpmHandoff } from "./tool-handoff-loader.js";
import type { StackCatalog, StackLock, ManagedToolId, ToolAdapterBinding, ToolAdapterSummary } from "../types.js";
import { acceptedToolResults, matchesToolPathAlias } from "./tool-bindings.js";
import { listCompatibilityAdapters, summarizeToolAdapters } from "./compatibility-adapters.js";
import { realpath } from "node:fs/promises";

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
  candidates?: import("./tool-observers.js").ToolCandidate[];
  checkedRoots?: string[];
  scope?: string;
  bindings?: import("./tool-bindings.js").ToolBinding[];
  diagnostics?: Array<{ severity: "info" | "problem"; code: string }>;
  handoff?: LegacyHandoffAssessment;
  currentObservation?: { installation: ToolObservation["installation"]; version: string | null; integrity: string; integration: string; reason: string; nextAction: string };
  acceptedIdentity?: { installationId: string; version: string; operationId: string } | null;
  latestOperation?: { operationId: string; status: string; version: string | null; outcome: string | null } | null;
  proofScopes?: { discovery: string; integrity: string; protocol: string; invocation: string; fingerprintScope?: string; historical?: { discovery: string; integrity: string; protocol: string; invocation: string } };
  adaptersSummary?: ToolAdapterSummary;
  adapters?: readonly ToolAdapterBinding[];
  modifiedTag?: string;
}
export type ComponentCategory = "alpha-aos-owned-skill" | "bundled-library" | "external-prerequisite" | "harness-application";
export interface InventoryComponent { category: ComponentCategory; id: string; status: "installed" | "absent" | "unknown"; reason: string; version: string | null }
export interface CategorySummary { category: ComponentCategory; count: number; statuses: Record<InventoryComponent["status"], number> }
export interface ToolInventory { observations: ToolObservation[]; records: Awaited<ReturnType<typeof readToolRecordStore>>; components?: InventoryComponent[]; categorySummaries?: CategorySummary[] }

export function orderToolObservations(observations: ToolObservation[]): ToolObservation[] {
  const problem = (item: ToolObservation) => item.installation === "unknown" || item.integrity === "failed" || item.integration === "failed" || (item.handoff?.status === "ambiguous" && !item.bindings?.some((b) => b.status === "active")) || item.diagnostics?.some((d) => d.severity === "problem") || item.bindings?.some((b) => b.status !== "active");
  return [...observations].sort((a, b) => Number(Boolean(problem(b))) - Number(Boolean(problem(a))) || a.toolId.localeCompare(b.toolId));
}

export function reconcileToolState(item: ToolObservation, records: ToolInventory["records"], current?: { path: string; fingerprint: string; platform: string; architecture: string; identity?: string; scope?: string }): void {
  item.integrity = item.installation === "unknown" ? "unknown" : "unverified";
  item.integration = item.installation === "unknown" ? "unknown" : "unverified";
  item.currentObservation = { installation: item.installation, version: item.installed?.version ?? null, integrity: item.integrity, integration: item.integration, reason: item.reason, nextAction: item.nextAction };
  item.acceptedIdentity = null;
  const accepted = acceptedToolResults(records, item.toolId);
  const pathMatching = current
    ? accepted.filter(({ result }) => matchesToolPathAlias(current.path, result.installed!.pathAlias) || (!isAbsolute(result.installed!.pathAlias) && current.identity === result.installed!.pathAlias))
    : [];
  const matching = pathMatching.length > 0 ? pathMatching : accepted;
  const chosen = matching.length === 1
    ? matching[0]
    : matching.length > 1
      ? (matching.find(({ result }) => item.installed?.version && result.installed?.version === item.installed.version) ?? matching[0])
      : undefined;
  const acceptedResult = chosen?.result;
  if (chosen && acceptedResult?.installed) {
    item.acceptedIdentity = { installationId: acceptedResult.installed.installationId, version: acceptedResult.installed.version, operationId: chosen.event.operationId };
    if (acceptedResult.legacy?.userModificationEvidence === "modified") {
      item.modifiedTag = "modified (backup: .user-backup)";
      item.diagnostics ??= [];
      item.diagnostics.push({ severity: "info", code: "modified-backup-user-backup" });
    }
  }
  const pending = item.installation === "unknown" ? "unknown" : "unverified";
  item.proofScopes = { discovery: pending, integrity: pending, protocol: pending, invocation: pending };
  if (current?.scope) item.proofScopes.fingerprintScope = current.scope;
  const knownVersion = item.installed?.version;
  const identityMatches = knownVersion ? knownVersion === acceptedResult?.installed?.version : item.toolId === "cua-driver" && current?.identity === "cua-driver";
  if (current && acceptedResult?.installed && acceptedResult.resolved && identityMatches) {
    const aliasMatches = matchesToolPathAlias(current.path, acceptedResult.installed.pathAlias) || (!isAbsolute(acceptedResult.installed.pathAlias) && (current.identity === acceptedResult.installed.pathAlias || !current.identity));
    if (aliasMatches && acceptedResult.resolved.release === acceptedResult.installed.version && acceptedResult.resolved.platform === current.platform && acceptedResult.resolved.architecture === current.architecture) {
      const exactExecutable = item.toolId === "cua-driver" && current.identity === "cua-driver" && current.scope === "executable-file";
    const evidence = exactExecutable ? item.proofScopes : { discovery: pending, integrity: pending, protocol: pending, invocation: pending };
    if (!exactExecutable) item.proofScopes.historical = evidence;
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
    item.integrity = item.proofScopes.integrity as ToolObservation["integrity"];
    item.integration = item.proofScopes.invocation as ToolObservation["integration"];
    item.currentObservation.integrity = item.integrity;
    item.currentObservation.integration = item.integration;
    }
  }
  if (item.acceptedIdentity && item.installed?.version && item.installed.version !== item.acceptedIdentity.version) {
    item.diagnostics ??= [];
    item.diagnostics.push({ severity: "problem", code: "observed-accepted-version-mismatch" });
  }
  const relevant = records.events.filter((event) => event.requests?.some((request) => request.toolId === item.toolId) || event.result?.toolId === item.toolId || event.results?.some((result) => result.toolId === item.toolId));
  const latestId = relevant[0]?.operationId;
  const operation = latestId ? records.operations.find((entry) => entry.operationId === latestId) : undefined;
  const result = relevant.filter((event) => event.operationId === latestId).flatMap((event) => event.results ?? (event.result ? [event.result] : [])).find((entry) => entry.toolId === item.toolId);
  const request = relevant.filter((event) => event.operationId === latestId).flatMap((event) => event.requests ?? []).find((entry) => entry.toolId === item.toolId);
  item.latestOperation = latestId ? { operationId: latestId, status: operation?.status ?? "unknown", version: result?.resolved?.release ?? request?.selector ?? null, outcome: result?.outcome ?? null } : null;
  item.handoff = (item.candidates?.length ?? 0) > 1 ? { status: "ambiguous", reason: "multiple-candidates", nextAction: "Identify the installation before handoff", scope: null } : evaluateLegacyHandoff(null);
}

/** Fingerprints only the named evidence file; the digest does not attest the complete installation. */
async function fingerprintCandidate(candidate: import("./tool-observers.js").ToolCandidate): Promise<string | null> {
  const name = candidate.evidence === "package-manifest" ? "package.json" : candidate.evidence === "gsd-version" ? "VERSION" : null;
  if (!name && candidate.evidence !== "skill-file" && candidate.evidence !== "executable-file") return null;
  const path = name ? join(candidate.path, name) : candidate.path;
  const equivalent = (a: string, b: string) => process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
  try {
    const canonicalRoot = await realpath(candidate.path), canonicalFile = await realpath(path);
    if (!equivalent(canonicalRoot, candidate.path) || !equivalent(canonicalFile, path)) return null;
    const rootBefore = await stat(candidate.path), file = await open(path, "r");
    try {
      const before = await file.stat();
      if (!before.isFile() || before.size > 256 * 1024 * 1024) return null;
      const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024);
      let offset = 0;
      while (offset < before.size) {
        const read = await file.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
        if (!read.bytesRead) return null;
        hash.update(buffer.subarray(0, read.bytesRead)); offset += read.bytesRead;
      }
      const after = await file.stat(), atPath = await stat(path), rootAfter = await stat(candidate.path);
      const stable = (a: typeof before, b: typeof before) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
      if (!stable(before, after) || !stable(after, atPath) || !stable(rootBefore, rootAfter) || !equivalent(await realpath(path), canonicalFile) || !equivalent(await realpath(candidate.path), canonicalRoot)) return null;
      return hash.digest("hex");
    } finally { await file.close(); }
  } catch { return null; }
}

export async function collectToolInventory(options: { catalog: StackCatalog; lock: StackLock; packageRoot: string; stateRoot: string; home?: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; architecture?: string; candidateRoots?: string[] }): Promise<ToolInventory> {
  const home = options.home ?? homedir(), env = options.env ?? process.env;
  const platform = options.platform ?? process.platform, architecture = options.architecture ?? process.arch;
  const executable = officialCuaPaths(platform, home, env.LOCALAPPDATA).executable;
  let selected: ToolObservation["selected"] = null;
  let reason = "Checks have not been performed";
  try {
    const pinFile = await open(join(options.packageRoot, "catalog", "computer-use-runtime.json"), "r");
    let source: Buffer;
    try {
      const info = await pinFile.stat();
      if (!info.isFile() || info.size > 1024 * 1024) throw new Error("oversize");
      source = Buffer.alloc(info.size);
      const result = await pinFile.read(source, 0, source.length, 0);
      if (result.bytesRead !== source.length) throw new Error("short read");
    } finally { await pinFile.close(); }
    const pin = JSON.parse(source.toString()) as { version?: unknown; assets?: Array<{ os?: unknown; arch?: unknown; entrypoint?: unknown; sha256?: unknown }> };
    if (typeof pin.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pin.version) || !Array.isArray(pin.assets)) throw new Error("invalid");
    const os = platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform;
    const asset = pin.assets.find((item) => item && item.os === os && (item.arch === architecture || item.arch === "universal"));
    if (!asset || typeof asset.entrypoint !== "string" || !/^[A-Za-z0-9._-]+$/.test(asset.entrypoint) || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("unsupported or invalid asset");
    selected = { version: pin.version, source: "reviewed-pin" };
  } catch { reason = "Reviewed pin is unavailable or invalid"; }
  let installation: ToolObservation["installation"] = "unknown";
  let installed: ToolObservation["installed"] = null;
  if (!["win32", "linux", "darwin"].includes(platform)) reason = "Platform is unsupported";
  else if (selected !== null) try {
    const file = await open(executable, "r");
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 256 * 1024 * 1024) throw new Error("invalid file");
      const bytes = Buffer.alloc(Math.min(info.size, 4096));
      await file.read(bytes, 0, bytes.length, 0);
      installation = "installed";
      installed = { version: null, source: "observed-file" };
    } finally { await file.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") installation = "absent";
    else reason = "Installation could not be read";
  }
  const { observeManagedTools } = await import("./tool-observers.js");
  const observations = await observeManagedTools({ ...options, home, env }, { toolId: "cua-driver", installation, installed, selected, integrity: "unverified", integration: "unverified", reason, nextAction: "Inspect installation and run explicit verification" });
  const records = await readToolRecordStore(options);
  const { observeHarnessToolBindings, attributeToolInstallations } = await import("./tool-bindings.js");
  await attributeToolInstallations(observations, await observeHarnessToolBindings({ ...options, home, env }), records, { ...options, home, env });
  const pathId = (path: string) => `path:${createHash("sha256").update(path).digest("hex")}`;
  for (const item of observations) {
    let current: { path: string; fingerprint: string; platform: string; architecture: string; identity: string; scope: string } | undefined;
    if (item.candidates?.length === 1) {
      const candidate = item.candidates[0]!;
      const fingerprint = await fingerprintCandidate(candidate);
      if (fingerprint) current = { path: candidate.path, fingerprint, platform: platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform, architecture, identity: candidate.identity, scope: candidate.evidence };
    }
    reconcileToolState(item, records, current);
    if (item.candidates?.length === 1) item.handoff = await assessRetainedNpmHandoff({ packageRoot: options.packageRoot, stateRoot: options.stateRoot, toolId: item.toolId, candidate: item.candidates[0]! });
    for (const candidate of item.candidates ?? []) candidate.path = pathId(candidate.path);
    for (const binding of item.bindings ?? []) if (binding.candidatePath !== null) binding.candidatePath = pathId(binding.candidatePath);
    if (item.checkedRoots) item.checkedRoots = item.checkedRoots.map(pathId);
  }
  const { boundedText, toolHarnesses } = await import("./tool-observers.js");
  const { destinationFor, renderOwnedSkill } = await import("./owned-skills.js");
  const components: InventoryComponent[] = [];
  for (const skill of options.catalog.components.ownedSkills) {
    const source = await boundedText(join(options.packageRoot, skill.source));
    for (const harness of skill.targets) {
      const destination = await boundedText(destinationFor(harness, skill.id, undefined, env, home));
      const status = destination.state === "absent" ? "absent" : destination.state === "ok" && source.state === "ok" ? "installed" : "unknown";
      let reason = destination.state === "absent" ? "destination absent" : "source or destination unreadable";
      if (status === "installed") try { reason = destination.text === renderOwnedSkill(source.text!, harness, skill.invocation, skill.argumentHint) ? "matches rendered source" : "differs from rendered source"; } catch { reason = "source cannot be rendered"; }
      components.push({ category: "alpha-aos-owned-skill", id: `${skill.id}:${harness}`, status, version: null, reason });
    }
  }
  const manifest = await boundedText(join(options.packageRoot, "package.json"));
  try {
    if (manifest.state !== "ok") throw new Error("unreadable manifest");
    const dependencies = (JSON.parse(manifest.text!) as { dependencies?: Record<string, string> }).dependencies ?? {};
    for (const name of Object.keys(dependencies).sort()) {
      if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) { components.push({ category: "bundled-library", id: "invalid-package-name", status: "unknown", version: null, reason: "invalid dependency name" }); continue; }
      const file = await boundedText(join(options.packageRoot, "node_modules", name, "package.json"));
      let version: string | null = null, status: InventoryComponent["status"] = file.state === "absent" ? "absent" : "unknown";
      if (file.state === "ok") try { const parsed = JSON.parse(file.text!) as { name?: unknown; version?: unknown }; if (parsed.name === name && typeof parsed.version === "string" && /^[\w.+-]{1,128}$/.test(parsed.version)) { status = "installed"; version = parsed.version; } } catch { /* unknown manifest */ }
      components.push({ category: "bundled-library", id: name, status, version, reason: status === "installed" ? "package manifest observed" : "package manifest absent or unreadable" });
    }
  } catch { components.push({ category: "bundled-library", id: "package-manifest", status: "unknown", version: null, reason: "dependency list unavailable" }); }
  const pathEntries = (env.PATH ?? "").split(delimiter).filter((entry) => entry.length > 0 && entry.length <= 4096).slice(0, 128);
  const observeCommand = async (id: string): Promise<InventoryComponent["status"]> => {
    const names = platform === "win32" ? [`${id}.exe`, `${id}.cmd`, `${id}.bat`, id] : [id];
    for (const directory of pathEntries) for (const name of names) try { if ((await stat(join(directory, name))).isFile()) return "installed"; } catch { /* bounded discovery does not prove absence */ }
    return "unknown";
  };
  for (const id of ["node", "npm", "git", "python", "uv", "pipx", "cli-hub"]) { const status = await observeCommand(id); components.push({ category: "external-prerequisite", id, status, version: null, reason: status === "installed" ? "command file observed; version not checked" : "command not established within bounded PATH; version not checked" }); }
  for (const id of toolHarnesses) { const status = await observeCommand(id); components.push({ category: "harness-application", id, status, version: null, reason: status === "installed" ? "command file observed; version not checked" : "application not established within bounded PATH" }); }
  const categories: ComponentCategory[] = ["alpha-aos-owned-skill", "bundled-library", "external-prerequisite", "harness-application"];
  const categorySummaries = categories.map((category) => { const entries = components.filter((item) => item.category === category); return { category, count: entries.length, statuses: { installed: entries.filter((item) => item.status === "installed").length, absent: entries.filter((item) => item.status === "absent").length, unknown: entries.filter((item) => item.status === "unknown").length } }; });
  for (const item of observations) {
    item.category = "managed-tool";
    const active = new Set(item.bindings?.filter((binding) => binding.status === "active").map((binding) => binding.candidatePath));
    item.candidates?.sort((a, b) => Number(active.has(b.path)) - Number(active.has(a.path)) || a.path.localeCompare(b.path));
    item.bindings?.sort((a, b) => a.harness.localeCompare(b.harness) || (a.candidatePath ?? "").localeCompare(b.candidatePath ?? ""));

    const toolId = item.toolId as ManagedToolId;
    const descriptors = listCompatibilityAdapters({ toolId });
    const toolAdapters: ToolAdapterBinding[] = descriptors.map((d) => {
      let derivationDigest: string | undefined;
      for (const ev of records.events) {
        if (ev.kind === "tool-result" && ev.result?.toolId === toolId && ev.result.evidence) {
          const safeToolId = toolId.replace(/:/g, "-");
          const safeAdapterId = d.id.replace(/:/g, "-");
          const expectedProofId = `${safeToolId}-${safeAdapterId}-adapter`;
          const proof = ev.result.evidence.find((p) => p.proofId === expectedProofId || p.proofId === `adapter-${safeAdapterId}`);
          if (proof) {
            derivationDigest = proof.fingerprint;
          }
        }
      }
      return {
        adapterId: d.id,
        kind: d.kind,
        revision: d.revision,
        status: d.status,
        toolId: d.toolId,
        harnesses: d.harnesses,
        platforms: d.platforms,
        rationale: d.rationale,
        applicability: d.applicability,
        verificationMethod: d.verificationMethod,
        removalCondition: d.removalCondition,
        retirement: d.retirement,
        ...(derivationDigest ? { derivationDigest } : {}),
      };
    });
    item.adapters = toolAdapters;
    item.adaptersSummary = summarizeToolAdapters(toolId, { adapters: toolAdapters });
  }
  return { observations: orderToolObservations(observations), records, components, categorySummaries };
}
