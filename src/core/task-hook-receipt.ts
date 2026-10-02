import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import {
  runProcess,
  resolveCommand,
  scrubEnvironmentForOffTree,
  type ProcessResult,
} from "./process.js";
import { syncDirectory } from "./writer-lock.js";
import { validateManagedDocument } from "./validation.js";

export type GsdHookPoint =
  | "discuss:pre"
  | "discuss:post"
  | "plan:pre"
  | "plan:post"
  | "execute:pre"
  | "execute:post"
  | "verify:pre"
  | "verify:post";

export interface HookExecutionReceipt {
  readonly schemaVersion: 1;
  readonly kind: "hook-execution-receipt";
  readonly receiptId: string;
  readonly hookPoint: GsdHookPoint;
  readonly phaseId: string;
  readonly planId: string | null;
  readonly targetRevisionSha: string;
  readonly workingTreeDigest: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly durationMs: number;
  readonly executedAt: string;
  readonly status: "passed" | "failed";
  readonly receiptDigest: string;
}

export interface ExecuteHookOptions {
  readonly hookPoint: GsdHookPoint;
  readonly phaseId: string;
  readonly planId?: string | null | undefined;
  readonly command: string;
  readonly args?: readonly string[] | undefined;
  readonly cwd: string;
  readonly targetRevisionSha: string;
  readonly workingTreeDigest: string;
  readonly receiptsRoot?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly packageRoot?: string | undefined;
}

export interface ReadHookReceiptOptions {
  readonly phaseId: string;
  readonly planId?: string | null | undefined;
  readonly hookPoint: GsdHookPoint;
  readonly receiptsRoot?: string | undefined;
  readonly packageRoot?: string | undefined;
}

export function computeReceiptPayloadDigest(payload: Omit<HookExecutionReceipt, "receiptDigest">): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

let cachedHookSchema: Record<string, unknown> | null = null;

async function getHookSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedHookSchema !== null && !pkgRoot) {
    return cachedHookSchema;
  }
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "hook-execution-receipt.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!pkgRoot) {
    cachedHookSchema = parsed;
  }
  return parsed;
}

export async function writeHookReceipt(
  receipt: HookExecutionReceipt,
  receiptsRoot?: string,
  pkgRoot?: string,
): Promise<string> {
  const text = JSON.stringify(receipt, null, 2) + "\n";

  const schema = await getHookSchema(pkgRoot);
  const validation = validateManagedDocument<HookExecutionReceipt>({
    text,
    format: "json",
    kind: "task-receipt",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    throw new Error(`Hook receipt validation failed: ${JSON.stringify(validation.issues)}`);
  }

  const validReceipt = validation.value;
  const targetDir = receiptsRoot ?? join(userStateRoot(), "receipts", "hooks");
  const planToken = validReceipt.planId ?? "phase";
  const hookToken = validReceipt.hookPoint.replace(":", "-");
  const fileName = `${validReceipt.phaseId}-${planToken}-${hookToken}.json`;
  const targetPath = join(targetDir, fileName);

  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  const tempPath = join(targetDir, `.${fileName}.${randomUUID()}.tmp`);
  const handle = await open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, targetPath);
  await syncDirectory(targetDir);
  return targetPath;
}

export async function readHookReceipt(
  options: ReadHookReceiptOptions,
): Promise<HookExecutionReceipt | null> {
  const targetDir = options.receiptsRoot ?? join(userStateRoot(), "receipts", "hooks");
  const planToken = options.planId ?? "phase";
  const hookToken = options.hookPoint.replace(":", "-");
  const fileName = `${options.phaseId}-${planToken}-${hookToken}.json`;
  const targetPath = join(targetDir, fileName);

  if (!existsSync(targetPath)) {
    return null;
  }

  let text: string;
  try {
    text = await readFile(targetPath, "utf8");
  } catch {
    return null;
  }

  try {
    const schema = await getHookSchema(options.packageRoot);
    const validation = validateManagedDocument<HookExecutionReceipt>({
      text,
      format: "json",
      kind: "task-receipt",
      schema,
    });
    if (!validation.ok || validation.value === null) {
      return null;
    }
    const receipt = validation.value;
    const { receiptDigest, ...payload } = receipt;
    const computed = computeReceiptPayloadDigest(payload);
    if (computed !== receiptDigest) {
      return null;
    }
    return receipt;
  } catch {
    return null;
  }
}

export async function executeHookWithReceipt(
  options: ExecuteHookOptions,
): Promise<HookExecutionReceipt> {
  const startTime = Date.now();
  const executedAt = new Date().toISOString();
  const args = options.args ?? [];
  const planId = options.planId ?? null;

  let processResult: ProcessResult | null = null;
  let exitCode = 1;
  let stdoutSha256 = createHash("sha256").update("", "utf8").digest("hex");
  let stderrSha256 = createHash("sha256").update("", "utf8").digest("hex");
  let executionError: Error | null = null;

  try {
    const executable = isAbsolute(options.command)
      ? options.command
      : (resolveCommand(options.command) ?? options.command);
    processResult = await runProcess({
      executable,
      args,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs ?? 30_000,
      environment: { literal: scrubEnvironmentForOffTree(process.env).env },
    });
    exitCode = processResult.exitCode ?? (processResult.code === "ok" ? 0 : 1);
    stdoutSha256 = processResult.stdout.sha256;
    stderrSha256 = processResult.stderr.sha256;
    if (processResult.code !== "ok" || exitCode !== 0) {
      executionError = new Error(
        `HOOK_EXECUTION_FAILED: Hook ${options.hookPoint} exited with code ${exitCode} (${processResult.code})`,
      );
    }
  } catch (error) {
    exitCode = 1;
    executionError = error instanceof Error
      ? (error.message.startsWith("HOOK_EXECUTION_FAILED")
          ? error
          : new Error(`HOOK_EXECUTION_FAILED: Hook ${options.hookPoint} failed: ${error.message}`))
      : new Error(`HOOK_EXECUTION_FAILED: Hook ${options.hookPoint} failed with unknown error`);
  }

  const durationMs = Math.max(0, Date.now() - startTime);
  const status: "passed" | "failed" = executionError === null && exitCode === 0 ? "passed" : "failed";

  const receiptId = randomUUID();
  const payload: Omit<HookExecutionReceipt, "receiptDigest"> = {
    schemaVersion: 1,
    kind: "hook-execution-receipt",
    receiptId,
    hookPoint: options.hookPoint,
    phaseId: options.phaseId,
    planId,
    targetRevisionSha: options.targetRevisionSha,
    workingTreeDigest: options.workingTreeDigest,
    command: options.command,
    args,
    exitCode,
    stdoutSha256,
    stderrSha256,
    durationMs,
    executedAt,
    status,
  };

  const receiptDigest = computeReceiptPayloadDigest(payload);
  const receipt: HookExecutionReceipt = {
    ...payload,
    receiptDigest,
  };

  await writeHookReceipt(receipt, options.receiptsRoot, options.packageRoot);

  if (executionError !== null) {
    throw executionError;
  }

  return receipt;
}
