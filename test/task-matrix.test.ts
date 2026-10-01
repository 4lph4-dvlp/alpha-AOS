import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { HarnessId } from "../src/types.js";
import {
  ALL_HARNESSES,
  ALL_ROLES,
  verifyRoleCapabilities,
  type Role,
} from "../src/adapters/task-agents.js";
import {
  writeHarnessRoleReceipt,
  type HarnessRoleReceipt,
} from "../src/adapters/task-receipts.js";
import type { TaskAgentPolicy } from "../src/core/task-contract.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-task-matrix-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function mockReceipt(harness: HarnessId, role: Role): HarnessRoleReceipt {
  return {
    schemaVersion: 1,
    harness,
    role,
    version: "1.0.0",
    binarySha256: "0".repeat(64),
    executable: `/usr/local/bin/${harness}`,
    probedAt: new Date().toISOString(),
    capabilities: {
      invoked: true,
      cancelled: true,
      outputParsed: true,
      readOnlyGuaranteed: role === "reviewer",
    },
    sampleDigest: "digest-12345",
  };
}

test("deterministic 125-triple capability matrix: all permutations evaluate deterministically (ROL-01, D-03)", async (context) => {
  const receiptsRoot = await scratch(context, "matrix-all");

  // Populate mock receipts for all 5 harnesses and all 3 roles (15 receipts total)
  for (const harness of ALL_HARNESSES) {
    for (const role of ALL_ROLES) {
      await writeHarnessRoleReceipt(mockReceipt(harness, role), receiptsRoot);
    }
  }

  let count = 0;
  for (const c of ALL_HARNESSES) {
    for (const e of ALL_HARNESSES) {
      for (const r of ALL_HARNESSES) {
        count++;
        const policy: TaskAgentPolicy = {
          controller: c,
          executor: e,
          reviewer: r,
          reviewerSession: "fresh-read-only",
        };

        const assessment = await verifyRoleCapabilities(policy, {
          receiptsRoot,
          probeVersion: false, // In matrix unit tests, receiptsRoot validates stored proofs
        });

        assert.equal(
          assessment.supported,
          true,
          `Expected triple (${c}, ${e}, ${r}) to be supported when receipts exist`,
        );
        assert.deepEqual(assessment.missingProof, []);
        assert.equal(assessment.controller.harness, c);
        assert.equal(assessment.executor.harness, e);
        assert.equal(assessment.reviewer.harness, r);
      }
    }
  }

  assert.equal(count, 125, "Must evaluate exactly 5 × 5 × 5 = 125 permutations (ROL-01, D-03)");
});

test("fail-closed missing proof attribution names specific role and harness (ROL-01, D-01)", async (context) => {
  const receiptsRoot = await scratch(context, "matrix-missing");

  // Populate all receipts except pi controller and antigravity reviewer
  for (const harness of ALL_HARNESSES) {
    for (const role of ALL_ROLES) {
      if (harness === "pi" && role === "controller") continue;
      if (harness === "antigravity" && role === "reviewer") continue;
      await writeHarnessRoleReceipt(mockReceipt(harness, role), receiptsRoot);
    }
  }

  // 1. Missing pi controller
  const piControllerPolicy: TaskAgentPolicy = {
    controller: "pi",
    executor: "codex",
    reviewer: "claude",
    reviewerSession: "fresh-read-only",
  };
  const piAssessment = await verifyRoleCapabilities(piControllerPolicy, {
    receiptsRoot,
    probeVersion: false,
  });
  assert.equal(piAssessment.supported, false);
  assert.ok(
    piAssessment.missingProof.includes(
      "controller pi: no native invocation receipt for controller (ROL-01, D-01)",
    ),
    `Expected missing proof to explicitly name missing pi controller: ${JSON.stringify(piAssessment.missingProof)}`,
  );

  // 2. Missing antigravity reviewer
  const agyReviewerPolicy: TaskAgentPolicy = {
    controller: "codex",
    executor: "codex",
    reviewer: "antigravity",
    reviewerSession: "fresh-read-only",
  };
  const agyAssessment = await verifyRoleCapabilities(agyReviewerPolicy, {
    receiptsRoot,
    probeVersion: false,
  });
  assert.equal(agyAssessment.supported, false);
  assert.ok(
    agyAssessment.missingProof.includes(
      "reviewer antigravity: no native invocation receipt for reviewer (ROL-01, D-01)",
    ),
    `Expected missing proof to explicitly name missing antigravity reviewer: ${JSON.stringify(agyAssessment.missingProof)}`,
  );

  // 3. Completely empty receipts directory rejects all roles with distinct explicit errors
  const emptyRoot = await scratch(context, "matrix-empty");
  const emptyAssessment = await verifyRoleCapabilities(
    { controller: "hermes", executor: "pi", reviewer: "antigravity", reviewerSession: "fresh-read-only" },
    { receiptsRoot: emptyRoot, probeVersion: false },
  );
  assert.equal(emptyAssessment.supported, false);
  assert.equal(emptyAssessment.missingProof.length, 3);
  assert.ok(emptyAssessment.missingProof[0]?.includes("controller hermes"));
  assert.ok(emptyAssessment.missingProof[1]?.includes("executor pi"));
  assert.ok(emptyAssessment.missingProof[2]?.includes("reviewer antigravity"));
});
