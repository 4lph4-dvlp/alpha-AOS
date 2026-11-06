# Architecture Research

**Milestone:** v0.7.0 Autopilot Reliability & Recovery
**Researched:** 2026-11-05
**Confidence:** HIGH for existing integration points; proposed design requires phase planning.

## Existing Structure

- Contract validation and approval: task-contract.ts and CLI readiness.
- Native dispatch and MCP adapter: task-agents.ts, task-codex.ts, task-native-capability.ts.
- Attempt supervision, limits and effects: task-supervisor.ts, task-strategy.ts, task-journal.ts and task-effects.ts.
- Durable session events and panel: task-session.ts, task-progress-launch.ts, task-progress-panel.ts.
- Observation: task-wait.ts, completion-wait.ts and command-jobs.ts.
- GSD remains the sole owner of phase, plan, verification and project-state transitions.

## Confirmed Integration Gaps

1. readTaskStartReadiness computes readiness without task-specific capability invocation readiness; assertTaskCapabilityPorts only proves that a port object exists.
2. Native MCP errors are collapsed to a tool-name message and thrown before their failed result is retained.
3. publishTaskSessionEvent returns when no binding exists. CLI start creates origin binding via the optional progress-panel callback. There is no equivalent demonstrated default host wakeup in this path.
4. readTaskSessionPacket exposes nativeDelivery unknown; taskPanelCapabilities reports native delivery disabled and wakeup unknown.
5. The supervisor chooses prompt-injection strategies from repeated fingerprints. This is not a typed contract/runtime repair mechanism.

## Proposed Flow

Approved intent -> obligation-aware contract preparation -> explicit execution/repair grant -> durable origin binding -> supervised attempt -> typed outcome.

From the typed outcome:
- Accepted: verify GSD evidence and process closure, persist final outcome, deliver and acknowledge.
- Recoverable: diagnose -> authorized corrective action -> verify delta -> checkpoint -> next attempt.
- Authority expansion or genuine external stop: preserve evidence and deliver the exact required user action.
- Observer disconnect: runtime continues within authority; reconnect replays the durable outcome without re-executing work.

These are responsibilities, not a second GSD lifecycle.

## Components to Modify or Add

| Component | Change |
|---|---|
| Contract planner/readiness | Shared obligation/adapter/schema validation; explicit states for executable, blocked and needs-input. Do not consume approval during a refused start. |
| Native capability adapter | Structured scrubbed error taxonomy and useful failure evidence; task-aware source selection; truthful successful receipts. |
| Session binding/outcome store | Bind origin before work starts; retain contract/digest/revision, chain and attempt identities; distinguish attempt from chain outcomes. |
| Origin delivery adapter | Register real host completion/continuation handles, persist pending outcomes and acknowledgements, reconcile reconnects and duplicate delivery. |
| Recovery controller | Choose and execute contract, environment or code repair under an explicit grant; record verification and revision ancestry before retry. |
| Guidance distribution | Align skill source, generated guidance and packaged documentation with the implemented continuation protocol. |

## Host Truth

Codex app-server provides notifications to connected clients and thread resume APIs. That alone does not establish a supported route for an unrelated process to inject a turn into the currently open Codex app session. Phase work must prove the origin host path before promising completion-driven continuation. [App-server](https://learn.chatgpt.com/docs/app-server).

Antigravity headless output can carry a terminal result, and streaming input can keep a process conversation alive. This is a useful reference interface, not evidence that the user's previously observed Antigravity repairs happened through this implementation. [Headless mode](https://antigravity.google/docs/cli/headless/).

## Build Order Suggested for Roadmap

35: Executable contracts and actionable capability failures.
36: Durable origin-session completion delivery and recovery-chain outcome identity.
37: Authorized diagnosis, corrective action, revision handling and rerun.
38: Installed guidance alignment and end-to-end evidence under the workstation delivery policy.

This is a proposal, not an approved roadmap. Host feasibility should be investigated at the start of Phase 36 before spending on a bridge that cannot reach the originating session.

## Sources

[EVIDENCE.md](EVIDENCE.md) links local symbols and records. No production runtime changes or old external task restart occurred during research.
