---
status: complete
commit: aecfe45
---

# Dependency promotion repair summary

Repaired the unattended weekly dependency promotion pipeline and added an administrator force update workflow.

1. **Deterministic Candidate Isolation**: Modified `.github/workflows/dependency-candidate.yml` and `.github/workflows/auto-promote.yml` so Monday candidate runs push to run-scoped branches (`automation/dependency-candidate-<run-id>`). Failed candidate runs no longer mutate the shared candidate branch, preventing SHA mismatch refusals on Wednesday auto-promotion runs. Wednesday auto-promotion now selects only the latest successful candidate run with an authenticated artifact.
2. **Windows Firecrawl Fixture Cold-Start**: Extended protocol process cold-start bounds in `src/core/mcp-fixture.ts` to prevent transient 60-second timeouts on Windows CI runners while preserving strict read-only tool discovery requirements.
3. **Deterministic CI & Test Isolation**: Isolated npm cache in `test/tarball-fixture.test.ts` and `scripts/run-tests.mjs`, and injected hermetic test resources in `test/task-coursepilot-preview.test.ts` and `src/adapters/coursepilot-task.ts` to eliminate assumptions about developer host state.
4. **Administrator Force Override**: Added `.github/workflows/force-dependency-update.yml` and updated `docs/how-to/promote-dependencies.md`. Repository administrators can trigger `FORCE_LATEST` with a required audit reason to resolve current npm versions and write `catalog/stack.lock.json` directly to `main` with registry integrity validation, bypassing the weekly 36-hour cooldown and multi-OS fixture suite when emergency updates are required.

Verification:
- TypeScript check (`npm run check`) passed with exit code 0.
- Full test suite (`npm test`) on Windows host completed cleanly: 1,550 passed, 10 skipped, 0 failed; tarball lifecycle fixture completed all 10 tests with 0 failures.
