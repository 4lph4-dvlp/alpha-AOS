---
status: investigating
trigger: User requested remaining v0.6.0 work, official release and passing CI on 2026-11-03
---

# v0.6.0 final gates and release

## Scope and authority

Ordinary conversational GSD; resume the six completed Phase 31 plans without restarting waves. The current user request authorizes candidate/main delivery and official release after required verification gates. Existing privacy, sandbox, historical evidence and unpaid-canary boundaries remain. Preserve pre-existing STATE/HANDOFF edits. No autopilot contract or model substitution.

## Evidence

- HEAD 9e379adb8e5c6a74a62dd9e02afd73c0e135c45b on release/0.6.0; six summaries exist, no incomplete plans.
- Native CI 41307974019 failed macOS; package/Linux/Windows passed. Candidate c3dfb98 has the native-HTTP test client remediation, not yet tested by remote CI.
- Prior pre-push receipt .planning/tmp/31-060-push.log: 1955 tests, 1940 pass, 2 fail, 13 skip; ordinary group 1097522ms. Oversize transport took 44593ms and missed 30000ms close deadline; doctor matrix child returned null after its 30000ms process deadline.
- Fresh unchanged focused baseline .planning/tmp/060-contention-baseline.log: both pass, oversize 3316ms, doctor 6253ms, 2/2, total 6667ms. This establishes load sensitivity, not a universal root-cause proof.
- Source inspection: Windows terminateProcessTree synchronously invokes taskkill /T /F. MCP proxy exercises this native primitive but is absent from the existing sequential native group. Doctor matrix invokes collectInventory, which probes installed host CLIs sequentially, each with a 10000ms budget; its test currently inherits the host PATH.
- Node 24 official test-runner documentation, discovered through Exa and extracted by Firecrawl: each file has a child process and --test-concurrency caps concurrent file processes. https://nodejs.org/docs/latest-v24.x/api/test.html

## Hypothesis and next action

Keep native MCP shutdown tests out of ordinary Windows file contention, preserving actual process-death checks and deadlines. Make compiled doctor formatting/matrix coverage use an empty fixture command path and fixture cwd, so it does not measure unrelated installed CLI startup. Extend the existing runner behavioral test to cover MCP ordering and exactly-once accounting. Run scoped tests, then the mandatory pre-push gate once and exact-SHA three-OS CI. Any new failure requires fresh evidence, not blind retries.

## Remaining acceptance

Candidate full local gate; exact-SHA Linux/macOS/Windows CI; fresh Phase 31 goal verification and GSD completion; milestone audit/completion; main integration; official release preview/publication with provenance and registry smoke as supported by authentication. Do not mark these complete before actual receipts.

## Scoped repair result

Windows native group now includes mcp-proxy.test.js. Existing runner integration fixture includes this file, asserts sequential exclusion and retains exactly-once/packed-last checks. Doctor matrix rendering uses an empty fixture PATH and fixture cwd; 30000ms deadlines and production discovery are unchanged. Scoped build passed; runner/matrix suites passed 9/9 in 13340ms (.planning/tmp/060-scoped-tests.log). These results justify a new full pre-push gate but do not certify it.

npm authentication preflight returned E401 and public alpha-aos lookup returned E404; GitHub repository push/admin permissions are available. User was asked asynchronously to complete npm login or choose GitHub-only delivery. No credential values were read or emitted.
