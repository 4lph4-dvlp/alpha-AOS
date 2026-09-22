# Changelog

All notable changes to alpha-AOS are documented in this file. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## [Unreleased]

### Changed

- Claude Code returns to the active harness scope alongside Codex, Antigravity, Pi, and Hermes (decision D-18). It had been excluded as compatibility residue only because no account was available to produce evidence with, which was never a statement about the integration.
- The support matrix judges Claude Code by the same evidence rule as every other harness. `evaluateMatrixCell` no longer fixes a Claude tier ahead of the evidence, and the active-surface table covers every harness id, so a matching inspectable receipt promotes a Claude cell and the absence of one leaves it `UNVERIFIED`.

### Fixed

- An isolated Claude canary is refused before it spends a model turn instead of spending one that could only fail. Claude Code keeps its login inside `CLAUDE_CONFIG_DIR`, which a canary runtime replaces, so the run started unauthenticated and ended at `Not logged in` after the spend. The launch now records `HARNESS_ISOLATION_UNPROVEN` with the next action, and `ANTHROPIC_API_KEY` on the launch lifts it.

### Documentation

- `docs/RELEASE_NOTES_v0.1.0.md` no longer states that Claude Code is excluded from support claims and release gates, and carries a dated amendment recording why the earlier exclusion existed.
- The handoff pair table's rationale describes the list it actually declares: codex-receiving pairs lead on retained evidence, and the claude-receiving fallbacks trail because of the credential constraint above rather than because of a superseded scope decision.

## [0.1.0] - 2026-09-20

### Added

- Declarative, preview-first installation and reconciliation for supported agent harnesses.
- Evidence-matched project capability packs and native optional capability routing.
- Mandatory GSD quality gates for security- and migration-sensitive work.
- Persistent directory tree-off policy that keeps opted-out trees free of alpha-AOS-managed global customization.
- Transactional managed lifecycle operations covering status, doctor, rollback, repair, and uninstall.
- One authoritative allowlisted release tarball, cross-platform fixture verification, and cryptographic provenance records.

### Security

- Release archives exclude candidate locks, planning state, tests, sources, and other unreviewed local artifacts.
- Provenance verification binds the archive SHA-256, `dist/build-artifact.json`, `catalog/stack.lock.json`, and every packaged `dist` output recorded by the build artifact manifest.
- Preview remains the default; public publication requires the explicit `--publish` release flag after all verification gates pass.

## Active Harnesses

Claude Code, Codex, Antigravity, Pi, and Hermes are the active target scope. “Active” identifies product scope; it does not itself mean a live capability is **PROVEN**. The committed [support matrix](docs/SUPPORT_MATRIX.md) is authoritative and currently reports live rows as **UNVERIFIED** until a matching, inspectable invocation receipt exists. Antigravity remains **UNVERIFIED** where the closed host ledger cannot represent its invocation proof.

## Claude Code Status

Claude Code is judged by the same evidence rule as every other harness: the support matrix no longer fixes its tier ahead of the evidence. No invocation receipt exists for it yet, so its cells read **UNVERIFIED** rather than **PROVEN**. Earlier revisions of this file described Claude Code as compatibility **RESIDUE** outside support and release gates; that exclusion was made when no account was available to produce evidence with, and decision D-18 (2026-09-22) ended it.

Obtaining a receipt has one recorded constraint. Claude Code keeps its login inside `CLAUDE_CONFIG_DIR`, which a canary runtime replaces in order to isolate configuration, skills, hooks, memory, and MCP — hiding the credential with them. No Claude Code flag names a credential source separately from the config root, and alpha-AOS never reads or copies authentication bytes, so an isolated Claude canary is refused before it spends a model turn (`HARNESS_ISOLATION_UNPROVEN`) rather than spending one that could only fail. `ANTHROPIC_API_KEY` on the launch authenticates by environment and lifts the refusal.

## Known Platform Limitations

- Windows supplies floor environment names including `USERPROFILE` and `APPDATA` to child processes. alpha-AOS redirects relevant values inside fixtures and redacts diagnostics; it does not promise those OS-provided names are absent.
- OS/container-backed `sealed` isolation (`SEAL-01`) is deferred to v2. v0.1.0 `project-only` mode is configuration isolation, not a security sandbox, and `sealed` continues to fail closed without an adapter.

[0.1.0]: https://github.com/4lph4-dvlp/alpha-AOS/releases/tag/v0.1.0
