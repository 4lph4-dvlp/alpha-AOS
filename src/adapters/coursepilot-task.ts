import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  resolveCommand,
  runProcess,
  type ProcessResult,
  type EnvironmentPolicy,
} from "../core/process.js";
import {
  connectorManifestDigest,
  type ConnectorFileReceiptV1,
  type ConnectorItemV1,
  type ConnectorManifestV1,
  type ConnectorPort,
  type ConnectorPreviewResult,
  type ConnectorPerformRequest,
  type ConnectorPerformResult,
  type ConnectorPerformStatus,
  type ConnectorReconcileRequest,
  type ConnectorReconcileResult,
  type ConnectorVerifyRequest,
  type ConnectorVerifyResult,
} from "../core/task-connector.js";
import {
  verifyConnectorFileReceipt,
} from "../core/task-connector-files.js";

export const COURSEPILOT_CONNECTOR_ID = "coursepilot";
export const COURSEPILOT_PROTOCOL_VERSION = 1;
export const COURSEPILOT_MAX_MANIFEST_BYTES = 256 * 1024;
export const COURSEPILOT_UNMET_GATE_ACTION =
  "Implement, test, commit and install the CoursePilot public materials contract in its own repository";

export interface CoursePilotRuntimeResolution {
  status: "available" | "unavailable";
  repoRoot: string | null;
  skillPath: string | null;
  contractDocPath: string | null;
  skillFingerprint: string | null;
  contractFingerprint: string | null;
  sourceCommit: string | null;
  uvExecutable: string | null;
  contractVersion: number | null;
  supported: boolean;
  missingProof: string[];
  nextAction: string | null;
}

export interface CoursePilotMaterialFileV1 {
  fileId: string;
  filename: string;
  destination?: string | undefined;
  expectedBytes?: number | undefined;
  expectedSha256?: string | undefined;
}

export interface CoursePilotMaterialV1 {
  moduleId: string;
  courseId: string;
  weekNumber: number;
  title: string;
  sourceIdentity: string;
  sourceUrl?: string | undefined;
  attachmentsComplete: boolean;
  files: readonly CoursePilotMaterialFileV1[];
  incompleteReason?: string | undefined;
}

export interface CoursePilotCoarseManifestV1 {
  schemaVersion: 1;
  operation: "manifest";
  status: "ok" | "error";
  observedAt: string;
  materials: readonly CoursePilotMaterialV1[];
  errors?: readonly string[] | undefined;
}

export interface CoursePilotManifestDiff {
  added: readonly CoursePilotMaterialV1[];
  removed: readonly CoursePilotMaterialV1[];
  changed: readonly {
    before: CoursePilotMaterialV1;
    current: CoursePilotMaterialV1;
    reason: string;
  }[];
  unchanged: readonly CoursePilotMaterialV1[];
  hasDiff: boolean;
}

export interface CoursePilotExactSelector {
  courseId: string;
  moduleId: string;
  fileId: string;
}

export type CoursePilotProcessRunner = (options: {
  executable: string;
  args: readonly string[];
  cwd: string;
  environment: EnvironmentPolicy;
  timeoutMs?: number;
}) => Promise<ProcessResult>;

/**
 * Sanitizes LMS text: strips control characters, normalizes whitespace,
 * limits length, and treats strictly as raw string data (TOOL-04).
 */
export function sanitizeLmsString(raw: string, maxLen = 200): string {
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/gu, "").replace(/\s+/gu, " ").trim();
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 3)}...`;
}

/**
 * Resolves the installed CoursePilot skill, repository marker, contract doc,
 * source commit, and CLI canary capabilities.
 */
export async function resolveCoursePilotRuntime(options: {
  overrideRepoRoot?: string | undefined;
  overrideSkillPath?: string | undefined;
  runner?: CoursePilotProcessRunner | undefined;
} = {}): Promise<CoursePilotRuntimeResolution> {
  const missingProof: string[] = [];

  // 1. Locate skill file
  let skillPath: string | null = null;
  const candidateSkillPaths = [
    options.overrideSkillPath,
    join(homedir(), ".codex", "skills", "coursepilot", "SKILL.md"),
    join("D:", "dev", "coursePilot", "skills", "coursepilot", "SKILL.md"),
  ].filter((p): p is string => Boolean(p));

  let skillContent: string | null = null;
  for (const candidate of candidateSkillPaths) {
    try {
      skillContent = await readFile(candidate, "utf8");
      skillPath = candidate;
      break;
    } catch {
      // try next
    }
  }

  let skillFingerprint: string | null = null;
  if (skillContent) {
    skillFingerprint = createHash("sha256").update(skillContent, "utf8").digest("hex");
  } else {
    missingProof.push("CoursePilot SKILL.md not found in expected locations");
  }

  // 2. Resolve repository root
  let repoRoot: string | null = options.overrideRepoRoot ?? null;
  if (!repoRoot && skillContent) {
    const match = /Repository root:\s*`([^`]+)`/u.exec(skillContent);
    if (match?.[1] && match[1] !== "{{COURSEPILOT_REPO}}") {
      repoRoot = match[1];
    } else {
      try {
        const repoTxt = await readFile(join(homedir(), ".coursepilot", "repo-root.txt"), "utf8");
        repoRoot = repoTxt.trim();
      } catch {
        // Fallback default dev path if present
        repoRoot = join("D:", "dev", "coursePilot");
      }
    }
  }

  // 3. Locate JSON_CONTRACT.md
  let contractDocPath: string | null = null;
  let contractFingerprint: string | null = null;
  if (repoRoot) {
    const candidateDoc = join(repoRoot, "skills", "coursepilot", "JSON_CONTRACT.md");
    try {
      const docContent = await readFile(candidateDoc, "utf8");
      contractDocPath = candidateDoc;
      contractFingerprint = createHash("sha256").update(docContent, "utf8").digest("hex");
    } catch {
      // contract doc not found
      missingProof.push("CoursePilot JSON_CONTRACT.md not found");
    }
  }

  // 4. Resolve uv executable
  let uvExecutable: string | null = null;
  try {
    uvExecutable = resolveCommand("uv");
  } catch {
    missingProof.push("uv executable not found on PATH");
  }

  // 5. Source commit
  let sourceCommit: string | null = null;
  if (repoRoot) {
    try {
      const headContent = await readFile(join(repoRoot, ".git", "HEAD"), "utf8");
      const trimmed = headContent.trim();
      if (trimmed.startsWith("ref: ")) {
        const refPath = trimmed.slice(5);
        sourceCommit = (await readFile(join(repoRoot, ".git", ...refPath.split("/")), "utf8")).trim();
      } else {
        sourceCommit = trimmed;
      }
    } catch {
      // head read failed
    }
  }

  // 6. Probe CLI help for D-17 contract support
  let supported = false;
  let contractVersion: number | null = null;
  if (repoRoot && uvExecutable) {
    const runner = options.runner ?? runProcess;
    try {
      const helpResult = await runner({
        executable: uvExecutable,
        args: ["--directory", repoRoot, "run", "python", "-m", "coursepilot", "materials", "--help"],
        cwd: tmpdir(),
        environment: { optional: ["PATH", "SYSTEMROOT", "HOME", "USERPROFILE"], source: process.env },
        timeoutMs: 10000,
      });

      if (helpResult.code === "ok") {
        const helpText = helpResult.stdout.excerpt;
        if (helpText.includes("--contract-version") || helpText.includes("--manifest")) {
          supported = true;
          contractVersion = 1;
        } else {
          missingProof.push("D-17 public materials contract flags (--contract-version/--manifest) not supported in CLI help");
        }
      } else {
        missingProof.push(`CoursePilot CLI probe returned non-ok status: ${helpResult.code}`);
      }
    } catch (err) {
      missingProof.push(`Failed to probe CoursePilot CLI: ${(err as Error).message}`);
    }
  } else {
    missingProof.push("Cannot probe CLI: repoRoot or uvExecutable missing");
  }

  const isAvailable = Boolean(repoRoot && skillPath && uvExecutable);
  const nextAction = supported ? null : COURSEPILOT_UNMET_GATE_ACTION;

  return {
    status: isAvailable ? "available" : "unavailable",
    repoRoot,
    skillPath,
    contractDocPath,
    skillFingerprint,
    contractFingerprint,
    sourceCommit,
    uvExecutable,
    contractVersion,
    supported,
    missingProof,
    nextAction,
  };
}

/**
 * Validates and strictly parses raw coarse manifest JSON (TOOL-04).
 * Rejects byte limit violations, malformed JSON, unknown schemas, and duplicate identities.
 */
export function parseCoursePilotManifestJson(
  rawText: string,
  maxBytes = COURSEPILOT_MAX_MANIFEST_BYTES,
): CoursePilotCoarseManifestV1 {
  const byteLength = Buffer.byteLength(rawText, "utf8");
  if (byteLength > maxBytes) {
    throw new Error(`CoursePilot manifest exceeds maximum allowed size (${byteLength} > ${maxBytes} bytes)`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`CoursePilot manifest malformed JSON: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("CoursePilot manifest must be a non-null JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["schema_version"] !== 1 && obj["schemaVersion"] !== 1) {
    throw new Error(`Unsupported CoursePilot schema version: ${String(obj["schema_version"] ?? obj["schemaVersion"])}`);
  }

  if (obj["operation"] !== "manifest") {
    throw new Error(`Expected operation 'manifest', received: ${String(obj["operation"])}`);
  }

  const rawMaterials = Array.isArray(obj["materials"]) ? obj["materials"] : [];
  const materials: CoursePilotMaterialV1[] = [];
  const seenModuleIds = new Set<string>();

  for (const rawMat of rawMaterials) {
    if (typeof rawMat !== "object" || rawMat === null) {
      throw new Error("Material item must be an object");
    }
    const mat = rawMat as Record<string, unknown>;
    const moduleId = String(mat["module_id"] ?? mat["moduleId"] ?? "");
    if (!moduleId) {
      throw new Error("Material missing required moduleId");
    }
    if (seenModuleIds.has(moduleId)) {
      throw new Error(`Duplicate moduleId in CoursePilot manifest: ${moduleId}`);
    }
    seenModuleIds.add(moduleId);

    const courseId = String(mat["course_id"] ?? mat["courseId"] ?? "");
    const weekNumber = Number(mat["week_number"] ?? mat["weekNumber"] ?? 0);
    const title = sanitizeLmsString(String(mat["title"] ?? ""));
    const sourceIdentity = String(mat["source_identity"] ?? mat["sourceIdentity"] ?? `${courseId}:${weekNumber}:${moduleId}`);
    const sourceUrl = mat["source_url"] || mat["sourceUrl"] ? String(mat["source_url"] ?? mat["sourceUrl"]) : undefined;
    const attachmentsComplete = Boolean(mat["attachments_complete"] ?? mat["attachmentsComplete"] ?? false);
    const incompleteReason = mat["incomplete_reason"] || mat["incompleteReason"] ? String(mat["incomplete_reason"] ?? mat["incompleteReason"]) : undefined;

    const rawFiles = Array.isArray(mat["files"]) ? mat["files"] : [];
    const files: CoursePilotMaterialFileV1[] = [];
    const seenFileIds = new Set<string>();

    for (const rawFile of rawFiles) {
      if (typeof rawFile !== "object" || rawFile === null) continue;
      const f = rawFile as Record<string, unknown>;
      const fileId = String(f["file_id"] ?? f["fileId"] ?? "");
      if (!fileId) throw new Error(`Material file missing required fileId in module ${moduleId}`);
      if (seenFileIds.has(fileId)) throw new Error(`Duplicate fileId '${fileId}' in module ${moduleId}`);
      seenFileIds.add(fileId);

      const filename = sanitizeLmsString(String(f["filename"] ?? fileId));
      const destination = f["destination"] ? String(f["destination"]) : undefined;
      const expectedBytes = typeof f["expected_bytes"] === "number" ? f["expected_bytes"] : (typeof f["expectedBytes"] === "number" ? f["expectedBytes"] : undefined);
      const expectedSha256 = f["expected_sha256"] ? String(f["expected_sha256"]) : (f["expectedSha256"] ? String(f["expectedSha256"]) : undefined);

      files.push({
        fileId,
        filename,
        destination,
        expectedBytes,
        expectedSha256,
      });
    }

    materials.push({
      moduleId,
      courseId,
      weekNumber,
      title,
      sourceIdentity,
      sourceUrl,
      attachmentsComplete,
      files,
      incompleteReason,
    });
  }

  // Sort deterministically by courseId, weekNumber, moduleId
  materials.sort((a, b) => {
    if (a.courseId !== b.courseId) return a.courseId.localeCompare(b.courseId);
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    return a.moduleId.localeCompare(b.moduleId);
  });

  return {
    schemaVersion: 1,
    operation: "manifest",
    status: obj["status"] === "error" ? "error" : "ok",
    observedAt: String(obj["observed_at"] ?? obj["observedAt"] ?? new Date().toISOString()),
    materials,
    errors: Array.isArray(obj["errors"]) ? obj["errors"].map(String) : undefined,
  };
}

/**
 * Converts CoursePilot materials to alpha-AOS ConnectorManifestV1.
 */
export function coursePilotToConnectorManifest(
  coarse: CoursePilotCoarseManifestV1,
  options: {
    adapterContractDigest: string;
    targetDir?: string;
  },
): ConnectorManifestV1 {
  const items: ConnectorItemV1[] = [];

  for (const mat of coarse.materials) {
    const defaultDest = options.targetDir
      ? join(options.targetDir, mat.courseId, `week-${mat.weekNumber}`, mat.moduleId).replace(/\\/g, "/")
      : `content/${mat.courseId}/week-${mat.weekNumber}/${mat.moduleId}`;

    const requiredFiles = mat.files.map((f) => ({
      fileId: f.fileId,
      filename: f.filename,
      destination: f.destination ?? `${defaultDest}/${f.filename}`,
      ...(f.expectedBytes !== undefined ? { expectedBytes: f.expectedBytes } : {}),
      ...(f.expectedSha256 !== undefined ? { expectedSha256: f.expectedSha256 } : {}),
    }));

    items.push({
      itemId: mat.moduleId,
      sourceIdentity: mat.sourceIdentity,
      title: mat.title,
      intendedDestination: defaultDest,
      effectKinds: ["workspace-write", "external-download"],
      requiredFiles,
    });
  }

  return {
    protocolVersion: 1,
    schemaVersion: 1,
    connectorId: COURSEPILOT_CONNECTOR_ID,
    adapterContractDigest: options.adapterContractDigest,
    observedAt: coarse.observedAt,
    items,
  };
}

/**
 * Computes exact diff between two CoursePilot manifests (D-01..D-04).
 * Order-independent, distinguishes added, removed, changed, and unchanged items.
 */
export function computeCoursePilotManifestDiff(
  before: CoursePilotCoarseManifestV1,
  current: CoursePilotCoarseManifestV1,
): CoursePilotManifestDiff {
  const beforeMap = new Map(before.materials.map((m) => [m.moduleId, m]));
  const currentMap = new Map(current.materials.map((m) => [m.moduleId, m]));

  const added: CoursePilotMaterialV1[] = [];
  const removed: CoursePilotMaterialV1[] = [];
  const changed: { before: CoursePilotMaterialV1; current: CoursePilotMaterialV1; reason: string }[] = [];
  const unchanged: CoursePilotMaterialV1[] = [];

  for (const [id, cur] of currentMap.entries()) {
    const bef = beforeMap.get(id);
    if (!bef) {
      added.push(cur);
      continue;
    }

    // Compare fields
    const changes: string[] = [];
    if (bef.title !== cur.title) changes.push(`title: "${bef.title}" -> "${cur.title}"`);
    if (bef.sourceIdentity !== cur.sourceIdentity) changes.push("sourceIdentity altered");
    if (bef.attachmentsComplete !== cur.attachmentsComplete) {
      changes.push(`attachmentsComplete: ${bef.attachmentsComplete} -> ${cur.attachmentsComplete}`);
    }

    if (bef.files.length !== cur.files.length) {
      changes.push(`files count: ${bef.files.length} -> ${cur.files.length}`);
    } else {
      for (let i = 0; i < bef.files.length; i++) {
        const bf = bef.files[i]!;
        const cf = cur.files[i]!;
        if (bf.fileId !== cf.fileId) changes.push(`fileId changed at [${i}]`);
        if (bf.filename !== cf.filename) changes.push(`filename changed at [${i}]`);
        if (bf.expectedSha256 !== cf.expectedSha256) changes.push(`expectedSha256 changed at [${i}]`);
      }
    }

    if (changes.length > 0) {
      changed.push({ before: bef, current: cur, reason: changes.join("; ") });
    } else {
      unchanged.push(cur);
    }
  }

  for (const [id, bef] of beforeMap.entries()) {
    if (!currentMap.has(id)) {
      removed.push(bef);
    }
  }

  // Sort all lists stably
  const sortFn = (a: CoursePilotMaterialV1, b: CoursePilotMaterialV1) => a.moduleId.localeCompare(b.moduleId);
  added.sort(sortFn);
  removed.sort(sortFn);
  unchanged.sort(sortFn);
  changed.sort((a, b) => a.before.moduleId.localeCompare(b.before.moduleId));

  const hasDiff = added.length > 0 || removed.length > 0 || changed.length > 0;

  return {
    added,
    removed,
    changed,
    unchanged,
    hasDiff,
  };
}

export interface CoursePilotPerformFileResultV1 {
  fileId: string;
  status: "downloaded" | "failed" | "viewed_only" | "skipped";
  filename?: string | undefined;
  savedPath?: string | undefined;
  filesize?: number | undefined;
  sha256?: string | undefined;
  errorMessage?: string | undefined;
}

export interface CoursePilotPerformOutputV1 {
  schemaVersion: 1;
  operation: "perform";
  status: "ok" | "partial" | "stale" | "fatal" | "error";
  courseId?: string | undefined;
  moduleId: string;
  fileId?: string | undefined;
  sourceIdentity?: string | undefined;
  files: readonly CoursePilotPerformFileResultV1[];
  errors?: readonly { scope?: string | undefined; code?: string | undefined; message: string }[] | undefined;
}

/**
 * Validates and strictly parses CoursePilot perform output JSON (TOOL-04).
 */
export function parseCoursePilotPerformJson(
  rawText: string,
  maxBytes = COURSEPILOT_MAX_MANIFEST_BYTES,
): CoursePilotPerformOutputV1 {
  const byteLength = Buffer.byteLength(rawText, "utf8");
  if (byteLength > maxBytes) {
    throw new Error(`CoursePilot perform output exceeds maximum allowed size (${byteLength} > ${maxBytes} bytes)`);
  }

  const trimmed = rawText.trim();
  if (trimmed === "") {
    throw new Error("CoursePilot perform output was empty stdout");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`CoursePilot perform malformed JSON: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("CoursePilot perform output must be a non-null JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj["schema_version"] !== 1 && obj["schemaVersion"] !== 1) {
    throw new Error(`Unsupported CoursePilot schema version: ${String(obj["schema_version"] ?? obj["schemaVersion"])}`);
  }

  if (obj["operation"] !== "perform") {
    throw new Error(`Expected operation 'perform', received: ${String(obj["operation"])}`);
  }

  const rawStatus = String(obj["status"] ?? "");
  const status: "ok" | "partial" | "stale" | "fatal" | "error" =
    rawStatus === "stale"
      ? "stale"
      : rawStatus === "fatal"
        ? "fatal"
        : rawStatus === "partial"
          ? "partial"
          : rawStatus === "error"
            ? "error"
            : "ok";

  const moduleId = String(obj["module_id"] ?? obj["moduleId"] ?? "");
  if (!moduleId) {
    throw new Error("CoursePilot perform output missing required moduleId");
  }

  const courseId = obj["course_id"] || obj["courseId"] ? String(obj["course_id"] ?? obj["courseId"]) : undefined;
  const fileId = obj["file_id"] || obj["fileId"] ? String(obj["file_id"] ?? obj["fileId"]) : undefined;
  const sourceIdentity = obj["source_identity"] || obj["sourceIdentity"]
    ? String(obj["source_identity"] ?? obj["sourceIdentity"])
    : undefined;

  const rawFiles = Array.isArray(obj["files"]) ? obj["files"] : [];
  const files: CoursePilotPerformFileResultV1[] = [];

  for (const rawF of rawFiles) {
    if (typeof rawF !== "object" || rawF === null) continue;
    const f = rawF as Record<string, unknown>;
    const fid = String(f["file_id"] ?? f["fileId"] ?? "");
    if (!fid) continue;

    const fstatusRaw = String(f["status"] ?? "downloaded");
    const fstatus: "downloaded" | "failed" | "viewed_only" | "skipped" =
      fstatusRaw === "failed"
        ? "failed"
        : fstatusRaw === "viewed_only"
          ? "viewed_only"
          : fstatusRaw === "skipped"
            ? "skipped"
            : "downloaded";

    const filename = f["filename"] ? sanitizeLmsString(String(f["filename"])) : undefined;
    const savedPath = f["saved_path"] || f["savedPath"] ? String(f["saved_path"] ?? f["savedPath"]) : undefined;
    const filesize = typeof f["filesize"] === "number" ? f["filesize"] : undefined;
    const sha256 = f["sha256"] ? String(f["sha256"]) : undefined;
    const errorMessage = f["error_message"] || f["errorMessage"]
      ? sanitizeLmsString(String(f["error_message"] ?? f["errorMessage"]))
      : undefined;

    files.push({
      fileId: fid,
      status: fstatus,
      filename,
      savedPath,
      filesize,
      sha256,
      errorMessage,
    });
  }

  // Support top-level single file format if files array was empty
  if (files.length === 0 && fileId) {
    const fstatusRaw = String(obj["file_status"] ?? obj["status"] ?? "downloaded");
    const fstatus: "downloaded" | "failed" | "viewed_only" | "skipped" =
      fstatusRaw === "failed"
        ? "failed"
        : fstatusRaw === "viewed_only"
          ? "viewed_only"
          : fstatusRaw === "skipped"
            ? "skipped"
            : "downloaded";
    files.push({
      fileId,
      status: fstatus,
      filename: obj["filename"] ? sanitizeLmsString(String(obj["filename"])) : undefined,
      savedPath: obj["saved_path"] || obj["savedPath"] ? String(obj["saved_path"] ?? obj["savedPath"]) : undefined,
      filesize: typeof obj["filesize"] === "number" ? (obj["filesize"] as number) : undefined,
      sha256: obj["sha256"] ? String(obj["sha256"]) : undefined,
      errorMessage: obj["error_message"] || obj["errorMessage"]
        ? sanitizeLmsString(String(obj["error_message"] ?? obj["errorMessage"]))
        : undefined,
    });
  }

  const rawErrors = Array.isArray(obj["errors"]) ? obj["errors"] : undefined;
  const errors = rawErrors
    ? rawErrors.map((e) => {
        if (typeof e === "object" && e !== null) {
          const er = e as Record<string, unknown>;
          return {
            scope: er["scope"] ? String(er["scope"]) : undefined,
            code: er["code"] ? String(er["code"]) : undefined,
            message: sanitizeLmsString(String(er["message"] ?? "")),
          };
        }
        return { message: sanitizeLmsString(String(e)) };
      })
    : undefined;

  return {
    schemaVersion: 1,
    operation: "perform",
    status,
    courseId,
    moduleId,
    fileId,
    sourceIdentity,
    files,
    errors,
  };
}

export interface ClassifyCoursePilotPerformOptions {
  result: ProcessResult;
  projectRoot: string;
  item: ConnectorItemV1;
  requestedFileId?: string | undefined;
}

/**
 * Classifies CoursePilot CLI perform results according to protocol and safety rules (TOOL-01, TOOL-04, D-01, D-03, D-09, D-12).
 */
export async function classifyCoursePilotPerformResult(
  options: ClassifyCoursePilotPerformOptions,
): Promise<ConnectorPerformResult> {
  const { result, projectRoot, item, requestedFileId } = options;
  const numericExitCode = typeof result.exitCode === "number" ? result.exitCode : undefined;

  // 1. Process execution error (timeout, spawn failure, etc.)
  if (result.code !== "ok") {
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: numericExitCode,
      detail: `CoursePilot CLI execution failed: ${result.code}`,
      nextAction: "Inspect CoursePilot CLI execution environment and logs",
    };
  }

  // 2. Unrecognized exit code check (0, 1, 2 are the supported contract codes)
  if (result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== 2) {
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: numericExitCode,
      detail: `Unrecognized CoursePilot CLI exit code: ${String(result.exitCode)}`,
      nextAction: "Investigate unrecognized CoursePilot CLI exit code",
    };
  }

  // 3. Output cap check
  const stdoutText = result.stdout.excerpt;
  const stdoutBytes = Buffer.byteLength(stdoutText, "utf8");
  if (stdoutBytes > COURSEPILOT_MAX_MANIFEST_BYTES) {
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: numericExitCode,
      detail: `CoursePilot perform output exceeded maximum allowed size (${stdoutBytes} > ${COURSEPILOT_MAX_MANIFEST_BYTES} bytes)`,
      nextAction: "Inspect CoursePilot CLI output size limits (output cap exceeded)",
    };
  }

  // 3. Empty stdout check
  if (stdoutText.trim() === "") {
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: numericExitCode,
      detail: "CoursePilot perform produced empty stdout",
      nextAction: "Inspect CoursePilot CLI empty output error",
    };
  }

  // 4. JSON parsing & validation
  let parsed: CoursePilotPerformOutputV1;
  try {
    parsed = parseCoursePilotPerformJson(stdoutText);
  } catch (err) {
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: numericExitCode,
      detail: (err as Error).message,
      nextAction: "Inspect CoursePilot CLI JSON contract compatibility",
    };
  }

  // 5. Identity validation
  if (parsed.moduleId !== item.itemId) {
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: numericExitCode,
      detail: `Identity mismatch: requested moduleId '${item.itemId}' != returned moduleId '${parsed.moduleId}'`,
      nextAction: "Resolve CoursePilot CLI module identity corruption",
    };
  }

  if (requestedFileId && parsed.fileId && parsed.fileId !== requestedFileId) {
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: numericExitCode,
      detail: `Identity mismatch: requested fileId '${requestedFileId}' != returned fileId '${parsed.fileId}'`,
      nextAction: "Resolve CoursePilot CLI file identity corruption",
    };
  }

  // 6. Exit code handling
  // Exit 2:
  if (result.exitCode === 2) {
    if (parsed.status === "stale") {
      // Structurally valid exit 2 status stale: selection-local stale!
      return {
        itemId: item.itemId,
        fileId: requestedFileId,
        status: "stale",
        fatal: false,
        exitCode: 2,
        staleItemIds: [item.itemId],
        detail: "CoursePilot source materials have changed (stale manifest digest)",
        nextAction: "Request user reapproval for modified materials manifest",
      };
    }
    // Valid fatal or any other status with exit 2 is global fatal
    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: "fatal",
      fatal: true,
      exitCode: 2,
      detail: parsed.errors && parsed.errors.length > 0
        ? parsed.errors.map((e) => e.message).join("; ")
        : "CoursePilot reported fatal error (exit 2)",
      nextAction: "Resolve CoursePilot fatal error",
    };
  }

  // Exit 0 or Exit 1:
  if (result.exitCode === 0 || result.exitCode === 1) {
    const receipts: ConnectorFileReceiptV1[] = [];
    const unverifiedFiles: { fileId: string; reason: string; status: "failed" | "viewed_only" | "missing-file" }[] = [];

    // Filter target files
    const targetFiles = requestedFileId
      ? item.requiredFiles.filter((f) => f.fileId === requestedFileId)
      : item.requiredFiles;

    for (const reqFile of targetFiles) {
      const match = parsed.files.find((f) => f.fileId === reqFile.fileId);
      if (!match) {
        unverifiedFiles.push({
          fileId: reqFile.fileId,
          reason: "File not mentioned in CoursePilot perform output",
          status: "failed",
        });
        continue;
      }

      if (match.status === "viewed_only") {
        unverifiedFiles.push({
          fileId: reqFile.fileId,
          reason: "LMS material viewed only; no physical file saved (Viewed only without physical download)",
          status: "viewed_only",
        });
        continue;
      }

      if (match.status === "failed") {
        unverifiedFiles.push({
          fileId: reqFile.fileId,
          reason: match.errorMessage ?? "File download failed in CoursePilot",
          status: "failed",
        });
        continue;
      }

      if (match.status === "downloaded") {
        // D-12: Must verify actual physical file on disk!
        const savedPath = match.savedPath ?? reqFile.destination;
        const verification = await verifyConnectorFileReceipt({
          projectRoot,
          approvedDestination: reqFile.destination,
          actualSavedPath: savedPath,
          sourceIdentity: item.sourceIdentity,
          expectedSourceIdentity: item.sourceIdentity,
          itemId: item.itemId,
          fileId: reqFile.fileId,
          expectedSha256: reqFile.expectedSha256,
          expectedBytes: reqFile.expectedBytes,
          claimedOrigin: "newly-downloaded",
        });

        if (verification.status === "verified") {
          receipts.push(verification.receipt);
        } else {
          // File missing or corrupt on disk -> only this file fails!
          unverifiedFiles.push({
            fileId: reqFile.fileId,
            reason: verification.reason,
            status: verification.code === "missing-file" ? "missing-file" : "failed",
          });
        }
      }
    }

    let finalStatus: ConnectorPerformStatus;
    if (receipts.length === targetFiles.length && receipts.length > 0) {
      finalStatus = "completed";
    } else if (receipts.length > 0) {
      finalStatus = "partial";
    } else {
      finalStatus = "failed";
    }

    return {
      itemId: item.itemId,
      fileId: requestedFileId,
      status: finalStatus,
      fatal: false,
      exitCode: numericExitCode,
      receipts,
      unverifiedFiles,
      detail: unverifiedFiles.length > 0 ? unverifiedFiles.map((u) => `${u.fileId}: ${u.reason}`).join("; ") : undefined,
    };
  }

  // Unrecognized exit code:
  return {
    itemId: item.itemId,
    fileId: requestedFileId,
    status: "fatal",
    fatal: true,
    exitCode: numericExitCode,
    detail: `Unrecognized CoursePilot CLI exit code: ${String(result.exitCode)}`,
    nextAction: "Investigate unrecognized CoursePilot CLI exit code",
  };
}

export interface CoursePilotAdapterOptions {
  runtime?: CoursePilotRuntimeResolution | undefined;
  runner?: CoursePilotProcessRunner | undefined;
  fixtureManifestJson?: string | undefined;
  projectRoot?: string | undefined;
}

/**
 * CoursePilot Task Adapter implementing the ConnectorPort contract.
 */
export class CoursePilotTaskAdapter implements ConnectorPort {
  readonly connectorId = COURSEPILOT_CONNECTOR_ID;
  readonly protocolVersion = COURSEPILOT_PROTOCOL_VERSION;
  private readonly options: CoursePilotAdapterOptions;

  constructor(options: CoursePilotAdapterOptions = {}) {
    this.options = options;
  }

  async preview(options: { projectRoot: string }): Promise<ConnectorPreviewResult> {
    const runtime = this.options.runtime ?? (await resolveCoursePilotRuntime({ runner: this.options.runner }));

    let manifestJson: string;
    if (this.options.fixtureManifestJson) {
      manifestJson = this.options.fixtureManifestJson;
    } else {
      if (!runtime.supported || !runtime.repoRoot || !runtime.uvExecutable) {
        throw new Error(`CoursePilot runtime prerequisite unmet: ${COURSEPILOT_UNMET_GATE_ACTION}`);
      }

      const runner = this.options.runner ?? runProcess;
      const result = await runner({
        executable: runtime.uvExecutable,
        args: [
          "--directory",
          runtime.repoRoot,
          "run",
          "python",
          "-m",
          "coursepilot",
          "materials",
          "--contract-version",
          "1",
          "--manifest",
          "--week",
          "all",
          "--json",
        ],
        cwd: options.projectRoot,
        environment: { optional: ["PATH", "SYSTEMROOT", "HOME", "USERPROFILE"], source: process.env },
        timeoutMs: 30000,
      });

      if (result.code !== "ok" || result.exitCode !== 0) {
        throw new Error(
          `CoursePilot materials manifest failed with code ${result.code}, exitCode: ${String(result.exitCode)}`,
        );
      }
      manifestJson = result.stdout.excerpt;
    }

    const coarse = parseCoursePilotManifestJson(manifestJson);
    const adapterContractDigest = runtime.contractFingerprint ?? createHash("sha256").update("unversioned").digest("hex");
    const manifest = coursePilotToConnectorManifest(coarse, {
      adapterContractDigest,
      targetDir: options.projectRoot,
    });
    const manifestDigest = connectorManifestDigest(manifest);

    return { manifest, manifestDigest };
  }

  async perform(request: ConnectorPerformRequest, signal?: AbortSignal): Promise<ConnectorPerformResult> {
    const currentDigest = connectorManifestDigest(request.manifest);
    if (request.expectedDigest !== currentDigest) {
      throw new Error(
        `CoursePilot perform rejected: expected manifest digest ${request.expectedDigest} != current digest ${currentDigest}`,
      );
    }

    const item = request.manifest.items.find((i) => i.itemId === request.itemId);
    if (!item) {
      throw new Error(`CoursePilot perform rejected: unapproved item '${request.itemId}'`);
    }

    if (request.fileId && !item.requiredFiles.some((f) => f.fileId === request.fileId)) {
      throw new Error(`CoursePilot perform rejected: unapproved fileId '${request.fileId}' in item '${request.itemId}'`);
    }

    const runtime = this.options.runtime ?? (await resolveCoursePilotRuntime({ runner: this.options.runner }));
    if (!runtime.supported || !runtime.repoRoot || !runtime.uvExecutable) {
      throw new Error(`CoursePilot runtime prerequisite unmet: ${COURSEPILOT_UNMET_GATE_ACTION}`);
    }

    if (signal?.aborted) {
      return { itemId: request.itemId, fileId: request.fileId, status: "failed", detail: "Aborted before invocation" };
    }

    const projectRoot = this.options.projectRoot ?? (item.intendedDestination ? resolve(item.intendedDestination) : tmpdir());
    const runner = this.options.runner ?? runProcess;

    const courseId = item.sourceIdentity.split(":")[0] ?? "default";
    const args = [
      "--directory",
      runtime.repoRoot,
      "run",
      "python",
      "-m",
      "coursepilot",
      "materials",
      "--contract-version",
      "1",
      "--perform",
      "--course",
      courseId,
      "--module-id",
      request.itemId,
      ...(request.fileId ? ["--file-id", request.fileId] : []),
      "--expect-digest",
      request.expectedDigest,
      "--json",
    ];

    const result = await runner({
      executable: runtime.uvExecutable,
      args,
      cwd: projectRoot,
      environment: { optional: ["PATH", "SYSTEMROOT", "HOME", "USERPROFILE"], source: process.env },
      timeoutMs: 60000,
    });

    return await classifyCoursePilotPerformResult({
      result,
      projectRoot,
      item,
      requestedFileId: request.fileId,
    });
  }

  async reconcile(request: ConnectorReconcileRequest): Promise<ConnectorReconcileResult> {
    const item = request.manifest.items.find((i) => i.itemId === request.itemId);
    if (!item) {
      return { itemId: request.itemId, status: "absent", detail: "item not found in manifest" };
    }

    // Default file existence check
    return { itemId: request.itemId, status: "applied" };
  }

  async verify(request: ConnectorVerifyRequest): Promise<ConnectorVerifyResult> {
    const item = request.manifest.items.find((i) => i.itemId === request.itemId);
    if (!item) {
      return { itemId: request.itemId, verified: false, receipts: [], evidence: "item not in manifest" };
    }

    const projectRoot = this.options.projectRoot ?? tmpdir();
    const verifiedReceipts: ConnectorFileReceiptV1[] = [];

    for (const reqFile of item.requiredFiles) {
      const res = await verifyConnectorFileReceipt({
        projectRoot,
        approvedDestination: reqFile.destination,
        actualSavedPath: reqFile.destination,
        sourceIdentity: item.sourceIdentity,
        expectedSourceIdentity: item.sourceIdentity,
        itemId: item.itemId,
        fileId: reqFile.fileId,
        expectedSha256: reqFile.expectedSha256,
        expectedBytes: reqFile.expectedBytes,
        claimedOrigin: "previously-confirmed",
      }).catch(() => null);

      if (res && res.status === "verified") {
        verifiedReceipts.push(res.receipt);
      }
    }

    const verified = verifiedReceipts.length === item.requiredFiles.length && item.requiredFiles.length > 0;
    return {
      itemId: request.itemId,
      verified,
      receipts: verifiedReceipts,
      evidence: `Verified ${verifiedReceipts.length}/${item.requiredFiles.length} file(s) for item ${item.itemId}`,
    };
  }
}
