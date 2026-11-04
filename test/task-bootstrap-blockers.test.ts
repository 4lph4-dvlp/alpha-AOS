import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { acknowledgeTaskBootstrap, claimTaskBootstrap, linkTaskBootstrapNativeReference, prepareTaskBootstrap } from "../src/core/task-bootstrap.js";
import { updateTaskBootstrapHandoff } from "../src/core/task-bootstrap-store.js";
import { withTaskBootstrapSession } from "../src/core/task-bootstrap-session.js";
import type { GsdToolsRunner } from "../src/core/task-gsd-readiness.js";
import { createBootstrapSandbox as createIsolatedSandbox, createBootstrapArtifactFixture, runBootstrapFixtureGit } from "./helpers/task-bootstrap-evidence.js";

function runnerFor(projectRoot: string, diagnosis = "ready-project"): GsdToolsRunner {
  return async (spec) => {
    const output = spec.args.includes("runtime-identity")
      ? { packageName: "@opengsd/gsd-core", version: "1.18.0" }
      : { planning_exists: diagnosis !== "absent-project", project_exists: true, requirements_exists: true,
        roadmap_exists: true, state_exists: true, agents_installed: true,
        init_incomplete: diagnosis === "partial-project", project_root: projectRoot };
    const text = JSON.stringify(output);
    return { code: "ok", exitCode: 0, signal: null, stdout: { excerpt: text, capped: false, totalBytes: text.length, sha256: "0".repeat(64) },
      stderr: { excerpt: "", capped: false, totalBytes: 0, sha256: "0".repeat(64) }, durationMs: 1, outputCapped: false, timedOut: false };
  };
}

async function prepare(context: Parameters<typeof createIsolatedSandbox>[0], phase?: string) {
  const sandbox = await createIsolatedSandbox(context);
  const projectRoot = join(sandbox.home, "blocker-project");
  await mkdir(join(projectRoot, ".planning"), { recursive: true });
  await writeFile(join(projectRoot, ".planning", "PROJECT.md"), "# Context\n");
  const runner = runnerFor(projectRoot);
  const options = { invocationPath: projectRoot, projectRoot, stateRoot: sandbox.state, runner, pendingId: "blocker" };
  const input = { schemaVersion: 1, operation: "prepare", controller: "codex", workflow: phase ? "execute-phase" : "quick", projectRoot,
    pendingId: options.pendingId, request: { text: "Add an exact audited endpoint" }, selectedStyle: phase ? "conversational-phase" : "conversational-quick",
    ...(phase ? { commandRoute: { command: "gsd-execute-phase", workflow: "execute-phase", phase, arguments: [phase], stoppingPoint: "execute:post" } } : {}) };
  const preview = await prepareTaskBootstrap({ ...options, input });
  const applied = await prepareTaskBootstrap({ ...options, input: { ...input, planDigest: preview.planDigest }, apply: true });
  return { sandbox, options, applied };
}

for (const phase of ["30", "30.1", "30.01", "30a.1"]) {
  test(`native allocation must match preserved phase ${phase}, including acknowledgement and reentry`, async (context) => {
    const { options, applied } = await prepare(context, phase);
    await claimTaskBootstrap({ ...options, claimNonce: "phase-claim" });
    const wrong = await createBootstrapArtifactFixture({ ...options, phase: true, phaseId: phase === "30.01" ? "30.1" : "31" });
    const before = await readFile(applied.destinationPath!, "utf8");
    await assert.rejects(linkTaskBootstrapNativeReference({ ...options, nativeReference: wrong }), /native phase differs/u);
    assert.equal(await readFile(applied.destinationPath!, "utf8"), before);
    const correct = await createBootstrapArtifactFixture({ ...options, phase: true, phaseId: phase });
    assert.equal((await linkTaskBootstrapNativeReference({ ...options, nativeReference: correct })).status, "linked");
    const deliveryReceipt = { receiptSha256: correct.artifactSha256 };
    assert.equal((await acknowledgeTaskBootstrap({ ...options, deliveryReceipt })).status, "acknowledged");
    const reentry = await claimTaskBootstrap({ ...options, claimNonce: "phase-claim" });
    assert.equal(reentry.dispatchAuthorized, false);
    assert.equal(reentry.nextAction, "task-already-acknowledged");
  });
}

for (const diagnosis of ["absent-project", "partial-project"]) {
  test(`claim with fresh ${diagnosis} must preserve pending request and withhold dispatch`, async (context) => {
    const { options, applied } = await prepare(context);
    const before = await readFile(applied.destinationPath!, "utf8");
    const result = await claimTaskBootstrap({ ...options, runner: runnerFor(options.projectRoot, diagnosis), claimNonce: "fresh" });
    assert.equal(result.dispatchAuthorized, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.readinessDiagnosis, diagnosis);
    assert.ok(result.recoveryPlan);
    assert.equal(await readFile(applied.destinationPath!, "utf8"), before);
  });
}

test("lost response after durable conversational claim never reissues execution authority", async (context) => {
  const { options } = await prepare(context);
  const first = await claimTaskBootstrap({ ...options, claimNonce: "same-host" });
  assert.equal(first.dispatchAuthorized, true);
  const retry = await claimTaskBootstrap({ ...options, claimNonce: "same-host" });
  assert.equal(retry.dispatchAuthorized, false);
  assert.match(retry.nextAction, /reconcil/i);
  assert.deepEqual(retry.executionRoute, first.executionRoute);
});

test("native label without exact reopened artifact proof cannot link a claimed request", async (context) => {
  const { options } = await prepare(context);
  await claimTaskBootstrap({ ...options, claimNonce: "claim" });
  await assert.rejects(linkTaskBootstrapNativeReference({ ...options, nativeReference: { kind: "quick", id: "caller-label" } }), /native|evidence|proof/i);
});

test("store owns the writer before transition callback; an independent process cannot cancel under its stale read", async (context) => {
  const { options, applied } = await prepare(context);
  const moduleUrl = pathToFileURL(join(import.meta.dirname, "..", "src/core/task-bootstrap-store.js")).href;
  let checked = false;
  await updateTaskBootstrapHandoff({ stateRoot: options.stateRoot, projectId: applied.projectId, pendingId: options.pendingId,
    canonicalRoot: applied.canonicalRoot, expectedContentDigest: applied.contentDigest,
    transition: (cur) => {
      const script = `const [url,stateRoot,projectId,pendingId]=process.argv.slice(1); const {updateTaskBootstrapHandoff}=await import(url); await updateTaskBootstrapHandoff({stateRoot,projectId,pendingId,transition:cur=>({...cur,status:'cancelled'})});`;
      const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script, moduleUrl, options.stateRoot, applied.projectId, options.pendingId],
        { encoding: "utf8", timeout: 15_000, env: process.env });
      assert.notEqual(child.status, 0, "competing cancellation must not commit while callback owns the writer");
      assert.match(child.stderr, /writer|ACTIVE_WRITER/i);
      checked = true;
      return cur;
    } });
  assert.equal(checked, true);
});

test("two public CLI processes with a readiness barrier yield one new dispatch, then block ambiguous retry", { timeout: 60_000 }, async (context) => {
  const { options, sandbox } = await prepare(context);
  const sockets: Socket[] = [];
  let signalFirst!: () => void;
  const firstArrival = new Promise<void>((resolve) => { signalFirst = resolve; });
  const server = createServer((socket) => {
    sockets.push(socket);
    if (sockets.length === 1) signalFirst();
    else socket.end("release");
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  context.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const runtime = join(sandbox.home, "gsd-core/bin/gsd-tools.cjs");
  await mkdir(dirname(runtime), { recursive: true });
  await writeFile(runtime, `const output=()=>console.log(JSON.stringify({packageName:'@opengsd/gsd-core',version:'1.18.0',planning_exists:true,project_exists:true,requirements_exists:true,roadmap_exists:true,state_exists:true,agents_installed:true,init_incomplete:false,project_root:process.cwd()})); if(process.argv.includes('init.quick')) {const socket=require('node:net').connect(${address.port},'127.0.0.1');socket.on('data',()=>{output();socket.end();});} else output();`);
  const packetPath = join(options.projectRoot, "contender.json");
  await writeFile(packetPath, JSON.stringify({ schemaVersion: 1, operation: "claim", controller: "codex", workflow: "quick",
    projectRoot: options.projectRoot, pendingId: options.pendingId, claimNonce: "same-public-claim" }));
  const cancelPath = join(options.projectRoot, "cancel-contender.json");
  await writeFile(cancelPath, JSON.stringify({ schemaVersion: 1, operation: "cancel", projectRoot: options.projectRoot, pendingId: options.pendingId }));
  const run = (inputPath = packetPath) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, "..", "src/cli.js"), "task", "bootstrap", "--input", inputPath, "--json"],
      { cwd: options.projectRoot, env: { ...sandbox.env, CODEX_HOME: sandbox.home }, timeout: 30_000 });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  const first = run();
  await firstArrival;
  const second = await run();
  const cancellationContender = await run(cancelPath);
  assert.notEqual(cancellationContender.code, 0);
  assert.match(cancellationContender.stderr, /writer|ACTIVE_WRITER/i);
  sockets[0]!.end("release");
  const firstResult = await first;
  const results = [firstResult, second];
  const granted = results.filter((result) => result.code === 0 && JSON.parse(result.stdout).dispatchAuthorized === true);
  assert.equal(granted.length, 1, JSON.stringify(results));
  assert.equal(firstResult.code, 0, firstResult.stderr);
  assert.notEqual(second.code, 0);
  assert.match(second.stderr, /writer|ACTIVE_WRITER/i);
  const retry = await run();
  assert.equal(retry.code, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).dispatchAuthorized, false);
  const cancellation = await run(cancelPath);
  assert.equal(cancellation.code, 0, cancellation.stderr);
  assert.equal(JSON.parse(cancellation.stdout).status, "cancelled");
  assert.match(JSON.parse(cancellation.stdout).nextAction, /in flight/i);
  const afterCancel = await run();
  assert.notEqual(afterCancel.code, 0);
  assert.match(afterCancel.stderr, /already-cancelled/i);
});

test("exact native proof reconciles lost response, requires receipt hash, and reopens evidence on every acceptance/reentry", async (context) => {
  const { options, applied } = await prepare(context);
  await claimTaskBootstrap({ ...options, claimNonce: "lost-response" });
  const nativeReference = await createBootstrapArtifactFixture({ projectRoot: options.projectRoot, stateRoot: options.stateRoot, pendingId: options.pendingId });
  const committedPlan = await readFile(join(options.projectRoot, nativeReference.path as string), "utf8");
  assert.doesNotMatch(committedPlan, /Add an exact audited endpoint/u, "versioned correlation must not copy the private request");
  assert.match(committedPlan, new RegExp(nativeReference.requestSha256 as string, "u"));
  const linked = await claimTaskBootstrap({ ...options, claimNonce: "lost-response", nativeReference });
  assert.equal(linked.status, "linked");
  assert.equal(linked.dispatchAuthorized, false);
  assert.equal(linked.nextAction, "continue-existing");
  await assert.rejects(acknowledgeTaskBootstrap(options), /receipt/i);
  await assert.rejects(acknowledgeTaskBootstrap({ ...options, deliveryReceipt: { receiptSha256: "e".repeat(64) } }), /receipt/i);
  const deliveryReceipt = { receiptSha256: nativeReference.artifactSha256 };
  const accepted = await acknowledgeTaskBootstrap({ ...options, deliveryReceipt });
  assert.equal(accepted.status, "acknowledged");
  const evidencePath = join(options.projectRoot, nativeReference.path as string);
  const before = await readFile(evidencePath, "utf8");
  await writeFile(evidencePath, before + "tampered\n");
  const recordBefore = await readFile(applied.destinationPath!, "utf8");
  await assert.rejects(acknowledgeTaskBootstrap({ ...options, deliveryReceipt }), /hash|evidence/i);
  await assert.rejects(claimTaskBootstrap({ ...options, claimNonce: "lost-response" }), /hash|evidence/i);
  assert.equal(await readFile(applied.destinationPath!, "utf8"), recordBefore);
});

test("wrong identity, allocation, hash, commit and ambiguous native descriptors cannot change durable intent", async (context) => {
  const { options, applied } = await prepare(context);
  await claimTaskBootstrap({ ...options, claimNonce: "proof-boundary" });
  const nativeReference = await createBootstrapArtifactFixture({ projectRoot: options.projectRoot, stateRoot: options.stateRoot, pendingId: options.pendingId });
  const recordBefore = await readFile(applied.destinationPath!, "utf8");
  for (const mutation of [
    { canonicalRoot: dirname(options.projectRoot) }, { projectId: "wrong" }, { pendingId: "wrong" }, { contentDigest: "a".repeat(64) },
    { claimNonce: "wrong" }, { claimSession: "old-session" }, { requestSha256: "e".repeat(64) }, { id: "999-wrong" }, { path: ".planning/STATE.md" },
    { artifactSha256: "f".repeat(64) }, { commit: "f".repeat(40) }, { candidates: [nativeReference, nativeReference] },
  ]) {
    await assert.rejects(linkTaskBootstrapNativeReference({ ...options, nativeReference: { ...nativeReference, ...mutation } }));
    assert.equal(await readFile(applied.destinationPath!, "utf8"), recordBefore);
  }
  const valid = await linkTaskBootstrapNativeReference({ ...options, nativeReference });
  assert.equal(valid.status, "linked");
});

test("caller-owned writer survives service mutations; wrong-root and closed sessions refuse before decision", async (context) => {
  const { options } = await prepare(context);
  let held;
  await withTaskBootstrapSession({ stateRoot: options.stateRoot }, async (session) => {
    held = session;
    const initial = await claimTaskBootstrap({ ...options, session, claimNonce: "owned-session" });
    assert.equal(initial.dispatchAuthorized, true);
    session.assertOwned();
    await assert.rejects(claimTaskBootstrap({ ...options, stateRoot: join(options.stateRoot, "wrong"), session }), /session state root mismatch/i);
    const retry = await claimTaskBootstrap({ ...options, session, claimNonce: "owned-session" });
    assert.equal(retry.dispatchAuthorized, false);
    session.assertOwned();
  });
  await assert.rejects(claimTaskBootstrap({ ...options, session: held, claimNonce: "owned-session" }), /closed/i);
});

test("native evidence rejects stale baseline, mismatched Git bytes, request changes and reparse ancestors", async (context) => {
  const { options, applied } = await prepare(context);
  runBootstrapFixtureGit(options.projectRoot, ["init"]);
  runBootstrapFixtureGit(options.projectRoot, ["commit", "--allow-empty", "-m", "test: pre-intent fixture baseline"]);
  const baseline = runBootstrapFixtureGit(options.projectRoot, ["rev-parse", "HEAD"]);
  await claimTaskBootstrap({ ...options, claimNonce: "fresh-native-evidence" });
  const persisted = JSON.parse(await readFile(applied.destinationPath!, "utf8"));
  assert.equal(persisted.claim.baseCommit, baseline);
  const nativeReference = await createBootstrapArtifactFixture({ projectRoot: options.projectRoot, stateRoot: options.stateRoot, pendingId: options.pendingId });
  await assert.rejects(linkTaskBootstrapNativeReference({ ...options, nativeReference: { ...nativeReference, commit: baseline } }), /baseline/i);
  const path = join(options.projectRoot, nativeReference.path as string);
  const original = await readFile(path, "utf8");
  const linkChanged = async (text: string, pattern: RegExp) => {
    await writeFile(path, text);
    const artifactSha256 = createHash("sha256").update(text).digest("hex");
    await assert.rejects(linkTaskBootstrapNativeReference({ ...options, nativeReference: { ...nativeReference, artifactSha256 } }), pattern);
  };
  await linkChanged(original + "uncommitted drift\n", /Git artifact bytes/i);
  await linkChanged(original.replace(nativeReference.requestSha256 as string, "0".repeat(64)), /original request|binding/i);
  await linkChanged(original + original, /one exact/i);
  await writeFile(path, original);
  const allocationDir = dirname(path);
  const moved = allocationDir + "-original";
  await rename(allocationDir, moved);
  await symlink(moved, allocationDir, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(linkTaskBootstrapNativeReference({ ...options, nativeReference }), /safe|path|ancestor/i);
  await rm(allocationDir, { force: true });
  await rename(moved, allocationDir);
  assert.equal((await linkTaskBootstrapNativeReference({ ...options, nativeReference })).status, "linked");
});
