# Changelog

All notable changes to alpha-AOS are documented in this file. The format follows Keep a Changelog, and the project uses Semantic Versioning.

## [0.4.1] - 2026-10-22

### Added

- Detached command jobs (`alpha-aos job start`, `job wait`, `job status`, `job cancel`) for running long-running test suites and build processes with independent process lifetimes under the caller identity and sandbox authority, assigning exact IDs (`job-` plus 16 lowercase hex characters) and bounding combined retained child output to 64 KiB (`MAX_COMBINED_OUTPUT_BYTES`).
- Canonical task wait (`alpha-aos task wait`) supporting exact contract, run, digest, and revision observation with anti-forgery run record verification; manual task wait linkage for unsupported legacy supervisor records remains explicitly unresolved.
- Event-driven efficient wait guidance in `docs/efficient-wait.md` and five-harness support matrix across Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent.
- Explicit controller prompt directives and task skill updates discouraging repetitive model `sleep` or busy-wait polling loops.

### Fixed

- **Long-Running Process Polling Defect (`BUG-06`) (In-Progress Mitigation)**: Implemented event-driven detached command jobs and canonical task wait to avoid model-driven polling loops on runtime paths (without claiming host rate-limit prevention or measured token savings); active repairs addressing independent review findings (5 blockers, 2 warnings) and final release verification remain pending.
- **Task Lifetime Documentation Correction**: Clarified that `alpha-aos task start --apply` is foreground and awaited by default; detached independent process lifetimes are managed via `alpha-aos job start --apply`.

### Security

- Command jobs enforce a restricted environment allowlist (stripping provider credentials and `NODE_OPTIONS`), reject secret-bearing argument arrays, isolate state to `~/.alpha-aos/jobs/`, enforce owner fencing on cancel, and preserve exact argv arrays without shell concatenation.

## [0.4.0] - 2026-10-21

### Added

- Optional task-bound computer-use CLI/MCP broker with closed digest-bound authority, exact target/runtime checks, finite budgets, persistent emergency stop and fresh observed postconditions.
- Immutable validated PNG captures, durable chained intents/results, trusted-anchor replay, interrupted/unknown evidence and reviewed retention tombstones.
- Explicit COMPUTER_USE pack/guidance, five harness routing, inventory and mandatory GUI security-review surfaces; old task contracts retain their digest and grant no GUI access.
- Host-free production checks, adversarial coverage, a controlled Windows CLI/MCP run with six actions and twenty replay-verified audit events, verified optional Cua 0.37.0 provenance and explicit platform evidence. macOS/Linux live actions remain untested here.

### Security

- No new external npm runtime dependency or stable dependency promotion. Raw native tools, secret typing, arbitrary launch arguments and full-desktop fallback are denied. Public-data capture is an explicit reviewed classification, not a secret-detection guarantee.

## [0.3.1] - 2026-10-18

### Fixed

- **Antigravity Model Tier Routing (`BUG-01`)**: Antigravity adapter now passes `--model <model-id>` to avoid falling back to exhausted default quota tiers. Models resolve from `adapterModel` -> `contract.agentPolicy.{controllerModel,executorModel,reviewerModel}` -> `.planning/config.json` (`model_profile_overrides` / `review.cross_ai_command`).
- **Antigravity Subagent Inheritance Guardrails (`BUG-05`)**: Added fail-closed `INCOMPATIBLE_SUBAGENT_MODEL` check and controller prompt guardrails when Antigravity `invoke_subagent` is called with `typeName: "self"` and explicit model overrides.
- **Harness Role Receipt Drift Recovery (`BUG-02`)**: Host binary updates causing `binarySha256` or CLI version mismatch can now be automatically re-probed and atomically updated via `reprobeHarnessRoleReceipt` and CLI `--probe` flag (`alpha-aos task doctor --probe`, `task start --probe`, `task resume --probe`).
- **Snapshot `.planning` Read-Only Mirroring (`BUG-03`)**: `materializeTaskSnapshot` mirrors regular files under `<projectRoot>/.planning` (`ROADMAP.md`, `STATE.md`, etc.) into isolated snapshots without altering the artifact manifest hash, enabling criterion measurements and reviewers to read planning state.
- **GSD Quick Retry Resilience (`BUG-04`)**: `verifyGsdEvidence` now accepts `allowExistingClaimedQuick` so contract retries and revisions > 1 can verify pre-existing claimed `.planning/quick/<id>` directories and their `docs(quick-<id>)` commits across git history.

## [Unreleased]

### Changed

- Claude Code returns to the active harness scope alongside Codex, Antigravity, Pi, and Hermes (decision D-18). It had been excluded as compatibility residue only because no account was available to produce evidence with, which was never a statement about the integration.
- The support matrix judges Claude Code by the same evidence rule as every other harness. `evaluateMatrixCell` no longer fixes a Claude tier ahead of the evidence, and the active-surface table covers every harness id, so a matching inspectable receipt promotes a Claude cell and the absence of one leaves it `UNVERIFIED`.

### Fixed

- A Claude canary can authenticate. Claude Code keeps its login inside `CLAUDE_CONFIG_DIR`, which a canary runtime replaces, so every isolated run started logged out and ended at `Not logged in` after spending a model turn. The runtime now hard-links the existing login into itself — by reference, never reading or copying the credential, the same treatment the Codex canary already gives the caller's login — and refuses before spending when no link can be made.
- A Claude canary can reach its own observation front. Isolation hides the caller's tool approvals and `-p` cannot prompt for one, so fronted calls were denied before the proxy ever saw them: a measured run recorded `permission_denials` naming the exact tool the canary expects while the observation sink stayed empty, which alpha-AOS scored as the harness failing to route. Canary launches now grant the servers the runtime fronts, by server rather than by tool name, so fan-out and forbidden-tool controls stay observable.

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

A Claude canary runs on the login you already have: the runtime hard-links it in by reference, never reading or copying the credential, and refuses before spending when no such link can be made.

## Known Platform Limitations

- Windows supplies floor environment names including `USERPROFILE` and `APPDATA` to child processes. alpha-AOS redirects relevant values inside fixtures and redacts diagnostics; it does not promise those OS-provided names are absent.
- OS/container-backed `sealed` isolation (`SEAL-01`) is deferred to v2. v0.1.0 `project-only` mode is configuration isolation, not a security sandbox, and `sealed` continues to fail closed without an adapter.

[0.1.0]: https://github.com/4lph4-dvlp/alpha-AOS/releases/tag/v0.1.0
