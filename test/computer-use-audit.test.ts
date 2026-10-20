import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, unlink, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ComputerAudit, verifyComputerAudit, expireComputerCaptures } from "../src/core/computer-use-audit.js";

import { pngFixture } from "./fixtures/computer-use.js";
test("immutable PNG audit validates retained anchor and rejects tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-audit-"));
  try {
    const audit = await ComputerAudit.open(root, "test-run");
    const capture = await audit.capture(pngFixture, 1, 1);
    await audit.append("intent", { capture, actionDigest: "a".repeat(64) });
    await audit.append("result", { intent: 1, outcome: "verified", capture });
    const anchor = await audit.checkpoint();
    await audit.close();
    assert.equal((await verifyComputerAudit(root, "test-run", anchor)).events.length, 2);
    const path = join(root, "test-run", "events.jsonl");
    await writeFile(path, (await readFile(path, "utf8")).replace("verified", "tampered"));
    await assert.rejects(verifyComputerAudit(root, "test-run", anchor), /hash|integrity/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const corruption of ["reverse", "duplicate", "truncate", "missing-blob", "wrong-anchor"]) {
  test(`audit rejects ${corruption}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "computer-audit-"));
    try {
      const audit = await ComputerAudit.open(root, "check"); const capture = await audit.capture(pngFixture, 1, 1);
      await audit.append("intent", { capture }); await audit.append("result", { intent: 1, outcome: "verified", capture }); const anchor = await audit.checkpoint(); await audit.close();
      const path = join(root, "check", "events.jsonl"); const bytes = await readFile(path, "utf8"); const lines = bytes.trimEnd().split("\n");
      if (corruption === "reverse") await writeFile(path, lines.reverse().join("\n") + "\n");
      if (corruption === "duplicate") await writeFile(path, bytes + lines[0] + "\n");
      if (corruption === "truncate") await writeFile(path, bytes.slice(0, -1));
      if (corruption === "missing-blob") await unlink(join(root, "check", `${capture.hash}.png`));
      await assert.rejects(verifyComputerAudit(root, "check", corruption === "wrong-anchor" ? { ...anchor, hash: "a".repeat(64) } : anchor));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test("audit excludes concurrent writers and rejects corrupt PNG before writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-audit-"));
  const audit = await ComputerAudit.open(root, "check");
  try { await assert.rejects(ComputerAudit.open(root, "check")); await assert.rejects(audit.capture(Buffer.from("not-png"), 1, 1)); }
  finally { await audit.close(); await rm(root, { recursive: true, force: true }); }
});

test("reviewed retention writes tombstones and replay distinguishes expired blobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-retention-"));
  try {
    const audit = await ComputerAudit.open(root, "check"); const capture = await audit.capture(pngFixture, 1, 1);
    await audit.append("intent", { capture }); await audit.append("result", { intent: 1, outcome: "verified", capture }); const anchor = await audit.checkpoint(); await audit.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await assert.rejects(expireComputerCaptures(root, "check", anchor, { reviewed: false, olderThan: Date.now() }));
    const retained = await expireComputerCaptures(root, "check", anchor, { reviewed: true, olderThan: Date.now() });
    assert.deepEqual((await verifyComputerAudit(root, "check", retained)).expired, [capture.hash]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
