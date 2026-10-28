import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  hasExecutionSummaries,
  hasPassedVerification,
  hasNyquistValidation,
  passesMilestoneReview,
} from "../src/core/task-gsd-gates.js";
import { discoverPhaseProgression } from "../src/core/task-gsd-discovery.js";

function createFixture(context: TestContext, name = "gates-fixture") {
  const root = mkdtempSync(join(tmpdir(), `alpha-aos-${name}-`));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, ".planning", "phases", "03-parser");
  mkdirSync(dir, { recursive: true });
  return {
    root,
    dir,
    write: (fileName: string, content = "") => writeFileSync(join(dir, fileName), content, "utf8"),
  };
}

test("hasExecutionSummaries rejects planning-summary collision and partial execution", (context) => {
  const f = createFixture(context, "exec-summaries");
  f.write("03-01-PLAN.md", "# Plan 1");
  f.write("03-02-PLAN.md", "# Plan 2");
  f.write("03-PLANNING-SUMMARY.md", "# Planning summary");

  // Collision with 03-PLANNING-SUMMARY.md must NOT satisfy execute gate
  assert.equal(hasExecutionSummaries(f.dir, "03"), false);

  // Partial execution (only 1 of 2 plans executed) must NOT satisfy gate
  f.write("03-01-SUMMARY.md", "# Summary 1");
  assert.equal(hasExecutionSummaries(f.dir, "03"), false);

  // Complete execution (all plans have matching summaries) must pass
  f.write("03-02-SUMMARY.md", "# Summary 2");
  assert.equal(hasExecutionSummaries(f.dir, "03"), true);
});

test("hasExecutionSummaries rejects empty phases and directories masquerading as summaries", (context) => {
  const f = createFixture(context, "exec-empty-dir");
  assert.equal(hasExecutionSummaries(f.dir, "03"), false);
  assert.equal(hasExecutionSummaries(null, "03"), false);

  f.write("03-01-PLAN.md", "# Plan 1");
  mkdirSync(join(f.dir, "03-01-SUMMARY.md"), { recursive: true });
  assert.equal(hasExecutionSummaries(f.dir, "03"), false);
});

test("hasPassedVerification checks frontmatter status and rejects gaps, stale, or missing reports", async (context) => {
  const f = createFixture(context, "verify-status");
  f.write("03-01-PLAN.md", "# Plan 1");
  f.write("03-01-SUMMARY.md", "# Summary 1");

  // Missing verification artifact
  assert.equal(await hasPassedVerification(f.dir, "03"), false);

  // Verification artifact with gaps_found
  f.write("03-VERIFICATION.md", "---\nstatus: gaps_found\n---\n# Gaps found\n");
  assert.equal(await hasPassedVerification(f.dir, "03"), false);

  // Verification artifact with human_needed
  f.write("03-VERIFICATION.md", "---\nstatus: human_needed\n---\n# Human needed\n");
  assert.equal(await hasPassedVerification(f.dir, "03"), false);

  // Verification artifact with stale
  f.write("03-VERIFICATION.md", "---\nstatus: stale\n---\n# Stale\n");
  assert.equal(await hasPassedVerification(f.dir, "03"), false);

  // Verification artifact with passed
  f.write("03-VERIFICATION.md", "---\nstatus: passed\n---\n# Verified\n");
  assert.equal(await hasPassedVerification(f.dir, "03"), true);

  // Review status is issues_found -> must reject
  f.write("03-REVIEW.md", "---\nstatus: issues_found\n---\n");
  assert.equal(await hasPassedVerification(f.dir, "03"), false);

  // Review status is clean -> must pass
  f.write("03-REVIEW.md", "---\nstatus: clean\n---\n");
  assert.equal(await hasPassedVerification(f.dir, "03"), true);
});

test("hasNyquistValidation requires validated status and nyquist_compliant true", (context) => {
  const f = createFixture(context, "nyquist");

  // Missing validation artifact
  assert.equal(hasNyquistValidation(f.dir, "03"), false);

  // Draft validation
  f.write(
    "03-VALIDATION.md",
    "---\nstatus: draft\nnyquist_compliant: false\nwave_0_complete: false\n---\n",
  );
  assert.equal(hasNyquistValidation(f.dir, "03"), false);

  // Incomplete wave 0
  f.write(
    "03-VALIDATION.md",
    "---\nstatus: validated\nnyquist_compliant: true\nwave_0_complete: false\n---\n",
  );
  assert.equal(hasNyquistValidation(f.dir, "03"), false);

  // Fully validated
  f.write(
    "03-VALIDATION.md",
    "---\nstatus: validated\nnyquist_compliant: true\nwave_0_complete: true\n---\n",
  );
  assert.equal(hasNyquistValidation(f.dir, "03"), true);
});

test("discoverPhaseProgression rejects isPhaseComplete when verification artifact has gaps_found", async (context) => {
  const f = createFixture(context, "progression-gaps");
  f.write("03-01-PLAN.md", "# Plan 01\n");
  f.write("03-01-SUMMARY.md", "# Summary 01\n");
  // Verification artifact has gaps_found
  f.write("03-VERIFICATION.md", "---\nstatus: gaps_found\n---\n# Gaps found\n");

  writeFileSync(
    join(f.root, ".planning", "STATE.md"),
    "# State\nPhase: 03 — VERIFICATION GAPS FOUND (0/13 executed)\n| 03 | 03-01 | complete |\nPhase 03: complete\n",
    "utf8",
  );

  const progression = await discoverPhaseProgression({
    projectRoot: f.root,
    phaseId: "03",
  });

  // isPhaseComplete must be false despite STATE.md having 'complete' text
  assert.equal(progression.isPhaseComplete, false);
});
