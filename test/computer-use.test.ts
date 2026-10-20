import test from "node:test";
import assert from "node:assert/strict";
import { ComputerSession } from "../src/core/computer-use.js";
import { validateComputerAuthority } from "../src/core/computer-use-policy.js";
import { authorityFixture } from "./computer-use-policy.test.js";
import { pngFixture } from "./computer-use-audit.test.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("production broker records intent before effect and verifies fresh observation", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-session-"));
  const authority = validateComputerAuthority(authorityFixture());
  let value = "before";
  let effects = 0;
  const transport = {
    identity: authority.runtime,
    observe: async () => ({ target: authority.target, captureId: `capture-${effects}`, png: pngFixture, width: 1, height: 1, state: value, safe: true, foreground: false }),
    dispatch: async () => { effects++; value = "after"; },
    close: async () => {},
  };
  try {
    const session = await ComputerSession.open(authority, transport, root);
    const result = await session.action({ kind: "click", x: 0, y: 0 }, { equals: "after" });
    assert.equal(result.outcome, "verified");
    assert.equal(effects, 1);
    await session.stop();
    await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { equals: "after" }));
    assert.equal(effects, 1);
    await session.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
