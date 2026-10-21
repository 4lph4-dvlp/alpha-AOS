import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { Ajv } from "ajv";
import { cuaActionArguments, cuaCapabilityManifest, verifyCuaRuntime } from "../src/adapters/computer-use-cua.js";
import type { CuaRuntimeApproval } from "../src/adapters/computer-use-cua.js";
import { authorityFixture, pngFixture } from "./fixtures/computer-use.js";
import { validateComputerAuthority } from "../src/core/computer-use-policy.js";
import type { ComputerAction } from "../src/core/computer-use-policy.js";
import { packageRoot } from "../src/core/paths.js";
import { join } from "node:path";

test("an intact approved archive and companions cannot authorize a different entrypoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-entrypoint-"));
  try {
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const main = process.platform === "win32" ? "cua-driver.exe" : "cua-driver";
    const helper = "helper.exe";
    const extension = "wayland-helper/winrects@cua/extension.js";
    await mkdir(join(root, "wayland-helper", "winrects@cua"), { recursive: true });
    await writeFile(join(root, extension), "verified-extension");
    await writeFile(join(root, main), "verified-main"); await writeFile(join(root, helper), "verified-helper"); await writeFile(join(root, "archive"), "verified-archive");
    const publisherIdentity = "https://github.com/trycua/cua/.github/workflows/cd-rust-cua-driver.yml@refs/tags/cua-driver-rs-v0.37.0";
    const a: CuaRuntimeApproval = { version: "0.37.0", sourceCommit: "2d2f99228d4d2508dc6fcc84c176b296e146714a", platform: process.platform, arch: process.arch, executable: join(root, main), executableHash: hash("verified-main"), archive: join(root, "archive"), archiveHash: hash("verified-archive"), schemaHash: "a".repeat(64), publisherVerified: true, publisherIdentity };
    const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
    const pin = { publisherIdentity, assets: [{ os, arch: process.arch, sha256: a.archiveHash, entrypoint: main, files: { [main]: a.executableHash, [helper]: hash("verified-helper"), [extension]: hash("verified-extension") } }] };
    await assert.doesNotReject(verifyCuaRuntime(a, pin, root));
    await assert.rejects(verifyCuaRuntime({ ...a, executable: join(root, helper), executableHash: hash("verified-helper") }, pin, root), /entrypoint/);
    await writeFile(join(root, main), "verified-helper");
    await assert.rejects(verifyCuaRuntime({ ...a, executableHash: hash("verified-helper") }, pin, root), /entrypoint/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("native argument mappings satisfy the actual pinned Windows 0.37.0 closed schemas", async () => {
  const tools = JSON.parse((await readFile(join(packageRoot(), "test/fixtures/cua-0.37.0-windows-tools.json"), "utf8")).replace(/^\uFEFF/, "")) as Array<{ name: string; inputSchema: object }>;
  const a = validateComputerAuthority(authorityFixture());
  a.target.windowId = "42";
  const observation = { target: a.target, captureId: "capture-1", png: pngFixture, width: 1, height: 1, state: "test", safe: true, foreground: false };
  const actions: ComputerAction[] = [{ kind: "click", x: 0, y: 0 }, { kind: "right_click", x: 0, y: 0 }, { kind: "drag", x: 0, y: 0, toX: 0, toY: 0 }, { kind: "type_text", text: "PUBLIC", classification: "public" }, { kind: "press_key", key: "Tab" }, { kind: "launch_app" }];
  const ajv = new Ajv({ strict: false });
  for (const action of actions) {
    const schema = tools.find((v) => v.name === action.kind); assert.ok(schema);
    const validate = ajv.compile(schema.inputSchema); const args = cuaActionArguments(a, action, observation);
    assert.equal(validate(args), true, `${action.kind}: ${JSON.stringify(validate.errors)}`);
    if (action.kind !== "launch_app") assert.equal(args.delivery_mode, "background");
  }
  const manifest = JSON.stringify(cuaCapabilityManifest(a)); assert.ok(!manifest.includes("shell_execute"));
  assert.match(String(cuaCapabilityManifest(a).expires_after), /^\d+s$/);
  a.permissions.foreground = true;
  assert.equal(cuaActionArguments(a, actions[0]!, observation).delivery_mode, "background");
  assert.equal(cuaActionArguments(a, { ...actions[0]!, delivery: "foreground" }, observation).delivery_mode, "foreground");
});
