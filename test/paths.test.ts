import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { findPackageRoot, packageRoot } from "../src/core/paths.js";

test("package root is found from the compiled dist module depth", () => {
  const root = packageRoot();
  assert.equal(findPackageRoot(join(root, "dist", "src", "core")), root);
});
