---
quick_id: 261101-ww3
status: incomplete
reason: Profile change delivered; wider regression verification has an unresolved Phase 26 worker handshake failure.
---

# Milestone-capable GSD default and local activation

## Implemented

Source implementation commit: `d657e8f` (`feat(gsd): default to the milestone-capable full profile`). This is a local commit on `release/0.5.0`; it has not been pushed.

- Catalog policy and the stable lock now select GSD `full`; GSD remains pinned to 1.18.0 with its original integrity. No package dependency was upgraded.
- Candidate resolution defaults to full when no profile is present. Promotion preserves the stable lock's profile instead of forcing standard. Recovery's omitted-profile default follows full. Regression coverage checks stale standard candidates cannot downgrade the full stable profile and preserves intentional legacy choices.
- Current project constraints, English/Korean README guidance, and the historical design document's supersession notice record the explicit user choice.
- Installed Codex, Claude, Antigravity, Pi, and Hermes profile markers are full. Native surface APIs materialized skills/agents sequentially; no full alpha-AOS reconciliation or GSD package reinstall was performed.
- Codex, Claude, Antigravity, and Hermes each expose `new-milestone`, `complete-milestone`, and `audit-milestone` skills. Pi 1.18.0 has no standalone surface artifact kinds; shared user skills were expanded by the Codex materialization. Native Pi UI activation is not claimed.
- All five native GSD tools accepted read-only `query init.new-milestone`, with project/roadmap present. STATE/PROJECT/ROADMAP hashes stayed unchanged by these invocations. All five alpha-AOS `inspectGsdInstall` checks report current against the new lock.

## Verification already observed

- `npm run check`: passed.
- `npm run build`: passed.
- Catalog, promotion, update, and recovery suites: 29 passed, 0 failed, 0 skipped.
- `git diff --check`: passed.
- Protected native configuration files and all five GSD version files retain their pre-apply hashes.
- First backup attempt failed on a Windows symlink-copy privilege before any surface mutation. A second snapshot used existing GSD-owned artifacts only and dereferenced their content; native application then completed.

## Durable local evidence

- Backups and native deployment receipt: user state `backups/gsd-full-261101-ww3-v2/{snapshot,result}.json`.
- Targeted log: OS TEMP `alpha-aos-gsd-profile-targeted-261101-ww3.log`.
- Full suite log: OS TEMP `alpha-aos-gsd-profile-full-261101-ww3.log`.
- Original full-suite exec session `3395` ended with 1,731 passes, 11 skips, and one checkout-fingerprint failure across 1,743 tests. It skipped the runner's ten isolated Windows suites and final packed suite after the failure, as designed.
- Root cause was the ECC checkpoint saved during the preview test: the observed full checkout hash is `1b414973c5e66a1af4fc359a9d4d728a2843a510e2623646c94182eaf62fe536`; excluding only the newly created memory `mem_20261101_9531e99aa83644ef8b53.md` reproduces the assertion's expected hash `3237b3d086b97cef7d74b7aaefb4814079f027ae7537021396554724abeeb6f6` exactly. No wrapper source fix was needed.
- The exact failing wrapper test was rerun against unchanged product source: 1 passed, all four PowerShell/Bash install/update wrappers executed, no skipped family. Log: OS TEMP `alpha-aos-gsd-profile-preview-261101-ww3.log`.
- Serial remainder exec session `23243` ended with 139 passes and one failure across seven Windows suites (140 tests). `phase26 public attach observes an applied registered job` failed because the detached registered worker did not complete its handshake within 5,000 ms (`job-8aff6aa5e58e46ea`). The profile-related tests are passing; no unrelated runtime timeout or panel source was changed.
- Four subsequent files were not executed after that failure: `task-progress-integration.test.js`, `task-progress.test.js`, `verify-efficient-wait.test.js`, and `tarball-fixture.test.js`. Do not count them as passed. Live paid canaries were disabled. Both test execution sessions have ended; there is no active regression runner to restart or observe.

## Remaining at this checkpoint

The requested source/default change and local profile application are delivered. Wider regression acceptance remains open: investigate the named Phase 26 worker handshake failure only under a separately scoped request, then execute the four not-run files and required validation. Do not relabel either failed command as passed or mark this quick task fully verified. No push, CI repair, release, or unrelated update is authorized by this task. The prior release/macOS CI hold remains in force; previous release handoff is `.planning/quick/261101-km8-release-alpha-aos-0-5-0-with-shared-prog/261101-km8-HANDOFF.md`.

## Restart instruction

After final handoff, start a fresh Codex session in this project and check `$gsd-new-milestone`. The skill is now materialized at the native user skill root. Other harnesses should likewise refresh their session/tool inventory. This session has not been forcibly restarted or represented as already refreshed.
