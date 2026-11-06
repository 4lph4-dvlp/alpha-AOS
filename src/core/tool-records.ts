import { createHash } from "node:crypto";
import { opendir, open } from "node:fs/promises";
import { join, relative, resolve, isAbsolute, sep } from "node:path";
import { canonicalizeWithMissingTail, provePathBoundary, recheckPathProof, type PathProof } from "./path-boundary.js";
import { packageRoot } from "./paths.js";
import { rejectRawCredentials, validateManagedDocument } from "./validation.js";

export interface ToolIdentity { toolId: string; installationId: string }
export interface ToolEvidence { proofId: string; subject: string; target: string; method: string; result: string; platform: string; architecture: string; harness: string | null }
export interface ToolResult { toolId: string; requested: { toolId: string; selector: string; exact: boolean }; resolved: { release: string; artifact: string; architecture: string; digest: string; sourceId: string; sourceUrl: string; platform: string } | null; installed: { installationId: string; version: string; pathAlias: string } | null; verified: string | null; evidence: ToolEvidence[]; outcome: string }
export interface ToolRecordEvent { schemaVersion: 1; eventId: string; operationId: string; sequence: number; occurredAt: string; kind: "started" | "tool-result" | "finished"; requests?: Array<{ toolId: string; selector: string; exact: boolean }>; result?: ToolResult; results?: ToolResult[]; outcome?: string; acceptedTransitions?: Array<{ toolId: string; installationId: string; proofId: string; priorDigest: string | null }> }
export type ToolRecordStatus = "absent" | "current" | "invalid" | "unsupported-old" | "unknown-newer" | "inaccessible";
export interface ToolRecordStore { status: ToolRecordStatus; events: ToolRecordEvent[]; accepted: Record<string, string> | null; diagnostics: string[]; incomplete: boolean }

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function inside(root: string, target: string): boolean {
  const insensitive = process.platform === "win32" || process.platform === "darwin";
  const rel = relative(insensitive ? root.toLowerCase() : root, insensitive ? target.toLowerCase() : target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}
export async function proveToolRecordRoot(stateRoot: string, checkout: string): Promise<PathProof | null> {
  const state = resolve(stateRoot), project = resolve(checkout);
  const a = await canonicalizeWithMissingTail(state), b = await canonicalizeWithMissingTail(project);
  if (a.reason || b.reason || inside(project, state) || inside(b.canonical, a.canonical)) return null;
  const proof = await provePathBoundary({ path: join(state, "tool-records"), allowedRoots: [state], role: "state" });
  return proof.proven && proof.capability.componentIdentity && !proof.components.some((p) => p.reparse !== "none" && inside(state, p.path)) ? proof : null;
}
async function readBounded(path: string, maximum: number): Promise<Buffer> {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maximum) throw new Error("invalid-size");
    const bytes = Buffer.alloc(info.size);
    if ((await file.read(bytes, 0, bytes.length, 0)).bytesRead !== bytes.length) throw new Error("short-read");
    return bytes;
  } finally { await file.close(); }
}
function shallowJson(text: string): boolean {
  let depth = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === "{" || char === "[") { depth += 1; if (depth > 32) return false; }
    else if (char === "}" || char === "]") depth -= 1;
  }
  return true;
}
function safeSource(result: ToolResult): boolean {
  if (result.toolId !== result.requested.toolId) return false;
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
async function names(path: string): Promise<{ values: string[]; incomplete: boolean }> {
  const directory = await opendir(path), values: string[] = [];
  let incomplete = false;
  try { for await (const entry of directory) { if (values.length >= 10000) { incomplete = true; break; } values.push(entry.name); } }
  finally { await directory.close().catch(() => undefined); }
  return { values: values.sort(), incomplete };
}
export async function readToolRecordStore(options: { stateRoot: string; packageRoot: string; onAfterRead?: () => Promise<void> }): Promise<ToolRecordStore> {
  const result: ToolRecordStore = { status: "current", events: [], accepted: null, diagnostics: [], incomplete: false };
  const proof = await proveToolRecordRoot(options.stateRoot, options.packageRoot);
  if (!proof) return { ...result, status: "inaccessible", diagnostics: ["unsafe-or-unprovable-root"] };
  let versions: Awaited<ReturnType<typeof names>>;
  try { versions = await names(proof.configured); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && (await recheckPathProof(proof)).ok) return { ...result, status: "absent" };
    return { ...result, status: "inaccessible", diagnostics: ["store-unreadable"] };
  }
  if (versions.incomplete) { result.incomplete = true; result.diagnostics.push("incomplete-history"); }
  if (versions.values.some((name) => /^v\d+$/.test(name) && Number(name.slice(1)) > 1)) { result.status = "unknown-newer"; result.diagnostics.push("version-unknown-newer"); }
  if (versions.values.some((name) => /^v\d+$/.test(name) && Number(name.slice(1)) < 1)) { result.status = "unsupported-old"; result.diagnostics.push("version-unsupported-old"); }
  if (versions.values.some((name) => !/^v\d+$/.test(name))) { result.status = "invalid"; result.diagnostics.push("invalid-version-entry"); }
  if (!versions.values.includes("v1")) return result;
  const base = join(options.stateRoot, "tool-records", "v1", "operations");
  const operationsProof = await provePathBoundary({ path: base, allowedRoots: [options.stateRoot], role: "state" });
  if (!operationsProof.proven || !operationsProof.capability.componentIdentity || operationsProof.components.some((part) => part.reparse !== "none" && inside(resolve(options.stateRoot), part.path))) return { ...result, status: "inaccessible", diagnostics: [...result.diagnostics, "unprovable-operations-path"] };
  let operations: Awaited<ReturnType<typeof names>>;
  try { operations = await names(base); }
  catch (error) {
    const checked = await recheckPathProof(proof);
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && checked.ok) return { ...result, status: "invalid", diagnostics: [...result.diagnostics, "operations-missing"] };
    return { ...result, status: "inaccessible", diagnostics: ["store-unreadable"] };
  }
  result.incomplete ||= operations.incomplete;
  const seen = new Map<string, string>(), filesByEvent = new Map<string, { path: string; digest: string; proof: PathProof }>();
  let schema: Record<string, unknown> | undefined;
  let count = 0;
  operationLoop: for (const operation of operations.values) {
    if (!idPattern.test(operation)) { result.status = "invalid"; result.diagnostics.push("invalid-operation-name"); continue; }
    const dir = join(base, operation);
    try {
      const files = await names(dir);
      result.incomplete ||= files.incomplete;
      for (const name of files.values) {
        if (++count > 10000) { result.incomplete = true; break operationLoop; }
        if (!/^\d{1,7}-[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(name)) { result.status = "invalid"; result.diagnostics.push("invalid-event-name"); continue; }
        const path = join(dir, name);
        const eventProof = await provePathBoundary({ path, allowedRoots: [options.stateRoot], role: "state" });
        if (!eventProof.proven || !eventProof.capability.componentIdentity || eventProof.components.some((p) => p.reparse !== "none" && inside(resolve(options.stateRoot), p.path))) { result.status = "inaccessible"; result.diagnostics.push("unprovable-event-path"); continue; }
        const bytes = await readBounded(path, 256 * 1024);
        await options.onAfterRead?.();
        if (!(await recheckPathProof(eventProof)).ok || !(await recheckPathProof(proof)).ok) { result.status = "inaccessible"; result.diagnostics.push("ancestor-changed"); continue; }
        schema ??= JSON.parse((await readBounded(join(packageRoot(), "schemas", "tool-release-record.schema.json"), 256 * 1024)).toString()) as Record<string, unknown>;
        const text = bytes.toString();
        if (!shallowJson(text)) { result.status = "invalid"; result.diagnostics.push("event-too-deep"); continue; }
        const validated = validateManagedDocument<ToolRecordEvent>({ text, format: "json", kind: "tool-release-record", schema, domain: (v) => rejectRawCredentials(v) });
        if (!validated.ok || !validated.value) { result.status = validated.status === "unknown-newer" || validated.status === "unsupported-old" ? validated.status : "invalid"; result.diagnostics.push(`event-${validated.status}`); continue; }
        const event = validated.value;
        const details = event.kind === "started" ? (event.requests ?? []).map((r) => r.toolId) : event.kind === "finished" ? (event.results ?? []).map((r) => r.toolId) : [event.result?.toolId];
        const results = event.kind === "finished" ? event.results ?? [] : event.result ? [event.result] : [];
        if (operation !== event.operationId || name !== `${event.sequence}-${event.eventId}.json` || !Number.isFinite(Date.parse(event.occurredAt)) || new Set(details).size !== details.length || results.some((r) => !safeSource(r))) { result.status = "invalid"; result.diagnostics.push("event-identity-invalid"); continue; }
        const normalized = canonical(event), key = `${event.operationId}:${event.sequence}:${event.eventId}`, prior = seen.get(key);
        if (prior !== undefined) { if (prior !== normalized) { result.status = "invalid"; result.diagnostics.push("event-conflict"); } continue; }
        if ([...seen.keys()].some((k) => k.startsWith(`${event.operationId}:${event.sequence}:`) || k.endsWith(`:${event.eventId}`))) { result.status = "invalid"; result.diagnostics.push("event-conflict"); continue; }
        seen.set(key, normalized); filesByEvent.set(key, { path: resolve(path), digest: createHash("sha256").update(bytes).digest("hex"), proof: eventProof }); result.events.push(event);
      }
    } catch { result.status = "inaccessible"; result.diagnostics.push("event-unreadable"); }
  }
  result.events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.operationId.localeCompare(a.operationId) || b.sequence - a.sequence || b.eventId.localeCompare(a.eventId));
  if (!(await recheckPathProof(operationsProof)).ok || !(await recheckPathProof(proof)).ok) return { ...result, status: "inaccessible", events: [], accepted: null, diagnostics: [...result.diagnostics, "ancestor-changed"] };
  if (result.incomplete) result.diagnostics.push("incomplete-history");
  const accepted: Record<string, string> = {};
  for (const event of [...result.events].reverse()) {
    if (event.kind !== "finished" || !event.acceptedTransitions?.length) continue;
    const target = filesByEvent.get(`${event.operationId}:${event.sequence}:${event.eventId}`);
    if (!target || event.outcome !== "succeeded" || result.incomplete || result.status !== "current" || !(await hasAppliedJournal(options.stateRoot, target.path, target.digest)) || !(await recheckPathProof(target.proof)).ok) {
      result.diagnostics.push("accepted-commit-unverified"); continue;
    }
    const operationEvents = result.events.filter((item) => item.operationId === event.operationId);
    const starts = operationEvents.filter((item) => item.kind === "started");
    const requested = starts[0]?.requests ?? [];
    const outcomes = event.results ?? [];
    if (starts.length !== 1 || operationEvents.filter((item) => item.kind === "finished").length !== 1 || requested.length !== outcomes.length || outcomes.some((item) => !requested.some((r) => canonical(r) === canonical(item.requested)) || item.outcome !== "succeeded") || outcomes.some((item) => operationEvents.filter((other) => other.kind === "tool-result" && other.sequence > starts[0]!.sequence && other.sequence < event.sequence && other.result?.toolId === item.toolId && canonical(other.result) === canonical(item)).length !== 1)) {
      result.diagnostics.push("accepted-operation-incomplete"); continue;
    }
    const proposed: string[] = [];
    for (const transition of event.acceptedTransitions) {
      const tool = event.results?.find((r) => r.toolId === transition.toolId);
      const evidence = tool?.evidence.find((e) => e.proofId === transition.proofId);
      const identity = `${transition.toolId}/${transition.installationId}`;
      if (!tool || tool.outcome !== "succeeded" || tool.installed?.installationId !== transition.installationId || tool.installed.version !== tool.resolved?.release || tool.verified !== transition.proofId || !evidence || evidence.result !== "pass" || evidence.target !== "integration" || evidence.method !== "invocation" || !evidence.harness || evidence.subject !== transition.installationId || evidence.platform !== tool.resolved.platform || evidence.architecture !== tool.resolved.architecture || transition.priorDigest !== (accepted[identity] ?? null)) {
        result.diagnostics.push("accepted-evidence-invalid"); proposed.length = 0; break;
      }
      if (proposed.includes(identity)) { result.diagnostics.push("accepted-evidence-invalid"); proposed.length = 0; break; }
      proposed.push(identity);
    }
    for (const identity of proposed) accepted[identity] = target.digest;
  }
  if (Object.keys(accepted).length) result.accepted = accepted;
  return result;
}
async function hasAppliedJournal(stateRoot: string, target: string, digest: string): Promise<boolean> {
  const root = join(stateRoot, "journal");
  try {
    const entries = await names(root);
    if (entries.incomplete) return false;
    for (const name of entries.values) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(name)) continue;
      const path = join(root, name), proof = await provePathBoundary({ path, allowedRoots: [stateRoot], role: "journal" });
      if (!proof.proven || !proof.capability.componentIdentity || proof.components.some((p) => p.reparse !== "none" && inside(resolve(stateRoot), p.path))) continue;
      const bytes = await readBounded(path, 1024 * 1024);
      if (!(await recheckPathProof(proof)).ok) return false;
      const document = validateManagedDocument<{ status: string; files: Array<{ target?: unknown; afterHash?: unknown; beforeHash?: unknown; existed?: unknown; snapshot?: unknown; proofDigest?: unknown }> }>({ text: bytes.toString(), format: "json", kind: "journal" });
      if (document.ok && document.value?.status === "applied" && document.value.files.some((file) => typeof file.target === "string" && resolve(file.target) === target && file.afterHash === digest && typeof file.existed === "boolean" && (file.snapshot === null || typeof file.snapshot === "string") && (file.beforeHash === null || (typeof file.beforeHash === "string" && /^[a-f0-9]{64}$/.test(file.beforeHash))) && typeof file.proofDigest === "string" && /^[a-f0-9]{64}$/.test(file.proofDigest))) return true;
    }
  } catch { return false; }
  return false;
}
export async function readToolHistory(options: { stateRoot: string; packageRoot: string }, toolId: string) {
  const store = await readToolRecordStore(options);
  return { ...store, events: store.events.filter((event) => event.result?.toolId === toolId || event.results?.some((r) => r.toolId === toolId) || event.requests?.some((r) => r.toolId === toolId)) };
}
export async function readOperationHistory(options: { stateRoot: string; packageRoot: string }, operationId: string) {
  const store = await readToolRecordStore(options);
  return { ...store, events: store.events.filter((event) => event.operationId === operationId) };
}
