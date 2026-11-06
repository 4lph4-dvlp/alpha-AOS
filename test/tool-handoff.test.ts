import assert from "node:assert/strict";
import test from "node:test";
import * as inventory from "../src/core/tool-inventory.js";

test("legacy candidates expose a handoff assessment", () => {
  assert.equal(typeof (inventory as Record<string, unknown>).reconcileToolState, "function");
});
