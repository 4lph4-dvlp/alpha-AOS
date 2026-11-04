---
status: verified-composed
source: 4b69d1f
---

# Verification

## Acceptance evidence

| Requirement | Evidence |
|---|---|
| Update installed Cua | `cua-driver --version` returns 0.38.0; six Windows files replaced in a reversible transaction |
| Verify supported release assets | Sigstore-signed SHA256SUMS verified with exact release workflow identity/issuer; five archives and all companion hashes retained |
| Default GUI provider across five harnesses | All five global MCP configurations and both owned skills applied transactionally and rechecked CURRENT |
| Ordinary GUI work without autopilot contract | Dedicated native-mcp entrypoint uses native standard approvals; bounded broker grant checks remain unchanged |
| GUI permission selects managed Cua within task | Both owned guides explicitly carry scope/reuse rules; stable source/target hashes and packaged proof bindings updated |
| Proactive use when CLI/API is impractical | Automatic guide trigger and ordinary-work instructions cover app/browser operation as well as verification |
| Preserve permission boundaries | Fixed standard profile, no permission override arguments, rehashed reviewed binaries/companions, explicit GUI allowlist |
| Isolated observers omit native desktop entry | Regression renders already-configured input for all five harnesses and verifies the native entry is removed |
| Native validation | Actual MCP discovered 63 native tools; managed route exposes 39, invokes health_report and refuses run_script |
| Preserve installed 0.6.0 behavior | Imported already-released runtime fixes from a2328ca; published CI 41777133878 verified success separately from new Cua tests |

## Local checks

- Type checking and build-artifact verification passed.
- Initial focused Cua/MCP regression: 67 passed, no failures/skips.
- Guide/proof/preview regression after corrections: 53 passed, 1 host symlink skip.
- Released-baseline composed regression: 30 passed, 1 host symlink skip.
- Managed full job `job-8c4c22ecd89746e3`: orphaned at 30-minute deadline;
  DEADLINE_CLOSE_UNCONFIRMED, output truncated. No accepted full outcome.
- Same-source direct retry completed with full external file logs.
- Direct ordinary run completed: 1947 total, 1930 passed, 4 timing failures,
  13 skips. After test-only clock corrections (4b69d1f), focused rerun 66/66
  passed, including all four prior failures and a deliberate expiry refusal.
- Remaining full-suite groups completed (exec session 5531 exit 0): 238 total,
  237 passed, 0 failed, 1 host skip. External per-suite logs and
  `%TEMP%/alpha-aos-cua-final-supplemental.json` retain evidence.
- Final type checking and build-artifact verification passed. All five harness
  configurations and both owned guides rechecked CURRENT; driver reports 0.38.0.

Coverage is composed from the ordinary run, corrected affected-suite rerun and
the remaining native/packed groups. Do not describe this as one clean full-suite
invocation at 4b69d1f or as remote CI acceptance.

| Remaining suite | Passed | Skipped |
|---|---:|---:|
| command-job-runtime | 5 | 0 |
| command-job-worker | 4 | 0 |
| command-jobs | 39 | 0 |
| efficient-wait-cli | 9 | 0 |
| mcp-proxy | 38 | 0 |
| process | 31 | 0 |
| protocol-session | 11 | 0 |
| task-cli | 43 | 0 |
| task-progress-integration | 13 | 0 |
| task-progress | 15 | 0 |
| verify-efficient-wait | 19 | 1 |
| tarball-fixture | 10 | 0 |

The first full run's seven failures are retained in the external log. They were
owned-guide/proof bindings, a preview source-mutation check contaminated by
writing evidence during the run, and the stale composed-bootstrap fixture.
These were corrected before freezing the final run. Historical release ledger
totals and holds were not relabeled as fresh passing evidence.

## Limits

No screenshot, click, typing or other GUI input was executed during this task.
Successful read-only invocation establishes runtime/MCP connectivity, not GUI
input behavior. macOS/Linux artifacts are provenance-verified; no new live GUI
claim is made for those systems. Reload each open harness to load its new MCP
configuration. No release publication or remote CI for these Cua changes was
requested or performed.
