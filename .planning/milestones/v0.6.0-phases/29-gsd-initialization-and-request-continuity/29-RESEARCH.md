# Phase 29: GSD Initialization and Request Continuity — Research

**Researched:** 2026-11-02 · **Baseline:** `9376d37aecd5a41a08ececbe550349112c9e4589`
**Method:** controller-inline research explicitly requested by the user; no external agent processes or independent researcher claim.

## User Constraints

CONTEXT D-01–D-24 are binding. GSD alone writes lifecycle artifacts. Preserve original request/style/direct command, existing bytes, partial summaries and dirty WIP. Missing/partial initialization is diagnosed before substantial work; simple/policy-only operations keep their exemptions. Bootstrap is not approval/start. Phase 30 owns six execution pipelines/full-quality binding; Phase 31 owns final distribution proof. No dependency upgrade, global sync, push, publication or paid canary is authorized by this planning run.

## Phase Requirements

| ID | Required outcome | Planned owner |
|---|---|---|
| BOOT-01 | Native runtime and workflow evidence distinguish missing runtime, absent, partial and ready | 29-01 |
| BOOT-02 | Native new-project consumes bounded known facts and retains missing/mandatory questions | 29-02, 29-05 |
| BOOT-03 | Native recovery preserves existing context and names missing prerequisites | 29-03 |
| BOOT-04 | Exact request/style resumes once, with honest interruption and authority handling | 29-04, 29-05, 29-06 |

## Summary

Extend the current read-only GSD bridge rather than inventing readiness from filenames. Keep Phase 28 intake classification read-only and unchanged; add explicit `task readiness` and `task bootstrap` surfaces downstream of the returned intake decision. Native execution remains in the invoking GSD host/skill; CLI inspection and handoff operations do not launch an LLM or implement the request. The first slice must expose useful native diagnosis through the public CLI; later slices add request delivery, recovery and reconciliation. Final acceptance requires a real native conversational-quick bootstrap/resume receipt, separately from credential-free fixtures.

## Architectural Responsibility Map

| Responsibility | Owner / reuse |
|---|---|
| Project root, tree-off, fresh strict/flexible policy | `behavior-policy.ts`, `evidence.ts`, `tree-policy.ts`, `path-boundary.ts` |
| Style/command/current-task decision | Existing `task-intake*.ts`; no project style preference |
| Runtime identity and bounded native queries | New `task-gsd-readiness.ts`, existing `task-gsd.ts` process runner seam |
| Input reuse / next native recovery action | New `task-bootstrap.ts`, then `task-bootstrap-recovery.ts` |
| Minimal durable transfer evidence | New `task-bootstrap-store.ts`; existing transaction and writer session |
| Actual new-project / resume / quick / phase lifecycle | Installed GSD workflow, invoked by common owned skill; never synthesized by the bridge |
| Autopilot approval and process execution | Existing task contract/runner/lifecycle services, unchanged |

## Standard Stack and Package Legitimacy Audit

Use existing Node >=24, TypeScript, node:test, JSON schema validation and transaction services. No npm addition or manifest/scaffolding work is planned, so no new package-legitimacy or capability-pack installation is needed. If implementation discovers such a need, invoke alpha-aos-control before proposing it. Do not modify the stable GSD pin (`@opengsd/gsd-core` 1.18.0 observed) to obtain a convenience API.

## Version-Specific Native Findings

Primary evidence is the installed `C:/Users/alpha/.gemini/antigravity/gsd-core/` 1.18.0 runtime, verified with `runtime-identity`; local workflow/library reads outrank current web text for this pinned behavior.

| Native source | Observed behavior | Integration consequence |
|---|---|---|
| `bin/lib/init.cjs:1290` `buildInitCompletenessFields` | `init_incomplete = planningExists && !coreComplete && !milestonesExists`; shared PROJECT is resolved outside workstream-specific artifact dir | Query native init.resume/new-project; preserve returned paths/workstream identity; no second quartet-based classifier |
| `bin/lib/init.cjs:1488` `cmdInitQuick` | Reports planning/roadmap and a generated quick ID; querying alone creates no task | A query's quick ID is not acceptance or reservation evidence; never infer started work from it |
| `bin/lib/init.cjs:1628` `cmdInitResume` | Reports state/project/roadmap/requirements/milestones, interruption and paths | Separate initial bootstrap from lost STATE/history and normal milestone archival |
| `workflows/new-project.md:103` | Existing PROJECT plus incomplete init resumes first missing artifact; preserves existing PROJECT/REQUIREMENTS/config; order REQUIREMENTS → ROADMAP + STATE | Supply known facts to the native conversation, then let native workflow recover; refuse unsafe/unsupported cases |
| `workflows/new-project.md:146` | Ordinary deep questioning uses conversational answers and mandatory Ready/config/roadmap decisions; auto mode has different greenfield assumptions | No invented `--seed`, `--facts`, or new CLI API. Reuse facts as conversation context; do not add `--auto` from style alone |
| `workflows/resume-project.md:35` | `init_incomplete` routes back to new-project, not STATE reconstruction | History-backed reconstruction is a distinct native route; absent history never manufactures it |
| `workflows/quick.md` | Real workflow creates quick plan/summary and state/commit evidence; full flag adds stages | Preserve chosen invocation, target and timing. Never simulate a quick by authoring its artifacts |

Current-checkout `init.resume` reported all core inputs and MILESTONES present, `init_incomplete:false`, no interrupted agent. It also reported `agents_installed:false` for the Antigravity agents directory. Thus native query availability is proven, native execution availability is not. This is a required execution preflight and cannot be fixed by writing placeholders or silently using another runtime.

## Proposed Public Contract

New alpha-AOS commands (these are product additions, not claims about GSD flags):

- `alpha-aos task readiness --input <request.json> [--json]`: bounded, closed request with schemaVersion, explicit controller harness, project/bound root, workflow and optional phase/arguments; returns diagnosis and `executionAuthorized:false`; never writes.
- `alpha-aos task bootstrap --input <packet.json> [--apply] [--json]`: operation-specific schema for `prepare`, `inspect`, `claim`, `link`, `acknowledge`, `cancel`. Without apply all operations preview. Inspect is always read-only. No command auto-launches GSD, task runner, package manager or implementation.

Use schema `schemas/task-bootstrap.schema.json` for closed operation variants and readiness input. Do not extend intake's private/public exposure accidentally: public inspection contains summaries, reasons and opaque exact references, not original request/facts/secret values. Trusted invoking host reads the exact prepared record through an explicitly authorized bounded private read to create native conversational input. Never copy arbitrary request text into argv or logs.

### Minimal Pending Transfer Record

Store under `userStateRoot()/task-intake/<projectId>/<pendingId>.json`, outside `.planning` and project behavior policy. `pendingId` reuses Phase 28 correlation when supplied; otherwise generate `pending-` plus 16 lowercase hex characters once. Record schemaVersion=1, canonical root identity proof/projectId, pendingId, content digest, original request/short goal/scope, known facts with provenance, canonical selected style OR exact command route, policy revision as observation, native bootstrap reference, and optional claim/link/delivery/cancellation evidence. There is no phase status, task progress, stage queue, supervisor, approval or current-style preference here. Native references and actual GSD artifacts determine lifecycle.

Bounds: serialized record <=32 KiB; intake portion <=16 KiB, text <=8192 characters and <=16 KiB UTF-8; shortGoal <=512 and shortScope <=1024 characters; <=32 facts, each fact/detail <=512 characters; <=16 arguments each <=512; <=16 allowlisted relative source refs with SHA-256 and <=1024-character path. Aggregate byte cap wins over character caps. Native probe <=1 MiB with 30-second deadline; reject capped, malformed and invalid UTF-8. Oversize is an actionable rejection, never truncation. References must resolve within authorized roots and match revision/hash on reentry; runtime tool output @file pointers require the existing bounded-temp output convention plus path proof, never unrestricted arbitrary file reads.

Use schema validation and existing secret detection/redaction before persistence, diagnostics, errors and prompt transport. Reject suspected credentials without echoing them; do not claim detection covers all possible secrets. Explicit source references avoid retaining large transcripts. Persistence uses transaction snapshots/journal under the same allowed state root with writer-session recheck; read-modify-write must occur within ONE held mutation session, not a read followed by an independently locked write. Root tree-off/path proof applies before inspecting private records or starting native work.

### Delivery and Crash Semantics

`claim --apply` atomically records immutable delivery intent bound to pendingId/content/root/native readiness; one invocation obtains dispatch permission. `link --apply` attaches the exact native-generated quick/task/phase reference as soon as native workflow allocates it, before implementation. `acknowledge --apply` verifies that exact native evidence and records acceptance linkage, not task completion. Repeating claim/ack is idempotent inspection or reconciliation, never another launch. A claim with no conclusive native evidence is ambiguous and blocks automatic redispatch, even if the process seems dead. Reconcile exact root + native refs + bounded artifacts/commits; never correlate by newest timestamp, same goal or latest run. Cancellation serializes with claim, prevents any future dispatch, preserves valid docs; already-started work requires its native stop/recovery path, not file deletion. No exactly-once transport promise.

## Architecture Patterns / Don't Hand-Roll

Reuse injected `GsdToolsRunner`, `runProcess`, `nodeRuntimeEnvironment`, native config root adapters, canonical root and path proofs, `applyFileTransaction` with held mutation session, bounded private-file reads and exact task selectors. Keep quick readiness backward-compatible (`ready/reason/gsdToolsPath`) while delegating richer diagnosis; no autopilot bootstrap from an old boolean consumer. Hermes remains worker-only for GSD state and reports unsupported controller capability; shared skill availability is not native GSD parity.

No database or ORM is involved. JSON schema is interchange validation, so the schema-push hook has no database action. Phase scope is not building an AI system or external service integration; no AI-SPEC or UI-SPEC is required. API detector false positives get a reasoned COVERAGE declaration. Assumption-delta's `second chooser` cue is no identity generalization: retain Phase 28 project/task identities; pendingId is only transfer correlation.

## Common Pitfalls

1. A missing runtime or failed query becomes absent-project and triggers destructive new-project. Preserve missing-runtime/error/unsupported separately.
2. MILESTONES present plus missing core files gets mislabeled interrupted bootstrap. Follow native discriminator and unmet workflow preconditions.
3. Private intake facts become public CLI JSON or process arguments. Keep transfer content private and bounded.
4. A stale immutable record or released lock permits two host sessions to dispatch. Serialize claim/cancel/ack and fail closed on ambiguous intent.
5. Core artifact presence hides corrupt/empty/unreadable content or missing native named agents. Report blocked capability/evidence, not ready.
6. Bootstrap writes original feature code and quick writes it again. Native initialization establishes project context only; pending implementation dispatch happens once afterward.

## Spec-less Probe and Prohibition Recall

`29-EDGE-REPORT.json` is the actual deterministic edge-probe output: four applicable rows. BOOT-02/04 concurrency rows resolve explicitly into claim/cancel/crash/reentry acceptance in 29-02/04. BOOT-01/03 are `unclassified`: preserve as flagged assumptions, never silently auto-resolve. Their concrete fixture matrices still cover the context examples; classifier uncertainty is not evidence of edge completeness.

Adversarial recall considered automatic initialization, forced auto answers, duplicate implementation, silent runtime substitution, transcript retention, project style defaults, history fabrication, cancellation loss, blanket quick exemptions and status-triggered start. Routine correctness is covered by tests; generic path/injection/secret security routes to threat models/secure-phase. Two bespoke prohibitions survive and are projected descriptor-less with the installed `projectProhibitions`: (P29-1) transfer records must not become a second GSD lifecycle or project style default; (P29-2) known-fact reuse must not silently broaden a bounded change into a new product or imply native decision approval. These remain flagged-unverified until explicit review; test fixtures do not automatically turn a descriptor-less prohibition green.

## Validation Architecture

Use existing `node:test`, `assert/strict`, TypeScript and `scripts/run-tests.mjs --files dist/test/...`; build first. Existing `createIsolatedSandbox`/`fingerprintManifest` prove zero writes and WIP preservation. New suites are created with the task that first verifies them, no test-stub-only wave or new framework. After each task run its targeted checks; final gate runs npm test, npm run check and npm run build:check. Do not reinterpret EPERM, worker startup failures, skipped tests or zero tests as success.

BOOT-01: real CLI process with injected native query fixtures plus installed version read-only probe. BOOT-02: prepare/private record → known-fact prompt → native checkpoints. BOOT-03: native partial/archive/history negative fixtures with byte fingerprints. BOOT-04: two-process claim race and every claim/link/ack crash boundary, six-style and exact command preservation. Separate final host receipt must show native new-project then one native quick with plan/summary/STATE/commit evidence. Fixtures cannot substitute for it.

## Environment Availability and Sources

- Installed source and repository reads: available; HEAD and branch `release/0.5.0` retained.
- Exa discovery attempted: 401 missing EXA_API_KEY. Firecrawl scrape attempted: host approval policy never rejected tool execution. Official GitHub web search fallback returned no relevant results; no web claim is inferred.
- Context7 `/websites/nodejs_latest-v24_x_api` resolved and queried successfully. Official [Node 24 file system documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html) confirms exclusive `wx` errors on existing paths and cautions about network filesystems. Exclusive creation alone is not end-to-end dispatch atomicity; reuse repository transaction/session boundaries and report unsupported filesystem guarantees. No new library APIs beyond those existing patterns are required.
- ECC Unified Memory recall attempted using `ecc memory search ... --target-harness codex`: failed with spawnSync node EPERM. Not an empty vault result. No vault write or installation outside this packet's roots; this research/check report carries the bounded handoff for later authorized memory sync.
- Codebase drift precheck returned advisory `skipped/not-a-git-repo` despite direct Git working; no freshness claim. Context drift returned no-upstream-artifacts. UI gate returned frontend=false. Calibration factor=1, sample_count=0, confidence=low.

## Open Questions / Execution Gates

Native tracer requires a supported controller with actual named-agent/workflow capability and authorized local scratch root. Current Antigravity query reports missing named agents; repair/installation is outside this planning run. Plan 29-06 retains a human/native checkpoint and blocks phase completion if unavailable. No later phase is planned to evade this. Public schema changes are one-way format decisions (migration after persisted records); --no-reversibility-gates suppresses that decision stop only. All six downstream route/quality implementations remain Phase 30 work.
