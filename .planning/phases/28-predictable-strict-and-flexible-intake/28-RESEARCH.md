# Phase 28 Research: Predictable Strict and Flexible Intake

**Researched:** 2026-11-02  
**Base:** `dbb29ac6a80d9490740542d811f815df567bc08f` (`release/0.5.0`)  
**Scope:** ENTRY-01–ENTRY-07; CONTEXT D-01–D-20. Research, pattern mapping, synthesis and checking performed inline by explicit user instruction. No external subagent process or independent-review receipt is claimed.

## Findings and confidence

| Finding | Current source | Confidence / consequence |
|---|---|---|
| Policy already resolves canonical root, tree-off, bound-root mismatch, source and byte revision | `src/core/behavior-policy.ts:28–44,140–277` | High; call `resolveProjectBehavior` afresh, never duplicate the root ladder |
| Strict/flexible is the entire closed persisted preference | `schemas/behavior-policy.schema.json` | High; style and pending selection stay outside this file |
| Current task skill still unconditionally offers two paths | `skills/alpha-aos-task/SKILL.md`, General Task Request | High; pure classifier tests alone cannot deliver this phase |
| CLI task verbs have a closed allowlist and shared redaction seam | `src/cli.ts:245,288,2215` | High; add `task intake`, closed flags, read-only input, existing `print` |
| Exact contract/run selection exists | `src/core/task-read.ts:113`, `task-contract.ts:911` | High; require an exact run, never adopt the reader's optional latest-run default |
| GSD evidence and planning snapshots exist, but snapshots span up to 2000 files | `src/core/task-gsd.ts:287` | High; use bounded exact quick/phase artifacts for continuity, not a full snapshot per intake |
| Skill rendering and hash checking already cover all five targets | `src/core/owned-skills.ts:60,78`; `test/project-mode-routing.test.ts` | High; update only the task skill's source/target hashes and reuse temporary homes |
| Canonical test invocation is the routed Node runner | `package.json`, `scripts/run-tests.mjs`, prior Phase 27 commands | High; use `node scripts/run-tests.mjs --files dist/test/...`, after building |

No dependency update, external service, framework integration or new native UI API is needed. Research uses tracked local implementation and the supplied tool schemas; it makes no undocumented third-party API claims. Context7/Exa/Firecrawl triggers for external/library integration do not apply. Installed global workflows are read-only references, never implementation edit targets.

## Recommended architecture

Create `src/core/task-intake.ts` as the single read-only decision service and canonical six-style catalog. Export `TaskExecutionStyle`, `TaskIntakeInput`, `TaskIntakeDecision`, `TaskIntakeHandoff`, `TASK_EXECUTION_STYLES`, `inspectTaskIntake`, `renderTaskStyleQuestion`, and `resolveTaskStyleAnswer`. Put explicit-request normalization, exact continuity reads and bounded simple-operation evidence in small focused modules added by later plans. Reuse existing policy/errors, bounded file reads, schema validation, redaction and Git read adapter.

Expose `alpha-aos task intake --input <request.json> [--json]`. This command classifies and explains; it neither starts work nor writes a pending registry. Reject `--apply`, unknown/duplicate flags and extra operands. The input file is provided through a normal process/tool file channel, never by embedding request/credential text in command arguments. The owned skill calls this shared route, consumes its decision, asks the returned question if needed and hands the result to the existing workflow entry. The CLI itself does not launch GSD or a model.

### Bounded version-1 interchange

Use a closed `schemas/task-intake.schema.json`, with request/handoff definitions. Maximum input: **16 KiB UTF-8 before parsing**. Use duplicate-key-aware `parseManagedDocument` and `validateAgainstSchema`; raw `JSON.parse` plus a cast is insufficient. Request fields: `schemaVersion: 1`, `projectRoot?`, `boundProjectRoot?`, `request` (original text at most 8192 code units, short goal at most 512 and scope at most 1024), `explicit?`, `currentTask?`, `operation?`, `questionCapability?`, `answer?`. Enumerate nested keys and variants with `additionalProperties: false`. Bound each list to 16 entries and each argument/evidence summary to 512 characters. Enforce an aggregate 16 KiB handoff limit too; return a clear diagnostic instead of silently cutting the original request.

Input facts have `known | unknown | contradicted` status and provenance (`user-explicit`, `filesystem`, `git`, `gsd-artifact`, `contract-run`, or `host-capability`). Do not accept a caller's `simple:true`, `active:true`, `approved:true` or mode as authority. Preserve unknown facts. Mechanical readers recheck root, paths, refs and lifecycle references; user intent may establish requested outcome but LLM interpretation alone never proves simple scope, current-task identity or execution consent.

Return one typed object: decision kind (`explicit-command`, `explicit-style`, `continuation`, `simple-operation`, `substantial-work`, `clarification-needed`), policy (`canonicalRoot`, `projectId`, `rootReason`, `effectiveMode`, `source`, `revision`), task reference/style when known, bounded reason codes and observation summaries, missing evidence, next action, optional chooser/clarification and a bounded handoff. Add `executionAuthorized: false` on every result. Text and JSON render this same object. Inspection omits original request, file contents and command argument payloads; the host retains original request only in the in-memory handoff and never logs it. Use existing redaction, observable byte limits and actionable errors.

### Precedence and uncertainty

1. Fresh root/policy/tree guard is common to every branch. Effective policy does not grant effects.
2. Resolve conflicting explicit command/style intents with one narrow clarification; otherwise direct invocation takes its original workflow, arguments, phase and stopping point.
3. Normalize a full exact style before continuation/simple handling. Partial `autopilot` retains that dimension and asks only quick/quick-full/phase. No invented default.
4. Retain style for a verified related active task. Authoritative completion/cancellation ends selection; failure, stopped state and transport yield need exact-reference inspection, not an inference of completion.
5. Exempt a proven simple operation; unknown scope asks the first missing discriminating question. Known substantial work proceeds directly to mode intake.
6. Strict substantial work offers all six choices, waits for a valid response and never executes on an empty answer. Flexible substantial work returns adaptive intake; it does not silently choose autopilot.

Do not treat quoted/fenced/example commands or a mere mention of a style as explicit invocation. Use host invocation metadata where available, otherwise conservative exact full-request recognition plus bounded explicit-intent facts. Keep command arguments as data, never interpolate into a shell. Unsupported command availability is a native prerequisite result, not permission to replace the workflow.

## Task identity and selection lifetime

Use a discriminated reference: GSD quick artifact ID/path, GSD phase ID plus exact current artifact/state reference, or contract ID + revision + digest + exact run ID. Root and short goal/scope must agree with freshly read evidence and the user's relationship to the active task. A matching repository or previous style is insufficient. New independent work is detached from the active task without completing/cancelling it.

Pre-GSD selection uses an in-memory bounded pending identifier supplied by the host, bound to root and goal/scope. It is a transport correlation key, not a lifecycle owner or durable resume registry. Status/invalid replies preserve the pending choice; explicit cancel clears it. Cross-session resume requires the exact existing GSD/contract reference; an unverified memory handoff leads to clarification. A mode change is reread but does not overwrite a verified active style/contract. A requested style change routes to downstream readiness/reapproval without altering a running contract.

The phase hands Phase 29 `{originalRequest, knownFacts, selectedStyle, taskReference, policyRevision, nextAction}` through the bounded transport. It does not implement initialization, replay-once semantics or six execution pipelines (Phases 29/30).

## Simple-operation evidence

Implement `src/core/task-intake-evidence.ts` with read-only, root-contained, capped inspection. Use at most 16 explicitly scoped paths and 64 KiB total inspected text; excess becomes unknown/needs clarification, not an exemption. No recursive repository scan or remote network call. Every eligible operation needs a clear target/result and evidence of bounded impact, with no separate design/investigation/multi-stage implementation.

| Operation | Positive evidence | Same-name negative / uncertain twin |
|---|---|---|
| push | Explicit remote and local branch/ref, normal non-force push, existing local ref, scoped intent; actual push still requires existing authority | Force/delete/mirror/history rewrite, conflict resolution or unknown target; never contact remote or push during intake |
| rename | Exact old/new root-contained paths, known local reference impact, explicit unchanged API/schema meaning, bounded inspectable references | Cross-subsystem/API/schema change or incomplete impact evidence; file count alone is insufficient |
| README translation/link | Existing supplied source/target, faithful translation or known existing document link, unchanged structure/feature scope | New feature design, information architecture rewrite, unavailable source or unresolved destination |

If scope expands, preserve WIP, re-evaluate before expanded work and obtain the necessary chooser/effect/contract gate. A repair of the verified active task keeps its style; an independent substantial expansion does not borrow it. Explicit full style outranks the exemption.

## UI and authority observations

The deterministic UI gate returned `frontend:true`, `hasFrontendEvidence:false`, `hasUiSpec:false`, **`block:false`** (matched prose `UI`). This is a host question/text interaction, not a new frontend. No UI-SPEC or invented graphical implementation is required by this nonblocking result. The current question tools expose at most 2–3 recommended choices; they cannot be assumed to display six. Default unknown/insufficient capability to numbered text with all six labels/descriptions together. A verified six-option native interface may use the same catalog and answer reducer. Never split the canonical chooser into two hidden submenus.

Security hook is active: ASVS L1, block high. Include unique `T-28-NN` threat rows in every plan, the reserved `T-28-SC` row, and negative behavioral checks. No package install is planned. `--no-reversibility-gates` suppresses only decision checkpoints; rate shared contracts as costly and public versioned interchange as one-way. Native prerequisites, sandbox and exact approval/start are unaffected.

## Validation Architecture

Node `node:test`, strict TypeScript and the existing routed runner need no setup. First test the compiled CLI from a temporary standalone project/home/state root. Verify strict chooser order, absence of writes and no workflow launch. Expand with actual CLI JSON input/output, real policy changes and fixture GSD/contract records, not only pure decision snapshots or skill-string assertions.

New suites: `task-intake-cli`, `task-intake-explicit`, `task-intake-continuity`, `task-intake-evidence`, `task-intake-routing`, `task-intake-acceptance`. Each implementation task creates its suite before using its verify command. Existing negative checks: `behavior-policy`, `project-mode-cli`, `project-mode-routing`, `owned-skills`, `task-contract`, `task-receipts`, `tree-policy`, `redaction`, `task-gsd-lifecycle` where relevant. Build before compiled tests. Missing future files are `pending_creation`, never a test pass. Full suite and `npm run build:check` run at final implementation acceptance, not for these docs-only planning edits.

Run targeted checks after each task and wave; do not rerun the whole suite on every task. Final evidence records actual counts/skips/failures. Keep prior `261101-ww3` startup failure and four not-run suites, release/macOS CI/push/global-apply/publication holds until separately resolved. Native host receipts and offline adapter fixtures are different evidence classes. No model CLI/global install is authorized by this plan-phase slice.

## Planning gates and limitations

- Runtime identity: installed `@opengsd/gsd-core` 1.18.0. Phase status Pending; no existing plans to overwrite. MVP false, tracer true, reversibility gates false; requested stop before execution wins over auto-chain.
- Context drift: skipped `no-upstream-artifacts`. Codebase drift returned skipped `not-a-git-repo` despite direct Git proving this checkout; this probe could not establish freshness. Current tracked source reads provide the research grounding; no map freshness claim.
- Assumption-delta detected `fallback`: **promote** a single canonical task-style question/answer model; native and text are rendering variants. No second primary identity or harness-specific style store.
- No external API integration, ORM schema push, intel hook or AI system build applies. See `COVERAGE.md`.
- Spec-less edge probe ran on all seven actual requirement texts: 13 proposed rows, including three unclassified rows retained as flagged assumptions. See `28-EDGE-COVERAGE.md`; nothing was auto-dismissed.
- Planning quality checks are inline self-review under explicit instruction, not fresh independent-agent review. Required post-implementation independent review is preserved.

## Recommended plan boundaries

1. 28-01: real strict intake CLI tracer, versioned bounded transport, chooser and zero-write/error expansion.
2. 28-02: explicit GSD/style precedence and partial/conflicting intent.
3. 28-03: exact current-task continuity and pending-selection lifecycle.
4. 28-04: evidence-backed simple operations, narrow clarification and WIP-preserving escalation.
5. 28-05: actual owned skill routing across five targets, integrity and user contract docs.
6. 28-06: complete acceptance scenarios, honest native evidence and final regression gate.

Plans are sequential waves because they refine the same decision service and then integrate its completed contract. No nominal parallelism may race those files.
