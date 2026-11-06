import { open, realpath } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { officialCuaPaths } from "./computer-use-install.js";
import { globalGsdConfigRoot } from "./install.js";
import { globalEccSkillRoot } from "./ecc-skills.js";
import { globalMcpConfigPath, nativeConfigFormat } from "./mcp.js";
import { parseManagedDocument } from "./validation.js";
import type { HarnessId, StackCatalog, StackLock } from "../types.js";
import type { ToolObservation } from "./tool-inventory.js";

export const toolHarnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
export interface ToolObserverContext { catalog: StackCatalog; lock: StackLock; packageRoot: string; stateRoot: string; home: string; env: NodeJS.ProcessEnv; platform?: NodeJS.Platform; architecture?: string; candidateRoots?: string[] }
export interface ToolCandidate { path: string; version: string | null; identity: string; installationOwner: "external" | "alpha-aos" | "unknown"; evidence: string }

export async function boundedText(path: string, maximum = 256 * 1024): Promise<{ state: "ok" | "absent" | "unknown"; text?: string }> {
  try {
    const file = await open(path, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > maximum) return { state: "unknown" };
      const bytes = Buffer.alloc(stat.size);
      if ((await file.read(bytes, 0, bytes.length, 0)).bytesRead !== bytes.length) return { state: "unknown" };
      return { state: "ok", text: bytes.toString("utf8") };
    } finally { await file.close(); }
  } catch (error) { return { state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unknown" }; }
}

async function observeFile(path: string): Promise<"ok" | "absent" | "unknown"> {
  try {
    const file = await open(path, "r");
    try { const info = await file.stat(); return info.isFile() ? "ok" : "unknown"; }
    finally { await file.close(); }
  } catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unknown"; }
}

function safeVersion(value: unknown): string | null {
  return typeof value === "string" && value.length <= 128 && /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(value) ? value : null;
}

export async function observeManagedTools(context: ToolObserverContext, cua: ToolObservation): Promise<ToolObservation[]> {
  const { lock, home, env } = context;
  const prefix = env.npm_config_prefix?.trim() || (context.platform === "win32" || (!context.platform && process.platform === "win32") ? env.APPDATA && join(env.APPDATA, "npm") : dirname(dirname(process.execPath)));
  const windows = (context.platform ?? process.platform) === "win32";
  const allPathEntries = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const pathEntries = allPathEntries.filter((entry) => entry.length <= 4096).slice(0, 128);
  const incompleteRoots = allPathEntries.length !== pathEntries.length || (context.candidateRoots?.length ?? 0) > 128;
  const roots = [...new Set([...(context.candidateRoots ?? []).slice(0, 128), ...(prefix ? [join(prefix, ...(windows ? [] : ["lib"]), "node_modules")] : []), ...pathEntries.flatMap((entry) => [join(entry, "node_modules"), join(dirname(entry), "lib", "node_modules")]), ...toolHarnesses.map((h) => join(globalGsdConfigRoot(h, env, home), "npm", "node_modules"))].map((p) => resolve(p)))];
  const specs = [
    { id: "gsd", pkg: lock.components.gsd }, { id: "ecc", pkg: lock.components.ecc },
    ...["context7", "exa", "firecrawl"].map((id) => ({ id: `mcp:${id}`, pkg: lock.components.mcp?.[id] })),
    { id: "bridge:pi", pkg: lock.components.mcpBridges?.pi },
  ];
  const configuredManifests = new Map<string, Set<string>>();
  let configUnknown = false;
  for (const harness of toolHarnesses) {
    const path = globalMcpConfigPath(harness, env, home);
    const file = await boundedText(path);
    if (file.state === "unknown") { configUnknown = true; continue; }
    if (file.state !== "ok") continue;
    const parsed = parseManagedDocument({ text: file.text!, format: nativeConfigFormat(harness) });
    if (!parsed.ok) { configUnknown = true; continue; }
    const root = parsed.value as Record<string, unknown>;
    const mcp = root?.mcp as Record<string, unknown> | undefined;
    const servers = (root?.mcpServers ?? root?.mcp_servers ?? mcp?.servers) as Record<string, unknown> | undefined;
    if (!servers || typeof servers !== "object") continue;
    for (const [name, value] of Object.entries(servers)) {
      const spec = specs.find((item) => item.id === `mcp:${name}`);
      if (!spec || !value || typeof value !== "object") continue;
      const command = (value as Record<string, unknown>).command;
      if (typeof command !== "string" || command.length > 4096 || !isAbsolute(command)) continue;
      let directory = dirname(command);
      for (let i = 0; i < 5; i++) {
        const entries = configuredManifests.get(spec.id) ?? new Set<string>();
        entries.add(join(directory, "package.json")); configuredManifests.set(spec.id, entries);
        const parent = dirname(directory); if (parent === directory) break; directory = parent;
      }
    }
  }
  const paths = officialCuaPaths(context.platform ?? process.platform, home, env.LOCALAPPDATA);
  const cuaCandidates: ToolCandidate[] = [];
  const cuaPaths = [paths.executable, ...paths.legacyRoots.flatMap((root) => [join(root, windows ? "cua-driver.exe" : "cua-driver"), join(root, "bin", windows ? "cua-driver.exe" : "cua-driver")])];
  let cuaUnknown = false;
  for (const path of new Set(cuaPaths)) {
    const observed = await observeFile(path);
    if (observed === "unknown") cuaUnknown = true;
    if (observed === "ok") try { cuaCandidates.push({ path: await realpath(path), version: null, identity: "cua-driver", installationOwner: "unknown", evidence: "executable-file" }); } catch { cuaUnknown = true; }
  }
  const results: ToolObservation[] = [{ ...cua, installation: cuaCandidates.length ? "installed" : cuaUnknown ? "unknown" : cua.installation, installed: cuaCandidates.length ? { version: null, source: "observed-file" } : cua.installed, candidates: cuaCandidates, checkedRoots: cuaPaths, scope: "bounded-candidates; outside scope unobserved" }];
  for (const spec of specs) {
    const candidates: ToolCandidate[] = [], checkedRoots: string[] = [];
    let uncertain = !spec.pkg || incompleteRoots || (spec.id.startsWith("mcp:") && configUnknown);
    const manifests = spec.pkg ? [...roots.map((root) => join(root, spec.pkg!.package, "package.json")), ...(configuredManifests.get(spec.id) ?? [])] : [];
    if (spec.id === "bridge:pi" && spec.pkg) manifests.push(join(dirname(globalMcpConfigPath("pi", env, home)), "npm", "node_modules", spec.pkg.package, "package.json"));
    for (const path of new Set(manifests)) {
      checkedRoots.push(path);
      const file = await boundedText(path);
      if (file.state === "unknown") { uncertain = true; continue; }
      if (file.state !== "ok") continue;
      try {
        const data = JSON.parse(file.text!) as { name?: unknown; version?: unknown };
        const version = safeVersion(data.version);
        if (data.name !== spec.pkg?.package || !version) { uncertain = true; continue; }
        candidates.push({ path: await realpath(dirname(path)), version, identity: spec.pkg!.package, installationOwner: "unknown", evidence: "package-manifest" });
      } catch { uncertain = true; }
    }
    if (spec.id === "gsd") for (const harness of toolHarnesses) {
      const root = globalGsdConfigRoot(harness, env, home), path = join(root, "gsd-core", "VERSION");
      checkedRoots.push(path, join(root, ".gsd-profile"), join(root, "gsd-core", ".gsd-runtime"));
      const file = await boundedText(path, 4096);
      const metadata = await Promise.all([boundedText(join(root, ".gsd-profile"), 4096), boundedText(join(root, "gsd-core", ".gsd-runtime"), 4096)]);
      if (metadata.some((item) => item.state === "unknown")) uncertain = true;
      if (file.state === "unknown") uncertain = true;
      if (file.state === "ok") try { candidates.push({ path: await realpath(dirname(path)), version: safeVersion(file.text!.trim()), identity: "@opengsd/gsd-core", installationOwner: "unknown", evidence: "gsd-version" }); } catch { uncertain = true; }
    }
    if (spec.id === "ecc" && lock.components.ecc) for (const harness of toolHarnesses) for (const skill of lock.components.ecc.skills) {
      if (!/^[a-z0-9-]{1,128}$/.test(skill)) { uncertain = true; continue; }
      const path = join(globalEccSkillRoot(harness, env, home), skill, "SKILL.md");
      checkedRoots.push(path);
      const file = await boundedText(path, 1024 * 1024);
      if (file.state === "unknown") uncertain = true;
      if (file.state === "ok") try { candidates.push({ path: await realpath(path), version: null, identity: "ecc-universal", installationOwner: "unknown", evidence: "skill-file" }); } catch { uncertain = true; }
    }
    const unique = [...new Map(candidates.map((candidate) => [candidate.path, candidate])).values()].sort((a, b) => a.path.localeCompare(b.path));
    results.push({ toolId: spec.id, installation: unique.length ? "installed" : uncertain ? "unknown" : "absent", installed: unique.length === 1 ? { version: unique[0]!.version, source: "observed-file" } : null, selected: spec.pkg ? { version: spec.pkg.version, source: "reviewed-pin" } : null, integrity: "unverified", integration: "unverified", reason: uncertain ? "Some candidates could not be observed" : "Only listed candidates were checked; other installations are unobserved", nextAction: "Inspect candidates and run explicit verification", candidates: unique, checkedRoots, scope: "bounded-candidates; outside scope unobserved" });
  }
  return results;
}
