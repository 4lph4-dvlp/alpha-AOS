---
id: 260927-feo
type: execute
autonomous: true
---

# Separate fixture package preparation and install verification caches

Baseline: clean main at 3095f4d. User authorizes the test correction diagnosed during the machine update. GSD roles run inline. Own only test/helpers/install-registry.ts and this quick task's records; production installers and native workstation configurations are outside the change.

## Task 1 - Isolate package preparation

- files: test/helpers/install-registry.ts.
- action: Give both local npm pack calls a separate root-bounded preparation cache through a declared child environment. Keep the existing install cache, registry, integrity checks and expected-download assertions. Avoid changing global environment twice or losing its original saved value.
- verify: Typecheck and rebuild. Run both existing regression tests, which previously failed on an empty fetched set, through the repository test runner sequentially. These tests must now fetch ECC and all three fixture MCP archives from the loopback registry and finish normally.
- done: Synthetic archive preparation cannot satisfy subsequent installation from its own cache.

## Task 2 - Final verification and record

- files: the helper; quick task summary; .planning/STATE.md; append resolution to the earlier task's deferred-items record.
- action: Review the diff, run the complete suite once at the final code-change gate, verify build provenance and commit the isolated code fix followed by GSD evidence. No real-host discovery or managed update runs concurrently with the suite.
- verify: All 952 tests accounted for, with zero failures and platform skips reported. Existing download-origin and no-unrelated-package/audit assertions remain intact. Working tree is clean after commits.
- done: User receives the concrete change, test totals and commit references; previous fixture failure is marked resolved without erasing historical results.
