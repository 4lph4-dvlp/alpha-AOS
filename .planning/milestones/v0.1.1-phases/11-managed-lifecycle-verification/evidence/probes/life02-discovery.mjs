// LIFE-02 discovery probe: native discovery and no-spend canary evidence for
// the five harnesses through the packed CLI.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-discovery.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// Unlike every other Phase 11 probe, the doctor steps here keep the REAL home
// and harness configuration roots: the discovery oracles launch the real codex
// and pi binaries, which must find their own configuration (research
// Pitfall 2). Only ALPHA_AOS_STATE_DIR moves into the sandbox, and the project
// is a scratch clone, because the handoff canary writes memory-vault files into
// the project it is given (Pitfall 1). Because the real binaries keep the real
// HOME, the real harness roots are fingerprinted before the first doctor step
// and after the last one (D-13 judged afresh for this runner):
// `life02.harness-homes-unchanged`.
//
// Spend boundary (D-11): the runner refuses any command outside a two-entry
// allowlist, and the canary entry always carries --no-spend. No credential or
// spend-enabling flag is ever passed.

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readdirSync } from "node:fs";
import os from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  commandResult,
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  registerAlias,
  repositoryRoot,
  runCommand,
  runProbe,
} from "./probe-lib.mjs";

const HARNESSES = ["claude", "codex", "antigravity", "pi", "hermes"];

// ---------------------------------------------------------------- harness homes

const home = os.homedir();
const fromEnv = (name, fallback) => resolve(process.env[name]?.trim() || fallback);

/** The real harness roots the native invocations may touch (11-01 harness path table fallbacks). */
const HARNESS_HOME_ROOTS = Object.freeze([
  { label: "codex", source: "CODEX_HOME or <home>/.codex", path: fromEnv("CODEX_HOME", join(home, ".codex")) },
  { label: "claude", source: "CLAUDE_CONFIG_DIR or <home>/.claude", path: fromEnv("CLAUDE_CONFIG_DIR", join(home, ".claude")) },
  { label: "antigravity", source: "ANTIGRAVITY_CONFIG_DIR or <home>/.gemini/antigravity", path: fromEnv("ANTIGRAVITY_CONFIG_DIR", join(home, ".gemini", "antigravity")) },
  { label: "gemini-config", source: "<home>/.gemini/config", path: join(home, ".gemini", "config") },
  { label: "pi", source: "PI_CODING_AGENT_DIR or <home>/.pi/agent", path: fromEnv("PI_CODING_AGENT_DIR", join(home, ".pi", "agent")) },
  { label: "hermes", source: "HERMES_HOME or <home>/.hermes", path: fromEnv("HERMES_HOME", join(home, ".hermes")) },
  { label: "agents-skills", source: "<home>/.agents/skills", path: join(home, ".agents", "skills") },
]);

/**
 * alpha-AOS-managed children of each root: the real-host counterparts of the
 * packed-sandbox harnessPaths table plus the other files alpha-AOS writes
 * there. An exclusion may never name one of these; drift in one is VIOLATED.
 */
const MANAGED_CHILDREN = Object.freeze({
  codex: ["gsd-core", ".gsd-profile", "config.toml", "AGENTS.md", "skills", "hooks", "gsd-file-manifest.json", "gsd-install-state.json"],
  claude: ["gsd-core", ".gsd-profile", "skills", "settings.json", "gsd-file-manifest.json", "gsd-install-state.json"],
  antigravity: ["gsd-core", ".gsd-profile", "skills", "gsd-file-manifest.json", "gsd-install-state.json"],
  "gemini-config": ["mcp_config.json", "skills"],
  pi: ["gsd-core", ".gsd-profile", "mcp.json", "skills", "npm", "gsd-file-manifest.json", "gsd-install-state.json"],
  hermes: ["config.yaml", "skills"],
  "agents-skills": ["unified-memory", "documentation-lookup", "deep-research", "alpha-aos-control", "alpha-aos-ship"],
});

const EVERY_ROOT = "*";
/** Volatile and credential children that are not judged, each with its reason. */
const VOLATILE_EXCLUSIONS = Object.freeze([
  { root: EVERY_ROOT, name: "sessions", reason: "session transcripts a harness writes on every run" },
  { root: EVERY_ROOT, name: "log", reason: "harness log output" },
  { root: EVERY_ROOT, name: "logs", reason: "harness log output" },
  { root: EVERY_ROOT, name: "history.jsonl", reason: "prompt history appended by the harness" },
  { root: EVERY_ROOT, name: "cache", reason: "harness cache" },
  { root: "claude", name: "projects", reason: "per-project transcripts the executing Claude Code session rewrites" },
  { root: "claude", name: "todos", reason: "state the executing Claude Code session rewrites" },
  { root: "claude", name: "shell-snapshots", reason: "state the executing Claude Code session rewrites" },
  { root: "claude", name: "statsig", reason: "state the executing Claude Code session rewrites" },
  { root: "claude", name: "debug", reason: "state the executing Claude Code session rewrites" },
  { root: "claude", name: "file-history", reason: "state the executing Claude Code session rewrites" },
  { root: "claude", name: "session-env", reason: "state the executing Claude Code session rewrites" },
  { root: "claude", name: "ide", reason: "state the executing Claude Code session rewrites" },
  { root: "codex", name: ".tmp", reason: "Codex scratch directory (thousands of transient entries a running Codex rewrites)" },
  { root: "codex", name: "tmp", reason: "Codex scratch directory holding per-process lock files a running Codex keeps open (EBUSY on read)" },
  { root: "codex", name: "thread-writer-locks", reason: "per-thread session lock files a running Codex keeps open under an exclusive lock (EBUSY on read)" },
  { root: "hermes", name: ".env", reason: "credential material (provider keys file); never hashed into public evidence" },
  { root: "codex", name: ".sandbox-secrets", reason: "credential material; never hashed into public evidence" },
  { root: "hermes", name: "hermes-agent", reason: "the Hermes application install tree (about 137k entries; one fingerprint pass exceeded 10 minutes on this host); a harness application, never an alpha-AOS-managed path, so it is recorded as unjudged here" },
]);
const CREDENTIAL_NAME = /auth|credential|token|oauth/iu;

function exclusionFor(label, name) {
  const fixed = VOLATILE_EXCLUSIONS.find((entry) => (entry.root === EVERY_ROOT || entry.root === label) && entry.name === name);
  if (fixed) return fixed.reason;
  if (CREDENTIAL_NAME.test(name)) return "credential material (name contains auth, credential, token or oauth); refreshed by the harness and never hashed into public evidence";
  return null;
}

function assertExclusionsSafe() {
  for (const entry of VOLATILE_EXCLUSIONS) {
    const roots = entry.root === EVERY_ROOT ? Object.keys(MANAGED_CHILDREN) : [entry.root];
    for (const root of roots) {
      if ((MANAGED_CHILDREN[root] ?? []).includes(entry.name)) {
        throw new Error(`harness-home exclusion ${entry.root}/${entry.name} names an alpha-AOS-managed path; refusing to run`);
      }
    }
  }
  for (const [root, names] of Object.entries(MANAGED_CHILDREN)) {
    for (const name of names) {
      if (CREDENTIAL_NAME.test(name)) throw new Error(`the credential rule would exclude the managed path ${root}/${name}; refusing to run`);
    }
  }
}

/** Files under a path that cannot be opened because another process holds them locked (Windows EBUSY/EPERM). */
function lockedFileCount(path) {
  let locked = 0;
  const visit = (current) => {
    let info;
    try {
      info = lstatSync(current);
    } catch {
      return;
    }
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      let children = [];
      try {
        children = readdirSync(current);
      } catch {
        return;
      }
      for (const child of children) visit(join(current, child));
      return;
    }
    try {
      closeSync(openSync(current, "r"));
    } catch (error) {
      if (error?.code === "EBUSY" || error?.code === "EPERM") locked += 1;
    }
  };
  visit(path);
  return locked;
}

/** Enumerates the judged children of every harness root; writes one note per exclusion. */
function harnessHomeTargets(t) {
  const targets = [];
  const labels = new Map();
  for (const root of HARNESS_HOME_ROOTS) {
    if (!existsSync(root.path)) {
      targets.push(root.path);
      labels.set(root.path, { root: root.label, name: ".", managed: false });
      t.note(`harness home ${root.label} (${root.source}): absent; fingerprinted as absent`);
      continue;
    }
    const children = readdirSync(root.path).sort();
    let judged = 0;
    for (const name of children) {
      const reason = exclusionFor(root.label, name);
      if (reason) {
        t.note(`harness-home exclusion: ${root.label}/${name}: ${reason}`);
        continue;
      }
      const path = join(root.path, name);
      const locked = lockedFileCount(path);
      if (locked > 0) {
        if ((MANAGED_CHILDREN[root.label] ?? []).includes(name)) {
          throw new Error(`the managed path ${root.label}/${name} holds ${locked} file(s) under an exclusive lock; it cannot be fingerprinted`);
        }
        t.note(`harness-home exclusion: ${root.label}/${name}: ${locked} file(s) held under an exclusive lock by a running process at enumeration time (EBUSY/EPERM on open); not readable, so not judgeable`);
        continue;
      }
      targets.push(path);
      labels.set(path, { root: root.label, name, managed: (MANAGED_CHILDREN[root.label] ?? []).includes(name) });
      judged += 1;
    }
    t.note(`harness home ${root.label} (${root.source}): ${children.length} children, ${judged} fingerprinted`);
  }
  return { targets, labels };
}

// ---------------------------------------------------------------- real-home runner

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function allowedDoctorArgs(args, project) {
  const base = args.filter((value) => value !== "--json");
  if (args.filter((value) => value === "--json").length > 1) return false;
  if (base.length === 3 && base[0] === "doctor" && base[1] === "--discovery" && base[2] === project) return true;
  return base.length === 4 && base[0] === "doctor" && base[1] === "--canary" && base[2] === project && base[3] === "--no-spend";
}

/**
 * The only way this probe launches the packed CLI with the real home. It
 * refuses unless the state root is inside the sandbox, there is no --apply,
 * and the command is `doctor --discovery <project>` or
 * `doctor --canary <project> --no-spend` (each optionally with --json).
 */
function makeRealHomeRunner(t, sandbox, entrypoint, project) {
  return (label, args) => {
    const env = { ...process.env, ALPHA_AOS_STATE_DIR: sandbox.state };
    if (!inside(sandbox.root, env.ALPHA_AOS_STATE_DIR)) throw new Error("real-home runner: ALPHA_AOS_STATE_DIR is outside the sandbox; refusing to spawn");
    if (args.includes("--apply")) throw new Error("real-home runner: --apply is refused");
    if (!allowedDoctorArgs(args, project)) throw new Error(`real-home runner: ${args.join(" ")} is not on the allowlist; refusing to spawn`);
    if (args.includes("--canary") && !args.includes("--no-spend")) throw new Error("real-home runner: a canary without --no-spend is refused");
    const started = performance.now();
    const result = commandResult(spawnSync(process.execPath, [entrypoint, ...args], {
      env,
      cwd: project,
      encoding: "utf8",
      timeout: 900_000,
      windowsHide: true,
    }));
    const durationMs = Math.round(performance.now() - started);
    t.step(label, {
      command: ["node", entrypoint, ...args].join(" "),
      envOverrides: ["ALPHA_AOS_STATE_DIR"],
      status: result.status,
      durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    return result;
  };
}

// ---------------------------------------------------------------- helpers

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function gitLines(args) {
  const result = spawnSync("git", args, { encoding: "utf8", windowsHide: true, timeout: 120_000 });
  return (result.stdout ?? "").split(/\r?\n/u).filter((line) => line.length > 0);
}

const spendText = /model turn|would spend|spends|costs? /iu;

function rowState(row) {
  const parts = [`completeness=${row?.completeness ?? "null"}`, `support=${row?.axes?.support ?? "null"}`, `nativeUse=${row?.axes?.nativeUse ?? "null"}`];
  if (row?.notRunReason) parts.push(`notRun="${row.notRunReason}"`);
  return `${row?.capability ?? "?"}: ${parts.join(" ")}`;
}

// ---------------------------------------------------------------- probe

await runProbe("life02-discovery", evidencePath("life02-discovery.txt"), async (t) => {
  assertExclusionsSafe();
  for (const root of HARNESS_HOME_ROOTS) {
    if (!inside(home, root.path)) registerAlias(root.path, `<${root.label}-home>`);
  }

  const { tarballPath } = await packOnce(t);
  const sandbox = await newSandbox("life02d");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  t.note(`packed release installed into <sandbox>/prefix; installed lock channel: ${String(release.installedLock.channel)}; no harness seeding (the doctor steps read the real harness installations)`);
  const entrypoint = join(release.installedPackage, "dist", "src", "cli.js");
  const project = join(sandbox.root, "project");

  const repoBefore = runCommand(t, {
    label: "real repository porcelain before",
    executable: "git",
    args: ["-C", repositoryRoot, "status", "--porcelain"],
  });
  runCommand(t, {
    label: "scratch clone of the repository (the canary writes vault files into the project it is given)",
    executable: "git",
    args: ["clone", "--no-hardlinks", "--quiet", repositoryRoot, project],
  });
  if (!existsSync(join(project, ".planning"))) throw new Error("the scratch clone has no .planning tree");
  t.note("the doctor steps below run with the probe's real environment (real HOME and harness roots, so the harness binaries find their own configuration) plus ALPHA_AOS_STATE_DIR=<sandbox>/state; the runner refuses --apply, any command outside `doctor --discovery <project>` / `doctor --canary <project> --no-spend`, and a state root outside the sandbox");
  t.note("CLI output below passed the CLI's own redaction seam and is otherwise verbatim apart from path aliasing");

  const run = makeRealHomeRunner(t, sandbox, entrypoint, project);
  const harnessHome = harnessHomeTargets(t);
  const fingerprintStarted = performance.now();
  const homesBefore = await fingerprintRoots(harnessHome.targets);
  t.note(`harness-home fingerprint taken before the first doctor step: ${harnessHome.targets.length} targets (${Math.round(performance.now() - fingerprintStarted)} ms)`);

  // discovery
  const discoveryJson = run("doctor --discovery <project> --json (real home, sandbox state)", ["doctor", "--discovery", project, "--json"]);
  run("doctor --discovery <project> (human form)", ["doctor", "--discovery", project]);
  const discovery = parseJson(discoveryJson.stdout);
  const discoveryRows = Array.isArray(discovery?.rows) ? discovery.rows : [];
  t.note(`discovery JSON: exit=${discoveryJson.status}; packs=${Array.isArray(discovery?.packs) ? discovery.packs.join(", ") : "n/a"}; ${discoveryRows.length} rows; harnesses with rows: ${[...new Set(discoveryRows.map((row) => row.harness))].sort().join(", ") || "none"}`);
  for (const harness of HARNESSES) {
    const rows = discoveryRows.filter((row) => row.harness === harness);
    const states = rows.map(rowState).join("; ");
    if (rows.length === 0) {
      t.check(`life02.discovery.${harness}`, "VIOLATED", discovery ? "absent from discovery rows" : `discovery did not return JSON (exit=${discoveryJson.status})`);
    } else if (rows.some((row) => row.completeness === "COMPLETE")) {
      t.check(`life02.discovery.${harness}`, "HOLDS", `COMPLETE discovery row: ${states}`);
    } else if (rows.every((row) => spendText.test(`${row.notRunReason ?? ""} ${row.axisNotes?.nativeUse ?? ""}`))) {
      t.check(`life02.discovery.${harness}`, "NOT-OBSERVED", `not executed (cost): ${states}`);
    } else {
      t.check(`life02.discovery.${harness}`, "VIOLATED", states);
    }
  }

  // canary --no-spend
  const planningRoot = join(project, ".planning");
  const vaultBefore = new Set(gitLines(["-C", project, "status", "--porcelain", "--untracked-files=all", "--ignored"]));
  const planningBefore = await fingerprintRoots([planningRoot]);
  const canaryJson = run("doctor --canary <project> --no-spend --json (real home, sandbox state)", ["doctor", "--canary", project, "--no-spend", "--json"]);
  const planningMid = await fingerprintRoots([planningRoot]);
  const planningFirst = compareFingerprints(t, "scratch project .planning across canary --no-spend --json", planningBefore, planningMid);
  run("doctor --canary <project> --no-spend (human form)", ["doctor", "--canary", project, "--no-spend"]);
  const planningAfter = await fingerprintRoots([planningRoot]);
  const planningSecond = compareFingerprints(t, "scratch project .planning across canary --no-spend (human)", planningMid, planningAfter);
  const vaultAfter = gitLines(["-C", project, "status", "--porcelain", "--untracked-files=all", "--ignored"]);
  const newPaths = vaultAfter.filter((line) => !vaultBefore.has(line));

  const afterStarted = performance.now();
  const homesAfter = await fingerprintRoots(harnessHome.targets);
  t.note(`harness-home fingerprint taken after the last canary step (${Math.round(performance.now() - afterStarted)} ms)`);

  const canary = parseJson(canaryJson.stdout);
  const results = Array.isArray(canary?.results) ? canary.results : [];
  const handoffs = Array.isArray(canary?.handoffResults) ? canary.handoffResults : [];
  const skipped = Array.isArray(canary?.skipped) ? canary.skipped : [];
  t.note(`canary JSON: exit=${canaryJson.status}; spend=${String(canary?.spend)}; results=${results.length}; handoffResults=${handoffs.length}; skipped=${skipped.length}; retainedRuntimes=${Array.isArray(canary?.retainedRuntimes) ? canary.retainedRuntimes.length : "n/a"}`);
  for (const line of Array.isArray(canary?.cost) ? canary.cost : []) t.note(`canary cost line: ${line}`);

  // The --json envelope passes the CLI's redaction seam, which prints a shared
  // object reference (one canary declaration selected for two harnesses, one
  // handoff pair used by two handoff canaries) as "[redacted:cycle]" on its
  // second appearance. The per-row fields are primitives and survive, so legs
  // are classified from rows[]; results/handoffResults only supply launches.
  const rows = Array.isArray(canary?.rows) ? canary.rows : [];
  const cycleMarkers = (JSON.stringify(canary ?? null).match(/\[redacted:cycle\]/gu) ?? []).length;
  const pairLabel = (handoff) => (handoff.pair && typeof handoff.pair === "object"
    ? `source ${handoff.pair.source}, target ${handoff.pair.target}`
    : `pair ${JSON.stringify(handoff.pair)}`);
  handoffs.forEach((handoff, index) => {
    t.note(`handoff ${index + 1}: ${handoff.capability} (${handoff.canary}) ${pairLabel(handoff)}; free legs completeness=${handoff.unit?.completeness ?? "null"}, recalled=${String(handoff.recalled)}; receiving leg ${handoff.receiving === null ? "not attempted" : "attempted"}`);
  });
  const handoffSources = new Set(handoffs
    .map((handoff) => (handoff.pair && typeof handoff.pair === "object" ? handoff.pair.source : null))
    .filter(Boolean));

  const spendLegs = [];
  for (const harness of HARNESSES) {
    const legs = [];
    let launchedComplete = 0;
    for (const result of results.filter((entry) => entry.harness === harness)) {
      legs.push(`${result.capability} (${result.canary}) ran: outcome=${result.outcome} launched=${String(result.launched)}`);
      if (result.launched === true && result.outcome === "ready") launchedComplete += 1;
    }
    for (const handoff of handoffs) {
      const receiving = handoff.receiving;
      if (receiving && typeof receiving === "object" && receiving.harness === harness && receiving.launched === true && receiving.outcome === "ready") {
        launchedComplete += 1;
      }
    }
    for (const row of rows.filter((entry) => entry.harness === harness)) {
      legs.push(`${row.capability}: evidence=${row.completeness ?? "-"} nativeUse=${row.axes?.nativeUse ?? "null"} (${row.axisNotes?.nativeUse ?? "no note"})`);
    }
    if (handoffSources.has(harness)) {
      legs.push("CAPA-03 handoff source: alpha-AOS writes the vault memory on this harness's behalf; this harness is not launched");
    }
    t.check(
      `life02.canary.${harness}.no-spend-execution`,
      launchedComplete > 0 ? "HOLDS" : "VIOLATED",
      legs.length === 0
        ? "no canary leg is declared for this harness, so no no-spend leg launched its native surface"
        : `${launchedComplete > 0 ? "" : "no no-spend leg launched this harness's own native surface; "}legs: ${legs.join("; ")}`,
    );
  }
  for (const row of rows) {
    if (/spends a model turn/iu.test(String(row.axisNotes?.nativeUse ?? ""))) {
      spendLegs.push(`${row.harness}:${row.capability}${row.completeness ? " receiving leg" : ""}`);
    }
  }
  t.check(
    "life02.canary.json-cycle-markers",
    "OBSERVED",
    `the canary --json envelope carries ${cycleMarkers} "[redacted:cycle]" marker(s) where a shared object reference appears a second time (skipped[].selection for the second harness sharing a declaration, handoffResults[].pair for the second handoff sharing a pair); rows[] keep harness and capability`,
  );
  t.check("life02.canary.spend-legs", "OBSERVED", `not executed (cost): ${spendLegs.length > 0 ? spendLegs.join(", ") : "none reported"}`);

  const planningUnchanged = planningFirst && planningSecond;
  t.check(
    "life02.canary.planning-unchanged",
    planningUnchanged ? "HOLDS" : "VIOLATED",
    planningUnchanged
      ? "the scratch project's .planning fingerprint is equal before and after both canary runs"
      : "the scratch project's .planning tree changed across a canary run; drift lines above",
  );
  const newPathNames = newPaths.map((line) => line.slice(3).replace(/mem_[A-Za-z0-9_-]+\.md$/u, "mem_<id>.md"));
  t.check(
    "life02.canary.vault-writes",
    "OBSERVED",
    `new paths under the scratch project after both canary runs (expected product behavior in the given project, not a mutation of the user's tree): ${newPathNames.length > 0 ? newPathNames.join(", ") : "none"}`,
  );

  // repository unchanged
  const repoAfter = runCommand(t, {
    label: "real repository porcelain after",
    executable: "git",
    args: ["-C", repositoryRoot, "status", "--porcelain"],
  });
  const repoSame = repoBefore.stdout === repoAfter.stdout;
  t.check(
    "life02.repo-unchanged",
    repoSame ? "HOLDS" : "VIOLATED",
    repoSame ? "git status --porcelain of the real repository is identical before and after the doctor steps" : "the real repository porcelain output changed; both step outputs above",
  );

  // harness homes
  const homesEqual = compareFingerprints(t, "real harness homes across the doctor steps", homesBefore, homesAfter);
  const drifted = harnessHome.targets.filter((target) => homesBefore.digests.get(target) !== homesAfter.digests.get(target));
  const driftLabels = drifted.map((target) => harnessHome.labels.get(target));
  const managedDrift = driftLabels.filter((entry) => entry?.managed);
  if (homesEqual && drifted.length === 0) {
    t.check("life02.harness-homes-unchanged", "HOLDS", `no fingerprinted harness-home child drifted (${harnessHome.targets.length} targets; exclusions in notes)`);
  } else if (managedDrift.length > 0) {
    t.check("life02.harness-homes-unchanged", "VIOLATED", `alpha-AOS-managed paths drifted: ${managedDrift.map((entry) => `${entry.root}/${entry.name}`).join(", ")}`);
  } else {
    const roots = [...new Set(driftLabels.map((entry) => entry?.root ?? "?"))].sort();
    t.note(`harness-native drifted entries: ${driftLabels.map((entry) => `${entry?.root}/${entry?.name}`).join(", ") || "vanished entries only"}`);
    t.check("life02.harness-homes-unchanged", "OBSERVED", `harness-native drift in ${roots.join(", ") || "vanished entries"}`);
  }
});
