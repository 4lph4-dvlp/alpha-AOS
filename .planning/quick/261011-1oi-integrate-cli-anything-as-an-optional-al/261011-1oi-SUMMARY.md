---
status: complete
commit: 0d2b909
---

# CLI-Anything integration summary

Added a repository-owned, SHA-256-locked `cli-anything` skill to the five-harness install catalog. The skill routes task-specific CLI-Hub discovery and use through existing GSD work and points generator requests to one pinned upstream commit. CLI-Hub and application CLIs remain optional external packages. The capability inventory now reads owned-skill deployment state and includes owned-skill locks in its input fingerprint.

Verification: TypeScript check passed; 76 targeted tests passed; a later 30-test targeted pass covered the final source and lock; the isolated packed lifecycle passed all 10 tests. The full Windows suite reported 1,559 passing, 10 skipped and one host npm-cache drift failure, which passed when run alone. This is tracked for the subsequent update-test repair. On this host, the skill synchronizes as `CURRENT` on Claude, Codex, Antigravity, Pi and Hermes. CLI-Hub 0.4.1 was installed with Python 3.11, and `cli-hub --help` plus `cli-hub search gimp --json` succeeded with `PYTHONUTF8=1` after a cp949 console failure revealed the need for that setting.

Native agent selection and an application-specific CLI call were not observed; the capability ledger correctly remains `unverified` for those axes.
