import { open, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { officialCuaPaths } from "./computer-use-install.js";
import { readToolRecordStore } from "./tool-records.js";
import { evaluateLegacyHandoff, type LegacyHandoffAssessment } from "./tool-handoff.js";
import type { StackCatalog, StackLock } from "../types.js";

export interface ToolObservation {
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
  proofScopes?: { discovery: string; integrity: string; protocol: string; invocation: string };
}
export interface ToolInventory { observations: ToolObservation[]; records: Awaited<ReturnType<typeof readToolRecordStore>> }

export function reconcileToolState(item: ToolObservation, records: ToolInventory["records"], current?: { path: string; fingerprint: string; platform: string; architecture: string }): void {
  item.integrity = item.installation === "unknown" ? "unknown" : "unverified";
  item.integration = item.installation === "unknown" ? "unknown" : "unverified";
  item.currentObservation = { installation: item.installation, version: item.installed?.version ?? null, integrity: item.integrity, integration: item.integration, reason: item.reason, nextAction: item.nextAction };
  item.acceptedIdentity = null;
  let acceptedResult: import("./tool-records.js").ToolResult | undefined;
  for (const event of records.events) {
    if (event.kind !== "finished" || !event.results) continue;
    const result = event.results.find((entry) => entry.toolId === item.toolId && entry.installed);
    if (!result?.installed) continue;
    const digest = createHash("sha256").update(`${JSON.stringify(event)}\n`).digest("hex");
    if (records.accepted?.[`${item.toolId}/${result.installed.installationId}`] !== digest) continue;
    item.acceptedIdentity = { installationId: result.installed.installationId, version: result.installed.version, operationId: event.operationId };
    acceptedResult = result;
    break;
  }
  const pending = item.installation === "unknown" ? "unknown" : "unverified";
  item.proofScopes = { discovery: pending, integrity: pending, protocol: pending, invocation: pending };
  if (current && acceptedResult?.installed && acceptedResult.resolved && item.installed?.version === acceptedResult.installed.version && [current.path, `path-${createHash("sha256").update(current.path).digest("hex")}`].includes(acceptedResult.installed.pathAlias) && acceptedResult.resolved.release === item.installed.version && acceptedResult.resolved.platform === current.platform && acceptedResult.resolved.architecture === current.architecture) {
    for (const proof of acceptedResult.evidence) {
      if (proof.subject !== acceptedResult.installed.installationId || proof.fingerprint !== current.fingerprint || proof.platform !== current.platform || proof.architecture !== current.architecture) continue;
      if (proof.harness && !item.bindings?.some((binding) => binding.harness === proof.harness && binding.status === "active" && binding.candidatePath === current.path)) continue;
      if (proof.target === "integration" && !proof.harness) continue;
      const scope = proof.target === "installation" && proof.method === "discovery" ? "discovery" : proof.target === "integrity" && ["sha256", "signature"].includes(proof.method) ? "integrity" : proof.target === "integration" && proof.method === "protocol" ? "protocol" : proof.target === "integration" && proof.method === "invocation" ? "invocation" : null;
      if (scope) {
        const status = proof.result === "pass" ? "verified" : proof.result === "fail" ? "failed" : "unknown";
        if (item.proofScopes[scope] === "unverified" || status === "failed" || (status === "unknown" && item.proofScopes[scope] === "verified")) item.proofScopes[scope] = status;
      }
    }
    item.integrity = item.proofScopes.integrity as ToolObservation["integrity"];
    item.integration = item.proofScopes.invocation as ToolObservation["integration"];
    item.currentObservation.integrity = item.integrity;
    item.currentObservation.integration = item.integration;
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
    let current: { path: string; fingerprint: string; platform: string; architecture: string } | undefined;
    if (item.candidates?.length === 1 && item.installed?.version) {
      const path = item.candidates[0]!.path;
      try {
        const file = await open(path, "r");
        try {
          const before = await file.stat();
          if (before.isFile() && before.size <= 16 * 1024 * 1024) {
            const bytes = Buffer.alloc(before.size), read = await file.read(bytes, 0, bytes.length, 0), after = await file.stat(), atPath = await stat(path);
            if (read.bytesRead === bytes.length && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino && before.dev === after.dev && after.ino === atPath.ino && after.dev === atPath.dev && after.size === atPath.size && after.mtimeMs === atPath.mtimeMs) current = { path, fingerprint: createHash("sha256").update(bytes).digest("hex"), platform: platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform, architecture };
          }
        } finally { await file.close(); }
      } catch { /* no current fingerprint; historical proof remains unverified */ }
    }
    reconcileToolState(item, records, current);
    for (const candidate of item.candidates ?? []) candidate.path = pathId(candidate.path);
    for (const binding of item.bindings ?? []) if (binding.candidatePath !== null) binding.candidatePath = pathId(binding.candidatePath);
    if (item.checkedRoots) item.checkedRoots = item.checkedRoots.map(pathId);
  }
  return { observations, records };
}
