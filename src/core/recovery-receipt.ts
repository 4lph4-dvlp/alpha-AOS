import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RecoveryReceipt, RecoveryReceiptEntry } from "../types.js";
import { packageRoot } from "./paths.js";
import { validateManagedDocument } from "./validation.js";

let cachedSchema: Record<string, unknown> | null = null;

async function getRecoveryReceiptSchema(): Promise<Record<string, unknown>> {
  if (cachedSchema) return cachedSchema;
  const schemaPath = join(packageRoot(), "schemas", "recovery-receipt.schema.json");
  cachedSchema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;
  return cachedSchema;
}

export function createRecoveryReceipt(options: {
  operationId: string;
  entries: readonly RecoveryReceiptEntry[];
  createdAt?: string;
}): RecoveryReceipt {
  return {
    schemaVersion: 1,
    operationId: options.operationId,
    createdAt: options.createdAt ?? new Date().toISOString(),
    entries: options.entries,
  };
}

export async function writeRecoveryReceipt(
  stateRoot: string,
  receipt: RecoveryReceipt,
): Promise<string> {
  const schema = await getRecoveryReceiptSchema();
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  const validated = validateManagedDocument<RecoveryReceipt>({
    text,
    format: "json",
    kind: "recovery-receipt",
    schema,
  });
  if (!validated.ok) {
    const first = validated.issues[0];
    const detail = first ? `${first.code} at ${first.documentPath} (${first.expected})` : validated.status;
    throw new Error(`Recovery receipt validation failed: ${detail}`);
  }

  const destinationDir = join(stateRoot, "receipts");
  await mkdir(destinationDir, { recursive: true });
  const destinationPath = join(destinationDir, `${receipt.operationId}.json`);
  await writeFile(destinationPath, text, "utf8");
  return destinationPath;
}

export function compensateGsd(
  target: string,
  previousVersion: string | null,
  appliedVersion: string,
  profile = "standard",
): { instructions: string; commands: string[] } {
  if (previousVersion) {
    return {
      instructions: `Revert GSD Core for ${target} to previously installed version ${previousVersion} (${profile}).`,
      commands: [`npx @opengsd/gsd-core@${previousVersion} install --profile ${profile} --runtime ${target}`],
    };
  }
  return {
    instructions: `Remove newly installed GSD Core configuration and state files for ${target}.`,
    commands: [`rm -rf ~/.${target}/gsd-core ~/.${target}/.gsd-profile`],
  };
}

export function compensateEcc(
  previousVersion: string | null,
  appliedVersion: string,
): { instructions: string; commands: string[] } {
  if (previousVersion) {
    return {
      instructions: `Revert ECC companion runtime to previously installed version ${previousVersion}.`,
      commands: [`npm install -g @enterprise-coding-companion/companion@${previousVersion}`],
    };
  }
  return {
    instructions: `Uninstall newly installed ECC companion runtime.`,
    commands: [`npm uninstall -g @enterprise-coding-companion/companion`],
  };
}

export function compensatePiBridge(
  previousVersion: string | null = null,
): { instructions: string; commands: string[] } {
  if (previousVersion) {
    return {
      instructions: `Revert Pi MCP bridge to previously installed version ${previousVersion}.`,
      commands: [`npm install @modelcontextprotocol/server-pi@${previousVersion}`],
    };
  }
  return {
    instructions: `Unlink or remove Pi MCP bridge package.`,
    commands: [`npm unlink @modelcontextprotocol/server-pi`],
  };
}

export function compensateNpmLink(): { instructions: string; commands: string[] } {
  return {
    instructions: `Unlink global alpha-AOS command.`,
    commands: [`npm unlink -g alpha-aos`],
  };
}
