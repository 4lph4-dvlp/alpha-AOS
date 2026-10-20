import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const production = (name) => import(new URL(`../dist/src/${name}.js`, import.meta.url));
export function authorityInput() {
  return { version: 1, runId: "verification-run", contractDigest: "a".repeat(64), expiresAt: Date.now() + 60000, idleMs: 10000,
    target: { executable: process.execPath, executableHash: "b".repeat(64), pid: 42, processGeneration: "42", windowId: "42", windowGeneration: "1" },
    runtime: { executableHash: "c".repeat(64), schemaHash: "d".repeat(64) }, region: { x: 0, y: 0, width: 1, height: 1 },
    permissions: { actions: ["click"], capture: true, publicData: true, foreground: false }, budget: { actions: 3, captures: 8, bytes: 100000, durationMs: 30000, gestureMs: 1000 } };
}
export async function checkPolicy() {
  const p = await production("core/computer-use-policy");
  const a = p.validateComputerAuthority(authorityInput());
  const s = { runId: a.runId, contractDigest: a.contractDigest, target: a.target, runtime: a.runtime, now: Date.now(), startedAt: Date.now(), lastActivityAt: Date.now(), actions: 0, captures: 0, bytes: 0, stopped: false };
  assert.doesNotThrow(() => p.authorizeComputerAction(a, s, { kind: "click", x: 0, y: 0 }));
  for (const change of [{ stopped: true }, { runId: "foreign" }, { actions: 3 }, { now: a.expiresAt }, { target: { ...a.target, pid: 43 } }, { runtime: { ...a.runtime, schemaHash: "f".repeat(64) } }]) assert.throws(() => p.authorizeComputerAction(a, { ...s, ...change }, { kind: "click", x: 0, y: 0 }));
  assert.throws(() => p.authorizeComputerAction(a, s, { kind: "click", x: NaN, y: 0 }));
  assert.throws(() => p.validateComputerAuthority({ ...a, extra: true }));
  assert.equal(p.decideComputerVerification({ mode: "ordinary", deterministic: true, reversible: true, covered: true }).mode, "offer");
  assert.equal(p.decideComputerVerification({ mode: "autopilot", deterministic: false, reversible: true, covered: true }).mode, "manual");
}
export const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
export async function checkAudit() {
  const { ComputerAudit, verifyComputerAudit } = await production("core/computer-use-audit");
  const scratch = await mkdtemp(join(tmpdir(), "aos-cu-check-"));
  try {
    const audit = await ComputerAudit.open(scratch, "check"); const capture = await audit.capture(png, 1, 1);
    await audit.append("intent", { capture, actionDigest: "a".repeat(64) }); await audit.append("result", { intent: 1, capture, outcome: "verified" });
    const anchor = await audit.checkpoint(); await audit.close();
    assert.equal((await verifyComputerAudit(scratch, "check", anchor)).events.length, 2);
    await assert.rejects(verifyComputerAudit(scratch, "check", { ...anchor, count: 1 }));
    const journal = join(scratch, "check", "events.jsonl"); const original = await readFile(journal, "utf8");
    await writeFile(journal, original.split("\n").filter(Boolean).reverse().join("\n") + "\n"); await assert.rejects(verifyComputerAudit(scratch, "check", anchor));
    await writeFile(journal, original); await writeFile(join(scratch, "check", `${capture.hash}.png`), Buffer.from("corrupt")); await assert.rejects(verifyComputerAudit(scratch, "check", anchor));
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
export async function checkIntegration() {
  const { computerDoctor } = await production("core/computer-use-command");
  const doctor = await computerDoctor(root); assert.equal(doctor.nativeUse, "unverified"); assert.equal(doctor.enabled, false);
  const cli = JSON.parse(execFileSync(process.execPath, [join(root, "dist/src/cli.js"), "computer-use", "doctor", "--json"], { encoding: "utf8" })); assert.equal(cli.nativeUse, "unverified");
  const { loadCatalog, loadLock } = await production("core/catalog"); const catalog = await loadCatalog(root); const lock = await loadLock(root);
  const { loadPackCatalogStrict } = await production("core/pack-catalog"); assert.ok((await loadPackCatalogStrict(root)).value.packs.some((v) => v.id === "COMPUTER_USE"));
  const { evaluateRiskObligations } = await production("core/gate"); assert.ok(evaluateRiskObligations({ baseCommit: "base", headCommit: "head", isWorkingTreeDirty: true, modifiedFiles: ["src/core/computer-use-policy.ts"], untrackedFiles: [] }).obligations.includes("security-review"));
  const { taskComputerUseRoute } = await production("adapters/task-agent-launch"); const { planOwnedSkillSync } = await production("core/owned-skills");
  const scratch = await mkdtemp(join(tmpdir(), "aos-cu-integration-"));
  try {
    for (const harness of ["claude", "codex", "antigravity", "pi", "hermes"]) {
      assert.equal(taskComputerUseRoute(harness, {}).granted, false);
      assert.equal((await planOwnedSkillSync(root, catalog, lock, "computer-use", harness, { targetHome: join(scratch, harness) })).action, "create");
    }
    const { buildTaskCapabilityInventory } = await production("core/task-capability-inventory");
    const inventory = await buildTaskCapabilityInventory({ packageRoot: root, projectRoot: scratch, catalog, lock }); assert.equal(inventory.items.find((v) => v.id === "control:computer-use").nativeUse, "unverified");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js"); const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { ComputerSession } = await production("core/computer-use"); const { createComputerMcpServer } = await production("core/computer-use-mcp"); const { validateComputerAuthority } = await production("core/computer-use-policy");
    const a = validateComputerAuthority(authorityInput()); let reads = 0; let effects = 0;
    const session = await ComputerSession.open(a, { identity: a.runtime, observe: async () => ({ target: a.target, captureId: String(++reads), png, width: 1, height: 1, state: String(effects), safe: true, foreground: false }), dispatch: async () => { effects++; }, close: async () => {} }, scratch);
    const server = createComputerMcpServer(session); const client = new Client({ name: "verification", version: "1" }); const [left, right] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(right), client.connect(left)]); assert.equal((await client.listTools()).tools.length, 2);
      await assert.rejects(client.callTool({ name: "shell_execute", arguments: {} }));
      const result = await client.callTool({ name: "computer_action", arguments: { action: { kind: "click", x: 0, y: 0 }, postcondition: { equals: "1" } } });
      assert.match(JSON.stringify(result), /verified/); assert.equal(effects, 1);
    } finally { await client.close(); await server.close(); await session.close(); }
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
export async function checkResearch() {
  throw new Error("Research verification is incomplete");
}
if (process.argv[1] && resolveEntry(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(process.argv[2] ?? "null");
    assert.deepEqual(Object.keys(input ?? {}), ["check"]);
    const checks = { policy: checkPolicy, audit: checkAudit, integration: checkIntegration, research: checkResearch };
    assert.ok(Object.hasOwn(checks, input.check)); await checks[input.check]();
    process.stdout.write(JSON.stringify({ ok: true, check: input.check }) + "\n");
  } catch (error) { process.stderr.write(`computer-use verification failed: ${error.message}\n`); process.exitCode = 1; }
}
function resolveEntry(path) { return resolve(path); }
