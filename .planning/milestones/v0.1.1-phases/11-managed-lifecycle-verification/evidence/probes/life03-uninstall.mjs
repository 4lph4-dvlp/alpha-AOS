// LIFE-03 uninstall evidence through the packed CLI: the four uninstall
// previews, the non-interactive guard, a one-target uninstall for each of the
// five harnesses (hermes, pi, antigravity, codex, claude, in that order, in one
// sandbox), and a full-stack uninstall with a leftover scan in a second
// sandbox.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-uninstall.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// Preservation fixtures are synthetic: every authentication sentinel holds the
// fixed string defined below, the user MCP server `p11-user-server` is rendered
// into each native config through the packed renderMcpConfig, and the user
// skill `p11-user-skill` sits in each harness skill root. Transcripts carry only
// their paths and 12-hex hashes, never their content.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml, parseDocument } from "yaml";
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
const UNINSTALL_ORDER = ["hermes", "pi", "antigravity", "codex", "claude"];
const MANAGED_SERVERS = ["context7", "exa", "firecrawl"];
const ECC_SKILLS = ["unified-memory", "documentation-lookup", "deep-research"];
const SENTINEL = "p11-synthetic-auth-sentinel";
const USER_SERVER = "p11-user-server";
const USER_SKILL = "p11-user-skill";

function sha12(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

async function fileHash(path) {
  if (!existsSync(path)) return null;
  return sha12(await readFile(path));
}

function firstLine(value) {
  return String(value).split(/\r?\n/u).map((line) => line.trim()).find((line) => line.length > 0) ?? "";
}

function stableQuote(value) {
  return firstLine(value).replace(/\b[0-9a-f]{12,64}\b/gu, "<digest>");
}

function parseJson(result) {
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function nativeFormat(harness) {
  if (harness === "codex") return "toml";
  if (harness === "hermes") return "yaml";
  return "json";
}

function serversKey(harness) {
  return harness === "codex" || harness === "hermes" ? "mcp_servers" : "mcpServers";
}

/** Parses a harness MCP config in its native format and returns its server table ({} when the file is absent). */
async function readServers(harness, path) {
  if (!existsSync(path)) return { exists: false, servers: {} };
  const text = await readFile(path, "utf8");
  if (!text.trim()) return { exists: true, servers: {} };
  const format = nativeFormat(harness);
  const doc = format === "toml" ? parseToml(text) : format === "yaml" ? parseYaml(text) : JSON.parse(text);
  const servers = doc && typeof doc === "object" ? doc[serversKey(harness)] : undefined;
  return { exists: true, servers: servers && typeof servers === "object" ? servers : {} };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function authSentinelPath(sandbox, harness) {
  const env = sandbox.env;
  switch (harness) {
    case "claude": return join(env.CLAUDE_CONFIG_DIR, ".credentials.json");
    case "codex": return join(env.CODEX_HOME, "auth.json");
    case "antigravity": return join(sandbox.home, ".gemini", "oauth_creds.json");
    case "pi": return join(env.PI_CODING_AGENT_DIR, "auth.json");
    case "hermes": return join(env.HERMES_HOME, "auth.json");
  }
  throw new Error(`unknown harness ${harness}`);
}

function ownedSkillPaths(paths, harness) {
  const owned = [join(paths.eccSkillRoot, "alpha-aos-control", "SKILL.md")];
  if (harness === "claude") owned.push(join(paths.eccSkillRoot, "alpha-aos-ship", "SKILL.md"));
  return owned;
}

function policyPaths(sandbox, harness) {
  if (harness === "codex") return [join(sandbox.env.CODEX_HOME, "AGENTS.md")];
  if (harness === "claude") return [join(sandbox.env.CLAUDE_CONFIG_DIR, "settings.json")];
  return [];
}

// The alpha-aos-ship owned skill (claude only) declares
// `upstreamWorkflow: gsd-core/workflows/ship.md`, which a real GSD install
// writes and seedHarnessPrerequisites does not; the same completion plan 11-03
// used (life01-harnesses.mjs) is repeated here.
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
  const destination = join(harnessPaths(sandbox, "claude", release.installedLock).gsdRoot, "gsd-core", "workflows", "ship.md");
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function journalFiles(sandbox) {
  const dir = join(sandbox.state, "journal");
  if (!existsSync(dir)) return [];
  const result = [];
  for (const name of (await readdir(dir)).filter((entry) => entry.endsWith(".json")).sort()) {
    try {
      result.push({ name, journal: JSON.parse(await readFile(join(dir, name), "utf8")) });
    } catch {
      result.push({ name, journal: null });
    }
  }
  return result;
}

/**
 * One sandbox with all five harnesses seeded, installed by alpha-AOS itself and
 * carrying the synthetic preservation fixtures. Returns the per-harness paths
 * and the fixture map.
 */
async function setupFiveHarnessSandbox(t, tarballPath, group, checkPrefix) {
  const sandbox = await newSandbox(`life03-${group}`);
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  const lock = release.installedLock;
  const eccCache = hostNpmCache();
  const paths = {};
  for (const harness of ALL) {
    paths[harness] = await seedHarnessPrerequisites(sandbox, release, harness, { eccCache });
  }
  await seedClaudeShipWorkflow(t, sandbox, release, group);
  t.note(`${group}: packed release installed (channel ${String(lock.channel)}); all five harnesses seeded in one sandbox; claude GSD seed completed with gsd-core/workflows/ship.md from the locked GSD package`);

  // alpha-AOS writes and journals its own files.
  const combined = runCli(t, sandbox, ["install", "--target", ALL.join(","), "--apply", "--json"], { label: `${group}: install --target ${ALL.join(",")} --apply` });
  const combinedResult = parseJson(combined);
  let installOutcome;
  if (combinedResult) {
    installOutcome = `combined five-target install exit=0; applied=${combinedResult.applied.length} (${combinedResult.applied.join(", ") || "none"})`;
    t.check(`${checkPrefix}.install`, "HOLDS", installOutcome);
  } else {
    t.check(
      `${checkPrefix}.install`,
      "VIOLATED",
      `combined five-target install exit=${combined.status}; stderr: "${stableQuote(combined.stderr) || "empty"}" (the codex+pi shared-destination refusal recorded as LIFE-01/C1); the probe falls back to one install per target in the order ${ALL.join(", ")}`,
    );
    const serial = [];
    for (const harness of ALL) {
      const one = runCli(t, sandbox, ["install", "--target", harness, "--apply", "--json"], { label: `${group}: install --target ${harness} --apply (serial fallback)` });
      const parsed = parseJson(one);
      serial.push(parsed ? `${harness}: exit=0 applied=${parsed.applied.join(", ") || "none"}` : `${harness}: exit=${one.status} stderr="${stableQuote(one.stderr) || "empty"}"`);
    }
    const allOk = serial.every((entry) => entry.includes("exit=0"));
    t.check(`${checkPrefix}.install-serial`, allOk ? "OBSERVED" : "NOT-OBSERVED", serial.join("; "));
    if (!allOk) t.note(`${group}: at least one serial install failed; the uninstall checks below judge the seeded files plus whatever the successful installs wrote`);
  }
  const plan = runCli(t, sandbox, ["install", "--target", ALL.join(","), "--json"], { label: `${group}: dry-run install --target ${ALL.join(",")} --json after setup` });
  const planJson = parseJson(plan);
  t.check(
    `${checkPrefix}.all-current`,
    planJson && planJson.steps.every((step) => step.action === "current") ? "HOLDS" : "OBSERVED",
    planJson ? `${planJson.steps.length} steps; not current: ${planJson.steps.filter((step) => step.action !== "current").map((step) => `${step.id}=${step.action}`).join(", ") || "none"}` : `exit=${plan.status}; no plan JSON`,
  );

  // Synthetic preservation fixtures.
  const packedMcp = await import(pathToFileURL(join(release.installedPackage, "dist", "src", "core", "mcp.js")).href);
  const fixtures = [];
  const userSkills = new Map();
  for (const harness of ALL) {
    const auth = authSentinelPath(sandbox, harness);
    await mkdir(dirname(auth), { recursive: true });
    await writeFile(auth, SENTINEL, "utf8");
    fixtures.push({ harness, kind: "auth", path: auth });

    const configPath = paths[harness].mcpConfigPath;
    const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
    let withUser;
    const userEntry = { command: "p11-user-command", args: ["--p11-synthetic"] };
    if (nativeFormat(harness) === "json") {
      const doc = existing.trim() ? JSON.parse(existing) : {};
      doc.mcpServers = { ...(doc.mcpServers ?? {}), [USER_SERVER]: userEntry };
      withUser = `${JSON.stringify(doc, null, 2)}\n`;
    } else if (nativeFormat(harness) === "toml") {
      withUser = `[mcp_servers.${USER_SERVER}]\ncommand = "p11-user-command"\nargs = ["--p11-synthetic"]\n\n${existing}`;
    } else {
      const doc = parseDocument(existing.trim() ? existing : "{}\n");
      doc.setIn(["mcp_servers", USER_SERVER], userEntry);
      withUser = doc.toString({ lineWidth: 0 });
    }
    const rendered = packedMcp.renderMcpConfig(harness, withUser, lock);
    await writeFile(configPath, rendered, "utf8");
    const parsed = await readServers(harness, configPath);
    const missing = [USER_SERVER, ...MANAGED_SERVERS].filter((name) => !(name in parsed.servers));
    if (missing.length > 0) throw new Error(`${harness}: rendered config lacks ${missing.join(", ")}`);
    fixtures.push({ harness, kind: "user-mcp", path: configPath, entry: canonical(parsed.servers[USER_SERVER]) });

    const skillPath = join(paths[harness].eccSkillRoot, USER_SKILL, "SKILL.md");
    const owners = userSkills.get(skillPath) ?? [];
    owners.push(harness);
    userSkills.set(skillPath, owners);
    fixtures.push({ harness, kind: "user-skill", path: skillPath });
  }
  for (const [skillPath, owners] of userSkills) {
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, `---\nname: ${USER_SKILL}\ndescription: synthetic user-authored skill for Phase 11 (${owners.join("+")})\n---\n\nA user wrote this skill. alpha-AOS must not remove it.\n`, "utf8");
  }
  const described = [];
  for (const fixture of fixtures) {
    // A native MCP config embeds sandbox paths (its bytes vary per run), so the
    // user entry is reported by the hash of its canonical parsed value instead.
    const hash = fixture.kind === "user-mcp" ? `entry-sha=${sha12(fixture.entry)}` : `sha=${await fileHash(fixture.path)}`;
    described.push(`${fixture.harness}/${fixture.kind} ${fixture.path} ${hash}`);
  }
  t.check(`${checkPrefix}.fixtures`, "OBSERVED", described.join("; "));
  t.note(`${group}: the codex and pi user skill is one file (${[...userSkills.entries()].filter(([, owners]) => owners.length > 1).map(([path]) => path).join(", ") || "none"}) because both harnesses use <home>/.agents/skills as their skill root`);
  return { sandbox, release, paths, fixtures };
}

/** The files a harness owns or carries in this sandbox, as path -> 12-hex (null when absent). */
async function harnessFileMap(sandbox, paths, harness) {
  const list = [
    authSentinelPath(sandbox, harness),
    paths.mcpConfigPath,
    join(paths.eccSkillRoot, USER_SKILL, "SKILL.md"),
    ...ECC_SKILLS.map((skill) => join(paths.eccSkillRoot, skill, "SKILL.md")),
    ...ownedSkillPaths(paths, harness),
    ...policyPaths(sandbox, harness),
  ];
  if (paths.gsdRoot) list.push(join(paths.gsdRoot, "gsd-core", "VERSION"), join(paths.gsdRoot, ".gsd-profile"));
  if (paths.piBridgeManifest) list.push(paths.piBridgeManifest);
  const map = new Map();
  for (const path of list) map.set(path, await fileHash(path));
  return map;
}

function sharedEccPath(paths, path) {
  const rel = relative(paths.eccSkillRoot, path);
  return ECC_SKILLS.some((skill) => rel === join(skill, "SKILL.md"));
}

async function targetUninstall(t, setup, harness, roots) {
  const { sandbox, paths } = setup;
  const prefix = `life03.target.${harness}`;
  const own = paths[harness];
  const shareRoot = ALL.filter((other) => other !== harness && paths[other].eccSkillRoot === own.eccSkillRoot);
  const stillInstalled = shareRoot.filter((other) => !setup.uninstalled.has(other));

  const beforeServers = await readServers(harness, own.mcpConfigPath);
  const beforeUserEntry = beforeServers.servers[USER_SERVER] === undefined ? null : canonical(beforeServers.servers[USER_SERVER]);
  const beforeAuth = await fileHash(authSentinelPath(sandbox, harness));
  const userSkillPath = join(own.eccSkillRoot, USER_SKILL, "SKILL.md");
  const beforeUserSkill = await fileHash(userSkillPath);
  const eccBefore = ECC_SKILLS.filter((skill) => existsSync(join(own.eccSkillRoot, skill, "SKILL.md")));
  const ownedBefore = ownedSkillPaths(own, harness).filter((path) => existsSync(path));
  const others = {};
  for (const other of ALL.filter((entry) => entry !== harness)) others[other] = await harnessFileMap(sandbox, paths[other], other);
  const before = await fingerprintRoots(roots);

  const result = runCli(t, sandbox, ["uninstall", "--target", harness, "--yes", "--apply", "--json"], { label: `uninstall --target ${harness} --yes --apply` });
  const after = await fingerprintRoots(roots);
  compareFingerprints(t, `sandbox home+state+prefix across uninstall --target ${harness}`, before, after);
  const applied = parseJson(result);
  if (!applied) t.note(`${harness}: uninstall exit=${result.status}; stderr: "${stableQuote(result.stderr) || "empty"}"`);
  setup.uninstalled.add(harness);

  // managed MCP entries
  const afterServers = await readServers(harness, own.mcpConfigPath);
  const managedLeft = MANAGED_SERVERS.filter((name) => name in afterServers.servers);
  t.check(
    `${prefix}.managed-mcp-removed`,
    applied && managedLeft.length === 0 ? "HOLDS" : "VIOLATED",
    managedLeft.length === 0
      ? `exit=${result.status}; ${own.mcpConfigPath} (${nativeFormat(harness)}) parsed natively: no ${MANAGED_SERVERS.join("/")} entry; servers left: ${Object.keys(afterServers.servers).sort().join(", ") || "none"}`
      : `exit=${result.status}; managed entries still present in ${own.mcpConfigPath}: ${managedLeft.join(", ")}`,
  );

  // ECC skills
  const eccLeft = ECC_SKILLS.filter((skill) => existsSync(join(own.eccSkillRoot, skill, "SKILL.md")));
  if (stillInstalled.length > 0) {
    t.check(
      `${prefix}.ecc-removed`,
      "OBSERVED",
      `shared root: ${own.eccSkillRoot} is also the ECC skill root of ${stillInstalled.join(", ")} (still installed); present before: ${eccBefore.join(", ") || "none"}; present after: ${eccLeft.join(", ") || "none"}`,
    );
  } else {
    t.check(
      `${prefix}.ecc-removed`,
      eccLeft.length === 0 ? "HOLDS" : "VIOLATED",
      eccLeft.length === 0
        ? `no ECC SKILL.md left under ${own.eccSkillRoot} (present before: ${eccBefore.join(", ") || "none, already removed by an earlier uninstall of a harness sharing this root"})`
        : `still present under ${own.eccSkillRoot}: ${eccLeft.join(", ")}`,
    );
  }

  // owned skills
  const ownedLeft = ownedSkillPaths(own, harness).filter((path) => existsSync(path));
  t.check(
    `${prefix}.owned-removed`,
    ownedLeft.length === 0 ? "HOLDS" : "VIOLATED",
    ownedLeft.length === 0
      ? `owned skill file(s) gone: ${ownedSkillPaths(own, harness).join(", ")} (present before: ${ownedBefore.length})`
      : `alpha-AOS-owned skill file(s) still present after uninstall --target ${harness}: ${ownedLeft.join(", ")}${shareRoot.length > 0 ? ` (this path is also the ${shareRoot.join("/")} owned skill destination)` : ""}`,
  );

  // authentication
  const afterAuth = await fileHash(authSentinelPath(sandbox, harness));
  t.check(
    `${prefix}.auth-kept`,
    beforeAuth !== null && afterAuth === beforeAuth ? "HOLDS" : "VIOLATED",
    `${authSentinelPath(sandbox, harness)} sha ${beforeAuth} -> ${afterAuth ?? "absent"}`,
  );

  // user MCP entry
  const afterUserEntry = afterServers.servers[USER_SERVER] === undefined ? null : canonical(afterServers.servers[USER_SERVER]);
  t.check(
    `${prefix}.user-mcp-kept`,
    beforeUserEntry !== null && afterUserEntry === beforeUserEntry ? "HOLDS" : "VIOLATED",
    afterUserEntry === null
      ? `${USER_SERVER} is gone from ${own.mcpConfigPath} (file ${afterServers.exists ? "present" : "absent"})`
      : `${USER_SERVER} entry in ${own.mcpConfigPath} is ${afterUserEntry === beforeUserEntry ? "equal to" : "different from"} its pre-uninstall value`,
  );

  // user skill
  const afterUserSkill = await fileHash(userSkillPath);
  t.check(
    `${prefix}.user-skill-kept`,
    beforeUserSkill !== null && afterUserSkill === beforeUserSkill ? "HOLDS" : "VIOLATED",
    `${userSkillPath} sha ${beforeUserSkill} -> ${afterUserSkill ?? "absent"}`,
  );

  // other harnesses
  const changed = [];
  const excluded = [];
  for (const [other, map] of Object.entries(others)) {
    const now = await harnessFileMap(sandbox, paths[other], other);
    for (const [path, hash] of map) {
      if (now.get(path) === hash) continue;
      if (shareRoot.includes(other) && sharedEccPath(paths[other], path)) {
        excluded.push(`${other}:${relative(paths[other].eccSkillRoot, path).split("\\").join("/")}`);
        continue;
      }
      changed.push(`${other}: ${path} ${hash ?? "absent"} -> ${now.get(path) ?? "absent"}`);
    }
  }
  t.check(
    `${prefix}.others-untouched`,
    changed.length === 0 ? "HOLDS" : "VIOLATED",
    changed.length === 0
      ? `fixture and managed files of ${Object.keys(others).join(", ")} unchanged${excluded.length > 0 ? `; excluded (shared ECC root, reported under ecc-removed and the sibling check): ${excluded.join(", ")}` : ""}`
      : `changed: ${changed.join("; ")}`,
  );
  return { applied, shareRoot, stillInstalled, eccBefore, eccLeft };
}

function inventorySummary(result) {
  const inventory = parseJson(result);
  if (!inventory) return null;
  return inventory.harnesses.map((entry) => `${entry.id}:${entry.command ?? "none"}@${entry.version ?? "none"}`).sort();
}

await runProbe("life03-uninstall", evidencePath("life03-uninstall.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  t.note("seeding precondition: all five harnesses are seeded by seedHarnessPrerequisites (GSD version files, ECC skills at the lock target hashes, MCP configs rendered by the packed renderMcpConfig, the Pi bridge manifest) plus the claude GSD ship workflow, then `install --apply` writes and journals the alpha-AOS-owned files");
  t.note(`preservation fixtures are synthetic: every authentication sentinel holds one fixed synthetic string (reported by hash only), ${USER_SERVER} is a user MCP server rendered into each native config next to the managed entries, and ${USER_SKILL}/SKILL.md is a user skill in each harness skill root`);
  t.note("sandbox aliases: <sandbox> the preview, guard and one-target uninstall sandbox; <sandbox-2> the full-stack uninstall sandbox. Fingerprint roots: <sandbox-N>/home, <sandbox-N>/state, <sandbox-N>/prefix (temp, npm-cache and npm-logs excluded by design)");
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a plan digest or lock digest printed by the CLI itself");

  // ------------------------------------------------------------ sandbox 1
  const setup = await setupFiveHarnessSandbox(t, tarballPath, "target", "life03.setup");
  setup.uninstalled = new Set();
  const { sandbox } = setup;
  const roots = [sandbox.home, sandbox.state, sandbox.prefix];

  // previews
  const previews = [
    ["target", ["uninstall", "--target", "codex"]],
    ["target-json", ["uninstall", "--target", "codex", "--json"]],
    ["all", ["uninstall", "--all", "--json"]],
    ["purge", ["uninstall", "--all", "--purge", "--json"]],
  ];
  let allPreview = null;
  for (const [id, args] of previews) {
    const before = await fingerprintRoots(roots);
    const result = runCli(t, sandbox, args, { label: `preview: ${args.join(" ")}` });
    const after = await fingerprintRoots(roots);
    const equal = compareFingerprints(t, `sandbox home+state+prefix across ${args.join(" ")}`, before, after);
    if (id === "all") allPreview = parseJson(result);
    let summary = `exit=${result.status}`;
    const parsed = args.includes("--json") ? parseJson(result) : null;
    if (parsed) summary += `; prunePlans=${parsed.prunePlans.length}; filesToRemove=${parsed.filesToRemove.length}; purgeRequested=${parsed.purgeRequested}`;
    t.check(
      `life03.preview.${id}.no-mutation`,
      result.status === 0 && equal ? "HOLDS" : "VIOLATED",
      `${summary}; sandbox home, state and prefix digests ${equal ? "equal" : "differ"} before and after`,
    );
  }
  if (allPreview) {
    t.check(
      "life03.preview.all-owned-skills",
      "OBSERVED",
      `the --all preview names ${allPreview.filesToRemove.length} file(s) to remove; alpha-aos-control or alpha-aos-ship among them: ${allPreview.filesToRemove.filter((path) => /alpha-aos-(control|ship)/u.test(path)).length}`,
    );
  }

  // non-interactive guard
  {
    const before = await fingerprintRoots(roots);
    const result = runCli(t, sandbox, ["uninstall", "--target", "codex", "--apply"], { label: "guard: uninstall --target codex --apply without --yes (stdin is a pipe)", input: "" });
    const after = await fingerprintRoots(roots);
    const equal = compareFingerprints(t, "sandbox home+state+prefix across the refused apply", before, after);
    const message = result.stderr.includes("Non-interactive environment requires --yes to apply uninstall.");
    t.check(
      "life03.guard.non-tty-refuses",
      result.status === 2 && message && equal ? "HOLDS" : "VIOLATED",
      `exit=${result.status}; stderr ${message ? "carries" : "lacks"} the --yes message; fingerprint ${equal ? "unchanged" : "changed"}`,
    );
  }

  // one-target uninstall, five harnesses
  const outcomes = {};
  for (const harness of UNINSTALL_ORDER) {
    outcomes[harness] = await targetUninstall(t, setup, harness, roots);
    if (harness === "pi") {
      // codex shares <home>/.agents/skills with pi and is still installed.
      const codexPaths = setup.paths.codex;
      const codexEcc = ECC_SKILLS.filter((skill) => existsSync(join(codexPaths.eccSkillRoot, skill, "SKILL.md")));
      const plan = runCli(t, sandbox, ["install", "--target", "codex", "--json"], { label: "after uninstall --target pi: dry-run install --target codex --json" });
      const planJson = parseJson(plan);
      const eccStep = planJson?.steps.find((step) => step.id === "ecc:codex");
      t.check(
        "life03.target.pi.sibling-codex-intact",
        codexEcc.length === ECC_SKILLS.length ? "HOLDS" : "VIOLATED",
        `codex (still installed) ECC skills present under ${codexPaths.eccSkillRoot}: ${codexEcc.join(", ") || "none"}; codex plan step ecc:codex=${eccStep?.action ?? "unknown"}`,
      );
    }
  }

  // ------------------------------------------------------------ sandbox 2: full stack
  const full = await setupFiveHarnessSandbox(t, tarballPath, "all", "life03.all-setup");
  const fs = full.sandbox;
  const fullRoots = [fs.home, fs.state, fs.prefix];
  const inventoryBefore = inventorySummary(runCli(t, fs, ["inventory", "--json"], { label: "all: inventory --json before the full-stack uninstall" }));
  const journalsBefore = await journalFiles(fs);
  const recorded = new Map();
  for (const { journal } of journalsBefore) {
    if (!journal || !Array.isArray(journal.files)) continue;
    for (const file of journal.files) {
      if (!recorded.has(file.target)) recorded.set(file.target, { existed: Boolean(file.existed), status: journal.status });
    }
  }
  t.note(`all: ${journalsBefore.length} journal file(s) before uninstall (status: ${journalsBefore.map(({ journal }) => journal?.status ?? "unreadable").join(", ")}), recording ${recorded.size} distinct target(s)`);
  const fixtureHashes = new Map();
  for (const fixture of full.fixtures) fixtureHashes.set(fixture.path, await fileHash(fixture.path));
  const userEntriesBefore = {};
  for (const harness of ALL) {
    const servers = await readServers(harness, full.paths[harness].mcpConfigPath);
    userEntriesBefore[harness] = servers.servers[USER_SERVER] === undefined ? null : canonical(servers.servers[USER_SERVER]);
  }
  const seededManaged = [];
  for (const harness of ALL) {
    for (const skill of ECC_SKILLS) seededManaged.push(join(full.paths[harness].eccSkillRoot, skill, "SKILL.md"));
  }

  const beforeAll = await fingerprintRoots(fullRoots);
  const allResult = runCli(t, fs, ["uninstall", "--all", "--yes", "--apply", "--json"], { label: "all: uninstall --all --yes --apply" });
  const afterAll = await fingerprintRoots(fullRoots);
  compareFingerprints(t, "all: sandbox home+state+prefix across uninstall --all", beforeAll, afterAll);
  const allApplied = parseJson(allResult);
  t.check(
    "life03.all.apply",
    "OBSERVED",
    allApplied
      ? `exit=0; prunedFiles=${allApplied.prunedFiles.length}; removedFiles=${allApplied.removedFiles.length}; sweptDirectories=${allApplied.sweptDirectories.length}; preservedJournals=${allApplied.preservedJournals.length}`
      : `exit=${allResult.status}; stderr: "${stableQuote(allResult.stderr) || "empty"}"`,
  );

  const fixturePaths = new Set(full.fixtures.map((fixture) => fixture.path));
  const leftovers = [];
  for (const [target, info] of recorded) {
    if (fixturePaths.has(target) || !existsSync(target)) continue;
    const size = (await readFile(target)).length;
    leftovers.push(`${target} (journal existed-before=${info.existed}; ${size}B now)`);
  }
  leftovers.sort();
  t.check(
    "life03.all.leftovers",
    leftovers.length === 0 ? "HOLDS" : "VIOLATED",
    leftovers.length === 0
      ? `none of the ${recorded.size} journal-recorded targets is still present (preservation fixtures excluded)`
      : `${leftovers.length} of ${recorded.size} journal-recorded targets still present after uninstall --all: ${leftovers.join("; ")}`,
  );
  const emptyDirs = [];
  for (const root of [...new Set(ALL.map((harness) => full.paths[harness].eccSkillRoot))]) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && (await readdir(join(root, entry.name))).length === 0) emptyDirs.push(join(root, entry.name));
    }
  }
  t.check(
    "life03.all.empty-skill-dirs",
    "OBSERVED",
    emptyDirs.length === 0 ? "no empty directory left directly under any harness skill root" : `${emptyDirs.length} empty directories left under the harness skill roots: ${emptyDirs.sort().join("; ")}`,
  );
  const seededLeft = seededManaged.filter((path) => existsSync(path));
  t.check(
    "life03.all.seeded-ecc-removed",
    seededLeft.length === 0 ? "HOLDS" : "VIOLATED",
    seededLeft.length === 0 ? `all ${new Set(seededManaged).size} managed ECC SKILL.md files are gone` : `still present: ${[...new Set(seededLeft)].join("; ")}`,
  );

  const authChanged = [];
  const skillChanged = [];
  for (const fixture of full.fixtures) {
    if (fixture.kind === "user-mcp") continue;
    const now = await fileHash(fixture.path);
    if (now !== fixtureHashes.get(fixture.path)) (fixture.kind === "auth" ? authChanged : skillChanged).push(`${fixture.path} ${fixtureHashes.get(fixture.path)} -> ${now ?? "absent"}`);
  }
  t.check("life03.all.auth-kept", authChanged.length === 0 ? "HOLDS" : "VIOLATED", authChanged.length === 0 ? `all ${ALL.length} authentication sentinels byte-identical` : `changed: ${authChanged.join("; ")}`);
  const mcpChanged = [];
  for (const harness of ALL) {
    const servers = await readServers(harness, full.paths[harness].mcpConfigPath);
    const now = servers.servers[USER_SERVER] === undefined ? null : canonical(servers.servers[USER_SERVER]);
    if (now !== userEntriesBefore[harness]) mcpChanged.push(`${harness}: ${full.paths[harness].mcpConfigPath} ${now === null ? "lost" : "changed"} ${USER_SERVER}`);
  }
  t.check("life03.all.user-mcp-kept", mcpChanged.length === 0 ? "HOLDS" : "VIOLATED", mcpChanged.length === 0 ? `${USER_SERVER} entry equal to its pre-uninstall value in all ${ALL.length} native configs` : mcpChanged.join("; "));
  t.check("life03.all.user-skill-kept", skillChanged.length === 0 ? "HOLDS" : "VIOLATED", skillChanged.length === 0 ? `every ${USER_SKILL}/SKILL.md byte-identical` : `changed: ${skillChanged.join("; ")}`);

  const journalsAfter = await journalFiles(fs);
  const namesBefore = journalsBefore.map((entry) => entry.name);
  const keptAll = namesBefore.every((name) => journalsAfter.some((entry) => entry.name === name));
  t.check(
    "life03.all.journals-kept",
    keptAll ? "HOLDS" : "VIOLATED",
    `${namesBefore.length} journal(s) before; ${journalsAfter.length} after uninstall --all without --purge; every pre-uninstall journal ${keptAll ? "still present" : "NOT kept"}`,
  );
  const stateEntries = existsSync(fs.state) ? (await readdir(fs.state)).sort() : [];
  t.note(`all: state root entries after uninstall --all (no purge): ${stateEntries.join(", ") || "none"}`);

  const purge = runCli(t, fs, ["uninstall", "--all", "--yes", "--apply", "--purge", "--json"], { label: "all: uninstall --all --yes --apply --purge" });
  t.check(
    "life03.all.purge-removes-state",
    purge.status === 0 && !existsSync(fs.state) ? "HOLDS" : "VIOLATED",
    `exit=${purge.status}; state root ${existsSync(fs.state) ? `still present (${(await readdir(fs.state)).sort().join(", ")})` : "removed"}`,
  );
  const authAfterPurge = [];
  for (const fixture of full.fixtures.filter((entry) => entry.kind === "auth")) {
    if ((await fileHash(fixture.path)) !== fixtureHashes.get(fixture.path)) authAfterPurge.push(fixture.path);
  }
  t.check("life03.all.purge-auth-kept", authAfterPurge.length === 0 ? "HOLDS" : "VIOLATED", authAfterPurge.length === 0 ? "authentication sentinels byte-identical after --purge" : `changed: ${authAfterPurge.join("; ")}`);

  const inventoryAfter = inventorySummary(runCli(t, fs, ["inventory", "--json"], { label: "all: inventory --json after uninstall --all and --purge" }));
  const same = inventoryBefore !== null && inventoryAfter !== null && JSON.stringify(inventoryBefore) === JSON.stringify(inventoryAfter);
  t.note(`all: inventory harness command@version list before: ${(inventoryBefore ?? ["unavailable"]).join(", ")}; after: ${(inventoryAfter ?? ["unavailable"]).join(", ")}`);
  t.check(
    "life03.all.harness-apps-kept",
    same ? "HOLDS" : inventoryBefore === null || inventoryAfter === null ? "NOT-OBSERVED" : "VIOLATED",
    same
      ? `${inventoryBefore.length} harness entries; the detected command and version of every harness application (outside the sandbox) is identical before and after uninstall --all and --purge`
      : "the detected harness command@version list differs or is unavailable; lists in the note above",
  );
});
