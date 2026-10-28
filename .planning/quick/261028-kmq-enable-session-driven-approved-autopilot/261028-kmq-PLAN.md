---
quick: 261028-kmq
status: planned
---

# Session-driven approved autopilot launch

User intent: the initiating A/model1 conversation previews and receives approval of a contract, then starts the existing runner which dispatches reasoning/review to B/model2 and implementation to A/model3. No manual terminal handoff is required.

Local investigation: TaskAgentPolicy already carries controller/executor/reviewer harnesses and explicit model fields. Existing CLI approval/start gates and cross-harness model tests cover runner authority. The owned task skill explicitly forbids agent-triggered start; this is the immediate UX defect. No new dependencies or runtime architecture are needed.

1. Revise task skill to allow tool-mediated preview, exact-digest approval and separate start from the initiating session after explicit user authorization. Approval alone never implies start; a user may explicitly authorize both in one response to a displayed contract. Retain isolated worker execution, deterministic model enforcement, GSD ownership and finite completion handles. Explain unsupported hosts truthfully.
2. Align project governance and English/Korean operator documentation. Refresh only task-skill hashes in the stable lock. Verify delivery across all five harnesses and existing approval/drift/model gates.
3. Run type check and full suite with bounded console evidence and external logs. Commit product changes, sync the reviewed owned task skill through the managed CLI, and record verification/limitations in GSD and memory.

Execution: ordinary conversational GSD quick; inline single-agent fallback because the user has not requested delegation for this repair. No live paid autopilot task or fabricated native proof. No release/publish.
