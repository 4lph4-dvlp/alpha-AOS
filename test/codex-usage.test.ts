import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/audit-codex-usage.mjs", import.meta.url));
const at = "2026-09-11T09:00:00Z";
function record(id: string, input = 100, cached = 80, timestamp = at) {
  return { type: "token_usage_record", timestamp, payload: {
    response_id: id, thread_id: "thread", usage: {
      input_tokens: input, cached_input_tokens: cached, output_tokens: 10, reasoning_output_tokens: 4,
    },
  } };
}

async function fixture(t: { after: (fn: () => Promise<unknown>) => void }, values: unknown[]) {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-usage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = join(root, "log.jsonl");
  await writeFile(log, values.map((value) => JSON.stringify(value)).join("\n") + "\n");
  return log;
}

test("usage audit deduplicates responses across logs and does not add cached or reasoning tokens twice", async (t) => {
  const log = await fixture(t, [record("a"), record("b", 200, 100)]);
  const result = spawnSync(process.execPath, [script, log, log], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.total, {
    requests: 2, input_tokens: 300, cached_input_tokens: 180, output_tokens: 20,
    reasoning_output_tokens: 8, uncached_input_tokens: 120, total_tokens: 320, cache_hit_percent: 60,
  });
  assert.equal(report.logs[1].duplicate_records, 2);
});

test("usage audit applies a half-open time window and never prints conversation content", async (t) => {
  const sentinel = "PRIVATE_CONVERSATION_SENTINEL";
  const log = await fixture(t, [
    { type: "response_item", payload: { content: sentinel } },
    record("before", 100, 80, "2026-09-11T08:59:59Z"), record("inside"),
    record("end", 100, 80, "2026-09-11T09:01:00Z"),
  ]);
  const result = spawnSync(process.execPath, [script, "--since", at, "--until", "2026-09-11T09:01:00Z", log], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).total.requests, 1);
  assert.equal(result.stdout.includes(sentinel), false);
  assert.equal(result.stdout.includes(log), false);
});

test("usage audit refuses contradictory duplicate counters without emitting partial totals", async (t) => {
  const log = await fixture(t, [record("a"), record("a", 200)]);
  const result = spawnSync(process.execPath, [script, log], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
});

test("usage audit refuses unknown cumulative-only logs and invalid cache counters", async (t) => {
  for (const events of [
    [{ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100 } } } }],
    [record("invalid", 10, 20)],
  ]) {
    const log = await fixture(t, events);
    const result = spawnSync(process.execPath, [script, log], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
  }
});
