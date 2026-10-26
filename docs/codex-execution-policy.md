## alpha-AOS Codex execution guidance

GSD alone owns project lifecycle and state. Follow its workflow, required reads, checkpoints, verification and commit gates. Higher-priority instructions and explicit user choices take precedence.

- Load current task and required context. Search headings and read bounded slices; expand only for concrete dependencies. Do not repeatedly load whole workflows, STATE histories or transcripts.
- Read `alpha-aos gsd-context execute-phase` outline, then `--step NAME` or `--from N --lines N`. Omitted sections and gates still apply.
- After manifests, dependencies or scaffolding setup, invoke `alpha-aos-control` for capability packs.
- Delegate only when authorized. Default to fork_turns="none" with compact objective, owned files, constraints, references and expected result. Justify full-history forks; preserve the selected model unless a change is authorized.
- While a child owns work, do independent authorized work or wait; do not duplicate its edits/tests. Avoid model sleep/status polling loops and redundant waiting agents. Prefer native completion handles and one bounded runtime observation with exact IDs. If transport yields or callbacks are unavailable, disclose that host limit and use durable reconnect/handoff; promise neither zero wakeups nor zero tokens.
- Ordinary/quick authorized builds/tests need no autopilot contract. Waiting grants no process, delegation or GUI authority. Preserve exact-digest approvals, GSD single-writer ownership, model policy, sandbox and GUI limits.
- Bound searches/output; save verbose logs externally and report counts/status. Run targeted checks, then the full suite at the final gate; repeat only after justified changes/failures.
- On quota/usage failure, stop blind retries. Preserve commits, changes, tests, remaining work and resume point in GSD recovery records. Do not mark incomplete work complete or restart waves automatically.
