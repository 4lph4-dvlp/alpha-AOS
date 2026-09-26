---
id: 260927-2h1
status: passed
verified: "2026-09-26T17:28:09.000Z"
source_commit: 314f0d2305e10e363c640678e46120d73acede7c
---

# Quick task verification

Goal: repair clean-runner Pi launch regression and Windows lifecycle timeouts through alpha-AOS / GSD, preserving required real upstream verification and environment safety boundaries.

## Must-have verification

| Truth | Evidence | Result |
| --- | --- | --- |
| Pi regression requires no host Pi installation and proves direct launch | install.test.ts constructs isolated npm-style shim/native entrypoint, requires the bridge step, invokes it and asserts arguments; removing Pi proves refusal. Windows entrypoint identity uses realpath for short/long aliases. | pass |
| Lifecycle regressions use local packages and isolated npm roots | install-registry.ts packs synthetic ECC/MCP archives with real npm, binds test-only integrity/source/rendered hashes, serves only declared packages and asserts every archive was fetched locally. Exact-package npx fixtures prevent the nested Firecrawl launch from escaping the local fixture. The shared-destination test still asserts real ECC writes and deduplication. | pass |
| Real upstream verification remains mandatory | ci.yml retains ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1 and explicitly invokes ecc-upstream.integration.js after the full suite on all three OSes. That integration installs the actual stable archive and compares source/rendered hashes; it has no skip path. | pass |
| Environment boundary remains narrow on Windows ARM64 | process.ts adds only PROCESSOR_ARCHITECTURE for native Windows ARM64. Independent empty-env and override probes confirmed OS injection. process.test.ts exercises x64, ARM64 and non-Windows controls; five related runtime boundary tests passed. | pass |
| Local final gates and 3-OS CI pass | Local full suite: 946 tests, 937 pass, 0 fail, 9 platform skips, public MCP required. Type check and build manifest pass; tarball audit verifies 176 allowlisted entries. CI 36258268517 passes packaging, all three OSes, real ECC integration and safety subsets at source commit 314f0d2. | pass |

## Review and limits

Reviewed inline against the plan: no production installer/transaction/lock changes, no broadened arbitrary environment discovery, no timeout increases, no weakened real-upstream gate. The single production change declares an OS-provided ARM64 environment name. New helper modules are outside the default test-file enumeration; the upstream integration is named explicitly by CI.

Failed evidence is retained: baseline 36254231021, and first repair 36257640172 (Windows alias comparison and real Firecrawl startup). The latter cannot serve as passing evidence; 36258268517 verifies the corrected source.

- Passing CI: https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36258268517
- Draft PR: https://github.com/4lph4-dvlp/alpha-AOS/pull/5

No native harness reinstallation or release publication is claimed. Verification ran inline because this session did not request agent delegation. Documentation closure changes only GSD records after this tested source revision.
