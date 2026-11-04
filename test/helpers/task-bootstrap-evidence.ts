import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { resolveProjectBehavior } from "../../src/core/behavior-policy.js";
import { nativeBootstrapBinding } from "../../src/core/task-bootstrap-evidence.js";
import { readTaskBootstrapHandoff } from "../../src/core/task-bootstrap-store.js";
import { createIsolatedSandbox } from "./packed-sandbox.js";

/** On-disk runtime discovery is real even when a query runner is injected. */
export async function createBootstrapSandbox(context: TestContext) {
  const sandbox = await createIsolatedSandbox(context);
  const configRoot = sandbox.env.CODEX_HOME!;
  const runtime = join(configRoot, "gsd-core/bin/gsd-tools.cjs");
  await mkdir(dirname(runtime), { recursive: true });
  await writeFile(runtime, `// Fixture-tier read-only query adapter, not native proof.
const fs=require('node:fs'),path=require('node:path');const root=process.cwd();const has=name=>fs.existsSync(path.join(root,'.planning',name));
console.log(JSON.stringify({packageName:'@opengsd/gsd-core',version:'1.18.0',planning_exists:has(''),project_exists:has('PROJECT.md'),requirements_exists:has('REQUIREMENTS.md'),roadmap_exists:has('ROADMAP.md'),state_exists:has('STATE.md'),init_incomplete:has('')&&(!has('PROJECT.md')||!has('REQUIREMENTS.md')||!has('ROADMAP.md')||!has('STATE.md')),agents_installed:true,project_root:root}));`);
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = configRoot;
  context.after(() => { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; });
  return sandbox;
}

export function runBootstrapFixtureGit(projectRoot: string, args: string[]): string {
  const result = spawnSync("git", ["-c", "user.name=bootstrap fixture", "-c", "user.email=fixture@alpha-aos.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", `core.hooksPath=${join(projectRoot, ".fixture-no-hooks")}`, ...args],
  { cwd: projectRoot, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(projectRoot, ".fixture-no-global-config") }, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/** Fixture-tier native-shaped artifact, never an invocation or native receipt. */
export async function createBootstrapArtifactFixture(options: {
  projectRoot: string; stateRoot: string; pendingId: string; phase?: boolean; phaseId?: string;
}): Promise<Record<string, unknown>> {
  const policy = await resolveProjectBehavior({ invocationPath: options.projectRoot, projectRoot: options.projectRoot, stateRoot: options.stateRoot });
  const handoff = await readTaskBootstrapHandoff({ stateRoot: options.stateRoot, projectId: policy.projectId,
    pendingId: options.pendingId, canonicalRoot: policy.canonicalRoot });
  const git = (args: string[]) => runBootstrapFixtureGit(options.projectRoot, args);
  if (!existsSync(join(options.projectRoot, ".git"))) git(["init"]);
  const phaseId = options.phaseId ?? "31";
  const id = options.phase ? `${phaseId}-01` : `001-${options.pendingId}`;
  const path = options.phase ? `.planning/phases/${phaseId}-fixture/${id}-PLAN.md` : `.planning/quick/${id}/001-PLAN.md`;
  const artifact = `# Fixture-tier native-shaped plan\n\n${nativeBootstrapBinding(handoff)}\n`;
  await mkdir(dirname(join(options.projectRoot, path)), { recursive: true });
  await writeFile(join(options.projectRoot, path), artifact);
  git(["add", "--force", "--", path]);
  git(["commit", "-m", "test: fixture native allocation evidence"]);
  const committed = await readFile(join(options.projectRoot, path));
  return { kind: options.phase ? "gsd-phase" : "gsd-quick", id, path,
    artifactSha256: createHash("sha256").update(committed).digest("hex"), commit: git(["rev-parse", "HEAD"]),
    canonicalRoot: handoff.canonicalRoot, projectId: handoff.projectId, pendingId: handoff.pendingId,
    contentDigest: handoff.contentDigest, claimNonce: handoff.claim?.nonce, claimSession: handoff.claim?.session,
    requestSha256: createHash("sha256").update(handoff.originalRequest.text, "utf8").digest("hex"),
    ...(options.phase ? { phaseDirectory: `${phaseId}-fixture` } : {}) };
}
