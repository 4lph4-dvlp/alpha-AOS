import assert from "node:assert/strict";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { TaskReproductionConfirmation } from "../src/core/task-check.js";
import { approveTaskContract, previewTaskContract, type TaskContract } from "../src/core/task-contract.js";
import {
  readTaskDecisionLog,
  type ControllerDispatchRequest,
  type ControllerDispatchResult,
  type ControllerPort,
  type ReviewerPort,
  type ReviewRequest,
  type TaskDecision,
  type TaskMeasurement,
  type TaskReviewReport,
  type TaskRunRecord,
} from "../src/core/task-run.js";
import {
  assessTaskReview,
  reduceTaskVerdict,
  taskNextAction,
  type TaskPrecondition,
  type TaskReviewAssessment,
} from "../src/core/task-verdict.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeInventorySummaryImplementation,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

// ---------------------------------------------------------------------------
// Pure reducer inputs
// ---------------------------------------------------------------------------

const ARTIFACT = "a".repeat(64);
const CONTRACT_DIGEST = "c".repeat(64);
const REQUEST = { requestId: "request-1", sessionId: "session-1", contractDigest: CONTRACT_DIGEST, artifactDigest: ARTIFACT };
const THREE_ROWS = "sku,qty\nC-1,1\nC-2,2\nC-3,3\n";
const OVERFIT_STDOUT = "{\"rows\":0,\"totalQuantity\":0,\"skus\":{}}";

function contract(): TaskContract {
  return inventorySummaryContract("project");
}

function measured(criterionId: string, outcome: TaskMeasurement["outcome"], cause: TaskMeasurement["cause"] = "none"): TaskMeasurement {
  return {
    criterionId,
    outcome,
    exitCode: outcome === "unavailable" ? null : 0,
    stdoutSha256: outcome === "unavailable" ? null : "b".repeat(64),
    detail: `${criterionId} measured ${outcome}`,
    cause,
    measuredBy: "contract",
    substituteDecisionId: null,
  };
}

function bothPass(): TaskMeasurement[] {
  return [measured("valid-summary", "pass"), measured("invalid-quantity", "pass")];
}

type ReportRow = TaskReviewReport["criteria"][number];

function reviewRow(criterionId: string, overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    criterionId,
    verdict: "pass",
    severity: "blocking",
    evidence: `Re-ran the entry for ${criterionId}.`,
    abstainReason: null,
    finding: null,
    ...overrides,
  };
}

function report(criteria: ReportRow[], overrides: Partial<TaskReviewReport> = {}): TaskReviewReport {
  return {
    schemaVersion: 1,
    requestId: REQUEST.requestId,
    contractId: "inventory-summary",
    contractDigest: CONTRACT_DIGEST,
    artifactDigest: ARTIFACT,
    criteria,
    suggestions: [],
    ...overrides,
  };
}

function assess(value: TaskReviewReport | null, portSessionId: string | null = REQUEST.sessionId): TaskReviewAssessment {
  return assessTaskReview({ report: value, request: REQUEST, portSessionId, contract: contract() });
}

const REPRODUCED_FAIL = reviewRow("valid-summary", {
  verdict: "fail",
  evidence: "Three distinct rows summarize to zero.",
  finding: {
    summary: "The program only answers the contract's own input.",
    reproduction: { inputText: THREE_ROWS, observedExitCode: 0, observedStdout: OVERFIT_STDOUT },
  },
});

function reduce(options: {
  measurements?: TaskMeasurement[];
  review?: TaskReviewAssessment;
  confirmations?: Map<string, TaskReproductionConfirmation>;
  preconditions?: TaskPrecondition[];
  refusal?: "stale-artifact" | null;
}) {
  return reduceTaskVerdict({
    contract: contract(),
    artifactDigest: ARTIFACT,
    measurements: options.measurements ?? bothPass(),
    review: options.review ?? assess(report([reviewRow("valid-summary"), reviewRow("invalid-quantity")])),
    confirmations: options.confirmations ?? new Map(),
    preconditions: options.preconditions ?? [],
    refusal: options.refusal ?? null,
  });
}

function rowOf(verdict: ReturnType<typeof reduce>, id: string) {
  const row = verdict.rows.find((entry) => entry.criterionId === id);
  assert.ok(row !== undefined, `row ${id}`);
  return row;
}

// ---------------------------------------------------------------------------
// End-to-end helpers
// ---------------------------------------------------------------------------

const OVERFIT_PROGRAM = [
  "import { readFileSync } from \"node:fs\";",
  "const text = readFileSync(process.argv[2], \"utf8\");",
  "if (text === \"sku,qty\\nA-100,3\\nB-200,5\\nA-100,2\\n\") {",
  "  process.stdout.write(JSON.stringify({ rows: 3, totalQuantity: 10, skus: { \"A-100\": 5, \"B-200\": 5 } }) + \"\\n\");",
  "} else if (text === \"sku,qty\\nA-100,3\\nB-200,five\\n\") {",
  "  process.stderr.write(JSON.stringify({ error: \"invalid-quantity\", line: 3 }) + \"\\n\");",
  "  process.exit(2);",
  "} else {",
  "  process.stdout.write(JSON.stringify({ rows: 0, totalQuantity: 0, skus: {} }) + \"\\n\");",
  "}",
  "",
].join("\n");

async function approvedFixture(fixture: TaskFixture): Promise<string> {
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  return preview.digest;
}

function controllerDouble(act: (request: ControllerDispatchRequest) => Promise<void>): ControllerPort {
  return {
    async dispatch(request: ControllerDispatchRequest): Promise<ControllerDispatchResult> {
      await act(request);
      return {
        harness: "codex",
        version: "fixture",
        executable: null,
        sessionId: `fixture-controller-${request.runId}`,
        exitCode: 0,
        processCode: "ok",
        terminal: "completed",
        claim: { status: "completed", summary: "Done.", authorityRequest: null, gsdQuickId: null },
        detail: null,
      };
    },
  };
}

async function writeProgram(projectRoot: string, name: string, source: string): Promise<void> {
  await mkdir(join(projectRoot, "bin"), { recursive: true });
  await writeFile(join(projectRoot, "bin", name), source, "utf8");
}

async function writeDecisionLog(request: ControllerDispatchRequest, lines: string[]): Promise<void> {
  const path = join(request.projectRoot, ...request.decisionLogPath.split("/"));
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function decisionLine(overrides: Partial<Record<keyof TaskDecision, unknown>> = {}): string {
  return JSON.stringify({
    id: "d-1",
    at: "2026-09-30T00:00:00.000Z",
    category: "implementation",
    choice: "Parse the CSV line by line without a dependency.",
    rationale: "The contract forbids dependencies and the input is small.",
    criterionIds: ["valid-summary"],
    substitute: null,
    ...overrides,
  });
}

function overfitReview(observedStdout: string) {
  return (request: ReviewRequest) => {
    const base = passingReview(request);
    return {
      ...base,
      criteria: base.criteria.map((row) =>
        row.criterionId === "valid-summary"
          ? {
              ...row,
              verdict: "fail" as const,
              evidence: "A different three-row inventory summarizes to zero rows.",
              finding: {
                summary: "The program answers only the contract's own input.",
                reproduction: { inputText: THREE_ROWS, observedExitCode: 0, observedStdout },
              },
            }
          : row,
      ),
    };
  };
}

async function run(
  fixture: TaskFixture,
  digest: string,
  controller: ControllerPort,
  review: ((request: ReviewRequest) => unknown) | ReviewerPort = passingReview,
): Promise<TaskRunRecord> {
  const reviewer = typeof review === "function" ? staticReviewerPort(review) : review;
  const { run: record } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller, reviewer }),
    expectedDigest: digest,
  });
  return record;
}

// ---------------------------------------------------------------------------
// Pure reduction
// ---------------------------------------------------------------------------

test("a measured fail is a fail row whatever the review says", () => {
  const measurements = [measured("valid-summary", "fail"), measured("invalid-quantity", "pass")];
  const reviews = [
    assess(report([reviewRow("valid-summary"), reviewRow("invalid-quantity")])),
    assess(report([reviewRow("valid-summary", { verdict: "unknown", abstainReason: "unclear" }), reviewRow("invalid-quantity")])),
    assess(null),
    assess(report([reviewRow("valid-summary")], { artifactDigest: "0".repeat(64) })),
  ];
  for (const review of reviews) {
    const verdict = reduce({ measurements, review });
    assert.equal(rowOf(verdict, "valid-summary").verdict, "fail");
    assert.equal(verdict.overall, "rejected");
  }
});

test("a measured pass with a review pass is a pass row and an accepted run", () => {
  const verdict = reduce({});
  assert.deepEqual(verdict.rows.map((row) => row.verdict), ["pass", "pass"]);
  assert.equal(verdict.overall, "accepted");
  assert.equal(verdict.refusal, null);
  for (const row of verdict.rows) {
    assert.equal(row.artifactDigest, ARTIFACT);
    assert.equal(row.nextAction, null);
    assert.equal(row.review?.confirmed, null);
  }
});

test("a measured pass with an abstaining review is unknown and quotes the abstain reason", () => {
  const review = assess(
    report([
      reviewRow("valid-summary", { verdict: "unknown", abstainReason: "The criterion does not say whether skus are case-sensitive." }),
      reviewRow("invalid-quantity"),
    ]),
  );
  const verdict = reduce({ review });
  const row = rowOf(verdict, "valid-summary");
  assert.equal(row.verdict, "unknown");
  assert.match(row.nextAction ?? "", /case-sensitive/u);
  assert.match(row.nextAction ?? "", /clarify the criterion/iu);
  assert.equal(verdict.overall, "unknown");
});

test("a measured pass with a confirmed blocking reproduction is a fail row showing both records", () => {
  const review = assess(report([REPRODUCED_FAIL, reviewRow("invalid-quantity")]));
  const confirmations = new Map([["valid-summary", { confirmed: true, detail: "alpha-AOS reproduced the observation." }]]);
  const verdict = reduce({ review, confirmations });
  const row = rowOf(verdict, "valid-summary");
  assert.equal(row.verdict, "fail");
  assert.equal(row.measured.outcome, "pass");
  assert.equal(row.review?.verdict, "fail");
  assert.equal(row.review?.confirmed, true);
  assert.equal(row.review?.confirmationDetail, "alpha-AOS reproduced the observation.");
  assert.equal(verdict.overall, "rejected");
});

test("an unconfirmed, unreproducible or advisory review failure is unknown and never rejected or accepted", () => {
  const cases: Array<{ row: ReportRow; confirmations: Map<string, TaskReproductionConfirmation> }> = [
    { row: REPRODUCED_FAIL, confirmations: new Map([["valid-summary", { confirmed: false, detail: "different stdout" }]]) },
    { row: REPRODUCED_FAIL, confirmations: new Map() },
    { row: reviewRow("valid-summary", { verdict: "fail", finding: { summary: "Looks wrong.", reproduction: null } }), confirmations: new Map() },
    { row: reviewRow("valid-summary", { verdict: "fail", finding: null }), confirmations: new Map() },
    {
      row: { ...REPRODUCED_FAIL, severity: "advisory" },
      confirmations: new Map([["valid-summary", { confirmed: true, detail: "reproduced" }]]),
    },
  ];
  for (const entry of cases) {
    const verdict = reduce({ review: assess(report([entry.row, reviewRow("invalid-quantity")])), confirmations: entry.confirmations });
    const row = rowOf(verdict, "valid-summary");
    assert.equal(row.verdict, "unknown");
    assert.equal(verdict.overall, "unknown");
    assert.equal(row.review?.verdict, "fail");
    assert.match(row.nextAction ?? "", /inspect the finding/iu);
  }
});

test("an unavailable measurement is unknown even with a review pass and names its next action", () => {
  const expectations: Array<[TaskMeasurement["cause"], RegExp]> = [
    ["entry-missing", /measurement-substitute/u],
    ["timeout", /hang/u],
    ["output-capped", /64 KiB/u],
    ["spawn-failed", /Node environment/u],
  ];
  for (const [cause, pattern] of expectations) {
    const verdict = reduce({ measurements: [measured("valid-summary", "unavailable", cause), measured("invalid-quantity", "pass")] });
    const row = rowOf(verdict, "valid-summary");
    assert.equal(row.verdict, "unknown", cause);
    assert.match(row.nextAction ?? "", pattern, cause);
    assert.equal(verdict.overall, "unknown");
  }
});

test("an unsatisfied precondition or a refusal keeps an all-pass run from being accepted", () => {
  const precondition = { id: "gsd-evidence", satisfied: false, reason: "No GSD quick task was recorded.", nextAction: "Re-run through gsd-quick." };
  const blocked = reduce({ preconditions: [precondition, { ...precondition, id: "effect-audit", satisfied: true }] });
  assert.equal(blocked.overall, "unknown");
  assert.equal(blocked.preconditions.length, 2);
  assert.equal(taskNextAction("precondition", { precondition }), "Re-run through gsd-quick.");

  const stale = reduce({ refusal: "stale-artifact" });
  assert.equal(stale.refusal, "stale-artifact");
  assert.notEqual(stale.overall, "accepted");
});

test("a review bound to another request, contract, artifact or session is stale and refused", () => {
  const good = [reviewRow("valid-summary"), reviewRow("invalid-quantity")];
  const staleReviews = [
    assess(report(good, { requestId: "request-2" })),
    assess(report(good, { contractDigest: "d".repeat(64) })),
    assess(report(good, { artifactDigest: "e".repeat(64) })),
    assess(report(good), "session-2"),
    assess(report(good), null),
  ];
  for (const review of staleReviews) {
    assert.equal(review.status, "stale");
    const verdict = reduce({ review });
    assert.equal(verdict.refusal, "stale-review");
    assert.notEqual(verdict.overall, "accepted");
    for (const row of verdict.rows) {
      assert.equal(row.review, null);
      assert.equal(row.verdict, "unknown");
      assert.match(row.nextAction ?? "", new RegExp(`current artifact ${ARTIFACT.slice(0, 12)}`, "u"));
    }
  }
});

test("duplicate or unknown criterion ids and oversized text make a review malformed", () => {
  const long = (length: number) => "x".repeat(length);
  const malformed = [
    report([reviewRow("valid-summary"), reviewRow("valid-summary"), reviewRow("invalid-quantity")]),
    report([reviewRow("valid-summary"), reviewRow("invalid-quantity"), reviewRow("no-such-criterion")]),
    report([reviewRow("valid-summary", { evidence: long(2001) }), reviewRow("invalid-quantity")]),
    report([reviewRow("valid-summary", { verdict: "fail", finding: { summary: long(1001), reproduction: null } })]),
    report([
      reviewRow("valid-summary", {
        verdict: "fail",
        finding: { summary: "s", reproduction: { inputText: long(4097), observedExitCode: 0, observedStdout: "" } },
      }),
    ]),
    report([
      reviewRow("valid-summary", {
        verdict: "fail",
        finding: { summary: "s", reproduction: { inputText: "", observedExitCode: 0, observedStdout: long(4097) } },
      }),
    ]),
    report([reviewRow("valid-summary"), reviewRow("invalid-quantity")], { suggestions: Array.from({ length: 21 }, () => "s") }),
    report([reviewRow("valid-summary"), reviewRow("invalid-quantity")], { suggestions: [long(501)] }),
  ];
  for (const value of malformed) {
    const review = assess(value);
    assert.equal(review.status, "malformed");
    assert.ok(review.issues.length > 0);
    const verdict = reduce({ review });
    assert.equal(verdict.refusal, null);
    assert.equal(verdict.overall, "unknown");
    for (const row of verdict.rows) {
      assert.equal(row.review, null);
      assert.match(row.nextAction ?? "", /re-run the review/iu);
    }
  }
  const atBounds = assess(
    report([reviewRow("valid-summary", { evidence: long(2000) }), reviewRow("invalid-quantity")], {
      suggestions: Array.from({ length: 20 }, () => long(500)),
    }),
  );
  assert.equal(atBounds.status, "ok");
});

test("a missing report leaves every measured-pass row unknown with a re-run review action", () => {
  const review = assess(null);
  assert.equal(review.status, "missing");
  const verdict = reduce({ review });
  assert.equal(verdict.overall, "unknown");
  for (const row of verdict.rows) {
    assert.equal(row.verdict, "unknown");
    assert.equal(row.nextAction, taskNextAction("review-missing", { artifactDigest: ARTIFACT }));
  }
});

test("a report with no rows, or one omitting a criterion, leaves each missing criterion unknown", () => {
  const empty = reduce({ review: assess(report([])) });
  assert.equal(empty.overall, "unknown");
  for (const row of empty.rows) {
    assert.equal(row.verdict, "unknown");
    assert.match(row.nextAction ?? "", /re-run the review/iu);
  }
  const partial = reduce({ review: assess(report([reviewRow("valid-summary")])) });
  assert.equal(rowOf(partial, "valid-summary").verdict, "pass");
  assert.equal(rowOf(partial, "invalid-quantity").verdict, "unknown");
  assert.equal(partial.overall, "unknown");
});

test("rows follow the contract's sorted criterion ids whatever the report order", () => {
  const forward = reduce({ review: assess(report([reviewRow("valid-summary"), reviewRow("invalid-quantity")])) });
  const reverse = reduce({
    measurements: [measured("invalid-quantity", "pass"), measured("valid-summary", "pass")],
    review: assess(report([reviewRow("invalid-quantity"), reviewRow("valid-summary")])),
  });
  assert.deepEqual(forward.rows.map((row) => row.criterionId), ["invalid-quantity", "valid-summary"]);
  assert.deepEqual(reverse.rows, forward.rows);
});

test("reviewer suggestions are carried as notes and never change a verdict", () => {
  const review = assess(
    report([reviewRow("valid-summary"), reviewRow("invalid-quantity")], { suggestions: ["Consider a --pretty flag."] }),
  );
  assert.deepEqual(review.suggestions, ["Consider a --pretty flag."]);
  assert.equal(reduce({ review }).overall, "accepted");
});

test("next actions are fixed sentences bound to the artifact", () => {
  assert.match(taskNextAction("review-missing", { artifactDigest: ARTIFACT }), new RegExp(`re-run the review on artifact ${ARTIFACT.slice(0, 12)}`, "iu"));
  assert.match(taskNextAction("review-malformed", { artifactDigest: ARTIFACT }), new RegExp(ARTIFACT.slice(0, 12), "u"));
  assert.match(taskNextAction("stale", { artifactDigest: ARTIFACT }), new RegExp(`current artifact ${ARTIFACT.slice(0, 12)}`, "u"));
  assert.match(taskNextAction("entry-missing", { entry: "bin/inventory-summary.mjs" }), /allowed roots/u);
  assert.match(taskNextAction("abstain", { abstainReason: "x".repeat(900) }), /\.\.\./u);
  assert.ok(taskNextAction("abstain", { abstainReason: "x".repeat(900) }).length < 600);
});

// ---------------------------------------------------------------------------
// End to end through startTask
// ---------------------------------------------------------------------------

test("the reference-correct run is accepted and records an absent decision log", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const record = await run(fixture, digest, referenceControllerPort("correct"));
  assert.equal(record.status, "accepted");
  assert.equal(record.verdict?.overall, "accepted");
  assert.deepEqual(record.verdict?.preconditions, []);
  assert.deepEqual(record.decisions, []);
  assert.deepEqual(record.decisionLog, { status: "absent", reason: null });
});

test("an overfit program with a reproduction it really exhibits is rejected with both records", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const controller = controllerDouble((request) => writeProgram(request.projectRoot, "inventory-summary.mjs", OVERFIT_PROGRAM));
  const record = await run(fixture, digest, controller, overfitReview(`${OVERFIT_STDOUT}\n`));

  assert.equal(record.verdict?.overall, "rejected");
  assert.equal(record.status, "rejected");
  const row = record.verdict?.rows.find((entry) => entry.criterionId === "valid-summary");
  assert.ok(row !== undefined);
  assert.equal(row.verdict, "fail");
  assert.equal(row.measured.outcome, "pass");
  assert.equal(row.review?.verdict, "fail");
  assert.equal(row.review?.confirmed, true);
  assert.equal(record.verdict?.rows.find((entry) => entry.criterionId === "invalid-quantity")?.verdict, "pass");
});

test("the same overfit run with a fabricated observation is unknown, not rejected", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const controller = controllerDouble((request) => writeProgram(request.projectRoot, "inventory-summary.mjs", OVERFIT_PROGRAM));
  const record = await run(fixture, digest, controller, overfitReview("{\"rows\":3,\"totalQuantity\":42,\"skus\":{}}"));

  assert.equal(record.verdict?.overall, "unknown");
  const row = record.verdict?.rows.find((entry) => entry.criterionId === "valid-summary");
  assert.equal(row?.verdict, "unknown");
  assert.equal(row?.measured.outcome, "pass");
  assert.equal(row?.review?.confirmed, false);
});

test("a project file changed before the review returns is refused as stale-artifact", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const inner = staticReviewerPort(passingReview);
  const record = await run(fixture, digest, referenceControllerPort("correct"), {
    async review(request) {
      // The project changes while the review is still out: the verdict must notice.
      await writeFile(join(fixture.projectRoot, "bin", "late.mjs"), "export {};\n", "utf8");
      return inner.review(request);
    },
  });
  assert.equal(record.verdict?.refusal, "stale-artifact");
  assert.notEqual(record.verdict?.overall, "accepted");
  assert.notEqual(record.status, "accepted");
});

test("a valid decision log is copied into the run record", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const controller = controllerDouble(async (request) => {
    await writeInventorySummaryImplementation(request.projectRoot, "correct");
    await writeDecisionLog(request, [
      decisionLine(),
      decisionLine({ id: "d-2", category: "verification", choice: "Add a three-row test.", criterionIds: ["valid-summary", "invalid-quantity"] }),
    ]);
  });
  const record = await run(fixture, digest, controller);
  assert.deepEqual(record.decisionLog, { status: "valid", reason: null });
  assert.deepEqual(record.decisions.map((entry) => [entry.id, entry.category, entry.criterionIds]), [
    ["d-1", "implementation", ["valid-summary"]],
    ["d-2", "verification", ["valid-summary", "invalid-quantity"]],
  ]);
  assert.equal(record.decisions[0]?.rationale, "The contract forbids dependencies and the input is small.");
  assert.equal(record.status, "accepted");
});

test("a malformed decision line makes the log invalid with its line number and no substitute", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const controller = controllerDouble(async (request) => {
    const source = await implementationSource(request);
    await writeProgram(request.projectRoot, "summary.mjs", source);
    await writeDecisionLog(request, [
      decisionLine({
        category: "measurement-substitute",
        substitute: { criterionId: "valid-summary", entry: "bin/summary.mjs" },
      }),
      "{ not json",
    ]);
  });
  const record = await run(fixture, digest, controller);
  assert.equal(record.decisionLog?.status, "invalid");
  assert.match(record.decisionLog?.reason ?? "", /line 2/u);
  assert.deepEqual(record.decisions, []);
  const row = record.verdict?.rows.find((entry) => entry.criterionId === "valid-summary");
  assert.equal(row?.measured.cause, "entry-missing");
  assert.equal(row?.measured.measuredBy, "contract");
  assert.notEqual(record.status, "accepted");
});

test("a decision that tries to carry an input or expectation is refused as invalid", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const controller = controllerDouble(async (request) => {
    await writeInventorySummaryImplementation(request.projectRoot, "off-by-one");
    await writeDecisionLog(request, [
      decisionLine({
        category: "measurement-substitute",
        substitute: { criterionId: "valid-summary", entry: "bin/inventory-summary.mjs", expect: { exitCode: 0 } },
      }),
    ]);
  });
  const record = await run(fixture, digest, controller);
  assert.equal(record.decisionLog?.status, "invalid");
  assert.match(record.decisionLog?.reason ?? "", /line 1/u);
  assert.equal(record.verdict?.overall, "rejected", "the contract's expectation still decides");
});

test("a valid measurement-substitute decision measures a missing-entry criterion through its entry", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const controller = controllerDouble(async (request) => {
    const source = await implementationSource(request);
    await writeProgram(request.projectRoot, "summary.mjs", source);
    await writeDecisionLog(request, [
      decisionLine({
        id: "sub-valid",
        category: "measurement-substitute",
        substitute: { criterionId: "valid-summary", entry: "bin/summary.mjs" },
      }),
      decisionLine({
        id: "sub-invalid",
        category: "measurement-substitute",
        criterionIds: ["invalid-quantity"],
        substitute: { criterionId: "invalid-quantity", entry: "bin/summary.mjs" },
      }),
    ]);
  });
  const record = await run(fixture, digest, controller);
  assert.equal(record.decisionLog?.status, "valid");
  const valid = record.verdict?.rows.find((entry) => entry.criterionId === "valid-summary");
  assert.equal(valid?.measured.measuredBy, "substitute");
  assert.equal(valid?.measured.substituteDecisionId, "sub-valid");
  assert.equal(valid?.measured.outcome, "pass");
  const invalid = record.verdict?.rows.find((entry) => entry.criterionId === "invalid-quantity");
  assert.equal(invalid?.measured.substituteDecisionId, "sub-invalid");
});

test("the decision log reader refuses oversize, credential-bearing and linked logs", async (context) => {
  const fixture = await createTaskFixture(context);
  const runId = "0000abcd-0123abcd";
  const directory = join(fixture.projectRoot, ".alpha-aos", "task-runs", runId);
  const path = join(directory, "decisions.jsonl");

  assert.deepEqual(await readTaskDecisionLog({ projectRoot: fixture.projectRoot, runId }), {
    status: "absent",
    entries: [],
    reason: null,
  });

  await mkdir(directory, { recursive: true });
  await writeFile(path, `${Array.from({ length: 201 }, (_, index) => decisionLine({ id: `d-${index}` })).join("\n")}\n`, "utf8");
  const tooMany = await readTaskDecisionLog({ projectRoot: fixture.projectRoot, runId });
  assert.equal(tooMany.status, "invalid");
  assert.deepEqual(tooMany.entries, []);

  await writeFile(path, `${decisionLine({ rationale: `token sk-${"a".repeat(24)}` })}\n`, "utf8");
  const secret = await readTaskDecisionLog({ projectRoot: fixture.projectRoot, runId });
  assert.equal(secret.status, "invalid");
  assert.match(secret.reason ?? "", /line 1/u);
  assert.doesNotMatch(secret.reason ?? "", /sk-a/u);

  await writeFile(path, "x".repeat(256 * 1024 + 1), "utf8");
  assert.equal((await readTaskDecisionLog({ projectRoot: fixture.projectRoot, runId })).status, "invalid");

  // A linked run directory could point the log anywhere; a junction needs no privilege on Windows.
  const linkedRun = "0000abcd-0123abce";
  const elsewhere = join(fixture.scratch, "elsewhere");
  await mkdir(elsewhere, { recursive: true });
  await writeFile(join(elsewhere, "decisions.jsonl"), `${decisionLine()}
`, "utf8");
  let linked = true;
  try {
    await symlink(elsewhere, join(fixture.projectRoot, ".alpha-aos", "task-runs", linkedRun), "junction");
  } catch {
    linked = false;
  }
  if (linked) {
    const viaLink = await readTaskDecisionLog({ projectRoot: fixture.projectRoot, runId: linkedRun });
    assert.equal(viaLink.status, "invalid");
    assert.match(viaLink.reason ?? "", /link/u);
  }

  await assert.rejects(readTaskDecisionLog({ projectRoot: fixture.projectRoot, runId: "../escape" }));
});

// The correct reference source, taken from the fixture helper so the
// substitute tests exercise the same program the accepted run uses.
async function implementationSource(request: ControllerDispatchRequest): Promise<string> {
  await writeInventorySummaryImplementation(request.projectRoot, "correct");
  const path = join(request.projectRoot, "bin", "inventory-summary.mjs");
  const source = await readFile(path, "utf8");
  await rm(path);
  return source;
}
