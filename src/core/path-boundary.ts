import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Every path an operation may touch has a declared role. Proving only the
 * target root leaves state, journals, snapshots, temp files, install sources
 * and the package root unguarded, so the role is part of the proof.
 */
export type OperationPathRole =
  | "target"
  | "state"
  | "journal"
  | "snapshot"
  | "temp"
  | "source"
  | "package-root";

export type PathBoundaryCode =
  | "ok"
  | "outside-configured-root"
  | "outside-canonical-root"
  | "unknown-reparse"
  | "unprovable-filesystem"
  | "ancestor-changed"
  | "missing-role"
  | "unplanned-path";

export type ReparseKind = "none" | "symlink" | "junction" | "unknown";

export interface PathComponentIdentity {
  /** The component as configured, before any link resolution. */
  path: string;
  /** The component's own canonical location. */
  canonical: string;
  kind: "directory" | "file" | "symlink" | "other" | "missing";
  reparse: ReparseKind;
  /** POSIX device/inode. Null where the host does not expose usable identity. */
  device: number | null;
  inode: number | null;
}

export interface FilesystemCapability {
  supported: boolean;
  /** Why support could not be proven. Null when supported. */
  reason: string | null;
  componentIdentity: boolean;
  canonicalResolution: boolean;
}

export interface PathProof {
  role: OperationPathRole;
  configured: string;
  canonical: string;
  allowedRoot: string | null;
  components: readonly PathComponentIdentity[];
  capability: FilesystemCapability;
  code: PathBoundaryCode;
  proven: boolean;
  detail: string | null;
}

export interface OperationPathInput {
  role: OperationPathRole;
  path: string;
}

export interface OperationPathProofSet {
  readonly proofs: readonly PathProof[];
  readonly proven: boolean;
  readonly code: PathBoundaryCode;
  readonly detail: string | null;
  /** Proof for a role, or undefined when the role was not declared. */
  get(role: OperationPathRole): PathProof | undefined;
  /** True only for a path that was declared and proven up front. */
  includes(path: string): boolean;
}

export class PathBoundaryError extends Error {
  readonly code: PathBoundaryCode;
  readonly proof: PathProof | null;

  constructor(code: PathBoundaryCode, message: string, proof: PathProof | null = null) {
    super(message);
    this.name = "PathBoundaryError";
    this.code = code;
    this.proof = proof;
  }
}

const caseInsensitiveHost = process.platform === "win32" || process.platform === "darwin";

function comparable(value: string): string {
  return caseInsensitiveHost ? value.toLowerCase() : value;
}

/**
 * Segment-aware containment. A string prefix test would place `/srv/data-old`
 * inside `/srv/data`, which is a different directory.
 */
function withinRoot(root: string, candidate: string): boolean {
  const comparableRoot = comparable(root);
  const comparableCandidate = comparable(candidate);
  if (comparableCandidate === comparableRoot) return true;
  const boundary = comparableRoot.endsWith(sep) ? comparableRoot : `${comparableRoot}${sep}`;
  return comparableCandidate.startsWith(boundary);
}

/** Every ancestor of `target`, root first, followed by the target itself. */
function ancestorChain(target: string): string[] {
  const chain: string[] = [];
  let cursor = target;
  while (true) {
    chain.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return chain.reverse();
}

async function classifyComponent(path: string): Promise<PathComponentIdentity | { unknownReparse: true; path: string }> {
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { path, canonical: path, kind: "missing", reparse: "none", device: null, inode: null };
    }
    // A component that cannot be inspected cannot be proven.
    return { unknownReparse: true, path };
  }

  let reparse: ReparseKind = "none";
  let kind: PathComponentIdentity["kind"] = info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";

  if (info.isSymbolicLink()) {
    kind = "symlink";
    try {
      await readlink(path);
      // Node surfaces Windows junctions through the symlink API; both are
      // classified kinds, which is what "known link" means here.
      reparse = process.platform === "win32" ? "junction" : "symlink";
    } catch {
      // A reparse point Node cannot read is an unclassified kind. Guessing
      // would be exactly the unproven support this boundary must refuse.
      return { unknownReparse: true, path };
    }
  } else if (!info.isDirectory() && !info.isFile()) {
    // Sockets, FIFOs and unclassified Windows reparse tags land here.
    return { unknownReparse: true, path };
  }

  let canonical = path;
  try {
    canonical = await realpath(path);
  } catch {
    canonical = path;
  }

  return {
    path,
    canonical,
    kind,
    reparse,
    device: typeof info.dev === "number" ? info.dev : null,
    inode: typeof info.ino === "number" && info.ino !== 0 ? Number(info.ino) : null,
  };
}

function unsupported(role: OperationPathRole, configured: string, reason: string, code: PathBoundaryCode): PathProof {
  return {
    role,
    configured,
    canonical: configured,
    allowedRoot: null,
    components: [],
    capability: { supported: false, reason, componentIdentity: false, canonicalResolution: false },
    code,
    proven: false,
    detail: reason,
  };
}

/**
 * Proves that one path is inside an allowed root both as configured and after
 * canonical resolution, recording the identity of every component so the same
 * conclusion can be rechecked immediately before mutation.
 *
 * There is deliberately no override: a boundary that cannot be proven refuses.
 */
export async function provePathBoundary(options: {
  path: string;
  allowedRoots: readonly string[];
  role: OperationPathRole;
}): Promise<PathProof> {
  const { role } = options;
  if (!isAbsolute(options.path) && options.path.length === 0) {
    return unsupported(role, options.path, "path is empty", "unprovable-filesystem");
  }
  const configured = resolve(options.path);
  if (options.allowedRoots.length === 0) {
    return unsupported(role, configured, "no allowed root was declared", "outside-configured-root");
  }

  const roots = options.allowedRoots.map((root) => resolve(root));
  const configuredRoot = roots.find((root) => withinRoot(root, configured));
  if (configuredRoot === undefined) {
    return {
      ...unsupported(role, configured, "path is outside every allowed root as configured", "outside-configured-root"),
      capability: { supported: true, reason: null, componentIdentity: true, canonicalResolution: true },
    };
  }

  // Walk the chain so a link anywhere above the target is classified, not only
  // the final component.
  const components: PathComponentIdentity[] = [];
  for (const component of ancestorChain(configured)) {
    const classified = await classifyComponent(component);
    if ("unknownReparse" in classified) {
      return unsupported(
        role,
        configured,
        `component could not be classified: ${classified.path}`,
        "unknown-reparse",
      );
    }
    components.push(classified);
  }

  // Canonical form: realpath of the nearest existing ancestor plus the part
  // that does not exist yet. A not-yet-created file still has a provable home.
  const existing = [...components].reverse().find((component) => component.kind !== "missing");
  let canonical: string;
  if (existing === undefined) {
    // Nothing on the chain exists; fall back to the filesystem root's identity.
    canonical = configured;
  } else {
    const suffix = relative(existing.path, configured);
    canonical = suffix === "" ? existing.canonical : resolve(existing.canonical, suffix);
  }

  let canonicalRootSource: string;
  try {
    canonicalRootSource = await realpath(configuredRoot);
  } catch {
    canonicalRootSource = configuredRoot;
  }

  const capability: FilesystemCapability = {
    supported: true,
    reason: null,
    componentIdentity: components.every((component) => component.kind === "missing" || component.device !== null),
    canonicalResolution: true,
  };

  if (!withinRoot(canonicalRootSource, canonical)) {
    return {
      role,
      configured,
      canonical,
      allowedRoot: configuredRoot,
      components,
      capability,
      code: "outside-canonical-root",
      proven: false,
      detail: `configured path resolves to ${canonical}, which is outside ${canonicalRootSource}`,
    };
  }

  return {
    role,
    configured,
    canonical,
    allowedRoot: configuredRoot,
    components,
    capability,
    code: "ok",
    proven: true,
    detail: null,
  };
}

/**
 * Re-reads every recorded component immediately before a rename, removal or
 * external package step. A parent retargeted after preflight changes the
 * meaning of the path, and that must refuse before any byte moves.
 */
export async function recheckPathProof(proof: PathProof): Promise<{ ok: boolean; code: PathBoundaryCode; detail: string | null }> {
  if (!proof.proven) {
    return { ok: false, code: proof.code, detail: proof.detail ?? "proof was never established" };
  }

  for (const recorded of proof.components) {
    const current = await classifyComponent(recorded.path);
    if ("unknownReparse" in current) {
      return { ok: false, code: "unknown-reparse", detail: `component became unclassifiable: ${recorded.path}` };
    }
    if (current.kind !== recorded.kind || current.reparse !== recorded.reparse) {
      return { ok: false, code: "ancestor-changed", detail: `component kind changed: ${recorded.path}` };
    }
    if (current.canonical !== recorded.canonical) {
      return { ok: false, code: "ancestor-changed", detail: `component now resolves elsewhere: ${recorded.path}` };
    }
    if (recorded.device !== null && current.device !== null) {
      if (current.device !== recorded.device || current.inode !== recorded.inode) {
        return { ok: false, code: "ancestor-changed", detail: `component identity changed: ${recorded.path}` };
      }
    }
  }

  if (proof.allowedRoot !== null && !withinRoot(proof.allowedRoot, proof.canonical)) {
    return { ok: false, code: "outside-canonical-root", detail: "canonical endpoint left the allowed root" };
  }
  return { ok: true, code: "ok", detail: null };
}

/**
 * Proves every path an operation declared, up front and as one immutable set.
 * An apply step that discovers a new path cannot prove it after the fact —
 * `includes` returns false and the caller must refuse.
 */
export async function proveOperationPaths(options: {
  inputs: readonly OperationPathInput[];
  allowedRoots: readonly string[];
  requiredRoles: readonly OperationPathRole[];
}): Promise<OperationPathProofSet> {
  const proofs: PathProof[] = [];
  for (const input of options.inputs) {
    proofs.push(await provePathBoundary({ path: input.path, allowedRoots: options.allowedRoots, role: input.role }));
  }

  const declaredRoles = new Set(proofs.map((proof) => proof.role));
  const missing = options.requiredRoles.filter((role) => !declaredRoles.has(role));

  let code: PathBoundaryCode = "ok";
  let detail: string | null = null;
  if (missing.length > 0) {
    code = "missing-role";
    detail = `operation did not declare required path roles: ${missing.join(", ")}`;
  } else {
    const failed = proofs.find((proof) => !proof.proven);
    if (failed !== undefined) {
      code = failed.code;
      detail = failed.detail;
    }
  }

  const canonicalIndex = new Set(proofs.filter((proof) => proof.proven).map((proof) => comparable(proof.configured)));
  const frozen = Object.freeze([...proofs]);

  return Object.freeze({
    proofs: frozen,
    proven: code === "ok",
    code,
    detail,
    get(role: OperationPathRole): PathProof | undefined {
      return frozen.find((proof) => proof.role === role);
    },
    includes(path: string): boolean {
      return canonicalIndex.has(comparable(resolve(path)));
    },
  });
}

/** Convenience for callers that want a throw rather than a result object. */
export function assertPathProven(proof: PathProof): void {
  if (proof.proven) return;
  throw new PathBoundaryError(proof.code, proof.detail ?? `path boundary refused: ${proof.code}`, proof);
}

/** Exposed for diagnostics that report which roles an operation must declare. */
export function requiredRolesForFileMutation(): readonly OperationPathRole[] {
  return ["target", "state", "journal", "snapshot"];
}
