import { stat } from "node:fs/promises";
import { join, relative, resolve, isAbsolute } from "node:path";
import { canonicalizeWithMissingTail, provePathBoundary, recheckPathProof } from "./path-boundary.js";

export async function proveToolRecordRoot(stateRoot: string, checkout: string) {
  const state = resolve(stateRoot), project = resolve(checkout);
  const inside = (root: string, target: string) => {
    const rel = relative(root, target);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };
  const a = await canonicalizeWithMissingTail(state), b = await canonicalizeWithMissingTail(project);
  if (a.reason || b.reason || inside(project, state) || inside(b.canonical, a.canonical) || inside(state, project) || inside(a.canonical, b.canonical)) return null;
  const proof = await provePathBoundary({ path: join(state, "tool-records"), allowedRoots: [state], role: "state" });
  return proof.proven ? proof : null;
}

export async function readToolRecordStore(options: { stateRoot: string; packageRoot: string }) {
  const proof = await proveToolRecordRoot(options.stateRoot, options.packageRoot);
  if (!proof) return { status: "inaccessible" as const, events: [], accepted: null };
  try {
    await stat(proof.configured);
    const rechecked = await recheckPathProof(proof);
    return { status: rechecked.ok ? "unknown-newer" as const : "inaccessible" as const, events: [], accepted: null };
  } catch (error) {
    const rechecked = await recheckPathProof(proof);
    return { status: (error as NodeJS.ErrnoException).code === "ENOENT" && rechecked.ok ? "absent" as const : "inaccessible" as const, events: [], accepted: null };
  }
}
