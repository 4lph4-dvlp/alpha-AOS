import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { loadLock } from "../core/catalog.js";
import { packageRoot, userStateRoot } from "../core/paths.js";
import { globalEccSkillRoot } from "../core/ecc-skills.js";
import { BoundedStdioTransport, upstreamProcessSpec } from "../core/mcp-proxy.js";
import { writeAtomicPrivateFile } from "../core/command-jobs.js";
import { createCapabilityReceipt, type TaskCapabilityPort } from "../core/task-capability-receipts.js";
import type { McpServerId } from "../types.js";

const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

/** Real MCP calls and pinned skill bytes, never synthetic successful receipts. */
export function nativeCapabilityPort(stateRoot = userStateRoot()): TaskCapabilityPort {
  return { async invoke(request) {
    const skill = request.obligation.capabilityId;
    if (skill !== "documentation-lookup" && skill !== "deep-research") throw new Error(`No native invocation adapter for ${skill}`);
    const harness = request.harness === "claude" || request.harness === "antigravity" || request.harness === "pi" || request.harness === "hermes" ? request.harness : "codex";
    const lock = await loadLock(packageRoot());
    const bytes = await readFile(join(globalEccSkillRoot(harness), skill, "SKILL.md"));
    const skillHash = digest(bytes);
    if (skillHash !== lock.components.ecc?.targetSha256[skill]?.[harness]) throw new Error(`Installed ${skill} differs from its reviewed skill pin`);
    const activatedAt = new Date().toISOString();
    const sessionId = request.sessionId ?? `native-mcp-${randomUUID()}`;
    const calls: Array<{ server: string; name: string; result: unknown }> = [];
    const connections: Array<{ client: Client; transport: BoundedStdioTransport }> = [];
    const connect = async (server: McpServerId) => {
      const locked = lock.components.mcp?.[server];
      if (!locked) throw new Error(`No pinned MCP source for ${server}`);
      const transport = new BoundedStdioTransport({ ...upstreamProcessSpec(server, locked), cwd: request.projectRoot, timeoutMs: 120_000 });
      const client = new Client({ name: "alpha-aos-native-capability", version: "1" });
      connections.push({ client, transport });
      await client.connect(transport, { timeout: 60_000 });
      const listing = await client.listTools(undefined, { timeout: 60_000 });
      calls.push({ server, name: "tools/list", result: { package: locked.package, version: locked.version, listing } });
      return async (name: string, args: Record<string, unknown>) => {
        if (!listing.tools.some((tool) => tool.name === name)) throw new Error(`${server} does not expose required tool ${name}`);
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 });
        if (result.isError) throw new Error(`${server}/${name} returned an error; capability evidence is not successful`);
        calls.push({ server, name, result });
        return result;
      };
    };
    try {
      if (skill === "documentation-lookup") {
        // Select an actual project dependency rather than inventing a library ID.
        const manifest = JSON.parse(await readFile(join(request.projectRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
        const names = Object.keys(manifest.dependencies ?? {});
        const libraryName = names.find((name) => name === "@modelcontextprotocol/sdk") ?? names[0];
        if (!libraryName) throw new Error("Documentation capability needs a declared project library");
        const call = await connect("context7");
        const resolved = await call("resolve-library-id", { libraryName, query: request.obligation.question });
        const text = JSON.stringify(resolved);
        const id = text.match(/(?:Context7-compatible library ID|Library ID):\s*(\/[^\s"\\]+)/iu)?.[1];
        if (!id) throw new Error("Context7 returned no discoverable library ID; refusing a guessed ID");
        await call("query-docs", { libraryId: id, query: request.obligation.question });
      } else {
        const search = await connect("exa");
        const result = await search("web_search_exa", { query: request.obligation.question, numResults: 6 });
        const text = JSON.stringify(result).replaceAll("\\n", "\n");
        const hosts = new Set(["github.com", "raw.githubusercontent.com", "npmjs.com", "www.npmjs.com", "registry.npmjs.org", "nodejs.org", "context7.com", "docs.exa.ai", "docs.firecrawl.dev", "cua.ai"]);
        const urls = [...new Set(text.match(/https:\/\/[^\s"\\<>]+/gu) ?? [])].filter((value) => {
          try { const url = new URL(value); return hosts.has(url.hostname) && !url.username && !url.password && (!url.port || url.port === "443"); } catch { return false; }
        }).slice(0, 3);
        if (urls.length < 2) throw new Error("Research returned insufficient primary-source URLs; no successful research receipt emitted");
        const scrape = await connect("firecrawl");
        for (const url of urls) await scrape("firecrawl_scrape", { url, formats: ["markdown"] });
      }
      const evidence = JSON.stringify({ sessionId, runId: request.runId, step: request.step, obligationId: request.obligation.id,
        skill, skillHash, activatedAt, calls });
      const evidenceHash = digest(evidence);
      await writeAtomicPrivateFile(join(stateRoot, "capabilities", "native-results", `${evidenceHash}.json`), evidence, 8 * 1024 * 1024, stateRoot);
      return { receipt: createCapabilityReceipt({ runId: request.runId, step: request.step, capabilityId: skill,
        obligationId: request.obligation.id, question: request.obligation.question, selected: true, invoked: true,
        toolName: [...new Set(calls.filter((call) => call.name !== "tools/list").map((call) => call.name))].join(","),
        harness: "alpha-aos-native-mcp", harnessVersion: "1", harnessExecutable: process.execPath, sessionId,
        source: request.obligation.source, sourceVersion: request.obligation.version, observationId: evidenceHash,
        rawResultSha256: evidenceHash, skillActivatedAt: activatedAt, mcpObservedAt: new Date().toISOString(),
        isReused: false, originalReceiptId: null, isError: false, errorMessage: null }) };
    } finally {
      for (const { client, transport } of connections.reverse()) {
        try { await client.close(); } finally { await transport.close(); }
      }
    }
  } };
}
