import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { RedactionContext, SupportBundlePlan, SupportBundleSource } from "../types.js";
import { aliasPath } from "./paths.js";
import { createRedactedExcerpt, serializeObservable } from "./redaction.js";

/**
 * Content that is recovery material rather than diagnostic text. Its bytes are
 * never previewed — only alias path, size, hash and permissions — because a
 * snapshot is a verbatim copy of whatever the user's file contained.
 */
const OPAQUE_PREFIXES = ["snapshots/", "snapshot/"] as const;

function isOpaque(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  return OPAQUE_PREFIXES.some((prefix) => normalized.startsWith(prefix) || normalized.includes(`/${prefix}`));
}

/**
 * Produces a deterministic, non-mutating description of what a support bundle
 * would contain. This function performs no write and opens no network
 * connection: creating the artifact is a separate, explicit user action.
 */
export async function planSupportBundle(options: {
  sources: ReadonlyArray<{ path: string; label: string }>;
  destination: string;
  context: RedactionContext;
}): Promise<SupportBundlePlan> {
  const sources: SupportBundleSource[] = [];

  for (const entry of [...options.sources].sort((left, right) => left.path.localeCompare(right.path))) {
    const absolute = resolve(entry.path);
    if (!existsSync(absolute)) {
      sources.push({
        label: entry.label,
        aliasPath: aliasPath(absolute, options.context.aliases),
        byteLength: 0,
        sha256: null,
        mode: null,
        opaque: false,
        preview: null,
        missing: true,
      });
      continue;
    }

    const info = await stat(absolute);
    const bytes = await readFile(absolute);
    const opaque = isOpaque(entry.label);
    sources.push({
      label: entry.label,
      aliasPath: aliasPath(absolute, options.context.aliases),
      byteLength: info.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mode: (info.mode & 0o777).toString(8).padStart(3, "0"),
      opaque,
      // Opaque sources contribute metadata only. Everything else is redacted
      // before it can become part of a preview.
      preview: opaque ? null : createRedactedExcerpt(bytes.toString("utf8"), options.context),
      missing: false,
    });
  }

  const plan: SupportBundlePlan = {
    schemaVersion: 1,
    destination: aliasPath(resolve(options.destination), options.context.aliases),
    createdBy: "alpha-aos support",
    // Stated so no reader has to infer it from the absence of a network call.
    network: "none",
    sources,
    planDigest: "",
  };

  // The digest binds every source hash and the destination intent, so a plan
  // reviewed by a user cannot be applied against different bytes.
  const canonical = JSON.stringify({
    destination: plan.destination,
    network: plan.network,
    sources: sources.map((source) => ({ label: source.label, sha256: source.sha256, byteLength: source.byteLength })),
  });
  plan.planDigest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return plan;
}

/**
 * Renders the reviewed plan into the exact bytes a local support artifact
 * would contain. Rendering is deterministic and still writes nothing; the
 * caller decides whether those bytes reach the filesystem.
 */
export function renderSupportBundleBytes(plan: SupportBundlePlan, context: RedactionContext): Uint8Array {
  const envelope = serializeObservable(plan, context);
  return Buffer.from(`${envelope.text}\n`, "utf8");
}
