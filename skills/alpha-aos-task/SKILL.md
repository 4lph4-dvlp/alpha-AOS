---
name: alpha-aos-task
description: "Natural-language task entry and autonomous workflow coordinator for alpha-AOS. Automatically triggers on natural task requests, new task intents, or requests for autonomous autopilot execution. Guides the user between ordinary conversational GSD (default) and explicitly requested autonomous autopilot, generates read-only task contract previews, explains exact digest approval and separate start commands, and coordinates task status tracking across Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent."
---

# alpha-AOS Natural Task Entry & Autonomous Workflow Coordinator

## Objective

Serve as the natural-language task coordination interface for alpha-AOS across all supported harnesses (Claude Code, Codex, Antigravity, Pi Agent, Hermes Agent). Guide user task requests to either ordinary conversational GSD (default) or explicitly requested per-task autonomous autopilot. Enforce strict authorization boundaries: a conversational prompt or mode switch is never an authorization to execute mutations.

---

## Decision Rules for Task Intake

### 1. General Task Request (Default Path: D-01, D-02)
When a user expresses a general task request (e.g., "Implement feature X", "Fix bug Y", "Write tests for Z"):
1. Briefly clarify the core goal and scope.
2. Present a clear two-path choice to the user:
   - **Ordinary Conversational GSD (Recommended / Default)**: Interactive, step-by-step workflow within the current conversation (`$gsd-quick`, `$gsd-execute-phase`, or `$gsd-debug`).
   - **Autonomous Autopilot**: Isolated, bounded, background-supervised execution governed by an explicit task contract.
3. **If user chooses Ordinary GSD (or defaults to it)**:
   - Continue immediately within the same conversation in the appropriate GSD workflow.
   - Do NOT require the user to re-enter a separate CLI command.
   - Do NOT create task contracts, supervisor records, or background run files.

### 2. Ambiguous Autopilot Request (D-03)
When the user opts into autopilot but the goal, acceptance criteria, or allowed mutations/effects are ambiguous:
1. Do NOT guess or hallucinate permissions, boundaries, or criteria.
2. Ask only clarifying questions needed to resolve the missing criteria and boundaries.
3. Only once the requirements are unambiguous, proceed to generate the read-only contract preview.

### 3. Explicit Autopilot Request (D-04)
When the user explicitly asks for autonomous autopilot up front (e.g., "Run this in autopilot", "오토파일럿으로 실행해줘", "Execute under autonomous contract"):
1. Do NOT re-prompt to choose between GSD and autopilot.
2. Verify that goal, acceptance criteria, and allowed effect boundaries are clear.
3. Proceed directly to generating the read-only contract preview.
4. An explicit request is purely a path selection — it is NOT contract approval or execution permission.

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
Contract approval requires an explicit, separate CLI invocation specifying the exact 64-character hex digest and the `--apply` flag:
```bash
alpha-aos task approve <contract.json> --contract-digest <64-char-digest> --apply
```
- A preview without `--apply` writes nothing.
- An approval without the matching `--contract-digest` is refused (contract drift protection).
- Approval grants permission for a single run of that exact revision. Modifying the contract requires a new revision and fresh approval.

### Step 3: Separate Execution Start Command (D-09, D-10)
Initiating execution is a distinct, separate manual command following approval (the skill must never trigger execution directly):
```bash
# Executed manually by the user in a terminal:
alpha-aos task \
  start <contract.json> --contract-digest <64-char-digest> --apply
```
Upon start, the command outputs durable, reproducible identifiers and commands for post-chat tracking:
- **Contract ID** & **Run ID**
- Exact status command: `alpha-aos task status <contract-id> --run <run-id>`
- Exact stop command: `alpha-aos task stop <contract-id> --run <run-id> --apply`
- Exact resume command: `alpha-aos task resume <contract-id> --run <run-id> --apply`

---

## Chat-Termination & Operator Control (D-10, D-11, D-12)

Even if the original chat session terminates or disconnects:
1. The background execution runs under supervisor control in an independent process.
2. Any new shell or terminal process can inspect, stop, or resume the execution using the standard CLI:
   ```bash
   # Check status and verdict
   alpha-aos task status <contract-id>

   # Full report with criteria verification evidence
   alpha-aos task report <contract-id>

   # Targeted or environment diagnostic
   alpha-aos task doctor <contract-id>
   ```
3. If `--run` is omitted and multiple runs exist, the CLI deterministically queries the latest run and displays its Run ID and start timestamp.
4. `task stop` requests termination; the supervisor marks `stopped` only after actual child process termination is verified.

---

## Safety & Boundary Rules

1. **Explicit Per-Task Consent**: Autopilot consent for Task A NEVER extends to Task B. Each new task requires its own path selection and explicit approval.
2. **Adjacency Separation**: If `alpha-aos-control` (environment/pack check) and `alpha-aos-task` triggers fire adjacent to each other, both retain their separate security boundaries. Environment setup checks never authorize task execution.
3. **Empty Request Refusal**: A task request with no goal or empty description must never generate an approvable contract.
4. **Ordering Invariant**: The workflow MUST strictly follow:
   `Path Selection → Read-Only Preview → Exact Digest Approval → Separate Start → Status/Report Tracking`.
   No step may be skipped or reordered.
