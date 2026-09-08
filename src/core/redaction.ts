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
  /** UTF-16 code units — the unit `String.prototype.length` is expressed in. */
  stringLength: 2048,
  /** UTF-8 bytes. */
  totalBytes: 256 * 1024,
  /** UTF-8 bytes. */
  excerptBytes: 4096,
} as const;

/**
 * The byte budget a serialized envelope and a rendered document are both
 * measured against, in UTF-8 BYTES. Exported so a caller refusing an
 * over-budget envelope can name the number that decided rather than restate it.
 */
export const OBSERVABLE_BYTE_BUDGET = LIMITS.totalBytes;

/**
 * The bound on a single redacted value, in UTF-16 CODE UNITS — the unit it is
 * both measured and applied in. It is deliberately not a byte budget: it bounds
 * one field inside an envelope, and the envelope's own bound is the byte one.
 */
export const REDACTED_STRING_LENGTH_BUDGET = LIMITS.stringLength;

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

/**
 * Cuts a string to a UTF-8 BYTE bound, measuring and cutting in the same unit.
 *
 * The guard used to be `Buffer.byteLength(value) > budget` and the cut
 * `value.slice(0, budget)`, which removes UTF-16 code units. For text of
 * three-byte code points that retains three times the declared bound — the
 * bound is not enforced at all — and the cut can leave half a surrogate pair
 * behind (02-REVIEW WR-07).
 *
 * The slice end walks back off any continuation byte (`10xxxxxx`), so the
 * retained bytes always end exactly on a code-point boundary: the result is
 * inside the budget, decodes cleanly, and contains no character the source did
 * not have. A UTF-8 sequence is at most four bytes, so this walks back at most
 * three times.
 */
function truncateToUtf8Bytes(value: string, budgetBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= budgetBytes) return { text: value, truncated: false };

  let end = budgetBytes;
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString("utf8"), truncated: true };
}

/**
 * Cuts a string to a UTF-16 CODE UNIT bound — `LIMITS.stringLength`'s own
 * unit — without splitting a surrogate pair. A lone surrogate is not a
 * character; it is a value that cannot round-trip through UTF-8.
 */
function truncateToLength(value: string, budgetUnits: number): { text: string; truncated: boolean } {
  if (value.length <= budgetUnits) return { text: value, truncated: false };

  let end = budgetUnits;
  const lead = value.charCodeAt(end - 1);
  if (lead >= 0xd800 && lead <= 0xdbff) end -= 1;
  return { text: value.slice(0, end), truncated: true };
}

/**
 * Redacts one field value and bounds it at `REDACTED_STRING_LENGTH_BUDGET`.
 *
 * The bound is expressed, measured and applied in UTF-16 code units — the unit
 * `String.prototype.length` reports — and the reported remainder counts the
 * same unit. This is deliberately NOT a byte budget: it bounds a single value
 * inside an envelope, and the envelope carries the byte budget.
 */
export function redactString(value: string, context: RedactionContext): string {
  const result = redactCore(value, context);
  const cut = truncateToLength(result, LIMITS.stringLength);
  if (!cut.truncated) return cut.text;
  return `${cut.text}…[truncated:${result.length - cut.text.length}]`;
}

/**
 * Redacts a whole rendered DOCUMENT rather than one field value.
 *
 * `redactString` caps at `LIMITS.stringLength`, which is the right bound for a
 * single value inside a serialized envelope and the wrong one for a command's
 * entire human-readable rendering: `project plan --why` prints every declared
 * pack with full leaf detail and legitimately exceeds 2 KiB. The redaction is
 * identical and runs over the whole text, so a multi-line structural rule such
 * as the PEM block still matches across newlines; only the cap differs, and it
 * is the same `LIMITS.totalBytes` bound the JSON envelope already uses — in
 * UTF-8 bytes, measured and applied in that one unit.
 */
export function redactDocument(value: string, context: RedactionContext): string {
  const cut = truncateToUtf8Bytes(redactCore(value, context), LIMITS.totalBytes);
  return cut.truncated ? `${cut.text}…[truncated]` : cut.text;
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
 *
 * `truncated` is not advisory. A caller that writes `.text` and discards it
 * ships a JSON document cut mid-token with a success exit, which is exactly
 * what 02-REVIEW WR-06 found; `describeOverBudgetEnvelope` below is the refusal
 * such a caller owes instead. `sha256` is computed over the text the envelope
 * actually carries, so the digest named in a refusal is one the caller can
 * reproduce.
 */
export function serializeObservable(value: unknown, context: RedactionContext): ObservableEnvelope {
  const redacted = redactValue(value, context);
  const serialized = JSON.stringify(redacted, null, 2) ?? "null";
  const cut = truncateToUtf8Bytes(serialized, LIMITS.totalBytes);
  return {
    value: redacted,
    text: cut.text,
    truncated: cut.truncated,
    sha256: createHash("sha256").update(cut.text, "utf8").digest("hex"),
  };
}

/**
 * The refusal an over-budget envelope earns, in the caller's own words.
 *
 * Written here rather than at the call site so every `--json` surface refuses
 * with the same sentence: the budget as a number, the digest of what was built,
 * and the two narrowing steps this CLI already has. Nothing may be written to
 * stdout alongside it — a pipeline reads stdout, so a partial document there
 * plus a refusal on stderr is worse than a refusal alone.
 */
export function describeOverBudgetEnvelope(envelope: ObservableEnvelope): string {
  return [
    `Refusing to print a JSON envelope over the observable byte budget of ${OBSERVABLE_BYTE_BUDGET} bytes.`,
    `The envelope was built and hashed but not written: sha256=${envelope.sha256}.`,
    "Nothing was written to stdout, because a document cut mid-token would parse as a truncated success.",
    "Narrow the scope with --project <path>, or read the same answer without --json.",
  ].join(" ");
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
  // Measured and cut in the same unit the budget is declared in, for the same
  // reason `redactDocument` is (02-REVIEW WR-07): a code-unit cut under a byte
  // guard retains up to three times the bound and can split a code point.
  const cut = truncateToUtf8Bytes(redacted, LIMITS.excerptBytes);
  return { excerpt: cut.text, capped: cut.truncated, totalBytes, sha256 };
}
