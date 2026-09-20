#!/usr/bin/env node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  runBrownfieldLifecycle,
  setupBrownfieldFixture,
} from "../dist/src/core/brownfield-proof.js";

export async function runBrownfieldProof() {
  const sandbox = await mkdtemp(join(tmpdir(), "alpha-aos-brownfield-proof-"));
  const fixture = await setupBrownfieldFixture(join(sandbox, "repository"));
  const started = performance.now();
  try {
    process.stdout.write(`brownfield-proof sandbox=${sandbox}\n`);
    process.stdout.write(`baseline git=${fixture.headCommit} planning=${fixture.baselinePlanningDigest}\n`);
    const report = await runBrownfieldLifecycle(fixture);
    for (const [index, step] of report.steps.entries()) {
      process.stdout.write(`[${index + 1}/5] ${step.name.toUpperCase()} PASS ${step.elapsedMs}ms — ${step.detail}\n`);
    }
    process.stdout.write(`context7 tools=${report.context7.tools.join(",")} library=${report.context7.libraryId} mode=${report.context7.mode}\n`);
    process.stdout.write(`gate security-review=${report.securityGate.initialStatus}->${report.securityGate.finalStatus}\n`);
    process.stdout.write(`planning hash=${report.handoff.beforePlanningDigest}->${report.cleanup.planningDigest}\n`);
    process.stdout.write(`BROWNFIELD PROOF PASSED in ${Math.round(performance.now() - started)}ms\n`);
    return report;
  } finally {
    await fixture.cleanup();
    await rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  runBrownfieldProof().catch((error) => {
    process.stderr.write(`BROWNFIELD PROOF FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
