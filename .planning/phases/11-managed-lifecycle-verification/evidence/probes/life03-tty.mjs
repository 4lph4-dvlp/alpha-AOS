// LIFE-03 interactive confirmation through a real pseudo-terminal. Runs under
// WSL Linux node (util-linux `script` provides the pty):
//
//   wsl.exe --cd <repo> -e sh -c 'node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-tty.mjs'
//
// Re-run: add `--out <scratch>` and compare `grep '^CHECK'` of the output with
// the committed transcript.
//
// `uninstall --target codex --apply` without `--yes` prints
// `Proceed with uninstall? [y/N] ` when stdin is a TTY (src/cli.ts). The probe
// answers `n` (abort, no byte change) and then `y` (proceeds) through
// `script -q -e -c <command line> /dev/null`, with the sandbox env checked by
// assertSandboxEnv before each spawn. One journaled managed file is created
// first with `codex-policy sync --apply`, so the `y` answer has a file to remove.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertSandboxEnv,
  newScratch,
  npmInvocation,
  repositoryRoot,
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  runCli,
  runCommand,
  runProbe,
} from "./probe-lib.mjs";

if (process.platform !== "linux") {
  process.stderr.write("life03-tty.mjs runs under WSL/Linux only (it needs util-linux script for a pseudo-terminal)\n");
  process.exit(1);
}

const SCRIPT = "/usr/sbin/script";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

await runProbe("life03-tty", evidencePath("life03-tty.txt"), async (t) => {
  t.note("the host guard targets resolve against the WSL Linux home (<home>), not the Windows profile; the sandbox lives under the Linux os.tmpdir() (<tmp>)");
  if (!existsSync(SCRIPT)) {
    for (const id of ["prompt-shown", "no-aborts", "yes-proceeds"]) {
      t.check(`life03.tty.${id}`, "NOT-OBSERVED", `${SCRIPT} is not available, so no pseudo-terminal could be opened; the non-TTY refusal is covered by life03.guard.non-tty-refuses`);
    }
    return;
  }
  // npm 11+ under WSL (npm 12 here) prints `npm pack --json` as an object keyed
  // by package name rather than an array, which probe-lib packOnce does not
  // parse. The probe packs once itself, accepts both shapes, and hands the
  // tarball to packOnce through ALPHA_AOS_P11_TARBALL (the documented reuse
  // path), so the tarball digest header is still written by probe-lib.
  if (!process.env.ALPHA_AOS_P11_TARBALL?.trim()) {
    const packRoot = await newScratch("tty-pack", "<pack>");
    const npm = npmInvocation();
    const args = ["pack", repositoryRoot, "--ignore-scripts", "--json", "--pack-destination", packRoot];
    const packed = runCommand(t, {
      label: "npm pack the repository (probe-local, npm 11+ JSON shape)",
      executable: npm.executable,
      args: [...npm.argsPrefix, ...args],
      cwd: packRoot,
      display: ["npm", ...args].join(" "),
    });
    if (packed.status !== 0) throw new Error("npm pack failed");
    const report = JSON.parse(packed.stdout);
    const entries = Array.isArray(report) ? report : Object.values(report);
    if (entries.length !== 1 || typeof entries[0]?.filename !== "string") throw new Error("npm pack did not report exactly one tarball");
    process.env.ALPHA_AOS_P11_TARBALL = join(packRoot, entries[0].filename);
    t.note("the tarball was packed by the step above (npm 11+ prints `npm pack --json` as an object, which probe-lib packOnce does not parse) and handed to packOnce through ALPHA_AOS_P11_TARBALL, so the next note is expected");
  }
  const { tarballPath } = await packOnce(t);
  // installPackedRelease installs with --prefer-offline against the WSL npm
  // cache, which serves a stale packument when the cache predates a locked
  // dependency version (ETARGET). The direct dependencies are refreshed into
  // that cache first; this writes only to the npm cache.
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const npmForCache = npmInvocation();
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    const warm = runCommand(t, {
      label: `refresh the WSL npm cache for ${name}@${version}`,
      executable: npmForCache.executable,
      args: [...npmForCache.argsPrefix, "cache", "add", `${name}@${version}`],
      display: `npm cache add ${name}@${version}`,
    });
    if (warm.status !== 0) t.note(`npm cache add ${name}@${version} exit=${warm.status}`);
  }
  const sandbox = await newSandbox("life03-tty");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  t.note(`packed release installed into the sandbox prefix (channel ${String(release.installedLock.channel)}) with the WSL npm cache`);

  const policy = runCli(t, sandbox, ["codex-policy", "sync", "--apply", "--json"], { label: "codex-policy sync --apply (creates one journaled managed file)" });
  const agents = join(sandbox.env.CODEX_HOME, "AGENTS.md");
  t.check("life03.tty.setup", existsSync(agents) ? "OBSERVED" : "NOT-OBSERVED", `codex-policy sync --apply exit=${policy.status}; ${agents} ${existsSync(agents) ? "present" : "absent"}`);

  const cli = sandbox.resolveCli();
  const commandLine = `${shellQuote(cli)} uninstall --target codex --apply`;
  const roots = [sandbox.home, sandbox.state, sandbox.prefix];

  function viaPty(label, answer) {
    assertSandboxEnv(sandbox.env, sandbox.root);
    return runCommand(t, {
      label,
      executable: SCRIPT,
      args: ["-q", "-e", "-c", commandLine, "/dev/null"],
      env: sandbox.env,
      cwd: sandbox.repo,
      input: `${answer}\n`,
      timeoutMs: 120_000,
    });
  }

  // answer n
  const before = await fingerprintRoots(roots);
  const no = viaPty("pty: uninstall --target codex --apply without --yes, answering n", "n");
  const after = await fingerprintRoots(roots);
  const equal = compareFingerprints(t, "sandbox home+state+prefix across the n answer", before, after);
  const prompt = no.stdout.includes("Proceed with uninstall? [y/N]");
  t.check(
    "life03.tty.prompt-shown",
    prompt ? "HOLDS" : "VIOLATED",
    `script exit=${no.status}; the pty output ${prompt ? "carries" : "lacks"} "Proceed with uninstall? [y/N]"`,
  );
  const aborted = no.stdout.includes("Uninstall aborted.");
  t.check(
    "life03.tty.no-aborts",
    aborted && equal && existsSync(agents) ? "HOLDS" : "VIOLATED",
    `the pty output ${aborted ? "carries" : "lacks"} "Uninstall aborted."; sandbox digests ${equal ? "unchanged" : "changed"}; codex AGENTS.md ${existsSync(agents) ? "still present" : "gone"}`,
  );

  // answer y
  const yes = viaPty("pty: uninstall --target codex --apply without --yes, answering y", "y");
  const proceeded = yes.status === 0 && !existsSync(agents);
  t.check(
    "life03.tty.yes-proceeds",
    proceeded ? "HOLDS" : "VIOLATED",
    `script exit=${yes.status}; prompt ${yes.stdout.includes("Proceed with uninstall? [y/N]") ? "shown" : "not shown"}; codex AGENTS.md (the codex policy file) ${existsSync(agents) ? "still present" : "removed"}`,
  );
});
