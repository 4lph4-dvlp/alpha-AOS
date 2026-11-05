#!/usr/bin/env node
// Manual integration proof. All task effects are confined to a new temporary
// Git repository. This calls the public CLI and real configured native ports.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { loadTaskContract } from "../dist/src/core/task-contract.js";
import { receiptFilePath, readHarnessRoleReceipt } from "../dist/src/adapters/task-receipts.js";
import { nativeOriginReadiness } from "../dist/src/core/task-delivery.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "src", "cli.js");
const exec = promisify(execFile);
const privateJson = (path, data) => writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });

async function prepare() {
  const origin = nativeOriginReadiness();
  if (!origin.supported) throw new Error("Run this proof from an actual originating Codex session");
  const config = parse(await readFile(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml"), "utf8"));
  if (typeof config.model !== "string") throw new Error("An explicit configured Codex model is required; no substitute is selected");
  const model = config.model, effort = config.model_reasoning_effort ?? "high";
  const scratch = await realpath(await mkdtemp(join(tmpdir(), "alpha-aos-live-proof-")));
  const projectRoot = join(scratch, "project"), stateRoot = join(scratch, "state");
  await mkdir(join(projectRoot, ".planning"), { recursive: true });
  await mkdir(join(stateRoot, "receipts", "harnesses"), { recursive: true });
  for (const role of ["controller", "executor", "reviewer"]) {
    const proof = await readHarnessRoleReceipt("codex", role, undefined, { checkDrift: true });
    if (!proof.receipt || proof.versionDrift) throw new Error(`Existing verified Codex ${role} proof is unavailable: ${proof.driftReason ?? "missing"}`);
    await copyFile(receiptFilePath("codex", role), receiptFilePath("codex", role, join(stateRoot, "receipts")));
  }
  const goal = "Implement a dependency-free Node.js ESM CLI at bin/inventory-summary.mjs. Read the CSV path from argv[2]. The header is sku,qty; ignore blank data rows. Each quantity must be a positive integer with no leading zeros and each sku non-empty. Print JSON {rows,totalQuantity,skus} on success, accumulating repeated skus. For an invalid quantity print nothing to stdout, stderr JSON {error:'invalid-quantity',line:<1-based line including header>}, exit 2. Unreadable input prints stderr JSON {error:'unreadable-input'}, exit 2. Consult Node.js API documentation and use Exa for web research about Node.js fs.readFile and CSV parsing. Finish the installed GSD quick workflow and its own state/docs commit; do not weaken any criterion.";
  await privateJson(join(projectRoot, "package.json"), { name: "native-autopilot-live-proof", private: true, type: "module", engines: { node: ">=24.0.0" } });
  await writeFile(join(projectRoot, "README.md"), "# Disposable native autopilot proof\n\n" + goal + "\n");
  await writeFile(join(projectRoot, ".gitignore"), ".alpha-aos/\n.gsd/\nnode_modules/\n");
  await writeFile(join(projectRoot, ".planning", "PROJECT.md"), "# Native autopilot live proof\n\n" + goal + "\n");
  await writeFile(join(projectRoot, ".planning", "ROADMAP.md"), "# Roadmap\n\n### Phase 1: Inventory CLI\n\n**Goal:** Correct JSON inventory CLI.\n");
  await writeFile(join(projectRoot, ".planning", "STATE.md"), "# State\n\nPhase: 1 of 1 (Inventory CLI)\nStatus: Ready to execute\n");
  await privateJson(join(projectRoot, ".planning", "config.json"), { mode: "yolo", commit_docs: true, workflow: { use_worktrees: false, text_mode: true }, git: { branching_strategy: "none" } });
  for (const args of [["init", "-b", "main"], ["config", "user.name", "alpha-AOS live verification"], ["config", "user.email", "live-proof@alpha-aos.invalid"], ["add", "--all"], ["commit", "-m", "test: initialize disposable native proof"]]) await exec("git", args, { cwd: projectRoot });
  const contract = {
    schemaVersion: 1, id: "native-autopilot-live-proof", revision: 1, mode: "autopilot", category: "development", goal,
    scope: { projectRoot, workflow: "gsd-quick", quickQuality: "standard", summary: "Implement and verify the inventory CLI through the real installed GSD quick workflow." },
    allowedRoots: ["bin", "src", "test", "package.json", "README.md"], allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      { id: "valid-summary", title: "Repeated sku summary", description: "Sum positive quantities correctly, including repeated skus; output only the specified JSON.", mandatory: true,
        measurement: { kind: "cli-json", entry: "bin/inventory-summary.mjs", inputText: "sku,qty\nA-100,3\nB-200,5\nA-100,2\n", expect: { exitCode: 0, stdoutJson: { rows: 3, totalQuantity: 10, skus: { "A-100": 5, "B-200": 5 } } } } },
      { id: "invalid-quantity", title: "Invalid quantity line", description: "Reject non-integer quantity, reporting its original 1-based line and no stdout.", mandatory: true,
        measurement: { kind: "cli-json", entry: "bin/inventory-summary.mjs", inputText: "sku,qty\nA-100,3\nB-200,five\n", expect: { exitCode: 2, stdoutEmpty: true, stderrJson: { error: "invalid-quantity", line: 3 } } } },
    ],
    agentPolicy: { controller: "codex", executor: "codex", reviewer: "codex", reviewerSession: "fresh-read-only", differentReviewerPolicy: "allow-same",
      controllerModel: model, executorModel: model, reviewerModel: model, controllerEffort: effort, executorEffort: effort, reviewerEffort: effort },
    resourcePolicy: { maxWallTimeMinutes: 12, maxCycles: 6, maxTokens: 1500000 },
    recoveryPolicy: { maxRepairs: 2, allowWorkspaceRepair: true, allowQuestionRepair: true },
    capabilityQuestions: { documentation: "Resolve astronomy library documentation for CSV parsing and integer quantities.", research: "Official Node.js fs.readFile documentation and Node.js GitHub filesystem source examples for reading CLI input files" },
  };
  const contractPath = join(scratch, "contract.json");
  await privateJson(contractPath, contract);
  const { digest } = await loadTaskContract(contractPath);
  const packet = { schemaVersion: 1, scratch, projectRoot, stateRoot, contractPath, initialDigest: digest };
  await privateJson(join(scratch, "packet.json"), packet);
  console.log(JSON.stringify({ packetPath: join(scratch, "packet.json"), digest, model, effort, limits: contract.resourcePolicy, recovery: contract.recoveryPolicy, intendedFailure: "Documentation question names no declared library; real native correction must restore preflight" }));
}

async function run(packetPath) {
  const packet = JSON.parse(await readFile(packetPath, "utf8"));
  const scratch = await realpath(packet.scratch), temporary = await realpath(tmpdir());
  if (!scratch.startsWith(temporary + sep) || !scratch.split(sep).at(-1).startsWith("alpha-aos-live-proof-") || resolve(packetPath) !== join(scratch, "packet.json") ||
    packet.projectRoot !== join(scratch, "project") || packet.stateRoot !== join(scratch, "state") || packet.contractPath !== join(scratch, "contract.json")) throw new Error("Proof packet leaves its allocated temporary root");
  const env = { ...process.env, ALPHA_AOS_STATE_DIR: packet.stateRoot };
  const invoke = async (args, label) => {
    let stdout = "", stderr = "", exitCode = 0;
    try { ({ stdout, stderr } = await exec(process.execPath, [cli, "task", ...args], { cwd: packet.projectRoot, env, maxBuffer: 8 * 1024 * 1024, windowsHide: true })); }
    catch (error) { stdout = error.stdout ?? ""; stderr = error.stderr ?? ""; exitCode = error.code; }
    await writeFile(join(scratch, label + ".stdout.json"), stdout, { mode: 0o600 });
    await writeFile(join(scratch, label + ".stderr.log"), stderr, { mode: 0o600 });
    return { stdout, exitCode };
  };
  const approved = await invoke(["approve", packet.contractPath, "--contract-digest", packet.initialDigest, "--apply", "--json"], "approval");
  if (approved.exitCode !== 0) throw new Error("Test contract approval was refused; inspect the private approval output");
  const began = new Date().toISOString();
  const started = await invoke(["start", packet.contractPath, "--contract-digest", packet.initialDigest, "--delivery", "foreground", "--apply", "--json"], "start");
  const firstNewline = started.stdout.indexOf("\n");
  const registered = JSON.parse(started.stdout.slice(0, firstNewline));
  const result = JSON.parse(started.stdout.slice(firstNewline + 1));
  const tuple = [registered.binding.contractId, "--run", registered.binding.runId, "--contract-digest", registered.binding.contractDigest,
    "--revision", String(registered.binding.revision), "--origin-host", registered.binding.host, "--origin-session", registered.binding.originatingSessionId];
  const replay = await invoke(["follow", ...tuple, "--timeout-ms", "5000", "--json"], "follow");
  const followed = JSON.parse(replay.stdout);
  const outcome = followed.value?.outcome ?? followed.outcome ?? result.delivery?.outcome;
  if (!outcome?.outcomeId) throw new Error("No replayable origin outcome was delivered");
  const ack = await invoke(["acknowledge", ...tuple, "--outcome-id", outcome.outcomeId, "--apply", "--json"], "acknowledge");
  const acknowledged = JSON.parse(ack.stdout);
  let duplicateRejected = null;
  if (outcome.status === "accepted") {
    const duplicate = await invoke(["start", packet.contractPath, "--contract-digest", outcome.finalDigest, "--apply", "--json"], "duplicate-refusal");
    duplicateRejected = duplicate.exitCode !== 0 && /consumed|already accepted/iu.test(duplicate.stdout);
  }
  const recoveryState = JSON.parse(await readFile(join(packet.stateRoot, "runs", packet.initialDigest, "recovery.json"), "utf8"));
  const repairs = result.recovery?.repairs ?? recoveryState.repairs;
  const evidence = { schemaVersion: 1, began, finished: new Date().toISOString(), exitCode: started.exitCode,
    actualOriginMatched: registered.binding.originatingSessionId === nativeOriginReadiness().originatingSessionId,
    initialDigest: packet.initialDigest, finalDigest: result.contractDigest ?? outcome.finalDigest,
    finalStatus: result.supervision?.status ?? outcome.status, runStatus: result.kind === "task-run" ? result.status : null, gsdStatus: result.gsd?.status ?? null,
    attemptCount: recoveryState.attempts.length, measuredCriteria: (result.verdict?.rows ?? []).map((row) => ({ id: row.criterionId, verdict: row.verdict, measurement: row.measured?.outcome })),
    repairCount: repairs.length, repairs: repairs.map(({ status, kind, verification }) => ({ status, kind, verification })),
    deliveryStatus: outcome.status, processClosure: outcome.processClosure, replayReturned: replay.exitCode === 0, acknowledgement: acknowledged, duplicateRejected,
    nativeResultDigest: createHash("sha256").update(started.stdout).digest("hex"), privateArtifacts: scratch };
  await privateJson(join(scratch, "evidence.json"), evidence);
  console.log(JSON.stringify(evidence));
  if (evidence.finalStatus !== "accepted" || evidence.gsdStatus !== "verified" || evidence.repairCount < 1 || !evidence.actualOriginMatched) process.exitCode = 1;
}

try {
  if (process.argv[2] === "--prepare") await prepare();
  else if (process.argv[2] === "--apply" && process.argv[3]) await run(resolve(process.argv[3]));
  else console.log("Manual live verification: --prepare creates a reviewable temporary contract; --apply <packet.json> uses real native models/MCP and leaves private evidence in that temporary root.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
