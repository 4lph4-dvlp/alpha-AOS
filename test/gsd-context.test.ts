import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readGsdContext } from "../src/core/gsd-context.js";

async function fixture(t: { after: (fn: () => Promise<unknown>) => void }, content: string) {
  const configRoot = await mkdtemp(join(tmpdir(), "alpha-aos-context-"));
  t.after(() => rm(configRoot, { recursive: true, force: true }));
  const root = join(configRoot, "gsd-core", "workflows");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "execute-phase.md"), content);
  return { configRoot };
}

test("GSD outline names preamble and all steps; reads preserve instructions and hash source bytes", async (t) => {
  const options = await fixture(t, 'Required preamble\n<step name="init">\nGate A\n</step>\n<step name="verify">\nGate B\n</step>');
  const outline = await readGsdContext("execute-phase", options);
  assert.equal(outline.mode, "outline");
  if (outline.mode !== "outline") return;
  assert.deepEqual(outline.preamble, { from: 1, to: 1 });
  assert.deepEqual(outline.steps.map((step) => step.name), ["init", "verify"]);
  const read = await readGsdContext("execute-phase", { ...options, step: "verify" });
  assert.equal(read.mode, "content");
  if (read.mode !== "content") return;
  assert.equal(read.content, '<step name="verify">\nGate B\n</step>');
  assert.equal(read.sourceSha256, outline.sourceSha256);
  await writeFile(join(options.configRoot, "gsd-core/workflows/execute-phase.md"), '<step name="verify">\nChanged');
  assert.notEqual((await readGsdContext("execute-phase", options)).sourceSha256, read.sourceSha256);
});

test("GSD context requires explicit smaller ranges instead of silently truncating a large step", async (t) => {
  const options = await fixture(t, '<step name="large">\n' + "x".repeat(150) + "\n" + ("y".repeat(150) + "\n").repeat(100));
  const read = await readGsdContext("execute-phase", { ...options, step: "large" });
  assert.equal(read.mode, "range-required");
  assert.equal("content" in read, false);
  assert.equal((await readGsdContext("execute-phase", { ...options, from: 2, lines: 1 })).mode, "content");
});

test("GSD context refuses traversal, ambiguous steps and invalid range combinations", async (t) => {
  const options = await fixture(t, '<step name="same">\n<step name="same">');
  await assert.rejects(readGsdContext("../secret", options));
  await assert.rejects(readGsdContext("execute-phase", { ...options, step: "same" }));
  await assert.rejects(readGsdContext("execute-phase", { ...options, from: 0 }));
  await assert.rejects(readGsdContext("execute-phase", { ...options, from: 1, lines: 201 }));
  await assert.rejects(readGsdContext("execute-phase", { ...options, lines: 2 }));
  await assert.rejects(readGsdContext("execute-phase", { ...options, step: "same", from: 1 }));
});
