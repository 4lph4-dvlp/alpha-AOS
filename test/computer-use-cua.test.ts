import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Ajv } from "ajv";
import { cuaActionArguments, cuaCapabilityManifest } from "../src/adapters/computer-use-cua.js";
import { authorityFixture, pngFixture } from "./fixtures/computer-use.js";
import { validateComputerAuthority } from "../src/core/computer-use-policy.js";
import type { ComputerAction } from "../src/core/computer-use-policy.js";
import { packageRoot } from "../src/core/paths.js";
import { join } from "node:path";

test("native argument mappings satisfy the actual pinned Windows 0.37.0 closed schemas", async () => {
  const tools = JSON.parse((await readFile(join(packageRoot(), "test/fixtures/cua-0.37.0-windows-tools.json"), "utf8")).replace(/^\uFEFF/, "")) as Array<{ name: string; inputSchema: object }>;
  const a = validateComputerAuthority(authorityFixture());
  a.target.windowId = "42";
  const observation = { target: a.target, captureId: "capture-1", png: pngFixture, width: 1, height: 1, state: "test", safe: true, foreground: false };
  const actions: ComputerAction[] = [{ kind: "click", x: 0, y: 0 }, { kind: "right_click", x: 0, y: 0 }, { kind: "drag", x: 0, y: 0, toX: 0, toY: 0 }, { kind: "type_text", text: "PUBLIC", classification: "public" }, { kind: "press_key", key: "Tab" }, { kind: "launch_app" }];
  const ajv = new Ajv({ strict: false });
  for (const action of actions) {
    const schema = tools.find((v) => v.name === action.kind); assert.ok(schema);
    const validate = ajv.compile(schema.inputSchema); const args = cuaActionArguments(a, action, observation);
    assert.equal(validate(args), true, `${action.kind}: ${JSON.stringify(validate.errors)}`);
    if (action.kind !== "launch_app") assert.equal(args.delivery_mode, "background");
  }
  const manifest = JSON.stringify(cuaCapabilityManifest(a)); assert.ok(!manifest.includes("shell_execute"));
  assert.match(String(cuaCapabilityManifest(a).expires_after), /^\d+s$/);
  a.permissions.foreground = true;
  assert.equal(cuaActionArguments(a, actions[0]!, observation).delivery_mode, "background");
  assert.equal(cuaActionArguments(a, { ...actions[0]!, delivery: "foreground" }, observation).delivery_mode, "foreground");
});
