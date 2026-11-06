import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readToolRecordStore } from "../src/core/tool-records.js";

test("empty existing record store has current empty history", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-records-"));
  try {
    const stateRoot = join(root, "state"), packageRoot = join(root, "checkout");
    await mkdir(packageRoot);
    await mkdir(join(stateRoot, "tool-records", "v1", "operations"), { recursive: true });
    const result: { status: string; events: unknown[]; accepted: unknown } = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(result.status, "current");
    assert.deepEqual(result.events, []);
    assert.equal(result.accepted, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
