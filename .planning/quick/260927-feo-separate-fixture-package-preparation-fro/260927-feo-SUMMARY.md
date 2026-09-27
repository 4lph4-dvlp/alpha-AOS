---
id: 260927-feo
status: complete
date: 2026-09-27
commit: 5597657
verification: passed-windows
---

# Isolated package preparation from installation verification

Changed only test/helpers/install-registry.ts in executable code. Both local npm pack calls now use npm-pack-cache through a declared child environment, while the later installation and integrity fixtures keep their separate npm-cache. Both caches remain inside the test-owned temporary root and are removed by existing cleanup. The original environment restoration is preserved without setting the same global variable twice.

The local npm pack preparation was populating the cache with each exact synthetic archive before the measured installation. npm could then reuse those bytes instead of requesting the archive from the loopback registry. A diagnostic independently confirmed that the exact ECC archive was already cached before any installation. The test's empty fetched set therefore did not establish a failed managed installation.

The fix preserves the loopback download-origin assertion, package integrity and rendered-skill checks, and the rejection of unrelated packages or audit calls. It changes neither production installation nor update behavior, dependencies, locks, or native workstation configuration.

## Verification

- npm run check: passed.
- npm run build and build:check: passed; 132 inputs and 262 outputs.
- Both previously failing regressions, run sequentially with a name filter: 2 passed, 0 failed. Their original download assertions stayed enabled.
- Complete suite through scripts/run-tests.mjs on Windows: 952 tests, 942 passed, 10 platform skips, 0 failed, 0 cancelled. Duration: 425056.7913 ms. Both regressions also passed in this full execution, including the packaged release lifecycle and all four wrapper-family cases.
- Manual diff review and git diff --check: passed. No new test was added because the existing regressions directly detect the cache contamination and verify all expected downloads.

GSD roles ran inline. No schema push applies to this test helper; the advisory assumption detector reported phase_unresolved for the quick-task identifier and was skipped. The earlier 260927-eqm deferred record now links to this resolution while retaining its historical failure totals. Code fix commit: 5597657. No remote push or CI run was performed.
