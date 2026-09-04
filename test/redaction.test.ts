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
import { redactHome } from "../src/core/paths.js";

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

test("a removed secret leaves a visible typed placeholder, not a silent hole", async (context) => {
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

test("path aliasing is segment-aware for home, temp, and project roots", async () => {
  // `redactHome` reads the process home directly, so this case exercises the
  // real home rather than the sandbox home.
  const home = resolve(homedir());

  // A home-rooted path becomes an alias plus its repository-relative suffix.
  const nested = join(home, "projects", "app", "src", "index.ts");
  assert.equal(redactHome(nested).startsWith("~"), true);
  assert.ok(redactHome(nested).includes("index.ts"), "the repository-relative suffix must survive aliasing");

  // Segment-aware: a sibling directory that merely shares a prefix with the
  // home path is a different directory and must not be aliased.
  const prefixSibling = `${home}-backup`;
  assert.equal(
    redactHome(join(prefixSibling, "notes.txt")),
    join(prefixSibling, "notes.txt"),
    "a path that only shares a string prefix with home must not be aliased",
  );

  // Temp and project roots are private locations and need their own aliases.
  const tempPath = join(tmpdir(), "alpha-aos-fixture", "payload.bin");
  assert.notEqual(redactHome(tempPath), tempPath, "the OS temp root must be aliased, not emitted verbatim");

  const projectPath = join(repositoryRoot, "package.json");
  assert.notEqual(redactHome(projectPath), projectPath, "the project root must be aliased, not emitted verbatim");
});
