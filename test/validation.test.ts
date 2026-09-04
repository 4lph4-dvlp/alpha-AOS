// Wave 0 matrix for SAFE-05 (D-08 through D-11).
//
// Every managed document must be rejected *before* any mutation when it is
// malformed, ambiguous, closed-world-violating, or from an unknown newer
// schema version. A supported older version parses read-only and yields a
// migration plan. Unknown namespaced extensions are preserved and inert.

import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { readProjectManifest } from "../src/core/isolation.js";
import { listManagedTransactions } from "../src/core/transaction.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");

/** The document kinds Phase 1 treats as managed input. */
type DocumentKind =
  | "catalog"
  | "lock"
  | "project-manifest"
  | "journal"
  | "install-state"
  | "writer-lock"
  | "evidence"
  | "receipt"
  | "native-config";

/**
 * Each managed kind must carry a case in every column. A kind missing a column
 * is a coverage gap, and the coverage test below is what makes that visible.
 */
type CaseClass =
  | "current-valid"
  | "malformed"
  | "ambiguous"
  | "closed-world"
  | "unknown-extension"
  | "supported-old"
  | "unknown-newer";

interface MatrixCase {
  readonly kind: DocumentKind;
  readonly klass: CaseClass;
  readonly name: string;
  /** Document bytes as they would appear on disk. */
  readonly document: string;
  /** Whether a strict loader must refuse this document. */
  readonly rejected: boolean;
}

const VALID_MANIFEST = ["schemaVersion: 1", "trusted: false", ""].join("\n");

const MATRIX: readonly MatrixCase[] = [
  // ---- catalog (YAML) ----
  { kind: "catalog", klass: "current-valid", name: "catalog v1", rejected: false,
    document: "schemaVersion: 1\nname: alpha-aos\nharnesses: {}\ncomponents: {}\npolicy: {}\n" },
  { kind: "catalog", klass: "malformed", name: "catalog with unbalanced flow map", rejected: true,
    document: "schemaVersion: 1\nname: alpha-aos\nharnesses: {\ncomponents: {}\n" },
  { kind: "catalog", klass: "ambiguous", name: "catalog with duplicate top-level key", rejected: true,
    document: "schemaVersion: 1\nname: alpha-aos\nharnesses: {}\nharnesses: {claude: {}}\ncomponents: {}\npolicy: {}\n" },
  { kind: "catalog", klass: "ambiguous", name: "catalog as a multi-document stream", rejected: true,
    document: "schemaVersion: 1\nname: alpha-aos\nharnesses: {}\ncomponents: {}\npolicy: {}\n---\nschemaVersion: 1\nname: shadow\n" },
  { kind: "catalog", klass: "ambiguous", name: "catalog with an alias expansion bomb", rejected: true,
    document: "schemaVersion: 1\nname: alpha-aos\na: &a [x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nharnesses: {}\ncomponents: {}\npolicy: {}\n" },
  { kind: "catalog", klass: "closed-world", name: "catalog with an unknown bare core field", rejected: true,
    document: "schemaVersion: 1\nname: alpha-aos\nharnesses: {}\ncomponents: {}\npolicy: {}\nunknownCoreField: true\n" },
  { kind: "catalog", klass: "unknown-extension", name: "catalog with a namespaced extension", rejected: false,
    document: "schemaVersion: 1\nname: alpha-aos\nharnesses: {}\ncomponents: {}\npolicy: {}\nx-vendor-experiment: {enabled: true}\n" },
  { kind: "catalog", klass: "supported-old", name: "catalog at a supported older version", rejected: false,
    document: "schemaVersion: 0\nname: alpha-aos\nharnesses: {}\ncomponents: {}\npolicy: {}\n" },
  { kind: "catalog", klass: "unknown-newer", name: "catalog from an unknown newer version", rejected: true,
    document: "schemaVersion: 2\nname: alpha-aos\nharnesses: {}\ncomponents: {}\npolicy: {}\n" },

  // ---- lock (JSON) ----
  { kind: "lock", klass: "current-valid", name: "lock v1", rejected: false,
    document: '{"schemaVersion":1,"components":{}}' },
  { kind: "lock", klass: "malformed", name: "lock with a trailing comma", rejected: true,
    document: '{"schemaVersion":1,"components":{},}' },
  { kind: "lock", klass: "ambiguous", name: "lock with a duplicate key", rejected: true,
    document: '{"schemaVersion":1,"components":{},"components":{"ghost":{}}}' },
  { kind: "lock", klass: "closed-world", name: "lock with an unknown bare core field", rejected: true,
    document: '{"schemaVersion":1,"components":{},"unknownCoreField":true}' },
  { kind: "lock", klass: "unknown-extension", name: "lock with a namespaced extension", rejected: false,
    document: '{"schemaVersion":1,"components":{},"x-vendor-note":"inert"}' },
  { kind: "lock", klass: "supported-old", name: "lock at a supported older version", rejected: false,
    document: '{"schemaVersion":0,"components":{}}' },
  { kind: "lock", klass: "unknown-newer", name: "lock from an unknown newer version", rejected: true,
    document: '{"schemaVersion":99,"components":{}}' },

  // ---- project manifest (YAML) ----
  { kind: "project-manifest", klass: "current-valid", name: "manifest v1", rejected: false, document: VALID_MANIFEST },
  { kind: "project-manifest", klass: "malformed", name: "manifest with a bad indent", rejected: true,
    document: "schemaVersion: 1\n  trusted: false\n isolation: {}\n" },
  { kind: "project-manifest", klass: "ambiguous", name: "manifest with a duplicate key", rejected: true,
    document: "schemaVersion: 1\ntrusted: false\ntrusted: true\n" },
  { kind: "project-manifest", klass: "closed-world", name: "manifest with an unknown bare core field", rejected: true,
    document: "schemaVersion: 1\ntrusted: false\nunknownCoreField: 1\n" },
  { kind: "project-manifest", klass: "unknown-extension", name: "manifest with a namespaced extension", rejected: false,
    document: "schemaVersion: 1\ntrusted: false\nx-team-owner: platform\n" },
  { kind: "project-manifest", klass: "supported-old", name: "manifest at a supported older version", rejected: false,
    document: "schemaVersion: 0\ntrusted: false\n" },
  { kind: "project-manifest", klass: "unknown-newer", name: "manifest from an unknown newer version", rejected: true,
    document: "schemaVersion: 7\ntrusted: false\n" },

  // ---- journal (JSON) ----
  { kind: "journal", klass: "current-valid", name: "journal v1", rejected: false,
    document: '{"schemaVersion":1,"id":"op","createdAt":"2026-01-01T00:00:00.000Z","status":"applied","allowedRoots":["/tmp/x"],"files":[]}' },
  { kind: "journal", klass: "malformed", name: "truncated journal", rejected: true,
    document: '{"schemaVersion":1,"id":"op","files":[' },
  { kind: "journal", klass: "ambiguous", name: "journal with a duplicate status", rejected: true,
    document: '{"schemaVersion":1,"id":"op","createdAt":"2026-01-01T00:00:00.000Z","status":"applied","status":"failed","allowedRoots":["/tmp/x"],"files":[]}' },
  { kind: "journal", klass: "closed-world", name: "journal with an unknown bare core field", rejected: true,
    document: '{"schemaVersion":1,"id":"op","createdAt":"2026-01-01T00:00:00.000Z","status":"applied","allowedRoots":["/tmp/x"],"files":[],"unknownCoreField":1}' },
  { kind: "journal", klass: "unknown-extension", name: "journal with a namespaced extension", rejected: false,
    document: '{"schemaVersion":1,"id":"op","createdAt":"2026-01-01T00:00:00.000Z","status":"applied","allowedRoots":["/tmp/x"],"files":[],"x-tool-trace":"inert"}' },
  { kind: "journal", klass: "supported-old", name: "journal at a supported older version", rejected: false,
    document: '{"schemaVersion":0,"id":"op","createdAt":"2026-01-01T00:00:00.000Z","status":"applied","allowedRoots":["/tmp/x"],"files":[]}' },
  { kind: "journal", klass: "unknown-newer", name: "journal from an unknown newer version", rejected: true,
    document: '{"schemaVersion":5,"id":"op","createdAt":"2026-01-01T00:00:00.000Z","status":"applied","allowedRoots":["/tmp/x"],"files":[]}' },

  // ---- install state (JSON) ----
  { kind: "install-state", klass: "current-valid", name: "install state v1", rejected: false,
    document: '{"schemaVersion":1,"components":{}}' },
  { kind: "install-state", klass: "malformed", name: "install state that is an array", rejected: true, document: "[]" },
  { kind: "install-state", klass: "ambiguous", name: "install state with a duplicate key", rejected: true,
    document: '{"schemaVersion":1,"components":{},"components":{}}' },
  { kind: "install-state", klass: "closed-world", name: "install state with an unknown bare core field", rejected: true,
    document: '{"schemaVersion":1,"components":{},"unknownCoreField":true}' },
  { kind: "install-state", klass: "unknown-extension", name: "install state with a namespaced extension", rejected: false,
    document: '{"schemaVersion":1,"components":{},"x-host-label":"inert"}' },
  { kind: "install-state", klass: "supported-old", name: "install state at a supported older version", rejected: false,
    document: '{"schemaVersion":0,"components":{}}' },
  { kind: "install-state", klass: "unknown-newer", name: "install state from an unknown newer version", rejected: true,
    document: '{"schemaVersion":42,"components":{}}' },

  // ---- writer lock (JSON) ----
  { kind: "writer-lock", klass: "current-valid", name: "writer lock v1", rejected: false,
    document: '{"schemaVersion":1,"operationId":"op","pid":1234,"startedAt":"2026-01-01T00:00:00.000Z","host":"fixture"}' },
  { kind: "writer-lock", klass: "malformed", name: "empty writer lock", rejected: true, document: "" },
  { kind: "writer-lock", klass: "ambiguous", name: "writer lock with two operation ids", rejected: true,
    document: '{"schemaVersion":1,"operationId":"a","operationId":"b","pid":1,"startedAt":"2026-01-01T00:00:00.000Z","host":"fixture"}' },
  { kind: "writer-lock", klass: "closed-world", name: "writer lock with an unknown bare core field", rejected: true,
    document: '{"schemaVersion":1,"operationId":"op","pid":1,"startedAt":"2026-01-01T00:00:00.000Z","host":"fixture","unknownCoreField":1}' },
  { kind: "writer-lock", klass: "unknown-extension", name: "writer lock with a namespaced extension", rejected: false,
    document: '{"schemaVersion":1,"operationId":"op","pid":1,"startedAt":"2026-01-01T00:00:00.000Z","host":"fixture","x-agent":"inert"}' },
  { kind: "writer-lock", klass: "supported-old", name: "writer lock at a supported older version", rejected: false,
    document: '{"schemaVersion":0,"operationId":"op","pid":1,"startedAt":"2026-01-01T00:00:00.000Z","host":"fixture"}' },
  { kind: "writer-lock", klass: "unknown-newer", name: "writer lock from an unknown newer version", rejected: true,
    document: '{"schemaVersion":3,"operationId":"op","pid":1,"startedAt":"2026-01-01T00:00:00.000Z","host":"fixture"}' },

  // ---- project evidence (JSON) ----
  { kind: "evidence", klass: "current-valid", name: "evidence v1", rejected: false,
    document: '{"schemaVersion":1,"projectId":"abc","facts":[]}' },
  { kind: "evidence", klass: "malformed", name: "evidence with an unquoted key", rejected: true,
    document: '{schemaVersion:1,"projectId":"abc","facts":[]}' },
  { kind: "evidence", klass: "ambiguous", name: "evidence with a duplicate facts key", rejected: true,
    document: '{"schemaVersion":1,"projectId":"abc","facts":[],"facts":[{"id":"ghost"}]}' },
  { kind: "evidence", klass: "closed-world", name: "evidence with an unknown bare core field", rejected: true,
    document: '{"schemaVersion":1,"projectId":"abc","facts":[],"unknownCoreField":true}' },
  { kind: "evidence", klass: "unknown-extension", name: "evidence with a namespaced extension", rejected: false,
    document: '{"schemaVersion":1,"projectId":"abc","facts":[],"x-scanner":"inert"}' },
  { kind: "evidence", klass: "supported-old", name: "evidence at a supported older version", rejected: false,
    document: '{"schemaVersion":0,"projectId":"abc","facts":[]}' },
  { kind: "evidence", klass: "unknown-newer", name: "evidence from an unknown newer version", rejected: true,
    document: '{"schemaVersion":11,"projectId":"abc","facts":[]}' },

  // ---- pack receipt (JSON) ----
  { kind: "receipt", klass: "current-valid", name: "receipt v1", rejected: false,
    document: '{"schemaVersion":1,"packId":"web","sourceHash":"abc","targets":[]}' },
  { kind: "receipt", klass: "malformed", name: "receipt that is a bare string", rejected: true, document: '"receipt"' },
  { kind: "receipt", klass: "ambiguous", name: "receipt with a duplicate pack id", rejected: true,
    document: '{"schemaVersion":1,"packId":"web","packId":"other","sourceHash":"abc","targets":[]}' },
  { kind: "receipt", klass: "closed-world", name: "receipt with an unknown bare core field", rejected: true,
    document: '{"schemaVersion":1,"packId":"web","sourceHash":"abc","targets":[],"unknownCoreField":1}' },
  { kind: "receipt", klass: "unknown-extension", name: "receipt with a namespaced extension", rejected: false,
    document: '{"schemaVersion":1,"packId":"web","sourceHash":"abc","targets":[],"x-origin":"inert"}' },
  { kind: "receipt", klass: "supported-old", name: "receipt at a supported older version", rejected: false,
    document: '{"schemaVersion":0,"packId":"web","sourceHash":"abc","targets":[]}' },
  { kind: "receipt", klass: "unknown-newer", name: "receipt from an unknown newer version", rejected: true,
    document: '{"schemaVersion":8,"packId":"web","sourceHash":"abc","targets":[]}' },

  // ---- alpha-AOS-owned native configuration subtree (JSON / TOML) ----
  { kind: "native-config", klass: "current-valid", name: "native subtree v1", rejected: false,
    document: '{"alphaAos":{"schemaVersion":1,"managed":{}}}' },
  { kind: "native-config", klass: "malformed", name: "native subtree with invalid JSON", rejected: true,
    document: '{"alphaAos":{"schemaVersion":1,"managed":{}}' },
  { kind: "native-config", klass: "ambiguous", name: "native subtree with a duplicate managed key", rejected: true,
    document: '{"alphaAos":{"schemaVersion":1,"managed":{},"managed":{"ghost":1}}}' },
  { kind: "native-config", klass: "ambiguous", name: "TOML subtree with a dotted/quoted key collision", rejected: true,
    document: 'alphaAos.schemaVersion = 1\n[alphaAos]\n"schemaVersion" = 1\n' },
  { kind: "native-config", klass: "closed-world", name: "native subtree with an unknown bare core field", rejected: true,
    document: '{"alphaAos":{"schemaVersion":1,"managed":{},"unknownCoreField":true}}' },
  { kind: "native-config", klass: "unknown-extension", name: "native subtree with a namespaced extension", rejected: false,
    document: '{"alphaAos":{"schemaVersion":1,"managed":{},"x-editor":"inert"}}' },
  { kind: "native-config", klass: "supported-old", name: "native subtree at a supported older version", rejected: false,
    document: '{"alphaAos":{"schemaVersion":0,"managed":{}}}' },
  { kind: "native-config", klass: "unknown-newer", name: "native subtree from an unknown newer version", rejected: true,
    document: '{"alphaAos":{"schemaVersion":4,"managed":{}}}' },
];

const ALL_KINDS: readonly DocumentKind[] = [
  "catalog", "lock", "project-manifest", "journal",
  "install-state", "writer-lock", "evidence", "receipt", "native-config",
];

const ALL_CLASSES: readonly CaseClass[] = [
  "current-valid", "malformed", "ambiguous",
  "closed-world", "unknown-extension", "supported-old", "unknown-newer",
];

test("every managed document kind carries a case in every validation class", () => {
  const missing: string[] = [];
  for (const kind of ALL_KINDS) {
    for (const klass of ALL_CLASSES) {
      if (!MATRIX.some((entry) => entry.kind === kind && entry.klass === klass)) {
        missing.push(`${kind}/${klass}`);
      }
    }
  }
  assert.deepEqual(missing, [], `the validation matrix has uncovered kind/class combinations: ${missing.join(", ")}`);
});

/**
 * A strict loader for the kinds that already have one. The remaining kinds are
 * routed here so the matrix names the seam that later plans must fill; until a
 * strict engine exists these entries are what makes this suite red.
 */
async function loadDocument(kind: DocumentKind, root: string, document: string): Promise<unknown> {
  switch (kind) {
    case "catalog": {
      await mkdir(join(root, "catalog"), { recursive: true });
      await writeFile(join(root, "catalog", "stack.yaml"), document, "utf8");
      return loadCatalog(root);
    }
    case "lock": {
      await mkdir(join(root, "catalog"), { recursive: true });
      await writeFile(join(root, "catalog", "stack.lock.json"), document, "utf8");
      return loadLock(root);
    }
    case "project-manifest": {
      await mkdir(join(root, ".alpha-aos"), { recursive: true });
      await writeFile(join(root, ".alpha-aos", "stack.yaml"), document, "utf8");
      return readProjectManifest(root);
    }
    case "journal": {
      const journalRoot = join(root, "journal");
      await mkdir(journalRoot, { recursive: true });
      await writeFile(join(journalRoot, "fixture.json"), document, "utf8");
      const journals = await listManagedTransactions(root);
      // A corrupt journal must be surfaced as a rejection, not silently dropped.
      if (journals.length === 0) throw new Error("journal rejected");
      return journals;
    }
    default: {
      // install-state, writer-lock, evidence, receipt and native-config have no
      // strict loader yet. Parsing alone is not validation, so anything that
      // parses is reported as accepted and the matrix marks the gap.
      const parsed: unknown = JSON.parse(document);
      return parsed;
    }
  }
}

test("malformed, ambiguous, closed-world and newer-version documents are rejected before mutation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-validation-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  for (const [index, entry] of MATRIX.entries()) {
    const caseRoot = join(root, `case-${index}`);
    await mkdir(caseRoot, { recursive: true });
    // A sentinel that any mutation during validation would disturb.
    const sentinel = join(caseRoot, "SENTINEL");
    await writeFile(sentinel, "untouched\n", "utf8");

    let rejected = false;
    try {
      await loadDocument(entry.kind, caseRoot, entry.document);
    } catch {
      rejected = true;
    }

    assert.equal(
      rejected,
      entry.rejected,
      `${entry.kind}/${entry.klass}: "${entry.name}" should have been ${entry.rejected ? "rejected" : "accepted"}`,
    );
    assert.equal(await readFile(sentinel, "utf8"), "untouched\n", `${entry.name} mutated during validation`);
  }
});

test("validating the same invalid document twice produces identical, bounded issues", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-validation-repeat-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const invalid = MATRIX.filter((entry) => entry.rejected);
  assert.ok(invalid.length > 0, "the matrix must contain rejected cases");

  for (const [index, entry] of invalid.entries()) {
    const caseRoot = join(root, `repeat-${index}`);
    await mkdir(caseRoot, { recursive: true });

    const attempt = async (): Promise<string> => {
      try {
        await loadDocument(entry.kind, caseRoot, entry.document);
        return "accepted";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    const first = await attempt();
    const second = await attempt();
    assert.equal(second, first, `${entry.name} produced a non-deterministic validation result`);
    assert.ok(first.length <= 2000, `${entry.name} produced an unbounded validation message (${first.length} bytes)`);
  }
});

test("an unknown namespaced extension is preserved and never reaches an operation plan", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-validation-extension-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const catalogRoot = join(root, "checkout");
  await mkdir(join(catalogRoot, "catalog"), { recursive: true });
  // Start from the real catalog so the document is otherwise valid.
  const realCatalog = await readFile(join(repositoryRoot, "catalog", "stack.yaml"), "utf8");
  await copyFile(join(repositoryRoot, "catalog", "stack.lock.json"), join(catalogRoot, "catalog", "stack.lock.json"));
  await writeFile(
    join(catalogRoot, "catalog", "stack.yaml"),
    `${realCatalog}\nx-vendor-experiment:\n  enabled: true\n  note: inert\n`,
    "utf8",
  );

  const withExtension = await loadCatalog(catalogRoot);
  const baseline = await loadCatalog(repositoryRoot);

  // The extension is preserved on the loaded document...
  assert.ok(
    Object.hasOwn(withExtension as unknown as Record<string, unknown>, "x-vendor-experiment"),
    "an unknown namespaced extension must be preserved for display",
  );
  // ...and changes nothing the operation planner consumes.
  assert.deepEqual(withExtension.harnesses, baseline.harnesses, "an extension must not alter harness planning input");
  assert.deepEqual(withExtension.components, baseline.components, "an extension must not alter component planning input");
  assert.deepEqual(withExtension.policy, baseline.policy, "an extension must not alter policy planning input");
});

test("a malformed namespace is rejected rather than treated as an inert extension", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-validation-namespace-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "catalog"), { recursive: true });
  const base = "schemaVersion: 1\nname: alpha-aos\nharnesses: {}\ncomponents: {}\npolicy: {}\n";
  for (const malformed of ["x-: {}", "x: {}", "-x-vendor: {}", "X-VENDOR : {}"]) {
    await writeFile(join(root, "catalog", "stack.yaml"), `${base}${malformed}\n`, "utf8");
    await assert.rejects(
      () => loadCatalog(root),
      `a malformed namespace (\`${malformed}\`) must be rejected, not accepted as an extension`,
    );
  }
});
