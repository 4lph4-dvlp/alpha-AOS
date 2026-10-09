import { createHash } from "node:crypto";
import { lstat, readFile, stat } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";
import type {
  ConnectorFileReceiptV1,
  ConnectorItemReceiptV1,
  ConnectorItemV1,
} from "./task-connector.js";

export interface VerifyFileReceiptOptions {
  projectRoot: string;
  allowedRoots?: readonly string[] | undefined;
  approvedDestination: string;
  actualSavedPath?: string | null | undefined;
  sourceIdentity: string;
  expectedSourceIdentity: string;
  itemId: string;
  fileId: string;
  expectedSha256?: string | undefined;
  expectedBytes?: number | undefined;
  claimedOrigin?: "newly-downloaded" | "previously-confirmed" | undefined;
  priorReceipt?: ConnectorFileReceiptV1 | undefined;
}

export type FileVerificationFailureCode =
  | "missing-file"
  | "path-traversal"
  | "symlink-rejected"
  | "not-regular-file"
  | "source-mismatch"
  | "hash-mismatch"
  | "size-mismatch"
  | "read-error";

export type FileVerificationResult =
  | {
      status: "verified";
      receipt: ConnectorFileReceiptV1;
    }
  | {
      status: "failed";
      reason: string;
      code: FileVerificationFailureCode;
    };

/**
 * Normalizes a path to POSIX forward-slash format.
 */
function normalizePosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Checks whether targetPath is contained within projectRoot / allowedRoots.
 */
function isContainedPath(
  resolvedTarget: string,
  projectRoot: string,
  allowedRoots?: readonly string[] | undefined,
): boolean {
  const normTarget = normalizePosix(resolve(resolvedTarget));
  const normProject = normalizePosix(resolve(projectRoot));

  if (!normTarget.startsWith(normProject)) {
    return false;
  }

  if (allowedRoots && allowedRoots.length > 0) {
    const isAllowed = allowedRoots.some((allowed) => {
      const normAllowed = normalizePosix(resolve(projectRoot, allowed));
      return normTarget.startsWith(normAllowed);
    });
    if (!isAllowed) return false;
  }

  return true;
}

/**
 * Verifies a single downloaded or preexisting file against source identity,
 * filesystem boundaries, regular-file constraints, and byte/hash checks (TOOL-01, D-05, D-08, D-12).
 */
export async function verifyConnectorFileReceipt(
  options: VerifyFileReceiptOptions,
): Promise<FileVerificationResult> {
  // 1. Source identity check
  if (options.sourceIdentity !== options.expectedSourceIdentity) {
    return {
      status: "failed",
      code: "source-mismatch",
      reason: `Source identity mismatch: expected '${options.expectedSourceIdentity}', got '${options.sourceIdentity}'`,
    };
  }

  // 2. Destination path resolution & containment
  const targetRelOrAbs = options.actualSavedPath ?? options.approvedDestination;
  if (!targetRelOrAbs) {
    return {
      status: "failed",
      code: "missing-file",
      reason: "No destination or saved path specified",
    };
  }

  const resolvedTarget = isAbsolute(targetRelOrAbs)
    ? resolve(targetRelOrAbs)
    : resolve(options.projectRoot, targetRelOrAbs);

  if (!isContainedPath(resolvedTarget, options.projectRoot, options.allowedRoots)) {
    return {
      status: "failed",
      code: "path-traversal",
      reason: `Target path '${normalizePosix(resolvedTarget)}' escapes allowed roots`,
    };
  }

  // 3. Regular file and symlink checks
  try {
    const lst = await lstat(resolvedTarget);
    if (lst.isSymbolicLink()) {
      return {
        status: "failed",
        code: "symlink-rejected",
        reason: `Target path '${normalizePosix(resolvedTarget)}' is a symbolic link (symlinks are forbidden)`,
      };
    }
    if (!lst.isFile()) {
      return {
        status: "failed",
        code: "not-regular-file",
        reason: `Target path '${normalizePosix(resolvedTarget)}' is not a regular file`,
      };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        status: "failed",
        code: "missing-file",
        reason: `File does not exist on disk: '${normalizePosix(resolvedTarget)}'`,
      };
    }
    return {
      status: "failed",
      code: "read-error",
      reason: `Failed to stat file '${normalizePosix(resolvedTarget)}': ${(err as Error).message}`,
    };
  }

  // 4. File content reading and checksums
  let content: Buffer;
  try {
    content = await readFile(resolvedTarget);
  } catch (err) {
    return {
      status: "failed",
      code: "read-error",
      reason: `Failed to read file '${normalizePosix(resolvedTarget)}': ${(err as Error).message}`,
    };
  }

  const fileBytes = content.length;
  const sha256 = createHash("sha256").update(content).digest("hex");

  if (options.expectedBytes !== undefined && options.expectedBytes !== null) {
    if (fileBytes !== options.expectedBytes) {
      return {
        status: "failed",
        code: "size-mismatch",
        reason: `Size mismatch for '${normalizePosix(resolvedTarget)}': expected ${options.expectedBytes}, got ${fileBytes}`,
      };
    }
  }

  if (options.expectedSha256 !== undefined && options.expectedSha256 !== null) {
    if (sha256 !== options.expectedSha256) {
      return {
        status: "failed",
        code: "hash-mismatch",
        reason: `Hash mismatch for '${normalizePosix(resolvedTarget)}': expected ${options.expectedSha256}, got ${sha256}`,
      };
    }
  }

  // 5. Origin determination & prior receipt validation
  let origin: "newly-downloaded" | "previously-confirmed" = options.claimedOrigin ?? "newly-downloaded";
  if (options.claimedOrigin === "previously-confirmed") {
    if (!options.priorReceipt) {
      return {
        status: "failed",
        code: "source-mismatch",
        reason: "Claimed previously-confirmed origin but no prior receipt was supplied",
      };
    }
    if (options.priorReceipt.sha256 !== sha256) {
      return {
        status: "failed",
        code: "hash-mismatch",
        reason: `Prior receipt sha256 '${options.priorReceipt.sha256}' does not match current file sha256 '${sha256}'`,
      };
    }
    origin = "previously-confirmed";
  }

  return {
    status: "verified",
    receipt: {
      receiptId: `receipt-${options.itemId}-${options.fileId}`,
      itemId: options.itemId,
      sourceIdentity: options.sourceIdentity,
      fileId: options.fileId,
      canonicalPath: normalizePosix(resolvedTarget),
      bytes: fileBytes,
      sha256,
      verifiedAt: new Date().toISOString(),
      origin,
    },
  };
}

export interface ItemVerificationInput {
  item: ConnectorItemV1;
  attachmentsComplete: boolean;
  incompleteReason?: string | undefined;
  receipts: readonly ConnectorFileReceiptV1[];
  failures?: readonly { fileId: string; reason: string }[] | undefined;
}

export interface ConnectorFileAggregateSummary {
  physicalFiles: {
    totalDistinct: number;
    newlyDownloaded: number;
    previouslyVerified: number;
  };
  items: {
    total: number;
    verified: number;
    partial: number;
    failed: number;
    unknown: number;
  };
  itemSummaries: readonly ConnectorItemReceiptV1[];
  verifiedReceipts: readonly ConnectorFileReceiptV1[];
}

/**
 * Summarizes physical files and material items separately (D-05, D-06, D-07, D-17, TOOL-02).
 * Deduplicates physical files by canonical path while preserving distinct material-to-file links.
 */
export function summarizeConnectorFiles(
  inputs: readonly ItemVerificationInput[],
): ConnectorFileAggregateSummary {
  const itemSummaries: ConnectorItemReceiptV1[] = [];
  const allVerifiedReceipts: ConnectorFileReceiptV1[] = [];

  let itemCountTotal = 0;
  let itemCountVerified = 0;
  let itemCountPartial = 0;
  let itemCountFailed = 0;
  let itemCountUnknown = 0;

  for (const input of inputs) {
    itemCountTotal += 1;
    const { item, attachmentsComplete, incompleteReason, receipts, failures } = input;
    const verifiedFileIds = new Set(receipts.map((r) => r.fileId));
    const allRequiredVerified = item.requiredFiles.length > 0 && item.requiredFiles.every((f) => verifiedFileIds.has(f.fileId));

    let itemStatus: "verified" | "partial" | "failed" | "unverified";
    let detail: string | undefined;

    if (!attachmentsComplete) {
      // Incomplete or unknown attachment enumeration
      itemCountUnknown += 1;
      itemStatus = receipts.length > 0 ? "partial" : "unverified";
      detail = incompleteReason ?? "Attachment enumeration is incomplete or uninspected (unknown attachment set)";
    } else if (allRequiredVerified) {
      itemCountVerified += 1;
      itemStatus = "verified";
      detail = `All ${item.requiredFiles.length} file(s) verified`;
    } else if (receipts.length > 0) {
      itemCountPartial += 1;
      itemStatus = "partial";
      detail = `Partial: ${receipts.length}/${item.requiredFiles.length} file(s) verified`;
    } else {
      itemCountFailed += 1;
      itemStatus = "failed";
      detail = failures && failures.length > 0 ? failures.map((f) => f.reason).join("; ") : "No files verified";
    }

    itemSummaries.push({
      itemId: item.itemId,
      sourceIdentity: item.sourceIdentity,
      status: itemStatus,
      receipts,
      detail,
    });

    for (const r of receipts) {
      allVerifiedReceipts.push(r);
    }
  }

  // Deduplicate physical files by canonicalPath
  const distinctPhysicalMap = new Map<string, ConnectorFileReceiptV1>();
  for (const r of allVerifiedReceipts) {
    if (!distinctPhysicalMap.has(r.canonicalPath)) {
      distinctPhysicalMap.set(r.canonicalPath, r);
    }
  }

  let newlyDownloadedCount = 0;
  let previouslyVerifiedCount = 0;
  for (const file of distinctPhysicalMap.values()) {
    if (file.origin === "newly-downloaded") {
      newlyDownloadedCount += 1;
    } else {
      previouslyVerifiedCount += 1;
    }
  }

  return {
    physicalFiles: {
      totalDistinct: distinctPhysicalMap.size,
      newlyDownloaded: newlyDownloadedCount,
      previouslyVerified: previouslyVerifiedCount,
    },
    items: {
      total: itemCountTotal,
      verified: itemCountVerified,
      partial: itemCountPartial,
      failed: itemCountFailed,
      unknown: itemCountUnknown,
    },
    itemSummaries,
    verifiedReceipts: allVerifiedReceipts,
  };
}

/**
 * Re-verifies existing receipts against current filesystem state (D-08, D-12).
 * Drops disappeared or corrupted files so current counts are never inflated.
 */
export async function reverifyConnectorReceipts(
  receipts: readonly ConnectorFileReceiptV1[],
): Promise<{
  validReceipts: ConnectorFileReceiptV1[];
  invalidReceipts: { receipt: ConnectorFileReceiptV1; reason: string }[];
}> {
  const validReceipts: ConnectorFileReceiptV1[] = [];
  const invalidReceipts: { receipt: ConnectorFileReceiptV1; reason: string }[] = [];

  for (const r of receipts) {
    try {
      const st = await stat(r.canonicalPath);
      if (!st.isFile()) {
        invalidReceipts.push({ receipt: r, reason: "Path is not a regular file" });
        continue;
      }
      const content = await readFile(r.canonicalPath);
      const currentSha = createHash("sha256").update(content).digest("hex");
      if (currentSha !== r.sha256) {
        invalidReceipts.push({
          receipt: r,
          reason: `File corrupted/altered: expected sha256 '${r.sha256}', got '${currentSha}'`,
        });
        continue;
      }
      if (content.length !== r.bytes) {
        invalidReceipts.push({
          receipt: r,
          reason: `File size changed: expected ${r.bytes} bytes, got ${content.length}`,
        });
        continue;
      }
      validReceipts.push(r);
    } catch (err) {
      invalidReceipts.push({
        receipt: r,
        reason: (err as NodeJS.ErrnoException).code === "ENOENT" ? "File disappeared from disk" : (err as Error).message,
      });
    }
  }

  return { validReceipts, invalidReceipts };
}
