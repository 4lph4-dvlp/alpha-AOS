import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { approveTaskContract, previewTaskContract } from "../../src/core/task-contract.js";
import { packageRoot } from "../../src/core/paths.js";
import type * as TaskRun from "../../src/core/task-run.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  staticReviewerPort,
  writeTaskContract,
} from "../helpers/task-fixture.js";

// The producer injects a MODULE, not a flag or precomputed verdict. Both controls
// call production startTask; only the violating control changes its behavior.
const subject: typeof TaskRun = await import(process.env.GSD_PROHIB_SUBJECT
  ? pathToFileURL(resolve(process.env.GSD_PROHIB_SUBJECT)).href
  : "../../src/core/task-run.js");

for (const quality of ["standard", "full"] as const) {
  test(`T30-FULL ordinary evidence ${quality === "full" ? "cannot accept full without stages" : "accepts approved standard quick"}`, async (context) => {
    const fixture = await createTaskFixture(context);
    await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot, {
      scope: { projectRoot: fixture.projectRoot, workflow: "gsd-quick", quickQuality: quality,
        summary: "Add inventory-summary CLI" },
    }));
    const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
    await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
    const { run } = await subject.startTask({
      contractPath: fixture.contractPath,
      expectedDigest: digest,
      stateRoot: fixture.stateRoot,
      packageRoot: packageRoot(),
      ports: { ...fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
        stageObservation: { supported: true, harness: "codex" } },
      gsd: { configRoot: fixture.gsdConfigRoot },
    });
    // These establish that the controller actually ran and ordinary evidence is
    // valid, so refusal cannot be credited to a dead dispatch or unrelated gate.
    assert.equal(run.gsd?.status, "verified");
    if (quality === "standard") {
      assert.equal(run.status, "accepted");
    } else {
      assert.notEqual(run.status, "accepted", "full task must refuse ordinary-only acceptance");
      assert.equal(run.gsd?.fullEvidence?.status, "missing");
      assert.equal(run.gsd.fullEvidence.missingStages.length, 7);
      const precondition = run.verdict?.preconditions.find((item) => item.id === "full-quality-stages");
      assert.equal(precondition?.satisfied, false);
      assert.match(precondition?.reason ?? "", /missing required full stages/u);
    }
  });
}
