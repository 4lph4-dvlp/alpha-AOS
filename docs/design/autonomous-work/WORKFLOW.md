# GSD and alpha-AOS workflow for v0.2.0

This is the operator and implementation plan for the [v0.2.0 roadmap](../../../.planning/ROADMAP.md). It describes which installed tools serve which decision. It does not turn optional tools into unconditional calls. GSD is the only project lifecycle authority.

## Milestone preparation

1. `$gsd-progress` reads current state and routes the work. The v0.1.1 milestone was complete; v0.2.0 therefore uses the installed `new-milestone` workflow with approved scope, archived previous phase artifacts, a fresh REQUIREMENTS.md and ROADMAP.md.
2. `$gsd-map-codebase` or a bounded explorer pass locates existing patterns when a phase touches unfamiliar code. For this plan, the process, transaction, worker-authority, gate and capability-ledger seams were inspected before drawing module boundaries.
3. `deep-research` uses Exa discovery and Firecrawl page reads for current harness interfaces; `documentation-lookup` uses Context7 for Node.js 24 process behavior. The research summary records what was verified, what is merely documented and what still needs a real receipt.
4. `$gsd-new-milestone` owns requirement IDs and the multi-phase roadmap. The draft is reviewed before the workflow's roadmap commit gate.

## Per-phase development loop

For each Phase 14–22:

1. `$gsd-discuss-phase N` records unresolved implementation choices in CONTEXT.md. Autopilot is entered only by explicit per-task user request or approval of an in-agent offer. `--auto` is appropriate only for decisions covered by that approved contract or documented recommended defaults; new authority or scope is brought to the user. Ordinary GSD stays conversational.
2. `$gsd-plan-phase N` researches phase-specific issues, creates tracer-first PLAN.md tasks and runs the plan checker. Source mapping goes through `.planning/codebase/` and nearest code analogs. The Phase 14 plan should prove one real vertical path before it expands to all harnesses.
3. `$gsd-review N` or the plan-review convergence lane calls another model where a plan has high-risk cross-harness, external-effect or authority changes. This is a plan review; it does not replace implementation review.
4. At every discuss/plan/execute/review/verify boundary, recompute the global and project capability inventory and attach applicable skill, MCP, pack and hook obligations. After environment setup, run the `alpha-aos-control` pack plan/status checkpoint; sync an exact digest only with specific user approval, verify CURRENT, and refresh the agent tool session. Actual invocation receipts are required for selected mandatory calls.
5. `$gsd-execute-phase N` applies approved plans in dependency order. It uses a GSD-managed worktree when its isolation adapter requires one; no generic worker independently changes `.planning/` state.
6. `npm run check`, targeted regression tests and the full suite at the phase/final gates collect concrete evidence. `$gsd-code-review` inspects changed source. `$gsd-verify-work N` exercises user-visible behavior and records UAT; `$gsd-plan-phase N --gaps` and `$gsd-execute-phase N --gaps-only` repair confirmed gaps.
7. `$gsd-progress` routes the next incomplete step. On quota, usage or external-access failure, preserve commits and GSD recovery records. Do not mark partial work complete.

After all phases, run GSD's milestone audit and cross-phase integration check, then the separate fresh-session implementation review described in the [design](README.md). `gsd-review` on plans and final product review have different evidence contracts. Close the milestone only when the GSD audit and all v0.2.0 mandatory criteria pass.

## alpha-AOS tool use by task

| Tool/capability | Invoke when | Evidence |
|---|---|---|
| `alpha-aos-control` | Automatically after scaffolding, manifest/dependency changes, or project onboarding; also pack selection, diagnostics, rollback or repair | Plan/status evidence, exact approved digest, CURRENT state and refreshed-session receipt |
| Project-only ECC skill packs | The approved pack is CURRENT and a task matches its project scope | Native discovery plus actual skill/tool invocation in a fresh session |
| Global ECC skills | Their task predicate matches at a GSD boundary | Actual call and result, or a recorded unavailability/block reason |
| MCP tools | A selected skill or step requires an MCP capability | Native server/tool discovery and observed call/result receipt |
| Context7/documentation lookup | A library/API detail is version-sensitive | Source/version and cited finding |
| Exa + Firecrawl/deep research | External current facts or design alternatives matter | URL, retrieved date and bounded source excerpt |
| Unified Memory | Cross-harness context handoff benefits the task | Source and destination receipt; GSD remains canonical |
| Native browser/computer use | Interactive UI behavior is a criterion | Recorded actions and observed result |
| CoursePilot | Coursework task explicitly within the approved scope | Fresh JSON, per-item status and saved-file proof |
| Native build/test tools | Code task has executable acceptance criteria | Exit/result and failing regression when meaningful |
| GSD mandatory hooks | The active phase or gate requires them | Actual invocation receipt, exact artifact digest and verdict |

The task planner inventories every alpha-AOS capability, records selected tools and omitted relevant tools with a reason, and turns mandatory selections into checked GSD-step obligations. Installation or discovery alone never satisfies use. This makes full alpha-AOS capability availability inspectable without invoking irrelevant tools or spending money unnecessarily.

## Development checkpoints

Phase plans should create commit-sized slices and close these questions in order:

- Phase 14: Does autopilot stay off by default, and can one explicitly approved contract reach independent acceptance while a seeded failure rejects it?
- Phase 15: Can a crash occur at every journal/effect boundary without duplicate work?
- Phase 16: Can all five harnesses satisfy their claimed roles without two GSD writers?
- Phase 17: Can GSD alone advance and recover lifecycle state through real gates?
- Phase 18: Can every applicable global/project ECC skill, MCP, pack and hook be selected and actually called at the matching GSD step, including after session refresh?
- Phase 19: Can a changed artifact invalidate review and send a reproducible defect back to GSD?
- Phase 20: Can a non-code connector distinguish saved files from previews and visits?
- Phase 21: Can a user control an explicitly enabled run after chat exit from any supported harness?
- Phase 22: Do three-OS CI, packed release and live role/tool receipts support every advertised cell while ordinary GSD stays interactive?

## Review and completion policy

The implementation reviewer receives the approved task contract, source and changed artifact digest, requirements and check receipts. It works in a fresh read-only session and returns machine-validated findings. A reviewer may abstain. A blocking finding becomes GSD work only after reproduction or objective evidence confirms it. Review suggestions outside approved scope are reported separately. The cycle ends when every mandatory criterion has current evidence and no blocking finding remains; a limit, missing permission or unverifiable criterion yields a named non-success result.
