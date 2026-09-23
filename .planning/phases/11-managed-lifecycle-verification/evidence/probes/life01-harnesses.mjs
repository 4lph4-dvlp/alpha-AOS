// LIFE-01 across the remaining harnesses: idempotent stable-lock reconcile for
// claude, antigravity, pi and hermes (one fresh sandbox each), then all five
// harnesses together in one sandbox, through the packed CLI.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-harnesses.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// The sequence per group is the plan 11-01 Codex tracer (life01-reconcile.mjs):
// initial `install --apply --json`, fingerprint, human dry-run (every step line
// CURRENT), fingerprint, JSON dry-run (every step current), second apply (empty
// applied/operationIds, journal names unchanged), fingerprint compared with the
// post-initial fingerprint.
//
// Precondition (research Pitfall 5): the GSD version files, the ECC skills, the
// MCP configs and the Pi bridge manifest are seeded at the locked values by
// seedHarnessPrerequisites, exactly as the CI packed lifecycle test does; for
// claude the GSD ship workflow is copied from the locked GSD package as well. The
// probe therefore proves the reconcile, not a cold network install.

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertSandboxEnv,
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  harnessPaths,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  npmInvocation,
  packOnce,
  runCli,
  runCommand,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

const ALL = ["claude", "codex", "antigravity", "pi", "hermes"];
const SINGLE = ["claude", "antigravity", "pi", "hermes"];
const LATER_CHECKS = ["preview-current", "preview-no-mutation", "preview-json-current", "second-apply-noop", "second-apply-byte-identical"];
const STEP_LINE = /^([A-Z]+)\s+(\S+) - /u;
const ENVIRONMENTAL = /network|registry|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|not installed or configured|not detected|No supported harness|was not found|not found|ENOENT|is required/iu;

function stepLines(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((line) => STEP_LINE.exec(line))
    .filter((match) => match !== null && match[1] !== "WARNING")
    .map((match) => ({ action: match[1], id: match[2] }));
}

function parseJson(result) {
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

async function journalNames(sandbox) {
  const dir = join(sandbox.state, "journal");
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
}

function environmentalLine(stderr) {
  return String(stderr).split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0 && ENVIRONMENTAL.test(line)) ?? null;
}

function firstLine(value) {
  return String(value).split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

// Plan digests embed per-run temp paths, so a quoted stderr line keeps its
// words and replaces digest prefixes with a stable token.
function stableQuote(value) {
  return firstLine(value).replace(/\b[0-9a-f]{12,64}\b/gu, "<digest>");
}

async function reconcile(t, sandbox, group, targetList) {
  const prefix = `life01.${group}`;
  const targetArgs = ["--target", targetList];

  // (a) initial apply
  const initialResult = runCli(t, sandbox, ["install", ...targetArgs, "--apply", "--json"], { label: `${group}: initial install --target ${targetList} --apply` });
  const initial = parseJson(initialResult);
  const journalsAfterInitial = await journalNames(sandbox);
  if (!initial) {
    const cause = environmentalLine(initialResult.stderr);
    if (cause !== null) {
      t.check(`${prefix}.initial-apply`, "NOT-OBSERVED", `exit=${initialResult.status}; environmental cause in stderr: "${cause}"`);
      for (const id of LATER_CHECKS) t.check(`${prefix}.${id}`, "NOT-OBSERVED", "initial apply did not complete");
      return "environmental";
    } else {
      t.check(`${prefix}.initial-apply`, "VIOLATED", `exit=${initialResult.status}; the initial apply failed for a non-environmental reason; stderr: "${stableQuote(initialResult.stderr) || "empty"}"`);
    }
    for (const id of LATER_CHECKS) t.check(`${prefix}.${id}`, "NOT-OBSERVED", "initial apply did not complete");
    return "failed";
  }
  t.check(
    `${prefix}.initial-apply`,
    "OBSERVED",
    `exit=0; applied=${initial.applied.length} (${initial.applied.join(", ") || "none"}); journaled operations=${initial.operationIds.length}; journal files=${journalsAfterInitial.length}; external=${(initial.externalChanges ?? []).join(", ") || "none"}`,
  );

  // (b) fingerprint after the initial apply
  const roots = [sandbox.home, sandbox.state, sandbox.prefix];
  const afterInitial = await fingerprintRoots(roots);

  // (c) human dry-run
  const preview = runCli(t, sandbox, ["install", ...targetArgs], { label: `${group}: dry-run install --target ${targetList} (human form)` });
  const lines = stepLines(preview.stdout);
  const notCurrent = lines.filter((line) => line.action !== "CURRENT");
  if (preview.status === 0 && lines.length > 0 && notCurrent.length === 0) {
    t.check(`${prefix}.preview-current`, "HOLDS", `exit=0; ${lines.length} step lines, every one CURRENT: ${lines.map((line) => line.id).join(", ")}`);
  } else {
    t.check(
      `${prefix}.preview-current`,
      "VIOLATED",
      `exit=${preview.status}; ${lines.length} step lines; not CURRENT: ${notCurrent.map((line) => `${line.id}=${line.action}`).join(", ") || "none (no step lines)"}`,
    );
  }

  // (d) fingerprint after the dry-run
  const afterPreview = await fingerprintRoots(roots);
  const previewEqual = compareFingerprints(t, `${group} sandbox home+state+prefix across the dry-run`, afterInitial, afterPreview);
  t.check(
    `${prefix}.preview-no-mutation`,
    previewEqual ? "HOLDS" : "VIOLATED",
    previewEqual
      ? "sandbox home, state and prefix digests are equal before and after the dry-run install"
      : "sandbox bytes changed across the dry-run install; drift lines above",
  );

  // (e) JSON dry-run
  const previewJsonResult = runCli(t, sandbox, ["install", ...targetArgs, "--json"], { label: `${group}: dry-run install --target ${targetList} --json` });
  const previewJson = parseJson(previewJsonResult);
  if (!previewJson) {
    t.check(`${prefix}.preview-json-current`, "VIOLATED", `exit=${previewJsonResult.status}; the dry-run did not return JSON; stderr: "${firstLine(previewJsonResult.stderr) || "empty"}"`);
  } else {
    const off = previewJson.steps.filter((step) => step.action !== "current");
    t.check(
      `${prefix}.preview-json-current`,
      previewJson.steps.length > 0 && off.length === 0 ? "HOLDS" : "VIOLATED",
      off.length === 0
        ? `${previewJson.steps.length} steps, every steps[].action is current`
        : `not current: ${off.map((step) => `${step.id}=${step.action}`).join(", ")}`,
    );
  }

  // (f) second apply
  const secondResult = runCli(t, sandbox, ["install", ...targetArgs, "--apply", "--json"], { label: `${group}: second install --target ${targetList} --apply` });
  const second = parseJson(secondResult);
  const journalsAfterSecond = await journalNames(sandbox);
  if (!second) {
    t.check(`${prefix}.second-apply-noop`, "VIOLATED", `exit=${secondResult.status}; the second apply did not return JSON; stderr: "${firstLine(secondResult.stderr) || "empty"}"`);
  } else {
    const journalsSame = JSON.stringify(journalsAfterSecond) === JSON.stringify(journalsAfterInitial);
    const noop = second.applied.length === 0
      && second.operationIds.length === 0
      && second.current.length === second.plan.steps.length
      && journalsSame;
    t.check(
      `${prefix}.second-apply-noop`,
      noop ? "HOLDS" : "VIOLATED",
      `applied=${second.applied.length}${second.applied.length > 0 ? ` (${second.applied.join(", ")})` : ""}; operationIds=${second.operationIds.length}; current=${second.current.length} of ${second.plan.steps.length} steps; journal file names ${journalsSame ? "unchanged" : "changed"} (${journalsAfterSecond.length})`,
    );
  }

  // (g) fingerprint after the second apply, compared with (b)
  const afterSecond = await fingerprintRoots(roots);
  const secondEqual = compareFingerprints(t, `${group} sandbox home+state+prefix across the second apply`, afterInitial, afterSecond);
  t.check(
    `${prefix}.second-apply-byte-identical`,
    secondEqual ? "HOLDS" : "VIOLATED",
    secondEqual
      ? "sandbox home, state and prefix digests after the second apply equal those after the initial apply"
      : "sandbox bytes changed across the second apply; drift lines above",
  );
  return "ok";
}

async function journalStatuses(sandbox) {
  const dir = join(sandbox.state, "journal");
  const statuses = [];
  for (const name of await journalNames(sandbox)) {
    try {
      const journal = JSON.parse(await readFile(join(dir, name), "utf8"));
      statuses.push(String(journal.status));
    } catch {
      statuses.push("unreadable");
    }
  }
  return statuses;
}

function ownedSkillSteps(result) {
  const plan = parseJson(result);
  if (!plan) return `exit=${result.status}; no plan JSON`;
  return plan.steps.filter((step) => step.id.startsWith("owned-skill:")).map((step) => `${step.id}=${step.action}`).join(", ");
}

async function seededGroup(t, tarballPath, label, harnesses) {
  const sandbox = await newSandbox(`life01-${label}`);
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  t.note(`${label}: packed release installed; installed lock channel: ${String(release.installedLock.channel)}; seeded harnesses: ${harnesses.join(", ")}`);
  const seedError = await seedOrRecord(t, sandbox, release, label, harnesses);
  return { sandbox, seedError };
}

// The alpha-aos-ship owned skill (claude only) declares the lock field
// `upstreamWorkflow: gsd-core/workflows/ship.md`, and applyOwnedSkillSync
// refuses when that file does not exist (src/core/owned-skills.ts). A real GSD
// install for claude writes it; seedHarnessPrerequisites seeds only the GSD
// VERSION/.gsd-runtime/.gsd-profile files. This probe completes the claude GSD
// seed from the locked GSD package itself: it installs the locked package into
// <sandbox>/temp (excluded from the fingerprint) with the host npm cache and
// copies gsd-core/workflows/ship.md into the sandbox claude GSD root.
async function seedClaudeShipWorkflow(t, sandbox, release, group) {
  const gsd = release.installedLock.components?.gsd;
  const spec = `${String(gsd?.package)}@${String(gsd?.version)}`;
  const scratchPrefix = join(sandbox.temp, "gsd-package");
  assertSandboxEnv(sandbox.env, sandbox.root);
  const npm = npmInvocation();
  const args = ["install", "--global", spec, "--prefix", scratchPrefix, "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"];
  const result = runCommand(t, {
    label: `${group}: seed the claude GSD ship workflow from the locked GSD package`,
    executable: npm.executable,
    args: [...npm.argsPrefix, ...args],
    env: { ...sandbox.env, npm_config_cache: hostNpmCache() },
    cwd: sandbox.repo,
    envOverrides: ["npm_config_cache"],
    display: ["npm", ...args].join(" "),
  });
  if (result.status !== 0) throw new Error(`locked GSD package install for the ship workflow failed: ${firstLine(result.stderr)}`);
  const packageDir = process.platform === "win32"
    ? join(scratchPrefix, "node_modules", String(gsd?.package))
    : join(scratchPrefix, "lib", "node_modules", String(gsd?.package));
  const source = join(packageDir, "gsd-core", "workflows", "ship.md");
  if (!existsSync(source)) throw new Error("the locked GSD package has no gsd-core/workflows/ship.md");
  const claudeRoot = harnessPaths(sandbox, "claude", release.installedLock).gsdRoot;
  const destination = join(claudeRoot, "gsd-core", "workflows", "ship.md");
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  t.note(`${group}: claude GSD seed completed with gsd-core/workflows/ship.md copied from the locked ${spec} package (${(await readFile(destination)).length}B), the upstreamWorkflow the alpha-aos-ship owned skill requires`);
}

async function seedOrRecord(t, sandbox, release, group, harnesses) {
  const eccCache = hostNpmCache();
  for (const harness of harnesses) {
    try {
      await seedHarnessPrerequisites(sandbox, release, harness, { eccCache });
      if (harness === "claude") await seedClaudeShipWorkflow(t, sandbox, release, group);
    } catch (error) {
      const message = firstLine(error instanceof Error ? error.message : String(error));
      t.note(`${group}: seeding ${harness} threw: ${message}`);
      return message;
    }
  }
  return null;
}

await runProbe("life01-harnesses", evidencePath("life01-harnesses-reconcile.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  t.note("seeding precondition (research Pitfall 5): for every harness the GSD gsd-core/VERSION, gsd-core/.gsd-runtime and .gsd-profile (not hermes: the stable lock installs no GSD for it), the three ECC skills rendered by the packed ecc-fixture module at the lock target hashes, the MCP config rendered by the packed renderMcpConfig, for pi the pi-mcp-adapter bridge manifest at the locked version, and for claude gsd-core/workflows/ship.md copied from the locked GSD package (the alpha-aos-ship upstreamWorkflow) are seeded before the initial apply, as the CI packed lifecycle test and plan 11-01 seed-selfcheck do. The locked ECC runtime is installed into each sandbox prefix with the host npm cache (eccCache).");
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a lock or repository-owned source digest printed by the CLI itself, never a digest of a user file");
  t.note("sandbox fingerprint roots per group: <sandbox-N>/home, <sandbox-N>/state, <sandbox-N>/prefix. Excluded by design: <sandbox-N>/temp (fixture scratch), <sandbox-N>/npm-cache and <sandbox-N>/npm-logs (npm writes a debug log on every invocation)");
  t.note("sandbox aliases: <sandbox> claude, <sandbox-2> antigravity, <sandbox-3> pi, <sandbox-4> hermes, <sandbox-5> all five harnesses together; when the five-target initial apply fails, <sandbox-6> reproduces with codex and pi only, <sandbox-7> runs claude, antigravity and hermes together as the no-shared-destination control, and <sandbox-8> applies codex and then pi one target at a time");

  for (const harness of SINGLE) {
    const sandbox = await newSandbox(`life01-${harness}`);
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
    t.note(`${harness}: packed release installed; installed lock channel: ${String(release.installedLock.channel)}`);
    const seedError = await seedOrRecord(t, sandbox, release, harness, [harness]);
    if (seedError !== null) {
      t.check(`life01.${harness}.initial-apply`, "NOT-OBSERVED", `seeding failed before the initial apply: "${seedError}"`);
      for (const id of LATER_CHECKS) t.check(`life01.${harness}.${id}`, "NOT-OBSERVED", "initial apply did not complete");
      continue;
    }
    await reconcile(t, sandbox, harness, harness);
  }

  const sandbox = await newSandbox("life01-all");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  t.note(`all: packed release installed; installed lock channel: ${String(release.installedLock.channel)}; seeding order claude, codex, antigravity, pi, hermes in one sandbox (codex and pi share <sandbox-5>/home/.agents/skills as their ECC skill root)`);
  const seedError = await seedOrRecord(t, sandbox, release, "all", ALL);
  if (seedError !== null) {
    t.check("life01.all.initial-apply", "NOT-OBSERVED", `seeding failed before the initial apply: "${seedError}"`);
    for (const id of LATER_CHECKS) t.check(`life01.all.${id}`, "NOT-OBSERVED", "initial apply did not complete");
    return;
  }
  const outcome = await reconcile(t, sandbox, "all", ALL.join(","));
  if (outcome !== "failed") return;

  // Diagnostics after a product failure of the five-target initial apply. The
  // six life01.all checks above stay as recorded; these groups narrow it.
  const statuses = await journalStatuses(sandbox);
  t.note(`all: after the failed five-target apply the sandbox state holds ${statuses.length} journal file(s) with status: ${statuses.join(", ") || "none"}`);
  const afterFailure = runCli(t, sandbox, ["install", "--target", ALL.join(","), "--json"], { label: "all: dry-run after the failed five-target apply (--json)" });
  t.check("life01.all-failure.owned-skills", "OBSERVED", `owned-skill steps planned after the failure: ${ownedSkillSteps(afterFailure)}`);
  t.note("all-retry: the same five-target apply is run again on the same sandbox; life01.all-retry.initial-apply is that second attempt, and the remaining all-retry checks judge the reconcile from the state it leaves");
  await reconcile(t, sandbox, "all-retry", ALL.join(","));

  const pair = await seededGroup(t, tarballPath, "codex-pi", ["codex", "pi"]);
  if (pair.seedError === null) {
    const plan = runCli(t, pair.sandbox, ["install", "--target", "codex,pi", "--json"], { label: "codex-pi: dry-run install --target codex,pi --json" });
    t.check("life01.codex-pi.owned-skill-plan", "OBSERVED", `owned-skill steps before any apply: ${ownedSkillSteps(plan)}; codex and pi both render alpha-aos-control into <sandbox-6>/home/.agents/skills (src/core/owned-skills.ts destinationFor via globalEccSkillRoot)`);
    await reconcile(t, pair.sandbox, "codex-pi", "codex,pi");
  } else {
    t.check("life01.codex-pi.owned-skill-plan", "NOT-OBSERVED", `seeding failed: "${pair.seedError}"`);
  }

  const trio = await seededGroup(t, tarballPath, "claude-antigravity-hermes", ["claude", "antigravity", "hermes"]);
  if (trio.seedError === null) {
    await reconcile(t, trio.sandbox, "claude-antigravity-hermes", "claude,antigravity,hermes");
  } else {
    t.check("life01.claude-antigravity-hermes.initial-apply", "NOT-OBSERVED", `seeding failed: "${trio.seedError}"`);
  }
  // Do codex and pi converge when applied one target at a time?
  const serial = await seededGroup(t, tarballPath, "codex-then-pi", ["codex", "pi"]);
  if (serial.seedError === null) {
    const codexOnly = runCli(t, serial.sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "codex-then-pi: install --target codex --apply" });
    const piOnly = runCli(t, serial.sandbox, ["install", "--target", "pi", "--apply", "--json"], { label: "codex-then-pi: install --target pi --apply" });
    const piResult = parseJson(piOnly);
    t.check(
      "life01.codex-then-pi.serial-apply",
      "OBSERVED",
      `codex apply exit=${codexOnly.status}; pi apply exit=${piOnly.status}${piResult ? `, applied=${piResult.applied.join(", ") || "none"}` : `, stderr: "${stableQuote(piOnly.stderr) || "empty"}"`}`,
    );
    const converged = runCli(t, serial.sandbox, ["install", "--target", "codex,pi", "--json"], { label: "codex-then-pi: dry-run install --target codex,pi --json" });
    t.check("life01.codex-then-pi.combined-plan", "OBSERVED", `owned-skill steps after the serial applies: ${ownedSkillSteps(converged)}`);
    const combined = runCli(t, serial.sandbox, ["install", "--target", "codex,pi", "--apply", "--json"], { label: "codex-then-pi: install --target codex,pi --apply after the serial applies" });
    const combinedResult = parseJson(combined);
    t.check(
      "life01.codex-then-pi.combined-apply",
      "OBSERVED",
      combinedResult
        ? `exit=0; applied=${combinedResult.applied.length}; operationIds=${combinedResult.operationIds.length}; current=${combinedResult.current.length} of ${combinedResult.plan.steps.length}`
        : `exit=${combined.status}; stderr: "${stableQuote(combined.stderr) || "empty"}"`,
    );
  } else {
    t.check("life01.codex-then-pi.serial-apply", "NOT-OBSERVED", `seeding failed: "${serial.seedError}"`);
  }
});
