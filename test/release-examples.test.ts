import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateReleaseExample,
  renderReleaseExamplesMarkdown,
  type ExampleCriterionResult,
  type ExampleCapabilityCall,
  type ReleaseExampleCase,
} from "../src/core/release-examples.js";
const gameScriptUrl = new URL("../../test/fixtures/release-development-game.mjs", import.meta.url).href;

const candidateSha = "c0ffee1234567890abcdef1234567890abcdef12";
const candidateArtifactDigest = "d00d001234567890abcdef1234567890abcdef12";

function makeDevExample(overrides?: Partial<ReleaseExampleCase>): ReleaseExampleCase {
  const criteria: ExampleCriterionResult[] = [
    {
      id: "start_screen",
      description: "Game initializes and displays title/first-person view",
      isMandatory: true,
      status: "accepted",
      inputs: ["start"],
      observations: ["screen=first-person", "player.health=100"],
      notes: "Title and viewport rendered",
    },
    {
      id: "movement_inputs",
      description: "Player responds to forward, back, left, right turns",
      isMandatory: true,
      status: "accepted",
      inputs: ["move:forward", "move:back", "turn:left", "turn:right"],
      observations: ["position updated", "heading updated"],
      notes: "Movement delta confirmed",
    },
    {
      id: "fire_input",
      description: "Weapon fires and calculates projectile hits",
      isMandatory: true,
      status: "accepted",
      inputs: ["fire"],
      observations: ["weapon_fired", "target_hit_and_destroyed"],
      notes: "Hit registration functional",
    },
    {
      id: "collision_rules",
      description: "Hazard collision triggers damage and loss condition",
      isMandatory: true,
      status: "accepted",
      inputs: ["collide:hazard"],
      observations: ["collision_detected_hazard", "health=0"],
      notes: "Collision boundary verified",
    },
    {
      id: "terminal_state",
      description: "Reaches win state upon destroying all targets",
      isMandatory: true,
      status: "accepted",
      inputs: ["fire", "fire", "fire"],
      observations: ["targetsRemaining=0", "outcome=win", "screen=game_over"],
      notes: "Win condition observed",
    },
    {
      id: "subjective_fun",
      description: "Game engagement and enjoyable player loop",
      isMandatory: false,
      status: "unknown",
      inputs: [],
      observations: ["no agreed rubric defined"],
      notes: "Fun requires an agreed rubric rather than an automated pass",
    },
  ];

  const capabilityCalls: ExampleCapabilityCall[] = [
    {
      id: "skill_entry",
      category: "skill",
      toolName: "alpha-aos-task",
      reason: "Natural-language task intake and routing",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/capabilities/cap-skill-task.json",
    },
    {
      id: "mcp_tools",
      category: "mcp",
      toolName: "context7",
      reason: "Framework documentation lookup",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/capabilities/cap-mcp-context7.json",
    },
    {
      id: "pack_materialization",
      category: "pack",
      toolName: "project-pack-dev",
      reason: "Project capability pack activation",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/capabilities/cap-pack-dev.json",
    },
    {
      id: "hook_verify",
      category: "hook",
      toolName: "gsd-hook",
      reason: "Mandatory lifecycle verification hook",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/hooks/hook-execute-post.json",
    },
  ];

  return {
    id: "development",
    title: "CLI First-Person Game Implementation",
    revisionSha: candidateSha,
    artifactDigest: candidateArtifactDigest,
    criteria,
    capabilityCalls,
    reviewWitness: {
      witnessRevisionSha: candidateSha,
      targetRevisionSha: candidateSha,
      witnessArtifactDigest: candidateArtifactDigest,
      targetArtifactDigest: candidateArtifactDigest,
      reviewerHarness: "claude",
      reviewerVersion: "2.1.291",
      verdict: "accepted",
      receiptRef: "receipts/witnesses/review-dev-01.json",
    },
    ...overrides,
  };
}

function makeCoursePilotExample(overrides?: Partial<ReleaseExampleCase>): ReleaseExampleCase {
  const criteria: ExampleCriterionResult[] = [
    {
      id: "manifest_intake",
      description: "Multi-level course/week/module manifest intake",
      isMandatory: true,
      status: "accepted",
      inputs: ["manifest.yaml"],
      observations: ["4 items parsed across 2 modules"],
      notes: "Hierarchy loaded",
    },
    {
      id: "materials_download",
      description: "Deterministic download and local persistence of materials",
      isMandatory: true,
      status: "accepted",
      inputs: ["perform"],
      observations: ["all in-scope files written to disk"],
      notes: "SHA-256 matches expectation",
    },
  ];

  const capabilityCalls: ExampleCapabilityCall[] = [
    {
      id: "skill_entry",
      category: "skill",
      toolName: "alpha-aos-task",
      reason: "CoursePilot task routing",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/capabilities/cap-skill-cp.json",
    },
    {
      id: "mcp_connector",
      category: "mcp",
      toolName: "coursepilot",
      reason: "Materials connector execution",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/capabilities/cap-mcp-cp.json",
    },
    {
      id: "pack_materials",
      category: "pack",
      toolName: "coursepilot-pack",
      reason: "Materials project pack",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/capabilities/cap-pack-cp.json",
    },
    {
      id: "hook_verify",
      category: "hook",
      toolName: "gsd-hook",
      reason: "Post-execution verification hook",
      isRequired: true,
      invoked: true,
      outcome: "ok",
      receiptRef: "receipts/hooks/hook-cp-post.json",
    },
  ];

  return {
    id: "coursepilot",
    title: "CoursePilot Materials Download",
    revisionSha: candidateSha,
    artifactDigest: candidateArtifactDigest,
    criteria,
    capabilityCalls,
    coursePilotMaterials: [
      {
        courseId: "CS101",
        weekId: "W01",
        moduleId: "M01",
        fileId: "f01",
        filename: "syllabus.pdf",
        status: "downloaded",
        localPath: "materials/CS101/W01/M01/syllabus.pdf",
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
        sourceIdentityVerified: true,
        filePresentOnDisk: true,
      },
      // Note: same filename in different module (VER-04 edge adjacency)
      {
        courseId: "CS101",
        weekId: "W01",
        moduleId: "M02",
        fileId: "f02",
        filename: "syllabus.pdf",
        status: "downloaded",
        localPath: "materials/CS101/W01/M02/syllabus.pdf",
        expectedSha256: "b".repeat(64),
        actualSha256: "b".repeat(64),
        sourceIdentityVerified: true,
        filePresentOnDisk: true,
      },
    ],
    coursePilotLms: {
      isLiveLms: false,
      isFixture: true,
      authenticated: false,
      status: "UNVERIFIED",
      reason: "Live LMS credentials not configured on host",
      nextAction: "Configure live LMS API token to verify authenticated download",
    },
    ...overrides,
  };
}

test("game oracle fixture produces observable movement, fire, collision, and win states", async () => {
  const { runSimulation } = await import(gameScriptUrl);
  // Win path
  const winState = runSimulation(["start", "move:forward", "fire", "fire", "fire"]);
  assert.equal(winState.screen, "game_over");
  assert.equal(winState.outcome, "win");
  assert.equal(winState.targetsRemaining, 0);
  assert.ok(winState.events.includes("screen_started_first_person"));
  assert.ok(winState.events.includes("player_moved_forward"));
  assert.ok(winState.events.includes("terminal_state_win"));

  // Loss path via hazard
  const lossState = runSimulation(["start", "collide:hazard"]);
  assert.equal(lossState.screen, "game_over");
  assert.equal(lossState.outcome, "loss");
  assert.equal(lossState.player.health, 0);
  assert.ok(lossState.events.includes("terminal_state_loss"));
});

test("evaluateReleaseExample approves valid development task with exact reviewer witness and required capabilities", () => {
  const example = makeDevExample();
  const evaluation = evaluateReleaseExample(example);

  assert.equal(evaluation.overallStatus, "completed");
  assert.equal(evaluation.mandatoryCriteriaMet, true);
  assert.equal(evaluation.reviewerApproved, true);
  assert.equal(evaluation.requiredCapabilitiesInvoked, true);
  assert.equal(evaluation.unmetMandatoryCriteria.length, 0);
  assert.equal(evaluation.missingRequiredCapabilities.length, 0);
});

test("evaluateReleaseExample rejects completed status if any mandatory criterion is unknown or rejected", () => {
  const example = makeDevExample({
    criteria: makeDevExample().criteria.map((c) =>
      c.id === "collision_rules" ? { ...c, status: "unknown" } : c,
    ),
  });
  const evaluation = evaluateReleaseExample(example);

  assert.equal(evaluation.overallStatus, "failed");
  assert.equal(evaluation.mandatoryCriteriaMet, false);
  assert.ok(evaluation.unmetMandatoryCriteria.includes("collision_rules"));
});

test("evaluateReleaseExample rejects completed status if reviewer witness has stale revision or mismatched digest", () => {
  const staleShaExample = makeDevExample({
    reviewWitness: {
      ...makeDevExample().reviewWitness!,
      witnessRevisionSha: "deadbeef00000000000000000000000000000000",
    },
  });
  const staleEvaluation = evaluateReleaseExample(staleShaExample);
  assert.equal(staleEvaluation.overallStatus, "failed");
  assert.equal(staleEvaluation.reviewerApproved, false);
  assert.match(staleEvaluation.reasons.join(" "), /witness revision.*does not match target/i);

  const digestMismatchExample = makeDevExample({
    reviewWitness: {
      ...makeDevExample().reviewWitness!,
      witnessArtifactDigest: "0".repeat(40),
    },
  });
  const digestEvaluation = evaluateReleaseExample(digestMismatchExample);
  assert.equal(digestEvaluation.overallStatus, "failed");
  assert.equal(digestEvaluation.reviewerApproved, false);
  assert.match(digestEvaluation.reasons.join(" "), /artifact digest.*does not match target/i);
});

test("evaluateReleaseExample rejects completed status if any required capability call is missing or unrun (D-16)", () => {
  const brokenCapExample = makeDevExample({
    capabilityCalls: makeDevExample().capabilityCalls.map((cap) =>
      cap.id === "hook_verify" ? { ...cap, invoked: false, outcome: "unrun", receiptRef: null } : cap,
    ),
  });
  const evaluation = evaluateReleaseExample(brokenCapExample);

  assert.equal(evaluation.overallStatus, "failed");
  assert.equal(evaluation.requiredCapabilitiesInvoked, false);
  assert.ok(evaluation.missingRequiredCapabilities.includes("hook_verify"));
});

test("evaluateReleaseExample preserves separate identities for identical filenames across modules (VER-04 edge adjacency)", () => {
  const cpExample = makeCoursePilotExample();
  const evaluation = evaluateReleaseExample(cpExample);

  assert.equal(evaluation.overallStatus, "completed");
  assert.equal(evaluation.materialsVerified, true);
  assert.equal(evaluation.sortedMaterials?.length, 2);

  // Assert both files with same filename syllabus.pdf are preserved under different module IDs
  const m1 = evaluation.sortedMaterials?.find((m) => m.moduleId === "M01");
  const m2 = evaluation.sortedMaterials?.find((m) => m.moduleId === "M02");
  assert.ok(m1);
  assert.ok(m2);
  assert.equal(m1.filename, "syllabus.pdf");
  assert.equal(m2.filename, "syllabus.pdf");
  assert.notEqual(m1.fileId, m2.fileId);
});

test("evaluateReleaseExample reports unverified LMS status and rejects fake live auth claims (D-15)", () => {
  const cpExample = makeCoursePilotExample();
  const evaluation = evaluateReleaseExample(cpExample);

  assert.equal(evaluation.lmsStatus?.status, "UNVERIFIED");
  assert.equal(evaluation.lmsStatus?.isFixture, true);
  assert.equal(evaluation.lmsStatus?.authenticated, false);
  assert.match(evaluation.lmsStatus?.reason ?? "", /not configured/i);
});

test("evaluateReleaseExample fails if material file is missing from disk or viewed-only", () => {
  const missingFileExample = makeCoursePilotExample({
    coursePilotMaterials: [
      {
        courseId: "CS101",
        weekId: "W01",
        moduleId: "M01",
        fileId: "f01",
        filename: "syllabus.pdf",
        status: "viewed_only", // not downloaded
        filePresentOnDisk: false,
        sourceIdentityVerified: false,
        expectedSha256: "a".repeat(64),
        actualSha256: "a".repeat(64),
      },
    ],
  });
  const evaluation = evaluateReleaseExample(missingFileExample);

  assert.equal(evaluation.overallStatus, "failed");
  assert.equal(evaluation.materialsVerified, false);
});

test("evaluateReleaseExample fails if material SHA-256 does not match expected (CR-06)", () => {
  const hashMismatchExample = makeCoursePilotExample({
    coursePilotMaterials: [
      {
        courseId: "CS101",
        weekId: "W01",
        moduleId: "M01",
        fileId: "f01",
        filename: "syllabus.pdf",
        status: "downloaded",
        filePresentOnDisk: true,
        sourceIdentityVerified: true,
        expectedSha256: "a".repeat(64),
        actualSha256: "b".repeat(64),
      },
    ],
  });
  const evaluation = evaluateReleaseExample(hashMismatchExample);

  assert.equal(evaluation.overallStatus, "failed");
  assert.equal(evaluation.materialsVerified, false);
  assert.match(evaluation.reasons[0] ?? "", /SHA-256 mismatch/i);
});

test("evaluateReleaseExample fails if CoursePilot materials array is empty (CR-06)", () => {
  const emptyMaterialsExample = makeCoursePilotExample({
    coursePilotMaterials: [],
  });
  const evaluation = evaluateReleaseExample(emptyMaterialsExample);

  assert.equal(evaluation.overallStatus, "failed");
  assert.equal(evaluation.materialsVerified, false);
  assert.match(evaluation.reasons[0] ?? "", /materials list is empty/i);
});

test("evaluateReleaseExample fails closed on empty criteria or capability lists (VER-04 edge empty)", () => {
  const emptyCriteria = makeDevExample({ criteria: [] });
  assert.equal(evaluateReleaseExample(emptyCriteria).overallStatus, "unverified");

  const emptyCaps = makeDevExample({ capabilityCalls: [] });
  assert.equal(evaluateReleaseExample(emptyCaps).overallStatus, "unverified");
});

test("renderReleaseExamplesMarkdown renders complete markdown report with all tables", () => {
  const devEval = evaluateReleaseExample(makeDevExample());
  const cpEval = evaluateReleaseExample(makeCoursePilotExample());
  const md = renderReleaseExamplesMarkdown(devEval, cpEval);

  assert.match(md, /Development Task Example: CLI First-Person Game/i);
  assert.match(md, /CoursePilot Task Example: Materials Acquisition/i);
  assert.match(md, /COMPLETED/);
  assert.match(md, /LMS Authentication Boundary/);
  assert.match(md, /UNVERIFIED/);
});
