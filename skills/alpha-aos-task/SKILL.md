---
name: alpha-aos-task
description: "Natural-language task entry and autonomous workflow coordinator for alpha-AOS. Automatically triggers on natural task requests, new task intents, or requests for autonomous autopilot execution. Guides the user between ordinary conversational GSD (default) and explicitly requested autonomous autopilot, generates read-only task contract previews, explains exact digest approval and separate start commands, and coordinates task status tracking across Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent."
---

# alpha-AOS Natural Task Entry & Autonomous Workflow Coordinator

## Objective

Serve as the natural-language task coordination interface for alpha-AOS across all supported harnesses (Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent). Guide user task requests to either ordinary conversational GSD (default) or explicitly requested per-task autonomous autopilot. The initiating conversation owns contract review and tool-mediated launch; the existing runner owns isolated task execution. A mode switch alone never authorizes mutations, but explicit approval and a start instruction for the displayed exact contract may be given in this conversation.

---

## Decision Rules for Task Intake

### 1. Project Behavior Policy Request (Precedes General Task Intake: D-10, D-11, D-14)
When a user makes a project behavior policy request (e.g., query current mode, switch mode to strict or flexible, "유연 모드로 바꿔줘", "현재 strict/flexible 설정 보여줘", "set project mode to flexible"):
1. **Query & Freshness Precedence (D-10, D-14)**:
   - Always resolve the canonical project root and query the live behavior policy via the shared CLI:
     ```bash
     alpha-aos project mode [path] --json
     ```
   - Never rely on session memory or stale cache as authority for project behavior mode. Another harness or concurrent writer may have modified it.
   - For an active task bound to a canonical project root, check that the requested target root matches the bound root; a mismatch blocks rather than switching projects.
2. **Policy-Only Mode Change Request (D-10, D-11)**:
   - Do NOT prompt the user with the general execution chooser (GSD vs Autopilot), task contracts, or GSD new-project initialization for a policy-only request.
   - Preview the change:
     ```bash
     alpha-aos project mode set strict|flexible [path] --json
     ```
   - Present the canonical root, current mode/revision, requested mode, and computed plan digest to the user.
   - Using the user's concrete natural-language request as setting authority, invoke the apply command with the reviewed plan digest using the session's process tool:
     ```bash
     alpha-aos project mode set strict|flexible [path] --plan-digest <digest> --apply
     ```
   - Do NOT require the user to copy/paste CLI commands or retype digests into a terminal.
   - If the project root or requested mode is missing or ambiguous, ask only clarifying questions to resolve the missing parameter.
3. **Mixed Mode-Setting and Substantial Task Request (D-11, D-14)**:
   - Handle the explicitly authorized mode setting FIRST via the shared CLI preview/apply flow.
   - Once the mode change is applied (or verified current), resume the original task intake using a fresh policy read.
   - Mode change is purely a behavior preference; it does NOT grant execution consent, task approval, style persistence, or autopilot start authorization for the substantial task.
4. **Subsequent Task Intake (D-14)**:
   - Before each new task intake, rerun `alpha-aos project mode [path] --json` to ensure the latest project policy is active.
   - Changes made by other harnesses appear at the next intake without altering an active task's style, contract, or plan.

### 2. General Task Request (Shared Intake Procedure: D-01–D-20)
When a user expresses a task request (or invokes a direct command, style, or simple operation):

1. **Shared CLI Intake Inspection (D-01, D-18)**:
   - Collect the bounded original request, known facts, and exact task/contract references.
   - Write a transient JSON request document through an authorized temporary file:
     ```json
     {
       "schemaVersion": 1,
       "request": {
         "text": "<user request text>",
         "shortGoal": "<short goal if known>",
         "shortScope": "<short scope if known>"
       }
     }
     ```
   - Invoke the shared read-only intake CLI via the session's process tool:
     ```bash
     alpha-aos task intake --input <request.json> --json
     ```
   - Immediately remove the transient request file within its authorized root.
   - Do NOT pass credential values or arbitrary user command arguments in command-line flags.
   - Consume the returned `TaskIntakePublicDecision` (`kind`, `nextAction`, `chooser`, `clarification`, `commandRoute`, `selectedStyle`, `taskReference`, `reasons`, `observations`).

2. **Precedence and Decision Dispatch (D-02, D-03, D-04, D-17)**:
   - **Explicit Direct Commands (`explicit-command`)**:
     - Direct GSD command invocations (e.g. `gsd-discuss-phase`, `gsd-plan-phase`, `gsd-execute-phase`, `gsd-quick`, `gsd-debug`) preserve their original workflow, phase, arguments, and native checkpoints.
     - Do NOT insert an unrelated six-style chooser or two-path question before direct commands.
     - Command citations or explanations in quotes/code blocks are not direct invocations.
   - **Explicit Style Requests (`explicit-style`)**:
     - When the user explicitly requests one of the 6 canonical styles (e.g. "대화형-quick-full로 README 번역"), that choice is preserved directly without a chooser.
     - When the user specifies partial autopilot (e.g. "오토파일럿으로 실행해줘"), the autopilot execution mode is preserved, and the agent asks only the missing depth choice (`오토파일럿-quick`, `오토파일럿-quick-full`, `오토파일럿-phase`).
     - A style choice is purely a workflow routing preference; it does NOT grant execution effects or contract approval.
   - **Verified Active Task Continuity (`continuation`)**:
     - When continuing an active task for follow-up work, test repair, or status queries, the verified task's style and exact contract binding are retained.
     - Completed or cancelled tasks never restore style to independent new work.
   - **Proven Simple Operations (`simple-operation`)**:
     - Bounded operations with mechanical evidence (bounded push to explicit remote/branch, local file rename with unchanged API meaning, faithful README translation/link) skip chooser and forced GSD bootstrap (`nextAction: "execute-simple"`).
     - Simple operation exemption does NOT grant push authority, workspace write permissions, or effect approval. Downstream execution gates still apply.
   - **Clarification Needed (`clarification-needed`)**:
     - When target, result, or impact evidence is incomplete, ask the returned single discriminating question (e.g. filename-only vs public API rename, target remote and branch). Reclassify upon response.
   - **Substantial Work (`substantial-work`)**:
     - **Strict Mode (`nextAction: "choose-style"`)**:
       - Present all six canonical options and descriptions in exact approved order:
         1. **대화형-quick**: 현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리
         2. **대화형-quick-full**: 작은 작업에 토론·조사·계획 검사·구현·검증 적용
         3. **대화형-phase**: 로드맵과 Phase를 따라 필요한 사항을 질문하며 진행
         4. **오토파일럿-quick**: 승인된 계약과 별도 실행기로 작은 작업 처리
         5. **오토파일럿-quick-full**: 승인된 범위에서 작은 작업의 전체 품질 절차 수행
         6. **오토파일럿-phase**: 승인된 로드맵 범위의 Phase들을 자율 진행
       - Use native question tooling ONLY if verified to support all six options. If the host tool has a 2–3 option limit or is unknown, present the complete 1–6 numbered text list and await response.
       - Empty, invalid, or ambiguous answers keep selection pending without starting execution.
       - Status inquiries preserve pending selection. Cancellation ("cancel", "취소") discards it.
     - **Flexible Mode (`nextAction: "adaptive-intake"`)**:
       - Uses adaptive conversational or autopilot intake without mandatory six-item chooser.
       - Does NOT silently default to autopilot or generate unnecessary autopilot contracts for conversational tasks.

3. **Precedence Invariant (No Ambient Shortcut Bypass)**:
   - The agent **MUST NOT** bypass path confirmation by unilaterally jumping directly into execution shortcuts (such as bare `$gsd-quick`).
   - Native shortcuts (`$gsd-quick`, `$gsd-debug`, `$gsd-execute-phase`) operate **downstream** of intake confirmation, never as a bypass around it. Explicit direct command invocations (`gsd-*`, `$gsd-*`, `/gsd:*`) with parameters are routed through `explicit-command`.

4. **Autopilot Boundary Invariant (D-04, D-05, D-09, D-10, D-19)**:
   - Any chosen autopilot style (`오토파일럿-quick`, `오토파일럿-quick-full`, `오토파일럿-phase`) requires:
     1. Read-only contract preview (`alpha-aos task preview <contract.json> --json`).
     2. Exact-digest approval (`alpha-aos task approve <contract.json> --contract-digest <digest> --apply`).
     3. Separate execution start command (`alpha-aos task start <contract.json> --contract-digest <digest> --apply`).
   - The conversational agent MUST NOT perform inline implementation of autopilot tasks in chat.

### 3. Execution Route Resolution & Six Native Routes (STYLE-01–STYLE-07, D-01–D-04, D-13–D-20)
Once intake yields a decision, the `executionRoute` projection maps the confirmed style to exact native workflow commands and authority boundaries:

1. **Conversational Quick (`대화형-quick` / `conversational-quick`)**:
   - Executes in the current interactive conversation via native GSD quick: `$gsd-quick "<task description>"`.
   - Follows installed GSD workflow: mandatory planning, atomic commit, and SUMMARY/STATE gates. Optional stages are skipped for fast resolution.
   - Retains conversation-level confirmation without external runner or contract preview.

2. **Conversational Quick-Full (`대화형-quick-full` / `conversational-quick-full`)**:
   - Executes in the current interactive conversation via native full quick: `$gsd-quick "<task description>" --full`.
   - Enforces all full stages: discussion, research, planning, plan checking, implementation, verification, state-docs, and active native gates (e.g. code review).
   - Preserves interactive discussion questions with the user in the conversational thread; does not automatically answer or delegate discussion decisions without user authority.

3. **Conversational Phase (`대화형-phase` / `conversational-phase`)**:
   - Follows roadmap and phase progression natively in the current conversation.
   - Preserves native GSD questions, checkpoints, and user approvals at phase boundaries.
   - Direct command invocations (`gsd-discuss-phase`, `gsd-plan-phase`, `gsd-execute-phase`, `gsd-verify-work`, `gsd-debug`) preserve their exact target, workflow arguments, and stopping boundary (e.g. discuss-only stops after context commit; does not expand to plan or execute).

4. **Autopilot Quick (`오토파일럿-quick` / `autopilot-quick`)**:
   - Builds a task contract with `category: "development"`, `workflow: "gsd-quick"`, and standard quality (omitted or `"standard"`).
   - Operates strictly on `surface: "isolated-runner"`.
   - Requires full contract preview, exact 64-hex digest approval, and separate start command.

5. **Autopilot Quick-Full (`오토파일럿-quick-full` / `autopilot-quick-full`)**:
   - Builds a task contract with `category: "development"`, `workflow: "gsd-quick"`, and explicit `quickQuality: "full"`.
   - Dispatches to isolated runner with native `--full` flag and required stage observations.
   - Acceptance strictly requires verified evidence for all 7 mandatory stage categories (discussion, research, planning, plan-check, implementation, verification, state-docs). Missing or failed stages result in unsatisfied `full-quality-stages` precondition, refusing acceptance. Exit code 0 or worker claims alone are NOT acceptance.

6. **Autopilot Phase (`오토파일럿-phase` / `autopilot-phase`)**:
   - Builds a task contract with `category: "development"`, `workflow: "gsd-multi-phase"` or `"gsd"`, and optional `phaseSelection: { phaseIds, roadmapSha256 }`.
   - Enforces approved phase selection and order at every lifecycle boundary. Live discovery cannot authorize an added or reordered phase (D-17).
   - If any phase fails or requires human intervention, progression halts immediately fail-closed. Next-phase planning command count is strictly zero (D-18, D-19).

7. **Prohibition: Chooser / Bootstrap Selection is Never Approval or Start**:
   - Style selection, mode choice, and completed bootstrap handoffs carry `executionAuthorized: false`.
   - They NEVER constitute contract approval or execution start authorization.
   - Zero inline implementation in chat for autopilot tasks; implementation belongs exclusively to the isolated runner after explicit approval and separate start.

### 4. GSD Readiness & Project Initialization Gate (BOOT-01, BOOT-02, BOOT-03, BOOT-04, D-05–D-24)
Before substantial task execution or contract generation:

1. **Exemptions (D-08, D-21)**:
   - Proven simple operations (`simple-operation`: bounded git push to explicit remote/branch, file rename, README edits) and policy-only requests (`alpha-aos project mode`) do NOT invoke GSD readiness or task bootstrap handoff.
   - Expanding simple scope into substantial changes cancels the exemption and resumes normal GSD readiness while preserving original WIP.

2. **Direct Command Timing (D-02, D-03)**:
   - Explicit direct GSD commands (`gsd-*`, `/gsd:*`) preserve their target workflow and native checkpoints. GSD readiness and bootstrap are invoked only when the project lifecycle state is absent or partial.

3. **Task Readiness Inspection (`alpha-aos task readiness`: BOOT-01, D-01, D-02, D-10, D-13)**:
   - Inspect project readiness before substantial execution:
     ```bash
     alpha-aos task readiness --input <readiness-input.json> --json
     ```
   - Input schema: `{ schemaVersion: 1, controller: "<harness>", workflow: "<workflow>", projectRoot: "<path>" }`.
   - Never pass raw user prompt facts or secrets in argv; use transient bounded JSON files under authorized roots.
   - Diagnostic outcomes:
     - `ready`: Project state complete (`PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`). Proceed directly to task dispatch.
     - `absent-project`: `.planning/` directory absent. Requires `gsd-new-project` initialization.
     - `partial-project`: Interrupted initialization or missing state. Inspect `recoveryPlan`:
       - `resume-new-project`: Resume initialization at first missing stage (skipping requirements regeneration if `REQUIREMENTS.md` exists).
       - `new-milestone`: Milestone archive present with no active roadmap. Routes to `gsd-new-milestone`.
       - `reconstruct-state`: Missing `STATE.md` with phase history. Routes to `gsd-resume-project`.
     - `blocked`: Inconsistent state (e.g. `.planning` without `PROJECT.md`), corrupt/0-byte files, or unsupported controller. Report exact diagnostic and halt; do not guess or corrupt artifacts.

4. **Task Bootstrap Handoff Protocol (`alpha-aos task bootstrap`: BOOT-02, BOOT-03, D-05, D-06, D-07, D-15)**:
   - For `absent-project` or `partial-project`, prepare durable handoff:
     ```bash
     alpha-aos task bootstrap --input <bootstrap-input.json> --plan-digest <digest> --apply --json
     ```
   - The handoff document securely seeds the native GSD initialization (`gsd-new-project` or recovery) with already-known user facts, avoiding chooser repetition.
   - **Mandatory Native Gates**: Ask the user only missing/conflicting facts and mandatory project foundation decisions (project name, core objectives, stack). Never add `--auto` or bypass user confirmation of architecture/milestone scope.

5. **Once-Only Reentry, Linkage & Delivery Acknowledgment (`claim` -> `link` -> `acknowledge`: BOOT-04, D-15–D-20)**:
   - After native initialization or recovery completes:
     1. **Claim (`operation: "claim"`)**: Re-inspect fresh readiness and claim the pending handoff record:
        ```bash
        alpha-aos task bootstrap --input <claim-input.json> --apply --json
        ```
        - Conversational styles (`대화형-quick`, `대화형-quick-full`, `대화형-phase`): `dispatchAuthorized: true`. Dispatch the originally selected native workflow.
        - Autopilot styles (`오토파일럿-quick`, `오토파일럿-quick-full`, `오토파일럿-phase`): `dispatchAuthorized: false`. Restores exact task contract preview, requiring explicit user approval and separate start command. Zero inline chat execution.
     2. **Link Native Reference (`operation: "link"`)**: Host records the prospective or actual native GSD artifact path (e.g. `quickPath` or `phasePath`) before implementation begins:
        ```bash
        alpha-aos task bootstrap --input <link-input.json> --apply --json
        ```
        - If already linked, returns `route: "continue-existing"` to prevent duplicate task execution.
     3. **Acknowledge Delivery (`operation: "acknowledge"`)**: Once native workflow accepts the task, host acknowledges delivery:
        ```bash
        alpha-aos task bootstrap --input <ack-input.json> --apply --json
        ```
        - Records delivery receipt (never task completion).
     4. **Cancellation (`operation: "cancel"`)**: Atomically cancels pending transfer, preserving planning artifacts. Racing in-flight claims report `delivery-in-flight` and route to native stop.

6. **Controller Support & Limitations (D-23, D-24)**:
   - Claude Code, Codex, Antigravity, and Pi Agent are supported GSD controllers using verified native runtimes.
   - Hermes Agent is worker/handoff-only; readiness query reports `controller: "hermes"` as unsupported controller for GSD state spine execution rather than simulating false parity.

---

## Contract Review & Execution Protocol (D-05, D-09, D-10)

### Step 1: Read-Only Contract Preview (D-05, D-08)
Generate and display the read-only contract preview before any execution:
```bash
alpha-aos task preview <contract.json>
# Or machine-readable:
alpha-aos task preview <contract.json> --json
```
The preview presents:
- Exact Goal and Project Root.
- Must-have acceptance criteria and verification commands.
- Allowed roots and allowed effect kinds (e.g., `local-commit`, `workspace-write`).
- Assigned harness roles (controller, executor, reviewer).
- Wall-time and token/resource limits (clearly stating unmeasured vs measured limits).
- Computed 64-character SHA-256 Contract Digest.

### Step 2: Exact-Digest Approval (D-09)
Show the concrete preview and its exact digest to the user. After the user explicitly approves that displayed revision, invoke the following command using the session's process tool, specifying the exact 64-character hex digest and the `--apply` flag:
```bash
alpha-aos task approve <contract.json> --contract-digest <64-char-digest> --apply
```
- A preview without `--apply` writes nothing.
- An approval without the matching `--contract-digest` is refused (contract drift protection).
- Approval grants permission for a single run of that exact revision. Modifying the contract requires a new revision and fresh approval.
- The user may approve the displayed contract in natural language; the agent carries its exact digest into the CLI. Do not require the user to copy commands or retype the digest. Ambiguous approval, changed scope, or an undisplayed revision is not consent.

### Step 3: Separate Execution Start Command (D-09, D-10)
After approval succeeds, and only when the user has explicitly requested start of that displayed contract, the agent MUST invoke the separate start command through the current session's process tool. The user may say "approve this contract and start" in one response to the preview; still invoke approval and start sequentially as distinct commands, and never start after a failed approval. Approval alone does not authorize start.
```bash
alpha-aos task start <contract.json> --contract-digest <64-char-digest> --apply
```
Do not hand a list of Node/CLI commands back to the user as the default execution path. Manual terminal execution remains an option if the user prefers it. If the host lacks process tools or denies launch, report the exact limitation and preserve the contract/digest; do not claim execution or silently bypass the host boundary.

### Step 4: Full Quality Evidence, Exact Recovery & Continuation (STYLE-05, D-09, D-18, D-19)
1. **Full Quality Evidence Verification**:
   - For contracts with `quickQuality: "full"`, acceptance evaluates all stage observations via `verifyGsdFullEvidence`:
     - Reads all native stage receipts, verifying root, contract digest, revision, runId, quickId, and workflow SHA-256.
     - Confirms on-disk SHA-256 hashes of input and output artifacts.
     - Adds a mandatory additive precondition `full-quality-stages` before verdict reduction.
   - An ordinary quick run or missing stage receipt leaves `full-quality-stages` unsatisfied, resulting in verdict `unknown` or `rejected`.
2. **Partial-Run Recovery & Dirty WIP Preservation**:
   - Interrupted runs preserve uncommitted user WIP in the working directory and partial summaries.
   - Same-run resume (`alpha-aos task resume <contract-id> --run <run-id> --apply`) verifies baseline, checkpoint, and intact artifacts.
   - Reuses verified stages and resumes only pending native slices.
   - Refuses multiple ambiguous quick directories and incompatible workflow modifications.
3. **Active Task Continuity vs. Mode Policy**:
   - Continuing an active task retains its verified style and quality binding.
   - Later project mode changes (strict/flexible) take effect at the next task intake but never alter or overwrite an active task's contract, style, or plan.


### Optional progress panel and exact conversation controls

For Claude, Codex, Antigravity, Pi and Hermes, offer the shared passive panel when the user opts in. Keep ordinary conversational GSD and the existing no-panel start as defaults. After exact approval and the separate start instruction, invoke `alpha-aos task start <contract.json> --contract-digest <digest> --apply --progress panel --origin-host <claude|codex|antigravity|pi|hermes> --origin-session <logical-id>` with the process tool. The logical origin may be generated when the native ID is unavailable; never present it as a verified native session ID. Surface the actual returned panel URL and observer job ID before waiting for long work, and retain the returned exact binding (contract ID, digest, revision, run, host, logical origin) and the task's native completion handle. The URL contains a temporary secret: share it only with the initiating user.

Answer follow-up questions from bounded evidence: run `alpha-aos task context <contract-id> --run <run-id> --contract-digest <digest> --revision <revision> --origin-host <host> --origin-session <logical-id> --limit 50 --json`. For a requested adjustment, write the exact-bound proposal JSON using the documented schema, preview with `alpha-aos task steer <proposal.json> --json`, then submit using `alpha-aos task steer <proposal.json> --apply --json` when authorized. Inspect `alpha-aos task steering <contract-id> --run <run-id> --contract-digest <digest> --revision <revision> --origin-host <host> --origin-session <logical-id> --json` for dispositions. A receipt is not applied; the normal controller must assess it at an existing safe boundary. Expanded authority requires a revised contract and fresh approval.

For a fresh panel without restarting the task, invoke `alpha-aos task attach <contract-id> --run <run-id> --contract-digest <digest> --revision <revision> --origin-host <host> --origin-session <logical-id> --json`. The browser uses finite sessionStorage viewer authority scoped to the panel origin and exact binding; reload works only before expiry. Authentication failure clears it; obtain a fresh attach if needed. Closing the observer does not stop the task. Keep the native completion handle awaited through transport yields; do not run model reporting loops. Awaited foreground delivery is independent of this panel. Idle native chat push and automatic idle-session model wakeup remain unsupported; the common panel does not establish either.

### Session and Worker Model Routing
- The initiating session (A/model1) remains the user's coordination surface. It does not have to be the contract's worker/controller model.
- Encode the user's approved reasoning/orchestration, implementation and independent review assignments in `agentPolicy.controller`/`controllerModel`, `executor`/`executorModel`, and `reviewer`/`reviewerModel`. For example, B/model2 may control reasoning while A/model3 implements. Display all three assignments before approval; clarify any missing assignment that cannot be resolved from existing explicit user choices.
- Launch the existing runner, which dispatches the approved harnesses/models through native adapters. Do not replace it with handwritten Node orchestration, inline implementation, or assumed UI model switching. Unsupported models, missing authentication, missing native capability proof and sandbox refusals remain explicit blockers; never silently downgrade or substitute a model.
- Retain and await the native completion handle and exact contract/run IDs until the final recovery-chain outcome. Resume yielded transport through its exact handle without asking the user to request status. Report outcomes from runner evidence; process exit and a rejected intermediate attempt are not the final GSD acceptance decision.
- On Codex pass `--delivery foreground` and the actual `--origin-host`/`--origin-session`; native Codex session environment is detected when present. Other hosts retain their native awaited process handle, but must not claim this verified Codex path without their own delivery proof. Do not invent a session ID. Registration is independent of a progress panel. Detached idle-session wakeup is unsupported and must be disclosed before start.
- When the user wants autonomous correction, show and obtain approval for `recoveryPolicy` in the reviewed contract: `maxRepairs`, `allowWorkspaceRepair`, `allowQuestionRepair`. Only capability-question revisions are delegated; goal, acceptance criteria, roots, models and cumulative resource policy stay fixed. Each revised digest records its root and parent approval. Never remove required evidence or manufacture successful receipts.

Upon start, the command outputs durable, reproducible identifiers and commands for post-chat tracking:
- **Contract ID** & **Run ID**
- Exact status command: `alpha-aos task status <contract-id> --run <run-id>`
- Exact stop command: `alpha-aos task stop <contract-id> --run <run-id> --apply`
- Exact resume command: `alpha-aos task resume <contract-id> --run <run-id> --apply`

---

## Chat-Termination, Process Lifetime & Operator Control (D-10, D-11, D-12)

1. **Foreground / Awaited Task Execution Truth**:
   The explicitly approved start command (`--apply`) is foreground and awaited by default. It does not spawn a detached background supervisor on its own.
   To obtain an independent process lifetime, an explicit command job wrapper (`alpha-aos job start --cwd <dir> --deadline-ms <ms> --apply -- <argv...>`) supplies independent process lifetime under the EXACT SAME user and sandbox identity. The job wrapper does not escape security boundaries or transfer credentials.
2. Even across chat session termination or disconnection:
   Any new shell or terminal process can inspect, stop, or resume an execution using the standard CLI:
   ```bash
   # Check status and verdict
   alpha-aos task status <contract-id> --run <run-id>

   # Full report with criteria verification evidence
   alpha-aos task report <contract-id>

   # Targeted or environment diagnostic
   alpha-aos task doctor <contract-id>
   ```
3. If `--run` is omitted and multiple runs exist, the CLI deterministically queries the latest run and displays its Run ID and start timestamp.
4. `task stop` requests termination; the supervisor marks `stopped` only after actual child process termination is verified.

---

## Efficient Wait & Completion Guidance (No Repetitive Sleep/Status Loops)

To reduce model-driven polling without claiming measured billing or rate-limit savings:
1. **Discourage Repetitive Loops**: Agents and controllers MUST NOT enter repetitive MODEL `sleep`, polling status loops, or busy-wait delay loops while waiting for long-running processes (tests, builds, subagents).
2. **Persistent Native Handles & Continuation**: Keep the initiating tool/process handle awaited until the runtime returns a final chain outcome. If transport yields, resume the exact handle. Use finite runtime deadlines and bounded packets; runtime owns timers. Avoid model-driven unchanged status loops, duplicate edits/tests and redundant monitoring agents. Save verbose logs externally and return bounded evidence.
3. **Exact Identifiers**: Always use exact IDs (`job-` followed by 16 lowercase hexadecimal digits, exact contract ID, canonical `--run`, `--contract-digest`, `--revision`), never moving 'latest' or redundant waiting agents.
4. **Recovery & Real Boundaries**: A transport yield is not task completion. For a lost observer, use exact-identity `task follow` and acknowledge the returned outcome ID; replay does not restart work. Analyze recoverable failures and continue the approved repair/rerun chain. Handoff notes may preserve evidence but must not terminate available authorized work. Stop only for a demonstrated authority expansion, user stop, exhausted resource/quota or external prerequisite. Do not promise idle-session wakeup or zero tokens.
5. **Preserved Authority & GSD Spine**: Ordinary or quick work does not need an autopilot contract just to run an already-authorized build or test. Waiting grants no new process, delegation, or GUI authority. All existing authority boundaries, GSD sole workflow spine ownership, single-writer model inheritance, sandbox isolation, and GUI restrictions remain strictly preserved.

---

## Active Capability Orchestration Rules (D-02)

alpha-AOS provides an integrated capability suite across all supported harnesses. During GSD planning and execution, agents MUST actively invoke these capabilities when triggered by task context:

1. **External Repository & Open Web Investigation (ORCH-01)**:
   - **Trigger**: Tasks referencing external git repositories, third-party libraries, unfamiliar documentation URLs, or web resources.
   - **Mandatory Capabilities**:
     - `web_search_exa`: Candidate source and repository discovery.
     - `firecrawl_scrape`: Deep extraction of authoritative source documentation, release notes, or repository READMEs/APIs.
   - **Rule**: Do not guess external repository structures or API behaviors from internal memory. Execute active discovery and extraction before finalizing plans or editing code.

2. **Official Documentation Grounding (ORCH-02)**:
   - **Trigger**: Tasks modifying package dependencies, updating framework versions, or integrating library APIs.
   - **Mandatory Capabilities**:
     - Context7 (`resolve-library-id`, `query-docs`): Direct lookup of official, versioned library documentation.
   - **Rule**: Verify library APIs and release notes against Context7 before making breaking changes or updating dependency manifests.

3. **Cross-Agent & Session Boundary Continuity (ORCH-03)**:
   - **Trigger**: Phase completion, cross-harness task transitions (e.g. Codex ↔ Claude ↔ Antigravity), or session pause/resume.
   - **Mandatory Capabilities**:
     - ECC Unified Memory vault (`unified-memory` skill / `ecc memory` CLI): Persisting structured handoff context into `.ecc/memory/`.
   - **Rule**: Any critical architectural decision, phase summary, or uncommitted task state must be recorded for continuous recall across harnesses.

---

## Safety & Boundary Rules

1. **Explicit Per-Task Consent**: Autopilot consent for Task A NEVER extends to Task B. Each new task requires its own path selection and explicit approval.
2. **Adjacency Separation**: If `alpha-aos-control` (environment/pack check) and `alpha-aos-task` triggers fire adjacent to each other, both retain their separate security boundaries. Environment setup checks never authorize task execution.
3. **Empty Request Refusal**: A task request with no goal or empty description must never generate an approvable contract.
4. **Ordering Invariant**: The workflow MUST strictly follow:
   `Path Selection → Read-Only Preview → Exact Digest Approval → Separate Start → Status/Report Tracking`.
   No step may be skipped or reordered.
5. **No Inline Chat Execution in Autopilot Mode (Fail-Closed Invariant)**:
   - When a task operates in `mode: autopilot`, the conversational chat agent is strictly forbidden from executing task steps inline via chat tool calls (`write_file`, `edit_file`, or running inline code generators).
   - Inline execution binds model selection to the interactive UI dropdown (e.g. Gemini Flash) rather than the contractually approved model tiers (e.g. Gemini Argon / Claude Opus / GPT-4o).
   - Autopilot tasks MUST execute exclusively via headless, isolated child processes dispatched by the background supervisor or runner script with explicit CLI model flags (`--model`).
   - If an agent is in an interactive chat session and an autopilot task is approved, task implementation belongs to the separate runner rather than inline repo writes in the chat conversation. Invoking preview, approved `task approve`, authorized `task start`, and status/report/stop tools from that conversation is permitted orchestration, not inline task implementation.
6. **Mode Preference Invariant (No Authority Expansion: D-04, D-11)**:
   - Setting or querying project behavior mode (strict or flexible) is purely a project-level preference for task intake.
   - A mode change request MUST NOT be treated as task execution consent, autopilot start authorization, a style default, or permission to alter an active task's contract, style, or plan.
   - Flexible mode does NOT bypass exact-digest contract approval, separate start command requirements, or isolated external runner boundaries.

## GUI verification orchestration

Managed Cua is the default GUI provider for every task. When app/browser work is impractical through a suitable CLI/API, proactively use the `computer-use` guide and run `alpha-aos computer-use doctor --json`. In ordinary GSD and quick, use the default `cua` MCP connection (`computer-use native-mcp`, native standard permissions), without creating an autopilot contract. Explicit user permission for GUI access means choosing alpha-AOS-managed Cua within that task's scope; honor it without repeating provider or automatic/manual questions. Missing authority, wider effects and foreground takeover still require the relevant permission. Tool availability alone grants no desktop authority.

For ordinary GSD and quick, offer automatic GUI work or manual user verification only when no GUI choice has been given. For autopilot, keep the bounded CLI/MCP broker and automatically execute deterministic, reversible checks already covered by the approved task grant; record the choice without asking again for the same authority. Keep retained anchors and screenshot/action evidence for bounded verification. Native standard GUI work uses the driver's permission/session evidence and fresh observed postconditions; do not claim the bounded broker's audit guarantees for that route. Human judgment, missing permission and unsupported delivery remain explicit checkpoints. An unverified/unknown outcome is never a completed verification.
