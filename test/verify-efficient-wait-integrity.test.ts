import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const verifierScript = join(repositoryRoot, "scripts", "verify-efficient-wait.mjs");

type Mutation = "none" | "same-path-replacement" | "product-output" | "product-and-manifest";

// Copied-script parser/integrity mechanics, not substitutes for the controller's
// actual completion/safety/integration production selections.
async function runIntegrityFixture(mutation: Mutation) {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-verifier-integrity-"));
  const marker = join(root, "executed-bodies.txt");
  try {
    await mkdir(join(root, "scripts"), { recursive: true });
    await mkdir(join(root, "dist", "src"), { recursive: true });
    for (const name of ["verify-efficient-wait.mjs", "efficient-wait-reporter.mjs", "build-artifact.mjs", "run-tests.mjs"]) {
      await cp(join(repositoryRoot, "scripts", name), join(root, "scripts", name));
    }
    await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
    const product = join(root, "dist", "src", "product.js");
    await writeFile(product, "ORIGINAL\n");
    const module = await import(pathToFileURL(verifierScript).href);
    const required = module.REQUIRED_TESTS.completion as { name: string; suite: string }[];
    const suites = new Map<string, string[]>();
    for (const [index, requirement] of required.entries()) {
      let body = `assert.equal(1, 1); appendFileSync(${JSON.stringify(marker)}, "body\\n");`;
      if (index === required.length - 1) {
        if (mutation === "same-path-replacement") {
          const suite = join(root, requirement.suite);
          body += `renameSync(${JSON.stringify(suite)}, ${JSON.stringify(suite + ".prior")}); writeFileSync(${JSON.stringify(suite)}, "// replaced tested artifact\\n");`;
        } else if (mutation === "product-output" || mutation === "product-and-manifest") {
          body += `assert.equal(readFileSync(${JSON.stringify(product)}, "utf8"), "ORIGINAL\\n"); writeFileSync(${JSON.stringify(product)}, "CHANGED\\n");`;
          if (mutation === "product-and-manifest") {
            body += `const refreshed = spawnSync(process.execPath, [${JSON.stringify(join(root, "scripts", "build-artifact.mjs"))}, "write"], { encoding: "utf8", timeout: 3000 }); assert.equal(refreshed.status, 0, refreshed.stderr);`;
          }
        }
      }
      const bodies = suites.get(requirement.suite) ?? [];
      bodies.push(`test(${JSON.stringify(requirement.name)}, () => { ${body} });`);
      suites.set(requirement.suite, bodies);
    }
    for (const [suite, bodies] of suites) {
      await mkdir(dirname(join(root, suite)), { recursive: true });
      await writeFile(join(root, suite),
        `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { appendFileSync, readFileSync, renameSync, writeFileSync } from "node:fs";\nimport { spawnSync } from "node:child_process";\n${bodies.join("\n")}\n`);
    }
    const manifest = spawnSync(process.execPath, [join(root, "scripts", "build-artifact.mjs"), "write"], {
      cwd: root, encoding: "utf8", timeout: 3000,
    });
    assert.equal(manifest.status, 0, manifest.stderr);
    const result = spawnSync(process.execPath, [join(root, "scripts", "verify-efficient-wait.mjs")], {
      cwd: root,
      input: JSON.stringify({ check: "completion" }),
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(result.error, undefined);
    const executed = (await readFile(marker, "utf8")).trimEnd().split("\n");
    assert.equal(executed.length, required.length, "every required named body must actually run before the integrity decision");
    assert.ok(executed.every((line) => line === "body"));
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("verify-efficient-wait integrity: stable copied parser fixture remains successful", async () => {
  const result = await runIntegrityFixture("none");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, JSON.stringify({ ok: true, check: "completion" }) + "\n");
});

test("verify-efficient-wait integrity: same-path replacement refuses despite all required passing leaves", async () => {
  const result = await runIntegrityFixture("same-path-replacement");
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.includes('"ok":true'), false);
  assert.match(result.stderr, /physical identity or bytes changed|post-test component recheck/iu);
});

test("verify-efficient-wait integrity: product output mutation refuses despite all required passing leaves", async () => {
  const result = await runIntegrityFixture("product-output");
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.includes('"ok":true'), false);
  assert.match(result.stderr, /post-test build artifact check failed/iu);
});

test("verify-efficient-wait integrity: child cannot rewrite manifest to bless changed product output", async () => {
  const result = await runIntegrityFixture("product-and-manifest");
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.includes('"ok":true'), false);
  assert.match(result.stderr, /build-artifact\.json.*post-test component recheck|physical identity or bytes changed/iu);
});
