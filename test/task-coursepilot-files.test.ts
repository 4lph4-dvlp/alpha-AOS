import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ConnectorItemV1 } from "../src/core/task-connector.js";
import {
  reverifyConnectorReceipts,
  summarizeConnectorFiles,
  verifyConnectorFileReceipt,
  type ItemVerificationInput,
} from "../src/core/task-connector-files.js";

test("verifyConnectorFileReceipt validates downloaded regular file and captures exact bytes/hash (TOOL-01, D-05)", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-file-rec-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const content = "Lecture handout 01";
  const sha256 = createHash("sha256").update(content).digest("hex");
  const relPath = "content/lecture-01.txt";
  const absPath = join(dir, relPath);
  await mkdir(join(dir, "content"), { recursive: true });
  await writeFile(absPath, content, "utf8");

  // 1. Success case: regular file matching source identity
  const res = await verifyConnectorFileReceipt({
    projectRoot: dir,
    allowedRoots: ["content"],
    approvedDestination: relPath,
    actualSavedPath: absPath,
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
    expectedBytes: Buffer.byteLength(content),
    expectedSha256: sha256,
  });

  assert.equal(res.status, "verified");
  if (res.status === "verified") {
    assert.equal(res.receipt.fileId, "f-01");
    assert.equal(res.receipt.bytes, Buffer.byteLength(content));
    assert.equal(res.receipt.sha256, sha256);
    assert.equal(res.receipt.origin, "newly-downloaded");
  }

  // 2. Source identity mismatch
  const resMismatch = await verifyConnectorFileReceipt({
    projectRoot: dir,
    approvedDestination: relPath,
    actualSavedPath: absPath,
    sourceIdentity: "wrong-source-id",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
  });
  assert.equal(resMismatch.status, "failed");
  assert.equal(resMismatch.code, "source-mismatch");

  // 3. Missing file
  const resMissing = await verifyConnectorFileReceipt({
    projectRoot: dir,
    approvedDestination: "content/missing.txt",
    actualSavedPath: null,
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-missing",
  });
  assert.equal(resMissing.status, "failed");
  assert.equal(resMissing.code, "missing-file");

  // 4. Path traversal outside projectRoot / allowedRoots
  const resTraversal = await verifyConnectorFileReceipt({
    projectRoot: dir,
    allowedRoots: ["content"],
    approvedDestination: "../escape.txt",
    actualSavedPath: join(dir, "..", "escape.txt"),
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
  });
  assert.equal(resTraversal.status, "failed");
  assert.equal(resTraversal.code, "path-traversal");

  // 5. Size mismatch
  const resSize = await verifyConnectorFileReceipt({
    projectRoot: dir,
    approvedDestination: relPath,
    actualSavedPath: absPath,
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
    expectedBytes: 99999,
  });
  assert.equal(resSize.status, "failed");
  assert.equal(resSize.code, "size-mismatch");

  // 6. Hash mismatch
  const resHash = await verifyConnectorFileReceipt({
    projectRoot: dir,
    approvedDestination: relPath,
    actualSavedPath: absPath,
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
    expectedSha256: "0000000000000000000000000000000000000000000000000000000000000000",
  });
  assert.equal(resHash.status, "failed");
  assert.equal(resHash.code, "hash-mismatch");

  // 7. Symlink rejection
  if (process.platform !== "win32") {
    const symlinkPath = join(dir, "content", "link.txt");
    await symlink(absPath, symlinkPath);
    const resLink = await verifyConnectorFileReceipt({
      projectRoot: dir,
      approvedDestination: "content/link.txt",
      actualSavedPath: symlinkPath,
      sourceIdentity: "course-1:week-1:item-1",
      expectedSourceIdentity: "course-1:week-1:item-1",
      itemId: "item-1",
      fileId: "f-01",
    });
    assert.equal(resLink.status, "failed");
    assert.equal(resLink.code, "symlink-rejected");
  }
});

test("verifyConnectorFileReceipt accepts previously-confirmed files only with matching prior receipt (D-05, D-12)", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-prev-rec-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const content = "Existing verified file";
  const sha256 = createHash("sha256").update(content).digest("hex");
  const relPath = "downloads/existing.pdf";
  const absPath = join(dir, relPath);
  await mkdir(join(dir, "downloads"), { recursive: true });
  await writeFile(absPath, content, "utf8");

  // 1. Claimed previously-confirmed without prior receipt -> failed
  const resNoPrior = await verifyConnectorFileReceipt({
    projectRoot: dir,
    approvedDestination: relPath,
    actualSavedPath: absPath,
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
    claimedOrigin: "previously-confirmed",
  });
  assert.equal(resNoPrior.status, "failed");
  assert.equal(resNoPrior.code, "source-mismatch");

  // 2. Claimed previously-confirmed with mismatched hash in prior receipt -> failed
  const resMismatchHash = await verifyConnectorFileReceipt({
    projectRoot: dir,
    approvedDestination: relPath,
    actualSavedPath: absPath,
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
    claimedOrigin: "previously-confirmed",
    priorReceipt: {
      receiptId: "receipt-old",
      itemId: "item-1",
      sourceIdentity: "course-1:week-1:item-1",
      fileId: "f-01",
      canonicalPath: absPath.replace(/\\/g, "/"),
      bytes: content.length,
      sha256: "old-sha-12345",
      verifiedAt: new Date().toISOString(),
      origin: "previously-confirmed",
    },
  });
  assert.equal(resMismatchHash.status, "failed");
  assert.equal(resMismatchHash.code, "hash-mismatch");

  // 3. Claimed previously-confirmed with matching prior receipt -> success
  const resValidPrior = await verifyConnectorFileReceipt({
    projectRoot: dir,
    approvedDestination: relPath,
    actualSavedPath: absPath,
    sourceIdentity: "course-1:week-1:item-1",
    expectedSourceIdentity: "course-1:week-1:item-1",
    itemId: "item-1",
    fileId: "f-01",
    claimedOrigin: "previously-confirmed",
    priorReceipt: {
      receiptId: "receipt-old",
      itemId: "item-1",
      sourceIdentity: "course-1:week-1:item-1",
      fileId: "f-01",
      canonicalPath: absPath.replace(/\\/g, "/"),
      bytes: content.length,
      sha256,
      verifiedAt: new Date().toISOString(),
      origin: "previously-confirmed",
    },
  });
  assert.equal(resValidPrior.status, "verified");
  if (resValidPrior.status === "verified") {
    assert.equal(resValidPrior.receipt.origin, "previously-confirmed");
  }
});

test("summarizeConnectorFiles deduplicates shared physical files and computes distinct item statuses (D-06, D-07, D-17)", () => {
  const commonPath = "C:/data/common-handout.pdf";

  // Item 1: requires common-handout.pdf (verified)
  const item1: ConnectorItemV1 = {
    itemId: "mod-01",
    sourceIdentity: "c1:w1:m1",
    intendedDestination: "c1/w1",
    effectKinds: ["external-download"],
    requiredFiles: [
      {
        fileId: "f-common",
        filename: "common-handout.pdf",
        destination: commonPath,
      },
    ],
  };

  // Item 2: also requires common-handout.pdf (verified)
  const item2: ConnectorItemV1 = {
    itemId: "mod-02",
    sourceIdentity: "c1:w1:m2",
    intendedDestination: "c1/w1",
    effectKinds: ["external-download"],
    requiredFiles: [
      {
        fileId: "f-common",
        filename: "common-handout.pdf",
        destination: commonPath,
      },
    ],
  };

  // Item 3: requires 2 files, but only 1 is verified (partial completion)
  const item3: ConnectorItemV1 = {
    itemId: "mod-03",
    sourceIdentity: "c1:w1:m3",
    intendedDestination: "c1/w1",
    effectKinds: ["external-download"],
    requiredFiles: [
      {
        fileId: "f-part-1",
        filename: "part1.pdf",
        destination: "C:/data/part1.pdf",
      },
      {
        fileId: "f-part-2",
        filename: "part2.pdf",
        destination: "C:/data/part2.pdf",
      },
    ],
  };

  // Item 4: attachmentsComplete is false (D-17 unknown enumeration)
  const item4: ConnectorItemV1 = {
    itemId: "mod-04",
    sourceIdentity: "c1:w1:m4",
    intendedDestination: "c1/w1",
    effectKinds: ["external-download"],
    requiredFiles: [
      {
        fileId: "f-single",
        filename: "single.pdf",
        destination: "C:/data/single.pdf",
      },
    ],
  };

  const receiptCommon1 = {
    receiptId: "r-1",
    itemId: "mod-01",
    sourceIdentity: "c1:w1:m1",
    fileId: "f-common",
    canonicalPath: commonPath,
    bytes: 1000,
    sha256: "hash-common",
    verifiedAt: new Date().toISOString(),
    origin: "newly-downloaded" as const,
  };

  const receiptCommon2 = {
    receiptId: "r-2",
    itemId: "mod-02",
    sourceIdentity: "c1:w1:m2",
    fileId: "f-common",
    canonicalPath: commonPath,
    bytes: 1000,
    sha256: "hash-common",
    verifiedAt: new Date().toISOString(),
    origin: "previously-confirmed" as const,
  };

  const receiptPart1 = {
    receiptId: "r-3",
    itemId: "mod-03",
    sourceIdentity: "c1:w1:m3",
    fileId: "f-part-1",
    canonicalPath: "C:/data/part1.pdf",
    bytes: 500,
    sha256: "hash-part1",
    verifiedAt: new Date().toISOString(),
    origin: "newly-downloaded" as const,
  };

  const receiptSingle = {
    receiptId: "r-4",
    itemId: "mod-04",
    sourceIdentity: "c1:w1:m4",
    fileId: "f-single",
    canonicalPath: "C:/data/single.pdf",
    bytes: 750,
    sha256: "hash-single",
    verifiedAt: new Date().toISOString(),
    origin: "newly-downloaded" as const,
  };

  const inputs: ItemVerificationInput[] = [
    {
      item: item1,
      attachmentsComplete: true,
      receipts: [receiptCommon1],
    },
    {
      item: item2,
      attachmentsComplete: true,
      receipts: [receiptCommon2],
    },
    {
      item: item3,
      attachmentsComplete: true,
      receipts: [receiptPart1], // only 1 of 2 verified
      failures: [{ fileId: "f-part-2", reason: "missing file" }],
    },
    {
      item: item4,
      attachmentsComplete: false, // D-17 unknown enumeration!
      incompleteReason: "Uninspected attachment set",
      receipts: [receiptSingle],
    },
  ];

  const summary = summarizeConnectorFiles(inputs);

  // Physical files check:
  // commonPath is deduplicated across mod-01 and mod-02!
  // Total distinct physical files: commonPath + part1.pdf + single.pdf = 3
  assert.equal(summary.physicalFiles.totalDistinct, 3);
  assert.equal(summary.physicalFiles.newlyDownloaded + summary.physicalFiles.previouslyVerified, 3);

  // Items check:
  // mod-01: verified
  // mod-02: verified
  // mod-03: partial
  // mod-04: unknown (attachmentsComplete is false, so it must not be promoted to verified!)
  assert.equal(summary.items.total, 4);
  assert.equal(summary.items.verified, 2, "Items 1 and 2 must be verified");
  assert.equal(summary.items.partial, 1, "Item 3 must be partial");
  assert.equal(summary.items.unknown, 1, "Item 4 must be unknown");
});

test("reverifyConnectorReceipts drops deleted or modified files and preserves audit details (D-08, D-12)", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-rever-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const file1Path = join(dir, "staying.txt");
  await writeFile(file1Path, "intact content", "utf8");
  const sha1 = createHash("sha256").update("intact content").digest("hex");

  const file2Path = join(dir, "will-delete.txt");
  await writeFile(file2Path, "to be deleted", "utf8");
  const sha2 = createHash("sha256").update("to be deleted").digest("hex");

  const receipts = [
    {
      receiptId: "r-stay",
      itemId: "m1",
      sourceIdentity: "src1",
      fileId: "f1",
      canonicalPath: file1Path,
      bytes: Buffer.byteLength("intact content"),
      sha256: sha1,
      verifiedAt: new Date().toISOString(),
      origin: "newly-downloaded" as const,
    },
    {
      receiptId: "r-delete",
      itemId: "m2",
      sourceIdentity: "src2",
      fileId: "f2",
      canonicalPath: file2Path,
      bytes: Buffer.byteLength("to be deleted"),
      sha256: sha2,
      verifiedAt: new Date().toISOString(),
      origin: "newly-downloaded" as const,
    },
  ];

  // Now delete file2 from disk!
  await rm(file2Path);

  const reverified = await reverifyConnectorReceipts(receipts);

  assert.equal(reverified.validReceipts.length, 1);
  assert.equal(reverified.validReceipts[0]?.receiptId, "r-stay");

  assert.equal(reverified.invalidReceipts.length, 1);
  assert.equal(reverified.invalidReceipts[0]?.receipt.receiptId, "r-delete");
  assert.match(reverified.invalidReceipts[0]?.reason ?? "", /File disappeared/u);
});
