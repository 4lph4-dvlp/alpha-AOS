# Feature Research

**Milestone:** v0.7.0 Autopilot Reliability & Recovery
**Researched:** 2026-11-05

## Feature Landscape

| Category | Required behavior | Complexity | Dependency |
|---|---|---|---|
| Executable contracts | Distinguish bad contract/schema from unavailable runtime, authentication, quota and service errors; expose a specific remedy before approval/start. | Medium | Capability inventory, actual native invocation path |
| Capability proof | Successful task-relevant tool output, source evidence and linkage; discovery or configuration alone is insufficient. | Medium | Receipt validation and source policy |
| Automatic completion | Persist and deliver success, rejection, failure, interruption and observer loss to the exact originating session. | High | Host-specific continuation capability |
| Recovery | Diagnose, perform a scoped corrective action, verify the change and retry without another user request for routine same-scope recovery. | High | Failure classification, explicit repair grant, checkpoints |
| Final acceptance | Report GSD acceptance and process closure separately; a failed attempt is not the terminal result of an active recovery chain. | Medium | Supervisor identity and final outcome |
| Continuity | Restore delivery after reconnect, avoid duplicate attempts, retain completed phases and useful evidence. | High | Durable identity, cursor and acknowledgement |
| Guidance | Installed skills and source guidance continue authorized recovery; handoff documents explain genuine blockers rather than ending recoverable work. | Medium | Runtime recovery implementation |

## Expected Behavior

1. The user requests and authorizes an autopilot task.
2. Contract construction names real obligations and a supported invocation path.
3. The runner persists origin identity independently of whether a progress panel is open.
4. Each attempt has a distinct ID under one auditable recovery lineage.
5. A recoverable failure produces an actual scoped change before another equivalent attempt.
6. The originating session resumes automatically through a proven host path and reports accepted work or the specific external/user boundary.
7. Reconnect and event redelivery do not repeat completed work.

## Differentiators

- Evidence explaining why another attempt should succeed, rather than a retry counter alone.
- A common outcome envelope across Codex and Antigravity without pretending their native transports are identical.
- Explicit distinction among failed attempt, blocked recovery chain, lost observer and accepted task.

## Anti-features

- Unlimited retries, quota bypass, silent model substitution, scope/root expansion.
- Automatic reapproval of arbitrary changed digests without a prior repair grant.
- Mock success receipts or removing research requirements after a tool error.
- Calling a progress panel, status file or desktop notification proof that the conversation continued.
- A handoff as the routine result of a recoverable failure.

## Scope and Validation

Prioritize the user's current Codex origin-session experience and existing Codex child execution. Use Antigravity as a behavioral reference and preserve other harness behavior. Which installed host surfaces support automatic continuation requires implementation-time proof; do not silently narrow acceptance to headless child completion.

Tests, fixtures and live runs were not executed during research. Future validation must follow the owner's personal-workstation delivery policy and explicitly authorized invocation scope.

## Sources

The user report, exact historical evidence in [EVIDENCE.md](EVIDENCE.md), and [Architecture](ARCHITECTURE.md). Antigravity documents programmatic streaming results, not this product's automatic repair guarantees: [Headless mode](https://antigravity.google/docs/cli/headless/).
