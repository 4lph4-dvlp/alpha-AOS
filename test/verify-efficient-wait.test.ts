import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const verifierScript = join(repositoryRoot, "scripts", "verify-efficient-wait.mjs");

function runVerifier(
  input: string,
  options: { cwd?: string; script?: string; timeout?: number } = {},
) {
  const targetScript = options.script ?? verifierScript;
  const result = spawnSync(process.execPath, [targetScript], {
    cwd: options.cwd ?? repositoryRoot,
    input,
    encoding: "utf8",
    timeout: options.timeout ?? 45000,
    maxBuffer: 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

async function createScratchWorkspace() {
  const scratch = await mkdtemp(join(tmpdir(), "alpha-aos-verif-"));
  await mkdir(join(scratch, "scripts"), { recursive: true });
  await mkdir(join(scratch, "dist", "test"), { recursive: true });

  await cp(join(repositoryRoot, "scripts", "verify-efficient-wait.mjs"), join(scratch, "scripts", "verify-efficient-wait.mjs"));
  await cp(join(repositoryRoot, "scripts", "efficient-wait-reporter.mjs"), join(scratch, "scripts", "efficient-wait-reporter.mjs"));
  await cp(join(repositoryRoot, "scripts", "build-artifact.mjs"), join(scratch, "scripts", "build-artifact.mjs"));
  await cp(join(repositoryRoot, "scripts", "run-tests.mjs"), join(scratch, "scripts", "run-tests.mjs"));
  await cp(join(repositoryRoot, "package.json"), join(scratch, "package.json"));

  return {
    scratch,
    writeManifest: () => {
      const res = spawnSync(process.execPath, [join(scratch, "scripts", "build-artifact.mjs"), "write"], {
        cwd: scratch,
        encoding: "utf8",
      });
      assert.equal(res.status, 0, `build-artifact write failed: ${res.stderr}`);
    },
    runScratchVerifier: (check: string, timeout = 25000) => {
      return runVerifier(JSON.stringify({ check }), {
        cwd: scratch,
        script: join(scratch, "scripts", "verify-efficient-wait.mjs"),
        timeout,
      });
    },
    cleanup: async () => {
      await rm(scratch, { recursive: true, force: true });
    },
  };
}

async function writeParserFixture(root: string, check: string, marker?: string): Promise<void> {
  const { REQUIRED_TESTS } = await import(pathToFileURL(verifierScript).href);
  const suites = new Map<string, string[]>();
  for (const req of REQUIRED_TESTS[check] as { name: string; suite: string }[]) {
    const bodies = suites.get(req.suite) ?? [];
    bodies.push(`test(${JSON.stringify(req.name)}, () => {${marker ? `writeFileSync(${JSON.stringify(marker)}, "EXECUTED");` : ""}});`);
    suites.set(req.suite, bodies);
  }
  for (const [suite, bodies] of suites) {
    await mkdir(dirname(join(root, suite)), { recursive: true });
    await writeFile(join(root, suite), `import test from "node:test";\nimport { writeFileSync } from "node:fs";\n${bodies.join("\n")}\n`, "utf8");
  }
}

test("verify-efficient-wait: refuses invalid, malformed, empty, and oversized stdin input", () => {
  // Empty input
  const emptyRes = runVerifier("");
  assert.notEqual(emptyRes.status, 0);
  assert.equal(emptyRes.stdout.includes('"ok":true'), false);
  assert.match(emptyRes.stderr, /empty|expected exact JSON/iu);

  // Non-JSON input
  const nonJsonRes = runVerifier("this is not json");
  assert.notEqual(nonJsonRes.status, 0);
  assert.equal(nonJsonRes.stdout.includes('"ok":true'), false);
  assert.match(nonJsonRes.stderr, /valid JSON/iu);

  // Non-object input
  const arrayRes = runVerifier(JSON.stringify(["completion"]));
  assert.notEqual(arrayRes.status, 0);
  assert.equal(arrayRes.stdout.includes('"ok":true'), false);
  assert.match(arrayRes.stderr, /JSON object/iu);

  // Extra field
  const extraRes = runVerifier(JSON.stringify({ check: "completion", extra: true }));
  assert.notEqual(extraRes.status, 0);
  assert.equal(extraRes.stdout.includes('"ok":true'), false);
  assert.match(extraRes.stderr, /exactly one field 'check'/iu);

  // Caller-provided claimed success
  const claimedSuccessRes = runVerifier(JSON.stringify({ check: "completion", ok: true }));
  assert.notEqual(claimedSuccessRes.status, 0);
  assert.equal(claimedSuccessRes.stdout.includes('"ok":true'), false);
  assert.match(claimedSuccessRes.stderr, /exactly one field 'check'/iu);

  // Caller-provided command injection attempt
  const commandRes = runVerifier(JSON.stringify({ check: "completion", command: "echo evil" }));
  assert.notEqual(commandRes.status, 0);
  assert.equal(commandRes.stdout.includes('"ok":true'), false);

  // Unknown check value
  const unknownCheckRes = runVerifier(JSON.stringify({ check: "nonexistent-check" }));
  assert.notEqual(unknownCheckRes.status, 0);
  assert.equal(unknownCheckRes.stdout.includes('"ok":true'), false);
  assert.match(unknownCheckRes.stderr, /must be one of: completion, safety, integration/iu);

  // Oversized stdin (> 64 KiB)
  const oversizedRes = runVerifier(JSON.stringify({ check: "completion", padding: "x".repeat(70000) }));
  assert.notEqual(oversizedRes.status, 0);
  assert.equal(oversizedRes.stdout.includes('"ok":true'), false);
});

test("verify-efficient-wait: real successful selection passes for completion", () => {
  const result = runVerifier(JSON.stringify({ check: "completion" }), { timeout: 25000 });
  assert.equal(result.status, 0, `Expected 0 exit, got ${result.status}. Stderr: ${result.stderr}`);
  assert.equal(result.stdout, JSON.stringify({ ok: true, check: "completion" }) + "\n");
  assert.match(result.stderr, /executed \d+ tests for 'completion'/iu);
  assert.match(result.stderr, /completion-wait: already completed before attach resolves once immediately/);
  assert.match(result.stderr, /task-wait: valid canonical run receipts FIRST and assert selection succeeds/);
});

test("verify-efficient-wait: build drift refuses and exits non-zero with diagnostic", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Write a manifest with a hash expectation that mismatches
    const manifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      inputs: {
        "package.json": "0000000000000000000000000000000000000000000000000000000000000000",
      },
      outputs: {},
    };
    await writeFile(join(ws.scratch, "dist", "build-artifact.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

    const result = ws.runScratchVerifier("completion", 15000);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout.includes('"ok":true'), false);
    assert.match(result.stderr, /build artifact/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: missing compiled test artifact cannot return success", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Write build artifact manifest in scratch without dist/test files
    ws.writeManifest();

    // Run verifier: dist/test/completion-wait.test.js is missing
    const result = ws.runScratchVerifier("completion", 15000);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout.includes('"ok":true'), false);
    assert.match(result.stderr, /missing required compiled test file|selected suite component validation failed/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: isolated selected compiled regression failure cannot return success", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Write a failing test in dist/test/completion-wait.test.js
    const failingCode = `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("completion-wait: already completed before attach resolves once immediately", () => { assert.fail("simulated regression"); });\n`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), failingCode, "utf8");

    // Write a passing test in dist/test/task-wait.test.js
    const passingCode = `import test from "node:test";\ntest("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});\n`;
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), passingCode, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Verifier must exit non-zero when a selected test fails");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must have NO success object in stdout");
    assert.match(result.stderr, /fail=|failures:/iu, "Diagnostic must report the test failure");
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - actual copied scripts and fresh manifest with unmatched throwing bodies cannot return success", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Reviewer proof recipe: both files contain only an unmatched body that throws if run
    const throwingCode = `import test from "node:test";\ntest("unmatched-body-must-not-run", () => { throw new Error("BODY_RAN"); });\n`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), throwingCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), throwingCode, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Verifier must exit non-zero when no selected test body ran");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must have NO success object in stdout");
    assert.match(result.stderr, /missing required leaf tests|failed/iu, "Must report missing required tests");
    assert.equal(result.stderr.includes("BODY_RAN"), false, "Unmatched body must not have executed");
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - matching SKIP/TODO all bodies cannot return success", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Write required names but mark them as skip or todo
    const compCode = `import test from "node:test";
test.skip("completion-wait: already completed before attach resolves once immediately", () => {});
test.skip("completion-wait: event-driven hint triggers check and completes", () => {});
`;
    const taskCode = `import test from "node:test";
test.todo("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});
test.todo("task-wait: exact terminal accepted, rejected, and blocked observable", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), compCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskCode, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Verifier must exit non-zero when tests are all skipped or todo");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must have NO success object in stdout");
    assert.match(result.stderr, /missing required leaf tests|skipped=|todo=/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - empty test files cannot return success", async () => {
  const ws = await createScratchWorkspace();
  try {
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), "", "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), "", "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Verifier must exit non-zero when test files are empty");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must have NO success object in stdout");
    assert.match(result.stderr, /missing required leaf tests/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - one REQUIRED missing body cannot return success", async () => {
  const ws = await createScratchWorkspace();
  try {
    // 3 of 4 pass, but "task-wait: exact terminal accepted, rejected, and blocked observable" is missing
    const compCode = `import test from "node:test";
test("completion-wait: already completed before attach resolves once immediately", () => {});
test("completion-wait: event-driven hint triggers check and completes", () => {});
`;
    const taskCode = `import test from "node:test";
test("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), compCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskCode, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Verifier must exit non-zero when one required test is missing");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must have NO success object in stdout");
    assert.match(result.stderr, /exact terminal accepted, rejected, and blocked observable/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - file wrapper and describe suite cannot count as leaf", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Define the required test name on a describe suite, with no inner leaf
    const compCode = `import { describe } from "node:test";
describe("completion-wait: already completed before attach resolves once immediately", () => {});
describe("completion-wait: event-driven hint triggers check and completes", () => {});
`;
    const taskCode = `import { describe } from "node:test";
describe("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});
describe("task-wait: exact terminal accepted, rejected, and blocked observable", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), compCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskCode, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Verifier must exit non-zero when describe suites are used instead of leaf tests");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must have NO success object in stdout");
    assert.match(result.stderr, /missing required leaf tests/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: parser mechanics positive fixture succeeds for safety", async () => {
  const ws = await createScratchWorkspace();
  try {
    const cmdJobsCode = `import test from "node:test";
test("command-jobs: injected opaque OPENAI_API_KEY + NODE_OPTIONS not inherited/not persisted", () => {});
test("command-jobs: rejects arguments containing secret values or credential patterns", () => {});
test("command-jobs: cancellation stops child and confirms cancelled status", () => {});
test("command-jobs: symlink in state root or job path is refused", () => {});
test("command-jobs CR-02: updateJobRecord enforces CAS fencing and revision increment", () => {});
test("command-jobs CR-03 & WR-01: true ownership and spec drift is refused with unchanged disk bytes", () => {});
test("command-jobs CR-06: budgetJobOutput enforces combined 64 KiB UTF-8 byte bound on adversarial multibyte streams", () => {});
test("command-jobs CR-07: validateCancelRequest enforces closed schema and bounds", () => {});
`;
    const compCode = `import test from "node:test";
test("completion-wait: pre-aborted signal settles immediately without running check", () => {});
`;
    const taskCode = `import test from "node:test";
test("task-wait: argument validation rejects non-canonical IDs, digests, and revisions", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "command-jobs.test.js"), cmdJobsCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), compCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskCode, "utf8");

    await writeParserFixture(ws.scratch, "safety");
    ws.writeManifest();

    const result = ws.runScratchVerifier("safety", 20000);
    assert.equal(result.status, 0, `Expected 0 exit, got ${result.status}. Stderr: ${result.stderr}`);
    assert.equal(result.stdout, JSON.stringify({ ok: true, check: "safety" }) + "\n");
    assert.match(result.stderr, /executed 17 tests for 'safety'/iu);
    assert.match(result.stderr, /injected opaque OPENAI_API_KEY \+ NODE_OPTIONS/);
    assert.match(result.stderr, /command-jobs CR-02: updateJobRecord enforces CAS fencing/);
    assert.match(result.stderr, /command-jobs CR-03 & WR-01: true ownership and spec drift/);
    assert.match(result.stderr, /command-jobs CR-06: budgetJobOutput enforces combined 64 KiB UTF-8 byte bound/);
    assert.match(result.stderr, /command-jobs CR-07: validateCancelRequest enforces closed schema/);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: parser mechanics positive fixture succeeds for integration", async () => {
  const ws = await createScratchWorkspace();
  try {
    const cliCode = `import test from "node:test";
test("efficient-wait-cli: detached job start returns real handle before completion, separate wait process reconnects", () => {});
test("efficient-wait-cli: job start preserves argument array, child --help and --json without shell concatenation", () => {});
test("efficient-wait-cli: dry-run start and cancel create no side effects", () => {});
`;
    const guidanceCode = `import test from "node:test";
test("guidance contract: docs/efficient-wait.md covers five harnesses, truthful start, --apply, and observer expiry semantics", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "efficient-wait-cli.test.js"), cliCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "efficient-wait-guidance.test.js"), guidanceCode, "utf8");

    await writeParserFixture(ws.scratch, "integration");
    ws.writeManifest();

    const result = ws.runScratchVerifier("integration", 20000);
    assert.equal(result.status, 0, `Expected 0 exit, got ${result.status}. Stderr: ${result.stderr}`);
    assert.equal(result.stdout, JSON.stringify({ ok: true, check: "integration" }) + "\n");
    assert.match(result.stderr, /executed 4 tests for 'integration'/iu);
    assert.match(result.stderr, /detached job start returns real handle/);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - external import suffix collision with outside test files cannot satisfy required identity", async () => {
  const ws = await createScratchWorkspace();
  const outsideDir = await mkdtemp(join(tmpdir(), "alpha-aos-outside-"));
  try {
    await mkdir(join(outsideDir, "dist", "test"), { recursive: true });

    // Define the required test names in outside files
    const outsideComp = `import test from "node:test";
test("completion-wait: already completed before attach resolves once immediately", () => {});
test("completion-wait: event-driven hint triggers check and completes", () => {});
`;
    const outsideTask = `import test from "node:test";
test("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});
test("task-wait: exact terminal accepted, rejected, and blocked observable", () => {});
`;
    await writeFile(join(outsideDir, "dist", "test", "completion-wait.test.js"), outsideComp, "utf8");
    await writeFile(join(outsideDir, "dist", "test", "task-wait.test.js"), outsideTask, "utf8");

    // The scratch files merely import the outside files (having same relative suffix dist/test/<file>)
    const compImport = `import "${pathToFileURL(join(outsideDir, "dist", "test", "completion-wait.test.js")).href}";\n`;
    const taskImport = `import "${pathToFileURL(join(outsideDir, "dist", "test", "task-wait.test.js")).href}";\n`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), compImport, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskImport, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "External import suffix collision must fail non-zero");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must not emit success object");
    assert.match(result.stderr, /missing required leaf tests/iu);
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - test defined in wrong file with right name cannot satisfy required suite identity", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Define completion test inside task-wait.test.js instead of completion-wait.test.js
    const taskCode = `import test from "node:test";
test("completion-wait: already completed before attach resolves once immediately", () => {});
test("completion-wait: event-driven hint triggers check and completes", () => {});
test("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});
test("task-wait: exact terminal accepted, rejected, and blocked observable", () => {});
`;
    const compCode = `import test from "node:test";
test("completion-wait: other unrelated test", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), compCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskCode, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Wrong file with right name must fail non-zero");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must not emit success object");
    assert.match(result.stderr, /missing required leaf tests/iu);
    assert.match(result.stderr, /dist\/test\/completion-wait\.test\.js/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - outside symlink alias is refused", async (context) => {
  const ws = await createScratchWorkspace();
  const outsideDir = await mkdtemp(join(tmpdir(), "alpha-aos-symlink-"));
  try {
    await mkdir(join(outsideDir, "dist", "test"), { recursive: true });
    const outsideComp = `import test from "node:test";
test("completion-wait: already completed before attach resolves once immediately", () => {});
test("completion-wait: event-driven hint triggers check and completes", () => {});
`;
    const outsideCompPath = join(outsideDir, "dist", "test", "completion-wait.test.js");
    await writeFile(outsideCompPath, outsideComp, "utf8");

    const taskCode = `import test from "node:test";
test("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});
test("task-wait: exact terminal accepted, rejected, and blocked observable", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskCode, "utf8");

    const symlinkTarget = join(ws.scratch, "dist", "test", "completion-wait.test.js");
    try {
      await symlink(outsideCompPath, symlinkTarget);
    } catch (err: unknown) {
      // On platforms where symlink is not permitted (e.g. non-admin Windows without dev mode), skip gracefully
      const code = (err as { code?: string })?.code;
      if (code === "EPERM" || code === "ENOSYS" || code === "EACCES") {
        context.skip(`File symlink setup unsupported: ${code}`);
        return;
      }
      throw err;
    }

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Outside symlink alias must fail non-zero");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must not emit success object");
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
    await ws.cleanup();
  }
});

test("verify-efficient-wait: CR-01 regression - event stdout spoofing cannot satisfy verifier", async () => {
  const ws = await createScratchWorkspace();
  try {
    // Both files write spoofed @@VERIFIER_EVENT@@ lines to raw stdout, but contain no matching leaf tests
    const spoofComp = `import test from "node:test";
process.stdout.write("@@VERIFIER_EVENT@@:" + JSON.stringify({
  type: "test:pass",
  name: "completion-wait: already completed before attach resolves once immediately",
  file: ${JSON.stringify(join(ws.scratch, "dist", "test", "completion-wait.test.js"))},
  line: 2,
  column: 1,
  nesting: 0,
  isSuite: false,
  isFileWrapper: false,
  isSkip: false,
  isTodo: false,
  isCancelled: false
}) + "\\n");
process.stdout.write("@@VERIFIER_EVENT@@:" + JSON.stringify({
  type: "test:pass",
  name: "completion-wait: event-driven hint triggers check and completes",
  file: ${JSON.stringify(join(ws.scratch, "dist", "test", "completion-wait.test.js"))},
  line: 3,
  column: 1,
  nesting: 0,
  isSuite: false,
  isFileWrapper: false,
  isSkip: false,
  isTodo: false,
  isCancelled: false
}) + "\\n");
test("unmatched-completion-test", () => {});
`;

    const spoofTask = `import test from "node:test";
process.stdout.write("@@VERIFIER_EVENT@@:" + JSON.stringify({
  type: "test:pass",
  name: "task-wait: valid canonical run receipts FIRST and assert selection succeeds",
  file: ${JSON.stringify(join(ws.scratch, "dist", "test", "task-wait.test.js"))},
  line: 2,
  column: 1,
  nesting: 0,
  isSuite: false,
  isFileWrapper: false,
  isSkip: false,
  isTodo: false,
  isCancelled: false
}) + "\\n");
process.stdout.write("@@VERIFIER_EVENT@@:" + JSON.stringify({
  type: "test:pass",
  name: "task-wait: exact terminal accepted, rejected, and blocked observable",
  file: ${JSON.stringify(join(ws.scratch, "dist", "test", "task-wait.test.js"))},
  line: 3,
  column: 1,
  nesting: 0,
  isSuite: false,
  isFileWrapper: false,
  isSkip: false,
  isTodo: false,
  isCancelled: false
}) + "\\n");
test("unmatched-task-test", () => {});
`;

    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), spoofComp, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), spoofTask, "utf8");

    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.notEqual(result.status, 0, "Stdout spoofing must fail non-zero");
    assert.equal(result.stdout.includes('"ok":true'), false, "Must not emit success object");
    assert.match(result.stderr, /missing required leaf tests/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: positive full canonical path matching passes for completion", async () => {
  const ws = await createScratchWorkspace();
  try {
    const compCode = `import test from "node:test";
test("completion-wait: already completed before attach resolves once immediately", () => {});
test("completion-wait: event-driven hint triggers check and completes", () => {});
`;
    const taskCode = `import test from "node:test";
test("task-wait: valid canonical run receipts FIRST and assert selection succeeds", () => {});
test("task-wait: exact terminal accepted, rejected, and blocked observable", () => {});
`;
    await writeFile(join(ws.scratch, "dist", "test", "completion-wait.test.js"), compCode, "utf8");
    await writeFile(join(ws.scratch, "dist", "test", "task-wait.test.js"), taskCode, "utf8");

    await writeParserFixture(ws.scratch, "completion");
    ws.writeManifest();

    const result = ws.runScratchVerifier("completion", 20000);
    assert.equal(result.status, 0, `Expected 0 exit, got ${result.status}. Stderr: ${result.stderr}`);
    assert.equal(result.stdout, JSON.stringify({ ok: true, check: "completion" }) + "\n");
    assert.match(result.stderr, /executed 7 tests for 'completion'/iu);
  } finally {
    await ws.cleanup();
  }
});

test("verify-efficient-wait: real successful selection passes for safety", () => {
  const result = runVerifier(JSON.stringify({ check: "safety" }), { timeout: 25000 });
  assert.equal(result.status, 0, `Expected 0 exit, got ${result.status}. Stderr: ${result.stderr}`);
  assert.equal(result.stdout, JSON.stringify({ ok: true, check: "safety" }) + "\n");
  assert.match(result.stderr, /executed 17 tests for 'safety'/iu);
  assert.match(result.stderr, /command-jobs CR-02: updateJobRecord enforces CAS fencing/);
  assert.match(result.stderr, /command-jobs CR-03 & WR-01: true ownership and spec drift/);
  assert.match(result.stderr, /command-jobs CR-06: budgetJobOutput enforces combined 64 KiB UTF-8 byte bound/);
  assert.match(result.stderr, /command-jobs CR-07: validateCancelRequest enforces closed schema/);
});

for (const component of ["dist/test", "dist"]) {
  test(`verify-efficient-wait: outside ${component} directory alias is refused before any body executes`, async (context) => {
    const ws = await createScratchWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "alpha-verifier-alias-"));
    const marker = join(outside, "executed.marker");
    const alias = join(ws.scratch, component);
    try {
      await writeParserFixture(outside, "completion", marker);
      const target = join(outside, component);
      await rm(alias, { recursive: true });
      try {
        await symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "ENOSYS" || code === "EACCES") {
          context.skip(`Directory alias setup unsupported: ${code}`);
          return;
        }
        throw err;
      }
      ws.writeManifest();
      const result = ws.runScratchVerifier("completion");
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout.includes('"ok":true'), false);
      assert.match(result.stderr, /alias|symbolic|junction|component validation/iu);
      const { existsSync } = await import("node:fs");
      assert.equal(existsSync(marker), false, "Outside required bodies must never execute");
    } finally {
      // Remove only the created alias before recursive fixture cleanup.
      const { unlink } = await import("node:fs/promises");
      await unlink(alias).catch(() => undefined);
      await ws.cleanup();
      await rm(outside, { recursive: true, force: true });
    }
  });
}
