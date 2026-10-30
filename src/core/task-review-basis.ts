import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Invalidation is explicit: revision, bytes, requirements and dependencies.
 * Hashes travel in packets/receipts; full historic transcripts do not. */
export async function taskReviewBasis(options: {
  projectRoot: string; contractDigest: string; targetRevisionSha: string; artifactDigest: string;
}): Promise<string> {
  const files: Record<string, string | null> = {};
  for (const name of [".planning/REQUIREMENTS.md", ".planning/PROJECT.md", ".planning/config.json", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
    try { files[name] = createHash("sha256").update(await readFile(join(options.projectRoot, name))).digest("hex"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") files[name] = null; else throw error; }
  }
  return createHash("sha256").update(JSON.stringify({ contractDigest: options.contractDigest,
    targetRevisionSha: options.targetRevisionSha, artifactDigest: options.artifactDigest, files })).digest("hex");
}
