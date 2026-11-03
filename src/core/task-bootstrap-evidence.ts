import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { provePathBoundary, recheckPathProof } from "./path-boundary.js";
import { PLATFORM_FLOOR_ENVIRONMENT, resolveCommand, runProcess } from "./process.js";
import { runGitRead } from "./task-gsd.js";
import type { TaskBootstrapHandoff } from "./task-bootstrap-store.js";

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40,64}$/u;
const MAX_ARTIFACT_BYTES = 256 * 1024;

export interface BootstrapNativeReference extends Record<string, unknown> {
  readonly kind: "gsd-quick" | "gsd-phase";
  readonly id: string;
  readonly path: string;
  readonly artifactSha256: string;
  readonly commit: string;
  readonly canonicalRoot: string;
  readonly projectId: string;
  readonly pendingId: string;
  readonly contentDigest: string;
  readonly requestSha256: string;
  readonly claimNonce: string;
  readonly claimSession: string;
  readonly phaseDirectory?: string;
}

export function nativeBootstrapBinding(handoff: TaskBootstrapHandoff): string {
  return JSON.stringify({ canonicalRoot: handoff.canonicalRoot, projectId: handoff.projectId,
    pendingId: handoff.pendingId, contentDigest: handoff.contentDigest,
    claimNonce: handoff.claim?.nonce, claimSession: handoff.claim?.session,
    requestSha256: createHash("sha256").update(handoff.originalRequest.text, "utf8").digest("hex") });
}

/** Reads only an exact GSD allocation, never searches by goal, latest or timestamp. */
export async function verifyBootstrapNativeReference(handoff: TaskBootstrapHandoff, input: Record<string, unknown>): Promise<BootstrapNativeReference> {
  const fail = (reason: string): never => { throw new Error(`native-evidence-blocked: ${reason}. Reconcile the exact native artifact; no dispatch is authorized.`); };
  const required = ["kind", "id", "path", "artifactSha256", "commit", "canonicalRoot", "projectId", "pendingId", "contentDigest", "requestSha256", "claimNonce", "claimSession"];
  if (required.some((key) => typeof input[key] !== "string" || (input[key] as string).length === 0) ||
      Object.keys(input).some((key) => !required.includes(key) && key !== "phaseDirectory")) fail("missing or unknown native descriptor fields (legacy label-only links require fresh proof)");
  const ref = input as BootstrapNativeReference;
  if (!handoff.claim?.nonce || !handoff.claim.session || !SHA256.test(ref.artifactSha256) || !COMMIT.test(ref.commit)) fail("malformed hash, commit or durable claim");
  for (const key of ["canonicalRoot", "projectId", "pendingId", "contentDigest"] as const) {
    if (ref[key] !== handoff[key]) fail(`wrong ${key}`);
  }
  if (ref.requestSha256 !== createHash("sha256").update(handoff.originalRequest.text, "utf8").digest("hex")) fail("wrong original request hash");
  if (ref.claimNonce !== handoff.claim?.nonce || ref.claimSession !== handoff.claim?.session) fail("wrong claim identity");
  if (!/^[0-9]{1,6}-[a-zA-Z0-9_-]{1,100}$/u.test(ref.id) && !/^[0-9]{1,6}$/u.test(ref.id)) fail("invalid native allocation id");
  let expectedPath = "";
  if (ref.kind === "gsd-quick") {
    if (ref.phaseDirectory !== undefined) fail("quick reference includes phase directory");
    expectedPath = `.planning/quick/${ref.id}/${ref.id.split("-")[0]}-PLAN.md`;
  } else if (ref.kind === "gsd-phase") {
    if (typeof ref.phaseDirectory !== "string" || !/^[0-9]{1,6}-[a-zA-Z0-9_-]{1,100}$/u.test(ref.phaseDirectory) ||
        !ref.id.startsWith(`${ref.phaseDirectory.split("-")[0]}-`)) fail("invalid phase allocation");
    expectedPath = `.planning/phases/${ref.phaseDirectory}/${ref.id}-PLAN.md`;
  } else fail("unsupported reference kind");
  const expectedKind = handoff.commandRoute?.workflow.includes("phase") || handoff.canonicalSelectedStyle?.endsWith("phase") ? "gsd-phase" : "gsd-quick";
  if (ref.kind !== expectedKind) fail("reference kind differs from preserved request route");
  if (ref.path !== expectedPath) fail("path is not the exact native allocation PLAN");
  const path = join(handoff.canonicalRoot, ref.path);
  const proof = await provePathBoundary({ role: "source", path, allowedRoots: [handoff.canonicalRoot] });
  if (!proof.proven || proof.components.some((component) => component.reparse !== "none")) fail("artifact path or ancestor is not safe");
  const info = await lstat(path).catch(() => null);
  if (!info?.isFile() || info.size > MAX_ARTIFACT_BYTES) fail("artifact missing, not regular or oversized");
  const handle = await open(path, "r");
  let text = "";
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_ARTIFACT_BYTES || opened.dev !== info?.dev || opened.ino !== info?.ino) fail("artifact changed before read");
    const buffer = Buffer.alloc(MAX_ARTIFACT_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_ARTIFACT_BYTES) fail("artifact grew beyond bound");
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead)); } catch { fail("artifact is not UTF-8"); }
  } finally { await handle.close(); }
  if (!(await recheckPathProof(proof)).ok) fail("artifact ancestor changed during read");
  if (createHash("sha256").update(text).digest("hex") !== ref.artifactSha256) fail("artifact hash mismatch");
  const binding = nativeBootstrapBinding(handoff);
  if (text.split(binding).length !== 2) fail("artifact must contain one exact original request and claim binding");
  // Do not parse a path-aliased diagnostic excerpt as a filesystem path.
  if ((await runGitRead(handoff.canonicalRoot, ["rev-parse", "--show-prefix"])).trim() !== "" ||
      (await runGitRead(handoff.canonicalRoot, ["rev-parse", "--is-inside-work-tree"])).trim() !== "true") fail("Git repository root differs from canonical project");
  const resolvedCommit = (await runGitRead(handoff.canonicalRoot, ["rev-parse", "--verify", `${ref.commit}^{commit}`])).trim();
  if (resolvedCommit !== ref.commit) fail("commit is not exact");
  const head = (await runGitRead(handoff.canonicalRoot, ["rev-parse", "--verify", "HEAD"])).trim();
  const ancestry = (await runGitRead(handoff.canonicalRoot, ["rev-list", "--count", "--ancestry-path", `${ref.commit}..HEAD`])).trim();
  if (!/^[0-9]+$/u.test(ancestry) || (head !== ref.commit && ancestry === "0")) fail("commit is not an ancestor of current HEAD");
  const base = handoff.claim?.baseCommit;
  if (base && (base === ref.commit || (await runGitRead(handoff.canonicalRoot, ["rev-list", "--count", "--ancestry-path", `${base}..${ref.commit}`])).trim() === "0")) fail("artifact commit does not follow durable claim baseline");
  if (!/^(?:100644|100755) blob$/u.test((await runGitRead(handoff.canonicalRoot, ["ls-tree", "--format=%(objectmode) %(objecttype)", ref.commit, "--", ref.path])).trim())) fail("committed artifact is not one regular Git blob");
  const git = resolveCommand("git");
  if (!git) fail("Git executable unavailable");
  // Fingerprint the raw stream while retaining only redacted diagnostics. Native
  // request/root bytes must never be reconstructed from a diagnostic excerpt.
  const committed = await runProcess({ executable: git!, args: ["show", `${ref.commit}:${ref.path}`], cwd: handoff.canonicalRoot,
    environment: { optional: [...PLATFORM_FLOOR_ENVIRONMENT, "PATH", "PATHEXT", "HOME", "USERPROFILE", "TEMP", "TMP", "TMPDIR", "LANG"], literal: { GIT_NO_REPLACE_OBJECTS: "1" }, source: process.env },
    timeoutMs: 15_000, maxOutputBytes: MAX_ARTIFACT_BYTES, excerptBytes: 0 });
  if (committed.code !== "ok" || committed.outputCapped || committed.stdout.totalBytes > MAX_ARTIFACT_BYTES || committed.stdout.sha256 !== ref.artifactSha256) fail("exact Git artifact bytes/request differ from disk evidence");
  return ref;
}
