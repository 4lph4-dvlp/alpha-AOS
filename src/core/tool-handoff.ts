export interface LegacyToolEvidence {
  toolId: string;
  sourceId: "npm-registry" | "driver-release";
  sourceUrl: string;
  release: string;
  artifact: string;
  platform: string;
  architecture: string;
  artifactDigest: string;
  provenanceRef: string;
  verificationRef: string;
  currentRef: string;
  scope: string;
  previousIdentity: string;
  priorInstallationOwner: "alpha-aos" | "external" | "unknown";
  priorConnectionOwner: "alpha-aos" | "external" | "unknown";
  userModificationEvidence: string;
  transformed?: { sourceDigest: string; revision: string; parametersRef: string; targetDigest: string };
}

export interface LegacyHandoffAssessment { status: "ready" | "needs-evidence" | "modified" | "ambiguous" | "unsupported"; reason: string; nextAction: string; scope: string | null }
export interface LegacyEvidenceChain {
  metadata: Buffer;
  signature: Buffer;
  artifact: Buffer;
  current: Buffer;
  source?: Buffer;
}
export interface LegacyTrustAnchor { sourceId: LegacyToolEvidence["sourceId"]; publicKey: string }
// References are claims until a production verifier can authenticate and bind
// retained publisher evidence, artifact bytes and current installation bytes.
export function evaluateLegacyHandoff(evidence: Partial<LegacyToolEvidence> | null, chain?: LegacyEvidenceChain, anchors: readonly LegacyTrustAnchor[] = []): LegacyHandoffAssessment {
  const result = (status: LegacyHandoffAssessment["status"], reason: string, nextAction: string): LegacyHandoffAssessment => ({ status, reason, nextAction, scope: evidence?.scope ?? null });
  if (!evidence) return result("needs-evidence", "legacy-evidence-missing", "Inspect retained provenance and current files");
  if (evidence.sourceId !== "npm-registry" && evidence.sourceId !== "driver-release") return result("unsupported", "source-unsupported", "Inspect the official source");
  try {
    const url = new URL(evidence.sourceUrl ?? "");
    const packages: Record<string, string> = { gsd: "@opengsd/gsd-core", ecc: "ecc-universal", "mcp:context7": "@upstash/context7-mcp", "mcp:exa": "exa-mcp-server", "mcp:firecrawl": "firecrawl-mcp", "bridge:pi": "pi-mcp-adapter" };
    const path = decodeURIComponent(url.pathname), pkg = packages[evidence.toolId ?? ""];
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || (evidence.sourceId === "driver-release" ? evidence.toolId !== "cua-driver" || url.hostname !== "github.com" || !path.startsWith("/trycua/cua/releases/download/") : url.hostname !== "registry.npmjs.org" || !pkg || !(path === `/${pkg}` || path.startsWith(`/${pkg}/-/`)))) throw new Error("source");
  } catch { return result("needs-evidence", "official-source-unproven", "Inspect official publisher provenance"); }
  for (const [key, reason] of [["release", "release-missing"], ["artifact", "artifact-missing"], ["platform", "platform-missing"], ["architecture", "architecture-missing"], ["artifactDigest", "expected-digest-missing"], ["provenanceRef", "provenance-missing"], ["verificationRef", "artifact-verification-missing"], ["currentRef", "current-match-missing"], ["scope", "scope-missing"], ["previousIdentity", "previous-identity-missing"], ["priorInstallationOwner", "installation-owner-missing"], ["priorConnectionOwner", "connection-owner-missing"], ["userModificationEvidence", "user-modification-evidence-missing"]] as const) if (!evidence[key]) return result("needs-evidence", reason, "Inspect and retain the missing evidence");
  if (evidence.sourceId === "driver-release") {
    const parts = new URL(evidence.sourceUrl!).pathname.split("/");
    if (parts.at(-1) !== evidence.artifact || ![evidence.release, `v${evidence.release}`].includes(parts.at(-2) ?? "")) return result("needs-evidence", "artifact-subject-mismatch", "Inspect release and artifact identity");
  }
  if (!/^[a-f0-9]{64}$/.test(evidence.artifactDigest!)) return result("needs-evidence", "expected-digest-invalid", "Inspect trusted expected digest");
  if (evidence.transformed) for (const key of ["sourceDigest", "revision", "parametersRef", "targetDigest"] as const) if (!evidence.transformed[key]) return result("needs-evidence", `transformation-${key}-missing`, "Inspect the retained transformation chain");
  if (evidence.transformed && (![evidence.transformed.sourceDigest, evidence.transformed.targetDigest].every((digest) => /^[a-f0-9]{64}$/.test(digest)))) return result("needs-evidence", "transformation-digest-invalid", "Inspect the retained transformation hashes");
  if (!chain || !anchors.length) return result("needs-evidence", "trusted-chain-unchecked", "Verify retained provenance and current files");
  if ([chain.metadata, chain.signature, chain.artifact, chain.current, ...(chain.source ? [chain.source] : [])].some((bytes) => !Buffer.isBuffer(bytes) || bytes.length > 256 * 1024 * 1024) || chain.metadata.length > 65536) return result("needs-evidence", "chain-invalid", "Inspect retained evidence");
  let authenticated = false;
  for (const anchor of anchors.filter((item) => item.sourceId === evidence.sourceId)) {
    try { if (verify(null, chain.metadata, anchor.publicKey, chain.signature)) authenticated = true; } catch { /* invalid key or signature */ }
  }
  if (!authenticated) return result("needs-evidence", "provenance-signature-untrusted", "Inspect trusted publisher metadata");
  let metadata: Record<string, unknown>;
  try { metadata = JSON.parse(chain.metadata.toString("utf8")) as Record<string, unknown>; } catch { return result("needs-evidence", "provenance-metadata-invalid", "Inspect retained metadata"); }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return result("needs-evidence", "provenance-metadata-invalid", "Inspect retained metadata");
  for (const key of ["toolId", "sourceId", "sourceUrl", "release", "artifact", "platform", "architecture", "artifactDigest", "scope", "provenanceRef", "verificationRef", "currentRef", "previousIdentity", "priorInstallationOwner", "priorConnectionOwner", "userModificationEvidence"] as const) if (metadata[key] !== evidence[key]) return result("needs-evidence", `subject-${key}-mismatch`, "Inspect subject and scope linkage");
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  if (hash(chain.artifact) !== evidence.artifactDigest) return result("needs-evidence", "artifact-digest-mismatch", "Inspect retained artifact verification");
  if (evidence.transformed) {
    const transformation = metadata.transformed;
    if (!transformation || typeof transformation !== "object" || ["sourceDigest", "revision", "parametersRef", "targetDigest"].some((key) => (transformation as Record<string, unknown>)[key] !== evidence.transformed![key as keyof NonNullable<LegacyToolEvidence["transformed"]>])) return result("needs-evidence", "transformation-link-mismatch", "Inspect the retained transformation chain");
    if (!chain.source || hash(chain.source) !== evidence.transformed.sourceDigest) return result("needs-evidence", "transformation-source-mismatch", "Inspect retained source bytes");
    if (hash(chain.current) !== evidence.transformed.targetDigest) return result("modified", "current-files-modified", "Inspect and preserve user changes");
  } else if (hash(chain.current) !== evidence.artifactDigest) return result("modified", "current-files-modified", "Inspect and preserve user changes");
  return result("ready", "trusted-chain-matches", "Use the explicit handoff operation");
}

export function prepareLegacyToolHandoff(evidence: LegacyToolEvidence, chain?: LegacyEvidenceChain, anchors: readonly LegacyTrustAnchor[] = []): LegacyToolEvidence {
  if (evaluateLegacyHandoff(evidence, chain, anchors).status !== "ready") throw new Error("Legacy handoff evidence is insufficient");
  return structuredClone(evidence);
}
import { createHash, verify } from "node:crypto";

