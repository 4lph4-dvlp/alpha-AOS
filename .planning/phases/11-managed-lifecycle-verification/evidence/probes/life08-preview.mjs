// LIFE-08 update preview: byte-fingerprint proof that no preview surface
// mutates the checkout, the package, the global link, the configuration or the
// managed state.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life08-preview.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// Scenario A (packed sandbox): `update`, `update --check --json` and
// `update --stage` (no --apply) through the installed packed CLI.
// Scenario B (fixture checkout inside the same sandbox): a bare mirror of this
// repository plays `origin`, a clone of it plays the user's alpha-AOS
// checkout, and `bootstrap update` (JSON and human), `scripts/update.sh` and
// `scripts/update.ps1` run there without --apply. The real repository is only
// read once, as the clone source; no update surface ever runs in it or
// against it.

import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  assertSandboxEnv,
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  npmInvocation,
  packOnce,
  repositoryRoot,
  runCli,
  runCommand,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

const APPLY_FLAG = /^-{1,2}apply$/iu;
// The cmdlets scripts/update.ps1 itself uses before it hands over to node
// (Get-Command for the node lookup, Split-Path and Push-/Pop-Location for the
// repository root, Write-Host for the plan-only notice), with
// no alpha-AOS code at all.
const CONTROL_COMMAND = "$null = Get-Command node -ErrorAction SilentlyContinue; $null = Split-Path -Parent $PWD; Push-Location $PWD; Write-Host control; Pop-Location; exit 0";

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function firstLine(value) {
  return String(value).split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

function parseJson(result) {
  if (result.status !== 0 && result.status !== 2) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function resolveOnPath(name) {
  const probe = process.platform === "win32"
    ? spawnSync("where.exe", [name], { encoding: "utf8", windowsHide: true })
    : spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" });
  if (probe.status !== 0) return null;
  return firstLine(probe.stdout) || null;
}

/**
 * The only way this probe spawns anything in the fixture checkout. It asserts
 * the sandbox env before every spawn, pins the working directory inside the
 * sandbox, allows only the host npm cache as a path override outside it, and
 * refuses any argument list that carries --apply or -Apply.
 */
function checkoutRunner(t, sandbox, checkout) {
  if (!inside(sandbox.root, checkout)) throw new Error("the fixture checkout is outside the sandbox root");
  return (label, executable, args, options = {}) => {
    const { allowHostCache = false, cwd = checkout, display } = options;
    if (args.some((arg) => APPLY_FLAG.test(arg))) throw new Error(`refusing to run ${label}: an --apply / -Apply argument is not allowed in the preview probe`);
    if (!inside(sandbox.root, cwd)) throw new Error(`refusing to run ${label}: the working directory is outside the sandbox root`);
    const env = { ...sandbox.env, ...(allowHostCache ? { npm_config_cache: hostNpmCache() } : {}) };
    assertSandboxEnv(env, sandbox.root);
    t.note(`cwd for the next step: ${cwd}`);
    return runCommand(t, {
      label,
      executable,
      args,
      env,
      cwd,
      envOverrides: allowHostCache ? ["npm_config_cache"] : [],
      display: display ?? [basename(executable).replace(/\.exe$/iu, ""), ...args].join(" "),
    });
  };
}

const PWSH_ENGINE_CACHE = "AppData/Local/Microsoft/PowerShell";

/** Drifted entries as { root, path } pairs, from two fingerprintRoots results. */
function driftEntries(before, after) {
  const drift = [];
  for (const root of before.roots) {
    const left = new Map((before.manifests.get(root)?.entries ?? []).map((entry) => [entry.path, entry]));
    const right = new Map((after.manifests.get(root)?.entries ?? []).map((entry) => [entry.path, entry]));
    for (const path of new Set([...left.keys(), ...right.keys()])) {
      const a = left.get(path);
      const b = right.get(path);
      if (!a || !b || a.kind !== b.kind || a.size !== b.size || a.sha256 !== b.sha256) drift.push({ root, path });
    }
  }
  return drift;
}

/** Whether every drifted entry is the PowerShell engine cache directory or a file under it, in the sandbox home. */
function onlyPwshEngineCache(sandbox, drift) {
  const ancestors = ["AppData", "AppData/Local", "AppData/Local/Microsoft", PWSH_ENGINE_CACHE];
  return drift.length > 0 && drift.every((entry) => entry.root === sandbox.home
    && (ancestors.includes(entry.path) || entry.path.startsWith(`${PWSH_ENGINE_CACHE}/`)));
}

function candidateSummary(candidate) {
  const components = candidate?.components ?? {};
  const parts = [];
  for (const id of ["gsd", "ecc"]) {
    const entry = components[id];
    if (entry) parts.push(`${id}=${entry.package}@${entry.version}`);
  }
  for (const [id, entry] of Object.entries(components.mcp ?? {})) parts.push(`mcp.${id}=${entry.package}@${entry.version}`);
  for (const [id, entry] of Object.entries(components.mcpBridges ?? {})) parts.push(`bridge.${id}=${entry.package}@${entry.version}`);
  return `channel=${candidate?.channel}; status=${candidate?.status}; ${parts.join(", ")}`;
}

await runProbe("life08-preview", evidencePath("life08-preview.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const sandbox = await newSandbox("life08-preview");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: hostNpmCache() });
  t.note(`packed release installed into <sandbox>/prefix; installed lock channel: ${String(release.installedLock.channel)}; codex prerequisites seeded as in the CI packed lifecycle test (ECC runtime from the host npm cache)`);
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a lock, repository or commit digest printed by the CLI itself, never a digest of a user file");
  t.note("fingerprint exclusions (by design, not by result): <sandbox>/npm-cache and <sandbox>/npm-logs, because npm writes debug logs and cache entries on every invocation including read-only queries (scripts/run-tests.mjs header); <sandbox>/temp, the fixture scratch space the CLI uses for plan-time fixtures. No other directory is excluded.");
  t.note("fingerprintManifest hashes the bytes of every file up to 1 MiB and records the size of larger files; path, kind, size and hash prefix are the only drift metadata printed");

  // ------------------------------------------------------------ scenario A
  t.line("");
  t.line("# scenario A: packed sandbox, update surfaces of the installed CLI");
  const install = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "A: install --target codex --apply (managed state to preview against)" });
  t.note(`A: the managed install exited ${install.status}; the preview checks below run either way, because no-mutation must hold for any starting state`);

  const rootsA = [sandbox.home, sandbox.state, sandbox.prefix];
  t.note("A: fingerprint roots: <sandbox>/home (harness configuration), <sandbox>/state (managed state), <sandbox>/prefix (installed package and global bin links)");
  let baseline = await fingerprintRoots(rootsA);

  const surfacesA = [
    { id: "update-default", args: ["update"], label: "A: update (no mode, defaults to --check)" },
    { id: "update-check", args: ["update", "--check", "--json"], label: "A: update --check --json" },
    { id: "update-stage", args: ["update", "--stage"], label: "A: update --stage (no --apply)" },
  ];
  for (const surface of surfacesA) {
    const result = runCli(t, sandbox, surface.args, { label: surface.label });
    const after = await fingerprintRoots(rootsA);
    const equal = compareFingerprints(t, `A home+state+prefix across ${surface.args.join(" ")}`, baseline, after);
    t.check(
      `life08.preview.${surface.id}.no-mutation`,
      equal ? "HOLDS" : "VIOLATED",
      equal
        ? `exit=${result.status}; sandbox home, state and prefix digests are equal before and after \`${surface.args.join(" ")}\``
        : `exit=${result.status}; bytes changed across \`${surface.args.join(" ")}\`; drift lines above`,
    );
    if (surface.id === "update-check") {
      const candidate = parseJson(result);
      t.check(
        "life08.preview.update-check.result",
        "OBSERVED",
        candidate !== null
          ? `exit=${result.status}; candidate reported: ${candidateSummary(candidate)}`
          : `exit=${result.status}; no candidate JSON; stderr: "${firstLine(result.stderr) || "empty"}"`,
      );
    }
    baseline = after;
  }

  // ------------------------------------------------------------ scenario B
  t.line("");
  t.line("# scenario B: fixture checkout inside the sandbox, bootstrap update and the update scripts");
  const origin = join(sandbox.root, "origin.git");
  const checkout = join(sandbox.root, "checkout");
  const run = checkoutRunner(t, sandbox, checkout);
  const git = resolveOnPath("git");
  const pwsh = resolveOnPath("pwsh");
  const sh = resolveOnPath("sh");
  if (git === null) throw new Error("git is not on PATH");

  const mirror = run("B: bare mirror of the repository as the fixture origin (reads the repository once)", git, [
    "-c", `safe.directory=${repositoryRoot}`,
    "clone", "--bare", "--no-hardlinks", "--quiet", repositoryRoot, origin,
  ], { cwd: sandbox.root });
  if (mirror.status !== 0) throw new Error("the bare mirror clone failed");
  const clone = run("B: clone the fixture origin as the user's checkout", git, ["clone", "--no-hardlinks", "--quiet", origin, checkout], { cwd: sandbox.root });
  if (clone.status !== 0) throw new Error("the fixture checkout clone failed");
  const npm = npmInvocation();
  const ci = run("B: npm ci in the checkout (sandbox env, host npm cache)", npm.executable, [
    ...npm.argsPrefix, "ci", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund",
  ], { allowHostCache: true, display: "npm ci --ignore-scripts --prefer-offline --no-audit --no-fund" });
  if (ci.status !== 0) t.note(`B: npm ci exited ${ci.status}; the checkout has no node_modules and the preview reflects that`);
  // The checkout builds its own dist. Copying <repo>/dist does not give a
  // verified artifact: this host's working tree holds CRLF bytes for some
  // files that the index stores as LF under `* text=auto eol=lf`, so the
  // repository manifest hashes inputs an LF clone does not have.
  t.note("B: dist is built inside the checkout (npm run build = tsc + build-artifact write) instead of copied from <repo>/dist: the host working tree holds CRLF bytes for files the index stores as LF (.gitattributes `* text=auto eol=lf`), so a copied manifest does not describe the LF clone's inputs");
  run("B: npm run build in the checkout (the checkout's own build artifact)", npm.executable, [...npm.argsPrefix, "run", "build"], { display: "npm run build" });
  const artifact = run("B: node scripts/build-artifact.mjs check", process.execPath, ["scripts/build-artifact.mjs", "check"]);
  t.check(
    "life08.preview.checkout-artifact",
    artifact.status === 0 ? "HOLDS" : "OBSERVED",
    artifact.status === 0
      ? "exit=0; the fixture checkout's build artifact is verified, so the bootstrap preview is a full preview"
      : `exit=${artifact.status}; the build artifact is not verified (the preview is a blocked preview; no-mutation still applies): "${firstLine(artifact.stdout + artifact.stderr)}"`,
  );
  run("B: settle the checkout index before the baseline (git status --porcelain)", git, ["status", "--porcelain"]);
  t.note("B: one setup `git status` settles the index stat cache after the clone, the dist copy and npm ci, so the baseline is not taken over a stale index");

  const rootsB = [checkout, sandbox.home, sandbox.state, sandbox.prefix];
  t.note("B: fingerprint roots: <sandbox>/checkout (work tree, .git, node_modules and dist: checkout, package and artifact), <sandbox>/home (configuration), <sandbox>/state (managed state), <sandbox>/prefix (global link target)");
  baseline = await fingerprintRoots(rootsB);

  let bootstrapJson = null;
  let bootstrapHuman = null;
  const surfacesB = [
    { id: "bootstrap-update", label: "B: node dist/src/cli.js bootstrap update --json", executable: process.execPath, args: ["dist/src/cli.js", "bootstrap", "update", "--json"], display: "node dist/src/cli.js bootstrap update --json" },
    { id: "bootstrap-update-human", label: "B: node dist/src/cli.js bootstrap update", executable: process.execPath, args: ["dist/src/cli.js", "bootstrap", "update"], display: "node dist/src/cli.js bootstrap update" },
    { id: "update-sh", label: "B: sh scripts/update.sh", executable: sh, args: ["scripts/update.sh"], display: "sh scripts/update.sh" },
    { id: "update-ps1", label: "B: pwsh -NoProfile -File scripts/update.ps1", executable: pwsh, args: ["-NoProfile", "-File", "scripts/update.ps1"], display: "pwsh -NoProfile -File scripts/update.ps1" },
  ];
  for (const surface of surfacesB) {
    if (surface.executable === null) {
      t.check(`life08.preview.${surface.id}.no-mutation`, "NOT-OBSERVED", `${surface.display.split(" ")[0]} is not on PATH`);
      continue;
    }
    const result = run(surface.label, surface.executable, surface.args, { display: surface.display });
    if (surface.id === "bootstrap-update") bootstrapJson = { result, plan: parseJson(result) };
    if (surface.id === "bootstrap-update-human") bootstrapHuman = result;
    const after = await fingerprintRoots(rootsB);
    const equal = compareFingerprints(t, `B checkout+home+state+prefix across ${surface.display}`, baseline, after);
    t.check(
      `life08.preview.${surface.id}.no-mutation`,
      equal ? "HOLDS" : "VIOLATED",
      equal
        ? `exit=${result.status}; checkout (with .git, node_modules and dist), home, state and prefix digests are equal before and after \`${surface.display}\``
        : `exit=${result.status}; bytes changed across \`${surface.display}\`; drift lines above`,
    );
    if (surface.id === "update-ps1") {
      const drift = driftEntries(baseline, after);
      t.check(
        "life08.preview.update-ps1.drift-scope",
        "OBSERVED",
        drift.length === 0
          ? "no drift"
          : `${drift.length} drifted entries; every one under <sandbox>/home/${PWSH_ENGINE_CACHE}: ${onlyPwshEngineCache(sandbox, drift) ? "yes" : "no"}; checkout, state and prefix drift: ${drift.some((entry) => entry.root !== sandbox.home) ? "yes" : "none"}`,
      );
    }
    baseline = after;
  }

  const jsonPart = bootstrapJson === null
    ? "bootstrap update --json did not run"
    : bootstrapJson.plan !== null
      ? `bootstrap update --json exit=${bootstrapJson.result.status} with a plan document (external: ${(bootstrapJson.plan.external ?? []).map((step) => step.id).join(", ") || "none"})`
      : `bootstrap update --json exit=${bootstrapJson.result.status} and no plan document; stderr: "${firstLine(bootstrapJson.result.stderr).replace(/sha256=[0-9a-f]{64}/u, "sha256=<digest>").slice(0, 160)}"`;
  if (bootstrapHuman === null) {
    t.check("life08.preview.bootstrap-update.plan", "OBSERVED", `${jsonPart}; the human preview did not run`);
  } else {
    const lines = bootstrapHuman.stdout.split(/\r?\n/u);
    const runs = lines.filter((line) => line.startsWith("RUN ")).map((line) => line.slice(4));
    const blocked = lines.filter((line) => line.startsWith("BLOCKED ")).map((line) => line.slice(8));
    const artifactLine = lines.find((line) => line.startsWith("Build artifact:")) ?? "Build artifact: (no line)";
    const checkoutLine = /^Checkout: ([0-9a-f]{40}|unknown) -> ([0-9a-f]{40}|unresolved)$/u.exec(lines.find((line) => line.startsWith("Checkout:")) ?? "");
    const closing = lines.find((line) => line.startsWith("Refused.") || line.startsWith("Preview only.")) ?? "(no closing line)";
    t.check(
      "life08.preview.bootstrap-update.plan",
      "OBSERVED",
      `human preview exit=${bootstrapHuman.status}: planned external steps ${runs.join(", ") || "none"}; blocked reasons: ${blocked.join(" | ") || "none"}; ${artifactLine}; checkout target ${checkoutLine ? (checkoutLine[1] === checkoutLine[2] ? "equals HEAD" : "differs from HEAD") : "not shown"}; "${closing}". ${jsonPart}`,
    );
  }

  // PowerShell engine control. pwsh itself writes a startup profile cache under
  // LOCALAPPDATA on its first non-interactive start. The control runs a no-op
  // pwsh against a fresh control home inside the sandbox to show what pwsh
  // writes without any alpha-AOS script, and the re-run shows update.ps1 in
  // the steady state. Neither replaces the update-ps1 check above.
  if (pwsh !== null) {
    const controlRoot = join(sandbox.root, "pwsh-control");
    const controlHome = join(controlRoot, "home");
    await mkdir(controlHome, { recursive: true });
    const controlEnv = {
      HOME: controlHome,
      USERPROFILE: controlHome,
      APPDATA: join(controlHome, "AppData", "Roaming"),
      LOCALAPPDATA: join(controlHome, "AppData", "Local"),
    };
    const controlBefore = await fingerprintRoots([controlHome]);
    const env = { ...sandbox.env, ...controlEnv };
    assertSandboxEnv(env, sandbox.root);
    const control = runCommand(t, {
      label: "control: pwsh running only the cmdlets update.ps1 uses, against a fresh control home",
      executable: pwsh,
      args: ["-NoProfile", "-Command", CONTROL_COMMAND],
      env,
      cwd: controlRoot,
      envOverrides: Object.keys(controlEnv),
      display: `pwsh -NoProfile -Command "${CONTROL_COMMAND}"`,
    });
    const controlAfter = await fingerprintRoots([controlHome]);
    const controlEqual = compareFingerprints(t, "control home across the pwsh control", controlBefore, controlAfter);
    const beforePaths = new Set((controlBefore.manifests.get(controlHome)?.entries ?? []).map((entry) => entry.path));
    const added = (controlAfter.manifests.get(controlHome)?.entries ?? [])
      .filter((entry) => entry.kind === "file" && !beforePaths.has(entry.path))
      .map((entry) => entry.path);
    t.check(
      "life08.preview.update-ps1.pwsh-control",
      "OBSERVED",
      `exit=${control.status}; pwsh with the update.ps1 cmdlets and no alpha-AOS code ${controlEqual ? "left the control home unchanged" : `added files: ${added.join(", ") || "none (directories only)"}`}`,
    );

    const rerun = run("B: pwsh -NoProfile -File scripts/update.ps1 (re-run, steady state)", pwsh, ["-NoProfile", "-File", "scripts/update.ps1"], { display: "pwsh -NoProfile -File scripts/update.ps1" });
    const afterRerun = await fingerprintRoots(rootsB);
    const rerunEqual = compareFingerprints(t, "B checkout+home+state+prefix across the update.ps1 re-run", baseline, afterRerun);
    const rerunDrift = driftEntries(baseline, afterRerun);
    t.check(
      "life08.preview.update-ps1-rerun.no-mutation",
      rerunEqual ? "HOLDS" : "VIOLATED",
      rerunEqual
        ? `exit=${rerun.status}; checkout, home, state and prefix digests are equal before and after a second pwsh -NoProfile -File scripts/update.ps1`
        : `exit=${rerun.status}; bytes changed across the update.ps1 re-run; drift lines above; every drifted entry under <sandbox>/home/${PWSH_ENGINE_CACHE}: ${onlyPwshEngineCache(sandbox, rerunDrift) ? "yes" : "no"}`,
    );
  }
});
