import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

test("explicit tool record writer API is available", async () => {
  const path = new URL("../src/core/tool-record-store.js", import.meta.url);
  const available = await access(path).then(() => true, () => false);
  assert.equal(available, true, "the explicit record writer must be available");
});
