import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { commandProbeEnvironment, runProcess } from "../src/core/process.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("build artifact: real checker verifies all input/output batches and preserves ordered diagnostics", async (context) => {
  const base = await mkdtemp(join(tmpdir(), "alpha-artifact-batches-"));
  context.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(join(base, "scripts"));
  await mkdir(join(base, "src"));
  await mkdir(join(base, "dist"));
  const script = join(base, "scripts", "build-artifact.mjs");
  await cp(join(repositoryRoot, "scripts", "build-artifact.mjs"), script);
  const manifest = { schemaVersion: 1, inputs: {} as Record<string, string>, outputs: {} as Record<string, string> };
  for (const group of ["inputs", "outputs"] as const) {
    for (let index = 0; index < 17; index++) {
      const name = group === "inputs" ? `src/input-${String(index).padStart(2, "0")}.ts` : `dist/output-${String(index).padStart(2, "0")}.js`;
      const body = `fixture ${group} ${index}\n`;
      await writeFile(join(base, name), body, "utf8");
      manifest[group][name] = createHash("sha256").update(body).digest("hex");
    }
  }
  await writeFile(join(base, "dist", "build-artifact.json"), JSON.stringify(manifest), "utf8");
  const check = () => runProcess({
    executable: process.execPath, args: [script, "check"], cwd: base,
    environment: commandProbeEnvironment({ source: process.env }), timeoutMs: 10_000,
    maxOutputBytes: 16 * 1024, excerptBytes: 16 * 1024,
  });
  const valid = await check();
  assert.equal(valid.code, "ok", valid.stderr.excerpt);
  assert.equal(valid.stdout.excerpt.trim(), "build artifact verified: 17 inputs, 17 outputs");
  for (const name of ["src/input-00.ts", "src/input-16.ts", "dist/output-00.js", "dist/output-16.js"]) {
    await writeFile(join(base, name), "changed bytes", "utf8");
  }
  await unlink(join(base, "src", "input-08.ts"));
  const drift = await check();
  assert.equal(drift.exitCode, 3, drift.stderr.excerpt);
  assert.equal(drift.outputCapped, false);
  assert.match(drift.stderr.excerpt, /\(5 difference\(s\)\)/u);
  let last = -1;
  for (const expected of ["changed input: src/input-00.ts", "missing input: src/input-08.ts", "changed input: src/input-16.ts", "changed output: dist/output-00.js", "changed output: dist/output-16.js"]) {
    const position = drift.stderr.excerpt.indexOf(expected);
    assert.ok(position > last, `missing or reordered diagnostic: ${expected}`);
    last = position;
  }
});
