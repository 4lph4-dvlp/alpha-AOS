import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("inventory seeds every managed tool even when candidates are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-observer-"));
  try {
    const output = execFileSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver", "--json"], {
      env: { ...process.env, HOME: root, USERPROFILE: root, ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "" }, encoding: "utf8",
    });
    const result = JSON.parse(output) as { observations: Array<{ toolId: string }> };
    assert.deepEqual(result.observations.map((item) => item.toolId), ["cua-driver", "gsd", "ecc", "mcp:context7", "mcp:exa", "mcp:firecrawl", "bridge:pi"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
