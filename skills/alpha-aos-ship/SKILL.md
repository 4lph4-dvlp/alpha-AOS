---
name: alpha-aos-ship
description: "Ship a verified GSD phase by running the installed GSD ship workflow. Use only when the user explicitly wants to open a pull request for completed GSD work; do not use for ordinary commits or non-GSD repositories."
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Skill
  - AskUserQuestion
---

<objective>
Expose the upstream GSD ship workflow without enabling GSD's entire utility cluster.

The upstream workflow owns every readiness gate and side effect: verification status, clean-tree and branch checks, push, PR creation, optional review, and GSD state updates. Do not replace, weaken, or duplicate those steps here.
</objective>

<execution_context>
Load the workflow spec from `.claude/gsd-core/workflows/ship.md` relative to the current project when present. Otherwise load `~/.claude/gsd-core/workflows/ship.md` from the global GSD installation. Stop if neither file exists.
</execution_context>

<context>
Arguments: $ARGUMENTS

Require a GSD project with `.planning/`. Treat the phase number and optional flags exactly as the upstream workflow defines them. This skill is intentionally user-invocable only because shipping pushes a branch and creates an external pull request.
</context>

<process>
Read the selected workflow spec completely, then execute it end-to-end with `$ARGUMENTS`. Preserve every preflight check, confirmation, failure condition, and report from the upstream workflow.
</process>
