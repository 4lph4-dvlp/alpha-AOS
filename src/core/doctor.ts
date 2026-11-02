import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DoctorFinding, Inventory, StackCatalog, StackLock } from "../types.js";
import { codexConfigRoot, smokeTestCodexGsdStopHook } from "./gsd-compat.js";
import { globalClaudeSettingsPath } from "./skill-policy.js";
import { ROUTING_CONTRACT_MISMATCH } from "./mcp-proxy.js";
import { placeholder } from "./redaction.js";
import { destinationFor, renderOwnedSkill } from "./owned-skills.js";
import { packageRoot } from "./paths.js";

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function parseSkillFrontmatter(source: string): { name: string; description: string } | null {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match || !match[1]) return null;
  try {
    const parsed = parseYaml(match[1]) as Record<string, unknown> | null;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.name === "string" &&
      parsed.name.trim().length > 0 &&
      typeof parsed.description === "string" &&
      parsed.description.trim().length > 0
    ) {
      return { name: parsed.name.trim(), description: parsed.description.trim() };
    }
  } catch {
    return null;
  }
  return null;
}

function major(version: string | null): number | null {
  if (!version) return null;
  const match = version.match(/(\d+)/u);
  return match ? Number(match[1]) : null;
}

export async function runDoctor(
  catalog: StackCatalog,
  lock: StackLock,
  inventory: Inventory,
  root: string = packageRoot(),
): Promise<DoctorFinding[]> {
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
        const catalogSkill = catalog.components.ownedSkills.find((candidate) => candidate.id === skill);
        if (!catalogSkill) {
          findings.push({
            level: "error",
            code: `lock.owned-skill.${skill}`,
            message: `${skill} catalog metadata is missing`,
          });
          continue;
        }

        const isHex64 = (val: string | undefined): boolean => typeof val === "string" && /^[a-f0-9]{64}$/u.test(val);
        const sourceValid = isHex64(entry.sourceSha256);
        const targetsValid = catalogSkill.targets.every((target) => isHex64(entry.targetSha256?.[target]));
        if (!sourceValid || !targetsValid) {
          findings.push({
            level: "error",
            code: `lock.owned-skill.${skill}`,
            message: `${skill} source or target lock hash is missing or malformed`,
          });
          continue;
        }

        const sourcePath = join(root, catalogSkill.source);
        if (!existsSync(sourcePath)) {
          findings.push({
            level: "error",
            code: `lock.owned-skill.${skill}`,
            message: `${skill} source file does not exist at ${catalogSkill.source}`,
          });
          continue;
        }

        const sourceText = readFileSync(sourcePath, "utf8");
        const frontmatter = parseSkillFrontmatter(sourceText);
        if (!frontmatter || frontmatter.name !== skill) {
          findings.push({
            level: "error",
            code: `lock.owned-skill.${skill}`,
            message: `${skill} frontmatter is invalid or missing name/description`,
          });
          continue;
        }

        const actualSourceHash = sha256(Buffer.from(sourceText, "utf8"));
        if (actualSourceHash !== entry.sourceSha256) {
          findings.push({
            level: "error",
            code: `lock.owned-skill.${skill}`,
            message: `${skill} source hash mismatch: expected ${entry.sourceSha256}, got ${actualSourceHash}`,
          });
          continue;
        }

        let targetMismatch = false;
        for (const target of catalogSkill.targets) {
          const rendered = renderOwnedSkill(sourceText, target, catalogSkill.invocation, catalogSkill.argumentHint);
          const renderedHash = sha256(Buffer.from(rendered, "utf8"));
          const expectedHash = entry.targetSha256[target];
          if (renderedHash !== expectedHash) {
            targetMismatch = true;
            findings.push({
              level: "error",
              code: `lock.owned-skill.${skill}`,
              message: `${skill} rendered target hash mismatch for ${target}: expected ${expectedHash}, got ${renderedHash}`,
            });
            break;
          }
        }
        if (!targetMismatch) {
          findings.push({
            level: "ok",
            code: `lock.owned-skill.${skill}`,
            message: `${skill} source and ${catalogSkill.targets.length} target hashes verified`,
          });
        }

        for (const harness of inventory.harnesses) {
          if (harness.detected && catalogSkill.targets.includes(harness.id)) {
            const dest = destinationFor(harness.id, skill);
            try {
              const info = lstatSync(dest);
              if (info.isSymbolicLink() || !info.isFile()) throw Object.assign(new Error("not a regular file"), { code: "NOT_REGULAR_FILE" });
              const destContent = readFileSync(dest);
              const destHash = sha256(destContent);
              const expectedHash = entry.targetSha256[harness.id];
              if (destHash !== expectedHash) {
                findings.push({
                  level: "warning",
                  code: `policy.owned-skill.${skill}.${harness.id}`,
                  message: `${skill} deployed for ${harness.displayName} differs from target lock; run owned-skills sync ${skill} --target ${harness.id}`,
                });
              }
            } catch (error) {
              const code = (error as NodeJS.ErrnoException).code;
              if (code !== "ENOENT") {
                findings.push({
                  level: "warning",
                  code: `policy.owned-skill.${skill}.${harness.id}`,
                  message: `${skill} deployed for ${harness.displayName} could not be inspected (${code && /^[A-Z_]+$/u.test(code) ? code : "UNREADABLE"}); check the deployed skill file`,
                });
              }
            }
          }
        }
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
  // States the output contract in a machine-readable way, so a reader who sees
  // a marker in a report knows it is a withheld value rather than a defect.
  findings.push({
    level: "ok",
    code: "output.redaction",
    message: `Observable output is redacted: a withheld value is shown as ${placeholder("<kind>")} and a private root as an alias.`,
  });

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

  // The recorded routing-contract disagreement (plan 03-07's `narrow`
  // decision). `info` rather than `warning`: nothing here is broken or awaiting
  // an action — the allowlist is intact and the contract is restated in an
  // alpha-AOS-owned instruction. What this line does is make a later runtime
  // bump visible, which a finding nobody prints cannot do.
  findings.push({
    level: "info",
    code: ROUTING_CONTRACT_MISMATCH.code,
    message:
      `${ROUTING_CONTRACT_MISMATCH.runtime} ${ROUTING_CONTRACT_MISMATCH.document} names ` +
      `${ROUTING_CONTRACT_MISMATCH.namesNotPublished.join(", ")} (not published by any pinned server) and ` +
      `${ROUTING_CONTRACT_MISMATCH.namesDeniedByPolicy.join(", ")} (denied by alpha-aos policy). ` +
      `The allowlist is unchanged; the routing contract is stated in ${ROUTING_CONTRACT_MISMATCH.reconciledBy}.`,
  });
  return findings;
}
