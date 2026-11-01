# Phase 26: Autopilot Session Progress and Steering

## Source and intent

The user requests a feasibility check, then implementation if feasible. After
launching an approved autopilot, the originating conversation should receive
meaningful progress automatically and remain available for questions and steering.
The user explicitly requires all supported hosts: Antigravity (agy), Claude Code,
Codex, Pi and Hermes. A CLI status command alone does not satisfy this request.
This repair proceeds as ordinary conversational GSD, not an autopilot contract.

## Locked decisions

- On 2026-10-31 the user approved the common progress panel alongside originating
  conversation Q&A/control. Native session alerts are optional and only enabled
  where verified; universal native transcript delivery is not an acceptance claim.
- The user also authorized deletion of the exact research fixture temporary
  folder; the 2026-10-31 cleanup attempt was still rejected by automatic tool
  policy with `blocked by policy`. Do not bypass that rejection.
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

## Acceptance cases

- SESSION-01: automatic, evidence-based progress from generic quick and supported
  full/dedicated paths, including failure, needs-input and terminal outcomes.
- SESSION-02: exact session/run binding, cursor replay/deduplication and honest
  disconnect/unsupported-host delivery status without a model polling loop.
- SESSION-03: five-host support matrix grounded in documented source and fixtures;
  an adapter/CLI substitute must not be represented as verified in-session UI.
- SESSION-04: same-session bounded Q&A and durable steering with safe-boundary
  acknowledgement, approval preservation and no duplicate controller.
- SESSION-05: backward-compatible detached mode, redaction, bounded payloads and
  finite cancellation/backpressure behavior.
- SESSION-06: paid-call-free integration/regression fixtures, targeted checks,
  final full regression and independent review. Unverified UI remains unverified.

## Feasibility gate

Do not claim universal originating-session push from a durable status file or
stdout stream. Research each host's actual supported transport before planning
implementation. The user resolved the delivery scope on 2026-10-31 by accepting
the shared panel. Preserve the specific native limitations in capability output.

## Deferred decisions

Exact option names, event schema and host delivery adapters depend on feasibility
research. Examples in the user's request illustrate desired information, not an
exact output format or permission to fabricate milestones.
