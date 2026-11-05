# Branch consolidation and v0.6.1

Status: complete (2026-11-05).

## Delivery

- Release source: fecea035a8abb2215bbc55766352dc0de1d1b008; tag v0.6.1 points to this exact commit.
- Public GitHub Release: https://github.com/4lph4-dvlp/alpha-AOS/releases/tag/v0.6.1 (not draft or prerelease).
- Package: alpha-aos-0.6.1.tgz; SHA-256 78db66ac0683e52b4aea0b71d2fb6aabdf06e9e2b716523edf471710055b1b55. Uploaded GitHub asset digest matches. Checksum file uploaded alongside it.
- Build and CLI startup exited 0. Original workstation deploy:local exited 0; globally linked alpha-aos --version reports 0.6.1.
- CI and tests intentionally not run, per the owner's delivery policy. No npm registry publication.

## Branches and preservation

Local and origin branches now contain only main. The exact observed tips of five remaining remote branches were deleted atomically with the main push, using leases. Three remaining local branches were deleted after ancestry checks. Previously removed merged branches are recorded in the earlier handoff.

Selected release documentation and optional prohibition verifier/tests were carried forward. Newer main runtime fixes and the direct-push policy were preserved. Dependency-only proposals were retired without applying their pins; stable dependency pins remain unchanged. Main's merge parents retain all retired commit histories.

The bootstrap worktree remains detached at e0d9d8d with its three uncommitted edits intact; bootstrap-uncommitted.patch preserves those exact edits. The existing stash remains. All earlier refs and stash also survive in the verified local bundle .planning/tmp/branch-consolidation-before-061.bundle. Original quick working notes were moved to .planning/tmp/branch-review-original-4uv-before-061. Existing STATE.md user changes and showlock.py were preserved.

This completes repository consolidation and public release delivery; it does not close unrelated phase human-proof requirements or certify macOS/Linux compatibility.
