import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ComputerAudit, verifyComputerAudit } from "../src/core/computer-use-audit.js";

export const pngFixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");
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
