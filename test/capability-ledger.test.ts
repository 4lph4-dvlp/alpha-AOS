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
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  capabilityLedgerPath,
  capabilityLedgerRoot,
  capabilityStatusJson,
  harnessMinorKey,
  pairEvidence,
  readCapabilityLedger,
  resolveCapabilityStatus,
  resolveNativeUse,
  writeCapabilityLedger,
  type CapabilityLedger,
  type CapabilityProof,
  type CurrentInputs,
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

const INFERENCE_NOTE = {
  kind: "inference" as const,
  statement: "The capability cannot be invoked outside the project.",
  basis: "INFERRED from the paired control that did not list the capability.",
};

test("a proof claim note survives the transactional write-then-read path", async (context) => {
  const stateRoot = await ledgerFixture(context);
  const proof = { ...VALID_POSITIVE, claimNotes: [INFERENCE_NOTE] };
  const written = await writeCapabilityLedger({ stateRoot, ledger: { ...VALID_LEDGER, proofs: [proof] } });
  assert.equal(written.status, "written");
  const read = await readCapabilityLedger(written.path);
  assert.equal(read.state, "present");
  if (read.state === "present") assert.deepEqual(read.ledger.proofs, [proof]);
});

test("a proof without claim notes round-trips with the property absent rather than empty", async (context) => {
  const stateRoot = await ledgerFixture(context);
  const written = await writeCapabilityLedger({ stateRoot, ledger: VALID_LEDGER });
  const read = await readCapabilityLedger(written.path);
  assert.equal(read.state, "present");
  if (read.state !== "present") return;
  assert.deepEqual(read.ledger.proofs, VALID_LEDGER.proofs);
  assert.equal(Object.hasOwn(read.ledger.proofs[0]!, "claimNotes"), false);
});

for (const [name, note] of [
  ["an unknown claim-note key", { ...INFERENCE_NOTE, value: "forbidden" }],
  ["a claim-note kind outside the two declared values", { ...INFERENCE_NOTE, kind: "proof" }],
  ["an empty claim-note basis", { ...INFERENCE_NOTE, basis: "" }],
] as const) {
  test(`${name} is refused by the closed ledger schema`, async (context) => {
    const root = await ledgerFixture(context);
    const path = await writeLedgerBytes(root, JSON.stringify({ ...VALID_LEDGER, proofs: [{ ...VALID_POSITIVE, claimNotes: [note] }] }));
    assert.equal((await readCapabilityLedger(path)).state, "unreadable");
  });
}

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

// ---------------------------------------------------------------------------
// Task 2 — three independent axes, the demotion binding, the version parsers
// ---------------------------------------------------------------------------

/** The current values a stored proof is re-resolved against on every read. */
const CURRENT_MATCH: CurrentInputs = {
  skillSourceHash: SKILL_HASH,
  mcpServerVersion: "4.0.4",
  evidenceHash: EVIDENCE_HASH,
  harnessVersion: "2.1.267 (Claude Code)",
};

test("the three axes are independently settable and every export exposes all three", () => {
  const status = resolveCapabilityStatus({
    capability: VALID_POSITIVE.capability,
    harness: "claude",
    deployment: "CURRENT",
    support: "supported",
    proof: VALID_POSITIVE,
    current: CURRENT_MATCH,
  });

  assert.deepEqual(Object.keys(status.axes).sort(), ["deployment", "nativeUse", "support"]);
  assert.equal(status.axes.deployment, "CURRENT");
  assert.equal(status.axes.support, "supported");
  assert.equal(status.axes.nativeUse, "invoked");

  // Independence: moving the deployment and support axes leaves the native-use
  // axis exactly where the evidence put it. A single eight-value enum could not
  // express this pairing at all, which is the collapse D-11 forbids.
  const moved = resolveCapabilityStatus({
    capability: VALID_POSITIVE.capability,
    harness: "claude",
    deployment: "STALE",
    support: "unverified",
    proof: VALID_POSITIVE,
    current: CURRENT_MATCH,
  });
  assert.equal(moved.axes.deployment, "STALE");
  assert.equal(moved.axes.support, "unverified");
  assert.equal(moved.axes.nativeUse, "invoked");

  const json = capabilityStatusJson(status);
  assert.deepEqual(Object.keys(json.axes).sort(), ["deployment", "nativeUse", "support"]);

  // There is no code path that yields a capability state without all three: a
  // caller that omits an axis is refused rather than silently given a default.
  assert.throws(
    () =>
      resolveCapabilityStatus({
        capability: VALID_POSITIVE.capability,
        harness: "claude",
        deployment: "CURRENT",
        proof: VALID_POSITIVE,
        current: CURRENT_MATCH,
      } as unknown as Parameters<typeof resolveCapabilityStatus>[0]),
    /support/u,
  );
});

test("a moved skill source hash demotes the proof and the reason names the skill source hash", () => {
  const resolution = resolveNativeUse(VALID_POSITIVE, { ...CURRENT_MATCH, skillSourceHash: "e".repeat(64) });

  assert.equal(resolution.nativeUse, "unverified");
  assert.equal(resolution.demoted, true);
  assert.deepEqual(
    resolution.reasons.map((reason) => reason.noun),
    ["skillSourceHash"],
  );
  assert.equal(resolution.reasons[0]?.code, "SKILL_SOURCE_HASH_MOVED");
  assert.match(resolution.reasons[0]?.sentence ?? "", /skill source hash/u);
});

test("a moved MCP server version demotes the proof and the reason names the MCP server version", () => {
  const resolution = resolveNativeUse(VALID_POSITIVE, { ...CURRENT_MATCH, mcpServerVersion: "4.1.0" });

  assert.equal(resolution.nativeUse, "unverified");
  assert.deepEqual(
    resolution.reasons.map((reason) => reason.noun),
    ["mcpServerVersion"],
  );
  assert.equal(resolution.reasons[0]?.code, "MCP_SERVER_VERSION_MOVED");
  assert.match(resolution.reasons[0]?.sentence ?? "", /MCP server version/u);
  // Each bound noun demotes on its own, so a reader can tell a moved server
  // from a moved skill without diffing two records.
  assert.doesNotMatch(resolution.reasons[0]?.sentence ?? "", /skill source hash/u);
});

test("a moved pack evidence hash demotes the proof and the reason names the pack evidence hash", () => {
  const resolution = resolveNativeUse(VALID_POSITIVE, { ...CURRENT_MATCH, evidenceHash: "f".repeat(64) });

  assert.equal(resolution.nativeUse, "unverified");
  assert.deepEqual(
    resolution.reasons.map((reason) => reason.noun),
    ["evidenceHash"],
  );
  assert.equal(resolution.reasons[0]?.code, "PACK_EVIDENCE_HASH_MOVED");
  assert.match(resolution.reasons[0]?.sentence ?? "", /pack evidence hash/u);
});

test("current information that is absent is not a match, and the reason names what could not be compared", () => {
  const resolution = resolveNativeUse(VALID_POSITIVE, { ...CURRENT_MATCH, skillSourceHash: null });

  assert.equal(resolution.nativeUse, "unverified");
  assert.equal(resolution.reasons[0]?.code, "BOUND_INPUT_NOT_COMPARABLE");
  assert.equal(resolution.reasons[0]?.noun, "skillSourceHash");
  assert.match(resolution.reasons[0]?.sentence ?? "", /skill source hash/u);
});

test("a harness patch bump does not demote and a minor bump does, with the proven version still readable", () => {
  const patched = resolveNativeUse(VALID_POSITIVE, { ...CURRENT_MATCH, harnessVersion: "2.1.301 (Claude Code)" });
  const minorBumped = resolveNativeUse(VALID_POSITIVE, { ...CURRENT_MATCH, harnessVersion: "2.2.0 (Claude Code)" });

  // The pair is asserted together on purpose: a rule that demoted on every
  // version change would pass the second assertion alone while leaving the
  // ledger permanently red, which is the outcome D-04 rules out.
  assert.equal(patched.demoted, false);
  assert.equal(patched.nativeUse, "invoked");
  assert.equal(minorBumped.demoted, true);
  assert.equal(minorBumped.nativeUse, "unverified");
  assert.equal(minorBumped.reasons[0]?.code, "HARNESS_MINOR_MOVED");
  assert.match(minorBumped.reasons[0]?.sentence ?? "", /harness version/u);

  // The exact version that was proven survives the demotion, so an audit can
  // still see what the proof was taken against.
  assert.equal(minorBumped.provenHarnessVersion.exact, "2.1.267");
  assert.equal(minorBumped.provenHarnessVersion.minorKey, "2.1");
  assert.equal(minorBumped.provenHarnessVersion.raw, "2.1.267 (Claude Code)");
});

test("the four observed harness version strings parse to their recorded minor keys", () => {
  // The four strings and their minor keys are 03-RESEARCH.md Pitfall 6 live
  // observations, kept verbatim. The hermes line is the reason only the leading
  // version is bound: its upstream token moved twice inside one session with no
  // install change, so fingerprinting the line would demote every hermes proof.
  const observed: ReadonlyArray<{ readonly raw: string; readonly exact: string; readonly minorKey: string }> = [
    { raw: "2.1.267 (Claude Code)", exact: "2.1.267", minorKey: "2.1" },
    { raw: "codex-cli 0.152.0", exact: "0.152.0", minorKey: "0.152" },
    { raw: "0.85.1", exact: "0.85.1", minorKey: "0.85" },
    {
      raw: "Hermes Agent v0.20.6 (2026.8.27) - upstream 6e07eb48 - local 4209d371 (+1 carried commit)",
      exact: "0.20.6",
      minorKey: "0.20",
    },
  ];

  for (const entry of observed) {
    const parsed = harnessMinorKey(entry.raw);
    assert.equal(parsed.exact, entry.exact, entry.raw);
    assert.equal(parsed.minorKey, entry.minorKey, entry.raw);
    assert.equal(parsed.raw, entry.raw, "the whole line is retained for audit");
  }

  // The same hermes line with a different upstream token is the SAME proof.
  const early = harnessMinorKey("Hermes Agent v0.20.6 (2026.8.27) - upstream 9e6c4100 - local 4209d371");
  assert.equal(early.minorKey, "0.20");
});

test("an unparseable harness version yields a null minor key and an unverified resolution carrying the raw string", () => {
  const raw = "hermes nightly, unversioned build";
  const parsed = harnessMinorKey(raw);
  assert.equal(parsed.exact, null);
  assert.equal(parsed.minorKey, null);
  assert.equal(parsed.raw, raw);

  const resolution = resolveNativeUse(VALID_POSITIVE, { ...CURRENT_MATCH, harnessVersion: raw });
  assert.equal(resolution.nativeUse, "unverified");
  assert.equal(resolution.reasons[0]?.code, "HARNESS_VERSION_UNPARSEABLE");
  // Unparseable is unverified, never an error, and the raw string travels with
  // it so a human can see what could not be parsed.
  assert.match(resolution.reasons[0]?.sentence ?? "", /hermes nightly, unversioned build/u);
});

test("a blocked resolution names the credential variable and the next action, and carries no value", () => {
  const SENTINEL = "sk-ant-api03-NOTAREALKEYAAAAAAAAAA";
  const blocked: CapabilityProof = {
    ...VALID_POSITIVE,
    nativeUse: "unverified",
    blockedReason: {
      code: "CREDENTIAL_NOT_SET",
      variable: "EXA_API_KEY",
      nextAction: "Set EXA_API_KEY in the environment, then re-run the research canary.",
      // A caller trying to smuggle the value in is not merely discouraged: the
      // resolved record has nowhere to put it, and the closed schema refuses
      // the document outright (T-03-22).
      value: SENTINEL,
    } as unknown as CapabilityProof["blockedReason"],
  };

  const resolution = resolveNativeUse(blocked, CURRENT_MATCH);
  assert.equal(resolution.blocked, true);
  assert.equal(resolution.blockedReason?.variable, "EXA_API_KEY");
  assert.match(resolution.blockedReason?.nextAction ?? "", /re-run the research canary/u);
  assert.deepEqual(Object.keys(resolution.blockedReason ?? {}).sort(), ["code", "nextAction", "variable"]);
  assert.equal(
    JSON.stringify(resolution).includes(SENTINEL),
    false,
    "a value-shaped sentinel must not survive into the resolved record",
  );

  // blocked and unverified are distinct and load-bearing (D-12): the axis says
  // nothing was observed, the reason says exactly why and what to do about it.
  assert.equal(resolution.nativeUse, "unverified");
});

test("a blocked reason carrying a value field is refused by the closed schema", async (context) => {
  const root = await ledgerFixture(context);
  const path = await writeLedgerBytes(
    root,
    JSON.stringify({
      ...VALID_LEDGER,
      proofs: [
        {
          ...VALID_POSITIVE,
          blockedReason: {
            code: "CREDENTIAL_NOT_SET",
            variable: "EXA_API_KEY",
            nextAction: "Set EXA_API_KEY in the environment.",
            value: "sk-ant-api03-NOTAREALKEYAAAAAAAAAA",
          },
        },
      ],
    }),
  );

  const read = await readCapabilityLedger(path);
  assert.equal(read.state, "unreadable");
  if (read.state !== "unreadable") return;
  assert.equal(read.issues.length > 0, true);
});

// ---------------------------------------------------------------------------
// Task 3 — a positive and its negative are ONE evidence unit, written once
// ---------------------------------------------------------------------------

const VALID_NEGATIVE: CapabilityProof = {
  ...VALID_POSITIVE,
  polarity: "negative",
  nativeUse: "unverified",
  ancestorFreedom: {
    asserted: true,
    checkedAncestors: ["/tmp/alpha-aos-control-1", "/tmp", "/"],
  },
  oracle: {
    ...VALID_POSITIVE.oracle,
    command: "claude -p --output-format json (outside the project)",
  },
};

test("a positive and its matching negative resolve COMPLETE and carry the native-use axis", () => {
  const unit = pairEvidence(VALID_POSITIVE, VALID_NEGATIVE);

  assert.equal(unit.completeness, "COMPLETE");
  assert.equal(unit.missingHalf, null);
  assert.deepEqual(unit.incompleteReasons, []);
  assert.equal(unit.nativeUse, "invoked");
  assert.match(unit.summary, /COMPLETE/u);
  assert.match(unit.summary, /invoked/u);
});

test("an unpaired positive resolves INCOMPLETE and its summary never prints the positive axis", () => {
  const unit = pairEvidence(VALID_POSITIVE, null);

  assert.equal(unit.completeness, "INCOMPLETE");
  assert.equal(unit.missingHalf, "negative");
  // Completeness is a first-class field, so a consumer cannot reach the axis
  // without also holding the verdict that says the axis is not reportable.
  assert.equal(unit.nativeUse, null);
  assert.equal(unit.incompleteReasons.length > 0, true);
  assert.match(unit.summary, /INCOMPLETE/u);
  assert.match(unit.summary, /negative control/u);
  // The load-bearing assertion: printing the positive axis here IS the
  // unpaired-positive-as-pass failure D-14 forbids. INCOMPLETE is not a failed
  // negative, and it must not read like a passing one either.
  assert.equal(
    unit.summary.includes(VALID_POSITIVE.nativeUse),
    false,
    `the INCOMPLETE summary printed the positive axis: ${unit.summary}`,
  );
  for (const axis of ["discovered", "invoked"]) {
    assert.equal(unit.summary.includes(axis), false, `the INCOMPLETE summary printed ${axis}`);
  }
});

test("a negative with no ancestor-freedom assertion resolves INCOMPLETE and names that assertion", () => {
  const unasserted = pairEvidence(VALID_POSITIVE, { ...VALID_NEGATIVE, ancestorFreedom: null });
  const claimedFalse = pairEvidence(VALID_POSITIVE, {
    ...VALID_NEGATIVE,
    ancestorFreedom: { asserted: false, checkedAncestors: [] },
  });

  for (const unit of [unasserted, claimedFalse]) {
    assert.equal(unit.completeness, "INCOMPLETE");
    assert.equal(unit.nativeUse, null);
    // pi walks .agents/skills up through ancestors and, outside a repository,
    // does not stop at a repo root (03-RESEARCH.md Pitfall 3). A control
    // directory that was assumed rather than constructed proves nothing.
    assert.equal(
      unit.incompleteReasons.some((reason) => /ancestor/u.test(reason)),
      true,
      JSON.stringify(unit.incompleteReasons),
    );
    assert.match(unit.summary, /ancestor/u);
    assert.equal(unit.summary.includes(VALID_POSITIVE.nativeUse), false);
  }
});

test("a negative for a different capability is not a control for this one", () => {
  const unit = pairEvidence(VALID_POSITIVE, { ...VALID_NEGATIVE, capability: "ecc-skill/inherit-legacy-style" });

  assert.equal(unit.completeness, "INCOMPLETE");
  assert.equal(
    unit.incompleteReasons.some((reason) => /capability/u.test(reason)),
    true,
    JSON.stringify(unit.incompleteReasons),
  );
});

test("a ledger write goes through exactly one transaction scoped to the ledger root", async (context) => {
  const root = await ledgerFixture(context);
  const stateRoot = join(root, "state");

  const result = await writeCapabilityLedger({ stateRoot, ledger: VALID_LEDGER });

  assert.equal(result.status, "written");
  assert.equal(result.path, capabilityLedgerPath(stateRoot));
  assert.equal(typeof result.operationId, "string");
  assert.equal((result.operationId ?? "").length > 0, true);

  // The journal is the record of what the write was ALLOWED to touch, and it
  // names the ledger root alone. A wider root would let a later operation in
  // the same shape reach any managed file under the state root.
  const journal = JSON.parse(
    await readFile(join(stateRoot, "journal", `${result.operationId}.json`), "utf8"),
  ) as { allowedRoots: string[]; status: string; files: unknown[] };
  assert.equal(journal.status, "applied");
  assert.deepEqual(journal.allowedRoots, [resolve(capabilityLedgerRoot(stateRoot))]);
  assert.equal(journal.files.length, 1, "one ledger document, one journaled file");

  const onDisk = await readCapabilityLedger(result.path);
  assert.equal(onDisk.state, "present", JSON.stringify(onDisk));
});

test("the ledger module has exactly one write path", async () => {
  const source = await readFile(new URL("../../src/core/capability-ledger.ts", import.meta.url), "utf8");
  const code = source
    .split("\n")
    .filter((line) => !/^\s*[/*]/u.test(line))
    .join("\n");

  assert.equal(
    (code.match(/applyFileTransaction\(/gu) ?? []).length,
    1,
    "every ledger byte must leave through one journaled, snapshotted transaction",
  );
});

test("a write never defaults its state root, so a test cannot reach the developer state root", async (context) => {
  const root = await ledgerFixture(context);
  const stateRoot = join(root, "state");

  // Read-only observation of the real user state root, before and after.
  const realLedger = capabilityLedgerPath(userStateRoot());
  const realBefore = existsSync(realLedger);

  await writeCapabilityLedger({ stateRoot, ledger: VALID_LEDGER });

  assert.equal(existsSync(capabilityLedgerPath(stateRoot)), true);
  assert.equal(existsSync(realLedger), realBefore, "the real user state root must be untouched");

  // The structural guarantee behind that observation: the write path resolves
  // no path without an explicit state root. A convenience default is exactly
  // how a module-level test takes the exclusive writer lock on a developer
  // machine, which is the ambient-write class plan 01-21 spent a plan closing.
  const source = await readFile(new URL("../../src/core/capability-ledger.ts", import.meta.url), "utf8");
  const writer = source.slice(source.indexOf("export async function writeCapabilityLedger"));
  assert.equal(/capabilityLedgerPath\(\s*\)/u.test(writer), false, "the writer resolved a defaulted ledger path");
  assert.equal(/capabilityLedgerRoot\(\s*\)/u.test(writer), false, "the writer resolved a defaulted ledger root");
  assert.equal(/userStateRoot\(/u.test(writer), false, "the writer reached for the real user state root");
});

test("a second identical write is already-current and the bytes do not move", async (context) => {
  const root = await ledgerFixture(context);
  const stateRoot = join(root, "state");

  const first = await writeCapabilityLedger({ stateRoot, ledger: VALID_LEDGER });
  const afterFirst = await readFile(first.path, "utf8");

  const second = await writeCapabilityLedger({ stateRoot, ledger: VALID_LEDGER });
  const afterSecond = await readFile(second.path, "utf8");

  assert.equal(second.status, "already-current");
  assert.equal(second.operationId, null, "an already-current write allocates no transaction");
  assert.equal(afterSecond, afterFirst, "an identical re-write must be byte-identical");
  // Two-space JSON with a trailing newline, so the comparison above is a
  // property of the serializer rather than a coincidence of one input.
  assert.equal(afterFirst.endsWith("\n"), true);
  assert.equal(afterFirst.includes('\n  "schemaVersion"'), true);
});

// ---------------------------------------------------------------------------
// Plan 03-08 Task 3 — what is WRITTEN must be readable by the same reader
//
// Found live: `alpha-aos doctor --discovery` wrote eight proofs, exited 0, and
// then refused its own file on the next run with eight
// schema.minLength@/proofs/N/harnessVersion/raw issues. `probedHarnessVersions`
// records an un-probed harness as `raw: ""`, and the schema required that
// string non-empty — so the recorded-absence state the null `exact` beside it
// documents was unrepresentable, and the sweep became a one-shot command that
// bricked its own ledger.
//
// The round trip is the property that was missing. A write-only assertion
// cannot catch a document its reader will refuse.
// ---------------------------------------------------------------------------

/** Exactly what `harnessMinorKey("")` returns for a harness that printed nothing. */
const UNPROBED_HARNESS_VERSION = { exact: null, minorKey: null, raw: "" };

test("a proof for a harness that printed no version line survives the write-then-read round trip", async (context) => {
  const root = await ledgerFixture(context);
  const stateRoot = join(root, "state");

  // The shape is derived rather than typed: if `harnessMinorKey` ever stops
  // producing an empty raw, this fixture must change with it.
  assert.deepEqual(harnessMinorKey(""), UNPROBED_HARNESS_VERSION);

  const written = await writeCapabilityLedger({
    stateRoot,
    ledger: {
      ...VALID_LEDGER,
      proofs: [{ ...VALID_POSITIVE, nativeUse: "unverified", harnessVersion: harnessMinorKey("") }],
    },
  });
  assert.equal(written.status, "written");

  const read = await readCapabilityLedger(written.path);
  assert.equal(
    read.state,
    "present",
    `the sweep's own writer produced a document its own reader refuses: ${JSON.stringify(read)}`,
  );
  const proof = read.state === "present" ? read.ledger.proofs[0] : undefined;
  assert.ok(proof);
  assert.equal(proof.harnessVersion.raw, "");
  assert.equal(proof.harnessVersion.exact, null, "an empty raw and a null exact are one recorded absence, not two");

  // Positive control: the relaxation is confined to `raw`. The version fields a
  // comparison actually reads are still closed against a non-semver value, so
  // this did not become a schema that accepts anything.
  const poisoned = await writeCapabilityLedger({
    stateRoot: join(root, "state-2"),
    ledger: {
      ...VALID_LEDGER,
      proofs: [{ ...VALID_POSITIVE, harnessVersion: { exact: "not-a-version", minorKey: null, raw: "x" } }],
    },
  });
  const refused = await readCapabilityLedger(poisoned.path);
  assert.equal(refused.state, "unreadable", "a non-semver exact version was accepted");
});
