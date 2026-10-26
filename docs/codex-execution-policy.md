## alpha-AOS Codex execution guidance

GSD alone owns lifecycle/state. Follow required reads, checkpoints, verification and commit gates. Higher-priority instructions and explicit user choices take precedence.

- Load current task/context via headings and bounded slices; expand for concrete dependencies. Avoid whole workflows, STATE histories and transcripts.
- Read `alpha-aos gsd-context execute-phase` outline, then `--step NAME` or `--from N --lines N`; omitted gates still apply.
- After manifests, dependencies or scaffolding setup, invoke `alpha-aos-control` for capability packs.
- Delegate only when authorized. Default fork_turns="none": compact objective, owned files, constraints, references, result. Justify full-history forks; preserve selected model unless change is authorized.
- Prefer native completion handles and ONE finite runtime wait with exact IDs. Runtime owns timers; no LLM in timers, model sleep/status loops or repeated unchanged status-file reads. Do independent authorized work; never duplicate child edits/tests or add waiting agents/model babysitters around an active controller. Use a fresh bounded packet, not a full old transcript solely for monitoring.
- A transport yield is not completion. If host yields/no callback, disclose it, preserve durable handle and bounded reconnect/handoff; no endless retries or zero-wakeup/token promises.
- Save verbose logs externally; return bounded terminal evidence. Local progress displays must deduplicate unchanged state without model inference.
- Authorized ordinary/quick checks need no autopilot contract. Waiting grants no authority. Preserve exact-digest approvals, GSD single-writer ownership, model policy, allowed roots, sandbox and GUI limits.
- Run targeted checks, full suite at final gate; repeat when justified. On quota stop retries; save commits, changes, tests, remaining work and resume point in GSD. Never mark incomplete work complete or restart waves.
