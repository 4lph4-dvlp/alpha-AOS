import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("tool inventory observes installed Cua separately from selected pin", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-inventory-"));
  try {
    const home = join(root, "home");
    const local = join(root, "local");
    const executable = process.platform === "win32" ? join(local, "Programs", "Cua", "cua-driver", "bin", "cua-driver.exe") : join(home, ".local", "bin", "cua-driver");
    await mkdir(resolve(executable, ".."), { recursive: true });
    await writeFile(executable, "fixture executable");
    const output = execFileSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver", "--json"], {
      env: { ...process.env, HOME: home, USERPROFILE: home, LOCALAPPDATA: local, ALPHA_AOS_STATE_DIR: join(root, "state") }, encoding: "utf8",
    });
    const result = JSON.parse(output) as { observations?: Array<{ installation?: string; selected?: { version?: string } }> };
    assert.equal(result.observations?.[0]?.installation, "installed");
    assert.ok(result.observations?.[0]?.selected?.version);
  } finally { await rm(root, { recursive: true, force: true }); }
});
