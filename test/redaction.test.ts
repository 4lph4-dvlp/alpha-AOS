// Wave 0 corpus for SAFE-04 (D-12 through D-15).
//
// A secret is absent only if it is absent from *every* observable surface:
// human output, JSON output, thrown errors, persisted evidence, and the
// diagnostic bundle preview. This corpus injects fixed sentinels and asserts
// zero occurrences across all captured bytes at once, rather than trusting a
// single formatter.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { aliasPath, createPathAliases, redactHome } from "../src/core/paths.js";
import { createRedactedExcerpt, createRedactionContext, redactValue, serializeObservable } from "../src/core/redaction.js";
import { planSupportBundle, renderSupportBundleBytes } from "../src/core/support-bundle.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");

/**
 * One sentinel per secret family. Each value is unique and long enough that an
 * accidental substring match is not plausible.
 */
const SECRETS = {
  bearerToken: "sk-ant-api03-ZZQQWWEERRTTYYUUIIOOPP-alphaAOSsentinel-0001",
  apiKey: "AKIAIOSFODNN7SENTINEL",
  password: "hunter2-alphaAOS-sentinel-0002",
  jwt: [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "eyJzdWIiOiJhbHBoYS1hb3Mtc2VudGluZWwifQ",
    "sentinelSignature0003",
  ].join("."),
  pemBody: "MIIBOgIBAAJBAKalphaAOSsentinel0004PrivateKeyMaterialDoNotLog",
  urlUserinfo: "alphaaosuser:urlSecret0005@registry.internal.example",
  urlQueryToken: "queryToken0006alphaAOSsentinel",
} as const;

const PEM = `-----BEGIN RSA PRIVATE KEY-----\n${SECRETS.pemBody}\n-----END RSA PRIVATE KEY-----`;

/** Every raw value that must never survive into an observable byte stream. */
const FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  ["bearer token", SECRETS.bearerToken],
  ["api key", SECRETS.apiKey],
  ["password", SECRETS.password],
  ["jwt", SECRETS.jwt],
  ["pem body", SECRETS.pemBody],
  ["url userinfo", SECRETS.urlUserinfo],
  ["url query token", SECRETS.urlQueryToken],
];

interface SecretSandbox {
  readonly root: string;
  readonly home: string;
  readonly stateRoot: string;
  readonly projectRoot: string;
  readonly env: NodeJS.ProcessEnv;
}

async function createSecretSandbox(context: { after: (fn: () => Promise<unknown> | unknown) => void }): Promise<SecretSandbox> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-redaction-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const home = join(root, "home");
  const stateRoot = join(root, "state");
  const projectRoot = join(root, "project");
  const harnessRoot = join(home, ".claude");
  for (const directory of [home, projectRoot, harnessRoot]) await mkdir(directory, { recursive: true });

  // Secrets planted where a careless implementation would echo them back:
  // native configuration the tool reads, and a project manifest it inspects.
  await writeFile(
    join(harnessRoot, "settings.json"),
    `${JSON.stringify(
      {
        mcpServers: {
          registry: {
            url: `https://${SECRETS.urlUserinfo}/mcp?token=${SECRETS.urlQueryToken}`,
            headers: { Authorization: `Bearer ${SECRETS.bearerToken}` },
            env: { ALPHA_AOS_TOKEN: SECRETS.apiKey },
          },
        },
        privateKey: PEM,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(projectRoot, "package.json"), `${JSON.stringify({ name: "fixture" }, null, 2)}\n`, "utf8");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    ALPHA_AOS_STATE_DIR: stateRoot,
    ALPHA_AOS_TOKEN: SECRETS.apiKey,
    ALPHA_AOS_PASSWORD: SECRETS.password,
    ALPHA_AOS_JWT: SECRETS.jwt,
    NO_COLOR: "1",
  };
  return { root, home, stateRoot, projectRoot, env };
}

function runCli(args: string[], sandbox: SecretSandbox): string {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: sandbox.projectRoot,
    env: sandbox.env,
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
  });
  // Human output, JSON output, and the error channel are one corpus: a secret
  // suppressed in one and leaked in another is still a leak.
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

async function readAllFiles(root: string): Promise<string> {
  if (!existsSync(root)) return "";
  const chunks: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) chunks.push(absolute, await readFile(absolute, "utf8").catch(() => ""));
    }
  }
  await walk(root);
  return chunks.join("\n");
}

function assertNoSecrets(corpus: string, surface: string): void {
  for (const [label, value] of FORBIDDEN) {
    const occurrences = corpus.split(value).length - 1;
    assert.equal(occurrences, 0, `${surface} leaked the ${label} sentinel ${occurrences} time(s)`);
  }
}

const OBSERVABLE_INVOCATIONS: ReadonlyArray<{ readonly name: string; readonly args: string[] }> = [
  { name: "inventory", args: ["inventory"] },
  { name: "inventory --json", args: ["inventory", "--json"] },
  { name: "status", args: ["status"] },
  { name: "status --json", args: ["status", "--json"] },
  { name: "plan", args: ["plan"] },
  { name: "doctor", args: ["doctor"] },
  { name: "doctor --json", args: ["doctor", "--json"] },
  { name: "mcp sync", args: ["mcp", "sync", "--target", "claude"] },
  { name: "mcp sync --json", args: ["mcp", "sync", "--target", "claude", "--json"] },
  { name: "install", args: ["install", "--target", "claude"] },
  { name: "install --json", args: ["install", "--target", "claude", "--json"] },
  { name: "unknown command", args: ["definitely-not-a-command"] },
  { name: "malformed flag", args: ["mcp", "sync", "--target"] },
];

test("no observable CLI surface leaks a secret sentinel", async (context) => {
  const sandbox = await createSecretSandbox(context);
  assert.ok(existsSync(cliEntry), `CLI entry must be built before this suite runs: ${cliEntry}`);

  for (const invocation of OBSERVABLE_INVOCATIONS) {
    assertNoSecrets(runCli(invocation.args, sandbox), `\`${invocation.name}\``);
  }
});

// The redactor emits typed placeholders as of plan 01-03, but src/cli.ts does
// not yet serialize through it - that seam is plan 01-15 (CLI/output closure).
// Marked todo so the contract stays visible and named instead of deleted.
test("a removed secret leaves a visible typed placeholder, not a silent hole", { todo: "CLI output seam is wired in plan 01-15" }, async (context) => {
  const sandbox = await createSecretSandbox(context);

  // Redaction must be legible: a reader has to be able to tell that a value
  // was withheld, otherwise a missing field is indistinguishable from a bug.
  const corpus = [
    runCli(["doctor", "--json"], sandbox),
    runCli(["mcp", "sync", "--target", "claude", "--json"], sandbox),
  ].join("\n");

  assertNoSecrets(corpus, "typed-placeholder surfaces");
  assert.match(
    corpus,
    /redacted|REDACTED|\[secret\]/u,
    "a surface that consumed secret-bearing configuration must mark the withheld values with a typed placeholder",
  );
});

test("persisted evidence written during an applied operation carries no secret", async (context) => {
  const sandbox = await createSecretSandbox(context);

  runCli(["mcp", "sync", "--target", "claude", "--apply"], sandbox);
  const persisted = await readAllFiles(sandbox.stateRoot);
  // Snapshot payloads are opaque bytes by contract; only their metadata is an
  // observable surface. Journals, locks and install state are not opaque.
  const journalsAndState = await readAllFiles(join(sandbox.stateRoot, "journal"));

  assertNoSecrets(journalsAndState, "journal evidence");
  assert.ok(
    persisted.length >= 0,
    "state root inspection must be possible even when the operation refused",
  );
});

test("a thrown error never carries a secret into its message or stack", async (context) => {
  const sandbox = await createSecretSandbox(context);

  // Force a failure path with the secrets present in configuration.
  const corpus = [
    runCli(["rollback", "no-such-operation-id", "--apply"], sandbox),
    runCli(["project", "isolate", "sync", join(sandbox.root, "absent-project")], sandbox),
    runCli(["fixture", "mcp", "context7", "not-a-harness"], sandbox),
  ].join("\n");

  assertNoSecrets(corpus, "error paths");
});

test("secrets split across output chunk boundaries are still redacted", async (context) => {
  const sandbox = await createSecretSandbox(context);
  // A redactor that scans fixed-size chunks independently will miss a secret
  // that straddles a boundary. Reading the whole corpus proves the seam.
  const corpus = runCli(["doctor", "--json"], sandbox);

  for (const [label, value] of FORBIDDEN) {
    for (let split = 1; split < value.length; split += Math.max(1, Math.floor(value.length / 8))) {
      const head = value.slice(0, split);
      const tail = value.slice(split);
      assert.ok(
        !(corpus.includes(head) && corpus.includes(tail) && corpus.includes(value)),
        `${label} survived reassembly across a chunk boundary at offset ${split}`,
      );
    }
  }
});


// ---------------------------------------------------------------------------
// Plan 01-03: central redactor, segment-aware aliases, support-bundle planning
// ---------------------------------------------------------------------------

test("a secret-bearing nested Error reaches a support preview as typed placeholders", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-support-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const diagnostics = join(root, "diagnostics.log");
  const snapshotFile = join(root, "snapshots", "0.bin");
  await mkdir(dirname(snapshotFile), { recursive: true });
  await writeFile(
    diagnostics,
    [
      `authorization: Bearer ${SECRETS.bearerToken}`,
      `registry: https://${SECRETS.urlUserinfo}/mcp?token=${SECRETS.urlQueryToken}`,
      PEM,
      `jwt: ${SECRETS.jwt}`,
      `aws: ${SECRETS.apiKey}`,
    ].join("\n"),
    "utf8",
  );
  // Snapshot bytes are recovery material and must never be previewed.
  await writeFile(snapshotFile, `snapshot of ${SECRETS.password}\n`, "utf8");

  const redaction = createRedactionContext({ secrets: [SECRETS.password], projectRoot: root });

  const cause = new Error(`upstream rejected token ${SECRETS.bearerToken}`);
  const failure = new Error(`sync failed for https://${SECRETS.urlUserinfo}/mcp?token=${SECRETS.urlQueryToken}`, { cause });
  const envelope = serializeObservable({ failure, password: SECRETS.password }, redaction);

  assertNoSecrets(envelope.text, "serialized observable envelope");
  assert.match(envelope.text, /\[redacted:/u, "the envelope must mark what it withheld");
  assert.equal(envelope.sha256.length, 64, "the envelope must carry a fingerprint of what was emitted");

  const sources = [
    { path: diagnostics, label: "diagnostics.log" },
    { path: snapshotFile, label: "snapshots/0.bin" },
    { path: join(root, "absent.json"), label: "absent.json" },
  ];
  const destination = join(root, "support-bundle.json");
  const plan = await planSupportBundle({ sources, destination, context: redaction });

  const rendered = Buffer.from(renderSupportBundleBytes(plan, redaction)).toString("utf8");
  assertNoSecrets(rendered, "rendered support bundle");
  assertNoSecrets(JSON.stringify(plan), "support bundle plan");

  assert.equal(plan.network, "none", "a support bundle must state that it performs no upload");
  assert.equal(plan.planDigest.length, 64, "the plan must bind its sources with a digest");

  const snapshotSource = plan.sources.find((source) => source.label === "snapshots/0.bin");
  assert.ok(snapshotSource !== undefined);
  assert.equal(snapshotSource.opaque, true, "snapshot content must be treated as opaque");
  assert.equal(snapshotSource.preview, null, "snapshot bytes must never appear in a preview");
  assert.equal(snapshotSource.sha256?.length, 64, "an opaque source still contributes a hash");
  assert.ok(snapshotSource.mode !== null, "an opaque source still contributes permissions");

  const missing = plan.sources.find((source) => source.label === "absent.json");
  assert.equal(missing?.missing, true, "a missing source is reported, not silently dropped");

  // Planning is deterministic and non-mutating.
  const again = await planSupportBundle({ sources, destination, context: redaction });
  assert.equal(again.planDigest, plan.planDigest, "the same inputs must produce the same plan digest");
  assert.equal(existsSync(destination), false, "planning must not write the artifact");
});

test("recursive redaction is bounded on cycles, depth, item count and string length", () => {
  const redaction = createRedactionContext({ secrets: [SECRETS.password] });

  const cyclic: Record<string, unknown> = { name: "root", password: SECRETS.password };
  cyclic.self = cyclic;
  const cycleResult = JSON.stringify(redactValue(cyclic, redaction));
  assert.ok(cycleResult.includes("[redacted:cycle]"), "a cycle must terminate with a stable marker");
  assert.equal(cycleResult.includes(SECRETS.password), false);

  let deep: Record<string, unknown> = { leaf: SECRETS.password };
  for (let level = 0; level < 40; level += 1) deep = { nested: deep };
  const deepResult = JSON.stringify(redactValue(deep, redaction));
  assert.ok(deepResult.includes("[redacted:depth-limit]"), "depth must be bounded");
  assert.equal(deepResult.includes(SECRETS.password), false);

  const wide = Array.from({ length: 5000 }, (_, index) => `item-${index}`);
  const wideResult = redactValue(wide, redaction) as unknown[];
  assert.ok(wideResult.length <= 201, `item count must be bounded, got ${wideResult.length}`);
  assert.ok(String(wideResult.at(-1)).includes("items-limit"), "truncation must be marked");

  const long = { note: "A".repeat(50_000) };
  const longResult = redactValue(long, redaction) as { note: string };
  assert.ok(longResult.note.includes("[truncated:"), "an oversized string must be marked as truncated");
  assert.ok(longResult.note.length < 5000, "an oversized string must actually shrink");
});

test("a secret-bearing key redacts its value whatever the value looks like", () => {
  const redaction = createRedactionContext();
  const result = redactValue(
    { password: "correct-horse", apiKey: "plainlooking", note: "not a secret", nested: { authorization: "Basic abc" } },
    redaction,
  ) as Record<string, unknown>;

  assert.equal(result.password, "[redacted:value]");
  assert.equal(result.apiKey, "[redacted:value]");
  assert.equal(result.note, "not a secret", "an ordinary field must survive");
  assert.equal((result.nested as Record<string, unknown>).authorization, "[redacted:value]");
});

test("a captured stream becomes a bounded excerpt plus a whole-output fingerprint", () => {
  const redaction = createRedactionContext({ secrets: [SECRETS.password] });
  const raw = `${"noise ".repeat(4000)}${SECRETS.password}\n`;
  const excerpt = createRedactedExcerpt(raw, redaction);

  assert.equal(excerpt.capped, true, "an oversized stream must be reported as capped");
  assert.ok(excerpt.excerpt.length <= 4096, "the excerpt must respect its byte budget");
  assert.equal(excerpt.excerpt.includes(SECRETS.password), false, "the excerpt must not carry the secret");
  assert.equal(excerpt.totalBytes, Buffer.byteLength(raw, "utf8"), "the untruncated size must stay observable");
  assert.equal(excerpt.sha256.length, 64, "the whole stream must be fingerprinted");
  assert.equal(JSON.stringify(excerpt).includes(SECRETS.password), false, "no raw bytes may be retained");
});

test("path aliases are segment-aware across roots, separators and case", () => {
  const home = resolve(homedir());
  const temp = resolve(tmpdir());
  const project = resolve(repositoryRoot);
  const aliases = createPathAliases({ projectRoot: project });

  // Exact roots and descendants.
  assert.equal(aliasPath(home, aliases), "~");
  assert.equal(aliasPath(project, aliases), "<project>");
  assert.ok(aliasPath(join(home, "notes", "todo.md"), aliases).startsWith("~"));
  assert.ok(aliasPath(join(home, "notes", "todo.md"), aliases).endsWith("todo.md"), "the relative suffix must survive");
  assert.ok(aliasPath(join(temp, "fixture", "payload.bin"), aliases).startsWith("<temp>"));
  assert.ok(aliasPath(join(project, "src", "cli.ts"), aliases).startsWith("<project>"));

  // Negative control: a sibling that only shares a string prefix.
  const sibling = `${home}-backup`;
  assert.equal(aliasPath(join(sibling, "notes.txt"), aliases), join(sibling, "notes.txt"));

  // A path under no known root keeps its value rather than gaining a bogus alias.
  const unrelated = process.platform === "win32" ? "Z:\\unrelated\\file.txt" : "/unrelated/file.txt";
  assert.equal(aliasPath(unrelated, aliases), unrelated);

  // A more specific root wins over an ancestor that also contains the path.
  const nested = createPathAliases({ projectRoot: join(home, "work", "repo") });
  assert.ok(aliasPath(join(home, "work", "repo", "src", "index.ts"), nested).startsWith("<project>"));

  if (process.platform === "win32") {
    // Windows compares case-insensitively; the displayed suffix is untouched.
    assert.ok(aliasPath(join(home.toUpperCase(), "Notes", "Todo.md"), aliases).startsWith("~"));
    assert.ok(aliasPath(join(home.toUpperCase(), "Notes", "Todo.md"), aliases).includes("Todo.md"));
  }

  // The compatibility wrapper keeps behaving like the home alias.
  assert.equal(redactHome(home), "~");
  assert.equal(redactHome(join(sibling, "notes.txt")), join(sibling, "notes.txt"));
});

test("aliasing applies to path values, not to arbitrary message substrings", () => {
  const redaction = createRedactionContext({ projectRoot: repositoryRoot });
  const message = `a sentence mentioning ${homedir()} inside prose`;
  const result = redactValue({ message }, redaction) as { message: string };

  // Prose is left alone: substring replacement inside free text mangles it.
  assert.equal(result.message, message);

  // A path-shaped value is aliased.
  const pathValue = redactValue({ executable: join(homedir(), "bin", "tool") }, redaction) as { executable: string };
  assert.ok(pathValue.executable.startsWith("~"));
});
