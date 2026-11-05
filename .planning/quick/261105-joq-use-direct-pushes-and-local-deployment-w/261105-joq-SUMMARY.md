# Personal workstation delivery

User explicitly superseded mandatory CI and test gates on 2026-11-05.

Implemented: no-op pre-push; manual-only GitHub triggers; no scheduled dependency candidates or promotions; manual release builds with checksum and immutable existing tags; deploy:local builds, checks CLI startup and links the checkout. Current project guidance supersedes earlier CI delivery requirements. Full tests remain optional and were not run for this change.

Validation: build completed with exit 0; CLI --help exit 0; workflow YAML parsed and no automatic trigger remained; diff whitespace check passed.

Delivery: commit/push and local link pending at this checkpoint. Earlier branch consolidation remains incomplete; release and dirty bootstrap worktrees contain unreviewed work. Do not delete them based on this policy change.
