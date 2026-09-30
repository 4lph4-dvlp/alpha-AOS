// The Phase 14 vertical tracer on REAL agents.
//
// Explicitly invoked, never part of `npm test`: `scripts/run-tests.mjs`
// enumerates only `*.test.js`, and this file ends in `.integration.ts`. Every
// test here spends model turns under the user's own Codex and Claude accounts
// (one GSD quick session and one review per run), except one: the "sandboxed
// GSD commit" canary drives only `codex sandbox` and `codex debug
// prompt-input` with the adapter-built permission profile and spends no model
// turn. Run a test by name:
//
//   npm run build && node scripts/run-tests.mjs --test-name-pattern="accept a correct" --files dist/test/task-tracer.integration.js
//
// It never skips. A host without the proven bootstrap pair or without GSD Core
// installed for Codex FAILS with a message starting `NOT PROVEN:`, because a
// skipped live proof would read as a passed one (T-14-42).
//
// Every live step goes through the compiled CLI with a scratch
// ALPHA_AOS_STATE_DIR, and the real agents only ever work inside a generated
// project under the OS temp directory with its own git repository (D-09,
// T-14-41) — never in this repository and never in the host state root.
//
// Status on the Windows 11 development host: live runs now use the 14-07 git
// authority (named permission profile alpha-aos-task, user/project execpolicy
// rules ignored, run-scoped safe.directory, selected option git-dir-profile).
// Live tracer execution proves accepted, rejected, and stale review cases.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { probeTaskAgentPair, resolveTaskAgentLaunch, TASK_BOOTSTRAP_PAIR } from "../src/adapters/task-agents.js";
import {
  CODEX_TASK_PERMISSION_PROFILE,
  codexGitAuthorityOverrides,
  codexTaskEnvironment,
  writeCodexRunGitConfig,
} from "../src/adapters/task-codex.js";
import { canonicalizeWithMissingTail } from "../src/core/path-boundary.js";
import { resolveCommand, runProcess, type ProcessResult } from "../src/core/process.js";
import { collectTaskArtifact } from "../src/core/task-check.js";
import { resolveTaskGitDirectory } from "../src/core/task-git.js";
import { buildGsdControllerPrompt, resolveInstalledGsdTools } from "../src/core/task-gsd.js";
import { readTaskReport, type TaskRunRecord } from "../src/core/task-run.js";
import { assessTaskReview, reduceTaskVerdict } from "../src/core/task-verdict.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  liveTaskEnvironment,
  seededDefectContract,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";
import { gitCommand } from "./helpers/git-fixture.js";
import type { TaskContract } from "../src/core/task-contract.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const OUTPUT_BYTES = 4 * 1024 * 1024;
const START_TIMEOUT_MS = 75 * 60 * 1000;
const STEP_TIMEOUT_MS = 60 * 1000;

/** Fails with `NOT PROVEN:` unless this host has the proven pair and GSD Core for Codex. */
async function requireLiveHarnesses(): Promise<void> {
  const reasons: string[] = [];
  const pair = await probeTaskAgentPair({ ...TASK_BOOTSTRAP_PAIR, reviewerSession: "fresh-read-only" });
  if (!pair.supported) reasons.push(...pair.missingProof);
  if (resolveInstalledGsdTools() === null) reasons.push("GSD Core is not installed for the Codex controller");
  if (reasons.length > 0) throw new Error(`NOT PROVEN: ${reasons.join("; ")}`);
}

async function aos(fixture: TaskFixture, args: readonly string[], timeoutMs = STEP_TIMEOUT_MS): Promise<{ result: ProcessResult; ms: number }> {
  const started = Date.now();
  const result = await runProcess({
    executable: process.execPath,
    args: [cliEntry, ...args],
    cwd: fixture.scratch,
    environment: liveTaskEnvironment(fixture.stateRoot),
    timeoutMs,
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
  return { result, ms: Date.now() - started };
}

function expectOk(step: string, result: ProcessResult): void {
  assert.equal(result.exitCode, 0, `${step} failed (${result.code}): ${result.stderr.excerpt}`);
}

/**
 * Preview, approve and start one contract through the CLI only. Returns the
 * run as printed on stdout (the redacted JSON envelope) and as persisted in
 * the scratch state root, which keeps the observed session ids the envelope
 * withholds.
 */
async function previewApproveStart(
  context: TestContext,
  fixture: TaskFixture,
  contractId: string,
): Promise<{ start: ProcessResult; printed: TaskRunRecord; run: TaskRunRecord; ms: number }> {
  const preview = await aos(fixture, ["task", "preview", fixture.contractPath, "--json"]);
  expectOk("task preview", preview.result);
  const digest = (JSON.parse(preview.result.stdout.excerpt) as { digest: string }).digest;
  const approve = await aos(fixture, ["task", "approve", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  expectOk("task approve", approve.result);

  const start = await aos(fixture, ["task", "start", fixture.contractPath, "--contract-digest", digest, "--apply", "--json"], START_TIMEOUT_MS);
  let printed: TaskRunRecord;
  try {
    printed = JSON.parse(start.result.stdout.excerpt) as TaskRunRecord;
  } catch {
    throw new Error(
      `task start printed no run record (${start.result.code}, exit ${String(start.result.exitCode)}): ${start.result.stderr.excerpt.slice(0, 4000)}`,
    );
  }
  const run = await readTaskReport({ stateRoot: fixture.stateRoot, contractId, runId: printed.runId });
  assert.ok(run !== null, `run ${printed.runId} is not persisted in the scratch state root`);
  // The whole persisted record, on every outcome, so a failed live run can be
  // diagnosed without spending another one. It passed the credential check
  // before it was written.
  context.diagnostic(`run record ${JSON.stringify(run)}`);
  if (start.result.stderr.excerpt.trim() !== "") context.diagnostic(`task start stderr ${start.result.stderr.excerpt.slice(0, 4000)}`);
  if (start.result.exitCode !== 0 || run.executor?.claim === null) {
    context.diagnostic(
      `previewApproveStart failure diagnostic: exitCode ${String(start.result.exitCode)}, processCode ${run.executor?.processCode ?? "none"}, terminal ${run.executor?.terminal ?? "none"}, detail: ${run.executor?.detail ?? "none"}`,
    );
  }
  return { start: start.result, printed, run, ms: start.ms };
}

test("a real Codex GSD quick run and a fresh Claude review accept a correct inventory-summary CLI", async (context) => {
  await requireLiveHarnesses();
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));

  const { start, printed, run, ms } = await previewApproveStart(context, fixture, "inventory-summary");
  assert.equal(printed.status, run.status);
  assert.equal(printed.runId, run.runId);

  assert.equal(start.exitCode, 0, `task start exited ${String(start.exitCode)} with status ${run.status}`);
  assert.equal(run.status, "accepted");
  assert.ok(run.artifact !== null && run.verdict !== null && run.executor !== null && run.reviewer !== null);
  assert.ok(run.reviewer.report !== null, "the reviewer returned no bound report");
  assert.ok(run.gsd !== null && run.effects !== null);

  assert.equal(run.verdict.rows.length, 2);
  for (const row of run.verdict.rows) {
    assert.equal(row.verdict, "pass", `${row.criterionId}: ${row.reason}`);
    assert.equal(row.measured.outcome, "pass", `${row.criterionId}: ${row.measured.detail}`);
    assert.equal(row.review?.verdict, "pass", `${row.criterionId}: ${row.review?.evidence ?? "no review"}`);
    assert.equal(row.artifactDigest, run.artifact.digest);
  }
  assert.equal(run.reviewer.report.artifactDigest, run.artifact.digest);

  assert.equal(run.reviewer.sessionId, run.reviewer.requestedSessionId);
  assert.notEqual(run.reviewer.sessionId, run.executor.sessionId);
  assert.equal(run.executor.harness, "codex");
  assert.equal(run.reviewer.harness, "claude");
  assert.ok(run.executor.version !== null, "the executor version was not recorded");
  assert.ok(run.reviewer.version !== null, "the reviewer version was not recorded");

  assert.equal(run.gsd.status, "verified", `GSD evidence missing: ${run.gsd.missing.join("; ")}`);
  assert.ok(run.gsd.quickId !== null);
  assert.ok(
    run.gsd.commits.some((c) => c.subject.startsWith(`docs(quick-${run.gsd!.quickId})`)),
    `expected a docs(quick-${run.gsd.quickId}) commit in ${JSON.stringify(run.gsd.commits)}`,
  );
  assert.deepEqual(
    run.verdict.rows.map((row) => row.criterionId),
    ["invalid-quantity", "valid-summary"],
  );
  const resolution = await resolveTaskGitDirectory(fixture.projectRoot);
  assert.equal(resolution.status, "grantable");
  assert.equal(run.gitDirectory, (resolution as { gitDirectory: string }).gitDirectory);
  assert.deepEqual(run.effects.violations, []);
  assert.ok(run.decisions.length >= 1, `no decision was recorded (log ${run.decisionLog?.status ?? "not read"}: ${run.decisionLog?.reason ?? ""})`);

  const report = await aos(fixture, ["task", "report", "inventory-summary"]);
  expectOk("task report", report.result);
  assert.match(report.result.stdout.excerpt, /ACCEPTED/u);
  assert.match(report.result.stdout.excerpt, /Git directory granted to the controller:/u);

  context.diagnostic(
    [
      `run ${run.runId}`,
      `executor codex-cli ${run.executor.version}`,
      `reviewer ${run.reviewer.version} (Claude Code)`,
      `executor session ${run.executor.sessionId ?? "none"}`,
      `reviewer session ${run.reviewer.sessionId ?? "none"} (requested ${run.reviewer.requestedSessionId})`,
      `artifact ${run.artifact.digest}`,
      `contract ${run.contractDigest}`,
      `gsd quick ${run.gsd.quickId}`,
      `git directory ${run.gitDirectory ?? "none"}`,
      `cli duration ${ms} ms`,
    ].join(" | "),
  );
});

const CANARY_TIMEOUT_MS = 120 * 1000;

async function sha256OfFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

function hostGitSubject(projectRoot: string): string {
  const log = gitCommand(projectRoot, ["log", "-1", "--format=%s"]);
  assert.ok(log.ok, `host git log failed: ${log.stderr}`);
  return log.stdout.trim();
}

function collectStrings(value: unknown, into: string[]): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) collectStrings(item, into);
  return into;
}

function normalizedPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
}

test("the approved git directory profile lets a sandboxed GSD commit land and keeps git control files read-only (no model turn)", async (context) => {
  await requireLiveHarnesses();
  const fixture = await createTaskFixture(context);
  const resolution = await resolveTaskGitDirectory(fixture.projectRoot);
  assert.equal(resolution.status, "grantable", `the fixture git directory must be grantable: ${JSON.stringify(resolution)}`);
  if (resolution.status !== "grantable") return;
  const gitDirectory = resolution.gitDirectory;
  const root = await canonicalizeWithMissingTail(fixture.projectRoot);
  assert.equal(root.reason, null);
  const projectRoot = root.canonical;

  const canary = join(fixture.scratch, "codex-canary");
  await mkdir(canary, { recursive: true });
  const gitConfigGlobal = await writeCodexRunGitConfig({ workDirectory: canary, projectRoot });
  const environment = codexTaskEnvironment(process.env, { gitConfigGlobal });
  const overrides = codexGitAuthorityOverrides(gitDirectory);
  const launch = resolveTaskAgentLaunch("codex");
  assert.equal(launch.status, "ok", launch.status === "ok" ? "" : `NOT PROVEN: ${launch.reason}`);
  if (launch.status !== "ok") return;
  const git = resolveCommand("git");
  assert.ok(git !== null, "NOT PROVEN: git is not on PATH");
  const gsdTools = resolveInstalledGsdTools();
  assert.ok(gsdTools !== null, "NOT PROVEN: GSD Core is not installed for the Codex controller");

  const steps: string[] = [];
  const record = (step: string, result: ProcessResult): void => {
    steps.push(`${step}: ${result.code} exit ${String(result.exitCode)}${result.stderr.excerpt.trim() === "" ? "" : ` stderr ${result.stderr.excerpt.trim().slice(0, 300)}`}`);
  };
  const sandboxed = async (step: string, command: readonly string[]): Promise<ProcessResult> => {
    const result = await runProcess({
      executable: launch.executable,
      args: [...launch.argsPrefix, "sandbox", "-P", CODEX_TASK_PERMISSION_PROFILE, "-C", projectRoot, ...overrides, "--", ...command],
      cwd: projectRoot,
      environment,
      timeoutMs: CANARY_TIMEOUT_MS,
      maxOutputBytes: OUTPUT_BYTES,
      excerptBytes: OUTPUT_BYTES,
    });
    record(step, result);
    return result;
  };

  try {
    // 1. A plain sandboxed git add and commit land in the granted git directory.
    await appendFile(join(projectRoot, "README.md"), "\ncanary line one\n", "utf8");
    const add = await sandboxed("sandboxed git add", [git, "add", "README.md"]);
    assert.equal(add.exitCode, 0, `sandboxed git add failed: ${add.stderr.excerpt}`);
    const commit = await sandboxed("sandboxed git commit", [git, "commit", "-m", "canary: sandboxed commit"]);
    assert.equal(commit.exitCode, 0, `sandboxed git commit failed: ${commit.stderr.excerpt}`);
    assert.equal(hostGitSubject(projectRoot), "canary: sandboxed commit");
    steps.push(`host log after git commit: ${hostGitSubject(projectRoot)}`);

    // 2. The installed gsd-tools commit (GSD quick's docs commit) lands too.
    await appendFile(join(projectRoot, "README.md"), "canary line two\n", "utf8");
    const gsd = await sandboxed("sandboxed gsd-tools query commit", [
      process.execPath,
      gsdTools,
      "query",
      "commit",
      "docs(quick-000000-cnr): sandbox canary",
      "--files",
      "README.md",
    ]);
    assert.equal(gsd.exitCode, 0, `gsd-tools query commit failed: ${gsd.stderr.excerpt}`);
    const envelope = JSON.parse(gsd.stdout.excerpt.slice(gsd.stdout.excerpt.indexOf("{"))) as { committed?: unknown };
    assert.equal(envelope.committed, true, `gsd-tools did not commit: ${gsd.stdout.excerpt}`);
    assert.match(hostGitSubject(projectRoot), /^docs\(quick-000000-cnr\)/u);
    steps.push(`host log after gsd-tools commit: ${hostGitSubject(projectRoot)}`);

    // 3. The git control files stay read-only and byte-identical.
    const configPath = join(gitDirectory, "config");
    const attributesPath = join(gitDirectory, "info", "attributes");
    const preCommitPath = join(gitDirectory, "hooks", "pre-commit");
    if (!(await exists(attributesPath))) await writeFile(attributesPath, "# canary baseline\n", "utf8");
    const configBefore = await sha256OfFile(configPath);
    const attributesBefore = await sha256OfFile(attributesPath);
    assert.equal(await exists(preCommitPath), false);
    const probeScript = join(canary, "write-control-files.cjs");
    await writeFile(
      probeScript,
      [
        "\"use strict\";",
        "const { appendFileSync } = require(\"node:fs\");",
        "const { join } = require(\"node:path\");",
        `const gitDirectory = ${JSON.stringify(gitDirectory)};`,
        "for (const relative of [\"config\", \"hooks/pre-commit\", \"info/attributes\"]) {",
        "  try {",
        "    appendFileSync(join(gitDirectory, relative), \"# planted\\n\");",
        "    process.stdout.write(`${relative} WRITTEN\\n`);",
        "  } catch (error) {",
        "    process.stdout.write(`${relative} ${error.code}\\n`);",
        "  }",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const control = await sandboxed("sandboxed control-file writes", [process.execPath, probeScript]);
    steps.push(`control-file write results: ${control.stdout.excerpt.trim().replaceAll(/\r?\n/gu, "; ")}`);
    for (const relative of ["config", "hooks/pre-commit", "info/attributes"]) {
      const line = control.stdout.excerpt.split(/\r?\n/u).find((entry) => entry.startsWith(`${relative} `));
      assert.ok(line !== undefined, `the probe reported ${relative}: ${control.stdout.excerpt}`);
      assert.match(line, / (EPERM|EACCES)$/u, `${relative} must be refused`);
    }
    assert.equal(await sha256OfFile(configPath), configBefore, ".git/config is byte-identical");
    assert.equal(await sha256OfFile(attributesPath), attributesBefore, ".git/info/attributes is byte-identical");
    assert.equal(await exists(preCommitPath), false, ".git/hooks/pre-commit is still absent");

    // 4. The model-visible permissions name only the approved writable roots.
    const rendered = await runProcess({
      executable: launch.executable,
      args: [...launch.argsPrefix, "debug", "prompt-input", ...overrides, "canary"],
      cwd: projectRoot,
      environment,
      timeoutMs: CANARY_TIMEOUT_MS,
      maxOutputBytes: OUTPUT_BYTES,
      excerptBytes: OUTPUT_BYTES,
    });
    record("codex debug prompt-input", rendered);
    assert.equal(rendered.exitCode, 0, `prompt-input failed: ${rendered.stderr.excerpt}`);
    const text = collectStrings(JSON.parse(rendered.stdout.excerpt), []).join("\n");
    assert.ok(text.includes("Network access is restricted"), "network access is restricted");
    const sentence = /writable roots are ((?:`[^`]+`(?:, )?)+)/u.exec(text);
    assert.ok(sentence !== null, "the permissions name their writable roots");
    const writable = [...(sentence[1] as string).matchAll(/`([^`]+)`/gu)].map((match) => match[1] as string);
    steps.push(`rendered writable roots: ${writable.join(", ")}`);
    const allowed = new Set(
      [projectRoot, gitDirectory, process.env.TMPDIR, process.env.TEMP, process.env.TMP]
        .filter((value): value is string => typeof value === "string" && value !== "")
        .map(normalizedPath),
    );
    for (const path of writable) assert.ok(allowed.has(normalizedPath(path)), `${path} is not an approved writable root`);
    assert.ok(writable.map(normalizedPath).includes(normalizedPath(projectRoot)), "the project root is writable");
  } finally {
    context.diagnostic(`canary steps | ${steps.join(" | ")}`);
  }
});

let defectRunRecord: TaskRunRecord | null = null;
let defectFixture: TaskFixture | null = null;
let defectContractHolder: TaskContract | null = null;
let defectFixtureCleanup: (() => Promise<void>) | null = null;

test("a real run that claims success with wrong JSON is rejected by measurement", async (context) => {
  await requireLiveHarnesses();
  let keepFixtureForNextTest = false;
  const fixture = await createTaskFixture({
    after(fn: () => Promise<void>) {
      defectFixtureCleanup = fn;
      context.after(async () => {
        if (!keepFixtureForNextTest && defectFixtureCleanup !== null) {
          await defectFixtureCleanup();
          defectFixtureCleanup = null;
        }
      });
    },
  } as unknown as TestContext);
  const plainContract = inventorySummaryContract(fixture.projectRoot);
  const defectContract = seededDefectContract(fixture.projectRoot);

  // Before any launch, prove offline that the controller cannot see the planted value.
  const promptPlain = buildGsdControllerPrompt({
    contract: plainContract,
    runId: "run-offline-test",
    contractDigest: "0".repeat(64),
    decisionLogPath: ".alpha-aos/task-runs/run-offline-test/decisions.jsonl",
    outline: { sourceSha256: "0".repeat(64), stepNames: [] },
  });
  const promptDefect = buildGsdControllerPrompt({
    contract: defectContract,
    runId: "run-offline-test",
    contractDigest: "0".repeat(64),
    decisionLogPath: ".alpha-aos/task-runs/run-offline-test/decisions.jsonl",
    outline: { sourceSha256: "0".repeat(64), stepNames: [] },
  });
  assert.equal(promptDefect.replaceAll("inventory-summary-b", "inventory-summary"), promptPlain);

  await writeTaskContract(fixture.contractPath, defectContract);
  const { start, printed, run, ms } = await previewApproveStart(context, fixture, "inventory-summary-b");

  defectRunRecord = run;
  defectFixture = fixture;
  defectContractHolder = defectContract;

  if (run.executor?.claim?.status !== "completed" || run.executor?.exitCode !== 0 || run.gsd?.status !== "verified") {
    context.diagnostic(
      `defect run failure diagnostic: exitCode ${String(run.executor?.exitCode)}, claim ${run.executor?.claim?.status ?? "none"}, detail: ${run.executor?.detail ?? "none"}, gsd: ${run.gsd?.status ?? "none"}`,
    );
    if (run.executor?.detail) {
      context.diagnostic(`defect run executor detail excerpt: ${run.executor.detail}`);
    }
    throw new Error(
      `NOT PROVEN: D-11 condition not exercised (run ${run.runId}, claim ${run.executor?.claim?.status ?? "none"}, exitCode ${String(run.executor?.exitCode)}, gsd ${run.gsd?.status ?? "none"})`,
    );
  }

  assert.equal(start.exitCode, 1, `task start exited ${String(start.exitCode)} with status ${run.status}`);
  assert.equal(run.status, "rejected");

  assert.ok(run.verdict !== null);
  const validRow = run.verdict.rows.find((r) => r.criterionId === "valid-summary");
  assert.ok(validRow !== undefined, "valid-summary row missing");
  assert.equal(validRow.verdict, "fail");
  assert.equal(validRow.measured.outcome, "fail");
  assert.match(validRow.measured.detail ?? "", /totalQuantity/u);

  assert.ok(run.executor !== null && run.executor.claim !== null);
  assert.equal(run.executor.claim.status, "completed");
  assert.equal(run.executor.exitCode, 0);

  assert.deepEqual(
    run.verdict.rows.map((row) => row.criterionId),
    ["invalid-quantity", "valid-summary"],
  );

  const resolution = await resolveTaskGitDirectory(fixture.projectRoot);
  assert.equal(resolution.status, "grantable");
  assert.equal(run.gitDirectory, (resolution as { gitDirectory: string }).gitDirectory);

  keepFixtureForNextTest = true;

  context.diagnostic(
    [
      `defect run ${run.runId}`,
      `status ${run.status}`,
      `claim ${run.executor.claim.status}`,
      `exit ${run.executor.exitCode}`,
      `valid-summary measured ${validRow.measured.detail}`,
      `cli duration ${ms} ms`,
    ].join(" | "),
  );
});

test("a real review report substituted onto a changed artifact is refused as stale", async (context) => {
  context.after(async () => {
    if (defectFixtureCleanup !== null) {
      await defectFixtureCleanup();
      defectFixtureCleanup = null;
    }
  });

  if (
    defectRunRecord === null ||
    defectFixture === null ||
    defectContractHolder === null ||
    defectRunRecord.reviewer?.report == null ||
    defectRunRecord.executor?.claim?.status !== "completed" ||
    defectRunRecord.executor?.exitCode !== 0 ||
    defectRunRecord.gsd?.status !== "verified"
  ) {
    const issues =
      defectRunRecord?.reviewer?.report == null
        ? "report is null"
        : defectRunRecord.executor?.claim?.status !== "completed"
          ? `claim status is ${defectRunRecord.executor?.claim?.status ?? "none"}`
          : "defect run not executed";
    throw new Error(`NOT PROVEN: no real review report to substitute (${issues})`);
  }

  const run = defectRunRecord;
  const fixture = defectFixture;
  const contract = defectContractHolder;
  const reviewer = run.reviewer;
  assert.ok(reviewer !== null);
  const originalReport = reviewer.report;
  assert.ok(originalReport !== null);

  // Append one newline to bin/inventory-summary.mjs and re-collect the artifact
  const scriptPath = join(fixture.projectRoot, "bin", "inventory-summary.mjs");
  await appendFile(scriptPath, "\n", "utf8");

  const recollected = await collectTaskArtifact({
    projectRoot: fixture.projectRoot,
    allowedRoots: contract.allowedRoots,
  });
  assert.equal(recollected.status, "ok");
  assert.notEqual(recollected.digest, originalReport.artifactDigest);

  // Call assessTaskReview with the real report, request with new artifactDigest
  const changedAssessment = assessTaskReview({
    report: originalReport,
    request: {
      requestId: reviewer.requestId,
      sessionId: reviewer.requestedSessionId,
      contractDigest: run.contractDigest,
      artifactDigest: recollected.digest,
    },
    portSessionId: reviewer.sessionId,
    contract,
  });
  assert.equal(changedAssessment.status, "stale");

  // Call reduceTaskVerdict with stored measurements, that assessment, refusal stale-review and stored preconditions
  assert.ok(run.verdict !== null);
  const measurements = run.verdict.rows.map((row) => row.measured);
  const reduced = reduceTaskVerdict({
    contract,
    artifactDigest: recollected.digest,
    measurements,
    review: changedAssessment,
    confirmations: new Map(),
    preconditions: run.verdict.preconditions,
    refusal: null,
  });
  assert.notEqual(reduced.overall, "accepted");
  assert.equal(reduced.refusal, "stale-review");

  // Also assert that assessTaskReview with the unchanged artifact digest and a different requestId is also stale
  const differentRequestAssessment = assessTaskReview({
    report: originalReport,
    request: {
      requestId: "00000000-0000-0000-0000-000000000000",
      sessionId: reviewer.requestedSessionId,
      contractDigest: run.contractDigest,
      artifactDigest: originalReport.artifactDigest,
    },
    portSessionId: reviewer.sessionId,
    contract,
  });
  assert.equal(differentRequestAssessment.status, "stale");
});
