import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { installCua, planCuaInstall } from "../src/core/computer-use-install.js";

test("Cua acquisition rejects a modified archive before recording runtime files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "cua-download-test-"));
  context.mock.method(globalThis, "fetch", async () => new Response("modified archive"));
  try {
    await assert.rejects(installCua(root), /checksum mismatch/);
    const plan = await planCuaInstall(root);
    await assert.rejects(readFile(plan.executable), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Cua planning is read-only and detects missing or drifted companion bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cua-install-test-"));
  try {
    await mkdir(join(root, "catalog"));
    const digest = createHash("sha256").update("reviewed").digest("hex");
    const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
    await writeFile(join(root, "catalog/computer-use-runtime.json"), JSON.stringify({ version: "test", signatureVerified: true, assets: [{ os, arch: process.arch, name: "release", url: "https://github.com/trycua/cua/releases/download/test/release", sha256: digest, entrypoint: "driver", files: { driver: digest, companion: digest } }] }));
    const plan = await planCuaInstall(root, root);
    assert.equal(plan.current, false);
    await assert.rejects(readFile(plan.executable), { code: "ENOENT" });
    await mkdir(plan.targetRoot, { recursive: true });
    await writeFile(plan.executable, "reviewed");
    await writeFile(join(plan.targetRoot, "companion"), "reviewed");
    assert.equal((await planCuaInstall(root, root)).current, true);
    await writeFile(join(plan.targetRoot, "companion"), "changed");
    assert.equal((await planCuaInstall(root, root)).current, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
