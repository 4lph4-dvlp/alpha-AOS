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
  ORACLE_DEFINITIONS,
  ORACLE_PLACEHOLDER_PROMPT,
  PI_GET_COMMANDS_REQUEST,
  runDiscoveryOracle,
} from "../src/adapters/capability-oracle.js";
import type { DiscoveryResult, OracleDefinition } from "../src/adapters/capability-oracle.js";
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
