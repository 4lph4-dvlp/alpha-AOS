import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { officialCuaPaths, installCua, planCuaInstall, verifyOfficialCua } from "../src/core/computer-use-install.js";
import { packageRoot } from "../src/core/paths.js";

test("official installer plan declares pinned version, standard locations and bounded environment", async () => {
  const plan = await planCuaInstall();
  assert.equal(plan.spec.environment?.literal?.CUA_DRIVER_RS_VERSION, "0.38.0");
  assert.equal(plan.spec.environment?.literal?.CUA_DRIVER_RS_KEEP_VERSIONS, "0");
  assert.equal(plan.spec.environment?.literal?.CUA_DRIVER_RS_TELEMETRY_ENABLED, "false");
  assert.equal(plan.spec.environment?.source, undefined);
  assert.equal(plan.spec.environment?.optional?.includes("GITHUB_TOKEN"), false);
  assert.equal(plan.spec.environment?.optional?.includes("CUA_DRIVER_RS_HOME"), false);
  assert.equal(plan.executable.includes(".alpha-aos"), false);
  if (process.platform === "win32") assert.ok(plan.spec.args.includes("-NoAutoStart"));
  assert.equal(officialCuaPaths("darwin").executable, "/Applications/CuaDriver.app/Contents/MacOS/cua-driver");
  assert.ok(officialCuaPaths("linux").executable.endsWith("cua-driver"));
  await assert.rejects(installCua({ ...plan, pinHash: "changed" }), /plan changed/);
});

test("changed installer bytes fail before any native installer can run", async () => {
  const root = await mkdtemp(join(tmpdir(), "cua-installer-pin-"));
  try {
    await mkdir(join(root, "catalog"));
    const pin = JSON.parse(await readFile(join(packageRoot(), "catalog/computer-use-runtime.json"), "utf8"));
    pin.installer.directory = "scripts";
    await mkdir(join(root, "scripts"));
    for (const name of Object.keys(pin.installer.files)) await writeFile(join(root, "scripts", name), "modified installer");
    await writeFile(join(root, "catalog/computer-use-runtime.json"), JSON.stringify(pin));
    await assert.rejects(planCuaInstall(undefined, root), /installer bytes drifted/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("official layout validation detects missing or drifted installed companion files", async () => {
  const root = await mkdtemp(join(tmpdir(), "cua-official-files-"));
  try {
    await mkdir(join(root, "catalog"));
    const digest = createHash("sha256").update("reviewed").digest("hex");
    const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
    await writeFile(join(root, "catalog/computer-use-runtime.json"), JSON.stringify({ version: "0.38.0", assets: [{ os, arch: process.arch, entrypoint: "driver", files: {}, installedFiles: { driver: digest, companion: digest } }] }));
    const executable = join(root, "driver");
    await writeFile(executable, "reviewed");
    await assert.rejects(verifyOfficialCua(executable, root));
    await writeFile(join(root, "companion"), "reviewed");
    assert.equal((await verifyOfficialCua(executable, root)).version, "0.38.0");
    await writeFile(join(root, "companion"), "changed");
    await assert.rejects(verifyOfficialCua(executable, root), /bytes differ/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
