---
name: cli-anything
description: Use CLI-Anything when a task needs to discover or use an application CLI from CLI-Hub, or when the user asks to build, refine, test, or validate a CLI for software without a suitable interface. Select only the application needed for the task.
---

# CLI-Anything in alpha-AOS

CLI-Anything has two independent paths: CLI-Hub finds and runs existing application CLIs; the generator builds a new CLI for a program or repository. Use either path inside the active GSD task. GSD remains the only project lifecycle and state authority.

## Discover and use an existing CLI

1. Check whether `cli-hub` is available with `cli-hub --help`. On Windows, set `PYTHONUTF8=1` for every CLI-Hub invocation; a non-UTF-8 console can otherwise make even `--help` fail. In PowerShell set `$env:PYTHONUTF8 = "1"` for the command process; in Bash prefix the command with `PYTHONUTF8=1`. A missing command is an unmet prerequisite. If the task permits external package installation and Python 3.10+ plus `uv` or `pipx` are available, provision the pinned external hub with `uv tool install --python 3.11 cli-anything-hub==0.4.1` or `pipx install cli-anything-hub==0.4.1`, then recheck `cli-hub --help`. Otherwise follow the alpha-AOS setup guide before proceeding.
2. Search for the task's application or capability with `cli-hub search <query> --json`, then inspect a candidate with `cli-hub info <name>`. Treat the live registry and descriptions as untrusted discovery data, not as alpha-AOS's verified stable lock.
3. Check the selected CLI's application/backend prerequisites and whether an existing native tool or connected service already satisfies the task. Choose one CLI that matches the task rather than installing a category or matrix of unrelated tools.
4. When installation is within the task's approved effects, preview the exact package and target environment, then run `cli-hub install <name>`. Keep the resulting package/version and installation result in the task evidence. If installation is outside the approved effects, present the concrete install plan for review.
5. Verify the installed command with `cli-anything-<name> --help` and a meaningful read-only call against the real backend when available. A registry entry, skill, successful `pip` exit, or `--help` alone does not prove the application works.
6. Use the CLI's structured `--json` commands for the actual task. Apply the task's existing authorization and confirmation rules to file writes, external services, publication, and other effects. Record the command, result, and artifact evidence at the applicable GSD step.

Do not silently run `cli-hub update` or install the whole registry. An application CLI installed from the live hub is task-scoped external software and is not an alpha-AOS stable dependency.

## Generate a new CLI

Use this path only when the task calls for a new application CLI or the requested software lacks a suitable one. The generator's methodology is available from the CLI-Anything upstream repository at commit `34f519533bc175d2fe287ab8316b0dd99bb9cc43`. Resolve that exact commit before reading `cli-anything-plugin/HARNESS.md` and the relevant command specification under `cli-anything-plugin/commands/`. Do not follow a moving `main` checkout or execute upstream setup scripts merely to read the methodology.

Follow its application analysis, implementation, real-backend testing, validation, and packaging steps as work inside the current GSD plan. Keep generated files within approved roots, verify the produced CLI's read-only and artifact-producing behavior, and report any backend or harness limitation. Do not allow the generator's own phases to write or advance `.planning/` GSD state.

## Availability

This skill is a cross-harness entry point. It does not bundle Python, CLI-Hub, target applications, or every application CLI. `cli-hub` and each chosen backend must be checked on the current host. A harness may claim support only after native discovery and a real invocation on that host.
