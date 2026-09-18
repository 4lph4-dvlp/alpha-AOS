import { createHash } from "node:crypto";
import Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import { visit, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { parseAllDocuments } from "yaml";

// Ajv ships CommonJS; under ESM the constructor arrives on `.default`.
const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as
  typeof import("ajv/dist/2020.js").default;

export type ManagedDocumentKind =
  | "catalog"
  | "lock"
  | "project-manifest"
  | "journal"
  | "install-state"
  | "writer-lock"
  | "evidence"
  | "receipt"
  | "native-config"
  | "pack-catalog"
  | "fact-vocabulary"
  /**
   * `.alpha-aos/plan.json`. It is the one managed document designed to be
   * COMMITTED, so it arrives attacker-supplied on every clone and is a
   * first-class kind here rather than a caller-supplied schema smuggled
   * through a generic route (02-REVIEW CR-04).
   */
  | "approved-plan"
  /**
   * The host capability ledger under `userStateRoot()`. It records what was
   * proven about a capability on THIS machine, so it is host state a user or
   * another process can edit at any time — a hand-edited row claiming a proof
   * that never ran is the threat it is validated against (03-CONTEXT.md D-03,
   * T-03-20). It joins the same closed-world route a receipt uses.
   */
  | "capability-ledger"
  /**
   * `catalog/canaries.yaml`. The declared canary prompts. It is a repository
   * contract like `pack-catalog`, and it is validated closed for the same
   * reason: a prompt is the one managed value that becomes a model-visible
   * instruction, so an unknown key must be a refusal rather than an inert
   * field somebody assumed was being read (03-05 T-03-44).
   */
  | "canary-catalog"
  /**
   * Structured gate receipts under `.alpha-aos/receipts/gates/<obligation>.json`.
   * Enforces single-engine resolution, git commit binding, and status (GATE-02, D-06).
   */
  | "gate-receipt"
  /**
   * Directory-tree opt-out and policy registry under `~/.alpha-aos/trees.json` (OPTO-01, D-01).
   */
  | "tree-registry"
  /**
   * External package recovery receipts under `~/.alpha-aos/receipts/<id>.json` (LIFE-07, D-13).
   */
  | "recovery-receipt";

export type ManagedFormat = "json" | "yaml" | "toml";

export type DocumentStatus =
  | "current"
  | "migratable"
  | "unsupported-old"
  | "unknown-newer"
  | "invalid";

export interface ValidationIssue {
  /** Stable machine code. Callers branch on this, never on the message. */
  code: string;
  /** JSON-pointer-style location inside the document. */
  documentPath: string;
  expected: string;
  /**
   * A redacted description of what was found — type, length, key count.
   * The value itself never appears, because untrusted input may be a secret.
   */
  actualShape: string;
}

export interface ValidationResult<T = unknown> {
  ok: boolean;
  kind: ManagedDocumentKind;
  format: ManagedFormat;
  schemaVersion: number | null;
  status: DocumentStatus;
  /** Normalized core value. Null unless the document is current and valid. */
  value: T | null;
  /** Read-only parsed form for a migratable document. Null otherwise. */
  readOnlyValue: unknown;
  /** Unregistered namespaced extensions, preserved verbatim and inert. */
  extensions: Record<string, unknown>;
  /** Data contributed by registered adapters that passed their own schema. */
  typedExtensions: Record<string, unknown>;
  issues: ValidationIssue[];
  issuesTruncated: boolean;
}

export interface ManagedSchemaRoute {
  kind: ManagedDocumentKind;
  version: number;
  status: "current" | "migratable" | "unsupported-old";
  schema: Record<string, unknown>;
}

export interface MigrationPlan {
  kind: ManagedDocumentKind;
  fromVersion: number;
  toVersion: number;
  operations: ReadonlyArray<{ op: string; path: string; detail: string }>;
  sourceHash: string;
  targetHash: string;
}

const ISSUE_CAP = 50;
const MAX_ALIAS_COUNT = 100;

/** A namespaced extension key. Anything else at the core level is closed-world. */
const EXTENSION_NAMESPACE = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function shapeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(length=${value.length})`;
  switch (typeof value) {
    case "string":
      return `string(length=${value.length})`;
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "boolean":
      return "boolean";
    case "undefined":
      return "undefined";
    case "object":
      return `object(keys=${Object.keys(value as object).length})`;
    default:
      return typeof value;
  }
}

function issue(code: string, documentPath: string, expected: string, actualShape: string): ValidationIssue {
  return { code, documentPath, expected, actualShape };
}

/** Deterministic order and a hard cap, so a hostile document cannot flood output. */
function finalizeIssues(issues: ValidationIssue[]): { issues: ValidationIssue[]; truncated: boolean } {
  const sorted = [...issues].sort(
    (left, right) =>
      left.documentPath.localeCompare(right.documentPath) ||
      left.code.localeCompare(right.code) ||
      left.expected.localeCompare(right.expected),
  );
  if (sorted.length <= ISSUE_CAP) return { issues: sorted, truncated: false };
  return { issues: sorted.slice(0, ISSUE_CAP), truncated: true };
}

// ---------------------------------------------------------------------------
// Strict syntax layer
// ---------------------------------------------------------------------------

/**
 * Parses JSON while rejecting duplicate properties. `JSON.parse` silently keeps
 * the last value, which turns an ambiguous document into a confident one.
 */
function parseStrictJson(text: string): { value: unknown; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const parseErrors: ParseError[] = [];
  const pathStack: Array<Set<string>> = [];
  const keyPath: string[] = [];

  visit(
    text,
    {
      onObjectBegin() {
        pathStack.push(new Set<string>());
      },
      onObjectProperty(property) {
        const seen = pathStack.at(-1);
        if (seen === undefined) return;
        if (seen.has(property)) {
          issues.push(
            issue(
              "syntax.duplicate-key",
              `/${[...keyPath, property].join("/")}`,
              "each property to appear exactly once",
              `duplicate property(name-length=${property.length})`,
            ),
          );
        }
        seen.add(property);
        keyPath.push(property);
      },
      onObjectEnd() {
        pathStack.pop();
      },
      onLiteralValue() {
        keyPath.pop();
      },
      onError(error, offset) {
        parseErrors.push({ error, offset, length: 0 });
      },
    },
    { disallowComments: true, allowTrailingComma: false },
  );

  if (parseErrors.length > 0) {
    issues.push(issue("syntax.malformed", "/", "well-formed JSON", `parse errors(count=${parseErrors.length})`));
    return { value: null, issues };
  }

  let value: unknown = null;
  try {
    value = JSON.parse(text);
  } catch {
    issues.push(issue("syntax.malformed", "/", "well-formed JSON", "unparseable"));
    return { value: null, issues };
  }
  return { value, issues };
}

/**
 * Parses YAML as a single document with unique keys and a bounded alias budget.
 * Multi-document streams and alias expansion bombs are both ambiguity, not data.
 */
function parseStrictYaml(text: string): { value: unknown; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  let documents;
  try {
    documents = parseAllDocuments(text, { uniqueKeys: true });
  } catch {
    issues.push(issue("syntax.malformed", "/", "well-formed YAML", "unparseable"));
    return { value: null, issues };
  }

  if (documents.length === 0) {
    issues.push(issue("syntax.empty", "/", "exactly one YAML document", "document(count=0)"));
    return { value: null, issues };
  }
  if (documents.length > 1) {
    issues.push(
      issue("syntax.multiple-documents", "/", "exactly one YAML document", `document(count=${documents.length})`),
    );
    return { value: null, issues };
  }

  const document = documents[0];
  if (document === undefined) {
    issues.push(issue("syntax.empty", "/", "exactly one YAML document", "document(count=0)"));
    return { value: null, issues };
  }
  for (const error of document.errors) {
    const code = error.code === "DUPLICATE_KEY" ? "syntax.duplicate-key" : "syntax.malformed";
    issues.push(issue(code, "/", "unambiguous YAML", `yaml error(code=${error.code})`));
  }
  if (issues.length > 0) return { value: null, issues };

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  } catch {
    // The alias budget is enforced during materialization.
    issues.push(issue("syntax.alias-limit", "/", `at most ${MAX_ALIAS_COUNT} alias expansions`, "alias expansion refused"));
    return { value: null, issues };
  }
  return { value, issues };
}

/** Parses TOML with the audited parser, which rejects duplicate and colliding keys. */
function parseStrictToml(text: string): { value: unknown; issues: ValidationIssue[] } {
  try {
    return { value: parseToml(text), issues: [] };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    return {
      value: null,
      issues: [issue("syntax.malformed", "/", "unambiguous TOML", `toml error(name=${name})`)],
    };
  }
}

/**
 * Syntax-only stage. A caller that just needs to know whether bytes are
 * unambiguous stops here; nothing has been schema-checked yet.
 */
export function parseManagedDocument(options: {
  text: string;
  format: ManagedFormat;
}): { ok: boolean; value: unknown; issues: ValidationIssue[]; issuesTruncated: boolean } {
  const parsed =
    options.format === "json"
      ? parseStrictJson(options.text)
      : options.format === "yaml"
        ? parseStrictYaml(options.text)
        : parseStrictToml(options.text);

  const finalized = finalizeIssues(parsed.issues);
  return {
    ok: finalized.issues.length === 0,
    value: finalized.issues.length === 0 ? parsed.value : null,
    issues: finalized.issues,
    issuesTruncated: finalized.truncated,
  };
}

// ---------------------------------------------------------------------------
// Schema routes
// ---------------------------------------------------------------------------

function coreObject(required: string[], properties: Record<string, unknown>): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required,
    properties,
    // Closed world: the core is exhaustively described. Namespaced extensions
    // are split out before validation, so they never reach this check.
    additionalProperties: false,
  };
}

const anyObject = { type: "object" } as const;

/**
 * The subtree alpha-AOS owns and validates strictly. `null` means the whole
 * document; a key means only that branch, leaving the rest to its real owner.
 */
const OWNED_SUBTREE: Record<ManagedDocumentKind, string | null> = {
  catalog: null,
  lock: null,
  "project-manifest": null,
  journal: null,
  "install-state": null,
  "writer-lock": null,
  evidence: null,
  receipt: null,
  "native-config": "alphaAos",
  "pack-catalog": null,
  "fact-vocabulary": null,
  "approved-plan": null,
  // alpha-AOS owns the whole document: nothing else writes into the ledger,
  // so there is no foreign subtree to leave alone.
  "capability-ledger": null,
  "canary-catalog": null,
  "gate-receipt": null,
  "tree-registry": null,
  "recovery-receipt": null,
};

const CURRENT_VERSION = 1;
const MIGRATABLE_VERSION = 0;

const CORE_SCHEMAS: Record<ManagedDocumentKind, Record<string, unknown>> = {
  catalog: coreObject(["schemaVersion", "name", "harnesses", "components", "policy"], {
    schemaVersion: { type: "integer" },
    name: { const: "alpha-aos" },
    defaultChannel: { enum: ["stable", "candidate", "pinned"] },
    harnesses: anyObject,
    components: anyObject,
    policy: anyObject,
  }),
  lock: coreObject(["schemaVersion", "components"], {
    schemaVersion: { type: "integer" },
    channel: { enum: ["stable", "candidate", "pinned"] },
    components: anyObject,
  }),
  // IN-05: this entry is closed-world, so every field the external
  // `schemas/project-stack.schema.json` gains must be mirrored here or a caller
  // that validates a manifest WITHOUT passing the external schema rejects a
  // valid document. `inspectProjectManifest` always passes it, which is exactly
  // why the divergence was a latent trap rather than a live failure.
  "project-manifest": coreObject(["schemaVersion"], {
    schemaVersion: { type: "integer" },
    trusted: { type: "boolean" },
    packs: { type: "array", items: { type: "string" } },
    criticalUserFlows: { type: "array", items: { type: "string" } },
    scientificResearch: { type: "boolean" },
    packOverrides: { type: "object", additionalProperties: { enum: ["force-on", "force-off"] } },
    securityReview: { type: "boolean" },
    isolation: anyObject,
  }),
  journal: coreObject(["schemaVersion", "id", "createdAt", "status", "allowedRoots", "files"], {
    schemaVersion: { type: "integer" },
    id: { type: "string" },
    createdAt: { type: "string" },
    status: { enum: ["applying", "applied", "rolled-back", "failed", "repaired"] },
    allowedRoots: { type: "array", items: { type: "string" } },
    files: { type: "array" },
  }),
  "install-state": coreObject(["schemaVersion", "components"], {
    schemaVersion: { type: "integer" },
    components: anyObject,
  }),
  "writer-lock": coreObject(["schemaVersion", "operationId", "pid", "startedAt", "host"], {
    schemaVersion: { type: "integer" },
    operationId: { type: "string" },
    pid: { type: "integer" },
    startedAt: { type: "string" },
    host: { type: "string" },
  }),
  evidence: coreObject(["schemaVersion", "projectId", "facts"], {
    schemaVersion: { type: "integer" },
    projectId: { type: "string" },
    facts: { type: "array" },
  }),
  receipt: coreObject(["schemaVersion", "packId", "sourceHash", "targets"], {
    schemaVersion: { type: "integer" },
    packId: { type: "string" },
    sourceHash: { type: "string" },
    targets: { type: "array" },
  }),
  "native-config": coreObject(["alphaAos"], {
    alphaAos: {
      type: "object",
      required: ["schemaVersion", "managed"],
      properties: { schemaVersion: { type: "integer" }, managed: anyObject },
      additionalProperties: false,
    },
  }),
  "pack-catalog": coreObject(["schemaVersion", "packs"], {
    schemaVersion: { type: "integer" },
    packs: { type: "array" },
  }),
  "fact-vocabulary": coreObject(["schemaVersion", "facts"], {
    schemaVersion: { type: "integer" },
    facts: { type: "array" },
  }),
  // The built-in envelope check only. `schemas/approved-plan.schema.json` is
  // the closed contract for the artifact's interior, and every supported route
  // passes it — the same arrangement `receipt` already uses.
  "approved-plan": coreObject(["schemaVersion", "kind", "approvedDigest", "plan"], {
    schemaVersion: { type: "integer" },
    kind: { type: "string" },
    approvedDigest: { type: "string" },
    gitContext: anyObject,
    plan: anyObject,
  }),
  // The built-in envelope check only, exactly as `receipt` and `approved-plan`
  // do it: `schemas/capability-ledger.schema.json` is the closed contract for
  // the interior — the narrowed harness enum, the three axes, the bound inputs
  // and the no-value `blockedReason` shape all live there, and every supported
  // route passes it.
  "capability-ledger": coreObject(["schemaVersion", "producer", "proofs"], {
    schemaVersion: { type: "integer" },
    producer: anyObject,
    updatedAt: { type: "string" },
    proofs: { type: "array" },
  }),
  // The built-in envelope check only, exactly as `pack-catalog` does it:
  // `schemas/canary-catalog.schema.json` is the closed contract for the
  // interior — the never-name rule on `prompt`, the narrowed capability and
  // harness enums, and the credential-NAMES-only requirement list all live
  // there, and every supported route passes it.
  "canary-catalog": coreObject(["schemaVersion", "canaries"], {
    schemaVersion: { type: "integer" },
    canaries: { type: "array" },
  }),
  "gate-receipt": coreObject(
    [
      "schemaVersion",
      "obligation",
      "status",
      "engine",
      "targetCommitSha",
      "workingTreeDigest",
      "exitCode",
      "executedAt",
      "suppressedEngines",
      "evidenceHash",
    ],
    {
      schemaVersion: { type: "integer" },
      obligation: { enum: ["security-review", "database-migration", "release-check"] },
      status: { enum: ["passed", "failed"] },
      engine: anyObject,
      targetCommitSha: { type: "string" },
      workingTreeDigest: { type: "string" },
      exitCode: { type: "integer" },
      executedAt: { type: "string" },
      suppressedEngines: { type: "array" },
      evidenceHash: { type: "string" },
      diagnostics: { type: "string" },
    },
  ),
  "tree-registry": coreObject(["schemaVersion", "updatedAt", "trees"], {
    schemaVersion: { type: "integer" },
    updatedAt: { type: "string" },
    trees: { type: "array" },
  }),
  "recovery-receipt": coreObject(["schemaVersion", "operationId", "createdAt", "entries"], {
    schemaVersion: { type: "integer" },
    operationId: { type: "string" },
    createdAt: { type: "string" },
    entries: { type: "array" },
  }),
};

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  // Validation must never rewrite the input it is judging.
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

const compiled = new Map<string, ValidateFunction>();
const externalValidators = new WeakMap<Record<string, unknown>, ValidateFunction>();
// Ajv refuses to compile two schemas sharing a $id, and a caller that re-reads
// schemas/*.json produces a fresh object each time, so identity alone is not a
// sufficient cache key.
const validatorsById = new Map<string, ValidateFunction>();

function validatorFor(kind: ManagedDocumentKind, schema?: Record<string, unknown>): ValidateFunction {
  if (schema !== undefined) {
    const cached = externalValidators.get(schema);
    if (cached !== undefined) return cached;

    // A schema carrying a $id is cached by that id, so re-reading the same
    // repository contract reuses the compiled validator instead of colliding.
    const id = typeof schema.$id === "string" ? schema.$id : null;
    const byId = id === null ? undefined : validatorsById.get(id);
    if (byId !== undefined) {
      externalValidators.set(schema, byId);
      return byId;
    }

    const external = ajv.compile(schema);
    externalValidators.set(schema, external);
    if (id !== null) validatorsById.set(id, external);
    return external;
  }
  const existing = compiled.get(kind);
  if (existing !== undefined) return existing;
  const validate = ajv.compile(CORE_SCHEMAS[kind]);
  compiled.set(kind, validate);
  return validate;
}

export function schemaRoutesFor(kind: ManagedDocumentKind): readonly ManagedSchemaRoute[] {
  return [
    { kind, version: MIGRATABLE_VERSION, status: "migratable", schema: CORE_SCHEMAS[kind] },
    { kind, version: CURRENT_VERSION, status: "current", schema: CORE_SCHEMAS[kind] },
  ];
}

// ---------------------------------------------------------------------------
// Extension registry
// ---------------------------------------------------------------------------

interface ExtensionAdapter {
  namespace: string;
  validate: ValidateFunction;
  normalize: (value: unknown) => unknown;
}

const adapters = new Map<string, ExtensionAdapter>();

/**
 * Registers a namespace that may contribute typed data. Without a registration
 * an extension is preserved for display and round-trip but contributes nothing
 * to planning or apply.
 */
export function registerExtensionAdapter(options: {
  namespace: string;
  schema: Record<string, unknown>;
  normalize?: (value: unknown) => unknown;
}): void {
  if (!EXTENSION_NAMESPACE.test(options.namespace)) {
    throw new Error(`Extension namespace is malformed: ${options.namespace}`);
  }
  adapters.set(options.namespace, {
    namespace: options.namespace,
    validate: ajv.compile(options.schema),
    normalize: options.normalize ?? ((value) => value),
  });
}

/** Exposed so tests and diagnostics can reset or inspect registrations. */
export function clearExtensionAdapters(): void {
  adapters.clear();
}

function splitExtensions(value: Record<string, unknown>): {
  core: Record<string, unknown>;
  extensions: Record<string, unknown>;
} {
  const core: Record<string, unknown> = {};
  const extensions: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    // Only a well-formed namespace is an extension. `x-`, `x` and `X-VENDOR `
    // are malformed, stay in core, and fail the closed-world check there.
    if (EXTENSION_NAMESPACE.test(key)) extensions[key] = entry;
    else core[key] = entry;
  }
  return { core, extensions };
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

function ajvIssues(errors: readonly ErrorObject[] | null | undefined, value: unknown): ValidationIssue[] {
  if (!errors) return [];
  return errors.map((error) => {
    const path = error.instancePath === "" ? "/" : error.instancePath;
    const code =
      error.keyword === "additionalProperties"
        ? "schema.unknown-core-field"
        : error.keyword === "required"
          ? "schema.missing-field"
          : `schema.${error.keyword}`;
    const detail =
      error.keyword === "additionalProperties"
        ? String((error.params as { additionalProperty?: string }).additionalProperty ?? "")
        : "";
    return issue(
      code,
      detail === "" ? path : `${path === "/" ? "" : path}/${detail}`,
      error.message ?? error.keyword,
      shapeOf(value),
    );
  });
}

/**
 * The one pipeline every managed document travels: strict syntax, then exact
 * version routing, then closed-world schema, then an optional domain check.
 * Nothing is coerced, defaulted or stripped along the way — the input is
 * judged, not repaired.
 */
export function validateManagedDocument<T = unknown>(options: {
  text: string;
  format: ManagedFormat;
  kind: ManagedDocumentKind;
  /**
   * The closed contract to validate against. Omit to use the engine's built-in
   * core schema; supply the repository's own schemas/*.json to make that file
   * the single source of truth for a kind.
   */
  schema?: Record<string, unknown>;
  domain?: (value: unknown) => ValidationIssue[];
}): ValidationResult<T> {
  const base = {
    kind: options.kind,
    format: options.format,
    value: null,
    readOnlyValue: null,
    extensions: {},
    typedExtensions: {},
  } as const;

  const parsed = parseManagedDocument({ text: options.text, format: options.format });
  if (!parsed.ok) {
    return {
      ...base,
      ok: false,
      schemaVersion: null,
      status: "invalid",
      issues: parsed.issues,
      issuesTruncated: parsed.issuesTruncated,
    };
  }

  const root = parsed.value;
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return {
      ...base,
      ok: false,
      schemaVersion: null,
      status: "invalid",
      issues: [issue("schema.not-an-object", "/", "an object at the document root", shapeOf(root))],
      issuesTruncated: false,
    };
  }

  const record = root as Record<string, unknown>;
  // alpha-AOS owns a nested subtree in native configuration, so extensions are
  // split at the root this tool actually governs rather than at the document
  // root, which belongs to the harness.
  const ownedPointer = OWNED_SUBTREE[options.kind];
  const owned = ownedPointer === null ? record : (record[ownedPointer] as Record<string, unknown> | undefined);
  if (ownedPointer !== null && (typeof owned !== "object" || owned === null || Array.isArray(owned))) {
    return {
      ...base,
      ok: false,
      schemaVersion: null,
      status: "invalid",
      issues: [issue("schema.missing-field", `/${ownedPointer}`, "the alpha-AOS-owned subtree", shapeOf(owned))],
      issuesTruncated: false,
    };
  }
  const split = splitExtensions(owned as Record<string, unknown>);
  const extensions = split.extensions;
  const core: Record<string, unknown> =
    ownedPointer === null ? split.core : { ...record, [ownedPointer]: split.core };

  // Version routing happens before schema evaluation: a document from an
  // unknown future version must not be judged against today's rules.
  const rawVersion = split.core.schemaVersion;
  if (typeof rawVersion !== "number" || !Number.isInteger(rawVersion)) {
    return {
      ...base,
      ok: false,
      schemaVersion: null,
      status: "invalid",
      extensions,
      issues: [issue("version.missing", "/schemaVersion", "an integer schema version", shapeOf(rawVersion))],
      issuesTruncated: false,
    };
  }

  const route = schemaRoutesFor(options.kind).find((candidate) => candidate.version === rawVersion);
  if (route === undefined) {
    const newer = rawVersion > CURRENT_VERSION;
    return {
      ...base,
      ok: false,
      schemaVersion: rawVersion,
      status: newer ? "unknown-newer" : "unsupported-old",
      extensions,
      issues: [
        issue(
          newer ? "version.unknown-newer" : "version.unsupported-old",
          "/schemaVersion",
          `a registered schema version (${MIGRATABLE_VERSION}..${CURRENT_VERSION})`,
          `integer(value=${rawVersion})`,
        ),
      ],
      issuesTruncated: false,
    };
  }

  const validate = validatorFor(options.kind, options.schema);
  const schemaOk = validate(core);
  const issues: ValidationIssue[] = schemaOk ? [] : ajvIssues(validate.errors, core);

  if (issues.length === 0 && options.domain !== undefined && route.status === "current") {
    issues.push(...options.domain(core));
  }

  const finalized = finalizeIssues(issues);
  if (finalized.issues.length > 0) {
    return {
      ...base,
      ok: false,
      schemaVersion: rawVersion,
      status: "invalid",
      extensions,
      issues: finalized.issues,
      issuesTruncated: finalized.truncated,
    };
  }

  // Registered adapters contribute typed data; unregistered namespaces stay in
  // `extensions` and are excluded from the normalized core value.
  const typedExtensions: Record<string, unknown> = {};
  for (const [namespace, entry] of Object.entries(extensions)) {
    const adapter = adapters.get(namespace);
    if (adapter === undefined) continue;
    if (!adapter.validate(entry)) continue;
    typedExtensions[namespace] = adapter.normalize(entry);
  }

  const migratable = route.status === "migratable";
  return {
    kind: options.kind,
    format: options.format,
    ok: true,
    schemaVersion: rawVersion,
    status: migratable ? "migratable" : "current",
    // A migratable document is never implicitly converted into a current typed
    // value; the caller must run a migration plan first.
    value: migratable ? null : (core as T),
    readOnlyValue: migratable ? split.core : null,
    extensions,
    typedExtensions,
    issues: [],
    issuesTruncated: false,
  };
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "null", "utf8").digest("hex");
}

/**
 * Describes, without performing, the change that would bring a migratable
 * document to the current version. Deterministic for identical input.
 */
export function createMigrationPlan(result: ValidationResult): MigrationPlan | null {
  if (result.status !== "migratable" || result.readOnlyValue === null) return null;
  const source = result.readOnlyValue as Record<string, unknown>;
  const target = { ...source, schemaVersion: CURRENT_VERSION };
  return {
    kind: result.kind,
    fromVersion: result.schemaVersion ?? MIGRATABLE_VERSION,
    toVersion: CURRENT_VERSION,
    operations: [
      {
        op: "replace",
        path: "/schemaVersion",
        detail: `${result.schemaVersion ?? MIGRATABLE_VERSION} -> ${CURRENT_VERSION}`,
      },
    ],
    sourceHash: stableHash(source),
    targetHash: stableHash(target),
  };
}

/**
 * Validates one value against a schema and returns bounded, sorted issues
 * rooted at `basePath`. Used where alpha-AOS owns a subtree of a document it
 * does not own as a whole — a native harness configuration, for example.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>,
  basePath = "",
): ValidationIssue[] {
  const validate = validatorFor("native-config", schema);
  if (validate(value)) return [];
  const issues = ajvIssues(validate.errors, value).map((entry) => ({
    ...entry,
    documentPath: entry.documentPath === "/" ? (basePath === "" ? "/" : basePath) : `${basePath}${entry.documentPath}`,
  }));
  return finalizeIssues(issues).issues;
}

/**
 * Patterns a credential leaves behind in a string. This is deliberately
 * narrower than the redactor's rule set in `redaction.ts`: an envelope's
 * fields are closed, so the question is only whether an allowed string field
 * carries a secret it should never have been given.
 */
const RAW_CREDENTIAL_PATTERNS: ReadonlyArray<{ readonly kind: string; readonly pattern: RegExp }> = [
  { kind: "pem", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/u },
  { kind: "api-key", pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{12,}|gh[pousr]_[A-Za-z0-9]{16,})\b/u },
  { kind: "url-userinfo", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/iu },
];

/**
 * Domain check for records that describe a repository rather than hold
 * secrets. An evidence or receipt envelope that carries a raw credential is
 * refused rather than stored and later echoed.
 */
export function rejectRawCredentials(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  function walk(current: unknown, path: string, depth: number): void {
    if (depth > 12 || issues.length >= ISSUE_CAP) return;
    if (typeof current === "string") {
      for (const rule of RAW_CREDENTIAL_PATTERNS) {
        if (!rule.pattern.test(current)) continue;
        issues.push(
          issue(
            "domain.raw-credential",
            path === "" ? "/" : path,
            "a record that describes a repository, not one that carries a credential",
            `string(length=${current.length}, looks-like=${rule.kind})`,
          ),
        );
        return;
      }
      return;
    }
    if (Array.isArray(current)) {
      for (const [index, entry] of current.entries()) walk(entry, `${path}/${index}`, depth + 1);
      return;
    }
    if (typeof current === "object" && current !== null) {
      for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
        walk(entry, `${path}/${key}`, depth + 1);
      }
    }
  }

  walk(value, "", 0);
  return finalizeIssues(issues).issues;
}
