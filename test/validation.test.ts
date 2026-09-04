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
import { createHash } from "node:crypto";
import {
  clearExtensionAdapters,
  createMigrationPlan,
  registerExtensionAdapter,
  validateManagedDocument,
} from "../src/core/validation.js";

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

/** Format each managed kind is written in on disk. */
const FORMATS: Record<DocumentKind, "json" | "yaml" | "toml"> = {
  catalog: "yaml",
  lock: "json",
  "project-manifest": "yaml",
  journal: "json",
  "install-state": "json",
  "writer-lock": "json",
  evidence: "json",
  receipt: "json",
  "native-config": "json",
};

/**
 * Routes a matrix case through the strict engine. The TOML ambiguity case
 * declares its own format because the native-config subtree exists in both.
 */
function validateCase(entry: MatrixCase): ReturnType<typeof validateManagedDocument> {
  const format = entry.document.trimStart().startsWith("alphaAos.") ? "toml" : FORMATS[entry.kind];
  return validateManagedDocument({ text: entry.document, format, kind: entry.kind });
}

test("malformed, ambiguous, closed-world and newer-version documents are rejected before mutation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-validation-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  // A sentinel any mutation during validation would disturb.
  const sentinel = join(root, "SENTINEL");
  await writeFile(sentinel, "untouched\n", "utf8");

  for (const entry of MATRIX) {
    const result = validateCase(entry);
    const rejected = !result.ok;

    assert.equal(
      rejected,
      entry.rejected,
      `${entry.kind}/${entry.klass}: "${entry.name}" should have been ${entry.rejected ? "rejected" : "accepted"}` +
        ` (status=${result.status}, issues=${JSON.stringify(result.issues)})`,
    );
    if (rejected) {
      assert.ok(result.issues.length > 0, `${entry.name} must explain why it was rejected`);
      for (const problem of result.issues) {
        assert.ok(problem.code.length > 0, "every issue must carry a stable code");
        assert.ok(problem.documentPath.startsWith("/"), "every issue must carry a document path");
        // A short document has no distinctive prefix to look for; anything
        // shorter than 8 characters would make this check vacuous.
        const distinctive = entry.document.trim().slice(0, 24);
        if (distinctive.length >= 8) {
          assert.equal(
            problem.actualShape.includes(distinctive),
            false,
            "an issue must summarize the shape, never echo the raw document",
          );
        }
      }
    }
    assert.equal(await readFile(sentinel, "utf8"), "untouched\n", `${entry.name} mutated during validation`);
  }
});

test("validation never coerces, defaults, or strips the input it is judging", () => {
  const before = '{"schemaVersion":1,"components":{},"x-vendor":{"keep":true}}';
  const result = validateManagedDocument({ text: before, format: "json", kind: "lock" });

  assert.equal(result.ok, true);
  // The extension is preserved verbatim...
  assert.deepEqual(result.extensions, { "x-vendor": { keep: true } });
  // ...and contributes nothing typed without a registered adapter.
  assert.deepEqual(result.typedExtensions, {});
  // ...and is absent from the normalized core the planner consumes.
  assert.equal(Object.hasOwn(result.value as object, "x-vendor"), false);

  // A string version is not coerced into a number.
  const coerced = validateManagedDocument({ text: '{"schemaVersion":"1","components":{}}', format: "json", kind: "lock" });
  assert.equal(coerced.ok, false);
  assert.equal(coerced.issues[0]?.code, "version.missing");
});

test("validating the same invalid document twice produces identical, bounded issues", () => {
  const invalid = MATRIX.filter((entry) => entry.rejected);
  assert.ok(invalid.length > 0, "the matrix must contain rejected cases");

  for (const entry of invalid) {
    const first = validateCase(entry);
    const second = validateCase(entry);
    assert.deepEqual(second, first, `${entry.name} produced a non-deterministic validation result`);
    assert.ok(first.issues.length <= 50, `${entry.name} exceeded the issue cap (${first.issues.length})`);

    // Issues arrive sorted by documentPath, then code, then expected.
    const keys = first.issues.map((problem) => `${problem.documentPath}\u0000${problem.code}\u0000${problem.expected}`);
    assert.deepEqual(keys, [...keys].sort(), `${entry.name} returned issues in an unstable order`);
  }
});

test("a document with many faults is capped rather than allowed to flood output", () => {
  const fields = Array.from({ length: 400 }, (_, index) => `"unknownField${index}":true`).join(",");
  const result = validateManagedDocument({
    text: `{"schemaVersion":1,"components":{},${fields}}`,
    format: "json",
    kind: "lock",
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.length, 50, "the issue list must be capped at 50");
  assert.equal(result.issuesTruncated, true, "truncation must be reported, not silent");
});

/** A minimal valid catalog, built by join so the fixture stays readable. */
const CATALOG_BASE = [
  "schemaVersion: 1",
  "name: alpha-aos",
  "harnesses: {}",
  "components: {}",
  "policy: {}",
  "",
].join("\n");

test("an unknown namespaced extension is preserved and never reaches an operation plan", () => {
  const baseline = validateManagedDocument({ text: CATALOG_BASE, format: "yaml", kind: "catalog" });
  const withExtension = validateManagedDocument({
    text: `${CATALOG_BASE}${["x-vendor-experiment:", "  enabled: true", "  note: inert", ""].join("\n")}`,
    format: "yaml",
    kind: "catalog",
  });

  assert.equal(baseline.ok, true, JSON.stringify(baseline.issues));
  assert.equal(withExtension.ok, true, JSON.stringify(withExtension.issues));

  // Preserved for display and round-trip...
  assert.deepEqual(withExtension.extensions, { "x-vendor-experiment": { enabled: true, note: "inert" } });
  // ...contributes nothing typed without a registered adapter...
  assert.deepEqual(withExtension.typedExtensions, {});
  // ...and leaves the value the planner consumes byte-identical.
  assert.deepEqual(withExtension.value, baseline.value);
  assert.equal(
    createHash("sha256").update(JSON.stringify(withExtension.value)).digest("hex"),
    createHash("sha256").update(JSON.stringify(baseline.value)).digest("hex"),
    "an unregistered extension must not change the operation plan digest",
  );
});

test("only a registered namespace with a passing schema contributes typed data", () => {
  clearExtensionAdapters();
  registerExtensionAdapter({
    namespace: "x-vendor-experiment",
    schema: {
      type: "object",
      required: ["enabled"],
      properties: { enabled: { type: "boolean" } },
      additionalProperties: true,
    },
  });

  const accepted = validateManagedDocument({
    text: `${CATALOG_BASE}${["x-vendor-experiment:", "  enabled: true", ""].join("\n")}`,
    format: "yaml",
    kind: "catalog",
  });
  assert.deepEqual(accepted.typedExtensions, { "x-vendor-experiment": { enabled: true } });

  // A registered namespace whose data fails its own schema contributes nothing.
  const rejected = validateManagedDocument({
    text: `${CATALOG_BASE}${["x-vendor-experiment:", '  enabled: "yes"', ""].join("\n")}`,
    format: "yaml",
    kind: "catalog",
  });
  assert.deepEqual(rejected.typedExtensions, {}, "adapter data must pass the adapter's own schema");
  assert.equal(rejected.ok, true, "a failing extension does not invalidate the core document");

  // An unregistered namespace stays inert even alongside a registered one.
  const mixed = validateManagedDocument({
    text: `${CATALOG_BASE}${["x-vendor-experiment:", "  enabled: true", "x-other-vendor:", "  anything: 1", ""].join("\n")}`,
    format: "yaml",
    kind: "catalog",
  });
  assert.equal(Object.hasOwn(mixed.typedExtensions, "x-other-vendor"), false);
  assert.equal(Object.hasOwn(mixed.extensions, "x-other-vendor"), true);
  clearExtensionAdapters();
});

test("a malformed namespace is rejected rather than treated as an inert extension", () => {
  for (const malformed of ["x-: {}", "x: {}", "-x-vendor: {}", "X-VENDOR: {}", "x-Vendor: {}"]) {
    const result = validateManagedDocument({
      text: `${CATALOG_BASE}${malformed}\n`,
      format: "yaml",
      kind: "catalog",
    });
    assert.equal(
      result.ok,
      false,
      `a malformed namespace (${malformed}) must be rejected, not accepted as an extension`,
    );
    assert.equal(result.issues[0]?.code, "schema.unknown-core-field");
  }

  // Registering a malformed namespace is itself refused.
  assert.throws(() => registerExtensionAdapter({ namespace: "x-", schema: { type: "object" } }), /malformed/u);
});

test("version routing distinguishes current, migratable and newer, and plans without mutating", () => {
  const current = validateManagedDocument({ text: '{"schemaVersion":1,"components":{}}', format: "json", kind: "lock" });
  assert.equal(current.status, "current");
  assert.notEqual(current.value, null, "a current document yields a typed value");
  assert.equal(createMigrationPlan(current), null, "a current document needs no migration");

  const old = validateManagedDocument({ text: '{"schemaVersion":0,"components":{}}', format: "json", kind: "lock" });
  assert.equal(old.status, "migratable");
  assert.equal(old.value, null, "a migratable document must not be implicitly converted to a typed value");
  assert.notEqual(old.readOnlyValue, null, "a migratable document is still readable");

  const plan = createMigrationPlan(old);
  assert.ok(plan !== null);
  assert.equal(plan.fromVersion, 0);
  assert.equal(plan.toVersion, 1);
  assert.equal(plan.sourceHash.length, 64);
  assert.equal(plan.targetHash.length, 64);
  assert.notEqual(plan.sourceHash, plan.targetHash);
  assert.deepEqual(createMigrationPlan(old), plan, "the plan must be deterministic");
  // Planning leaves the source document untouched.
  assert.deepEqual(old.readOnlyValue, { schemaVersion: 0, components: {} });

  const newer = validateManagedDocument({ text: '{"schemaVersion":99,"components":{}}', format: "json", kind: "lock" });
  assert.equal(newer.status, "unknown-newer");
  assert.equal(newer.issues[0]?.code, "version.unknown-newer");
  assert.equal(createMigrationPlan(newer), null, "an unknown newer version has no migration path");
});
