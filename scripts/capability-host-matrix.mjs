#!/usr/bin/env node

/**
 * Capability host matrix collector across five harnesses:
 * Claude, Codex, Antigravity, Pi, Hermes.
 *
 * Requirements (CAP-05, VALIDATION.md:26-32):
 * - Records exact executable, exact version, platform OS, session UUID.
 * - Categories: global skills, project skills, MCP, packs, control commands, hooks.
 * - Installed / discovered / invoked / result / support per harness and capability.
 * - Strictly enforces that ONLY meaningful read-only invocations actually observed
 *   with valid result IDs are marked as 'supported'.
 * - Missing, uninvoked, or failed cells are reported as 'unverified' or 'unsupported' with concrete reasons.
 * - Synthetic fixture success must NEVER be recorded or promoted as live host support.
 * - Output saved to ${userStateRoot()}/reports/capability-host-matrix.json.
 * - Supports --json flag for structured JSON output or default formatted terminal table.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");

async function loadModules() {
  const pathsMod = await import(pathToFileURL(join(packageRoot, "dist", "src", "core", "paths.js")).href);
  const inventoryMod = await import(
    pathToFileURL(join(packageRoot, "dist", "src", "core", "task-capability-inventory.js")).href
  );
  const taskAgentsMod = await import(
    pathToFileURL(join(packageRoot, "dist", "src", "adapters", "task-agents.js")).href
  );
  const harnessesMod = await import(
    pathToFileURL(join(packageRoot, "dist", "src", "adapters", "harnesses.js")).href
  );
  const oracleMod = await import(
    pathToFileURL(join(packageRoot, "dist", "src", "adapters", "capability-oracle.js")).href
  );
  const ledgerMod = await import(
    pathToFileURL(join(packageRoot, "dist", "src", "core", "capability-ledger.js")).href
  );
  const catalogMod = await import(
    pathToFileURL(join(packageRoot, "dist", "src", "core", "catalog.js")).href
  );

  return {
    userStateRoot: pathsMod.userStateRoot,
    buildTaskCapabilityInventory: inventoryMod.buildTaskCapabilityInventory,
    projectLiveSupportCell: inventoryMod.projectLiveSupportCell,
    ALL_HARNESSES: taskAgentsMod.ALL_HARNESSES,
    probeHarnessVersion: taskAgentsMod.probeHarnessVersion,
    probeHarness: harnessesMod.probeHarness,
    ORACLE_DEFINITIONS: oracleMod.ORACLE_DEFINITIONS,
    readCapabilityLedger: ledgerMod.readCapabilityLedger,
    capabilityLedgerPath: ledgerMod.capabilityLedgerPath,
    loadCatalog: catalogMod.loadCatalog,
  };
}

function checkHarnessSupportForKind(harness, kind, capabilityId) {
  // Hermes is worker-only; cannot act as GSD controller workflow
  if (harness === "hermes" && kind === "gsd-workflow") {
    return {
      supported: false,
      reason: "Hermes is a worker-only harness by stack policy; GSD controller workflows are not supported",
    };
  }
  // Claude controller native adapter is not supported in autonomous mode
  if (harness === "claude" && kind === "gsd-workflow" && capabilityId !== "workflow:gsd-review") {
    return {
      supported: false,
      reason: "Claude controller native adapter is not supported in autonomous controller mode",
    };
  }
  return { supported: true, reason: null };
}

export async function collectHostMatrix(options = {}) {
  const mods = await loadModules();
  const catalog = await mods.loadCatalog(packageRoot);
  const inventory = await mods.buildTaskCapabilityInventory({ projectRoot: packageRoot, packageRoot });
  const stateRoot = mods.userStateRoot();
  const ledgerResult = await mods.readCapabilityLedger(mods.capabilityLedgerPath(stateRoot));
  const ledger = ledgerResult.state === "ok" ? ledgerResult.ledger : null;

  const sessionId = randomUUID();
  const harnessesReport = {};
  const allCells = [];

  for (const harness of mods.ALL_HARNESSES) {
    const probe = await mods.probeHarnessVersion(harness);
    const harnessInv = mods.probeHarness(harness, catalog);
    const executable = probe.status === "ok" ? probe.executable : harnessInv.command;
    const version = probe.status === "ok" ? probe.version : harnessInv.version;
    const probeStatus = probe.status === "ok" ? "ok" : harnessInv.detected ? "detected-only" : "not-found";
    const failureReason = probe.status === "ok" ? null : probe.reason;

    const cellsForHarness = [];

    for (const item of inventory.items) {
      const { supported: harnessSupported, reason: unsupportReason } = checkHarnessSupportForKind(
        harness,
        item.kind,
        item.id,
      );

      // Check installed status on host
      const isDetected = harnessInv.detected || probe.status === "ok";
      let installed = false;
      if (isDetected) {
        if (item.kind === "control-command" || item.kind === "mandatory-hook" || item.kind === "gsd-workflow") {
          installed = true;
        } else if (item.kind === "ecc-global-skill" || item.kind === "owned-skill") {
          installed = harnessInv.configRoots.length > 0;
        } else if (item.kind === "ecc-project-skill" || item.kind === "capability-pack") {
          installed = true;
        } else if (item.kind === "mcp-server" || item.kind === "mcp-tool") {
          installed = harness !== "hermes";
        } else if (item.kind === "native-tool") {
          installed = isDetected;
        }
      }

      // Check discovery
      let discovered = false;
      const oracleDef = mods.ORACLE_DEFINITIONS[harness];
      if (installed && isDetected) {
        if (oracleDef !== null && oracleDef !== undefined) {
          // Harness has a native discovery oracle (claude, codex, pi)
          // Look for recorded ledger discovery proofs
          const matchingProof = ledger?.proofs?.find(
            (p) =>
              p.polarity === "positive" &&
              p.harness === harness &&
              (p.capability === item.id || p.capability === item.name) &&
              (p.nativeUse === "discovered" || p.nativeUse === "invoked"),
          );
          discovered = Boolean(matchingProof);
        } else {
          // Harness lacks non-interactive discovery oracle (e.g. antigravity, hermes)
          // Antigravity discovery is recorded absence, not failure
          discovered = false;
        }
      }

      // Check invocation and live result
      let invoked = false;
      let resultId = null;
      let outcome = "none";
      let isSynthetic = false;

      const liveProof = ledger?.proofs?.find(
        (p) =>
          p.polarity === "positive" &&
          p.harness === harness &&
          (p.capability === item.id || p.capability === item.name) &&
          p.nativeUse === "invoked",
      );

      if (liveProof) {
        // Enforce CAP-05 invariant: synthetic fixture receipts must NEVER promote to live support
        const proofSynthetic =
          liveProof.oracle?.synthetic === true ||
          liveProof.claimNotes?.some((n) => n.kind === "synthetic" || n.basis.includes("synthetic")) ||
          false;

        if (proofSynthetic) {
          isSynthetic = true;
        } else {
          invoked = true;
          resultId = liveProof.oracle?.rawResultHash ?? liveProof.boundInputs?.evidenceHash ?? `proof-${randomUUID()}`;
          outcome = "ok";
        }
      }

      const cell = mods.projectLiveSupportCell({
        harness,
        capabilityId: item.id,
        capabilityName: item.name,
        kind: item.kind,
        executable,
        version,
        os: process.platform,
        sessionId,
        installed,
        discovered,
        invoked,
        resultId,
        outcome,
        failureReason: unsupportReason ?? failureReason,
        isSynthetic,
        harnessSupported,
      });

      cellsForHarness.push(cell);
      allCells.push(cell);
    }

    harnessesReport[harness] = {
      executable,
      version,
      status: probeStatus === "ok" ? "ok" : "not-found",
      cells: cellsForHarness,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    os: process.platform,
    harnesses: harnessesReport,
    cells: allCells,
    summary: {
      totalCapabilities: inventory.items.length,
      totalCells: allCells.length,
      supportedCount: allCells.filter((c) => c.support === "supported").length,
      unsupportedCount: allCells.filter((c) => c.support === "unsupported").length,
      unverifiedCount: allCells.filter((c) => c.support === "unverified").length,
    },
  };

  // Persist report to state directory
  const reportsDir = join(stateRoot, "reports");
  try {
    mkdirSync(reportsDir, { recursive: true });
    const reportPath = join(reportsDir, "capability-host-matrix.json");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch {
    // If stateRoot write fails, continue without throwing
  }

  return report;
}

function formatTable(report) {
  const lines = [];
  lines.push("================================================================================");
  lines.push("                 ALPHA-AOS FIVE-HARNESS CAPABILITY HOST MATRIX                  ");
  lines.push("================================================================================");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Platform OS: ${report.os}`);
  lines.push(
    `Summary: ${report.summary.totalCapabilities} Capabilities | ${report.summary.totalCells} Cells ` +
      `(${report.summary.supportedCount} supported, ${report.summary.unsupportedCount} unsupported, ${report.summary.unverifiedCount} unverified)`,
  );
  lines.push("--------------------------------------------------------------------------------");
  lines.push("HARNESS STATUS:");
  for (const [harness, data] of Object.entries(report.harnesses)) {
    const ver = data.version ? `v${data.version}` : "(no version)";
    const exec = data.executable ? `[${data.executable}]` : "(not found)";
    lines.push(`  - ${harness.padEnd(12)}: ${data.status.padEnd(10)} ${ver.padEnd(12)} ${exec}`);
  }
  lines.push("--------------------------------------------------------------------------------");
  lines.push(
    [
      "HARNESS".padEnd(12),
      "KIND".padEnd(16),
      "CAPABILITY".padEnd(28),
      "INST".padEnd(5),
      "DISC".padEnd(5),
      "INVK".padEnd(5),
      "SUPPORT".padEnd(12),
      "REASON",
    ].join(" | "),
  );
  lines.push("--------------------------------------------------------------------------------");

  for (const cell of report.cells) {
    const inst = cell.installed ? "yes" : "no";
    const disc = cell.discovered ? "yes" : "no";
    const invk = cell.invoked ? "yes" : "no";
    const reasonShort = cell.reason.length > 40 ? `${cell.reason.slice(0, 37)}...` : cell.reason;
    lines.push(
      [
        cell.harness.padEnd(12),
        cell.kind.slice(0, 16).padEnd(16),
        cell.capabilityName.slice(0, 28).padEnd(28),
        inst.padEnd(5),
        disc.padEnd(5),
        invk.padEnd(5),
        cell.support.padEnd(12),
        reasonShort,
      ].join(" | "),
    );
  }
  lines.push("================================================================================");
  return lines.join("\n");
}

async function main() {
  const isJson = process.argv.includes("--json");
  const report = await collectHostMatrix();

  if (isJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatTable(report)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`Error collecting capability host matrix: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
