// LIFE-02 status probe: offline and fast `status`, coded `doctor` findings,
// and the needs-repair guidance, all through the packed CLI.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life02-status.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// Oracles (D-04):
// - offline: the packed CLI entrypoint runs under `node --import` of the
//   checkout's compiled I/O trap (dist/test/helpers/io-trap-preload.js), which
//   patches child_process, net, tls, dns, http, https and fetch and calls
//   syncBuiltinESMExports so ESM named imports are trapped too. Two positive
//   controls (inventory spawns, a loopback fetch) prove the trap records; if a
//   control records nothing the zero-call checks are NOT-OBSERVED.
// - fast: the in-process getOfflineStatus median of 10 calls on a POPULATED
//   state root (after a packed Codex install) against the Phase 6 50 ms
//   interpretation. Packed CLI wall times are notes, never CHECK details.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import {
  assertSandboxEnv,
  evidencePath,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  repositoryRoot,
  runCli,
  runCommand,
  runInstalledCli,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

const preloadPath = join(repositoryRoot, "dist", "test", "helpers", "io-trap-preload.js");
const NETWORK_PREFIXES = ["net.", "tls.", "dns.", "http.", "https."];

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function trapLines(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8").split(/\r?\n/u).filter((line) => line.length > 0);
}

function tally(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([line, count]) => `${line} x${count}`).join(", ");
}

const isNetwork = (line) => line === "fetch" || NETWORK_PREFIXES.some((prefix) => line.startsWith(prefix));
const isSpawn = (line) => line.startsWith("child_process.");

await runProbe("life02-status", evidencePath("life02-status.txt"), async (t) => {
  if (!existsSync(preloadPath)) throw new Error("dist/test/helpers/io-trap-preload.js is missing: run npm run build first");
  const { tarballPath } = await packOnce(t);
  const sandbox = await newSandbox("life02");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  t.note(`packed release installed into <sandbox>/prefix with the host npm cache; installed lock channel: ${String(release.installedLock.channel)}`);
  await seedHarnessPrerequisites(sandbox, release, "codex");
  t.note("codex prerequisites seeded exactly as the CI packed lifecycle test does (GSD VERSION/.gsd-runtime/.gsd-profile, locked ECC runtime and skills, codex config.toml)");
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a lock or repository-owned digest printed by the CLI itself");

  const install = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "populate the state root: install --target codex --apply" });
  if (install.status !== 0) throw new Error("the packed codex install failed; the populated-state checks cannot run");
  t.note("the state root now holds the journals, snapshots and lock written by a real packed install (a populated state root, unlike the empty one the Phase 6 benchmark measures)");

  // (a) status after install
  const human = runCli(t, sandbox, ["status"], { label: "status (human) after install" });
  const jsonRun = runCli(t, sandbox, ["status", "--json"], { label: "status --json after install" });
  const report = jsonRun.status === 0 ? parseJson(jsonRun.stdout) : null;
  const okAfterInstall = human.status === 0 && jsonRun.status === 0 && report?.needsRepair === false;
  t.check(
    "life02.status.ok-after-install",
    okAfterInstall ? "HOLDS" : "VIOLATED",
    `status exit=${human.status} (${/STATUS: OK/u.test(human.stdout) ? "prints STATUS: OK" : "no STATUS: OK line"}); status --json exit=${jsonRun.status}, needsRepair=${String(report?.needsRepair)}, managedStatePresent=${String(report?.managedStatePresent)}, writerStatus=${String(report?.writerStatus)}`,
  );

  // (b) packed CLI wall times, ten runs
  assertSandboxEnv(sandbox.env, sandbox.root);
  const wall = [];
  const exits = [];
  for (let index = 0; index < 10; index += 1) {
    const started = performance.now();
    const run = runInstalledCli(sandbox.resolveCli(), sandbox.prefix, ["status", "--json"], sandbox.env, { cwd: sandbox.repo });
    wall.push(performance.now() - started);
    exits.push(run.status);
  }
  t.note(`packed CLI status --json x10 wall ms (process start to exit, includes Node startup and catalog/lock load): min=${Math.min(...wall).toFixed(1)} median=${median(wall).toFixed(1)} max=${Math.max(...wall).toFixed(1)}; exit codes: ${exits.join(",")}`);
  t.check("life02.status.cli-timing", "OBSERVED", `wall times in note; 10 packed CLI runs of status --json, exit codes ${[...new Set(exits)].join("/")}`);

  // (c) in-process getOfflineStatus on the populated state root, using the INSTALLED package
  const statusModule = await import(pathToFileURL(join(release.installedPackage, "dist", "src", "core", "status.js")).href);
  const catalogModule = await import(pathToFileURL(join(release.installedPackage, "dist", "src", "core", "catalog.js")).href);
  const catalog = await catalogModule.loadCatalog(release.installedPackage);
  const lock = await catalogModule.loadLock(release.installedPackage);
  const inProcess = [];
  let lastStatus = null;
  for (let index = 0; index < 10; index += 1) {
    const started = performance.now();
    lastStatus = await statusModule.getOfflineStatus(sandbox.state, catalog, lock);
    inProcess.push(performance.now() - started);
  }
  const inProcessMedian = median(inProcess);
  t.note(`in-process getOfflineStatus x10 on <sandbox>/state (installed package modules, installed catalog and stable lock) ms: min=${Math.min(...inProcess).toFixed(2)} median=${inProcessMedian.toFixed(2)} max=${Math.max(...inProcess).toFixed(2)}`);
  t.check(
    "life02.status.in-process-under-50ms",
    inProcessMedian < 50 ? "HOLDS" : "VIOLATED",
    `median of 10 in-process calls on the populated state root is ${inProcessMedian < 50 ? "below" : "not below"} the Phase 6 fifty-millisecond interpretation (figures in note); needsRepair=${String(lastStatus?.needsRepair)}`,
  );

  // (d) the I/O trap on the packed entrypoint, with two positive controls
  const trapDir = join(sandbox.root, "trap");
  await mkdir(trapDir, { recursive: true });
  const preloadUrl = pathToFileURL(preloadPath).href;
  const entrypoint = join(release.installedPackage, "dist", "src", "cli.js");
  const trapRun = (label, name, args) => {
    const logPath = join(trapDir, `${name}.log`);
    const env = { ...sandbox.env, ALPHA_AOS_IO_TRAP_LOG: logPath };
    assertSandboxEnv(env, sandbox.root);
    const result = runCommand(t, {
      label,
      executable: process.execPath,
      args: ["--import", preloadUrl, ...args],
      env,
      cwd: sandbox.repo,
      display: ["node", "--import", preloadUrl, ...args].map((value) => (/[\s"]/u.test(value) ? JSON.stringify(value) : value)).join(" "),
      envOverrides: ["ALPHA_AOS_IO_TRAP_LOG"],
    });
    const lines = trapLines(logPath);
    t.note(`trap log ${name}: ${lines.length} line(s)${lines.length > 0 ? `: ${tally(lines)}` : ""}`);
    return { result, lines };
  };
  t.note("the trap is the checkout's compiled test/helpers/io-trap-preload.ts; the traced program is the packed release entrypoint <sandbox>/prefix/.../alpha-aos/dist/src/cli.js");
  const trappedStatus = trapRun("trapped: status --json (packed entrypoint)", "status", [entrypoint, "status", "--json"]);
  const spawnControl = trapRun("trap control: inventory --json (packed entrypoint, spawns version probes)", "inventory", [entrypoint, "inventory", "--json"]);
  const networkControl = trapRun(
    "trap control: loopback fetch to 127.0.0.1 port 9 (error swallowed)",
    "fetch",
    ["--input-type=module", "-e", "try { await fetch(\"http://127.0.0.1:9/\", { signal: AbortSignal.timeout(5000) }); } catch {}"],
  );
  const spawnValid = spawnControl.lines.some(isSpawn);
  const networkValid = networkControl.lines.some(isNetwork);
  t.check(
    "life02.status.trap-control-spawn",
    spawnValid ? "HOLDS" : "VIOLATED",
    `inventory --json exit=${spawnControl.result.status}; child_process lines recorded: ${spawnControl.lines.filter(isSpawn).length > 0 ? "yes" : "none"}`,
  );
  t.check(
    "life02.status.trap-control-network",
    networkValid ? "HOLDS" : "VIOLATED",
    `loopback fetch control exit=${networkControl.result.status}; network lines recorded: ${networkValid ? [...new Set(networkControl.lines.filter(isNetwork))].join(", ") : "none"}`,
  );
  const statusSpawns = trappedStatus.lines.filter(isSpawn);
  const statusNetwork = trappedStatus.lines.filter(isNetwork);
  const trappedReport = trappedStatus.result.status === 0 ? parseJson(trappedStatus.result.stdout) : null;
  if (!spawnValid || !networkValid) {
    const why = "a positive control recorded nothing, so the trap is not proven to record";
    t.check("life02.status.zero-subprocess", "NOT-OBSERVED", why);
    t.check("life02.status.zero-network", "NOT-OBSERVED", why);
  } else {
    t.check(
      "life02.status.zero-subprocess",
      statusSpawns.length === 0 ? "HOLDS" : "VIOLATED",
      statusSpawns.length === 0
        ? `packed status --json exit=${trappedStatus.result.status}, needsRepair=${String(trappedReport?.needsRepair)}; the trap log holds no child_process line`
        : `packed status --json recorded: ${tally(statusSpawns)}`,
    );
    t.check(
      "life02.status.zero-network",
      statusNetwork.length === 0 ? "HOLDS" : "VIOLATED",
      statusNetwork.length === 0
        ? "the trap log holds no net, tls, dns, http, https or fetch line"
        : `packed status --json recorded: ${tally(statusNetwork)}`,
    );
  }

  // (e) doctor --json on the healthy sandbox
  const doctorHealthy = runCli(t, sandbox, ["doctor", "--json"], { label: "doctor --json on the healthy sandbox" });
  const findings = parseJson(doctorHealthy.stdout);
  if (!Array.isArray(findings)) {
    t.check("life02.doctor.coded", "VIOLATED", `doctor --json exit=${doctorHealthy.status}; stdout is not a JSON findings array`);
  } else {
    const uncoded = findings.filter((finding) => typeof finding?.code !== "string" || finding.code.length === 0
      || typeof finding?.level !== "string" || finding.level.length === 0);
    const levels = [...new Set(findings.map((finding) => finding?.level))].join("/");
    t.check(
      "life02.doctor.coded",
      findings.length > 0 && uncoded.length === 0 ? "HOLDS" : "VIOLATED",
      `doctor --json exit=${doctorHealthy.status}; ${findings.length} findings, ${uncoded.length} without a non-empty code and level; levels seen: ${levels}; codes: ${findings.map((finding) => finding?.code).join(", ")}`,
    );
  }

  // (f) a deliberately corrupt journal
  const corruptPath = join(sandbox.state, "journal", "p11-corrupt.json");
  await mkdir(join(sandbox.state, "journal"), { recursive: true });
  await writeFile(corruptPath, "{not json", "utf8");
  t.note("wrote <sandbox>/state/journal/p11-corrupt.json with the 9 bytes `{not json` (synthetic, non-secret)");
  const corruptHuman = runCli(t, sandbox, ["status"], { label: "status (human) with a corrupt journal" });
  const corruptJsonRun = runCli(t, sandbox, ["status", "--json"], { label: "status --json with a corrupt journal" });
  const corruptReport = parseJson(corruptJsonRun.stdout);
  const guidance = corruptHuman.stdout.split(/\r?\n/u).find((line) => line.startsWith("STATUS:")) ?? "";
  t.note(`status guidance line (verbatim): ${guidance || "(none)"}`);
  const needsRepair = corruptHuman.status === 1 && corruptJsonRun.status === 1 && corruptReport?.needsRepair === true;
  t.check(
    "life02.status.needs-repair",
    needsRepair ? "HOLDS" : "VIOLATED",
    `status exit=${corruptHuman.status}; status --json exit=${corruptJsonRun.status}, needsRepair=${String(corruptReport?.needsRepair)}, corruptJournals=${JSON.stringify(corruptReport?.corruptJournals ?? null)}`,
  );

  const doctorCorrupt = runCli(t, sandbox, ["doctor", "--json"], { label: "doctor --json with a corrupt journal" });
  const corruptFindings = parseJson(doctorCorrupt.stdout);
  const flagged = Array.isArray(corruptFindings)
    ? corruptFindings.filter((finding) => (finding?.level === "error" || finding?.level === "warning")
      && /journal|repair|corrupt|transaction/iu.test(`${finding?.code ?? ""} ${finding?.message ?? ""}`))
    : [];
  const warnOrError = Array.isArray(corruptFindings)
    ? corruptFindings.filter((finding) => finding?.level === "error" || finding?.level === "warning").map((finding) => `${finding.level}:${finding.code}`)
    : [];
  t.check(
    "life02.doctor.flags-corrupt-journal",
    flagged.length > 0 ? "HOLDS" : "VIOLATED",
    flagged.length > 0
      ? `doctor --json exit=${doctorCorrupt.status}; journal finding(s): ${flagged.map((finding) => `${finding.level}:${finding.code}`).join(", ")}`
      : `doctor --json exit=${doctorCorrupt.status}; no error- or warning-level finding names the journal problem; error/warning findings present: ${warnOrError.join(", ") || "none"}`,
  );

  const commandPattern = /alpha-aos\s+([a-z][a-z-]*)/u;
  const findingCommand = flagged.map((finding) => commandPattern.exec(String(finding?.message ?? ""))).find((match) => match);
  const guidanceCommand = commandPattern.exec(guidance);
  const named = findingCommand ?? guidanceCommand;
  let dryRunNote = "";
  if (named) {
    const dryRun = runCli(t, sandbox, [named[1], "--json"], { label: `dry-run of the named command: ${named[1]} --json` });
    const plan = parseJson(dryRun.stdout);
    dryRunNote = `; dry-run \`alpha-aos ${named[1]} --json\` exit=${dryRun.status}`;
    t.note(`the guidance command ran as a dry-run: exit=${dryRun.status}; planned action: ${plan && typeof plan === "object" ? String(plan.action) : "not JSON"}; affectedFiles: ${Array.isArray(plan?.affectedFiles) ? plan.affectedFiles.length : "n/a"}; blockedReasons: ${Array.isArray(plan?.blockedReasons) ? plan.blockedReasons.length : "n/a"} (the repair plan itself is judged under LIFE-06, plan 11-06)`);
  }
  t.check(
    "life02.doctor.actionable",
    named ? "HOLDS" : "VIOLATED",
    named
      ? `${findingCommand ? "the doctor finding" : "the status guidance (not a doctor finding)"} names the runnable command \`alpha-aos ${named[1]}\`${dryRunNote}`
      : "neither a journal finding nor the status guidance names an alpha-aos command",
  );
});
