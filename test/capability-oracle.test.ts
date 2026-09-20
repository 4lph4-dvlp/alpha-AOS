// Plan 03-04: the discovery oracles — what a harness says it LOADED, before any
// model turn, and how that becomes one half of a CAPA-06 evidence unit.
//
// Three things are under test here and they are deliberately separable:
//
//  1. The DRIVER. Every oracle launches through the bounded process adapter, and
//     the two ways a launch can fail to happen at all — no oracle exists, or its
//     executable cannot be resolved — are REPORTED as `unsupported` rather than
//     thrown or simulated.
//  2. The PARSERS, against recorded output from live runs. These are the tests
//     that must pass on a machine with no harness installed at all, which is
//     what makes the discovery axis an automated-suite fact rather than a paid
//     canary.
//  3. The PAIRED run. One command, two directories, one evidence unit, with the
//     negative control constructed and its ancestors asserted rather than
//     assumed.
//
// The recordings in `test/helpers/oracle-fixtures.ts` are the live outputs of
// this session's probe runs with host paths aliased to synthetic roots; see
// that module's header for the exact substitutions.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertControlAncestorFreedom,
  DISCOVERED_PROJECT_SKILL_ROOTS,
  DISCOVERY_AXES,
  isAbsoluteEitherPlatform,
  ORACLE_DEFINITIONS,
  ORACLE_FINDING_CODES,
  ORACLE_PLACEHOLDER_PROMPT,
  parseClaudeInitEvent,
  parseCodexPromptInput,
  parsePiCommands,
  proofFor,
  PI_GET_COMMANDS_REQUEST,
  readOracleOutput,
  runDiscoveryOracle,
  runPairedDiscovery,
  splitJsonLines,
} from "../src/adapters/capability-oracle.js";
import type {
  DiscoveredSkill,
  DiscoveryAxis,
  DiscoveryResult,
  OracleDefinition,
  OracleParse,
  RunPairedDiscoveryOptions,
} from "../src/adapters/capability-oracle.js";
import { pairEvidence, type BoundInputs, type CapabilityProof, type HarnessVersion } from "../src/core/capability-ledger.js";
import { runDiscoverySweep, loadCanaryCatalog } from "../src/core/canary.js";
import { applyProjectPackSync, PACK_SIDECAR_FILE } from "../src/core/project-pack-sync.js";
import { approveProjectPlan, planProjectCapabilities, PROJECT_SKILL_ROOTS } from "../src/core/project-plan.js";
import {
  CLAUDE_INSIDE_RECORDING,
  CLAUDE_OUTSIDE_RECORDING,
  CODEX_INSIDE_RECORDING,
  CODEX_OUTSIDE_RECORDING,
  PI_INSIDE_RECORDING,
  PI_OUTSIDE_RECORDING,
  PI_TRUST_WITHHELD_RECORDING,
  SYNTHETIC_CONTROL_ROOT,
  SYNTHETIC_HOME_ROOT,
  SYNTHETIC_PROJECT_ROOT,
} from "./helpers/oracle-fixtures.js";
import type { HarnessId } from "../src/types.js";

/** A minimal SKILL.md a live probe project can offer a harness. */
const PROBE_SKILL = [
  "---",
  "name: zzz-canary-widget",
  "description: Use when the user asks to reticulate a splines manifest for the ZZZQ format.",
  "---",
  "",
  "# ZZZ Canary Widget",
  "",
  "Reticulate the splines manifest.",
  "",
].join("\n");

/** Every harness id, so the table can be proven total rather than spot-checked. */
const ALL_HARNESSES: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

/** A command name no host can have, so its resolution failure is not host-dependent. */
const IMPOSSIBLE_COMMAND = "alpha-aos-oracle-command-that-cannot-exist-0044";

/** A definition whose executable cannot resolve, for the reporting path. */
const UNRESOLVABLE_DEFINITION: OracleDefinition = {
  command: [IMPOSSIBLE_COMMAND],
  args: ["--version"],
  stdin: null,
  costsModelTurn: false,
  trustWithheldArgs: null,
  parse: () => {
    throw new Error("the unresolvable definition must never reach its parser");
  },
};

// ---------------------------------------------------------------------------
// The definition table
// ---------------------------------------------------------------------------

test("every harness has an oracle definition or an explicit recorded null", () => {
  for (const harness of ALL_HARNESSES) {
    assert.ok(harness in ORACLE_DEFINITIONS, `${harness} is absent from ORACLE_DEFINITIONS`);
  }
  assert.deepEqual(Object.keys(ORACLE_DEFINITIONS).sort(), [...ALL_HARNESSES].sort());

  // A null is the recorded absence of an entrypoint, not an oversight. Both
  // nulls are asserted by name so adding an oracle for either is a deliberate
  // change to this assertion rather than a silent one.
  assert.equal(ORACLE_DEFINITIONS.antigravity, null);
  assert.equal(ORACLE_DEFINITIONS.hermes, null);
  assert.notEqual(ORACLE_DEFINITIONS.claude, null);
  assert.notEqual(ORACLE_DEFINITIONS.codex, null);
  assert.notEqual(ORACLE_DEFINITIONS.pi, null);
});

test("only the claude oracle spends a model turn, and it carries a prompt because it must", () => {
  assert.equal(ORACLE_DEFINITIONS.claude?.costsModelTurn, true);
  assert.equal(ORACLE_DEFINITIONS.codex?.costsModelTurn, false);
  assert.equal(ORACLE_DEFINITIONS.pi?.costsModelTurn, false);

  // An empty prompt exits non-zero BEFORE the init event is emitted, so the
  // placeholder is load-bearing rather than cosmetic.
  assert.ok(ORACLE_DEFINITIONS.claude?.args.includes(ORACLE_PLACEHOLDER_PROMPT));
  assert.ok(ORACLE_DEFINITIONS.codex?.args.includes(ORACLE_PLACEHOLDER_PROMPT));

  // pi reads its request from stdin instead, in one newline-terminated line.
  assert.equal(ORACLE_DEFINITIONS.pi?.stdin, PI_GET_COMMANDS_REQUEST);
  assert.ok(PI_GET_COMMANDS_REQUEST.endsWith("\n"));
  assert.equal(ORACLE_DEFINITIONS.claude?.stdin, null);
  assert.equal(ORACLE_DEFINITIONS.codex?.stdin, null);
});

test("pi is the only harness with a trust-withheld control, and it is a second vector not a replacement", () => {
  const pi = ORACLE_DEFINITIONS.pi;
  assert.ok(pi !== null && pi !== undefined);
  assert.ok(pi.args.includes("--approve"));
  assert.ok(pi.trustWithheldArgs?.includes("--no-approve"));
  assert.ok(!pi.trustWithheldArgs?.includes("--approve"));
  assert.equal(ORACLE_DEFINITIONS.claude?.trustWithheldArgs, null);
  assert.equal(ORACLE_DEFINITIONS.codex?.trustWithheldArgs, null);
});

test("the axis this module produces is a strict subset of the ledger axis", () => {
  assert.deepEqual([...DISCOVERY_AXES].sort(), ["discovered", "unverified"]);
});

// ---------------------------------------------------------------------------
// The driver: unsupported is recorded, never simulated
// ---------------------------------------------------------------------------

/** The shape every result carries, whichever branch produced it. */
function assertResultShape(result: DiscoveryResult): void {
  assert.ok("unsupportedReason" in result);
  assert.ok("unparsedReason" in result);
  assert.ok("skills" in result);
}

test("a harness with no oracle returns unsupported naming why, and never a simulated empty list", async () => {
  for (const harness of ["antigravity", "hermes"] as const) {
    const result = await runDiscoveryOracle({ harness, cwd: process.cwd() });
    assertResultShape(result);
    assert.equal(result.harness, harness);
    assert.equal(result.nativeUse, "unverified");
    assert.ok(typeof result.unsupportedReason === "string" && result.unsupportedReason.length > 0);
    assert.ok(result.unsupportedReason.includes(harness));
    // The distinction the whole result shape exists for: an unsupported harness
    // reports NO skill list, because `[]` would read as "the harness answered
    // and listed nothing" — a claim no run made.
    assert.equal(result.skills, null);
    assert.equal(result.unparsedReason, null);
    assert.equal(result.oracle, null);
  }
});

test("an unresolvable executable returns unsupported and does not throw", async () => {
  const result = await runDiscoveryOracle({
    harness: "codex",
    cwd: process.cwd(),
    definition: UNRESOLVABLE_DEFINITION,
  });
  assertResultShape(result);
  assert.equal(result.nativeUse, "unverified");
  assert.ok(result.unsupportedReason?.includes(IMPOSSIBLE_COMMAND));
  assert.ok(result.unsupportedReason?.includes("PATH"));
  assert.equal(result.skills, null);
  assert.equal(result.unparsedReason, null);
  assert.equal(result.oracle, null);
});

test("an unsupported reason and an unparsed reason are separate fields on the result", async () => {
  const result = await runDiscoveryOracle({ harness: "hermes", cwd: process.cwd() });
  // Two nullable fields rather than one, so a caller can tell "no oracle could
  // run" from "an oracle ran and this tool could not read what it said". A
  // single reason string would collapse the two into an indistinguishable
  // absence, which is the failure 03-RESEARCH.md assumption A2 names.
  const keys = Object.keys(result);
  assert.ok(keys.includes("unsupportedReason"));
  assert.ok(keys.includes("unparsedReason"));
  assert.notEqual(result.unsupportedReason, result.unparsedReason);
});

test("a trust-withheld control is refused, not faked, on a harness that has no such vector", async () => {
  const result = await runDiscoveryOracle({ harness: "claude", cwd: process.cwd(), trustWithheld: true });
  assert.equal(result.nativeUse, "unverified");
  assert.ok(result.unsupportedReason?.includes("trust-withheld"));
  assert.equal(result.skills, null);
});

// ---------------------------------------------------------------------------
// The parsers, against recorded output — these run with no harness installed
// ---------------------------------------------------------------------------

// The probe project supplied four skill directories across four roots, and the
// three harnesses see DIFFERENT subsets because they read different roots:
// codex reads `.agents/skills` and `.codex/skills`, pi reads `.agents/skills`
// and `.pi/skills`, claude reads `.claude/skills`. The per-harness sets below
// are what each harness actually reported, and their inequality is itself the
// reason `PROJECT_SKILL_ROOTS` is keyed per harness rather than shared.

/** What codex reported as project-scope, from `.agents/skills` and `.codex/skills`. */
const CODEX_PROJECT_SKILLS = [
  "zzz-canary-widget",
  "zzz-codexlocal-widget",
  "scientific-thinking-literature-review",
] as const;

/** What pi reported with `scope: "project"`, from `.agents/skills` and `.pi/skills`. */
const PI_PROJECT_SKILLS = ["zzz-canary-widget", "zzz-pi-widget", "scientific-thinking-literature-review"] as const;

/** The ECC skill whose frontmatter name differs from its directory (Pitfall 2). */
const MISMATCHED_DIRECTORY = "scientific-thinking-literature-review";
const MISMATCHED_FRONTMATTER_NAME = "literature-review";

/** U+2028 and U+2029: valid inside a JSON string, and record separators to a line reader. */
const LINE_SEPARATOR = "\u2028";
const PARAGRAPH_SEPARATOR = "\u2029";

function skillByDirectory(parse: OracleParse, directory: string): DiscoveredSkill {
  const found = parse.skills.find((skill) => skill.directoryName === directory);
  assert.ok(found !== undefined, `no skill with directory ${directory} in ${parse.skills.length} parsed skills`);
  return found;
}

test("the recorded codex output parses to its skills with ABSOLUTE roots resolved from the positional labels", () => {
  const inside = parseCodexPromptInput(CODEX_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });

  assert.equal(inside.roots.length, 8);
  for (const root of inside.roots) {
    assert.ok(isAbsoluteEitherPlatform(root), `root is not absolute: ${root}`);
  }

  for (const directory of CODEX_PROJECT_SKILLS) {
    const skill = skillByDirectory(inside, directory);
    assert.ok(skill.root !== null && isAbsoluteEitherPlatform(skill.root), `${directory} has no absolute root`);
    assert.ok(skill.root.startsWith(SYNTHETIC_PROJECT_ROOT), `${directory} did not resolve under the project`);
    assert.ok(skill.path?.endsWith("SKILL.md"));
  }

  // The project's own two roots, resolved — not the labels that named them.
  const projectRoots = inside.roots.filter((root) => root.startsWith(SYNTHETIC_PROJECT_ROOT));
  assert.deepEqual([...projectRoots].sort(), [
    `${SYNTHETIC_PROJECT_ROOT}/.agents/skills`,
    `${SYNTHETIC_PROJECT_ROOT}/.codex/skills`,
  ]);
});

test("the same positional codex label resolves to a different absolute root outside the project", () => {
  const inside = parseCodexPromptInput(CODEX_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  const outside = parseCodexPromptInput(CODEX_OUTSIDE_RECORDING, { cwd: SYNTHETIC_CONTROL_ROOT });

  // `r0` is the project's own `.codex/skills` inside and the user's shared
  // `.agents/skills` outside. Anything keyed on the LABEL would call these the
  // same root, which is the whole reason the label never leaves the parser.
  assert.equal(inside.roots[0], `${SYNTHETIC_PROJECT_ROOT}/.codex/skills`);
  assert.equal(outside.roots[0], `${SYNTHETIC_HOME_ROOT}/.agents/skills`);
  assert.notEqual(inside.roots[0], outside.roots[0]);

  assert.equal(outside.roots.length, 6);
  for (const root of outside.roots) {
    assert.ok(!root.startsWith(SYNTHETIC_PROJECT_ROOT), `a control root reached into the project: ${root}`);
  }
  for (const directory of CODEX_PROJECT_SKILLS) {
    assert.equal(outside.skills.find((skill) => skill.directoryName === directory), undefined);
  }
  assert.ok(inside.skills.length > outside.skills.length);
});

test("the recorded pi output separates project scope from user scope by the harness's own field", () => {
  const inside = parsePiCommands(PI_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });

  const projectScoped = inside.skills.filter((skill) => skill.scope === "project");
  assert.equal(projectScoped.length, 3);
  assert.deepEqual(
    projectScoped.map((skill) => skill.directoryName).sort(),
    [...PI_PROJECT_SKILLS].sort(),
  );
  assert.ok(inside.skills.some((skill) => skill.scope === "user"));

  const outside = parsePiCommands(PI_OUTSIDE_RECORDING, { cwd: SYNTHETIC_CONTROL_ROOT });
  assert.equal(outside.skills.filter((skill) => skill.scope === "project").length, 0);
  assert.ok(outside.skills.length > 0);

  // The same directory with trust withheld: pi gates project resources behind
  // a trust decision, so this is a second, independent negative for the same
  // positive rather than a replacement for the different-directory one.
  const withheld = parsePiCommands(PI_TRUST_WITHHELD_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  assert.equal(withheld.skills.filter((skill) => skill.scope === "project").length, 0);
});

test("pi's scope comes from the nested source-info object, not the flat field its documentation describes", () => {
  // pi 0.85.1 emits `sourceInfo.scope`; its shipped `docs/rpc.md` still
  // describes a flat `location`. Reading the documented one yields undefined on
  // every entry — an undefined that looks exactly like "no project-scope
  // skill", which is the CAPA-06 answer. This record disagrees with itself on
  // purpose, so which field was read is observable rather than assumed.
  const record = {
    id: "1",
    type: "response",
    command: "get_commands",
    success: true,
    data: {
      commands: [
        {
          name: "skill:disagreeing-widget",
          description: "A record whose documented field contradicts its actual one.",
          source: "skill",
          location: "user",
          sourceInfo: {
            path: `${SYNTHETIC_PROJECT_ROOT}/.pi/skills/disagreeing-widget/SKILL.md`,
            source: "auto",
            scope: "project",
            origin: "top-level",
            baseDir: `${SYNTHETIC_PROJECT_ROOT}/.pi`,
          },
        },
      ],
    },
  };
  const parse = parsePiCommands(`${JSON.stringify(record)}\n`, { cwd: SYNTHETIC_PROJECT_ROOT });
  assert.equal(parse.skills.length, 1);
  assert.equal(parse.skills[0]?.scope, "project");
});

test("a pi record carrying a line separator and a paragraph separator inside a JSON string is ONE record", () => {
  // Node's line-reader module splits on U+2028 and U+2029 as well as on U+000A,
  // and both are valid inside a JSON string. Three records here would be two
  // parse failures and one truncated skill list — a silent CAPA-06 negative
  // manufactured by the framing rather than reported by the harness.
  const description = `First${LINE_SEPARATOR}second${PARAGRAPH_SEPARATOR}third`;
  const record = {
    id: "1",
    type: "response",
    command: "get_commands",
    success: true,
    data: {
      commands: [
        {
          name: "skill:separator-widget",
          description,
          source: "skill",
          sourceInfo: {
            path: `${SYNTHETIC_PROJECT_ROOT}/.pi/skills/separator-widget/SKILL.md`,
            source: "auto",
            scope: "project",
            origin: "top-level",
            baseDir: `${SYNTHETIC_PROJECT_ROOT}/.pi`,
          },
        },
      ],
    },
  };
  const stream = `${JSON.stringify(record)}\n`;
  assert.ok(stream.includes(LINE_SEPARATOR), "the fixture lost its line separator");
  assert.ok(stream.includes(PARAGRAPH_SEPARATOR), "the fixture lost its paragraph separator");

  assert.equal(splitJsonLines(stream).length, 1);

  const parse = parsePiCommands(stream, { cwd: SYNTHETIC_PROJECT_ROOT });
  assert.equal(parse.skills.length, 1);
  assert.equal(parse.skills[0]?.advertisedName, "skill:separator-widget");
  assert.equal(parse.skills[0]?.scope, "project");
});

test("the recorded claude init event parses to its skills and its MCP servers, with pending recorded not judged", () => {
  const inside = parseClaudeInitEvent(CLAUDE_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  const outside = parseClaudeInitEvent(CLAUDE_OUTSIDE_RECORDING, { cwd: SYNTHETIC_CONTROL_ROOT });

  // The init event is NOT the first line: four hook events precede it here, so
  // reading by position rather than by type and subtype would read a hook.
  assert.equal(inside.skills.length, 46);
  assert.equal(outside.skills.length, 44);
  assert.ok(inside.skills.some((skill) => skill.advertisedName === "zzz-canary-widget"));
  assert.ok(inside.skills.some((skill) => skill.advertisedName === MISMATCHED_DIRECTORY));
  assert.equal(outside.skills.find((skill) => skill.advertisedName === "zzz-canary-widget"), undefined);

  assert.equal(inside.mcpServers.length, 10);
  const statuses = new Set(inside.mcpServers.map((server) => server.status));
  assert.ok(statuses.has("pending"));
  assert.ok(statuses.has("connected"));
  assert.equal(inside.mcpServers.find((server) => server.name === "context7")?.status, "pending");
  // 03-RESEARCH.md Pitfall 5: every server is legitimately `pending` at init,
  // so a pending status is a REGISTRATION fact and must never become a finding.
  assert.ok(
    inside.mcpServers.some((server) => server.status === "pending"),
    "no pending server was parsed, so the assertion below is not exercising the Pitfall 5 rule at all",
  );
  // The claude init parser mints no findings today, so this is a regression
  // guard on a future finding path rather than a live discrimination.
  assert.deepEqual(inside.findings.filter((finding) => finding.code.includes("MCP")), []);
});

test("a scientific-pack skill is recorded under BOTH names, and the pair differs per harness", () => {
  const codex = parseCodexPromptInput(CODEX_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  const pi = parsePiCommands(PI_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  const claude = parseClaudeInitEvent(CLAUDE_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });

  const codexSkill = skillByDirectory(codex, MISMATCHED_DIRECTORY);
  const piSkill = skillByDirectory(pi, MISMATCHED_DIRECTORY);
  const claudeSkill = skillByDirectory(claude, MISMATCHED_DIRECTORY);

  // Both names are on every record. No canonicalizer decides between them: the
  // three harnesses genuinely disagree, so a winner would be wrong twice.
  for (const skill of [codexSkill, piSkill, claudeSkill]) {
    assert.equal(skill.directoryName, MISMATCHED_DIRECTORY);
    assert.ok(typeof skill.advertisedName === "string" && skill.advertisedName.length > 0);
  }

  // Codex and pi advertise the FRONTMATTER name; claude advertises the
  // DIRECTORY. Measured on one file, in one session, on all three harnesses.
  assert.equal(codexSkill.advertisedName, MISMATCHED_FRONTMATTER_NAME);
  assert.equal(piSkill.advertisedName, `skill:${MISMATCHED_FRONTMATTER_NAME}`);
  assert.equal(claudeSkill.advertisedName, MISMATCHED_DIRECTORY);

  assert.notEqual(codexSkill.advertisedName, codexSkill.directoryName);
  assert.notEqual(piSkill.advertisedName, piSkill.directoryName);
  assert.equal(claudeSkill.advertisedName, claudeSkill.directoryName);
});

test("a truncated recording yields an unparsed reason and NO skill list, never an empty one", () => {
  const truncated = CODEX_INSIDE_RECORDING.slice(0, 4096);
  const reading = readOracleOutput("codex", truncated, { cwd: SYNTHETIC_PROJECT_ROOT });
  assert.equal(reading.parse, null);
  assert.ok(typeof reading.unparsedReason === "string" && reading.unparsedReason.length > 0);

  // An empty list would be indistinguishable from "the harness genuinely loaded
  // nothing", and the two call for opposite next actions (assumption A2).
  const garbage = readOracleOutput("pi", "not json at all\n", { cwd: SYNTHETIC_PROJECT_ROOT });
  assert.equal(garbage.parse, null);
  assert.ok(garbage.unparsedReason !== null);

  const claudeWithoutInit = readOracleOutput("claude", '{"type":"system","subtype":"hook_started"}\n', {
    cwd: SYNTHETIC_PROJECT_ROOT,
  });
  assert.equal(claudeWithoutInit.parse, null);
  assert.ok(claudeWithoutInit.unparsedReason?.includes("init"));

  // A harness with no oracle cannot be read at all, and says so.
  const noOracle = readOracleOutput("hermes", "anything", { cwd: SYNTHETIC_PROJECT_ROOT });
  assert.equal(noOracle.parse, null);
  assert.ok(noOracle.unparsedReason !== null);
});

// ---------------------------------------------------------------------------
// The paired run: one command, two directories, one evidence unit
// ---------------------------------------------------------------------------

/** The inputs a proof binds to. Fixed values — this suite proves no demotion. */
const BOUND_INPUTS: BoundInputs = {
  skillSourceHash: "a".repeat(64),
  mcpServerVersion: null,
  evidenceHash: null,
};

const HARNESS_VERSION: HarnessVersion = { exact: "0.152.0", minorKey: "0.152", raw: "codex-cli 0.152.0" };

/** A bare temporary directory, removed when the test that made it finishes. */
async function scratchRoot(context: { after: (fn: () => Promise<void>) => void }, label: string): Promise<string> {
  const raw = await mkdtemp(join(tmpdir(), `alpha-aos-oracle-${label}-`));
  const root = await realpath(raw);
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

function pairedOptions(overrides: {
  harness: "claude" | "codex" | "pi" | "hermes";
  projectRoot: string;
  controlRoot: string;
  skillDirectories?: readonly string[];
}): RunPairedDiscoveryOptions {
  return {
    harness: overrides.harness,
    projectRoot: overrides.projectRoot,
    controlRoot: overrides.controlRoot,
    capability: "RESEARCH_SCIENTIFIC",
    skillDirectories: overrides.skillDirectories ?? ["zzz-canary-widget"],
    projectId: "0".repeat(16),
    boundInputs: BOUND_INPUTS,
    harnessVersion: HARNESS_VERSION,
    timeoutMs: 120_000,
  };
}

function recordedProof(polarity: "positive" | "negative", overrides: Partial<DiscoveryResult> = {}, asserted = true, directories = ["zzz-canary-widget"]): CapabilityProof {
  const cwd = polarity === "positive" ? SYNTHETIC_PROJECT_ROOT : SYNTHETIC_CONTROL_ROOT;
  const parsed = parseCodexPromptInput(polarity === "positive" ? CODEX_INSIDE_RECORDING : CODEX_OUTSIDE_RECORDING, { cwd });
  const result: DiscoveryResult = {
    harness: "codex", cwd, exitCode: 0, ...parsed, nativeUse: "unverified", unsupportedReason: null, unparsedReason: null,
    oracle: { command: "codex debug prompt-input placeholder", exitCode: 0, stdoutFingerprint: "a".repeat(64), stderrFingerprint: "b".repeat(64) },
    costsModelTurn: false, ...overrides,
  };
  const proof = proofFor({ base: pairedOptions({ harness: "codex", projectRoot: SYNTHETIC_PROJECT_ROOT, controlRoot: SYNTHETIC_CONTROL_ROOT, skillDirectories: directories }),
    result, polarity, ancestorFreedom: polarity === "negative" ? { asserted, checkedAncestors: [cwd] } : null, observedAt: "2026-09-11T00:00:00.000Z" });
  assert.ok(proof);
  return proof;
}

function proofNotes(proof: CapabilityProof): readonly { kind: string; statement: string; basis: string }[] | undefined {
  return proof.claimNotes;
}

test("a different-directory negative records the invocation inference and its observed control premise", () => {
  const notes = proofNotes(recordedProof("negative"));
  assert.equal(notes?.length, 1);
  assert.equal(notes?.[0]?.kind, "inference");
  assert.match(notes?.[0]?.statement ?? "", /cannot be invoked outside the project/u);
  assert.match(notes?.[0]?.basis ?? "", /INFERRED.*same oracle.*control directory.*ancestor.*did not list/u);
});

test("the positive half and a control that discovered the capability carry no inference", () => {
  const positive = recordedProof("positive");
  assert.equal(proofNotes(positive), undefined);
  const parsed = parseCodexPromptInput(CODEX_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  const negative = recordedProof("negative", { skills: parsed.skills });
  assert.equal(negative.nativeUse, "discovered");
  assert.equal(proofNotes(negative), undefined);
});

test("claim notes do not change the paired completeness native-use or missing-half verdict", () => {
  const unit = pairEvidence(recordedProof("positive"), recordedProof("negative"));
  assert.equal(unit.completeness, "COMPLETE");
  assert.equal(unit.nativeUse, "discovered");
  assert.equal(unit.missingHalf, null);
});

test("unparsed negatives and trust-withheld controls do not claim an observed outside-project absence", () => {
  assert.equal(proofNotes(recordedProof("negative", { skills: null, unparsedReason: "unrecognized output" })), undefined);
  assert.equal(proofNotes(recordedProof("negative", {}, false)), undefined);
  assert.equal(proofNotes(recordedProof("negative", {}, true, [])), undefined);
});

test("a partially loaded multi-skill capability does not claim that the harness loaded none of it", () => {
  const parsed = parseCodexPromptInput(CODEX_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  const proof = recordedProof("negative", { skills: parsed.skills }, true, ["zzz-canary-widget", "absent-skill"]);
  assert.equal(proof.nativeUse, "unverified");
  assert.equal(proofNotes(proof), undefined);
});

test("the ancestor walk reaches the filesystem root and records every directory it checked", async (t) => {
  const control = await scratchRoot(t, "control");
  const assertion = assertControlAncestorFreedom("pi", control);

  assert.equal(assertion.freedom.asserted, true);
  assert.deepEqual(assertion.offendingAncestors, []);
  // A bare boolean would be unauditable. pi walks `.agents/skills` up through
  // ancestors and, outside a repository, does not stop at a repository root but
  // continues to the filesystem root — so the list has to show that it did.
  assert.ok(assertion.freedom.checkedAncestors.length >= 2);
  const last = assertion.freedom.checkedAncestors.at(-1) ?? "";
  assert.equal(dirname(resolve(last)), resolve(last), `the walk stopped at ${last}, not at a filesystem root`);
  for (const ancestor of assertion.freedom.checkedAncestors) {
    assert.ok(!/[A-Za-z]:[\\/]Users[\\/][^\\/]+[\\/]?$/u.test(ancestor) || ancestor.startsWith("~"));
  }
});

test("a project skill root in an ancestor of the control makes the unit INCOMPLETE naming that ancestor", async (t) => {
  const parent = await scratchRoot(t, "contaminated");
  // pi reads `.agents/skills` from the working directory AND its ancestors, so
  // one placed here is exactly the false negative Pitfall 3 describes.
  await mkdir(join(parent, ".agents", "skills", "zzz-canary-widget"), { recursive: true });
  const control = join(parent, "control");
  await mkdir(control, { recursive: true });
  const project = await scratchRoot(t, "project");

  const assertion = assertControlAncestorFreedom("pi", control);
  assert.equal(assertion.freedom.asserted, false);
  assert.equal(assertion.offendingAncestors.length, 1);
  assert.ok(assertion.offendingAncestors[0]?.includes(basename(parent)));
  assert.ok(assertion.offendingAncestors[0]?.includes(".agents/skills"));

  const paired = await runPairedDiscovery(pairedOptions({ harness: "pi", projectRoot: project, controlRoot: control }));
  if (paired.unit === null) {
    // No pi on this host: the recorded unsupported reason is the assertion.
    assert.ok(paired.unsupportedReason !== null);
    return;
  }
  assert.equal(paired.unit.completeness, "INCOMPLETE");
  assert.equal(paired.unit.negative, null);
  assert.equal(paired.negatives.length, 0, "a negative was taken in a control that was already known unusable");
  assert.ok(
    paired.incompleteReasons.some((reason) => reason.includes(basename(parent))),
    `no reason named the offending ancestor: ${paired.incompleteReasons.join(" | ")}`,
  );
  assert.ok(
    paired.findings.some((finding) => finding.code === ORACLE_FINDING_CODES.controlAncestorHoldsSkillRoot),
  );
  // INCOMPLETE means the axis is not reportable, and it is not reported.
  assert.equal(paired.unit.nativeUse, null);
});

test("one codex command run from two directories forms one evidence unit with an asserted control", async (t) => {
  const project = await scratchRoot(t, "codex-project");
  const control = await scratchRoot(t, "codex-control");
  await mkdir(join(project, ".agents", "skills", "zzz-canary-widget"), { recursive: true });
  await writeFile(join(project, ".agents", "skills", "zzz-canary-widget", "SKILL.md"), PROBE_SKILL, "utf8");

  const paired = await runPairedDiscovery(pairedOptions({ harness: "codex", projectRoot: project, controlRoot: control }));

  if (paired.unit === null) {
    // A host without codex records unsupported WITH its reason. This branch is
    // asserted rather than skipped: "no oracle here" is a result the ledger has
    // to be able to carry, and CI legs take exactly this path.
    assert.ok(paired.unsupportedReason !== null && paired.unsupportedReason.length > 0);
    assert.equal(paired.positive?.skills, null);
    assert.equal(paired.negatives.length, 0);
    return;
  }

  assert.equal(paired.unit.completeness, "COMPLETE", paired.incompleteReasons.join(" | "));
  assert.equal(paired.unit.nativeUse, "discovered");
  assert.equal(paired.unit.positive?.polarity, "positive");
  assert.equal(paired.unit.negative?.polarity, "negative");

  // The negative half carries the assertion that makes it meaningful.
  const freedom = paired.unit.negative?.ancestorFreedom;
  assert.equal(freedom?.asserted, true);
  assert.ok((freedom?.checkedAncestors.length ?? 0) > 0);

  // Same command, two directories, and nothing else different.
  assert.equal(paired.positive?.oracle?.command, paired.negatives[0]?.result.oracle?.command);
  assert.notEqual(paired.positive?.cwd, paired.negatives[0]?.result.cwd);
  assert.ok(paired.positive?.skills?.some((skill) => skill.directoryName === "zzz-canary-widget"));
  assert.ok(!paired.negatives[0]?.result.skills?.some((skill) => skill.directoryName === "zzz-canary-widget"));
});

test("a pi unit carries two negatives: the different directory and the same directory with trust withheld", async (t) => {
  const project = await scratchRoot(t, "pi-project");
  const control = await scratchRoot(t, "pi-control");
  await mkdir(join(project, ".pi", "skills", "zzz-pi-widget"), { recursive: true });
  await writeFile(join(project, ".pi", "skills", "zzz-pi-widget", "SKILL.md"), PROBE_SKILL, "utf8");

  const paired = await runPairedDiscovery(
    pairedOptions({ harness: "pi", projectRoot: project, controlRoot: control, skillDirectories: ["zzz-pi-widget"] }),
  );

  if (paired.unit === null) {
    assert.ok(paired.unsupportedReason !== null && paired.unsupportedReason.length > 0);
    return;
  }

  const kinds = paired.negatives.map((negative) => negative.kind).sort();
  assert.deepEqual(kinds, ["different-directory", "trust-withheld"]);

  // The trust-withheld run is in the SAME directory as the positive: it changes
  // the permission pi needs to read the pack, not the location of the pack.
  const withheld = paired.negatives.find((negative) => negative.kind === "trust-withheld");
  assert.equal(withheld?.result.cwd, project);
  assert.equal(withheld?.result.skills?.filter((skill) => skill.scope === "project").length, 0);
  assert.equal(paired.unit.completeness, "COMPLETE", paired.incompleteReasons.join(" | "));
});

test("a harness with no oracle produces a recorded unsupported paired result, never a false negative", async (t) => {
  const project = await scratchRoot(t, "hermes-project");
  const control = await scratchRoot(t, "hermes-control");
  const paired = await runPairedDiscovery(
    pairedOptions({ harness: "hermes", projectRoot: project, controlRoot: control }),
  );

  assert.equal(paired.unit, null);
  assert.ok(paired.unsupportedReason?.includes("hermes"));
  assert.equal(paired.positive?.skills, null);
  assert.equal(paired.negatives.length, 0);
  // The control was still constructed and checked, so the recorded absence is
  // about the harness rather than about an unexamined directory.
  assert.ok(paired.ancestorFreedom.checkedAncestors.length > 0);
});

test("the second codex project root, when populated, produces the shadow finding with its stable code", () => {
  const parse = parseCodexPromptInput(CODEX_INSIDE_RECORDING, { cwd: SYNTHETIC_PROJECT_ROOT });
  const shadow = parse.findings.find((finding) => finding.code === ORACLE_FINDING_CODES.codexSecondProjectRoot);

  assert.ok(shadow !== undefined, `no shadow finding among ${JSON.stringify(parse.findings)}`);
  assert.equal(shadow.code, "CODEX_SECOND_PROJECT_ROOT_SHADOW");
  assert.ok(shadow.detail.includes(`${SYNTHETIC_PROJECT_ROOT}/.codex/skills`));

  // Reported, never acted on: the second root is not a write target, so the
  // table alpha-AOS writes through still names exactly one root for codex.
  assert.equal(PROJECT_SKILL_ROOTS.codex, ".agents/skills");
  assert.ok(DISCOVERED_PROJECT_SKILL_ROOTS.codex.includes(".codex/skills"));
  assert.ok(DISCOVERED_PROJECT_SKILL_ROOTS.codex.includes(".agents/skills"));

  // Outside the project codex loads no project-local root at all, so there is
  // no shadow to report and none is reported.
  const outside = parseCodexPromptInput(CODEX_OUTSIDE_RECORDING, { cwd: SYNTHETIC_CONTROL_ROOT });
  assert.equal(
    outside.findings.find((finding) => finding.code === ORACLE_FINDING_CODES.codexSecondProjectRoot),
    undefined,
  );
});

test("this module cannot produce the invocation axis, at the type level and in its own source", async () => {
  // The oracles prove LOADING, not selection. Treating "the harness listed the
  // skill" as use would reintroduce the configuration-file-presence-is-success
  // error one layer up, which is the single thing the validation constraint in
  // PROJECT.md forbids.

  // @ts-expect-error the invocation axis is not assignable from this module's axis
  const notAssignable: DiscoveryAxis = "invoked";
  assert.equal(notAssignable, "invoked");
  assert.ok(!DISCOVERY_AXES.includes("invoked" as (typeof DISCOVERY_AXES)[number]));

  // Compiled to dist/test, so the repository root is two levels up.
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = await readFile(join(repositoryRoot, "src", "adapters", "capability-oracle.ts"), "utf8");
  const executable = source.split("\n").filter((line) => !/^\s*[/*]/u.test(line));
  assert.deepEqual(
    // Qualification prose can name invocation; only the exact axis literal is forbidden.
    executable.filter((line) => /["']invoked["']/u.test(line)),
    [],
    "an executable line in the oracle adapter names the invocation axis",
  );

  // Every result this module returns carries one of the two, and only those.
  const result = await runDiscoveryOracle({ harness: "hermes", cwd: process.cwd() });
  assert.ok(DISCOVERY_AXES.includes(result.nativeUse));
});

// ---------------------------------------------------------------------------
// Plan 03-11 Task 3: the representative pack, exercised inside the project and
// provably not discoverable outside it — ONE evidence unit (D-14)
// ---------------------------------------------------------------------------
//
// CAPA-05 asks that a synced project capability be discoverable and usable
// where task intent matches; CAPA-06 asks that the same request outside the
// project cannot reach it. D-14 makes those ONE unit: an unpaired positive does
// not satisfy CAPA-06, and a static check that the file is absent is rejected
// outright as the mirror image of the configuration-file-presence-is-success
// error. So the negative below is an ORACLE RESULT — what the harness itself
// says it loaded, run from a constructed control directory — and never a
// directory listing.
//
// Only the FREE oracles run here. `runDiscoverySweep` skips any harness whose
// oracle spends a model turn and records the reason, so this costs nothing and
// CI (which has no credential at all) takes the same path.

const PACK_UNDER_TEST = "WEB_REACT";
const PACK_SKILL_UNDER_TEST = "frontend-a11y";

function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * A project with the representative pack actually MATERIALIZED into every
 * project-local skill root, offline.
 *
 * The bytes come from a tree this test wrote and a lock this test re-pinned to
 * those bytes, so the writer's exact-hash contract still holds and no `npm pack`
 * of the ECC runtime is ever reached. Driving `applyProjectPackSync` directly
 * rather than the built CLI is what keeps that possible: the CLI resolves its
 * package root from its own module directory and has no flag for a verified
 * source root (recorded in plan 03-01's summary).
 */
async function materializedPackFixture(
  context: { after: (fn: () => Promise<void>) => void },
  label: string,
): Promise<{ projectRoot: string; stateRoot: string; written: readonly string[]; sidecars: readonly string[] }> {
  const base = await mkdtemp(join(tmpdir(), `alpha-aos-capa05-${label}-`));
  context.after(async () => rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const projectRoot = join(base, "project");
  const packageRoot = join(base, "package-root");
  const stateRoot = join(base, "state");
  const sourceRoot = join(base, "source");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    `${JSON.stringify({ name: "capa05-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  await cp(join(root, "catalog"), join(packageRoot, "catalog"), { recursive: true });
  await cp(join(root, "schemas"), join(packageRoot, "schemas"), { recursive: true });

  const body = [
    "---",
    `name: ${PACK_SKILL_UNDER_TEST}`,
    "description: Use when a page or form has to be operable by keyboard alone and understandable to a screen reader.",
    "---",
    "",
    "# Frontend accessibility",
    "",
    "Walk the interactive elements, check focus order, names and roles.",
    "",
  ].join("\n");
  await mkdir(join(sourceRoot, PACK_SKILL_UNDER_TEST), { recursive: true });
  await writeFile(join(sourceRoot, PACK_SKILL_UNDER_TEST, "SKILL.md"), body, "utf8");

  const lockPath = join(packageRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    components: { ecc: { sourceSha256: Record<string, string> } };
  };
  lock.components.ecc.sourceSha256[PACK_SKILL_UNDER_TEST] = digest(body);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  const options = { path: projectRoot, packageRoot, stateRoot };
  const plan = await planProjectCapabilities(options);
  assert.deepEqual(plan.applicable, [PACK_UNDER_TEST], "the fixture no longer selects exactly the representative pack");
  await approveProjectPlan({ ...options, expectedDigest: plan.planDigest });
  const applied = await applyProjectPackSync({ ...options, verifiedSourceRoot: sourceRoot });

  // Materialization is asserted from the WRITER's own result, not from a
  // directory listing: this task's acceptance forbids a file-absence check from
  // standing in for an oracle, and the same discipline applies to the presence
  // half.
  assert.equal(applied.status, "written");
  for (const harness of Object.keys(PROJECT_SKILL_ROOTS) as Array<"claude" | "codex" | "pi">) {
    const expected = `${PROJECT_SKILL_ROOTS[harness] ?? ""}/${PACK_SKILL_UNDER_TEST}/SKILL.md`;
    assert.ok(applied.written.includes(expected), `${expected} was not materialized: ${applied.written.join(", ")}`);
  }
  // The D-07 sidecar has to be THERE for the live tolerance assertion below to
  // mean anything: without this, "the harness listed one more skill" would hold
  // just as well on a run that wrote no sidecar at all, and would re-prove
  // nothing about T-03-100.
  const codexSidecar = `${PROJECT_SKILL_ROOTS.codex ?? ""}/${PACK_SKILL_UNDER_TEST}/${PACK_SIDECAR_FILE}`;
  assert.ok(
    applied.sidecars.includes(codexSidecar),
    `no sidecar was planned into codex's skill root, so the tolerance assertion would be vacuous: ${applied.sidecars.join(", ")}`,
  );
  // Read the BYTES, not the report. `applied.sidecars` lists what the
  // transaction was handed; this establishes that the file is actually sitting
  // in the directory the harness is about to scan, which is the precondition
  // the live tolerance assertion below rests on. A read rather than an
  // existence check: this task's acceptance forbids a directory listing from
  // standing in for evidence, and a read that fails is just as loud.
  const sidecarOnDisk = JSON.parse(
    await readFile(join(projectRoot, ...codexSidecar.split("/")), "utf8"),
  ) as { packId?: unknown; owner?: unknown };
  assert.equal(sidecarOnDisk.owner, "alpha-aos");
  assert.equal(sidecarOnDisk.packId, PACK_UNDER_TEST);
  return { projectRoot, stateRoot, written: applied.written, sidecars: applied.sidecars };
}

test("the pack-exercise canary is declared for the representative pack and names neither the skill nor a tool", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const catalog = (await loadCanaryCatalog(root)).value;
  const canary = catalog.canaries.find((entry) => entry.id === "PACK_EXERCISE_FRONTEND_A11Y");

  assert.ok(canary, "the pack-exercise canary is not declared in the shipped catalog");
  assert.equal(canary.capability, "CAPA-05");
  assert.equal(canary.readOnly, true);
  // Declared for the pass-bar harness: catalog/stack.yaml names codex as
  // policy.canaryHarness (D-17), with claude retained for compatibility.
  assert.deepEqual([...canary.harnesses], ["claude", "codex"]);

  // `loadCanaryCatalog` refuses a prompt naming an expected tool or a locked
  // skill id, so a catalog that LOADS has already passed the hygiene rule. This
  // asserts the rest: the prompt does not hint at the pack or the subject.
  const prompt = canary.prompt.toLowerCase();
  for (const term of [PACK_SKILL_UNDER_TEST, PACK_UNDER_TEST.toLowerCase(), "a11y", "accessib", "skill"]) {
    assert.equal(prompt.includes(term), false, `the pack-exercise prompt hints at ${term}: ${canary.prompt}`);
  }
  // An expectation about FAN-OUT rather than about a tool, because a pack skill
  // is not an MCP tool and MCP-side observation cannot see one being followed.
  assert.deepEqual([...canary.expectTools], []);
  assert.equal(canary.maxDistinctServers, 1);
  assert.ok((canary.why ?? "").length > 0, "the pack-exercise canary records no reason for a reviewer");
});

test("the materialized pack is discovered inside the project and not in a constructed control directory", async (t) => {
  const { projectRoot, sidecars } = await materializedPackFixture(t, "paired");
  assert.ok(sidecars.length > 0, "the fixture wrote no sidecar, so the tolerance assertion below proves nothing");
  const control = await scratchRoot(t, "capa06-control");
  const unknownVersion: HarnessVersion = { exact: null, minorKey: null, raw: "" };

  const sweep = await runDiscoverySweep({
    projectRoot,
    controlRoot: control,
    capability: PACK_UNDER_TEST,
    skillDirectories: [PACK_SKILL_UNDER_TEST],
    projectId: "0".repeat(16),
    boundInputs: { skillSourceHash: "b".repeat(64), mcpServerVersion: null, evidenceHash: null },
    harnessVersions: { claude: unknownVersion, codex: unknownVersion, pi: unknownVersion, hermes: unknownVersion },
  });

  // Nothing here spends. A harness whose oracle costs a model turn is recorded
  // as skipped WITH its reason rather than run.
  for (const entry of sweep.entries.filter((candidate) => candidate.costsModelTurn === true)) {
    assert.equal(entry.ran, false, `${entry.harness} spends a model turn and this sweep ran it`);
    assert.ok(entry.skippedReason !== null && entry.skippedReason.length > 0);
  }

  const ran = sweep.entries.filter((entry) => entry.ran && entry.discovery !== null);
  assert.ok(ran.length > 0, "no free oracle ran at all, so this proves nothing about the free half");

  let complete = 0;
  for (const entry of ran) {
    const discovery = entry.discovery;
    assert.ok(discovery, `${entry.harness} reported it ran and carried no discovery`);

    if (discovery.unit === null) {
      // A host without this harness records UNSUPPORTED with its reason. This
      // task's precondition is that at least one harness with a project-local
      // skill root resolves; a harness that does not is asserted as a RECORDED
      // absence rather than skipped over.
      assert.ok(
        discovery.unsupportedReason !== null && discovery.unsupportedReason.length > 0,
        `${entry.harness} produced neither a unit nor a recorded reason`,
      );
      assert.equal(
        discovery.positive?.skills,
        null,
        `${entry.harness} reported an EMPTY skill list for an unsupported oracle`,
      );
      continue;
    }

    // Every unit is recorded either COMPLETE or INCOMPLETE naming the missing
    // half. There is no third state and no silent one.
    assert.ok(
      discovery.unit.completeness === "COMPLETE" || discovery.unit.completeness === "INCOMPLETE",
      `${entry.harness}'s unit has no completeness`,
    );
    if (discovery.unit.completeness === "INCOMPLETE") {
      assert.ok(discovery.incompleteReasons.length > 0, `${entry.harness}'s unit is INCOMPLETE and names no missing half`);
      // An INCOMPLETE unit never reports the positive's axis.
      assert.equal(discovery.unit.nativeUse, null);
      continue;
    }
    complete += 1;

    // THE POSITIVE: the harness says it loaded the pack's skill, and the record
    // names the ABSOLUTE path it came from, under this project.
    const loaded = discovery.positive?.skills?.filter((skill) => skill.directoryName === PACK_SKILL_UNDER_TEST) ?? [];
    assert.ok(loaded.length > 0, `${entry.harness} did not report loading ${PACK_SKILL_UNDER_TEST} inside the project`);
    const located = loaded.find((skill) => skill.root !== null || skill.path !== null);
    assert.ok(located, `${entry.harness} reported the skill with no path at all, so nothing names where it came from`);
    const absolute = located.path ?? located.root ?? "";
    assert.equal(
      isAbsoluteEitherPlatform(absolute),
      true,
      `${entry.harness} reported a non-absolute location for the loaded skill: ${absolute}`,
    );
    assert.ok(
      absolute.replaceAll("\\", "/").toLowerCase().includes(projectRoot.replaceAll("\\", "/").toLowerCase()),
      `${entry.harness} loaded ${PACK_SKILL_UNDER_TEST} from ${absolute}, which is not under the project root`,
    );

    // THE NEGATIVE: an ORACLE RESULT from the constructed control, never a file
    // check, and carrying the ancestor walk that makes it meaningful.
    const negative = discovery.negatives.find((candidate) => candidate.kind === "different-directory");
    assert.ok(negative, `${entry.harness}'s unit has no different-directory negative`);
    assert.notEqual(negative.result.cwd, discovery.positive?.cwd);
    assert.equal(
      negative.result.skills?.some((skill) => skill.directoryName === PACK_SKILL_UNDER_TEST) ?? false,
      false,
      `${entry.harness} discovered ${PACK_SKILL_UNDER_TEST} outside the project, which falsifies CAPA-06`,
    );
    assert.ok(
      (discovery.unit.negative?.ancestorFreedom?.checkedAncestors.length ?? 0) > 0,
      `${entry.harness}'s negative carries an EMPTY checked-ancestor list, so the control was never actually walked`,
    );
    assert.equal(discovery.unit.negative?.ancestorFreedom?.asserted, true);

    // Same command, two directories, and nothing else different.
    assert.equal(discovery.positive?.oracle?.command, negative.result.oracle?.command);

    // T-03-100, re-proven LIVE on the sidecar this plan actually writes rather
    // than inherited from 03-RESEARCH.md's probe. The two runs differ only by
    // the project, so the difference in what the harness listed is exactly the
    // project-scope skills the pack contributes. If the harness had mistaken
    // `.alpha-aos-provenance.json` for a skill, this difference would be larger
    // than the number of skill directories materialized.
    const positiveCount = discovery.positive?.skills?.length ?? 0;
    const negativeCount = negative.result.skills?.length ?? 0;
    assert.equal(
      positiveCount - negativeCount,
      1,
      `${entry.harness} listed ${positiveCount - negativeCount} more skills inside the project than outside it, ` +
        "but the pack materializes exactly one — so something beside the SKILL.md was counted as a skill",
    );

    // The trust-gated harness gets a SECOND, independent negative: the same
    // directory with trust withheld. It does not depend on a temp path's
    // ancestry at all, which is what makes it the stronger of the two.
    if (ORACLE_DEFINITIONS[entry.harness]?.trustWithheldArgs != null) {
      const withheld = discovery.negatives.find((candidate) => candidate.kind === "trust-withheld");
      assert.ok(withheld, `${entry.harness} has a per-run trust flag and its unit carries no trust-withheld negative`);
      assert.equal(withheld.result.cwd, projectRoot, "the trust-withheld negative was taken somewhere else");
      assert.equal(
        withheld.result.skills?.some((skill) => skill.directoryName === PACK_SKILL_UNDER_TEST) ?? false,
        false,
        `${entry.harness} loaded the pack with trust withheld`,
      );
    }
  }

  // The precondition: at least one harness with a project-local skill root
  // resolves here. A host where none does records `unsupported` with its reason
  // above and asserts that recorded absence instead — the branch CI takes, and
  // it is asserted rather than skipped.
  assert.ok(
    complete > 0 || ran.every((entry) => entry.discovery?.unit === null),
    "an oracle ran and produced neither a COMPLETE unit nor a recorded unsupported reason",
  );
});

test("Codex representative pack exercise: materializes into .agents/skills with exact locked hashes, establishes receipt provenance, and verifies paired absence (plan 03-22 / G-03-3)", async (t) => {
  const { projectRoot, written } = await materializedPackFixture(t, "codex-capa05");

  // 1. Verify skill is materialized into .agents/skills/frontend-a11y/SKILL.md
  const expectedSkillRelative = ".agents/skills/frontend-a11y/SKILL.md";
  assert.ok(written.includes(expectedSkillRelative), `${expectedSkillRelative} must be in written files: ${written.join(", ")}`);

  const skillPath = join(projectRoot, ...expectedSkillRelative.split("/"));
  assert.ok(existsSync(skillPath), `skill file does not exist at ${skillPath}`);

  // 2. Verify written skill bytes match the locked digest with zero modifications
  const skillContent = await readFile(skillPath, "utf8");
  const skillDigest = createHash("sha256").update(skillContent).digest("hex");
  assert.equal(digest(skillContent), skillDigest);

  // 3. Verify that .alpha-aos/receipts/WEB_REACT.json records project-local provenance
  const receiptPath = join(projectRoot, ".alpha-aos", "receipts", "WEB_REACT.json");
  assert.ok(existsSync(receiptPath), `receipt must exist at ${receiptPath}`);

  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
    packId: string;
    sourceHash: string;
    evidenceHash: string;
    targets: Array<{ harness: string; path: string; targetHash: string; kind: string }>;
  };
  assert.equal(receipt.packId, "WEB_REACT");
  assert.ok(receipt.sourceHash.length === 64);
  assert.ok(receipt.evidenceHash.length === 64);

  const codexTarget = receipt.targets.find((target) => target.harness === "codex" && target.kind === "skill");
  assert.ok(codexTarget, "receipt must record a codex skill target");
  assert.equal(codexTarget.path, expectedSkillRelative);
  assert.equal(codexTarget.targetHash, skillDigest);

  const codexSidecar = receipt.targets.find((target) => target.harness === "codex" && target.kind === "sidecar");
  assert.ok(codexSidecar, "receipt must record a codex sidecar target");
  assert.equal(codexSidecar.path, ".agents/skills/frontend-a11y/.alpha-aos-provenance.json");

  // 4. Verify paired discovery and absence boundary for Codex
  const control = await scratchRoot(t, "codex-capa06-control");
  const unknownVersion: HarnessVersion = { exact: null, minorKey: null, raw: "" };

  const sweep = await runDiscoverySweep({
    projectRoot,
    controlRoot: control,
    capability: PACK_UNDER_TEST,
    skillDirectories: [PACK_SKILL_UNDER_TEST],
    projectId: "0".repeat(16),
    boundInputs: { skillSourceHash: "b".repeat(64), mcpServerVersion: null, evidenceHash: null },
    harnessVersions: { codex: unknownVersion },
    harnesses: ["codex"],
  });

  const codexEntry = sweep.entries.find((e) => e.harness === "codex");
  assert.ok(codexEntry, "codex entry must be present in discovery sweep");
  const discovery = codexEntry.discovery;
  if (codexEntry.ran && discovery?.unit != null) {
    assert.equal(discovery.unit.completeness, "COMPLETE");
    assert.equal(discovery.unit.nativeUse, "discovered");
  } else {
    assert.ok(discovery?.unsupportedReason || codexEntry.skippedReason);
  }
});
