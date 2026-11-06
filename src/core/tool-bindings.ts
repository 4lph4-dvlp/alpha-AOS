import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, join, resolve, sep } from "node:path";
import { globalMcpConfigPath, nativeConfigFormat } from "./mcp.js";
import { globalGsdConfigRoot } from "./install.js";
import { globalEccSkillRoot } from "./ecc-skills.js";
import { boundedText, parseNativeConfiguration, toolHarnesses, type ToolCandidate, type ToolObserverContext } from "./tool-observers.js";
import type { HarnessId } from "../types.js";
import type { ToolObservation } from "./tool-inventory.js";
import { inspectToolRecordJournal, type ToolRecordStore, type ToolRecordEvent, type ToolResult } from "./tool-records.js";

export interface ToolBinding { harness: HarnessId; status: "active" | "unresolved" | "unknown"; candidatePath: string | null; connectionOwner: "external" | "alpha-aos" | "unknown"; reason: string; nextAction: string }
interface BindingIntent { harness: HarnessId; toolId: string; target: string | null; reason: string; connectionOwner?: "alpha-aos" | "unknown" }

export function matchesToolPathAlias(path: string, alias: string): boolean {
  return alias === path || alias === `path-${createHash("sha256").update(path).digest("hex")}`;
}

export function acceptedToolResults(records: ToolRecordStore, toolId: string): Array<{ event: ToolRecordEvent; result: ToolResult }> {
  const accepted: Array<{ event: ToolRecordEvent; result: ToolResult }> = [];
  if (records.status !== "current" || records.incomplete) return accepted;
  for (const event of records.events) {
    if (event.kind !== "finished" || event.outcome !== "succeeded") continue;
    const digest = records.verifiedEventDigests?.[`${event.operationId}:${event.sequence}:${event.eventId}`];
    if (!digest) continue;
    for (const result of event.results ?? []) {
      if (result.toolId === toolId && result.outcome === "succeeded" && result.installed && records.accepted?.[`${toolId}/${result.installed.installationId}`] === digest) accepted.push({ event, result });
    }
  }
  return accepted;
}

export async function observeHarnessToolBindings(context: ToolObserverContext): Promise<BindingIntent[]> {
  const output: BindingIntent[] = [];
  for (const harness of toolHarnesses) {
    const configPath = globalMcpConfigPath(harness, context.env, context.home);
    const file = await boundedText(configPath);
    if (file.state === "absent") continue;
    if (file.state === "unknown") { for (const id of ["context7", "exa", "firecrawl", "cua"]) output.push({ harness, toolId: id === "cua" ? "cua-driver" : `mcp:${id}`, target: null, reason: "config-unreadable" }); continue; }
    const parsed = parseNativeConfiguration(file.text!, nativeConfigFormat(harness));
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") { for (const id of ["context7", "exa", "firecrawl", "cua"]) output.push({ harness, toolId: id === "cua" ? "cua-driver" : `mcp:${id}`, target: null, reason: "config-invalid" }); continue; }
    const root = parsed.value as Record<string, unknown>, mcp = root.mcp as Record<string, unknown> | undefined;
    const servers = (root.mcpServers ?? root.mcp_servers ?? mcp?.servers) as Record<string, unknown> | undefined;
    if (!servers || typeof servers !== "object") continue;
    const start = file.text!.indexOf("# alpha-aos:start mcp"), end = file.text!.indexOf("# alpha-aos:end mcp");
    const block = harness === "codex" && start >= 0 && end > start ? file.text!.slice(start, end) : "";
    const managedJournal = block ? (await inspectToolRecordJournal(context.stateRoot, configPath, createHash("sha256").update(file.text!).digest("hex"))).applied : false;
    for (const id of ["context7", "exa", "firecrawl", "cua"]) {
      const item = servers[id];
      if (!item || typeof item !== "object") continue;
      const command = (item as Record<string, unknown>).command;
      const literal = typeof command === "string" && command.length <= 4096 && isAbsolute(command) && !/[\r\n\0$%]/.test(command);
      const connectionOwner = managedJournal && new RegExp(`^\\[mcp_servers\\.${id}\\]\\s*$`, "m").test(block) ? "alpha-aos" : "unknown";
      output.push({ harness, toolId: id === "cua" ? "cua-driver" : `mcp:${id}`, target: literal ? command : null, reason: literal ? "literal-target" : "connection-intent-unresolved", connectionOwner });
    }
  }
  return output;
}

async function exactPackageTarget(candidate: ToolCandidate, target: string): Promise<boolean> {
  if (candidate.identity === "cua-driver" && candidate.evidence === "executable-file") {
    try { return await realpath(target) === candidate.path; } catch { return false; }
  }
  if (candidate.evidence !== "package-manifest") return false;
  const file = await boundedText(join(candidate.path, "package.json"));
  if (file.state !== "ok") return false;
  try {
    const manifest = JSON.parse(file.text!) as { name?: unknown; bin?: unknown };
    if (manifest.name !== candidate.identity) return false;
    const bins = typeof manifest.bin === "string" ? [manifest.bin] : manifest.bin && typeof manifest.bin === "object" ? Object.values(manifest.bin as Record<string, unknown>) : [];
    const actual = await realpath(target);
    if (!actual.startsWith(`${candidate.path}${sep}`)) return false;
    for (const bin of bins.slice(0, 64)) {
      if (typeof bin !== "string" || bin.length > 4096 || isAbsolute(bin)) continue;
      const path = resolve(candidate.path, bin);
      if (!path.startsWith(`${candidate.path}${sep}`)) continue;
      try { if (await realpath(path) === actual) return true; } catch { /* unresolved target */ }
    }
  } catch { return false; }
  return false;
}

export async function attributeToolInstallations(observations: ToolObservation[], intents: BindingIntent[], records: ToolRecordStore, context: ToolObserverContext): Promise<void> {
  for (const item of observations) {
    const acceptedResults = acceptedToolResults(records, item.toolId).map(({ result }) => result);
    for (const candidate of item.candidates ?? []) {
      const matched = acceptedResults.find((result) => matchesToolPathAlias(candidate.path, result.installed!.pathAlias));
      const unresolvedRecord = acceptedResults.some((result) => !isAbsolute(result.installed!.pathAlias) && !/^path-[a-f0-9]{64}$/.test(result.installed!.pathAlias));
      candidate.installationOwner = matched ? "alpha-aos" : candidate.evidence === "path-name-unverified" || unresolvedRecord ? "unknown" : records.status === "absent" || (records.status === "current" && !records.incomplete) ? "external" : "unknown";
    }
    const bindings: ToolBinding[] = [];
    for (const intent of intents.filter((entry) => entry.toolId === item.toolId)) {
      const matches: ToolCandidate[] = [];
      if (intent.target) for (const candidate of item.candidates ?? []) if (await exactPackageTarget(candidate, intent.target)) matches.push(candidate);
      bindings.push({ harness: intent.harness, status: matches.length === 1 ? "active" : intent.reason.startsWith("config-") ? "unknown" : "unresolved", candidatePath: matches.length === 1 ? matches[0]!.path : null, connectionOwner: intent.connectionOwner ?? "unknown", reason: matches.length > 1 ? "ambiguous-target" : matches.length === 1 ? "exact-manifest-target" : intent.target && item.candidates?.length ? "target-unmatched" : intent.reason, nextAction: matches.length === 1 ? "Run explicit integration verification" : "Inspect native connection" });
    }
    if (item.toolId === "gsd" || item.toolId === "ecc") for (const harness of toolHarnesses) {
      if (item.toolId === "gsd") {
        const root = globalGsdConfigRoot(harness, context.env, context.home);
        const [runtime, profile] = await Promise.all([boundedText(join(root, "gsd-core", ".gsd-runtime"), 4096), boundedText(join(root, ".gsd-profile"), 4096)]);
        let target: string | null = null;
        try { target = await realpath(join(root, "gsd-core")); } catch { /* absent or unreadable */ }
        const candidate = item.candidates?.find((entry) => entry.path === target && entry.evidence === "gsd-version");
        if (candidate && runtime.state === "ok" && runtime.text!.trim() === harness && profile.state === "ok") bindings.push({ harness, status: "active", candidatePath: candidate.path, connectionOwner: "unknown", reason: "native-runtime-target", nextAction: "Run explicit integration verification" });
        else if (candidate) bindings.push({ harness, status: "unresolved", candidatePath: null, connectionOwner: "unknown", reason: "native-runtime-unresolved", nextAction: "Inspect native connection" });
      } else {
        let root: string | null = null;
        try { root = await realpath(globalEccSkillRoot(harness, context.env, context.home)); } catch { /* absent or unreadable */ }
        if (root) for (const candidate of item.candidates ?? []) if (candidate.evidence === "skill-file" && candidate.path.startsWith(`${root}${sep}`)) bindings.push({ harness, status: "active", candidatePath: candidate.path, connectionOwner: "unknown", reason: "native-skill-target", nextAction: "Run explicit integration verification" });
      }
    }
    item.bindings = bindings;
    const activeBindings = bindings.filter((binding) => binding.status === "active");
    const activePaths = activeBindings.map((binding) => binding.candidatePath);
    const diagnostics: NonNullable<ToolObservation["diagnostics"]> = [];
    if (new Set(activePaths).size < activePaths.length) diagnostics.push({ severity: "info", code: "shared-installation" });
    const versions = new Set((item.candidates ?? []).filter((candidate) => activePaths.includes(candidate.path) && candidate.version !== null).map((candidate) => candidate.version));
    if (versions.size > 1) diagnostics.push({ severity: "info", code: "version-split" });
    if (bindings.some((binding) => binding.status !== "active")) diagnostics.push({ severity: "problem", code: "usage-unresolved" });
    if (bindings.some((binding) => binding.reason === "target-unmatched" || binding.reason === "ambiguous-target")) diagnostics.push({ severity: "problem", code: "target-conflict" });
    if (acceptedResults.some((result) => (isAbsolute(result.installed!.pathAlias) || /^path-[a-f0-9]{64}$/.test(result.installed!.pathAlias)) && !(item.candidates ?? []).some((candidate) => matchesToolPathAlias(candidate.path, result.installed!.pathAlias)))) diagnostics.push({ severity: "problem", code: "record-target-mismatch" });
    item.diagnostics = diagnostics;
    const active = new Set(bindings.filter((binding) => binding.status === "active").map((binding) => binding.candidatePath));
    item.candidates?.sort((a, b) => Number(active.has(b.path)) - Number(active.has(a.path)) || a.path.localeCompare(b.path));
  }
}
