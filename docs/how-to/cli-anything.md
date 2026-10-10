# CLI-Anything with alpha-AOS

alpha-AOS installs the `cli-anything` skill on its five supported harnesses. The skill lets an agent find and use an existing application CLI through CLI-Hub, or follow the pinned upstream methodology to generate a new CLI when the task calls for one. It is selected by task intent; it does not run on every GSD step.

## Prepare CLI-Hub for existing CLIs

CLI-Hub is an optional external Python application. Install Python 3.10 or newer and provision `cli-anything-hub` in an environment visible to the harness. For example, with `uv` or `pipx`:

```sh
uv tool install --python 3.11 cli-anything-hub==0.4.1
# Alternatively: pipx install cli-anything-hub==0.4.1
cli-hub --help
```

`uv`, `pipx`, and Python are not installed by alpha-AOS. On Windows consoles with a non-UTF-8 codepage, set `PYTHONUTF8=1` for CLI-Hub commands (`$env:PYTHONUTF8 = "1"` in PowerShell). This external application and the CLIs it installs are not part of `catalog/stack.lock.json`; installing or updating them does not promote them to alpha-AOS's verified stable dependencies. If CLI-Hub is absent, the skill reports the missing prerequisite rather than claiming the capability works.

To use a tool, ask the agent for the application or outcome. It can search with `cli-hub search <query> --json`, inspect one result with `cli-hub info <name>`, then install only the chosen CLI when the task's effect authority covers that installation. The underlying desktop application or service may also be required. The agent verifies the installed command with a meaningful read-only call before relying on it for the task.

## Generate a CLI

Ask the agent to build or refine a CLI for a named application or source repository. The skill pins the CLI-Anything upstream methodology to commit `34f519533bc175d2fe287ab8316b0dd99bb9cc43`. The agent reads that revision's `cli-anything-plugin/HARNESS.md` and the relevant command instructions, then performs the work within the active GSD plan. The generator is not a second project lifecycle.

The skill installation is integrity-locked and transactional through `alpha-aos install` or `alpha-aos owned-skills sync cli-anything --target <harness> --apply`. Check native discovery after a harness restart. An installed skill is not proof that CLI-Hub, an application CLI, or its backend works on the host.
