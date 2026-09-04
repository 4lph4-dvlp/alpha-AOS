import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DoctorFinding, Inventory, StackCatalog, StackLock } from "../types.js";
import { codexConfigRoot, smokeTestCodexGsdStopHook } from "./gsd-compat.js";
import { globalClaudeSettingsPath } from "./skill-policy.js";

function major(version: string | null): number | null {
  if (!version) return null;
  const match = version.match(/(\d+)/u);
  return match ? Number(match[1]) : null;
}

export async function runDoctor(catalog: StackCatalog, lock: StackLock, inventory: Inventory): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  const nodeTool = inventory.tools.node ?? { version: null, command: null };
  const npmTool = inventory.tools.npm ?? { version: null, command: null };
  const nodeMajor = major(nodeTool.version);
  const npmMajor = major(npmTool.version);
  findings.push(nodeMajor !== null && nodeMajor >= 24
    ? { level: "ok", code: "runtime.node", message: `Node ${nodeTool.version} satisfies >=24` }
    : { level: "error", code: "runtime.node", message: "Node >=24 is required" });
  findings.push(npmMajor !== null && npmMajor >= 10
    ? { level: "ok", code: "runtime.npm", message: `npm ${npmTool.version} satisfies >=10` }
    : { level: "error", code: "runtime.npm", message: "npm >=10 is required" });

  for (const [name, component] of Object.entries(lock.components)) {
    if (name === "mcp") {
      for (const [server, entry] of Object.entries(component as NonNullable<StackLock["components"]["mcp"]>)) {
        findings.push(entry.integrity.startsWith("sha512-")
          ? { level: "ok", code: `lock.mcp.${server}`, message: `${entry.package}@${entry.version} has sha512 integrity` }
          : { level: "error", code: `lock.mcp.${server}`, message: `${server} integrity is missing` });
      }
      continue;
    }
    if (name === "mcpBridges") {
      for (const [harness, entry] of Object.entries(component as NonNullable<StackLock["components"]["mcpBridges"]>)) {
        if (!entry) continue;
        findings.push(entry.integrity.startsWith("sha512-")
          ? { level: "ok", code: `lock.mcp-bridge.${harness}`, message: `${entry.package}@${entry.version} has sha512 integrity` }
          : { level: "error", code: `lock.mcp-bridge.${harness}`, message: `${harness} MCP bridge integrity is missing` });
      }
      continue;
    }
    if (name === "ownedSkills") {
      for (const [skill, entry] of Object.entries(component as NonNullable<StackLock["components"]["ownedSkills"]>)) {
        const targetHashesValid = Object.values(entry.targetSha256).every((hash) => /^[a-f0-9]{64}$/u.test(hash));
        findings.push(/^[a-f0-9]{64}$/u.test(entry.sourceSha256) && targetHashesValid
          ? { level: "ok", code: `lock.owned-skill.${skill}`, message: `${skill} has SHA-256 source lock` }
          : { level: "error", code: `lock.owned-skill.${skill}`, message: `${skill} source hash is missing` });
      }
      continue;
    }
    const entry = component as NonNullable<StackLock["components"]["gsd"] | StackLock["components"]["ecc"]>;
    findings.push(entry.integrity.startsWith("sha512-")
      ? { level: "ok", code: `lock.${name}`, message: `${entry.package}@${entry.version} has sha512 integrity` }
      : { level: "error", code: `lock.${name}`, message: `${name} integrity is missing` });
  }

  for (const harness of inventory.harnesses) {
    if (harness.detected) {
      findings.push({ level: "ok", code: `harness.${harness.id}`, message: `${harness.displayName} detected` });
    } else {
      findings.push({ level: "warning", code: `harness.${harness.id}`, message: `${harness.displayName} not detected on this machine` });
    }
  }

  const codexHook = join(codexConfigRoot(), "hooks", "gsd-context-monitor.js");
  if (existsSync(codexHook)) {
    const smoke = await smokeTestCodexGsdStopHook();
    findings.push(smoke.ok
      ? { level: "ok", code: "gsd.codex-stop-hook", message: "Codex GSD Stop hook exits silently with valid protocol behavior" }
      : {
          level: "error",
          code: "gsd.codex-stop-hook",
          // Only coded outcome and fingerprints; the hook's bytes stay unquoted.
          message: `Codex GSD Stop hook failed (${smoke.code}, exit ${String(smoke.exitCode)}, `
            + `stdout ${smoke.stdout.totalBytes}B/${smoke.stdout.sha256.slice(0, 12)}, `
            + `stderr ${smoke.stderr.totalBytes}B/${smoke.stderr.sha256.slice(0, 12)})`,
        });
  }

  if (catalog.components.ecc.profileInstallAllowed) {
    findings.push({ level: "error", code: "policy.ecc-profile", message: "ECC profile installation must remain disabled" });
  } else {
    findings.push({ level: "ok", code: "policy.ecc-profile", message: "ECC profile installation is disabled" });
  }
  const claudeSettings = globalClaudeSettingsPath();
  try {
    const document = existsSync(claudeSettings) ? JSON.parse(readFileSync(claudeSettings, "utf8")) as Record<string, unknown> : {};
    const overrides = typeof document.skillOverrides === "object" && document.skillOverrides !== null && !Array.isArray(document.skillOverrides)
      ? document.skillOverrides as Record<string, unknown>
      : {};
    const managed = ["unified-memory", "documentation-lookup", "deep-research"];
    findings.push(managed.every((skill) => overrides[skill] === "user-invocable-only")
      ? { level: "ok", code: "policy.claude-ecc-skills", message: "Claude keeps the three managed ECC skills user-invocable-only" }
      : { level: "warning", code: "policy.claude-ecc-skills", message: "Claude managed ECC skills are not all user-invocable-only; run skill-policy sync --target claude" });
  } catch (error) {
    findings.push({ level: "warning", code: "policy.claude-ecc-skills", message: `Claude skill policy could not be read: ${error instanceof Error ? error.message : String(error)}` });
  }
  return findings;
}
