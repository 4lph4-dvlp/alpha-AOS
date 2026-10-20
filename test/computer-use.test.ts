import test from "node:test";
import assert from "node:assert/strict";
import { ComputerSession } from "../src/core/computer-use.js";
import { validateComputerAuthority } from "../src/core/computer-use-policy.js";
import { authorityFixture, pngFixture } from "./fixtures/computer-use.js";
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

test("session authority cannot be widened after opening", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-session-"));
  const a = validateComputerAuthority(authorityFixture());
  const session = await ComputerSession.open(a, { identity: a.runtime, observe: async () => { throw new Error("unused"); }, dispatch: async () => {}, close: async () => {} }, root);
  try { assert.throws(() => { session.authority.permissions.foreground = true; }, TypeError); }
  finally { await session.close(); await rm(root, { recursive: true, force: true }); }
});
