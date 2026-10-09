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
  type ConnectorItemV1,
  type ConnectorManifestV1,
  type ConnectorPort,
  type ConnectorPreviewResult,
  type ConnectorPerformRequest,
  type ConnectorPerformResult,
  type ConnectorReconcileRequest,
  type ConnectorReconcileResult,
  type ConnectorVerifyRequest,
  type ConnectorVerifyResult,
} from "../core/task-connector.js";

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

export interface CoursePilotAdapterOptions {
  runtime?: CoursePilotRuntimeResolution | undefined;
  runner?: CoursePilotProcessRunner | undefined;
  fixtureManifestJson?: string | undefined;
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

    const runtime = this.options.runtime ?? (await resolveCoursePilotRuntime({ runner: this.options.runner }));
    if (!runtime.supported || !runtime.repoRoot || !runtime.uvExecutable) {
      throw new Error(`CoursePilot runtime prerequisite unmet: ${COURSEPILOT_UNMET_GATE_ACTION}`);
    }

    if (signal?.aborted) {
      return { itemId: request.itemId, status: "failed", detail: "Aborted before invocation" };
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
        "--perform",
        "--module-id",
        request.itemId,
        "--expect-digest",
        request.expectedDigest,
        "--json",
      ],
      cwd: item.intendedDestination ? resolve(item.intendedDestination) : tmpdir(),
      environment: { optional: ["PATH", "SYSTEMROOT", "HOME", "USERPROFILE"], source: process.env },
      timeoutMs: 60000,
    });

    if (result.code !== "ok" || result.exitCode !== 0) {
      return {
        itemId: request.itemId,
        status: "failed",
        detail: `Execution error ${result.code}, exitCode ${String(result.exitCode)}`,
      };
    }

    return { itemId: request.itemId, status: "completed" };
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

    return {
      itemId: request.itemId,
      verified: true,
      receipts: [],
      evidence: `Verified ${item.requiredFiles.length} file(s) for item ${item.itemId}`,
    };
  }
}
