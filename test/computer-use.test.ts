import test from "node:test";
import assert from "node:assert/strict";
import { ComputerSession, stopComputerSession } from "../src/core/computer-use.js";
import type { ComputerUseTransport } from "../src/core/computer-use.js";
import { verifyComputerAudit } from "../src/core/computer-use-audit.js";
import { validateComputerAuthority } from "../src/core/computer-use-policy.js";
import { authorityFixture, pngFixture } from "./fixtures/computer-use.js";
import { mkdtemp, rm, readFile, writeFile, unlink } from "node:fs/promises";
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
  try {
    assert.throws(() => { session.authority.permissions.foreground = true; }, TypeError);
    assert.equal(Reflect.set(session, "authority", { ...a, permissions: { ...a.permissions, foreground: true } }), false);
    assert.throws(() => Object.defineProperty(session, "authority", { value: a }), TypeError);
  }
  finally { await session.close(); await rm(root, { recursive: true, force: true }); }
});

for (const corruption of ["rewrite", "truncate", "append", "capture"]) {
  test(`active ${corruption} tampering revokes the broker before another effect`, async () => {
    const root = await mkdtemp(join(tmpdir(), "computer-active-audit-")); const a = validateComputerAuthority(authorityFixture()); let effects = 0; let reads = 0;
    const session = await ComputerSession.open(a, { identity: a.runtime, observe: async () => ({ target: a.target, captureId: String(++reads), png: pngFixture, width: 1, height: 1, state: String(effects), safe: true, foreground: false }), dispatch: async () => { effects++; }, close: async () => {} }, root);
    try {
      await session.action({ kind: "click", x: 0, y: 0 }, { equals: "1" });
      const path = join(root, a.runId, "events.jsonl"); const bytes = await readFile(path, "utf8");
      if (corruption === "rewrite") await writeFile(path, bytes.replace("verified", "tampered"));
      if (corruption === "truncate") await writeFile(path, bytes.slice(0, -1));
      if (corruption === "append") await writeFile(path, bytes + "{}\n");
      if (corruption === "capture") { const event = JSON.parse(bytes.split("\n")[0]!); await writeFile(join(root, a.runId, `${event.data.before.hash}.png`), "corrupt"); }
      await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { equals: "2" }));
      assert.equal(effects, 1);
      await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { equals: "2" })); assert.equal(effects, 1);
    } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test("lost native response plus failed audit result still permanently revokes input", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-uncertain-audit-")); const a = validateComputerAuthority(authorityFixture()); let effects = 0; let closed = 0; let reads = 0;
  const session = await ComputerSession.open(a, { identity: a.runtime, observe: async () => ({ target: a.target, captureId: String(++reads), png: pngFixture, width: 1, height: 1, state: String(effects), safe: true, foreground: false }), dispatch: async () => { effects++; throw new Error("lost response"); }, close: async () => { closed++; } }, root);
  const append = session.audit.append.bind(session.audit);
  try {
    session.audit.append = async (kind, data) => { if (kind === "result") throw new Error("storage failed"); return append(kind, data); };
    await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { changed: true })); assert.ok(closed > 0);
    session.audit.append = append;
    await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { changed: true })); assert.equal(effects, 1);
    assert.equal((await verifyComputerAudit(root, a.runId, await session.audit.checkpoint())).pending.length, 1);
  } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
});

for (const failure of ["unsafe", "target", "runtime", "audit", "unchanged", "dispatch-failure", "stale"]) {
  test(`broker ${failure} cannot become verified delivery`, async () => {
    const root = await mkdtemp(join(tmpdir(), "computer-adversarial-")); const a = validateComputerAuthority(authorityFixture()); let effects = 0; let observations = 0;
    const transport: ComputerUseTransport = { identity: a.runtime,
      observe: async () => ({ target: failure === "target" ? { ...a.target, pid: 43 } : a.target, captureId: failure === "stale" ? "stale" : String(++observations), png: pngFixture, width: 1, height: 1, state: "unchanged", safe: failure !== "unsafe", foreground: false }),
      dispatch: async () => { effects++; if (failure === "dispatch-failure") throw new Error("lost response"); }, close: async () => {} };
    const session = await ComputerSession.open(a, transport, root);
    try {
      if (failure === "runtime") transport.identity.schemaHash = "e".repeat(64);
      if (failure === "audit") await unlink(join(root, a.runId, "events.jsonl"));
      if (failure === "unchanged") assert.equal((await session.action({ kind: "click", x: 0, y: 0 }, { changed: true })).outcome, "not-verified");
      else await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { changed: true }));
      assert.equal(effects, ["unchanged", "dispatch-failure", "stale"].includes(failure) ? 1 : 0);
      if (failure === "dispatch-failure") {
        const evidence = await verifyComputerAudit(root, a.runId, await session.audit.checkpoint());
        assert.equal(evidence.events.at(-1)?.data.outcome, "unknown");
        assert.ok(!(await readFile(join(root, a.runId, "events.jsonl"), "utf8")).includes("lost response"));
      }
    } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
  });
}

test("out-of-band persistent stop interrupts in-flight input without retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-stop-")); const a = validateComputerAuthority(authorityFixture()); let effects = 0; let observation = 0; let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const session = await ComputerSession.open(a, { identity: a.runtime, observe: async () => ({ target: a.target, captureId: String(++observation), png: pngFixture, width: 1, height: 1, state: "before", safe: true, foreground: false }),
    dispatch: async () => { effects++; entered(); await new Promise<void>(() => {}); }, close: async () => {} }, root);
  try {
    const action = session.action({ kind: "click", x: 0, y: 0 }, { changed: true });
    await started; await stopComputerSession(root, a.runId); await assert.rejects(action, /interrupted/);
    await assert.rejects(session.action({ kind: "click", x: 0, y: 0 }, { changed: true })); assert.equal(effects, 1);
    assert.equal((await verifyComputerAudit(root, a.runId, await session.audit.checkpoint())).events.at(-1)?.data.outcome, "interrupted");
  } finally { await session.close(); await rm(root, { recursive: true, force: true }); }
});
