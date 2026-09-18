import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compensateEcc,
  compensateGsd,
  compensateNpmLink,
  compensatePiBridge,
  createRecoveryReceipt,
  writeRecoveryReceipt,
} from "../src/core/recovery-receipt.js";
import { formatRecoveryReceipt } from "../src/format.js";
import type { RecoveryReceipt, RecoveryReceiptEntry } from "../src/types.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("recovery receipt conforms strictly to schema and writes ahead durably (LIFE-07, D-13)", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-receipt-test-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));

  const entries: RecoveryReceiptEntry[] = [
    {
      component: "gsd",
      action: "upgrade",
      target: "codex",
      previousState: "1.11.0",
      appliedState: "1.12.0",
      compensation: compensateGsd("codex", "1.11.0", "1.12.0", "standard"),
    },
    {
      component: "ecc-runtime",
      action: "install",
      target: "machine",
      previousState: null,
      appliedState: "2.2.0",
      compensation: compensateEcc(null, "2.2.0"),
    },
    {
      component: "mcp-bridge",
      action: "link",
      target: "pi",
      previousState: "2.30.0",
      appliedState: "2.31.0",
      compensation: compensatePiBridge("2.30.0"),
    },
    {
      component: "npm-link",
      action: "link",
      target: "machine",
      previousState: null,
      appliedState: "0.1.0",
      compensation: compensateNpmLink(),
    },
  ];

  const receipt = createRecoveryReceipt({
    operationId: "op-install-001",
    entries,
  });

  const writtenPath = await writeRecoveryReceipt(stateRoot, receipt);
  assert.ok(existsSync(writtenPath), "receipt must exist on disk");
  assert.equal(writtenPath, join(stateRoot, "receipts", "op-install-001.json"));

  const diskContent = await readFile(writtenPath, "utf8");
  const parsed = JSON.parse(diskContent) as RecoveryReceipt;
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.operationId, "op-install-001");
  assert.equal(parsed.entries.length, 4);

  const formatted = formatRecoveryReceipt(receipt);
  assert.match(formatted, /alpha-AOS external package recovery receipt \(op-install-001\)/u);
  assert.match(formatted, /Component: gsd/u);
  assert.match(formatted, /npx @opengsd\/gsd-core@1\.11\.0/u);
  assert.match(formatted, /npm uninstall -g @enterprise-coding-companion\/companion/u);
  assert.match(formatted, /npm unlink -g alpha-aos/u);
});

test("invalid recovery receipt with missing or unknown fields is rejected", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-receipt-invalid-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));

  // Missing required compensation field
  const invalidReceipt = {
    schemaVersion: 1,
    operationId: "op-invalid",
    createdAt: new Date().toISOString(),
    entries: [
      {
        component: "unknown-comp",
        action: "install",
        target: "machine",
        previousState: null,
        appliedState: "1.0.0",
      },
    ],
  } as unknown as RecoveryReceipt;

  await assert.rejects(
    () => writeRecoveryReceipt(stateRoot, invalidReceipt),
    /Recovery receipt validation failed/u,
  );
});

test("GSD compensation generator outputs correct command for upgrade and fresh install", () => {
  const upgradeComp = compensateGsd("claude", "1.10.0", "1.12.0", "standard");
  assert.match(upgradeComp.instructions, /Revert GSD Core for claude to previously installed version 1\.10\.0/u);
  assert.deepEqual(upgradeComp.commands, ["npx @opengsd/gsd-core@1.10.0 install --profile standard --runtime claude"]);

  const freshComp = compensateGsd("claude", null, "1.12.0", "standard");
  assert.match(freshComp.instructions, /Remove newly installed GSD Core configuration/u);
  assert.deepEqual(freshComp.commands, ["rm -rf ~/.claude/gsd-core ~/.claude/.gsd-profile"]);
});

test("ECC runtime compensation generator outputs correct command for upgrade and fresh install", () => {
  const upgradeComp = compensateEcc("2.1.0", "2.2.0");
  assert.match(upgradeComp.instructions, /Revert ECC companion runtime to previously installed version 2\.1\.0/u);
  assert.deepEqual(upgradeComp.commands, ["npm install -g @enterprise-coding-companion/companion@2.1.0"]);

  const freshComp = compensateEcc(null, "2.2.0");
  assert.match(freshComp.instructions, /Uninstall newly installed ECC companion runtime/u);
  assert.deepEqual(freshComp.commands, ["npm uninstall -g @enterprise-coding-companion/companion"]);
});

test("Pi bridge and npm link compensation generators output honest instructions", () => {
  const piComp = compensatePiBridge();
  assert.match(piComp.instructions, /Unlink or remove Pi MCP bridge package/u);
  assert.deepEqual(piComp.commands, ["npm unlink @modelcontextprotocol/server-pi"]);

  const npmLinkComp = compensateNpmLink();
  assert.match(npmLinkComp.instructions, /Unlink global alpha-AOS command/u);
  assert.deepEqual(npmLinkComp.commands, ["npm unlink -g alpha-aos"]);
});
