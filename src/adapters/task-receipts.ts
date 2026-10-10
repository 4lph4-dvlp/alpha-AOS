import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessId } from "../types.js";
import { packageRoot as defaultPackageRoot } from "../core/paths.js";
import { syncDirectory } from "../core/writer-lock.js";
import {
  loadAgentSchema,
  nameOnlyEnvironment,
  probeLaunchVersion,
  resolveTaskAgentLaunch,
  TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  type TaskAgentLaunch,
  type TaskAgentResolver,
  type TaskAgentRunner,
} from "./task-agent-launch.js";

export const HARNESS_ROLE_RECEIPT_SCHEMA_NAME = "harness-role-receipt.schema.json";

export interface HarnessRoleCapabilities {
  readonly invoked: boolean;
  readonly cancelled: boolean;
  readonly outputParsed: boolean;
  readonly readOnlyGuaranteed?: boolean;
}

export interface HarnessRoleReceipt {
  readonly schemaVersion: 1;
  readonly harness: HarnessId;
  readonly role: "controller" | "executor" | "reviewer";
  readonly version: string;
  readonly binarySha256: string;
  readonly executable: string;
  readonly probedAt: string;
  readonly capabilities: HarnessRoleCapabilities;
  readonly sampleDigest: string;
}

export interface ReceiptReadResult {
  readonly receipt: HarnessRoleReceipt | null;
  readonly versionDrift: boolean;
  readonly driftReason: string | null;
}

export interface ReadReceiptOptions {
  readonly checkDrift?: boolean | undefined;
  readonly resolve?: TaskAgentResolver | undefined;
  readonly runner?: TaskAgentRunner | undefined;
  readonly packageRoot?: string | undefined;
}

const SUPPORTED_HARNESSES = new Set<string>(["claude", "codex", "antigravity", "pi", "hermes"]);
const SUPPORTED_ROLES = new Set<string>(["controller", "executor", "reviewer"]);
const SHA256_HEX = /^[0-9a-f]{64}$/iu;

/**
 * Validates the strict runtime shape of a HarnessRoleReceipt.
 * Disallows additional properties and checks all mandatory fields.
 */
export function validateHarnessRoleReceiptShape(raw: unknown): HarnessRoleReceipt {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid receipt: must be a non-null object");
  }
  const obj = raw as Record<string, unknown>;

  const allowedKeys = new Set([
    "schemaVersion",
    "harness",
    "role",
    "version",
    "binarySha256",
    "executable",
    "probedAt",
    "capabilities",
    "sampleDigest",
  ]);

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Invalid receipt: unexpected additional property '${key}'`);
    }
  }

  if (obj.schemaVersion !== 1) {
    throw new Error(`Invalid receipt: schemaVersion must be 1, got ${String(obj.schemaVersion)}`);
  }
  if (typeof obj.harness !== "string" || !SUPPORTED_HARNESSES.has(obj.harness)) {
    throw new Error(`Invalid receipt: unsupported harness '${String(obj.harness)}'`);
  }
  if (typeof obj.role !== "string" || !SUPPORTED_ROLES.has(obj.role)) {
    throw new Error(`Invalid receipt: unsupported role '${String(obj.role)}'`);
  }
  if (typeof obj.version !== "string" || obj.version.length === 0) {
    throw new Error("Invalid receipt: version must be a non-empty string");
  }
  if (typeof obj.binarySha256 !== "string" || !SHA256_HEX.test(obj.binarySha256)) {
    throw new Error("Invalid receipt: binarySha256 must be a 64-character lowercase hexadecimal hash");
  }
  if (typeof obj.executable !== "string" || obj.executable.length === 0) {
    throw new Error("Invalid receipt: executable must be a non-empty string");
  }
  if (typeof obj.probedAt !== "string" || obj.probedAt.length === 0) {
    throw new Error("Invalid receipt: probedAt must be a non-empty string");
  }
  if (typeof obj.sampleDigest !== "string" || obj.sampleDigest.length === 0) {
    throw new Error("Invalid receipt: sampleDigest must be a non-empty string");
  }
  if (typeof obj.capabilities !== "object" || obj.capabilities === null || Array.isArray(obj.capabilities)) {
    throw new Error("Invalid receipt: capabilities must be an object");
  }

  const caps = obj.capabilities as Record<string, unknown>;
  const capAllowedKeys = new Set(["invoked", "cancelled", "outputParsed", "readOnlyGuaranteed"]);
  for (const key of Object.keys(caps)) {
    if (!capAllowedKeys.has(key)) {
      throw new Error(`Invalid receipt capabilities: unexpected additional property '${key}'`);
    }
  }
  if (typeof caps.invoked !== "boolean") {
    throw new Error("Invalid receipt capabilities: invoked must be a boolean");
  }
  if (typeof caps.cancelled !== "boolean") {
    throw new Error("Invalid receipt capabilities: cancelled must be a boolean");
  }
  if (typeof caps.outputParsed !== "boolean") {
    throw new Error("Invalid receipt capabilities: outputParsed must be a boolean");
  }
  if (caps.readOnlyGuaranteed !== undefined && typeof caps.readOnlyGuaranteed !== "boolean") {
    throw new Error("Invalid receipt capabilities: readOnlyGuaranteed must be a boolean when present");
  }

  return raw as HarnessRoleReceipt;
}

/**
 * Resolves the atomic file path for a harness role receipt.
 * Defaults to `~/.alpha-aos/receipts/harnesses/<harness>-<role>.json` (ROL-02, D-04).
 */
export function receiptFilePath(harness: HarnessId, role: string, root?: string): string {
  let base: string;
  if (!root) {
    base = join(homedir(), ".alpha-aos", "receipts", "harnesses");
  } else if (existsSync(join(root, "harnesses"))) {
    base = join(root, "harnesses");
  } else {
    base = root;
  }
  return join(base, `${harness}-${role}.json`);
}

/**
 * Computes the deterministic SHA-256 hex digest of a host binary file (ROL-02, D-02).
 */
export async function computeBinarySha256(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Persists an invocation receipt atomically to disk with mode 0o600, fsync, and atomic rename.
 */
export async function writeHarnessRoleReceipt(
  receipt: HarnessRoleReceipt,
  receiptsRoot?: string,
): Promise<void> {
  validateHarnessRoleReceiptShape(receipt);

  const target = receiptFilePath(receipt.harness, receipt.role, receiptsRoot);
  const dir = dirname(target);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const temporary = join(dir, `.${receipt.harness}-${receipt.role}.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(receipt, null, 2)}\n`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
  await syncDirectory(dir);
}

/**
 * Reads an invocation receipt and performs Version Drift verification against the host CLI binary.
 * If file does not exist (ENOENT), returns receipt: null without error.
 * If version drift is detected, demotes to unverified with actionable reason (ROL-02, D-02).
 */
export async function readHarnessRoleReceipt(
  harness: HarnessId,
  role: string,
  receiptsRoot?: string,
  options?: ReadReceiptOptions,
): Promise<ReceiptReadResult> {
  const target = receiptFilePath(harness, role, receiptsRoot);
  let text: string;
  try {
    text = await readFile(target, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { receipt: null, versionDrift: false, driftReason: null };
    }
    throw err;
  }

  let receipt: HarnessRoleReceipt;
  try {
    const parsed = JSON.parse(text) as unknown;
    receipt = validateHarnessRoleReceiptShape(parsed);
  } catch (err) {
    return {
      receipt: null,
      versionDrift: true,
      driftReason: `Receipt file corrupt or invalid schema: ${(err as Error).message}`,
    };
  }

  if (options?.checkDrift === false) {
    return { receipt, versionDrift: false, driftReason: null };
  }

  // 1. Resolve candidate CLI executable
  const candidates: readonly string[] =
    harness === "antigravity" ? ["antigravity", "agy"] : [harness];
  let launch: TaskAgentLaunch | null = null;
  let resolvedCommand: string = harness;

  for (const cmd of candidates) {
    const candidateLaunch = resolveTaskAgentLaunch(
      cmd,
      options?.resolve ? { resolve: options.resolve } : {},
    );
    if (candidateLaunch.status === "ok") {
      launch = candidateLaunch;
      resolvedCommand = cmd;
      break;
    }
    launch = candidateLaunch;
  }

  if (!launch || launch.status !== "ok") {
    return {
      receipt,
      versionDrift: true,
      driftReason: `CLI executable no longer resolvable: ${launch?.reason ?? "not found on PATH"}`,
    };
  }

  // 2. Binary SHA-256 verification
  const binaryTarget =
    launch.argsPrefix.length > 0 && launch.argsPrefix[0]
      ? launch.argsPrefix[0]
      : launch.executable;

  const currentBinaryHash = await computeBinarySha256(binaryTarget).catch(() => null);
  if (currentBinaryHash === null) {
    return {
      receipt,
      versionDrift: true,
      driftReason: `CLI binary file unreadable or missing (${binaryTarget}). Re-probe required. (D-02)`,
    };
  }

  if (currentBinaryHash !== receipt.binarySha256) {
    return {
      receipt,
      versionDrift: true,
      driftReason: `binary hash mismatch (receipt: ${receipt.binarySha256.slice(0, 12)}, current: ${currentBinaryHash.slice(0, 12)}). Re-probe required. (D-02)`,
    };
  }

  // 3. CLI version probe verification
  const probe = await probeLaunchVersion(
    resolvedCommand,
    launch,
    nameOnlyEnvironment(TASK_AGENT_BASE_ENVIRONMENT_NAMES, process.env),
    options?.runner,
  );

  if (probe.status !== "ok") {
    return {
      receipt,
      versionDrift: true,
      driftReason: `CLI version probe failed: ${probe.reason}. Re-probe required. (D-02)`,
    };
  }

  if (probe.version !== receipt.version) {
    return {
      receipt,
      versionDrift: true,
      driftReason: `CLI version mismatch (receipt: ${receipt.version}, current: ${probe.version}). Re-probe required. (D-02)`,
    };
  }

  return { receipt, versionDrift: false, driftReason: null };
}
