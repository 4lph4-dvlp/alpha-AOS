# Pitfalls Research: Universal Autonomous Work (v0.2.0)

| Failure | Evidence in current system | Prevention and phase gate |
|---|---|---|
| Split GSD writers | `worker-authority.ts` has name-based roles and post-action snapshot/restore | Exclusive lease, fencing token, serialized GSD bridge; adversarial two-controller fixture before enabling universal controller roles |
| Reviewer did not actually run | `gate.ts` can return success for a skill-only engine | Explicit invocation receipt with reviewer session, exact digest and terminal result; failing witness test |
| False harness parity | `capability-oracle.ts` currently has null invocation definitions for Antigravity/Pi/Hermes | Version-bound headless probe and native canary for every advertised role; unsupported is a first-class result |
| Duplicate external effects after crash | File journals cannot undo web writes/download visits | Pre-action stable key, source reconciliation and `uncertain` state; interrupt at each effect boundary |
| Unbounded loops without progress | Same executor may repeat the same broken result | Evidence fingerprints, repeated-failure counter, strategy switch, honest blocked result when no new action exists; unlimited cycles remain selectable |
| Limit bypass | Harness usage may omit money or token information | Distinguish hard measured limits from estimates, stop when required meter unavailable, never infer free usage from harness identity |
| Permission laundering | Auto mode could answer a decision that changes authority or scope | Contract-defined delegated decisions only; new goal/effect class requires a new contract revision |
| Silent autopilot activation | A natural-language task could be mistaken for permission to run indefinitely | Per-task explicit request or approved offer, default-off mode and ordinary-GSD negative control |
| Installed-but-unused capability | Skill/MCP/pack configuration is mistaken for a real GSD-step call | Versioned capability graph, task/step predicates and native invocation receipts; missing required call blocks success |
| Pack activation gap | Project pack sync completes but the current agent has a stale tool inventory | Verify exact approved digest and CURRENT status, then refresh session and prove project-only skill/MCP discovery plus invocation |
| Pack consent laundering | Autopilot approval is used to install a new unreviewed pack | Require separate approval for the exact `project plan` digest; changed digest pauses |
| Stale acceptance | Review of commit A could be applied to commit B | Bind each criterion and reviewer report to exact artifact/repository digest, invalidate on change |
| Tool output prompt injection | LMS pages, repo files and agent stdout contain untrusted text | Parse data through connector schemas, keep role and policy instructions out of external content; do not run arbitrary commands supplied by a reviewer |
| Tool over-invocation | “Use all alpha-AOS tools” may cause unnecessary installs or costs | Capability selection by task intent, explicit mandatory gates, and per-run audit of selected tools and why |
| Process-tree leak | Generic `subprocess.kill` does not necessarily kill descendants | Reuse alpha-AOS process boundary, bounded streams and tested cross-platform tree termination. [Node.js reference](https://nodejs.org/docs/latest-v24.x/api/child_process.html) |
| CoursePilot false download | `planned`, `viewed_only` or LMS completion are distinct from a saved file | Require `downloaded` result, nonempty path, actual file and source manifest reconciliation; observe exit 1 partial results |

## Release proof

Use deterministic unit and fault-injection fixtures on all three OS CI legs. Exercise each harness's supported interface on at least one real host and record exact version, role, skill/MCP/pack invocation and outcome. Test advertised controller/executor/reviewer combinations in synthetic fixtures; require live receipts for each advertised capability, not necessarily every 125 role triplets. Never promote a missing role or tool receipt as full support.
