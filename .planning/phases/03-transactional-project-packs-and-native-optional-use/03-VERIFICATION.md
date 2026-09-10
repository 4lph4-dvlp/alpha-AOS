---
phase: 03-transactional-project-packs-and-native-optional-use
verified: 2026-09-10T23:25:42Z
status: gaps_found
score: 1/5 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-01-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-01-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-02-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-02-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-03-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-03-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-04-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-04-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-05-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-05-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-06-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-06-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-07-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-07-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-08-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-08-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-09-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-09-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-10-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-10-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-11-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-11-SUMMARY.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-12-PLAN.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-12-SUMMARY.md"
  - "catalog/canaries.yaml"
  - "schemas/canary-catalog.schema.json"
  - "schemas/capability-ledger.schema.json"
  - "schemas/pack-catalog.schema.json"
  - "schemas/receipt.schema.json"
  - "skills/alpha-aos-research-routing/SKILL.md"
  - "src/adapters/capability-oracle.ts"
  - "src/adapters/isolation.ts"
  - "src/adapters/unified-memory.ts"
  - "src/cli.ts"
  - "src/core/canary.ts"
  - "src/core/capability-ledger.ts"
  - "src/core/mcp-proxy.ts"
  - "src/core/project-pack-sync.ts"
  - "src/core/project-plan.ts"
  - "src/core/validation.ts"
  - "src/format.ts"
  - "src/types.ts"
  - "test/canary.test.ts"
  - "test/capability-ledger.test.ts"
  - "test/capability-oracle.test.ts"
  - "test/helpers/oracle-fixtures.ts"
  - "test/helpers/pack-fixtures.ts"
  - "test/mcp-proxy.test.ts"
  - "test/pack-catalog.test.ts"
  - "test/project-pack-sync.test.ts"
  - "test/project-plan.test.ts"
covered_digest: "v1:sha256:2b25f69ea3c71346852e10da3fa73b9ff2099d52d7ef4fcea0490bf9bb03cbd9"
behavior_unverified: 4
overrides_applied: 0
gaps:
  - truth: "REQUIREMENTS.md records CAPA-05 as Complete, but its second clause — `can exercise it through a representative intent-matched task` — has no evidence anywhere in the repository, and the plan that marked it says so itself."
    status: failed
    reason: >-
      Commit 0012e34 (`docs(03-11)`) flipped CAPA-05 from `[ ]` to `[x]` and the traceability
      table from Pending to Complete. The same plan's own 03-11-SUMMARY.md records the opposite:
      the claude leg "costs money and was not run", and the exercise clause "must be raised with
      the developer, not closed by a verifier". No ledger row anywhere on this host carries
      `nativeUse: invoked` for any capability. This is a false claim inside the requirements
      ledger, in a project whose PROJECT.md Validation constraint exists specifically to forbid
      claiming a capability is proven on presence alone. It is also the one item on this list a
      human can close without spending anything.
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "Line 40 reads `- [x] **CAPA-05**` and line 145 reads `| CAPA-05 | Phase 3 | Complete |`, while the invocation clause is unevidenced."
    missing:
      - "Revert CAPA-05 to `- [ ]` and `Pending`, OR split CAPA-05 into the provenance clause (proven) and the exercise clause (unproven) so the checkbox describes something that is actually true."
      - "Apply the same audit to CAPA-06: its `cannot discover` half is proven live, its `or invoke` half is inferred from the discovery negative rather than observed. The inference is sound (a skill never loaded cannot be invoked) and is accepted here, but it should be recorded as an inference rather than left implicit."
deferred: []
behavior_unverified_items:
  - truth: "On every claimed harness surface, a version-sensitive documentation request can natively select the global documentation capability without naming it and complete a meaningful read-only Context7 call. (SC1 / CAPA-01)"
    test: "Run `node dist/src/cli.js doctor --canary . --json` (it prints its cost before spending; ~$0.13/run per 03-RESEARCH.md Pitfall 10). Confirm the DOCUMENTATION_VERSION_SCOPED row records `nativeUse: invoked` with an ordered `resolve-library-id` -> `query-docs` observation whose `libraryId` matches `^/[^/]+/[^/]+/[^/]+$`."
    expected: "A ledger row for CAPA-01 with nativeUse=invoked and a three-segment (version-scoped) library identifier on the second call."
    why_human: "Requires spending the user's money on a model turn. No executor spent it; the machinery cannot self-certify that a MODEL made the selection, which is the whole of the requirement."
  - truth: "A multi-source research request can natively route through Exa discovery and bounded Firecrawl extraction without naming either tool, while an ordinary lookup does not fan out across the research stack. (SC2 / CAPA-02)"
    test: "Same command. Confirm RESEARCH_MULTI_SOURCE records an ordered `web_search_exa` -> `firecrawl_scrape` sequence across exactly two distinct servers, and ORDINARY_LOOKUP_CONTROL records at most one distinct research server."
    expected: "Two ledger rows: the positive with nativeUse=invoked and an ordered two-server sequence, and the negative control touching <=1 server."
    why_human: "Requires a paid model turn. Additionally a human should judge the scope caveat below (Finding I-2): the canary runtime carries an alpha-AOS-authored routing instruction and its own CLAUDE_CONFIG_DIR, so a pass proves routing inside the canary runtime, not inside the user's everyday configuration."
  - truth: "User can explicitly hand work between supported harnesses through Unified Memory while `.planning/` and repository-governed decisions remain unchanged and authoritative only through GSD. (SC3 / CAPA-03)"
    test: "Run `node dist/src/cli.js doctor --canary . --capability handoff --json` (the spending form; the free form `--no-spend` already passes and is reproduced below). Confirm the receiving harness actually works from the handed-off context rather than from general knowledge that happens to agree."
    expected: "A COMPLETE CAPA-03 unit whose positive half includes a receiving-harness run that demonstrably consulted the handoff."
    why_human: "The immutability half IS proven live and is not in question. The receiving leg needs a paid model turn, and whether the receiving harness genuinely worked FROM the handed-off context is a judgement no test can make — a vault recall is not an MCP tool call, so the observation front cannot see one."
  - truth: "User can preview and apply an evidence-matched, exact-hash pack inside one selected project, see project-local provenance in the target harness, and exercise it with a representative intent-matched task. (SC4 / CAPA-05)"
    test: "On a project where a pack is materialized, run `node dist/src/cli.js doctor --canary . --json` and read the PACK_EXERCISE_FRONTEND_A11Y result. Judge from the harness's own event stream whether the pack skill was SELECTED by the model without being named."
    expected: "Evidence that the harness selected the materialized pack skill from an ordinary accessibility complaint that names neither the skill nor the subject."
    why_human: "Two reasons, and the second is structural. (1) It needs a paid model turn. (2) The canary declares `expectTools: []` on purpose — a pack skill is not an MCP tool, so this phase's MCP-side observation mechanism CANNOT see one being followed. Selection must be read from the harness's own event stream and judged, so this clause is outside the phase's automated evidence mechanism by construction, not merely unrun."
coincidental_reliance_items: []
---

# Phase 3: Transactional Project Packs and Native Optional Use — Verification Report

**Phase Goal:** Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Verified:** 2026-09-10T23:25:42Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Executive Summary

This phase built a large amount of high-quality, genuinely verified machinery, and then
stopped one command short of the proof it exists to produce.

Everything that can be proven for free is proven, live, with unusually strong tests: the
transactional writer, the rollback, the exact-hash materialization, the provenance sidecar,
the paired inside/outside discovery negative, the three-axis capability state, the six-domain
pack fixtures, and the `.planning/` immutability witness. I re-ran the build (exit 0) and the
full suite (700 tests / 694 pass / 0 fail / 6 pre-existing platform skips) and independently
executed the free CLI paths myself rather than reading the SUMMARYs' claims.

What is not proven is the half the phase goal names first: **native selection and
representative use**. No paid canary has ever run. The host capability ledger contains eight
proofs and every single one reads `nativeUse: unverified`; there is not one `discovered` row
and not one `invoked` row, and `claude` — the harness `catalog/stack.yaml` names as
`policy.canaryHarness` and 03-CONTEXT.md D-09 sets as the phase pass bar — has no row at all.

The executors were right to refuse to spend the user's money unasked, and right to record
`unverified`/not-attempted rather than `blocked` (D-12 applied correctly: the preconditions
are met, so nothing is blocking). Their SUMMARYs are among the most honest I have read.

The one thing that is wrong is that `REQUIREMENTS.md` nevertheless marks **CAPA-05 Complete**,
contradicting the very plan that marked it. That is the gap below.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On every claimed harness surface, a version-sensitive documentation request can natively select the global documentation capability without naming it and complete a meaningful read-only Context7 call. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Machinery present and wired and independently confirmed: `catalog/canaries.yaml` declares `DOCUMENTATION_VERSION_SCOPED` with an ordered `resolve-library-id` -> `query-docs` expectation and a version-scoping argument pattern; the observation front works against the real pinned server (`the context7 proxy starts and lists exactly its two tools` PASSED live, 7.1s, against `tools/list`, not a document). **No call was ever made.** Host ledger holds zero CAPA-01 rows. `nativeUse` has never left `unverified` on this host. See Human Verification 1. |
| 2 | A multi-source research request can natively route through Exa discovery and bounded Firecrawl extraction without naming either tool, while an ordinary lookup does not fan out across the research stack. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Ordered-sequence matcher and fan-out counter exist and are tested non-vacuously (`expectations are matched as an ordered sequence, so extraction-before-discovery is a different verdict from discovery-then-extraction` PASSED). Both upstream servers answer live (`the exa proxy starts…`, `the firecrawl proxy starts and lists its allowlisted tools` PASSED — the latter is the Pitfall 8 regression). **No routing run happened.** Plus the scope caveat in Finding I-2. See Human Verification 2. |
| 3 | User can explicitly hand work between supported harnesses through Unified Memory while `.planning/` and repository-governed decisions remain unchanged and authoritative only through GSD. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The immutability half is fully proven, live, on this repository's own 153-file `.planning/` tree, and — critically — the negative is proven **capable of failing**: `a planning file that moves during the handoff makes the negative fail and the unit INCOMPLETE, naming the file` PASSED. `a vault that gained TWO memories yields no positive: the claim is exactly one, not at least one` PASSED. The handoff is **attributed, not driven** (`ecc memory handoff --from <source>`), and the receiving leg was never run. See Human Verification 3. |
| 4 | User can preview and apply an evidence-matched, exact-hash pack inside one selected project, see project-local provenance in the target harness, and exercise it with a representative intent-matched task. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Three of four clauses VERIFIED live.** Preview/apply: `one approved pack's SKILL.md and its receipt both land, written by one transaction`, `a second sync … is already-current, with one receipt per pack`, `a sync with no approved artifact refuses with a paste-ready approve command`, `a sync whose bound inputs moved refuses, naming the drift kind and both digests` all PASSED. Exact-hash: `a materialized skill file hashes to its locked source hash with a sidecar beside it` PASSED. Provenance: `applying a pack writes a provenance sidecar on every tolerance-proven surface, in the same transaction` and `the status report lists every target with its harness, its receipt claim and its sidecar state` PASSED. **The fourth clause — exercise with a representative task — has no evidence and is outside this phase's mechanism by construction** (`expectTools: []`; a pack skill is not an MCP tool). See Human Verification 4 and Gap G-1. |
| 5 | The same capability is unavailable outside that project; status distinguishes selected, deployed, discovered, invoked, blocked, stale, unsupported, and unverified states across representative web, API/data, infrastructure, agent/AI, security, and scientific packs without global profile installation. | ✓ VERIFIED | All three sub-clauses hold. **Unavailable outside:** `the materialized pack is discovered inside the project and not in a constructed control directory` PASSED — a genuinely live paired oracle run whose strongest assertion is `positiveCount - negativeCount === 1`, which simultaneously proves project-scoping AND that the sidecar was not miscounted as a skill; plus an ancestor-freedom walk to the filesystem root and an independent trust-withheld negative for pi. **Eight states:** `CapabilityState` in `src/types.ts` makes deployment/nativeUse/support three required fields of one record (no consumer can get one without all three); `SURFACE_CEILING` bounds the ledger; `BLOCKED <code> <var> — <next action>` and `SUPPORT-CEILING` render on their own lines; one-shot renders `invoked` with an offer and deletes nothing. **Six domains:** six positive fixtures with exact-set `deepEqual` selection, six near-miss twins each naming the unsatisfied leaf, and a concurrency test proving two fixtures in one process do not borrow each other's selection. All PASSED. |

**Score:** 1/5 truths verified (4 present, behavior-unverified)

The score is not a statement that the code is broken. It is a statement that four of the five
criteria contain a clause about what a model actually did at runtime, and that no model turn
was ever spent. Read the evidence column, not the number.

### Advisory (New Scope, Unevidenced)

Not applicable — this is an initial verification, not a re-verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/project-pack-sync.ts` | The missing writer: plan/apply + sidecar | ✓ VERIFIED | Exists, substantive, wired to `applyFileTransaction` and to `src/cli.ts`. All 5 declared exports present. |
| `src/core/mcp-proxy.ts` | Environment repair, observe/filter split, sink | ✓ VERIFIED | 3 declared exports present; wired to `paths.ts` and `process.ts`; three live server startups pass. |
| `src/core/capability-ledger.ts` | Read/write, three axes, demotion, paired unit | ✓ VERIFIED | All 6 declared exports present; wired to `validation.ts` and `transaction.ts`. Live ledger file confirmed on host. |
| `schemas/capability-ledger.schema.json` | Closed-world envelope | ✓ VERIFIED | Closed (`every object level must be closed` PASSED); registered in all three validation tables. |
| `src/adapters/capability-oracle.ts` | Per-harness oracles, parsers, paired run | ✓ VERIFIED | All 7 declared exports present; wired to `process.ts` and `pairEvidence`. |
| `test/helpers/oracle-fixtures.ts` | Recorded oracle output for offline parsing | ✓ VERIFIED | Real recorded harness output (codex prompt-input, pi RPC, claude init), third-party prompt text elided rather than reproduced. |
| `catalog/canaries.yaml` | Declared, schema-validated prompts | ✓ VERIFIED | 5 canaries. Read end to end: no prompt names a skill, a server or a tool. Header records the 03-07 `narrow` decision and the `ECC_RESEARCH_ROUTING_CONTRACT_MISMATCH` finding. |
| `schemas/canary-catalog.schema.json` | Closed contract | ✓ VERIFIED | Closed-world (`these object nodes are open worlds` assertion PASSED with an empty result). |
| `src/core/canary.ts` | Catalog load, readiness, runtime, matcher, handoff | ✓ VERIFIED | All 10 declared exports across plans 05/06/08/12 present and wired. |
| `src/types.ts` | Composite `CapabilityState` | ✓ VERIFIED | Three axes are required fields, with both reasons. |
| `src/core/project-plan.ts` | Ceiling, resolver, native-use axis, one-shot | ✓ VERIFIED | `SURFACE_CEILING`, `classifyAdapterSupport`, `resolveCapabilityState`, `planOneShotOffer`, `assertPackSourceShape` all present. Ceiling entries carry documented evidence and exact versions. |
| `schemas/pack-catalog.schema.json` | `one-shot-remove-after-output` gets a home | ✓ VERIFIED | `the pack catalog schema admits the declared one-shot lifecycle and refuses an undeclared one` PASSED. |
| `test/helpers/pack-fixtures.ts` | Six-domain scaffold + near-miss twins | ✓ VERIFIED | 438 lines, six domains, structural one-edit property for each twin. |
| `src/format.ts` | Provenance + composite-state rendering | ✓ VERIFIED | `CAPABILITY … deployment=/native-use=/support=`, `BLOCKED`, `SUPPORT-CEILING`, sidecar states. |
| `src/adapters/unified-memory.ts` | Bounded vault access | ✓ VERIFIED | All 4 declared exports present; travels `runProcess`; `the memory adapter makes no direct child-process call` PASSED. |
| `skills/alpha-aos-research-routing/SKILL.md` | 03-07 reconciliation, allowlist NOT widened | ⚠️ SCOPED (see I-2) | File exists (3554 bytes) and is referenced by `RESEARCH_ROUTING_INSTRUCTION_SOURCE`. Firecrawl allowlist confirmed still four tools. But it materializes only into the canary runtime, never into the user's everyday configuration. |
| `.planning/REQUIREMENTS.md` | Accurate traceability | ✗ INACCURATE | CAPA-05 marked Complete against its own plan's summary. See Gap G-1. |

`gsd-tools query verify.artifacts` reports **all_passed: true** for all 12 plans (30/30 artifacts).

### Key Link Verification

`gsd-tools query verify.key-links` reports **24/24 links verified** across the 11 plans that
declare links (03-07 declares none, being a decision-only plan). Spot-checked beyond grep:

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/core/project-pack-sync.ts` | `src/core/transaction.ts` | one `applyFileTransaction` carrying skill + receipt + sidecar | ✓ WIRED | Proven behaviourally: `no interruption can commit skill bytes without the receipt that claims them` PASSED. |
| `src/cli.ts` | `src/core/project-pack-sync.ts` | the `sync --apply` branch that replaced the stub throw | ✓ WIRED | The Phase-2 stub throw is gone; `project sync --apply` refuses with a paste-ready approve command instead. |
| `src/core/project-plan.ts` | `src/core/capability-ledger.ts` | resolver reads the ledger bounded by the ceiling | ✓ WIRED | `ledgerHostEvidence` distinguishes absent from REFUSED and the reason reaches `nativeUseReason`. |
| `src/core/canary.ts` | `src/core/mcp-proxy.ts` | runtime MCP config points servers at `mcp-proxy` in observe mode | ✓ WIRED | `createCanaryRuntime` constructs it; never exercised end-to-end by a real model turn. |
| `src/adapters/capability-oracle.ts` | `src/core/process.ts` | bounded, shell-free, declared environment; cwd is the pos/neg switch | ✓ WIRED | Confirmed live: I ran `doctor --discovery` and the recorded oracle command is identical for positive and negative, differing only in cwd. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `doctor --discovery --json` | `sweeps[].entries[].discovery` | live `codex debug prompt-input` / `pi --mode rpc` subprocesses | Yes — I executed it | ✓ FLOWING |
| `doctor --discovery --json` | `sweeps[].entries[].unit` | redundant alias of `discovery.unit` | Renders `"[redacted:cycle]"` | ⚠️ STATIC (known, recorded in `deferred-items.md`, no data missing) |
| `project status` | `reconciliation.artifactState` | `readApprovedProjectPlan` -> closed schema | Yes — printed `none (absent)`, distinct from `unreadable` | ✓ FLOWING |
| `capability ledger` | `proofs[].nativeUse` | `capability-oracle.ts:1024` (discovered/unverified), `canary.ts:1908` (invoked) | Production writers exist and are wired; on this host every row reads `unverified` because no pack is materialized here and no canary ran | ✓ FLOWING (mechanism), ⚠️ never exercised to `invoked` |
| `src/format.ts` capability line | `axes.nativeUse` | `resolveCapabilityState` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks (run by me, not read from a SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build is green | `npm run build` | exit 0; 76 inputs, 146 outputs | ✓ PASS |
| Full suite is green | `npm test` | exit 0; **tests 700, pass 694, fail 0, skipped 6** (190.4s) | ✓ PASS |
| The 6 skips are pre-existing platform limits, not phase-3 escapes | grep of skip lines | All 6 are `path-boundary` / `evidence` Windows symlink & POSIX-mode fixtures | ✓ PASS |
| Network-dependent tests actually RAN | grep of `proxy starts and lists` | context7 ✔ 7.1s, exa ✔ 5.1s, firecrawl ✔ 6.6s — none skipped | ✓ PASS |
| Free discovery works end to end | `ALPHA_AOS_STATE_DIR=<temp> node dist/src/cli.js doctor --discovery . --json` | exit 0; 2 sweeps, 8 entries, 8 ledger rows written | ✓ PASS |
| Free discovery is honest about what it did not do | same output | claude/hermes `ran:false` with a named `skippedReason`; `costsModelTurn:false` | ✓ PASS |
| Nothing on this host has ever been invoked | `node -e` over `~/.alpha-aos/capabilities/ledger.json` | 8 proofs, `distinct nativeUse: ['unverified']`, string `"invoked"` absent from the file | ✓ PASS (and is the central finding) |
| `project status` is read-only and distinguishes absent | `node dist/src/cli.js project status .` | exit 0; `Approved plan: none (absent)`; closes with "Read only. `project status` deletes nothing." | ✓ PASS |
| Deferred item reproduces exactly as recorded | inspection of `sweeps[0].entries[1]` | `unit: "[redacted:cycle]"` while `discovery` holds the full unit | ✓ PASS (confirms the record is accurate) |
| Bounded-extraction claim unchanged (03-07 `narrow`) | `PROJECT.md:21`, `README.md:5,113` | All three still read "four-tool Firecrawl"; allowlist still exactly 4 tools | ✓ PASS |
| Paid canary | not run | — | ? SKIP — spends the user's money; routed to Human Verification |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist in this repository and no plan declares one. This project's
equivalent is the `node:test` suite plus the CLI verbs, both of which I executed directly above.

**Step 7c: SKIPPED (no probe scripts declared or conventional in this repository).**

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| CAPA-01 | 03-02, 03-08 | ? NEEDS HUMAN | Machinery verified live; invocation never attempted. `REQUIREMENTS.md` correctly records **Pending**. Honest. |
| CAPA-02 | 03-02, 03-07, 03-08 | ? NEEDS HUMAN | Same, plus the 03-07 `narrow` reconciliation is genuinely implemented (allowlist not widened, stable finding code). Correctly **Pending**. |
| CAPA-03 | 03-12 | ? NEEDS HUMAN | Immutability clause proven live with a failure-capable negative; receiving leg unproven. Correctly **Pending**. |
| CAPA-04 | 03-01 | ✓ SATISFIED | Writer, one transaction, rollback-to-zero-receipts, idempotency, both refusals — all proven by live tests over real temporary files. |
| CAPA-05 | 03-04, 03-05, 03-06, 03-11 | ✗ **OVERCLAIMED** | Provenance clause satisfied and proven live. Exercise clause has no evidence, yet `REQUIREMENTS.md` marks it **Complete**. See Gap G-1. |
| CAPA-06 | 03-03, 03-04, 03-11 | ✓ SATISFIED (with a recorded inference) | `cannot discover` proven live by the paired oracle. `or invoke` is inferred from it — sound, since a skill the harness never loads cannot be invoked — but the inference is implicit rather than recorded. |
| CAPA-07 | 03-03, 03-05, 03-06, 03-09 | ✓ SATISFIED | Three orthogonal axes in one composite record; ceiling never raised by the ledger; `blocked` vs `unverified` split verified by dedicated tests and reproduced live. |
| CAPA-08 | 03-10 | ✓ SATISFIED | Six domains, six near-miss twins, exact-set selection, generic-instructions rule, concurrency isolation, one-file pack guard. |

**Orphaned requirements:** none. All eight IDs mapped to Phase 3 in `REQUIREMENTS.md` are claimed
by at least one plan's `requirements` frontmatter, and no plan claims an ID outside the eight.

### Prohibitions (must-NOT checks)

All 8 declared prohibitions across plans 01/03/04/05/09 are `verification: judgment`. Per the
judgment-tier rule these are recorded as a NON-AUTHORITATIVE verdict and flagged for human
review; none is silently passed.

| # | Plan | Prohibition | Judge verdict (non-authoritative) | Basis |
|---|------|-------------|-----------------------------------|-------|
| P-1 | 03-01 | MUST NOT write any project path the approved artifact did not name | Appears held | `packSyncAllowedRoots` + `applyFileTransaction` explicit allowed roots; `a transaction refuses a write whose canonical path escapes` PASSED. |
| P-2 | 03-03 | MUST NOT render an unpaired positive as a pass | Appears held | `an unpaired positive resolves INCOMPLETE and its summary never prints the positive axis` PASSED; `format.ts:635` renders INCOMPLETE as `withheld`. |
| P-3 | 03-04 | MUST NOT record a discovery-oracle result as invocation evidence | Appears held | `DiscoveryAxis = "discovered" | "unverified"` — the type makes `invoked` unreachable from the oracle path. Structural, not merely asserted. |
| P-4 | 03-05 | MUST NOT reword or hint at the skill/tool in a canary prompt to make it pass | Appears held | I read all five prompts. None names a skill, server or tool. `loadCanaryCatalog` refuses a prompt naming an expected tool; the pack-exercise test additionally forbids `a11y`, `accessib`, `skill`. |
| P-5 | 03-05 | MUST NOT print/store/fingerprint a credential VALUE | Appears held | `a credential VALUE reached the rendered canary runtime configuration` sentinel test PASSED; `an envelope carrying a raw credential is refused` PASSED; live output showed `[redacted:secret:…]` for a temp path segment. |
| P-6 | 03-09 | MUST NOT let one-shot invoked cause/schedule/auto-trigger a deletion | Appears held | `the one-shot reporting path calls no removal and leaves the project tree byte-unchanged` and `the one-shot offer states what is ready and never implies anything was deleted` both PASSED. |
| P-7 | 03-09 | MUST NOT record a support classification contradicted by the harness's own documented behaviour | Appears held | `SURFACE_CEILING` reasons carry exact versions and probed evidence; the hermes entry explicitly says the catalog's own `gsdStrategy` "is NOT the ground" and names the contradicting `skills trust` help text. |
| P-8 | 03-01/03-11 | MUST NOT modify third-party `SKILL.md` bytes | Appears held | `a materialized skill file hashes to its locked source hash with a sidecar beside it` PASSED — a hash equality, not a claim. |

Human review recommended on all eight — `unverified-prohibition — human review recommended`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` / `FIXME` / `XXX` | — | **Zero found** across all 29 phase-modified source, schema, catalog and test files. |
| — | — | `TODO` / `HACK` / `PLACEHOLDER` | — | **Zero found.** The `placeholder` string hits are `ORACLE_PLACEHOLDER_PROMPT`, a deliberate, load-bearing oracle argument asserted by name in tests. |
| `src/core/canary.ts` | 3405 | `unsupportedReason` is populated on rows whose `support` axis reads `supported` | ℹ Info | Field is documented as "Why nothing ran at all. Null when something did." The doc-comment is accurate; the NAME is misleading for a JSON consumer. See Finding I-1. |
| `src/core/canary.ts` | 1444-1449 | Owned routing instruction materializes only into the canary runtime | ℹ Info | Scope caveat on any future CAPA-02 proof. See Finding I-2. |

**Verdict on the orchestrator's four independent-check requests:**

1. **Unspent canary / `unverified` vs `blocked`.** Confirmed correct and confirmed load-bearing.
   D-12 is applied literally in code (`probeReadiness` runs BEFORE the canary, so the split is
   derived from a pre-probe, not parsed out of a failure) and in the artifacts. I verified the
   ledger myself: 8 rows, all `unverified`, zero `blocked`, and `"invoked"` does not appear
   anywhere in the file. Nothing overclaims. But the criteria's invocation clauses are
   genuinely unmet — an unspent canary cannot satisfy them, and I have not pretended otherwise.
2. **Vacuous-assertion sweep.** I sampled ~40 assertions across the five phase test files,
   concentrating on the negatives, which is where vacuity hides. **I found no remaining vacuous
   assertion.** The codebase is unusually self-aware about this: it contains explicit
   anti-vacuity guards that assert their own precondition first — e.g.
   `"no sidecar was planned into codex's skill root, so the tolerance assertion would be vacuous"`,
   `"the fixture wrote no sidecar, so the tolerance assertion below proves nothing"`,
   `"no free oracle ran at all, so this proves nothing about the free half"`, and
   `"the sentinel is declared, so the assertion below is vacuous"`. Negatives are paired with
   companion positives (`inside.skills.length > outside.skills.length`; exact counts 46 vs 44),
   and the strongest single assertion in the phase — `positiveCount - negativeCount === 1` —
   cannot pass vacuously in either direction. The weakest one I found is
   `capability-oracle.test.ts:410` (`findings.filter(includes("MCP")) === []`), which would
   hold if `findings` were always empty; it is guarded in practice by the exact-count
   assertions immediately above it. Not a gap; worth knowing.
3. **`absent` vs `unreadable` across ALL layers.** Checked at five layers, not two. Reader
   (`readApprovedProjectPlan`, `readCapabilityLedger`), reconciliation (`ApprovedArtifactState`
   is a four-value union with `artifactIssues` non-empty *exactly when* unreadable), bridge
   (`ledgerHostEvidence` emits "exists and was REFUSED … this is not the same as nothing having
   been proven here"), rendering (`UNREADABLE-APPROVAL` line; `format.ts:587` prints
   `unreadable` vs `absent` per target), and sidecar (five values, with `missing` and `modified`
   deliberately kept apart). Test coverage exists at each: `every poisoned artifact shape is
   reported unreadable rather than absent`, `a ledger with an unknown top-level property reads
   unreadable, never absent`, `a ledger whose file is a directory reads unreadable carrying the
   errno`, `a receipts-only surface renders its reason rather than a blank sidecar state`.
   Commit `f646d1e fix(03-09): stop a refused ledger reading like one that was never written`
   is the recurrence fix. **No further collapse found.**
4. **Network-dependent tests.** They do not weaken the suite's determinism materially and they
   fail closed. The skip is gated on a `REGISTRY_UNREACHABLE` regex over captured upstream
   stderr; **every other failure throws** with the package, version and stderr excerpt. They
   assert the tool SET, not a count. On this host all three RAN and PASSED (they are not among
   the 6 skips). Disclosure is adequate — the skip carries `unsupported: <reason>` and the
   reason names the package. Residual risk: an air-gapped CI silently loses the Pitfall 8
   firecrawl regression. Worth a CI-side assertion that these three did not skip; recorded as
   an observation, not a gap.

### Human Verification Required

See the four `behavior_unverified_items` in the frontmatter, reproduced here for the reader.

#### 1. CAPA-01 — the documentation invocation

**Test:** `node dist/src/cli.js doctor --canary . --json` (prints its cost first; ~$0.13/run).
**Expected:** A CAPA-01 ledger row with `nativeUse: invoked` and an ordered
`resolve-library-id` -> `query-docs` observation whose `libraryId` is three-segment.
**Why human:** Spends the user's money, and the machinery cannot self-certify that a *model*
made the selection — which is the whole requirement.

#### 2. CAPA-02 — the research routing, and its scope caveat

**Test:** Same command; read `RESEARCH_MULTI_SOURCE` and `ORDINARY_LOOKUP_CONTROL`.
**Expected:** Ordered `web_search_exa` -> `firecrawl_scrape` over exactly two distinct servers;
the control touching at most one.
**Why human:** Spends money — and additionally a human must decide whether Finding I-2 is
acceptable: the canary runtime carries an alpha-AOS-authored routing instruction *and its own
`CLAUDE_CONFIG_DIR`*, so a pass proves routing inside the canary runtime, not inside the user's
everyday configuration.

#### 3. CAPA-03 — the receiving leg

**Test:** `node dist/src/cli.js doctor --canary . --capability handoff --json` (the spending
form; `--no-spend` already passes).
**Expected:** The receiving harness demonstrably works FROM the handed-off context.
**Why human:** A vault recall is not an MCP tool call, so the observation front cannot see one.
Whether the receiving run genuinely used the handoff rather than agreeing by coincidence is a
judgement no test can make. The immutability half is NOT in question — it is proven.

#### 4. CAPA-05 — exercising the materialized pack

**Test:** On a project with a pack materialized, run `doctor --canary . --json` and read
`PACK_EXERCISE_FRONTEND_A11Y` from the harness's own event stream.
**Expected:** The harness selected the pack skill from a prompt naming neither it nor its subject.
**Why human:** Spends money, **and is structurally outside this phase's evidence mechanism** —
`expectTools: []` because a pack skill is not an MCP tool. This is disclosed in the catalog's own
`why` field rather than hidden, which is to the phase's credit, but it means the clause cannot be
closed by re-running anything.

### Gaps Summary

**G-1 (BLOCKER) — `REQUIREMENTS.md` claims CAPA-05 is Complete when its own plan says it is not.**

Commit `0012e34 docs(03-11)` flipped CAPA-05 from `- [ ]` to `- [x]` and its traceability row
from `Pending` to `Complete`. CAPA-05 reads, in full:

> User can see a synced project capability in the target harness with project-local provenance
> **and can exercise it through a representative intent-matched task**

The first clause is proven, live, and well. The second has no evidence anywhere in the
repository — and the *same plan's* `03-11-SUMMARY.md` says so twice: the claude leg "costs money
and was not run", and the exercise clause "must be raised with the developer, not closed by a
verifier". I independently confirmed the underlying fact: no ledger row on this host, in this
repository, or in any fixture-independent artifact carries `nativeUse: invoked`.

This matters more here than it would elsewhere. This project's `PROJECT.md` Validation
constraint exists precisely to forbid treating presence as proof, and `03-CONTEXT.md` frames the
phase as the one where `ADAPTER_SUPPORT_EVIDENCE` "stops being a table of promises". A `[x]`
against an unevidenced clause is that same failure one layer up, in the ledger that a milestone
audit will read. Left as-is, the milestone audit will report CAPA-05 satisfied.

It is also the only item on this report a human can close **without spending anything**: revert
the checkbox, or split CAPA-05 into its two clauses so the checkbox describes something true.

CAPA-01, CAPA-02 and CAPA-03 are correctly left `Pending` — that discipline was applied
everywhere except here, which is why this reads as a slip rather than a pattern.

**Everything else is not a gap.** The four unproven invocation clauses are not defects to plan
around; they are one deliberate, well-documented spending decision. They are recorded as
human-verification items, with the exact commands, so that whoever spends the ~$0.35 closes
four criteria in one sitting rather than commissioning more code.

---

*Verified: 2026-09-10T23:25:42Z*
*Verifier: Claude (gsd-verifier)*
