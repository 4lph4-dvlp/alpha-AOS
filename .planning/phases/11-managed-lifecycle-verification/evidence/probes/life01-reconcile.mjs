// LIFE-01 tracer: idempotent stable-lock reconcile for Codex through the packed CLI.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-reconcile.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// "The plan" for LIFE-01 is `alpha-aos install` without `--apply`: it is the
// stateful plan that prints `CURRENT` step lines (src/cli.ts install branch).
// The static `alpha-aos plan` table is recorded as an OBSERVED fact.

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  repositoryRoot,
  runCli,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

const STEP_LINE = /^([A-Z]+)\s+(\S+) - /u;

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

async function docsMentions() {
  const files = [join(repositoryRoot, "README.md")];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await walk(join(repositoryRoot, "docs"));
  const hits = [];
  for (const file of files.sort()) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (line.includes("alpha-aos plan")) hits.push(`${relative(repositoryRoot, file).replaceAll("\\", "/")}:${index + 1}`);
    });
  }
  return hits;
}

await runProbe("life01-reconcile", evidencePath("life01-codex-reconcile.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const sandbox = await newSandbox("life01");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  t.note(`packed release installed into <sandbox>/prefix with the host npm cache; installed lock channel: ${String(release.installedLock.channel)}; no catalog/candidate.lock.json in the tarball or the installed package`);
  await seedHarnessPrerequisites(sandbox, release, "codex");
  t.note("codex prerequisites seeded (as the CI packed lifecycle test does): GSD gsd-core/VERSION, gsd-core/.gsd-runtime and .gsd-profile at the locked values; locked ECC runtime installed into the sandbox prefix with the sandbox npm cache; the three ECC skills rendered by the packed ecc-fixture module and matched to the lock target hashes; codex config.toml rendered by the packed renderMcpConfig");
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a lock or repository-owned source digest printed by the CLI itself, never a digest of a user file");
  t.note("sandbox fingerprint roots: <sandbox>/home, <sandbox>/state, <sandbox>/prefix. Excluded by design: <sandbox>/temp (fixture scratch), <sandbox>/npm-cache and <sandbox>/npm-logs (npm writes a debug log on every invocation)");

  // (a) initial apply
  const initialResult = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "initial install --target codex --apply" });
  const initial = parseJson(initialResult);
  const journalsAfterInitial = await journalNames(sandbox);
  if (!initial) {
    t.check("life01.codex.initial-apply", "OBSERVED", `exit=${initialResult.status}; initial apply did not return JSON`);
    for (const id of ["preview-current", "preview-no-mutation", "preview-json-current", "second-apply-noop", "second-apply-byte-identical"]) {
      t.check(`life01.codex.${id}`, "NOT-OBSERVED", "the initial apply failed, so the reconcile could not be observed");
    }
  } else {
    t.check(
      "life01.codex.initial-apply",
      "OBSERVED",
      `exit=0; applied=${initial.applied.length} (${initial.applied.join(", ")}); journaled operations=${initial.operationIds.length}; journal files=${journalsAfterInitial.length}; external=${(initial.externalChanges ?? []).join(", ") || "none"}`,
    );

    // (b) fingerprint after the initial apply
    const roots = [sandbox.home, sandbox.state, sandbox.prefix];
    const afterInitial = await fingerprintRoots(roots);

    // (c) human dry-run
    const preview = runCli(t, sandbox, ["install", "--target", "codex"], { label: "dry-run install --target codex (human form)" });
    const lines = stepLines(preview.stdout);
    const notCurrent = lines.filter((line) => line.action !== "CURRENT");
    if (preview.status === 0 && lines.length > 0 && notCurrent.length === 0) {
      t.check("life01.codex.preview-current", "HOLDS", `exit=0; ${lines.length} step lines, every one CURRENT: ${lines.map((line) => line.id).join(", ")}`);
    } else {
      t.check(
        "life01.codex.preview-current",
        "VIOLATED",
        `exit=${preview.status}; ${lines.length} step lines; not CURRENT: ${notCurrent.map((line) => `${line.id}=${line.action}`).join(", ") || "none (no step lines)"}`,
      );
    }

    // (d) fingerprint after the dry-run
    const afterPreview = await fingerprintRoots(roots);
    const previewEqual = compareFingerprints(t, "sandbox home+state+prefix across the dry-run", afterInitial, afterPreview);
    t.check(
      "life01.codex.preview-no-mutation",
      previewEqual ? "HOLDS" : "VIOLATED",
      previewEqual
        ? "sandbox home, state and prefix digests are equal before and after the dry-run install"
        : "sandbox bytes changed across the dry-run install; drift lines above",
    );

    // (e) JSON dry-run
    const previewJsonResult = runCli(t, sandbox, ["install", "--target", "codex", "--json"], { label: "dry-run install --target codex --json" });
    const previewJson = parseJson(previewJsonResult);
    if (!previewJson) {
      t.check("life01.codex.preview-json-current", "NOT-OBSERVED", `exit=${previewJsonResult.status}; the dry-run did not return JSON`);
    } else {
      const off = previewJson.steps.filter((step) => step.action !== "current");
      t.check(
        "life01.codex.preview-json-current",
        previewJson.steps.length > 0 && off.length === 0 ? "HOLDS" : "VIOLATED",
        off.length === 0
          ? `${previewJson.steps.length} steps, every steps[].action is current`
          : `not current: ${off.map((step) => `${step.id}=${step.action}`).join(", ")}`,
      );
    }

    // (f) second apply
    const secondResult = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "second install --target codex --apply" });
    const second = parseJson(secondResult);
    const journalsAfterSecond = await journalNames(sandbox);
    if (!second) {
      t.check("life01.codex.second-apply-noop", "VIOLATED", `exit=${secondResult.status}; the second apply did not return JSON`);
    } else {
      const journalsSame = JSON.stringify(journalsAfterSecond) === JSON.stringify(journalsAfterInitial);
      const noop = second.applied.length === 0
        && second.operationIds.length === 0
        && second.current.length === second.plan.steps.length
        && journalsSame;
      t.check(
        "life01.codex.second-apply-noop",
        noop ? "HOLDS" : "VIOLATED",
        `applied=${second.applied.length}; operationIds=${second.operationIds.length}; current=${second.current.length} of ${second.plan.steps.length} steps; journal file names ${journalsSame ? "unchanged" : "changed"} (${journalsAfterSecond.length})`,
      );
    }

    // (g) fingerprint after the second apply, compared with (b)
    const afterSecond = await fingerprintRoots(roots);
    const secondEqual = compareFingerprints(t, "sandbox home+state+prefix across the second apply", afterInitial, afterSecond);
    t.check(
      "life01.codex.second-apply-byte-identical",
      secondEqual ? "HOLDS" : "VIOLATED",
      secondEqual
        ? "sandbox home, state and prefix digests after the second apply equal those after the initial apply"
        : "sandbox bytes changed across the second apply; drift lines above",
    );
  }

  // (h) the static plan command
  const plan = runCli(t, sandbox, ["plan"], { label: "static plan table" });
  const planJsonResult = runCli(t, sandbox, ["plan", "--json"], { label: "static plan table --json" });
  const humanCurrent = /\bCURRENT\b/u.test(plan.stdout);
  const planJson = parseJson(planJsonResult);
  const jsonCurrent = planJson !== null && JSON.stringify(planJson).includes("\"current\"");
  t.check(
    "life01.plan-command-static",
    "OBSERVED",
    `alpha-aos plan exit=${plan.status}, CURRENT line ${humanCurrent ? "present" : "absent"}; plan --json exit=${planJsonResult.status}, a "current" value ${jsonCurrent ? "present" : "absent"}; the stateful plan for LIFE-01 is install without --apply`,
  );

  // (i) documentation that directs users to `alpha-aos plan`
  const hits = await docsMentions();
  t.check("life01.plan-command-docs", "OBSERVED", `README.md and docs/ lines containing "alpha-aos plan": ${hits.length > 0 ? hits.join(", ") : "none"}`);
});
