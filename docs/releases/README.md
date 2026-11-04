# GitHub release procedure

1. Finish source changes on a review branch. Run the `CI` workflow on that exact commit and require the package job plus Linux, macOS and Windows jobs to succeed.
2. Fast-forward `main` to that exact verified commit. A merge commit or any new source change requires its own CI run.
3. Dispatch `GitHub Release` from `main`, supplying the stable package version, exact source SHA and successful CI run ID. For example: `gh workflow run release.yml --ref main -f version=0.6.0 -f source_sha=FULL_SHA -f ci_run_id=RUN_ID`.
4. Verify the workflow succeeded and the public release contains the package, its checksum, `release-evidence.json` and `release-assets.sha256`.

Publication downloads the original CI package; it does not rebuild it. It refuses mismatched source, version, repository, workflow, required jobs or checksums. It verifies the uploaded bytes while the release is still a draft. Repeating the same inputs can resume an interrupted draft or verify an already published release. A published release with different bytes is refused rather than overwritten. Never retarget an existing tag or replace a published package.

The procedure uses GitHub Actions, Git, Node.js and GitHub CLI. It requires no agent workflow controller, lifecycle-state operation, model call or local/global harness installation. Product tests may exercise isolated tool fixtures; they do not manage the release process. npm registry publication is a separate operation.
