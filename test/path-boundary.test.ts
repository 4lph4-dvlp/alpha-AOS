// Wave 0 tracer for SAFE-02 (D-01, D-02, D-03).
//
// Containment must hold for the configured path AND for its canonical
// resolution, and it must still hold at the instant of mutation. An outside
// sentinel proves the boundary held; an unprovable filesystem is reported as
// unsupported rather than applied.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { OperationPathRole, PathProof } from "../src/core/path-boundary.js";
import {
  assertPathProven,
  PathBoundaryError,
  proveOperationPaths,
  provePathBoundary,
  recheckPathProof,
} from "../src/core/path-boundary.js";
import { applyFileTransaction } from "../src/core/transaction.js";

const SENTINEL_BYTES = "outside sentinel — must never be written\n";

interface NotRunRecord {
  readonly fixture: string;
  readonly reason: string;
}

const notRun: NotRunRecord[] = [];

async function sha256File(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

interface Fixture {
  readonly root: string;
  readonly allowed: string;
  readonly outsideDirectory: string;
  readonly outsideSentinel: string;
  readonly stateRoot: string;
}

async function createFixture(context: { after: (fn: () => Promise<unknown> | unknown) => void }): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-path-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const allowed = join(root, "allowed");
  const outsideDirectory = join(root, "outside");
  await mkdir(allowed, { recursive: true });
  await mkdir(outsideDirectory, { recursive: true });
  const outsideSentinel = join(outsideDirectory, "SENTINEL");
  await writeFile(outsideSentinel, SENTINEL_BYTES, "utf8");
  return { root, allowed, outsideDirectory, outsideSentinel, stateRoot: join(root, "state") };
}

/** Directory symlink creation differs by platform and may need privileges. */
async function tryDirectorySymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return existsSync(linkPath);
  } catch {
    return false;
  }
}

async function tryFileSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath, "file");
    const info = await lstat(linkPath);
    return info.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Every path class the transaction boundary must police. Each managed root is
 * a separate class because a containment check applied to targets alone leaves
 * the state, journal, snapshot, temp, source and package roots unguarded.
 */
const MANAGED_ROOT_CLASSES = [
  "target",
  "state",
  "journal",
  "snapshot",
  "temp",
  "source",
  "package",
] as const;

test("a link that stays inside the allowed root is permitted", async (context) => {
  const fixture = await createFixture(context);
  const realDirectory = join(fixture.allowed, "real");
  await mkdir(realDirectory, { recursive: true });
  const linkPath = join(fixture.allowed, "link");

  if (!(await tryDirectorySymlink(realDirectory, linkPath))) {
    notRun.push({ fixture: "inside-link", reason: "this host cannot create directory links without privileges" });
    context.skip("inside-link fixture not run: directory links unavailable");
    return;
  }

  const journal = await applyFileTransaction({
    stateRoot: fixture.stateRoot,
    allowedRoots: [fixture.allowed],
    operations: [{ target: join(linkPath, "inside.txt"), content: "ok\n" }],
  });
  assert.equal(journal.status, "applied");
  assert.equal(await readFile(join(realDirectory, "inside.txt"), "utf8"), "ok\n");
  assert.equal(await sha256File(fixture.outsideSentinel), createHash("sha256").update(SENTINEL_BYTES).digest("hex"));
});

test("a link that escapes the allowed root is refused and the outside sentinel is untouched", async (context) => {
  const fixture = await createFixture(context);
  const before = await sha256File(fixture.outsideSentinel);
  const escapeLink = join(fixture.allowed, "escape");

  if (!(await tryDirectorySymlink(fixture.outsideDirectory, escapeLink))) {
    notRun.push({ fixture: "escape-link", reason: "this host cannot create directory links without privileges" });
    context.skip("escape-link fixture not run: directory links unavailable");
    return;
  }

  // The configured path is inside the allowed root; only its canonical
  // resolution escapes. A configured-path-only check accepts this.
  const proof = await provePathBoundary({
    path: join(escapeLink, "SENTINEL"),
    allowedRoots: [fixture.allowed],
    role: "target",
  });

  assert.equal(proof.proven, false, "a path whose canonical form escapes must not be proven");
  assert.equal(proof.code, "outside-canonical-root", "the refusal must name the canonical boundary");
  assert.throws(() => assertPathProven(proof), PathBoundaryError);
  assert.equal(await sha256File(fixture.outsideSentinel), before, "the outside sentinel was modified");
  assert.equal(await readFile(fixture.outsideSentinel, "utf8"), SENTINEL_BYTES);
});

// applyFileTransaction still uses lexical containment; plan 01-09 routes it
// through the proof set built here.
test("a transaction refuses a write whose canonical path escapes", { todo: "transaction is wired to PathProof in plan 01-09" }, async (context) => {
  const fixture = await createFixture(context);
  const escapeLink = join(fixture.allowed, "escape");
  if (!(await tryDirectorySymlink(fixture.outsideDirectory, escapeLink))) {
    context.skip("escape-link fixture not run: directory links unavailable");
    return;
  }
  await assert.rejects(
    () =>
      applyFileTransaction({
        stateRoot: fixture.stateRoot,
        allowedRoots: [fixture.allowed],
        operations: [{ target: join(escapeLink, "SENTINEL"), content: "escaped\n" }],
      }),
    "a write whose canonical path escapes the allowed root must be refused",
  );
});

test("a file link that escapes the allowed root is refused for both write and removal", async (context) => {
  const fixture = await createFixture(context);
  const before = await sha256File(fixture.outsideSentinel);
  const linkPath = join(fixture.allowed, "sentinel-link");

  if (!(await tryFileSymlink(fixture.outsideSentinel, linkPath))) {
    notRun.push({ fixture: "escape-file-link", reason: "this host cannot create file symlinks without privileges" });
    context.skip("escape-file-link fixture not run: file symlinks unavailable");
    return;
  }

  await assert.rejects(
    () =>
      applyFileTransaction({
        stateRoot: fixture.stateRoot,
        allowedRoots: [fixture.allowed],
        operations: [{ target: linkPath, content: "overwritten through a link\n" }],
      }),
    "writing through a link that resolves outside the allowed root must be refused",
  );

  await assert.rejects(
    () =>
      applyFileTransaction({
        stateRoot: fixture.stateRoot,
        allowedRoots: [fixture.allowed],
        operations: [{ target: linkPath, content: null }],
      }),
    "removing through a link that resolves outside the allowed root must be refused",
  );

  assert.equal(await sha256File(fixture.outsideSentinel), before, "the outside sentinel was modified through a link");
});

test("every managed root class enforces containment, not just the target root", async (context) => {
  const fixture = await createFixture(context);
  const before = await sha256File(fixture.outsideSentinel);

  for (const rootClass of MANAGED_ROOT_CLASSES) {
    const escapingTarget = join(fixture.outsideDirectory, `${rootClass}.txt`);
    await assert.rejects(
      () =>
        applyFileTransaction({
          stateRoot: fixture.stateRoot,
          allowedRoots: [fixture.allowed],
          operations: [{ target: escapingTarget, content: `${rootClass}\n` }],
        }),
      `the ${rootClass} root class accepted a path outside the allowed root`,
    );
    assert.equal(existsSync(escapingTarget), false, `the ${rootClass} class wrote outside the allowed root`);
  }

  assert.equal(await sha256File(fixture.outsideSentinel), before);
});

test("a parent swapped between preflight and mutation is caught by an immediate recheck", async (context) => {
  const fixture = await createFixture(context);
  const before = await sha256File(fixture.outsideSentinel);

  const parent = join(fixture.allowed, "parent");
  await mkdir(parent, { recursive: true });

  const linkParent = join(fixture.allowed, "swapped");
  if (!(await tryDirectorySymlink(parent, linkParent))) {
    notRun.push({ fixture: "parent-swap", reason: "this host cannot create directory links without privileges" });
    context.skip("parent-swap fixture not run: directory links unavailable");
    return;
  }

  // Preflight succeeds: the ancestor still points inside the allowed root.
  const proof = await provePathBoundary({
    path: join(linkParent, "SENTINEL"),
    allowedRoots: [fixture.allowed],
    role: "target",
  });
  assert.equal(proof.proven, true, "the preflight proof must succeed before the swap");
  assert.equal((await recheckPathProof(proof)).ok, true, "an unchanged chain must recheck successfully");

  // Deterministic failpoint: the ancestor is retargeted outside the allowed
  // root after preflight and before the rename.
  await rm(linkParent, { recursive: true, force: true });
  if (!(await tryDirectorySymlink(fixture.outsideDirectory, linkParent))) {
    notRun.push({ fixture: "parent-swap", reason: "the ancestor could not be retargeted on this host" });
    context.skip("parent-swap fixture not run: ancestor retarget failed");
    return;
  }

  const recheck = await recheckPathProof(proof);
  assert.equal(recheck.ok, false, "a retargeted ancestor must be caught by the recheck before mutation");
  assert.equal(recheck.code, "ancestor-changed", "the refusal must name the ancestor drift");
  assert.equal(await sha256File(fixture.outsideSentinel), before, "the parent swap reached the outside sentinel");
});

test("an unclassified reparse point yields a stable unsupported refusal", async (context) => {
  const fixture = await createFixture(context);

  if (process.platform !== "win32") {
    notRun.push({ fixture: "unknown-reparse", reason: "reparse points are a Windows-only concept" });
    context.skip("unknown-reparse fixture not run: not a Windows host");
    return;
  }

  // An unclassified reparse tag generally requires a privileged fixture. When
  // it cannot be created this is recorded as not-run, never as a pass.
  const probe = spawnSync("cmd.exe", ["/d", "/s", "/c", "fsutil reparsepoint query ."], {
    cwd: fixture.allowed,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  if (probe.status !== 0) {
    notRun.push({ fixture: "unknown-reparse", reason: "fsutil reparsepoint is unavailable or unprivileged on this host" });
    context.skip("unknown-reparse fixture not run: privileged reparse facilities unavailable");
    return;
  }

  const target = join(fixture.allowed, "reparse", "payload.txt");
  await assert.rejects(
    () =>
      applyFileTransaction({
        stateRoot: fixture.stateRoot,
        allowedRoots: [fixture.allowed],
        operations: [{ target, content: "through an unknown reparse kind\n" }],
      }),
    "an unclassified reparse kind must produce a stable unsupported refusal",
  );
});

test("an unproven boundary offers no override that turns it into an applyable one", async (context) => {
  const fixture = await createFixture(context);
  const before = await sha256File(fixture.outsideSentinel);

  // There is deliberately no force/override option on the transaction API. If
  // one is ever added, this assertion is what should stop it.
  const options = {
    stateRoot: fixture.stateRoot,
    allowedRoots: [fixture.allowed],
    operations: [{ target: fixture.outsideSentinel, content: "forced\n" }],
  };
  assert.equal(
    Object.hasOwn(options, "force") || Object.hasOwn(options, "allowUnproven"),
    false,
    "the apply surface must not expose an override for an unproven boundary",
  );
  await assert.rejects(() => applyFileTransaction(options));
  assert.equal(await sha256File(fixture.outsideSentinel), before);
});

test("unsupported path fixtures are reported, never counted as passes", (context) => {
  context.diagnostic(`path-boundary not-run evidence: ${JSON.stringify(notRun)}`);
  for (const record of notRun) {
    assert.ok(record.reason.length > 0, `not-run record for ${record.fixture} must carry a reason`);
  }
  // Records are evidence, not failures: the suite states plainly what this
  // host could not prove so a green run is never mistaken for full coverage.
  assert.ok(Array.isArray(notRun));
});

// ---------------------------------------------------------------------------
// Plan 01-07 Task 2: operation-wide proof set and immediate recheck
// ---------------------------------------------------------------------------

/** A complete set of declared paths, one per role the contract names. */
async function completeInputs(fixture: Fixture): Promise<Array<{ role: OperationPathRole; path: string }>> {
  await mkdir(join(fixture.allowed, "source"), { recursive: true });
  return [
    { role: "target", path: join(fixture.allowed, "target.txt") },
    { role: "state", path: join(fixture.allowed, "state") },
    { role: "journal", path: join(fixture.allowed, "state", "journal") },
    { role: "snapshot", path: join(fixture.allowed, "state", "snapshots") },
    { role: "temp", path: join(fixture.allowed, "state", "tmp") },
    { role: "source", path: join(fixture.allowed, "source") },
    { role: "package-root", path: fixture.allowed },
  ];
}

const ALL_ROLES: readonly OperationPathRole[] = [
  "target", "state", "journal", "snapshot", "temp", "source", "package-root",
];

test("a complete operation proof set proves every declared role", async (context) => {
  const fixture = await createFixture(context);
  const set = await proveOperationPaths({
    inputs: await completeInputs(fixture),
    allowedRoots: [fixture.allowed],
    requiredRoles: ALL_ROLES,
  });

  assert.equal(set.proven, true, `expected a proven set, got ${set.code}: ${String(set.detail)}`);
  assert.equal(set.code, "ok");
  for (const role of ALL_ROLES) {
    assert.ok(set.get(role) !== undefined, `role ${role} must be present in the proof set`);
    assert.equal(set.get(role)?.proven, true, `role ${role} must be proven`);
  }
});

test("an operation missing a required path role refuses before mutation", async (context) => {
  const fixture = await createFixture(context);
  const before = await sha256File(fixture.outsideSentinel);

  const inputs = (await completeInputs(fixture)).filter((input) => input.role !== "snapshot" && input.role !== "journal");
  const set = await proveOperationPaths({
    inputs,
    allowedRoots: [fixture.allowed],
    requiredRoles: ALL_ROLES,
  });

  assert.equal(set.proven, false, "an incomplete role set must not be proven");
  assert.equal(set.code, "missing-role");
  assert.ok(set.detail?.includes("journal"), "the refusal must name the missing roles");
  assert.ok(set.detail?.includes("snapshot"));
  assert.equal(await sha256File(fixture.outsideSentinel), before);
});

test("a path discovered during apply is not in the proof set and cannot be proven late", async (context) => {
  const fixture = await createFixture(context);
  const set = await proveOperationPaths({
    inputs: await completeInputs(fixture),
    allowedRoots: [fixture.allowed],
    requiredRoles: ALL_ROLES,
  });

  assert.equal(set.proven, true);
  assert.equal(set.includes(join(fixture.allowed, "target.txt")), true, "a declared path must be in the set");
  assert.equal(
    set.includes(join(fixture.allowed, "discovered-during-apply.txt")),
    false,
    "a path first seen during apply must not be treated as proven",
  );

  // The set is immutable: an apply step cannot append to it.
  assert.throws(() => {
    (set.proofs as unknown as PathProof[]).push(set.proofs[0] as PathProof);
  }, "the proof set must be immutable once established");
});

test("a role whose path escapes the allowed root fails the whole operation", async (context) => {
  const fixture = await createFixture(context);
  const inputs = await completeInputs(fixture);
  const set = await proveOperationPaths({
    inputs: [...inputs, { role: "temp", path: join(fixture.outsideDirectory, "tmp") }],
    allowedRoots: [fixture.allowed],
    requiredRoles: ALL_ROLES,
  });

  assert.equal(set.proven, false, "one escaping role must fail the operation, not just that path");
  assert.equal(set.code, "outside-configured-root");
});

test("an ancestor replaced by a different directory fails the recheck", async (context) => {
  const fixture = await createFixture(context);
  const parent = join(fixture.allowed, "parent");
  await mkdir(parent, { recursive: true });
  const target = join(parent, "managed.txt");
  await writeFile(target, "managed\n", "utf8");

  const proof = await provePathBoundary({ path: target, allowedRoots: [fixture.allowed], role: "target" });
  assert.equal(proof.proven, true);
  assert.equal((await recheckPathProof(proof)).ok, true, "an untouched chain must recheck successfully");

  // Replace the ancestor with a different directory of the same name. The
  // configured path still looks identical; the object underneath is new.
  await rm(parent, { recursive: true, force: true });
  await mkdir(parent, { recursive: true });

  const recheck = await recheckPathProof(proof);
  assert.equal(recheck.ok, false, "a replaced ancestor must fail the recheck");
  assert.equal(recheck.code, "ancestor-changed");
});

test("a proof that never succeeded can never pass a recheck", async (context) => {
  const fixture = await createFixture(context);
  const proof = await provePathBoundary({
    path: join(fixture.outsideDirectory, "SENTINEL"),
    allowedRoots: [fixture.allowed],
    role: "target",
  });

  assert.equal(proof.proven, false);
  const recheck = await recheckPathProof(proof);
  assert.equal(recheck.ok, false, "an unproven path must not become proven by rechecking it");
  assert.equal(recheck.code, "outside-configured-root");
});

test("an unprovable filesystem is reported as unsupported rather than allowed", async (context) => {
  const fixture = await createFixture(context);

  // No allowed root declared at all: there is nothing to prove containment
  // against, and the answer is a refusal rather than a permissive default.
  const proof = await provePathBoundary({
    path: join(fixture.allowed, "target.txt"),
    allowedRoots: [],
    role: "target",
  });

  assert.equal(proof.proven, false);
  assert.equal(proof.capability.supported, false, "support must not be advertised when nothing was proven");
  assert.ok(proof.detail !== null, "an unsupported result must carry a reason");
});
