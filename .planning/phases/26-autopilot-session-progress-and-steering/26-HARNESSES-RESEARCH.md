# Phase 26: Originating-session progress — host feasibility research

**Researched:** 2026-10-30  
**Scope:** Antigravity, Claude Code, Pi, Hermes; Codex research is owned by the parent.  
**Confidence:** MEDIUM for documented capabilities; native UI behavior has not been exercised.  
**Result:** Source research complete. Universal passive native transcript support is **not established**. This file does not authorize implementation or installation.

<user_constraints>
## User Constraints (from CONTEXT.md)

The following is copied verbatim from the phase context. [VERIFIED: .planning/phases/26-autopilot-session-progress-and-steering/26-CONTEXT.md:12-39]

<!-- DATA_Q7K2M9RA_START -->
## Locked decisions

- Preserve detached operation for multiple tasks. Add an explicit opt-in session
  reporting mode; do not silently attach to the latest task or arbitrary chat.
- Emit actual lifecycle transitions, role/model/effort, outcomes and brief recorded
  decision reasons. Do not infer progress from liveness, invent milestone trees,
  percentages, test counts or stages that were not executed.
- Quick and full GSD lifecycles are distinct workflows; the display projects the
  real workflow, rather than assuming quick is a full milestone lifecycle with
  recommended answers.
- No model in runtime timers, event deduplication, accounting or delivery. Host
  limitations, required plugins/flags, inference-triggering delivery and delivery
  failures must be explicit. Model-history injection is not proof of visible UI.
- Bind every observer and message/control operation to the exact approved
  contract digest, revision, run and originating host session. Retain ordered,
  replayable evidence without mixing runs or promising exactly-once transport.
- Q&A uses bounded, inspectable evidence. A user suggestion is not automatically
  correct or already applied. Distinguish receipt, assessment, deferral, rejection
  and application. Apply changes only at safe boundaries under GSD ownership.
  Any change to approved scope/effects/roots/model/budget needs contract revision
  and approval; never alter an active plan behind its executor.
- Reuse Phase 25 telemetry, process truth, finite completion waits and durable
  jobs. Keep GSD the sole lifecycle/state owner and retain final independent review.
- Sol high owns research/design/review; Terra high owns implementation/fixes.
  Explicit user policy overrides older project model-profile aliases.
- No paid inference canaries, global installation changes, credentials inspection,
  original Oh-My-Circuit writes or automatic restart. Source/protocol/isolated
  credential-free fixtures first. Installation is distinct from source completion.
<!-- DATA_Q7K2M9RA_END -->

<!-- DATA_V3A6Y8CJ_START -->
## Deferred decisions

Exact option names, event schema and host delivery adapters depend on feasibility
research. Examples in the user's request illustrate desired information, not an
exact output format or permission to fabricate milestones.
<!-- DATA_V3A6Y8CJ_END -->

[VERIFIED: .planning/phases/26-autopilot-session-progress-and-steering/26-CONTEXT.md:63-67]
</user_constraints>

## Summary

Pi has a public extension path that can present session content without starting inference. Its durable custom entries can be rendered in the transcript while remaining outside model context. Its alternative custom messages can avoid an immediate model turn, but participate in later model context. [CITED: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md] [CITED: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md]

Hermes has a public session-bound post/edit API, but the output surface matters: messaging adapters send actual messages, Desktop/TUI receive a notice, and classic CLI delays notice lines until a later turn finishes. Claude channels feed events into model context; their documented transport does not prove a passive transcript renderer. Antigravity's reviewed official interfaces establish prompt streaming and lifecycle hooks, but no verified passive idle transcript append path was identified. [CITED: https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins] [CITED: https://code.claude.com/docs/en/channels-reference] [CITED: https://antigravity.google/docs/cli/headless/] [ASSUMED: Antigravity passive delivery remains unverified, not proven impossible]

**Planning recommendation:** Resolve whether a common passive progress panel is acceptable, or whether native transcript delivery remains mandatory for every host. Do not silently replace the requirement with CLI status, injected history, a toast, or an inference-triggering prompt. This is a product-scope decision, not a reason to claim completion or omit hosts. [ASSUMED: proposed feasibility disposition; requires user decision]

## Project Constraints (from AGENTS.md)

- Keep adapters portable across the three supported operating-system families; report unsupported parity honestly. Preserve GSD as lifecycle/state owner, deterministic evidence, secret exclusion, preview/root/transaction boundaries, and native read-only verification. [VERIFIED: AGENTS.md:15-23; directives read this session]
- Keep adapters dependent on core utilities/types; render owned configuration fragments rather than modifying third-party managed files; fail closed on unsupported executables and policy failures. [VERIFIED: AGENTS.md:234-249; directives read this session]
- Use Exa discovery, Firecrawl extraction, and Context7 API lookup during research. Preserve the originating-session boundary and avoid model polling, monitor agents, duplicate controllers, and fabricated completion after a transport yield. [VERIFIED: AGENTS.md:284-288,306-318; directives read this session]

## Architectural Responsibility Map

This is a proposed responsibility split, not an implemented interface. [ASSUMED]

| Capability | Primary owner | Boundary |
|---|---|---|
| Lifecycle, decisions, approved changes | Existing GSD controller | Observers never advance lifecycle |
| Ordered event projection and replay | Deterministic alpha-AOS runtime | Read actual recorded events; bound payloads and deduplicate |
| Exact session identity and rendering | Native host adapter/plugin | Explicit origin registration; no newest-session lookup |
| Q&A | User's existing host conversation | User request may use inference; automatic progress does not |
| Steering receipt and assessment | Durable command inbox plus GSD controller | Acknowledgement is distinct from application |
| Delivery evidence | Host renderer acknowledgement where available | Transport write is not visible delivery |

## Capability Matrix

“Documented” means a primary API/source was read; “UI unverified” means no real chat was opened or messaged. The Codex row must be merged with the parent's separate findings before declaring five-host feasibility.

| Host / surface | Native path | Idle, no automatic inference | Visible output actually established by docs/source | Readiness / package boundary |
|---|---|---|---|---|
| Pi interactive | Extension custom entry renderer; custom-message alternative | Documented | Custom entries render in transcript; custom messages expose display events | Documented, installed source inspected; UI unverified. Package can ship extension; host must load it explicitly. [CITED: P1, P2] |
| Claude Code interactive | MCP channel notification | Model-context transport documented; passive transcript rendering unverified | Inbound context event; no processing acknowledgement | Research preview/custom-channel flag and policy dependency; not an alpha-AOS-only guarantee. [CITED: C1, C2] |
| Hermes classic CLI | Plugin post/edit | No inference for post API, but **not live at idle** | Notice printed after next turn ends | Explicit documented limitation; plugin required. [CITED: H1] |
| Hermes Ink TUI/Desktop | Plugin post/edit | Documented passive notice | Status line/toast, rather than durable transcript message | Surface-limited; UI unverified. [CITED: H1] |
| Hermes messaging gateway | Plugin post/edit | Documented send/edit without model prompt injection | Actual chat/thread message through platform adapter | Needs existing matching gateway session and enabled plugin; no external messaging tested or authorized. [CITED: H1] |
| Antigravity CLI / App / IDE | Plugins, MCP, hooks; CLI stream-json input | Passive append API not verified | Streamed input executes an agent turn; hooks inject at lifecycle points | Unsupported/unverified for strict passive originating-chat requirement; absence does not prove impossibility. [CITED: A1, A2, A3] [ASSUMED: unresolved passive adapter] |
| Codex | Parent-owned research | Pending parent integration | Do not infer from this report | All-five verdict must include parent's source/fixture result. |

## Host Findings and Binding

### Pi

Use durable custom entries plus an entry renderer for routine progress; this avoids adding progress chatter to future model context. The documented alternative `sendMessage` stores custom messages in model context. Explicit `triggerTurn: false` avoids starting a new idle run and defers a busy run's append until the turn ends. Omitting it while busy can steer an active model run. `deliverAs: nextTurn` deliberately waits for another user prompt, so it does not meet immediate idle visibility. [CITED: P1, P2, P3]

An extension can obtain the current identity from the session manager and receive session start/shutdown events. Capture the origin at explicit opt-in and close session-scoped resources on shutdown/replacement. Do not retain a stale context across resume/fork/reload or redirect its observer to the replacement session automatically. [CITED: P1]

Pi supports a per-process extension flag and trusted project discovery. The existing alpha-AOS worker adapter is a different surface: its controller arguments include the following verbatim values, which do not establish attachment to the already-open interactive session:

<!-- DATA_C2U9R5LX_START -->
`"-p", "--mode", "rpc", "--no-approve", "--no-session", "--json-schema"`
<!-- DATA_C2U9R5LX_END -->

[VERIFIED: src/adapters/task-pi.ts:83-99] [CITED: P1]

**Safe opt-in proposal:** Ship a Pi extension in alpha-AOS, load it per process or through separately reviewed host integration, then register the exact current session through an extension command. Implement deterministic rendering and command dispatch within that extension; do not launch a second Pi worker to impersonate the origin. [ASSUMED: architecture proposal]

### Claude Code

Channels are MCP servers whose events enter the current open Claude session. They require explicit enablement, and custom channels during preview require interactive development-channel loading. The custom-development bypass is ignored in print mode and the Agent SDK. Organization policy/authentication can further restrict availability. A normal MCP installation does not prove channel enablement. [CITED: C1, C2, C3]

The notification promise confirms a transport write, not processing; a disabled channel or policy rejection can silently drop the event. An application-level reply tool can prove Claude handled an event, but invokes agent participation rather than establishing a passive renderer. Use separate transport, processing, and visible-render evidence. [CITED: C2]

**Binding proposal:** The host-spawned stdio channel belongs to that exact process/session. Bind a one-time local registration to the exact approved run and explicit session identity; do not treat metadata supplied by the event sender as independently authenticated ownership. Capture origin through an authorized session-start hook or explicit host tool registration and reject mismatches. [ASSUMED: architecture proposal]

**Verdict:** A channel is a documented event-input route, not sufficient evidence of zero-inference transcript progress. Custom channel startup requires host integration/flags and cannot be silently activated in an already-running arbitrary conversation. [CITED: C1-C3] [ASSUMED: passive renderer not established]

### Hermes

The current plugin API exposes session-bound post/edit handles, including async forms. It is scoped to the calling conversation; a background thread needs explicitly copied context, and a detached process without the gateway conversation has no valid post target. User plugins require explicit enablement; current docs say the gateway does not load project-local plugins. The out-of-process plugin isolation mode does not support the live post handle. [CITED: H1]

For a bound handle, preserve the original profile/session context and re-check delivery errors. For commands, request the host-provided session key rather than guessing the single visible CLI session. `inject_message` is a different API: idle injection starts an agent turn; busy injection can interrupt. It is appropriate only for an explicitly authorized agent request, not automatic passive progress. [CITED: H1]

**Safe opt-in proposal:** Bundle the Python plugin source with alpha-AOS and use a separately reviewed native installation/enablement step. Capture session context in a short registration command; let a context-preserving callback consume deterministic runtime events. A package asset alone cannot make an existing Hermes process load it. Classic CLI still requires a host change or scope adjustment to satisfy idle transcript push. [ASSUMED: architecture proposal] [CITED: H1]

### Antigravity

Official plugin documentation lists skills, MCP, custom agents/subagents, rules, and lifecycle hooks. Hook input carries conversation identity and can inject system information at lifecycle points; a stop hook can request continuation. Those mechanisms are not evidence of an independent idle transcript renderer. The official headless stream processes a full agent turn per input; conversation resume is an execution/context continuation route, not a passive append operation. [CITED: A1-A3]

The existing alpha-AOS controller adapter launches a headless child using these verbatim flags:

<!-- DATA_M8Z1S6HF_START -->
`"-p", "--output-format", "json", "--json-schema", "--mode", "accept-edits"`
<!-- DATA_M8Z1S6HF_END -->

[VERIFIED: src/adapters/task-antigravity.ts:173-193]

**Verdict:** No passive exact-origin chat message API was verified in the reviewed official plugin, hook, CLI reference, and headless surfaces. Preserve this as an unresolved support gap. Do not call it impossible, repurpose Gemini CLI APIs as Antigravity APIs, patch private transcript/backend files, use keyboard injection, or claim a custom VS Code panel is the native Antigravity conversation. [ASSUMED: passive API support remains unresolved] [CITED: A1-A4 for reviewed scope]

## Minimal Architecture After Product Decision

The following is a planning proposal, not an implementation or locked schema. [ASSUMED]

1. Keep task execution detached and owned by the existing runner/controller.
2. Add explicit observer registration that binds contract digest, revision, run, originating host session, and a fresh observer identity. Store only plain bounded evidence and replay cursor; keep capability credentials out of journals and arguments.
3. Project lifecycle events into deterministic progress records. One observer consumes a bounded stream; runtime owns reconnect deadlines/backpressure. No LLM timer, polling agent, or duplicate controller.
4. Render through a native adapter only for its declared capability. Preserve separate evidence for queued, transported, processed, and visibly rendered outcomes. Terminal task success does not imply observer delivery success.
5. Receive questions in the existing conversation. Read a bounded run snapshot on request; user-driven inference is separate from automatic progress delivery.
6. Append steering as a durable request. Report receipt separately from assessment, deferral/rejection, and applied outcome. The sole GSD writer evaluates at safe boundaries; scope/effect/root/model/budget changes use revised approval.
7. On disconnect/session switch, stop delivery to the old host binding, retain a replay cursor, and require explicit reconnect. Never attach to the most recent session or infer completion from silence.

## Standard Stack / Don't Hand-Roll

No new npm/Python package installation is recommended by this research; package-legitimacy installation audit is therefore not applicable to this subtask. Use existing runtime process/event infrastructure and public host extension/plugin APIs after the scope decision. [ASSUMED: proposed dependency policy]

Do not hand-roll terminal keystroke injection, private database edits, model polling, fake user prompts, or global newest-chat discovery. These would evade origin ownership or fail to prove the requested UI behavior. Do not use a host model SDK merely to display progress. [ASSUMED: design exclusions derived from locked constraints]

## Environment Availability

These are read-only command observations from this session, not live UI compatibility claims. No credentials or conversation contents were inspected. [VERIFIED: command results captured in research session]

| Host | Local version observation | Additional evidence |
|---|---|---|
| Claude Code | 2.1.312 | Help exposes session-only plugin loading and session identity; channel preview is verified from official docs, not a successful local channel launch |
| Pi | 1.4.0 | Installed agent-session implementation and extension docs inspected; extension/offline/no-MCP flags observed |
| Hermes | v0.22.5; local bf0203a794a0 | Installed plugin API and matching surface-limit docs inspected |
| Antigravity | 1.4.10 | Help explicitly says stream-json input runs a turn for each input |

Windows was the inspected machine. macOS/Linux source portability is a planning requirement; no native delivery fixture ran on those operating systems. [VERIFIED: local PowerShell tool environment] [ASSUMED: cross-platform behavior needs CI/native fixtures]

## Validation Architecture / Fixture Strategy

All items below are proposed paid-call-free checks; none is represented as already passed. [ASSUMED]

| Fixture | Essential assertion | What it cannot establish |
|---|---|---|
| Common event adapter | Exact origin/run/revision binding; stable replay/dedup; bounded text/redaction; disconnect, cancellation, backpressure; delayed terminal event remains replayable | Native chat visibility |
| Pi extension source integration | Stub model provider throws on any generation; append custom entry; assert no provider call, matching session identity, renderer invocation and rendered component; idle and busy paths; shutdown/reload removes observer | A renderer callback alone does not prove terminal paint; add offline TUI capture in isolated home |
| Pi custom-message fallback | Explicit false avoids new run; busy append occurs at turn boundary; custom message appears in later context | Zero future model-context cost |
| Claude channel protocol | Fake MCP server captures exact notifications; missing channel/policy/closed transport remain unconfirmed; no acknowledgement invented | Idle visible transcript or real channel acceptance; headless development bypass is explicitly unsuitable |
| Hermes bound plugin | Fake native session/viewer context; async API, context-preserving background callback, wrong-profile/missing-session refusal; adapter send/edit/fallback and pending timeout semantics | Classic CLI idle visibility, which docs limit; no external messages should be sent |
| Hermes surface contract | Assert messaging send vs Desktop/TUI notice vs classic delayed notice remain distinct | A fake adapter is not real chat UI |
| Antigravity reviewed interfaces | Fake headless input confirms prompt transport is categorized as inference-triggering; hook context preserves conversation identity | A passive native UI API; retain unverified support result |
| Steering | Receipt is durable but not applied; safe-boundary assessment; revision approval; reject cross-run/session and stale revision | Natural-language correctness without user/model assessment |

Require native surface evidence separately from protocol/source checks. Do not spend model tokens or message an actual chat to improve this report's confidence. Preserve the parent phase's existing test framework/commands rather than inventing a second suite here. [ASSUMED: proposed validation gate]

## Security Domain

Use local origin-bound capabilities, schema/size validation, and secret-redacted evidence. Treat progress descriptions and steering text as data rather than executable instructions. An observer receives no lifecycle-write authority; a reply or UI notice cannot approve a changed contract. These are proposed controls aligned with authentication/session/access/input-validation concerns; this report does not assert a specific ASVS edition's numbering. [ASSUMED: proposed threat/control mapping]

## Common Pitfalls

- **No immediate turn is not zero future cost:** Pi custom messages enter context; use non-context entries for routine progress. [CITED: P1-P2]
- **A channel write is not receipt:** Claude does not acknowledge notification processing and can drop disabled events silently. [CITED: C2]
- **One harness has multiple UIs:** Hermes classic, TUI/Desktop and messaging deliberately render differently. [CITED: H1]
- **A durable conversation ID is not UI ownership:** Resuming a second process does not establish delivery into the open origin. [CITED: A3] [ASSUMED: architecture implication]
- **Missing documentation is not impossibility:** Preserve Antigravity support as unresolved until an affirmative native API or reproducible fixture establishes it. [ASSUMED]

## Assumptions Log / Open Decisions

| ID | Assumption / unresolved claim | Risk / disposition |
|---|---|---|
| A1 | Common passive panel might satisfy the user's intended experience | Requires explicit user product decision; do not silently narrow native-chat target |
| A2 | Reviewed Antigravity surfaces provide no usable passive origin renderer | Absence is not proof; retain unverified/unsupported result, re-open only for a concrete official API |
| A3 | Proposed observer, steering, dependency, and fixture design is suitable | Planner must reconcile with existing runtime and approved product scope |
| A4 | Public native APIs can work consistently across all supported OS builds | Verify with isolated per-host fixtures; Windows source reads do not prove macOS/Linux UI |
| A5 | Claude channel input might be acceptable with disclosed inference | User has not accepted this exception; cannot label it passive delivery |
| A6 | Pi custom-entry renderer and Hermes passive notices satisfy desired visibility | Native rendering evidence and surface-specific user acceptance still required |
| A7 | Codex can be represented by the parent's separate research | Parent must integrate exact findings before claiming five-host support |

## Sources and Confidence

The research-plan seam selected Context7 for Pi/Claude/Hermes and Exa for Antigravity. The classify-confidence seam returned MEDIUM for Context7 and Firecrawl even with cross-checking, so official documentation findings retain MEDIUM here. Local source inspection is supporting evidence; it is not a native UI success claim. Research digests were stored under the four plan-generated keys. [VERIFIED: GSD research-plan, classify-confidence and research-store outputs this session]

- **P1:** https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md — Firecrawl live extraction plus Context7 API lookup; session lifecycle, storage, rendering and per-process extension loading. [CITED]
- **P2:** https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md — Context7; custom entries excluded from model context. [CITED]
- **P3:** https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/agent-session.ts — Context7 plus installed compiled implementation inspection; idle/busy custom-message branches. [CITED]
- **C1:** https://code.claude.com/docs/en/channels — Exa discovery and Context7; preview prerequisites and open-session transport. [CITED]
- **C2:** https://code.claude.com/docs/en/channels-reference — Exa and Context7; notification schema, silent drops, processing semantics. Parent separately extracted with Firecrawl. [CITED]
- **C3:** https://code.claude.com/docs/en/cli-reference — Context7; interactive custom-channel bypass and session-only plugin loading. [CITED]
- **H1:** https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins — Exa, Firecrawl live extraction, Context7, and matching installed plugin/docs inspection; live post API, host differences, binding and opt-in. [CITED]
- **A1:** https://antigravity.google/docs/cli/plugins/ — Exa and Firecrawl live extraction; redirects to shared plugin reference. [CITED]
- **A2:** https://antigravity.google/docs/hooks — Firecrawl live extraction; conversation-bound lifecycle inputs and context injection. [CITED]
- **A3:** https://antigravity.google/docs/cli/headless/ — Exa primary-source extraction; stream input runs full turns and resume creates processes. [CITED]
- **A4:** https://antigravity.google/docs/cli/reference/ — Exa; CLI surface and settings. [CITED]

Official pages supplied no publication date in fetched metadata; currency rests on this session's live extraction and local installed version observations, not an inferred release date. Re-check fast-moving preview host APIs before implementation. [VERIFIED: fetched page metadata and command observations] [ASSUMED: recommended revalidation interval is seven days]
