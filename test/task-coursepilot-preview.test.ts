import assert from "node:assert/strict";
import test from "node:test";
import {
  COURSEPILOT_CONNECTOR_ID,
  COURSEPILOT_UNMET_GATE_ACTION,
  CoursePilotTaskAdapter,
  computeCoursePilotManifestDiff,
  coursePilotToConnectorManifest,
  parseCoursePilotManifestJson,
  resolveCoursePilotRuntime,
  sanitizeLmsString,
  type CoursePilotCoarseManifestV1,
} from "../src/adapters/coursepilot-task.js";

test("resolveCoursePilotRuntime probes actual installed environment and reports D-17 unmet gate honestly", async () => {
  const resolution = await resolveCoursePilotRuntime();

  assert.equal(resolution.status, "available", "Skill and repo root should be located");
  assert.ok(resolution.repoRoot !== null);
  assert.ok(resolution.skillPath !== null);
  assert.ok(resolution.contractDocPath !== null);
  assert.ok(resolution.skillFingerprint !== null);
  assert.ok(resolution.contractFingerprint !== null);

  // The actual installed CoursePilot CLI does not yet implement D-17 flags (--contract-version/--manifest)
  // The adapter must fail closed honestly!
  assert.equal(resolution.supported, false, "Must fail closed when D-17 flags are not yet in CLI");
  assert.equal(resolution.nextAction, COURSEPILOT_UNMET_GATE_ACTION);
  assert.ok(resolution.missingProof.length > 0);
  assert.ok(
    resolution.missingProof.some((p) => p.includes("D-17 public materials contract")),
    "Must explicitly name D-17 contract prerequisite",
  );
});

test("sanitizeLmsString strips control characters and bounds length (TOOL-04)", () => {
  const hostile = "Math 101 \x00\x1F\x7F-- Injected Shell \r\n Title";
  const cleaned = sanitizeLmsString(hostile);
  assert.equal(cleaned, "Math 101 -- Injected Shell Title");
  assert.ok(!cleaned.includes("\x00"));

  const veryLong = "A".repeat(300);
  const bounded = sanitizeLmsString(veryLong, 50);
  assert.equal(bounded.length, 50);
  assert.ok(bounded.endsWith("..."));
});

test("parseCoursePilotManifestJson strictly validates wire format and rejects boundary violations", () => {
  // 1. Valid coarse manifest
  const validJson = JSON.stringify({
    schema_version: 1,
    operation: "manifest",
    observed_at: "2026-10-09T00:00:00.000Z",
    materials: [
      {
        module_id: "mod-01",
        course_id: "CS101",
        week_number: 1,
        title: "Introduction Slides",
        source_identity: "cs101:1:mod-01",
        attachments_complete: true,
        files: [
          {
            file_id: "f-01",
            filename: "intro.pdf",
            destination: "content/cs101/intro.pdf",
            expected_bytes: 1024,
            expected_sha256: "aaa111",
          },
        ],
      },
      {
        module_id: "mod-02",
        course_id: "CS101",
        week_number: 1,
        title: "Syllabus",
        source_identity: "cs101:1:mod-02",
        attachments_complete: false,
        files: [],
      },
    ],
  });

  const parsed = parseCoursePilotManifestJson(validJson);
  assert.equal(parsed.materials.length, 2);
  assert.equal(parsed.materials[0]?.moduleId, "mod-01");
  assert.equal(parsed.materials[0]?.attachmentsComplete, true);
  assert.equal(parsed.materials[1]?.attachmentsComplete, false);

  // 2. Empty materials reported honestly as 0
  const emptyJson = JSON.stringify({
    schema_version: 1,
    operation: "manifest",
    materials: [],
  });
  const parsedEmpty = parseCoursePilotManifestJson(emptyJson);
  assert.equal(parsedEmpty.materials.length, 0);

  // 3. Exceeds byte budget
  const hugeJson = JSON.stringify({
    schema_version: 1,
    operation: "manifest",
    materials: [],
    padding: "X".repeat(257 * 1024),
  });
  assert.throws(
    () => parseCoursePilotManifestJson(hugeJson),
    /exceeds maximum allowed size/u,
  );

  // 4. Malformed JSON
  assert.throws(
    () => parseCoursePilotManifestJson("{ invalid json "),
    /malformed JSON/u,
  );

  // 5. Unknown schema version
  assert.throws(
    () => parseCoursePilotManifestJson(JSON.stringify({ schema_version: 99, operation: "manifest", materials: [] })),
    /Unsupported CoursePilot schema version/u,
  );

  // 6. Duplicate moduleId
  const dupModuleJson = JSON.stringify({
    schema_version: 1,
    operation: "manifest",
    materials: [
      { module_id: "dup-id", course_id: "C1", week_number: 1, title: "M1" },
      { module_id: "dup-id", course_id: "C1", week_number: 1, title: "M2" },
    ],
  });
  assert.throws(
    () => parseCoursePilotManifestJson(dupModuleJson),
    /Duplicate moduleId in CoursePilot manifest/u,
  );

  // 7. Duplicate fileId within module
  const dupFileJson = JSON.stringify({
    schema_version: 1,
    operation: "manifest",
    materials: [
      {
        module_id: "mod-dup-file",
        course_id: "C1",
        week_number: 1,
        title: "M1",
        files: [
          { file_id: "dup-f", filename: "a.pdf" },
          { file_id: "dup-f", filename: "b.pdf" },
        ],
      },
    ],
  });
  assert.throws(
    () => parseCoursePilotManifestJson(dupFileJson),
    /Duplicate fileId 'dup-f'/u,
  );
});

test("computeCoursePilotManifestDiff accurately computes added, removed, changed, unchanged across ordering (D-01..D-04)", () => {
  const baseManifest: CoursePilotCoarseManifestV1 = {
    schemaVersion: 1,
    operation: "manifest",
    status: "ok",
    observedAt: "2026-10-09T00:00:00.000Z",
    materials: [
      {
        moduleId: "mod-keep",
        courseId: "CS101",
        weekNumber: 1,
        title: "Keep Title",
        sourceIdentity: "cs101:1:mod-keep",
        attachmentsComplete: true,
        files: [{ fileId: "f-keep", filename: "keep.pdf" }],
      },
      {
        moduleId: "mod-changed",
        courseId: "CS101",
        weekNumber: 1,
        title: "Original Title",
        sourceIdentity: "cs101:1:mod-changed",
        attachmentsComplete: true,
        files: [{ fileId: "f-c1", filename: "original.pdf" }],
      },
      {
        moduleId: "mod-remove",
        courseId: "CS101",
        weekNumber: 1,
        title: "To Be Removed",
        sourceIdentity: "cs101:1:mod-remove",
        attachmentsComplete: true,
        files: [],
      },
    ],
  };

  const updatedManifest: CoursePilotCoarseManifestV1 = {
    schemaVersion: 1,
    operation: "manifest",
    status: "ok",
    observedAt: "2026-10-09T01:00:00.000Z",
    materials: [
      // Shuffled order: mod-add first, mod-changed second, mod-keep third
      {
        moduleId: "mod-add",
        courseId: "CS101",
        weekNumber: 1,
        title: "Newly Added",
        sourceIdentity: "cs101:1:mod-add",
        attachmentsComplete: false,
        files: [],
      },
      {
        moduleId: "mod-changed",
        courseId: "CS101",
        weekNumber: 1,
        title: "Updated Title", // Title changed!
        sourceIdentity: "cs101:1:mod-changed",
        attachmentsComplete: true,
        files: [{ fileId: "f-c1", filename: "original.pdf" }],
      },
      {
        moduleId: "mod-keep",
        courseId: "CS101",
        weekNumber: 1,
        title: "Keep Title", // Unchanged!
        sourceIdentity: "cs101:1:mod-keep",
        attachmentsComplete: true,
        files: [{ fileId: "f-keep", filename: "keep.pdf" }],
      },
    ],
  };

  const diff = computeCoursePilotManifestDiff(baseManifest, updatedManifest);

  assert.equal(diff.hasDiff, true);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0]?.moduleId, "mod-add");

  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0]?.moduleId, "mod-remove");

  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0]?.current.moduleId, "mod-changed");
  assert.match(diff.changed[0]?.reason ?? "", /title/u);

  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.unchanged[0]?.moduleId, "mod-keep");
});

test("CoursePilotTaskAdapter fails closed on unmet runtime and converts fixture to ConnectorManifestV1", async () => {
  // 1. Live preview fails closed with prerequisite action when runtime is unsupported
  const unmockedAdapter = new CoursePilotTaskAdapter({
    runtime: {
      status: "available",
      repoRoot: "D:/dev/coursePilot",
      skillPath: "path/SKILL.md",
      contractDocPath: "path/JSON_CONTRACT.md",
      skillFingerprint: "fingerprint",
      contractFingerprint: "fingerprint",
      sourceCommit: "commit-sha",
      uvExecutable: "uv",
      contractVersion: null,
      supported: false, // Unsupported!
      missingProof: ["D-17 flags missing"],
      nextAction: COURSEPILOT_UNMET_GATE_ACTION,
    },
  });

  await assert.rejects(
    () => unmockedAdapter.preview({ projectRoot: "D:/test/project" }),
    (err: Error) => {
      assert.match(err.message, /CoursePilot runtime prerequisite unmet/u);
      assert.match(err.message, /Implement, test, commit and install/u);
      return true;
    },
  );

  // 2. Fixture manifest translates to ConnectorManifestV1 with stable items and digests
  const fixtureJson = JSON.stringify({
    schema_version: 1,
    operation: "manifest",
    observed_at: "2026-10-09T00:00:00.000Z",
    materials: [
      {
        module_id: "mod-10",
        course_id: "SE101",
        week_number: 2,
        title: "Week 2 Design Patterns",
        source_identity: "se101:2:mod-10",
        attachments_complete: true,
        files: [
          {
            file_id: "file-dp-pdf",
            filename: "patterns.pdf",
            expected_bytes: 2048,
          },
        ],
      },
    ],
  });

  const mockedAdapter = new CoursePilotTaskAdapter({
    fixtureManifestJson: fixtureJson,
    runtime: {
      status: "available",
      repoRoot: "D:/dev/coursePilot",
      skillPath: "path/SKILL.md",
      contractDocPath: "path/JSON_CONTRACT.md",
      skillFingerprint: "fingerprint",
      contractFingerprint: "contract-digest-123",
      sourceCommit: "commit-sha",
      uvExecutable: "uv",
      contractVersion: 1,
      supported: true,
      missingProof: [],
      nextAction: null,
    },
  });

  const preview = await mockedAdapter.preview({ projectRoot: "D:/test/project" });
  assert.equal(preview.manifest.connectorId, COURSEPILOT_CONNECTOR_ID);
  assert.equal(preview.manifest.items.length, 1);
  assert.equal(preview.manifest.items[0]?.itemId, "mod-10");
  assert.equal(preview.manifest.items[0]?.requiredFiles.length, 1);
  assert.equal(preview.manifest.items[0]?.requiredFiles[0]?.fileId, "file-dp-pdf");
  assert.ok(typeof preview.manifestDigest === "string");
  assert.equal(preview.manifestDigest.length, 64);
});
