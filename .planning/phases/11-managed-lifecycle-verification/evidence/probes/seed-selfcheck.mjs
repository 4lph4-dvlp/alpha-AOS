// Five-harness prerequisite seeding self-check.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/seed-selfcheck.mjs [--out <scratch>] [--keep]`
//
// Proves that seedHarnessPrerequisites (test/helpers/packed-sandbox.ts) writes
// what a managed install expects for claude, codex, antigravity, pi and hermes,
// and records which harnesses reach an all-`current` dry-run preview from
// seeding alone. Plans 11-03..11-05 read this transcript before planning their
// per-harness probes.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import {
  evidencePath,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  runCli,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

const HARNESSES = ["claude", "codex", "antigravity", "pi", "hermes"];
const ECC_SKILLS = ["unified-memory", "documentation-lookup", "deep-research"];

async function text(path) {
  return existsSync(path) ? (await readFile(path, "utf8")).trim() : null;
}

function firstLine(value) {
  return String(value).split(/\r?\n/u).find((line) => line.trim().length > 0)?.trim() ?? "";
}

await runProbe("seed-selfcheck", evidencePath("seed-selfcheck.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const sandbox = await newSandbox("seed");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  const lock = release.installedLock;
  t.note(`packed release installed into <sandbox>/prefix; installed lock channel: ${String(lock.channel)}`);
  t.note("seeding order: claude, codex, antigravity, pi, hermes, all in one sandbox; codex and pi share <sandbox>/home/.agents/skills as their ECC skill root");

  for (const harness of HARNESSES) {
    let paths = null;
    let seedError = null;
    try {
      paths = await seedHarnessPrerequisites(sandbox, release, harness);
    } catch (error) {
      seedError = error instanceof Error ? error.message : String(error);
      t.note(`seedHarnessPrerequisites(${harness}) threw: ${firstLine(seedError)}`);
    }

    if (harness === "hermes") {
      t.check("seed.hermes.gsd", "OBSERVED", "no GSD for hermes: the stable lock installs GSD for claude, codex, antigravity and pi only");
    } else if (paths === null) {
      t.check(`seed.${harness}.gsd`, "VIOLATED", `seeding failed before GSD files could be checked: ${firstLine(seedError)}`);
    } else {
      const version = await text(join(paths.gsdRoot, "gsd-core", "VERSION"));
      const runtime = await text(join(paths.gsdRoot, "gsd-core", ".gsd-runtime"));
      const profile = await text(join(paths.gsdRoot, ".gsd-profile"));
      const ok = version === lock.components.gsd.version && runtime === harness && profile === lock.components.gsd.profile;
      t.check(`seed.${harness}.gsd`, ok ? "HOLDS" : "VIOLATED", `VERSION=${version ?? "missing"}, .gsd-runtime=${runtime ?? "missing"}, .gsd-profile=${profile ?? "missing"} (locked ${lock.components.gsd.version}/${harness}/${lock.components.gsd.profile})`);
    }

    if (paths === null) {
      t.check(`seed.${harness}.ecc`, "VIOLATED", `seeding failed: ${firstLine(seedError)}`);
      t.check(`seed.${harness}.mcp`, "VIOLATED", `seeding failed: ${firstLine(seedError)}`);
      continue;
    }

    const eccResults = [];
    for (const skill of ECC_SKILLS) {
      const path = join(paths.eccSkillRoot, skill, "SKILL.md");
      const bytes = existsSync(path) ? await readFile(path) : null;
      const actual = bytes ? createHash("sha256").update(bytes).digest("hex") : null;
      eccResults.push({ skill, match: actual !== null && actual === lock.components.ecc.targetSha256[skill][harness] });
    }
    const eccOk = eccResults.every((entry) => entry.match);
    t.check(`seed.${harness}.ecc`, eccOk ? "HOLDS" : "VIOLATED", eccResults.map((entry) => `${entry.skill}=${entry.match ? "lock-target-hash" : "mismatch"}`).join(", "));

    let mcpDetail;
    let mcpOk = false;
    const raw = existsSync(paths.mcpConfigPath) ? await readFile(paths.mcpConfigPath, "utf8") : null;
    if (raw === null) {
      mcpDetail = "config file missing";
    } else {
      try {
        const format = harness === "codex" ? "toml" : harness === "hermes" ? "yaml" : "json";
        const parsed = format === "toml" ? parseToml(raw) : format === "yaml" ? parseYaml(raw) : JSON.parse(raw);
        mcpOk = parsed !== null && typeof parsed === "object";
        mcpDetail = `${format} config exists and parses`;
      } catch (error) {
        mcpDetail = `config exists but does not parse: ${firstLine(error instanceof Error ? error.message : String(error))}`;
      }
    }
    t.check(`seed.${harness}.mcp`, mcpOk ? "HOLDS" : "VIOLATED", mcpDetail);

    if (harness === "pi") {
      const manifestText = paths.piBridgeManifest && existsSync(paths.piBridgeManifest) ? await readFile(paths.piBridgeManifest, "utf8") : null;
      const manifest = manifestText ? JSON.parse(manifestText) : null;
      const bridge = lock.components.mcpBridges.pi;
      const ok = manifest !== null && manifest.version === bridge.version && manifest.name === bridge.package;
      t.check("seed.pi.bridge", ok ? "HOLDS" : "VIOLATED", `manifest ${manifest ? `${manifest.name}@${manifest.version}` : "missing"} (locked ${bridge.package}@${bridge.version})`);
    }
  }

  for (const harness of HARNESSES) {
    const result = runCli(t, sandbox, ["install", "--target", harness, "--json"], { label: `dry-run install --target ${harness} --json` });
    let detail;
    try {
      if (result.status !== 0) throw new Error("non-zero exit");
      const plan = JSON.parse(result.stdout);
      const steps = plan.steps.map((step) => `${step.id}=${step.action}`);
      const allCurrent = plan.steps.length > 0 && plan.steps.every((step) => step.action === "current");
      detail = `exit=0; all-current=${allCurrent ? "yes" : "no"}; ${steps.join(", ")}`;
    } catch {
      detail = `exit=${result.status}; no plan JSON; stderr: ${firstLine(result.stderr) || "empty"}`;
    }
    t.check(`seed.${harness}.preview`, "OBSERVED", detail);
  }
});
