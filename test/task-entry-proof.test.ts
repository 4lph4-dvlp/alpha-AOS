import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { packageRoot } from "../src/core/paths.js";

const root = packageRoot();
const script = join(root, "scripts/verify-task-entry-proof.mjs");

interface Cell {
  harness: string;
  axis: string;
  status: string;
  reasonCode: string;
  provenance?: string;
  isFixture?: boolean;
}
interface ProofIndex {
  cells: Cell[];
  packageBindings: { files: { path: string; sha256: string }[]; ownedSkill: { targetSha256: Record<string, string> } };
  regressionLedger: Record<string, unknown>;
}

function verify(path: string): { status: number | null; valid: boolean; code?: string; cellCount?: number; verificationContext?: string } {
  const run = spawnSync(process.execPath, [script, "--index", path, "--json"], { encoding: "utf8", timeout: 30000, windowsHide: true });
  assert.ifError(run.error);
  return { status: run.status, ...JSON.parse(run.stdout) };
}

async function packedCopy(context: TestContext): Promise<{ directory: string; indexPath: string; data: ProofIndex }> {
  const directory = await mkdtemp(join(tmpdir(), "alpha-aos-entry-proof-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const indexPath = join(directory, "docs/task-entry-proof-index.json");
  const data = JSON.parse(await readFile(join(root, "docs/task-entry-proof-index.json"), "utf8")) as ProofIndex;
  for (const path of ["catalog/stack.lock.json", ...data.packageBindings.files.map((entry) => entry.path), "docs/task-entry-proof-index.json", "scripts/audit-tarball.mjs", "scripts/verify-task-entry-proof.mjs"]) {
    const destination = join(directory, path);
    await mkdir(join(destination, ".."), { recursive: true });
    await cp(join(root, path), destination);
  }
  return { directory, indexPath, data };
}

test("entry proof verifies the real checkout and an unpacked package without git/planning/tests", async (context) => {
  const checkout = verify(join(root, "docs/task-entry-proof-index.json"));
  assert.equal(checkout.status, 0);
  assert.equal(checkout.valid, true);
  assert.equal(checkout.verificationContext, "git-checkout");
  assert.equal(checkout.cellCount, 55);
  const copy = await packedCopy(context);
  const packed = verify(copy.indexPath);
  assert.equal(packed.status, 0);
  assert.equal(packed.valid, true);
  assert.equal(packed.verificationContext, "packed-package");
});

test("entry proof rejects absent, empty, null, oversize, malformed and private-path indices", async (context) => {
  const copy = await packedCopy(context);
  assert.equal(verify(join(copy.directory, "missing.json")).status, 1);
  for (const raw of ["", "null", "{", " ".repeat(65537), JSON.stringify({ path: "C:" + "/Users/private/project" }), '{"path":"C:\\u003a/Users/private"}']) {
    await writeFile(copy.indexPath, raw);
    const result = verify(copy.indexPath);
    assert.equal(result.status, 1, raw.slice(0, 50));
    assert.equal(result.valid, false);
  }
});

test("entry proof rejects index symlinks", async (context) => {
  const copy = await packedCopy(context);
  const linked = join(copy.directory, "docs/linked.json");
  try {
    await symlink(copy.indexPath, linked, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      context.skip("Host cannot create file symlinks; refusal remains enforced by lstat");
      return;
    }
    throw error;
  }
  assert.equal(verify(linked).code, "NOT_REGULAR_FILE");
});

test("entry proof rejects tier spoofing, reordered/missing cells, omitted holds and forged ledger passes", async (context) => {
  const copy = await packedCopy(context);
  const baseline = structuredClone(copy.data);
  const cases: ((data: ProofIndex) => void)[] = [
    (data) => { data.cells[0]!.status = "verified-native"; },
    (data) => { data.cells.find((cell) => cell.status === "verified-native")!.isFixture = true; },
    (data) => { data.cells.find((cell) => cell.harness === "hermes" && cell.axis === "gsd-controller-authority")!.status = "verified-fixture"; },
    (data) => { data.cells.find((cell) => cell.reasonCode === "CLAUDE_G_07_2_ISOLATED_AUTH_HOLD")!.reasonCode = "NO_HOLD"; },
    (data) => { data.cells.pop(); },
    (data) => { [data.cells[0], data.cells[1]] = [data.cells[1]!, data.cells[0]!]; },
    (data) => { data.packageBindings.files.shift(); },
    (data) => { data.packageBindings.files[0]!.path = "../outside.md"; },
    (data) => { data.packageBindings.ownedSkill.targetSha256.pi = "0".repeat(64); },
    (data) => { data.regressionLedger.activeHolds = []; },
    (data) => { data.regressionLedger.historicalDebt261101Ww3 = {}; },
    (data) => { data.regressionLedger.gateStatus = "passed"; data.regressionLedger.currentRun = { sourceHead: "a".repeat(40), platform: "fixture", total: 2, passed: 2, failed: 0, skipped: 1, notRun: 0, suites: [{ total: 1, passed: 1, failed: 0, skipped: 0, notRun: 0 }] }; },
  ];
  for (const mutate of cases) {
    const data = structuredClone(baseline);
    mutate(data);
    await writeFile(copy.indexPath, JSON.stringify(data));
    const result = verify(copy.indexPath);
    assert.equal(result.status, 1, `case ${cases.indexOf(mutate)}: ${JSON.stringify(result)}`);
    assert.equal(result.valid, false);
  }
});

test("entry proof fails closed on one-byte package or stable-lock changes", async (context) => {
  const copy = await packedCopy(context);
  const path = join(copy.directory, "skills/alpha-aos-task/SKILL.md");
  const original = await readFile(path);
  await writeFile(path, Buffer.concat([original, Buffer.from("x")]));
  assert.equal(verify(copy.indexPath).code, "HASH_MISMATCH");
  await writeFile(path, original);
  const lockPath = join(copy.directory, "catalog/stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.components.ownedSkills["alpha-aos-task"].targetSha256.pi = "f".repeat(64);
  await writeFile(lockPath, JSON.stringify(lock));
  assert.equal(verify(copy.indexPath).code, "LOCK_MISMATCH");
});

test("entry proof requires both guide hashes in checkout and packed contexts", async (context) => {
  for (const checkout of [false, true]) {
    const copy = await packedCopy(context);
    if (checkout) {
      const gitDir = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" });
      assert.equal(gitDir.status, 0);
      await writeFile(join(copy.directory, ".git"), `gitdir: ${gitDir.stdout.trim()}\n`);
      for (const path of ["test/task-entry-cross-harness.test.ts", "src/core/doctor.ts", "src/core/task-bootstrap.ts", "test/tarball-fixture.test.ts"]) {
        await mkdir(join(copy.directory, path, ".."), { recursive: true });
        await cp(join(root, path), join(copy.directory, path));
      }
    }
    assert.equal(verify(copy.indexPath).valid, true);
    for (const guide of ["docs/task-entry.md", "docs/task-entry.ko.md"]) {
      const data = structuredClone(copy.data);
      data.packageBindings.files = data.packageBindings.files.filter((entry) => entry.path !== guide);
      await writeFile(copy.indexPath, JSON.stringify(data));
      assert.equal(verify(copy.indexPath).code, "MISSING_BINDINGS");
      await writeFile(copy.indexPath, JSON.stringify(copy.data));
      const path = join(copy.directory, guide);
      const bytes = await readFile(path);
      await writeFile(path, Buffer.concat([bytes, Buffer.from("x")]));
      assert.equal(verify(copy.indexPath).code, "HASH_MISMATCH");
      await rm(path);
      assert.equal(verify(copy.indexPath).valid, false);
      await writeFile(path, bytes);
    }
  }
});

test("entry proof refuses zero tests, omitted/duplicate suites, inconsistent totals and nonexistent source commits", async (context) => {
  const copy = await packedCopy(context);
  const names = ["ordinary", "command-job-runtime.test.js", "command-job-worker.test.js", "command-jobs.test.js", "efficient-wait-cli.test.js", "mcp-proxy.test.js", "process.test.js", "protocol-session.test.js", "task-cli.test.js", "task-progress-integration.test.js", "task-progress.test.js", "verify-efficient-wait.test.js", "tarball-fixture.test.js"];
  const sourceBindings = await Promise.all(["scripts/verify-task-entry-proof.mjs", "scripts/audit-tarball.mjs", "src/core/doctor.ts", "src/core/task-bootstrap.ts", "test/tarball-fixture.test.ts"].map(async (path) => ({ path, sha256: createHash("sha256").update(await readFile(join(root, path))).digest("hex"), checkoutOnly: !path.startsWith("scripts/") })));
  const run = {
    sourceHead: "a".repeat(40), platform: "win32/x64", total: names.length, passed: names.length, failed: 0, skipped: 0, notRun: 0,
    gates: ["check", "build", "targeted", "audit", "full", "build-check", "style-proof", "entry-proof"].map((name) => ({ name, exitCode: 0, durationMs: 1 })),
    suites: names.map((name) => ({ name, total: 1, passed: 1, failed: 0, skipped: 0, notRun: 0 })), sourceBindings,
  };
  const mutations: ((current: typeof run) => void)[] = [
    (current) => { current.total = current.passed = 0; current.suites.forEach((suite) => { suite.total = suite.passed = 0; }); },
    (current) => { current.suites.pop(); },
    (current) => { current.suites[0]!.name = current.suites[1]!.name; },
    (current) => { current.suites[0]!.name = "unknown"; },
    (current) => { current.passed = current.total = 999; },
    (current) => { current.gates.pop(); },
    (current) => { current.gates[0]!.exitCode = 1; },
  ];
  for (const mutate of mutations) {
    const current = structuredClone(run);
    mutate(current);
    const data = structuredClone(copy.data);
    data.regressionLedger.gateStatus = "passed";
    data.regressionLedger.currentRun = current;
    await writeFile(copy.indexPath, JSON.stringify(data));
    assert.equal(verify(copy.indexPath).valid, false);
  }
  // Keep every field structurally valid so this specifically reaches the git evidence gate.
  const gitDir = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).stdout.trim();
  await writeFile(join(copy.directory, ".git"), `gitdir: ${gitDir}\n`);
  await mkdir(join(copy.directory, "test"));
  await cp(join(root, "test/task-entry-cross-harness.test.ts"), join(copy.directory, "test/task-entry-cross-harness.test.ts"));
  copy.data.regressionLedger.gateStatus = "passed";
  copy.data.regressionLedger.currentRun = run;
  await writeFile(copy.indexPath, JSON.stringify(copy.data));
  assert.equal(verify(copy.indexPath).code, "COMMIT_NOT_FOUND");
});
