import test from "node:test";
import assert from "node:assert/strict";
import { validateComputerAuthority, decideComputerVerification, authorizeComputerAction } from "../src/core/computer-use-policy.js";

import { authorityFixture } from "./fixtures/computer-use.js";

test("computer verification offers ordinary choice and keeps judgment manual", () => {
  assert.equal(decideComputerVerification({ mode: "ordinary", deterministic: true, reversible: true, covered: true }).mode, "offer");
  assert.equal(decideComputerVerification({ mode: "autopilot", deterministic: true, reversible: true, covered: true }).mode, "automatic");
  assert.equal(decideComputerVerification({ mode: "autopilot", deterministic: false, reversible: true, covered: true }).mode, "manual");
});

test("authority is closed and grants nothing by omission", () => {
  assert.throws(() => validateComputerAuthority({}), /authority/i);
  assert.throws(() => validateComputerAuthority({ ...authorityFixture(), shell: true }), /unknown/i);
  assert.throws(() => validateComputerAuthority({ ...authorityFixture(), expiresAt: Infinity }), /finite/i);
});

test("exact target, digest, budget and finite geometry refuse before dispatch", () => {
  const authority = validateComputerAuthority(authorityFixture());
  const state = { runId: authority.runId, contractDigest: authority.contractDigest, target: authority.target, runtime: authority.runtime, now: Date.now(), startedAt: Date.now(), lastActivityAt: Date.now(), actions: 0, captures: 0, bytes: 0, stopped: false };
  assert.doesNotThrow(() => authorizeComputerAction(authority, state, { kind: "click", x: 0, y: 0 }));
  for (const change of [{ stopped: true }, { actions: 5 }, { contractDigest: "f".repeat(64) }, { target: { ...authority.target, pid: 43 } }, { now: authority.expiresAt + 1 }]) {
    assert.throws(() => authorizeComputerAction(authority, { ...state, ...change }, { kind: "click", x: 0, y: 0 }));
  }
  assert.throws(() => authorizeComputerAction(authority, state, { kind: "click", x: NaN, y: 0 }));
  assert.throws(() => authorizeComputerAction(authority, state, { kind: "type_text", text: "secret", classification: "secret" }));
  assert.throws(() => authorizeComputerAction(authority, state, { kind: "click", x: 0, y: 0, delivery: "foreground" }), /foreground/);
  assert.throws(() => authorizeComputerAction(authority, state, { kind: "launch_app" }), /foreground/);
});
