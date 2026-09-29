// Phase 6 suites on this host (D-01) and their POSIX corroboration from CI run 35818198049 (D-03).
//
// Re-run: `npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/suites-and-ci.mjs [--out-dir <scratch dir>] [--keep]`
//
// Writes two transcripts: suites-local.txt and ci-35818198049-lifelines.txt.
// Results are recorded, not interpreted: the D-04 oracle audit of each test
// belongs to the per-requirement findings (plans 11-02..11-06).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  evidencePath,
  newScratch,
  probeArgs,
  repositoryRoot,
  runCommand,
  runProbe,
  stripAnsi,
} from "./probe-lib.mjs";

if (probeArgs.out) {
  process.stderr.write("suites-and-ci.mjs writes two transcripts: use --out-dir <dir> instead of --out\n");
  process.exit(1);
}

const PHASE6_SUITES = ["lifecycle", "status", "recovery-receipt", "repair", "rollback", "uninstall"];
const SUPPORTING_SUITES = ["transaction", "transaction-crash", "isolation", "update", "canary", "doctor"];
const UNSET_NAMES = ["ALPHA_AOS_STATE_DIR", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "HERMES_HOME", "PI_CODING_AGENT_DIR", "ANTIGRAVITY_CONFIG_DIR"];
const PACKED_LIFECYCLE_TITLE = "packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle";
const RUN_ID = "35818198049";
const PROOF_COMMIT = "35d4c15";
const JOBS = [
  { os: "ubuntu", runner: "ubuntu-latest", id: "107044319989" },
  { os: "macos", runner: "macos-latest", id: "107044319988" },
  { os: "windows", runner: "windows-latest", id: "107044319963" },
];
const STALENESS_PATHS = [
  "src",
  "scripts",
  "catalog",
  "package.json",
  "package-lock.json",
  ...[...PHASE6_SUITES, ...SUPPORTING_SUITES].map((suite) => `test/${suite}.test.ts`),
];

const RESULT_LINE = /^\s*(✔|✖|﹣)\s+(.*?)\s+\([\d.]+m?s\)(?:\s+#\s*(.*))?\s*$/u;

function testLines(output) {
  return stripAnsi(output).split(/\r?\n/u).filter((line) => RESULT_LINE.test(line));
}

function titlesOf(output) {
  const titles = [];
  for (const line of testLines(output)) {
    const match = RESULT_LINE.exec(line);
    if (match && !titles.includes(match[2])) titles.push(match[2]);
  }
  return titles;
}

function summary(output) {
  const text = stripAnsi(output);
  const value = (name) => {
    const match = new RegExp(`^\\s*ℹ ${name} (\\d+)\\s*$`, "mu").exec(text);
    return match ? Number(match[1]) : null;
  };
  return { tests: value("tests"), pass: value("pass"), fail: value("fail"), skipped: value("skipped"), todo: value("todo"), cancelled: value("cancelled") };
}

function suiteCheck(t, id, result) {
  const s = summary(result.stdout);
  const skippedTitles = testLines(result.stdout)
    .map((line) => RESULT_LINE.exec(line))
    .filter((match) => match && match[3] && /SKIP/iu.test(match[3]))
    .map((match) => match[2]);
  const detail = `exit=${result.status}; tests=${s.tests} pass=${s.pass} fail=${s.fail} skipped=${s.skipped} todo=${s.todo} cancelled=${s.cancelled}`;
  if (s.tests === null || s.fail === null) {
    t.check(id, "NOT-OBSERVED", `${detail}; no summary lines in the runner output`);
  } else if (result.status === 0 && s.fail === 0 && s.tests === s.pass) {
    t.check(id, "HOLDS", detail);
  } else if (result.status === 0 && s.fail === 0 && s.tests === s.pass + (s.skipped ?? 0) + (s.todo ?? 0)) {
    t.check(id, "HOLDS", `${detail}; every non-passing test is an explicit skip or todo: ${skippedTitles.join("; ") || "unnamed"}`);
  } else {
    t.check(id, "VIOLATED", detail);
  }
  return s;
}

const exitCodes = [];
let phase6Titles = [];

// ---------------------------------------------------------------- local suites
await runProbe("suites-local", evidencePath("suites-local.txt"), async (t) => {
  const scratchHome = await newScratch("suites-home", "<scratch-home>");
  const env = { ...process.env, HOME: scratchHome, USERPROFILE: scratchHome };
  for (const name of UNSET_NAMES) delete env[name];
  t.note(`child env: process.env with HOME and USERPROFILE set to <scratch-home> and ${UNSET_NAMES.join(", ")} removed (the Phase 10 host-safe pattern); scripts/run-tests.mjs strips npm lifecycle names`);
  t.note("per-test lines and summary lines below are the runner's own output with ANSI escapes stripped");

  const run = (label, suites) => {
    const files = suites.map((suite) => `dist/test/${suite}.test.js`);
    for (const file of files) {
      if (!existsSync(join(repositoryRoot, file))) throw new Error(`${file} is not built: run npm run build first`);
    }
    return runCommand(t, {
      label,
      executable: process.execPath,
      args: ["scripts/run-tests.mjs", "--files", ...files],
      env,
      cwd: repositoryRoot,
      envOverrides: ["HOME", "USERPROFILE"],
      display: ["node", "scripts/run-tests.mjs", "--files", ...files].join(" "),
      timeoutMs: 1_200_000,
    });
  };

  const phase6 = run("Phase 6 suites", PHASE6_SUITES);
  phase6Titles = titlesOf(phase6.stdout);
  suiteCheck(t, "suites.phase6", phase6);
  const supporting = run("supporting oracle suites", SUPPORTING_SUITES);
  suiteCheck(t, "suites.supporting", supporting);

  const leaked = existsSync(join(scratchHome, ".alpha-aos"));
  t.check("suites.scratch-home-clean", leaked ? "VIOLATED" : "HOLDS", leaked ? "<scratch-home>/.alpha-aos exists after the runs" : "<scratch-home> has no .alpha-aos after both runs");
  t.note(`Phase 6 test titles (${phase6Titles.length}), used to filter the CI job logs: ${phase6Titles.join(" || ")}`);
});
exitCodes.push(process.exitCode ?? 0);

// ---------------------------------------------------------------- CI corroboration
await runProbe("ci-35818198049-lifelines", evidencePath("ci-35818198049-lifelines.txt"), async (t) => {
  if (phase6Titles.length === 0) throw new Error("no Phase 6 test titles were captured from the local run");
  const runView = runCommand(t, {
    label: `CI run ${RUN_ID} identity`,
    executable: "gh",
    args: ["run", "view", RUN_ID, "--json", "headSha,conclusion,event,attempt"],
    cwd: repositoryRoot,
  });
  let run = null;
  try {
    run = JSON.parse(runView.stdout);
  } catch {
    run = null;
  }
  if (run === null) {
    t.check("ci.run", "NOT-OBSERVED", `exit=${runView.status}; gh run view returned no JSON`);
  } else {
    const ok = run.conclusion === "success" && run.event === "push" && String(run.headSha).startsWith(PROOF_COMMIT);
    t.check("ci.run", ok ? "HOLDS" : "VIOLATED", `run ${RUN_ID} attempt ${run.attempt}: conclusion=${run.conclusion}, event=${run.event}, head=${String(run.headSha).slice(0, 7)}`);
  }

  t.note(`Phase 6 titles matched against each job log: ${phase6Titles.length}; packed lifecycle title: "${PACKED_LIFECYCLE_TITLE}"`);
  for (const job of JOBS) {
    const started = process.hrtime.bigint();
    const log = spawnSync("gh", ["run", "view", "--job", job.id, "--log"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 300_000,
      maxBuffer: 256 * 1024 * 1024,
    });
    const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
    const raw = typeof log.stdout === "string" ? log.stdout : "";
    const lines = stripAnsi(raw).split(/\r?\n/u);
    const wanted = [...phase6Titles, PACKED_LIFECYCLE_TITLE];
    const kept = lines.filter((line) => wanted.some((title) => line.includes(title)));
    t.step(`${job.runner} job ${job.id} log lines`, {
      command: `gh run view --job ${job.id} --log   (kept: lines containing a Phase 6 test title or the packed lifecycle title; ANSI stripped; ${lines.length} log lines read)`,
      envOverrides: [],
      status: log.status ?? 1,
      durationMs,
      stdout: kept.join("\n"),
      stderr: typeof log.stderr === "string" ? log.stderr : log.error?.message ?? "",
    });
    if ((log.status ?? 1) !== 0) {
      t.check(`ci.${job.os}.phase6-titles`, "NOT-OBSERVED", `exit=${log.status}; the job log could not be read`);
      t.check(`ci.${job.os}.packed-lifecycle`, "NOT-OBSERVED", `exit=${log.status}; the job log could not be read`);
      continue;
    }
    const verdict = (title) => {
      const hits = kept.filter((line) => line.includes(title));
      const passed = hits.some((line) => /✔/u.test(line));
      const failed = hits.some((line) => /✖/u.test(line));
      return { passed, failed };
    };
    const results = phase6Titles.map((title) => ({ title, ...verdict(title) }));
    const matched = results.filter((entry) => entry.passed && !entry.failed).length;
    const missing = results.filter((entry) => !entry.passed || entry.failed).map((entry) => entry.title);
    t.check(
      `ci.${job.os}.phase6-titles`,
      missing.length === 0 ? "HOLDS" : "VIOLATED",
      `${matched}/${phase6Titles.length} Phase 6 titles carry a pass marker and none a fail marker${missing.length > 0 ? `; not passing: ${missing.join(" || ")}` : ""}`,
    );
    const packed = verdict(PACKED_LIFECYCLE_TITLE);
    t.check(
      `ci.${job.os}.packed-lifecycle`,
      packed.passed && !packed.failed ? "HOLDS" : "VIOLATED",
      `packed lifecycle title: pass marker ${packed.passed ? "present" : "absent"}, fail marker ${packed.failed ? "present" : "absent"}`,
    );
  }

  const staleness = runCommand(t, {
    label: `staleness diff ${PROOF_COMMIT}..HEAD`,
    executable: "git",
    args: ["-c", `safe.directory=${repositoryRoot}`, "-C", repositoryRoot, "diff", "--stat", PROOF_COMMIT, "HEAD", "--", ...STALENESS_PATHS],
    display: ["git", "diff", "--stat", PROOF_COMMIT, "HEAD", "--", ...STALENESS_PATHS].join(" "),
  });
  t.check(
    "ci.staleness",
    staleness.status === 0 && staleness.stdout.trim() === "" ? "HOLDS" : "VIOLATED",
    staleness.status === 0 && staleness.stdout.trim() === ""
      ? `src, scripts, catalog, package.json, package-lock.json and the ${PHASE6_SUITES.length + SUPPORTING_SUITES.length} cited suite files are byte-identical between ${PROOF_COMMIT} and HEAD`
      : `exit=${staleness.status}; cited code differs between ${PROOF_COMMIT} and HEAD`,
  );
  t.note(`test/tarball-fixture.test.ts changed in plan 11-01 (helpers moved to test/helpers/packed-sandbox.ts, dry-run CURRENT and sandbox byte-identity assertions added), so run ${RUN_ID} corroborates its ${PROOF_COMMIT} form; its new oracle is corroborated on POSIX only by the next main CI run`);
});
exitCodes.push(process.exitCode ?? 0);

process.exitCode = exitCodes.includes(3) ? 3 : exitCodes.some((code) => code !== 0) ? 1 : 0;
