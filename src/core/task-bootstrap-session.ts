import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { proveOperationPaths } from "./path-boundary.js";
import { acquireMutationSession, type MutationSession } from "./writer-lock.js";

export function assertTaskBootstrapSession(session: MutationSession, stateRoot: string): void {
  session.assertOwned();
  if (resolve(session.stateRoot) !== resolve(stateRoot)) throw new Error("Bootstrap mutation session state root mismatch");
}

/** The caller keeps ownership when composing bootstrap with another mutation. */
export async function withTaskBootstrapSession<T>(options: {
  stateRoot: string;
  session?: MutationSession | undefined;
}, action: (session: MutationSession) => Promise<T>): Promise<T> {
  const stateRoot = resolve(options.stateRoot);
  if (options.session) {
    assertTaskBootstrapSession(options.session, stateRoot);
    return action(options.session);
  }
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "state", path: stateRoot },
      { role: "target", path: join(stateRoot, "task-intake") },
      { role: "journal", path: join(stateRoot, "journal") },
      { role: "snapshot", path: join(stateRoot, "snapshots") },
    ],
    allowedRoots: [stateRoot],
    requiredRoles: ["state", "target", "journal", "snapshot"],
  });
  const session = await acquireMutationSession({ stateRoot, proofs,
    planDigest: createHash("sha256").update(`task-bootstrap:${stateRoot}`).digest("hex") });
  try { return await action(session); } finally { await session.close(); }
}
