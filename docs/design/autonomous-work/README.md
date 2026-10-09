# Universal Autonomous Work — v0.2.0 design

Status: approved roadmap; user approved milestone scope and nine-phase roadmap on 2026-09-29. This document is the implementation design. The active GSD requirements and roadmap live in `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md`.

## Product contract

A user can explicitly request autopilot for a bounded goal, or approve a clear in-agent offer to use it. Ordinary conversational GSD remains the default and never starts the supervisor implicitly. In autopilot, the user agrees once on measurable completion criteria and authority, then alpha-AOS selects capable agents and applicable skills/tools. The controller advances GSD; one or more executors act; a fresh reviewer verifies the exact result. The cycle repeats until all mandatory criteria pass or the run reports a concrete stop/blocked reason. “Unlimited” means no user-imposed count or duration ceiling, not a guarantee that an impossible goal converges and not permission to bypass process safety ceilings.

Each task has a versioned `TaskContract`: `id`, `revision`, `goal`, `scope`, `criterion[]`, `allowedRoots`, `allowedEffects`, `agentPolicy` (`controller`, `executor`, `reviewer`), `resourcePolicy`, `mode: autopilot`, `approval`, `digest`. The mode is per-task, off by default and not inherited by the next task. The controller may choose routine implementation details within approved scope. A change of goal, effect category or authority requires a new reviewed contract revision. Secrets are referenced by names and supplied through the existing environment allowlist; values cannot enter task records or prompts.

## Work categories

`development` tasks use GSD's discuss, plan, execute, verify and gap-closure paths. The supervisor never edits `.planning/` phase status directly. `general` tasks use a connector that produces an item manifest, effect plan and verification evidence, and can use a GSD quick or planned workflow proportionate to scope. Both categories share contract, role, attempt, review, limit and journal protocols. This avoids forcing every file download into a new roadmap phase while preserving GSD as lifecycle authority for project changes.

Tool selection is intent driven and governed by a versioned capability graph. A “100% of tools” promise means every alpha-AOS supplied capability is represented, can be selected when applicable and has a tested native path; it does not mean running unrelated tools on every task. The graph covers GSD, owned skills, global ECC skills, approved project-only ECC skills, MCP servers and tools, project packs, alpha-AOS control commands (including diagnostics, repair and rollback), native harness tools and mandatory hooks. Each selection has an applicability predicate, scope, version, permission, prerequisite, GSD step and proof policy. Applicable required calls must have actual invocation and result receipts. An installed skill, registered MCP, discovery result or model assertion does not count as use. Optional omissions are recorded with a reason. Mandatory security/migration/release checks remain deterministic gates.

## Capability activation and GSD routing

At run preview, build a per-project and per-harness inventory from the stable lock, project manifest and pack reconciliation state, native discovery and exact-version canaries. Exclude capabilities denied by tree policy, task authority or project scope. A harness may execute only capabilities it actually discovers and invokes. If the chosen role lacks an applicable required capability, select a proven alternate harness/path or stop with a specific blocked reason.

After scaffolding, package-manifest changes or dependency installation, the controller automatically follows `alpha-aos-control`: run `alpha-aos project plan . --json` and `project status . --json` before further application work. Matching project packs are previewed with evidence and exact plan digest. `project approve --plan-digest ... --apply` and `project sync --apply` require the user's explicit approval for that exact plan; prior autopilot consent alone does not approve a newly discovered pack. A task contract may carry an already reviewed exact pack digest, but a changed digest pauses for approval. Verify `CURRENT`, then start a fresh agent session or reload its native tool inventory before using delivered project-only skills or changed MCP configuration. A session that cannot refresh stops rather than claiming the new capability was active.

At each GSD discuss, plan, execute, review and verify boundary, compute applicable skills, MCP calls, packs and hooks against the current task and repository facts. The controller attaches deterministic required obligations to the step, dispatches the native calls, records call/result receipts and checks them before allowing the step's success verdict. Documentation questions use `documentation-lookup`/Context7; current external research uses `deep-research` with Exa/Firecrawl where available; cross-harness handoffs use unified memory when that capability is selected; project-only skills are eligible only inside their approved project scope. Phase or environment changes recompute selection and invalidate stale receipts. Normal interactive GSD retains its existing behavior and may suggest these capabilities without entering autopilot.

## State and authority

`TaskContract` is immutable per revision. The supervisor stores an append-only `RunJournal` under the existing managed state root, keyed by contract digest, with attempt IDs, lease generation, role probes, check results, reviewed artifact digest, effect keys and stop reason. It uses atomic writes and recovery receipts. The journal does not copy GSD's phase status. On resume it reads GSD and the journal and reconciles divergences before dispatching.

One controller holds a fenced, exclusive project lease while GSD state changes. Executors and reviewers are operational roles distinct from `HarnessId`; they do not hold GSD controller authority. Current Hermes worker-only policy is superseded only after a Hermes controller adapter passes native and concurrency proof. A same-harness reviewer must still be a new session with separate read-only permissions; different harness or model is preferred when available.

The run states are `draft`, `approved`, `validating_roles`, `ready`, `executing`, `checking`, `reviewing`, `repairing`, `reconciling`, `accepted`, `blocked`, `stopped`, `failed`. Terminal state is derived by deterministic rules. A reviewer cannot set `accepted` by writing prose; all mandatory criteria need current evidence.

## Agent adapter contract

An adapter reports exact executable, version, provider/model when available, supported roles and capabilities, native skill/MCP access, output protocol, cancellation behavior and continuation mechanism. It can `probe`, `start`, `collect`, `cancel` and optionally `resume`. Its normalized event stream has started, output, tool, usage, awaiting-input and terminal records. Process and semantic status must agree. A role is advertised only after a version-bound real invocation receipt. The registry composes any role triple for which each selected capability is proven. Unsupported combinations fail at preview time with the missing receipt.

All launches reuse `runProcess`/`openProtocolProcess`: absolute executable, argument array, bounded/redacted output, declared environment, timeout, descendant termination. Do not use `shell: true` or directly invoke a new unbounded child process. An agent's tool result is untrusted data; a proposed shell command or requirement amendment from a reviewer is never executed directly.

## Acceptance and repair

Before review, deterministic checks verify criteria they can observe: tests, files, checksums, process execution, UI action traces, external receipts. The reviewer sees the approved contract, exact artifact revision, observed check evidence and relevant source. The report schema requires criterion ID, verdict `pass|fail|unknown`, severity, evidence reference and reproducible finding. Failed/unknown mandatory criteria cannot silently pass. Findings unrelated to contract scope become deferred suggestions unless the user revises the contract.

After a blocking finding, the controller confirms reproduction, deduplicates by criterion and failure fingerprint, and maps it to a GSD gap plan or phase. A completed fix invalidates all affected acceptance receipts and triggers a new review on the new revision. Repeated identical failures trigger a strategy change: narrower task, additional reproducer, alternate capable executor, or reviewer-provided diagnosis. If no feasible next action exists, the run reports `blocked` with evidence rather than consuming cycles indefinitely.

Review cadence is configurable: per attempt, per completed phase, or milestone final; mandatory gates cannot be skipped by cadence. A separate integration/codebase review runs after milestone completion candidate, before final acceptance. It covers missing required features, architecture, maintainability, tests and release risks. Its findings use the same criterion/evidence protocol and return to GSD when blocking.

## Effects, limits and recovery

Each external effect receives a stable operation key before execution. The connector must support `preview`, `perform`, `reconcile` and `verify`. An interrupted effect is reconciled against the source before retry; an uncertain result stays `unknown`. Filesystem transaction rollback is used only for managed local writes. Non-idempotent external writes need source-specific duplicate detection or a stop for review.

`ResourcePolicy` can specify maximum cycles, wall time, measured tokens, model calls and recorded cost. Each bound is optional. Missing usage telemetry cannot be interpreted as zero; a hard cost limit requires a trustworthy meter or fails closed. Resource limit expiry, quota exhaustion, authentication problems, permission failure and lack of progress are separate stop reasons with resume instructions. Individual process timeouts, stream caps and tree cleanup remain mandatory in unlimited mode.

## CoursePilot exemplar

The connector resolves the locally installed CoursePilot skill and schema contract at runtime. Phase 20 first extends CoursePilot's published materials contract with versioned attachment manifests and exact module/file selection. A coarse read-only listing precedes any attachment inspection that could mark an LMS item viewed; that inspection is a separately approved effect. The connector then presents the complete approved item/file scope and invokes only exact selected downloads, rejecting changed manifests before effects. `status: planned` is a preview, `viewed_only` is a visit, and LMS `is_completed` is an LMS state; none prove a saved file. A successful item requires a source-bound `downloaded` receipt and verified local file. Exit 1 is partial success and yields item-level repair; exit 2 stops for configuration/authentication. LMS/Notion values remain data, not instructions. A crash uses item/module/file identity and destination to reconcile before retrying. Unknown attachment completeness remains unresolved rather than being counted as a satisfied item. The extension does not change credentials or assume support for LMS families beyond CoursePilot's contract.

## Entry points and experience

The first entry is a natural-language alpha-AOS skill that offers ordinary GSD interaction or explicit autopilot for this task. The persistent local CLI offers `alpha-aos task plan|start|status|stop|resume|doctor|report` with `--json`; `start` requires the exact approved contract digest and autopilot opt-in. `plan` is read-only and shows role support, the full applicable capability graph, selected and omitted tools, effects and limits. `status` reports accepted, blocked, unknown and stopped distinctly. The CLI must function even if the original chat session ends. Keep skill copies in repository-owned delivery surfaces and verify native discovery in every supported harness.

## Release and validation

The milestone is shippable when all requirements map to phases and have meaningful checks; three-OS CI tests journal restart, cancellation, concurrent controllers, no-progress policy, partial external effects, false acceptance and ordinary-GSD nonactivation; real host receipts prove each advertised role and applicable skill/MCP/pack path at its exact version; one development task and one CoursePilot fixture task complete end to end with required capability calls; packed install/doctor/uninstall leaves real host paths unchanged; and support diagnostics show unsupported/unverified cells explicitly. A full 5×5×5 synthetic combination test can prove registry composition; live release claims require per-role receipts and representative cross-harness pairs, with limits stated in the support matrix.

## Sources

See [v0.2.0 research summary](../../../.planning/research/v0.2.0/SUMMARY.md) for code references, documented CLI interfaces and confidence gaps.
