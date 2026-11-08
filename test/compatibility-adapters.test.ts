import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  COMPATIBILITY_ADAPTER_REGISTRY,
  listCompatibilityAdapters,
  getCompatibilityAdapter,
  summarizeToolAdapters,
  isSeparateGuidanceProvenForHarness,
  deriveAdaptedTargetDigest,
  buildAdapterToolEvidence,
  evaluateDeepResearchRoutingAdapter,
  evaluateAntigravityDocLookupAdapter,
  evaluateClaudeShipSkillAdapter,
  evaluatePiBridgeAdapter,
  evaluateCodexStopHookAdapter,
} from "../src/core/compatibility-adapters.js";
import { validateManagedDocument, rejectRawCredentials } from "../src/core/validation.js";
import { ComponentPlanError } from "../src/core/component-session.js";
import type { ThreeStageGuidanceProof } from "../src/types.js";

describe("compatibility-adapters (ADAPT-01 ~ ADAPT-04)", () => {
  it("registers 5 compatibility-corrections and 4 policy-interfaces with deterministic ordering", () => {
    assert.equal(COMPATIBILITY_ADAPTER_REGISTRY.length, 9);

    // Verify deterministic sorting by id
    const ids = COMPATIBILITY_ADAPTER_REGISTRY.map((a) => a.id);
    const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(ids, sortedIds);

    const corrections = COMPATIBILITY_ADAPTER_REGISTRY.filter(
      (a) => a.kind === "compatibility-correction"
    );
    assert.equal(corrections.length, 5);
    for (const c of corrections) {
      assert.ok(typeof c.removalCondition === "string" && c.removalCondition.length > 0);
      assert.ok(typeof c.rationale === "string" && c.rationale.length > 0);
      assert.ok(typeof c.applicability === "string" && c.applicability.length > 0);
      assert.ok(typeof c.verificationMethod === "string" && c.verificationMethod.length > 0);
      assert.ok(typeof c.revision === "string" && c.revision.length > 0);
      assert.ok(c.harnesses.length > 0);
      assert.ok(c.platforms.length > 0);
    }

    const policies = COMPATIBILITY_ADAPTER_REGISTRY.filter(
      (a) => a.kind === "policy-interface"
    );
    assert.equal(policies.length, 4);
    for (const p of policies) {
      assert.equal(p.removalCondition, null);
      assert.equal(p.retirement, null);
      assert.ok(typeof p.rationale === "string" && p.rationale.length > 0);
      assert.ok(typeof p.applicability === "string" && p.applicability.length > 0);
      assert.ok(typeof p.verificationMethod === "string" && p.verificationMethod.length > 0);
    }

    // Query helper tests
    const gsdAdapters = listCompatibilityAdapters({ toolId: "gsd" });
    assert.ok(gsdAdapters.some((a) => a.id === "gsd:codex-stop-hook-helpers"));
    assert.ok(gsdAdapters.some((a) => a.id === "policy:codex-execution-guidance"));

    const piBridge = getCompatibilityAdapter("mcp:pi-bridge");
    assert.ok(piBridge);
    assert.equal(piBridge.toolId, "bridge:pi");

    const cuaSummary = summarizeToolAdapters("cua-driver");
    assert.equal(cuaSummary.activeCorrectionCount, 0);
    assert.equal(cuaSummary.retiredCorrectionCount, 0);
    assert.equal(cuaSummary.policyInterfaceCount, 0);

    const eccSummary = summarizeToolAdapters("ecc");
    assert.ok(eccSummary.activeCorrectionCount >= 2);
  });

  it("evaluates 3-stage guidance proof gate strictly (D-05, D-06, D-07)", () => {
    // Missing proof
    assert.equal(isSeparateGuidanceProvenForHarness(null), false);
    assert.equal(isSeparateGuidanceProvenForHarness(undefined), false);

    // Partial proofs
    const discoveryOnly: ThreeStageGuidanceProof = {
      harness: "claude",
      skillId: "alpha-aos-research-routing",
      discovery: true,
      precedence: false,
      invocationReceipt: false,
      evidenceId: "ev-1",
    };
    assert.equal(isSeparateGuidanceProvenForHarness(discoveryOnly), false);

    const noReceipt: ThreeStageGuidanceProof = {
      harness: "claude",
      skillId: "alpha-aos-research-routing",
      discovery: true,
      precedence: true,
      invocationReceipt: false,
      evidenceId: "ev-1",
    };
    assert.equal(isSeparateGuidanceProvenForHarness(noReceipt), false);

    const noEvidenceId: ThreeStageGuidanceProof = {
      harness: "claude",
      skillId: "alpha-aos-research-routing",
      discovery: true,
      precedence: true,
      invocationReceipt: true,
    };
    assert.equal(isSeparateGuidanceProvenForHarness(noEvidenceId), false);

    // All 3 stages proven with evidenceId
    const fullyProven: ThreeStageGuidanceProof = {
      harness: "claude",
      skillId: "alpha-aos-research-routing",
      discovery: true,
      precedence: true,
      invocationReceipt: true,
      evidenceId: "ev-proven-123",
    };
    assert.equal(isSeparateGuidanceProvenForHarness(fullyProven), true);
  });

  it("evaluates ecc:deep-research-routing: resilient to heading changes and neutralizes blocked tools (D-08, D-16)", () => {
    const upstreamWithChangedHeadings = `---
name: deep-research
description: Perform in-depth multi-source research.
allowed-tools:
  - Read
  - Skill
---

# Deep Research (Custom Workflow)

## Different Heading Name Here
Some upstream explanation about gathering facts.

### Custom Step Heading A: Finding Information
Use firecrawl_search for candidate pages:
\`\`\`text
firecrawl_search(query: "something")
\`\`\`
And optionally web_search_advanced_exa for deeper search.

### Custom Step Heading B: Full Content Extraction
Read the pages using crawling_exa for crawling or extracting.
`;

    const result = evaluateDeepResearchRoutingAdapter(upstreamWithChangedHeadings, {
      harness: "codex",
    });

    assert.equal(result.adapterId, "ecc:deep-research-routing");
    assert.equal(result.status, "active");
    assert.equal(result.resolution, "applied");
    assert.equal(result.verificationResult, "pass");

    const rendered = result.renderedContent!;
    assert.ok(rendered.includes("<!-- alpha-aos-adapter:ecc:deep-research-routing:v2:start -->"));
    assert.ok(rendered.includes("<!-- alpha-aos-adapter:ecc:deep-research-routing:v2:end -->"));
    assert.ok(rendered.includes("web_search_exa"));
    assert.ok(rendered.includes("firecrawl_scrape"));

    // Blocked tools must be neutralized in postcondition
    assert.equal(rendered.includes("firecrawl_search"), false);
    assert.equal(rendered.includes("web_search_advanced_exa"), false);
    assert.equal(rendered.includes("crawling_exa"), false);
  });

  it("evaluates ecc:deep-research-routing retirement when upstream resolved or guidance proven (D-13, D-15)", () => {
    // 1. Upstream resolved: already contains no blocked tools and has web_search_exa + firecrawl_scrape
    const resolvedUpstream = `---
name: deep-research
description: Perform in-depth multi-source research.
---

# Deep Research

Start at web_search_exa to find sources.
Extract key URLs using firecrawl_scrape.
`;

    const upstreamResult = evaluateDeepResearchRoutingAdapter(resolvedUpstream, {
      harness: "codex",
      verifiedRelease: "2.3.0",
    });
    assert.equal(upstreamResult.status, "retired");
    assert.equal(upstreamResult.resolution, "resolved-upstream");
    assert.equal(upstreamResult.renderedContent, resolvedUpstream);
    assert.ok(upstreamResult.retirementReason?.includes("Upstream"));

    // 2. Guidance proven on harness
    const unadaptedSource = `---
name: deep-research
description: Perform in-depth multi-source research.
---
# Deep Research
Use firecrawl_search here.
`;
    const provenResult = evaluateDeepResearchRoutingAdapter(unadaptedSource, {
      harness: "claude",
      guidanceProof: {
        harness: "claude",
        skillId: "alpha-aos-research-routing",
        discovery: true,
        precedence: true,
        invocationReceipt: true,
        evidenceId: "claude-proof-1",
      },
      verifiedRelease: "2.3.0",
    });
    assert.equal(provenResult.status, "retired");
    assert.equal(provenResult.resolution, "bypassed-by-proven-guidance");
    assert.equal(provenResult.renderedContent, unadaptedSource);
  });

  it("fails closed on broken preconditions for ecc:deep-research-routing (D-13)", () => {
    const invalidSource = "Not a markdown with frontmatter";
    assert.throws(
      () => evaluateDeepResearchRoutingAdapter(invalidSource, { harness: "codex" }),
      (err) => err instanceof ComponentPlanError && err.code === "plan-incomplete"
    );
  });

  it("evaluates ecc:antigravity-doc-lookup with minimal structural adaptation and retirement (D-06, D-08, D-13)", () => {
    const upstreamSource = `---
name: documentation-lookup
description: Old description here.
allowed-tools:
  - Read
---

# Documentation Lookup (Context7)

Some documentation text.
`;

    const result = evaluateAntigravityDocLookupAdapter(upstreamSource);
    assert.equal(result.adapterId, "ecc:antigravity-doc-lookup");
    assert.equal(result.status, "active");
    assert.equal(result.resolution, "applied");

    const rendered = result.renderedContent!;
    assert.ok(rendered.includes("In Antigravity, use the surface's native Context7 MCP route"));
    assert.ok(rendered.includes("## Antigravity GUI/IDE Routing"));
    assert.ok(rendered.includes("context7/resolve-library-id"));
    assert.ok(rendered.includes("call_mcp_tool"));

    // Precondition failure on missing description
    assert.throws(
      () => evaluateAntigravityDocLookupAdapter("---\nname: doc\n---\n# Doc"),
      (err) => err instanceof ComponentPlanError && err.code === "plan-incomplete"
    );
  });

  it("derives deterministic adapter digests and builds schema-compliant ToolEvidence (D-14, D-15)", async () => {
    const digest1 = deriveAdaptedTargetDigest(
      "ecc:deep-research-routing",
      "v2",
      "active",
      "a".repeat(64),
      "b".repeat(64)
    );
    const digest2 = deriveAdaptedTargetDigest(
      "ecc:deep-research-routing",
      "v2",
      "active",
      "a".repeat(64),
      "b".repeat(64)
    );
    assert.equal(digest1, digest2);
    assert.match(digest1, /^[a-f0-9]{64}$/);

    const evaluation = evaluateDeepResearchRoutingAdapter(
      `---
name: deep-research
description: Perform in-depth multi-source research.
---
# Deep Research
Use firecrawl_search here.
`,
      { harness: "codex" }
    );

    const evidence = buildAdapterToolEvidence("ecc", evaluation, {
      platform: "windows",
      architecture: "x64",
      harness: "codex",
    });

    // Check idPattern constraints (no colons)
    assert.match(evidence.proofId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
    assert.match(evidence.subject, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
    assert.equal(evidence.proofId.includes(":"), false);
    assert.equal(evidence.subject.includes(":"), false);
    assert.equal(evidence.result, "pass");
    assert.equal(evidence.target, "integration");
    assert.equal(evidence.fingerprint, evaluation.derivationDigest);

    // Validate against tool-release-record schema
    const schema = JSON.parse(
      await readFile(resolve("schemas/tool-release-record.schema.json"), "utf8")
    );
    const recordDoc = {
      schemaVersion: 1,
      eventId: "ev-test-1",
      operationId: "op-test-1",
      sequence: 1,
      occurredAt: "2026-11-08T12:00:00Z",
      kind: "tool-result",
      result: {
        toolId: "ecc",
        requested: { toolId: "ecc", selector: "2.2.3", exact: true },
        resolved: null,
        installed: null,
        verified: null,
        outcome: "succeeded",
        evidence: [evidence],
      },
    };
    const validation = validateManagedDocument({
      text: JSON.stringify(recordDoc),
      format: "json",
      kind: "tool-release-record",
      schema,
      domain: rejectRawCredentials,
    });
    assert.equal(validation.ok, true);
  });

  it("evaluates gsd:claude-ship-skill, mcp:pi-bridge, and gsd:codex-stop-hook-helpers lifecycle states (D-04, D-09, D-12)", () => {
    // Claude ship skill: retired when native ship skill exists
    const retiredShip = evaluateClaudeShipSkillAdapter({
      hasNativeGsdShip: true,
      hasUpstreamWorkflow: true,
      verifiedRelease: "2.1.0",
    });
    assert.equal(retiredShip.status, "retired");
    assert.equal(retiredShip.resolution, "resolved-upstream");

    // Active when workflow exists but native skill does not
    const activeShip = evaluateClaudeShipSkillAdapter({
      hasNativeGsdShip: false,
      hasUpstreamWorkflow: true,
    });
    assert.equal(activeShip.status, "active");
    assert.equal(activeShip.resolution, "applied");

    // Precondition failure when workflow missing
    assert.throws(
      () =>
        evaluateClaudeShipSkillAdapter({
          hasNativeGsdShip: false,
          hasUpstreamWorkflow: false,
        }),
      (err) => err instanceof ComponentPlanError && err.code === "plan-incomplete"
    );

    // Pi bridge
    const activeBridge = evaluatePiBridgeAdapter({ nativeMcpProven: false });
    assert.equal(activeBridge.status, "active");

    const retiredBridge = evaluatePiBridgeAdapter({
      nativeMcpProven: true,
      verifiedRelease: "0.4.0",
    });
    assert.equal(retiredBridge.status, "retired");

    // Codex stop hook
    const purePassed = evaluateCodexStopHookAdapter({
      pureUpstreamPassed: true,
      missingHelpers: [],
      verifiedRelease: "2.1.0",
    });
    assert.equal(purePassed.status, "retired");
    assert.equal(purePassed.resolution, "resolved-upstream");

    const missingHelpers = evaluateCodexStopHookAdapter({
      pureUpstreamPassed: false,
      missingHelpers: ["hook-exit.js"],
    });
    assert.equal(missingHelpers.status, "active");
    assert.equal(missingHelpers.resolution, "applied");
  });
});
