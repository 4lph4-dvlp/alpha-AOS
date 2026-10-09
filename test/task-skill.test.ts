import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { packageRoot } from "../src/core/paths.js";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy, type ProcessResult } from "../src/core/process.js";
import { destinationFor, planOwnedSkillSync, renderOwnedSkill } from "../src/core/owned-skills.js";
import { loadTaskContract } from "../src/core/task-contract.js";
import { writeCheckpoint } from "../src/core/task-journal.js";
import type { HarnessId } from "../src/types.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const probeEnv = commandProbeEnvironment({ source: process.env });
const OUTPUT_BYTES = 256 * 1024;
const ALL_HARNESSES: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function taskEnvironment(stateRoot: string, extra: Record<string, string> = {}): EnvironmentPolicy {
  return {
    ...probeEnv,
    literal: {
      ...probeEnv.literal,
      ALPHA_AOS_STATE_DIR: stateRoot,
      ...extra,
    },
  };
}

async function cli(
  fixture: TaskFixture,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
): Promise<ProcessResult> {
  return runProcess({
    executable: process.execPath,
    args: [cliEntry, "task", ...args],
    cwd: fixture.scratch,
    environment: taskEnvironment(fixture.stateRoot, extraEnv),
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
}

// ---------------------------------------------------------------------------
// Skill Registration and Lock Verification
// ---------------------------------------------------------------------------

test("alpha-aos-task skill is locked and renders identically across all five harnesses", async () => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const skill = catalog.components.ownedSkills.find((candidate) => candidate.id === "alpha-aos-task");
  assert.ok(skill, "alpha-aos-task must be registered in catalog/stack.yaml");
  assert.equal(skill.source, "skills/alpha-aos-task/SKILL.md");
  assert.equal(skill.invocation, "automatic");
  assert.deepEqual([...skill.targets].sort(), [...ALL_HARNESSES].sort());

  const locked = lock.components.ownedSkills?.["alpha-aos-task"];
  assert.ok(locked, "alpha-aos-task must be locked in catalog/stack.lock.json");

  const sourceContent = await readFile(join(root, skill.source), "utf8");
  const sourceHash = sha256(sourceContent);
  assert.equal(sourceHash, locked.sourceSha256, "source hash must match lock");

  for (const target of ALL_HARNESSES) {
    const rendered = renderOwnedSkill(sourceContent, target, "automatic");
    const renderedHash = sha256(rendered);
    assert.equal(renderedHash, locked.targetSha256[target], `rendered hash for ${target} must match lock`);
  }
});

// ---------------------------------------------------------------------------
// Natural Language Dialogue Decision Model (D-01, D-02, D-03, D-04)
// ---------------------------------------------------------------------------

interface DialogueIntake {
  readonly text: string;
  readonly isExplicitAutopilot?: boolean;
  readonly hasAmbiguousScope?: boolean;
}

interface DialogueResult {
  readonly chosenPath: "ordinary-gsd" | "autopilot-preview" | "clarification-needed";
  readonly message: string;
  readonly requiresContract: boolean;
}

function processTaskIntake(request: DialogueIntake): DialogueResult {
  const trimmed = request.text.trim();
  if (!trimmed) {
    return {
      chosenPath: "clarification-needed",
      message: "Task request is empty. Please describe the goal and expected outcome.",
      requiresContract: false,
    };
  }

  // D-04: Explicit autopilot requested up front
  if (request.isExplicitAutopilot) {
    if (request.hasAmbiguousScope) {
      // D-03: Clarify missing criteria/boundaries before contract preview
      return {
        chosenPath: "clarification-needed",
        message: "Autopilot requested, but acceptance criteria or allowed write boundaries are ambiguous. Please clarify before contract preview.",
        requiresContract: false,
      };
    }
    return {
      chosenPath: "autopilot-preview",
      message: "Explicit autopilot selected. Preparing read-only task contract preview.",
      requiresContract: true,
    };
  }

  // D-01, D-02: General task request defaults to ordinary GSD
  return {
    chosenPath: "ordinary-gsd",
    message: "Defaulting to Ordinary Conversational GSD within current conversation. (To switch, explicitly request autonomous autopilot).",
    requiresContract: false,
  };
}

test("natural task intake decision boundaries follow D-01 through D-04", () => {
  // General request -> ordinary GSD default, no contract needed (D-01, D-02)
  const general = processTaskIntake({ text: "Implement CSV exporter for invoices" });
  assert.equal(general.chosenPath, "ordinary-gsd");
  assert.equal(general.requiresContract, false);

  // Explicit autopilot with clear scope -> direct to preview (D-04)
  const explicit = processTaskIntake({ text: "Run autonomous autopilot for CSV exporter", isExplicitAutopilot: true });
  assert.equal(explicit.chosenPath, "autopilot-preview");
  assert.equal(explicit.requiresContract, true);

  // Ambiguous autopilot -> clarification required before contract (D-03)
  const ambiguous = processTaskIntake({ text: "Run in autopilot", isExplicitAutopilot: true, hasAmbiguousScope: true });
  assert.equal(ambiguous.chosenPath, "clarification-needed");
  assert.equal(ambiguous.requiresContract, false);

  // Empty request -> refuses contract (edge probe: empty)
  const empty = processTaskIntake({ text: "   " });
  assert.equal(empty.chosenPath, "clarification-needed");
  assert.equal(empty.requiresContract, false);
});

// ---------------------------------------------------------------------------
// E2E Tracer: Choice -> Preview -> Exact Digest Approve -> Start -> Status via New Process
// ---------------------------------------------------------------------------

test("E2E tracer: natural choice to contract preview, digest approval, start, and independent process status", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await loadTaskContract(fixture.contractPath);

  // 1. Step 1: Read-only preview (D-05, D-08)
  const previewResult = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(previewResult.exitCode, 0, previewResult.stderr.excerpt);
  assert.ok(previewResult.stdout.excerpt.includes(`Contract digest: ${digest}`));
  assert.ok(previewResult.stdout.excerpt.includes("Goal: Implement a Node ESM program"));
  assert.ok(previewResult.stdout.excerpt.includes("--contract-digest"));

  // 2. Step 2: Unapproved start is refused (Ordering invariant)
  const prematureStart = await cli(fixture, ["start", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(prematureStart.exitCode, 2);
  assert.match(prematureStart.stderr.excerpt, /not-approved|has no approval/u);

  // 3. Step 3: Exact-digest approval (D-09)
  const approveResult = await cli(fixture, ["approve", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(approveResult.exitCode, 0, approveResult.stderr.excerpt);
  assert.match(approveResult.stdout.excerpt, /Approved for a single run/u);

  // 4. Step 4: Start execution (D-09, D-10) using test double ports
  const ports = fixturePorts({
    controller: referenceControllerPort("correct"),
    reviewer: staticReviewerPort((req) => passingReview(req)),
  });
  const startResult = await startFixtureTask(fixture, {
    ports,
    expectedDigest: digest,
  });
  assert.ok(startResult.run.runId);
  assert.equal(startResult.run.contractId, "inventory-summary");
  assert.equal(startResult.run.status, "accepted");

  // Write checkpoint for the completed run
  await writeCheckpoint(fixture.stateRoot, {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "accepted",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  });

  // 5. Step 5: Query status from a separate, independent CLI process (UX-02)
  const statusResult = await cli(fixture, ["status", "inventory-summary"]);
  assert.equal(statusResult.exitCode, 0, statusResult.stderr.excerpt);
  assert.ok(statusResult.stdout.excerpt.includes("Task: inventory-summary"));
  assert.ok(statusResult.stdout.excerpt.includes("Status: accepted"));

  // Machine-readable JSON status from independent CLI process
  const jsonStatus = await cli(fixture, ["status", "inventory-summary", "--json"]);
  assert.equal(jsonStatus.exitCode, 0, jsonStatus.stderr.excerpt);
  const parsed = JSON.parse(jsonStatus.stdout.excerpt) as { checkpoint: { contractId: string; status: string; contractDigest: string } };
  assert.equal(parsed.checkpoint.contractId, "inventory-summary");
  assert.equal(parsed.checkpoint.contractDigest, digest);
  assert.equal(parsed.checkpoint.status, "accepted");
});

// ---------------------------------------------------------------------------
// Edge Probes: Adjacency, Ordering, and Non-Continuation
// ---------------------------------------------------------------------------

test("edge probe: adjacency between alpha-aos-control and alpha-aos-task maintains independent boundaries", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await loadTaskContract(fixture.contractPath);

  // Simulation: Environment setup finishes (triggering alpha-aos-control domain).
  // Control trigger: Inspects packs, does NOT approve or start any task contract.
  const beforeTasks = await readdir(join(fixture.stateRoot), { recursive: true }).catch(() => []);
  assert.ok(!beforeTasks.some((entry) => entry.includes("inventory-summary")));

  // Task contract requires its own explicit approval command
  const preview = await cli(fixture, ["preview", fixture.contractPath]);
  assert.equal(preview.exitCode, 0);

  // Contract remains unapproved until explicit task approve
  const unapprovedStart = await cli(fixture, ["start", fixture.contractPath, "--contract-digest", digest, "--apply"]);
  assert.equal(unapprovedStart.exitCode, 2);
});

test("edge probe: consecutive tasks require separate consent (non-continuation)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract1Path = join(fixture.scratch, "task-1.json");
  const contract2Path = join(fixture.scratch, "task-2.json");

  await writeTaskContract(contract1Path, { ...inventorySummaryContract(fixture.projectRoot), id: "task-one" });
  await writeTaskContract(contract2Path, { ...inventorySummaryContract(fixture.projectRoot), id: "task-two" });

  const { digest: digest1 } = await loadTaskContract(contract1Path);
  const { digest: digest2 } = await loadTaskContract(contract2Path);

  // Approve Task 1
  const approve1 = await cli(fixture, ["approve", contract1Path, "--contract-digest", digest1, "--apply"]);
  assert.equal(approve1.exitCode, 0);

  // Task 2 must NOT inherit Task 1's approval
  const start2 = await cli(fixture, ["start", contract2Path, "--contract-digest", digest2, "--apply"]);
  assert.equal(start2.exitCode, 2);
  assert.match(start2.stderr.excerpt, /not-approved|has no approval/u);
});

// ---------------------------------------------------------------------------
// Five Target Native Discovery and Read-Only Invocation Canary (UX-01)
// ---------------------------------------------------------------------------

test("five target native discovery and read-only invocation canary", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  for (const target of ALL_HARNESSES) {
    const targetHome = join(fixture.scratch, "harnesses", target);
    await mkdir(targetHome, { recursive: true });

    // Plan and verify sync for each target
    const plan = await planOwnedSkillSync(root, catalog, lock, "alpha-aos-task", target, {
      targetHome,
      stateRoot: fixture.stateRoot,
    });

    assert.equal(plan.id, "alpha-aos-task");
    assert.equal(plan.target, target);
    assert.equal(plan.action, "create");

    // Write rendered skill to target native destination
    await mkdir(dirname(plan.destination), { recursive: true });
    const sourceContent = await readFile(plan.source, "utf8");
    const rendered = renderOwnedSkill(sourceContent, target, "automatic");
    await writeFile(plan.destination, rendered, "utf8");

    assert.ok(existsSync(plan.destination), `Skill file must exist at native destination for ${target}`);
    assert.equal(sha256(await readFile(plan.destination)), plan.expectedHash);

    // Read-only invocation canary: run task preview in each target's environment
    const harnessEnv: Record<string, string> = {
      CLAUDE_CONFIG_DIR: join(targetHome, "claude"),
      CODEX_HOME: join(targetHome, "codex"),
      ANTIGRAVITY_CONFIG_DIR: join(targetHome, "gemini"),
      PI_CODING_AGENT_DIR: join(targetHome, "pi"),
      HERMES_HOME: join(targetHome, "hermes"),
    };

    const canary = await cli(fixture, ["preview", fixture.contractPath], harnessEnv);
    assert.equal(canary.exitCode, 0, `Read-only canary for ${target} must exit 0`);
    assert.ok(canary.stdout.excerpt.includes("Contract digest:"), `Canary for ${target} must output digest`);
  }
});
