import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy } from "../src/core/process.js";
import {
  checkReceiptStaleness,
  evaluateLifecycleGates,
  formatGateBlockingFeedback,
} from "../src/core/gate-lifecycle.js";
import { createGateReceipt, writeGateReceipt } from "../src/core/gate-receipt.js";
import type { GateReceipt } from "../src/types.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const probeEnv = commandProbeEnvironment({ source: process.env });

// The CLI child never inherits the parent's ALPHA_AOS_STATE_DIR because the
// probe policy does not list it, so a declared literal is the only route that
// keeps gate receipts journaling into a scratch root instead of the host's.
function gateEnvironment(stateRoot: string): EnvironmentPolicy {
  return {
    ...probeEnv,
    literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: stateRoot },
  };
}

async function scratchRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return root;
}

test("checkReceiptStaleness detects Git HEAD changes and working tree modifications (D-09)", () => {
  const receipt: GateReceipt = {
    schemaVersion: 1,
    obligation: "security-review",
    status: "passed",
    engine: { id: "test-engine", kind: "native" },
    targetCommitSha: "1111111111111111111111111111111111111111",
    workingTreeDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    exitCode: 0,
    executedAt: new Date().toISOString(),
    suppressedEngines: [],
    evidenceHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };

  // Identical SHA and digest -> not stale
  const current = checkReceiptStaleness(
    receipt,
    "1111111111111111111111111111111111111111",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  assert.equal(current.isStale, false);

  // HEAD commit moved -> stale
  const headMoved = checkReceiptStaleness(
    receipt,
    "2222222222222222222222222222222222222222",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  assert.equal(headMoved.isStale, true);
  assert.match(headMoved.reason ?? "", /Git HEAD moved/);

  // Working tree modified -> stale
  const treeDirty = checkReceiptStaleness(
    receipt,
    "1111111111111111111111111111111111111111",
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  );
  assert.equal(treeDirty.isStale, true);
  assert.match(treeDirty.reason ?? "", /Working tree files in risk surface modified/);
});

test("formatGateBlockingFeedback renders structured alert box with recheck command (D-08)", () => {
  const output = formatGateBlockingFeedback({
    obligation: "security-review",
    reason: "Gate check execution failed with exit code 1",
    offendingFiles: ["src/auth/session.ts", "package.json"],
    engineOutput: "Error: vulnerabilities detected in dependency tree",
    recheckCommand: "alpha-aos gate check --obligation security-review",
  });

  assert.match(output, /🚨 MANDATORY GSD GATE BLOCKED: SECURITY-REVIEW/);
  assert.match(output, /Status: GATE CHECK EXECUTION FAILED WITH EXIT CODE 1/);
  assert.match(output, /Risk Evidence Detected:/);
  assert.match(output, /- src\/auth\/session\.ts/);
  assert.match(output, /- package\.json/);
  assert.match(output, /Engine Verification Output:/);
  assert.match(output, /vulnerabilities detected/);
  assert.match(output, /Action Required:/);
  assert.match(output, /\$ alpha-aos gate check --obligation security-review/);
  assert.match(output, /GSD cannot advance to UAT\/verification until this gate passes\./);
});

test("Low-risk changes result in silent pass with exit code 0 (GATE-04, D-03)", async (context) => {
  const parent = await scratchRoot(context, "gate-low-risk");
  const stateRoot = join(parent, "state");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  // Add documentation only
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "guide.md"), "# User Guide\n", "utf8");
  gitCommand(root, ["add", "docs/guide.md"]);
  gitCommand(root, ["commit", "-m", "docs: add guide"]);

  // Run gate check via CLI
  const result = await runProcess({
    executable: process.execPath,
    args: [cliEntry, "gate", "check", "--json"],
    cwd: root,
    environment: gateEnvironment(stateRoot),
  });

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout.excerpt) as { ok: boolean; passed: boolean; silentPass: boolean };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.passed, true);
  assert.equal(parsed.silentPass, true);
});

test("Risky change without receipt blocks lifecycle with actionable error (GATE-03, D-07, D-08)", async (context) => {
  const parent = await scratchRoot(context, "gate-risky-block");
  const stateRoot = join(parent, "state");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  // Add package.json with a failing security script
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "risky-app", scripts: { security: "node -e \"process.exit(1)\"" } }, null, 2) + "\n",
    "utf8"
  );
  gitCommand(root, ["add", "package.json"]);
  gitCommand(root, ["commit", "-m", "init package.json"]);

  // Introduce auth risk file
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await writeFile(join(root, "src", "auth", "token.ts"), "export const token = 'jwt';\n", "utf8");

  // Run gate check via CLI without prior receipt
  // Because the native security script fails (exit 1), gate check should fail and exit 2
  const result = await runProcess({
    executable: process.execPath,
    args: [cliEntry, "gate", "check"],
    cwd: root,
    environment: gateEnvironment(stateRoot),
  });

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /🚨 MANDATORY GSD GATE BLOCKED: SECURITY-REVIEW/);
  assert.match(result.stderr.excerpt, /src\/auth\/token\.ts/);
  assert.match(result.stderr.excerpt, /alpha-aos gate check --obligation security-review/);
});

test("Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03)", async (context) => {
  const parent = await scratchRoot(context, "gate-pass-unblock");
  const stateRoot = join(parent, "state");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  // Passing script in package.json
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "safe-app", scripts: { security: "node -e \"console.log('security audit passed')\"" } }, null, 2) + "\n",
    "utf8"
  );
  gitCommand(root, ["add", "package.json"]);
  gitCommand(root, ["commit", "-m", "init safe package.json"]);

  // Introduce auth file
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await writeFile(join(root, "src", "auth", "login.ts"), "export const login = () => true;\n", "utf8");

  // Run gate check --obligation security-review
  const checkResult = await runProcess({
    executable: process.execPath,
    args: [cliEntry, "gate", "check", "--obligation", "security-review", "--json"],
    cwd: root,
    environment: gateEnvironment(stateRoot),
  });

  assert.equal(checkResult.exitCode, 0);
  const parsed = JSON.parse(checkResult.stdout.excerpt) as { ok: boolean; passed: boolean; verdicts: Array<{ status: string }> };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.passed, true);
  assert.equal(parsed.verdicts[0]?.status, "passed");
  const journals = (await readdir(join(stateRoot, "journal")).catch(() => [] as string[])).filter((name) =>
    name.endsWith(".json"),
  );
  assert.ok(
    journals.length > 0,
    "gate check must journal its receipt into the test-owned state root, not the host state root",
  );

  // Subsequent gate check passes without re-running
  const nextResult = await runProcess({
    executable: process.execPath,
    args: [cliEntry, "gate", "check"],
    cwd: root,
    environment: gateEnvironment(stateRoot),
  });
  assert.equal(nextResult.exitCode, 0);
  assert.match(nextResult.stdout.excerpt, /✔ Mandatory gates passed/);
});

test("Post-check modification inside risk surface marks receipt stale and blocks gate status (D-09)", async (context) => {
  const parent = await scratchRoot(context, "gate-staleness");
  const stateRoot = join(parent, "state");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;

  // Passing script
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "stale-test-app", scripts: { security: "node -e \"process.exit(0)\"" } }, null, 2) + "\n",
    "utf8"
  );
  gitCommand(root, ["add", "package.json"]);
  gitCommand(root, ["commit", "-m", "init"]);

  await mkdir(join(root, "src", "auth"), { recursive: true });
  await writeFile(join(root, "src", "auth", "login.ts"), "export const login = 1;\n", "utf8");

  // Run initial pass
  const passResult = await runProcess({
    executable: process.execPath,
    args: [cliEntry, "gate", "check", "--obligation", "security-review"],
    cwd: root,
    environment: gateEnvironment(stateRoot),
  });
  assert.equal(passResult.exitCode, 0);

  // Now modify the risk file
  await writeFile(join(root, "src", "auth", "login.ts"), "export const login = 2; // modified after gate\n", "utf8");

  // Query gate status --json
  const statusResult = await runProcess({
    executable: process.execPath,
    args: [cliEntry, "gate", "status", "--json"],
    cwd: root,
    environment: gateEnvironment(stateRoot),
  });

  assert.equal(statusResult.exitCode, 0);
  const parsedStatus = JSON.parse(statusResult.stdout.excerpt) as {
    passed: boolean;
    verdicts: Array<{ obligation: string; status: string; stalenessReason?: string }>;
  };
  assert.equal(parsedStatus.passed, false);
  assert.equal(parsedStatus.verdicts[0]?.status, "stale");
  assert.match(parsedStatus.verdicts[0]?.stalenessReason ?? "", /Working tree files in risk surface modified/);

  // gate status --strict exits with code 2 when any gate is stale
  const strictStatus = await runProcess({
    executable: process.execPath,
    args: [cliEntry, "gate", "status", "--strict"],
    cwd: root,
    environment: gateEnvironment(stateRoot),
  });
  assert.equal(strictStatus.exitCode, 2);
});

test(".gsd/capabilities/alpha-aos/capability.json adheres strictly to GSD capability contract", async () => {
  const manifestPath = join(repositoryRoot, ".gsd", "capabilities", "alpha-aos", "capability.json");
  const content = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(content) as {
    id: string;
    role: string;
    version: string;
    gates: Array<{
      point: string;
      check: { predicate: { kind: string; command: string; timeout: number } };
      blocking: boolean;
      onError: string;
    }>;
  };

  assert.equal(manifest.id, "alpha-aos");
  assert.equal(manifest.role, "feature");
  assert.equal(manifest.version, "0.1.0");
  assert.ok(Array.isArray(manifest.gates));
  assert.equal(manifest.gates.length, 2);

  const postGate = manifest.gates.find((g) => g.point === "execute:post");
  assert.ok(postGate);
  assert.equal(postGate.check.predicate.kind, "command-exit-zero");
  assert.match(postGate.check.predicate.command, /alpha-aos gate check --point execute:post/);
  assert.equal(postGate.blocking, true);
  assert.equal(postGate.onError, "halt");

  const preGate = manifest.gates.find((g) => g.point === "verify:pre");
  assert.ok(preGate);
  assert.equal(preGate.check.predicate.kind, "command-exit-zero");
  assert.match(preGate.check.predicate.command, /alpha-aos gate check --point verify:pre/);
  assert.equal(preGate.blocking, true);
  assert.equal(preGate.onError, "halt");
});
