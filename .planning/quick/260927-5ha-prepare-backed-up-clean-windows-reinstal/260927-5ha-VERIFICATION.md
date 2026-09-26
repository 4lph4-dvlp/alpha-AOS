---
id: 260927-5ha
status: passed
verified: 2026-09-27
---

# Clean reinstall preparation verification

Inline verification passed against the current machine after cleanup and installer preview. Scope is preparation only; the user's actual reinstall remains pending.

| Required property | Evidence | Result |
|---|---|---|
| Reversible original backup | 10,219 original files checksum-verified; configs, GSD manifests/runtime, credentials and old managed state copied locally | Passed |
| Fresh managed installation | Four GSD runtimes/manifests/install-state absent; ECC global package, Pi package selection and global alpha-AOS link absent; managed state absent | Passed |
| User environment preserved | Five auth files byte-identical; 133 unrelated config entries and seven MCP servers equal; five harnesses still discoverable | Passed |
| User table below GSD marker preserved | Original Codex `tui` restored transactionally after upstream removal; included in final semantic comparison | Passed |
| Reviewed install is runnable | Native PowerShell launcher dry-run exit 0; build provenance verified for 132 inputs/258 outputs; six fresh external managed install steps planned | Passed |
| User owns installation and merge decision | No bootstrap apply, merge or release run; local REINSTALL.md provides preview/apply/log/status/doctor commands | Passed |

Verbose evidence is private and external at `<workspace-parent>/alpha-AOS-backups/20260927-clean-reinstall`, including `verification.json`, `inventory-after.json`, removal logs, the managed preview and native bootstrap preview. No new source changes require an application-suite rerun. Historical references and main are unchanged.

Limit: existing Node/npm/Git, native applications, user-authored settings and package download caches are retained. This is a fresh alpha-AOS managed installation on the existing workstation, not a factory-reset OS. A permanent fix for upstream Codex uninstall's marker-to-EOF behavior is deferred, with the local setting preservation completed.
