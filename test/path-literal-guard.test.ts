import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  ABSOLUTE_PATH_LITERAL,
  formatPathLiteralViolation,
  scanPathLiterals,
  type PathLiteralViolation,
} from "./helpers/path-literal-scan.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");

// Every sample source below is the content of an outer literal that starts
// with a keyword or identifier, so the real-tree scan of this file stays clean.
function lineAndVia(violations: readonly PathLiteralViolation[]): string[] {
  return violations.map((violation) => `${violation.line} ${violation.literal} ${violation.via}`);
}

test("the path-literal scanner flags the pre-fix destinationFor fixture shape", () => {
  const sample = [
    String.raw`const custom = "C:\\test\\custom-root";`,
    String.raw`assert.equal(destinationFor("claude", "my-skill", custom), join(custom, "skills", "my-skill", "SKILL.md"));`,
    String.raw`assert.equal(actual, join("C:\\env\\claude", "skills"));`,
    String.raw`assert.equal(actual, resolve("/home/runner/work"));`,
    String.raw`assert.equal(actual, path.join("/Users/fixture", "skills"));`,
    "assert.equal(actual, dirname(`/tmp/${name}/SKILL.md`));",
  ].join("\n");

  const violations = scanPathLiterals("sample.test.ts", sample);
  assert.deepEqual(lineAndVia(violations), [
    "1 C:\\test\\custom-root binding custom",
    "3 C:\\env\\claude direct host-path argument",
    "4 /home/runner/work direct host-path argument",
    "5 /Users/fixture direct host-path argument",
    "6 /tmp/ direct host-path argument",
  ]);
  assert.equal(
    formatPathLiteralViolation(violations[0]!),
    String.raw`sample.test.ts:1:16 "C:\\test\\custom-root" via binding custom`,
  );
});

test("the path-literal scanner leaves win32/posix-qualified inputs and opaque strings alone", () => {
  const sample = [
    String.raw`path.win32.join("C:\\fixture", "skills");`,
    String.raw`path.posix.join("/home/fixture", "skills");`,
    String.raw`win32.resolve("C:\\fixture");`,
    String.raw`posix.normalize("/Users/fixture/../x");`,
    String.raw`assert.equal(env.HOME, "/home/fixture");`,
    String.raw`const neverJoined = "C:\\Users\\fixture";`,
    String.raw`assert.equal(redact("token at /home/secret"), "token at <redacted>");`,
    String.raw`assert.match(output, /C:\\Users/u);`,
    String.raw`const relativeRoot = join("fixture", "skills");`,
  ].join("\n");

  assert.deepEqual(scanPathLiterals("sample.test.ts", sample), []);
});

test("a path-literal-ok marker exempts only its own line and only with a reason", () => {
  const sample = [
    String.raw`join("C:\\a", "x"); // path-literal-ok: win32 parsing sample`,
    String.raw`join("C:\\b", "x"); // path-literal-ok:`,
    String.raw`// path-literal-ok: a marker above does not count`,
    String.raw`join("C:\\c", "x");`,
    String.raw`join("C:\\d", "x");`,
    String.raw`// path-literal-ok: a marker below does not count`,
    String.raw`join("C:\\e", "x"); // path-literal-ok: ab`,
    String.raw`const markedHome = "/home/marked"; // path-literal-ok: product input sample`,
    String.raw`join(markedHome, "x");`,
    String.raw`const callMarked = "/home/call";`,
    String.raw`join(callMarked, "x"); // path-literal-ok: marker on the call line only`,
  ].join("\n");

  assert.deepEqual(lineAndVia(scanPathLiterals("sample.test.ts", sample)), [
    "2 C:\\b direct host-path argument",
    "4 C:\\c direct host-path argument",
    "5 C:\\d direct host-path argument",
    "7 C:\\e direct host-path argument",
    "10 /home/call binding callMarked",
  ]);
});

test("the path-literal scanner matches POSIX roots on whole path segments only", () => {
  const sample = [
    String.raw`join("/homework/x");`,
    String.raw`join("/home");`,
    String.raw`join("/home/runner");`,
    String.raw`join("/usrlocal/bin");`,
    String.raw`join("/Users");`,
    String.raw`join("D:/dev/alpha-AOS");`,
    String.raw`join("\\\\server\\share");`,
  ].join("\n");

  assert.deepEqual(scanPathLiterals("sample.test.ts", sample).map((violation) => violation.line), [2, 3, 5, 6, 7]);
  assert.equal(ABSOLUTE_PATH_LITERAL.test("/homework/x"), false);
  assert.equal(ABSOLUTE_PATH_LITERAL.test("/home"), true);
  assert.equal(ABSOLUTE_PATH_LITERAL.test("relative/home"), false);
});

test("the path-literal scanner reports nothing for an empty source", () => {
  assert.deepEqual(scanPathLiterals("empty.test.ts", ""), []);
});

test("no test under test/ asserts against a platform-specific absolute path literal", async () => {
  const names = (await readdir(join(repositoryRoot, "test"))).filter((name) => name.endsWith(".ts")).sort();
  assert.ok(names.includes("path-literal-guard.test.ts"), "the guard must scan its own file rather than drop it from the enumeration");
  assert.ok(names.includes("owned-skills.test.ts"), "owned-skills.test.ts must stay inside the enumeration");
  assert.ok(names.length >= 50, `the enumeration found only ${names.length} test sources; refusing a vacuous pass`);

  const violations: PathLiteralViolation[] = [];
  for (const name of names) {
    const text = await readFile(join(repositoryRoot, "test", name), "utf8");
    violations.push(...scanPathLiterals(name, text));
  }

  assert.deepEqual(
    violations,
    [],
    [
      "platform-specific absolute path literals reach a host path call:",
      ...violations.map(formatPathLiteralViolation),
      "Build the root with host path APIs (join(tmpdir(), ...)), or add `// path-literal-ok: <reason>` on the literal's own line.",
    ].join("\n"),
  );
});
