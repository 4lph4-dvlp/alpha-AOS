import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RootReason } from "./evidence.js";
import { resolveCanonicalRoot } from "./evidence.js";
import { reviewedDigest } from "./component-session.js";
import {
  canonicalizeWithMissingTail,
  provePathBoundary,
  recheckPathProof,
} from "./path-boundary.js";
import { findPackageRoot } from "./paths.js";
import { loadTreeRegistry, resolveEffectivePolicy } from "./tree-policy.js";
import { parseManagedDocument, validateAgainstSchema } from "./validation.js";

export type ProjectBehaviorMode = "strict" | "flexible";
export type ProjectBehaviorSource = "project-policy" | "builtin-default";

export interface ProjectBehaviorInput {
  readonly invocationPath?: string | undefined;
  readonly projectRoot?: string | undefined;
  readonly boundProjectRoot?: string | undefined;
  readonly stateRoot?: string | undefined;
}

export interface ProjectBehaviorView {
  readonly canonicalRoot: string;
  readonly rootReason: RootReason;
  readonly projectId: string;
  readonly policyPath: string;
  readonly exists: boolean;
  readonly effectiveMode: ProjectBehaviorMode;
  readonly source: ProjectBehaviorSource;
  readonly revision: string;
}

export interface ProjectModePlan {
  readonly canonicalRoot: string;
  readonly rootReason: RootReason;
  readonly projectId: string;
  readonly rootIdentity: {
    readonly deviceExact: string;
    readonly inodeExact: string;
  };
  readonly policyPath: string;
  readonly coordinatorPath: string;
  readonly currentExists: boolean;
  readonly currentMode: ProjectBehaviorMode;
  readonly currentSource: ProjectBehaviorSource;
  readonly currentRevision: string;
  readonly requestedMode: ProjectBehaviorMode;
  readonly change: "create" | "replace" | "current";
  readonly planDigest: string;
}

export type BehaviorPolicyErrorCode =
  | "invalid-root"
  | "unreadable-root"
  | "not-a-directory"
  | "bound-root-mismatch"
  | "tree-off"
  | "invalid-policy-path"
  | "path-escape"
  | "unreadable-policy"
  | "invalid-policy"
  | "unsupported-schema"
  | "invalid-json";

export class BehaviorPolicyError extends Error {
  readonly code: BehaviorPolicyErrorCode;
  readonly path: string | null;
  readonly cause: string;
  readonly causeCategory: string;
  readonly remediation: string;

  constructor(options: {
    code: BehaviorPolicyErrorCode;
    path: string | null;
    cause: string;
    causeCategory: string;
    remediation: string;
    message?: string;
  }) {
    super(options.message ?? `Project behavior policy error (${options.code}): ${options.cause}. ${options.remediation}`);
    this.name = "BehaviorPolicyError";
    this.code = options.code;
    this.path = options.path;
    this.cause = options.cause;
    this.causeCategory = options.causeCategory;
    this.remediation = options.remediation;
  }
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
let cachedSchema: Record<string, unknown> | null = null;

async function getBehaviorPolicySchema(): Promise<Record<string, unknown>> {
  if (cachedSchema !== null) return cachedSchema;
  const pkgRoot = findPackageRoot(moduleDirectory) ?? findPackageRoot(process.cwd());
  if (pkgRoot !== null) {
    const schemaPath = join(pkgRoot, "schemas", "behavior-policy.schema.json");
    if (existsSync(schemaPath)) {
      try {
        const text = await readFile(schemaPath, "utf8");
        cachedSchema = JSON.parse(text) as Record<string, unknown>;
        return cachedSchema;
      } catch {
        // Fall back to built-in schema
      }
    }
  }
  cachedSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://alpha-aos.local/schemas/behavior-policy.schema.json",
    type: "object",
    required: ["schemaVersion", "mode"],
    additionalProperties: false,
    properties: {
      schemaVersion: { type: "integer", const: 1 },
      mode: { type: "string", enum: ["strict", "flexible"] },
    },
  };
  return cachedSchema;
}

/**
 * Resolves the effective behavior policy for a canonical project.
 * Implements D-01 through D-08, D-13, D-15, and D-16.
 */
export async function resolveProjectBehavior(
  input: ProjectBehaviorInput,
): Promise<ProjectBehaviorView> {
  const rawInvocation = input.invocationPath ?? process.cwd();
  const invocationResolution = await canonicalizeWithMissingTail(resolve(rawInvocation));
  if (invocationResolution.reason !== null) {
    throw new BehaviorPolicyError({
      code: "invalid-root",
      path: rawInvocation,
      cause: "invocation path could not be resolved canonically",
      causeCategory: "unprovable-path",
      remediation: "Run from an accessible directory or provide an explicit project path.",
    });
  }
  const invocationPath = invocationResolution.canonical;

  const registry = await loadTreeRegistry(input.stateRoot);

  // Check tree policy for invocation location
  const invocationTree = await resolveEffectivePolicy(invocationPath, registry.trees);
  if (invocationTree.effectiveMode === "off") {
    throw new BehaviorPolicyError({
      code: "tree-off",
      path: invocationPath,
      cause: "invocation directory is isolated by tree policy (off)",
      causeCategory: "tree-off",
      remediation: "Tree policy isolates this directory from alpha-AOS. Reconfigure tree policy if alpha-AOS management is desired.",
    });
  }

  // Resolve canonical root through standard single ladder
  let canonical;
  try {
    canonical = await resolveCanonicalRoot(invocationPath, input.projectRoot);
  } catch (err: unknown) {
    throw new BehaviorPolicyError({
      code: "invalid-root",
      path: input.projectRoot ?? invocationPath,
      cause: "project root could not be canonically resolved",
      causeCategory: "unresolvable-root",
      remediation: "Provide a valid, accessible directory path.",
    });
  }

  // Ensure root exists and is a readable directory
  let rootStat;
  try {
    rootStat = await stat(canonical.root);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new BehaviorPolicyError({
      code: code === "ENOENT" ? "invalid-root" : "unreadable-root",
      path: canonical.root,
      cause: code === "ENOENT" ? "project root directory does not exist" : "project root directory is not accessible",
      causeCategory: code === "ENOENT" ? "root-not-found" : "root-unreadable",
      remediation: "Ensure the project root directory exists and has readable permissions.",
    });
  }

  if (!rootStat.isDirectory()) {
    throw new BehaviorPolicyError({
      code: "not-a-directory",
      path: canonical.root,
      cause: "project root must be a directory",
      causeCategory: "root-not-a-directory",
      remediation: "Specify a directory rather than a file as project root.",
    });
  }

  // Check tree policy for canonical root
  const rootTree = await resolveEffectivePolicy(canonical.root, registry.trees);
  if (rootTree.effectiveMode === "off") {
    throw new BehaviorPolicyError({
      code: "tree-off",
      path: canonical.root,
      cause: "project root directory is isolated by tree policy (off)",
      causeCategory: "tree-off",
      remediation: "Tree policy isolates this project from alpha-AOS. Reconfigure tree policy if alpha-AOS management is desired.",
    });
  }

  // Check bound task root if supplied
  if (input.boundProjectRoot !== undefined) {
    let boundCanonicalRoot: string;
    try {
      const boundResolved = await resolveCanonicalRoot(invocationPath, input.boundProjectRoot);
      boundCanonicalRoot = boundResolved.root;
    } catch {
      boundCanonicalRoot = resolve(input.boundProjectRoot);
    }
    if (boundCanonicalRoot !== canonical.root) {
      throw new BehaviorPolicyError({
        code: "bound-root-mismatch",
        path: canonical.root,
        cause: "resolved project root does not match task-bound project root",
        causeCategory: "bound-root-mismatch",
        remediation: "Execute the task in the bound project root or update the task contract projectRoot.",
      });
    }
  }

  const policyPath = join(canonical.root, ".alpha-aos", "behavior.json");

  // Prove path containment within canonical root
  const proof = await provePathBoundary({
    role: "target",
    path: policyPath,
    allowedRoots: [canonical.root],
  });
  if (!proof.proven) {
    throw new BehaviorPolicyError({
      code: "path-escape",
      path: policyPath,
      cause: proof.detail ?? "policy path escapes canonical project root",
      causeCategory: "path-escape",
      remediation: "Ensure .alpha-aos/behavior.json is directly contained within the project directory without escaping links.",
    });
  }

  // Check .alpha-aos directory
  const alphaAosDir = join(canonical.root, ".alpha-aos");
  let alphaAosStat;
  try {
    alphaAosStat = await lstat(alphaAosDir);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Intact ancestor chain, .alpha-aos absent -> builtin-default strict
      return {
        canonicalRoot: canonical.root,
        rootReason: canonical.reason,
        projectId: canonical.projectId,
        policyPath,
        exists: false,
        effectiveMode: "strict",
        source: "builtin-default",
        revision: "missing",
      };
    }
    throw new BehaviorPolicyError({
      code: "unreadable-policy",
      path: alphaAosDir,
      cause: "cannot access .alpha-aos directory",
      causeCategory: "parent-unreadable",
      remediation: "Ensure .alpha-aos directory is accessible.",
    });
  }

  if (!alphaAosStat.isDirectory()) {
    throw new BehaviorPolicyError({
      code: "not-a-directory",
      path: alphaAosDir,
      cause: ".alpha-aos is not a directory",
      causeCategory: "parent-not-a-directory",
      remediation: "Ensure .alpha-aos is a directory, not a regular file or link.",
    });
  }

  // Check behavior.json inside .alpha-aos
  let policyLstat;
  try {
    policyLstat = await lstat(policyPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Intact ancestor chain and .alpha-aos exists, behavior.json absent -> builtin-default strict
      return {
        canonicalRoot: canonical.root,
        rootReason: canonical.reason,
        projectId: canonical.projectId,
        policyPath,
        exists: false,
        effectiveMode: "strict",
        source: "builtin-default",
        revision: "missing",
      };
    }
    if (code === "ENOTDIR") {
      throw new BehaviorPolicyError({
        code: "not-a-directory",
        path: policyPath,
        cause: "a path component in policy path is not a directory",
        causeCategory: "not-a-directory",
        remediation: "Ensure .alpha-aos is a valid directory.",
      });
    }
    throw new BehaviorPolicyError({
      code: "unreadable-policy",
      path: policyPath,
      cause: "policy file is not accessible",
      causeCategory: "policy-unreadable",
      remediation: "Check permissions on .alpha-aos/behavior.json.",
    });
  }

  if (policyLstat.isSymbolicLink()) {
    let policyStat;
    try {
      policyStat = await stat(policyPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw new BehaviorPolicyError({
          code: "invalid-policy-path",
          path: policyPath,
          cause: "policy symlink is dangling",
          causeCategory: "dangling-link",
          remediation: "Remove the dangling symlink at .alpha-aos/behavior.json or restore its target.",
        });
      }
      throw new BehaviorPolicyError({
        code: "unreadable-policy",
        path: policyPath,
        cause: "policy symlink target could not be read",
        causeCategory: "symlink-unreadable",
        remediation: "Check permissions and target of .alpha-aos/behavior.json symlink.",
      });
    }

    const targetResolution = await canonicalizeWithMissingTail(policyPath);
    if (targetResolution.reason !== null || !targetResolution.canonical.startsWith(canonical.root)) {
      throw new BehaviorPolicyError({
        code: "path-escape",
        path: policyPath,
        cause: "policy symlink target escapes canonical project root",
        causeCategory: "path-escape",
        remediation: "Ensure .alpha-aos/behavior.json does not link outside the project root.",
      });
    }

    if (policyStat.isDirectory()) {
      throw new BehaviorPolicyError({
        code: "invalid-policy-path",
        path: policyPath,
        cause: "policy path is a directory",
        causeCategory: "policy-is-directory",
        remediation: "Ensure .alpha-aos/behavior.json is a regular file, not a directory.",
      });
    }
  } else if (policyLstat.isDirectory()) {
    throw new BehaviorPolicyError({
      code: "invalid-policy-path",
      path: policyPath,
      cause: "policy path is a directory",
      causeCategory: "policy-is-directory",
      remediation: "Ensure .alpha-aos/behavior.json is a regular file, not a directory.",
    });
  }

  // Recheck proof before reading
  const proofBefore = await recheckPathProof(proof);
  if (!proofBefore.ok) {
    throw new BehaviorPolicyError({
      code: "path-escape",
      path: policyPath,
      cause: proofBefore.detail ?? "path proof recheck failed before reading policy",
      causeCategory: "recheck-failed",
      remediation: "Ensure project root and .alpha-aos directory structure have not been altered.",
    });
  }

  let rawBytes: string;
  try {
    rawBytes = await readFile(policyPath, "utf8");
  } catch (err: unknown) {
    throw new BehaviorPolicyError({
      code: "unreadable-policy",
      path: policyPath,
      cause: "policy file could not be read",
      causeCategory: "read-failed",
      remediation: "Check file permissions on .alpha-aos/behavior.json.",
    });
  }

  // Recheck proof after reading
  const proofAfter = await recheckPathProof(proof);
  if (!proofAfter.ok) {
    throw new BehaviorPolicyError({
      code: "path-escape",
      path: policyPath,
      cause: proofAfter.detail ?? "path proof recheck failed after reading policy",
      causeCategory: "recheck-failed",
      remediation: "Ensure project root and .alpha-aos directory structure remained intact during read.",
    });
  }

  // Strict JSON parse
  const parseResult = parseManagedDocument({ text: rawBytes, format: "json" });
  if (!parseResult.ok) {
    const isDuplicate = parseResult.issues.some((issue) => issue.code === "syntax.duplicate-key");
    throw new BehaviorPolicyError({
      code: isDuplicate ? "invalid-policy" : "invalid-json",
      path: policyPath,
      cause: isDuplicate ? "policy file contains duplicate JSON key" : "policy file is not valid JSON",
      causeCategory: isDuplicate ? "duplicate-key" : "invalid-json",
      remediation: isDuplicate
        ? "Ensure every key in .alpha-aos/behavior.json appears exactly once."
        : "Ensure .alpha-aos/behavior.json contains valid JSON.",
    });
  }

  const value = parseResult.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BehaviorPolicyError({
      code: "invalid-policy",
      path: policyPath,
      cause: "policy document must be a JSON object",
      causeCategory: "invalid-shape",
      remediation: "Ensure .alpha-aos/behavior.json contains a top-level JSON object.",
    });
  }

  // Closed schema validation
  const schema = await getBehaviorPolicySchema();
  const schemaIssues = validateAgainstSchema(value, schema);
  if (schemaIssues.length > 0) {
    const rec = value as Record<string, unknown>;
    let cause = "policy file does not adhere to schema";
    let causeCategory = "schema-validation";
    let code: BehaviorPolicyErrorCode = "invalid-policy";

    if (!("schemaVersion" in rec) || rec.schemaVersion !== 1) {
      cause = "policy file schemaVersion must be 1";
      causeCategory = "unsupported-version";
      code = "unsupported-schema";
    } else if (!("mode" in rec)) {
      cause = "policy file missing required property 'mode'";
      causeCategory = "missing-field";
    } else if (rec.mode !== "strict" && rec.mode !== "flexible") {
      cause = "policy file mode must be 'strict' or 'flexible'";
      causeCategory = "invalid-mode";
    } else {
      cause = "policy file contains unsupported property";
      causeCategory = "unsupported-field";
    }

    throw new BehaviorPolicyError({
      code,
      path: policyPath,
      cause,
      causeCategory,
      remediation: "Ensure .alpha-aos/behavior.json contains exactly schemaVersion 1 and mode ('strict' or 'flexible').",
    });
  }

  const validPolicy = value as { schemaVersion: 1; mode: ProjectBehaviorMode };
  const revision = createHash("sha256").update(rawBytes, "utf8").digest("hex");

  return {
    canonicalRoot: canonical.root,
    rootReason: canonical.reason,
    projectId: canonical.projectId,
    policyPath,
    exists: true,
    effectiveMode: validPolicy.mode,
    source: "project-policy",
    revision,
  };
}

/**
 * Plans a project behavior mode transition without mutating any filesystem state.
 * Implements D-03, D-08, D-09, D-15, D-17, and D-19.
 */
export async function planProjectModeChange(
  input: ProjectBehaviorInput,
  requestedMode: ProjectBehaviorMode,
): Promise<ProjectModePlan> {
  const currentView = await resolveProjectBehavior(input);

  // Re-prove canonical root to extract exact root component identity
  const rootProof = await provePathBoundary({
    role: "target",
    path: currentView.canonicalRoot,
    allowedRoots: [currentView.canonicalRoot],
  });
  const rootComponent = rootProof.components.at(-1);
  if (!rootComponent || rootComponent.deviceExact === undefined || rootComponent.inodeExact === undefined) {
    throw new BehaviorPolicyError({
      code: "invalid-root",
      path: currentView.canonicalRoot,
      cause: "filesystem root exact identity is not available",
      causeCategory: "unprovable-identity",
      remediation: "Run on a filesystem supporting exact device and inode identification.",
    });
  }
  const rootIdentity = {
    deviceExact: rootComponent.deviceExact,
    inodeExact: rootComponent.inodeExact,
  };

  const coordinatorPath = join(currentView.canonicalRoot, ".alpha-aos-behavior.lock");
  const coordinatorProof = await provePathBoundary({
    role: "target",
    path: coordinatorPath,
    allowedRoots: [currentView.canonicalRoot],
  });
  if (!coordinatorProof.proven) {
    throw new BehaviorPolicyError({
      code: "path-escape",
      path: coordinatorPath,
      cause: coordinatorProof.detail ?? "coordinator path escapes canonical project root",
      causeCategory: "path-escape",
      remediation: "Ensure the project root allows lock containment.",
    });
  }

  let change: "create" | "replace" | "current";
  if (!currentView.exists) {
    change = "create";
  } else if (currentView.effectiveMode === requestedMode) {
    change = "current";
  } else {
    change = "replace";
  }

  const planDigest = reviewedDigest("project-mode-plan-v1", {
    canonicalRoot: currentView.canonicalRoot,
    rootIdentity,
    policyPath: currentView.policyPath,
    coordinatorPath,
    currentRevision: currentView.revision,
    requestedMode,
    change,
  });

  return {
    canonicalRoot: currentView.canonicalRoot,
    rootReason: currentView.rootReason,
    projectId: currentView.projectId,
    rootIdentity,
    policyPath: currentView.policyPath,
    coordinatorPath,
    currentExists: currentView.exists,
    currentMode: currentView.effectiveMode,
    currentSource: currentView.source,
    currentRevision: currentView.revision,
    requestedMode,
    change,
    planDigest,
  };
}
