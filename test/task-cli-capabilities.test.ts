import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy, type ProcessResult } from "../src/core/process.js";
import { loadTaskContract, approveTaskContract } from "../src/core/task-contract.js";
import type { TaskCheckpoint } from "../src/core/task-journal.js";
import { writeCheckpoint } from "../src/core/task-journal.js";
import {
  createCapabilityReceipt,
  writeCapabilityReceipt,
  type TaskCapabilityReceipt,
} from "../src/core/task-capability-receipts.js";
import type { TaskCapabilityReport, TaskCapabilitySummary } from "../src/core/task-capability-inventory.js";
import { planProjectCapabilities, approveProjectPlan } from "../src/core/project-plan.js";
import { formatTaskCapabilitySummary, formatTaskCapabilityDetail } from "../src/format.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const probeEnv = commandProbeEnvironment({ source: process.env });
const OUTPUT_BYTES = 256 * 1024;

function taskEnvironment(stateRoot: string): EnvironmentPolicy {
  return { ...probeEnv, literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: stateRoot } };
}

async function cli(fixture: TaskFixture, args: readonly string[]): Promise<ProcessResult> {
  return runProcess({
    executable: process.execPath,
    args: [cliEntry, "task", ...args],
    cwd: fixture.scratch,
    environment: taskEnvironment(fixture.stateRoot),
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
}

async function listing(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true });
    return entries.map((entry) => entry.replaceAll("\\", "/")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function contractFixture(
  context: Parameters<typeof createTaskFixture>[0],
  goalOverride?: string,
): Promise<{ fixture: TaskFixture; digest: string }> {
  const fixture = await createTaskFixture(context);
  const baseContract = inventorySummaryContract(fixture.projectRoot);
  const contract = goalOverride ? { ...baseContract, goal: goalOverride } : baseContract;
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  return { fixture, digest };
}

test("task plan displays task-centric capability summary in default output and performs no mutations", async (context) => {
  const { fixture, digest } = await contractFixture(
    context,
    "Implement inventory report using Context7 API documentation and Exa deep-research web search.",
  );
  const beforeState = await listing(fixture.stateRoot);

  const result = await cli(fixture, ["plan", fixture.contractPath]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const output = result.stdout.excerpt;

  assert.ok(output.includes("Task Plan: inventory-summary"));
  assert.ok(output.includes(`Contract digest: ${digest}`));
  assert.ok(output.includes("Step: execute"));
  assert.ok(output.includes("Capabilities:"));
  assert.ok(output.includes("Selected:"));
  assert.ok(output.includes("documentation-lookup"));
  assert.ok(output.includes("deep-research"));
  assert.ok(output.includes("Failed: none"));
  assert.ok(output.includes("Blocked: none"));

  // Verify full inventory is NOT unfolded in default summary
  assert.ok(!output.includes("Capability Inventory ("));

  // Verify pure read-only behavior: stateRoot is unmutated
  assert.deepEqual(await listing(fixture.stateRoot), beforeState);
});

test("task plan with empty required capabilities displays 'none' accurately", async (context) => {
  const { fixture } = await contractFixture(
    context,
    "Perform pure arithmetic validation on existing local data with no external libs or search.",
  );

  const result = await cli(fixture, ["plan", fixture.contractPath]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const output = result.stdout.excerpt;

  assert.ok(output.includes("Capabilities:"));
  assert.ok(output.includes("Selected: none"));
  assert.ok(output.includes("Failed: none"));
  assert.ok(output.includes("Blocked: none"));
  assert.ok(output.includes("Omitted: none"));
});

test("task plan --apply is refused with clear error", async (context) => {
  const { fixture } = await contractFixture(context);

  const result = await cli(fixture, ["plan", fixture.contractPath, "--apply"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr.excerpt, /`task plan` has no --apply: it reads and plans capabilities without mutations\./u);
});

test("task plan --detail displays full capability inventory, orthogonal status axes, and obligations", async (context) => {
  const { fixture } = await contractFixture(
    context,
    "Implement inventory report using Context7 API documentation and Exa deep-research web search.",
  );

  const result = await cli(fixture, ["plan", fixture.contractPath, "--detail"]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const output = result.stdout.excerpt;

  // Header and summary
  assert.ok(output.includes("Capabilities:"));
  assert.ok(output.includes("Selected:"));

  // Detail tables
  assert.ok(output.includes("Step Obligations"));
  assert.ok(output.includes("OBLIGATION ID"));
  assert.ok(output.includes("Capability Inventory"));
  assert.ok(output.includes("CAPABILITY ID"));
  assert.ok(output.includes("KIND"));
  assert.ok(output.includes("VERSION"));
  assert.ok(output.includes("SCOPE"));
  assert.ok(output.includes("DEPLOY"));
  assert.ok(output.includes("SUPPORT"));
  assert.ok(output.includes("NATIVE-USE"));

  // Orthogonal status axes presence
  assert.ok(output.includes("CURRENT"));
  assert.ok(output.includes("supported"));
  assert.ok(output.includes("unverified"));

  // Prohibition check: unverified capabilities must never be shown as invoked/active
  assert.ok(output.includes("unverified"));
});

test("task plan --json returns structured machine-readable payload matching human data", async (context) => {
  const { fixture, digest } = await contractFixture(
    context,
    "Implement inventory report using Context7 API documentation and Exa deep-research web search.",
  );

  const result = await cli(fixture, ["plan", fixture.contractPath, "--json"]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);

  const payload = JSON.parse(result.stdout.excerpt) as TaskCapabilityReport;
  assert.equal(payload.contractId, "inventory-summary");
  assert.equal(payload.contractDigest, digest);
  assert.equal(payload.step, "execute");

  assert.equal(payload.summary.selectedCount, 2);
  assert.equal(payload.summary.failedCount, 0);
  assert.equal(payload.summary.blockedCount, 0);
  assert.ok(payload.summary.selected.some((s) => s.capabilityId === "documentation-lookup"));
  assert.ok(payload.summary.selected.some((s) => s.capabilityId === "deep-research"));

  assert.ok(Array.isArray(payload.obligations));
  assert.equal(payload.obligations.length, 2);
  assert.ok(payload.inventory.items.length > 0);

  // Prohibitions & credential check: zero credential keys or response bodies
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes("apiKey"));
  assert.ok(!serialized.includes("secret"));
  assert.ok(!serialized.includes("token"));
});

test("task status displays task-centric capability summary and failed capabilities", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  // Write a failed capability receipt
  const failedReceipt = createCapabilityReceipt({
    receiptId: "rc-fail-001",
    runId: "run-001",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-execute-doc-001",
    question: "Query Context7 for API docs",
    selected: true,
    invoked: true,
    outcome: "tool-error",
    toolName: "query-docs",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "/usr/bin/codex",
    sessionId: "sess-001",
    source: "context7",
    sourceVersion: "4.1.1",
    rawResultSha256: "raw-hash-fail-001",
    isReused: false,
    originalReceiptId: null,
    isError: true,
    errorMessage: "Context7 rate limit exceeded (HTTP 429)",
  });
  await writeCapabilityReceipt(failedReceipt, fixture.stateRoot, repositoryRoot);

  const human = await cli(fixture, ["status", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  const output = human.stdout.excerpt;

  assert.ok(output.includes("Task: inventory-summary"));
  assert.ok(output.includes("Status: running"));
  assert.ok(output.includes("Capabilities:"));
  assert.ok(output.includes("Failed:"));
  assert.ok(output.includes("documentation-lookup [rc-fail-001]: tool-error (Context7 rate limit exceeded (HTTP 429))"));

  const machine = await cli(fixture, ["status", "inventory-summary", "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  const data = JSON.parse(machine.stdout.excerpt) as {
    checkpoint: TaskCheckpoint;
    capabilities: { failedCount: number; failed: Array<{ capabilityId: string; error: string }> };
  };
  assert.equal(data.checkpoint.contractId, "inventory-summary");
  assert.equal(data.capabilities.failedCount, 1);
  assert.equal(data.capabilities.failed[0]?.capabilityId, "documentation-lookup");
  assert.ok(data.capabilities.failed[0]?.error.includes("Context7 rate limit exceeded"));
});

test("task status --detail displays full capability inventory and receipts table", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  const receipt = createCapabilityReceipt({
    receiptId: "rc-ok-002",
    runId: "run-001",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-execute-doc-002",
    question: "Query Context7 for API docs",
    selected: true,
    invoked: true,
    outcome: "ok",
    toolName: "query-docs",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "/usr/bin/codex",
    sessionId: "sess-002",
    source: "context7",
    sourceVersion: "4.1.1",
    rawResultSha256: "raw-hash-ok-002",
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });
  await writeCapabilityReceipt(receipt, fixture.stateRoot, repositoryRoot);

  const result = await cli(fixture, ["status", "inventory-summary", "--detail"]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const output = result.stdout.excerpt;

  assert.ok(output.includes("Task: inventory-summary"));
  assert.ok(output.includes("Capabilities:"));
  assert.ok(output.includes("Capability Inventory ("));
  assert.ok(output.includes("Capability Receipts (1 receipts):"));
  assert.ok(output.includes("rc-ok-002"));
  assert.ok(output.includes("documentation-lookup"));
  assert.ok(output.includes("valid"));
});

test("task plan displays D-07 omitted capabilities when project skill supersedes global skill", async (context) => {
  const fixture = await createTaskFixture(context);
  // Configure project manifest with scientificResearch opt-in to activate RESEARCH_SCIENTIFIC pack
  await mkdir(join(fixture.projectRoot, ".alpha-aos"), { recursive: true });
  await writeFile(
    join(fixture.projectRoot, ".alpha-aos", "stack.yaml"),
    "schemaVersion: 1\nscientificResearch: true\n",
    "utf8",
  );

  // Plan and approve project capabilities
  const plan = await planProjectCapabilities({
    path: fixture.projectRoot,
    packageRoot: repositoryRoot,
  });
  assert.ok(plan.selected.includes("RESEARCH_SCIENTIFIC"));
  await approveProjectPlan({
    path: fixture.projectRoot,
    packageRoot: repositoryRoot,
    stateRoot: fixture.stateRoot,
    expectedDigest: plan.planDigest,
  });

  // Create task requiring documentation for scientific-db-pubmed-database
  const baseContract = inventorySummaryContract(fixture.projectRoot);
  const contract = {
    ...baseContract,
    goal: "Query scientific-db-pubmed-database documentation to extract genetic literature references.",
  };
  await writeTaskContract(fixture.contractPath, contract);

  const result = await cli(fixture, ["plan", fixture.contractPath]);
  assert.equal(result.exitCode, 0, result.stderr.excerpt);
  const output = result.stdout.excerpt;

  assert.ok(output.includes("Capabilities:"));
  assert.ok(output.includes("Omitted:"));
  assert.ok(output.includes("documentation-lookup (superseded by ecc:project:RESEARCH_SCIENTIFIC:scientific-db-pubmed-database)"));
  assert.ok(output.includes("D-07"));

  // Check JSON representation
  const jsonResult = await cli(fixture, ["plan", fixture.contractPath, "--json"]);
  assert.equal(jsonResult.exitCode, 0, jsonResult.stderr.excerpt);
  const payload = JSON.parse(jsonResult.stdout.excerpt) as TaskCapabilityReport;
  assert.equal(payload.summary.omittedCount, 1);
  assert.equal(payload.summary.omitted[0]?.capabilityId, "documentation-lookup");
  assert.equal(payload.summary.omitted[0]?.supersededBy, "ecc:project:RESEARCH_SCIENTIFIC:scientific-db-pubmed-database");
});

test("task status displays drift invalidation, invalidated receipts, and required next action (D-17)", async (context) => {
  const { fixture, digest } = await contractFixture(
    context,
    "Implement inventory report using Context7 API documentation.",
  );
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  // Write a receipt that was verified during 'discuss' step
  const priorReceipt = createCapabilityReceipt({
    receiptId: "rc-discuss-001",
    runId: "run-001",
    step: "discuss",
    capabilityId: "documentation-lookup",
    obligationId: "ob-discuss-doc-001",
    question: "Query Context7 for API docs",
    selected: true,
    invoked: true,
    outcome: "ok",
    toolName: "query-docs",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "/usr/bin/codex",
    sessionId: "sess-disc",
    source: "context7",
    sourceVersion: "4.1.1",
    rawResultSha256: "raw-hash-disc-001",
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });
  await writeCapabilityReceipt(priorReceipt, fixture.stateRoot, repositoryRoot);

  // Inspect with --detail
  const detailResult = await cli(fixture, ["status", "inventory-summary", "--detail"]);
  assert.equal(detailResult.exitCode, 0, detailResult.stderr.excerpt);
  const output = detailResult.stdout.excerpt;

  // Verify drift guidance is rendered
  assert.ok(output.includes("Capability Drift Guidance"));
  assert.ok(output.includes("documentation-lookup"));
  assert.ok(output.includes("phase"));
  assert.ok(output.includes("phase-mismatch"));
  assert.ok(output.includes("rc-discuss-001"));
  assert.ok(output.includes("re-invoke capability for the current phase"));

  // Verify receipt table marks the receipt as invalidated audit record, NOT valid proof
  assert.ok(output.includes("rc-discuss-001"));
  assert.ok(output.includes("invalidated"));

  // Verify JSON output
  const jsonResult = await cli(fixture, ["status", "inventory-summary", "--json"]);
  assert.equal(jsonResult.exitCode, 0, jsonResult.stderr.excerpt);
  const data = JSON.parse(jsonResult.stdout.excerpt) as {
    capabilities: { blockedCount: number; blocked: Array<{ capabilityId: string; nextAction: string }> };
    capabilityReport: TaskCapabilityReport;
  };
  assert.ok(data.capabilityReport.drift.hasDrift);
  assert.ok(data.capabilityReport.drift.invalidatedReceiptIds.includes("rc-discuss-001"));
  assert.equal(data.capabilityReport.receipts[0]?.status, "invalidated");
});

test("formatTaskCapabilitySummary formats empty, multiple omissions, and blocked states", () => {
  // Empty
  const emptySummary: TaskCapabilitySummary = {
    selectedCount: 0,
    failedCount: 0,
    blockedCount: 0,
    omittedCount: 0,
    selected: [],
    failed: [],
    blocked: [],
    omitted: [],
  };
  const emptyText = formatTaskCapabilitySummary(emptySummary);
  assert.ok(emptyText.includes("Selected: none"));
  assert.ok(emptyText.includes("Failed: none"));
  assert.ok(emptyText.includes("Blocked: none"));
  assert.ok(emptyText.includes("Omitted: none"));

  // Multiple omissions and blocked
  const multiSummary: TaskCapabilitySummary = {
    selectedCount: 1,
    failedCount: 0,
    blockedCount: 1,
    omittedCount: 2,
    selected: [{ capabilityId: "deep-research", source: "exa", version: "3.4.1", reason: "Web research required" }],
    failed: [],
    blocked: [{ capabilityId: "deep-research", reason: "Missing API key", nextAction: "Set EXA_API_KEY environment variable" }],
    omitted: [
      { capabilityId: "documentation-lookup", supersededBy: "pack:docs", reason: "Superseded by project skill" },
      { capabilityId: "general-search", supersededBy: "pack:search", reason: "Superseded by specialized search" },
    ],
  };
  const multiText = formatTaskCapabilitySummary(multiSummary);
  assert.ok(multiText.includes("Selected:\n    - deep-research (exa v3.4.1): Web research required"));
  assert.ok(multiText.includes("Blocked:\n    - deep-research: Missing API key — next action: Set EXA_API_KEY environment variable"));
  assert.ok(multiText.includes("documentation-lookup (superseded by pack:docs)"));
  assert.ok(multiText.includes("general-search (superseded by pack:search)"));
});

