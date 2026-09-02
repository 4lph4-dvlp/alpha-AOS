import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectGsdInstall, selectInstallTargets } from "../src/core/install.js";
import type { HarnessId, Inventory, StackLock } from "../src/types.js";

function inventory(detected: HarnessId[]): Inventory {
  const ids: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    platform: process.platform,
    architecture: process.arch,
    tools: {
      node: { version: "v24.0.0", command: process.execPath },
      npm: { version: "10.0.0", command: "npm" },
      git: { version: "2.0.0", command: "git" },
    },
    harnesses: ids.map((id) => ({ id, displayName: id, command: detected.includes(id) ? id : null, version: null, configRoots: [], detected: detected.includes(id), notes: [] })),
  };
}

const lock: StackLock = {
  schemaVersion: 1,
  channel: "stable",
  generatedAt: null,
  components: {
    gsd: { package: "@opengsd/gsd-core", version: "1.12.0", integrity: "sha512-test", profile: "standard" },
  },
};

test("managed install selects only detected harnesses unless targets are explicit", () => {
  const detected = inventory(["claude", "pi"]);
  assert.deepEqual(selectInstallTargets(detected), { targets: ["claude", "pi"], selection: "detected" });
  assert.deepEqual(selectInstallTargets(detected, ["pi"]), { targets: ["pi"], selection: "explicit" });
  assert.throws(() => selectInstallTargets(detected, ["hermes"]), /not installed or configured/u);
});

test("GSD current state requires exact version, profile, and runtime", async () => {
  const home = await mkdtemp(join(tmpdir(), "alpha-aos-install-test-"));
  const root = join(home, ".codex");
  await mkdir(join(root, "gsd-core"), { recursive: true });
  await writeFile(join(root, "gsd-core", "VERSION"), "1.12.0\n");
  await writeFile(join(root, "gsd-core", ".gsd-runtime"), "codex\n");
  await writeFile(join(root, ".gsd-profile"), "standard\n");

  const current = await inspectGsdInstall("codex", lock, { home, env: {} });
  assert.equal(current.current, true);

  await writeFile(join(root, ".gsd-profile"), "core\n");
  const drifted = await inspectGsdInstall("codex", lock, { home, env: {} });
  assert.equal(drifted.current, false);
  assert.equal(drifted.profile, "core");
});
