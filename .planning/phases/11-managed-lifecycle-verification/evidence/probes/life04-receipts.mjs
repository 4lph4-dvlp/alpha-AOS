// LIFE-04 evidence through the packed CLI: does uninstall remove only
// receipted alpha-AOS-owned bytes or semantic entries that still match their
// recorded applied state, and do drifted or user-modified resources cause a
// refusal?
//
// 1. No receipt (research lead P1), one fresh sandbox per harness: a state
//    root with no journal, a user-authored MCP config whose server names match
//    the managed ones, and user-authored skills whose names match the ECC ones.
// 2. User-modified managed skill (P2): a codex install, then a user edit to an
//    ECC skill file, then `uninstall --target codex`.
// 3. User-modified managed MCP entry: one argument of the managed `exa` entry
//    changed inside the intact alpha-AOS markers.
// 4. Edit after preview (P4): a user server added between the preview and the
//    apply.
// 5. Syntactic tamper (positive control): the managed end marker deleted.
// 6. Project scope with no receipt: a user-authored file under .alpha-aos/ and
//    `uninstall --project` (the LIFE-04 side of LIFE-03/C3). Step 3 also checks
//    that the receipted, unmodified owned skill is removed (LIFE-03/C1).
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life04-receipts.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// Fixtures are synthetic and carry no credentials: every user-authored MCP
// server runs `node p11-user-<server>.js` with no environment values, every
// user-authored skill holds the text `p11 user-authored skill`, the user edit
// is the line `p11 user edit`. Transcripts show fixture paths and 12-hex hashes
// only; the synthetic names appear only inside CLI output the product printed.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
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

const ALL = ["claude", "codex", "antigravity", "pi", "hermes"];
const MANAGED_SERVERS = ["context7", "exa", "firecrawl"];
const ECC_SKILLS = ["unified-memory", "documentation-lookup", "deep-research"];
const USER_SKILL_TEXT = "p11 user-authored skill\n";
const USER_EDIT_LINE = "p11 user edit\n";
const USER_ARG = "p11-user-arg";
const USER_SERVER = "p11-user-server";
const END_MARKER = "# alpha-aos:end mcp";

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

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function readServers(harness, path) {
  if (!existsSync(path)) return { exists: false, servers: {} };
  const text = await readFile(path, "utf8");
  if (!text.trim()) return { exists: true, servers: {} };
  const format = nativeFormat(harness);
  const doc = format === "toml" ? parseToml(text) : format === "yaml" ? parseYaml(text) : JSON.parse(text);
  const servers = doc && typeof doc === "object" ? doc[serversKey(harness)] : undefined;
  return { exists: true, servers: servers && typeof servers === "object" ? servers : {} };
}

/**
 * The user-authored MCP config: the native container and server names come
 * from the packed renderMcpConfig output; every managed server is rewritten to
 * `node p11-user-<server>.js` (keeping the Claude `type` field), with no
 * environment values and no alpha-AOS ownership marker.
 */
async function userAuthoredMcpConfig(release, harness) {
  const { renderMcpConfig } = await import(pathToFileURL(join(release.installedPackage, "dist", "src", "core", "mcp.js")).href);
  const rendered = renderMcpConfig(harness, "", release.installedLock);
  const format = nativeFormat(harness);
  const renderedDoc = format === "toml" ? parseToml(rendered) : format === "yaml" ? parseYaml(rendered) : JSON.parse(rendered);
  const renderedServers = renderedDoc[serversKey(harness)] ?? {};
  const ids = MANAGED_SERVERS.filter((id) => renderedServers[id] !== undefined);
  const servers = {};
  for (const id of ids) {
    const source = renderedServers[id];
    servers[id] = {
      ...(typeof source.type === "string" ? { type: source.type } : {}),
      command: "node",
      args: [`p11-user-${id}.js`],
    };
  }
  let text;
  if (format === "toml") {
    text = ids.map((id) => `[mcp_servers.${id}]\ncommand = "node"\nargs = ["p11-user-${id}.js"]\n`).join("\n");
  } else if (format === "yaml") {
    text = stringifyYaml({ mcp_servers: servers });
  } else {
    text = `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`;
  }
  return { text, ids, servers };
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

function samePath(left, right) {
  const norm = (value) => (process.platform === "win32" ? String(value).toLowerCase() : String(value)).replaceAll("\\", "/");
  return norm(left) === norm(right);
}

async function journalsRecording(sandbox, target) {
  const hits = [];
  for (const { name, journal } of await journalFiles(sandbox)) {
    const files = Array.isArray(journal?.files) ? journal.files : [];
    if (files.some((file) => samePath(file?.target ?? "", target))) hits.push(name);
  }
  return hits;
}

/** A sandbox with the packed release installed, codex seeded, and `install --target codex --apply` run by alpha-AOS. */
async function codexInstalledSandbox(t, tarballPath, group) {
  const sandbox = await newSandbox(`life04-${group}`);
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  const paths = await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: hostNpmCache() });
  const install = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: `${group}: install --target codex --apply --json` });
  const result = parseJson(install);
  if (!result) throw new Error(`${group}: install --target codex --apply failed: ${firstLine(install.stderr)}`);
  t.note(`${group}: codex seeded (GSD version files, ECC skills at the lock target hashes, MCP config rendered by the packed renderMcpConfig) and installed by alpha-AOS: applied ${result.applied.join(", ") || "none"}; external ${result.externalChanges.join(", ") || "none"}`);
  return { sandbox, release, paths, roots: [sandbox.home, sandbox.state, sandbox.prefix] };
}

// ---------------------------------------------------------------- part 1

async function noReceiptHarness(t, tarballPath, cache, harness) {
  const sandbox = await newSandbox(`life04-nr-${harness}`);
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
  const paths = harnessPaths(sandbox, harness, release.installedLock);

  const mcp = await userAuthoredMcpConfig(release, harness);
  await mkdir(dirname(paths.mcpConfigPath), { recursive: true });
  await writeFile(paths.mcpConfigPath, mcp.text, "utf8");
  const skillPaths = [];
  for (const skill of ECC_SKILLS) {
    const path = join(paths.eccSkillRoot, skill, "SKILL.md");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, USER_SKILL_TEXT, "utf8");
    skillPaths.push(path);
  }
  const journalDir = join(sandbox.state, "journal");
  const journalState = existsSync(journalDir) ? `present with ${(await readdir(journalDir)).length} entr(ies)` : "absent";
  const mcpHash = await fileHash(paths.mcpConfigPath);
  const skillHashes = new Map();
  for (const path of skillPaths) skillHashes.set(path, await fileHash(path));
  const entriesBefore = (await readServers(harness, paths.mcpConfigPath)).servers;
  t.note(`no-receipt ${harness}: no alpha-AOS install ran in this sandbox; <state>/journal is ${journalState}. User-authored MCP config ${paths.mcpConfigPath} (sha ${mcpHash}; servers ${mcp.ids.join(", ")}, each \`node p11-user-<server>.js\`, no env, no marker); user-authored ECC-named skills ${skillPaths.map((path) => `${path} (sha ${skillHashes.get(path)})`).join(", ")}`);

  const before = await fingerprintRoots([sandbox.home, sandbox.state, sandbox.prefix]);
  const preview = runCli(t, sandbox, ["uninstall", "--target", harness, "--json"], { label: `no-receipt ${harness}: uninstall --target ${harness} --json (preview)` });
  const plan = parseJson(preview);
  const planned = [];
  if (plan) {
    for (const prune of plan.prunePlans ?? []) planned.push(`${prune.action} ${prune.path} removing [${(prune.injectedKeysRemoved ?? []).join(", ")}]`);
    for (const file of plan.filesToRemove ?? []) planned.push(`remove ${file}`);
  }
  t.check(
    `life04.no-receipt.${harness}.planned`,
    "OBSERVED",
    plan
      ? `with no journal and no alpha-AOS install, the preview plans ${planned.length} removal(s): ${planned.join("; ") || "none"}`
      : `preview exit=${preview.status}; stderr: "${firstLine(preview.stderr)}"`,
  );

  const apply = runCli(t, sandbox, ["uninstall", "--target", harness, "--yes", "--apply", "--json"], { label: `no-receipt ${harness}: uninstall --target ${harness} --yes --apply --json` });
  const after = await fingerprintRoots([sandbox.home, sandbox.state, sandbox.prefix]);
  compareFingerprints(t, `no-receipt ${harness}: home/state/prefix across the apply`, before, after);

  const entriesAfter = (await readServers(harness, paths.mcpConfigPath)).servers;
  const removed = [];
  const changed = [];
  for (const id of mcp.ids) {
    if (entriesAfter[id] === undefined) removed.push(id);
    else if (canonical(entriesAfter[id]) !== canonical(entriesBefore[id])) changed.push(id);
  }
  const mcpHashAfter = await fileHash(paths.mcpConfigPath);
  t.check(
    `life04.no-receipt.${harness}.entries`,
    removed.length === 0 && changed.length === 0 ? "HOLDS" : "VIOLATED",
    removed.length === 0 && changed.length === 0
      ? `exit=${apply.status}; all ${mcp.ids.length} user-authored entries (${mcp.ids.join(", ")}) still present and equal; config file ${mcpHashAfter === mcpHash ? "byte-identical" : "rewritten"}`
      : `exit=${apply.status}; user-authored entries with no receipt removed: ${removed.join(", ") || "none"}; changed: ${changed.join(", ") || "none"}; config file sha ${mcpHash} -> ${mcpHashAfter ?? "absent"}`,
  );

  const skillsLost = [];
  for (const path of skillPaths) {
    const now = await fileHash(path);
    if (now !== skillHashes.get(path)) skillsLost.push(`${path} ${skillHashes.get(path)} -> ${now ?? "absent"}`);
  }
  t.check(
    `life04.no-receipt.${harness}.skills`,
    skillsLost.length === 0 ? "HOLDS" : "VIOLATED",
    skillsLost.length === 0
      ? `all ${skillPaths.length} user-authored ECC-named skills byte-identical`
      : `user-authored skills with no receipt removed or changed: ${skillsLost.join("; ")}`,
  );
}

// ---------------------------------------------------------------- probe

await runProbe("life04-receipts", evidencePath("life04-receipts.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const cache = hostNpmCache();
  t.note("sandbox aliases in order: <sandbox>..<sandbox-5> the no-receipt sandboxes (claude, codex, antigravity, pi, hermes); <sandbox-6> P2 user-modified skill; <sandbox-7> user-modified MCP entry; <sandbox-8> P4 edit after preview; <sandbox-9> syntactic tamper; <sandbox-10> project scope with no receipt. Fingerprint roots: <sandbox-N>/home, <sandbox-N>/state, <sandbox-N>/prefix");
  t.note("CLI output below is verbatim apart from path aliasing; any 64-hex value inside it is a plan digest, a file hash the CLI computed itself over a sandbox file, or a lock digest");

  // ------------------------------------------------------------ 1. no receipt (P1)
  for (const harness of ALL) await noReceiptHarness(t, tarballPath, cache, harness);

  // ------------------------------------------------------------ 2. user-modified managed skill (P2)
  {
    const { sandbox, paths, roots } = await codexInstalledSandbox(t, tarballPath, "p2");
    const skill = join(sandbox.home, ".agents", "skills", "deep-research", "SKILL.md");
    const sync = runCli(t, sandbox, ["ecc-skills", "sync", "--target", "codex", "--apply", "--json"], { label: "p2: ecc-skills sync --target codex --apply --json (skills seeded at the lock hashes)" });
    const syncResult = parseJson(sync);
    let journaled = await journalsRecording(sandbox, skill);
    let route = `ecc-skills sync exit=${sync.status}; operationId ${syncResult?.operationId ?? "null"} (the seeded skills already match the lock, so nothing was written); journals recording ${skill}: ${journaled.length}`;
    if (journaled.length === 0) {
      // Make alpha-AOS write (and journal) the skills itself, so the user edit lands on a receipted file.
      for (const name of ECC_SKILLS) await rm(join(paths.eccSkillRoot, name, "SKILL.md"), { force: true });
      const resync = runCli(t, sandbox, ["ecc-skills", "sync", "--target", "codex", "--apply", "--json"], { label: "p2: ecc-skills sync --target codex --apply --json (after removing the three seeded codex ECC skill files)" });
      const resyncResult = parseJson(resync);
      journaled = await journalsRecording(sandbox, skill);
      route += `; after removing the seeded files a second sync exit=${resync.status}; operationId ${resyncResult?.operationId ? "set" : "null"}${resync.status === 0 ? "" : ` (stderr: "${firstLine(resync.stderr)}")`}; journals recording ${skill}: ${journaled.length}`;
    }
    t.check("life04.modified.skill-receipted", "OBSERVED", route);
    if (!existsSync(skill)) throw new Error("p2: the codex deep-research skill is missing before the user edit");
    const receiptedHash = await fileHash(skill);
    await appendFile(skill, USER_EDIT_LINE, "utf8");
    const editedHash = await fileHash(skill);
    t.note(`p2: appended the synthetic user-edit line to ${skill}: sha ${receiptedHash} -> ${editedHash} (${journaled.length > 0 ? "the file is journaled by alpha-AOS" : "the file is not journaled"})`);
    const before = await fingerprintRoots(roots);
    const uninstall = runCli(t, sandbox, ["uninstall", "--target", "codex", "--yes", "--apply", "--json"], { label: "p2: uninstall --target codex --yes --apply --json (after the user edit)" });
    const after = await fingerprintRoots(roots);
    compareFingerprints(t, "p2: home/state/prefix across the apply", before, after);
    const nowHash = await fileHash(skill);
    const refused = uninstall.status !== 0 && nowHash === editedHash;
    t.check(
      "life04.modified.skill",
      refused ? "HOLDS" : "VIOLATED",
      refused
        ? `exit=${uninstall.status}; the user-edited skill is byte-identical; stderr: "${firstLine(uninstall.stderr)}"`
        : `exit=${uninstall.status}; the user-edited ${journaled.length > 0 ? "(journaled) " : ""}deep-research SKILL.md is ${nowHash === null ? "removed" : nowHash === editedHash ? "kept but the command did not refuse" : "changed"}; no refusal names the user modification`,
    );
  }

  // ------------------------------------------------------------ 3. user-modified managed MCP entry
  {
    const { sandbox, paths, roots } = await codexInstalledSandbox(t, tarballPath, "p3");
    const config = paths.mcpConfigPath;
    const text = await readFile(config, "utf8");
    const lines = text.split("\n");
    const start = lines.findIndex((line) => line.trim() === "[mcp_servers.exa]");
    let edited = false;
    for (let index = start + 1; start >= 0 && index < lines.length && !/^\s*\[/u.test(lines[index]); index += 1) {
      if (/^\s*args\s*=/u.test(lines[index])) {
        const next = lines[index].replace(/"exa-mcp-server@[^"]*"/u, `"${USER_ARG}"`);
        edited = next !== lines[index];
        lines[index] = next;
        break;
      }
    }
    if (!edited) throw new Error("p3: the managed exa entry has no exa-mcp-server argument to change");
    await writeFile(config, lines.join("\n"), "utf8");
    const markersIntact = (await readFile(config, "utf8")).includes("# alpha-aos:start mcp") && (await readFile(config, "utf8")).includes(END_MARKER);
    t.note(`p3: changed one argument of the managed exa entry in ${config} to the synthetic ${USER_ARG}; alpha-AOS markers intact: ${markersIntact}`);
    const exaBefore = canonical((await readServers("codex", config)).servers.exa);
    const before = await fingerprintRoots(roots);
    const uninstall = runCli(t, sandbox, ["uninstall", "--target", "codex", "--yes", "--apply", "--json"], { label: "p3: uninstall --target codex --yes --apply --json (after the user edit to exa)" });
    const after = await fingerprintRoots(roots);
    const unchanged = compareFingerprints(t, "p3: home/state/prefix across the apply", before, after);
    const exaAfter = (await readServers("codex", config)).servers.exa;
    const kept = exaAfter !== undefined && canonical(exaAfter) === exaBefore;
    t.check(
      "life04.modified.mcp-entry",
      uninstall.status !== 0 && unchanged ? "HOLDS" : "VIOLATED",
      uninstall.status !== 0 && unchanged
        ? `exit=${uninstall.status}; refused with zero changed bytes; stderr: "${firstLine(uninstall.stderr)}"`
        : `exit=${uninstall.status}; the user-modified exa entry (argument changed to ${USER_ARG}) is ${exaAfter === undefined ? "removed" : kept ? "kept" : "changed"}; sandbox bytes ${unchanged ? "unchanged" : "changed"}; no refusal names the modification`,
    );

    // The other half of "remove only receipted bytes that still match": a receipted,
    // unmodified alpha-AOS-owned file must be removable. The owned skill written by the
    // install above is untouched by this probe.
    const owned = join(sandbox.home, ".agents", "skills", "alpha-aos-control", "SKILL.md");
    const recorded = [];
    for (const { name, journal } of await journalFiles(sandbox)) {
      for (const file of Array.isArray(journal?.files) ? journal.files : []) {
        if (samePath(file?.target ?? "", owned) && typeof file.afterHash === "string") recorded.push({ name, afterHash: file.afterHash, existedBefore: file.beforeHash !== null });
      }
    }
    const nowFull = existsSync(owned) ? createHash("sha256").update(await readFile(owned)).digest("hex") : null;
    const matches = recorded.some((entry) => entry.afterHash === nowFull);
    t.check(
      "life04.receipted.owned-skill-removed",
      nowFull === null ? "HOLDS" : "VIOLATED",
      nowFull === null
        ? `after uninstall --target codex the owned skill ${owned} is removed`
        : `after uninstall --target codex the owned skill ${owned} is still present; journaled by ${recorded.length} journal(s) (existed before install: ${recorded.some((entry) => entry.existedBefore)}); its bytes ${matches ? "still match the journal's recorded afterHash" : "do not match any recorded afterHash"}; the uninstall preview and apply never list it (cross-reference LIFE-03/C1)`,
    );
  }

  // ------------------------------------------------------------ 4. edit after preview (P4)
  {
    const { sandbox, paths, roots } = await codexInstalledSandbox(t, tarballPath, "p4");
    const config = paths.mcpConfigPath;
    const preview = runCli(t, sandbox, ["uninstall", "--target", "codex", "--json"], { label: "p4: uninstall --target codex --json (preview)" });
    const plan = parseJson(preview);
    // The CLI redaction seam prints home paths as `~/...`, so the planned entry is matched by its home-relative suffix.
    const plannedConfig = (plan?.prunePlans ?? []).find((prune) => String(prune.path).replaceAll("\\", "/").endsWith("/.codex/config.toml"));
    const plannedHash = plannedConfig?.currentHash ?? null;
    t.note(`p4: preview currentHash values: ${(plan?.prunePlans ?? []).map((prune) => `${prune.path} ${String(prune.currentHash).slice(0, 12)}`).join("; ") || "none"}`);
    await appendFile(config, `\n[mcp_servers.${USER_SERVER}]\ncommand = "node"\nargs = ["${USER_SERVER}.js"]\n`, "utf8");
    const preApply = createHash("sha256").update(await readFile(config)).digest("hex");
    t.note(`p4: added the user server ${USER_SERVER} to ${config} outside the managed markers after the preview; planned currentHash ${plannedHash ? plannedHash.slice(0, 12) : "none"}, pre-apply hash ${preApply.slice(0, 12)}`);
    const before = await fingerprintRoots(roots);
    const apply = runCli(t, sandbox, ["uninstall", "--target", "codex", "--yes", "--apply", "--json"], { label: "p4: uninstall --target codex --yes --apply --json (after the edit)" });
    const after = await fingerprintRoots(roots);
    compareFingerprints(t, "p4: home/state/prefix across the apply", before, after);
    const servers = (await readServers("codex", config)).servers;
    const userKept = servers[USER_SERVER] !== undefined;
    const managedLeft = MANAGED_SERVERS.filter((id) => servers[id] !== undefined);
    const differs = plannedHash !== null && plannedHash !== preApply;
    t.check(
      "life04.preview-hash.enforced",
      apply.status !== 0 ? "HOLDS" : "VIOLATED",
      apply.status !== 0
        ? `exit=${apply.status}; apply refused after the post-preview edit; stderr: "${firstLine(apply.stderr)}"`
        : `exit=0; apply proceeded although config.toml no longer matched the previewed currentHash (planned ${differs ? "differs from" : "equals"} the pre-apply hash; prefixes in the note above); ${USER_SERVER} ${userKept ? "survived" : "was removed"}; managed entries left: ${managedLeft.join(", ") || "none"}`,
    );
  }

  // ------------------------------------------------------------ 5. syntactic tamper (positive control)
  {
    const { sandbox, paths } = await codexInstalledSandbox(t, tarballPath, "p5");
    const config = paths.mcpConfigPath;
    const text = await readFile(config, "utf8");
    const kept = text.split("\n").filter((line) => line.trim() !== END_MARKER);
    if (kept.length === text.split("\n").length) throw new Error("p5: config.toml has no managed end marker to delete");
    await writeFile(config, kept.join("\n"), "utf8");
    t.note(`p5: deleted the managed end marker line from ${config}`);
    const roots = [sandbox.home, sandbox.state];
    const before = await fingerprintRoots(roots);
    const uninstall = runCli(t, sandbox, ["uninstall", "--target", "codex", "--yes", "--apply"], { label: "p5: uninstall --target codex --yes --apply (tampered markers)" });
    const after = await fingerprintRoots(roots);
    const unchanged = compareFingerprints(t, "p5: home/state across the refused apply", before, after);
    const namesDrift = /missing closing marker|Malformed or tampered/u.test(uninstall.stderr);
    t.check(
      "life04.tamper.refuses",
      uninstall.status === 2 && namesDrift ? "HOLDS" : "VIOLATED",
      `exit=${uninstall.status}; stderr: "${firstLine(uninstall.stderr)}"`,
    );
    t.check(
      "life04.tamper.zero-bytes-changed",
      unchanged ? "HOLDS" : "VIOLATED",
      unchanged ? "home and state byte fingerprints equal before and after the refused apply" : "home or state bytes changed; drift listed above",
    );
  }

  // ------------------------------------------------------------ 6. project scope with no receipt
  {
    const sandbox = await newSandbox("life04-project");
    await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    const project = join(sandbox.repo, "p11-project");
    const note = join(project, ".alpha-aos", "p11-user-notes.txt");
    await mkdir(dirname(note), { recursive: true });
    await writeFile(note, "p11 user-authored note\n", "utf8");
    const noteHash = await fileHash(note);
    t.note(`project: ${project} holds only the user-authored ${note} (sha ${noteHash}) under .alpha-aos/; no pack was materialized, so no pack receipt and no journal exist`);
    const preview = runCli(t, sandbox, ["uninstall", "--project", project, "--json"], { label: "project: uninstall --project <project> --json (preview)", cwd: project });
    const plan = parseJson(preview);
    const listed = (plan?.filesToRemove ?? []).map((file) => String(file).replaceAll("\\", "/").split("/.alpha-aos/")[1] ?? String(file));
    const apply = runCli(t, sandbox, ["uninstall", "--project", project, "--yes", "--apply", "--json"], { label: "project: uninstall --project <project> --yes --apply --json", cwd: project });
    const after = await fileHash(note);
    t.check(
      "life04.project.non-receipted",
      after === noteHash ? "HOLDS" : "VIOLATED",
      after === noteHash
        ? `exit=${apply.status}; the non-receipted user note is byte-identical`
        : `exit=${apply.status}; the preview listed .alpha-aos/${listed.join(", .alpha-aos/") || "nothing"} for removal and the apply removed the non-receipted user note (sha ${noteHash} -> ${after ?? "absent"}) (cross-reference LIFE-03/C3)`,
    );
  }
});
