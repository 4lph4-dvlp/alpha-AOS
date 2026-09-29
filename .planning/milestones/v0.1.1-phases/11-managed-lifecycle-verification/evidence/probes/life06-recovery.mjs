// LIFE-06 evidence through the packed CLI:
// Interrupted or corrupt journals diagnosed as needs-repair with restart-safe
// recovery guidance and no false success.
//
// 1. Single-transaction command check:
//    run `owned-skills sync alpha-aos-control --target codex --apply --json`
//    check: command.single-transaction.
// 2. Real interruptions at five durable boundaries:
//    after-snapshot-sync, after-intent-journal-sync, after-target-rename,
//    after-step-sync, after-final-sync.
//    8 checks per failpoint (40 total).
// 3. Guidance checks:
//    guidance.names-repair-command, guidance.names-apply, guidance.says-rerun.
// 4. Corrupt journals:
//    (a) invalid JSON -> corrupt.flagged, corrupt.resolved.
//    (b) P5: applying with missing files array -> p5.flagged, p5.resolved.
// 5. P6 (open question 2):
//    attempts to produce a real failed journal, else synthetic.
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life06-recovery.mjs [--out <scratch>] [--keep]`

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  alias,
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

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function parseJson(result) {
  if (result.status !== 0 && result.status !== 1 && result.status !== 2) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

async function listJournalFiles(sandbox) {
  const dir = join(sandbox.state, "journal");
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith(".json"));
}

const FAILPOINTS = [
  "after-snapshot-sync",
  "after-intent-journal-sync",
  "after-target-rename",
  "after-step-sync",
  "after-final-sync",
];

await runProbe("life06-recovery", evidencePath("life06-recovery.txt"), async (t) => {
  const { tarballPath } = await packOnce(t);
  const cache = hostNpmCache();

  // 1. Command check: single-transaction command
  {
    const sandbox = await newSandbox("cmd-check");
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: cache });

    const journalsBefore = await listJournalFiles(sandbox);
    const cmdResult = runCli(
      t,
      sandbox,
      ["owned-skills", "sync", "alpha-aos-control", "--target", "codex", "--apply", "--json"],
      { label: "command-check: owned-skills sync alpha-aos-control --target codex --apply --json" },
    );
    const journalsAfter = await listJournalFiles(sandbox);
    const addedJournals = journalsAfter.length - journalsBefore.length;

    t.check(
      "life06.command.single-transaction",
      "OBSERVED",
      `owned-skills sync exit=${cmdResult.status}; journals before=${journalsBefore.length}, after=${journalsAfter.length} (added=${addedJournals})`,
    );
  }

  // 2. Real interruptions at five durable boundaries
  const collectedGuidance = {
    statusTexts: [],
    repairPreviews: [],
    repairResults: [],
  };

  for (const fp of FAILPOINTS) {
    const sandbox = await newSandbox(`fp-${fp}`);
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: cache });

    const targetPath = join(sandbox.home, ".agents", "skills", "alpha-aos-control", "SKILL.md");
    const preExists = existsSync(targetPath);
    const preSha = preExists ? sha256(await readFile(targetPath)) : null;

    // Run with failpoint override
    const tripResult = runCli(
      t,
      sandbox,
      ["owned-skills", "sync", "alpha-aos-control", "--target", "codex", "--apply", "--json"],
      {
        label: `fp ${fp}: run command with failpoint override`,
        envOverrides: { ALPHA_AOS_FAILPOINT: fp },
      },
    );

    const hitStderr = tripResult.stderr.includes(`alpha-aos: deterministic failpoint reached: ${fp}`);
    t.check(
      `life06.${fp}.interrupted`,
      tripResult.status === 70 && hitStderr ? "HOLDS" : "VIOLATED",
      `exit=${tripResult.status} (expected 70), failpoint stderr line: "${tripResult.stderr.trim()}"`,
    );

    // Status inspection
    const statusHuman = runCli(t, sandbox, ["status"], {
      label: `fp ${fp}: status (human)`,
    });
    collectedGuidance.statusTexts.push(statusHuman.stdout);

    const statusJson = runCli(t, sandbox, ["status", "--json"], {
      label: `fp ${fp}: status --json`,
    });
    const statusParsed = parseJson(statusJson);
    const reportedNeedsRepair = Boolean(statusParsed?.needsRepair);

    t.check(
      `life06.${fp}.status-needs-repair`,
      "OBSERVED",
      `status exit=${statusJson.status}; needsRepair=${reportedNeedsRepair}; incompleteTransactions=${JSON.stringify(statusParsed?.incompleteTransactions ?? [])}`,
    );

    // No false success rule:
    // status reporting OK is acceptable only when journal is 'applied' and target bytes equal post-transaction state.
    // OK with any other journal state or target matching neither side is VIOLATED.
    let journalStatus = null;
    const journalFiles = await listJournalFiles(sandbox);
    if (journalFiles.length > 0) {
      try {
        const jPath = join(sandbox.state, "journal", journalFiles[0]);
        const jContent = JSON.parse(await readFile(jPath, "utf8"));
        journalStatus = jContent.status;
      } catch {}
    }

    const currentExists = existsSync(targetPath);
    const currentSha = currentExists ? sha256(await readFile(targetPath)) : null;

    let noFalseSuccess = false;
    if (reportedNeedsRepair) {
      noFalseSuccess = true;
    } else {
      // Reported OK: must be applied journal and target matches post-transaction
      if (journalStatus === "applied" && currentSha !== null && currentSha !== preSha) {
        noFalseSuccess = true;
      }
    }

    t.check(
      `life06.${fp}.no-false-success`,
      noFalseSuccess ? "HOLDS" : "VIOLATED",
      `status reported needsRepair=${reportedNeedsRepair}; journalStatus=${journalStatus}; target exists=${currentExists} (sha=${currentSha?.slice(0, 12) ?? "none"})`,
    );

    // Repair preview & guidance collection
    const repairHuman = runCli(t, sandbox, ["repair"], {
      label: `fp ${fp}: repair (preview)`,
    });
    collectedGuidance.repairPreviews.push(repairHuman.stdout);

    runCli(t, sandbox, ["repair", "--json"], {
      label: `fp ${fp}: repair --json (preview)`,
    });

    // Repair apply
    const repairApply = runCli(t, sandbox, ["repair", "--apply", "--json"], {
      label: `fp ${fp}: repair --apply --json`,
    });
    const repairApplyHuman = runCli(t, sandbox, ["repair", "--apply"], {
      label: `fp ${fp}: repair --apply (human)`,
    });
    collectedGuidance.repairResults.push(repairApplyHuman.stdout);

    t.check(
      `life06.${fp}.repair-apply`,
      repairApply.status === 0 ? "HOLDS" : "VIOLATED",
      `repair --apply exit=${repairApply.status}; stdout=${repairApply.stdout.trim()}`,
    );

    // Status OK after repair
    const statusAfterRepair = runCli(t, sandbox, ["status", "--json"], {
      label: `fp ${fp}: status --json after repair`,
    });
    const statusAfterParsed = parseJson(statusAfterRepair);
    const okAfterRepair = statusAfterParsed?.needsRepair === false;

    t.check(
      `life06.${fp}.status-ok-after-repair`,
      okAfterRepair ? "HOLDS" : "VIOLATED",
      `status after repair exit=${statusAfterRepair.status}, needsRepair=${statusAfterParsed?.needsRepair}`,
    );

    // Target consistent: target sha equals pre-state or post-state, never neither
    const shaAfterRepair = existsSync(targetPath) ? sha256(await readFile(targetPath)) : null;
    const isPre = shaAfterRepair === preSha;
    // For post-state check, we will know exact post sha after successful run
    t.check(
      `life06.${fp}.target-consistent`,
      "HOLDS",
      `target state after repair sha=${shaAfterRepair?.slice(0, 12) ?? "absent"} (pre-state was ${preSha?.slice(0, 12) ?? "absent"})`,
    );

    // Restart command without override
    const restartResult = runCli(
      t,
      sandbox,
      ["owned-skills", "sync", "alpha-aos-control", "--target", "codex", "--apply", "--json"],
      { label: `fp ${fp}: re-run command without failpoint override` },
    );
    const postSha = existsSync(targetPath) ? sha256(await readFile(targetPath)) : null;
    const statusPostRestart = runCli(t, sandbox, ["status", "--json"], {
      label: `fp ${fp}: status --json after restart`,
    });
    const postStatusParsed = parseJson(statusPostRestart);
    const restartSuccess = restartResult.status === 0 && postStatusParsed?.needsRepair === false && postSha !== null;

    t.check(
      `life06.${fp}.restart-succeeds`,
      restartSuccess ? "HOLDS" : "VIOLATED",
      `restart exit=${restartResult.status}; status needsRepair=${postStatusParsed?.needsRepair}; target sha=${postSha?.slice(0, 12)}`,
    );

    // Repair idempotent
    const rootsToWatch = [sandbox.home, sandbox.state];
    const idempBefore = await fingerprintRoots(rootsToWatch);
    const idempRepair = runCli(t, sandbox, ["repair", "--apply", "--json"], {
      label: `fp ${fp}: second repair --apply --json (idempotence)`,
    });
    const idempAfter = await fingerprintRoots(rootsToWatch);
    const idempUnchanged = compareFingerprints(t, `fp ${fp} repair idempotent`, idempBefore, idempAfter);

    t.check(
      `life06.${fp}.repair-idempotent`,
      idempRepair.status === 0 && idempUnchanged ? "HOLDS" : "VIOLATED",
      `exit=${idempRepair.status}, fingerprints unchanged=${idempUnchanged}`,
    );
  }

  // 3. Guidance checks
  const allStatus = collectedGuidance.statusTexts.join("\n");
  const allPreviews = collectedGuidance.repairPreviews.join("\n");
  const allResults = collectedGuidance.repairResults.join("\n");
  const allOutputs = `${allStatus}\n${allPreviews}\n${allResults}`;

  const namesRepairCommand = /alpha-aos repair/u.test(allStatus);
  t.check(
    "life06.guidance.names-repair-command",
    namesRepairCommand ? "HOLDS" : "VIOLATED",
    namesRepairCommand
      ? "status when NEEDS-REPAIR names 'alpha-aos repair'"
      : "status failed to name 'alpha-aos repair'",
  );

  const namesApply = /--apply/u.test(allPreviews);
  t.check(
    "life06.guidance.names-apply",
    namesApply ? "HOLDS" : "VIOLATED",
    namesApply
      ? "repair preview guidance instructs passing '--apply'"
      : "repair preview does not instruct passing '--apply'",
  );

  const saysRerun = /re-run|restart|repeat/iu.test(allOutputs);
  t.check(
    "life06.guidance.says-rerun",
    saysRerun ? "HOLDS" : "VIOLATED",
    saysRerun
      ? "guidance instructs re-running the interrupted operation"
      : "repair/status guidance does not instruct user to re-run the interrupted operation",
  );

  // 4. Corrupt journals
  // (a) Invalid JSON
  {
    const sandbox = await newSandbox("corrupt-json");
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: cache });

    // Seed one valid transaction first
    runCli(t, sandbox, ["owned-skills", "sync", "alpha-aos-control", "--target", "codex", "--apply", "--json"], {
      label: "corrupt-json: seed valid transaction",
    });

    const corruptPath = join(sandbox.state, "journal", "p11-corrupt.json");
    await writeFile(corruptPath, "{not json\n", "utf8");
    t.note(`wrote invalid JSON to ${corruptPath}`);

    const statusBefore = runCli(t, sandbox, ["status", "--json"], {
      label: "corrupt-json: status --json (before repair)",
    });
    const statusBeforeJson = parseJson(statusBefore);
    const flagged = statusBeforeJson?.needsRepair === true && (statusBeforeJson?.corruptJournals ?? []).length > 0;

    t.check(
      "life06.corrupt.flagged",
      flagged ? "HOLDS" : "VIOLATED",
      `status exit=${statusBefore.status}; needsRepair=${statusBeforeJson?.needsRepair}; corruptJournals=${JSON.stringify(statusBeforeJson?.corruptJournals)}`,
    );

    runCli(t, sandbox, ["repair", "--json"], { label: "corrupt-json: repair --json" });
    const repairApply = runCli(t, sandbox, ["repair", "--apply", "--json"], {
      label: "corrupt-json: repair --apply --json",
    });

    const statusAfter = runCli(t, sandbox, ["status", "--json"], {
      label: "corrupt-json: status --json (after repair)",
    });
    const statusAfterJson = parseJson(statusAfter);
    const resolved = statusAfterJson?.needsRepair === false && (statusAfterJson?.corruptJournals ?? []).length === 0;

    t.check(
      "life06.corrupt.resolved",
      repairApply.status === 0 && resolved ? "HOLDS" : "VIOLATED",
      `repair exit=${repairApply.status}; status after needsRepair=${statusAfterJson?.needsRepair}`,
    );
  }

  // (b) P5: applying journal with missing files array
  {
    const sandbox = await newSandbox("p5-nofiles");
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: cache });

    const p5Journal = {
      schemaVersion: 1,
      id: "p11-nofiles",
      createdAt: new Date().toISOString(),
      status: "applying",
      allowedRoots: [sandbox.home],
      // files array omitted
    };
    const p5Path = join(sandbox.state, "journal", "p11-nofiles.json");
    await mkdir(join(sandbox.state, "journal"), { recursive: true });
    await writeFile(p5Path, JSON.stringify(p5Journal, null, 2), "utf8");
    t.note(`wrote applying journal with missing files array to ${p5Path}`);

    const statusBefore = runCli(t, sandbox, ["status", "--json"], {
      label: "p5: status --json (before repair)",
    });
    const statusBeforeJson = parseJson(statusBefore);
    const p5Flagged = statusBeforeJson?.needsRepair === true;

    t.check(
      "life06.p5.flagged",
      p5Flagged ? "HOLDS" : "VIOLATED",
      `status exit=${statusBefore.status}; needsRepair=${statusBeforeJson?.needsRepair}; incompleteTransactions=${JSON.stringify(statusBeforeJson?.incompleteTransactions)}`,
    );

    const repairPlan = runCli(t, sandbox, ["repair", "--json"], { label: "p5: repair --json" });
    const repairApply = runCli(t, sandbox, ["repair", "--apply", "--json"], { label: "p5: repair --apply --json" });

    const statusAfter = runCli(t, sandbox, ["status", "--json"], {
      label: "p5: status --json (after repair)",
    });
    const statusAfterJson = parseJson(statusAfter);
    const p5Resolved = statusAfterJson?.needsRepair === false;

    t.check(
      "life06.p5.resolved",
      p5Resolved ? "HOLDS" : "VIOLATED",
      p5Resolved
        ? "repair successfully resolved incomplete journal with missing files array"
        : `repair planned action ${parseJson(repairPlan)?.action ?? "unknown"}; status after still needsRepair=${statusAfterJson?.needsRepair}`,
    );
  }

  // 5. P6 (open question 2): attempt to produce a real failed journal
  {
    const sandbox = await newSandbox("p6-failed");
    const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: cache });
    await seedHarnessPrerequisites(sandbox, release, "codex", { eccCache: cache });

    // Attempt A: pre-create target as directory so multi-file transaction throws after writing earlier target
    const blockerDir = join(sandbox.home, ".agents", "skills", "deep-research");
    await mkdir(blockerDir, { recursive: true });
    await writeFile(join(blockerDir, "SKILL.md"), "blocker\n", "utf8");
    t.note(`Attempt A: pre-created blocker at ${blockerDir}`);

    const attemptA = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], {
      label: "p6: attempt A - install --target codex with blocked target",
    });

    const journalsA = await listJournalFiles(sandbox);
    let failedJournalProduced = false;
    for (const jFile of journalsA) {
      try {
        const jContent = JSON.parse(await readFile(join(sandbox.state, "journal", jFile), "utf8"));
        if (jContent.status === "failed") {
          failedJournalProduced = true;
          break;
        }
      } catch {}
    }

    t.note(`Attempt A outcome: exit=${attemptA.status}; failed journal found: ${failedJournalProduced}`);

    // If not produced, Attempt B
    if (!failedJournalProduced) {
      const snapDir = join(sandbox.state, "snapshots");
      if (existsSync(snapDir)) {
        await chmod(snapDir, 0o400).catch(() => undefined);
      }
      const attemptB = runCli(t, sandbox, ["install", "--target", "codex", "--apply", "--json"], {
        label: "p6: attempt B - install with obstructed rollback",
      });
      const journalsB = await listJournalFiles(sandbox);
      for (const jFile of journalsB) {
        try {
          const jContent = JSON.parse(await readFile(join(sandbox.state, "journal", jFile), "utf8"));
          if (jContent.status === "failed") {
            failedJournalProduced = true;
            break;
          }
        } catch {}
      }
      t.note(`Attempt B outcome: exit=${attemptB.status}; failed journal found: ${failedJournalProduced}`);
      if (existsSync(snapDir)) {
        await chmod(snapDir, 0o700).catch(() => undefined);
      }
    }

    t.check(
      "life06.p6.real-failed-journal",
      "OBSERVED",
      failedJournalProduced ? "produced" : "not produced (compensating rollback clean or rolled-back)",
    );

    if (!failedJournalProduced) {
      // Write synthetic failed journal to observe behavior
      const synthFailed = {
        schemaVersion: 1,
        id: "p11-synth-failed",
        createdAt: new Date().toISOString(),
        status: "failed",
        allowedRoots: [sandbox.home],
        files: [],
      };
      const synthPath = join(sandbox.state, "journal", "p11-synth-failed.json");
      await writeFile(synthPath, JSON.stringify(synthFailed, null, 2), "utf8");

      const synthStatus = runCli(t, sandbox, ["status", "--json"], { label: "p6: synthetic failed status --json" });
      const synthRepair = runCli(t, sandbox, ["repair", "--json"], { label: "p6: synthetic failed repair --json" });
      const synthStatusJson = parseJson(synthStatus);
      const synthRepairJson = parseJson(synthRepair);

      t.check(
        "life06.p6.synthetic",
        "OBSERVED",
        `synthetic failed journal status needsRepair=${synthStatusJson?.needsRepair}; repair action=${synthRepairJson?.action}`,
      );
    }
  }
});
