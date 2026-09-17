#!/usr/bin/env node
import { spawn } from "node:child_process";
import { commandToHarness, findUpstreamBinary, prepareIsolatedTreeRoot } from "./adapters/shims.js";
import { getHarnessPreloadExclusion } from "./adapters/isolation.js";
import { loadTreeRegistry, resolveEffectivePolicy } from "./core/tree-policy.js";

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

  if (policy.effectiveMode === "off") {
    const treeId = policy.entry?.id ?? "default";
    const isolation = await prepareIsolatedTreeRoot(treeId, harness);
    const exclusion = getHarnessPreloadExclusion(harness, isolation.isolatedRoot, { surface: "cli" });

    if (!exclusion.provable) {
      process.stderr.write(
        `alpha-aos: Preload isolation cannot be proven on this surface (${exclusion.unsupportedReason ?? "unsupported"}). Refusing launch. See 'alpha-aos tree inspect'.\n`,
      );
      process.exit(2);
    }

    const launchArgs = [...exclusion.args, ...rawArgs];
    const launchEnv = {
      ...process.env,
      ...isolation.env,
    };

    const child = spawn(upstream.executable, launchArgs, {
      stdio: "inherit",
      shell: false,
      env: launchEnv,
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
