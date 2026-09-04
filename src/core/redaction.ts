import { createHash } from "node:crypto";
import type { ObservableEnvelope, PathAliases, RedactedExcerpt, RedactionContext } from "../types.js";
import { aliasPath, createPathAliases } from "./paths.js";

/**
 * Bounds on any recursive walk. A diagnostic value can be arbitrarily large,
 * cyclic, or hostile, so every traversal terminates on structure rather than
 * on trust.
 */
const LIMITS = {
  depth: 12,
  items: 200,
  stringLength: 2048,
  totalBytes: 256 * 1024,
  excerptBytes: 4096,
} as const;

/** Key names whose *value* is a secret regardless of what the value looks like. */
const SECRET_KEY_PATTERN =
  /(?:^|[_\-.])(?:secret|password|passwd|pwd|token|apikey|api_key|accesskey|access_key|privatekey|private_key|credential|auth|authorization|sessionid|session_id|cookie|bearer|signature)(?:$|[_\-.])|^(?:secret|password|token|apikey|api_key|auth|authorization|cookie|bearer)$/iu;

/** Structural secrets recognizable from their own shape, in replacement order. */
const STRUCTURAL_RULES: ReadonlyArray<{ readonly kind: string; readonly pattern: RegExp }> = [
  { kind: "pem", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/gu },
  { kind: "anthropic-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/gu },
  { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{12,}\b/gu },
  { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/gu },
];

/** Query parameters whose value is a credential even though the URL is not. */
const SECRET_QUERY_KEYS = new Set([
  "token", "access_token", "api_key", "apikey", "key", "secret",
  "password", "auth", "authorization", "signature", "sig", "code",
]);

export function placeholder(kind: string): string {
  return `[redacted:${kind}]`;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

/**
 * Creates a call-scoped redaction context. Exact values live only for the
 * duration of the call: nothing here is cached globally or folded into an
 * error message, so a leak cannot outlive the operation that produced it.
 */
export function createRedactionContext(options: {
  secrets?: Iterable<string> | undefined;
  projectRoot?: string | undefined;
  aliases?: PathAliases | undefined;
} = {}): RedactionContext {
  const exact = new Set<string>();
  for (const secret of options.secrets ?? []) {
    // Short values produce false positives across unrelated output; a real
    // credential is never four characters long.
    if (typeof secret === "string" && secret.trim().length >= 8) exact.add(secret);
  }
  return {
    exact,
    aliases: options.aliases ?? createPathAliases({ projectRoot: options.projectRoot }),
  };
}

/** Finds URLs anywhere in a string, not only strings that are entirely a URL. */
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]}]+/giu;

function redactOneUrl(candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return candidate;
  }
  if (url.username || url.password) {
    url.username = placeholder("userinfo");
    url.password = "";
  }
  for (const key of [...url.searchParams.keys()]) {
    if (!SECRET_QUERY_KEYS.has(key.toLowerCase())) continue;
    url.searchParams.set(key, placeholder("token"));
  }
  return url.toString();
}

/**
 * Redacts every URL embedded in the string. A message like
 * `sync failed for https://user:pass@host/x?token=y` is the common shape, so
 * matching only whole-string URLs would miss most real leaks.
 */
function redactUrls(value: string): { text: string; matched: boolean } {
  let matched = false;
  const text = value.replace(URL_PATTERN, (candidate) => {
    // Trailing punctuation belongs to the sentence, not the URL.
    const trimmed = candidate.replace(/[.,;:!?]+$/u, "");
    const suffix = candidate.slice(trimmed.length);
    const redacted = redactOneUrl(trimmed);
    if (redacted !== trimmed) matched = true;
    return `${redacted}${suffix}`;
  });
  return { text, matched };
}

/**
 * Applies the replacement order the phase contract fixes: exact credentials,
 * then structural secrets, then URL credentials, then private path aliases.
 * Ordering matters — aliasing first would corrupt a URL, and structural rules
 * would otherwise consume an exact value before it is matched.
 */
function redactCore(value: string, context: RedactionContext): string {
  let result = value;

  for (const secret of context.exact) {
    if (result.includes(secret)) {
      result = result.split(secret).join(placeholder(`secret:${fingerprint(secret)}`));
    }
  }

  for (const rule of STRUCTURAL_RULES) {
    result = result.replace(rule.pattern, placeholder(rule.kind));
  }

  const urls = redactUrls(result);
  result = urls.text;

  // Path aliasing applies to whole path-shaped values only. Substring
  // replacement inside an arbitrary message would mangle unrelated text.
  if (!urls.matched && /^(?:[A-Za-z]:[\\/]|\/|\\\\)/u.test(result)) {
    result = aliasPath(result, context.aliases);
  }

  return result;
}

export function redactString(value: string, context: RedactionContext): string {
  const result = redactCore(value, context);
  if (result.length > LIMITS.stringLength) {
    return `${result.slice(0, LIMITS.stringLength)}…[truncated:${result.length - LIMITS.stringLength}]`;
  }
  return result;
}

/**
 * Recursively redacts an arbitrary value into something safe to serialize.
 * Cycles, depth, item counts and string sizes are all bounded, so a hostile or
 * self-referential object cannot exhaust memory or hang the walk.
 */
export function redactValue(value: unknown, context: RedactionContext): unknown {
  const seen = new WeakSet<object>();

  function walk(current: unknown, depth: number, secretKey: boolean): unknown {
    if (secretKey && current !== undefined && current !== null) return placeholder("value");
    if (current === null || current === undefined) return current ?? null;

    switch (typeof current) {
      case "string":
        return redactString(current, context);
      case "number":
      case "boolean":
        return current;
      case "bigint":
        return current.toString();
      case "function":
        return placeholder("function");
      case "symbol":
        return placeholder("symbol");
      default:
        break;
    }

    if (depth >= LIMITS.depth) return placeholder("depth-limit");

    const object = current as object;
    if (seen.has(object)) return placeholder("cycle");
    seen.add(object);

    if (current instanceof Error) {
      // An Error's own message and stack are ordinary strings and get the same
      // treatment as any other value; the stack carries absolute paths.
      return {
        name: current.name,
        message: redactString(current.message, context),
        stack: current.stack === undefined ? null : redactString(current.stack, context),
        cause: current.cause === undefined ? null : walk(current.cause, depth + 1, false),
      };
    }

    if (current instanceof Date) return current.toISOString();
    if (current instanceof Map) return walk(Object.fromEntries(current), depth, false);
    if (current instanceof Set) return walk([...current], depth, false);
    if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) {
      const bytes = current instanceof ArrayBuffer ? new Uint8Array(current) : new Uint8Array(current.buffer, current.byteOffset, current.byteLength);
      return { kind: "bytes", byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
    }

    if (Array.isArray(current)) {
      const limited = current.slice(0, LIMITS.items).map((item) => walk(item, depth + 1, false));
      if (current.length > LIMITS.items) limited.push(placeholder(`items-limit:${current.length - LIMITS.items}`));
      return limited;
    }

    const output: Record<string, unknown> = {};
    let count = 0;
    for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
      if (count >= LIMITS.items) {
        output["[redacted:items-limit]"] = Object.keys(current as object).length - LIMITS.items;
        break;
      }
      output[key] = walk(entry, depth + 1, SECRET_KEY_PATTERN.test(key));
      count += 1;
    }
    return output;
  }

  return walk(value, 0, false);
}

/**
 * The single seam every human and JSON surface serializes through. Returning
 * an envelope rather than a string keeps the byte budget observable to the
 * caller instead of silently dropping the tail.
 */
export function serializeObservable(value: unknown, context: RedactionContext): ObservableEnvelope {
  const redacted = redactValue(value, context);
  let text = JSON.stringify(redacted, null, 2) ?? "null";
  let truncated = false;
  if (Buffer.byteLength(text, "utf8") > LIMITS.totalBytes) {
    text = text.slice(0, LIMITS.totalBytes);
    truncated = true;
  }
  return { value: redacted, text, truncated, sha256: createHash("sha256").update(text, "utf8").digest("hex") };
}

/**
 * Converts captured subprocess output into shareable evidence: a bounded,
 * redacted excerpt plus a fingerprint of the whole stream. The raw bytes are
 * deliberately not retained on the returned object.
 */
export function createRedactedExcerpt(raw: string, context: RedactionContext): RedactedExcerpt {
  const totalBytes = Buffer.byteLength(raw, "utf8");
  const sha256 = createHash("sha256").update(raw, "utf8").digest("hex");
  // Redact before truncating: a secret straddling the cut must not survive in
  // the retained half. The core redactor is used directly so the excerpt is
  // bounded by its own budget rather than the generic string-length cap.
  const redacted = redactCore(raw, context);
  const capped = Buffer.byteLength(redacted, "utf8") > LIMITS.excerptBytes;
  const excerpt = capped ? redacted.slice(0, LIMITS.excerptBytes) : redacted;
  return { excerpt, capped, totalBytes, sha256 };
}
