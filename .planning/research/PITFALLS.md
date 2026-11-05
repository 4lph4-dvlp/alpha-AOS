# Pitfalls Research

**Milestone:** v0.7.0 Autopilot Reliability & Recovery
**Researched:** 2026-11-05

## Critical Pitfalls

### 1. Naming a tool is mistaken for having an executable contract

The obligation selector derives requirements from words in the goal and criteria; the contract may mention Exa as a product being updated rather than a research action. Readiness must explain why a capability is required for that step and whether the intended invocation is supported. Preserve genuinely required research; do not suppress it to avoid errors.

### 2. Tool failure details are discarded

nativeCapabilityPort checks isError and replaces the response with a generic exception before adding it to retained calls. Four inspected recovery attempts show the same generic Exa failure. The underlying reason is not recoverable from those receipts. Preserve bounded, scrubbed diagnostics before classification and retry.

MCP distinguishes protocol failure from tool execution errors, supplies input schemas, and supports structured results. Use those surfaces rather than guessing from an undifferentiated rejection. [MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

### 3. A working chat connector proves the runner works

This session's Exa calls succeeded. The historical runner used a separately launched pinned npm server. Authentication, schema, tool filtering and environment can differ. Probe the actual path under the intended identity; never copy chat credentials into a contract.

### 4. No visible panel means no origin binding

The inspected start callback is conditional on progress=panel; publishing an event without a binding returns quietly. Create the session identity and delivery registration independently of UI. Test reconnect-before-terminal, terminal-before-subscribe and duplicate delivery.

### 5. Prompt escalation is treated as repair

The current strategy changes prompts at repeat counts two and three, then blocks at four. A tool failure before useful model work can exhaust that strategy without a corrective action. Classify the failure, change the relevant layer, verify the change, and suppress unchanged retries. Keep quota and resource stops genuine.

### 6. Domain filters make valid official research impossible

The native adapter accepts a fixed host set including docs.exa.ai but not exa.ai, developers.openai.com, learn.chatgpt.com or antigravity.google, and requires at least two allowed URLs. The official pages used in this research can be rejected by that filter. This is a current code-level incompatibility risk, not the proven cause of the historical Exa tool error. Choose and validate sources according to the task and reviewed source policy; preserve URL and network safeguards.

### 7. A receipt factory can manufacture confidence

createFreshSessionCapabilityPort has a default mock-success branch without an invoker. The native default currently uses nativeCapabilityPort, so reachability must be traced before calling this a production incident. Keep synthetic success isolated to explicit test fixtures and require real successful invocation evidence on production paths.

### 8. A handoff document becomes the terminal product

Source guidance says ONE finite runtime wait and allows handoff on host limitations. These instructions may bias session behavior, but causality is not proven. Replace blanket stopping rules with a runtime-owned continuation protocol. Keep durable notes useful while authorized recovery proceeds.

## Other Integration Risks

- Codex exec dotted terminals and app-server slash-separated notifications are not interchangeable.
- A child turn completing is not a GSD task acceptance.
- An attempt rejection is not final while a recovery chain is active.
- A new digest is not automatically authorized merely because its goal sounds similar.
- Failed observers cannot claim task failure or success without reconciling authoritative records.
- Hashing any nonempty response does not establish relevant research content.
- Installed skill pin mismatch, missing source schemas and unavailable credentials need distinct remedies.
- Existing historical notes are stale: the inspected digest now has a four-attempt supervisor checkpoint even though an older handoff said checkpoints were absent.

## Pitfall-to-Phase Mapping

Proposed: Phase 35 handles capability and contract failures; Phase 36 handles delivery/identity races; Phase 37 handles corrective action and authority; Phase 38 handles misleading guidance and scenario evidence.

## Sources

Local source and historical record details: [EVIDENCE.md](EVIDENCE.md). External protocol support: [MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). No failing live task was rerun for this research.
