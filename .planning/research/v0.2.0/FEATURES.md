# Feature Research: Universal Autonomous Work (v0.2.0)

## Required user journeys

1. **Opt in and agree once:** Ordinary conversational GSD is the default. The user explicitly requests autopilot or approves a clear in-agent offer for this task; alpha-AOS drafts a versioned goal contract containing scope, measurable acceptance criteria, allowed effects, role assignments and optional resource limits. Later questions are answered from it where possible; a material scope change creates a new revision.
2. **Choose agents:** The user selects controller, executor and independent reviewer by harness/provider or chooses an evidence-backed policy. Every selected role is checked against native support receipts before the run. An unavailable combination is reported with the missing capability.
3. **Develop with the full capability set:** GSD creates/uses its phases and plans. At each step, alpha-AOS selects applicable global/project ECC skills, MCP tools, project packs, owned skills, native tools and hooks, invokes required ones and records outcomes. Executors perform bounded attempts; objective checks and a fresh reviewer inspect the exact revision; verified findings create GSD gap plans or new phases.
4. **Activate project packs:** After scaffolding, manifest edits or dependency installation, the controller runs the alpha-aos-control plan/status checkpoint. An exact pack digest needs explicit user approval before sync; a fresh agent session then discovers and invokes the project-only skills/MCPs.
5. **Perform a general task:** A connector gathers a bounded item manifest, applies approved effects, reconciles uncertain attempts and verifies outputs. CoursePilot `materials --week all --dry-run --json` supplies the plan; only `status: downloaded` plus `saved_path` and file verification count as downloads. The locally installed CoursePilot skill must be resolved at runtime rather than assumed from this repository.
6. **Stop and resume:** The user may stop a run; time, cycle, usage or cost limits may stop it; interruptions leave a durable continuation point. A no-limit run still has per-attempt safety ceilings and can report an unsatisfied external dependency.
7. **Audit:** A user can see which agent/model/provider performed each attempt, which applicable capabilities were called or unavailable, what evidence passed, what remains uncertain, and why execution ended.

## Expected feature set

| Category | Table stakes | Distinguishing acceptance |
|---|---|---|
| Contracts | Draft, review, approve, amend | Hash-bound scope and authority; stale approval invalidation |
| Autopilot mode | Explicit per-task request or approved offer | Default-off, no silent inheritance, ordinary GSD preserved |
| Capability fabric | Inventory global/project ECC skills, MCPs, packs, owned/native tools and hooks | Match and invoke required capabilities at GSD steps with actual call receipts |
| Roles | Select and probe each harness | Arbitrary supported controller/executor/reviewer composition without split GSD writers |
| Execution | Launch, stream, cancel, resume | Cross-OS child-tree cleanup and bounded/redacted evidence |
| Review | Fresh independent reviewer and machine checks | Same-revision proof; deduplicated actionable findings; reviewer abstention |
| Correction | Failed criteria mapped to GSD work | Repair strategy changes on repeated non-progress |
| General tasks | Connector API with idempotency/reconciliation | CoursePilot download manifest and per-file evidence |
| Controls | Unlimited or configured limits | Explicit stop reasons and no false completion on quota or limit |
| Product UX | Natural-language skill and CLI preview/status/stop/resume | Same contract and state seen from all harnesses |

## Anti-features

- Treating reviewer praise, exit code zero, or a passing skill-only gate as completion evidence.
- Automatically broadening the original goal when a reviewer suggests unrelated improvements.
- Automatic reissue of an external write whose outcome is unknown after a crash.
- Assuming a tool is free or unlimited based on its harness name.
- Claiming a configured skill, MCP or pack was used without a native call/result receipt.
- Treating autopilot consent as approval of a later unknown project-pack digest.
- Claiming the system will eventually converge for every task. Some goals are impossible, unverifiable, or depend on external access.

## Representative acceptance scenarios

- Hermes executor + Codex reviewer, Pi executor + Claude reviewer, and every other advertised pair run from the same role protocol; combination selection fails before work if a required role capability lacks evidence.
- A deliberately broken test causes review rejection and a GSD gap plan; after repair, the next review uses the new artifact digest and previously resolved findings stay closed.
- A simulated process crash between external action and result recording causes reconciliation before retry. Unknown outcome is surfaced, never silently marked successful.
- CoursePilot `viewed_only` and `planned` do not increase downloaded count; already verified files are not downloaded again.
- A new React manifest triggers pack planning; an approved exact digest is synced, a fresh session discovers the project-only skill/MCP, and a matching GSD step actually invokes it. A stale digest blocks sync.
- A documentation task calls Context7, while an ordinary GSD task with no autopilot request remains interactive and never starts the supervisor.

## Scope note

The user requested a general task runner, not a fixed list of task tools. Ship a connector contract and a real CoursePilot exemplar. Other integrations use the same protocol once a native adapter and validation receipt are available.
