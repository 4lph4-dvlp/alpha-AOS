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
  // This criterion also runs in dependency-free immutable task snapshots.
  // Live SDK/CLI/harness integration is exercised by the compiled integration suite.
  const { computerDoctor } = await production("core/computer-use-command");
  assert.equal((await computerDoctor(root)).nativeUse, "unverified");
  const lock = JSON.parse(await readFile(join(root, "catalog/stack.lock.json"), "utf8"));
  const { createHash } = await import("node:crypto");
  const guide = await readFile(join(root, "skills/computer-use/SKILL.md"));
  assert.ok(JSON.stringify(lock).includes(createHash("sha256").update(guide).digest("hex")));
  const { ComputerSession } = await production("core/computer-use");
  const { validateComputerAuthority } = await production("core/computer-use-policy");
  const { verifyComputerAudit } = await production("core/computer-use-audit");
  const scratch = await mkdtemp(join(tmpdir(), "aos-cu-integration-"));
  const a = validateComputerAuthority(authorityInput()); let reads = 0; let effects = 0;
  const session = await ComputerSession.open(a, { identity: a.runtime,
    observe: async () => ({ target: a.target, captureId: String(++reads), png, width: 1, height: 1, state: String(effects), safe: true, foreground: false }),
    dispatch: async () => { effects++; }, close: async () => {} }, scratch);
  try {
    assert.equal((await session.action({ kind: "click", x: 0, y: 0 }, { equals: "1" })).outcome, "verified");
    assert.equal(effects, 1);
    const result = await verifyComputerAudit(scratch, a.runId, await session.audit.checkpoint());
    assert.deepEqual(result.events.map((v) => v.kind), ["intent", "result"]);
    assert.deepEqual(result.pending, []);
    await session.stop();
    await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { equals: "2" }));
    assert.equal(effects, 1);
  } finally { await session.close(); await rm(scratch, { recursive: true, force: true }); }
}
export async function checkResearch() {
  const evidenceRoot = join(root, "docs/research/computer-use"); const e = JSON.parse(await readFile(join(evidenceRoot, "evidence.json"), "utf8"));
  assert.deepEqual([...e.candidates.map((v) => v.id)].sort(), ["agent-s", "cua", "nut-js", "pyautogui", "screenpipe", "ui-tars"]);
  const sources = new Map(e.sources.map((v) => [v.id, v])); assert.equal(sources.size, e.sources.length);
  for (const source of e.sources) {
    assert.ok(source.url.startsWith("https://")); const [file, pointer] = source.receipt.split("#"); assert.match(file, /^receipts-[a-z0-9-]+\.json$/);
    let receipt = JSON.parse(await readFile(join(evidenceRoot, file), "utf8"));
    if (pointer) for (const key of pointer.slice(1).split("/")) { assert.ok(Object.hasOwn(receipt, key)); receipt = receipt[key]; }
    assert.ok(receipt && JSON.stringify(receipt).length > 10);
  }
  for (const candidate of e.candidates) { assert.ok(candidate.sources.length); for (const source of candidate.sources) assert.ok(sources.has(source)); assert.equal(candidate.liveProof, false); }
  for (const claim of e.claims) {
    for (const source of claim.sourceIds) assert.ok(sources.has(source)); assert.ok(e.evidenceLevels.includes(claim.level));
    if (!claim.sourceIds.length) { assert.equal(claim.scope, "discovery-only"); assert.equal(claim.receipt, "native-discovery.json"); assert.ok(JSON.parse(await readFile(join(evidenceRoot, claim.receipt), "utf8"))); }
  }
  assert.equal(e.candidates.find((v) => v.id === "cua").recommendation, "preferred-optional-actuator");
  assert.equal(e.providers.exa.outcome, "unavailable");
  const initial = await readFile(join(evidenceRoot, e.providers.exa.receipt.split("#")[0]), "utf8"); assert.match(initial, /401/);
  for (const provider of ["firecrawl", "context7"]) { const receipt = await readFile(join(evidenceRoot, e.providers[provider].receipt.split("#")[0]), "utf8"); assert.ok(receipt.length > 1000); }
  const pin = JSON.parse(await readFile(join(root, "catalog/computer-use-runtime.json"), "utf8"));
  assert.equal(pin.version, "0.37.0"); assert.equal(pin.sourceCommit, e.optionalRuntime.sourceCommit); assert.deepEqual(pin.assets, e.optionalRuntime.assets); assert.equal(pin.stableLockPromotion, false);
  for (const asset of pin.assets) { assert.match(asset.sha256, /^[a-f0-9]{64}$/); assert.ok(asset.url.startsWith(`https://github.com/trycua/cua/releases/download/${pin.tag}/`)); assert.equal(asset.liveVerified, false); }
  const report = await readFile(join(root, "docs/research/computer-use.md"), "utf8"); assert.match(report, /No apples-to-apples/); assert.match(report, /interest proxy/);
}
if (process.argv[1] && resolveEntry(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argument = process.argv[2] ?? "null";
    const input = JSON.parse(argument.trimStart().startsWith("{") ? argument : await readFile(argument, "utf8"));
    assert.deepEqual(Object.keys(input ?? {}), ["check"]);
    const checks = { policy: checkPolicy, audit: checkAudit, integration: checkIntegration, research: checkResearch };
    assert.ok(Object.hasOwn(checks, input.check)); await checks[input.check]();
    process.stdout.write(JSON.stringify({ ok: true, check: input.check }) + "\n");
  } catch (error) { process.stderr.write(`computer-use verification failed: ${error.message}\n`); process.exitCode = 1; }
}
function resolveEntry(path) { return resolve(path); }
