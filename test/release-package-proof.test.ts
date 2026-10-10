import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoPrivatePaths,
  computeCategoryDelta,
  DEFAULT_UNOBSERVED_SCOPE_NOTICE,
  evaluatePackedLifecycle,
  renderReleasePackageReceiptsMarkdown,
  reverifyPackedLifecycle,
  type HostPathCategoryDelta,
  type PackageLifecycleStep,
  type PackedLifecycleInput,
} from "../src/core/release-package-proof.js";
import {
  buildHostCategoryDeltas,
  targetDriftCounts,
  type HostFingerprint,
} from "./helpers/packed-sandbox.js";

const VALID_TARBALL_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const DIFFERENT_TARBALL_SHA = "f9e8d7c6b5a43210f9e8d7c6b5a43210f9e8d7c6b5a43210f9e8d7c6b5a43210";

function createValidSteps(tarballSha = VALID_TARBALL_SHA): PackageLifecycleStep[] {
  return [
    {
      name: "install",
      exitCode: 0,
      status: "passed",
      tarballSha256: tarballSha,
      observedAt: "2026-10-10T12:00:00.000Z",
      stdoutSummary: "Installed release into isolated prefix",
    },
    {
      name: "doctor",
      exitCode: 0,
      status: "passed",
      tarballSha256: tarballSha,
      observedAt: "2026-10-10T12:01:00.000Z",
      stdoutSummary: "Doctor findings clean: zero errors",
    },
    {
      name: "uninstall",
      exitCode: 0,
      status: "passed",
      tarballSha256: tarballSha,
      observedAt: "2026-10-10T12:02:00.000Z",
      stdoutSummary: "Uninstalled managed components and purged state",
    },
  ];
}

function createCleanCategories(): HostPathCategoryDelta[] {
  return [
    {
      category: "managed_state",
      description: "Alpha-AOS state and journal directories",
      beforeDigest: "1111111111111111111111111111111111111111111111111111111111111111",
      afterDigest: "1111111111111111111111111111111111111111111111111111111111111111",
      addedCount: 0,
      removedCount: 0,
      changedCount: 0,
      vanishedCount: 0,
      isClean: true,
    },
    {
      category: "harness_config",
      description: "Native harness configuration files",
      beforeDigest: "2222222222222222222222222222222222222222222222222222222222222222",
      afterDigest: "2222222222222222222222222222222222222222222222222222222222222222",
      addedCount: 0,
      removedCount: 0,
      changedCount: 0,
      vanishedCount: 0,
      isClean: true,
    },
    {
      category: "skills",
      description: "Harness ECC skills directories",
      beforeDigest: "3333333333333333333333333333333333333333333333333333333333333333",
      afterDigest: "3333333333333333333333333333333333333333333333333333333333333333",
      addedCount: 0,
      removedCount: 0,
      changedCount: 0,
      vanishedCount: 0,
      isClean: true,
    },
  ];
}

test("evaluatePackedLifecycle returns passed when all steps, gates, and categories are clean", () => {
  const input: PackedLifecycleInput = {
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps(),
    hostCategories: createCleanCategories(),
  };

  const result = evaluatePackedLifecycle(input);
  assert.equal(result.status, "passed");
  assert.equal(result.tarballSha256, VALID_TARBALL_SHA);
  assert.equal(result.candidateRefused, true);
  assert.equal(result.unobservedScopeNotice, DEFAULT_UNOBSERVED_SCOPE_NOTICE);
});

test("evaluatePackedLifecycle fails if tarball sha256 differs across lifecycle steps", () => {
  const steps = createValidSteps();
  steps[2] = { ...steps[2]!, tarballSha256: DIFFERENT_TARBALL_SHA };

  const input: PackedLifecycleInput = {
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps,
    hostCategories: createCleanCategories(),
  };

  const result = evaluatePackedLifecycle(input);
  assert.equal(result.status, "failed");
  assert.match(result.reason ?? "", /tarball SHA-256 mismatch/iu);
});

test("evaluatePackedLifecycle fails if a required step is missing or non-zero exit", () => {
  const missingUninstall: PackedLifecycleInput = {
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps().filter((s) => s.name !== "uninstall"),
    hostCategories: createCleanCategories(),
  };

  const res1 = evaluatePackedLifecycle(missingUninstall);
  assert.equal(res1.status, "failed");
  assert.match(res1.reason ?? "", /missing required lifecycle step: uninstall/iu);

  const stepsWithFail = createValidSteps();
  stepsWithFail[1] = { ...stepsWithFail[1]!, exitCode: 1, status: "failed" };
  const failDoctor: PackedLifecycleInput = {
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: stepsWithFail,
    hostCategories: createCleanCategories(),
  };

  const res2 = evaluatePackedLifecycle(failDoctor);
  assert.equal(res2.status, "failed");
  assert.match(res2.reason ?? "", /step doctor failed with exit code 1/iu);
});

test("evaluatePackedLifecycle fails if lock channel is not stable or candidate is not refused", () => {
  const candidateChannel: PackedLifecycleInput = {
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "candidate",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps(),
    hostCategories: createCleanCategories(),
  };
  assert.equal(evaluatePackedLifecycle(candidateChannel).status, "failed");

  const unrefusedCandidate: PackedLifecycleInput = {
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: false,
    steps: createValidSteps(),
    hostCategories: createCleanCategories(),
  };
  const res = evaluatePackedLifecycle(unrefusedCandidate);
  assert.equal(res.status, "failed");
  assert.match(res.reason ?? "", /candidate lock rejection failed/iu);
});

test("evaluatePackedLifecycle returns indeterminate on unexplained host path drift (D-11)", () => {
  const categoriesWithDrift = createCleanCategories();
  categoriesWithDrift[1] = {
    ...categoriesWithDrift[1]!,
    afterDigest: "9999999999999999999999999999999999999999999999999999999999999999",
    changedCount: 1,
    isClean: false,
  };

  const input: PackedLifecycleInput = {
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps(),
    hostCategories: categoriesWithDrift,
  };

  const result = evaluatePackedLifecycle(input);
  // D-11: unexplained host path drift must be INDETERMINATE, never passed or defect
  assert.equal(result.status, "indeterminate");
  assert.match(result.reason ?? "", /host path drift in category harness_config/iu);
  assert.match(result.nextAction ?? "", new RegExp(VALID_TARBALL_SHA, "iu"));
});

test("reverifyPackedLifecycle strictly enforces identical tarball sha256 (D-11)", () => {
  const indeterminateResult = evaluatePackedLifecycle({
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps(),
    hostCategories: [
      {
        ...createCleanCategories()[0]!,
        isClean: false,
        changedCount: 1,
      },
    ],
  });
  assert.equal(indeterminateResult.status, "indeterminate");

  // Re-verification with DIFFERENT tarball must fail closed
  const diffHashRun = evaluatePackedLifecycle({
    tarballSha256: DIFFERENT_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps(DIFFERENT_TARBALL_SHA),
    hostCategories: createCleanCategories(),
  });

  assert.throws(
    () => reverifyPackedLifecycle(indeterminateResult, diffHashRun),
    /tarball SHA-256 mismatch/iu,
  );

  // Re-verification with IDENTICAL tarball and clean state passes
  const cleanSameHashRun = evaluatePackedLifecycle({
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps(VALID_TARBALL_SHA),
    hostCategories: createCleanCategories(),
  });

  const finalResult = reverifyPackedLifecycle(indeterminateResult, cleanSameHashRun);
  assert.equal(finalResult.status, "passed");
});

test("renderReleasePackageReceiptsMarkdown formats complete report without private paths", () => {
  const result = evaluatePackedLifecycle({
    tarballSha256: VALID_TARBALL_SHA,
    stableLockChannel: "stable",
    stableLockIdentifier: "sha256:abc123stablelock",
    candidateRefused: true,
    steps: createValidSteps(),
    hostCategories: createCleanCategories(),
  });

  const markdown = renderReleasePackageReceiptsMarkdown(result);
  assert.ok(markdown.includes("# Phase 22 Package Receipts: v0.2.0 Packed Lifecycle & Host Boundary Proof"));
  assert.ok(markdown.includes("PASSED"));
  assert.ok(markdown.includes("candidate-lock-gate"));
  assert.ok(markdown.includes("managed_state"));
  assert.ok(markdown.includes("harness_config"));
  assert.ok(markdown.includes("VER-03 Observation Scope Notice"));

  // Ensure no private personal paths
  assert.doesNotMatch(markdown, /[a-zA-Z]:[\\/]Users/iu);
  assert.doesNotMatch(markdown, /\/home\//iu);
});

test("renderReleasePackageReceiptsMarkdown rejects private host paths if injected (D-10)", () => {
  assert.throws(
    () => assertNoPrivatePaths("C:\\Users\\alpha\\.codex\\config.toml"),
    /private host path detected/iu,
  );
  assert.throws(
    () => assertNoPrivatePaths("/home/ubuntu/.claude/config.json"),
    /private host path detected/iu,
  );

  const privateCat: HostPathCategoryDelta = {
    category: "harness_config",
    description: "C:\\Users\\alpha\\private\\config",
    beforeDigest: "111",
    afterDigest: "111",
    addedCount: 0,
    removedCount: 0,
    changedCount: 0,
    vanishedCount: 0,
    isClean: true,
  };

  assert.throws(
    () =>
      renderReleasePackageReceiptsMarkdown({
        status: "passed",
        tarballSha256: VALID_TARBALL_SHA,
        stableLockChannel: "stable",
        stableLockIdentifier: "sha256:abc",
        candidateRefused: true,
        steps: createValidSteps(),
        hostCategories: [privateCat],
        unobservedScopeNotice: DEFAULT_UNOBSERVED_SCOPE_NOTICE,
      }),
    /private host path detected/iu,
  );
});

test("computeCategoryDelta and buildHostCategoryDeltas calculate accurate counts and digests", () => {
  const beforeManifest: HostFingerprint = {
    digest: "hash-before",
    entries: [
      { path: "config.toml", kind: "file", size: 100, sha256: "h1" },
      { path: "old.txt", kind: "file", size: 50, sha256: "h2" },
    ],
  };

  const afterManifest: HostFingerprint = {
    digest: "hash-after",
    entries: [
      { path: "config.toml", kind: "file", size: 120, sha256: "h1-mod" }, // changed
      { path: "new.txt", kind: "file", size: 20, sha256: "h3" }, // added
      // old.txt removed
    ],
  };

  const counts = targetDriftCounts(beforeManifest, afterManifest);
  assert.equal(counts.addedCount, 1);
  assert.equal(counts.removedCount, 1);
  assert.equal(counts.changedCount, 1);
  assert.equal(counts.vanishedCount, 0);

  const delta = computeCategoryDelta("harness_config", "Harness config delta test", [
    {
      beforeDigest: beforeManifest.digest,
      afterDigest: afterManifest.digest,
      ...counts,
    },
  ]);

  assert.equal(delta.category, "harness_config");
  assert.equal(delta.isClean, false);
  assert.equal(delta.addedCount, 1);
  assert.equal(delta.removedCount, 1);
  assert.equal(delta.changedCount, 1);
});
