import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { renderOwnedSkill } from "../src/core/owned-skills.js";
import { packageRoot } from "../src/core/paths.js";
import { createInstallPlan } from "../src/core/plan.js";

test("stable catalog loads exact locked components", async () => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);
  assert.equal(catalog.components.gsd.profile, "standard");
  assert.equal(catalog.components.ecc.profileInstallAllowed, false);
  assert.equal(lock.components.gsd?.version, "1.12.0");
  assert.equal(lock.components.ecc?.version, "2.2.0");
  assert.equal(lock.components.ecc?.sourceSha256["unified-memory"], "a6eb9a96b92dfd4a700bceff15195ca1fd4b7fad2944bb014c08812d1a0dc8b0");
  assert.equal(lock.components.ecc?.targetSha256["deep-research"]?.codex, "620ca763cb5a4f157ad34be4edb25ce86454570c4eecb377c96fcf5f2c1adb74");
  assert.deepEqual(Object.keys(lock.components.mcp ?? {}), ["context7", "exa", "firecrawl"]);
  assert.equal(lock.components.mcpBridges?.pi?.version, "2.31.0");
  assert.deepEqual(catalog.components.ownedSkills.map((skill) => skill.id), ["alpha-aos-ship"]);
  const shipSource = await readFile(join(root, "skills", "alpha-aos-ship", "SKILL.md"));
  const shipHash = createHash("sha256").update(shipSource).digest("hex");
  const lockedShip = lock.components.ownedSkills?.["alpha-aos-ship"];
  assert.equal(lockedShip?.sourceSha256, shipHash);
  const rendered = renderOwnedSkill(shipSource.toString("utf8"), "claude", "explicit", "<phase-number> [--draft] [--text] [--ws <name>]");
  assert.match(rendered, /disable-model-invocation: true/u);
  assert.equal(lockedShip?.targetSha256.claude, createHash("sha256").update(rendered).digest("hex"));
});

test("install plan is ordered and never installs GSD on Hermes", async () => {
  const root = packageRoot();
  const plan = createInstallPlan(await loadCatalog(root), await loadLock(root));
  assert.ok(plan.length > 20);
  assert.equal(plan.some((action) => action.id === "gsd:hermes"), false);
  assert.equal(plan.find((action) => action.id === "gsd:claude")?.note, "canary first");
  assert.ok(plan.filter((action) => action.component === "gsd" && action.operation === "install")
    .every((action) => action.command?.includes("--no-legacy-cleanup")));
  assert.match(plan.find((action) => action.id === "gsd:shared-root-audit")?.note ?? "", /never in parallel/u);
  assert.equal(plan.find((action) => action.id === "ecc:pi")?.operation, "install");
  assert.equal(plan.find((action) => action.id === "ecc:claude")?.operation, "install");
  assert.match(plan.find((action) => action.id === "ecc:claude")?.note ?? "", /upstream --skills is blocked/u);
  assert.match(plan.find((action) => action.id === "ecc:runtime")?.command ?? "", /ecc-universal@2\.2\.0/u);
  assert.match(plan.find((action) => action.id === "mcp:context7:claude")?.command ?? "", /mcp sync --target claude --server context7 --apply/u);
  assert.match(plan.find((action) => action.id === "mcp:firecrawl:hermes")?.note ?? "", /four extraction\/crawl tools/u);
  assert.equal(plan.find((action) => action.id === "mcp-bridge:pi")?.command, "pi install npm:pi-mcp-adapter@2.31.0");
  const ship = plan.find((action) => action.id === "owned-skill:alpha-aos-ship:claude");
  assert.equal(ship?.phase, 3);
  assert.equal(ship?.approval, true);
  assert.match(ship?.command ?? "", /owned-skills sync alpha-aos-ship --target claude --apply/u);
  assert.ok(plan.every((action, index) => index === 0 || action.phase >= (plan[index - 1]?.phase ?? -1)));
});
