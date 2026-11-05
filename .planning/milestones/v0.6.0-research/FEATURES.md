# Feature Research

**Milestone:** v0.6.0
**Researched:** 2026-11-02
**Confidence:** HIGH for user decisions; MEDIUM for semantic classification

## Locked User Decisions

- Persist strict/flexible across harnesses; default to strict when never configured.
- Every independent substantial strict task receives a fresh choice. The selected style is never a project default: the user explicitly corrected that earlier interpretation.
- Continue the chosen style for follow-up edits and verification within the same active task.
- Exempt simple requests using common criteria: clear target/result and no separate design, investigation or multi-stage implementation.
- Explicit style requests bypass the chooser; direct GSD commands preserve user control.
- Guide uninitialized substantial tasks through GSD new-project, reusing the original request.

## Six Styles

| Label | Meaning |
|---|---|
| 대화형-quick | Small task in the current conversation with optional quality stages omitted |
| 대화형-quick-full | Discussion, research, planning, plan checking, execution and verification |
| 대화형-phase | Interactive roadmap/phase workflow and necessary user checkpoints |
| 오토파일럿-quick | Small task through approved contract and isolated runner |
| 오토파일럿-quick-full | Full small-task quality pipeline under the approved contract |
| 오토파일럿-phase | Approved roadmap/phase scope through the isolated runner |

Installed quick.md confirms --full enables discussion, research, plan checking and verification. These are styles over existing GSD workflows, not six new lifecycle engines.

## Feature Landscape

| Category | Table stakes | Complexity |
|---|---|---|
| Shared policy | Read/change/inspect strict/flexible across harnesses | Medium |
| Strict intake | Stable chooser and task-scoped selection | High |
| Exceptions | Explainable common criteria and negative examples | Medium |
| Explicit control | Respect named style and direct commands | Medium |
| Initialization | Absent/partial/ready checks and request resumption | High |
| Dispatch | Actual six-route and quick-full quality binding | High |
| Proof | Cross-harness scenarios, packed guidance and bilingual docs | High |

## Task and Exemption Boundaries

Use a shared typed decision with bounded evidence/reasons: explicit command, policy change, explicit style, continuation, simple operation, substantial task, or clarification needed. Keyword lists alone cannot establish semantic scope. Uncertain scope must not silently qualify as simple.

A release can use autopilot-phase, and a later independent bug fix must ask again and may use autopilot-quick-full. A test repair within the active release task is a continuation. Completed or cancelled task choices do not carry into new work.

A bounded push, display-name change or README translation/linking can skip the chooser. A rename across packages, imports, deployment and remotes may require discovery and is not automatically exempt. Exemption removes selection overhead, never normal effect authority or required checks. An explicitly requested full style must be honored even if the task could otherwise be simple.

## Initialization Experience

For substantial six-style work, distinguish missing runtime, absent project, partial project and ready project. Reuse facts from the initial request; ask only for missing decisions; let GSD initialize or recover without overwriting context. Then resume the original request once, retaining any already selected style.

## Anti-Features / Deferred

- Persistent preferred style or blanket future autopilot consent.
- Rewriting approved active contracts when mode changes.
- Memory/transcript inference as authoritative policy.
- A new GUI picker, execution engine or automatic GSD installation.
- Perfect intent classification or unapproved paid native calls.

## Sources

- Authoritative product decisions: user request and correction in this conversation, 2026-11-02.
- [GSD quick](https://github.com/open-gsd/gsd-core/blob/next/commands/gsd/quick.md).
- [GSD new-project](https://github.com/open-gsd/gsd-core/blob/next/commands/gsd/new-project.md).
- Local: alpha-aos-task/SKILL.md; installed quick.md; task-skill.test.ts; task-governance-hierarchy.test.ts.
