import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mkdtemp, readdir, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { publishTaskPanelHandoff, readTaskPanelHandoff } from "../src/core/task-progress-launch.js";

test("panel readiness waits for publication identity checks and temporary cleanup before consumption", async (context) => {
  const stateRoot = await mkdtemp(join(realpathSync(tmpdir()), "panel-handoff-order-"));
  context.after(() => rm(stateRoot, { recursive: true, force: true }));
  const id = "a".repeat(32);
  const dir = join(stateRoot, "panel-launches");
  const url = `http://127.0.0.1:12345/#${"b".repeat(43)}`;
  const deadlineAt = Date.now() + 60000;
  let reached!: () => void;
  let release!: () => void;
  const published = new Promise<void>((resolve) => { reached = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  const writer = publishTaskPanelHandoff(stateRoot, id, { url, deadlineAt }, async (stage) => {
    if (stage !== "write:after-rename") return;
    reached();
    await held;
  });
  try {
    await published;
    assert.ok((await readdir(dir)).some((name) => name.endsWith(".tmp")));
    await assert.rejects(readTaskPanelHandoff(stateRoot, id, deadlineAt), { code: "ENOENT" });
  } finally {
    release();
    await writer;
  }
  assert.equal(await readTaskPanelHandoff(stateRoot, id, deadlineAt), url);
  assert.deepEqual((await readdir(dir)).sort(), [`${id}.handoff`, `${id}.ready`]);
  await unlink(join(dir, `${id}.handoff`));
  await rmdir(join(dir, `${id}.ready`));
  assert.deepEqual(await readdir(dir), []);
});

test("panel handoff keeps exact deadline and loopback credential validation after readiness", async (context) => {
  const stateRoot = await mkdtemp(join(realpathSync(tmpdir()), "panel-handoff-validation-"));
  context.after(() => rm(stateRoot, { recursive: true, force: true }));
  const id = "c".repeat(32);
  const deadlineAt = Date.now() + 60000;
  const url = `http://127.0.0.1:12345/#${"d".repeat(43)}`;
  await publishTaskPanelHandoff(stateRoot, id, { url, deadlineAt });
  await assert.rejects(readTaskPanelHandoff(stateRoot, id, deadlineAt + 1), /Invalid observer/u);
  await writeFile(join(stateRoot, "panel-launches", `${id}.handoff`), JSON.stringify({ url: url.replace("127.0.0.1", "example.com"), deadlineAt }));
  await assert.rejects(readTaskPanelHandoff(stateRoot, id, deadlineAt), /Invalid observer/u);
});
