import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";
import { getHarnessPreloadExclusion } from "../src/adapters/isolation.js";
import {
  findUpstreamBinary,
  generateShimScripts,
  linkAuthWithoutCopying,
  prepareIsolatedTreeRoot,
  SHIMMED_COMMANDS,
  verifyShimsPrecedence,
} from "../src/adapters/shims.js";
import { resolveEffectivePolicy } from "../src/core/tree-policy.js";
import type { TreeRegistryEntry } from "../src/types.js";

test("generateShimScripts creates POSIX, CMD, and PS1 shims for all shimmed commands", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-shims-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const res = await generateShimScripts(root);
  assert.equal(res.commands, SHIMMED_COMMANDS);

  for (const cmd of SHIMMED_COMMANDS) {
    // POSIX shell script
    const posixPath = join(root, cmd);
    const posixContent = await readFile(posixPath, "utf8");
    assert.ok(posixContent.startsWith("#!/bin/sh"));
    assert.ok(posixContent.includes(`"${cmd}" "$@"`));

    // Windows CMD wrapper
    const cmdPath = join(root, `${cmd}.cmd`);
    const cmdContent = await readFile(cmdPath, "utf8");
    assert.ok(cmdContent.includes("@echo off"));
    assert.ok(cmdContent.includes(`${cmd} %*`));

    // Windows PS1 script
    const ps1Path = join(root, `${cmd}.ps1`);
    const ps1Content = await readFile(ps1Path, "utf8");
    assert.ok(ps1Content.includes(`"${cmd}" @args`));
  }
});

test("findUpstreamBinary finds mock binary in system directory while ignoring shimsDir", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-shims-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const shimsDir = join(root, "shims");
  const upstreamDir = join(root, "upstream");
  await mkdir(shimsDir, { recursive: true });
  await mkdir(upstreamDir, { recursive: true });

  const ext = process.platform === "win32" ? ".cmd" : "";
  // Create mock binary in both shims and upstream
  await writeFile(join(shimsDir, `codex${ext}`), "echo shim\n", "utf8");
  await writeFile(join(upstreamDir, `codex${ext}`), "echo upstream\n", "utf8");

  // PATH has shimsDir first, then upstreamDir
  const mockPath = `${shimsDir}${delimiter}${upstreamDir}`;
  const found = findUpstreamBinary("codex", { pathEnv: mockPath, shimsDir });

  assert.ok(found !== null);
  // Must resolve to upstreamDir, NOT shimsDir (recursion protection)
  assert.equal(resolve(found.executable), resolve(join(upstreamDir, `codex${ext}`)));
});

test("linkAuthWithoutCopying links credentials without reading or copying bytes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-shims-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const sourceAuth = join(root, "source-auth.json");
  const targetAuth = join(root, "isolated", "codex", "auth.json");
  await writeFile(sourceAuth, JSON.stringify({ token: "secret-token-12345" }), "utf8");

  const res = await linkAuthWithoutCopying(sourceAuth, targetAuth);
  assert.ok(res.linked);
  assert.ok(res.method === "hardlink" || res.method === "symlink");

  // Read target to verify link resolves
  const targetContent = JSON.parse(await readFile(targetAuth, "utf8"));
  assert.equal(targetContent.token, "secret-token-12345");

  // Verify missing source auth returns linked: false
  const missingRes = await linkAuthWithoutCopying(join(root, "non-existent.json"), join(root, "target2.json"));
  assert.equal(missingRes.linked, false);
  assert.equal(missingRes.method, "none");
});

test("getHarnessPreloadExclusion returns correct flags and detects unprovable surfaces", () => {
  const isolatedRoot = "C:\\alpha-aos\\isolated\\trees\\abc123";

  // Codex
  const codex = getHarnessPreloadExclusion("codex", isolatedRoot);
  assert.equal(codex.provable, true);
  assert.deepEqual(codex.args, ["--strict-config", "--ignore-user-config", "--ignore-rules"]);
  assert.ok(codex.env.CODEX_HOME?.includes("codex"));

  // Pi
  const pi = getHarnessPreloadExclusion("pi", isolatedRoot);
  assert.equal(pi.provable, true);
  assert.deepEqual(pi.args, ["--no-skills", "--no-extensions", "--no-prompt-templates", "--no-themes"]);
  assert.ok(pi.env.PI_CODING_AGENT_DIR?.includes("pi"));

  // Hermes
  const hermes = getHarnessPreloadExclusion("hermes", isolatedRoot);
  assert.equal(hermes.provable, true);
  assert.deepEqual(hermes.args, ["chat", "--ignore-user-config", "--ignore-rules"]);
  assert.ok(hermes.env.HERMES_HOME?.includes("hermes"));

  // Antigravity CLI (agy)
  const agy = getHarnessPreloadExclusion("antigravity", isolatedRoot, { surface: "cli" });
  assert.equal(agy.provable, true);

  // Antigravity GUI (desktop launch -> unprovable, fail-closed)
  const gui = getHarnessPreloadExclusion("antigravity", isolatedRoot, { surface: "gui" });
  assert.equal(gui.provable, false);
  assert.ok(gui.unsupportedReason?.includes("Antigravity IDE/GUI desktop launches do not support"));
});

test("shim dispatch performance: resolveEffectivePolicy benchmark executes under 1ms", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-shims-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const testDir = join(root, "projects", "my-app", "src", "components");
  await mkdir(testDir, { recursive: true });

  const mockRegistry: TreeRegistryEntry[] = [
    {
      id: "0123456789abcdef",
      path: join(root, "projects", "my-app"),
      mode: "off",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "abcdef0123456789",
      path: join(root, "projects", "other-app"),
      mode: "managed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Warmup
  await resolveEffectivePolicy(testDir, mockRegistry);

  const start = performance.now();
  const iterations = 50;
  for (let i = 0; i < iterations; i++) {
    const policy = await resolveEffectivePolicy(testDir, mockRegistry);
    assert.equal(policy.effectiveMode, "off");
  }
  const avgMs = (performance.now() - start) / iterations;

  // Assert lookup average is less than 1.0ms (typically <0.1ms)
  assert.ok(avgMs < 1.0, `Expected avg lookup under 1.0ms, got ${avgMs.toFixed(3)}ms`);
});

test("verifyShimsPrecedence identifies when shims are first on PATH or preceded", () => {
  const shimsDir = "C:\\alpha-aos\\shims";
  const otherDir1 = "C:\\bin";
  const otherDir2 = "C:\\Windows\\system32";

  // Case 1: First on PATH
  const path1 = `${shimsDir}${delimiter}${otherDir1}${delimiter}${otherDir2}`;
  const res1 = verifyShimsPrecedence(shimsDir, path1);
  assert.equal(res1.isFirstOnPath, true);
  assert.equal(res1.position, 0);
  assert.equal(res1.issues.length, 0);

  // Case 2: Preceded on PATH
  const path2 = `${otherDir1}${delimiter}${shimsDir}${delimiter}${otherDir2}`;
  const res2 = verifyShimsPrecedence(shimsDir, path2);
  assert.equal(res2.isFirstOnPath, false);
  assert.equal(res2.position, 1);
  assert.ok(res2.issues[0]?.includes("preceded on PATH by 1 other directory"));

  // Case 3: Missing from PATH
  const path3 = `${otherDir1}${delimiter}${otherDir2}`;
  const res3 = verifyShimsPrecedence(shimsDir, path3);
  assert.equal(res3.isFirstOnPath, false);
  assert.equal(res3.position, -1);
  assert.ok(res3.issues[0]?.includes("not present on PATH"));
});
