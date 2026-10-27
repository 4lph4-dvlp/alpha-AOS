import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "../..");
interface ReleaseModule {
  runReleaseTests(checkout: string, env: NodeJS.ProcessEnv): void;
}
const release = await import(pathToFileURL(join(repositoryRoot, "scripts", "release.mjs")).href) as ReleaseModule;

async function fixture(context: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), "alpha-release-groups-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "dist", "test"), { recursive: true });
  await copyFile(join(repositoryRoot, "scripts", "run-tests.mjs"), join(root, "scripts", "run-tests.mjs"));
  const events = join(root, "events.jsonl");
  await writeFile(events, "");
  const environment: NodeJS.ProcessEnv = { ...process.env, npm_config_release_fixture: "must-be-scrubbed", INIT_CWD: root };
  // This is an independent node:test subprocess, as in the actual verifier.
  delete environment.NODE_TEST_CONTEXT;
  const body = (name: string, prelude = "") => `const assert = require("node:assert/strict");
const fs = require("node:fs");
require("node:test")(${JSON.stringify(name)}, () => {
  assert.equal(process.env.npm_config_release_fixture, undefined);
  assert.equal(process.env.INIT_CWD, undefined);
  ${prelude}
  fs.appendFileSync(${JSON.stringify(events)}, JSON.stringify(${JSON.stringify(name)}) + "\\n");
});
`;
  const add = (name: string, text: string) => writeFile(join(root, "dist", "test", name), text);
  const rows = async () => (await readFile(events, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as string);
  return { root, events, environment, body, add, rows };
}

test("release groups: execute every discovered ordinary body once, then the packed lifecycle with scrubbed environment", async (context) => {
  const f = await fixture(context);
  for (const name of ["z-extra", "a-first", "middle"]) await f.add(`${name}.test.js`, f.body(name));
  await f.add("ignored.txt", "throw new Error('non-test file executed');");
  await mkdir(join(f.root, "dist", "test", "ignored-directory.test.js"));
  const requireOrdinary = `const rows = fs.readFileSync(${JSON.stringify(f.events)}, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
    assert.deepEqual(rows.slice().sort(), ["a-first", "middle", "z-extra"]);`;
  await f.add("tarball-fixture.test.js", f.body("packed", requireOrdinary));
  release.runReleaseTests(f.root, f.environment);
  const rows = await f.rows();
  assert.deepEqual(rows.slice(0, -1).sort(), ["a-first", "middle", "z-extra"]);
  assert.equal(rows.at(-1), "packed");
  assert.equal(rows.length, 4);
});

test("release groups: empty, missing, ordinary-only, packed-only and non-file packed groups fail before executing bodies", async (context) => {
  for (const scenario of ["empty", "missing", "ordinary-only", "packed-only", "packed-directory"]) {
    const f = await fixture(context);
    if (scenario === "missing") await rm(join(f.root, "dist", "test"), { recursive: true });
    if (scenario === "ordinary-only" || scenario === "packed-directory") await f.add("ordinary.test.js", f.body("ordinary"));
    if (scenario === "packed-only") await f.add("tarball-fixture.test.js", f.body("packed"));
    if (scenario === "packed-directory") await mkdir(join(f.root, "dist", "test", "tarball-fixture.test.js"));
    assert.throws(() => release.runReleaseTests(f.root, f.environment), /compiled test|ordinary|packed|ENOENT/iu, scenario);
    assert.deepEqual(await f.rows(), [], scenario);
  }
});

test("release groups: an actual failing ordinary body prevents packed and all later release actions", async (context) => {
  const f = await fixture(context);
  await f.add("ordinary.test.js", f.body("ordinary", "assert.fail('intentional ordinary fixture failure');"));
  await f.add("tarball-fixture.test.js", f.body("packed"));
  let laterAction = false;
  assert.throws(() => {
    release.runReleaseTests(f.root, f.environment);
    laterAction = true;
  }, /ordinary test group failed/u);
  assert.equal(laterAction, false);
  assert.deepEqual(await f.rows(), []);
});
