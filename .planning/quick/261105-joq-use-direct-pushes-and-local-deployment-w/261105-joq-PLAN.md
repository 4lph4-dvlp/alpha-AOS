---
type: quick
status: complete
---

# Direct pushes and personal workstation delivery

User approved removing mandatory CI/tests, direct pushes, local build/startup/link deployment and stopping automatic dependency promotion. This overrides prior CI/full-suite delivery gates. Execute inline without agents.

1. Make pre-push a no-op; convert automated workflows to manual entry points; remove CI prerequisites from manual release.
2. Add deploy:local and current policy/docs. Validate workflow syntax, build and CLI startup only; do not run the test suite.
3. Commit and push main. Move the original checkout to main preserving pre-existing user files, then deploy locally. Record outcome. Original branch consolidation remains incomplete pending review of unique changes.
