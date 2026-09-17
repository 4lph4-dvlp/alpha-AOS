#!/usr/bin/env node
import { spawn } from "node:child_process";
import { commandToHarness, findUpstreamBinary, prepareIsolatedTreeRoot } from "./adapters/shims.js";
import { getHarnessPreloadExclusion } from "./adapters/isolation.js";
import {
  classifyGitRootOrFallback,
  computeTreeId,
  findEnclosingGitRoot,
  loadTreeRegistry,
  resolveEffectivePolicy,
} from "./core/tree-policy.js";
import { scrubEnvironmentForOffTree } from "./core/process.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  const rawArgs = process.argv.slice(3);

  if (!command) {
    process.stderr.write("alpha-aos: No shim command specified.\n");
    process.exit(1);
  }

  const harness = commandToHarness(command);
  if (!harness) {
    process.stderr.write(`alpha-aos: Unknown shimmed command '${command}'.\n`);
    process.exit(1);
  }

  const upstream = findUpstreamBinary(command);
  if (!upstream) {
    process.stderr.write(`alpha-aos: Upstream binary '${command}' not found on PATH.\n`);
    process.exit(127);
  }

  const registry = await loadTreeRegistry();
  const policy = await resolveEffectivePolicy(process.cwd(), registry.trees);

  let effectiveMode: "managed" | "off" | "passthrough" =
    policy.effectiveMode === "unclassified" ? "managed" : policy.effectiveMode;
  let activeTreeId: string = policy.entry?.id ?? "default";

  if (policy.effectiveMode === "unclassified") {
    const gitRoot = await findEnclosingGitRoot(process.cwd());
    if (gitRoot) {
      const classification = await classifyGitRootOrFallback(gitRoot);
      if (classification.mode === "off") {
        effectiveMode = "off";
        activeTreeId = computeTreeId(gitRoot);
      } else if (classification.mode === "managed") {
        effectiveMode = "managed";
        activeTreeId = computeTreeId(gitRoot);
      } else {
        effectiveMode = "passthrough";
      }
    }
  }

  if (effectiveMode === "off") {
    const treeId = activeTreeId;
    const isolation = await prepareIsolatedTreeRoot(treeId, harness);
    const exclusion = getHarnessPreloadExclusion(harness, isolation.isolatedRoot, { surface: "cli" });

    if (!exclusion.provable) {
      process.stderr.write(
        `alpha-aos: Preload isolation cannot be proven on this surface (${exclusion.unsupportedReason ?? "unsupported"}). Refusing launch. See 'alpha-aos tree inspect'.\n`,
      );
      process.exit(2);
    }

    const launchArgs = [...exclusion.args, ...rawArgs];
    const scrubbed = scrubEnvironmentForOffTree(process.env, {
      ...isolation.env,
      ...exclusion.env,
    });

    const child = spawn(upstream.executable, launchArgs, {
      stdio: "inherit",
      shell: false,
      env: scrubbed.env,
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });

    child.on("error", (err) => {
      process.stderr.write(`alpha-aos: Failed to spawn '${upstream.executable}': ${err.message}\n`);
      process.exit(1);
    });
    return;
  }

  // Managed or unclassified (pass through transparently to upstream binary)
  const child = spawn(upstream.executable, rawArgs, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    process.stderr.write(`alpha-aos: Failed to spawn '${upstream.executable}': ${err.message}\n`);
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`alpha-aos shim-dispatch error: ${message}\n`);
  process.exit(1);
});
