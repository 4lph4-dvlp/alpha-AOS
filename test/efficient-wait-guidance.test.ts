import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildGsdControllerPrompt, type GsdQuickOutline } from "../src/core/task-gsd.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("guidance contract: task prompt and owned task skill explicitly discourage sleep/status loops while preserving GSD/native handles", async () => {
  const contract = inventorySummaryContract(repositoryRoot);

  const outline: GsdQuickOutline = {
    sourceSha256: "e".repeat(64),
    stepNames: ["inspect", "plan", "execute"],
  };

  const prompt = buildGsdControllerPrompt({
    contract,
    contractDigest: "d".repeat(64),
    runId: "guidancerun-00000001",
    decisionLogPath: "/tmp/decisions.jsonl",
    outline,
  });

  // Prompt must explicitly discourage model sleep / polling loops
  assert.match(
    prompt,
    /(?:sleep|poll|status.*loop|busy.*wait|delay.*loop)/iu,
    "Generated prompt must explicitly discourage model sleep or polling status loops",
  );

  // Prompt must preserve GSD ownership and native handles / authorization
  assert.match(
    prompt,
    /GSD/u,
    "Generated prompt must preserve GSD workflow spine",
  );
  assert.match(
    prompt,
    /Allowed roots:/u,
    "Generated prompt must preserve strict allowed roots authority",
  );

  // Owned task skill must also explicitly discourage sleep / status loops
  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  assert.ok(existsSync(skillPath), `Owned task skill missing at ${skillPath}`);
  const skillContent = await readFile(skillPath, "utf8");

  assert.match(
    skillContent,
    /(?:sleep|poll|status.*loop|busy.*wait|reactive|wakeup)/iu,
    "Owned task skill must explicitly discourage sleep/polling loops and guide reactive/efficient wait",
  );
  assert.match(
    skillContent,
    /GSD/u,
    "Owned task skill must preserve GSD workflow ownership",
  );
});

test("guidance contract: docs/efficient-wait.md covers five harnesses, truthful start, --apply, and observer expiry semantics", async () => {
  const docPath = join(repositoryRoot, "docs", "efficient-wait.md");
  assert.ok(
    existsSync(docPath),
    `docs/efficient-wait.md must exist (Task 3 documentation deliverable)`,
  );

  const doc = await readFile(docPath, "utf8");

  // Covers all five harnesses
  for (const harness of ["claude", "codex", "antigravity", "pi", "hermes"]) {
    assert.match(
      doc,
      new RegExp(harness, "iu"),
      `docs/efficient-wait.md must cover harness: ${harness}`,
    );
  }

  // Covers modes: ordinary, quick, autopilot
  assert.match(doc, /ordinary/iu, "docs/efficient-wait.md must cover ordinary mode");
  assert.match(doc, /quick/iu, "docs/efficient-wait.md must cover quick mode");
  assert.match(doc, /autopilot/iu, "docs/efficient-wait.md must cover autopilot mode");

  // Exact IDs and truthful foreground task start
  assert.match(doc, /exact/iu, "docs/efficient-wait.md must cover exact IDs");
  assert.match(doc, /truthful|foreground/iu, "docs/efficient-wait.md must cover truthful foreground task start");

  // Explicit --apply and previews for job mutations
  assert.match(doc, /--apply/u, "docs/efficient-wait.md must document explicit --apply requirement");
  assert.match(doc, /preview|dry-run/iu, "docs/efficient-wait.md must document previews for mutations");

  // Observer expiry != cancellation
  assert.match(
    doc,
    /(?:expiry|timeout).*!(?:=|\s*not\s*cancel)|not cancel/iu,
    "docs/efficient-wait.md must clarify observer expiry != cancellation",
  );

  // No zero-token / host wakeup guarantee
  assert.match(
    doc,
    /zero-token|host wakeup/iu,
    "docs/efficient-wait.md must state no zero-token or host wakeup guarantee",
  );
});

test("guidance contract: package and lock root versions match", async () => {
  const pkgPath = join(repositoryRoot, "package.json");
  const lockPath = join(repositoryRoot, "package-lock.json");

  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  assert.match(
    pkg.version,
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u,
    "package.json must declare a valid release version",
  );

  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(
    lock.version,
    pkg.version,
    `package-lock.json root version must match package.json`,
  );
  assert.equal(lock.packages[""].version, pkg.version, "package-lock root package must match package.json");
});

test("guidance contract: BOTH READMEs mention 0.4.0 computer use, 0.4.5 waiting, and unrun platform status", async () => {
  const enReadmePath = join(repositoryRoot, "README.md");
  const koReadmePath = join(repositoryRoot, "README.ko.md");

  assert.ok(existsSync(enReadmePath), "README.md must exist");
  assert.ok(existsSync(koReadmePath), "README.ko.md must exist");

  const en = await readFile(enReadmePath, "utf8");
  const ko = await readFile(koReadmePath, "utf8");

  const readmes: ReadonlyArray<[string, string]> = [
    ["README.md", en],
    ["README.ko.md", ko],
  ];

  for (const [name, content] of readmes) {
    assert.match(
      content,
      /0\.4\.0/u,
      `${name} must mention 0.4.0 computer use`,
    );
    assert.match(
      content,
      /0\.4\.5/u,
      `${name} must mention 0.4.5 waiting release`,
    );
    assert.match(
      content,
      /(?:macOS|Linux).*GUI/iu,
      `${name} must mention macOS/Linux GUI untested/unrun status`,
    );
    assert.match(
      content,
      /3OS CI|CI/iu,
      `${name} must mention CI status`,
    );
  }
});
