---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 20
subsystem: capability-canary
tags: [canary, codex, research-routing, fail-closed, capa-02]

requires:
  - phase: 03-18
    provides: "Fail-closed argument matching, durable audited invocationEvidence, and persistent LocalAppData proof closure"
provides:
  - "Active Codex declarations for RESEARCH_MULTI_SOURCE and ORDINARY_LOOKUP_CONTROL in catalog/canaries.yaml while retaining Claude compatibility"
  - "policy.canaryHarness: codex active anchor designation in catalog/stack.yaml"
  - "CANARY_INSTRUCTION_ROOT.codex implementation mapping to .agents/skills for isolated runtime steering materialization"
  - "Offline test suite validating fail-closed ordered matching, fan-out limits, forbidden tools, and single-server bounds for Codex"
  - "Opt-in live canary test structure for Codex research canaries"
affects: [phase-03-verification, capability-ledger, doctor-canary]

actuals:
  tokens: 28000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Active non-Claude research canaries are anchored by Codex under D-17"
    - "Canary runtime materializes owned steering instructions into Codex .agents/skills without touching user configuration"
    - "Multi-source research validates ordered Exa discovery -> Firecrawl extraction within max 2 servers; ordinary lookup enforces max 1 server"

key-files:
  created:
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/03-20-SUMMARY.md
  modified:
    - catalog/canaries.yaml
    - catalog/stack.yaml
    - src/core/canary.ts
    - test/canary.test.ts
    - test/catalog.test.ts

key-decisions:
  - "Under D-17, Codex replaces Claude as policy.canaryHarness and the active anchor for CAPA-02 research routing."
  - "CANARY_INSTRUCTION_ROOT.codex maps to .agents/skills inside isolated canary runtimes so alpha-aos-research-routing is available during canary execution."
  - "Existing Claude compatibility declarations in catalog/canaries.yaml and schemas remain untouched."

requirements-completed: [CAPA-02]

coverage:
  - id: G-03-1
    description: "Active non-Claude (Codex) multi-source research routing and ordinary lookup control."
    requirement: CAPA-02
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the shipped research canary and ordinary lookup control declare Codex legs while retaining Claude"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#catalog/stack.yaml declares policy.canaryHarness as codex under D-17"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the canary runtime for codex carries the alpha-AOS-owned routing instruction under .agents/skills"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#Codex CAPA-02 multi-source research strict matrix verifies ordered Exa -> Firecrawl matching and fail-closed controls"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#Codex ORDINARY_LOOKUP_CONTROL fan-out negative control enforces max 1 research server"
        status: pass
      - kind: integration
        ref: "npm test"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-17
---

# Plan 03-20 Summary: Active Codex CAPA-02 Multi-Source Research Routing & Ordinary Lookup Control

## What Was Done
1. **Catalog Declarations & Stack Policy (`catalog/canaries.yaml`, `catalog/stack.yaml`):**
   - Added `codex` to `harnesses` in `RESEARCH_MULTI_SOURCE` and `ORDINARY_LOOKUP_CONTROL` in `catalog/canaries.yaml`, retaining existing `claude` declarations for backward compatibility.
   - Updated `policy.canaryHarness` in `catalog/stack.yaml` from `claude` to `codex` per decision D-17.
2. **Codex Canary Runtime Steering Materialization (`src/core/canary.ts`):**
   - Implemented `CANARY_INSTRUCTION_ROOT.codex` to return `(harnessRoot: string) => join(harnessRoot, ".agents", "skills")`.
   - Verified that `createCanaryRuntime` for `codex` copies `alpha-aos-research-routing/SKILL.md` into `<runtimeRoot>/codex/.agents/skills/alpha-aos-research-routing/SKILL.md` under a journaled transaction.
3. **Fail-Closed Validation & Strict Matrix Coverage (`test/canary.test.ts`, `test/catalog.test.ts`):**
   - Added unit test asserting `RESEARCH_MULTI_SOURCE` and `ORDINARY_LOOKUP_CONTROL` declare both `codex` and `claude`.
   - Added unit test asserting `catalog/stack.yaml` declares `policy.canaryHarness: codex`.
   - Updated install plan canary note expectation in `test/catalog.test.ts` for `gsd:codex` ("canary first").
   - Added test proving isolated Codex runtime carries `alpha-aos-research-routing` under `.agents/skills`.
   - Added strict matrix unit test for Codex `RESEARCH_MULTI_SOURCE`:
     - Positive: ordered `web_search_exa` (exa) -> `firecrawl_scrape` (firecrawl) across 2 servers passes with `nativeUse="invoked"`.
     - Reversed order failure: `firecrawl_scrape` before `web_search_exa` fails closed with `ordered=false`, `nativeUse="unverified"`.
     - Forbidden tool failure: presence of `firecrawl_search` fails closed with `forbiddenSeen=["firecrawl_search"]`.
     - Excessive servers failure: spanning 3 distinct servers fails closed with `withinServerBudget=false`.
     - Incomplete route failure: discovery only without extraction fails closed with missing `firecrawl_scrape`.
   - Added test for Codex `ORDINARY_LOOKUP_CONTROL`:
     - 0 or 1 research server passes (`withinServerBudget=true`).
     - 2 research servers fails closed (`withinServerBudget=false`).
   - Added opt-in live test structure for Codex CAPA-02 canaries gated behind `$env:ALPHA_AOS_LIVE_CANARY === '1'` and `codex login status`.
4. **Verification:**
   - Ran `npm test`: all 771 tests executed, 763 passed, 8 skipped, 0 failed.
