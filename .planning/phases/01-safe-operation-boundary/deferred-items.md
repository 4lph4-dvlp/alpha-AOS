# Phase 01 — Deferred / Out-of-Scope Discoveries

Items noticed during execution that are outside the scope of the plan that
found them. Recorded rather than fixed, per the executor scope boundary.

| Found in | Item | Why deferred |
|---|---|---|
| 01-17 | `.gsd/dispatch-isolation-sentinel.json` is untracked run-scoped GSD runtime state and is not covered by `.gitignore` (which lists only `dist/`). | Created by the execute-phase orchestrator before this plan started, not by any task in it. Adding a `.gsd/` ignore rule is GSD tooling housekeeping, not phase-1 safety-boundary work. |
