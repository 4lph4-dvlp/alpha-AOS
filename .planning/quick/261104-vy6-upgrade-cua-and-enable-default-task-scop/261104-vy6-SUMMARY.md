---
status: complete
style: conversational-quick
verification: composed-local-coverage
---

# Default Cua GUI tooling

Completed and applied locally. Cua Driver is 0.38.0; all five harness MCP entries
and both owned guides are CURRENT. The managed connection exposes 39 GUI tools;
actual health_report invocation and raw-execution refusal were verified.

Final validation: type/build checks passed; corrective Cua/MCP/identity run 66/66
passed; all remaining native/packed groups completed, 237 passed and 1 host skip
out of 238. The ordinary run's four timing-fixture failures were corrected and
all four names passed in the corrective run. This is composed coverage, not a
claim of one clean full-suite invocation or new remote CI acceptance.

Open harness sessions need a reload to discover the new MCP connection. No new
GUI screenshots/input effects were executed; no new macOS/Linux live proof is
claimed. Full test logs are retained outside Git under the TEMP paths below.

Implemented Cua Driver 0.38.0 as the default ordinary GUI provider for all five
harnesses, with native standard approvals and a 39-tool GUI allowlist. Ordinary
GUI work uses `computer-use native-mcp` without an autopilot contract. The
existing bounded broker still checks exact approved autopilot grants.

Explicit user GUI permission selects managed Cua within that task. Updated both
owned guides and integrity hashes so agents do not repeat an answered provider
or automatic/manual question. Native refusals, wider effects, OS grants and
foreground takeover remain subject to the relevant permission.

Runtime provenance: official 0.38.0 signed SHA256SUMS verified with cosign 3.1.4,
exact release-workflow identity and GitHub Actions issuer. Five archives matched;
all entrypoint/companion hashes extracted and recorded. Historical 0.37.0 research
and live receipts remain historical. New native tool schema fixture is actual
Windows 0.38.0 discovery, not a renamed old fixture.

Host progress:

- Installed Driver upgraded 0.28.2 -> 0.38.0 using transaction
  `2026-11-04T14-15-28-650Z-bb5b78ed-722b-4eb7-a369-db79b694598b`.
  Old standard daemon was stopped for replacement; no new shared daemon enabled.
- All five installed harnesses' MCP configurations and both owned skills applied
  transactionally; all rechecked CURRENT. Full operation IDs retained under the
  user state root at `computer-use/runtime/0.38.0/host-configuration.json`.
- Raw native tools/list: 63 tools; read-only health_report invoked successfully.
- Managed alpha-AOS route: 39 tools; health_report invoked; run_script denied.
  Zero screenshots and zero GUI input effects executed in this task.
- Focused regression run: 67/67 passed. Type checking passed.
- First full run: 1939 ordinary tests, 1919 passed, 7 failed, 13 skipped.
  Repaired owned-guide heading and proof bindings; one source-immutability check
  was contaminated by writing evidence during the run. The remaining bootstrap
  fixture was already fixed in the user's named release-analysis session.
- Applied released a2328ca runtime/test fixes, preserving installed 0.6.0 behavior.
  Regression reruns: 53 passed / 1 host symlink skip; then 30 passed / 1 skip.
- Frozen full run in `job-8c4c22ecd89746e3` exceeded its 30-minute deadline and
  became orphaned with DEADLINE_CLOSE_UNCONFIRMED. Its 156302 output bytes were
  excerpt-truncated, so no full-suite outcome/counts are accepted from that run.
  Parent/worker PIDs 884876/9120 and matching test Node processes were subsequently
  absent; the historical orphan receipt was not rewritten as success.
- Controlled retry uses the SAME source 5fcbd9b with direct native process/file
  redirection to separate test behavior from the job wrapper's output/closure
  monitoring. Exec session 27983; test PID 797684; finite 45-minute wait.
  Full stdout/stderr: `%TEMP%/alpha-aos-cua-final-direct.stdout.log` and
  `%TEMP%/alpha-aos-cua-final-direct.stderr.log`. Source files remain frozen.
- Direct ordinary regression finished: 1947 tests, 1930 passed, 4 timing-fixture
  failures, 13 host skips. Three Cua scenarios expired their real 1-second capture
  window during loaded disk I/O; one identity test hit its observer timeout.
- Corrected TEST clocks using node:test Date/timer mocks, preserving production
  freshness/deadline limits. Added a deliberate expired-capture refusal test and
  propagated early input rejection instead of hanging on a never-entered fixture.
  Corrected signed-checksum/schema-approval wording only in runtime metadata.
- Source commit 4b69d1f contains these fixture/metadata corrections. All 66 focused
  Cua/MCP/identity tests passed, including the four previously failing scenarios.
- Completed full coverage without rerunning unchanged passing ordinary cases:
  remaining 11 Windows native suite groups and packed lifecycle now execute
  sequentially in exec session 5531 (exit 0). Per-suite logs and the result ledger are
  outside Git at `%TEMP%/alpha-aos-cua-final-*.test.js.log` and
  `%TEMP%/alpha-aos-cua-final-supplemental.json`.
- Global npm link completed; doctor reports enabled default GUI capability and
  reviewed 0.38.0 runtime available. Existing package backup target:
  `~/.alpha-aos/snapshots/alpha-aos-before-cua-038-20261104.zip`.

Commits: b147f85 preserves released runtime fixes; 5fcbd9b implements default Cua;
4b69d1f makes timing fixtures deterministic without relaxing production policy.
User-directed reference: session 01a1a4b9-abfd-79e0-b79c-c5f2226b68b6, successful
released a2328ca three-OS CI 41777133878. That CI does not certify new Cua changes.

Final host check: all five MCP configurations and both guide deployments are
CURRENT; type checking and build-artifact verification pass; installed binary
reports cua-driver 0.38.0. Historical orphaned job evidence is retained unchanged.
Unrelated pre-existing release changes and the Phase 31 milestone lock remain
preserved. No publication or release was requested or performed in this task.
