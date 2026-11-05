# Stack Research

**Milestone:** v0.7.0 Autopilot Reliability & Recovery
**Researched:** 2026-11-05
**Confidence:** HIGH for inspected code and historical records; MEDIUM for host integration feasibility.

## Recommended Stack

Retain Node.js >=24, TypeScript, the existing MCP SDK, transactional state, command jobs and GSD lifecycle. No new dependency or model change is established by this research. Versions remain those in package.json and the stable lock; current upstream documentation is guidance, not proof that every pinned server exposes the same schema.

| Concern | Existing component | Recommended change |
|---|---|---|
| Contract readiness | src/cli.ts readTaskStartReadiness; task-contract.ts | Evaluate task-specific obligations against the actual invocation adapter, transport, schema and credential availability before presenting a runnable contract. Separate pure inspection from authorized service calls. |
| Tool execution | src/adapters/task-native-capability.ts | Preserve scrubbed protocol/tool error details; validate actual response content and task relevance. Bind evidence to the actual invocation context. |
| Completion | completion-wait.ts; command-jobs.ts; task-session.ts | Reuse bounded runtime observers and durable event storage; add proven origin-session delivery and acknowledgement instead of another state spine. |
| Recovery | task-supervisor.ts; task-strategy.ts | Add typed recovery actions for contract, runtime and external failures, not only repeated prompt injection. |
| Authority | task-contract.ts; task-effects.ts; task-journal.ts | Explicit repair authorization and revision lineage, preserving models, allowed roots, budget and GSD ownership. |

## Native Integration Boundaries

Codex exec JSONL and app-server JSON-RPC are different protocols. The CLI exposes dotted terminal events; app-server exposes slash-separated turn notifications. Do not feed one parser the other wire format. [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [App-server](https://learn.chatgpt.com/docs/app-server).

The inspected task-codex.ts already parses exec terminals. This makes the missing origin-session continuation a separate integration problem, not a reason to replace all Codex execution code.

Exa's hosted endpoint and pinned local npm process are distinct transports. The native adapter launches the pinned npm package through upstreamProcessSpec. Working Exa tools in this chat do not prove that process has the same authentication, configuration or surface. [Exa MCP](https://exa.ai/docs/get-started/exa-mcp).

## Alternatives Considered

- A new workflow engine: unnecessary; GSD already owns project lifecycle.
- Permanent model-driven status loops: do not repair missing delivery and consume inference on unchanged state.
- A separate app-server process as an assumed connection to this existing desktop conversation: not established by public documentation. Prove the actual host integration first.
- Removing mandatory capability obligations to make runs green: hides the failure instead of repairing it.
- Broad dependency upgrades: not justified by the observed failure.

## Sources

Local: src/adapters/task-agents.ts, task-native-capability.ts, task-codex.ts; src/core/task-session.ts, completion-wait.ts, task-contract.ts and task-supervisor.ts. Historical record identities and limitations: [EVIDENCE.md](EVIDENCE.md).
