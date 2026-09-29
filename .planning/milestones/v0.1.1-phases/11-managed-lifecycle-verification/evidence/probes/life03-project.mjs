// LIFE-03 project scope through the packed CLI: both project-pack removal
// routes (research open question 3) and the isolated-runtime clean, in one
// sandbox with codex seeded and installed.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-project.mjs [--out <scratch>] [--keep]`
// then compare `grep '^CHECK'` of the output with the committed transcript.
//
// 1. Approve route: a `web` domain fixture (createDomainFixture) is approved and
//    synced, user files are added, the selecting evidence is removed so the
//    pack goes stale, `project status` offers a removal digest, and
//    `project approve <p> --plan-digest <removal-digest> --apply` removes it.
// 2. Uninstall route: a `security` domain fixture (its selection comes from a
//    reviewed `.alpha-aos/stack.yaml`, so the manifest clause is observable) is
//    synced, a user file is added under `.alpha-aos/`, and
//    `uninstall --project <p>` is previewed and applied.
// 3. Isolated runtime: `project isolate init|sync|clean` in a third project,
//    then `uninstall --all` against an unmarked directory under
//    `<state>/runtimes` (observation only).
//
// The pack skill bytes come from the locked ECC package fetched by the packed
// CLI itself (`npm pack ecc-universal@<locked>` into a fixture root), so the
// sync steps need the npm registry; an environmental failure there is
// NOT-OBSERVED with the verbatim stderr.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertSandboxEnv,
  compareFingerprints,
  evidencePath,
  fingerprintRoots,
  hostNpmCache,
  installPackedRelease,
  newSandbox,
  packOnce,
  repositoryRoot,
  runCli,
  runCommand,
  runProbe,
  seedHarnessPrerequisites,
} from "./probe-lib.mjs";

const fixturesUrl = pathToFileURL(join(repositoryRoot, "dist", "test", "helpers", "pack-fixtures.js")).href;
const { createDomainFixture, DOMAIN_FIXTURES } = await import(fixturesUrl);

const ENVIRONMENTAL = /network|registry|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|E404|ETARGET/iu;

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

/** Every file and directory under a root as relative POSIX paths (the .git directory excluded). */
async function listTree(root) {
  const files = [];
  const dirs = [];
  async function walk(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (prefix === "" && entry.name === ".git") continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        dirs.push(rel);
        await walk(join(directory, entry.name), rel);
      } else files.push(rel);
    }
  }
  if (existsSync(root)) await walk(root, "");
  return { files: files.sort(), dirs: dirs.sort() };
}

function abs(root, rel) {
  return join(root, ...rel.split("/"));
}

function gitInit(t, sandbox, project, label) {
  assertSandboxEnv(sandbox.env, sandbox.root);
  const result = runCommand(t, {
    label: `${label}: git init`,
    executable: "git",
    args: ["init", "--quiet", project],
    env: sandbox.env,
    cwd: sandbox.repo,
  });
  if (result.status !== 0) throw new Error(`git init failed: ${firstLine(result.stderr)}`);
}

async function journalNames(sandbox) {
  const dir = join(sandbox.state, "journal");
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
}

/** Approve and sync a project; returns the sync result or null (and records why). */
function approveAndSync(t, sandbox, project, label) {
  const preview = runCli(t, sandbox, ["project", "approve", project, "--json"], { label: `${label}: project approve (preview) --json` });
  const previewJson = parseJson(preview);
  if (!previewJson) return { error: `approve preview exit=${preview.status}; stderr: "${stableQuote(preview.stderr) || "empty"}"` };
  const applicable = previewJson.plan?.applicable ?? [];
  if (applicable.length === 0) return { error: `the plan selects no pack (applicable empty)`, previewJson };
  const approved = runCli(t, sandbox, ["project", "approve", project, "--plan-digest", previewJson.planDigest, "--apply", "--json"], { label: `${label}: project approve --plan-digest <plan digest> --apply --json` });
  if (approved.status !== 0) return { error: `approve --apply exit=${approved.status}; stderr: "${stableQuote(approved.stderr) || "empty"}"`, previewJson };
  const synced = runCli(t, sandbox, ["project", "sync", project, "--apply", "--json"], { label: `${label}: project sync --apply --json` });
  const syncJson = parseJson(synced);
  if (!syncJson) {
    const environmental = ENVIRONMENTAL.test(synced.stderr);
    return { error: `sync --apply exit=${synced.status}; stderr: "${stableQuote(synced.stderr) || "empty"}"`, environmental, previewJson };
  }
  return { previewJson, syncJson, applicable };
}

await runProbe("life03-project", evidencePath("life03-project.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const sandbox = await newSandbox("life03-project");
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: hostNpmCache() });
  await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: hostNpmCache() });
  const install = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], { label: "install --target codex --apply" });
  t.note(`packed release installed (channel ${String(release.installedLock.channel)}); codex seeded; install --target codex --apply exit=${install.status}`);
  t.note("sandbox alias: <sandbox>. Projects live under <sandbox>/projects so every packed-CLI step keeps its working directory and arguments inside the sandbox. Project fingerprints exclude the project .git directory");
  t.note("pack targets are the project-local skill roots of claude (.claude/skills), codex (.agents/skills) and pi (.pi/skills) (PROJECT_SKILL_ROOTS), fixed by the product and not by harness detection");
  const projects = join(sandbox.root, "projects");
  await mkdir(projects, { recursive: true });

  // ------------------------------------------------------------ 1. approve route
  const p1 = join(projects, "p1-web");
  await mkdir(p1, { recursive: true });
  await createDomainFixture("web", p1);
  gitInit(t, sandbox, p1, "p1");
  t.note(`p1: web domain fixture (${DOMAIN_FIXTURES.web.packId}; evidence files ${DOMAIN_FIXTURES.web.files.map((file) => file.path).join(", ")}); the removal is triggered by deleting ${DOMAIN_FIXTURES.web.nearMissEdit.path}`);
  const preSync = await listTree(p1);
  const p1Run = approveAndSync(t, sandbox, p1, "p1");
  if (p1Run.error) {
    const outcome = p1Run.environmental ? "NOT-OBSERVED" : p1Run.previewJson && (p1Run.previewJson.plan?.applicable ?? []).length === 0 ? "NOT-OBSERVED" : "VIOLATED";
    for (const id of ["removal-offered", "status-no-mutation", "approve-route", "user-files-kept", "manifest-kept", "empty-dirs-swept", "reversible"]) {
      t.check(`life03.pack.${id}`, outcome, `the approve-route setup did not complete: ${p1Run.error}`);
    }
  } else {
    const { syncJson } = p1Run;
    // The receipted pack targets: the skill files and their provenance sidecars.
    // The receipt itself is judged separately (life03.pack.receipt-after-removal).
    const packFiles = [...syncJson.written, ...syncJson.sidecars].sort();
    const postSync = await listTree(p1);
    const createdDirs = postSync.dirs.filter((dir) => !preSync.dirs.includes(dir));
    t.check(
      "life03.pack.synced",
      "OBSERVED",
      `sync status=${syncJson.status}; packs=${syncJson.packs.join(", ")}; written=${syncJson.written.join(", ")}; receipts=${syncJson.receipts.join(", ")}; sidecars=${syncJson.sidecars.length}; created directories=${createdDirs.length}`,
    );

    const userNotes = join(p1, ".alpha-aos", "p11-user-notes.txt");
    await writeFile(userNotes, "p11 synthetic user notes: a user wrote this file under .alpha-aos.\n", "utf8");
    const besidePack = join(dirname(abs(p1, syncJson.written[0])), "p11-user-notes.md");
    await writeFile(besidePack, "p11 synthetic user notes beside a pack skill file.\n", "utf8");
    const userHashes = new Map([[userNotes, await fileHash(userNotes)], [besidePack, await fileHash(besidePack)]]);
    const planArtifact = join(p1, ".alpha-aos", "plan.json");
    const manifest = join(p1, ".alpha-aos", "stack.yaml");
    const reviewedBefore = [planArtifact, manifest].filter((path) => existsSync(path));
    t.note(`p1: user files written: .alpha-aos/p11-user-notes.txt (sha ${userHashes.get(userNotes)}) and ${besidePack.slice(p1.length + 1).split("\\").join("/")} (sha ${userHashes.get(besidePack)}), the latter inside the pack-created directory of ${syncJson.written[0]}`);

    // browser-entrypoint is a DIRECTORY fact (catalog/facts.yaml: app, pages,
    // src, public), so deleting the file alone leaves the pack selected; the
    // evidence directory itself is removed.
    const evidenceDir = DOMAIN_FIXTURES.web.nearMissEdit.path.split("/")[0];
    await rm(abs(p1, evidenceDir), { recursive: true, force: true });
    t.note(`p1: selecting evidence removed: the ${evidenceDir}/ directory (the browser-entrypoint fact is a directory fact, so deleting only ${DOMAIN_FIXTURES.web.nearMissEdit.path} would leave WEB_BASE selected)`);
    const statusRoots = [p1, sandbox.home, sandbox.state];
    const beforeStatus = await fingerprintRoots(statusRoots);
    runCli(t, sandbox, ["project", "status", p1], { label: "p1: project status (human form) after the selecting evidence was removed" });
    const status = runCli(t, sandbox, ["project", "status", p1, "--json"], { label: "p1: project status --json" });
    const afterStatus = await fingerprintRoots(statusRoots);
    const statusEqual = compareFingerprints(t, "p1 project + sandbox home + state across project status", beforeStatus, afterStatus);
    const statusJson = parseJson(status);
    const removal = statusJson?.removals?.find((entry) => syncJson.packs.includes(entry.packId));
    t.check(
      "life03.pack.removal-offered",
      removal?.removalDigest ? "HOLDS" : "VIOLATED",
      removal?.removalDigest
        ? `project status --json offers a removal for ${removal.packId} with a removalDigest; ${removal.targets?.length ?? 0} target(s): ${(removal.targets ?? []).map((target) => target.path).join(", ")}`
        : `exit=${status.status}; no removal with a removalDigest for ${syncJson.packs.join(", ")}; removals=${JSON.stringify(statusJson?.removals?.map((entry) => entry.packId) ?? null)}`,
    );
    t.check(
      "life03.pack.status-no-mutation",
      statusEqual ? "HOLDS" : "VIOLATED",
      `project tree, sandbox home and state digests ${statusEqual ? "equal" : "differ"} across project status (human and --json)`,
    );

    if (removal?.removalDigest) {
      const journalsBefore = await journalNames(sandbox);
      const removed = runCli(t, sandbox, ["project", "approve", p1, "--plan-digest", removal.removalDigest, "--apply", "--json"], { label: "p1: project approve --plan-digest <removal digest from project status> --apply --json" });
      const removedJson = parseJson(removed);
      const left = packFiles.filter((rel) => existsSync(abs(p1, rel)));
      t.check(
        "life03.pack.approve-route",
        removedJson && left.length === 0 ? "HOLDS" : "VIOLATED",
        removedJson
          ? `exit=0; packId=${removedJson.packId}; removed ${removedJson.removed.length} path(s); receipted pack targets still present: ${left.join(", ") || "none"} (of ${packFiles.length})`
          : `exit=${removed.status}; stderr: "${stableQuote(removed.stderr) || "empty"}"; pack targets still present: ${left.join(", ") || "none"}`,
      );
      const userDiffer = [];
      for (const [path, hash] of userHashes) {
        const now = await fileHash(path);
        if (now !== hash) userDiffer.push(`${path.slice(p1.length + 1).split("\\").join("/")} ${hash} -> ${now ?? "absent"}`);
      }
      t.check(
        "life03.pack.user-files-kept",
        userDiffer.length === 0 ? "HOLDS" : "VIOLATED",
        userDiffer.length === 0 ? "both user files byte-identical after the removal" : `changed: ${userDiffer.join("; ")}`,
      );
      const reviewedLeft = reviewedBefore.filter((path) => existsSync(path));
      t.check(
        "life03.pack.manifest-kept",
        reviewedBefore.length === 0 ? "NOT-OBSERVED" : reviewedLeft.length === reviewedBefore.length ? "HOLDS" : "VIOLATED",
        reviewedBefore.length === 0
          ? "no .alpha-aos/stack.yaml or plan.json existed before the removal"
          : `user-approved artifacts before: ${reviewedBefore.map((path) => path.slice(p1.length + 1).split("\\").join("/")).join(", ")}; still present: ${reviewedLeft.map((path) => path.slice(p1.length + 1).split("\\").join("/")).join(", ") || "none"}`,
      );
      const emptyLeft = [];
      for (const dir of createdDirs) {
        const path = abs(p1, dir);
        if (existsSync(path) && (await readdir(path)).length === 0) emptyLeft.push(dir);
      }
      t.check(
        "life03.pack.empty-dirs-swept",
        emptyLeft.length === 0 ? "HOLDS" : "VIOLATED",
        emptyLeft.length === 0
          ? `none of the ${createdDirs.length} pack-created directories is left empty (directories still holding a user file are kept by design)`
          : `empty pack-created directories left behind: ${emptyLeft.join(", ")}`,
      );
      const afterHuman = runCli(t, sandbox, ["project", "status", p1], { label: "p1: project status (human form) after the removal" });
      const afterStatus = parseJson(runCli(t, sandbox, ["project", "status", p1, "--json"], { label: "p1: project status --json after the removal" }));
      const receiptsLeft = syncJson.receipts.filter((rel) => existsSync(abs(p1, rel)));
      const stateLine = afterHuman.stdout.split(/\r?\n/u).find((line) => /^[A-Z-]+\s+WEB_BASE\s/u.test(line.trim())) ?? "no WEB_BASE state row";
      t.check(
        "life03.pack.receipt-after-removal",
        "OBSERVED",
        `receipt(s) still present after the removal: ${receiptsLeft.join(", ") || "none"}; project status after the removal: exit=${afterHuman.status}; WEB_BASE row: "${stateLine.trim().replace(/\s+/gu, " ")}"; removals offered: ${afterStatus?.removals?.length ?? "n/a"}`,
      );
      const again = afterStatus?.removals?.find((entry) => entry.packId === removal.packId);
      if (again?.removalDigest) {
        const second = runCli(t, sandbox, ["project", "approve", p1, "--plan-digest", again.removalDigest, "--apply", "--json"], { label: "p1: project approve --plan-digest <removal digest still offered after the removal> --apply --json" });
        t.check(
          "life03.pack.removal-still-offered",
          "OBSERVED",
          `after the removal project status still offers a removal for ${again.packId} (${again.targets?.filter((target) => target.exists).length ?? "?"} of ${again.targets?.length ?? "?"} targets present); approving it: exit=${second.status}; ${second.status === 0 ? "applied" : `stderr: "${stableQuote(second.stderr) || "empty"}"`}`,
        );
      }
      const rollback = runCli(t, sandbox, ["rollback", "--json"], { label: "p1: rollback --json (list managed transactions)" });
      const rollbackJson = parseJson(rollback);
      const listed = Boolean(removedJson?.operationId) && Array.isArray(rollbackJson) && rollbackJson.some((journal) => journal.id === removedJson.operationId);
      const journalsAfter = await journalNames(sandbox);
      t.check(
        "life03.pack.reversible",
        listed ? "HOLDS" : "VIOLATED",
        `the removal's transaction id ${listed ? "is" : "is NOT"} listed by rollback --json (status ${Array.isArray(rollbackJson) ? rollbackJson.find((journal) => journal.id === removedJson?.operationId)?.status ?? "absent" : "n/a"}); journals ${journalsBefore.length} -> ${journalsAfter.length}`,
      );
    } else {
      for (const id of ["approve-route", "user-files-kept", "manifest-kept", "empty-dirs-swept", "reversible"]) {
        t.check(`life03.pack.${id}`, "NOT-OBSERVED", "no removal digest was offered, so the approve route could not run");
      }
    }
  }

  // ------------------------------------------------------------ 2. uninstall route
  const p2 = join(projects, "p2-security");
  await mkdir(p2, { recursive: true });
  await createDomainFixture("security", p2);
  gitInit(t, sandbox, p2, "p2");
  t.note(`p2: security domain fixture (${DOMAIN_FIXTURES.security.packId}); its selection comes from the reviewed .alpha-aos/stack.yaml opt-in, so the manifest clause is observable on this route`);
  const p2Run = approveAndSync(t, sandbox, p2, "p2");
  if (p2Run.error) {
    const outcome = p2Run.environmental || (p2Run.previewJson && (p2Run.previewJson.plan?.applicable ?? []).length === 0) ? "NOT-OBSERVED" : "VIOLATED";
    for (const id of ["preview-no-mutation", "pack-removed", "user-file-kept", "manifest-kept"]) {
      t.check(`life03.project.${id}`, outcome, `the uninstall-route setup did not complete: ${p2Run.error}`);
    }
  } else {
    const { syncJson } = p2Run;
    const packFiles = [...syncJson.written, ...syncJson.sidecars].sort();
    t.check("life03.project.synced", "OBSERVED", `sync status=${syncJson.status}; packs=${syncJson.packs.join(", ")}; written=${syncJson.written.join(", ")}; receipts=${syncJson.receipts.join(", ")}`);
    const userNotes = join(p2, ".alpha-aos", "p11-user-notes.txt");
    await writeFile(userNotes, "p11 synthetic user notes: a user wrote this file under .alpha-aos.\n", "utf8");
    const userHash = await fileHash(userNotes);
    const manifest = join(p2, ".alpha-aos", "stack.yaml");
    const manifestHash = await fileHash(manifest);
    const tree = await listTree(p2);
    t.note(`p2: .alpha-aos/ holds before uninstall: ${tree.files.filter((file) => file.startsWith(".alpha-aos/")).join(", ")}`);

    const roots = [p2, sandbox.home, sandbox.state];
    const before = await fingerprintRoots(roots);
    const preview = runCli(t, sandbox, ["uninstall", "--project", p2, "--json"], { label: "p2: uninstall --project (preview) --json" });
    const after = await fingerprintRoots(roots);
    const equal = compareFingerprints(t, "p2 project + sandbox home + state across the uninstall --project preview", before, after);
    const previewJson = parseJson(preview);
    t.check(
      "life03.project.preview-no-mutation",
      preview.status === 0 && equal ? "HOLDS" : "VIOLATED",
      `exit=${preview.status}; filesToRemove=${previewJson?.filesToRemove?.length ?? "n/a"}; digests ${equal ? "equal" : "differ"} before and after`,
    );
    if (previewJson) {
      const rels = previewJson.filesToRemove.map((path) => (path.startsWith(p2) ? path.slice(p2.length + 1).split("\\").join("/") : path));
      t.check("life03.project.preview-lists", "OBSERVED", `the preview lists for removal: ${rels.sort().join(", ")}`);
    }
    const applied = runCli(t, sandbox, ["uninstall", "--project", p2, "--yes", "--apply", "--json"], { label: "p2: uninstall --project --yes --apply --json" });
    const appliedJson = parseJson(applied);
    const left = packFiles.filter((rel) => existsSync(abs(p2, rel)));
    t.check(
      "life03.project.pack-removed",
      appliedJson && left.length === 0 ? "HOLDS" : "VIOLATED",
      `exit=${applied.status}; receipted pack targets still present: ${left.join(", ") || "none"} (of ${packFiles.length}); receipt ${syncJson.receipts.filter((rel) => existsSync(abs(p2, rel))).join(", ") || "removed"}`,
    );
    const userNow = await fileHash(userNotes);
    t.check(
      "life03.project.user-file-kept",
      userNow !== null && userNow === userHash ? "HOLDS" : "VIOLATED",
      `.alpha-aos/p11-user-notes.txt sha ${userHash} -> ${userNow ?? "absent"}`,
    );
    const manifestNow = await fileHash(manifest);
    t.check(
      "life03.project.manifest-kept",
      manifestHash === null ? "NOT-OBSERVED" : manifestNow === manifestHash ? "HOLDS" : "VIOLATED",
      manifestHash === null ? "no .alpha-aos/stack.yaml existed" : `.alpha-aos/stack.yaml sha ${manifestHash} -> ${manifestNow ?? "absent"}`,
    );
  }

  // ------------------------------------------------------------ 3. isolated runtime
  const p3 = join(projects, "p3-isolated");
  await mkdir(p3, { recursive: true });
  await writeFile(join(p3, "README.md"), "# p11 isolated runtime fixture\n", "utf8");
  gitInit(t, sandbox, p3, "p3");
  const init = runCli(t, sandbox, ["project", "isolate", "init", p3, "--mode", "project-only", "--harness", "codex", "--trust", "--apply"], { label: "p3: project isolate init --mode project-only --harness codex --trust --apply" });
  const sync = runCli(t, sandbox, ["project", "isolate", "sync", p3, "--apply", "--json"], { label: "p3: project isolate sync --apply --json" });
  const syncJson = parseJson(sync);
  if (init.status !== 0 || !syncJson?.runtimeRoot) {
    const why = `init exit=${init.status}; sync exit=${sync.status}; stderr: "${stableQuote(sync.stderr || init.stderr) || "empty"}"`;
    for (const id of ["preview-no-mutation", "clean-removes", "project-kept", "journaled"]) t.check(`life03.runtime.${id}`, "NOT-OBSERVED", `the isolated runtime was not created: ${why}`);
  } else {
    // The CLI redaction seam prints the state root as `<state>` and the home as `~`.
    const printed = String(syncJson.runtimeRoot);
    const runtimeRoot = printed.startsWith("<state>")
      ? join(sandbox.state, printed.slice("<state>".length))
      : printed.startsWith("~") ? join(sandbox.home, printed.slice(1)) : printed;
    if (!existsSync(runtimeRoot)) throw new Error("the runtime root printed by project isolate sync does not resolve to an existing directory");
    const runtimeTree = await listTree(runtimeRoot);
    const shownRoot = join(dirname(runtimeRoot), "<project-id>");
    t.check("life03.runtime.synced", "OBSERVED", `runtime root ${shownRoot} (the project id varies with the sandbox path); files: ${runtimeTree.files.join(", ")}`);
    const roots = [p3, sandbox.state, sandbox.home];
    const before = await fingerprintRoots(roots);
    runCli(t, sandbox, ["project", "isolate", "clean", p3], { label: "p3: project isolate clean (preview)" });
    const after = await fingerprintRoots(roots);
    const equal = compareFingerprints(t, "p3 project + sandbox state + home across the clean preview", before, after);
    t.check("life03.runtime.preview-no-mutation", equal ? "HOLDS" : "VIOLATED", `project, state and home digests ${equal ? "equal" : "differ"} across project isolate clean without --apply`);
    const projectBefore = await fingerprintRoots([p3]);
    const journalsBefore = await journalNames(sandbox);
    const clean = runCli(t, sandbox, ["project", "isolate", "clean", p3, "--apply", "--json"], { label: "p3: project isolate clean --apply --json" });
    t.check(
      "life03.runtime.clean-removes",
      clean.status === 0 && !existsSync(runtimeRoot) ? "HOLDS" : "VIOLATED",
      `exit=${clean.status}; runtime root ${existsSync(runtimeRoot) ? "still present" : "gone"}`,
    );
    const projectAfter = await fingerprintRoots([p3]);
    const projectEqual = compareFingerprints(t, "p3 project tree across the clean", projectBefore, projectAfter);
    t.check(
      "life03.runtime.project-kept",
      projectEqual && existsSync(join(p3, ".alpha-aos", "stack.yaml")) ? "HOLDS" : "VIOLATED",
      `project tree digest ${projectEqual ? "unchanged" : "changed"}; .alpha-aos/stack.yaml ${existsSync(join(p3, ".alpha-aos", "stack.yaml")) ? "present" : "absent"}`,
    );
    const journalsAfter = await journalNames(sandbox);
    const fresh = journalsAfter.filter((name) => !journalsBefore.includes(name));
    const covered = new Set();
    for (const name of fresh) {
      try {
        const journal = JSON.parse(await readFile(join(sandbox.state, "journal", name), "utf8"));
        for (const file of journal.files ?? []) covered.add(file.target);
      } catch {
        // unreadable journal counts as not covering anything
      }
    }
    const runtimeFiles = runtimeTree.files.map((rel) => abs(runtimeRoot, rel));
    const uncovered = runtimeFiles.filter((path) => !covered.has(path));
    t.check(
      "life03.runtime.journaled",
      fresh.length > 0 && uncovered.length === 0 ? "HOLDS" : "VIOLATED",
      `${fresh.length} new journal(s); runtime files not listed in them: ${uncovered.join(", ") || "none"} (of ${runtimeFiles.length})`,
    );
  }

  // A fourth project keeps its isolated runtime (no clean) so the full-stack
  // uninstall below shows whether it reaches <state>/isolated.
  const p4 = join(projects, "p4-isolated-kept");
  await mkdir(p4, { recursive: true });
  await writeFile(join(p4, "README.md"), "# p11 isolated runtime kept for uninstall --all\n", "utf8");
  gitInit(t, sandbox, p4, "p4");
  runCli(t, sandbox, ["project", "isolate", "init", p4, "--mode", "project-only", "--harness", "codex", "--trust", "--apply"], { label: "p4: project isolate init --mode project-only --harness codex --trust --apply" });
  const p4Sync = parseJson(runCli(t, sandbox, ["project", "isolate", "sync", p4, "--apply", "--json"], { label: "p4: project isolate sync --apply --json (runtime kept)" }));
  const p4Printed = String(p4Sync?.runtimeRoot ?? "");
  const p4Runtime = p4Printed.startsWith("<state>") ? join(sandbox.state, p4Printed.slice("<state>".length)) : null;
  const p4Existed = p4Runtime !== null && existsSync(p4Runtime);

  const unmarked = join(sandbox.state, "runtimes", "p11-unmarked");
  await mkdir(unmarked, { recursive: true });
  await writeFile(join(unmarked, "keep.txt"), "p11 synthetic unmarked directory under the state runtimes root.\n", "utf8");
  const all = runCli(t, sandbox, ["uninstall", "--all", "--yes", "--apply", "--json"], { label: "uninstall --all --yes --apply --json with an unmarked <state>/runtimes/p11-unmarked directory" });
  t.check(
    "life03.runtime.uninstall-all-unmarked",
    "OBSERVED",
    `exit=${all.status}; <state>/runtimes/p11-unmarked/keep.txt ${existsSync(join(unmarked, "keep.txt")) ? "survived" : "was removed"} (it carries no runtime.json marker); <state>/runtimes ${existsSync(join(sandbox.state, "runtimes")) ? "present" : "absent"}`,
  );
  const isolatedLeft = p4Runtime !== null && existsSync(p4Runtime) ? (await listTree(p4Runtime)).files : [];
  t.check(
    "life03.runtime.uninstall-all-isolated",
    !p4Existed ? "NOT-OBSERVED" : existsSync(p4Runtime) ? "VIOLATED" : "HOLDS",
    !p4Existed
      ? "the p4 isolated runtime was not created, so the full-stack uninstall could not be judged against it"
      : existsSync(p4Runtime)
        ? `the p4 isolated runtime <state>/isolated/<project-id> (generated by project isolate sync, marked by runtime.json) survived uninstall --all --yes --apply; files still present: ${isolatedLeft.join(", ") || "none (empty directory)"}`
        : "the p4 isolated runtime under <state>/isolated was removed by uninstall --all",
  );
});
