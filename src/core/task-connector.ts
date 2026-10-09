import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewedDigest } from "./component-session.js";
import { canonicalJsonValue, type TaskEffect } from "./task-contract.js";
import { validateAgainstSchema } from "./validation.js";

export const CONNECTOR_MANIFEST_DIGEST_KIND = "connector-manifest";
export const CONNECTOR_ARTIFACT_DIGEST_KIND = "connector-artifact";

export interface ConnectorRequiredFileV1 {
  fileId: string;
  filename: string;
  destination: string;
  expectedBytes?: number | undefined;
  expectedSha256?: string | undefined;
}

export interface ConnectorItemV1 {
  itemId: string;
  sourceIdentity: string;
  title?: string | undefined;
  intendedDestination: string;
  effectKinds: readonly TaskEffect[];
  requiredFiles: readonly ConnectorRequiredFileV1[];
}

export interface ConnectorManifestV1 {
  schemaVersion?: 1 | undefined;
  protocolVersion: 1;
  connectorId: string;
  adapterContractDigest: string;
  observedAt: string;
  canonicalApprovalDigest?: string | undefined;
  items: readonly ConnectorItemV1[];
}

export interface ConnectorFileReceiptV1 {
  receiptId: string;
  itemId: string;
  sourceIdentity: string;
  fileId: string;
  canonicalPath: string;
  bytes: number;
  sha256: string;
  verifiedAt: string;
  origin: "newly-downloaded" | "previously-confirmed";
}

export interface ConnectorItemReceiptV1 {
  itemId: string;
  sourceIdentity: string;
  status: "verified" | "partial" | "failed" | "unverified";
  receipts: readonly ConnectorFileReceiptV1[];
  detail?: string | undefined;
}

export interface ConnectorPreviewResult {
  manifest: ConnectorManifestV1;
  manifestDigest: string;
}

export interface ConnectorPerformRequest {
  manifest: ConnectorManifestV1;
  itemId: string;
  expectedDigest: string;
  fileId?: string | undefined;
}

export type ConnectorPerformStatus = "completed" | "partial" | "failed" | "stale" | "fatal";

export interface ConnectorPerformResult {
  itemId: string;
  fileId?: string | undefined;
  status: ConnectorPerformStatus;
  detail?: string | undefined;
  exitCode?: number | undefined;
  receipts?: readonly ConnectorFileReceiptV1[] | undefined;
  staleItemIds?: readonly string[] | undefined;
  fatal?: boolean | undefined;
  nextAction?: string | null | undefined;
  unverifiedFiles?: readonly {
    fileId: string;
    reason: string;
    status: "failed" | "viewed_only" | "missing-file";
  }[] | undefined;
}

export interface ConnectorReconcileRequest {
  manifest: ConnectorManifestV1;
  itemId: string;
}

export interface ConnectorReconcileResult {
  itemId: string;
  status: "applied" | "absent" | "unknown";
  detail?: string | undefined;
}

export interface ConnectorVerifyRequest {
  manifest: ConnectorManifestV1;
  itemId: string;
}

export interface ConnectorVerifyResult {
  itemId: string;
  verified: boolean;
  receipts: readonly ConnectorFileReceiptV1[];
  evidence: string;
}

export interface GeneralTaskNextActionItem {
  itemId: string;
  title: string;
  reason: "viewed_only" | "download_error" | "verification_failed" | "stale_or_changed" | "missing_file" | "unknown";
  actionType: "auto_retry" | "manual_check" | "reapproval_required" | "blocked";
  description: string;
}

export interface GeneralTaskFileDetail {
  fileId: string;
  filename: string;
  status: "verified" | "failed" | "viewed_only" | "missing-file";
  bytes?: number | undefined;
  sha256?: string | undefined;
  error?: string | undefined;
}

export interface GeneralTaskItemDetail {
  itemId: string;
  courseId: string;
  weekNumber: number;
  title: string;
  status: "verified" | "partial" | "failed" | "viewed_only" | "pending_approval";
  verifiedFilesCount: number;
  totalRequiredFilesCount: number;
  files: readonly GeneralTaskFileDetail[];
}

export interface GeneralTaskSummary {
  physicalFiles: {
    totalDistinctSaved: number;
    newlyDownloaded: number;
    previouslyConfirmed: number;
  };
  materials: {
    approvedTotal: number;
    verifiedComplete: number;
    partialComplete: number;
    failedOrUnsaved: number;
    viewedOnly: number;
    pendingUnapproved: number;
  };
}

export interface GeneralTaskReportData {
  kind: "general-task-report";
  contractId: string;
  runId: string;
  overallStatus: "completed" | "partial" | "blocked" | "failed";
  summary: GeneralTaskSummary;
  details: readonly GeneralTaskItemDetail[];
  nextActions: readonly GeneralTaskNextActionItem[];
}

export interface ConnectorPort {
  preview(options: { projectRoot: string }): Promise<ConnectorPreviewResult>;
  perform(request: ConnectorPerformRequest, signal?: AbortSignal): Promise<ConnectorPerformResult>;
  reconcile(request: ConnectorReconcileRequest): Promise<ConnectorReconcileResult>;
  verify(request: ConnectorVerifyRequest): Promise<ConnectorVerifyResult>;
}

export interface ConnectorV1 extends ConnectorPort {
  readonly connectorId: string;
  readonly protocolVersion: 1;
}

import { packageRoot } from "./paths.js";

let cachedSchema: Record<string, unknown> | null = null;

async function getConnectorSchema(): Promise<Record<string, unknown>> {
  if (cachedSchema !== null) return cachedSchema;
  const schemaPath = join(packageRoot(), "schemas", "task-connector.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  cachedSchema = JSON.parse(raw) as Record<string, unknown>;
  return cachedSchema;
}

export const CONNECTOR_MANIFEST_MAX_BYTES = 256 * 1024;

export async function validateConnectorManifest(input: unknown): Promise<{
  ok: boolean;
  issues: string[];
  manifest?: ConnectorManifestV1 | undefined;
}> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, issues: ["manifest must be an object"] };
  }
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, "utf8") > CONNECTOR_MANIFEST_MAX_BYTES) {
    return { ok: false, issues: [`manifest exceeds maximum byte limit of ${CONNECTOR_MANIFEST_MAX_BYTES} bytes`] };
  }

  const raw = input as Record<string, unknown>;
  if (raw["protocolVersion"] !== 1) {
    return { ok: false, issues: [`unsupported protocolVersion: expected 1, got ${String(raw["protocolVersion"])}`] };
  }
  if (raw["schemaVersion"] !== undefined && raw["schemaVersion"] !== 1) {
    return { ok: false, issues: [`unsupported schemaVersion: expected 1, got ${String(raw["schemaVersion"])}`] };
  }

  const schema = await getConnectorSchema();
  const schemaIssues = validateAgainstSchema(raw, schema);
  if (schemaIssues.length > 0) {
    return {
      ok: false,
      issues: schemaIssues.map((issue) => `${issue.documentPath}: ${issue.expected}`),
    };
  }

  const manifest = raw as unknown as ConnectorManifestV1;
  const itemIds = new Set<string>();
  const issues: string[] = [];

  for (const [itemIndex, item] of manifest.items.entries()) {
    if (itemIds.has(item.itemId)) {
      issues.push(`/items/${itemIndex}: duplicate itemId '${item.itemId}'`);
    }
    itemIds.add(item.itemId);

    if (item.intendedDestination.includes("..") || /^[a-zA-Z]:/.test(item.intendedDestination)) {
      issues.push(`/items/${itemIndex}/intendedDestination: destination must be project-relative without '..'`);
    }

    const fileIds = new Set<string>();
    for (const [fileIndex, file] of item.requiredFiles.entries()) {
      if (fileIds.has(file.fileId)) {
        issues.push(`/items/${itemIndex}/requiredFiles/${fileIndex}: duplicate fileId '${file.fileId}'`);
      }
      fileIds.add(file.fileId);

      if (file.destination.includes("..") || /^[a-zA-Z]:/.test(file.destination)) {
        issues.push(`/items/${itemIndex}/requiredFiles/${fileIndex}/destination: destination must be project-relative without '..'`);
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, issues: [], manifest };
}

export function canonicalizeConnectorManifest(manifest: ConnectorManifestV1): Record<string, unknown> {
  const sortedItems = [...manifest.items]
    .sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
    .map((item) => {
      const sortedFiles = [...item.requiredFiles]
        .sort((a, b) => (a.fileId < b.fileId ? -1 : a.fileId > b.fileId ? 1 : 0))
        .map((f) => ({
          destination: f.destination.replace(/\\/g, "/"),
          expectedBytes: f.expectedBytes ?? null,
          expectedSha256: f.expectedSha256 ?? null,
          fileId: f.fileId,
          filename: f.filename,
        }));
      const sortedEffects = [...item.effectKinds].sort();
      return {
        effectKinds: sortedEffects,
        intendedDestination: item.intendedDestination.replace(/\\/g, "/"),
        itemId: item.itemId,
        requiredFiles: sortedFiles,
        sourceIdentity: item.sourceIdentity,
        title: item.title ?? null,
      };
    });

  return {
    adapterContractDigest: manifest.adapterContractDigest,
    connectorId: manifest.connectorId,
    items: sortedItems,
    observedAt: manifest.observedAt,
    protocolVersion: manifest.protocolVersion,
    schemaVersion: manifest.schemaVersion ?? 1,
  };
}

export function connectorManifestDigest(manifest: ConnectorManifestV1): string {
  const canonical = canonicalJsonValue(canonicalizeConnectorManifest(manifest));
  return reviewedDigest(CONNECTOR_MANIFEST_DIGEST_KIND, canonical);
}

export function connectorArtifactDigest(options: {
  manifestDigest: string;
  receipts: readonly ConnectorFileReceiptV1[];
}): string {
  const sortedReceipts = [...options.receipts]
    .sort((a, b) => {
      if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1;
      if (a.fileId !== b.fileId) return a.fileId < b.fileId ? -1 : 1;
      return a.canonicalPath < b.canonicalPath ? -1 : 1;
    })
    .map((r) => ({
      bytes: r.bytes,
      canonicalPath: r.canonicalPath.replace(/\\/g, "/"),
      fileId: r.fileId,
      itemId: r.itemId,
      origin: r.origin,
      receiptId: r.receiptId,
      sha256: r.sha256,
      sourceIdentity: r.sourceIdentity,
      verifiedAt: r.verifiedAt,
    }));

  const canonical = canonicalJsonValue({
    manifestDigest: options.manifestDigest,
    receipts: sortedReceipts,
  });
  return reviewedDigest(CONNECTOR_ARTIFACT_DIGEST_KIND, canonical);
}

export function createGenericFixtureConnector(options: {
  projectRoot?: string | undefined;
  items?: readonly ConnectorItemV1[] | undefined;
  fixturePayload?: string | undefined;
} = {}): ConnectorV1 {
  const connectorId = "generic-fixture";
  const protocolVersion = 1;

  const defaultItems: ConnectorItemV1[] = [
    {
      itemId: "item-alpha",
      sourceIdentity: "fixture-source-01",
      title: "Alpha fixture item",
      intendedDestination: "alpha-output.txt",
      effectKinds: ["workspace-write", "external-download"],
      requiredFiles: [
        {
          fileId: "file-01",
          filename: "alpha-output.txt",
          destination: "alpha-output.txt",
          expectedBytes: 13,
        },
      ],
    },
  ];

  const items = options.items ?? defaultItems;

  return {
    connectorId,
    protocolVersion,

    async preview(previewOptions: { projectRoot: string }): Promise<ConnectorPreviewResult> {
      const observedAt = "2026-10-09T00:00:00.000Z";
      const adapterContractDigest = createHash("sha256").update("generic-adapter-v1").digest("hex");
      const manifest: ConnectorManifestV1 = {
        protocolVersion: 1,
        schemaVersion: 1,
        connectorId,
        adapterContractDigest,
        observedAt,
        items,
      };
      const manifestDigest = connectorManifestDigest(manifest);
      return { manifest, manifestDigest };
    },

    async perform(request: ConnectorPerformRequest): Promise<ConnectorPerformResult> {
      const currentDigest = connectorManifestDigest(request.manifest);
      if (request.expectedDigest !== currentDigest) {
        throw new Error(
          `Connector perform rejected: expected manifest digest ${request.expectedDigest} != current manifest digest ${currentDigest}`,
        );
      }

      const item = request.manifest.items.find((i) => i.itemId === request.itemId);
      if (!item) {
        throw new Error(`Connector perform rejected: unapproved item '${request.itemId}'`);
      }

      const root = options.projectRoot ?? process.cwd();
      const payload = options.fixturePayload ?? "hello-fixture";

      for (const reqFile of item.requiredFiles) {
        const targetPath = isAbsolute(reqFile.destination)
          ? reqFile.destination
          : resolve(root, reqFile.destination);
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, payload, "utf8");
      }

      return { itemId: request.itemId, status: "completed" };
    },

    async reconcile(request: ConnectorReconcileRequest): Promise<ConnectorReconcileResult> {
      const item = request.manifest.items.find((i) => i.itemId === request.itemId);
      if (!item) {
        return { itemId: request.itemId, status: "absent", detail: "item not found in manifest" };
      }

      const root = options.projectRoot ?? process.cwd();
      let allExist = true;

      for (const reqFile of item.requiredFiles) {
        const targetPath = isAbsolute(reqFile.destination)
          ? reqFile.destination
          : resolve(root, reqFile.destination);
        try {
          const st = await stat(targetPath);
          if (!st.isFile()) allExist = false;
        } catch {
          allExist = false;
        }
      }

      return {
        itemId: request.itemId,
        status: allExist ? "applied" : "absent",
      };
    },

    async verify(request: ConnectorVerifyRequest): Promise<ConnectorVerifyResult> {
      const item = request.manifest.items.find((i) => i.itemId === request.itemId);
      if (!item) {
        return { itemId: request.itemId, verified: false, receipts: [], evidence: "item not in manifest" };
      }

      const root = options.projectRoot ?? process.cwd();
      const receipts: ConnectorFileReceiptV1[] = [];
      let allVerified = true;

      for (const reqFile of item.requiredFiles) {
        const targetPath = isAbsolute(reqFile.destination)
          ? reqFile.destination
          : resolve(root, reqFile.destination);
        try {
          const st = await stat(targetPath);
          if (!st.isFile()) {
            allVerified = false;
            continue;
          }
          const content = await readFile(targetPath);
          const sha256 = createHash("sha256").update(content).digest("hex");
          receipts.push({
            receiptId: `receipt-${item.itemId}-${reqFile.fileId}`,
            itemId: item.itemId,
            sourceIdentity: item.sourceIdentity,
            fileId: reqFile.fileId,
            canonicalPath: targetPath,
            bytes: st.size,
            sha256,
            verifiedAt: new Date().toISOString(),
            origin: "newly-downloaded",
          });
        } catch {
          allVerified = false;
        }
      }

      return {
        itemId: request.itemId,
        verified: allVerified && receipts.length === item.requiredFiles.length,
        receipts,
        evidence: `Verified ${receipts.length}/${item.requiredFiles.length} file(s) for item ${item.itemId}`,
      };
    },
  };
}
