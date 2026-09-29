// LIFE-07 evidence through the packed CLI: is the user shown verified external
// package changes, and component-specific recovery instructions when
// managed-file rollback cannot safely reverse GSD, ECC, npm-link or Pi bridge
// state?
//
// 1. Real external change: alpha-AOS itself installs the locked ECC runtime
//    into the sandbox npm prefix (nothing pre-seeded); the human and the JSON
//    output are compared with the installed package version on disk.
// 2. Induced failure after the external change: an alpha-AOS-owned step that
//    runs after `ecc:runtime` is made to fail, and the error output and any
//    recovery receipt are compared with the stable lock.
// 3. Pi bridge: alpha-AOS runs `pi install` for the locked bridge against the
//    sandbox Pi agent directory.
// 4. Compensation commands: `uninstall --all` preview and apply after a codex
//    and pi install; the recovery receipt's commands are compared with the
//    stable lock's package names and install paths.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life07-external.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
// Needs the npm registry (the ECC runtime and ECC skill fixture) and the Pi CLI
// on PATH (step 3); without them the dependent checks are NOT-OBSERVED.
//
// Every expected package name and path is read from the installed package's
// catalog/stack.lock.json (and its package.json for the npm-link name), never
// typed here. Compensation commands quoted in CHECK details are
// product-generated instructions, not user data.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  harnessPaths,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  runCli,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

function sha12(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function firstLine(value) {
  return String(value).split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

function parseJson(result) {
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function globalPackageDir(sandbox, name) {
  return process.platform === "win32"
    ? join(sandbox.prefix, "node_modules", ...name.split("/"))
    : join(sandbox.prefix, "lib", "node_modules", ...name.split("/"));
}

async function installedVersion(path) {
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return typeof value.version === "string" ? value.version : null;
  } catch {
    return null;
  }
}

/** Every file under <state>/receipts, by path and 12-hex hash. */
async function receiptFiles(sandbox) {
  const dir = join(sandbox.state, "receipts");
  if (!existsSync(dir)) return [];
  const result = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name);
    const bytes = await readFile(path);
    let parsed = null;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      parsed = null;
    }
    result.push({ name, path, sha: sha12(bytes), parsed });
  }
  return result;
}

/** Lock-grounded expectations, each with the field it came from. */
async function expectations(release) {
  const lock = release.installedLock;
  const manifest = JSON.parse(await readFile(join(release.installedPackage, "package.json"), "utf8"));
  const expected = {
    eccPackage: String(lock.components?.ecc?.package),
    eccVersion: String(lock.components?.ecc?.version),
    piPackage: String(lock.components?.mcpBridges?.pi?.package),
    piVersion: String(lock.components?.mcpBridges?.pi?.version),
    gsdPackage: String(lock.components?.gsd?.package),
    gsdVersion: String(lock.components?.gsd?.version),
    gsdProfile: String(lock.components?.gsd?.profile),
    linkName: String(manifest.name),
  };
  return expected;
}

/** GSD version files and the codex MCP config only; the ECC runtime and ECC skills stay absent. */
async function seedCodexGsdAndMcp(sandbox, release, expected) {
  const paths = harnessPaths(sandbox, "codex", release.installedLock);
  await mkdir(join(paths.gsdRoot, "gsd-core"), { recursive: true });
  await writeFile(join(paths.gsdRoot, "gsd-core", "VERSION"), `${expected.gsdVersion}\n`, "utf8");
  await writeFile(join(paths.gsdRoot, "gsd-core", ".gsd-runtime"), "codex\n", "utf8");
  await writeFile(join(paths.gsdRoot, ".gsd-profile"), `${expected.gsdProfile}\n`, "utf8");
  const { renderMcpConfig } = await import(pathToFileURL(join(release.installedPackage, "dist", "src", "core", "mcp.js")).href);
  await mkdir(dirname(paths.mcpConfigPath), { recursive: true });
  await writeFile(paths.mcpConfigPath, renderMcpConfig("codex", "", release.installedLock), "utf8");
  return paths;
}

async function freshCodexSandbox(t, tarballPath, cache, label) {
  const sandbox = await newSandbox(`life07-${label}`);
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
  const expected = await expectations(release);
  const paths = await seedCodexGsdAndMcp(sandbox, release, expected);
  const eccDir = globalPackageDir(sandbox, expected.eccPackage);
  t.note(`${label}: seeded only the codex GSD version files (${paths.gsdRoot}/gsd-core) and the codex MCP config rendered by the packed renderMcpConfig; ${expected.eccPackage} present in the sandbox prefix before install: ${existsSync(join(eccDir, "package.json"))}`);
  return { sandbox, release, expected, paths, eccDir };
}

function stepOrder(result) {
  const plan = parseJson(result);
  return plan ? plan.steps.map((step) => `${step.id}=${step.action}`) : null;
}

const RECOVERY_VERB = /\b(uninstall|remove|revert|rollback|roll back|restore|unlink|rm -rf)\b/iu;

await runProbe("life07-external", evidencePath("life07-external.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const cache = hostNpmCache();
  t.note("sandbox aliases in order: <sandbox> step 1 human-output install; <sandbox-2> step 1 JSON-output twin; <sandbox-3>.. step 2 induced-failure attempts; then the step 3 Pi bridge sandbox and the step 4 compensation sandbox (their alias numbers follow the attempts and are named in the notes)");
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a plan digest or lock digest printed by the CLI itself");

  // ------------------------------------------------------------ 1. real external change
  const human = await freshCodexSandbox(t, tarballPath, cache, "external-human");
  const expected = human.expected;
  t.note(`expected values read from <installed package>/catalog/stack.lock.json and package.json: components.ecc.package=${expected.eccPackage}, components.ecc.version=${expected.eccVersion}; components.mcpBridges.pi.package=${expected.piPackage}, components.mcpBridges.pi.version=${expected.piVersion}; components.gsd.package=${expected.gsdPackage}, components.gsd.version=${expected.gsdVersion} (installs under <config root>/gsd-core, src/core/install.ts inspectGsdInstall); package.json name=${expected.linkName} (the npm-link name)`);
  runCli(t, human.sandbox, ["install", "--target", "codex", "--json"], { label: "external-human: install --target codex --json (dry-run step order)" });
  const humanApply = runCli(t, human.sandbox, ["install", "--target", "codex", "--apply"], { label: "external-human: install --target codex --apply" });
  const twin = await freshCodexSandbox(t, tarballPath, cache, "external-json");
  const jsonApply = runCli(t, twin.sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "external-json: install --target codex --apply --json" });
  const jsonResult = parseJson(jsonApply);

  const externalLine = humanApply.stdout.split(/\r?\n/u).find((line) => line.startsWith("External verified changes retained outside journal rollback:")) ?? "";
  const humanNames = externalLine.includes("ecc:runtime");
  const jsonNames = Array.isArray(jsonResult?.externalChanges) && jsonResult.externalChanges.includes("ecc:runtime");
  const registryProblem = humanApply.status !== 0 && /ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|network/iu.test(humanApply.stderr);
  if (humanApply.status !== 0 && registryProblem) {
    t.check("life07.external.shown", "NOT-OBSERVED", `install exit=${humanApply.status}; registry unreachable: "${firstLine(humanApply.stderr)}"`);
  } else {
    t.check(
      "life07.external.shown",
      humanApply.status === 0 && humanNames && jsonNames ? "HOLDS" : "VIOLATED",
      `human exit=${humanApply.status}, line "${externalLine || "absent"}"; json exit=${jsonApply.status}, externalChanges ${JSON.stringify(jsonResult?.externalChanges ?? null)}`,
    );
  }
  const versionHuman = await installedVersion(join(human.eccDir, "package.json"));
  const versionJson = await installedVersion(join(twin.eccDir, "package.json"));
  const matches = versionHuman === expected.eccVersion && versionJson === expected.eccVersion;
  t.check(
    "life07.external.verified",
    humanNames && jsonNames && matches ? "HOLDS" : humanNames || jsonNames ? "VIOLATED" : "NOT-OBSERVED",
    `reported ecc:runtime (human ${humanNames}, json ${jsonNames}); ${expected.eccPackage}/package.json in the sandbox prefix: version ${versionHuman ?? "absent"} (human sandbox), ${versionJson ?? "absent"} (json sandbox); locked ${expected.eccVersion}`,
  );
  const successText = `${humanApply.stdout}\n${humanApply.stderr}`;
  const namesPackage = successText.includes(expected.eccPackage);
  const namesVerb = RECOVERY_VERB.test(successText);
  const receiptsAfterSuccess = await receiptFiles(human.sandbox);
  t.check(
    "life07.external.recovery-shown",
    namesPackage && namesVerb ? "HOLDS" : "VIOLATED",
    `success output names ${expected.eccPackage}: ${namesPackage}; names a recovery action (uninstall/remove/revert/rollback/restore/unlink): ${namesVerb}; recovery receipts under <state>/receipts after the successful install: ${receiptsAfterSuccess.length}`,
  );

  // ------------------------------------------------------------ 2. induced failure after the external change
  const attempts = [
    {
      name: "directory at the ecc:codex target <home>/.agents/skills/deep-research/SKILL.md",
      block: async (sandbox) => mkdir(join(sandbox.home, ".agents", "skills", "deep-research", "SKILL.md"), { recursive: true }),
    },
    {
      name: "regular file at <home>/.agents/skills/deep-research, the directory the ecc:codex target is written into",
      block: async (sandbox) => {
        await mkdir(join(sandbox.home, ".agents", "skills"), { recursive: true });
        await writeFile(join(sandbox.home, ".agents", "skills", "deep-research"), "p11 blocker\n", "utf8");
      },
    },
  ];
  const tried = [];
  let chosen = null;
  for (const [index, attempt] of attempts.entries()) {
    const setup = await freshCodexSandbox(t, tarballPath, cache, `failure-${index + 1}`);
    const dry = runCli(t, setup.sandbox, ["install", "--target", "codex", "--json"], { label: `failure-${index + 1}: install --target codex --json (dry-run step order)` });
    const order = stepOrder(dry);
    await attempt.block(setup.sandbox);
    t.note(`failure-${index + 1}: dry-run step order ${order ? order.join(", ") : "unavailable"}; apply order runs gsd, ecc:runtime, then policy:codex-execution, owned skills, ecc:<target>, mcp (src/core/install.ts applyManagedInstall); blocker placed: ${attempt.name}`);
    const apply = runCli(t, setup.sandbox, ["install", "--target", "codex", "--apply"], { label: `failure-${index + 1}: install --target codex --apply (blocker: ${attempt.name})` });
    const eccVersion = await installedVersion(join(setup.eccDir, "package.json"));
    const outcome = { index: index + 1, attempt, setup, apply, eccVersion };
    tried.push(`attempt ${index + 1} (${attempt.name}): exit=${apply.status}; ${expected.eccPackage} in prefix after: ${eccVersion ?? "absent"}; stderr: "${firstLine(apply.stderr).replace(/\b[0-9a-f]{12,64}\b/gu, "<digest>")}"`);
    chosen = outcome;
    if (apply.status !== 0 && eccVersion !== null) break;
  }
  t.check("life07.failure.induced-step", "OBSERVED", tried.join(" || "));
  const failedAfterExternal = chosen.apply.status !== 0 && chosen.eccVersion !== null;
  const stderr = chosen.apply.stderr;
  const retainedNamed = /External verified changes retained/u.test(stderr) && stderr.includes("ecc:runtime");
  t.check(
    "life07.failure.names-external",
    failedAfterExternal ? (retainedNamed ? "HOLDS" : "VIOLATED") : "NOT-OBSERVED",
    failedAfterExternal
      ? `attempt ${chosen.index}: exit=${chosen.apply.status}; stderr ${retainedNamed ? "names" : "does not name"} "External verified changes retained" with ecc:runtime; ${expected.eccPackage}@${chosen.eccVersion} is on disk in the sandbox prefix`
      : "no attempt failed after the ECC runtime was installed; see life07.failure.induced-step",
  );
  const failureReceipts = await receiptFiles(chosen.setup.sandbox);
  const receiptText = failureReceipts.map((receipt) => JSON.stringify(receipt.parsed ?? {})).join("\n");
  const instructionText = `${stderr}\n${receiptText}`;
  const eccInstruction = instructionText.includes(expected.eccPackage) && RECOVERY_VERB.test(instructionText);
  t.check(
    "life07.failure.component-instructions",
    failedAfterExternal ? (eccInstruction ? "HOLDS" : "VIOLATED") : "NOT-OBSERVED",
    failedAfterExternal
      ? `stderr and receipts name ${expected.eccPackage}: ${instructionText.includes(expected.eccPackage)}; name a recovery action: ${RECOVERY_VERB.test(instructionText)}; the failure output gives ${eccInstruction ? "an" : "no"} ECC-specific recovery instruction`
      : "no failure after the external change was produced",
  );
  t.check(
    "life07.failure.receipt-written",
    "OBSERVED",
    failureReceipts.length > 0
      ? `recovery receipt(s) under <state>/receipts after the failed install: ${failureReceipts.map((receipt) => `${receipt.name} sha ${receipt.sha}`).join(", ")}`
      : "no recovery receipt under <state>/receipts after the failed install (the directory does not exist)",
  );

  // ------------------------------------------------------------ 3. Pi bridge
  {
    const sandbox = await newSandbox("life07-pi");
    t.note("pi: this sandbox follows the failure attempts in alias order");
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    const paths = await seedHarnessPrerequisites(sandbox, release, "pi", { eccCache: cache });
    await rm(paths.piBridgeManifest, { force: true });
    t.note(`pi: seeded pi (GSD, ECC runtime and skills, MCP config), then deleted the seeded bridge manifest ${paths.piBridgeManifest} so mcp-bridge:pi is not current`);
    const realPi = join(os.homedir(), ".pi", "agent");
    const realTargets = [join(realPi, "settings.json"), join(realPi, "npm", "package.json"), join(realPi, "npm", "node_modules", expected.piPackage, "package.json")];
    const realBefore = await fingerprintRoots(realTargets);
    runCli(t, sandbox, ["install", "--target", "pi", "--json"], { label: "pi: install --target pi --json (dry-run)" });
    const apply = runCli(t, sandbox, ["install", "--target", "pi", "--apply", "--json"], { label: "pi: install --target pi --apply --json" });
    const realAfter = await fingerprintRoots(realTargets);
    const realUnchanged = compareFingerprints(t, "pi: real-host Pi agent settings and bridge manifest across the pi step", realBefore, realAfter);
    const result = parseJson(apply);
    const manifestVersion = await installedVersion(paths.piBridgeManifest);
    const shown = Array.isArray(result?.externalChanges) && result.externalChanges.includes("mcp-bridge:pi");
    if (!result) {
      t.check("life07.external.pi-bridge-shown", "NOT-OBSERVED", `install exit=${apply.status}; stderr: "${firstLine(apply.stderr).replace(/\b[0-9a-f]{12,64}\b/gu, "<digest>")}"`);
    } else {
      t.check(
        "life07.external.pi-bridge-shown",
        shown && manifestVersion === expected.piVersion ? "HOLDS" : "VIOLATED",
        `exit=0; externalChanges ${JSON.stringify(result.externalChanges)}; sandbox bridge manifest version ${manifestVersion ?? "absent"} (locked ${expected.piVersion})`,
      );
    }
    t.check(
      "life07.pi-bridge.host-untouched",
      realUnchanged ? "HOLDS" : "VIOLATED",
      realUnchanged ? "the real-host Pi agent settings.json and bridge manifests are byte-identical across the sandboxed pi install" : "a real-host Pi agent file changed; drift listed above",
    );
  }

  // ------------------------------------------------------------ 4. compensation commands
  {
    const sandbox = await newSandbox("life07-comp");
    t.note("comp: this sandbox is the last one in alias order");
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    const codexPaths = await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: cache });
    const piPaths = await seedHarnessPrerequisites(sandbox, release, "pi", { eccCache: cache });
    const combined = runCli(t, sandbox, ["install", "--target", "codex,pi", "--apply", "--json"], { label: "comp: install --target codex,pi --apply --json" });
    if (combined.status !== 0) {
      t.note(`comp: the combined codex,pi install refused (exit ${combined.status}: "${firstLine(combined.stderr).replace(/\b[0-9a-f]{12,64}\b/gu, "<digest>")}"), the codex+pi shared-destination refusal recorded as LIFE-01/C1; falling back to one install per target`);
      for (const target of ["codex", "pi"]) {
        const serial = runCli(t, sandbox, ["install", "--target", target, "--apply", "--json"], { label: `comp: install --target ${target} --apply --json (serial fallback)` });
        if (serial.status !== 0) throw new Error(`comp: install --target ${target} failed: ${firstLine(serial.stderr)}`);
      }
    }
    const gsdDirs = [codexPaths.gsdRoot, piPaths.gsdRoot].map((root) => join(root, "gsd-core"));
    t.note(`comp: GSD occupies ${gsdDirs.map((dir) => `${dir} (exists ${existsSync(dir)})`).join(", ")}; ${expected.eccPackage} at ${globalPackageDir(sandbox, expected.eccPackage)}; Pi bridge manifest ${piPaths.piBridgeManifest}`);
    const preview = runCli(t, sandbox, ["uninstall", "--all", "--json"], { label: "comp: uninstall --all --json (preview)" });
    const plan = parseJson(preview);
    const apply = runCli(t, sandbox, ["uninstall", "--all", "--yes", "--apply", "--json"], { label: "comp: uninstall --all --yes --apply --json" });
    const result = parseJson(apply);
    const receipts = await receiptFiles(sandbox);
    const receipt = receipts.find((entry) => entry.parsed && Array.isArray(entry.parsed.entries)) ?? null;
    t.check(
      "life07.receipt.written",
      receipt ? "HOLDS" : "VIOLATED",
      receipt
        ? `uninstall --all exit=${apply.status}; ${receipts.length} recovery receipt(s) under <state>/receipts; entries ${receipt.parsed.entries.map((entry) => entry.component).join(", ")}; the apply JSON ${result?.recoveryReceipt ? "carries" : "does not carry"} the receipt`
        : `uninstall --all exit=${apply.status}; no recovery receipt under <state>/receipts`,
    );
    const entries = receipt?.parsed?.entries ?? plan?.externalCompensation ?? [];
    const previewEntries = plan?.externalCompensation ?? [];
    const sameAsPreview = JSON.stringify(previewEntries.map((entry) => entry.compensation)) === JSON.stringify(entries.map((entry) => entry.compensation));
    t.note(`comp: the preview JSON externalCompensation and the receipt entries carry ${sameAsPreview ? "the same" : "different"} compensation; receipt ${receipt ? `${receipt.name} sha ${receipt.sha}` : "absent"}`);
    const commandsFor = (predicate) => entries.filter(predicate).flatMap((entry) => (entry.compensation?.commands ?? []).map(String));
    const quote = (list) => (list.length > 0 ? list.map((command) => `"${command}"`).join(", ") : "none");

    const eccCommands = commandsFor((entry) => /ecc/iu.test(String(entry.component)));
    t.check(
      "life07.compensation.ecc-package",
      eccCommands.some((command) => command.includes(expected.eccPackage)) ? "HOLDS" : "VIOLATED",
      `ECC compensation command(s): ${quote(eccCommands)}; the lock's components.ecc.package is ${expected.eccPackage}`,
    );
    const piCommands = commandsFor((entry) => /pi|bridge/iu.test(String(entry.component)) && !/pipe/iu.test(String(entry.component)));
    const piRoute = piCommands.some((command) => command.includes(expected.piPackage) && /\bpi\b/u.test(command));
    t.check(
      "life07.compensation.pi-bridge",
      piRoute ? "HOLDS" : "VIOLATED",
      `Pi bridge compensation command(s): ${quote(piCommands)} (receipt components: ${entries.map((entry) => entry.component).join(", ") || "none"}); the lock's components.mcpBridges.pi is ${expected.piPackage}@${expected.piVersion}, installed by \`pi install npm:${expected.piPackage}@${expected.piVersion}\` into the Pi agent directory`,
    );
    const gsdCommands = commandsFor((entry) => /gsd/iu.test(String(entry.component)));
    const namesGsdCore = gsdCommands.some((command) => /[\\/]gsd-core\b/u.test(command));
    t.check(
      "life07.compensation.gsd-path",
      namesGsdCore ? "HOLDS" : "VIOLATED",
      `GSD compensation command(s): ${quote(gsdCommands)}; the seeded GSD install occupies <config root>/gsd-core for codex (~/.codex/gsd-core) and pi (~/.pi/agent/gsd-core), ${gsdDirs.every((dir) => existsSync(dir)) ? "both still present after uninstall --all" : "state after uninstall --all differs per root"}`,
    );
    const linkCommands = commandsFor((entry) => /link/iu.test(String(entry.component)));
    t.check(
      "life07.compensation.npm-link",
      linkCommands.some((command) => new RegExp(`\\b${expected.linkName}\\b`, "u").test(command)) ? "HOLDS" : "VIOLATED",
      `npm-link compensation command(s): ${quote(linkCommands)}; the package.json name is ${expected.linkName}`,
    );
  }
});
