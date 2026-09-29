# Three-OS CI Proof Run: alpha-AOS v0.1.1 Phase 10

This document records the push-triggered `main` CI run that proves `CI-03`: `ubuntu-latest`, `macos-latest` and `windows-latest` are green together in one attempt of one run, with the Phase 10 fixes for `CI-01` and `CI-02` contained in its head commit (D-12, D-13, D-14). Every value below was retrieved with `gh run view`, `gh api` or `git` in plan 10-04, not typed from the web UI.

## 1. Run Metadata

| Field | Value |
|---|---|
| **Run ID** | `35818198049` |
| **Attempt** | `1` |
| **Workflow URL** | https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/35818198049/attempts/1 |
| **Workflow File** | `.github/workflows/ci.yml` |
| **Trigger** | `push` |
| **Commit SHA** | `35d4c1579102fd9effd2ad7bf0f4d438db7865ba` |
| **Branch** | `main` |
| **Conclusion** | `success` |
| **Attempt started** (`run_started_at`) | `2026-09-23T04:24:21Z` |

Command:

```bash
gh run view 35818198049 --attempt 1 --json databaseId,attempt,headSha,event,conclusion,url,headBranch,jobs
```

Captured JSON, reduced to the run fields plus each job's `name`, `databaseId`, `conclusion` and `startedAt`:

```json
{
  "databaseId": 35818198049,
  "attempt": 1,
  "headSha": "35d4c1579102fd9effd2ad7bf0f4d438db7865ba",
  "event": "push",
  "conclusion": "success",
  "url": "https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/35818198049/attempts/1",
  "headBranch": "main",
  "jobs": [
    {
      "name": "Authoritative Release Package (Linux)",
      "databaseId": 107044198034,
      "conclusion": "success",
      "startedAt": "2026-09-23T04:24:25Z"
    },
    {
      "name": "windows-latest / Node 24",
      "databaseId": 107044319963,
      "conclusion": "success",
      "startedAt": "2026-09-23T04:25:02Z"
    },
    {
      "name": "macos-latest / Node 24",
      "databaseId": 107044319988,
      "conclusion": "success",
      "startedAt": "2026-09-23T04:25:06Z"
    },
    {
      "name": "ubuntu-latest / Node 24",
      "databaseId": 107044319989,
      "conclusion": "success",
      "startedAt": "2026-09-23T04:25:02Z"
    }
  ]
}
```

Attempt metadata (`gh api repos/4lph4-dvlp/alpha-AOS/actions/runs/35818198049/attempts/1`):

```json
{"conclusion":"success","event":"push","head_branch":"main","head_sha":"35d4c1579102fd9effd2ad7bf0f4d438db7865ba","html_url":"https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/35818198049","id":35818198049,"run_attempt":1,"run_started_at":"2026-09-23T04:24:21Z"}
```

## 2. Matrix Jobs

Step conclusions come from the `jobs[].steps` array of the captured JSON (the `npm test` step is named `Run npm test`). Test counts are the `ℹ` summary lines from `gh run view --job JOB --log`; the first block in each log follows `##[group]Run npm test`, the second follows `##[group]Run node scripts/run-tests.mjs --files ...` (the `Safety boundary suites` step).

| Job | Job ID | Conclusion | `npm test` step | `Safety boundary suites` step | `npm test` counts | `Safety boundary suites` counts |
|---|---|---|---|---|---|---|
| Authoritative Release Package (Linux) | `107044198034` | `success` | n/a | n/a | n/a (all 14 listed steps `success`, including `npm run check`, `npm run build`, `npm run build:check`, pack, audit, checksum and upload) | n/a |
| ubuntu-latest / Node 24 | `107044319989` | `success` | `success` | `success` | tests 919 / pass 914 / fail 0 / cancelled 0 / skipped 5 / todo 0 | tests 177 / pass 175 / fail 0 / cancelled 0 / skipped 2 / todo 0 |
| macos-latest / Node 24 | `107044319988` | `success` | `success` | `success` | tests 919 / pass 913 / fail 0 / cancelled 0 / skipped 6 / todo 0 | tests 177 / pass 175 / fail 0 / cancelled 0 / skipped 2 / todo 0 |
| windows-latest / Node 24 | `107044319963` | `success` | `success` | `success` | tests 919 / pass 911 / fail 0 / cancelled 0 / skipped 8 / todo 0 | tests 177 / pass 172 / fail 0 / cancelled 0 / skipped 5 / todo 0 |

On each OS leg every step is `success` except the wrapper-syntax step for the other shell family, which is `skipped` by its `if:` condition (`Validate POSIX wrapper syntax` on windows, `Validate PowerShell wrapper syntax` on ubuntu and macOS). The lines tagged `# SKIP` in each leg's log are the three opt-in live Codex canaries (`opt-in live Codex CAPA-01 ...`, `CAPA-02 ...`, `CAPA-05 ...`). None of the Phase 10 tests below was skipped.

## 3. Phase 10 Observations

Result lines copied from each leg's job log (`gh run view --job JOB --log`), timestamps removed. Where a test runs in both steps, the first line is from `npm test` and the second from `Safety boundary suites`.

### ubuntu-latest / Node 24 (job `107044319989`)

```
✔ destinationFor resolves destinations across all five harnesses (1.955829ms)
✔ global ECC roots preserve native roots and share Agent Skills between Codex and Pi (0.447084ms)
✔ no test under test/ asserts against a platform-specific absolute path literal (583.976075ms)
✔ packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle (13526.189727ms)
✔ pinned upstream startups keep their npx cache under the test-owned state root, never the host state root (0.764666ms)
✔ pinned upstream startups keep their npx cache under the test-owned state root, never the host state root (0.46157ms)
✔ writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03) (99.256712ms)
✔ Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03) (1402.225801ms)
✔ the context7 proxy starts and lists exactly its two tools (5654.472153ms)
✔ the exa proxy starts and lists exactly its two tools (9006.174625ms)
✔ the firecrawl proxy starts and lists its allowlisted tools (9400.39925ms)
✔ a proxy launch writes nothing into the user's home (6287.809735ms)
✔ the context7 proxy starts and lists exactly its two tools (1213.01663ms)
✔ the exa proxy starts and lists exactly its two tools (920.480379ms)
✔ the firecrawl proxy starts and lists its allowlisted tools (1363.355349ms)
✔ a proxy launch writes nothing into the user's home (5190.818196ms)
```

### macos-latest / Node 24 (job `107044319988`)

```
✔ destinationFor resolves destinations across all five harnesses (4.061708ms)
✔ global ECC roots preserve native roots and share Agent Skills between Codex and Pi (0.309958ms)
✔ no test under test/ asserts against a platform-specific absolute path literal (507.413833ms)
✔ packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle (8962.986042ms)
✔ pinned upstream startups keep their npx cache under the test-owned state root, never the host state root (0.500042ms)
✔ pinned upstream startups keep their npx cache under the test-owned state root, never the host state root (0.3055ms)
✔ writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03) (62.658ms)
✔ Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03) (968.936084ms)
✔ the context7 proxy starts and lists exactly its two tools (3739.754875ms)
✔ the exa proxy starts and lists exactly its two tools (5119.950417ms)
✔ the firecrawl proxy starts and lists its allowlisted tools (4819.030666ms)
✔ a proxy launch writes nothing into the user's home (3771.981ms)
✔ the context7 proxy starts and lists exactly its two tools (941.749875ms)
✔ the exa proxy starts and lists exactly its two tools (608.623792ms)
✔ the firecrawl proxy starts and lists its allowlisted tools (1043.187625ms)
✔ a proxy launch writes nothing into the user's home (3764.438167ms)
```

### windows-latest / Node 24 (job `107044319963`)

```
✔ destinationFor resolves destinations across all five harnesses (1.9436ms)
✔ global ECC roots preserve native roots and share Agent Skills between Codex and Pi (0.7746ms)
✔ no test under test/ asserts against a platform-specific absolute path literal (569.4197ms)
✔ packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle (82396.8753ms)
✔ pinned upstream startups keep their npx cache under the test-owned state root, never the host state root (0.8242ms)
✔ pinned upstream startups keep their npx cache under the test-owned state root, never the host state root (0.7468ms)
✔ writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03) (175.1761ms)
✔ Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03) (4193.8811ms)
✔ the context7 proxy starts and lists exactly its two tools (36992.6899ms)
✔ the exa proxy starts and lists exactly its two tools (58892.7541ms)
✔ the firecrawl proxy starts and lists its allowlisted tools (70417.3233ms)
✔ a proxy launch writes nothing into the user's home (35869.4243ms)
✔ the context7 proxy starts and lists exactly its two tools (1861.277ms)
✔ the exa proxy starts and lists exactly its two tools (1337.0683ms)
✔ the firecrawl proxy starts and lists its allowlisted tools (2035.1374ms)
✔ a proxy launch writes nothing into the user's home (36935.7021ms)
```

What these lines show:

- **CI-01 (ROADMAP success criterion 1):** `destinationFor resolves destinations across all five harnesses` passes on ubuntu and macOS, the legs that were red on it in run 35762417138. The path-literal guard `no test under test/ asserts against a platform-specific absolute path literal` passes on all three legs (success criterion 2's guard, observed per OS).
- **CI-02:** the packed lifecycle test passes on windows-latest under the unchanged host-immutability oracle. On this leg the cold context7, exa and firecrawl startups (37.0 s, 58.9 s, 70.4 s) ran in the same `npm test` step as the packed lifecycle fixture, which is the scheduling condition that exposed the leak before the fix. The gate journal regression tests (`writeGateReceipt ...` in `gate-engine.test.js`, `Execution of gate check passes ...` in `gate-lifecycle.test.js`) and the state-root regression pass on all three legs.
- In the `Safety boundary suites` step the three startups are warm on every leg (0.6 s to 2.0 s), so the stable test-owned tmpdir cache carries over between steps as 10-03 intended, without touching the host state root.

## 4. Single-Run Integrity (D-12, D-13)

- **Event:** `push` on `main`. The run was found with `gh run list --workflow CI --branch main --event push --limit 10 --json databaseId,headSha,status,event` by matching `headSha` to the pushed `origin/main` (`35d4c1579102fd9effd2ad7bf0f4d438db7865ba`). It is not a `workflow_dispatch` run.
- **Attempt:** `1`. No re-run of any kind was issued: not `Re-run all jobs`, not `gh run rerun --failed`, and no per-job re-run. D-13 was not needed.
- **All jobs belong to attempt 1 and started after the attempt began:**

  | Job | startedAt | After `run_started_at` `2026-09-23T04:24:21Z` |
  |---|---|---|
  | Authoritative Release Package (Linux) | `2026-09-23T04:24:25Z` | yes (+4 s) |
  | ubuntu-latest / Node 24 | `2026-09-23T04:25:02Z` | yes (+41 s) |
  | windows-latest / Node 24 | `2026-09-23T04:25:02Z` | yes (+41 s) |
  | macos-latest / Node 24 | `2026-09-23T04:25:06Z` | yes (+45 s) |

- **Planner assumptions:**
  - A-10-04-1 (one attempt of one run): satisfied. All four jobs come from attempt 1 of run 35818198049; no job from another run or attempt is used.
  - A-10-04-2 (the package job is also required): satisfied. `Authoritative Release Package (Linux)` is `success` in attempt 1, and the three OS legs downloaded and checksum-verified its tarball (`Download release tarball artifact` and `Verify release tarball checksum with Node.js` both `success` on each leg).
  - A-10-04-3 (the D-13 pinned-upstream path is the three proxy startup tests plus `a proxy launch writes nothing into the user's home`): not exercised. All four tests passed in both steps on every leg (Section 3), so no transient registry failure had to be classified.

## 5. Phase 10 Commits Contained

`git log --oneline c6415a2..35d4c1579102fd9effd2ad7bf0f4d438db7865ba` lists 34 commits, the planning and v0.1.1 milestone commits plus the Phase 10 commits. The Phase 10 commits:

```
35d4c15 docs(10-03): update state, roadmap and requirements after plan 03
bea1fbf docs(10-03): complete CI-02 test-isolation leak fix plan
e259d4f docs(10-03): record local CI-02 fix evidence
82a5ccf docs(10-03): record gate-receipt RED and GREEN observations (D-08)
7a3ee28 fix(10-03): journal gate receipts into test-owned state roots
d9e044a test(10-03): pin gate receipt journals to test-owned state roots (RED)
c3e68df docs(10-03): record mcp-proxy RED and GREEN observations (D-08)
8f17c7e fix(10-03): redirect mcp-proxy test state root out of the host home
ac67ffc test(10-03): pin mcp-proxy startups to a test-owned state root (RED)
cb03bc0 docs(10-02): update state and roadmap after plan 02
40fb7f4 docs(10-02): complete CI-02 diagnosis and per-entry host drift report plan
5248432 docs(10-02): record CI-02 root cause as a test-isolation leak
8d681ce feat(10-02): report per-entry host drift in the packed lifecycle oracle
bbfcc4d test(10-02): add failing tests for per-entry host drift report
8b0acc9 docs(10-01): update state, roadmap and requirements after plan 01
2025033 docs(10-01): make POSIX observation line machine-readable for 10-04 preflight
413a876 docs(10-01): complete CI-01 host-native fixtures and path-literal guard plan
a906426 feat(10-01): add TypeScript-AST path-literal scanner for the test guard
b79611b test(10-01): add failing path-literal guard and scanner self-tests
f6b7c8f fix(10-01): build destinationFor and ECC-root fixture roots from tmpdir
```

`git merge-base --is-ancestor COMMIT 35d4c1579102fd9effd2ad7bf0f4d438db7865ba` for each code commit:

| Commit | Subject | Exit |
|---|---|---|
| `f6b7c8f` | fix(10-01): build destinationFor and ECC-root fixture roots from tmpdir | 0 (ancestor) |
| `b79611b` | test(10-01): add failing path-literal guard and scanner self-tests | 0 (ancestor) |
| `a906426` | feat(10-01): add TypeScript-AST path-literal scanner for the test guard | 0 (ancestor) |
| `bbfcc4d` | test(10-02): add failing tests for per-entry host drift report | 0 (ancestor) |
| `8d681ce` | feat(10-02): report per-entry host drift in the packed lifecycle oracle | 0 (ancestor) |
| `ac67ffc` | test(10-03): pin mcp-proxy startups to a test-owned state root (RED) | 0 (ancestor) |
| `8f17c7e` | fix(10-03): redirect mcp-proxy test state root out of the host home | 0 (ancestor) |
| `d9e044a` | test(10-03): pin gate receipt journals to test-owned state roots (RED) | 0 (ancestor) |
| `7a3ee28` | fix(10-03): journal gate receipts into test-owned state roots | 0 (ancestor) |

At the proof SHA, `test/owned-skills.test.ts`, `test/ecc-skills.test.ts`, `test/tarball-fixture.test.ts`, `test/mcp-proxy.test.ts`, `test/gate-engine.test.ts` and `test/gate-lifecycle.test.ts` all differ from c6415a2, `test/path-literal-guard.test.ts` and `test/helpers/path-literal-scan.ts` exist, and `git diff --quiet c6415a2 35d4c15 -- .github/workflows/ci.yml` exits 0 (the workflow is unchanged). The push was a plain fast-forward (`c6415a2..35d4c15  main -> main`); `git reflog show origin/main` records only `update by push` entries.

## 6. Conclusion

**CI-03: closed** by run `35818198049`, attempt `1`. One push-triggered `main` run, head `35d4c1579102fd9effd2ad7bf0f4d438db7865ba`, is `success` with `ubuntu-latest / Node 24`, `macos-latest / Node 24`, `windows-latest / Node 24` and `Authoritative Release Package (Linux)` all `success` in the same attempt, and no job was re-run or taken from another run. The CI-01 fix is observed on the POSIX legs and the CI-02 fix on the windows leg of that same attempt.

This record is published by a later docs-only push to main; that push's CI run is not the proof run and does not replace run 35818198049 attempt 1.
