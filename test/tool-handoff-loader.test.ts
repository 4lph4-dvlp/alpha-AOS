import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { collectToolInventory } from "../src/core/tool-inventory.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";

function tar(name: string, data: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(name); header.write("0000644\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116);
  header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124); header.write("00000000000\0", 136); header.fill(32, 148, 156); header[156] = 48; header.write("ustar\0", 257);
  header.write(`${[...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
  return gzipSync(Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512), Buffer.alloc(1024)]));
}

test("collector authenticates a retained npm registry signature against reviewed policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-handoff-loader-"));
  try {
    const packageRoot = join(root, "app"), stateRoot = join(root, "state"), roots = join(root, "modules"), target = join(roots, "exa-mcp-server");
    const dir = join(stateRoot, "tool-handoff", "mcp-exa");
    await Promise.all([mkdir(join(packageRoot, "catalog"), { recursive: true }), mkdir(dir, { recursive: true }), mkdir(target, { recursive: true })]);
    const manifest = Buffer.from(JSON.stringify({ name: "exa-mcp-server", version: "1.2.3" }));
    const archive = tar("package/package.json", manifest), integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), publicKey = keys.publicKey.export({ type: "spki", format: "der" });
    const keyid = `SHA256:${createHash("sha256").update(publicKey).digest("base64")}`;
    const signature = sign("sha256", Buffer.from(`exa-mcp-server@1.2.3:${integrity}`), keys.privateKey).toString("base64");
    const policy = { schemaVersion: 1, registry: "https://registry.npmjs.org", packages: { "mcp:exa": "exa-mcp-server" }, keys: [{ keyid, key: publicKey.toString("base64"), expires: null }], revokedKeyIds: [] as string[] };
    const retained = { schemaVersion: 1, toolId: "mcp:exa", package: "exa-mcp-server", version: "1.2.3", integrity, keyid, signature, previousIdentity: "legacy-exa", priorInstallationOwner: "external", priorConnectionOwner: "unknown", userModificationEvidence: "unmodified" };
    await writeFile(join(packageRoot, "catalog", "tool-handoff-policy.json"), JSON.stringify(policy));
    await writeFile(join(dir, "evidence.json"), JSON.stringify(retained));
    await writeFile(join(dir, "artifact.tgz"), archive); await writeFile(join(target, "package.json"), manifest);
    const options = { catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot, stateRoot, home: join(root, "home"), candidateRoots: [roots], env: { PATH: "", npm_config_prefix: join(root, "empty") } };
    const result = await collectToolInventory(options);
    assert.equal(result.observations.find((item) => item.toolId === "mcp:exa")?.handoff?.status, "ready");
    assert.equal(result.observations.find((item) => item.toolId === "mcp:exa")?.handoff?.scope, "package.json");
    await writeFile(join(target, "other.js"), "modified installation bytes");
    const scoped = (await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")!;
    assert.equal(scoped.handoff?.status, "ready");
    assert.equal(scoped.handoff?.scope, "package.json");
    assert.match(scoped.handoff!.nextAction, /remaining installation files and ownership/);
    assert.deepEqual(Object.keys(scoped.handoff!).sort(), ["nextAction", "reason", "scope", "status"]);
    assert.equal(scoped.integrity, "unverified");
    assert.equal(scoped.integration, "unverified");
    assert.equal(scoped.candidates?.[0]?.installationOwner, "external");
    assert.equal(await readFile(join(dir, "evidence.json"), "utf8"), JSON.stringify(retained));
    assert.equal(await readFile(join(packageRoot, "catalog", "tool-handoff-policy.json"), "utf8"), JSON.stringify(policy));
    assert.deepEqual(await readFile(join(target, "package.json")), manifest);
    await writeFile(join(dir, "evidence.json"), JSON.stringify({ ...retained, signature: Buffer.alloc(64).toString("base64") }));
    assert.equal((await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")?.handoff?.reason, "registry-signature-invalid");
    await writeFile(join(dir, "evidence.json"), JSON.stringify({ ...retained, key: publicKey.toString("base64") }));
    assert.equal((await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")?.handoff?.reason, "retained-record-invalid");
    await writeFile(join(dir, "evidence.json"), JSON.stringify({ ...retained, priorInstallationOwner: "alpha-aos" }));
    const forgedOwner = (await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")!;
    assert.equal(forgedOwner.handoff?.status, "needs-evidence");
    assert.equal(forgedOwner.candidates?.[0]?.installationOwner, "external");
    await writeFile(join(dir, "evidence.json"), JSON.stringify({ ...retained, priorConnectionOwner: "alpha-aos" }));
    const forgedConnection = (await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")!;
    assert.equal(forgedConnection.handoff?.scope, "package.json");
    assert.ok(forgedConnection.bindings?.every((binding) => binding.connectionOwner !== "alpha-aos"));
    assert.equal(forgedConnection.integration, "unverified");
    await writeFile(join(dir, "evidence.json"), JSON.stringify({ ...retained, userModificationEvidence: "modified" }));
    assert.equal((await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")?.handoff?.status, "needs-evidence");
    await writeFile(join(dir, "evidence.json"), JSON.stringify(retained));
    await writeFile(join(packageRoot, "catalog", "tool-handoff-policy.json"), JSON.stringify({ ...policy, revokedKeyIds: [keyid] }));
    assert.equal((await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")?.handoff?.reason, "registry-key-revoked");
    await writeFile(join(packageRoot, "catalog", "tool-handoff-policy.json"), JSON.stringify(policy));
    await writeFile(join(target, "package.json"), JSON.stringify({ name: "exa-mcp-server", version: "1.2.3", changed: true }));
    assert.equal((await collectToolInventory(options)).observations.find((item) => item.toolId === "mcp:exa")?.handoff?.status, "modified");
    assert.deepEqual(await readFile(join(dir, "artifact.tgz")), archive);
  } finally { await rm(root, { recursive: true, force: true }); }
});
