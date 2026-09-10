// Plan 03-03: the host capability ledger.
//
// The ledger is the record everything else in this phase writes to and reads
// from. Three properties are asserted here and nowhere else:
//   1. it fails CLOSED — a file that exists but does not validate is reported
//      unreadable WITH its issues, never absent and never partially trusted;
//   2. the native-use axis resolves independently of deployment and support,
//      and demotes on exactly the inputs 03-CONTEXT.md D-04 names;
//   3. a positive with no negative control is INCOMPLETE, not a pass (D-14).

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  capabilityLedgerPath,
  capabilityLedgerRoot,
  readCapabilityLedger,
  type CapabilityLedger,
  type CapabilityProof,
} from "../src/core/capability-ledger.js";
import { userStateRoot } from "../src/core/paths.js";

const SKILL_HASH = "a".repeat(64);
const EVIDENCE_HASH = "b".repeat(64);
const STDOUT_FINGERPRINT = "c".repeat(64);
const STDERR_FINGERPRINT = "d".repeat(64);

const VALID_POSITIVE: CapabilityProof = {
  projectId: "0123456789abcdef",
  harness: "claude",
  capability: "ecc-skill/security-review",
  polarity: "positive",
  nativeUse: "invoked",
  blockedReason: null,
  boundInputs: { skillSourceHash: SKILL_HASH, mcpServerVersion: "4.0.4", evidenceHash: EVIDENCE_HASH },
  harnessVersion: { exact: "2.1.267", minorKey: "2.1", raw: "2.1.267 (Claude Code)" },
  ancestorFreedom: null,
  observedAt: "2026-09-10T12:00:00.000Z",
  oracle: {
    command: "claude -p --output-format json",
    exitCode: 0,
    stdoutFingerprint: STDOUT_FINGERPRINT,
    stderrFingerprint: STDERR_FINGERPRINT,
  },
};

const VALID_LEDGER: CapabilityLedger = {
  schemaVersion: 1,
  producer: { name: "alpha-aos", version: "0.1.0" },
  updatedAt: "2026-09-10T12:00:00.000Z",
  proofs: [VALID_POSITIVE],
};

async function ledgerFixture(context: { after: (fn: () => Promise<unknown>) => void }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-ledger-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeLedgerBytes(stateRoot: string, text: string): Promise<string> {
  const path = capabilityLedgerPath(stateRoot);
  await mkdir(capabilityLedgerRoot(stateRoot), { recursive: true });
  await writeFile(path, text, "utf8");
  return path;
}

// ---------------------------------------------------------------------------
// Task 1 — the closed schema and a reader that fails closed
// ---------------------------------------------------------------------------

test("the ledger path is under the supplied state root, and the default is the user state root", async (context) => {
  const root = await ledgerFixture(context);
  assert.equal(capabilityLedgerPath(root), join(root, "capabilities", "ledger.json"));
  assert.equal(capabilityLedgerRoot(root), join(root, "capabilities"));
  // Resolving a path performs no I/O, so exercising the default cannot touch
  // the developer's real state root. Only the WRITE path is defaulted-free.
  assert.equal(capabilityLedgerPath().startsWith(userStateRoot()), true);
});

test("a well-formed ledger reads present", async (context) => {
  const root = await ledgerFixture(context);
  const path = await writeLedgerBytes(root, JSON.stringify(VALID_LEDGER, null, 2));

  const read = await readCapabilityLedger(path);
  assert.equal(read.state, "present", JSON.stringify(read));
  if (read.state !== "present") return;
  assert.equal(read.ledger.proofs.length, 1);
  assert.equal(read.ledger.proofs[0]?.harness, "claude");
  assert.equal(read.ledger.proofs[0]?.nativeUse, "invoked");
});

test("a ledger with an unknown top-level property reads unreadable, never absent", async (context) => {
  const root = await ledgerFixture(context);
  const path = await writeLedgerBytes(root, JSON.stringify({ ...VALID_LEDGER, proven: true }, null, 2));

  const read = await readCapabilityLedger(path);
  // The load-bearing half of this assertion is the second one: a ledger this
  // tool refuses to read must never be reported as one that does not exist,
  // because "nothing proven yet" and "something is there and it is wrong" call
  // for different next actions.
  assert.equal(read.state, "unreadable");
  assert.notEqual(read.state, "absent");
  if (read.state !== "unreadable") return;
  assert.equal(read.issues.length > 0, true, "the validation issues must travel with the refusal");
  assert.equal(read.path, path);
  // A schema refusal is not an I/O failure, so no errno is invented for it.
  assert.equal(read.errno, null);
});

test("a ledger whose file is a directory reads unreadable carrying the errno", async (context) => {
  const root = await ledgerFixture(context);
  const path = capabilityLedgerPath(root);
  await mkdir(path, { recursive: true });

  const read = await readCapabilityLedger(path);
  assert.equal(read.state, "unreadable");
  if (read.state !== "unreadable") return;
  // Observed EISDIR on win32 and on POSIX alike; the assertion is kept to the
  // shape rather than the exact code so a platform that reports EPERM or
  // EACCES for the same situation still proves the errno is carried.
  assert.equal(typeof read.errno, "string");
  assert.equal(/^E[A-Z]+$/u.test(read.errno ?? ""), true, `errno was ${String(read.errno)}`);
  assert.equal(read.path, path);
  assert.equal(read.issues[0]?.code, "io.unreadable");
});

test("a missing ledger reads absent", async (context) => {
  const root = await ledgerFixture(context);
  const read = await readCapabilityLedger(capabilityLedgerPath(root));
  assert.equal(read.state, "absent");
});

test("the ledger schema is a closed world with one reused sha256 definition", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../../schemas/capability-ledger.schema.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;

  const defs = schema.$defs as Record<string, unknown> | undefined;
  assert.equal(typeof defs?.sha256, "object", "the sha256 definition must exist once");

  const openObjects: string[] = [];
  const inlineHashPatterns: string[] = [];
  function walk(node: unknown, pointer: string): void {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    const record = node as Record<string, unknown>;
    if (pointer !== "/$defs/sha256" && typeof record.pattern === "string" && record.pattern.includes("{64}")) {
      inlineHashPatterns.push(pointer);
    }
    if (record.properties !== undefined && record.additionalProperties !== false) {
      openObjects.push(pointer === "" ? "/" : pointer);
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "description" || key === "enum" || key === "required") continue;
      walk(value, `${pointer}/${key}`);
    }
  }
  walk(schema, "");

  assert.deepEqual(openObjects, [], `every object level must be closed; open at ${openObjects.join(", ")}`);
  assert.deepEqual(
    inlineHashPatterns,
    [],
    `every hash must reuse $defs/sha256; inline patterns at ${inlineHashPatterns.join(", ")}`,
  );
});

test("the harness enum states why antigravity is unrepresentable", async () => {
  const schema = JSON.parse(
    await readFile(new URL("../../schemas/capability-ledger.schema.json", import.meta.url), "utf8"),
  ) as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const items = properties.proofs?.items as Record<string, Record<string, unknown>>;
  const harness = (items.properties as Record<string, Record<string, unknown>>).harness as Record<string, unknown>;

  assert.deepEqual(harness.enum, ["claude", "codex", "pi", "hermes"]);
  const description = String(harness.description);
  assert.equal(description.includes("antigravity"), true);
  assert.equal(
    /non-interactive entrypoint/u.test(description),
    true,
    "the narrowing must record WHY antigravity is absent, not merely that it is",
  );
});
