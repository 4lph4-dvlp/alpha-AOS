import assert from "node:assert/strict";
import test from "node:test";
import {
  formatComponentHarnessMatrix,
  matrixStatusBadge,
  type ComponentHarnessMatrixRow,
} from "../src/format.js";

test("Task 1 Matrix Formatter: all 5 status badges format accurately", () => {
  assert.equal(matrixStatusBadge("updated"), "UPDATED [OK]");
  assert.equal(matrixStatusBadge("retained"), "RETAINED [SKIP]");
  assert.equal(matrixStatusBadge("recovered"), "RECOVERED [ROLLBACK]");
  assert.equal(matrixStatusBadge("unverified"), "UNVERIFIED [PENDING]");
  assert.equal(matrixStatusBadge("failed"), "FAILED [ERR]");
});

test("Task 1 Matrix Formatter: column headers and structure match standard CLI table styling", () => {
  const rows: ComponentHarnessMatrixRow[] = [
    {
      toolId: "cua-driver",
      harness: "codex",
      status: "updated",
      sharedConfigImpact: "marker-block preserved",
      actionRequired: "none",
    },
  ];

  const formatted = formatComponentHarnessMatrix(rows);
  const lines = formatted.split("\n");

  assert.equal(lines.length, 3); // header, dashes, row
  assert.match(lines[0] ?? "", /Tool\s+Harness\s+Status\s+Shared Config Impact\s+Action Required/);
  assert.match(lines[1] ?? "", /-{4,}\s+-{7,}\s+-{6,}\s+-{20,}\s+-{15,}/);
  assert.match(lines[2] ?? "", /cua-driver\s+codex\s+UPDATED \[OK\]\s+marker-block preserved\s+none/);
});

test("Task 1 Matrix Formatter: mixed outcome scenarios preserve distinct rows without collapsing to boolean success/failure", () => {
  const rows: ComponentHarnessMatrixRow[] = [
    {
      toolId: "gsd",
      harness: "claude",
      status: "updated",
      sharedConfigImpact: "unaffected",
      actionRequired: "none",
    },
    {
      toolId: "gsd",
      harness: "codex",
      status: "updated",
      sharedConfigImpact: "marker preserved",
      actionRequired: "none",
    },
    {
      toolId: "mcp:context7",
      harness: "antigravity",
      status: "updated",
      sharedConfigImpact: "server updated",
      actionRequired: "none",
    },
    {
      toolId: "mcp:exa",
      harness: "pi",
      status: "unverified",
      sharedConfigImpact: "pending install",
      actionRequired: "run integration verify",
    },
    {
      toolId: "mcp:firecrawl",
      harness: "hermes",
      status: "failed",
      sharedConfigImpact: "reverted config",
      actionRequired: "check proxy permissions",
    },
    {
      toolId: "cua-driver",
      harness: "codex",
      status: "retained",
      sharedConfigImpact: "unmodified",
      actionRequired: "none",
    },
    {
      toolId: "bridge:pi",
      harness: "pi",
      status: "recovered",
      sharedConfigImpact: "rolled back to stable",
      actionRequired: "re-run update with --force",
    },
  ];

  const formatted = formatComponentHarnessMatrix(rows);

  // Assert all 5 badges are present in the table output
  assert.match(formatted, /UPDATED \[OK\]/);
  assert.match(formatted, /RETAINED \[SKIP\]/);
  assert.match(formatted, /UNVERIFIED \[PENDING\]/);
  assert.match(formatted, /FAILED \[ERR\]/);
  assert.match(formatted, /RECOVERED \[ROLLBACK\]/);

  // Assert each row is preserved separately
  assert.match(formatted, /gsd\s+claude\s+UPDATED \[OK\]/);
  assert.match(formatted, /gsd\s+codex\s+UPDATED \[OK\]/);
  assert.match(formatted, /mcp:context7\s+antigravity\s+UPDATED \[OK\]/);
  assert.match(formatted, /mcp:exa\s+pi\s+UNVERIFIED \[PENDING\]/);
  assert.match(formatted, /mcp:firecrawl\s+hermes\s+FAILED \[ERR\]/);
  assert.match(formatted, /cua-driver\s+codex\s+RETAINED \[SKIP\]/);
  assert.match(formatted, /bridge:pi\s+pi\s+RECOVERED \[ROLLBACK\]/);
});

test("Task 1 Matrix Formatter: empty rows renders headers and dashes without error", () => {
  const formatted = formatComponentHarnessMatrix([]);
  const lines = formatted.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? "", /Tool\s+Harness\s+Status\s+Shared Config Impact\s+Action Required/);
});
