import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { resolveWindowsCommand } from "../src/core/windows-command.js";
import { ProcessPolicyError, resolveCommand, runProcess } from "../src/core/process.js";

async function fixture(context: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-command-search-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "cwd");
  const first = join(root, "first bin");
  const second = join(root, "second");
  await Promise.all([cwd, first, second].map((path) => mkdir(path)));
  return { cwd, first, second, search: { cwd, path: `"${first}";${second}`, pathExt: ".cmd;.exe;.ps1" } };
}

test("Windows discovery prefers a native executable across PATH before a batch shim", async (context) => {
  const { first, second, search } = await fixture(context);
  await writeFile(join(first, "tool.cmd"), "shim");
  await writeFile(join(second, "tool.exe"), "native");
  assert.equal(resolveWindowsCommand("tool", search), join(second, "tool.exe"));
});

test("Windows discovery preserves current-directory precedence and quoted PATH entries", async (context) => {
  const { cwd, first, search } = await fixture(context);
  await writeFile(join(first, "tool.exe"), "first");
  assert.equal(resolveWindowsCommand("tool", search), join(first, "tool.exe"));
  await writeFile(join(cwd, "tool.exe"), "current");
  assert.equal(resolveWindowsCommand("tool", search), join(cwd, "tool.exe"));
});

test("Windows discovery rejects missing commands and directories and follows the declared PATHEXT", async (context) => {
  const { first, search } = await fixture(context);
  await mkdir(join(first, "tool.exe"));
  await writeFile(join(first, "tool.ps1"), "script");
  assert.equal(resolveWindowsCommand("absent", search), null);
  assert.equal(resolveWindowsCommand("tool", { ...search, pathExt: ".exe;.cmd" }), null);
  assert.equal(resolveWindowsCommand("tool", search), join(first, "tool.ps1"));
});

test("Windows discovery respects qualified paths, explicit extensions and extensionless files", async (context) => {
  const { cwd, second, search } = await fixture(context);
  await writeFile(join(second, "tool.cmd"), "shim");
  await writeFile(join(second, "tool.exe"), "native");
  await writeFile(join(cwd, "bare"), "no extension");
  assert.equal(resolveWindowsCommand(join(second, "tool.cmd"), search), join(second, "tool.cmd"));
  assert.equal(resolveWindowsCommand("bare", search), join(cwd, "bare"));
});

test("native Windows discovery works without where.exe and invokes the discovered executable", { skip: process.platform !== "win32" }, async (context) => {
  const { first, search } = await fixture(context);
  const executable = join(first, "aos-native.exe");
  await copyFile(process.execPath, executable);
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = first;
    assert.equal(resolveCommand("where.exe"), null);
    const discovered = resolveCommand("aos-native");
    assert.ok(discovered);
    assert.equal(await realpath(discovered), await realpath(executable));
    const result = await runProcess({ executable: discovered, args: ["--version"], cwd: search.cwd });
    assert.equal(result.code, "ok");
    assert.equal(result.stdout.excerpt.trim(), process.version);
  } finally {
    if (savedPath === undefined) delete process.env.PATH;
    else process.env.PATH = savedPath;
  }
});

test("POSIX locator failure is distinct from a genuinely missing command", { skip: process.platform === "win32" }, (context) => {
  assert.equal(resolveCommand("alpha-aos-nonexistent-command-260927"), null);
  const failure = Object.assign(new Error("probe deadline"), { code: "ETIMEDOUT" });
  context.mock.method(childProcess, "spawnSync", () => ({ error: failure, status: null }));
  syncBuiltinESMExports();
  try {
    assert.throws(() => resolveCommand("git"), (error: unknown) => error instanceof ProcessPolicyError && error.code === "timeout");
    context.mock.restoreAll();
    context.mock.method(childProcess, "spawnSync", () => ({ status: 2 }));
    syncBuiltinESMExports();
    assert.throws(() => resolveCommand("git"), (error: unknown) => error instanceof ProcessPolicyError && error.code === "non-zero-exit");
    context.mock.restoreAll();
    context.mock.method(childProcess, "spawnSync", () => ({ status: null, signal: "SIGTERM" }));
    syncBuiltinESMExports();
    assert.throws(() => resolveCommand("git"), (error: unknown) => error instanceof ProcessPolicyError && error.code === "non-zero-exit");
  } finally {
    context.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
