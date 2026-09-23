// LIFE-08 update apply: `update --apply` reconciles only the reviewed stable
// lock that ships inside the package, and ignores an unreviewed
// catalog/candidate.lock.json dropped next to it.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life08-apply.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// The bogus candidate lock is written only into the sandbox installed package
// (<sandbox>/prefix/.../alpha-aos/catalog/candidate.lock.json), never into the
// repository checkout.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  runCli,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

const BOGUS_ECC_VERSION = "9.9.9";
const CANDIDATE_MESSAGE = "Unverified candidate.lock.json was not applied.";

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function parseJson(result) {
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function firstLine(value) {
  return String(value).split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

async function journalNames(sandbox) {
  const dir = join(sandbox.state, "journal");
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
}

async function sha256File(path) {
  return existsSync(path) ? createHash("sha256").update(await readFile(path)).digest("hex") : null;
}

await runProbe("life08-apply", evidencePath("life08-apply.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const sandbox = await newSandbox("life08-apply");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: hostNpmCache() });
  t.note(`packed release installed into <sandbox>/prefix; installed lock channel: ${String(release.installedLock.channel)}; stable ECC version ${String(release.installedLock.components?.ecc?.version)}; codex prerequisites seeded as in the CI packed lifecycle test`);
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a lock or repository-owned source digest printed by the CLI itself, never a digest of a user file");
  t.note("fingerprint roots: <sandbox>/home, <sandbox>/state, <sandbox>/prefix. Excluded by design: <sandbox>/temp (fixture scratch), <sandbox>/npm-cache and <sandbox>/npm-logs (npm writes a debug log on every invocation)");

  const install = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "install --target codex --apply (the reviewed stable lock, applied)" });
  if (install.status !== 0) throw new Error(`the managed install failed, so update --apply cannot be judged: ${firstLine(install.stderr)}`);

  // The unreviewed candidate: a stable-lock copy relabelled `candidate` with a bogus ECC version.
  const candidatePath = join(release.installedPackage, "catalog", "candidate.lock.json");
  if (!inside(sandbox.root, candidatePath)) throw new Error("the installed package is outside the sandbox root; refusing to write a candidate lock");
  const stableLock = JSON.parse(await readFile(join(release.installedPackage, "catalog", "stack.lock.json"), "utf8"));
  const bogus = {
    ...stableLock,
    channel: "candidate",
    components: { ...stableLock.components, ecc: { ...stableLock.components.ecc, version: BOGUS_ECC_VERSION } },
  };
  await writeFile(candidatePath, `${JSON.stringify(bogus, null, 2)}\n`, "utf8");
  t.note(`bogus candidate lock written to <sandbox>/prefix/.../alpha-aos/catalog/candidate.lock.json: a copy of the installed stable lock with channel=candidate and components.ecc.version=${BOGUS_ECC_VERSION}; the baseline fingerprint below is taken after this write, so the file is part of it`);

  const roots = [sandbox.home, sandbox.state, sandbox.prefix];
  const baseline = await fingerprintRoots(roots);
  const journalsBefore = await journalNames(sandbox);

  // 1. update --apply with the bogus candidate present (JSON)
  const updateResult = runCli(t, sandbox, ["update", "--apply", "--target", "codex", "--json"], { label: "update --apply --target codex --json (unreviewed candidate lock present)" });
  const update = parseJson(updateResult);
  const mentionsBogus = `${updateResult.stdout}\n${updateResult.stderr}`.includes(BOGUS_ECC_VERSION);
  if (update === null) {
    t.check("life08.apply.candidate-ignored", "VIOLATED", `exit=${updateResult.status}; update --apply did not return a result; stderr: "${firstLine(updateResult.stderr) || "empty"}"`);
  } else {
    const ignored = update.applied.length === 0 && !mentionsBogus;
    t.check(
      "life08.apply.candidate-ignored",
      ignored ? "HOLDS" : "VIOLATED",
      `exit=0; applied=${update.applied.length}${update.applied.length > 0 ? ` (${update.applied.join(", ")})` : ""}; operationIds=${update.operationIds.length}; current=${update.current.length} of ${update.plan.steps.length}; "${BOGUS_ECC_VERSION}" ${mentionsBogus ? "appears" : "does not appear"} in stdout or stderr`,
    );
  }
  const journalsAfter = await journalNames(sandbox);
  const journalsSame = JSON.stringify(journalsAfter) === JSON.stringify(journalsBefore);
  t.check(
    "life08.apply.no-new-journal",
    journalsSame ? "HOLDS" : "VIOLATED",
    `journal file names ${journalsSame ? "unchanged" : "changed"} (${journalsBefore.length} before, ${journalsAfter.length} after)`,
  );
  const afterUpdate = await fingerprintRoots(roots);
  const equal = compareFingerprints(t, "home+state+prefix across update --apply with the candidate lock present", baseline, afterUpdate);
  t.check(
    "life08.apply.byte-identical",
    equal ? "HOLDS" : "VIOLATED",
    equal
      ? "sandbox home, state and prefix digests (the candidate lock included) are equal before and after update --apply"
      : "sandbox bytes changed across update --apply; drift lines above",
  );

  // 2. human form: the candidate message
  const human = runCli(t, sandbox, ["update", "--apply", "--target", "codex"], { label: "update --apply --target codex (human form)" });
  t.check(
    "life08.apply.message",
    human.status === 0 && human.stdout.includes(CANDIDATE_MESSAGE) ? "HOLDS" : "VIOLATED",
    `exit=${human.status}; stdout ${human.stdout.includes(CANDIDATE_MESSAGE) ? "contains" : "does not contain"} "${CANDIDATE_MESSAGE}"`,
  );
  t.note(`the bogus candidate lock is ${existsSync(candidatePath) ? "still present, unconsumed" : "gone"} after both update --apply runs`);

  // 3. stable-lock reconcile: remove a managed file and let update --apply restore it
  const codexHome = sandbox.env.CODEX_HOME;
  const policyPath = join(codexHome, "AGENTS.md");
  if (!inside(sandbox.root, policyPath)) throw new Error("CODEX_HOME is outside the sandbox root");
  const recorded = await sha256File(policyPath);
  if (recorded === null) throw new Error("the managed Codex AGENTS.md is missing after the install");
  await rm(policyPath);
  t.note("the managed <sandbox>/home/.codex/AGENTS.md was deleted after recording its sha256 (value not printed)");
  const restoreResult = runCli(t, sandbox, ["update", "--apply", "--target", "codex", "--json"], { label: "update --apply --target codex --json (one managed file removed)" });
  const restore = parseJson(restoreResult);
  const restoredHash = await sha256File(policyPath);
  if (restore === null) {
    t.check("life08.apply.reconciles-stable", "VIOLATED", `exit=${restoreResult.status}; update --apply did not return a result; stderr: "${firstLine(restoreResult.stderr) || "empty"}"`);
  } else {
    const policyApplied = restore.applied.includes("policy:codex-execution");
    const same = restoredHash !== null && restoredHash === recorded;
    t.check(
      "life08.apply.reconciles-stable",
      policyApplied && same ? "HOLDS" : "VIOLATED",
      `exit=0; applied=${restore.applied.join(", ") || "none"}; operationIds=${restore.operationIds.length}; restored AGENTS.md ${restoredHash === null ? "missing" : same ? "sha256 equals the recorded one" : "sha256 differs from the recorded one"}`,
    );
  }
  const again = runCli(t, sandbox, ["update", "--apply", "--target", "codex", "--json"], { label: "update --apply --target codex --json (again, nothing changed)" });
  const againResult = parseJson(again);
  t.check(
    "life08.apply.reconcile-idempotent",
    againResult !== null && againResult.applied.length === 0 && againResult.operationIds.length === 0 ? "HOLDS" : "VIOLATED",
    againResult === null
      ? `exit=${again.status}; no result; stderr: "${firstLine(again.stderr) || "empty"}"`
      : `exit=0; applied=${againResult.applied.length}; operationIds=${againResult.operationIds.length}; current=${againResult.current.length} of ${againResult.plan.steps.length}`,
  );
});
