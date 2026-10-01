import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTaskDoctorReport, formatDoctorTable, type HarnessDoctorEntry } from "../src/core/task-doctor.js";
import { writeHarnessRoleReceipt } from "../src/adapters/task-receipts.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("buildTaskDoctorReport accurately categorizes unproven harnesses in clean directory", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "alpha-aos-doctor-test-"));
  try {
    const report = await buildTaskDoctorReport(tempDir);
    assert.equal(report.length, 5);

    const harnesses = report.map((e) => e.harness);
    assert.deepEqual(harnesses, ["claude", "codex", "antigravity", "pi", "hermes"]);

    for (const entry of report) {
      assert.equal(entry.roles.controller, "MISSING");
      assert.equal(entry.roles.executor, "MISSING");
      assert.equal(entry.roles.reviewer, "MISSING");
      assert.ok(entry.toolsAndMcp.length > 0);
    }

    const claude = report.find((e) => e.harness === "claude")!;
    assert.equal(claude.telemetry, "measured (tokens+cost)");

    const codex = report.find((e) => e.harness === "codex")!;
    assert.equal(codex.telemetry, "measured (tokens)");

    const pi = report.find((e) => e.harness === "pi")!;
    assert.equal(pi.telemetry, "unmetered");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("buildTaskDoctorReport reports PROVEN when valid role receipts exist and drift check passes", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "alpha-aos-doctor-receipts-"));
  try {
    await writeHarnessRoleReceipt(
      {
        schemaVersion: 1,
        harness: "codex",
        role: "controller",
        version: "0.1.0",
        binarySha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        executable: "C:\\bin\\codex.exe",
        probedAt: new Date().toISOString(),
        capabilities: {
          invoked: true,
          cancelled: true,
          outputParsed: true,
          readOnlyGuaranteed: false,
        },
        sampleDigest: "abc123def456",
      },
      tempDir,
    );

    // With checkDrift: false, valid receipt evaluates to PROVEN
    const report = await buildTaskDoctorReport(tempDir, { checkDrift: false });
    const codex = report.find((e) => e.harness === "codex")!;
    assert.equal(codex.roles.controller, "PROVEN");
    assert.equal(codex.roles.executor, "MISSING");
    assert.equal(codex.roles.reviewer, "MISSING");

    // With checkDrift: true (default), unresolvable host binary demotes to UNVERIFIED (ROL-02, D-02)
    const reportWithDrift = await buildTaskDoctorReport(tempDir);
    const codexDrift = reportWithDrift.find((e) => e.harness === "codex")!;
    assert.equal(codexDrift.roles.controller, "UNVERIFIED");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("formatDoctorTable renders structured 3D matrix table with all columns (D-16)", () => {
  const sampleEntries: HarnessDoctorEntry[] = [
    {
      harness: "claude",
      roles: { controller: "PROVEN", executor: "PROVEN", reviewer: "PROVEN" },
      toolsAndMcp: "Native tools + Claude stdio MCP (JSON)",
      telemetry: "measured (tokens+cost)",
    },
    {
      harness: "codex",
      roles: { controller: "PROVEN", executor: "PROVEN", reviewer: "UNVERIFIED" },
      toolsAndMcp: "Native tools + Codex MCP bridge (TOML)",
      telemetry: "measured (tokens)",
    },
    {
      harness: "pi",
      roles: { controller: "MISSING", executor: "MISSING", reviewer: "MISSING" },
      toolsAndMcp: "Native tools + pi-mcp-adapter",
      telemetry: "unmetered",
    },
  ];

  const table = formatDoctorTable(sampleEntries);
  assert.match(table, /Harness/);
  assert.match(table, /Roles \(Ctrl\/Exec\/Rev\)/);
  assert.match(table, /Tools & MCP/);
  assert.match(table, /Telemetry/);
  assert.match(table, /PROVEN\/PROVEN\/PROVEN/);
  assert.match(table, /PROVEN\/PROVEN\/UNVERIFIED/);
  assert.match(table, /MISSING\/MISSING\/MISSING/);
  assert.match(table, /measured \(tokens\+cost\)/);
  assert.match(table, /measured \(tokens\)/);
  assert.match(table, /unmetered/);
});

test("alpha-aos task doctor CLI outputs text and json formats", async () => {
  const cliPath = join(process.cwd(), "dist", "src", "cli.js");

  // Text mode
  const textRes = await execFileAsync("node", [cliPath, "task", "doctor"]);
  assert.match(textRes.stdout, /Harness/);
  assert.match(textRes.stdout, /Roles \(Ctrl\/Exec\/Rev\)/);
  assert.match(textRes.stdout, /claude/);
  assert.match(textRes.stdout, /codex/);
  assert.match(textRes.stdout, /pi/);

  // JSON mode
  const jsonRes = await execFileAsync("node", [cliPath, "task", "doctor", "--json"]);
  const parsed = JSON.parse(jsonRes.stdout);
  assert.equal(parsed.status, "ok");
  assert.equal(Array.isArray(parsed.harnesses), true);
  assert.equal(parsed.harnesses.length, 5);

  // --apply rejection
  await assert.rejects(
    async () => {
      await execFileAsync("node", [cliPath, "task", "doctor", "--apply"]);
    },
    (err: any) => {
      assert.match(err.stderr || err.message, /`task doctor` has no --apply/);
      return true;
    },
  );
});
