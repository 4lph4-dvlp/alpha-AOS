# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability involving credential exposure, unsafe path handling, package-integrity bypass, or unintended modification of user configuration. Use GitHub's private vulnerability reporting for this repository. If private reporting is unavailable, contact the repository owner privately before disclosing details.

Include the affected alpha-AOS version or commit, operating system, command, redacted output, and a minimal reproduction. Never include API keys, authentication files, memory-vault contents, or complete harness configuration.

## Security boundaries

- alpha-AOS does not install Claude Code, Codex, Antigravity, Pi, or Hermes themselves.
- Mutation commands are dry-run by default and require `--apply`.
- Dependency versions and npm integrity values come from the stable lock.
- MCP credentials are referenced by environment-variable name and are not copied into the repository, lock, plan, or transaction journal.
- Managed rollback refuses to overwrite files changed after an alpha-AOS transaction.
- External package-manager changes are fixture-gated but are not guessed-at or automatically reversed.
- Project-only isolation prevents accidental inheritance; it is not a security sandbox. `sealed` fails closed until an OS/container adapter exists.

## Supported versions

Until the first tagged release, only the current `main` branch is supported. After releases begin, security fixes will target the latest stable release.
