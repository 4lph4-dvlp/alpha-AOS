# Efficient Wait & Reactive Completion Guide

alpha-AOS v0.4.5 introduces declarative, event-driven process lifetime and completion tracking (`alpha-aos job` and `alpha-aos task wait`) across all five supported AI agent harnesses. This guide provides runnable commands, architecture principles, and security invariants for eliminating repetitive model `sleep` or polling loops.

---

## 1. Core Principles & Architecture

### The Problem: Repetitive Polling & Context Ballooning
In user dogfooding reports, agents using iterative `sleep` or status checks to wait for long-running operations (test suites, builds, subagents) were observed incurring repeated wakeups. In those reports, conversational context was estimated at 200k–300k+ tokens per turn, and repeated polling loops were associated with rapid provider rate limit exhaustion.

> [!NOTE]
> Reported turn counts, 200k–300k+ token volumes, and rate limit exhaustion are user-reported unmeasured estimates from dogfooding observations, not established provider billing or host behavior. The alpha-AOS runtime can eliminate model-driven polling on its execution path; it cannot promise to prevent host rate-limit exhaustion or quantify token/cost savings.

### The Solution: Event-Driven Waiting
1. **Single Finite Observation**: Replace repetitive loops with ONE runtime observation using a finite timeout that covers the expected work duration.
2. **Persistent Native Handles**: Use exact IDs (`job-<16-hex>` matching `^job-[0-9a-f]{16}$`, exact contract ID, run ID, digest, and revision) rather than floating queries like "latest".
3. **Truthful Foreground Task Start vs. Detached Jobs**:
   - `alpha-aos task start --apply` is **foreground and awaited** by default.
   - `alpha-aos job start --apply` provides an **independent process lifetime** under the **exact same user and sandbox identity**.
4. **CWD is Not a Sandbox**: The `--cwd` directory flag sets the working directory only; it is not a filesystem sandbox. Jobs retain the caller's OS and sandbox authority and cannot escape it.
5. **No Zero-Token or Host Wakeup Guarantee**: alpha-AOS does not promise zero model wakeups or zero tokens. If a host transport yields or native completion callbacks are unavailable in the host harness, the agent must acknowledge this host limitation and use durable reconnect or handoff rather than spinning in busy-wait loops.
6. **Observer Expiry != Cancellation**: When an observer timeout expires (`--timeout-ms`), the observer disconnects, but **this does not cancel the underlying job** (`observer expiry != cancellation`). The job continues running in the background. Do not automatically retry uncertain work after an observer expiry.

---

## 2. Command Jobs (`alpha-aos job`)

Command jobs decouple long-running processes from the interactive terminal session while keeping state and logs outside the target repository.

### Runnable Command Reference

#### 1. Start a Detached Job
Run after repository build using portable direct Node invocation (Windows `npm.cmd` or `.ps1` wrappers are rejected; invoke the Node npm CLI or target script directly):

```bash
alpha-aos job start \
  --cwd . \
  --deadline-ms 1200000 \
  --apply \
  --json \
  -- node scripts/run-tests.mjs
```

- **Dry-run preview**: Omission of `--apply` outputs a preview and performs **NO side effects** (no process spawned, no state created).
- **Exact Job ID**: Returns a JSON payload with an exact `jobId` (format `job-` followed by 16 lowercase hex characters, e.g. `job-4a8b1c2d3e4f5a6b`). Processes that do not exit immediately report `status: "running"`; short-lived commands or early handshakes may finish or fail before initial return, so callers must not assume the job is always running.
- **Verbatim Argument Preservation**: All arguments after `--` (including `--help`, `-h`, `--json`, spaces, quotes, and metacharacters) are passed directly to `execFile`/`spawn` as an argument array, never concatenated into shell strings.

#### 2. Wait for Completion
Wait with an explicit finite timeout covering expected work (e.g. 1,205,000 ms for a 1,200,000 ms process deadline):

```bash
alpha-aos job wait <job-id> --timeout-ms 1205000 --json
```

- **Explicit Timeout Choice**: Default observer timeout is 5 minutes (300,000 ms) if omitted. Explicitly specify a sufficient finite timeout once; do not loop on 5-minute expiries.
- **Exit Code Contract**:
  - Exits with `0` when the job finishes with exit code 0 (`status: "completed"`, `exitCode: 0`).
  - Exits **non-zero** on non-zero process exit, failure, cancellation, or observer timeout (`status: "failed"`, `status: "cancelled"`, etc.).
  - On exit or observer expiry, the JSON payload reports actual terminal or observer status fields (e.g. `status`, `exitCode` when available). When child streams have emitted data, bounded stdout/stderr excerpts are included, but callers should not assume excerpts or success/status fields are always populated if spawn fails early or streams remain empty.

#### 3. Inspect Status
Query current state without modifying anything:

```bash
alpha-aos job status <job-id> --json
```

#### 4. Cancel a Running Job
Request cancellation with an optional forwarded termination timeout:

```bash
# Dry-run preview of cancellation (no cancel.request written, job keeps running)
alpha-aos job cancel <job-id> --json

# Apply cancellation
alpha-aos job cancel <job-id> --timeout-ms 5000 --apply --json
```

### Job Security & Isolation Guardrails
- **Environment Allowlist**: Job child processes run with a strictly limited environment allowlist. Provider API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) and execution interceptors (`NODE_OPTIONS`) are excluded.
- **Credential Argv Forbidden**: Command arguments matching known credential patterns or secrets are refused before spawn.
- **External State Root**: Job records and output streams are stored outside the repository under `~/.alpha-aos/jobs/<job-id>/` (`ALPHA_AOS_STATE_DIR`), keeping repository git trees clean.
- **Owner Fencing**: Cancellation requests require owner authorization; arbitrary PID cancellation is prevented.
- **Bounded Output**: Child process output retained in memory and written to state records has a combined retained child output ceiling of 64 KiB (`MAX_COMBINED_OUTPUT_BYTES`), sanitizing and truncating large streams. This 64 KiB ceiling applies specifically to retained child stdout/stderr output excerpts, distinct from larger envelope or record byte limits. Total runtime process memory is not claimed to be 64 KiB.

---

## 3. Autonomous Task Wait (`alpha-aos task wait`)

The `alpha-aos task wait` command allows an agent or observer to attach to a running autonomous autopilot task until terminal completion.

### Runnable Syntax

```bash
alpha-aos task wait <contract-id> \
  --run <run-id> \
  --contract-digest <64-char-digest> \
  --revision <revision-number> \
  --timeout-ms 600000 \
  --json
```

### Parameters & Identification
- `contract-id`: Exact task contract identifier.
- `--run <run-id>`: Canonical run ID (obtainable from `alpha-aos task status <contract-id>` or task start output).
- `--contract-digest <digest>`: Exact 64-character SHA-256 contract digest.
- `--revision <num>`: Exact integer revision number.
- `--scope [attempt|supervisor]`: Optional scope. Defaults to `attempt` (observes the canonical run disposition). `supervisor` observes supervisor checkpoint progress.
- `--timeout-ms <ms>`: Observer wait timeout.

Supervisor scope keeps `runId` as the requested origin. A fully explicit, ordered retry chain under the observed controller fence may report its final canonical execution as `observedRunId`; it never follows a directory's latest record. Attempt scope always stays on the requested run.

Existing producer records that omit retry run IDs or rotate the observed owner fence cannot prove this continuity and remain explicitly unsupported or mismatched. This limitation does not change the normal foreground, awaited `task start --apply` path. Use its existing native completion handle for an active autopilot run.

### Task Verification Invariants
- **Exit 0 Contract**: Exits `0` only when the observed task run reaches terminal `status: "accepted"`.
- **Anti-Forgery Guardrail**: A task cannot succeed based on checkpoint state alone. If no canonical run record exists under `~/.alpha-aos/tasks/<contract-id>/runs/<run-id>.json`, `task wait` refuses and exits non-zero. Manual task wait linkage for unsupported legacy supervisor records remains explicitly unresolved and is never inferred from a checkpoint.
- **Read-Only Operation**: `--apply` is strictly forbidden on `task wait` and `task status`.

---

## 4. Five-Harness Support Matrix

Shared alpha-AOS wait guidance and CLI commands are portable across all supported harnesses. However, native notification delivery and background hook behaviors differ by harness.

| Harness | Ordinary Mode | GSD Quick Mode | Approved Autopilot Mode | Native Completion / Notification Claims |
| :--- | :--- | :--- | :--- | :--- |
| **Claude Code** | Native bash tool; run foreground commands or `job start` | Run `$gsd-quick` in session; wait via `job wait` for long test runs | Bounded autopilot; observe via `task wait` or `job wait` | Native async completion delivery is **not measured**; use portable CLI `job wait` / `task wait`. |
| **Codex CLI** | Native bash execution; run `job start` / `job wait` | Run `$gsd-quick`; single observation with finite timeout | Bounded autopilot contract; observe via `task wait` | Supports JSON terminal events ([non-interactive mode docs](https://learn.chatgpt.com/docs/non-interactive-mode)). Background hook completion **does NOT start a new user turn** ([hooks docs](https://learn.chatgpt.com/docs/hooks)). |
| **Antigravity** | Native terminal tool; run foreground checks or `job start` | Run `$gsd-quick` workflow; single observation via `job wait` | Bounded autopilot; single-writer model inheritance enforced | Native async wakeup is **not measured**; use portable CLI `job wait` / `task wait`. |
| **Pi Agent** | Native terminal execution; run `job start` / `job wait` | Run `$gsd-quick`; observe tests via `job wait` | Bounded autopilot; observe via `task wait` | Native async completion delivery is **not measured**; use portable CLI `job wait` / `task wait`. |
| **Hermes Agent** | Authorized worker commands use `job start` / `job wait` | GSD lifecycle stays with the configured supported controller; workers can observe jobs | Executor/worker only; observation grants no controller role | Native async completion delivery is **not measured**; portable CLI observation does not establish native controller parity. |

### Architectural References
- **Local Event Notification**: Node.js v24 `node:fs` (`fs.watch`) and `node:child_process` (child `close`/`exit` events) provide the primary, portable architectural foundation for local event-driven completion.
- **OpenAI Codex Docs**:
  - Non-interactive terminal events: [https://learn.chatgpt.com/docs/non-interactive-mode](https://learn.chatgpt.com/docs/non-interactive-mode)
  - Lifecycle hooks: [https://learn.chatgpt.com/docs/hooks](https://learn.chatgpt.com/docs/hooks) (confirms background hooks do not trigger new model turns).
- **Authentication & Isolation**: The same host-user credentials are required for all harness operations. Sandbox authentication issues cannot be resolved by weakening security boundaries or sandbox isolation.

The approved BUG-06 plan originally targeted 0.4.1. Integration preserves original main 0.4.4 (29619ab) and prepares candidate 0.4.5; historical computer-use 0.4.0 evidence is unchanged.
