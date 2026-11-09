import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnoseToolRecordsAlignment } from "../src/core/doctor.js";
import { reconcileToolState, type ToolObservation, type ToolInventory } from "../src/core/tool-inventory.js";
import {
  planToolRecordOperation,
  withToolRecordSession,
  beginToolOperation,
  appendToolResult,
  finishToolOperation,
} from "../src/core/tool-record-store.js";
import { readToolRecordStore } from "../src/core/tool-records.js";

test("Task 2 Doctor: passes with zero misalignment findings when harness configs match accepted tool records", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-doc-align-pass-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    const harnessDir = join(root, "harness");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await mkdir(harnessDir, { recursive: true });

    // Seed accepted tool record for mcp:context7 (0.3.0) and cua-driver (0.40.0)
    const operationId = "op-align-pass";
    const occurredAt = new Date().toISOString();
    const requests = [
      { toolId: "mcp:context7", selector: "0.3.0", exact: true },
      { toolId: "cua-driver", selector: "0.40.0", exact: true },
    ];

    const plan = await planToolRecordOperation({
      stateRoot,
      packageRoot,
      operationId,
      occurredAt,
      requests,
    });

    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      await appendToolResult(plan, session, {
        toolId: "mcp:context7",
        requested: { toolId: "mcp:context7", selector: "0.3.0", exact: true },
        resolved: {
          release: "0.3.0",
          artifact: "context7.tgz",
          platform: "windows",
          architecture: "x64",
          digest: "a".repeat(64),
          sourceId: "npm-registry",
          sourceUrl: "https://registry.npmjs.org/@upstash/context7-mcp",
        },
        installed: {
          installationId: "context7-0.3.0",
          version: "0.3.0",
          pathAlias: "context7",
        },
        verified: "proof-c7",
        evidence: [
          {
            proofId: "proof-c7",
            subject: "context7-0.3.0",
            target: "integration",
            method: "invocation",
            result: "pass",
            platform: "windows",
            architecture: "x64",
            harness: "antigravity",
            fingerprint: "a".repeat(64),
          },
        ],
        outcome: "succeeded",
      });
      await appendToolResult(plan, session, {
        toolId: "cua-driver",
        requested: { toolId: "cua-driver", selector: "0.40.0", exact: true },
        resolved: {
          release: "0.40.0",
          artifact: "cua.zip",
          platform: "windows",
          architecture: "x64",
          digest: "b".repeat(64),
          sourceId: "driver-release",
          sourceUrl: "https://github.com/trycua/cua/releases/download/v0.40.0/cua.zip",
        },
        installed: {
          installationId: "cua-0.40.0",
          version: "0.40.0",
          pathAlias: "cua",
        },
        verified: "proof-cua",
        evidence: [
          {
            proofId: "proof-cua",
            subject: "cua-0.40.0",
            target: "integration",
            method: "invocation",
            result: "pass",
            platform: "windows",
            architecture: "x64",
            harness: "antigravity",
            fingerprint: "b".repeat(64),
          },
        ],
        outcome: "succeeded",
      });
      await finishToolOperation(plan, session, [
        { toolId: "mcp:context7", installationId: "context7-0.3.0", proofId: "proof-c7", priorDigest: null },
        { toolId: "cua-driver", installationId: "cua-0.40.0", proofId: "proof-cua", priorDigest: null },
      ]);
    });

    // Write antigravity mcp config with matching versions
    const configPath = join(harnessDir, "mcp_config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          context7: {
            command: "npx",
            args: ["--yes", "@upstash/context7-mcp@0.3.0"],
          },
          cua: {
            command: "node",
            version: "0.40.0",
          },
        },
      }),
      "utf8",
    );

    const findings = await diagnoseToolRecordsAlignment(stateRoot, packageRoot, { antigravity: configPath });

    assert.equal(findings.some((f) => f.code === "TOOL_RECORDS_INITIALIZED"), true);
    assert.equal(findings.some((f) => f.code === "TOOL_RECORDS_MISALIGNED"), false);
    assert.equal(findings.some((f) => f.code === "TOOL_RECORDS_ALIGNED" && f.message.includes("mcp:context7")), true);
    assert.equal(findings.some((f) => f.code === "TOOL_RECORDS_ALIGNED" && f.message.includes("cua-driver")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 2 Doctor: reports TOOL_RECORDS_UNINITIALIZED when local store is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-doc-uninit-"));
  try {
    const stateRoot = join(root, "empty-state");
    const packageRoot = join(root, "package");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });

    const findings = await diagnoseToolRecordsAlignment(stateRoot, packageRoot, {});
    const uninit = findings.find((f) => f.code === "TOOL_RECORDS_UNINITIALIZED");

    assert.notEqual(uninit, undefined);
    assert.equal(uninit?.level, "warning");
    assert.match(uninit?.nextAction ?? "", /alpha-aos migrate/);
    assert.match(uninit?.nextAction ?? "", /alpha-aos install/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 2 Doctor: emits TOOL_RECORDS_MISALIGNED when harness config drifts from accepted records", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-doc-drift-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    const harnessDir = join(root, "harness");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await mkdir(harnessDir, { recursive: true });

    // Seed accepted tool record for mcp:context7 (0.3.0)
    const operationId = "op-align-drift";
    const occurredAt = new Date().toISOString();
    const requests = [{ toolId: "mcp:context7", selector: "0.3.0", exact: true }];

    const plan = await planToolRecordOperation({
      stateRoot,
      packageRoot,
      operationId,
      occurredAt,
      requests,
    });

    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      await appendToolResult(plan, session, {
        toolId: "mcp:context7",
        requested: { toolId: "mcp:context7", selector: "0.3.0", exact: true },
        resolved: {
          release: "0.3.0",
          artifact: "context7.tgz",
          platform: "windows",
          architecture: "x64",
          digest: "a".repeat(64),
          sourceId: "npm-registry",
          sourceUrl: "https://registry.npmjs.org/@upstash/context7-mcp",
        },
        installed: {
          installationId: "context7-0.3.0",
          version: "0.3.0",
          pathAlias: "context7",
        },
        verified: "proof-c7",
        evidence: [
          {
            proofId: "proof-c7",
            subject: "context7-0.3.0",
            target: "integration",
            method: "invocation",
            result: "pass",
            platform: "windows",
            architecture: "x64",
            harness: "claude",
            fingerprint: "a".repeat(64),
          },
        ],
        outcome: "succeeded",
      });
      await finishToolOperation(plan, session, [
        { toolId: "mcp:context7", installationId: "context7-0.3.0", proofId: "proof-c7", priorDigest: null },
      ]);
    });

    // Write claude config with drifted version (0.2.0)
    const configPath = join(harnessDir, ".claude.json");
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          context7: {
            command: "npx",
            args: ["--yes", "@upstash/context7-mcp@0.2.0"],
          },
        },
      }),
      "utf8",
    );

    const findings = await diagnoseToolRecordsAlignment(stateRoot, packageRoot, { claude: configPath });
    const misaligned = findings.find((f) => f.code === "TOOL_RECORDS_MISALIGNED");

    assert.notEqual(misaligned, undefined);
    assert.equal(misaligned?.level, "warning");
    assert.match(misaligned?.message ?? "", /mcp:context7/);
    assert.match(misaligned?.message ?? "", /0\.2\.0/);
    assert.match(misaligned?.message ?? "", /0\.3\.0/);
    assert.match(misaligned?.nextAction ?? "", /alpha-aos sync/);
    assert.match(misaligned?.nextAction ?? "", /alpha-aos update/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 2 Doctor: detects .user-backup files and validates backup hygiene (USER_BACKUP_RETAINED)", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-doc-backup-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    const harnessDir = join(root, "harness");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });
    await mkdir(harnessDir, { recursive: true });

    const configPath = join(harnessDir, "config.toml");
    const backupPath = join(harnessDir, "config.toml.20261109120000.user-backup");

    await writeFile(configPath, "# active config\n", "utf8");
    await writeFile(backupPath, "# backup config\n", "utf8");

    const findings = await diagnoseToolRecordsAlignment(stateRoot, packageRoot, { codex: configPath });
    const backupFinding = findings.find((f) => f.code === "USER_BACKUP_RETAINED");

    assert.notEqual(backupFinding, undefined);
    assert.equal(backupFinding?.level, "info");
    assert.match(backupFinding?.message ?? "", /User backup retained/i);
    assert.match(backupFinding?.message ?? "", /readable/i);
    assert.match(backupFinding?.nextAction ?? "", /Review or archive backup files/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 2 Tool Inventory: reconcileToolState attaches modified (backup: .user-backup) tag for adopted modified config", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-inv-modified-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });

    // Seed tool record with legacy userModificationEvidence: "modified"
    const operationId = "op-inv-mod";
    const occurredAt = new Date().toISOString();
    const requests = [{ toolId: "cua-driver", selector: "0.38.0", exact: true }];

    const plan = await planToolRecordOperation({
      stateRoot,
      packageRoot,
      operationId,
      occurredAt,
      requests,
    });

    await withToolRecordSession(plan, async (session) => {
      await beginToolOperation(plan, session);
      await appendToolResult(plan, session, {
        toolId: "cua-driver",
        requested: { toolId: "cua-driver", selector: "0.38.0", exact: true },
        resolved: {
          release: "0.38.0",
          artifact: "cua.zip",
          platform: "windows",
          architecture: "x64",
          digest: "c".repeat(64),
          sourceId: "driver-release",
          sourceUrl: "https://github.com/trycua/cua/releases/download/v0.38.0/cua.zip",
        },
        installed: {
          installationId: "cua-0.38.0",
          version: "0.38.0",
          pathAlias: "cua-driver",
        },
        legacy: {
          toolId: "cua-driver",
          sourceId: "driver-release",
          sourceUrl: "https://github.com/trycua/cua/releases/download/v0.38.0/cua.zip",
          release: "0.38.0",
          artifact: "cua.zip",
          platform: "windows",
          architecture: "x64",
          artifactDigest: "c".repeat(64),
          provenanceRef: "ref-prov",
          verificationRef: "ref-verif",
          currentRef: "ref-curr",
          scope: "executable-file",
          previousIdentity: "cua-0.38.0",
          priorInstallationOwner: "alpha-aos",
          priorConnectionOwner: "alpha-aos",
          userModificationEvidence: "modified",
        },
        verified: "proof-cua",
        evidence: [
          {
            proofId: "proof-cua",
            subject: "cua-0.38.0",
            target: "integration",
            method: "invocation",
            result: "pass",
            platform: "windows",
            architecture: "x64",
            harness: "codex",
            fingerprint: "c".repeat(64),
          },
        ],
        outcome: "succeeded",
      });
      await finishToolOperation(plan, session, [
        { toolId: "cua-driver", installationId: "cua-0.38.0", proofId: "proof-cua", priorDigest: null },
      ]);
    });

    const store = await readToolRecordStore({ stateRoot, packageRoot });

    const item: ToolObservation = {
      toolId: "cua-driver",
      selected: { version: "0.38.0", source: "cua-driver" },
      installation: "installed",
      installed: { version: "0.38.0", source: "cua-driver" },
      integrity: "unverified",
      integration: "unverified",
      reason: "test",
      nextAction: "test",
    };

    reconcileToolState(item, store, {
      path: "cua-driver",
      fingerprint: "c".repeat(64),
      platform: "windows",
      architecture: "x64",
      identity: "cua-driver",
    });

    assert.equal(item.modifiedTag, "modified (backup: .user-backup)");
    assert.equal(item.diagnostics?.some((d) => d.code === "modified-backup-user-backup"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
