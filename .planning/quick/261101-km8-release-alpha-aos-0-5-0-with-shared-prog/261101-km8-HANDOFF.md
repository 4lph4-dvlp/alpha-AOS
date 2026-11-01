---
quick_id: 261101-km8
status: paused
reason: user chose manual PC restart after unsuccessful authorized WMI repair
date: 2026-11-01
---

# Resume alpha-AOS 0.5.0 release and global installation

## User authorization and scope

User requested version0.5.0, remote GitHub upload and global alpha-AOS installation
for the agents already present. Ordinary conversational GSD quick path applies;
no autopilot contract is needed. User later explicitly authorized a WMI service
repair attempt, then chose **manual PC restart and continuation** after that
attempt did not restore taskkill. Do not automatically reboot or restart more
system services. Resume when user says the PC was restarted.

Repository: `D:/dev/alpha-AOS`, **not** default `D:/dev/oh-my-circuit`.
Branch: `release/0.5.0`; implementation/source head before this handoff:
`4f3db9b75461f7309c0c4ca9af91ef96f7967ed6`.
Do not touch or resume Oh-My-Circuit. Sol high plans/reviews; Terra high edits code.
Root owns remote/installation operations. No model substitution, paid native
canary, npm public-registry publishing, forced push or hook/CI bypass.

## Completed

- All prior Phase25/26 feature changes are committed and reachable. Phase26 had
  1938tests/1926pass/12skip and actual goal verification14/14 at its historical
  source. A later package-version change makes that old fingerprint stale;
  do not pretend it covers new release metadata or rerun whole old phases.
- Version/root lock versions0.4.8→0.5.0, changelog and bilingual README notes:
  commit78834290d3c45f8448be966796e4ec74c5125506. Dependencies unchanged.
- Built CLI0.5.0, check/build artifact and28targeted checks passed.
- Readonly project-pack checkpoint selected BROWNFIELD_INIT/MCP_SERVER; no new
  project packs were approved/applied (user authorization is global rollout).
- Fixture contract corrections + exhaustive Windows isolation policy4f3db9b:
  finite60s viewer test lifetimes, explicit cleanup of both attach observers,
  one finite same-job reconnect with strict positive cancellation/exit checks.
  Production runtime limits unchanged. Three new process test files join the
  existing Windows isolated group; all155currentfiles still run exactly once.
- Affected named cases passed8/8serially. Explicit concurrent run passed6/8,
  two unresolved; this contrary result is retained, not claimed fixed.

## Not completed

- Remote main is still the previously observed9fae6cf; release/0.5.0 andv0.5.0
  have not been pushed. Refresh live remote refs before any resume mutation.
- Global installed CLI remains0.4.8; it is a regular npm package directory,
  not a link to this checkout. No global target sync/install was applied.
- All five agents were detected: claude,codex,antigravity,pi,hermes.
- QuickTask2/3 and final GSD summary/state completion remain pending.

## Actual release blockers and evidence

1. Initial ordinary push failed its active pre-push hook: main batch1816tests,
   1798pass,7fail,11skip. Six cancellation observation timeouts and one short
   attach handoff timeout. Log `.planning/tmp/release050-push-branch.log`.
2. After fixture corrections, second pre-push execution stalled: last output
   stopped at06:45:34UTC and was unchanged for over30minutes. It already had
   `command-job-runtime: owned cancellation proves actual child and worker exit`
   failing. Native exec23860 was interrupted through its own handle (Ctrl-C,
   exit1); do NOT resume that old process after reboot. Full gate did not pass.
   Log `.planning/tmp/release050-push-branch-v2.log`. Isolated new progress
   files were not yet reached in this incomplete run.
3. Standalone existing owned-cancellation case also failed (observation timeout)
   in `.planning/tmp/release050-owned-cancel-probe.log`; isolation alone is
   not proof of recovery on this host. The existing command-job-runtime test
   family is another real process file currently outside the isolated list.
4. Standalone mcp-fixture tests passed4/4 in4.5seconds; last log location alone
   does not establish that module caused the full-run stall.
5. Two directly created owned Node children independently showed native
   `C:/Windows/System32/taskkill.exe /PID <owned> /T /F` never returning within
   15s/10s and not exiting the child. Adding a PID filter did not help. Probe
   cleanup used the exact held Process handle; no unrelated process was killed.
6. User-approved elevated WMI-only restart succeeded2026-11-01T07:31:32UTC, but
   subsequent identical native taskkill probe still timed out after10s. WMI is
   therefore NOT established as the cause or a successful fix. Service is Running.
   Local evidence `.planning/tmp/release050-winmgmt-repair.json`; exact reviewed
   helper SHA256F55BBE5CAB27CA3C4F9F9A62D5FA8481977ED1DB3138168639DE5EF3850973C9.
   Normal current shell is not elevated; user approved that one UAC operation.

## Resume order — no blind repeat of long gates

1. Confirm user restarted PC. Inspect this handoff, git status/branch and live
   refs; preserve unrelated `.alpha-aos/`, research cache and `.planning/tmp/`.
2. First repeat ONE native taskkill probe against a newly created owned process,
   then the named owned-cancellation test. A dead numeric PID is never kill
   authority; preserve exact handles/creation identity. If native taskkill still
   hangs, report the host blocker; don't start another hour-long push verification.
3. If healthy, inspect conditional Windows test scheduling for the newly observed
   command-job-runtime case. Any edit remains Terra-owned with meaningful targeted
   tests; no blanket timeout increases, ignored failures or fabricated closure.
4. Prepare every intended release change, then select final candidate SHA. Push
   normally. Active `.githooks/pre-push` runs build +verify:push (pack/audit,
   fullsuite, upstreamECC/MCP, computer-use and provenance); do NOT bypass it.
   Give future long gates a durable owned job, a finite overall deadline and
   external logs; avoid endless model monitoring or unchanged-file rereads.
5. After release branch push succeeds, explicitly dispatch
   `gh workflow run ci.yml --ref release/0.5.0` (branch pushes alone don't trigger
   this workflow), retain exact run ID and verify all3OS green on candidate SHA.
6. While remote CI runs, local full tests are finished, so preview/apply global
   bootstrap install for all5targets via managed CLI (no manual config edits).
   Human preview works; all-target JSON exceeds262KiB and correctly refuses.
   Existing human preview log `.planning/tmp/release050-install-plan-before.txt`
   is historical; regenerate after reboot/source changes. Original plan had
   npm-ci/build/link plus managed installation under one mutation session.
7. Once exact-commit3OSCI succeeds, fast-forward main and tagv0.5.0 through normal
   hooks. No force/reset. No npm registry publish requested; source installation
   and optional GitHub release/verified package asset suffice.
8. Verify remote main/peeled tag exactSHA, globalCLI0.5.0, managed components
   CURRENT on all5and actual read-only health. Preserve models, credentials and
   unrelated settings. Only then finish quick SUMMARY/STATE and report completion.

Root plan is261101-km8-PLAN.md. Regression history is261101-km8-REGRESSION.md.
Prepared GitHub notes: `.planning/tmp/release050-notes.md`.
Unknown model tokens/cost remain unavailable, not zero. Research-temp deletion
was separately policy-blocked; do not retry or work around it as part of release.
