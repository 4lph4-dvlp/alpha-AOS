// The task-run fixture: one isolated, GSD-ready inventory-summary project that
// a task contract can be approved, started, measured and reviewed against.
//
// This module is NOT a test. It lives in `test/helpers/` beside
// `git-fixture.ts` for the same reason that one does: `scripts/run-tests.mjs`
// reads `dist/test` without recursion, so `dist/test/helpers` is never
// enumerated as a suite.
//
// Why it exists. Phase 14's tracer must prove that an approved contract
// travels to a measured, reviewed verdict WITHOUT a paid agent in the loop, so
// the controller and reviewer ports here are deterministic test doubles: the
// controller writes a reference implementation (correct, or seeded with an
// off-by-one defect while still claiming success) and the reviewer returns a
// report built from the request it was actually handed. Everything a later
// plan swaps in — native Codex/Claude adapters, the GSD bridge — sits behind
// the same ports, so every suite starts runs through `startFixtureTask` and a
// new run option changes this one helper instead of every suite.
//
// Every path is built from `join(tmpdir(), ...)`, never a host literal, so the
// path-literal guard stays green, and every fixture repository gets its own
// local git identity so a commit succeeds on a host with no global config.

import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { uniqueNames } from "../../src/adapters/task-agent-launch.js";
import { CLAUDE_REVIEW_ENVIRONMENT_NAMES } from "../../src/adapters/task-claude.js";
import { CODEX_TASK_ENVIRONMENT_NAMES } from "../../src/adapters/task-codex.js";
import { NODE_RUNTIME_ENVIRONMENT_NAMES } from "../../src/core/install.js";
import { packageRoot } from "../../src/core/paths.js";
import type { EnvironmentPolicy } from "../../src/core/process.js";
import type { CapabilityBoundary } from "../../src/core/task-capability-obligations.js";
import type { TaskContract } from "../../src/core/task-contract.js";
import {
  startTask,
  type ControllerDispatchRequest,
  type ControllerDispatchResult,
  type ControllerPort,
  type ReviewDispatchResult,
  type ReviewRequest,
  type ReviewerPort,
  type TaskPorts,
  type TaskReviewReport,
  type TaskRunRecord,
} from "../../src/core/task-run.js";
import { gitCommand } from "./git-fixture.js";

export interface TaskFixture {
  readonly scratch: string;
  readonly projectRoot: string;
  readonly stateRoot: string;
  readonly contractPath: string;
  /** A Codex-style config root holding the GSD stub (`gsd-core/bin/gsd-tools.cjs`, `gsd-core/workflows/quick.md`). */
  readonly gsdConfigRoot: string;
}

export type InventorySummaryVariant = "correct" | "off-by-one";

export const INVENTORY_SUMMARY_GOAL = [
  "Implement a Node ESM program at bin/inventory-summary.mjs with no dependencies that reads the CSV file named by its first argument.",
  "The first line must be exactly `sku,qty`.",
  "Each non-blank data row is `<sku>,<qty>` with a non-empty sku and qty a positive integer without leading zeros.",
  "On success print one JSON object with rows (the number of data rows), totalQuantity (the sum of qty) and skus (an object mapping each sku to its summed qty) to stdout, print nothing to stderr, and exit 0.",
  "On an invalid row print nothing to stdout, print one JSON object {\"error\":\"invalid-quantity\",\"line\":<n>} to stderr where n is the 1-based line number counting the header as line 1, and exit 2.",
  "When the input file cannot be read print {\"error\":\"unreadable-input\"} to stderr and exit 2.",
].join(" ");

const FIXTURE_IDENTITY: readonly (readonly string[])[] = [
  ["config", "user.name", "alpha-aos task fixture"],
  ["config", "user.email", "task-fixture@alpha-aos.invalid"],
  ["config", "commit.gpgsign", "false"],
  ["config", "core.autocrlf", "false"],
];

function git(cwd: string, args: readonly string[]): string {
  const result = gitCommand(cwd, args);
  if (!result.ok) throw new Error(`task-fixture: ${result.display} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

/**
 * A stand-in for an installed GSD Core: a quick workflow with two recognized
 * steps and a gsd-tools script that answers only `query init.quick`, computing
 * roadmap_exists and planning_exists from its working directory. It reads and
 * never writes, exactly like the real probe.
 */
export async function writeGsdStub(scratch: string): Promise<string> {
  const configRoot = join(scratch, "gsd-config");
  await mkdir(join(configRoot, "gsd-core", "workflows"), { recursive: true });
  await mkdir(join(configRoot, "gsd-core", "bin"), { recursive: true });
  await writeFile(
    join(configRoot, "gsd-core", "workflows", "quick.md"),
    [
      "<purpose>",
      "Execute a small ad-hoc task with GSD guarantees (fixture stub).",
      "</purpose>",
      "",
      "**Step 1: Parse arguments**",
      "",
      "Read the task description.",
      "",
      "**Step 2: Initialize**",
      "",
      "Run gsd-tools query init.quick.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(configRoot, "gsd-core", "bin", "gsd-tools.cjs"),
    [
      "\"use strict\";",
      "const { existsSync } = require(\"node:fs\");",
      "const { join } = require(\"node:path\");",
      "const args = process.argv.slice(2);",
      "if (args[0] !== \"query\" || args[1] !== \"init.quick\") {",
      "  process.stderr.write(\"gsd-tools stub: only query init.quick is supported\\n\");",
      "  process.exit(1);",
      "}",
      "const planning = join(process.cwd(), \".planning\");",
      "process.stdout.write(JSON.stringify({",
      "  quick_id: \"000000-stb\",",
      "  roadmap_exists: existsSync(join(planning, \"ROADMAP.md\")),",
      "  planning_exists: existsSync(planning),",
      "}, null, 2) + \"\\n\");",
      "",
    ].join("\n"),
    "utf8",
  );
  return configRoot;
}

/** A scratch root holding the project, a private state root and the contract path. */
export async function createTaskFixture(context: TestContext): Promise<TaskFixture> {
  const scratch = await mkdtemp(join(tmpdir(), "alpha-aos-task-fixture-"));
  context.after(async () => {
    await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const projectRoot = join(scratch, "inventory-summary");
  const stateRoot = join(scratch, "state");
  const contractPath = join(scratch, "contract.json");
  const gsdConfigRoot = await writeGsdStub(scratch);

  await mkdir(join(projectRoot, ".planning"), { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    `${JSON.stringify({ name: "inventory-summary", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(projectRoot, "README.md"), `# inventory-summary\n\n${INVENTORY_SUMMARY_GOAL}\n`, "utf8");
  await writeFile(join(projectRoot, ".gitignore"), "node_modules\n", "utf8");
  await writeFile(
    join(projectRoot, ".planning", "PROJECT.md"),
    "# inventory-summary\n\nA dependency-free Node CLI that summarizes an inventory CSV as JSON.\n",
    "utf8",
  );
  await writeFile(
    join(projectRoot, ".planning", "ROADMAP.md"),
    "# Roadmap\n\n### Phase 1: Inventory summary CLI\n\n**Goal:** bin/inventory-summary.mjs summarizes an inventory CSV as JSON and reports invalid rows.\n",
    "utf8",
  );
  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\n\nPhase: 1 of 1 (Inventory summary CLI)\nStatus: Ready to execute\n",
    "utf8",
  );
  await writeFile(
    join(projectRoot, ".planning", "config.json"),
    `${JSON.stringify(
      {
        mode: "yolo",
        commit_docs: true,
        workflow: { use_worktrees: false, text_mode: true },
        git: { branching_strategy: "none" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  git(projectRoot, ["init", "-b", "main"]);
  for (const identity of FIXTURE_IDENTITY) git(projectRoot, identity);
  git(projectRoot, ["add", "--all"]);
  git(projectRoot, ["commit", "-m", "fixture: seed inventory-summary project"]);

  return { scratch, projectRoot, stateRoot, contractPath, gsdConfigRoot };
}

/** The Phase 14 tracer contract for the inventory-summary project. */
export function inventorySummaryContract(projectRoot: string, overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    schemaVersion: 1,
    id: "inventory-summary",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: INVENTORY_SUMMARY_GOAL,
    scope: {
      projectRoot,
      workflow: "gsd-quick",
      summary: "Add the inventory-summary CLI and its tests through one GSD quick task.",
    },
    allowedRoots: ["bin", "src", "test", "package.json", "README.md"],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "valid-summary",
        title: "A valid inventory is summarized",
        description: "A valid CSV with a repeated sku prints the row count, the total quantity and the per-sku sums as JSON and exits 0.",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "bin/inventory-summary.mjs",
          inputText: "sku,qty\nA-100,3\nB-200,5\nA-100,2\n",
          expect: {
            exitCode: 0,
            stdoutJson: { rows: 3, totalQuantity: 10, skus: { "A-100": 5, "B-200": 5 } },
          },
        },
      },
      {
        id: "invalid-quantity",
        title: "An invalid quantity is reported with its line",
        description: "A row whose qty is not a positive integer prints nothing to stdout, reports invalid-quantity with its 1-based line number on stderr and exits 2.",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "bin/inventory-summary.mjs",
          inputText: "sku,qty\nA-100,3\nB-200,five\n",
          expect: {
            exitCode: 2,
            stdoutEmpty: true,
            stderrJson: { error: "invalid-quantity", line: 3 },
          },
        },
      },
    ],
    agentPolicy: { controller: "codex", executor: "codex", reviewer: "claude", reviewerSession: "fresh-read-only" },
    resourcePolicy: { maxWallTimeMinutes: 60 },
    ...overrides,
  };
}

/**
 * The D-11 seeded-defect contract: identical to inventorySummaryContract
 * except for a neutral id and ONE planted value in the held-out measurement —
 * valid-summary expects totalQuantity 11 where the visible goal still defines
 * the plain sum (10 for its input). The controller prompt carries each
 * criterion's id, title and description but never its input or expected
 * output, so the controller sees the same task the accepted run implemented
 * and has no text from which to detect or correct the planted value. A
 * faithful implementation prints 10, claims success and exits 0; measurement
 * against the approved criterion is what must reject it.
 */
export function seededDefectContract(projectRoot: string): TaskContract {
  const base = inventorySummaryContract(projectRoot, { id: "inventory-summary-b" });
  return {
    ...base,
    criterion: base.criterion.map((criterion) =>
      criterion.id !== "valid-summary"
        ? criterion
        : {
            ...criterion,
            measurement: {
              ...criterion.measurement,
              expect: {
                ...criterion.measurement.expect,
                stdoutJson: { rows: 3, totalQuantity: 11, skus: { "A-100": 5, "B-200": 5 } },
              },
            },
          },
    ),
  };
}

/**
 * The environment a live `alpha-aos task start` child receives: exactly the
 * names the Codex controller, the Claude reviewer and the Node runtime
 * declare, read from the host by NAME, plus the scratch state root as the one
 * literal. Nothing else from the parent environment reaches the CLI or the
 * agents it launches.
 */
export function liveTaskEnvironment(stateRoot: string): EnvironmentPolicy {
  return {
    optional: uniqueNames([...CODEX_TASK_ENVIRONMENT_NAMES, ...CLAUDE_REVIEW_ENVIRONMENT_NAMES, ...NODE_RUNTIME_ENVIRONMENT_NAMES]),
    literal: { ALPHA_AOS_STATE_DIR: stateRoot },
    source: process.env,
  };
}

export async function writeTaskContract(path: string, contract: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
}

function inventorySummarySource(variant: InventorySummaryVariant): string {
  const total = variant === "off-by-one" ? "totalQuantity + 1" : "totalQuantity";
  return [
    "#!/usr/bin/env node",
    "import { readFileSync } from \"node:fs\";",
    "",
    "function fail(body) {",
    "  process.stderr.write(`${JSON.stringify(body)}\\n`);",
    "  process.exit(2);",
    "}",
    "",
    "let text;",
    "try {",
    "  text = readFileSync(process.argv[2], \"utf8\");",
    "} catch {",
    "  fail({ error: \"unreadable-input\" });",
    "}",
    "",
    "const lines = text.split(/\\r?\\n/u);",
    "if (lines[0] !== \"sku,qty\") fail({ error: \"invalid-header\", line: 1 });",
    "let rows = 0;",
    "let totalQuantity = 0;",
    "const skus = {};",
    "for (let index = 1; index < lines.length; index += 1) {",
    "  const line = lines[index];",
    "  if (line.trim() === \"\") continue;",
    "  const parts = line.split(\",\");",
    "  const sku = parts[0] ?? \"\";",
    "  const qty = parts[1] ?? \"\";",
    "  if (parts.length !== 2 || sku === \"\" || !/^[1-9][0-9]*$/u.test(qty)) {",
    "    fail({ error: \"invalid-quantity\", line: index + 1 });",
    "  }",
    "  const amount = Number(qty);",
    "  rows += 1;",
    "  totalQuantity += amount;",
    "  skus[sku] = (skus[sku] ?? 0) + amount;",
    "}",
    `process.stdout.write(\`\${JSON.stringify({ rows, totalQuantity: ${total}, skus })}\\n\`);`,
    "",
  ].join("\n");
}

/** Writes and commits bin/inventory-summary.mjs; `off-by-one` over-reports totalQuantity by one. */
export async function writeInventorySummaryImplementation(
  projectRoot: string,
  variant: InventorySummaryVariant,
): Promise<void> {
  await mkdir(join(projectRoot, "bin"), { recursive: true });
  await writeFile(join(projectRoot, "bin", "inventory-summary.mjs"), inventorySummarySource(variant), "utf8");
  git(projectRoot, ["add", "--", "bin/inventory-summary.mjs"]);
  git(projectRoot, ["commit", "-m", `feat: inventory-summary CLI (${variant})`]);
}

/**
 * A test double of the controller's GSD quick work: the quick directory with
 * its PLAN and SUMMARY, the STATE.md row and the `docs(quick-<id>)` commit.
 * Only controller-port doubles call this; alpha-AOS itself never writes
 * `.planning/` (RUN-01). `commit: false` leaves the artifacts uncommitted.
 */
export async function simulateGsdQuick(
  projectRoot: string,
  options: { quickId: string; slug: string; description: string; commit?: boolean },
): Promise<void> {
  const { quickId, slug, description } = options;
  const directory = join(projectRoot, ".planning", "quick", `${quickId}-${slug}`);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${quickId}-PLAN.md`),
    [`# Quick ${quickId}: ${description}`, "", "<tasks>", `<task>${description}</task>`, "</tasks>", ""].join("\n"),
    "utf8",
  );
  await writeFile(join(directory, `${quickId}-SUMMARY.md`), [`# Quick ${quickId}: ${description} Summary`, "", "Done.", ""].join("\n"), "utf8");
  const statePath = join(projectRoot, ".planning", "STATE.md");
  const state = await readFile(statePath, "utf8");
  if (!state.includes("### Quick Tasks Completed")) {
    const table = [
      "",
      "### Quick Tasks Completed",
      "",
      "| # | Description | Date | Commit | Directory |",
      "|---|-------------|------|--------|-----------|",
      "",
    ].join("\n");
    await appendFile(statePath, `${state.endsWith("\n") ? "" : "\n"}${table}`, "utf8");
  }
  await appendFile(statePath, `| ${quickId} | ${description} | 2026-09-30 | - | [${quickId}-${slug}](./quick/${quickId}-${slug}/) |\n`, "utf8");
  if (options.commit === false) return;
  git(projectRoot, ["add", "--", ".planning"]);
  git(projectRoot, ["commit", "-m", `docs(quick-${quickId}): ${description}`]);
}

/** A GSD-shaped quick id (`yymmdd-xyz`) derived from the run id, so one run always gets one id. */
export function fixtureQuickId(runId: string): string {
  const day = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const letters = [...runId.slice(-3)].map((digit) => "abcdefghijklmnop"[Number.parseInt(digit, 16)] ?? "x").join("");
  return `${day}-${letters}`;
}

/**
 * A controller double that leaves the reference implementation behind and
 * always claims success with exit 0 — including for the off-by-one variant,
 * which is exactly the claim D-11 says measurement must ignore. It does its
 * work the way a real controller must: commit the implementation, then leave
 * GSD quick's own evidence behind.
 */
export function referenceControllerPort(variant: InventorySummaryVariant): ControllerPort {
  return {
    async dispatch(request: ControllerDispatchRequest): Promise<ControllerDispatchResult> {
      await writeInventorySummaryImplementation(request.projectRoot, variant);
      const quickId = fixtureQuickId(request.runId);
      await simulateGsdQuick(request.projectRoot, {
        quickId,
        slug: "inventory-summary",
        description: "Add the inventory-summary CLI",
      });
      return {
        harness: "codex",
        version: "fixture",
        executable: null,
        sessionId: `fixture-controller-${request.runId}`,
        exitCode: 0,
        processCode: "ok",
        terminal: "completed",
        claim: {
          status: "completed",
          summary: "Implemented bin/inventory-summary.mjs and verified it.",
          authorityRequest: null,
          gsdQuickId: quickId,
        },
        detail: null,
      };
    },
  };
}

/** A schema-valid report that passes every contract criterion, bound to the request it answers. */
export function passingReview(request: ReviewRequest): TaskReviewReport {
  return {
    schemaVersion: 1,
    requestId: request.requestId,
    contractId: request.contract.id,
    contractDigest: request.contractDigest,
    artifactDigest: request.artifactDigest,
    criteria: request.contract.criterion.map((criterion) => ({
      criterionId: criterion.id,
      verdict: "pass" as const,
      severity: "blocking" as const,
      evidence: `Re-ran ${criterion.measurement.entry} for ${criterion.id}; the output matched the contract.`,
      abstainReason: null,
      finding: null,
    })),
    suggestions: [],
  };
}

/** A reviewer double whose report is whatever `build` makes of the request. */
export function staticReviewerPort(build: (request: ReviewRequest) => unknown): ReviewerPort {
  return {
    async review(request: ReviewRequest): Promise<ReviewDispatchResult> {
      return {
        harness: "claude",
        version: "fixture",
        executable: null,
        sessionId: request.sessionId,
        exitCode: 0,
        processCode: "ok",
        report: build(request) as TaskReviewReport,
        issues: [],
      };
    },
  };
}

/** Ports that support exactly the codex controller/executor with a claude reviewer. */
export function fixturePorts(options: { controller: ControllerPort; reviewer: ReviewerPort }): TaskPorts {
  return {
    controller: options.controller,
    reviewer: options.reviewer,
    async assess(policy) {
      const missingProof: string[] = [];
      if (policy.controller !== "codex") missingProof.push(`controller ${policy.controller} has no fixture adapter`);
      if (policy.executor !== "codex") missingProof.push(`executor ${policy.executor} has no fixture adapter`);
      if (policy.reviewer !== "claude") missingProof.push(`reviewer ${policy.reviewer} has no fixture adapter`);
      return {
        supported: missingProof.length === 0,
        controller: { harness: policy.controller, version: "fixture", executable: null },
        reviewer: { harness: policy.reviewer, version: "fixture", executable: null },
        missingProof,
      };
    },
  };
}

/** The one route every suite uses to start a run against a fixture. */
export async function startFixtureTask(
  fixture: TaskFixture,
  options: {
    ports: TaskPorts;
    expectedDigest: string;
    now?: () => Date;
    gsdConfigRoot?: string;
    requiredBoundaries?: readonly CapabilityBoundary[];
    runId?: string;
  },
): Promise<{ run: TaskRunRecord; recordPath: string }> {
  return startTask({
    contractPath: fixture.contractPath,
    expectedDigest: options.expectedDigest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: options.ports,
    gsd: { configRoot: options.gsdConfigRoot ?? fixture.gsdConfigRoot },
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.requiredBoundaries === undefined ? {} : { requiredBoundaries: options.requiredBoundaries }),
    ...(options.runId === undefined ? {} : { runId: options.runId }),
  });
}
