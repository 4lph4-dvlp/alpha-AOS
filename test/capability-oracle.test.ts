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
import test from "node:test";
import {
  DISCOVERY_AXES,
  isAbsoluteEitherPlatform,
  ORACLE_DEFINITIONS,
  ORACLE_PLACEHOLDER_PROMPT,
  parseClaudeInitEvent,
  parseCodexPromptInput,
  parsePiCommands,
  PI_GET_COMMANDS_REQUEST,
  readOracleOutput,
  runDiscoveryOracle,
  splitJsonLines,
} from "../src/adapters/capability-oracle.js";
import type {
  DiscoveredSkill,
  DiscoveryResult,
  OracleDefinition,
  OracleParse,
} from "../src/adapters/capability-oracle.js";
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
