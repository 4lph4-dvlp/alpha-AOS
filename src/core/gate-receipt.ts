import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  EngineSelection,
  GateObligationType,
  GateReceipt,
} from "../types.js";
import { packageRoot, userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { validateManagedDocument } from "./validation.js";

// ---------------------------------------------------------------------------
// Working Tree Risk Surface Digest (D-09)
// ---------------------------------------------------------------------------

export async function computeRiskSurfaceDigest(
  projectRoot: string,
  riskFiles: readonly string[]
): Promise<string> {
  const sortedFiles = Array.from(new Set(riskFiles)).sort();
  const hasher = createHash("sha256");

  for (const relPath of sortedFiles) {
    const fullPath = join(projectRoot, relPath);
    try {
      const content = await readFile(fullPath);
      const fileHash = createHash("sha256").update(content).digest("hex");
      hasher.update(`${relPath}:${fileHash}\n`, "utf8");
    } catch {
      hasher.update(`${relPath}:MISSING\n`, "utf8");
    }
  }

  return hasher.digest("hex");
}

// ---------------------------------------------------------------------------
// Gate Receipt Factory (GATE-02, D-06)
// ---------------------------------------------------------------------------

export function createGateReceipt(params: {
  obligation: GateObligationType;
  engineSelection: EngineSelection;
  executionResult: { exitCode: number; stdout: string; stderr: string };
  targetCommitSha: string;
  workingTreeDigest: string;
  evidenceHash: string;
  diagnostics?: string;
}): GateReceipt {
  const status = params.executionResult.exitCode === 0 ? "passed" : "failed";
  const diagnostics =
    params.diagnostics ??
    (status === "failed"
      ? (params.executionResult.stderr.trim() || params.executionResult.stdout.trim() || undefined)
      : undefined);

  return {
    schemaVersion: 1,
    obligation: params.obligation,
    status,
    engine: params.engineSelection.selectedEngine,
    targetCommitSha: params.targetCommitSha,
    workingTreeDigest: params.workingTreeDigest,
    exitCode: params.executionResult.exitCode,
    executedAt: new Date().toISOString(),
    suppressedEngines: params.engineSelection.suppressedEngines,
    evidenceHash: params.evidenceHash,
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}

// ---------------------------------------------------------------------------
// Atomic Gate Receipt Persistence (D-06, SAFE-03)
// ---------------------------------------------------------------------------

export async function writeGateReceipt(
  projectRoot: string,
  receipt: GateReceipt
): Promise<{ receiptPath: string; transactionId: string }> {
  const relReceiptPath = join(".alpha-aos", "receipts", "gates", `${receipt.obligation}.json`).replace(/\\/g, "/");
  const fullReceiptPath = join(projectRoot, relReceiptPath);

  const text = JSON.stringify(receipt, null, 2) + "\n";

  // Validate strictly against schemas/gate-receipt.schema.json before writing
  const pkgRoot = packageRoot();
  const schemaPath = join(pkgRoot, "schemas", "gate-receipt.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;

  const validation = validateManagedDocument<GateReceipt>({
    text,
    format: "json",
    kind: "gate-receipt",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    throw new Error(
      `Gate receipt for ${receipt.obligation} failed schema validation: ${JSON.stringify(validation.issues)}`
    );
  }

  // Write atomically via applyFileTransaction
  const journal = await applyFileTransaction({
    stateRoot: userStateRoot(),
    allowedRoots: [join(projectRoot, ".alpha-aos")],
    operations: [
      {
        target: fullReceiptPath,
        content: Buffer.from(text, "utf8"),
      },
    ],
  });

  return {
    receiptPath: fullReceiptPath,
    transactionId: journal.id,
  };
}

// ---------------------------------------------------------------------------
// Strict Gate Receipt Reader
// ---------------------------------------------------------------------------

export async function readGateReceiptStrict(
  projectRoot: string,
  obligation: GateObligationType
): Promise<GateReceipt | null> {
  const relReceiptPath = join(".alpha-aos", "receipts", "gates", `${obligation}.json`);
  const fullReceiptPath = join(projectRoot, relReceiptPath);

  if (!existsSync(fullReceiptPath)) {
    return null;
  }

  const text = await readFile(fullReceiptPath, "utf8");
  const pkgRoot = packageRoot();
  const schemaPath = join(pkgRoot, "schemas", "gate-receipt.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;

  const validation = validateManagedDocument<GateReceipt>({
    text,
    format: "json",
    kind: "gate-receipt",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    throw new Error(
      `Gate receipt for ${obligation} is invalid or tampered: ${JSON.stringify(validation.issues)}`
    );
  }

  return validation.value;
}
