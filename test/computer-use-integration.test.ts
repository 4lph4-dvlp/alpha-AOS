import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ComputerSession } from "../src/core/computer-use.js";
import { createComputerMcpServer } from "../src/core/computer-use-mcp.js";
import { validateComputerAuthority } from "../src/core/computer-use-policy.js";
import { authorityFixture, pngFixture } from "./fixtures/computer-use.js";
import { packageRoot } from "../src/core/paths.js";
import { taskComputerUseRoute } from "../src/adapters/task-agent-launch.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { planOwnedSkillSync } from "../src/core/owned-skills.js";
import { loadPackCatalogStrict } from "../src/core/pack-catalog.js";
import { buildTaskCapabilityInventory } from "../src/core/task-capability-inventory.js";
import { evaluateRiskObligations } from "../src/core/gate.js";
import type { HarnessId } from "../src/types.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";
import { taskContractDigest, digestableTaskContract, changedContractFields, loadTaskContract } from "../src/core/task-contract.js";
import { planProjectCapabilities } from "../src/core/project-plan.js";
import { pathToFileURL } from "node:url";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { runTaskComputerVerification } from "../src/core/computer-use-task.js";
import { computerHash } from "../src/core/computer-use-policy.js";
import { approveTaskContract, reservedRunIdForApproval } from "../src/core/task-contract.js";
import { computerAuthorityGrantHash, runComputerCommand } from "../src/core/computer-use-command.js";

test("live doctor without apply previews without creating runtime or evidence state", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-doctor-plan-"));
  try {
    const stateRoot = join(root, "state"); const a = validateComputerAuthority(authorityFixture());
    const contract = inventorySummaryContract(root); contract.computerUse = { authorityHash: computerAuthorityGrantHash(a), deterministic: true, reversible: true };
    const path = join(root, "contract.json"); await writeFile(path, JSON.stringify(contract));
    const loaded = await loadTaskContract(path); await approveTaskContract({ contractPath: path, expectedDigest: loaded.digest, stateRoot });
    a.contractDigest = loaded.digest; a.runId = reservedRunIdForApproval({ contractDigest: loaded.digest });
    const authorityPath = join(root, "authority.json"); await writeFile(authorityPath, JSON.stringify(a));
    const result = await runComputerCommand(["doctor", "--authority", authorityPath, "--contract", path, "--runtime", join(root, "missing-receipt.json")], { stateRoot }) as { dryRun: boolean };
    assert.equal(result.dryRun, true); await assert.rejects(readFile(join(stateRoot, "computer-use/runtime")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stdio EOF drains the broker and releases the evidence lease before process exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-eof-"));
  const module = (name: string) => JSON.stringify(pathToFileURL(join(packageRoot(), "dist/src/core", `${name}.js`)).href);
  const a = validateComputerAuthority(authorityFixture());
  const source = `import {ComputerSession} from ${module("computer-use")}; import {serveComputerMcp} from ${module("computer-use-mcp")}; import {writeFile} from 'node:fs/promises'; const a=${JSON.stringify(a)}; const s=await ComputerSession.open(a,{identity:a.runtime,observe:async()=>{throw Error('unused')},dispatch:async()=>{},close:async()=>{}},${JSON.stringify(root)}); try{await serveComputerMcp(s)}finally{await s.close();await writeFile(${JSON.stringify(join(root, "closed"))},'closed')}`;
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--input-type=module", "-e", source], stderr: "pipe" });
  const client = new Client({ name: "eof-test", version: "1" });
  try {
    await client.connect(transport); assert.equal((await client.listTools()).tools.length, 3); await client.close();
    assert.equal(await readFile(join(root, "closed"), "utf8"), "closed");
    await assert.rejects(readFile(join(root, "desktop.lock")));
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test("autopilot executes the hash-bound deterministic GUI request without a user prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-task-route-"));
  try {
    const a = validateComputerAuthority(authorityFixture()); const request = { action: { kind: "click", x: 0, y: 0 }, postcondition: { changed: true } }; const runtime = { trustedReceipt: true };
    for (const [name, value] of Object.entries({ "authority.json": a, "request.json": request, "runtime.json": runtime })) await writeFile(join(root, name), JSON.stringify(value));
    const contract = inventorySummaryContract(root); contract.computerUse = { authorityHash: "a".repeat(64), deterministic: true, reversible: true, verification: { authorityFile: "authority.json", runtimeFile: "runtime.json", requestFile: "request.json", requestHash: computerHash(request), runtimeReceiptHash: computerHash(runtime) } };
    let dispatched = 0;
    const execute = async (args: string[]) => { assert.ok(args.includes("autopilot")); assert.ok(args.includes("--apply")); dispatched++; return { outcome: "verified" }; };
    const options = { contract, contractPath: join(root, "contract.json"), runId: a.runId, digest: a.contractDigest, stateRoot: root, execute };
    assert.equal((await runTaskComputerVerification(options)).status, "verified"); assert.equal(dispatched, 1);
    await writeFile(join(root, "request.json"), JSON.stringify({ ...request, injected: true }));
    assert.equal((await runTaskComputerVerification(options)).status, "unavailable"); assert.equal(dispatched, 1);
    contract.computerUse.deterministic = false;
    assert.equal((await runTaskComputerVerification(options)).status, "manual"); assert.equal(dispatched, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("actual CLI reports unavailable native runtime without claiming installed proof", () => {
  const result = JSON.parse(execFileSync(process.execPath, [join(packageRoot(), "dist/src/cli.js"), "computer-use", "doctor", "--json"], { encoding: "utf8" }));
  assert.equal(result.nativeUse, "unverified"); assert.equal(result.enabled, false);
  assert.throws(() => execFileSync(process.execPath, [join(packageRoot(), "dist/src/cli.js"), "computer-use", "action", "--apply"], { stdio: "pipe" }));
});

test("real MCP server reaches shared broker and rejects raw native tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-mcp-")); const a = validateComputerAuthority(authorityFixture()); let observed = 0; let value = "before"; let effects = 0;
  const session = await ComputerSession.open(a, { identity: a.runtime, observe: async () => ({ target: a.target, captureId: String(++observed), png: pngFixture, width: 1, height: 1, state: value, safe: true, foreground: false }), dispatch: async () => { effects++; value = "after"; }, close: async () => {} }, root);
  const server = createComputerMcpServer(session); const client = new Client({ name: "test", version: "1" }); const [downstream, upstream] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(upstream), client.connect(downstream)]);
    assert.deepEqual((await client.listTools()).tools.map((v) => v.name), ["computer_action", "computer_stop", "computer_observe"]);
    const perception = await client.callTool({ name: "computer_observe", arguments: {} }); assert.match(JSON.stringify(perception), /image\/png/); assert.equal(effects, 0);
    await assert.rejects(client.callTool({ name: "shell_execute", arguments: {} })); assert.equal(effects, 0);
    const result = await client.callTool({ name: "computer_action", arguments: { action: { kind: "click", x: 0, y: 0 }, postcondition: { equals: "after" } } });
    assert.match(JSON.stringify(result), /verified/); assert.equal(effects, 1);
    await client.callTool({ name: "computer_stop", arguments: {} });
    await assert.rejects(client.callTool({ name: "computer_action", arguments: { action: { kind: "click", x: 0, y: 0 }, postcondition: { equals: "after" } } })); assert.equal(effects, 1);
  } finally { await client.close(); await server.close(); await session.close(); await rm(root, { recursive: true, force: true }); }
});

test("all five harnesses preview hash-pinned owned guide without GUI authority", async () => {
  const root = packageRoot(); const catalog = await loadCatalog(root); const lock = await loadLock(root); const scratch = await mkdtemp(join(tmpdir(), "computer-guide-"));
  try {
    for (const harness of ["claude", "codex", "antigravity", "pi", "hermes"] as HarnessId[]) {
      assert.equal(taskComputerUseRoute(harness, {}).granted, false);
      assert.equal(taskComputerUseRoute(harness, { computerUse: { authorityHash: "a".repeat(64), deterministic: true, reversible: true } }).granted, true);
      const plan = await planOwnedSkillSync(root, catalog, lock, "computer-use", harness, { targetHome: join(scratch, harness) });
      assert.equal(plan.action, "create"); assert.ok(plan.destination.startsWith(scratch));
    }
    const packs = await loadPackCatalogStrict(root); assert.ok(packs.value.packs.some((p) => p.id === "COMPUTER_USE"));
    const inventory = await buildTaskCapabilityInventory({ packageRoot: root, projectRoot: scratch, catalog, lock });
    const item = inventory.items.find((v) => v.id === "control:computer-use"); assert.equal(item?.nativeUse, "unverified"); assert.equal(item?.selected, false);
    assert.equal(JSON.parse(await readFile(join(root, "catalog/computer-use-runtime.json"), "utf8")).stableLockPromotion, false);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test("GUI policy and runtime changes deterministically require security review", () => {
  const result = evaluateRiskObligations({ baseCommit: "base", headCommit: "head", modifiedFiles: ["src/core/computer-use-policy.ts", "src/adapters/computer-use-cua.ts"], untrackedFiles: [], isWorkingTreeDirty: true });
  assert.ok(result.obligations.includes("security-review"));
});

test("new GUI authority is digest-bound and old contracts grant no implicit access", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-contract-"));
  try {
    const legacy = inventorySummaryContract(root); const grant = { authorityHash: "a".repeat(64), deterministic: true, reversible: true };
    const next = { ...legacy, computerUse: grant }; assert.notEqual(taskContractDigest(legacy), taskContractDigest(next));
    assert.deepEqual(changedContractFields(digestableTaskContract(legacy), digestableTaskContract(next)), ["computerUse"]);
    assert.equal(taskContractDigest(next), taskContractDigest({ ...legacy, computerUse: { reversible: true, deterministic: true, authorityHash: grant.authorityHash } }));
    const path = join(root, "contract.json"); await writeFile(path, JSON.stringify(next));
    assert.equal((await loadTaskContract(path, { source: {} })).contract.computerUse?.authorityHash, grant.authorityHash);
    await mkdir(join(root, ".alpha-aos")); await writeFile(join(root, ".alpha-aos/stack.yaml"), "schemaVersion: 1\ncomputerUse: true\n");
    const selected = await planProjectCapabilities({ path: root, explicitRoot: root, packageRoot: packageRoot() }); assert.ok(selected.selected.includes("COMPUTER_USE"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
