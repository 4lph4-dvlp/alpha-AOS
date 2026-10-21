import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { validateComputerAuthority, computerHash } from "../dist/src/core/computer-use-policy.js";
import { computerAuthorityGrantHash } from "../dist/src/core/computer-use-command.js";
import { CuaComputerTransport } from "../dist/src/adapters/computer-use-cua.js";
import { userStateRoot } from "../dist/src/core/paths.js";
import { loadTaskContract, readTaskApprovals, reservedRunIdForApproval } from "../dist/src/core/task-contract.js";
import { verifyComputerAudit } from "../dist/src/core/computer-use-audit.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const stamp = Date.now(); const scratch = join(root, ".gsd", `computer-use-live-${stamp}`);
const runtimeRoot = join(userStateRoot(), "computer-use/runtime"); const evidenceRoot = join(userStateRoot(), "computer-use/evidence");
const option = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const receipt = { schemaVersion: 1, at: new Date().toISOString(), platform: process.platform, arch: process.arch, backend: "Cua Driver 0.37.0", level: "unavailable", stage: "preflight", operations: [], actionsAttempted: 0, liveAction: false, reason: "" };
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let child; let client;
try {
  await mkdir(scratch, { recursive: true });
  if (!process.argv.includes("--controlled-local") || !option("--contract-template")) throw new Error("Requires --controlled-local and --contract-template approved-development-contract.json");
  if (process.platform !== "win32") throw new Error("Controlled WinForms lane requires a Windows desktop");
  const runtimePath = option("--runtime") ?? join(runtimeRoot, "runtime-approval.json");
  const approval = await json(runtimePath); const pin = await json(join(root, "catalog/computer-use-runtime.json"));
  receipt.stage = "owned-fixture";
  const pwsh = execFileSync("where.exe", ["pwsh.exe"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
  child = spawn(pwsh, ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-File", join(root, "test/fixtures/computer-use-app.ps1"), "-FixtureRoot", scratch], { windowsHide: true, stdio: "ignore" });
  const deadline = Date.now() + 15000; let target;
  while (Date.now() < deadline && !target) { target = await json(join(scratch, "fixture-state.json")).catch(() => null); if (!target) await new Promise((r) => setTimeout(r, 100)); }
  if (!target || target.pid !== child.pid || target.text || target.leftClicks || target.rightClicks || target.drags) throw new Error("Clean owned fixture identity unavailable");
  const executable = await realpath(target.executable);
  const a = { version: 1, runId: `discovery-${stamp}`, contractDigest: "a".repeat(64), expiresAt: Date.now() + 300000, idleMs: 60000,
    target: { executable, executableHash: sha(await readFile(executable)), pid: target.pid, processGeneration: sha(Buffer.from(`${target.executable}\n${target.processGeneration}`)), windowId: target.windowId, windowGeneration: "discover" },
    runtime: { executableHash: approval.executableHash, schemaHash: approval.schemaHash }, region: { x: 0, y: 0, width: target.bounds.width, height: target.bounds.height },
    permissions: { actions: [], capture: true, publicData: true, foreground: true }, budget: { actions: 8, captures: 24, bytes: 67108864, durationMs: 300000, gestureMs: 20000 } };
  receipt.stage = "read-only-target-discovery";
  const discovery = await CuaComputerTransport.connect(validateComputerAuthority(a), approval, pin, runtimeRoot);
  try {
    const observed = await discovery.discoverWindow(AbortSignal.timeout(20000)); a.target = observed.target;
    a.region.width = observed.width; a.region.height = observed.height;
    for (const point of Object.values(target.targets)) { point.x += target.bounds.x - observed.windowBounds.x; point.y += target.bounds.y - observed.windowBounds.y; }
  } finally { await discovery.close(); }
  a.permissions.actions = ["click", "right_click", "drag", "type_text", "press_key"];
  const contractPath = join(scratch, "contract.json"); const authorityPath = join(scratch, "authority.json");
  const contract = await json(option("--contract-template")); contract.id = `controlled-gui-${stamp}`; contract.revision = 1;
  contract.goal = "Verify only the owned public-data WinForms fixture through production CLI/MCP; no unrelated apps or credentials";
  contract.computerUse = { authorityHash: computerAuthorityGrantHash(validateComputerAuthority(a)), deterministic: true, reversible: true }; await save(contractPath, contract);
  const cli = join(root, "dist/src/cli.js");
  await writeFile(join(scratch, "preview.json"), execFileSync(process.execPath, [cli, "task", "preview", contractPath, "--json"], { encoding: "utf8" }));
  const loaded = await loadTaskContract(contractPath);
  await writeFile(join(scratch, "approval.json"), execFileSync(process.execPath, [cli, "task", "approve", contractPath, "--contract-digest", loaded.digest, "--apply", "--json"], { encoding: "utf8" }));
  const approvals = await readTaskApprovals({ stateRoot: userStateRoot(), contractId: contract.id });
  a.contractDigest = loaded.digest; a.runId = reservedRunIdForApproval(approvals.find((v) => v.contractDigest === loaded.digest)); await save(authorityPath, a);
  receipt.runId = a.runId; receipt.contractDigest = loaded.digest; receipt.stage = "production-cli-mcp";
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "computer-use", "mcp", "--authority", authorityPath, "--contract", contractPath, "--runtime", runtimePath, "--mode", "autopilot", "--apply"], cwd: root, stderr: "pipe" });
  let diagnostic = ""; transport.stderr?.on("data", (data) => { diagnostic = (diagnostic + data.toString()).slice(-1500); });
  client = new Client({ name: "alpha-aos-controlled-verification", version: "0.4.0" });
  try { await client.connect(transport, { timeout: 30000 }); } catch (error) { await writeFile(join(scratch, "connection-error.log"), diagnostic); throw error; }
  if ((await client.listTools()).tools.length !== 3) throw new Error("Public tool allowlist drift");
  const call = async (name, args) => { const v = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 }); if (v.isError) throw new Error(`Broker ${name} refused`); return v; };
  const observe = async () => { const v = await call("computer_observe", {}); return JSON.parse(v.content.find((c) => c.type === "text").text).untrustedState; };
  let state = await observe();
  const steps = [
    { action: { kind: "click", ...target.targets.left }, expect: (v) => v.leftClicks === 1 },
    { action: { kind: "right_click", ...target.targets.right }, expect: (v) => v.rightClicks === 1 },
    { action: { kind: "click", ...target.targets.text }, focusOnly: true },
    { action: { kind: "type_text", text: "PUBLIC TEST", classification: "public" }, expect: (v) => v.text === "PUBLIC TEST" },
    { action: { kind: "press_key", key: "Backspace" }, expect: (v) => v.text === "PUBLIC TES" },
    { action: { kind: "drag", x: target.targets.drag.x - 100, y: target.targets.drag.y, toX: target.targets.drag.x + 100, toY: target.targets.drag.y }, expect: (v) => v.drags === 1 },
  ];
  for (const step of steps) {
    receipt.actionsAttempted++;
    const v = await call("computer_action", { action: step.action, postcondition: step.focusOnly ? { stateHash: computerHash(state) } : { changed: true } });
    const r = JSON.parse(v.content.find((c) => c.type === "text").text); const independent = await json(join(scratch, "fixture-state.json"));
    const independentlyObserved = step.expect ? step.expect(independent) : null;
    receipt.operations.push({ action: step.action.kind, outcome: r.outcome, independentlyObserved, durations: r.durations, intent: r.intent });
    receipt.level = "partial-live"; receipt.liveAction = true;
    if (step.expect && (!independentlyObserved || r.outcome !== "verified")) throw new Error(`Independent fixture postcondition failed: ${step.action.kind}`);
    state = await observe();
  }
  await client.close(); client = undefined;
  let anchor; for (let i = 0; i < 100 && !anchor; i++) { anchor = await json(join(evidenceRoot, `${a.runId}.anchor.json`)).catch(() => null); if (!anchor) await new Promise((r) => setTimeout(r, 100)); }
  if (!anchor) throw new Error("Final anchor absent");
  const replay = await verifyComputerAudit(evidenceRoot, a.runId, anchor); if (replay.pending.length) throw new Error("Unsettled GUI intent");
  receipt.anchor = anchor; receipt.evidenceRoot = evidenceRoot; receipt.eventCount = replay.events.length;
  receipt.level = "live"; receipt.liveAction = true; receipt.reason = "Production CLI/MCP actions, independent app counters/text and screenshot replay verified";
} catch (error) { receipt.reason = error.message; process.exitCode = 2; }
finally {
  if (client) await client.close().catch(() => {});
  if (child) await writeFile(join(scratch, "STOP"), "stop\n");
  await mkdir(join(root, "docs/research/computer-use"), { recursive: true });
  await save(join(root, "docs/research/computer-use/windows-host-smoke.json"), receipt); await save(join(scratch, "result.json"), receipt);
  process.stdout.write(JSON.stringify(receipt) + "\n");
}
