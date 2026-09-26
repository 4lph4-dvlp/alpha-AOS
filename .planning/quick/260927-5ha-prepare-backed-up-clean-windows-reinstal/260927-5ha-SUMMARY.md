---
id: 260927-5ha
status: complete
date: 2026-09-27
runtime_baseline: baf110c474136e2bc0e7ad116df9a3fb30df2081
---

# Backed-up clean Windows reinstall preparation

Prepared the user's Windows ARM64 workstation for a fresh installation of the existing repair branch. Actual installation remains the user's next action; main and PR #5 remain unmerged.

## Changes and evidence

- Checksum-verified 10,219 original files (about 174 MB) in a private local backup at `<workspace-parent>/alpha-AOS-backups/20260927-clean-reinstall`. No credential values or personal home paths enter repository records.
- Applied native alpha-AOS transactional uninstall; removed GSD 1.14.0 from four live manifest-proven harness roots with its inspected upstream installer, removed `ecc-universal@2.2.1`, removed `pi-mcp-adapter@2.36.0` through Pi, and unlinked global alpha-AOS through npm.
- Transactionally removed five unique alpha-AOS-owned skill files omitted by uninstall's current coverage. Archived GSD installation metadata and the post-cleanup alpha-AOS state after copy, checksum and drift verification. Cross-volume rename was refused; verified copy-and-remove completed the archival.
- Preserved all five agent applications, five authentication files byte-for-byte, 133 unrelated native configuration entries and seven user MCP servers semantically. Source, lock, native applications and build provenance remain intact.
- Native PowerShell installer preview exited zero, with verified artifact and npm-ci/build/link planned. The detailed managed preview requires six fresh external install steps: four GSD targets, ECC runtime and Pi bridge. Global alpha-AOS/ECC packages and managed state are absent.

## Preservation finding

GSD's upstream uninstall removes Codex config from its managed marker to EOF. The local config had a user-owned `tui` table after that marker; preservation verification caught its removal. Restored that table transactionally from the checked backup using a backup-local journal, then passed the complete preservation check. Removed hook trust metadata was separately proven to refer to the removed GSD SessionStart hook. A permanent upstream/project uninstall correction is recorded in deferred items.

## Handoff

Local `REINSTALL.md` includes exact PowerShell preview/apply/status/doctor commands, native exit-code guards and an installation log path. Bootstrap apply runs npm-ci, build, npm-link and the managed stack; no actual apply was run. The user will report local installation results before a merge decision.

No executable source change was made, so the earlier successful runtime suite/CI remain the baseline; cleanup was verified against live filesystem, package and configuration evidence instead of rerunning unrelated tests. GSD closure uses the backed-up runtime helper after its active install was removed.
