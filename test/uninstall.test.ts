import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyUninstall,
  planUninstall,
  pruneAntigravityConfig,
  pruneClaudeConfig,
  pruneClaudeSettings,
  pruneCodexAgentsMarkdown,
  pruneCodexConfig,
  pruneHermesConfig,
  prunePiConfig,
  SemanticPruneDriftError,
} from "../src/core/uninstall.js";
import { formatUninstallPlan, formatUninstallResult } from "../src/format.js";

test("target-level uninstall removes managed MCP servers while preserving user servers and credentials (LIFE-03, D-01)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-uninstall-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const home = join(root, "home");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(home, { recursive: true });

  // 1. Claude: setup .claude.json with user custom server + token AND managed servers
  const claudeConfigPath = join(home, ".claude.json");
  const initialClaude = {
    userToken: "secret-token-12345",
    theme: "dark",
    mcpServers: {
      customUserServer: {
        command: "my-custom-tool",
        args: ["--local"],
      },
      context7: {
        command: "npx",
        args: ["@upstash/context7-mcp"],
      },
      exa: {
        command: "npx",
        args: ["exa-mcp-server"],
      },
    },
  };
  await writeFile(claudeConfigPath, JSON.stringify(initialClaude, null, 2));

  // Claude settings.json
  const claudeSettingsDir = join(home, ".claude");
  await mkdir(claudeSettingsDir, { recursive: true });
  const claudeSettingsPath = join(claudeSettingsDir, "settings.json");
  await writeFile(
    claudeSettingsPath,
    JSON.stringify({
      userPref: "high",
      skillOverrides: {
        "user-skill": "always-allowed",
        "unified-memory": "user-invocable-only",
        "documentation-lookup": "user-invocable-only",
      },
    }, null, 2),
  );

  // Skill file under ~/.claude/skills/unified-memory/SKILL.md
  const claudeSkillDir = join(home, ".claude", "skills", "unified-memory");
  await mkdir(claudeSkillDir, { recursive: true });
  const claudeSkillPath = join(claudeSkillDir, "SKILL.md");
  await writeFile(claudeSkillPath, "---\nname: unified-memory\n---\n");

  const plan = await planUninstall({
    scope: "target",
    targetHarness: "claude",
    stateRoot,
    home,
    env: { CLAUDE_CONFIG_DIR: claudeSettingsDir },
  });

  assert.equal(plan.scope, "target");
  assert.equal(plan.targetHarness, "claude");
  assert.ok(plan.prunePlans.length >= 2, "Should have prune plans for .claude.json and settings.json");
  assert.ok(plan.filesToRemove.includes(claudeSkillPath));

  const result = await applyUninstall({ plan, stateRoot });
  assert.ok(result.prunedFiles.includes(claudeConfigPath));
  assert.ok(result.prunedFiles.includes(claudeSettingsPath));
  assert.ok(!existsSync(claudeSkillPath), "Managed skill file must be unlinked");

  // Verify user settings & servers preserved
  const updatedClaude = JSON.parse(await readFile(claudeConfigPath, "utf8")) as Record<string, any>;
  assert.equal(updatedClaude.userToken, "secret-token-12345");
  assert.equal(updatedClaude.theme, "dark");
  assert.ok(updatedClaude.mcpServers.customUserServer, "User server must be preserved");
  assert.equal(updatedClaude.mcpServers.context7, undefined, "Managed server context7 must be excised");
  assert.equal(updatedClaude.mcpServers.exa, undefined, "Managed server exa must be excised");

  const updatedSettings = JSON.parse(await readFile(claudeSettingsPath, "utf8")) as Record<string, any>;
  assert.equal(updatedSettings.userPref, "high");
  assert.equal(updatedSettings.skillOverrides["user-skill"], "always-allowed");
  assert.equal(updatedSettings.skillOverrides["unified-memory"], undefined);
});

test("semantic pruning fidelity across TOML, JSON, YAML, and Markdown (LIFE-04, D-03)", async () => {
  // TOML with user comments and custom tables
  const userToml = `# Top-level user comment
title = "My Custom App"

[custom_table]
port = 8080

# alpha-aos:start mcp
[mcp_servers.context7]
command = "npx"
args = ["@upstash/context7-mcp"]
# alpha-aos:end mcp

[database]
host = "localhost"
`;
  const prunedToml = pruneCodexConfig(userToml);
  assert.ok(prunedToml.includes("title = \"My Custom App\""));
  assert.ok(prunedToml.includes("[custom_table]"));
  assert.ok(prunedToml.includes("[database]"));
  assert.ok(!prunedToml.includes("mcp_servers.context7"));
  assert.ok(!prunedToml.includes("# alpha-aos:start mcp"));

  // AGENTS.md with user instructions and execution markers
  const userMarkdown = `# Project Instructions
User section 1

<!-- alpha-AOS:codex-execution:start -->
Managed instruction block
<!-- alpha-AOS:codex-execution:end -->

User section 2
`;
  const prunedMd = pruneCodexAgentsMarkdown(userMarkdown);
  assert.ok(prunedMd.includes("User section 1"));
  assert.ok(prunedMd.includes("User section 2"));
  assert.ok(!prunedMd.includes("Managed instruction block"));

  // YAML with user comments and other servers
  const userYaml = `# User Hermes Configuration
version: 1
user_setting: true

mcp_servers:
  custom_server:
    command: /usr/local/bin/custom
    args: [--flag]
  context7:
    command: npx
    args: ["@upstash/context7-mcp"]
`;
  const prunedYaml = pruneHermesConfig(userYaml);
  assert.ok(prunedYaml.includes("user_setting: true"));
  assert.ok(prunedYaml.includes("custom_server:"));
  assert.ok(!prunedYaml.includes("context7:"));

  // Pi config with user settings and custom server
  const userPi = JSON.stringify({
    settings: {
      customOption: 42,
      hostConfigDiscovery: "off",
      toolPrefix: "server",
    },
    mcpServers: {
      userTool: { command: "node", args: ["tool.js"] },
      firecrawl: { command: "npx", args: ["firecrawl-mcp"] },
    },
  }, null, 2);
  const prunedPi = JSON.parse(prunePiConfig(userPi)) as Record<string, any>;
  assert.equal(prunedPi.settings.customOption, 42);
  assert.equal(prunedPi.settings.hostConfigDiscovery, undefined);
  assert.equal(prunedPi.settings.toolPrefix, undefined);
  assert.ok(prunedPi.mcpServers.userTool);
  assert.equal(prunedPi.mcpServers.firecrawl, undefined);
});

test("tampering and missing closing markers safely refuse with SemanticPruneDriftError (LIFE-04, D-03)", () => {
  // Missing closing marker in TOML
  const tamperedToml = `title = "Test"
# alpha-aos:start mcp
[mcp_servers.context7]
command = "npx"
`;
  assert.throws(
    () => pruneCodexConfig(tamperedToml),
    (err: unknown) => {
      assert.ok(err instanceof SemanticPruneDriftError);
      assert.ok(err.message.includes("missing closing marker"));
      return true;
    },
  );

  // Corrupted marker count in Markdown
  const tamperedMd = `Header
<!-- alpha-AOS:codex-execution:start -->
Content without end marker
`;
  assert.throws(
    () => pruneCodexAgentsMarkdown(tamperedMd),
    (err: unknown) => {
      assert.ok(err instanceof SemanticPruneDriftError);
      assert.ok(err.message.includes("Malformed or tampered"));
      return true;
    },
  );

  // Malformed YAML
  const invalidYaml = `mcp_servers: [unclosed`;
  assert.throws(
    () => pruneHermesConfig(invalidYaml),
    (err: unknown) => {
      assert.ok(err instanceof SemanticPruneDriftError);
      assert.ok(err.message.includes("invalid YAML"));
      return true;
    },
  );
});

test("project pack removal removes sidecars and sweeps empty directories (LIFE-03, D-01)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-uninstall-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const projectRoot = join(root, "project");
  await mkdir(stateRoot, { recursive: true });

  const dotAlphaAos = join(projectRoot, ".alpha-aos", "packs", "science");
  await mkdir(dotAlphaAos, { recursive: true });
  const sidecarFile = join(dotAlphaAos, "config.json");
  await writeFile(sidecarFile, "{\"pack\": \"science\"}\n");

  const plan = await planUninstall({
    scope: "project",
    projectPath: projectRoot,
    stateRoot,
  });

  assert.equal(plan.scope, "project");
  assert.ok(plan.filesToRemove.includes(sidecarFile));

  const result = await applyUninstall({ plan, stateRoot });
  assert.ok(result.removedFiles.includes(sidecarFile));
  assert.ok(!existsSync(sidecarFile));
});

test("full stack uninstall preserves historical transaction journals by default (LIFE-04, D-04)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-uninstall-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const home = join(root, "home");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(home, { recursive: true });

  // Create an audit journal in stateRoot/journal/
  const journalDir = join(stateRoot, "journal");
  await mkdir(journalDir, { recursive: true });
  const journalFile = join(journalDir, "op-12345.json");
  await writeFile(journalFile, JSON.stringify({ id: "op-12345", status: "applied" }));

  // Create snapshots and runtimes directories that SHOULD be cleaned
  const snapshotsDir = join(stateRoot, "snapshots");
  await mkdir(snapshotsDir, { recursive: true });
  await writeFile(join(snapshotsDir, "data.bin"), "binary");

  const plan = await planUninstall({
    scope: "all",
    purge: false,
    stateRoot,
    home,
    env: {},
  });

  assert.equal(plan.scope, "all");
  assert.equal(plan.purgeRequested, false);
  assert.ok(plan.externalCompensation.length > 0, "All scope must include external compensation");

  const result = await applyUninstall({ plan, stateRoot });
  assert.ok(result.preservedJournals.includes("op-12345.json"), "Journal must be preserved");
  assert.ok(existsSync(journalFile), "Historical audit journal must remain on disk");
  assert.ok(!existsSync(snapshotsDir), "Snapshots should be cleaned up on full uninstall");
});

test("purge flag completely removes state directory (LIFE-04, D-04)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-uninstall-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const home = join(root, "home");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(home, { recursive: true });

  const journalDir = join(stateRoot, "journal");
  await mkdir(journalDir, { recursive: true });
  await writeFile(join(journalDir, "op-999.json"), "{}");

  const plan = await planUninstall({
    scope: "all",
    purge: true,
    stateRoot,
    home,
    env: {},
  });

  assert.equal(plan.purgeRequested, true);

  await applyUninstall({ plan, stateRoot });
  assert.ok(!existsSync(stateRoot), "State root must be completely deleted when purge is true");
});

test("formatUninstallPlan and formatUninstallResult format clear previews and summaries", () => {
  const mockPlan = {
    schemaVersion: 1 as const,
    scope: "target" as const,
    targetHarness: "codex" as const,
    purgeRequested: false,
    stateRoot: "/test/state",
    prunePlans: [
      {
        path: "/test/.codex/config.toml",
        format: "toml" as const,
        existedBefore: true,
        userKeysPreserved: ["title", "database"],
        injectedKeysRemoved: ["context7", "exa"],
        action: "prune" as const,
        currentHash: "abc",
        expectedAfterHash: "def",
      },
    ],
    filesToRemove: ["/test/.agents/skills/unified-memory/SKILL.md"],
    directoriesToSweep: ["/test/.agents/skills/unified-memory"],
    externalCompensation: [],
    planDigest: "digest123",
  };

  const formattedPlan = formatUninstallPlan(mockPlan);
  assert.ok(formattedPlan.includes("alpha-AOS Uninstall Plan (scope: target)"));
  assert.ok(formattedPlan.includes("config.toml"));
  assert.ok(formattedPlan.includes("injected keys to remove: context7, exa"));
  assert.ok(formattedPlan.includes("user keys preserved:     title, database"));
  assert.ok(formattedPlan.includes("SKILL.md"));

  const mockResult = {
    plan: mockPlan,
    prunedFiles: ["/test/.codex/config.toml"],
    removedFiles: ["/test/.agents/skills/unified-memory/SKILL.md"],
    sweptDirectories: ["/test/.agents/skills/unified-memory"],
    preservedJournals: ["op-1.json"],
  };

  const formattedResult = formatUninstallResult(mockResult);
  assert.ok(formattedResult.includes("alpha-AOS Uninstall Complete (scope: target)"));
  assert.ok(formattedResult.includes("Pruned configurations: 1"));
  assert.ok(formattedResult.includes("Removed files:         1"));
  assert.ok(formattedResult.includes("Preserved journals:    1"));
});

test("non-interactive environment requires --yes to apply uninstall (LIFE-03, D-02)", async (context) => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const root = await mkdtemp(join(tmpdir(), "alpha-aos-uninstall-guard-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  await mkdir(stateRoot, { recursive: true });

  const cliPath = join(process.cwd(), "dist", "src", "cli.js");

  let caughtError: any;
  try {
    await execFileAsync(process.execPath, [cliPath, "uninstall", "--all", "--apply"], {
      env: { ...process.env, ALPHA_AOS_STATE_DIR: stateRoot },
    });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, "Must fail in non-interactive environment without --yes");
  assert.equal(caughtError.code, 2, "Exit code must be 2");
  assert.ok(
    caughtError.stderr.includes("Non-interactive environment requires --yes"),
    `Expected refusal message, got: ${caughtError.stderr}`,
  );
});

