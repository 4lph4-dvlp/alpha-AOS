---
quick_id: 261101-ww3
status: gaps_found
---

# Verification checkpoint

| Requirement | Observed evidence | Result |
|---|---|---|
| New installs use full on all five targets | Catalog and stable lock agree; all five generated GSD install steps include `--profile=full` | Passed |
| Updates preserve milestone support | Promotion regression covers a stale standard candidate against the full stable lock and an intentional legacy standard stable lock | Passed |
| Local profile-only activation | Five native markers are full; four native skill surfaces contain the three milestone skills; Pi shares user skills and has zero standalone artifact kinds | Passed with stated Pi UI limitation |
| Meaningful read-only native invocation | Five `query init.new-milestone` calls succeeded; project/roadmap present; GSD project state hashes unchanged | Passed |
| Versions and unrelated config preserved | Deployment snapshot compares protected hashes; GSD remains 1.18.0 on all five targets | Passed |
| Source type/build and targeted regressions | Typecheck and build passed; 29 targeted tests passed | Passed |
| Ordinary regression group | 1,731 passed, 11 skipped, one source-fingerprint failure caused exactly by the agent's concurrent ECC memory write; expected hash reproduced by excluding only that new memory file | Original command failed; cause proven |
| Unchanged-source wrapper rerun | Exact failing test passed; four wrapper families executed with no skips | Passed |
| Serial Windows remainder | Seven suites completed: 139 passed, one Phase 26 public-attach registered-worker handshake failure (5,000 ms startup deadline) | Failed; unresolved |
| Not-run remainder | task-progress-integration, task-progress, verify-efficient-wait, tarball-fixture | Not run after fail-fast |

The requested profile configuration and local deployment are observed. Wider regression acceptance is not complete: both commands ended, the Phase 26 worker startup failure remains unresolved, and four subsequent files were not run. Source implementation is locally committed as `d657e8f`. No native UI reload, three-OS CI success, release, push, or repaired macOS CI is claimed. Verification is performed inline under the installed Codex adapter's no-automatic-subagent fallback; it is not a fresh independent model review.
