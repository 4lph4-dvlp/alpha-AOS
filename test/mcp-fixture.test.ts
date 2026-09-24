import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parsePackResult } from "../src/core/mcp-fixture.js";
import { resolveDirectLaunch } from "../src/adapters/capability-oracle.js";
import { resolveCommand } from "../src/core/process.js";

test("parsePackResult parses standard and large npm pack output without truncation", () => {
  const standardPack = JSON.stringify([
    {
      id: "test-pkg@1.0.0",
      name: "test-pkg",
      version: "1.0.0",
      filename: "test-pkg-1.0.0.tgz",
      integrity: "sha512-abcdef1234567890==",
      files: [{ path: "package.json", size: 120 }],
    },
  ]);
  const parsed = parsePackResult(standardPack);
  assert.equal(parsed.filename, "test-pkg-1.0.0.tgz");
  assert.equal(parsed.integrity, "sha512-abcdef1234567890==");

  // Large manifest simulation (>64 KB files list like pi-mcp-adapter)
  const largeFiles = Array.from({ length: 1500 }, (_, i) => ({
    path: `dist/chunks/module-long-name-${i}.js`,
    size: 2048,
    mode: 420,
  }));
  const largePack = JSON.stringify([
    {
      id: "pi-mcp-adapter@2.36.0",
      name: "pi-mcp-adapter",
      version: "2.36.0",
      filename: "pi-mcp-adapter-2.36.0.tgz",
      integrity: "sha512-aX7Hf1FMGoHFjjx2Y4t12Hkue83CiBQmZaeQQ0mg+2wxOzbIOYdWzEkh1bmKlLHKiH6zRWlxWitsr+RaiXvoRQ==",
      files: largeFiles,
    },
  ]);
  assert.ok(largePack.length > 65_536, "simulated pack output must exceed 64 KB");
  const parsedLarge = parsePackResult(largePack);
  assert.equal(parsedLarge.filename, "pi-mcp-adapter-2.36.0.tgz");
  assert.equal(parsedLarge.integrity, "sha512-aX7Hf1FMGoHFjjx2Y4t12Hkue83CiBQmZaeQQ0mg+2wxOzbIOYdWzEkh1bmKlLHKiH6zRWlxWitsr+RaiXvoRQ==");
});

test("parsePackResult fails when given truncated or malformed JSON", () => {
  const truncated = `[{"filename":"pi-mcp-adapter-2.36.0.tgz","integrity":"sha512-partial`;
  assert.throws(
    () => parsePackResult(truncated),
    /SyntaxError|Unexpected end of JSON input|Unterminated string/u,
  );

  const notArrayJson = `{"filename":"test.tgz"}`;
  assert.throws(
    () => parsePackResult(notArrayJson),
    /did not return JSON/u,
  );

  const missingFields = `[{"foo":"bar"}]`;
  assert.throws(
    () => parsePackResult(missingFields),
    /lacks filename or integrity/u,
  );
});

test("src/core/mcp-fixture.ts sets excerptBytes: 256 * 1024 in verifyPackage", async () => {
  const source = await readFile(join(process.cwd(), "src", "core", "mcp-fixture.ts"), "utf8");
  assert.match(
    source,
    /excerptBytes:\s*256\s*\*\s*1024/u,
    "verifyPackage must specify excerptBytes: 256 * 1024",
  );
  assert.match(
    source,
    /resolveDirectLaunch/u,
    "mcp-fixture must use resolveDirectLaunch for direct launcher resolution",
  );
});

test("resolveDirectLaunch handles batch scripts and direct executables", async () => {
  const tempDir = join(tmpdir(), `test-direct-launch-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  try {
    // 1. Non-cmd directly executable file (e.g. node.exe or unix binary)
    const directResult = resolveDirectLaunch(process.execPath);
    assert.ok(directResult, "direct executable must resolve");
    assert.equal(directResult?.executable, process.execPath);
    assert.deepEqual(directResult?.argsPrefix, []);

    // 2. Mock npm shim .cmd file
    const nodeModulesDir = join(tempDir, "node_modules", "mock-tool");
    await mkdir(nodeModulesDir, { recursive: true });
    const mockScript = join(nodeModulesDir, "cli.js");
    await writeFile(mockScript, "console.log('hello');\n", "utf8");

    const cmdContent = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
"%dp0%\\node.exe"  "%dp0%\\node_modules\\mock-tool\\cli.js" %*
`;
    const mockCmd = join(tempDir, "mock-tool.cmd");
    await writeFile(mockCmd, cmdContent, "utf8");

    const cmdResult = resolveDirectLaunch(mockCmd);
    assert.ok(cmdResult, ".cmd shim must resolve via direct launch");
    assert.equal(cmdResult?.executable, process.execPath);
    assert.deepEqual(cmdResult?.argsPrefix, [mockScript]);

    // 3. If live pi exists, verify live resolution works
    const livePi = resolveCommand("pi");
    if (livePi) {
      const liveResult = resolveDirectLaunch(livePi);
      assert.ok(liveResult, "live pi command must resolve via resolveDirectLaunch");
      assert.ok(existsSync(liveResult.executable));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
