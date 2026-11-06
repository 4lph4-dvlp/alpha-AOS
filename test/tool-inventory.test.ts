import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { collectToolInventory, orderToolObservations, reconcileToolState, type ToolObservation } from "../src/core/tool-inventory.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { officialCuaPaths } from "../src/core/computer-use-install.js";
import { appendToolResult, beginToolOperation, finishToolOperation, planToolRecordOperation, withToolRecordSession } from "../src/core/tool-record-store.js";
import type { ToolRecordEvent, ToolRecordStore, ToolResult } from "../src/core/tool-records.js";

test("inventory formatter shows category summaries", async () => {
  const { formatToolInventory } = await import("../src/format.js");
  const inventory = { observations: [], records: { status: "absent" as const, events: [], accepted: null, diagnostics: [], incomplete: false, operations: [] }, categorySummaries: [{ category: "bundled-library" as const, count: 2, statuses: { installed: 1, absent: 0, unknown: 1 } }] };
  assert.match(formatToolInventory(inventory), /bundled-library.*2/);
});

test("collector reconciles scoped file proofs for native directories and Cua after a later failed operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-current-proof-"));
  try {
    const home = join(root, "home"), stateRoot = join(root, "state"), checkout = resolve("."), local = join(root, "local");
    const platform = process.platform === "darwin" ? "linux" : process.platform;
    const releasePlatform = platform === "win32" ? "windows" : "linux", architecture = process.arch === "arm64" ? "arm64" : "x64";
    const gsd = join(home, ".codex", "gsd-core"), pkg = join(root, "exa-package");
    const driver = officialCuaPaths(platform, home, local).executable;
    for (const dir of [gsd, pkg, dirname(driver)]) await mkdir(dir, { recursive: true });
    const manifest = JSON.stringify({ name: "exa-mcp-server", version: "1.2.3", bin: "cli.js" });
    await writeFile(join(gsd, "VERSION"), "1.2.3\n"); await writeFile(join(gsd, ".gsd-runtime"), "codex\n");
    await writeFile(join(home, ".codex", ".gsd-profile"), "full\n");
    await writeFile(join(pkg, "package.json"), manifest); await writeFile(join(pkg, "cli.js"), "cli"); await writeFile(driver, "driver-bytes");
    await writeFile(join(home, ".codex", "config.toml"), `[mcp_servers.exa]\ncommand = ${JSON.stringify(join(pkg, "cli.js"))}\n[mcp_servers.cua]\ncommand = ${JSON.stringify(driver)}\n`);
    const definitions = [
      { id: "gsd", path: await realpath(gsd), bytes: "1.2.3\n", sourceId: "npm-registry", url: "https://registry.npmjs.org/%40opengsd%2Fgsd-core" },
      { id: "mcp:exa", path: await realpath(pkg), bytes: manifest, sourceId: "npm-registry", url: "https://registry.npmjs.org/exa-mcp-server" },
      { id: "cua-driver", path: await realpath(driver), bytes: "driver-bytes", sourceId: "driver-release", url: "https://github.com/trycua/cua/releases/download/v1/driver.zip" },
    ];
    const requests = definitions.map(({ id }) => ({ toolId: id, selector: "1.2.3", exact: true }));
    const results: ToolResult[] = definitions.map((definition, index) => {
      const fingerprint = createHash("sha256").update(definition.bytes).digest("hex"), subject = `install-${index}`;
      return { toolId: definition.id, requested: requests[index]!, resolved: { release: "1.2.3", artifact: "fixture", architecture, digest: "a".repeat(64), sourceId: definition.sourceId, sourceUrl: definition.url, platform: releasePlatform }, installed: { installationId: subject, version: "1.2.3", pathAlias: `path-${createHash("sha256").update(definition.path).digest("hex")}` }, verified: "invoke", evidence: [{ proofId: "hash", subject, target: "integrity", method: "sha256", result: "pass", platform: releasePlatform, architecture, harness: null, fingerprint }, { proofId: "invoke", subject, target: "integration", method: "invocation", result: "pass", platform: releasePlatform, architecture, harness: "codex", fingerprint }], outcome: "succeeded" };
    });
    const plan = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "accepted", occurredAt: "2026-01-01T00:00:00Z", requests });
    await withToolRecordSession(plan, async (session) => { await beginToolOperation(plan, session); for (const result of results) await appendToolResult(plan, session, result); await finishToolOperation(plan, session, results.map((result) => ({ toolId: result.toolId, installationId: result.installed!.installationId, proofId: "invoke", priorDigest: null }))); });
    const failed = await planToolRecordOperation({ stateRoot, packageRoot: checkout, operationId: "later", occurredAt: "2026-01-02T00:00:00Z", requests: [requests[0]!] });
    await withToolRecordSession(failed, async (session) => { await beginToolOperation(failed, session); await appendToolResult(failed, session, { ...results[0]!, installed: { ...results[0]!.installed!, pathAlias: `path-${"b".repeat(64)}` }, outcome: "failed" }); await finishToolOperation(failed, session); });
    const inventory = await collectToolInventory({ catalog: await loadCatalog(checkout), lock: await loadLock(checkout), packageRoot: checkout, stateRoot, home, platform, architecture, env: { LOCALAPPDATA: local, npm_config_prefix: join(root, "none"), PATH: "" } });
    for (const definition of definitions) {
      const item = inventory.observations.find((entry) => entry.toolId === definition.id)!;
      assert.equal(item.integrity, "verified", definition.id); assert.equal(item.integration, "verified", definition.id);
      assert.equal(item.candidates?.[0]?.installationOwner, "alpha-aos", definition.id);
      assert.ok(item.proofScopes?.fingerprintScope);
    }
    const cua = inventory.observations.find((entry) => entry.toolId === "cua-driver")!;
    assert.equal(cua.installed?.version, null);
    assert.equal(inventory.observations.find((entry) => entry.toolId === "gsd")?.latestOperation?.status, "failed");
    await writeFile(join(gsd, "VERSION"), "1.2.4\n");
    const changed = await collectToolInventory({ catalog: await loadCatalog(checkout), lock: await loadLock(checkout), packageRoot: checkout, stateRoot, home, platform, architecture, env: { LOCALAPPDATA: local, npm_config_prefix: join(root, "none"), PATH: "" } });
    assert.equal(changed.observations.find((entry) => entry.toolId === "gsd")?.integrity, "unverified");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("problem observations sort first and ties use tool identity", () => {
  const base: ToolObservation = { toolId: "", installation: "absent", installed: null, selected: null, integrity: "unverified", integration: "unverified", reason: "", nextAction: "" };
  const ordered = orderToolObservations([{ ...base, toolId: "z" }, { ...base, toolId: "b", installation: "unknown" }, { ...base, toolId: "a", integrity: "failed" }]);
  assert.deepEqual(ordered.map((item) => item.toolId), ["a", "b", "z"]);
});

test("prior acceptance and a later failure do not promote the observed installation", () => {
  const result: ToolResult = { toolId: "cua-driver", requested: { toolId: "cua-driver", selector: "1.0.0", exact: true }, resolved: { release: "1.0.0", artifact: "cua.zip", architecture: "x64", digest: "a".repeat(64), sourceId: "driver-release", sourceUrl: "https://github.com/trycua/cua/releases/download/v1/cua.zip", platform: "windows" }, installed: { installationId: "old", version: "1.0.0", pathAlias: "cua" }, verified: null, evidence: [], outcome: "succeeded" };
  const accepted: ToolRecordEvent = { schemaVersion: 1, eventId: "old-finish", operationId: "old", sequence: 2, occurredAt: "2026-01-01T00:00:00Z", kind: "finished", results: [result], outcome: "succeeded", acceptedTransitions: [] };
  const failed: ToolRecordEvent = { ...accepted, eventId: "new-finish", operationId: "new", occurredAt: "2026-01-02T00:00:00Z", results: [{ ...result, resolved: { ...result.resolved!, release: "2.0.0" }, outcome: "failed" }], outcome: "failed" };
  const digest = createHash("sha256").update(`${JSON.stringify(accepted)}\n`).digest("hex");
  const records: ToolRecordStore = { status: "current", diagnostics: [], incomplete: false, events: [failed, accepted], operations: [{ operationId: "new", status: "failed" }], accepted: { "cua-driver/old": digest }, verifiedEventDigests: { "old:2:old-finish": digest } };
  const observation: ToolObservation = { toolId: "cua-driver", installation: "installed", installed: { version: "2.0.0", source: "observed-file" }, selected: null, integrity: "unverified", integration: "unverified", reason: "not checked", nextAction: "inspect" };
  reconcileToolState(observation, records);
  assert.equal(observation.currentObservation?.version, "2.0.0");
  assert.equal(observation.currentObservation?.integrity, "unverified");
  assert.equal(observation.acceptedIdentity?.version, "1.0.0");
  assert.equal(observation.latestOperation?.status, "failed");
  assert.equal(observation.latestOperation?.version, "2.0.0");
});

test("current proof is reused only for the exact fingerprint, identity and harness", () => {
  const fingerprint = "a".repeat(64), path = "/fixture/driver";
  const result: ToolResult = { toolId: "cua-driver", requested: { toolId: "cua-driver", selector: "1.0.0", exact: true }, resolved: { release: "1.0.0", artifact: "cua.zip", architecture: "x64", digest: "b".repeat(64), sourceId: "driver-release", sourceUrl: "https://github.com/trycua/cua/releases/download/v1/cua.zip", platform: "linux" }, installed: { installationId: "old", version: "1.0.0", pathAlias: path }, verified: "invoke", evidence: ["protocol", "invocation"].map((method) => ({ proofId: method, subject: "old", target: "integration", method, result: "pass", platform: "linux", architecture: "x64", harness: "codex", fingerprint })), outcome: "succeeded" };
  const event: ToolRecordEvent = { schemaVersion: 1, eventId: "finish", operationId: "old", sequence: 2, occurredAt: "2026-01-01T00:00:00Z", kind: "finished", results: [result], outcome: "succeeded", acceptedTransitions: [] };
  const digest = createHash("sha256").update(`${JSON.stringify(event)}\n`).digest("hex");
  const records: ToolRecordStore = { status: "current", diagnostics: [], incomplete: false, events: [event], operations: [], accepted: { "cua-driver/old": digest }, verifiedEventDigests: { "old:2:finish": digest } };
  const observation: ToolObservation = { toolId: "cua-driver", installation: "installed", installed: { version: "1.0.0", source: "observed-file" }, selected: null, integrity: "unverified", integration: "unverified", reason: "not checked", nextAction: "inspect", bindings: [{ harness: "codex", status: "active", candidatePath: path, connectionOwner: "unknown", reason: "fixture", nextAction: "inspect" }] };
  reconcileToolState(observation, records, { path, fingerprint, platform: "linux", architecture: "x64" });
  assert.equal(observation.proofScopes?.protocol, "verified");
  assert.equal(observation.proofScopes?.invocation, "verified");
  reconcileToolState(observation, records, { path, fingerprint: "c".repeat(64), platform: "linux", architecture: "x64" });
  assert.equal(observation.proofScopes?.invocation, "unverified");
});
