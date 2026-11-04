import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { BoundedStdioTransport } from "../dist/src/core/mcp-proxy.js";
import { verifyNativeCua } from "../dist/src/core/computer-use-native.js";
import { computerHash } from "../dist/src/core/computer-use-policy.js";
import { commandProbeEnvironment } from "../dist/src/core/process.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const executable = process.argv[2];
const output = process.argv[3];
if (!executable || !output) throw new Error("Usage: node scripts/probe-cua-native.mjs <reviewed-executable> <receipt-output>");
const runtime = await verifyNativeCua(resolve(executable));
const env = commandProbeEnvironment();
const transport = new BoundedStdioTransport({
  executable: runtime.executable, args: ["mcp", "--direct"],
  cwd: dirname(runtime.executable), timeoutMs: 30_000, maxOutputBytes: 8 * 1024 * 1024, maxMessageBytes: 4 * 1024 * 1024,
  environment: { ...env, source: process.env, literal: { ...env.literal, CUA_DRIVER_PERMISSION_MODE: "standard", CUA_DRIVER_RS_TELEMETRY_ENABLED: "false", CUA_DRIVER_RS_UPDATE_CHECK: "false" } },
});
const client = new Client({ name: "alpha-aos-native-probe", version: "0.6.0" });
try {
  await client.connect(transport);
  const listing = await client.listTools({}, { timeout: 15_000 });
  const tools = listing.tools.sort((a, b) => a.name.localeCompare(b.name));
  const health = await client.callTool({ name: "health_report", arguments: {} }, undefined, { timeout: 15_000 });
  if (health.isError) throw new Error("Cua native read-only health invocation refused");
  const pin = JSON.parse(await readFile(join(root, "catalog/computer-use-runtime.json"), "utf8"));
  const receipt = { version: runtime.version, sourceCommit: pin.sourceCommit, platform: process.platform, arch: process.arch,
    executable: runtime.executable, executableHash: runtime.executableHash, schemaHash: computerHash(tools),
    nativeUse: "invoked", invocation: "health_report", toolCount: tools.length,
    responseHash: createHash("sha256").update(JSON.stringify(health)).digest("hex"),
    screenshotsCaptured: 0, guiActionsExecuted: 0 };
  await writeFile(resolve(output), JSON.stringify(receipt, null, 2) + "\n");
  if (process.platform === "win32") {
    const boundedTools = new Set(["get_window_state", "launch_app", "click", "right_click", "drag", "type_text", "press_key"]);
    await writeFile(join(root, "test/fixtures/cua-0.38.0-windows-tools.json"), JSON.stringify(tools.filter((tool) => boundedTools.has(tool.name)), null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify({ version: receipt.version, nativeUse: receipt.nativeUse, invocation: receipt.invocation, toolCount: receipt.toolCount, schemaHash: receipt.schemaHash }) + "\n");
} finally { await client.close(); await transport.close(); }
