# BUG-06 Root Cause Analysis & Resolution Architecture

## 1. Overview & Reported Incident

In dogfooding long-running workflows under the Codex CLI and Antigravity harnesses, repetitive model polling (`sleep(45000)` and `wait_agent`) was observed during test runs and builds. A user dogfooding report recorded 52 `sleep` calls and 13 `wait_agent` calls during a single task run, leading to estimated context ballooning (~200k–300k+ tokens retransmitted each turn) and two consecutive 5-hour rate limit exhaustions.

> [!NOTE]
> Reported turn counts, 200k–300k+ token volume estimates, and provider rate limit exhaustions from user dogfooding are documented as user-reported unmeasured estimates and motivating context, not established provider billing or host behavior. The alpha-AOS runtime can eliminate model-driven polling on its execution path; it cannot promise to prevent host rate-limit exhaustion or quantify token/cost savings.

---

### 2026-10-27 measured Codex baseline and scope

External `codex-consumption-baseline-20261027.json` records one historical Codex thread, deduplicated by response_id: 175 responses, 31 wait calls, 126 exec calls, 547482 retained tool-output characters; cumulative input33050982 (cached32456192), output178670 (including reasoning125256), per-request input27833 to356832. All three historical review subagents used fork_turns none. The record shows large accumulated context and repeated observations; it does not isolate waste, wait-only usage, quota causes or subscription billing. Cached input is not equivalent to uncached cost. There is no matched cross-harness baseline or measured savings.

User prioritizes Codex consumption before release work. Guidance now forbids unchanged status rereads, model babysitters around active controllers and full old transcripts solely for monitoring; runtime owns finite waiting and external logs bound returned evidence. A short native start/wait probe can establish pending-to-terminal behavior, not long transport behavior or token reduction. Current source0a04c96 ordinary group1807total/1796pass/0fail/11skip preceded a packed lifecycle exceeding the enclosing npm-test child20-minute limit: the whole release FAILED. Package/provenance, Stage1/Stage3 criteria, final GSD verification and integration remain pending. Historical evidence below is not a current active-worker or release-success claim.

## 2. Actual Root Cause Analysis

Investigation revealed that the system defect was not an inability of Node.js to handle asynchronous processes, but a **layer mismatch and prompt/guidance flaw**:

1. **Process Runner Was Already Event-Driven**:
   The low-level execution layer in alpha-AOS (`src/core/process.ts`) already utilized Node.js event-driven APIs (`child_process.spawn`, stream events, and exit callbacks).
2. **Model Guidance & Skill Layer Encouraged Polling**:
   The generated controller prompt, owned task skill (`alpha-aos-task`), and Codex execution policy lacked explicit directives against busy-waiting. LLMs defaulted to iterative `sleep` loops to observe progress.
3. **Foreground / Background Lifetime Mismatch**:
   The skill claimed autonomous autopilot ran as an "independent background supervisor", whereas `alpha-aos task start --apply` was actually synchronous/foreground and awaited. No first-class detached job primitive existed for running external scripts (such as repository test suites) with an independent process lifetime under the same user identity.

---

## 3. Implemented Architecture & Runtime

### A. Detached Command Jobs (`alpha-aos job`)
- `job start`: Detaches long-running commands, assigning an exact `jobId` (format `job-` followed by 16 lowercase hex characters, not UUID). Arguments after `--` are preserved verbatim as an argument array without shell concatenation.
- `job wait`: Attaches a single observation with an explicit finite timeout covering expected work. Exits 0 on success or non-zero on failure/timeout.
- `job status`: Non-mutating status queries.
- `job cancel`: Cancellation requires `--apply` and writes an authenticated `cancel.request` rather than killing arbitrary PIDs.
- Observer expiry (`--timeout-ms`) disconnects the observer without terminating the job (`observer expiry != cancellation`).

### B. Canonical Autonomous Task Observation (`alpha-aos task wait`)
- Observes running task runs via exact coordinates: `--run <run-id>`, `--contract-digest <digest>`, `--revision <rev>`.
- Fails closed if canonical run records do not exist on disk, preventing forged checkpoint attacks. Manual task wait linkage for unsupported legacy supervisor records remains explicitly unresolved.

### C. Prompt & Skill Enforcement
- Updated `src/core/task-gsd.ts` (`buildGsdControllerPrompt`), `skills/alpha-aos-task/SKILL.md`, and `docs/codex-execution-policy.md`.
- Models are explicitly instructed to avoid repetitive sleep/status loops, use ONE runtime observation with a finite timeout, and use exact IDs.

---

## 4. Security & Isolation Fixes

1. **Restricted Environment Allowlist**: Strips provider API keys (`OPENAI_API_KEY`, etc.) and injection hooks (`NODE_OPTIONS`).
2. **Credential Argv Filtering**: Rejects arguments containing secret patterns before spawn.
3. **External State Root**: State and logs reside in `~/.alpha-aos/jobs/`, preventing repository pollution.
4. **Owner Fencing**: Only the job owner/process can request cancellation.
5. **Bounded Output Ceiling**: Combined retained child output ceiling is 64 KiB (`src/core/command-jobs.ts` `MAX_COMBINED_OUTPUT_BYTES`), sanitizing and truncating large child stdout/stderr output excerpts. This is distinct from larger record/envelope limits, and total runtime process memory is not claimed to be 64 KiB.
6. **CWD Boundary Clarification**: `--cwd` sets working directory only; jobs retain caller OS/sandbox permissions and cannot escape isolation boundaries.

---

## 5. Current Test Evidence & Pending Gates

### Established Evidence
- **Historical Targeted Slice**: 67/67 tests passed with 0 failures and 0 skips at implementation commit `0320c27`.
- **Broader Test Suite**: 69 total cases evaluated (63 pass, 6 fail) across broader coverage.
- **Independent GPT-6.1 Review**: Subsequent independent review recorded in `task-wait-resolution-review.md` identified 5 blockers and 2 warnings.
- **Active Worker Repairs**: Repairs are actively in progress by Worker D (job/verifier/tests) and Worker E (task-observer/tests); no final closure or verified fix has occurred yet.
- **Interim History**: Prior narrow packets addressed historical partial fixes, but no final claim of "all 9 blockers repaired/verified" or "BUG-06 fixed" is valid prior to full completion and gating.
- **Model Execution Context**: Native sandbox run `7c176c2f5feeda16-8b4be419` remains honestly blocked by agy sandbox auth; host-user context is verified and functional (`MODEL_READY`).
- **Platform Scope**: Windows live computer-use evidence from v0.4.0 is retained. macOS/Linux real GUI actions and 3-OS CI remain unrun as requested. No token savings or billing claims are made.

### Remaining Verification Gates
- **Pending Independent Review Resolution**: Active repairs by Workers D and E addressing the 5 blockers and 2 warnings from `task-wait-resolution-review.md`.
- **Final Release Gate & Verifier Suites**: PENDING (to be executed by controller in a later evidence-only packet after actual gates).

Historical scope: the approved plan targeted 0.4.1 from 54ecf50. Current integration includes original main 0.4.4 (29619ab) and prepares candidate 0.4.5; final verification is pending. The committed original user report from 02c2bf7 is retained as input.
