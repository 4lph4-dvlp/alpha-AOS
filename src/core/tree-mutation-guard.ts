import { collectTaskArtifact, type TaskArtifactManifest } from "./task-check.js";

export const IGNORED_OS_FILES: ReadonlySet<string> = new Set([
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
]);

export interface TreeMutationResult {
  mutated: boolean;
  code: "ok" | "INVALID_MUTATING_REVIEW";
  violations: string[];
}

export async function captureTreeSnapshot(
  projectRoot: string,
  allowedRoots: readonly string[]
): Promise<TaskArtifactManifest> {
  const manifest = await collectTaskArtifact({ projectRoot, allowedRoots });
  if (manifest.status !== "ok") {
    throw new Error(`Failed to capture tree snapshot: ${manifest.cause} ${manifest.detail}`);
  }
  return manifest;
}

export function evaluateTreeMutations(
  before: TaskArtifactManifest,
  after: TaskArtifactManifest
): TreeMutationResult {
  if (before.digest === after.digest) {
    return { mutated: false, code: "ok", violations: [] };
  }

  const beforeMap = new Map(before.files.map((f) => [f.path, f.sha256]));
  const afterMap = new Map(after.files.map((f) => [f.path, f.sha256]));
  const violations: string[] = [];

  for (const [path, hash] of afterMap) {
    const filename = path.split("/").pop() ?? "";
    if (IGNORED_OS_FILES.has(filename)) continue;

    if (!beforeMap.has(path)) {
      violations.push(`created: ${path}`);
    } else if (beforeMap.get(path) !== hash) {
      violations.push(`modified: ${path}`);
    }
  }

  for (const [path] of beforeMap) {
    const filename = path.split("/").pop() ?? "";
    if (IGNORED_OS_FILES.has(filename)) continue;

    if (!afterMap.has(path)) {
      violations.push(`deleted: ${path}`);
    }
  }

  return {
    mutated: violations.length > 0,
    code: violations.length > 0 ? "INVALID_MUTATING_REVIEW" : "ok",
    violations,
  };
}
