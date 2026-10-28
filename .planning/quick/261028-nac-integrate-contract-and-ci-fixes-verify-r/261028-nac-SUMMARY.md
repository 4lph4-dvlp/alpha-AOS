---
status: complete
---
# Integrated alpha-AOS 0.4.8 release

Verified product commit: `9fae6cf26bd5518311b75e6623807645980e93af`. Remote main and annotated v0.4.8 point to this commit. The release controller job-f93a58aa93204418 completed with exit 0; local full gate job-fc61a019e8b248c0 completed with exit 0.

The other session's 062c7f6 corrected the contract schema to accept runtime-supported gsd-multi-phase and gsd routes. Canonical digest stability/distinction and unknown-workflow rejection were verified. Integration additionally requires explicit local-commit authority for all three GSD routes. This verifies contract admission, not complete live multi-phase resume/final-review execution.

CI repairs cover Windows short/long home identity, canonical portable fixtures, atomic state record read races under retained parent proofs, process-adapter enforcement, bounded transient MCP retries and shared startup deadlines. Bootstrap cleanup retries transient Windows EBUSY, release consistency no longer pins future releases to 0.4.7, and local push verification isolates its state root from concurrent sessions.

Security dependencies: MCP SDK 1.32.2, smol-toml 1.9.1 and compatible transitive patches; npm audit 0 known vulnerabilities. Managed stable catalog versions and promotion gates were preserved.

## Acceptance evidence

- Full local ordinary suite: 1,822 total, 1,811 pass, 0 fail, 11 platform skips.
- Packed install/reconcile/diagnose/uninstall lifecycle: 10 pass, 0 fail.
- Locked upstream ECC integration: 1 pass, 0 fail. Four computer-use policy/audit/integration/research checks passed; final provenance verified 286 inputs / 558 outputs.
- Branch three-OS CI 40654124905: success. Main three-OS CI 40656143000: success on the exact product commit.
- Weekly candidate 40654132927: every three-OS CI and real component fixture passed; verified candidate artifact recorded.
- Authoritative tarball SHA-256: 7be49dea9c3f7525b753d2c759c05361eda56e345efa10cc44fe1831e380d2c0.

## Local deployment

Installed the audited authoritative CI tarball globally as a physical package, replacing the mutable source link. Actual alpha-aos --version reports 0.4.8; installed runtime hashes match the CI build manifest. Claude, Codex, Antigravity, Pi and Hermes were reconciled using managed installation. All 40 managed steps are current; doctor reports 21 ok, 1 info, no warnings/errors. All five native --version invocations succeeded. The source checkout fast-forwarded to main; the pre-push hook is enabled.

Detailed release evidence: OS TEMP/alpha-aos-048-release-evidence. Machine report: OS TEMP/alpha-aos-048-release-report.json, status complete and all publication/installation flags true. No npm-registry publish or paid live autopilot execution was performed. External outages and defective new upstream releases remain blocking failures rather than being hidden.
