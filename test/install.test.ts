import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createManagedInstallOperationPlan, inspectGsdInstall, npmProbeEnvironment, selectInstallTargets } from "../src/core/install.js";
import {
  applyBootstrapOperation,
  BootstrapRefusal,
  BUILD_ARTIFACT_MANIFEST,
  createBootstrapOperationPlan,
} from "../src/core/bootstrap.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { packageRoot } from "../src/core/paths.js";
import { materializeEnvironment } from "../src/core/process.js";
import { listManagedTransactions } from "../src/core/transaction.js";
import { acquireMutationSession, WriterConflictError, writerLockPath } from "../src/core/writer-lock.js";
import type { HarnessId, Inventory, StackLock } from "../src/types.js";

/** The checkout root, from the compiled location: dist/test -> repository root. */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function inventory(detected: HarnessId[]): Inventory {
  const ids: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    platform: process.platform,
    architecture: process.arch,
    tools: {
      node: { version: "v24.0.0", command: process.execPath },
      npm: { version: "10.0.0", command: "npm" },
      git: { version: "2.0.0", command: "git" },
    },
    harnesses: ids.map((id) => ({ id, displayName: id, command: detected.includes(id) ? id : null, version: null, configRoots: [], detected: detected.includes(id), notes: [] })),
  };
}

const lock: StackLock = {
  schemaVersion: 1,
  channel: "stable",
  generatedAt: null,
  components: {
    gsd: { package: "@opengsd/gsd-core", version: "1.12.0", integrity: "sha512-test", profile: "standard" },
  },
};

test("managed install selects only detected harnesses unless targets are explicit", () => {
  const detected = inventory(["claude", "pi"]);
  assert.deepEqual(selectInstallTargets(detected), { targets: ["claude", "pi"], selection: "detected" });
  assert.deepEqual(selectInstallTargets(detected, ["pi"]), { targets: ["pi"], selection: "explicit" });
  assert.throws(() => selectInstallTargets(detected, ["hermes"]), /not installed or configured/u);
});

test("GSD current state requires exact version, profile, and runtime", async () => {
  const home = await mkdtemp(join(tmpdir(), "alpha-aos-install-test-"));
  const root = join(home, ".codex");
  await mkdir(join(root, "gsd-core"), { recursive: true });
  await writeFile(join(root, "gsd-core", "VERSION"), "1.12.0\n");
  await writeFile(join(root, "gsd-core", ".gsd-runtime"), "codex\n");
  await writeFile(join(root, ".gsd-profile"), "standard\n");

  const current = await inspectGsdInstall("codex", lock, { home, env: {} });
  assert.equal(current.current, true);

  await writeFile(join(root, ".gsd-profile"), "core\n");
  const drifted = await inspectGsdInstall("codex", lock, { home, env: {} });
  assert.equal(drifted.current, false);
  assert.equal(drifted.profile, "core");
});

/** A synthetic harness home, so planning reads fixture config rather than the real one. */
async function syntheticHome(context: test.TestContext): Promise<{ home: string; restore: () => void }> {
  const home = await mkdtemp(join(tmpdir(), "alpha-aos-install-home-"));
  context.after(async () => rm(home, { recursive: true, force: true }));
  const saved = new Map<string, string | undefined>();
  const set = (name: string, value: string | undefined): void => {
    saved.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  set("HOME", home);
  set("USERPROFILE", home);
  set("CODEX_HOME", join(home, ".codex"));
  set("CLAUDE_CONFIG_DIR", undefined);
  set("ANTIGRAVITY_CONFIG_DIR", undefined);
  set("PI_CODING_AGENT_DIR", undefined);
  set("HERMES_HOME", undefined);
  const restore = (): void => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  context.after(restore);
  return { home, restore };
}

test("the managed install operation plan enumerates every fixture and component before it mutates", async (context) => {
  await syntheticHome(context);
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-install-state-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));
  const root = packageRoot();

  const plan = await createManagedInstallOperationPlan({
    root,
    catalog: await loadCatalog(root),
    lock: await loadLock(root),
    inventory: inventory(["codex"]),
    requestedTargets: ["codex"],
    stateRoot,
  });

  assert.equal(plan.proofs.proven, true);
  for (const role of ["state", "journal", "snapshot", "package-root"] as const) {
    assert.ok(plan.proofs.get(role), `aggregate plan must declare the ${role} role`);
  }
  assert.deepEqual(plan.install.targets, ["codex"]);

  // Every fixture this operation may run is named, with its own reviewed plan.
  assert.equal(plan.fixtures.gsd.length, 1);
  assert.equal(plan.fixtures.gsd[0]?.harness, "codex");
  assert.ok(plan.fixtures.eccRuntime);
  assert.equal(plan.fixtures.eccSkills.length, 1);
  assert.equal(plan.fixtures.mcpBridge, null, "no Pi bridge is planned when Pi is not a target");

  // Every managed component apply is named, with its own complete plan.
  assert.ok(plan.components.gsdCompatibility, "Codex targets plan the GSD hook compatibility sync");
  assert.equal(plan.components.eccSkills.length, 1);
  assert.equal(plan.components.mcp.length, 1);
  assert.equal(plan.components.policy, null, "Claude is not a target, so no policy write is planned");
  assert.deepEqual(plan.components.ownedSkills, []);

  // Every external installer is declared before it runs.
  assert.deepEqual(plan.external.map((step) => step.id).sort(), ["ecc:runtime", "gsd:codex"]);
  assert.equal(plan.external.every((step) => step.spec.args.length > 0), true);
  assert.equal(JSON.stringify(plan.external).includes("\"source\""), false, "a declared spec carries names, never ambient values");

  // Planning creates nothing: no fixture root and no writer.
  for (const fixtureRoot of Object.values(plan.fixtureRoots)) {
    assert.equal(existsSync(fixtureRoot), false, `planning must not create ${fixtureRoot}`);
  }
  assert.equal(existsSync(writerLockPath(stateRoot)), false);
  assert.equal(plan.digest.length, 64);
});

test("a managed install plan re-read with its reviewed fixture roots is digest-stable", async (context) => {
  await syntheticHome(context);
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-install-stable-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));
  const root = packageRoot();
  const options = {
    root,
    catalog: await loadCatalog(root),
    lock: await loadLock(root),
    inventory: inventory(["codex"]),
    requestedTargets: ["codex"] as HarnessId[],
    stateRoot,
  };

  const first = await createManagedInstallOperationPlan(options);
  const again = await createManagedInstallOperationPlan({ ...options, fixtureRoots: first.fixtureRoots });
  assert.equal(again.digest, first.digest, "the same inputs must produce the same reviewed plan");

  // Without the reviewed roots the plan names fresh locations, which is a
  // different plan — and apply refuses one it cannot reproduce.
  const fresh = await createManagedInstallOperationPlan(options);
  assert.notEqual(fresh.digest, first.digest);
});

/** A minimal npm package with a verified build artifact manifest. */
async function bootstrapFixture(context: test.TestContext): Promise<{ root: string; stateRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-bootstrap-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const manifestPackage = {
    name: "alpha-aos-bootstrap-fixture",
    version: "1.0.0",
    private: true,
    scripts: { build: "node -e \"process.exit(0)\"" },
  };
  await writeFile(join(root, "package.json"), `${JSON.stringify(manifestPackage, null, 2)}\n`, "utf8");
  await writeFile(join(root, "package-lock.json"), `${JSON.stringify({
    name: manifestPackage.name,
    version: manifestPackage.version,
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: manifestPackage.name, version: manifestPackage.version } },
  }, null, 2)}\n`, "utf8");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "cli.js"), "// built\n", "utf8");
  await mkdir(join(root, "node_modules"), { recursive: true });
  await writeBuildManifest(root);
  return { root, stateRoot: join(root, "state") };
}

async function writeBuildManifest(root: string): Promise<void> {
  const hash = async (relative: string): Promise<string> =>
    createHash("sha256").update(await readFile(join(root, relative))).digest("hex");
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    inputs: { "package.json": await hash("package.json"), "package-lock.json": await hash("package-lock.json") },
    outputs: { "dist/cli.js": await hash(join("dist", "cli.js")) },
  };
  await writeFile(join(root, BUILD_ARTIFACT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

test("the bootstrap preflight plan is byte-stable and names every external child", async (context) => {
  const fixture = await bootstrapFixture(context);
  const options = { operation: "install" as const, root: fixture.root, stateRoot: fixture.stateRoot, skipLink: true };

  const first = await createBootstrapOperationPlan(options);
  const second = await createBootstrapOperationPlan(options);
  assert.equal(second.digest, first.digest, "repeated planning is digest-stable");
  assert.deepEqual(first.blockedReasons, [], "a verified artifact and clean inputs block nothing");
  assert.equal(first.artifact.verified, true);
  assert.equal(first.proofs.proven, true);
  for (const role of ["target", "state", "journal", "snapshot", "source", "package-root", "temp"] as const) {
    assert.ok(first.proofs.get(role), `bootstrap plan must declare the ${role} role`);
  }
  assert.deepEqual(first.external.map((step) => step.id), ["npm-ci", "npm-build"]);
  assert.equal(first.checkout, null, "an install does not move the checkout");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "planning takes no writer");
});

test("a missing or stale build artifact blocks the bootstrap without touching anything", async (context) => {
  const fixture = await bootstrapFixture(context);
  const options = { operation: "install" as const, root: fixture.root, stateRoot: fixture.stateRoot, skipLink: true };

  // A source file changed after the build: the artifact no longer describes it.
  await writeFile(join(fixture.root, "package.json"), `${JSON.stringify({ name: "x", version: "2.0.0" }, null, 2)}\n`, "utf8");
  const stale = await createBootstrapOperationPlan(options);
  assert.equal(stale.artifact.verified, false);
  assert.equal(stale.blockedReasons.some((reason) => reason.includes("does not match its manifest")), true);
  assert.equal((await createBootstrapOperationPlan(options)).digest, stale.digest, "a refusal is digest-stable");

  await assert.rejects(
    () => applyBootstrapOperation(stale),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapRefusal);
      assert.equal(error.reasons.length > 0, true);
      return true;
    },
  );
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "a refused bootstrap takes no writer");

  await rm(join(fixture.root, BUILD_ARTIFACT_MANIFEST), { force: true });
  const missing = await createBootstrapOperationPlan(options);
  assert.equal(missing.blockedReasons.some((reason) => reason.includes("no build artifact manifest")), true);
  await assert.rejects(() => applyBootstrapOperation(missing), BootstrapRefusal);
});

test("an active writer blocks the bootstrap before its first external child runs", async (context) => {
  const fixture = await bootstrapFixture(context);
  const plan = await createBootstrapOperationPlan({
    operation: "install",
    root: fixture.root,
    stateRoot: fixture.stateRoot,
    skipLink: true,
  });
  const holder = await acquireMutationSession({
    stateRoot: fixture.stateRoot,
    proofs: plan.proofs,
    planDigest: "another-operation",
  });
  context.after(async () => holder.close());

  const before = await readFile(join(fixture.root, "package-lock.json"), "utf8");
  await assert.rejects(
    () => applyBootstrapOperation(plan),
    (error: unknown) => {
      assert.ok(error instanceof WriterConflictError);
      return true;
    },
  );
  // npm ci would have replaced node_modules; the session is acquired first, so
  // nothing external ran.
  assert.equal(existsSync(join(fixture.root, "node_modules")), true);
  assert.equal(await readFile(join(fixture.root, "package-lock.json"), "utf8"), before);
  assert.equal(existsSync(join(fixture.stateRoot, "bootstrap")), false, "no evidence is journaled for a refused operation");
});

test("a bootstrap apply journals durable intent and honest before/after evidence", async (context) => {
  const fixture = await bootstrapFixture(context);
  const plan = await createBootstrapOperationPlan({
    operation: "install",
    root: fixture.root,
    stateRoot: fixture.stateRoot,
    skipLink: true,
  });

  const result = await applyBootstrapOperation(plan);
  assert.equal(result.evidence.steps.length, 2);
  assert.deepEqual(result.evidence.steps.map((step) => step.id), ["npm-ci", "npm-build"]);
  assert.equal(result.evidence.steps.every((step) => step.status === "ran"), true);
  assert.equal(result.evidence.steps.every((step) => ["changed", "unchanged", "unknown"].includes(step.observation)), true);
  assert.ok(result.evidence.finishedAt);
  assert.equal(result.evidence.managed, null, "no managed reconcile was requested");

  // The record is durable and journaled, not just returned.
  const recorded = JSON.parse(await readFile(join(fixture.stateRoot, "bootstrap", `${result.operationId}.json`), "utf8")) as Record<string, any>;
  assert.equal(recorded.planDigest, plan.digest);
  assert.equal(recorded.steps.length, 2);
  const journals = await listManagedTransactions(fixture.stateRoot);
  assert.equal(journals.length >= 3, true, "intent plus one record per step is journaled");
  assert.equal(journals.every((journal) => journal.id.startsWith(result.operationId)), true, "every journal belongs to the one operation");

  // The writer is released only after the final durable record.
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});

test("a failed external step reports what it observed and never claims a rollback", async (context) => {
  const fixture = await bootstrapFixture(context);
  // The build script fails, after npm ci has already changed the package set.
  const failing = { name: "alpha-aos-bootstrap-fixture", version: "1.0.0", private: true, scripts: { build: "node -e \"process.exit(3)\"" } };
  await writeFile(join(fixture.root, "package.json"), `${JSON.stringify(failing, null, 2)}\n`, "utf8");
  await writeBuildManifest(fixture.root);

  const plan = await createBootstrapOperationPlan({
    operation: "install",
    root: fixture.root,
    stateRoot: fixture.stateRoot,
    skipLink: true,
  });
  assert.deepEqual(plan.blockedReasons, []);

  await assert.rejects(
    () => applyBootstrapOperation(plan),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /npm-build/u);
      assert.doesNotMatch(message, /rolled back/u, "an external step is never described as rolled back");
      assert.match(message, /Durable evidence:/u);
      return true;
    },
  );

  const recorded = JSON.parse(await readFile(join(fixture.stateRoot, "bootstrap", `${(await listManagedTransactions(fixture.stateRoot))[0]?.id.split("--")[0]}.json`), "utf8")) as Record<string, any>;
  assert.equal(recorded.steps[1].status, "failed");
  assert.equal(typeof recorded.steps[1].detail, "string");
  assert.equal(recorded.recovery.length > 0, true);
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "the writer is released after durable evidence");
});

test("a read-only npm probe cannot have its write location decided by the caller", () => {
  const owned = join("alpha-aos-owned", "cache-root");
  const callerCache = join("caller-chosen", "cache-root");
  const callerPrefix = join("caller-chosen", "prefix");

  const materialized = materializeEnvironment(
    npmProbeEnvironment({
      cacheRoot: owned,
      source: { npm_config_cache: callerCache, npm_config_prefix: callerPrefix },
    }),
  );

  assert.equal(
    materialized.npm_config_cache,
    owned,
    "the caller's npm cache value reached the probe, so an inherited name decides where a read-only query writes",
  );
  assert.notEqual(materialized.npm_config_cache, callerCache);
  assert.equal(
    materialized.npm_config_logs_max,
    "0",
    "the probe must suppress npm log files rather than merely relocate them",
  );
  // Positive control: the policy pins where the probe writes, it does not cut
  // the probe off from the user configuration that decides what it looks at.
  assert.equal(
    materialized.npm_config_prefix,
    callerPrefix,
    "the probe lost the user's npm prefix, so apply-time verification would answer about a global root the user does not use",
  );
});

test("the managed install plan builder does not spawn to learn the global npm root", async () => {
  const source = await readFile(join(repositoryRoot, "src", "core", "install.ts"), "utf8");
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const start = source.indexOf("export async function createManagedInstallPlan(");
  assert.notEqual(start, -1, "createManagedInstallPlan is no longer declared as an exported async function");
  // Bounded by the function's own closing brace at column zero, not by the
  // next exported declaration: everything between this builder and the next
  // `export` is apply-time helper code, and `installEccRuntime` is supposed
  // to reach the spawning probe. Slicing that far would make the negative
  // control below fail against correct code.
  const end = source.indexOf(eol + "}", start);
  const region = end === -1 ? source.slice(start) : source.slice(start, end);

  // A slice that broke would make both controls below vacuous, so its failure
  // is reported as a failure rather than absorbed as a pass.
  assert.equal(
    region.length >= 200,
    true,
    `the createManagedInstallPlan region could not be extracted (${region.length} characters); the controls below would be vacuous`,
  );
  assert.equal(
    /probeGlobalNpmPackageVersion/u.test(region),
    false,
    "the managed install plan builder reaches the spawning npm probe. A preview runs this builder with no --apply, and npm writes a debug log into its cache for every invocation including a read-only query, which on POSIX is always under the user home.",
  );
  assert.equal(
    /readGlobalPackageVersion/u.test(region),
    true,
    "the spawn-free reader is absent from the plan builder region, so the negative control above proves nothing",
  );
});

test("the byte-identical entry points include both plan-builder callers", async () => {
  const source = await readFile(join(repositoryRoot, "test", "preview.test.ts"), "utf8");
  const start = source.indexOf("const PREVIEW_INVOCATIONS");
  assert.notEqual(start, -1, "PREVIEW_INVOCATIONS is no longer declared in test/preview.test.ts");
  const end = source.indexOf("];", start);
  assert.notEqual(end, -1, "the PREVIEW_INVOCATIONS list is not terminated where expected");
  const region = source.slice(start, end);

  for (const entry of ['name: "install"', 'name: "bootstrap install"']) {
    assert.equal(
      region.includes(entry),
      true,
      `the byte-identical preview enumeration is missing ${entry}. ` +
        "'install' and 'bootstrap install' share createManagedInstallPlan, so enumerating only one leaves a " +
        "regression on the other entry point unobserved.",
    );
  }
});
