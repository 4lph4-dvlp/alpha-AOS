# Phase 26: Five-host feasibility and implementation boundary

Researched: 2026-10-30. Status: research gate; implementation not started.

## Finding

Automatic runtime progress, durable evidence-based Q&A and safe-boundary steering
are feasible additions to alpha-AOS. The stronger promise of passive progress
inside every already-open originating conversation is **not established across
all five supported hosts**. Do not implement a status command or stdout stream
and call that promise complete. Resolve the delivery/UI scope before planning.

| Host | Confirmed surface | Limitation |
|---|---|---|
| Pi | Extension `appendEntry` and entry renderer can keep durable visible data outside model context. | Requires installed/enabled extension and renderer validation. `sendMessage` can add future model-context cost even with `triggerTurn:false`. |
| Hermes | Plugin `post_message` / `apost_message` with adapter-specific display. | Classic CLI queues until the next turn; TUI/Desktop uses notice/status UI; messaging adapters send actual messages. These are different capabilities. |
| Claude Code | MCP channels deliver events to the existing session. | Preview/launch/policy requirements; delivered events are model inputs, not a proven passive transcript renderer. Transport write is not processing acknowledgement. |
| Codex | Installed 0.165.0 non-inference fixture emits native command item events through `thread/shellCommand`; matching release source renders them in the CLI. | Unsandboxed login-shell side effects, exact daemon/thread ownership, actual originating-UI proof and replay gaps remain. History injection alone emitted no visible item events. |
| Antigravity | Official plugin/hook and CLI input surfaces were investigated. | No verified public idle originating-session display API. CLI streamed input runs turns and is not proof of exact existing-session delivery. This is an unverified capability, not a claim of permanent impossibility. |

Details and pinned sources: [Codex research](26-CODEX-RESEARCH.md) and
[other-host research](26-HARNESSES-RESEARCH.md). Source-supported rendering is
distinct from a live UI acceptance test; no five-host UI acceptance is claimed.

## Concrete design available for planning

1. Add one deterministic, ordered event projection to the existing task runtime.
   Observe GSD-owned transitions and actual dispatch/verification receipts. Record
   step/model/effort/outcome, short recorded decisions and evidence references.
   Quick and full lifecycle reports reflect the real workflow. Do not duplicate
   lifecycle state or infer missing results, test counts or percentages.
2. Bind delivery to an explicit host session and exact contract/revision/run.
   Persist a cursor and delivery outcome. Reconnect/replay is bounded and
   idempotent; no latest-run fallback or timer-driven model calls.
3. Negotiate display capabilities, including whether delivery is passive, enters
   future context, wakes a model, appears in a transcript, needs a plugin or is
   unavailable. No silent fallback advertised as equivalent delivery.
4. Keep Q&A in the initiating conversation, using a bounded event/evidence packet.
   Add a durable steering inbox with receipt/assessment/deferred/rejected/applied
   outcomes. GSD consumes it at a safe boundary; scope/effects/roots/model/budget
   changes still require a revised approved contract. Receipt is not application.
5. Keep detached behavior. Verify isolation across simultaneous runs, restart,
   lost delivery, redaction, backpressure and cancellation in paid-call-free
   fixtures. Targeted checks precede final full regression and independent review.

## Product scope decision

Option A: allow a common passive progress panel for every host, with native
session integration where verified. This can provide one consistent automatic
view without model calls for reporting; it changes the all-native-chat UI goal.
Questions and explicit controls remain in the originating conversation.

Option B: require all reports inside the original host's conversation only. This
must retain unsupported/unverified states until each host provides a validated
transport. A universal completed feature cannot currently be promised.

Neither option has been selected. No source implementation, host installation,
original-project restart or paid model canary was performed during this research.

## Fixture evidence and housekeeping

The isolated Codex fixture recorded `providerRequests: []`; it tested protocol
events, not five-host production UI. Existing chats and user authentication were
not used. The fixture's temporary-folder deletion was rejected by automatic
approval review with `blocked by policy`; its exact path is recorded in the Codex
supplement. Do not retry through an equivalent deletion route.
