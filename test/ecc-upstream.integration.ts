import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadLock } from "../src/core/catalog.js";
import { runEccFixture } from "../src/core/ecc-fixture.js";
import { packageRoot } from "../src/core/paths.js";

// Explicitly invoked by CI after the regular suite. A registry outage is a failure.
test("locked upstream ECC archive installs and renders the reviewed global skills", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-ecc-upstream-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  await mkdir(home);
  const config = join(root, "empty.npmrc");
  await writeFile(config, "");
  const overrides: Record<string, string> = {
    HOME: home, USERPROFILE: home,
    npm_config_cache: join(root, "cache"), npm_config_userconfig: config,
    npm_config_prefix: join(root, "prefix"), npm_config_registry: "https://registry.npmjs.org/",
  };
  const saved = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  context.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, overrides);
  const lock = await loadLock(packageRoot());
  const ecc = lock.components.ecc;
  assert.ok(ecc);
  const result = await runEccFixture({ harness: "codex", ecc });
  assert.equal(result.integrity, ecc.integrity);
  assert.equal(result.operationCount, 3);
  for (const skill of ["unified-memory", "documentation-lookup", "deep-research"]) {
    assert.equal(result.sourceHashes[skill], ecc.sourceSha256[skill], `${skill} upstream bytes`);
    assert.equal(result.targetHashes[skill], ecc.targetSha256[skill]?.codex, `${skill} rendered bytes`);
  }
});
