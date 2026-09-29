# Stack Research: Universal Autonomous Work (v0.2.0)

## Recommendation

Retain Node.js 24+, TypeScript, the existing GSD Core stable lock, and the repository's file transactions and process boundary. Add no general agent framework or orchestration dependency. The supervisor belongs in alpha-AOS and GSD continues to own project planning and lifecycle state. Versioned adapter contracts are more valuable here than a new library.

## Native agent surfaces

| Harness | Documented machine interface | Plan implication |
|---|---|---|
| Codex | `codex exec` with JSONL and JSON Schema output | Parse terminal result, record session ID and usage; run independent reviewer in a fresh read-only session. [OpenAI documentation](https://learn.chatgpt.com/docs/non-interactive-mode) |
| Claude Code | `claude -p` with JSON / stream JSON and optional JSON Schema | Validate both process status and structured result. [Claude Code documentation](https://code.claude.com/docs/en/headless) |
| Antigravity CLI | `agy -p` with JSON / stream JSON, status and usage | Confirm installed binary/version and credentials before advertising support. [Antigravity documentation](https://www.antigravity.google/docs/cli/headless/) |
| Pi | `pi --mode rpc`, long-lived JSONL session with prompt and completion events | Prompt acceptance is not task completion; the adapter must wait for the terminal run event. [Pi documentation](https://pi.dev/docs/latest/rpc) |
| Hermes | `hermes chat --oneshot --query-file` and `--format stream-json` | Installed-version probe must pin flags and terminal result shape. Do not interpolate task text into shell commands. [Hermes documentation](https://hermes-agent.nousresearch.com/docs/reference/cli-commands/) |

The five documented interfaces establish candidates, not release-grade support receipts for this workstation. Probe exact versions, authentication, launch behavior, cancellation, structured results, native skill/MCP access, and state isolation with real invocations. No cost assumption follows from a harness name; record configured provider and the usage fields actually returned by that provider.

## Existing integration points

- `src/core/process.ts` has bounded, redacted subprocess execution and a protocol session. Extend its public cancellation behavior rather than spawning children directly.
- `src/core/transaction.ts`, `src/core/writer-lock.ts`, and `src/core/recovery-receipt.ts` provide safe managed writes and recovery patterns. Agent attempts and external effects need their own append-only run journal.
- `src/core/capability-ledger.ts` and `src/core/support-matrix.ts` can distinguish planned support from version-scoped native invocation proof.
- `src/core/project-pack-sync.ts`, `src/core/ecc-skills.ts`, `src/core/mcp.ts`, and the `alpha-aos-control` owned skill supply pack planning, digest-bound approval, global/project delivery and native configuration. The task supervisor must consume these surfaces and prove actual calls after a fresh-session activation.
- `.gsd/capabilities/alpha-aos/capability.json` has GSD gate seams. A gate receipt must attest that a reviewer actually ran against the exact candidate revision.
- `src/core/worker-authority.ts` hard-codes Hermes as worker-only. Replace name-based eligibility only after controller ownership and native validation exist.

## Cross-platform implementation constraints

Use argument arrays, absolute executables, bounded streams, explicit environments, and no shell interpretation for user prompts. Node's `spawn` has timeout and AbortSignal support, but killing the immediate child does not reliably terminate descendants; reuse and extend alpha-AOS's existing process-tree termination. [Node.js 24 child process reference](https://nodejs.org/docs/latest-v24.x/api/child_process.html)

## Avoid

- A second project lifecycle database or direct `.planning/` state transitions outside GSD.
- An always-on service as a prerequisite for a local CLI task.
- An unverified claim that all harness roles work on all hosts merely because an executable is installed.
- Per-task installation or invocation of unrelated ECC capabilities or MCP tools; inventory the full alpha-AOS set, use native discovery and intent-matched GSD-step selection, and require real call receipts for applicable mandatory capabilities.
