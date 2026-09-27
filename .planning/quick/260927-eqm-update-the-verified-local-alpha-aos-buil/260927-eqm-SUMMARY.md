---
id: 260927-eqm
status: complete
date: 2026-09-27
runtime_baseline: 64e2ce2e72dd1041d09133511667a19f14538b97
verification: machine-update-passed-suite-failures-recorded
operation_id: 2026-09-27T01-38-49-907Z-0537ba6e-a497-421c-b0cd-89088f346694
---

# Updated the Windows workstation across all five harnesses

The checkout already matched the live origin/main commit. Its existing build had seven changed inputs, so rebuilt it before previewing and applying native bootstrap update for Claude Code, Codex, Antigravity, Pi, and Hermes. No executable source or stable lock was changed.

Bootstrap completed git fast-forward verification, npm ci, build, global link, and managed reconciliation. Hermes MCP configuration was the only managed component requiring a write; the service snapshotted and journaled it. The other components were current. The global npm junction resolves to this checkout. The bootstrap link observation reported absent before and after, so the live junction was checked independently rather than treating that observation as proof.

## Verification

- All 24 final managed install plan steps report CURRENT across the five selected targets.
- Offline status is OK; doctor exits zero with no error or warning findings. Its research-routing information remains documented rather than silently changing the pinned third-party runtime.
- Build provenance passes: 132 inputs and 262 outputs.
- Free native discovery completed paired Codex and Pi measurements for both applicable packs and recorded eight proofs. This is discovery evidence, not a successful capability invocation claim. Claude's paid leg was skipped; Hermes has no discovery oracle, and Antigravity is outside this sweep's supported harness set.
- Full suite ran through the repository's environment-scrubbing runner after bootstrap: 952 tests, 940 passed, 2 failed, 10 skipped, zero cancelled. The packed release lifecycle passed.
- Re-ran the two failed tests sequentially with a name filter: both failures reproduced. Their after-hook asserts that all fixture packages were fetched from the loopback registry, but the observed fetched set is empty. Root cause was not established; these failures are tracked in the accompanying deferred-items file. This task does not claim a green full suite.

The bootstrap JSON preview exceeded the CLI's 262144-byte envelope limit. Used the complete human-readable preview instead; no truncated JSON was consumed. Plan artifacts initially lived in an external operation folder to satisfy bootstrap update's clean-checkout requirement and were copied into GSD tracking after apply.

The setup capability check recommended BROWNFIELD_INIT and MCP_SERVER. No project packs were approved or materialized as part of the global machine update. Logs and bootstrap evidence are retained locally; no credential values enter repository records. Restart existing agent sessions to reload changed MCP configuration and the rebuilt CLI.
