---
status: diagnosed
trigger: "CI run 35762417138 (main @ c6415a2) windows-latest: the packed release lifecycle test in test/tarball-fixture.test.ts failed because the aggregate hash of the real runner home `C:\\Users\\runneradmin\\.alpha-aos` moved (c0ec2afd... -> cc125717...) while the seven other host mutation targets stayed `absent`. The log carried only the two opaque hashes."
created: 2026-09-23
updated: 2026-09-23
---

## Classification

classification: test-isolation leak

D-01 class 3: a different test file, running concurrently under `node --test`
(process isolation, one child per file), wrote the real host `~/.alpha-aos`
during the packed-lifecycle fixture's snapshot window.

- **Not a product isolation leak.** The released lifecycle run alone (control
  run below) passed and left no `.alpha-aos` in its scratch home at all: install,
  reconcile, status/doctor and `uninstall --purge` all stay inside the sandbox
  `ALPHA_AOS_STATE_DIR`. `userStateRoot()` (src/core/paths.ts:93-97) honors
  `ALPHA_AOS_STATE_DIR`; the product is correct under its contract. The D-03
  `src/` audit is not triggered.
- **Not a test-oracle defect.** Bytes really changed on the host: the per-entry
  drift report names 20,447 added entries under `mcp-cache/npm-cache/` that exist
  on disk after the run. The oracle's verdict was right; only its message was
  opaque (fixed by D-05 in plan 10-02 Task 1).

Consequence: D-02 governs the fix (plan 10-03). The leaking test files get their
own state root; `hostMutationTargets`, `hostStateRoot` and the
`assert.deepEqual(afterHost, beforeHost, ...)` in the lifecycle test stay as they are.

## Writer

Primary writer (the one that overlapped the fixture in run 35762417138):

1. `test/mcp-proxy.test.ts` `startPinnedServer(fixture, server, source = process.env)`
   (lines 702-753) builds the upstream child with
   `environment: upstreamEnvironmentPolicy(server, source)`. The three startup
   tests "the context7/exa/firecrawl proxy starts ..." (lines 812-852) never set
   `ALPHA_AOS_STATE_DIR`.
2. `upstreamEnvironmentPolicy` (src/core/mcp-proxy.ts:226-246) takes its write
   root from the ambient process environment, not from its `source` argument:
   `const writeRoot = proxyCacheRoot();`, then pins
   `npm_config_cache: join(writeRoot, "npm-cache")`.
3. `proxyCacheRoot()` (src/core/mcp-proxy.ts:199-201) defaults to
   `join(userStateRoot(), "mcp-cache")`.
4. `userStateRoot()` (src/core/paths.ts:93-97) falls back to
   `join(homedir(), ".alpha-aos")`.
5. npx therefore downloads the pinned MCP packages into the real
   `~/.alpha-aos/mcp-cache/npm-cache` (`_npx`, `_cacache`,
   `_update-notifier-last-checked`).

Overlap in run 35762417138 (windows-latest): the firecrawl startup ran
17:45:36.6 -> 17:47:32.4, the packed-lifecycle fixture ran 17:47:05.5 ->
17:49:35.3. The fixture took its before-snapshot about 27 s before the firecrawl
download finished.

Same-class writers (did not overlap in the failing run, but will whenever
scheduling shifts):

- `test/gate-engine.test.ts:184` calls `writeGateReceipt(root, receipt)` directly.
  `writeGateReceipt` hard-codes `stateRoot: userStateRoot()`
  (src/core/gate-receipt.ts:106-108), so its journal and snapshot land in the real
  `~/.alpha-aos/journal` and `~/.alpha-aos/snapshots`.
- `test/gate-lifecycle.test.ts:20` spawns `dist/src/cli.js gate check` with
  `commandProbeEnvironment({ source: process.env })`.
  `commandProbeEnvironment` (src/core/process.ts:922-958) passes `HOME` and
  `USERPROFILE` through and does not pass `ALPHA_AOS_STATE_DIR`, so the CLI child
  always resolves the real home even if the test process redirects the state root.

## Evidence

### Pair reproduction (D-05 per-entry report), 2026-09-23, Windows developer host

Environment: fresh scratch home under the session scratchpad; never the real
home. Git Bash:

```bash
H=$(mktemp -d "$SP/pair1-home.XXXX"); WH=$(cygpath -w "$H")
npm run build
env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME \
  -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR \
  HOME="$WH" USERPROFILE="$WH" ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1 \
  node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js
```

Reproduced on the first of up to three allowed runs (build at commit 8d681ce,
which carries the D-05 diagnostics). TAP summary:

```
ℹ tests 46
ℹ pass 45
ℹ fail 1
ℹ duration_ms 150385.2243
✖ packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle (147376.5486ms)
```

Drift report excerpt exactly as printed (metadata only; the scratch prefix is
`C:\Users\alpha\AppData\Local\Temp\claude\D--dev-alpha-AOS\e526dbf2-fdb0-4dc0-b57c-b95612d1dd9d\scratchpad`,
shortened here to `<scratch>`; 42 listed lines are elided in the middle):

```
AssertionError [ERR_ASSERTION]: the packed lifecycle must not change any real managed host path
<scratch>\pair1-home.TGTb\.alpha-aos: 6b9fc8df91ac -> 10ccaadd2d61 (added 20447, removed 0, changed 0, vanished 0)
  added mcp-cache/npm-cache/_cacache - -> dir/-/-
  added mcp-cache/npm-cache/_cacache/content-v2 - -> dir/-/-
  added mcp-cache/npm-cache/_cacache/content-v2/sha512 - -> dir/-/-
  added mcp-cache/npm-cache/_cacache/content-v2/sha512/00 - -> dir/-/-
  added mcp-cache/npm-cache/_cacache/content-v2/sha512/00/68 - -> dir/-/-
  added mcp-cache/npm-cache/_cacache/content-v2/sha512/00/68/fca42c58b2dfa4e2107946afcce80ade0ee07b31da201f038aa497883aa6bcf7ba279b1c3a12a0bc22452179e7c5dd4788e4f8188a9e939baa6552822aa7 - -> file/31756/67fe0e7785e1
  added mcp-cache/npm-cache/_cacache/content-v2/sha512/01 - -> dir/-/-
  added mcp-cache/npm-cache/_cacache/content-v2/sha512/01/34 - -> dir/-/-
  [... 42 listed lines elided here ...]
  ... 20397 more entries not listed (limit 50)
```

The seven other host mutation targets (`.codex/AGENTS.md`, `.codex/config.toml`,
`.codex/.gsd-profile`, `.codex/gsd-core/VERSION`, and the three
`.agents/skills/*/SKILL.md`) are `absent` before and after and are not named in
the report. That is the exact CI signature.

Decoding the before side: `6b9fc8df91ac3337...` equals the sha256 of
`dir:` / `dir:mcp-cache` / `dir:mcp-cache/npm-cache` (one per line), which is the
empty cache skeleton an earlier `mcp-proxy` test created before the fixture's
before-snapshot. This is also the before hash the research session observed, so
the skeleton is deterministic.

The added entries beyond the 50-line listing, from the scratch home (paths and
metadata only, same KIND/SIZE/HASH12 format):

| Entry | Kind/size/hash | Count under it |
|-------|----------------|----------------|
| `mcp-cache/npm-cache/_npx` | dir/-/- | 18,116 entries (3 top-level package dirs) |
| `mcp-cache/npm-cache/_cacache` | dir/-/- | 2,330 entries |
| `mcp-cache/npm-cache/_update-notifier-last-checked` | file/0/e3b0c44298fc | 1 |

18,116 + 2,330 + 1 = 20,447, matching the header total.

Scratch-home listing after the pair run (`find "$H" -mindepth 1 -maxdepth 4`):

```
./.alpha-aos
./.alpha-aos/mcp-cache
./.alpha-aos/mcp-cache/npm-cache
./.alpha-aos/mcp-cache/npm-cache/_cacache
./.alpha-aos/mcp-cache/npm-cache/_npx
./.alpha-aos/mcp-cache/npm-cache/_update-notifier-last-checked
```

D-06 fallback: not needed. Local reproduction succeeded, so no `ci02-evidence`
branch was pushed and no workflow was dispatched.

### Control run (fixture alone)

```bash
env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME \
  -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR \
  HOME="$WH" USERPROFILE="$WH" ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1 \
  node --test dist/test/tarball-fixture.test.js
```

Result: `tests 10 / pass 10 / fail 0` (48.0 s), and `test ! -e "$H/.alpha-aos"`
held. The scratch home had 0 entries afterwards. The released lifecycle writes
nothing into the host home.

### CI signature, run 35762417138 (windows-latest, main @ c6415a2)

```
+   'C:\\Users\\runneradmin\\.alpha-aos' => 'cc1257172fc970d1a7cb26f8a75f6fc66bd6e7e7e6b029fba86fa8299ca56546',
-   'C:\\Users\\runneradmin\\.alpha-aos' => 'c0ec2afd7f1ff1012fd32bd2ed635caa78c05bd7159611023c8ee3e583f12c4d',
```

The CI before hash was not `absent`: earlier writers (gate tests, the context7
and exa startups) had already populated the runner's `~/.alpha-aos` before the
fixture's snapshot. The CI hashes differ from the local ones because the cache
content and the earlier writers' journals differ; the shape (only `.alpha-aos`
moves, seven targets `absent`) is identical.

### CI timing (10-RESEARCH Finding 5, from `gh run view --job ... --log`)

| Run | Leg | firecrawl startup (start -> end) | packed lifecycle fixture (start -> end) | Overlap |
|-----|-----|----------------------------------|------------------------------------------|---------|
| 35762417138 (c6415a2, red) | windows | 17:45:36.6 -> 17:47:32.4 (115.8 s) | 17:47:05.5 -> 17:49:35.3 (149.8 s) | ~27 s |
| 35662102311 (f5bb05f, green) | windows | 22:23:20.8 -> 22:24:24.0 (63.2 s) | 22:25:11.4 -> 22:26:47.4 (96.0 s) | none (47 s gap) |
| 35762417138 | ubuntu | 17:43:23.0 -> 17:43:30.2 (7.3 s) | 17:44:05.0 -> 17:44:22.0 (17.0 s) | none |
| 35762417138 | macos | 17:43:47.2 -> 17:43:55.0 (7.8 s) | 17:45:12.1 -> 17:45:47.8 (35.7 s) | none |

### Per-file home-write probe (10-RESEARCH Finding 3, research session)

Each compiled test file ran alone with `USERPROFILE`/`HOME` redirected to a fresh
scratch home and `ALPHA_AOS_STATE_DIR` and the harness roots unset.

| Test file | Entries written under redirected home | Paths |
|-----------|---------------------------------------|-------|
| `mcp-proxy.test.js` (36/36 pass) | 20,447 | `.alpha-aos/mcp-cache/npm-cache/{_npx (18,116), _cacache (2,328), _update-notifier-last-checked}` |
| `gate-lifecycle.test.js` (pass) | 9 | `.alpha-aos/journal/*.json` (3), `.alpha-aos/snapshots/*` (3) |
| `gate-engine.test.js` (9/9 pass) | 5 | `.alpha-aos/journal/*.json` (1), `.alpha-aos/snapshots/*` (1) |
| `capability-oracle.test.js` | 7 | `.alpha-aos/mcp-cache/npm-cache` (empty dirs) and `.pi/agent/{auth.json,models-store.json}`; dev-host only (`pi`/`codex` on PATH, 6 tests failed under the redirect); not attributed to one test |
| `preview.test.js` | 4 | `AppData/Local/Microsoft/PowerShell` (pwsh startup cache; not an alpha-AOS managed path) |
| `tarball-fixture.test.js` (pass, 109 s) | 0 | none |
| all 46 others | 0 | none |

### Warm-cache corroboration

In green run 35662102311 the `npm test` step's context7 startup was cold (32.6 s)
while the later `Safety boundary suites` step's context7 startup was warm (1.9 s).
Every `createProxyFixture` root is a fresh `mkdtemp`, so the only location that
persists between the two steps is `userStateRoot()/mcp-cache` in the real runner
home.

## Onset

| Run | SHA | ubuntu | macos | windows |
|-----|-----|--------|-------|---------|
| 35498899974 | 638d3cc | success | success | success |
| 35558021216 | f1ca570 | failure (npm test) | failure | success |
| 35566562841 | 92b0de7 | failure | failure | success |
| 35662102311 | f5bb05f | failure | failure | success |
| 35762417138 | c6415a2 | failure | failure | failure |

No bisect (Claude's discretion under 10-CONTEXT): the Windows red first appears
at c6415a2, outside 638d3cc..f1ca570, and `git diff --stat f5bb05f c6415a2`
touches nothing on the writer path. The leak predates the window: the three
startup tests came in with 4cf9eaa (Phase 03-02), `writeGateReceipt(root, receipt)`
with 3f77c5f (Phase 04-02), and the fixture with f15ad5c (Phase 07-01). The
failure depends on scheduling and registry latency (firecrawl cold startup 63 s
green vs 116 s red), so a bisect would measure latency, not code.

## Regression RED observations (D-08)

Plan 10-03 records each regression's failing observation here (command, output
excerpt, RED commit) before the state-root redirect lands.

All RED and GREEN runs used a fresh `mktemp -d` scratch home under the session
scratchpad (`<scratch>` below), with `ALPHA_AOS_STATE_DIR` and the harness root
variables unset. The developer's real `~/.alpha-aos` was never used.

### R1: mcp-proxy pinned-startup npx cache (primary writer)

- **Test:** `pinned upstream startups keep their npx cache under the test-owned state root, never the host state root`
- **File:** `test/mcp-proxy.test.ts`
- **RED commit:** `ac67ffc` (`test(10-03): pin mcp-proxy startups to a test-owned state root (RED)`)
- **RED command:**

  ```bash
  H=$(mktemp -d "$SP/red1-home.XXXX"); WH=$(cygpath -w "$H")
  npm run build
  env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME \
    -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR HOME="$WH" USERPROFILE="$WH" \
    node --test --test-name-pattern="test-owned state root" dist/test/mcp-proxy.test.js
  ```

- **RED output excerpt:**

  ```
  ✖ pinned upstream startups keep their npx cache under the test-owned state root, never the host state root (3.6573ms)
  ℹ tests 1 / pass 0 / fail 1
  AssertionError [ERR_ASSERTION]: this file must resolve its own state root, not the host one
  + '<scratch>\\red1-home.lMRk\\.alpha-aos'
  - 'C:\\Users\\alpha\\AppData\\Local\\Temp\\alpha-aos-test-mcp-proxy-state'
  ```

  `userStateRoot()` resolved the scratch home's `.alpha-aos`: exactly the host
  state root the pinned startups wrote their npx cache into.
- **GREEN commit:** `8f17c7e` (`fix(10-03): redirect mcp-proxy test state root out of the host home`),
  which sets `process.env.ALPHA_AOS_STATE_DIR = testStateRoot` at module scope.
- **GREEN result:** the same command reports `tests 1 / pass 1 / fail 0`. The whole
  file on a fresh scratch home with `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1` reports
  `tests 37 / pass 37 / fail 0` (96.2 s), and the scratch home holds 0 entries
  (no `.alpha-aos`). The npx cache (`_cacache`, `_npx`,
  `_update-notifier-last-checked`) now lands under
  `%TEMP%\alpha-aos-test-mcp-proxy-state\mcp-cache\npm-cache`.

### R2 and R3: gate-receipt journals (same-class writers)

Both regressions share one RED commit and one RED run.

- **R2 test:** `writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03)`
  in `test/gate-engine.test.ts`. The assertion is that
  `join(stateRoot, "journal", written.transactionId + ".json")` exists, where
  `stateRoot = join(root, "state")`.
- **R3 test:** `Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03)`
  in `test/gate-lifecycle.test.ts`. After the first
  `gate check --obligation security-review --json`, the assertion is that
  `join(stateRoot, "journal")` holds at least one `.json` file, where
  `stateRoot = join(parent, "state")` is a sibling of the fixture repository.
- **RED commit:** `d9e044a` (`test(10-03): pin gate receipt journals to test-owned state roots (RED)`)
- **RED command:**

  ```bash
  H=$(mktemp -d "$SP/red2-home.XXXX"); WH=$(cygpath -w "$H")
  npm run build
  env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME \
    -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR HOME="$WH" USERPROFILE="$WH" \
    node --test dist/test/gate-engine.test.js dist/test/gate-lifecycle.test.js
  ```

- **RED output excerpt:**

  ```
  ℹ tests 16 / pass 14 / fail 2
  ✖ writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03) (167.6969ms)
    AssertionError [ERR_ASSERTION]: the gate receipt journal must land in the test-owned state root, not the host state root
  ✖ Execution of gate check passes when engine succeeds, creating receipt and unblocking lifecycle (GATE-02, GATE-03) (4060.6151ms)
    AssertionError [ERR_ASSERTION]: gate check must journal its receipt into the test-owned state root, not the host state root
  ```

  The scratch home afterwards held `.alpha-aos/journal/*.json` (4 files) and
  `.alpha-aos/snapshots/*` (4 directories): 1 from the gate-engine receipt test
  and 3 from the gate-lifecycle CLI spawns that wrote receipts.
- **GREEN commit:** `7a3ee28` (`fix(10-03): journal gate receipts into test-owned state roots`).
  gate-engine calls `redirectStateRoot(context, stateRoot)` before
  `writeGateReceipt`. gate-lifecycle passes `environment: gateEnvironment(stateRoot)`
  to all seven `runProcess` calls, and that policy is the probe policy plus an
  `ALPHA_AOS_STATE_DIR` literal.
- **GREEN result:** the same command reports `tests 16 / pass 16 / fail 0`, and
  the scratch home holds 0 entries (no `.alpha-aos`). The spawn-count gate
  holds: 7 `runProcess({` calls and 7 `environment: gateEnvironment(stateRoot)`.

## Fix (local)

Plan 10-03, 2026-09-23, Windows developer host. Every run used a fresh scratch
home with `ALPHA_AOS_STATE_DIR` and the harness root variables unset. The
developer's real `~/.alpha-aos` was not read, modified or deleted.

### Fix commits

| Writer | RED commit | GREEN (fix) commit |
|--------|------------|--------------------|
| `test/mcp-proxy.test.ts` pinned startups (primary) | `ac67ffc` | `8f17c7e` |
| `test/gate-engine.test.ts` direct `writeGateReceipt` | `d9e044a` | `7a3ee28` |
| `test/gate-lifecycle.test.ts` CLI `gate check` spawns | `d9e044a` | `7a3ee28` |

All fixes are in test code. `hostMutationTargets`, `hostStateRoot` and the
lifecycle `assert.deepEqual(afterHost, beforeHost, ...)` in
`test/tarball-fixture.test.ts` are untouched. Nothing was serialized or
reordered, and no suite-wide guard was added.

### Pair reproduction after the fix

Same command as the Evidence section, on a fresh scratch home:

```bash
env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME \
  -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR \
  HOME="$WH" USERPROFILE="$WH" ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1 \
  node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js
```

| Run | npx cache | TAP summary | packed lifecycle | `.alpha-aos` in scratch home |
|-----|-----------|-------------|------------------|------------------------------|
| 1 (scratchpad home) | warm | tests 47 / pass 47 / fail 0 (64.4 s) | ok (60.6 s) | absent, 0 entries |
| 2 (scratchpad home) | cold (the test-owned `%TEMP%\alpha-aos-test-mcp-proxy-state` was removed first) | tests 47 / pass 47 / fail 0 (105.6 s) | ok (71.4 s) | absent, 0 entries |
| 3 (plan recipe, `mktemp -d` home) | warm | tests 47 / pass 47 / fail 0 (66.7 s) | ok (63.6 s) | absent |

In run 2 the context7, exa and firecrawl startups downloaded cold (16.9 s,
18.6 s, 22.4 s) while the fixture had its snapshot window open. That is the
condition that reproduced the leak before the fix, and the host oracle now
stays byte-identical. The test count rose from 46 to 47 because of the new
mcp-proxy regression test.

### Per-file home-write probe after the fix

Each of the 53 compiled `dist/test/*.test.js` files ran alone, four at a time.
Each had its own fresh scratch home (under the session scratchpad) and
`ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`. Entries are counted with
`find HOME -mindepth 1`.

| Test file | Exit | Pass / fail | Entries under home | Paths (depth 4) | Classification |
|-----------|------|-------------|--------------------|-----------------|----------------|
| `mcp-proxy.test.js` | 0 | 37 / 0 | 0 | none | fixed (was 20,447) |
| `gate-engine.test.js` | 0 | 9 / 0 | 0 | none | fixed (was 5) |
| `gate-lifecycle.test.js` | 0 | 7 / 0 | 0 | none | fixed (was 9) |
| `tarball-fixture.test.js` | 0 | 10 / 0 | 0 | none | unchanged |
| `capability-oracle.test.js` | 1 | 25 / 6 | 4 | `.pi/agent/{auth.json,models-store.json}` | dev-host only (Assumption A2): `pi` and `codex` are on this host's PATH. The `.alpha-aos/mcp-cache/npm-cache` empty directories the research probe saw no longer appear |
| `preview.test.js` | 0 | 11 / 0 | 4 | `AppData/Local/Microsoft/PowerShell` | pwsh startup cache, not an alpha-AOS managed path |
| `redaction.test.js` | 1 | 20 / 1 | 0 | none | probe artifact: `path aliases are segment-aware across roots, separators and case` fails only because the probe's scratch home sits inside `%TEMP%`, so the `<temp>` alias wins over the home alias. It passes in the suite run below, whose home is outside `%TEMP%` |
| all 46 others | 0 | pass / 0 | 0 | none | unchanged |

No file writes under the home's `.alpha-aos` any more, and no additional
same-class writer appeared.

### Suite run on a scratch home

```bash
H=$(mktemp -d); WH=$(cygpath -w "$H")
env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME \
  -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR \
  HOME="$WH" USERPROFILE="$WH" ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1 \
  node scripts/run-tests.mjs --files $(ls dist/test/*.test.js | grep -v capability-oracle)
```

Result: `tests 888 / pass 879 / fail 0 / skipped 9` (311.0 s), exit 0, and no
`.alpha-aos` in the scratch home. The only home entries are
`AppData/Local/Microsoft/PowerShell` (the pwsh startup cache from
`preview.test.js`). On this host Git Bash `mktemp -d` resolves outside `%TEMP%`,
so the redaction alias test passes here.

`capability-oracle.test.js` alone on another `mktemp -d` scratch home:
`tests 31 / pass 25 / fail 6`, exit 1. The home held `.pi/agent/auth.json` and
`.pi/agent/models-store.json`, and no `.alpha-aos`. The six failures are the
ancestor-walk, ancestor-skill-root, codex evidence-unit, pi two-negatives,
materialized-pack discovery and codex representative-pack tests. They come from
this developer host's PATH (`pi` and `codex` are installed under
`%APPDATA%\npm`) under a redirected home (10-RESEARCH Finding 3, Pitfall 6). It
is excluded from the local gate for that reason only; the CI legs in 10-04 run
it.

### Product and workflow unchanged

`git diff --quiet c6415a2 -- src/ .github/workflows/ci.yml` exits 0: `src/` and
`.github/workflows/ci.yml` are byte-identical to c6415a2. The D-03 product audit
is not triggered. The status stays `diagnosed`; 10-04 sets `resolved` once the
three-OS proof run is green.

## Follow-ups (outside Phase 10)

- `writeGateReceipt(projectRoot, receipt)` has no `stateRoot` option, unlike every
  other writer (`options.stateRoot ?? userStateRoot()` in mcp.ts, owned-skills.ts,
  install.ts). Hardening candidate; not changed in Phase 10.
- `upstreamEnvironmentPolicy(server, source)` derives its write root from the
  ambient process environment instead of its `source` argument. Hardening
  candidate; not changed in Phase 10.
- `capability-oracle.test.ts` wrote `.alpha-aos/mcp-cache/npm-cache` directories
  and `.pi/agent/*` under a redirected dev-host home (Assumption A2). Open audit
  item; it is assumed not to occur on CI runners, where `codex`/`pi` are not on
  PATH.
- The exact per-entry bytes on the CI runner in run 35762417138 remain inferred
  from the local reproduction, the timing and the warm-cache corroboration
  (Assumption A4) until a future red windows leg prints the D-05 report.
- Suite-wide host-path guard in `scripts/run-tests.mjs` stays deferred (10-CONTEXT
  Deferred Ideas).
