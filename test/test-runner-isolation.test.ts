import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { commandProbeEnvironment, runProcess } from "../src/core/process.js";

test("test runner retains every file once and isolates Windows native suites before the packed gate", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-runner-isolation-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "dist", "test"), { recursive: true });
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  await copyFile(join(repo, "scripts", "run-tests.mjs"), join(root, "scripts", "run-tests.mjs"));
  const names = ["ordinary.test.js", "command-jobs.test.js", "process.test.js", "tarball-fixture.test.js"];
  for (const name of names) {
    await writeFile(join(root, "dist", "test", name), `
      const test = require('node:test');
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const path = require('node:path');
      test(${JSON.stringify(name)}, async () => {
        const active = path.join(process.cwd(), 'native-active');
        const journal = path.join(process.cwd(), 'observed.jsonl');
        const name = ${JSON.stringify(name)};
        const native = name === 'command-jobs.test.js' || name === 'process.test.js';
        if (native && process.platform === 'win32') {
          assert.ok(fs.existsSync(path.join(process.cwd(), 'ordinary-done')));
          fs.writeFileSync(active, name, { flag: 'wx' });
          await new Promise(resolve => setTimeout(resolve, 30));
          fs.unlinkSync(active);
        }
        if (name === 'tarball-fixture.test.js') {
          assert.equal(fs.readFileSync(journal, 'utf8').trim().split('\\n').length, 3);
          assert.equal(fs.existsSync(active), false);
        }
        fs.appendFileSync(journal, JSON.stringify(name) + '\\n');
        if (name === 'ordinary.test.js') fs.writeFileSync(path.join(process.cwd(), 'ordinary-done'), 'done');
      });
    `);
  }
  const result = await runProcess({ executable: process.execPath, args: [join(root, "scripts", "run-tests.mjs")],
    cwd: root, environment: commandProbeEnvironment({ source: process.env }), timeoutMs: 30000 });
  assert.equal(result.exitCode, 0, result.stderr.excerpt + result.stdout.excerpt);
  const observed = (await readFile(join(root, "observed.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual([...observed].sort(), [...names].sort());
  assert.equal(observed.at(-1), "tarball-fixture.test.js");
});
