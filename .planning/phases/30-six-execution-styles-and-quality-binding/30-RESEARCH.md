# Phase 30: Six Execution Styles and Quality Binding — Research

**Researched:** 2026-11-02 · **Source baseline:** `ff505f6c87bd6f3f4220f64d78832829842e4111`
**Mode:** Inline researcher, explicitly requested by the approved plan-step invocation. No external subagent process or independent researcher was used.
**Confidence:** High for repository/native workflow semantics; medium for new evidence normalization until execution captures actual host results.

## Summary

Keep the six canonical styles in `TASK_EXECUTION_STYLES`; project mode remains an intake policy. Add an execution description to the existing intake/handoff, derive autopilot labels from contract workflow/quality, and use existing readiness/bootstrap and runner services. Implement `scope.quickQuality?: "standard" | "full"` with absence and standard canonicalized identically. Include only full in canonical bytes. The existing digest algorithm, schemaVersion, legacy snapshots and revisions must remain unchanged.

Full requires an additional, independently evaluated evidence precondition. The existing quick verifier only proves PLAN, SUMMARY, a STATE row and docs commit. It cannot prove discussion, research, plan checking or goal verification. A worker-authored stage manifest or an appended `passed` marker would reproduce the defect. Native stage observations must come from retained runtime tool invocation/results tied to an exact session/run, with bounded provenance, input hashes and result hashes. Unsupported observations block full; they never become a standard run.

## Locked decisions and dependencies

All D-01–D-24 in `30-CONTEXT.md` are retained. Phase 27 policy freshness, Phase 28 explicit-command/style/task identity, and Phase 29 readiness/once-only handoff are prerequisites. Phase 29 STATE and verification record complete/passed; ROADMAP contains stale historical planning entries. Do not rewrite those historical records during Phase 30 planning. Phase 31 cross-harness aggregation, packed distribution and complete bilingual guidance remain deferred.

## R-01 — Real conversational routes

`src/core/task-intake.ts:24` defines the six styles and `TaskIntakeHandoff` carries selectedStyle, originalRequest and commandRoute. `task-intake-explicit.ts` preserves workflow and arguments; `task-bootstrap.ts` preserves selection through prepare/claim/link/acknowledge. These should feed a new `task-style.ts` projection consumed by public intake JSON/text and owned guidance, without another state store.

Proposed `TaskExecutionRoute` contains canonical style/label, surface (`conversation` or `isolated-runner`), workflow, arguments, quick quality when applicable, and authority requirements. Explicit command routes retain their actual command, target, arguments and stop boundary. Conversational phase uses native next/discuss/plan/execute progression as requested; a direct discuss-only call is not a complete phase command. This projection describes routing and always withholds execution authorization in the intake result.

## R-02 — Canonical quality compatibility

`task-contract.ts:577` constructs a fixed canonical view; `changedContractFields:670` uses a closed vocabulary; `contractFromView:719` reconstructs saved approvals for validation. Change all three together with the closed task-contract and approval/run schemas. Add full only via conditional property emission within scope. Normalize explicit standard to absence in the canonical view, not by editing the input contract or saved snapshot. `changedContractFields` compares effective standard/full and names `scope.quickQuality` on addition, removal or transition.

Allow quick quality only for development effective workflow gsd-quick (including its existing omitted-workflow default). Reject both standard and full on phase/general workflows and unknown values. Preserve all old phase/general bytes. Freeze golden canonical bytes/digests from pre-change fixtures and verify approval load/start/resume, not merely two calls to the new digest function. Existing schema v1 consumers reject full as an unknown field; do not add removeAdditional, useDefaults or implicit migration.

Ajv documentation confirms `useDefaults` and `removeAdditional` mutate validated input. Existing `src/core/validation.ts` uses Ajv2020; extend its schema, not its mutation policy. No dependency update is needed.

## R-03 — Dispatch and native capabilities

`task-gsd.ts:193` builds the quick prompt and currently hardcodes `$gsd-quick`. `task-run.ts:1476` authorizes start, assesses native role support and probes GSD before dispatch. `src/adapters/task-codex.ts:495` runs the approved controller and already consumes bounded native JSONL via `onStdoutChunk`; its normal event parsing recognizes terminal/usage evidence, not full-stage results. `task-native-sessions.ts` demonstrates exact session ancestry, bounded read-only session inspection and explicit unknown outcomes. Reuse those boundaries, never scan arbitrary conversations by cwd.

For full, dispatch native quick with `--full`, include workflow hash/runtime identity and required stages, and check an evidence adapter capability before launching. Preserve all three approved roles/models/efforts; the existing prompt's single-controller/executor wording must not authorize collapsing a distinct approved executor assignment. Unsupported model/role/stage-observation capability is a block with no paid probe, install, authentication or substitution.

Installed GSD identity was observed as `@opengsd/gsd-core 1.18.0`; the stable lock pins that version. Local `workflows/quick.md:1–15` defines full as discussion + research + plan checking + verification in addition to planning/implementation. `--validate` alone omits discussion/research. Step 4 honors `workflow.research_before_questions`; quick Step 6.25 adds code review when configured. Full does not suppress these active native gates.

## R-04 — Evidence contract and honest trust boundary

Native quick emits `<quick_id>-CONTEXT.md`, `-RESEARCH.md`, `-PLAN.md`, `-SUMMARY.md`, `-VERIFICATION.md`, STATE and docs commit. The plan-checker step returns `## VERIFICATION PASSED` or structured issues; it does not promise a PLAN-CHECK filename. Never require a fictional artifact.

Add `TaskGsdStageReceipt` and an evidence reader/normalizer in `task-gsd-stages.ts`, using existing private atomic storage/journaling patterns. Proposed fields: schemaVersion/kind, receiptId, contractDigest/revision/runId, canonicalProjectRoot, quickId, stage, quality, harness/session/runtimeVersion/workflowSha256, invocation/result locator and digest, outcome, evaluatedCommit, input artifact path/hash pairs, output artifact path/hash pairs, and observedAt. Seven mandatory categories: discussion, research, planning, plan-check, implementation, verification, state-docs. Add configured native gates (such as code review) to the required set from the installed workflow/config, rather than claiming seven stages are always exhaustive.

Bound normalized receipt bytes at 64 KiB, per-run receipts at 64, artifact references per receipt at 32, relative path length at 512 and detail at 1000 characters. Validate before parse/read, forbid links/escape/duplicates, keep raw transcripts outside project and reports, and retain only bounded redacted references and hashes. Test limits at N−1/N/N+1. IDs/revisions/hashes are exact strings/integers without floating-point normalization.

The producer is the runner's native observation adapter, not the executor claim or a worker-writable receipt file. Correlate a native invocation and its actual returned result by invocation ID and exact session lineage. Require the result's plan/implementation inputs to be proven by native tool arguments/results or read-only artifact observations at that stage. Post-hoc hashing cannot prove which plan the checker inspected. If a stream omits these links, return unsupported/unknown. A file containing a success marker, a claimed `--full`, terminal exit 0 or a self-reported stage JSON is never sufficient.

Codex is the initial concrete collector target because the repository already supports bounded JSONL/session ancestry. Capture actual available native tool events before writing parser expectations. Other harnesses continue through existing proven adapters; mark full-stage observation unsupported until their real events are normalized. Do not claim five-harness native parity. Native proof is a required later checkpoint inside this phase; missing receipt delivery remains a block, not a reason to weaken the acceptance gate.

## R-05 — Acceptance and recovery

`verifyGsdEvidence` remains the legacy standard check. Add full verification alongside it and feed both to `task-run.ts` preconditions, before accepted verdict. Extend optional report fields in `schemas/task-receipt.schema.json` and formatting, preserving old report reads. Stage receipts prove workflow execution; mandatory criterion measurements, effects audit, model/resource enforcement and fresh independent final review remain separate requirements.

Bind plan-check to the exact PLAN hash, final verification/review to implementation SHA/artifact digest, and all receipts to exact run/root/contract/quick/workflow. Same-run resume may reuse only revalidated stages. Plan edits invalidate checker and downstream results; implementation edits invalidate verification/review. A workflow hash change requires explicit revalidation and may block; do not rerun the entire quick by default.

Quick recovery currently refuses dirty baselines except multi-phase recovery (`task-run.ts:1549+`). Extend only exact prior-run full recovery: verify original baseline, retained quick identity, checkpoint, artifact/effects audit and hashes before continuing. Preserve partial summaries and dirty WIP. Reconcile uncertain delivery via exact native handles. Ambiguous evidence returns existing blocked/unknown/needs-input outcomes; never create a duplicate quick or change full to standard.

## R-06 — Approved phase scope

`task-gsd-lifecycle.ts:896` presently derives candidate phases from a live ROADMAP unless options.phases is passed. That mutable list is not sufficient approval evidence. Add optional `scope.phaseSelection` for phase workflows containing ordered phaseIds and roadmapSha256; include explicit selections in canonical digest and reapproval vocabulary. Legacy phase canonical bytes remain unchanged. For old approvals, resolve candidate selection from the already-approved git root baseline when possible, create a run-bound derived receipt without rewriting the contract, and recheck membership/order at each boundary. If the approved selection cannot be reconstructed unambiguously, require a concrete new preview/revision. Never treat the current roadmap as fresh authorization.

Bind each phase's starting source/artifact revisions in the existing lifecycle receipt/checkpoint. Continue pending plans and verified summaries via native discovery, preserving blocked-phase stop and final review. New live phases, reordered/deleted selected phases or changed binding require explicit scope resolution. No parallel phase registry or supervisor is needed.

## R-07 — Delivery and proof

Update only tracked owned skill source and its five render hashes in stable lock when guidance changes; use `owned-skills.ts` rendering and temporary target homes. Tests must compose public intake/bootstrap, preview/approve/start, real adapter event normalization and actual evidence verdict, not just inspect strings. Fixture proof is useful but separately labeled. A native checkpoint requires the three conversational workflows and three approved runner routes, including a genuine full-stage receipt chain on at least one supported host. Five-harness aggregate certification remains Phase 31.

## Validation Architecture

Use the existing Node test runner and helpers (`test/helpers/task-fixture.ts`, `git-fixture.ts`, `packed-sandbox.ts`). `npm run build` emits dist and provenance; targeted command pattern is `node scripts/run-tests.mjs --files dist/test/<suite>.test.js`, inherited from Phase 29. `npm run check` is the type gate. `npm test` and `npm run build:check` are final gates, not repeated per-wave full-suite loops. Tests exercising native events use explicit fixture tier and do not launch paid models.

New suites: task-style, task-quick-quality, task-gsd-stages, task-gsd-stage-observation, task-gsd-full-run, task-phase-scope, task-style-routing, task-style-acceptance and task-style-native-proof. Each implementation task creates its own referenced test before running it; no empty Wave 0 scaffolding or new dependency.

Required negative pairs: legacy vs full canonical bytes; full addition/removal; unknown/wrong workflow quality; unsupported capabilities; approval without start; plan-only ordinary evidence vs full; each absent/failed stage; stale/tampered/cross-run/root/session evidence; stage size/count boundary; mode changes; exact-run dirty recovery; live phase insertion; blocked phase before next; root/effect/model substitution. Final proof retains existing regression holds and actual not-run results.

## Security and planning preflight

ASVS L1 / high blocking is active. Trust boundaries are untrusted contract→approval, native observations→acceptance, paths→bounded artifact reads and live roadmap→approved phase scope. Unique T-30-NN registers are allocated in each plan. No ORM/database schema push applies. UI gate returned frontend false/block false. This phase routes local workflows and existing processes; no new external service integration or AI application architecture is introduced. `COVERAGE.md` records that exclusion.

Context drift returned no-upstream-artifacts; codebase-drift returned skipped/not-a-git-repo even though direct git HEAD/status succeeded. That tool did not establish map freshness. Maps dated 2026-09-02 are hints; current source is authoritative. Estimate calibration factor 1, sample_count 0, confidence low. No plan is claimed to have executed.

## Spec-less probe disposition

No phase SPEC exists. Native edge probe input/output is retained in `30-EDGE-INPUT.json` / `30-EDGE-PROBE.json`. Eight items: six unclassified (STYLE-01/02/03/04/06/07), plus boundary/precision for STYLE-05. All six unclassified rows remain flagged unresolved assumptions in their plans; none is silently auto-resolved. STYLE-05 boundary and precision are resolved into explicit receipt-limit and exact identity criteria in plan 03. Disposition: 8 surfaced = 2 explicit criteria + 6 flagged assumptions.

Prohibition recall generated candidates for each requirement, then filtered normal correctness into edge/tests and generic path/injection/credential risks into ASVS threat registers. Three bespoke product prohibitions survive: treating style/bootstrap as autopilot consent (plan 06), silent full→standard downgrade (plan 04), and expanding phase scope or bypassing a blocked phase (plan 05). They are projected descriptor-less using native `projectProhibitions`; verification must surface their unverified flags and obtain review, never silently dismiss them.

## Open Questions (RESOLVED)

1. **Quality representation** — RESOLVED: optional quickQuality, standard omitted from canonical bytes, full explicit; no legacy approval rewrite.
2. **Checker evidence without a native file** — RESOLVED: observed native invocation/result plus evaluated input hash; unavailable observation blocks full. Actual host delivery is an execution proof obligation, not permission to invent a result.
3. **Mutable phase candidates** — RESOLVED: explicit phaseSelection or reconstructable approved baseline receipt; no live roadmap scope expansion.
4. **Unknown native adapter layouts** — RESOLVED: normalize only actual retained supported source shapes, record other layouts unsupported/unknown, and require plan 08 native proof before completion. No runtime upgrade or fallback is assumed.

## Sources and tool limitations

- Local tracked modules and native 1.18.0 workflow slices cited above are the normative implementation sources.
- Official GSD [command reference](https://github.com/open-gsd/gsd-core/blob/next/docs/COMMANDS.md) corroborates full flag semantics; mutable next is supplementary, not the installed pin.
- Official [Ajv modifying-data guide](https://github.com/ajv-validator/ajv/blob/master/docs/guide/modifying-data.md), retrieved through Context7, documents mutating options. No reliance on a new library API is required.
- Exa discovery was invoked and returned 401 (EXA_API_KEY missing). Firecrawl extraction was invoked and denied because MCP approval is unavailable under policy never. Official web search plus exact local package reads supplied the bounded fallback; neither failed call is counted as successful research.
- ECC memory recall was attempted and returned spawnSync node.exe EPERM. Keep continuity in GSD planning artifacts; do not install or broaden permissions to repair memory.

## RESEARCH COMPLETE
