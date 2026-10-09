import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateGsdPromptQuestion,
  formatNeedsInputMessage,
} from "../src/core/task-gsd-prompt.js";
import type { TaskContract } from "../src/core/task-contract.js";

function createMockContract(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    schemaVersion: 1,
    contractId: "test-contract",
    revision: 1,
    goal: "Build inventory summary tool",
    allowedRoots: ["D:/dev/alpha-AOS"],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "crit-1",
        description: "Must pass tests",
        target: "test",
        measurement: {
          kind: "command",
          command: "node",
          args: ["test.js"],
        },
      },
    ],
    resourcePolicy: {
      maxCycles: 10,
      maxWallTimeMs: 60000,
      maxTokens: 50000,
      maxCostUsd: 1.0,
      maxOutputBytes: 100000,
    },
    ...overrides,
  } as unknown as TaskContract;
}

test("evaluateGsdPromptQuestion auto-answers in-scope routine prompt with recommended default (D-01)", () => {
  const contract = createMockContract();
  const evaluation = evaluateGsdPromptQuestion(
    "Should we use TypeScript or JavaScript for the script?",
    "TypeScript",
    contract,
  );

  assert.equal(evaluation.action, "auto-answer");
  assert.equal(evaluation.answer, "TypeScript");
  assert.equal(evaluation.decision?.category, "gsd-default");
  assert.equal(evaluation.decision?.choice, "TypeScript");
  assert.deepEqual(evaluation.decision?.criterionIds, ["crit-1"]);
});

test("evaluateGsdPromptQuestion pauses with needs-input when dependency change is requested without authority (D-02)", () => {
  const contract = createMockContract({ allowedEffects: ["workspace-write"] });
  const evaluation = evaluateGsdPromptQuestion(
    "Do you want to install package lodash via npm install lodash?",
    "npm install lodash",
    contract,
  );

  assert.equal(evaluation.action, "needs-input");
  assert.match(evaluation.reason, /dependency changes which are not permitted/);
});

test("evaluateGsdPromptQuestion allows dependency change when permitted in contract allowedEffects", () => {
  const contract = createMockContract({ allowedEffects: ["dependency-change"] });
  const evaluation = evaluateGsdPromptQuestion(
    "Install package chalk?",
    "yes",
    contract,
  );

  assert.equal(evaluation.action, "auto-answer");
  assert.equal(evaluation.answer, "yes");
});

test("evaluateGsdPromptQuestion pauses with needs-input when recommended default is missing or empty (D-02)", () => {
  const contract = createMockContract();

  const evalNull = evaluateGsdPromptQuestion("Ambiguous question without default?", null, contract);
  assert.equal(evalNull.action, "needs-input");
  assert.match(evalNull.reason, /No recommended default provided/);

  const evalEmpty = evaluateGsdPromptQuestion("Ambiguous question?", "   ", contract);
  assert.equal(evalEmpty.action, "needs-input");
  assert.match(evalEmpty.reason, /No recommended default provided/);
});

test("evaluateGsdPromptQuestion pauses with needs-input when external path outside allowedRoots is referenced", () => {
  const contract = createMockContract({ allowedRoots: ["D:/dev/alpha-AOS"] });
  const evaluation = evaluateGsdPromptQuestion(
    "Can we copy files from C:/Windows/System32/secrets.txt?",
    "yes",
    contract,
  );

  assert.equal(evaluation.action, "needs-input");
  assert.match(evaluation.reason, /outside contract allowedRoots/);
});

test("formatNeedsInputMessage produces actionable terminal guidance with CLI syntax (D-03)", () => {
  const message = formatNeedsInputMessage({
    questionText: "Do you approve external network access?",
    reason: "Network access exceeds approved effects.",
    contractId: "test-contract",
    attemptIndex: 1,
    runDigest: "abcdef123456",
  });

  assert.ok(message.includes("=== PAUSED: Input Needed (needs-input) ==="));
  assert.ok(message.includes("alpha-aos task answer"));
  assert.ok(message.includes("alpha-aos task resume"));
  assert.ok(message.includes("--run abcdef123456"));
});
