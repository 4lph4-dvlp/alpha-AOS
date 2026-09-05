---
status: investigating
trigger: "CI run 33937610401 ubuntu-latest: `npm test` green (190/0) but 'Safety boundary suites' step (explicit 10-file `node --test`) fails 4 tests. Failures 1-3 in preview.test.ts (home sentinel digest mismatch, concurrent previews, wrapper touched home surface), failure 4 in protocol-session.test.ts (descendant process left running)."
created: 2026-09-05
updated: 2026-09-05
---

## Current Focus

bug_class: Bohrbug (deterministic, environment-conditioned) for failures 1-3; Heisenbug (load-dependent oracle race) for failure 4

hypothesis: |
  CONFIRMED (1-3): `alpha-aos install` PREVIEW spawns `npm root --global`
  (src/core/install.ts:213-223, reached from the plan builder at install.ts:275,
  and from `bootstrap install` via bootstrap.ts:311 ->
  createManagedInstallOperationPlan). npm unconditionally writes a debug log
  into its cache directory. The cache location is `npm_config_cache` when set,
  otherwise home-derived (`$HOME/.npm` on POSIX). `npm test` runs the test
  process as an npm LIFECYCLE SCRIPT, so npm injects `npm_config_cache` into
  process.env; preview.test.ts spreads process.env into sandbox.env, and
  src/core/install.ts:179 allowlists `npm_config_cache` through to the child ->
  npm writes to the REAL cache, outside the sandbox home -> green. The bare CI
  `node --test` step has no `npm_config_cache`, so npm derives its cache from
  HOME = <sandbox>/home -> writes <sandbox>/home/.npm/_logs/*.log -> the `home`
  digest changes while checkout/packages/harness/outside stay identical and
  `state` stays absent. Exactly the reported signature.
  File-set, file order and node --test concurrency are NOT involved.

  SEPARATE (4): protocol-session's liveness oracle
  (test/protocol-session.test.ts:453 `isAlive(descendantPid)`) is a single
  unsynchronised `process.kill(pid, 0)` taken immediately after `close()`
  resolves. `close()` resolves on the DIRECT child's "close" event
  (src/core/process.ts:565, 641-648); the group SIGKILL
  (src/core/process.ts:233-249 killTree -> process.kill(-pid)) has been
  delivered but the descendant may not yet be scheduled/reaped. Under the load
  the 10-file run creates it is observed as still-alive.

test: reproduced failure 1 on this Windows host by removing LOCALAPPDATA, which forces npm's cache to be home-derived exactly as it is on POSIX
expecting: control (normal env) green; LOCALAPPDATA-stripped run red with the same digest signature -- CONFIRMED BOTH
next_action: diagnose-only mode -- write the ROOT CAUSE FOUND return; do NOT fix

## Symptoms

expected: All 10 safety boundary suites pass under `node --test <10 explicit files>` on ubuntu-latest, as they do under `npm test` (glob over all 20 files).
actual: pass 109 / fail 4 in the "Safety boundary suites" CI step. Same machine, same job, same build.
errors: |
  1. preview.test.ts "every mutating CLI preview leaves all five mutation surfaces byte-identical"
     AssertionError: preview of `install` mutated an observable surface
     home digest actual 2706f9fa..., expected 97742fbe...; checkout/packages/harness/outside identical; state absent both.
     at dist/test/preview.test.js:183
  2. preview.test.ts "two concurrent previews neither collide nor create shared state"
     AssertionError: concurrent previews mutated an observable surface
  3. preview.test.ts "a wrapper refuses without a verified build artifact and delegates with one"
     AssertionError: wrapper `install.sh` touched the home surface
  4. protocol-session.test.ts "closing a protocol session terminates the whole child tree"
     AssertionError: closing a protocol session left a descendant process running
reproduction: "node --test dist/test/preview.test.js dist/test/path-boundary.test.js dist/test/transaction-crash.test.js dist/test/redaction.test.js dist/test/validation.test.js dist/test/process.test.js dist/test/protocol-session.test.js dist/test/mcp-proxy.test.js dist/test/install.test.js dist/test/update.test.js"
started: CI run 33937610401
out_of_scope: RC-1 (os.tmpdir non-canonical -> outside-canonical-root, macOS/Windows only); RC-2 (macOS __CF_USER_TEXT_ENCODING allowlist floor).

## Eliminated

- hypothesis: "node --test file-set / file order / default file-level concurrency causes the difference"
  evidence: |
    Ran the exact 10-file CI command locally, same order, same runner defaults:
    tests 114, pass 112, fail 0. And the LOCALAPPDATA-stripped repro fails with
    ONE file and no concurrency at all. Concurrency is neither necessary nor
    sufficient for failures 1-3.
  timestamp: phase-4

- hypothesis: "two suites collide in a shared filesystem location (fixed temp path, shared HOME, shared state root)"
  evidence: |
    Every suite in the list creates its root with mkdtemp() under a distinct
    prefix (verified across all 20 test files). preview.test.ts:123 uses
    mkdtemp(join(tmpdir(), "alpha-aos-preview-")) and derives home/state/
    packages/harness/outside from it, so the `home` surface is per-test-unique
    and unreachable by any other suite. The mutation is self-inflicted by the
    process the preview test itself spawns.
  timestamp: phase-4

- hypothesis: "the `home` surface is the developer's real home directory in the test"
  evidence: "preview.test.ts:126 home = join(<mkdtemp root>, 'home'). It is a sandbox. The REAL home is only at risk for a real user, which is the separate product finding."
  timestamp: phase-1

- hypothesis: "collectInventory's `npm --version` probe (src/core/inventory.ts:18 -> process.ts:718) is the writer"
  evidence: "npm short-circuits --version and writes no log; measured with a fresh npm_config_cache: 0 files. Only `npm root --global` wrote."
  timestamp: phase-3

## Evidence

- timestamp: phase-0
  checked: .planning/debug/knowledge-base.md
  found: does not exist; no prior resolved sessions
  implication: no known-pattern shortcut; full investigation required

- timestamp: phase-1
  checked: package.json scripts
  found: |
    "test": "npm run build && node --test dist/test/*.test.js"  -> glob over ALL 20 test files, shell-sorted alphabetically.
    CI safety step: explicit 10 files in a NON-alphabetical order beginning with preview.test.js.
  implication: |
    Same runner, same default concurrency (node --test parallelises across FILES up to
    os.availableParallelism()). The difference is WHICH FILES CO-RESIDE IN THE SAME
    CONCURRENCY WINDOW as preview.test.js. Under the glob, alphabetical order puts
    catalog/doctor/ecc-skills/gsd-compat/install/isolation/mcp-proxy/mcp/path-boundary
    ahead of preview; under the explicit list preview is FIRST and co-runs with the
    other nine. Strong signal for cross-file interference, not an intrinsic preview bug.

- timestamp: phase-3-experiment-1
  checked: "npm_config_* presence, bare node vs npm lifecycle (local Windows)"
  found: |
    bare `node -e ...`               -> npm_config_* keys: []
    `npm exec -- node ...` (lifecycle) -> ["npm_config_cache","npm_config_prefix","npm_config_userconfig"]
                                         cache = C:\Users\alpha\AppData\Local\npm-cache
  implication: |
    `npm test` and the bare `node --test` CI step do NOT give the test process
    the same environment. npm injects npm_config_cache; the bare step does not.
    This is the only relevant difference between the two invocations.

- timestamp: phase-3-experiment-2
  checked: "does a read-only npm query write to its cache dir?"
  found: |
    npm_config_cache=<fresh dir> npm root --global
      -> creates <dir>/_logs/<ts>-debug-0.log
    npm_config_cache=<fresh dir> npm --version
      -> writes NOTHING (npm short-circuits --version)
  implication: |
    `npm root --global` is a mutation of the cache directory even though it is
    semantically a read. `npm --version` (used by collectInventory via
    probeCommand) is not, so the inventory probe is exonerated and the defect
    localizes to the single `npm root --global` call site.

- timestamp: phase-3-experiment-3
  checked: "npm cache fallback when npm_config_cache and LOCALAPPDATA are both absent"
  found: "npm resolved its cache to <HOME>/npm-cache (proved by its own error log path). POSIX equivalent is $HOME/.npm."
  implication: "Removing LOCALAPPDATA on Windows reproduces the POSIX condition, giving a local repro of a Linux-only failure."

- timestamp: phase-3-experiment-4
  checked: "node --test --test-name-pattern 'byte-identical' dist/test/preview.test.js, control vs LOCALAPPDATA-stripped"
  found: |
    control (normal env)       -> PASS (40.7s)
    env -u LOCALAPPDATA        -> FAIL, "preview of `install` mutated an observable surface"
      before home = 97742fbec6bfa9bbe36a1517f6d1376cb4c00c432d34622a7a57d9fd61d916cd
      after  home = 7e3cdda4738c1bd0ea106b1bd9f327ca780088fedcd64d9b966aba8b03280f01
      checkout / harness / packages / outside identical, state absent
  implication: |
    The `before` digest 97742fbe... is BYTE-IDENTICAL to the ubuntu CI `expected`
    digest 97742fbe..., so this is the same failure, not a lookalike. The `after`
    digest differs from CI's 2706f9fa... only because the npm log filename carries
    a timestamp. Root cause reproduced deterministically, single file, no
    concurrency, no other suite present.

- timestamp: phase-3-experiment-5
  checked: "direct sandbox repro: alpha-aos install --target claude (preview) with LOCALAPPDATA removed"
  found: |
    exit 0, plan printed normally, and home gained:
      npm-cache/_logs/2026-09-05T13_11_25_887Z-debug-0.log
    (POSIX equivalent: .npm/_logs/<ts>-debug-0.log)
  implication: "The preview writes into the home surface. Nothing else in home changed."

- timestamp: phase-3-experiment-6
  checked: "bash scripts/install.sh (no --apply) with sandbox HOME and LOCALAPPDATA removed -- failure 3"
  found: |
    exit 0, prints "build artifact verified" then the bootstrap plan, and home gained
    npm-cache/_logs/<ts>-debug-0.log. The log's own header records:
      verbose title npm root
      verbose argv "root" "--global"
  implication: |
    Failure 3 is the same call site, reached through
    bootstrap.ts:311 createManagedInstallOperationPlan -> install.ts:275
    globalNpmPackageVersion. Failures 1, 2 and 3 are one defect.

- timestamp: phase-4
  checked: "protocol-session termination path"
  found: |
    Session child spawned with detached:true (process.ts:417) -> own process group.
    Descendant spawned detached:false (protocol-session.test.ts:153) -> same group.
    killTree does process.kill(-pid, SIGKILL) (process.ts:240) -> reaches the group.
    close() (process.ts:622-648) resolves on `closed`, which is published from
    child.once("close") (process.ts:565) -- the DIRECT child only.
    The oracle at protocol-session.test.ts:453 is one bare process.kill(pid, 0)
    with no bounded poll and no pid-identity check.
  implication: |
    Whole-tree termination is correct in the product. The test asserts on a
    liveness probe that cannot distinguish "still running" from "SIGKILLed but
    not yet reaped" (or from a recycled pid). Different defect, different file,
    load-dependent. Same single-probe pattern also at protocol-session.test.ts:284-291.

## Resolution

root_cause: |
  RC-3 (failures 1, 2, 3 -- one defect, product):
  The `install` PREVIEW spawns `npm root --global`. Call site
  src/core/install.ts:213-223 (globalNpmPackageVersion), reached unconditionally
  from the managed-install PLAN builder at src/core/install.ts:275, and from
  `bootstrap install` preview via src/core/bootstrap.ts:311-312
  (createManagedInstallOperationPlan). npm always writes
  <cache>/_logs/<ts>-debug-0.log. npm's cache default is
  `(isWindows && LOCALAPPDATA) || '~'` + (isWindows ? 'npm-cache' : '.npm')
  -- so on POSIX it is always $HOME-derived. src/core/install.ts:179 allowlists
  npm_config_cache through to the child, and preview.test.ts:143-151 spreads
  process.env into the sandbox env. Therefore:
    * `npm test` -> npm injects npm_config_cache -> the log lands in the real
      cache, outside the sandbox -> falsely GREEN.
    * bare `node --test` -> no npm_config_cache -> HOME = <sandbox>/home ->
      <sandbox>/home/.npm/_logs/*.log -> `home` digest changes -> RED.
  Windows never sees it because LOCALAPPDATA is inherited real and allowlisted.
  macOS should show it identically to Linux.

  RC-4 (failure 4 -- separate defect, test oracle):
  test/protocol-session.test.ts:453 asserts liveness with a single unsynchronised
  process.kill(descendantPid, 0) taken the instant close() resolves. close()
  (src/core/process.ts:622-648) resolves on the DIRECT child's "close" event
  (src/core/process.ts:565). On POSIX killTree (src/core/process.ts:233-249) is a
  fire-and-forget process.kill(-pid, SIGKILL) with no confirmation, so the
  descendant is condemned but may not yet be scheduled or reaped; kill(pid,0)
  also succeeds against a zombie, and against a recycled pid. On Windows the
  same killTree branch blocks on spawnSync("taskkill /T /F"), which is why the
  race is POSIX-only.

fix: NOT APPLIED -- diagnose-only mode
verification: n/a
files_changed: []
