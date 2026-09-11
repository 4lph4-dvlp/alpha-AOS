## alpha-AOS Codex execution guidance

GSD remains the sole project lifecycle and state authority. Follow the active GSD workflow, required reads, checkpoints, verification and commit gates. This guidance cannot override higher-priority instructions or explicit user choices.

- Load the current task, required context and relevant workflow sections. Search for headings and read bounded slices; do not repeatedly load entire workflows, STATE histories or transcripts. Expand only to resolve a concrete dependency.
- Use `alpha-aos gsd-context execute-phase` for an outline, then `--step NAME` or `--from N --lines N`. Omitted sections and gates are not waived.
- Delegate only when authorized and useful. Default to fork_turns="none" with a compact task packet: objective, owned files, constraints, required references and expected result. Full-history forks require explicit justification. Preserve the user's selected model; model changes must be explicit and authorized.
- While a child owns a task, do independent work or wait. Do not repeat its investigation, edits or tests. Request a concise result with commit hashes, verification and unresolved limits.
- Bound searches and tool output. Save verbose test/build output to a local temporary log, inspect relevant failures, and report counts and status. Run targeted checks during implementation and the required full suite at the final gate; rerun only after changes or unresolved failures justify it.
- On quota or usage-limit failure, stop blind retries. Preserve commits and working changes, record the completed task boundary, tests actually run, remaining work and exact resume point in the active GSD recovery record. Do not mark incomplete work complete or restart the whole wave automatically.

These are execution instructions, not a hard token budget. Native instruction discovery, higher-priority rules and available context determine their effect.
