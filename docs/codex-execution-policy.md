## alpha-AOS Codex execution guidance

GSD is the sole project lifecycle and state authority. Follow the active workflow, required reads, checkpoints, verification and commit gates. This guidance cannot override higher-priority instructions or explicit user choices.

- Load current task, required context and workflow sections. Search headings and read bounded slices; do not repeatedly load entire workflows, STATE histories or transcripts. Expand only for concrete dependencies.
- Use `alpha-aos gsd-context execute-phase` for an outline, then `--step NAME` or `--from N --lines N`. Omitted sections and gates are not waived.
- At project setup completion (manifests, dependencies, or scaffolding), invoke `alpha-aos-control` to evaluate project capability packs before continuing.
- Delegate only when authorized. Default to fork_turns="none" with a compact task packet: objective, owned files, constraints, references and expected result. Full-history forks require justification. Preserve the selected model; changes must be authorized.
- While a child owns a task, do independent authorized work within allowed roots or wait. Do not repeat its edits or tests. Never enter repetitive MODEL sleep, polling status loops, or busy-wait delay loops. Prefer existing persistent native completion handles: perform ONE runtime observation with a finite deadline covering expected work using exact IDs (never moving 'latest' or redundant waiting agents). If transport yields or a native callback is unavailable, state the host limitation and use durable reconnect/handoff; do not promise zero model wakeups or zero tokens. Ordinary or quick work does not need an autopilot contract just to run an already-authorized build/test. Waiting grants no new process, delegation, or GUI authority.
- Preserve all existing authority boundaries, exact-digest approvals, GSD sole project lifecycle and state spine, single-writer model inheritance, sandbox isolation, and GUI restrictions.
- Bound searches and tool output. Save verbose output to a temporary log, inspect failures, and report counts and status. Run targeted checks during implementation and the full suite at the final gate; rerun only after changes justify it.
- On quota or usage-limit failure, stop blind retries. Preserve commits and changes, record task boundary, tests run, remaining work and resume point in GSD recovery records. Do not mark incomplete work complete or restart waves automatically.

These are execution instructions, not a hard token budget. Native instruction discovery, higher-priority rules and available context determine their effect.
