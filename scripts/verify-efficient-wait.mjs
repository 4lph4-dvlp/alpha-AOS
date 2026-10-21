#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EVENT_PREFIX } from "./efficient-wait-reporter.mjs";

const MAX_STDIN_BYTES = 64 * 1024;
const STDIN_TIMEOUT_MS = 5000;
const TOTAL_VERIFY_BUDGET_MS = 25000;
const BUILD_CHECK_TIMEOUT_MS = 5000;
const TEST_EXEC_TIMEOUT_MS = 20000;
const MAX_PINNED_FILE_BYTES = 4 * 1024 * 1024;

const VALID_CHECKS = new Set(["completion", "safety", "integration"]);

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function areCanonicalPathsEqual(pathA, pathB) {
  const normA = resolve(pathA);
  const normB = resolve(pathB);
  if (process.platform === "win32") {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}

export function isCanonicalInside(childPath, parentDir) {
  const normChild = resolve(childPath);
  const normParent = resolve(parentDir);
  const rel = relative(normParent, normChild);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    return false;
  }
  if (process.platform === "win32") {
    const parentLower = normParent.toLowerCase();
    const childLower = normChild.toLowerCase();
    const separator = normParent.endsWith("\\") || normParent.endsWith("/") ? "" : "\\";
    const expectedPrefix = (parentLower + separator).toLowerCase();
    return childLower.startsWith(expectedPrefix);
  }
  return true;
}

export function validatePathComponent(targetPath, configuredRepo, canonicalRepo, expectFile = false) {
  if (!targetPath || typeof targetPath !== "string") {
    return { ok: false, error: "target path must be a non-empty string" };
  }
  const absTarget = resolve(configuredRepo, targetPath);
  const relFromConfigured = relative(configuredRepo, absTarget);
  if (!relFromConfigured || relFromConfigured.startsWith("..") || isAbsolute(relFromConfigured)) {
    return {
      ok: false,
      error: `target path '${targetPath}' resolves outside configured repository root '${configuredRepo}'`,
    };
  }

  const parts = relFromConfigured.split(/[/\\]+/).filter(Boolean);
  let currentConfigured = configuredRepo;
  let currentExpectedCanonical = canonicalRepo;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLeaf = i === parts.length - 1;
    const shouldBeFile = isLeaf && expectFile;

    currentConfigured = join(currentConfigured, part);
    currentExpectedCanonical = join(currentExpectedCanonical, part);

    if (!existsSync(currentConfigured)) {
      return { ok: false, error: `component '${currentConfigured}' does not exist` };
    }

    let stat;
    try {
      stat = lstatSync(currentConfigured);
    } catch (err) {
      return {
        ok: false,
        error: `lstat failed on component '${currentConfigured}': ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (stat.isSymbolicLink()) {
      return {
        ok: false,
        error: `component '${currentConfigured}' is a symbolic link or junction alias (refused)`,
      };
    }

    if (shouldBeFile) {
      if (!stat.isFile()) {
        return { ok: false, error: `component '${currentConfigured}' is not a regular file` };
      }
    } else {
      if (!stat.isDirectory()) {
        return { ok: false, error: `component '${currentConfigured}' is not a regular directory` };
      }
    }

    let canonCurrent;
    try {
      canonCurrent = realpathSync.native(currentConfigured);
    } catch (err) {
      return {
        ok: false,
        error: `realpath failed on component '${currentConfigured}': ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    let canonStat;
    try {
      canonStat = lstatSync(canonCurrent);
    } catch (err) {
      return {
        ok: false,
        error: `lstat failed on canonical component '${canonCurrent}': ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (canonStat.isSymbolicLink()) {
      return {
        ok: false,
        error: `canonical component '${canonCurrent}' resolved to a symbolic link or junction`,
      };
    }

    if (shouldBeFile) {
      if (!canonStat.isFile()) {
        return { ok: false, error: `canonical component '${canonCurrent}' is not a regular file` };
      }
    } else {
      if (!canonStat.isDirectory()) {
        return { ok: false, error: `canonical component '${canonCurrent}' is not a regular directory` };
      }
    }

    if (!isCanonicalInside(canonCurrent, canonicalRepo) && !areCanonicalPathsEqual(canonCurrent, canonicalRepo)) {
      return {
        ok: false,
        error: `canonical component '${canonCurrent}' is outside canonical repository root '${canonicalRepo}'`,
      };
    }

    if (!areCanonicalPathsEqual(canonCurrent, currentExpectedCanonical)) {
      return {
        ok: false,
        error: `canonical component '${canonCurrent}' does not match expected root-relative path '${currentExpectedCanonical}'`,
      };
    }
  }

  let finalCanon;
  try {
    finalCanon = realpathSync.native(absTarget);
  } catch (err) {
    return {
      ok: false,
      error: `realpath failed on target '${absTarget}': ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true, canonicalPath: finalCanon };
}

function fileStatIdentity(stat) {
  return Object.fromEntries(["dev", "ino", "size", "mode", "mtimeNs", "ctimeNs"].map((key) => [key, stat[key]?.toString() ?? null]));
}

function sameFileStat(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

// Pin bytes from an open descriptor, not from a later reuse of the pathname.
// This detects ordinary during-run replacement/drift; it is not an OS sandbox.
function pinValidatedFile(relativePath, configuredRepo, canonicalRepo) {
  const pathCheck = validatePathComponent(relativePath, configuredRepo, canonicalRepo, true);
  if (!pathCheck.ok) return pathCheck;
  let descriptor;
  try {
    descriptor = openSync(pathCheck.canonicalPath, "r");
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 0n || before.size > BigInt(MAX_PINNED_FILE_BYTES)) {
      throw new Error("pinned file exceeds regular-file byte bound");
    }
    const digest = createHash("sha256");
    const buffer = Buffer.alloc(64 * 1024);
    let bytes = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, MAX_PINNED_FILE_BYTES - bytes + 1), null);
      if (count === 0) break;
      bytes += count;
      if (bytes > MAX_PINNED_FILE_BYTES) throw new Error("pinned file grew beyond byte bound");
      digest.update(buffer.subarray(0, count));
    }
    const after = fstatSync(descriptor, { bigint: true });
    const identity = fileStatIdentity(after);
    if (!sameFileStat(fileStatIdentity(before), identity) || BigInt(bytes) !== after.size) {
      throw new Error("pinned file changed while hashing");
    }
    const finalPath = validatePathComponent(relativePath, configuredRepo, canonicalRepo, true);
    if (!finalPath.ok || !areCanonicalPathsEqual(finalPath.canonicalPath, pathCheck.canonicalPath)) {
      throw new Error("pinned file path changed while hashing");
    }
    const pathStat = lstatSync(finalPath.canonicalPath, { bigint: true });
    if (!pathStat.isFile() || !sameFileStat(identity, fileStatIdentity(pathStat))) {
      throw new Error("pinned file descriptor no longer identifies the selected path");
    }
    return { ok: true, canonicalPath: finalPath.canonicalPath, identity, sha256: digest.digest("hex") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function samePinnedFile(left, right) {
  return areCanonicalPathsEqual(left.canonicalPath, right.canonicalPath) &&
    sameFileStat(left.identity, right.identity) && left.sha256 === right.sha256;
}

export function getValidatedCanonicalFile(filePath, canonicalRootDir) {
  if (!filePath || typeof filePath !== "string") return null;
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) return null;

  try {
    const stat = lstatSync(absPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return null;
    }

    const canonicalPath = realpathSync.native(absPath);
    const canonStat = lstatSync(canonicalPath);
    if (canonStat.isSymbolicLink() || !canonStat.isFile()) {
      return null;
    }

    if (!isCanonicalInside(canonicalPath, canonicalRootDir)) {
      return null;
    }

    return canonicalPath;
  } catch {
    return null;
  }
}

export const CHECK_SUITES = {
  completion: [
    "dist/test/completion-wait.test.js",
    "dist/test/task-wait.test.js",
  ],
  safety: [
    "dist/test/command-jobs.test.js",
    "dist/test/completion-wait.test.js",
    "dist/test/task-wait.test.js",
  ],
  integration: [
    "dist/test/efficient-wait-cli.test.js",
    "dist/test/efficient-wait-guidance.test.js",
  ],
};

export const REQUIRED_TESTS = {
  completion: [
    {
      name: "completion-wait: already completed before attach resolves once immediately",
      suite: "dist/test/completion-wait.test.js",
    },
    {
      name: "completion-wait: event-driven hint triggers check and completes",
      suite: "dist/test/completion-wait.test.js",
    },
    {
      name: "task-wait: valid canonical run receipts FIRST and assert selection succeeds",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: exact terminal accepted, rejected, and blocked observable",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: real superviseTask journal including index zero settles exact accepted run",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: supervisor stop uses proved preceding run association without inventing a stopped run",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: canonical terminal receipt without journal omits unproved attempt index",
      suite: "dist/test/task-wait.test.js",
    },
  ],
  safety: [
    {
      name: "command-jobs: injected opaque OPENAI_API_KEY + NODE_OPTIONS not inherited/not persisted",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "command-jobs: rejects arguments containing secret values or credential patterns",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "command-jobs: cancellation stops child and confirms cancelled status",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "command-jobs: symlink in state root or job path is refused",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "command-jobs CR-02: updateJobRecord enforces CAS fencing and revision increment",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "command-jobs CR-03 & WR-01: true ownership and spec drift is refused with unchanged disk bytes",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "command-jobs CR-06: budgetJobOutput enforces combined 64 KiB UTF-8 byte bound on adversarial multibyte streams",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "command-jobs CR-07: validateCancelRequest enforces closed schema and bounds",
      suite: "dist/test/command-jobs.test.js",
    },
    {
      name: "completion-wait: pre-aborted signal settles immediately without running check",
      suite: "dist/test/completion-wait.test.js",
    },
    {
      name: "task-wait: argument validation rejects non-canonical IDs, digests, and revisions",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: every supervisor terminal disposition refuses a different run and identifies missing legacy proof",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: nonaccepted supervisor dispositions cannot contradict a canonical accepted run",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: zero indices distinguish supervisor lifecycle events from attempt evidence",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: terminal evidence payloads reject malformed verdict and stop reason",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: ownerless nonterminal execution resolves OWNER_ABSENT before deadline",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: journal prefix rewrite detected and refused as REGRESSING_SEQUENCE",
      suite: "dist/test/task-wait.test.js",
    },
    {
      name: "task-wait: journal file deletion after observation refused as REGRESSING_SEQUENCE",
      suite: "dist/test/task-wait.test.js",
    },
    // Note on process lifetime coverage: The 31-test process lifecycle gate in test/process.test.ts
    // is maintained as an independent gate outside this verifier to preserve the <=30s execution budget.
    // The 17 safety tests here verify bounded jobs, credential safety, cancellation owner fencing,
    // stale CAS protection, output byte budgeting, task argument invariants, and E4 real producer/terminal/owner invariants;
    // they do not claim to prove all process lifetime containment by themselves.
  ],
  integration: [
    {
      name: "efficient-wait-cli: detached job start returns real handle before completion, separate wait process reconnects",
      suite: "dist/test/efficient-wait-cli.test.js",
    },
    {
      name: "efficient-wait-cli: job start preserves argument array, child --help and --json without shell concatenation",
      suite: "dist/test/efficient-wait-cli.test.js",
    },
    {
      name: "efficient-wait-cli: dry-run start and cancel create no side effects",
      suite: "dist/test/efficient-wait-cli.test.js",
    },
    {
      name: "guidance contract: docs/efficient-wait.md covers five harnesses, truthful start, --apply, and observer expiry semantics",
      suite: "dist/test/efficient-wait-guidance.test.js",
    },
  ],
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const CHECK_PATTERNS = {
  completion: `^(${REQUIRED_TESTS.completion.map((t) => escapeRegex(t.name)).join("|")})$`,
  safety: `^(${REQUIRED_TESTS.safety.map((t) => escapeRegex(t.name)).join("|")})$`,
  integration: `^(${REQUIRED_TESTS.integration.map((t) => escapeRegex(t.name)).join("|")})$`,
};

async function readStdin(maxBytes, timeoutMs = STDIN_TIMEOUT_MS) {
  return new Promise((resolveInput, rejectInput) => {
    const chunks = [];
    let total = 0;
    const timer = setTimeout(() => {
      process.stdin.pause();
      rejectInput(new Error(`stdin read timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    process.stdin.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        clearTimeout(timer);
        process.stdin.pause();
        rejectInput(new Error(`stdin input exceeded ${maxBytes} bytes limit`));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolveInput(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", (err) => {
      clearTimeout(timer);
      rejectInput(err);
    });
  });
}

function parseAndValidateInput(raw) {
  const text = raw.trim();
  if (!text) {
    throw new Error("stdin is empty; expected exact JSON object with 'check' field");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`stdin is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("stdin must be a JSON object");
  }
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "check") {
    throw new Error(`expected exactly one field 'check' in stdin object, got keys: [${keys.join(", ")}]`);
  }
  const check = parsed.check;
  if (typeof check !== "string" || !VALID_CHECKS.has(check)) {
    throw new Error(`invalid check '${String(check)}'; must be one of: completion, safety, integration`);
  }
  return { check };
}

export function parseStructuredEvents(output) {
  const lines = output.split("\n");
  const events = [];
  const passedLeaves = [];
  const failures = [];
  let fileWrappers = 0;
  let suitesCount = 0;
  let skippedCount = 0;
  let todoCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(EVENT_PREFIX)) {
      continue;
    }
    const jsonStr = trimmed.slice(EVENT_PREFIX.length);
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      continue;
    }

    events.push(parsed);

    if (parsed.type === "test:fail") {
      failures.push(parsed);
      continue;
    }

    if (parsed.type === "test:pass") {
      if (parsed.isSuite) {
        suitesCount++;
        continue;
      }
      if (parsed.isFileWrapper) {
        fileWrappers++;
        continue;
      }
      if (parsed.isSkip) {
        skippedCount++;
        continue;
      }
      if (parsed.isTodo) {
        todoCount++;
        continue;
      }
      if (parsed.isCancelled) {
        failures.push({ ...parsed, error: "Test execution was cancelled" });
        continue;
      }

      passedLeaves.push(parsed);
    }
  }

  return {
    events,
    passedLeaves,
    failures,
    fileWrappers,
    suitesCount,
    skippedCount,
    todoCount,
  };
}

export function parseTapCounts(output) {
  let passCount = 0;
  let failCount = 0;
  let totalTests = 0;
  let skippedCount = 0;
  const executedTests = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    const okMatch = /^ok\s+\d+\s+-\s+(.+)$/.exec(trimmed);
    if (okMatch && !trimmed.includes("# SKIP") && !trimmed.includes("# TODO")) {
      executedTests.push(okMatch[1].trim());
    }
    const notOkMatch = /^not ok\s+\d+\s+-\s+(.+)$/.exec(trimmed);
    if (notOkMatch) {
      executedTests.push(notOkMatch[1].trim());
    }
    const passMatch = /^# pass\s+(\d+)$/.exec(trimmed);
    if (passMatch) {
      passCount += parseInt(passMatch[1], 10);
      continue;
    }
    const failMatch = /^# fail\s+(\d+)$/.exec(trimmed);
    if (failMatch) {
      failCount += parseInt(failMatch[1], 10);
      continue;
    }
    const totalMatch = /^# tests\s+(\d+)$/.exec(trimmed);
    if (totalMatch) {
      totalTests += parseInt(totalMatch[1], 10);
      continue;
    }
    const skipMatch = /^# skipped\s+(\d+)$/.exec(trimmed);
    if (skipMatch) {
      skippedCount += parseInt(skipMatch[1], 10);
      continue;
    }
  }

  return { passCount, failCount, totalTests, skippedCount, executedTests };
}

export async function runVerification(inputCheck) {
  const startTime = Date.now();

  // 0. Anchor physical paths: prove configured repositoryRoot is plain non-alias directory
  const configuredRoot = resolve(repositoryRoot);
  if (!existsSync(configuredRoot)) {
    process.stderr.write(`configured repositoryRoot does not exist: ${configuredRoot}\n`);
    return { ok: false, exitCode: 1 };
  }
  let repoStat;
  try {
    repoStat = lstatSync(configuredRoot);
  } catch (err) {
    process.stderr.write(
      `lstat failed on repositoryRoot '${configuredRoot}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { ok: false, exitCode: 1 };
  }
  if (repoStat.isSymbolicLink() || !repoStat.isDirectory()) {
    process.stderr.write(`configured repositoryRoot must be a plain non-alias directory: ${configuredRoot}\n`);
    return { ok: false, exitCode: 1 };
  }
  let canonicalRepoRoot;
  try {
    canonicalRepoRoot = realpathSync.native(configuredRoot);
  } catch (err) {
    process.stderr.write(
      `realpath failed on repositoryRoot '${configuredRoot}': ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { ok: false, exitCode: 1 };
  }
  const canonRepoStat = lstatSync(canonicalRepoRoot);
  if (canonRepoStat.isSymbolicLink() || !canonRepoStat.isDirectory()) {
    process.stderr.write(`canonical repositoryRoot is not a regular directory: ${canonicalRepoRoot}\n`);
    return { ok: false, exitCode: 1 };
  }

  // 1. Verify build artifacts freshness via scripts/build-artifact.mjs check
  const buildArtifactScript = join(repositoryRoot, "scripts", "build-artifact.mjs");
  if (!existsSync(buildArtifactScript)) {
    process.stderr.write(`missing build-artifact script: ${buildArtifactScript}\n`);
    return { ok: false, exitCode: 1 };
  }

  const buildResult = spawnSync(process.execPath, [buildArtifactScript, "check"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: BUILD_CHECK_TIMEOUT_MS,
  });

  if (buildResult.status !== 0) {
    const diag = (buildResult.stderr || buildResult.stdout || "").trim();
    process.stderr.write(
      `build artifact check failed (exit code ${buildResult.status}):\n${diag.slice(0, 2048)}\n`,
    );
    return { ok: false, exitCode: buildResult.status || 1 };
  }

  // 2. Pre-spawn component validation: BEFORE spawning test runner, prove configured dist/test
  // and EVERY component between repositoryRoot, dist, dist/test, selectedsuite is a plain non-alias
  // directory/file. lstat rejects symlink/junction; realpath identity must stay configured root-relative.
  // Do NOT fallback distTestRoot on realpath error.
  const distTestPreCheck = validatePathComponent("dist/test", repositoryRoot, canonicalRepoRoot, false);
  if (!distTestPreCheck.ok) {
    process.stderr.write(`configured dist/test path validation failed: ${distTestPreCheck.error}\n`);
    return { ok: false, exitCode: 1 };
  }

  const relativeSuites = CHECK_SUITES[inputCheck];
  if (!relativeSuites || relativeSuites.length === 0) {
    process.stderr.write(`no suite files configured for check '${inputCheck}'\n`);
    return { ok: false, exitCode: 1 };
  }

  // Pin selected suite physical identity and bounded bytes before executing bodies.
  const pinnedFiles = new Map();
  for (const rel of relativeSuites) {
    const suiteCheck = pinValidatedFile(rel, repositoryRoot, canonicalRepoRoot);
    if (!suiteCheck.ok) {
      process.stderr.write(`selected suite component validation failed for '${rel}': ${suiteCheck.error}\n`);
      return { ok: false, exitCode: 1 };
    }
    pinnedFiles.set(rel, suiteCheck);
  }

  const expectedReqs = REQUIRED_TESTS[inputCheck] ?? [];
  for (const req of expectedReqs) {
    if (!pinnedFiles.has(req.suite)) {
      const reqSuiteCheck = pinValidatedFile(req.suite, repositoryRoot, canonicalRepoRoot);
      if (!reqSuiteCheck.ok) {
        process.stderr.write(`required suite component validation failed for '${req.suite}': ${reqSuiteCheck.error}\n`);
        return { ok: false, exitCode: 1 };
      }
      pinnedFiles.set(req.suite, reqSuiteCheck);
    }
  }

  // A child cannot replace the freshness expectations to bless mutated output.
  const manifestPin = pinValidatedFile("dist/build-artifact.json", repositoryRoot, canonicalRepoRoot);
  if (!manifestPin.ok) {
    process.stderr.write("build artifact manifest identity capture failed: " + manifestPin.error + "\n");
    return { ok: false, exitCode: 1 };
  }
  pinnedFiles.set("dist/build-artifact.json", manifestPin);

  // 3. Resolve reporter script
  const reporterScript = join(repositoryRoot, "scripts", "efficient-wait-reporter.mjs");
  if (!existsSync(reporterScript)) {
    process.stderr.write(`missing efficient-wait-reporter script: ${reporterScript}\n`);
    return { ok: false, exitCode: 1 };
  }
  const reporterUrl = pathToFileURL(reporterScript).href;

  // 4. Run selected suites through scripts/run-tests.mjs with custom structured reporter
  const runTestsScript = join(repositoryRoot, "scripts", "run-tests.mjs");
  if (!existsSync(runTestsScript)) {
    process.stderr.write(`missing run-tests script: ${runTestsScript}\n`);
    return { ok: false, exitCode: 1 };
  }

  const pattern = CHECK_PATTERNS[inputCheck];
  const elapsed = Date.now() - startTime;
  // Reserve the existing build-check allowance for the mandatory post-test check.
  const remainingBudget = TOTAL_VERIFY_BUDGET_MS - elapsed - BUILD_CHECK_TIMEOUT_MS;
  const timeoutMs = Math.min(TEST_EXEC_TIMEOUT_MS, remainingBudget);
  if (timeoutMs <= 0) {
    process.stderr.write("verification budget exhausted before test execution\n");
    return { ok: false, exitCode: 1 };
  }

  const testArgs = [
    runTestsScript,
    `--test-reporter=${reporterUrl}`,
    ...(pattern ? [`--test-name-pattern=${pattern}`] : []),
    "--files",
    ...relativeSuites,
  ];

  // In verifier's CONTROLLED independent test subprocess only, delete NODE_TEST_CONTEXT
  const testEnv = { ...process.env };
  delete testEnv.NODE_TEST_CONTEXT;

  const testResult = spawnSync(process.execPath, testArgs, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: testEnv,
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });

  if (testResult.error) {
    process.stderr.write(`test runner invocation failed: ${testResult.error.message}\n`);
    return { ok: false, exitCode: 1 };
  }

  const stdout = testResult.stdout ?? "";
  const stderr = testResult.stderr ?? "";

  const {
    events,
    passedLeaves,
    failures,
    fileWrappers,
    suitesCount,
    skippedCount,
    todoCount,
  } = parseStructuredEvents(stdout);

  // 5. Goal-backward verification against fixed required leaf identities
  // Re-check components after child before accept
  const distTestPostCheck = validatePathComponent("dist/test", repositoryRoot, canonicalRepoRoot, false);
  if (!distTestPostCheck.ok || !areCanonicalPathsEqual(distTestPostCheck.canonicalPath, distTestPreCheck.canonicalPath)) {
    process.stderr.write(
      `dist/test directory failed post-test component recheck: ${distTestPostCheck.error || "canonical path changed"}\n`,
    );
    return { ok: false, exitCode: 1 };
  }

  for (const [rel, expectedPin] of pinnedFiles) {
    const suitePostCheck = pinValidatedFile(rel, repositoryRoot, canonicalRepoRoot);
    if (!suitePostCheck.ok || !samePinnedFile(suitePostCheck, expectedPin)) {
      process.stderr.write(
        `selected suite '${rel}' failed post-test component recheck: ${suitePostCheck.error || "physical identity or bytes changed"}\n`,
      );
      return { ok: false, exitCode: 1 };
    }
  }

  const missingRequirements = [];

  for (const req of expectedReqs) {
    const canonicalExpected = pinnedFiles.get(req.suite)?.canonicalPath;
    if (!canonicalExpected) {
      missingRequirements.push(req);
      continue;
    }

    const matched = passedLeaves.find((leaf) => {
      if (leaf.name !== req.name) return false;
      if (!leaf.file) return false;
      const leafAbs = resolve(repositoryRoot, leaf.file);
      const leafRel = relative(repositoryRoot, leafAbs);
      if (!leafRel || leafRel.startsWith("..") || isAbsolute(leafRel)) {
        return false;
      }
      const leafCompCheck = validatePathComponent(leafRel, repositoryRoot, canonicalRepoRoot, true);
      if (!leafCompCheck.ok) return false;

      return areCanonicalPathsEqual(leafCompCheck.canonicalPath, canonicalExpected);
    });

    if (!matched) {
      missingRequirements.push(req);
    }
  }

  const passCount = passedLeaves.length;
  const failCount = failures.length;
  const totalCount = events.length;

  const isSuccessful =
    testResult.status === 0 &&
    failCount === 0 &&
    missingRequirements.length === 0 &&
    passCount >= expectedReqs.length &&
    passCount > 0;

  if (!isSuccessful) {
    process.stderr.write(
      `verification '${inputCheck}' failed: exitCode=${testResult.status}, tests=${totalCount}, pass=${passCount}, fail=${failCount}, missing=${missingRequirements.length}, wrappers=${fileWrappers}, suites=${suitesCount}, skipped=${skippedCount}, todo=${todoCount}\n`,
    );

    if (missingRequirements.length > 0) {
      process.stderr.write("missing required leaf tests:\n");
      for (const m of missingRequirements) {
        process.stderr.write(`  - [MISSING] "${m.name}" expected from ${m.suite}\n`);
      }
    }

    if (failures.length > 0) {
      process.stderr.write("failures:\n");
      for (const f of failures.slice(0, 10)) {
        process.stderr.write(`  - [FAIL] "${f.name}": ${f.error ?? "failed"}\n`);
      }
    }

    if (stderr.trim()) {
      process.stderr.write(`stderr:\n${stderr.slice(0, 2048)}\n`);
    }

    return { ok: false, exitCode: testResult.status || 1 };
  }

  // Passing lifecycle events attest only the tested artifact. Recheck freshness
  // after child exit, against the pinned manifest, within the original deadline.
  const finalCheckBudget = Math.min(BUILD_CHECK_TIMEOUT_MS, TOTAL_VERIFY_BUDGET_MS - (Date.now() - startTime));
  if (finalCheckBudget <= 0) {
    process.stderr.write("verification budget exhausted before post-test build artifact check\n");
    return { ok: false, exitCode: 1 };
  }
  const finalBuildResult = spawnSync(process.execPath, [buildArtifactScript, "check"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: finalCheckBudget,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (finalBuildResult.error || finalBuildResult.status !== 0) {
    const diagnostic = finalBuildResult.error?.message || finalBuildResult.stderr || finalBuildResult.stdout || "";
    process.stderr.write("post-test build artifact check failed: " + diagnostic.trim().slice(0, 2048) + "\n");
    return { ok: false, exitCode: 1 };
  }
  if (Date.now() - startTime >= TOTAL_VERIFY_BUDGET_MS) {
    process.stderr.write("verification budget exhausted before acceptance\n");
    return { ok: false, exitCode: 1 };
  }

  // Log fixed executed test names/counts to bounded stderr so controller can verify coverage
  process.stderr.write(
    `executed ${passCount} tests for '${inputCheck}' (pass=${passCount}, fail=${failCount}, total=${totalCount}):\n` +
      passedLeaves.map((t) => `  - ${t.name}`).join("\n") +
      "\n",
  );

  // SUCCESS ONLY: exactly JSON.stringify({ ok: true, check: inputCheck }) + "\n"
  process.stdout.write(JSON.stringify({ ok: true, check: inputCheck }) + "\n");
  return { ok: true, exitCode: 0 };
}

async function main() {
  let rawInput;
  try {
    rawInput = await readStdin(MAX_STDIN_BYTES);
  } catch (err) {
    process.stderr.write(`failed reading stdin: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  let validated;
  try {
    validated = parseAndValidateInput(rawInput);
  } catch (err) {
    process.stderr.write(`invalid input: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const outcome = await runVerification(validated.check);
  process.exit(outcome.exitCode);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  await main();
}
