import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskCapabilityInventory } from "../src/core/task-capability-inventory.js";
import type {
  CapabilityLedger,
  HarnessId,
  PackCatalog,
  ProjectCapabilityPlan,
  StackCatalog,
  StackLock,
} from "../src/types.js";

function mockCatalog(): StackCatalog {
  return {
    schemaVersion: 1,
    name: "alpha-aos",
    defaultChannel: "stable",
    channels: {
      stable: { lock: "catalog/stack.lock.json", description: "Stable channel" },
      candidate: { lock: "catalog/candidate.lock.json", description: "Candidate channel" },
      pinned: { description: "Pinned lock" },
    },
    harnesses: {
      claude: { displayName: "Claude", gsdTarget: "claude", eccTarget: "claude" },
      codex: { displayName: "Codex", gsdTarget: "codex", eccTarget: "codex" },
      antigravity: { displayName: "Antigravity", gsdTarget: "antigravity", eccTarget: "antigravity" },
      pi: { displayName: "Pi", gsdTarget: "pi", eccStrategy: "bridge" },
      hermes: { displayName: "Hermes", gsdStrategy: "worker-only", eccTarget: "hermes" },
    },
    components: {
      gsd: {
        package: "@opengsd/gsd-core",
        profile: "standard",
        targets: ["claude", "codex", "antigravity", "pi"],
      },
      ecc: {
        package: "ecc-universal",
        globalSkills: ["unified-memory", "documentation-lookup", "deep-research"],
        profileInstallAllowed: false,
      },
      mcp: {
        rolloutOrder: ["context7", "exa", "firecrawl"],
        targets: ["claude", "codex", "antigravity", "pi", "hermes"],
      },
      ownedSkills: [
        {
          id: "alpha-aos-ship",
          source: "skills/alpha-aos-ship/SKILL.md",
          targets: ["claude"],
          invocation: "explicit",
        },
        {
          id: "alpha-aos-control",
          source: "skills/alpha-aos-control/SKILL.md",
          targets: ["claude", "codex", "antigravity", "pi", "hermes"],
          invocation: "automatic",
        },
      ],
    },
    policy: {
      mutationDefault: "dry-run",
      requireSnapshot: true,
      requireCanary: true,
      canaryHarness: "codex",
      forbidManagedFilePatches: true,
      autoApplyMarkdownOnly: true,
      requireApprovalFor: ["hooks", "mcp", "rules", "executables", "config-merge"],
    },
  };
}

function mockLock(): StackLock {
  return {
    schemaVersion: 1,
    channel: "stable",
    generatedAt: "2026-10-01T00:00:00.000Z",
    components: {
      gsd: {
        package: "@opengsd/gsd-core",
        version: "1.14.0",
        integrity: "sha512-test-gsd-integrity",
        profile: "standard",
      },
      ecc: {
        package: "ecc-universal",
        version: "2.2.1",
        integrity: "sha512-test-ecc-integrity",
        skills: ["unified-memory", "documentation-lookup", "deep-research", "node-testing"],
        sourceSha256: {
          "unified-memory": "hash-unified-memory",
          "documentation-lookup": "hash-doc-lookup",
          "deep-research": "hash-deep-research",
          "node-testing": "hash-node-testing",
        },
        targetSha256: {
          "unified-memory": { claude: "hash-unified-memory" },
          "documentation-lookup": { claude: "hash-doc-lookup" },
          "deep-research": { claude: "hash-deep-research" },
          "node-testing": { claude: "hash-node-testing" },
        },
      },
      mcp: {
        context7: {
          package: "@upstash/context7-mcp",
          version: "4.1.1",
          integrity: "sha512-context7-integrity",
        },
        exa: {
          package: "exa-mcp-server",
          version: "3.4.1",
          integrity: "sha512-exa-integrity",
        },
        firecrawl: {
          package: "firecrawl-mcp",
          version: "3.25.2",
          integrity: "sha512-firecrawl-integrity",
        },
      },
    },
  };
}

function mockPackCatalog(): PackCatalog {
  return {
    schemaVersion: 1,
    packs: [
      {
        id: "node",
        evidence: { all: [] },
        skills: ["node-testing"],
      },
      {
        id: "python",
        evidence: { all: [] },
        skills: ["python-lint"],
      },
    ],
  };
}

test("buildTaskCapabilityInventory enumerates all required categories with unique IDs", async () => {
  const inventory = await buildTaskCapabilityInventory({
    catalog: mockCatalog(),
    lock: mockLock(),
    packCatalog: mockPackCatalog(),
  });

  assert.equal(inventory.schemaVersion, 1);
  assert.ok(inventory.items.length > 0);

  const seenIds = new Set<string>();
  const kinds = new Set<string>();

  for (const item of inventory.items) {
    assert.ok(!seenIds.has(item.id), `ID ${item.id} must be unique`);
    seenIds.add(item.id);
    kinds.add(item.kind);

    // Verify independent state axes exist
    assert.ok(item.deployment, `Item ${item.id} must have deployment state`);
    assert.ok(item.nativeUse, `Item ${item.id} must have nativeUse state`);
    assert.ok(item.support, `Item ${item.id} must have support state`);
    assert.ok(typeof item.nativeUseReason === "string");
    assert.ok(typeof item.supportReason === "string");
  }

  // Verify all categories are present
  const requiredCategories = [
    "gsd-workflow",
    "ecc-global-skill",
    "ecc-project-skill",
    "owned-skill",
    "mcp-server",
    "mcp-tool",
    "capability-pack",
    "control-command",
    "native-tool",
    "mandatory-hook",
  ];
  for (const category of requiredCategories) {
    assert.ok(kinds.has(category), `Missing expected capability kind: ${category}`);
  }
});

test("unapproved project packs are marked unselected and not available as global", async () => {
  const inventory = await buildTaskCapabilityInventory({
    catalog: mockCatalog(),
    lock: mockLock(),
    packCatalog: mockPackCatalog(),
    projectPlan: null, // No approved project plan
  });

  const nodePack = inventory.items.find((item) => item.id === "pack:node");
  assert.ok(nodePack);
  assert.equal(nodePack.applicable, false);
  assert.equal(nodePack.selected, false);
  assert.equal(nodePack.deployment, "STALE");
  assert.ok(nodePack.exclusionReason?.includes("not approved"));

  const nodeSkill = inventory.items.find((item) => item.id === "ecc:project:node:node-testing");
  assert.ok(nodeSkill);
  assert.equal(nodeSkill.applicable, false);
  assert.equal(nodeSkill.selected, false);
  assert.equal(nodeSkill.deployment, "STALE");
  assert.ok(nodeSkill.exclusionReason?.includes("unapproved or unselected"));

  // Global skill is still selected
  const globalSkill = inventory.items.find((item) => item.id === "ecc:global:documentation-lookup");
  assert.ok(globalSkill);
  assert.equal(globalSkill.selected, true);
  assert.equal(globalSkill.applicable, true);
  assert.equal(globalSkill.deployment, "CURRENT");
});

test("approved project packs become selected with target state", async () => {
  const plan = {
    schemaVersion: 1,
    planDigest: "approved-digest-123",
    scope: {
      canonicalRoot: "/mock/root",
      rootReason: "git-root",
      projectId: "proj-1",
      subProjectPath: null,
    },
    owner: { id: "alpha-aos", producer: { name: "alpha-aos", version: "1.0.0" } },
    source: [],
    renderer: { id: "identity", version: "1.0.0", identity: true, note: "render" },
    targetPreState: [
      {
        packId: "node",
        skill: "node-testing",
        harness: "claude",
        path: ".claude/skills/node-testing/SKILL.md",
        exists: true,
        currentHash: "hash-node-testing",
        ownedByReceipt: true,
        expectedHash: "hash-node-testing",
        action: "current",
      },
    ],
    adapterSupport: {
      claude: "supported",
      codex: "supported",
      antigravity: "supported",
      pi: "supported",
      hermes: "supported",
    },
    adapterSupportEvidence: [],
    approvals: [],
    safeInverse: [],
    executable: null,
    executableDisposition: { deferredTo: "none", reason: "none" },
    receiptDirectory: ".alpha-aos/receipts",
    evaluations: [],
    nearMissOrder: [],
    subProjects: [],
    hostNotes: [],
    selected: ["node"],
    applicable: ["node"],
  } as unknown as ProjectCapabilityPlan;

  const inventory = await buildTaskCapabilityInventory({
    catalog: mockCatalog(),
    lock: mockLock(),
    packCatalog: mockPackCatalog(),
    projectPlan: plan,
  });

  const nodePack = inventory.items.find((item) => item.id === "pack:node");
  assert.ok(nodePack);
  assert.equal(nodePack.applicable, true);
  assert.equal(nodePack.selected, true);
  assert.equal(nodePack.deployment, "CURRENT");
  assert.equal(nodePack.exclusionReason, null);

  const nodeSkill = inventory.items.find((item) => item.id === "ecc:project:node:node-testing");
  assert.ok(nodeSkill);
  assert.equal(nodeSkill.applicable, true);
  assert.equal(nodeSkill.selected, true);
  assert.equal(nodeSkill.deployment, "CURRENT");
  assert.equal(nodeSkill.exclusionReason, null);
});

test("capability ledger updates nativeUse without modifying approval inputFingerprint", async () => {
  const catalog = mockCatalog();
  const lock = mockLock();
  const packCatalog = mockPackCatalog();

  const inventoryBefore = await buildTaskCapabilityInventory({
    catalog,
    lock,
    packCatalog,
    ledger: null,
  });

  const docItemBefore = inventoryBefore.items.find((i) => i.id === "ecc:global:documentation-lookup");
  assert.ok(docItemBefore);
  assert.equal(docItemBefore.nativeUse, "unverified");

  const ledger = {
    schemaVersion: 1,
    producer: { name: "alpha-aos", version: "1.0.0" },
    updatedAt: "2026-10-02T00:00:00.000Z",
    proofs: [
      {
        projectId: null,
        harness: "claude",
        capability: "documentation-lookup",
        polarity: "positive",
        nativeUse: "invoked",
        blockedReason: null,
        boundInputs: { manifestSha256: "m", lockSha256: "l", catalogSha256: "c" },
        harnessVersion: { executable: "claude", version: "1.0.0", reportedSha256: null },
        ancestorFreedom: null,
        observedAt: "2026-10-02T00:00:00.000Z",
        oracle: { method: "oracle", verified: true },
      },
    ],
  } as unknown as CapabilityLedger;

  const inventoryAfter = await buildTaskCapabilityInventory({
    catalog,
    lock,
    packCatalog,
    ledger,
  });

  const docItemAfter = inventoryAfter.items.find((i) => i.id === "ecc:global:documentation-lookup");
  assert.ok(docItemAfter);
  assert.equal(docItemAfter.nativeUse, "invoked");

  // Host facts must not alter inputFingerprint
  assert.equal(inventoryBefore.inputFingerprint, inventoryAfter.inputFingerprint);
});

test("changing lock integrity alters inputFingerprint", async () => {
  const catalog = mockCatalog();
  const lock1 = mockLock();
  const lock2 = mockLock();
  if (lock2.components.gsd) {
    lock2.components.gsd.version = "1.15.0";
  }

  const inv1 = await buildTaskCapabilityInventory({ catalog, lock: lock1 });
  const inv2 = await buildTaskCapabilityInventory({ catalog, lock: lock2 });

  assert.notEqual(inv1.inputFingerprint, inv2.inputFingerprint);
});

test("filtering by harness resolves harness-specific support and nativeUse", async () => {
  const catalog = mockCatalog();
  const lock = mockLock();

  const claudeInventory = await buildTaskCapabilityInventory({
    catalog,
    lock,
    harness: "claude",
  });
  const shipItemClaude = claudeInventory.items.find((i) => i.id === "owned:alpha-aos-ship");
  assert.ok(shipItemClaude);
  assert.equal(shipItemClaude.support, "supported");

  const codexInventory = await buildTaskCapabilityInventory({
    catalog,
    lock,
    harness: "codex",
  });
  const shipItemCodex = codexInventory.items.find((i) => i.id === "owned:alpha-aos-ship");
  assert.ok(shipItemCodex);
  assert.equal(shipItemCodex.support, "unsupported");
});
