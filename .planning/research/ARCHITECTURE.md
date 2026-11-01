# Architecture Research

**Milestone:** v0.6.0
**Researched:** 2026-11-02
**Confidence:** HIGH locally; MEDIUM for native all-five-host coverage

## Proposed Components

| Component | Responsibility | Integration |
|---|---|---|
| Behavior policy service | Fresh strict/flexible read and safe update | project.ts, paths.ts, transaction.ts, CLI |
| Intake decision service | Ordered decision, reasons and task choice | alpha-aos-task skill, CLI |
| GSD readiness adapter | Native prerequisite evidence and partial-state diagnostics | task-gsd.ts, installed GSD queries |
| Pending request handoff | Retain request, known facts and selection through initialization | GSD-owned context; no second state spine |
| Style dispatch | Native/conversational or approved runner, including quality flags | task-contract.ts, task-gsd.ts, task-run.ts, task-gsd-lifecycle.ts |
| Harness guidance | Invoke shared authority and render chooser/text fallback | owned-skills.ts and existing adapters |
| Evidence verification | Verify actual selected workflow and required quality | task-gsd.ts, task-gsd-gates.ts, tests |

These are recommendations, not implementation already delivered.

## Request Flow

1. Resolve project root and preserve tree-off, trust and authority boundaries.
2. Read current policy; absence means strict without writing state.
3. Honor direct GSD commands; handle policy-only requests without starting work.
4. Honor an explicit style, or identify continuation of the active task.
5. Exempt clearly simple operations with a reason and normal authority checks.
6. Ask six styles for a new substantial strict task; flexible preserves adaptive intake.
7. Establish GSD readiness. GSD new-project initializes; GSD recovery handles partial state.
8. Resume the selected task. Conversational routes use native GSD; autopilot routes retain preview, exact approval, separate start and isolated execution.
9. Close the task selection on completion; new work receives a fresh choice.

Readiness and selection can be presented together; an existing choice must survive initialization. Phase 29 must define the minimal pending-request representation without authorizing premature execution.

## State Ownership

| State | Authority |
|---|---|
| strict/flexible | Shared project alpha-AOS policy |
| Task style | Task-scoped selection; exact approved contract for autopilot |
| Initialization and lifecycle | GSD only |
| Approval, runs, effects and recovery | Existing task runtime |
| Cross-session context | ECC memory as non-authoritative evidence |

Mode changes affect future intake. Active approved runs remain bound to their contracts. The selected style is not a persistent project preference.

## Quality Binding

The current schema has workflow routing but no quick-full quality binding, and the controller invokes bare quick. Add backward-compatible quality metadata, show it in previews, bind it to the digest/reapproval comparison, pass --full, and verify its additional required outcomes. A display-only label cannot satisfy the requirement.

Reuse existing discuss/plan/execute/verify phase routing and capability gates. Scope autopilot-phase to approved roadmap phases, using the existing runner rather than a new orchestration loop.

## Host Refresh and Limits

[Codex guidance](https://developers.openai.com/codex/guides/agents-md) is assembled per run/session. [Claude documentation](https://code.claude.com/docs/en/memory) describes instruction files as contextual guidance rather than enforced configuration. Therefore stable routing guidance must call the live policy reader at each task entry. Do not promise that editing a file automatically refreshes an existing host. Verify real behavior and report unsupported cells.

## Recommended Build Order

27: shared policy and CLI → 28: intake and task boundaries → 29: bootstrap/resumption → 30: six-route quality binding → 31: native/fixture proof and distribution.

## Sources

Local: project.ts; transaction.ts; task-gsd.ts; task-contract.ts; task-contract.schema.json; task-run.ts; task-gsd-lifecycle.ts; owned-skills.ts; task-skill.test.ts. Official host sources are linked above. Upstream GSD semantics were compared with installed workflows.
