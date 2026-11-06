# Project Research Summary

**Project:** alpha-AOS
**Milestone:** v0.7.0 Autopilot Reliability & Recovery
**Researched:** 2026-11-05
**Confidence:** HIGH for local findings; MEDIUM for proposed host continuation design.

## Executive Summary

The evidence supports three interacting defects: capability failures lose actionable information, origin-session continuation is not implemented/proven by the existing progress channel, and recovery escalates prompts instead of performing typed corrections. Four historical retries did occur, then stopped without progress. Describing this as no retry at all would be inaccurate; describing it as effective autonomous repair would also be inaccurate.

The reported contract defect must be split into invalid contract construction and a valid obligation with an unusable runtime path. Later historical receipts explicitly show Context7 success and Exa tool failure. The underlying Exa response was discarded, so authentication, argument and service causes remain unresolved.

## Key Findings

### Recommended Stack

Reuse Node, TypeScript, existing MCP client transports, durable jobs/session events, effect ledger and GSD state. No new dependency is justified yet. Research current host interfaces before selecting a wakeup bridge.

### Expected Features

- Executable, task-relevant capability obligations with preflight and actionable failures.
- Durable, exact origin-session identity and verified automatic terminal delivery.
- Bounded diagnosis, actual corrective action, verified delta and safe rerun.
- Explicit revision authority and final outcome evidence without premature handoff.

### Architecture Approach

Keep GSD as sole lifecycle/state owner. Extend the operational runner with a chain identity, typed failures, repair actions and an acknowledged origin-delivery adapter. Progress UI remains an observer; it must not determine whether origin identity exists.

Codex documents terminal events for both exec and connected app-server clients. Neither fact alone proves a route back into an already open app conversation. [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode), [App-server](https://learn.chatgpt.com/docs/app-server).

Exa's official setup includes different transports and tool selection. A successful chat call does not validate the runner's pinned local process. [Exa MCP](https://exa.ai/docs/get-started/exa-mcp).

Antigravity's documented streaming interface provides a comparison surface; the user's observed repair behavior still needs direct evidence. [Headless mode](https://antigravity.google/docs/cli/headless/).

### Critical Pitfalls

- Preserve tool errors before summarizing rejection.
- Do not retry an unchanged pre-model capability failure with only a stronger implementation prompt.
- Do not treat a panel, file watcher or process exit as origin-session continuation or GSD acceptance.
- Do not repair capability failures by removing obligations, manufacturing receipts or broadening authority.
- Replace guidance that makes handoff the default response to a yielded transport.

## Implications for Roadmap

Proposed sequence, pending requirements and roadmap approval:

| Phase | Focus | Dependency rationale |
|---|---|---|
| 35 | Executable contracts and capability diagnostics | Recover useful cause and prevent known-unexecutable starts. |
| 36 | Origin-session completion delivery | Establish actual host continuation and attempt/chain outcome identity. |
| 37 | Authorized repair and rerun | Use cause, delivery and persisted progress to perform effective recovery. |
| 38 | Guidance alignment and lifecycle evidence | Verify distributed behavior and the complete user-visible journey. |

Investigate host feasibility early in Phase 36. If the current origin host cannot accept a supported automatic continuation, expose that limit before task start and resolve the integration design; do not silently replace the requested outcome with a status file.

## Confidence Assessment

| Area | Confidence | Reason |
|---|---|---|
| Exa failure in later historical attempts | High | Four exact-digest run records and paired capability receipts |
| Precise Exa root cause | Low | Failed tool response was discarded |
| Missing demonstrated native wakeup | High for inspected path | Explicit unknown/disabled capability fields; no binding without optional panel path |
| Cross-host repair parity | Medium/Low | Public interfaces reviewed; no live comparative run |
| Prompt/handoff influence | Medium hypothesis | Source wording verified; causal replay not performed |

### Gaps to Address

Preserve the existing failed digest/checkpoint. Do not restart the old clone/contracts as a side effect of this milestone. Prove the current Codex host integration; retain exact approval/model/resource/root boundaries while designing delegated repair. No tests or implementation were performed.

## Sources

Full local evidence inventory, exact run identities, methodology and uncertainty: [EVIDENCE.md](EVIDENCE.md).
Supporting dimensions: [STACK.md](STACK.md), [FEATURES.md](FEATURES.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PITFALLS.md](PITFALLS.md).
