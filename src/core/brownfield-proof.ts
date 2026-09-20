import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { memoryHandoff, memorySearch, type MemoryCommandResult, type MemoryRunner } from "../adapters/unified-memory.js";
import { comparePlanningTrees, hashPlanningTree, loadCanaryCatalog, matchExpectations } from "./canary.js";
import { computeRiskSurfaceDigest, createGateReceipt } from "./gate-receipt.js";
import { evaluateLifecycleGates } from "./gate-lifecycle.js";
import { observationLine, readObservationRecords, type McpObservation } from "./mcp-proxy.js";
import { packageRoot } from "./paths.js";
import { applyProjectPackSync } from "./project-pack-sync.js";
import { approveProjectPlan, planProjectCapabilities } from "./project-plan.js";
import { applyUninstall, planUninstall } from "./uninstall.js";
import { witnessWorkerDelegation, type WorkerDelegationWitness } from "./worker-authority.js";

const FIXED_GIT_DATE = "2026-01-01T00:00:00Z";
const SELECTED_SKILL_BYTES: Readonly<Record<string, string>> = Object.freeze({
  accessibility: "---\nname: accessibility\n---\n\n# Offline fixture: accessibility checks\n",
  "browser-qa": "---\nname: browser-qa\n---\n\n# Offline fixture: browser quality checks\n",
  "frontend-a11y": "---\nname: frontend-a11y\n---\n\n# Offline fixture: accessible web review\n",
  "inherit-legacy-style": "---\nname: inherit-legacy-style\n---\n\n# Offline fixture: preserve brownfield conventions\n",
});

export interface BrownfieldFixture {
  readonly path: string;
  readonly root: string;
  readonly repositoryRoot: string;
  readonly headCommit: string;
  readonly baselinePlanningDigest: string;
  readonly packageRoot: string;
  readonly stateRoot: string;
  readonly verifiedSourceRoot: string;
  cleanup(): Promise<void>;
}

export interface BrownfieldProofStep {
  readonly name: "discuss" | "plan" | "execute" | "verify" | "ship";
  readonly elapsedMs: number;
  readonly status: "passed";
  readonly detail: string;
}

export interface BrownfieldLifecycleReport {
  readonly headCommit: string;
  readonly lifecycle: readonly BrownfieldProofStep["name"][];
  readonly steps: readonly BrownfieldProofStep[];
  readonly context7: {
    readonly mode: "offline-fixture";
    readonly tools: readonly string[];
    readonly libraryId: string;
    readonly documentationDigest: string;
  };
  readonly projectPack: {
    readonly selected: readonly string[];
    readonly projections: readonly string[];
  };
  readonly securityGate: {
    readonly obligation: "security-review";
    readonly initialStatus: "blocked";
    readonly finalStatus: "passed";
  };
  readonly handoff: {
    readonly source: "codex";
    readonly target: "antigravity";
    readonly memoryCount: number;
    readonly beforePlanningDigest: string;
    readonly afterPlanningDigest: string;
    readonly handoffId?: string;
  };
  readonly cleanup: {
    readonly removed: readonly string[];
    readonly planningDigest: string;
  };
  readonly workerWitness?: WorkerDelegationWitness;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function gitEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_ADVICE_DETACHEDHEAD: "0",
    GIT_ASKPASS: "",
    GIT_AUTHOR_DATE: FIXED_GIT_DATE,
    GIT_COMMITTER_DATE: FIXED_GIT_DATE,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

function runGit(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: gitEnvironment(),
    windowsHide: true,
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = (result.stderr || result.stdout || String(result.error)).trim();
    throw new Error(`git ${args.join(" ")} failed in the brownfield fixture: ${detail}`);
  }
  return (result.stdout ?? "").trim();
}

async function writeFixtureFiles(projectRoot: string): Promise<void> {
  const files: Readonly<Record<string, string>> = {
    "package.json": `${JSON.stringify({
      name: "brownfield-express-api",
      version: "2.4.0",
      private: true,
      type: "module",
      scripts: { build: "tsc -p tsconfig.json" },
      dependencies: { express: "^4.21.0", react: "^19.0.0" },
      devDependencies: { "@types/express": "^5.0.0", typescript: "^5.9.0" },
    }, null, 2)}\n`,
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist" }, include: ["src/**/*.ts"] }, null, 2)}\n`,
    "src/index.ts": [
      'import express from "express";',
      'import { verifyToken } from "./auth/jwt.js";',
      "",
      "const app = express();",
      'app.get("/health", (_request, response) => response.json({ ok: true }));',
      'app.get("/account", (request, response) => response.json({ authenticated: verifyToken(request.headers.authorization) }));',
      "export default app;",
      "",
    ].join("\n"),
    "src/auth/jwt.ts": [
      "export function verifyToken(authorization: string | undefined): boolean {",
      '  return authorization?.startsWith("Bearer fixture-") === true;',
      "}",
      "",
    ].join("\n"),
    ".planning/PROJECT.md": "# Brownfield Express API\n\nPreserve the deployed API while tightening its authentication boundary.\n",
    ".planning/ROADMAP.md": "# Roadmap\n\n- [ ] Phase 1: Authentication hardening\n",
    ".planning/STATE.md": "---\ngsd_state_version: 1.0\ncurrent_phase: 1\nstatus: discussed\n---\n\n# Project State\n",
    ".planning/phases/01-auth/01-CONTEXT.md": "# Phase 1 Context\n\nKeep existing Express routes compatible and review every authentication change.\n",
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(projectRoot, ...relativePath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function setupOfflineSources(supportRoot: string): Promise<{
  packageRoot: string;
  stateRoot: string;
  verifiedSourceRoot: string;
}> {
  const pkgRoot = packageRoot();
  const packageRootPath = join(supportRoot, "package-root");
  const stateRoot = join(supportRoot, "state");
  const verifiedSourceRoot = join(supportRoot, "sources");
  await mkdir(packageRootPath, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  await cp(join(pkgRoot, "catalog"), join(packageRootPath, "catalog"), { recursive: true });
  await cp(join(pkgRoot, "schemas"), join(packageRootPath, "schemas"), { recursive: true });

  const lockPath = join(packageRootPath, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    components: { ecc?: { sourceSha256: Record<string, string> } };
  };
  if (lock.components.ecc === undefined) throw new Error("fixture package root has no locked ECC component");
  for (const [skill, content] of Object.entries(SELECTED_SKILL_BYTES)) {
    const destination = join(verifiedSourceRoot, skill, "SKILL.md");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
    lock.components.ecc.sourceSha256[skill] = sha256(content);
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return { packageRoot: packageRootPath, stateRoot, verifiedSourceRoot };
}

export async function setupBrownfieldFixture(targetDir: string): Promise<BrownfieldFixture> {
  const projectRoot = resolve(targetDir);
  const supportRoot = `${projectRoot}-support`;
  if (existsSync(projectRoot) || existsSync(supportRoot)) {
    throw new Error(`brownfield fixture target must not already exist: ${projectRoot}`);
  }
  await mkdir(projectRoot, { recursive: true });
  await writeFixtureFiles(projectRoot);
  const support = await setupOfflineSources(supportRoot);

  runGit(projectRoot, ["init", "-b", "main"]);
  for (const [name, value] of [
    ["user.name", "alpha-aos brownfield fixture"],
    ["user.email", "fixture@alpha-aos.invalid"],
    ["commit.gpgsign", "false"],
    ["core.autocrlf", "false"],
  ] as const) {
    runGit(projectRoot, ["config", name, value]);
  }
  runGit(projectRoot, ["add", "."]);
  runGit(projectRoot, ["commit", "-m", "feat: initial brownfield application"]);

  const headCommit = runGit(projectRoot, ["rev-parse", "HEAD"]);
  const planning = await hashPlanningTree(join(projectRoot, ".planning"));
  if (!planning.complete || planning.digest === null) {
    throw new Error(`brownfield planning baseline is incomplete: ${planning.unreadable.map((entry) => entry.path).join(", ")}`);
  }

  return {
    path: projectRoot,
    root: projectRoot,
    repositoryRoot: packageRoot(),
    headCommit,
    baselinePlanningDigest: planning.digest,
    ...support,
    async cleanup(): Promise<void> {
      await rm(projectRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      await rm(supportRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}

function okMemoryResult(document: unknown): MemoryCommandResult {
  return {
    ran: true,
    reason: null,
    unsupported: null,
    exitCode: 0,
    stdout: JSON.stringify(document),
    stderr: "",
  };
}

function offlineMemoryVault(): { readonly runner: MemoryRunner; readonly count: () => number } {
  const entries: Array<{ id: string; title: string; source: string; target: string }> = [];
  const value = (args: readonly string[], flag: string): string => args[args.indexOf(flag) + 1] ?? "";
  const memory = (entry: (typeof entries)[number]): Record<string, unknown> => ({
    id: entry.id,
    title: entry.title,
    kind: "handoff",
    scope: "project",
    sourceHarness: entry.source,
    targetHarnesses: [entry.target],
  });
  const runner: MemoryRunner = async (command) => {
    if (command.args[1] === "handoff") {
      const entry = {
        id: `mem_${entries.length + 1}`,
        title: value(command.args, "--title"),
        source: value(command.args, "--from"),
        target: value(command.args, "--target"),
      };
      entries.push(entry);
      return okMemoryResult({
        schemaVersion: "ecc.memory.write.v1",
        memory: memory(entry),
        path: `project:handoffs/${entry.id}.md`,
      });
    }
    if (command.args[1] === "search") {
      const target = value(command.args, "--target-harness");
      return okMemoryResult({
        schemaVersion: "ecc.memory.search.v1",
        query: "",
        results: entries
          .filter((entry) => entry.target === target)
          .map((entry) => ({ memory: memory(entry), score: 1, excerpt: "intentionally discarded" })),
      });
    }
    return { ran: false, reason: "unsupported fixture verb", unsupported: null, exitCode: 1, stdout: "", stderr: "" };
  };
  return { runner, count: () => entries.length };
}

async function context7Proof(): Promise<BrownfieldLifecycleReport["context7"]> {
  const observedAt = "2026-01-01T00:00:00.000Z";
  const observations: readonly McpObservation[] = [
    { server: "context7", tool: "resolve-library-id", at: observedAt, upstreamVersion: "4.0.4", outcome: "ok" },
    { server: "context7", tool: "query-docs", at: observedAt, upstreamVersion: "4.0.4", outcome: "ok", identifierShape: "version-scoped" },
  ];
  const parsed = readObservationRecords(observations.map(observationLine).join(""));
  const catalog = (await loadCanaryCatalog(packageRoot())).value;
  const declaration = catalog.canaries.find((candidate) => candidate.capability === "CAPA-01" && candidate.harnesses.includes("codex"));
  if (declaration === undefined || !matchExpectations(parsed, declaration).held) {
    throw new Error("offline Context7 lookup did not satisfy the locked documentation canary");
  }
  const libraryId = "/expressjs/express/v4.21.0";
  const documentation = "Express 4 Router routes requests through ordered middleware and route handlers.";
  return {
    mode: "offline-fixture",
    tools: parsed.map((entry) => entry.tool),
    libraryId,
    documentationDigest: sha256(`${libraryId}\0${documentation}`),
  };
}

function assertInside(root: string, absolutePath: string): string {
  const rel = relative(root, absolutePath);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== resolve(absolutePath)) {
    throw new Error(`brownfield cleanup path escaped the fixture root: ${absolutePath}`);
  }
  return rel.split(sep).join("/");
}

async function removeOwnedProjections(projectRoot: string, projections: readonly string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const projection of [...projections].sort().reverse()) {
    const target = join(projectRoot, ...projection.split("/"));
    assertInside(projectRoot, target);
    await rm(target, { force: true });
    removed.push(projection);
    let directory = dirname(target);
    while (directory !== projectRoot) {
      assertInside(projectRoot, directory);
      const entries = await readdir(directory).catch(() => null);
      if (entries === null || entries.length > 0) break;
      await rmdir(directory);
      directory = dirname(directory);
    }
  }
  return removed.sort();
}

async function removeEmptyOwnedDirectory(projectRoot: string, relativePath: string): Promise<void> {
  const target = join(projectRoot, ...relativePath.split("/"));
  assertInside(projectRoot, target);
  if (!existsSync(target)) return;
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      throw new Error(`project uninstall left an owned file behind: ${relativePath}/${entry.name}`);
    }
    await removeEmptyOwnedDirectory(projectRoot, `${relativePath}/${entry.name}`);
  }
  await rmdir(target);
}

export async function runBrownfieldLifecycle(fixture: BrownfieldFixture): Promise<BrownfieldLifecycleReport> {
  const steps: BrownfieldProofStep[] = [];
  const timed = async <T>(name: BrownfieldProofStep["name"], action: () => Promise<{ value: T; detail: string }>): Promise<T> => {
    const started = performance.now();
    const completed = await action();
    steps.push({ name, elapsedMs: Math.max(0, Math.round(performance.now() - started)), status: "passed", detail: completed.detail });
    return completed.value;
  };

  await timed("discuss", async () => {
    const planningRoot = join(fixture.path, ".planning");
    const observed = await hashPlanningTree(planningRoot);
    if (!observed.complete || observed.digest !== fixture.baselinePlanningDigest) {
      throw new Error("brownfield discuss did not begin from the committed planning baseline");
    }
    const stateContent = await readFile(join(planningRoot, "STATE.md"), "utf8");
    if (!stateContent.includes("status: discussed")) {
      throw new Error("brownfield STATE.md is not in discussed status");
    }
    return { value: undefined, detail: `existing planning state ${observed.digest.slice(0, 12)} accepted (status: discussed)` };
  });

  const projectPack = await timed("plan", async () => {
    const reviewed = await planProjectCapabilities({ path: fixture.path, packageRoot: fixture.packageRoot });
    if (!reviewed.selected.includes("API") || !reviewed.selected.includes("WEB_REACT")) {
      throw new Error(`brownfield evidence selected ${reviewed.selected.join(", ") || "no packs"}`);
    }
    await approveProjectPlan({
      path: fixture.path,
      packageRoot: fixture.packageRoot,
      stateRoot: fixture.stateRoot,
      expectedDigest: reviewed.planDigest,
      reviewedPlan: reviewed,
    });
    const synchronized = await applyProjectPackSync({
      path: fixture.path,
      packageRoot: fixture.packageRoot,
      stateRoot: fixture.stateRoot,
      verifiedSourceRoot: fixture.verifiedSourceRoot,
    });
    if (synchronized.written.length === 0) throw new Error("brownfield pack synchronization wrote no project projection");
    for (const path of synchronized.written) assertInside(fixture.path, join(fixture.path, ...path.split("/")));
    return {
      value: { selected: reviewed.selected, projections: synchronized.written },
      detail: `${reviewed.selected.join(", ")} selected; ${synchronized.written.length} projection(s) materialized`,
    };
  });

  const executed = await timed("execute", async () => {
    const context7 = await context7Proof();
    const before = await hashPlanningTree(join(fixture.path, ".planning"));

    // Worker authority verification: delegate audit task to worker (Hermes) and verify .planning/ is untouched
    const workerTask = await witnessWorkerDelegation({
      projectRoot: fixture.path,
      harnessId: "hermes",
      role: "worker",
      action: async () => {
        const routesFile = join(fixture.path, "src", "index.ts");
        const content = await readFile(routesFile, "utf8");
        if (!content.includes("/account") || !content.includes("/health")) {
          throw new Error("worker failed: routes missing from application");
        }
        return { audited: true, routes: ["/health", "/account"] };
      },
    });

    const vault = offlineMemoryVault();
    const handoff = await memoryHandoff({
      cwd: fixture.path,
      source: "codex",
      target: "antigravity",
      title: "Brownfield authentication implementation context",
      body: "Use the reviewed Express router documentation and preserve the existing authentication contract.",
      runner: vault.runner,
    });
    if (handoff.state !== "ok") throw new Error(`memory handoff failed: ${handoff.reason}`);
    const recalled = await memorySearch({ cwd: fixture.path, targetHarness: "antigravity", limit: 5, runner: vault.runner });
    if (recalled.state !== "ok" || recalled.value.results.length !== 1) {
      throw new Error("Antigravity did not receive exactly one Codex handoff");
    }
    const after = await hashPlanningTree(join(fixture.path, ".planning"));
    const comparison = comparePlanningTrees(before, after);
    if (!comparison.equal || before.digest === null || after.digest === null) {
      throw new Error(`Unified Memory changed planning state: ${comparison.reasons.join("; ")}`);
    }
    return {
      value: {
        context7,
        handoff: {
          source: "codex" as const,
          target: "antigravity" as const,
          memoryCount: vault.count(),
          beforePlanningDigest: before.digest,
          afterPlanningDigest: after.digest,
          handoffId: "mem_1",
        },
        workerWitness: workerTask.witness,
      },
      detail: `Context7 ${context7.tools.join(" -> ")}; worker delegation witnessed; Codex -> Antigravity handoff retained`,
    };
  });

  const securityGate = await timed("verify", async () => {
    const authenticationPath = join(fixture.path, "src", "auth", "jwt.ts");
    const current = await readFile(authenticationPath, "utf8");
    await writeFile(authenticationPath, `${current}export const authenticationReviewMarker = true;\n`, "utf8");
    const blocked = await evaluateLifecycleGates(fixture.path, { explicitBase: fixture.headCommit });
    const security = blocked.verdicts.find((verdict) => verdict.obligation === "security-review");
    if (blocked.passed || security === undefined || security.status !== "missing") {
      throw new Error("authentication change did not block on a missing security-review receipt");
    }
    const riskDigest = await computeRiskSurfaceDigest(fixture.path, security.offendingFiles);
    const receipt = createGateReceipt({
      obligation: "security-review",
      engineSelection: {
        obligation: "security-review",
        selectedEngine: { id: "offline-security-review-fixture", kind: "native" },
        suppressedEngines: [],
      },
      executionResult: { exitCode: 0, stdout: "offline fixture review passed", stderr: "" },
      targetCommitSha: fixture.headCommit,
      workingTreeDigest: riskDigest,
      evidenceHash: sha256(`security-review\0${fixture.headCommit}\0${riskDigest}`),
    });
    const receiptPath = join(fixture.path, ".alpha-aos", "receipts", "gates", "security-review.json");
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const passed = await evaluateLifecycleGates(fixture.path, { explicitBase: fixture.headCommit });
    if (!passed.passed || passed.verdicts.some((verdict) => verdict.status !== "passed")) {
      throw new Error("valid security-review receipt did not unblock the lifecycle");
    }
    return {
      value: { obligation: "security-review" as const, initialStatus: "blocked" as const, finalStatus: "passed" as const },
      detail: "authentication change blocked, then a digest-bound security receipt passed",
    };
  });

  const cleanup = await timed("ship", async () => {
    const uninstallPlan = await planUninstall({
      scope: "project",
      projectPath: fixture.path,
      stateRoot: fixture.stateRoot,
    });
    const uninstalled = await applyUninstall({ plan: uninstallPlan, stateRoot: fixture.stateRoot });
    const removedProjections = await removeOwnedProjections(fixture.path, projectPack.projections);
    await removeEmptyOwnedDirectory(fixture.path, ".alpha-aos");
    const planning = await hashPlanningTree(join(fixture.path, ".planning"));
    if (!planning.complete || planning.digest !== fixture.baselinePlanningDigest) {
      throw new Error("project pack cleanup changed the brownfield planning baseline");
    }
    if (existsSync(join(fixture.path, ".alpha-aos"))) throw new Error("project uninstall left .alpha-aos behind");
    return {
      value: {
        removed: [...uninstalled.removedFiles.map((path) => assertInside(fixture.path, path)), ...removedProjections].sort(),
        planningDigest: planning.digest,
      },
      detail: `${uninstalled.removedFiles.length + removedProjections.length} owned artifact(s) removed; user source retained`,
    };
  });

  return {
    headCommit: fixture.headCommit,
    lifecycle: steps.map((step) => step.name),
    steps,
    context7: executed.context7,
    projectPack,
    securityGate,
    handoff: executed.handoff,
    cleanup,
    workerWitness: executed.workerWitness,
  };
}
