---
status: incomplete
---
# CI parity and weekly dependency verification

Product commits: 42446cf, 82b8431, 6642576 (current product SHA 6642576996ff4c6b60c0504bf46e834c6e76fa84).

Root causes: noncanonical macOS temp paths in strict job/task fixtures; Windows-specific fixture literals; direct child spawning in the GSD gate; legitimate atomic state record replacement misclassified as tampering on faster POSIX hosts; upstream Firecrawl protocol timeout in weekly run 39225300927. Fixed fixtures without weakening alias rejection. State record reads retry only superseded leaf descriptors under retained ancestor proofs, then schema and pinned owner/revision checks. Generic bounded reads still reject replacement by default. The fake no-op milestone reviewer now fails closed.

Weekly MCP verification retries once only for protocol transport timeouts/reset/DNS errors; integrity/tool compatibility failures and exhausted retries remain red. Added mandatory local push verification with a real packed artifact, full upstream-enabled tests, ECC integration, computer-use checks and provenance validation, plus opt-in pre-push hook and documentation.

Targeted evidence: 50/50 initial tests; 33/33 job/runtime/CLI/GSD tests; 65/65 portable path/task tests. First concurrent local full run was invalidated by source edits during execution: 1815 total, 1802 pass, 2 manifest failures, 11 skipped. It is NOT acceptance evidence.

Final stable local gate: process session 66688, log in OS TEMP/alpha-aos-verify-push-final.log. Do not edit src/test/package inputs while this is active.
Final remote CI: 40647100936, watcher session 27974. Linux and macOS passed; Windows pending at this checkpoint.
Final weekly candidate: 40647104036, watcher session 60181. Linux pinned fixtures passed; remaining matrix pending.
Superseded diagnostic runs 40646325801, 40646364263 and 40646692971 were cancelled after collecting their failure evidence.

Remaining: inspect terminal results and fix any actual remaining failure; enable repository pre-push hook; fast-forward main only after acceptance; archive/delete temporary verification branches; record final verification and GSD state. Do not claim that upstream outages or defective releases can never fail.


## Current bounded reconnect checkpoint

Final product SHA: df8edf9 (fix/ci-parity), includes e7f4056's physical home identity correction for Windows RUNNER~1 versus runneradmin. Regression proved the aliased home is excluded while real project markers remain authoritative. Later candidate macOS run exposed a separate MCP test budget mismatch: connect and list each had the entire outer deadline. Both now share a two-minute attempt budget with one transient-only retry within the five-minute test ceiling.

Verification is now isolated to C:/Users/alpha/AppData/Local/Temp/alpha-aos-ci-df8edf9 (git clone --local --no-hardlinks, detached df8edf9). Another task directory 261028-mmk appeared in the original workspace; do not touch that work or broadly stage files. Original workspace full runs were invalidated by edits/commits during long execution and are NOT full-suite acceptance.

Native local gate handle: 7506; log: OS TEMP/alpha-aos-isolated-df8edf9.log. Command does npm ci, build, full verify:push. Its tail command can mask shell exit status; inspect the actual gate's terminal log: all tests, ECC, computer-use checks and final build:check must pass with no 'Push verification failed'. Do not edit the isolated checkout while running.
Native CI handle: 16901; exact run 40649620949; watcher log OS TEMP/alpha-aos-ci-df8edf9.log.
Native weekly candidate handle: 68985; exact run 40649624517; watcher log OS TEMP/alpha-aos-weekly-df8edf9.log.

These are running processes, not completed verification. No main push, hook activation, task-complete transition, or test-branch deletion has occurred. Reconnect using these handles or gh run view with the exact IDs; do not restart completed waves or poll unchanged status in a model loop. Once all terminal evidence is green, fast-forward remote main without overwriting concurrent work, enable core.hooksPath=.githooks in the original clone, archive/delete only this task's temporary branches with exact leases, finish verification/summary and the GSD quick record. A changed remote main requires integration and re-verification, not force-push. Preserve the original valid main candidate 40295004410 until its role is resolved.
