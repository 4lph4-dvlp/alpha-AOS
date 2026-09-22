# alpha-AOS v0.1.0 Release Notes

alpha-AOS v0.1.0 establishes a declarative, cross-platform control plane for consistent AI-agent workspaces. It ships a preview-first installer, evidence-matched project capability packs, mandatory GSD security gates, persistent directory tree-off opt-out, and a transactional managed lifecycle spanning diagnosis, repair, rollback, and uninstall.

The release artifact is one allowlisted npm tarball. Its SHA-256 provenance bundle also binds the canonical `dist/build-artifact.json` manifest and frozen `catalog/stack.lock.json`; verification checks the bytes of every packaged build output recorded by that manifest.

## Active Harnesses

The active target scope is Claude Code, Codex, Antigravity, Pi, and Hermes. Target scope and live proof status are deliberately separate: a harness is not advertised as **PROVEN** without a matching, inspectable real-host invocation receipt. The checked-in [support matrix](./SUPPORT_MATRIX.md) currently reports live rows as **UNVERIFIED** where no such receipt is available on the reference host (Antigravity invocation receipts are fully supported in the capability ledger and oracle alongside Codex, Pi, and Hermes).

> **Amended 2026-09-22 (decision D-18).** These notes previously scoped v0.1.0 to Codex, Antigravity, Pi, and Hermes and described Claude Code as compatibility **RESIDUE** excluded from support claims and release gates. That exclusion was made when no Claude Code account was available to produce evidence with; it was never a statement about the integration itself. Claude Code is now in the active scope on the same terms as every other harness.

## Claude Code Status

Claude Code is judged by the same evidence rule as every other harness: the support matrix no longer fixes its tier ahead of the evidence, so a matching inspectable receipt promotes it and the absence of one leaves it **UNVERIFIED**. No such receipt exists yet, so every Claude Code cell currently reads **UNVERIFIED** rather than **PROVEN**.

One recorded constraint stands between that state and a receipt. Claude Code keeps its login inside `CLAUDE_CONFIG_DIR`, and a canary runtime replaces that directory to isolate configuration, skills, hooks, memory, and MCP — which hides the credential along with them. No Claude Code flag or variable names a credential source separately from the config root, and alpha-AOS never reads or copies authentication bytes. An isolated Claude canary is therefore **refused before it spends a model turn**, with `HARNESS_ISOLATION_UNPROVEN` naming the next action, rather than spending one that could only fail. Supplying `ANTHROPIC_API_KEY` to the launch authenticates a canary by environment instead and lifts the refusal.

## Known Platform Limitations

- Windows injects floor environment variables including `USERPROFILE` and `APPDATA` (along with other platform/user environment names) into child processes. Release fixtures redirect relevant values into disposable roots and diagnostics redact them; v0.1.0 does not claim those OS-level names can be removed entirely.
- OS/container-backed `sealed` isolation (`SEAL-01`) is deferred to v2. The v0.1.0 `project-only` mode controls configuration visibility but is not an OS security sandbox; requesting `sealed` without a supported adapter fails closed.
- Public-registry smoke verification is a post-publication Stage 2 gate. It cannot be completed before v0.1.0 exists on the public registry and must not be inferred from the local Stage 1 packed-artifact smoke test.

## Release Verification

1. Obtain authoritative release archive `alpha-aos-0.1.0.tgz` (SHA-256: `ce176c364fdaaa736343fca3656248e12fed673d20b0cab426b5d0da831e47b4`) and its companion `.sha256` digest file.
2. Verified multi-OS CI evidence is recorded in [CI_RUN.md](../.planning/phases/07-cross-platform-release-proof/CI_RUN.md) (Run ID: `35496805483`), proving byte-identical archive verification and 100% test pass across Ubuntu Linux, Apple macOS, and Microsoft Windows.
3. Run `node scripts/verify-provenance.mjs alpha-aos-0.1.0.tgz` to validate the outer archive, internal build manifest, packaged build outputs, and frozen stable lock.
4. Run the local Stage 1 smoke test (`node scripts/smoke-test.mjs --local` or `--tarball <path>`) in an isolated prefix. Maintainers use the preview-first release orchestrator (`node scripts/release.mjs --dry-run`), which does not publish unless `--publish` is explicit. Stage 2 public registry publishing is performed upon maintainer authorization.

See also [release controls](./RELEASE_CONTROLS.md) for paired acceptance evidence and the [support matrix](./SUPPORT_MATRIX.md) for current receipt-backed status.
