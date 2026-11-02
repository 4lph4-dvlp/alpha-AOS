#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const HARNESSES = ["claude", "codex", "antigravity", "pi", "hermes"];
export const AXES = [
  "policy-query-and-set", "independent-task-reselection", "bootstrap-and-recovery-handoff",
  "conversational-quick", "conversational-quick-full", "conversational-phase",
  "autopilot-quick", "autopilot-quick-full", "autopilot-phase",
  "question-ui-delivery", "gsd-controller-authority",
];
const STATUSES = ["verified-native", "verified-fixture", "unsupported", "unverified", "blocked"];
const PRIVATE_PATH_PATTERN = /([a-zA-Z]:[\\/](?:Users|dev|home|temp|AppData)|[\\/](?:home|Users)[\\/])/iu;
const REQUIRED_FILES = [
  "skills/alpha-aos-task/SKILL.md", "schemas/behavior-policy.schema.json",
  "schemas/task-intake.schema.json", "schemas/task-bootstrap.schema.json",
  "schemas/task-contract.schema.json", "schemas/task-gsd-stage-receipt.schema.json",
  "schemas/task-receipt.schema.json", "docs/task-bootstrap-proof.md",
  "docs/task-style-proof.md", "docs/task-style-proof-index.json",
];
const SCENARIOS = ["chain-policy-transition", "chain-task-boundary", "chain-bootstrap-continuity", "chain-quality-and-tamper-guards"];
const HOLDS = ["3-os-macos-ci", "claude-g-07-2", "global-reconcile", "git-push", "npm-publish"];
const DEBT_SUITES = ["task-progress-integration.test.js", "task-progress.test.js", "verify-efficient-wait.test.js", "tarball-fixture.test.js"];
const NATIVE_COMMITS = {
  pi: "f0b7f315c9d719a3ed74f591b92b0fc8e4cebe9b",
  codex: "3adb72549623865abc4187715bc344b346f8acc9",
};

function requireProof(condition, code, message) {
  if (!condition) throw Object.assign(new Error(message), { code });
}

function regularFile(path, maxBytes = 8 * 1024 * 1024) {
  requireProof(existsSync(path), "FILE_NOT_FOUND", "Referenced file is absent");
  const info = lstatSync(path);
  requireProof(!info.isSymbolicLink() && info.isFile(), "NOT_REGULAR_FILE", "Expected a regular file without symbolic links");
  requireProof(info.size <= maxBytes, "FILE_TOO_LARGE", "Referenced file exceeds byte bound");
  return readFileSync(path);
}

function insideFile(root, path) {
  requireProof(typeof path === "string" && path.length > 0 && !isAbsolute(path) && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === ".."), "UNSAFE_PATH", "Evidence paths must be canonical package-relative paths");
  const target = resolve(root, path);
  // Reject links in every segment, including directories; lexical containment alone is insufficient.
  let cursor = root;
  for (const part of path.split("/")) {
    cursor = resolve(cursor, part);
    requireProof(existsSync(cursor) && !lstatSync(cursor).isSymbolicLink(), "UNSAFE_PATH", "Evidence path is absent or linked");
  }
  const rel = relative(realpathSync(root), realpathSync(target));
  requireProof(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), "UNSAFE_PATH", "Evidence escaped package root");
  return target;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyTaskEntryProof(indexPath) {
  try {
    const absolute = resolve(indexPath);
    requireProof(existsSync(absolute), "INDEX_NOT_FOUND", "Proof index is absent");
    const stat = lstatSync(absolute);
    requireProof(!stat.isSymbolicLink() && stat.isFile(), "NOT_REGULAR_FILE", "Index must be a regular file without symbolic links");
    requireProof(stat.size > 0 && stat.size <= 65536, "INDEX_SIZE", "Index must contain 1–65536 bytes");
    const raw = readFileSync(absolute, "utf8");
    requireProof(!PRIVATE_PATH_PATTERN.test(raw), "PRIVATE_PATH_DETECTED", "Proof index contains a private host path");
    const data = JSON.parse(raw);
    // Inspect decoded JSON too, so escaped slashes/Unicode cannot bypass the private-path gate.
    requireProof(!PRIVATE_PATH_PATTERN.test(JSON.stringify(data).replaceAll("\\\\", "\\")), "PRIVATE_PATH_DETECTED", "Proof index contains an encoded private host path");
    requireProof(data && data.schemaVersion === 1, "INVALID_SCHEMA", "Expected schemaVersion 1 object");
    requireProof(Array.isArray(data.cells) && data.cells.length === 55, "CELL_COUNT", "Expected exactly 55 cells");
    const root = resolve(dirname(absolute), "..");
    const verificationContext = existsSync(resolve(root, ".git")) ? "git-checkout" : "packed-package";
    const bindings = data.packageBindings;
    requireProof(bindings && Array.isArray(bindings.files), "MISSING_BINDINGS", "Package bindings are required");
    const seen = new Set();
    for (const binding of bindings.files) {
      requireProof(binding && /^[a-f0-9]{64}$/u.test(binding.sha256) && !seen.has(binding.path), "INVALID_BINDING", "Missing, duplicate or malformed file binding");
      seen.add(binding.path);
      requireProof(hash(regularFile(insideFile(root, binding.path))) === binding.sha256, "HASH_MISMATCH", `Package hash mismatch: ${binding.path}`);
    }
    requireProof(REQUIRED_FILES.every((path) => seen.has(path)), "MISSING_BINDINGS", "Required package file binding is missing");
    const lock = JSON.parse(regularFile(insideFile(root, "catalog/stack.lock.json")).toString("utf8"));
    const skill = lock.components?.ownedSkills?.["alpha-aos-task"];
    requireProof(skill && bindings.ownedSkill?.sourceSha256 === skill.sourceSha256, "LOCK_MISMATCH", "Owned skill source lock mismatch");
    requireProof(bindings.files.find((entry) => entry.path === REQUIRED_FILES[0])?.sha256 === skill.sourceSha256, "LOCK_MISMATCH", "Skill bytes must match the stable lock");
    for (const harness of HARNESSES) {
      requireProof(/^[a-f0-9]{64}$/u.test(skill.targetSha256?.[harness]) && bindings.ownedSkill.targetSha256?.[harness] === skill.targetSha256[harness], "LOCK_MISMATCH", `Owned skill target lock mismatch: ${harness}`);
      // The task skill currently renders byte-identically on all five adapters.
      requireProof(skill.targetSha256[harness] === skill.sourceSha256, "LOCK_MISMATCH", "Task skill rendered bytes differ from pinned source");
    }
    const tierCounts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (let i = 0; i < data.cells.length; i++) {
      const cell = data.cells[i];
      requireProof(cell && cell.harness === HARNESSES[Math.floor(i / AXES.length)] && cell.axis === AXES[i % AXES.length], "CELL_ORDER", "Cells must follow canonical harness and axis order");
      requireProof(STATUSES.includes(cell.status) && typeof cell.reasonCode === "string" && /^[A-Z][A-Z0-9_]+$/u.test(cell.reasonCode), "CELL_STATUS", "Each cell requires a status and explicit reason code");
      const hermesController = cell.harness === "hermes" && (AXES.slice(3, 9).includes(cell.axis) || cell.axis === "gsd-controller-authority");
      requireProof(!hermesController || (cell.status === "unsupported" && cell.reasonCode === "HERMES_WORKER_ONLY_NO_GSD_CONTROLLER"), "HERMES_CONTROLLER_SPOOF", "Hermes has no GSD controller/state-writer authority");
      if (cell.status === "verified-native") {
        requireProof(cell.provenance === "native" && cell.isFixture !== true, "NATIVE_SPOOF", "Fixture or unspecified provenance cannot prove native execution");
        requireProof(cell.evidence && seen.has(cell.evidence.path), "NATIVE_EVIDENCE", "Native claims require hash-bound archival evidence");
        requireProof(cell.harness === "pi" && AXES.slice(3, 9).includes(cell.axis) || cell.harness === "codex" && cell.axis === "bootstrap-and-recovery-handoff", "NATIVE_EVIDENCE", "No archived native receipt for this harness/axis");
        const commit = NATIVE_COMMITS[cell.harness];
        const receipt = regularFile(insideFile(root, cell.evidence.path)).toString("utf8");
        requireProof(cell.evidence.commitSha === commit && receipt.includes(commit), "NATIVE_EVIDENCE", "Native evidence must bind the recorded receipt commit");
        if (verificationContext === "git-checkout") {
          // Native work occurred in separate scratch repositories. Verify the archive's
          // owning-repository commit here, not the scratch SHA against the wrong repo.
          requireProof(/^[a-f0-9]{40}$/u.test(cell.evidence.archiveCommitSha), "NATIVE_EVIDENCE", "Missing archive commit binding");
          const git = spawnSync("git", ["cat-file", "-t", cell.evidence.archiveCommitSha], { cwd: root, encoding: "utf8", timeout: 10000, windowsHide: true });
          requireProof(git.status === 0 && git.stdout.trim() === "commit", "COMMIT_NOT_FOUND", "Archived native commit is unavailable");
          const archived = spawnSync("git", ["show", `${cell.evidence.archiveCommitSha}:${cell.evidence.path}`], { cwd: root, timeout: 10000, windowsHide: true });
          requireProof(archived.status === 0 && hash(archived.stdout) === hash(Buffer.from(receipt)), "NATIVE_EVIDENCE", "Receipt archive does not match its committed bytes");
        }
      }
      if (cell.status === "verified-fixture") requireProof(cell.provenance === "fixture" && SCENARIOS.includes(cell.scenario), "FIXTURE_EVIDENCE", "Fixture cells must reference a composed scenario");
      tierCounts[cell.status]++;
    }
    requireProof(data.cells.some((cell) => cell.harness === "claude" && cell.reasonCode === "CLAUDE_G_07_2_ISOLATED_AUTH_HOLD" && cell.status === "blocked"), "CLAUDE_HOLD_MISSING", "Claude G-07-2 auth hold must remain disclosed");
    requireProof(Array.isArray(data.composedScenarios) && data.composedScenarios.length === 4, "SCENARIOS", "Four composed scenarios are required");
    for (const [i, scenario] of data.composedScenarios.entries()) {
      requireProof(scenario.id === SCENARIOS[i] && scenario.checkoutOnly === true && scenario.path === "test/task-entry-cross-harness.test.ts" && /^[a-f0-9]{64}$/u.test(scenario.sha256), "SCENARIOS", "Invalid scenario reference");
      if (verificationContext === "git-checkout") requireProof(hash(regularFile(insideFile(root, scenario.path))) === scenario.sha256, "HASH_MISMATCH", "Checkout scenario bytes changed");
    }
    const ledger = data.regressionLedger;
    requireProof(ledger && ["pending-final-wave", "passed", "failed", "blocked"].includes(ledger.gateStatus), "LEDGER", "Regression gate status is required");
    requireProof(ledger.historicalDebt261101Ww3?.jobId === "job-8aff6aa5e58e46ea" && ledger.historicalDebt261101Ww3.status === "historical-unwaived" && DEBT_SUITES.every((suite) => ledger.historicalDebt261101Ww3.notRunSuites?.includes(suite)), "LEDGER", "Historical timeout and four not-run suites must be preserved");
    requireProof(HOLDS.every((id) => ledger.activeHolds?.some((hold) => hold.id === id && hold.status === "held")), "LEDGER", "Release/CI/auth holds cannot be counted as passed");
    if (ledger.gateStatus === "passed") {
      const run = ledger.currentRun;
      requireProof(run && /^[a-f0-9]{40}$/u.test(run.sourceHead) && typeof run.platform === "string" && Array.isArray(run.suites) && run.suites.length > 0, "LEDGER", "Passed regression requires measured source-bound suites");
      for (const counts of [run, ...run.suites]) {
        requireProof(["total", "passed", "failed", "skipped", "notRun"].every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0) && counts.total === counts.passed + counts.failed + counts.skipped + counts.notRun && counts.failed === 0 && counts.notRun === 0, "LEDGER", "Skipped, failed and not-run tests cannot be folded into passed");
      }
    }
    return { valid: true, schemaVersion: 1, verificationContext, cellCount: 55, tierCounts, gateStatus: ledger.gateStatus, nativeEvidence: "archival-receipts; no fresh model turns", checkoutEvidence: verificationContext === "git-checkout" ? "verified" : "not-shipped" };
  } catch (error) {
    return { valid: false, code: error.code ?? "INVALID_INDEX", error: error.message };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  let indexPath;
  let json = false;
  let invalid = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--index" && args[i + 1] && !args[i + 1].startsWith("--")) indexPath = args[++i];
    else if (args[i] === "--json") json = true;
    else invalid = true;
  }
  const result = !invalid && indexPath ? verifyTaskEntryProof(indexPath) : { valid: false, code: "USAGE", error: "Usage: node scripts/verify-task-entry-proof.mjs --index <path> [--json]" };
  console.log(json ? JSON.stringify(result, null, 2) : result.valid ? `Task entry proof: 55 cells (${result.verificationContext}); regression ${result.gateStatus}\n${JSON.stringify(result.tierCounts)}` : `Verification failed [${result.code}]: ${result.error}`);
  if (!result.valid) process.exitCode = 1;
}
