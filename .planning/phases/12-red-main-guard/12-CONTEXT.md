# Phase 12: Red-Main Guard - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface a red `main` CI as a self-closing tracking issue (never duplicated) and block dependency candidate promotion while the `main` CI baseline is red. Deliver requirements CI-04 and DEP-03.

In scope:
- Automated tracking issue lifecycle on `main` branch CI failure (open, refresh, auto-close on green).
- Promotion gating in the dependency candidate workflow (`.github/workflows/dependency-candidate.yml`) based on completed `main` CI baseline.
- Dedicated standalone Node.js ES modules in `scripts/` (`scripts/red-main-guard.mjs`, `scripts/check-main-baseline.mjs`).
- Unit tests under `test/` covering all failure, refresh, close, and fail-closed branches with mocked GitHub CLI/API interactions.
- Minimal workflow permission scoping (`issues: write`, `contents: read`, `actions: read` isolated in a `workflow_run` workflow).

Out of scope:
- Promoting candidate dependencies into `catalog/stack.lock.json` (Phase 13).
- Adding new harness capabilities, skills, or packs.
- Modifying `main` CI test suites or oracles (completed in Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Tracking Issue Lifecycle & Identity (CI-04)
- **D-01:** Issue identification. The tracking issue is identified by a dedicated label `ci-red-main` combined with a fixed title prefix `[CI] Main branch failure`. The guard queries open issues with this label. If an open issue exists, it refreshes that issue; if none exists, it creates a new one. This strictly guarantees no duplicate open tracking issues.
- **D-02:** Issue refresh. When `main` CI fails again while an issue is already open, the guard updates the issue body with the latest failure summary (commit SHA, run ID, and 3-OS matrix status table) and appends a single timestamped comment detailing the new failing run.
- **D-03:** Issue auto-close. When `main` CI completes with all three OS legs green, the guard posts a resolution comment referencing the successful run ID, commit SHA, and matrix pass confirmation, then closes the issue with state reason `completed`.
- **D-04:** Failure details. The issue body and comment include a structured 3-OS matrix status table (OS leg, result, failing step name), commit metadata, and direct link to the GitHub Actions run.

### Workflow Placement & Permissions
- **D-05:** Separate `workflow_run` workflow. The issue guard runs in `.github/workflows/red-main-guard.yml`, triggered on `workflow_run` (workflow: `CI`, types: `[completed]`) on `main`, plus `workflow_dispatch` for manual testing. This isolates `issues: write` permissions to default-branch executions and keeps `.github/workflows/ci.yml` strictly read-only for external PRs. — **Reversibility:** costly — alters GitHub Actions workflow trigger architecture and permissions boundary.
- **D-06:** Minimal permissions. `.github/workflows/red-main-guard.yml` is granted only `issues: write`, `contents: read`, and `actions: read`. No other write permissions are granted.
- **D-07:** Defense-in-depth branch filtering. Both the workflow job condition (`if: github.event.workflow_run.head_branch == 'main'`) and script internal verification assert that the run occurred on `main`, exiting immediately if triggered for any other branch or PR.

### Candidate Promotion Gate (DEP-03)
- **D-08:** Promotion block surfacing. In `.github/workflows/dependency-candidate.yml`, when `main` CI baseline is red or unreadable, the candidate PR body is updated with a prominent status banner (`### 🚫 Promotion Blocked: Main CI is failing (Run #ID)` vs `### ✅ Promotion Eligible`) and the label `promotion-blocked` is toggled.
- **D-09:** Baseline query logic. The candidate workflow checks the latest completed run (`status: completed`) on `main` for workflow `CI`. In-progress runs are ignored. If no completed run exists on `main`, the gate fails closed and marks promotion blocked.
- **D-10:** Execution status on block. When promotion is blocked, the candidate workflow still stages candidate lock updates and maintains the PR diff (exit 0) so reviewers can inspect candidate versions, but surfaces the block via PR banner, label, and GitHub Actions Step Summary.
- **D-11:** Block information scope. The PR banner and Step Summary record the failing run ID, run URL, commit SHA, timestamp, and failed OS legs. When green, it records the green baseline run ID and commit SHA.

### Script Architecture & Testing
- **D-12:** Standalone scripts. Guard logic is implemented as standalone Node.js ES modules in `scripts/`: `scripts/red-main-guard.mjs` (tracking issue lifecycle) and `scripts/check-main-baseline.mjs` (candidate promotion gate). They use Node 24 built-in APIs and `gh` CLI commands without external npm dependencies.
- **D-13:** GitHub interaction abstraction. GitHub CLI calls are abstracted via an injectable executor function, allowing unit tests to mock `gh` outputs cleanly without child process spawn issues or network access.
- **D-14:** Comprehensive unit testing. New tests in `test/` (e.g. `test/red-main-guard.test.ts` and `test/check-main-baseline.test.ts`) verify all 6 core scenarios against mocked responses:
  1. main CI fails (first time) → creates tracking issue with run ID and failed legs.
  2. main CI fails (issue already open) → refreshes issue body and comments without duplication.
  3. main CI passes (issue open) → closes tracking issue referencing green run.
  4. candidate promotion check on red main → returns blocked and names failing run.
  5. candidate promotion check on green main → returns unblocked and names green run.
  6. candidate promotion check with no completed main runs → returns blocked (fail-closed).
- **D-15:** Error handling and fail-closed policy. Any unexpected API failure in `scripts/red-main-guard.mjs` logs to stderr and exits 1 to alert maintainers. For `scripts/check-main-baseline.mjs`, any unhandled error or ambiguous status triggers a fail-closed response (reports blocked).

### Claude's Discretion
- Exact markdown formatting and visual layout of the issue and PR banners.
- Internal helper structure within `scripts/red-main-guard.mjs` and `scripts/check-main-baseline.mjs`.
- Plan split and wave ordering (e.g. scripts + tests first, then workflow integration).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 12: Red-Main Guard" — success criteria and planning note (deterministic external automation, minimal permissions).
- `.planning/REQUIREMENTS.md` — CI-04 and DEP-03 requirement text.
- `.planning/PROJECT.md` §"Constraints" — Determinism (no LLM judgment) and Secrets/Safety constraints.

### Workflows under integration
- `.github/workflows/ci.yml` — Target workflow monitored by the guard.
- `.github/workflows/dependency-candidate.yml` — Candidate staging workflow to be gated by the guard.
- `.github/workflows/pack-skill-drift.yml` — Reference for workflow permissions and structure.

### Script and test patterns
- `scripts/run-tests.mjs` — Repository script conventions.
- `scripts/audit-tarball.mjs` — Node.js script pattern in repository.
- `test/` — Unit testing conventions with `node:test` and `node:assert/strict`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- GitHub CLI (`gh`) usage patterns already present in `.github/workflows/dependency-candidate.yml:41-49` (`gh pr view`, `gh pr create`).
- GitHub token injection via `env: GH_TOKEN: ${{ github.token }}`.
- Step summary generation via `$GITHUB_STEP_SUMMARY`.

### Established Patterns
- Scripts under `scripts/` use `.mjs` extensions and pure Node.js standard libraries (`node:fs`, `node:crypto`, `node:child_process`).
- Unit tests under `test/*.test.ts` compiled with TypeScript and executed via `scripts/run-tests.mjs`.

### Integration Points
- `.github/workflows/red-main-guard.yml` (new workflow) triggered on `CI` completion.
- `.github/workflows/dependency-candidate.yml` (modified) calling `scripts/check-main-baseline.mjs`.
- `scripts/red-main-guard.mjs` and `scripts/check-main-baseline.mjs` (new scripts).
- `test/red-main-guard.test.ts` and `test/check-main-baseline.test.ts` (new tests).

</code_context>

<specifics>
## Specific Ideas

- The tracking issue title prefix is `[CI] Main branch failure` and carries the label `ci-red-main`.
- When closing, the state reason is set to `completed` and the comment explicitly cites the green run ID and commit SHA.
- Candidate PR #1 displays a clear markdown banner at the top of the body indicating promotion eligibility.
- Discussion conducted in Korean on 2026-09-24. The user accepted the recommended option on every question.

</specifics>

<deferred>
## Deferred Ideas

- Slack/Discord webhook alerts on red main (outside repository boundaries, future ops enhancement).
- Automatic re-run trigger on transient flake detection (deferred to future hardening).

</deferred>

---

*Phase: 12-red-main-guard*
*Context gathered: 2026-09-24*
