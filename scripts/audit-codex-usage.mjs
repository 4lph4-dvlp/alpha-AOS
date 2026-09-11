#!/usr/bin/env node
// Read-only audit. Print counters, never prompts, tool output, or credentials.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { createInterface } from "node:readline";

const fields = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];
const zero = () => Object.fromEntries(fields.map((key) => [key, 0]));

export async function auditUsage(files, { since = -Infinity, until = Infinity } = {}) {
  if (files.length === 0 || since >= until) throw new Error("Supply log files and a nonempty time window.");
  const seen = new Map();
  const threads = new Map();
  const logs = [];
  for (const file of files) {
    const info = await stat(file);
    if (!info.isFile() || info.size > 128 * 1024 * 1024) throw new Error("Each input must be a file of at most 128 MiB.");
    let records = 0;
    let selected = 0;
    let duplicates = 0;
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (line.trim() === "") continue;
        let event;
        try { event = JSON.parse(line); } catch { throw new Error("An input log contains invalid JSON; no partial totals were emitted."); }
        if (event.type !== "token_usage_record") continue;
        records++;
        const timestamp = Date.parse(event.timestamp);
        if (!Number.isFinite(timestamp)) throw new Error("A usage record has no valid timestamp.");
        if (timestamp < since || timestamp >= until) continue;
        selected++;
        const { response_id: responseId, thread_id: threadId, usage } = event.payload ?? {};
        if (typeof responseId !== "string" || !responseId || typeof threadId !== "string" || !threadId) {
          throw new Error("A usage record lacks its response or thread identity.");
        }
        const values = zero();
        for (const field of fields) {
          const value = usage?.[field] ?? (field === "reasoning_output_tokens" ? 0 : undefined);
          if (!Number.isSafeInteger(value) || value < 0) throw new Error("A usage counter is not a nonnegative safe integer.");
          values[field] = value;
        }
        if (values.cached_input_tokens > values.input_tokens || values.reasoning_output_tokens > values.output_tokens) {
          throw new Error("Cached/reasoning counters exceed their inclusive input/output counters.");
        }
        const identity = JSON.stringify([threadId, values]);
        if (seen.has(responseId)) {
          if (seen.get(responseId) !== identity) throw new Error("Duplicate response records disagree; totals are indeterminate.");
          duplicates++;
          continue;
        }
        seen.set(responseId, identity);
        const bucket = threads.get(threadId) ?? { requests: 0, ...zero(), first: timestamp, last: timestamp, max_input_tokens: 0 };
        bucket.requests++;
        for (const field of fields) {
          bucket[field] += values[field];
          if (!Number.isSafeInteger(bucket[field])) throw new Error("Usage totals exceed safe integer precision.");
        }
        bucket.first = Math.min(bucket.first, timestamp);
        bucket.last = Math.max(bucket.last, timestamp);
        bucket.max_input_tokens = Math.max(bucket.max_input_tokens, values.input_tokens);
        threads.set(threadId, bucket);
      }
    } finally {
      lines.close();
      lines.input.destroy();
    }
    if (records === 0) throw new Error("An input log has no per-response token_usage_record events; cumulative token_count fallback is intentionally unsupported.");
    logs.push({ file: basename(file), selected_records: selected, duplicate_records: duplicates });
  }
  const rows = [...threads.values()].map((value, index) => ({
    thread: index + 1,
    requests: value.requests,
    ...Object.fromEntries(fields.map((field) => [field, value[field]])),
    uncached_input_tokens: value.input_tokens - value.cached_input_tokens,
    average_input_tokens: Math.round(value.input_tokens / value.requests),
    max_input_tokens: value.max_input_tokens,
    first_request_at: new Date(value.first).toISOString(),
    last_request_at: new Date(value.last).toISOString(),
  }));
  const total = rows.reduce((sum, row) => {
    sum.requests += row.requests;
    for (const field of fields) sum[field] += row[field];
    return sum;
  }, { requests: 0, ...zero() });
  for (const value of Object.values(total)) if (!Number.isSafeInteger(value)) throw new Error("Aggregate totals exceed safe integer precision.");
  return {
    schemaVersion: 1,
    scope: "Per-response records in the selected files and half-open time window; not account billing or quota attribution.",
    logs,
    threads: rows,
    total: {
      ...total,
      uncached_input_tokens: total.input_tokens - total.cached_input_tokens,
      total_tokens: total.input_tokens + total.output_tokens,
      cache_hit_percent: total.input_tokens === 0 ? null : Math.round(total.cached_input_tokens / total.input_tokens * 10000) / 100,
    },
  };
}

async function main(args) {
  const options = {};
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--since" || arg === "--until") {
      const value = args[++i];
      if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
        throw new Error("Time boundaries must be ISO timestamps with an explicit timezone.");
      }
      options[arg.slice(2)] = Date.parse(value);
    } else if (arg === "--") {
      files.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith("--")) {
      throw new Error("Unknown option. Usage: node scripts/audit-codex-usage.mjs [--since ISO] [--until ISO] -- log.jsonl ...");
    } else files.push(arg);
  }
  process.stdout.write(`${JSON.stringify(await auditUsage(files, options), null, 2)}\n`);
}

// Importable for deterministic tests without executing the CLI.
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    // Parser/fs errors may include log bytes or user paths; keep this boundary fixed.
    process.stderr.write("Codex usage audit refused: invalid inputs, inconsistent records, or unreadable logs. No partial totals emitted.\n");
    process.exitCode = 1;
  });
}
